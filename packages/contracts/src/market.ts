import { z } from 'zod';
import { Confianza, Score100 } from './shared.js';

/**
 * Primitivas de mercado, v2.0.
 * Las comparten F5 (ProfileRead), el Radar y el Comparador.
 *
 * Dos reglas de diseño que no son negociables acá:
 *
 * 1. NADA de esto se le pide al modelo como número suelto. El modelo elige un
 *    BUCKET de una lista con definición escrita y recién después afina el número
 *    dentro del rango de ese bucket. Un LLM al que le pedís "puntuá 0-100"
 *    devuelve 72 para todo el mundo; un LLM al que le hacés elegir entre seis
 *    etiquetas definidas se distribuye. El refine de acá abajo hace fallar el
 *    parse si el número no cae en el rango de su bucket.
 *
 * 2. Volumen, probabilidad de respuesta y gap NO los estima el modelo: los
 *    calcula `engines/market.ts` con aritmética sobre los componentes percibidos.
 *    Misma regla que `engines/behavior.ts` en F4 (CLAUDE.md §5). Un modelo que
 *    "estima 23% de respuesta" está inventando; una función determinística sobre
 *    entradas graduadas es consistente y se puede calibrar contra el feedback
 *    loop de resultados reales.
 */

/**
 * Buckets anclados a percentil del pool femenino de la plataforma en su ciudad.
 * NO es "qué tan linda es": es posición de mercado. Esa diferencia es la que
 * hace que el output sea defendible y calibrable contra datos reales después.
 */
export const Bucket = z.enum([
  'bajo', // p0-20
  'medio_bajo', // p20-40
  'medio', // p40-60
  'alto', // p60-80
  'muy_alto', // p80-95
  'top', // p95-100
]);
export type Bucket = z.infer<typeof Bucket>;

export const RANGO_BUCKET: Record<Bucket, readonly [number, number]> = {
  bajo: [0, 19],
  medio_bajo: [20, 39],
  medio: [40, 59],
  alto: [60, 79],
  muy_alto: [80, 94],
  top: [95, 100],
};

/**
 * Componente del índice. `ancla` es el mecanismo anti-regresión a la media:
 * obliga al modelo a describir qué vería un bucket arriba y uno abajo ANTES de
 * quedarse con el suyo. Sin eso la distribución se aplasta en "alto" y el
 * producto deja de discriminar, que es lo único que el usuario está pagando.
 */
export const ComponenteIndice = z
  .object({
    bucket: Bucket,
    score: Score100,
    evidencia: z.array(z.string().min(1)).min(1),
    /** Qué tendría que ver para subirlo un bucket, y qué para bajarlo. */
    ancla: z
      .object({
        un_bucket_arriba: z.string().min(1),
        un_bucket_abajo: z.string().min(1),
      })
      .strict(),
    confianza: Confianza,
  })
  .strict()
  .superRefine((val, ctx) => {
    const [min, max] = RANGO_BUCKET[val.bucket];
    if (val.score < min || val.score > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['score'],
        message: `score ${val.score} fuera del rango de bucket ${val.bucket} (${min}-${max})`,
      });
    }
  });
export type ComponenteIndice = z.infer<typeof ComponenteIndice>;

/**
 * Índice de atractivo, desglosado a propósito en lo que ella NO controla y lo
 * que sí. Esa separación es lo que vuelve el número accionable en vez de
 * decorativo: le dice al usuario si está compitiendo contra genética o contra
 * una sesión de fotos.
 *
 * - `facial`: rasgos. No controlable.
 * - `presentacion`: peso, entrenamiento, arreglo, estilo, edad aparente. Semi.
 * - `produccion`: calidad fotográfica, locaciones, señales de lifestyle. Total.
 *
 * Cada componente es nullable: si no hay foto de cuerpo entero, `presentacion`
 * vuelve null. No se rellena con un promedio. Una estimación inventada acá
 * envenena el gap, el volumen y el veredicto río abajo.
 *
 * `global` lo calcula el motor en código (facial .50 / presentacion .30 /
 * produccion .20, renormalizando sobre los componentes no nulos). El modelo
 * nunca lo devuelve.
 */
export const IndiceAtractivo = z
  .object({
    facial: ComponenteIndice.nullable(),
    presentacion: ComponenteIndice.nullable(),
    produccion: ComponenteIndice.nullable(),
    global: Score100,
    bucket_global: Bucket,
    /** Ancho de la banda de confianza en puntos. Pocas fotos = banda ancha. */
    margen: z.number().int().min(0).max(50),
    fotos_evaluadas: z.number().int().positive(),
    /** Baja si faltan ángulos, hay filtros pesados, o todas las fotos son iguales. */
    limitantes: z.array(z.string().min(1)),
  })
  .strict();
export type IndiceAtractivo = z.infer<typeof IndiceAtractivo>;

/**
 * Selectividad: cuánto puede darse el lujo de filtrar. Se lee de señales
 * declaradas y de curaduría, no del atractivo solo. Una mujer de bucket medio
 * con bio llena de requisitos filtra más que una de bucket alto sin bio.
 */
export const Selectividad = z
  .object({
    nivel: z.enum(['baja', 'media', 'alta', 'muy_alta']),
    /** Filtros explícitos escritos por ella: altura, intención, verificación, etc. */
    filtros_declarados: z.array(z.string().min(1)),
    evidencia: z.array(z.string().min(1)).min(1),
    confianza: Confianza,
  })
  .strict();
export type Selectividad = z.infer<typeof Selectividad>;

/** Volumen de matches entrantes estimado. Derivado en código, no pedido al modelo. */
export const VolumenMatches = z
  .object({
    nivel: z.enum(['bajo', 'medio', 'alto', 'muy_alto']),
    /** Qué lo empuja: bucket global, verificación, plataforma, densidad urbana. */
    drivers: z.array(z.string().min(1)).min(1),
    implicancia: z.string().min(1),
  })
  .strict();
export type VolumenMatches = z.infer<typeof VolumenMatches>;

/**
 * Probabilidad de respuesta a un mensaje decente (no genérico, no copiado).
 * Siempre RELATIVA a la baseline del usuario. Un porcentaje absoluto sería
 * mentira con cara de dato: no tenemos su tasa real de respuesta hasta que F6
 * la mida.
 */
export const ProbabilidadRespuesta = z
  .object({
    nivel: z.enum(['muy_baja', 'baja', 'media', 'alta']),
    /** Multiplicador contra su baseline personal. 1.0 = su promedio. */
    vs_baseline: z.number().min(0).max(5),
    /** Qué la mueve hacia arriba en este caso puntual. */
    palancas: z.array(z.string().min(1)),
    confianza: Confianza,
  })
  .strict();
export type ProbabilidadRespuesta = z.infer<typeof ProbabilidadRespuesta>;

/**
 * Gap de atractivo relativo. Requiere que el usuario tenga su propia auditoría
 * con índice; si no la tiene, el campo entero vuelve null y la UI ofrece
 * hacerla. Esa es la conversión más limpia que tiene el producto.
 *
 * `delta` = indice_ella.global - indice_usuario.global.
 */
export const GapAtractivo = z
  .object({
    delta: z.number().int().min(-100).max(100),
    tier: z.enum([
      'el_arriba', // delta <= -10
      'paridad', // -10 < delta < 10
      'ella_un_tier', // 10 <= delta < 25
      'ella_dos_tiers', // delta >= 25
    ]),
    lectura: z.string().min(1),
    /** Qué estrategia habilita este gap. Es lo que gatea el tono de los openers. */
    estrategia_implicada: z.string().min(1),
  })
  .strict();
export type GapAtractivo = z.infer<typeof GapAtractivo>;

/**
 * Autenticidad del perfil. En LATAM esto le hace perder más tiempo al usuario
 * que cualquier gap: bots, revendedoras de contenido, agencias y cuentas
 * muertas son una fracción enorme del pool. Se juzgan artefactos del perfil
 * (marcas de agua, handles, patrones de sesión), nunca a la persona.
 */
export const Autenticidad = z
  .object({
    veredicto: z.enum(['genuino', 'dudoso', 'probable_no_genuino']),
    /** null salvo que veredicto != genuino. */
    tipo_sospecha: z
      .enum(['bot', 'vendedora_contenido', 'catfish', 'agencia', 'inactiva'])
      .nullable(),
    señales: z.array(z.string().min(1)),
    confianza: Confianza,
  })
  .strict();
export type Autenticidad = z.infer<typeof Autenticidad>;

/**
 * Tono del opener. `sexual_indirecto` es el techo: insinuación y tensión, no
 * explicitud. No es pudor, es tasa de conversión - un mensaje explícito de un
 * hombre por debajo del tier de ella es la forma más rápida que existe de
 * comerse un unmatch, y el motor lo tiene que saber.
 */
export const TonoOpener = z.enum([
  'contexto', // engancha con algo concreto que ella mostró
  'humor',
  'directo', // declara interés sin adornos
  'desafiante', // push-pull, la hace calificar
  'sexual_indirecto', // insinuación con doble lectura
]);
export type TonoOpener = z.infer<typeof TonoOpener>;

/**
 * Opener con costo declarado. `riesgo` no es una advertencia moral: es la
 * probabilidad de unmatch inmediato. `licencia` obliga al motor a citar QUÉ del
 * perfil de ella habilita ese tono. Sin licencia visible el tono baja solo.
 */
export const Opener = z
  .object({
    tono: TonoOpener,
    texto: z.string().min(1),
    /** Qué mostró ella que habilita este tono. Vacío = el motor bajó el tono. */
    licencia: z.string().min(1),
    riesgo: z.enum(['bajo', 'medio', 'alto']),
    por_que_funciona: z.string().min(1),
  })
  .strict();
export type Opener = z.infer<typeof Opener>;

/** Veredicto de inversión. Es la única línea que el usuario va a leer siempre. */
export const VeredictoInversion = z.enum([
  'perseguir', // vale esfuerzo dedicado y mensajes pensados
  'volumen_bajo_esfuerzo', // mandá algo bueno y seguí swipeando, no te ancles
  'oportunista', // el gap es malo pero hay una grieta concreta
  'no_vale', // perfil no genuino, muerto, o filtro explícito que no cumple
]);
export type VeredictoInversion = z.infer<typeof VeredictoInversion>;

export const Inversion = z
  .object({
    veredicto: VeredictoInversion,
    /** Una línea, sin anestesia. Es lo que se lee en la card. */
    resumen: z.string().min(1),
    evidencia: z.array(z.string().min(1)).min(1),
    /** Esfuerzo recomendado en mensajes antes de soltar. 0 = ni lo abras. */
    mensajes_antes_de_soltar: z.number().int().min(0).max(20),
    confianza: Confianza,
  })
  .strict();
export type Inversion = z.infer<typeof Inversion>;

/**
 * Rechazo duro del análisis. La ruta responde 422 con esto y NUNCA devuelve
 * scores. `menor_aparente` no es negociable ni configurable: manejamos fotos de
 * personas reales y un índice de atractivo sobre un menor es un problema legal,
 * no una discusión de tono. El motor corre este filtro antes de puntuar nada.
 */
export const MotivoRechazo = z.enum([
  'menor_aparente',
  'sin_persona_identificable',
  'imagen_ilegible',
  'no_es_un_perfil',
]);
export type MotivoRechazo = z.infer<typeof MotivoRechazo>;

export const AnalisisRechazado = z
  .object({
    version: z.literal('2.0'),
    rechazado: z.literal(true),
    motivo: MotivoRechazo,
    detalle: z.string().min(1),
  })
  .strict();
export type AnalisisRechazado = z.infer<typeof AnalisisRechazado>;

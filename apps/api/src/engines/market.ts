import { RANGO_BUCKET, type Bucket, type ComponenteIndice, type IndiceAtractivo } from '@percentil/contracts';

/**
 * Derivados de mercado. Todo lo de acá se calcula EN CÓDIGO, nunca se le pide al
 * modelo (CLAUDE.md §5, misma regla que `behavior.ts` en F4).
 *
 * Por qué importa: un modelo al que le pedís "el global es 63" devuelve un número
 * que no se puede auditar ni recalibrar. Una función determinística sobre
 * componentes graduados sí: cuando F6 mida resultados reales, se ajustan los
 * pesos de acá y todo el producto se recalibra sin tocar un solo prompt.
 *
 * El modelo aporta los componentes percibidos (`facial`, `presentacion`,
 * `produccion`), que es lo que solo se puede sacar mirando las fotos.
 */

/**
 * Pesos del índice global.
 *
 * `facial` domina porque es lo que domina el swipe, y decir otra cosa sería
 * mentirle al usuario. Pero el desglose existe justamente para que el número no
 * termine ahí: `presentacion` y `produccion` suman la mitad del peso combinado y
 * son las dos que él puede mover.
 *
 * Los pesos difieren por sujeto: en perfiles masculinos la presentación y las
 * señales de producción pesan más que en femeninos, porque del lado masculino
 * son lo que más separa un perfil malo de uno bueno a igual cara.
 */
export const PESOS = {
  usuario: { facial: 0.45, presentacion: 0.33, produccion: 0.22 },
  objetivo: { facial: 0.5, presentacion: 0.3, produccion: 0.2 },
} as const;

export type Sujeto = keyof typeof PESOS;

/** El bucket al que pertenece un score, según los rangos del contrato. */
export function bucketDe(score: number): Bucket {
  const entradas = Object.entries(RANGO_BUCKET) as Array<[Bucket, readonly [number, number]]>;
  for (const [bucket, [min, max]] of entradas) {
    if (score >= min && score <= max) return bucket;
  }
  // Score fuera de 0-100 no debería llegar acá (Score100 lo valida antes).
  return score < 0 ? 'bajo' : 'top';
}

export type Componentes = Pick<IndiceAtractivo, 'facial' | 'presentacion' | 'produccion'>;

/**
 * Global ponderado sobre los componentes NO nulos, renormalizando los pesos.
 *
 * Renormalizar y no rellenar con un promedio es deliberado: si no hay foto de
 * cuerpo entero, `presentacion` es null y lo honesto es repartir su peso entre
 * lo que sí se vio. Inventar un valor promedio contamina el global, y el global
 * alimenta el gap, el volumen y el veredicto de inversión río abajo.
 */
export function calcularGlobal(componentes: Componentes, sujeto: Sujeto = 'usuario'): number {
  const pesos = PESOS[sujeto];
  let suma = 0;
  let peso = 0;
  for (const clave of ['facial', 'presentacion', 'produccion'] as const) {
    const comp = componentes[clave];
    // `!= null` y no `!== null`: si el modelo omite la clave en vez de mandarla
    // en null, tratarla como ausente es lo correcto y no como un objeto.
    if (comp == null) continue;
    suma += comp.score * pesos[clave];
    peso += pesos[clave];
  }
  if (peso === 0) {
    throw new Error('No se puede calcular el índice sin ningún componente');
  }
  return Math.round(suma / peso);
}

/**
 * Ancho de la banda de confianza, en puntos.
 *
 * Crece con lo que NO se pudo ver: pocas fotos, componentes faltantes, baja
 * confianza del modelo y limitantes declaradas. Un margen honesto es lo que
 * separa "tu índice es 58" de "tu índice es 58 ± 14, subí una foto de cuerpo
 * entero y te lo afinamos". Lo segundo es cierto y además convierte.
 */
export function calcularMargen(
  componentes: Componentes,
  fotosEvaluadas: number,
  limitantes: string[],
): number {
  const presentes = [componentes.facial, componentes.presentacion, componentes.produccion].filter(
    (c): c is ComponenteIndice => c != null,
  );

  let margen = 6; // piso: ningún juicio de este tipo es exacto
  margen += (3 - presentes.length) * 5; // cada componente que falta ensancha
  if (fotosEvaluadas <= 2) margen += 8;
  else if (fotosEvaluadas <= 4) margen += 4;

  // Confianza baja del modelo también ensancha: 1.0 no suma nada, 0.5 suma 5.
  const confianzaMedia =
    presentes.length > 0
      ? presentes.reduce((acc, c) => acc + c.confianza, 0) / presentes.length
      : 0;
  margen += Math.round((1 - confianzaMedia) * 10);

  margen += Math.min(limitantes.length, 3) * 2;

  return Math.min(50, Math.max(0, margen));
}

/** Arma el índice completo a partir de lo que devolvió el modelo. */
export function armarIndice(params: {
  componentes: Componentes;
  fotosEvaluadas: number;
  limitantes: string[];
  sujeto?: Sujeto;
}): IndiceAtractivo {
  const { componentes, fotosEvaluadas, limitantes } = params;
  const global = calcularGlobal(componentes, params.sujeto ?? 'usuario');
  return {
    ...componentes,
    global,
    bucket_global: bucketDe(global),
    margen: calcularMargen(componentes, fotosEvaluadas, limitantes),
    fotos_evaluadas: fotosEvaluadas,
    limitantes,
  };
}

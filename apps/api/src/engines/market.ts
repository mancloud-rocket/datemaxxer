import {
  RANGO_BUCKET,
  type Autenticidad,
  type Bucket,
  type ComponenteIndice,
  type GapAtractivo,
  type IndiceAtractivo,
  type Inversion,
  type ProbabilidadRespuesta,
  type Selectividad,
  type VeredictoInversion,
  type VolumenMatches,
} from '@percentil/contracts';

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

/* ========================================================================== */
/* Derivados de mercado                                                        */
/* ========================================================================== */

/**
 * Gap de atractivo. `delta` positivo = ella está por encima.
 *
 * Los cortes de tier son los del contrato y NO se tocan sin mover también los
 * tests: el tier es lo que gatea el tono de los openers en F5, así que correrlo
 * un punto cambia qué mensaje se le sugiere al usuario.
 *
 * Devuelve `null` si el usuario todavía no tiene índice propio. Ese null es
 * deliberado y la UI lo usa: es la conversión más limpia del producto
 * ("medite y te digo cuánto te separa de ella").
 */
export function calcularGap(
  globalUsuario: number | null,
  globalElla: number,
): GapAtractivo | null {
  if (globalUsuario === null) return null;
  const delta = Math.round(globalElla - globalUsuario);
  const tier: GapAtractivo['tier'] =
    delta <= -10 ? 'el_arriba' : delta < 10 ? 'paridad' : delta < 25 ? 'ella_un_tier' : 'ella_dos_tiers';

  const LECTURA: Record<GapAtractivo['tier'], { lectura: string; estrategia: string }> = {
    el_arriba: {
      lectura: `Estás ${Math.abs(delta)} puntos por encima. Acá el cuello de botella no es ella: es cuántos mensajes mandas.`,
      estrategia:
        'Puedes ser directo y puedes filtrar. El riesgo real es quedarte anclado a una sola conversación teniendo margen para varias.',
    },
    paridad: {
      lectura:
        delta === 0
          ? 'Están en el mismo escalón. Esto se decide por lo que escribas.'
          : `Los separan ${Math.abs(delta)} puntos: prácticamente el mismo escalón. Esto se decide por lo que escribas.`,
      estrategia:
        'Un mensaje con gancho concreto de su perfil te alcanza. No hace falta hacerse el interesante ni sobreexplicar.',
    },
    ella_un_tier: {
      lectura: `Ella está ${delta} puntos arriba. Tienes chance, pero no con un mensaje genérico.`,
      estrategia:
        'Necesitas un gancho específico de su perfil y un tono que no ruegue. El mensaje de "hola, qué tal" acá muere en el segundo tres.',
    },
    ella_dos_tiers: {
      lectura: `Ella está ${delta} puntos arriba. Es un escalón completo de diferencia y conviene que lo sepas antes de invertir.`,
      estrategia:
        'Mensaje bueno, uno solo, y seguir swipeando. Anclarte acá es el error que más tiempo te va a costar. Si quieres cerrar la brecha, se cierra con fotos y presentación, no con mensajes.',
    },
  };

  return { delta, tier, ...{ lectura: LECTURA[tier].lectura, estrategia_implicada: LECTURA[tier].estrategia } };
}

export type Plataforma = 'tinder' | 'bumble' | 'hinge' | 'otra';

const NIVELES_VOLUMEN = ['bajo', 'medio', 'alto', 'muy_alto'] as const;

/** Piso de volumen por bucket. Monótono: más bucket nunca da menos volumen. */
const VOLUMEN_BASE: Record<Bucket, number> = {
  bajo: 0,
  medio_bajo: 0,
  medio: 1,
  alto: 2,
  muy_alto: 3,
  top: 3,
};

/**
 * Volumen de matches entrantes que recibe ELLA.
 *
 * No es un dato que tengamos: es una estimación por escalón, y su valor no está
 * en el número sino en la implicancia. Que a ella le entren cien matches por
 * semana es la explicación de por qué su latencia es alta y por qué un mensaje
 * genérico no se lee. Eso es lo que el usuario necesita entender.
 */
export function calcularVolumenMatches(params: {
  bucket: Bucket;
  plataforma: Plataforma;
  verificada: boolean;
}): VolumenMatches {
  const { bucket, plataforma, verificada } = params;
  const drivers: string[] = [`está en el escalón ${bucket.replace('_', ' ')} del pool`];

  let nivel = VOLUMEN_BASE[bucket];

  // Tinder mueve más volumen crudo por el modelo de swipe abierto; Hinge filtra
  // más de entrada. No cambia quién es ella, cambia cuánto le entra.
  if (plataforma === 'tinder') {
    nivel += 1;
    drivers.push('Tinder empuja más volumen que las apps de match curado');
  } else if (plataforma === 'hinge') {
    nivel -= 1;
    drivers.push('Hinge filtra más de entrada, le entra menos y más dirigido');
  }

  if (verificada) {
    nivel += 1;
    drivers.push('perfil verificado: la app lo muestra más y le da más confianza');
  }

  const idx = Math.min(NIVELES_VOLUMEN.length - 1, Math.max(0, nivel));
  const nivelFinal = NIVELES_VOLUMEN[idx]!;

  const IMPLICANCIA: Record<(typeof NIVELES_VOLUMEN)[number], string> = {
    bajo: 'Le entra poco. Un mensaje decente se lee de verdad, y la latencia larga acá significa desinterés y no saturación.',
    medio: 'Le entra un flujo normal. Vas a competir, pero un mensaje con gancho concreto sale del montón.',
    alto: 'Le entran más mensajes de los que puede contestar. Que no responda no dice nada sobre vos; que responda tarde, tampoco.',
    muy_alto:
      'Le entra mucho más de lo que puede procesar. Filtra por descarte, no por elección, y cualquier mensaje que se parezca a los demás no llega a leerse.',
  };

  return { nivel: nivelFinal, drivers, implicancia: IMPLICANCIA[nivelFinal] };
}

/** Qué tan bueno es el mensaje con el que va a escribir. */
export type CalidadOpener = 'generico' | 'decente' | 'con_gancho';

const FACTOR_TIER: Record<GapAtractivo['tier'], number> = {
  el_arriba: 1.6,
  paridad: 1.0,
  ella_un_tier: 0.55,
  ella_dos_tiers: 0.25,
};

const FACTOR_SELECTIVIDAD: Record<Selectividad['nivel'], number> = {
  baja: 1.25,
  media: 1.0,
  alta: 0.7,
  muy_alta: 0.45,
};

const FACTOR_OPENER: Record<CalidadOpener, number> = {
  generico: 0.6,
  decente: 1.0,
  con_gancho: 1.5,
};

/**
 * Probabilidad de respuesta, SIEMPRE relativa a su propia baseline.
 *
 * Un porcentaje absoluto sería mentira con cara de dato: no conocemos su tasa
 * real de respuesta hasta que exista F6. `vs_baseline` de 0.55 significa "acá te
 * va a ir alrededor de la mitad de bien que en tu promedio", que es una frase
 * que se puede sostener y que además se vuelve verificable el día que midamos.
 *
 * Los factores son multiplicativos a propósito: un gap malo con un mensaje
 * genérico se hunde el doble, que es lo que efectivamente pasa.
 */
export function calcularProbabilidadRespuesta(params: {
  gap: GapAtractivo | null;
  selectividad: Selectividad['nivel'];
  calidadOpener: CalidadOpener;
}): ProbabilidadRespuesta {
  const { gap, selectividad, calidadOpener } = params;

  const factorTier = gap === null ? 1 : FACTOR_TIER[gap.tier];
  const crudo = factorTier * FACTOR_SELECTIVIDAD[selectividad] * FACTOR_OPENER[calidadOpener];
  const vs_baseline = Math.min(5, Math.max(0, Math.round(crudo * 100) / 100));

  const nivel: ProbabilidadRespuesta['nivel'] =
    vs_baseline < 0.4 ? 'muy_baja' : vs_baseline < 0.9 ? 'baja' : vs_baseline < 1.5 ? 'media' : 'alta';

  const palancas: string[] = [];
  if (calidadOpener !== 'con_gancho') {
    palancas.push('Un gancho concreto de su perfil, en vez de un saludo, es lo que más mueve este número.');
  }
  if (gap !== null && (gap.tier === 'ella_un_tier' || gap.tier === 'ella_dos_tiers')) {
    palancas.push('Cerrar puntos de tu lado (fotos, presentación) sube esto para todos los perfiles, no solo para este.');
  }
  if (selectividad === 'alta' || selectividad === 'muy_alta') {
    palancas.push('Filtra duro: si tienes algo que cumpla uno de sus filtros declarados, ponelo adelante.');
  }
  if (gap === null) {
    palancas.push('Mide tu perfil y esta estimación se afina: hoy no sabemos desde dónde partís.');
  }

  // Sin índice propio no hay gap, y sin gap esto es una estimación a medias.
  // Decirlo con la confianza y no con una nota al pie.
  const confianza = gap === null ? 0.4 : 0.7;

  return { nivel, vs_baseline, palancas, confianza };
}

/** Orden de menos a más esfuerzo recomendado. Sirve para subir o bajar un escalón. */
const ESCALA_INVERSION: VeredictoInversion[] = [
  'no_vale',
  'volumen_bajo_esfuerzo',
  'oportunista',
  'perseguir',
];

/**
 * Veredicto de inversión. Es la única línea que el usuario va a leer siempre, y
 * por eso mismo no puede salir del modelo: tiene que ser consistente entre dos
 * perfiles parecidos, y un LLM no garantiza eso.
 *
 * La autenticidad manda sobre todo lo demás. Un perfil de bucket top que es una
 * cuenta de venta de contenido vale cero, y decir "perseguir" ahí sería el peor
 * consejo que puede dar el producto.
 */
export function calcularInversion(params: {
  gap: GapAtractivo | null;
  autenticidad: Autenticidad;
  selectividad: Selectividad;
  tieneGanchos: boolean;
}): Inversion {
  const { gap, autenticidad, selectividad, tieneGanchos } = params;
  const evidencia: string[] = [];

  // 1. Autenticidad primero: si el perfil no es real, nada más importa.
  if (autenticidad.veredicto === 'probable_no_genuino') {
    return {
      veredicto: 'no_vale',
      resumen: `Esto no parece un perfil real${autenticidad.tipo_sospecha ? ` (${autenticidad.tipo_sospecha.replace('_', ' ')})` : ''}. No gastes un mensaje.`,
      evidencia: autenticidad.señales.length > 0 ? autenticidad.señales : ['el perfil no pasa el chequeo de autenticidad'],
      mensajes_antes_de_soltar: 0,
      confianza: autenticidad.confianza,
    };
  }

  // 2. Base por gap.
  let idx: number;
  if (gap === null) {
    idx = ESCALA_INVERSION.indexOf('oportunista');
    evidencia.push('todavía no mediste tu perfil, así que esto es una estimación sin tu escalón');
  } else {
    idx = ESCALA_INVERSION.indexOf(
      gap.tier === 'el_arriba' || gap.tier === 'paridad'
        ? 'perseguir'
        : gap.tier === 'ella_un_tier'
          ? 'oportunista'
          : 'volumen_bajo_esfuerzo',
    );
    evidencia.push(gap.lectura);
  }

  // 3. Ajustes. Un perfil dudoso baja un escalón aunque el gap sea bueno.
  if (autenticidad.veredicto === 'dudoso') {
    idx -= 1;
    evidencia.push(`hay señales de que el perfil puede no ser genuino: ${autenticidad.señales[0] ?? 'curaduría atípica'}`);
  }
  if (selectividad.nivel === 'muy_alta') {
    idx -= 1;
    evidencia.push(`filtra muy duro: ${selectividad.filtros_declarados[0] ?? selectividad.evidencia[0]}`);
  }
  if (tieneGanchos) {
    idx += 1;
    evidencia.push('hay al menos un gancho concreto en su perfil para abrir sin sonar genérico');
  }

  const veredicto = ESCALA_INVERSION[Math.min(ESCALA_INVERSION.length - 1, Math.max(0, idx))]!;

  const RESUMEN: Record<VeredictoInversion, string> = {
    perseguir: 'Vale el esfuerzo. Mandá algo pensado y sostené la conversación.',
    oportunista: 'No es tu escalón, pero hay una grieta concreta. Un mensaje bueno y sin ansiedad.',
    volumen_bajo_esfuerzo: 'Mandá algo decente y seguí swipeando. Anclarte acá es tiempo perdido.',
    no_vale: 'Salteala. Lo que ves acá no se destraba con un mensaje mejor.',
  };
  const MENSAJES: Record<VeredictoInversion, number> = {
    perseguir: 6,
    oportunista: 3,
    volumen_bajo_esfuerzo: 1,
    no_vale: 0,
  };

  return {
    veredicto,
    resumen: RESUMEN[veredicto],
    evidencia,
    mensajes_antes_de_soltar: MENSAJES[veredicto],
    confianza: gap === null ? 0.5 : 0.75,
  };
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

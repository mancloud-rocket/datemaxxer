import { describe, expect, it } from 'vitest';
import {
  GapAtractivo,
  IndiceAtractivo,
  ProbabilidadRespuesta,
  RANGO_BUCKET,
  VolumenMatches,
  type Bucket,
  type ComponenteIndice,
  type Selectividad,
} from '@percentil/contracts';
import {
  armarIndice,
  bucketDe,
  calcularGap,
  calcularGlobal,
  calcularMargen,
  calcularProbabilidadRespuesta,
  calcularVolumenMatches,
  PESOS,
  type CalidadOpener,
  type Plataforma,
} from './market.js';

const comp = (score: number, confianza = 0.8): ComponenteIndice => ({
  bucket: bucketDe(score),
  score,
  evidencia: ['una señal'],
  ancla: { un_bucket_arriba: 'x', un_bucket_abajo: 'y' },
  confianza,
});

describe('bucketDe', () => {
  it('mapea cada borde de rango a su bucket', () => {
    for (const [bucket, [min, max]] of Object.entries(RANGO_BUCKET) as Array<
      [Bucket, readonly [number, number]]
    >) {
      expect(bucketDe(min)).toBe(bucket);
      expect(bucketDe(max)).toBe(bucket);
    }
  });

  it('cubre los extremos', () => {
    expect(bucketDe(0)).toBe('bajo');
    expect(bucketDe(100)).toBe('top');
  });
});

describe('calcularGlobal', () => {
  it('pondera los tres componentes', () => {
    const global = calcularGlobal(
      { facial: comp(60), presentacion: comp(40), produccion: comp(80) },
      'usuario',
    );
    // 60*.45 + 40*.33 + 80*.22 = 27 + 13.2 + 17.6 = 57.8 → 58
    expect(global).toBe(58);
  });

  it('renormaliza cuando falta un componente, no lo rellena con un promedio', () => {
    // Sin presentacion: 70*.45 + 30*.22 sobre peso .67 = (31.5+6.6)/.67 = 56.9 → 57
    const global = calcularGlobal({ facial: comp(70), presentacion: null, produccion: comp(30) });
    expect(global).toBe(57);

    // Si rellenara con el promedio de los otros dos (50) daría otra cosa.
    const conRelleno = calcularGlobal({
      facial: comp(70),
      presentacion: comp(50),
      produccion: comp(30),
    });
    expect(global).not.toBe(conRelleno);
  });

  it('con un solo componente devuelve ese componente', () => {
    expect(calcularGlobal({ facial: comp(73), presentacion: null, produccion: null })).toBe(73);
  });

  it('pesa distinto al usuario que al objetivo', () => {
    const componentes = { facial: comp(40), presentacion: comp(80), produccion: comp(80) };
    const comoUsuario = calcularGlobal(componentes, 'usuario');
    const comoObjetivo = calcularGlobal(componentes, 'objetivo');
    // La cara es la que baja: con menos peso facial, el usuario puntúa más alto.
    expect(comoUsuario).toBeGreaterThan(comoObjetivo);
  });

  it('los pesos de cada sujeto suman 1', () => {
    for (const pesos of Object.values(PESOS)) {
      const suma = pesos.facial + pesos.presentacion + pesos.produccion;
      expect(suma).toBeCloseTo(1, 5);
    }
  });

  it('sin ningún componente tira error en vez de inventar un número', () => {
    expect(() =>
      calcularGlobal({ facial: null, presentacion: null, produccion: null }),
    ).toThrow(/sin ningún componente/);
  });
});

describe('calcularMargen', () => {
  const completos = { facial: comp(60), presentacion: comp(60), produccion: comp(60) };

  it('es chico con muchas fotos, los tres componentes y alta confianza', () => {
    const margen = calcularMargen(
      {
        facial: comp(60, 1),
        presentacion: comp(60, 1),
        produccion: comp(60, 1),
      },
      8,
      [],
    );
    expect(margen).toBe(6);
  });

  it('se ensancha cuando faltan componentes', () => {
    const conTodos = calcularMargen(completos, 8, []);
    const sinUno = calcularMargen({ ...completos, presentacion: null }, 8, []);
    expect(sinUno).toBeGreaterThan(conTodos);
  });

  it('se ensancha con pocas fotos', () => {
    expect(calcularMargen(completos, 2, [])).toBeGreaterThan(calcularMargen(completos, 8, []));
  });

  it('se ensancha cuando el modelo dice tener poca confianza', () => {
    const seguro = calcularMargen({ ...completos, facial: comp(60, 0.95) }, 8, []);
    const inseguro = calcularMargen({ ...completos, facial: comp(60, 0.4) }, 8, []);
    expect(inseguro).toBeGreaterThan(seguro);
  });

  it('se ensancha con limitantes declaradas', () => {
    expect(calcularMargen(completos, 8, ['filtro pesado', 'una sola pose'])).toBeGreaterThan(
      calcularMargen(completos, 8, []),
    );
  });

  it('nunca se pasa del techo del contrato', () => {
    const margen = calcularMargen(
      { facial: comp(60, 0), presentacion: null, produccion: null },
      1,
      ['a', 'b', 'c', 'd', 'e'],
    );
    expect(margen).toBeLessThanOrEqual(50);
  });
});

describe('armarIndice', () => {
  it('produce un índice que pasa el contrato', () => {
    const indice = armarIndice({
      componentes: { facial: comp(72), presentacion: comp(55), produccion: comp(41) },
      fotosEvaluadas: 6,
      limitantes: [],
    });
    expect(() => IndiceAtractivo.parse(indice)).not.toThrow();
  });

  it('el bucket_global siempre concuerda con el global', () => {
    for (const score of [5, 25, 45, 65, 85, 97]) {
      const indice = armarIndice({
        componentes: { facial: comp(score), presentacion: null, produccion: null },
        fotosEvaluadas: 4,
        limitantes: [],
      });
      const [min, max] = RANGO_BUCKET[indice.bucket_global];
      expect(indice.global).toBeGreaterThanOrEqual(min);
      expect(indice.global).toBeLessThanOrEqual(max);
    }
  });

  it('un componente nulo llega nulo al índice, no rellenado', () => {
    const indice = armarIndice({
      componentes: { facial: comp(60), presentacion: null, produccion: comp(60) },
      fotosEvaluadas: 5,
      limitantes: ['sin foto de cuerpo entero'],
    });
    expect(indice.presentacion).toBeNull();
    expect(indice.limitantes).toEqual(['sin foto de cuerpo entero']);
  });
});

describe('calcularGap', () => {
  it('sin índice propio devuelve null (y eso es la conversión, no un error)', () => {
    expect(calcularGap(null, 70)).toBeNull();
  });

  it('el delta es ella menos el usuario', () => {
    expect(calcularGap(50, 70)!.delta).toBe(20);
    expect(calcularGap(70, 50)!.delta).toBe(-20);
    expect(calcularGap(60, 60)!.delta).toBe(0);
  });

  it('los cortes de tier son exactamente los del contrato', () => {
    // Correr uno de estos bordes cambia qué opener se le sugiere al usuario.
    const tier = (usuario: number, ella: number) => calcularGap(usuario, ella)!.tier;
    expect(tier(60, 50)).toBe('el_arriba'); // delta -10
    expect(tier(60, 51)).toBe('paridad'); // delta -9
    expect(tier(60, 69)).toBe('paridad'); // delta 9
    expect(tier(60, 70)).toBe('ella_un_tier'); // delta 10
    expect(tier(60, 84)).toBe('ella_un_tier'); // delta 24
    expect(tier(60, 85)).toBe('ella_dos_tiers'); // delta 25
  });

  it('el tier nunca mejora cuando el gap empeora', () => {
    const orden = ['el_arriba', 'paridad', 'ella_un_tier', 'ella_dos_tiers'];
    let previo = -1;
    for (let ella = 0; ella <= 100; ella++) {
      const idx = orden.indexOf(calcularGap(50, ella)!.tier);
      expect(idx).toBeGreaterThanOrEqual(previo);
      previo = idx;
    }
  });

  it('cada tier sale con lectura y estrategia, y pasa el contrato', () => {
    for (const [usuario, ella] of [[60, 40], [60, 60], [60, 75], [40, 90]] as const) {
      const gap = calcularGap(usuario, ella)!;
      expect(() => GapAtractivo.parse(gap)).not.toThrow();
      expect(gap.estrategia_implicada.length).toBeGreaterThan(20);
    }
  });

  it('en paridad exacta no dice que los separan 0 puntos', () => {
    expect(calcularGap(60, 60)!.lectura).not.toContain('0 puntos');
  });
});

describe('calcularVolumenMatches', () => {
  const ORDEN = ['bajo', 'medio', 'alto', 'muy_alto'];
  const BUCKETS: Bucket[] = ['bajo', 'medio_bajo', 'medio', 'alto', 'muy_alto', 'top'];
  const base = { plataforma: 'bumble' as Plataforma, verificada: false };

  it('nunca baja al subir de bucket (monotonía)', () => {
    let previo = -1;
    for (const bucket of BUCKETS) {
      const idx = ORDEN.indexOf(calcularVolumenMatches({ ...base, bucket }).nivel);
      expect(idx).toBeGreaterThanOrEqual(previo);
      previo = idx;
    }
  });

  it('estar verificada nunca baja el volumen', () => {
    for (const bucket of BUCKETS) {
      const sin = ORDEN.indexOf(calcularVolumenMatches({ ...base, bucket }).nivel);
      const con = ORDEN.indexOf(calcularVolumenMatches({ ...base, bucket, verificada: true }).nivel);
      expect(con).toBeGreaterThanOrEqual(sin);
    }
  });

  it('Tinder mueve más volumen que Hinge a igual perfil', () => {
    const t = calcularVolumenMatches({ bucket: 'medio', plataforma: 'tinder', verificada: false });
    const h = calcularVolumenMatches({ bucket: 'medio', plataforma: 'hinge', verificada: false });
    expect(ORDEN.indexOf(t.nivel)).toBeGreaterThan(ORDEN.indexOf(h.nivel));
  });

  it('siempre trae al menos un driver y pasa el contrato, en toda combinación', () => {
    const plataformas: Plataforma[] = ['tinder', 'bumble', 'hinge', 'otra'];
    for (const bucket of BUCKETS) {
      for (const plataforma of plataformas) {
        for (const verificada of [true, false]) {
          const v = calcularVolumenMatches({ bucket, plataforma, verificada });
          expect(() => VolumenMatches.parse(v)).not.toThrow();
          expect(v.drivers.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('la implicancia explica qué hacer con el dato, no solo el dato', () => {
    const alto = calcularVolumenMatches({ bucket: 'top', plataforma: 'tinder', verificada: true });
    expect(alto.nivel).toBe('muy_alto');
    expect(alto.implicancia.length).toBeGreaterThan(40);
  });
});

describe('calcularProbabilidadRespuesta', () => {
  const gapDe = (usuario: number, ella: number) => calcularGap(usuario, ella)!;
  const SELECTIVIDADES: Selectividad['nivel'][] = ['baja', 'media', 'alta', 'muy_alta'];
  const OPENERS: CalidadOpener[] = ['generico', 'decente', 'con_gancho'];

  it('empeora cuando el gap empeora, con todo lo demás igual', () => {
    const fijo = { selectividad: 'media' as const, calidadOpener: 'decente' as const };
    const arriba = calcularProbabilidadRespuesta({ ...fijo, gap: gapDe(70, 50) });
    const paridad = calcularProbabilidadRespuesta({ ...fijo, gap: gapDe(60, 60) });
    const unTier = calcularProbabilidadRespuesta({ ...fijo, gap: gapDe(60, 75) });
    const dosTiers = calcularProbabilidadRespuesta({ ...fijo, gap: gapDe(40, 90) });

    expect(arriba.vs_baseline).toBeGreaterThan(paridad.vs_baseline);
    expect(paridad.vs_baseline).toBeGreaterThan(unTier.vs_baseline);
    expect(unTier.vs_baseline).toBeGreaterThan(dosTiers.vs_baseline);
  });

  it('empeora cuando ella filtra más, con todo lo demás igual', () => {
    let previo = Infinity;
    for (const selectividad of SELECTIVIDADES) {
      const p = calcularProbabilidadRespuesta({
        gap: gapDe(60, 60),
        selectividad,
        calidadOpener: 'decente',
      });
      expect(p.vs_baseline).toBeLessThan(previo);
      previo = p.vs_baseline;
    }
  });

  it('mejora con un mensaje con gancho, con todo lo demás igual', () => {
    const fijo = { gap: gapDe(60, 60), selectividad: 'media' as const };
    const generico = calcularProbabilidadRespuesta({ ...fijo, calidadOpener: 'generico' });
    const conGancho = calcularProbabilidadRespuesta({ ...fijo, calidadOpener: 'con_gancho' });
    expect(conGancho.vs_baseline).toBeGreaterThan(generico.vs_baseline);
  });

  it('gap malo Y mensaje genérico se hunde más que cualquiera de los dos solo', () => {
    // Los factores son multiplicativos a propósito: es lo que pasa de verdad.
    const soloGap = calcularProbabilidadRespuesta({
      gap: gapDe(40, 90), selectividad: 'media', calidadOpener: 'decente',
    });
    const soloOpener = calcularProbabilidadRespuesta({
      gap: gapDe(60, 60), selectividad: 'media', calidadOpener: 'generico',
    });
    const ambos = calcularProbabilidadRespuesta({
      gap: gapDe(40, 90), selectividad: 'media', calidadOpener: 'generico',
    });
    expect(ambos.vs_baseline).toBeLessThan(soloGap.vs_baseline);
    expect(ambos.vs_baseline).toBeLessThan(soloOpener.vs_baseline);
  });

  it('sin gap baja la confianza y ofrece medirse, en vez de fingir precisión', () => {
    const sinGap = calcularProbabilidadRespuesta({
      gap: null, selectividad: 'media', calidadOpener: 'decente',
    });
    const conGap = calcularProbabilidadRespuesta({
      gap: gapDe(60, 60), selectividad: 'media', calidadOpener: 'decente',
    });
    expect(sinGap.confianza).toBeLessThan(conGap.confianza);
    expect(sinGap.palancas.join(' ')).toMatch(/Mide tu perfil/);
  });

  it('nunca se sale del rango del contrato, en ninguna combinación', () => {
    const gaps = [null, gapDe(70, 40), gapDe(60, 60), gapDe(40, 95)];
    for (const gap of gaps) {
      for (const selectividad of SELECTIVIDADES) {
        for (const calidadOpener of OPENERS) {
          const p = calcularProbabilidadRespuesta({ gap, selectividad, calidadOpener });
          expect(() => ProbabilidadRespuesta.parse(p)).not.toThrow();
          expect(p.vs_baseline).toBeGreaterThanOrEqual(0);
          expect(p.vs_baseline).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('el nivel siempre concuerda con el multiplicador', () => {
    const CORTES: Array<[number, ProbabilidadRespuesta['nivel']]> = [
      [0.4, 'baja'],
      [0.9, 'media'],
      [1.5, 'alta'],
    ];
    const gaps = [null, gapDe(70, 40), gapDe(60, 60), gapDe(40, 95)];
    for (const gap of gaps) {
      for (const selectividad of SELECTIVIDADES) {
        for (const calidadOpener of OPENERS) {
          const p = calcularProbabilidadRespuesta({ gap, selectividad, calidadOpener });
          const esperado = CORTES.reduce<ProbabilidadRespuesta['nivel']>(
            (acc, [corte, nivel]) => (p.vs_baseline >= corte ? nivel : acc),
            'muy_baja',
          );
          expect(p.nivel).toBe(esperado);
        }
      }
    }
  });
});

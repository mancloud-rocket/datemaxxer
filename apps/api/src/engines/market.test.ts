import { describe, expect, it } from 'vitest';
import { IndiceAtractivo, RANGO_BUCKET, type Bucket, type ComponenteIndice } from '@percentil/contracts';
import { armarIndice, bucketDe, calcularGlobal, calcularMargen, PESOS } from './market.js';

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

import { describe, expect, it } from 'vitest';
import { Comportamiento } from '@percentil/contracts';
import {
  calcularComportamiento,
  latenciasDeElla,
  preguntasDeElla,
  profundidad,
  ratioEsfuerzo,
  reiniciaElla,
  tendencia,
  type MensajeParseado,
} from './behavior.js';

/** Helper: arma mensajes con horas relativas en minutos desde un t0 fijo. */
const T0 = Date.parse('2026-08-02T10:00:00Z');
const m = (de: 'yo' | 'ella', texto: string, minuto: number | null): MensajeParseado => ({
  de,
  texto,
  ts: minuto === null ? null : new Date(T0 + minuto * 60_000).toISOString(),
});

describe('latenciasDeElla', () => {
  it('mide el tiempo entre el mensaje de él y la respuesta de ella', () => {
    const chat = [m('yo', 'hola', 0), m('ella', 'hola', 30), m('yo', 'qué hacés', 40), m('ella', 'nada', 100)];
    expect(latenciasDeElla(chat)).toEqual([30, 60]);
  });

  it('ignora los mensajes sin hora en vez de romper', () => {
    // Es el caso normal: las apps solo marcan la hora cada tanto.
    const chat = [m('yo', 'a', 0), m('ella', 'b', null), m('yo', 'c', 10), m('ella', 'd', 25)];
    expect(latenciasDeElla(chat)).toEqual([15]);
  });

  it('no cuenta dos mensajes seguidos de ella como latencia', () => {
    const chat = [m('yo', 'a', 0), m('ella', 'b', 5), m('ella', 'c', 6)];
    expect(latenciasDeElla(chat)).toEqual([5]);
  });

  it('sin datos devuelve vacío, no cero', () => {
    expect(latenciasDeElla([])).toEqual([]);
  });
});

describe('tendencia', () => {
  it('con pocas latencias no arriesga: estable', () => {
    // Marcar una tendencia con dos datos produciría un veredicto sobre ruido.
    expect(tendencia([10, 100])).toBe('estable');
  });

  it('detecta que se está agrandando', () => {
    expect(tendencia([10, 12, 60, 80])).toBe('creciente');
  });

  it('detecta que se está achicando', () => {
    expect(tendencia([80, 60, 12, 10])).toBe('decreciente');
  });

  it('una variación chica no es tendencia', () => {
    // Chats reales son ruidosos: alguien duerme, alguien trabaja.
    expect(tendencia([30, 32, 35, 33])).toBe('estable');
  });
});

describe('ratioEsfuerzo', () => {
  it('1 cuando escriben parejo', () => {
    const chat = [m('yo', 'hola como estas', 0), m('ella', 'hola como estas', 1)];
    expect(ratioEsfuerzo(chat)).toBe(1);
  });

  it('baja cuando ella escribe mucho menos', () => {
    const chat = [m('yo', 'a'.repeat(100), 0), m('ella', 'ok', 1)];
    expect(ratioEsfuerzo(chat)).toBeLessThan(0.1);
  });

  it('sin mensajes de un lado devuelve 0 en vez de dividir por cero', () => {
    expect(ratioEsfuerzo([m('yo', 'hola', 0)])).toBe(0);
    expect(ratioEsfuerzo([])).toBe(0);
  });
});

describe('preguntasDeElla', () => {
  it('cuenta solo sus últimos 10', () => {
    const viejos = Array.from({ length: 12 }, (_, i) => m('ella', `pregunta ${i}?`, i));
    const nuevos = Array.from({ length: 10 }, (_, i) => m('ella', 'ok', 20 + i));
    expect(preguntasDeElla([...viejos, ...nuevos])).toBe(0);
  });

  it('no cuenta las de él', () => {
    expect(preguntasDeElla([m('yo', 'todo bien?', 0), m('ella', 'si', 1)])).toBe(0);
  });
});

describe('reiniciaElla', () => {
  it('es true si volvió a escribir después de un silencio largo', () => {
    const chat = [m('yo', 'hola', 0), m('ella', 'hey', 60 * 20)];
    expect(reiniciaElla(chat)).toBe(true);
  });

  it('es false si el que reengancha es él', () => {
    const chat = [m('ella', 'hola', 0), m('yo', 'hey', 60 * 20)];
    expect(reiniciaElla(chat)).toBe(false);
  });

  it('una pausa corta no cuenta como reinicio', () => {
    const chat = [m('yo', 'hola', 0), m('ella', 'hey', 90)];
    expect(reiniciaElla(chat)).toBe(false);
  });
});

describe('profundidad', () => {
  it('pregunta cuando pregunta seguido', () => {
    const chat = [m('ella', 'y vos que hacés?', 0), m('ella', 'ok', 1), m('ella', 'de dónde sos?', 2)];
    expect(profundidad(chat)).toBe('pregunta');
  });

  it('comparte cuando escribe largo sin preguntar', () => {
    const chat = [m('ella', 'a'.repeat(120), 0), m('ella', 'b'.repeat(120), 1)];
    expect(profundidad(chat)).toBe('comparte');
  });

  it('responde_solo cuando despacha', () => {
    const chat = [m('ella', 'ok', 0), m('ella', 'jaja', 1), m('ella', 'si', 2)];
    expect(profundidad(chat)).toBe('responde_solo');
  });

  it('sin mensajes de ella, responde_solo', () => {
    expect(profundidad([m('yo', 'hola', 0)])).toBe('responde_solo');
  });
});

describe('calcularComportamiento', () => {
  it('produce un bloque que pasa el contrato', () => {
    const chat = [
      m('yo', 'hola, cómo va', 0),
      m('ella', 'todo bien y vos?', 15),
      m('yo', 'bien, laburando', 20),
      m('ella', 'ah mirá', 90),
      m('yo', 'y vos qué hacés', 95),
      m('ella', 'nada', 300),
    ];
    const c = calcularComportamiento(chat);
    expect(() => Comportamiento.parse(c)).not.toThrow();
    expect(c.latencia_promedio_min).toBeGreaterThan(0);
  });

  it('una conversación vacía no rompe ni inventa números', () => {
    const c = calcularComportamiento([]);
    expect(() => Comportamiento.parse(c)).not.toThrow();
    expect(c.latencia_promedio_min).toBe(0);
    expect(c.ratio_esfuerzo).toBe(0);
    expect(c.latencia_tendencia).toBe('estable');
  });

  it('un chat sin una sola hora sigue dando ratio y preguntas', () => {
    // Las capturas suelen no traer horas: el resto de las señales tiene que
    // seguir sirviendo igual.
    const chat = [m('yo', 'hola que tal', null), m('ella', 'bien, y vos?', null)];
    const c = calcularComportamiento(chat);
    expect(c.latencia_promedio_min).toBe(0);
    expect(c.ratio_esfuerzo).toBeGreaterThan(0);
    expect(c.preguntas_ella_ultimos_10).toBe(1);
  });
});

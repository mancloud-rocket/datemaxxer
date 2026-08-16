import type { Comportamiento } from '@percentil/contracts';

/**
 * F4 - cálculo de comportamiento. TODO en aritmética, nada de esto se le pide al
 * modelo (CLAUDE.md §5).
 *
 * Por qué importa acá más que en ningún otro motor: el veredicto de F4 se apoya
 * en frases como "su latencia se triplicó en cuatro días y no hizo una pregunta
 * en doce mensajes". Un modelo que *estima* eso está inventando, y el usuario va
 * a tomar decisiones sobre una persona real con ese dato. Los números salen de
 * acá; el modelo solo los interpreta.
 */

export interface MensajeParseado {
  de: 'yo' | 'ella';
  texto: string;
  /**
   * Timestamp estimado en ISO. `null` cuando la captura no mostraba hora, que es
   * lo normal en el medio de una conversación: las apps solo marcan la hora cada
   * tanto. Los mensajes sin hora no rompen el cálculo, se saltean.
   */
  ts: string | null;
}

/** Silencio a partir del cual se considera que la conversación se murió y alguien la reengancha. */
const SILENCIO_MIN = 12 * 60;

function minutosEntre(a: string, b: string): number | null {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  const min = (t2 - t1) / 60_000;
  return min >= 0 ? min : null;
}

/** Latencias de ella: cuánto tarda en contestar después de un mensaje de él. */
export function latenciasDeElla(mensajes: MensajeParseado[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < mensajes.length; i++) {
    const previo = mensajes[i - 1]!;
    const actual = mensajes[i]!;
    if (previo.de !== 'yo' || actual.de !== 'ella') continue;
    if (previo.ts === null || actual.ts === null) continue;
    const min = minutosEntre(previo.ts, actual.ts);
    if (min !== null) out.push(min);
  }
  return out;
}

const promedio = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Tendencia comparando la primera mitad contra la segunda.
 *
 * El umbral es 40% y no 10% a propósito: las latencias de chat son ruidosas
 * (alguien duerme, alguien trabaja) y marcar "creciente" por una diferencia
 * chica produciría un veredicto de "dejá morir" sobre nada.
 */
export function tendencia(latencias: number[]): Comportamiento['latencia_tendencia'] {
  if (latencias.length < 4) return 'estable';
  const corte = Math.floor(latencias.length / 2);
  const primera = promedio(latencias.slice(0, corte));
  const segunda = promedio(latencias.slice(corte));
  if (primera === 0) return segunda === 0 ? 'estable' : 'creciente';
  const cambio = (segunda - primera) / primera;
  if (cambio > 0.4) return 'creciente';
  if (cambio < -0.4) return 'decreciente';
  return 'estable';
}

/**
 * Ratio de esfuerzo: caracteres por mensaje de ella sobre los de él.
 * 1.0 = escriben parejo. 0.4 = ella escribe menos de la mitad.
 */
export function ratioEsfuerzo(mensajes: MensajeParseado[]): number {
  const suyos = mensajes.filter((m) => m.de === 'ella');
  const mios = mensajes.filter((m) => m.de === 'yo');
  if (suyos.length === 0 || mios.length === 0) return 0;
  const cprElla = promedio(suyos.map((m) => m.texto.length));
  const cprYo = promedio(mios.map((m) => m.texto.length));
  if (cprYo === 0) return 0;
  return Math.round((cprElla / cprYo) * 100) / 100;
}

/** Preguntas de ella en sus últimos 10 mensajes. Es la señal más barata de interés. */
export function preguntasDeElla(mensajes: MensajeParseado[]): number {
  return mensajes
    .filter((m) => m.de === 'ella')
    .slice(-10)
    .filter((m) => m.texto.includes('?')).length;
}

/** Después de un silencio largo, ¿quién volvió a escribir? */
export function reiniciaElla(mensajes: MensajeParseado[]): boolean {
  for (let i = 1; i < mensajes.length; i++) {
    const previo = mensajes[i - 1]!;
    const actual = mensajes[i]!;
    if (previo.ts === null || actual.ts === null) continue;
    const min = minutosEntre(previo.ts, actual.ts);
    if (min !== null && min >= SILENCIO_MIN && actual.de === 'ella') return true;
  }
  return false;
}

/**
 * Profundidad: pregunta > comparte > responde_solo.
 *
 * `comparte` se aproxima por longitud: un mensaje largo sin pregunta es alguien
 * contando algo, y uno corto es alguien despachando. Es tosco a propósito -
 * cualquier cosa más fina la tendría que estimar el modelo, y entonces dejaría
 * de ser un número auditable.
 */
export function profundidad(mensajes: MensajeParseado[]): Comportamiento['profundidad'] {
  const suyos = mensajes.filter((m) => m.de === 'ella');
  if (suyos.length === 0) return 'responde_solo';
  const conPregunta = suyos.filter((m) => m.texto.includes('?')).length;
  if (conPregunta / suyos.length >= 0.2) return 'pregunta';
  const largos = suyos.filter((m) => m.texto.length >= 80).length;
  if (largos / suyos.length >= 0.25) return 'comparte';
  return 'responde_solo';
}

/** Todo el bloque `comportamiento` del contrato, calculado. */
export function calcularComportamiento(mensajes: MensajeParseado[]): Comportamiento {
  const latencias = latenciasDeElla(mensajes);
  return {
    // Sin muestras no hay promedio. Devolver 0 acá decía "contesta al toque".
    latencia_promedio_min: latencias.length === 0 ? null : Math.round(promedio(latencias)),
    latencia_tendencia: tendencia(latencias),
    ratio_esfuerzo: ratioEsfuerzo(mensajes),
    preguntas_ella_ultimos_10: preguntasDeElla(mensajes),
    reinicia_ella: reiniciaElla(mensajes),
    profundidad: profundidad(mensajes),
  };
}

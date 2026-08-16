import { describe, expect, it } from 'vitest';
import { buildChatEngine, sanearTimestamps } from './chat.js';
import type { ClaudeClient } from './audit.js';
import type { MensajeParseado } from './behavior.js';

type QueuedResponse = { content: Array<{ type: string; text?: string }>; stop_reason: string | null };

function jsonMessage(obj: unknown): QueuedResponse {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' };
}

function makeClient(queue: QueuedResponse[]) {
  const calls: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        calls.push(params);
        const next = queue.shift();
        if (!next) throw new Error('mock sin respuestas');
        return next;
      },
    },
  };
  return { client, calls };
}

const ANALISIS_OK = {
  registro_detectado: { formalidad: 'baja', mayusculas: false, emojis: 'pocos', humor: 'seco' },
  sugerencias: [
    { estrategia: 'proponer_salida', texto: '¿Un café el jueves?', por_que: 'la conversación ya dio lo que tenía' },
  ],
  veredicto: {
    decision: 'proponer_salida_ahora',
    confianza: 0.7,
    evidencia: ['su latencia se estiró'],
    revisar_en_dias: 4,
  },
};

/** Texto del turno del paso 2, que es donde viaja la conversación. */
function textoPaso2(calls: Array<Record<string, unknown>>): string {
  const mensajes = calls[1]!.messages as Array<{ content: Array<{ text: string }> }>;
  return mensajes[0]!.content[0]!.text;
}

function mensaje(de: 'yo' | 'ella', texto: string, ts: string | null): MensajeParseado {
  return { de, texto, ts };
}

describe('sanearTimestamps', () => {
  const ahora = () => Date.parse('2026-08-03T12:00:00.000Z');

  it('deja pasar una conversación con horas coherentes', () => {
    const out = sanearTimestamps(
      [
        mensaje('yo', 'hola', '2026-08-01T10:00:00.000Z'),
        mensaje('ella', 'hola!', '2026-08-01T10:20:00.000Z'),
      ],
      ahora,
    );
    expect(out.map((m) => m.ts)).toEqual([
      '2026-08-01T10:00:00.000Z',
      '2026-08-01T10:20:00.000Z',
    ]);
  });

  it('anula una hora que va para atrás', () => {
    // Los mensajes vienen en orden, así que el tiempo no puede retroceder: si
    // retrocede, el modelo la estimó mal. Anularla cuesta una muestra de
    // latencia; creerle produce una latencia falsa en el veredicto.
    const out = sanearTimestamps(
      [
        mensaje('yo', 'hola', '2026-08-01T10:00:00.000Z'),
        mensaje('ella', 'hola!', '2026-08-01T09:00:00.000Z'),
        mensaje('yo', 'todo bien?', '2026-08-01T10:30:00.000Z'),
      ],
      ahora,
    );
    expect(out[1]!.ts).toBeNull();
    // El resto sobrevive: el saneo descarta el dato malo, no la conversación.
    expect(out[2]!.ts).toBe('2026-08-01T10:30:00.000Z');
  });

  it('anula una hora en el futuro', () => {
    const out = sanearTimestamps([mensaje('ella', 'hola', '2027-01-01T00:00:00.000Z')], ahora);
    expect(out[0]!.ts).toBeNull();
  });

  it('anula una hora que no se puede parsear', () => {
    const out = sanearTimestamps([mensaje('ella', 'hola', 'ayer a la tarde')], ahora);
    expect(out[0]!.ts).toBeNull();
  });

  it('nunca inventa una hora donde no había', () => {
    const out = sanearTimestamps([mensaje('ella', 'hola', null)], ahora);
    expect(out[0]!.ts).toBeNull();
  });

  it('no deja que un ts malo arrastre a los que vienen después', () => {
    // El techo de comparación tiene que seguir siendo el último ts VÁLIDO. Si
    // se tomara el descartado, un solo error del modelo anularía toda la cola.
    const out = sanearTimestamps(
      [
        mensaje('yo', 'a', '2026-08-01T10:00:00.000Z'),
        mensaje('ella', 'b', '2030-01-01T00:00:00.000Z'),
        mensaje('yo', 'c', '2026-08-01T10:05:00.000Z'),
        mensaje('ella', 'd', '2026-08-01T10:40:00.000Z'),
      ],
      ahora,
    );
    expect(out.map((m) => m.ts !== null)).toEqual([true, false, true, true]);
  });
});

describe('motor de chat', () => {
  const base = { region: 'rioplatense' as const, pegado: 'yo: hola\nella: hola' };

  it('usa el modelo chico para extraer y el grande para el veredicto', async () => {
    const { client, calls } = makeClient([
      jsonMessage({ mensajes: [{ de: 'yo', texto: 'hola', ts: null }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    const engine = buildChatEngine({
      client,
      model: 'modelo-grande',
      modelExtraccion: 'modelo-chico',
    });
    await engine.run(base);
    expect(calls[0]!.model).toBe('modelo-chico');
    expect(calls[1]!.model).toBe('modelo-grande');
  });

  it('sin modelo de extracción configurado, los dos pasos usan el mismo', async () => {
    const { client, calls } = makeClient([
      jsonMessage({ mensajes: [{ de: 'yo', texto: 'hola', ts: null }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    await buildChatEngine({ client, model: 'uno-solo' }).run(base);
    expect(calls[0]!.model).toBe('uno-solo');
    expect(calls[1]!.model).toBe('uno-solo');
  });

  it('al modelo le manda solo la cola de la conversación', async () => {
    // Es lo que evita que el costo por turno crezca con la conversación.
    const previos: MensajeParseado[] = Array.from({ length: 120 }, (_, i) =>
      mensaje(i % 2 === 0 ? 'yo' : 'ella', `mensaje viejo ${i}`, null),
    );
    const { client, calls } = makeClient([
      jsonMessage({ mensajes: [{ de: 'yo', texto: 'mensaje nuevo', ts: null }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    const salida = await buildChatEngine({ client }).run({ ...base, previos });

    const texto = textoPaso2(calls);
    expect(texto).toContain('Últimos 40 de 121 mensajes');
    expect(texto).toContain('mensaje nuevo');
    expect(texto).not.toContain('mensaje viejo 0');
    // Pero el acumulado que se guarda sigue completo: el recorte es solo para
    // el modelo, la próxima vuelta necesita toda la historia.
    expect(salida.mensajes).toHaveLength(121);
  });

  it('con pocos mensajes manda todo y lo dice como corresponde', async () => {
    const { client, calls } = makeClient([
      jsonMessage({ mensajes: [{ de: 'yo', texto: 'hola', ts: null }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    await buildChatEngine({ client }).run(base);
    expect(textoPaso2(calls)).toContain('Conversación completa (1 mensajes)');
  });

  it('los números salen de la conversación entera, no de la cola', async () => {
    // El recorte no puede tocar el cálculo: si la latencia se midiera solo
    // sobre los últimos 40, el veredicto cambiaría según cuánto se recortó.
    const previos: MensajeParseado[] = [
      mensaje('yo', 'arranque', '2026-08-01T10:00:00.000Z'),
      mensaje('ella', 'respuesta lenta', '2026-08-01T14:00:00.000Z'),
      ...Array.from({ length: 60 }, (_, i) => mensaje(i % 2 === 0 ? 'yo' : 'ella', `relleno ${i}`, null)),
    ];
    const { client, calls } = makeClient([
      jsonMessage({ mensajes: [{ de: 'yo', texto: 'ultimo', ts: null }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    const salida = await buildChatEngine({ client }).run({ ...base, previos });

    // Las 4 horas de latencia están fuera de la ventana de 40 y aun así cuentan.
    expect(salida.analisis.comportamiento.latencia_promedio_min).toBe(240);
    expect(textoPaso2(calls)).not.toContain('respuesta lenta');
  });

  it('un ts inventado por el modelo no llega al cálculo', async () => {
    // El caso que hace seguro usar un modelo chico en la extracción.
    const previos: MensajeParseado[] = [mensaje('yo', 'hola', '2026-08-01T10:00:00.000Z')];
    const { client } = makeClient([
      jsonMessage({ mensajes: [{ de: 'ella', texto: 'hola!', ts: '1999-01-01T00:00:00.000Z' }] }),
      jsonMessage(ANALISIS_OK),
    ]);
    const salida = await buildChatEngine({ client }).run({ ...base, previos });

    expect(salida.mensajes[1]!.ts).toBeNull();
    // Sin muestras válidas no hay latencia inventada: queda sin dato.
    expect(salida.analisis.comportamiento.latencia_promedio_min).toBeNull();
  });
});

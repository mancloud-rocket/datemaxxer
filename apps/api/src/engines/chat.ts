import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ChatTurnAnalysis,
  RegistroDetectado,
  Sugerencia,
  Veredicto,
  type Region,
} from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';
import { calcularComportamiento, type MensajeParseado } from './behavior.js';
import type { ClaudeClient } from './audit.js';
import type { ProfilePhoto } from './profileread.js';

/**
 * Motor F4 - Copiloto de chat.
 *
 * Dos pasos: extracción (visión, solo si llegan capturas) e interpretación.
 *
 * El reparto es la clave de toda la función: **los números los calcula
 * `behavior.ts` y el modelo los recibe hechos**. El veredicto se apoya en frases
 * como "su latencia se triplicó en cuatro días"; si ese número lo estimara el
 * modelo, el usuario estaría tomando decisiones sobre una persona real en base a
 * algo inventado.
 */

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'prompts', 'chat');

const SCHEMA_EXTRACCION = JSON.parse(readFileSync(join(promptsDir, 'schema-extraccion.json'), 'utf8')) as Record<string, unknown>;
const SCHEMA_ANALISIS = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;

const BLOCKLIST = readFileSync(join(promptsDir, '..', 'shared', 'blocklist.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

export const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') +
  `\n## Blocklist anti-slop (contenido vigente, prohibido usar)\n\n` +
  BLOCKLIST.map((l) => `- ${l}`).join('\n') +
  '\n';

const Extraccion = z
  .object({
    mensajes: z
      .array(
        z
          .object({
            de: z.enum(['yo', 'ella']),
            texto: z.string().min(1),
            ts: z.string().nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** Lo que devuelve el paso 2: todo menos `comportamiento`, que lo pone el código. */
const Paso2 = z
  .object({
    registro_detectado: RegistroDetectado,
    sugerencias: z.array(Sugerencia).min(1).max(3),
    veredicto: Veredicto,
  })
  .strict();

export interface ChatInput {
  /** Capturas del chat. Vacío si el usuario pegó el texto. */
  capturas?: ProfilePhoto[];
  /** Mensajes ya parseados de snapshots anteriores, para tener historia. */
  previos?: MensajeParseado[];
  /** Texto pegado, alternativa a las capturas. */
  pegado?: string;
  region: Region;
  /** Cómo la etiquetó el usuario, para que las sugerencias suenen naturales. */
  etiqueta?: string;
}

export interface ChatOutcome {
  analisis: ChatTurnAnalysis;
  /** Los mensajes acumulados, para guardar y usar en el próximo turno. */
  mensajes: MensajeParseado[];
}

const MAX_TOKENS = 6000;

/**
 * Cuántos mensajes ve el modelo en el paso 2.
 *
 * El cálculo (`behavior.ts`) SIEMPRE recibe la conversación entera: las
 * latencias y la tendencia no significan nada sin la historia completa. Lo que
 * se recorta es solo lo que se le manda al modelo, que ya recibe los números
 * hechos y solo necesita los últimos mensajes para el tono.
 *
 * Sin este recorte el paso 2 reenviaba la conversación entera en cada turno, y
 * como cada turno arrastra todo lo anterior el costo crecía al cuadrado: a 400
 * mensajes eran ~20.000 tokens de entrada por turno, y sin techo.
 */
const VENTANA_MENSAJES = 40;

/** Un ts que no se puede parsear no sirve para calcular nada. */
function fechaValida(ts: string): number | null {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Descarta timestamps imposibles antes de que lleguen al cálculo.
 *
 * Las apps de citas marcan la hora cada tanto, no en cada mensaje, así que el
 * modelo estima. Estimar de menos es gratis: un `ts` en `null` hace que
 * `latenciasDeElla` saltee el mensaje y a lo sumo se pierde una muestra.
 * Estimar mal NO es gratis: una hora inventada produce una latencia falsa, y
 * sobre esa latencia el usuario decide qué hacer con una persona real.
 *
 * Por eso acá se anula todo lo que no puede ser cierto: lo que no parsea, lo
 * que quedó en el futuro y lo que retrocede respecto del último mensaje válido
 * (los mensajes vienen en orden, así que el tiempo no puede ir para atrás).
 *
 * Corre para cualquier modelo. Es lo que hace que se pueda usar uno más chico
 * en la extracción sin que un error suyo termine en el veredicto.
 */
export function sanearTimestamps(
  mensajes: MensajeParseado[],
  ahora: () => number = Date.now,
): MensajeParseado[] {
  const techo = ahora();
  let ultimo: number | null = null;
  return mensajes.map((m) => {
    if (m.ts === null) return m;
    const ms = fechaValida(m.ts);
    if (ms === null || ms > techo || (ultimo !== null && ms < ultimo)) {
      return { ...m, ts: null };
    }
    ultimo = ms;
    return m;
  });
}

export interface ChatEngineOptions {
  client: ClaudeClient;
  /** Modelo del paso 2 (interpretación). Es el que emite el veredicto. */
  model?: string;
  /**
   * Modelo del paso 1 (extracción). Va aparte y a uno más chico a propósito:
   * transcribir y separar quién dijo qué es trabajo mecánico, la forma del JSON
   * la garantiza `output_config.format` y los números no los toca el modelo.
   */
  modelExtraccion?: string;
}

export function buildChatEngine(options: ChatEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';
  const modelExtraccion = options.modelExtraccion ?? model;

  async function callJson(params: {
    paso: string;
    modelo: string;
    schema: Record<string, unknown>;
    contenido: unknown[];
  }): Promise<unknown> {
    const message = await client.messages.create({
      model: params.modelo,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: params.schema } },
      messages: [{ role: 'user', content: params.contenido }],
    });
    if (message.stop_reason === 'refusal') throw new EngineError(`El modelo rechazó la request en ${params.paso}`);
    if (message.stop_reason === 'max_tokens') throw new EngineError(`Salida truncada en ${params.paso}`);
    const texto = message.content.find((b) => b.type === 'text')?.text;
    if (texto === undefined || texto === '') throw new EngineError(`Respuesta sin texto en ${params.paso}`);
    try {
      return JSON.parse(texto) as unknown;
    } catch {
      throw new EngineError(`La salida de ${params.paso} no es JSON parseable`);
    }
  }

  async function run(input: ChatInput): Promise<ChatOutcome> {
    const tieneCapturas = (input.capturas?.length ?? 0) > 0;
    const tienePegado = (input.pegado ?? '').trim() !== '';
    if (!tieneCapturas && !tienePegado) {
      throw new ValidationError('Hace falta al menos una captura o el texto del chat');
    }

    // PASO 1: extracción. Se corre igual con texto pegado, porque hay que
    // separar quién dijo qué y eso tampoco es trivial en un pegado crudo.
    const contenido: unknown[] = [];
    if (tieneCapturas) {
      for (const c of input.capturas!) {
        contenido.push({ type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.data } });
      }
    }
    if (tienePegado) {
      contenido.push({ type: 'text', text: `Chat pegado:\n${input.pegado}` });
    }
    contenido.push({
      type: 'text',
      text: 'PASO 1. Extraé los mensajes en orden según el system prompt. No inventes horas.',
    });

    const extraccionRaw = await callJson({
      paso: 'paso 1 (extracción)',
      modelo: modelExtraccion,
      schema: SCHEMA_EXTRACCION,
      contenido,
    });
    const extraccion = Extraccion.safeParse(extraccionRaw);
    if (!extraccion.success) {
      throw new EngineError(
        `No pudimos leer los mensajes: ${extraccion.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    // La historia importa: la latencia solo significa algo contra lo anterior.
    const mensajes: MensajeParseado[] = sanearTimestamps([
      ...(input.previos ?? []),
      ...extraccion.data.mensajes,
    ]);

    // Los números, en código, sobre la conversación ENTERA.
    const comportamiento = calcularComportamiento(mensajes);

    // Al modelo solo le va la cola. Ver VENTANA_MENSAJES.
    const cola = mensajes.slice(-VENTANA_MENSAJES);
    const encabezadoCola =
      cola.length === mensajes.length
        ? `Conversación completa (${mensajes.length} mensajes)`
        : `Últimos ${cola.length} de ${mensajes.length} mensajes (los números de arriba ya salen de la conversación entera)`;

    // PASO 2: interpretación, con los números ya hechos.
    const analisisRaw = await callJson({
      paso: 'paso 2 (interpretación)',
      modelo: model,
      schema: SCHEMA_ANALISIS,
      contenido: [
        {
          type: 'text',
          text:
            `PASO 2. Interpretá según el system prompt.\n` +
            `Registro regional del usuario: ${input.region}\n` +
            `Cómo la etiquetó: ${input.etiqueta ?? '(sin etiqueta)'}\n` +
            `NÚMEROS YA CALCULADOS (no los recalcules ni los contradigas).\n` +
            `Un campo en null significa que no hay dato, NO que el valor sea cero:\n` +
            `${JSON.stringify(comportamiento, null, 2)}\n` +
            `${encabezadoCola}:\n` +
            `${JSON.stringify(cola)}`,
        },
      ],
    });
    const paso2 = Paso2.safeParse(analisisRaw);
    if (!paso2.success) {
      throw new EngineError(
        `Salida inválida en la interpretación: ${paso2.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    return {
      analisis: ChatTurnAnalysis.parse({ version: '1.0', comportamiento, ...paso2.data }),
      mensajes,
    };
  }

  return { run };
}

export type ChatEngine = ReturnType<typeof buildChatEngine>;

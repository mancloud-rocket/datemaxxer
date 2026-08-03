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

export interface ChatEngineOptions {
  client: ClaudeClient;
  model?: string;
}

export function buildChatEngine(options: ChatEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';

  async function callJson(params: {
    paso: string;
    schema: Record<string, unknown>;
    contenido: unknown[];
  }): Promise<unknown> {
    const message = await client.messages.create({
      model,
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

    const extraccionRaw = await callJson({ paso: 'paso 1 (extracción)', schema: SCHEMA_EXTRACCION, contenido });
    const extraccion = Extraccion.safeParse(extraccionRaw);
    if (!extraccion.success) {
      throw new EngineError(
        `No pudimos leer los mensajes: ${extraccion.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    // La historia importa: la latencia solo significa algo contra lo anterior.
    const mensajes: MensajeParseado[] = [...(input.previos ?? []), ...extraccion.data.mensajes];

    // Los números, en código.
    const comportamiento = calcularComportamiento(mensajes);

    // PASO 2: interpretación, con los números ya hechos.
    const analisisRaw = await callJson({
      paso: 'paso 2 (interpretación)',
      schema: SCHEMA_ANALISIS,
      contenido: [
        {
          type: 'text',
          text:
            `PASO 2. Interpretá según el system prompt.\n` +
            `Registro regional del usuario: ${input.region}\n` +
            `Cómo la etiquetó: ${input.etiqueta ?? '(sin etiqueta)'}\n` +
            `NÚMEROS YA CALCULADOS (no los recalcules ni los contradigas):\n` +
            `${JSON.stringify(comportamiento, null, 2)}\n` +
            `Conversación completa (${mensajes.length} mensajes):\n` +
            `${JSON.stringify(mensajes)}`,
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

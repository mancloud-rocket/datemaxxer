import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  Arquetipo,
  AuditResult,
  EvidenciaFoto,
  type Region,
} from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';

/**
 * Motor F1 - Auditoría de Arquetipos.
 * Chain según spec §7: PASO 1 analiza foto por foto (con visión),
 * PASO 2 sintetiza; la evidencia del paso 1 se mergea EN CÓDIGO al resultado.
 * Structured outputs de la API + validación Zod encima (con un retry de reparación).
 */

const promptsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'prompts', 'audit',
);

const SCHEMA_FOTOS = JSON.parse(readFileSync(join(promptsDir, 'schema-fotos.json'), 'utf8')) as Record<string, unknown>;
const SCHEMA_SINTESIS = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;

// El modelo no puede leer archivos: la blocklist se inyecta al system prompt acá.
const BLOCKLIST = readFileSync(
  join(promptsDir, '..', 'shared', 'blocklist.txt'),
  'utf8',
)
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') +
  `\n## Blocklist anti-slop (contenido vigente, prohibido usar)\n\n` +
  BLOCKLIST.map((l) => `- ${l}`).join('\n') +
  '\n';

const Paso1 = z.object({ evidencia_por_foto: z.array(EvidenciaFoto).min(1) }).strict();
const Paso2 = AuditResult.omit({ evidencia_por_foto: true });

export type AuditPhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface AuditPhoto {
  /** Imagen en base64, sin saltos de línea. */
  data: string;
  mediaType: AuditPhotoMediaType;
}

export interface AuditInput {
  photos: AuditPhoto[];
  bio: string;
  region: Region;
  arquetipoObjetivo?: Arquetipo | null;
}

/** Progreso para la UI del funnel (interfaz acordada con FRONT en el log). */
export interface AuditProgress {
  fotos_analizadas: number;
  total: number;
}

export interface AuditRunHooks {
  onProgress?: (progress: AuditProgress) => void;
}

/** Bloques de contenido mínimos que usamos del SDK (tipado estructural para poder mockear). */
type ContentBlock = { type: string; text?: string };

interface MinimalMessage {
  content: ContentBlock[];
  stop_reason: string | null;
}

/** Subconjunto del cliente de Anthropic que usa el motor (mockeable en tests). */
export interface ClaudeClient {
  messages: {
    create(params: Record<string, unknown>): Promise<MinimalMessage>;
  };
}

/**
 * Adapta una instancia real del SDK a ClaudeClient. El cast de params existe porque
 * el motor arma la request como objeto plano y los overloads del SDK no unifican
 * por tipado estructural; los campos enviados son los canónicos de la API.
 */
export function claudeClientFromSdk(sdk: {
  messages: { create: (params: never) => Promise<unknown> };
}): ClaudeClient {
  return {
    messages: {
      create: async (params) =>
        (await sdk.messages.create(params as never)) as MinimalMessage,
    },
  };
}

export interface AuditEngineOptions {
  client: ClaudeClient;
  /** Default: claude-opus-4-8 (visión de alta resolución + structured outputs). */
  model?: string;
}

const MAX_TOKENS = 16000;

function extractJsonText(message: MinimalMessage, paso: string): string {
  if (message.stop_reason === 'refusal') {
    throw new EngineError(`El modelo rechazó la request en ${paso}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new EngineError(`Salida truncada por max_tokens en ${paso}`);
  }
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (text === undefined || text === '') {
    throw new EngineError(`Respuesta sin bloque de texto en ${paso}`);
  }
  return text;
}

export function buildAuditEngine(options: AuditEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';

  async function callJson(params: {
    paso: string;
    schema: Record<string, unknown>;
    userContent: unknown[];
  }): Promise<unknown> {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: params.schema } },
      messages: [{ role: 'user', content: params.userContent }],
    });
    const text = extractJsonText(message, params.paso);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new EngineError(`La salida de ${params.paso} no es JSON parseable`);
    }
  }

  /** Valida contra Zod; si falla, UN retry pidiendo reparación con los errores concretos. */
  async function validateWithRepair<T>(
    schema: z.ZodType<T>,
    raw: unknown,
    ctx: { paso: string; jsonSchema: Record<string, unknown> },
  ): Promise<T> {
    const first = schema.safeParse(raw);
    if (first.success) return first.data;

    const errores = first.error.issues
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    const repaired = await callJson({
      paso: `${ctx.paso} (reparación)`,
      schema: ctx.jsonSchema,
      userContent: [
        {
          type: 'text',
          text:
            `El siguiente JSON no pasó la validación. Errores: ${errores}.\n` +
            `Devolvé el MISMO contenido corregido, solo JSON válido:\n${JSON.stringify(raw)}`,
        },
      ],
    });
    const second = schema.safeParse(repaired);
    if (!second.success) {
      throw new EngineError(`Salida inválida tras reparación en ${ctx.paso}: ${errores}`);
    }
    return second.data;
  }

  async function run(input: AuditInput, hooks?: AuditRunHooks): Promise<AuditResult> {
    if (input.photos.length < 4 || input.photos.length > 9) {
      throw new ValidationError(`Se esperan de 4 a 9 fotos, llegaron ${input.photos.length}`);
    }
    hooks?.onProgress?.({ fotos_analizadas: 0, total: input.photos.length });

    // PASO 1: análisis por foto (visión)
    const imageBlocks = input.photos.flatMap((photo, i) => [
      { type: 'text', text: `foto ${i + 1}:` },
      {
        type: 'image',
        source: { type: 'base64', media_type: photo.mediaType, data: photo.data },
      },
    ]);
    const paso1Raw = await callJson({
      paso: 'paso 1 (análisis por foto)',
      schema: SCHEMA_FOTOS,
      userContent: [
        ...imageBlocks,
        {
          type: 'text',
          text:
            `PASO 1. Analizá cada una de las ${input.photos.length} fotos según el system prompt. ` +
            `Registro regional: ${input.region}.`,
        },
      ],
    });
    const paso1 = await validateWithRepair(Paso1, paso1Raw, {
      paso: 'paso 1',
      jsonSchema: SCHEMA_FOTOS,
    });
    hooks?.onProgress?.({ fotos_analizadas: input.photos.length, total: input.photos.length });

    // PASO 2: síntesis (texto, sin re-mandar imágenes)
    const objetivo = input.arquetipoObjetivo ?? null;
    const paso2Raw = await callJson({
      paso: 'paso 2 (síntesis)',
      schema: SCHEMA_SINTESIS,
      userContent: [
        {
          type: 'text',
          text:
            `PASO 2. Sintetizá la auditoría según el system prompt.\n` +
            `Registro regional: ${input.region}\n` +
            `Arquetipo objetivo declarado: ${objetivo ?? 'ninguno (gap_analysis debe ser null)'}\n` +
            `Bio actual del usuario:\n${input.bio || '(sin bio)'}\n` +
            `Evidencia por foto (PASO 1):\n${JSON.stringify(paso1.evidencia_por_foto)}`,
        },
      ],
    });
    const paso2 = await validateWithRepair(Paso2, paso2Raw, {
      paso: 'paso 2',
      jsonSchema: SCHEMA_SINTESIS,
    });

    // Merge en código: la evidencia canónica es la del paso 1.
    return AuditResult.parse({ ...paso2, evidencia_por_foto: paso1.evidencia_por_foto });
  }

  return { run };
}

export type AuditEngine = ReturnType<typeof buildAuditEngine>;

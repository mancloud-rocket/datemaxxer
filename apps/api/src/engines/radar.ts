import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AnalisisRechazado,
  MotivoRechazo,
  Opener,
  RadarRead,
  RANGO_BUCKET,
  type Bucket,
} from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';
import { calcularGap, calcularProbabilidadRespuesta, type CalidadOpener } from './market.js';
import type { ClaudeClient } from './audit.js';
import type { ProfilePhoto } from './profileread.js';

/**
 * Motor del Radar - F5 comprimido para usar con el pulgar sobre el like.
 *
 * UNA sola llamada, sin cadena, sin síntesis. Presupuesto: menos de 5 segundos.
 * Todo lo que agregue tokens de salida agrega latencia, y a los 8 segundos el
 * usuario ya swipeó y el producto no sirvió para nada.
 *
 * Por eso el índice del radar no lleva desglose ni anclas: es más barato y es
 * más impreciso, y el contrato lo dice con `precision: 'rapida'` en vez de
 * fingir la calidad de F5. Esa fricción declarada es la conversión al análisis
 * completo.
 *
 * Va a un modelo chico a propósito (ver RADAR_MODEL): con el modelo grande por
 * swipe no cierra ninguna cuenta.
 */

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'prompts', 'radar');

const SCHEMA = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;

/** La MISMA calibración que F1 y F5: si las escalas derivan, el gap deja de significar algo. */
const CALIBRACION = readFileSync(join(promptsDir, '..', 'shared', 'calibracion-indice.md'), 'utf8');

export const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') + `\n---\n\n${CALIBRACION}\n`;

const IndiceCrudo = z
  .object({
    bucket: z.enum(['bajo', 'medio_bajo', 'medio', 'alto', 'muy_alto', 'top']),
    score: z.number().int().min(0).max(100),
    lectura: z.string().min(1),
    confianza: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    const [min, max] = RANGO_BUCKET[val.bucket as Bucket];
    if (val.score < min || val.score > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['score'],
        message: `score ${val.score} fuera del rango de bucket ${val.bucket} (${min}-${max})`,
      });
    }
  });

const Salida = z
  .object({
    rechazado: z.boolean(),
    motivo_rechazo: MotivoRechazo.nullable(),
    indice: IndiceCrudo.nullable(),
    selectividad: z.enum(['baja', 'media', 'alta', 'muy_alta']).nullable(),
    openers: z.array(Opener),
    alerta_autenticidad: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.rechazado) {
      if (val.motivo_rechazo === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'un rechazo tiene que traer motivo' });
      }
      return;
    }
    if (val.indice === null || val.selectividad === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sin rechazo hacen falta índice y selectividad' });
    }
    // El contrato del radar exige 3: más openers son más tokens y el radar deja
    // de ser radar.
    if (val.openers.length !== 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `se esperan 3 openers, llegaron ${val.openers.length}` });
    }
  });

export interface RadarInput {
  photos: ProfilePhoto[];
  /** Índice global del usuario (F1b). Sin esto no hay `gap_delta`. */
  globalUsuario?: number | null;
}

export type RadarOutcome =
  | { ok: true; result: RadarRead }
  | { ok: false; rechazo: AnalisisRechazado };

/** Salida chica a propósito: es el techo de latencia. */
const MAX_TOKENS = 1400;

export interface RadarEngineOptions {
  client: ClaudeClient;
  /** Modelo chico. Con el grande por swipe la economía no cierra. */
  model?: string;
  /** Inyectable para tests: medir tiempo sin depender del reloj real. */
  ahora?: () => number;
}

export function buildRadarEngine(options: RadarEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-haiku-4-5-20251001';
  const ahora = options.ahora ?? (() => Date.now());

  async function run(input: RadarInput): Promise<RadarOutcome> {
    if (input.photos.length < 1 || input.photos.length > 4) {
      // Tope bajo a propósito: más fotos son más tokens de entrada y más latencia.
      throw new ValidationError(`El radar acepta de 1 a 4 capturas, llegaron ${input.photos.length}`);
    }

    const arranque = ahora();
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            ...input.photos.flatMap((p) => [
              { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } },
            ]),
            { type: 'text', text: 'Radar. Una pasada, salida corta, según el system prompt.' },
          ],
        },
      ],
    });

    if (message.stop_reason === 'refusal') throw new EngineError('El modelo rechazó la request');
    if (message.stop_reason === 'max_tokens') throw new EngineError('Salida truncada por max_tokens');
    const texto = message.content.find((b) => b.type === 'text')?.text;
    if (texto === undefined || texto === '') throw new EngineError('Respuesta sin bloque de texto');

    let crudo: unknown;
    try {
      crudo = JSON.parse(texto) as unknown;
    } catch {
      throw new EngineError('La salida del radar no es JSON parseable');
    }

    // Sin retry de reparación, y es deliberado: una segunda llamada duplica la
    // latencia y mata el único motivo por el que existe esta función. Si el
    // modelo devuelve algo inválido, es un error y el usuario reintenta.
    const parsed = Salida.safeParse(crudo);
    if (!parsed.success) {
      throw new EngineError(
        `Salida inválida del radar: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const salida = parsed.data;
    const ms_motor = Math.max(0, Math.round(ahora() - arranque));

    if (salida.rechazado) {
      return {
        ok: false,
        rechazo: {
          version: '2.0',
          rechazado: true,
          motivo: salida.motivo_rechazo!,
          detalle: 'El radar no analiza este perfil.',
        },
      };
    }

    const indice = salida.indice!;
    const gap = calcularGap(input.globalUsuario ?? null, indice.score);
    const calidad: CalidadOpener = salida.openers.some((o) => o.licencia.trim() !== '')
      ? 'con_gancho'
      : 'decente';

    const probabilidad_respuesta = calcularProbabilidadRespuesta({
      gap,
      selectividad: salida.selectividad!,
      calidadOpener: calidad,
    });

    // El veredicto del radar sale de las mismas reglas que F5, pero simplificado:
    // sin autenticidad fina ni ganchos catalogados, así que se decide por gap y
    // por la alerta barata de autenticidad.
    const veredicto: RadarRead['veredicto'] =
      salida.alerta_autenticidad !== null
        ? 'no_vale'
        : gap === null
          ? 'oportunista'
          : gap.tier === 'el_arriba' || gap.tier === 'paridad'
            ? 'perseguir'
            : gap.tier === 'ella_un_tier'
              ? 'oportunista'
              : 'volumen_bajo_esfuerzo';

    return {
      ok: true,
      result: RadarRead.parse({
        version: '1.0',
        indice: {
          bucket: indice.bucket,
          score: indice.score,
          lectura: indice.lectura,
          precision: 'rapida',
          confianza: indice.confianza,
        },
        gap_delta: gap?.delta ?? null,
        probabilidad_respuesta,
        openers: salida.openers,
        veredicto,
        alerta_autenticidad: salida.alerta_autenticidad,
        ms_motor,
      }),
    };
  }

  return { run };
}

export type RadarEngine = ReturnType<typeof buildRadarEngine>;

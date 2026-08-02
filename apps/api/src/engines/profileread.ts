import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AnalisisRechazado,
  Autenticidad,
  ComponenteIndice,
  DensidadCompetitiva,
  EjeDeclarado,
  ExpectativaDePlan,
  Gancho,
  MotivoRechazo,
  Opener,
  ProfileRead,
  RegistroSugerido,
  Selectividad,
  type Region,
} from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';
import {
  armarIndice,
  calcularGap,
  calcularInversion,
  calcularProbabilidadRespuesta,
  calcularVolumenMatches,
  type CalidadOpener,
  type Componentes,
  type Plataforma,
} from './market.js';
import type { ClaudeClient } from './audit.js';

/**
 * Motor F5 - Lectura de perfil ajeno v2.0.
 *
 * Cadena de tres pasos, y el orden importa:
 *   PASO 0  triage: ¿se analiza este perfil? Corre ANTES de puntuar nada.
 *   PASO 1  lectura foto por foto (visión)
 *   PASO 2  síntesis
 *
 * El paso 0 es un paso propio y no un campo del paso 2 a propósito. Si el filtro
 * viviera adentro de la síntesis, el modelo estaría puntuando atractivo en la
 * misma pasada en que decide si corresponde puntuarlo, y en el caso de
 * `menor_aparente` eso es exactamente lo que no puede pasar. Acá el motor corta
 * antes y no hay ningún score en ninguna parte de la respuesta.
 *
 * Lo que el modelo aporta: los componentes percibidos del índice, selectividad,
 * autenticidad, curaduría, ganchos y openers.
 * Lo que pone el código: global/bucket/margen, volumen, probabilidad, gap e
 * inversión. Misma regla de siempre (CLAUDE.md §5).
 */

const promptsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'prompts', 'profileread',
);

const SCHEMA_TRIAGE = JSON.parse(readFileSync(join(promptsDir, 'schema-triage.json'), 'utf8')) as Record<string, unknown>;
const SCHEMA_FOTOS = JSON.parse(readFileSync(join(promptsDir, 'schema-fotos.json'), 'utf8')) as Record<string, unknown>;
const SCHEMA_SINTESIS = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;

const BLOCKLIST = readFileSync(join(promptsDir, '..', 'shared', 'blocklist.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

/** La MISMA calibración que F1: el gap resta un índice contra el otro. */
const CALIBRACION = readFileSync(join(promptsDir, '..', 'shared', 'calibracion-indice.md'), 'utf8');

export const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') +
  `\n---\n\n${CALIBRACION}\n` +
  `\n## Blocklist anti-slop (contenido vigente, prohibido usar)\n\n` +
  BLOCKLIST.map((l) => `- ${l}`).join('\n') +
  '\n';

/* ---------- contratos de cada paso ---------- */

const Triage = z
  .object({
    rechazado: z.boolean(),
    motivo: MotivoRechazo.nullable(),
    detalle: z.string().nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Un rechazo sin motivo no se puede accionar ni auditar después.
    if (val.rechazado && (val.motivo === null || val.detalle === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'un rechazo tiene que traer motivo y detalle',
      });
    }
  });

const LecturaFoto = z
  .object({
    foto: z.number().int().positive(),
    muestra: z.string().min(1),
    señales: z.array(z.string().min(1)).min(1),
    aporta_al_juicio: z.string().min(1),
  })
  .strict();

const Paso1 = z.object({ lectura_por_foto: z.array(LecturaFoto).min(1) }).strict();

const IndiceCrudo = z
  .object({
    facial: ComponenteIndice.nullable(),
    presentacion: ComponenteIndice.nullable(),
    produccion: ComponenteIndice.nullable(),
    limitantes: z.array(z.string().min(1)),
  })
  .strict();

/** Lo que devuelve la síntesis: todo menos lo que calcula el código. */
const Paso2 = z
  .object({
    indice: IndiceCrudo,
    selectividad: Selectividad,
    autenticidad: Autenticidad,
    eje_declarado: EjeDeclarado.nullable(),
    nivel_curaduria: z.enum(['producido', 'intermedio', 'casual']),
    densidad_competitiva: DensidadCompetitiva,
    intencion_declarada: z.string().min(1).nullable(),
    coherencia_texto_fotos: z
      .object({ coincide: z.boolean(), nota: z.string().min(1) })
      .strict()
      .nullable(),
    expectativa_de_plan: ExpectativaDePlan.nullable(),
    ganchos: z.array(Gancho),
    registro_sugerido: RegistroSugerido,
    openers: z.array(Opener).min(1).max(4),
    disclaimer: z.string().min(1),
  })
  .strict();

/* ---------- entrada y salida ---------- */

export type ProfilePhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ProfilePhoto {
  data: string;
  mediaType: ProfilePhotoMediaType;
}

export interface ProfileReadInput {
  photos: ProfilePhoto[];
  region: Region;
  /** Texto del perfil pegado, si el usuario lo tiene. */
  bio?: string;
  plataforma?: Plataforma;
  verificada?: boolean;
  /** Índice global del usuario (F1b). Sin esto no hay gap. */
  globalUsuario?: number | null;
}

export interface ProfileReadProgress {
  fotos_analizadas: number;
  total: number;
}

export interface ProfileReadHooks {
  onProgress?: (progress: ProfileReadProgress) => void;
}

/** Terminó bien, o el motor decidió no puntuar. Nunca las dos cosas. */
export type ProfileReadOutcome =
  | { ok: true; result: ProfileRead }
  | { ok: false; rechazo: AnalisisRechazado };

const MAX_TOKENS = 16000;

function extraerJson(message: { content: Array<{ type: string; text?: string }>; stop_reason: string | null }, paso: string): string {
  if (message.stop_reason === 'refusal') throw new EngineError(`El modelo rechazó la request en ${paso}`);
  if (message.stop_reason === 'max_tokens') throw new EngineError(`Salida truncada por max_tokens en ${paso}`);
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (text === undefined || text === '') throw new EngineError(`Respuesta sin bloque de texto en ${paso}`);
  return text;
}

/**
 * Cuánta calidad tiene el mejor opener que produjo el modelo. Alimenta la
 * probabilidad de respuesta: un opener con licencia citable y gancho concreto
 * mueve el número, uno de contexto genérico no.
 */
function calidadDeOpeners(openers: Opener[], ganchos: Gancho[]): CalidadOpener {
  if (ganchos.length > 0 && openers.some((o) => o.licencia.trim() !== '')) return 'con_gancho';
  return openers.length > 0 ? 'decente' : 'generico';
}

export interface ProfileReadEngineOptions {
  client: ClaudeClient;
  model?: string;
}

export function buildProfileReadEngine(options: ProfileReadEngineOptions) {
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
    const text = extraerJson(message, params.paso);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new EngineError(`La salida de ${params.paso} no es JSON parseable`);
    }
  }

  /** Valida contra Zod; si falla, UN retry pidiendo reparación con los errores concretos. */
  async function validarConReparacion<T>(
    schema: z.ZodType<T>,
    raw: unknown,
    ctx: { paso: string; jsonSchema: Record<string, unknown> },
  ): Promise<T> {
    const primero = schema.safeParse(raw);
    if (primero.success) return primero.data;

    const errores = primero.error.issues
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    const reparado = await callJson({
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
    const segundo = schema.safeParse(reparado);
    if (!segundo.success) {
      throw new EngineError(`Salida inválida tras reparación en ${ctx.paso}: ${errores}`);
    }
    return segundo.data;
  }

  async function run(
    input: ProfileReadInput,
    hooks?: ProfileReadHooks,
  ): Promise<ProfileReadOutcome> {
    if (input.photos.length < 1 || input.photos.length > 9) {
      throw new ValidationError(`Se esperan de 1 a 9 fotos, llegaron ${input.photos.length}`);
    }
    hooks?.onProgress?.({ fotos_analizadas: 0, total: input.photos.length });

    const bloquesImagen = input.photos.flatMap((photo, i) => [
      { type: 'text', text: `foto ${i + 1}:` },
      { type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.data } },
    ]);

    // PASO 0: triage. Si rechaza, se corta acá y no se puntúa nada.
    const triageRaw = await callJson({
      paso: 'paso 0 (triage)',
      schema: SCHEMA_TRIAGE,
      userContent: [
        ...bloquesImagen,
        {
          type: 'text',
          text:
            'PASO 0. Decidí si este perfil se analiza, según el system prompt. ' +
            'Ante cualquier duda de que la persona pueda ser menor de edad, rechazá.',
        },
      ],
    });
    const triage = await validarConReparacion(Triage, triageRaw, {
      paso: 'paso 0',
      jsonSchema: SCHEMA_TRIAGE,
    });

    if (triage.rechazado) {
      return {
        ok: false,
        rechazo: {
          version: '2.0',
          rechazado: true,
          motivo: triage.motivo!,
          detalle: triage.detalle!,
        },
      };
    }

    // PASO 1: lectura foto por foto.
    const paso1Raw = await callJson({
      paso: 'paso 1 (lectura por foto)',
      schema: SCHEMA_FOTOS,
      userContent: [
        ...bloquesImagen,
        {
          type: 'text',
          text: `PASO 1. Leé cada una de las ${input.photos.length} fotos según el system prompt.`,
        },
      ],
    });
    const paso1 = await validarConReparacion(Paso1, paso1Raw, {
      paso: 'paso 1',
      jsonSchema: SCHEMA_FOTOS,
    });
    hooks?.onProgress?.({ fotos_analizadas: input.photos.length, total: input.photos.length });

    // PASO 2: síntesis, sin re-mandar las imágenes.
    const paso2Raw = await callJson({
      paso: 'paso 2 (síntesis)',
      schema: SCHEMA_SINTESIS,
      userContent: [
        {
          type: 'text',
          text:
            `PASO 2. Sintetizá la lectura según el system prompt.\n` +
            `Registro regional del usuario: ${input.region}\n` +
            `Texto del perfil de ella:\n${input.bio || '(sin texto)'}\n` +
            `Lectura por foto (PASO 1):\n${JSON.stringify(paso1.lectura_por_foto)}`,
        },
      ],
    });
    const paso2 = await validarConReparacion(Paso2, paso2Raw, {
      paso: 'paso 2',
      jsonSchema: SCHEMA_SINTESIS,
    });

    // ---- de acá para abajo, todo lo pone el código ----

    const componentes: Componentes = {
      facial: paso2.indice.facial,
      presentacion: paso2.indice.presentacion,
      produccion: paso2.indice.produccion,
    };
    if (componentes.facial === null && componentes.presentacion === null && componentes.produccion === null) {
      // Sin un solo componente no hay índice, y sin índice no hay nada que
      // devolver: es un caso de "no pude leerlo", no un informe con huecos.
      return {
        ok: false,
        rechazo: {
          version: '2.0',
          rechazado: true,
          motivo: 'imagen_ilegible',
          detalle: 'No se pudo evaluar ningún componente del índice con estas fotos.',
        },
      };
    }

    const indice = armarIndice({
      componentes,
      fotosEvaluadas: input.photos.length,
      limitantes: paso2.indice.limitantes,
      sujeto: 'objetivo',
    });

    const gap = calcularGap(input.globalUsuario ?? null, indice.global);

    const volumen_matches = calcularVolumenMatches({
      bucket: indice.bucket_global,
      plataforma: input.plataforma ?? 'otra',
      verificada: input.verificada ?? false,
    });

    const probabilidad_respuesta = calcularProbabilidadRespuesta({
      gap,
      selectividad: paso2.selectividad.nivel,
      calidadOpener: calidadDeOpeners(paso2.openers, paso2.ganchos),
    });

    const inversion = calcularInversion({
      gap,
      autenticidad: paso2.autenticidad,
      selectividad: paso2.selectividad,
      tieneGanchos: paso2.ganchos.length > 0,
    });

    const { indice: _crudo, ...resto } = paso2;
    return {
      ok: true,
      result: ProfileRead.parse({
        version: '2.0',
        indice,
        volumen_matches,
        probabilidad_respuesta,
        gap,
        inversion,
        ...resto,
      }),
    };
  }

  return { run };
}

export type ProfileReadEngine = ReturnType<typeof buildProfileReadEngine>;

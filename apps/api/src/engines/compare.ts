import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AnalisisRechazado,
  CompareResult,
  ComponenteIndice,
  MotivoRechazo,
} from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';
import { calcularGap, calcularGlobal, type Componentes } from './market.js';
import type { ClaudeClient } from './audit.js';
import type { ProfilePhoto } from './profileread.js';

/**
 * Comparador de atractivo - su mejor foto contra la de ella, lado a lado.
 *
 * Una sola llamada con las dos imágenes: el juicio comparativo es exactamente lo
 * que hay que hacer en una pasada, porque la gracia está en que las mire juntas.
 *
 * El código pone los dos `global` (con pesos distintos por sujeto), el gap, y
 * hace cumplir la aritmética de la descomposición: `cerrables + no_cerrables`
 * tiene que dar el gap real. Sin eso el modelo promete 35 puntos de mejora sobre
 * un gap de 20, que es la forma más rápida de que el producto pierda
 * credibilidad.
 */

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'prompts', 'compare');

const SCHEMA = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;
const CALIBRACION = readFileSync(join(promptsDir, '..', 'shared', 'calibracion-indice.md'), 'utf8');

export const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') + `\n---\n\n${CALIBRACION}\n`;

const LadoCrudo = z
  .object({
    facial: ComponenteIndice.nullable(),
    presentacion: ComponenteIndice.nullable(),
    produccion: ComponenteIndice.nullable(),
    fortaleza: z.string().min(1),
    debilidad: z.string().min(1),
  })
  .strict();

const Salida = z
  .object({
    rechazado: z.boolean(),
    motivo_rechazo: MotivoRechazo.nullable(),
    usuario: LadoCrudo.nullable(),
    objetivo: LadoCrudo.nullable(),
    descomposicion: z
      .object({
        cerrables: z.number().int().min(0).max(100),
        no_cerrables: z.number().int().min(0).max(100),
        plan: z
          .array(
            z
              .object({
                accion: z.string().min(1),
                puntos: z.number().int().min(1).max(40),
                plazo: z.enum(['hoy', 'semana', 'mes', 'trimestre', 'año']),
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .nullable(),
    veredicto: z.string().min(1).nullable(),
    confianza: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.rechazado) {
      if (val.motivo_rechazo === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'un rechazo tiene que traer motivo' });
      }
      return;
    }
    if (val.usuario === null || val.objetivo === null || val.descomposicion === null || val.veredicto === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sin rechazo hacen falta los dos lados, la descomposición y el veredicto' });
    }
  });

export interface CompareInput {
  fotoUsuario: ProfilePhoto;
  fotoObjetivo: ProfilePhoto;
}

export type CompareOutcome =
  | { ok: true; result: CompareResult }
  | { ok: false; rechazo: AnalisisRechazado };

const MAX_TOKENS = 4000;

export interface CompareEngineOptions {
  client: ClaudeClient;
  model?: string;
}

/**
 * Hace cumplir la aritmética del gap. El modelo puede sobrestimar cuánto se
 * recupera; el código lo recorta al gap real y reparte la diferencia.
 *
 * Cuando el usuario está arriba (gap negativo) no hay nada que cerrar: la
 * descomposición se vuelve cero y el plan queda igual como sugerencias.
 */
function ajustarDescomposicion(
  cruda: { cerrables: number; no_cerrables: number },
  delta: number,
): { cerrables: number; no_cerrables: number } {
  if (delta <= 0) return { cerrables: 0, no_cerrables: 0 };
  const cerrables = Math.min(cruda.cerrables, delta);
  return { cerrables, no_cerrables: delta - cerrables };
}

export function buildCompareEngine(options: CompareEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';

  async function run(input: CompareInput): Promise<CompareOutcome> {
    if (!input.fotoUsuario || !input.fotoObjetivo) {
      throw new ValidationError('Hacen falta las dos fotos: la tuya y la de ella');
    }

    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'FOTO DEL USUARIO:' },
            { type: 'image', source: { type: 'base64', media_type: input.fotoUsuario.mediaType, data: input.fotoUsuario.data } },
            { type: 'text', text: 'FOTO DE ELLA:' },
            { type: 'image', source: { type: 'base64', media_type: input.fotoObjetivo.mediaType, data: input.fotoObjetivo.data } },
            { type: 'text', text: 'Compará las dos según el system prompt.' },
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
      throw new EngineError('La salida del comparador no es JSON parseable');
    }

    const parsed = Salida.safeParse(crudo);
    if (!parsed.success) {
      throw new EngineError(
        `Salida inválida del comparador: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const s = parsed.data;

    if (s.rechazado) {
      return {
        ok: false,
        rechazo: {
          version: '2.0',
          rechazado: true,
          motivo: s.motivo_rechazo!,
          detalle: 'El comparador no analiza estas fotos.',
        },
      };
    }

    const compUsuario: Componentes = {
      facial: s.usuario!.facial,
      presentacion: s.usuario!.presentacion,
      produccion: s.usuario!.produccion,
    };
    const compObjetivo: Componentes = {
      facial: s.objetivo!.facial,
      presentacion: s.objetivo!.presentacion,
      produccion: s.objetivo!.produccion,
    };
    const tieneAlgo = (c: Componentes) => c.facial !== null || c.presentacion !== null || c.produccion !== null;
    if (!tieneAlgo(compUsuario) || !tieneAlgo(compObjetivo)) {
      return {
        ok: false,
        rechazo: {
          version: '2.0',
          rechazado: true,
          motivo: 'imagen_ilegible',
          detalle: 'Una de las dos fotos no permite juzgar nada.',
        },
      };
    }

    // Pesos distintos por sujeto: del lado masculino la presentación y las
    // señales de producción pesan más a igual cara.
    const globalUsuario = calcularGlobal(compUsuario, 'usuario');
    const globalObjetivo = calcularGlobal(compObjetivo, 'objetivo');
    const gap = calcularGap(globalUsuario, globalObjetivo)!;

    const desc = ajustarDescomposicion(s.descomposicion!, gap.delta);
    // El techo nunca promete rasgos nuevos: es su índice más lo recuperable.
    const techo_estimado = Math.min(100, globalUsuario + desc.cerrables);

    return {
      ok: true,
      result: CompareResult.parse({
        version: '1.0',
        usuario: {
          etiqueta: 'usuario',
          global: globalUsuario,
          facial: compUsuario.facial,
          presentacion: compUsuario.presentacion,
          produccion: compUsuario.produccion,
          fortaleza: s.usuario!.fortaleza,
          debilidad: s.usuario!.debilidad,
        },
        objetivo: {
          etiqueta: 'objetivo',
          global: globalObjetivo,
          facial: compObjetivo.facial,
          presentacion: compObjetivo.presentacion,
          produccion: compObjetivo.produccion,
          fortaleza: s.objetivo!.fortaleza,
          debilidad: s.objetivo!.debilidad,
        },
        gap,
        descomposicion: { ...desc, plan: s.descomposicion!.plan },
        veredicto: s.veredicto!,
        techo_estimado,
        confianza: s.confianza,
      }),
    };
  }

  return { run };
}

export type CompareEngine = ReturnType<typeof buildCompareEngine>;

import { z } from 'zod';
import { Confianza } from './shared.js';

/**
 * F4 — ChatTurnAnalysis (spec §6.2).
 * Los números de `comportamiento` se calculan EN CÓDIGO (engines/behavior.ts);
 * el LLM solo interpreta. Este contrato valida la salida final del turno.
 */

export const VeredictoDecision = z.enum([
  'invertir_mas',
  'mantener',
  'proponer_salida_ahora',
  'bajar_energia',
  'dejar_morir',
]);
export type VeredictoDecision = z.infer<typeof VeredictoDecision>;

export const Comportamiento = z
  .object({
    latencia_promedio_min: z.number().nonnegative(),
    latencia_tendencia: z.enum(['creciente', 'estable', 'decreciente']),
    ratio_esfuerzo: z.number().nonnegative(),
    preguntas_ella_ultimos_10: z.number().int().nonnegative(),
    reinicia_ella: z.boolean(),
    profundidad: z.enum(['pregunta', 'comparte', 'responde_solo']),
  })
  .strict();
export type Comportamiento = z.infer<typeof Comportamiento>;

export const RegistroDetectado = z
  .object({
    formalidad: z.enum(['baja', 'media', 'alta']),
    mayusculas: z.boolean(),
    emojis: z.enum(['ninguno', 'pocos', 'muchos']),
    humor: z.string().min(1),
  })
  .strict();
export type RegistroDetectado = z.infer<typeof RegistroDetectado>;

/** Sugerencia SIEMPRE con etiqueta de estrategia y por_que — nunca texto suelto (spec F4.3). */
export const Sugerencia = z
  .object({
    estrategia: z.string().min(1),
    texto: z.string().min(1),
    por_que: z.string().min(1),
  })
  .strict();
export type Sugerencia = z.infer<typeof Sugerencia>;

/** Veredicto falseable: decisión + evidencia obligatoria (min 1) + cuándo revisar. */
export const Veredicto = z
  .object({
    decision: VeredictoDecision,
    confianza: Confianza,
    evidencia: z.array(z.string().min(1)).min(1),
    revisar_en_dias: z.number().int().positive(),
  })
  .strict();
export type Veredicto = z.infer<typeof Veredicto>;

export const ChatTurnAnalysis = z
  .object({
    version: z.literal('1.0'),
    comportamiento: Comportamiento,
    registro_detectado: RegistroDetectado,
    sugerencias: z.array(Sugerencia).min(1).max(3),
    veredicto: Veredicto,
  })
  .strict();

export type ChatTurnAnalysis = z.infer<typeof ChatTurnAnalysis>;

import { z } from 'zod';

/**
 * F3 - Bio por intención.
 *
 * Tres variantes, no una: la bio es lo más personal del perfil y el usuario
 * tiene que poder elegir la que suena a él. Una sola opción se copia y pega sin
 * pensar, y se nota.
 */

export const Intencion = z.enum(['relacion', 'casual', 'abierto']);
export type Intencion = z.infer<typeof Intencion>;

/** Dónde va a vivir la bio. Cambia el largo y el formato, no el contenido. */
export const Plataforma = z.enum(['tinder', 'bumble', 'hinge', 'otra']);
export type Plataforma = z.infer<typeof Plataforma>;

export const VarianteBio = z
  .object({
    /** Qué estrategia usa esta variante, para que el usuario entienda la diferencia. */
    angulo: z.string().min(1),
    texto: z.string().min(1).max(500),
    /** Por qué funciona. Es lo que hace que aprenda, en vez de solo copiar. */
    por_que: z.string().min(1),
    /** Cuántos caracteres, porque cada app tiene su tope. */
    largo: z.number().int().positive(),
  })
  .strict();
export type VarianteBio = z.infer<typeof VarianteBio>;

/**
 * Respuestas a prompts al estilo Hinge. Vacío si la plataforma no los usa.
 */
export const RespuestaPrompt = z
  .object({
    prompt: z.string().min(1),
    respuesta: z.string().min(1).max(300),
    por_que: z.string().min(1),
  })
  .strict();
export type RespuestaPrompt = z.infer<typeof RespuestaPrompt>;

export const BioResult = z
  .object({
    version: z.literal('1.0'),
    variantes: z.array(VarianteBio).min(3).max(3),
    prompts: z.array(RespuestaPrompt),
    /**
     * Qué de la bio vieja estaba matando el perfil. `null` si no había bio.
     * Es el hallazgo, no un elogio.
     */
    diagnostico_anterior: z.string().min(1).nullable(),
  })
  .strict();
export type BioResult = z.infer<typeof BioResult>;

/** Body de POST /bio. */
export const NuevaBio = z
  .object({
    intencion: Intencion,
    plataforma: Plataforma.default('otra'),
    /** Tres datos reales del usuario. Sin esto la bio sale genérica. */
    datos: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
    bio_actual: z.string().max(2000).optional(),
  })
  .strict();
export type NuevaBio = z.infer<typeof NuevaBio>;

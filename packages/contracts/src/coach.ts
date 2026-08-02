import { z } from 'zod';

/**
 * Coach de confianza: la conversación donde el usuario procesa lo que no es
 * técnico. No es terapia y no se disfraza de terapia - es el amigo que ya vio
 * tus datos. El límite está escrito en el prompt del motor, no acá.
 */

export const RolCoach = z.enum(['user', 'coach']);
export type RolCoach = z.infer<typeof RolCoach>;

export const MensajeCoach = z.strictObject({
  id: z.string(),
  rol: RolCoach,
  texto: z.string(),
  created_at: z.string(),
});
export type MensajeCoach = z.infer<typeof MensajeCoach>;

/** Body de POST /coach/mensaje. */
export const NuevoMensajeCoach = z.strictObject({
  texto: z.string().trim().min(1).max(2000),
});
export type NuevoMensajeCoach = z.infer<typeof NuevoMensajeCoach>;

/**
 * Estado de la conversación: los mensajes más cuánto le queda de cupo.
 * `restantes` en null = sin límite (plan pago).
 */
export const EstadoCoach = z.strictObject({
  mensajes: z.array(MensajeCoach),
  restantes: z.number().int().nullable(),
});
export type EstadoCoach = z.infer<typeof EstadoCoach>;

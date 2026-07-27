import { z } from 'zod';
import { Region } from './shared.js';

/**
 * Perfil de cuenta (percentil.profiles). Identidad (nombre, foto, mail,
 * proveedores vinculados) vive en la sesión de Supabase Auth, no acá:
 * esto es SOLO lo específico de la app.
 */
export const AccountProfile = z.strictObject({
  region: Region,
  plan: z.enum(['free', 'kit', 'copilot']),
  handle: z.string().max(60).nullable(),
});
export type AccountProfile = z.infer<typeof AccountProfile>;

/**
 * Respuesta de GET /me: el perfil más si la cuenta es admin. `esAdmin` es solo
 * para que la UI decida qué mostrar; la autorización real la hace la API en
 * cada ruta /admin/*, nunca este flag.
 */
export const CuentaMe = AccountProfile.extend({ esAdmin: z.boolean() });
export type CuentaMe = z.infer<typeof CuentaMe>;

/** Body de PATCH /me: todo opcional, se actualiza lo que venga. */
export const AccountProfileUpdate = z.strictObject({
  region: Region.optional(),
  handle: z.string().trim().min(1).max(60).nullable().optional(),
});
export type AccountProfileUpdate = z.infer<typeof AccountProfileUpdate>;

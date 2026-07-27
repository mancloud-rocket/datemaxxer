import type { preHandlerAsyncHookHandler } from 'fastify';
import { AppError } from '../errors.js';

/**
 * Quién es admin se define por variable de entorno (`ADMIN_USER_IDS`, uids de
 * Supabase separados por coma), no por una columna en base. Motivo: una columna
 * `is_admin` es escalable por cualquier bug de escritura en profiles; el env solo
 * cambia con acceso al panel de Render.
 *
 * Devuelve 404 y no 403 cuando el usuario no es admin: no confirma que la ruta exista.
 */

export function parsearAdmins(raw: string | undefined): Set<string> {
  if (raw === undefined) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  );
}

export function makeRequireAdmin(admins: Set<string>): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!admins.has(request.userId)) {
      throw new AppError('not_found', 'No encontrado', 404);
    }
  };
}

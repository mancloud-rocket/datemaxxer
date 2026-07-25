import type { FastifyRequest } from 'fastify';
import { decodeJwt } from 'jose';

/**
 * Clave de rate limit por USUARIO cuando se puede, con fallback a IP.
 *
 * El `sub` se lee decodificando el JWT SIN verificar: el rate limit corre en
 * `onRequest`, antes del preHandler de auth, así que la verificación real todavía
 * no pasó. Es seguro para este uso: un token forjado solo consigue su propio
 * balde de rate limit y muere igual en el 401 del preHandler, sin llegar a gastar
 * una llamada al modelo. El límite global por IP sigue cubriendo el flood anónimo.
 *
 * Requiere `trustProxy` en Fastify para que `request.ip` sea la IP real detrás
 * del proxy de Render y no la del proxy (ver app.ts).
 */
export function rateLimitKey(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (header !== undefined && header.startsWith('Bearer ')) {
    try {
      const { sub } = decodeJwt(header.slice('Bearer '.length));
      if (typeof sub === 'string' && sub !== '') return `u:${sub}`;
    } catch {
      /* token ilegible: cae a IP */
    }
  }
  return `ip:${request.ip}`;
}

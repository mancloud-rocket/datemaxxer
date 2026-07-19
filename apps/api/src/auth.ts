import type { preHandlerAsyncHookHandler } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env.js';
import { AppError, AuthError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** uid de Supabase (claim `sub`), seteado por el preHandler `authenticate`. */
    userId: string;
  }
}

type Verifier = (token: string) => Promise<{ sub?: string | undefined }>;

function buildVerifier(env: Env): Verifier | null {
  // JWKS del proyecto es la fuente de verdad (claves reales de Supabase, sin secreto
  // copiado a mano). HS256 legacy queda solo para cuando NO hay proyecto Supabase
  // configurado (tests: generan sus propios JWT con un secret conocido).
  if (env.SUPABASE_URL !== undefined) {
    const jwks = createRemoteJWKSet(
      new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
    return async (token) => (await jwtVerify(token, jwks)).payload;
  }
  if (env.SUPABASE_JWT_SECRET !== undefined) {
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    return async (token) => (await jwtVerify(token, secret)).payload;
  }
  return null; // sin Supabase configurado: rutas autenticadas responden 503
}

/** preHandler para rutas protegidas: valida Bearer JWT de Supabase y setea request.userId. */
export function makeAuthenticate(env: Env): preHandlerAsyncHookHandler {
  const verify = buildVerifier(env);
  return async (request) => {
    if (verify === null) {
      throw new AppError(
        'auth_unavailable',
        'Auth no configurada (falta SUPABASE_URL o SUPABASE_JWT_SECRET)',
        503,
      );
    }
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new AuthError('Falta el header Authorization: Bearer <jwt>');
    }
    let sub: string | undefined;
    try {
      ({ sub } = await verify(header.slice('Bearer '.length)));
    } catch {
      throw new AuthError('Token inválido o vencido');
    }
    if (sub === undefined || sub === '') {
      throw new AuthError('Token sin subject');
    }
    request.userId = sub;
  };
}

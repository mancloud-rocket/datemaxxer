import Anthropic from '@anthropic-ai/sdk';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { CONTRACTS_VERSION } from '@percentil/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuditRoutes } from './audit/routes.js';
import { InMemoryAuditStore, type AuditStore } from './audit/store.js';
import { SupabaseAuditStore } from './audit/supabase-store.js';
import { makeAuthenticate } from './auth.js';
import {
  buildAuditEngine,
  claudeClientFromSdk,
  type AuditEngine,
} from './engines/audit.js';
import type { Env } from './env.js';
import { AppError } from './errors.js';

export interface AppDeps {
  auditEngine?: AuditEngine;
  auditStore?: AuditStore;
}

function resolveAuditEngine(env: Env, deps: AppDeps): AuditEngine | undefined {
  if (deps.auditEngine) return deps.auditEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildAuditEngine({
    client: claudeClientFromSdk(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

export async function buildApp(env: Env, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : { level: env.LOG_LEVEL }, // logger de Fastify = pino
  });

  app.decorateRequest('userId', '');

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  });

  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 9, fields: 10 },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS !== undefined ? env.CORS_ORIGINS.split(',') : true,
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: err.code, message: err.message });
    }
    // Errores de Fastify/plugins con statusCode (404, 429, body inválido, etc.)
    const e = err as { statusCode?: unknown; code?: unknown; message?: unknown };
    const statusCode =
      typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err }, 'error no manejado');
      return reply.status(500).send({ error: 'internal', message: 'Error interno' });
    }
    return reply.status(statusCode).send({
      error: typeof e.code === 'string' ? e.code : 'error',
      message: typeof e.message === 'string' ? e.message : 'Error',
    });
  });

  const authenticate = makeAuthenticate(env);

  app.get('/health', async () => ({
    status: 'ok',
    contracts: CONTRACTS_VERSION,
  }));

  // Ruta protegida mínima: prueba el middleware de auth end-to-end.
  app.get('/me', { preHandler: [authenticate] }, async (request) => ({
    userId: request.userId,
  }));

  // F1: auditoría gratuita (sin auth, con rate limit propio y captura de email)
  const auditStore =
    deps.auditStore ??
    (env.SUPABASE_URL !== undefined && env.SUPABASE_SERVICE_ROLE_KEY !== undefined
      ? new SupabaseAuditStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : new InMemoryAuditStore());
  registerAuditRoutes(app, {
    store: auditStore,
    engine: resolveAuditEngine(env, deps),
    authenticate,
    rateLimitMax: env.AUDIT_RATE_LIMIT_MAX,
    freeLimit: env.AUDIT_FREE_LIMIT,
  });

  return app;
}

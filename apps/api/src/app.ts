import Anthropic from '@anthropic-ai/sdk';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { CONTRACTS_VERSION } from '@percentil/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  NoopPhotoArchive,
  SupabasePhotoArchive,
  type PhotoArchive,
} from './audit/photo-archive.js';
import { registerAuditRoutes } from './audit/routes.js';
import { InMemoryAuditStore, type AuditStore } from './audit/store.js';
import { SupabaseAuditStore } from './audit/supabase-store.js';
import { makeRequireAdmin, parsearAdmins } from './admin/guard.js';
import { InMemoryAdminStore, SupabaseAdminStore, type AdminStore } from './admin/store.js';
import { makeAuthenticate } from './auth.js';
import { registerBillingRoutes } from './billing/routes.js';
import { InMemoryBillingStore, SupabaseBillingStore, type BillingStore } from './billing/store.js';
import {
  buildAuditEngine,
  claudeClientFromSdk,
  type AuditEngine,
} from './engines/audit.js';
import type { Env } from './env.js';
import { AppError } from './errors.js';
import { registerProfileRoutes } from './profile/routes.js';
import { InMemoryProfileStore, SupabaseProfileStore, type ProfileStore } from './profile/store.js';
import { NoopNotificador, ResendNotificador, type Notificador } from './upgrades/notificador.js';
import { registerUpgradeRoutes } from './upgrades/routes.js';
import { InMemoryUpgradeStore, SupabaseUpgradeStore, type UpgradeStore } from './upgrades/store.js';

export interface AppDeps {
  auditEngine?: AuditEngine;
  auditStore?: AuditStore;
  profileStore?: ProfileStore;
  photoArchive?: PhotoArchive;
  billingStore?: BillingStore;
  upgradeStore?: UpgradeStore;
  adminStore?: AdminStore;
  notificador?: Notificador;
}

function resolveNotificador(env: Env, deps: AppDeps): Notificador {
  if (deps.notificador) return deps.notificador;
  if (env.RESEND_API_KEY === undefined || env.ADMIN_EMAIL === undefined) {
    return new NoopNotificador();
  }
  return new ResendNotificador({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
    to: env.ADMIN_EMAIL,
    panelUrl: env.ADMIN_PANEL_URL,
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Store de auditorías, para mantenimiento fuera del ciclo de request. */
    auditStore: AuditStore;
  }
}

function resolveAuditEngine(env: Env, deps: AppDeps): AuditEngine | undefined {
  if (deps.auditEngine) return deps.auditEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildAuditEngine({
    client: claudeClientFromSdk(
      new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        // Sin esto una llamada colgada deja la auditoría en "analizando" para
        // siempre. Cada paso corta solo; el techo total lo pone AUDIT_TIMEOUT_MS.
        timeout: 120_000,
        maxRetries: 1,
      }),
    ),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

export async function buildApp(env: Env, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : { level: env.LOG_LEVEL }, // logger de Fastify = pino
    /**
     * OBLIGATORIO detrás del proxy de Render: sin esto `request.ip` es la IP del
     * proxy para TODOS, el rate limit se vuelve un cupo global compartido y la
     * plataforma se cae con un puñado de usuarios simultáneos.
     */
    trustProxy: true,
  });

  app.decorateRequest('userId', '');
  app.decorateRequest('userEmail', null);

  // Límite global: por IP real. Protege del flood anónimo.
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

  const hasSupabase = env.SUPABASE_URL !== undefined && env.SUPABASE_SERVICE_ROLE_KEY !== undefined;

  const auditStore =
    deps.auditStore ??
    (hasSupabase
      ? new SupabaseAuditStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new InMemoryAuditStore());

  const profileStore =
    deps.profileStore ??
    (hasSupabase
      ? new SupabaseProfileStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new InMemoryProfileStore());

  registerAuditRoutes(app, {
    store: auditStore,
    profileStore,
    engine: resolveAuditEngine(env, deps),
    authenticate,
    rateLimitMax: env.AUDIT_RATE_LIMIT_MAX,
    freeLimit: env.AUDIT_FREE_LIMIT,
    timeoutMs: env.AUDIT_TIMEOUT_MS,
    staleAfterMs: env.AUDIT_STALE_AFTER_MS,
    photoArchive:
      deps.photoArchive ??
      (hasSupabase
        ? new SupabasePhotoArchive(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new NoopPhotoArchive()),
  });

  const admins = parsearAdmins(env.ADMIN_USER_IDS);

  registerProfileRoutes(app, {
    profileStore,
    auditStore,
    authenticate,
    esAdmin: (userId) => admins.has(userId),
  });

  registerUpgradeRoutes(app, {
    upgradeStore:
      deps.upgradeStore ??
      (hasSupabase
        ? new SupabaseUpgradeStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new InMemoryUpgradeStore()),
    adminStore:
      deps.adminStore ??
      (hasSupabase
        ? new SupabaseAdminStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new InMemoryAdminStore()),
    profileStore,
    notificador: resolveNotificador(env, deps),
    authenticate,
    requireAdmin: makeRequireAdmin(admins),
  });

  await registerBillingRoutes(app, {
    store:
      deps.billingStore ??
      (hasSupabase
        ? new SupabaseBillingStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new InMemoryBillingStore()),
    webhookSecret: env.PADDLE_WEBHOOK_SECRET,
    precios: { kit: env.PADDLE_PRICE_KIT, copiloto: env.PADDLE_PRICE_COPILOTO },
  });

  // Expuesto para tareas de mantenimiento fuera del ciclo de request
  // (barrido de auditorías huérfanas al arrancar, ver server.ts).
  app.decorate('auditStore', auditStore);

  return app;
}

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
import { registerCoachRoutes } from './coach/routes.js';
import { InMemoryCoachStore, SupabaseCoachStore, type CoachStore } from './coach/store.js';
import {
  buildCoachEngine,
  coachClientFromSdk,
  type CoachEngine,
} from './engines/coach.js';
import { registerBillingRoutes } from './billing/routes.js';
import { InMemoryBillingStore, SupabaseBillingStore, type BillingStore } from './billing/store.js';
import {
  buildAuditEngine,
  claudeClientFromSdk,
  type AuditEngine,
} from './engines/audit.js';
import type { Env } from './env.js';
import { AppError } from './errors.js';
import {
  buildProfileReadEngine,
  type ProfileReadEngine,
} from './engines/profileread.js';
import { registerProfileReadRoutes } from './profile-read/routes.js';
import {
  InMemoryProfileReadStore,
  SupabaseProfileReadStore,
  type ProfileReadStore,
} from './profile-read/store.js';
import { buildBioEngine, type BioEngine } from './engines/bio.js';
import { buildChatEngine, type ChatEngine } from './engines/chat.js';
import { registerChatRoutes } from './chat/routes.js';
import { InMemoryChatStore, SupabaseChatStore, type ChatStore } from './chat/store.js';
import { registerBioRoutes } from './bio/routes.js';
import { registerPhotosRoutes } from './photos/routes.js';
import { buildCompareEngine, type CompareEngine } from './engines/compare.js';
import { registerCompareRoutes } from './compare/routes.js';
import { buildRadarEngine, type RadarEngine } from './engines/radar.js';
import { registerRadarRoutes } from './radar/routes.js';
import { InMemoryRadarStore, SupabaseRadarStore, type RadarStore } from './radar/store.js';
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
  coachStore?: CoachStore;
  coachEngine?: CoachEngine;
  profileReadStore?: ProfileReadStore;
  profileReadEngine?: ProfileReadEngine;
  radarStore?: RadarStore;
  radarEngine?: RadarEngine;
  compareEngine?: CompareEngine;
  bioEngine?: BioEngine;
  chatStore?: ChatStore;
  chatEngine?: ChatEngine;
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
    /** Stores expuestos para mantenimiento fuera del ciclo de request
     *  (barrido de trabajos huérfanos al arrancar, ver server.ts). */
    auditStore: AuditStore;
    profileReadStore: ProfileReadStore;
  }
}

function sdkAnthropic(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // Sin esto una llamada colgada deja la auditoría en "analizando" para
    // siempre. Cada paso corta solo; el techo total lo pone AUDIT_TIMEOUT_MS.
    timeout: 120_000,
    maxRetries: 1,
  });
}

function resolveAuditEngine(env: Env, deps: AppDeps): AuditEngine | undefined {
  if (deps.auditEngine) return deps.auditEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildAuditEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

function resolveProfileReadEngine(env: Env, deps: AppDeps): ProfileReadEngine | undefined {
  if (deps.profileReadEngine) return deps.profileReadEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildProfileReadEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

function resolveRadarEngine(env: Env, deps: AppDeps): RadarEngine | undefined {
  if (deps.radarEngine) return deps.radarEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  // Modelo propio, NO el de las auditorías: el radar corre por swipe.
  return buildRadarEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    model: env.RADAR_MODEL,
  });
}

function resolveChatEngine(env: Env, deps: AppDeps): ChatEngine | undefined {
  if (deps.chatEngine) return deps.chatEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildChatEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

function resolveBioEngine(env: Env, deps: AppDeps): BioEngine | undefined {
  if (deps.bioEngine) return deps.bioEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildBioEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

function resolveCompareEngine(env: Env, deps: AppDeps): CompareEngine | undefined {
  if (deps.compareEngine) return deps.compareEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  // Modelo grande: acá la calibración importa y el usuario espera.
  return buildCompareEngine({
    client: claudeClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
    ...(env.AUDIT_MODEL !== undefined ? { model: env.AUDIT_MODEL } : {}),
  });
}

function resolveCoachEngine(env: Env, deps: AppDeps): CoachEngine | undefined {
  if (deps.coachEngine) return deps.coachEngine;
  if (env.ANTHROPIC_API_KEY === undefined) return undefined;
  return buildCoachEngine({
    client: coachClientFromSdk(sdkAnthropic(env.ANTHROPIC_API_KEY)),
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

  const profileReadStore =
    deps.profileReadStore ??
    (hasSupabase
      ? new SupabaseProfileReadStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new InMemoryProfileReadStore());

  registerProfileReadRoutes(app, {
    store: profileReadStore,
    profileStore,
    auditStore,
    engine: resolveProfileReadEngine(env, deps),
    authenticate,
    rateLimitMax: env.PROFILE_READ_RATE_LIMIT_MAX,
    limites: {
      free: env.PROFILE_READ_FREE_LIMIT,
      kit: env.PROFILE_READ_KIT_LIMIT,
      copilot: env.PROFILE_READ_COPILOT_LIMIT,
    },
    ventanaDiasCopilot: env.PROFILE_READ_VENTANA_DIAS,
    timeoutMs: env.PROFILE_READ_TIMEOUT_MS,
  });

  // El comparador comparte el pozo de cupo del radar: misma familia de uso.
  const radarStore =
    deps.radarStore ??
    (hasSupabase
      ? new SupabaseRadarStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new InMemoryRadarStore());

  registerChatRoutes(app, {
    store:
      deps.chatStore ??
      (hasSupabase
        ? new SupabaseChatStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new InMemoryChatStore()),
    profileStore,
    engine: resolveChatEngine(env, deps),
    authenticate,
    rateLimitMax: env.AUDIT_RATE_LIMIT_MAX,
  });

  registerPhotosRoutes(app, {
    profileStore,
    auditStore,
    authenticate,
    rateLimitMax: env.AUDIT_RATE_LIMIT_MAX,
  });

  registerBioRoutes(app, {
    profileStore,
    auditStore,
    engine: resolveBioEngine(env, deps),
    authenticate,
    rateLimitMax: env.AUDIT_RATE_LIMIT_MAX,
  });

  registerCompareRoutes(app, {
    store: radarStore,
    profileStore,
    engine: resolveCompareEngine(env, deps),
    authenticate,
    rateLimitMax: env.RADAR_RATE_LIMIT_MAX,
    limites: {
      free: env.RADAR_FREE_LIMIT,
      kit: env.RADAR_KIT_LIMIT,
      copilot: env.RADAR_COPILOT_LIMIT,
    },
    ventanaDias: env.RADAR_VENTANA_DIAS,
  });

  registerRadarRoutes(app, {
    store: radarStore,
    profileStore,
    auditStore,
    engine: resolveRadarEngine(env, deps),
    authenticate,
    rateLimitMax: env.RADAR_RATE_LIMIT_MAX,
    limites: {
      free: env.RADAR_FREE_LIMIT,
      kit: env.RADAR_KIT_LIMIT,
      copilot: env.RADAR_COPILOT_LIMIT,
    },
    ventanaDias: env.RADAR_VENTANA_DIAS,
  });

  registerCoachRoutes(app, {
    store:
      deps.coachStore ??
      (hasSupabase
        ? new SupabaseCoachStore(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
        : new InMemoryCoachStore()),
    profileStore,
    auditStore,
    engine: resolveCoachEngine(env, deps),
    authenticate,
    rateLimitMax: env.COACH_RATE_LIMIT_MAX,
    limites: {
      free: env.COACH_FREE_LIMIT,
      kit: env.COACH_KIT_LIMIT,
      copilot: null,
    },
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
  app.decorate('profileReadStore', profileReadStore);

  return app;
}

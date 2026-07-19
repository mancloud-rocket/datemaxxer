import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { AccountProfileUpdate } from '@percentil/contracts';
import { ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import { publicView } from '../audit/routes.js';
import type { ProfileStore } from './store.js';

/**
 * Cuenta del usuario (distinto del flujo de auditoría en audit/routes.ts):
 * GET   /me         → {region, plan, handle} (identidad vive en la sesión de Supabase, no acá)
 * PATCH /me         → actualiza region/handle, devuelve el perfil completo
 * GET   /me/audits  → historial completo, más reciente primero
 */

export interface ProfileRoutesDeps {
  profileStore: ProfileStore;
  auditStore: AuditStore;
  authenticate: preHandlerAsyncHookHandler;
}

const DEFAULTS = { region: 'neutro' as const, plan: 'free' as const, handle: null };

export function registerProfileRoutes(app: FastifyInstance, deps: ProfileRoutesDeps): void {
  const { profileStore, auditStore, authenticate } = deps;

  app.get('/me', { preHandler: [authenticate] }, async (request) => {
    const row = await profileStore.get(request.userId);
    return row ?? DEFAULTS;
  });

  app.patch('/me', { preHandler: [authenticate] }, async (request) => {
    const parsed = AccountProfileUpdate.safeParse(request.body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(detail);
    }
    return profileStore.update(request.userId, parsed.data);
  });

  app.get('/me/audits', { preHandler: [authenticate] }, async (request) => {
    const records = await auditStore.listForUser(request.userId);
    return { audits: records.map(publicView) };
  });
}

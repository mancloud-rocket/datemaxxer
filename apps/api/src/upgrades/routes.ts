import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { CambioPlanAdmin, NuevaSolicitud } from '@percentil/contracts';
import { ValidationError } from '../errors.js';
import type { AdminStore } from '../admin/store.js';
import type { ProfileStore } from '../profile/store.js';
import type { Notificador } from './notificador.js';
import type { Solicitud, UpgradeStore } from './store.js';

/**
 * Pedidos de plan mientras el cobro es manual.
 *
 * Usuario:  POST /me/upgrade         → deja el pedido, dispara el mail al admin
 *           GET  /me/upgrade         → sus pedidos (la UI muestra "ya lo pediste")
 * Admin:    GET  /admin/solicitudes  → pendientes
 *           GET  /admin/usuarios     → ABM chico
 *           PATCH /admin/usuarios/:id/plan → activa o baja el plan a mano
 */

export interface UpgradeRoutesDeps {
  upgradeStore: UpgradeStore;
  profileStore: ProfileStore;
  adminStore: AdminStore;
  notificador: Notificador;
  authenticate: preHandlerAsyncHookHandler;
  requireAdmin: preHandlerAsyncHookHandler;
}

const vista = (s: Solicitud) => ({
  id: s.id,
  sku: s.sku,
  estado: s.estado,
  mensaje: s.mensaje,
  created_at: s.createdAt.toISOString(),
});

const vistaAdmin = (s: Solicitud) => ({ ...vista(s), userId: s.userId, email: s.email });

export function registerUpgradeRoutes(app: FastifyInstance, deps: UpgradeRoutesDeps): void {
  const { upgradeStore, profileStore, adminStore, notificador, authenticate, requireAdmin } = deps;

  app.post('/me/upgrade', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = NuevaSolicitud.safeParse(request.body ?? {});
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ValidationError(detail);
    }

    const { solicitud, yaExistia } = await upgradeStore.crear({
      userId: request.userId,
      sku: parsed.data.sku,
      mensaje: parsed.data.mensaje ?? null,
      email: request.userEmail,
    });

    // Un solo mail por pedido: si toca el botón de nuevo no se vuelve a avisar.
    if (!yaExistia) {
      try {
        const auditorias = await adminStore
          .contarAuditorias(request.userId)
          .catch(() => undefined);
        await notificador.avisarSolicitud({
          userId: request.userId,
          email: request.userEmail,
          sku: parsed.data.sku,
          mensaje: parsed.data.mensaje ?? null,
          ...(auditorias !== undefined ? { auditorias } : {}),
        });
      } catch (error) {
        // El aviso no puede voltear el pedido: quedó guardado y sale en el panel.
        request.log.error({ err: error, userId: request.userId }, 'aviso de solicitud falló');
      }
    }

    reply.code(yaExistia ? 200 : 201);
    return vista(solicitud);
  });

  app.get('/me/upgrade', { preHandler: [authenticate] }, async (request) => {
    const solicitudes = await upgradeStore.deUsuario(request.userId);
    return { solicitudes: solicitudes.map(vista) };
  });

  app.get('/admin/solicitudes', { preHandler: [authenticate, requireAdmin] }, async () => {
    const solicitudes = await upgradeStore.pendientes();
    return { solicitudes: solicitudes.map(vistaAdmin) };
  });

  app.get('/admin/usuarios', { preHandler: [authenticate, requireAdmin] }, async (request) => {
    const { limite } = request.query as { limite?: string };
    const n = Math.min(Number(limite) || 100, 200);
    return { usuarios: await adminStore.listarUsuarios(n) };
  });

  app.patch(
    '/admin/usuarios/:id/plan',
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const parsed = CambioPlanAdmin.safeParse(request.body);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new ValidationError(detail);
      }
      const { id } = request.params as { id: string };
      const perfil = await profileStore.setPlan(id, parsed.data.plan);

      // Si vino de una solicitud, se cierra: activada si le dimos plan pago.
      if (parsed.data.solicitudId !== undefined) {
        await upgradeStore.resolver(
          parsed.data.solicitudId,
          parsed.data.plan === 'free' ? 'rechazada' : 'activada',
          request.userId,
        );
      }
      request.log.info(
        { admin: request.userId, objetivo: id, plan: parsed.data.plan },
        'plan cambiado a mano',
      );
      return perfil;
    },
  );
}

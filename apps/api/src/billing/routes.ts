import type { FastifyInstance } from 'fastify';
import { EventoPaddle, interpretarEvento, type MapaPrecios } from './eventos.js';
import { verificarFirmaPaddle } from './paddle-signature.js';
import type { BillingStore } from './store.js';

/**
 * POST /webhooks/paddle
 *
 * Es la única fuente de verdad de quién pagó: el frontend NUNCA activa un plan.
 * Aunque el checkout de Paddle diga "listo", el acceso se otorga acá, después de
 * verificar la firma.
 *
 * Devuelve 200 incluso para eventos que no nos interesan: Paddle reintenta ante
 * cualquier respuesta que no sea 2xx, y no queremos reintentos infinitos por
 * eventos que ignoramos a propósito. El único caso de 4xx es firma inválida.
 */

export interface BillingRoutesDeps {
  store: BillingStore;
  /** Secreto del destino de notificaciones (`pdl_ntfset_...`). Sin esto, no se atiende. */
  webhookSecret: string | undefined;
  precios: MapaPrecios;
}

export async function registerBillingRoutes(
  app: FastifyInstance,
  deps: BillingRoutesDeps,
): Promise<void> {
  // Scope propio para el parser de cuerpo crudo: la firma se calcula sobre los
  // BYTES EXACTOS recibidos. Si Fastify parsea el JSON y se re-serializa, la
  // firma no valida nunca. Encapsulado en un plugin para no romper el resto de
  // las rutas, que sí necesitan el body ya parseado (PATCH /me, por ejemplo).
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/paddle', async (request, reply) => {
      if (deps.webhookSecret === undefined) {
        request.log.error('llegó un webhook de Paddle pero falta PADDLE_WEBHOOK_SECRET');
        return reply.code(503).send({ error: 'billing_unavailable' });
      }

      const firma = verificarFirmaPaddle({
        cuerpoCrudo: request.body as Buffer,
        header: request.headers['paddle-signature'] as string | undefined,
        secreto: deps.webhookSecret,
      });
      if (!firma.valida) {
        request.log.warn({ motivo: firma.motivo }, 'webhook de Paddle con firma inválida');
        return reply.code(401).send({ error: 'firma_invalida' });
      }

      const parsed = EventoPaddle.safeParse(
        JSON.parse((request.body as Buffer).toString('utf8')),
      );
      if (!parsed.success) {
        request.log.warn({ issues: parsed.error.issues }, 'webhook de Paddle con forma inesperada');
        return reply.code(200).send({ ok: true, ignorado: 'forma_inesperada' });
      }
      const evento = parsed.data;
      const log = request.log.child({ eventId: evento.event_id, tipo: evento.event_type });

      // Idempotencia: Paddle reintenta y no se puede aplicar dos veces lo mismo.
      if (await deps.store.yaProcesado(evento.event_id)) {
        log.info('evento ya procesado, se ignora');
        return reply.code(200).send({ ok: true, ignorado: 'duplicado' });
      }

      const userIdPreliminar =
        typeof evento.data.custom_data?.['user_id'] === 'string'
          ? (evento.data.custom_data['user_id'] as string)
          : null;
      const teniaKit =
        userIdPreliminar !== null ? await deps.store.tieneKit(userIdPreliminar) : false;

      const accion = interpretarEvento(evento, deps.precios, { teniaKit });
      if (accion === null) {
        log.info('evento sin acción asociada');
        return reply.code(200).send({ ok: true, ignorado: 'sin_accion' });
      }

      if (accion.registrarCompra) {
        await deps.store.registrarCompra({
          userId: accion.userId,
          sku: accion.sku,
          eventId: evento.event_id,
          providerRef: accion.paddleSubscriptionId ?? evento.data.id ?? null,
          montoUsd: accion.montoUsd,
          moneda: accion.moneda,
          payload: evento,
        });
      }

      if (accion.plan !== null || accion.planStatus !== null || accion.paddleSubscriptionId !== null) {
        await deps.store.aplicarPlan({
          userId: accion.userId,
          plan: accion.plan,
          planStatus: accion.planStatus,
          expiraEn: accion.expiraEn,
          paddleCustomerId: accion.paddleCustomerId,
          paddleSubscriptionId: accion.paddleSubscriptionId,
        });
      }

      log.info({ userId: accion.userId, plan: accion.plan }, 'facturación aplicada');
      return reply.code(200).send({ ok: true });
    });
  });
}

import { z } from 'zod';

/**
 * Facturación con Paddle como Merchant of Record.
 *
 * Paddle es el vendedor legal: cobra en la moneda del comprador, se ocupa de los
 * impuestos de cada país y liquida a Uruguay. Por eso acá no hay tabla de precios
 * ni monedas: los precios viven en Paddle y su checkout los localiza solo.
 */

/** Qué se puede comprar. `kit` es pago único; `copiloto_mensual` es suscripción. */
export const Sku = z.enum(['kit', 'copiloto_mensual']);
export type Sku = z.infer<typeof Sku>;

/** Nivel de acceso vigente del usuario (columna `profiles.plan`). */
export const Plan = z.enum(['free', 'kit', 'copilot']);
export type Plan = z.infer<typeof Plan>;

/**
 * Estado de la suscripción, espejo del ciclo de vida de Paddle.
 * `trialing` cubre el primer mes de Copiloto que regala el Kit.
 */
export const PlanStatus = z.enum([
  'none',
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
]);
export type PlanStatus = z.infer<typeof PlanStatus>;

/**
 * Solicitud de plan pago mientras el cobro es manual: el usuario la pide desde
 * la app, se le manda un link de pago y se le activa el plan cuando paga.
 */
export const EstadoSolicitud = z.enum(['pendiente', 'activada', 'rechazada']);
export type EstadoSolicitud = z.infer<typeof EstadoSolicitud>;

export const SolicitudUpgrade = z.strictObject({
  id: z.string(),
  sku: Sku,
  estado: EstadoSolicitud,
  mensaje: z.string().nullable(),
  created_at: z.string(),
});
export type SolicitudUpgrade = z.infer<typeof SolicitudUpgrade>;

/** Body de POST /me/upgrade. */
export const NuevaSolicitud = z.strictObject({
  sku: Sku,
  mensaje: z.string().trim().max(500).optional(),
});
export type NuevaSolicitud = z.infer<typeof NuevaSolicitud>;

/** Body de PATCH /admin/usuarios/:id/plan. */
export const CambioPlanAdmin = z.strictObject({
  plan: Plan,
  /** Solicitud que se está resolviendo, si viene de una. */
  solicitudId: z.string().optional(),
});
export type CambioPlanAdmin = z.infer<typeof CambioPlanAdmin>;

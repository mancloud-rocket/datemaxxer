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

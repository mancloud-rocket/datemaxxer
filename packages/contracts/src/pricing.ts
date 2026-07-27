import { z } from 'zod';

/**
 * Precios por país. MercadoPago no convierte moneda: cada país se cobra en la
 * suya, con su propio monto. `XX` es el resto del mundo (USD, fuera de MercadoPago).
 */

export const Pais = z.enum(['AR', 'CL', 'UY', 'XX']);
export type Pais = z.infer<typeof Pais>;

export const Moneda = z.enum(['ARS', 'CLP', 'UYU', 'USD']);
export type Moneda = z.infer<typeof Moneda>;

/** Lo que se puede comprar. `kit` es pago único; `copiloto_mensual` es suscripción. */
export const Sku = z.enum(['kit', 'copiloto_mensual']);
export type Sku = z.infer<typeof Sku>;

export const Precio = z.strictObject({
  sku: Sku,
  pais: Pais,
  moneda: Moneda,
  monto: z.number().positive(),
});
export type Precio = z.infer<typeof Precio>;

export const ListaPrecios = z.strictObject({
  pais: Pais,
  precios: z.array(Precio),
});
export type ListaPrecios = z.infer<typeof ListaPrecios>;

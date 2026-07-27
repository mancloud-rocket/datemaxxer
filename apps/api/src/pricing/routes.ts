import type { FastifyInstance } from 'fastify';
import { Pais } from '@percentil/contracts';
import { ValidationError } from '../errors.js';
import type { PricingStore } from './store.js';

/**
 * GET /precios?pais=CL → precios de ese país en su moneda.
 *
 * Público a propósito: la página de planes los muestra antes de que el usuario
 * se registre. No expone nada sensible.
 */

export interface PricingRoutesDeps {
  pricingStore: PricingStore;
}

/**
 * País a partir del header de geolocalización del CDN, con fallback a XX
 * (resto del mundo, USD). Vercel manda `x-vercel-ip-country`; Cloudflare
 * `cf-ipcountry`. Si el país no es uno de los que cobramos localmente, cae a XX.
 */
export function paisDesdeHeaders(headers: Record<string, unknown>): Pais {
  const crudo =
    (typeof headers['x-vercel-ip-country'] === 'string' ? headers['x-vercel-ip-country'] : undefined) ??
    (typeof headers['cf-ipcountry'] === 'string' ? headers['cf-ipcountry'] : undefined);
  const parsed = Pais.safeParse(crudo?.toUpperCase());
  return parsed.success ? parsed.data : 'XX';
}

export function registerPricingRoutes(app: FastifyInstance, deps: PricingRoutesDeps): void {
  app.get('/precios', async (request) => {
    const { pais: pedido } = request.query as { pais?: string };

    let pais: Pais;
    if (pedido !== undefined && pedido !== '') {
      const parsed = Pais.safeParse(pedido.toUpperCase());
      if (!parsed.success) {
        throw new ValidationError(`País no soportado: ${pedido}. Válidos: ${Pais.options.join(', ')}`);
      }
      pais = parsed.data;
    } else {
      pais = paisDesdeHeaders(request.headers as Record<string, unknown>);
    }

    return { pais, precios: await deps.pricingStore.forPais(pais) };
  });
}

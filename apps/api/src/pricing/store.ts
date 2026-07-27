import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Moneda, Pais, Precio, Sku } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Precios por país en moneda local (tabla `percentil.precios`).
 * Viven en base, no en el código, porque la inflación y el tipo de cambio obligan
 * a revisarlos seguido y cambiar un precio no puede requerir un deploy.
 */

export interface PricingStore {
  /** Precios activos de un país. Vacío si el país no está configurado. */
  forPais(pais: Pais): Promise<Precio[]>;
}

/** Fallback en memoria (tests y dev sin Supabase). Refleja el seed de la migración. */
const SEMILLA: Precio[] = [
  { pais: 'CL', sku: 'kit', moneda: 'CLP', monto: 17900 },
  { pais: 'CL', sku: 'copiloto_mensual', moneda: 'CLP', monto: 12900 },
  { pais: 'AR', sku: 'kit', moneda: 'ARS', monto: 28900 },
  { pais: 'AR', sku: 'copiloto_mensual', moneda: 'ARS', monto: 19900 },
  { pais: 'UY', sku: 'kit', moneda: 'UYU', monto: 790 },
  { pais: 'UY', sku: 'copiloto_mensual', moneda: 'UYU', monto: 549 },
  { pais: 'XX', sku: 'kit', moneda: 'USD', monto: 19 },
  { pais: 'XX', sku: 'copiloto_mensual', moneda: 'USD', monto: 13 },
];

export class InMemoryPricingStore implements PricingStore {
  async forPais(pais: Pais): Promise<Precio[]> {
    return SEMILLA.filter((p) => p.pais === pais);
  }
}

interface PrecioRow {
  pais: Pais;
  sku: Sku;
  moneda: Moneda;
  monto: number | string;
}

export class SupabasePricingStore implements PricingStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async forPais(pais: Pais): Promise<Precio[]> {
    const { data, error } = await this.db
      .from('precios')
      .select('pais, sku, moneda, monto')
      .eq('pais', pais)
      .eq('activo', true)
      .returns<PrecioRow[]>();
    if (error) throw new AppError('store', `Supabase select precios falló: ${error.message}`, 500);
    // numeric de Postgres llega como string por precisión: se normaliza acá.
    return (data ?? []).map((r) => ({ ...r, monto: Number(r.monto) }));
  }
}

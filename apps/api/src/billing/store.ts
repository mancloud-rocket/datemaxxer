import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Plan, PlanStatus, Sku } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Persistencia de facturación: compras registradas y estado del plan.
 * `provider_event_id` es UNIQUE en base: los webhooks se reintentan y un mismo
 * evento no puede aplicarse dos veces.
 */

export interface CompraARegistrar {
  userId: string;
  sku: Sku | null;
  eventId: string;
  providerRef: string | null;
  montoUsd: number | null;
  moneda: string | null;
  payload: unknown;
}

export interface CambioDePlan {
  userId: string;
  plan: Plan | null;
  planStatus: PlanStatus | null;
  expiraEn: Date | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
}

export interface BillingStore {
  /** true si el evento ya se procesó (idempotencia de webhooks). */
  yaProcesado(eventId: string): Promise<boolean>;
  /** ¿Compró el Kit alguna vez? Define a qué plan vuelve al cancelar el Copiloto. */
  tieneKit(userId: string): Promise<boolean>;
  registrarCompra(compra: CompraARegistrar): Promise<void>;
  aplicarPlan(cambio: CambioDePlan): Promise<void>;
}

export class InMemoryBillingStore implements BillingStore {
  readonly eventos = new Set<string>();
  readonly compras: CompraARegistrar[] = [];
  readonly planes = new Map<string, CambioDePlan>();

  async yaProcesado(eventId: string): Promise<boolean> {
    return this.eventos.has(eventId);
  }

  async tieneKit(userId: string): Promise<boolean> {
    return this.compras.some((c) => c.userId === userId && c.sku === 'kit');
  }

  async registrarCompra(compra: CompraARegistrar): Promise<void> {
    if (this.eventos.has(compra.eventId)) return;
    this.eventos.add(compra.eventId);
    this.compras.push(compra);
  }

  async aplicarPlan(cambio: CambioDePlan): Promise<void> {
    const previo = this.planes.get(cambio.userId);
    this.planes.set(cambio.userId, { ...previo, ...cambio });
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

export class SupabaseBillingStore implements BillingStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async yaProcesado(eventId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('purchases')
      .select('id')
      .eq('provider_event_id', eventId)
      .maybeSingle();
    if (error) throw storeError('select purchases', error.message);
    return data !== null;
  }

  async tieneKit(userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('sku', 'kit')
      .limit(1)
      .maybeSingle();
    if (error) throw storeError('select purchases (kit)', error.message);
    return data !== null;
  }

  async registrarCompra(compra: CompraARegistrar): Promise<void> {
    // `purchases.user_id` tiene FK a profiles: alguien puede comprar antes de
    // haber hecho ninguna auditoría, y entonces su fila de perfil no existe.
    await this.asegurarPerfil(compra.userId);

    const { error } = await this.db.from('purchases').insert({
      user_id: compra.userId,
      sku: compra.sku,
      provider: 'paddle',
      provider_event_id: compra.eventId,
      provider_ref: compra.providerRef,
      amount_usd: compra.montoUsd,
      moneda: compra.moneda,
      status: 'completed',
      payload: compra.payload,
    });
    // 23505 = unique_violation: el evento ya estaba registrado (webhook reintentado).
    // Es el resultado esperado, no un error.
    if (error && error.code !== '23505') {
      throw storeError('insert purchases', error.message);
    }
  }

  /** Garantiza la fila de perfil (FK de purchases y destino del plan). */
  private async asegurarPerfil(userId: string): Promise<void> {
    const { error } = await this.db.from('profiles').upsert({ id: userId }, { ignoreDuplicates: true });
    if (error) throw storeError('upsert profiles (alta)', error.message);
  }

  async aplicarPlan(cambio: CambioDePlan): Promise<void> {
    const fila: Record<string, unknown> = { id: cambio.userId };
    if (cambio.plan !== null) fila.plan = cambio.plan;
    if (cambio.planStatus !== null) fila.plan_status = cambio.planStatus;
    if (cambio.expiraEn !== null) fila.plan_expires_at = cambio.expiraEn.toISOString();
    if (cambio.paddleCustomerId !== null) fila.paddle_customer_id = cambio.paddleCustomerId;
    if (cambio.paddleSubscriptionId !== null) {
      fila.paddle_subscription_id = cambio.paddleSubscriptionId;
    }
    if (Object.keys(fila).length === 1) return; // solo el id: nada que cambiar

    const { error } = await this.db.from('profiles').upsert(fila);
    if (error) throw storeError('upsert profiles (plan)', error.message);
  }
}

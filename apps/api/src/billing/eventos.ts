import { z } from 'zod';
import type { Plan, PlanStatus, Sku } from '@percentil/contracts';

/**
 * Traducción de un evento de Paddle a "qué hay que aplicar en nuestra base".
 *
 * Función pura y sin I/O a propósito: es la lógica de negocio del cobro (quién
 * queda con qué plan y hasta cuándo) y conviene poder testearla exhaustivamente
 * sin base ni red.
 */

/**
 * Esquema deliberadamente permisivo: el payload es de un tercero y Paddle agrega
 * campos seguido. Solo se exige lo que realmente usamos; el resto se ignora.
 */
const ItemPaddle = z.object({ price: z.object({ id: z.string() }).partial().optional() });

export const EventoPaddle = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  data: z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    customer_id: z.string().nullish(),
    subscription_id: z.string().nullish(),
    custom_data: z.record(z.unknown()).nullish(),
    items: z.array(ItemPaddle).optional(),
    current_billing_period: z.object({ ends_at: z.string().nullish() }).nullish(),
    details: z
      .object({
        totals: z
          .object({ grand_total: z.string().nullish(), currency_code: z.string().nullish() })
          .nullish(),
      })
      .nullish(),
  }),
});
export type EventoPaddle = z.infer<typeof EventoPaddle>;

export interface MapaPrecios {
  /** price id de Paddle del Kit (pago único). */
  kit: string | undefined;
  /** price id de Paddle del Copiloto (suscripción). */
  copiloto: string | undefined;
}

/** Lo que hay que aplicar. `null` = evento que no nos incumbe (se responde 200 igual). */
export interface AccionFacturacion {
  userId: string;
  sku: Sku | null;
  plan: Plan | null;
  planStatus: PlanStatus | null;
  expiraEn: Date | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  /** Registrar fila en `purchases` (solo cuando hubo plata de por medio). */
  registrarCompra: boolean;
  montoUsd: number | null;
  moneda: string | null;
}

/** Estados de suscripción de Paddle → los nuestros. */
const ESTADOS: Record<string, PlanStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  paused: 'paused',
  canceled: 'canceled',
};

/** Con estos estados el usuario TIENE acceso pago. */
const ESTADOS_CON_ACCESO = new Set<PlanStatus>(['active', 'trialing', 'past_due']);

function skuDesdeItems(evento: EventoPaddle, precios: MapaPrecios): Sku | null {
  const ids = (evento.data.items ?? []).map((i) => i.price?.id).filter((v): v is string => !!v);
  if (precios.copiloto !== undefined && ids.includes(precios.copiloto)) return 'copiloto_mensual';
  if (precios.kit !== undefined && ids.includes(precios.kit)) return 'kit';
  return null;
}

/** El user_id viaja en `custom_data`, que mandamos nosotros al abrir el checkout. */
function userIdDe(evento: EventoPaddle): string | null {
  const raw = evento.data.custom_data?.['user_id'];
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** Paddle manda los totales en la unidad mínima (centavos) y como string. */
function montoDe(evento: EventoPaddle): { monto: number | null; moneda: string | null } {
  const totals = evento.data.details?.totals;
  const bruto = totals?.grand_total;
  const monto = typeof bruto === 'string' && bruto !== '' ? Number(bruto) / 100 : null;
  return {
    monto: monto !== null && Number.isFinite(monto) ? monto : null,
    moneda: totals?.currency_code ?? null,
  };
}

export function interpretarEvento(
  evento: EventoPaddle,
  precios: MapaPrecios,
  opciones: { teniaKit: boolean },
): AccionFacturacion | null {
  const userId = userIdDe(evento);
  if (userId === null) return null; // sin dueño no hay nada que aplicar

  const sku = skuDesdeItems(evento, precios);
  const { monto, moneda } = montoDe(evento);
  const base = {
    userId,
    sku,
    montoUsd: monto,
    moneda,
    paddleCustomerId: evento.data.customer_id ?? null,
  };

  if (evento.event_type.startsWith('subscription.')) {
    const estado = ESTADOS[evento.data.status ?? ''] ?? null;
    if (estado === null) return null;

    const conAcceso = ESTADOS_CON_ACCESO.has(estado);
    return {
      ...base,
      sku: sku ?? 'copiloto_mensual',
      // Si pierde el Copiloto vuelve al Kit si alguna vez lo compró; si no, a free.
      plan: conAcceso ? 'copilot' : opciones.teniaKit ? 'kit' : 'free',
      planStatus: estado,
      // Cancelada pero con período pago en curso: mantiene acceso hasta el final.
      expiraEn: evento.data.current_billing_period?.ends_at
        ? new Date(evento.data.current_billing_period.ends_at)
        : null,
      paddleSubscriptionId: evento.data.id ?? null,
      registrarCompra: false, // la plata la registra el transaction.completed
    };
  }

  if (evento.event_type === 'transaction.completed') {
    // Los cobros recurrentes también disparan este evento: ahí el plan lo maneja
    // el evento de suscripción, acá solo se registra el movimiento.
    const esDeSuscripcion =
      evento.data.subscription_id != null || sku === 'copiloto_mensual';
    return {
      ...base,
      plan: esDeSuscripcion ? null : sku === 'kit' ? 'kit' : null,
      planStatus: null,
      expiraEn: null,
      paddleSubscriptionId: evento.data.subscription_id ?? null,
      registrarCompra: true,
    };
  }

  return null; // evento que no nos incumbe
}

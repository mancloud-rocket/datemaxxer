import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryBillingStore } from './store.js';

const SECRETO = 'pdl_ntfset_secreto_de_prueba_1234';
const PRICE_KIT = 'pri_kit_123';
const PRICE_COPILOTO = 'pri_copiloto_456';
const USER = '11111111-2222-3333-4444-555555555555';

const TEST_ENV = {
  NODE_ENV: 'test',
  SUPABASE_URL: undefined,
  SUPABASE_JWT_SECRET: 'percentil-test-secret-32-chars-min',
  ANTHROPIC_API_KEY: undefined,
  RATE_LIMIT_MAX: '1000',
  PADDLE_WEBHOOK_SECRET: SECRETO,
  PADDLE_PRICE_KIT: PRICE_KIT,
  PADDLE_PRICE_COPILOTO: PRICE_COPILOTO,
};

function evento(tipo: string, data: Record<string, unknown>, eventId = `evt_${Math.random()}`) {
  return JSON.stringify({ event_id: eventId, event_type: tipo, data });
}

async function enviar(app: FastifyInstance, cuerpo: string, opts: { firmar?: boolean } = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac('sha256', SECRETO).update(`${ts}:${cuerpo}`).digest('hex');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.firmar !== false) headers['paddle-signature'] = `ts=${ts};h1=${h1}`;
  return app.inject({ method: 'POST', url: '/webhooks/paddle', payload: cuerpo, headers });
}

describe('webhook de Paddle', () => {
  let app: FastifyInstance;
  let store: InMemoryBillingStore;

  beforeEach(async () => {
    store = new InMemoryBillingStore();
    app = await buildApp(loadEnv(TEST_ENV), { billingStore: store });
  });

  it('RECHAZA un webhook sin firma (si no, cualquiera se regala un plan)', async () => {
    const cuerpo = evento('transaction.completed', {
      id: 'txn_1', custom_data: { user_id: USER }, items: [{ price: { id: PRICE_KIT } }],
    });
    const res = await enviar(app, cuerpo, { firmar: false });
    expect(res.statusCode).toBe(401);
    expect(store.compras).toHaveLength(0);
    expect(store.planes.size).toBe(0);
  });

  it('RECHAZA un cuerpo adulterado después de firmar', async () => {
    const original = evento('transaction.completed', {
      id: 'txn_1', custom_data: { user_id: USER }, items: [{ price: { id: PRICE_KIT } }],
    });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = createHmac('sha256', SECRETO).update(`${ts}:${original}`).digest('hex');
    const adulterado = original.replace(USER, '99999999-9999-9999-9999-999999999999');
    const res = await app.inject({
      method: 'POST', url: '/webhooks/paddle', payload: adulterado,
      headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${h1}` },
    });
    expect(res.statusCode).toBe(401);
    expect(store.planes.size).toBe(0);
  });

  it('compra del Kit → registra la compra y deja el plan en kit', async () => {
    const cuerpo = evento('transaction.completed', {
      id: 'txn_kit', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_KIT } }],
      details: { totals: { grand_total: '1900', currency_code: 'USD' } },
    });
    const res = await enviar(app, cuerpo);
    expect(res.statusCode).toBe(200);
    expect(store.compras).toHaveLength(1);
    expect(store.compras[0]).toMatchObject({ userId: USER, sku: 'kit', montoUsd: 19, moneda: 'USD' });
    expect(store.planes.get(USER)?.plan).toBe('kit');
  });

  it('suscripción activa → plan copilot con su fecha de vencimiento', async () => {
    const fin = '2026-09-01T00:00:00Z';
    const cuerpo = evento('subscription.activated', {
      id: 'sub_1', status: 'active', customer_id: 'ctm_1', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
      current_billing_period: { ends_at: fin },
    });
    await enviar(app, cuerpo);
    const plan = store.planes.get(USER);
    expect(plan?.plan).toBe('copilot');
    expect(plan?.planStatus).toBe('active');
    expect(plan?.expiraEn?.toISOString()).toBe(new Date(fin).toISOString());
    expect(plan?.paddleSubscriptionId).toBe('sub_1');
  });

  it('el trial del Kit también da acceso (plan copilot, estado trialing)', async () => {
    const cuerpo = evento('subscription.trialing', {
      id: 'sub_2', status: 'trialing', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
    });
    await enviar(app, cuerpo);
    expect(store.planes.get(USER)).toMatchObject({ plan: 'copilot', planStatus: 'trialing' });
  });

  it('al cancelar vuelve a kit si lo había comprado', async () => {
    await enviar(app, evento('transaction.completed', {
      id: 'txn_kit', custom_data: { user_id: USER }, items: [{ price: { id: PRICE_KIT } }],
    }));
    await enviar(app, evento('subscription.canceled', {
      id: 'sub_3', status: 'canceled', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
    }));
    expect(store.planes.get(USER)).toMatchObject({ plan: 'kit', planStatus: 'canceled' });
  });

  it('al cancelar sin Kit previo vuelve a free', async () => {
    await enviar(app, evento('subscription.canceled', {
      id: 'sub_4', status: 'canceled', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
    }));
    expect(store.planes.get(USER)?.plan).toBe('free');
  });

  it('impago (past_due) NO corta el acceso de inmediato', async () => {
    await enviar(app, evento('subscription.updated', {
      id: 'sub_5', status: 'past_due', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
    }));
    expect(store.planes.get(USER)).toMatchObject({ plan: 'copilot', planStatus: 'past_due' });
  });

  it('es idempotente: el mismo evento repetido no cobra dos veces', async () => {
    const cuerpo = evento('transaction.completed', {
      id: 'txn_dup', custom_data: { user_id: USER }, items: [{ price: { id: PRICE_KIT } }],
      details: { totals: { grand_total: '1900', currency_code: 'USD' } },
    }, 'evt_siempre_el_mismo');
    const primera = await enviar(app, cuerpo);
    const segunda = await enviar(app, cuerpo);
    expect(primera.statusCode).toBe(200);
    expect(segunda.statusCode).toBe(200);
    expect(store.compras).toHaveLength(1); // no se duplicó
  });

  it('un evento sin user_id se ignora sin romper', async () => {
    const res = await enviar(app, evento('transaction.completed', {
      id: 'txn_sin_dueno', items: [{ price: { id: PRICE_KIT } }],
    }));
    expect(res.statusCode).toBe(200);
    expect(store.compras).toHaveLength(0);
  });

  it('un tipo de evento que no manejamos responde 200 (Paddle no debe reintentar)', async () => {
    const res = await enviar(app, evento('report.created', { id: 'rpt_1' }));
    expect(res.statusCode).toBe(200);
  });

  it('el cobro recurrente registra plata pero no toca el plan', async () => {
    const res = await enviar(app, evento('transaction.completed', {
      id: 'txn_recurrente', subscription_id: 'sub_9', custom_data: { user_id: USER },
      items: [{ price: { id: PRICE_COPILOTO } }],
      details: { totals: { grand_total: '1300', currency_code: 'USD' } },
    }));
    expect(res.statusCode).toBe(200);
    expect(store.compras).toHaveLength(1);
    expect(store.planes.get(USER)?.plan).toBeNull();
  });

  it('sin secreto configurado responde 503, nunca acepta sin verificar', async () => {
    const sinSecreto = await buildApp(
      loadEnv({ ...TEST_ENV, PADDLE_WEBHOOK_SECRET: undefined }),
      { billingStore: new InMemoryBillingStore() },
    );
    const res = await enviar(sinSecreto, evento('transaction.completed', { id: 'x' }));
    expect(res.statusCode).toBe(503);
    await sinSecreto.close();
  });

  it('el parser de cuerpo crudo NO rompe las otras rutas JSON', async () => {
    // Regresión: el content-type parser del webhook está encapsulado; si se
    // escapara del scope, PATCH /me dejaría de recibir el body parseado.
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' }).setSubject(USER).setExpirationTime('5m')
      .sign(new TextEncoder().encode('percentil-test-secret-32-chars-min'));
    const res = await app.inject({
      method: 'PATCH', url: '/me',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { region: 'chileno' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ region: 'chileno' });
  });
});

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ListaPrecios } from '@percentil/contracts';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { paisDesdeHeaders } from './routes.js';

const TEST_ENV = {
  NODE_ENV: 'test',
  SUPABASE_URL: undefined,
  SUPABASE_JWT_SECRET: 'percentil-test-secret-32-chars-min',
  ANTHROPIC_API_KEY: undefined,
  RATE_LIMIT_MAX: '1000',
};

describe('GET /precios', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv(TEST_ENV));
  });

  afterAll(async () => {
    await app.close();
  });

  it('es público: no requiere token (la página de planes lo muestra sin login)', async () => {
    const res = await app.inject({ method: 'GET', url: '/precios?pais=CL' });
    expect(res.statusCode).toBe(200);
  });

  it('devuelve los precios del país en su moneda local', async () => {
    const res = await app.inject({ method: 'GET', url: '/precios?pais=CL' });
    const body = ListaPrecios.parse(res.json()); // valida contra el contrato
    expect(body.pais).toBe('CL');
    expect(body.precios.every((p) => p.moneda === 'CLP')).toBe(true);
    expect(body.precios.map((p) => p.sku).sort()).toEqual(['copiloto_mensual', 'kit']);
  });

  it('cada país cobra en SU moneda (MercadoPago no convierte)', async () => {
    const esperado: Record<string, string> = { AR: 'ARS', CL: 'CLP', UY: 'UYU', XX: 'USD' };
    for (const [pais, moneda] of Object.entries(esperado)) {
      const res = await app.inject({ method: 'GET', url: `/precios?pais=${pais}` });
      const body = ListaPrecios.parse(res.json());
      expect(body.precios.every((p) => p.moneda === moneda)).toBe(true);
      expect(body.precios.length).toBeGreaterThan(0);
    }
  });

  it('acepta el país en minúscula', async () => {
    const res = await app.inject({ method: 'GET', url: '/precios?pais=uy' });
    expect((res.json() as { pais: string }).pais).toBe('UY');
  });

  it('país inválido → 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/precios?pais=BR' });
    expect(res.statusCode).toBe(400);
  });

  it('sin país explícito lo deduce del header de geo del CDN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/precios',
      headers: { 'x-vercel-ip-country': 'CL' },
    });
    expect((res.json() as { pais: string }).pais).toBe('CL');
  });

  it('un país que no cobramos localmente cae a XX (USD)', async () => {
    expect(paisDesdeHeaders({ 'x-vercel-ip-country': 'BR' })).toBe('XX');
    expect(paisDesdeHeaders({})).toBe('XX');
    expect(paisDesdeHeaders({ 'cf-ipcountry': 'ar' })).toBe('AR');
  });
});

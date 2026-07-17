import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const TEST_SECRET = 'percentil-test-secret-32-chars-min';

async function signToken(sub: string | undefined, secret = TEST_SECRET): Promise<string> {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m');
  if (sub !== undefined) jwt.setSubject(sub);
  return jwt.sign(new TextEncoder().encode(secret));
}

describe('API base', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(
      loadEnv({
        NODE_ENV: 'test',
        SUPABASE_URL: undefined,
        SUPABASE_JWT_SECRET: TEST_SECRET,
        RATE_LIMIT_MAX: '5',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 200 con versión de contratos', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', contracts: '1.0' });
  });

  it('GET /me sin token → 401 tipado', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('auth');
  });

  it('GET /me con token inválido → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await signToken('user-1', 'otro-secret-que-no-es-el-nuestro')}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me con token sin sub → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await signToken(undefined)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me con JWT válido → 200 con userId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await signToken('11111111-2222-3333-4444-555555555555')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: '11111111-2222-3333-4444-555555555555' });
  });

  it('rate limit: la request N+1 dentro de la ventana → 429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      results.push(res.statusCode);
    }
    expect(results).toContain(429);
  });

  it('ruta inexistente → 404 con payload de error estable', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('message');
  });
});

describe('env', () => {
  it('sin Supabase configurado la API bootea pero /me responde 503', async () => {
    const app = await buildApp(
      loadEnv({ NODE_ENV: 'test', SUPABASE_URL: undefined, SUPABASE_JWT_SECRET: undefined }),
    );
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/me' });
    expect(me.statusCode).toBe(503);
    expect((me.json() as { error: string }).error).toBe('auth_unavailable');
    await app.close();
  });
});

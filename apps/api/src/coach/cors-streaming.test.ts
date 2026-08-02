import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { buildCoachEngine, type CoachClient } from '../engines/coach.js';
import { InMemoryCoachStore } from './store.js';

/**
 * Regresión de un bug real (2-ago-2026): el coach funcionaba perfecto del lado
 * del servidor y el navegador mostraba "se cortó la respuesta".
 *
 * Causa: `reply.hijack()` saca la respuesta del ciclo de Fastify, así que
 * `writeHead` manda solo las cabeceras que se le pasan. Las de CORS que había
 * puesto el plugin se perdían, y como la web vive en otro dominio que la API, el
 * navegador bloqueaba la lectura entera.
 *
 * Estos tests levantan un servidor DE VERDAD y hablan por HTTP con un `Origin`,
 * porque `app.inject()` no es un navegador y no aplica CORS: la suite completa
 * pasaba en verde con el bug en producción.
 */

const SECRET = 'secreto-de-test-suficientemente-largo';
const USUARIO = '44444444-4444-4444-4444-444444444444';
const ORIGEN = 'https://datemaxxer.vercel.app';

const clienteFalso = (): CoachClient => ({
  async *stream() {
    yield 'Primero ';
    yield 'lo primero.';
  },
});

describe('streaming del coach por HTTP real (con Origin)', () => {
  let app: FastifyInstance;
  let base: string;
  let token: string;

  beforeAll(async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      CORS_ORIGINS: ORIGEN,
    });
    app = await buildApp(env, {
      coachStore: new InMemoryCoachStore(),
      coachEngine: buildCoachEngine({ client: clienteFalso() }),
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const dir = app.server.address();
    if (dir === null || typeof dir === 'string') throw new Error('sin puerto');
    base = `http://127.0.0.1:${dir.port}`;

    token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USUARIO)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
  });

  afterAll(async () => {
    await app.close();
  });

  const mandar = () =>
    fetch(`${base}/coach/mensaje`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin: ORIGEN,
      },
      body: JSON.stringify({ texto: 'me ghostearon otra vez' }),
    });

  it('la respuesta en streaming trae las cabeceras de CORS', async () => {
    // Sin esto el navegador bloquea la lectura y el usuario ve un error aunque
    // el servidor haya contestado bien y guardado la conversación.
    const res = await mandar();
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN);
  });

  it('sigue siendo SSE sin bufferear', async () => {
    const res = await mandar();
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
  });

  it('el cuerpo llega completo y termina con el evento de fin', async () => {
    const res = await mandar();
    const cuerpo = await res.text();
    expect(cuerpo).toContain('"t":"Primero "');
    expect(cuerpo).toContain('"t":"lo primero."');
    expect(cuerpo).toContain('"fin":true');
  });

  it('el preflight del navegador pasa', async () => {
    const res = await fetch(`${base}/coach/mensaje`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGEN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN);
  });
});

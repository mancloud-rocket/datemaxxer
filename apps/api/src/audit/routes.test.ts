import { setImmediate as flushTasks } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditResult } from '@percentil/contracts';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import type { AuditEngine } from '../engines/audit.js';

const TEST_SECRET = 'percentil-test-secret-32-chars-min';

const TEST_ENV = {
  NODE_ENV: 'test',
  SUPABASE_URL: undefined,
  SUPABASE_JWT_SECRET: TEST_SECRET,
  ANTHROPIC_API_KEY: undefined,
  RATE_LIMIT_MAX: '1000',
  AUDIT_RATE_LIMIT_MAX: '1000',
  AUDIT_FREE_LIMIT: '1',
};

async function token(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(TEST_SECRET));
}

const FAKE_RESULT: AuditResult = {
  version: '1.0',
  arquetipo_detectado: { nombre: 'viajero', confianza: 0.72 },
  score_coherencia: 41,
  lectura_200ms: 'Señales compitiendo.',
  evidencia_por_foto: [
    { foto: 1, dice: 'profesional', señales: ['camisa'], calidad_tecnica: 62 },
  ],
  gap_analysis: null,
  plan_de_fotos: { conservar: [1], reemplazar: [], orden_sugerido: [1], briefs_faltantes: [] },
  quick_wins: ['probar otra primera foto'],
};

function fakeEngine(behavior: 'ok' | 'fail' = 'ok'): AuditEngine {
  return {
    run: async (input, hooks) => {
      hooks?.onProgress?.({ fotos_analizadas: 0, total: input.photos.length });
      if (behavior === 'fail') throw new Error('boom del motor');
      hooks?.onProgress?.({ fotos_analizadas: input.photos.length, total: input.photos.length });
      return FAKE_RESULT;
    },
  };
}

// PNG 1x1 válido
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface Part {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  buffer?: Buffer;
}

function multipartPayload(parts: Part[]): { payload: Buffer; contentType: string } {
  const boundary = '----percentil-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
        part.buffer ?? Buffer.alloc(0),
      );
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function photosParts(n: number): Part[] {
  return Array.from({ length: n }, (_, i) => ({
    name: 'photos',
    filename: `foto-${i + 1}.png`,
    contentType: 'image/png',
    buffer: TINY_PNG,
  }));
}

const BASE_FIELDS: Part[] = [
  { name: 'bio', value: 'me gusta viajar' },
  { name: 'region', value: 'rioplatense' },
];

async function postAudit(app: FastifyInstance, sub: string, parts: Part[]) {
  const { payload, contentType } = multipartPayload(parts);
  return app.inject({
    method: 'POST',
    url: '/audit',
    payload,
    headers: { 'content-type': contentType, authorization: `Bearer ${await token(sub)}` },
  });
}

describe('rutas /audit (con auth)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine() });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /audit sin token → 401', async () => {
    const { payload, contentType } = multipartPayload([...photosParts(4), ...BASE_FIELDS]);
    const res = await app.inject({
      method: 'POST',
      url: '/audit',
      payload,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(401);
  });

  it('happy path: 202 → polling done → /me/audit la devuelve', async () => {
    const sub = 'user-happy';
    const res = await postAudit(app, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(202);
    const { audit_id } = res.json() as { audit_id: string };

    await flushTasks();
    const auth = { authorization: `Bearer ${await token(sub)}` };
    const poll = await app.inject({ method: 'GET', url: `/audit/${audit_id}`, headers: auth });
    expect(poll.statusCode).toBe(200);
    const body = poll.json() as { status: string; progress: unknown; result: unknown };
    expect(body.status).toBe('done');
    expect(body.progress).toEqual({ fotos_analizadas: 4, total: 4 });
    expect(body.result).toEqual(FAKE_RESULT);

    const mine = await app.inject({ method: 'GET', url: '/me/audit', headers: auth });
    expect((mine.json() as { audit: { audit_id: string } }).audit.audit_id).toBe(audit_id);
  });

  it('límite 1 por cuenta: la segunda auditoría → 409 limit_reached', async () => {
    const sub = 'user-limite';
    const first = await postAudit(app, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(first.statusCode).toBe(202);
    await flushTasks();
    const second = await postAudit(app, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toBe('limit_reached');
  });

  it('una auditoría fallida NO quema el cupo gratis', async () => {
    const failApp = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine('fail') });
    const sub = 'user-fail';
    const res = await postAudit(failApp, sub, [...photosParts(4), ...BASE_FIELDS]);
    const { audit_id } = res.json() as { audit_id: string };
    await flushTasks();
    const poll = await failApp.inject({
      method: 'GET',
      url: `/audit/${audit_id}`,
      headers: { authorization: `Bearer ${await token(sub)}` },
    });
    expect((poll.json() as { status: string }).status).toBe('error');
    // sigue teniendo cupo: el segundo intento se acepta
    const retry = await postAudit(failApp, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(retry.statusCode).toBe(202);
    await failApp.close();
  });

  it('otro usuario no puede ver mi auditoría → 404', async () => {
    const res = await postAudit(app, 'user-a', [...photosParts(4), ...BASE_FIELDS]);
    const { audit_id } = res.json() as { audit_id: string };
    await flushTasks();
    const spy = await app.inject({
      method: 'GET',
      url: `/audit/${audit_id}`,
      headers: { authorization: `Bearer ${await token('user-b')}` },
    });
    expect(spy.statusCode).toBe(404);
  });

  it('GET /me/audit sin auditorías → {audit: null}', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/audit',
      headers: { authorization: `Bearer ${await token('user-nuevo')}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { audit: null }).audit).toBeNull();
  });

  it('rechaza menos de 4 fotos con 400', async () => {
    const res = await postAudit(app, 'user-pocas', [...photosParts(2), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(400);
  });

  it('rechaza mimetype no soportado con 400', async () => {
    const res = await postAudit(app, 'user-gif', [
      ...photosParts(3),
      { name: 'photos', filename: 'malo.gif', contentType: 'image/gif', buffer: TINY_PNG },
      ...BASE_FIELDS,
    ]);
    expect(res.statusCode).toBe(400);
  });

  it('GET /audit/:id inexistente → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/audit/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${await token('user-x')}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('sin ANTHROPIC_API_KEY ni engine inyectado → 503 tipado', async () => {
    const bareApp = await buildApp(loadEnv(TEST_ENV));
    const res = await postAudit(bareApp, 'user-sin-engine', [...photosParts(4), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe('engine_unavailable');
    await bareApp.close();
  });
});

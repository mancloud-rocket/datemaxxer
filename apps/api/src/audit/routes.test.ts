import { setImmediate as flushTasks } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditResult } from '@percentil/contracts';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import type { AuditEngine } from '../engines/audit.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { InMemoryAuditStore, QuotaRpcMissingError, type AuditStore } from './store.js';

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

  it('plan no-free (kit/copilot) → sin cupo, la segunda auditoría también se acepta', async () => {
    const profileStore = new InMemoryProfileStore();
    const sub = 'user-copilot';
    await profileStore.setPlan(sub, 'copilot');
    const plusApp = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), profileStore });
    const first = await postAudit(plusApp, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(first.statusCode).toBe(202);
    await flushTasks();
    const second = await postAudit(plusApp, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(second.statusCode).toBe(202);
    await flushTasks();
    const third = await postAudit(plusApp, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(third.statusCode).toBe(202);
    await plusApp.close();
  });

  it('dos auditorías concurrentes NO consumen dos veces el cupo (carrera)', async () => {
    // El bug: contar y crear en dos pasos dejaba pasar a las dos requests.
    const store = new InMemoryAuditStore();
    const app2 = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), auditStore: store });
    const sub = 'user-carrera';
    const [a, b] = await Promise.all([
      postAudit(app2, sub, [...photosParts(4), ...BASE_FIELDS]),
      postAudit(app2, sub, [...photosParts(4), ...BASE_FIELDS]),
    ]);
    const codigos = [a.statusCode, b.statusCode].sort();
    expect(codigos).toEqual([202, 409]); // una entra, la otra rebota
    await flushTasks();
    expect((await store.listForUser(sub)).length).toBe(1);
    await app2.close();
  });

  it('una auditoría colgada por un reinicio NO quema el cupo para siempre', async () => {
    // Simula el caso real: el proceso murió a mitad (deploy / sleep de Render)
    // y la fila quedó en 'analyzing'. Antes esto dejaba al usuario sin su gratis.
    const store = new InMemoryAuditStore();
    const sub = 'user-huerfano';
    await store.create({
      id: 'auditoria-colgada',
      userId: sub,
      region: 'neutro',
      status: 'analyzing',
      progress: { fotos_analizadas: 0, total: 4 },
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // hace una hora
    });
    expect(await store.countForUser(sub)).toBe(1); // consume cupo

    const app2 = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), auditStore: store });
    const res = await postAudit(app2, sub, [...photosParts(4), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(202); // el cupo se liberó, puede reintentar

    const colgada = await store.get('auditoria-colgada');
    expect(colgada?.status).toBe('error');
    await app2.close();
  });

  it('failStale no toca auditorías recientes ni terminadas', async () => {
    const store = new InMemoryAuditStore();
    await store.create({
      id: 'recien-arrancada', userId: 'u1', region: 'neutro', status: 'analyzing',
      progress: { fotos_analizadas: 0, total: 4 }, createdAt: new Date(),
    });
    await store.create({
      id: 'vieja-pero-lista', userId: 'u1', region: 'neutro', status: 'done',
      progress: { fotos_analizadas: 4, total: 4 }, createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(await store.failStale(15 * 60 * 1000)).toBe(0);
    expect((await store.get('recien-arrancada'))?.status).toBe('analyzing');
    expect((await store.get('vieja-pero-lista'))?.status).toBe('done');
  });

  it('si el motor se cuelga, la auditoría termina en error y no queda analizando', async () => {
    const colgado: AuditEngine = { run: () => new Promise(() => {}) }; // nunca resuelve
    const store = new InMemoryAuditStore();
    const app2 = await buildApp(
      loadEnv({ ...TEST_ENV, AUDIT_TIMEOUT_MS: '40' }),
      { auditEngine: colgado, auditStore: store },
    );
    const res = await postAudit(app2, 'user-timeout', [...photosParts(4), ...BASE_FIELDS]);
    const { audit_id } = res.json() as { audit_id: string };
    await new Promise((r) => setTimeout(r, 120));
    expect((await store.get(audit_id))?.status).toBe('error');
    await app2.close();
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

  it('si falta la migración del cupo atómico, sigue funcionando (camino viejo)', async () => {
    // Protege el orden de deploy: código nuevo contra base sin migrar no debe
    // dejar la app sin auditorías.
    const store = new InMemoryAuditStore();
    const sinRpc: AuditStore = {
      ...store,
      create: (r) => store.create(r),
      get: (id) => store.get(id),
      update: (id, p) => store.update(id, p),
      countForUser: (u) => store.countForUser(u),
      latestForUser: (u) => store.latestForUser(u),
      listForUser: (u) => store.listForUser(u),
      failStale: (ms) => store.failStale(ms),
      createWithQuota: () => Promise.reject(new QuotaRpcMissingError()),
    };
    const app2 = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), auditStore: sinRpc });
    const res = await postAudit(app2, 'user-sin-migracion', [...photosParts(4), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(202);
    await flushTasks();
    // y el cupo se sigue respetando por el camino viejo
    const segunda = await postAudit(app2, 'user-sin-migracion', [...photosParts(4), ...BASE_FIELDS]);
    expect(segunda.statusCode).toBe(409);
    await app2.close();
  });

  it('archiva las fotos originales con la convención de path por usuario', async () => {
    const guardadas: Array<{ auditId: string; userId: string; n: number }> = [];
    const archive = {
      save: async (p: { auditId: string; userId: string; photos: unknown[] }) => {
        guardadas.push({ auditId: p.auditId, userId: p.userId, n: p.photos.length });
      },
    };
    const app2 = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), photoArchive: archive });
    const res = await postAudit(app2, 'user-archivo', [...photosParts(5), ...BASE_FIELDS]);
    const { audit_id } = res.json() as { audit_id: string };
    await flushTasks();
    expect(guardadas).toEqual([{ auditId: audit_id, userId: 'user-archivo', n: 5 }]);
    await app2.close();
  });

  it('si el archivado falla, la auditoría igual termina bien', async () => {
    const archive = { save: async () => { throw new Error('storage caído'); } };
    const app2 = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine(), photoArchive: archive });
    const res = await postAudit(app2, 'user-storage-roto', [...photosParts(4), ...BASE_FIELDS]);
    expect(res.statusCode).toBe(202);
    const { audit_id } = res.json() as { audit_id: string };
    await flushTasks();
    const poll = await app2.inject({
      method: 'GET', url: `/audit/${audit_id}`,
      headers: { authorization: `Bearer ${await token('user-storage-roto')}` },
    });
    expect((poll.json() as { status: string }).status).toBe('done');
    await app2.close();
  });

  it('rechaza un payload total desproporcionado (guarda de memoria)', async () => {
    // 9 fotos de 4MB = 36MB > el techo de 32MB.
    const gorda = Buffer.alloc(4 * 1024 * 1024, 1);
    const partes: Part[] = Array.from({ length: 9 }, (_, i) => ({
      name: 'photos', filename: `f${i}.png`, contentType: 'image/png', buffer: gorda,
    }));
    const res = await postAudit(app, 'user-payload', [...partes, ...BASE_FIELDS]);
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

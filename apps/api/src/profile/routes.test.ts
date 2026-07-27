import { setImmediate as flushTasks } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  AUDIT_FREE_LIMIT: '2',
};

async function token(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function fakeEngine(): AuditEngine {
  return {
    run: async (input, hooks) => {
      hooks?.onProgress?.({ fotos_analizadas: input.photos.length, total: input.photos.length });
      return {
        version: '1.0',
        arquetipo_detectado: { nombre: 'viajero', confianza: 0.72 },
        score_coherencia: 41,
        lectura_200ms: 'Señales compitiendo.',
        evidencia_por_foto: [],
        gap_analysis: null,
        plan_de_fotos: { conservar: [], reemplazar: [], orden_sugerido: [], briefs_faltantes: [] },
        quick_wins: [],
      };
    },
  };
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function postAudit(app: FastifyInstance, sub: string) {
  const boundary = '----percentil-test-boundary';
  const parts = [
    ...Array.from({ length: 4 }, (_, i) => ({ filename: `foto-${i + 1}.png` })),
  ];
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${p.filename}"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      TINY_PNG,
      Buffer.from('\r\n'),
    );
  }
  for (const [name, value] of [['bio', 'hola'], ['region', 'rioplatense']]) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return app.inject({
    method: 'POST',
    url: '/audit',
    payload: Buffer.concat(chunks),
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${await token(sub)}`,
    },
  });
}

describe('rutas /me (perfil de cuenta)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine() });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /me sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /me para un usuario nuevo → defaults (nunca tocó nada)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await token('user-nuevo')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ region: 'neutro', plan: 'free', handle: null, esAdmin: false });
  });

  it('PATCH /me guarda region y handle, GET /me después los refleja', async () => {
    const sub = 'user-patch';
    const auth = { authorization: `Bearer ${await token(sub)}` };
    const patch = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: { region: 'chileno', handle: 'Fer' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toEqual({ region: 'chileno', plan: 'free', handle: 'Fer' });

    const get = await app.inject({ method: 'GET', url: '/me', headers: auth });
    expect(get.json()).toEqual({ region: 'chileno', plan: 'free', handle: 'Fer', esAdmin: false });
  });

  it('PATCH /me parcial no pisa lo que no vino en el body', async () => {
    const sub = 'user-parcial';
    const auth = { authorization: `Bearer ${await token(sub)}` };
    await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: { region: 'mexicano', handle: 'Nacho' },
    });
    const second = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: { region: 'neutro' },
    });
    expect(second.json()).toEqual({ region: 'neutro', plan: 'free', handle: 'Nacho' });
  });

  it('PATCH /me con region inválida → 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me',
      headers: { authorization: `Bearer ${await token('user-bad')}`, 'content-type': 'application/json' },
      payload: { region: 'marciano' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /me/audits sin auditorías → lista vacía', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/audits',
      headers: { authorization: `Bearer ${await token('user-sin-audits')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ audits: [] });
  });

  it('GET /me/audits devuelve el historial completo, más reciente primero', async () => {
    const sub = 'user-historial';
    const first = await postAudit(app, sub);
    await flushTasks();
    const second = await postAudit(app, sub);
    await flushTasks();
    const firstId = (first.json() as { audit_id: string }).audit_id;
    const secondId = (second.json() as { audit_id: string }).audit_id;

    const res = await app.inject({
      method: 'GET',
      url: '/me/audits',
      headers: { authorization: `Bearer ${await token(sub)}` },
    });
    const { audits } = res.json() as { audits: Array<{ audit_id: string; status: string; created_at: string }> };
    expect(audits).toHaveLength(2);
    expect(audits[0]!.audit_id).toBe(secondId);
    expect(audits[1]!.audit_id).toBe(firstId);
    expect(audits.every((a) => a.status === 'done')).toBe(true);
    // el historial necesita fecha para mostrarse (feature de "varios análisis por perfil")
    expect(audits.every((a) => !Number.isNaN(Date.parse(a.created_at)))).toBe(true);
  });

  it('el historial de un usuario no incluye auditorías de otro', async () => {
    await postAudit(app, 'user-aislado-a');
    await flushTasks();
    const res = await app.inject({
      method: 'GET',
      url: '/me/audits',
      headers: { authorization: `Bearer ${await token('user-aislado-b')}` },
    });
    expect((res.json() as { audits: unknown[] }).audits).toEqual([]);
  });
});

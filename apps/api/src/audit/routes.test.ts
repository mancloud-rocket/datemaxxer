import { setImmediate as flushTasks } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditResult } from '@percentil/contracts';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import type { AuditEngine } from '../engines/audit.js';

const TEST_ENV = {
  NODE_ENV: 'test',
  SUPABASE_URL: undefined,
  SUPABASE_JWT_SECRET: 'percentil-test-secret-32-chars-min',
  ANTHROPIC_API_KEY: undefined,
  RATE_LIMIT_MAX: '1000',
  AUDIT_RATE_LIMIT_MAX: '1000',
};

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

function multipartPayload(parts: Part[]): { payload: Buffer; headers: Record<string, string> } {
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
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
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
  { name: 'email', value: 'test@percentil.app' },
  { name: 'bio', value: 'me gusta viajar' },
  { name: 'region', value: 'rioplatense' },
];

describe('rutas /audit', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine() });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /audit → 202 con audit_id y polling llega a done con result válido', async () => {
    const { payload, headers } = multipartPayload([...photosParts(4), ...BASE_FIELDS]);
    const res = await app.inject({ method: 'POST', url: '/audit', payload, headers });
    expect(res.statusCode).toBe(202);
    const { audit_id } = res.json() as { audit_id: string };
    expect(audit_id).toMatch(/^[0-9a-f-]{36}$/);

    await flushTasks();
    const poll = await app.inject({ method: 'GET', url: `/audit/${audit_id}` });
    expect(poll.statusCode).toBe(200);
    const body = poll.json() as { status: string; progress: unknown; result: unknown };
    expect(body.status).toBe('done');
    expect(body.progress).toEqual({ fotos_analizadas: 4, total: 4 });
    expect(body.result).toEqual(FAKE_RESULT);
  });

  it('rechaza menos de 4 fotos con 400', async () => {
    const { payload, headers } = multipartPayload([...photosParts(2), ...BASE_FIELDS]);
    const res = await app.inject({ method: 'POST', url: '/audit', payload, headers });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toContain('4 a 9');
  });

  it('rechaza email inválido o ausente con 400', async () => {
    const { payload, headers } = multipartPayload([
      ...photosParts(4),
      { name: 'email', value: 'no-es-un-email' },
    ]);
    const res = await app.inject({ method: 'POST', url: '/audit', payload, headers });
    expect(res.statusCode).toBe(400);
  });

  it('rechaza mimetype no soportado con 400', async () => {
    const { payload, headers } = multipartPayload([
      ...photosParts(3),
      { name: 'photos', filename: 'malo.gif', contentType: 'image/gif', buffer: TINY_PNG },
      ...BASE_FIELDS,
    ]);
    const res = await app.inject({ method: 'POST', url: '/audit', payload, headers });
    expect(res.statusCode).toBe(400);
  });

  it('motor que falla → status error en el polling (sin filtrar detalles internos)', async () => {
    const failApp = await buildApp(loadEnv(TEST_ENV), { auditEngine: fakeEngine('fail') });
    const { payload, headers } = multipartPayload([...photosParts(4), ...BASE_FIELDS]);
    const res = await failApp.inject({ method: 'POST', url: '/audit', payload, headers });
    const { audit_id } = res.json() as { audit_id: string };

    await flushTasks();
    const poll = await failApp.inject({ method: 'GET', url: `/audit/${audit_id}` });
    const body = poll.json() as { status: string; error?: string };
    expect(body.status).toBe('error');
    expect(body.error).not.toContain('boom');
    await failApp.close();
  });

  it('GET /audit/:id inexistente → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });

  it('sin ANTHROPIC_API_KEY ni engine inyectado → 503 tipado', async () => {
    const bareApp = await buildApp(loadEnv(TEST_ENV));
    const { payload, headers } = multipartPayload([...photosParts(4), ...BASE_FIELDS]);
    const res = await bareApp.inject({ method: 'POST', url: '/audit', payload, headers });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe('engine_unavailable');
    await bareApp.close();
  });
});

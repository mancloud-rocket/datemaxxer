import { setImmediate as flushTasks } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnalisisRechazado, ProfileRead } from '@percentil/contracts';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryAuditStore } from '../audit/store.js';
import { InMemoryProfileStore } from '../profile/store.js';
import type { ProfileReadEngine } from '../engines/profileread.js';
import { fotosParts, multipartPayload, TINY_PNG, type Part } from '../test-helpers/multipart.js';
import { InMemoryProfileReadStore } from './store.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = '55555555-5555-5555-5555-555555555555';

async function token(sub = USUARIO): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

const RESULTADO = { version: '2.0' } as unknown as ProfileRead;
const RECHAZO: AnalisisRechazado = {
  version: '2.0',
  rechazado: true,
  motivo: 'menor_aparente',
  detalle: 'contexto escolar',
};

/** Motor falso: devuelve lo que se le diga y cuenta cuántas veces corrió. */
function motorFalso(
  salida: 'ok' | 'rechazo' | 'explota' = 'ok',
): ProfileReadEngine & { corridas: number } {
  const espia = {
    corridas: 0,
    run: async (input: unknown, hooks?: { onProgress?: (p: unknown) => void }) => {
      espia.corridas += 1;
      const total = (input as { photos: unknown[] }).photos.length;
      hooks?.onProgress?.({ fotos_analizadas: total, total });
      if (salida === 'explota') throw new Error('el motor se cayó');
      return salida === 'ok'
        ? { ok: true as const, result: RESULTADO }
        : { ok: false as const, rechazo: RECHAZO };
    },
  };
  return espia as unknown as ProfileReadEngine & { corridas: number };
}

async function postLectura(app: FastifyInstance, sub: string, parts: Part[]) {
  const { payload, contentType } = multipartPayload(parts);
  return app.inject({
    method: 'POST',
    url: '/profile-read',
    payload,
    headers: { 'content-type': contentType, authorization: `Bearer ${await token(sub)}` },
  });
}

describe('rutas de F5 (lectura de perfil ajeno)', () => {
  let app: FastifyInstance;
  let store: InMemoryProfileReadStore;
  let profileStore: InMemoryProfileStore;
  let auditStore: InMemoryAuditStore;
  let engine: ReturnType<typeof motorFalso>;

  async function montar(overrides: Record<string, string | undefined> = {}) {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
      PROFILE_READ_RATE_LIMIT_MAX: '1000',
      ...overrides,
    });
    return buildApp(env, { profileReadStore: store, profileReadEngine: engine, profileStore, auditStore });
  }

  beforeEach(async () => {
    store = new InMemoryProfileReadStore();
    profileStore = new InMemoryProfileStore();
    auditStore = new InMemoryAuditStore();
    engine = motorFalso('ok');
    app = await montar();
  });

  afterEach(async () => {
    await app.close();
  });

  const leer = async (fotos = 2, sub = USUARIO, campos: Part[] = []) =>
    postLectura(app, sub, [...fotosParts(fotos), ...campos]);

  it('acepta la lectura con 202 y procesa en background', async () => {
    const res = await leer();
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('analyzing');

    await flushTasks();
    const guardada = await store.get(res.json().read_id);
    expect(guardada?.status).toBe('done');
  });

  it('el rechazo del motor queda como estado propio, no como error', async () => {
    engine = motorFalso('rechazo');
    await app.close();
    app = await montar();

    const res = await leer();
    await flushTasks();

    const vista = await app.inject({
      method: 'GET',
      url: `/profile-read/${res.json().read_id}`,
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(vista.json().status).toBe('rechazado');
    expect(vista.json().rechazo.motivo).toBe('menor_aparente');
    // Y no aparece ningún resultado con scores.
    expect(vista.json().result).toBeUndefined();
  });

  it('un rechazo NO quema cupo', async () => {
    // Es la regla que hace justo el rechazo: el usuario no eligió que su
    // screenshot fuera irreadable ni que el perfil fuera de un menor.
    engine = motorFalso('rechazo');
    await app.close();
    app = await montar({ PROFILE_READ_FREE_LIMIT: '1' });

    const primera = await leer();
    await flushTasks();
    expect((await store.get(primera.json().read_id))?.status).toBe('rechazado');

    expect((await leer()).statusCode).toBe(202);
  });

  it('un fallo del motor tampoco quema cupo', async () => {
    engine = motorFalso('explota');
    await app.close();
    app = await montar({ PROFILE_READ_FREE_LIMIT: '1' });

    const primera = await leer();
    await flushTasks();
    expect((await store.get(primera.json().read_id))?.status).toBe('error');

    expect((await leer()).statusCode).toBe(202);
  });

  it('corta cuando se acaba el cupo del plan', async () => {
    await app.close();
    app = await montar({ PROFILE_READ_FREE_LIMIT: '2' });

    expect((await leer()).statusCode).toBe(202);
    await flushTasks();
    expect((await leer()).statusCode).toBe(202);
    await flushTasks();

    const tercera = await leer();
    expect(tercera.statusCode).toBe(409);
    expect(tercera.json().error).toBe('limit_reached');
  });

  it('el plan copiloto tiene más cupo que el gratis', async () => {
    await app.close();
    app = await montar({ PROFILE_READ_FREE_LIMIT: '1', PROFILE_READ_COPILOT_LIMIT: '5' });
    await profileStore.setPlan(USUARIO, 'copilot');

    for (let i = 0; i < 4; i++) {
      expect((await leer()).statusCode).toBe(202);
      await flushTasks();
    }
  });

  it('le pasa al motor el índice del usuario para que haya gap', async () => {
    // Sin esto el gap vuelve null y se cae la mitad del valor de la función.
    const conIndice = motorFalso('ok');
    let recibido: unknown;
    (conIndice as unknown as { run: unknown }).run = async (input: { globalUsuario?: number | null }) => {
      recibido = input.globalUsuario;
      return { ok: true as const, result: RESULTADO };
    };
    engine = conIndice;
    await app.close();
    app = await montar();

    await auditStore.create({
      id: 'a1',
      userId: USUARIO,
      region: 'neutro',
      status: 'done',
      progress: { fotos_analizadas: 5, total: 5 },
      createdAt: new Date(),
      result: {
        indice: { global: 61 },
      } as never,
    });

    await leer();
    await flushTasks();
    expect(recibido).toBe(61);
  });

  it('sin auditoría propia manda null y la lectura sale igual', async () => {
    const res = await leer();
    await flushTasks();
    expect((await store.get(res.json().read_id))?.status).toBe('done');
  });

  it('no se puede ver la lectura de otro usuario', async () => {
    const res = await leer();
    const ajena = await app.inject({
      method: 'GET',
      url: `/profile-read/${res.json().read_id}`,
      headers: { authorization: `Bearer ${await token('66666666-6666-6666-6666-666666666666')}` },
    });
    expect(ajena.statusCode).toBe(404);
  });

  it('el historial es solo del usuario', async () => {
    await leer(2, USUARIO);
    await flushTasks();
    const res = await app.inject({
      method: 'GET',
      url: '/me/profile-reads',
      headers: { authorization: `Bearer ${await token('77777777-7777-7777-7777-777777777777')}` },
    });
    expect(res.json().reads).toEqual([]);
  });

  it('rechaza cantidades de fotos fuera de rango', async () => {
    // Sin fotos corta la validación de la ruta (400). Pasado el máximo corta
    // antes el plugin de multipart por su límite de archivos (413), o sea sin
    // llegar a leer los bytes: son códigos distintos y las dos son rechazos.
    expect((await leer(0)).statusCode).toBe(400);
    expect((await leer(10)).statusCode).toBe(413);
  });

  it('rechaza formatos no soportados', async () => {
    const res = await postLectura(app, USUARIO, [
      { name: 'photos', filename: 'x.gif', contentType: 'image/gif', buffer: TINY_PNG },
    ]);
    expect(res.statusCode).toBe(400);
  });

  it('sin token no se puede leer un perfil', async () => {
    const { payload, contentType } = multipartPayload(fotosParts(2));
    const res = await app.inject({
      method: 'POST',
      url: '/profile-read',
      payload,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sin API key responde 503 en vez de romper', async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
    });
    const sinMotor = await buildApp(env, { profileReadStore: store, profileStore });
    const res = await postLectura(sinMotor, USUARIO, fotosParts(2));
    expect(res.statusCode).toBe(503);
    await sinMotor.close();
  });
});

describe('cosecha de lecturas colgadas', () => {
  it('las que quedaron analizando se marcan error y dejan de consumir cupo', async () => {
    const store = new InMemoryProfileReadStore();
    await store.createWithQuota(
      {
        id: 'vieja',
        userId: USUARIO,
        status: 'analyzing',
        progress: { fotos_analizadas: 0, total: 3 },
        createdAt: new Date(Date.now() - 3_600_000),
      },
      { limite: 10, sinLimite: false, ventanaDias: 0 },
    );

    expect(await store.failStale(900_000)).toBe(1);
    expect((await store.get('vieja'))?.status).toBe('error');
  });
});

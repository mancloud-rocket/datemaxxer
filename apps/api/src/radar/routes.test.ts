import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryAuditStore } from '../audit/store.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { buildRadarEngine, SYSTEM_PROMPT } from '../engines/radar.js';
import type { ClaudeClient } from '../engines/audit.js';
import { fotosParts, multipartPayload, type Part } from '../test-helpers/multipart.js';
import { InMemoryRadarStore } from './store.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = '88888888-8888-8888-8888-888888888888';

async function token(sub = USUARIO): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

const opener = (n: number) => ({
  tono: 'contexto' as const,
  texto: `opener ${n}`,
  licencia: 'publicó una foto en Lisboa',
  riesgo: 'bajo' as const,
  por_que_funciona: 'engancha con algo concreto',
});

const SALIDA_OK = {
  rechazado: false,
  motivo_rechazo: null,
  indice: { bucket: 'alto', score: 71, lectura: 'Producción cuidada y cara visible.', confianza: 0.6 },
  selectividad: 'media',
  openers: [opener(1), opener(2), opener(3)],
  alerta_autenticidad: null,
};

/** Cliente falso con reloj controlado, para poder medir ms_motor sin depender del real. */
function cliente(salida: unknown, msQueTarda = 1200) {
  let t = 1_000_000;
  const client: ClaudeClient = {
    messages: {
      create: async () => {
        t += msQueTarda;
        return { content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' };
      },
    },
  };
  return { client, ahora: () => t };
}

function motor(salida: unknown, ms = 1200) {
  const { client, ahora } = cliente(salida, ms);
  return buildRadarEngine({ client, ahora });
}

describe('POST /radar', () => {
  let app: FastifyInstance;
  let store: InMemoryRadarStore;
  let profileStore: InMemoryProfileStore;
  let auditStore: InMemoryAuditStore;

  async function montar(salida: unknown = SALIDA_OK, overrides: Record<string, string | undefined> = {}) {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
      RADAR_RATE_LIMIT_MAX: '1000',
      ...overrides,
    });
    return buildApp(env, { radarStore: store, radarEngine: motor(salida), profileStore, auditStore });
  }

  const disparar = async (app: FastifyInstance, fotos = 2, partes: Part[] = []) => {
    const { payload, contentType } = multipartPayload([...fotosParts(fotos), ...partes]);
    return app.inject({
      method: 'POST',
      url: '/radar',
      payload,
      headers: { 'content-type': contentType, authorization: `Bearer ${await token()}` },
    });
  };

  beforeEach(async () => {
    store = new InMemoryRadarStore();
    profileStore = new InMemoryProfileStore();
    auditStore = new InMemoryAuditStore();
    app = await montar();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde el resultado directo, sin polling', async () => {
    const res = await disparar(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('1.0');
    expect(body.openers).toHaveLength(3);
    // El contrato obliga a declarar que es una estimación rápida.
    expect(body.indice.precision).toBe('rapida');
  });

  it('mide y devuelve ms_motor', async () => {
    const res = await disparar(app);
    expect(res.json().ms_motor).toBe(1200);
  });

  it('calcula el gap contra el índice del usuario', async () => {
    await auditStore.create({
      id: 'a1',
      userId: USUARIO,
      region: 'neutro',
      status: 'done',
      progress: { fotos_analizadas: 5, total: 5 },
      createdAt: new Date(),
      result: { indice: { global: 55 } } as never,
    });
    const res = await disparar(app);
    // 71 (ella) - 55 (él) = 16 → ella un escalón arriba
    expect(res.json().gap_delta).toBe(16);
    expect(res.json().veredicto).toBe('oportunista');
  });

  it('sin índice propio el gap es null y el radar igual sirve', async () => {
    const res = await disparar(app);
    expect(res.json().gap_delta).toBeNull();
    expect(res.json().openers).toHaveLength(3);
  });

  it('una alerta de autenticidad manda el veredicto a no_vale', async () => {
    await app.close();
    app = await montar({ ...SALIDA_OK, alerta_autenticidad: 'handle de otra red en la bio' });
    const res = await disparar(app);
    expect(res.json().veredicto).toBe('no_vale');
  });

  it('un rechazo responde 422, sin scores, y NO gasta radar', async () => {
    await app.close();
    app = await montar(
      { rechazado: true, motivo_rechazo: 'menor_aparente', indice: null, selectividad: null, openers: [], alerta_autenticidad: null },
      { RADAR_FREE_LIMIT: '1' },
    );

    const res = await disparar(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe('menor_aparente');
    expect(JSON.stringify(res.json())).not.toMatch(/score|bucket/i);
    // La reserva se liberó: puede volver a intentar.
    expect(store.filas).toHaveLength(0);
  });

  it('si el motor falla tampoco gasta radar', async () => {
    await app.close();
    app = await montar({ rechazado: false, motivo_rechazo: null, indice: null, selectividad: null, openers: [], alerta_autenticidad: null });
    const res = await disparar(app);
    expect(res.statusCode).toBe(502);
    expect(store.filas).toHaveLength(0);
  });

  it('corta cuando se acaba el cupo', async () => {
    await app.close();
    app = await montar(SALIDA_OK, { RADAR_FREE_LIMIT: '2' });

    expect((await disparar(app)).statusCode).toBe(200);
    expect((await disparar(app)).statusCode).toBe(200);
    const tercero = await disparar(app);
    expect(tercero.statusCode).toBe(409);
    expect(tercero.json().error).toBe('limit_reached');
  });

  it('el copiloto tiene más radares que el gratis', async () => {
    await app.close();
    app = await montar(SALIDA_OK, { RADAR_FREE_LIMIT: '1', RADAR_COPILOT_LIMIT: '5' });
    await profileStore.setPlan(USUARIO, 'copilot');
    for (let i = 0; i < 4; i++) expect((await disparar(app)).statusCode).toBe(200);
  });

  it('acepta hasta 4 capturas, no más', async () => {
    expect((await disparar(app, 4)).statusCode).toBe(200);
    expect((await disparar(app, 5)).statusCode).toBe(400);
  });

  it('sin token no hay radar', async () => {
    const { payload, contentType } = multipartPayload(fotosParts(2));
    const res = await app.inject({
      method: 'POST',
      url: '/radar',
      payload,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('motor del radar', () => {
  it('exige exactamente 3 openers: más son más tokens y deja de ser radar', async () => {
    const engine = motor({ ...SALIDA_OK, openers: [opener(1), opener(2)] });
    await expect(
      engine.run({ photos: [{ data: 'x', mediaType: 'image/jpeg' }] }),
    ).rejects.toThrow(/3 openers/);
  });

  it('un score fuera del rango de su bucket no pasa', async () => {
    const engine = motor({ ...SALIDA_OK, indice: { ...SALIDA_OK.indice, bucket: 'bajo', score: 71 } });
    await expect(
      engine.run({ photos: [{ data: 'x', mediaType: 'image/jpeg' }] }),
    ).rejects.toThrow(/fuera del rango/);
  });

  it('usa la MISMA calibración que F1 y F5', () => {
    expect(SYSTEM_PROMPT).toContain('Primero elegís el bucket');
    expect(SYSTEM_PROMPT).toContain('La mitad del pool está debajo de 60');
  });

  it('el prompt mantiene el filtro de menor de edad pese al apuro', () => {
    expect(SYSTEM_PROMPT).toContain('menor de edad');
    expect(SYSTEM_PROMPT).toContain('La velocidad no es excusa');
  });
});

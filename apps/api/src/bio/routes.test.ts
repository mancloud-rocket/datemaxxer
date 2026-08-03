import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryAuditStore } from '../audit/store.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { buildBioEngine, SYSTEM_PROMPT } from '../engines/bio.js';
import type { ClaudeClient } from '../engines/audit.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

async function token(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USUARIO)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

const variante = (angulo: string, texto: string) => ({
  angulo,
  texto,
  por_que: 'deja una puerta concreta para contestar',
  // A propósito mal: el código lo recalcula.
  largo: 999,
});

const SALIDA = {
  version: '1.0',
  variantes: [
    variante('concreta', 'Ingeniero. Corro los domingos por la rambla. Cocino mal pero insisto.'),
    variante('con filo', 'Si tu plan ideal es un after office, ya estamos mal.'),
    variante('directa', 'Busco algo serio. No tengo apuro pero tampoco tiempo que perder.'),
  ],
  prompts: [],
  diagnostico_anterior: 'Tres clichés y ninguna puerta para contestar.',
};

function motor(salida: unknown) {
  const llamadas: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        llamadas.push(params);
        return { content: [{ type: 'text', text: JSON.stringify(salida) }], stop_reason: 'end_turn' };
      },
    },
  };
  return { engine: buildBioEngine({ client }), llamadas };
}

describe('POST /bio (F3)', () => {
  let app: FastifyInstance;
  let profileStore: InMemoryProfileStore;
  let auditStore: InMemoryAuditStore;
  let llamadas: Array<Record<string, unknown>>;

  async function montar(salida: unknown = SALIDA) {
    const m = motor(salida);
    llamadas = m.llamadas;
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
      AUDIT_RATE_LIMIT_MAX: '1000',
    });
    return buildApp(env, { bioEngine: m.engine, profileStore, auditStore });
  }

  const pedir = async (body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/bio',
      headers: { authorization: `Bearer ${await token()}` },
      payload: body as never,
    });

  beforeEach(async () => {
    profileStore = new InMemoryProfileStore();
    auditStore = new InMemoryAuditStore();
    app = await montar();
    await profileStore.setPlan(USUARIO, 'kit');
  });

  afterEach(async () => {
    await app.close();
  });

  const BODY = { intencion: 'relacion', plataforma: 'tinder', datos: ['corro', 'cocino'] };

  it('devuelve tres variantes con ángulos distintos', async () => {
    const res = await pedir(BODY);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.variantes).toHaveLength(3);
    expect(new Set(b.variantes.map((v: { angulo: string }) => v.angulo)).size).toBe(3);
  });

  it('el largo lo recalcula el código, no el modelo', async () => {
    // El modelo cuenta caracteres mal y ese número es el que la UI usa para
    // avisar si la bio no entra en la plataforma.
    const b = (await pedir(BODY)).json();
    for (const v of b.variantes) expect(v.largo).toBe(v.texto.length);
  });

  it('el plan gratis no escribe bio: es parte del Kit', async () => {
    await profileStore.setPlan(USUARIO, 'free');
    const res = await pedir(BODY);
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe('plan_requerido');
  });

  it('el copiloto también la tiene', async () => {
    await profileStore.setPlan(USUARIO, 'copilot');
    expect((await pedir(BODY)).statusCode).toBe(200);
  });

  it('le pasa el arquetipo de su última auditoría para no contradecir las fotos', async () => {
    await auditStore.create({
      id: 'a1',
      userId: USUARIO,
      region: 'neutro',
      status: 'done',
      progress: { fotos_analizadas: 5, total: 5 },
      createdAt: new Date(),
      result: { arquetipo_detectado: { nombre: 'deportista', confianza: 0.8 } } as never,
    });
    await pedir(BODY);
    expect(JSON.stringify(llamadas[0])).toContain('deportista');
  });

  it('sin auditoría previa la bio sale igual', async () => {
    await pedir(BODY);
    expect(JSON.stringify(llamadas[0])).toContain('todavía no se auditó');
  });

  it('exige al menos un dato real', async () => {
    expect((await pedir({ ...BODY, datos: [] })).statusCode).toBe(400);
  });

  it('rechaza una intención inventada', async () => {
    expect((await pedir({ ...BODY, intencion: 'lo que venga' })).statusCode).toBe(400);
  });

  it('sin token no hay bio', async () => {
    const res = await app.inject({ method: 'POST', url: '/bio', payload: BODY as never });
    expect(res.statusCode).toBe(401);
  });

  it('el prompt lleva la blocklist y la regla de la puerta abierta', () => {
    const prompt = SYSTEM_PROMPT.replace(/\s+/g, ' ');
    expect(prompt).toContain('Blocklist anti-slop');
    expect(prompt).toContain('dejar una puerta abierta');
    expect(prompt).toContain('Nada inventado');
  });
});

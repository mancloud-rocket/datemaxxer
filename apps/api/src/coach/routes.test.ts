import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { InMemoryAuditStore } from '../audit/store.js';
import { armarSystem, buildCoachEngine, type CoachClient } from '../engines/coach.js';
import { InMemoryCoachStore } from './store.js';

const SECRET = 'secreto-de-test-suficientemente-largo';
const USUARIO = '33333333-3333-3333-3333-333333333333';

async function token(sub = USUARIO): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));
}

/** Cliente falso: devuelve pedazos fijos y guarda con qué lo llamaron. */
function clienteFalso(pedazos = ['Dale, ', 'vamos por partes.']): CoachClient & {
  llamadas: Array<{ system: string; messages: Array<{ role: string; content: string }> }>;
} {
  const llamadas: Array<{ system: string; messages: Array<{ role: string; content: string }> }> = [];
  return {
    llamadas,
    async *stream(params) {
      llamadas.push({ system: params.system, messages: params.messages });
      for (const p of pedazos) yield p;
    },
  };
}

/** Junta los eventos SSE de la respuesta. */
function leerSse(payload: string): { texto: string; fin: boolean; error?: string } {
  let texto = '';
  let fin = false;
  let error: string | undefined;
  for (const linea of payload.split('\n')) {
    if (!linea.startsWith('data: ')) continue;
    const e = JSON.parse(linea.slice(6)) as { t?: string; fin?: boolean; error?: string };
    if (e.t !== undefined) texto += e.t;
    if (e.fin === true) fin = true;
    if (e.error !== undefined) error = e.error;
  }
  return error !== undefined ? { texto, fin, error } : { texto, fin };
}

describe('coach de confianza', () => {
  let app: FastifyInstance;
  let coachStore: InMemoryCoachStore;
  let profileStore: InMemoryProfileStore;
  let cliente: ReturnType<typeof clienteFalso>;

  async function montar(overrides: Record<string, string | undefined> = {}) {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      ...overrides,
    });
    return buildApp(env, {
      coachStore,
      profileStore,
      auditStore: new InMemoryAuditStore(),
      coachEngine: buildCoachEngine({ client: cliente }),
    });
  }

  beforeEach(async () => {
    coachStore = new InMemoryCoachStore();
    profileStore = new InMemoryProfileStore();
    cliente = clienteFalso();
    app = await montar();
  });

  afterEach(async () => {
    await app.close();
  });

  const mandar = async (texto: string) =>
    app.inject({
      method: 'POST',
      url: '/coach/mensaje',
      headers: { authorization: `Bearer ${await token()}` },
      payload: { texto },
    });

  it('responde en streaming y guarda los dos turnos', async () => {
    const res = await mandar('me ghostearon otra vez');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const sse = leerSse(res.payload);
    expect(sse.texto).toBe('Dale, vamos por partes.');
    expect(sse.fin).toBe(true);

    expect(coachStore.filas.map((m) => m.rol)).toEqual(['user', 'coach']);
    expect(coachStore.filas[1]!.texto).toBe('Dale, vamos por partes.');
  });

  it('el mensaje del usuario sobrevive aunque el modelo falle', async () => {
    cliente = {
      llamadas: [],
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error('la API se cayó');
      },
    };
    await app.close();
    app = await montar();

    const res = await mandar('no doy más');
    const sse = leerSse(res.payload);

    expect(sse.error).toBeDefined();
    expect(sse.fin).toBe(false);
    expect(coachStore.filas).toHaveLength(1);
    expect(coachStore.filas[0]).toMatchObject({ rol: 'user', texto: 'no doy más' });
  });

  it('si se corta a mitad, guarda lo que alcanzó a decir', async () => {
    cliente = {
      llamadas: [],
      async *stream() {
        yield 'Mirá, lo primero es';
        throw new Error('se cortó');
      },
    };
    await app.close();
    app = await montar();

    await mandar('ayuda');

    expect(coachStore.filas).toHaveLength(2);
    expect(coachStore.filas[1]).toMatchObject({ rol: 'coach', texto: 'Mirá, lo primero es' });
  });

  it('manda el historial completo al modelo, no solo el último', async () => {
    await mandar('hola');
    await mandar('y ahora que hago');

    const ultima = cliente.llamadas[cliente.llamadas.length - 1]!;
    expect(ultima.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(ultima.messages[2]!.content).toBe('y ahora que hago');
  });

  it('corta cuando se acaba el cupo del plan gratis', async () => {
    await app.close();
    app = await montar({ COACH_FREE_LIMIT: '2' });

    expect((await mandar('uno')).statusCode).toBe(200);
    expect((await mandar('dos')).statusCode).toBe(200);
    const tercero = await mandar('tres');

    expect(tercero.statusCode).toBe(402);
    expect(tercero.json().error).toBe('coach_quota');
  });

  it('el plan copiloto no tiene tope', async () => {
    await app.close();
    app = await montar({ COACH_FREE_LIMIT: '1' });
    await profileStore.setPlan(USUARIO, 'copilot');

    await mandar('uno');
    await mandar('dos');
    expect((await mandar('tres')).statusCode).toBe(200);
  });

  it('GET /coach devuelve la conversación y lo que queda', async () => {
    await app.close();
    app = await montar({ COACH_FREE_LIMIT: '10' });
    await mandar('hola');

    const res = await app.inject({
      method: 'GET',
      url: '/coach',
      headers: { authorization: `Bearer ${await token()}` },
    });

    expect(res.json().mensajes).toHaveLength(2);
    expect(res.json().restantes).toBe(9);
  });

  it('rechaza un mensaje vacío y uno larguísimo', async () => {
    expect((await mandar('   ')).statusCode).toBe(400);
    expect((await mandar('x'.repeat(2001))).statusCode).toBe(400);
  });

  it('sin token no se puede hablar con el coach', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/coach/mensaje',
      payload: { texto: 'hola' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sin API key el coach responde 503, no rompe', async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
    });
    const sinMotor = await buildApp(env, { coachStore, profileStore });
    const res = await sinMotor.inject({
      method: 'POST',
      url: '/coach/mensaje',
      headers: { authorization: `Bearer ${await token()}` },
      payload: { texto: 'hola' },
    });
    expect(res.statusCode).toBe(503);
    await sinMotor.close();
  });
});

describe('contexto que recibe el coach', () => {
  it('dice que no auditó nunca cuando no hay auditoría', () => {
    const system = armarSystem({ region: 'rioplatense', plan: 'free' });
    expect(system).toContain('Todavía no hizo ninguna auditoría');
    expect(system).toContain('Rioplatense');
  });

  it('mete score, arquetipo y lectura cuando los hay', () => {
    const system = armarSystem({
      region: 'neutro',
      plan: 'copilot',
      nombre: 'Nacho',
      ultimaAuditoria: {
        score: 41,
        arquetipo: 'viajero',
        lectura: 'Tu perfil dice viajero pero cinco de seis fotos son de interior.',
        hace: 'hace 3 días',
      },
    });
    expect(system).toContain('41/100');
    expect(system).toContain('viajero');
    expect(system).toContain('Nacho');
    expect(system).toContain('hace 3 días');
    expect(system).toContain('plan Copiloto');
  });

  it('arrastra siempre las reglas duras del prompt', () => {
    const system = armarSystem({ region: 'neutro', plan: 'free' });
    expect(system).toContain('No mentís para que se sienta bien');
    // v2: se puede decir que el juego está torcido, pero la respuesta cierra
    // en algo que él ejecuta. Es regla de rendimiento, no de tono.
    expect(system).toContain('Todo termina en algo que él controla');
    // El piso de salud mental y el freno de acoso no se ablandan nunca.
    expect(system).toContain('ideación suicida');
    expect(system).toContain('No sugerís insistir después de un no');
  });

  it('v2 licencia explícitamente las verdades de mercado (si no, el modelo hedgea)', () => {
    const system = armarSystem({ region: 'neutro', plan: 'free' });
    expect(system).toContain('selectividad femenina en apps es alta y es racional');
    expect(system).toContain('jerarquías de atractivo existen');
    expect(system).not.toContain('El enemigo nunca son las mujeres');
  });
});

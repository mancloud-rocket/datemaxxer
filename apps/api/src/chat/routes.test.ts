import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { buildChatEngine, SYSTEM_PROMPT } from '../engines/chat.js';
import type { ClaudeClient } from '../engines/audit.js';
import { multipartPayload, TINY_PNG, type Part } from '../test-helpers/multipart.js';
import { InMemoryChatStore } from './store.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function token(sub = USUARIO): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

const EXTRACCION = {
  mensajes: [
    { de: 'yo', texto: 'hola, cómo va', ts: '2026-08-02T10:00:00Z' },
    { de: 'ella', texto: 'bien y vos?', ts: '2026-08-02T10:20:00Z' },
    { de: 'yo', texto: 'todo bien, laburando', ts: '2026-08-02T10:25:00Z' },
    { de: 'ella', texto: 'ah', ts: '2026-08-02T13:00:00Z' },
  ],
};

const ANALISIS = {
  registro_detectado: { formalidad: 'baja', mayusculas: false, emojis: 'pocos', humor: 'seco' },
  sugerencias: [
    { estrategia: 'proponer_salida', texto: '¿Un café el jueves?', por_que: 'la conversación ya dio lo que tenía' },
  ],
  veredicto: {
    decision: 'proponer_salida_ahora',
    confianza: 0.7,
    evidencia: ['su latencia pasó de 20 a 155 minutos'],
    revisar_en_dias: 4,
  },
};

/**
 * Motor falso. Cada turno son DOS llamadas (extracción, análisis), así que
 * alterna: impares extracción, pares análisis. Si esto no alterna, el segundo
 * turno recibe un análisis donde espera mensajes y falla en silencio.
 */
function motor() {
  const llamadas: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        llamadas.push(params);
        const cuerpo = llamadas.length % 2 === 1 ? EXTRACCION : ANALISIS;
        return { content: [{ type: 'text', text: JSON.stringify(cuerpo) }], stop_reason: 'end_turn' };
      },
    },
  };
  return { engine: buildChatEngine({ client }), llamadas };
}

describe('rutas de F4 (copiloto de chat)', () => {
  let app: FastifyInstance;
  let store: InMemoryChatStore;
  let profileStore: InMemoryProfileStore;
  let llamadas: Array<Record<string, unknown>>;

  async function montar() {
    const m = motor();
    llamadas = m.llamadas;
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
      AUDIT_RATE_LIMIT_MAX: '1000',
    });
    return buildApp(env, { chatStore: store, chatEngine: m.engine, profileStore });
  }

  beforeEach(async () => {
    store = new InMemoryChatStore();
    profileStore = new InMemoryProfileStore();
    app = await montar();
    await profileStore.setPlan(USUARIO, 'copilot');
  });

  afterEach(async () => {
    await app.close();
  });

  const crear = async (label = 'Flor de Bumble') =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: `Bearer ${await token()}` },
      payload: { label } as never,
    });

  const subir = async (id: string, partes: Part[]) => {
    const { payload, contentType } = multipartPayload(partes);
    return app.inject({
      method: 'POST',
      url: `/conversations/${id}/snapshot`,
      payload,
      headers: { 'content-type': contentType, authorization: `Bearer ${await token()}` },
    });
  };

  const CAPTURA: Part = { name: 'capturas', filename: 'c.png', contentType: 'image/png', buffer: TINY_PNG };

  it('crea una conversación', async () => {
    const res = await crear();
    expect(res.statusCode).toBe(201);
    expect(res.json().label).toBe('Flor de Bumble');
  });

  it('analiza un turno y devuelve el veredicto', async () => {
    const c = (await crear()).json();
    const res = await subir(c.id, [CAPTURA]);
    expect(res.statusCode).toBe(200);
    expect(res.json().veredicto.decision).toBe('proponer_salida_ahora');
  });

  it('los números del comportamiento los calcula el código, no el modelo', async () => {
    // Es la regla que sostiene toda la función: el veredicto cita esos números.
    const c = (await crear()).json();
    const b = (await subir(c.id, [CAPTURA])).json();
    // 20 min y 155 min de latencia → promedio 88 (redondeado)
    expect(b.comportamiento.latencia_promedio_min).toBe(88);
    expect(b.comportamiento.preguntas_ella_ultimos_10).toBe(1);
  });

  it('le pasa los números YA calculados al modelo', async () => {
    const c = (await crear()).json();
    await subir(c.id, [CAPTURA]);
    const segunda = JSON.stringify(llamadas[1]);
    expect(segunda).toContain('NÚMEROS YA CALCULADOS');
    expect(segunda).toContain('latencia_promedio_min');
  });

  it('acumula los mensajes entre turnos: la latencia solo vale contra la historia', async () => {
    const c = (await crear()).json();
    expect((await subir(c.id, [CAPTURA])).statusCode).toBe(200);
    expect((await subir(c.id, [CAPTURA])).statusCode).toBe(200);
    const guardada = await store.obtener(c.id);
    expect(guardada!.mensajes).toHaveLength(8); // 4 del primer turno + 4 del segundo
  });

  it('acepta texto pegado en vez de capturas', async () => {
    const c = (await crear()).json();
    const res = await subir(c.id, [{ name: 'pegado', value: 'yo: hola\nella: hey' }]);
    expect(res.statusCode).toBe(200);
  });

  it('sin capturas ni texto no analiza', async () => {
    const c = (await crear()).json();
    const res = await subir(c.id, [{ name: 'otro', value: 'x' }]);
    expect(res.statusCode).toBe(400);
  });

  it('guarda el turno y lo devuelve en el detalle', async () => {
    const c = (await crear()).json();
    await subir(c.id, [CAPTURA]);
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${c.id}`,
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.json().turnos).toHaveLength(1);
    expect(res.json().ultimo_veredicto).toBe('proponer_salida_ahora');
  });

  it('el feedback loop guarda qué pasó de verdad', async () => {
    // Es lo que vuelve falseable al veredicto.
    const c = (await crear()).json();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${c.id}/feedback`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: { resultado: 'salio_bien', nota: 'salimos el jueves' } as never,
    });
    expect(res.statusCode).toBe(200);
    expect((await store.obtener(c.id))!.feedback).toContain('salio_bien');
  });

  it('no se puede tocar la conversación de otro', async () => {
    const c = (await crear()).json();
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${c.id}`,
      headers: { authorization: `Bearer ${await token('cccccccc-cccc-cccc-cccc-cccccccccccc')}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('va detrás del Copiloto: el Kit no alcanza', async () => {
    await profileStore.setPlan(USUARIO, 'kit');
    expect((await crear()).statusCode).toBe(402);
  });

  it('sin token no hay nada', async () => {
    const res = await app.inject({ method: 'GET', url: '/conversations' });
    expect(res.statusCode).toBe(401);
  });

  it('el prompt le prohíbe recalcular los números y sugerir insistir', () => {
    const prompt = SYSTEM_PROMPT.replace(/\s+/g, ' ');
    expect(prompt).toContain('No los recalcules');
    expect(prompt).toContain('No sugerís insistir después de un no');
    expect(prompt).toContain('no inventes horas');
  });
});

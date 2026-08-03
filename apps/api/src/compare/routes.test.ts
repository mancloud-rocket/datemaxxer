import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { buildCompareEngine, SYSTEM_PROMPT } from '../engines/compare.js';
import type { ClaudeClient } from '../engines/audit.js';
import { multipartPayload, TINY_PNG, type Part } from '../test-helpers/multipart.js';
import { InMemoryRadarStore } from '../radar/store.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = '99999999-9999-9999-9999-999999999999';

async function token(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USUARIO)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

const comp = (bucket: string, score: number) => ({
  bucket,
  score,
  evidencia: ['lo que se ve'],
  ancla: { un_bucket_arriba: 'mejor', un_bucket_abajo: 'peor' },
  confianza: 0.7,
});

/** Él 50 (facial .45/pres .33/prod .22), ella 74 (.50/.30/.20). Gap = 24. */
const SALIDA_OK = {
  rechazado: false,
  motivo_rechazo: null,
  usuario: {
    facial: comp('medio', 50),
    presentacion: comp('medio', 50),
    produccion: comp('medio', 50),
    fortaleza: 'la mirada a cámara',
    debilidad: 'todas las fotos con la misma luz plana',
  },
  objetivo: {
    facial: comp('alto', 74),
    presentacion: comp('alto', 74),
    produccion: comp('alto', 74),
    fortaleza: 'producción profesional',
    debilidad: 'poca espontaneidad',
  },
  descomposicion: {
    cerrables: 10,
    no_cerrables: 14,
    plan: [{ accion: 'rehacer las fotos con luz lateral', puntos: 8, plazo: 'semana' }],
  },
  veredicto: 'Ella te saca 24 puntos. Diez son fotos y los cerrás en seis semanas.',
  confianza: 0.7,
};

function motor(salida: unknown) {
  const client: ClaudeClient = {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: JSON.stringify(salida) }],
        stop_reason: 'end_turn',
      }),
    },
  };
  return buildCompareEngine({ client });
}

const dosFotos: Part[] = [
  { name: 'usuario', filename: 'yo.png', contentType: 'image/png', buffer: TINY_PNG },
  { name: 'objetivo', filename: 'ella.png', contentType: 'image/png', buffer: TINY_PNG },
];

describe('POST /compare', () => {
  let app: FastifyInstance;
  let store: InMemoryRadarStore;
  let profileStore: InMemoryProfileStore;

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
    return buildApp(env, { radarStore: store, compareEngine: motor(salida), profileStore });
  }

  const comparar = async (app: FastifyInstance, partes: Part[] = dosFotos) => {
    const { payload, contentType } = multipartPayload(partes);
    return app.inject({
      method: 'POST',
      url: '/compare',
      payload,
      headers: { 'content-type': contentType, authorization: `Bearer ${await token()}` },
    });
  };

  beforeEach(async () => {
    store = new InMemoryRadarStore();
    profileStore = new InMemoryProfileStore();
    app = await montar();
  });

  afterEach(async () => {
    await app.close();
  });

  it('compara y calcula los dos global en código', async () => {
    const res = await comparar(app);
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.usuario.global).toBe(50);
    expect(b.objetivo.global).toBe(74);
    expect(b.gap.delta).toBe(24);
    expect(b.gap.tier).toBe('ella_un_tier');
  });

  it('cerrables + no_cerrables da exactamente el gap', async () => {
    const res = await comparar(app);
    const b = res.json();
    expect(b.descomposicion.cerrables + b.descomposicion.no_cerrables).toBe(b.gap.delta);
  });

  it('si el modelo promete más puntos que el gap, el código lo recorta', async () => {
    // Prometer 35 puntos de mejora sobre un gap de 24 es la forma más rápida de
    // que el producto pierda credibilidad.
    await app.close();
    app = await montar({
      ...SALIDA_OK,
      descomposicion: { ...SALIDA_OK.descomposicion, cerrables: 35, no_cerrables: 0 },
    });
    const b = (await comparar(app)).json();
    expect(b.descomposicion.cerrables).toBe(24);
    expect(b.descomposicion.no_cerrables).toBe(0);
    expect(b.descomposicion.cerrables).toBeLessThanOrEqual(b.gap.delta);
  });

  it('el techo nunca promete rasgos nuevos', async () => {
    const b = (await comparar(app)).json();
    // techo = su global + lo recuperable, nunca el de ella.
    expect(b.techo_estimado).toBe(b.usuario.global + b.descomposicion.cerrables);
    expect(b.techo_estimado).toBeLessThanOrEqual(b.objetivo.global);
  });

  it('cuando el usuario está arriba no hay nada que cerrar', async () => {
    await app.close();
    app = await montar({
      ...SALIDA_OK,
      usuario: { ...SALIDA_OK.usuario, facial: comp('alto', 78), presentacion: comp('alto', 78), produccion: comp('alto', 78) },
      objetivo: { ...SALIDA_OK.objetivo, facial: comp('medio', 50), presentacion: comp('medio', 50), produccion: comp('medio', 50) },
    });
    const b = (await comparar(app)).json();
    expect(b.gap.delta).toBeLessThan(0);
    expect(b.descomposicion.cerrables).toBe(0);
    expect(b.descomposicion.no_cerrables).toBe(0);
  });

  it('un rechazo responde 422 sin números y no gasta cupo', async () => {
    await app.close();
    app = await montar({
      rechazado: true,
      motivo_rechazo: 'menor_aparente',
      usuario: null,
      objetivo: null,
      descomposicion: null,
      veredicto: null,
      confianza: 0.9,
    });
    const res = await comparar(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe('menor_aparente');
    expect(JSON.stringify(res.json())).not.toMatch(/global|score/i);
    expect(store.filas).toHaveLength(0);
  });

  it('si una foto no se puede juzgar, rechaza en vez de inventar', async () => {
    await app.close();
    app = await montar({
      ...SALIDA_OK,
      usuario: { ...SALIDA_OK.usuario, facial: null, presentacion: null, produccion: null },
    });
    const res = await comparar(app);
    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe('imagen_ilegible');
  });

  it('exige las dos fotos', async () => {
    const res = await comparar(app, [dosFotos[0]!]);
    expect(res.statusCode).toBe(400);
  });

  it('comparte el pozo de cupo con el radar', async () => {
    await app.close();
    app = await montar(SALIDA_OK, { RADAR_FREE_LIMIT: '1' });
    expect((await comparar(app)).statusCode).toBe(200);
    expect((await comparar(app)).statusCode).toBe(409);
  });

  it('sin token no compara', async () => {
    const { payload, contentType } = multipartPayload(dosFotos);
    const res = await app.inject({
      method: 'POST',
      url: '/compare',
      payload,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(401);
  });

  it('el prompt prohíbe prometer rasgos y usa la calibración compartida', () => {
    // Se normalizan los saltos: el prompt es prosa y se reflowea al editarlo.
    // Sin esto el test se rompe por reacomodar un párrafo, que no es un cambio
    // de comportamiento.
    const prompt = SYSTEM_PROMPT.replace(/\s+/g, ' ');
    expect(prompt).toContain('no se promete cerrarlos');
    expect(prompt).toContain('Nunca promete rasgos nuevos');
    expect(prompt).toContain('Primero elegís el bucket');
  });
});

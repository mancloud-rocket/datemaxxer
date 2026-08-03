import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryAuditStore } from '../audit/store.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { multipartPayload, type Part } from '../test-helpers/multipart.js';

const SECRET = 'percentil-test-secret-32-chars-min';
const USUARIO = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

async function token(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USUARIO)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
}

async function jpegDePrueba(ancho = 300, alto = 400): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: '#3a5f8a' } })
    .jpeg()
    .toBuffer();
}

describe('POST /photos/retoque (F2)', () => {
  let app: FastifyInstance;
  let profileStore: InMemoryProfileStore;
  let auditStore: InMemoryAuditStore;
  let foto: Buffer;

  beforeEach(async () => {
    profileStore = new InMemoryProfileStore();
    auditStore = new InMemoryAuditStore();
    foto = await jpegDePrueba();
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
      AUDIT_RATE_LIMIT_MAX: '1000',
    });
    app = await buildApp(env, { profileStore, auditStore });
    await profileStore.setPlan(USUARIO, 'kit');
  });

  afterEach(async () => {
    await app.close();
  });

  const retocar = async (partes: Part[]) => {
    const { payload, contentType } = multipartPayload(partes);
    return app.inject({
      method: 'POST',
      url: '/photos/retoque',
      payload,
      headers: { 'content-type': contentType, authorization: `Bearer ${await token()}` },
    });
  };

  const FOTO = (b: Buffer): Part => ({ name: 'foto', filename: 'f.jpg', contentType: 'image/jpeg', buffer: b });

  it('devuelve la foto corregida', async () => {
    const res = await retocar([FOTO(foto), { name: 'exposicion', value: '0.5' }]);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(400);
  });

  it('declara en la respuesta qué hizo y qué NO puede hacer', async () => {
    // La promesa es "mejoramos la foto, no te mejoramos a vos": el usuario tiene
    // derecho a verlo sin leer marketing.
    const res = await retocar([FOTO(foto), { name: 'exposicion', value: '0.5' }]);
    expect(res.headers['x-operaciones-aplicadas']).toContain('exposicion');
    expect(res.headers['x-operaciones-prohibidas']).toContain('liquify');
    expect(res.headers['x-operaciones-prohibidas']).toContain('adelgazar');
  });

  it('el recorte cambia las dimensiones sin reescalar', async () => {
    const res = await retocar([
      FOTO(foto),
      { name: 'recorte_left', value: '0' },
      { name: 'recorte_top', value: '0' },
      { name: 'recorte_width', value: '200' },
      { name: 'recorte_height', value: '200' },
    ]);
    expect(res.headers['x-dimensiones']).toBe('200x200');
  });

  it('usa el arquetipo de su última auditoría si no elige uno', async () => {
    // El color existe para que la foto diga lo mismo que el perfil.
    await auditStore.create({
      id: 'a1',
      userId: USUARIO,
      region: 'neutro',
      status: 'done',
      progress: { fotos_analizadas: 5, total: 5 },
      createdAt: new Date(),
      result: { arquetipo_detectado: { nombre: 'profesional', confianza: 0.8 } } as never,
    });
    const res = await retocar([FOTO(foto)]);
    expect(res.headers['x-operaciones-aplicadas']).toContain('color_arquetipo');
  });

  it('sin auditoría previa y sin arquetipo, no inventa color', async () => {
    const res = await retocar([FOTO(foto)]);
    expect(res.headers['x-operaciones-aplicadas']).not.toContain('color_arquetipo');
  });

  it('el plan gratis no retoca: viene con el Kit', async () => {
    await profileStore.setPlan(USUARIO, 'free');
    const res = await retocar([FOTO(foto)]);
    expect(res.statusCode).toBe(402);
  });

  it('exige la foto', async () => {
    const res = await retocar([{ name: 'exposicion', value: '0.5' }]);
    expect(res.statusCode).toBe(400);
  });

  it('rechaza formatos no soportados', async () => {
    const res = await retocar([
      { name: 'foto', filename: 'x.gif', contentType: 'image/gif', buffer: foto },
    ]);
    expect(res.statusCode).toBe(400);
  });

  it('rechaza una opción inventada en vez de ignorarla', async () => {
    // El schema es strict: si alguien manda "adelgazar=true", no pasa callado.
    const res = await retocar([FOTO(foto), { name: 'adelgazar', value: 'true' }]);
    expect(res.statusCode).toBe(400);
  });

  it('sin token no retoca', async () => {
    const { payload, contentType } = multipartPayload([FOTO(foto)]);
    const res = await app.inject({
      method: 'POST',
      url: '/photos/retoque',
      payload,
      headers: { 'content-type': contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});

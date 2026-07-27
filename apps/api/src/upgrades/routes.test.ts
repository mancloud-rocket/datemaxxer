import { SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { InMemoryProfileStore } from '../profile/store.js';
import { InMemoryAdminStore } from '../admin/store.js';
import type { AvisoSolicitud, Notificador } from './notificador.js';
import { InMemoryUpgradeStore } from './store.js';

const SECRET = 'secreto-de-test-suficientemente-largo';
const ADMIN = '11111111-1111-1111-1111-111111111111';
const USUARIO = '22222222-2222-2222-2222-222222222222';

async function token(sub: string, email?: string): Promise<string> {
  const jwt = new SignJWT(email !== undefined ? { email } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setExpirationTime('1h');
  return jwt.sign(new TextEncoder().encode(SECRET));
}

class NotificadorEspia implements Notificador {
  readonly avisos: AvisoSolicitud[] = [];
  falla = false;
  async avisarSolicitud(aviso: AvisoSolicitud): Promise<void> {
    if (this.falla) throw new Error('resend caído');
    this.avisos.push(aviso);
  }
}

describe('solicitudes de upgrade y admin', () => {
  let app: FastifyInstance;
  let upgradeStore: InMemoryUpgradeStore;
  let profileStore: InMemoryProfileStore;
  let notificador: NotificadorEspia;

  beforeEach(async () => {
    upgradeStore = new InMemoryUpgradeStore();
    profileStore = new InMemoryProfileStore();
    notificador = new NotificadorEspia();
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ADMIN_USER_IDS: `${ADMIN}, otro-admin`,
      ANTHROPIC_API_KEY: undefined,
    });
    app = await buildApp(env, {
      upgradeStore,
      profileStore,
      notificador,
      adminStore: new InMemoryAdminStore([
        {
          id: USUARIO,
          email: 'user@test.com',
          creado: '2026-07-01T00:00:00Z',
          ultimoAcceso: null,
          plan: 'free',
          auditorias: 3,
        },
      ]),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const pedir = async (sub: string, body: Record<string, unknown>, email = 'user@test.com') =>
    app.inject({
      method: 'POST',
      url: '/me/upgrade',
      headers: { authorization: `Bearer ${await token(sub, email)}` },
      payload: body,
    });

  it('guarda la solicitud y avisa al admin', async () => {
    const res = await pedir(USUARIO, { sku: 'kit', mensaje: 'quiero pagar ya' });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ sku: 'kit', estado: 'pendiente', mensaje: 'quiero pagar ya' });
    expect(notificador.avisos).toHaveLength(1);
    expect(notificador.avisos[0]).toMatchObject({
      userId: USUARIO,
      email: 'user@test.com',
      sku: 'kit',
      auditorias: 3,
    });
  });

  it('no duplica el pedido ni el aviso si toca el botón de nuevo', async () => {
    const primera = await pedir(USUARIO, { sku: 'kit' });
    const segunda = await pedir(USUARIO, { sku: 'kit' });

    expect(primera.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().id).toBe(primera.json().id);
    expect(notificador.avisos).toHaveLength(1);
    expect(upgradeStore.filas).toHaveLength(1);
  });

  it('si el mail falla la solicitud igual queda guardada', async () => {
    notificador.falla = true;
    const res = await pedir(USUARIO, { sku: 'copiloto_mensual' });

    expect(res.statusCode).toBe(201);
    expect(await upgradeStore.pendientes()).toHaveLength(1);
  });

  it('rechaza un sku inventado', async () => {
    const res = await pedir(USUARIO, { sku: 'premium_deluxe' });
    expect(res.statusCode).toBe(400);
  });

  it('el usuario ve sus propias solicitudes', async () => {
    await pedir(USUARIO, { sku: 'kit' });
    const res = await app.inject({
      method: 'GET',
      url: '/me/upgrade',
      headers: { authorization: `Bearer ${await token(USUARIO)}` },
    });
    expect(res.json().solicitudes).toHaveLength(1);
  });

  it('sin token no se puede pedir', async () => {
    const res = await app.inject({ method: 'POST', url: '/me/upgrade', payload: { sku: 'kit' } });
    expect(res.statusCode).toBe(401);
  });

  it('un usuario común no ve las rutas de admin', async () => {
    for (const url of ['/admin/solicitudes', '/admin/usuarios']) {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${await token(USUARIO)}` },
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('un usuario común no puede cambiarse el plan', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/usuarios/${USUARIO}/plan`,
      headers: { authorization: `Bearer ${await token(USUARIO)}` },
      payload: { plan: 'copilot' },
    });
    expect(res.statusCode).toBe(404);
    expect(await profileStore.get(USUARIO)).toBeUndefined();
  });

  it('el admin ve las pendientes con email y user id', async () => {
    await pedir(USUARIO, { sku: 'kit' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/solicitudes',
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().solicitudes[0]).toMatchObject({
      userId: USUARIO,
      email: 'user@test.com',
      sku: 'kit',
    });
  });

  it('el admin activa el plan y cierra la solicitud', async () => {
    const pedido = await pedir(USUARIO, { sku: 'kit' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/usuarios/${USUARIO}/plan`,
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
      payload: { plan: 'kit', solicitudId: pedido.json().id },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().plan).toBe('kit');
    expect((await profileStore.get(USUARIO))?.plan).toBe('kit');
    expect(await upgradeStore.pendientes()).toHaveLength(0);
    expect(upgradeStore.filas[0]!.estado).toBe('activada');
  });

  it('bajar a free marca la solicitud como rechazada', async () => {
    const pedido = await pedir(USUARIO, { sku: 'kit' });
    await app.inject({
      method: 'PATCH',
      url: `/admin/usuarios/${USUARIO}/plan`,
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
      payload: { plan: 'free', solicitudId: pedido.json().id },
    });
    expect(upgradeStore.filas[0]!.estado).toBe('rechazada');
  });

  it('cerrada la solicitud, puede pedir de nuevo', async () => {
    const pedido = await pedir(USUARIO, { sku: 'kit' });
    await app.inject({
      method: 'PATCH',
      url: `/admin/usuarios/${USUARIO}/plan`,
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
      payload: { plan: 'kit', solicitudId: pedido.json().id },
    });
    const nueva = await pedir(USUARIO, { sku: 'kit' });
    expect(nueva.statusCode).toBe(201);
    expect(notificador.avisos).toHaveLength(2);
  });

  it('el admin rechaza un plan inventado', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/usuarios/${USUARIO}/plan`,
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
      payload: { plan: 'dios' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /me marca quién es admin y quién no', async () => {
    const deAdmin = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
    });
    const deUsuario = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${await token(USUARIO)}` },
    });
    expect(deAdmin.json().esAdmin).toBe(true);
    expect(deUsuario.json().esAdmin).toBe(false);
  });

  it('el admin lista usuarios', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/usuarios',
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
    });
    expect(res.json().usuarios[0]).toMatchObject({ email: 'user@test.com', auditorias: 3 });
  });
});

describe('sin ADMIN_USER_IDS configurado', () => {
  it('nadie es admin', async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ADMIN_USER_IDS: undefined,
      ANTHROPIC_API_KEY: undefined,
    });
    const app = await buildApp(env, {});
    const res = await app.inject({
      method: 'GET',
      url: '/admin/solicitudes',
      headers: { authorization: `Bearer ${await token(ADMIN)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('ResendNotificador', () => {
  afterEach(() => vi.restoreAllMocks());

  it('manda el mail al admin con el asunto correcto', async () => {
    const { ResendNotificador } = await import('./notificador.js');
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const n = new ResendNotificador({
      apiKey: 'key',
      from: 'Datemaxxer <onboarding@resend.dev>',
      to: 'fernando@test.com',
      panelUrl: 'https://app.test/admin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await n.avisarSolicitud({ userId: USUARIO, email: 'user@test.com', sku: 'kit', mensaje: null });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['fernando@test.com']);
    expect(body.subject).toContain('user@test.com');
    expect(body.html).toContain('https://app.test/admin');
  });

  it('escapa el mensaje del usuario', async () => {
    const { ResendNotificador } = await import('./notificador.js');
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const n = new ResendNotificador({
      apiKey: 'key',
      from: 'f',
      to: 't@t.com',
      panelUrl: 'https://app.test/admin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await n.avisarSolicitud({
      userId: USUARIO,
      email: null,
      sku: 'kit',
      mensaje: '<script>alert(1)</script>',
    });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.html).not.toContain('<script>');
    expect(body.html).toContain('&lt;script&gt;');
  });

  it('tira error si Resend responde mal', async () => {
    const { ResendNotificador } = await import('./notificador.js');
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 422 }));
    const n = new ResendNotificador({
      apiKey: 'key',
      from: 'f',
      to: 't@t.com',
      panelUrl: 'https://app.test/admin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      n.avisarSolicitud({ userId: USUARIO, email: null, sku: 'kit', mensaje: null }),
    ).rejects.toThrow(/422/);
  });
});

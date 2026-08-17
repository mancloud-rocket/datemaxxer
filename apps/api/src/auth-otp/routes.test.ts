import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import type { GeneradorOtp } from './supabase.js';
import type { MailerOtp } from './mailer.js';

const SECRET = 'secreto-de-test-suficientemente-largo';

class GeneradorEspia implements GeneradorOtp {
  readonly pedidos: string[] = [];
  falla = false;
  async generarCodigo(email: string): Promise<string> {
    if (this.falla) throw new Error('gotrue caído');
    this.pedidos.push(email);
    return '12345678';
  }
}

class MailerEspia implements MailerOtp {
  readonly mandados: Array<{ email: string; codigo: string }> = [];
  falla = false;
  async mandarCodigo(email: string, codigo: string): Promise<void> {
    if (this.falla) throw new Error('resend caído');
    this.mandados.push({ email, codigo });
  }
}

describe('POST /auth/otp', () => {
  let app: FastifyInstance;
  let generador: GeneradorEspia;
  let mailer: MailerEspia;

  async function armar(deps?: { sinMailer?: boolean }): Promise<void> {
    generador = new GeneradorEspia();
    mailer = new MailerEspia();
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
    });
    app = await buildApp(env, {
      otpGenerador: generador,
      ...(deps?.sinMailer ? {} : { otpMailer: mailer }),
    });
  }

  beforeEach(async () => {
    await armar();
  });

  afterEach(async () => {
    await app.close();
  });

  it('genera el código y lo manda al correo normalizado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: '  Flor@Ejemplo.COM ' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(generador.pedidos).toEqual(['flor@ejemplo.com']);
    expect(mailer.mandados).toEqual([{ email: 'flor@ejemplo.com', codigo: '12345678' }]);
  });

  it('rechaza un correo inválido sin tocar el generador', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'esto-no-es-un-correo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation');
    expect(generador.pedidos).toEqual([]);
  });

  it('contesta 503 y no simula cuando falta el mailer', async () => {
    await app.close();
    await armar({ sinMailer: true });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'flor@ejemplo.com' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('mail_no_configurado');
  });

  it('frena el segundo pedido del mismo correo dentro del intervalo', async () => {
    const primero = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'flor@ejemplo.com' },
    });
    expect(primero.statusCode).toBe(200);
    const segundo = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'FLOR@ejemplo.com' },
    });
    expect(segundo.statusCode).toBe(429);
    expect(segundo.json().error).toBe('otp_muy_seguido');
    expect(mailer.mandados).toHaveLength(1);
  });

  it('si el mail falla contesta 502 y NO arma throttle: se puede reintentar ya', async () => {
    mailer.falla = true;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'flor@ejemplo.com' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('mail_fallo');

    mailer.falla = false;
    const reintento = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'flor@ejemplo.com' },
    });
    expect(reintento.statusCode).toBe(200);
  });

  it('si GoTrue falla contesta 502 tipado', async () => {
    generador.falla = true;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp',
      payload: { email: 'flor@ejemplo.com' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('otp_fallo');
    expect(mailer.mandados).toEqual([]);
  });
});

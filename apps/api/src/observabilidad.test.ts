import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import { construirReporter, NoopReporter, type Contexto, type Reporter } from './observabilidad.js';
import { InMemoryProfileStore } from './profile/store.js';

const SECRET = 'percentil-test-secret-32-chars-min';

class ReporterEspia implements Reporter {
  readonly capturados: Array<{ error: unknown; contexto?: Contexto }> = [];
  capturar(error: unknown, contexto?: Contexto): void {
    this.capturados.push(contexto !== undefined ? { error, contexto } : { error });
  }
}

describe('construirReporter', () => {
  it('sin DSN devuelve el que no hace nada', () => {
    expect(construirReporter({ dsn: undefined, entorno: 'test' })).toBeInstanceOf(NoopReporter);
    expect(construirReporter({ dsn: '', entorno: 'test' })).toBeInstanceOf(NoopReporter);
  });

  it('el noop no explota al capturar', () => {
    expect(() => new NoopReporter().capturar(new Error('x'))).not.toThrow();
  });
});

describe('qué se reporta desde la API', () => {
  let app: FastifyInstance;
  let reporter: ReporterEspia;

  beforeEach(async () => {
    reporter = new ReporterEspia();
    const env = loadEnv({
      NODE_ENV: 'test',
      SUPABASE_URL: undefined,
      SUPABASE_JWT_SECRET: SECRET,
      ANTHROPIC_API_KEY: undefined,
      RATE_LIMIT_MAX: '1000',
    });
    app = await buildApp(env, { reporter, profileStore: new InMemoryProfileStore() });
  });

  afterEach(async () => {
    await app.close();
  });

  it('NO reporta los 4xx: son el sistema funcionando', async () => {
    // Un 401 sin token o un 404 de ruta inexistente no son incidentes.
    // Reportarlos ahoga el canal y el que importa se pierde entre el ruido.
    await app.inject({ method: 'GET', url: '/me' });
    await app.inject({ method: 'GET', url: '/ruta-que-no-existe' });
    expect(reporter.capturados).toHaveLength(0);
  });

  it('reporta los 5xx con la ruta', async () => {
    app.get('/boom', async () => {
      throw new Error('se rompió algo de verdad');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    expect(reporter.capturados).toHaveLength(1);
    expect(reporter.capturados[0]!.contexto?.ruta).toBe('/boom');
  });

  it('el usuario sigue viendo un mensaje genérico, no el error interno', async () => {
    app.get('/boom-secreto', async () => {
      throw new Error('connection string: postgres://secreto');
    });
    const res = await app.inject({ method: 'GET', url: '/boom-secreto' });
    expect(res.json().message).toBe('Error interno');
    expect(res.payload).not.toContain('postgres://');
  });
});

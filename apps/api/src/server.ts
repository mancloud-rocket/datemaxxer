import { buildApp } from './app.js';
import { loadEnv } from './env.js';

try {
  process.loadEnvFile(); // ./.env si existe (Node 21.7+)
} catch {
  // sin .env: se usa el entorno del proceso
}

const env = loadEnv();
const app = await buildApp(env);

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/**
 * Barrido de arranque: el proceso anterior pudo morir a mitad de una auditoría
 * (deploy, sleep del plan free de Render, OOM) y esas filas quedan "analizando"
 * para siempre consumiendo el cupo del usuario. Se cosechan acá, ni bien
 * levantamos, para que el polling del front vea el error y pueda reintentar.
 * No bloquea el arranque: si falla, se loguea y sigue.
 */
void app.auditStore
  .failStale(env.AUDIT_STALE_AFTER_MS)
  .then((n) => {
    if (n > 0) app.log.warn({ cosechadas: n }, 'auditorías huérfanas marcadas como error');
  })
  .catch((err: unknown) => app.log.error({ err }, 'falló el barrido de auditorías huérfanas'));

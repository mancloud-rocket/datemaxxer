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

import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    // Verificación de JWT: JWKS del proyecto (SUPABASE_URL) o secret legacy HS256.
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_JWT_SECRET: z.string().min(16).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    // Motores de IA: sin key la API bootea igual pero /audit responde 503
    ANTHROPIC_API_KEY: z.string().min(20).optional(),
    AUDIT_MODEL: z.string().min(1).optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    // Límite específico del endpoint de auditoría (caro: llama a Claude)
    AUDIT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  });
// Nota: SUPABASE_* son opcionales para que la API bootee en dev sin proyecto Supabase;
// las rutas autenticadas responden 503 hasta que se configure (src/auth.ts).

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`).join('; ');
    throw new Error(`Configuración de entorno inválida: ${detail}`);
  }
  return parsed.data;
}

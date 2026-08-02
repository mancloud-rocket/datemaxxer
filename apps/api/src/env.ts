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
    // Auditorías gratis por cuenta (decisión de producto: 1)
    AUDIT_FREE_LIMIT: z.coerce.number().int().positive().default(1),
    // Techo de una auditoría completa (2 llamadas al modelo). Pasado esto se marca
    // error y se devuelve el cupo: nunca queda "analizando" para siempre.
    AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    // Una auditoría "analizando" más vieja que esto quedó huérfana de un reinicio
    // (deploy o el sleep del plan free de Render): se cosecha como error.
    AUDIT_STALE_AFTER_MS: z.coerce.number().int().positive().default(900_000),
    // Origins permitidos para la web app, separados por coma
    CORS_ORIGINS: z.string().optional(),
    // Facturación con Paddle (Merchant of Record). Sin el secreto, el webhook
    // responde 503 en vez de aceptar eventos sin verificar.
    PADDLE_WEBHOOK_SECRET: z.string().min(10).optional(),
    // price ids de Paddle: definen qué compró el usuario en cada evento.
    PADDLE_PRICE_KIT: z.string().optional(),
    PADDLE_PRICE_COPILOTO: z.string().optional(),
    // F5 - lectura de perfil ajeno. free y kit son cupo de por vida; copilot es
    // mensual corredizo, porque es lo que sostiene la suscripción.
    PROFILE_READ_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    PROFILE_READ_FREE_LIMIT: z.coerce.number().int().nonnegative().default(1),
    PROFILE_READ_KIT_LIMIT: z.coerce.number().int().nonnegative().default(5),
    PROFILE_READ_COPILOT_LIMIT: z.coerce.number().int().nonnegative().default(60),
    PROFILE_READ_VENTANA_DIAS: z.coerce.number().int().positive().default(30),
    PROFILE_READ_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    // Coach de confianza. El cupo por plan es la palanca de upsell: gratis alcanza
    // para probarlo, Copiloto lo abre sin tope.
    COACH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(15),
    COACH_FREE_LIMIT: z.coerce.number().int().nonnegative().default(10),
    COACH_KIT_LIMIT: z.coerce.number().int().nonnegative().default(40),
    // Admins: uids de Supabase separados por coma. Sin esto, /admin/* responde 404
    // para todo el mundo. Va por env y no por columna en base a propósito.
    ADMIN_USER_IDS: z.string().optional(),
    // Aviso por mail cuando alguien pide un plan. Sin key, la solicitud igual se
    // guarda y aparece en el panel: el mail es empujón, no fuente de verdad.
    RESEND_API_KEY: z.string().min(10).optional(),
    RESEND_FROM: z.string().default('Datemaxxer <onboarding@resend.dev>'),
    ADMIN_EMAIL: z.string().email().optional(),
    // Link al panel que se mete en el mail de aviso.
    ADMIN_PANEL_URL: z.string().url().default('https://datemaxxer.vercel.app/admin'),
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

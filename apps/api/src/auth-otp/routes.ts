import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, ValidationError } from '../errors.js';
import type { GeneradorOtp } from './supabase.js';
import type { MailerOtp } from './mailer.js';

/**
 * POST /auth/otp - "mandame el código".
 *
 * Público a propósito: es la puerta de entrada, no hay token todavía. La
 * respuesta es la misma exista o no la cuenta (se crea en el momento), así el
 * endpoint no sirve para enumerar correos.
 *
 * Dos frenos contra el uso como cañón de spam: el rate limit por IP de la ruta
 * y un intervalo mínimo por correo en memoria (si el proceso se reinicia se
 * pierde, y no importa: es cortesía anti doble clic, el freno duro es por IP).
 */

const Cuerpo = z.object({ email: z.string().trim().toLowerCase().email() });

export interface AuthOtpRoutesDeps {
  /** undefined = falta SUPABASE_* en el entorno. */
  generador: GeneradorOtp | undefined;
  /** undefined = falta RESEND_API_KEY: el endpoint contesta 503, no simula. */
  mailer: MailerOtp | undefined;
  rateLimitMax: number;
  /** Intervalo mínimo entre códigos para el mismo correo. */
  intervaloPorEmailMs?: number;
  ahora?: () => number;
}

export function registerAuthOtpRoutes(app: FastifyInstance, deps: AuthOtpRoutesDeps): void {
  const intervalo = deps.intervaloPorEmailMs ?? 45_000;
  const ahora = deps.ahora ?? Date.now;
  const ultimoEnvio = new Map<string, number>();

  app.post(
    '/auth/otp',
    {
      config: {
        rateLimit: {
          max: deps.rateLimitMax,
          timeWindow: '10 minutes',
        },
      },
    },
    async (request) => {
      const parsed = Cuerpo.safeParse(request.body ?? {});
      if (!parsed.success) throw new ValidationError('email: correo inválido');
      const email = parsed.data.email;

      if (deps.generador === undefined || deps.mailer === undefined) {
        request.log.error('POST /auth/otp sin SUPABASE_* o RESEND_API_KEY configurados');
        throw new AppError(
          'mail_no_configurado',
          'El ingreso por correo no está disponible por ahora.',
          503,
        );
      }

      const previo = ultimoEnvio.get(email);
      if (previo !== undefined && ahora() - previo < intervalo) {
        throw new AppError(
          'otp_muy_seguido',
          'Ya te mandamos un código hace un momento. Revisá tu correo.',
          429,
        );
      }

      // El mapa solo crece con correos válidos que pasaron el rate limit por IP;
      // igual se poda para que un proceso de meses no acumule sin techo.
      if (ultimoEnvio.size > 10_000) {
        const corte = ahora() - intervalo;
        for (const [k, v] of ultimoEnvio) if (v < corte) ultimoEnvio.delete(k);
      }

      let codigo: string;
      try {
        codigo = await deps.generador.generarCodigo(email);
      } catch (error) {
        request.log.error({ err: error }, 'generar OTP falló');
        throw new AppError('otp_fallo', 'No pudimos generar el código. Probá de nuevo.', 502);
      }

      try {
        await deps.mailer.mandarCodigo(email, codigo);
      } catch (error) {
        request.log.error({ err: error }, 'mandar OTP por mail falló');
        throw new AppError(
          'mail_fallo',
          'No pudimos mandar el correo. Probá de nuevo en un rato.',
          502,
        );
      }

      ultimoEnvio.set(email, ahora());
      return { ok: true };
    },
  );
}

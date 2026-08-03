import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { NuevaBio } from '@percentil/contracts';
import { AppError, ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import type { ProfileStore } from '../profile/store.js';
import type { BioEngine } from '../engines/bio.js';

/**
 * POST /bio - F3.
 *
 * Síncrono: es una llamada de texto sin visión, tarda pocos segundos.
 *
 * Va detrás del Kit, no del plan gratis: es parte de lo que se paga. El plan
 * `free` recibe 402 con el mensaje de upgrade, que es lo que la página de venta
 * viene prometiendo desde el principio.
 */

export interface BioRoutesDeps {
  profileStore: ProfileStore;
  auditStore: AuditStore;
  engine: BioEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
}

export function registerBioRoutes(app: FastifyInstance, deps: BioRoutesDeps): void {
  const { profileStore, auditStore, engine, authenticate } = deps;

  app.post(
    '/bio',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'El motor de bio no está disponible', 503);
      }
      const parsed = NuevaBio.safeParse(request.body);
      if (!parsed.success) {
        const detalle = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationError(detalle);
      }

      const perfil = await profileStore.get(request.userId);
      if ((perfil?.plan ?? 'free') === 'free') {
        throw new AppError(
          'plan_requerido',
          'Escribir tu bio viene con el Kit.',
          402,
        );
      }

      // El arquetipo de su última auditoría, para que la bio no contradiga las
      // fotos. Si no auditó todavía, la bio sale igual.
      const ultima = await auditStore.latestForUser(request.userId);
      const arquetipo =
        ultima?.status === 'done' ? ultima.result?.arquetipo_detectado.nombre : undefined;

      return engine.run({
        intencion: parsed.data.intencion,
        plataforma: parsed.data.plataforma,
        datos: parsed.data.datos,
        region: perfil?.region ?? 'neutro',
        ...(parsed.data.bio_actual !== undefined ? { bioActual: parsed.data.bio_actual } : {}),
        ...(arquetipo !== undefined ? { arquetipo } : {}),
      });
    },
  );
}

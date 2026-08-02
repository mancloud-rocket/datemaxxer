import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { AppError, ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import type { ProfileStore } from '../profile/store.js';
import type { RadarEngine } from '../engines/radar.js';
import type { ProfilePhoto, ProfilePhotoMediaType } from '../engines/profileread.js';
import { RadarRpcMissingError, type RadarStore } from './store.js';

/**
 * POST /radar - lectura rápida, síncrona.
 *
 * A diferencia de F1 y F5 no hay 202 + polling: el radar existe para contestar
 * en menos de 5 segundos, y hacer polling sobre algo que dura 4 agrega round
 * trips y complica la UI para nada. La request se mantiene abierta y devuelve
 * el resultado.
 *
 * Los screenshots no se guardan, igual que en F5.
 */

const ALLOWED_MEDIA_TYPES = new Set<ProfilePhotoMediaType>(['image/jpeg', 'image/png', 'image/webp']);

/** Tope bajo: cada MB de entrada es latencia, y el radar se juega contra el reloj. */
const MAX_PAYLOAD_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_FOTOS = 4;

export interface RadarRoutesDeps {
  store: RadarStore;
  profileStore: ProfileStore;
  auditStore: AuditStore;
  engine: RadarEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  limites: { free: number; kit: number; copilot: number };
  ventanaDias: number;
}

export function registerRadarRoutes(app: FastifyInstance, deps: RadarRoutesDeps): void {
  const { store, profileStore, auditStore, engine, authenticate } = deps;

  app.post(
    '/radar',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'El radar no está disponible', 503);
      }
      const userId = request.userId;
      const plan = (await profileStore.get(userId))?.plan ?? 'free';
      const quota = {
        limite: plan === 'copilot' ? deps.limites.copilot : plan === 'kit' ? deps.limites.kit : deps.limites.free,
        sinLimite: false,
        ventanaDias: deps.ventanaDias,
      };

      const photos: ProfilePhoto[] = [];
      let bytes = 0;
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        if (part.fieldname !== 'photos') {
          await part.toBuffer();
          continue;
        }
        if (!ALLOWED_MEDIA_TYPES.has(part.mimetype as ProfilePhotoMediaType)) {
          throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
        }
        const buffer = await part.toBuffer();
        bytes += buffer.byteLength;
        if (bytes > MAX_PAYLOAD_TOTAL_BYTES) {
          throw new ValidationError('Las capturas pesan demasiado para el radar. Mandá menos, o más chicas.');
        }
        photos.push({
          data: buffer.toString('base64'),
          mediaType: part.mimetype as ProfilePhotoMediaType,
        });
      }

      if (photos.length < 1 || photos.length > MAX_FOTOS) {
        throw new ValidationError(`El radar acepta de 1 a ${MAX_FOTOS} capturas, llegaron ${photos.length}`);
      }

      let reserva: string | null;
      try {
        reserva = await store.reservar(userId, quota);
      } catch (err) {
        if (!(err instanceof RadarRpcMissingError)) throw err;
        request.log.error(
          'FALTA APLICAR 20260802140001_radar.sql: el cupo del radar queda expuesto a la carrera',
        );
        reserva = 'sin-rpc';
      }
      if (reserva === null) {
        throw new AppError('limit_reached', 'Te quedaste sin radares este mes. El Copiloto los abre.', 409);
      }

      try {
        const globalUsuario = (await auditStore.latestIndiceForUser(userId))?.global ?? null;
        const salida = await engine.run({ photos, globalUsuario });

        if (!salida.ok) {
          // Un rechazo no gasta radar: se libera la reserva y se responde 422.
          await store.liberar(reserva).catch(() => undefined);
          reply.code(422);
          return salida.rechazo;
        }

        await store
          .completar(reserva, {
            msMotor: salida.result.ms_motor,
            bucket: salida.result.indice.bucket,
            veredicto: salida.result.veredicto,
          })
          .catch((err: unknown) => {
            // La telemetría no puede voltear la respuesta del usuario.
            request.log.error({ err }, 'no se pudo guardar la telemetría del radar');
          });

        // Se vigila explícitamente: pasado el presupuesto, el radar dejó de serlo.
        if (salida.result.ms_motor > 5000) {
          request.log.warn(
            { ms: salida.result.ms_motor },
            'el radar pasó su presupuesto de latencia (5s)',
          );
        }
        return salida.result;
      } catch (err) {
        // Si el motor falla, el usuario no pierde el radar.
        await store.liberar(reserva).catch(() => undefined);
        throw err;
      }
    },
  );
}

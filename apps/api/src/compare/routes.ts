import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { AppError, ValidationError } from '../errors.js';
import type { ProfileStore } from '../profile/store.js';
import type { CompareEngine } from '../engines/compare.js';
import type { ProfilePhoto, ProfilePhotoMediaType } from '../engines/profileread.js';
import { RadarRpcMissingError, type RadarStore } from '../radar/store.js';

/**
 * POST /compare - su mejor foto contra la de ella.
 *
 * Síncrono como el radar: son dos fotos y una llamada.
 *
 * El cupo sale del mismo pozo que el radar, a propósito. Son la misma familia de
 * uso (rápido, repetible, sobre perfiles ajenos) y separar los contadores le
 * daría al usuario dos presupuestos para gastar sin que eso signifique nada para
 * el producto.
 *
 * Las fotos no se guardan, igual que en F5 y el radar.
 */

const ALLOWED = new Set<ProfilePhotoMediaType>(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 12 * 1024 * 1024;

export interface CompareRoutesDeps {
  store: RadarStore;
  profileStore: ProfileStore;
  engine: CompareEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  limites: { free: number; kit: number; copilot: number };
  ventanaDias: number;
}

export function registerCompareRoutes(app: FastifyInstance, deps: CompareRoutesDeps): void {
  const { store, profileStore, engine, authenticate } = deps;

  app.post(
    '/compare',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'El comparador no está disponible', 503);
      }
      const userId = request.userId;
      const plan = (await profileStore.get(userId))?.plan ?? 'free';
      const quota = {
        limite: plan === 'copilot' ? deps.limites.copilot : plan === 'kit' ? deps.limites.kit : deps.limites.free,
        sinLimite: false,
        ventanaDias: deps.ventanaDias,
      };

      let fotoUsuario: ProfilePhoto | undefined;
      let fotoObjetivo: ProfilePhoto | undefined;
      let bytes = 0;

      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        const esUsuario = part.fieldname === 'usuario';
        const esObjetivo = part.fieldname === 'objetivo';
        if (!esUsuario && !esObjetivo) {
          await part.toBuffer();
          continue;
        }
        if (!ALLOWED.has(part.mimetype as ProfilePhotoMediaType)) {
          throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
        }
        const buffer = await part.toBuffer();
        bytes += buffer.byteLength;
        if (bytes > MAX_BYTES) throw new ValidationError('Las fotos pesan demasiado.');
        const foto: ProfilePhoto = {
          data: buffer.toString('base64'),
          mediaType: part.mimetype as ProfilePhotoMediaType,
        };
        if (esUsuario) fotoUsuario = foto;
        else fotoObjetivo = foto;
      }

      if (!fotoUsuario || !fotoObjetivo) {
        throw new ValidationError('Hacen falta las dos fotos: campo "usuario" y campo "objetivo"');
      }

      let reserva: string | null;
      try {
        reserva = await store.reservar(userId, quota);
      } catch (err) {
        if (!(err instanceof RadarRpcMissingError)) throw err;
        request.log.error('FALTA APLICAR 20260802140001_radar.sql: el cupo del comparador queda expuesto');
        reserva = 'sin-rpc';
      }
      if (reserva === null) {
        throw new AppError('limit_reached', 'Te quedaste sin comparaciones este mes. El Copiloto las abre.', 409);
      }

      try {
        const salida = await engine.run({ fotoUsuario, fotoObjetivo });
        if (!salida.ok) {
          await store.liberar(reserva).catch(() => undefined);
          reply.code(422);
          return salida.rechazo;
        }
        await store
          .completar(reserva, {
            msMotor: 0,
            bucket: String(salida.result.usuario.global),
            veredicto: 'compare',
          })
          .catch(() => undefined);
        return salida.result;
      } catch (err) {
        await store.liberar(reserva).catch(() => undefined);
        throw err;
      }
    },
  );
}

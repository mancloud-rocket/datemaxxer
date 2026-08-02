import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { Region } from '@percentil/contracts';
import { AppError, EngineError, ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import type { ProfileStore } from '../profile/store.js';
import type {
  ProfilePhoto,
  ProfilePhotoMediaType,
  ProfileReadEngine,
} from '../engines/profileread.js';
import type { Plataforma } from '../engines/market.js';
import {
  QuotaRpcMissingError,
  type ProfileReadRecord,
  type ProfileReadStore,
} from './store.js';

/**
 * F5 - rutas de lectura de perfil ajeno.
 *   POST /profile-read        → 202 + procesamiento en background
 *   GET  /profile-read/:id    → estado y resultado (polling)
 *   GET  /me/profile-reads    → historial
 *
 * Mismo patrón que F1: 202 + polling en vez de mantener la request abierta, con
 * cupo atómico, techo de tiempo y cosecha de las que quedan colgadas.
 *
 * Una diferencia que importa: acá los screenshots NO se archivan. En F1 las
 * fotos son del propio usuario y sirven para el histórico; acá son de un tercero
 * que no dio consentimiento, y en un rechazo por menor aparente guardarlas sería
 * el peor error posible del producto. Se procesan en memoria y se descartan.
 */

const ALLOWED_MEDIA_TYPES = new Set<ProfilePhotoMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Techo del payload completo, aparte del límite por archivo de multipart. */
const MAX_PAYLOAD_TOTAL_BYTES = 32 * 1024 * 1024;

const Campos = z.object({
  region: Region.default('neutro'),
  bio: z.string().max(2000).optional(),
  plataforma: z.enum(['tinder', 'bumble', 'hinge', 'otra']).default('otra'),
  verificada: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .default('false'),
});

export function vistaPublica(record: ProfileReadRecord) {
  return {
    read_id: record.id,
    status: record.status,
    progress: record.progress,
    created_at: record.createdAt.toISOString(),
    ...(record.status === 'done' ? { result: record.result } : {}),
    ...(record.status === 'rechazado' ? { rechazo: record.rechazo } : {}),
    ...(record.status === 'error' ? { error: record.error } : {}),
  };
}

export interface ProfileReadRoutesDeps {
  store: ProfileReadStore;
  profileStore: ProfileStore;
  auditStore: AuditStore;
  engine: ProfileReadEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  /** Cupo por plan. `null` en copilot = sin tope. */
  limites: { free: number; kit: number; copilot: number | null };
  /** Ventana del cupo del plan pago, en días. */
  ventanaDiasCopilot: number;
  timeoutMs: number;
}

export function registerProfileReadRoutes(app: FastifyInstance, deps: ProfileReadRoutesDeps): void {
  const { store, profileStore, auditStore, engine, authenticate } = deps;

  function cupoDe(plan: 'free' | 'kit' | 'copilot') {
    if (plan === 'copilot') {
      return deps.limites.copilot === null
        ? { limite: 0, sinLimite: true, ventanaDias: 0 }
        : { limite: deps.limites.copilot, sinLimite: false, ventanaDias: deps.ventanaDiasCopilot };
    }
    return {
      limite: plan === 'kit' ? deps.limites.kit : deps.limites.free,
      sinLimite: false,
      ventanaDias: 0, // free y kit: cupo de por vida, no mensual
    };
  }

  app.post(
    '/profile-read',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'La lectura de perfiles no está disponible', 503);
      }
      const userId = request.userId;
      const perfil = await profileStore.get(userId);
      const quota = cupoDe(perfil?.plan ?? 'free');

      const photos: ProfilePhoto[] = [];
      const campos: Record<string, string> = {};
      let bytes = 0;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'photos') {
            await part.toBuffer(); // drenar para no colgar el stream
            continue;
          }
          if (!ALLOWED_MEDIA_TYPES.has(part.mimetype as ProfilePhotoMediaType)) {
            throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
          }
          const buffer = await part.toBuffer();
          bytes += buffer.byteLength;
          if (bytes > MAX_PAYLOAD_TOTAL_BYTES) {
            throw new ValidationError(
              `Los screenshots suman demasiado peso (máximo ${Math.round(MAX_PAYLOAD_TOTAL_BYTES / 1024 / 1024)}MB en total).`,
            );
          }
          photos.push({
            data: buffer.toString('base64'),
            mediaType: part.mimetype as ProfilePhotoMediaType,
          });
        } else if (typeof part.value === 'string') {
          campos[part.fieldname] = part.value;
        }
      }

      const parsed = Campos.safeParse(campos);
      if (!parsed.success) {
        const detalle = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationError(detalle);
      }
      if (photos.length < 1 || photos.length > 9) {
        throw new ValidationError(`Se esperan de 1 a 9 screenshots, llegaron ${photos.length}`);
      }

      const id = randomUUID();
      const nueva: ProfileReadRecord = {
        id,
        userId,
        status: 'analyzing',
        progress: { fotos_analizadas: 0, total: photos.length },
        createdAt: new Date(),
      };

      let creada: boolean;
      try {
        creada = await store.createWithQuota(nueva, quota);
      } catch (err) {
        if (!(err instanceof QuotaRpcMissingError)) throw err;
        // Sin la función de cupo la carrera vuelve a ser posible. Se sigue igual
        // para no dejar la función caída, pero se loguea como error.
        request.log.error(
          { readId: id },
          'FALTA APLICAR 20260802130001_cupo_profile_reads.sql: el cupo queda expuesto a la carrera',
        );
        creada = true;
      }
      if (!creada) {
        throw new AppError(
          'limit_reached',
          'Te quedaste sin lecturas de perfil. El Copiloto las abre.',
          409,
        );
      }

      // El total real recién se sabe acá: la fila se crea con 0 porque la función
      // de cupo no recibe las fotos.
      void store.update(id, { progress: nueva.progress }).catch(() => undefined);

      const procesar = async (): Promise<void> => {
        let vencimiento: NodeJS.Timeout | undefined;
        try {
          const limite = new Promise<never>((_, reject) => {
            vencimiento = setTimeout(
              () => reject(new EngineError('La lectura tardó demasiado y se canceló')),
              deps.timeoutMs,
            );
          });
          // El índice del usuario es lo que habilita el gap. Si no tiene, la
          // lectura sale igual con gap null y la UI le ofrece medirse.
          const globalUsuario = (await auditStore.latestIndiceForUser(userId))?.global ?? null;

          const salida = await Promise.race([
            engine.run(
              {
                photos,
                region: parsed.data.region,
                ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
                plataforma: parsed.data.plataforma as Plataforma,
                verificada: parsed.data.verificada,
                globalUsuario,
              },
              {
                onProgress: (progress) => {
                  void store.update(id, { progress }).catch(() => undefined);
                },
              },
            ),
            limite,
          ]);

          if (salida.ok) {
            await store.update(id, { status: 'done', result: salida.result });
          } else {
            // Rechazo del motor: estado propio, no error. No se reintenta y no
            // quema cupo (lo garantiza la función de Postgres).
            await store.update(id, { status: 'rechazado', rechazo: salida.rechazo });
          }
        } catch (err) {
          request.log.error({ err, readId: id }, 'la lectura de perfil falló');
          await store
            .update(id, {
              status: 'error',
              error: err instanceof AppError ? err.message : 'No pudimos leer este perfil.',
            })
            .catch(() => undefined);
        } finally {
          if (vencimiento !== undefined) clearTimeout(vencimiento);
        }
      };
      void procesar();

      reply.code(202);
      return { read_id: id, status: 'analyzing' as const };
    },
  );

  app.get('/profile-read/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const record = await store.get(id);
    // Mismo 404 para "no existe" y "es de otro": no confirma la existencia.
    if (!record || record.userId !== request.userId) {
      throw new AppError('not_found', 'No encontramos esa lectura', 404);
    }
    return vistaPublica(record);
  });

  app.get('/me/profile-reads', { preHandler: [authenticate] }, async (request) => {
    const records = await store.listForUser(request.userId);
    return { reads: records.map(vistaPublica) };
  });
}

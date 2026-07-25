import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { Arquetipo, Region } from '@percentil/contracts';
import { AppError, EngineError, NotFoundError, ValidationError } from '../errors.js';
import { rateLimitKey } from '../rate-limit.js';
import type { AuditEngine, AuditPhoto, AuditPhotoMediaType } from '../engines/audit.js';
import type { ProfileStore } from '../profile/store.js';
import type { PhotoArchive, PhotoToArchive } from './photo-archive.js';
import { QuotaRpcMissingError, type AuditRecord, type AuditStore } from './store.js';

/**
 * Flujo de auditoría DENTRO de la app (requiere login Supabase; pivote 18-jul):
 * POST /audit   (auth, multipart: photos[] 4-9, bio, region, arquetipo_objetivo) → 202 {audit_id}
 * GET  /audit/:id  (auth, solo dueño) → {status, progress, result?}
 * GET  /me/audit   (auth) → {audit: <última del usuario> | null}
 * Límite: AUDIT_FREE_LIMIT auditorías (analyzing|done) por cuenta; las fallidas no queman cupo.
 */

const ALLOWED_MEDIA_TYPES = new Set<AuditPhotoMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Techo del payload sumado de todas las fotos. El límite por archivo (8MB en el
 * plugin de multipart) no alcanza: 9 archivos al máximo son 72MB en buffers, más
 * el ~33% que infla el base64, contra los 512MB del plan de Render. Dos requests
 * así en paralelo tumban el proceso (y con él, todas las auditorías en vuelo).
 * El cliente además redimensiona antes de subir, así que el uso real es ~10x menor.
 */
const MAX_PAYLOAD_TOTAL_BYTES = 32 * 1024 * 1024;

const Fields = z.object({
  bio: z.string().max(2000).default(''),
  region: Region.default('neutro'),
  arquetipo_objetivo: Arquetipo.nullable().default(null),
});

export function publicView(record: AuditRecord) {
  return {
    audit_id: record.id,
    status: record.status,
    progress: record.progress,
    created_at: record.createdAt.toISOString(),
    ...(record.status === 'done' ? { result: record.result } : {}),
    ...(record.status === 'error' ? { error: record.error } : {}),
  };
}

export interface AuditRoutesDeps {
  store: AuditStore;
  profileStore: ProfileStore;
  engine: AuditEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  freeLimit: number;
  /** Techo total de una auditoría; pasado esto se marca error. */
  timeoutMs: number;
  /** Antigüedad a partir de la cual una auditoría "analizando" se da por muerta. */
  staleAfterMs: number;
  /** Archiva las fotos originales (habilita F2 y mostrarlas en el informe). */
  photoArchive: PhotoArchive;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { store, profileStore, engine, authenticate } = deps;

  app.post(
    '/audit',
    {
      preHandler: [authenticate],
      // Por usuario, no por IP: en LATAM mucho tráfico móvil comparte IP de carrier
      // (CGNAT) y un límite por IP castigaría a usuarios que no tienen nada que ver.
      config: {
        rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute', keyGenerator: rateLimitKey },
      },
    },
    async (request, reply) => {
      if (!engine) {
        throw new AppError('engine_unavailable', 'Motor de auditoría no configurado (falta ANTHROPIC_API_KEY)', 503);
      }
      if (!request.isMultipart()) {
        throw new ValidationError('Se espera multipart/form-data');
      }
      const userId = request.userId;

      // Antes de contar cupo, liberar las que quedaron huérfanas de un reinicio:
      // si no, una auditoría muerta consume el cupo gratis del usuario para siempre.
      await store.failStale(deps.staleAfterMs).catch((err: unknown) => {
        request.log.warn({ err }, 'no se pudo cosechar auditorías colgadas');
      });

      // plan !== 'free' (Kit/Copilot, o un admin que se lo otorgó a mano) → sin cupo.
      // Simplificación provisoria hasta que el checkout del Kit defina entitlements reales.
      const profile = await profileStore.get(userId);
      const sinLimite = (profile?.plan ?? 'free') !== 'free';

      // Pre-chequeo fail-fast: corta antes de subir y parsear decenas de MB.
      // NO es la garantía de cupo (eso lo da createWithQuota más abajo, atómico).
      if (!sinLimite && (await store.countForUser(userId)) >= deps.freeLimit) {
        throw new AppError(
          'limit_reached',
          'Tu auditoría gratuita ya fue usada. La re-auditoría viene con el Kit.',
          409,
        );
      }

      const photos: AuditPhoto[] = [];
      const paraArchivar: PhotoToArchive[] = [];
      const rawFields: Record<string, string> = {};
      let bytesAcumulados = 0;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'photos') {
            await part.toBuffer(); // drenar para no colgar el stream
            continue;
          }
          if (!ALLOWED_MEDIA_TYPES.has(part.mimetype as AuditPhotoMediaType)) {
            throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
          }
          const buffer = await part.toBuffer();
          bytesAcumulados += buffer.byteLength;
          if (bytesAcumulados > MAX_PAYLOAD_TOTAL_BYTES) {
            throw new ValidationError(
              `Las fotos suman demasiado peso (máximo ${Math.round(MAX_PAYLOAD_TOTAL_BYTES / 1024 / 1024)}MB en total). Probá con imágenes más livianas.`,
            );
          }
          photos.push({
            data: buffer.toString('base64'),
            mediaType: part.mimetype as AuditPhotoMediaType,
          });
          paraArchivar.push({ buffer, mediaType: part.mimetype as AuditPhotoMediaType });
        } else if (typeof part.value === 'string') {
          rawFields[part.fieldname] = part.value;
        }
      }

      const parsedFields = Fields.safeParse({
        ...rawFields,
        arquetipo_objetivo: rawFields.arquetipo_objetivo || null,
      });
      if (!parsedFields.success) {
        const detail = parsedFields.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new ValidationError(detail);
      }
      if (photos.length < 4 || photos.length > 9) {
        throw new ValidationError(`Se esperan de 4 a 9 fotos, llegaron ${photos.length}`);
      }
      const { bio, region, arquetipo_objetivo } = parsedFields.data;

      const id = randomUUID();
      // Garantía real de cupo: conteo + insert atómicos. Si dos requests del mismo
      // usuario llegan juntos, solo uno se lleva el cupo.
      const nueva: AuditRecord = {
        id,
        userId,
        region,
        status: 'analyzing',
        progress: { fotos_analizadas: 0, total: photos.length },
        createdAt: new Date(),
      };
      let creada: boolean;
      try {
        creada = await store.createWithQuota(nueva, {
          freeLimit: deps.freeLimit,
          unlimited: sinLimite,
        });
      } catch (err) {
        if (!(err instanceof QuotaRpcMissingError)) throw err;
        // La migración del cupo atómico no está aplicada en esta base: seguimos
        // con el camino viejo (la carrera vuelve a ser posible) para no dejar la
        // app sin auditorías. Se loguea como error para que salte en el monitoreo.
        request.log.error(
          { auditId: id },
          'FALTA APLICAR la migración 20260720120001_cupo_atomico.sql: el cupo queda expuesto a la carrera',
        );
        creada = sinLimite || (await store.countForUser(userId)) < deps.freeLimit;
        if (creada) await store.create(nueva);
      }
      if (!creada) {
        throw new AppError(
          'limit_reached',
          'Tu auditoría gratuita ya fue usada. La re-auditoría viene con el Kit.',
          409,
        );
      }

      // Archivado en paralelo al análisis: no bloquea ni puede tumbar la auditoría.
      // Si el storage falla, el usuario igual recibe su informe.
      void deps.photoArchive
        .save({ auditId: id, userId, photos: paraArchivar })
        .catch((err: unknown) => {
          request.log.error({ err, auditId: id }, 'no se pudieron archivar las fotos');
        });

      // Procesamiento async: la respuesta es 202 + polling
      const process = async (): Promise<void> => {
        let vencimiento: NodeJS.Timeout | undefined;
        try {
          // Techo duro: si el motor se cuelga más allá de esto, la auditoría
          // termina en error en vez de quedar "analizando" para siempre.
          const limite = new Promise<never>((_, reject) => {
            vencimiento = setTimeout(
              () => reject(new EngineError('El análisis tardó demasiado y se canceló')),
              deps.timeoutMs,
            );
          });
          const result = await Promise.race([
            engine.run(
              { photos, bio, region, arquetipoObjetivo: arquetipo_objetivo },
              {
                onProgress: (progress) => {
                  void store.update(id, { progress }).catch((err: unknown) => {
                    request.log.warn({ err, auditId: id }, 'no se pudo actualizar progreso');
                  });
                },
              },
            ),
            limite,
          ]);
          await store.update(id, { status: 'done', result });
        } catch (err) {
          request.log.error({ err, auditId: id }, 'auditoría falló');
          await store
            .update(id, {
              status: 'error',
              error: err instanceof AppError ? err.message : 'Error interno del motor',
            })
            .catch(() => undefined);
        } finally {
          // Sin esto el timer mantiene vivo el event loop hasta vencer.
          if (vencimiento !== undefined) clearTimeout(vencimiento);
        }
      };
      void process();

      return reply.code(202).send({ audit_id: id });
    },
  );

  app.get('/audit/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const record = await store.get(id);
    if (!record || record.userId !== request.userId) {
      throw new NotFoundError('Auditoría no encontrada');
    }
    return publicView(record);
  });

  // Para que la app restaure estado al entrar (¿ya tiene auditoría? ¿en qué estado?)
  app.get('/me/audit', { preHandler: [authenticate] }, async (request) => {
    const record = await store.latestForUser(request.userId);
    return { audit: record ? publicView(record) : null };
  });
}

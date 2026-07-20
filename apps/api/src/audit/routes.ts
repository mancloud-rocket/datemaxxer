import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { Arquetipo, Region } from '@percentil/contracts';
import { AppError, NotFoundError, ValidationError } from '../errors.js';
import type { AuditEngine, AuditPhoto, AuditPhotoMediaType } from '../engines/audit.js';
import type { AuditRecord, AuditStore } from './store.js';

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
  engine: AuditEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  freeLimit: number;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { store, engine, authenticate } = deps;

  app.post(
    '/audit',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!engine) {
        throw new AppError('engine_unavailable', 'Motor de auditoría no configurado (falta ANTHROPIC_API_KEY)', 503);
      }
      if (!request.isMultipart()) {
        throw new ValidationError('Se espera multipart/form-data');
      }
      const userId = request.userId;

      const used = await store.countForUser(userId);
      if (used >= deps.freeLimit) {
        throw new AppError(
          'limit_reached',
          'Tu auditoría gratuita ya fue usada. La re-auditoría viene con el Kit.',
          409,
        );
      }

      const photos: AuditPhoto[] = [];
      const rawFields: Record<string, string> = {};

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
          photos.push({
            data: buffer.toString('base64'),
            mediaType: part.mimetype as AuditPhotoMediaType,
          });
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
      await store.create({
        id,
        userId,
        region,
        status: 'analyzing',
        progress: { fotos_analizadas: 0, total: photos.length },
        createdAt: new Date(),
      });

      // Procesamiento async: la respuesta es 202 + polling
      const process = async (): Promise<void> => {
        try {
          const result = await engine.run(
            { photos, bio, region, arquetipoObjetivo: arquetipo_objetivo },
            {
              onProgress: (progress) => {
                void store.update(id, { progress }).catch((err: unknown) => {
                  request.log.warn({ err, auditId: id }, 'no se pudo actualizar progreso');
                });
              },
            },
          );
          await store.update(id, { status: 'done', result });
        } catch (err) {
          request.log.error({ err, auditId: id }, 'auditoría falló');
          await store
            .update(id, {
              status: 'error',
              error: err instanceof AppError ? err.message : 'Error interno del motor',
            })
            .catch(() => undefined);
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

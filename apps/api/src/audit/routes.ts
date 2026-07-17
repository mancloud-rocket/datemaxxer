import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Arquetipo, Region } from '@percentil/contracts';
import { AppError, NotFoundError, ValidationError } from '../errors.js';
import type { AuditEngine, AuditPhoto, AuditPhotoMediaType } from '../engines/audit.js';
import type { AuditStore } from './store.js';

/**
 * Rutas del flujo de auditoría gratuita (interfaz acordada con FRONT en AGENTS-LOG):
 * POST /audit (multipart: photos[] 4-9, bio, email, region, arquetipo_objetivo)
 *   → 202 {audit_id}
 * GET /audit/:id → {status, progress, result?}
 */

const ALLOWED_MEDIA_TYPES = new Set<AuditPhotoMediaType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const Fields = z.object({
  email: z.string().email('email inválido'),
  bio: z.string().max(2000).default(''),
  region: Region.default('neutro'),
  arquetipo_objetivo: Arquetipo.nullable().default(null),
});

export interface AuditRoutesDeps {
  store: AuditStore;
  engine: AuditEngine | undefined;
  rateLimitMax: number;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { store, engine } = deps;

  app.post(
    '/audit',
    { config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!engine) {
        throw new AppError('engine_unavailable', 'Motor de auditoría no configurado (falta ANTHROPIC_API_KEY)', 503);
      }
      if (!request.isMultipart()) {
        throw new ValidationError('Se espera multipart/form-data');
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
      const { email, bio, region, arquetipo_objetivo } = parsedFields.data;

      const id = randomUUID();
      store.create({
        id,
        email,
        region,
        status: 'analyzing',
        progress: { fotos_analizadas: 0, total: photos.length },
        createdAt: new Date(),
      });

      // Procesamiento async: la respuesta es 202 + polling
      void engine
        .run(
          { photos, bio, region, arquetipoObjetivo: arquetipo_objetivo },
          { onProgress: (progress) => store.update(id, { progress }) },
        )
        .then((result) => store.update(id, { status: 'done', result }))
        .catch((err: unknown) => {
          request.log.error({ err, auditId: id }, 'auditoría falló');
          store.update(id, {
            status: 'error',
            error: err instanceof AppError ? err.message : 'Error interno del motor',
          });
        });

      return reply.code(202).send({ audit_id: id });
    },
  );

  app.get('/audit/:id', async (request) => {
    const { id } = request.params as { id: string };
    const record = store.get(id);
    if (!record) throw new NotFoundError('Auditoría no encontrada');
    return {
      status: record.status,
      progress: record.progress,
      ...(record.status === 'done' ? { result: record.result } : {}),
      ...(record.status === 'error' ? { error: record.error } : {}),
    };
  });
}

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { Arquetipo } from '@percentil/contracts';
import { AppError, ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import type { ProfileStore } from '../profile/store.js';
import {
  OPERACIONES_PROHIBIDAS,
  procesarFoto,
  type OpcionesFoto,
} from '../engines/photos.js';

/**
 * F2 - Estudio de fotos.
 *
 * POST /photos/retoque devuelve la foto corregida como binario.
 *
 * Síncrono: `sharp` procesa una imagen en decenas de milisegundos, así que 202 +
 * polling sería complejidad sin motivo.
 *
 * Va detrás del Kit. Y no guarda nada: la foto entra, se corrige y se devuelve.
 * El original ya está archivado desde la auditoría; guardar además cada variante
 * retocada sería duplicar almacenamiento de imágenes de personas para nada.
 */

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 12 * 1024 * 1024;

const Opciones = z
  .object({
    enderezar: z.coerce.number().min(-90).max(90).optional(),
    exposicion: z.coerce.number().min(-3).max(3).optional(),
    contraste: z.coerce.number().min(-1).max(1).optional(),
    arquetipo: Arquetipo.optional(),
    ruido: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    nitidez: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    balanceBlancos: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    recorte_left: z.coerce.number().int().min(0).optional(),
    recorte_top: z.coerce.number().int().min(0).optional(),
    recorte_width: z.coerce.number().int().positive().optional(),
    recorte_height: z.coerce.number().int().positive().optional(),
  })
  .strict();

export interface PhotosRoutesDeps {
  profileStore: ProfileStore;
  auditStore: AuditStore;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
}

export function registerPhotosRoutes(app: FastifyInstance, deps: PhotosRoutesDeps): void {
  const { profileStore, auditStore, authenticate } = deps;

  app.post(
    '/photos/retoque',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const plan = (await profileStore.get(request.userId))?.plan ?? 'free';
      if (plan === 'free') {
        throw new AppError('plan_requerido', 'El estudio de fotos viene con el Kit.', 402);
      }

      let foto: Buffer | undefined;
      let mediaType = 'image/jpeg';
      const campos: Record<string, string> = {};

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'foto') {
            await part.toBuffer();
            continue;
          }
          if (!ALLOWED.has(part.mimetype)) {
            throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
          }
          const buffer = await part.toBuffer();
          if (buffer.byteLength > MAX_BYTES) throw new ValidationError('La foto pesa demasiado.');
          foto = buffer;
          mediaType = part.mimetype;
        } else if (typeof part.value === 'string' && part.value !== '') {
          campos[part.fieldname] = part.value;
        }
      }

      if (!foto) throw new ValidationError('Falta la foto (campo "foto")');

      const parsed = Opciones.safeParse(campos);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const o = parsed.data;

      // Si no eligió arquetipo, se usa el detectado en su última auditoría: la
      // corrección de color existe para que la foto diga lo mismo que el perfil.
      let arquetipo = o.arquetipo;
      if (arquetipo === undefined) {
        const ultima = await auditStore.latestForUser(request.userId);
        if (ultima?.status === 'done') arquetipo = ultima.result?.arquetipo_detectado.nombre;
      }

      const opciones: OpcionesFoto = {
        ...(o.enderezar !== undefined ? { enderezar: o.enderezar } : {}),
        ...(o.exposicion !== undefined ? { exposicion: o.exposicion } : {}),
        ...(o.contraste !== undefined ? { contraste: o.contraste } : {}),
        ...(o.ruido !== undefined ? { ruido: o.ruido } : {}),
        ...(o.nitidez !== undefined ? { nitidez: o.nitidez } : {}),
        ...(o.balanceBlancos !== undefined ? { balanceBlancos: o.balanceBlancos } : {}),
        ...(arquetipo !== undefined ? { arquetipo } : {}),
        ...(o.recorte_width !== undefined && o.recorte_height !== undefined
          ? {
              recorte: {
                left: o.recorte_left ?? 0,
                top: o.recorte_top ?? 0,
                width: o.recorte_width,
                height: o.recorte_height,
              },
            }
          : {}),
      };

      const salida = await procesarFoto(foto, opciones);

      // Se declara qué se hizo y qué NO se puede hacer, en la respuesta misma.
      // La promesa del producto es "mejoramos la foto, no te mejoramos a vos", y
      // el usuario tiene derecho a verlo sin leer una página de marketing.
      reply
        .header('content-type', 'image/jpeg')
        .header('x-operaciones-aplicadas', salida.aplicadas.join(','))
        .header('x-operaciones-prohibidas', OPERACIONES_PROHIBIDAS.join(','))
        .header('x-dimensiones', `${salida.ancho}x${salida.alto}`);
      // `mediaType` se lee para validar la entrada; la salida siempre es JPEG.
      void mediaType;
      return reply.send(salida.buffer);
    },
  );
}

import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import { AppError, ValidationError } from '../errors.js';
import type { ProfileStore } from '../profile/store.js';
import type { ChatEngine } from '../engines/chat.js';
import type { ProfilePhoto, ProfilePhotoMediaType } from '../engines/profileread.js';
import type { ChatStore, Conversacion } from './store.js';

/**
 * F4 - copiloto de chat.
 *   POST /conversations                  → crear una conversación
 *   GET  /conversations                  → las mías
 *   GET  /conversations/:id              → una, con sus turnos
 *   POST /conversations/:id/snapshot     → subir capturas o pegar texto y analizar
 *   POST /conversations/:id/feedback     → qué pasó realmente (feedback loop)
 *
 * Va detrás del Copiloto. Es la función más cara de correr y la que sostiene la
 * suscripción.
 */

const ALLOWED = new Set<ProfilePhotoMediaType>(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CAPTURAS = 6;

const NuevaConversacion = z
  .object({
    label: z.string().trim().min(1).max(60),
    platform: z.string().trim().max(40).optional(),
  })
  .strict();

const Feedback = z
  .object({
    /** Qué pasó de verdad. Es lo que vuelve falseable al veredicto. */
    resultado: z.enum(['salio_bien', 'no_contesto_mas', 'sigue_igual', 'lo_solte']),
    nota: z.string().trim().max(500).optional(),
  })
  .strict();

const vista = (c: Conversacion) => ({
  id: c.id,
  label: c.label,
  platform: c.platform,
  mensajes: c.mensajes.length,
  ultimo_veredicto: c.ultimoVeredicto,
  feedback: c.feedback,
  created_at: c.createdAt.toISOString(),
});

export interface ChatRoutesDeps {
  store: ChatStore;
  profileStore: ProfileStore;
  engine: ChatEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
}

export function registerChatRoutes(app: FastifyInstance, deps: ChatRoutesDeps): void {
  const { store, profileStore, engine, authenticate } = deps;

  /** Devuelve la conversación si es del usuario; si no, 404 (no confirma que exista). */
  async function mia(id: string, userId: string): Promise<Conversacion> {
    const c = await store.obtener(id);
    if (!c || c.userId !== userId) {
      throw new AppError('not_found', 'No encontramos esa conversación', 404);
    }
    return c;
  }

  async function exigirCopiloto(userId: string): Promise<void> {
    const plan = (await profileStore.get(userId))?.plan ?? 'free';
    if (plan !== 'copilot') {
      throw new AppError('plan_requerido', 'La auditoría de chats viene con el Copiloto.', 402);
    }
  }

  app.post('/conversations', { preHandler: [authenticate] }, async (request, reply) => {
    await exigirCopiloto(request.userId);
    const parsed = NuevaConversacion.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const c = await store.crearConversacion(
      request.userId,
      parsed.data.label,
      parsed.data.platform ?? null,
    );
    reply.code(201);
    return vista(c);
  });

  app.get('/conversations', { preHandler: [authenticate] }, async (request) => {
    const cs = await store.listar(request.userId);
    return { conversations: cs.map(vista) };
  });

  app.get('/conversations/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const c = await mia(id, request.userId);
    const snaps = await store.snapshots(id);
    return {
      ...vista(c),
      turnos: snaps.map((s) => ({
        id: s.id,
        created_at: s.createdAt.toISOString(),
        analisis: s.analisis,
      })),
    };
  });

  app.post(
    '/conversations/:id/snapshot',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'El copiloto de chat no está disponible', 503);
      }
      await exigirCopiloto(request.userId);
      const { id } = request.params as { id: string };
      const conversacion = await mia(id, request.userId);

      const capturas: ProfilePhoto[] = [];
      const campos: Record<string, string> = {};
      let bytes = 0;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'capturas') {
            await part.toBuffer();
            continue;
          }
          if (!ALLOWED.has(part.mimetype as ProfilePhotoMediaType)) {
            throw new ValidationError(`Formato no soportado: ${part.mimetype} (jpeg, png o webp)`);
          }
          const buffer = await part.toBuffer();
          bytes += buffer.byteLength;
          if (bytes > MAX_BYTES) throw new ValidationError('Las capturas pesan demasiado.');
          capturas.push({
            data: buffer.toString('base64'),
            mediaType: part.mimetype as ProfilePhotoMediaType,
          });
        } else if (typeof part.value === 'string') {
          campos[part.fieldname] = part.value;
        }
      }

      if (capturas.length > MAX_CAPTURAS) {
        throw new ValidationError(`Hasta ${MAX_CAPTURAS} capturas por turno.`);
      }
      const pegado = campos.pegado ?? '';
      if (capturas.length === 0 && pegado.trim() === '') {
        throw new ValidationError('Subí capturas del chat o pegá el texto');
      }

      const perfil = await profileStore.get(request.userId);
      const salida = await engine.run({
        ...(capturas.length > 0 ? { capturas } : {}),
        ...(pegado.trim() !== '' ? { pegado } : {}),
        // La historia es lo que le da sentido a la latencia: sin esto cada
        // captura se leería aislada y la tendencia no existiría.
        previos: conversacion.mensajes,
        region: perfil?.region ?? 'neutro',
        etiqueta: conversacion.label,
      });

      await store.guardarTurno({
        conversationId: id,
        analisis: salida.analisis,
        mensajes: salida.mensajes,
      });

      return salida.analisis;
    },
  );

  app.post('/conversations/:id/feedback', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await mia(id, request.userId);
    const parsed = Feedback.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    // Esto es lo que vuelve falseable al veredicto: a los N días se pregunta qué
    // pasó y se compara contra lo que dijimos. Sin este dato no hay forma de
    // saber si el motor acierta.
    const texto = parsed.data.nota
      ? `${parsed.data.resultado}: ${parsed.data.nota}`
      : parsed.data.resultado;
    await store.registrarFeedback(id, texto);
    return { ok: true };
  });
}

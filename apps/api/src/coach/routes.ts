import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { NuevoMensajeCoach } from '@percentil/contracts';
import { AppError, ValidationError } from '../errors.js';
import type { AuditStore } from '../audit/store.js';
import type { ProfileStore } from '../profile/store.js';
import type { CoachEngine, ContextoCoach } from '../engines/coach.js';
import type { CoachStore } from './store.js';

/**
 * Coach de confianza.
 *   GET  /coach          → conversación + cuánto le queda de cupo
 *   POST /coach/mensaje  → manda un mensaje y recibe la respuesta en streaming (SSE)
 *
 * Por qué SSE y no JSON: una respuesta de coach tarda varios segundos. Con una
 * respuesta común el usuario mira una pantalla quieta y se va; con streaming ve
 * que le están contestando desde el primer segundo.
 */

export interface CoachRoutesDeps {
  store: CoachStore;
  profileStore: ProfileStore;
  auditStore: AuditStore;
  engine?: CoachEngine | undefined;
  authenticate: preHandlerAsyncHookHandler;
  rateLimitMax: number;
  /** Cupo de mensajes por plan. `null` = sin límite. */
  limites: { free: number; kit: number; copilot: number | null };
}

/** Cuántos turnos previos entran en la ventana de contexto del modelo. */
const VENTANA = 20;

function cupoDe(
  plan: 'free' | 'kit' | 'copilot',
  limites: CoachRoutesDeps['limites'],
): number | null {
  return plan === 'copilot' ? limites.copilot : plan === 'kit' ? limites.kit : limites.free;
}

/** Fecha relativa en castellano, para que el coach diga "hace 3 días" y no un ISO. */
function hace(fecha: Date, ahora = new Date()): string {
  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace un mes' : `hace ${meses} meses`;
}

export function registerCoachRoutes(app: FastifyInstance, deps: CoachRoutesDeps): void {
  const { store, profileStore, auditStore, engine, authenticate, limites } = deps;

  async function contexto(userId: string): Promise<ContextoCoach> {
    const perfil = await profileStore.get(userId);
    const ultima = await auditStore.latestForUser(userId);
    const resultado = ultima?.status === 'done' ? ultima.result : undefined;
    return {
      region: perfil?.region ?? 'neutro',
      nombre: perfil?.handle ?? null,
      plan: perfil?.plan ?? 'free',
      ultimaAuditoria: resultado
        ? {
            score: resultado.score_coherencia,
            arquetipo: resultado.arquetipo_detectado.nombre,
            lectura: resultado.lectura_200ms,
            hace: hace(ultima!.createdAt),
          }
        : null,
    };
  }

  app.get('/coach', { preHandler: [authenticate] }, async (request) => {
    const [mensajes, usados, perfil] = await Promise.all([
      store.ultimos(request.userId, 100),
      store.contarDelUsuario(request.userId),
      profileStore.get(request.userId),
    ]);
    const cupo = cupoDe(perfil?.plan ?? 'free', limites);
    return {
      mensajes: mensajes.map((m) => ({
        id: m.id,
        rol: m.rol,
        texto: m.texto,
        created_at: m.createdAt.toISOString(),
      })),
      restantes: cupo === null ? null : Math.max(0, cupo - usados),
    };
  });

  app.post(
    '/coach/mensaje',
    {
      preHandler: [authenticate],
      config: { rateLimit: { max: deps.rateLimitMax, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (engine === undefined) {
        throw new AppError('engine_unavailable', 'El coach no está disponible', 503);
      }
      const parsed = NuevoMensajeCoach.safeParse(request.body);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new ValidationError(detail);
      }

      const ctx = await contexto(request.userId);
      const cupo = cupoDe(ctx.plan, limites);
      if (cupo !== null) {
        const usados = await store.contarDelUsuario(request.userId);
        if (usados >= cupo) {
          throw new AppError(
            'coach_quota',
            'Llegaste al límite de mensajes con el coach. El plan Copiloto lo abre sin tope.',
            402,
          );
        }
      }

      // El mensaje del usuario se guarda ANTES de llamar al modelo: si el modelo
      // falla, lo que escribió no se pierde y la conversación sigue teniendo sentido.
      await store.guardar(request.userId, 'user', parsed.data.texto);
      const historial = await store.ultimos(request.userId, VENTANA);

      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        // Render mete un proxy que bufferea por default y mata el streaming.
        'x-accel-buffering': 'no',
      });

      const enviar = (evento: unknown): void => {
        reply.raw.write(`data: ${JSON.stringify(evento)}\n\n`);
      };

      let completa = '';
      try {
        for await (const pedazo of engine.responder(
          historial.map((m) => ({ rol: m.rol, texto: m.texto })),
          ctx,
        )) {
          completa += pedazo;
          enviar({ t: pedazo });
        }
        const guardado = await store.guardar(request.userId, 'coach', completa);
        enviar({ fin: true, id: guardado.id });
      } catch (error) {
        request.log.error({ err: error, userId: request.userId }, 'coach falló');
        // Lo que alcanzó a decir se guarda igual: es mejor una respuesta cortada
        // que un hueco en la conversación cuando vuelva.
        if (completa !== '') {
          await store
            .guardar(request.userId, 'coach', completa)
            .catch(() => undefined);
        }
        enviar({ error: 'Se cortó la respuesta. Probá de nuevo.' });
      } finally {
        reply.raw.end();
      }
    },
  );
}

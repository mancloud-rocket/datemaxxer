import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Region } from '@percentil/contracts';
import { EngineError } from '../errors.js';

/**
 * Motor del coach de confianza.
 *
 * A diferencia de F1, acá no hay JSON ni schema: la salida es texto y va en
 * streaming, porque el usuario tiene que ver que le están respondiendo. Todo lo
 * que define QUÉ es esta función vive en `prompts/coach/system.md`, no acá.
 */

const promptsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'prompts', 'coach',
);

const SYSTEM_BASE = readFileSync(join(promptsDir, 'system.md'), 'utf8');

const REGISTRO: Record<Region, string> = {
  rioplatense: 'Rioplatense (Argentina/Uruguay): vos, che, tenés, querés.',
  chileno: 'Chileno: tú, moderado, sin modismos forzados.',
  mexicano: 'Mexicano: tú, registro moderado.',
  neutro: 'Neutro: tú, sin modismos regionales.',
};

/** Lo que el coach sabe del usuario. Todo opcional: puede no haber auditado nunca. */
export interface ContextoCoach {
  region: Region;
  nombre?: string | null;
  plan: 'free' | 'kit' | 'copilot';
  ultimaAuditoria?: {
    score: number;
    arquetipo: string;
    lectura: string;
    hace: string;
  } | null;
}

export interface TurnoCoach {
  rol: 'user' | 'coach';
  texto: string;
}

/** Cliente de streaming, acotado a lo que usa el motor (mockeable en tests). */
export interface CoachClient {
  stream(params: {
    model: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    max_tokens: number;
  }): AsyncIterable<string>;
}

/**
 * Adapta el SDK real. Se itera el stream de eventos y se dejan pasar solo los
 * deltas de texto: el resto (uso de tokens, arranque y cierre de bloques) no le
 * sirve a la UI.
 */
export function coachClientFromSdk(sdk: {
  messages: { stream: (params: never) => AsyncIterable<unknown> };
}): CoachClient {
  return {
    async *stream(params) {
      const evento = sdk.messages.stream(params as never);
      for await (const e of evento) {
        const ev = e as { type?: string; delta?: { type?: string; text?: string } };
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          const texto = ev.delta.text;
          if (texto !== undefined && texto !== '') yield texto;
        }
      }
    },
  };
}

/** El contexto del usuario va en el system prompt, no en el primer turno. */
export function armarSystem(ctx: ContextoCoach): string {
  const lineas: string[] = [`Registro regional: ${REGISTRO[ctx.region]}`];
  if (ctx.nombre !== undefined && ctx.nombre !== null && ctx.nombre !== '') {
    lineas.push(`Se llama ${ctx.nombre}.`);
  }
  if (ctx.ultimaAuditoria) {
    const a = ctx.ultimaAuditoria;
    lineas.push(
      `Su última auditoría (${a.hace}): score de coherencia ${a.score}/100, ` +
        `arquetipo detectado "${a.arquetipo}".`,
      `Lectura que le dimos: "${a.lectura}"`,
    );
  } else {
    lineas.push(
      'Todavía no hizo ninguna auditoría de perfil. No conocés sus fotos ni su bio.',
    );
  }
  lineas.push(
    ctx.plan === 'free'
      ? 'Está en el plan gratuito.'
      : `Tiene el plan ${ctx.plan === 'kit' ? 'Kit' : 'Copiloto'}.`,
  );

  return `${SYSTEM_BASE}\n---\n\n## Contexto de este usuario\n\n${lineas.join('\n')}\n`;
}

export interface CoachEngineOptions {
  client: CoachClient;
  model?: string;
}

/** Techo de la respuesta: el prompt pide párrafos cortos, esto lo hace cumplir. */
const MAX_TOKENS = 1200;

export function buildCoachEngine(options: CoachEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';

  return {
    /** Emite el texto del coach por pedazos, a medida que llega. */
    async *responder(
      historial: TurnoCoach[],
      ctx: ContextoCoach,
    ): AsyncGenerator<string, void, undefined> {
      if (historial.length === 0 || historial[historial.length - 1]!.rol !== 'user') {
        throw new EngineError('El historial tiene que terminar en un mensaje del usuario');
      }
      const messages = historial.map((t) => ({
        role: t.rol === 'user' ? ('user' as const) : ('assistant' as const),
        content: t.texto,
      }));

      let hubo = false;
      for await (const pedazo of client.stream({
        model,
        system: armarSystem(ctx),
        messages,
        max_tokens: MAX_TOKENS,
      })) {
        hubo = true;
        yield pedazo;
      }
      if (!hubo) throw new EngineError('El coach no devolvió texto');
    },
  };
}

export type CoachEngine = ReturnType<typeof buildCoachEngine>;

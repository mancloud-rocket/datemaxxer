import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BioResult, type Intencion, type Plataforma, type Region } from '@percentil/contracts';
import { EngineError } from '../errors.js';
import type { ClaudeClient } from './audit.js';

/**
 * Motor F3 - Bio por intención.
 *
 * El más barato de los motores: una llamada de texto, sin visión. Lo que lo hace
 * bueno o malo es enteramente el prompt y la blocklist.
 *
 * Devuelve tres variantes con ángulos distintos, no tres versiones de lo mismo:
 * la bio es lo más personal del perfil y el usuario tiene que poder elegir la que
 * suena a él.
 */

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'prompts', 'bio');

const SCHEMA = JSON.parse(readFileSync(join(promptsDir, 'schema.json'), 'utf8')) as Record<string, unknown>;

const BLOCKLIST = readFileSync(join(promptsDir, '..', 'shared', 'blocklist.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

export const SYSTEM_PROMPT =
  readFileSync(join(promptsDir, 'system.md'), 'utf8') +
  `\n## Blocklist anti-slop (contenido vigente, prohibido usar)\n\n` +
  BLOCKLIST.map((l) => `- ${l}`).join('\n') +
  '\n';

export interface BioInput {
  intencion: Intencion;
  plataforma: Plataforma;
  /** Datos reales del usuario. Sin esto la bio sale genérica. */
  datos: string[];
  region: Region;
  bioActual?: string | undefined;
  /** Del último análisis, si lo tiene. Ayuda a que la bio no contradiga las fotos. */
  arquetipo?: string | undefined;
}

const MAX_TOKENS = 3000;

export interface BioEngineOptions {
  client: ClaudeClient;
  model?: string;
}

export function buildBioEngine(options: BioEngineOptions) {
  const { client } = options;
  const model = options.model ?? 'claude-opus-4-8';

  async function run(input: BioInput): Promise<BioResult> {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Escribí la bio según el system prompt.\n` +
                `Intención: ${input.intencion}\n` +
                `Plataforma: ${input.plataforma}\n` +
                `Registro regional: ${input.region}\n` +
                `Arquetipo detectado: ${input.arquetipo ?? '(todavía no se auditó)'}\n` +
                `Datos reales que dio:\n${input.datos.map((d) => `- ${d}`).join('\n')}\n` +
                `Bio actual:\n${input.bioActual || '(no tiene bio)'}`,
            },
          ],
        },
      ],
    });

    if (message.stop_reason === 'refusal') throw new EngineError('El modelo rechazó la request');
    if (message.stop_reason === 'max_tokens') throw new EngineError('Salida truncada por max_tokens');
    const texto = message.content.find((b) => b.type === 'text')?.text;
    if (texto === undefined || texto === '') throw new EngineError('Respuesta sin bloque de texto');

    let crudo: unknown;
    try {
      crudo = JSON.parse(texto) as unknown;
    } catch {
      throw new EngineError('La salida del motor de bio no es JSON parseable');
    }

    const parsed = BioResult.safeParse(crudo);
    if (!parsed.success) {
      throw new EngineError(
        `Salida inválida del motor de bio: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    // `largo` lo recalcula el código: el modelo cuenta caracteres mal y ese
    // número es el que la UI usa para avisar si no entra en la plataforma.
    return {
      ...parsed.data,
      variantes: parsed.data.variantes.map((v) => ({ ...v, largo: v.texto.length })),
    };
  }

  return { run };
}

export type BioEngine = ReturnType<typeof buildBioEngine>;

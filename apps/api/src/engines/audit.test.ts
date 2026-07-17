import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AuditResult } from '@percentil/contracts';
import { EngineError, ValidationError } from '../errors.js';
import {
  buildAuditEngine,
  claudeClientFromSdk,
  type AuditInput,
  type ClaudeClient,
} from './audit.js';

type QueuedResponse = { content: Array<{ type: string; text?: string }>; stop_reason: string | null };

function jsonMessage(obj: unknown, stopReason = 'end_turn'): QueuedResponse {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: stopReason };
}

function makeClient(queue: QueuedResponse[]) {
  const calls: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        calls.push(params);
        const next = queue.shift();
        if (!next) throw new Error('mock sin respuestas');
        return next;
      },
    },
  };
  return { client, calls };
}

const PASO1_OK = {
  evidencia_por_foto: [
    { foto: 1, dice: 'profesional', señales: ['camisa', 'luz fría'], calidad_tecnica: 62 },
    { foto: 2, dice: 'viajero', señales: ['mochila', 'exterior'], calidad_tecnica: 71 },
    { foto: 3, dice: 'social', señales: ['grupo', 'bar'], calidad_tecnica: 40 },
    { foto: 4, dice: 'deportista', señales: ['gimnasio'], calidad_tecnica: 55 },
  ],
};

const PASO2_OK = {
  version: '1.0',
  arquetipo_detectado: { nombre: 'viajero', confianza: 0.72 },
  score_coherencia: 41,
  lectura_200ms: 'Cuatro señales compitiendo: nadie sabe quién sos.',
  gap_analysis: null,
  plan_de_fotos: {
    conservar: [2],
    reemplazar: [1, 3],
    orden_sugerido: [2, 4, 1],
    briefs_faltantes: [{ tipo: 'apertura', specs: 'exterior, luz día, plano medio, cara visible' }],
  },
  quick_wins: ['sacar la foto grupal de la posición 3'],
};

const INPUT: AuditInput = {
  photos: Array.from({ length: 4 }, () => ({ data: 'aGVsbG8=', mediaType: 'image/jpeg' as const })),
  bio: 'me gusta viajar',
  region: 'rioplatense',
};

describe('engines/audit (F1)', () => {
  it('el SDK real de Anthropic se adapta a ClaudeClient (solo tipos, sin red)', () => {
    const real: ClaudeClient = claudeClientFromSdk(new Anthropic({ apiKey: 'test-key-no-network' }));
    expect(typeof real.messages.create).toBe('function');
  });

  it('happy path: chain de 2 pasos, merge de evidencia en código, valida contrato', async () => {
    const { client, calls } = makeClient([jsonMessage(PASO1_OK), jsonMessage(PASO2_OK)]);
    const engine = buildAuditEngine({ client });

    const result = await engine.run(INPUT);

    expect(calls).toHaveLength(2);
    expect(() => AuditResult.parse(result)).not.toThrow();
    expect(result.evidencia_por_foto).toEqual(PASO1_OK.evidencia_por_foto);
    expect(result.arquetipo_detectado.nombre).toBe('viajero');

    // Sanity de la request: modelo default, structured outputs y las 4 imágenes en el paso 1
    expect(calls[0]?.model).toBe('claude-opus-4-8');
    expect(calls[0]?.output_config).toBeDefined();
    // La blocklist se inyecta al system prompt (el modelo no puede leer archivos)
    expect(String(calls[0]?.system)).toContain('partner in crime');
    const content = (calls[0]?.messages as Array<{ content: Array<{ type: string }> }>)[0]?.content ?? [];
    expect(content.filter((b) => b.type === 'image')).toHaveLength(4);
    // El paso 2 no re-manda imágenes
    const content2 = (calls[1]?.messages as Array<{ content: Array<{ type: string }> }>)[0]?.content ?? [];
    expect(content2.filter((b) => b.type === 'image')).toHaveLength(0);
  });

  it('rechaza menos de 4 fotos con error tipado', async () => {
    const { client } = makeClient([]);
    const engine = buildAuditEngine({ client });
    await expect(
      engine.run({ ...INPUT, photos: INPUT.photos.slice(0, 2) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza más de 9 fotos', async () => {
    const { client } = makeClient([]);
    const engine = buildAuditEngine({ client });
    const photos = Array.from({ length: 10 }, () => INPUT.photos[0]!);
    await expect(engine.run({ ...INPUT, photos })).rejects.toBeInstanceOf(ValidationError);
  });

  it('salida inválida en paso 2 → un retry de reparación y sigue', async () => {
    const invalido = { ...PASO2_OK, arquetipo_detectado: { nombre: 'sigma', confianza: 0.9 } };
    const { client, calls } = makeClient([
      jsonMessage(PASO1_OK),
      jsonMessage(invalido),
      jsonMessage(PASO2_OK), // reparación
    ]);
    const engine = buildAuditEngine({ client });

    const result = await engine.run(INPUT);
    expect(calls).toHaveLength(3);
    expect(result.arquetipo_detectado.nombre).toBe('viajero');
    // El mensaje de reparación incluye los errores de validación
    const repairText = JSON.stringify(calls[2]);
    expect(repairText).toContain('arquetipo_detectado');
  });

  it('reparación también inválida → EngineError', async () => {
    const invalido = { ...PASO2_OK, score_coherencia: 150 };
    const { client } = makeClient([
      jsonMessage(PASO1_OK),
      jsonMessage(invalido),
      jsonMessage(invalido),
    ]);
    const engine = buildAuditEngine({ client });
    await expect(engine.run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('refusal del modelo → EngineError', async () => {
    const { client } = makeClient([{ content: [], stop_reason: 'refusal' }]);
    const engine = buildAuditEngine({ client });
    await expect(engine.run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('salida truncada por max_tokens → EngineError', async () => {
    const { client } = makeClient([{ content: [{ type: 'text', text: '{"a"' }], stop_reason: 'max_tokens' }]);
    const engine = buildAuditEngine({ client });
    await expect(engine.run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('gap_analysis null cuando no hay arquetipo objetivo (regla: sin evidencia → null)', async () => {
    const { client, calls } = makeClient([jsonMessage(PASO1_OK), jsonMessage(PASO2_OK)]);
    const engine = buildAuditEngine({ client });
    const result = await engine.run(INPUT);
    expect(result.gap_analysis).toBeNull();
    expect(JSON.stringify(calls[1])).toContain('gap_analysis debe ser null');
  });
});

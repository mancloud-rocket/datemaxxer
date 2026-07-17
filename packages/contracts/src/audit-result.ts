import { z } from 'zod';
import { Arquetipo, Confianza, Score100 } from './shared.js';

/**
 * F1 — AuditResult (spec §6.1).
 * Todos los objetos son .strict(): un campo extra inventado por el motor = parse error.
 */

export const EvidenciaFoto = z
  .object({
    foto: z.number().int().positive(),
    dice: z.string().min(1),
    señales: z.array(z.string().min(1)).min(1),
    calidad_tecnica: Score100,
  })
  .strict();

export const GapAnalysis = z
  .object({
    objetivo: Arquetipo,
    distancia: z.enum(['baja', 'media', 'alta']),
    acciones: z.array(z.string().min(1)),
  })
  .strict();

export const BriefFotoFaltante = z
  .object({
    tipo: z.string().min(1),
    specs: z.string().min(1),
  })
  .strict();

export const PlanDeFotos = z
  .object({
    conservar: z.array(z.number().int().positive()),
    reemplazar: z.array(z.number().int().positive()),
    orden_sugerido: z.array(z.number().int().positive()),
    briefs_faltantes: z.array(BriefFotoFaltante),
  })
  .strict();

export const AuditResult = z
  .object({
    version: z.literal('1.0'),
    arquetipo_detectado: z
      .object({
        nombre: Arquetipo,
        confianza: Confianza,
      })
      .strict(),
    score_coherencia: Score100,
    lectura_200ms: z.string().min(1),
    evidencia_por_foto: z.array(EvidenciaFoto).min(1),
    // null si el usuario no declaró arquetipo objetivo (regla: sin evidencia → null)
    gap_analysis: GapAnalysis.nullable(),
    plan_de_fotos: PlanDeFotos,
    quick_wins: z.array(z.string().min(1)),
  })
  .strict();

export type AuditResult = z.infer<typeof AuditResult>;

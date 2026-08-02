import { z } from 'zod';
import { Arquetipo, Confianza, Score100 } from './shared.js';
import { IndiceAtractivo } from './market.js';

/**
 * F1 — AuditResult (spec §6.1).
 * Todos los objetos son .strict(): un campo extra inventado por el motor = parse error.
 *
 * v2.0 agrega `indice` (F1b): el índice de atractivo del propio usuario. Es una
 * medida distinta de `score_coherencia`, que mide legibilidad y no atractivo. Un
 * tipo puede tener 88 de coherencia y estar en bucket `medio_bajo`: es coherente
 * y no matchea, y hasta v1.0 el producto no tenía cómo decírselo.
 *
 * F1b es dependencia dura del `gap` de F5, del Radar y del Comparador.
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
    // '1.0' sigue siendo válido: hay auditorías guardadas de antes de F1b y el
    // historial tiene que poder leerlas. Las nuevas siempre salen '2.0'.
    version: z.enum(['1.0', '2.0']),
    arquetipo_detectado: z
      .object({
        nombre: Arquetipo,
        confianza: Confianza,
      })
      .strict(),
    score_coherencia: Score100,
    /**
     * F1b. `null` en las auditorías previas a v2.0 y en las que no se pudo
     * evaluar ningún componente. La UI muestra el índice solo si está.
     */
    indice: IndiceAtractivo.nullable().default(null),
    lectura_200ms: z.string().min(1),
    evidencia_por_foto: z.array(EvidenciaFoto).min(1),
    // null si el usuario no declaró arquetipo objetivo (regla: sin evidencia → null)
    gap_analysis: GapAnalysis.nullable(),
    plan_de_fotos: PlanDeFotos,
    quick_wins: z.array(z.string().min(1)),
  })
  .strict();

export type AuditResult = z.infer<typeof AuditResult>;

import { z } from 'zod';
import { Confianza, Score100 } from './shared.js';
import {
  Bucket,
  Opener,
  ProbabilidadRespuesta,
  RANGO_BUCKET,
  VeredictoInversion,
} from './market.js';

/**
 * Radar - F5 comprimido para usar con el pulgar arriba del botón de like.
 *
 * Presupuesto: UNA sola llamada de visión, sin cadena, sin síntesis, objetivo
 * menos de 5 segundos hasta el primer byte. Todo lo que agregue tokens de
 * salida agrega latencia, y a los 8 segundos el usuario ya swipeó y el producto
 * no sirvió para nada.
 *
 * Por eso el índice del radar NO lleva desglose ni anclas: es más barato y es
 * más impreciso, y el contrato lo dice con `precision: 'rapida'` en vez de
 * fingir la misma calidad que F5. La UI muestra "estimación rápida" y ofrece el
 * análisis completo. Esa fricción declarada es la conversión del radar al Kit.
 */

export const IndiceRapido = z
  .object({
    bucket: Bucket,
    score: Score100,
    /** Una línea con lo que movió el número. Nada de párrafos. */
    lectura: z.string().min(1),
    precision: z.literal('rapida'),
    confianza: Confianza,
  })
  .strict()
  .superRefine((val, ctx) => {
    const [min, max] = RANGO_BUCKET[val.bucket];
    if (val.score < min || val.score > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['score'],
        message: `score ${val.score} fuera del rango de bucket ${val.bucket} (${min}-${max})`,
      });
    }
  });
export type IndiceRapido = z.infer<typeof IndiceRapido>;

export const RadarRead = z
  .object({
    version: z.literal('1.0'),
    indice: IndiceRapido,
    /** null si el usuario no tiene auditoría propia. Sin gap no hay comparación. */
    gap_delta: z.number().int().min(-100).max(100).nullable(),
    probabilidad_respuesta: ProbabilidadRespuesta,
    /** Exactamente 3. Más openers = más tokens = el radar deja de ser radar. */
    openers: z.array(Opener).length(3),
    /** Veredicto de una palabra. Es lo que se lee en un segundo. */
    veredicto: VeredictoInversion,
    /** Bandera barata de perfil no genuino. El análisis fino va en F5. */
    alerta_autenticidad: z.string().min(1).nullable(),
    /** Milisegundos de motor. Se loguea para vigilar el presupuesto de latencia. */
    ms_motor: z.number().int().nonnegative(),
  })
  .strict();

export type RadarRead = z.infer<typeof RadarRead>;

import { z } from 'zod';
import { Confianza } from './shared.js';

/**
 * F5 — ProfileRead (spec §6.3), versión 1.0.
 * Lee curaduría pública: qué eligió mostrar, no quién es.
 * Sin campo de disponibilidad/orientación/salud — .strict() lo hace fallar si aparece.
 *
 * v1.1 (Fase 1) agrega `expectativa_de_plan` (nivel + evidencia[] + traduccion),
 * lectura de estilo de vida/estándar de plan anclada a evidencia visible.
 */

export const Eje = z.enum([
  'estetica',
  'aventura',
  'intelecto',
  'status',
  'cuerpo',
  'calidez',
]);
export type Eje = z.infer<typeof Eje>;

export const EjeDeclarado = z
  .object({
    principal: Eje,
    secundario: Eje.nullable(),
    confianza: Confianza,
  })
  .strict();

export const DensidadCompetitiva = z
  .object({
    nivel: z.enum(['alta', 'media', 'baja']),
    implicancia: z.string().min(1),
  })
  .strict();

export const CoherenciaTextoFotos = z
  .object({
    coincide: z.boolean(),
    nota: z.string().min(1),
  })
  .strict();

/** Ganchos REALES: puntos de contacto concretos + cómo usarlos sin sonar a stalker. */
export const Gancho = z
  .object({
    tipo: z.enum(['lugar', 'estudio', 'hobby', 'referencia']),
    dato: z.string().min(1),
    uso: z.string().min(1),
  })
  .strict();

export const RegistroSugerido = z
  .object({
    tono: z.string().min(1),
    evitar: z.array(z.string().min(1)),
  })
  .strict();

export const ProfileRead = z
  .object({
    version: z.literal('1.0'),
    // null si la curaduría no alcanza para leer un eje (sin evidencia → null)
    eje_declarado: EjeDeclarado.nullable(),
    nivel_curaduria: z.enum(['producido', 'intermedio', 'casual']),
    densidad_competitiva: DensidadCompetitiva,
    // SOLO literal del texto del perfil; null si no está escrito. Nunca inferida de fotos.
    intencion_declarada: z.string().min(1).nullable(),
    // null si no hay bio/texto contra el cual comparar
    coherencia_texto_fotos: CoherenciaTextoFotos.nullable(),
    ganchos: z.array(Gancho),
    registro_sugerido: RegistroSugerido,
    disclaimer: z.string().min(1),
  })
  .strict();

export type ProfileRead = z.infer<typeof ProfileRead>;

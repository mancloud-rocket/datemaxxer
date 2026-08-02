import { z } from 'zod';
import { Confianza } from './shared.js';
import {
  Autenticidad,
  GapAtractivo,
  IndiceAtractivo,
  Inversion,
  Opener,
  ProbabilidadRespuesta,
  Selectividad,
  VolumenMatches,
} from './market.js';

/**
 * F5 - ProfileRead v2.0 (spec §6.3).
 *
 * v1.0 leía curaduría: qué eje declara, qué tan producida está, qué ganchos hay.
 * Era correcto y era la mitad de lo que el usuario necesita. La pregunta que
 * realmente se hace antes de escribir es "¿tengo chance acá o estoy perdiendo
 * el tiempo?", y v1 no la contestaba.
 *
 * v2.0 la contesta: índice de atractivo desglosado, selectividad, volumen de
 * matches entrante, probabilidad de respuesta relativa, gap contra su propia
 * auditoría y veredicto de inversión.
 *
 * Qué SÍ se infiere: nivel de atractivo, selectividad, estándar de plan,
 * expectativa de inversión. Todo con `evidencia[]` sobre lo que ella eligió
 * publicar.
 *
 * Qué NUNCA se infiere: orientación, salud, y disponibilidad sexual como estado
 * de la persona ("está para algo"). `.strict()` hace fallar el parse si el
 * motor inventa un campo así. No es pudor: es que esos claims no se pueden
 * anclar a evidencia visible, y un claim sin evidencia convierte el informe en
 * horóscopo. Lo que sí se lee es el tono que su curaduría habilita, que es otra
 * cosa y va en `Opener.licencia`.
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
export type EjeDeclarado = z.infer<typeof EjeDeclarado>;

export const DensidadCompetitiva = z
  .object({
    nivel: z.enum(['alta', 'media', 'baja']),
    implicancia: z.string().min(1),
  })
  .strict();
export type DensidadCompetitiva = z.infer<typeof DensidadCompetitiva>;

export const CoherenciaTextoFotos = z
  .object({
    coincide: z.boolean(),
    nota: z.string().min(1),
  })
  .strict();
export type CoherenciaTextoFotos = z.infer<typeof CoherenciaTextoFotos>;

/**
 * Gancho: punto de contacto concreto y cómo usarlo. `uso` tiene que ser
 * accionable, no "preguntale por su viaje". El criterio de corte es que no
 * revele que él estuvo estudiando el perfil con lupa - eso lee como desesperado
 * y es el error más caro del opener, antes que cualquier consideración de tono.
 */
export const Gancho = z
  .object({
    tipo: z.enum(['lugar', 'estudio', 'hobby', 'referencia']),
    dato: z.string().min(1),
    uso: z.string().min(1),
  })
  .strict();
export type Gancho = z.infer<typeof Gancho>;

export const RegistroSugerido = z
  .object({
    tono: z.string().min(1),
    evitar: z.array(z.string().min(1)),
  })
  .strict();
export type RegistroSugerido = z.infer<typeof RegistroSugerido>;

/**
 * Estándar de plan que su perfil vende, con traducción cruda al bolsillo.
 * Se lee de locaciones, ropa, viajes, ocio mostrado. Siempre con evidencia.
 */
export const ExpectativaDePlan = z
  .object({
    nivel: z.enum(['bajo', 'medio', 'alto', 'muy_alto']),
    evidencia: z.array(z.string().min(1)).min(1),
    traduccion: z.string().min(1),
    confianza: Confianza,
  })
  .strict();
export type ExpectativaDePlan = z.infer<typeof ExpectativaDePlan>;

export const ProfileRead = z
  .object({
    version: z.literal('2.0'),

    // --- Bloque de mercado (nuevo en v2.0) ---
    /** El número que abre el informe. */
    indice: IndiceAtractivo,
    selectividad: Selectividad,
    /** Derivado en código desde `indice` + plataforma + verificación. */
    volumen_matches: VolumenMatches,
    /** Derivado en código desde gap + selectividad + calidad del opener. */
    probabilidad_respuesta: ProbabilidadRespuesta,
    /** null si el usuario todavía no tiene auditoría propia con índice. */
    gap: GapAtractivo.nullable(),
    autenticidad: Autenticidad,
    inversion: Inversion,

    // --- Bloque de curaduría (heredado de v1.0) ---
    // null si la curaduría no alcanza para leer un eje (sin evidencia → null)
    eje_declarado: EjeDeclarado.nullable(),
    nivel_curaduria: z.enum(['producido', 'intermedio', 'casual']),
    densidad_competitiva: DensidadCompetitiva,
    // SOLO literal del texto del perfil; null si no está escrito. Nunca inferida de fotos.
    intencion_declarada: z.string().min(1).nullable(),
    // null si no hay bio/texto contra el cual comparar
    coherencia_texto_fotos: CoherenciaTextoFotos.nullable(),
    expectativa_de_plan: ExpectativaDePlan.nullable(),
    ganchos: z.array(Gancho),
    registro_sugerido: RegistroSugerido,

    // --- Bloque accionable ---
    /** Listos para mandar. El tono lo gatea el gap, no el humor del modelo. */
    openers: z.array(Opener).min(1).max(4),

    disclaimer: z.string().min(1),
  })
  .strict();

export type ProfileRead = z.infer<typeof ProfileRead>;

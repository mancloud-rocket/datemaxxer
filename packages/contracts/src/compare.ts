import { z } from 'zod';
import { Confianza, Score100 } from './shared.js';
import { ComponenteIndice, GapAtractivo, IndiceAtractivo } from './market.js';

/**
 * Comparador de atractivo - su mejor foto contra la de ella, lado a lado.
 *
 * Es la función más compartible del producto y la que más rápido puede
 * convertirse en un juguete inútil. Lo que la salva es `descomposicion`: el gap
 * se parte en puntos CERRABLES (producción, presentación, arreglo, encuadre) y
 * puntos NO CERRABLES (rasgos). Un número solo deprime y no vende nada; un
 * número con "9 de esos 23 puntos los cerrás vos en seis semanas y así" es
 * exactamente el argumento de venta del Kit.
 *
 * El motor pondera distinto según el sujeto: en perfiles masculinos el peso se
 * corre de facial hacia presentación y señales de estatus, porque es lo que
 * mueve la aguja del lado que el usuario controla. Los pesos viven en
 * `engines/market.ts`, no acá.
 */

export const PuntosCerrables = z
  .object({
    /** Cuántos puntos del gap salen de cosas que él controla. */
    cerrables: z.number().int().min(0).max(100),
    /** Cuántos son rasgos. Se dice sin vueltas y no se promete cerrarlos. */
    no_cerrables: z.number().int().min(0).max(100),
    /** Cada acción con su ganancia estimada en puntos y su plazo real. */
    plan: z
      .array(
        z
          .object({
            accion: z.string().min(1),
            puntos: z.number().int().min(1).max(40),
            plazo: z.enum(['hoy', 'semana', 'mes', 'trimestre', 'año']),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type PuntosCerrables = z.infer<typeof PuntosCerrables>;

/**
 * Lado del comparador. `indice` completo cuando viene de una auditoría
 * archivada; `componentes` sueltos cuando es una foto suelta subida al momento.
 */
export const LadoComparador = z
  .object({
    etiqueta: z.enum(['usuario', 'objetivo']),
    global: Score100,
    facial: ComponenteIndice.nullable(),
    presentacion: ComponenteIndice.nullable(),
    produccion: ComponenteIndice.nullable(),
    /** Qué gana este lado si se los mira uno al lado del otro. */
    fortaleza: z.string().min(1),
    /** Qué pierde. Sin eufemismos: es el dato por el que pagó. */
    debilidad: z.string().min(1),
  })
  .strict();
export type LadoComparador = z.infer<typeof LadoComparador>;

export const CompareResult = z
  .object({
    version: z.literal('1.0'),
    usuario: LadoComparador,
    objetivo: LadoComparador,
    gap: GapAtractivo,
    descomposicion: PuntosCerrables,
    /**
     * La lectura cruda, una o dos frases. Es el texto que va en la card
     * compartible y el que decide si el usuario vuelve o cierra la app.
     * Duro sobre el diagnóstico, concreto sobre la salida. Nunca lástima.
     */
    veredicto: z.string().min(1),
    /** Techo realista si ejecuta todo el plan. Nunca promete rasgos nuevos. */
    techo_estimado: Score100,
    confianza: Confianza,
  })
  .strict();

export type CompareResult = z.infer<typeof CompareResult>;

/** Reexport por comodidad de los motores que arman ambos lados. */
export type { IndiceAtractivo };

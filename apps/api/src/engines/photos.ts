import sharp from 'sharp';
import type { Arquetipo } from '@percentil/contracts';
import { ValidationError } from '../errors.js';

/**
 * F2 - Estudio de fotos (retoque honesto).
 *
 * La promesa del producto es "mejoramos la foto, no te mejoramos a vos". Este
 * archivo es donde esa promesa se cumple o se rompe, así que las prohibiciones
 * están en el código y no en la documentación.
 *
 * ## Qué se permite
 * Corrección técnica global (exposición, balance de blancos, contraste, ruido,
 * nitidez), color por arquetipo, y geometría rígida (enderezar y recortar).
 *
 * ## Qué NO se permite, y por qué está acá y no en un comentario
 * Warp o liquify facial o corporal, adelgazar, alargar piernas, suavizar piel
 * más allá de la reducción de ruido, y cualquier escala no uniforme. Esas
 * operaciones no existen en este módulo: no hay forma de pedirlas.
 *
 * ## Sobre el "bit-idéntico"
 * El checklist de la spec pide que la región de personas quede bit-idéntica.
 * Eso NO aplica a esta etapa y decirlo importa: una corrección de exposición
 * cambia todos los píxeles de la imagen, incluidos los de la persona, y es
 * exactamente lo que el usuario pidió. El invariante bit-idéntico pertenece al
 * outpainting (spec §3), que todavía no existe: cuando se construya, la
 * composición tiene que dejar intacta la región enmascarada, y ahí sí ese test
 * es el correcto. Lo que se verifica hoy está en `photos.test.ts`: geometría
 * rígida, proporciones intactas y lista cerrada de operaciones.
 */

/** Lo único que este módulo sabe hacer. */
export const OPERACIONES_PERMITIDAS = [
  'enderezar',
  'recorte',
  'exposicion',
  'balance_blancos',
  'contraste',
  'ruido',
  'nitidez',
  'color_arquetipo',
] as const;
export type Operacion = (typeof OPERACIONES_PERMITIDAS)[number];

/**
 * Prohibidas explícitamente. La lista existe para que un test la nombre y para
 * que agregar una de estas rompa la build en vez de pasar desapercibido.
 */
export const OPERACIONES_PROHIBIDAS = [
  'warp',
  'liquify',
  'skin_smoothing',
  'adelgazar',
  'alargar_piernas',
  'escala_no_uniforme',
  'cambiar_proporciones',
] as const;

/**
 * Color por arquetipo. Son ajustes suaves a propósito: el objetivo es que la
 * foto se lea coherente con lo que el perfil dice ser, no que parezca filtrada.
 * `saturacion` 1 = sin cambio.
 */
const COLOR_POR_ARQUETIPO: Record<Arquetipo, { saturacion: number; brillo: number; matiz: number }> = {
  viajero: { saturacion: 1.12, brillo: 1.03, matiz: 6 },
  outdoor: { saturacion: 1.1, brillo: 1.02, matiz: 4 },
  deportista: { saturacion: 1.06, brillo: 1.02, matiz: 0 },
  profesional: { saturacion: 0.94, brillo: 1.01, matiz: -6 },
  intelectual: { saturacion: 0.92, brillo: 1.0, matiz: -8 },
  creativo: { saturacion: 1.08, brillo: 1.0, matiz: 10 },
  social: { saturacion: 1.08, brillo: 1.04, matiz: 3 },
  hogareno: { saturacion: 1.02, brillo: 1.03, matiz: 8 },
};

export interface Recorte {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OpcionesFoto {
  /** Grados de rotación para enderezar. Acotado: es corrección, no composición. */
  enderezar?: number;
  recorte?: Recorte;
  /** Corrección de exposición en pasos. Negativo oscurece. */
  exposicion?: number;
  contraste?: number;
  arquetipo?: Arquetipo;
  /** Reducción de ruido. Es lo ÚNICO que suaviza, y tiene techo duro. */
  ruido?: boolean;
  nitidez?: boolean;
  balanceBlancos?: boolean;
}

export interface FotoProcesada {
  buffer: Buffer;
  ancho: number;
  alto: number;
  aplicadas: Operacion[];
}

/** Techo del enderezado: más que esto ya no es corregir, es recomponer. */
const MAX_GRADOS = 8;
/** Techo de la reducción de ruido, para que no se vuelva suavizado de piel. */
const MAX_RUIDO = 3;

export async function procesarFoto(entrada: Buffer, opciones: OpcionesFoto = {}): Promise<FotoProcesada> {
  const meta = await sharp(entrada).metadata();
  if (!meta.width || !meta.height) {
    throw new ValidationError('No pudimos leer las dimensiones de la imagen');
  }

  const aplicadas: Operacion[] = [];
  // `rotate()` sin argumentos aplica la orientación EXIF: sin esto una foto de
  // celular sale acostada y todo lo demás se calcula sobre la imagen equivocada.
  let img = sharp(entrada).rotate();

  if (opciones.enderezar !== undefined && opciones.enderezar !== 0) {
    const grados = Math.max(-MAX_GRADOS, Math.min(MAX_GRADOS, opciones.enderezar));
    img = img.rotate(grados, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    aplicadas.push('enderezar');
  }

  if (opciones.recorte) {
    const r = opciones.recorte;
    if (r.width <= 0 || r.height <= 0) {
      throw new ValidationError('El recorte tiene que tener ancho y alto positivos');
    }
    img = img.extract({ left: Math.max(0, r.left), top: Math.max(0, r.top), width: r.width, height: r.height });
    aplicadas.push('recorte');
  }

  if (opciones.balanceBlancos) {
    // Normaliza el rango tonal sin tocar geometría. `normalise` estira el
    // histograma; el clip evita que reviente los blancos de la piel.
    img = img.normalise({ lower: 1, upper: 99 });
    aplicadas.push('balance_blancos');
  }

  if (opciones.exposicion !== undefined && opciones.exposicion !== 0) {
    const pasos = Math.max(-2, Math.min(2, opciones.exposicion));
    img = img.linear(Math.pow(2, pasos), 0);
    aplicadas.push('exposicion');
  }

  if (opciones.contraste !== undefined && opciones.contraste !== 0) {
    const c = Math.max(-0.4, Math.min(0.4, opciones.contraste));
    // y = a*x + b alrededor del medio: sube contraste sin correr el punto medio.
    const a = 1 + c;
    img = img.linear(a, 128 * (1 - a));
    aplicadas.push('contraste');
  }

  if (opciones.ruido) {
    // `median` con radio chico: quita ruido de sensor. Con radio grande esto SÍ
    // sería suavizado de piel, por eso el techo es duro y no configurable.
    img = img.median(MAX_RUIDO);
    aplicadas.push('ruido');
  }

  if (opciones.nitidez) {
    img = img.sharpen({ sigma: 1 });
    aplicadas.push('nitidez');
  }

  if (opciones.arquetipo) {
    const c = COLOR_POR_ARQUETIPO[opciones.arquetipo];
    img = img.modulate({ saturation: c.saturacion, brightness: c.brillo, hue: c.matiz });
    aplicadas.push('color_arquetipo');
  }

  const { data, info } = await img.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  return { buffer: data, ancho: info.width, alto: info.height, aplicadas };
}

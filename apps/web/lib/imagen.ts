/**
 * Redimensiona las fotos en el browser antes de subirlas.
 *
 * Por qué: la visión del modelo reescala las imágenes a ~1568px de lado largo, así
 * que subir una foto de 12MB de un celular moderno es puro desperdicio - tarda una
 * eternidad en 4G, come memoria del server (9 fotos grandes lo pueden tumbar) y se
 * paga de más en tokens de imagen. Achicarlas acá baja el payload ~10x sin perder
 * nada de calidad de análisis.
 *
 * Si algo falla (browser viejo, formato raro), devuelve el archivo original: nunca
 * bloquea la subida.
 */

const MAX_LADO = 1600;
const CALIDAD = 0.85;
/** Debajo de esto no vale la pena recomprimir. */
const YA_ES_CHICA_BYTES = 900 * 1024;

export async function prepararFoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    // imageOrientation respeta el EXIF: sin esto las fotos verticales de iPhone
    // se suben rotadas.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ladoMayor = Math.max(bitmap.width, bitmap.height);
    const escala = Math.min(1, MAX_LADO / ladoMayor);

    if (escala === 1 && file.size <= YA_ES_CHICA_BYTES) return file;

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', CALIDAD);
    });
    // Si recomprimir no ayudó (ya estaba mejor optimizada), se queda el original.
    if (blob === null || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

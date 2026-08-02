/**
 * Armado de cuerpos multipart para tests.
 *
 * `app.inject()` no construye multipart solo: hay que darle el cuerpo crudo y el
 * boundary. Vivía duplicado adentro del test de F1; se sacó acá cuando F5 lo
 * necesitó, para que las dos rutas se prueben con exactamente el mismo armado.
 *
 * Excluido del build de producción (ver tsconfig.build.json).
 */

export interface Part {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  buffer?: Buffer;
}

/** PNG de 1x1, lo mínimo que acepta un parser de imágenes. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function multipartPayload(parts: Part[]): { payload: Buffer; contentType: string } {
  const boundary = '----percentil-test-boundary';
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
        part.buffer ?? Buffer.alloc(0),
      );
    } else {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`),
      );
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** N archivos bajo el campo `photos`, que es lo que esperan F1 y F5. */
export function fotosParts(n: number, prefijo = 'foto'): Part[] {
  return Array.from({ length: n }, (_, i) => ({
    name: 'photos',
    filename: `${prefijo}-${i + 1}.png`,
    contentType: 'image/png',
    buffer: TINY_PNG,
  }));
}

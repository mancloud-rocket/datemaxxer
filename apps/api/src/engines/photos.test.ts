import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors.js';
import {
  OPERACIONES_PERMITIDAS,
  OPERACIONES_PROHIBIDAS,
  procesarFoto,
  type OpcionesFoto,
} from './photos.js';

/**
 * Los invariantes del pipeline. NO los borres.
 *
 * La promesa del producto es "mejoramos la foto, no te mejoramos a vos". Estos
 * tests son lo que la sostiene: si alguien agrega una operación que deforma al
 * sujeto, acá se rompe.
 *
 * Nota sobre el "bit-idéntico" del checklist de la spec: no aplica a esta etapa
 * y por eso no está. Una corrección de exposición cambia todos los píxeles de la
 * imagen, incluidos los de la persona, y es exactamente lo que el usuario pidió.
 * Ese invariante pertenece al outpainting, que todavía no existe. Escribirlo acá
 * sería un test que pasa sin probar lo que dice.
 */

/** Imagen con un cuadrado rojo de tamaño conocido: sirve para medir deformación. */
async function conCuadrado(ancho = 400, alto = 600, lado = 100): Promise<Buffer> {
  const fondo = { create: { width: ancho, height: alto, channels: 3 as const, background: '#202020' } };
  const cuadrado = await sharp({
    create: { width: lado, height: lado, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  return sharp(fondo).composite([{ input: cuadrado, left: 50, top: 50 }]).jpeg().toBuffer();
}

/** Mide el bounding box de lo rojo, para comprobar que no se estiró. */
async function cajaRoja(buf: Buffer): Promise<{ ancho: number; alto: number }> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      // Dominancia de canal, no umbrales absolutos: la corrección de exposición
      // y el normalise mueven el brillo de todo, pero el gris sigue siendo gris
      // y el rojo sigue teniendo el rojo por encima de los otros dos.
      if (r > g + 60 && r > b + 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { ancho: maxX - minX + 1, alto: maxY - minY + 1 };
}

describe('lista de operaciones', () => {
  it('las prohibidas NO están entre las permitidas', () => {
    // Si alguien agrega una, este test lo frena antes del merge.
    for (const prohibida of OPERACIONES_PROHIBIDAS) {
      expect(OPERACIONES_PERMITIDAS).not.toContain(prohibida as never);
    }
  });

  it('la lista de prohibidas nombra las que rompen la promesa del producto', () => {
    for (const critica of ['warp', 'liquify', 'skin_smoothing', 'adelgazar', 'cambiar_proporciones']) {
      expect(OPERACIONES_PROHIBIDAS).toContain(critica as never);
    }
  });

  it('el módulo no expone ninguna forma de pedir una operación prohibida', async () => {
    const mod = await import('./photos.js');
    const exportados = Object.keys(mod).join(' ').toLowerCase();
    for (const p of ['warp', 'liquify', 'adelgaz', 'smooth']) {
      // La única mención permitida es dentro de OPERACIONES_PROHIBIDAS.
      expect(exportados.includes(p)).toBe(false);
    }
  });
});

describe('geometría: el sujeto no se deforma', () => {
  it('las proporciones se mantienen tras corrección de color y tono', async () => {
    // El invariante que sí se puede verificar sobre píxeles: nada de lo que
    // hacemos estira ni achata al sujeto.
    const entrada = await conCuadrado();
    const antes = await cajaRoja(entrada);

    const salida = await procesarFoto(entrada, {
      exposicion: 0.5,
      contraste: 0.2,
      balanceBlancos: true,
      nitidez: true,
      arquetipo: 'viajero',
    });
    const despues = await cajaRoja(salida.buffer);

    // Mismo alto y ancho: no hubo escala no uniforme.
    expect(Math.abs(despues.ancho - antes.ancho)).toBeLessThanOrEqual(2);
    expect(Math.abs(despues.alto - antes.alto)).toBeLessThanOrEqual(2);
  });

  it('el recorte no reescala: la caja conserva su tamaño en píxeles', async () => {
    const entrada = await conCuadrado(400, 600, 100);
    const antes = await cajaRoja(entrada);

    const salida = await procesarFoto(entrada, { recorte: { left: 0, top: 0, width: 300, height: 300 } });
    const despues = await cajaRoja(salida.buffer);

    expect(salida.ancho).toBe(300);
    expect(salida.alto).toBe(300);
    // Recortar mueve el encuadre, no cambia el tamaño de lo que quedó adentro.
    expect(Math.abs(despues.ancho - antes.ancho)).toBeLessThanOrEqual(2);
    expect(Math.abs(despues.alto - antes.alto)).toBeLessThanOrEqual(2);
  });

  it('el enderezado está acotado: no se puede recomponer la foto', async () => {
    const entrada = await conCuadrado();
    const salida = await procesarFoto(entrada, { enderezar: 45 });
    const sano = await procesarFoto(entrada, { enderezar: 8 });
    // 45 se recorta al techo, así que da lo mismo que pedir 8.
    expect(salida.ancho).toBe(sano.ancho);
    expect(salida.alto).toBe(sano.alto);
  });
});

describe('las correcciones hacen algo', () => {
  it('sin opciones no rompe y devuelve una imagen válida', async () => {
    const salida = await procesarFoto(await conCuadrado());
    expect(salida.aplicadas).toEqual([]);
    const meta = await sharp(salida.buffer).metadata();
    expect(meta.width).toBe(400);
  });

  it('la exposición cambia el brillo de verdad', async () => {
    const entrada = await conCuadrado();
    const clara = await procesarFoto(entrada, { exposicion: 1 });
    const oscura = await procesarFoto(entrada, { exposicion: -1 });
    const brillo = async (b: Buffer) => (await sharp(b).stats()).channels[0]!.mean;
    expect(await brillo(clara.buffer)).toBeGreaterThan(await brillo(oscura.buffer));
  });

  it('cada arquetipo deja su color, y son distintos entre sí', async () => {
    const entrada = await conCuadrado();
    const frio = await procesarFoto(entrada, { arquetipo: 'profesional' });
    const calido = await procesarFoto(entrada, { arquetipo: 'viajero' });
    expect(Buffer.compare(frio.buffer, calido.buffer)).not.toBe(0);
  });

  it('reporta exactamente lo que aplicó', async () => {
    const salida = await procesarFoto(await conCuadrado(), {
      exposicion: 0.3,
      arquetipo: 'creativo',
      ruido: true,
    });
    expect(salida.aplicadas.sort()).toEqual(['color_arquetipo', 'exposicion', 'ruido']);
  });

  it('un recorte inválido se rechaza en vez de producir una imagen rota', async () => {
    await expect(
      procesarFoto(await conCuadrado(), { recorte: { left: 0, top: 0, width: 0, height: 100 } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('los extremos se acotan en vez de reventar', async () => {
    const opciones: OpcionesFoto = { exposicion: 99, contraste: 99, enderezar: 999 };
    const salida = await procesarFoto(await conCuadrado(), opciones);
    expect(salida.buffer.byteLength).toBeGreaterThan(0);
  });
});

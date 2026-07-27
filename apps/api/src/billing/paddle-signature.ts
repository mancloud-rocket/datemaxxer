import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma de los webhooks de Paddle.
 *
 * Sin esto cualquiera que descubra la URL puede mandarnos un "pagó el Kit" y
 * activarse un plan gratis. Es la única barrera entre el endpoint y el acceso pago.
 *
 * Formato oficial (developer.paddle.com/webhooks/signature-verification):
 *   Header `Paddle-Signature: ts=1671552777;h1=<hex>`
 *   Se firma HMAC-SHA256 de `{ts}:{cuerpo crudo}` con el secreto del destino.
 *
 * El cuerpo tiene que ser EXACTAMENTE los bytes recibidos: si se parsea y se
 * vuelve a serializar, aunque cambie un espacio, la firma no valida nunca.
 */

/** Ventana de tolerancia del timestamp, contra reenvío de eventos viejos (replay). */
export const TOLERANCIA_MS = 5 * 60 * 1000;

export type ResultadoFirma =
  | { valida: true }
  | { valida: false; motivo: 'header_ausente' | 'header_malformado' | 'vencida' | 'no_coincide' };

/** Parsea `ts=...;h1=...` (puede traer varias h1 durante una rotación de secreto). */
export function parsearHeader(header: string): { ts: string; firmas: string[] } | null {
  const partes = header.split(';');
  let ts: string | undefined;
  const firmas: string[] = [];
  for (const parte of partes) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    const clave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (clave === 'ts') ts = valor;
    else if (clave === 'h1') firmas.push(valor);
  }
  if (ts === undefined || ts === '' || firmas.length === 0) return null;
  return { ts, firmas };
}

function comparaSegura(a: string, b: string): boolean {
  // timingSafeEqual explota si difieren los largos: se chequea antes.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

export function verificarFirmaPaddle(params: {
  /** Bytes crudos del cuerpo, sin parsear ni re-serializar. */
  cuerpoCrudo: Buffer | string;
  header: string | undefined;
  secreto: string;
  /** Inyectable para poder testear la ventana de tolerancia. */
  ahoraMs?: number;
  toleranciaMs?: number;
}): ResultadoFirma {
  const { cuerpoCrudo, header, secreto } = params;
  if (header === undefined || header === '') return { valida: false, motivo: 'header_ausente' };

  const parsed = parsearHeader(header);
  if (parsed === null) return { valida: false, motivo: 'header_malformado' };

  const tsSegundos = Number(parsed.ts);
  if (!Number.isFinite(tsSegundos)) return { valida: false, motivo: 'header_malformado' };

  const ahora = params.ahoraMs ?? Date.now();
  const tolerancia = params.toleranciaMs ?? TOLERANCIA_MS;
  if (Math.abs(ahora - tsSegundos * 1000) > tolerancia) {
    return { valida: false, motivo: 'vencida' };
  }

  const cuerpo = typeof cuerpoCrudo === 'string' ? cuerpoCrudo : cuerpoCrudo.toString('utf8');
  const esperada = createHmac('sha256', secreto)
    .update(`${parsed.ts}:${cuerpo}`)
    .digest('hex');

  // Alcanza con que UNA coincida: Paddle manda varias mientras rota el secreto.
  const coincide = parsed.firmas.some((f) => comparaSegura(f, esperada));
  return coincide ? { valida: true } : { valida: false, motivo: 'no_coincide' };
}

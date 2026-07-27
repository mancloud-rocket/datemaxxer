import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsearHeader, verificarFirmaPaddle } from './paddle-signature.js';

const SECRETO = 'pdl_ntfset_test_secreto_de_prueba';
const CUERPO = JSON.stringify({ event_type: 'transaction.completed', data: { id: 'txn_1' } });

function firmar(cuerpo: string, ts: number, secreto = SECRETO): string {
  const h1 = createHmac('sha256', secreto).update(`${ts}:${cuerpo}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe('firma de webhooks de Paddle', () => {
  const ahora = 1_800_000_000_000;
  const ts = Math.floor(ahora / 1000);

  it('acepta una firma legítima', () => {
    const r = verificarFirmaPaddle({
      cuerpoCrudo: CUERPO, header: firmar(CUERPO, ts), secreto: SECRETO, ahoraMs: ahora,
    });
    expect(r.valida).toBe(true);
  });

  it('rechaza si falta el header', () => {
    const r = verificarFirmaPaddle({ cuerpoCrudo: CUERPO, header: undefined, secreto: SECRETO, ahoraMs: ahora });
    expect(r).toEqual({ valida: false, motivo: 'header_ausente' });
  });

  it('rechaza un header con formato inválido', () => {
    for (const h of ['', 'basura', 'ts=123', 'h1=abc', 'ts=noesnumero;h1=abc']) {
      const r = verificarFirmaPaddle({ cuerpoCrudo: CUERPO, header: h, secreto: SECRETO, ahoraMs: ahora });
      expect(r.valida).toBe(false);
    }
  });

  it('RECHAZA un cuerpo adulterado (el ataque que importa)', () => {
    // Un atacante toma un evento real y le cambia el monto o el usuario.
    const header = firmar(CUERPO, ts);
    const adulterado = JSON.stringify({ event_type: 'transaction.completed', data: { id: 'txn_HACK' } });
    const r = verificarFirmaPaddle({ cuerpoCrudo: adulterado, header, secreto: SECRETO, ahoraMs: ahora });
    expect(r).toEqual({ valida: false, motivo: 'no_coincide' });
  });

  it('rechaza una firma hecha con otro secreto', () => {
    const r = verificarFirmaPaddle({
      cuerpoCrudo: CUERPO, header: firmar(CUERPO, ts, 'secreto_del_atacante'),
      secreto: SECRETO, ahoraMs: ahora,
    });
    expect(r).toEqual({ valida: false, motivo: 'no_coincide' });
  });

  it('rechaza eventos viejos (replay)', () => {
    const viejo = ts - 60 * 60; // una hora antes
    const r = verificarFirmaPaddle({
      cuerpoCrudo: CUERPO, header: firmar(CUERPO, viejo), secreto: SECRETO, ahoraMs: ahora,
    });
    expect(r).toEqual({ valida: false, motivo: 'vencida' });
  });

  it('tolera un desfasaje de reloj razonable', () => {
    for (const desfase of [-60, 60]) {
      const r = verificarFirmaPaddle({
        cuerpoCrudo: CUERPO, header: firmar(CUERPO, ts + desfase), secreto: SECRETO, ahoraMs: ahora,
      });
      expect(r.valida).toBe(true);
    }
  });

  it('acepta si UNA de varias firmas coincide (rotación de secreto)', () => {
    const buena = createHmac('sha256', SECRETO).update(`${ts}:${CUERPO}`).digest('hex');
    const header = `ts=${ts};h1=0000000000000000000000000000000000000000000000000000000000000000;h1=${buena}`;
    const r = verificarFirmaPaddle({ cuerpoCrudo: CUERPO, header, secreto: SECRETO, ahoraMs: ahora });
    expect(r.valida).toBe(true);
  });

  it('funciona con el cuerpo como Buffer (que es como llega de verdad)', () => {
    const r = verificarFirmaPaddle({
      cuerpoCrudo: Buffer.from(CUERPO, 'utf8'), header: firmar(CUERPO, ts),
      secreto: SECRETO, ahoraMs: ahora,
    });
    expect(r.valida).toBe(true);
  });

  it('el cuerpo re-serializado NO valida: hay que usar los bytes crudos', () => {
    // Protege contra la regresión más fácil de cometer: parsear el JSON y volver
    // a serializarlo antes de verificar.
    const conEspacios = JSON.stringify(JSON.parse(CUERPO), null, 2);
    const r = verificarFirmaPaddle({
      cuerpoCrudo: conEspacios, header: firmar(CUERPO, ts), secreto: SECRETO, ahoraMs: ahora,
    });
    expect(r.valida).toBe(false);
  });

  it('parsearHeader extrae ts y todas las firmas', () => {
    expect(parsearHeader('ts=123;h1=aa;h1=bb')).toEqual({ ts: '123', firmas: ['aa', 'bb'] });
    expect(parsearHeader('sin-formato')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { construirCors } from './cors.js';

/** Helper: pregunta si un origen pasa. */
function permite(politica: ReturnType<typeof construirCors>, origen: string | undefined): boolean {
  let ok = false;
  politica.origin(origen, (_e, r) => { ok = r; });
  return ok;
}

describe('política de CORS', () => {
  const prod = (corsOrigins?: string) => construirCors({ corsOrigins, produccion: true });
  const dev = (corsOrigins?: string) => construirCors({ corsOrigins, produccion: false });

  it('en producción NO acepta cualquier origen', () => {
    // Este era el agujero: el default era `true` y aceptaba todo.
    const p = prod('https://datemaxxer-app.vercel.app');
    expect(permite(p, 'https://sitio-cualquiera.com')).toBe(false);
    expect(permite(p, 'https://datemaxxer-app.vercel.app.atacante.com')).toBe(false);
  });

  it('acepta exactamente los orígenes declarados', () => {
    const p = prod('https://a.com,https://b.com');
    expect(permite(p, 'https://a.com')).toBe(true);
    expect(permite(p, 'https://b.com')).toBe(true);
    expect(permite(p, 'https://c.com')).toBe(false);
  });

  it('tolera espacios en la variable', () => {
    const p = prod(' https://a.com , https://b.com ');
    expect(permite(p, 'https://a.com')).toBe(true);
    expect(permite(p, 'https://b.com')).toBe(true);
  });

  it('sin la variable en producción cae a los dominios propios y lo avisa', () => {
    // No abre todo ni tumba el deploy: usa lo propio y loguea.
    const p = prod(undefined);
    expect(p.usandoFallback).toBe(true);
    expect(permite(p, 'https://datemaxxer-app.vercel.app')).toBe(true);
    expect(permite(p, 'https://sitio-cualquiera.com')).toBe(false);
  });

  it('con la variable puesta no marca fallback', () => {
    expect(prod('https://a.com').usandoFallback).toBe(false);
  });

  it('sin Origin pasa: no es un navegador', () => {
    // curl, la app móvil, los health checks. CORS no aplica ahí.
    expect(permite(prod('https://a.com'), undefined)).toBe(true);
  });

  it('en desarrollo acepta localhost en cualquier puerto', () => {
    const p = dev(undefined);
    expect(permite(p, 'http://localhost:3000')).toBe(true);
    expect(permite(p, 'http://localhost:5173')).toBe(true);
    expect(permite(p, 'http://127.0.0.1:3000')).toBe(true);
  });

  it('en desarrollo tampoco acepta cualquier dominio de internet', () => {
    expect(permite(dev(undefined), 'https://sitio-cualquiera.com')).toBe(false);
  });

  it('en producción NO acepta localhost', () => {
    expect(permite(prod('https://a.com'), 'http://localhost:3000')).toBe(false);
  });
});

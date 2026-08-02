'use client';

/**
 * Historial de auditorías · set piece "La bitácora de vuelo" (porteo fiel
 * de design/app/historial.html, SET-PIECES.md #6): cada análisis pasado es
 * una entrada de bitácora, no una card genérica - mini-instrumento polar
 * (mismo lenguaje que el medidor grande del informe, a escala 58×36) para
 * lecturas completas, sello de estado a la derecha, entrada en cascada.
 */

import { useEffect, useRef, useState } from 'react';
import { ARQUETIPOS } from '../../lib/glifos';
import { ApiError, misAuditorias, type AuditView } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';
import { gsap } from '../../lib/motion';

const NOMBRES = Object.fromEntries(ARQUETIPOS.map((a) => [a.slug, a.label]));

const ESTADOS: Record<AuditView['status'], { label: string; clase: string }> = {
  done: { label: 'Completa', clase: 's-cy' },
  analyzing: { label: 'En curso', clase: 's-mute' },
  error: { label: 'Falló', clase: '' },
};

function formatearFecha(iso: string): string {
  try {
    // Intl 'es-AR' con month:'short' devuelve "18 de jul de 2026" (con conectores) -
    // se sacan para que quepa en una sola línea en el ancho fijo de .fecha.
    return new Date(iso)
      .toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(/\bde\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .replace('.', '');
  } catch {
    return iso;
  }
}

/** Mini-instrumento polar: mismo arco de 3 zonas que el medidor grande del informe. */
const CXg = 29, CYg = 34, Rg = 24;
const ZONAS: Array<[number, number, string]> = [[0, 40, '#C94B32'], [40, 70, '#E8B04B'], [70, 100, '#4FD9C2']];
function ptg(deg: number, r: number): [number, number] {
  const a = Math.PI - (deg / 100) * Math.PI;
  return [CXg + r * Math.cos(a), CYg - r * Math.sin(a)];
}

function MiniGauge(props: { score: number }) {
  const zona = ZONAS.find(([a, b]) => props.score >= a && props.score <= b) ?? ZONAS[0]!;
  const [mx, my] = ptg(props.score, Rg);
  return (
    <svg className="gauge" viewBox="0 0 58 36">
      {ZONAS.map(([a, b, col]) => {
        const [x0, y0] = ptg(a + 1.5, Rg);
        const [x1, y1] = ptg(b - 1.5, Rg);
        return <path key={a} d={`M${x0} ${y0} A${Rg} ${Rg} 0 0 1 ${x1} ${y1}`} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" opacity={0.5} />;
      })}
      <circle cx={mx} cy={my} r={4} fill="var(--void)" stroke={zona[2]} strokeWidth={2.4} />
    </svg>
  );
}

export function Historial() {
  const [auditorias, setAuditorias] = useState<AuditView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const entrada = useRef(false);
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dev') === '1') {
      // QA sin sesión real (ver layout.tsx)
      setAuditorias([
        {
          audit_id: 'demo-2', status: 'done', progress: { fotos_analizadas: 6, total: 6 },
          created_at: new Date().toISOString(),
          result: {
            score_coherencia: 41, arquetipo_detectado: { nombre: 'viajero', confianza: 0.72 },
            lectura_200ms: '', evidencia_por_foto: [], quick_wins: [],
          } as unknown as NonNullable<AuditView['result']>,
        },
        {
          audit_id: 'demo-1', status: 'error', progress: { fotos_analizadas: 3, total: 6 },
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
        },
      ]);
      return;
    }
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setError('Tu sesión se interrumpió. Recarga la página.');
        return;
      }
      try {
        setAuditorias(await misAuditorias(token));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar tu historial.');
      }
    })();
  }, []);

  /* entrada en cascada, una sola vez cuando la bitácora queda lista */
  useEffect(() => {
    const el = root.current;
    if (!auditorias || !el || entrada.current) return;
    entrada.current = true;
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    if (REDUCED || qa) return; // ?qa=1: --virtual-time-budget no es confiable con GSAP
    const ctx = gsap.context(() => {
      gsap.set(['.chead', '.entry'], { autoAlpha: 0, y: 16 });
      gsap.timeline()
        .to('.chead', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0)
        .to('.entry', { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.09, ease: 'power2.out' }, 0.2);
    }, el);
    return () => ctx.revert();
  }, [auditorias, REDUCED]);

  return (
    <div className="dmx-historial" ref={root}>
      <header className="chead">
        <p className="kicker"><i />Cómo se movió tu número</p>
        <h1 className="display">Tus mediciones.</h1>
      </header>

      {error ? (
        <p className="err-general">{error}</p>
      ) : !auditorias ? (
        <div className="loading-row"><span className="dot" />CARGANDO TUS MEDICIONES…</div>
      ) : auditorias.length === 0 ? (
        <div className="empty">
          <svg viewBox="0 0 48 48">
            <path d="M6 10 L6 40 L24 36 L42 40 L42 10 L24 14 Z" />
            <path d="M24 14 L24 36" />
            <line x1="11" y1="17" x2="19" y2="16" strokeDasharray="2 3" />
            <line x1="11" y1="23" x2="19" y2="22" strokeDasharray="2 3" />
            <line x1="11" y1="29" x2="19" y2="28" strokeDasharray="2 3" />
          </svg>
          <h3>Todavía no te mediste</h3>
          <p>Cuando midas tu perfil, cada medición queda aquí y vas a poder ver si tu número sube.</p>
          <a className="btn" href="/app">Medir mi perfil</a>
        </div>
      ) : (
        <div className="log">
          {auditorias.map((a) => {
            const estado = ESTADOS[a.status];
            return (
              <div className="entry" key={a.audit_id}>
                <div className="fecha">{formatearFecha(a.created_at)}</div>
                {a.status === 'done' && a.result ? (
                  <>
                    <MiniGauge score={a.result.score_coherencia} />
                    <div className="body">
                      <span className="score">{a.result.score_coherencia}</span>
                      <span className="arq">{NOMBRES[a.result.arquetipo_detectado.nombre] ?? a.result.arquetipo_detectado.nombre}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="gauge" />
                    <div className="body">
                      <span className="parcial">{a.progress.fotos_analizadas}/{a.progress.total} fotos</span>
                    </div>
                  </>
                )}
                <div className="estado"><span className={`selloe ${estado.clase}`}>{estado.label}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * Historial de auditorías (soporte de "varios análisis por perfil", pedido
 * de Fernando 19-jul). Esqueleto funcional sin diseño (piel pendiente de
 * FRONT, mismo criterio que Settings antes de su primer pase de arte).
 * Usa GET /me/audits, que ya existía en el backend desde el pase del
 * sidebar pero nunca se había expuesto en la UI.
 */

import { useEffect, useState } from 'react';
import { ARQUETIPOS } from '../../lib/glifos';
import { ApiError, misAuditorias, type AuditView } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';

const NOMBRES = Object.fromEntries(ARQUETIPOS.map((a) => [a.slug, a.label]));

const ESTADOS: Record<AuditView['status'], { label: string; clase: string }> = {
  done: { label: 'Completa', clase: 's-cy' },
  analyzing: { label: 'En curso', clase: '' },
  error: { label: 'Falló', clase: '' },
};

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function Historial() {
  const [auditorias, setAuditorias] = useState<AuditView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError('Tu sesión se interrumpió. Recargá la página.');
        return;
      }
      try {
        setAuditorias(await misAuditorias(token));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar tu historial.');
      }
    })();
  }, []);

  if (error) return <p style={{ color: 'var(--oxide)' }}>{error}</p>;
  if (!auditorias) {
    return <p className="mono" style={{ color: 'var(--ink-mute)', fontSize: '.7rem' }}>Cargando…</p>;
  }

  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <header style={{ marginBottom: '2rem' }}>
        <p className="kicker"><i />Tus análisis</p>
        <h1 className="display" style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', marginTop: '.4rem' }}>Historial.</h1>
      </header>

      {auditorias.length === 0 ? (
        <p style={{ color: 'var(--ink-mute)' }}>Todavía no hiciste ninguna auditoría.</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'grid', gap: '.9rem' }}>
          {auditorias.map((a) => {
            const estado = ESTADOS[a.status];
            return (
              <li
                key={a.audit_id}
                style={{
                  border: '1px solid var(--line)', borderRadius: 10, padding: '1.1rem 1.3rem',
                  background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                }}
              >
                <div>
                  <div className="mono" style={{ fontSize: '.62rem', color: 'var(--steel)', marginBottom: '.3rem' }}>
                    {formatearFecha(a.created_at)}
                  </div>
                  {a.status === 'done' && a.result ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.7rem' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>{a.result.score_coherencia}</span>
                      <span style={{ color: 'var(--ink-mute)', fontSize: '.85rem' }}>
                        {NOMBRES[a.result.arquetipo_detectado.nombre] ?? a.result.arquetipo_detectado.nombre}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--ink-mute)', fontSize: '.9rem' }}>
                      {a.progress.fotos_analizadas}/{a.progress.total} fotos
                    </span>
                  )}
                </div>
                <span className={`selloe ${estado.clase}`}>{estado.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

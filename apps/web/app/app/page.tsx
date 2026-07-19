'use client';

/**
 * Shell de /app: sesión Supabase + máquina de estados contra la API.
 * Fases: cargando → login → (restaura /me/audit) → mesa | escaner | informe | limite.
 * El error de auditoría se muestra DENTRO del escáner (set piece del prototipo),
 * no rebota a la mesa: el usuario decide volver.
 *
 * QA (solo dev, sin sesión): ?estado=login|mesa|analizando|sintetizando|error|informe|limite
 *   · ?fotos=4..9 · ?leidas=0..N · ?qa=1 (estados finales instantáneos para captures)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, crearAuditoria, miAuditoria, obtenerAuditoria, type AuditView } from '../../lib/api';
import { getAccessToken, getSupabase } from '../../lib/supabase';
import { Escaner, type EscanerEstado } from './Escaner';
import { Informe } from './Informe';
import { PantallaLimite, PantallaLogin, PantallaMesa } from './pantallas';
import './app.css';

type Fase =
  | { nombre: 'cargando' }
  | { nombre: 'login' }
  | { nombre: 'mesa'; error: string | null; enviando: boolean }
  | { nombre: 'escaner'; view: AuditView }
  | { nombre: 'informe'; view: AuditView }
  | { nombre: 'limite' };

const POLL_MS = 2500;

function faseDeQa(params: URLSearchParams): Fase | null {
  const estado = params.get('estado');
  if (!estado) return null;
  const total = Math.min(9, Math.max(4, parseInt(params.get('fotos') ?? '6', 10) || 6));
  const leidas = Math.min(total, Math.max(0, parseInt(params.get('leidas') ?? '2', 10) || 0));
  const base: AuditView = { audit_id: 'qa', status: 'analyzing', progress: { fotos_analizadas: leidas, total } };
  switch (estado) {
    case 'login': return { nombre: 'login' };
    case 'mesa': return { nombre: 'mesa', error: null, enviando: false };
    case 'analizando': return { nombre: 'escaner', view: base };
    case 'sintetizando':
      return { nombre: 'escaner', view: { ...base, progress: { fotos_analizadas: total, total } } };
    case 'error':
      return { nombre: 'escaner', view: { ...base, status: 'error', error: 'qa' } };
    case 'informe':
      return {
        nombre: 'informe',
        view: {
          audit_id: 'qa', status: 'done', progress: { fotos_analizadas: total, total },
          result: {
            score_coherencia: 41,
            arquetipo_detectado: { nombre: 'viajero', confianza: 0.72 },
            lectura_200ms: 'Tres señales distintas compitiendo: viaje, oficina, gimnasio.',
            evidencia_por_foto: Array.from({ length: total }, () => ({})),
            quick_wins: [{}, {}, {}],
          } as unknown as NonNullable<AuditView['result']>,
        },
      };
    case 'limite': return { nombre: 'limite' };
    default: return null;
  }
}

export default function AppShell() {
  const [fase, setFase] = useState<Fase>({ nombre: 'cargando' });
  const [qa, setQa] = useState(false);
  const qaActivo = useRef(false);
  const restaurando = useRef(false);

  const restaurar = useCallback(async () => {
    if (restaurando.current || qaActivo.current) return;
    restaurando.current = true;
    try {
      const token = await getAccessToken();
      if (!token) {
        setFase({ nombre: 'login' });
        return;
      }
      const audit = await miAuditoria(token);
      if (!audit) setFase({ nombre: 'mesa', error: null, enviando: false });
      else if (audit.status === 'analyzing') setFase({ nombre: 'escaner', view: audit });
      else if (audit.status === 'done') setFase({ nombre: 'informe', view: audit });
      else setFase({ nombre: 'mesa', error: 'Tu auditoría anterior falló (no gastó tu cupo). Probá de nuevo.', enviando: false });
    } catch {
      setFase({ nombre: 'mesa', error: 'No pudimos conectar con el expediente. Recargá la página.', enviando: false });
    } finally {
      restaurando.current = false;
    }
  }, []);

  // QA hooks (después del mount: el SSR siempre renderiza "cargando")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forzada = faseDeQa(params);
    if (forzada) {
      qaActivo.current = true;
      setQa(params.get('qa') !== null);
      setFase(forzada);
    }
  }, []);

  // Sesión: al montar y en cada cambio de auth
  useEffect(() => {
    void restaurar();
    const { data } = getSupabase().auth.onAuthStateChange((_evento, session) => {
      if (qaActivo.current) return;
      if (session) void restaurar();
      else setFase({ nombre: 'login' });
    });
    return () => data.subscription.unsubscribe();
  }, [restaurar]);

  // Polling mientras el escáner corre
  useEffect(() => {
    if (fase.nombre !== 'escaner' || fase.view.status !== 'analyzing' || qaActivo.current) return;
    const id = fase.view.audit_id;
    const timer = setInterval(() => {
      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        try {
          const view = await obtenerAuditoria(token, id);
          if (view.status === 'done') setFase({ nombre: 'informe', view });
          else setFase({ nombre: 'escaner', view });
        } catch {
          /* un poll fallido no rompe la espera; el próximo reintenta */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fase]);

  async function enviar(form: FormData) {
    setFase({ nombre: 'mesa', error: null, enviando: true });
    const token = await getAccessToken();
    if (!token) {
      setFase({ nombre: 'login' });
      return;
    }
    try {
      const { audit_id } = await crearAuditoria(token, form);
      const total = form.getAll('photos').length;
      setFase({
        nombre: 'escaner',
        view: { audit_id, status: 'analyzing', progress: { fotos_analizadas: 0, total } },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit_reached') setFase({ nombre: 'limite' });
      else {
        setFase({
          nombre: 'mesa',
          error: err instanceof ApiError ? err.message : 'Error de conexión. Probá de nuevo.',
          enviando: false,
        });
      }
    }
  }

  const escanerEstado = (view: AuditView): EscanerEstado => {
    if (view.status === 'error') return 'error';
    return view.progress.fotos_analizadas >= view.progress.total ? 'sintetizando' : 'analizando';
  };

  return (
    <div className="dmx">
      <div className="grain" />
      <div className="vignette" />
      {fase.nombre === 'cargando' && (
        <div className="dmx-simple" style={{ alignItems: 'center' }}>
          <p className="mono" style={{ fontSize: '.7rem', color: 'var(--ink-mute)' }}>Abriendo expediente…</p>
        </div>
      )}
      {fase.nombre === 'login' && <PantallaLogin />}
      {fase.nombre === 'mesa' && <PantallaMesa error={fase.error} enviando={fase.enviando} onEnviar={(f) => void enviar(f)} />}
      {fase.nombre === 'escaner' && (
        <Escaner
          total={fase.view.progress.total}
          leidas={fase.view.progress.fotos_analizadas}
          estado={escanerEstado(fase.view)}
          qa={qa}
          onVolver={() => setFase({ nombre: 'mesa', error: null, enviando: false })}
        />
      )}
      {fase.nombre === 'informe' && fase.view.result && (
        <Informe
          score={fase.view.result.score_coherencia}
          arquetipo={fase.view.result.arquetipo_detectado.nombre}
          confianza={Math.round(fase.view.result.arquetipo_detectado.confianza * 100)}
          lectura={fase.view.result.lectura_200ms}
          nFotos={fase.view.result.evidencia_por_foto.length}
          qa={qa}
        />
      )}
      {fase.nombre === 'limite' && <PantallaLimite />}
    </div>
  );
}

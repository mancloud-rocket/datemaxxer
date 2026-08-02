'use client';

/**
 * Home de /app (dentro de la casa del layout: sesión ya garantizada).
 * Fases: cargando → (restaura /me/audit) → mesa | escaner | informe | limite.
 * El error de auditoría se muestra DENTRO del escáner (set piece del prototipo),
 * no rebota a la mesa: el usuario decide volver.
 *
 * QA (bypassea el layout entero, ver layout.tsx): ?estado=login|mesa|analizando|sintetizando|error|informe|limite
 *   · ?fotos=4..9 · ?leidas=0..N · ?qa=1 (estados finales instantáneos para captures)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, crearAuditoria, miAuditoria, obtenerAuditoria, type AuditView } from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';
import { Escaner, type EscanerEstado } from './Escaner';
import { Informe } from './Informe';
import { Login } from './Login';
import { Mesa } from './Mesa';
import { PantallaLimite } from './pantallas';

type Fase =
  | { nombre: 'cargando' }
  | { nombre: 'login' } // solo alcanzable vía QA: el layout gatekeepea el login real
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
  const base: AuditView = { audit_id: 'qa', status: 'analyzing', progress: { fotos_analizadas: leidas, total }, created_at: new Date().toISOString() };
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
          audit_id: 'qa', status: 'done', progress: { fotos_analizadas: total, total }, created_at: new Date().toISOString(),
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

export default function AppHome() {
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
        // El layout gatekeepea la sesión: esto solo pasaría en una carrera
        // transitoria (token venciendo justo acá). El listener del layout
        // va a reaccionar solo en cuanto Supabase confirme la sesión perdida.
        setFase({ nombre: 'mesa', error: 'Tu sesión se interrumpió. Recarga la página.', enviando: false });
        return;
      }
      const audit = await miAuditoria(token);
      if (!audit) setFase({ nombre: 'mesa', error: null, enviando: false });
      else if (audit.status === 'analyzing') setFase({ nombre: 'escaner', view: audit });
      else if (audit.status === 'done') setFase({ nombre: 'informe', view: audit });
      else setFase({ nombre: 'mesa', error: 'Tu auditoría anterior falló (no gastó tu cupo). Prueba de nuevo.', enviando: false });
    } catch {
      setFase({ nombre: 'mesa', error: 'No pudimos conectar con el expediente. Recarga la página.', enviando: false });
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
    } else {
      void restaurar();
    }
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
      setFase({ nombre: 'mesa', error: 'Tu sesión se interrumpió. Recarga la página.', enviando: false });
      return;
    }
    try {
      const { audit_id } = await crearAuditoria(token, form);
      const total = form.getAll('photos').length;
      setFase({
        nombre: 'escaner',
        view: { audit_id, status: 'analyzing', progress: { fotos_analizadas: 0, total }, created_at: new Date().toISOString() },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit_reached') setFase({ nombre: 'limite' });
      else {
        setFase({
          nombre: 'mesa',
          error: err instanceof ApiError ? err.message : 'Error de conexión. Prueba de nuevo.',
          enviando: false,
        });
      }
    }
  }

  const escanerEstado = (view: AuditView): EscanerEstado => {
    if (view.status === 'error') return 'error';
    return view.progress.fotos_analizadas >= view.progress.total ? 'sintetizando' : 'analizando';
  };

  if (fase.nombre === 'cargando') {
    return (
      <div className="dmx-simple" style={{ alignItems: 'center' }}>
        <p className="mono" style={{ fontSize: '.7rem', color: 'var(--ink-mute)' }}>Abriendo expediente…</p>
      </div>
    );
  }
  if (fase.nombre === 'login') return <Login />; // solo QA
  if (fase.nombre === 'mesa') return <Mesa error={fase.error} enviando={fase.enviando} onEnviar={(f) => void enviar(f)} />;
  if (fase.nombre === 'escaner') {
    return (
      <Escaner
        total={fase.view.progress.total}
        leidas={fase.view.progress.fotos_analizadas}
        estado={escanerEstado(fase.view)}
        qa={qa}
        onVolver={() => setFase({ nombre: 'mesa', error: null, enviando: false })}
      />
    );
  }
  if (fase.nombre === 'informe' && fase.view.result) {
    return (
      <Informe
        score={fase.view.result.score_coherencia}
        arquetipo={fase.view.result.arquetipo_detectado.nombre}
        confianza={Math.round(fase.view.result.arquetipo_detectado.confianza * 100)}
        lectura={fase.view.result.lectura_200ms}
        nFotos={fase.view.result.evidencia_por_foto.length}
        qa={qa}
        onRehacer={() => setFase({ nombre: 'mesa', error: null, enviando: false })}
      />
    );
  }
  if (fase.nombre === 'limite') return <PantallaLimite />;
  return null;
}

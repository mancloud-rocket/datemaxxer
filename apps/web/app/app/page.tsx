'use client';

/**
 * Shell de /app: sesión Supabase + máquina de estados contra la API.
 * Fases: cargando → login → (restaura /me/audit) → mesa | escaner | informe | limite.
 * Las pantallas son esqueleto; la dirección de arte llega de FRONT (design/app/).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, crearAuditoria, miAuditoria, obtenerAuditoria, type AuditView } from '../../lib/api';
import { getAccessToken, getSupabase } from '../../lib/supabase';
import {
  PantallaEscaner,
  PantallaInforme,
  PantallaLimite,
  PantallaLogin,
  PantallaMesa,
} from './pantallas';

type Fase =
  | { nombre: 'cargando' }
  | { nombre: 'login' }
  | { nombre: 'mesa'; error: string | null; enviando: boolean }
  | { nombre: 'escaner'; view: AuditView }
  | { nombre: 'informe'; view: AuditView }
  | { nombre: 'limite' };

const POLL_MS = 2500;

export default function AppShell() {
  const [fase, setFase] = useState<Fase>({ nombre: 'cargando' });
  const restaurando = useRef(false);

  const restaurar = useCallback(async () => {
    if (restaurando.current) return;
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

  // Sesión: al montar y en cada cambio de auth
  useEffect(() => {
    void restaurar();
    const { data } = getSupabase().auth.onAuthStateChange((_evento, session) => {
      if (session) void restaurar();
      else setFase({ nombre: 'login' });
    });
    return () => data.subscription.unsubscribe();
  }, [restaurar]);

  // Polling mientras el escáner corre
  useEffect(() => {
    if (fase.nombre !== 'escaner') return;
    const id = fase.view.audit_id;
    const timer = setInterval(() => {
      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        try {
          const view = await obtenerAuditoria(token, id);
          if (view.status === 'done') setFase({ nombre: 'informe', view });
          else if (view.status === 'error') {
            setFase({
              nombre: 'mesa',
              error: 'La auditoría falló de nuestro lado (no gastó tu cupo). Probá de nuevo.',
              enviando: false,
            });
          } else setFase({ nombre: 'escaner', view });
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

  return (
    <main style={{ minHeight: '100dvh', padding: '4rem 1.2rem' }}>
      {fase.nombre === 'cargando' && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '.24em',
            fontSize: '.7rem',
            color: 'var(--ink-mute)',
            textAlign: 'center',
          }}
        >
          Cargando expediente…
        </p>
      )}
      {fase.nombre === 'login' && <PantallaLogin />}
      {fase.nombre === 'mesa' && <PantallaMesa error={fase.error} enviando={fase.enviando} onEnviar={(f) => void enviar(f)} />}
      {fase.nombre === 'escaner' && <PantallaEscaner view={fase.view} />}
      {fase.nombre === 'informe' && <PantallaInforme view={fase.view} />}
      {fase.nombre === 'limite' && <PantallaLimite />}
    </main>
  );
}

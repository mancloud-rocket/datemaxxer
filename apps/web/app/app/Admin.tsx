'use client';

/**
 * Panel de admin · activación manual de planes.
 *
 * Mientras el cobro no esté automatizado el circuito es: el usuario pide el plan
 * desde la app → llega un mail → se le manda el link de pago → cuando entra la
 * plata se le activa acá. Dos bloques: los pedidos pendientes arriba (lo urgente)
 * y todos los usuarios abajo (para tocar cualquier plan sin esperar un pedido).
 *
 * Esta pantalla no se defiende sola: cada ruta /admin/* de la API responde 404
 * a quien no está en ADMIN_USER_IDS. Acá solo se esconde el link.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Plan } from '@percentil/contracts';
import {
  ApiError,
  cambiarPlan,
  listarUsuarios,
  solicitudesPendientes,
  type SolicitudAdmin,
  type UsuarioAdmin,
} from '../../lib/api';
import { getAccessToken } from '../../lib/supabase';

const PLANES: Array<{ v: Plan; label: string }> = [
  { v: 'free', label: 'Free' },
  { v: 'kit', label: 'Kit' },
  { v: 'copilot', label: 'Copiloto' },
];

const NOMBRE_SKU: Record<string, string> = {
  kit: 'Kit · US$ 19',
  copiloto_mensual: 'Copiloto · mensual',
};

/** El sku pedido mapea al plan que hay que dar. */
const PLAN_DE_SKU: Record<string, Plan> = { kit: 'kit', copiloto_mensual: 'copilot' };

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' });
}

export function Admin() {
  const [solicitudes, setSolicitudes] = useState<SolicitudAdmin[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === '1') {
      // QA sin sesión real (ver layout.tsx): datos de muestra para poder
      // previsualizar los dos bloques llenos.
      setSolicitudes([
        {
          id: 's1', userId: 'u-1', email: 'nacho@gmail.com', sku: 'kit', estado: 'pendiente',
          mensaje: 'pago con mercadopago argentina, avisame', created_at: '2026-07-26T14:00:00Z',
        },
        {
          id: 's2', userId: 'u-2', email: 'martin.silva@gmail.com', sku: 'copiloto_mensual',
          estado: 'pendiente', mensaje: null, created_at: '2026-07-25T10:00:00Z',
        },
      ]);
      setUsuarios([
        { id: 'u-1', email: 'nacho@gmail.com', creado: '2026-07-20T00:00:00Z', ultimoAcceso: null, plan: 'free', auditorias: 2 },
        { id: 'u-2', email: 'martin.silva@gmail.com', creado: '2026-07-18T00:00:00Z', ultimoAcceso: null, plan: 'free', auditorias: 1 },
        { id: 'u-3', email: 'fernando@rocketbot.com', creado: '2026-07-01T00:00:00Z', ultimoAcceso: null, plan: 'copilot', auditorias: 14 },
      ]);
      setCargando(false);
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recargá la página.');
      setCargando(false);
      return;
    }
    try {
      const [s, u] = await Promise.all([solicitudesPendientes(token), listarUsuarios(token)]);
      setSolicitudes(s);
      setUsuarios(u);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Esta cuenta no es admin.'
          : 'No pudimos cargar el panel.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function aplicar(userId: string, plan: Plan, solicitudId?: string) {
    setTrabajando(solicitudId ?? userId);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recargá la página.');
      setTrabajando(null);
      return;
    }
    try {
      await cambiarPlan(token, userId, plan, solicitudId);
      // Optimista sobre la lista de usuarios; las solicitudes se recargan del
      // servidor porque el estado lo decide la API (activada / rechazada).
      setUsuarios((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
      if (solicitudId !== undefined) {
        setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos cambiar el plan.');
    } finally {
      setTrabajando(null);
    }
  }

  const visibles = usuarios.filter((u) => {
    const q = filtro.trim().toLowerCase();
    return q === '' || (u.email ?? '').toLowerCase().includes(q) || u.id.includes(q);
  });

  return (
    <div className="dmx-admin">
      <header className="chead">
        <p className="kicker k-ox"><i />Panel interno</p>
        <h1 className="display">Planes.</h1>
        <p className="hint">
          El cobro todavía es a mano: mandás el link de pago y activás el plan acá cuando entra la plata.
        </p>
      </header>

      {cargando ? (
        <div className="loading-row"><span className="dot" />CARGANDO…</div>
      ) : (
        <>
          {error && <p className="err-general">{error}</p>}

          <section className="bloque">
            <div className="bhead">
              <h2>Pedidos pendientes</h2>
              <span className={`selloe${solicitudes.length === 0 ? ' s-mute' : ''}`}>
                {solicitudes.length}
              </span>
            </div>

            {solicitudes.length === 0 ? (
              <p className="vacio">Nadie pidió nada todavía.</p>
            ) : (
              <div className="filas">
                {solicitudes.map((s) => (
                  <div className="fila pedido" key={s.id}>
                    <div className="quien">
                      <b>{s.email ?? 'sin email'}</b>
                      <small>{NOMBRE_SKU[s.sku] ?? s.sku} · {fecha(s.created_at)}</small>
                      {s.mensaje && <p className="nota">{s.mensaje}</p>}
                    </div>
                    <div className="acciones">
                      <button
                        className="btn btn-sm"
                        disabled={trabajando === s.id}
                        onClick={() => void aplicar(s.userId, PLAN_DE_SKU[s.sku] ?? 'kit', s.id)}
                      >
                        {trabajando === s.id ? 'Activando…' : 'Activar'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={trabajando === s.id}
                        onClick={() => void aplicar(s.userId, 'free', s.id)}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bloque">
            <div className="bhead">
              <h2>Usuarios</h2>
              <span className="selloe s-mute">{usuarios.length}</span>
            </div>
            <input
              className="input"
              type="search"
              placeholder="Buscar por mail o id"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />

            <div className="filas">
              {visibles.map((u) => (
                <div className="fila" key={u.id}>
                  <div className="quien">
                    <b>{u.email ?? u.id.slice(0, 8)}</b>
                    <small>{u.auditorias} análisis · alta {fecha(u.creado)}</small>
                  </div>
                  <div className="planes">
                    {PLANES.map((p) => (
                      <button
                        key={p.v}
                        type="button"
                        className={`chip${u.plan === p.v ? ' on' : ''}`}
                        disabled={trabajando === u.id || u.plan === p.v}
                        onClick={() => void aplicar(u.id, p.v)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {visibles.length === 0 && <p className="vacio">Ningún usuario coincide.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

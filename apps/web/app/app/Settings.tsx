'use client';

/**
 * Configuración de cuenta: región, cuentas vinculadas (Google + email), salir.
 * Esqueleto funcional sin diseño (piel pendiente de FRONT, mismo criterio que
 * Mesa/Login antes de que les pusieran arte).
 *
 * Alcance de "cuentas vinculadas" v1 (decisión de Fernando 19-jul): SOLO
 * Google + email, vía identidades nativas de Supabase (auth.linkIdentity),
 * no integración con apps de citas de terceros. Vincular Google a una cuenta
 * que arrancó por email es sólido (linkIdentity, feature estándar). Agregar
 * email a una cuenta que arrancó por Google es un flujo distinto que no
 * armé todavía (requiere updateUser({email}) + confirmación) - queda
 * marcado como pendiente, no lo emulé para no romper algo a medias.
 */

import { useEffect, useState } from 'react';
import { Region } from '@percentil/contracts';
import { actualizarPerfil, ApiError, obtenerPerfil } from '../../lib/api';
import { displayUser, getAccessToken, getSupabase } from '../../lib/supabase';

const REGIONES = Region.options;

export function Settings() {
  const [region, setRegion] = useState<Region>('neutro');
  const [handle, setHandle] = useState('');
  const [plan, setPlan] = useState<'free' | 'kit' | 'copilot'>('free');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [vinculando, setVinculando] = useState(false);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dev') === '1') {
      // QA sin sesión real (ver layout.tsx): datos de muestra para poder
      // previsualizar el formulario completo.
      setRegion('rioplatense');
      setHandle('Fernando');
      setPlan('free');
      setProveedores(['email']);
      setCargando(false);
      return;
    }
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setError('Tu sesión se interrumpió. Recargá la página.');
        setCargando(false);
        return;
      }
      try {
        const perfil = await obtenerPerfil(token);
        setRegion(perfil.region);
        setHandle(perfil.handle ?? '');
        setPlan(perfil.plan);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No pudimos cargar tu configuración.');
      } finally {
        setCargando(false);
      }
      const { data } = await getSupabase().auth.getUser();
      if (data.user) setProveedores(displayUser(data.user).proveedores);
    })();
  }, []);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recargá la página.');
      setGuardando(false);
      return;
    }
    try {
      await actualizarPerfil(token, { region, handle: handle.trim() || null });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  }

  async function vincularGoogle() {
    setVinculando(true);
    setErrorVinculo(null);
    const { error: err } = await getSupabase().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    setVinculando(false);
    if (err) setErrorVinculo(err.message);
    // si funciona, Supabase redirige a Google y vuelve; onAuthStateChange del
    // layout actualiza la sesión sola.
  }

  async function salir() {
    await getSupabase().auth.signOut();
  }

  if (cargando) {
    return <p className="mono" style={{ color: 'var(--ink-mute)', fontSize: '.7rem' }}>Cargando…</p>;
  }

  return (
    <div style={{ maxWidth: 480, display: 'grid', gap: '2rem' }}>
      <div>
        <h1 className="display" style={{ fontSize: 'clamp(1.5rem,5vw,2rem)', marginBottom: '.4rem' }}>
          Configuración
        </h1>
        <p className="mono" style={{ fontSize: '.62rem', color: 'var(--ink-mute)' }}>
          PLAN ACTUAL · {plan.toUpperCase()}
        </p>
      </div>

      <section>
        <h2 style={{ fontSize: '1rem', marginBottom: '.6rem' }}>Cómo hablas</h2>
        <select className="campo" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
          {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </section>

      <section>
        <h2 style={{ fontSize: '1rem', marginBottom: '.6rem' }}>Nombre para mostrar</h2>
        <input
          className="campo"
          type="text"
          maxLength={60}
          placeholder="Opcional"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
      </section>

      <section>
        <h2 style={{ fontSize: '1rem', marginBottom: '.6rem' }}>Cuentas vinculadas</h2>
        <ul style={{ listStyle: 'none', display: 'grid', gap: '.5rem' }}>
          <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Google</span>
            {proveedores.includes('google') ? (
              <span className="selloe s-cy">Vinculada</span>
            ) : (
              <button className="btn btn-ghost" disabled={vinculando} onClick={() => void vincularGoogle()}>
                {vinculando ? 'Abriendo…' : 'Agregar'}
              </button>
            )}
          </li>
          <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Email</span>
            {proveedores.includes('email') ? (
              <span className="selloe s-cy">Vinculada</span>
            ) : (
              <span className="mono" style={{ fontSize: '.6rem', color: 'var(--steel)' }}>No disponible todavía</span>
            )}
          </li>
        </ul>
        {errorVinculo && <p style={{ color: 'var(--oxide)', marginTop: '.6rem' }}>{errorVinculo}</p>}
      </section>

      {error && <p style={{ color: 'var(--oxide)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '.8rem', alignItems: 'center' }}>
        <button className="btn" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {guardado && <span style={{ color: 'var(--signal)', fontWeight: 600 }}>Guardado.</span>}
      </div>

      <section style={{ borderTop: '1px solid var(--line)', paddingTop: '1.4rem' }}>
        <button className="btn btn-ghost" onClick={() => void salir()}>Cerrar sesión</button>
      </section>
    </div>
  );
}

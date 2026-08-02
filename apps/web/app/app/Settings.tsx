'use client';

/**
 * Configuración de cuenta · set piece "Los puertos de conexión" (porteo
 * fiel de design/app/settings.html, SET-PIECES.md #5): las cuentas
 * vinculadas son puertos físicos que se iluminan cyan al conectar, el
 * selector de región reusa el patrón exacto de la mesa, guardar dispara
 * un check cyan dibujándose.
 *
 * Alcance de "cuentas vinculadas" v1 (decisión de Fernando 19-jul): SOLO
 * Google + email, vía identidades nativas de Supabase (auth.linkIdentity),
 * no integración con apps de citas de terceros. Vincular Google a una cuenta
 * que arrancó por email es sólido (linkIdentity, feature estándar). Agregar
 * email a una cuenta que arrancó por Google es un flujo distinto que no
 * armé todavía (requiere updateUser({email}) + confirmación) - queda
 * marcado como pendiente, no lo emulé para no romper algo a medias.
 */

import { useEffect, useRef, useState } from 'react';
import { Region } from '@percentil/contracts';
import { actualizarPerfil, ApiError, obtenerPerfil } from '../../lib/api';
import { displayUser, getAccessToken, getSupabase } from '../../lib/supabase';
import { gsap, setDraw } from '../../lib/motion';

const REGIONES: Array<{ v: Region; label: string; sub: string }> = [
  { v: 'rioplatense', label: 'Rioplatense', sub: 'Vos / che' },
  { v: 'chileno', label: 'Chileno', sub: 'Moderado' },
  { v: 'mexicano', label: 'Mexicano', sub: 'Tú / moderado' },
  { v: 'neutro', label: 'Neutro', sub: 'Tú' },
];

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
  const root = useRef<HTMLDivElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const saveOkRef = useRef<HTMLSpanElement>(null);
  const entrada = useRef(false);
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        setError('Tu sesión se interrumpió. Recarga la página.');
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

  /* entrada en cascada (header → campos), una sola vez cuando el panel queda listo */
  useEffect(() => {
    const el = root.current;
    if (cargando || !el || entrada.current) return;
    entrada.current = true;
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    if (REDUCED || qa) return; // ?qa=1: --virtual-time-budget no es confiable con GSAP, se queda en el estado CSS visible
    const ctx = gsap.context(() => {
      gsap.set(['.chead', '.field', '.saverow'], { autoAlpha: 0, y: 22 });
      gsap.timeline()
        .to('.chead', { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, 0.05)
        .to('.field', { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.12, ease: 'power2.out' }, 0.2)
        .to('.saverow', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.65);
    }, el);
    return () => ctx.revert();
  }, [cargando, REDUCED]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError('Tu sesión se interrumpió. Recarga la página.');
      setGuardando(false);
      return;
    }
    try {
      await actualizarPerfil(token, { region, handle: handle.trim() || null });
      const check = checkRef.current;
      const ok = saveOkRef.current;
      if (check && ok && !REDUCED) {
        gsap.set(ok, { autoAlpha: 1 });
        gsap.fromTo(check, { strokeDashoffset: setDraw(check) }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' });
        gsap.delayedCall(2.2, () => gsap.to(ok, { autoAlpha: 0, duration: 0.4 }));
      } else {
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2200);
      }
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

  const googleOn = proveedores.includes('google');
  const emailOn = proveedores.includes('email');

  return (
    <div className="dmx-settings" ref={root}>
      <header className="chead">
        <p className="kicker"><i />Tu cuenta</p>
        <h1 className="display">Configuración.</h1>
        <div className="plan"><span className="selloe">Plan · {plan.charAt(0).toUpperCase() + plan.slice(1)}</span></div>
      </header>

      {cargando ? (
        <div className="loading-row"><span className="dot" />CARGANDO TU PANEL…</div>
      ) : (
        <div>
          <section className="field">
            <h2>Cómo hablas</h2>
            <p className="hint">Ajustamos el registro de tu informe a tu región.</p>
            <div className="regsel">
              {REGIONES.map((r) => (
                <button
                  key={r.v}
                  type="button"
                  className={`reg${region === r.v ? ' on' : ''}`}
                  onClick={() => setRegion(r.v)}
                >
                  {r.label}<small>{r.sub}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="field">
            <h2>Nombre para mostrar</h2>
            <p className="hint">Opcional. Así te vamos a llamar en el panel.</p>
            <input
              className="input"
              type="text"
              maxLength={60}
              placeholder="Tu nombre"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </section>

          <section className="field">
            <h2>Cuentas vinculadas</h2>
            <p className="hint">Cómo entrás a tu panel. Podés tener las dos activas.</p>
            <div className="ports">
              <div className={`port${googleOn ? ' on' : ''}`}>
                <svg className="socket" viewBox="0 0 44 44">
                  <circle className="ring" cx="22" cy="22" r="16" />
                  <circle className="core" cx="22" cy="22" r="10" />
                  <circle className="pin" cx="22" cy="22" r="3.4" />
                </svg>
                <div className="plabel"><b>Google</b><small>{googleOn ? 'Conexión activa' : 'No conectada'}</small></div>
                <div className="act">
                  {googleOn ? (
                    <span className="selloe s-cy">Conectada</span>
                  ) : (
                    <button className="btn btn-ghost" disabled={vinculando} onClick={() => void vincularGoogle()}>
                      {vinculando ? 'Abriendo…' : 'Conectar'}
                    </button>
                  )}
                </div>
              </div>
              <div className={`port${emailOn ? ' on' : ''}`}>
                <svg className="socket" viewBox="0 0 44 44">
                  <circle className="ring" cx="22" cy="22" r="16" />
                  <circle className="core" cx="22" cy="22" r="10" />
                  <circle className="pin" cx="22" cy="22" r="3.4" />
                </svg>
                <div className="plabel"><b>Email</b><small>Conexión por código</small></div>
                <div className="act">
                  {emailOn ? (
                    <span className="selloe s-cy">Conectada</span>
                  ) : (
                    <span className="mono" style={{ fontSize: '.6rem', color: 'var(--steel)' }}>No disponible todavía</span>
                  )}
                </div>
              </div>
            </div>
            {errorVinculo && <p className="err-vinculo">{errorVinculo}</p>}
          </section>

          <div className="saverow">
            <button className="btn" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <span className="saveok" ref={saveOkRef} style={REDUCED && guardado ? { opacity: 1 } : undefined}>
              <svg viewBox="0 0 24 24"><path ref={checkRef} d="M5 13 L10 18 L19 6" /></svg>
              Guardado
            </span>
          </div>
          {error && <p className="err-general">{error}</p>}

          <section className="field divider">
            <button className="btn btn-ghost" onClick={() => void salir()}>Cerrar sesión</button>
          </section>
        </div>
      )}
    </div>
  );
}

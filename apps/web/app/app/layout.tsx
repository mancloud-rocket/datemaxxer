'use client';

/**
 * Casa persistente de /app: gatekeeper de sesión + sidebar. Sin sesión, la
 * pantalla completa es <Login/> (sin sidebar). Con sesión, todo lo demás
 * (home de auditoría, /app/settings, etc.) vive envuelto en el Sidebar.
 *
 * QA (?estado=...): bypassea el gate de sesión completo y renderiza los
 * children directo, sin sidebar - cada página maneja sus propios estados
 * forzables (ver page.tsx). Así las capturas aisladas de una pantalla no
 * dependen de tener sesión real.
 *
 * QA del sidebar (?dev=1): sesión fake para poder previsualizar/diseñar el
 * Sidebar y /app/settings sin login real. Combinable con ?estado= (ej.
 * /app?dev=1&estado=informe muestra sidebar + informe juntos).
 */

import { useEffect, useState } from 'react';
import { getSupabase, displayUser, type DisplayUser } from '../../lib/supabase';
import { Login } from './Login';
import { Sidebar } from './Sidebar';
import './app.css';

type Estado = { tipo: 'cargando' } | { tipo: 'anonimo' } | { tipo: 'sesion'; user: DisplayUser };

const FAKE_USER: DisplayUser = {
  nombre: 'Fernando (QA)',
  email: 'qa@datemaxxer.dev',
  avatarUrl: null,
  iniciales: 'FQ',
  proveedores: ['email'],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [qa, setQa] = useState(false);
  const [devSidebar, setDevSidebar] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQa(params.has('estado'));
    setDevSidebar(params.get('dev') === '1');
  }, []);

  useEffect(() => {
    if (qa && !devSidebar) return;
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      setEstado(data.session ? { tipo: 'sesion', user: displayUser(data.session.user) } : { tipo: 'anonimo' });
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
      setEstado(session ? { tipo: 'sesion', user: displayUser(session.user) } : { tipo: 'anonimo' });
    });
    return () => data.subscription.unsubscribe();
  }, [qa, devSidebar]);

  if (devSidebar) {
    return (
      <div className="dmx">
        <div className="grain" />
        <div className="vignette" />
        <Sidebar user={estado.tipo === 'sesion' ? estado.user : FAKE_USER}>{children}</Sidebar>
      </div>
    );
  }

  if (qa) {
    // Bypass del gate de sesión, PERO el wrapper base (fondo, grain, vignette)
    // lo siguen necesitando todas las pantallas - cada página maneja su
    // propio ?estado= adentro de children.
    return (
      <div className="dmx">
        <div className="grain" />
        <div className="vignette" />
        {children}
      </div>
    );
  }

  if (estado.tipo === 'cargando') {
    return (
      <div className="dmx">
        <div className="dmx-simple" style={{ alignItems: 'center' }}>
          <p className="mono" style={{ fontSize: '.7rem', color: 'var(--ink-mute)' }}>Abriendo tu cabina…</p>
        </div>
      </div>
    );
  }

  if (estado.tipo === 'anonimo') {
    return (
      <div className="dmx">
        <div className="grain" />
        <div className="vignette" />
        <Login />
      </div>
    );
  }

  return (
    <div className="dmx">
      <div className="grain" />
      <div className="vignette" />
      <Sidebar user={estado.user}>{children}</Sidebar>
    </div>
  );
}

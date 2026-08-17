'use client';

/**
 * Sidebar persistente de /app · set piece "El panel de cabina" (porteo fiel
 * de design/app/settings.html, SET-PIECES.md #5): marca (glifo XX + wordmark),
 * botones retroiluminados (LED + riel cyan en la pantalla activa), placa de
 * identidad con esquineros de archivo, interruptor de salida. Colapsa a
 * franja superior en mobile (<860px, ver app.css).
 *
 * Entra una sola vez por sesión (el layout no remonta la sidebar al navegar
 * entre Auditoría/Configuración - solo cambian los children).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { obtenerPerfil } from '../../lib/api';
import { IconoModulo } from './Iconos';
import { gsap } from '../../lib/motion';
import { getAccessToken, getSupabase, type DisplayUser } from '../../lib/supabase';

/**
 * El sidebar no es una lista de features: es el recorrido del caso, en el
 * orden en que se vive. Tres etapas unidas por un riel (preparás tu perfil →
 * decidís sobre ella → jugás la conversación) y cada módulo con su promesa en
 * una línea, porque "Radar" solo no dice qué hace.
 */
const ETAPAS: Array<{
  titulo: string;
  items: Array<{ href: string; label: string; desc: string; icono: string }>;
}> = [
  {
    titulo: 'Tu perfil',
    items: [
      { href: '/app', label: 'Mi perfil', desc: 'La auditoría: dónde estás parado', icono: 'medidor' },
      { href: '/app/fotos', label: 'Mis fotos', desc: 'La misma foto, bien revelada', icono: 'foto' },
      { href: '/app/bio', label: 'Mi bio', desc: 'Tres variantes que suenan a vos', icono: 'bio' },
    ],
  },
  {
    titulo: 'Antes del like',
    items: [
      { href: '/app/radar', label: 'Radar', desc: '¿Vale el like? En segundos', icono: 'radar' },
      { href: '/app/perfil', label: 'Leer un perfil', desc: '¿Tenés chance? Con qué abrirle', icono: 'lupa' },
      { href: '/app/comparar', label: 'Comparar', desc: 'Tu mejor foto contra la de ella', icono: 'vs' },
    ],
  },
  {
    titulo: 'La conversación',
    items: [
      { href: '/app/chats', label: 'Chats', desc: '¿Va bien? Números y qué mandar', icono: 'chat' },
      { href: '/app/coach', label: 'Coach', desc: 'Hablalo: insistir o soltar', icono: 'brujula' },
    ],
  },
];

const SISTEMA: Array<{ href: string; label: string; desc: string; icono: string }> = [
  { href: '/app/historial', label: 'Historial', desc: 'Cómo se movió tu número', icono: 'historial' },
  { href: '/app/settings', label: 'Configuración', desc: 'Tu cuenta y tu registro', icono: 'config' },
];

export function Sidebar(props: { user: DisplayUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const root = useRef<HTMLElement>(null);
  // El link de admin solo lo ve un admin. Esconderlo es cosmética: quien adivine
  // la URL igual choca con el 404 de la API en cada ruta /admin/*.
  const [esAdmin, setEsAdmin] = useState(false);
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dev') === '1') {
      setEsAdmin(true); // QA sin sesión real (ver layout.tsx)
      return;
    }
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        setEsAdmin((await obtenerPerfil(token)).esAdmin);
      } catch {
        /* si /me falla, el sidebar igual funciona: solo no aparece el link */
      }
    })();
  }, []);

  useEffect(() => {
    const el = root.current;
    const qa = new URLSearchParams(window.location.search).get('qa') === '1';
    if (!el || REDUCED || qa) return; // ?qa=1: --virtual-time-budget no es confiable con GSAP, se queda en el estado CSS visible
    const ctx = gsap.context(() => {
      gsap.set(['.dmx-sidebar-link', '.dmx-sidebar-user', '.dmx-sidebar-salir'], { autoAlpha: 0, x: -18 });
      gsap.timeline()
        .to('.dmx-sidebar-link', { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, 0)
        .to('.dmx-sidebar-user', { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 0.2)
        .to('.dmx-sidebar-salir', { autoAlpha: 1, x: 0, duration: 0.5, ease: 'power2.out' }, 0.3);
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salir() {
    await getSupabase().auth.signOut();
  }

  return (
    <div className="dmx-shell">
      <aside className="dmx-sidebar" ref={root}>
        <div className="dmx-sidebar-brand">
          <div className="wordmark" role="heading" aria-level={2} aria-label="Datemaxxer">
            <span className="wm-t">DATEMA</span>
            <svg className="wm-xx" viewBox="0 0 176 96" aria-hidden="true">
              <defs>
                <linearGradient id="wmgSidebar" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#6FEBD4" /><stop offset="1" stopColor="#2FAE97" />
                </linearGradient>
              </defs>
              <g>
                <path className="xbar" d="M6 0 L32 0 L80 96 L54 96 Z" />
                <path className="xbar" d="M54 0 L80 0 L32 96 L6 96 Z" />
                <path className="thread" d="M29.5 21 C36 34 50 62 56.5 75" />
                <path className="thread" d="M56.4 21 C50 34 36 62 29.6 75" />
                <path className="tail" d="M29.5 21 C22 8 34 2 27 12" />
                <circle className="eyelet" cx="29.5" cy="21" r="4.6" /><circle className="eyelet" cx="56.4" cy="21" r="4.6" />
                <circle className="eyelet" cx="29.6" cy="75" r="4.6" /><circle className="eyelet" cx="56.5" cy="75" r="4.6" />
              </g>
              <g transform="translate(90 0)">
                <path className="xbar" d="M6 0 L32 0 L80 96 L54 96 Z" />
                <path className="xbar" d="M54 0 L80 0 L32 96 L6 96 Z" />
                <path className="thread" d="M29.5 21 C36 34 50 62 56.5 75" />
                <path className="thread" d="M56.4 21 C50 34 36 62 29.6 75" />
                <path className="tail" d="M56.5 75 C64 88 50 94 58 84" />
                <circle className="eyelet" cx="29.5" cy="21" r="4.6" /><circle className="eyelet" cx="56.4" cy="21" r="4.6" />
                <circle className="eyelet" cx="29.6" cy="75" r="4.6" /><circle className="eyelet" cx="56.5" cy="75" r="4.6" />
              </g>
            </svg>
            <span className="wm-t">ER</span>
          </div>
        </div>

        <nav className="dmx-sidebar-nav">
          {ETAPAS.map((etapa) => (
            <div className="dmx-sidebar-etapa" key={etapa.titulo}>
              <div className="etapa-titulo"><i className="nodo" />{etapa.titulo}</div>
              {etapa.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`dmx-sidebar-link${pathname === item.href ? ' on' : ''}`}
                >
                  <IconoModulo nombre={item.icono} className="modicono" />
                  <span className="lab">
                    <b>{item.label}</b>
                    <small>{item.desc}</small>
                  </span>
                </Link>
              ))}
            </div>
          ))}

          <div className="dmx-sidebar-etapa sistema">
            {(esAdmin
              ? [...SISTEMA, { href: '/app/admin', label: 'Admin', desc: 'Planes y usuarios', icono: 'llave' }]
              : SISTEMA
            ).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`dmx-sidebar-link${pathname === item.href ? ' on' : ''}`}
              >
                <IconoModulo nombre={item.icono} className="modicono" />
                <span className="lab">
                  <b>{item.label}</b>
                  <small>{item.desc}</small>
                </span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="dmx-sidebar-user" style={{ marginTop: 'auto' }}>
          <div className="dmx-avatar-wrap">
            {props.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.user.avatarUrl} alt="" className="dmx-avatar" />
            ) : (
              <div className="dmx-avatar dmx-avatar-fallback">{props.user.iniciales}</div>
            )}
            <svg className="dmx-avatar-corners" viewBox="0 0 44 44">
              <path d="M2 12 L2 2 L12 2 M32 2 L42 2 L42 12 M42 32 L42 42 L32 42 M12 42 L2 42 L2 32" />
            </svg>
          </div>
          <div className="dmx-sidebar-user-info">
            <div className="dmx-sidebar-user-name">{props.user.nombre}</div>
            {props.user.email && <div className="dmx-sidebar-user-email">{props.user.email}</div>}
          </div>
        </div>

        <button className="dmx-sidebar-salir" onClick={() => void salir()}>
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          <span className="lab">Cerrar sesión</span>
        </button>
      </aside>
      <main className="dmx-content">{props.children}</main>
    </div>
  );
}

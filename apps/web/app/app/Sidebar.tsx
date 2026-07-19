'use client';

/**
 * Sidebar persistente de /app. Esqueleto funcional (piel pendiente de FRONT,
 * mismo criterio que se usó con Mesa/Login antes de que les pusieran diseño):
 * avatar+nombre, nav, cerrar sesión. Colapsa a header simple en mobile via CSS
 * (ver .dmx-sidebar en app.css) - la resolución final del patrón mobile
 * (drawer vs bottom-nav) queda para FRONT.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabase, type DisplayUser } from '../../lib/supabase';

const NAV = [
  { href: '/app', label: 'Auditoría' },
  { href: '/app/settings', label: 'Configuración' },
];

export function Sidebar(props: { user: DisplayUser; children: React.ReactNode }) {
  const pathname = usePathname();

  async function salir() {
    await getSupabase().auth.signOut();
  }

  return (
    <div className="dmx-shell">
      <aside className="dmx-sidebar">
        <div className="dmx-sidebar-brand mono">Datemaxxer</div>
        <nav className="dmx-sidebar-nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`dmx-sidebar-link${pathname === item.href ? ' on' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="dmx-sidebar-user">
          {props.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.user.avatarUrl} alt="" className="dmx-avatar" />
          ) : (
            <div className="dmx-avatar dmx-avatar-fallback">{props.user.iniciales}</div>
          )}
          <div className="dmx-sidebar-user-info">
            <div className="dmx-sidebar-user-name">{props.user.nombre}</div>
            {props.user.email && <div className="dmx-sidebar-user-email mono">{props.user.email}</div>}
          </div>
        </div>
        <button className="btn btn-ghost dmx-sidebar-salir" onClick={() => void salir()}>
          Cerrar sesión
        </button>
      </aside>
      <main className="dmx-content">{props.children}</main>
    </div>
  );
}

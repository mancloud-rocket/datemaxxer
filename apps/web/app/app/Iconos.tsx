/**
 * Íconos de módulo, dibujados a mano (GUIA-VISUAL: nada de librerías).
 * Línea 1.8, currentColor, 24x24. Cada path lleva pathLength={1} para que el
 * CSS pueda animar el trazo (dasharray/dashoffset normalizados) sin medir nada.
 */

const P = { fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 } as const;

export const ICONOS: Record<string, React.ReactNode> = {
  /** Mi perfil: el medidor del veredicto, aguja clavada. */
  medidor: (
    <>
      <path {...P} d="M4 16a8 8 0 0 1 16 0" />
      <path {...P} d="M12 16 L15.5 10.5" />
      <circle {...P} cx="12" cy="16" r="1.4" />
    </>
  ),
  /** Mis fotos: marco con horizonte y sol, la foto clásica. */
  foto: (
    <>
      <rect {...P} x="4" y="5" width="16" height="14" rx="2" />
      <path {...P} d="M4 15.5 L9.5 10.5 L14 15" />
      <circle {...P} cx="15.5" cy="9.5" r="1.6" />
    </>
  ),
  /** Mi bio: tres líneas de texto y el cursor de escribir. */
  bio: (
    <>
      <path {...P} d="M5 7 H19" />
      <path {...P} d="M5 12 H14" />
      <path {...P} d="M5 17 H11" />
      <path {...P} d="M16.5 15 V19" />
    </>
  ),
  /** Radar: el barrido con el blip. */
  radar: (
    <>
      <circle {...P} cx="12" cy="12" r="8" />
      <circle {...P} cx="12" cy="12" r="4" opacity=".45" />
      <path {...P} d="M12 12 L17.5 6.5" />
      <circle cx="15.2" cy="15.2" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  /** Leer un perfil: la lupa sobre la persona. */
  lupa: (
    <>
      <circle {...P} cx="10.5" cy="10.5" r="6.5" />
      <path {...P} d="M15.3 15.3 L20 20" />
      <circle {...P} cx="10.5" cy="9" r="1.8" opacity=".7" />
      <path {...P} d="M7.5 13.5 c1-2 5-2 6 0" opacity=".7" />
    </>
  ),
  /** Comparar: dos fotos enfrentadas, una adelante de la otra. */
  vs: (
    <>
      <rect {...P} x="4" y="7" width="9" height="12" rx="1.5" />
      <rect {...P} x="11" y="5" width="9" height="12" rx="1.5" opacity=".55" />
      <path {...P} d="M8.5 19 V21" opacity=".4" />
    </>
  ),
  /** Chats: dos burbujas, la conversación de los dos lados. */
  chat: (
    <>
      <path {...P} d="M4 6 h10 v7 h-6 l-3 3 v-3 h-1 z" />
      <path {...P} d="M16 10 h4 v6 h-1 v2.5 l-2.5-2.5 h-4 v-2" opacity=".6" />
    </>
  ),
  /** Coach: la brújula, insistir o soltar. */
  brujula: (
    <>
      <circle {...P} cx="12" cy="12" r="8" />
      <path {...P} d="M15 9 L13.2 13.2 L9 15 L10.8 10.8 Z" />
    </>
  ),
  /** Historial: la curva de cómo se movió tu número. */
  historial: (
    <>
      <path {...P} d="M4 5 V19 H20" />
      <path {...P} d="M7 15 L11 11 L14 13 L18 7" />
      <circle cx="18" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  /** Configuración: dos correderas de consola. */
  config: (
    <>
      <path {...P} d="M5 9 H19" />
      <circle {...P} cx="10" cy="9" r="2" />
      <path {...P} d="M5 15 H19" />
      <circle {...P} cx="15" cy="15" r="2" />
    </>
  ),
  /** Admin: la llave del panel. */
  llave: (
    <>
      <circle {...P} cx="8.5" cy="8.5" r="3.5" />
      <path {...P} d="M11 11 L19 19" />
      <path {...P} d="M16 16 L18.5 13.5" />
    </>
  ),
};

export function IconoModulo(props: { nombre: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {ICONOS[props.nombre] ?? ICONOS.medidor}
    </svg>
  );
}

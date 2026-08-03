/**
 * Analítica de funnel.
 *
 * El problema que resuelve: sin esto no se sabe dónde se cae la gente y se
 * optimiza a ciegas. Con esto se puede contestar lo único que importa al
 * principio: de los que entran, cuántos miden, y de los que miden, cuántos
 * piden un plan.
 *
 * ## Qué se manda y qué NO
 *
 * Se manda: el nombre del evento y, como mucho, un número o una etiqueta corta
 * (el bucket del índice, el plan). **Nunca** fotos, ni texto de chats, ni bios,
 * ni el contenido de lo que escribe el usuario, ni datos de la persona del otro
 * lado. Este producto maneja material privado sobre gente real y nada de eso
 * tiene por qué salir a un servicio de terceros para medir un funnel.
 *
 * Sin `NEXT_PUBLIC_POSTHOG_KEY` no se carga nada y no se manda nada: la app
 * funciona igual y no queda un script de terceros colgado en producción.
 */

type Props = Record<string, string | number | boolean>;

/** Los eventos del funnel. Lista cerrada: si no está acá, no se puede mandar. */
export type Evento =
  | 'landing_vista'
  | 'registro_completado'
  | 'medicion_iniciada'
  | 'medicion_terminada'
  | 'informe_visto'
  | 'kit_pedido'
  | 'perfil_leido'
  | 'radar_usado'
  | 'comparacion_hecha'
  | 'card_compartida'
  | 'coach_usado'
  | 'chat_analizado'
  | 'bio_generada'
  | 'foto_retocada'
  | 'limite_alcanzado';

interface PostHog {
  init: (key: string, opciones: Record<string, unknown>) => void;
  capture: (evento: string, props?: Props) => void;
  identify: (id: string) => void;
  reset: () => void;
}

let ph: PostHog | null = null;
let intentado = false;

async function cargar(): Promise<PostHog | null> {
  if (intentado) return ph;
  intentado = true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key === undefined || key === '' || typeof window === 'undefined') return null;

  try {
    const mod = await import('posthog-js');
    const cliente = mod.default as unknown as PostHog;
    cliente.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // El autocapture manda el texto de los elementos clickeados, y acá eso
      // incluiría fragmentos de bios y de chats. Solo eventos explícitos.
      autocapture: false,
      capture_pageview: false,
      // Sin grabaciones de sesión: literalmente sería filmar al usuario
      // subiendo fotos de terceros.
      disable_session_recording: true,
      persistence: 'localStorage',
    });
    ph = cliente;
  } catch {
    // Si el script no carga (bloqueador, red), la app sigue igual.
    ph = null;
  }
  return ph;
}

/** Registra un evento del funnel. Nunca falla hacia afuera. */
export function evento(nombre: Evento, props?: Props): void {
  void cargar().then((cliente) => cliente?.capture(nombre, props));
}

/** Asocia los eventos al usuario. Solo el id: nunca mail ni nombre. */
export function identificar(userId: string): void {
  void cargar().then((cliente) => cliente?.identify(userId));
}

/** Al cerrar sesión, para no mezclar dos usuarios en el mismo dispositivo. */
export function olvidar(): void {
  void cargar().then((cliente) => cliente?.reset());
}

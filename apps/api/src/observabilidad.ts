import * as Sentry from '@sentry/node';

/**
 * Reporte de errores.
 *
 * El problema que resuelve: hasta hoy, si a un usuario le fallaba algo, nadie se
 * enteraba. Los errores quedaban en el log de Render, que nadie mira, y el
 * usuario veía un mensaje genérico y se iba.
 *
 * Detrás de una interfaz para que los tests no necesiten Sentry y para que
 * cambiar de proveedor sea un archivo. Sin `SENTRY_DSN` no reporta nada y no
 * rompe nada, igual que el notificador de mail.
 */

export interface Contexto {
  ruta?: string;
  userId?: string;
  /** Qué estaba haciendo: 'auditoria', 'lectura de perfil', 'radar', etc. */
  operacion?: string;
}

export interface Reporter {
  capturar(error: unknown, contexto?: Contexto): void;
}

/** Sin DSN configurado: no reporta y no molesta. */
export class NoopReporter implements Reporter {
  capturar(): void {
    /* sin proveedor configurado */
  }
}

export class SentryReporter implements Reporter {
  constructor(config: { dsn: string; entorno: string; release?: string | undefined }) {
    Sentry.init({
      dsn: config.dsn,
      environment: config.entorno,
      ...(config.release !== undefined ? { release: config.release } : {}),
      // Sin trazas: lo que hace falta es saber QUÉ se rompe, no perfilar. El
      // performance monitoring multiplica el volumen y come el plan gratis.
      tracesSampleRate: 0,
      /**
       * Este producto maneja fotos de personas y conversaciones privadas. Nada
       * de eso puede terminar en un servicio de terceros por un error.
       */
      sendDefaultPii: false,
      beforeSend(evento) {
        // Los cuerpos de request llevan imágenes en base64 y texto de chats.
        if (evento.request) {
          delete evento.request.data;
          delete evento.request.cookies;
          if (evento.request.headers) {
            delete evento.request.headers.authorization;
            delete evento.request.headers.cookie;
          }
        }
        return evento;
      },
    });
  }

  capturar(error: unknown, contexto: Contexto = {}): void {
    Sentry.withScope((scope) => {
      // Solo el id, nunca mail ni nombre: alcanza para correlacionar y no
      // exporta identidad a un tercero.
      if (contexto.userId !== undefined) scope.setUser({ id: contexto.userId });
      if (contexto.ruta !== undefined) scope.setTag('ruta', contexto.ruta);
      if (contexto.operacion !== undefined) scope.setTag('operacion', contexto.operacion);
      Sentry.captureException(error);
    });
  }
}

export function construirReporter(config: {
  dsn: string | undefined;
  entorno: string;
  release?: string | undefined;
}): Reporter {
  if (config.dsn === undefined || config.dsn === '') return new NoopReporter();
  return new SentryReporter({ dsn: config.dsn, entorno: config.entorno, release: config.release });
}

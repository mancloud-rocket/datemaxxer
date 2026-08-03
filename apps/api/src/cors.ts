/**
 * Política de CORS.
 *
 * El default anterior era `true`: sin `CORS_ORIGINS` la API aceptaba cualquier
 * origen. Con auth por Bearer eso no permite robar sesiones (no hay cookies),
 * pero sí deja que cualquier sitio monte una interfaz encima de la API y la use
 * con el token de un usuario que le pasen. Y sobre todo: un default abierto es
 * un agujero que nadie nota hasta que aparece.
 *
 * Ahora el default es cerrado. Si falta la variable en producción, se cae a los
 * dominios propios conocidos y se loguea como error, en vez de abrir todo o
 * tumbar el deploy.
 */

/** Dominios propios. Fallback de emergencia, no reemplazo de la variable. */
const PROPIOS = [
  'https://datemaxxer-app.vercel.app',
  'https://datemaxxer.vercel.app',
];

/** En desarrollo hace falta localhost, en cualquier puerto. */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface PoliticaCors {
  /** Lo que se le pasa a @fastify/cors. */
  origin: (origen: string | undefined, cb: (err: Error | null, permitido: boolean) => void) => void;
  /** Para que el arranque pueda avisar si quedó con el fallback. */
  usandoFallback: boolean;
}

export function construirCors(params: {
  corsOrigins: string | undefined;
  produccion: boolean;
}): PoliticaCors {
  const declarados = (params.corsOrigins ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  const usandoFallback = declarados.length === 0 && params.produccion;
  const permitidos = declarados.length > 0 ? declarados : params.produccion ? PROPIOS : [];

  return {
    usandoFallback,
    origin(origen, cb) {
      // Sin Origin son requests que no vienen de un navegador (curl, la app
      // móvil, health checks). CORS no aplica: no hay nada que proteger ahí.
      if (origen === undefined) return cb(null, true);
      if (permitidos.includes(origen)) return cb(null, true);
      // En dev, cualquier localhost.
      if (!params.produccion && LOCAL.test(origen)) return cb(null, true);
      // Denegar es responder sin las cabeceras de CORS, no tirar 500: el
      // navegador bloquea y el log queda limpio.
      return cb(null, false);
    },
  };
}

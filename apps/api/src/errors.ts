/** Errores tipados de la API. El error handler los mapea a status + payload estable. */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthError extends AppError {
  constructor(message = 'No autenticado') {
    super('auth', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No autorizado') {
    super('forbidden', message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('validation', message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'No existe') {
    super('not_found', message, 404);
  }
}

/** Falla de un motor de IA (salida inválida tras retry, refusal, truncamiento). */
export class EngineError extends AppError {
  constructor(message: string) {
    super('engine', message, 502);
  }
}

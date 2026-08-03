import type {
  AccountProfile,
  AccountProfileUpdate,
  CuentaMe,
  Plan,
  Sku,
  SolicitudUpgrade,
} from '@percentil/contracts';
import type {
  AnalisisRechazado,
  AuditResult,
  BioResult,
  ChatTurnAnalysis,
  CompareResult,
  NuevaBio,
  ProfileRead,
  RadarRead,
} from '@percentil/contracts';

/** Cliente tipado de la API de Datemaxxer (contrato acordado en AGENTS-LOG, v2 con auth). */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type AuditStatus = 'analyzing' | 'done' | 'error';

export interface AuditProgress {
  fotos_analizadas: number;
  total: number;
}

export interface AuditView {
  audit_id: string;
  status: AuditStatus;
  progress: AuditProgress;
  created_at: string;
  result?: AuditResult;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!res.ok) {
    throw new ApiError(body.error ?? 'error', body.message ?? `HTTP ${res.status}`, res.status);
  }
  return body;
}

/** POST /audit: form con photos[] (File), bio, region, arquetipo_objetivo. */
export async function crearAuditoria(token: string, form: FormData): Promise<{ audit_id: string }> {
  return request('/audit', token, { method: 'POST', body: form });
}

export async function obtenerAuditoria(token: string, id: string): Promise<AuditView> {
  return request(`/audit/${id}`, token);
}

export async function miAuditoria(token: string): Promise<AuditView | null> {
  const { audit } = await request<{ audit: AuditView | null }>('/me/audit', token);
  return audit;
}

export async function misAuditorias(token: string): Promise<AuditView[]> {
  const { audits } = await request<{ audits: AuditView[] }>('/me/audits', token);
  return audits;
}

export async function obtenerPerfil(token: string): Promise<CuentaMe> {
  return request('/me', token);
}

export async function actualizarPerfil(token: string, patch: AccountProfileUpdate): Promise<AccountProfile> {
  return request('/me', token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/* --- F5: lectura de perfil ajeno --- */

export type ProfileReadStatus = 'analyzing' | 'done' | 'error' | 'rechazado';

export interface ProfileReadView {
  read_id: string;
  status: ProfileReadStatus;
  progress: { fotos_analizadas: number; total: number };
  created_at: string;
  result?: ProfileRead;
  rechazo?: AnalisisRechazado;
  error?: string;
}

/** POST /profile-read: form con photos[] (File), region, plataforma, verificada, bio. */
export async function leerPerfil(token: string, form: FormData): Promise<{ read_id: string }> {
  return request('/profile-read', token, { method: 'POST', body: form });
}

export async function obtenerLectura(token: string, id: string): Promise<ProfileReadView> {
  return request(`/profile-read/${id}`, token);
}

export async function misLecturas(token: string): Promise<ProfileReadView[]> {
  const { reads } = await request<{ reads: ProfileReadView[] }>('/me/profile-reads', token);
  return reads;
}

/* --- F3: bio --- */

export async function escribirBio(token: string, body: NuevaBio): Promise<BioResult> {
  return request('/bio', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* --- F4: copiloto de chat --- */

export interface ConversacionVista {
  id: string;
  label: string;
  platform: string | null;
  mensajes: number;
  ultimo_veredicto: string | null;
  feedback: string | null;
  created_at: string;
}

export interface ConversacionDetalle extends ConversacionVista {
  turnos: Array<{ id: string; created_at: string; analisis: ChatTurnAnalysis | null }>;
}

export async function crearConversacion(token: string, label: string): Promise<ConversacionVista> {
  return request('/conversations', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  });
}

export async function misConversaciones(token: string): Promise<ConversacionVista[]> {
  const { conversations } = await request<{ conversations: ConversacionVista[] }>('/conversations', token);
  return conversations;
}

export async function obtenerConversacion(token: string, id: string): Promise<ConversacionDetalle> {
  return request(`/conversations/${id}`, token);
}

export async function analizarTurno(
  token: string,
  id: string,
  form: FormData,
): Promise<ChatTurnAnalysis> {
  return request(`/conversations/${id}/snapshot`, token, { method: 'POST', body: form });
}

export async function mandarFeedback(
  token: string,
  id: string,
  resultado: string,
): Promise<void> {
  await request(`/conversations/${id}/feedback`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resultado }),
  });
}

/* --- Radar y Comparador --- */

/** Un rechazo del motor no es un error: es una respuesta con su propia pantalla. */
export type ConRechazo<T> = { ok: true; datos: T } | { ok: false; rechazo: AnalisisRechazado };

/**
 * POST con multipart que puede terminar en 422 + rechazo. Se trata aparte de
 * `request()` porque ahí un 422 sería una excepción, y acá es un camino normal.
 */
async function postConRechazo<T>(path: string, token: string, form: FormData): Promise<ConRechazo<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T & AnalisisRechazado;
  if (res.status === 422 && body.rechazado === true) {
    return { ok: false, rechazo: body };
  }
  if (!res.ok) {
    throw new ApiError(body.error ?? 'error', body.message ?? `HTTP ${res.status}`, res.status);
  }
  return { ok: true, datos: body };
}

export async function dispararRadar(token: string, form: FormData): Promise<ConRechazo<RadarRead>> {
  return postConRechazo<RadarRead>('/radar', token, form);
}

export async function compararPerfiles(
  token: string,
  form: FormData,
): Promise<ConRechazo<CompareResult>> {
  return postConRechazo<CompareResult>('/compare', token, form);
}

/* --- Coach de confianza --- */

export interface MensajeCoach {
  id: string;
  rol: 'user' | 'coach';
  texto: string;
  created_at: string;
}

export async function estadoCoach(
  token: string,
): Promise<{ mensajes: MensajeCoach[]; restantes: number | null }> {
  return request('/coach', token);
}

/**
 * Manda un mensaje y va llamando a `onPedazo` con el texto que llega.
 * No usa EventSource porque eso solo hace GET y acá hace falta POST con body.
 */
export async function enviarAlCoach(
  token: string,
  texto: string,
  onPedazo: (t: string) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/coach/mensaje`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ texto }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(body.error ?? 'error', body.message ?? `HTTP ${res.status}`, res.status);
  }
  if (res.body === null) throw new ApiError('stream', 'Respuesta sin cuerpo', 502);

  const lector = res.body.getReader();
  const decoder = new TextDecoder();
  // Un evento SSE puede llegar partido entre dos chunks de red: lo que sobra
  // después del último \n\n se guarda para pegarlo al chunk siguiente.
  let resto = '';

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += decoder.decode(value, { stream: true });
    const partes = resto.split('\n\n');
    resto = partes.pop() ?? '';
    for (const parte of partes) {
      const linea = parte.split('\n').find((l) => l.startsWith('data: '));
      if (linea === undefined) continue;
      const evento = JSON.parse(linea.slice(6)) as { t?: string; fin?: boolean; error?: string };
      if (evento.error !== undefined) throw new ApiError('stream', evento.error, 502);
      if (evento.t !== undefined) onPedazo(evento.t);
    }
  }
}

/* --- Pedir plan (el cobro todavía es a mano: link de pago + activación) --- */

export async function pedirPlan(
  token: string,
  sku: Sku,
  mensaje?: string,
): Promise<SolicitudUpgrade> {
  return request('/me/upgrade', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mensaje !== undefined && mensaje !== '' ? { sku, mensaje } : { sku }),
  });
}

export async function misSolicitudes(token: string): Promise<SolicitudUpgrade[]> {
  const { solicitudes } = await request<{ solicitudes: SolicitudUpgrade[] }>('/me/upgrade', token);
  return solicitudes;
}

/* --- Admin --- */

export interface SolicitudAdmin extends SolicitudUpgrade {
  userId: string;
  email: string | null;
}

export interface UsuarioAdmin {
  id: string;
  email: string | null;
  creado: string;
  ultimoAcceso: string | null;
  plan: Plan;
  auditorias: number;
}

export async function solicitudesPendientes(token: string): Promise<SolicitudAdmin[]> {
  const { solicitudes } = await request<{ solicitudes: SolicitudAdmin[] }>(
    '/admin/solicitudes',
    token,
  );
  return solicitudes;
}

export async function listarUsuarios(token: string): Promise<UsuarioAdmin[]> {
  const { usuarios } = await request<{ usuarios: UsuarioAdmin[] }>('/admin/usuarios', token);
  return usuarios;
}

export async function cambiarPlan(
  token: string,
  userId: string,
  plan: Plan,
  solicitudId?: string,
): Promise<AccountProfile> {
  return request(`/admin/usuarios/${userId}/plan`, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(solicitudId !== undefined ? { plan, solicitudId } : { plan }),
  });
}

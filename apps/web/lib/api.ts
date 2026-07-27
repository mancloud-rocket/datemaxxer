import type {
  AccountProfile,
  AccountProfileUpdate,
  CuentaMe,
  Plan,
  Sku,
  SolicitudUpgrade,
} from '@percentil/contracts';
import type { AuditResult } from '@percentil/contracts';

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

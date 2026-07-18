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

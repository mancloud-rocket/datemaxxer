import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuditResult, Region } from '@percentil/contracts';
import { AppError } from '../errors.js';
import type { AuditProgress } from '../engines/audit.js';
import type { AuditRecord, AuditStatus, AuditStore } from './store.js';

/**
 * Persistencia real contra percentil.free_audits (service role, bypassa RLS).
 * Requiere el schema `percentil` expuesto en Dashboard → Settings → API → Exposed schemas.
 */

interface FreeAuditRow {
  id: string;
  email: string;
  region: Region;
  status: AuditStatus;
  progress: AuditProgress;
  result: AuditResult | null;
  error: string | null;
  created_at: string;
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

export class SupabaseAuditStore implements AuditStore {
  // eslint apagado no aplica: los generics del client llevan el schema custom
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async create(record: AuditRecord): Promise<void> {
    const { error } = await this.db.from('free_audits').insert({
      id: record.id,
      email: record.email,
      region: record.region,
      status: record.status,
      progress: record.progress,
      result: record.result ?? null,
      error: record.error ?? null,
      created_at: record.createdAt.toISOString(),
    });
    if (error) throw storeError('insert', error.message);
  }

  async get(id: string): Promise<AuditRecord | undefined> {
    const { data, error } = await this.db
      .from('free_audits')
      .select('*')
      .eq('id', id)
      .maybeSingle<FreeAuditRow>();
    if (error) throw storeError('select', error.message);
    if (!data) return undefined;
    return {
      id: data.id,
      email: data.email,
      region: data.region,
      status: data.status,
      progress: data.progress,
      ...(data.result !== null ? { result: data.result } : {}),
      ...(data.error !== null ? { error: data.error } : {}),
      createdAt: new Date(data.created_at),
    };
  }

  async update(id: string, patch: Partial<Omit<AuditRecord, 'id'>>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.progress !== undefined) row.progress = patch.progress;
    if (patch.result !== undefined) row.result = patch.result;
    if (patch.error !== undefined) row.error = patch.error;
    if (Object.keys(row).length === 0) return;
    const { error } = await this.db.from('free_audits').update(row).eq('id', id);
    if (error) throw storeError('update', error.message);
  }
}

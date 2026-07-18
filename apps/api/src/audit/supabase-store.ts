import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuditResult, Region } from '@percentil/contracts';
import { AppError } from '../errors.js';
import type { AuditProgress } from '../engines/audit.js';
import type { AuditRecord, AuditStatus, AuditStore } from './store.js';

/**
 * Persistencia real contra percentil.photo_sets (tablas canónicas spec §5) con
 * upsert de percentil.profiles (region). Service role: bypassa RLS.
 * Requiere el schema `percentil` expuesto en Dashboard → Settings → API.
 */

interface PhotoSetRow {
  id: string;
  user_id: string;
  status: AuditStatus | 'uploaded';
  audit_result: AuditResult | null;
  progress: AuditProgress;
  error: string | null;
  created_at: string;
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

function toRecord(row: PhotoSetRow, region: Region): AuditRecord {
  return {
    id: row.id,
    userId: row.user_id,
    region,
    status: row.status === 'uploaded' ? 'analyzing' : row.status,
    progress: row.progress,
    ...(row.audit_result !== null ? { result: row.audit_result } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseAuditStore implements AuditStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async create(record: AuditRecord): Promise<void> {
    // El perfil primero (FK) y de paso persiste la región elegida
    const { error: profileError } = await this.db
      .from('profiles')
      .upsert({ id: record.userId, region: record.region });
    if (profileError) throw storeError('upsert profiles', profileError.message);

    const { error } = await this.db.from('photo_sets').insert({
      id: record.id,
      user_id: record.userId,
      status: record.status,
      audit_result: record.result ?? null,
      progress: record.progress,
      error: record.error ?? null,
      created_at: record.createdAt.toISOString(),
    });
    if (error) throw storeError('insert photo_sets', error.message);
  }

  async get(id: string): Promise<AuditRecord | undefined> {
    const { data, error } = await this.db
      .from('photo_sets')
      .select('*, profiles(region)')
      .eq('id', id)
      .maybeSingle<PhotoSetRow & { profiles: { region: Region } | null }>();
    if (error) throw storeError('select photo_sets', error.message);
    if (!data) return undefined;
    return toRecord(data, data.profiles?.region ?? 'neutro');
  }

  async update(id: string, patch: Partial<Omit<AuditRecord, 'id' | 'userId'>>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.progress !== undefined) row.progress = patch.progress;
    if (patch.result !== undefined) row.audit_result = patch.result;
    if (patch.error !== undefined) row.error = patch.error;
    if (Object.keys(row).length === 0) return;
    const { error } = await this.db.from('photo_sets').update(row).eq('id', id);
    if (error) throw storeError('update photo_sets', error.message);
  }

  async countForUser(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('photo_sets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'error');
    if (error) throw storeError('count photo_sets', error.message);
    return count ?? 0;
  }

  async latestForUser(userId: string): Promise<AuditRecord | undefined> {
    const { data, error } = await this.db
      .from('photo_sets')
      .select('*, profiles(region)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<PhotoSetRow & { profiles: { region: Region } | null }>();
    if (error) throw storeError('select latest', error.message);
    if (!data) return undefined;
    return toRecord(data, data.profiles?.region ?? 'neutro');
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnalisisRechazado, ProfileRead } from '@percentil/contracts';
import { AppError } from '../errors.js';
import type { ProfileReadProgress } from '../engines/profileread.js';

/**
 * Persistencia de lecturas de perfil ajeno (F5) en percentil.profile_reads.
 *
 * `rechazado` es un estado terminal propio y NO un error: el motor decidió no
 * puntuar. No se reintenta y no quema cupo, igual que las fallidas.
 */

export type ProfileReadStatus = 'analyzing' | 'done' | 'error' | 'rechazado';

/** Auditorías huérfanas de un reinicio (deploy, sleep del plan free, OOM). */
export const STALE_ERROR = 'La lectura se interrumpió. Probá de nuevo, no gastaste cupo.';

export interface ProfileReadRecord {
  id: string;
  userId: string;
  status: ProfileReadStatus;
  progress: ProfileReadProgress;
  result?: ProfileRead;
  rechazo?: AnalisisRechazado;
  error?: string;
  createdAt: Date;
}

export interface ProfileReadQuota {
  limite: number;
  sinLimite: boolean;
  /** 0 = cupo de por vida; 30 = mensual corredizo. */
  ventanaDias: number;
}

/** La función de cupo no existe en esta base todavía. */
export class QuotaRpcMissingError extends Error {
  constructor() {
    super('percentil.crear_profile_read_con_cupo no existe en esta base');
    this.name = 'QuotaRpcMissingError';
  }
}

export interface ProfileReadStore {
  /** Crea SOLO si hay cupo, de forma atómica. false = cupo agotado. */
  createWithQuota(record: ProfileReadRecord, quota: ProfileReadQuota): Promise<boolean>;
  get(id: string): Promise<ProfileReadRecord | undefined>;
  update(id: string, patch: Partial<Omit<ProfileReadRecord, 'id' | 'userId'>>): Promise<void>;
  listForUser(userId: string): Promise<ProfileReadRecord[]>;
  /** Cosecha las que quedaron colgadas: dejan de consumir cupo. */
  failStale(maxAgeMs: number): Promise<number>;
}

export class InMemoryProfileReadStore implements ProfileReadStore {
  readonly records = new Map<string, ProfileReadRecord>();

  async createWithQuota(record: ProfileReadRecord, quota: ProfileReadQuota): Promise<boolean> {
    if (!quota.sinLimite) {
      const corte = quota.ventanaDias > 0 ? Date.now() - quota.ventanaDias * 86_400_000 : 0;
      const usadas = [...this.records.values()].filter(
        (r) =>
          r.userId === record.userId &&
          (r.status === 'analyzing' || r.status === 'done') &&
          r.createdAt.getTime() > corte,
      ).length;
      if (usadas >= quota.limite) return false;
    }
    this.records.set(record.id, record);
    return true;
  }

  async get(id: string): Promise<ProfileReadRecord | undefined> {
    return this.records.get(id);
  }

  async update(id: string, patch: Partial<Omit<ProfileReadRecord, 'id' | 'userId'>>): Promise<void> {
    const actual = this.records.get(id);
    if (actual) this.records.set(id, { ...actual, ...patch });
  }

  async listForUser(userId: string): Promise<ProfileReadRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async failStale(maxAgeMs: number): Promise<number> {
    const corte = Date.now() - maxAgeMs;
    let n = 0;
    for (const r of this.records.values()) {
      if (r.status === 'analyzing' && r.createdAt.getTime() < corte) {
        this.records.set(r.id, { ...r, status: 'error', error: STALE_ERROR });
        n += 1;
      }
    }
    return n;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

interface Fila {
  id: string;
  user_id: string;
  status: ProfileReadStatus;
  progress: ProfileReadProgress;
  result: ProfileRead | null;
  rechazo: AnalisisRechazado | null;
  error: string | null;
  created_at: string;
}

const aRecord = (f: Fila): ProfileReadRecord => ({
  id: f.id,
  userId: f.user_id,
  status: f.status,
  progress: f.progress,
  ...(f.result !== null ? { result: f.result } : {}),
  ...(f.rechazo !== null ? { rechazo: f.rechazo } : {}),
  ...(f.error !== null ? { error: f.error } : {}),
  createdAt: new Date(f.created_at),
});

const COLUMNAS = 'id, user_id, status, progress, result, rechazo, error, created_at';

export class SupabaseProfileReadStore implements ProfileReadStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createWithQuota(record: ProfileReadRecord, quota: ProfileReadQuota): Promise<boolean> {
    // El perfil primero: la FK lo exige y la función lockea esa fila.
    const { error: perfilError } = await this.db
      .from('profiles')
      .upsert({ id: record.userId }, { ignoreDuplicates: true });
    if (perfilError) throw storeError('upsert profiles', perfilError.message);

    const { data, error } = await this.db.rpc('crear_profile_read_con_cupo', {
      p_id: record.id,
      p_user_id: record.userId,
      p_limite: quota.limite,
      p_sin_limite: quota.sinLimite,
      p_ventana_dias: quota.ventanaDias,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new QuotaRpcMissingError();
      throw storeError('rpc crear_profile_read_con_cupo', error.message);
    }
    return data === true;
  }

  async get(id: string): Promise<ProfileReadRecord | undefined> {
    const { data, error } = await this.db
      .from('profile_reads')
      .select(COLUMNAS)
      .eq('id', id)
      .maybeSingle<Fila>();
    if (error) throw storeError('select profile_read', error.message);
    return data ? aRecord(data) : undefined;
  }

  async update(id: string, patch: Partial<Omit<ProfileReadRecord, 'id' | 'userId'>>): Promise<void> {
    const fila: Record<string, unknown> = {};
    if (patch.status !== undefined) fila.status = patch.status;
    if (patch.progress !== undefined) fila.progress = patch.progress;
    if (patch.result !== undefined) fila.result = patch.result;
    if (patch.rechazo !== undefined) fila.rechazo = patch.rechazo;
    if (patch.error !== undefined) fila.error = patch.error;
    const { error } = await this.db.from('profile_reads').update(fila).eq('id', id);
    if (error) throw storeError('update profile_read', error.message);
  }

  async listForUser(userId: string): Promise<ProfileReadRecord[]> {
    const { data, error } = await this.db
      .from('profile_reads')
      .select(COLUMNAS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<Fila[]>();
    if (error) throw storeError('select profile_reads', error.message);
    return (data ?? []).map(aRecord);
  }

  async failStale(maxAgeMs: number): Promise<number> {
    const corte = new Date(Date.now() - maxAgeMs).toISOString();
    const { data, error } = await this.db
      .from('profile_reads')
      .update({ status: 'error', error: STALE_ERROR })
      .eq('status', 'analyzing')
      .lt('created_at', corte)
      .select('id')
      .returns<Array<{ id: string }>>();
    if (error) throw storeError('cosecha de profile_reads', error.message);
    return (data ?? []).length;
  }
}

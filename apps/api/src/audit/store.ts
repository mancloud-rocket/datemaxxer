import type { AuditResult, Region } from '@percentil/contracts';
import type { AuditProgress } from '../engines/audit.js';

/**
 * Persistencia de auditorías POR USUARIO (la auditoría vive dentro de la app con login).
 * InMemoryAuditStore para tests/dev; SupabaseAuditStore contra percentil.photo_sets
 * (+ upsert de percentil.profiles). Las rutas no distinguen implementación.
 */

export type AuditStatus = 'analyzing' | 'done' | 'error';

export interface AuditRecord {
  id: string;
  userId: string;
  /** Registro regional del usuario; en Supabase persiste en profiles.region. */
  region: Region;
  status: AuditStatus;
  progress: AuditProgress;
  result?: AuditResult;
  error?: string;
  createdAt: Date;
}

export interface AuditStore {
  create(record: AuditRecord): Promise<void>;
  get(id: string): Promise<AuditRecord | undefined>;
  update(id: string, patch: Partial<Omit<AuditRecord, 'id' | 'userId'>>): Promise<void>;
  /** Auditorías que consumen cupo (analyzing|done; las fallidas no queman el gratis). */
  countForUser(userId: string): Promise<number>;
  latestForUser(userId: string): Promise<AuditRecord | undefined>;
  /** Historial completo, más reciente primero (para "mis auditorías"). */
  listForUser(userId: string): Promise<AuditRecord[]>;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records = new Map<string, AuditRecord>();

  async create(record: AuditRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<AuditRecord | undefined> {
    return this.records.get(id);
  }

  async update(id: string, patch: Partial<Omit<AuditRecord, 'id' | 'userId'>>): Promise<void> {
    const current = this.records.get(id);
    if (current) this.records.set(id, { ...current, ...patch });
  }

  async countForUser(userId: string): Promise<number> {
    let n = 0;
    for (const r of this.records.values()) {
      if (r.userId === userId && r.status !== 'error') n++;
    }
    return n;
  }

  async latestForUser(userId: string): Promise<AuditRecord | undefined> {
    let latest: AuditRecord | undefined;
    for (const r of this.records.values()) {
      if (r.userId === userId && (!latest || r.createdAt > latest.createdAt)) latest = r;
    }
    return latest;
  }

  async listForUser(userId: string): Promise<AuditRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

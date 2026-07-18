import type { AuditResult, Region } from '@percentil/contracts';
import type { AuditProgress } from '../engines/audit.js';

/**
 * Persistencia de auditorías del funnel gratuito detrás de interfaz:
 * InMemoryAuditStore para tests/dev, SupabaseAuditStore (percentil.free_audits)
 * en cuanto hay proyecto configurado. Las rutas no distinguen.
 */

export type AuditStatus = 'analyzing' | 'done' | 'error';

export interface AuditRecord {
  id: string;
  email: string;
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
  update(id: string, patch: Partial<Omit<AuditRecord, 'id'>>): Promise<void>;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records = new Map<string, AuditRecord>();

  async create(record: AuditRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<AuditRecord | undefined> {
    return this.records.get(id);
  }

  async update(id: string, patch: Partial<Omit<AuditRecord, 'id'>>): Promise<void> {
    const current = this.records.get(id);
    if (current) this.records.set(id, { ...current, ...patch });
  }
}

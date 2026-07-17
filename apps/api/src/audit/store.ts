import type { AuditResult, Region } from '@percentil/contracts';
import type { AuditProgress } from '../engines/audit.js';

/**
 * Persistencia de auditorías detrás de interfaz: hoy memoria, en cuanto exista
 * el proyecto Supabase se implementa contra percentil.photo_sets sin tocar rutas.
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
  create(record: AuditRecord): void;
  get(id: string): AuditRecord | undefined;
  update(id: string, patch: Partial<Omit<AuditRecord, 'id'>>): void;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records = new Map<string, AuditRecord>();

  create(record: AuditRecord): void {
    this.records.set(record.id, record);
  }

  get(id: string): AuditRecord | undefined {
    return this.records.get(id);
  }

  update(id: string, patch: Partial<Omit<AuditRecord, 'id'>>): void {
    const current = this.records.get(id);
    if (current) this.records.set(id, { ...current, ...patch });
  }
}

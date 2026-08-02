import type { AuditResult, IndiceAtractivo, Region } from '@percentil/contracts';
import type { AuditProgress } from '../engines/audit.js';

/**
 * Persistencia de auditorías POR USUARIO (la auditoría vive dentro de la app con login).
 * InMemoryAuditStore para tests/dev; SupabaseAuditStore contra percentil.photo_sets
 * (+ upsert de percentil.profiles). Las rutas no distinguen implementación.
 */

export type AuditStatus = 'analyzing' | 'done' | 'error';

/** Mensaje de las auditorías cosechadas por quedar huérfanas de un reinicio. */
export const STALE_ERROR =
  'El análisis se interrumpió de nuestro lado. Tu cupo quedó intacto: probá de nuevo.';

/**
 * La función de cupo atómico todavía no existe en esta base (migración
 * `20260720120001_cupo_atomico.sql` sin aplicar). Permite que el deploy del código
 * no dependa del orden de la migración: la ruta cae al camino viejo y lo loguea
 * fuerte, en vez de romper todas las auditorías con un 500.
 */
export class QuotaRpcMissingError extends Error {
  constructor() {
    super('Falta la migración del cupo atómico (crear_auditoria_con_cupo)');
    this.name = 'QuotaRpcMissingError';
  }
}

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

export interface AuditQuota {
  freeLimit: number;
  /** plan pago: se salta el cupo por completo. */
  unlimited: boolean;
}

export interface AuditStore {
  create(record: AuditRecord): Promise<void>;
  /**
   * Crea la auditoría SOLO si hay cupo, de forma atómica (conteo + insert en la
   * misma transacción). Devuelve false si el cupo está agotado.
   * Sin esto dos requests concurrentes del mismo usuario consumen dos veces el
   * cupo gratis: el chequeo previo en la ruta es fail-fast, la garantía es esta.
   */
  createWithQuota(record: AuditRecord, quota: AuditQuota): Promise<boolean>;
  get(id: string): Promise<AuditRecord | undefined>;
  update(id: string, patch: Partial<Omit<AuditRecord, 'id' | 'userId'>>): Promise<void>;
  /** Auditorías que consumen cupo (analyzing|done; las fallidas no queman el gratis). */
  countForUser(userId: string): Promise<number>;
  latestForUser(userId: string): Promise<AuditRecord | undefined>;
  /**
   * Índice de atractivo vigente del usuario (F1b): el de la última auditoría
   * TERMINADA que lo tenga.
   *
   * Existe aparte de `latestForUser` porque esa devuelve la más nueva sea cual
   * sea su estado: mientras corre una auditoría nueva, el índice del usuario
   * desaparecería y el `gap` de F5, el Radar y el Comparador entregarían null
   * justo mientras el tipo está usando la app.
   */
  latestIndiceForUser(userId: string): Promise<IndiceAtractivo | null>;
  /** Historial completo, más reciente primero (para "mis auditorías"). */
  listForUser(userId: string): Promise<AuditRecord[]>;
  /**
   * Cosecha auditorías que quedaron "analizando" más de `maxAgeMs`: las marca
   * error para que dejen de consumir cupo y el usuario pueda reintentar.
   * Pasa cuando el proceso muere a mitad (deploy, sleep del plan free, OOM).
   * Devuelve cuántas cosechó.
   */
  failStale(maxAgeMs: number): Promise<number>;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly records = new Map<string, AuditRecord>();

  async create(record: AuditRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async createWithQuota(record: AuditRecord, quota: AuditQuota): Promise<boolean> {
    // JS es single-threaded y acá no hay await entre el conteo y el insert:
    // esta secuencia ya es atómica en proceso.
    if (!quota.unlimited) {
      let usadas = 0;
      for (const r of this.records.values()) {
        if (r.userId === record.userId && r.status !== 'error') usadas++;
      }
      if (usadas >= quota.freeLimit) return false;
    }
    this.records.set(record.id, record);
    return true;
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

  async latestIndiceForUser(userId: string): Promise<IndiceAtractivo | null> {
    let mejor: AuditRecord | undefined;
    for (const r of this.records.values()) {
      if (r.userId !== userId || r.status !== 'done' || !r.result?.indice) continue;
      if (!mejor || r.createdAt > mejor.createdAt) mejor = r;
    }
    return mejor?.result?.indice ?? null;
  }

  async listForUser(userId: string): Promise<AuditRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async failStale(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let n = 0;
    for (const [id, r] of this.records) {
      if (r.status === 'analyzing' && r.createdAt.getTime() < cutoff) {
        this.records.set(id, { ...r, status: 'error', error: STALE_ERROR });
        n++;
      }
    }
    return n;
  }
}

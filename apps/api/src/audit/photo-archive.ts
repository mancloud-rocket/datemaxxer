import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuditPhotoMediaType } from '../engines/audit.js';

/**
 * Guarda las fotos originales de una auditoría.
 *
 * Por qué existe: hasta ahora las fotos se mandaban al modelo y se descartaban.
 * Eso hacía imposible el estudio de fotos (F2, lo que justifica el Kit) sin
 * volver a pedírselas al usuario, impedía mostrar cada foto al lado de su lectura
 * en el informe, y obligaba a resubir todo para rehacer un análisis.
 *
 * Se archiva en paralelo al análisis y los errores NO tumban la auditoría: si el
 * storage falla, el usuario igual recibe su informe.
 */

export interface PhotoToArchive {
  buffer: Buffer;
  mediaType: AuditPhotoMediaType;
}

export interface PhotoArchive {
  save(params: { auditId: string; userId: string; photos: PhotoToArchive[] }): Promise<void>;
}

/** Sin Supabase configurado (tests, dev local) no se archiva nada. */
export class NoopPhotoArchive implements PhotoArchive {
  async save(): Promise<void> {
    /* no-op */
  }
}

const BUCKET = 'percentil-originals';

const EXTENSIONES: Record<AuditPhotoMediaType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class SupabasePhotoArchive implements PhotoArchive {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;
  private readonly storage: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    this.db = createClient(url, serviceRoleKey, { ...opts, db: { schema: 'percentil' } });
    // El storage no vive en un schema de Postgres: cliente aparte, sin `db.schema`.
    this.storage = createClient(url, serviceRoleKey, opts);
  }

  async save({
    auditId,
    userId,
    photos,
  }: {
    auditId: string;
    userId: string;
    photos: PhotoToArchive[];
  }): Promise<void> {
    // Convención de path {user_id}/... : es lo que esperan las policies de storage
    // para cuando el cliente lea sus propias fotos directo.
    const subidas = await Promise.all(
      photos.map(async (photo, i) => {
        const path = `${userId}/${auditId}/${i + 1}.${EXTENSIONES[photo.mediaType]}`;
        const { error } = await this.storage.storage
          .from(BUCKET)
          .upload(path, photo.buffer, { contentType: photo.mediaType, upsert: true });
        if (error) throw new Error(`upload ${path}: ${error.message}`);
        return { set_id: auditId, storage_path: path, position: i + 1 };
      }),
    );

    const { error } = await this.db.from('photos').insert(subidas);
    if (error) throw new Error(`insert photos: ${error.message}`);
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EstadoSolicitud, Sku } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Solicitudes de plan pago mientras el cobro es manual.
 * Una sola pendiente por usuario y producto: el botón se puede tocar mil veces
 * y no genera mil pedidos ni mil mails (índice único parcial en base).
 */

export interface Solicitud {
  id: string;
  userId: string;
  sku: Sku;
  estado: EstadoSolicitud;
  mensaje: string | null;
  email: string | null;
  createdAt: Date;
}

export interface UpgradeStore {
  /** Crea la solicitud, o devuelve la pendiente que ya existía. */
  crear(params: {
    userId: string;
    sku: Sku;
    mensaje: string | null;
    email: string | null;
  }): Promise<{ solicitud: Solicitud; yaExistia: boolean }>;
  pendientes(): Promise<Solicitud[]>;
  deUsuario(userId: string): Promise<Solicitud[]>;
  resolver(id: string, estado: EstadoSolicitud, adminId: string): Promise<void>;
}

export class InMemoryUpgradeStore implements UpgradeStore {
  readonly filas: Solicitud[] = [];
  private n = 0;

  async crear(p: {
    userId: string;
    sku: Sku;
    mensaje: string | null;
    email: string | null;
  }): Promise<{ solicitud: Solicitud; yaExistia: boolean }> {
    const previa = this.filas.find(
      (s) => s.userId === p.userId && s.sku === p.sku && s.estado === 'pendiente',
    );
    if (previa) return { solicitud: previa, yaExistia: true };
    const solicitud: Solicitud = {
      id: `sol_${++this.n}`,
      userId: p.userId,
      sku: p.sku,
      estado: 'pendiente',
      mensaje: p.mensaje,
      email: p.email,
      createdAt: new Date(),
    };
    this.filas.push(solicitud);
    return { solicitud, yaExistia: false };
  }

  async pendientes(): Promise<Solicitud[]> {
    return this.filas
      .filter((s) => s.estado === 'pendiente')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deUsuario(userId: string): Promise<Solicitud[]> {
    return this.filas.filter((s) => s.userId === userId);
  }

  async resolver(id: string, estado: EstadoSolicitud): Promise<void> {
    const s = this.filas.find((f) => f.id === id);
    if (s) s.estado = estado;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

interface Fila {
  id: string;
  user_id: string;
  sku: Sku;
  estado: EstadoSolicitud;
  mensaje: string | null;
  email: string | null;
  created_at: string;
}

const aSolicitud = (f: Fila): Solicitud => ({
  id: f.id,
  userId: f.user_id,
  sku: f.sku,
  estado: f.estado,
  mensaje: f.mensaje,
  email: f.email,
  createdAt: new Date(f.created_at),
});

export class SupabaseUpgradeStore implements UpgradeStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async crear(p: {
    userId: string;
    sku: Sku;
    mensaje: string | null;
    email: string | null;
  }): Promise<{ solicitud: Solicitud; yaExistia: boolean }> {
    // El perfil tiene que existir por la FK (puede pedir el Kit sin haber
    // hecho nunca una auditoría).
    const { error: perfilError } = await this.db
      .from('profiles')
      .upsert({ id: p.userId }, { ignoreDuplicates: true });
    if (perfilError) throw storeError('upsert profiles', perfilError.message);

    const { data, error } = await this.db
      .from('solicitudes_upgrade')
      .insert({ user_id: p.userId, sku: p.sku, mensaje: p.mensaje, email: p.email })
      .select('*')
      .single<Fila>();

    if (error) {
      // 23505 = violación del índice único parcial: ya tenía una pendiente.
      if (error.code === '23505') {
        const { data: previa, error: e2 } = await this.db
          .from('solicitudes_upgrade')
          .select('*')
          .eq('user_id', p.userId)
          .eq('sku', p.sku)
          .eq('estado', 'pendiente')
          .single<Fila>();
        if (e2) throw storeError('select solicitud previa', e2.message);
        return { solicitud: aSolicitud(previa), yaExistia: true };
      }
      throw storeError('insert solicitudes_upgrade', error.message);
    }
    return { solicitud: aSolicitud(data), yaExistia: false };
  }

  async pendientes(): Promise<Solicitud[]> {
    const { data, error } = await this.db
      .from('solicitudes_upgrade')
      .select('*')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })
      .returns<Fila[]>();
    if (error) throw storeError('select pendientes', error.message);
    return (data ?? []).map(aSolicitud);
  }

  async deUsuario(userId: string): Promise<Solicitud[]> {
    const { data, error } = await this.db
      .from('solicitudes_upgrade')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<Fila[]>();
    if (error) throw storeError('select solicitudes usuario', error.message);
    return (data ?? []).map(aSolicitud);
  }

  async resolver(id: string, estado: EstadoSolicitud, adminId: string): Promise<void> {
    const { error } = await this.db
      .from('solicitudes_upgrade')
      .update({ estado, resuelta_at: new Date().toISOString(), resuelta_por: adminId })
      .eq('id', id);
    if (error) throw storeError('update solicitud', error.message);
  }
}

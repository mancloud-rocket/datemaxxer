import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Plan } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Vista de usuarios para el panel de admin: cruza auth.users (identidad, solo
 * accesible con service role) con percentil.profiles (plan) y cuenta auditorías.
 *
 * Es un ABM chico a propósito: a esta escala una sola página de usuarios alcanza
 * y no justifica paginación ni índices nuevos.
 */

export interface UsuarioAdmin {
  id: string;
  email: string | null;
  creado: string;
  ultimoAcceso: string | null;
  plan: Plan;
  auditorias: number;
}

export interface AdminStore {
  listarUsuarios(limite: number): Promise<UsuarioAdmin[]>;
  contarAuditorias(userId: string): Promise<number>;
}

export class InMemoryAdminStore implements AdminStore {
  constructor(readonly usuarios: UsuarioAdmin[] = []) {}
  async listarUsuarios(limite: number): Promise<UsuarioAdmin[]> {
    return this.usuarios.slice(0, limite);
  }
  async contarAuditorias(userId: string): Promise<number> {
    return this.usuarios.find((u) => u.id === userId)?.auditorias ?? 0;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

export class SupabaseAdminStore implements AdminStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listarUsuarios(limite: number): Promise<UsuarioAdmin[]> {
    const { data, error } = await this.db.auth.admin.listUsers({ page: 1, perPage: limite });
    if (error) throw storeError('listUsers', error.message);

    const ids = data.users.map((u) => u.id);
    if (ids.length === 0) return [];

    const [planes, conteos] = await Promise.all([
      this.planesDe(ids),
      this.auditoriasDe(ids),
    ]);

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      creado: u.created_at,
      ultimoAcceso: u.last_sign_in_at ?? null,
      plan: planes.get(u.id) ?? 'free',
      auditorias: conteos.get(u.id) ?? 0,
    }));
  }

  async contarAuditorias(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('photo_sets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw storeError('count photo_sets', error.message);
    return count ?? 0;
  }

  private async planesDe(ids: string[]): Promise<Map<string, Plan>> {
    const { data, error } = await this.db
      .from('profiles')
      .select('id, plan')
      .in('id', ids)
      .returns<{ id: string; plan: Plan }[]>();
    if (error) throw storeError('select profiles (admin)', error.message);
    return new Map((data ?? []).map((r) => [r.id, r.plan]));
  }

  private async auditoriasDe(ids: string[]): Promise<Map<string, number>> {
    const { data, error } = await this.db
      .from('photo_sets')
      .select('user_id')
      .in('user_id', ids)
      .returns<{ user_id: string }[]>();
    if (error) throw storeError('select photo_sets (admin)', error.message);
    const conteo = new Map<string, number>();
    for (const { user_id } of data ?? []) {
      conteo.set(user_id, (conteo.get(user_id) ?? 0) + 1);
    }
    return conteo;
  }
}

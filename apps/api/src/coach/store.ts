import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RolCoach } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Conversación con el coach. Una sola por usuario, continua en el tiempo: cuando
 * vuelve a los tres días, la charla sigue donde la dejó.
 *
 * `ultimos()` devuelve en orden cronológico (viejo → nuevo) porque así lo quiere
 * tanto la UI como la ventana de contexto del modelo. La query pide desc por
 * índice y se invierte acá.
 */

export interface MensajeGuardado {
  id: string;
  rol: RolCoach;
  texto: string;
  createdAt: Date;
}

export interface CoachStore {
  /** Los últimos `limite` mensajes, del más viejo al más nuevo. */
  ultimos(userId: string, limite: number): Promise<MensajeGuardado[]>;
  guardar(userId: string, rol: RolCoach, texto: string): Promise<MensajeGuardado>;
  /** Cuántos mensajes mandó el usuario (no cuenta los del coach). */
  contarDelUsuario(userId: string): Promise<number>;
}

export class InMemoryCoachStore implements CoachStore {
  readonly filas: Array<MensajeGuardado & { userId: string }> = [];
  private n = 0;

  async ultimos(userId: string, limite: number): Promise<MensajeGuardado[]> {
    return this.filas.filter((m) => m.userId === userId).slice(-limite);
  }

  async guardar(userId: string, rol: RolCoach, texto: string): Promise<MensajeGuardado> {
    const fila = { id: `m${++this.n}`, userId, rol, texto, createdAt: new Date() };
    this.filas.push(fila);
    return fila;
  }

  async contarDelUsuario(userId: string): Promise<number> {
    return this.filas.filter((m) => m.userId === userId && m.rol === 'user').length;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

interface Fila {
  id: string;
  rol: RolCoach;
  texto: string;
  created_at: string;
}

const aMensaje = (f: Fila): MensajeGuardado => ({
  id: f.id,
  rol: f.rol,
  texto: f.texto,
  createdAt: new Date(f.created_at),
});

export class SupabaseCoachStore implements CoachStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ultimos(userId: string, limite: number): Promise<MensajeGuardado[]> {
    const { data, error } = await this.db
      .from('coach_mensajes')
      .select('id, rol, texto, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limite)
      .returns<Fila[]>();
    if (error) throw storeError('select coach_mensajes', error.message);
    return (data ?? []).map(aMensaje).reverse();
  }

  async guardar(userId: string, rol: RolCoach, texto: string): Promise<MensajeGuardado> {
    // El perfil tiene que existir por la FK: se puede entrar al coach sin haber
    // hecho nunca una auditoría.
    const { error: perfilError } = await this.db
      .from('profiles')
      .upsert({ id: userId }, { ignoreDuplicates: true });
    if (perfilError) throw storeError('upsert profiles', perfilError.message);

    const { data, error } = await this.db
      .from('coach_mensajes')
      .insert({ user_id: userId, rol, texto })
      .select('id, rol, texto, created_at')
      .single<Fila>();
    if (error) throw storeError('insert coach_mensajes', error.message);
    return aMensaje(data);
  }

  async contarDelUsuario(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('coach_mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rol', 'user');
    if (error) throw storeError('count coach_mensajes', error.message);
    return count ?? 0;
  }
}

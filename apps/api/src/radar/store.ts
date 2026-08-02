import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors.js';

/**
 * Rastro del Radar. NO guarda la lectura del perfil ajeno, a propósito: el radar
 * es efímero y acumular análisis de terceros que nadie va a volver a consultar
 * es archivo muerto con costo de privacidad.
 *
 * Guarda tres cosas: quién, cuánto tardó el motor, y dos campos de telemetría de
 * calibración (bucket y veredicto). Con eso se contesta la pregunta abierta más
 * importante del eje nuevo: ¿la distribución del índice se abre, o el modelo le
 * pone "alto" a todo el mundo?
 */

export interface RadarStore {
  /**
   * Reserva un lugar del cupo y devuelve el id de la fila, o `null` si no hay
   * cupo. Reserva en vez de solo contar: el radar se usa muchas veces por
   * sesión y la carrera es lo esperable, no lo excepcional.
   */
  reservar(userId: string, quota: { limite: number; sinLimite: boolean; ventanaDias: number }): Promise<string | null>;
  /** Completa la telemetría cuando el motor terminó. */
  completar(id: string, datos: { msMotor: number; bucket: string; veredicto: string }): Promise<void>;
  /** Devuelve la reserva si el motor falló: el usuario no pierde cupo por eso. */
  liberar(id: string): Promise<void>;
}

export class InMemoryRadarStore implements RadarStore {
  readonly filas: Array<{ id: string; userId: string; msMotor: number; creado: Date }> = [];
  private n = 0;

  async reservar(
    userId: string,
    quota: { limite: number; sinLimite: boolean; ventanaDias: number },
  ): Promise<string | null> {
    if (!quota.sinLimite) {
      const corte = quota.ventanaDias > 0 ? Date.now() - quota.ventanaDias * 86_400_000 : 0;
      const usadas = this.filas.filter((f) => f.userId === userId && f.creado.getTime() > corte).length;
      if (usadas >= quota.limite) return null;
    }
    const id = `r${++this.n}`;
    this.filas.push({ id, userId, msMotor: 0, creado: new Date() });
    return id;
  }

  async completar(id: string, datos: { msMotor: number }): Promise<void> {
    const f = this.filas.find((x) => x.id === id);
    if (f) f.msMotor = datos.msMotor;
  }

  async liberar(id: string): Promise<void> {
    const i = this.filas.findIndex((x) => x.id === id);
    if (i >= 0) this.filas.splice(i, 1);
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

/** La función de cupo no existe en esta base todavía. */
export class RadarRpcMissingError extends Error {
  constructor() {
    super('percentil.reservar_cupo_radar no existe en esta base');
    this.name = 'RadarRpcMissingError';
  }
}

export class SupabaseRadarStore implements RadarStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async reservar(
    userId: string,
    quota: { limite: number; sinLimite: boolean; ventanaDias: number },
  ): Promise<string | null> {
    const { error: perfilError } = await this.db
      .from('profiles')
      .upsert({ id: userId }, { ignoreDuplicates: true });
    if (perfilError) throw storeError('upsert profiles', perfilError.message);

    const { data, error } = await this.db.rpc('reservar_cupo_radar', {
      p_user_id: userId,
      p_limite: quota.limite,
      p_sin_limite: quota.sinLimite,
      p_ventana_dias: quota.ventanaDias,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new RadarRpcMissingError();
      throw storeError('rpc reservar_cupo_radar', error.message);
    }
    return typeof data === 'string' ? data : null;
  }

  async completar(id: string, datos: { msMotor: number; bucket: string; veredicto: string }): Promise<void> {
    const { error } = await this.db
      .from('radar_lecturas')
      .update({ ms_motor: datos.msMotor, bucket_global: datos.bucket, veredicto: datos.veredicto })
      .eq('id', id);
    if (error) throw storeError('update radar_lecturas', error.message);
  }

  async liberar(id: string): Promise<void> {
    const { error } = await this.db.from('radar_lecturas').delete().eq('id', id);
    if (error) throw storeError('delete radar_lecturas', error.message);
  }
}

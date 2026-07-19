import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AccountProfileUpdate } from '@percentil/contracts';
import type { Region } from '@percentil/contracts';
import { AppError } from '../errors.js';

/**
 * Persistencia de percentil.profiles (region/plan/handle - identidad vive en
 * Supabase Auth, no acá). InMemoryProfileStore para tests/dev; SupabaseProfileStore
 * contra la tabla real. `get` devuelve undefined si el usuario nunca tocó nada
 * (no hay fila todavía): la ruta decide los defaults.
 */

export interface ProfileRow {
  region: Region;
  plan: 'free' | 'kit' | 'copilot';
  handle: string | null;
}

export interface ProfileStore {
  get(userId: string): Promise<ProfileRow | undefined>;
  update(userId: string, patch: AccountProfileUpdate): Promise<ProfileRow>;
}

export class InMemoryProfileStore implements ProfileStore {
  private readonly rows = new Map<string, ProfileRow>();

  async get(userId: string): Promise<ProfileRow | undefined> {
    return this.rows.get(userId);
  }

  async update(userId: string, patch: AccountProfileUpdate): Promise<ProfileRow> {
    const current = this.rows.get(userId) ?? { region: 'neutro' as Region, plan: 'free' as const, handle: null };
    const next: ProfileRow = {
      region: patch.region ?? current.region,
      plan: current.plan,
      handle: patch.handle !== undefined ? patch.handle : current.handle,
    };
    this.rows.set(userId, next);
    return next;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

export class SupabaseProfileStore implements ProfileStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async get(userId: string): Promise<ProfileRow | undefined> {
    const { data, error } = await this.db
      .from('profiles')
      .select('region, plan, handle')
      .eq('id', userId)
      .maybeSingle<ProfileRow>();
    if (error) throw storeError('select profiles', error.message);
    return data ?? undefined;
  }

  async update(userId: string, patch: AccountProfileUpdate): Promise<ProfileRow> {
    const row: Record<string, unknown> = { id: userId };
    if (patch.region !== undefined) row.region = patch.region;
    if (patch.handle !== undefined) row.handle = patch.handle;
    const { data, error } = await this.db
      .from('profiles')
      .upsert(row)
      .select('region, plan, handle')
      .single<ProfileRow>();
    if (error) throw storeError('upsert profiles', error.message);
    return data;
  }
}

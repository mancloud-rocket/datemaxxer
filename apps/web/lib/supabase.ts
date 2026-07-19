import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Cliente de browser (singleton). Solo auth: los datos van vía la API propia. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    client = createClient(url, anonKey);
  }
  return client;
}

/** Access token de la sesión actual, o null si no hay sesión. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export interface DisplayUser {
  nombre: string;
  email: string | null;
  avatarUrl: string | null;
  /** Iniciales para el avatar de respaldo (usuarios de solo email, sin foto). */
  iniciales: string;
  proveedores: string[];
}

/** Normaliza lo que trae la sesión de Supabase (metadata de Google varía de forma). */
export function displayUser(user: User): DisplayUser {
  const meta = user.user_metadata as Record<string, unknown>;
  const nombre =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email ||
    'Tu cuenta';
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  const iniciales = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const proveedores = [...new Set((user.identities ?? []).map((i) => i.provider))];
  return { nombre, email: user.email ?? null, avatarUrl, iniciales, proveedores };
}

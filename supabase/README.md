# Supabase

Migraciones en `migrations/`. Se aplican con `pnpm db:push` (requiere [Supabase CLI](https://supabase.com/docs/guides/cli) instalado y proyecto linkeado con `supabase link`).

Setup inicial (una vez):

```bash
supabase login
supabase link --project-ref <ref-del-proyecto>
pnpm db:push
```

**Después del primer push (paso manual obligatorio):** exponer el schema en
Dashboard → Settings → API → **Exposed schemas** → agregar `percentil`.
Sin esto, PostgREST/supabase-js no puede consultar las tablas. Los clientes
deben crearse con `createClient(url, key, { db: { schema: 'percentil' } })`.

Convenciones:
- **Todo vive en el schema `percentil`, nunca en `public`** (el proyecto Supabase se comparte con otras cosas).
- RLS habilitado en TODAS las tablas, policy `user_id = auth.uid()` (o vía tabla padre).
- `purchases` solo se escribe desde el backend (service role); el usuario la lee.
- Storage: buckets privados `percentil-originals` / `percentil-enhanced` / `percentil-snapshots` (prefijados porque los buckets son globales al proyecto), path `{user_id}/...` - el primer segmento del path define el dueño.

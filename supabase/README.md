# Supabase

Migraciones en `migrations/`. Se aplican con `pnpm db:push` (requiere [Supabase CLI](https://supabase.com/docs/guides/cli) instalado y proyecto linkeado con `supabase link`).

Proyecto actual: `ixydxliuncnbikesfldx` (instancia COMPARTIDA con otros proyectos de Fernando;
región us-west-2). La conexión directa `db.<ref>.supabase.co` es IPv6-only: usar el pooler.

Aplicar migraciones (con la password de la DB):

```bash
supabase db push --yes --db-url "postgresql://postgres.<ref>:<PASSWORD-URLENCODED>@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
```

Notas del historial (compartido entre proyectos de la instancia):
- `20260326013648` pertenece a otro proyecto (rio_seguros); hay un placeholder local vacío para alinear.
- La 0001 de Percentil se aplicó a mano por SQL Editor y quedó marcada con `supabase migration repair --status applied`.

**Después del primer push (paso manual obligatorio):** exponer el schema en
Dashboard → Settings → API → **Exposed schemas** → agregar `percentil`.
Sin esto, PostgREST/supabase-js no puede consultar las tablas. Los clientes
deben crearse con `createClient(url, key, { db: { schema: 'percentil' } })`.

Convenciones:
- **Todo vive en el schema `percentil`, nunca en `public`** (el proyecto Supabase se comparte con otras cosas).
- RLS habilitado en TODAS las tablas, policy `user_id = auth.uid()` (o vía tabla padre).
- `purchases` solo se escribe desde el backend (service role); el usuario la lee.
- Storage: buckets privados `percentil-originals` / `percentil-enhanced` / `percentil-snapshots` (prefijados porque los buckets son globales al proyecto), path `{user_id}/...` - el primer segmento del path define el dueño.

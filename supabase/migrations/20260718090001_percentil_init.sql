-- Percentil - migración inicial (spec §5)
-- Todo en el schema `percentil` (no public): tablas + RLS por user_id + storage buckets.
-- OJO: para acceder vía PostgREST/supabase-js hay que exponer el schema `percentil`
-- en Dashboard → Settings → API → "Exposed schemas" (ver supabase/README.md).

create schema if not exists percentil;

grant usage on schema percentil to anon, authenticated, service_role;

-- ============================================================
-- Tablas
-- ============================================================

-- usuarios: auth la maneja Supabase; esto es perfil de producto
create table percentil.profiles (
  id uuid primary key references auth.users,
  handle text,
  region text check (region in ('rioplatense','chileno','mexicano','neutro')) default 'neutro',
  intent text check (intent in ('relacion','casual','abierto')),
  target_archetype text,          -- arquetipo elegido
  plan text check (plan in ('free','kit','copilot')) default 'free',
  created_at timestamptz default now()
);

create table percentil.photo_sets (          -- un set = una auditoría
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  status text check (status in ('uploaded','analyzing','done','error')) default 'uploaded',
  audit_result jsonb,              -- contrato §6.1 completo
  created_at timestamptz default now()
);

create table percentil.photos (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references percentil.photo_sets not null,
  storage_path text not null,      -- original
  enhanced_path text,              -- resultado F2
  position int,                    -- orden sugerido
  analysis jsonb,                  -- lectura por foto (evidencia F1)
  enhance_ops jsonb                -- log de operaciones aplicadas (auditabilidad)
);

create table percentil.conversations (       -- F4: una por "chica"
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  label text not null,             -- "A", "Flor Bumble", lo que ponga
  platform text,
  profile_read jsonb,              -- contrato §6.3 si subió el perfil (F5)
  behavior_state jsonb,            -- acumulado: latencias, ratios (§6.2)
  last_verdict text,
  verdict_feedback text,           -- "salió bien"/"no contestó más" → feedback loop
  created_at timestamptz default now()
);

create table percentil.chat_snapshots (      -- cada screenshot/pegado es un snapshot
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references percentil.conversations not null,
  source text check (source in ('screenshot','pasted')),
  raw_storage_path text,           -- imagen si screenshot
  extracted jsonb not null,        -- mensajes parseados: [{from, text, ts_estimado}]
  analysis jsonb,                  -- salida F4 de este turno
  created_at timestamptz default now()
);

create table percentil.metrics_entries (     -- F6
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  week date not null,
  swipes int, matches int, replies int, dates int,
  source text check (source in ('manual','screenshot')),
  unique(user_id, week)
);

create table percentil.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  sku text not null,               -- 'kit' | 'copilot_pack_100' | 'copilot_monthly'
  provider text,                   -- 'mercadopago' | 'stripe' | 'apple' | 'google'
  amount_usd numeric,
  status text,
  created_at timestamptz default now()
);

-- Índices para los accesos por dueño / padre
create index photo_sets_user_id_idx on percentil.photo_sets (user_id);
create index photos_set_id_idx on percentil.photos (set_id);
create index conversations_user_id_idx on percentil.conversations (user_id);
create index chat_snapshots_conversation_id_idx on percentil.chat_snapshots (conversation_id);
create index metrics_entries_user_id_idx on percentil.metrics_entries (user_id);
create index purchases_user_id_idx on percentil.purchases (user_id);

-- Grants: authenticated opera bajo RLS; service_role (backend) bypassa RLS igual
grant select, insert, update, delete on all tables in schema percentil to authenticated, service_role;
alter default privileges in schema percentil
  grant select, insert, update, delete on tables to authenticated, service_role;

-- ============================================================
-- RLS: todas las tablas con policy user_id = auth.uid()
-- (photos y chat_snapshots heredan el dueño vía su tabla padre)
-- ============================================================

alter table percentil.profiles enable row level security;
alter table percentil.photo_sets enable row level security;
alter table percentil.photos enable row level security;
alter table percentil.conversations enable row level security;
alter table percentil.chat_snapshots enable row level security;
alter table percentil.metrics_entries enable row level security;
alter table percentil.purchases enable row level security;

create policy "profiles: own row" on percentil.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "photo_sets: own rows" on percentil.photo_sets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "photos: via own set" on percentil.photos
  for all using (
    exists (select 1 from percentil.photo_sets s where s.id = photos.set_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from percentil.photo_sets s where s.id = photos.set_id and s.user_id = auth.uid())
  );

create policy "conversations: own rows" on percentil.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "chat_snapshots: via own conversation" on percentil.chat_snapshots
  for all using (
    exists (select 1 from percentil.conversations c where c.id = chat_snapshots.conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from percentil.conversations c where c.id = chat_snapshots.conversation_id and c.user_id = auth.uid())
  );

create policy "metrics_entries: own rows" on percentil.metrics_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- purchases: el usuario solo LEE las suyas; escribe el backend (service role, bypassa RLS)
create policy "purchases: read own" on percentil.purchases
  for select using (user_id = auth.uid());

-- ============================================================
-- Storage: buckets privados con prefijo percentil- (los buckets son
-- globales al proyecto, el prefijo evita colisiones con otros proyectos).
-- Path convention: {user_id}/...
-- ============================================================

insert into storage.buckets (id, name, public)
values ('percentil-originals', 'percentil-originals', false),
       ('percentil-enhanced', 'percentil-enhanced', false),
       ('percentil-snapshots', 'percentil-snapshots', false);

-- El primer segmento del path es el user_id del dueño
create policy "percentil storage: own folder read" on storage.objects
  for select using (
    bucket_id in ('percentil-originals','percentil-enhanced','percentil-snapshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "percentil storage: own folder insert" on storage.objects
  for insert with check (
    bucket_id in ('percentil-originals','percentil-enhanced','percentil-snapshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "percentil storage: own folder update" on storage.objects
  for update using (
    bucket_id in ('percentil-originals','percentil-enhanced','percentil-snapshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "percentil storage: own folder delete" on storage.objects
  for delete using (
    bucket_id in ('percentil-originals','percentil-enhanced','percentil-snapshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

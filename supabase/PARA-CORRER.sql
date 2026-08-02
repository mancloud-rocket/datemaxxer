-- ============================================================================
-- DATEMAXXER - migraciones pendientes al 2-ago-2026
--
-- Pegá TODO esto de una vez en Supabase → SQL Editor → Run.
-- Es idempotente: si alguna parte ya estaba aplicada, no rompe ni duplica.
-- Corre entero o no corre nada (una sola transacción).
--
-- Contenido:
--   1. solicitudes_upgrade  → el botón del Kit (hoy tira error sin esto)
--   2. coach_mensajes       → el coach (hoy no guarda nada sin esto)
--   3. profile_reads        → F5, lecturas de perfil ajeno (lo que viene)
--
-- Después de correrlo, avisame y verifico contra la base.
-- ============================================================================

begin;

-- ============================================================================
-- 1. Solicitudes de upgrade (cobro manual)
--
-- Mientras no haya checkout automático: el usuario pide el plan desde la app,
-- llega un mail, se manda el link de pago y se activa el plan a mano.
-- ============================================================================

create table if not exists percentil.solicitudes_upgrade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  sku text not null check (sku in ('kit', 'copiloto_mensual')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'activada', 'rechazada')),
  mensaje text,
  -- Email al momento de pedir: evita cruzar con auth.users para contactarlo.
  email text,
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid
);

comment on table percentil.solicitudes_upgrade is
  'Pedidos de plan pago mientras el cobro es manual (link de pago + activación a mano).';

create index if not exists solicitudes_estado_idx
  on percentil.solicitudes_upgrade (estado, created_at desc);

create index if not exists solicitudes_user_idx
  on percentil.solicitudes_upgrade (user_id);

-- Una sola solicitud pendiente por usuario y producto: si toca el botón cinco
-- veces no se generan cinco pedidos ni cinco mails.
create unique index if not exists solicitudes_pendiente_uniq
  on percentil.solicitudes_upgrade (user_id, sku)
  where estado = 'pendiente';

alter table percentil.solicitudes_upgrade enable row level security;

drop policy if exists "solicitudes: lee las propias" on percentil.solicitudes_upgrade;
create policy "solicitudes: lee las propias" on percentil.solicitudes_upgrade
  for select using (user_id = auth.uid());


-- ============================================================================
-- 2. Coach de confianza
--
-- Una conversación por usuario, continua en el tiempo: cuando vuelve a los tres
-- días la charla sigue donde la dejó.
-- ============================================================================

create table if not exists percentil.coach_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  rol text not null check (rol in ('user', 'coach')),
  texto text not null,
  created_at timestamptz not null default now()
);

comment on table percentil.coach_mensajes is
  'Conversación con el coach. Una sola por usuario, continua en el tiempo.';

create index if not exists coach_mensajes_user_idx
  on percentil.coach_mensajes (user_id, created_at desc);

alter table percentil.coach_mensajes enable row level security;

drop policy if exists "coach: lee lo propio" on percentil.coach_mensajes;
create policy "coach: lee lo propio" on percentil.coach_mensajes
  for select using (user_id = auth.uid());


-- ============================================================================
-- 3. F5 - lecturas de perfil ajeno
--
-- Tabla propia y no `conversations.profile_read`: el caso real es "leí un perfil
-- y todavía no le escribí". La conversación referencia la lectura, no al revés.
-- ============================================================================

create table if not exists percentil.profile_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,

  -- 'rechazado' es terminal y NO es un error: el motor decidió no puntuar
  -- (menor aparente, sin persona identificable, ilegible). No se reintenta.
  status text not null default 'analyzing'
    check (status in ('analyzing', 'done', 'error', 'rechazado')),

  result jsonb,   -- ProfileRead v2.0, solo con status = 'done'
  rechazo jsonb,  -- AnalisisRechazado, solo con status = 'rechazado'. NUNCA lleva scores.
  error text,

  progress jsonb not null default '{"fotos_analizadas": 0, "total": 0}'::jsonb,

  conversation_id uuid references percentil.conversations,

  created_at timestamptz not null default now()
);

comment on table percentil.profile_reads is
  'F5 v2.0. Una lectura de perfil ajeno. Independiente de conversations.';
comment on column percentil.profile_reads.rechazo is
  'AnalisisRechazado. Nunca contiene scores: un perfil rechazado no se puntúa.';

create index if not exists profile_reads_user_idx
  on percentil.profile_reads (user_id, created_at desc);

-- Cupo: solo cuentan analyzing + done. Fallidas y rechazadas no queman cupo,
-- misma regla que las auditorías de F1.
create index if not exists profile_reads_cupo_idx
  on percentil.profile_reads (user_id)
  where status in ('analyzing', 'done');

create index if not exists profile_reads_conversation_idx
  on percentil.profile_reads (conversation_id)
  where conversation_id is not null;

alter table percentil.profile_reads enable row level security;

drop policy if exists "profile_reads: lee las propias" on percentil.profile_reads;
create policy "profile_reads: lee las propias" on percentil.profile_reads
  for select using (user_id = auth.uid());

alter table percentil.conversations
  add column if not exists profile_read_id uuid references percentil.profile_reads;

-- La jsonb vieja queda sin uso y sin datos (F4 nunca se construyó). Se va para
-- no dejar dos lugares donde puede vivir lo mismo.
alter table percentil.conversations drop column if exists profile_read;


-- ============================================================================
-- Registro de migraciones: para que el CLI de Supabase no las quiera aplicar
-- de nuevo el día que se use `supabase db push`.
-- ============================================================================

insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260727130001', 'solicitudes_upgrade'),
  ('20260801120001', 'coach'),
  ('20260802120001', 'profile_reads')
on conflict (version) do nothing;

commit;


-- ============================================================================
-- Verificación (corré esto después, tiene que devolver 3 filas)
-- ============================================================================
-- select table_name
-- from information_schema.tables
-- where table_schema = 'percentil'
--   and table_name in ('solicitudes_upgrade', 'coach_mensajes', 'profile_reads')
-- order by table_name;

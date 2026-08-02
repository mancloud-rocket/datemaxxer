-- F5 v2.0 - lecturas de perfil ajeno.
--
-- Decisión: tabla propia y no `conversations.profile_read`.
-- El caso real es "leí un perfil y todavía no le escribí": atar cada lectura a
-- una conversación obligaba a inventar una conversación vacía en el momento en
-- que el usuario todavía no decidió nada. Acá la lectura vive sola y la
-- conversación la referencia cuando y si aparece (F4).

create table if not exists percentil.profile_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,

  -- 'rechazado' es un estado terminal propio y NO un error: el motor decidió no
  -- puntuar (menor aparente, sin persona identificable, ilegible). Se separa de
  -- 'error' porque no es una falla nuestra y no se reintenta.
  status text not null default 'analyzing'
    check (status in ('analyzing', 'done', 'error', 'rechazado')),

  -- Contrato ProfileRead v2.0. Solo cuando status = 'done'.
  result jsonb,
  -- Contrato AnalisisRechazado. Solo cuando status = 'rechazado'.
  -- NUNCA lleva scores: si el motor rechazó, no hay números que guardar.
  rechazo jsonb,
  error text,

  progress jsonb not null default '{"fotos_analizadas": 0, "total": 0}'::jsonb,

  -- Se ata a una conversación recién si el usuario le escribe (F4). Hasta
  -- entonces la lectura existe sola, que es el caso normal.
  conversation_id uuid references percentil.conversations,

  created_at timestamptz not null default now()
);

comment on table percentil.profile_reads is
  'F5 v2.0. Una lectura de perfil ajeno. Independiente de conversations: se lee un perfil mucho antes de escribirle.';
comment on column percentil.profile_reads.rechazo is
  'AnalisisRechazado. Nunca contiene scores: un perfil rechazado no se puntúa.';

-- El acceso es siempre "mis lecturas, más recientes primero".
create index if not exists profile_reads_user_idx
  on percentil.profile_reads (user_id, created_at desc);

-- Para el cupo: cuenta las que consumieron (analyzing + done). Las fallidas y
-- las rechazadas no queman cupo, misma regla que las auditorías de F1.
create index if not exists profile_reads_cupo_idx
  on percentil.profile_reads (user_id)
  where status in ('analyzing', 'done');

create index if not exists profile_reads_conversation_idx
  on percentil.profile_reads (conversation_id)
  where conversation_id is not null;

alter table percentil.profile_reads enable row level security;

create policy "profile_reads: lee las propias" on percentil.profile_reads
  for select using (user_id = auth.uid());

-- La conversación apunta a la lectura, no al revés: una conversación puede
-- existir sin lectura y una lectura sin conversación.
alter table percentil.conversations
  add column if not exists profile_read_id uuid references percentil.profile_reads;

-- La columna jsonb vieja queda sin uso y sin datos (F4 nunca se construyó).
-- Se va para no dejar dos lugares donde puede vivir lo mismo.
alter table percentil.conversations drop column if exists profile_read;

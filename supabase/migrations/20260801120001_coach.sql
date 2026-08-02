-- Coach de confianza: la conversación donde el usuario procesa lo que no es técnico
-- (el rechazo, la ansiedad previa a la cita, la duda de si escribir).
--
-- Es la razón para abrir la app un día que no hay nada que auditar, así que la
-- conversación tiene que ser continua: se guarda entera y se recupera al volver.

create table if not exists percentil.coach_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  rol text not null check (rol in ('user', 'coach')),
  texto text not null,
  created_at timestamptz not null default now()
);

comment on table percentil.coach_mensajes is
  'Conversación con el coach de confianza. Una sola por usuario, continua en el tiempo.';

-- El acceso siempre es "los últimos N mensajes de este usuario": ese es el índice.
create index if not exists coach_mensajes_user_idx
  on percentil.coach_mensajes (user_id, created_at desc);

alter table percentil.coach_mensajes enable row level security;

-- El usuario lee lo suyo; escribir es del backend (service role), porque el turno
-- del coach lo genera el servidor y no puede venir del cliente.
create policy "coach: lee lo propio" on percentil.coach_mensajes
  for select using (user_id = auth.uid());

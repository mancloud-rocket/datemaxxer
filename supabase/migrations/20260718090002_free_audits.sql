-- Auditorías del funnel gratuito (F1 sin auth): captura de email + resultado.
-- Solo el backend (service role) lee/escribe: RLS habilitado SIN policies.

create table percentil.free_audits (
  id uuid primary key,
  email text not null,
  region text check (region in ('rioplatense','chileno','mexicano','neutro')) not null default 'neutro',
  status text check (status in ('analyzing','done','error')) not null default 'analyzing',
  progress jsonb not null default '{"fotos_analizadas":0,"total":0}',
  result jsonb,                    -- contrato §6.1 completo cuando status=done
  error text,
  created_at timestamptz not null default now()
);

create index free_audits_email_idx on percentil.free_audits (email);
create index free_audits_created_at_idx on percentil.free_audits (created_at);

alter table percentil.free_audits enable row level security;
-- Sin policies a propósito: anon/authenticated no acceden; service_role bypassa RLS.

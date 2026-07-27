-- Solicitudes de upgrade + activación manual de planes.
--
-- Etapa de validación: todavía no hay checkout automático. El usuario pide el
-- plan desde la app, Fernando le manda un link de pago (Mercado Pago), y cuando
-- la plata entra le activa el plan a mano. Esta tabla es el registro de esas
-- solicitudes, para que ninguna se pierda y quede trazabilidad de quién pidió qué.

create table if not exists percentil.solicitudes_upgrade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  sku text not null check (sku in ('kit', 'copiloto_mensual')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'activada', 'rechazada')),
  -- Lo que el usuario quiera aclarar (opcional).
  mensaje text,
  -- Email al momento de pedir: evita tener que cruzar con auth.users para contactarlo.
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

-- El usuario ve las suyas; escribir y resolver es del backend (service role).
create policy "solicitudes: lee las propias" on percentil.solicitudes_upgrade
  for select using (user_id = auth.uid());

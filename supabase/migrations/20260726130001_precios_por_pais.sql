-- Precios por país, en moneda local.
--
-- Por qué existe esta tabla y no constantes en el código: MercadoPago NO convierte
-- moneda. Si le mandás "19" pensando en dólares, cobra 19 en la moneda local de la
-- cuenta (19 pesos argentinos, no 19 dólares). Así que cada país necesita su propio
-- monto, explícito.
--
-- Y va en base y no hardcodeado porque estos números se mueven: la inflación
-- argentina y el tipo de cambio obligan a revisarlos seguido, y cambiar un precio
-- no puede requerir un deploy.

alter table percentil.profiles
  add column if not exists pais text
  check (pais is null or pais in ('AR', 'CL', 'UY', 'XX'));

comment on column percentil.profiles.pais is
  'País de cobro del usuario. XX = resto del mundo (se cobra en USD). Null = sin determinar todavía.';

create table if not exists percentil.precios (
  id uuid primary key default gen_random_uuid(),
  -- XX = resto del mundo: se cobra en USD por fuera de MercadoPago.
  pais text not null check (pais in ('AR', 'CL', 'UY', 'XX')),
  sku text not null check (sku in ('kit', 'copiloto_mensual')),
  moneda text not null check (moneda in ('ARS', 'CLP', 'UYU', 'USD')),
  -- Entero en la unidad de la moneda (CLP/ARS no usan decimales en la práctica).
  monto numeric(12, 2) not null check (monto > 0),
  activo boolean not null default true,
  actualizado_at timestamptz not null default now(),
  unique (pais, sku)
);

comment on table percentil.precios is
  'Precio de cada SKU por país, en moneda local. Editable sin deploy.';

alter table percentil.precios enable row level security;

-- Los precios son públicos (la página de planes los muestra antes del login).
-- Escribir es solo del backend con service role, que bypassea RLS.
create policy "precios: lectura pública" on percentil.precios
  for select using (true);

create index precios_pais_idx on percentil.precios (pais);

-- Valores de arranque (jul-2026). Redondeados a precio psicológico, no a la
-- conversión exacta. Referencias de cambio usadas: USD/CLP ~945, USD/UYU ~40,7,
-- USD/ARS oficial ~1.500. Objetivo: Kit USD 19, Copiloto USD 13/mes.
-- Fernando ajusta estos montos según su mercado; el sistema no depende de ellos.
insert into percentil.precios (pais, sku, moneda, monto) values
  ('CL', 'kit',              'CLP', 17900),
  ('CL', 'copiloto_mensual', 'CLP', 12900),
  ('AR', 'kit',              'ARS', 28900),
  ('AR', 'copiloto_mensual', 'ARS', 19900),
  ('UY', 'kit',              'UYU', 790),
  ('UY', 'copiloto_mensual', 'UYU', 549),
  ('XX', 'kit',              'USD', 19),
  ('XX', 'copiloto_mensual', 'USD', 13)
on conflict (pais, sku) do nothing;

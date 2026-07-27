-- Facturación con Paddle (Merchant of Record).
--
-- Reemplaza el enfoque anterior pensado para MercadoPago: se elimina la tabla de
-- precios por país porque Paddle es el vendedor legal, cobra en la moneda del
-- comprador y localiza los precios solo. Los importes viven en Paddle, no acá.

drop table if exists percentil.precios;

-- ============================================================
-- Estado de suscripción en el perfil
-- ============================================================
-- `plan` ya existía (free/kit/copilot) y es lo que consulta el chequeo de cupo.
-- Estas columnas guardan el estado real que reporta Paddle, para poder decidir
-- accesos y mostrar el estado en Configuración sin volver a pegarle a su API.
alter table percentil.profiles
  add column if not exists plan_status text not null default 'none'
    check (plan_status in ('none','trialing','active','past_due','paused','canceled')),
  -- Hasta cuándo hay acceso pago. Con la suscripción cancelada pero el período
  -- pago en curso, sigue teniendo acceso hasta esta fecha.
  add column if not exists plan_expires_at timestamptz,
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text;

create index if not exists profiles_paddle_subscription_idx
  on percentil.profiles (paddle_subscription_id);

-- ============================================================
-- Compras
-- ============================================================
-- La tabla ya existía del schema inicial pero nunca se escribió. Se le agrega lo
-- que hace falta para la integración real.
-- El sku venía NOT NULL, pero si Paddle manda un price id que no tenemos mapeado
-- preferimos registrar el movimiento con sku desconocido antes que perderlo.
alter table percentil.purchases alter column sku drop not null;

alter table percentil.purchases
  -- ID del evento de Paddle. UNIQUE = idempotencia: los webhooks se reintentan y
  -- un mismo evento no puede cobrarse/aplicarse dos veces.
  add column if not exists provider_event_id text,
  -- Suscripción o transacción de Paddle a la que corresponde.
  add column if not exists provider_ref text,
  add column if not exists moneda text,
  -- Payload crudo para poder auditar o reprocesar sin depender de Paddle.
  add column if not exists payload jsonb;

create unique index if not exists purchases_provider_event_uniq
  on percentil.purchases (provider_event_id)
  where provider_event_id is not null;

create index if not exists purchases_provider_ref_idx
  on percentil.purchases (provider_ref);

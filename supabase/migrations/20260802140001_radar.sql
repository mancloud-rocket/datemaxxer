-- Radar (F5 comprimido para usar con el pulgar sobre el botón de like).
--
-- Decisión: acá NO se guarda el resultado, solo el rastro.
--
-- El radar es efímero por diseño: se usa en cinco segundos y se descarta. Guardar
-- la lectura completa de cada perfil ajeno que el usuario mira al swipear sería
-- acumular un archivo de datos sobre terceros que no dieron consentimiento, para
-- una función que nadie va a volver a consultar. Lo que sí hace falta es contar
-- para el cupo y vigilar la latencia.
--
-- Por eso quedan tres cosas: quién, cuándo, y cuánto tardó el motor. Más el
-- bucket y el veredicto, que son dos enteros de telemetría y son lo que va a
-- permitir contestar la pregunta que más importa del eje nuevo: ¿la distribución
-- del índice se abre, o el modelo le pone "alto" a todo el mundo?

create table if not exists percentil.radar_lecturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references percentil.profiles not null,
  -- Telemetría del presupuesto de latencia: si esto sube de 5s, el radar dejó
  -- de ser un radar y hay que revisar el modelo o el tamaño de la salida.
  ms_motor int not null,
  -- Telemetría de calibración. NO es el resultado: es un enum y un entero.
  bucket_global text,
  veredicto text,
  created_at timestamptz not null default now()
);

comment on table percentil.radar_lecturas is
  'Rastro del Radar: cupo + telemetría. NO guarda la lectura del perfil ajeno, a propósito.';

create index if not exists radar_user_idx
  on percentil.radar_lecturas (user_id, created_at desc);

alter table percentil.radar_lecturas enable row level security;

drop policy if exists "radar: lee lo propio" on percentil.radar_lecturas;
create policy "radar: lee lo propio" on percentil.radar_lecturas
  for select using (user_id = auth.uid());

-- Cupo atómico, mismo patrón que F1 y F5. Acá es el que más se ejercita: el
-- radar está pensado para usarse muchas veces por sesión, así que la carrera
-- no es teórica, es lo esperable.
--
-- La función RESERVA el lugar (inserta la fila) en vez de solo contar. Si solo
-- contara, dos requests simultáneas verían las dos que hay cupo y se llevarían
-- dos lecturas por el precio de una. El `ms_motor` real se completa después,
-- cuando el motor terminó; si el motor falla, la ruta borra la reserva y el
-- usuario no pierde nada.
create or replace function percentil.reservar_cupo_radar(
  p_user_id uuid,
  p_limite int,
  p_sin_limite boolean,
  p_ventana_dias int
) returns uuid
language plpgsql
as $$
declare
  v_usadas int;
  v_id uuid;
begin
  perform 1 from percentil.profiles where id = p_user_id for update;

  if not p_sin_limite then
    select count(*) into v_usadas
    from percentil.radar_lecturas
    where user_id = p_user_id
      and (p_ventana_dias <= 0 or created_at > now() - make_interval(days => p_ventana_dias));

    if v_usadas >= p_limite then
      return null; -- sin cupo
    end if;
  end if;

  insert into percentil.radar_lecturas (user_id, ms_motor)
  values (p_user_id, 0)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function percentil.reservar_cupo_radar(uuid, int, boolean, int) to service_role;

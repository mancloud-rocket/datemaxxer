-- Cupo de lecturas de perfil (F5) sin condición de carrera.
--
-- Mismo patrón que `crear_auditoria_con_cupo`: el conteo y el insert pasan en una
-- sola transacción, tomando un lock sobre la fila del perfil para serializar las
-- lecturas concurrentes del MISMO usuario. Sin esto, dos requests simultáneas
-- (doble click, dos pestañas, un retry de red) consumen una sola vez el cupo y
-- se llevan dos lecturas.
--
-- Acá pesa más que en F1: el cupo de F5 es mensual y consumible, así que un
-- agujero se explota muchas veces, no una.
--
-- Precondición: la fila de percentil.profiles ya debe existir (la API la
-- upsertea antes, para la FK).

create or replace function percentil.crear_profile_read_con_cupo(
  p_id uuid,
  p_user_id uuid,
  p_limite int,
  p_sin_limite boolean,
  -- Ventana del cupo en días. 0 = cupo de por vida (planes free y kit);
  -- 30 = cupo mensual corredizo (copiloto).
  p_ventana_dias int
) returns boolean
language plpgsql
as $$
declare
  v_usadas int;
begin
  perform 1 from percentil.profiles where id = p_user_id for update;

  if not p_sin_limite then
    -- Solo cuentan las que consumieron: 'error' y 'rechazado' no queman cupo.
    -- Un rechazo no es culpa del usuario y una falla nuestra menos todavía.
    select count(*) into v_usadas
    from percentil.profile_reads
    where user_id = p_user_id
      and status in ('analyzing', 'done')
      and (p_ventana_dias <= 0 or created_at > now() - make_interval(days => p_ventana_dias));

    if v_usadas >= p_limite then
      return false;
    end if;
  end if;

  insert into percentil.profile_reads (id, user_id, status, progress, created_at)
  values (
    p_id,
    p_user_id,
    'analyzing',
    jsonb_build_object('fotos_analizadas', 0, 'total', 0),
    now()
  );
  return true;
end;
$$;

grant execute on function percentil.crear_profile_read_con_cupo(uuid, uuid, int, boolean, int)
  to service_role;

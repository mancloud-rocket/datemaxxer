-- Cupo de auditorías sin condición de carrera.
--
-- Problema que resuelve: la API contaba las auditorías usadas y después insertaba,
-- en dos pasos separados. Dos requests simultáneos del mismo usuario (doble click,
-- dos pestañas, un retry de red) pasaban los dos el chequeo y consumían dos veces
-- el cupo gratis. Trivial de explotar y, con el Kit pago, un agujero de ingresos.
--
-- Esta función hace el conteo y el insert en una sola transacción, tomando un lock
-- sobre la fila del perfil para serializar las auditorías concurrentes del MISMO
-- usuario (no bloquea a usuarios distintos entre sí).
--
-- Precondición: la fila de percentil.profiles ya debe existir (la API la upsertea
-- antes, para la FK y para persistir la región).

create or replace function percentil.crear_auditoria_con_cupo(
  p_id uuid,
  p_user_id uuid,
  p_total int,
  p_free_limit int,
  p_sin_limite boolean
) returns boolean
language plpgsql
as $$
declare
  v_usadas int;
begin
  -- Serializa por usuario: la segunda request espera acá hasta que la primera
  -- termine su transacción, y entonces ve el conteo ya actualizado.
  perform 1 from percentil.profiles where id = p_user_id for update;

  if not p_sin_limite then
    -- Las fallidas no queman cupo (misma regla que countForUser en la API).
    select count(*) into v_usadas
    from percentil.photo_sets
    where user_id = p_user_id and status <> 'error';

    if v_usadas >= p_free_limit then
      return false;
    end if;
  end if;

  insert into percentil.photo_sets (id, user_id, status, progress, created_at)
  values (
    p_id,
    p_user_id,
    'analyzing',
    jsonb_build_object('fotos_analizadas', 0, 'total', p_total),
    now()
  );
  return true;
end;
$$;

grant execute on function percentil.crear_auditoria_con_cupo(uuid, uuid, int, int, boolean)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Actividades (ProyectoHoras) del tablero de tareas · 5e · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_actividades              = getActividadesDash (Proyectos.gs): cada fila de
--                              proyecto_horas con su proyecto, cliente y desarrollo
-- estados_actividad()        = la lista PHoras_EstadoActividad de CotConfig
-- set_estado_actividad(id,e) = setEstadoActividad: sólo un estado de esa lista
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_actividades with (security_invoker = true) as
select h.id, h.proyecto_id as proy_id, coalesce(m.nombre, h.proyecto_id) as proyecto,
       coalesce(m.empresa, '') as cliente, coalesce(h.desarrollo_id, '') as item_id,
       case when coalesce(h.desarrollo_id, '') = '' then ''
            else coalesce((select coalesce(nullif(d.titulo, ''), nullif(d.tipo_id, ''), d.id) from crm_giwa.desarrollos d where d.id = h.desarrollo_id), h.desarrollo_id) end as desarrollo,
       coalesce(h.etapa, '') as etapa, coalesce(h.modulo_nombre, '') as actividad,
       coalesce(h.responsable, '') as responsable, coalesce(h.estado, '') as estado, h.orden
from crm_giwa.proyecto_horas h
left join crm_giwa.v_proy_mapa m on m.id = h.proyecto_id
where coalesce(h.id, '') <> '' and coalesce(h.proyecto_id, '') <> '';

create or replace function crm_giwa.estados_actividad() returns text[]
language sql stable as $$
  select coalesce(array_agg(trim(x) order by o), '{}')
  from crm_giwa.cot_config c, unnest(string_to_array(c.valor, ',')) with ordinality u(x, o)
  where c.clave = 'PHoras_EstadoActividad' and trim(x) <> ''
$$;

create or replace function crm_giwa.set_estado_actividad(hid text, estado text) returns jsonb
language plpgsql volatile as $$
declare ok text[] := crm_giwa.estados_actividad();
begin
  estado := trim(coalesce(estado, ''));
  if cardinality(ok) > 0 and not (estado = any (ok)) then raise exception 'Estado no válido: %', estado; end if;
  update crm_giwa.proyecto_horas set estado = set_estado_actividad.estado where id = trim(hid);
  if not found then raise exception 'Actividad no encontrada'; end if;
  return jsonb_build_object('ok', true, 'id', hid, 'estado', estado);
end $$;

grant select on crm_giwa.v_actividades to authenticated, service_role;
grant execute on function crm_giwa.estados_actividad(), crm_giwa.set_estado_actividad(text, text) to authenticated, service_role;

reset role;

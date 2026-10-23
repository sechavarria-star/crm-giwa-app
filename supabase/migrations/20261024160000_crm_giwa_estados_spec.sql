-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · estados_spec() = getEstadosSpec (Estados.gs) · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Las dos tablas de estados en el formato que espera initEstadosSpec()
-- (_Estados.html → js/estados.js). Proyecto: uno por clave canónica (gana
-- la primera fila), ordenado por Prioridad. Desarrollo: por clave canónica
-- (gana la última fila), en el orden fijo nueva → rechazada.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.canon_proyecto(e text) returns text
language sql immutable as $$
  select case
    when x = '' then 'prospecto'
    when x ~ '(rechaz|perdid|cancel)' then 'rechazado'
    when x ~ 'finaliz' then 'finalizado'
    when x ~ '(activo|ejecu|curso)' then 'activo'
    when x ~ '(aprob|vendid|ganad)' then 'aprobado'
    when x ~ '(negoc|revis)' then 'negociacion'
    else 'prospecto' end
  from (select crm_giwa.norm(e) x) s
$$;

create or replace function crm_giwa.estados_spec() returns jsonb
language sql stable as $$
  with p as (
    select distinct on (crm_giwa.canon_proyecto(id)) crm_giwa.canon_proyecto(id) as canon, *
    from crm_giwa.proyecto_estados where coalesce(trim(id), '') <> ''
    order by crm_giwa.canon_proyecto(id), orden
  ),
  d as (
    select distinct on (crm_giwa.estado_canonico(id)) crm_giwa.estado_canonico(id) as canon, *
    from crm_giwa.desarrollo_estados where coalesce(trim(id), '') <> ''
    order by crm_giwa.estado_canonico(id), orden desc
  )
  select jsonb_build_object(
    'ok', true,
    'proyecto', coalesce((select jsonb_agg(jsonb_build_object(
        'canon', canon, 'estado', id, 'orden', coalesce(nullif(prioridad, 0), 99), 'manual', coalesce(asignacion, '') ~* '^m',
        'ganado', coalesce(ganado, false), 'facturable', coalesce(facturable, false),
        'probabilidad', coalesce(probabilidad, false), 'editable', coalesce(editable, false),
        'regla', coalesce(regla, ''), 'condicion', coalesce(condicion, ''))
        order by coalesce(nullif(prioridad, 0), 99)) from p), '[]'),
    'desarrollo', coalesce((select jsonb_agg(jsonb_build_object(
        'canon', canon, 'estado', id, 'ganado', coalesce(ganado, false), 'facturable', coalesce(facturable, false),
        'ejecutando', coalesce(ejecutandose, false), 'estado_proy', coalesce(estado_proyecto, ''),
        'detener', coalesce(detenido, false), 'rechazar', coalesce(rechazar, false), 'recotizar', coalesce(recotizar, false),
        'renovar', coalesce(renovar, false), 'ipc', coalesce(ajuste_ipc, false))
        order by array_position(array['nueva','aprobada','curso','garantia','finalizada','rechazada'], canon)) from d), '[]'))
$$;

grant execute on function crm_giwa.canon_proyecto(text), crm_giwa.estados_spec() to authenticated, service_role;

reset role;

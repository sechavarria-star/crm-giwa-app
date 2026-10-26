-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · editar un proyecto · 5f · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- editar_proyecto(p) = saveProyecto (Proyectos.gs) para un proyecto que ya
-- existe (el alta es del Cotizador). Mismas reglas:
--   · sólo cambia lo que viene; owner siempre (si no viene, quien edita)
--   · probabilidad 100 si queda Aprobado; si no, la que viene o 50
--   · empresa y sponsor por ID
--   · el estado pasa por la guarda de cambiar_estado_proyecto (_puedeCambiarEstado)
-- p = { id, nombre, descripcion, empresa, sponsor, owner, estado, probabilidad, fecha_propuesta }
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.editar_proyecto(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  x crm_giwa.proyectos := crm_giwa._proyecto(p ->> 'id');
  est text := coalesce(nullif(trim(p ->> 'estado'), ''), x.estado_id);
  nom text := trim(coalesce(p ->> 'nombre', x.nombre));
begin
  if nom = '' then raise exception 'Nombre obligatorio'; end if;
  if est is distinct from x.estado_id then perform crm_giwa.cambiar_estado_proyecto(x.id, est); end if;
  update crm_giwa.proyectos set
    nombre            = nom,
    resumen_ejecutivo = case when p ? 'descripcion' then nullif(trim(p ->> 'descripcion'), '') else resumen_ejecutivo end,
    empresa_id        = case when p ? 'empresa' then nullif(trim(p ->> 'empresa'), '') else empresa_id end,
    sponsor_id        = case when p ? 'sponsor' then nullif(trim(p ->> 'sponsor'), '') else sponsor_id end,
    owner             = coalesce(nullif(crm_giwa.norm_mail(p ->> 'owner'), ''), crm_giwa.mi_mail()),
    fecha_propuesta   = coalesce(nullif(p ->> 'fecha_propuesta', '')::date, fecha_propuesta),
    probabilidad      = case when est = 'Aprobado' then 100 else coalesce(nullif(crm_giwa.num(p ->> 'probabilidad'), 0), 50) end,
    fecha_aprobacion  = case when est = 'Aprobado' and fecha_aprobacion is null then crm_giwa.hoy() else fecha_aprobacion end
  where id = x.id;
  return jsonb_build_object('ok', true, 'id', x.id);
end $$;

grant execute on function crm_giwa.editar_proyecto(jsonb) to authenticated;

reset role;

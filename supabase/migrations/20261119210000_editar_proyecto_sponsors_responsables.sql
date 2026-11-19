-- Editar proyecto · listas de Sponsors y Responsables (19/11/2026), guardadas igual que el Cotizador (cot_guardar):
--   sponsors     → sponsor_id = el primero · contactos = todos, separados por coma
--   responsables → owner = el primero · minuta.responsables = todos (el resto de la minuta se conserva)
-- Si el pedido no trae esas listas, todo queda como antes ('sponsor' y 'owner' sueltos).
-- Parte de la función que hay hoy en la base (con fecha_cierre); el resto no cambia.
set role crm_giwa_dev;

create or replace function crm_giwa.editar_proyecto(p jsonb) returns jsonb
language plpgsql as $function$
declare
  x crm_giwa.proyectos := crm_giwa._proyecto(p ->> 'id');
  est text := coalesce(nullif(trim(p ->> 'estado'), ''), x.estado_id);
  nom text := trim(coalesce(p ->> 'nombre', x.nombre));
  sps text[] := case when jsonb_typeof(p -> 'sponsors') = 'array'
    then array(select btrim(s) from jsonb_array_elements_text(p -> 'sponsors') s where btrim(s) <> '') end;
  rsp text[] := case when jsonb_typeof(p -> 'responsables') = 'array'
    then array(select crm_giwa.norm_mail(s) from jsonb_array_elements_text(p -> 'responsables') s where crm_giwa.norm_mail(s) <> '') end;
  min jsonb := case when coalesce(btrim(x.minuta), '') = '' then '{}'::jsonb else x.minuta::jsonb end;
begin
  if nom = '' then raise exception 'Nombre obligatorio'; end if;
  if est is distinct from x.estado_id then perform crm_giwa.cambiar_estado_proyecto(x.id, est); end if;
  update crm_giwa.proyectos set
    nombre            = nom,
    resumen_ejecutivo = case when p ? 'descripcion' then nullif(trim(p ->> 'descripcion'), '') else resumen_ejecutivo end,
    empresa_id        = case when p ? 'empresa' then nullif(trim(p ->> 'empresa'), '') else empresa_id end,
    sponsor_id        = case when sps is not null then sps[1]
                             when p ? 'sponsor' then nullif(trim(p ->> 'sponsor'), '') else sponsor_id end,
    contactos         = case when sps is not null then array_to_string(sps, ',') else contactos end,
    owner             = coalesce(rsp[1], nullif(crm_giwa.norm_mail(p ->> 'owner'), ''), crm_giwa.mi_mail()),
    minuta            = case when rsp is not null then jsonb_set(min, '{responsables}', to_jsonb(rsp))::text else minuta end,
    fecha_cierre_probable = case when p ? 'fecha_cierre' then nullif(p ->> 'fecha_cierre', '')::date else fecha_cierre_probable end,
    fecha_propuesta   = coalesce(nullif(p ->> 'fecha_propuesta', '')::date, fecha_propuesta),
    probabilidad      = case when est = 'Aprobado' then 100 else coalesce(nullif(crm_giwa.num(p ->> 'probabilidad'), 0), 50) end,
    fecha_aprobacion  = case when est = 'Aprobado' and fecha_aprobacion is null then crm_giwa.hoy() else fecha_aprobacion end
  where id = x.id;
  return jsonb_build_object('ok', true, 'id', x.id);
end $function$;
grant execute on function crm_giwa.editar_proyecto(jsonb) to authenticated;

reset role;

-- Nuevo proyecto (Vicky, 20/11/2026): un solo modal para crear y editar. Carga rápida desaparece.
-- alta_proyecto crea el proyecto en Prospecto con los datos del modal (empresa, título, fecha probable, probabilidad,
-- resumen, sponsors, contactos del cliente y responsables). Los desarrollos y el MMR se cargan después con
-- alta_desarrollo (clase 'desarrollo') y alta_abono, las mismas de Editar proyecto.
-- alta_proyecto_rapido se borra: nadie más la usa.
set role crm_giwa_dev;

create or replace function crm_giwa.alta_proyecto(p jsonb) returns jsonb
language plpgsql as $function$
declare
  emp text := nullif(trim(p ->> 'empresa_id'), '');
  nom text := trim(coalesce(p ->> 'nombre', ''));
  f date := nullif(p ->> 'fecha_cierre', '')::date;
  sps text[] := case when jsonb_typeof(p -> 'sponsors') = 'array' then array(select btrim(s) from jsonb_array_elements_text(p -> 'sponsors') s where btrim(s) <> '') else '{}' end;
  con text[] := case when jsonb_typeof(p -> 'contactos_cliente') = 'array' then array(select btrim(s) from jsonb_array_elements_text(p -> 'contactos_cliente') s where btrim(s) <> '') else '{}' end;
  rsp text[] := case when jsonb_typeof(p -> 'responsables') = 'array' then array(select crm_giwa.norm_mail(s) from jsonb_array_elements_text(p -> 'responsables') s where crm_giwa.norm_mail(s) <> '') else '{}' end;
  yo text := crm_giwa.mi_mail(); pid text;
begin
  if emp is null then raise exception 'Falta la empresa'; end if;
  if nom = '' then raise exception 'Falta el título del proyecto'; end if;
  if f is null then raise exception 'Falta la fecha probable de aprobación'; end if;
  pid := crm_giwa.proximo_id('P', 'proyectos', 4);
  insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, sponsors, contactos, owner, tipo, estado_id, probabilidad, detenido, resumen_ejecutivo, minuta)
  values (pid, emp, nom, sps[1], nullif(array_to_string(sps, ','), ''), nullif(array_to_string(con, ','), ''), coalesce(rsp[1], yo), 'Cliente', 'Prospecto',
          coalesce(nullif(crm_giwa.num(p ->> 'probabilidad'), 0), 50), false, nullif(btrim(coalesce(p ->> 'resumen', '')), ''),
          jsonb_build_object('origen', 'Nuevo proyecto', 'responsables', to_jsonb(case when cardinality(rsp) > 0 then rsp else array[yo] end))::text);
  update crm_giwa.proyectos set fecha_cierre_probable = f where id = pid;
  return jsonb_build_object('ok', true, 'pid', pid);
end $function$;
grant execute on function crm_giwa.alta_proyecto(jsonb) to authenticated;

drop function if exists crm_giwa.alta_proyecto_rapido(jsonb);

reset role;

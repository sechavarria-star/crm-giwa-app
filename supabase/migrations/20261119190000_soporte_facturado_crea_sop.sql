-- Soporte · «Marcar facturado» crea sola la línea de horas de soporte (SOP) en el CRM.
-- Reutiliza alta_desarrollo (el mismo «Nuevo soporte» del CRM): queda en Nuevo, vinculada al
-- desarrollo (mant_de), con las horas y el monto = horas × hora de soporte del desarrollo
-- (si no tiene, la hora de soporte general VHSOPORTEGIWA<moneda> de cot_config).
-- Desmarcar: sólo si la línea sigue en Nuevo; la pasa a Rechazado (accion_desarrollo) y libera el mes.
set role crm_giwa_dev;

create or replace function crm_giwa.soporte_marcar_facturado(p jsonb)
returns jsonb language plpgsql as $function$
declare
  emp text := p ->> 'empresa_id';
  did text := nullif(p ->> 'desarrollo_id', '');
  per text := p ->> 'periodo';
  hs  numeric := crm_giwa.num(p ->> 'horas');
  ya  crm_giwa.soporte_facturado;
  d   crm_giwa.v_soporte_desarrollos;
  vh  numeric; r jsonb; sop text;
  meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  perform crm_giwa._soporte_equipo();
  if per is null or per !~ '^\d{4}-\d{2}$' then raise exception 'Falta el período.'; end if;
  select * into ya from crm_giwa.soporte_facturado where empresa_id = emp and desarrollo_id is not distinct from did and periodo = per;

  if coalesce((p ->> 'desmarcar')::boolean, false) then
    if ya.id is null then return jsonb_build_object('ok', true); end if;
    if ya.sop_id is not null and exists (select 1 from crm_giwa.desarrollos x where x.id = ya.sop_id
         and crm_giwa.estado_canonico(x.estado_id) <> 'rechazada') then
      if (select crm_giwa.estado_canonico(x.estado_id) from crm_giwa.desarrollos x where x.id = ya.sop_id) <> 'nueva' then
        raise exception 'La línea % ya no está en Nuevo en el CRM: no se puede desmarcar.', ya.sop_id;
      end if;
      perform crm_giwa.accion_desarrollo(ya.sop_id, 'rechazar');
    end if;
    delete from crm_giwa.soporte_facturado where id = ya.id;
    return jsonb_build_object('ok', true);
  end if;

  if ya.id is not null then raise exception 'Este mes ya está marcado como facturado (línea %).', ya.sop_id; end if;
  if did is null then raise exception 'Los tickets sin desarrollo no se pueden facturar: asignales un desarrollo.'; end if;
  if coalesce(hs, 0) <= 0 then raise exception 'Poné las horas a facturar.'; end if;
  select * into d from crm_giwa.v_soporte_desarrollos where id = did and empresa_id = emp;
  if d.id is null then raise exception 'No encuentro el desarrollo % de esta empresa.', did; end if;
  if d.es_mantenimiento then raise exception 'Las líneas de mantenimiento no se marcan desde acá.'; end if;

  vh := nullif(d.hora_soporte, 0);
  if vh is null then
    select crm_giwa.num(valor) into vh from crm_giwa.cot_config where clave = 'VHSOPORTEGIWA' || d.moneda;
  end if;
  if coalesce(vh, 0) <= 0 then raise exception 'No hay valor de hora de soporte cargado para %.', did; end if;

  r := crm_giwa.alta_desarrollo(jsonb_build_object(
         'padre', did, 'clase', 'soporte', 'moneda', d.moneda, 'horas', hs, 'monto', round(hs * vh, 2),
         'titulo', 'Horas de soporte ' || meses[substr(per, 6, 2)::int] || ' ' || substr(per, 1, 4) || ' · ' || d.titulo));
  sop := r ->> 'id';

  insert into crm_giwa.soporte_facturado (id, empresa_id, desarrollo_id, periodo, horas, sop_id, usuario, nota)
  values (crm_giwa._soporte_nuevo_id('FAC', 4), emp, did, per, hs, sop, crm_giwa.mi_mail(), nullif(trim(coalesce(p ->> 'nota', '')), ''));
  return jsonb_build_object('ok', true, 'sop_id', sop, 'monto', round(hs * vh, 2), 'moneda', d.moneda);
end $function$;

reset role;

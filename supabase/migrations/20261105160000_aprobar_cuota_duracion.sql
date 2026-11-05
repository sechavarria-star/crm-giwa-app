-- Aprobar propuesta (05/11/2026): «sin cambios» deja el desarrollo en Nuevo, sin pausarlo (no hay estado «En espera»).
-- Mantenimiento: se carga la cuota mensual y la duración; el total sale de ahí.
set role crm_giwa_dev;
drop function if exists crm_giwa.aprobar_proyecto(text, jsonb, jsonb, jsonb);
create or replace function crm_giwa.aprobar_proyecto(pid text, decisiones jsonb, montos jsonb default '{}', inicios jsonb default '{}', mants jsonb default '{}') returns jsonb
language plpgsql volatile as $$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  e int := 0; r int := 0; w int := 0; a int := 0; k text; m numeric; f date; cu numeric; dur int;
begin
  for k in select jsonb_object_keys(coalesce(montos, '{}'::jsonb)) loop
    if decisiones ->> k = 'entro' then
      m := nullif(montos ->> k, '')::numeric;
      if m is null or m <= 0 then raise exception 'El monto aprobado de % tiene que ser mayor a 0.', k; end if;
      update crm_giwa.desarrollos d set total_ars = m,
             total_usd = case when coalesce(d.tipo_cambio, 0) > 0 then round(m / d.tipo_cambio, 2) else d.total_usd end
       where d.id = k and d.proyecto_id = p.id;
    end if;
  end loop;
  for k in select jsonb_object_keys(coalesce(mants, '{}'::jsonb)) loop
    if decisiones ->> k = 'entro' then
      cu := nullif(mants -> k ->> 'cuota', '')::numeric; dur := nullif(mants -> k ->> 'duracion', '')::int;
      if cu is null or cu <= 0 then raise exception 'La cuota mensual de % tiene que ser mayor a 0.', k; end if;
      if dur is null or dur <= 0 then raise exception 'La duración de % tiene que ser mayor a 0.', k; end if;
      update crm_giwa.desarrollos d set cuota = cu, valor_cuota_actual = cu, q_cuotas = dur, meses_contrato = dur, total_ars = cu * dur,
             total_usd = case when coalesce(d.total_ars, 0) > 0 and coalesce(d.total_usd, 0) > 0 then round(d.total_usd * (cu * dur) / d.total_ars, 2) else d.total_usd end
       where d.id = k and d.proyecto_id = p.id;
    end if;
  end loop;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('aprobada'), fecha_aprobado = crm_giwa.hoy(), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'entro';
  get diagnostics e = row_count;
  if e = 0 then raise exception 'No marcaste ningún desarrollo como Aprobado. Si no entró nada, usá No aceptar.'; end if;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('rechazada'), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'rechazado';
  get diagnostics r = row_count;
  select count(*) into w from jsonb_each_text(coalesce(decisiones, '{}'::jsonb)) x where x.value = 'espera';
  update crm_giwa.proyectos set estado_id = 'Aprobado', probabilidad = 100, fecha_aprobacion = crm_giwa.hoy(),
         minuta = (crm_giwa._cot_j(minuta) || jsonb_build_object('aprobada', crm_giwa.hoy()))::text where id = p.id;
  update crm_giwa.desarrollos d set minuta = (crm_giwa._cot_j(d.minuta) || jsonb_build_object('aprobado', jsonb_build_object(
           'fecha', crm_giwa.hoy(), 'precio', d.total_ars, 'horas', d.duracion_horas, 'tier', d.tier_id, 'valor_hora', d.valor_hora)))::text
   where d.proyecto_id = p.id and decisiones ->> d.id = 'entro' and not crm_giwa._cot_es_mant(d);
  for k in select jsonb_object_keys(coalesce(inicios, '{}'::jsonb)) loop
    f := nullif(inicios ->> k, '')::date;
    if f is null or decisiones ->> k is distinct from 'entro' then continue; end if;
    if not exists (select 1 from crm_giwa.desarrollos where id = k and proyecto_id = p.id) then
      raise exception 'El desarrollo % no es de este proyecto.', k;
    end if;
    perform crm_giwa.fecha_desarrollo(k, 'fecha_ini', f);
    perform crm_giwa.accion_desarrollo(k, 'arrancar');
    a := a + 1;
  end loop;
  return jsonb_build_object('ok', true, 'estado', 'Aprobado', 'entraron', e, 'rechazados', r, 'esperan', w, 'arrancaron', a,
    'msg', e || ' aprobado(s)' || case when a > 0 then ' · ' || a || ' arrancado(s)' else '' end
                                || case when r > 0 then ', ' || r || ' no aceptado(s)' else '' end
                                || case when w > 0 then ', ' || w || ' sin cambios' else '' end);
end $$;
grant execute on function crm_giwa.aprobar_proyecto(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
reset role;

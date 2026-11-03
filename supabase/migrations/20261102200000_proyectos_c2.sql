-- C2 Proyectos (02/11/2026)
-- 1. aprobar_proyecto: al aprobar se puede arrancar cada desarrollo con su fecha de inicio
--    (inicios = { did: 'yyyy-mm-dd' }). Sin fecha queda Aprobado y no factura. Mismo flujo, sin uno nuevo.
-- 2. guardar_desarrollo: aprobado, en curso o en garantía ya no se edita (tampoco el ajuste IPC).
set role crm_giwa_dev;

drop function if exists crm_giwa.aprobar_proyecto(text, jsonb, jsonb);
create or replace function crm_giwa.aprobar_proyecto(pid text, decisiones jsonb, montos jsonb default '{}'::jsonb, inicios jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $function$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  e int := 0; r int := 0; w int := 0; a int := 0; k text; m numeric; f date;
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
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('aprobada'), fecha_aprobado = crm_giwa.hoy(), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'entro';
  get diagnostics e = row_count;
  if e = 0 then raise exception 'No marcaste ningún desarrollo como aprobado. Si no entró nada, usá No aceptar.'; end if;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('rechazada'), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'rechazado';
  get diagnostics r = row_count;
  update crm_giwa.desarrollos d set detenido = true
  where d.proyecto_id = p.id and decisiones ->> d.id = 'espera';
  get diagnostics w = row_count;
  update crm_giwa.proyectos set estado_id = 'Aprobado', probabilidad = 100, fecha_aprobacion = crm_giwa.hoy() where id = p.id;
  -- ¿Inicia ya? Fecha de inicio y arrancar, con las mismas funciones que «Arrancar»
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
                                || case when w > 0 then ', ' || w || ' en espera' else '' end);
end $function$;
grant execute on function crm_giwa.aprobar_proyecto(text, jsonb, jsonb, jsonb) to authenticated, service_role;

create or replace function crm_giwa.guardar_desarrollo(p jsonb)
returns jsonb language plpgsql as $function$
declare
  d crm_giwa.desarrollos := crm_giwa._desarrollo(p ->> 'id');
begin
  perform crm_giwa._desarrollo_editable(d);
  if crm_giwa.estado_canonico(d.estado_id) in ('aprobada', 'curso', 'garantia') then
    raise exception 'El desarrollo % está %: lo contratado no se edita. Si hay trabajo nuevo, cargalo como mejora o soporte.', d.id, d.estado_id;
  end if;
  if p ? 'titulo' and trim(coalesce(p ->> 'titulo', '')) = '' then raise exception 'Poné un título'; end if;
  update crm_giwa.desarrollos set
    titulo              = case when p ? 'titulo'        then trim(p ->> 'titulo') else titulo end,
    descripcion         = case when p ? 'descripcion'   then trim(coalesce(p ->> 'descripcion', '')) else descripcion end,
    tipo_id             = case when p ? 'tipo' and coalesce(p ->> 'tipo', '') <> '' then p ->> 'tipo' else tipo_id end,
    moneda              = case when p ? 'moneda'        then coalesce(nullif(p ->> 'moneda', ''), 'ARS') else moneda end,
    total_ars           = case when p ? 'total_ars'     then coalesce(nullif(p ->> 'total_ars', '')::numeric, 0) else total_ars end,
    total_usd           = case when p ? 'total_usd'     then coalesce(nullif(p ->> 'total_usd', '')::numeric, 0) else total_usd end,
    tipo_cambio         = case when p ? 'tc' and coalesce(nullif(p ->> 'tc', '')::numeric, 0) > 0 then (p ->> 'tc')::numeric else tipo_cambio end,
    q_cuotas            = case when p ? 'cuotas'        then coalesce(nullif(p ->> 'cuotas', '')::numeric, 0) else q_cuotas end,
    modelo_pago_id      = case when p ? 'modelo' and coalesce(p ->> 'modelo', '') <> '' then p ->> 'modelo' else modelo_pago_id end,
    ajuste              = case when p ? 'inflacion' and coalesce(p ->> 'inflacion', '') <> '' then p ->> 'inflacion' else ajuste end,
    valor_cuota_actual  = case when p ? 'cuota_act'     then coalesce(nullif(p ->> 'cuota_act', '')::numeric, 0) else valor_cuota_actual end,
    mantenimiento_horas = case when p ? 'mant_horas'    then coalesce(nullif(p ->> 'mant_horas', '')::numeric, 0) else mantenimiento_horas end,
    garantia_dias       = case when p ? 'garantia_dias' then coalesce(nullif(p ->> 'garantia_dias', '')::numeric, 0)::int else garantia_dias end,
    soporte_hora_ars    = case when p ? 'soporte_ars'   then coalesce(nullif(p ->> 'soporte_ars', '')::numeric, 0) else soporte_hora_ars end,
    soporte_hora_usd    = case when p ? 'soporte_usd'   then coalesce(nullif(p ->> 'soporte_usd', '')::numeric, 0) else soporte_hora_usd end
  where id = d.id;
  return jsonb_build_object('ok', true, 'id', d.id);
end $function$;

reset role;

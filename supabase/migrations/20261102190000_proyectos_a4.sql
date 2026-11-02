-- A4 · Proyectos (02/11/2026)
set role crm_giwa_dev;

-- 1. Dependencia entre desarrollos: bloque_de = número del desarrollo del que depende
--    (D-0022 → 22). Hoy no se usaba (tenía 1 en casi todos): se limpia.
update crm_giwa.desarrollos set bloque_de = null where bloque_de is not null;
comment on column crm_giwa.desarrollos.bloque_de is 'Depende de: número del desarrollo padre (D-0022 → 22). Mejoras, soportes y mantenimientos.';

create or replace function crm_giwa.depende_de(d crm_giwa.desarrollos)
returns boolean language sql immutable as $$
  select d.bloque_de is not null or coalesce(cardinality(d.mant_de), 0) > 0
$$;

-- 2. Aprobar: además de qué entró, el monto aprobado de cada desarrollo (puede corregirse, p. ej. por IPC)
drop function if exists crm_giwa.aprobar_proyecto(text, jsonb);
create or replace function crm_giwa.aprobar_proyecto(pid text, decisiones jsonb, montos jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $function$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  e int := 0; r int := 0; w int := 0; k text; m numeric;
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
  if e = 0 then raise exception 'No marcaste ningún desarrollo como aprobado. Si no entró nada, usá Rechazar.'; end if;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('rechazada'), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'rechazado';
  get diagnostics r = row_count;
  update crm_giwa.desarrollos d set detenido = true
  where d.proyecto_id = p.id and decisiones ->> d.id = 'espera';
  get diagnostics w = row_count;
  update crm_giwa.proyectos set estado_id = 'Aprobado', probabilidad = 100, fecha_aprobacion = crm_giwa.hoy() where id = p.id;
  return jsonb_build_object('ok', true, 'estado', 'Aprobado', 'entraron', e, 'rechazados', r, 'esperan', w,
    'msg', e || ' aprobado(s)' || case when r > 0 then ', ' || r || ' rechazado(s)' else '' end
                                || case when w > 0 then ', ' || w || ' en espera' else '' end);
end $function$;
grant execute on function crm_giwa.aprobar_proyecto(text, jsonb, jsonb) to authenticated, service_role;

-- 3. Edición: un desarrollo aprobado, en curso o en garantía sólo cambia el ajuste IPC
--    (antes lo frenaba sólo la pantalla). Las fechas van por fecha_desarrollo.
create or replace function crm_giwa.guardar_desarrollo(p jsonb)
returns jsonb language plpgsql as $function$
declare
  d crm_giwa.desarrollos := crm_giwa._desarrollo(p ->> 'id');
begin
  perform crm_giwa._desarrollo_editable(d);
  if crm_giwa.estado_canonico(d.estado_id) in ('aprobada', 'curso', 'garantia') then
    update crm_giwa.desarrollos set
      ajuste = case when p ? 'inflacion' and coalesce(p ->> 'inflacion', '') <> '' then p ->> 'inflacion' else ajuste end
    where id = d.id;
    return jsonb_build_object('ok', true, 'id', d.id, 'solo', 'ajuste');
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

-- 4. Pausar: sólo mejoras, soportes y mantenimientos que dependen de otro desarrollo (reanudar, siempre)
create or replace function crm_giwa.detener_desarrollo(did text, detener boolean)
returns jsonb language plpgsql as $function$
declare d crm_giwa.desarrollos := crm_giwa._desarrollo(did);
begin
  if coalesce(detener, false) and not crm_giwa.depende_de(d) then
    raise exception 'Sólo se pausan mejoras, soportes y mantenimientos que dependen de otro desarrollo. Para frenar todo, detené el proyecto.';
  end if;
  update crm_giwa.desarrollos set detenido = coalesce(detener, false) where id = d.id;
  return jsonb_build_object('ok', true, 'detenido', coalesce(detener, false));
end $function$;

-- 5. Alta de una mejora o un soporte: una línea simple, en Nuevo, que depende de un desarrollo del proyecto
--    p = { padre: 'D-0025', clase: 'mejora' | 'soporte', titulo, monto, moneda, horas }
create or replace function crm_giwa.alta_desarrollo(p jsonb)
returns jsonb language plpgsql as $function$
declare
  padre crm_giwa.desarrollos := crm_giwa._desarrollo(p ->> 'padre');
  soporte boolean := coalesce(p ->> 'clase', '') = 'soporte';
  tit text := trim(coalesce(p ->> 'titulo', ''));
  m numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  usd boolean := upper(coalesce(p ->> 'moneda', 'ARS')) = 'USD';
  hs numeric := nullif(p ->> 'horas', '')::numeric;
  tc numeric := coalesce((select valor from crm_giwa.v_tipo_cambio_hoy limit 1), 0);
  ars numeric; did text;
begin
  if tit = '' then raise exception 'Poné un título'; end if;
  if m <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  ars := case when usd then round(m * tc) else m end;
  did := crm_giwa.proximo_id('D', 'desarrollos', 4);
  insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                    modelo_pago_id, creador, duracion_horas, valor_hora, mant_de, bloque_de, detenido, bonificado, minuta)
  values (did, padre.proyecto_id, case when soporte then 'SOP' else padre.tipo_id end, tit, 'Nuevo',
          case when usd then 'USD' else 'ARS' end, ars, case when usd then m when tc > 0 then round(m / tc, 2) end, nullif(tc, 0), 1,
          case when soporte then 'FP-05' else 'FP-01' end, crm_giwa.mi_mail(), hs,
          case when coalesce(hs, 0) > 0 then round(ars / hs) end,
          case when soporte then array[padre.id] else '{}' end,
          nullif(regexp_replace(padre.id, '\D', '', 'g'), '')::int, false, false,
          jsonb_build_object('origen', case when soporte then 'Nuevo soporte' else 'Nueva mejora' end, 'padre', padre.id)::text);
  return jsonb_build_object('ok', true, 'id', did, 'msg', case when soporte then 'Soporte' else 'Mejora' end || ' ' || did || ' creado en Nuevo');
end $function$;
grant execute on function crm_giwa.alta_desarrollo(jsonb) to authenticated, service_role;

reset role;

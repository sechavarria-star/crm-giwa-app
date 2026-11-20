-- Editar proyecto · etapa 3 (19/11/2026)
-- 1) alta_desarrollo: además de mejora y soporte (con padre, sin cambios), clase 'desarrollo' = un desarrollo suelto
--    en un proyecto que ya existe, con la lógica de la Carga rápida: tipo, título, moneda, monto y forma de pago;
--    nace en Nuevo y sin horas (las semanas y el IPC los guarda la pantalla con desarrollo_semanas y desarrollo_ajuste).
-- 2) alta_abono: recibe además la moneda en que se cargó la cuota y las horas por mes. El abono se guarda siempre
--    en pesos (regla del Cotizador): en USD se convierte al TC del día y la cuota en dólares queda en la minuta.
--    En un proyecto que todavía no está aprobado el MMR nace en Nuevo (antes nacía Aprobado y contaba como contratado).
set role crm_giwa_dev;

create or replace function crm_giwa.alta_desarrollo(p jsonb) returns jsonb
language plpgsql as $function$
declare
  padre crm_giwa.desarrollos;
  clase text := coalesce(p ->> 'clase', '');
  soporte boolean := clase = 'soporte';
  tit text := trim(coalesce(p ->> 'titulo', ''));
  m numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  usd boolean := upper(coalesce(p ->> 'moneda', 'ARS')) = 'USD';
  hs numeric := nullif(p ->> 'horas', '')::numeric;
  tc numeric := coalesce((select valor from crm_giwa.v_tipo_cambio_hoy limit 1), 0);
  ars numeric; did text; pid text; tipo text; fp text; emp text; e jsonb;
begin
  if clase = 'desarrollo' then
    -- Desarrollo suelto (Editar proyecto · + Agregar desarrollo), como el desarrollo de la Carga rápida
    pid := nullif(trim(p ->> 'pid'), ''); tipo := nullif(trim(p ->> 'tipo'), ''); fp := nullif(trim(p ->> 'forma_pago'), '');
    select empresa_id into emp from crm_giwa.proyectos where id = pid;
    if pid is null or not found then raise exception 'No encontré el proyecto'; end if;
    if tipo is null then raise exception 'Falta el tipo de desarrollo'; end if;
    if m <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
    if fp is null then raise exception 'Falta la forma de pago'; end if;
    tc := coalesce(nullif(tc, 0), nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1);
    tit := coalesce(nullif(tit, ''), (select nombre from crm_giwa.tipos_desarrollo where id = tipo), tipo);
    ars := round(case when usd then m * tc else m end);
    e := crm_giwa.estimar_desarrollo(tipo, emp, '{}');
    did := crm_giwa.proximo_id('D', 'desarrollos', 4);
    insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                      modelo_pago_id, creador, tier_id, duracion_horas, valor_hora, mant_de, detenido, bonificado, minuta)
    values (did, pid, tipo, tit, nullif(trim(coalesce(p ->> 'descripcion', '')), ''), 'Nuevo', case when usd then 'USD' else 'ARS' end, ars, round(ars / tc, 2), tc,
            coalesce(nullif(p ->> 'cuotas', '')::numeric, 1), fp, crm_giwa.mi_mail(),
            case when (e ->> 'ok')::boolean then e ->> 'tier' end, null, null, '{}', false, false,
            jsonb_build_object('precio', ars, 'sugerido', case when (e ->> 'ok')::boolean then (e ->> 'total_ars')::numeric end, 'origen', 'Nuevo desarrollo')::text);
    return jsonb_build_object('ok', true, 'id', did, 'msg', 'Desarrollo ' || did || ' creado en Nuevo');
  end if;
  -- Mejora o soporte: igual que antes
  padre := crm_giwa._desarrollo(p ->> 'padre');
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
grant execute on function crm_giwa.alta_desarrollo(jsonb) to authenticated;

drop function crm_giwa.alta_abono(text, text, numeric, numeric, boolean, date);
create function crm_giwa.alta_abono(pid text, padre text, cuota numeric, meses numeric, ajuste boolean, inicio date default null,
                                     moneda text default 'ARS', horas numeric default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare did text; tc numeric := (select valor from crm_giwa.v_tipo_cambio_hoy limit 1);
  usd boolean := upper(coalesce(moneda, 'ARS')) = 'USD'; c_ars numeric;
  ganado boolean := (select crm_giwa.norm(estado_id) ~ '(aprob|activ|finaliz)' from crm_giwa.proyectos where id = pid);
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if coalesce(cuota, 0) <= 0 or coalesce(meses, 0) <= 0 then raise exception 'Cargá la cuota y los meses.'; end if;
  if usd and coalesce(tc, 0) <= 0 then raise exception 'No hay tipo de cambio del día para pasar la cuota a pesos.'; end if;
  if exists (select 1 from crm_giwa.desarrollos d where d.proyecto_id = pid and (d.tipo_id = 'MM' or d.modelo_pago_id = 'FP-03')
             and crm_giwa.norm(d.estado_id) !~ '(finaliz|rechaz|cancel|no acept)') then
    raise exception 'Este proyecto ya tiene un abono mensual activo: editá su cuota en vez de crear otro.';
  end if;
  c_ars := case when usd then round(cuota * tc, 2) else cuota end;
  did := crm_giwa.proximo_id('D', 'desarrollos', 4);
  insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, estado_id, moneda, total_ars, tipo_cambio, q_cuotas, valor_cuota_actual,
                                    modelo_pago_id, ajuste, mant_de, creador, detenido, bonificado, garantia_dias, fecha_aprobado, fecha_inicio,
                                    mantenimiento_horas, minuta)
  values (did, pid, 'MM', 'Mantenimiento Mensual' || coalesce(' · ' || (select titulo from crm_giwa.desarrollos where id = padre), ''),
          case when coalesce(ganado, false) then 'Aprobado' else 'Nuevo' end, 'ARS',
          round(c_ars * meses, 2), tc, meses, c_ars, 'FP-03', case when ajuste then 'Ajuste' else 'Sin Ajuste' end,
          case when coalesce(padre, '') = '' then '{}' else array[padre] end, crm_giwa.mi_mail(), false, false, 0,
          case when coalesce(ganado, false) then crm_giwa.hoy() end, inicio, horas,
          (jsonb_build_object('semanas', round(meses * 52 / 12)) || case when usd then jsonb_build_object('moneda_carga', 'USD', 'cuota_usd', cuota) else '{}'::jsonb end)::text);
  return jsonb_build_object('ok', true, 'id', did);
end $function$;
grant execute on function crm_giwa.alta_abono(text, text, numeric, numeric, boolean, date, text, numeric) to authenticated, crm_giwa_dev, service_role;   -- los mismos permisos que tenía
revoke execute on function crm_giwa.alta_abono(text, text, numeric, numeric, boolean, date, text, numeric) from public, anon;

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cotizador: borrar prospectos completos y análisis económico · 12/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- 1) cot_borrar: además de los desarrollos, borra las tareas (alertas incluidas)
--    y los comentarios del proyecto y de sus desarrollos. Si tiene archivos
--    entregados o soporte, avisa y no borra.
-- 2) cot_analisis(o): referencia de mercado (Valores de mercado), alertas y la
--    sugerencia de abono. Lo usan el Cotizador y la ficha de Proyectos.
--    o = { tipo, horas, precio, abono, mant_hs, vh, extra_mes }
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.cot_borrar(pid text)
 returns jsonb
 language plpgsql
as $function$
declare p crm_giwa.proyectos; n int := 0; did text; ds text[];
begin
  select * into p from crm_giwa.proyectos where id = pid;
  if p.id is null then raise exception 'No existe %', pid; end if;
  if not crm_giwa._cot_editable(p.estado_id) then raise exception 'Ya está aprobado: no se borra desde el Cotizador'; end if;
  if exists (select 1 from crm_giwa.desarrollos d where d.proyecto_id = pid and crm_giwa.estado_canonico(d.estado_id) <> 'nueva' and crm_giwa.estado_canonico(d.estado_id) <> 'rechazada') then
    raise exception 'Tiene desarrollos aprobados: no se borra';
  end if;
  if exists (select 1 from crm_giwa.cobros where proyecto_id = pid) then raise exception 'Tiene cobros cargados: no se borra'; end if;
  select coalesce(array_agg(id), '{}') into ds from crm_giwa.desarrollos where proyecto_id = pid;
  if exists (select 1 from crm_giwa.entregables where proyecto_id = pid or desarrollo_id = any(ds)) then
    raise exception 'Tiene archivos entregados: no se borra. Quitá los archivos primero o pasalo a No aceptado.';
  end if;
  if exists (select 1 from crm_giwa.soporte_tickets where proyecto_id = pid or desarrollo_id = any(ds))
     or exists (select 1 from crm_giwa.soporte_reportes where desarrollo_id = any(ds))
     or exists (select 1 from crm_giwa.soporte_facturado where desarrollo_id = any(ds) or sop_id = any(ds)) then
    raise exception 'Tiene soporte cargado: no se borra';
  end if;
  -- tareas y alertas, con sus comentarios; después los comentarios sueltos del proyecto
  delete from crm_giwa.comentarios where tarea_id in (select id from crm_giwa.tareas where proyecto_id = pid or desarrollo_id = any(ds));
  delete from crm_giwa.tareas where proyecto_id = pid or desarrollo_id = any(ds);
  delete from crm_giwa.comentarios where proyecto_id = pid or desarrollo_id = any(ds);
  delete from crm_giwa.proyecto_costos where proyecto_id = pid;
  delete from crm_giwa.proyecto_horas where proyecto_id = pid;
  foreach did in array ds loop perform crm_giwa._cot_borrar_des(did); n := n + 1; end loop;
  delete from crm_giwa.proyectos where id = pid;
  return jsonb_build_object('ok', true, 'pid', pid, 'desarrollos', n);
end $function$;

create or replace function crm_giwa.cot_analisis(o jsonb)
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  v_tipo text := upper(coalesce(o ->> 'tipo', ''));
  hs numeric := coalesce((o ->> 'horas')::numeric, 0);
  precio numeric := coalesce((o ->> 'precio')::numeric, 0);
  abono numeric := coalesce((o ->> 'abono')::numeric, 0);
  mhs numeric := coalesce((o ->> 'mant_hs')::numeric, 0);
  vh numeric := coalesce((o ->> 'vh')::numeric, 0);
  extra numeric := coalesce((o ->> 'extra_mes')::numeric, 0);
  tc numeric := crm_giwa._cot_tc();
  costo_h numeric := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_costo_ars'));
  vh_sop numeric := crm_giwa._cot_vh_soporte();
  v_rol text; m crm_giwa.mercado_referencias; mer jsonb := null; al jsonb := '[]'; su jsonb := '[]';
  costo_mes numeric; costo numeric; usd_h numeric;
begin
  v_rol := case v_tipo when 'IA' then 'Agentes IA / RAG / Voice AI · Semi Senior'
                   when 'BOT' then 'Chatbots / WhatsApp · Semi Senior'
                   when 'AUT' then 'Automatizaciones / n8n / Make · Semi Senior'
                   when 'APP' then 'Full Stack / Web Apps · Semi Senior'
                   when 'BI' then 'Data / BI / Dashboards · Semi Senior'
                   when 'SS' then 'Project Manager técnico · Semi Senior'
                   when 'IT' then 'DevOps / Cloud · Semi Senior' end;
  costo := round(hs * costo_h);
  costo_mes := round(mhs * costo_h + extra);
  if v_rol is not null and hs > 0 and tc > 0 then
    select m2.* into m from crm_giwa.mercado_referencias m2 where m2.tipo = 'venta' and m2.rol = v_rol order by fecha desc limit 1;
    if m.id is not null then
      usd_h := case when precio > 0 then round(precio / hs / tc, 1) end;
      mer := jsonb_build_object('rol', split_part(v_rol, ' · ', 1), 'fuente', m.fuente, 'fecha', m.fecha,
        'usd_min', m.valor_min, 'usd_max', m.valor_max, 'ars_min', round(m.valor_min * hs * tc), 'ars_max', round(m.valor_max * hs * tc),
        'usd_hora', usd_h, 'posicion', case when usd_h is null then null when usd_h < m.valor_min then 'debajo' when usd_h > m.valor_max then 'encima' else 'dentro' end);
      if usd_h is not null and usd_h < m.valor_min then
        al := al || jsonb_build_object('nivel', 'pendiente', 'texto', 'El precio queda por debajo del mercado', 'monto', round(m.valor_min * hs * tc) - precio, 'mensual', false);
      end if;
    end if;
  end if;
  if precio > 0 and costo > 0 and precio < costo then
    al := al || jsonb_build_object('nivel', 'error', 'texto', 'El precio no cubre el costo interno', 'monto', precio - costo, 'mensual', false);
  end if;
  if abono > 0 and abono < costo_mes then
    al := al || jsonb_build_object('nivel', 'error', 'texto', 'El abono no cubre su costo: la hora de soporte es menor que la interna', 'monto', abono - costo_mes, 'mensual', true,
      'sop', vh_sop, 'costo_h', costo_h);
    su := su || jsonb_build_object('tipo', 'sumar', 'texto', 'Subir el abono para cubrir su costo', 'a', costo_mes, 'monto', costo_mes - abono, 'mensual', true);
  end if;
  if vh > 0 and costo_h > 0 and vh <= costo_h * 1.01 then
    al := al || jsonb_build_object('nivel', 'pendiente', 'texto', 'El Tier vende a costo: la hora de venta queda igual a la interna', 'monto', round(vh - costo_h), 'mensual', false);
  end if;
  return jsonb_build_object('mercado', mer, 'alertas', al, 'sugerencias', su, 'costo', costo, 'costo_mes', costo_mes,
    'costo_h', costo_h, 'vh_sop', vh_sop, 'tc', tc);
end $function$;

grant execute on function crm_giwa.cot_analisis(jsonb) to authenticated;

reset role;

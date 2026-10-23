-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · «Nuevo recordatorio» (regla de alerta) · etapa 5d · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Tareas.gs, con las mismas reglas:
--   v_alertas_elegibles      _alertEligibility + lo que arma getTaskForm para
--                            el formulario: por desarrollo, si le queda algo
--                            por facturar (pending), si es un abono renovable
--                            (en curso y vence en ≤ 2 meses), inicio y cuotas
--   nueva_regla_alerta(p)    saveAlertRule (sólo Administración)
--   ipc_ventana(fecha)       getIpcWindow: el IPC que se aplica a una fecha de
--                            facturación según ipc_meses_atras / _ventana
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_alertas_elegibles with (security_invoker = true) as
with pend as (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos)
select d.id as item_id, d.proyecto_id as proy_id, p.empresa_id as cliente_id,
       coalesce(nullif(d.titulo, ''), nullif(d.tipo_id, ''), d.id) as nombre,
       d.fecha_inicio as inicio, coalesce(d.q_cuotas, 0) as cuotas,
       coalesce(vp.es_facturable, false) as facturable,
       d.id in (select item_id from pend) as pending,
       d.id in (select item_id from pend)
         and crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id)
         and coalesce((select z.ejecutandose from crm_giwa.desarrollo_estados z
                       where crm_giwa.estado_canonico(z.id) = crm_giwa.estado_canonico(d.estado_id) order by z.orden desc limit 1),
                      crm_giwa.estado_canonico(d.estado_id) in ('curso', 'garantia'))
         and crm_giwa.fin_contrato(d.id) between crm_giwa.hoy() and (crm_giwa.hoy() + interval '2 months')::date as renewable,
       d.orden
from crm_giwa.desarrollos d
left join crm_giwa.proyectos p on p.id = d.proyecto_id
left join crm_giwa.v_desarrollos_plata vp on vp.id = d.id;

-- ── venc_de, ahora tolerando mes 12 = enero del año siguiente (como new Date(y, 12, d)) ──
create or replace function crm_giwa.venc_de(periodo_key text, dia int) returns date
language sql immutable as $$
  select (b + make_interval(days => least(greatest(coalesce(dia, 1), 1),
                                          extract(day from (b + interval '1 month - 1 day'))::int) - 1))::date
  from (select (make_date(split_part(periodo_key, '-', 1)::int, 1, 1)
                + make_interval(months => split_part(periodo_key, '-', 2)::int))::date as b) s
  where periodo_key ~ '^\d{4}-\d{1,2}$'
$$;

-- ── el primer aviso y los días de anticipación (_alertWindow) ──
create or replace function crm_giwa.ventana_alerta(inicio date, frecuencia text, dia_desde int, dia_hasta int,
                                                    out due date, out aviso int)
language plpgsql stable as $$
declare hoy date := crm_giwa.hoy(); g int := 0; n date;
begin
  if coalesce(dia_desde, 0) >= 1 and dia_hasta >= dia_desde and dia_hasta <= 31 then
    due := make_date(extract(year from inicio)::int, extract(month from inicio)::int,
                     least(dia_hasta, extract(day from (date_trunc('month', inicio) + interval '1 month - 1 day'))::int));
    if due < inicio then due := crm_giwa.venc_de(extract(year from inicio)::int || '-' || extract(month from inicio)::int, dia_hasta); end if;
    while due < hoy and g < 400 loop
      due := crm_giwa.venc_de(extract(year from due)::int || '-' || extract(month from due)::int, dia_hasta); g := g + 1;
    end loop;
    aviso := dia_hasta - dia_desde;
    return;
  end if;
  due := coalesce(crm_giwa.proxima_fecha(inicio, frecuencia), inicio);
  while due < hoy and g < 400 loop
    n := crm_giwa.proxima_fecha(due, frecuencia); exit when n is null; due := n; g := g + 1;
  end loop;
  aviso := coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5)::int;
end $$;

-- ── saveAlertRule · p = { type, clientId, projectIds, itemIds, start, months, frequency,
--                        dayFrom, dayTo, assignees, detail } ──
create or replace function crm_giwa.nueva_regla_alerta(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  tipo text := trim(coalesce(p ->> 'type', '')); cid text := trim(coalesce(p ->> 'clientId', ''));
  inicio date := nullif(p ->> 'start', '')::date; meses int := coalesce(round(crm_giwa.num(p ->> 'months'))::int, 0);
  frec text := coalesce(nullif(trim(p ->> 'frequency'), ''), 'Mensual');
  iids text[] := crm_giwa.lista_csv(p ->> 'itemIds'); pids text[] := crm_giwa.lista_csv(p ->> 'projectIds');
  renov boolean := tipo ~* 'renov'; malos text; fin date; w record; nid text; resp text;
begin
  if not crm_giwa.es_admin() then raise exception 'Las alertas son de Administración.'; end if;
  if tipo = '' then raise exception 'Elegí el tipo de alerta.'; end if;
  if cid = '' then raise exception 'Elegí el cliente.'; end if;
  if inicio is null then raise exception 'Falta la fecha desde.'; end if;
  -- _alertBlocked: si no queda nada para facturar, no lleva alerta
  if cardinality(iids) > 0 then
    select string_agg(i, ', ') into malos from unnest(iids) i
    where not exists (select 1 from crm_giwa.v_alertas_elegibles e where e.item_id = i and e.pending and (not renov or e.renewable));
    if malos is not null then
      if renov then raise exception 'Renovación solo para abonos en curso con 2 meses o menos: %', malos;
      else raise exception 'Ya está todo facturado en %: no lleva alerta.', malos; end if;
    end if;
  elsif cardinality(pids) > 0 then
    if not exists (select 1 from crm_giwa.v_alertas_elegibles e where e.proy_id = any (pids) and e.pending and (not renov or e.renewable)) then
      if renov then raise exception 'Ese proyecto no tiene abonos para renovar.';
      else raise exception 'Ese proyecto ya está todo facturado: no lleva alerta.'; end if;
    end if;
  end if;
  fin := case when meses > 0 then (inicio + make_interval(months => meses))::date else crm_giwa.fin_contrato(iids[1]) end;
  select * into w from crm_giwa.ventana_alerta(inicio, frec, round(crm_giwa.num(p ->> 'dayFrom'))::int, round(crm_giwa.num(p ->> 'dayTo'))::int);
  if fin is not null and w.due > fin then raise exception 'El primer aviso (%) cae después de la fecha fin.', w.due; end if;
  resp := coalesce(nullif(split_part(crm_giwa.norm_mails(p ->> 'assignees'), ', ', 1), ''), crm_giwa.mail_admin(), '');
  nid := crm_giwa._alta_tarea(jsonb_build_object('type', 'Administración', 'alertType', tipo,
    'title', tipo || ' · ' || coalesce((select nombre from crm_giwa.empresas where id = cid), cid),
    'detail', trim(coalesce(p ->> 'detail', '')), 'projectId', array_to_string(pids, ', '), 'itemIds', array_to_string(iids, ', '),
    'clientId', cid, 'priority', 'Media', 'assignees', resp, 'due', w.due,
    'duration', case when meses > 0 then meses::text else '' end, 'end', fin, 'frequency', frec, 'reminder', w.aviso::text));
  return jsonb_build_object('ok', true, 'id', nid, 'due', w.due);
end $$;

-- ── getIpcWindow: el IPC de los meses que se aplican a una fecha de facturación ──
create or replace function crm_giwa.ipc_ventana(fecha date) returns jsonb
language plpgsql stable as $$
declare
  atras int := coalesce(crm_giwa.umbral('ipc_meses_atras', 4), 4)::int;
  ventana int := coalesce(crm_giwa.umbral('ipc_meses_ventana', 3), 3)::int;
  i int; m date; v numeric; meses jsonb := '[]'; faltan text[] := '{}'; factor numeric := 1;
begin
  fecha := coalesce(fecha, crm_giwa.hoy());
  for i in 0 .. ventana - 1 loop
    m := (date_trunc('month', fecha) - make_interval(months => atras) + make_interval(months => i))::date;
    select ipc into v from crm_giwa.indices_ipc where mes = m;
    if coalesce(v, 0) = 0 then faltan := faltan || to_char(m, 'YYYY-MM'); continue; end if;
    factor := factor * (1 + v / 100);
    meses := meses || jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'pct', v);
  end loop;
  if cardinality(faltan) > 0 then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(faltan), 'msg', 'Todavía no está publicado el IPC de ' || array_to_string(faltan, ', '));
  end if;
  return jsonb_build_object('ok', true, 'months', meses, 'factor', factor, 'pct', round((factor - 1) * 10000) / 100);
end $$;

grant select on crm_giwa.v_alertas_elegibles to authenticated, service_role;
grant execute on function crm_giwa.ventana_alerta(date, text, int, int), crm_giwa.nueva_regla_alerta(jsonb), crm_giwa.ipc_ventana(date) to authenticated, service_role;

reset role;

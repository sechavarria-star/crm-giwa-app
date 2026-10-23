-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · recordatorios de Administración · etapa 5d · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Tareas.gs, con las mismas reglas:
--   v_recordatorios_faltan          crearRecordatorios(false).rows: qué falta crear
--   crear_recordatorios(w, item)    crearRecordatorios(true, windows, onlyItem)
--   sincronizar_alertas_facturacion sincronizarAlertasFacturacion: crea las de
--                                   Facturación que faltan y cierra las que ya no
--                                   tienen nada para facturar
-- accion_desarrollo los llama al terminar, como accionDesarrollo.
--
-- Se lee la tabla tareas directo (no v_tareas): v_tareas esconde lo
-- administrativo a quien no es Admin, y acá hay que ver todo para no duplicar.
--
-- Rareza copiada tal cual (avisada): «Ajuste IPC» pide un estado que lleve IPC
-- (Desarrollo_Estados · AjusteIPC: Nuevo y Aprobado) Y que se esté ejecutando
-- (En Curso y En Garantía). Ninguno cumple las dos: hoy no se crea nunca.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── _fixRefs: proyecto y desarrollo de una tarea (a veces vienen al revés) ──
create or replace function crm_giwa.refs_tarea(proyecto_id text, desarrollo_id text, out pids text[], out iids text[])
language sql immutable as $$
  with r as (select crm_giwa.lista_csv(proyecto_id) p0, crm_giwa.lista_csv(desarrollo_id) i0)
  select case when x then i0 else p0 end, case when x then p0 else i0 end
  from r, lateral (select cardinality(p0) > 0 and cardinality(i0) > 0
                          and not exists (select 1 from unnest(p0) a where a !~* '^D-')
                          and not exists (select 1 from unnest(i0) a where a !~* '^P-') as x) s
$$;

-- ── fin del contrato de un desarrollo (_contractEnd) ──
create or replace function crm_giwa.fin_contrato(did text) returns date
language sql stable as $$
  select coalesce(d.fecha_fin, case when d.fecha_inicio is not null and coalesce(d.q_cuotas, 0) > 0
                                    then (d.fecha_inicio + make_interval(months => d.q_cuotas::int))::date end)
  from crm_giwa.desarrollos d where d.id = trim(split_part(coalesce(did, ''), ',', 1))
$$;

-- ── el día «dia» del período 'AAAA-M' (mes desde 0), sin pasarse del mes (_vencDe) ──
create or replace function crm_giwa.venc_de(periodo_key text, dia int) returns date
language sql immutable as $$
  select make_date(y, m + 1, least(greatest(coalesce(dia, 1), 1),
                   extract(day from (make_date(y, m + 1, 1) + interval '1 month - 1 day'))::int))
  from (select split_part(periodo_key, '-', 1)::int y, split_part(periodo_key, '-', 2)::int m) s
  where periodo_key ~ '^\d{4}-\d{1,2}$'
$$;

-- ── las reglas de Facturación abiertas, por desarrollo (_facturaRules) ──
create or replace view crm_giwa.v_reglas_facturacion with (security_invoker = true) as
select t.id, (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] as item, t.vencimiento as due, t.orden
from crm_giwa.tareas t
where coalesce(trim(t.id), '') <> '' and coalesce(t.tipo, '') ~* 'administr'
  and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = 'factur'
  and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
  and (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] is not null;

-- ── cobertura (_facturaCoverage): la ventana de cada cliente y los desarrollos
--    cubiertos por una regla de Facturación a nivel proyecto o cliente ──
create or replace view crm_giwa.v_cobertura_facturacion with (security_invoker = true) as
with fa as (
  select t.*, r.pids, r.iids,
         coalesce(nullif(trim(t.cliente), ''), (select p.empresa_id from crm_giwa.proyectos p where p.id = r.pids[1]), '') as cid
  from crm_giwa.tareas t, lateral crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id) r
  where coalesce(trim(t.id), '') <> '' and coalesce(t.tipo, '') ~* 'administr'
    and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
    and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = 'factur'
),
ventana as (                               -- la primera (en orden de la hoja) con vencimiento
  select distinct on (cid) cid, extract(day from vencimiento)::int as hasta, crm_giwa.num(recordatorio) as aviso
  from fa where cid <> '' and vencimiento is not null order by cid, orden
),
cub as (
  select distinct d.id as item
  from fa
  join crm_giwa.proyectos p on (cardinality(fa.pids) > 0 and p.id = any (fa.pids))
                            or (cardinality(fa.pids) = 0 and fa.cid <> '' and p.empresa_id = fa.cid)
  join crm_giwa.desarrollos d on d.proyecto_id = p.id
  where cardinality(fa.iids) = 0
)
select 'ventana' as tipo, cid, null::text as item, hasta, aviso from ventana
union all
select 'cubierto', null, item, null, null from cub;

-- ── crearRecordatorios(false): lo que falta crear ──
create or replace view crm_giwa.v_recordatorios_faltan with (security_invoker = true) as
with
reglas as (select distinct item from crm_giwa.v_reglas_facturacion),
cub as (select item from crm_giwa.v_cobertura_facturacion where tipo = 'cubierto'),
ven as (select cid, hasta, aviso from crm_giwa.v_cobertura_facturacion where tipo = 'ventana'),
abiertas as (
  select t.*, (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids as iids
  from crm_giwa.tareas t
  where coalesce(trim(t.id), '') <> '' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
),
reu as (select distinct cliente from abiertas where coalesce(tipo, '') ~* 'reuni' and coalesce(frecuencia, '') ~* 'mensual'),
op as (                                    -- IPC y Renovación abiertos, por desarrollo
  select crm_giwa.cat_admin(a.titulo, a.alerta_tipo) as cat, i as item
  from abiertas a, unnest(a.iids) i
  where coalesce(a.tipo, '') ~* 'administr' and not (coalesce(a.tipo, '') ~* 'reuni' and coalesce(a.frecuencia, '') ~* 'mensual')
    and crm_giwa.cat_admin(a.titulo, a.alerta_tipo) in ('ipc', 'renov')
),
pend as (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos),
d as (
  select x.*, p.empresa_id as cid,
         case when coalesce(p.empresa_id, '') = '' then '' else coalesce(e.nombre, p.empresa_id) end as cliente,
         coalesce(nullif(x.titulo, ''), x.id) as tit,
         crm_giwa.estado_canonico(x.estado_id) as canon,
         coalesce(de.ajuste_ipc, crm_giwa.estado_canonico(x.estado_id) in ('curso', 'garantia')) as lleva_ipc,
         coalesce(de.ejecutandose, crm_giwa.estado_canonico(x.estado_id) in ('curso', 'garantia')) as ejecutando,
         crm_giwa.es_mantenimiento(x.modelo_pago_id, x.tipo_id) as es_mant
  from crm_giwa.desarrollos x
  left join crm_giwa.proyectos p on p.id = x.proyecto_id
  left join crm_giwa.empresas e on e.id = p.empresa_id
  left join lateral (select * from crm_giwa.desarrollo_estados z where crm_giwa.estado_canonico(z.id) = crm_giwa.estado_canonico(x.estado_id)
                     order by z.orden desc limit 1) de on true
  where coalesce(x.id, '') <> ''
),
fm as (                                    -- abonos del mes sin regla
  select m.*, coalesce(p.empresa_id, '') as cid, v.hasta, v.aviso
  from crm_giwa.v_facturar_mensuales m
  left join crm_giwa.proyectos p on p.id = m.proy_id
  left join ven v on v.cid = p.empresa_id
  where m.item_id not in (select item from reglas) and m.item_id not in (select item from cub)
),
filas as (
  select 1 as o, 'Facturación' as kind, fm.item_id as item, fm.proy_id as pid, fm.cid, fm.empresa as cliente, fm.titulo,
         'Mensual' as freq, fm.periodo_key as periodo,
         case when fm.hasta is null then 1 else greatest(1, fm.hasta - coalesce(fm.aviso, 0)::int) end as desde,
         coalesce(fm.hasta, 5) as hasta, crm_giwa.fin_contrato(fm.item_id) as fin, null::date as due, null::date as base,
         null::numeric as saldo, false as aprobado, fm.orden as ord
  from fm
  union all
  select 2, 'Facturación', s.item_id, s.proy_id, coalesce(p.empresa_id, ''), s.empresa, s.titulo, 'Única', null, null, null, null,
         crm_giwa.hoy(), null, s.saldo, false, s.orden
  from crm_giwa.v_facturar_saldos s left join crm_giwa.proyectos p on p.id = s.proy_id
  where s.item_id not in (select item from reglas) and s.item_id not in (select item from cub)
  union all
  select 3, 'Ajuste IPC', d.id, d.proyecto_id, d.cid, d.cliente, d.tit, 'Trimestral', null, null, null, crm_giwa.fin_contrato(d.id),
         (coalesce(d.fecha_ajuste_cuota, d.fecha_inicio) + interval '3 months')::date, coalesce(d.fecha_ajuste_cuota, d.fecha_inicio),
         null, false, d.orden
  from d
  where d.id not in (select item from op where cat = 'ipc')
    and crm_giwa.norm(d.ajuste) ~ 'ajuste' and crm_giwa.norm(d.ajuste) !~ 'sin'
    and d.lleva_ipc and d.ejecutando and not coalesce(d.detenido, false) and not coalesce(d.bonificado, false)
    and coalesce(d.fecha_ajuste_cuota, d.fecha_inicio) is not null
  union all
  select 4, 'Renovación', d.id, d.proyecto_id, d.cid, d.cliente, d.tit, 'Única', null, null, null, null,
         crm_giwa.fin_contrato(d.id), null, null, false, d.orden
  from d
  where d.id not in (select item from op where cat = 'renov')
    and d.id in (select item_id from pend) and d.es_mant and d.ejecutando
    and crm_giwa.fin_contrato(d.id) between crm_giwa.hoy() and (crm_giwa.hoy() + interval '2 months')::date
  union all
  select 5, 'Facturación', d.id, d.proyecto_id, d.cid, d.cliente, d.tit, 'Única', null, null, null, null,
         crm_giwa.hoy(), null, null, true, d.orden
  from d
  where d.canon = 'aprobada' and not coalesce(d.bonificado, false)
    and d.id not in (select item from reglas) and d.id not in (select item from cub)
    and d.id not in (select item_id from fm) and d.id not in (select item_id from crm_giwa.v_facturar_saldos)
  union all
  -- reunión mensual: el 16, con el primer abono en curso del cliente que no tenga una abierta
  select 6, 'Reunión mensual', x.id, '', x.cid, x.cliente, 'Mantenimiento', 'Mensual', null, null, null, null,
         (select min(g)::date from generate_series(make_date(extract(year from x.fecha_inicio)::int, extract(month from x.fecha_inicio)::int, 16),
                                                   crm_giwa.hoy() + interval '1 month', interval '1 month') g where g >= crm_giwa.hoy()),
         null, null, false, x.orden
  from (select distinct on (d.cid) d.* from d
        where coalesce(d.cid, '') <> '' and d.es_mant and d.canon = 'curso' and d.fecha_inicio is not null
          and d.cid not in (select coalesce(cliente, '') from reu)
        order by d.cid, d.fecha_inicio, d.orden) x
)
select kind, item, coalesce(pid, '') as pid, coalesce(cid, '') as cid, coalesce(cliente, '') as cliente, coalesce(titulo, '') as titulo,
       freq, periodo, desde as "from", hasta as "to", fin as "end", due, base, saldo, aprobado, o, ord
from filas;

-- ── _appendTask, ahora con recordatorio, fin y duración a mano ──
create or replace function crm_giwa._alta_tarea(o jsonb) returns text
language plpgsql volatile as $$
declare
  tipo  text := coalesce(nullif(trim(o ->> 'type'), ''), 'Tarea');
  adm   boolean := tipo ~* 'administr';
  pids  text := array_to_string(crm_giwa.lista_csv(o ->> 'projectId'), ', ');
  cid   text := nullif(trim(o ->> 'clientId'), '');
  resp  text := split_part(crm_giwa.norm_mails(o ->> 'assignees'), ', ', 1);
  canal text := '';
  frec  text := nullif(trim(o ->> 'frequency'), '');
  rec   text;
  nid   text;
  cfg   text;
begin
  if cid is null and pids <> '' then
    select empresa_id into cid from crm_giwa.proyectos where id = split_part(pids, ', ', 1);
  end if;
  if resp = '' then resp := crm_giwa.mi_mail(); end if;               -- un solo responsable
  if adm then
    select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_CanalEnvio';
    canal := coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'intern' limit 1), 'interno') || ', ' ||
             coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'telegram' limit 1), 'telegram');
  elsif frec is null then
    select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_Frecuencia';
    frec := (select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where crm_giwa.norm(trim(x)) = 'unica' limit 1);
  end if;
  rec := case when o ? 'reminder' then nullif(o ->> 'reminder', '')
              when adm then coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5)::text end;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  nid := crm_giwa.proximo_id('T', 'tareas', 4);
  insert into crm_giwa.tareas (id, proyecto_id, desarrollo_id, cliente, tipo, titulo, descripcion, responsable, prioridad,
                               estado, fecha_creacion, vencimiento, fin, duracion, frecuencia, recordatorio, canal_envio, enviada,
                               origen, contactos, alerta_tipo, creador)
  values (nid, nullif(pids, ''), nullif(array_to_string(crm_giwa.lista_csv(o ->> 'itemIds'), ', '), ''), cid, tipo,
          trim(coalesce(o ->> 'title', '')), trim(coalesce(o ->> 'detail', '')), resp,
          coalesce(nullif(trim(o ->> 'priority'), ''), 'Media'), 'Nueva', crm_giwa.hoy(), nullif(o ->> 'due', '')::date,
          nullif(o ->> 'end', '')::date, nullif(o ->> 'duration', '')::numeric,
          frec, rec, nullif(canal, ''), false, nullif(trim(o ->> 'origin'), ''),
          nullif(array_to_string(crm_giwa.lista_csv(o ->> 'contacts'), ', '), ''), nullif(trim(o ->> 'alertType'), ''), crm_giwa.mi_mail());
  return nid;
end $$;

-- el primer usuario de Administración (_adminMails; un solo responsable)
create or replace function crm_giwa.mail_admin() returns text
language sql stable security definer set search_path = crm_giwa, pg_temp as $$
  select crm_giwa.norm_mail(mail) from crm_giwa.usuarios where es_giwa and rol ~* 'admin' order by orden limit 1
$$;

-- ── crearRecordatorios(true, windows, onlyItem) ──
-- windows = { "D-0005": {from, to}, "meet:EMP-004": {due} } (opcional)
create or replace function crm_giwa.crear_recordatorios(ventanas jsonb default '{}', solo_item text default null) returns jsonb
language plpgsql volatile as $$
declare
  x record; n int := 0; w jsonb; d1 int; d2 int; rem int; cid_of text; o jsonb; adm text := coalesce(crm_giwa.mail_admin(), '');
begin
  ventanas := coalesce(ventanas, '{}');
  rem := coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5)::int;
  if nullif(trim(solo_item), '') is not null then
    select cid into cid_of from crm_giwa.v_recordatorios_faltan where item = trim(solo_item) limit 1;
    if cid_of is null then
      select p.empresa_id into cid_of from crm_giwa.desarrollos d join crm_giwa.proyectos p on p.id = d.proyecto_id where d.id = trim(solo_item);
    end if;
  end if;
  for x in select * from crm_giwa.v_recordatorios_faltan order by o, ord loop
    if nullif(trim(solo_item), '') is not null and not (case when x.kind = 'Reunión mensual' then x.cid = coalesce(cid_of, '') else x.item = trim(solo_item) end) then
      continue;
    end if;
    if x.kind = 'Reunión mensual' then
      w := ventanas -> ('meet:' || x.cid);
      perform crm_giwa._alta_tarea(jsonb_build_object('type', 'Reunión', 'title', 'Reunión mensual de mantenimiento · ' || x.cliente,
        'detail', 'Reunión mensual con el cliente por el mantenimiento.', 'clientId', x.cid, 'priority', 'Media', 'frequency', 'Mensual',
        'assignees', adm,
        'due', case when coalesce(w ->> 'due', '') ~ '^\d{4}-\d{2}-\d{2}$' then w ->> 'due' else x.due::text end));
      n := n + 1; continue;
    end if;
    o := jsonb_build_object('type', 'Administración', 'alertType', x.kind, 'title', x.kind || ' · ' || x.cliente || ' · ' || x.titulo,
           'projectId', x.pid, 'clientId', x.cid, 'itemIds', x.item, 'priority', 'Media', 'assignees', adm,
           'frequency', x.freq, 'reminder', rem::text);
    if x.kind = 'Facturación' and x.freq = 'Mensual' then
      w := ventanas -> x.item;
      d1 := coalesce(round(crm_giwa.num(w ->> 'from'))::int, 0); d2 := coalesce(round(crm_giwa.num(w ->> 'to'))::int, 0);
      if d1 = 0 then d1 := x."from"; end if; if d2 = 0 then d2 := x."to"; end if;
      if not (d1 >= 1 and d2 >= d1 and d2 <= 31) then d1 := x."from"; d2 := x."to"; end if;
      o := o || jsonb_build_object('detail', 'Abono mensual: se factura del ' || d1 || ' al ' || d2 || '. El monto sale del cálculo de facturación.',
                                   'due', crm_giwa.venc_de(x.periodo, d2), 'reminder', (d2 - d1)::text, 'end', x."end");
    elsif x.kind = 'Facturación' then
      o := o || jsonb_build_object('detail', case when x.aprobado then 'Aprobado: facturar el anticipo o la primera cuota.' else 'Saldo del desarrollo.' end
                                             || ' El monto sale del cálculo de facturación.', 'due', x.due);
    elsif x.kind = 'Ajuste IPC' then
      o := o || jsonb_build_object('detail', 'Ajuste trimestral de la cuota por IPC. Base: ' || x.base || '.', 'due', x.due, 'end', x."end");
    else
      o := o || jsonb_build_object('detail', 'El contrato vence el ' || coalesce(x.due::text, '') || '. Renovar o finalizar.', 'due', x.due);
    end if;
    perform crm_giwa._alta_tarea(o);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'creadas', n, 'msg', n || ' recordatorio(s) creados.');
end $$;

-- ── sincronizarAlertasFacturacion ──
create or replace function crm_giwa.sincronizar_alertas_facturacion() returns jsonb
language plpgsql volatile as $$
declare
  x record; creadas int := 0; cerradas int := 0; adm text := coalesce(crm_giwa.mail_admin(), ''); rem int; h int; a int;
begin
  rem := coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5)::int;
  for x in select m.*, p.empresa_id as cid from crm_giwa.v_facturar_mensuales m left join crm_giwa.proyectos p on p.id = m.proy_id
           where m.item_id not in (select item from crm_giwa.v_reglas_facturacion)
             and m.item_id not in (select item from crm_giwa.v_cobertura_facturacion where tipo = 'cubierto') order by m.empresa loop
    select v.hasta, v.aviso into h, a from crm_giwa.v_cobertura_facturacion v where v.tipo = 'ventana' and v.cid = x.cid;
    perform crm_giwa._alta_tarea(jsonb_build_object('type', 'Administración', 'alertType', 'Facturación',
      'title', 'Facturación · ' || coalesce(x.empresa, '') || ' · ' || coalesce(x.titulo, ''),
      'detail', 'Abono mensual. El monto sale del cálculo de facturación.', 'projectId', x.proy_id, 'itemIds', x.item_id,
      'priority', 'Media', 'assignees', adm, 'due', crm_giwa.venc_de(x.periodo_key, coalesce(h, 5)), 'frequency', 'Mensual',
      'end', crm_giwa.fin_contrato(x.item_id), 'reminder', coalesce(a, case when h is null then 4 else 0 end)::text));
    creadas := creadas + 1;
  end loop;
  for x in select * from crm_giwa.v_facturar_saldos s
           where s.item_id not in (select item from crm_giwa.v_reglas_facturacion)
             and s.item_id not in (select item from crm_giwa.v_cobertura_facturacion where tipo = 'cubierto') order by s.saldo desc loop
    perform crm_giwa._alta_tarea(jsonb_build_object('type', 'Administración', 'alertType', 'Facturación',
      'title', 'Facturación · ' || coalesce(x.empresa, '') || ' · ' || coalesce(x.titulo, ''),
      'detail', 'Saldo del desarrollo. El monto sale del cálculo de facturación.', 'projectId', x.proy_id, 'itemIds', x.item_id,
      'priority', 'Media', 'assignees', adm, 'due', crm_giwa.hoy(), 'frequency', 'Única', 'reminder', rem::text));
    creadas := creadas + 1;
  end loop;
  -- ya no queda nada para facturar de ese desarrollo: la regla se cierra
  for x in select r.id, r.item from crm_giwa.v_reglas_facturacion r
           where r.item not in (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos) loop
    update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = x.id;
    perform crm_giwa._comentar_tarea(x.id, 'Cerrada: no queda nada para facturar de ' || x.item || '.');
    cerradas := cerradas + 1;
  end loop;
  return jsonb_build_object('ok', true, 'creadas', creadas, 'cerradas', cerradas);
end $$;

-- ── accion_desarrollo, ahora como accionDesarrollo: al final, las alertas ──
create or replace function crm_giwa.accion_desarrollo(did text, accion text) returns jsonb
language plpgsql volatile as $$
declare
  d     crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  can   text := crm_giwa.estado_canonico(d.estado_id);
  mant  boolean := crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id);
  desde text[]; nuevo text; tabla text[]; fact jsonb;
begin
  case accion
    when 'arrancar' then nuevo := crm_giwa.estado_des('curso');      desde := array['aprobada'];
    when 'entregar' then nuevo := crm_giwa.estado_des('garantia');   desde := case when mant then '{}'::text[] else array['curso'] end;
    when 'cerrar'   then nuevo := crm_giwa.estado_des('finalizada'); desde := case when mant then array['curso','garantia'] else array['garantia'] end;
    when 'rechazar' then
      nuevo := crm_giwa.estado_des('rechazada'); desde := array['nueva','aprobada'];
      select array_agg(crm_giwa.estado_canonico(id)) into tabla from crm_giwa.desarrollo_estados where rechazar;
      if coalesce(array_length(tabla, 1), 0) > 0 then desde := tabla; end if;
    else raise exception 'Acción desconocida: %', accion;
  end case;
  if not (can = any (desde)) then
    raise exception 'No se puede "%" un % que está en %', accion, case when mant then 'mantenimiento' else 'desarrollo' end,
      coalesce(nullif(d.estado_id, ''), 'sin estado');
  end if;
  update crm_giwa.desarrollos set
    estado_id    = nuevo,
    fecha_inicio = case when accion = 'arrancar' and fecha_inicio is null then crm_giwa.hoy() else fecha_inicio end,
    fecha_fin    = case when accion = 'entregar' then crm_giwa.hoy() else fecha_fin end
  where id = d.id;
  -- lo que se factura cambió: las alertas de Facturación nacen o se cierran ya,
  -- y los recordatorios del desarrollo (IPC, renovación, aprobado, reunión) también
  fact := crm_giwa.sincronizar_alertas_facturacion();
  perform crm_giwa.crear_recordatorios('{}', d.id);
  return jsonb_build_object('ok', true, 'id', d.id, 'de', d.estado_id, 'a', nuevo, 'proy_id', d.proyecto_id,
                            'alertas_facturacion', jsonb_build_object('creadas', fact -> 'creadas', 'cerradas', fact -> 'cerradas'));
end $$;

grant select on crm_giwa.v_reglas_facturacion, crm_giwa.v_cobertura_facturacion, crm_giwa.v_recordatorios_faltan to authenticated, service_role;
grant execute on function crm_giwa.refs_tarea(text, text), crm_giwa.fin_contrato(text), crm_giwa.venc_de(text, int),
  crm_giwa.mail_admin(), crm_giwa.crear_recordatorios(jsonb, text), crm_giwa.sincronizar_alertas_facturacion() to authenticated, service_role;

reset role;

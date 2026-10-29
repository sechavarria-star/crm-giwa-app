-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Diagnóstico: tareas y recordatorios, y activar Telegram · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_diag_recordatorios suma las tareas (cada una es su propia clave: nunca
--   «repetida») y dos columnas: es_tarea y telegram (Administración = sí,
--   va en el resumen diario; el resto, si su canal incluye Telegram).
-- activar_telegram(ids): a las tareas elegidas les suma Telegram al canal, en
--   la misma fila y con la misma fecha. El aviso en días queda en «hoy» para
--   que la tarea no se oculte de Hoy. Sólo el responsable o Administración.
--   Se saltean las de Administración, cerradas, sin fecha o que ya lo tienen.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

drop view if exists crm_giwa.v_diag_recordatorios;
create view crm_giwa.v_diag_recordatorios with (security_invoker = true) as
with r as (
  select t.id, t.tipo, t.titulo, t.responsable, t.estado, t.vencimiento, t.frecuencia, t.creado, t.canal_envio,
         crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada') as abierta,
         coalesce(t.tipo, '') ~* 'administr' as es_admin,
         coalesce(t.tipo, '') ~* 'reuni' and coalesce(t.frecuencia, '') ~* 'mensual' as es_reu,
         case when coalesce(t.tipo, '') ~* 'administr' then coalesce(nullif(t.alerta_tipo, ''), crm_giwa.cat_admin(t.titulo, t.alerta_tipo))
              when coalesce(t.tipo, '') ~* 'reuni' and coalesce(t.frecuencia, '') ~* 'mensual' then 'Reunión mensual'
              else coalesce(nullif(t.tipo, ''), 'Tarea') end as categoria,
         case when coalesce(t.tipo, '') ~* 'administr' then (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] end as item,
         coalesce(nullif(t.cliente, ''), (select p.empresa_id from crm_giwa.proyectos p where p.id = (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).pids[1])) as cid
    from crm_giwa.tareas t),
k as (
  select r.*, case when r.es_reu then 'reu|' || coalesce(r.cid, '')
                   when r.es_admin then crm_giwa.cat_admin(r.titulo, r.categoria) || '|' || coalesce(r.item, r.id)
                   else 'tar|' || r.id end as clave
    from r),
o as (
  select k.*, first_value(k.id) over (partition by k.clave, k.abierta order by k.vencimiento nulls last, k.creado, k.id) as queda,
         count(*) over (partition by k.clave, k.abierta) as n
    from k)
select o.id, o.tipo, o.categoria, coalesce(e.nombre, o.cid, '') as cliente, coalesce(o.item, '') as item, o.titulo, o.responsable,
       o.estado, o.abierta, o.vencimiento, o.frecuencia, o.creado, o.clave,
       case when o.abierta and o.n > 1 and o.queda <> o.id then o.queda else '' end as repetida_con,
       not o.es_admin and not o.es_reu as es_tarea,
       o.es_admin or coalesce(o.canal_envio, '') ~* 'telegram' as telegram
  from o left join crm_giwa.empresas e on e.id = o.cid;
grant select on crm_giwa.v_diag_recordatorios to authenticated;

create or replace function crm_giwa.activar_telegram(ids text[]) returns jsonb
language plpgsql as $$
declare t crm_giwa.tareas; cfg text; tg text; n int := 0; saltadas int := 0;
begin
  select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_CanalEnvio';
  tg := coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'telegram' limit 1), 'telegram');
  for t in select * from crm_giwa.tareas where id = any (ids) loop
    if coalesce(t.tipo, '') ~* 'administr' or crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') or t.vencimiento is null
       or coalesce(t.canal_envio, '') ~* 'telegram' or not (crm_giwa._es_responsable(t) or crm_giwa.es_admin()) then
      saltadas := saltadas + 1; continue;
    end if;
    update crm_giwa.tareas set
      canal_envio = case when coalesce(trim(canal_envio), '') = '' then 'Interno, ' || tg else canal_envio || ', ' || tg end,
      recordatorio = greatest(0, vencimiento - crm_giwa.hoy())::text, enviada = false
    where id = t.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'activadas', n, 'saltadas', saltadas);
end $$;
grant execute on function crm_giwa.activar_telegram(text[]) to authenticated;

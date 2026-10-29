-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Diagnóstico: todos los recordatorios y sus repetidos · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_diag_recordatorios: los de Administración y las reuniones mensuales,
--   abiertos y cerrados, con su clave (categoría + desarrollo · cliente).
--   De cada clave con más de uno abierto queda el que vence primero; los
--   demás traen «repetida_con».
-- cerrar_repetidas(aplicar): sin aplicar, devuelve la simulación; aplicando
--   (sólo Administración) los pasa a Finalizada con «Cerrada: repetida con <ID>».
--   No borra nada.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

create or replace view crm_giwa.v_diag_recordatorios with (security_invoker = true) as
with r as (
  select t.id, t.tipo, t.titulo, t.responsable, t.estado, t.vencimiento, t.frecuencia, t.creado,
         crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada') as abierta,
         case when coalesce(t.tipo, '') ~* 'administr' then coalesce(nullif(t.alerta_tipo, ''), crm_giwa.cat_admin(t.titulo, t.alerta_tipo))
              else 'Reunión mensual' end as categoria,
         case when coalesce(t.tipo, '') ~* 'administr' then (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] end as item,
         coalesce(nullif(t.cliente, ''), (select p.empresa_id from crm_giwa.proyectos p where p.id = (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).pids[1])) as cid
    from crm_giwa.tareas t
   where coalesce(t.tipo, '') ~* 'administr' or (coalesce(t.tipo, '') ~* 'reuni' and coalesce(t.frecuencia, '') ~* 'mensual')),
k as (
  select r.*, case when r.categoria = 'Reunión mensual' then 'reu|' || coalesce(r.cid, '')
                   else crm_giwa.cat_admin(r.titulo, r.categoria) || '|' || coalesce(r.item, r.id) end as clave
    from r),
o as (
  select k.*, first_value(k.id) over (partition by k.clave, k.abierta order by k.vencimiento nulls last, k.creado, k.id) as queda,
         count(*) over (partition by k.clave, k.abierta) as n
    from k)
select o.id, o.tipo, o.categoria, coalesce(e.nombre, o.cid, '') as cliente, coalesce(o.item, '') as item, o.titulo, o.responsable,
       o.estado, o.abierta, o.vencimiento, o.frecuencia, o.creado, o.clave,
       case when o.abierta and o.n > 1 and o.queda <> o.id then o.queda else '' end as repetida_con
  from o left join crm_giwa.empresas e on e.id = o.cid;

create or replace function crm_giwa.cerrar_repetidas(aplicar boolean default false) returns jsonb
language plpgsql as $$
declare x record; L jsonb := '[]';
begin
  if aplicar and not crm_giwa.es_admin() then raise exception 'Sólo Administración puede cerrar recordatorios.'; end if;
  for x in select id, titulo, repetida_con from crm_giwa.v_diag_recordatorios where repetida_con <> '' order by clave, vencimiento loop
    L := L || jsonb_build_object('id', x.id, 'titulo', x.titulo, 'queda', x.repetida_con);
    if aplicar then
      update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = x.id;
      perform crm_giwa._comentar_tarea(x.id, 'Cerrada: repetida con ' || x.repetida_con);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'aplicado', aplicar, 'cerrar', L, 'n', jsonb_array_length(L));
end $$;

grant select on crm_giwa.v_diag_recordatorios to authenticated;
grant execute on function crm_giwa.cerrar_repetidas(boolean) to authenticated;

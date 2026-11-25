-- Pedido de Vicky, 24/11/2026
-- 1 · deshacer_cobro: revierte depósito y transferencia de una factura (sólo Administración), sin vencimiento, con auditoría y sin aviso.
-- 2 · proyectos.recontactar: no aceptado que se puede recontactar. No cambia el estado. v_fin_no_aceptados muestra sólo esos, con la fecha del rechazo.
-- 3 · v_fin_mmr_aprobados: MMR aprobados que todavía no arrancan, para tildarlos a mano. arranque = fin del desarrollo (fecha de fin o inicio + semanas).
-- 4 · renovar_mantenimiento guarda el fin (inicio + duración) y la aprobación de la renovación.
-- 5 · Datos: fecha probable de los históricos vacíos, YPF en USD, renovación de Prodigy, CUBA y B&B sin Detenido.
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- ── 1 · Deshacer un cobro ──
create or replace function crm_giwa.deshacer_cobro(cid text) returns jsonb
language plpgsql security definer set search_path to 'crm_giwa', 'public' as $function$
declare c crm_giwa.cobros;
begin
  if not crm_giwa.es_admin() then raise exception 'Sólo Administración puede deshacer un cobro.'; end if;
  select * into c from crm_giwa.cobros where id = cid for update;
  if not found then raise exception 'No encontré ese cobro.'; end if;
  if coalesce(c.comprobante_nro, '') = '' or coalesce(c.monto_ars, 0) <= 0 then raise exception 'Sólo se deshace el cobro de una factura emitida.'; end if;
  if c.deposito_fecha is null and c.transf_fecha is null then raise exception 'Esa factura no está cobrada.'; end if;
  update crm_giwa.cobros set deposito_fecha = null, transf_fecha = null, cobrado_ars = 0 where id = cid;
  insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, despues, motivo)
  select coalesce(crm_giwa.mi_mail(), 'base'), 'cobros', cid, 'editar', to_jsonb(c), to_jsonb(n), 'Deshacer cobro desde Facturación'
    from crm_giwa.cobros n where n.id = cid;
  return jsonb_build_object('ok', true, 'id', cid);
end $function$;

-- ── 2 · No aceptados que se pueden recontactar ──
alter table crm_giwa.proyectos add column if not exists recontactar boolean not null default false;

create or replace function crm_giwa.proyecto_recontactar(pid text, si boolean) returns jsonb
language plpgsql security definer set search_path to '' as $function$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  update crm_giwa.proyectos set recontactar = coalesce(si, false) where id = pid;
  if not found then raise exception 'No encontré ese proyecto.'; end if;
  return jsonb_build_object('ok', true);
end $function$;

create or replace view crm_giwa.v_fin_no_aceptados with (security_invoker = true) as
 select proy_id, empresa, proyecto, 'no_aceptado'::text as origen, estado, una_vez, por_mes, fecha
   from (select p.id as proy_id, p.empresa, p.nombre as proyecto, p.estado_proyecto as estado,
                round(coalesce(sum(case when not d.es_mantenimiento then coalesce(d.total_ars, 0::numeric) end), 0::numeric)) as una_vez,
                round(coalesce(sum(case when d.es_mantenimiento then coalesce(d.cuota, 0::numeric) end), 0::numeric)) as por_mes,
                coalesce((select max(h.fecha) from crm_giwa.historial_proyecto h where h.proyecto_id = p.id and h.evento = 'No aceptado' and not coalesce(h.prevista, false)),
                         pr.fecha_aprobacion) as fecha   -- rechazar_proyecto guarda el rechazo en fecha_aprobacion
           from crm_giwa.v_proyectos_clasif p
           join crm_giwa.proyectos pr on pr.id = p.id and pr.recontactar
           join crm_giwa.v_desarrollos_plata d on d.proyecto_id = p.id and crm_giwa.estado_canonico(d.estado_id) = 'rechazada'
          where crm_giwa.norm(coalesce(p.estado_proyecto, '')) ~ 'rechaz' and coalesce(p.empresa, '') !~* '^giwa'
          group by p.id, p.empresa, p.nombre, p.estado_proyecto, pr.fecha_aprobacion) e
  where una_vez > 0::numeric or por_mes > 0::numeric;

-- ── 3 · MMR aprobados sin iniciar ──
create or replace view crm_giwa.v_fin_mmr_aprobados with (security_invoker = true) as
 select d.id, p.id as proy_id, p.empresa, p.nombre as proyecto, d.titulo, p.estado_proyecto as estado, pr.fecha_aprobacion as fecha,
        round(coalesce(p.monto_final_ars, 0)) as una_vez, round(d.cuota) as por_mes,
        case when a.arranca is not null
             then greatest((date_trunc('month', crm_giwa.hoy()::timestamp) + interval '1 mon')::date, date_trunc('month', a.arranca::timestamp)::date) end as arranque
   from crm_giwa.v_desarrollos_plata d
   join crm_giwa.v_proyectos_clasif p on p.id = d.proyecto_id
   join crm_giwa.proyectos pr on pr.id = p.id
   join crm_giwa.desarrollos dd on dd.id = d.id
   cross join lateral (
     select coalesce(dd.fecha_inicio, (
       select case when count(*) = count(y.f) then max(y.f) end
         from (select coalesce(x.fecha_fin,
                 x.fecha_inicio + (substring(x.minuta from '"semanas"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)')::numeric * 7)::int) as f
                 from crm_giwa.desarrollos x where x.id = any (d.mant_de)) y)) as arranca) a
  where d.es_mantenimiento and crm_giwa.estado_canonico(d.estado_id) = 'aprobada' and not d.detenido and not p.detenido
    and coalesce(d.cuota, 0) > 0 and coalesce(p.empresa, '') !~* '^giwa';
grant select on crm_giwa.v_fin_mmr_aprobados to authenticated, service_role;

-- ── 4 · Renovar guarda el fin y su aprobación ──
do $$
declare o text; n text;
begin
  o := pg_get_functiondef('crm_giwa.renovar_mantenimiento(text,numeric,numeric)'::regprocedure);
  n := replace(o, $a$r.fecha_fin := null;$a$, $a$r.fecha_fin := (r.fecha_inicio + make_interval(months => dur))::date; r.fecha_aprobado := crm_giwa.hoy();$a$);
  if n = o then raise exception 'renovar_mantenimiento'; end if;
  execute n;
end $$;

-- ── 5 · Datos (el antes y el después quedan en admin_auditoria) ──
create temp table _antes on commit drop as
  select 'proyectos'::text tabla, id registro, to_jsonb(p) antes from crm_giwa.proyectos p
  union all select 'desarrollos', id, to_jsonb(d) from crm_giwa.desarrollos d where id in ('D-0071', 'D-0098');

alter table crm_giwa.proyectos disable trigger historial;   -- son correcciones: no son movimientos del proyecto
update crm_giwa.proyectos set recontactar = true where id in ('P-0010', 'P-0013', 'P-0014', 'P-0021', 'P-0032', 'P-0034') and estado_id = 'Rechazado';
update crm_giwa.proyectos set detenido = false where id in ('P-0001', 'P-0016') and estado_id = 'Rechazado';
-- aprobados, activos y finalizados: la aprobación · no aceptados: el rechazo. Quedan vacíos los que no tienen fecha cierta
update crm_giwa.proyectos set fecha_cierre_probable = fecha_aprobacion
 where fecha_cierre_probable is null and fecha_aprobacion is not null and estado_id in ('Aprobado', 'Activo', 'Finalizado');
update crm_giwa.proyectos set fecha_cierre_probable = coalesce(fecha_aprobacion, fecha_finalizado)
 where fecha_cierre_probable is null and estado_id = 'Rechazado' and id in ('P-0010', 'P-0013', 'P-0014', 'P-0016', 'P-0021');
update crm_giwa.proyectos set fecha_cierre_probable = '2026-09-18' where id = 'P-0007' and fecha_cierre_probable is null;
alter table crm_giwa.proyectos enable trigger historial;

update crm_giwa.desarrollos set moneda = 'USD', total_usd = 8040, total_ars = round(8040 * tipo_cambio, 2)
 where id = 'D-0071' and moneda = 'ARS' and total_ars = 8040 and tipo_cambio = 1546.15;
update crm_giwa.desarrollos set fecha_fin = (fecha_inicio + interval '12 months')::date, fecha_aprobado = '2026-11-11'
 where id = 'D-0098' and fecha_fin is null and fecha_inicio = '2026-11-12';

insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', a.tabla, a.registro, 'editar', a.antes, b.despues, 'Pedido de Vicky 24/11/2026: fechas probables, recontacto, YPF en USD y renovación de Prodigy'
  from _antes a join (
    select 'proyectos'::text tabla, id registro, to_jsonb(p) despues from crm_giwa.proyectos p
    union all select 'desarrollos', id, to_jsonb(d) from crm_giwa.desarrollos d) b using (tabla, registro)
 where a.antes - 'actualizado' is distinct from b.despues - 'actualizado';

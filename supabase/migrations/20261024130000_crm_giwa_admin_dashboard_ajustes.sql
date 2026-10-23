-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · ajustes del dashboard tras validar · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- validar-20261023-174444 dio 9 diferencias:
--   · monto_fact (6 alertas): en el Apps Script «VALOR_CUOTA» y «CUOTA_ACT»
--     son LA MISMA columna, la cuota actual (_Sheet.gs: II.CUOTA_ACT =
--     II.VALOR_CUOTA). La vista caía a la cuota inicial. Mismo respaldo
--     equivocado en v_facturar_base y v_ajustes_ipc (no daba diferencia
--     porque hoy todos tienen cuota actual): se corrige en los tres.
--   · dias (2 cobros): el Apps Script cuenta desde la medianoche UTC del
--     comprobante y redondea; se copia tal cual.
--   · overdue de una tarea que vence hoy: NO se copia (en el Apps Script
--     sale «vencida» lo que vence hoy). El validador lo sabe.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_cobros_pendientes with (security_invoker = true) as
select id, empresa, proyecto, coalesce(nro, '') as nro, concepto, monto, fecha,
       case when fecha is null then null
            else round(extract(epoch from now() - (fecha::timestamp at time zone 'UTC')) / 86400)::int end as dias,
       coalesce(nro, '') = '' as sin_comprobante, orden
from crm_giwa.v_cobros_det
where monto > 0 and deposito_fecha is null and transf_fecha is null;

create or replace view crm_giwa.v_facturar_base with (security_invoker = true) as
select d.id as item_id, d.proyecto_id as proy_id, coalesce(m.empresa, '') as empresa, coalesce(m.nombre, '') as proyecto,
       coalesce(nullif(x.titulo, ''), x.descripcion, '') as titulo, coalesce(x.estado_id, '') as estado,
       d.es_mantenimiento, d.total_ars, x.orden,
       coalesce(nullif(x.valor_cuota_actual, 0), d.total_ars) as fee,
       coalesce((select sum(c.monto) from crm_giwa.v_cobros_det c where c.desarrollo_id = d.id), 0) as facturado,
       not exists (select 1 from unnest(coalesce(x.mant_de, '{}')) u(mid)
                   left join crm_giwa.desarrollos o on o.id = trim(u.mid)
                   where trim(u.mid) <> '' and crm_giwa.estado_canonico(o.estado_id) <> 'finalizada') as mant_listo
from crm_giwa.v_desarrollos_plata d
join crm_giwa.desarrollos x on x.id = d.id
left join crm_giwa.v_proy_mapa m on m.id = d.proyecto_id
where d.es_facturable and not coalesce(d.bonificado, false);

create or replace view crm_giwa.v_ajustes_ipc with (security_invoker = true) as
with serie as (
  select mes, ipc from crm_giwa.indices_ipc
  where coalesce(ipc, 0) <> 0
    and mes > date_trunc('month', crm_giwa.hoy() - interval '24 months')::date
    and mes <= crm_giwa.mes_actual()
),
a as (
  select d.id as item_id, d.proyecto_id as proy_id, coalesce(m.empresa, '') as empresa, coalesce(m.nombre, '') as proyecto,
         coalesce(nullif(x.titulo, ''), nullif(x.tipo_id, ''), 'Mantenimiento') as titulo,
         coalesce(x.fecha_ajuste_cuota, x.fecha_inicio) as desde,
         coalesce(x.valor_cuota_actual, 0) as cuota_actual, x.orden
  from crm_giwa.v_desarrollos_plata d
  join crm_giwa.desarrollos x on x.id = d.id
  left join crm_giwa.v_proy_mapa m on m.id = d.proyecto_id
  where d.es_mantenimiento and d.es_facturable and not coalesce(d.bonificado, false)
    and coalesce(x.fecha_ajuste_cuota, x.fecha_inicio) is not null
),
f as (
  select a.item_id, crm_giwa.producto(1 + s.ipc / 100) as factor, count(s.mes) as n
  from a join serie s on s.mes > a.desde group by a.item_id
)
select a.item_id, a.proy_id, a.empresa, a.proyecto, a.titulo,
       floor((crm_giwa.hoy() - a.desde) / 30.4)::int as meses,
       coalesce(f.n, 0)::int as meses_ipc, a.cuota_actual,
       a.desde, crm_giwa.hoy() as hasta,
       case when f.n > 0 then round((f.factor - 1) * 1000) / 10 end as pct,
       case when f.n > 0 and a.cuota_actual <> 0 then round(a.cuota_actual * f.factor) end as cuota_sugerida,
       a.orden
from a left join f on f.item_id = a.item_id
where floor((crm_giwa.hoy() - a.desde) / 30.4) >= 3;

-- v_alertas_admin: sólo cambia monto_fact (cuota actual, si no el total)
create or replace view crm_giwa.v_alertas_admin with (security_invoker = true) as
with cfg as (
  select coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5) as rec_def
),
fc as (
  select desarrollo_id, proyecto_id, to_char(fecha, 'YYYY-MM') as mes from crm_giwa.v_cobros_det where monto > 0
)
select t.id, coalesce(t.proyecto_id, '') as proy_id, coalesce(t.desarrollo_id, '') as item_id,
       coalesce(m.nombre, '') as proy_nombre, coalesce(m.empresa, '') as empresa,
       coalesce((select r.cuit from crm_giwa.razones_sociales r where r.empresa_id = m.empresa_id
                 order by r.por_defecto desc nulls last, r.id limit 1), '') as cuit,
       coalesce(nullif(d.titulo, ''), d.descripcion, '') as item_titulo, coalesce(d.tipo_id, '') as item_tipo,
       coalesce(nullif(d.valor_cuota_actual, 0), d.total_ars, 0) as monto_fact, coalesce(d.q_cuotas, 0) as cuotas_total,
       (case when coalesce(t.desarrollo_id, '') <> ''
             then (select count(*) from fc where fc.desarrollo_id = t.desarrollo_id)
             else (select count(*) from fc where fc.proyecto_id = t.proyecto_id) end + 1)::int as cuota_actual,
       t.vencimiento as fecha, coalesce(t.titulo, '') as titulo,
       case when lower(coalesce(t.alerta_tipo, '') || ' ' || coalesce(t.titulo, '')) like '%factur%' then 'Facturación'
            when lower(coalesce(t.alerta_tipo, '') || ' ' || coalesce(t.titulo, '')) like '%cobr%' then 'Cobro'
            when lower(coalesce(t.alerta_tipo, '') || ' ' || coalesce(t.titulo, '')) like '%renov%' then 'Renovación'
            when lower(coalesce(t.alerta_tipo, '') || ' ' || coalesce(t.titulo, '')) like '%ipc%' then 'IPC'
            else coalesce(nullif(t.alerta_tipo, ''), 'Administración') end as tipo,
       (coalesce(t.enviada, false)
        or coalesce(t.estado, '') ~* '(complet|finaliz|cancel)'
        or (coalesce(t.titulo, '') ~* 'factur' and coalesce(t.desarrollo_id, '') <> ''
            and exists (select 1 from fc where fc.desarrollo_id = t.desarrollo_id and fc.mes = to_char(t.vencimiento, 'YYYY-MM')))
        or (t.vencimiento is not null
            and t.vencimiento - (coalesce(nullif(crm_giwa.num(t.recordatorio), 0), cfg.rec_def))::int > crm_giwa.hoy())) as enviada,
       coalesce(t.frecuencia, '') as recurrencia, coalesce(t.alerta_tipo, '') as alerta_tipo,
       coalesce(t.cliente, '') as cliente_id, coalesce(t.estado, '') as estado,
       crm_giwa.norm_mail(t.responsable) as responsable, coalesce(t.descripcion, '') as nota, t.orden
from crm_giwa.tareas t
cross join cfg
left join crm_giwa.v_proy_mapa m on m.id = t.proyecto_id
left join crm_giwa.desarrollos d on d.id = t.desarrollo_id
where coalesce(trim(t.id), '') <> '' and coalesce(t.tipo, '') ~* 'administr';

reset role;

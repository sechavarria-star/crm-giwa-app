-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · el dashboard de Administración · etapa 4a · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Lo que getResumenAdmin (CRM.gs) calculaba en cada carga, en vistas:
--   v_cobros_pendientes    getCobrosPendientes   facturado y sin depositar
--   v_facturar_mensuales   getFacturacionPendiente.mensuales  abono del mes
--   v_facturar_saldos      getFacturacionPendiente.saldos     total − facturado
--   v_cobros_sin_fc / v_cobros_sin_desarrollo / v_cobros_sin_destino
--                          las tres listas de avisos de la misma función
--   v_ajustes_ipc          getAjustesPendientes  abonos con cuota para ajustar
--   v_reparto_socio        getRepartoSocio       lo depositado y su reparto
--   v_alertas_admin        getAlertas            las reglas de Administración
-- Los gastos, el resumen y la proyección ya estaban (capas 2a y 2b).
--
-- Reglas copiadas tal cual, con sus rarezas, para que el validador dé 0:
--   · lo facturado de un desarrollo suma sus cobros de CUALQUIER proyecto
--     (en v_desarrollos_plata, sólo los del mismo proyecto).
--   · el mes de un cobro sale del nombre del mes en el concepto o la cuota
--     («agosto 2026»); si no lo nombra, de la fecha del comprobante.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── estado canónico de un desarrollo o proyecto (_estadoCanonico) ──
create or replace function crm_giwa.estado_canonico(e text) returns text
language sql immutable as $$
  select case
    when x = '' then 'nueva'
    when x ~ '(rechaz|cancel|perdid)' then 'rechazada'
    when x ~ 'finaliz' then 'finalizada'
    when x ~ 'garant' then 'garantia'
    when x ~ '(curso|ejecu|desarroll|implementac|mantenim|soporte|activo)' then 'curso'
    when x ~ '(aprob|vendido)' then 'aprobada'
    else 'nueva' end
  from (select crm_giwa.norm(e) x) s
$$;

-- ── producto de una columna (el IPC acumulado se multiplica mes a mes) ──
do $$ begin
  if not exists (select 1 from pg_aggregate a join pg_proc p on p.oid = a.aggfnoid
                 join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_giwa' and p.proname = 'producto') then
    create aggregate crm_giwa.producto(numeric) (sfunc = numeric_mul, stype = numeric, initcond = '1');
  end if;
end $$;

-- ── proyecto → nombre y empresa por nombre (_proyMap) ──
create or replace view crm_giwa.v_proy_mapa with (security_invoker = true) as
select p.id, coalesce(p.nombre, '') as nombre, p.empresa_id,
       case when coalesce(p.empresa_id, '') = '' then '' else coalesce(e.nombre, p.empresa_id) end as empresa
from crm_giwa.proyectos p left join crm_giwa.empresas e on e.id = p.empresa_id;

-- ── cobros con el monto con signo (_montoCob) y sus datos de texto ──
create or replace view crm_giwa.v_cobros_det with (security_invoker = true) as
select c.id, c.proyecto_id, c.desarrollo_id, c.comprobante_nro as nro, coalesce(c.concepto_fc, '') as concepto,
       c.cuota_nro, c.tipo_comprobante, c.comprobante_fecha as fecha, c.deposito_fecha, c.transf_fecha,
       c.razon_social_fc as razon, c.cuit_destino as cuit, c.orden,
       v.monto, v.cobrado,
       coalesce(m.nombre, '') as proyecto, coalesce(m.empresa, '') as empresa
from crm_giwa.cobros c
join crm_giwa.v_cobros_plata v on v.id = c.id
left join crm_giwa.v_proy_mapa m on m.id = c.proyecto_id;

-- ── getCobrosPendientes ──
create or replace view crm_giwa.v_cobros_pendientes with (security_invoker = true) as
select id, empresa, proyecto, coalesce(nro, '') as nro, concepto, monto, fecha,
       case when fecha is null then null else crm_giwa.hoy() - fecha end as dias,
       coalesce(nro, '') = '' as sin_comprobante, orden
from crm_giwa.v_cobros_det
where monto > 0 and deposito_fecha is null and transf_fecha is null;

-- ── mes de cada cobro facturado de un desarrollo (cobMesByItem) ──
create or replace view crm_giwa.v_cobros_mes with (security_invoker = true) as
select c.desarrollo_id, c.id,
       coalesce(
         -- el primer mes que nombra el concepto + la cuota; año: el del texto o el de la fecha
         (select make_date(coalesce((substring(t.txt from '20\d{2}'))::int,
                                    extract(year from c.fecha)::int,
                                    extract(year from crm_giwa.hoy())::int), k::int, 1)
          from (select crm_giwa.norm(c.concepto || ' ' || coalesce(c.cuota_nro::text, '')) txt) t,
               unnest(array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                            'septiembre','octubre','noviembre','diciembre']) with ordinality u(mes, k)
          where position(u.mes in t.txt) > 0 order by k limit 1),
         date_trunc('month', c.fecha)::date) as mes
from crm_giwa.v_cobros_det c
where c.monto > 0 and coalesce(c.desarrollo_id, '') <> '';

-- ── base común de la facturación pendiente ──
create or replace view crm_giwa.v_facturar_base with (security_invoker = true) as
select d.id as item_id, d.proyecto_id as proy_id, coalesce(m.empresa, '') as empresa, coalesce(m.nombre, '') as proyecto,
       coalesce(nullif(x.titulo, ''), x.descripcion, '') as titulo, coalesce(x.estado_id, '') as estado,
       d.es_mantenimiento, d.total_ars, x.orden,
       coalesce(nullif(x.valor_cuota_actual, 0), nullif(x.cuota, 0), d.total_ars) as fee,
       coalesce((select sum(c.monto) from crm_giwa.v_cobros_det c where c.desarrollo_id = d.id), 0) as facturado,
       -- mantenimiento atado a un desarrollo: factura cuando ese desarrollo terminó
       not exists (select 1 from unnest(coalesce(x.mant_de, '{}')) u(mid)
                   left join crm_giwa.desarrollos o on o.id = trim(u.mid)
                   where trim(u.mid) <> '' and crm_giwa.estado_canonico(o.estado_id) <> 'finalizada') as mant_listo
from crm_giwa.v_desarrollos_plata d
join crm_giwa.desarrollos x on x.id = d.id
left join crm_giwa.v_proy_mapa m on m.id = d.proyecto_id
where d.es_facturable and not coalesce(d.bonificado, false);

create or replace view crm_giwa.v_facturar_mensuales with (security_invoker = true) as
with b as (select * from crm_giwa.v_facturar_base where es_mantenimiento and mant_listo and fee > 0),
mes as (                                   -- el mes corriente o el primero sin cobro (hasta 13 más)
  select b.item_id,
         coalesce((select g.m from generate_series(0, 12) s(n),
                     lateral (select (crm_giwa.mes_actual() + make_interval(months => s.n))::date m) g
                   where not exists (select 1 from crm_giwa.v_cobros_mes cm where cm.desarrollo_id = b.item_id and cm.mes = g.m)
                   order by s.n limit 1),
                  (crm_giwa.mes_actual() + interval '13 months')::date) as m
  from b
)
select b.proy_id, b.item_id, b.empresa, b.proyecto, b.titulo, b.fee as monto,
       (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from mes.m)::int]
         || ' ' || extract(year from mes.m)::int as periodo,
       extract(year from mes.m)::int || '-' || (extract(month from mes.m)::int - 1) as periodo_key,
       b.facturado, b.orden
from b join mes on mes.item_id = b.item_id;

create or replace view crm_giwa.v_facturar_saldos with (security_invoker = true) as
with s as (
  select b.*, b.total_ars - b.facturado as saldo0
  from crm_giwa.v_facturar_base b
  where not b.es_mantenimiento and b.total_ars - b.facturado > 1
),
pool as (                                  -- cobros del proyecto sin desarrollo
  select proyecto_id, sum(monto) as pool from crm_giwa.v_cobros_det
  where coalesce(desarrollo_id, '') = '' and coalesce(proyecto_id, '') <> '' group by 1
),
rep as (                                   -- se descuentan del saldo mayor al menor
  select s.*, coalesce(p.pool, 0) as pool,
         coalesce(sum(s.saldo0) over (partition by s.proy_id order by s.saldo0 desc, s.orden
                                      rows between unbounded preceding and 1 preceding), 0) as antes
  from s left join pool p on p.proyecto_id = s.proy_id
)
select proy_id, item_id, empresa, proyecto, titulo, estado, total_ars as total,
       facturado + aplica as facturado, saldo0 - aplica as saldo, orden
from (select rep.*, case when pool > 0 then greatest(0, least(saldo0, pool - antes)) else 0 end as aplica from rep) r
where saldo0 - aplica > 1;

create or replace view crm_giwa.v_cobros_sin_fc with (security_invoker = true) as
select id, empresa, proyecto, coalesce(nro, '') as nro, concepto, monto, fecha, orden
from crm_giwa.v_cobros_det
where monto > 0 and coalesce(nro, '') = '' and coalesce(tipo_comprobante, '') !~* 'sin\s*factura';

create or replace view crm_giwa.v_cobros_sin_desarrollo with (security_invoker = true) as
select id, empresa, proyecto, coalesce(nro, '') as nro, concepto, monto, fecha, orden
from crm_giwa.v_cobros_det
where monto > 0 and coalesce(desarrollo_id, '') = '';

create or replace view crm_giwa.v_cobros_sin_destino with (security_invoker = true) as
select id, coalesce(razon, '') as razon, coalesce(cuit, '') as cuit, concepto, monto, fecha, orden
from crm_giwa.v_cobros_det
where monto <> 0 and coalesce(desarrollo_id, '') = '' and coalesce(proyecto_id, '') = '';

-- ── getAjustesPendientes · umbral 3 meses, IPC de la tabla indices_ipc ──
create or replace view crm_giwa.v_ajustes_ipc with (security_invoker = true) as
with serie as (                            -- los últimos 24 meses con IPC cargado
  select mes, ipc from crm_giwa.indices_ipc
  where coalesce(ipc, 0) <> 0
    and mes > date_trunc('month', crm_giwa.hoy() - interval '24 months')::date
    and mes <= crm_giwa.mes_actual()
),
a as (
  select d.id as item_id, d.proyecto_id as proy_id, coalesce(m.empresa, '') as empresa, coalesce(m.nombre, '') as proyecto,
         coalesce(nullif(x.titulo, ''), nullif(x.tipo_id, ''), 'Mantenimiento') as titulo,
         coalesce(x.fecha_ajuste_cuota, x.fecha_inicio) as desde,
         coalesce(nullif(x.valor_cuota_actual, 0), nullif(x.cuota, 0), 0) as cuota_actual, x.orden
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

-- ── getRepartoSocio · % de CotConfig reparto_socio (50 por defecto) ──
create or replace view crm_giwa.v_reparto_socio with (security_invoker = true) as
with k as (select crm_giwa.umbral('reparto_socio', 50) as pct)
select c.id, c.empresa, c.proyecto, coalesce(c.nro, '') as nro, c.concepto,
       c.deposito_fecha as deposito, c.transf_fecha as transferido,
       c.cobrado as monto, round(c.cobrado * k.pct / 100) as socio, c.cobrado - round(c.cobrado * k.pct / 100) as mio,
       c.transf_fecha is not null as hecho, k.pct, c.orden
from crm_giwa.v_cobros_det c cross join k
where c.monto <> 0 and c.deposito_fecha is not null;

-- ── getAlertas · las reglas de Administración con su contexto ──
create or replace view crm_giwa.v_alertas_admin with (security_invoker = true) as
with cfg as (
  select coalesce((select nullif(crm_giwa.num(valor), 0) from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' limit 1), 5) as rec_def
),
fc as (                                    -- comprobantes facturados (no NC) por desarrollo / proyecto / mes
  select desarrollo_id, proyecto_id, to_char(fecha, 'YYYY-MM') as mes from crm_giwa.v_cobros_det where monto > 0
)
select t.id, coalesce(t.proyecto_id, '') as proy_id, coalesce(t.desarrollo_id, '') as item_id,
       coalesce(m.nombre, '') as proy_nombre, coalesce(m.empresa, '') as empresa,
       coalesce((select r.cuit from crm_giwa.razones_sociales r where r.empresa_id = m.empresa_id
                 order by r.por_defecto desc nulls last, r.id limit 1), '') as cuit,
       coalesce(nullif(d.titulo, ''), d.descripcion, '') as item_titulo, coalesce(d.tipo_id, '') as item_tipo,
       coalesce(nullif(d.cuota, 0), d.total_ars, 0) as monto_fact, coalesce(d.q_cuotas, 0) as cuotas_total,
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

grant select on crm_giwa.v_proy_mapa, crm_giwa.v_cobros_det, crm_giwa.v_cobros_pendientes, crm_giwa.v_cobros_mes,
  crm_giwa.v_facturar_base, crm_giwa.v_facturar_mensuales, crm_giwa.v_facturar_saldos, crm_giwa.v_cobros_sin_fc,
  crm_giwa.v_cobros_sin_desarrollo, crm_giwa.v_cobros_sin_destino, crm_giwa.v_ajustes_ipc, crm_giwa.v_reparto_socio,
  crm_giwa.v_alertas_admin to authenticated, service_role;
grant execute on function crm_giwa.estado_canonico(text) to authenticated, service_role;

reset role;

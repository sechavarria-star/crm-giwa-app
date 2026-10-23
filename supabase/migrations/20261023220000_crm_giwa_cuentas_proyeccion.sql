-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · las cuentas, capa 2b: gastos, gasto mensual y proyección a 12
-- meses · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Lo que faltaba de getResumenFinanciero (Calculos.gs), sobre la capa 1 y
-- la tabla diaria del BCRA (20261023210000):
--
--   v_gastos_plata     getGastos: cada gasto en pesos y en dólares al TC de su
--                      fecha (tc_de_fecha = _getTCByFecha), su mes y si es impuesto
--   v_gasto_mensual    gasto_mensual: el último mes con gastos (hasta hoy), sin impuestos
--   v_proyeccion_12m   proyeccion_mant: lo que entra por mes, los próximos 12
--   v_proy_sin_fecha   proy_sin_fecha: desarrollos sin fecha de cierre (los 8 primeros)
--
-- Igual que el Apps Script:
--   · un abono reparte su cuota 12 meses desde su fecha de inicio (o este mes);
--   · lo pendiente de un desarrollo se reparte en 3 meses desde su inicio
--     (no antes de este mes): Desarrollo_FechaCierre no existe, así que todo
--     desarrollo con saldo figura «sin fecha de cierre»;
--   · las cuotas pendientes de un desarrollo = Desarrollo_QCuotas menos las ya
--     facturadas (mínimo 1), todas del mismo peso (_tramosDeModelo con un
--     código de modelo, FP-01…, no encuentra porcentajes en el texto).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- Este mes en la zona de la app (el baseM del Apps Script)
create or replace function crm_giwa.mes_actual() returns date
language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace view crm_giwa.v_gastos_plata with (security_invoker = true) as
with g as (
  select g.*, crm_giwa.tc_de_fecha(g.fecha) as tc,
         to_char(coalesce(g.mes, g.fecha), 'YYYY-MM') as mes_key
  from crm_giwa.gastos_internos g
)
select g.id, g.fecha, g.categoria, g.tipo, g.descripcion, g.moneda, g.recurrencia, g.prorratear,
       g.pagador, g.contratacion_id, g.mes_key, g.tc,
       case when coalesce(g.monto_ars, 0) = 0 and coalesce(g.monto_usd, 0) <> 0
            then round(g.monto_usd * g.tc) else coalesce(g.monto_ars, 0) end as monto_ars,
       case when coalesce(g.monto_usd, 0) = 0 and coalesce(g.monto_ars, 0) <> 0 and g.tc > 0
            then round(g.monto_ars / g.tc, 2) else coalesce(g.monto_usd, 0) end as monto_usd,
       crm_giwa.norm(coalesce(g.categoria, '') || ' ' || coalesce(g.descripcion, ''))
         ~ '(impuesto|monotrib|arca|afip|ingresos brutos|iibb|retenc)' as es_impuesto
from g;

create or replace view crm_giwa.v_gasto_mensual with (security_invoker = true) as
with ult as (
  select coalesce(max(mes_key) filter (where mes_key <= to_char(crm_giwa.mes_actual(), 'YYYY-MM')),
                  to_char(crm_giwa.mes_actual(), 'YYYY-MM')) as mes
  from crm_giwa.v_gastos_plata where mes_key <> '')
select ult.mes,
       round(coalesce((select sum(monto_ars) from crm_giwa.v_gastos_plata g
                        where g.mes_key = ult.mes and not g.es_impuesto), 0)) as gasto_mensual
from ult;

create or replace view crm_giwa.v_proyeccion_12m with (security_invoker = true) as
with base as (select crm_giwa.mes_actual() as m0),
gi as (                                                -- desarrollos de los proyectos ganados
  select d.*, p.nombre as proy_nombre
  from crm_giwa.v_desarrollos_plata d
  join crm_giwa.v_proyectos_plata p on p.id = d.proyecto_id and p.es_ganado
),
fi as (select id, fecha_inicio from crm_giwa.desarrollos),
-- abonos: la cuota, 12 meses desde su inicio (o este mes)
mant as (
  select (date_trunc('month', coalesce(fi.fecha_inicio, base.m0)) + make_interval(months => k))::date as mes,
         gi.cuota as monto
  from gi join fi on fi.id = gi.id, base, generate_series(0, 11) k
  where gi.es_mantenimiento and gi.es_facturable and gi.cuota > 0
),
-- desarrollos: el saldo repartido en las cuotas que faltan, a lo largo de 3 meses
dev0 as (
  select gi.id, gi.saldo,
         greatest(1, greatest(1, coalesce(floor(gi.cuotas), 1))::int
                     - least(gi.cuotas_facturadas::int, greatest(1, coalesce(floor(gi.cuotas), 1))::int)) as n,
         greatest(coalesce(fi.fecha_inicio, base.m0), base.m0) as ini
  from gi join fi on fi.id = gi.id, base
  where not gi.es_mantenimiento and gi.es_facturable and gi.saldo > 1
),
dev as (
  select (date_trunc('month', dev0.ini)
          + make_interval(months => case when dev0.n = 1 then 0
                                         else round((i * 2)::numeric / (dev0.n - 1))::int end))::date as mes,
         dev0.saldo / dev0.n as monto
  from dev0, generate_series(0, dev0.n - 1) i
),
meses as (
  select k, (base.m0 + make_interval(months => k))::date as mes from base, generate_series(0, 11) k
),
gm as (select gasto_mensual from crm_giwa.v_gasto_mensual)
select meses.k as orden, meses.mes,
       (array['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'])[extract(month from meses.mes)::int]
         || ' ' || to_char(meses.mes, 'YY') as etiqueta,
       round(coalesce((select sum(monto) from dev where dev.mes = meses.mes), 0)) as desarrollo,
       round(coalesce((select sum(monto) from mant where mant.mes = meses.mes), 0)) as mantenimiento,
       round(coalesce((select sum(monto) from dev where dev.mes = meses.mes), 0))
         + round(coalesce((select sum(monto) from mant where mant.mes = meses.mes), 0)) as total,
       (select gasto_mensual from gm) as gastos,
       round(coalesce((select sum(monto) from dev where dev.mes = meses.mes), 0))
         + round(coalesce((select sum(monto) from mant where mant.mes = meses.mes), 0))
         - (select gasto_mensual from gm) as neto
from meses;

-- En el orden en que el Apps Script los encuentra: proyectos y desarrollos por fila
create or replace view crm_giwa.v_proy_sin_fecha with (security_invoker = true) as
select coalesce(nullif(p.nombre, ''), p.id) || ' · ' || coalesce(d.titulo, '') as texto,
       row_number() over (order by pr.orden, dd.orden) as n
from crm_giwa.v_desarrollos_plata d
join crm_giwa.v_proyectos_plata p on p.id = d.proyecto_id and p.es_ganado
join crm_giwa.proyectos pr on pr.id = p.id
join crm_giwa.desarrollos dd on dd.id = d.id
where not d.es_mantenimiento and d.es_facturable and d.saldo > 1
order by pr.orden, dd.orden
limit 8;

reset role;

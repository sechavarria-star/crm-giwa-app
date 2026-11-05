-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · ¿Dónde podríamos estar? con un solo gráfico · 05/11/2026
-- ──────────────────────────────────────────────────────────────────────
--   v_fin_ventas_mes   cada negocio de la lista (pipeline, detenidos y no aceptados)
--                      repartido en los 12 meses de v_proyeccion_12m:
--                        venta  el desarrollo, cobro único: 50% el mes del cierre y 50% dos meses después
--                               (detenido: lo que falta cobrar, entero, el mes que viene)
--                        fee    la cuota mensual, desde el mes del cierre y todos los meses siguientes
--                        prob   la probabilidad del proyecto (sólo pipeline; el resto, 0)
--                      Cierre = mes de la propuesta + 60 días, nunca antes del mes que viene;
--                      sin propuesta, hoy + 60 días. Detenidos y no aceptados: el mes que viene.
--   La pantalla suma: forecast = venta × prob; lo tildado entra al 100%.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_fin_ventas_mes with (security_invoker = true) as
with e as (
  select proy_id, origen, una_vez, por_mes from crm_giwa.v_fin_escenarios
  union all
  select proy_id, origen, una_vez, por_mes from crm_giwa.v_fin_no_aceptados
), b as (
  select e.proy_id, e.origen, coalesce(e.una_vez, 0) as venta, coalesce(e.por_mes, 0) as fee,
         case when e.origen = 'pipeline' then coalesce(p.probabilidad, 0) else 0 end as prob,
         greatest((date_trunc('month', crm_giwa.hoy()) + interval '1 month')::date,
                  date_trunc('month', case when e.origen = 'pipeline' then coalesce(p.fecha_propuesta::date, crm_giwa.hoy()) + 60
                                           else crm_giwa.hoy() end)::date) as cierre
    from e left join crm_giwa.v_proyectos_clasif p on p.id = e.proy_id
)
select * from (
  select b.proy_id, m.orden, m.mes, b.prob,
         round(case when b.origen = 'detenido' then case when m.mes = b.cierre then b.venta else 0 end
                    when m.mes = b.cierre or m.mes = (b.cierre + interval '2 months')::date then b.venta / 2
                    else 0 end) as venta,
         case when m.mes >= b.cierre then b.fee else 0 end as fee
    from b cross join crm_giwa.v_proyeccion_12m m
) x where venta > 0 or fee > 0;

grant select on crm_giwa.v_fin_ventas_mes to authenticated;

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · las cuentas, capa 2a: el resumen financiero · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Traducción de Calculos.gs getResumenFinanciero (y las _m* que usa) sobre
-- la capa 1 (v_proyectos_plata, v_desarrollos_plata, v_cobros_plata), que
-- ya dio cero diferencias contra el Apps Script (validar-20261023-161902).
--
--   v_resumen_financiero     una fila: los recuadros del dashboard
--   v_resumen_por_empresa    por_empresa (los ganados, agrupados)
--   v_pendiente_dev          pend_dev  (desarrollos con saldo)
--   v_pendiente_mant         pend_mant (abonos con cuotas o saldo)
--
-- Quedan para la capa 2b, con la tabla diaria del BCRA: proyeccion_mant,
-- gasto_mensual y proy_sin_fecha (dependen del tipo de cambio de cada gasto
-- y de las fechas de cada cuota).
--
-- Igual que el Apps Script:
--   · «en pipeline» = no ganado, no detenido y sin rechaz/cancel/perdid/
--     detenid en el estado (_mEnPipeline). Vale lo cotizado; si es 0, lo
--     contratado (`_n(cotizado) || _n(final)`).
--   · los conteos de desarrollos de negociación miran TODOS los desarrollos
--     del proyecto (p.items), incluidos los rechazados.
--   · un abono dura 12 cuotas (ver capa 1).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- Lo que se repite: los proyectos ganados y los que están en pipeline
create or replace view crm_giwa.v_proyectos_clasif with (security_invoker = true) as
select p.*,
       coalesce(nullif(e.nombre, ''), nullif(p.empresa_id, ''), '—') as empresa,
       (not p.es_ganado and not p.detenido
        and crm_giwa.norm(p.estado_proyecto) !~ '(rechaz|cancel|perdid|detenid)') as en_pipeline,
       case when p.monto_cotizado <> 0 then p.monto_cotizado else p.monto_final_ars end as valor_pipeline
from crm_giwa.v_proyectos_plata p
left join crm_giwa.empresas e on e.id = p.empresa_id;

create or replace view crm_giwa.v_resumen_financiero with (security_invoker = true) as
with p as (select * from crm_giwa.v_proyectos_clasif),
g as (select * from p where es_ganado),
gi as (                                                -- desarrollos de los proyectos ganados
  select d.* from crm_giwa.v_desarrollos_plata d join g on g.id = d.proyecto_id),
neg as (select * from p where en_pipeline and estado_proyecto = 'Negociación'),
negi as (select d.* from crm_giwa.v_desarrollos_plata d join neg on neg.id = d.proyecto_id
         where not d.es_mantenimiento)
select
  (select coalesce(sum(monto_final_ars), 0) from g)                                    as contratado,
  (select coalesce(sum(monto_final_ars), 0) + coalesce(sum(saldo_mant), 0) from g)     as contratado_total,
  (select coalesce(sum(recurrente_mensual), 0) from g)                                 as contratado_mant_mes,
  (select coalesce(sum(monto), 0) from crm_giwa.v_cobros_plata)                        as cobrado,
  (select coalesce(sum(monto), 0) from crm_giwa.v_cobros_plata)                        as cobrado_caja,
  (select coalesce(sum(cobrado_dev), 0) from g)                                        as cobrado_dev,
  (select coalesce(sum(cobrado_mant), 0) from g)                                       as cobrado_mant,
  (select coalesce(sum(monto_facturado), 0) from g)                                    as cobrado_ganados,
  (select coalesce(sum(saldo), 0) from g)                                              as saldo,
  (select coalesce(sum(saldo_mant), 0) from g)                                         as saldo_mant,
  (select coalesce(sum(detenido_monto), 0) from g)                                     as detenido,
  (select coalesce(sum(bonificacion + bonificacion_mant), 0) from g)                   as bonificado,
  (select coalesce(sum(recurrente_mensual), 0) from g)                                 as recurrente_mensual,
  (select coalesce(sum(valor_pipeline), 0) from p where en_pipeline)                   as pipeline,
  (select coalesce(sum(valor_pipeline * coalesce(probabilidad, 0) / 100), 0) from p where en_pipeline) as pipeline_ponderado,
  (select count(*) from g)                                                             as cant_ganados,
  (select count(*) from p where en_pipeline)                                           as cant_pipeline,
  (select count(*) from g where estado_proyecto = 'Activo')                            as cant_activos,
  (select coalesce(sum(cuotas_facturadas), 0) from gi where es_mantenimiento and es_facturable) as cuotas_mant_hechas,
  (select coalesce(sum(duracion_cuotas), 0) from gi where es_mantenimiento and es_facturable)   as cuotas_mant_total,
  (select count(*) from gi where not es_mantenimiento and es_facturable and saldo > 1)          as dev_pend_cant,
  (select coalesce(sum(saldo), 0) from gi where not es_mantenimiento and es_facturable and saldo > 1) as dev_pend_monto,
  (select count(*) from gi where not es_mantenimiento and es_ejecutando)                        as dev_act_cant,
  (select coalesce(sum(total_ars), 0) from gi where not es_mantenimiento and es_ejecutando)     as dev_act_monto,
  (select count(*) from gi where es_mantenimiento and es_ejecutando)                            as mant_act_cant,
  (select count(*) from gi where es_mantenimiento and es_ejecutando)                            as cant_mant_activos,
  (select coalesce(sum(cuota * duracion_cuotas), 0) from gi where es_mantenimiento and es_ejecutando) as mant_act_monto,
  (select count(*) from g where estado_proyecto = 'Aprobado')                          as proy_aprob_cant,
  (select coalesce(sum(monto_final_ars), 0) from g where estado_proyecto = 'Aprobado') as proy_aprob_monto,
  (select count(*) from g where detenido_monto > 1)                                    as proy_det_cant,
  (select count(*) from neg)                                                           as cant_negociacion,
  (select count(*) from negi)                                                          as dev_negociacion,
  (select coalesce(sum(total_ars), 0) from negi)                                       as monto_negociacion;

create or replace view crm_giwa.v_resumen_por_empresa with (security_invoker = true) as
select empresa, min(empresa_id) as empresa_id,
       sum(monto_final_ars)                      as contratado,
       sum(cobrado_dev)                          as cobrado,
       sum(saldo)                                as saldo,
       sum(bonificacion + bonificacion_mant)     as bonificado,
       sum(recurrente_mensual)                   as mant_mes,
       sum(cobrado_mant)                         as cobrado_mant,
       count(*)                                  as proyectos
from crm_giwa.v_proyectos_clasif where es_ganado
group by empresa;

create or replace view crm_giwa.v_pendiente_dev with (security_invoker = true) as
select id as proy_id, empresa, nombre, monto_final_ars as contratado, cobrado_dev as cobrado, saldo
from crm_giwa.v_proyectos_clasif
where es_ganado and abs(saldo) > 1;

create or replace view crm_giwa.v_pendiente_mant with (security_invoker = true) as
select id as proy_id, empresa, nombre, recurrente_mensual as cuota,
       greatest(0, cuotas_totales - cuotas_restantes) as cobradas,
       cuotas_totales as totales, cuotas_restantes as restantes, saldo_mant as saldo
from crm_giwa.v_proyectos_clasif
where es_ganado and (saldo_mant > 1 or cuotas_restantes > 0);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Estado financiero (el «Resumen Financiero» del Portal) · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Lo demás ya estaba en la base: v_resumen_financiero (los recuadros),
-- v_resumen_por_empresa y v_proyectos_clasif (Por cliente), v_proyeccion_12m
-- y v_proy_sin_fecha (Proyección). Faltaban tres cosas que el Portal calcula en
-- el servidor del Apps Script, y la app no calcula plata en el navegador:
--   v_fin_caja_mes   = totalMes de getDashboardFinanciero (cobrado este mes, por fecha de comprobante)
--   v_fin_escenarios = getProyeccion: lo que entraría si se da cada negocio (pipeline o detenido)
--   v_fin_negocios   = getNegociosASeguir: el pipeline con desarrollo, abono, probabilidad y esperado
-- Mismas reglas que el Apps Script; no hay cálculos nuevos.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_fin_caja_mes with (security_invoker = true) as
select coalesce(sum(monto), 0) as cobrado_mes, count(*) as cobros
  from crm_giwa.v_cobros_det
 where fecha >= date_trunc('month', crm_giwa.hoy()) and fecha < date_trunc('month', crm_giwa.hoy()) + interval '1 month';

-- getProyeccion: proyectos en borrador/prospecto/negociación o detenidos, con desarrollos.
-- Desarrollo: el total (si está detenido, lo que falta cobrar). Abono: la cuota,
-- salvo el que ya factura (en curso y no detenido), que ya está en el recurrente de hoy.
create or replace view crm_giwa.v_fin_escenarios with (security_invoker = true) as
select * from (
  select p.id as proy_id, p.empresa, p.nombre as proyecto,
         case when p.detenido then 'detenido' else 'pipeline' end as origen, p.estado_proyecto as estado,
         round(coalesce(sum(case when not d.es_mantenimiento then
           case when p.detenido then greatest(0, coalesce(d.total_ars, 0) - coalesce(d.facturado, 0)) else coalesce(d.total_ars, 0) end end), 0)) as una_vez,
         round(coalesce(sum(case when d.es_mantenimiento and not (not p.detenido and crm_giwa.estado_canonico(d.estado_id) = 'curso')
           then coalesce(d.cuota, 0) end), 0)) as por_mes
    from crm_giwa.v_proyectos_clasif p
    join crm_giwa.v_desarrollos_plata d on d.proyecto_id = p.id and crm_giwa.estado_canonico(d.estado_id) not in ('rechazada', 'finalizada')
   where p.detenido or crm_giwa.norm(coalesce(p.estado_guardado, p.estado_proyecto, '')) ~ '(borrador|prospec|negoci)'
   group by p.id, p.empresa, p.nombre, p.detenido, p.estado_proyecto) e
 where una_vez > 0 or por_mes > 0;

-- getNegociosASeguir: lo que está en pipeline (en_pipeline, el mismo filtro que el recuadro).
-- Desarrollo y abono separados: el abono es por mes y no se suma al esperado.
create or replace view crm_giwa.v_fin_negocios with (security_invoker = true) as
select n.*, round(n.monto * n.prob / 100) as esperado from (
  select p.id, p.empresa, p.nombre, coalesce(nullif(p.estado_proyecto, ''), 'Prospecto') as estado,
         coalesce(nullif(coalesce(sum(d.total_ars) filter (where not d.es_mantenimiento and not d.es_rechazado), 0), 0),
                  nullif(p.monto_cotizado, 0), p.monto_final_ars, 0) as monto,
         coalesce(sum(coalesce(nullif(d.cuota, 0), d.total_ars)) filter (where d.es_mantenimiento and not d.es_rechazado), 0) as mant_mes,
         coalesce(p.probabilidad, 0) as prob, p.fecha_propuesta
    from crm_giwa.v_proyectos_clasif p
    left join crm_giwa.v_desarrollos_plata d on d.proyecto_id = p.id
   where p.en_pipeline
   group by p.id, p.empresa, p.nombre, p.estado_proyecto, p.probabilidad, p.monto_cotizado, p.monto_final_ars, p.fecha_propuesta) n;

grant select on crm_giwa.v_fin_caja_mes, crm_giwa.v_fin_escenarios, crm_giwa.v_fin_negocios to authenticated;

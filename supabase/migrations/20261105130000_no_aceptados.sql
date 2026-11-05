-- ¿Dónde podríamos estar?: los proyectos no aceptados, para poder simular si los retoman (05/11/2026).
-- Antes: se aplicó también 20261102180000_crm_giwa_usuarios_dni_cargo.sql, que había quedado sin correr.
set role crm_giwa_dev;
create or replace view crm_giwa.v_fin_no_aceptados with (security_invoker = true) as
select e.proy_id, e.empresa, e.proyecto, 'no_aceptado'::text as origen, e.estado, e.una_vez, e.por_mes
  from (select p.id as proy_id, p.empresa, p.nombre as proyecto, p.estado_proyecto as estado,
               round(coalesce(sum(case when not d.es_mantenimiento then coalesce(d.total_ars, 0) end), 0)) as una_vez,
               round(coalesce(sum(case when d.es_mantenimiento then coalesce(d.cuota, 0) end), 0)) as por_mes
          from crm_giwa.v_proyectos_clasif p
          join crm_giwa.v_desarrollos_plata d on d.proyecto_id = p.id and crm_giwa.estado_canonico(d.estado_id) = 'rechazada'
         where crm_giwa.norm(coalesce(p.estado_proyecto, '')) ~ 'rechaz' and coalesce(p.empresa, '') !~* '^giwa'
         group by p.id, p.empresa, p.nombre, p.estado_proyecto) e
 where e.una_vez > 0 or e.por_mes > 0;
grant select on crm_giwa.v_fin_no_aceptados to authenticated;
reset role;

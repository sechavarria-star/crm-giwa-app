-- Pedido de Vicky, 25/11/2026
-- 1 · Mockups y demostraciones: proyectos.tipo = 'Demo' (campo existente). v_proyectos_plata los deja afuera, y con eso salen de la lista,
--     los indicadores, el pipeline y los clientes. v_pm_demos es la sección propia, con links y valor de referencia.
-- 2 · Se eliminan Monotax y CertiCheck (copia completa en admin_auditoria).
-- 3 · Los no aceptados no tienen inicio ni fin. Fechas probables y de rechazo que indicó Vicky. El historial no se toca.
set role crm_giwa_dev;
set search_path = crm_giwa, public;

do $$
declare o text; n text;
begin
  o := pg_get_viewdef('crm_giwa.v_proyectos_plata'::regclass, true);
  n := replace(o, $a$WHERE norm(p.estado_id) !~~ '%borrador%'::text$a$, $a$WHERE norm(p.estado_id) !~~ '%borrador%'::text AND COALESCE(p.tipo, ''::text) <> 'Demo'::text$a$);
  if n = o then raise exception 'v_proyectos_plata'; end if;
  execute 'create or replace view crm_giwa.v_proyectos_plata with (security_invoker = true) as ' || n;
end $$;

create or replace view crm_giwa.v_pm_demos with (security_invoker = true) as
 select p.id, coalesce(e.nombre, p.empresa_id) as empresa, p.empresa_id, p.nombre, coalesce(p.resumen_ejecutivo, '') as descripcion, p.estado_id as estado,
        coalesce(p.carpeta, '') as carpeta, coalesce((select sum(a.referencia) from crm_giwa.v_analisis_devs a where a.proyecto_id = p.id), 0) as valor,
        coalesce((select sum(a.horas) from crm_giwa.v_analisis_devs a where a.proyecto_id = p.id), 0) as horas,
        coalesce((select jsonb_agg(jsonb_build_object('titulo', x.titulo, 'tipo', x.tipo, 'accesos', x.accesos) order by x.creado)
                    from crm_giwa.entregables x where x.proyecto_id = p.id), '[]'::jsonb) as links, p.orden
   from crm_giwa.proyectos p left join crm_giwa.empresas e on e.id = p.empresa_id
  where p.tipo = 'Demo';
grant select on crm_giwa.v_pm_demos to authenticated, service_role;

create temp table _antes on commit drop as
  select 'proyectos'::text tabla, id registro, to_jsonb(p) antes from crm_giwa.proyectos p
  union all select 'desarrollos', id, to_jsonb(d) from crm_giwa.desarrollos d
  union all select 'entregables', id, to_jsonb(x) from crm_giwa.entregables x where id = 'E-0003';

-- Monotax y CertiCheck
insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, motivo)
select 'v.gagey@giwa-ia.com', 'proyectos', p.id, 'borrar',
       jsonb_build_object('proyecto', to_jsonb(p),
         'desarrollos', (select jsonb_agg(to_jsonb(d)) from crm_giwa.desarrollos d where d.proyecto_id = p.id),
         'historial', (select jsonb_agg(to_jsonb(h)) from crm_giwa.historial_proyecto h where h.proyecto_id = p.id),
         'fun_proyectos', (select jsonb_agg(to_jsonb(f)) from crm_giwa.fun_proyectos f join crm_giwa.desarrollos d on d.id = f.desarrollo_id where d.proyecto_id = p.id),
         'fun_marcas', (select jsonb_agg(to_jsonb(f)) from crm_giwa.fun_marcas f join crm_giwa.desarrollos d on d.id = f.desarrollo_id where d.proyecto_id = p.id)),
       'Pedido de Vicky 25/11/2026: eliminar Monotax y CertiCheck'
  from crm_giwa.proyectos p where p.id in ('P-0047', 'P-0048');
delete from crm_giwa.fun_marcas where desarrollo_id in (select id from crm_giwa.desarrollos where proyecto_id in ('P-0047', 'P-0048'));
delete from crm_giwa.fun_proyectos where desarrollo_id in (select id from crm_giwa.desarrollos where proyecto_id in ('P-0047', 'P-0048'));
delete from crm_giwa.desarrollos where proyecto_id in ('P-0047', 'P-0048');
delete from crm_giwa.proyectos where id in ('P-0047', 'P-0048') and empresa_id = 'EMP-001';

-- Muestras
update crm_giwa.proyectos set tipo = 'Demo'
 where id in ('P-0040', 'P-0041', 'P-0042', 'P-0043', 'P-0044', 'P-0045', 'P-0046', 'P-0049', 'P-0050', 'P-0051', 'P-0052', 'P-0053', 'P-0054', 'P-0055') and estado_id = 'Finalizado';
update crm_giwa.entregables set proyecto_id = 'P-0046' where id = 'E-0003' and proyecto_id is null;   -- Agente de gastos, con sus dos links

-- No aceptados: sin inicio ni fin (son correcciones: no son movimientos del proyecto)
alter table crm_giwa.proyectos disable trigger historial;
alter table crm_giwa.desarrollos disable trigger historial;
update crm_giwa.proyectos set fecha_cierre_probable = '2026-03-31', fecha_aprobacion = '2026-10-14' where id = 'P-0001' and estado_id = 'Rechazado';   -- CUBA WhatsApp: el rechazo estaba en el fin
update crm_giwa.proyectos set fecha_cierre_probable = '2026-03-31', fecha_aprobacion = '2026-06-17' where id = 'P-0011' and estado_id = 'Rechazado';   -- Camuzzi: rechazo según el respaldo
update crm_giwa.proyectos set fecha_cierre_probable = '2026-03-31' where id = 'P-0015' and estado_id = 'Rechazado';
update crm_giwa.proyectos set fecha_cierre_probable = '2026-04-30' where id = 'P-0017' and estado_id = 'Rechazado';
update crm_giwa.proyectos set fecha_cierre_probable = '2026-05-31' where id = 'P-0018' and estado_id = 'Rechazado';
update crm_giwa.proyectos set fecha_cierre_probable = null where id = 'P-0016' and fecha_cierre_probable = '2026-10-09';   -- B&B: era la de fin
update crm_giwa.proyectos set fecha_inicio = null, fecha_finalizado = null where estado_id = 'Rechazado' and (fecha_inicio is not null or fecha_finalizado is not null);
update crm_giwa.desarrollos set fecha_inicio = null, fecha_fin = null
 where estado_id = 'Rechazado' and proyecto_id in (select id from crm_giwa.proyectos where estado_id = 'Rechazado') and (fecha_inicio is not null or fecha_fin is not null);
alter table crm_giwa.proyectos enable trigger historial;
alter table crm_giwa.desarrollos enable trigger historial;

insert into crm_giwa.admin_auditoria (quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', a.tabla, a.registro, 'editar', a.antes, b.despues, 'Pedido de Vicky 25/11/2026: mockups y demostraciones, y fechas de no aceptados'
  from _antes a join (
    select 'proyectos'::text tabla, id registro, to_jsonb(p) despues from crm_giwa.proyectos p
    union all select 'desarrollos', id, to_jsonb(d) from crm_giwa.desarrollos d
    union all select 'entregables', id, to_jsonb(x) from crm_giwa.entregables x) b using (tabla, registro)
 where a.antes - 'actualizado' is distinct from b.despues - 'actualizado';

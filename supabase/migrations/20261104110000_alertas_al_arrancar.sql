-- Las alertas de Facturación se crean una vez iniciado el desarrollo (04/11/2026, reemplaza 20261030100000).
-- Arrancar ya las crea (accion_desarrollo → crear_recordatorios). Lo que sobraba: la fila de «aprobado sin
-- facturar» en v_recordatorios_faltan y la excepción que dejaba abierta la alerta de un aprobado.
set role crm_giwa_dev;

do $$
declare d text; n text; o text;
begin
  o := pg_get_viewdef('crm_giwa.v_recordatorios_faltan'::regclass, true);
  n := replace(o, 'WHERE d.canon = ''aprobada''::text AND NOT COALESCE(d.bonificado, false)', 'WHERE false AND NOT COALESCE(d.bonificado, false)');
  if n = o then raise exception 'No encontré la fila de aprobados en v_recordatorios_faltan'; end if;
  execute 'create or replace view crm_giwa.v_recordatorios_faltan with (security_invoker = true) as ' || n;

  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'sincronizar_alertas_facturacion';
  n := regexp_replace(o, '\s*-- aprobado: queda abierta[^\n]*\n[^\n]*= ''aprobada''\) then continue; end if;', '');
  if n = o then raise exception 'No encontré la excepción de aprobados en sincronizar_alertas_facturacion'; end if;
  execute n;
end $$;

-- Prune: se cancelan las dos que se crearon antes de arrancar
select set_config('request.jwt.claims', '{"email":"v.gagey@giwa-ia.com"}', true);
update crm_giwa.tareas set estado = 'Cancelada', enviada = true where id in ('T-0072', 'T-0073');
select crm_giwa._comentar_tarea(id, 'Cancelada: la alerta de facturación se crea al arrancar el desarrollo.') from crm_giwa.tareas where id in ('T-0072', 'T-0073');

reset role;

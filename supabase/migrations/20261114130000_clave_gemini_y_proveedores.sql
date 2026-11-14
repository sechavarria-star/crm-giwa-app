-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Clave de Gemini en la base y lista de proveedores · 14/11/2026
-- ──────────────────────────────────────────────────────────────────────
--   guardar_clave_gemini(clave)  sólo Victoria (es_duena). Va a crm_giwa.secretos,
--                                como el token de Telegram: no vuelve nunca al navegador.
--   gemini_estado()              cargada sí/no y cuándo (sólo Victoria).
--   _clave_gemini()              la lee la función factura-leer con service_role.
--   _admin_tablas()              + proveedores (Configuración › Datos).
--   v_proveedores                cada proveedor con su contratación, cantidad de
--                                facturas, total y la última (Configuración › Tipos de gastos).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.guardar_clave_gemini(clave text) returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare k text := trim(coalesce(clave, ''));
begin
  if not crm_giwa.es_duena() then raise exception 'Sólo Victoria puede cambiar la clave de Gemini.'; end if;
  if k !~ '^[\w-]{30,}$' then raise exception 'Eso no parece una clave de Gemini (AIza…).'; end if;
  insert into crm_giwa.secretos (clave, valor) values ('gemini_api_key', k)
    on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.gemini_estado() returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
begin
  if not crm_giwa.es_duena() then raise exception 'Sin permiso'; end if;
  return jsonb_build_object('configurado', exists (select 1 from crm_giwa.secretos where clave = 'gemini_api_key'),
                            'actualizado', (select actualizado from crm_giwa.secretos where clave = 'gemini_api_key'));
end $$;

create or replace function crm_giwa._clave_gemini() returns text
language sql stable security definer set search_path = crm_giwa, public as $$
  select valor from crm_giwa.secretos where clave = 'gemini_api_key'
$$;

revoke all on function crm_giwa._clave_gemini() from public, anon, authenticated;
grant execute on function crm_giwa._clave_gemini() to service_role;
grant execute on function crm_giwa.guardar_clave_gemini(text), crm_giwa.gemini_estado() to authenticated;

create or replace function crm_giwa._admin_tablas() returns text[] language sql immutable as $$
  select array['empresas','contactos','razones_sociales','proyectos','desarrollos','cobros','tareas','comentarios',
               'gastos_internos','entregables','proveedor_docs','proyecto_horas','proyecto_costos',
               'mercado_referencias','mercado_parametros','mercado_plataforma','mercado_speeches','proveedores']
$$;

create or replace view crm_giwa.v_proveedores with (security_invoker = true) as
select v.id, v.razon_social, v.cuit, coalesce(v.condicion_iva, '') as condicion_iva,
       v.contratacion_id, coalesce(k.producto, '') as contratacion,
       count(g.id) as facturas, coalesce(sum(g.monto_ars), 0) as total_ars, max(g.fecha) as ultima
from crm_giwa.proveedores v
left join crm_giwa.contrataciones k on k.id = v.contratacion_id
left join crm_giwa.gastos_internos g on g.proveedor_id = v.id
group by v.id, k.producto;
grant select on crm_giwa.v_proveedores to authenticated;

reset role;

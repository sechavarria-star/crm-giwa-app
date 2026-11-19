-- nuevo_id saltea los números que ya existen (19/11/2026)
-- El 19/11 la tarea nueva chocó con T-0099 y T-0100, creadas con el número puesto a mano:
-- el contador no se enteró. Ahora, si el número ya está en la tabla que usa ese contador,
-- se pide el siguiente. Los huecos (tareas borradas a propósito) quedan como están.
-- Misma firma: sirve para todas las tablas que numeran con nuevo_id.
create or replace function crm_giwa.nuevo_id(prefijo text, secuencia text, ancho integer)
returns text language plpgsql as $$
declare
  tabla text;
  n text;
  libre boolean;
begin
  -- la tabla cuyo id usa este contador (gastos_seq numera gastos_internos, por eso no sale del nombre)
  select cl.relname into tabla
    from pg_attrdef d
    join pg_class cl on cl.oid = d.adrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where ns.nspname = 'crm_giwa' and a.attname = 'id'
     and pg_get_expr(d.adbin, d.adrelid) like '%''' || secuencia || '''%'
   limit 1;
  loop
    n := nextval('crm_giwa.' || secuencia)::text;
    n := prefijo || '-' || lpad(n, greatest(ancho, length(n)), '0');
    exit when tabla is null;
    execute format('select not exists (select 1 from crm_giwa.%I where id = $1)', tabla) into libre using n;
    exit when libre;
  end loop;
  return n;
end $$;

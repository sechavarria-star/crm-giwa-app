-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · acceso de Vicky SÓLO al CRM · 20/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Giwa_Database tiene los datos de todos los clientes (ko, ypf, byd,
-- realstate…). El dashboard de Supabase no se puede limitar a un schema, así
-- que Vicky NO está en la org: entra con un usuario de Postgres propio.
--
--   crm_giwa_dev  (sin login)  dueño de todo crm_giwa: datos y estructura.
--   vicky_crm     (con login)  al conectarse actúa como crm_giwa_dev
--                              (ALTER ROLE … SET role). Sin contraseña acá:
--                              la pone el usuario desde el editor SQL.
--
-- Fuera de crm_giwa no tiene nada: ni otros schemas, ni auth, ni storage.
-- Para quitarle el acceso: ALTER ROLE vicky_crm NOLOGIN;
-- ══════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'crm_giwa_dev') then
    create role crm_giwa_dev nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'vicky_crm') then
    create role vicky_crm login noinherit;   -- sin contraseña: no entra hasta que se la pongan
  end if;
end $$;

grant crm_giwa_dev to vicky_crm;
grant crm_giwa_dev to postgres;             -- postgres sigue pudiendo todo en crm_giwa
alter role vicky_crm set role = 'crm_giwa_dev';
alter role vicky_crm set search_path = crm_giwa;
alter role vicky_crm connection limit 5;

-- El schema y todo lo que tiene pasa a ser de crm_giwa_dev
alter schema crm_giwa owner to crm_giwa_dev;
do $$
declare r record;
begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'crm_giwa' and c.relkind in ('r','v','m','S','p')
             -- una secuencia de identity/serial cambia de dueño con su tabla
             and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
                             and d.objid = c.oid and d.deptype in ('a','i'))
           order by c.relkind = 'S' loop
    execute format('alter %s crm_giwa.%I owner to crm_giwa_dev',
      case r.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' else 'table' end,
      r.relname);
  end loop;
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'crm_giwa' loop
    execute format('alter function %s owner to crm_giwa_dev', r.f);
  end loop;
end $$;

-- Lo que cree Vicky de acá en más tiene que seguir funcionando para la app
alter default privileges for role crm_giwa_dev in schema crm_giwa
  grant all on tables to service_role;
alter default privileges for role crm_giwa_dev in schema crm_giwa
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role crm_giwa_dev in schema crm_giwa
  grant usage, select on sequences to service_role, authenticated;
alter default privileges for role crm_giwa_dev in schema crm_giwa
  grant execute on functions to service_role, authenticated;
-- y lo que siga creando postgres (migraciones nuestras), también para ella
alter default privileges for role postgres in schema crm_giwa
  grant all on tables to crm_giwa_dev;
alter default privileges for role postgres in schema crm_giwa
  grant all on sequences to crm_giwa_dev;

-- Nada fuera de crm_giwa: no se le da ningún permiso más. Lo que Postgres
-- le da a todo rol (PUBLIC: ver el catálogo, USAGE en public) no se puede
-- quitar por rol; lo que importa —que no lea ni escriba ninguna tabla de otro
-- schema— se verifica en el SELECT de abajo y tiene que dar 0 filas.

-- Administración de datos (03/11/2026) · SÓLO Victoria
-- El permiso está en la base: cada función pregunta es_duena() (el mail del token) y corta si no es ella.
-- La pantalla sólo dibuja lo que estas funciones devuelven. Todo cambio y todo borrado queda en
-- admin_auditoria con el antes, el después, quién, cuándo y el motivo (obligatorio).
-- Tablas habilitadas: las de negocio con clave «id». Usuarios, secretos y configuración, no.
set role crm_giwa_dev;

create or replace function crm_giwa.es_duena() returns boolean language sql stable as $$
  select lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '')) = 'v.gagey@giwa-ia.com'
$$;
grant execute on function crm_giwa.es_duena() to authenticated;

create table if not exists crm_giwa.admin_auditoria (
  id        bigint generated always as identity primary key,
  cuando    timestamptz not null default now(),
  quien     text not null,
  tabla     text not null,
  registro  text not null,
  accion    text not null check (accion in ('editar', 'borrar')),
  antes     jsonb,
  despues   jsonb,
  motivo    text not null
);
alter table crm_giwa.admin_auditoria enable row level security;
drop policy if exists duena_lee on crm_giwa.admin_auditoria;
create policy duena_lee on crm_giwa.admin_auditoria for select to authenticated using ((select crm_giwa.es_duena()));
revoke all on crm_giwa.admin_auditoria from authenticated;
grant select on crm_giwa.admin_auditoria to authenticated;

create or replace function crm_giwa._admin_tablas() returns text[] language sql immutable as $$
  select array['empresas','contactos','razones_sociales','proyectos','desarrollos','cobros','tareas','comentarios',
               'gastos_internos','entregables','proveedor_docs','proyecto_horas','proyecto_costos']
$$;

create or replace function crm_giwa._admin_ok(tabla text) returns void language plpgsql stable as $$
begin
  if not crm_giwa.es_duena() then raise exception 'Sin permiso: la administración de datos es sólo para Victoria.'; end if;
  if tabla is not null and not (tabla = any(crm_giwa._admin_tablas())) then raise exception 'La tabla % no se administra desde acá.', tabla; end if;
end $$;

-- Tablas con su cantidad de filas
create or replace function crm_giwa.admin_tablas() returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare t text; n bigint; r jsonb := '[]'::jsonb;
begin
  perform crm_giwa._admin_ok(null);
  foreach t in array crm_giwa._admin_tablas() loop
    execute format('select count(*) from crm_giwa.%I', t) into n;
    r := r || jsonb_build_object('tabla', t, 'filas', n);
  end loop;
  return r;
end $$;

-- Filas (búsqueda en todo el registro como texto), de a páginas
create or replace function crm_giwa.admin_leer(tabla text, q text default '', lim int default 100, desde int default 0) returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare filas jsonb; total bigint; cols jsonb;
begin
  perform crm_giwa._admin_ok(tabla);
  select jsonb_agg(jsonb_build_object('col', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod)) order by a.attnum) into cols
    from pg_attribute a where a.attrelid = ('crm_giwa.' || quote_ident(tabla))::regclass and a.attnum > 0 and not a.attisdropped;
  execute format('select count(*) from crm_giwa.%I t where $1 = '''' or t::text ilike ''%%'' || $1 || ''%%''', tabla) into total using coalesce(q, '');
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select * from crm_giwa.%I t where $1 = '''' or t::text ilike ''%%'' || $1 || ''%%'' order by t.id::text limit $2 offset $3) x', tabla)
    into filas using coalesce(q, ''), least(greatest(coalesce(lim, 100), 1), 500), greatest(coalesce(desde, 0), 0);
  return jsonb_build_object('cols', cols, 'filas', filas, 'total', total);
end $$;

-- Qué otros registros apuntan a éste (claves foráneas y, en desarrollos, los mantenimientos que lo cubren)
create or replace function crm_giwa.admin_relaciones(tabla text, rid text) returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare f record; ids jsonb; r jsonb := '[]'::jsonb;
begin
  perform crm_giwa._admin_ok(tabla);
  for f in
    select c.conrelid::regclass::text as hija, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = ('crm_giwa.' || quote_ident(tabla))::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('select jsonb_agg(id::text) from (select id from %s where %I::text = $1 limit 50) x', f.hija, f.col) into ids using rid;
    if ids is not null then r := r || jsonb_build_object('tabla', replace(f.hija, 'crm_giwa.', ''), 'columna', f.col, 'ids', ids, 'n', jsonb_array_length(ids)); end if;
  end loop;
  if tabla = 'desarrollos' then
    select jsonb_agg(id) into ids from crm_giwa.desarrollos where rid = any(mant_de);
    if ids is not null then r := r || jsonb_build_object('tabla', 'desarrollos', 'columna', 'mant_de', 'ids', ids, 'n', jsonb_array_length(ids)); end if;
  end if;
  return r;
end $$;

-- Posibles duplicados: mismas columnas (sin mayúsculas, tildes ni espacios de más)
create or replace function crm_giwa.admin_duplicados(tabla text, columnas text[]) returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare clave text; r jsonb;
begin
  perform crm_giwa._admin_ok(tabla);
  if coalesce(array_length(columnas, 1), 0) = 0 then raise exception 'Elegí al menos una columna para comparar.'; end if;
  select string_agg(format('lower(btrim(coalesce(t.%I::text, '''')))', c), ' || ''|'' || ') into clave from unnest(columnas) c;
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''clave'', k, ''ids'', ids)), ''[]'') from (select %s as k, jsonb_agg(t.id::text order by t.id::text) ids, count(*) n from crm_giwa.%I t group by 1 having count(*) > 1) g', clave, tabla) into r;
  return r;
end $$;

-- Editar un registro: sólo las columnas que vienen en «cambios»; queda el antes y el después
create or replace function crm_giwa.admin_editar(tabla text, rid text, cambios jsonb, motivo text) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare antes jsonb; despues jsonb; sets text;
begin
  perform crm_giwa._admin_ok(tabla);
  if coalesce(btrim(motivo), '') = '' then raise exception 'Escribí el motivo del cambio.'; end if;
  execute format('select to_jsonb(t) from crm_giwa.%I t where t.id::text = $1', tabla) into antes using rid;
  if antes is null then raise exception 'No existe % en %.', rid, tabla; end if;
  select string_agg(format('%I = r.%I', k, k), ', ') into sets
    from jsonb_object_keys(coalesce(cambios, '{}'::jsonb)) k
   where k <> 'id' and antes ? k;
  if sets is null then raise exception 'No hay cambios para guardar.'; end if;
  execute format('update crm_giwa.%I t set %s from jsonb_populate_record(null::crm_giwa.%I, $1) r where t.id::text = $2', tabla, sets, tabla) using cambios, rid;
  execute format('select to_jsonb(t) from crm_giwa.%I t where t.id::text = $1', tabla) into despues using rid;
  insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
  values (current_setting('request.jwt.claims', true)::jsonb ->> 'email', tabla, rid, 'editar', antes, despues, btrim(motivo));
  return jsonb_build_object('ok', true, 'antes', antes, 'despues', despues);
end $$;

-- Borrar un registro: hay que repetir su id; si otros lo usan, la base no deja (y dice cuáles)
create or replace function crm_giwa.admin_borrar(tabla text, rid text, motivo text, confirmacion text) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare antes jsonb; rel jsonb;
begin
  perform crm_giwa._admin_ok(tabla);
  if coalesce(btrim(motivo), '') = '' then raise exception 'Escribí el motivo del borrado.'; end if;
  if coalesce(btrim(confirmacion), '') <> rid then raise exception 'Para borrar, escribí exactamente el id: %.', rid; end if;
  execute format('select to_jsonb(t) from crm_giwa.%I t where t.id::text = $1', tabla) into antes using rid;
  if antes is null then raise exception 'No existe % en %.', rid, tabla; end if;
  rel := crm_giwa.admin_relaciones(tabla, rid);
  if jsonb_array_length(rel) > 0 then
    raise exception 'No se borra: % lo usan otros registros (%). Reasignalos o borralos antes.', rid,
      (select string_agg((x ->> 'tabla') || '.' || (x ->> 'columna') || ' ×' || (x ->> 'n'), ', ') from jsonb_array_elements(rel) x);
  end if;
  execute format('delete from crm_giwa.%I t where t.id::text = $1', tabla) using rid;
  insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
  values (current_setting('request.jwt.claims', true)::jsonb ->> 'email', tabla, rid, 'borrar', antes, null, btrim(motivo));
  return jsonb_build_object('ok', true, 'borrado', antes);
end $$;

revoke all on function crm_giwa.admin_tablas() from public;
revoke all on function crm_giwa.admin_leer(text, text, int, int) from public;
revoke all on function crm_giwa.admin_relaciones(text, text) from public;
revoke all on function crm_giwa.admin_duplicados(text, text[]) from public;
revoke all on function crm_giwa.admin_editar(text, text, jsonb, text) from public;
revoke all on function crm_giwa.admin_borrar(text, text, text, text) from public;
grant execute on function crm_giwa.admin_tablas(), crm_giwa.admin_leer(text, text, int, int), crm_giwa.admin_relaciones(text, text),
  crm_giwa.admin_duplicados(text, text[]), crm_giwa.admin_editar(text, text, jsonb, text), crm_giwa.admin_borrar(text, text, text, text) to authenticated;

reset role;

-- schema demo (bot de demo de Telegram @GiwaDemoBot). Exportado del Supabase Giwa_Database el 12/11/2026.
-- Sólo estructura: sin datos ni secretos.
create schema if not exists demo;

create table demo.agenda (
  id bigint generated always as identity not null,
  sesion_id uuid not null,
  titulo text not null,
  inicio timestamp with time zone not null,
  lugar text,
  participantes bigint[] default '{}'::bigint[] not null,
  recordar timestamp with time zone
);

create table demo.comentarios (
  id bigint generated always as identity not null,
  sesion_id uuid not null,
  tarea_id bigint not null,
  autor bigint not null,
  texto text not null,
  menciones bigint[] default '{}'::bigint[] not null,
  creado timestamp with time zone default now() not null
);

create table demo.conversacion (
  chat_id text not null,
  paso text not null,
  datos jsonb default '{}'::jsonb not null,
  creado timestamp with time zone default now() not null
);

create table demo.envios (
  id bigint not null,
  metodo text not null,
  chat_id text,
  creado timestamp with time zone default now() not null
);

create table demo.personas (
  id bigint generated always as identity not null,
  sesion_id uuid not null,
  nombre text not null,
  rol text not null,
  vos boolean default false not null
);

create table demo.secretos (
  clave text not null,
  valor text not null
);

create table demo.sesiones (
  id uuid default gen_random_uuid() not null,
  token text not null,
  rubro text not null,
  nombre text not null,
  mail text not null,
  consiente boolean not null,
  chat_id text,
  tg_nombre text,
  tg_usuario text,
  creado timestamp with time zone default now() not null,
  vinculado timestamp with time zone,
  vence timestamp with time zone default (now() + '24:00:00'::interval) not null
);

create table demo.tareas (
  id bigint generated always as identity not null,
  sesion_id uuid not null,
  numero integer not null,
  titulo text not null,
  estado text default 'pendiente'::text not null,
  responsables bigint[] not null,
  creador bigint,
  vence date,
  recordar timestamp with time zone,
  creado timestamp with time zone default now() not null
);

create table demo.updates (
  id bigint not null,
  creado timestamp with time zone default now() not null
);

alter table demo.agenda add constraint agenda_pkey PRIMARY KEY (id);

alter table demo.comentarios add constraint comentarios_pkey PRIMARY KEY (id);

alter table demo.conversacion add constraint conversacion_pkey PRIMARY KEY (chat_id);

alter table demo.envios add constraint envios_pkey PRIMARY KEY (id);

alter table demo.personas add constraint personas_pkey PRIMARY KEY (id);

alter table demo.secretos add constraint secretos_pkey PRIMARY KEY (clave);

alter table demo.sesiones add constraint sesiones_token_key UNIQUE (token);

alter table demo.sesiones add constraint sesiones_pkey PRIMARY KEY (id);

alter table demo.sesiones add constraint sesiones_rubro_check CHECK ((rubro = ANY (ARRAY['oficina'::text, 'consultorio'::text])));

alter table demo.tareas add constraint tareas_sesion_id_numero_key UNIQUE (sesion_id, numero);

alter table demo.tareas add constraint tareas_pkey PRIMARY KEY (id);

alter table demo.tareas add constraint tareas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_curso'::text, 'finalizada'::text])));

alter table demo.updates add constraint updates_pkey PRIMARY KEY (id);

alter table demo.agenda add constraint agenda_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES demo.sesiones(id) ON DELETE CASCADE;

alter table demo.comentarios add constraint comentarios_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES demo.sesiones(id) ON DELETE CASCADE;

alter table demo.comentarios add constraint comentarios_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES demo.tareas(id) ON DELETE CASCADE;

alter table demo.personas add constraint personas_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES demo.sesiones(id) ON DELETE CASCADE;

alter table demo.tareas add constraint tareas_sesion_id_fkey FOREIGN KEY (sesion_id) REFERENCES demo.sesiones(id) ON DELETE CASCADE;

CREATE INDEX sesiones_chat ON demo.sesiones USING btree (chat_id);

alter table demo.agenda enable row level security;

alter table demo.comentarios enable row level security;

alter table demo.conversacion enable row level security;

alter table demo.envios enable row level security;

alter table demo.personas enable row level security;

alter table demo.secretos enable row level security;

alter table demo.sesiones enable row level security;

alter table demo.tareas enable row level security;

alter table demo.updates enable row level security;

CREATE OR REPLACE FUNCTION demo._agenda(sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare r record; dia date; txt text := '<b>Agenda de la semana</b>';
begin
  for r in select a.*, (a.inicio at time zone 'America/Argentina/Buenos_Aires') loc
             from demo.agenda a
            where a.sesion_id = sid and a.inicio >= demo._en(demo.hoy(), '00:00') and a.inicio < demo._en(demo.hoy() + 7, '00:00')
            order by a.inicio loop
    if dia is distinct from r.loc::date then
      dia := r.loc::date;
      txt := txt || E'\n\n<b>' || case when dia = demo.hoy() then 'Hoy' when dia = demo.hoy() + 1 then 'Mañana'
                                      else initcap(demo._dia(dia)) end || ' ' || to_char(dia, 'DD/MM') || '</b>';
    end if;
    txt := txt || E'\n' || to_char(r.loc, 'HH24:MI') || ' · ' || demo._esc(r.titulo) ||
           E'\n<i>' || demo._esc(coalesce(r.lugar || ' · ', '') || demo._nom(r.participantes, true)) || '</i>';
  end loop;
  if dia is null then txt := txt || E'\n\nNo hay nada agendado esta semana.'; end if;
  return jsonb_build_object('txt', txt, 'kb', null);
end $function$
;

CREATE OR REPLACE FUNCTION demo._alertas(sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare v bigint[]; h bigint[]; mt bigint[]; m text; yo bigint := demo._vos(sid);
begin
  select array_agg(id order by vence, numero) into v from demo.tareas where sesion_id = sid and estado <> 'finalizada' and vence < demo.hoy();
  select array_agg(id order by numero) into h from demo.tareas where sesion_id = sid and estado <> 'finalizada' and vence = demo.hoy();
  select string_agg('#' || t.numero || ' · ' || demo._esc(split_part(p.nombre, ' ', 1)) || E':\n<i>' || demo._esc(left(c.texto, 160)) || '</i>', E'\n\n' order by c.creado desc),
         array_agg(t.id order by c.creado desc)
    into m, mt
    from demo.comentarios c join demo.tareas t on t.id = c.tarea_id join demo.personas p on p.id = c.autor
   where c.sesion_id = sid and yo = any (c.menciones) and c.creado > now() - interval '7 days';
  return jsonb_build_object(
    'txt', '<b>Alertas</b>' || E'\n\n' ||
           '<b>Vencidas</b>' || E'\n' || coalesce(demo._lineas(v), 'Ninguna.') || E'\n\n' ||
           '<b>Vencen hoy</b>' || E'\n' || coalesce(demo._lineas(h), 'Ninguna.') || E'\n\n' ||
           '<b>Te mencionaron</b>' || E'\n' || coalesce(m, 'Nadie, por ahora.'),
    'kb', demo._kb_tareas(coalesce(v, '{}') || coalesce(h, '{}') || coalesce(mt, '{}')));
end $function$
;

CREATE OR REPLACE FUNCTION demo._ayuda()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select 'Usá los botones de abajo:' || E'\n\n' ||
         '<b>Mis tareas</b> · lo que tenés pendiente' || E'\n' ||
         '<b>Tablero</b> · el equipo como un Kanban' || E'\n' ||
         '<b>Nueva tarea</b> · creala y asignala' || E'\n' ||
         '<b>Equipo</b> · quién tiene qué' || E'\n' ||
         '<b>Alertas</b> · vencidas y menciones' || E'\n' ||
         '<b>Agenda</b> · la semana' || E'\n\n' ||
         'Abrí una tarea para cambiarle el estado, comentar con @menciones, delegarla o pedir un recordatorio.' || E'\n' ||
         '/reiniciar vuelve todo al inicio.'
$function$
;

CREATE OR REPLACE FUNCTION demo._boton(s demo.sesiones, mid bigint, dato text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  a text[] := string_to_array(coalesce(dato, ''), '|'); acc text := a[1];
  chat text := s.chat_id; yo bigint := demo._vos(s.id);
  t demo.tareas; c demo.conversacion; sel bigint[]; pid bigint; nom text; f date; r timestamptz;
begin
  -- Navegación
  if acc = 'mis' then perform demo._mostrar(chat, mid, demo._mis(s.id)); return ''; end if;
  if acc = 'tab' then perform demo._mostrar(chat, mid, demo._tablero(s.id)); return ''; end if;
  if acc = 'eq'  then perform demo._mostrar(chat, mid, demo._equipo(s.id)); return ''; end if;
  if acc = 'col' and a[2] in ('pendiente', 'en_curso', 'finalizada') then perform demo._mostrar(chat, mid, demo._columna(s.id, a[2])); return ''; end if;
  if acc = 'per' then perform demo._mostrar(chat, mid, demo._persona(s.id, a[2]::bigint)); return ''; end if;

  -- Tarea nueva
  if acc in ('np', 'npok', 'nf') then
    nom := case when acc = 'nf' then 'n_fecha' else 'n_para' end;   -- el paso que corresponde
    select * into c from demo.conversacion where chat_id = chat;
    if not found or c.paso <> nom then
      perform demo._teclas(chat, mid);
      return 'Ese paso ya venció. Tocá «Nueva tarea».';
    end if;
    sel := array(select x::bigint from jsonb_array_elements_text(c.datos -> 'para') x);
    if acc = 'np' then
      pid := (select id from demo.personas where id = a[2]::bigint and sesion_id = s.id);
      if pid is null then return ''; end if;
      sel := case when pid = any (sel) then array_remove(sel, pid) else sel || pid end;
      update demo.conversacion set datos = datos || jsonb_build_object('para', to_jsonb(sel)) where chat_id = chat;
      perform demo._teclas(chat, mid, demo._kb_para(s.id, sel));
    elsif acc = 'npok' then
      if cardinality(sel) = 0 then return 'Elegí al menos una persona.'; end if;
      perform demo._editar(chat, mid, 'Para: ' || demo._esc(demo._nom(sel)));
      perform demo._paso(chat, 'n_fecha', c.datos);
      perform demo._decir(chat, '¿Para cuándo? Tocá una opción o escribí la fecha (15/11).',
        jsonb_build_object('inline_keyboard', jsonb_build_array(
          jsonb_build_array(demo._btn('Hoy', 'nf|0'), demo._btn('Mañana', 'nf|1')),
          jsonb_build_array(demo._btn('En una semana', 'nf|7'), demo._btn('Sin fecha', 'nf|-')))));
    else
      perform demo._teclas(chat, mid);
      perform demo._crear(s, c.datos, case when a[2] = '-' then null else demo.hoy() + a[2]::int end);
    end if;
    return '';
  end if;

  -- Tarea existente (siempre de esta sesión)
  select * into t from demo.tareas where id = nullif(a[2], '')::bigint and sesion_id = s.id;
  if not found then return 'Esa tarea ya no existe.'; end if;

  if acc = 't' then
    perform demo._mostrar(chat, mid, demo._tarea_vista(t.id));
    return '';

  elsif acc = 'est' and a[3] in ('pendiente', 'en_curso', 'finalizada') then
    update demo.tareas set estado = a[3] where id = t.id;
    perform demo._mostrar(chat, mid, demo._tarea_vista(t.id));
    return 'Ahora está ' || lower(demo._estado(a[3])) || '.';

  elsif acc = 'com' then
    perform demo._paso(chat, 'comentar', jsonb_build_object('tid', t.id));
    perform demo._decir(chat, 'Escribí el comentario para «' || demo._esc(t.titulo) || '». Podés mencionar con @, por ejemplo @Martín.');
    return '';

  elsif acc = 'del' then
    perform demo._teclas(chat, mid, jsonb_build_object('inline_keyboard',
      (select coalesce(jsonb_agg(jsonb_build_array(demo._btn(p.nombre, 'dd|' || t.id || '|' || p.id)) order by p.id), '[]'::jsonb)
         from demo.personas p where p.sesion_id = s.id and not p.vos) ||
      jsonb_build_array(jsonb_build_array(demo._btn('‹ Volver', 't|' || t.id)))));
    return '';

  elsif acc = 'dd' then
    select id, nombre into pid, nom from demo.personas where id = a[3]::bigint and sesion_id = s.id;
    if pid is null then return ''; end if;
    update demo.tareas set responsables = array[pid] where id = t.id;
    insert into demo.comentarios (sesion_id, tarea_id, autor, texto, menciones)
    values (s.id, t.id, yo, 'Delegó la tarea a ' || nom || '.', array[pid]);
    perform demo._mostrar(chat, mid, demo._tarea_vista(t.id));
    return 'Delegada a ' || split_part(nom, ' ', 1) || '. Le avisé.';

  elsif acc = 'pos' then
    perform demo._teclas(chat, mid, jsonb_build_object('inline_keyboard', jsonb_build_array(
      jsonb_build_array(demo._btn('Mañana', 'pp|' || t.id || '|1'), demo._btn('En una semana', 'pp|' || t.id || '|7')),
      jsonb_build_array(demo._btn('Elegir fecha', 'px|' || t.id), demo._btn('‹ Volver', 't|' || t.id)))));
    return '';

  elsif acc = 'pp' then
    f := demo.hoy() + a[3]::int;
    update demo.tareas set vence = f where id = t.id;
    perform demo._mostrar(chat, mid, demo._tarea_vista(t.id));
    return 'Pospuesta al ' || to_char(f, 'DD/MM') || '.';

  elsif acc = 'px' then
    perform demo._paso(chat, 'posponer', jsonb_build_object('tid', t.id));
    perform demo._decir(chat, 'Escribí la nueva fecha (15/11), o tocá /cancelar.');
    return '';

  elsif acc = 'rec' then
    perform demo._teclas(chat, mid, jsonb_build_object('inline_keyboard', jsonb_build_array(
      jsonb_build_array(demo._btn('En 1 minuto', 'rr|' || t.id || '|1'), demo._btn('Mañana 9:00', 'rr|' || t.id || '|m')),
      jsonb_build_array(demo._btn('‹ Volver', 't|' || t.id)))));
    return '';

  elsif acc = 'rr' then
    r := case when a[3] = 'm' then demo._en(demo.hoy() + 1, '09:00') else now() + interval '1 minute' end;
    update demo.tareas set recordar = r where id = t.id;
    perform demo._mostrar(chat, mid, demo._tarea_vista(t.id));
    return case when a[3] = 'm' then 'Te lo recuerdo mañana a las 9:00.' else 'Te lo recuerdo en un minuto.' end;
  end if;
  return '';
end $function$
;

CREATE OR REPLACE FUNCTION demo._btn(txt text, dato text, estilo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$ select jsonb_strip_nulls(jsonb_build_object('text', txt, 'callback_data', dato, 'style', estilo)) $function$
;

CREATE OR REPLACE FUNCTION demo._columna(sid uuid, e text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ids bigint[];
begin
  select array_agg(id order by vence nulls last, numero) into ids from demo.tareas where sesion_id = sid and estado = e;
  return demo._lista(demo._estado(e) || ' (' || coalesce(cardinality(ids), 0) || ')', ids, 'No hay tareas en esta columna.', demo._btn('‹ Tablero', 'tab'));
end $function$
;

CREATE OR REPLACE FUNCTION demo._crear(s demo.sesiones, d jsonb, f date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare yo bigint := demo._vos(s.id); para bigint[]; otros bigint[]; nid bigint;
begin
  para := array(select x::bigint from jsonb_array_elements_text(d -> 'para') x);
  insert into demo.tareas (sesion_id, numero, titulo, responsables, creador, vence)
  values (s.id, (select coalesce(max(numero), 0) + 1 from demo.tareas where sesion_id = s.id), d ->> 'titulo', para, yo, f)
  returning id into nid;
  delete from demo.conversacion where chat_id = s.chat_id;
  otros := array(select x from unnest(para) x where x <> yo);
  perform demo._mostrar(s.chat_id, null, demo._tarea_vista(nid,
    'Tarea creada.' || case when cardinality(otros) > 0 then ' Le avisé a ' || demo._nom(otros, true) || '.' else '' end));
end $function$
;

CREATE OR REPLACE FUNCTION demo._cuando(ts timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case (ts at time zone 'America/Argentina/Buenos_Aires')::date
    when demo.hoy() then 'hoy '
    when demo.hoy() + 1 then 'mañana '
    else demo._dia((ts at time zone 'America/Argentina/Buenos_Aires')::date) || ' ' || to_char(ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') || ' ' end
  || to_char(ts at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI')
$function$
;

CREATE OR REPLACE FUNCTION demo._decir(chat text, txt text, teclas jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  perform demo._tg('sendMessage', jsonb_strip_nulls(jsonb_build_object('chat_id', chat, 'parse_mode', 'HTML', 'text', txt, 'reply_markup', teclas)), chat);
end $function$
;

CREATE OR REPLACE FUNCTION demo._dia(d date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from d)::int + 1]
$function$
;

CREATE OR REPLACE FUNCTION demo._editar(chat text, mid bigint, txt text, teclas jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  perform demo._tg('editMessageText', jsonb_build_object('chat_id', chat, 'message_id', mid, 'parse_mode', 'HTML', 'text', txt,
    'reply_markup', coalesce(teclas, '{"inline_keyboard":[]}')), chat);
end $function$
;

CREATE OR REPLACE FUNCTION demo._en(d date, h time without time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$ select (d + h) at time zone 'America/Argentina/Buenos_Aires' $function$
;

CREATE OR REPLACE FUNCTION demo._equipo(sid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    'txt', '<b>Equipo de Estudio Norte</b>' || E'\n\n' ||
           string_agg(demo._esc(p.nombre) || case when p.vos then ' (vos)' else '' end || E'\n<i>' || demo._esc(p.rol) || ' · ' || n.n ||
                      case when n.n = 1 then ' tarea abierta' else ' tareas abiertas' end || '</i>', E'\n\n' order by not p.vos, p.id) ||
           E'\n\n' || 'Tocá una persona para ver sus tareas.',
    'kb', jsonb_build_object('inline_keyboard', jsonb_agg(jsonb_build_array(demo._btn(p.nombre, 'per|' || p.id)) order by not p.vos, p.id)))
  from demo.personas p
  cross join lateral (select count(*) n from demo.tareas t where t.sesion_id = p.sesion_id and p.id = any (t.responsables) and t.estado <> 'finalizada') n
  where p.sesion_id = sid
$function$
;

CREATE OR REPLACE FUNCTION demo._es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
  select exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) like '%@giwa-ia.com')
$function$
;

CREATE OR REPLACE FUNCTION demo._esc(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $function$
;

CREATE OR REPLACE FUNCTION demo._estado(e text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case e when 'pendiente' then 'Pendiente' when 'en_curso' then 'En curso' when 'finalizada' then 'Finalizada' else e end
$function$
;

CREATE OR REPLACE FUNCTION demo._fecha(txt text)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
declare m text[]; y int; d date;
begin
  m := regexp_match(trim(coalesce(txt, '')), '^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$');
  if m is null then return null; end if;
  y := coalesce(m[3]::int, extract(year from demo.hoy())::int);
  if y < 100 then y := y + 2000; end if;
  d := make_date(y, m[2]::int, m[1]::int);
  if m[3] is null and d < demo.hoy() then d := make_date(y + 1, m[2]::int, m[1]::int); end if;
  return d;
exception when others then return null;
end $function$
;

CREATE OR REPLACE FUNCTION demo._kb_para(sid uuid, sel bigint[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('inline_keyboard',
    coalesce(jsonb_agg(jsonb_build_array(demo._btn(case when p.id = any (sel) then '✓ ' else '' end || p.nombre || case when p.vos then ' (vos)' else '' end, 'np|' || p.id))
                       order by not p.vos, p.id), '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_array(demo._btn('Listo', 'npok', 'primary'))))
  from demo.personas p where p.sesion_id = sid
$function$
;

CREATE OR REPLACE FUNCTION demo._kb_tareas(ids bigint[], volver jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('inline_keyboard',
    coalesce((select jsonb_agg(jsonb_build_array(demo._btn('#' || t.numero || ' · ' || left(t.titulo, 36), 't|' || t.id)) order by x.o)
                from (select u.id, min(u.o) o from unnest(ids) with ordinality u(id, o) group by u.id order by min(u.o) limit 10) x
                join demo.tareas t on t.id = x.id), '[]'::jsonb) ||
    case when volver is null then '[]'::jsonb else jsonb_build_array(jsonb_build_array(volver)) end)
$function$
;

CREATE OR REPLACE FUNCTION demo._lineas(ids bigint[])
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select string_agg('#' || t.numero || ' ' || demo._esc(t.titulo) || E'\n<i>' || demo._esc(demo._nom(t.responsables, true)) || ' · ' || demo._vence(t.vence, t.estado) || '</i>',
                    E'\n\n' order by array_position(ids, t.id))
  from demo.tareas t where t.id = any (ids)
$function$
;

CREATE OR REPLACE FUNCTION demo._lista(titulo text, ids bigint[], vacio text, volver jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('txt', '<b>' || demo._esc(titulo) || '</b>' || E'\n\n' || coalesce(demo._lineas(ids), vacio),
                            'kb', demo._kb_tareas(ids, volver))
$function$
;

CREATE OR REPLACE FUNCTION demo._menu()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select '{"keyboard":[[{"text":"Mis tareas"},{"text":"Tablero"}],[{"text":"Nueva tarea"},{"text":"Equipo"}],[{"text":"Alertas"},{"text":"Agenda"}]],"resize_keyboard":true,"is_persistent":true}'::jsonb
$function$
;

CREATE OR REPLACE FUNCTION demo._mis(sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ids bigint[]; v bigint := demo._vos(sid);
begin
  select array_agg(id order by (estado = 'en_curso') desc, vence nulls last, numero) into ids
    from demo.tareas where sesion_id = sid and v = any (responsables) and estado <> 'finalizada';
  return demo._lista('Mis tareas (' || coalesce(cardinality(ids), 0) || ')', ids,
                     'No tenés tareas abiertas. Creá una con «Nueva tarea».');
end $function$
;

CREATE OR REPLACE FUNCTION demo._mostrar(chat text, mid bigint, v jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if mid is null then perform demo._decir(chat, v ->> 'txt', v -> 'kb');
  else perform demo._editar(chat, mid, v ->> 'txt', v -> 'kb'); end if;
end $function$
;

CREATE OR REPLACE FUNCTION demo._nom(ids bigint[], corto boolean DEFAULT false)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select string_agg(case when corto then split_part(p.nombre, ' ', 1) else p.nombre end, ', ' order by array_position(ids, p.id))
  from demo.personas p where p.id = any (ids)
$function$
;

CREATE OR REPLACE FUNCTION demo._norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select lower(translate(trim(coalesce(t, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $function$
;

CREATE OR REPLACE FUNCTION demo._paso(chat text, p_paso text, d jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
AS $function$
  insert into demo.conversacion (chat_id, paso, datos) values (chat, p_paso, d)
  on conflict (chat_id) do update set paso = excluded.paso, datos = excluded.datos, creado = now()
$function$
;

CREATE OR REPLACE FUNCTION demo._persona(sid uuid, pid bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare ids bigint[]; nom text;
begin
  select nombre into nom from demo.personas where id = pid and sesion_id = sid;
  if nom is null then return demo._equipo(sid); end if;
  select array_agg(id order by vence nulls last, numero) into ids
    from demo.tareas where sesion_id = sid and pid = any (responsables) and estado <> 'finalizada';
  return demo._lista('Tareas de ' || nom || ' (' || coalesce(cardinality(ids), 0) || ')', ids, 'No tiene tareas abiertas.', demo._btn('‹ Equipo', 'eq'));
end $function$
;

CREATE OR REPLACE FUNCTION demo._portal()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
  select coalesce((select valor from demo.secretos where clave = 'portal_url'), 'el portal de demos de GIWA')
$function$
;

CREATE OR REPLACE FUNCTION demo._reiniciar(s demo.sesiones)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  delete from demo.tareas   where sesion_id = s.id;   -- los comentarios caen con su tarea
  delete from demo.agenda   where sesion_id = s.id;
  delete from demo.personas where sesion_id = s.id;
  delete from demo.conversacion where chat_id = s.chat_id;
  perform demo._sembrar(s);
  perform demo._decir(s.chat_id, 'Listo: los datos de Estudio Norte volvieron al inicio. En unos minutos te llega un recordatorio.', demo._menu());
end $function$
;

CREATE OR REPLACE FUNCTION demo._sembrar(s demo.sesiones)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if s.rubro = 'oficina' then perform demo._sembrar_oficina(s.id); end if;
end $function$
;

CREATE OR REPLACE FUNCTION demo._sembrar_oficina(sid uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare l bigint; m bigint; j bigint; d bigint; c bigint; h date := demo.hoy();
begin
  insert into demo.personas (sesion_id, nombre, rol, vos) values (sid, 'Laura Ríos', 'Coordinadora', true) returning id into l;
  insert into demo.personas (sesion_id, nombre, rol) values (sid, 'Martín Sosa', 'Arquitecto') returning id into m;
  insert into demo.personas (sesion_id, nombre, rol) values (sid, 'Julieta Paz', 'Diseñadora') returning id into j;
  insert into demo.personas (sesion_id, nombre, rol) values (sid, 'Diego Ferro', 'Administración') returning id into d;
  insert into demo.personas (sesion_id, nombre, rol) values (sid, 'Carla Méndez', 'Comercial') returning id into c;

  insert into demo.tareas (sesion_id, numero, titulo, estado, responsables, creador, vence) values
    (sid,  1, 'Enviar el presupuesto a Inmobiliaria Sur',      'pendiente',  array[l],    c, h - 2),
    (sid,  2, 'Revisar los planos de la casa Ortega',          'en_curso',   array[l, m], m, h),
    (sid,  3, 'Confirmar la visita de obra en Palermo',        'pendiente',  array[l],    d, h + 1),
    (sid,  4, 'Preparar la reunión de equipo',                 'pendiente',  array[l],    l, h + 3),
    (sid,  5, 'Aprobar el moodboard del local Belgrano',       'pendiente',  array[l, j], j, h + 2),
    (sid,  6, 'Cargar las horas del mes',                      'finalizada', array[l],    d, h - 3),
    (sid,  7, 'Renders finales del local Belgrano',            'en_curso',   array[j],    l, h + 4),
    (sid,  8, 'Pedir la cotización de aberturas',              'pendiente',  array[m],    l, h - 1),
    (sid,  9, 'Facturar el anticipo de la casa Ortega',        'pendiente',  array[d],    c, h),
    (sid, 10, 'Pagar el seguro de la oficina',                 'finalizada', array[d],    d, h - 5),
    (sid, 11, 'Llamar al cliente nuevo: Café Molino',          'pendiente',  array[c],    l, h + 1),
    (sid, 12, 'Actualizar el portfolio en la web',             'en_curso',   array[j, c], c, h + 6),
    (sid, 13, 'Relevar las medidas en Palermo',                'finalizada', array[m],    l, h - 4),
    (sid, 14, 'Renovar el dominio del estudio',                'pendiente',  array[d],    l, h - 3),
    (sid, 15, 'Propuesta comercial para Café Molino',          'pendiente',  array[c, l], c, h + 5);

  -- El primer recordatorio llega mientras la persona prueba
  update demo.tareas set recordar = now() + interval '3 minutes' where sesion_id = sid and numero = 3;

  insert into demo.comentarios (sesion_id, tarea_id, autor, texto, menciones, creado)
  select sid, t.id, x.autor, x.texto, x.menciones, now() - x.hace
    from (values
      (2, m, '@Laura subí la versión 3 de los planos. Fijate el baño de planta alta.', array[l], interval '2 hours'),
      (5, j, 'Te dejé dos opciones de paleta, @Laura. Me sirve tu OK antes del jueves.', array[l], interval '5 hours'),
      (8, l, '@Martín ¿pudiste pedirla? El cliente pregunta.', array[m], interval '1 day'),
      (9, d, 'Espero el OK de @Carla para facturar.', array[c], interval '3 hours'),
      (1, c, 'Ya tengo los números, falta tu revisión.', array[]::bigint[], interval '2 days')
    ) x(num, autor, texto, menciones, hace)
    join demo.tareas t on t.sesion_id = sid and t.numero = x.num;

  insert into demo.agenda (sesion_id, titulo, inicio, lugar, participantes, recordar) values
    (sid, 'Llamada con Café Molino',            date_trunc('hour', now()) + interval '2 hours', 'Meet',          array[l, c],          now() + interval '8 minutes'),
    (sid, 'Visita de obra en Palermo',          demo._en(h + 1, '10:00'), 'Gorriti 4800',  array[l, m],          null),
    (sid, 'Presentación del local Belgrano',    demo._en(h + 2, '15:00'), 'Oficina',       array[l, j, c],       null),
    (sid, 'Reunión de equipo',                  demo._en(h + 3, '09:30'), 'Oficina',       array[l, m, j, d, c], null),
    (sid, 'Cierre de horas y facturación',      demo._en(h + 4, '18:00'), 'Oficina',       array[l, d],          null);
end $function$
;

CREATE OR REPLACE FUNCTION demo._sesion(chat text)
 RETURNS demo.sesiones
 LANGUAGE sql
 STABLE
AS $function$
  select * from demo.sesiones where chat_id = chat and vence > now() order by vinculado desc limit 1
$function$
;

CREATE OR REPLACE FUNCTION demo._start(chat text, nombre_tg text, usuario_tg text, tok text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare s demo.sesiones;
begin
  delete from demo.conversacion where chat_id = chat;
  if coalesce(tok, '') <> '' then
    select * into s from demo.sesiones where token = tok for update;
    if not found or s.vence <= now() then
      perform demo._decir(chat, 'Este enlace venció. Pedí uno nuevo en ' || demo._esc(demo._portal()) || '.', '{"remove_keyboard":true}');
      return;
    end if;
    if s.chat_id is not null and s.chat_id <> chat then
      perform demo._decir(chat, 'Este enlace ya se usó desde otra cuenta de Telegram. Pedí uno nuevo en ' || demo._esc(demo._portal()) || '.');
      return;
    end if;
    if s.chat_id is null then
      update demo.sesiones set vence = now() where chat_id = chat and id <> s.id and vence > now();   -- una demo por chat
      update demo.sesiones set chat_id = chat, tg_nombre = left(nombre_tg, 80), tg_usuario = left(usuario_tg, 64), vinculado = now() where id = s.id
        returning * into s;
      perform demo._sembrar(s);
    end if;
    perform demo._decir(chat,
      'Hola, ' || demo._esc(coalesce(nullif(nombre_tg, ''), s.nombre)) || '.' || E'\n\n' ||
      'En esta demo sos <b>Laura Ríos</b>, coordinadora de <b>Estudio Norte</b>, un estudio de arquitectura ficticio con cinco personas.' || E'\n\n' ||
      'Probá:' || E'\n' ||
      '• <b>Mis tareas</b>: lo que tenés pendiente' || E'\n' ||
      '• <b>Tablero</b>: el equipo como un Kanban' || E'\n' ||
      '• <b>Nueva tarea</b>: creala y asignala' || E'\n' ||
      '• <b>Alertas</b>: vencidas y menciones' || E'\n\n' ||
      'En unos minutos te llega un recordatorio. /reiniciar vuelve todo al inicio.',
      demo._menu());
    return;
  end if;

  s := demo._sesion(chat);
  if s.id is not null then
    perform demo._decir(chat, 'Seguís en Estudio Norte.' || E'\n\n' || demo._ayuda(), demo._menu());
  else
    perform demo._decir(chat, 'Para empezar, elegí una demo en ' || demo._esc(demo._portal()) || '.', '{"remove_keyboard":true}');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION demo._tablero(sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare a int; b int; c int;
begin
  select count(*) filter (where estado = 'pendiente'), count(*) filter (where estado = 'en_curso'), count(*) filter (where estado = 'finalizada')
    into a, b, c from demo.tareas where sesion_id = sid;
  return jsonb_build_object(
    'txt', '<b>Tablero de Estudio Norte</b>' || E'\n\n' || 'Pendiente · ' || a || E'\n' || 'En curso · ' || b || E'\n' || 'Finalizada · ' || c ||
           E'\n\n' || 'Tocá una columna para ver sus tareas.',
    'kb', jsonb_build_object('inline_keyboard', jsonb_build_array(
      jsonb_build_array(demo._btn('Pendiente (' || a || ')', 'col|pendiente')),
      jsonb_build_array(demo._btn('En curso (' || b || ')', 'col|en_curso')),
      jsonb_build_array(demo._btn('Finalizada (' || c || ')', 'col|finalizada')))));
end $function$
;

CREATE OR REPLACE FUNCTION demo._tarea_vista(tid bigint, extra text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$ select jsonb_build_object('txt', demo._tarjeta(tid, extra), 'kb', demo._teclas_tarea(tid)) $function$
;

CREATE OR REPLACE FUNCTION demo._tarjeta(tid bigint, extra text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare t demo.tareas; ct text; cn text;
begin
  select * into t from demo.tareas where id = tid;
  select co.texto, p.nombre into ct, cn
    from demo.comentarios co join demo.personas p on p.id = co.autor
   where co.tarea_id = tid order by co.creado desc limit 1;
  return '<b>#' || t.numero || ' · ' || demo._esc(t.titulo) || '</b>' || E'\n\n' ||
    'Estado: ' || demo._estado(t.estado) || E'\n' ||
    case when cardinality(t.responsables) > 1 then 'Compartida: ' else 'Responsable: ' end || demo._esc(demo._nom(t.responsables)) || E'\n' ||
    upper(left(demo._vence(t.vence, t.estado), 1)) || substr(demo._vence(t.vence, t.estado), 2) ||
    case when t.recordar is not null then E'\nRecordatorio: ' || demo._cuando(t.recordar) else '' end ||
    case when ct is not null then E'\n\nÚltimo comentario de ' || demo._esc(split_part(cn, ' ', 1)) || E':\n<i>' || demo._esc(ct) || '</i>' else '' end ||
    case when coalesce(extra, '') <> '' then E'\n\n' || demo._esc(extra) else '' end;
end $function$
;

CREATE OR REPLACE FUNCTION demo._teclas(chat text, mid bigint, teclas jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  perform demo._tg('editMessageReplyMarkup', jsonb_build_object('chat_id', chat, 'message_id', mid,
    'reply_markup', coalesce(teclas, '{"inline_keyboard":[]}')), chat);
end $function$
;

CREATE OR REPLACE FUNCTION demo._teclas_tarea(tid bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare t demo.tareas; fila jsonb;
begin
  select * into t from demo.tareas where id = tid;
  fila := case t.estado
    when 'pendiente' then jsonb_build_array(demo._btn('Empezar', 'est|' || t.id || '|en_curso', 'primary'), demo._btn('Finalizar', 'est|' || t.id || '|finalizada', 'success'))
    when 'en_curso'  then jsonb_build_array(demo._btn('Volver a pendiente', 'est|' || t.id || '|pendiente'), demo._btn('Finalizar', 'est|' || t.id || '|finalizada', 'success'))
    else jsonb_build_array(demo._btn('Reabrir', 'est|' || t.id || '|pendiente')) end;
  return jsonb_build_object('inline_keyboard', jsonb_build_array(
    fila,
    jsonb_build_array(demo._btn('Comentar', 'com|' || t.id), demo._btn('Delegar', 'del|' || t.id)),
    jsonb_build_array(demo._btn('Posponer', 'pos|' || t.id), demo._btn('Recordarme', 'rec|' || t.id)),
    jsonb_build_array(demo._btn('‹ Mis tareas', 'mis'))));
end $function$
;

CREATE OR REPLACE FUNCTION demo._texto(s demo.sesiones, txt text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  chat text := s.chat_id; k text := demo._norm(txt); v text := left(trim(coalesce(txt, '')), 500);
  c demo.conversacion; f date; menc bigint[]; yo bigint := demo._vos(s.id);
begin
  if k = '' then return; end if;
  if k like '/reiniciar%' then perform demo._reiniciar(s); return; end if;
  if k like '/ayuda%' or k = 'ayuda' then perform demo._decir(chat, demo._ayuda(), demo._menu()); return; end if;
  if k like '/cancelar%' or k = 'cancelar' then
    delete from demo.conversacion where chat_id = chat;
    perform demo._decir(chat, 'Listo, cancelado.', demo._menu());
    return;
  end if;

  -- El menú corta cualquier paso a medias
  if k in ('mis tareas', 'tareas', '/tareas', 'tablero', 'kanban', '/tablero', 'nueva tarea', 'nueva', '/nueva',
           'equipo', 'responsables', '/equipo', 'alertas', '/alertas', 'agenda', '/agenda') then
    delete from demo.conversacion where chat_id = chat;
    if k in ('mis tareas', 'tareas', '/tareas') then perform demo._mostrar(chat, null, demo._mis(s.id));
    elsif k in ('tablero', 'kanban', '/tablero') then perform demo._mostrar(chat, null, demo._tablero(s.id));
    elsif k in ('equipo', 'responsables', '/equipo') then perform demo._mostrar(chat, null, demo._equipo(s.id));
    elsif k in ('alertas', '/alertas') then perform demo._mostrar(chat, null, demo._alertas(s.id));
    elsif k in ('agenda', '/agenda') then perform demo._mostrar(chat, null, demo._agenda(s.id));
    else
      perform demo._paso(chat, 'n_titulo');
      perform demo._decir(chat, '¿Qué hay que hacer? Escribilo en una línea.');
    end if;
    return;
  end if;

  select * into c from demo.conversacion where chat_id = chat;
  if not found then perform demo._decir(chat, demo._ayuda(), demo._menu()); return; end if;

  if c.paso = 'comentar' then
    menc := array(select p.id from demo.personas p
                   where p.sesion_id = s.id and not p.vos and k like '%@' || demo._norm(split_part(p.nombre, ' ', 1)) || '%');
    insert into demo.comentarios (sesion_id, tarea_id, autor, texto, menciones)
    values (s.id, (c.datos ->> 'tid')::bigint, yo, v, menc);
    delete from demo.conversacion where chat_id = chat;
    perform demo._mostrar(chat, null, demo._tarea_vista((c.datos ->> 'tid')::bigint,
      'Comentario guardado.' || case when cardinality(menc) > 0 then ' Le avisé a ' || demo._nom(menc, true) || '.' else '' end));

  elsif c.paso in ('posponer', 'n_fecha') then
    f := demo._fecha(v);
    if f is null then perform demo._decir(chat, 'No entendí la fecha. Escribila así: 15/11. O tocá /cancelar.'); return; end if;
    if f < demo.hoy() then perform demo._decir(chat, 'Esa fecha ya pasó. Escribí otra, o tocá /cancelar.'); return; end if;
    if c.paso = 'posponer' then
      update demo.tareas set vence = f where id = (c.datos ->> 'tid')::bigint and sesion_id = s.id;
      delete from demo.conversacion where chat_id = chat;
      perform demo._mostrar(chat, null, demo._tarea_vista((c.datos ->> 'tid')::bigint, 'Pospuesta al ' || to_char(f, 'DD/MM') || '.'));
    else
      perform demo._crear(s, c.datos, f);
    end if;

  elsif c.paso = 'n_titulo' then
    perform demo._paso(chat, 'n_para', jsonb_build_object('titulo', left(v, 200), 'para', '[]'::jsonb));
    perform demo._decir(chat, '¿Para quién es? Podés elegir más de una persona y después tocar «Listo».', demo._kb_para(s.id, '{}'));

  else
    perform demo._decir(chat, 'Elegí con los botones, o tocá /cancelar para salir.');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION demo._tg(metodo text, cuerpo jsonb, chat text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
declare tk text := (select valor from demo.secretos where clave = 'bot_token'); rid bigint;
begin
  if coalesce(tk, '') = '' then raise exception 'Falta bot_token en demo.secretos'; end if;
  rid := net.http_post(url := 'https://api.telegram.org/bot' || tk || '/' || metodo, body := coalesce(cuerpo, '{}'),
                       headers := '{"Content-Type":"application/json"}', timeout_milliseconds := 15000);
  insert into demo.envios (id, metodo, chat_id) values (rid, metodo, chat);
end $function$
;

CREATE OR REPLACE FUNCTION demo._vence(d date, e text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when d is null then 'sin fecha'
    when e <> 'finalizada' and d < demo.hoy() then 'vencida el ' || to_char(d, 'DD/MM')
    when d = demo.hoy() then 'vence hoy'
    when d = demo.hoy() + 1 then 'vence mañana'
    else 'vence el ' || demo._dia(d) || ' ' || to_char(d, 'DD/MM') end
$function$
;

CREATE OR REPLACE FUNCTION demo._vos(sid uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$ select id from demo.personas where sesion_id = sid and vos limit 1 $function$
;

CREATE OR REPLACE FUNCTION demo.ahora()
 RETURNS timestamp without time zone
 LANGUAGE sql
 STABLE
AS $function$ select now() at time zone 'America/Argentina/Buenos_Aires' $function$
;

CREATE OR REPLACE FUNCTION demo.ciclo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
declare r record;
begin
  for r in select t.id, s.chat_id from demo.tareas t join demo.sesiones s on s.id = t.sesion_id
            where t.recordar <= now() and s.vence > now() and s.chat_id is not null loop
    update demo.tareas set recordar = null where id = r.id;
    perform demo._decir(r.chat_id, '<b>Recordatorio</b>' || E'\n\n' || demo._tarjeta(r.id), demo._teclas_tarea(r.id));
  end loop;

  for r in select a.*, s.chat_id from demo.agenda a join demo.sesiones s on s.id = a.sesion_id
            where a.recordar <= now() and s.vence > now() and s.chat_id is not null loop
    update demo.agenda set recordar = null where id = r.id;
    perform demo._decir(r.chat_id, '<b>Recordatorio de agenda</b>' || E'\n\n' || demo._esc(r.titulo) || E'\n' ||
      initcap(demo._cuando(r.inicio)) || coalesce(' · ' || demo._esc(r.lugar), '') || E'\n<i>' || demo._esc(demo._nom(r.participantes, true)) || '</i>');
  end loop;

  -- Demo vencida: se borran sus datos de ejemplo; la sesión queda como lead
  delete from demo.tareas   where sesion_id in (select id from demo.sesiones where vence < now() - interval '1 hour');
  delete from demo.agenda   where sesion_id in (select id from demo.sesiones where vence < now() - interval '1 hour');
  delete from demo.personas where sesion_id in (select id from demo.sesiones where vence < now() - interval '1 hour');
  delete from demo.conversacion where creado < now() - interval '1 day';
  delete from demo.updates where creado < now() - interval '2 days';
  delete from demo.envios where creado < now() - interval '7 days';
end $function$
;

CREATE OR REPLACE FUNCTION demo.conectar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
begin
  perform demo._tg('setWebhook', jsonb_build_object(
    'url', 'https://ofhiogczijhzkuqdjwvz.supabase.co/functions/v1/demo-bot',
    'secret_token', (select valor from demo.secretos where clave = 'webhook_secret'),
    'allowed_updates', jsonb_build_array('message', 'callback_query'),
    'drop_pending_updates', true));
  perform demo._tg('setMyCommands', jsonb_build_object('commands', jsonb_build_array(
    jsonb_build_object('command', 'ayuda', 'description', 'Qué se puede probar'),
    jsonb_build_object('command', 'reiniciar', 'description', 'Volver los datos al inicio'))));
  perform demo._tg('setMyName', jsonb_build_object('name', 'GIWA Demo'));
  perform demo._tg('setMyShortDescription', jsonb_build_object('short_description',
    'Probá cómo se gestiona un negocio desde Telegram. Datos 100 % ficticios.'));
  perform demo._tg('setMyDescription', jsonb_build_object('description',
    'Demo de GIWA {IA}: tareas, equipo, alertas y agenda de una empresa ficticia, sin salir de Telegram. ' ||
    'Para empezar, entrá desde el portal de demos de GIWA.'));
end $function$
;

CREATE OR REPLACE FUNCTION demo.hoy()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$ select demo.ahora()::date $function$
;

CREATE OR REPLACE FUNCTION demo.recibir(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  cb jsonb := p -> 'callback_query'; msg jsonb := coalesce(p -> 'callback_query' -> 'message', p -> 'message');
  uid bigint := (p ->> 'update_id')::bigint; chat text; de text; txt text; s demo.sesiones; aviso text;
begin
  insert into demo.updates (id) values (uid) on conflict (id) do nothing;
  if not found then return; end if;

  chat := msg -> 'chat' ->> 'id';
  de := coalesce(cb -> 'from' ->> 'id', msg -> 'from' ->> 'id');
  if chat is null or chat is distinct from de then return; end if;   -- sólo chats privados
  txt := trim(coalesce(msg ->> 'text', ''));

  begin
    if cb is null and txt ~* '^/start' then
      perform demo._start(chat, msg -> 'from' ->> 'first_name', msg -> 'from' ->> 'username', nullif(trim(substr(txt, 7)), ''));
      return;
    end if;

    s := demo._sesion(chat);
    if s.id is null then
      if cb is not null then
        perform demo._tg('answerCallbackQuery', jsonb_build_object('callback_query_id', cb ->> 'id', 'text', 'Tu demo terminó.'), chat);
      end if;
      perform demo._decir(chat, 'Tu demo no está activa. Abrí una nueva desde ' || demo._esc(demo._portal()) || '.', '{"remove_keyboard":true}');
      return;
    end if;

    if cb is not null then
      aviso := demo._boton(s, (msg ->> 'message_id')::bigint, cb ->> 'data');
      perform demo._tg('answerCallbackQuery', jsonb_strip_nulls(jsonb_build_object('callback_query_id', cb ->> 'id', 'text', nullif(aviso, ''))), chat);
    elsif txt <> '' then
      perform demo._texto(s, txt);
    else
      perform demo._decir(chat, 'Por ahora esta demo entiende texto y botones.');
    end if;
  exception when others then
    raise log 'demo.recibir % %: %', uid, chat, sqlerrm;
    if cb is not null then
      perform demo._tg('answerCallbackQuery', jsonb_build_object('callback_query_id', cb ->> 'id', 'text', 'Algo falló. Probá de nuevo.'), chat);
    else
      perform demo._decir(chat, 'Algo falló. Probá de nuevo.');
    end if;
  end;
end $function$
;

CREATE OR REPLACE FUNCTION public.demo_admin(accion text, datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
declare cl text := coalesce(datos ->> 'clave', ''); v text := trim(coalesce(datos ->> 'valor', ''));
begin
  if not demo._es_admin() then return jsonb_build_object('ok', false, 'error', 'Sólo para el equipo de GIWA.'); end if;

  if accion = 'estado' then
    return jsonb_build_object('ok', true,
      'bot_token', exists (select 1 from demo.secretos where clave = 'bot_token'),
      'gemini', exists (select 1 from demo.secretos where clave = 'gemini_api_key'),
      'portal_url', (select valor from demo.secretos where clave = 'portal_url'),
      'errores', coalesce((select jsonb_agg(x order by x.creado desc) from (
          select e.metodo, e.creado, h.status_code status, left(coalesce(h.content, h.error_msg, ''), 200) detalle
            from demo.envios e join net._http_response h on h.id = e.id
           where coalesce(h.status_code, 0) <> 200
           order by e.creado desc limit 8) x), '[]'));
  elsif accion = 'leads' then
    return jsonb_build_object('ok', true, 'leads', coalesce((select jsonb_agg(x order by x.creado desc) from (
      select creado, nombre, mail, rubro, tg_nombre, tg_usuario, chat_id tg_id from demo.sesiones
       order by creado desc limit 1000) x), '[]'));
  elsif accion = 'guardar' then
    if cl not in ('bot_token', 'gemini_api_key', 'portal_url') then return jsonb_build_object('ok', false, 'error', 'Clave desconocida.'); end if;
    if v = '' then return jsonb_build_object('ok', false, 'error', 'Está vacío.'); end if;
    if cl = 'bot_token' and v !~ '^\d+:[A-Za-z0-9_-]{30,}$' then return jsonb_build_object('ok', false, 'error', 'Ese no parece un token de @BotFather.'); end if;
    if cl = 'portal_url' and v !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'La dirección tiene que empezar con https://'); end if;
    insert into demo.secretos (clave, valor) values (cl, v) on conflict (clave) do update set valor = excluded.valor;
    return jsonb_build_object('ok', true);
  elsif accion = 'conectar' then
    if not exists (select 1 from demo.secretos where clave = 'bot_token') then return jsonb_build_object('ok', false, 'error', 'Primero cargá el token del bot.'); end if;
    perform demo.conectar();
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Acción desconocida.');
end $function$
;

CREATE OR REPLACE FUNCTION public.demo_portal(accion text, datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
declare
  s demo.sesiones;
  nom text := left(trim(coalesce(datos ->> 'nombre', '')), 80);
  ml  text := lower(left(trim(coalesce(datos ->> 'mail', '')), 120));
  tok text := left(coalesce(datos ->> 'token', ''), 64);
begin
  if accion = 'crear' then
    if length(nom) < 2 then return jsonb_build_object('ok', false, 'error', 'Escribí tu nombre.'); end if;
    if ml !~ '^[^\s@]+@[^\s@]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'error', 'Revisá el correo.'); end if;
    if coalesce(datos ->> 'consiente', '') <> 'true' then
      return jsonb_build_object('ok', false, 'error', 'Necesitamos tu consentimiento para guardar tu nombre y tu correo.');
    end if;
    if coalesce(datos ->> 'rubro', '') <> 'oficina' then return jsonb_build_object('ok', false, 'error', 'Esta demo todavía no está disponible.'); end if;
    if (select count(*) from demo.sesiones where creado > now() - interval '1 hour') >= 300
       or (select count(*) from demo.sesiones where mail = ml and creado > now() - interval '1 hour') >= 5 then
      return jsonb_build_object('ok', false, 'error', 'Hay muchas pruebas abiertas. Probá de nuevo en un rato.');
    end if;
    insert into demo.sesiones (token, rubro, nombre, mail, consiente)
    values (replace(gen_random_uuid()::text, '-', ''), 'oficina', nom, ml, true)
    returning * into s;
    return jsonb_build_object('ok', true, 'token', s.token, 'vence', s.vence);
  end if;

  select * into s from demo.sesiones where token = tok and tok <> '';
  if not found then return jsonb_build_object('ok', false, 'error', 'La sesión no existe. Empezá de nuevo.'); end if;

  if accion = 'estado' then
    return jsonb_build_object('ok', true, 'vinculado', s.chat_id is not null, 'activa', s.vence > now(),
                              'tg_nombre', s.tg_nombre, 'vence', s.vence);
  elsif accion = 'reiniciar' then
    if s.chat_id is null or s.vence <= now() then return jsonb_build_object('ok', false, 'error', 'Primero conectá Telegram.'); end if;
    perform demo._reiniciar(s);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Acción desconocida.');
end $function$
;

CREATE OR REPLACE FUNCTION public.demo_tg_recibir(p jsonb, secreto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demo', 'public'
AS $function$
begin
  if coalesce(secreto, '') = '' or secreto is distinct from (select valor from demo.secretos where clave = 'webhook_secret') then
    return jsonb_build_object('ok', false);
  end if;
  perform demo.recibir(p);
  return jsonb_build_object('ok', true);
end $function$
;

-- permisos de demo_admin(text,jsonb): postgres=X/postgres, authenticated=X/postgres

-- permisos de demo_portal(text,jsonb): postgres=X/postgres, anon=X/postgres, authenticated=X/postgres

-- permisos de demo_tg_recibir(jsonb,text): postgres=X/postgres, service_role=X/postgres

-- pg_cron: demo-ciclo · * * * * * · select demo.ciclo()

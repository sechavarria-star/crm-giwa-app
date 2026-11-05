-- crm_giwa · Telegram con botones y «Nueva tarea» · 05/11/2026
-- Cada tarea llega en su propio mensaje: nombre, quién la mandó y Cerrar · Delegar · Posponer · Comentar.
-- Administración y la reunión mensual los crea el sistema: muestran «Responsable» en lugar de «De».
-- Avisa al asignar (nueva_tarea, asignar_tarea, delegar_tarea) y en el resumen de las 8.
-- La función telegram-bot sólo pasa lo que manda Telegram a tg_recibir: toda la lógica está acá y
-- cada botón llama a la misma función que usa la app, actuando como la persona de ese chat.
-- Después de publicar telegram-bot, Vicky corre una vez: select crm_giwa.telegram_conectar();
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- id = el chat: en qué paso está cada uno (comentario, fecha o tarea nueva a medio cargar)
create table if not exists crm_giwa.telegram_conversacion (
  id     text primary key,
  paso   text not null,
  datos  jsonb not null default '{}',
  creado timestamptz not null default now());
-- id = update_id: Telegram reintenta, y una tarea no se puede crear dos veces
create table if not exists crm_giwa.telegram_updates (
  id     bigint primary key,
  creado timestamptz not null default now());
alter table crm_giwa.telegram_conversacion enable row level security;
alter table crm_giwa.telegram_updates enable row level security;

insert into crm_giwa.secretos (clave, valor)
values ('telegram_webhook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

-- ── El mensaje de una tarea ────────────────────────────────────────────
create or replace function crm_giwa._tg_btn(txt text, dato text) returns jsonb
language sql immutable as $$ select jsonb_build_object('text', txt, 'callback_data', dato) $$;

create or replace function crm_giwa._tg_botones(tid text) returns jsonb
language sql immutable as $$
  select jsonb_build_object('inline_keyboard', jsonb_build_array(
    jsonb_build_array(crm_giwa._tg_btn('Cerrar', 'c|' || tid), crm_giwa._tg_btn('Delegar', 'd|' || tid)),
    jsonb_build_array(crm_giwa._tg_btn('Posponer', 'p|' || tid), crm_giwa._tg_btn('Comentar', 'm|' || tid))))
$$;

create or replace function crm_giwa._tg_texto_tarea(tid text, de text default null, extra text default null) returns text
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare t crm_giwa.tareas; cli text; quien text; auto boolean;
begin
  select * into t from crm_giwa.tareas where id = trim(tid);
  if not found then return ''; end if;
  select e.nombre into cli from crm_giwa.empresas e where e.id = t.cliente;
  auto := coalesce(t.tipo, '') ~* 'administr' or (coalesce(t.tipo, '') ~* 'reuni' and coalesce(t.frecuencia, '') ~* 'mensual');
  quien := case
    when coalesce(de, '') <> '' then 'De: ' || crm_giwa.nombre_usuario(de)
    when auto then 'Responsable: ' || coalesce((select string_agg(crm_giwa.nombre_usuario(x), ', ')
                                                  from unnest(string_to_array(crm_giwa.norm_mails(t.responsable), ', ')) x), 'CRM')
    when coalesce(t.creador, '') <> '' then 'De: ' || crm_giwa.nombre_usuario(t.creador)
    else 'De: CRM' end;
  return '• <b>' || crm_giwa._tg_esc(t.titulo) || '</b>' || E'\n' ||
    array_to_string(array_remove(array[
      case when t.vencimiento < crm_giwa.hoy() then 'VENCIDA' end,
      crm_giwa._tg_esc(quien),
      case when coalesce(cli, '') <> '' then crm_giwa._tg_esc(cli) end,
      case when t.vencimiento is not null then 'vence ' || to_char(t.vencimiento, 'DD/MM/YYYY') end], null), ' · ') ||
    case when coalesce(trim(extra), '') <> '' then E'\n' || crm_giwa._tg_esc(trim(extra)) else '' end;
end $$;

-- Sin sesión = el cron de las 8. El aviso nunca frena la acción que lo generó.
create or replace function crm_giwa._tg_mandar_tarea(tid text, mails text[], tipo text, de text default null, extra text default null, con_yo boolean default false) returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record; txt text;
begin
  if nullif(current_setting('request.jwt.claims', true), '') is not null and not crm_giwa.es_equipo() then return; end if;
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return; end if;
  txt := crm_giwa._tg_texto_tarea(tid, de, extra);
  if txt = '' then return; end if;
  for u in select distinct crm_giwa.norm_mail(x.mail) mail, x.telegram from crm_giwa.usuarios x
            where crm_giwa.norm_mail(x.mail) = any (mails) and coalesce(x.telegram, '') <> ''
              and (con_yo or crm_giwa.norm_mail(x.mail) <> coalesce(crm_giwa.mi_mail(), '')) loop
    perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', u.telegram, 'parse_mode', 'HTML', 'text', txt,
      'reply_markup', crm_giwa._tg_botones(trim(tid))), tipo, u.mail);
  end loop;
exception when others then return;
end $$;

-- ── Avisos: el mismo mensaje en todos lados ────────────────────────────
create or replace function crm_giwa._tg_aviso_delegada(nid text, nota text default '') returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare t crm_giwa.tareas;
begin
  select * into t from crm_giwa.tareas where id = trim(nid);
  if not found then return; end if;
  perform crm_giwa._tg_mandar_tarea(t.id, string_to_array(crm_giwa.norm_mails(t.responsable), ', '), 'delegada', crm_giwa.mi_mail(),
    case when trim(coalesce(nota, '')) <> '' then 'Motivo: ' || trim(nota) end);
end $$;

create or replace function crm_giwa.nueva_tarea(p jsonb) returns jsonb
language plpgsql volatile as $$
declare nid text; resp text;
begin
  if trim(coalesce(p ->> 'title', '')) = '' then raise exception 'Falta «Qué hay que hacer».'; end if;
  nid := crm_giwa._alta_tarea(jsonb_build_object(
    'type', 'Tarea', 'title', p ->> 'title', 'detail', coalesce(p ->> 'detail', ''), 'projectId', p ->> 'projectId',
    'clientId', p ->> 'clientId', 'itemIds', '', 'priority', p ->> 'priority', 'assignees', p ->> 'assignees',
    'due', coalesce(nullif(p ->> 'due', ''), (crm_giwa.hoy() + 7)::text)));
  select responsable into resp from crm_giwa.tareas where id = nid;
  perform crm_giwa._tg_mandar_tarea(nid, string_to_array(crm_giwa.norm_mails(resp), ', '), 'nueva');
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function crm_giwa.asignar_tarea(tid text, mails text) returns jsonb
language plpgsql volatile as $$
declare
  t crm_giwa.tareas := crm_giwa._tarea(tid);
  dst text := crm_giwa.norm_mails(mails);
  antes text[] := string_to_array(crm_giwa.norm_mails(t.responsable), ', ');
  ahora text[] := string_to_array(dst, ', ');
  sumados text[];
begin
  if dst = '' then raise exception 'Elegí al menos una persona.'; end if;
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if coalesce(t.tipo, '') ~* 'administr' then raise exception 'Los recordatorios se delegan.'; end if;
  if not crm_giwa._es_responsable(t) and crm_giwa.norm_mail(t.creador) <> crm_giwa.mi_mail() then
    raise exception 'Solo quien participa o quien la creó puede cambiar los participantes.';
  end if;
  if dst = crm_giwa.norm_mails(t.responsable) then return jsonb_build_object('ok', true, 'id', t.id, 'cambio', false); end if;
  update crm_giwa.tareas set responsable = dst where id = t.id;
  perform crm_giwa._comentar_tarea(t.id, crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' cambió los participantes: ' ||
    (select string_agg(crm_giwa.nombre_usuario(x), ', ') from unnest(ahora) x));
  select coalesce(array_agg(x), '{}') into sumados from unnest(ahora) x where not (x = any (coalesce(antes, '{}')));
  perform crm_giwa._tg_mandar_tarea(t.id, sumados, 'participante', crm_giwa.mi_mail());
  return jsonb_build_object('ok', true, 'id', t.id, 'cambio', true);
end $$;

-- Resumen de las 8: un mensaje por tarea, con los mismos filtros de siempre
create or replace function crm_giwa._tg_resumen(solo text) returns jsonb
language plpgsql security definer set search_path = crm_giwa, public as $$
declare u record; x record; c int; n int := 0; adm text := crm_giwa.norm_mail(crm_giwa.mail_admin());
begin
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return jsonb_build_object('ok', false, 'msg', 'Falta el token'); end if;
  for u in select nombre, crm_giwa.norm_mail(mail) mail, telegram from crm_giwa.usuarios
            where es_giwa and activo and coalesce(telegram, '') <> ''
              and (solo is null or crm_giwa.norm_mail(mail) = solo) order by orden loop
    c := 0;
    for x in select t.id from crm_giwa.v_tareas t
              where not coalesce(t.closed, false) and not coalesce(t.hidden, false) and coalesce(t.dup_of, '') = '' and t.due is not null
                and (t.type ~* 'administr' or coalesce(t.channels, '') ~* 'telegram')
                and u.mail = any (case when coalesce(t.assignees, '') = '' then array[adm]
                                       else array(select crm_giwa.norm_mail(y) from unnest(crm_giwa.lista_csv(t.assignees)) y) end)
              order by t.due loop
      perform crm_giwa._tg_mandar_tarea(x.id, array[u.mail], 'resumen', null, null, true);
      c := c + 1;
    end loop;
    if c = 0 and solo is not null then   -- la prueba siempre llega
      perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', u.telegram, 'text', 'Sin recordatorios pendientes.'), 'resumen', u.mail);
    end if;
    if c > 0 or solo is not null then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'enviados', n);
end $$;

-- ── El bot: ayudas ─────────────────────────────────────────────────────
create or replace function crm_giwa._tg_teclado() returns jsonb
language sql immutable as $$
  select '{"keyboard":[[{"text":"Nueva tarea"}]],"resize_keyboard":true,"is_persistent":true}'::jsonb
$$;

create or replace function crm_giwa._tg_decir(chat text, txt text, teclas jsonb default null) returns void
language sql volatile as $$
  select crm_giwa._tg_llamar('sendMessage', jsonb_strip_nulls(jsonb_build_object('chat_id', chat, 'parse_mode', 'HTML', 'text', txt, 'reply_markup', teclas)), 'bot', chat);
  select null::void
$$;

-- Reescribe un mensaje ya enviado. Sin teclas, le saca los botones.
create or replace function crm_giwa._tg_editar(chat text, mid bigint, txt text, teclas jsonb default null) returns void
language sql volatile as $$
  select crm_giwa._tg_llamar('editMessageText', jsonb_strip_nulls(jsonb_build_object('chat_id', chat, 'message_id', mid, 'parse_mode', 'HTML', 'text', txt, 'reply_markup', teclas)), 'bot', chat);
  select null::void
$$;

create or replace function crm_giwa._tg_teclas(chat text, mid bigint, teclas jsonb default '{"inline_keyboard":[]}') returns void
language sql volatile as $$
  select crm_giwa._tg_llamar('editMessageReplyMarkup', jsonb_build_object('chat_id', chat, 'message_id', mid, 'reply_markup', teclas), 'bot', chat);
  select null::void
$$;

create or replace function crm_giwa._tg_paso(chat text, p_paso text, d jsonb default '{}') returns void
language sql volatile as $$
  insert into crm_giwa.telegram_conversacion (id, paso, datos) values (chat, p_paso, d)
  on conflict (id) do update set paso = excluded.paso, datos = excluded.datos, creado = now()
$$;

-- 15/11/2026 · 15/11/26 · 15/11 (sin año: la próxima vez que caiga). Si no es una fecha, null.
create or replace function crm_giwa._tg_fecha(txt text) returns date
language plpgsql stable as $$
declare m text[]; y int; d date;
begin
  m := regexp_match(trim(coalesce(txt, '')), '^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$');
  if m is null then return null; end if;
  y := coalesce(m[3]::int, extract(year from crm_giwa.hoy())::int);
  if y < 100 then y := y + 2000; end if;
  d := make_date(y, m[2]::int, m[1]::int);
  if m[3] is null and d < crm_giwa.hoy() then d := make_date(y + 1, m[2]::int, m[1]::int); end if;
  return d;
exception when others then return null;
end $$;

-- La lista del equipo. tid vacío = tarea nueva (u|persona), con «Para mí» primero.
create or replace function crm_giwa._tg_equipo(yo text, tid text default '') returns jsonb
language sql stable security definer set search_path = crm_giwa, public as $$
  select jsonb_build_object('inline_keyboard', coalesce(jsonb_agg(f order by o), '[]'))
  from (
    select jsonb_build_array(crm_giwa._tg_btn(case when crm_giwa.norm_mail(u.mail) = yo then 'Para mí' else u.nombre end,
             case when tid = '' then 'u|' || u.id else 'dd|' || tid || '|' || u.id end)) f,
           case when crm_giwa.norm_mail(u.mail) = yo then -1 else u.orden end o
      from crm_giwa.usuarios u
     where u.es_giwa and u.activo and (tid = '' or crm_giwa.norm_mail(u.mail) <> yo)
    union all
    select jsonb_build_array(crm_giwa._tg_btn('Volver', 'v|' || tid)), 9999 where tid <> ''
  ) q
$$;

create or replace function crm_giwa._tg_posponer(chat text, mid bigint, tid text, f date) returns text
language plpgsql volatile as $$
declare t crm_giwa.tareas := crm_giwa._tarea(tid); aviso text := 'Pospuesta al ' || to_char(f, 'DD/MM/YYYY');
begin
  if coalesce(t.tipo, '') ~* 'administr' then perform crm_giwa.posponer_alerta(t.id, f, '');
  else perform crm_giwa.posponer_tarea(t.id, f); end if;
  if mid is not null then perform crm_giwa._tg_editar(chat, mid, crm_giwa._tg_texto_tarea(t.id, null, aviso), crm_giwa._tg_botones(t.id)); end if;
  return aviso;
end $$;

create or replace function crm_giwa._tg_pedir_fecha_nueva(chat text) returns void
language sql volatile as $$
  select crm_giwa._tg_decir(chat, '¿Para cuándo? Tocá una opción o escribí la fecha (15/11/2026).',
    jsonb_build_object('inline_keyboard', jsonb_build_array(
      jsonb_build_array(crm_giwa._tg_btn('Hoy', 'f|0'), crm_giwa._tg_btn('Mañana', 'f|1')),
      jsonb_build_array(crm_giwa._tg_btn('En una semana', 'f|7')))))
$$;

create or replace function crm_giwa._tg_crear(yo text, chat text, d jsonb, f date) returns void
language plpgsql volatile as $$
declare r jsonb; nid text; para text := d ->> 'para'; cfg text; tg text;
begin
  r := crm_giwa.nueva_tarea(jsonb_build_object('title', d ->> 'titulo', 'clientId', d ->> 'cliente', 'assignees', para, 'due', f::text));
  nid := r ->> 'id';
  -- Creada por Telegram, sigue avisando por Telegram (igual que activar_telegram)
  select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_CanalEnvio';
  tg := coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'telegram' limit 1), 'telegram');
  update crm_giwa.tareas set canal_envio = 'Interno, ' || tg, recordatorio = greatest(0, f - crm_giwa.hoy())::text, enviada = false where id = nid;
  delete from crm_giwa.telegram_conversacion where id = chat;
  if para = yo then
    perform crm_giwa._tg_mandar_tarea(nid, array[yo], 'nueva', null, null, true);
  else
    perform crm_giwa._tg_decir(chat, 'Listo: <b>' || crm_giwa._tg_esc(d ->> 'titulo') || '</b> quedó para ' ||
      crm_giwa._tg_esc(crm_giwa.nombre_usuario(para)) || '. Ya le avisé.', crm_giwa._tg_teclado());
  end if;
end $$;

-- ── Lo que escriben ────────────────────────────────────────────────────
create or replace function crm_giwa._tg_mensaje(yo crm_giwa.usuarios, chat text, txt text) returns void
language plpgsql volatile as $$
declare
  c crm_giwa.telegram_conversacion; f date; v text := trim(coalesce(txt, '')); ml text := crm_giwa.norm_mail(yo.mail); teclas jsonb;
begin
  if v = '' then return; end if;
  if v ~* '^/start' then
    delete from crm_giwa.telegram_conversacion where id = chat;
    perform crm_giwa._tg_decir(chat, 'Hola ' || crm_giwa._tg_esc(yo.nombre) || '. Acá te llegan tus tareas. Para crear una, tocá «Nueva tarea».', crm_giwa._tg_teclado());
    return;
  end if;
  if v ~* '^/cancelar' then
    delete from crm_giwa.telegram_conversacion where id = chat;
    perform crm_giwa._tg_decir(chat, 'Listo, cancelado.', crm_giwa._tg_teclado());
    return;
  end if;
  if v ~* '^/nueva' or lower(v) = 'nueva tarea' then
    perform crm_giwa._tg_paso(chat, 'n_titulo');
    perform crm_giwa._tg_decir(chat, '¿Qué hay que hacer? Escribilo, o /cancelar para salir.', crm_giwa._tg_teclado());
    return;
  end if;

  select * into c from crm_giwa.telegram_conversacion where id = chat;
  if not found then
    perform crm_giwa._tg_decir(chat, 'Para crear una tarea, tocá «Nueva tarea». Las que te llegan se manejan con sus botones.', crm_giwa._tg_teclado());
    return;
  end if;

  if c.paso = 'comentar' then
    perform crm_giwa.comentar(jsonb_build_object('tarea_id', c.datos ->> 'tid', 'texto', v));
    delete from crm_giwa.telegram_conversacion where id = chat;
    perform crm_giwa._tg_decir(chat, 'Comentario guardado.');

  elsif c.paso in ('posponer', 'n_fecha') then
    f := crm_giwa._tg_fecha(v);
    if f is null then perform crm_giwa._tg_decir(chat, 'No entendí la fecha. Escribila así: 15/11/2026, o /cancelar para salir.'); return; end if;
    if f < crm_giwa.hoy() then perform crm_giwa._tg_decir(chat, 'Esa fecha ya pasó. Escribí otra, o /cancelar para salir.'); return; end if;
    if c.paso = 'posponer' then
      perform crm_giwa._tg_posponer(chat, (c.datos ->> 'mid')::bigint, c.datos ->> 'tid', f);
      delete from crm_giwa.telegram_conversacion where id = chat;
    else
      perform crm_giwa._tg_crear(ml, chat, c.datos, f);
    end if;

  elsif c.paso = 'n_titulo' then
    perform crm_giwa._tg_paso(chat, 'n_para', jsonb_build_object('titulo', left(v, 300)));
    perform crm_giwa._tg_decir(chat, '¿Para quién es?', crm_giwa._tg_equipo(ml));

  elsif c.paso = 'n_cliente' then
    select jsonb_build_object('inline_keyboard', coalesce(jsonb_agg(jsonb_build_array(crm_giwa._tg_btn(q.nombre, 'e|' || q.id)) order by q.nombre), '[]') ||
             jsonb_build_array(jsonb_build_array(crm_giwa._tg_btn('Sin cliente', 'e|-'))))
      into teclas
      from (select e.id, e.nombre from crm_giwa.empresas e
             where crm_giwa.norm(e.nombre) like '%' || crm_giwa.norm(v) || '%' or crm_giwa.norm(coalesce(e.alias, '')) like '%' || crm_giwa.norm(v) || '%'
             order by e.nombre limit 6) q;
    perform crm_giwa._tg_decir(chat,
      case when jsonb_array_length(teclas -> 'inline_keyboard') > 1 then 'Elegí el cliente:' else 'No encontré ese cliente. Probá con otro nombre.' end, teclas);

  else
    perform crm_giwa._tg_decir(chat, 'Elegí con los botones, o /cancelar para salir.');
  end if;
end $$;

-- ── Lo que tocan: devuelve el cartelito que ve la persona ──────────────
create or replace function crm_giwa._tg_boton(yo crm_giwa.usuarios, chat text, mid bigint, dato text) returns text
language plpgsql volatile as $$
declare
  a text[] := string_to_array(coalesce(dato, ''), '|'); acc text := a[1]; arg text := a[2];
  ml text := crm_giwa.norm_mail(yo.mail); t crm_giwa.tareas; c crm_giwa.telegram_conversacion; r jsonb; aviso text; dst crm_giwa.usuarios; f date;
begin
  -- ── Tarea nueva ──
  if acc in ('u', 'e', 'f') then
    select * into c from crm_giwa.telegram_conversacion where id = chat;
    if not found or c.paso <> (case acc when 'u' then 'n_para' when 'e' then 'n_cliente' else 'n_fecha' end) then
      perform crm_giwa._tg_teclas(chat, mid);
      return 'Ese paso ya venció. Tocá «Nueva tarea».';
    end if;
    perform crm_giwa._tg_teclas(chat, mid);
    if acc = 'u' then
      select * into dst from crm_giwa.usuarios where id = arg and es_giwa and activo;
      if not found then return 'No encontré a esa persona.'; end if;
      perform crm_giwa._tg_paso(chat, 'n_cliente', c.datos || jsonb_build_object('para', crm_giwa.norm_mail(dst.mail)));
      perform crm_giwa._tg_decir(chat, '¿De qué cliente? Escribí el nombre, o tocá «Sin cliente».',
        jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(crm_giwa._tg_btn('Sin cliente', 'e|-')))));
    elsif acc = 'e' then
      perform crm_giwa._tg_paso(chat, 'n_fecha', case when arg = '-' then c.datos else c.datos || jsonb_build_object('cliente', arg) end);
      perform crm_giwa._tg_pedir_fecha_nueva(chat);
    else
      f := crm_giwa.hoy() + arg::int;
      perform crm_giwa._tg_crear(ml, chat, c.datos, f);
    end if;
    return '';
  end if;

  -- ── Tarea existente ──
  if arg is null then return ''; end if;
  t := crm_giwa._tarea(arg);
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then
    perform crm_giwa._tg_teclas(chat, mid);
    return 'La tarea ya está cerrada.';
  end if;

  if acc = 'm' then
    perform crm_giwa._tg_paso(chat, 'comentar', jsonb_build_object('tid', t.id));
    perform crm_giwa._tg_decir(chat, 'Escribí el comentario para «' || crm_giwa._tg_esc(t.titulo) || '», o /cancelar para salir.');
    return '';
  end if;
  if acc = 'v' then
    perform crm_giwa._tg_teclas(chat, mid, crm_giwa._tg_botones(t.id));
    return '';
  end if;

  -- Cerrar, delegar y posponer son del responsable. Un mensaje viejo no puede saltearlo.
  if not crm_giwa._es_responsable(t) then
    perform crm_giwa._tg_teclas(chat, mid, jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(crm_giwa._tg_btn('Comentar', 'm|' || t.id)))));
    return 'Ya no sos responsable de esta tarea. Podés dejar un comentario.';
  end if;

  if acc = 'c' then
    r := case when coalesce(t.tipo, '') ~* 'administr' then crm_giwa.procesar_alerta(t.id, '') else crm_giwa.finalizar_tarea(t.id, '') end;
    aviso := case when nullif(r ->> 'next', '') is not null then 'Hecha. Próxima: ' || to_char((r ->> 'next')::date, 'DD/MM/YYYY') else 'Cerrada' end;
    perform crm_giwa._tg_editar(chat, mid, crm_giwa._tg_texto_tarea(t.id, null, aviso));
    return aviso;
  elsif acc = 'd' then
    perform crm_giwa._tg_teclas(chat, mid, crm_giwa._tg_equipo(ml, t.id));
    return '';
  elsif acc = 'dd' then
    select * into dst from crm_giwa.usuarios where id = a[3] and es_giwa and activo;
    if not found then return 'No encontré a esa persona.'; end if;
    perform crm_giwa.delegar_tarea(t.id, crm_giwa.norm_mail(dst.mail), '');
    aviso := 'Delegada a ' || dst.nombre;
    perform crm_giwa._tg_editar(chat, mid, crm_giwa._tg_texto_tarea(t.id, null, aviso));
    return aviso;
  elsif acc = 'p' then
    perform crm_giwa._tg_teclas(chat, mid, jsonb_build_object('inline_keyboard', jsonb_build_array(
      jsonb_build_array(crm_giwa._tg_btn('Mañana', 'p1|' || t.id), crm_giwa._tg_btn('En una semana', 'p7|' || t.id)),
      jsonb_build_array(crm_giwa._tg_btn('Elegir fecha', 'px|' || t.id), crm_giwa._tg_btn('Volver', 'v|' || t.id)))));
    return '';
  elsif acc in ('p1', 'p7') then
    return crm_giwa._tg_posponer(chat, mid, t.id, crm_giwa.hoy() + case when acc = 'p1' then 1 else 7 end);
  elsif acc = 'px' then
    perform crm_giwa._tg_paso(chat, 'posponer', jsonb_build_object('tid', t.id, 'mid', mid));
    perform crm_giwa._tg_decir(chat, 'Escribí la nueva fecha (15/11/2026), o /cancelar para salir.');
    return '';
  end if;
  return '';
end $$;

-- ── La entrada: lo único que llama telegram-bot ────────────────────────
create or replace function crm_giwa.tg_recibir(p jsonb, secreto text) returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare
  cb jsonb := p -> 'callback_query'; msg jsonb := coalesce(p -> 'callback_query' -> 'message', p -> 'message');
  chat text; de text; uid bigint := (p ->> 'update_id')::bigint; yo crm_giwa.usuarios; aviso text;
begin
  if coalesce(secreto, '') = '' or secreto is distinct from (select valor from crm_giwa.secretos where clave = 'telegram_webhook_secret') then
    return jsonb_build_object('ok', false);
  end if;
  insert into crm_giwa.telegram_updates (id) values (uid) on conflict (id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'repetido', true); end if;
  delete from crm_giwa.telegram_updates where creado < now() - interval '7 days';
  delete from crm_giwa.telegram_conversacion where creado < now() - interval '1 day';

  chat := msg -> 'chat' ->> 'id';
  de := coalesce(cb -> 'from' ->> 'id', msg -> 'from' ->> 'id');
  -- Sólo el chat privado de alguien activo del equipo. A los demás no se les contesta.
  if chat is null or chat is distinct from de then return jsonb_build_object('ok', true); end if;
  select * into yo from crm_giwa.usuarios u where u.es_giwa and u.activo and trim(u.telegram) = chat limit 1;
  if not found then return jsonb_build_object('ok', true); end if;

  -- A partir de acá, las reglas de la app corren como esta persona
  perform set_config('request.jwt.claims', jsonb_build_object('email', crm_giwa.norm_mail(yo.mail), 'role', 'authenticated')::text, true);

  begin
    if cb is not null then
      aviso := crm_giwa._tg_boton(yo, chat, (msg ->> 'message_id')::bigint, cb ->> 'data');
      perform crm_giwa._tg_llamar('answerCallbackQuery', jsonb_strip_nulls(jsonb_build_object('callback_query_id', cb ->> 'id', 'text', nullif(aviso, ''))), 'bot', chat);
    else
      perform crm_giwa._tg_mensaje(yo, chat, msg ->> 'text');
    end if;
  exception when others then
    raise log 'tg_recibir % %: %', uid, chat, sqlerrm;
    if cb is not null then
      perform crm_giwa._tg_llamar('answerCallbackQuery', jsonb_build_object('callback_query_id', cb ->> 'id', 'text', left(sqlerrm, 190), 'show_alert', true), 'bot', chat);
    else
      perform crm_giwa._tg_decir(chat, crm_giwa._tg_esc(sqlerrm));
    end if;
  end;
  return jsonb_build_object('ok', true);
end $$;

-- Una sola vez, con telegram-bot publicada: le dice a Telegram adónde mandar y le deja el botón a cada uno.
create or replace function crm_giwa.telegram_conectar() returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record; n int := 0;
begin
  if not crm_giwa.es_admin() then raise exception 'Sólo Administración.'; end if;
  perform crm_giwa._tg_llamar('setWebhook', jsonb_build_object(
    'url', 'https://ofhiogczijhzkuqdjwvz.supabase.co/functions/v1/telegram-bot',
    'secret_token', (select valor from crm_giwa.secretos where clave = 'telegram_webhook_secret'),
    'allowed_updates', jsonb_build_array('message', 'callback_query')), 'webhook', 'bot');
  perform crm_giwa._tg_llamar('setMyCommands', jsonb_build_object('commands', jsonb_build_array(
    jsonb_build_object('command', 'nueva', 'description', 'Crear una tarea'),
    jsonb_build_object('command', 'cancelar', 'description', 'Cancelar lo que estás cargando'))), 'bot', 'bot');
  for u in select telegram from crm_giwa.usuarios where es_giwa and activo and coalesce(telegram, '') <> '' loop
    perform crm_giwa._tg_decir(u.telegram, 'Ahora tus tareas llegan con botones, y podés crear una desde acá con «Nueva tarea».', crm_giwa._tg_teclado());
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'avisados', n);
end $$;

-- ── Permisos ───────────────────────────────────────────────────────────
revoke all on function crm_giwa.tg_recibir(jsonb, text), crm_giwa._tg_resumen(text), crm_giwa.telegram_conectar(),
  crm_giwa._tg_decir(text, text, jsonb), crm_giwa._tg_editar(text, bigint, text, jsonb), crm_giwa._tg_teclas(text, bigint, jsonb),
  crm_giwa._tg_paso(text, text, jsonb), crm_giwa._tg_crear(text, text, jsonb, date), crm_giwa._tg_posponer(text, bigint, text, date),
  crm_giwa._tg_pedir_fecha_nueva(text), crm_giwa._tg_mensaje(crm_giwa.usuarios, text, text), crm_giwa._tg_boton(crm_giwa.usuarios, text, bigint, text),
  crm_giwa._tg_equipo(text, text)
  from public, anon, authenticated;
grant execute on function crm_giwa.tg_recibir(jsonb, text) to service_role;
grant execute on function crm_giwa.telegram_conectar() to authenticated;
-- nueva_tarea, asignar_tarea y delegar_tarea corren como quien las llama: necesitan poder avisar
revoke all on function crm_giwa._tg_mandar_tarea(text, text[], text, text, text, boolean) from public, anon;
grant execute on function crm_giwa._tg_mandar_tarea(text, text[], text, text, text, boolean) to authenticated;
revoke all on function crm_giwa._tg_texto_tarea(text, text, text) from public, anon;
grant execute on function crm_giwa._tg_texto_tarea(text, text, text) to authenticated;

reset role;

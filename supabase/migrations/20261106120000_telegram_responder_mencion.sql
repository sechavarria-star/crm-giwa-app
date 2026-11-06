-- crm_giwa · Responder una mención desde Telegram · 06/11/2026
-- El aviso «Te mencionaron» trae el botón Responder, aunque la tarea sea de otro o esté cerrada.
-- La respuesta queda como comentario de la tarea, con @Nombre de quien mencionó (así le llega y sigue el ida y vuelta),
-- y marca como leídas las menciones de esa tarea, igual que abrirla en la app.
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- _tg_avisar suma botones opcionales. Los que la llaman con 3 datos siguen igual.
drop function if exists crm_giwa._tg_avisar(text[], text, text);
create function crm_giwa._tg_avisar(mails text[], txt text, tipo text, teclas jsonb default null) returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record;
begin
  if not crm_giwa.es_equipo() then return; end if;
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return; end if;
  for u in select distinct crm_giwa.norm_mail(mail) mail, telegram from crm_giwa.usuarios
            where crm_giwa.norm_mail(mail) = any (mails) and crm_giwa.norm_mail(mail) <> coalesce(crm_giwa.mi_mail(), '') and coalesce(telegram, '') <> '' loop
    perform crm_giwa._tg_llamar('sendMessage', jsonb_strip_nulls(jsonb_build_object('chat_id', u.telegram, 'parse_mode', 'HTML', 'text', txt, 'reply_markup', teclas)), tipo, u.mail);
  end loop;
exception when others then return;
end $$;
grant execute on function crm_giwa._tg_avisar(text[], text, text, jsonb) to authenticated, service_role;

-- Cambios puntuales sobre las funciones vigentes: frena si no encuentra exactamente lo esperado
do $$
declare o text; n text;
begin
  -- 1. El aviso de mención lleva el botón
  select pg_get_functiondef('crm_giwa._registrar_menciones(text, text, text)'::regprocedure) into o;
  n := replace(o, $a$'Tarea ' || t.id, 'mencion');$a$,
    $a$'Tarea ' || t.id, 'mencion',
      jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(crm_giwa._tg_btn('Responder', 'r|' || t.id || '|' || cid)))));$a$);
  if n = o then raise exception 'No encontré el aviso en _registrar_menciones'; end if;
  execute n;

  -- 2. El botón pide la respuesta, antes de mirar si la tarea está cerrada
  select pg_get_functiondef('crm_giwa._tg_boton(crm_giwa.usuarios, text, bigint, text)'::regprocedure) into o;
  n := replace(o, $a$  if arg is null then return ''; end if;
  t := crm_giwa._tarea(arg);$a$,
    $a$  if arg is null then return ''; end if;
  if acc = 'r' then
    select * into t from crm_giwa.tareas where id = trim(arg);
    if not found then return 'No encontré esa tarea.'; end if;
    perform crm_giwa._tg_paso(chat, 'responder', jsonb_build_object('tid', t.id, 'cid', a[3]));
    perform crm_giwa._tg_decir(chat, 'Escribí tu respuesta para «' || crm_giwa._tg_esc(t.titulo) || '».');
    return '';
  end if;
  t := crm_giwa._tarea(arg);$a$);
  if n = o then raise exception 'No encontré el arranque de tarea existente en _tg_boton'; end if;
  execute n;

  -- 3. Lo que escribe queda como comentario, con @Nombre de quien mencionó
  select pg_get_functiondef('crm_giwa._tg_mensaje(crm_giwa.usuarios, text, text)'::regprocedure) into o;
  n := replace(o, $a$  elsif c.paso in ('posponer', 'n_fecha') then$a$,
    $a$  elsif c.paso = 'responder' then
    select nullif(trim(u.nombre), '') into quien
      from crm_giwa.comentarios k join crm_giwa.usuarios u on crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(k.creador)
     where k.id = c.datos ->> 'cid' and u.es_giwa and u.activo and crm_giwa.norm_mail(u.mail) <> ml limit 1;
    if quien is not null and position(lower('@' || quien) in lower(v)) = 0 then v := '@' || quien || ' ' || v; end if;
    perform crm_giwa.comentar(jsonb_build_object('tarea_id', c.datos ->> 'tid', 'texto', v));
    perform crm_giwa.menciones_leer(c.datos ->> 'tid');
    delete from crm_giwa.telegram_conversacion where id = chat;
    perform crm_giwa._tg_decir(chat, 'Respuesta guardada.');

  elsif c.paso in ('posponer', 'n_fecha') then$a$);
  if n = o then raise exception 'No encontré los pasos en _tg_mensaje'; end if;
  n := replace(n, $a$ml text := crm_giwa.norm_mail(yo.mail); teclas jsonb;$a$, $a$ml text := crm_giwa.norm_mail(yo.mail); teclas jsonb; quien text;$a$);
  execute n;
end $$;

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Telegram desde la base · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Lo de Tareas.gs (guardarTokenTelegram, getTelegramEstado, probarTelegram,
-- enviarAlertasTelegram), con pg_net, igual que bcra_pedir:
--   guardar_token_telegram(token)   sólo Administración; se verifica con getMe
--   telegram_estado()               token sí/no, bot, quién tiene chat, último resumen y errores
--   probar_telegram()               un mensaje de prueba a quien lo pide
--   telegram_resumen_diario()       a cada responsable, sus avisos y sus tareas con
--                                   recordatorio por Telegram (lo corre pg_cron a las 8)
-- El token vive en crm_giwa.secretos: sin permisos para el navegador (ni select ni
-- nada). Sólo lo leen estas funciones (security definer). Nunca vuelve al navegador.
--
-- Para programar el envío diario (8:00 de Argentina = 11:00 UTC), Vicky corre
-- una vez en el SQL Editor:
--   select cron.schedule('crm_giwa_telegram_diario', '0 11 * * *', $$select crm_giwa.telegram_resumen_diario()$$);
-- y apaga el disparador «enviarAlertasTelegram» del Apps Script, para no mandar dos veces.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create table if not exists crm_giwa.secretos (
  clave text primary key, valor text not null, actualizado timestamptz not null default now());
alter table crm_giwa.secretos enable row level security;
revoke all on crm_giwa.secretos from public, anon, authenticated;

-- Cada pedido a Telegram (el id es el de pg_net: la respuesta queda en net._http_response)
create table if not exists crm_giwa.telegram_envios (
  id bigint primary key, tipo text not null, destino text, creado timestamptz not null default now());
alter table crm_giwa.telegram_envios enable row level security;
revoke all on crm_giwa.telegram_envios from public, anon, authenticated;

create or replace function crm_giwa._tg_llamar(metodo text, cuerpo jsonb, tipo text, destino text, token text default null) returns bigint
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare tk text := coalesce(token, (select valor from crm_giwa.secretos where clave = 'telegram_bot_token')); rid bigint;
begin
  if coalesce(tk, '') = '' then raise exception 'Falta el token de Telegram (Configuración)'; end if;
  rid := net.http_post(url := 'https://api.telegram.org/bot' || tk || '/' || metodo, body := coalesce(cuerpo, '{}'),
                       headers := '{"Content-Type":"application/json"}', timeout_milliseconds := 15000);
  insert into crm_giwa.telegram_envios (id, tipo, destino) values (rid, tipo, destino);
  return rid;
end $$;

create or replace function crm_giwa._tg_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- Se guarda y se verifica con getMe (pg_net es asíncrono: el estado muestra el bot o el error)
create or replace function crm_giwa.guardar_token_telegram(token text) returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare tk text := trim(coalesce(token, ''));
begin
  if not crm_giwa.es_admin() then raise exception 'Solo Administración.'; end if;
  if tk !~ '^\d+:[\w-]{20,}$' then raise exception 'Eso no parece un token de bot (123456789:AA…).'; end if;
  insert into crm_giwa.secretos (clave, valor) values ('telegram_bot_token', tk)
    on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  perform crm_giwa._tg_llamar('getMe', '{}', 'getMe', null, tk);
  return jsonb_build_object('ok', true, 'msg', 'Token guardado: verificando el bot…');
end $$;

create or replace function crm_giwa.telegram_estado() returns jsonb
language plpgsql stable security definer set search_path = crm_giwa, public as $$
declare me record; ult record; errs jsonb;
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  select h.status_code, h.content into me from crm_giwa.telegram_envios e join net._http_response h on h.id = e.id
   where e.tipo = 'getMe' order by e.creado desc limit 1;
  select e.creado into ult from crm_giwa.telegram_envios e where e.tipo = 'resumen' order by e.creado desc limit 1;
  select coalesce(jsonb_agg(x), '[]') into errs from (
    select e.tipo, e.destino, e.creado, coalesce((h.content::jsonb ->> 'description'), 'HTTP ' || coalesce(h.status_code::text, '?')) msg
      from crm_giwa.telegram_envios e join net._http_response h on h.id = e.id
     where coalesce(h.status_code, 0) <> 200 and e.creado > now() - interval '7 days'
     order by e.creado desc limit 5) x;
  return jsonb_build_object('ok', true,
    'configurado', exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token'),
    'bot', case when me.status_code = 200 then '@' || (me.content::jsonb -> 'result' ->> 'username') else '' end,
    'bot_error', case when me.status_code is not null and me.status_code <> 200 then coalesce(me.content::jsonb ->> 'description', 'HTTP ' || me.status_code) else '' end,
    'ultimo_resumen', ult.creado,
    'errores', errs,
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('name', u.nombre, 'conChat', coalesce(u.telegram, '') <> '') order by u.orden), '[]')
                   from crm_giwa.usuarios u where u.es_giwa and u.activo));
end $$;

create or replace function crm_giwa.probar_telegram() returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare chat text;
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  select telegram into chat from crm_giwa.usuarios where crm_giwa.norm_mail(mail) = crm_giwa.mi_mail() limit 1;
  if coalesce(chat, '') = '' then raise exception 'No tenés Usuario_Telegram cargado en Usuarios.'; end if;
  perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', chat, 'text', 'Prueba del CRM GIWA: las alertas te van a llegar por acá.'),
                              'prueba', crm_giwa.mi_mail());
  return jsonb_build_object('ok', true, 'msg', 'Prueba enviada: mirá Telegram');
end $$;

-- El resumen diario (enviarAlertasTelegram): a cada responsable, sus avisos de
-- Administración y sus tareas con recordatorio por Telegram, abiertos y en ventana.
-- Sin responsable: a Administración.
create or replace function crm_giwa.telegram_resumen_diario() returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record; txt text; n int := 0; adm text := crm_giwa.norm_mail(crm_giwa.mail_admin());
begin
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return jsonb_build_object('ok', false, 'msg', 'Falta el token'); end if;
  for u in select nombre, crm_giwa.norm_mail(mail) mail, telegram from crm_giwa.usuarios
            where es_giwa and activo and coalesce(telegram, '') <> '' order by orden loop
    select string_agg(
             case when t.overdue then 'VENCIDA · ' else '' end || crm_giwa._tg_esc(coalesce(nullif(t.alert_type, ''), 'Administración')) ||
             ' · ' || crm_giwa._tg_esc(t.title) || case when coalesce(t.client_name, '') <> '' then ' · ' || crm_giwa._tg_esc(t.client_name) else '' end ||
             ' · vence ' || to_char(t.due, 'DD/MM/YYYY'),
             E'\n' order by t.due)
      into txt
      from crm_giwa.v_tareas t
     where not coalesce(t.closed, false) and not coalesce(t.hidden, false) and coalesce(t.dup_of, '') = '' and t.due is not null
       and (t.type ~* 'administr' or coalesce(t.channels, '') ~* 'telegram')
       and u.mail = any (case when coalesce(t.assignees, '') = '' then array[adm]
                              else array(select crm_giwa.norm_mail(x) from unnest(crm_giwa.lista_csv(t.assignees)) x) end);
    continue when txt is null;
    perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', u.telegram, 'parse_mode', 'HTML',
      'text', '<b>Recordatorios · ' || to_char(crm_giwa.hoy(), 'DD/MM/YYYY') || '</b>' || E'\n' || txt), 'resumen', u.mail);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'enviados', n);
end $$;

revoke all on function crm_giwa._tg_llamar(text, jsonb, text, text, text), crm_giwa.telegram_resumen_diario() from public, anon, authenticated;
grant execute on function crm_giwa.guardar_token_telegram(text), crm_giwa.telegram_estado(), crm_giwa.probar_telegram() to authenticated;

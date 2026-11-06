-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 6: los mails, por el cartero · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Igual que KO: la base deja los mails armados en una cola y un «cartero»
-- (Apps Script en la cuenta que manda, tools/cartero/) los pide cada minuto,
-- los manda y avisa cómo le fue. El cartero no ve nada más que los mails:
-- entra con una clave compartida (se guarda sólo su hash).
--
--   soporte_mail_cola        los mails (pendiente → tomado → enviado | error)
--   cartero                  la clave (hash) y el último contacto del cartero
--   cartero_tomar(...)       el cartero pide hasta N mails; un «tomado» sin confirmar en 10 min
--                            se vuelve a ofrecer y a los 3 intentos queda como error
--   cartero_resultado(...)   el cartero informa cada envío
--   cartero_nueva_clave()    Administración genera la clave (se muestra una sola vez)
--   cartero_estado()         para la pantalla: cuenta, último contacto, pendientes y errores
--
-- Qué se avisa (Mail.gs de soporte-gs, con la misma regla de no mandar montos al cliente):
--   ticket nuevo del portal        al cliente (confirmación) y al equipo
--   ticket cargado por GIWA        al cliente sólo si se pide (avisar)
--   respuesta de GIWA              al cliente (si no es interna y se pide: avisar, por defecto sí)
--   respuesta del cliente          al equipo
--   ticket resuelto                al cliente (por defecto sí)
--   reporte publicado              a los mails que se eligieron al publicar
--   invitación al portal           al cliente, cuando se le crea el usuario (soporte-invitar)
-- «Lo que se factura aparte» le llega al cliente sin montos: el monto va por la factura.
-- El cartero no entra por la API pública: llama a la Edge Function soporte-cartero, que
-- valida la clave y usa la service_role (crm_giwa no se abre al rol anon).
-- ══════════════════════════════════════════════════════════════════════
-- el hash de la clave usa pgcrypto (schema extensions): sólo el permiso de usarlo
grant usage on schema extensions to crm_giwa_dev;

set role crm_giwa_dev;

insert into crm_giwa.cot_config (clave, valor, aclaracion) values
  ('Soporte_MailEquipo', 'soporte@giwa-ia.com', 'Soporte: a dónde le llegan al equipo los avisos de tickets nuevos y respuestas'),
  ('Soporte_MailNombre', 'Soporte GIWA', 'Soporte: nombre del remitente de los mails'),
  ('Soporte_MailResponderA', 'soporte@giwa-ia.com', 'Soporte: Reply-To de los mails')
on conflict (clave) do nothing;

create table if not exists crm_giwa.soporte_mail_cola (
  id          bigint generated always as identity primary key,
  creado      timestamptz not null default now(),
  tipo        text not null,
  para        text not null,
  asunto      text not null,
  html        text not null,
  texto       text,
  nombre      text,
  responder_a text,
  ticket_id   text references crm_giwa.soporte_tickets (id) on delete set null,
  reporte_id  text references crm_giwa.soporte_reportes (id) on delete set null,
  estado      text not null default 'pendiente',   -- pendiente · tomado · enviado · error
  intentos    int not null default 0,
  tomado_en   timestamptz,
  enviado_en  timestamptz,
  error       text
);
create index if not exists soporte_mail_cola_pend on crm_giwa.soporte_mail_cola (estado, creado);
alter table crm_giwa.soporte_mail_cola enable row level security;
drop policy if exists equipo on crm_giwa.soporte_mail_cola;
create policy equipo on crm_giwa.soporte_mail_cola for select to authenticated using ((select crm_giwa.es_equipo()));
grant select on crm_giwa.soporte_mail_cola to authenticated;
grant all on crm_giwa.soporte_mail_cola to service_role;

-- Una sola fila. Sin políticas: nadie la lee por la API; sólo las funciones de acá.
create table if not exists crm_giwa.cartero (
  id         int primary key default 1 check (id = 1),
  clave_hash text,
  cuenta     text,
  visto_en   timestamptz,
  cuota      int
);
alter table crm_giwa.cartero enable row level security;
insert into crm_giwa.cartero (id) values (1) on conflict do nothing;

-- ── armar los mails ─────────────────────────────────────────────────
create or replace function crm_giwa._sop_esc(t text) returns text
language sql immutable as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function crm_giwa._sop_url(tid text) returns text
language sql immutable as $$
  select 'https://crm.giwa-ia.com/soporte/' || case when coalesce(tid, '') <> '' then '?t=' || tid else '' end
$$;

-- El molde: marca, título, cuerpo, botón al portal y pie (los mails de soporte-gs)
create or replace function crm_giwa._sop_plantilla(titulo text, cuerpo text, tid text) returns text
language sql immutable as $$
  select '<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1a1a2e;max-width:640px;margin:0 auto">' ||
    '<div style="background:#060716;padding:16px 22px;border-radius:10px 10px 0 0;color:#fff;font-size:20px;font-weight:600;letter-spacing:.02em">GIWA <span style="color:#A855F7;font-family:Courier New,monospace">{IA}</span></div>' ||
    '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:20px 22px">' ||
    case when coalesce(titulo, '') <> '' then '<h2 style="margin:0 0 14px;font-size:19px;color:#060716">' || crm_giwa._sop_esc(titulo) || '</h2>' else '' end ||
    cuerpo ||
    '<p style="margin-top:18px"><a href="' || crm_giwa._sop_url(tid) || '" style="display:inline-block;background:#0090FF;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ver en el portal</a></p>' ||
    '<p style="font-size:11.5px;color:#888;margin:22px 0 0;border-top:1px solid #eee;padding-top:10px">Powered by GIWA {IA} · soporte@giwa-ia.com</p></div></div>'
$$;

create or replace function crm_giwa._sop_texto(t text) returns text
language sql immutable as $$
  select '<div style="white-space:pre-wrap;background:#f6f7fb;border-radius:8px;padding:12px 14px">' || crm_giwa._sop_esc(t) || '</div>'
$$;

create or replace function crm_giwa._sop_fecha(t timestamptz) returns text
language sql stable as $$ select to_char(t at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') $$;

create or replace function crm_giwa._sop_nombre(mail text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nombre from crm_giwa.usuarios where crm_giwa.norm_mail(mail) = crm_giwa.norm_mail(_sop_nombre.mail) limit 1),
                  (select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '') from crm_giwa.contactos where crm_giwa.norm_mail(email) = crm_giwa.norm_mail(_sop_nombre.mail) limit 1),
                  mail)
$$;

-- «Datos del proyecto»: el bloque del ticket (formato de los mails de AppSheet)
create or replace function crm_giwa._sop_datos(t crm_giwa.soporte_tickets) returns text
language sql stable security definer set search_path = '' as $$
  select '<p style="font-weight:700;margin:0 0 6px">Datos del pedido</p><table style="font-size:13px;border-collapse:collapse;width:100%">' ||
    string_agg('<tr><td style="padding:5px 10px 5px 0;color:#666;width:150px;border-bottom:1px solid #f0f0f0">' || k || ':</td><td style="padding:5px 0;border-bottom:1px solid #f0f0f0">' || crm_giwa._sop_esc(v) || '</td></tr>', '' order by o) ||
    '</table>' || case when coalesce(t.descripcion, '') <> '' then '<p style="font-weight:700;margin:14px 0 6px">Descripción</p>' || crm_giwa._sop_texto(t.descripcion) else '' end
  from (values (1, 'Creado por', crm_giwa._sop_nombre(t.solicitante)), (2, 'Título', t.titulo),
               (3, 'Aplicación', coalesce((select titulo from crm_giwa.desarrollos where id = t.desarrollo_id), (select nombre from crm_giwa.empresas where id = t.empresa_id))),
               (4, 'Módulo', t.modulo), (5, 'Tipo', t.tipo), (6, 'Prioridad', t.prioridad), (7, 'Fecha', crm_giwa._sop_fecha(t.creado))) x(o, k, v)
  where coalesce(v, '') <> ''
$$;

-- A quién: el cliente (quien lo pidió + «avisar también a» de la empresa, nunca alguien de GIWA) y el equipo
create or replace function crm_giwa._sop_mails_cliente(t crm_giwa.soporte_tickets) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(distinct m, ', ') from (
    select crm_giwa.norm_mail(x) as m
      from unnest(array[t.solicitante] || string_to_array(coalesce((select avisar_a from crm_giwa.soporte_empresas where empresa_id = t.empresa_id), ''), ',')) x
  ) s where coalesce(m, '') <> '' and not exists (select 1 from crm_giwa.usuarios u where u.es_giwa and crm_giwa.norm_mail(u.mail) = s.m)
$$;
create or replace function crm_giwa._sop_mails_equipo(t crm_giwa.soporte_tickets) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(distinct m, ', ') from (
    select crm_giwa.norm_mail(x) as m from unnest(array[t.responsable, (select valor from crm_giwa.cot_config where clave = 'Soporte_MailEquipo')]) x
  ) s where coalesce(m, '') <> ''
$$;

create or replace function crm_giwa._sop_encolar(tipo text, para text, asunto text, titulo text, cuerpo text, tid text, rid text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(trim(para), '') = '' then return; end if;
  insert into crm_giwa.soporte_mail_cola (tipo, para, asunto, html, nombre, responder_a, ticket_id, reporte_id)
  values (tipo, para, asunto, crm_giwa._sop_plantilla(titulo, cuerpo, tid),
          coalesce((select valor from crm_giwa.cot_config where clave = 'Soporte_MailNombre'), 'Soporte GIWA'),
          (select valor from crm_giwa.cot_config where clave = 'Soporte_MailResponderA'), tid, rid);
end $$;

-- ── los avisos (triggers) ───────────────────────────────────────────
-- Desde el CRM, las funciones del equipo dicen si se avisa: set_config('crm_giwa.avisar_*', '1' | '0', true)
create or replace function crm_giwa._sop_aviso_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
declare emp text := (select nombre from crm_giwa.empresas where id = new.empresa_id);
begin
  if new.origen = 'portal' then
    perform crm_giwa._sop_encolar('nuevo-cliente', crm_giwa._sop_mails_cliente(new), '[' || new.id || '] ' || new.titulo, 'Nuevo pedido – ' || new.id,
      '<p>Recibimos tu pedido. Te vamos a ir contando cada novedad por mail y en el portal.</p>' || crm_giwa._sop_datos(new), new.id, null);
    perform crm_giwa._sop_encolar('nuevo-equipo', crm_giwa._sop_mails_equipo(new), '[' || new.id || '] ' || new.titulo || ' · ' || coalesce(emp, ''), 'Nuevo pedido – ' || new.id,
      '<p>Llegó un pedido nuevo de <b>' || crm_giwa._sop_esc(emp) || '</b>.</p>' || crm_giwa._sop_datos(new), new.id, null);
  elsif current_setting('crm_giwa.avisar_ticket', true) = '1' then
    perform crm_giwa._sop_encolar('nuevo-cliente', crm_giwa._sop_mails_cliente(new), '[' || new.id || '] ' || new.titulo,
      case when new.estado = 'Cerrado' then 'Pedido resuelto – ' else 'Nuevo pedido – ' end || new.id,
      case when new.estado = 'Cerrado' then '<p>Registramos y resolvimos tu pedido.</p>' || crm_giwa._sop_texto(new.respuesta_final)
           else '<p>Registramos tu pedido. Te vamos a ir contando cada novedad por mail y en el portal.</p>' end || crm_giwa._sop_datos(new), new.id, null);
  end if;
  return new;
end $$;

create or replace function crm_giwa._sop_aviso_cierre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.estado is distinct from 'Cerrado' and new.estado = 'Cerrado' and current_setting('crm_giwa.avisar_cierre', true) = '1' then
    perform crm_giwa._sop_encolar('resuelto', crm_giwa._sop_mails_cliente(new), 'Resuelto: [' || new.id || '] ' || new.titulo, 'Pedido resuelto – ' || new.id,
      '<p>Dimos por resuelto tu pedido <b>' || crm_giwa._sop_esc(new.titulo) || '</b>.</p>' ||
      case when coalesce(new.respuesta_final, '') <> '' then crm_giwa._sop_texto(new.respuesta_final) else '' end ||
      '<p style="color:#666">Si algo no quedó bien, entrá al portal y tocá «Volvió a pasar».</p>', new.id, null);
  end if;
  return new;
end $$;

create or replace function crm_giwa._sop_aviso_nota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t crm_giwa.soporte_tickets; de_giwa boolean; th text := 'style="text-align:left;padding:8px;background:#f1f3f8;font-size:12px;color:#555"'; td text := 'style="padding:8px;vertical-align:top;font-size:13px"';
begin
  if new.interna or new.origen not in ('portal', 'crm') then return new; end if;
  select * into t from crm_giwa.soporte_tickets where id = new.ticket_id;
  de_giwa := exists (select 1 from crm_giwa.usuarios u where u.es_giwa and crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(new.autor));
  if de_giwa and current_setting('crm_giwa.avisar_nota', true) is distinct from '1' then return new; end if;
  perform crm_giwa._sop_encolar(case when de_giwa then 'respuesta-cliente' else 'respuesta-equipo' end,
    case when de_giwa then crm_giwa._sop_mails_cliente(t) else crm_giwa._sop_mails_equipo(t) end,
    'Re: [' || t.id || '] ' || t.titulo, 'Novedad en tu pedido – ' || t.id,
    '<p style="margin:0 0 10px"><b>' || crm_giwa._sop_esc(t.titulo) || '</b></p>' ||
    '<table style="border-collapse:collapse;width:100%;border:1px solid #eee"><tr><th ' || th || '>Fecha</th><th ' || th || '>Comentario</th><th ' || th || '>Escribió</th></tr>' ||
    '<tr><td ' || td || '>' || crm_giwa._sop_fecha(new.fecha) || '</td><td ' || td || '><div style="white-space:pre-wrap">' || crm_giwa._sop_esc(new.texto) || '</div></td><td ' || td || '>' ||
    crm_giwa._sop_esc(crm_giwa._sop_nombre(new.autor)) || '</td></tr></table>', t.id, null);
  return new;
end $$;

-- Reporte publicado: a los mails elegidos al publicar. Las horas, sin montos.
create or replace function crm_giwa._sop_aviso_reporte() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h jsonb; hs text := ''; bloques text := ''; b record;
begin
  if not (new.estado = 'Publicado' and old.estado is distinct from 'Publicado') or coalesce(new.enviado_a, '') = '' then return new; end if;
  for b in select * from (values (1, 'Lo que hicimos', new.hicimos), (2, 'Lo que revisamos', new.revisamos), (3, 'Pendiente / no incluido', new.pendiente)) x(o, t, v)
           where coalesce(trim(v), '') <> '' order by o loop
    bloques := bloques || '<h3 style="margin:16px 0 4px;font-size:15px">' || b.t || '</h3><ul style="margin:4px 0 12px;padding-left:20px">' ||
      (select string_agg('<li>' || crm_giwa._sop_esc(regexp_replace(l, '^\s*[-•*]\s*', '')) || '</li>', '') from unnest(string_to_array(b.v, chr(10))) l where trim(l) <> '') || '</ul>';
  end loop;
  if new.incluir_horas then
    h := crm_giwa.soporte_horas_reporte(new.id, false);
    hs := coalesce((select string_agg('<p><b>' || crm_giwa._sop_esc(m ->> 'titulo') || '</b>: ' || (m ->> 'usadas') || ' h de ' || (m ->> 'cupo') || ' h incluidas' ||
            case when (m ->> 'excedente')::numeric > 0 then ' · <b>' || (m ->> 'excedente') || ' h exceden y se facturan aparte</b>' else '' end || '</p>', '')
          from jsonb_array_elements(h -> 'mantenimientos') m), '');
    if hs <> '' then hs := '<h3 style="margin:16px 0 4px;font-size:15px">Horas del mes</h3>' || hs; end if;
  end if;
  perform crm_giwa._sop_encolar('reporte', new.enviado_a, coalesce(new.tipo, 'Reporte') || ' · ' || coalesce(new.titulo, ''), new.titulo,
    '<p>Te compartimos el reporte <b>' || crm_giwa._sop_esc(new.titulo) || '</b>' || case when new.periodo is not null then ' (' || new.periodo || ')' else '' end || '.</p>' ||
    case when coalesce(new.resumen, '') <> '' then crm_giwa._sop_texto(new.resumen) else '' end || bloques || hs ||
    case when exists (select 1 from crm_giwa.soporte_adjuntos where reporte_id = new.id) then '<p style="color:#666">Tiene documentación adjunta: está en el portal.</p>' else '' end,
    null, new.id);
  return new;
end $$;

drop trigger if exists aviso_ticket on crm_giwa.soporte_tickets;
create trigger aviso_ticket after insert on crm_giwa.soporte_tickets for each row execute function crm_giwa._sop_aviso_ticket();
drop trigger if exists aviso_cierre on crm_giwa.soporte_tickets;
create trigger aviso_cierre after update of estado on crm_giwa.soporte_tickets for each row execute function crm_giwa._sop_aviso_cierre();
drop trigger if exists aviso_nota on crm_giwa.soporte_notas;
create trigger aviso_nota after insert on crm_giwa.soporte_notas for each row execute function crm_giwa._sop_aviso_nota();
drop trigger if exists aviso_reporte on crm_giwa.soporte_reportes;
create trigger aviso_reporte after update of estado on crm_giwa.soporte_reportes for each row execute function crm_giwa._sop_aviso_reporte();

-- La invitación: la encola soporte-invitar (service_role) o alguien del equipo
create or replace function crm_giwa.soporte_mail_invitacion(mail text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a crm_giwa.soporte_accesos; nom text;
begin
  if not (crm_giwa.es_equipo() or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role') then raise exception 'No tenés permiso.'; end if;
  select * into a from crm_giwa.soporte_accesos where soporte_accesos.mail = crm_giwa.norm_mail(soporte_mail_invitacion.mail) and habilitado;
  if a.id is null then raise exception 'Ese mail no tiene acceso al portal.'; end if;
  nom := split_part(crm_giwa._sop_nombre(a.mail), ' ', 1);
  perform crm_giwa._sop_encolar('invitacion', a.mail, 'Tu acceso al portal de soporte de GIWA', 'Tu acceso al portal de soporte',
    '<p>Hola' || case when nom <> a.mail then ' ' || crm_giwa._sop_esc(nom) else '' end || ',</p>' ||
    '<p>Desde ahora cargás y seguís tus pedidos a GIWA en nuestro portal de soporte: ves en qué estamos trabajando, qué ya resolvimos y los reportes de mantenimiento.</p>' ||
    '<p><b>Para entrar:</b></p><ol><li>Abrí el portal con el botón de abajo.</li>' ||
    '<li>Si tu mail es de Google, tocá «Entrar con Google». Si no, escribí <b>' || crm_giwa._sop_esc(a.mail) || '</b> y te mandamos un link para entrar.</li></ol>' ||
    '<p style="color:#666">No hace falta contraseña.</p>', null, null);
  return jsonb_build_object('ok', true);
end $$;

-- ── el cartero ──────────────────────────────────────────────────────
create or replace function crm_giwa._cartero_ok(clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select clave_hash from crm_giwa.cartero where id = 1) = encode(extensions.digest(coalesce(clave, ''), 'sha256'), 'hex'), false)
$$;

create or replace function crm_giwa.cartero_tomar(clave text, cuenta text default null, cuota int default null, max int default 25) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  if not crm_giwa._cartero_ok(clave) then raise exception 'Clave inválida.'; end if;
  update crm_giwa.cartero set visto_en = now(), cuenta = coalesce(cartero_tomar.cuenta, cartero.cuenta), cuota = cartero_tomar.cuota where id = 1;
  -- los que quedaron tomados y nunca se confirmaron: a los 3 intentos, error
  update crm_giwa.soporte_mail_cola set estado = 'error', error = 'El cartero no confirmó el envío en 3 intentos.'
   where estado = 'tomado' and tomado_en < now() - interval '10 minutes' and intentos >= 3;
  with c as (
    select id from crm_giwa.soporte_mail_cola
     where estado = 'pendiente' or (estado = 'tomado' and tomado_en < now() - interval '10 minutes')
     order by creado limit greatest(0, least(coalesce(max, 25), 50)) for update skip locked
  ), u as (
    update crm_giwa.soporte_mail_cola m set estado = 'tomado', tomado_en = now(), intentos = m.intentos + 1 from c where m.id = c.id
    returning m.id, m.para, m.asunto, m.html, m.texto, m.nombre, m.responder_a, m.creado
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'para', para, 'asunto', asunto, 'html', html, 'texto', coalesce(texto, ''), 'nombre', nombre, 'responder_a', responder_a) order by creado), '[]')
    into r from u;
  return jsonb_build_object('mails', r);
end $$;

create or replace function crm_giwa.cartero_resultado(clave text, resultados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa._cartero_ok(clave) then raise exception 'Clave inválida.'; end if;
  update crm_giwa.soporte_mail_cola m
     set estado = case when (x ->> 'ok')::boolean then 'enviado' else 'error' end,
         enviado_en = case when (x ->> 'ok')::boolean then now() end,
         error = case when (x ->> 'ok')::boolean then null else left(x ->> 'error', 500) end
    from jsonb_array_elements(coalesce(resultados, '[]')) x
   where m.id = (x ->> 'id')::bigint and m.estado = 'tomado';
  update crm_giwa.cartero set visto_en = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.cartero_nueva_clave() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare c text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not (crm_giwa.es_equipo() and crm_giwa.es_admin()) then raise exception 'La clave del cartero la genera Administración.'; end if;
  update crm_giwa.cartero set clave_hash = encode(extensions.digest(c, 'sha256'), 'hex') where id = 1;
  return c;
end $$;

create or replace function crm_giwa.cartero_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  return (select jsonb_build_object('configurado', clave_hash is not null, 'cuenta', cuenta, 'visto_en', visto_en, 'cuota', cuota,
            'activo', visto_en > now() - interval '5 minutes',
            'pendientes', (select count(*) from crm_giwa.soporte_mail_cola where estado in ('pendiente', 'tomado')),
            'enviados_hoy', (select count(*) from crm_giwa.soporte_mail_cola where estado = 'enviado' and enviado_en > date_trunc('day', now())),
            'errores', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'para', para, 'asunto', asunto, 'error', error, 'creado', creado) order by creado desc), '[]')
                          from (select * from crm_giwa.soporte_mail_cola where estado = 'error' order by creado desc limit 10) e))
          from crm_giwa.cartero where id = 1);
end $$;

-- Reintentar un mail con error (vuelve a la cola)
create or replace function crm_giwa.cartero_reintentar(mid bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  update crm_giwa.soporte_mail_cola set estado = 'pendiente', intentos = 0, error = null where id = mid and estado = 'error';
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa._cartero_ok(text), crm_giwa._sop_encolar(text, text, text, text, text, text, text) from public;
revoke execute on function crm_giwa.cartero_tomar(text, text, int, int), crm_giwa.cartero_resultado(text, jsonb) from public;
grant execute on function crm_giwa.cartero_tomar(text, text, int, int), crm_giwa.cartero_resultado(text, jsonb) to service_role;
grant execute on function crm_giwa.cartero_nueva_clave(), crm_giwa.cartero_estado(), crm_giwa.cartero_reintentar(bigint), crm_giwa.soporte_mail_invitacion(text) to authenticated, service_role;

reset role;

-- ── las funciones del equipo dicen si se avisa al cliente (p.avisar) ──
-- soporte_crear: por defecto no (lo que llegó por mail ya se contestó por mail); con avisar, confirmación o «resuelto».
-- soporte_nota: por defecto sí (salvo notas internas, que nunca). soporte_resolver: por defecto sí.
set role crm_giwa_dev;
create or replace function crm_giwa.soporte_crear(p jsonb) returns jsonb
language plpgsql volatile as $$
declare emp text := nullif(trim(p ->> 'empresa_id'), ''); did text := nullif(p ->> 'desarrollo_id', ''); pid text; tid text; cl text;
        titulo text := left(trim(coalesce(p ->> 'titulo', '')), 200); tipo text; h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0);
        resp text := trim(coalesce(p ->> 'respuesta', '')); cerrar boolean := coalesce((p ->> 'resuelto')::boolean, false); rel text;
begin
  perform crm_giwa._soporte_equipo();
  perform set_config('crm_giwa.avisar_ticket', case when coalesce((p ->> 'avisar')::boolean, false) then '1' else '0' end, true);
  perform set_config('crm_giwa.avisar_nota', '0', true);
  if emp is null or not exists (select 1 from crm_giwa.empresas where id = emp) then raise exception 'Elegí la empresa.'; end if;
  if length(titulo) < 3 then raise exception 'Poné un título.'; end if;
  if did is not null then
    select proyecto_id into pid from crm_giwa.v_soporte_desarrollos where id = did and empresa_id = emp;
    if pid is null then raise exception 'Ese desarrollo no es de la empresa.'; end if;
  end if;
  tipo := coalesce(nullif(p ->> 'tipo', ''), 'Algo no funciona');
  if not (tipo = any (crm_giwa.soporte_lista('Soporte_TipoCliente') || crm_giwa.soporte_lista('Soporte_TipoGiwa'))) then tipo := 'Algo no funciona'; end if;
  if cerrar and length(resp) < 5 then raise exception 'Para cargarlo resuelto, escribí cómo se resolvió.'; end if;
  rel := nullif(p ->> 'relacionado_con', '');
  if rel is not null and not exists (select 1 from crm_giwa.soporte_tickets where id = rel and empresa_id = emp) then rel := null; end if;
  tid := crm_giwa._soporte_nuevo_id('TKT', 4);
  insert into crm_giwa.soporte_tickets (id, empresa_id, proyecto_id, desarrollo_id, tipo, sintoma, categoria, modulo, titulo, descripcion, prioridad,
                                        estado, solicitante, responsable, canal, origen, relacionado_con, resuelto, respuesta_final)
  values (tid, emp, pid, did, tipo, crm_giwa._soporte_en_lista(p ->> 'sintoma', 'Soporte_Sintoma', null),
          crm_giwa._soporte_en_lista(p ->> 'categoria', 'Soporte_Categoria', null), nullif(left(trim(coalesce(p ->> 'modulo', '')), 80), ''),
          titulo, left(coalesce(p ->> 'descripcion', ''), 20000), crm_giwa._soporte_en_lista(p ->> 'prioridad', 'Soporte_Prioridad', 'Media'),
          case when cerrar then 'Cerrado' else 'Nuevo' end, coalesce(crm_giwa.norm_mail(nullif(p ->> 'solicitante', '')), crm_giwa.mi_mail()),
          crm_giwa.mi_mail(), crm_giwa._soporte_en_lista(p ->> 'canal', 'Soporte_Canal', 'Mail'), 'crm', rel,
          case when cerrar then now() end, case when cerrar then resp end);
  -- lo trabajado va como respuesta de GIWA con sus horas: así suma igual que cualquier otra
  if h is not null or resp <> '' then
    insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
    values (crm_giwa._soporte_nuevo_id('N', 5), tid, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()),
            crm_giwa.mi_mail(), coalesce(nullif(resp, ''), 'Trabajo realizado.'), false, h, 'crm');
  end if;
  select clasificacion into cl from crm_giwa.v_soporte_clasif where ticket_id = tid;
  if cl = 'A cotizar' then perform crm_giwa._soporte_tarea_cotizar(tid); end if;
  perform crm_giwa.soporte_congelar_tarifas(emp);
  return jsonb_build_object('ok', true, 'id', tid);
end $$;

create or replace function crm_giwa.soporte_nota(p jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets; nid text; texto text := left(trim(coalesce(p ->> 'texto', '')), 20000);
        h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0); interna boolean := coalesce((p ->> 'interna')::boolean, false);
begin
  perform crm_giwa._soporte_equipo();
  perform set_config('crm_giwa.avisar_nota', case when coalesce((p ->> 'avisar')::boolean, true) then '1' else '0' end, true);
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id';
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'El ticket está resuelto y es de solo lectura. Si el problema volvió, abrí uno nuevo vinculado.'; end if;
  if h is not null and h < 0 then raise exception 'Las horas no pueden ser negativas.'; end if;
  if texto = '' and h is null and not coalesce((p ->> 'con_adjuntos')::boolean, false) then raise exception 'La respuesta está vacía.'; end if;
  nid := crm_giwa._soporte_nuevo_id('N', 5);
  insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
  values (nid, t.id, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()), crm_giwa.mi_mail(), texto, interna, h, 'crm');
  update crm_giwa.soporte_tickets set actualizado = now(),
         estado = case when not interna and estado = 'Nuevo' then 'En proceso' else estado end,
         responsable = coalesce(responsable, crm_giwa.mi_mail())
   where id = t.id;
  if h is not null then perform crm_giwa.soporte_congelar_tarifas(t.empresa_id); end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function crm_giwa.soporte_resolver(p jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets; txt text := trim(coalesce(p ->> 'respuesta', '')); h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0);
begin
  perform crm_giwa._soporte_equipo();
  perform set_config('crm_giwa.avisar_cierre', case when coalesce((p ->> 'avisar')::boolean, true) then '1' else '0' end, true);
  perform set_config('crm_giwa.avisar_nota', '0', true);
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id';
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'Ya está resuelto.'; end if;
  if length(txt) < 5 then raise exception 'Escribí cómo se resolvió.'; end if;
  if h is not null then
    insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
    values (crm_giwa._soporte_nuevo_id('N', 5), t.id, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()),
            crm_giwa.mi_mail(), 'Cierre: ' || txt, false, h, 'crm');
  end if;
  update crm_giwa.soporte_tickets set estado = 'Cerrado', resuelto = now(), respuesta_final = left(txt, 20000), actualizado = now(),
         responsable = coalesce(responsable, crm_giwa.mi_mail())
   where id = t.id;
  perform crm_giwa.soporte_congelar_tarifas(t.empresa_id);
  return jsonb_build_object('ok', true);
end $$;

reset role;

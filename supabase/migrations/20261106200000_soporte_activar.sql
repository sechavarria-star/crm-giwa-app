-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · «Activar portal»: un clic desde la invitación y adentro · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pedido de Sebastián: más simple. GIWA da de alta el mail (tildar «Puede entrar» ya invita)
-- y al cliente le llega un mail con «Activar portal», que lo deja adentro de su portal.
-- El botón trae un código propio (se guarda sólo su hash) que dura 7 días y se puede usar
-- varias veces; la Edge Function soporte-activar lo cambia por una sesión de Supabase.
-- Después, si vence, el cliente entra con Google o pide un link con su mail.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

alter table crm_giwa.soporte_accesos add column if not exists activar_hash text;
alter table crm_giwa.soporte_accesos add column if not exists activar_vence timestamptz;

create or replace function crm_giwa._sop_mail_acceso(titulo text, cuerpo text, link text, boton text, nota text) returns text
language sql immutable as $$
  select '<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1a1a2e;max-width:640px;margin:0 auto">' ||
    '<div style="background:#060716;padding:16px 22px;border-radius:10px 10px 0 0;color:#fff;font-size:20px;font-weight:600;letter-spacing:.02em">GIWA <span style="color:#A855F7;font-family:Courier New,monospace">{IA}</span></div>' ||
    '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:20px 22px">' ||
    '<h2 style="margin:0 0 14px;font-size:19px;color:#060716">' || crm_giwa._sop_esc(titulo) || '</h2>' || cuerpo ||
    '<p style="margin-top:18px"><a href="' || crm_giwa._sop_esc(link) || '" style="display:inline-block;background:#0090FF;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">' || boton || '</a></p>' ||
    '<p style="color:#666;font-size:12.5px">' || nota || '</p>' ||
    '<p style="font-size:11.5px;color:#888;margin:22px 0 0;border-top:1px solid #eee;padding-top:10px">Powered by GIWA {IA} · soporte@giwa-ia.com</p></div></div>'
$$;

create or replace function crm_giwa.soporte_mail_invitacion(mail text, link text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a crm_giwa.soporte_accesos; nom text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then raise exception 'No tenés permiso.'; end if;
  select * into a from crm_giwa.soporte_accesos where soporte_accesos.mail = crm_giwa.norm_mail(soporte_mail_invitacion.mail) and habilitado;
  if a.id is null then raise exception 'Ese mail no tiene acceso al portal.'; end if;
  nom := split_part(crm_giwa._sop_nombre(a.mail), ' ', 1);
  insert into crm_giwa.soporte_mail_cola (tipo, para, asunto, html, nombre, responder_a)
  values ('invitacion', a.mail, 'Activá tu portal de soporte de GIWA',
    crm_giwa._sop_mail_acceso('Tu portal de soporte',
      '<p>Hola' || case when nom <> a.mail then ' ' || crm_giwa._sop_esc(nom) else '' end || ',</p>' ||
      '<p>Desde ahora cargás y seguís tus pedidos a GIWA en tu portal de soporte: ves en qué estamos trabajando, qué ya resolvimos y los reportes de mantenimiento.</p>' ||
      '<p>Tocá el botón, creá tu contraseña y listo: quedás adentro. Las próximas veces entrás en <a href="https://crm.giwa-ia.com/soporte/">crm.giwa-ia.com/soporte</a> con <b>' || crm_giwa._sop_esc(a.mail) || '</b> y tu contraseña.</p>', link, 'Activar portal',
      'El botón funciona durante 7 días. Si vence, en el portal tocá «Olvidé mi contraseña».'),
    coalesce((select valor from crm_giwa.cot_config where clave = 'Soporte_MailNombre'), 'Soporte GIWA'),
    (select valor from crm_giwa.cot_config where clave = 'Soporte_MailResponderA'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.soporte_mail_ingreso(mail text, link text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare m text := crm_giwa.norm_mail(mail); nom text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then raise exception 'No tenés permiso.'; end if;
  if exists (select 1 from crm_giwa.soporte_mail_cola where tipo = 'ingreso' and para = m and creado > now() - interval '2 minutes') then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;
  nom := split_part(crm_giwa._sop_nombre(m), ' ', 1);
  insert into crm_giwa.soporte_mail_cola (tipo, para, asunto, html, nombre, responder_a)
  values ('ingreso', m, 'Creá tu contraseña del portal de soporte de GIWA',
    crm_giwa._sop_mail_acceso('Creá tu contraseña',
      '<p>Hola' || case when nom <> m then ' ' || crm_giwa._sop_esc(nom) else '' end || ', tocá el botón para crear tu contraseña del portal de soporte. Después entrás con tu mail y esa contraseña.</p>', link, 'Crear contraseña',
      'El botón funciona durante 24 horas. Si no lo pediste vos, ignorá este mail.'),
    coalesce((select valor from crm_giwa.cot_config where clave = 'Soporte_MailNombre'), 'Soporte GIWA'),
    (select valor from crm_giwa.cot_config where clave = 'Soporte_MailResponderA'));
  return jsonb_build_object('ok', true);
end $$;

drop function if exists crm_giwa._sop_mail_acceso(text, text, text, text);
revoke execute on function crm_giwa.soporte_mail_invitacion(text, text), crm_giwa.soporte_mail_ingreso(text, text) from public;
grant execute on function crm_giwa.soporte_mail_invitacion(text, text), crm_giwa.soporte_mail_ingreso(text, text) to service_role;

reset role;

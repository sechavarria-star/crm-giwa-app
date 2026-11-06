-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · el link de los mails entra directo al portal · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- El link de Supabase (/auth/v1/verify?redirect_to=…) vuelve a la dirección por defecto
-- del Auth compartido si /soporte/ no está en la lista permitida: llevaba al panel de BYD.
-- Ahora el link es https://crm.giwa-ia.com/soporte/?th=<token> y el portal abre la sesión
-- con auth.verifyOtp(token_hash): no pasa por la página de Supabase ni por su redirección.
-- (Además, un escáner de mails que abre el link no lo gasta: el token se usa con JavaScript.)
--
-- La invitación trae ese link: un clic y adentro. Si venció (1 hora), el portal deja pedir otro.
--   soporte_mail_invitacion(mail, link)  sólo service_role (la llama soporte-invitar, que arma el link)
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- el molde de los mails de acceso (invitación e ingreso): un solo botón, al link de entrada
create or replace function crm_giwa._sop_mail_acceso(titulo text, cuerpo text, link text, boton text) returns text
language sql immutable as $$
  select '<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1a1a2e;max-width:640px;margin:0 auto">' ||
    '<div style="background:#060716;padding:16px 22px;border-radius:10px 10px 0 0;color:#fff;font-size:20px;font-weight:600;letter-spacing:.02em">GIWA <span style="color:#A855F7;font-family:Courier New,monospace">{IA}</span></div>' ||
    '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:20px 22px">' ||
    '<h2 style="margin:0 0 14px;font-size:19px;color:#060716">' || crm_giwa._sop_esc(titulo) || '</h2>' || cuerpo ||
    '<p style="margin-top:18px"><a href="' || crm_giwa._sop_esc(link) || '" style="display:inline-block;background:#0090FF;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">' || boton || '</a></p>' ||
    '<p style="color:#666;font-size:12.5px">El botón sirve una sola vez y vence en una hora. Después, entrá a <a href="https://crm.giwa-ia.com/soporte/">crm.giwa-ia.com/soporte</a> y pedí un link nuevo con tu mail (o entrá con Google).</p>' ||
    '<p style="font-size:11.5px;color:#888;margin:22px 0 0;border-top:1px solid #eee;padding-top:10px">Powered by GIWA {IA} · soporte@giwa-ia.com</p></div></div>'
$$;

drop function if exists crm_giwa.soporte_mail_invitacion(text);
create or replace function crm_giwa.soporte_mail_invitacion(mail text, link text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a crm_giwa.soporte_accesos; nom text;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then raise exception 'No tenés permiso.'; end if;
  select * into a from crm_giwa.soporte_accesos where soporte_accesos.mail = crm_giwa.norm_mail(soporte_mail_invitacion.mail) and habilitado;
  if a.id is null then raise exception 'Ese mail no tiene acceso al portal.'; end if;
  nom := split_part(crm_giwa._sop_nombre(a.mail), ' ', 1);
  insert into crm_giwa.soporte_mail_cola (tipo, para, asunto, html, nombre, responder_a)
  values ('invitacion', a.mail, 'Tu acceso al portal de soporte de GIWA',
    crm_giwa._sop_mail_acceso('Tu acceso al portal de soporte',
      '<p>Hola' || case when nom <> a.mail then ' ' || crm_giwa._sop_esc(nom) else '' end || ',</p>' ||
      '<p>Desde ahora cargás y seguís tus pedidos a GIWA en nuestro portal de soporte: ves en qué estamos trabajando, qué ya resolvimos y los reportes de mantenimiento.</p>' ||
      '<p>Tocá el botón y entrás directo. No hace falta contraseña.</p>', link, 'Entrar al portal'),
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
  values ('ingreso', m, 'Tu link para entrar al portal de soporte de GIWA',
    crm_giwa._sop_mail_acceso('Entrá al portal de soporte',
      '<p>Hola' || case when nom <> m then ' ' || crm_giwa._sop_esc(nom) else '' end || ', tocá el botón para entrar. No hace falta contraseña.</p>' ||
      '<p style="color:#666;font-size:12.5px">Si no lo pediste vos, ignorá este mail.</p>', link, 'Entrar al portal'),
    coalesce((select valor from crm_giwa.cot_config where clave = 'Soporte_MailNombre'), 'Soporte GIWA'),
    (select valor from crm_giwa.cot_config where clave = 'Soporte_MailResponderA'));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa.soporte_mail_invitacion(text, text), crm_giwa.soporte_mail_ingreso(text, text) from public;
grant execute on function crm_giwa.soporte_mail_invitacion(text, text), crm_giwa.soporte_mail_ingreso(text, text) to service_role;

reset role;

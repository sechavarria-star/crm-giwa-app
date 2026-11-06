-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · el link para entrar al portal sale por el cartero · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Antes lo mandaba Supabase Auth (noreply@mail.app.supabase.io, «Your Magic Link», en
-- inglés y a Correo no deseado). Ahora la Edge Function soporte-ingreso arma el link
-- (auth.admin.generateLink, que no manda nada) y lo deja acá, con el formato de GIWA;
-- el cartero lo manda desde la cuenta de GIWA.
--   soporte_mail_ingreso(mail, link)  sólo service_role. Un pedido cada 2 minutos por mail.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

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
    '<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1a1a2e;max-width:640px;margin:0 auto">' ||
    '<div style="background:#060716;padding:16px 22px;border-radius:10px 10px 0 0;color:#fff;font-size:20px;font-weight:600;letter-spacing:.02em">GIWA <span style="color:#A855F7;font-family:Courier New,monospace">{IA}</span></div>' ||
    '<div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:20px 22px">' ||
    '<h2 style="margin:0 0 14px;font-size:19px;color:#060716">Entrá al portal de soporte</h2>' ||
    '<p>Hola' || case when nom <> m then ' ' || crm_giwa._sop_esc(nom) else '' end || ', tocá el botón para entrar. No hace falta contraseña.</p>' ||
    '<p style="margin-top:18px"><a href="' || crm_giwa._sop_esc(link) || '" style="display:inline-block;background:#0090FF;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Entrar al portal</a></p>' ||
    '<p style="color:#666;font-size:12.5px">El link sirve una sola vez y vence en una hora. Si no lo pediste vos, ignorá este mail.</p>' ||
    '<p style="font-size:11.5px;color:#888;margin:22px 0 0;border-top:1px solid #eee;padding-top:10px">Powered by GIWA {IA} · soporte@giwa-ia.com</p></div></div>',
    coalesce((select valor from crm_giwa.cot_config where clave = 'Soporte_MailNombre'), 'Soporte GIWA'),
    (select valor from crm_giwa.cot_config where clave = 'Soporte_MailResponderA'));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa.soporte_mail_ingreso(text, text) from public;
grant execute on function crm_giwa.soporte_mail_ingreso(text, text) to service_role;

reset role;

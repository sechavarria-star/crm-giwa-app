-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · ningún mail sale sin revisión · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Regla de Victoria: todo mail se arma como borrador, se ve en la app con la
-- plantilla de GIWA (Soporte › Mails por enviar), se corrige si hace falta y
-- sale recién cuando alguien lo aprueba. Única excepción: «Creá tu contraseña»
-- (tipo ingreso), que lo pide el propio cliente y tiene que salir en el momento.
--
--   estado: borrador → (aprobar) pendiente → tomado → enviado | error · (descartar) descartado
--   El cartero sigue tomando sólo los «pendiente»: no hay que cambiarlo.
--   soporte_mails_revisar()                  los borradores, para la bandeja
--   soporte_mail_aprobar(mid, asunto, html)  con lo corregido, a la cola
--   soporte_mail_descartar(mid)              no sale
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa._sop_mail_borrador() returns trigger
language plpgsql as $$
begin
  if coalesce(new.tipo, '') <> 'ingreso' and new.estado = 'pendiente' then new.estado := 'borrador'; end if;
  return new;
end $$;
drop trigger if exists mail_borrador on crm_giwa.soporte_mail_cola;
create trigger mail_borrador before insert on crm_giwa.soporte_mail_cola for each row execute function crm_giwa._sop_mail_borrador();

create or replace function crm_giwa.soporte_mails_revisar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'para', m.para, 'asunto', m.asunto, 'html', m.html,
                                                       'nombre', m.nombre, 'ticket_id', m.ticket_id, 'creado', m.creado) order by m.creado)
                     from crm_giwa.soporte_mail_cola m where m.estado = 'borrador'), '[]'::jsonb);
end $$;

create or replace function crm_giwa.soporte_mail_aprobar(mid bigint, asunto text, html text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if coalesce(trim(asunto), '') = '' or coalesce(trim(html), '') = '' then raise exception 'Falta el asunto o el texto del mail.'; end if;
  update crm_giwa.soporte_mail_cola m set estado = 'pendiente', asunto = trim(soporte_mail_aprobar.asunto), html = soporte_mail_aprobar.html
   where m.id = mid and m.estado = 'borrador';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ese mail ya no está para revisar.'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.soporte_mail_descartar(mid bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  update crm_giwa.soporte_mail_cola set estado = 'descartado' where id = mid and estado = 'borrador';
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa.soporte_mails_revisar(), crm_giwa.soporte_mail_aprobar(bigint, text, text), crm_giwa.soporte_mail_descartar(bigint) from public;
grant execute on function crm_giwa.soporte_mails_revisar(), crm_giwa.soporte_mail_aprobar(bigint, text, text), crm_giwa.soporte_mail_descartar(bigint) to authenticated;
reset role;

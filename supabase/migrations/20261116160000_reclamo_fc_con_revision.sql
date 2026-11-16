-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Reclamo de factura con revisión en la app · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Administración › «Reclamar por mail» ya no arma un borrador en Gmail: se ve en la app
-- con la plantilla de GIWA, se corrige y, al tocar «Aprobar y enviar», entra a la cola
-- del cartero ya aprobado (estado pendiente). Las respuestas van a quien lo aprobó.
--   reclamo_fc_enviar(cid, para, asunto, html)
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.reclamo_fc_enviar(cid text, para text, asunto text, html text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare mid bigint;
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if not exists (select 1 from crm_giwa.cobros c where c.id = cid) then raise exception 'No encontré esa factura.'; end if;
  if coalesce(trim(para), '') = '' or coalesce(trim(asunto), '') = '' or coalesce(trim(html), '') = '' then raise exception 'Falta el destinatario, el asunto o el texto del mail.'; end if;
  insert into crm_giwa.soporte_mail_cola (tipo, para, asunto, html, nombre, responder_a)
  values ('reclamo', trim(para), trim(asunto), html, 'GIWA', crm_giwa.mi_mail())
  returning id into mid;
  -- ya lo revisó quien lo aprueba: pasa directo a la cola (el disparador lo deja como borrador)
  update crm_giwa.soporte_mail_cola set estado = 'pendiente' where id = mid;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa.reclamo_fc_enviar(text, text, text, text) from public;
grant execute on function crm_giwa.reclamo_fc_enviar(text, text, text, text) to authenticated;
reset role;

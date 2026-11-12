-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte: las funciones internas de mails dejan de ser llamables por la API · 12/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- El linter de Supabase marcó que anon y authenticated tenían EXECUTE sobre las funciones internas
-- de soporte (los permisos por defecto del schema se los daban; el «revoke … from public» no alcanzaba).
-- Lo grave: _sop_encolar sin control → cualquier usuario logueado (también un cliente del portal)
-- podía dejar en la cola un mail a cualquier dirección, que el cartero manda desde soporte@.
-- Estas funciones sólo las usan otras funciones SECURITY DEFINER o triggers (corren como el dueño),
-- o la service_role (Edge Functions): no las necesita nadie más.
-- ══════════════════════════════════════════════════════════════════════
revoke execute on function
  crm_giwa._sop_encolar(text, text, text, text, text, text, text),
  crm_giwa._sop_nombre(text),
  crm_giwa._sop_datos(crm_giwa.soporte_tickets),
  crm_giwa._sop_mails_cliente(crm_giwa.soporte_tickets),
  crm_giwa._sop_mails_equipo(crm_giwa.soporte_tickets),
  crm_giwa._sop_aviso_ticket(), crm_giwa._sop_aviso_cierre(), crm_giwa._sop_aviso_nota(), crm_giwa._sop_aviso_reporte(),
  crm_giwa._cartero_ok(text),
  crm_giwa.cartero_tomar(text, text, int, int), crm_giwa.cartero_resultado(text, jsonb),
  crm_giwa.soporte_mail_ingreso(text, text), crm_giwa.soporte_mail_invitacion(text, text),
  crm_giwa._portal_empresa(text, boolean)
from public, anon, authenticated;

grant execute on function
  crm_giwa.cartero_tomar(text, text, int, int), crm_giwa.cartero_resultado(text, jsonb),
  crm_giwa.soporte_mail_ingreso(text, text), crm_giwa.soporte_mail_invitacion(text, text)
to service_role;

-- Las del equipo y las del portal siguen como estaban (cada una controla quién llama),
-- pero el rol anónimo no tiene por qué ejecutarlas.
revoke execute on function
  crm_giwa.cartero_estado(), crm_giwa.cartero_nueva_clave(), crm_giwa.cartero_reintentar(bigint),
  crm_giwa.mi_empresa_portal(), crm_giwa.portal_inicio(text), crm_giwa.portal_tickets(text), crm_giwa.portal_ticket(text, text),
  crm_giwa.portal_crear(jsonb), crm_giwa.portal_responder(jsonb), crm_giwa.portal_adjunto(jsonb), crm_giwa.portal_reportes(text),
  crm_giwa.portal_ingreso(), crm_giwa.soporte_puede_ver_archivo(text), crm_giwa.soporte_puede_subir_archivo(text)
from anon;

-- (el EXECUTE de anon venía por PUBLIC: se saca de PUBLIC y queda explícito para authenticated)
revoke execute on function
  crm_giwa.cartero_estado(), crm_giwa.cartero_nueva_clave(), crm_giwa.cartero_reintentar(bigint),
  crm_giwa.mi_empresa_portal(), crm_giwa.portal_inicio(text), crm_giwa.portal_tickets(text), crm_giwa.portal_ticket(text, text),
  crm_giwa.portal_crear(jsonb), crm_giwa.portal_responder(jsonb), crm_giwa.portal_adjunto(jsonb), crm_giwa.portal_reportes(text),
  crm_giwa.portal_ingreso(), crm_giwa.soporte_puede_ver_archivo(text), crm_giwa.soporte_puede_subir_archivo(text)
from public;
grant execute on function
  crm_giwa.cartero_estado(), crm_giwa.cartero_nueva_clave(), crm_giwa.cartero_reintentar(bigint),
  crm_giwa.mi_empresa_portal(), crm_giwa.portal_inicio(text), crm_giwa.portal_tickets(text), crm_giwa.portal_ticket(text, text),
  crm_giwa.portal_crear(jsonb), crm_giwa.portal_responder(jsonb), crm_giwa.portal_adjunto(jsonb), crm_giwa.portal_reportes(text),
  crm_giwa.portal_ingreso(), crm_giwa.soporte_puede_ver_archivo(text), crm_giwa.soporte_puede_subir_archivo(text)
to authenticated, service_role;

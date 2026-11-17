-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Portal: el cliente cierra su ticket y ve las horas del mes · 17/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pantallas 1 y 3 aprobadas (06/11/2026):
--   portal_cerrar(p)    «Ya está resuelto, cerrar»: el cliente cierra un ticket suyo. Queda una
--                       nota suya («Lo cerré: ya está resuelto.»), que avisa al equipo como
--                       cualquier respuesta del cliente. Al cliente no le llega mail (lo hizo él).
--   portal_horas_mes()  «Horas del mes» de Mis tickets: horas usadas contra las contratadas de sus
--                       mantenimientos vigentes en el mes en curso. Sólo si la empresa tiene
--                       mostrar_horas (la regla de siempre: las horas, sólo con ese permiso).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.portal_cerrar(p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare emp text := crm_giwa._portal_empresa(null, true); t crm_giwa.soporte_tickets; nid text;
begin
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id' and empresa_id = emp;
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'El ticket ya está cerrado.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.soporte_notas'));
  nid := 'N-' || lpad((coalesce((select max(substring(id from '^N-(\d+)$')::int) from crm_giwa.soporte_notas), 0) + 1)::text, 5, '0');
  insert into crm_giwa.soporte_notas (id, ticket_id, autor, texto, interna, origen)
  values (nid, t.id, crm_giwa.mi_mail(), 'Lo cerré: ya está resuelto.', false, 'portal');
  update crm_giwa.soporte_tickets
     set estado = 'Cerrado', resuelto = now(), actualizado = now(),
         respuesta_final = coalesce(nullif(respuesta_final, ''), 'Lo cerró el cliente: ya estaba resuelto.')
   where id = t.id;
  return jsonb_build_object('ok', true, 'id', t.id);
end $function$;

create or replace function crm_giwa.portal_horas_mes(como text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare emp text := crm_giwa._portal_empresa(como, false); per text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM');
begin
  if not coalesce((select mostrar_horas from crm_giwa.soporte_empresas where empresa_id = emp), false) then return null; end if;
  return (select case when sum(d.cupo_horas) > 0 then jsonb_build_object('usadas', coalesce(sum(c.mant), 0), 'cupo', sum(d.cupo_horas)) end
            from crm_giwa.v_soporte_desarrollos d
            left join crm_giwa.v_soporte_cuentas_mes c on c.cuenta_id = d.id and c.mes = per
           where d.empresa_id = emp and d.es_mantenimiento and d.vigente);
end $function$;

revoke execute on function crm_giwa.portal_cerrar(jsonb), crm_giwa.portal_horas_mes(text) from public, anon;
grant execute on function crm_giwa.portal_cerrar(jsonb), crm_giwa.portal_horas_mes(text) to authenticated, service_role;

reset role;

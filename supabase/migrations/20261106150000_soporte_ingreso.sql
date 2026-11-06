-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 5: el último ingreso al portal · 06/11/2026
--   portal_ingreso()  lo llama el portal al abrir: anota soporte_accesos.ultimo_ingreso
--                     (y el usuario de Auth, si todavía no estaba). Nunca con «ver como».
-- El usuario de Auth lo crea la Edge Function soporte-invitar (supabase/functions/).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.portal_ingreso() returns void
language sql volatile security definer set search_path = '' as $$
  update crm_giwa.soporte_accesos
     set ultimo_ingreso = now(),
         auth_user_id = coalesce(auth_user_id, nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid)
   where mail = crm_giwa.mi_mail() and habilitado
$$;
grant execute on function crm_giwa.portal_ingreso() to authenticated, service_role;

reset role;

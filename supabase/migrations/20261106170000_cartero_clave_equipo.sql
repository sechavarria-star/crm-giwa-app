-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · la clave del cartero la puede generar cualquiera del equipo · 06/11/2026
-- Decisión de Sebastián: antes pedía Administración (sólo Victoria). La clave sólo deja
-- tomar los mails de la cola de soporte. Queda anotado quién la generó y cuándo.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

alter table crm_giwa.cartero add column if not exists clave_por text;
alter table crm_giwa.cartero add column if not exists clave_en timestamptz;

create or replace function crm_giwa.cartero_nueva_clave() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare c text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not crm_giwa.es_equipo() then raise exception 'La clave del cartero la genera alguien del equipo.'; end if;
  update crm_giwa.cartero set clave_hash = encode(extensions.digest(c, 'sha256'), 'hex'), clave_por = crm_giwa.mi_mail(), clave_en = now() where id = 1;
  return c;
end $$;

reset role;

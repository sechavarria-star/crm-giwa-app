-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Guardar la clave de Gemini · 17/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Fallaba con «column reference "clave" is ambiguous»: el parámetro se llama
-- igual que la columna de secretos y el «on conflict (clave)» no sabía cuál era.
-- Ahora el conflicto va por el nombre de la llave primaria y el parámetro se
-- lee con su nombre completo. Misma firma y misma regla (sólo Victoria).
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
create or replace function crm_giwa.guardar_clave_gemini(clave text) returns jsonb
language plpgsql security definer set search_path to 'crm_giwa', 'public' as $function$
declare k text := trim(coalesce(guardar_clave_gemini.clave, ''));
begin
  if not crm_giwa.es_duena() then raise exception 'Sólo Victoria puede cambiar la clave de Gemini.'; end if;
  if k !~ '^[\w-]{30,}$' then raise exception 'Eso no parece una clave de Gemini (AIza…).'; end if;
  insert into crm_giwa.secretos as s (clave, valor) values ('gemini_api_key', k)
    on conflict on constraint secretos_pkey do update set valor = excluded.valor, actualizado = now();
  return jsonb_build_object('ok', true);
end $function$;
reset role;

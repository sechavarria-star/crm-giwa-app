-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Duración en semanas de un desarrollo · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Se carga en el Cotizador, en la carga rápida y, para los proyectos migrados que no
-- la tienen, desde la ficha (ícono al lado del dato vacío). Vive en desarrollos.minuta
-- ('semanas'), el mismo lugar donde la guarda el Cotizador.
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.desarrollo_semanas(did text, semanas numeric) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare m text;
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if semanas is null or semanas <= 0 then raise exception 'Cargá la duración en semanas.'; end if;
  select d.minuta into m from crm_giwa.desarrollos d where d.id = did;
  if not found then raise exception 'No encontré ese desarrollo.'; end if;
  if coalesce(btrim(m), '') = '' then m := '{}'; end if;
  if m !~ '^\s*\{' then raise exception 'La minuta de ese desarrollo no tiene el formato del Cotizador: cargá la duración desde el Cotizador.'; end if;
  update crm_giwa.desarrollos set minuta = (m::jsonb || jsonb_build_object('semanas', semanas))::text where id = did;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function crm_giwa.desarrollo_semanas(text, numeric) from public;
grant execute on function crm_giwa.desarrollo_semanas(text, numeric) to authenticated;

reset role;

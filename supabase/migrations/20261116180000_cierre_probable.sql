-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cierre probable de negociación · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- 1) Si falta, se carga desde la ficha (ícono de calendario): proyecto_cierre_probable.
-- 2) Al aprobarse un proyecto sin esa fecha, queda la fecha de aprobación
--    (vale para todos los caminos que ponen fecha_aprobacion).
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.proyecto_cierre_probable(pid text, fecha date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if fecha is null then raise exception 'Elegí la fecha.'; end if;
  update crm_giwa.proyectos set fecha_cierre_probable = fecha where id = pid;
  if not found then raise exception 'No encontré ese proyecto.'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function crm_giwa.proyecto_cierre_probable(text, date) from public;
grant execute on function crm_giwa.proyecto_cierre_probable(text, date) to authenticated;

create or replace function crm_giwa._cierre_al_aprobar() returns trigger
language plpgsql as $$
begin
  if new.fecha_cierre_probable is null and new.fecha_aprobacion is not null and old.fecha_aprobacion is null then
    new.fecha_cierre_probable := new.fecha_aprobacion;
  end if;
  return new;
end $$;
drop trigger if exists cierre_al_aprobar on crm_giwa.proyectos;
create trigger cierre_al_aprobar before update on crm_giwa.proyectos for each row execute function crm_giwa._cierre_al_aprobar();

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · fechas de un cobro desde el dashboard · etapa 4a · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- marcar_fecha_cobros(ids, campo, fecha) = marcarFechaVarios / updateCobro
--   campo 'fecha_deposito' o 'fecha_transf'. Como en el Apps Script, al
--   entrar la plata el cobrado toma el monto facturado si estaba vacío.
-- marcar_transferido_socio(ids, fecha) = marcarTransferidoSocio (fecha_transf)
-- Todo o nada: si un id no existe, no se marca ninguno.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.marcar_fecha_cobros(ids text[], campo text, fecha date) returns jsonb
language plpgsql volatile as $$
declare n int; falta text;
begin
  if campo not in ('fecha_deposito', 'fecha_transf') then raise exception 'Campo inválido'; end if;
  if fecha is null then raise exception 'Elegí la fecha'; end if;
  select string_agg(x, ', ') into falta from unnest(ids) x where not exists (select 1 from crm_giwa.cobros c where c.id = x);
  if falta is not null then raise exception 'ID no encontrado: %', falta; end if;
  update crm_giwa.cobros set
    deposito_fecha = case when campo = 'fecha_deposito' then fecha else deposito_fecha end,
    transf_fecha   = case when campo = 'fecha_transf'   then fecha else transf_fecha end,
    cobrado_ars    = case when coalesce(cobrado_ars, 0) = 0 then monto_ars else cobrado_ars end
  where id = any (ids);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'marcados', n);
end $$;

create or replace function crm_giwa.marcar_transferido_socio(ids text[], fecha date) returns jsonb
language sql volatile as $$
  select crm_giwa.marcar_fecha_cobros(ids, 'fecha_transf', coalesce(fecha, crm_giwa.hoy()))
$$;

grant execute on function crm_giwa.marcar_fecha_cobros(text[], text, date), crm_giwa.marcar_transferido_socio(text[], date) to authenticated;

reset role;

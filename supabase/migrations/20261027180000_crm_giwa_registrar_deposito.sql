-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · depósito del cliente + transferencia al socio · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- registrar_deposito(ids, fecha_deposito, fecha_socio): el popup «Depósito»
-- de Administración. Facturas de UN solo cliente, en una sola operación:
--   · deposito_fecha (cuándo depositó el cliente) y cobrado_ars (una vez),
--     sólo en las que todavía no tienen depósito;
--   · transf_fecha (cuándo le transferí al socio) sólo si viene la fecha
--     y sólo donde está vacía. Sin fecha, queda en «Para transferirle a tu socio».
-- Repetir el pedido no duplica nada: lo ya registrado no se toca.
-- No cambia el esquema ni el % del reparto (umbral reparto_socio, v_reparto_socio).
-- El Admin del Apps Script no se toca: sigue con su barra y marcarFechaVarios.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.registrar_deposito(ids text[], fecha_deposito date, fecha_socio date default null) returns jsonb
language plpgsql volatile as $$
declare
  falta text; clientes int; n_dep int := 0; n_soc int := 0;
begin
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Elegí al menos una factura'; end if;
  if fecha_deposito is null then raise exception 'Falta la fecha del depósito'; end if;
  select string_agg(x, ', ') into falta from unnest(ids) x where not exists (select 1 from crm_giwa.cobros c where c.id = x);
  if falta is not null then raise exception 'No encontré: %', falta; end if;
  select count(distinct coalesce(empresa, '')) into clientes from crm_giwa.v_cobros_det where id = any (ids);
  if clientes > 1 then raise exception 'Elegí facturas de un solo cliente'; end if;

  update crm_giwa.cobros set
    deposito_fecha = registrar_deposito.fecha_deposito,
    cobrado_ars    = case when coalesce(cobrado_ars, 0) = 0 then monto_ars else cobrado_ars end
  where id = any (ids) and deposito_fecha is null;
  get diagnostics n_dep = row_count;

  if fecha_socio is not null then
    update crm_giwa.cobros set transf_fecha = registrar_deposito.fecha_socio
    where id = any (ids) and transf_fecha is null and deposito_fecha is not null;
    get diagnostics n_soc = row_count;
  end if;

  return jsonb_build_object('ok', true, 'depositos', n_dep, 'socio', n_soc,
    'msg', case when n_dep = 0 and n_soc = 0 then 'Ya estaba registrado: no se cambió nada'
                else n_dep || ' depósito' || case when n_dep = 1 then '' else 's' end || ' registrado' || case when n_dep = 1 then '' else 's' end ||
                     case when fecha_socio is not null then ' · ' || n_soc || ' transferencia' || case when n_soc = 1 then '' else 's' end || ' al socio'
                          else ' · lo del socio queda pendiente' end end);
end $$;

grant execute on function crm_giwa.registrar_deposito(text[], date, date) to authenticated;

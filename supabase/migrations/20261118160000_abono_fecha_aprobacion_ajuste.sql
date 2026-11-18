-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Abono mensual, fecha de aprobación y ajuste por IPC · 18/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- alta_abono(pid, padre, cuota, meses, ajuste, inicio): un único MMR activo por proyecto.
-- aprobacion_fecha(pid, fecha): la fecha real de aprobación (no la del día de carga).
-- fecha_aprobado_desarrollo(did, fecha): corregirla desde el riel.
-- desarrollo_ajuste(did, si): ajusta o no por IPC (sólo antes de aprobar).
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.alta_abono(pid text, padre text, cuota numeric, meses numeric, ajuste boolean, inicio date default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare did text; tc numeric := (select valor from crm_giwa.v_tipo_cambio_hoy limit 1);
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if coalesce(cuota, 0) <= 0 or coalesce(meses, 0) <= 0 then raise exception 'Cargá la cuota y los meses.'; end if;
  if exists (select 1 from crm_giwa.desarrollos d where d.proyecto_id = pid and (d.tipo_id = 'MM' or d.modelo_pago_id = 'FP-03')
             and crm_giwa.norm(d.estado_id) !~ '(finaliz|rechaz|cancel|no acept)') then
    raise exception 'Este proyecto ya tiene un abono mensual activo: editá su cuota en vez de crear otro.';
  end if;
  did := crm_giwa.proximo_id('D', 'desarrollos', 4);
  insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, estado_id, moneda, total_ars, tipo_cambio, q_cuotas, valor_cuota_actual,
                                    modelo_pago_id, ajuste, mant_de, creador, detenido, bonificado, garantia_dias, fecha_aprobado, fecha_inicio, minuta)
  values (did, pid, 'MM', 'Mantenimiento Mensual' || coalesce(' · ' || (select titulo from crm_giwa.desarrollos where id = padre), ''), 'Aprobado', 'ARS',
          round(cuota * meses, 2), tc, meses, cuota, 'FP-03', case when ajuste then 'Ajuste' else 'Sin Ajuste' end,
          case when coalesce(padre, '') = '' then '{}' else array[padre] end, crm_giwa.mi_mail(), false, false, 0, crm_giwa.hoy(), inicio,
          jsonb_build_object('semanas', round(meses * 52 / 12))::text);
  return jsonb_build_object('ok', true, 'id', did);
end $$;

create or replace function crm_giwa.aprobacion_fecha(pid text, fecha date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if fecha is null or fecha > crm_giwa.hoy() then raise exception 'La fecha de aprobación no puede ser futura.'; end if;
  update crm_giwa.proyectos set fecha_aprobacion = fecha where id = pid;
  update crm_giwa.desarrollos set fecha_aprobado = fecha where proyecto_id = pid and fecha_aprobado = crm_giwa.hoy();
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.fecha_aprobado_desarrollo(did text, fecha date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  if fecha is null or fecha > crm_giwa.hoy() then raise exception 'La fecha de aprobación no puede ser futura.'; end if;
  update crm_giwa.desarrollos set fecha_aprobado = fecha where id = did;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.desarrollo_ajuste(did text, si boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'No tenés permiso.'; end if;
  update crm_giwa.desarrollos set ajuste = case when si then 'Ajuste' else 'Sin Ajuste' end where id = did;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function crm_giwa.alta_abono(text, text, numeric, numeric, boolean, date), crm_giwa.aprobacion_fecha(text, date),
  crm_giwa.fecha_aprobado_desarrollo(text, date), crm_giwa.desarrollo_ajuste(text, boolean) from public;
grant execute on function crm_giwa.alta_abono(text, text, numeric, numeric, boolean, date), crm_giwa.aprobacion_fecha(text, date),
  crm_giwa.fecha_aprobado_desarrollo(text, date), crm_giwa.desarrollo_ajuste(text, boolean) to authenticated;

-- Duraciones (18/11/2026): los desarrollos cerrados toman las semanas de su inicio a su fin; los abonos, sus meses en semanas
update crm_giwa.desarrollos d set minuta = ((case when coalesce(btrim(d.minuta), '') = '' then '{}' else d.minuta end)::jsonb
    || jsonb_build_object('semanas', greatest(1, round((d.fecha_fin - d.fecha_inicio) / 7.0))))::text
  where d.fecha_inicio is not null and d.fecha_fin is not null and d.fecha_fin >= d.fecha_inicio
    and crm_giwa.norm(d.estado_id) ~ 'finaliz' and not (d.tipo_id = 'MM' or d.modelo_pago_id = 'FP-03')
    and (coalesce(btrim(d.minuta), '') = '' or d.minuta ~ '^\s*\{') and coalesce(d.minuta, '') !~ '"semanas":\s*"?[1-9]';
update crm_giwa.desarrollos d set minuta = ((case when coalesce(btrim(d.minuta), '') = '' then '{}' else d.minuta end)::jsonb
    || jsonb_build_object('semanas', round(coalesce(nullif(d.q_cuotas, 0), 12) * 52 / 12)))::text
  where (d.tipo_id = 'MM' or d.modelo_pago_id = 'FP-03')
    and (coalesce(btrim(d.minuta), '') = '' or d.minuta ~ '^\s*\{') and coalesce(d.minuta, '') !~ '"semanas":\s*"?[1-9]';
reset role;

-- 06/11/2026 · Monto cotizado por desarrollo (lo aprobado pisa total_ars) y edición del monto de aprobación.
-- Se completó con el total actual, salvo URBA (P-0012) y Prune (P-0029): Victoria pasa esos valores.
set role crm_giwa_dev;
alter table crm_giwa.desarrollos add column if not exists monto_cotizado numeric;
update crm_giwa.desarrollos set monto_cotizado = total_ars where monto_cotizado is null and coalesce(total_ars, 0) > 0 and proyecto_id not in ('P-0012', 'P-0029');
do $$
declare o text;
begin
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'aprobar_proyecto';
  execute replace(o, 'for k in select jsonb_object_keys(coalesce(montos, ''{}''::jsonb)) loop',
    'update crm_giwa.desarrollos d set monto_cotizado = coalesce(d.monto_cotizado, d.total_ars) where d.proyecto_id = p.id and decisiones ->> d.id = ''entro'';' || E'\n  ' || 'for k in select jsonb_object_keys(coalesce(montos, ''{}''::jsonb)) loop');
end $$;
create or replace function crm_giwa.editar_monto_aprobado(did text, monto numeric default null, cuota_nueva numeric default null, duracion numeric default null) returns jsonb
language plpgsql volatile as $$
declare
  d crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  mant boolean := crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id);
  dur int := coalesce(nullif(duracion, 0), d.q_cuotas)::int;
  tot numeric := case when mant then cuota_nueva * dur else monto end;
begin
  if crm_giwa.estado_canonico(d.estado_id) = 'rechazada' then raise exception 'Ese desarrollo no fue aceptado.'; end if;
  if coalesce(tot, 0) <= 0 then raise exception 'El monto tiene que ser mayor a 0.'; end if;
  update crm_giwa.desarrollos x set
    monto_cotizado = coalesce(x.monto_cotizado, x.total_ars), total_ars = tot,
    total_usd = case when coalesce(x.total_ars, 0) > 0 and coalesce(x.total_usd, 0) > 0 then round(x.total_usd * tot / x.total_ars, 2) else x.total_usd end,
    cuota = case when mant then cuota_nueva else x.cuota end, valor_cuota_actual = case when mant then cuota_nueva else x.valor_cuota_actual end,
    q_cuotas = case when mant then dur else x.q_cuotas end, meses_contrato = case when mant then dur else x.meses_contrato end
  where x.id = d.id;
  perform crm_giwa.comentar(jsonb_build_object('proyecto_id', d.proyecto_id, 'desarrollo_id', d.id,
    'texto', crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' cambió el monto de ' || d.id || ': $' || to_char(round(coalesce(d.total_ars, 0)), 'FM999G999G999') || ' → $' || to_char(round(tot), 'FM999G999G999') || '.'));
  return jsonb_build_object('ok', true, 'id', d.id);
end $$;
grant execute on function crm_giwa.editar_monto_aprobado(text, numeric, numeric, numeric) to authenticated;
reset role;

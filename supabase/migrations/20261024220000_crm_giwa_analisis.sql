-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Análisis por cliente · 5e · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- getAnalisisCliente (Calculos.gs): lo que el Cotizador guardó en la minuta
-- de cada desarrollo (no mantenimiento) bajo «analisis» —horas, VH de
-- referencia, referencia, precio, veredicto— y el abono que lo cubre
-- (_abonosPorDesarrollo: la cuota del mantenimiento repartida entre los
-- desarrollos que cubre). No recalcula nada: lee lo guardado.
--   v_analisis_devs      un renglón por desarrollo con análisis
--   v_analisis_clientes  por cliente: referencia, cobrado, abono, diferencia,
--                        con 12 y 24 meses de abono y cuántos meses faltan
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.json_seguro(t text) returns jsonb
language plpgsql immutable as $$
begin
  return case when nullif(trim(coalesce(t, '')), '') is null then '{}'::jsonb else t::jsonb end;
exception when others then return '{}'::jsonb;
end $$;

create or replace view crm_giwa.v_abonos_por_desarrollo with (security_invoker = true) as
select dev as id, string_agg(m.id, ', ' order by m.orden) as ids, round(sum(m.cuota_parte)) as cuota
from (select d.id, d.orden, trim(x) as dev,
             coalesce(nullif(d.valor_cuota_actual, 0), nullif(d.cuota, 0), 0) / cardinality(array_remove(d.mant_de, '')) as cuota_parte
      from crm_giwa.desarrollos d, unnest(d.mant_de) x
      where crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id) and trim(x) <> ''
        and coalesce(nullif(d.valor_cuota_actual, 0), nullif(d.cuota, 0), 0) <> 0) m
group by dev;

create or replace view crm_giwa.v_analisis_devs with (security_invoker = true) as
select p.empresa_id as empresa, d.id, coalesce(d.titulo, '') as titulo, coalesce(p.nombre, d.proyecto_id) as proyecto,
       coalesce(d.estado_id, '') as estado, d.proyecto_id,
       crm_giwa.num(a ->> 'horas') as horas, crm_giwa.num(a ->> 'vh_referencia') as vh_referencia,
       crm_giwa.num(a ->> 'referencia') as referencia, crm_giwa.num(a ->> 'precio') as precio,
       nullif(a ->> 'desvio_pct', '')::numeric as desvio_pct, coalesce(a ->> 'veredicto', '') as veredicto,
       coalesce(a ->> 'fecha_venta', '') as fecha_venta, coalesce(a ->> 'tier', '') as tier,
       coalesce(a ->> 'reutiliza', '') as reutiliza, coalesce(ab.ids, '') as abono, coalesce(ab.cuota, 0) as mmr,
       coalesce(a ->> 'origen', '') as origen, d.orden
from crm_giwa.desarrollos d
cross join lateral (select crm_giwa.json_seguro(d.minuta) -> 'analisis' as a) j
left join crm_giwa.proyectos p on p.id = d.proyecto_id
left join crm_giwa.v_abonos_por_desarrollo ab on ab.id = d.id
where not crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id) and j.a is not null and jsonb_typeof(j.a) = 'object';

create or replace view crm_giwa.v_analisis_clientes with (security_invoker = true) as
select c.*, c.precio - c.referencia as dif, c.precio - c.referencia + 12 * c.mmr as a12, c.precio - c.referencia + 24 * c.mmr as a24,
       case when c.precio - c.referencia < 0 and c.mmr > 0 then ceil(-(c.precio - c.referencia) / c.mmr)::int else 0 end as meses
from (select coalesce(v.empresa, '') as empresa,
             case when coalesce(v.empresa, '') = '' then '' else coalesce(e.nombre, v.empresa) end as nombre,
             sum(v.referencia) as referencia, sum(v.precio) as precio, sum(v.mmr) as mmr,
             jsonb_agg(to_jsonb(v) - 'empresa' order by v.orden) as devs
      from crm_giwa.v_analisis_devs v left join crm_giwa.empresas e on e.id = v.empresa
      group by v.empresa, e.nombre) c;

grant select on crm_giwa.v_abonos_por_desarrollo, crm_giwa.v_analisis_devs, crm_giwa.v_analisis_clientes to authenticated, service_role;
grant execute on function crm_giwa.json_seguro(text) to authenticated, service_role;

reset role;

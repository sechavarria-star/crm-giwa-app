-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Administración → Gastos · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- guardar_gasto(p)  = saveGasto de Facturacion.gs: el monto se carga en su
--                     moneda y la otra sale al TC del día del gasto (tc_de_fecha).
--                     p = { id, fecha, categoria, descripcion, moneda, monto, pagador,
--                           frecuencia, prorratear, contratacion (id de contrataciones) }
-- borrar_gasto(id)  = deleteGasto
-- v_prorrateo_gastos = getProrrateo: lo marcado «prorratear» del último mes cargado,
--                     repartido entre los proyectos activos.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.guardar_gasto(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  gid    text := nullif(trim(coalesce(p ->> 'id', '')), '');
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, crm_giwa.hoy());
  mon    text := case when upper(coalesce(p ->> 'moneda', 'ARS')) like '%USD%' then 'USD' else 'ARS' end;
  monto  numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  tc     numeric := coalesce(nullif(crm_giwa.tc_de_fecha(v_fecha), 0), nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1200);
  ars numeric; usd numeric;
  frec   text := coalesce(nullif(p ->> 'frecuencia', ''), 'Mensual');
begin
  if trim(coalesce(p ->> 'descripcion', '')) = '' then raise exception 'Descripción obligatoria'; end if;
  if mon = 'USD' then usd := monto; ars := round(monto * tc); else ars := monto; usd := case when tc > 0 then round(monto / tc) else 0 end; end if;
  frec := case when frec ~* 'anual' then 'Anual' when frec ~* '[uú]nic' then 'Único' else 'Mensual' end;
  if gid is not null and exists (select 1 from crm_giwa.gastos_internos where id = gid) then
    update crm_giwa.gastos_internos set fecha = v_fecha, categoria = coalesce(p ->> 'categoria', ''),
      descripcion = trim(p ->> 'descripcion'), moneda = mon, monto_ars = ars, monto_usd = usd, recurrencia = frec,
      prorratear = coalesce((p ->> 'prorratear')::boolean, false), contratacion_id = nullif(p ->> 'contratacion', ''),
      pagador = coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), creador = nullif(crm_giwa.mi_mail(), '')
    where id = gid;
  else
    gid := crm_giwa.proximo_id('G', 'gastos_internos', 4);
    insert into crm_giwa.gastos_internos (id, fecha, categoria, descripcion, moneda, monto_ars, monto_usd, recurrencia, prorratear,
                                          contratacion_id, pagador, creador)
    values (gid, v_fecha, coalesce(p ->> 'categoria', ''), trim(p ->> 'descripcion'), mon, ars, usd, frec,
            coalesce((p ->> 'prorratear')::boolean, false), nullif(p ->> 'contratacion', ''),
            coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), nullif(crm_giwa.mi_mail(), ''));
  end if;
  return jsonb_build_object('ok', true, 'id', gid);
end $$;

create or replace function crm_giwa.borrar_gasto(gid text) returns jsonb
language plpgsql volatile as $$
begin
  delete from crm_giwa.gastos_internos where id = trim(gid);
  return jsonb_build_object('ok', true);
end $$;

create or replace view crm_giwa.v_prorrateo_gastos with (security_invoker = true) as
with um as (
  select coalesce(max(mes_key) filter (where mes_key <= to_char(crm_giwa.hoy(), 'YYYY-MM')), to_char(crm_giwa.hoy(), 'YYYY-MM')) mes
    from crm_giwa.v_gastos_plata),
act as (select count(*) n from crm_giwa.proyectos where crm_giwa.canon_proyecto(estado_id) = 'activo'),
com as (select coalesce(sum(g.monto_ars), 0) v from crm_giwa.v_gastos_plata g, um where g.prorratear and g.mes_key = um.mes)
select um.mes, com.v as compartido, act.n as proyectos_activos, round(com.v / greatest(act.n, 1)) as por_proyecto
  from um, act, com;

grant execute on function crm_giwa.guardar_gasto(jsonb), crm_giwa.borrar_gasto(text) to authenticated;
grant select on crm_giwa.v_prorrateo_gastos to authenticated;

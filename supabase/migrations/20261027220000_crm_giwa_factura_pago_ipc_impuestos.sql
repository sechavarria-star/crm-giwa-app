-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Nueva factura, Registrar pago, IPC y TC, Impuestos · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- registrar_cobro(p) = addCobro / addCobroSplit de Facturacion.gs: una fila de
--   cobros por desarrollo, mismo número de comprobante en todas. Lo fiscal
--   (razón social y CUIT) sale de la razón social por defecto del cliente.
--   La moneda decide qué se tipeó: en USD, el peso sale al TC de la fecha.
--   p = { tipo_comp, nro_fact, fecha, moneda, monto (total, opcional), fecha_deposito,
--         partes: [{ proy_id, item_id, monto, concepto, cuota_nro }] }
--   «Registrar pago» (cobro sin factura) usa la misma función: tipo «Sin
--   comprobante», sin número, con la fecha del pago como depósito.
-- actualizar_indices() = el botón «Traer del BCRA»: corre bcra_ciclo (sólo el equipo).
-- v_monotributo = getMonotributo: lo facturado en 12 meses por quien mira
--   (las notas de crédito restan), su categoría (su mail en la fila) y la sugerida.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.registrar_cobro(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  partes jsonb := coalesce(p -> 'partes', '[]');
  x jsonb; ids text[] := '{}'; items text[] := '{}';
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, crm_giwa.hoy());
  v_dep   date := nullif(p ->> 'fecha_deposito', '')::date;
  mon text := case when upper(coalesce(p ->> 'moneda', 'ARS')) like '%USD%' then 'USD' else 'ARS' end;
  tc  numeric := coalesce(nullif(crm_giwa.tc_de_fecha(v_fecha), 0), nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1200);
  nro text := trim(coalesce(p ->> 'nro_fact', ''));
  tipo text := coalesce(nullif(trim(p ->> 'tipo_comp'), ''), case when nro <> '' then 'Factura C' else 'Sin comprobante' end);
  total numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  suma numeric := 0; tip numeric; ars numeric; usd numeric; pid text; emp text; raz text; cuit text; nid text;
begin
  if jsonb_array_length(partes) = 0 then raise exception 'Elegí al menos un desarrollo'; end if;
  select coalesce(sum(nullif(e ->> 'monto', '')::numeric), 0) into suma from jsonb_array_elements(partes) e;
  if suma <= 0 then raise exception 'Falta el monto'; end if;
  if total > 0 and abs(suma - total) > 1 then
    raise exception 'La suma de las partes (%) no coincide con el total (%)', round(suma), round(total); end if;
  for x in select e from jsonb_array_elements(partes) e loop
    tip := coalesce(nullif(x ->> 'monto', '')::numeric, 0);
    continue when tip <= 0;
    raz := null; cuit := null;
    pid := coalesce(nullif(x ->> 'proy_id', ''), (select proyecto_id from crm_giwa.desarrollos where id = x ->> 'item_id'));
    if pid is null then raise exception 'Falta el proyecto de %', coalesce(x ->> 'item_id', 'una parte'); end if;
    select empresa_id into emp from crm_giwa.proyectos where id = pid;
    select r.nombre, r.cuit into raz, cuit from crm_giwa.razones_sociales r where r.empresa_id = emp order by r.por_defecto desc nulls last, r.orden limit 1;
    if raz is null then select e.nombre into raz from crm_giwa.empresas e where e.id = emp; end if;
    if mon = 'USD' then ars := round(tip * tc); usd := tip; else ars := tip; usd := case when tc > 0 then round(tip / tc) else 0 end; end if;
    nid := crm_giwa.proximo_id('C', 'cobros', 4);
    insert into crm_giwa.cobros (id, proyecto_id, desarrollo_id, forma_pago, cuit_destino, razon_social_fc, concepto_fc, cuota_nro,
                                 tipo_comprobante, comprobante_nro, comprobante_fecha, factura_owner, moneda_factura, monto_ars, total_usd,
                                 ajuste_acumulado, cobrado_ars, deposito_fecha)
    values (nid, pid, nullif(x ->> 'item_id', ''), coalesce(nullif(p ->> 'forma_pago', ''), 'Transferencia'), coalesce(cuit, ''), coalesce(raz, ''),
            coalesce(x ->> 'concepto', ''), coalesce(nullif(x ->> 'cuota_nro', '')::int, 1),
            tipo, nro, v_fecha, nullif(crm_giwa.mi_mail(), ''), mon, ars, usd, 0, case when v_dep is not null then ars else 0 end, v_dep);
    ids := ids || nid; items := items || coalesce(x ->> 'item_id', '');
  end loop;
  perform crm_giwa.sincronizar_alertas_facturacion();   -- la alerta de facturación se pone al día
  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids), 'filas', coalesce(array_length(ids, 1), 0));
end $$;

create or replace function crm_giwa.actualizar_indices() returns jsonb
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'Sin permiso'; end if;
  return crm_giwa.bcra_ciclo();
end $$;

create or replace view crm_giwa.v_monotributo with (security_invoker = true) as
with yo as (select crm_giwa.mi_mail() as mail),
f as (select coalesce(sum(d.monto), 0) as fact12
        from crm_giwa.cobros c join crm_giwa.v_cobros_det d on d.id = c.id, yo
       where crm_giwa.norm_mail(c.factura_owner) = yo.mail
         and c.comprobante_fecha >= (date_trunc('month', crm_giwa.hoy()) - interval '11 months')::date),
cat as (select i.categoria, i.ingresos_brutos as limite, i.total_servicios as mensual, i.orden,
               crm_giwa.norm_mail(coalesce(i.monotributo_unificado, '')) = (select mail from yo) as mia
          from crm_giwa.impuestos i where coalesce(i.ingresos_brutos, 0) > 0),
sug as (select coalesce((select categoria from cat, f where limite >= f.fact12 order by limite limit 1),
                        (select categoria from cat order by limite desc limit 1)) as categoria)
select cat.categoria, cat.limite, cat.mensual, cat.mia, cat.categoria = sug.categoria as sugerida,
       f.fact12, (select mail from yo) as mail, cat.orden
  from cat, f, sug;

grant execute on function crm_giwa.registrar_cobro(jsonb), crm_giwa.actualizar_indices() to authenticated;
grant select on crm_giwa.v_monotributo to authenticated;

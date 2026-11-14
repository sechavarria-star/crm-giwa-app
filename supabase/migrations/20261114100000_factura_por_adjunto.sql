-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Registrar una factura adjuntando el PDF o la imagen · 14/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- La función factura-leer (Gemini) lee el comprobante; la persona revisa y guarda
-- con lo de siempre: registrar_cobro (emitidas, Nueva factura) y guardar_gasto
-- (de proveedores, Nuevo gasto).
--   proveedores          los que le facturan a GIWA, por CUIT. Aparte de empresas
--                        para no mezclarlos con los clientes en ninguna pantalla.
--   cobros.datos_fc      todo lo leído del comprobante (CAE, IVA, alícuotas…), de respaldo.
--   gastos_internos      + proveedor_id, datos_fc y link_fc (el archivo en Drive).
--   nro_comp_norm(t)     «5-48» y «00005-00000048» son el mismo número.
--   Duplicados: emitidas, mismo tipo + número; de proveedor, mismo CUIT + tipo + número.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.nro_comp_norm(t text) returns text
language sql immutable as $$
  select case when trim(coalesce(t, '')) ~ '^\D*\d+\D+\d+\D*$'
              then lpad(ltrim((regexp_match(trim(t), '(\d+)\D+(\d+)'))[1], '0'), 5, '0') || '-' ||
                   lpad(ltrim((regexp_match(trim(t), '(\d+)\D+(\d+)'))[2], '0'), 8, '0')
              else nullif(ltrim(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '0'), '') end
$$;

create sequence if not exists crm_giwa.proveedores_seq;
create table if not exists crm_giwa.proveedores (
  id               text primary key default crm_giwa.nuevo_id('PRV', 'proveedores_seq', 3),
  cuit             text not null unique check (cuit ~ '^\d{11}$'),
  razon_social     text not null check (btrim(razon_social) <> ''),
  condicion_iva    text,
  contratacion_id  text references crm_giwa.contrataciones(id),   -- la que se propone en el próximo gasto
  creado           timestamptz not null default now(),
  actualizado      timestamptz not null default now()
);
alter table crm_giwa.proveedores enable row level security;
drop policy if exists equipo on crm_giwa.proveedores;
create policy equipo on crm_giwa.proveedores for all to authenticated
  using ((select crm_giwa.es_equipo())) with check ((select crm_giwa.es_equipo()));
grant select, insert, update on crm_giwa.proveedores to authenticated;
grant all on crm_giwa.proveedores to service_role;
grant usage on sequence crm_giwa.proveedores_seq to authenticated;

alter table crm_giwa.cobros add column if not exists datos_fc jsonb;
alter table crm_giwa.gastos_internos add column if not exists proveedor_id text references crm_giwa.proveedores(id);
alter table crm_giwa.gastos_internos add column if not exists datos_fc jsonb;
alter table crm_giwa.gastos_internos add column if not exists link_fc text;

-- ── registrar_cobro: igual que antes + duplicado + datos_fc ──
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
  datos jsonb := case when jsonb_typeof(p -> 'datos_fc') = 'object' then p -> 'datos_fc' end;
  suma numeric := 0; tip numeric; ars numeric; usd numeric; pid text; emp text; raz text; cuit text; nid text;
begin
  if jsonb_array_length(partes) = 0 then raise exception 'Elegí al menos un desarrollo'; end if;
  select coalesce(sum(nullif(e ->> 'monto', '')::numeric), 0) into suma from jsonb_array_elements(partes) e;
  if suma <= 0 then raise exception 'Falta el monto'; end if;
  if total > 0 and abs(suma - total) > 1 then
    raise exception 'La suma de las partes (%) no coincide con el total (%)', round(suma), round(total); end if;
  -- el mismo comprobante no se carga dos veces (14/11/2026)
  if nro <> '' and exists (select 1 from crm_giwa.cobros c where lower(c.tipo_comprobante) = lower(tipo)
                             and crm_giwa.nro_comp_norm(c.comprobante_nro) = crm_giwa.nro_comp_norm(nro)) then
    raise exception '% % ya está cargada', tipo, nro; end if;
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
                                 ajuste_acumulado, cobrado_ars, deposito_fecha, datos_fc)
    values (nid, pid, nullif(x ->> 'item_id', ''), coalesce(nullif(p ->> 'forma_pago', ''), 'Transferencia'), coalesce(cuit, ''), coalesce(raz, ''),
            coalesce(x ->> 'concepto', ''), coalesce(nullif(x ->> 'cuota_nro', '')::int, 1),
            tipo, nro, v_fecha, nullif(crm_giwa.mi_mail(), ''), mon, ars, usd, 0, case when v_dep is not null then ars else 0 end, v_dep, datos);
    ids := ids || nid; items := items || coalesce(x ->> 'item_id', '');
  end loop;
  perform crm_giwa.sincronizar_alertas_facturacion();
  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids), 'filas', coalesce(array_length(ids, 1), 0));
end $$;

-- ── guardar_gasto: igual que antes + proveedor, comprobante y duplicado ──
-- Al editar sin adjunto, proveedor, datos y archivo quedan como estaban.
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
  con    text := nullif(trim(coalesce(p ->> 'contratacion', '')), '');
  datos  jsonb := case when jsonb_typeof(p -> 'datos_fc') = 'object' then p -> 'datos_fc' end;
  link   text := nullif(trim(coalesce(p ->> 'link_fc', '')), '');
  pcuit  text := nullif(regexp_replace(coalesce(p #>> '{proveedor,cuit}', ''), '\D', '', 'g'), '');
  prv    text;
begin
  if trim(coalesce(p ->> 'descripcion', '')) = '' then raise exception 'Descripción obligatoria'; end if;
  if not exists (select 1 from crm_giwa.contrataciones where id = con) then
    raise exception 'Elegí la contratación del gasto'; end if;
  if pcuit is not null then
    if length(pcuit) <> 11 then raise exception 'El CUIT del proveedor tiene que tener 11 dígitos'; end if;
    insert into crm_giwa.proveedores (cuit, razon_social, condicion_iva, contratacion_id)
    values (pcuit, coalesce(nullif(trim(p #>> '{proveedor,razon_social}'), ''), pcuit), nullif(trim(coalesce(p #>> '{proveedor,condicion_iva}', '')), ''), con)
    on conflict (cuit) do update set contratacion_id = excluded.contratacion_id, actualizado = now(),
      condicion_iva = coalesce(crm_giwa.proveedores.condicion_iva, excluded.condicion_iva)
    returning id into prv;
    -- el mismo comprobante del mismo proveedor no se carga dos veces
    if coalesce(datos ->> 'numero', '') <> '' and exists (select 1 from crm_giwa.gastos_internos g
         where g.proveedor_id = prv and g.id is distinct from gid
           and lower(coalesce(g.datos_fc ->> 'tipo', '')) = lower(coalesce(datos ->> 'tipo', ''))
           and crm_giwa.nro_comp_norm(g.datos_fc ->> 'numero') = crm_giwa.nro_comp_norm(datos ->> 'numero')) then
      raise exception '% % de este proveedor ya está cargada', coalesce(datos ->> 'tipo', 'El comprobante'), datos ->> 'numero'; end if;
  end if;
  if mon = 'USD' then usd := monto; ars := round(monto * tc); else ars := monto; usd := case when tc > 0 then round(monto / tc) else 0 end; end if;
  frec := case when frec ~* 'anual' then 'Anual' when frec ~* '[uú]nic' then 'Único' else 'Mensual' end;
  if gid is not null and exists (select 1 from crm_giwa.gastos_internos where id = gid) then
    update crm_giwa.gastos_internos set fecha = v_fecha, categoria = coalesce(p ->> 'categoria', ''),
      descripcion = trim(p ->> 'descripcion'), moneda = mon, monto_ars = ars, monto_usd = usd, recurrencia = frec,
      prorratear = coalesce((p ->> 'prorratear')::boolean, false), contratacion_id = con,
      pagador = coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), creador = nullif(crm_giwa.mi_mail(), ''),
      proveedor_id = coalesce(prv, proveedor_id), datos_fc = coalesce(datos, datos_fc), link_fc = coalesce(link, link_fc)
    where id = gid;
  else
    gid := crm_giwa.proximo_id('G', 'gastos_internos', 4);
    insert into crm_giwa.gastos_internos (id, fecha, categoria, descripcion, moneda, monto_ars, monto_usd, recurrencia, prorratear,
                                          contratacion_id, pagador, creador, proveedor_id, datos_fc, link_fc)
    values (gid, v_fecha, coalesce(p ->> 'categoria', ''), trim(p ->> 'descripcion'), mon, ars, usd, frec,
            coalesce((p ->> 'prorratear')::boolean, false), con,
            coalesce(nullif(crm_giwa.norm_mail(p ->> 'pagador'), ''), nullif(crm_giwa.mi_mail(), '')), nullif(crm_giwa.mi_mail(), ''),
            prv, datos, link);
  end if;
  return jsonb_build_object('ok', true, 'id', gid);
end $$;

-- Aviso temprano al leer el adjunto (antes de subirlo a Drive): ¿ya está cargado?
-- Sin CUIT = factura emitida (cobros); con CUIT = de ese proveedor (gastos).
create or replace function crm_giwa.comprobante_cargado(tipo text, nro text, cuit_emisor text default null) returns boolean
language sql stable as $$
  -- $1 tipo · $2 nro · $3 cuit_emisor (posicionales: gastos_internos tiene una columna «tipo»)
  select case when nullif(regexp_replace(coalesce($3, ''), '\D', '', 'g'), '') is null
    then exists (select 1 from crm_giwa.cobros c where lower(c.tipo_comprobante) = lower($1)
                   and crm_giwa.nro_comp_norm(c.comprobante_nro) = crm_giwa.nro_comp_norm($2))
    else exists (select 1 from crm_giwa.gastos_internos g join crm_giwa.proveedores v on v.id = g.proveedor_id
                   where v.cuit = regexp_replace($3, '\D', '', 'g')
                     and lower(coalesce(g.datos_fc ->> 'tipo', '')) = lower($1)
                     and crm_giwa.nro_comp_norm(g.datos_fc ->> 'numero') = crm_giwa.nro_comp_norm($2)) end
$$;

grant execute on function crm_giwa.nro_comp_norm(text), crm_giwa.comprobante_cargado(text, text, text) to authenticated;

reset role;

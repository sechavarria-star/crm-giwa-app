-- crm_giwa · Tipo de contratación, gastos siempre con contratación y correcciones · 12/11/2026 (pedido de Vicky)
-- 1) contrataciones.tipo: «Proveedor» (lo de siempre; se ofrece en el Cotizador) o «Interno» (sólo gastos de GIWA,
--    el Cotizador no lo muestra). Nueva contratación interna AFIP · Monotributo.
-- 2) Gastos de Monotributo: los de Vicky se vinculan a esa contratación; los de Diego se borran (no factura para
--    GIWA, no son gasto real). guardar_gasto exige una contratación existente.
-- 3) Redsom C-0048 (cuota 6, FC 0005-00000047): se cargó con fecha de depósito y todavía no se cobró.
-- El antes de cada dato tocado queda en admin_auditoria.
set role crm_giwa_dev;
set search_path = crm_giwa, public;

alter table crm_giwa.contrataciones add column if not exists tipo text not null default 'Proveedor';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contrataciones_tipo_ok') then
    alter table crm_giwa.contrataciones add constraint contrataciones_tipo_ok check (tipo in ('Proveedor', 'Interno'));
  end if;
end $$;

-- guardar_contratacion guarda el tipo
create or replace function crm_giwa.guardar_contratacion(p jsonb) returns jsonb
language plpgsql as $function$
declare cid text := nullif(trim(p ->> 'id'), ''); nom text := trim(coalesce(p ->> 'producto', ''));
        usd numeric := greatest(crm_giwa.num(p ->> 'costo_usd'), 0); ars numeric := greatest(crm_giwa.num(p ->> 'costo_ars'), 0);
        tp text := case when coalesce(p ->> 'tipo', '') ~* 'intern' then 'Interno' else 'Proveedor' end;
begin
  if nom = '' then raise exception 'Nombre obligatorio'; end if;
  if cid is null then
    select 'CONT-' || lpad((coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
      into cid from crm_giwa.contrataciones;
    insert into crm_giwa.contrataciones (id, categoria, producto, nivel, unidad, moneda, costo_usd, costo_ars, tipo)
    values (cid, nullif(trim(p ->> 'categoria'), ''), nom, nullif(trim(p ->> 'nivel'), ''),
            coalesce(nullif(trim(p ->> 'unidad'), ''), 'Hora'), case when usd > 0 then 'USD' else 'ARS' end, usd, ars, tp);
  else
    update crm_giwa.contrataciones set categoria = nullif(trim(p ->> 'categoria'), ''), producto = nom,
      nivel = nullif(trim(p ->> 'nivel'), ''), unidad = coalesce(nullif(trim(p ->> 'unidad'), ''), 'Hora'),
      costo_usd = usd, costo_ars = ars, tipo = tp
    where id = cid;
    if not found then raise exception 'Contratación no encontrada'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', cid);
end $function$;

-- El Cotizador no ofrece las internas
do $$
declare o text; n text;
begin
  select pg_get_functiondef('crm_giwa.cot_inicio()'::regprocedure) into o;
  n := replace(o, $a$from crm_giwa.contrataciones k where coalesce(k.producto, '') <> '')$a$,
                  $a$from crm_giwa.contrataciones k where coalesce(k.producto, '') <> '' and k.tipo <> 'Interno')$a$);
  if n = o then raise exception 'No encontré las contrataciones en cot_inicio'; end if;
  execute n;
end $$;

-- guardar_gasto: la contratación es obligatoria y tiene que existir
do $$
declare o text; n text;
begin
  select pg_get_functiondef('crm_giwa.guardar_gasto(jsonb)'::regprocedure) into o;
  n := replace(o, $a$if trim(coalesce(p ->> 'descripcion', '')) = '' then raise exception 'Descripción obligatoria'; end if;$a$,
                  $a$if trim(coalesce(p ->> 'descripcion', '')) = '' then raise exception 'Descripción obligatoria'; end if;
  if not exists (select 1 from crm_giwa.contrataciones where id = nullif(trim(coalesce(p ->> 'contratacion', '')), '')) then
    raise exception 'Elegí la contratación del gasto'; end if;$a$);
  if n = o then raise exception 'No encontré la validación en guardar_gasto'; end if;
  execute n;
end $$;

-- AFIP · Monotributo (interna) y los gastos
do $$
declare cid text;
begin
  select id into cid from crm_giwa.contrataciones where tipo = 'Interno' and categoria = 'AFIP' and producto = 'Monotributo';
  if cid is null then
    select 'CONT-' || lpad((coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0') into cid from crm_giwa.contrataciones;
    insert into crm_giwa.contrataciones (id, categoria, producto, unidad, moneda, costo_usd, costo_ars, tipo)
    values (cid, 'AFIP', 'Monotributo', 'Mensual', 'ARS', 0, 0, 'Interno');
  end if;

  insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
  select 'v.gagey@giwa-ia.com', 'gastos_internos', g.id, 'borrar', to_jsonb(g), null,
         'Pedido de Vicky 12/11: monotributo de Diego, no factura para GIWA (no es gasto real)'
    from crm_giwa.gastos_internos g where g.descripcion = 'Monotributo' and crm_giwa.norm_mail(g.pagador) = 'd.camps@giwa-ia.com';
  delete from crm_giwa.gastos_internos where descripcion = 'Monotributo' and crm_giwa.norm_mail(pagador) = 'd.camps@giwa-ia.com';

  insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
  select 'v.gagey@giwa-ia.com', 'gastos_internos', g.id, 'editar', to_jsonb(g), to_jsonb(g) || jsonb_build_object('contratacion_id', cid),
         'Pedido de Vicky 12/11: monotributo vinculado a la contratación AFIP · Monotributo'
    from crm_giwa.gastos_internos g where g.descripcion = 'Monotributo' and coalesce(trim(g.contratacion_id), '') = '';
  update crm_giwa.gastos_internos set contratacion_id = cid where descripcion = 'Monotributo' and coalesce(trim(contratacion_id), '') = '';
end $$;

-- Redsom C-0048: sin cobrar
insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', 'cobros', c.id, 'editar', to_jsonb(c), to_jsonb(c) || '{"deposito_fecha": null, "cobrado_ars": 0}',
       'Pedido de Vicky 12/11: la cuota 6 de Redsom se cargó con fecha de depósito y todavía no se cobró'
  from crm_giwa.cobros c where c.id = 'C-0048' and c.deposito_fecha is not null and c.transf_fecha is null;
update crm_giwa.cobros set deposito_fecha = null, cobrado_ars = 0 where id = 'C-0048' and deposito_fecha is not null and transf_fecha is null;

reset role;

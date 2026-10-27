-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · motor del Cotizador · etapa 5h(a) · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- estimar_desarrollo(tipo, empresa_id, opts) = estimarDesarrollo de
-- Calculos.gs, con la misma cuenta:
--   horas  = Σ horas_base × cantidad × factor × reutilización (de lo tildado)
--   precio = horas × vh_giwa_ars × multiplicador del Tier de la empresa
--   dificultad = el nivel de dif_multiplicadores más cercano al factor promedio
--   abono  = piso cupo × hora de soporte / (1 − margen)
-- opts = { sel:{modulo:true|false}, cant:{modulo:n}, mejora:bool, cupo_soporte, margen_abono }
-- Sin sel, cuenta lo sugerido. Lo fusionado (reemplazado_por) cuenta en el que lo reemplaza.
--
-- num_ar(texto) = _n de _Core.gs: «$ 62.246» → 62246, «1,5» → 1.5, «88.92» → 88.92.
-- (crm_giwa.num no entiende los miles con punto ni el «$», y cot_config los tiene.)
--
-- Hora de soporte: en el Apps Script sale de la fila de Soporte de CatalogoModulos,
-- pero catalogo_modulos no tiene precio de venta, así que hoy da 0 en los dos lados
-- (y el piso del abono también). Se deja igual para que los números coincidan.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.num_ar(t text) returns numeric
language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(t, ''), '[$\sUSDARusdar ]', '', 'g'); p text[];
begin
  if s = '' then return 0; end if;
  if position(',' in s) > 0 then
    s := replace(replace(s, '.', ''), ',', '.');
  else
    p := string_to_array(s, '.');
    if not (array_length(p, 1) = 2 and length(p[2]) between 1 and 2) then s := replace(s, '.', ''); end if;
  end if;
  s := substring(s from '^-?\d*\.?\d+');   -- parseFloat: el número del principio
  return coalesce(s::numeric, 0);
exception when others then return 0;
end $$;

create or replace function crm_giwa.estimar_desarrollo(tipo text, empresa_id text default '', opts jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  o     jsonb := coalesce(opts, '{}');
  sel   jsonb := coalesce(o -> 'sel', '{}');
  cant  jsonb := coalesce(o -> 'cant', '{}');
  cod   text;
  rep   record;
  reut  numeric;
  m     record;
  det   jsonb := '[]';
  hbase numeric := 0; hfac numeric := 0; horas numeric := 0;
  q numeric; r numeric; b numeric; h numeric;
  ratio numeric; dif text := 'Media'; d0 numeric := 99; k record;
  tier_id text := ''; tier_emp text := ''; mult numeric := 1;
  vh_giwa numeric; vh_costo numeric; vh_merc numeric; vh_cli numeric;
  cupo numeric; margen numeric; vh_sop numeric := 0;
begin
  -- _codigoTipo: el código o el nombre de tipos_desarrollo, sin acentos ni signos
  select t.id into cod from crm_giwa.tipos_desarrollo t
   where regexp_replace(crm_giwa.norm(t.id), '[^a-z0-9]', '', 'g') = regexp_replace(crm_giwa.norm(tipo), '[^a-z0-9]', '', 'g')
      or regexp_replace(crm_giwa.norm(t.nombre), '[^a-z0-9]', '', 'g') = regexp_replace(crm_giwa.norm(tipo), '[^a-z0-9]', '', 'g')
   limit 1;
  cod := upper(coalesce(cod, tipo, ''));

  if not exists (select 1 from crm_giwa.catalogo_modulos c where c.id <> '' and upper(c.tipo_desarrollo_id) = cod and c.activo is not false) then
    return jsonb_build_object('ok', false, 'msg', 'CatalogoModulos no tiene módulos del tipo ' || coalesce(tipo, ''));
  end if;

  -- Lo tildado en un módulo fusionado cuenta en el que lo reemplaza
  for rep in select c.id, c.reemplazado_por rp from crm_giwa.catalogo_modulos c
              where upper(c.tipo_desarrollo_id) = cod and coalesce(c.reemplazado_por, '') <> '' loop
    if sel -> rep.id = 'true'::jsonb and not sel ? rep.rp then sel := sel || jsonb_build_object(rep.rp, true); end if;
    if crm_giwa.num_ar(cant ->> rep.id) <> 0 and crm_giwa.num_ar(cant ->> rep.rp) = 0 then
      cant := cant || jsonb_build_object(rep.rp, cant -> rep.id);
    end if;
  end loop;

  reut := case when coalesce((o ->> 'mejora')::boolean, false)
               then coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'modulo_reutilizacion')), 0), 0.5)
               else 1 end;

  -- Los módulos activos del tipo, en orden; «puesto» = tildado (o sugerido) y su madre también
  for m in
    with recursive mods as (
      select c.*, coalesce(c.factor, 0) f0 from crm_giwa.catalogo_modulos c
       where c.id <> '' and upper(c.tipo_desarrollo_id) = cod and c.activo is not false
    ), prendido as (
      select x.id, case when sel ? x.id then sel -> x.id = 'true'::jsonb else coalesce(x.sugerido, false) end as on_
        from mods x
    ), cadena as (            -- cada módulo con toda su línea de madres que existen en el catálogo
      select x.id, x.id as anc from mods x
      union
      select ca.id, y.padre from cadena ca join mods y on y.id = ca.anc
       where coalesce(y.padre, '') <> '' and exists (select 1 from mods z where z.id = y.padre)
    )
    select x.*, bool_and(pr.on_) as puesto
      from mods x join cadena ca on ca.id = x.id join prendido pr on pr.id = ca.anc
     group by x.id, x.tipo_desarrollo_id, x.etapa, x.orden, x.nombre, x.bloque_comercial, x.entregable, x.pregunta, x.sugerido,
              x.horas_base, x.es_relevamiento, x.es_replicable, x.es_por_instancia, x.padre, x.factor, x.efecto, x.alcance,
              x.nivel, x.grupo, x.activo, x.reemplazado_por, x.f0
     order by coalesce(x.orden, 0)
  loop
    continue when not m.puesto;
    q := case when coalesce(m.es_por_instancia, false) then greatest(1, coalesce(nullif(crm_giwa.num_ar(cant ->> m.id), 0), 1)) else 1 end;
    r := case when coalesce(m.es_replicable, false) then reut else 1 end;
    b := coalesce(m.horas_base, 0) * q;
    h := round(b * coalesce(nullif(m.factor, 0), 1) * r, 2);
    hbase := hbase + b; hfac := hfac + b * coalesce(nullif(m.factor, 0), 1); horas := horas + h;
    det := det || jsonb_build_array(jsonb_build_object('id', m.id, 'nombre', coalesce(m.nombre, ''), 'etapa', coalesce(m.etapa, ''),
      'bloque', coalesce(nullif(m.bloque_comercial, ''), 'Otros'), 'entregable', coalesce(m.entregable, ''),
      'relevamiento', coalesce(m.es_relevamiento, false), 'base', coalesce(m.horas_base, 0), 'cantidad', q,
      'factor', coalesce(nullif(m.factor, 0), 1), 'reutilizacion', r, 'horas', h));
  end loop;
  horas := round(horas, 2);

  -- Dificultad: el nivel más cercano al factor promedio (dif_multiplicadores o 0,53/1/1,71/2)
  ratio := case when hbase > 0 then hfac / hbase else 1 end;
  for k in
    with raw as (select coalesce((select valor from crm_giwa.cot_config where clave = 'dif_multiplicadores'), '') v),
    cfgm as (select trim(split_part(p, ':', 1)) n, crm_giwa.num_ar(split_part(p, ':', 2)) mlt, ord
               from raw, unnest(string_to_array(raw.v, ',')) with ordinality as u(p, ord)
              where array_length(string_to_array(p, ':'), 1) = 2 and crm_giwa.num_ar(split_part(p, ':', 2)) > 0),
    def as (select * from (values ('Baja', 0.53, 1), ('Media', 1.0, 2), ('Alta', 1.71, 3), ('Muy alta', 2.0, 4)) d(n, mlt, ord))
    select n, mlt from (select n, mlt, 1 src, ord from cfgm union all
                        select n, mlt, 2, ord from def where not exists (select 1 from cfgm)) z order by src, ord
  loop
    if abs(k.mlt - ratio) < d0 then d0 := abs(k.mlt - ratio); dif := k.n; end if;
  end loop;

  -- Tier de la empresa
  if coalesce(empresa_id, '') <> '' then
    select coalesce(e.tier_id, ''), coalesce(e.nombre, '') into tier_id, tier_emp from crm_giwa.empresas e where e.id = trim(empresa_id);
    select coalesce(nullif(t.multiplicador, 0), 1) into mult from crm_giwa.tier t
     where tier_id <> '' and crm_giwa.norm(t.id) = crm_giwa.norm(tier_id) and t.multiplicador > 0;
    mult := coalesce(mult, 1);
  end if;
  tier_id := coalesce(tier_id, ''); tier_emp := coalesce(tier_emp, '');

  vh_giwa  := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_giwa_ars'));
  vh_costo := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_costo_ars'));
  vh_merc  := crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_mercado_ars'));
  vh_cli   := round(vh_giwa * mult, 2);

  cupo   := coalesce(nullif(crm_giwa.num_ar(o ->> 'cupo_soporte'), 0), 6);
  margen := coalesce(nullif(crm_giwa.num_ar(o ->> 'margen_abono'), 0), 0.4);

  return jsonb_build_object('ok', true, 'tipo', tipo, 'empresa_id', coalesce(empresa_id, ''), 'empresa_encontrada', tier_emp,
    'tier', tier_id, 'tier_mult', mult, 'dificultad', dif, 'factor_promedio', round(ratio, 2),
    'mejora', coalesce((o ->> 'mejora')::boolean, false), 'reutilizacion', reut,
    'horas_base', round(hbase, 2), 'horas', horas, 'valor_hora', vh_cli,
    'vh', jsonb_build_object('giwa', vh_giwa, 'costo', vh_costo, 'mercado', vh_merc),
    'total_ars', round(horas * vh_cli), 'costo_ars', round(horas * vh_costo), 'mercado_ars', round(horas * vh_merc),
    'faltan', to_jsonb(array_remove(array[case when vh_giwa = 0 then 'vh_giwa_ars' end, case when vh_costo = 0 then 'vh_costo_ars' end,
                                          case when vh_merc = 0 then 'vh_mercado_ars' end], null)),
    'abono', jsonb_build_object('cupo', cupo, 'hora_soporte', vh_sop, 'margen', margen,
                                'piso', case when vh_sop > 0 then round(cupo * vh_sop / (1 - margen)) else 0 end,
                                'costo', round(cupo * vh_sop)),
    'detalle', det);
end $$;

grant execute on function crm_giwa.num_ar(text), crm_giwa.estimar_desarrollo(text, text, jsonb) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cotizador: costos asociados por ítem y días de garantía · 12/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Mock aprobado: «+ Costos» elige servicios de Contrataciones con casillas y, por
-- cada uno, de quién es (GIWA o Cliente); también costos externos a mano (nombre,
-- monto, mensual o único), como los de URBA.
--   · _cot_ext: el «paga» va por ítem (si no, el del grupo, como antes) y pasa los externos a mano.
--   · _cot_costos: escribe también los externos a mano (tipo «Externo (Cotizador)») y los reemplaza al guardar.
--   · cot_guardar / cot_leer: guardan y devuelven los días de garantía («Más información»).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa._cot_ext(m jsonb)
 returns jsonb
 language sql
 immutable
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('cid', y ->> 'cid', 'cantidad', crm_giwa.num_ar(y ->> 'cantidad'),
                                               'paga', case when coalesce(y ->> 'paga', x ->> 'paga') = 'GIWA' then 'GIWA' else 'Cliente' end,
                                               'nombre', y ->> 'nombre', 'monto', crm_giwa.num_ar(y ->> 'monto'), 'rec', y ->> 'rec')), '[]'::jsonb)
    from jsonb_each(coalesce(m -> 'ext', '{}')) e(id, x),
         jsonb_array_elements(case when jsonb_typeof(x -> 'items') = 'array' then x -> 'items'
                                   when x ? 'cid' then jsonb_build_array(jsonb_build_object('cid', x -> 'cid', 'cantidad', x -> 'cantidad'))
                                   else '[]'::jsonb end) y
   where (id = '_terceros' or (coalesce(m -> 'r' ->> id, '') = 'Sí' and coalesce(m -> 'etapa' ->> id, '') <> 'futura'))
     and ((coalesce(y ->> 'cid', '') <> '' and crm_giwa.num_ar(y ->> 'cantidad') > 0)
          or (coalesce(y ->> 'nombre', '') <> '' and crm_giwa.num_ar(y ->> 'monto') > 0))
$function$;

create or replace function crm_giwa._cot_costos(pid text, did text, ext jsonb)
 returns integer
 language plpgsql
as $function$
declare x jsonb; c crm_giwa.contrataciones; tc numeric := crm_giwa._cot_tc(); q numeric; a numeric; n int := 0;
begin
  delete from crm_giwa.proyecto_costos where desarrollo_id = did and (coalesce(contratacion_id, '') <> '' or tipo = 'Externo (Cotizador)');
  for x in select * from jsonb_array_elements(coalesce(ext, '[]'::jsonb)) loop
    if coalesce(x ->> 'cid', '') = '' then
      -- externo cargado a mano
      a := round(coalesce(crm_giwa.num_ar(x ->> 'monto'), 0)); continue when a <= 0;
      insert into crm_giwa.proyecto_costos (id, proyecto_id, desarrollo_id, tipo, descripcion, proveedor, recurrencia, externo, unidad, cantidad,
                                            usd, ars, total_usd, total_ars, tipo_cambio, creador, fecha_agregado, incluido, contratacion_id)
      values (crm_giwa.proximo_id('PC', 'proyecto_costos', 4), pid, did, 'Externo (Cotizador)', x ->> 'nombre', x ->> 'nombre',
              case when x ->> 'rec' = 'Único' then 'Único' else 'Mensual' end, x ->> 'paga' <> 'GIWA',
              case when x ->> 'rec' = 'Único' then 'Total' else 'Mensual' end, 1, round(a / tc, 2), a, round(a / tc, 2), a, tc,
              crm_giwa.mi_mail(), crm_giwa.hoy(), true, null);
      n := n + 1; continue;
    end if;
    select * into c from crm_giwa.contrataciones where id = x ->> 'cid'; continue when c.id is null;
    q := coalesce(nullif(crm_giwa.num_ar(x ->> 'cantidad'), 0), 1);
    a := coalesce(nullif(c.costo_ars, 0), round(coalesce(c.costo_usd, 0) * tc));
    insert into crm_giwa.proyecto_costos (id, proyecto_id, desarrollo_id, tipo, descripcion, proveedor, recurrencia, externo, unidad, cantidad,
                                          usd, ars, total_usd, total_ars, tipo_cambio, creador, fecha_agregado, incluido, contratacion_id)
    values (crm_giwa.proximo_id('PC', 'proyecto_costos', 4), pid, did, coalesce(nullif(c.categoria, ''), 'Contratación'), c.producto,
            btrim(split_part(split_part(c.producto, '·', 1), '(', 1)), 'Mensual', x ->> 'paga' <> 'GIWA', coalesce(nullif(c.unidad, ''), 'Mensual'),
            q, coalesce(c.costo_usd, 0), a, round(coalesce(c.costo_usd, 0) * q, 2), round(a * q), tc, crm_giwa.mi_mail(), crm_giwa.hoy(), true, c.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

do $mig$
declare f text; g text;
begin
  f := pg_get_functiondef('crm_giwa.cot_guardar(jsonb)'::regprocedure);
  g := replace(f, '''mant_modalidad'', v -> ''mant'' -> ''modalidad'', ''mant_comparte'', v -> ''mant'' -> ''comparte'')::text
     where id = did;',
                  '''mant_modalidad'', v -> ''mant'' -> ''modalidad'', ''mant_comparte'', v -> ''mant'' -> ''comparte'')::text,
           garantia_dias = case when v ? ''garantia'' then nullif(crm_giwa.num_ar(v ->> ''garantia''), 0)::int else garantia_dias end
     where id = did;');
  if g = f then raise exception 'cot_guardar: la definición vigente no coincide con la esperada'; end if;
  execute g;

  f := pg_get_functiondef('crm_giwa.cot_leer(text)'::regprocedure);
  g := replace(f, '''mant'', coalesce((select jsonb_build_object(''on'', true,', '''garantia'', d.garantia_dias, ''mant'', coalesce((select jsonb_build_object(''on'', true,');
  if g = f then raise exception 'cot_leer: la definición vigente no coincide con la esperada'; end if;
  execute g;
end $mig$;

reset role;

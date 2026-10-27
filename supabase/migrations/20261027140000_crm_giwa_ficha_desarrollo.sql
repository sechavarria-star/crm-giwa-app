-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · ficha del desarrollo · etapa 5h(b) · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- guardar_desarrollo(p)                = saveItem de PM (updateItemField por campo):
--   sólo toca lo que viene en p. p = { id, titulo, descripcion, tipo, moneda,
--   total_ars, total_usd, tc, cuotas, modelo, inflacion, cuota_act, mant_horas,
--   garantia_dias, soporte_ars, soporte_usd }
-- guardar_modulos_desarrollo(did, p)   = guardarModulosDesarrollo de Cotizador.gs:
--   el motor (estimar_desarrollo) con lo tildado, y el desarrollo queda con su
--   Tier, valor hora y horas. p = { tipo, sel, cant, mejora }
--   Diferencia acordada con Vicky (27/10): las filas de proyecto_horas que ya
--   tienen horas reales NO se borran (el Apps Script borraba todas). Se
--   regeneran sólo las que no tienen, y no se duplica un módulo que quedó.
-- Lo finalizado, cerrado, cancelado o rechazado se mira, no se edita (bloquearSiFinalizada).
-- Los costos de terceros (Contrataciones) quedan para después.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa._desarrollo_editable(d crm_giwa.desarrollos) returns void
language plpgsql stable as $$
begin
  if crm_giwa.norm(coalesce(d.estado_id, '')) ~ '(finaliz|cerrad|cancel|rechaz)' then
    raise exception 'Este desarrollo está %. Se mira, no se edita. Si hay trabajo nuevo, va como módulo evolutivo aparte.', d.estado_id;
  end if;
end $$;

create or replace function crm_giwa.guardar_desarrollo(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  d crm_giwa.desarrollos := crm_giwa._desarrollo(p ->> 'id');
  n numeric;
begin
  perform crm_giwa._desarrollo_editable(d);
  if p ? 'titulo' and trim(coalesce(p ->> 'titulo', '')) = '' then raise exception 'Poné un título'; end if;
  update crm_giwa.desarrollos set
    titulo              = case when p ? 'titulo'        then trim(p ->> 'titulo') else titulo end,
    descripcion         = case when p ? 'descripcion'   then trim(coalesce(p ->> 'descripcion', '')) else descripcion end,
    tipo_id             = case when p ? 'tipo' and coalesce(p ->> 'tipo', '') <> '' then p ->> 'tipo' else tipo_id end,
    moneda              = case when p ? 'moneda'        then coalesce(nullif(p ->> 'moneda', ''), 'ARS') else moneda end,
    total_ars           = case when p ? 'total_ars'     then coalesce(nullif(p ->> 'total_ars', '')::numeric, 0) else total_ars end,
    total_usd           = case when p ? 'total_usd'     then coalesce(nullif(p ->> 'total_usd', '')::numeric, 0) else total_usd end,
    tipo_cambio         = case when p ? 'tc' and coalesce(nullif(p ->> 'tc', '')::numeric, 0) > 0 then (p ->> 'tc')::numeric else tipo_cambio end,
    q_cuotas            = case when p ? 'cuotas'        then coalesce(nullif(p ->> 'cuotas', '')::numeric, 0) else q_cuotas end,
    modelo_pago_id      = case when p ? 'modelo' and coalesce(p ->> 'modelo', '') <> '' then p ->> 'modelo' else modelo_pago_id end,
    ajuste              = case when p ? 'inflacion' and coalesce(p ->> 'inflacion', '') <> '' then p ->> 'inflacion' else ajuste end,
    valor_cuota_actual  = case when p ? 'cuota_act'     then coalesce(nullif(p ->> 'cuota_act', '')::numeric, 0) else valor_cuota_actual end,
    mantenimiento_horas = case when p ? 'mant_horas'    then coalesce(nullif(p ->> 'mant_horas', '')::numeric, 0) else mantenimiento_horas end,
    garantia_dias       = case when p ? 'garantia_dias' then coalesce(nullif(p ->> 'garantia_dias', '')::numeric, 0)::int else garantia_dias end,
    soporte_hora_ars    = case when p ? 'soporte_ars'   then coalesce(nullif(p ->> 'soporte_ars', '')::numeric, 0) else soporte_hora_ars end,
    soporte_hora_usd    = case when p ? 'soporte_usd'   then coalesce(nullif(p ->> 'soporte_usd', '')::numeric, 0) else soporte_hora_usd end
  where id = d.id;
  return jsonb_build_object('ok', true, 'id', d.id);
end $$;

create or replace function crm_giwa.guardar_modulos_desarrollo(did text, p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  d    crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  o    jsonb := coalesce(p, '{}');
  emp  text;
  est  jsonb;
  hs   numeric;
  m    jsonb;
  quedan text[];
  n    int := 0;
  borradas int;
begin
  perform crm_giwa._desarrollo_editable(d);
  select empresa_id into emp from crm_giwa.proyectos where id = d.proyecto_id;
  est := crm_giwa.estimar_desarrollo(coalesce(nullif(o ->> 'tipo', ''), d.tipo_id), coalesce(emp, ''),
           jsonb_build_object('sel', coalesce(o -> 'sel', '{}'), 'cant', coalesce(o -> 'cant', '{}'), 'mejora', coalesce(o -> 'mejora', 'false'::jsonb)));
  if not coalesce((est ->> 'ok')::boolean, false) then raise exception '%', est ->> 'msg'; end if;
  hs := (est ->> 'horas')::numeric;

  -- El valor hora que queda es el del precio final (si se ajustó a mano)
  update crm_giwa.desarrollos set
    tier_id        = coalesce(est ->> 'tier', ''),
    valor_hora     = round(case when coalesce(total_ars, 0) > 0 and hs > 0 then total_ars / hs else (est ->> 'valor_hora')::numeric end),
    duracion_horas = hs
  where id = d.id;

  -- Lo que ya tiene horas reales se queda; el resto se regenera
  delete from crm_giwa.proyecto_horas where desarrollo_id = d.id and coalesce(horas_reales, 0) = 0;
  get diagnostics borradas = row_count;
  select coalesce(array_agg(modulo_id), '{}') into quedan from crm_giwa.proyecto_horas where desarrollo_id = d.id and coalesce(modulo_id, '') <> '';

  -- Sin filas de 0 h: las preguntas madre no son trabajo
  for m in select x from jsonb_array_elements(est -> 'detalle') x loop
    continue when coalesce((m ->> 'horas')::numeric, 0) <= 0 or (m ->> 'id') = any(quedan);
    insert into crm_giwa.proyecto_horas (id, proyecto_id, desarrollo_id, modulo_id, etapa, modulo_nombre, horas_est, estado)
    values (crm_giwa.proximo_id('PH', 'proyecto_horas', 4), d.proyecto_id, d.id, m ->> 'id', m ->> 'etapa', m ->> 'nombre',
            (m ->> 'horas')::numeric, 'Pendiente');
    n := n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'horas', hs, 'filas', n, 'conservadas', coalesce(array_length(quedan, 1), 0),
                            'borradas', borradas, 'tier', est ->> 'tier', 'valor_hora', est ->> 'valor_hora');
end $$;

grant execute on function crm_giwa._desarrollo_editable(crm_giwa.desarrollos), crm_giwa.guardar_desarrollo(jsonb),
  crm_giwa.guardar_modulos_desarrollo(text, jsonb) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Carga rápida de proyecto · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- alta_proyecto_rapido(p) = altaCotizacion del Cotizador con d.rapido (la
-- «Carga rápida» de _CotNuevo.html): sólo filas nuevas.
--   · el proyecto, como Prospecto (probabilidad 50, owner = quien carga)
--   · un desarrollo Nuevo con el monto tipeado (en USD se pasa a pesos al TC
--     de hoy). Horas, Tier y valor hora salen del motor, como referencia.
--   · si hay mantenimiento por mes: su desarrollo de Mantenimiento Mensual,
--     12 cuotas, 5 h, IPC trimestral, atado al desarrollo (mant_de).
--   La carga rápida no trae funcionalidades: no crea horas ni costos.
-- p = { empresa_id, nombre, sponsor_id, tipo, titulo, moneda, monto, forma_pago, mant }
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.alta_proyecto_rapido(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  emp text := nullif(trim(p ->> 'empresa_id'), '');
  nom text := trim(coalesce(p ->> 'nombre', ''));
  tipo text := nullif(trim(p ->> 'tipo'), '');
  usd boolean := upper(coalesce(p ->> 'moneda', 'ARS')) = 'USD';
  monto numeric := coalesce(nullif(p ->> 'monto', '')::numeric, 0);
  mant numeric := coalesce(nullif(p ->> 'mant', '')::numeric, 0);
  fp text := nullif(trim(p ->> 'forma_pago'), '');
  tc numeric := coalesce(nullif((select valor from crm_giwa.v_tipo_cambio_hoy), 0),
                         nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'tc_default')), 0), 1);
  yo text := crm_giwa.mi_mail();
  tit text; ars numeric; ab numeric; e jsonb; pid text; did text; mid text;
begin
  if emp is null then raise exception 'Falta la empresa'; end if;
  if nom = '' then raise exception 'Falta el título del proyecto'; end if;
  if tipo is null then raise exception 'Falta el tipo de desarrollo'; end if;
  if monto <= 0 then raise exception 'Falta el monto'; end if;
  if fp is null then raise exception 'Falta el modo de pago'; end if;
  tit := coalesce(nullif(trim(p ->> 'titulo'), ''), (select nombre from crm_giwa.tipos_desarrollo where id = tipo), tipo);
  ars := round(case when usd then monto * tc else monto end);
  ab := round(case when usd then mant * tc else mant end);
  e := crm_giwa.estimar_desarrollo(tipo, emp, '{}');

  pid := crm_giwa.proximo_id('P', 'proyectos', 4);
  insert into crm_giwa.proyectos (id, empresa_id, nombre, sponsor_id, contactos, owner, tipo, estado_id, probabilidad, detenido, minuta)
  values (pid, emp, nom, nullif(p ->> 'sponsor_id', ''), nullif(p ->> 'sponsor_id', ''), yo, 'Cliente', 'Prospecto', 50, false,
          jsonb_build_object('origen', 'Carga rápida')::text);

  did := crm_giwa.proximo_id('D', 'desarrollos', 4);
  insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, estado_id, moneda, total_ars, total_usd, tipo_cambio, q_cuotas,
                                    modelo_pago_id, creador, tier_id, duracion_horas, valor_hora, mant_de, detenido, bonificado, minuta)
  values (did, pid, tipo, tit, 'Nuevo', case when usd then 'USD' else 'ARS' end, ars, round(ars / tc, 2), tc, 1, fp, yo,
          case when (e ->> 'ok')::boolean then e ->> 'tier' end,
          case when (e ->> 'ok')::boolean then (e ->> 'horas')::numeric end,
          case when (e ->> 'ok')::boolean and coalesce((e ->> 'horas')::numeric, 0) > 0 then round(ars / (e ->> 'horas')::numeric) end,
          '{}', false, false,
          jsonb_build_object('precio', ars, 'sugerido', case when (e ->> 'ok')::boolean then (e ->> 'total_ars')::numeric end, 'origen', 'Carga rápida')::text);

  if ab > 0 then
    mid := crm_giwa.proximo_id('D', 'desarrollos', 4);
    insert into crm_giwa.desarrollos (id, proyecto_id, tipo_id, titulo, descripcion, estado_id, moneda, total_ars, total_usd, tipo_cambio,
                                      q_cuotas, cuota, valor_cuota_actual, mantenimiento_horas, ajuste, modelo_pago_id, creador, mant_de, detenido, bonificado)
    values (mid, pid, 'MM', 'Mantenimiento — ' || tit, 'Mantenimiento mensual de ' || tit, 'Nuevo', 'ARS', ab * 12, round(ab * 12 / tc, 2), tc,
            12, ab, ab, 5, 'IPC trimestral', 'FP-03', yo, array[did], false, false);
  end if;
  return jsonb_build_object('ok', true, 'pid', pid, 'did', did, 'mant_id', mid);
end $$;

grant execute on function crm_giwa.alta_proyecto_rapido(jsonb) to authenticated;

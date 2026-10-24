-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Configuración · etapa 6 · 25/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Config_Index.html, las tres vistas que viven en tablas de la base:
--   config_editables()               las claves de CotConfig que se tocan desde acá
--   guardar_config(cambios)          updateConfig, de a varias en un viaje
--   params_cotizacion()              getParamsCotizacion (con sus valores por defecto)
--   guardar_params_cotizacion(p)     guardarParamsCotizacion: sólo escribe lo que viene
--   guardar_contratacion(p)          saveRecurso (Tipos de gastos)
--   borrar_contratacion(id)          deleteRecurso
--
-- Diferencia con la pantalla vieja (a propósito): updateConfig escribía la
-- lista con el nombre que pide el navegador (condicion_fiscal, rubros…) y
-- getConfig leía la de la columna (RazonSocial_CondicionFiscal, Empresa_Rubro…)
-- por alias. Acá se escribe en la clave que realmente se usa (la elige
-- js/vistas/config.js: la primera de su lista que existe).
--
-- Telegram, Plantilla Doc, Mantenimiento de datos y Diagnósticos no pasan:
-- siguen en el CRM actual.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── las claves que se editan desde Configuración ──
-- Listas (valores separados por coma) y números sueltos. Cualquier otra
-- clave de CotConfig no se toca desde la pantalla.
create or replace function crm_giwa.config_editables(out listas text[], out numeros text[])
language sql immutable as $$
  select array[
    'RazonSocial_CondicionFiscal','RZ_CondicionFiscal','condicion_fiscal',
    'Empresa_Rubro','rubros', 'Contacto_AreaTrabajo','areas_contacto',
    'Contacto_Puesto','Contacto_puesto','puestos', 'usuarios_giwa',
    'estados_proyecto', 'estados_desarrollo', 'Tarea_Estado','tareas_estados','estados_tarea',
    'PHoras_EstadoActividad','Estado_actividad', 'Empresa_Provincia','provincias',
    'Empresa_Localidad','localidades', 'Tarea_Frecuencia','tareas_frecuencia','Frecuencia_Tarea',
    'ModeloProyecto', 'Cobro_FormaPago','formas_pago', 'condiciones_pago',
    'Tarea_Tipo','tareas_tipo','tipos_tarea',
    'Tarea_AlertaTipo','Tareas_alertas_tipos','alertas_tipos','tipos_alerta',
    'Modulos_crono', 'Gasto_Categoria','categorias_gasto'],
    array['tc_default','ganancia_default','valor_hora_soporte_ars','valor_hora_soporte_usd']
$$;

-- cambios = { clave: valor, … }. Las listas se guardan limpias (sin vacíos
-- ni repetidos); los números, vacíos o mayores a cero.
create or replace function crm_giwa.guardar_config(cambios jsonb) returns jsonb
language plpgsql volatile as $$
declare e record; k text; v text; ed record := crm_giwa.config_editables(); n int := 0;
begin
  for e in select * from jsonb_each_text(coalesce(cambios, '{}')) loop
    k := trim(e.key); v := trim(coalesce(e.value, ''));
    if k = any (ed.listas) then
      select coalesce(string_agg(x, ',' order by o), '') into v
      from (select distinct on (x) x, o from (select trim(y) x, o from unnest(string_to_array(v, ',')) with ordinality u(y, o)) a
            where x <> '' order by x, o) b;
    elsif k = any (ed.numeros) then
      if v <> '' and not (crm_giwa.num(v) > 0) then raise exception '% tiene que ser un número mayor a cero', k; end if;
    else
      raise exception 'La clave % no se edita desde Configuración', k;
    end if;
    insert into crm_giwa.cot_config (clave, valor) values (k, v)
    on conflict (clave) do update set valor = excluded.valor;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'guardados', n);
end $$;

-- ── «Clave:valor, Clave:valor» → [{k, v}] en orden (getMultiplicadores…) ──
-- Sin nada que parsee, los valores por defecto.
create or replace function crm_giwa.mult_lista(raw text, def jsonb) returns jsonb
language sql immutable as $$
  with p as (
    select trim(split_part(x, ':', 1)) k, crm_giwa.num(split_part(x, ':', 2)) v, o
    from unnest(string_to_array(coalesce(raw, ''), ',')) with ordinality u(x, o)
    where cardinality(string_to_array(x, ':')) = 2
  )
  select coalesce((select jsonb_agg(jsonb_build_object('k', k, 'v', v) order by o) from p where k <> '' and v > 0), def)
$$;

create or replace function crm_giwa.params_cotizacion() returns jsonb
language sql stable as $$
  with c as (select clave, valor from crm_giwa.cot_config
             where clave in ('margen_venta','margen_horas','horas_mes','dif_multiplicadores',
                             'esp_multiplicadores','vh_mercado_ars','seed_fecha','seed_tc')),
       g as (select (select valor from c where clave = k) v, k from unnest(array['margen_venta','margen_horas','horas_mes',
             'dif_multiplicadores','esp_multiplicadores','vh_mercado_ars','seed_fecha','seed_tc']) k)
  select jsonb_build_object(
    'ok', true,
    'margen_venta', coalesce(nullif(crm_giwa.num((select v from g where k = 'margen_venta')), 0), 20),
    'margen_horas', coalesce(nullif(crm_giwa.num((select v from g where k = 'margen_horas')), 0), 30),
    'horas_mes',    coalesce(nullif(crm_giwa.num((select v from g where k = 'horas_mes')), 0), 60),
    -- los de Calculos.gs (getMultiplicadoresDificultad / Especialidad) y Mercado.gs (_MERCADO_CPCIPC)
    'dificultad',   crm_giwa.mult_lista((select v from g where k = 'dif_multiplicadores'),
                      '[{"k":"Baja","v":0.53},{"k":"Media","v":1},{"k":"Alta","v":1.71},{"k":"Muy alta","v":2}]'),
    'especialidad', crm_giwa.mult_lista((select v from g where k = 'esp_multiplicadores'),
                      '[{"k":"General","v":1},{"k":"IA / LLM","v":1},{"k":"Datos / BI","v":1},{"k":"Infra / Cloud","v":1}]'),
    'mercado',      crm_giwa.mult_lista((select v from g where k = 'vh_mercado_ars'),
                      '[{"k":"Baja","v":60525},{"k":"Media","v":66617},{"k":"Alta","v":80762},{"k":"Muy alta","v":96900}]'),
    'tc', crm_giwa.tc_de_fecha(crm_giwa.hoy()),
    'seed_fecha', coalesce((select v from g where k = 'seed_fecha'), ''),
    'seed_tc', crm_giwa.num((select v from g where k = 'seed_tc')))
$$;

-- Sólo escribe lo que viene: un número que no es > 0 no borra nada, y un
-- multiplicador que no parsea frena todo antes de escribir.
create or replace function crm_giwa.guardar_params_cotizacion(p jsonb) returns jsonb
language plpgsql volatile as $$
declare g text[] := '{}'; x record; raw text; ok int;
begin
  p := coalesce(p, '{}');
  for x in select * from (values ('dif_multiplicadores','dificultad_txt'), ('esp_multiplicadores','especialidad_txt'),
                                 ('vh_mercado_ars','mercado_txt')) v(clave, prop) loop
    raw := trim(coalesce(p ->> x.prop, ''));
    if raw = '' then continue; end if;
    select count(*) into ok from unnest(string_to_array(raw, ',')) y
    where cardinality(string_to_array(y, ':')) = 2 and trim(split_part(y, ':', 1)) <> '' and crm_giwa.num(split_part(y, ':', 2)) > 0;
    if ok = 0 then
      raise exception 'Formato inválido en %. Va "Nombre:1.4, Otro:1" — con dos puntos y números mayores a cero.', x.prop;
    end if;
  end loop;
  for x in select * from (values ('margen_venta','margen_venta'), ('margen_horas','margen_horas'), ('horas_mes','horas_mes'),
                                 ('dif_multiplicadores','dificultad_txt'), ('esp_multiplicadores','especialidad_txt'),
                                 ('vh_mercado_ars','mercado_txt')) v(clave, prop) loop
    raw := trim(coalesce(p ->> x.prop, ''));
    if raw = '' or (x.prop not like '%\_txt' and not (crm_giwa.num(raw) > 0)) then continue; end if;
    insert into crm_giwa.cot_config (clave, valor) values (x.clave, raw)
    on conflict (clave) do update set valor = excluded.valor;
    g := g || x.prop;
  end loop;
  if cardinality(g) = 0 then raise exception 'No había nada para guardar.'; end if;
  return crm_giwa.params_cotizacion() || jsonb_build_object('msg', 'Guardado: ' || array_to_string(g, ', ') || '.');
end $$;

-- ── Tipos de gastos (hoja Contrataciones) ──
-- Sin id: una nueva, CONT-nnn. La moneda se deduce como getRecursos: USD si
-- tiene valor en dólares, si no ARS.
create or replace function crm_giwa.guardar_contratacion(p jsonb) returns jsonb
language plpgsql volatile as $$
declare cid text := nullif(trim(p ->> 'id'), ''); nom text := trim(coalesce(p ->> 'producto', ''));
        usd numeric := greatest(crm_giwa.num(p ->> 'costo_usd'), 0); ars numeric := greatest(crm_giwa.num(p ->> 'costo_ars'), 0);
begin
  if nom = '' then raise exception 'Nombre obligatorio'; end if;
  if cid is null then
    select 'CONT-' || lpad((coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
      into cid from crm_giwa.contrataciones;
    insert into crm_giwa.contrataciones (id, categoria, producto, nivel, unidad, moneda, costo_usd, costo_ars)
    values (cid, nullif(trim(p ->> 'categoria'), ''), nom, nullif(trim(p ->> 'nivel'), ''),
            coalesce(nullif(trim(p ->> 'unidad'), ''), 'Hora'), case when usd > 0 then 'USD' else 'ARS' end, usd, ars);
  else
    update crm_giwa.contrataciones set categoria = nullif(trim(p ->> 'categoria'), ''), producto = nom,
      nivel = nullif(trim(p ->> 'nivel'), ''), unidad = coalesce(nullif(trim(p ->> 'unidad'), ''), 'Hora'),
      costo_usd = usd, costo_ars = ars
    where id = cid;
    if not found then raise exception 'Contratación no encontrada'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', cid);
end $$;

-- Una contratación que ya usa un costo, un gasto o una alternativa no se
-- borra (en la planilla se borraba la fila y el costo quedaba huérfano).
create or replace function crm_giwa.borrar_contratacion(cid text) returns jsonb
language plpgsql volatile as $$
declare n int;
begin
  select (select count(*) from crm_giwa.proyecto_costos where contratacion_id = trim(cid))
       + (select count(*) from crm_giwa.gastos_internos where contratacion_id = trim(cid))
       + (select count(*) from crm_giwa.alternativas where contratacion_id = trim(cid)) into n;
  if n > 0 then raise exception 'La usan % costo(s), gasto(s) o alternativa(s): no se puede borrar.', n; end if;
  delete from crm_giwa.contrataciones where id = trim(cid);
  if not found then raise exception 'Contratación no encontrada'; end if;
  return jsonb_build_object('ok', true, 'id', cid);
end $$;

grant execute on function crm_giwa.config_editables(), crm_giwa.guardar_config(jsonb), crm_giwa.mult_lista(text, jsonb),
  crm_giwa.params_cotizacion(), crm_giwa.guardar_params_cotizacion(jsonb),
  crm_giwa.guardar_contratacion(jsonb), crm_giwa.borrar_contratacion(text) to authenticated, service_role;

reset role;

-- Cotizador · entrega 3 (03/11/2026): lo que necesita la pantalla Nuevo proyecto
-- · cot_referencia: «Parecido a lo que ya cotizaste» (_ceReferencia): el desarrollo vendido del mismo tipo con más módulos en común
-- · cot_guardar_y_crear: el alta directa como Prospecto en una sola transacción (= altaCotizacion con estado Prospecto)
-- · cot_inicio suma las horas del abono (mant_hs_base / canal / integración) para calcular la sugerencia en pantalla
set role crm_giwa_dev;

create or replace function crm_giwa.cot_referencia(tipo text, ids text[], pid text default '') returns jsonb language sql stable as $$
  with cand as (
    select d.id, d.titulo, d.total_ars, p.nombre pnom, p.estado_id pest, p.fecha_propuesta, e.nombre cliente,
           (select count(*) from crm_giwa.proyecto_horas h where h.desarrollo_id = d.id and h.modulo_id = any(ids)) n,
           (select round(sum(h.horas_est), 2) from crm_giwa.proyecto_horas h where h.desarrollo_id = d.id) horas,
           (select coalesce(nullif(x.valor_cuota_actual, 0), x.cuota) from crm_giwa.desarrollos x where d.id = any(x.mant_de) and crm_giwa._cot_es_mant(x) limit 1) mmr,
           (select coalesce(jsonb_agg(h.modulo_nombre), '[]') from (select h.modulo_nombre from crm_giwa.proyecto_horas h join crm_giwa.catalogo_modulos c on c.id = h.modulo_id
                     where h.desarrollo_id = d.id and not coalesce(c.sugerido, false) limit 6) h) incluye
      from crm_giwa.desarrollos d join crm_giwa.proyectos p on p.id = d.proyecto_id left join crm_giwa.empresas e on e.id = p.empresa_id
     where d.tipo_id = cot_referencia.tipo and d.proyecto_id <> coalesce(cot_referencia.pid, '') and not crm_giwa._cot_es_mant(d) and coalesce(d.total_ars, 0) > 0
       and (crm_giwa.estado_canonico(d.estado_id) in ('aprobada', 'curso', 'garantia', 'finalizada') or p.estado_id in ('Aprobado', 'Activo', 'Finalizado')))
  select case when c.id is null then null else jsonb_build_object('id', c.id, 'cliente', c.cliente, 'que', coalesce(c.titulo, c.pnom), 'fecha', c.fecha_propuesta,
           'estado', c.pest, 'incluye', c.incluye, 'horas', coalesce(c.horas, 0), 'cobrado', c.total_ars, 'mmr', coalesce(c.mmr, 0)) end
    from (select * from cand where n > 0 order by n desc, id limit 1) c
$$;

create or replace function crm_giwa.cot_guardar_y_crear(d jsonb) returns jsonb language plpgsql as $$
declare r jsonb; c jsonb;
begin
  r := crm_giwa.cot_guardar(d);
  c := crm_giwa.cot_crear(r ->> 'pid');
  return r || jsonb_build_object('estado', c ->> 'estado', 'costos', c -> 'costos', 'tareas', c -> 'tareas');
end $$;

create or replace function crm_giwa.cot_inicio() returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true,
    'empresas', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'tier', e.tier_id,
                   'mult', coalesce((select nullif(t.multiplicador, 0) from crm_giwa.tier t where crm_giwa.norm(t.id) = crm_giwa.norm(e.tier_id)), 1)) order by e.nombre), '[]')
                   from crm_giwa.empresas e where e.nombre !~* '^giwa\M'),
    'contactos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', btrim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')),
                   'empresa', c.empresa_id, 'tel', c.telefono) order by c.nombre), '[]') from crm_giwa.contactos c),
    'contrataciones', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'categoria', k.categoria, 'producto', k.producto, 'unidad', k.unidad,
                   'usd', k.costo_usd, 'ars', k.costo_ars) order by k.orden), '[]') from crm_giwa.contrataciones k where coalesce(k.producto, '') <> ''),
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.orden), '[]') from crm_giwa.modelos_pago m
                 where coalesce(m.tipo, '') <> 'recurrente' and m.id <> 'FP-03'),
    'tipos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre) order by t.orden), '[]') from crm_giwa.tipos_desarrollo t
               where t.nombre !~* 'mantenimiento' and exists (select 1 from crm_giwa.catalogo_modulos c where c.tipo_desarrollo_id = t.id and c.activo)),
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('mail', u.mail, 'nombre', u.nombre) order by u.nombre), '[]') from crm_giwa.usuarios u where coalesce(u.activo, true)),
    'valores', jsonb_build_object('giwa', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_giwa_ars')),
                 'costo', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_costo_ars')),
                 'mercado', crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'vh_mercado_ars')),
                 'soporte', crm_giwa._cot_vh_soporte(), 'tc', crm_giwa._cot_tc(),
                 'mant_base', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_base')), 0), 5),
                 'mant_canal', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_canal')), 0), 0.5),
                 'mant_integ', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'mant_hs_integracion')), 0), 1),
                 'meta_msj', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = 'meta_msj_mes_default')), 0), 500)),
    'reglas', crm_giwa._cot_reglas(), 'lista', crm_giwa.cot_listar())
$$;
grant execute on function crm_giwa.cot_referencia(text, text[], text), crm_giwa.cot_guardar_y_crear(jsonb), crm_giwa.cot_inicio() to authenticated;
reset role;

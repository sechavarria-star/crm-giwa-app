-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · PM: proyectos y seguimiento · etapa 5a · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_pm_proyectos = getProyectos (Proyectos.gs · _getProyectosCalc): cada
--   proyecto con todo lo que pintan PM y la ficha, y sus desarrollos (items)
--   en un jsonb con los campos de _mapItem. La plata sale de
--   v_proyectos_plata / v_desarrollos_plata (validadas: no se recalcula).
--   Los Borradores del Cotizador no existen para nadie más.
-- v_pm_seguimiento = getSeguimientoExtra: por proyecto, sus tareas (no las
--   administrativas), sus últimos 5 comentarios y sus módulos de horas.
--
-- Campos que el Apps Script lee de una columna que ya no existe y quedan
-- vacíos acá (el validador no los compara): duracion, alcances y link_doc
-- del proyecto caían por posición en Probabilidad, FechaPropuestaEnviada y
-- FechaFinalizado.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── color del estado del proyecto (_estadoColorProy / _canonProy) ──
create or replace function crm_giwa.color_estado_proyecto(e text) returns text
language sql immutable as $$
  select case
    when x ~ 'detenid' then '#ff4d6d'
    when x = '' then '#8892b0'
    when x ~ '(rechaz|perdid|cancel)' then '#ff4d6d'
    when x ~ 'finaliz' then '#00c97a'
    when x ~ '(activo|ejecu|curso)' then '#14b8a6'
    when x ~ '(aprob|vendid|ganad)' then '#0090FF'
    when x ~ '(negoc|revis)' then '#e8c547'
    else '#8892b0' end
  from (select crm_giwa.norm(e) x) s
$$;

create or replace view crm_giwa.v_pm_items with (security_invoker = true) as
select d.proyecto_id, d.orden, jsonb_build_object(
    'id', d.id, 'proy_id', coalesce(d.proyecto_id, ''), 'tipo', coalesce(d.tipo_id, ''),
    'titulo', coalesce(nullif(d.titulo, ''), d.descripcion, ''), 'descripcion', coalesce(d.descripcion, ''),
    'dificultad', coalesce(d.dificultad_id, ''), 'bloque', '', 'horas', coalesce(d.duracion_horas, 0),
    'socios', coalesce(d.desarrollador, ''), 'link', '',
    'duracion', coalesce(d.q_cuotas, 0), 'fecha_est', d.fecha_inicio, 'fecha_cierre', '',
    'modelo', coalesce(d.modelo_pago_id, ''), 'costo_usd', 0, 'costo_ars', 0, 'margen', coalesce(d.margen, 0),
    'total_usd', coalesce(d.total_usd, 0), 'total_ars', coalesce(d.total_ars, 0), 'tc', coalesce(d.tipo_cambio, 0)
  ) || jsonb_build_object(                 -- en dos: jsonb_build_object acepta hasta 100 argumentos
    'vh', coalesce(d.valor_hora, 0), 'tier', coalesce(d.tier_id, ''), 'forma_pago', '',
    'cuotas', coalesce(d.q_cuotas, 0), 'valor_cuota', coalesce(d.valor_cuota_actual, 0), 'cuota_act', coalesce(d.valor_cuota_actual, 0),
    'ajuste', crm_giwa.num(d.ajuste), 'inflacion', coalesce(d.ajuste, ''),
    'garantia_dias', coalesce(d.garantia_dias, 0),
    'soporte_usd', coalesce(d.soporte_hora_usd, 0), 'soporte_ars', coalesce(d.soporte_hora_ars, 0), 'soporte_hs_min', 0,
    'estado', coalesce(d.estado_id, ''), 'fecha_aprob', d.fecha_aprobado, 'fecha_fin', d.fecha_fin,
    'disenio', '', 'alcance', '', 'exclusiones', '', 'entregables', '',
    'mant_de', coalesce(array_to_string(d.mant_de, ', '), ''),
    'mant_de_ids', to_jsonb(coalesce(array(select trim(x) from unnest(d.mant_de) x where trim(x) <> ''), '{}')),
    'valor_hora', coalesce(d.valor_hora, 0),
    'hs', jsonb_build_object('dis', 0, 'cfg', 0, 'prb', 0, 'prd', 0),
    'moneda', case when upper(coalesce(d.moneda, '')) like '%USD%' then 'USD' else 'ARS' end,
    'es_facturable', coalesce(vp.es_facturable, false), 'es_mantenimiento', coalesce(vp.es_mantenimiento, false),
    'detenido', coalesce(d.detenido, false), 'bonificado', coalesce(d.bonificado, false),
    'facturado', coalesce(vp.facturado, 0), 'cuotas_facturadas', coalesce(vp.cuotas_facturadas, 0),
    'modelo_nombre', coalesce((select mp.nombre from crm_giwa.modelos_pago mp where crm_giwa.norm(mp.id) = crm_giwa.norm(d.modelo_pago_id)
                                 or crm_giwa.norm(mp.nombre) = crm_giwa.norm(d.modelo_pago_id) order by crm_giwa.norm(mp.id) = crm_giwa.norm(d.modelo_pago_id) desc limit 1), ''),
    'tipo_nombre', coalesce((select td.nombre from crm_giwa.tipos_desarrollo td where crm_giwa.norm(td.id) = crm_giwa.norm(d.tipo_id) limit 1), ''),
    'saldo', coalesce(vp.saldo, 0), 'bonificacion', coalesce(vp.bonificacion, 0)
  ) as item
from crm_giwa.desarrollos d
left join crm_giwa.v_desarrollos_plata vp on vp.id = d.id;

create or replace view crm_giwa.v_pm_proyectos with (security_invoker = true) as
select p.id, p.detenido,
       case when coalesce(p.empresa_id, '') = '' then '' else coalesce(e.nombre, p.empresa_id) end as empresa,
       coalesce(p.empresa_id, '') as empresa_id, coalesce(p.nombre, '') as nombre,
       coalesce(p.resumen_ejecutivo, '') as descripcion,
       coalesce(nullif(trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')), ''), p.sponsor_id, '') as sponsor,
       coalesce(p.sponsor_id, '') as sponsor_id, coalesce(p.contactos, '') as contactos,
       crm_giwa.norm_mail(p.owner) as owner, p.fecha_propuesta, coalesce(p.probabilidad, 0) as probabilidad,
       p.fecha_propuesta_enviada as fecha_envio, 0 as duracion, '' as alcances,
       pp.es_ganado as aprobada, pp.estado_proyecto, pp.estado_proyecto as estado_prop,
       coalesce(p.tipo, '') as tipo, pp.es_ganado, pp.es_facturable,
       crm_giwa.color_estado_proyecto(pp.estado_proyecto) as estado_color,
       coalesce(nullif(pp.estado_proyecto, ''), 'Prospecto') as estado_label,
       p.fecha_inicio, null::date as fecha_final, '' as link_doc, coalesce(p.carpeta, '') as carpeta, 0 as avance,
       pp.monto_final_ars, 0 as monto_final_usd, pp.monto_cotizado, pp.recurrente_mensual, pp.mant_vivos,
       pp.saldo, pp.saldo_mant, pp.detenido_monto, pp.bonificacion, pp.bonificacion_mant,
       pp.cuotas_totales, pp.cuotas_restantes, pp.monto_facturado, pp.cobrado_dev, pp.cobrado_mant, pp.cobrado_sin,
       coalesce((select jsonb_agg(i.item order by i.orden) from crm_giwa.v_pm_items i where i.proyecto_id = p.id), '[]'::jsonb) as items,
       p.orden
from crm_giwa.proyectos p
join crm_giwa.v_proyectos_plata pp on pp.id = p.id
left join crm_giwa.empresas e on e.id = p.empresa_id
left join crm_giwa.contactos c on c.id = p.sponsor_id
where crm_giwa.norm(p.estado_id) !~ 'borrador';

-- ── getSeguimientoExtra ──
create or replace view crm_giwa.v_pm_seguimiento with (security_invoker = true) as
with pids as (select id from crm_giwa.proyectos),
tar as (
  select pid, jsonb_agg(jsonb_build_object('id', t.id, 'titulo', coalesce(t.titulo, ''), 'estado', coalesce(t.estado, ''),
           'item_id', coalesce(t.desarrollo_id, ''), 'responsable', crm_giwa.norm_mails(t.responsable),
           'fecha_vencimiento', t.vencimiento, 'fecha_creacion', t.fecha_creacion) order by t.orden) as tareas
  from crm_giwa.tareas t, unnest(crm_giwa.lista_csv(t.proyecto_id)) pid
  where coalesce(trim(t.id), '') <> '' and coalesce(t.tipo, '') !~* 'administr'
  group by pid
),
com as (
  select pid, jsonb_agg(jsonb_build_object('id', c.id, 'usuario', crm_giwa.norm_mail(c.creador), 'fecha', c.fecha, 'texto', c.texto,
           'tarea_id', coalesce(c.tarea_id, ''), 'tarea_titulo', coalesce(t.titulo, ''), 'item_id', coalesce(c.desarrollo_id, ''))
           order by c.fecha desc, c.orden) filter (where c.n <= 5) as comentarios
  from (select c.*, pid, row_number() over (partition by pid order by c.fecha desc, c.orden) as n
        from crm_giwa.comentarios c, unnest(crm_giwa.lista_csv(c.proyecto_id)) pid) c
  left join crm_giwa.tareas t on t.id = c.tarea_id
  group by pid
),
mods as (
  select h.proyecto_id as pid, jsonb_agg(jsonb_build_object('id', h.id, 'item_id', coalesce(h.desarrollo_id, ''),
           'nombre', coalesce(nullif(h.modulo_nombre, ''), nullif(h.etapa, ''), h.id), 'etapa', coalesce(h.etapa, ''),
           'est', coalesce(h.horas_est, 0), 'estado', coalesce(h.estado, '')) order by h.orden) as modulos
  from crm_giwa.proyecto_horas h where coalesce(h.proyecto_id, '') <> '' and coalesce(h.id, '') <> ''
  group by h.proyecto_id
)
select p.id as proyecto_id,
       coalesce(tar.tareas, '[]') as tareas, coalesce(com.comentarios, '[]') as comentarios, coalesce(mods.modulos, '[]') as modulos
from pids p
left join tar on tar.pid = p.id left join com on com.pid = p.id left join mods on mods.pid = p.id;

grant select on crm_giwa.v_pm_items, crm_giwa.v_pm_proyectos, crm_giwa.v_pm_seguimiento to authenticated, service_role;
grant execute on function crm_giwa.color_estado_proyecto(text) to authenticated, service_role;

reset role;

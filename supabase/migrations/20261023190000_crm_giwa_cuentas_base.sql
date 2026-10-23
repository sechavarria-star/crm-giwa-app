-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · las cuentas, capa 1: reglas y plata por cobro, desarrollo y
-- proyecto · Fase 3, etapa 1 · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Traducción a SQL de la cadena que hoy hace el Apps Script:
--   Estados.gs   _esGanado, _esFacturable, _esEjecutando, _esRechazado,
--                _esMant, estadoProyectoDe
--   Calculos.gs  _signoCob, _montoCob, _usdCob, _cobradoCob, _esNC,
--                _cobrosAnulados, _plataPorItem, _saldoItem
--   Proyectos.gs _getProyectosCalc (el «modelo de proyecto»)
-- Las métricas de Calculos.gs (contratado, pipeline…) suman estos campos:
-- van en la capa 2, cuando esta dé igual que el Apps Script.
--
-- DOS DIFERENCIAS CON EL APPS SCRIPT, a propósito:
--   · «Rechazado» es el estado Rechazado. El Apps Script leía la columna
--     DesarrolloEstado_Rechazar («se PUEDE rechazar») como «está rechazado»
--     y dejaba Nuevo y Aprobado fuera de lo cotizado y del contratado
--     (pipeline en $ 0). Decisión del 23/10/2026: se corrige en los dos lados
--     (Estados.gs _esRechazado, misma fecha).
--   · Las reglas leen las tablas directo: estado_id ya es el nombre oficial
--     (la base no acepta otro), así que no hace falta interpretar texto.
--
-- Igual que el Apps Script: un mantenimiento dura SIEMPRE 12 cuotas (el
-- código no lee Desarrollo_MesesContrato). Está marcado para revisar.
--
-- Las vistas son security_invoker: quien las consulta ve sólo lo que RLS le
-- deja (la app con login del equipo; el Apps Script con la service key).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── texto normalizado: minúsculas y sin tildes (_norm0 del Apps Script) ──
create or replace function crm_giwa.norm(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
$$;

-- ── ¿es nota de crédito? (_esNC) ─────────────────────────────────────
create or replace function crm_giwa.es_nc(tipo text) returns boolean
language sql immutable as $$
  select crm_giwa.norm(tipo) ~ '(nota\s*de\s*credito|nota\s*credito|^nc\M|\mnc$|credito)'
$$;

-- ── signo de un comprobante (_signoCob): +1 suma · -1 resta · 0 no mueve ──
-- Las listas salen de CotConfig (comprobantes_neutros / comprobantes_restan),
-- con los mismos valores por defecto que el Apps Script.
create or replace function crm_giwa.signo_comprobante(tipo text) returns int
language sql stable as $$
  with t as (select crm_giwa.norm(tipo) n),
  l as (
    select
      coalesce((select string_to_array(crm_giwa.norm(valor), ',') from crm_giwa.cot_config
                where clave = 'comprobantes_neutros' and nullif(trim(valor), '') is not null),
               array['remito','recibo']) as neutro,
      coalesce((select string_to_array(crm_giwa.norm(valor), ',') from crm_giwa.cot_config
                where clave = 'comprobantes_restan' and nullif(trim(valor), '') is not null),
               array['nota de credito','nota credito']) as resta)
  select case
    when (select n from t) = '' then 1                                   -- sin tipo: factura
    when exists (select 1 from l, unnest(l.neutro) p
                 where trim(p) <> '' and position(trim(p) in (select n from t)) > 0) then 0
    when exists (select 1 from l, unnest(l.resta) p
                 where trim(p) <> '' and position(trim(p) in (select n from t)) > 0)
         or crm_giwa.es_nc(tipo) then -1
    else 1 end
$$;

-- ── ¿es un abono? (_esMant): lo dice el modelo de pago; sin modelo, el tipo ──
create or replace function crm_giwa.es_mantenimiento(modelo_pago text, tipo text) returns boolean
language sql stable as $$
  select coalesce(
    (select mp.tipo = 'recurrente' from crm_giwa.modelos_pago mp
      where mp.id = modelo_pago and nullif(mp.tipo, '') is not null),
    lower(coalesce(tipo, '')) = 'mm')
$$;

-- ══════════════════════════════════════════════════════════════════════
-- COBROS · la plata de cada comprobante con su signo
-- ══════════════════════════════════════════════════════════════════════
create or replace view crm_giwa.v_cobros_plata with (security_invoker = true) as
select c.id, c.proyecto_id, c.desarrollo_id, c.tipo_comprobante, c.comprobante_fecha,
       c.deposito_fecha, c.transf_fecha, c.ref_id,
       s.signo,
       case s.signo when 0 then 0 when -1 then -abs(coalesce(c.monto_ars, 0)) else coalesce(c.monto_ars, 0) end as monto,
       case s.signo when 0 then 0 when -1 then -abs(coalesce(c.total_usd, 0)) else coalesce(c.total_usd, 0) end as monto_usd,
       case when coalesce(c.cobrado_ars, 0) = 0
              then case s.signo when 0 then 0 when -1 then -abs(coalesce(c.monto_ars, 0)) else coalesce(c.monto_ars, 0) end
            else case s.signo when 0 then 0 when -1 then -abs(c.cobrado_ars) else c.cobrado_ars end
       end as cobrado,
       crm_giwa.es_nc(c.tipo_comprobante) as es_nc,
       -- anulado: una NC del MISMO proyecto lo cita en Cobro_Ref (_cobrosAnulados)
       exists (select 1 from crm_giwa.cobros n
                where n.ref_id = c.id and n.proyecto_id is not distinct from c.proyecto_id
                  and crm_giwa.es_nc(n.tipo_comprobante)) as anulado
from crm_giwa.cobros c
cross join lateral (select crm_giwa.signo_comprobante(c.tipo_comprobante) as signo) s;

-- ══════════════════════════════════════════════════════════════════════
-- DESARROLLOS · reglas, facturado, cuotas y saldo (_plataPorItem, _saldoItem)
-- ══════════════════════════════════════════════════════════════════════
create or replace view crm_giwa.v_desarrollos_plata with (security_invoker = true) as
with f as (
  -- sólo los cobros del mismo proyecto cuentan para un desarrollo (como el Apps Script)
  select d.id,
         coalesce(sum(c.monto), 0) as facturado,
         count(*) filter (where not c.es_nc and c.monto > 0 and not c.anulado) as cuotas_facturadas
  from crm_giwa.desarrollos d
  join crm_giwa.v_cobros_plata c on c.desarrollo_id = d.id and c.proyecto_id = d.proyecto_id
  group by d.id
),
b as (
  select d.id, d.proyecto_id, d.estado_id, d.titulo, d.tipo_id, d.modelo_pago_id, d.mant_de,
         d.detenido, d.bonificado,
         de.ganado as es_ganado, de.facturable as es_facturable, de.ejecutandose as es_ejecutando,
         (d.estado_id = 'Rechazado') as es_rechazado,
         crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id) as es_mantenimiento,
         coalesce(d.total_ars, 0) as total_ars,
         coalesce(d.total_usd, 0) as total_usd,
         coalesce(d.valor_cuota_actual, 0) as cuota,
         coalesce(nullif(d.q_cuotas, 0), 1) as cuotas,
         12 as duracion_cuotas,                         -- ver la nota de arriba
         coalesce(f.facturado, 0) as facturado,
         coalesce(f.cuotas_facturadas, 0) as cuotas_facturadas
  from crm_giwa.desarrollos d
  join crm_giwa.desarrollo_estados de on de.id = d.estado_id
  left join f on f.id = d.id
)
select b.*,
       case when b.es_mantenimiento then greatest(0, b.duracion_cuotas - b.cuotas_facturadas) * b.cuota
            else greatest(0, b.total_ars - b.facturado) end as saldo_bruto,
       case when b.bonificado then 0
            else case when b.es_mantenimiento then greatest(0, b.duracion_cuotas - b.cuotas_facturadas) * b.cuota
                      else greatest(0, b.total_ars - b.facturado) end end as saldo,
       case when b.bonificado
            then case when b.es_mantenimiento then greatest(0, b.duracion_cuotas - b.cuotas_facturadas) * b.cuota
                      else greatest(0, b.total_ars - b.facturado) end
            else 0 end as bonificacion
from b;

-- ══════════════════════════════════════════════════════════════════════
-- PROYECTOS · estado deducido y plata (el modelo de _getProyectosCalc)
-- ══════════════════════════════════════════════════════════════════════
-- estadoProyectoDe: cascada en el orden de Proyecto_Estados.Prioridad.
-- Borrador y los «Detenido» viejos guardados en la celda no se deducen.
create or replace function crm_giwa.estado_proyecto_deducido(p_guardado text, p_proyecto text, p_enviada boolean)
returns text language sql stable as $$
  with it as (
    select d.estado_id = 'Rechazado' as rech, d.estado_id = 'Finalizado' as fin,
           de.ganado, de.ejecutandose as ejec
    from crm_giwa.desarrollos d join crm_giwa.desarrollo_estados de on de.id = d.estado_id
    where d.proyecto_id = p_proyecto),
  a as (
    select count(*) as n, bool_and(rech) as todos_rech, bool_or(ejec) as alguno_ejec,
           bool_and(fin or rech) as todos_fin_o_rech, bool_or(ganado) as alguno_ganado
    from it)
  select case
    when crm_giwa.norm(p_guardado) like '%detenid%' or crm_giwa.norm(p_guardado) like '%borrador%' then p_guardado
    when (select n from a) = 0 then p_guardado
    else coalesce((
      select pe.id from crm_giwa.proyecto_estados pe, a
      where case pe.id
              when 'Rechazado'   then a.todos_rech
              when 'Activo'      then a.alguno_ejec
              when 'Finalizado'  then a.todos_fin_o_rech
              when 'Aprobado'    then a.alguno_ganado and not a.alguno_ejec
              when 'Negociación' then p_enviada and not a.alguno_ganado
              when 'Prospecto'   then not p_enviada and not a.alguno_ganado
              else false end
      order by pe.prioridad limit 1), p_guardado)
  end
$$;

create or replace view crm_giwa.v_proyectos_plata with (security_invoker = true) as
with d as (select * from crm_giwa.v_desarrollos_plata),
fin as (select id from crm_giwa.desarrollos where estado_id = 'Finalizado'),
act as (                                               -- itemsAct: lo que no está rechazado
  select d.*,
         (not d.es_mantenimiento and d.es_ganado) as dev_act,
         (d.es_mantenimiento and d.es_facturable) as mant_act,
         -- mantenimiento vivo: corriendo (o Aprobado con lo que cubre terminado) y con cuotas por facturar
         (d.es_mantenimiento and d.es_facturable
          and (d.es_ejecutando
               or (d.estado_id = 'Aprobado' and cardinality(d.mant_de) > 0
                   and not exists (select 1 from unnest(d.mant_de) x where x not in (select id from fin))))
          and d.cuotas_facturadas < d.duracion_cuotas) as mant_vivo
  from d where not d.es_rechazado
),
c as (
  select proyecto_id, sum(monto) as facturado, count(*) filter (where monto > 0) as cobradas
  from crm_giwa.v_cobros_plata group by proyecto_id
),
e as (
  select p.*, crm_giwa.estado_proyecto_deducido(p.estado_id, p.id, p.fecha_propuesta is not null) as estado_deducido
  from crm_giwa.proyectos p
  where crm_giwa.norm(p.estado_id) not like '%borrador%'
)
select e.id, e.empresa_id, e.nombre, e.owner, e.probabilidad, e.fecha_propuesta, e.detenido,
       e.estado_id as estado_guardado, e.estado_deducido as estado_proyecto,
       coalesce(pe.ganado, false) as es_ganado, coalesce(pe.facturable, false) as es_facturable,
       coalesce(sum(a.total_ars) filter (where a.dev_act), 0)                         as monto_final_ars,
       coalesce(sum(a.total_ars) filter (where not a.es_mantenimiento), 0)            as monto_cotizado,
       coalesce(sum(a.cuota) filter (where a.mant_vivo and not a.detenido), 0)        as recurrente_mensual,
       count(*) filter (where a.mant_vivo)                                             as mant_vivos,
       coalesce(sum(a.saldo) filter (where a.dev_act and not a.detenido), 0)          as saldo,
       coalesce(sum(a.saldo) filter (where a.mant_act and not a.detenido), 0)         as saldo_mant,
       coalesce(sum(a.saldo) filter (where (a.dev_act or a.mant_act) and a.detenido), 0) as detenido_monto,
       coalesce(sum(a.bonificacion) filter (where a.dev_act), 0)                      as bonificacion,
       coalesce(sum(a.bonificacion) filter (where a.mant_act), 0)                     as bonificacion_mant,
       coalesce(sum(a.facturado) filter (where a.dev_act), 0)                         as cobrado_dev,
       coalesce(sum(a.facturado) filter (where a.mant_act), 0)                        as cobrado_mant,
       coalesce(max(c.facturado), 0)                                                   as monto_facturado,
       greatest(0, coalesce(max(c.facturado), 0)
                   - coalesce(sum(a.facturado) filter (where a.dev_act), 0)
                   - coalesce(sum(a.facturado) filter (where a.mant_act), 0))          as cobrado_sin,
       coalesce(sum(a.cuotas), 0)                                                      as cuotas_totales,
       greatest(0, coalesce(sum(a.cuotas), 0) - coalesce(max(c.cobradas), 0))          as cuotas_restantes
from e
left join crm_giwa.proyecto_estados pe on pe.id = e.estado_deducido
left join act a on a.proyecto_id = e.id
left join c on c.proyecto_id = e.id
group by e.id, e.empresa_id, e.nombre, e.owner, e.probabilidad, e.fecha_propuesta, e.detenido,
         e.estado_id, e.estado_deducido, pe.ganado, pe.facturable;

reset role;

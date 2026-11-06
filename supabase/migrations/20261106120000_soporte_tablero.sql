-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 3b: tablero por período y «Marcar facturado» · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Tablero.gs (_tableroApi_ / _marcarFacturado_), con las mismas reglas:
--   v_soporte_cuentas_mes   por empresa, cuenta (el mantenimiento o el desarrollo) y mes:
--                           horas del mantenimiento, facturables, sin cargo (garantía + sin
--                           clasificar), cupo, disponibles, excedente y monto a facturar
--                           (horas facturables × tarifa de cada ticket); y si ya se marcó facturado
--   soporte_marcar_facturado(p)  marca (o desmarca) las horas de una cuenta en un período,
--                           atadas a la línea de horas de soporte (SOP) del CRM
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_soporte_cuentas_mes with (security_invoker = true) as
with r as (
  select r.empresa_id, r.cuenta_id, r.mes, sum(r.mant) as mant, sum(r.fact) as fact, sum(r.gar + r.sin) as gar,
         sum(r.fact * coalesce(v.tarifa, 0)) as monto
    from crm_giwa.v_soporte_reparto r
    join crm_giwa.v_soporte_tickets v on v.id = r.ticket_id
   group by r.empresa_id, r.cuenta_id, r.mes
)
select r.empresa_id, e.nombre as empresa_nombre, r.cuenta_id, coalesce(d.titulo, '(sin desarrollo asignado)') as desarrollo,
       coalesce(d.es_mantenimiento, false) as es_mantenimiento, r.mes,
       case when d.es_mantenimiento then d.cupo_horas else 0 end as cupo,
       round(r.mant, 2) as mant, round(r.fact, 2) as fact, round(r.gar, 2) as gar,
       case when d.es_mantenimiento then round(greatest(0, d.cupo_horas - r.mant), 2) else 0 end as disponibles,
       case when d.es_mantenimiento then round(r.fact, 2) else 0 end as excedente,   -- en un mantenimiento, lo facturable es lo que excedió
       round(r.monto) as a_facturar,
       f.id as facturado_id, f.sop_id as facturado_sop, f.fecha as facturado_fecha, f.horas as facturado_horas, f.usuario as facturado_por
  from r
  left join crm_giwa.empresas e on e.id = r.empresa_id
  left join crm_giwa.v_soporte_desarrollos d on d.id = r.cuenta_id
  left join crm_giwa.soporte_facturado f on f.empresa_id = r.empresa_id and f.desarrollo_id is not distinct from r.cuenta_id and f.periodo = r.mes;

create or replace function crm_giwa.soporte_marcar_facturado(p jsonb) returns jsonb
language plpgsql volatile as $$
declare emp text := p ->> 'empresa_id'; did text := nullif(p ->> 'desarrollo_id', ''); per text := p ->> 'periodo'; sop text := nullif(p ->> 'sop_id', ''); ya text;
begin
  perform crm_giwa._soporte_equipo();
  if per is null or per !~ '^\d{4}-\d{2}$' then raise exception 'Falta el período.'; end if;
  select id into ya from crm_giwa.soporte_facturado where empresa_id = emp and desarrollo_id is not distinct from did and periodo = per;
  if coalesce((p ->> 'desmarcar')::boolean, false) then
    delete from crm_giwa.soporte_facturado where id = ya;
    return jsonb_build_object('ok', true);
  end if;
  if sop is null or not exists (select 1 from crm_giwa.v_soporte_desarrollos where id = sop and empresa_id = emp and tipo_id = 'SOP') then
    raise exception 'Elegí la línea de horas de soporte del CRM.';
  end if;
  if ya is not null then
    update crm_giwa.soporte_facturado set horas = crm_giwa.num(p ->> 'horas'), sop_id = sop, fecha = now(), usuario = crm_giwa.mi_mail(), nota = nullif(trim(coalesce(p ->> 'nota', '')), '')
     where id = ya;
  else
    insert into crm_giwa.soporte_facturado (id, empresa_id, desarrollo_id, periodo, horas, sop_id, usuario, nota)
    values (crm_giwa._soporte_nuevo_id('FAC', 4), emp, did, per, crm_giwa.num(p ->> 'horas'), sop, crm_giwa.mi_mail(), nullif(trim(coalesce(p ->> 'nota', '')), ''));
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant select on crm_giwa.v_soporte_cuentas_mes to authenticated, service_role;
grant execute on function crm_giwa.soporte_marcar_facturado(jsonb) to authenticated, service_role;

reset role;

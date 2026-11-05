-- Gráfico de Estado financiero: lo cobrado por mes en los últimos 12 meses (05/11/2026).
-- Fee = desarrollos MMR; One Shot = el resto. Sale de v_cobros_plata y v_desarrollos_plata: la misma plata del resumen.
set role crm_giwa_dev;
create or replace view crm_giwa.v_cobrado_12m with (security_invoker = true) as
with meses as (select k as orden, (crm_giwa.mes_actual() - make_interval(months => 11 - k))::date as mes from generate_series(0, 11) k),
c as (select date_trunc('month', coalesce(p.deposito_fecha, p.transf_fecha))::date as mes, p.cobrado, coalesce(d.es_mantenimiento, false) as mant
        from crm_giwa.v_cobros_plata p left join crm_giwa.v_desarrollos_plata d on d.id = p.desarrollo_id
       where coalesce(p.deposito_fecha, p.transf_fecha) is not null)
select m.orden, m.mes,
       ((array['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'])[extract(month from m.mes)::int] || ' ' || to_char(m.mes, 'YY')) as etiqueta,
       round(coalesce((select sum(c.cobrado) from c where c.mes = m.mes and c.mant), 0)) as fee,
       round(coalesce((select sum(c.cobrado) from c where c.mes = m.mes and not c.mant), 0)) as one_shot
  from meses m;
grant select on crm_giwa.v_cobrado_12m to authenticated;
reset role;

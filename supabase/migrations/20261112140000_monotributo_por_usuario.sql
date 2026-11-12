-- crm_giwa · Categoría de monotributo por usuario · 12/11/2026
-- Pedido de Vicky: en Usuarios va la categoría de cada uno y si su monotributo es costo de GIWA.
-- Vicky (C) sí: no le factura a nadie más. Diego (H) no: hoy no factura para GIWA.
--   usuarios.monotributo_cat / monotributo_giwa · guardar_usuario los guarda
--   v_monotributo: «tu categoría» sale de Usuarios (impuestos.monotributo_unificado queda sin uso, no se borra)
--   v_gastos_plata.costo_giwa: gasto que cuenta para GIWA = los no impuestos + el monotributo de quien tiene el tilde
--   v_gasto_mensual pasa a sumar costo_giwa (y con eso el neto de la proyección)
set role crm_giwa_dev;
set search_path = crm_giwa, public;

alter table crm_giwa.usuarios add column if not exists monotributo_cat text;
alter table crm_giwa.usuarios add column if not exists monotributo_giwa boolean not null default false;

-- Lo que hoy está en la tabla de impuestos
update crm_giwa.usuarios u set monotributo_cat = i.categoria
  from crm_giwa.impuestos i
 where crm_giwa.norm_mail(i.monotributo_unificado) = crm_giwa.norm_mail(u.mail) and u.monotributo_cat is null;
update crm_giwa.usuarios set monotributo_giwa = true where crm_giwa.norm_mail(mail) = 'v.gagey@giwa-ia.com';

do $$
declare o text; n text;
begin
  select pg_get_functiondef('crm_giwa.guardar_usuario(jsonb)'::regprocedure) into o;
  n := replace(o, $a$  if uid is null then$a$,
    $a$  if nullif(trim(coalesce(p ->> 'monotributo_cat', '')), '') is not null
     and not exists (select 1 from crm_giwa.impuestos i where i.categoria = trim(p ->> 'monotributo_cat')) then
    raise exception 'No existe la categoría de monotributo %', trim(p ->> 'monotributo_cat'); end if;
  if uid is null then$a$);
  n := replace(n, $a$    activo     = coalesce((p ->> 'activo')::boolean, u.activo)$a$,
    $a$    activo     = coalesce((p ->> 'activo')::boolean, u.activo),
    monotributo_cat  = case when p ? 'monotributo_cat' then nullif(trim(p ->> 'monotributo_cat'), '') else u.monotributo_cat end,
    monotributo_giwa = coalesce((p ->> 'monotributo_giwa')::boolean, u.monotributo_giwa)$a$);
  if (length(n) - length(o)) < 300 then raise exception 'No encontré los lugares en guardar_usuario'; end if;
  execute n;
end $$;

create or replace view crm_giwa.v_monotributo with (security_invoker = true) as
with yo as (select crm_giwa.mi_mail() as mail),
f as (
  select coalesce(sum(d.monto), 0) as fact12
    from crm_giwa.cobros c join crm_giwa.v_cobros_det d on d.id = c.id, yo
   where crm_giwa.norm_mail(c.factura_owner) = yo.mail
     and coalesce(c.tipo_comprobante, '') !~* 'sin comprobante'
     and c.comprobante_fecha >= (date_trunc('month', crm_giwa.hoy()) - interval '11 mons')::date),
micat as (select u.monotributo_cat as cat from crm_giwa.usuarios u, yo where crm_giwa.norm_mail(u.mail) = yo.mail limit 1),
cat as (select i.categoria, i.ingresos_brutos as limite, i.total_servicios as mensual, i.orden,
               i.categoria = (select micat.cat from micat) as mia
          from crm_giwa.impuestos i where coalesce(i.ingresos_brutos, 0) > 0),
sug as (select coalesce((select cat.categoria from cat, f where cat.limite >= f.fact12 order by cat.limite limit 1),
                        (select cat.categoria from cat order by cat.limite desc limit 1)) as categoria)
select cat.categoria, cat.limite, cat.mensual, coalesce(cat.mia, false) as mia, cat.categoria = sug.categoria as sugerida,
       f.fact12, (select yo.mail from yo) as mail, cat.orden
  from cat, f, sug;

create or replace view crm_giwa.v_gastos_plata with (security_invoker = true) as
with g as (
  select g.*, crm_giwa.tc_de_fecha(g.fecha) as tc,
         to_char(coalesce(g.mes, g.fecha), 'YYYY-MM') as mes_key
  from crm_giwa.gastos_internos g
), x as (
  select g.*, crm_giwa.norm(coalesce(g.categoria, '') || ' ' || coalesce(g.descripcion, ''))
           ~ '(impuesto|monotrib|arca|afip|ingresos brutos|iibb|retenc)' as es_impuesto
    from g
)
select x.id, x.fecha, x.categoria, x.tipo, x.descripcion, x.moneda, x.recurrencia, x.prorratear,
       x.pagador, x.contratacion_id, x.mes_key, x.tc,
       case when coalesce(x.monto_ars, 0) = 0 and coalesce(x.monto_usd, 0) <> 0
            then round(x.monto_usd * x.tc) else coalesce(x.monto_ars, 0) end as monto_ars,
       case when coalesce(x.monto_usd, 0) = 0 and coalesce(x.monto_ars, 0) <> 0 and x.tc > 0
            then round(x.monto_ars / x.tc, 2) else coalesce(x.monto_usd, 0) end as monto_usd,
       x.es_impuesto,
       not x.es_impuesto
         or (crm_giwa.norm(coalesce(x.descripcion, '')) ~ 'monotrib'
             and exists (select 1 from crm_giwa.usuarios u
                          where u.monotributo_giwa and crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(x.pagador))) as costo_giwa
from x;

create or replace view crm_giwa.v_gasto_mensual with (security_invoker = true) as
with ult as (
  select coalesce(max(mes_key) filter (where mes_key <= to_char(crm_giwa.mes_actual(), 'YYYY-MM')),
                  to_char(crm_giwa.mes_actual(), 'YYYY-MM')) as mes
  from crm_giwa.v_gastos_plata where mes_key <> '')
select ult.mes,
       round(coalesce((select sum(monto_ars) from crm_giwa.v_gastos_plata g
                        where g.mes_key = ult.mes and g.costo_giwa), 0)) as gasto_mensual
from ult;

reset role;

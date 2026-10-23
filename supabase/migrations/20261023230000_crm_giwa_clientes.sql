-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Clientes: el estado y los números de cada empresa · 23/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Traducción de Calculos.gs getClientesCRM + Estados.gs _estadoCliente.
-- Una fila por empresa CON proyectos (como el Apps Script; una empresa sin
-- proyectos no aparece y la pantalla la muestra como «prospecto»).
--
--   contratado, saldo, abono   de v_resumen_por_empresa (los ganados)
--   ganado / detenido          algún proyecto ganado / detenido
--   deuda                      algún comprobante positivo, sin depósito ni
--                              transferencia, con más de N días (CotConfig
--                              alerta_cobro_vencido_dias; 30 por defecto)
--   ultimo                     el comentario más reciente de sus proyectos
--   estado                     prospecto · deuda vencida · detenido ·
--                              abono activo · cliente (en ese orden)
-- La clave es el nombre de la empresa (p.empresa del Apps Script), y se
-- agrega empresa_id para que la app nueva pueda cruzar por ID.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.umbral(clave text, por_defecto numeric) returns numeric
language sql stable as $$
  -- como _umbrales(): el valor de CotConfig si es > 0; si no, el de por defecto
  select coalesce(
    (select v from (select nullif(regexp_replace(c.valor, '[^0-9.]', '', 'g'), '')::numeric as v
                      from crm_giwa.cot_config c where c.clave = umbral.clave) x
      where v > 0 limit 1),
    por_defecto)
$$;

create or replace view crm_giwa.v_clientes with (security_invoker = true) as
with p as (select * from crm_giwa.v_proyectos_clasif where empresa <> '—'),
k as (
  select empresa, min(empresa_id) as empresa_id,
         bool_or(es_ganado) as ganado, bool_or(detenido) as detenido
  from p group by empresa
),
deuda as (
  select distinct p.empresa
  from crm_giwa.v_cobros_plata c join p on p.id = c.proyecto_id
  where c.monto > 0 and c.deposito_fecha is null and c.transf_fecha is null
    and c.comprobante_fecha is not null
    and extract(epoch from (now() - (c.comprobante_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires'))) / 86400
        > crm_giwa.umbral('alerta_cobro_vencido_dias', 30)
),
ult as (
  select p.empresa, max(n.fecha) as ultimo
  from crm_giwa.comentarios n join p on p.id = n.proyecto_id
  where n.fecha is not null group by p.empresa
),
b as (
  select k.empresa, k.empresa_id, k.ganado, k.detenido,
         coalesce(e.contratado, 0) as contratado, coalesce(e.saldo, 0) as saldo,
         coalesce(e.mant_mes, 0) > 0 as abono,
         (d.empresa is not null) as deuda,
         coalesce(to_char(u.ultimo, 'YYYY-MM-DD'), '') as ultimo
  from k
  left join crm_giwa.v_resumen_por_empresa e on e.empresa = k.empresa
  left join deuda d on d.empresa = k.empresa
  left join ult u on u.empresa = k.empresa
)
select b.*,
       case when not b.ganado then 'prospecto'
            when b.deuda      then 'deuda vencida'
            when b.detenido   then 'detenido'
            when b.abono      then 'abono activo'
            else 'cliente' end as estado
from b;

reset role;

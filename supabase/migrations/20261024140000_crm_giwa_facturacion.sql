-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Facturación (la lista de cobros) · etapa 4b · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- v_cobros               = getAllCobros (Facturacion.gs): cada cobro con el
--                          monto y el USD con signo (la NC resta) y el nombre
--                          del proyecto, la empresa y el desarrollo.
-- borrar_cobro(id)       = deleteCobro, con la regla que la pantalla ya
--                          tenía: un cobro con la plata adentro no se borra
--                          (la nota de crédito sí).
-- comentar_cobro(id, t)  = comentarCobro: comentario en el proyecto y el
--                          desarrollo del cobro, «FC 0001-…: texto».
-- cobro_link(id, link)   = updateCobroLink: el PDF de la factura.
-- Editar y dar de alta van con Cargar factura (al final de la etapa 4).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace view crm_giwa.v_cobros with (security_invoker = true) as
select c.id, coalesce(c.proyecto_id, '') as proy_id, coalesce(c.desarrollo_id, '') as item_id,
       coalesce((select coalesce(nullif(d.titulo, ''), d.descripcion) from crm_giwa.desarrollos d where d.id = c.desarrollo_id), '') as item_nombre,
       coalesce(c.forma_pago, '') as forma_pago, coalesce(c.cuit_destino, '') as cuit, coalesce(c.razon_social_fc, '') as razon_social,
       coalesce(c.concepto_fc, '') as concepto, coalesce(c.cuota_nro::text, '') as cuota_nro,
       coalesce(c.tipo_comprobante, '') as tipo_comp, coalesce(c.comprobante_nro, '') as nro_factura,
       c.comprobante_fecha as fecha_comp, crm_giwa.norm_mail(c.factura_owner) as factura_owner,
       v.monto, v.monto_usd as total_usd,
       case when upper(coalesce(c.moneda_factura, '')) like '%USD%' then 'USD' else 'ARS' end as moneda,
       coalesce(c.cobrado_ars, 0) as monto_ajustado,
       c.deposito_fecha as fecha_deposito, c.transf_fecha as fecha_transf, coalesce(c.link_fc, '') as link_fc,
       coalesce(m.nombre, '') as proy_nombre, coalesce(m.empresa, '') as empresa, m.empresa_id, c.orden
from crm_giwa.cobros c
join crm_giwa.v_cobros_plata v on v.id = c.id
left join crm_giwa.v_proy_mapa m on m.id = c.proyecto_id;

create or replace function crm_giwa.borrar_cobro(cid text) returns jsonb
language plpgsql volatile as $$
declare c crm_giwa.cobros; m numeric;
begin
  select * into c from crm_giwa.cobros where id = trim(cid);
  if not found then raise exception 'Cobro no encontrado'; end if;
  select monto into m from crm_giwa.v_cobros_plata where id = c.id;
  if (c.deposito_fecha is not null or c.transf_fecha is not null) and m >= 0 then
    raise exception 'Un cobro con la plata adentro no se borra: dejale un comentario.';
  end if;
  delete from crm_giwa.cobros where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.comentar_cobro(cid text, texto text) returns jsonb
language plpgsql volatile as $$
declare c crm_giwa.cobros;
begin
  if trim(coalesce(texto, '')) = '' then raise exception 'Escribí el comentario'; end if;
  select * into c from crm_giwa.cobros where id = trim(cid);
  if not found then raise exception 'Cobro no encontrado'; end if;
  return crm_giwa.comentar(jsonb_build_object(
    'proyecto_id', c.proyecto_id, 'desarrollo_id', c.desarrollo_id,
    'texto', case when coalesce(c.comprobante_nro, '') <> '' then 'FC ' || c.comprobante_nro || ': ' else 'Cobro: ' end || trim(texto)));
end $$;

create or replace function crm_giwa.cobro_link(cid text, link text) returns jsonb
language plpgsql volatile as $$
begin
  update crm_giwa.cobros set link_fc = nullif(trim(coalesce(link, '')), '') where id = trim(cid);
  if not found then raise exception 'Cobro no encontrado'; end if;
  return jsonb_build_object('ok', true);
end $$;

grant select on crm_giwa.v_cobros to authenticated, service_role;
grant execute on function crm_giwa.borrar_cobro(text), crm_giwa.comentar_cobro(text, text), crm_giwa.cobro_link(text, text) to authenticated;

reset role;

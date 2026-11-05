-- Valores de mercado: queda sólo el tarifario del 04/11/2026, con el vínculo a la web de cada fuente (05/11/2026)
set role crm_giwa_dev;
insert into crm_giwa.admin_auditoria(quien, tabla, registro, accion, antes, despues, motivo)
select 'v.gagey@giwa-ia.com', 'mercado_referencias', r.id, 'borrar', to_jsonb(r), null, 'Pedido de Victoria 05/11/2026: sólo queda el tarifario nuevo' from crm_giwa.mercado_referencias r where r.id not like 'TAR-%';
delete from crm_giwa.mercado_referencias where id not like 'TAR-%';
update crm_giwa.mercado_referencias set url = concat_ws(' ',
  case when fuente ~* 'upwork' then 'https://www.upwork.com/resources/upwork-hourly-rates/' end,
  case when fuente ~* 'lemon ai' then 'https://lemon.io/for-developers/ai-engineer-jobs/' when fuente ~* 'lemon' then 'https://lemon.io/rate-calculator/argentina/' end,
  case when fuente ~* 'cpcipc' then 'https://coprocier.org.ar/web/honorarios-sugeridos/' end);
reset role;

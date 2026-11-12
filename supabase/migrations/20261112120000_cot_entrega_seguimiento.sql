-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cotizador: Entrega y Seguimiento del agente IA al cuestionario · 12/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Pedido de Vicky: «Entrega» y «Seguimiento» no van aparte en «Incluye».
--   · Entrega → bloque «Capacitación y entrega» del cuestionario, como en los otros tipos.
--     Las pruebas de calidad de IA quedan en la etapa Pruebas; capacitación y manual en Producción.
--   · Seguimiento → bloque «Tablero y reportes»: tablero y reportes son construcción (pago único).
--     Monitoreo ya está en el mantenimiento (se desactiva para no cobrarlo dos veces).
--     Auditoría de conversaciones pasa a ser mensual: 0 h de pago único y suma
--     cot_config.mant_hs_auditoria (1 h) al mantenimiento. cot_inicio lo devuelve en valores.
-- Las cotizaciones guardadas (D-0069, D-0094) tienen precio fijo: no cambian.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

update crm_giwa.catalogo_modulos set bloque_comercial = 'Capacitación y entrega'
 where tipo_desarrollo_id = 'IA' and id in ('IA-109', 'IA-011', 'IA-084', 'IA-086');
update crm_giwa.catalogo_modulos set pregunta = '¿Suma pruebas, capacitación o documentación?' where id = 'IA-109';
update crm_giwa.catalogo_modulos set etapa = 'Pruebas' where id = 'IA-011';
update crm_giwa.catalogo_modulos set etapa = 'Producción' where id in ('IA-084', 'IA-086', 'IA-109');

update crm_giwa.catalogo_modulos set bloque_comercial = 'Tablero y reportes'
 where tipo_desarrollo_id = 'IA' and id in ('IA-046', 'IA-097', 'IA-098', 'IA-108', 'IA-016', 'IA-096', 'IA-124');
update crm_giwa.catalogo_modulos set pregunta = '¿Necesita tablero o auditoría?' where id = 'IA-046';
update crm_giwa.catalogo_modulos set activo = false where id = 'IA-124';
update crm_giwa.catalogo_modulos set horas_base = 0, pregunta = 'Auditoría de conversaciones (por mes, en el mantenimiento)' where id = 'IA-098';

insert into crm_giwa.cot_config (clave, valor, orden, aclaracion)
select 'mant_hs_auditoria', '1', (select coalesce(max(orden), 0) + 1 from crm_giwa.cot_config), 'Horas por mes que suma la auditoría de conversaciones al mantenimiento'
 where not exists (select 1 from crm_giwa.cot_config where clave = 'mant_hs_auditoria');

do $mig$
declare f text; g text;
begin
  f := pg_get_functiondef('crm_giwa.cot_inicio()'::regprocedure);
  g := replace(f, '''mant_integ'', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = ''mant_hs_integracion'')), 0), 1),',
                  '''mant_integ'', coalesce(nullif(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = ''mant_hs_integracion'')), 0), 1),
                 ''mant_aud'', coalesce(crm_giwa.num_ar((select valor from crm_giwa.cot_config where clave = ''mant_hs_auditoria'')), 0),');
  if g = f then raise exception 'cot_inicio: la definición vigente no coincide con la esperada'; end if;
  execute g;
end $mig$;

reset role;

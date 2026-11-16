-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Configuración › Valor hora y targets · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Una sola vista con lo que de verdad usa el Cotizador y Estado financiero.
-- Se pueden editar desde la app el valor hora de venta (vh_giwa_ars) y el de costo
-- interno (vh_costo_ars), que hasta hoy sólo se cambiaban en la base, y el target
-- nuevo de proyectos nuevos por año (target_proyectos_anio).
-- Márgenes, dificultad y especialidad salen de la pantalla: no cambiaban ningún precio.
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
do $$
declare o text := pg_get_functiondef('crm_giwa.config_editables()'::regprocedure); n text;
begin
  n := replace(o, $a$'dias_pago_proveedor']$a$, $a$'dias_pago_proveedor','vh_giwa_ars','vh_costo_ars','target_proyectos_anio']$a$);
  if n = o then raise exception 'No encontré la lista de números de config_editables'; end if;
  execute n;
end $$;
reset role;

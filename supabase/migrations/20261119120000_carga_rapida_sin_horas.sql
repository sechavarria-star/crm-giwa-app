-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Carga rápida sin horas · 19/11/2026 (aplicada desde la sesión)
-- ──────────────────────────────────────────────────────────────────────
-- 1) alta_proyecto_rapido grababa las horas estándar del catálogo como horas
--    del desarrollo (y el valor hora con ellas). Ahora no graba ni horas ni valor hora.
-- 2) Limpieza pedida por Victoria: se borraron las horas y el valor hora de todos los
--    desarrollos (copia en crm_giwa.respaldo_horas_20261119) y se recalcularon desde
--    el cuestionario sólo los que lo tienen respondido.
-- Para deshacer la limpieza:
--   update crm_giwa.desarrollos d set duracion_horas = r.duracion_horas, valor_hora = r.valor_hora
--     from crm_giwa.respaldo_horas_20261119 r where r.id = d.id;
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

do $mig$
declare f text; g text;
  a text := '          case when (e ->> ''ok'')::boolean then (e ->> ''horas'')::numeric end,
          case when (e ->> ''ok'')::boolean and coalesce((e ->> ''horas'')::numeric, 0) > 0 then round(ars / (e ->> ''horas'')::numeric) end,';
  b text := '          null, null,   -- Carga rápida no carga horas ni valor hora (19/11/2026)';
begin
  f := pg_get_functiondef('crm_giwa.alta_proyecto_rapido(jsonb)'::regprocedure);
  if position(b in f) > 0 then return; end if;
  if position(a in f) = 0 then raise exception 'alta_proyecto_rapido: la definición vigente no coincide con la esperada'; end if;
  execute replace(f, a, b);
end $mig$;

reset role;

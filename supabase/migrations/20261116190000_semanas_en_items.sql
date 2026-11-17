-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · La duración en semanas de la cotización llega a Proyectos · 16/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- v_pm_items suma 'semanas' (desarrollos.minuta ->> 'semanas', lo que se carga en la
-- cotización / propuesta). Con eso el fin estimado de un desarrollo sin fecha de fin
-- es inicio + semanas, y la ficha deja de pedir la fecha a mano.
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
do $$
declare o text := pg_get_viewdef('crm_giwa.v_pm_items'::regclass); n text;
begin
  n := replace(o, $a$'bonificacion', COALESCE(vp.bonificacion, (0)::numeric))) AS item$a$,
                  $a$'bonificacion', COALESCE(vp.bonificacion, (0)::numeric)) || jsonb_build_object('semanas', COALESCE(crm_giwa.num_ar(substring(d.minuta from '"semanas":\s*"?([0-9.,]+)')), (0)::numeric))) AS item$a$);
  -- minuta es texto: se lee con una expresión para no romper la vista si alguna no es JSON
  if n = o then raise exception 'No encontré dónde sumar semanas en v_pm_items'; end if;
  execute 'create or replace view crm_giwa.v_pm_items as ' || n;
end $$;
reset role;

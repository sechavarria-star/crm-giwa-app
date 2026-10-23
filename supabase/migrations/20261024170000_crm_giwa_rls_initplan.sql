-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · RLS más rápida · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- La política «equipo» de cada tabla llamaba crm_giwa.es_equipo() POR FILA.
-- Envuelta en (select …) Postgres la evalúa una vez por consulta (initplan):
-- misma regla, mismo resultado. v_pm_proyectos pasó de 190 ms a ~60 ms
-- medido como usuario logueado. Recomendación de Supabase (RLS performance).
-- ══════════════════════════════════════════════════════════════════════
do $$
declare r record;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'crm_giwa' and qual = 'crm_giwa.es_equipo()' loop
    execute format('alter policy %I on crm_giwa.%I using ((select crm_giwa.es_equipo()))%s',
                   r.policyname, r.tablename,
                   case when r.with_check is not null then ' with check ((select crm_giwa.es_equipo()))' else '' end);
  end loop;
end $$;

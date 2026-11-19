-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Cotizador: el motor cuenta sólo lo tildado · 18/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Antes: una funcionalidad sugerida que no estaba en «sel» se contaba igual
-- (respondida No, Por definir o en etapa futura sumaba horas y precio).
-- Ahora: si la llamada trae «sel», cuenta sólo lo que está en true.
-- Sin «sel» (Proyectos · horas estándar del tipo) sigue contando lo sugerido.
-- Cambio quirúrgico sobre la definición vigente.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

do $mig$
declare f text; g text;
  a text := 'case when sel ? x.id then sel -> x.id = ''true''::jsonb else coalesce(x.sugerido, false) end';
  b text := 'case when sel ? x.id then sel -> x.id = ''true''::jsonb when o ? ''sel'' then false else coalesce(x.sugerido, false) end';
begin
  f := pg_get_functiondef('crm_giwa.estimar_desarrollo(text,text,jsonb)'::regprocedure);
  if position(a in f) = 0 then raise exception 'estimar_desarrollo: la definición vigente no coincide con la esperada'; end if;
  g := replace(f, a, b);
  execute g;
end $mig$;

reset role;

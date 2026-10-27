-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · nueva tarea con detalle opcional · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Igual que saveTask en el Apps Script (26/10): la tarea se carga con
-- «Qué hay que hacer»; el detalle es opcional («+ Agregar detalle»).
-- Sólo cambia esa validación; el resto de nueva_tarea queda igual.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.nueva_tarea(p jsonb) returns jsonb
language plpgsql volatile as $$
declare nid text;
begin
  if trim(coalesce(p ->> 'title', '')) = '' then raise exception 'Falta «Qué hay que hacer».'; end if;
  nid := crm_giwa._alta_tarea(jsonb_build_object(
    'type', 'Tarea', 'title', p ->> 'title', 'detail', coalesce(p ->> 'detail', ''), 'projectId', p ->> 'projectId',
    'clientId', p ->> 'clientId', 'itemIds', '', 'priority', p ->> 'priority', 'assignees', p ->> 'assignees',
    'due', coalesce(nullif(p ->> 'due', ''), (crm_giwa.hoy() + 7)::text)));
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

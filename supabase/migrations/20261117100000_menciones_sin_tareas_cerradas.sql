-- ═══════════════════════════════════════════════════════════════════════
-- crm_giwa · Hoy › Menciones sin las de tareas cerradas · 17/11/2026
-- ───────────────────────────────────────────────────────────────────────
-- Las menciones de una tarea Finalizada o Cancelada ya no aparecen (ni cuentan
-- como «sin leer»). Mismas columnas y mismo security_invoker.
-- ═══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
create or replace view crm_giwa.v_mis_menciones with (security_invoker = true) as
 SELECT m.id,
    m.leida,
    c.id AS comentario_id,
    c.tarea_id,
    t.titulo,
    c.creador,
    c.texto,
    c.creado
   FROM ((crm_giwa.comentario_menciones m
     JOIN crm_giwa.comentarios c ON ((c.id = m.comentario_id)))
     JOIN crm_giwa.tareas t ON ((t.id = c.tarea_id)))
  WHERE (m.mail = crm_giwa.mi_mail())
    AND crm_giwa.canon_tarea(t.estado) NOT IN ('finalizada', 'cancelada');
reset role;

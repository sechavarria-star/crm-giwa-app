-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Seguimiento: la descripción de cada tarea · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- La tarjeta mostraba el título y, debajo, los comentarios automáticos
-- («Delegada…», «Viene de…»), que tapaban qué había que hacer. Ahora va
-- el título con su descripción; esos comentarios pasan a un historial aparte.
-- Único cambio en la vista: 'descripcion' dentro de cada tarea.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

create or replace view crm_giwa.v_pm_seguimiento with (security_invoker = true) as
 WITH pids AS (
         SELECT proyectos.id
           FROM proyectos
        ), tar AS (
         SELECT pid.pid,
            jsonb_agg(jsonb_build_object('id', t.id, 'titulo', COALESCE(t.titulo, ''::text), 'descripcion', COALESCE(t.descripcion, ''::text), 'estado', COALESCE(t.estado, ''::text), 'item_id', COALESCE(t.desarrollo_id, ''::text), 'responsable', norm_mails(t.responsable), 'fecha_vencimiento', t.vencimiento, 'fecha_creacion', t.fecha_creacion) ORDER BY t.orden) AS tareas
           FROM tareas t,
            LATERAL unnest(lista_csv(t.proyecto_id)) pid(pid)
          WHERE ((COALESCE(TRIM(BOTH FROM t.id), ''::text) <> ''::text) AND (COALESCE(t.tipo, ''::text) !~* 'administr'::text))
          GROUP BY pid.pid
        ), com AS (
         SELECT c.pid,
            jsonb_agg(jsonb_build_object('id', c.id, 'usuario', norm_mail(c.creador), 'fecha', c.fecha, 'texto', c.texto, 'tarea_id', COALESCE(c.tarea_id, ''::text), 'tarea_titulo', COALESCE(t.titulo, ''::text), 'item_id', COALESCE(c.desarrollo_id, ''::text)) ORDER BY c.fecha DESC, c.orden) FILTER (WHERE (c.n <= 5)) AS comentarios
           FROM (( SELECT c_1.id, c_1.tarea_id, c_1.proyecto_id, c_1.desarrollo_id, c_1.empresa_id, c_1.contacto_id, c_1.texto, c_1.fecha,
                    c_1.estado, c_1.creador, c_1.creado, c_1.actualizado, c_1.orden, pid.pid,
                    row_number() OVER (PARTITION BY pid.pid ORDER BY c_1.fecha DESC, c_1.orden) AS n
                   FROM comentarios c_1,
                    LATERAL unnest(lista_csv(c_1.proyecto_id)) pid(pid)) c
             LEFT JOIN tareas t ON ((t.id = c.tarea_id)))
          GROUP BY c.pid
        ), mods AS (
         SELECT h.proyecto_id AS pid,
            jsonb_agg(jsonb_build_object('id', h.id, 'item_id', COALESCE(h.desarrollo_id, ''::text), 'nombre', COALESCE(NULLIF(h.modulo_nombre, ''::text), NULLIF(h.etapa, ''::text), h.id), 'etapa', COALESCE(h.etapa, ''::text), 'est', COALESCE(h.horas_est, (0)::numeric), 'estado', COALESCE(h.estado, ''::text)) ORDER BY h.orden) AS modulos
           FROM proyecto_horas h
          WHERE ((COALESCE(h.proyecto_id, ''::text) <> ''::text) AND (COALESCE(h.id, ''::text) <> ''::text))
          GROUP BY h.proyecto_id
        )
 SELECT p.id AS proyecto_id,
    COALESCE(tar.tareas, '[]'::jsonb) AS tareas,
    COALESCE(com.comentarios, '[]'::jsonb) AS comentarios,
    COALESCE(mods.modulos, '[]'::jsonb) AS modulos
   FROM (((pids p
     LEFT JOIN tar ON ((tar.pid = p.id)))
     LEFT JOIN com ON ((com.pid = p.id)))
     LEFT JOIN mods ON ((mods.pid = p.id)));

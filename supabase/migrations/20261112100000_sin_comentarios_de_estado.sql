-- crm_giwa · Sin comentarios automáticos de cambio de estado · 12/11/2026
-- El estado ya se ve en la tarea. Dejan de crearse «Finalizada» y «Cerrada: …»; si al finalizar hay nota, queda sólo la nota.
-- Siguen automáticos: la delegación, «Procesada» de las alertas y «Hecha … Próxima» de las reuniones.
-- Se borran los existentes: Finalizada, Cerrada, Reabierta y Cancelada (21 al 12/11/2026, ninguno con nota escrita).
set role crm_giwa_dev;
set search_path = crm_giwa, public;

do $$
declare o text; n text;
begin
  select pg_get_functiondef('crm_giwa.finalizar_tarea(text, text)'::regprocedure) into o;
  n := replace(o, $a$perform crm_giwa._comentar_tarea(t.id, 'Finalizada' || case when n <> '' then ': ' || n else '' end);$a$,
                  $a$if n <> '' then perform crm_giwa._comentar_tarea(t.id, n); end if;$a$);
  if n = o then raise exception 'No encontré el comentario en finalizar_tarea'; end if;
  execute n;

  select pg_get_functiondef('crm_giwa.sincronizar_alertas_facturacion()'::regprocedure) into o;
  n := replace(o, $a$perform crm_giwa._comentar_tarea(x.id, 'Cerrada: no queda nada para facturar de ' || x.item || '.');$a$, '');
  if n = o then raise exception 'No encontré el comentario en sincronizar_alertas_facturacion'; end if;
  execute n;

  select pg_get_functiondef('crm_giwa.cerrar_repetidas(boolean)'::regprocedure) into o;
  n := replace(o, $a$perform crm_giwa._comentar_tarea(x.id, 'Cerrada: repetida con ' || x.repetida_con);$a$, '');
  if n = o then raise exception 'No encontré el comentario en cerrar_repetidas'; end if;
  execute n;
end $$;

delete from crm_giwa.comentarios
 where tarea_id is not null
   and (texto = 'Finalizada' or texto ~ '^(Cerrada|Reabierta|Cancelada): ');

reset role;

-- crm_giwa · Vuelve el comentario de los cierres automáticos · 12/11/2026
-- Pedido de Vicky: «Cerrada: no queda nada para facturar de …» y «Cerrada: repetida con …» siguen automáticos.
-- Deshace esa parte de 20261112100000_sin_comentarios_de_estado (Finalizada sigue sin comentario).
set role crm_giwa_dev;
set search_path = crm_giwa, public;

do $$
declare o text; n text;
begin
  select pg_get_functiondef('crm_giwa.sincronizar_alertas_facturacion()'::regprocedure) into o;
  n := regexp_replace(o, 'where id = x\.id;\n[ ]*\n', E'where id = x.id;\n        perform crm_giwa._comentar_tarea(x.id, ''Cerrada: no queda nada para facturar de '' || x.item || ''.'');\n', 'g');
  if (length(n) - length(replace(n, 'Cerrada: no queda', ''))) / length('Cerrada: no queda') <> 2 then raise exception 'No quedaron los 2 comentarios en sincronizar_alertas_facturacion'; end if;
  execute n;

  select pg_get_functiondef('crm_giwa.cerrar_repetidas(boolean)'::regprocedure) into o;
  n := regexp_replace(o, 'where id = x\.id;\n[ ]*\n', E'where id = x.id;\n      perform crm_giwa._comentar_tarea(x.id, ''Cerrada: repetida con '' || x.repetida_con);\n');
  if n = o then raise exception 'No encontré el lugar en cerrar_repetidas'; end if;
  execute n;
end $$;

reset role;

-- Cerrar un recordatorio a mano es del responsable (04/11/2026). finalizar_tarea ya lo exigía.
-- El cierre automático al facturar (sincronizar_alertas_facturacion, _ipc_ajustado) sigue igual:
-- lo dispara quien factura, que puede no ser el responsable. Por eso usa _procesar_alerta, sin la traba.
set role crm_giwa_dev;

do $$
declare d text; f text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_giwa' and p.proname = 'procesar_alerta';
  execute replace(d, 'crm_giwa.procesar_alerta(', 'crm_giwa._procesar_alerta(');
  foreach f in array array['sincronizar_alertas_facturacion', '_ipc_ajustado'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_giwa' and p.proname = f;
    execute replace(d, 'crm_giwa.procesar_alerta(', 'crm_giwa._procesar_alerta(');
  end loop;
end $$;

create or replace function crm_giwa.procesar_alerta(tid text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.tareas := crm_giwa._tarea(tid);
begin
  if coalesce(trim(t.responsable), '') <> '' and not crm_giwa._es_responsable(t) then
    raise exception 'Solo el responsable puede cerrarla. Podés dejar un comentario.';
  end if;
  return crm_giwa._procesar_alerta(tid, nota);
end $$;

grant execute on function crm_giwa._procesar_alerta(text, text), crm_giwa.procesar_alerta(text, text) to authenticated;

reset role;

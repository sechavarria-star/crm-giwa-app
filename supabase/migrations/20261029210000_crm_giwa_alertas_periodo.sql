-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Alertas que se cierran solas, en la misma fila · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- sincronizar_alertas_facturacion: al cargar la factura o el pago, la alerta de
--   Facturación del desarrollo que ya no tiene nada para facturar en el período:
--     · Mensual → si el período pendiente del desarrollo ya es posterior al de la
--       alerta, procesar_alerta la pasa al período siguiente en la misma fila
--       (o la cierra si terminó el contrato). Nunca la corre dos veces.
--     · Única (saldo) → se cierra.
--   Antes cerraba también las mensuales y nadie las volvía a crear.
-- Ajuste IPC: al cargar la nueva cuota en el desarrollo (valor_cuota_actual o
--   fecha_ajuste_cuota), su alerta de IPC abierta que vence dentro de 30 días
--   pasa al trimestre siguiente (procesar_alerta respeta el fin del contrato).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

create or replace function crm_giwa.sincronizar_alertas_facturacion() returns jsonb
language plpgsql as $$
declare x record; cerradas int := 0; corridas int := 0; pk text; pend date; due date; i int;
begin
  for x in select r.id, r.item, t.frecuencia, t.vencimiento from crm_giwa.v_reglas_facturacion r join crm_giwa.tareas t on t.id = r.id loop
    if crm_giwa.norm(coalesce(x.frecuencia, '')) ~ 'mensual' then
      -- el período que falta facturar (periodo_key viene con el mes de JS, 0 = enero)
      select m.periodo_key into pk from crm_giwa.v_facturar_mensuales m where m.item_id = x.item order by m.periodo_key limit 1;
      if pk is null then
        if x.item in (select item_id from crm_giwa.v_facturar_saldos) then continue; end if;
        update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = x.id;
        perform crm_giwa._comentar_tarea(x.id, 'Cerrada: no queda nada para facturar de ' || x.item || '.');
        cerradas := cerradas + 1; continue;
      end if;
      pend := make_date(split_part(pk, '-', 1)::int, 1, 1) + make_interval(months => split_part(pk, '-', 2)::int);
      due := x.vencimiento; i := 0;
      -- ya se facturó el período de la alerta: la misma fila pasa al siguiente
      while due is not null and date_trunc('month', due) < pend and i < 24 loop
        perform crm_giwa.procesar_alerta(x.id, 'Facturado');
        select vencimiento into due from crm_giwa.tareas where id = x.id and crm_giwa.canon_tarea(estado) not in ('finalizada', 'cancelada');
        i := i + 1;
      end loop;
      if i > 0 then corridas := corridas + 1; end if;
    elsif x.item not in (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos) then
      update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = x.id;
      perform crm_giwa._comentar_tarea(x.id, 'Cerrada: no queda nada para facturar de ' || x.item || '.');
      cerradas := cerradas + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'creadas', 0, 'cerradas', cerradas, 'al_periodo_siguiente', corridas);
end $$;

create or replace function crm_giwa._ipc_ajustado() returns trigger
language plpgsql as $$
declare x record;
begin
  if new.valor_cuota_actual is not distinct from old.valor_cuota_actual
     and new.fecha_ajuste_cuota is not distinct from old.fecha_ajuste_cuota then return new; end if;
  for x in select t.id from crm_giwa.tareas t
            where coalesce(t.tipo, '') ~* 'administr' and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = 'ipc'
              and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
              and new.id = any ((crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids)
              and coalesce(t.vencimiento, crm_giwa.hoy()) <= crm_giwa.hoy() + 30 loop
    perform crm_giwa.procesar_alerta(x.id, 'Cuota ajustada');
  end loop;
  return new;
end $$;

drop trigger if exists desarrollos_ipc_ajustado on crm_giwa.desarrollos;
create trigger desarrollos_ipc_ajustado after update of valor_cuota_actual, fecha_ajuste_cuota on crm_giwa.desarrollos
  for each row execute function crm_giwa._ipc_ajustado();

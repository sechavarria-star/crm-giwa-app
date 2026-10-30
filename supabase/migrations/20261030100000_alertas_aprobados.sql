-- Alertas de facturación de desarrollos Aprobados: no se cierran solas.
-- Aprobado todavía no figura en v_facturar_*, así que sincronizar las cerraba
-- por «nada para facturar» (pasó con Prune T-0072 / T-0073). Se facturan al arrancar.
CREATE OR REPLACE FUNCTION crm_giwa.sincronizar_alertas_facturacion()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare x record; cerradas int := 0; corridas int := 0; pk text; pend date; due date; i int;
begin
  for x in select r.id, r.item, t.frecuencia, t.vencimiento from crm_giwa.v_reglas_facturacion r join crm_giwa.tareas t on t.id = r.id loop
    -- aprobado: queda abierta hasta que arranque y se facture
    if x.item in (select id from crm_giwa.desarrollos where crm_giwa.estado_canonico(estado_id) = 'aprobada') then continue; end if;
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
end $function$;

-- Prune (D-0058 / D-0059, aprobados): se reabren las alertas que se cerraron por error
select set_config('request.jwt.claims', '{"email":"v.gagey@giwa-ia.com"}', false);   -- autor del comentario
update crm_giwa.tareas set estado = 'Nueva', enviada = false where id in ('T-0072', 'T-0073');
select crm_giwa._comentar_tarea(id, 'Reabierta: el desarrollo está aprobado, se factura al arrancar.') from crm_giwa.tareas where id in ('T-0072', 'T-0073');

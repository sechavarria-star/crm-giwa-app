-- Renovar un mantenimiento (= renovarMantenimiento del Apps Script): línea nueva y finaliza la anterior.
-- Se pueden guardar los targets del gráfico y las Tareas rápidas (05/11/2026).
set role crm_giwa_dev;
do $$
declare o text; n text;
begin
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = 'config_editables';
  n := replace(replace(o, '''Gasto_Categoria'',''categorias_gasto'']', '''Gasto_Categoria'',''categorias_gasto'', ''Tarea_Rapida'']'),
               '''valor_hora_soporte_usd'']', '''valor_hora_soporte_usd'',''target_fee_mensual'',''target_proyectos_mes'']');
  execute n;
end $$;
create or replace function crm_giwa.renovar_mantenimiento(did text, duracion numeric default null, cuota_nueva numeric default null) returns jsonb
language plpgsql volatile as $$
declare
  d crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  r crm_giwa.desarrollos;
  dur_old int := greatest(1, coalesce(nullif(d.q_cuotas, 0), 12)::int);
  dur int := greatest(1, coalesce(nullif(duracion, 0), dur_old)::int);
  cu numeric := coalesce(nullif(cuota_nueva, 0), nullif(d.valor_cuota_actual, 0), d.cuota);
  nid text;
begin
  if not crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id) then raise exception 'Sólo se renueva un mantenimiento.'; end if;
  if crm_giwa.estado_canonico(d.estado_id) not in ('curso', 'garantia', 'finalizada') then raise exception 'Ese mantenimiento no está en curso ni finalizado.'; end if;
  if coalesce(cu, 0) <= 0 then raise exception 'Poné la cuota mensual.'; end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  nid := crm_giwa.proximo_id('D', 'desarrollos', 4);
  r := d;
  r.id := nid; r.estado_id := crm_giwa.estado_des('curso'); r.q_cuotas := dur; r.meses_contrato := dur;
  r.cuota := cu; r.valor_cuota_actual := cu; r.total_ars := cu * dur; r.total_usd := null;
  r.fecha_inicio := (coalesce(d.fecha_inicio, crm_giwa.hoy()) + make_interval(months => dur_old))::date;
  r.fecha_fin := null; r.fecha_ajuste_cuota := null; r.detenido := false;
  r.creador := crm_giwa.mi_mail(); r.creado := now(); r.actualizado := now(); r.orden := nextval('crm_giwa.orden_seq');
  insert into crm_giwa.desarrollos values (r.*);
  update crm_giwa.desarrollos set estado_id = crm_giwa.estado_des('finalizada') where id = d.id;
  -- Los avisos de la línea vieja terminan acá; la nueva crea los suyos
  update crm_giwa.tareas set estado = 'Finalizada', enviada = true
   where desarrollo_id = d.id and coalesce(tipo, '') ~* 'administr' and crm_giwa.canon_tarea(estado) not in ('finalizada', 'cancelada');
  perform crm_giwa.comentar(jsonb_build_object('proyecto_id', d.proyecto_id, 'desarrollo_id', nid,
    'texto', 'Mantenimiento renovado: nueva línea ' || nid || ' (' || dur || ' meses, cuota $' || to_char(round(cu), 'FM999G999G999') || '). Viene de ' || d.id || '.'));
  perform crm_giwa.sincronizar_alertas_facturacion();
  perform crm_giwa.crear_recordatorios('{}', nid);
  return jsonb_build_object('ok', true, 'id', nid, 'proy_id', d.proyecto_id, 'inicio', r.fecha_inicio);
end $$;
grant execute on function crm_giwa.renovar_mantenimiento(text, numeric, numeric) to authenticated;
reset role;

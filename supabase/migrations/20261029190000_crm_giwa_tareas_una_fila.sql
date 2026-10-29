-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Tareas: cada cosa es UNA fila · 29/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- 1. delegar_tarea: la misma fila, sólo cambia el responsable, con el
--    comentario «X la delegó a Y: nota». Ya no crea una copia ni cierra la
--    original. El aviso por Telegram al nuevo responsable sigue saliendo.
-- 2. Los recordatorios de Administración se crean sólo al arrancar un
--    desarrollo (accion_desarrollo 'arrancar') o desde «Crear recordatorios».
--    sincronizar_alertas_facturacion ya no crea: sólo cierra las que no
--    tienen nada para facturar (la llaman registrar_cobro y los cambios de estado).
-- 3. La base no deja dos filas abiertas con la misma clave:
--      Administración: categoría + desarrollo · Reunión mensual: cliente.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;
set search_path = crm_giwa, public;

-- ── 1 · Delegar ────────────────────────────────────────────────────────
create or replace function crm_giwa.delegar_tarea(tid text, a text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare
  t   crm_giwa.tareas := crm_giwa._tarea(tid);
  dst text := split_part(crm_giwa.norm_mails(a), ', ', 1);
  n   text := trim(coalesce(nota, ''));
begin
  if dst = '' then raise exception 'Elegí a quién se la delegás.'; end if;
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if not crm_giwa._es_responsable(t) then raise exception 'Solo el responsable puede delegarla. Podés dejar un comentario.'; end if;
  update crm_giwa.tareas set responsable = dst where id = t.id;
  perform crm_giwa._comentar_tarea(t.id, crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' la delegó a ' || crm_giwa.nombre_usuario(dst) ||
                                         case when n <> '' then ': ' || n else '' end);
  perform crm_giwa._tg_aviso_delegada(t.id, n);
  return jsonb_build_object('ok', true, 'id', t.id, 'from', t.id);
end $$;

-- El aviso: lo llama sólo delegar_tarea, así que ya no pregunta por «origen»
create or replace function crm_giwa._tg_aviso_delegada(nid text, nota text default '') returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare t crm_giwa.tareas; chat text; cli text; txt text;
begin
  if not crm_giwa.es_equipo() then return; end if;
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return; end if;
  select * into t from crm_giwa.tareas where id = trim(nid);
  if not found then return; end if;
  select u.telegram into chat from crm_giwa.usuarios u
   where crm_giwa.norm_mail(u.mail) = split_part(crm_giwa.norm_mails(t.responsable), ', ', 1) and coalesce(u.telegram, '') <> '' limit 1;
  if chat is null then return; end if;
  select e.nombre into cli from crm_giwa.empresas e where e.id = t.cliente;
  txt := '<b>Te delegaron ' || case when coalesce(t.tipo, '') ~* 'administr' then 'un recordatorio' else 'una tarea' end || '</b>' || E'\n' ||
         crm_giwa._tg_esc(crm_giwa.nombre_usuario(crm_giwa.mi_mail())) || ' te pasó: ' || crm_giwa._tg_esc(t.titulo) ||
         case when coalesce(cli, '') <> '' then ' · ' || crm_giwa._tg_esc(cli) else '' end ||
         case when t.vencimiento is not null then E'\n' || 'Vence ' || to_char(t.vencimiento, 'DD/MM/YYYY') else '' end ||
         case when trim(coalesce(nota, '')) <> '' then E'\n' || 'Motivo: ' || crm_giwa._tg_esc(trim(nota)) else '' end ||
         E'\n' || 'Tarea ' || t.id;
  perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', chat, 'parse_mode', 'HTML', 'text', txt), 'delegada', t.responsable);
exception when others then return;   -- el aviso nunca frena la delegación
end $$;

-- ── 2 · Quién crea recordatorios ───────────────────────────────────────
create or replace function crm_giwa.sincronizar_alertas_facturacion() returns jsonb
language plpgsql as $$
declare x record; cerradas int := 0;
begin
  -- ya no queda nada para facturar de ese desarrollo: la alerta se cierra. No crea (29/10/2026).
  for x in select r.id, r.item from crm_giwa.v_reglas_facturacion r
           where r.item not in (select item_id from crm_giwa.v_facturar_mensuales union select item_id from crm_giwa.v_facturar_saldos) loop
    update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = x.id;
    perform crm_giwa._comentar_tarea(x.id, 'Cerrada: no queda nada para facturar de ' || x.item || '.');
    cerradas := cerradas + 1;
  end loop;
  return jsonb_build_object('ok', true, 'creadas', 0, 'cerradas', cerradas);
end $$;

create or replace function crm_giwa.accion_desarrollo(did text, accion text) returns jsonb
language plpgsql as $$
declare
  d     crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  can   text := crm_giwa.estado_canonico(d.estado_id);
  mant  boolean := crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id);
  desde text[]; nuevo text; tabla text[]; fact jsonb; rec jsonb;
begin
  case accion
    when 'arrancar' then nuevo := crm_giwa.estado_des('curso');      desde := array['aprobada'];
    when 'entregar' then nuevo := crm_giwa.estado_des('garantia');   desde := case when mant then '{}'::text[] else array['curso'] end;
    when 'cerrar'   then nuevo := crm_giwa.estado_des('finalizada'); desde := case when mant then array['curso','garantia'] else array['garantia'] end;
    when 'rechazar' then
      nuevo := crm_giwa.estado_des('rechazada'); desde := array['nueva','aprobada'];
      select array_agg(crm_giwa.estado_canonico(id)) into tabla from crm_giwa.desarrollo_estados where rechazar;
      if coalesce(array_length(tabla, 1), 0) > 0 then desde := tabla; end if;
    else raise exception 'Acción desconocida: %', accion;
  end case;
  if not (can = any (desde)) then
    raise exception 'No se puede "%" un % que está en %', accion, case when mant then 'mantenimiento' else 'desarrollo' end,
      coalesce(nullif(d.estado_id, ''), 'sin estado');
  end if;
  update crm_giwa.desarrollos set
    estado_id    = nuevo,
    fecha_inicio = case when accion = 'arrancar' and fecha_inicio is null then crm_giwa.hoy() else fecha_inicio end,
    fecha_fin    = case when accion = 'entregar' then crm_giwa.hoy() else fecha_fin end
  where id = d.id;
  -- las de Facturación que ya no corresponden se cierran siempre;
  -- los recordatorios del desarrollo nacen sólo al arrancarlo (29/10/2026)
  fact := crm_giwa.sincronizar_alertas_facturacion();
  if accion = 'arrancar' then rec := crm_giwa.crear_recordatorios('{}', d.id); end if;
  return jsonb_build_object('ok', true, 'id', d.id, 'de', d.estado_id, 'a', nuevo, 'proy_id', d.proyecto_id,
                            'alertas_facturacion', jsonb_build_object('creadas', coalesce(rec -> 'creadas', '0'), 'cerradas', fact -> 'cerradas'));
end $$;

-- ── 3 · Una fila abierta por clave ─────────────────────────────────────
create or replace function crm_giwa._tarea_unica() returns trigger
language plpgsql security definer set search_path = crm_giwa, public as $$
declare cat text; item text; otra text;
begin
  if crm_giwa.canon_tarea(new.estado) in ('finalizada', 'cancelada') then return new; end if;
  if coalesce(new.tipo, '') ~* 'administr' then
    cat := crm_giwa.cat_admin(new.titulo, new.alerta_tipo);
    item := (crm_giwa.refs_tarea(new.proyecto_id, new.desarrollo_id)).iids[1];
    if item is null then return new; end if;
    select t.id into otra from crm_giwa.tareas t
     where t.id <> new.id and coalesce(t.tipo, '') ~* 'administr' and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada')
       and crm_giwa.cat_admin(t.titulo, t.alerta_tipo) = cat and (crm_giwa.refs_tarea(t.proyecto_id, t.desarrollo_id)).iids[1] = item limit 1;
    if otra is not null then raise exception 'Ya hay un recordatorio abierto de % para % (%).', cat, item, otra; end if;
  elsif coalesce(new.tipo, '') ~* 'reuni' and coalesce(new.frecuencia, '') ~* 'mensual' and coalesce(new.cliente, '') <> '' then
    select t.id into otra from crm_giwa.tareas t
     where t.id <> new.id and coalesce(t.tipo, '') ~* 'reuni' and coalesce(t.frecuencia, '') ~* 'mensual'
       and crm_giwa.canon_tarea(t.estado) not in ('finalizada', 'cancelada') and t.cliente = new.cliente limit 1;
    if otra is not null then raise exception 'El cliente ya tiene una reunión mensual abierta (%).', otra; end if;
  end if;
  return new;
end $$;

drop trigger if exists tareas_unica on crm_giwa.tareas;
create trigger tareas_unica before insert or update of estado, tipo, titulo, alerta_tipo, proyecto_id, desarrollo_id, cliente, frecuencia
  on crm_giwa.tareas for each row execute function crm_giwa._tarea_unica();

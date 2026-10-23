-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · acciones sobre tareas · etapa 3a · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Las de Tareas.gs, con los mismos mensajes y reglas:
--   comentar(p)                      addComment
--   finalizar_tarea(id, nota)        finishTask (reunión recurrente: pasa a la próxima)
--   procesar_alerta(id, nota)        processAlert (próximo aviso o regla terminada)
--   posponer_tarea(id, fecha)        posponerTarea
--   posponer_alerta(id, fecha, nota) posponerAlerta
--   delegar_tarea(id, a, nota)       delegateTask (nueva tarea; la original se cierra)
--   recordatorio_tarea(id, fecha, telegram)  setTaskReminder
--   nueva_tarea(p)                   saveTask
-- Cada una es todo o nada. Un solo responsable por tarea (regla del 20/10):
-- si llegan varios mails queda el primero; si no llega ninguno, quien la crea.
-- Pendientes para la 2ª tanda: saveAlertRule y saveMeeting (Calendar).
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── el mail de quien llama ──
create or replace function crm_giwa.mi_mail() returns text
language sql stable as $$
  select crm_giwa.norm_mail(current_setting('request.jwt.claims', true)::jsonb ->> 'email')
$$;

-- ── nombre de un usuario del equipo (_userName) ──
create or replace function crm_giwa.nombre_usuario(m text) returns text
language sql stable as $$
  select coalesce((select nullif(trim(u.nombre), '') from crm_giwa.usuarios u
                   where u.es_giwa and crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(m) limit 1),
                  split_part(crm_giwa.norm_mail(m), '@', 1))
$$;

-- ── próxima fecha según la frecuencia (_nextDue); Única o vacía = null ──
create or replace function crm_giwa.proxima_fecha(d date, frecuencia text) returns date
language sql immutable as $$
  select case
    when crm_giwa.norm(frecuencia) = '' or crm_giwa.norm(frecuencia) ~ 'unic' then null
    when crm_giwa.norm(frecuencia) ~ 'quincen' then d + 15
    when crm_giwa.norm(frecuencia) ~ 'seman'   then d + 7
    when crm_giwa.norm(frecuencia) ~ 'trimes'  then (d + interval '3 months')::date
    when crm_giwa.norm(frecuencia) ~ 'semes'   then (d + interval '6 months')::date
    when crm_giwa.norm(frecuencia) ~ 'anual'   then (d + interval '1 year')::date
    else (d + interval '1 month')::date end
$$;

-- ── la tarea, o error (_taskRow) ──
create or replace function crm_giwa._tarea(tid text) returns crm_giwa.tareas
language plpgsql stable as $$
declare t crm_giwa.tareas;
begin
  select * into t from crm_giwa.tareas where id = trim(tid);
  if not found then raise exception 'No encontré %', tid; end if;
  return t;
end $$;

create or replace function crm_giwa._es_responsable(t crm_giwa.tareas) returns boolean
language sql stable as $$
  select crm_giwa.mi_mail() = any (string_to_array(crm_giwa.norm_mails(t.responsable), ', '))
$$;

-- ── un comentario (addComment) ──
-- p = { tarea_id, proyecto_id, desarrollo_id, empresa_id, contacto_id, texto, estado }
create or replace function crm_giwa.comentar(p jsonb) returns jsonb
language plpgsql volatile as $$
declare
  txt text := trim(coalesce(p ->> 'texto', ''));
  tid text := nullif(trim(p ->> 'tarea_id'), '');
  pid text := nullif(trim(p ->> 'proyecto_id'), '');
  iid text := nullif(trim(p ->> 'desarrollo_id'), '');
  cid text := nullif(trim(p ->> 'empresa_id'), '');
  kid text := nullif(trim(p ->> 'contacto_id'), '');
  t   crm_giwa.tareas;
  nid text;
begin
  if txt = '' then raise exception 'El comentario está vacío.'; end if;
  if tid is not null and (pid is null or cid is null) then
    select * into t from crm_giwa.tareas where id = tid;
    if found then
      pid := coalesce(pid, nullif(trim(t.proyecto_id), ''));
      iid := coalesce(iid, nullif(trim(t.desarrollo_id), ''));
      cid := coalesce(cid, nullif(trim(t.cliente), ''));
    end if;
  end if;
  if cid is null and pid is not null then
    select empresa_id into cid from crm_giwa.proyectos where id = trim(split_part(pid, ',', 1));
  end if;
  if tid is null and pid is null and iid is null and cid is null and kid is null then
    raise exception 'El comentario no está atado a nada.';
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  nid := crm_giwa.proximo_id('N', 'comentarios', 4);
  insert into crm_giwa.comentarios (id, tarea_id, proyecto_id, desarrollo_id, empresa_id, contacto_id, texto, fecha, estado, creador)
  values (nid, tid, pid, iid, cid, kid, txt, crm_giwa.hoy(), coalesce(nullif(trim(p ->> 'estado'), ''), 'Normal'), crm_giwa.mi_mail());
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function crm_giwa._comentar_tarea(tid text, txt text) returns void
language sql volatile as $$
  select crm_giwa.comentar(jsonb_build_object('tarea_id', tid, 'texto', txt))
$$;

-- ── finalizar (finishTask) ──
create or replace function crm_giwa.finalizar_tarea(tid text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare
  t crm_giwa.tareas := crm_giwa._tarea(tid);
  n text := trim(coalesce(nota, ''));
  due date; nxt date;
begin
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if not crm_giwa._es_responsable(t) then raise exception 'Solo el responsable puede finalizarla. Podés dejar un comentario.'; end if;
  if coalesce(t.tipo, '') ~* 'reuni' and crm_giwa.norm(t.frecuencia) <> '' and crm_giwa.norm(t.frecuencia) !~ 'unica' then
    due := coalesce(t.vencimiento, crm_giwa.hoy());
    nxt := crm_giwa.proxima_fecha(due, t.frecuencia);
    update crm_giwa.tareas set vencimiento = nxt, enviada = false where id = t.id;
    perform crm_giwa._comentar_tarea(t.id, 'Hecha (' || due || ')' || case when n <> '' then ': ' || n else '' end || '. Próxima: ' || nxt);
    return jsonb_build_object('ok', true, 'id', t.id, 'next', nxt);
  end if;
  update crm_giwa.tareas set estado = 'Finalizada' where id = t.id;
  perform crm_giwa._comentar_tarea(t.id, 'Finalizada' || case when n <> '' then ': ' || n else '' end);
  return jsonb_build_object('ok', true, 'id', t.id);
end $$;

-- ── procesar una alerta (processAlert) ──
create or replace function crm_giwa.procesar_alerta(tid text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare
  t crm_giwa.tareas := crm_giwa._tarea(tid);
  n text := trim(coalesce(nota, ''));
  due date; nxt date; fin date; cierra boolean;
begin
  if coalesce(t.tipo, '') !~* 'administr' then raise exception '% no es una alerta.', t.id; end if;
  due := coalesce(t.vencimiento, crm_giwa.hoy());
  nxt := crm_giwa.proxima_fecha(due, t.frecuencia);
  fin := coalesce(t.fin, case when t.fecha_creacion is not null and coalesce(t.duracion, 0) <> 0
                              then (t.fecha_creacion + make_interval(months => t.duracion::int))::date end);
  cierra := nxt is null or (fin is not null and nxt > fin);
  if cierra then
    update crm_giwa.tareas set estado = 'Finalizada', enviada = true where id = t.id;
  else
    update crm_giwa.tareas set estado = 'En progreso', enviada = false, vencimiento = nxt where id = t.id;
  end if;
  perform crm_giwa._comentar_tarea(t.id, 'Procesada (' || due || ')' || case when n <> '' then ': ' || n else '' end ||
    case when cierra then ' · regla terminada' else ' · próxima ' || nxt end);
  return jsonb_build_object('ok', true, 'id', t.id, 'next', case when cierra then '' else nxt::text end, 'closed', cierra);
end $$;

-- ── posponer (posponerTarea / posponerAlerta) ──
create or replace function crm_giwa.posponer_tarea(tid text, fecha date) returns jsonb
language plpgsql volatile as $$
begin
  if fecha is null then raise exception 'Falta la fecha'; end if;
  update crm_giwa.tareas set vencimiento = fecha where id = trim(tid);
  if not found then raise exception 'Tarea no encontrada'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.posponer_alerta(tid text, fecha date, nota text default '') returns jsonb
language plpgsql volatile as $$
begin
  update crm_giwa.tareas set
    estado = 'Pospuesta',
    vencimiento = coalesce(fecha, vencimiento),
    descripcion = case when nullif(trim(coalesce(nota, '')), '') is null then descripcion
                       else coalesce(nullif(descripcion, '') || E'\n', '') || '↪ Pospuesta a ' || coalesce(fecha::text, '') || ': ' || nota end
  where id = trim(tid);
  if not found then raise exception 'Aviso no encontrado'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── alta de una tarea (_appendTask) ──
create or replace function crm_giwa._alta_tarea(o jsonb) returns text
language plpgsql volatile as $$
declare
  tipo  text := coalesce(nullif(trim(o ->> 'type'), ''), 'Tarea');
  adm   boolean := tipo ~* 'administr';
  pids  text := array_to_string(crm_giwa.lista_csv(o ->> 'projectId'), ', ');
  cid   text := nullif(trim(o ->> 'clientId'), '');
  resp  text := split_part(crm_giwa.norm_mails(o ->> 'assignees'), ', ', 1);
  canal text := '';
  frec  text := nullif(trim(o ->> 'frequency'), '');
  nid   text;
  cfg   text;
begin
  if cid is null and pids <> '' then
    select empresa_id into cid from crm_giwa.proyectos where id = split_part(pids, ', ', 1);
  end if;
  if resp = '' then resp := crm_giwa.mi_mail(); end if;               -- un solo responsable
  if adm then
    select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_CanalEnvio';
    canal := coalesce((select x from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'intern' limit 1), 'interno') || ', ' ||
             coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'telegram' limit 1), 'telegram');
    canal := trim(canal);
  elsif frec is null then
    select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_Frecuencia';
    frec := (select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where crm_giwa.norm(trim(x)) = 'unica' limit 1);
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_giwa.ids'));
  nid := crm_giwa.proximo_id('T', 'tareas', 4);
  insert into crm_giwa.tareas (id, proyecto_id, desarrollo_id, cliente, tipo, titulo, descripcion, responsable, prioridad,
                               estado, fecha_creacion, vencimiento, frecuencia, recordatorio, canal_envio, enviada,
                               origen, contactos, alerta_tipo, creador)
  values (nid, nullif(pids, ''), nullif(array_to_string(crm_giwa.lista_csv(o ->> 'itemIds'), ', '), ''), cid, tipo,
          trim(coalesce(o ->> 'title', '')), trim(coalesce(o ->> 'detail', '')), resp,
          coalesce(nullif(trim(o ->> 'priority'), ''), 'Media'), 'Nueva', crm_giwa.hoy(), nullif(o ->> 'due', '')::date,
          frec, case when adm then (select coalesce(nullif(crm_giwa.num(valor), 0), 5)::text from crm_giwa.cot_config where clave = 'Tarea_Recordatorio' union all select '5' limit 1) end,
          nullif(canal, ''), false, nullif(trim(o ->> 'origin'), ''),
          nullif(array_to_string(crm_giwa.lista_csv(o ->> 'contacts'), ', '), ''), nullif(trim(o ->> 'alertType'), ''), crm_giwa.mi_mail());
  return nid;
end $$;

-- ── nueva tarea (saveTask) · p = { title, detail, projectId, clientId, priority, assignees, due } ──
create or replace function crm_giwa.nueva_tarea(p jsonb) returns jsonb
language plpgsql volatile as $$
declare nid text;
begin
  if trim(coalesce(p ->> 'title', '')) = '' then raise exception 'Falta «Qué hay que hacer».'; end if;
  if trim(coalesce(p ->> 'detail', '')) = '' then raise exception 'Falta el detalle.'; end if;
  nid := crm_giwa._alta_tarea(jsonb_build_object(
    'type', 'Tarea', 'title', p ->> 'title', 'detail', p ->> 'detail', 'projectId', p ->> 'projectId',
    'clientId', p ->> 'clientId', 'itemIds', '', 'priority', p ->> 'priority', 'assignees', p ->> 'assignees',
    'due', coalesce(nullif(p ->> 'due', ''), (crm_giwa.hoy() + 7)::text)));
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- ── delegar (delegateTask) ──
create or replace function crm_giwa.delegar_tarea(tid text, a text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare
  t   crm_giwa.tareas := crm_giwa._tarea(tid);
  dst text := split_part(crm_giwa.norm_mails(a), ', ', 1);
  n   text := trim(coalesce(nota, ''));
  nid text; hist text;
begin
  if dst = '' then raise exception 'Elegí a quién se la delegás.'; end if;
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if not crm_giwa._es_responsable(t) then raise exception 'Solo el responsable puede delegarla. Podés dejar un comentario.'; end if;
  nid := crm_giwa._alta_tarea(jsonb_build_object(
    'type', coalesce(nullif(t.tipo, ''), 'Tarea'), 'title', t.titulo, 'detail', t.descripcion, 'projectId', t.proyecto_id,
    'clientId', t.cliente, 'itemIds', t.desarrollo_id, 'priority', t.prioridad, 'assignees', dst,
    'due', coalesce(t.vencimiento, crm_giwa.hoy() + 7)::text, 'origin', t.id, 'contacts', t.contactos));
  update crm_giwa.tareas set estado = 'Finalizada' where id = t.id;
  hist := crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' la delegó a ' || crm_giwa.nombre_usuario(dst) ||
          case when n <> '' then ': ' || n else '' end;
  perform crm_giwa._comentar_tarea(t.id, 'Delegada → ' || nid || '. ' || hist);
  perform crm_giwa._comentar_tarea(nid, 'Viene de ' || t.id || '. ' || hist);
  return jsonb_build_object('ok', true, 'id', nid, 'from', t.id);
end $$;

-- ── recordatorio de una tarea (setTaskReminder) ──
create or replace function crm_giwa.recordatorio_tarea(tid text, fecha date, telegram boolean default false) returns jsonb
language plpgsql volatile as $$
declare
  t   crm_giwa.tareas;
  cfg text; canal text;
begin
  if fecha is null then raise exception 'Elegí la fecha del recordatorio.'; end if;
  if fecha < crm_giwa.hoy() then raise exception 'La fecha ya pasó.'; end if;
  t := crm_giwa._tarea(tid);
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if coalesce(t.tipo, '') ~* '(administr|reuni)' then raise exception 'Este recordatorio es solo para tareas.'; end if;
  if not crm_giwa._es_responsable(t) then raise exception 'Solo el responsable puede ponerle un recordatorio.'; end if;
  select valor into cfg from crm_giwa.cot_config where clave = 'Tarea_CanalEnvio';
  canal := coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'intern' limit 1), 'interno');
  if telegram then
    canal := canal || ', ' || coalesce((select trim(x) from unnest(string_to_array(coalesce(cfg, ''), ',')) x where x ~* 'telegram' limit 1), 'telegram');
  end if;
  update crm_giwa.tareas set vencimiento = fecha, recordatorio = '0', canal_envio = canal, enviada = false where id = t.id;
  return jsonb_build_object('ok', true, 'due', fecha, 'channels', canal);
end $$;

grant execute on function crm_giwa.mi_mail(), crm_giwa.nombre_usuario(text), crm_giwa.proxima_fecha(date, text),
  crm_giwa.comentar(jsonb), crm_giwa.finalizar_tarea(text, text), crm_giwa.procesar_alerta(text, text),
  crm_giwa.posponer_tarea(text, date), crm_giwa.posponer_alerta(text, date, text), crm_giwa.nueva_tarea(jsonb),
  crm_giwa.delegar_tarea(text, text, text), crm_giwa.recordatorio_tarea(text, date, boolean) to authenticated;
revoke execute on function crm_giwa._tarea(text), crm_giwa._es_responsable(crm_giwa.tareas),
  crm_giwa._comentar_tarea(text, text), crm_giwa._alta_tarea(jsonb) from public, anon;
grant execute on function crm_giwa._tarea(text), crm_giwa._es_responsable(crm_giwa.tareas),
  crm_giwa._comentar_tarea(text, text), crm_giwa._alta_tarea(jsonb) to authenticated;

reset role;

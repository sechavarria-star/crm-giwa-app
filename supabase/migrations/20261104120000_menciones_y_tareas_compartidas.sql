-- Menciones con @ y tareas compartidas (04/11/2026).
-- Una tarea compartida es UN registro: tareas.responsable con varios mails (ya lo soportaban v_tareas y _es_responsable).
-- Las menciones se leen del texto en comentar(), un solo lugar, y quedan vinculadas al usuario.
-- Los avisos salen todos por _tg_avisar.
set role crm_giwa_dev;

create table if not exists crm_giwa.comentario_menciones (
  id            bigint generated always as identity primary key,   -- admin_relaciones pide «id»
  comentario_id text not null references crm_giwa.comentarios(id) on delete cascade,
  mail          text not null,
  leida         timestamptz,
  creado        timestamptz not null default now(),
  unique (comentario_id, mail));
create index if not exists comentario_menciones_mail on crm_giwa.comentario_menciones(mail);
alter table crm_giwa.comentario_menciones enable row level security;
drop policy if exists equipo on crm_giwa.comentario_menciones;
create policy equipo on crm_giwa.comentario_menciones for all to authenticated
  using ((select crm_giwa.es_equipo())) with check ((select crm_giwa.es_equipo()));
grant select, insert, update on crm_giwa.comentario_menciones to authenticated;

-- tareas.responsable pasa a admitir varios mails. La clave foránea exigía uno solo:
-- la reemplaza un trigger con la misma validación, mail por mail.
alter table crm_giwa.tareas drop constraint if exists tareas_responsable_fkey;
create or replace function crm_giwa._tarea_responsables_ok() returns trigger
language plpgsql as $$
declare malo text;
begin
  select x into malo from unnest(string_to_array(crm_giwa.norm_mails(new.responsable), ', ')) x
   where not exists (select 1 from crm_giwa.usuarios u where crm_giwa.norm_mail(u.mail) = x) limit 1;
  if malo is not null then raise exception 'El usuario % no existe.', malo; end if;
  return new;
end $$;
drop trigger if exists tareas_responsables_ok on crm_giwa.tareas;
create trigger tareas_responsables_ok before insert or update of responsable on crm_giwa.tareas
  for each row execute function crm_giwa._tarea_responsables_ok();

-- El aviso central por Telegram: una vez por persona y nunca a quien lo generó. Si falla, no frena la acción.
create or replace function crm_giwa._tg_avisar(mails text[], txt text, tipo text) returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record;
begin
  if not crm_giwa.es_equipo() then return; end if;
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return; end if;
  for u in select distinct crm_giwa.norm_mail(mail) mail, telegram from crm_giwa.usuarios
            where crm_giwa.norm_mail(mail) = any (mails) and crm_giwa.norm_mail(mail) <> coalesce(crm_giwa.mi_mail(), '') and coalesce(telegram, '') <> '' loop
    perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', u.telegram, 'parse_mode', 'HTML', 'text', txt), tipo, u.mail);
  end loop;
exception when others then return;
end $$;

create or replace function crm_giwa._tg_aviso_delegada(nid text, nota text default '') returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare t crm_giwa.tareas; cli text; txt text;
begin
  select * into t from crm_giwa.tareas where id = trim(nid);
  if not found then return; end if;
  select e.nombre into cli from crm_giwa.empresas e where e.id = t.cliente;
  txt := '<b>Te delegaron ' || case when coalesce(t.tipo, '') ~* 'administr' then 'un recordatorio' else 'una tarea' end || '</b>' || E'\n' ||
         crm_giwa._tg_esc(crm_giwa.nombre_usuario(crm_giwa.mi_mail())) || ' te pasó: ' || crm_giwa._tg_esc(t.titulo) ||
         case when coalesce(cli, '') <> '' then ' · ' || crm_giwa._tg_esc(cli) else '' end ||
         case when t.vencimiento is not null then E'\n' || 'Vence ' || to_char(t.vencimiento, 'DD/MM/YYYY') else '' end ||
         case when trim(coalesce(nota, '')) <> '' then E'\n' || 'Motivo: ' || crm_giwa._tg_esc(trim(nota)) else '' end ||
         E'\n' || 'Tarea ' || t.id;
  perform crm_giwa._tg_avisar(string_to_array(crm_giwa.norm_mails(t.responsable), ', '), txt, 'delegada');
end $$;

-- Quién quedó mencionado en un comentario de tarea: @Nombre de un usuario activo de GIWA, salvo quien escribe
create or replace function crm_giwa._registrar_menciones(cid text, tid text, txt text) returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare u record; t crm_giwa.tareas; nuevos text[] := '{}'; yo text := coalesce(crm_giwa.mi_mail(), ''); n int;
begin
  if position('@' in txt) = 0 or not crm_giwa.es_equipo() then return; end if;
  select * into t from crm_giwa.tareas where id = tid;
  if not found then return; end if;
  for u in select distinct crm_giwa.norm_mail(mail) mail from crm_giwa.usuarios
            where es_giwa and activo and coalesce(trim(nombre), '') <> '' and crm_giwa.norm_mail(mail) <> yo
              and txt ~* ('(^|[[:space:]])@' || regexp_replace(trim(nombre), '([^[:alnum:] ])', '\\\1', 'g') || '($|[^[:alnum:]])') loop
    insert into crm_giwa.comentario_menciones(comentario_id, mail) values (cid, u.mail) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then nuevos := nuevos || u.mail; end if;
  end loop;
  if cardinality(nuevos) > 0 then
    perform crm_giwa._tg_avisar(nuevos, '<b>Te mencionaron</b>' || E'\n' || crm_giwa._tg_esc(crm_giwa.nombre_usuario(yo)) || ' en: ' || crm_giwa._tg_esc(t.titulo) ||
      E'\n' || crm_giwa._tg_esc(left(txt, 300)) || E'\n' || 'Tarea ' || t.id, 'mencion');
  end if;
end $$;

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
  if tid is not null then perform crm_giwa._registrar_menciones(nid, tid, txt); end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- Las menciones del usuario actual, para Hoy
create or replace view crm_giwa.v_mis_menciones with (security_invoker = true) as
select m.id, m.leida, c.id as comentario_id, c.tarea_id, t.titulo, c.creador, c.texto, c.creado
  from crm_giwa.comentario_menciones m
  join crm_giwa.comentarios c on c.id = m.comentario_id
  join crm_giwa.tareas t on t.id = c.tarea_id
 where m.mail = crm_giwa.mi_mail();
grant select on crm_giwa.v_mis_menciones to authenticated;

create or replace function crm_giwa.menciones_leer(tid text) returns void
language sql volatile as $$
  update crm_giwa.comentario_menciones set leida = now()
   where leida is null and mail = crm_giwa.mi_mail() and comentario_id in (select id from crm_giwa.comentarios where tarea_id = trim(tid));
$$;

-- Tarea nueva con varios responsables; los recordatorios siguen naciendo con uno
do $$
declare o text; n text;
begin
  select pg_get_functiondef(p.oid) into o from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'crm_giwa' and p.proname = '_alta_tarea';
  n := replace(o, 'resp  text := split_part(crm_giwa.norm_mails(o ->> ''assignees''), '', '', 1);',
                  'resp  text := case when adm then split_part(crm_giwa.norm_mails(o ->> ''assignees''), '', '', 1) else crm_giwa.norm_mails(o ->> ''assignees'') end;');
  if n = o then raise exception 'No encontré el responsable en _alta_tarea'; end if;
  n := replace(n, '-- un solo responsable', '');
  execute n;
end $$;

-- Delegar a uno o a varios: siempre la misma fila
create or replace function crm_giwa.delegar_tarea(tid text, a text, nota text default '') returns jsonb
language plpgsql volatile as $$
declare
  t   crm_giwa.tareas := crm_giwa._tarea(tid);
  dst text := crm_giwa.norm_mails(a);
  n   text := trim(coalesce(nota, ''));
begin
  if dst = '' then raise exception 'Elegí a quién se la delegás.'; end if;
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if not crm_giwa._es_responsable(t) then raise exception 'Solo el responsable puede delegarla. Podés dejar un comentario.'; end if;
  update crm_giwa.tareas set responsable = dst where id = t.id;
  perform crm_giwa._comentar_tarea(t.id, crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' la delegó a ' ||
    (select string_agg(crm_giwa.nombre_usuario(x), ', ') from unnest(string_to_array(dst, ', ')) x) || case when n <> '' then ': ' || n else '' end);
  perform crm_giwa._tg_aviso_delegada(t.id, n);
  return jsonb_build_object('ok', true, 'id', t.id, 'from', t.id);
end $$;

-- Participantes de una tarea: los cambia quien participa o quien la creó
create or replace function crm_giwa.asignar_tarea(tid text, mails text) returns jsonb
language plpgsql volatile as $$
declare
  t crm_giwa.tareas := crm_giwa._tarea(tid);
  dst text := crm_giwa.norm_mails(mails);
  antes text[] := string_to_array(crm_giwa.norm_mails(t.responsable), ', ');
  ahora text[] := string_to_array(dst, ', ');
  sumados text[];
begin
  if dst = '' then raise exception 'Elegí al menos una persona.'; end if;
  if crm_giwa.canon_tarea(t.estado) in ('finalizada', 'cancelada') then raise exception 'La tarea ya está cerrada.'; end if;
  if coalesce(t.tipo, '') ~* 'administr' then raise exception 'Los recordatorios se delegan.'; end if;
  if not crm_giwa._es_responsable(t) and crm_giwa.norm_mail(t.creador) <> crm_giwa.mi_mail() then
    raise exception 'Solo quien participa o quien la creó puede cambiar los participantes.';
  end if;
  if dst = crm_giwa.norm_mails(t.responsable) then return jsonb_build_object('ok', true, 'id', t.id, 'cambio', false); end if;
  update crm_giwa.tareas set responsable = dst where id = t.id;
  perform crm_giwa._comentar_tarea(t.id, crm_giwa.nombre_usuario(crm_giwa.mi_mail()) || ' cambió los participantes: ' ||
    (select string_agg(crm_giwa.nombre_usuario(x), ', ') from unnest(ahora) x));
  select coalesce(array_agg(x), '{}') into sumados from unnest(ahora) x where not (x = any (coalesce(antes, '{}')));
  perform crm_giwa._tg_avisar(sumados, '<b>Te sumaron a una tarea</b>' || E'\n' || crm_giwa._tg_esc(crm_giwa.nombre_usuario(crm_giwa.mi_mail())) || ': ' || crm_giwa._tg_esc(t.titulo) || E'\n' || 'Tarea ' || t.id, 'participante');
  return jsonb_build_object('ok', true, 'id', t.id, 'cambio', true);
end $$;

grant execute on function crm_giwa._tg_avisar(text[], text, text), crm_giwa._registrar_menciones(text, text, text),
  crm_giwa.menciones_leer(text), crm_giwa.asignar_tarea(text, text) to authenticated;

reset role;

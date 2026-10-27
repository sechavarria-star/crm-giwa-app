-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · aviso por Telegram al delegar una tarea · 27/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- _tg_aviso_delegada(nid): le manda al nuevo responsable un mensaje con la
-- tarea que le delegaron (quién, qué, cliente, vence y el motivo si hubo).
-- Sólo para tareas que vienen de una delegación (origen cargado) y sólo si
-- hay token y el responsable tiene chat. Si Telegram falla, la delegación
-- sigue igual: el aviso nunca la frena. delegar_tarea lo llama al final.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa._tg_aviso_delegada(nid text, nota text default '') returns void
language plpgsql volatile security definer set search_path = crm_giwa, public as $$
declare t crm_giwa.tareas; chat text; cli text; txt text;
begin
  if not crm_giwa.es_equipo() then return; end if;
  if not exists (select 1 from crm_giwa.secretos where clave = 'telegram_bot_token') then return; end if;
  select * into t from crm_giwa.tareas where id = trim(nid);
  if not found or coalesce(t.origen, '') = '' then return; end if;
  select u.telegram into chat from crm_giwa.usuarios u
   where crm_giwa.norm_mail(u.mail) = split_part(crm_giwa.norm_mails(t.responsable), ', ', 1) and coalesce(u.telegram, '') <> '' limit 1;
  if chat is null then return; end if;
  select e.nombre into cli from crm_giwa.empresas e where e.id = t.cliente;
  txt := '<b>Te delegaron una tarea</b>' || E'\n' ||
         crm_giwa._tg_esc(crm_giwa.nombre_usuario(crm_giwa.mi_mail())) || ' te pasó: ' || crm_giwa._tg_esc(t.titulo) ||
         case when coalesce(cli, '') <> '' then ' · ' || crm_giwa._tg_esc(cli) else '' end ||
         case when t.vencimiento is not null then E'\n' || 'Vence ' || to_char(t.vencimiento, 'DD/MM/YYYY') else '' end ||
         case when trim(coalesce(nota, '')) <> '' then E'\n' || 'Motivo: ' || crm_giwa._tg_esc(trim(nota)) else '' end ||
         E'\n' || 'Tarea ' || t.id;
  perform crm_giwa._tg_llamar('sendMessage', jsonb_build_object('chat_id', chat, 'parse_mode', 'HTML', 'text', txt), 'delegada', t.responsable);
exception when others then return;   -- el aviso nunca frena la delegación
end $$;

revoke all on function crm_giwa._tg_aviso_delegada(text, text) from public, anon;
grant execute on function crm_giwa._tg_aviso_delegada(text, text) to authenticated;

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
  perform crm_giwa._tg_aviso_delegada(nid, n);   -- 27/10/2026 · aviso por Telegram al nuevo responsable
  return jsonb_build_object('ok', true, 'id', nid, 'from', t.id);
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 3: lo que hace el equipo desde el CRM · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Mismas reglas que soporte-gs (Api.gs / Tablero.gs). Corren con el usuario
-- que llama (no SECURITY DEFINER): RLS ya deja al equipo y a nadie más.
--   soporte_crear(p)            _crearSolicitud_ desde GIWA: cualquier empresa, tipos de GIWA,
--                               canal y solicitante; opcional cargar ya la respuesta, horas y cerrarlo
--   soporte_nota(p)             _agregarNota_: respuesta o nota interna, con horas y fecha de trabajo
--   soporte_actualizar(tid, c)  _actualizarSolicitud_: estado (no Cerrado), prioridad, responsable,
--                               tipo, síntoma, categoría, módulo, vence, título, tarifa, desarrollo
--                               (sólo si no tenía) y clasificación forzada con motivo
--   soporte_resolver(p)         _resolver_: pide cómo se resolvió; horas finales opcionales. Después, sólo lectura
--   soporte_relacionado(p)      _relacionado_: el problema volvió, ticket nuevo vinculado al cerrado
--   soporte_adjunto(p)          registra un archivo que el equipo subió a Storage
-- Mails (avisar al cliente): etapa 6.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa._soporte_equipo() returns void
language plpgsql stable as $$
begin
  if not crm_giwa.es_equipo() then raise exception 'Soporte es del equipo de GIWA.'; end if;
end $$;

create or replace function crm_giwa._soporte_nuevo_id(prefijo text, digitos int) returns text
language plpgsql volatile as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('crm_giwa.soporte_' || prefijo));
  if prefijo = 'TKT' then select max(substring(id from '^TKT-(\d+)$')::int) into n from crm_giwa.soporte_tickets;
  elsif prefijo = 'N' then select max(substring(id from '^N-(\d+)$')::int) into n from crm_giwa.soporte_notas;
  elsif prefijo = 'REP' then select max(substring(id from '^REP-(\d+)$')::int) into n from crm_giwa.soporte_reportes;
  elsif prefijo = 'FAC' then select max(substring(id from '^FAC-(\d+)$')::int) into n from crm_giwa.soporte_facturado;
  else raise exception 'Prefijo desconocido: %', prefijo; end if;
  return prefijo || '-' || lpad((coalesce(n, 0) + 1)::text, digitos, '0');
end $$;

-- un valor de lista, o el de por defecto si no está
create or replace function crm_giwa._soporte_en_lista(v text, clave text, def text) returns text
language sql stable as $$
  select case when v = any (crm_giwa.soporte_lista(clave)) then v else def end
$$;

create or replace function crm_giwa.soporte_crear(p jsonb) returns jsonb
language plpgsql volatile as $$
declare emp text := nullif(trim(p ->> 'empresa_id'), ''); did text := nullif(p ->> 'desarrollo_id', ''); pid text; tid text; cl text;
        titulo text := left(trim(coalesce(p ->> 'titulo', '')), 200); tipo text; h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0);
        resp text := trim(coalesce(p ->> 'respuesta', '')); cerrar boolean := coalesce((p ->> 'resuelto')::boolean, false); rel text;
begin
  perform crm_giwa._soporte_equipo();
  if emp is null or not exists (select 1 from crm_giwa.empresas where id = emp) then raise exception 'Elegí la empresa.'; end if;
  if length(titulo) < 3 then raise exception 'Poné un título.'; end if;
  if did is not null then
    select proyecto_id into pid from crm_giwa.v_soporte_desarrollos where id = did and empresa_id = emp;
    if pid is null then raise exception 'Ese desarrollo no es de la empresa.'; end if;
  end if;
  tipo := coalesce(nullif(p ->> 'tipo', ''), 'Algo no funciona');
  if not (tipo = any (crm_giwa.soporte_lista('Soporte_TipoCliente') || crm_giwa.soporte_lista('Soporte_TipoGiwa'))) then tipo := 'Algo no funciona'; end if;
  if cerrar and length(resp) < 5 then raise exception 'Para cargarlo resuelto, escribí cómo se resolvió.'; end if;
  rel := nullif(p ->> 'relacionado_con', '');
  if rel is not null and not exists (select 1 from crm_giwa.soporte_tickets where id = rel and empresa_id = emp) then rel := null; end if;
  tid := crm_giwa._soporte_nuevo_id('TKT', 4);
  insert into crm_giwa.soporte_tickets (id, empresa_id, proyecto_id, desarrollo_id, tipo, sintoma, categoria, modulo, titulo, descripcion, prioridad,
                                        estado, solicitante, responsable, canal, origen, relacionado_con, resuelto, respuesta_final)
  values (tid, emp, pid, did, tipo, crm_giwa._soporte_en_lista(p ->> 'sintoma', 'Soporte_Sintoma', null),
          crm_giwa._soporte_en_lista(p ->> 'categoria', 'Soporte_Categoria', null), nullif(left(trim(coalesce(p ->> 'modulo', '')), 80), ''),
          titulo, left(coalesce(p ->> 'descripcion', ''), 20000), crm_giwa._soporte_en_lista(p ->> 'prioridad', 'Soporte_Prioridad', 'Media'),
          case when cerrar then 'Cerrado' else 'Nuevo' end, coalesce(crm_giwa.norm_mail(nullif(p ->> 'solicitante', '')), crm_giwa.mi_mail()),
          crm_giwa.mi_mail(), crm_giwa._soporte_en_lista(p ->> 'canal', 'Soporte_Canal', 'Mail'), 'crm', rel,
          case when cerrar then now() end, case when cerrar then resp end);
  -- lo trabajado va como respuesta de GIWA con sus horas: así suma igual que cualquier otra
  if h is not null or resp <> '' then
    insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
    values (crm_giwa._soporte_nuevo_id('N', 5), tid, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()),
            crm_giwa.mi_mail(), coalesce(nullif(resp, ''), 'Trabajo realizado.'), false, h, 'crm');
  end if;
  select clasificacion into cl from crm_giwa.v_soporte_clasif where ticket_id = tid;
  if cl = 'A cotizar' then perform crm_giwa._soporte_tarea_cotizar(tid); end if;
  perform crm_giwa.soporte_congelar_tarifas(emp);
  return jsonb_build_object('ok', true, 'id', tid);
end $$;

create or replace function crm_giwa.soporte_nota(p jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets; nid text; texto text := left(trim(coalesce(p ->> 'texto', '')), 20000);
        h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0); interna boolean := coalesce((p ->> 'interna')::boolean, false);
begin
  perform crm_giwa._soporte_equipo();
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id';
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'El ticket está resuelto y es de solo lectura. Si el problema volvió, abrí uno nuevo vinculado.'; end if;
  if h is not null and h < 0 then raise exception 'Las horas no pueden ser negativas.'; end if;
  if texto = '' and h is null and not coalesce((p ->> 'con_adjuntos')::boolean, false) then raise exception 'La respuesta está vacía.'; end if;
  nid := crm_giwa._soporte_nuevo_id('N', 5);
  insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
  values (nid, t.id, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()), crm_giwa.mi_mail(), texto, interna, h, 'crm');
  update crm_giwa.soporte_tickets set actualizado = now(),
         estado = case when not interna and estado = 'Nuevo' then 'En proceso' else estado end,
         responsable = coalesce(responsable, crm_giwa.mi_mail())
   where id = t.id;
  if h is not null then perform crm_giwa.soporte_congelar_tarifas(t.empresa_id); end if;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function crm_giwa.soporte_actualizar(tid text, c jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets; fz text; fm text; pid text; cl text; tarea text;
begin
  perform crm_giwa._soporte_equipo();
  select * into t from crm_giwa.soporte_tickets where id = tid;
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'El ticket está resuelto y es de solo lectura.'; end if;
  if c ->> 'estado' = 'Cerrado' then raise exception 'Para cerrarlo usá «Resolver»: pide cómo se resolvió y las horas.'; end if;
  if c ? 'estado' then t.estado := crm_giwa._soporte_en_lista(c ->> 'estado', 'Soporte_Estado', t.estado); end if;
  if c ? 'prioridad' then t.prioridad := crm_giwa._soporte_en_lista(c ->> 'prioridad', 'Soporte_Prioridad', t.prioridad); end if;
  if c ? 'tipo' then t.tipo := case when c ->> 'tipo' = any (crm_giwa.soporte_lista('Soporte_TipoCliente') || crm_giwa.soporte_lista('Soporte_TipoGiwa')) then c ->> 'tipo' else t.tipo end; end if;
  if c ? 'sintoma' then t.sintoma := crm_giwa._soporte_en_lista(c ->> 'sintoma', 'Soporte_Sintoma', null); end if;
  if c ? 'categoria' then t.categoria := crm_giwa._soporte_en_lista(c ->> 'categoria', 'Soporte_Categoria', null); end if;
  if c ? 'responsable' then t.responsable := crm_giwa.norm_mail(nullif(c ->> 'responsable', '')); end if;
  if c ? 'modulo' then t.modulo := nullif(left(trim(coalesce(c ->> 'modulo', '')), 80), ''); end if;
  if c ? 'vence' then t.vence := nullif(c ->> 'vence', '')::date; end if;
  if c ? 'titulo' and length(trim(coalesce(c ->> 'titulo', ''))) >= 3 then t.titulo := left(trim(c ->> 'titulo'), 200); end if;
  if c ? 'tarifa_hora' and crm_giwa.num(c ->> 'tarifa_hora') > 0 then t.tarifa_hora := crm_giwa.num(c ->> 'tarifa_hora'); end if;
  -- el desarrollo lo eligió quien cargó el ticket: sólo se completa si estaba vacío
  if c ? 'desarrollo_id' and t.desarrollo_id is null and nullif(c ->> 'desarrollo_id', '') is not null then
    select proyecto_id into pid from crm_giwa.v_soporte_desarrollos where id = c ->> 'desarrollo_id' and empresa_id = t.empresa_id;
    if pid is null then raise exception 'Ese desarrollo no es de la empresa.'; end if;
    t.desarrollo_id := c ->> 'desarrollo_id'; t.proyecto_id := pid;
  end if;
  -- forzar la clasificación: con motivo. Vacío = vuelve a la automática.
  if c ? 'clasificacion_forzada' then
    fz := nullif(c ->> 'clasificacion_forzada', ''); fm := left(trim(coalesce(c ->> 'forzada_motivo', '')), 500);
    if fz is not null and not (fz = any (crm_giwa.soporte_lista('Soporte_Clasificacion'))) then raise exception 'Esa clasificación no existe.'; end if;
    if fz is not null and length(fm) < 3 then raise exception 'Para cambiar la clasificación, contá por qué.'; end if;
    t.clasificacion_forzada := fz; t.forzada_motivo := case when fz is null then null else fm end;
  end if;
  update crm_giwa.soporte_tickets set estado = t.estado, prioridad = t.prioridad, tipo = t.tipo, sintoma = t.sintoma, categoria = t.categoria,
         responsable = t.responsable, modulo = t.modulo, vence = t.vence, titulo = t.titulo, tarifa_hora = t.tarifa_hora,
         desarrollo_id = t.desarrollo_id, proyecto_id = t.proyecto_id, clasificacion_forzada = t.clasificacion_forzada,
         forzada_motivo = t.forzada_motivo, actualizado = now()
   where id = tid;
  select clasificacion into cl from crm_giwa.v_soporte_clasif where ticket_id = tid;
  if cl = 'A cotizar' and t.tarea_id is null then tarea := crm_giwa._soporte_tarea_cotizar(tid); end if;
  perform crm_giwa.soporte_congelar_tarifas(t.empresa_id);
  return jsonb_build_object('ok', true, 'tarea_id', tarea);
end $$;

create or replace function crm_giwa.soporte_resolver(p jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets; txt text := trim(coalesce(p ->> 'respuesta', '')); h numeric := nullif(crm_giwa.num(p ->> 'horas'), 0);
begin
  perform crm_giwa._soporte_equipo();
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id';
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  if t.estado = 'Cerrado' then raise exception 'Ya está resuelto.'; end if;
  if length(txt) < 5 then raise exception 'Escribí cómo se resolvió.'; end if;
  if h is not null then
    insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
    values (crm_giwa._soporte_nuevo_id('N', 5), t.id, coalesce(nullif(p ->> 'fecha', '')::date::timestamptz + interval '12 hours', now()),
            crm_giwa.mi_mail(), 'Cierre: ' || txt, false, h, 'crm');
  end if;
  update crm_giwa.soporte_tickets set estado = 'Cerrado', resuelto = now(), respuesta_final = left(txt, 20000), actualizado = now(),
         responsable = coalesce(responsable, crm_giwa.mi_mail())
   where id = t.id;
  perform crm_giwa.soporte_congelar_tarifas(t.empresa_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.soporte_relacionado(p jsonb) returns jsonb
language plpgsql volatile as $$
declare t crm_giwa.soporte_tickets;
begin
  perform crm_giwa._soporte_equipo();
  select * into t from crm_giwa.soporte_tickets where id = p ->> 'ticket_id';
  if t.id is null then raise exception 'No encuentro ese ticket.'; end if;
  return crm_giwa.soporte_crear(jsonb_build_object('empresa_id', t.empresa_id, 'desarrollo_id', t.desarrollo_id, 'tipo', t.tipo, 'sintoma', t.sintoma,
    'modulo', t.modulo, 'prioridad', t.prioridad, 'titulo', left('Vuelve: ' || t.titulo, 200), 'solicitante', t.solicitante, 'canal', t.canal,
    'descripcion', coalesce(nullif(trim(p ->> 'descripcion'), ''), 'Relacionado con ' || t.id || '.'), 'relacionado_con', t.id));
end $$;

create or replace function crm_giwa.soporte_adjunto(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid text := p ->> 'ticket_id'; nid text := nullif(p ->> 'nota_id', ''); ruta text := p ->> 'ruta'; emp text; aid bigint;
begin
  perform crm_giwa._soporte_equipo();
  select empresa_id into emp from crm_giwa.soporte_tickets where id = tid;
  if emp is null then raise exception 'No encuentro ese ticket.'; end if;
  if nid is not null and not exists (select 1 from crm_giwa.soporte_notas where id = nid and ticket_id = tid) then raise exception 'No encuentro esa respuesta.'; end if;
  if ruta is null or split_part(ruta, '/', 1) <> emp or split_part(ruta, '/', 2) <> tid then raise exception 'El archivo no está en la carpeta del ticket.'; end if;
  insert into crm_giwa.soporte_adjuntos (ticket_id, nota_id, nombre, ruta, tipo, bytes, autor)
  values (tid, nid, left(coalesce(nullif(p ->> 'nombre', ''), 'archivo'), 200), ruta, p ->> 'tipo', nullif(p ->> 'bytes', '')::bigint, crm_giwa.mi_mail())
  returning id into aid;
  return jsonb_build_object('ok', true, 'id', aid);
end $$;

grant execute on function crm_giwa._soporte_equipo(), crm_giwa._soporte_nuevo_id(text, int), crm_giwa._soporte_en_lista(text, text, text),
  crm_giwa.soporte_crear(jsonb), crm_giwa.soporte_nota(jsonb), crm_giwa.soporte_actualizar(text, jsonb), crm_giwa.soporte_resolver(jsonb),
  crm_giwa.soporte_relacionado(jsonb), crm_giwa.soporte_adjunto(jsonb) to authenticated, service_role;
-- «A cotizar» desde el equipo: la tarea la crea la función del portal (dueño), también para el equipo
grant execute on function crm_giwa._soporte_tarea_cotizar(text) to authenticated;

reset role;

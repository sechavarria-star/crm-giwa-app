-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · PM: acciones sobre proyectos y desarrollos · etapa 5c · 24/10/2026
-- ──────────────────────────────────────────────────────────────────────
-- Las de Estados.gs / Proyectos.gs, con los mismos mensajes y reglas:
--   accion_desarrollo(id, accion)     accionDesarrollo: arrancar · entregar · cerrar · rechazar
--   detener_desarrollo(id, si)        detenerDesarrollo (marca; el estado no cambia)
--   detener_proyecto(id, si)          detenerProyecto
--   enviar_propuesta(id, fecha)       enviarPropuesta → Negociación
--   aprobar_proyecto(id, decisiones)  aprobarProyecto: {D-…: entro|rechazado|espera}
--   rechazar_proyecto(id)             rechazarProyecto (todos sus desarrollos)
--   finalizar_proyecto(id)            finalizarProyecto (cierra los abiertos)
--   cambiar_estado_proyecto(id, e)    updateProyField('estado_proyecto') con su guarda
--   contactos_proyecto(id, lista)     updateProyField('contactos'): la estrella
--   fecha_desarrollo(id, campo, f)    updateItemField('fecha_ini' | 'fecha_fin')
--   cerrar_modulo_horas(id, cerrar)   cerrarModuloHoras (toda la etapa del desarrollo)
-- Todas son todo o nada.
--
-- LO QUE NO HACEN TODAVÍA: en el Apps Script, arrancar / entregar / rechazar /
-- aprobar además crean en el momento las alertas de Facturación, IPC,
-- Renovación y la reunión mensual (sincronizarAlertasFacturacion y
-- crearRecordatorios). Hasta pasar esa lógica, se crean desde Administración
-- del CRM actual («Faltan recordatorios: Ver y crear»), que las detecta solas.
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

-- ── el nombre del estado de desarrollo tal como está en Desarrollo_Estados
--    (la base exige uno de esos; el Apps Script escribe «Aprobada» y su capa
--    de Supabase lo traduce al de la tabla por su clave canónica) ──
create or replace function crm_giwa.estado_des(canon text) returns text
language sql stable as $$
  select id from crm_giwa.desarrollo_estados where crm_giwa.estado_canonico(id) = canon order by orden limit 1
$$;

-- ── desarrollo / proyecto, o error ──
create or replace function crm_giwa._desarrollo(did text) returns crm_giwa.desarrollos
language plpgsql stable as $$
declare d crm_giwa.desarrollos;
begin
  select * into d from crm_giwa.desarrollos where id = trim(did);
  if not found then raise exception 'No encontré el desarrollo %', did; end if;
  return d;
end $$;

create or replace function crm_giwa._proyecto(pid text) returns crm_giwa.proyectos
language plpgsql stable as $$
declare p crm_giwa.proyectos;
begin
  select * into p from crm_giwa.proyectos where id = trim(pid);
  if not found then raise exception 'No encontré el proyecto'; end if;
  return p;
end $$;

-- ── accionDesarrollo ──
create or replace function crm_giwa.accion_desarrollo(did text, accion text) returns jsonb
language plpgsql volatile as $$
declare
  d     crm_giwa.desarrollos := crm_giwa._desarrollo(did);
  can   text := crm_giwa.estado_canonico(d.estado_id);
  mant  boolean := crm_giwa.es_mantenimiento(d.modelo_pago_id, d.tipo_id);
  desde text[]; nuevo text; tabla text[];
begin
  case accion
    when 'arrancar' then nuevo := crm_giwa.estado_des('curso');    desde := array['aprobada'];
    when 'entregar' then nuevo := crm_giwa.estado_des('garantia'); desde := case when mant then '{}'::text[] else array['curso'] end;
    when 'cerrar'   then nuevo := crm_giwa.estado_des('finalizada');  desde := case when mant then array['curso','garantia'] else array['garantia'] end;
    when 'rechazar' then
      nuevo := crm_giwa.estado_des('rechazada'); desde := array['nueva','aprobada'];
      -- desde dónde se puede rechazar lo dice la columna Rechazar de Desarrollo_Estados
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
  return jsonb_build_object('ok', true, 'id', d.id, 'de', d.estado_id, 'a', nuevo, 'proy_id', d.proyecto_id);
end $$;

create or replace function crm_giwa.detener_desarrollo(did text, detener boolean) returns jsonb
language plpgsql volatile as $$
declare d crm_giwa.desarrollos := crm_giwa._desarrollo(did);
begin
  update crm_giwa.desarrollos set detenido = coalesce(detener, false) where id = d.id;
  return jsonb_build_object('ok', true, 'detenido', coalesce(detener, false));
end $$;

create or replace function crm_giwa.detener_proyecto(pid text, detener boolean) returns jsonb
language plpgsql volatile as $$
declare p crm_giwa.proyectos := crm_giwa._proyecto(pid);
begin
  update crm_giwa.proyectos set detenido = coalesce(detener, false) where id = p.id;
  return jsonb_build_object('ok', true, 'detenido', coalesce(detener, false),
                            'msg', case when detener then 'Proyecto detenido.' else 'Proyecto reanudado.' end);
end $$;

create or replace function crm_giwa.enviar_propuesta(pid text, fecha date default null) returns jsonb
language plpgsql volatile as $$
declare p crm_giwa.proyectos := crm_giwa._proyecto(pid);
begin
  update crm_giwa.proyectos set estado_id = 'Negociación', fecha_propuesta = coalesce(fecha, crm_giwa.hoy()) where id = p.id;
  return jsonb_build_object('ok', true, 'estado', 'Negociación', 'fecha', coalesce(fecha, crm_giwa.hoy()),
                            'msg', 'Propuesta enviada. Los desarrollos siguen en Nueva.');
end $$;

-- decisiones = { "D-0070": "entro" | "rechazado" | "espera" }; sin decisión, no se toca
create or replace function crm_giwa.aprobar_proyecto(pid text, decisiones jsonb) returns jsonb
language plpgsql volatile as $$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  e int := 0; r int := 0; w int := 0;
begin
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('aprobada'), fecha_aprobado = crm_giwa.hoy(), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'entro';
  get diagnostics e = row_count;
  if e = 0 then raise exception 'No marcaste ningún desarrollo como aprobado. Si no entró nada, usá Rechazar.'; end if;
  update crm_giwa.desarrollos d set estado_id = crm_giwa.estado_des('rechazada'), detenido = false
  where d.proyecto_id = p.id and decisiones ->> d.id = 'rechazado';
  get diagnostics r = row_count;
  update crm_giwa.desarrollos d set detenido = true                 -- sigue Nueva, pero marcado
  where d.proyecto_id = p.id and decisiones ->> d.id = 'espera';
  get diagnostics w = row_count;
  update crm_giwa.proyectos set estado_id = 'Aprobado', probabilidad = 100, fecha_aprobacion = crm_giwa.hoy() where id = p.id;
  return jsonb_build_object('ok', true, 'estado', 'Aprobado', 'entraron', e, 'rechazados', r, 'esperan', w,
    'msg', e || ' aprobado(s)' || case when r > 0 then ', ' || r || ' rechazado(s)' else '' end
                                || case when w > 0 then ', ' || w || ' en espera' else '' end);
end $$;

create or replace function crm_giwa.rechazar_proyecto(pid text) returns jsonb
language plpgsql volatile as $$
declare p crm_giwa.proyectos := crm_giwa._proyecto(pid); n int;
begin
  update crm_giwa.desarrollos set estado_id = crm_giwa.estado_des('rechazada'), detenido = false where proyecto_id = p.id;
  get diagnostics n = row_count;
  update crm_giwa.proyectos set estado_id = 'Rechazado', probabilidad = 0, fecha_aprobacion = crm_giwa.hoy() where id = p.id;
  return jsonb_build_object('ok', true, 'estado', 'Rechazado', 'desarrollos', n, 'msg', 'Proyecto rechazado y ' || n || ' desarrollo(s) con él.');
end $$;

create or replace function crm_giwa.finalizar_proyecto(pid text) returns jsonb
language plpgsql volatile as $$
declare p crm_giwa.proyectos := crm_giwa._proyecto(pid); n int;
begin
  update crm_giwa.desarrollos set estado_id = crm_giwa.estado_des('finalizada'), fecha_fin = coalesce(fecha_fin, crm_giwa.hoy())
  where proyecto_id = p.id and crm_giwa.estado_canonico(estado_id) not in ('finalizada', 'rechazada');
  get diagnostics n = row_count;
  update crm_giwa.proyectos set estado_id = 'Finalizado', fecha_finalizado = crm_giwa.hoy() where id = p.id;
  return jsonb_build_object('ok', true, 'estado', 'Finalizado', 'desarrollos', n,
    'msg', 'Proyecto finalizado' || case when n > 0 then ' y ' || n || ' desarrollo(s) cerrados.' else '.' end);
end $$;

-- updateProyField('estado_proyecto') con la guarda _puedeCambiarEstado
create or replace function crm_giwa.cambiar_estado_proyecto(pid text, estado text) returns jsonb
language plpgsql volatile as $$
declare
  p crm_giwa.proyectos := crm_giwa._proyecto(pid);
  a text := crm_giwa.norm(p.estado_id); b text := crm_giwa.norm(estado);
  aprob boolean;
begin
  if a <> b then
    if a ~ 'finaliz' then
      raise exception 'El proyecto está Finalizado: su estado no se cambia. Si hay trabajo nuevo, va como módulo o proyecto nuevo.';
    end if;
    select exists (select 1 from crm_giwa.v_desarrollos_plata where proyecto_id = p.id and es_ganado) into aprob;
    if b ~ '(prospect|revis|negoc)' and aprob then raise exception 'Tiene desarrollos aprobadas: no puede volver a %.', estado; end if;
    if b ~ '(prospect|revis|negoc)' and a ~ '(aprob|vendido|activo|curso|ejecu|desarroll|implementac|garant|mantenim|soporte)' then
      raise exception 'Un proyecto % no vuelve a %.', p.estado_id, estado;
    end if;
  end if;
  -- rechazar el proyecto baja el rechazo a sus desarrollos abiertos
  if b ~ '(rechaz|cancel)' then
    update crm_giwa.desarrollos set estado_id = crm_giwa.estado_des('rechazada')
    where proyecto_id = p.id and crm_giwa.estado_canonico(estado_id) not in ('finalizada', 'rechazada');
  end if;
  update crm_giwa.proyectos set
    estado_id = estado,
    fecha_aprobacion = case when estado = 'Aprobado' then crm_giwa.hoy() else fecha_aprobacion end,
    probabilidad = case when estado = 'Aprobado' then 100 else probabilidad end
  where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.contactos_proyecto(pid text, lista text) returns jsonb
language plpgsql volatile as $$
declare p crm_giwa.proyectos := crm_giwa._proyecto(pid);
begin
  update crm_giwa.proyectos set contactos = nullif(trim(coalesce(lista, '')), '') where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.fecha_desarrollo(did text, campo text, fecha date) returns jsonb
language plpgsql volatile as $$
declare d crm_giwa.desarrollos := crm_giwa._desarrollo(did);
begin
  if campo = 'fecha_ini' then update crm_giwa.desarrollos set fecha_inicio = fecha where id = d.id;
  elsif campo = 'fecha_fin' then update crm_giwa.desarrollos set fecha_fin = fecha where id = d.id;
  else raise exception 'Campo no mapeado: %', campo; end if;
  return jsonb_build_object('ok', true);
end $$;

-- cerrarModuloHoras: todas las líneas de la misma etapa del mismo desarrollo
create or replace function crm_giwa.cerrar_modulo_horas(hid text, cerrar boolean) returns jsonb
language plpgsql volatile as $$
declare
  h crm_giwa.proyecto_horas; lista text[]; est text; n int;
begin
  select array_agg(trim(x) order by o) into lista
  from crm_giwa.cot_config c, unnest(string_to_array(c.valor, ',')) with ordinality u(x, o)
  where c.clave = 'PHoras_EstadoActividad' and trim(x) <> '';
  est := case when cerrar then (select x from unnest(lista) x where x ~* 'finaliz' limit 1) else lista[1] end;
  if est is null then raise exception 'Falta «PHoras_EstadoActividad» en CotConfig'; end if;
  select * into h from crm_giwa.proyecto_horas where id = trim(hid);
  if not found then raise exception 'Módulo no encontrado'; end if;
  update crm_giwa.proyecto_horas set estado = est, fecha_fin = case when cerrar then crm_giwa.hoy() else null end
  where coalesce(proyecto_id, '') = coalesce(h.proyecto_id, '') and coalesce(desarrollo_id, '') = coalesce(h.desarrollo_id, '')
    and coalesce(etapa, '') = coalesce(h.etapa, '');
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'n', n, 'estado', est);
end $$;

revoke execute on function crm_giwa._desarrollo(text), crm_giwa._proyecto(text) from public, anon;
grant execute on function crm_giwa.estado_des(text), crm_giwa._desarrollo(text), crm_giwa._proyecto(text),
  crm_giwa.accion_desarrollo(text, text), crm_giwa.detener_desarrollo(text, boolean), crm_giwa.detener_proyecto(text, boolean),
  crm_giwa.enviar_propuesta(text, date), crm_giwa.aprobar_proyecto(text, jsonb), crm_giwa.rechazar_proyecto(text),
  crm_giwa.finalizar_proyecto(text), crm_giwa.cambiar_estado_proyecto(text, text), crm_giwa.contactos_proyecto(text, text),
  crm_giwa.fecha_desarrollo(text, text, date), crm_giwa.cerrar_modulo_horas(text, boolean) to authenticated;

reset role;

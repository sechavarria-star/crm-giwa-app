-- ══════════════════════════════════════════════════════════════════════
-- crm_giwa · Soporte, etapa 3c: reportes al cliente · 06/11/2026
-- ──────────────────────────────────────────────────────────────────────
-- Reportes.gs, con las mismas reglas:
--   soporte_horas_reporte(rid)      el consumo del mes del reporte (_horasDeReporte_): el mantenimiento
--                                   elegido (o todos los de la empresa) con cupo, usadas y excedente, y el
--                                   detalle por ticket (sin cargo / incluida / se factura aparte) con su resolución.
--                                   con_montos = false para el cliente: nunca viaja un monto.
--   soporte_guardar_reporte(p)      _guardarReporte_: crea (Borrador) o edita; vincula tickets (_vincularTickets_):
--                                   cada uno suma una respuesta «Resuelto en el reporte…» con sus horas y, si
--                                   se pide, lo cierra. Quita los adjuntos que se saquen (devuelve sus rutas).
--   soporte_publicar_reporte(p)     _publicarReporte_: Publicado + a quién se mandó (el mail, etapa 6)
--   soporte_borrar_reporte(rid)     _borrarReporte_: sólo borradores; devuelve las rutas para borrarlas de Storage
--   soporte_adjunto_reporte(p)      registra un archivo del reporte ya subido a Storage
--   portal_reportes                 ahora con las horas, si el reporte las incluye (sin montos)
-- ══════════════════════════════════════════════════════════════════════
set role crm_giwa_dev;

create or replace function crm_giwa.soporte_horas_reporte(rid text, con_montos boolean default true) returns jsonb
language plpgsql stable as $$
declare r crm_giwa.soporte_reportes; ab text;
begin
  select * into r from crm_giwa.soporte_reportes where id = rid;
  if r.id is null or r.periodo is null then return null; end if;
  ab := case when r.desarrollo_id is not null then crm_giwa.soporte_abono_de(r.desarrollo_id) end;
  return jsonb_build_object(
    'periodo', r.periodo,
    'mantenimientos', coalesce((select jsonb_agg(jsonb_build_object('titulo', c.desarrollo, 'cupo', c.cupo, 'usadas', c.mant, 'excedente', c.excedente) order by c.desarrollo)
                                  from crm_giwa.v_soporte_cuentas_mes c
                                 where c.empresa_id = r.empresa_id and c.mes = r.periodo and c.es_mantenimiento and (ab is null or c.cuenta_id = ab)), '[]'),
    'facturable', (select jsonb_build_object('horas', round(sum(c.fact), 2)) || case when con_montos then jsonb_build_object('monto', sum(c.a_facturar)) else '{}' end
                     from crm_giwa.v_soporte_cuentas_mes c where c.empresa_id = r.empresa_id and c.mes = r.periodo),
    'detalle', coalesce((select jsonb_agg(x order by x ->> 'id') from (
        select jsonb_build_object('id', t.id, 'titulo', t.titulo, 'horas', round(sum(p.horas), 2),
                 'tipo', case when sum(p.fact) > 0 then 'Se factura aparte' when sum(p.mant) > 0 then 'Incluida en el mantenimiento' else 'Sin cargo' end,
                 'resolucion', coalesce(t.respuesta_final, (select n.texto from crm_giwa.soporte_notas n join crm_giwa.usuarios u on u.es_giwa and crm_giwa.norm_mail(u.mail) = crm_giwa.norm_mail(n.autor)
                                                            where n.ticket_id = t.id and not n.interna and coalesce(trim(n.texto), '') <> '' order by n.fecha desc limit 1), ''))
               || case when con_montos then jsonb_build_object('monto', round(sum(p.fact) * coalesce(v.tarifa, 0))) else '{}' end as x
          from crm_giwa.v_soporte_reparto p
          join crm_giwa.soporte_tickets t on t.id = p.ticket_id
          join crm_giwa.v_soporte_tickets v on v.id = t.id
         where p.empresa_id = r.empresa_id and p.mes = r.periodo and (ab is null or p.fact > 0 or p.gar > 0 or p.cuenta_id = ab)
         group by t.id, t.titulo, t.respuesta_final, v.tarifa) s), '[]'));
end $$;

create or replace function crm_giwa.soporte_guardar_reporte(p jsonb) returns jsonb
language plpgsql volatile as $$
declare rid text := nullif(p ->> 'id', ''); r crm_giwa.soporte_reportes; emp text; did text := nullif(p ->> 'desarrollo_id', '');
        per text := nullif(p ->> 'periodo', ''); tk jsonb; s crm_giwa.soporte_tickets; f timestamptz; rutas jsonb := '[]';
begin
  perform crm_giwa._soporte_equipo();
  if rid is not null then
    select * into r from crm_giwa.soporte_reportes where id = rid;
    if r.id is null then raise exception 'No encuentro ese reporte.'; end if;
  end if;
  emp := coalesce(nullif(p ->> 'empresa_id', ''), r.empresa_id);
  if emp is null or not exists (select 1 from crm_giwa.empresas where id = emp) then raise exception 'Elegí la empresa.'; end if;
  if per is not null and per !~ '^\d{4}-\d{2}$' then raise exception 'El período va como AAAA-MM.'; end if;
  if did is not null and not exists (select 1 from crm_giwa.v_soporte_desarrollos where id = did and empresa_id = emp) then raise exception 'Ese desarrollo no es de esa empresa.'; end if;
  if length(trim(coalesce(p ->> 'titulo', ''))) < 3 then raise exception 'Poné un título.'; end if;
  if rid is null then
    rid := crm_giwa._soporte_nuevo_id('REP', 4);
    insert into crm_giwa.soporte_reportes (id, empresa_id, titulo, estado, autor) values (rid, emp, trim(p ->> 'titulo'), 'Borrador', crm_giwa.mi_mail());
  end if;
  update crm_giwa.soporte_reportes set empresa_id = emp, desarrollo_id = did, periodo = per,
         tipo = crm_giwa._soporte_en_lista(p ->> 'tipo', 'Soporte_TipoReporte', 'Otro'), titulo = left(trim(p ->> 'titulo'), 200),
         resumen = nullif(trim(coalesce(p ->> 'resumen', '')), ''), hicimos = nullif(trim(coalesce(p ->> 'hicimos', '')), ''),
         pendiente = nullif(trim(coalesce(p ->> 'pendiente', '')), ''), revisamos = nullif(trim(coalesce(p ->> 'revisamos', '')), ''),
         incluir_horas = coalesce((p ->> 'incluir_horas')::boolean, false), actualizado = now()
   where id = rid;
  -- tickets que se resolvieron en este reporte: una respuesta con sus horas y, si se pide, cerrado
  for tk in select * from jsonb_array_elements(coalesce(p -> 'tickets', '[]')) loop
    select * into s from crm_giwa.soporte_tickets where id = tk ->> 'id' and empresa_id = emp;
    if s.id is null or exists (select 1 from crm_giwa.soporte_reporte_tickets where reporte_id = rid and ticket_id = s.id) then continue; end if;
    f := coalesce(nullif(tk ->> 'fecha', '')::date::timestamptz + interval '12 hours', now());
    insert into crm_giwa.soporte_notas (id, ticket_id, fecha, autor, texto, interna, horas, origen)
    values (crm_giwa._soporte_nuevo_id('N', 5), s.id, f, crm_giwa.mi_mail(),
            'Resuelto en el reporte ' || rid || ' · ' || left(trim(p ->> 'titulo'), 200) || '.', false, nullif(crm_giwa.num(tk ->> 'horas'), 0), 'reporte');
    update crm_giwa.soporte_tickets set actualizado = now(),
           estado = case when coalesce((tk ->> 'cerrar')::boolean, false) then 'Cerrado' else estado end,
           resuelto = case when coalesce((tk ->> 'cerrar')::boolean, false) and estado <> 'Cerrado' then f else resuelto end,
           respuesta_final = case when coalesce((tk ->> 'cerrar')::boolean, false) and estado <> 'Cerrado' then coalesce(respuesta_final, 'Resuelto en el reporte ' || rid || '.') else respuesta_final end
     where id = s.id;
    insert into crm_giwa.soporte_reporte_tickets (reporte_id, ticket_id) values (rid, s.id);
  end loop;
  -- adjuntos que se sacan
  select coalesce(jsonb_agg(ruta) filter (where ruta is not null), '[]') into rutas from crm_giwa.soporte_adjuntos
   where reporte_id = rid and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p -> 'quitar_adjuntos', '[]')) x);
  delete from crm_giwa.soporte_adjuntos where reporte_id = rid and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p -> 'quitar_adjuntos', '[]')) x);
  perform crm_giwa.soporte_congelar_tarifas(emp);
  return jsonb_build_object('ok', true, 'id', rid, 'borrar_rutas', rutas);
end $$;

create or replace function crm_giwa.soporte_publicar_reporte(p jsonb) returns jsonb
language plpgsql volatile as $$
declare para text := crm_giwa.norm_mails(p ->> 'para');
begin
  perform crm_giwa._soporte_equipo();
  update crm_giwa.soporte_reportes set estado = 'Publicado', publicado = coalesce(publicado, now()), enviado_a = nullif(para, ''), actualizado = now()
   where id = p ->> 'id';
  if not found then raise exception 'No encuentro ese reporte.'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crm_giwa.soporte_borrar_reporte(rid text) returns jsonb
language plpgsql volatile as $$
declare r crm_giwa.soporte_reportes; rutas jsonb;
begin
  perform crm_giwa._soporte_equipo();
  select * into r from crm_giwa.soporte_reportes where id = rid;
  if r.id is null then raise exception 'No encuentro ese reporte.'; end if;
  if r.estado = 'Publicado' then raise exception 'Un reporte publicado no se borra: ya lo vio el cliente.'; end if;
  select coalesce(jsonb_agg(ruta) filter (where ruta is not null), '[]') into rutas from crm_giwa.soporte_adjuntos where reporte_id = rid;
  delete from crm_giwa.soporte_reportes where id = rid;
  return jsonb_build_object('ok', true, 'borrar_rutas', rutas);
end $$;

create or replace function crm_giwa.soporte_adjunto_reporte(p jsonb) returns jsonb
language plpgsql volatile as $$
declare rid text := p ->> 'reporte_id'; ruta text := p ->> 'ruta'; emp text; aid bigint;
begin
  perform crm_giwa._soporte_equipo();
  select empresa_id into emp from crm_giwa.soporte_reportes where id = rid;
  if emp is null then raise exception 'No encuentro ese reporte.'; end if;
  if ruta is null or split_part(ruta, '/', 1) <> emp or split_part(ruta, '/', 2) <> rid then raise exception 'El archivo no está en la carpeta del reporte.'; end if;
  insert into crm_giwa.soporte_adjuntos (reporte_id, nombre, ruta, tipo, bytes, autor)
  values (rid, left(coalesce(nullif(p ->> 'nombre', ''), 'archivo'), 200), ruta, p ->> 'tipo', nullif(p ->> 'bytes', '')::bigint, crm_giwa.mi_mail())
  returning id into aid;
  return jsonb_build_object('ok', true, 'id', aid);
end $$;

-- El portal: los reportes publicados, ahora con el consumo de horas si el reporte lo incluye (nunca montos)
create or replace function crm_giwa.portal_reportes(como text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare emp text := crm_giwa._portal_empresa(como, false);
begin
  return coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', r.id, 'periodo', r.periodo, 'tipo', r.tipo, 'titulo', r.titulo,
           'resumen', r.resumen, 'hicimos', r.hicimos, 'pendiente', r.pendiente, 'revisamos', r.revisamos, 'publicado', r.publicado,
           'desarrollo', (select titulo from crm_giwa.v_soporte_desarrollos where id = r.desarrollo_id),
           'horas', case when r.incluir_horas then crm_giwa.soporte_horas_reporte(r.id, false) end,
           'tickets', (select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.id) from crm_giwa.soporte_reporte_tickets rt
                         join crm_giwa.soporte_tickets t on t.id = rt.ticket_id where rt.reporte_id = r.id),
           'adjuntos', (select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'ruta', a.ruta, 'tipo', a.tipo) order by a.id)
                          from crm_giwa.soporte_adjuntos a where a.reporte_id = r.id))) order by r.periodo desc nulls last, r.publicado desc nulls last)
                     from crm_giwa.soporte_reportes r where r.empresa_id = emp and r.estado = 'Publicado'), '[]');
end $$;

grant execute on function crm_giwa.soporte_horas_reporte(text, boolean), crm_giwa.soporte_guardar_reporte(jsonb), crm_giwa.soporte_publicar_reporte(jsonb),
  crm_giwa.soporte_borrar_reporte(text), crm_giwa.soporte_adjunto_reporte(jsonb), crm_giwa.portal_reportes(text) to authenticated, service_role;

reset role;

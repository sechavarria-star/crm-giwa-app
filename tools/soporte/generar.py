# Planilla «Soporte GIWA» (xlsx) → SQL de carga para crm_giwa.soporte_*. Idempotente: on conflict do nothing.
import sys, datetime
exec(open(sys.argv[2]).read().replace('sys.argv[1]', repr(sys.argv[1])))
def q(v):
    if v is None or (isinstance(v, str) and v.strip() == ''): return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(float(v)) if isinstance(v, float) else str(v)
    if isinstance(v, datetime.datetime): return "'" + v.strftime('%Y-%m-%d %H:%M:%S') + "-03'"
    if isinstance(v, datetime.date): return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"
def si(v): return str(v or '').strip().lower() in ('si', 'sí', 'true', '1', 'x')
def mail(v): return (str(v).strip().lower() or None) if v else None
EST = {'Nueva': 'Nuevo', 'En curso': 'En proceso', 'Resuelta': 'Cerrado'}
out = ['-- generado desde la planilla «Soporte GIWA»']
for e in hoja('empresas_portal'):
    out.append(f"insert into crm_giwa.soporte_empresas (empresa_id, activo, mostrar_horas, avisar_a) values ({q(e['empresa'])}, {q(si(e['activo']))}, {q(si(e['mostrar_horas']))}, {q(e['avisar_a'])}) on conflict (empresa_id) do nothing;")
for u in hoja('usuarios'):
    if str(u['rol']).lower() == 'cliente':
        m = mail(u['email'])
        out.append(f"insert into crm_giwa.soporte_accesos (mail, contacto_id, empresa_id, habilitado, creado, ultimo_ingreso, creador) values ({q(m)}, (select id from crm_giwa.contactos where lower(email) = {q(m)} limit 1), {q(u['empresa'])}, {q(si(u['activo']))}, coalesce({q(u['creado'])}::timestamptz, now()), {q(u['ultimo_ingreso'])}, 'migración') on conflict (mail) do nothing;")
adj = []
for s in hoja('solicitudes'):
    est = EST.get(s['estado'], s['estado']) or ('Cerrado' if s['resuelta'] else 'Nuevo')
    tarea = s['tarea_crm_id'] if s['tarea_crm_id'] and str(s['tarea_crm_id']).startswith('T-') else None
    out.append("insert into crm_giwa.soporte_tickets (id, creado, actualizado, empresa_id, proyecto_id, desarrollo_id, tipo, sintoma, categoria, modulo, titulo, descripcion, prioridad, estado, clasificacion_hist, solicitante, responsable, vence, resuelto, respuesta_final, tarea_id, canal, origen, id_origen, relacionado_con, tarifa_hora) values (" +
        ', '.join(q(x) for x in [s['id'], s['creada'], s['actualizada'] or s['creada'], s['empresa'], s['proyecto_id'], s['solucion_id'], s['tipo'] or 'Algo no funciona',
            s['sintoma'], s['categoria'], s['modulo'], s['titulo'] or '(sin título)', s['descripcion'], s['prioridad'] or 'Media', est, s['clasificacion'],
            mail(s['solicitante']), mail(s['responsable']), s['vence'], s['resuelta'], s['respuesta_final'], tarea, s['canal'] or 'Mail',
            s['origen'] or 'planilla', s['id_origen'], s['relacionado_con'], s['tarifa_hora']]) + ") on conflict (id) do nothing;")
    for l in str(s['adjuntos'] or '').split('\n'):
        if l.strip(): p = l.split('|'); adj.append((s['id'], None, None, p[0].strip(), '|'.join(p[1:]).strip() or 'archivo'))
for n in hoja('notas'):
    h = n['horas'] if n['horas'] not in (None, '') else None
    out.append("insert into crm_giwa.soporte_notas (id, ticket_id, fecha, creado, autor, texto, interna, horas, origen, id_origen) values (" +
        ', '.join(q(x) for x in [n['id'], n['solicitud_id'], n['fecha'], n['fecha'], mail(n['autor']), n['texto'], si(n['interna']), h, n['origen'] or 'planilla', n['id_origen']]) + ") on conflict (id) do nothing;")
    for l in str(n['adjuntos'] or '').split('\n'):
        if l.strip(): p = l.split('|'); adj.append((n['solicitud_id'], n['id'], None, p[0].strip(), '|'.join(p[1:]).strip() or 'archivo'))
for r in hoja('reportes'):
    out.append("insert into crm_giwa.soporte_reportes (id, creado, actualizado, empresa_id, desarrollo_id, periodo, tipo, titulo, resumen, hicimos, pendiente, revisamos, incluir_horas, estado, publicado, enviado_a, autor) values (" +
        ', '.join(q(x) for x in [r['id'], r['creado'], r['actualizado'] or r['creado'], r['empresa'], r['solucion_id'], r['periodo'] if not isinstance(r['periodo'], datetime.datetime) else r['periodo'].strftime('%Y-%m'),
            r['tipo'], r['titulo'], r['resumen'], r['hicimos'], r['pendiente'], r['revisamos'], si(r['incluir_horas']), r['estado'] or 'Borrador', r['publicado'], r['enviado_a'], mail(r['autor'])]) + ") on conflict (id) do nothing;")
    for t in str(r['tickets'] or '').replace(',', '\n').split('\n'):
        if t.strip(): out.append(f"insert into crm_giwa.soporte_reporte_tickets (reporte_id, ticket_id) values ({q(r['id'])}, {q(t.strip())}) on conflict do nothing;")
    for l in str(r['adjuntos'] or '').split('\n'):
        if l.strip(): p = l.split('|'); adj.append((None, None, r['id'], p[0].strip(), '|'.join(p[1:]).strip() or 'archivo'))
for t, nid, rid, did, nom in adj:
    out.append(f"insert into crm_giwa.soporte_adjuntos (ticket_id, nota_id, reporte_id, nombre, drive_id, autor) select {q(t)}, {q(nid)}, {q(rid)}, {q(nom)}, {q(did)}, 'migración' where not exists (select 1 from crm_giwa.soporte_adjuntos where drive_id = {q(did)} and ticket_id is not distinct from {q(t)} and nota_id is not distinct from {q(nid)} and reporte_id is not distinct from {q(rid)});")
print('\n'.join(out))
print(f'-- {len(adj)} adjuntos', file=sys.stderr)

/* ══════════════════════════════════════════════════════════════════════
   vistas/pm.js · PM: Seguimiento y Proyectos
   ──────────────────────────────────────────────────────────────────────
   Reemplaza esas dos vistas de PM_Index.html. Los proyectos vienen hechos
   de crm_giwa.v_pm_proyectos (= getProyectos, con sus desarrollos) y las
   tareas, comentarios y módulos de cada uno de v_pm_seguimiento (=
   getSeguimientoExtra). Acá no se suma plata: se muestra lo de la vista.
   Las palabras de estado, los colores y «activo / detenido / pipeline»
   salen de js/estados.js y js/calculos.js (los de _Estados y _Calculos).

   Diferencia con la pantalla vieja (a propósito): el estado del proyecto
   no se recalcula en el navegador; viene de la base.

   La ficha del proyecto (5b) es de lectura: Información, Desarrollos y
   Tareas y comentarios, con la plata al costado.

   Acciones (5c), en la base: el estado del proyecto desde la barra o la
   tarjeta (enviar propuesta, aprobar, finalizar, rechazar), detener y
   reanudar, las del desarrollo (arrancar, deployar, finalizar, rechazar),
   fechas, cerrar una etapa de módulos y marcar contactos.

   Como en el Apps Script, arrancar / deployar / finalizar / rechazar un
   desarrollo crean solos sus alertas de facturación y recordatorios.

   PENDIENTE: Cotizar —recotizar, renovar, editar, mejora, horas de
   soporte—, Análisis y Soporte siguen allá, igual que Tareas, Agenda y
   Nuevo proyecto.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var P = { proys: [], emps: {}, users: {}, sub: 'seg',
            seg: { fil: 'vivos', q: '', rev: [], abierto: {} }, pr: { fil: [], q: '', orden: 'empresa', abiertas: {} },
            f: null, fLista: [], fTab: 'desarrollos', fAb: {}, prev: 'seg' };
  var CARRUSEL = 3;   // más de esto por cliente → carrusel
  var SUBS = [['seg', 'Seguimiento'], ['proy', 'Proyectos'], ['tar', 'Tareas'], ['nuevo', 'Nuevo proyecto']];

  async function cargar() {
    var r = await Promise.all([
      db().from('v_pm_proyectos').select('*'),
      db().from('v_pm_seguimiento').select('*'),
      db().from('empresas').select('id,nombre,logo,drive_interno'),
      db().from('usuarios').select('mail,nombre'),
      db().rpc('estados_spec'),
      db().from('v_tipo_cambio_hoy').select('valor').maybeSingle()
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    initEstadosSpec(r[4].data);
    window.TC = Number((r[5].data || {}).valor) || 0;   // _tc() de calculos.js: el TC del día (BCRA)
    var extra = {}; r[1].data.forEach(function (s) { extra[s.proyecto_id] = s; });
    P.emps = {}; r[2].data.forEach(function (e) { P.emps[e.nombre] = e; });
    P.users = {}; r[3].data.forEach(function (u) { P.users[String(u.mail || '').trim().toLowerCase()] = u.nombre; });
    P.proys = r[0].data.map(function (p) {
      var x = extra[p.id] || {};
      p.tareas = x.tareas || []; p.comentarios = x.comentarios || []; p.modulos = x.modulos || [];
      return p;
    });
  }

  // ── ayudas ───────────────────────────────────────────────────
  function nombre(m) { var e = String(m || '').trim().toLowerCase(); return P.users[e] || (e.indexOf('@') >= 0 ? e.split('@')[0] : String(m || '')); }
  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function est(txt, cls) { return '<span class="est t-' + cls + '"><i class="est-dot e-' + cls + '"></i>' + esc(txt || '—') + '</span>'; }
  // botón-ícono; el color del hover dice el resultado (check verde, cerrar gris)
  function ib(icon, tit, attrs, cls) {
    var hv = icon === 'check' ? ' h-ok' : (icon === 'cerrar' ? ' h-mt' : '');
    return '<button class="btn xs btn-ico' + hv + (cls ? ' ' + cls : '') + '" data-tip="' + esc(tit) + '" aria-label="' + esc(tit) + '" ' + attrs + '>' + ico(icon) + '</button>';
  }
  function hace(f) {
    var n = mDias(f); if (n === null) return '';
    if (n <= 0) return 'hoy'; if (n === 1) return 'ayer'; if (n < 30) return 'hace ' + n + ' días';
    var m = Math.round(n / 30); return 'hace ' + m + (m === 1 ? ' mes' : ' meses');
  }
  function logo(emp, cls, clsIni) {
    var e = P.emps[emp] || {}, ini = '<span class="' + clsIni + '">' + esc(String(emp || '?').charAt(0).toUpperCase()) + '</span>';
    if (!e.logo) return ini;
    return '<img class="' + cls + '" src="' + esc(e.logo) + '" referrerpolicy="no-referrer" alt="" onerror="this.outerHTML=this.getAttribute(\'data-ini\')" data-ini="' + esc(ini) + '">';
  }
  function vivosDe(p) { return (p.items || []).filter(function (it) { var c = _canonSol(it.estado); return !it.detenido && (c === 'curso' || c === 'garantia'); }); }
  // Por qué está en ese estado: sólo con datos que existen
  function porQue(p, can) {
    var nom = function (it) { return it.titulo || it.tipo || it.id; };
    if (p.detenido) return 'Detenido: queda en pausa hasta que lo reanudes';
    if (can === 'activo') {
      var v = vivosDe(p); if (!v.length) return 'Activo, pero ningún desarrollo está en curso';
      return 'Activo porque ' + v.map(function (it) { return nom(it) + (_canonSol(it.estado) === 'garantia' ? ' está en garantía' : ' está en curso'); }).join(' y ');
    }
    if (can === 'negociacion') { var f = _pd(p.fecha_propuesta); return f ? 'En negociación porque la propuesta se envió el ' + ff(f) : 'En negociación'; }
    if (can === 'prospecto') return 'Prospecto porque todavía no se envió la propuesta';
    if (can === 'aprobado') { var a = (p.items || []).filter(function (it) { return _canonSol(it.estado) === 'aprobada'; }).map(nom); return a.length ? 'Aprobado: falta arrancar ' + a.join(', ') : 'Aprobado'; }
    if (can === 'finalizado') return 'Finalizado: todos los desarrollos están cerrados';
    return '';
  }
  function comLinea(c) {
    var t = String(c.texto || '').replace(/\s+/g, ' ').trim(), a = nombre(c.usuario);
    return '<div class="seg-com"><span class="seg-com-t" title="' + esc(t) + '">' + (a ? '<span class="seg-com-a">' + esc(a) + ':</span> ' : '') + esc(t) + '</span>' +
      '<span class="seg-com-m">' + hace(c.fecha) + '</span></div>';
  }
  function tareasAbiertas(p) { return (p.tareas || []).filter(function (t) { return tareaAbierta(t.estado); }); }
  function vencida(t) { var f = _pd(t.fecha_vencimiento); return f && f < mHoy(); }

  // ══ ACCIONES (5c) · las tablas de Estados.gs, en espejo ══════
  // El backend (crm_giwa.accion_desarrollo…) valida siempre; esto sólo decide
  // qué botón mostrar. Si cambia una, cambia la otra.
  var RECH = ['rechazar', 'Rechazar', 'cerrar', 'Dijeron que no. Se puede recotizar'];
  var ACC_DES = { nueva: [RECH], aprobada: [['arrancar', 'Arrancar', 'play', 'Empezó el trabajo'], RECH],
                  curso: [['entregar', 'Deployar', 'subir', 'Sale a producción y empieza a correr la garantía']],
                  garantia: [['cerrar', 'Finalizar', 'check', 'Se cumplió la garantía. Acá arranca el mantenimiento']] };
  var ACC_MANT = { nueva: [RECH], aprobada: [['arrancar', 'Arrancar', 'play', 'Empezó a facturar'], RECH],
                   curso: [['cerrar', 'Finalizar', 'check', 'Se cumplieron las cuotas']], garantia: [['cerrar', 'Finalizar', 'check', 'Se cumplieron las cuotas']] };
  function accionesDes(it) { return ((esMant(it) ? ACC_MANT : ACC_DES)[_canonSol(it.estado || '')] || []); }
  function botonesDes(it, soloPrincipal) {
    var acc = accionesDes(it); if (soloPrincipal) acc = acc.filter(function (a) { return a[0] !== 'rechazar'; }).slice(0, 1);
    return acc.map(function (a) { return ib(a[2], a[1] + ': ' + a[3], 'data-pm="acc-des" data-id="' + esc(it.id) + '" data-acc="' + a[0] + '"'); }).join('');
  }
  // La próxima acción del proyecto según dónde está (Activo sale solo al arrancar un desarrollo)
  function accionesProy(p) {
    if (p.detenido) return [];
    switch (_canonProy(p.estado_proyecto)) {
      case 'prospecto': return [['negociacion', 'Enviar propuesta', 'mail']];
      case 'negociacion': return [['aprobado', 'Aprobar', 'check'], ['rechazado', 'Rechazar', 'cerrar']];
      case 'activo': return [['finalizado', 'Finalizar', 'check']];
    }
    return [];
  }
  // ¿Se puede pasar el proyecto a «nuevo» desde la barra? (_puedeEstado)
  function puedeEstado(p, nuevo) {
    var a = _canonProy(p.estado_proyecto), b = _canonProy(nuevo), aprob = (p.items || []).some(function (it) { return esGanado(it.estado); });
    if (a === b) return { ok: true };
    if (a === 'finalizado') return { ok: false, msg: 'El proyecto está Finalizado: su estado no se cambia.' };
    if (b === 'activo') return { ok: false, msg: '«Activo» se calcula solo: arranca un desarrollo y el proyecto pasa a Activo.' };
    var prosp = b === 'prospecto' || b === 'negociacion';
    if (prosp && aprob) return { ok: false, msg: 'Tiene desarrollos aprobados: no puede volver a ' + nuevo + '.' };
    if (prosp && ['aprobado', 'activo', 'finalizado'].indexOf(a) >= 0) return { ok: false, msg: 'Un proyecto ' + p.estado_proyecto + ' no vuelve a ' + nuevo + '.' };
    return { ok: true };
  }
  // Aprobar o rechazar el proyecto no crea recordatorios (tampoco en el Apps Script):
  // quedan en «Faltan recordatorios» del dashboard de Administración.
  var AVISO_ALERTAS = 'Revisá «Faltan recordatorios» en Administración: los de este cambio se crean desde ahí.';

  // ══ SEGUIMIENTO · tarjetas por cliente ══════════════════════
  function segPasa(p, fil) {
    var c = _canonProy(p.estado_proyecto);
    if (c === 'rechazado') return false;           // lo rechazado se ve sólo en Proyectos
    switch (fil) {
      case 'act': return esProyActivo(p);
      case 'pipe': return esProyPipeline(p);
      case 'det': return esProyDetenido(p);
      case 'fin': return esProyFinalizado(p);
    }
    return !esProyFinalizado(p);                    // en marcha
  }
  function desp(p, k, tit, cuerpo, der) {
    var key = p.id + ':' + k;
    return '<details class="desp plano" data-segdesp="' + esc(key) + '"' + (P.seg.abierto[key] ? ' open' : '') + '><summary><span class="u-f1m">' + tit + '</span>' + (der || '') + '</summary><div>' + cuerpo + '</div></details>';
  }
  function segCard(p) {
    var e = p.estado_proyecto || 'Prospecto', can = _canonProy(e), ec = colorEstadoProy(e);
    var rev = P.seg.rev.indexOf(p.id) >= 0, pid = esc(p.id);
    var its = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada'; });
    var h = '<div class="seg-card' + (p.detenido ? ' det' : '') + (rev ? ' rev' : '') + '">';
    h += '<div class="seg-h"><div class="u-f1m"><div class="seg-nom">' + esc(p.nombre || '—') + '</div>' +
      (p.owner ? '<div class="u-s10-mt">' + esc(nombre(p.owner)) + '</div>' : '') + '</div>' +
      '<div class="seg-hacc">' + est(e, ec.cls) + (p.detenido ? est('Detenido', 'xm') : '') +
      (can === 'finalizado' || can === 'rechazado' ? '' : ib(p.detenido ? 'play' : 'pausa', p.detenido ? 'Reanudar el proyecto' : 'Detener el proyecto', 'data-pm="det-proy" data-id="' + pid + '"')) +
      accionesProy(p).map(function (a) { return ib(a[2], a[1] + ' el proyecto', 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"'); }).join('') +
      ib('abrir', 'Abrir la ficha del proyecto', 'data-pm="ficha" data-id="' + pid + '"') + '</div></div>';
    var pq = porQue(p, can); if (pq) h += '<div class="seg-porque">' + esc(pq) + '</div>';
    if (its.length) h += '<div class="seg-barra">' + its.map(function (it) {
      return '<i class="e-' + (it.detenido ? 'xm' : colorEstado(it.estado).cls) + (_canonSol(it.estado) === 'finalizada' ? ' pas' : '') + '" title="' + esc((it.titulo || '') + ' · ' + (it.estado || '')) + '"></i>';
    }).join('') + '</div>';
    var fila = function (l, v, cls) { return '<div class="seg-kv"><span>' + l + '</span><b class="' + cls + '">' + v + '</b></div>'; };
    if (can === 'prospecto' || can === 'negociacion') {
      var cot = Number(p.monto_cotizado) || 0, env = _pd(p.fecha_envio) || (can === 'negociacion' ? _pd(p.fecha_propuesta) : null);
      h += '<div class="seg-plata">' + (cot > 0 ? fila('Cotizado', fmt(cot), 'm m-pendiente') : fila('Cotización', 'falta cotizar', 'u-c-wa')) +
        (env ? fila('Propuesta', 'enviada ' + hace(env), 'u-c-tx') : fila('Propuesta', 'no enviada', 'u-c-wa')) +
        fila('Probabilidad', (p.probabilidad || 0) + '%', 'u-c-tx') + '</div>';
    }
    if (its.length) {
      h += '<div class="sec seg-s">Desarrollos</div><div class="seg-devs">';
      its.forEach(function (it) {
        var mant = esMant(it), m = '', cls = it.detenido ? 'xm' : colorEstado(it.estado).cls;
        h += '<div class="seg-dev' + (it.detenido ? ' det' : '') + '"><i class="est-dot e-' + cls + '"></i>' +
          '<span class="seg-dev-t dev-tit" title="' + esc(it.titulo || '') + '">' + (mant ? ico('repetir') + ' ' : '') + esc(it.titulo || it.tipo || '—') + '</span>' +
          (p.detenido || it.detenido ? '' : botonesDes(it, true)) +
          '<span class="dev-est t-' + cls + '">' + esc(it.estado || '—') + (it.detenido ? ' · detenido' : '') + '</span></div>';
        if (esGanado(it.estado)) {
          if (!mant) {
            var tot = Number(it.total_ars) || 0, cob = Number(it.facturado) || 0;
            if (tot > 0) m = 'Contratado <b class="m m-contratado">' + fmt(tot) + '</b><span>Cobrado <b class="m m-cobrado">' + fmt(cob) + '</b> (' + Math.round(cob / tot * 100) + '%)</span>';
          } else {
            var cu = Number(it.cuota_act) || Number(it.valor_cuota) || 0, d = Number(it.duracion) || 12, cf = Number(it.cuotas_facturadas) || 0;
            if (cu > 0) m = 'Abono <b class="m m-abono">' + fmt(cu) + '/mes</b><span>Cuotas restantes <b class="m m-abono">' + Math.max(0, d - cf) + ' de ' + d + '</b></span>';
          }
        }
        if (m) h += '<div class="seg-linea seg-sub">' + m + '</div>';
      });
      h += '</div>';
    }
    // Módulos por etapa, sólo con el proyecto Activo
    var vivos = {}; its.forEach(function (it) { vivos[it.id] = 1; });
    var mods = (p.modulos || []).filter(function (m) { return !m.item_id || vivos[m.item_id]; });
    if (can === 'activo' && mods.length) {
      var cerr = function (m) { return /finaliz|cerr|complet|hech/i.test(m.estado || ''); };
      var grp = {}, og = [], itemsM = {};
      mods.forEach(function (m) { var k = (m.item_id || '') + '|' + (m.etapa || 'Sin etapa'); if (!grp[k]) { grp[k] = []; og.push(k); } grp[k].push(m); itemsM[m.item_id || ''] = 1; });
      var multi = Object.keys(itemsM).length > 1, listas = og.filter(function (k) { return grp[k].every(cerr); });
      var mh = og.map(function (k) {
        var ms = grp[k], hecha = ms.every(cerr), hs = ms.reduce(function (a, m) { return a + (Number(m.est) || 0); }, 0);
        var it = its.find(function (x) { return x.id === ms[0].item_id; });
        var tit = (hecha ? ico('check') + ' ' : '') + (multi && it ? esc(it.titulo || '') + ' · ' : '') + esc(ms[0].etapa || 'Sin etapa') +
          ' <span class="seg-mono u-c-mt">' + ms.filter(cerr).length + '/' + ms.length + (hs ? ' · ' + Math.round(hs * 10) / 10 + ' h' : '') + '</span>';
        var acts = ms.map(function (a) {
          return '<div class="seg-tar"><span class="u-f1m seg-ell' + (cerr(a) ? ' u-c-mt' : '') + '">' + (cerr(a) ? ico('check') + ' ' : '') + esc(a.nombre) + '</span>' +
            (a.est ? '<span class="seg-mono u-c-mt">' + a.est + ' h</span>' : '') + '</div>';
        }).join('');
        return desp(p, 'mod:' + k, tit, '<div class="seg-tars">' + acts + '</div>', hecha ? '' : ib('check', 'Cerrar la etapa', 'data-pm="cerrar-mod" data-id="' + esc(ms[0].id) + '"'));
      }).join('');
      h += desp(p, 'mod', 'Módulos <span class="seg-mono">' + listas.length + '/' + og.length + '</span>', mh);
    }
    // Tareas abiertas, con sus comentarios debajo. Se abren en su ficha.
    var ta = tareasAbiertas(p).sort(function (a, b) { return String(a.fecha_vencimiento || '9999').localeCompare(String(b.fecha_vencimiento || '9999')); });
    var nv = ta.filter(vencida).length, cs = p.comentarios || [], vistos = {}, th = '';
    ta.slice(0, 3).forEach(function (x) {
      var f = _pd(x.fecha_vencimiento), xid = esc(x.id);
      th += '<div class="seg-tar"><span class="u-f1m"><span class="seg-ell" title="' + esc(x.titulo || '') + '">' + esc(x.titulo || '—') + '</span></span>' +
        (f ? '<span class="td-due' + (vencida(x) ? ' late' : '') + '">' + ico('calendario') + ff(f) + '</span>' : '') +
        ib('chat', 'Ver, comentar, finalizar o delegar', 'data-pm="tarea" data-id="' + xid + '"') + '</div>';
      cs.filter(function (c) { return c.tarea_id && c.tarea_id === x.id; }).slice(0, 2).forEach(function (c) { vistos[c.id] = 1; th += '<div class="seg-sub">' + comLinea(c) + '</div>'; });
    });
    if (ta.length > 3) th += '<div class="u-s10-mt">+' + (ta.length - 3) + ' más</div>';
    if (!ta.length) th += '<div class="u-s10-mt">Sin tareas pendientes.</div>';
    var s = function (n) { return n > 1 ? 's' : ''; };
    h += desp(p, 'tar', 'Tareas <span>' + (ta.length ? ta.length + ' pendiente' + s(ta.length) : '') + '</span>' + (nv ? ' <span class="u-c-rd">· ' + nv + ' vencida' + s(nv) + '</span>' : ''),
      '<div class="seg-tars">' + th + '</div>', ib('mas', 'Nueva tarea de este proyecto', 'data-pm="nueva-tarea" data-id="' + pid + '"'));
    var otros = cs.filter(function (c) { return !vistos[c.id]; }).slice(0, 3);
    h += '<div class="sec seg-s seg-otros">Otros comentarios</div>' + (otros.length ? otros.map(comLinea).join('') : '<div class="u-s10-mt">Sin comentarios.</div>');
    h += '<div class="seg-nota"><input class="fc" data-segnota="' + pid + '" placeholder="Comentario rápido y Enter…" aria-label="Comentario rápido">' +
      ib('revisado', rev ? 'Revisado · tocá para volver a su lugar' : 'Ya revisado: mandarlo al final', 'data-pm="rev" data-id="' + pid + '"', rev ? 'seg-rev-on' : '') + '</div>';
    return h + '</div>';
  }
  function htmlSeg() {
    var S = P.seg, all = P.proys;
    var fil = [['vivos', 'En marcha'], ['act', 'Activos'], ['pipe', 'Pipeline'], ['det', 'Detenidos'], ['fin', 'Finalizados']];
    var h = '<div class="seg-bar"><input class="fc u-f1" id="seg-q" placeholder="Buscar cliente o proyecto…" aria-label="Buscar" value="' + esc(S.q) + '">' +
      '<div class="filtros" role="group" aria-label="Filtro">' + fil.map(function (f) {
        return '<button class="ptab' + (S.fil === f[0] ? ' on' : '') + '" data-pm="segfil" data-f="' + f[0] + '">' + f[1] + ' <b class="m">' + all.filter(function (p) { return segPasa(p, f[0]); }).length + '</b></button>';
      }).join('') + '</div></div>';
    var q = norm(S.q);
    var list = all.filter(function (p) { return segPasa(p, S.fil); }).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0; });
    if (!list.length) return h + '<div class="empty">Nada para este filtro.</div>';
    var peso = { activo: 0, aprobado: 1, negociacion: 2, prospecto: 3, finalizado: 4, rechazado: 5 };
    var rank = function (p) { return (S.rev.indexOf(p.id) >= 0 ? 100 : 0) + (p.detenido ? 50 : 0) + (peso[_canonProy(p.estado_proyecto)] || 0); };
    var grupos = {}, orden = [];
    list.forEach(function (p) { var e = p.empresa || 'Sin cliente'; if (!grupos[e]) { grupos[e] = []; orden.push(e); } grupos[e].push(p); });
    orden.forEach(function (e) { grupos[e].sort(function (a, b) { return rank(a) - rank(b); }); });
    orden.sort(function (a, b) { return a.localeCompare(b); });
    var cerrados = {}; try { cerrados = JSON.parse(localStorage.getItem('seg_cerr') || '{}') || {}; } catch (e) { cerrados = {}; }
    orden.forEach(function (emp, ei) {
      var ps = grupos[emp], cerr = !!cerrados[emp], carr = ps.length > CARRUSEL;
      h += '<div class="seg-grp' + (cerr ? ' cerr' : '') + '"><div class="seg-grp-h">' +
        ib(cerr ? 'abajo' : 'arriba', cerr ? 'Mostrar los proyectos' : 'Ocultar los proyectos', 'data-pm="segemp" data-emp="' + esc(emp) + '"', 'seg-chev') +
        logo(emp, 'seg-logo', 'seg-logo seg-logo-l') + '<span class="seg-grp-n">' + esc(emp) + '</span>' +
        '<span class="u-s10-mt">' + ps.length + ' proy.</span><span class="u-f1"></span>' +
        (carr && !cerr ? ib('izquierda', 'Anterior', 'data-pm="scr" data-dir="-1" data-g="' + ei + '"') + ib('derecha', 'Siguiente', 'data-pm="scr" data-dir="1" data-g="' + ei + '"') : '') + '</div>';
      if (!cerr) h += '<div class="seg-track' + (carr ? ' carr' : '') + '" data-track="' + ei + '">' + ps.map(segCard).join('') + '</div>';
      h += '</div>';
    });
    return h;
  }

  // ══ PROYECTOS · lista por empresa, filtros que se acumulan ══
  function htmlKpis(list) {
    var R = P.pr, activos = list.filter(esProyActivo), detenidos = list.filter(esProyDetenido), finaliz = list.filter(esProyFinalizado);
    var vivos = list.filter(function (p) { return !esProyFinalizado(p); });
    var contratado = sum(list, mTotal), cobradoDev = sum(list, mCobradoDev), abono = sum(list, mRecurrente);
    var pct = contratado > 0 ? Math.round(cobradoDev / contratado * 100) : 0;
    var caja = function (lbl, val, k, sub, tip, f) {
      var on = f && (f === 'todos' ? !R.fil.length : R.fil.indexOf(f) >= 0);
      return (f ? '<button' : '<div') + ' title="' + esc(tip || '') + '" class="kpi ' + k + (f ? ' kpi-fil' : '') + (on ? ' on' : '') + '"' + (f ? ' data-pm="prfil" data-f="' + f + '"' : '') + '>' +
        '<div class="kpi-lbl">' + lbl + '</div><div class="kpi-val">' + val + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + (f ? '</button>' : '</div>');
    };
    return '<div class="kpi-grid u-mb10">' +
      caja('Proyectos', list.length, 'k-neutro', vivos.length + ' sin cerrar', 'Los proyectos de la lista. Tocá para ver todos.', 'todos') +
      caja('Activos', activos.length, 'k-activo', 'aprobados y en curso', 'Aprobados o Activos. No incluye detenidos ni finalizados. Tocá para filtrar.', '@act') +
      caja('Detenidos', detenidos.length, detenidos.length ? 'k-alerta' : 'k-neutro', 'para recotizar', 'Puestos en pausa a mano. Tocá para filtrar.', '@det') +
      caja('Contratado', fmt(contratado), 'k-contratado', finaliz.length + ' finalizado' + (finaliz.length === 1 ? '' : 's'), 'Suma de los desarrollos aprobados. No incluye mantenimientos.') +
      caja('Cobrado', fmt(cobradoDev), 'k-cobrado', pct + '% de lo contratado', 'Cobrado de esos desarrollos, neto de notas de crédito.') +
      (abono > 0 ? caja('Abono', fmt(abono), 'k-abono', '/mes · no suma al contratado', 'Mantenimientos y soportes vivos. Se factura por cuota.') : '') +
    '</div>';
  }
  function tarjetaProy(p) {
    var e = p.estado_proyecto || '', can = _canonProy(e), ec = colorEstadoProy(e);
    var monto = mTotal(p), cotiz = Number(p.monto_cotizado) || 0, nov = (p.comentarios || [])[0];
    var tars = tareasAbiertas(p), venc = tars.filter(vencida).length;
    var h = '<div class="proy-row e-borde-' + (p.detenido ? 'xm' : ec.cls) + (p.detenido ? ' det' : '') + '">';
    h += '<div class="u-row8"><div class="proy-row-name u-f1m">' + esc(p.nombre || '—') + '</div>' + ib('abrir', 'Abrir la ficha del proyecto', 'data-pm="ficha" data-id="' + esc(p.id) + '"') + '</div>';
    h += '<div class="seg-est">' + est(e || '—', ec.cls) + (p.detenido ? est('Detenido', 'xm') : '') + (p.owner ? '<span>' + esc(nombre(p.owner)) + '</span>' : '') + '</div>';
    var pq = porQue(p, can); if (pq) h += '<div class="seg-porque">' + esc(pq) + '</div>';
    if (tars.length || nov) {
      h += '<div class="proy-row-nov">';
      if (tars.length) h += '<div>' + tars.length + ' tarea' + (tars.length === 1 ? '' : 's') + ' abierta' + (tars.length === 1 ? '' : 's') +
        (venc ? ' · <span class="u-c-rd">' + venc + ' vencida' + (venc === 1 ? '' : 's') + '</span>' : '') + '</div>';
      if (nov) h += comLinea(nov);
      h += '</div>';
    }
    var sal = Number(p.saldo) || 0, pl = '';
    if (sal > 1) pl = 'Saldo <b class="m m-pendiente">' + fmt(sal) + '</b>';
    else if (!(monto > 0) && cotiz > 0 && can !== 'rechazado') pl = 'Cotizado <b class="m m-pendiente">' + fmt(cotiz) + '</b> · sin aprobar';
    if (pl) h += '<div class="seg-linea proy-row-pie">' + pl + '</div>';
    return h + '</div>';
  }
  function htmlProy() {
    var R = P.pr, estados = estadosProyecto();
    var h = '<div class="seg-bar"><input class="fc u-f1" id="pr-q" placeholder="Buscar empresa o proyecto…" aria-label="Buscar" value="' + esc(R.q) + '">' +
      '<select class="fc u-wauto" id="pr-orden" aria-label="Ordenar por">' +
        [['empresa', 'Por empresa'], ['monto', 'Por monto'], ['fecha', 'Por fecha'], ['prob', 'Por probabilidad']].map(function (o) {
          return '<option value="' + o[0] + '"' + (R.orden === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
    h += '<div class="filtros u-mb10" role="group" aria-label="Estados"><button class="ptab' + (R.fil.length ? '' : ' on') + '" data-pm="prfil" data-f="todos">Todos</button>' +
      estados.map(function (e) { return '<button class="ptab' + (R.fil.indexOf(e) >= 0 ? ' on' : '') + '" data-pm="prfil" data-f="' + esc(e) + '">' + esc(e) + '</button>'; }).join('') + '</div>';
    // Sin filtros = todos (también detenidos y rechazados). Con varios = cualquiera que coincida.
    var f = P.proys.filter(function (p) {
      if (!R.fil.length) return true;
      var e = norm(p.estado_proyecto);
      return R.fil.some(function (fl) {
        if (fl === '@det') return esProyDetenido(p);
        if (fl === '@act') return esProyActivo(p);
        return norm(fl) && e.indexOf(norm(fl).slice(0, 6)) >= 0;
      });
    });
    var q = norm(R.q);
    if (q) f = f.filter(function (p) { return norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0; });
    h = htmlKpis(f) + h;
    if (!f.length) return h + '<div class="empty">Sin proyectos para este filtro.</div>';
    f.sort(function (a, b) {
      var dr = (esProyDetenido(a) ? 1 : 0) - (esProyDetenido(b) ? 1 : 0); if (dr) return dr;   // detenidos al final
      if (R.orden === 'empresa') return (a.empresa || '').localeCompare(b.empresa || '') || ((b.monto_final_ars || 0) - (a.monto_final_ars || 0));
      if (R.orden === 'prob') return (b.probabilidad || 0) - (a.probabilidad || 0);
      if (R.orden === 'fecha') return String(b.fecha_propuesta || '').localeCompare(String(a.fecha_propuesta || ''));
      return (b.monto_final_ars || 0) - (a.monto_final_ars || 0);
    });
    if (R.orden !== 'empresa') return h + f.map(tarjetaProy).join('');
    var by = {}, ord = [];
    f.forEach(function (p) { var e = p.empresa || 'Sin empresa'; if (!by[e]) { by[e] = []; ord.push(e); } by[e].push(p); });
    ord.forEach(function (emp) {
      var ps = by[emp];
      var tot = sum(ps, mTotal, function (p) { return p.es_ganado; });
      // cotizado = lo ofrecido que sigue en juego: sin lo rechazado ni lo ganado
      var cot = sum(ps, 'monto_cotizado', function (p) { var c = _canonProy(p.estado_proyecto); return !p.es_ganado && (c === 'prospecto' || c === 'negociacion'); });
      h += '<details class="desp" data-emp="' + esc(emp) + '"' + (R.abiertas[emp] ? ' open' : '') + '><summary class="proy-emp-h">' +
        logo(emp, 'proy-emp-logo', 'proy-emp-initial') + '<span class="proy-emp-name">' + esc(emp) + '</span>' +
        '<span class="proy-emp-n">' + ps.length + ' proyecto' + (ps.length === 1 ? '' : 's') + '</span>' +
        (tot > 0 ? '<span class="sec">contratado</span><span class="m m-contratado" title="Suma de los desarrollos aprobados de esta empresa. No incluye mantenimientos.">' + fmt(tot) + '</span>' : '') +
        (cot > 0 ? '<span class="sec">cotizado</span><span class="m m-pendiente" title="Lo ofrecido y todavía sin respuesta">' + fmt(cot) + '</span>' : '') +
        '</summary><div>' + ps.map(tarjetaProy).join('') + '</div></details>';
    });
    return h;
  }

  // ══ FICHA DEL PROYECTO (5b · lectura) ════════════════════════
  // Encabezado con el estado y de dónde sale; pestañas Información,
  // Desarrollos y Tareas y comentarios; al costado, la plata (de la vista).
  // Las acciones que cambian el proyecto o un desarrollo son de 5c: mientras,
  // el botón «Acciones en el CRM actual».
  var CAMINO = ['prospecto', 'negociacion', 'aprobado', 'activo', 'finalizado'];
  async function cargarFicha(id) {
    var p = P.proys.find(function (x) { return x.id === id; });
    var r = await Promise.all([
      db().from('v_tareas').select('*').contains('project_ids', [id]),
      db().from('comentarios').select('id,tarea_id,proyecto_id,desarrollo_id,texto,fecha,estado,creador,creado,orden').ilike('proyecto_id', '%' + id + '%'),
      db().from('contactos').select('*').eq('empresa_id', p.empresa_id || '-').order('nombre'),
      db().from('proyecto_horas').select('desarrollo_id,modulo_nombre,etapa,horas_est,horas_reales').eq('proyecto_id', id)
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    P.f = {
      id: id,
      tareas: r[0].data,
      // comentarios del proyecto (la columna puede traer varios, separados por coma), los más nuevos primero
      coms: r[1].data.filter(function (c) { return crmLista(c.proyecto_id).indexOf(id) >= 0; })
        .sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || (a.orden - b.orden); }),
      cons: r[2].data, horas: r[3].data
    };
  }
  function crmLista(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function deDondeSale(p) {
    var its = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada'; });
    if (!its.length) return 'sin desarrollos cargados';
    if (esProyDetenido(p)) return '· puesto a mano, no lo mandan los desarrollos';
    var vivos = vivosDe(p).map(function (it) {
      var t = it.titulo || it.tipo || it.id;
      return esMant(it) && it.duracion ? t + ' · cuota ' + (it.cuotas_facturadas || 0) + '/' + it.duracion : t + (_canonSol(it.estado) === 'garantia' ? ' · en garantía' : ' · en curso');
    });
    var arr = its.filter(function (it) { return !it.detenido && _canonSol(it.estado) === 'aprobada'; }).map(function (it) { return it.titulo || it.id; });
    var sin = its.filter(function (it) { return !it.detenido && _canonSol(it.estado) === 'nueva'; }).map(function (it) { return it.titulo || it.id; });
    var q = [];
    if (vivos.length) q.push('por: ' + vivos.join(' | '));
    if (arr.length) q.push('falta arrancar: ' + arr.join(', '));
    if (sin.length) q.push('esperando aprobación: ' + sin.join(', '));
    return q.length ? '· ' + q.join(' · ') : '';
  }
  // La barra de estado ES el control: se toca el paso. Lo que no se puede elegir, apagado.
  function riel(p) {
    var can = _canonProy(p.estado_proyecto), det = esProyDetenido(p) || can === 'rechazado', idx = CAMINO.indexOf(can);
    return '<div class="riel"><div class="riel-h">' + ib('info', 'Tocá un paso de la barra para cambiar el estado del proyecto. Los apagados no se pueden elegir desde acá.', 'type="button"') +
      '<div class="riel-pasos">' + CAMINO.map(function (c, i) {
        var lbl = nombreProy(c), hecho = !det && idx >= 0 && i < idx, aqui = !det && i === idx, cls = colorEstadoProy(lbl).cls;
        var chk = puedeEstado(p, lbl), clic = chk.ok && !aqui;
        return '<button type="button" class="riel-paso' + (aqui ? ' aqui' : '') + (hecho ? ' pas' : '') + (chk.ok || aqui ? '' : ' no') + '"' +
          (clic ? ' data-pm="estado" data-id="' + esc(p.id) + '" data-est="' + c + '"' : ' disabled') +
          ' title="' + esc(aqui ? 'El proyecto está ' + lbl : (chk.ok ? 'Marcar como ' + lbl : chk.msg)) + '">' +
          '<i class="e-' + (aqui || hecho ? cls : 'xm') + '"></i><span class="' + (aqui ? 't-' + cls : '') + '">' + esc(lbl) + '</span></button>';
      }).join('') + '</div>' + (esProyDetenido(p) ? est('Detenido', 'xm') : '') +
      (can === 'finalizado' ? '' : ib(esProyDetenido(p) ? 'play' : 'pausa', esProyDetenido(p) ? 'Reanudar el proyecto' : 'Detener el proyecto: los estados no cambian, queda marcado', 'data-pm="det-proy" data-id="' + esc(p.id) + '"')) +
      '</div></div>';
  }
  function fechasHTML(p) {
    var devs = (p.items || []).filter(function (it) { return !esMant(it); });
    var aprob = null; (p.items || []).forEach(function (it) { var f = _pd(it.fecha_aprob); if (f && (!aprob || f > aprob)) aprob = f; });
    var inicio = mInicio(p), fo = mFinObra(p), fm = mFinMant(p), dur = mDuracionMeses(p), gar = null, garDias = 0;
    devs.forEach(function (it) {
      var f = _pd(it.fecha_fin || it.fecha_cierre), d = Number(it.garantia_dias) || 0; if (!f || !d) return;
      var v = mCorrerDias(f, d); if (!gar || v > gar) { gar = v; garDias = d; }
    });
    if (!aprob && !inicio && !fo.fecha && !fm.fecha && !gar) return '<div class="u-s10-mt">Sin fechas cargadas.</div>';
    var fila = function (l, v, cls, nota) { return '<div class="seg-kv"><span>' + l + '</span><b class="' + (cls || '') + '">' + v + (nota ? ' <span class="u-s10-mt">' + nota + '</span>' : '') + '</b></div>'; };
    var h = '';
    if (aprob) h += fila('Aprobado', ff(aprob), 't-xg');
    if (inicio) h += fila('Inicio', ff(inicio), '', dur ? dur + ' mes' + (dur === 1 ? '' : 'es') + ' de duración' : '');
    if (fo.fecha) h += fila(fo.faltan ? 'Fin de obra (parcial)' : 'Fin de obra', ff(fo.fecha), '',
      fo.faltan ? 'última fecha cargada · ' + fo.faltan + ' desarrollo' + (fo.faltan === 1 ? '' : 's') + ' sin fecha de fin' : 'todos los desarrollos entregados');
    else if (devs.length) h += fila('Fin de obra', 'Sin calcular', 'u-c-mt', fo.faltan + ' desarrollo' + (fo.faltan === 1 ? '' : 's') + ' sin fecha de fin');
    if (gar) { var q = mFaltan(gar); h += fila('Garantía', ff(gar), q < 0 ? 'u-c-mt' : 't-xt', garDias + ' días' + (q < 0 ? ' · vencida' : ' · quedan ' + q)); }
    if (fm.fecha) h += fila('Fin de mantenimiento', ff(fm.fecha), 't-xv', fm.totales ? 'va por la cuota ' + fm.cobradas + ' de ' + fm.totales : '');
    return h;
  }
  function tabInfo(p) {
    var F = P.f, dur = mDuracionMeses(p), cie = mCierre(p);
    var h = '<details class="desp plano" open><summary><span class="u-f1m">Datos del proyecto</span></summary><div>' +
      '<div class="fg"><label class="fl">Descripción</label><div class="ficha-desc">' + esc(p.descripcion || '—') + '</div></div><div class="gauto u-mb10">' +
      [['Sponsor', p.sponsor], ['Owner', nombre(p.owner)], ['Probabilidad', (p.probabilidad || 0) + '%'],
       ['Duración', dur ? dur + ' mes' + (dur === 1 ? '' : 'es') : '—'], ['Fecha propuesta', ff(p.fecha_propuesta)],
       ['Inicio', ff(mInicio(p))], ['Cierre estimado', cie.fecha ? ff(cie.fecha) + (cie.firme ? '' : ' (parcial)') : '—']].map(function (x) {
        return '<div class="fg u-m0"><label class="fl">' + x[0] + '</label><div>' + esc(String(x[1] || '—')) + '</div></div>';
      }).join('') + '</div>';
    if (!cie.firme && cie.faltan) h += '<div class="u-s10 u-c-wa u-mb10">' + ico('alerta') + ' ' + cie.faltan + ' desarrollo' + (cie.faltan === 1 ? '' : 's') + ' sin fecha de fin: el cierre y la duración se calculan con las fechas que hay.</div>';
    var drv = p.carpeta || (P.emps[p.empresa] || {}).drive_interno || '';
    h += '<div class="sec u-mt10">Drive interno</div>' + (drv ? '<a class="btn bg xs" href="' + esc(drv) + '" target="_blank" rel="noopener">' + ico('carpeta') + ' Abrir carpeta</a>' : '<span class="u-s10-mt">Sin carpeta cargada.</span>') + '</div></details>';
    // Contactos de la empresa; la estrella marca (y desmarca) los de este proyecto
    var enProy = crmLista(p.contactos), mio = function (c) { return enProy.indexOf(String(c.id)) >= 0; };
    h += '<details class="desp plano"><summary><span class="u-f1m">Contactos · ' + esc(p.empresa || '') + '</span>' +
      '<button class="btn bp xs" data-pm="contacto">' + ico('mas') + ' Contacto</button></summary><div>' +
      (F.cons.length ? F.cons.slice().sort(function (a, b) { return (mio(b) ? 1 : 0) - (mio(a) ? 1 : 0); }).map(function (c) {
        var tel = String(c.telefono || '').replace(/[^0-9]/g, '');
        return '<div class="u-row8 fe-linea"><button class="btn xs btn-ico' + (mio(c) ? ' t-xw' : '') + '" data-pm="estrella" data-id="' + esc(c.id) + '" data-tip="' + (mio(c) ? 'Sacar del proyecto' : 'Marcar como contacto de este proyecto') + '" aria-label="' + (mio(c) ? 'Sacar del proyecto' : 'Marcar como contacto de este proyecto') + '">' + (mio(c) ? '★' : '☆') + '</button>' +
          '<div class="u-f1m"><div class="u-fw6">' + esc(((c.nombre || '') + ' ' + (c.apellido || '')).trim() || '—') + '</div><div class="u-s10-mt">' + esc(c.puesto || c.area_trabajo || c.email || '') + '</div></div>' +
          (tel ? '<a class="btn bg xs btn-ico" href="https://wa.me/' + tel + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + ico('whatsapp') + '</a>' : '') +
          (c.email ? '<a class="btn bg xs btn-ico" href="mailto:' + esc(c.email) + '" data-tip="' + esc(c.email) + '" aria-label="Mail">' + ico('mail') + '</a>' : '') + '</div>';
      }).join('') : '<div class="u-s11-mt">Sin contactos cargados.</div>') + '</div></details>';
    h += '<details class="desp plano"><summary><span class="u-f1m">Cronograma</span></summary><div>' + fechasHTML(p) + '</div></details>';
    return h;
  }
  function mantArranca(p, m) {
    var mejor = null;
    (m.mant_de_ids || []).forEach(function (id) {
      var d = (p.items || []).find(function (x) { return x.id === id; }); if (!d) return;
      var f = _pd(d.fecha_fin || d.fecha_cierre); if (!f) return;
      f = mCorrerDias(f, Number(d.garantia_dias) || 0); if (!mejor || f > mejor) mejor = f;
    });
    return mejor;
  }
  function pasosDes(estado, det) {
    var can = _canonSol(estado || ''); if (can === 'rechazada') return '';
    var pasos = (EST_SPEC.desarrollo || []).filter(function (r) { return r.canon !== 'rechazada'; });
    var idx = det ? 1 : pasos.findIndex(function (r) { return r.canon === can; });
    return '<div class="riel-des">' + pasos.map(function (r, i) {
      var hecho = idx >= 0 && i < idx, aqui = i === idx, cls = det && aqui ? 'xm' : colorEstado(r.estado).cls;
      return '<i class="' + (aqui || hecho ? 'e-' + cls : 'e-xm fut') + (hecho ? ' pas' : '') + '" title="' + esc(r.estado) + '"></i>';
    }).join('') + '</div>';
  }
  function modulosDe(itemId) {
    var ent = {}, tot = { est: 0, real: 0 };
    P.f.horas.filter(function (r) { return r.desarrollo_id === itemId; }).forEach(function (r) {
      var k = r.modulo_nombre || 'Sin entregable', e = Number(r.horas_est) || 0, x = Number(r.horas_reales) || 0;
      ent[k] = ent[k] || { est: 0, real: 0 }; ent[k].est += e; ent[k].real += x; tot.est += e; tot.real += x;
    });
    var ks = Object.keys(ent); if (!ks.length) return '<span class="u-c-mt u-s11">Sin módulos cargados. Se cargan al cotizar.</span>';
    return ks.concat(['Total']).map(function (k) {
      var o = k === 'Total' ? tot : ent[k], d = o.est > 0 && o.real > 0 ? Math.round((o.real / o.est - 1) * 100) : null;
      return '<div class="seg-tar"><span class="u-f1m">' + esc(k) + '</span><span class="m m-neutro">' + Math.round(o.est * 10) / 10 + ' h</span>' +
        '<span class="m ' + (o.real ? 't-xw' : 'u-c-mt') + '">' + (o.real ? Math.round(o.real * 10) / 10 + ' h' : '—') + '</span>' +
        '<span class="m ' + (d === null ? 'u-c-mt' : d > 15 ? 'u-c-rd' : 't-xg') + '">' + (d === null ? '' : (d > 0 ? '+' : '') + d + '%') + '</span></div>';
    }).join('');
  }
  function tabDesarrollos(p) {
    var ord = { curso: 0, garantia: 1, aprobada: 2, nueva: 3, finalizada: 4, rechazada: 5 };
    var k = function (it) { return it.detenido ? 3.5 : (ord[_canonSol(it.estado)] === undefined ? 3 : ord[_canonSol(it.estado)]); };
    var lista = (p.items || []).slice().sort(function (a, b) { return k(a) - k(b); });
    if (!lista.length) return '<div class="empty">Sin desarrollos.</div>';
    return lista.map(function (it) {
      var rec = esMant(it), det = !!it.detenido || !!p.detenido, can = _canonSol(it.estado);
      var fact = Number(it.facturado) || 0, tot = Number(it.total_ars) || 0, cuota = Number(it.cuota_act) || Number(it.valor_cuota) || 0;
      var pend = rec ? Number(it.saldo) || 0 : Math.max(0, tot - fact), vivo = ['curso', 'garantia', 'aprobada', 'nueva'].indexOf(can) >= 0;
      var sub = [it.tipo_nombre || it.tipo, it.modelo_nombre || it.modelo].filter(Boolean).join(' · ');
      if (rec) { var cubre = (it.mant_de_ids || []).map(function (x) { var d = (p.items || []).find(function (y) { return y.id === x; }); return d ? (d.titulo || d.id) : ''; }).filter(Boolean); if (cubre.length) sub += ' · cubre ' + cubre.join(', '); }
      var cls = det ? 'xm' : colorEstado(it.estado).cls;
      var h = '<details class="des-card e-borde-' + (det ? 'xm' : vivo ? cls : 'xm') + (det || !vivo ? ' apagado' : '') + '"' + (P.fAb[it.id] !== undefined ? (P.fAb[it.id] ? ' open' : '') : ((lista.length === 1 || can === 'curso' || can === 'garantia') ? ' open' : '')) + ' data-des="' + esc(it.id) + '">' +
        '<summary class="des-h"><div class="u-row8"><div class="u-f1m"><div class="dev-tit">' + (rec ? ico('repetir') + ' ' : '') + esc(it.titulo || it.descripcion || '—') + '</div>' +
        '<div class="dev-sub">' + esc(sub) + '</div></div>' +
        (can === 'rechazada' || can === 'finalizada' || p.detenido ? '' : ib(it.detenido ? 'play' : 'pausa', it.detenido ? 'Reanudar este desarrollo' : 'Detener este desarrollo', 'data-pm="det-des" data-id="' + esc(it.id) + '"')) +
        (det ? '' : botonesDes(it, false)) +
        '<span class="dev-est t-' + cls + '">' + esc(it.estado || '—') + (det ? ' · detenido' : '') + '</span></div>' + (det ? '' : pasosDes(it.estado, false)) + '</summary><div class="des-b">';
      h += '<div class="seg-linea u-mt6">';
      if (rec) {
        if (cuota) h += '<span>Cuota <b class="m m-abono">' + fmt(cuota) + '/mes</b></span>';
        if (it.duracion) h += '<span>' + (it.cuotas_facturadas || 0) + ' de ' + it.duracion + ' cuotas</span>';
        h += '<span>Acumulado <b class="m m-cobrado">' + fmt(fact) + '</b></span>';
        if (pend) h += '<span>Por cobrar <b class="m m-pendiente">' + fmt(pend) + '</b></span>';
      } else {
        if (tot) h += '<span>Total <b class="m m-contratado">' + fmt(tot) + '</b></span>';
        h += '<span>Cobrado <b class="m m-cobrado">' + fmt(fact) + '</b></span>';
        if (pend > 0) h += '<span>Falta <b class="m m-pendiente">' + fmt(pend) + '</b></span>';
        if (it.cuotas > 1) h += '<span>' + it.cuotas + ' cuotas</span>';
      }
      if (it.horas) h += '<span>Vendidas <b>' + it.horas + ' h</b></span>';
      if (it.socios) h += '<span>' + ico('personas') + ' ' + esc(crmLista(it.socios).map(nombre).join(', ')) + '</span>';
      if (it.garantia_dias) h += '<span>' + it.garantia_dias + ' días de garantía</span>';
      h += '</div><div class="seg-linea u-s10-mt u-mt6">';
      if (rec) { var arr = mantArranca(p, it); h += arr ? '<span>Arranca <b>' + ff(arr) + '</b> — fin de obra + garantía</span>' : '<span class="u-c-wa">No se sabe cuándo arranca: falta vincularlo a un desarrollo o cargarle la fecha de fin</span>'; }
      else if (can === 'garantia') {
        // en garantía se corre el FIN: corre la garantía y el arranque del mantenimiento
        h += '<span>Inicio <b>' + (ff(it.fecha_est) || '—') + '</b></span><span>Fin <b>' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</b></span>' +
          '<button class="btn bg xs" data-pm="post-fin" data-id="' + esc(it.id) + '" data-d="7" title="Corre la garantía y el arranque del mantenimiento una semana">+1 sem.</button>' +
          '<button class="btn bg xs" data-pm="post-fin" data-id="' + esc(it.id) + '" data-d="30" title="Corre la garantía y el arranque del mantenimiento un mes">+1 mes</button>';
      } else if (desCerrado(it) || can === 'rechazada') {
        h += '<span>Inicio <b>' + (ff(it.fecha_est) || '—') + '</b></span><span>Fin <b>' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</b></span>';
      } else {
        h += '<span>Inicio</span><input class="fc u-wauto" type="date" data-fini="' + esc(it.id) + '" value="' + esc(it.fecha_est ? String(it.fecha_est).slice(0, 10) : '') + '" aria-label="Inicio del desarrollo">' +
          '<button class="btn bg xs" data-pm="post-ini" data-id="' + esc(it.id) + '" data-d="7" title="Corre el inicio una semana">+1 sem.</button>' +
          '<button class="btn bg xs" data-pm="post-ini" data-id="' + esc(it.id) + '" data-d="30" title="Corre el inicio un mes">+1 mes</button>' +
          (it.fecha_fin ? '<span>Fin <b>' + ff(it.fecha_fin) + '</b></span>' : '');
      }
      h += '</div>';
      if (it.descripcion) h += '<div class="u-s10-mt u-mt6">' + esc(it.descripcion) + '</div>';
      h += '<details class="desp plano u-mt6"><summary class="u-s11">Módulos de trabajo</summary><div>' + modulosDe(it.id) + '</div></details>';
      return h + '</div></details>';
    }).join('');
  }
  function tabTareas(p) {
    var F = P.f, h = '<div class="u-row8"><div class="sec u-f1">Tareas</div>' + ib('mas', 'Nueva tarea de este proyecto', 'data-pm="nueva-tarea" data-id="' + esc(p.id) + '"') + '</div>';
    var ab = F.tareas.filter(function (t) { return !t.closed; }).sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var tid = {}; F.tareas.forEach(function (t) { tid[t.id] = t; });
    h += ab.length ? ab.map(function (t) {
      var cs = F.coms.filter(function (c) { return c.tarea_id === t.id; }).slice(0, 2);
      return '<div class="seg-tar"><span class="u-f1m"><span class="seg-ell u-fw6" title="' + esc(t.title) + '">' + esc(t.title) + '</span>' +
        '<span class="u-s10-mt"> · ' + esc(crmLista(t.assignees).map(nombre).join(', ') || 'sin responsable') + '</span></span>' +
        (t.due ? '<span class="td-due' + (t.overdue ? ' late' : '') + '">' + ico('calendario') + ff(t.due) + '</span>' : '') +
        ib('chat', 'Ver, comentar, finalizar o delegar', 'data-pm="tarea" data-id="' + esc(t.id) + '"') + '</div>' +
        cs.map(function (c) { return '<div class="seg-sub">' + comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }) + '</div>'; }).join('');
    }).join('') : '<div class="u-s10-mt">Sin tareas pendientes.</div>';
    var otros = F.coms.filter(function (c) { return !c.tarea_id || !tid[c.tarea_id]; });
    h += '<div class="sec u-mt10">Otros comentarios</div>' +
      '<div class="seg-nota"><input class="fc" data-segnota="' + esc(p.id) + '" placeholder="Comentar el proyecto y Enter…" aria-label="Comentar el proyecto"></div>' +
      (otros.length ? otros.slice(0, 10).map(function (c) { return comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }); }).join('') : '<div class="u-s10-mt">Sin comentarios.</div>');
    return h;
  }
  function lateral(p) {
    var caja = function (lbl, val, cls, sub, ars) {
      return '<div class="lat-caja"><div class="sec">' + lbl + '</div><div class="m ' + cls + '">' + val + '</div>' +
        (ars && _tc() > 0 ? '<div class="m m-usd lat-usd">' + fmt(ars / _tc(), 'USD') + '</div>' : '') + (sub ? '<div class="lat-sub">' + sub + '</div>' : '') + '</div>';
    };
    var tot = mTotal(p), cob = mCobradoDev(p), sal = mSaldo(p);
    var nDev = (p.items || []).filter(function (x) { return !esMant(x) && esGanado(x.estado); }).length, nDevT = (p.items || []).filter(function (x) { return !esMant(x); }).length;
    var h = '<div class="ficha-lat"><div class="card u-p1214"><div class="u-row8 u-mb6"><span class="sec u-f1">Desarrollos</span>' +
      '<span class="u-s10-mt">' + nDev + (nDevT > nDev ? ' de ' + nDevT : '') + ' contratado' + (nDev === 1 ? '' : 's') + '</span></div><div class="lat-cajas">' +
      caja('Contratado', fmt(tot), 'm-contratado', '', tot) + caja('Cobrado', fmt(cob), 'm-cobrado', '', cob) + caja('Pendiente', fmt(sal), 'm-pendiente', '', sal) + '</div></div>';
    var rec = mRecurrente(p), sm = mSaldoMant(p);
    if (rec > 0 || sm > 0) {
      var fm = mFinMant(p), falta = Math.max(0, fm.totales - fm.cobradas);
      h += '<div class="card u-p1214"><div class="sec">Mantenimiento y soporte</div><div class="lat-cajas">' +
        caja('Abono mensual', fmt(rec), 'm-abono', (p.mant_vivos || 0) + ' en curso', rec) +
        caja('Ya cobrado', fmt(mCobradoMant(p)), 'm-cobrado', fm.cobradas + ' cuota' + (fm.cobradas === 1 ? '' : 's'), mCobradoMant(p)) +
        caja('Faltan', falta + ' cuota' + (falta === 1 ? '' : 's'), 'm-pendiente', fm.totales ? 'de ' + fm.totales : '') +
        caja('Por cobrar', fmt(sm), 'm-pendiente', '', sm) + '</div><div class="lat-sub u-mt6">No suma al contratado: se factura por cuota.</div></div>';
    }
    var hs = sum(p.items, 'horas');
    if (hs) h += '<div class="card u-p1214"><div class="sec">Del contrato</div><div class="lat-cajas">' + caja('Horas vendidas', hs + ' h', 'm-neutro') + '</div></div>';
    return h + '</div>';
  }
  function htmlFicha() {
    var p = P.proys.find(function (x) { return x.id === P.f.id; }); if (!p) return '<div class="empty">Proyecto no encontrado.</div>';
    var lista = P.fLista, i = lista.indexOf(p.id), e = p.estado_proyecto || 'Prospecto', ab = P.f.tareas.filter(function (t) { return !t.closed; }).length;
    var tabs = [['info', 'Información', tabInfo], ['desarrollos', 'Desarrollos' + ((p.items || []).length ? ' (' + p.items.length + ')' : ''), tabDesarrollos],
                ['tareas', 'Tareas y comentarios' + (ab ? ' (' + ab + ')' : ''), tabTareas]];
    var h = '<div class="u-row8 u-mb12"><button class="btn bg sm" data-pm="volver">' + ico('izquierda') + ' Volver</button>' +
      (lista.length > 1 ? ib('izquierda', 'Proyecto anterior', 'data-pm="nav" data-dir="-1"') + '<span class="u-s11-mt m">' + (i + 1) + '/' + lista.length + '</span>' + ib('derecha', 'Proyecto siguiente', 'data-pm="nav" data-dir="1"') : '') + '</div>';
    h += '<div class="ficha-grid"><div class="card u-p0"><div class="ficha-cab">' +
      '<div class="u-row8">' + logo(p.empresa, 'emp-logo', 'emp-ini') + '<div class="u-f1m"><div class="u-s11-mt">' + esc(p.empresa) + '</div>' +
      '<div class="ficha-tit">' + esc(p.nombre) + '</div><div class="u-row8">' + est(e, colorEstadoProy(e).cls) + '<span class="u-s10-mt">' + esc(deDondeSale(p)) + '</span></div></div>' +
      '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener" title="Recotizar, renovar, editar, mejora y horas de soporte">' + ico('abrir') + ' Cotizar en el CRM actual</a></div>' + riel(p) + '</div>' +
      '<div class="u-p14"><div class="ptabs">' + tabs.map(function (t) { return '<button class="ptab' + (t[0] === P.fTab ? ' on' : '') + '" data-pm="ftab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (tabs.find(function (t) { return t[0] === P.fTab; }) || tabs[1])[2](p) + '</div></div>' + lateral(p) + '</div>';
    return h;
  }
  async function abrirFicha(el, id, desde) {
    var desdeLista = !desde;                      // con «desde» viene de las flechitas: la lista ya está
    P.prev = desde || P.sub; P.sub = 'ficha';
    // la lista para las flechitas: lo que se estaba viendo, en el orden de la pantalla
    if (desdeLista) {
      P.fLista = Array.prototype.map.call(el.querySelectorAll('[data-pm="ficha"]'), function (b) { return b.getAttribute('data-id'); })
        .filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    if (P.fLista.indexOf(id) < 0) P.fLista.push(id);
    el.querySelector('.ptabs') && (el.innerHTML = '<div class="loading"><div class="spin"></div> Abriendo la ficha…</div>');
    await cargarFicha(id); pintar(el); window.scrollTo(0, 0);
  }

  // ── aprobar: qué entró, qué no y qué queda en espera (aprobarProyecto) ──
  function abrirAprobar(p) {
    var nuevas = (p.items || []).filter(function (it) { return _canonSol(it.estado || '') === 'nueva'; });
    if (!nuevas.length) return say('Este proyecto no tiene desarrollos en Nuevo para aprobar.', 'Aprobar propuesta');
    var m = document.getElementById('m-aprob');
    if (!m) {
      m = document.createElement('div'); m.className = 'mo'; m.id = 'm-aprob';
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Aprobar propuesta</span>' +
        '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-aprob">' + ico('cerrar') + '</button></div>' +
        '<div class="mb2"><div class="u-s11-mt u-mb10" id="ap-n"></div><div id="ap-list"></div></div>' +
        '<div class="mf"><button class="btn bg" data-cerrar="m-aprob">Cancelar</button><button class="btn bp" id="ap-ok">Aprobar</button></div></div>';
      document.body.appendChild(m);
    }
    document.getElementById('ap-n').textContent = nuevas.length + ' desarrollo(s) cotizado(s). Lo que marques como «Entró» pasa a Aprobado.';
    document.getElementById('ap-list').innerHTML = nuevas.map(function (it) {
      return '<div class="rowb u-row8"><div class="u-f1m"><div class="u-fw6">' + esc(it.titulo || it.tipo || it.id) + '</div>' +
        '<div class="u-s10-mt">' + esc(it.tipo_nombre || it.tipo || '') + ' · ' + fmt(Number(it.total_ars) || 0) + '</div></div>' +
        '<select class="fc u-wauto" data-ap="' + esc(it.id) + '" aria-label="Decisión"><option value="entro">Entró</option><option value="rechazado">No entró</option><option value="espera">En espera</option></select></div>';
    }).join('');
    return new Promise(function (res) {
      document.getElementById('ap-ok').onclick = function () {
        var dec = {}, n = 0;
        document.querySelectorAll('#ap-list [data-ap]').forEach(function (x) { dec[x.getAttribute('data-ap')] = x.value; if (x.value === 'entro') n++; });
        if (!n) return say('Marcá al menos uno como «Entró».\n\nSi no entró nada, usá el paso Rechazado de la barra.', 'Aprobar propuesta');
        closeM('m-aprob'); res(dec);
      };
      openM('m-aprob');
    });
  }

  // ── pintar ───────────────────────────────────────────────────
  function pintar(el) {
    var cab = '<div class="page-h"><div><h2>Proyectos</h2><div class="page-s">Seguimiento y estado de cada proyecto.</div></div></div>' +
      '<div class="ptabs" role="tablist">' + SUBS.map(function (s) {
        return '<button class="ptab' + (P.sub === s[0] ? ' on' : '') + '" data-pm="sub" data-s="' + s[0] + '" role="tab">' + s[1] + '</button>';
      }).join('') + '</div>';
    if (P.sub === 'ficha') { el.innerHTML = htmlFicha(); return; }
    if (P.sub === 'seg') el.innerHTML = cab + '<div id="seg-c">' + htmlSeg() + '</div>';
    else if (P.sub === 'proy') el.innerHTML = cab + htmlProy();
    else el.innerHTML = cab + '<div class="card"><p>Esta vista todavía funciona en el CRM actual.</p>' +
      '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' + ico('abrir') + ' Abrir el CRM actual</a></div>';
  }
  function repintarConFoco(el, id) {
    var q = document.getElementById(id), pos = q ? q.selectionStart : 0;
    pintar(el);
    var n = document.getElementById(id); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  }

  VISTAS.pm = async function (el) {
    el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando proyectos…</div>';
    var refrescar = async function () { await cargar(); if (P.sub === 'ficha' && P.f) await cargarFicha(P.f.id); pintar(el); };
    await refrescar();
    if (!el._pmBound) {                          // una vez: #vista es el mismo para todos los módulos
      el._pmBound = true;
      el.addEventListener('toggle', function (ev) {
        var d = ev.target; if (!d.matches) return;
        if (d.matches('details[data-segdesp]')) P.seg.abierto[d.getAttribute('data-segdesp')] = d.open;
        if (d.matches('details[data-emp]')) P.pr.abiertas[d.getAttribute('data-emp')] = d.open;
        if (d.matches('details[data-des]')) P.fAb[d.getAttribute('data-des')] = d.open;
      }, true);
    }
    var alGuardar = { onSave: refrescar };
    el.oninput = function (ev) {
      if (ev.target.id === 'seg-q') { P.seg.q = ev.target.value; repintarConFoco(el, 'seg-q'); }
      if (ev.target.id === 'pr-q') { P.pr.q = ev.target.value; repintarConFoco(el, 'pr-q'); }
    };
    // Una acción en la base: si sale bien, aviso y releer; si no, el motivo
    var hacer = async function (fn, args, okMsg, aviso) {
      var r = await db().rpc(fn, args);
      if (r.error) { toast(r.error.message, 'err'); return null; }
      toast(typeof okMsg === 'function' ? okMsg(r.data) : (okMsg || (r.data && r.data.msg) || 'Listo'), 'ok');
      if (aviso) toast(AVISO_ALERTAS, 'inf');
      await refrescar();
      return r.data;
    };
    var proy = function (id) { return P.proys.find(function (x) { return x.id === id; }); };
    var itemDe = function (iid) { var it = null; P.proys.some(function (p) { return (it = (p.items || []).find(function (x) { return x.id === iid; })); }); return it; };
    var cambiarEstado = async function (p, canon) {
      switch (canon) {
        case 'negociacion':
          if (!(await ask('¿Enviar la propuesta?\n\nEl proyecto pasa a Negociación. Los desarrollos siguen en Nuevo.', 'Enviar propuesta'))) return;
          return hacer('enviar_propuesta', { pid: p.id, fecha: null });
        case 'aprobado':                         // aprobar no es un cambio de estado: es decidir qué entró
          var dec = await abrirAprobar(p); if (!dec) return;
          return hacer('aprobar_proyecto', { pid: p.id, decisiones: dec }, null, true);
        case 'finalizado':
          var ab = (p.items || []).filter(function (it) { var c = _canonSol(it.estado || ''); return c === 'curso' || c === 'garantia' || c === 'aprobada'; });
          var msg = ab.length ? '¿Finalizar el proyecto?\n\nQuedan ' + ab.length + ' desarrollo(s) sin cerrar:\n' +
              ab.map(function (it) { return '· ' + (it.titulo || it.tipo || it.id) + ' — ' + (it.estado || ''); }).join('\n') + '\n\nSe cierran todos junto con el proyecto.'
            : '¿Finalizar el proyecto?\n\nTodos los desarrollos ya están cerrados.';
          if (!(await ask(msg, 'Finalizar proyecto'))) return;
          return hacer('finalizar_proyecto', { pid: p.id });
        case 'rechazado':
          if (!(await ask('¿Rechazar el proyecto?\n\nTodos sus desarrollos pasan a Rechazado.', 'Rechazar proyecto', { peligro: true }))) return;
          return hacer('rechazar_proyecto', { pid: p.id }, null, true);
        case 'activo': return toast('«Activo» se calcula solo: arrancá un desarrollo desde su fila', 'inf');
      }
      return hacer('cambiar_estado_proyecto', { pid: p.id, estado: nombreProy(canon) }, 'Estado: ' + nombreProy(canon));
    };
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.id === 'pr-orden') { P.pr.orden = t.value; return pintar(el); }
      if (t.hasAttribute && t.hasAttribute('data-fini')) return hacer('fecha_desarrollo', { did: t.getAttribute('data-fini'), campo: 'fecha_ini', fecha: t.value || null }, 'Fecha del desarrollo guardada');
    };
    // Comentario rápido: Enter guarda en el proyecto
    el.onkeydown = async function (ev) {
      var t = ev.target; if (ev.key !== 'Enter' || !t.hasAttribute || !t.hasAttribute('data-segnota')) return;
      var txt = t.value.trim(); if (!txt) return;
      t.disabled = true;
      var r = await db().rpc('comentar', { p: { proyecto_id: t.getAttribute('data-segnota'), texto: txt } });
      if (r.error) { t.disabled = false; return toast(r.error.message, 'err'); }
      toast('Comentario guardado', 'ok'); refrescar();
    };
    el.onclick = function (ev) {
      var b = ev.target.closest('[data-pm]'); if (!b) return;
      var a = b.getAttribute('data-pm'), id = b.getAttribute('data-id');
      if (a === 'sub') { P.sub = b.getAttribute('data-s'); return pintar(el); }
      if (a === 'ficha') return abrirFicha(el, id);
      if (a === 'volver') { P.sub = P.prev || 'seg'; return pintar(el); }
      if (a === 'nav') {
        var L = P.fLista, k = (L.indexOf(P.f.id) + Number(b.getAttribute('data-dir')) + L.length) % L.length;
        return abrirFicha(el, L[k], P.prev);
      }
      if (a === 'ftab') { P.fTab = b.getAttribute('data-t'); return pintar(el); }
      // ── acciones (5c) ──
      if (a === 'estado') { ev.preventDefault(); return cambiarEstado(proy(id), b.getAttribute('data-est')); }
      if (a === 'det-proy') {
        ev.preventDefault();
        var pd = proy(id), det = !pd.detenido;
        return ask(det ? '¿Detener el proyecto? El estado no cambia: queda marcado y griseado.' : '¿Reanudar el proyecto?').then(function (ok) {
          if (ok) hacer('detener_proyecto', { pid: id, detener: det });
        });
      }
      if (a === 'det-des') { ev.preventDefault(); var dd = itemDe(id); return hacer('detener_desarrollo', { did: id, detener: !dd.detenido }, dd.detenido ? 'Desarrollo reanudado' : 'Desarrollo detenido'); }
      if (a === 'acc-des') {
        ev.preventDefault();
        var acc = b.getAttribute('data-acc');
        // accion_desarrollo crea sola las alertas de facturación y los recordatorios del desarrollo
        var go = function () { hacer('accion_desarrollo', { did: id, accion: acc }, function (r) {
          var f = r.alertas_facturacion || {}, extra = (f.creadas ? ' · ' + f.creadas + ' alerta(s) de facturación' : '') + (f.cerradas ? ' · ' + f.cerradas + ' cerrada(s)' : '');
          return r.de + ' → ' + r.a + extra; }); };
        if (acc === 'rechazar') return ask('¿Rechazar este desarrollo? Se puede recotizar después.', 'Rechazar desarrollo', { peligro: true }).then(function (ok) { if (ok) go(); });
        return go();
      }
      if (a === 'cerrar-mod') { ev.preventDefault(); return hacer('cerrar_modulo_horas', { hid: id, cerrar: true }, function (r) { return 'Módulo cerrado (' + r.n + ')'; }); }
      if (a === 'post-ini' || a === 'post-fin') {
        var it = itemDe(id), base = _pd(a === 'post-ini' ? it.fecha_est : (it.fecha_fin || it.fecha_cierre));
        if (!base) return toast(a === 'post-ini' ? 'Cargá primero la fecha de inicio del desarrollo' : 'El desarrollo no tiene fecha de fin', 'err');
        var nf = mISO(mCorrerDias(base, Number(b.getAttribute('data-d'))));
        return hacer('fecha_desarrollo', { did: id, campo: a === 'post-ini' ? 'fecha_ini' : 'fecha_fin', fecha: nf },
          a === 'post-ini' ? 'Inicio corrido al ' + ff(nf) : 'Garantía corrida al ' + ff(nf));
      }
      if (a === 'estrella') {
        var pe = proy(P.f.id), l = crmLista(pe.contactos), k2 = l.indexOf(id);
        if (k2 >= 0) l.splice(k2, 1); else l.push(id);
        return hacer('contactos_proyecto', { pid: pe.id, lista: l.join(',') }, k2 >= 0 ? 'Sacado del proyecto' : 'Agregado al proyecto');
      }
      if (a === 'contacto') { var pp = P.proys.find(function (x) { return x.id === P.f.id; }); return abrirFichaEmpresa(pp.empresa_id, { nuevoContacto: true, onSave: refrescar }); }
      if (a === 'segfil') { P.seg.fil = b.getAttribute('data-f'); return pintar(el); }
      if (a === 'segemp') {
        var c = {}; try { c = JSON.parse(localStorage.getItem('seg_cerr') || '{}') || {}; } catch (e) { c = {}; }
        var emp = b.getAttribute('data-emp'); c[emp] = !c[emp];
        try { localStorage.setItem('seg_cerr', JSON.stringify(c)); } catch (e) {}
        return pintar(el);
      }
      if (a === 'scr') {
        var tr = el.querySelector('[data-track="' + b.getAttribute('data-g') + '"]');
        if (tr) tr.scrollBy({ left: Number(b.getAttribute('data-dir')) * tr.clientWidth * 0.9, behavior: 'smooth' });
        return;
      }
      if (a === 'rev') { var i = P.seg.rev.indexOf(id); if (i >= 0) P.seg.rev.splice(i, 1); else P.seg.rev.push(id); return pintar(el); }
      if (a === 'tarea') return verTarea(id, alGuardar);
      if (a === 'nueva-tarea') return nuevaTarea({ projectId: id }, alGuardar);
      if (a === 'prfil') {
        var f = b.getAttribute('data-f'), R = P.pr;
        if (f === 'todos') R.fil = []; else { var j = R.fil.indexOf(f); if (j >= 0) R.fil.splice(j, 1); else R.fil.push(f); }
        return pintar(el);
      }
    };
  };
})();

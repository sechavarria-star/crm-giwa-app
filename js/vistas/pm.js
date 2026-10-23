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

   PENDIENTE: la ficha del proyecto (5b) y las acciones que cambian el
   proyecto o el desarrollo — detener, aprobar, enviar propuesta, cerrar
   etapa — (5c). Mientras, la ficha abre el CRM actual. Tareas, Agenda y
   Nuevo proyecto también siguen allá.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var P = { proys: [], emps: {}, users: {}, sub: 'seg',
            seg: { fil: 'vivos', q: '', rev: [], abierto: {} }, pr: { fil: [], q: '', orden: 'empresa', abiertas: {} } };
  var CARRUSEL = 3;   // más de esto por cliente → carrusel
  var SUBS = [['seg', 'Seguimiento'], ['proy', 'Proyectos'], ['tar', 'Tareas'], ['nuevo', 'Nuevo proyecto']];

  async function cargar() {
    var r = await Promise.all([
      db().from('v_pm_proyectos').select('*'),
      db().from('v_pm_seguimiento').select('*'),
      db().from('empresas').select('id,nombre,logo'),
      db().from('usuarios').select('mail,nombre'),
      db().rpc('estados_spec')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    initEstadosSpec(r[4].data);
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
  function fichaVieja(tit) {
    return '<a class="btn xs btn-ico" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener" data-tip="' + esc(tit) + '" aria-label="' + esc(tit) + '">' + ico('abrir') + '</a>';
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
      '<div class="seg-hacc">' + est(e, ec.cls) + (p.detenido ? est('Detenido', 'xm') : '') + fichaVieja('Abrir la ficha del proyecto (CRM actual)') + '</div></div>';
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
        return desp(p, 'mod:' + k, tit, '<div class="seg-tars">' + acts + '</div>');
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
    h += '<div class="u-row8"><div class="proy-row-name u-f1m">' + esc(p.nombre || '—') + '</div>' + fichaVieja('Abrir la ficha del proyecto (CRM actual)') + '</div>';
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

  // ── pintar ───────────────────────────────────────────────────
  function pintar(el) {
    var cab = '<div class="page-h"><div><h2>Proyectos</h2><div class="page-s">Seguimiento y estado de cada proyecto.</div></div></div>' +
      '<div class="ptabs" role="tablist">' + SUBS.map(function (s) {
        return '<button class="ptab' + (P.sub === s[0] ? ' on' : '') + '" data-pm="sub" data-s="' + s[0] + '" role="tab">' + s[1] + '</button>';
      }).join('') + '</div>';
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
    var refrescar = async function () { await cargar(); pintar(el); };
    await refrescar();
    if (!el._pmBound) {                          // una vez: #vista es el mismo para todos los módulos
      el._pmBound = true;
      el.addEventListener('toggle', function (ev) {
        var d = ev.target; if (!d.matches) return;
        if (d.matches('details[data-segdesp]')) P.seg.abierto[d.getAttribute('data-segdesp')] = d.open;
        if (d.matches('details[data-emp]')) P.pr.abiertas[d.getAttribute('data-emp')] = d.open;
      }, true);
    }
    var alGuardar = { onSave: refrescar };
    el.oninput = function (ev) {
      if (ev.target.id === 'seg-q') { P.seg.q = ev.target.value; repintarConFoco(el, 'seg-q'); }
      if (ev.target.id === 'pr-q') { P.pr.q = ev.target.value; repintarConFoco(el, 'pr-q'); }
    };
    el.onchange = function (ev) { if (ev.target.id === 'pr-orden') { P.pr.orden = ev.target.value; pintar(el); } };
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

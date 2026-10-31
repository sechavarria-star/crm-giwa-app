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
   fechas, cerrar una etapa de módulos, marcar contactos y editar el
   proyecto mientras está en pipeline (editar_proyecto).

   Como en el Apps Script, arrancar / deployar / finalizar / rechazar un
   desarrollo crean solos sus alertas de facturación y recordatorios.

   PENDIENTE: Cotizar —recotizar, renovar, editar, mejora, horas de
   soporte— sigue allá, igual que Agenda y Nuevo proyecto. La pestaña
   Soporte (tickets) no se pasa: va a su propio módulo, Soporte. Análisis: v_analisis_clientes (= getAnalisisCliente). Las tareas viven en Hoy (vistas/hoy.js).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var P = { proys: [], emps: {}, users: {}, sub: 'seg',
            seg: { fil: [], q: '', rev: [], abierto: {} }, pr: { fil: [], q: '', orden: 'monto', abiertas: {} },
            f: null, fLista: [], fTab: 'desarrollos', fAb: {}, prev: 'seg' };
  var CARRUSEL = 3;   // más de esto por cliente → carrusel
  var SUBS = [['seg', 'Seguimiento'], ['proy', 'Proyectos'], ['nuevo', 'Nuevo proyecto']];   // Tareas vive en Hoy (29/10/2026)

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
    P.ok = true;
  }

  // ── ayudas ───────────────────────────────────────────────────
  function nombre(m) { var e = String(m || '').trim().toLowerCase(); return P.users[e] || (e.indexOf('@') >= 0 ? e.split('@')[0] : String(m || '')); }
  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Finalizado (verde) lleva además el tilde: así no se confunde con Activo/En curso (turquesa), sin tocar los colores
  function est(txt, cls) { return '<span class="est t-' + cls + '"><i class="est-dot e-' + cls + '"></i>' + esc(txt || '—') + '</span>'; }   // sin tilde en Finalizado: confundía (29/10/2026)
  // Abono por vencer (29/10/2026): mantenimiento vigente en su última cuota o a menos
  // de 30 días de su fecha de fin. Va en rojo en el encabezado: antes vencía en silencio.
  function abonoPorVencer(p) {
    var hoy = _pd(isoMas(0));
    return (p.items || []).filter(function (it) {
      if (!esMant(it) || it.detenido || !esGanado(it.estado) || _canonSol(it.estado) === 'finalizada') return false;
      var d = Number(it.duracion) || 12, cf = Number(it.cuotas_facturadas) || 0, fin = _pd(it.fecha_fin);
      return d - cf <= 1 || (fin && (fin - hoy) / 864e5 < 30);
    });
  }
  // Comentario que escribe el sistema, no una persona: delegar, procesar, posponer, cerrar, IPC
  function esAuditoria(c) { return /^(delegada|viene de|procesada|pospuesta|reprogramada|cerrada|finalizada|ipc|ajuste ipc)\b/i.test(String(c.texto || '').trim()); }
  function avisoAbono(p) {
    var v = abonoPorVencer(p); if (!v.length) return '';
    return '<span class="ui-st ui-p-error" title="' + esc(v.map(function (it) { return it.titulo || it.id; }).join(' · ')) + '">' + uiIco('alerta') + 'Abono por vencer</span>';
  }
  // El chevron de todos los desplegables: el mismo ícono de línea, gira al abrir (app.css · .chev)
  function chev() { return '<span class="chev">' + ico('derecha') + '</span>'; }
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
    return '<div class="ui-linea"><span class="ui-f1" title="' + esc(t) + '">' + (a ? '<span class="ui-nota-t">' + esc(a) + ':</span> ' : '') + esc(t) + '</span>' +
      '<span class="ui-nota-t">' + hace(c.fecha) + '</span></div>';
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
    var hov = { check: 'fin', cerrar: 'bor' };   // C11: el hover dice el resultado
    return acc.map(function (a) { return uiIb(a[2], a[1] + ': ' + a[3], hov[a[2]] || '', 'data-pm="acc-des" data-id="' + esc(it.id) + '" data-acc="' + a[0] + '"'); }).join('');
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
  // Filtros de Seguimiento (29/10/2026): los estados reales del proyecto, más dos condiciones
  // de Activo (En garantía / En mantenimiento) y Detenido. Rechazado y Finalizado van en Proyectos.
  // [clave, etiqueta, color, tramo]: 'c' = el camino del proyecto (en orden), 'x' = condiciones aparte
  var SEG_FIL = [['prospecto', 'Prospecto', 'xn', 'c'], ['negociacion', 'Negociación', 'xw', 'c'], ['aprobado', 'Aprobado', 'xb', 'c'], ['activo', 'Activo', 'xc', 'c'],
                 ['det', 'Detenido', 'xd', 'x'], ['garantia', 'En garantía', 'xt', 'x'], ['mant', 'En mantenimiento', 'xv', 'x']];
  // La barra de filtros es la barrita de estados (la misma que la del proyecto): un tramo por estado,
  // con su color y su número; tocarlo filtra, tocarlo de nuevo vuelve a todos (29/10/2026).
  // Selección múltiple: se suman los tramos tocados; tocar uno elegido lo quita (fil = lista de claves)
  var togFil = function (L, k) { if (k === 'todos') return []; var i = L.indexOf(k); if (i >= 0) L.splice(i, 1); else L.push(k); return L; };
  // C7 · riel de estados como filtro de pantalla: etapas en orden, lo que no es etapa aparte (30/10/2026)
  var COLOR_FIL = { activo: 'curso', det: 'detenido' };
  function barraFiltro(defs, fil, n, attr, total, mostrando) {
    fil = fil || [];
    var seg = function (d) {
      return { k: COLOR_FIL[d[0]] || d[0], c: d[0] === 'mant' ? 'p-abono' : '', t: d[1], n: n(d[0]), on: fil.indexOf(d[0]) >= 0,
               attrs: 'data-pm="' + attr + '" data-f="' + d[0] + '" title="' + (fil.indexOf(d[0]) >= 0 ? 'Quitar: ' : 'Sumar: ') + esc(d[1]) + '"' };
    };
    return uiRiel(defs.filter(function (d) { return d[3] === 'c'; }).map(seg), defs.filter(function (d) { return d[3] === 'x'; }).map(seg)) +
      '<div class="ui-nota-t ui-rapido">Mostrando <span class="ui-num">' + mostrando + '</span> de <span class="ui-num">' + total + '</span> proyectos' +
      (fil.length ? ' · <button type="button" class="ui-lnk ui-azul" data-pm="' + attr + '" data-f="todos">Ver todos</button>' : '') + '</div><br>';
  }
  function segPasa(p, fil) {
    var c = _canonProy(p.estado_proyecto);
    if (c === 'rechazado' || c === 'finalizado') return false;
    if (fil === 'det') return esProyDetenido(p);
    if (fil === 'todos' || !fil) return true;
    if (esProyDetenido(p)) return false;
    var vivos = (p.items || []).filter(function (it) { return !it.detenido && ['curso', 'garantia'].indexOf(_canonSol(it.estado)) >= 0; });
    if (fil === 'garantia') return c === 'activo' && vivos.some(function (it) { return _canonSol(it.estado) === 'garantia'; });
    if (fil === 'mant') return c === 'activo' && vivos.length > 0 && vivos.every(esMant) &&
      (p.items || []).filter(function (it) { return !esMant(it); }).every(function (it) { return ['finalizada', 'rechazada'].indexOf(_canonSol(it.estado)) >= 0; });
    return c === fil;
  }
  // C3 con su estado recordado (P.seg.abierto) · o: { th, n, v }
  function desp(p, k, o, cuerpo) {
    var key = p.id + ':' + k;
    o.open = !!P.seg.abierto[key]; o.attrs = 'data-segdesp="' + esc(key) + '"';
    return uiDesp(o, cuerpo);
  }
  // Tarjeta de Seguimiento (C5 · plan por vista): título y responsable; arriba a la derecha el estado (C6)
  // con Detener y Finalizar como íconos; «Proyecto» secundario y el pulgar de «Ya lo revisé»; motivo en gris.
  function segCard(p) {
    var e = p.estado_proyecto || 'Prospecto', can = _canonProy(e);
    var rev = P.seg.rev.indexOf(p.id) >= 0, pid = esc(p.id), acc = p.detenido ? [] : accionesProy(p);
    var its = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada'; });
    var h = '<div class="ui-tarjeta' + (p.detenido || rev ? ' ui-apagada' : '') + '">';
    var iconos = (can === 'finalizado' || can === 'rechazado' ? '' :
        (p.detenido ? uiIb('play', 'Reanudar', '', 'data-pm="det-proy" data-id="' + pid + '"') : uiAcc('detener', 'data-pm="det-proy" data-id="' + pid + '"'))) +
      (acc.some(function (a) { return a[0] === 'finalizado'; }) ? uiAcc('finalizar', 'data-pm="estado" data-id="' + pid + '" data-est="finalizado"') : '');
    h += '<div class="ui-tarjeta-hd"><div><div class="ui-pro">' + esc(p.nombre || '—') + '</div>' +
      (p.owner ? '<div class="ui-sub-t">' + esc(nombre(p.owner)) + '</div>' : '') + '</div>' +
      '<div class="ui-tarjeta-der">' + uiEstado(e, { detenido: p.detenido }) + (iconos ? '<div class="ui-fila-ic ui-tarjeta-der">' + iconos + '</div>' : '') + '</div></div>';
    var av = avisoAbono(p); if (av) h += '<div class="ui-rapido">' + av + '</div>';
    var pq = porQue(p, can); if (pq) h += uiMotivo(pq);
    // Las otras acciones del estado (enviar, aprobar, rechazar) siguen como botones, con su confirmación
    var bAcc = { negociacion: ['p', 'mail'], aprobado: ['p', 'e_check'], rechazado: ['s', 'cerrar'] };
    h += '<div class="ui-barra">' + uiBtn('Proyecto', 'ficha', 's', 'data-pm="ficha" data-id="' + pid + '"') +
      acc.filter(function (a) { return a[0] !== 'finalizado'; }).map(function (a) {
        var b = bAcc[a[0]] || ['s', a[2]]; return uiBtn(a[1], b[1], b[0], 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"');
      }).join('') +
      uiIb('revisado', rev ? 'Volver a su lugar' : 'Ya lo revisé', '', 'data-pm="rev" data-id="' + pid + '"').replace('class="ui-ib', 'class="ui-ib' + (rev ? ' on' : '')) + '</div>';
    var kv = function (l, v, cls) { return '<div class="ui-kv">' + l + '<span class="ui-num"><span class="' + (cls || '') + '">' + v + '</span></span></div>'; };
    if (can === 'prospecto' || can === 'negociacion') {
      var cot = Number(p.monto_cotizado) || 0, env = _pd(p.fecha_envio) || (can === 'negociacion' ? _pd(p.fecha_propuesta) : null);
      h += (cot > 0 ? kv('Cotizado', fmt(cot), 'ui-p-pendiente') : kv('Cotización', 'falta cotizar', 'ui-p-pendiente')) +
        (env ? kv('Propuesta', 'enviada ' + hace(env)) : kv('Propuesta', 'no enviada', 'ui-p-pendiente')) +
        kv('Probabilidad', (p.probabilidad || 0) + ' %') + '<br>';
    }
    if (its.length) {
      h += '<div class="ui-lat-h">Desarrollos</div>';
      its.forEach(function (it) {
        // El proyecto se DETIENE; el desarrollo se PAUSA (independiente: ej. un abono que todavía no arranca)
        var mant = esMant(it), m = '', pd = p.detenido || it.detenido;
        h += '<div class="ui-linea">' + uiTipo(it, it.estado, pd) + '<span class="ui-f1" title="' + esc(it.titulo || '') + '">' + esc(it.titulo || it.tipo || '—') + '</span>' +
          (pd ? '' : botonesDes(it, true)) + uiEstado(it.estado || '—', { detenido: pd, nombre: p.detenido ? 'Detenido' : it.detenido ? 'Pausado' : null }) + '</div>';
        if (esGanado(it.estado)) {
          if (!mant) {
            var tot = Number(it.total_ars) || 0, cob = Number(it.facturado) || 0;
            if (tot > 0) m = '<span>Contratado <span class="ui-num ui-p-contratado">' + fmt(tot) + '</span></span><span>Cobrado <span class="ui-num ui-p-cobrado">' + fmt(cob) + '</span> (<span class="ui-num">' + Math.round(cob / tot * 100) + ' %</span>)</span>';
          } else {
            var cu = Number(it.cuota_act) || Number(it.valor_cuota) || 0, d = Number(it.duracion) || 12, cf = Number(it.cuotas_facturadas) || 0;
            if (cu > 0) m = '<span>Abono <span class="ui-num ui-p-abono">' + fmt(cu) + '/mes</span></span><span>Cuotas restantes <span class="ui-num">' + Math.max(0, d - cf) + ' de ' + d + '</span></span>';
          }
        }
        if (m) h += '<div class="ui-linea-sub">' + m + '</div>';
      });
    }
    // Módulos por etapa, sólo con el proyecto Activo
    var vivos = {}; its.forEach(function (it) { vivos[it.id] = 1; });
    var mods = (p.modulos || []).filter(function (m) { return !m.item_id || vivos[m.item_id]; });
    var sec = '';
    if (can === 'activo' && mods.length) {
      var cerr = function (m) { return /finaliz|cerr|complet|hech/i.test(m.estado || ''); };
      var grp = {}, og = [], itemsM = {};
      mods.forEach(function (m) { var k = (m.item_id || '') + '|' + (m.etapa || 'Sin etapa'); if (!grp[k]) { grp[k] = []; og.push(k); } grp[k].push(m); itemsM[m.item_id || ''] = 1; });
      var multi = Object.keys(itemsM).length > 1, listas = og.filter(function (k) { return grp[k].every(cerr); });
      var mh = og.map(function (k) {
        var ms = grp[k], hecha = ms.every(cerr), hs = ms.reduce(function (a, m) { return a + (Number(m.est) || 0); }, 0);
        var it = its.find(function (x) { return x.id === ms[0].item_id; });
        var acts = ms.map(function (a) {
          return '<div class="ui-linea"><span class="ui-f1' + (cerr(a) ? ' ui-nota-t' : '') + '">' + (cerr(a) ? uiIco('e_check') + ' ' : '') + esc(a.nombre) + '</span>' +
            (a.est ? '<span class="ui-num ui-nota-t">' + a.est + ' h</span>' : '') + '</div>';
        }).join('');
        return desp(p, 'mod:' + k, { n2: true, th: (multi && it ? esc(it.titulo || '') + ' · ' : '') + esc(ms[0].etapa || 'Sin etapa'),
          n: ms.filter(cerr).length + '/' + ms.length + (hs ? ' · ' + Math.round(hs * 10) / 10 + ' h' : ''),
          v: hecha ? uiEstado('Finalizado', { nombre: 'Cerrada' }) : uiIb('check', 'Cerrar la etapa', 'fin', 'data-pm="cerrar-mod" data-id="' + esc(ms[0].id) + '"') }, acts);
      }).join('');
      sec += desp(p, 'mod', { th: 'Módulos', n: listas.length + '/' + og.length }, mh);
    }
    // Tareas abiertas: primero qué hay que hacer, después lo que comentó la gente.
    // Los comentarios automáticos (delegada, procesada, IPC…) van aparte, en «Historial».
    var ta = tareasAbiertas(p).sort(function (a, b) { return String(a.fecha_vencimiento || '9999').localeCompare(String(b.fecha_vencimiento || '9999')); });
    var nv = ta.filter(vencida).length, cs = p.comentarios || [], vistos = {}, th = '';
    var auto = cs.filter(esAuditoria); auto.forEach(function (c) { vistos[c.id] = 1; });
    ta.slice(0, 3).forEach(function (x) {
      var f = _pd(x.fecha_vencimiento), xid = esc(x.id);
      th += '<div class="ui-linea"><span class="ui-f1" title="' + esc(x.titulo || '') + '">' + esc(x.titulo || '—') +
        (x.descripcion ? '<div class="ui-nota-t" title="' + esc(x.descripcion) + '">' + esc(x.descripcion) + '</div>' : '') + '</span>' +
        (f ? '<span class="ui-num ' + (vencida(x) ? 'ui-p-error' : 'ui-nota-t') + '">' + ff(f) + '</span>' : '') +
        uiIb('chat', 'Ver, comentar, finalizar o delegar', 'vio', 'data-pm="tarea" data-id="' + xid + '"') + '</div>';
      cs.filter(function (c) { return !vistos[c.id] && c.tarea_id && c.tarea_id === x.id; }).slice(0, 2).forEach(function (c) { vistos[c.id] = 1; th += '<div class="ui-linea-sub">' + comLinea(c) + '</div>'; });
    });
    if (ta.length > 3) th += '<div class="ui-nota-t">+' + (ta.length - 3) + ' más</div>';
    if (!ta.length) th += '<div class="ui-nota-t">Sin tareas pendientes.</div>';
    var s = function (n) { return n > 1 ? 's' : ''; };
    sec += desp(p, 'tar', { th: 'Tareas', n: ta.length || '',
      v: '<span class="ui-fila-ic">' + (nv ? '<span class="ui-p-error">' + nv + ' vencida' + s(nv) + '</span>' : '') + uiAcc('tarea', 'data-pm="nueva-tarea" data-id="' + pid + '"') + '</span>' }, th);
    var otros = cs.filter(function (c) { return !vistos[c.id]; }).slice(0, 3);
    sec += desp(p, 'otros', { th: 'Otros comentarios', n: otros.length }, otros.length ? otros.map(comLinea).join('') : '<div class="ui-nota-t">Sin comentarios.</div>');
    if (auto.length) sec += desp(p, 'hist', { th: 'Historial', n: auto.length }, auto.map(comLinea).join(''));
    h += '<div class="ui-rapido">' + sec + '</div>';
    h += '<input class="ui-campo ui-rapido" data-segnota="' + pid + '" placeholder="Comentario rápido y Enter…" aria-label="Comentario rápido">';
    return h + '</div>';
  }
  function htmlSeg() {
    var S = P.seg, all = P.proys;
    var q = norm(S.q);
    var pasaSeg = function (p) { return segPasa(p, 'todos') && (!S.fil.length || S.fil.some(function (k) { return segPasa(p, k); })); };
    var list = all.filter(pasaSeg).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0; });
    var h = '<div class="ui-filtros"><input class="ui-campo ui-f1" id="seg-q" placeholder="Buscar cliente o proyecto…" aria-label="Buscar" value="' + esc(S.q) + '"></div>' +
      barraFiltro(SEG_FIL, S.fil, function (k) { return all.filter(function (p) { return segPasa(p, k); }).length; }, 'segfil',
                  all.filter(function (p) { return segPasa(p, 'todos'); }).length, list.length);
    if (!list.length) return h + '<div class="ui-nota-t">Nada para este filtro.</div>';
    var peso = { activo: 0, aprobado: 1, negociacion: 2, prospecto: 3, finalizado: 4, rechazado: 5 };
    var rank = function (p) { return (S.rev.indexOf(p.id) >= 0 ? 100 : 0) + (p.detenido ? 50 : 0) + (peso[_canonProy(p.estado_proyecto)] || 0); };
    var grupos = {}, orden = [];
    list.forEach(function (p) { var e = p.empresa || 'Sin cliente'; if (!grupos[e]) { grupos[e] = []; orden.push(e); } grupos[e].push(p); });
    orden.forEach(function (e) { grupos[e].sort(function (a, b) { return rank(a) - rank(b); }); });
    orden.sort(function (a, b) { return a.localeCompare(b); });
    var cerrados = {}; try { cerrados = JSON.parse(localStorage.getItem('seg_cerr') || '{}') || {}; } catch (e) { cerrados = {}; }
    orden.forEach(function (emp, ei) {
      var ps = grupos[emp], cerr = !!cerrados[emp], carr = ps.length > CARRUSEL;
      // C3 por empresa con su logo (C13); las flechas del carrusel a la derecha
      h += uiDesp({ logo: uiLogo(emp, (P.emps[emp] || {}).logo), t: emp, n: ps.length, open: !cerr,
        attrs: 'data-pm="segemp" data-emp="' + esc(emp) + '" title="' + (cerr ? 'Mostrar los proyectos' : 'Ocultar los proyectos') + '"',
        v: carr ? '<span class="ui-fila-ic">' + uiIb('izquierda', 'Anterior', '', 'data-pm="scr" data-dir="-1" data-g="' + ei + '"') + uiIb('derecha', 'Siguiente', '', 'data-pm="scr" data-dir="1" data-g="' + ei + '"') + '</span>' : '' },
        '<div class="ui-tarjetas' + (carr ? ' ui-carr' : '') + '" data-track="' + ei + '">' + ps.map(segCard).join('') + '</div>');
    });
    return h;
  }

  function htmlKpis(list) {
    var activos = list.filter(esProyActivo), detenidos = list.filter(esProyDetenido), finaliz = list.filter(esProyFinalizado);
    var vivos = list.filter(function (p) { return !esProyFinalizado(p); });
    var contratado = sum(list, mTotal), cobradoDev = sum(list, mCobradoDev), abono = sum(list, mRecurrente);
    var pct = contratado > 0 ? Math.round(cobradoDev / contratado * 100) : 0;
    // C8: una sola fila, informativa (no filtra)
    return '<div class="ui-kpis">' +
      uiKpi('Proyectos', String(list.length), '', vivos.length + ' sin cerrar') +
      uiKpi('Activos', String(activos.length), 'e-curso', 'aprobados y en curso') +
      uiKpi('Detenidos', String(detenidos.length), detenidos.length ? 'e-detenido' : '', 'para recotizar') +
      uiKpi('Contratado', fmt(contratado), 'p-contratado', finaliz.length + ' finalizado' + (finaliz.length === 1 ? '' : 's')) +
      uiKpi('Cobrado', fmt(cobradoDev), 'p-cobrado', pct + ' % de lo contratado') +
      (abono > 0 ? uiKpi('Abono', fmt(abono), 'p-abono', '/mes · no suma al contratado') : '') +
    '</div>';
  }
  // C4 · fila de proyecto: logo, empresa y proyecto; a la derecha el total de desarrollos y el estado. La ficha (C5) se abre debajo.
  function tarjetaProy(p) {
    var ab = P.inline === p.id, tot = mTotal(p);
    return uiFilaProy({ emp: p.empresa || '', pro: p.nombre || '—', logoUrl: (P.emps[p.empresa] || {}).logo, open: ab,
      attrs: 'data-pm="inline" data-id="' + esc(p.id) + '" aria-expanded="' + ab + '"',
      tot: tot > 0 ? '<div class="ui-p-contratado">' + fmt(tot) + '</div><div class="ui-sub-t">desarrollos</div>' : '<span class="ui-nota-t">—</span>',
      est: uiEstado(p.estado_proyecto || '—', { detenido: p.detenido }) },
      ab && P.f && P.f.id === p.id ? fichaCuerpo(p, true) : '');
  }
  // Proyectos = el universo completo (29/10/2026): los mismos chips de Seguimiento más Finalizado
  // y Rechazado; lista plana por título (sin agrupar por cliente); al desplegar, la ficha completa.
  var PR_FIL = SEG_FIL.slice(0, 4).concat([['finalizado', 'Finalizado', 'xg', 'c']], SEG_FIL.slice(4), [['rechazado', 'Rechazado', 'xz', 'x']]);
  function proyPasa(p, fil) {
    var c = _canonProy(p.estado_proyecto);
    if (!fil || fil === 'todos') return true;
    if (fil === 'finalizado' || fil === 'rechazado') return c === fil;
    return segPasa(p, fil);
  }
  function htmlProy() {
    var R = P.pr, fil = R.chip || [], all = P.proys;
    var h = '<div class="ui-filtros"><input class="ui-campo ui-f1" id="pr-q" placeholder="Buscar proyecto o empresa…" aria-label="Buscar" value="' + esc(R.q) + '">' +
      '<select class="ui-campo" id="pr-orden" aria-label="Ordenar">' +
        [['monto', 'Por monto'], ['fecha', 'Por fecha'], ['prob', 'Por probabilidad'], ['nombre', 'Por título']].map(function (o) {
          return '<option value="' + o[0] + '"' + (R.orden === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '</div>';
    var q = norm(R.q);
    var f = all.filter(function (p) { return !fil.length || fil.some(function (k) { return proyPasa(p, k); }); }).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0; });
    h = barraFiltro(PR_FIL, fil, function (k) { return all.filter(function (p) { return proyPasa(p, k); }).length; }, 'prchip', all.length, f.length) + htmlKpis(f) + h;
    if (!f.length) return h + '<div class="ui-nota-t">Sin proyectos para este filtro.</div>';
    f.sort(function (a, b) {
      if (R.orden === 'nombre') return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      if (R.orden === 'prob') return (b.probabilidad || 0) - (a.probabilidad || 0);
      if (R.orden === 'fecha') return String(b.fecha_propuesta || '').localeCompare(String(a.fecha_propuesta || ''));
      return (b.monto_final_ars || 0) - (a.monto_final_ars || 0);
    });
    return h + '<div>' + f.map(tarjetaProy).join('') + '</div>';
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
      db().from('proyecto_horas').select('desarrollo_id,modulo_nombre,etapa,horas_est,horas_reales').eq('proyecto_id', id),
      db().from('v_analisis_clientes').select('*').eq('empresa', p.empresa_id || '-'),
      db().from('cobros').select('desarrollo_id,tipo_comprobante,comprobante_nro,comprobante_fecha,deposito_fecha,monto_ars').eq('proyecto_id', id).order('comprobante_fecha')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    P.f = {
      id: id,
      tareas: r[0].data,
      // comentarios del proyecto (la columna puede traer varios, separados por coma), los más nuevos primero
      coms: r[1].data.filter(function (c) { return crmLista(c.proyecto_id).indexOf(id) >= 0; })
        .sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || (a.orden - b.orden); }),
      cons: r[2].data, horas: r[3].data, analisis: r[4].data[0] || null, cobros: r[5].data
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
  // ── Barra de estados · UNA para proyectos y desarrollos (27/10/2026) ──
  // pasos: [{ lbl, cls, est: 'pas'|'aqui'|'fut', no, attrs, tit }]. Con attrs es un botón (proyecto:
  // cambiar el estado, o disabled); sin attrs, sólo se mira (desarrollo). Finalizado: toda la barra más opaca.
  function barraEstados(pasos, fin) {
    return '<div class="riel-pasos' + (fin ? ' fin' : '') + '">' + pasos.map(function (s) {
      var tag = s.attrs ? 'button' : 'span';
      return '<' + tag + (s.attrs ? ' type="button"' : '') + ' class="riel-paso' + (s.est === 'aqui' ? ' aqui' : '') + (s.est === 'pas' ? ' pas' : '') + (s.no ? ' no' : '') + '"' +
        (s.attrs || '') + ' title="' + esc(s.tit || s.lbl) + '"><i class="e-' + (s.est === 'fut' ? 'xm' : s.cls) + '"></i>' +
        '<span class="' + (s.est === 'aqui' ? 't-' + s.cls : '') + '">' + esc(s.lbl) + '</span></' + tag + '>';
    }).join('') + '</div>';
  }
  // La misma barra que la ficha, sólo para mirar: en Seguimiento el estado se cambia con sus
  // acciones (con confirmación), no tocando la barra. Un tramo por estado real (29/10/2026).
  function rielVista(p) {
    var can = _canonProy(p.estado_proyecto), det = esProyDetenido(p) || can === 'rechazado', idx = CAMINO.indexOf(can);
    return '<div class="seg-riel">' + barraEstados(CAMINO.map(function (c, i) {
      var lbl = nombreProy(c), hecho = !det && idx >= 0 && i < idx, aqui = !det && i === idx;
      return { lbl: lbl, cls: colorEstadoProy(lbl).cls, est: aqui ? 'aqui' : hecho ? 'pas' : 'fut', tit: aqui ? 'El proyecto está ' + lbl : lbl };
    }), can === 'finalizado') + '</div>';
  }
  function riel(p) {
    var can = _canonProy(p.estado_proyecto), det = esProyDetenido(p) || can === 'rechazado', idx = CAMINO.indexOf(can);
    return '<div class="riel"><div class="riel-h">' + ib('info', 'Tocá un paso de la barra para cambiar el estado del proyecto. Los apagados no se pueden elegir desde acá.', 'type="button"') +
      barraEstados(CAMINO.map(function (c, i) {
        var lbl = nombreProy(c), hecho = !det && idx >= 0 && i < idx, aqui = !det && i === idx;
        var chk = puedeEstado(p, lbl), clic = chk.ok && !aqui;
        return { lbl: lbl, cls: colorEstadoProy(lbl).cls, est: aqui ? 'aqui' : hecho ? 'pas' : 'fut', no: !(chk.ok || aqui),
                 attrs: clic ? ' data-pm="estado" data-id="' + esc(p.id) + '" data-est="' + c + '"' : ' disabled',
                 tit: aqui ? 'El proyecto está ' + lbl : (chk.ok ? 'Marcar como ' + lbl : chk.msg) };
      }), can === 'finalizado') + (esProyDetenido(p) ? est('Detenido', 'xd') : '') +
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
    // Un proyecto Activo o Finalizado ya se cargó: se mira. Lo que sigue cambiando son los contactos.
    var editar = mProyEditable(p) && _canonProy(p.estado_proyecto) !== 'rechazado'
      ? uiBtn('Editar proyecto', 'editar', 'p', 'data-pm="editar-proy"')
      : '<span class="ui-nota-t" title="El proyecto ya arrancó: los datos se cargaron al cotizar. Acá sólo se suman contactos.">Sólo lectura</span>';
    var dato = function (l, v) { return '<div><span class="ui-lbl">' + l + '</span>' + v + '</div>'; };
    var drv = p.carpeta || (P.emps[p.empresa] || {}).drive_interno || '';
    var h = uiDesp({ t: 'Datos del proyecto', open: true, v: editar },
      dato('Descripción', esc(p.descripcion || '—')) + '<br><div class="ui-datos">' +
      [['Sponsor', esc(p.sponsor || '—')], ['Owner', esc(nombre(p.owner) || '—')], ['Probabilidad', '<span class="ui-num">' + (p.probabilidad || 0) + ' %</span>'],
       ['Duración', dur ? '<span class="ui-num">' + dur + '</span> mes' + (dur === 1 ? '' : 'es') : '—'], ['Fecha propuesta', '<span class="ui-num">' + (ff(p.fecha_propuesta) || '—') + '</span>'],
       ['Inicio', '<span class="ui-num">' + (ff(mInicio(p)) || '—') + '</span>'], ['Cierre estimado', cie.fecha ? '<span class="ui-num">' + ff(cie.fecha) + '</span>' + (cie.firme ? '' : ' (parcial)') : '—']].map(function (x) {
        return dato(x[0], x[1]);
      }).join('') + '</div>' +
      (!cie.firme && cie.faltan ? uiAviso(cie.faltan + ' desarrollo' + (cie.faltan === 1 ? '' : 's') + ' sin fecha de fin: el cierre y la duración se calculan con las fechas que hay.', 'adv') : '') +
      (drv ? '<a class="ui-lnk ui-azul" href="' + esc(drv) + '" target="_blank" rel="noopener">' + uiIco('carpeta') + 'Drive interno</a>' : '<span class="ui-nota-t">Sin carpeta de Drive cargada.</span>'));
    // Contactos de la empresa; la estrella marca (y desmarca) los de este proyecto
    var enProy = crmLista(p.contactos), mio = function (c) { return enProy.indexOf(String(c.id)) >= 0; };
    h += uiDesp({ t: 'Contactos · ' + (p.empresa || ''), n: F.cons.length,
      v: _canonProy(p.estado_proyecto) === 'rechazado' ? '' : uiBtn('Contacto', 'contacto', 's', 'data-pm="contacto"') },
      F.cons.length ? F.cons.slice().sort(function (a, b) { return (mio(b) ? 1 : 0) - (mio(a) ? 1 : 0); }).map(function (c) {
        var tel = String(c.telefono || '').replace(/[^0-9]/g, ''), tip = mio(c) ? 'Sacar del proyecto' : 'Marcar como contacto de este proyecto';
        return '<div class="ui-linea"><button type="button" class="ui-ib' + (mio(c) ? ' on' : '') + '" data-pm="estrella" data-id="' + esc(c.id) + '" title="' + tip + '" aria-label="' + tip + '">' + (mio(c) ? '★' : '☆') + '</button>' +
          '<span class="ui-f1">' + esc(((c.nombre || '') + ' ' + (c.apellido || '')).trim() || '—') + ' <span class="ui-nota-t">· ' + esc(c.puesto || c.area_trabajo || c.email || '') + '</span></span>' +
          (tel ? '<a class="ui-ib ui-wa" href="https://wa.me/' + tel + '" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
          (c.email ? '<a class="ui-ib ui-azul" href="mailto:' + esc(c.email) + '" title="' + esc(c.email) + '" aria-label="Mail">' + uiIco('mail') + '</a>' : '') + '</div>';
      }).join('') : '<div class="ui-nota-t">Sin contactos cargados.</div>');
    h += uiDesp({ t: 'Cronograma' }, fechasHTML(p));
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
    // La misma barra que el proyecto; acá no se toca para cambiar el estado (sin attrs: no es un botón)
    return '<div class="riel-des-w">' + barraEstados(pasos.map(function (r, i) {
      return { lbl: r.estado, cls: det && i === idx ? 'xd' : colorEstado(r.estado).cls, est: i === idx ? 'aqui' : (idx >= 0 && i < idx ? 'pas' : 'fut') };
    }), can === 'finalizada') + '</div>';
  }
  function modulosDe(itemId) {
    var ent = {}, tot = { est: 0, real: 0 };
    P.f.horas.filter(function (r) { return r.desarrollo_id === itemId; }).forEach(function (r) {
      var k = r.modulo_nombre || 'Sin entregable', e = Number(r.horas_est) || 0, x = Number(r.horas_reales) || 0;
      ent[k] = ent[k] || { est: 0, real: 0 }; ent[k].est += e; ent[k].real += x; tot.est += e; tot.real += x;
    });
    var ks = Object.keys(ent); if (!ks.length) return '<span class="ui-nota-t">Sin módulos cargados. Se cargan al cotizar.</span>';
    return ks.concat(['Total']).map(function (k) {
      var o = k === 'Total' ? tot : ent[k], d = o.est > 0 && o.real > 0 ? Math.round((o.real / o.est - 1) * 100) : null;
      return '<div class="ui-linea"><span class="ui-f1">' + esc(k) + '</span><span class="ui-num ui-p-neutro">' + Math.round(o.est) + ' h</span>' +
        '<span class="ui-num ' + (o.real ? 'ui-p-pendiente' : 'ui-p-neutro') + '">' + (o.real ? Math.round(o.real) + ' h' : '—') + '</span>' +
        '<span class="ui-num ' + (d === null ? 'ui-p-neutro' : d > 15 ? 'ui-p-error' : 'ui-e-finalizado') + '">' + (d === null ? '' : (d > 0 ? '+' : '') + d + ' %') + '</span></div>';
    }).join('');
  }
  // Desarrollo finalizado: se consulta (no se edita). Duración y cobros con fecha (29/10/2026)
  function resumenFinalizado(it) {
    var ini = _pd(it.fecha_est), fin = _pd(it.fecha_fin || it.fecha_cierre), h = '';
    if (ini && fin) { var d = Math.round((fin - ini) / 864e5); h += '<div class="ui-linea-sub">Duró <span class="ui-num">' + d + '</span> días' + (d >= 45 ? ' (≈ <span class="ui-num">' + Math.round(d / 30.4) + '</span> meses)' : '') + '</div>'; }
    var cs = (P.f.cobros || []).filter(function (c) { return c.desarrollo_id === it.id; });
    h += cs.length ? '<table class="ui-tbl"><thead><tr><th>Comprobante</th><th>Fecha</th><th>Cobrado el</th><th class="ui-r">Monto</th></tr></thead><tbody>' +
      cs.map(function (c) {
        return '<tr><td>' + esc([c.tipo_comprobante, c.comprobante_nro].filter(Boolean).join(' ') || '—') + '</td><td class="ui-num">' + (ff(c.comprobante_fecha) || '—') + '</td>' +
          '<td class="ui-num">' + (c.deposito_fecha ? ff(c.deposito_fecha) : '<span class="ui-p-pendiente">sin cobrar</span>') + '</td><td class="ui-r ui-p-cobrado">' + fmt(c.monto_ars) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="ui-nota-t">Sin cobros cargados.</div>';
    return h;
  }
  // Cada desarrollo se abre debajo de su fila (C3): ícono de tipo, nombre y estado, sin montos; los datos al abrir
  function tabDesarrollos(p) {
    var ord = { curso: 0, garantia: 1, aprobada: 2, nueva: 3, finalizada: 4, rechazada: 5 };
    var k = function (it) { return it.detenido ? 3.5 : (ord[_canonSol(it.estado)] === undefined ? 3 : ord[_canonSol(it.estado)]); };
    var lista = (p.items || []).slice().sort(function (a, b) { return k(a) - k(b); });
    if (!lista.length) return '<div class="ui-nota-t">Sin desarrollos.</div>';
    return lista.map(function (it) {
      var rec = esMant(it), det = !!it.detenido || !!p.detenido, can = _canonSol(it.estado);
      var cuota = Number(it.cuota_act) || Number(it.valor_cuota) || 0;
      var sub = [it.tipo_nombre || it.tipo, it.modelo_nombre || it.modelo].filter(Boolean).join(' · ');
      if (rec) { var cubre = (it.mant_de_ids || []).map(function (x) { var d = (p.items || []).find(function (y) { return y.id === x; }); return d ? (d.titulo || d.id) : ''; }).filter(Boolean); if (cubre.length) sub += ' · cubre ' + cubre.join(', '); }
      var abierto = P.fAb[it.id] !== undefined ? P.fAb[it.id] : (lista.length === 1 || can === 'curso' || can === 'garantia');
      var iconos = (can === 'rechazada' || can === 'finalizada' || p.detenido ? '' :
          (it.detenido ? uiIb('play', 'Reanudar este desarrollo', '', 'data-pm="det-des" data-id="' + esc(it.id) + '"') : uiIb('pausa', 'Pausar este desarrollo', 'det', 'data-pm="det-des" data-id="' + esc(it.id) + '"'))) +
        (can === 'finalizada' || can === 'rechazada' || _canonProy(p.estado_proyecto) === 'rechazado' ? '' : uiAcc('editar', 'data-pm="edit-des" data-id="' + esc(it.id) + '"')) +
        (det ? '' : botonesDes(it, false));
      var h = '<div class="ui-dev' + (abierto ? ' open' : '') + '" data-des="' + esc(it.id) + '">' +
        '<span class="ui-ch">' + uiIco('derecha') + '</span>' + uiTipo(it, it.estado, det) +
        '<div><div class="ui-dev-n">' + esc(it.titulo || it.descripcion || '—') + '</div><div class="ui-sub-t">' + esc(sub) + '</div></div>' +
        '<span class="ui-fila-ic">' + iconos + uiEstado(it.estado || '—', { detenido: det, nombre: p.detenido ? 'Detenido' : it.detenido ? 'Pausado' : null }) + '</span></div><div class="ui-devc">';
      // Contratado, cobrado y pendiente van sólo en el lateral: acá no se repiten (29/10/2026)
      var l1 = [];
      if (rec) {
        if (cuota) l1.push('Cuota <span class="ui-num ui-p-abono">' + fmt(cuota) + '/mes</span>');
        if (it.duracion) l1.push('<span class="ui-num">' + (it.cuotas_facturadas || 0) + '</span> de <span class="ui-num">' + it.duracion + '</span> cuotas');
      } else if (it.cuotas > 1) l1.push('<span class="ui-num">' + it.cuotas + '</span> cuotas');
      if (it.horas) l1.push('Vendidas <span class="ui-num">' + it.horas + ' h</span>');
      if (it.socios) l1.push(esc(crmLista(it.socios).map(nombre).join(', ')));
      if (it.garantia_dias) l1.push('<span class="ui-num">' + it.garantia_dias + '</span> días de garantía');
      h += l1.length ? '<div class="ui-linea-sub">' + l1.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' : '';
      var corre = function (a, d, txt, tit) { return uiBtn(txt, 'mas', 's', 'data-pm="' + a + '" data-id="' + esc(it.id) + '" data-d="' + d + '" title="' + tit + '"'); };
      h += '<div class="ui-linea-sub">';
      if (rec) { var arr = mantArranca(p, it); h += arr ? '<span>Arranca <span class="ui-num">' + ff(arr) + '</span> — fin de obra + garantía</span>' : '<span class="ui-p-pendiente">No se sabe cuándo arranca: falta vincularlo a un desarrollo o cargarle la fecha de fin</span>'; }
      else if (can === 'garantia') {
        // en garantía se corre el FIN: corre la garantía y el arranque del mantenimiento
        h += '<span>Inicio <span class="ui-num">' + (ff(it.fecha_est) || '—') + '</span></span><span>Fin <span class="ui-num">' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</span></span>' +
          corre('post-fin', 7, '1 sem.', 'Corre la garantía y el arranque del mantenimiento una semana') + corre('post-fin', 30, '1 mes', 'Corre la garantía y el arranque del mantenimiento un mes');
      } else if (desCerrado(it) || can === 'rechazada') {
        h += '<span>Inicio <span class="ui-num">' + (ff(it.fecha_est) || '—') + '</span></span><span>Fin <span class="ui-num">' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</span></span>';
      } else {
        h += '<span>Inicio</span><input class="ui-campo ui-num" type="date" data-fini="' + esc(it.id) + '" value="' + esc(it.fecha_est ? String(it.fecha_est).slice(0, 10) : '') + '" aria-label="Inicio del desarrollo">' +
          corre('post-ini', 7, '1 sem.', 'Corre el inicio una semana') + corre('post-ini', 30, '1 mes', 'Corre el inicio un mes') +
          (it.fecha_fin ? '<span>Fin <span class="ui-num">' + ff(it.fecha_fin) + '</span></span>' : '');
      }
      h += '</div>';
      if (it.descripcion) h += '<div class="ui-nota-t">' + esc(it.descripcion) + '</div>';
      if (can === 'finalizada') h += resumenFinalizado(it);   // de qué trató, cuánto duró y cuándo se cobró
      h += uiDesp({ t: 'Módulos de trabajo', n2: true }, modulosDe(it.id));
      return h + '</div>';
    }).join('');
  }
  function tabTareas(p) {
    var F = P.f, h = '<div class="ui-barra">' + uiBtn('Tarea', 'tarea', 's', 'data-pm="nueva-tarea" data-id="' + esc(p.id) + '"') + '</div><div class="ui-lat-h">Tareas</div>';
    var ab = F.tareas.filter(function (t) { return !t.closed; }).sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var tid = {}; F.tareas.forEach(function (t) { tid[t.id] = t; });
    h += ab.length ? ab.map(function (t) {
      var cs = F.coms.filter(function (c) { return c.tarea_id === t.id && !esAuditoria(c); }).slice(0, 2);
      return '<div class="ui-linea"><span class="ui-f1" title="' + esc(t.title) + '">' + esc(t.title) +
        '<span class="ui-nota-t"> · ' + esc(crmLista(t.assignees).map(nombre).join(', ') || 'sin responsable') + '</span>' +
        (t.detail ? '<div class="ui-nota-t" title="' + esc(t.detail) + '">' + esc(t.detail) + '</div>' : '') + '</span>' +
        (t.due ? '<span class="ui-num ' + (t.overdue ? 'ui-p-error' : 'ui-nota-t') + '">' + ff(t.due) + '</span>' : '') +
        uiIb('chat', 'Ver, comentar, finalizar o delegar', 'vio', 'data-pm="tarea" data-id="' + esc(t.id) + '"') + '</div>' +
        cs.map(function (c) { return '<div class="ui-linea-sub">' + comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }) + '</div>'; }).join('');
    }).join('') : '<div class="ui-nota-t">Sin tareas pendientes.</div>';
    var otros = F.coms.filter(function (c) { return (!c.tarea_id || !tid[c.tarea_id]) && !esAuditoria(c); });
    var auto = F.coms.filter(esAuditoria);   // delegada, procesada, IPC…: aparte y con menos peso (29/10/2026)
    h += '<br><div class="ui-lat-h">Otros comentarios</div>' +
      '<input class="ui-campo" data-segnota="' + esc(p.id) + '" placeholder="Comentar el proyecto y Enter…" aria-label="Comentar el proyecto">' +
      (otros.length ? otros.slice(0, 10).map(function (c) { return comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }); }).join('') : '<div class="ui-nota-t ui-rapido">Sin comentarios.</div>');
    if (auto.length) h += '<div class="ui-rapido">' + uiDesp({ t: 'Historial', n: auto.length }, auto.slice(0, 20).map(function (c) { return comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }); }).join('')) + '</div>';
    return h;
  }
  // Análisis del cliente (getAnalisisCliente): lo que guardó el Cotizador, no se recalcula
  function tabAnalisis() {
    var c = P.f.analisis;
    if (!c) return '<div class="ui-nota-t">Todavía no hay análisis guardado para este cliente.</div>';
    var pct = function (v) { return v === null || v === undefined || v === '' ? '' : (v >= 0 ? '+' : '') + Math.round(v) + ' %'; };
    return uiMotivo('Referencia = horas estimadas × valor hora de venta GIWA a la fecha × Tier. El abono compensa lo que faltó.') +
      '<table class="ui-tbl"><thead><tr><th>Desarrollo</th><th class="ui-r">Horas</th><th class="ui-r">VH ref.</th><th class="ui-r">Referencia</th>' +
      '<th class="ui-r">Cobrado</th><th>Margen neto proyectado</th><th class="ui-r">Abono</th></tr></thead><tbody>' +
      (c.devs || []).map(function (d) {
        return '<tr><td>' + esc(d.id) + ' · ' + esc(d.titulo) + (d.reutiliza ? ' <span class="ui-nota-t">mejora de ' + esc(d.reutiliza) + '</span>' : '') + '</td>' +
          '<td class="ui-r">' + Math.round(d.horas) + '</td><td class="ui-r">' + fmt(d.vh_referencia) + '</td><td class="ui-r">' + fmt(d.referencia) + '</td>' +
          '<td class="ui-r ui-p-cobrado">' + fmt(d.precio) + '</td><td>' + esc(d.veredicto) + ' <span class="ui-num">' + pct(d.desvio_pct) + '</span></td>' +
          '<td class="ui-r ui-p-abono">' + (d.mmr ? fmt(d.mmr) + '/mes' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      uiMotivo('Cobrado − referencia ' + fmt(c.dif) + ' · abono ' + fmt(c.mmr) + '/mes · con 12 meses de abono ' + fmt(c.a12) +
        ' · con 24 ' + fmt(c.a24) + (c.dif < 0 ? (c.mmr ? ' · lo que faltó son ' + c.meses + ' mes(es) de abono' : ' · sin abono que lo compense') : ' · cobrado igual o arriba de la referencia'));
  }
  // Lateral de la ficha: sólo plata, en recuadros C8
  function lateral(p) {
    var usd = function (ars) { return ars && _tc() > 0 ? fmt(ars / _tc(), 'USD') : ''; };
    var tot = mTotal(p), cob = mCobradoDev(p), sal = mSaldo(p);
    var nDev = (p.items || []).filter(function (x) { return !esMant(x) && esGanado(x.estado); }).length, nDevT = (p.items || []).filter(function (x) { return !esMant(x); }).length;
    var h = '<div><div class="ui-lat-h">Desarrollos · ' + nDev + (nDevT > nDev ? ' de ' + nDevT : '') + ' contratado' + (nDev === 1 ? '' : 's') + '</div><div class="ui-lat-g">' +
      uiKpi('Contratado', fmt(tot), 'p-contratado', '', usd(tot)) + uiKpi('Cobrado', fmt(cob), 'p-cobrado', '', usd(cob)) + uiKpi('Pendiente', fmt(sal), 'p-pendiente', '', usd(sal)) + '</div>';
    var rec = mRecurrente(p), sm = mSaldoMant(p);
    if (rec > 0 || sm > 0) {
      var fm = mFinMant(p), falta = Math.max(0, fm.totales - fm.cobradas);
      h += '<div class="ui-lat-h">Mantenimiento y soporte</div><div class="ui-lat-g">' +
        uiKpi('Abono mensual', fmt(rec), 'p-abono', (p.mant_vivos || 0) + ' en curso', usd(rec)) +
        uiKpi('Ya cobrado', fmt(mCobradoMant(p)), 'p-cobrado', fm.cobradas + ' cuota' + (fm.cobradas === 1 ? '' : 's'), usd(mCobradoMant(p))) +
        uiKpi('Faltan', falta + ' cuota' + (falta === 1 ? '' : 's'), 'p-pendiente', fm.totales ? 'de ' + fm.totales : '') +
        uiKpi('Por cobrar', fmt(sm), 'p-pendiente', '', usd(sm)) + '</div><div class="ui-nota-t">No suma al contratado: se factura por cuota.</div><br>';
    }
    var hs = sum(p.items, 'horas');
    if (hs) h += '<div class="ui-lat-h">Del contrato</div><div class="ui-lat-g">' + uiKpi('Horas vendidas', Math.round(hs) + ' h', 'p-neutro') + '</div>';
    return h + '</div>';
  }
  function htmlFicha() {
    var p = P.proys.find(function (x) { return x.id === P.f.id; }); if (!p) return '<div class="ui-nota-t">Proyecto no encontrado.</div>';
    var lista = P.fLista, i = lista.indexOf(p.id);
    var h = '<div class="ui-barra">' + uiBtn('Volver', 'izquierda', 's', 'data-pm="volver"') +
      (lista.length > 1 ? uiIb('izquierda', 'Proyecto anterior', '', 'data-pm="nav" data-dir="-1"') + '<span class="ui-num ui-nota-t">' + (i + 1) + '/' + lista.length + '</span>' + uiIb('derecha', 'Proyecto siguiente', '', 'data-pm="nav" data-dir="1"') : '') + '</div>';
    return h + fichaCuerpo(p);
  }
  // Acciones del proyecto: Detener y Finalizar como íconos junto al estado (C5); las demás, botones con su confirmación
  function iconosEstado(p) {
    var can = _canonProy(p.estado_proyecto), pid = esc(p.id), acc = p.detenido ? [] : accionesProy(p);
    return (can === 'finalizado' || can === 'rechazado' ? '' :
        (p.detenido ? uiIb('play', 'Reanudar', '', 'data-pm="det-proy" data-id="' + pid + '"') : uiAcc('detener', 'data-pm="det-proy" data-id="' + pid + '"'))) +
      (acc.some(function (a) { return a[0] === 'finalizado'; }) ? uiAcc('finalizar', 'data-pm="estado" data-id="' + pid + '" data-est="finalizado"') : '');
  }
  function accionesYAlerta(p) {
    var can = _canonProy(p.estado_proyecto), pid = esc(p.id);
    var bAcc = { negociacion: ['p', 'mail'], aprobado: ['p', 'e_check'], rechazado: ['s', 'cerrar'] };
    var viejo = function (txt, tipo) { return '<a class="ui-btn ui-' + tipo + '" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener" title="Abre el Cotizador del CRM actual">' + uiIco('abrir') + esc(txt) + '</a>'; };
    return '<div class="ui-barra">' + uiBtn('Tarea', 'tarea', 's', 'data-pm="nueva-tarea" data-id="' + pid + '"') +
      (can === 'rechazado' ? viejo('Volver a cotizar', 'p') :
        (p.detenido ? '' : accionesProy(p).filter(function (a) { return a[0] !== 'finalizado'; }).map(function (a) {
          var b = bAcc[a[0]] || ['s', a[2]]; return uiBtn(a[1], b[1], b[0], 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"'); }).join('')) +
        ((can === 'prospecto' || can === 'negociacion') ? viejo('Cotizar en el CRM actual', 's') : '')) + '</div>';
  }
  // C5 · la ficha: motivo en gris y, junto al estado, Detener y Finalizar; botones secundarios; pestañas; lateral de plata
  function fichaCuerpo(p, enLista) {
    var e = p.estado_proyecto || 'Prospecto', ab = P.f.tareas.filter(function (t) { return !t.closed; }).length, can = _canonProy(e);
    var tabs = [['info', 'Información', tabInfo], ['analisis', 'Análisis', tabAnalisis], ['desarrollos', 'Desarrollos' + ((p.items || []).length ? ' (' + p.items.length + ')' : ''), tabDesarrollos],
                ['tareas', 'Tareas y comentarios' + (ab ? ' (' + ab + ')' : ''), tabTareas]];
    var t = tabs.find(function (x) { return x[0] === P.fTab; }) || tabs[0];
    var av = avisoAbono(p), pq = porQue(p, can) || deDondeSale(p);
    var cab = enLista
      ? '<div class="ui-ficha-hd"><span class="ui-motivo">' + esc(pq) + '</span>' + (av ? ' ' + av : '') + '<span class="ui-acc-est">' + iconosEstado(p) + '</span></div>'
      : '<div class="ui-ficha-hd">' + uiLogo(p.empresa, (P.emps[p.empresa] || {}).logo) + '<div><div class="ui-emp">' + esc(p.empresa) + '</div><div class="ui-pro">' + esc(p.nombre) + '</div></div>' +
        '<span class="ui-acc-est">' + av + uiEstado(e, { detenido: p.detenido }) + iconosEstado(p) + '</span></div>' + uiMotivo(pq) + riel(p);
    var cuerpo = cab + accionesYAlerta(p) +
      uiTabs(tabs.map(function (x) { return [x[0], x[1], 'data-pm="ftab" data-t="' + x[0] + '"']; }), t[0]) +
      '<div class="ui-cols"><div>' + t[2](p) + '</div>' + lateral(p) + '</div>';
    return enLista ? cuerpo : '<div class="ui-ficha ui-ficha-sola">' + cuerpo + '</div>';
  }
  // ══ NUEVO PROYECTO · Carga rápida (= «Carga rápida» del Cotizador, 29/10/2026) ══
  // Empresa, sponsor, desarrollo y plata. Guarda alta_proyecto_rapido (= altaCotizacion
  // con rapido): el proyecto como Prospecto, su desarrollo y, si hay, su mantenimiento.
  // El Cotizador completo (funcionalidades, horas, costos) sigue en el CRM actual.
  var NV = { moneda: 'ARS' };
  function htmlNuevo() {
    var mon = function (m) { return '<button type="button" class="ptab' + (NV.moneda === m ? ' on' : '') + '" data-pm="nv-mon" data-m="' + m + '">' + m + '</button>'; };
    return '<div class="card nv-card"><div class="card-t">Carga rápida</div><div class="hint">Cliente, desarrollo y plata. Se guarda como Prospecto y se abre su ficha.</div>' +
      '<div class="g2 u-mt10"><div class="fg"><label class="fl" for="nv-emp">Empresa <span class="req">*</span></label><select class="fc" id="nv-emp"><option value="">Cargando…</option></select></div>' +
        '<div class="fg"><label class="fl" for="nv-sp">Sponsor</label><select class="fc" id="nv-sp"><option value="">Elegí la empresa</option></select></div></div>' +
      '<div class="fg"><label class="fl" for="nv-nom">Título del proyecto <span class="req">*</span></label><input class="fc" id="nv-nom"></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="nv-tipo">Desarrollo <span class="req">*</span></label><select class="fc" id="nv-tipo"></select></div>' +
        '<div class="fg"><label class="fl" for="nv-tit">Título del desarrollo</label><input class="fc" id="nv-tit" placeholder="Vacío = el tipo"></div></div>' +
      '<div class="g2"><div class="fg"><span class="fl">Moneda</span><div class="filtros u-mb0" role="group" aria-label="Moneda">' + mon('ARS') + mon('USD') + '</div></div>' +
        '<div class="fg"><label class="fl" for="nv-monto">Monto <span class="req">*</span> <span class="u-s10-mt m" id="nv-eq"></span></label><input class="fc u-tr m" type="number" min="0" step="0.01" id="nv-monto"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="nv-fp">Modo de pago <span class="req">*</span></label><select class="fc" id="nv-fp"></select></div>' +
        '<div class="fg"><label class="fl" for="nv-mm">Mantenimiento por mes (opcional)</label><input class="fc u-tr m" type="number" min="0" step="0.01" id="nv-mm"></div></div>' +
      '<div class="u-c-rd u-s11" id="nv-err"></div>' +
      '<div class="u-row8 u-mt10"><button class="btn bp" data-pm="nv-ok">' + ico('guardar') + ' Guardar</button>' +
        '<a class="btn bg sm u-mla" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener" title="Funcionalidades, horas y costos">' + ico('abrir') + ' Cotizador completo en el CRM actual</a></div></div>';
  }
  async function nvCargar() {
    var r = await Promise.all([
      db().from('empresas').select('id,nombre').order('nombre'),
      db().from('tipos_desarrollo').select('id,nombre').order('orden'),
      db().from('modelos_pago').select('id,nombre').order('orden')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) return toast(err.error.message, 'err');
    var o = function (L, ph) { return '<option value="">' + ph + '</option>' + L.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>'; }).join(''); };
    var $n = function (id) { return document.getElementById(id); };
    if (!$n('nv-emp')) return;
    $n('nv-emp').innerHTML = o(r[0].data, 'Elegí la empresa');
    $n('nv-tipo').innerHTML = o(r[1].data.filter(function (t) { return !/mantenimiento/i.test(t.nombre); }), 'Tipo');
    $n('nv-fp').innerHTML = o(r[2].data, 'Elegí');
    $n('nv-emp').onchange = async function () {
      var c = await db().from('contactos').select('id,nombre,apellido').eq('empresa_id', this.value || '-').order('nombre');
      $n('nv-sp').innerHTML = '<option value="">' + (this.value ? 'Sponsor' : 'Elegí la empresa') + '</option>' + (c.data || []).map(function (x) {
        return '<option value="' + esc(x.id) + '">' + esc(((x.nombre || '') + ' ' + (x.apellido || '')).trim()) + '</option>'; }).join('');
    };
    $n('nv-monto').oninput = nvEq;
  }
  function nvEq() {
    var tc = window.TC || 0, n = Number((document.getElementById('nv-monto') || {}).value) || 0;
    set('nv-eq', n && tc ? '= ' + (NV.moneda === 'USD' ? fmt(n * tc) : fmt(n / tc, 'USD')) : '');
  }
  async function nvGuardar(el) {
    var v = function (id) { return String(document.getElementById(id).value || '').trim(); };
    var falta = [!v('nv-emp') && 'la empresa', !v('nv-nom') && 'el título del proyecto', !v('nv-tipo') && 'el tipo de desarrollo',
                 !(Number(v('nv-monto')) > 0) && 'el monto', !v('nv-fp') && 'el modo de pago'].filter(Boolean);
    if (falta.length) return set('nv-err', 'Falta ' + falta.join(', ') + '.');
    var b = el.querySelector('[data-pm="nv-ok"]'); b.disabled = true;
    var r = await db().rpc('alta_proyecto_rapido', { p: { empresa_id: v('nv-emp'), sponsor_id: v('nv-sp'), nombre: v('nv-nom'), tipo: v('nv-tipo'),
      titulo: v('nv-tit'), moneda: NV.moneda, monto: v('nv-monto'), forma_pago: v('nv-fp'), mant: v('nv-mm') } });
    b.disabled = false;
    if (r.error) return set('nv-err', esc(r.error.message));
    toast(r.data.pid + ' cargado como Prospecto', 'ok');
    await cargar(); P.sub = 'proy'; abrirFicha(el, r.data.pid);
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
    el.querySelector('.ui-tabs') && (el.innerHTML = '<div class="loading"><div class="spin"></div> Abriendo la ficha…</div>');
    await cargarFicha(id); pintar(el); window.scrollTo(0, 0);
  }

  // ── editar el proyecto (saveProyecto · crm_giwa.editar_proyecto) ──
  // El estado sólo ofrece a los que puede pasar hoy (la misma guarda que la barra).
  async function abrirEditarProy(p) {
    var m = document.getElementById('m-eproy');
    if (!m) {
      m = document.createElement('div'); m.className = 'mo'; m.id = 'm-eproy';
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Editar proyecto</span>' +
        '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-eproy">' + ico('cerrar') + '</button></div><div class="mb2">' +
        '<div class="fg"><label class="fl" for="ep-nom">Nombre <span class="req">*</span></label><input class="fc" id="ep-nom"></div>' +
        '<div class="fg"><label class="fl" for="ep-desc">Descripción</label><textarea class="fc" id="ep-desc" rows="3"></textarea></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ep-emp">Empresa</label><select class="fc" id="ep-emp"></select></div>' +
          '<div class="fg"><label class="fl" for="ep-sp">Sponsor</label><select class="fc" id="ep-sp"></select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ep-owner">Owner</label><select class="fc" id="ep-owner"></select></div>' +
          '<div class="fg"><label class="fl" for="ep-est">Estado</label><select class="fc" id="ep-est"></select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ep-prob">Probabilidad (%)</label><input class="fc u-tr" type="number" min="0" max="100" id="ep-prob"></div>' +
          '<div class="fg"><label class="fl" for="ep-fecha">Fecha de propuesta</label><input class="fc" type="date" id="ep-fecha"></div></div>' +
        '</div><div class="mf"><button class="btn bg" data-cerrar="m-eproy">Cancelar</button><button class="btn bp" id="ep-ok">Guardar</button></div></div>';
      document.body.appendChild(m);
    }
    var $e = function (id) { return document.getElementById(id); };
    var emps = await db().from('empresas').select('id,nombre').order('nombre');
    if (emps.error) return toast(emps.error.message, 'err');
    var sponsors = async function (eid, sel) {
      var c = await db().from('contactos').select('id,nombre,apellido').eq('empresa_id', eid || '-').order('nombre');
      $e('ep-sp').innerHTML = '<option value="">— Sponsor —</option>' + (c.data || []).map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(((x.nombre || '') + ' ' + (x.apellido || '')).trim()) + '</option>'; }).join('');
    };
    $e('ep-nom').value = p.nombre || ''; $e('ep-desc').value = p.descripcion || '';
    $e('ep-emp').innerHTML = '<option value="">—</option>' + emps.data.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === p.empresa_id ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('');
    $e('ep-emp').onchange = function () { sponsors(this.value, ''); };
    await sponsors(p.empresa_id, p.sponsor_id);
    $e('ep-owner').innerHTML = Object.keys(P.users).map(function (mail) { return '<option value="' + esc(mail) + '"' + (mail === p.owner ? ' selected' : '') + '>' + esc(P.users[mail]) + '</option>'; }).join('');
    var act = p.estado_proyecto;
    $e('ep-est').innerHTML = estadosProyecto().filter(function (o) { return o === act || puedeEstado(p, o).ok; })
      .map(function (o) { return '<option' + (o === act ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    $e('ep-prob').value = p.probabilidad || 50; $e('ep-fecha').value = p.fecha_propuesta ? String(p.fecha_propuesta).slice(0, 10) : '';
    // Aprobado o activo: nombre, empresa y lo comercial quedan fijos (29/10/2026). IPC y fechas van por su lado.
    var fijo = ['aprobado', 'activo'].indexOf(_canonProy(act)) >= 0;
    ['ep-nom', 'ep-emp', 'ep-prob', 'ep-fecha'].forEach(function (id) { $e(id).disabled = fijo; });
    openM('m-eproy');
    return new Promise(function (res) {
      $e('ep-ok').onclick = function () {
        if (!$e('ep-nom').value.trim()) return toast('Nombre obligatorio', 'err');
        closeM('m-eproy');
        res({ id: p.id, nombre: $e('ep-nom').value.trim(), descripcion: $e('ep-desc').value.trim(), empresa: $e('ep-emp').value,
              sponsor: $e('ep-sp').value, owner: $e('ep-owner').value, estado: $e('ep-est').value,
              probabilidad: $e('ep-prob').value, fecha_propuesta: $e('ep-fecha').value });
      };
    });
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
  // Las subpantallas están en el menú lateral (marcarSub lo mantiene al día)
  function pintar(el) {
    if (_montado !== 'pm') return;                // se terminó de leer con otro módulo en pantalla
    marcarSub(P.sub === 'ficha' ? P.prev : P.sub);
    var cab = uiHd((SUBS.find(function (s) { return s[0] === P.sub; }) || ['', 'Proyectos'])[1], {
      seg: 'Proyectos en marcha y en negociación, para revisar.',
      proy: 'Todos los proyectos, con sus desarrollos y su estado.',
      nuevo: 'Alta de un proyecto nuevo.'
    }[P.sub] || 'Seguimiento y estado de cada proyecto.');
    if (P.sub === 'ficha') { el.innerHTML = htmlFicha(); return; }
    if (P.sub === 'seg') el.innerHTML = cab + '<div id="seg-c">' + htmlSeg() + '</div>';
    else if (P.sub === 'proy') el.innerHTML = cab + htmlProy();
    else if (P.sub === 'nuevo') { el.innerHTML = cab + htmlNuevo(); nvCargar(); }
    else el.innerHTML = cab + '<div class="card"><p>Esta vista todavía funciona en el CRM actual.</p>' +
      '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' + ico('abrir') + ' Abrir el CRM actual</a></div>';
  }
  function repintarConFoco(el, id) {
    var q = document.getElementById(id), pos = q ? q.selectionStart : 0;
    pintar(el);
    var n = document.getElementById(id); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  }

  VISTAS.pm = async function (el, op) {
    var leer = async function () { await cargar(); if (P.sub === 'ficha' && P.f) await cargarFicha(P.f.id); else if (P.inline) await cargarFicha(P.inline); };
    var refrescar = async function () { await leer(); pintar(el); };
    var s = subPedida(); if (s === 'tar') { location.hash = '#/hoy'; return; }   // la vieja vista Tareas
    if (SUBS.some(function (x) { return x[0] === s; })) P.sub = s;
    await abrirModulo(el, { id: 'pm', texto: 'Cargando proyectos…', forzar: op && op.forzar, cargar: leer,
      cargado: function () { return P.ok; }, firma: function () { return JSON.stringify([P.proys, P.f]); }, pintar: function () { pintar(el); } });
    if (!el._pmBound) {                          // una vez: #vista es el mismo para todos los módulos
      el._pmBound = true;
      el.addEventListener('ui-toggle', function (ev) {
        var d = ev.target, o = ev.detail.open;
        if (d.hasAttribute('data-segdesp')) P.seg.abierto[d.getAttribute('data-segdesp')] = o;
        if (d.hasAttribute('data-des')) P.fAb[d.getAttribute('data-des')] = o;
      });
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
      if (a === 'ficha') return abrirFicha(el, id);
      if (a === 'nv-mon') { NV.moneda = b.getAttribute('data-m'); el.querySelectorAll('[data-pm="nv-mon"]').forEach(function (x) { x.classList.toggle('on', x === b); }); return nvEq(); }
      if (a === 'nv-ok') return nvGuardar(el);
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
      if (a === 'edit-des') { ev.preventDefault(); return abrirDesarrollo(id, { onSave: refrescar }); }
      if (a === 'det-des') { ev.preventDefault(); var dd = itemDe(id);
        return ask(dd.detenido ? '¿Reanudar este desarrollo?' : '¿Pausar este desarrollo? No cambia el estado del proyecto.', dd.detenido ? 'Reanudar' : 'Pausar').then(function (ok) {
          if (ok) hacer('detener_desarrollo', { did: id, detener: !dd.detenido }, dd.detenido ? 'Desarrollo reanudado' : 'Desarrollo pausado'); }); }
      if (a === 'inline') {
        ev.preventDefault();
        if (P.inline === id) { P.inline = null; return pintar(el); }
        P.inline = id; P.fTab = P.fTab || 'info';
        return cargarFicha(id).then(function () { pintar(el); }).catch(function (e2) { P.inline = null; toast(e2.message, 'err'); });
      }
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
      if (a === 'editar-proy') {
        ev.preventDefault();                       // el botón vive en el título de un desplegable
        return abrirEditarProy(proy(P.f.id)).then(function (datos) { if (datos) hacer('editar_proyecto', { p: datos }, 'Proyecto guardado'); });
      }
      if (a === 'estrella') {
        var pe = proy(P.f.id), l = crmLista(pe.contactos), k2 = l.indexOf(id);
        if (k2 >= 0) l.splice(k2, 1); else l.push(id);
        return hacer('contactos_proyecto', { pid: pe.id, lista: l.join(',') }, k2 >= 0 ? 'Sacado del proyecto' : 'Agregado al proyecto');
      }
      if (a === 'contacto') { var pp = P.proys.find(function (x) { return x.id === P.f.id; }); return abrirFichaEmpresa(pp.empresa_id, { nuevoContacto: true, onSave: refrescar }); }
      if (a === 'segfil') { P.seg.fil = togFil(P.seg.fil, b.getAttribute('data-f')); return pintar(el); }
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
      if (a === 'rev') {
        var i = P.seg.rev.indexOf(id);
        return ask(i >= 0 ? '¿Vuelve a su lugar en la lista?' : '¿Ya lo revisaste? Pasa al final de la lista de este cliente.', i >= 0 ? 'Volver a su lugar' : 'Ya lo revisé').then(function (ok) {
          if (!ok) return; if (i >= 0) P.seg.rev.splice(i, 1); else P.seg.rev.push(id); pintar(el); });
      }
      if (a === 'tarea') return verTarea(id, alGuardar);
      if (a === 'nueva-tarea') return nuevaTarea({ projectId: id }, alGuardar);
      if (a === 'prchip') { P.pr.chip = togFil(P.pr.chip || [], b.getAttribute('data-f')); return pintar(el); }
    };
  };
  // Del menú lateral: otra subpantalla, sin releer
  VISTAS.pm.irA = function (s) {
    if (s === 'tar') { location.hash = '#/hoy'; return; }   // la vieja vista Tareas vive en Hoy
    if (!SUBS.some(function (x) { return x[0] === s; })) return;
    P.sub = s; pintar(document.getElementById('vista')); window.scrollTo(0, 0);
  };
  VISTAS.pm.precargar = cargar;
})();

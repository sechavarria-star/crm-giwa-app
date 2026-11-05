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
  var P = { proys: [], emps: {}, users: {}, sub: 'proy', tareas: {}, cons: [], tst: TareasUI.estado(),
            seg: { fil: [], q: '', rev: [], abierto: {} }, pr: { fil: [], q: '', orden: 'monto', abiertas: {} },
            f: null, fLista: [], fTab: 'desarrollos', fAb: {}, prev: 'proy' };
  var SUBS = [['proy', 'Proyectos'], ['seg', 'Seguimiento']];   // pestañas; entra directo a Proyectos. Nuevo proyecto rápido es un modal (02/11/2026)

  async function cargar() {
    var r = await Promise.all([
      db().from('v_pm_proyectos').select('*'),
      db().from('v_pm_seguimiento').select('*'),
      db().from('empresas').select('id,nombre,logo,drive_interno'),
      db().from('usuarios').select('mail,nombre'),
      db().rpc('estados_spec'),
      db().from('v_tipo_cambio_hoy').select('valor').maybeSingle(),
      db().from('v_tareas').select('*').eq('closed', false).eq('hidden', false),   // como Hoy: una alerta aparece recién en su ventana de aviso
      db().from('contactos').select('id,nombre,apellido,empresa_id,puesto,area_trabajo,email,telefono').order('nombre')
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
    P.cons = r[7].data || [];   // contactos de todas las empresas, una sola vez (tarjetas de Seguimiento)
    P.tareas = {}; (r[6].data || []).forEach(function (t) { (t.project_ids || []).forEach(function (pid) { (P.tareas[pid] = P.tareas[pid] || []).push(t); }); });
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
  // Cuotas del abono: un solo dato, las cobradas sobre el total (cuotas_facturadas de la vista)
  function cuotasTxt(it) { var d = Number(it.duracion) || 0; return d ? '<span>Cuota <span class="ui-num">' + (Number(it.cuotas_facturadas) || 0) + '</span> de <span class="ui-num">' + d + '</span> cobradas</span>' : ''; }
  // De qué desarrollos puede colgar una mejora o un soporte: vendidos y que no dependen de otro
  function basesAlta(p) { return _canonProy(p.estado_proyecto) === 'rechazado' ? [] : (p.items || []).filter(function (it) { return !depende(it) && esGanado(it.estado); }); }
  function depende(it) { return !!it.bloque || (it.mant_de_ids || []).length > 0; }
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
  var RECH = ['rechazar', 'No aceptar', 'cerrar', 'El cliente no lo aceptó. Se puede recotizar'];
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
      case 'negociacion': return [['aprobado', 'Aprobar', 'check'], ['rechazado', 'No aceptar', 'cerrar']];
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
  // 02/11/2026: sin «En garantía» ni «En mantenimiento»; Detenido (y Rechazado en Proyectos) son marcas del proyecto, aparte
  var SEG_FIL = [['prospecto', 'Prospecto', 'xn', 'c'], ['negociacion', 'Negociación', 'xw', 'c'], ['aprobado', 'Aprobado', 'xb', 'c'], ['activo', 'Activo', 'xc', 'c'],
                 ['det', 'Detenido', 'xd', 'x']];
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
  // Tarjeta de Seguimiento (03/11/2026): «Ver proyecto» solo arriba a la derecha; proyecto y empresa a la izquierda,
  // estado y sus acciones (íconos) a la derecha; motivo; sponsors GIWA y cliente; y cuatro secciones plegadas
  // (Desarrollos, Contactos, Tareas, Otros comentarios) con sus botones de agregar en la línea del título. Al pie, la nota rápida y «revisado».
  function segCard(p) {
    var e = p.estado_proyecto || 'Prospecto', can = _canonProy(e);
    var rev = P.seg.rev.indexOf(p.id) >= 0, pid = esc(p.id), acc = p.detenido ? [] : accionesProy(p);
    var its = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada'; });
    var add = function (icono, tip, attrs) { return uiIb(icono, tip, 'add', attrs); };
    var h = '<div class="ui-tarjeta' + (p.detenido || rev ? ' ui-apagada' : '') + '"><span class="ui-tarjeta-barra ui-e-' + uiClaveEst(e, p.detenido) + '"></span>';
    h += '<div class="ui-tarjeta-top">' + uiLogo(p.empresa, (P.emps[p.empresa] || {}).logo) + uiBtn('Ver proyecto', 'documento', 's', 'data-pm="ficha" data-id="' + pid + '"') + '</div>';
    // Las acciones del estado, como íconos con su tooltip (todas con confirmación)
    var ICO = { negociacion: ['mail', 'Enviar la propuesta', ''], aprobado: ['check', 'Aprobar', 'fin'], rechazado: ['cerrar', 'No aceptar', 'bor'], finalizado: ['e_cuadrado', 'Finalizar', 'fin'] };
    var iconos = (can === 'finalizado' || can === 'rechazado' ? '' :
        (p.detenido ? uiIb('play', 'Reanudar el proyecto', '', 'data-pm="det-proy" data-id="' + pid + '"') : uiAcc('detener', 'data-pm="det-proy" data-id="' + pid + '"'))) +
      acc.map(function (a) { var k = ICO[a[0]] || [a[2], a[1], '']; return uiIb(k[0], k[1], k[2], 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"'); }).join('');
    h += '<div class="ui-tarjeta-hd"><div><div class="ui-pro">' + esc(p.nombre || '—') + '</div><div class="ui-sub-t">' + esc(p.empresa || '') + '</div></div>' +
      '<div class="ui-tarjeta-der"><div>' + uiEstado(e) + (p.detenido ? ' ' + uiEstado('Detenido', { detenido: true }) : '') + '</div>' +
        (iconos ? '<div class="ui-fila-ic ui-tarjeta-acc">' + iconos + '</div>' : '') + '</div></div>';
    var pq = porQue(p, can); if (pq) h += '<div class="ui-motivo"><span class="ui-e-' + uiClaveEst(e, p.detenido) + '">' + esc(pq) + '</span></div>';
    var av = avisoAbono(p); if (av) h += '<div class="ui-rapido">' + av + '</div>';
    // Sponsors: el de GIWA (owner) y el del cliente (contacto de proyecto.sponsor_id)
    var sc = p.sponsor_id && P.cons.filter(function (c) { return c.id === p.sponsor_id; })[0];
    var spCli = sc ? ((sc.nombre || '') + ' ' + (sc.apellido || '')).trim() : (p.sponsor || p.sponsor_id || '—');
    h += '<div class="ui-tarjeta-sp"><div><span class="ui-lbl">Sponsor GIWA</span>' + esc(p.owner ? nombre(p.owner) : '—') + '</div>' +
      '<div><span class="ui-lbl">Sponsor cliente</span>' + esc(spCli) + '</div></div>';
    var kv = function (l, v, cls) { return '<div class="ui-kv">' + l + '<span class="ui-num"><span class="' + (cls || '') + '">' + v + '</span></span></div>'; };
    if (can === 'prospecto' || can === 'negociacion') {
      var cot = Number(p.monto_cotizado) || 0, env = _pd(p.fecha_envio) || (can === 'negociacion' ? _pd(p.fecha_propuesta) : null);
      h += (cot > 0 ? kv('Cotizado', fmt(cot), 'ui-p-pendiente') : kv('Cotización', 'falta cotizar', 'ui-p-pendiente')) +
        (env ? kv('Propuesta', 'enviada ' + hace(env)) : kv('Propuesta', 'no enviada', 'ui-p-pendiente')) +
        kv('Probabilidad', (p.probabilidad || 0) + ' %');
    }
    // a · Desarrollos
    var dv = its.map(function (it) {
      var mant = esMant(it), m = '', pd = p.detenido || it.detenido;
      var l = '<div class="ui-linea">' + uiTipo(it, it.estado, pd) + '<span class="ui-f1" title="' + esc(it.titulo || '') + '">' + esc(it.titulo || it.tipo || '—') + '</span>' +
        uiEstado(it.estado || '—') + (pd ? uiMarcaDet(p.detenido ? 'Detenido por el proyecto' : 'Pausado') : '') + '</div>';
      if (esGanado(it.estado)) {
        if (!mant) { var tot = Number(it.total_ars) || 0, cob = Number(it.facturado) || 0;
          if (tot > 0) m = '<span>Contratado <span class="ui-num ui-p-contratado">' + fmt(tot) + '</span></span><span>Cobrado <span class="ui-num ui-p-cobrado">' + fmt(cob) + '</span> (<span class="ui-num">' + Math.round(cob / tot * 100) + ' %</span>)</span>'; }
        else { var cu = Number(it.cuota_act) || Number(it.valor_cuota) || 0, d = Number(it.duracion) || 0, cf = Number(it.cuotas_facturadas) || 0;
          if (cu > 0) m = '<span>Abono <span class="ui-num ui-p-abono">' + fmt(cu) + '/mes</span></span>' + (d ? '<span>Cuotas restantes <span class="ui-num">' + Math.max(0, d - cf) + '</span> de <span class="ui-num">' + d + '</span></span>' : ''); }
      }
      return l + (m ? '<div class="ui-linea-sub ui-tarjeta-plata">' + m + '</div>' : '');
    }).join('');
    var sec = desp(p, 'des', { th: 'Desarrollos', n: its.length }, dv || '<div class="ui-nota-t">Sin desarrollos.</div>');
    // b · Contactos de la empresa (C16)
    var cs = P.cons.filter(function (c) { return c.empresa_id && c.empresa_id === p.empresa_id; });
    sec += desp(p, 'con', { th: 'Contactos', n: cs.length, v: add('contacto', 'Nuevo contacto', 'data-pm="seg-contacto" data-id="' + pid + '"') },
      cs.length ? uiContactos(cs.map(function (c) { return { nombre: ((c.nombre || '') + ' ' + (c.apellido || '')).trim(), puesto: c.puesto || c.area_trabajo, tel: c.telefono, mail: c.email }; }))
        : '<div class="ui-nota-t">Sin contactos cargados.</div>');
    // c · Tareas, con la forma de HOY (js/tareas.js)
    var ta = (P.tareas[p.id] || []).slice().sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var nv = ta.filter(function (t) { return t.overdue; }).length;
    sec += desp(p, 'tar', { th: 'Tareas', n: ta.length + (nv ? ' · ' : ''),
        v: (nv ? '<span class="ui-p-error ui-num">' + nv + ' vencida' + (nv > 1 ? 's' : '') + '</span> ' : '') +
           '<span class="ui-fila-ic">' + add('tarea', 'Nueva tarea', 'data-pm="nueva-tarea" data-id="' + pid + '"') + '</span>' },
      ta.length ? TareasUI.html(ta, P.tst, usuarios()) : '<div class="ui-nota-t">Sin tareas pendientes.</div>');
    // d · Otros comentarios: los últimos 3 que no están debajo de una tarea
    var otros = (p.comentarios || []).filter(function (c) { return !c.tarea_id; }).slice(0, 3);
    sec += desp(p, 'otros', { th: 'Otros comentarios', n: otros.length, v: '<span class="ui-fila-ic">' + add('chat', 'Nuevo comentario', 'data-pm="nota-foco" data-id="' + pid + '"') + '</span>' }, otros.length ? otros.map(comLinea).join('') : '<div class="ui-nota-t">Sin comentarios.</div>');
    h += '<div class="ui-rapido">' + sec + '</div>';
    h += '<input class="ui-campo ui-rapido" data-segnota="' + pid + '" placeholder="Comentario rápido y Enter…" aria-label="Comentario rápido">';
    h += '<div class="ui-tarjeta-pie">' + uiIb('revisado', rev ? 'Volver a su lugar' : 'Ya lo revisé', '', 'data-pm="rev" data-id="' + pid + '"').replace('class="ui-ib', 'class="ui-ib' + (rev ? ' on' : '')) + '</div>';
    return h + '</div>';
  }
  // Seguimiento (03/11/2026): las tarjetas solas, sin agrupar por empresa. Primero las activas, después
  // las que tienen más tareas pendientes; lo revisado va al final.
  function htmlSeg() {
    var S = P.seg, all = P.proys;
    var q = norm(S.q);
    var pasaSeg = function (p) { return segPasa(p, 'todos') && (!S.fil.length || S.fil.some(function (k) { return segPasa(p, k); })); };
    var list = all.filter(pasaSeg).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0; });
    var h = '<div class="ui-filtros"><input class="ui-campo ui-f1" id="seg-q" placeholder="Buscar cliente o proyecto…" aria-label="Buscar" value="' + esc(S.q) + '"></div>' +
      barraFiltro(SEG_FIL, S.fil, function (k) { return all.filter(function (p) { return segPasa(p, k); }).length; }, 'segfil',
                  all.filter(function (p) { return segPasa(p, 'todos'); }).length, list.length);
    if (!list.length) return h + '<div class="ui-nota-t">Nada para este filtro.</div>';
    var nt = function (p) { return (P.tareas[p.id] || []).length; };
    list.sort(function (a, b) {
      var ra = S.rev.indexOf(a.id) >= 0 ? 1 : 0, rb = S.rev.indexOf(b.id) >= 0 ? 1 : 0; if (ra !== rb) return ra - rb;
      var aa = _canonProy(a.estado_proyecto) === 'activo' && !a.detenido ? 0 : 1, ab = _canonProy(b.estado_proyecto) === 'activo' && !b.detenido ? 0 : 1; if (aa !== ab) return aa - ab;
      return nt(b) - nt(a) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    return h + '<div class="ui-tarjetas">' + list.map(segCard).join('') + '</div>';
  }

  function htmlKpis(list) {
    var activos = list.filter(esProyActivo), detenidos = list.filter(esProyDetenido), finaliz = list.filter(esProyFinalizado);
    var vivos = list.filter(function (p) { return !esProyFinalizado(p); });
    var contratado = sum(list, mTotal), abono = sum(list, mRecurrente);
    // Proyectado: lo que está en Prospecto o En negociación. Desarrollos (total) y Mantenimiento (abono mensual)
    var pipe = list.filter(function (p) { var c = _canonProy(p.estado_proyecto); return (c === 'prospecto' || c === 'negociacion') && !p.detenido; });
    var pDev = 0, pMant = 0;
    pipe.forEach(function (p) { (p.items || []).forEach(function (it) {
      if (_canonSol(it.estado) === 'rechazada') return;
      if (esMant(it)) pMant += Number(it.cuota_act) || Number(it.valor_cuota) || 0; else pDev += Number(it.total_ars) || 0;
    }); });
    // C8: una sola fila, informativa (no filtra)
    return '<div class="ui-kpis">' +
      uiKpi('Proyectos', String(list.length), '', vivos.length + ' sin cerrar') +
      uiKpi('Activos', String(activos.length), 'e-curso', 'aprobados y en curso') +
      uiKpi('Detenidos', String(detenidos.length), detenidos.length ? 'e-detenido' : '', 'para recotizar') +
      uiKpi('Contratado', fmt(contratado), 'p-contratado', finaliz.length + ' finalizado' + (finaliz.length === 1 ? '' : 's')) +
      uiKpi('Abono mensual', fmt(abono), 'p-abono', 'no suma al contratado') +
      uiKpiDoble('Proyectado', [['Desarrollos', fmt(pDev), 'p-neutro'], ['Mantenimiento', fmt(pMant) + '/mes', 'p-abono']], '', pipe.length + ' proyecto' + (pipe.length === 1 ? '' : 's') + ' en Prospecto o Negociación') +
    '</div>';
  }
  // C4 · fila de proyecto: logo, empresa y proyecto; a la derecha el total de desarrollos y el estado. La ficha (C5) se abre debajo.
  function tarjetaProy(p) {
    var ab = P.inline === p.id;
    return uiFilaProy({ emp: p.empresa || '', pro: p.nombre || '—', logoUrl: (P.emps[p.empresa] || {}).logo, open: ab,
      attrs: 'data-pm="inline" data-id="' + esc(p.id) + '" aria-expanded="' + ab + '"',
      est: uiEstado(p.estado_proyecto || '—') + (p.detenido ? uiMarcaDet() : '') },
      ab && P.f && P.f.id === p.id ? fichaCuerpo(p, true) : '');
  }
  // Proyectos = el universo completo (29/10/2026): los mismos chips de Seguimiento más Finalizado
  // y Rechazado; lista plana por título (sin agrupar por cliente); al desplegar, la ficha completa.
  var PR_FIL = SEG_FIL.slice(0, 4).concat([['finalizado', 'Finalizado', 'xg', 'c']], SEG_FIL.slice(4), [['rechazado', 'No aceptado', 'xz', 'x']]);
  function usuarios() { return Object.keys(P.users).map(function (m) { return { mail: m, name: P.users[m] }; }); }
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
    h = htmlKpis(f) + barraFiltro(PR_FIL, fil, function (k) { return all.filter(function (p) { return proyPasa(p, k); }).length; }, 'prchip', all.length, f.length) + h;
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
      db().from('cobros').select('desarrollo_id,tipo_comprobante,comprobante_nro,comprobante_fecha,deposito_fecha,monto_ars,link_fc').eq('proyecto_id', id).order('comprobante_fecha')
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
      return t + (_canonSol(it.estado) === 'garantia' ? ' · en garantía' : ' · en curso');   // las cuotas van en la fila del desarrollo
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
  // Cronograma (02/11/2026): línea de tiempo con los hitos del proyecto y la secuencia de cada desarrollo,
  // en orden de fecha; cada hito dice si ya pasó y de qué desarrollo depende.
  // soloId (02/11/2026): la secuencia de UN desarrollo (la de su fila), con su arranque estimado si es un abono
  function fechasHTML(p, soloId) {
    var its = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada' && (!soloId || it.id === soloId); }), hoy = mHoy(), ev = [];
    var tit = function (it) { return soloId ? '' : ' · ' + (it.titulo || it.tipo || it.id); };
    var nom = function (it) { return it.titulo || it.tipo || it.id; };
    var padre = function (it) {
      var ids = (it.mant_de_ids || []).slice(); if (it.bloque) ids.push('D-' + String(it.bloque).padStart(4, '0'));
      return ids.map(function (x) { var d = (p.items || []).find(function (y) { return y.id === x; }); return d ? nom(d) : ''; }).filter(Boolean).join(', ');
    };
    var aprob = null; its.forEach(function (it) { var f = _pd(it.fecha_aprob); if (f && (!aprob || f > aprob)) aprob = f; });
    if (aprob) ev.push({ f: aprob, t: 'Aprobado', n: 'el cliente dijo que sí', c: 'aprobado' });
    its.forEach(function (it) {
      var dep = padre(it), ini = _pd(it.fecha_est), fin = _pd(it.fecha_fin || it.fecha_cierre), can = _canonSol(it.estado);
      var arr = !ini && esMant(it) ? mantArranca(p, it) : null;   // abono sin inicio: arranca al terminar la garantía de lo que cubre
      if (ini) ev.push({ f: ini, t: 'Inicio' + tit(it), n: dep ? 'depende de ' + dep : '', c: 'curso' });
      if (arr) ev.push({ f: arr, t: 'Arranca (estimado)' + tit(it), n: 'fin de obra + garantía de ' + (dep || 'lo que cubre'), c: 'curso' });
      if (fin) ev.push({ f: fin, t: (esMant(it) ? 'Fin del abono' : 'Fin de obra') + tit(it), n: can === 'finalizada' ? 'finalizado' : '', c: 'finalizado' });
      var gd = Number(it.garantia_dias) || 0;
      if (fin && gd && !esMant(it)) ev.push({ f: mCorrerDias(fin, gd), t: 'Fin de garantía' + tit(it), n: gd + ' días', c: 'garantia' });
      if (!ini && !arr && !fin && can !== 'finalizada') ev.push({ f: null, t: soloId ? 'Sin fechas cargadas' : nom(it), n: (soloId ? '' : 'sin fechas cargadas') + (dep ? (soloId ? '' : ' · ') + 'depende de ' + dep : ''), c: 'prospecto' });
    });
    if (!ev.length) return '<div class="ui-nota-t">Sin fechas cargadas.</div>';
    ev.sort(function (a, b) { return (a.f ? a.f.getTime() : 9e15) - (b.f ? b.f.getTime() : 9e15); });
    return '<ol class="ui-tl">' + ev.map(function (x) {
      var hecho = x.f && x.f <= hoy;
      return '<li class="ui-tl-i' + (hecho ? ' hecho' : '') + '"><span class="ui-tl-p ui-e-' + (x.f ? x.c : 'rechazado') + '"></span>' +
        '<span class="ui-tl-f">' + (x.f ? ff(x.f) : '—') + '</span>' +
        '<span class="ui-tl-t">' + esc(x.t) + (x.n ? '<div class="ui-tl-n">' + esc(x.n) + '</div>' : '') + '</span></li>';
    }).join('') + '</ol>';
  }
  function tabInfo(p) {
    var F = P.f, dur = mDuracionMeses(p), cie = mCierre(p);
    // Un proyecto Activo o Finalizado ya se cargó: se mira. Lo que sigue cambiando son los contactos.
    var editar = mProyEditable(p) && _canonProy(p.estado_proyecto) !== 'rechazado'
      ? uiBtn('Editar proyecto', 'editar', 'p', 'data-pm="editar-proy"')
      : '<span class="ui-nota-t" title="El proyecto ya arrancó: los datos se cargaron al cotizar. Acá sólo se suman contactos.">Sólo lectura</span>';
    var dato = function (l, v) { return '<div><span class="ui-lbl">' + l + '</span>' + v + '</div>'; };
    var h = uiDesp({ t: 'Datos del proyecto', open: true, v: editar },
      dato('Descripción', esc(p.descripcion || '—')) + '<br><div class="ui-datos">' +
      [['Sponsor', esc(p.sponsor || '—')], ['Owner', esc(nombre(p.owner) || '—')], ['Probabilidad', '<span class="ui-num">' + (p.probabilidad || 0) + ' %</span>'],
       ['Duración', dur ? '<span class="ui-num">' + dur + '</span> mes' + (dur === 1 ? '' : 'es') : '—'], ['Fecha propuesta', '<span class="ui-num">' + (ff(p.fecha_propuesta) || '—') + '</span>'],
       ['Inicio', '<span class="ui-num">' + (ff(mInicio(p)) || '—') + '</span>'], ['Cierre estimado', cie.fecha ? '<span class="ui-num">' + ff(cie.fecha) + '</span>' + (cie.firme ? '' : ' (parcial)') : '—']].map(function (x) {
        return dato(x[0], x[1]);
      }).join('') + '</div>' +
      (!cie.firme && cie.faltan ? uiAviso(cie.faltan + ' desarrollo' + (cie.faltan === 1 ? '' : 's') + ' sin fecha de fin: el cierre y la duración se calculan con las fechas que hay.', 'adv') +
        _devsDe(p).filter(function (it) { return !_pd(it.fecha_fin) && !_pd(it.fecha_cierre); }).map(function (it) {
          return '<div class="ui-linea"><span class="ui-f1">' + esc(it.titulo || it.id) + '</span><input class="fc u-wauto ui-num" type="date" data-ffin="' + esc(it.id) + '" aria-label="Fecha de fin de ' + esc(it.titulo || it.id) + '">' +
            uiBtn('Guardar', 'check', 's', 'data-pm="fin-des" data-id="' + esc(it.id) + '"') + '</div>'; }).join('') : ''));
    // Contactos de la empresa; la estrella marca (y desmarca) los de este proyecto
    var enProy = crmLista(p.contactos), mio = function (c) { return enProy.indexOf(String(c.id)) >= 0; };
    h += uiDesp({ t: 'Contactos · ' + (p.empresa || ''), n: F.cons.length,
      v: _canonProy(p.estado_proyecto) === 'rechazado' ? '' : uiBtn('Contacto', 'contacto', 's', 'data-pm="contacto"') },
      F.cons.length ? F.cons.slice().sort(function (a, b) { return (mio(b) ? 1 : 0) - (mio(a) ? 1 : 0); }).map(function (c) {
        var tel = telWa(c.telefono), tip = mio(c) ? 'Sacar del proyecto' : 'Marcar como contacto de este proyecto';
        return '<div class="ui-linea"><button type="button" class="ui-ib' + (mio(c) ? ' on' : '') + '" data-pm="estrella" data-id="' + esc(c.id) + '" data-tip="' + tip + '" aria-label="' + tip + '">' + (mio(c) ? '★' : '☆') + '</button>' +
          '<span class="ui-f1">' + esc(((c.nombre || '') + ' ' + (c.apellido || '')).trim() || '—') + ' <span class="ui-nota-t">· ' + esc(c.puesto || c.area_trabajo || c.email || '') + '</span></span>' +
          (tel ? '<a class="ui-ib ui-wa" href="https://wa.me/' + tel + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
          (c.email ? '<a class="ui-ib ui-azul" href="mailto:' + esc(c.email) + '" data-tip="' + esc(c.email) + '" aria-label="Mail">' + uiIco('mail') + '</a>' : '') + '</div>';
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
    h += cs.length ? '<table class="ui-tbl"><thead><tr><th>Comprobante</th><th class="ui-r">Fecha</th><th class="ui-r">Cobrado el</th><th class="ui-r">Monto</th></tr></thead><tbody>' +
      cs.map(function (c) {
        return '<tr><td>' + esc([c.tipo_comprobante, c.comprobante_nro].filter(Boolean).join(' ') || '—') + '</td><td class="ui-num ui-r">' + (ff(c.comprobante_fecha) || '—') + '</td>' +
          '<td class="ui-num ui-r">' + (c.deposito_fecha ? ff(c.deposito_fecha) : '<span class="ui-p-pendiente">sin cobrar</span>') + '</td><td class="ui-r ui-p-cobrado">' + fmt(c.monto_ars) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="ui-nota-t">Sin cobros cargados.</div>';
    return h;
  }
  // Cada desarrollo se abre debajo de su fila (C3): ícono de tipo, nombre y estado, sin montos; los datos al abrir
  function tabDesarrollos(p) {
    var ord = { curso: 0, garantia: 1, aprobada: 2, nueva: 3, finalizada: 4, rechazada: 5 };
    var k = function (it) { return it.detenido ? 3.5 : (ord[_canonSol(it.estado)] === undefined ? 3 : ord[_canonSol(it.estado)]); };
    var lista = (p.items || []).slice().sort(function (a, b) { return k(a) - k(b); });
    // Mejora o soporte: una sola acción del PROYECTO; el modal pregunta cuál y de qué desarrollo depende
    var bases = basesAlta(p);
    var alta = bases.length ? '<div class="ui-barra ui-der">' + uiBtn('Desarrollo', 'mas', 's', 'data-pm="alta-des" data-id="' + esc(p.id) + '"') + '</div>' : '';
    if (!lista.length) return alta + '<div class="ui-nota-t">Sin desarrollos.</div>';
    return alta + lista.map(function (it) {
      var rec = esMant(it), det = !!it.detenido || !!p.detenido, can = _canonSol(it.estado);
      var cuota = Number(it.cuota_act) || Number(it.valor_cuota) || 0;
      var sub = [it.tipo_nombre || it.tipo, it.modelo_nombre || it.modelo].filter(Boolean).join(' · ');
      if (rec) { var cubre = (it.mant_de_ids || []).map(function (x) { var d = (p.items || []).find(function (y) { return y.id === x; }); return d ? (d.titulo || d.id) : ''; }).filter(Boolean); if (cubre.length) sub += ' · cubre ' + cubre.join(', '); }
      var abierto = P.fAb[it.id] !== undefined ? P.fAb[it.id] : (lista.length === 1 || can === 'curso' || can === 'garantia');
      // Pausar: sólo mejoras, soportes y mantenimientos que dependen de otro desarrollo (reanudar, siempre)
      var iconos = (can === 'rechazada' || can === 'finalizada' || p.detenido ? '' :
          (it.detenido ? uiIb('play', 'Reanudar este desarrollo', '', 'data-pm="det-des" data-id="' + esc(it.id) + '"') : depende(it) ? uiIb('pausa', 'Pausar este desarrollo', 'det', 'data-pm="det-des" data-id="' + esc(it.id) + '"') : '')) +
        // Editar sólo en Nuevo; aprobado o en marcha se mira (lo contratado no cambia, 02/11/2026)
        (can === 'nueva' && _canonProy(p.estado_proyecto) !== 'rechazado' ? uiAcc('editar', 'data-pm="edit-des" data-id="' + esc(it.id) + '"')
          : uiIb('ficha', 'Ver el desarrollo (sólo lectura)', '', 'data-pm="edit-des" data-id="' + esc(it.id) + '"')) +
        (det ? '' : botonesDes(it, false));
      var plata = '', tot = Number(it.total_ars) || 0, cob = Number(it.facturado) || 0;
      if (rec) { if (cuota) plata = '<span>Abono <span class="ui-num ui-p-abono">' + fmt(cuota) + '/mes</span></span>' + cuotasTxt(it); }
      else if (esGanado(it.estado) && tot > 0) plata = '<span>Contratado <span class="ui-num ui-p-contratado">' + fmt(tot) + '</span></span><span>Cobrado <span class="ui-num ui-p-cobrado">' + fmt(cob) + '</span> (<span class="ui-num">' + Math.round(cob / tot * 100) + ' %</span>)</span>';
      else if (tot > 0) plata = '<span>Cotizado <span class="ui-num ui-p-neutro">' + fmt(tot) + '</span></span>';
      var h = '<div class="ui-dev' + (abierto ? ' open' : '') + '" data-des="' + esc(it.id) + '">' +
        '<span class="ui-dev-barra ui-e-' + uiClaveEst(it.estado) + '"></span><span class="ui-ch">' + uiIco('derecha') + '</span>' + uiTipo(it, it.estado, det) +
        '<div><div class="ui-dev-n">' + esc(it.titulo || it.descripcion || '—') + '</div><div class="ui-sub-t">' + esc(sub) + '</div>' + (plata ? '<div class="ui-dev-plata">' + plata + '</div>' : '') + '</div>' +
        '<div class="ui-dev-der"><span>' + uiEstado(it.estado || '—') + (det ? uiMarcaDet(p.detenido ? 'Detenido por el proyecto' : 'Pausado') : '') + '</span>' +
        (iconos ? '<span class="ui-fila-ic">' + iconos + '</span>' : '') + '</div></div><div class="ui-devc">';
      // Contratado, cobrado y pendiente van sólo en el lateral: acá no se repiten (29/10/2026)
      var l1 = [];
      if (rec) {
        // abono y cuotas ya están en la fila (plata): no se repiten acá (02/11/2026)
      } else if (it.cuotas > 1) l1.push('<span class="ui-num">' + it.cuotas + '</span> cuotas');
      if (it.horas) l1.push('Vendidas <span class="ui-num">' + it.horas + ' h</span>');
      if (it.socios) l1.push(esc(crmLista(it.socios).map(nombre).join(', ')));
      if (it.garantia_dias) l1.push('<span class="ui-num">' + it.garantia_dias + '</span> días de garantía');
      h += l1.length ? '<div class="ui-linea-sub">' + l1.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' : '';
      var corre = function (a, d, txt, tit) { return uiBtn(txt, 'mas', 's', 'data-pm="' + a + '" data-id="' + esc(it.id) + '" data-d="' + d + '" title="' + tit + '"'); };
      h += '<div class="ui-linea-sub">';
      if (rec) { if (!it.fecha_est && !mantArranca(p, it)) h += '<span class="ui-p-pendiente">No se sabe cuándo arranca: falta vincularlo a un desarrollo o cargarle la fecha de fin</span>'; }
      else if (can === 'garantia') {
        // en garantía se corre el FIN: corre la garantía y el arranque del mantenimiento
        h += '<span>Inicio <span class="ui-num">' + (ff(it.fecha_est) || '—') + '</span></span><span>Fin <span class="ui-num">' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</span></span>' +
          corre('post-fin', 7, '1 sem.', 'Corre la garantía y el arranque del mantenimiento una semana') + corre('post-fin', 30, '1 mes', 'Corre la garantía y el arranque del mantenimiento un mes');
      } else if (desCerrado(it) || can === 'rechazada') {
        h += '<span>Inicio <span class="ui-num">' + (ff(it.fecha_est) || '—') + '</span></span><span>Fin <span class="ui-num">' + (ff(it.fecha_fin || it.fecha_cierre) || '—') + '</span></span>';
      } else {
        h += '<span>Inicio</span><input class="ui-campo ui-num" type="date" data-fini="' + esc(it.id) + '" value="' + esc(it.fecha_est ? String(it.fecha_est).slice(0, 10) : '') + '" aria-label="Inicio del desarrollo">' +
          (depende(it) ? corre('post-ini', 7, '1 sem.', 'Corre el inicio una semana') + corre('post-ini', 30, '1 mes', 'Corre el inicio un mes') : '') +
          (it.fecha_fin ? '<span>Fin <span class="ui-num">' + ff(it.fecha_fin) + '</span></span>' : '');
      }
      h += '</div>';
      if (it.descripcion) h += '<div class="ui-nota-t">' + esc(it.descripcion) + '</div>';
      if (can === 'finalizada') h += resumenFinalizado(it);   // de qué trató, cuánto duró y cuándo se cobró
      h += uiDesp({ t: 'Cronograma', n2: true, open: true }, fechasHTML(p, it.id));
      h += uiDesp({ t: 'Módulos de trabajo', n2: true }, modulosDe(it.id));
      return h + '</div>';
    }).join('');
  }
  // Tareas y comentarios con la forma de HOY (js/tareas.js)
  function tabTareas(p) {
    var F = P.f, pid = esc(p.id);
    var h = '<div class="ui-barra ui-der">' + uiBtn('Nueva tarea', 'mas', 's', 'data-pm="nueva-tarea" data-id="' + pid + '"') + '</div><div class="ui-lat-h">Tareas</div>';
    var ab = F.tareas.filter(function (t) { return !t.closed; }).sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var tid = {}; F.tareas.forEach(function (t) { tid[t.id] = t; });
    h += ab.length ? TareasUI.html(ab, P.tst, usuarios()) : '<div class="ui-nota-t">Sin tareas pendientes.</div>';
    var otros = F.coms.filter(function (c) { return (!c.tarea_id || !tid[c.tarea_id]) && !esAuditoria(c); });
    var auto = F.coms.filter(function (c) { return esAuditoria(c) && !c.tarea_id; });   // lo de cada tarea va en su historial, adentro de la tarea (02/11/2026)
    h += '<br><div class="ui-lat-h">Otros comentarios</div>' +
      '<input class="ui-campo" data-segnota="' + esc(p.id) + '" placeholder="Comentar el proyecto y Enter…" aria-label="Comentar el proyecto">' +
      (otros.length ? otros.slice(0, 10).map(function (c) { return comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }); }).join('') : '<div class="ui-nota-t ui-rapido">Sin comentarios.</div>');
    if (auto.length) h += '<div class="ui-rapido">' + uiDesp({ t: 'Historial', n: auto.length }, auto.slice(0, 20).map(function (c) { return comLinea({ usuario: c.creador, texto: c.texto, fecha: c.fecha }); }).join('')) + '</div>';
    return h;
  }
  // Documentos y Drive (02/11/2026): la carpeta que ya existe (la del proyecto o, si no, la de la empresa)
  // y los comprobantes con su archivo. No crea carpetas ni copia archivos.
  function tabDocs(p) {
    var drv = p.carpeta || '', emp = (P.emps[p.empresa] || {}).drive_interno || '';
    var lnk = function (u, t) { return '<a class="ui-lnk ui-azul" href="' + esc(u) + '" target="_blank" rel="noopener">' + uiIco('carpeta') + t + '</a>'; };
    var h = '<div class="ui-barra">' + (drv ? lnk(drv, 'Carpeta del proyecto') : '') + (emp && emp !== drv ? lnk(emp, 'Drive de ' + esc(p.empresa || 'la empresa')) : '') + '</div>';
    if (!drv && !emp) h = uiAviso('Este proyecto no tiene carpeta de Drive cargada, ni su empresa.', 'adv');
    var cs = (P.f.cobros || []).filter(function (c) { return c.link_fc; });
    h += '<div class="ui-lat-h">Comprobantes</div>' + (cs.length ? cs.map(function (c) {
      return '<div class="ui-linea"><span class="ui-f1">' + esc([c.tipo_comprobante, c.comprobante_nro].filter(Boolean).join(' ') || 'Comprobante') + '</span>' +
        '<span class="ui-num ui-nota-t">' + (ff(c.comprobante_fecha) || '') + '</span>' +
        '<a class="ui-ib" href="' + esc(c.link_fc) + '" target="_blank" rel="noopener" data-tip="Abrir el archivo" aria-label="Abrir el archivo">' + uiIco('abrir') + '</a></div>'; }).join('')
      : '<div class="ui-nota-t">Sin comprobantes con archivo.</div>');
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
  // Lateral de la ficha: sólo plata, en recuadros C8. Con un desarrollo abierto en la pestaña
  // Desarrollos, muestra los números de ESE desarrollo (02/11/2026); si no, los del proyecto.
  function lateral(p) {
    var usd = function (ars) { return ars && _tc() > 0 ? fmt(ars / _tc(), 'USD') : ''; };
    var sel = P.fTab === 'desarrollos' && P.fSel && (p.items || []).find(function (x) { return x.id === P.fSel; });
    if (sel) return '<div id="pm-lat">' + lateralDes(sel, usd) + '</div>';
    var tot = mTotal(p), cob = mCobradoDev(p), sal = mSaldo(p);
    var nDev = (p.items || []).filter(function (x) { return !esMant(x) && esGanado(x.estado); }).length, nDevT = (p.items || []).filter(function (x) { return !esMant(x); }).length;
    var h = '<div id="pm-lat"><div class="ui-lat-h">Desarrollos · ' + nDev + (nDevT > nDev ? ' de ' + nDevT : '') + ' contratado' + (nDev === 1 ? '' : 's') + '</div><div class="ui-lat-g">' +
      uiKpi('Contratado', fmt(tot), 'p-contratado', '', usd(tot)) + uiKpi('Cobrado', fmt(cob), 'p-cobrado', '', usd(cob)) + uiKpi('Pendiente', fmt(sal), 'p-pendiente', '', usd(sal)) + '</div>';
    var rec = mRecurrente(p), sm = mSaldoMant(p);
    if (rec > 0 || sm > 0) {
      var fm = mFinMant(p);
      h += '<div class="ui-lat-h">Mantenimiento y soporte</div><div class="ui-lat-g">' +
        uiKpi('Abono mensual', fmt(rec), 'p-abono', (p.mant_vivos || 0) + ' en curso', usd(rec)) +
        uiKpi('Ya cobrado', fmt(mCobradoMant(p)), 'p-cobrado', fm.cobradas + ' de ' + fm.totales + ' cuotas cobradas', usd(mCobradoMant(p))) +
        uiKpi('Por cobrar', fmt(sm), 'p-pendiente', '', usd(sm)) + '</div><div class="ui-nota-t">No suma al contratado: se factura por cuota.</div><br>';
    }
    var hs = sum(p.items, 'horas');
    if (hs) h += '<div class="ui-lat-h">Del contrato</div><div class="ui-lat-g">' + uiKpi('Horas vendidas', Math.round(hs) + ' h', 'p-neutro') + '</div>';
    return h + '</div>';
  }
  function lateralDes(it, usd) {
    var cs = (P.f.cobros || []).filter(function (c) { return c.desarrollo_id === it.id; });
    var cob = cs.filter(function (c) { return c.deposito_fecha; }).reduce(function (a, c) { return a + (Number(c.monto_ars) || 0); }, 0);
    var h = '<div class="ui-lat-h">' + esc(it.titulo || it.id) + '</div><div class="ui-lat-g">';
    if (esMant(it)) {
      var cu = Number(it.cuota_act) || Number(it.valor_cuota) || 0, d = Number(it.duracion) || 0, cf = Number(it.cuotas_facturadas) || 0;
      h += uiKpi('Abono mensual', fmt(cu), 'p-abono', '', usd(cu)) +
        uiKpi('Ya cobrado', fmt(cob), 'p-cobrado', d ? cf + ' de ' + d + ' cuotas cobradas' : '', usd(cob)) +
        (d ? uiKpi('Por cobrar', fmt(Math.max(0, d - cf) * cu), 'p-pendiente', '', usd(Math.max(0, d - cf) * cu)) : '');
    } else {
      var tot = Number(it.total_ars) || 0, fac = Number(it.facturado) || 0;
      h += uiKpi(esGanado(it.estado) ? 'Contratado' : 'Cotizado', fmt(tot), esGanado(it.estado) ? 'p-contratado' : 'p-neutro', '', usd(tot)) +
        (esGanado(it.estado) ? uiKpi('Cobrado', fmt(fac), 'p-cobrado', '', usd(fac)) + uiKpi('Pendiente', fmt(Math.max(0, tot - fac)), 'p-pendiente', '', usd(Math.max(0, tot - fac))) : '');
    }
    if (it.horas) h += uiKpi('Horas vendidas', Math.round(it.horas) + ' h', 'p-neutro');
    return h + '</div><button type="button" class="ui-lnk ui-azul" data-pm="lat-proy">Ver el total del proyecto</button>';
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
  // Acciones del PROYECTO, arriba a la derecha de la ficha: las del estado (botones con su confirmación),
  // Arrancar si hay aprobados, y Tarea y Comentario como íconos (02/11/2026)
  function accionesYAlerta(p) {
    var can = _canonProy(p.estado_proyecto), pid = esc(p.id);
    var bAcc = { negociacion: ['p', 'mail'], aprobado: ['p', 'e_check'], rechazado: ['s', 'cerrar'] };
    var viejo = function (txt, tipo) { return '<a class="ui-btn ui-' + tipo + '" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener" title="Abre el Cotizador del CRM actual">' + uiIco('abrir') + esc(txt) + '</a>'; };
    var aprob = (p.items || []).some(function (it) { return _canonSol(it.estado) === 'aprobada' && !it.detenido; });
    return (can === 'rechazado' ? viejo('Volver a cotizar', 'p') :
        (p.detenido ? '' : accionesProy(p).filter(function (a) { return a[0] !== 'finalizado'; }).map(function (a) {
          var b = bAcc[a[0]] || ['s', a[2]]; return uiBtn(a[1], b[1], b[0], 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"'); }).join('')) +
        (aprob && !p.detenido ? uiBtn('Arrancar', 'play', 'p', 'data-pm="arrancar" data-id="' + pid + '"') : '') +
        ((can === 'prospecto' || can === 'negociacion') ? viejo('Cotizar en el CRM actual', 's') : '')) +
      iconosEstado(p);
  }
  // C5 · la ficha: motivo en gris y, junto al estado, Detener y Finalizar; botones secundarios; pestañas; lateral de plata
  // C5 · la ficha: el motivo en el color del estado; arriba a la derecha las acciones del proyecto;
  // pestañas; lateral de plata. Las acciones de cada desarrollo van en su fila (02/11/2026)
  function fichaCuerpo(p, enLista) {
    var e = p.estado_proyecto || 'Prospecto', ab = P.f.tareas.filter(function (t) { return !t.closed; }).length, can = _canonProy(e);
    var tabs = [['info', 'Información', tabInfo], ['analisis', 'Análisis', tabAnalisis], ['desarrollos', 'Desarrollos' + ((p.items || []).length ? ' (' + p.items.length + ')' : ''), tabDesarrollos],
                ['tareas', 'Tareas y comentarios' + (ab ? ' (' + ab + ')' : ''), tabTareas], ['docs', 'Documentos y Drive', tabDocs]];
    var t = tabs.find(function (x) { return x[0] === P.fTab; }) || tabs[0];
    var av = avisoAbono(p), pq = porQue(p, can) || deDondeSale(p);
    var motivo = '<div class="ui-motivo ui-fuerte"><span class="ui-e-' + uiClaveEst(e) + '">' + esc(pq) + '</span></div>';
    var acc = '<span class="ui-acc-est ui-fila-ic">' + accionesYAlerta(p) + '</span>';
    var cab = enLista
      ? '<div class="ui-ficha-hd">' + motivo + (av ? ' ' + av : '') + acc + '</div>'
      : '<div class="ui-ficha-hd">' + uiLogo(p.empresa, (P.emps[p.empresa] || {}).logo) + '<div><div class="ui-pro">' + esc(p.nombre) + '</div><div class="ui-emp">' + esc(p.empresa) + '</div></div>' +
        '<span>' + uiEstado(e) + (p.detenido ? uiMarcaDet() : '') + '</span>' + av + acc + '</div>' + motivo + riel(p);
    var cuerpo = cab + uiTabs(tabs.map(function (x) { return [x[0], x[1], 'data-pm="ftab" data-t="' + x[0] + '"']; }), t[0]) +
      '<div class="ui-cols"><div>' + t[2](p) + '</div>' + lateral(p) + '</div>';
    return enLista ? cuerpo : '<div class="ui-ficha ui-ficha-sola">' + cuerpo + '</div>';
  }
  // ══ NUEVO PROYECTO · Carga rápida (= «Carga rápida» del Cotizador, 29/10/2026) ══
  // Empresa, sponsor, desarrollo y plata. Guarda alta_proyecto_rapido (= altaCotizacion
  // con rapido): el proyecto como Prospecto, su desarrollo y, si hay, su mantenimiento.
  // El Cotizador completo (funcionalidades, horas, costos) sigue en el CRM actual.
  // Carga rápida del Cotizador (03/11/2026): debajo del monto, las horas estándar del catálogo para ese tipo
  // (la base: lo que lleva cualquier desarrollo de ese tipo, sale de estimar_desarrollo sin tildar nada) y a
  // cuánto queda la hora; debajo del mantenimiento, qué incluye; al pie, los dos desarrollos que se crean.
  var NV = { moneda: 'ARS', std: null };
  function htmlNuevo() {
    var mon = function (m) { return '<button type="button" class="ui-mon-b ui-mon-' + m.toLowerCase() + (NV.moneda === m ? ' on' : '') + '" data-pm="nv-mon" data-m="' + m + '">' + m + '</button>'; };
    return '<div class="g2"><div class="fg"><label class="fl" for="nv-emp">Empresa <span class="req">*</span></label><select class="fc" id="nv-emp"><option value="">Cargando…</option></select></div>' +
        '<div class="fg"><label class="fl" for="nv-sp">Sponsor</label><select class="fc" id="nv-sp"><option value="">Elegí la empresa</option></select></div></div>' +
      '<div class="fg"><label class="fl" for="nv-nom">Título del proyecto <span class="req">*</span></label><input class="fc" id="nv-nom"></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="nv-tipo">Desarrollo <span class="req">*</span></label><select class="fc" id="nv-tipo"></select></div>' +
        '<div class="fg"><label class="fl" for="nv-fp">Modo de pago <span class="req">*</span></label><select class="fc" id="nv-fp"></select></div></div>' +
      '<div class="fg"><label class="fl" for="nv-tit">Título del desarrollo</label><input class="fc" id="nv-tit" placeholder="Vacío = el título del proyecto"></div>' +
      '<div class="fg"><div class="u-row8"><label class="fl u-f1" for="nv-monto">Monto del desarrollo <span class="req">*</span></label>' +
          '<span class="ui-mon" role="group" aria-label="Moneda">' + mon('ARS') + mon('USD') + '</span></div>' +
        '<input class="fc u-tr m" type="number" min="0" id="nv-monto" data-monto><div class="u-s11-mt" id="nv-eq"></div></div>' +
      '<div class="nv-std" id="nv-std" hidden></div>' +
      '<div class="fg"><label class="fl" for="nv-mm">Mantenimiento por mes (opcional)</label><input class="fc u-tr m" type="number" min="0" id="nv-mm" data-monto>' +
        '<div class="u-s11-mt" id="nv-mm-eq"></div><div class="u-s11-mt">Incluye: monitoreo, reunión mensual, análisis y ajustes.</div></div>' +
      '<div class="nv-crea" id="nv-crea"></div>' +
      '<div class="u-c-rd u-s11" id="nv-err"></div>';
  }
  // El mismo formulario de carga rápida, en un modal (02/11/2026): se abre desde «+ Nuevo proyecto rápido»
  function nvAbrir(el) {
    var m = document.getElementById('m-nv');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-nv'; document.body.appendChild(m); }
    NV.moneda = 'ARS'; NV.std = null;
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Carga rápida</span>' +
      '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-nv">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' + htmlNuevo() + '</div>' +
      '<div class="mf"><span class="u-s11-mt u-f1">Se guarda como Prospecto.</span><button class="btn bg" data-cerrar="m-nv">Cancelar</button><button class="btn bp" data-pm="nv-ok">Guardar</button></div></div>';
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-pm]'); if (!b) return;
      if (b.getAttribute('data-pm') === 'nv-mon') { NV.moneda = b.getAttribute('data-m'); m.querySelectorAll('[data-pm="nv-mon"]').forEach(function (x) { x.classList.toggle('on', x === b); }); return nvEq(); }
      if (b.getAttribute('data-pm') === 'nv-ok') return nvGuardar(el);
    };
    openM('m-nv'); nvCargar();
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
    $n('nv-tipo').onchange = nvStd;
    ['nv-monto', 'nv-mm', 'nv-nom', 'nv-tit'].forEach(function (id) { $n(id).oninput = nvEq; });
    nvEq();
  }
  // Horas estándar del tipo: la base del catálogo (lo sugerido, sin preguntas) · estimar_desarrollo sin tildar nada
  async function nvStd() {
    var tipo = (document.getElementById('nv-tipo') || {}).value; NV.std = null;
    if (tipo) {
      var r = await db().rpc('estimar_desarrollo', { tipo: tipo, empresa_id: '', opts: {} });
      if (!r.error && r.data && r.data.ok && Number(r.data.horas) > 0) {
        var t = document.getElementById('nv-tipo');
        NV.std = { horas: Number(r.data.horas), tipo: t.options[t.selectedIndex].text,
                   base: (r.data.detalle || []).map(function (m) { var x = String(m.nombre || ''); return x.charAt(0).toLowerCase() + x.slice(1); }) };
      }
    }
    nvEq();
  }
  function nvEq() {
    var tc = window.TC || 0, usd = NV.moneda === 'USD', $n = function (id) { return document.getElementById(id); };
    var n = Number(($n('nv-monto') || {}).value) || 0, mm = Number(($n('nv-mm') || {}).value) || 0;
    var ars = usd ? n * tc : n, abono = usd ? mm * tc : mm;
    set('nv-eq', n && tc ? '= <span class="ui-num ui-p-usd">' + (usd ? fmt(ars) : fmt(n / tc, 'USD')) + '</span>' : '');
    set('nv-mm-eq', mm && tc ? '= <span class="ui-num ui-p-usd">' + (usd ? fmt(abono) : fmt(mm / tc, 'USD')) + '</span> por mes · ajuste por IPC cada <span class="ui-num">3</span> meses' : '');
    var box = $n('nv-std');
    if (box) {
      box.hidden = !NV.std;
      if (NV.std) box.innerHTML = '<div class="ui-kv">Horas estándar del catálogo<span class="ui-num">' + NV.std.horas + ' h</span></div>' +
        '<div class="ui-kv">Tu hora con este monto<span class="ui-num">' + (ars ? fmt(ars / NV.std.horas) + (tc ? ' <span class="ui-p-usd">' + fmt(ars / NV.std.horas / tc, 'USD') + '</span>' : '') : '—') + '</span></div>' +
        '<div class="u-s11-mt">Es la base de ' + esc(NV.std.tipo) + ': ' + esc(NV.std.base.join(', ')) + '. Para cotizar por funcionalidad, usá Nuevo proyecto ' +
        '(por ahora, <a class="ui-azul" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">en el CRM actual</a>).</div>';
    }
    var tit = String(($n('nv-tit') || {}).value || '').trim() || String(($n('nv-nom') || {}).value || '').trim() || 'El desarrollo';
    var crea = $n('nv-crea');
    if (crea) crea.innerHTML = '<div class="ui-lat-h">' + (abono > 0 ? 'Se crean dos desarrollos' : 'Se crea un desarrollo') + '</div>' +
      '<div class="ui-kv">' + esc(tit) + '<span class="ui-num">' + (ars ? fmt(ars) : '—') + '</span></div>' +
      (abono > 0 ? '<div class="ui-kv"><span class="ui-p-abono">Mantenimiento — ' + esc(tit) + '</span><span class="ui-num">' + fmt(abono) + ' × 12</span></div>' : '');
  }
  async function nvGuardar(el) {
    var v = function (id) { return String(document.getElementById(id).value || '').trim(); };
    var falta = [!v('nv-emp') && 'la empresa', !v('nv-nom') && 'el título del proyecto', !v('nv-tipo') && 'el tipo de desarrollo',
                 !(Number(v('nv-monto')) > 0) && 'el monto', !v('nv-fp') && 'el modo de pago'].filter(Boolean);
    if (falta.length) return set('nv-err', 'Falta ' + falta.join(', ') + '.');
    var b = document.querySelector('#m-nv [data-pm="nv-ok"]'); b.disabled = true;
    var r = await db().rpc('alta_proyecto_rapido', { p: { empresa_id: v('nv-emp'), sponsor_id: v('nv-sp'), nombre: v('nv-nom'), tipo: v('nv-tipo'),
      titulo: v('nv-tit') || v('nv-nom'), moneda: NV.moneda, monto: v('nv-monto'), forma_pago: v('nv-fp'), mant: v('nv-mm') } });
    b.disabled = false;
    if (r.error) return set('nv-err', esc(r.error.message));
    closeM('m-nv'); toast(r.data.pid + ' cargado como Prospecto', 'ok');
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
      .map(function (o) { return '<option value="' + esc(o) + '"' + (o === act ? ' selected' : '') + '>' + esc(uiNombreEst(o)) + '</option>'; }).join('');
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
    document.getElementById('ap-n').textContent = nuevas.length + ' desarrollo(s) cotizado(s). Lo que marques como «Entró» pasa a Aprobado. Si ya inicia, marcá «Inicia» con su fecha: arranca y empieza a facturar; si no, queda Aprobado sin facturar.';
    document.getElementById('ap-list').innerHTML = nuevas.map(function (it) {
      return '<div class="rowb u-row8"><div class="u-f1m"><div class="u-fw6">' + esc(it.titulo || it.tipo || it.id) + '</div>' +
        '<div class="u-s10-mt">' + esc(it.tipo_nombre || it.tipo || '') + ' · ' + fmt(Number(it.total_ars) || 0) + '</div></div>' +
        '<input class="fc u-wauto" type="number" data-monto data-apm="' + esc(it.id) + '" value="' + (Number(it.total_ars) || '') + '" aria-label="Monto aprobado" title="Monto aprobado (se puede corregir, p. ej. por IPC)">' +
        '<select class="fc u-wauto" data-ap="' + esc(it.id) + '" aria-label="Decisión"><option value="entro">Entró</option><option value="rechazado">No entró</option><option value="espera">En espera</option></select>' +
        '<label class="u-row6" data-tip="¿Inicia el desarrollo? Con fecha arranca y se puede facturar"><input type="checkbox" data-api="' + esc(it.id) + '"> Inicia</label>' +
        '<input class="fc u-wauto" type="date" data-apf="' + esc(it.id) + '" value="' + isoMas(0) + '" aria-label="Fecha de inicio" disabled></div>';
    }).join('') + '<div class="ui-kv">Total aprobado<span class="ui-num"><span class="ui-p-contratado" id="ap-tot"></span></span></div>';
    var total = function () {
      var t = 0; document.querySelectorAll('#ap-list [data-ap]').forEach(function (x) {
        if (x.value === 'entro') t += Number(document.querySelector('#ap-list [data-apm="' + x.getAttribute('data-ap') + '"]').value) || 0; });
      document.getElementById('ap-tot').textContent = fmt(t);
    };
    var inicia = function () {   // la fecha sólo con «Entró» e «Inicia»
      document.querySelectorAll('#ap-list [data-api]').forEach(function (c) {
        var id = c.getAttribute('data-api'), entro = document.querySelector('#ap-list [data-ap="' + id + '"]').value === 'entro';
        if (!entro) c.checked = false; c.disabled = !entro;
        document.querySelector('#ap-list [data-apf="' + id + '"]').disabled = !c.checked;
      });
    };
    document.getElementById('ap-list').oninput = total; document.getElementById('ap-list').onchange = function () { total(); inicia(); }; setTimeout(function () { total(); inicia(); }, 0);
    return new Promise(function (res) {
      document.getElementById('ap-ok').onclick = function () {
        var dec = {}, montos = {}, inicios = {}, n = 0, malo = '', sinFecha = '';
        document.querySelectorAll('#ap-list [data-ap]').forEach(function (x) {
          var id = x.getAttribute('data-ap'); dec[id] = x.value;
          if (x.value !== 'entro') return; n++;
          var m = Number(document.querySelector('#ap-list [data-apm="' + id + '"]').value) || 0;
          if (m <= 0) malo = id; montos[id] = m;
          if (document.querySelector('#ap-list [data-api="' + id + '"]').checked) {
            var f = document.querySelector('#ap-list [data-apf="' + id + '"]').value; if (!f) sinFecha = id; else inicios[id] = f;
          }
        });
        if (!n) return say('Marcá al menos uno como «Entró».\n\nSi no entró nada, usá No aceptar.', 'Aprobar propuesta');
        if (malo) return say('El monto aprobado de ' + malo + ' tiene que ser mayor a 0.', 'Aprobar propuesta');
        if (sinFecha) return say('Falta la fecha de inicio de ' + sinFecha + '.', 'Aprobar propuesta');
        closeM('m-aprob'); res({ dec: dec, montos: montos, inicios: inicios });
      };
      openM('m-aprob');
    });
  }

  // ── pintar ───────────────────────────────────────────────────
  // Las subpantallas están en el menú lateral (marcarSub lo mantiene al día)
  function pintar(el) {
    if (_montado !== 'pm') return;                // se terminó de leer con otro módulo en pantalla
    marcarSub(P.sub === 'ficha' ? P.prev : P.sub);
    var cab = uiHd('Proyectos', {
      seg: 'Proyectos en marcha y en negociación, para revisar.',
      proy: 'Todos los proyectos, con sus desarrollos y su estado.'
    }[P.sub] || 'Seguimiento y estado de cada proyecto.', uiBtn('Nuevo proyecto rápido', 'mas', 'p', 'data-pm="nv-abrir"'));
    if (P.sub === 'ficha') { el.innerHTML = htmlFicha(); return; }
    var tabs = uiTabs([['proy', 'Proyectos', 'data-pm="sub" data-s="proy"'], ['seg', 'Seguimiento', 'data-pm="sub" data-s="seg"']], P.sub);
    if (P.sub === 'seg') el.innerHTML = cab + tabs + '<div id="seg-c">' + htmlSeg() + '</div>';
    else if (P.sub === 'proy') el.innerHTML = cab + tabs + htmlProy();
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
    var nvPedido = s === 'nuevo';                 // el viejo #/pm/nuevo abre el modal
    await abrirModulo(el, { id: 'pm', texto: 'Cargando proyectos…', forzar: op && op.forzar, cargar: leer,
      cargado: function () { return P.ok; }, firma: function () { return JSON.stringify([P.proys, P.f]); }, pintar: function () { pintar(el); } });
    if (nvPedido) nvAbrir(el);
    if (!el._pmBound) {                          // una vez: #vista es el mismo para todos los módulos
      el._pmBound = true;
      el.addEventListener('ui-toggle', function (ev) {
        var d = ev.target, o = ev.detail.open;
        if (d.hasAttribute('data-segdesp')) P.seg.abierto[d.getAttribute('data-segdesp')] = o;
        if (d.hasAttribute('data-des')) {
          var did = d.getAttribute('data-des'); P.fAb[did] = o;
          if (o) P.fSel = did; else if (P.fSel === did) P.fSel = null;
          latRepintar();
        }
      });
      el.addEventListener('toggle', function (ev) {
        var d = ev.target; if (!d.matches) return;
        if (d.matches('details[data-segdesp]')) P.seg.abierto[d.getAttribute('data-segdesp')] = d.open;
        if (d.matches('details[data-emp]')) P.pr.abiertas[d.getAttribute('data-emp')] = d.open;
        if (d.matches('details[data-des]')) P.fAb[d.getAttribute('data-des')] = d.open;
      }, true);
    }
    var alGuardar = { onSave: refrescar };
    // El lateral sigue al desarrollo abierto: se redibuja sólo él
    var latRepintar = function () { var l = document.getElementById('pm-lat'), p = P.f && proy(P.f.id); if (l && p) l.outerHTML = lateral(p); };
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
    // Un modal simple (C14 de la app: .mo/.md): cuerpo + Cancelar / Confirmar; resuelve true al confirmar
    var modal = function (tit, cuerpo, okTxt, valida) {
      var m = document.getElementById('m-pm'); if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-pm'; document.body.appendChild(m); }
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">' + esc(tit) + '</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-pm">' + ico('cerrar') + '</button></div>' +
        '<div class="mb2">' + cuerpo + '</div><div class="mf"><button class="btn bg" data-cerrar="m-pm">Cancelar</button><button class="btn bp" id="m-pm-ok">' + esc(okTxt) + '</button></div></div>';
      openM('m-pm');
      return new Promise(function (res) {
        document.getElementById('m-pm-ok').onclick = function () { var e = valida ? valida() : ''; if (e) return toast(e, 'err'); closeM('m-pm'); res(true); };
      });
    };
    var hoyIso = function () { return isoMas(0); };
    // Arrancar a nivel proyecto: qué desarrollos aprobados empiezan y desde cuándo (la aprobación no implica el inicio)
    var arrancar = async function (p, soloIds, tit) {
      var L = (p.items || []).filter(function (it) { return _canonSol(it.estado) === 'aprobada' && !it.detenido && (!soloIds || soloIds.indexOf(it.id) >= 0); });
      if (!L.length) return say('No hay desarrollos aprobados para arrancar.', 'Arrancar');
      var ok = await modal(tit || 'Arrancar desarrollos', '<div class="u-s11-mt u-mb10">Marcá lo que arranca y la fecha de inicio de cada uno.</div>' + L.map(function (it) {
        return '<div class="rowb u-row8"><label class="u-row6 u-f1m"><input type="checkbox" data-arr="' + esc(it.id) + '" checked> ' + esc(it.titulo || it.id) + '</label>' +
          '<input class="fc u-wauto" type="date" data-arrf="' + esc(it.id) + '" value="' + hoyIso() + '" aria-label="Fecha de inicio"></div>'; }).join(''), 'Arrancar',
        function () { var n = 0, mal = false; document.querySelectorAll('#m-pm [data-arr]').forEach(function (x) { if (!x.checked) return; n++; if (!document.querySelector('#m-pm [data-arrf="' + x.getAttribute('data-arr') + '"]').value) mal = true; });
          return !n ? 'Marcá al menos uno' : mal ? 'Falta la fecha de inicio' : ''; });
      if (!ok) return;
      var sel = Array.prototype.filter.call(document.querySelectorAll('#m-pm [data-arr]'), function (x) { return x.checked; }).map(function (x) {
        var did = x.getAttribute('data-arr'); return { did: did, f: document.querySelector('#m-pm [data-arrf="' + did + '"]').value }; });
      var hecho = await conDeshacer('Arrancar', 'desarrollos', sel.map(function (x) { return x.did; }), async function () {
        for (var i = 0; i < sel.length; i++) {
          var r1 = await db().rpc('fecha_desarrollo', { did: sel[i].did, campo: 'fecha_ini', fecha: sel[i].f });
          if (r1.error) { toast(r1.error.message, 'err'); return false; }
          var r2 = await db().rpc('accion_desarrollo', { did: sel[i].did, accion: 'arrancar' });
          if (r2.error) { toast(r2.error.message, 'err'); return false; }
        }
        return true;
      });
      if (!hecho) return;
      toast(sel.length + ' desarrollo(s) arrancado(s)', 'ok'); refrescar();
    };
    // No aceptar o detener: el proyecto completo o algunos desarrollos, siempre con un comentario del proyecto
    var corte = async function (p, tipo) {
      var rech = tipo === 'rechazar';
      var L = (p.items || []).filter(function (it) { var c = _canonSol(it.estado);
        return rech ? (c === 'nueva' || c === 'aprobada') : (depende(it) && !it.detenido && c !== 'finalizada' && c !== 'rechazada'); });
      var tit = rech ? 'No aceptar' : 'Detener';
      var ok = await modal(tit + ' · ' + (p.nombre || p.id),
        '<label class="u-row6 u-mb6"><input type="radio" name="pm-alc" value="todo" checked> El proyecto completo</label>' +
        (L.length ? '<label class="u-row6 u-mb6"><input type="radio" name="pm-alc" value="algunos"> Sólo estos desarrollos</label><div class="u-mb10">' + L.map(function (it) {
          return '<label class="u-row6 rowb"><input type="checkbox" data-cor="' + esc(it.id) + '"> ' + esc(it.titulo || it.id) + ' <span class="u-s10-mt">· ' + esc(uiNombreEst(it.estado)) + '</span></label>'; }).join('') + '</div>'
          : '<div class="u-s11-mt u-mb10">' + (rech ? 'No hay desarrollos para marcar como no aceptados por separado.' : 'Sólo se pausan por separado las mejoras, soportes y mantenimientos que dependen de otro.') + '</div>') +
        '<div class="fg"><label class="fl" for="pm-com">Comentario del proyecto <span class="req">*</span></label><textarea class="fc" id="pm-com" rows="3"></textarea></div>', tit,
        function () {
          var alc = (document.querySelector('#m-pm [name="pm-alc"]:checked') || {}).value;
          if (alc === 'algunos' && !document.querySelector('#m-pm [data-cor]:checked')) return 'Marcá al menos un desarrollo';
          return document.getElementById('pm-com').value.trim() ? '' : 'Escribí el comentario';
        });
      if (!ok) return;
      var alc = (document.querySelector('#m-pm [name="pm-alc"]:checked') || {}).value, txt = document.getElementById('pm-com').value.trim();
      var ids = Array.prototype.filter.call(document.querySelectorAll('#m-pm [data-cor]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-cor'); });
      var r;
      if (alc === 'todo') r = await db().rpc(rech ? 'rechazar_proyecto' : 'detener_proyecto', rech ? { pid: p.id } : { pid: p.id, detener: true });
      else for (var i = 0; i < ids.length && !(r && r.error); i++)
        r = await db().rpc(rech ? 'accion_desarrollo' : 'detener_desarrollo', rech ? { did: ids[i], accion: 'rechazar' } : { did: ids[i], detener: true });
      if (r && r.error) return toast(r.error.message, 'err');
      var nombres = ids.map(function (x) { var it = itemDe(x); return it ? (it.titulo || x) : x; });
      await db().rpc('comentar', { p: { proyecto_id: p.id, texto: (rech ? 'No aceptado' : 'Detenido') + (alc === 'todo' ? ' (proyecto completo)' : ': ' + nombres.join(', ')) + '. ' + txt } });
      toast(rech ? 'No aceptado' : 'Detenido', 'ok'); if (rech) toast(AVISO_ALERTAS, 'inf'); refrescar();
    };
    // Nueva mejora / Nuevo soporte: una línea simple en Nuevo, que depende del desarrollo elegido
    var altaDes = async function (p) {
      var bases = basesAlta(p); if (!bases.length) return;
      var ok = await modal('Nuevo desarrollo · ' + (p.nombre || p.id),
        '<div class="fg"><label class="fl" for="ad-clase">Tipo <span class="req">*</span></label><select class="fc" id="ad-clase" onchange="document.getElementById(\'ad-hs-w\').hidden = this.value !== \'mejora\'"><option value="mejora">Mejora</option><option value="soporte">Soporte</option></select></div>' +
        '<div class="fg"><label class="fl" for="ad-padre">Depende de <span class="req">*</span></label><select class="fc" id="ad-padre">' +
          bases.map(function (it) { return '<option value="' + esc(it.id) + '">' + esc(it.titulo || it.id) + '</option>'; }).join('') + '</select></div>' +
        '<div class="fg"><label class="fl" for="ad-tit">Título <span class="req">*</span></label><input class="fc" id="ad-tit"></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ad-mon">Moneda</label><select class="fc" id="ad-mon"><option>ARS</option><option>USD</option></select></div>' +
        '<div class="fg"><label class="fl" for="ad-monto">Monto <span class="req">*</span></label><input class="fc" type="number" id="ad-monto" data-monto></div></div>' +
        '<div class="fg" id="ad-hs-w"><label class="fl" for="ad-hs">Horas</label><input class="fc" type="number" min="0" id="ad-hs"></div>' +
        '<div class="u-s11-mt">Nace en Nuevo y se aprueba como cualquier desarrollo.</div>', 'Crear',
        function () { return !document.getElementById('ad-tit').value.trim() ? 'Poné un título' : !(Number(document.getElementById('ad-monto').value) > 0) ? 'El monto tiene que ser mayor a 0' : ''; });
      if (!ok) return;
      var clase = document.getElementById('ad-clase').value, mej = clase === 'mejora';
      hacer('alta_desarrollo', { p: { padre: document.getElementById('ad-padre').value, clase: clase, titulo: document.getElementById('ad-tit').value.trim(), moneda: document.getElementById('ad-mon').value,
        monto: document.getElementById('ad-monto').value, horas: mej ? document.getElementById('ad-hs').value : '' } });
    };
    var itemDe = function (iid) { var it = null; P.proys.some(function (p) { return (it = (p.items || []).find(function (x) { return x.id === iid; })); }); return it; };
    var cambiarEstado = async function (p, canon) {
      switch (canon) {
        case 'negociacion':
          if (!(await ask('¿Enviar la propuesta?\n\nEl proyecto pasa a Negociación. Los desarrollos siguen en Nuevo.', 'Enviar propuesta'))) return;
          return hacer('enviar_propuesta', { pid: p.id, fecha: null });
        case 'aprobado':                         // aprobar no es un cambio de estado: es decidir qué entró
          var dec = await abrirAprobar(p); if (!dec) return;
          return hacer('aprobar_proyecto', { pid: p.id, decisiones: dec.dec, montos: dec.montos, inicios: dec.inicios }, null, true);
        case 'finalizado':
          var ab = (p.items || []).filter(function (it) { var c = _canonSol(it.estado || ''); return c === 'curso' || c === 'garantia' || c === 'aprobada'; });
          var msg = ab.length ? '¿Finalizar el proyecto?\n\nQuedan ' + ab.length + ' desarrollo(s) sin cerrar:\n' +
              ab.map(function (it) { return '· ' + (it.titulo || it.tipo || it.id) + ' — ' + (it.estado || ''); }).join('\n') + '\n\nSe cierran todos junto con el proyecto.'
            : '¿Finalizar el proyecto?\n\nTodos los desarrollos ya están cerrados.';
          if (!(await ask(msg, 'Finalizar proyecto'))) return;
          return hacer('finalizar_proyecto', { pid: p.id });
        case 'rechazado': return corte(p, 'rechazar');
        case 'activo': return toast('«Activo» se calcula solo: arrancá un desarrollo desde su fila', 'inf');
      }
      if (!(await ask('«' + (p.nombre || p.id) + '» pasa a ' + nombreProy(canon) + '.', 'Cambiar estado', { ok: 'Cambiar' }))) return;
      return hacer('cambiar_estado_proyecto', { pid: p.id, estado: nombreProy(canon) }, 'Estado: ' + nombreProy(canon));
    };
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.id === 'pr-orden') { P.pr.orden = t.value; return pintar(el); }
      if (t.hasAttribute && t.hasAttribute('data-fini')) return hacer('fecha_desarrollo', { did: t.getAttribute('data-fini'), campo: 'fecha_ini', fecha: t.value || null }, 'Fecha del desarrollo guardada');
    };
    // Comentario rápido: Enter guarda en el proyecto
    // Tareas con la forma de Hoy (Seguimiento y ficha): se buscan entre las de los proyectos y las de la ficha abierta
    var ctxTar = { st: P.tst, users: usuarios(), repintar: function () { pintar(el); }, refrescar: refrescar,
      buscar: function (id) { var t = null; Object.keys(P.tareas).some(function (k) { return (t = P.tareas[k].find(function (x) { return x.id === id; })); });
                              return t || (P.f && (P.f.tareas || []).find(function (x) { return x.id === id; })); } };
    el.onkeydown = async function (ev) {
      if (TareasUI.manejar(ev, ctxTar)) return;
      var t = ev.target; if (ev.key !== 'Enter' || !t.hasAttribute || !t.hasAttribute('data-segnota')) return;
      var txt = t.value.trim(); if (!txt) return;
      t.disabled = true;
      var r = await db().rpc('comentar', { p: { proyecto_id: t.getAttribute('data-segnota'), texto: txt } });
      if (r.error) { t.disabled = false; return toast(r.error.message, 'err'); }
      toast('Comentario guardado', 'ok'); refrescar();
    };
    el.onclick = function (ev) {
      if (TareasUI.manejar(ev, ctxTar)) return;
      var b = ev.target.closest('[data-pm]'); if (!b) return;
      var a = b.getAttribute('data-pm'), id = b.getAttribute('data-id');
      if (a === 'ficha') return abrirFicha(el, id);
      if (a === 'sub') { P.sub = b.getAttribute('data-s'); return pintar(el); }
      if (a === 'arrancar') return arrancar(proy(id));
      if (a === 'alta-des') return altaDes(proy(id));
      if (a === 'fin-des') {
        var ffin = el.querySelector('[data-ffin="' + id + '"]');
        if (!ffin || !ffin.value) return toast('Elegí la fecha de fin', 'err');
        return hacer('fecha_desarrollo', { did: id, campo: 'fecha_fin', fecha: ffin.value }, 'Fecha de fin guardada');
      }
      if (a === 'nv-abrir') return nvAbrir(el);
      if (a === 'contactos') { var pc = proy(id); return abrirFichaEmpresa(pc.empresa_id, { onSave: refrescar }); }
      if (a === 'seg-contacto') { ev.preventDefault(); return abrirContacto(null, { empresa: proy(id).empresa_id, onSave: refrescar }); }
      if (a === 'nota-foco') { ev.preventDefault(); var nf = el.querySelector('[data-segnota="' + id + '"]'); if (nf) { nf.focus(); nf.scrollIntoView({ block: 'center' }); } return; }
      if (a === 'volver') { P.sub = P.prev || 'seg'; return pintar(el); }
      if (a === 'nav') {
        var L = P.fLista, k = (L.indexOf(P.f.id) + Number(b.getAttribute('data-dir')) + L.length) % L.length;
        return abrirFicha(el, L[k], P.prev);
      }
      if (a === 'ftab') { P.fTab = b.getAttribute('data-t'); return pintar(el); }
      if (a === 'lat-proy') { P.fSel = null; return latRepintar(); }
      // ── acciones (5c) ──
      if (a === 'estado') { ev.preventDefault(); return cambiarEstado(proy(id), b.getAttribute('data-est')); }
      if (a === 'det-proy') {
        ev.preventDefault();
        var pd = proy(id);
        if (!pd.detenido) return corte(pd, 'detener');
        return ask('¿Reanudar «' + (pd.nombre || id) + '»?', 'Reanudar proyecto', { ok: 'Reanudar' }).then(function (ok) { if (ok) hacer('detener_proyecto', { pid: id, detener: false }); });
      }
      if (a === 'edit-des') { ev.preventDefault(); return abrirDesarrollo(id, { onSave: refrescar }); }
      if (a === 'det-des') { ev.preventDefault(); var dd = itemDe(id);
        var ddn = '«' + (dd.titulo || id) + '»';
        return ask(dd.detenido ? '¿Reanudar ' + ddn + '?' : '¿Pausar ' + ddn + '? No cambia el estado del proyecto.', dd.detenido ? 'Reanudar' : 'Pausar', { ok: dd.detenido ? 'Reanudar' : 'Pausar' }).then(function (ok) {
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
        var go = function () { conDeshacer('Cambio de estado', 'desarrollos', [id], function () { return hacer('accion_desarrollo', { did: id, accion: acc }, function (r) {
          var f = r.alertas_facturacion || {}, extra = (f.creadas ? ' · ' + f.creadas + ' alerta(s) de facturación' : '') + (f.cerradas ? ' · ' + f.cerradas + ' cerrada(s)' : '');
          return r.de + ' → ' + r.a + extra; }); }).then(function (r) {
            // Al finalizar un desarrollo, ¿arranca ya el mantenimiento (MMR) que lo cubre?
            var it0 = itemDe(id); if (!r || acc !== 'cerrar' || !it0 || esMant(it0)) return;
            var pp = P.proys.find(function (x) { return (x.items || []).some(function (y) { return y.id === id; }); });
            var mants = ((pp && pp.items) || []).filter(function (y) { return esMant(y) && _canonSol(y.estado) === 'aprobada' && (y.mant_de_ids || []).indexOf(id) >= 0; });
            if (mants.length) arrancar(pp, mants.map(function (y) { return y.id; }), '¿Arranca el mantenimiento?');
          }); };
        var itA = itemDe(id), dn = '«' + ((itA && itA.titulo) || id) + '»';
        if (acc === 'rechazar') return ask('¿Marcar ' + dn + ' como no aceptado? Se puede recotizar después.', 'No aceptar desarrollo', { ok: 'No aceptar', peligro: true }).then(function (ok) { if (ok) go(); });
        var full = b.getAttribute('aria-label') || acc, etq = full.split(':')[0];   // «Finalizar: Se cumplieron las cuotas»
        return ask(etq + ' ' + dn + (itA && itA.estado ? ' (hoy ' + uiNombreEst(itA.estado) + ').' : '.') + (full !== etq ? '\n\n' + full.slice(etq.length + 1).trim() : ''), etq + ' desarrollo', { ok: etq }).then(function (ok) { if (ok) go(); });
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
  // La Carga rápida también se abre desde el Cotizador (03/11/2026): el mismo modal, sin duplicarlo
  window.abrirCargaRapida = function () { nvAbrir(document.getElementById('vista')); };
})();

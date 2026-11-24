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
            f: null, fLista: [], fAb: {}, prev: 'proy' };
  var SUBS = [['proy', 'Proyectos'], ['seg', 'Seguimiento']];   // pestañas; entra directo a Proyectos. Nuevo proyecto rápido es un modal (02/11/2026)

  async function cargar() {
    var r = await Promise.all([
      db().from('v_pm_proyectos').select('*'),
      db().from('v_pm_seguimiento').select('*'),
      db().from('empresas').select('id,nombre,alias,logo,drive_interno'),
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
  // Renovar un mantenimiento: en curso o finalizado, con 2 cuotas o menos por cobrar (_puedeRenovar)
  function puedeRenovar(it) { var d = Number(it.duracion) || 0, c = _canonSol(it.estado); return esMant(it) && d > 0 && d - (Number(it.cuotas_facturadas) || 0) <= 2 && (c === 'curso' || c === 'finalizada'); }
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
    if (can === 'negociacion') { var f = _pd(p.fecha_propuesta); return f ? 'Negociación: la propuesta se envió el ' + ff(f) : 'Negociación'; }
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
  var RECH = ['rechazar', 'No aceptar', 'e_cruz', 'El cliente no lo aceptó. Se puede recotizar'];
  var ACC_DES = { nueva: [RECH], aprobada: [['arrancar', 'Arrancar', 'e_play', 'Empezó el trabajo'], RECH],
                  curso: [['entregar', 'Deployar', 'e_trebol', 'Sale a producción y empieza a correr la garantía']],
                  garantia: [['cerrar', 'Finalizar', 'e_cuadrado', 'Se cumplió la garantía. Acá arranca el mantenimiento']] };
  var ACC_MANT = { nueva: [RECH], aprobada: [['arrancar', 'Arrancar', 'e_play', 'Empezó a facturar'], RECH],
                   curso: [['cerrar', 'Finalizar', 'e_cuadrado', 'Se cumplieron las cuotas']], garantia: [['cerrar', 'Finalizar', 'e_cuadrado', 'Se cumplieron las cuotas']] };
  function accionesDes(it) { return ((esMant(it) ? ACC_MANT : ACC_DES)[_canonSol(it.estado || '')] || []); }
  function botonesDes(it, soloPrincipal) {
    var acc = accionesDes(it); if (soloPrincipal) acc = acc.filter(function (a) { return a[0] !== 'rechazar'; }).slice(0, 1);
    var hov = { check: 'fin', cerrar: 'bor', e_cuadrado: 'fin', e_cruz: 'bor' };   // C11: el hover dice el resultado
    return acc.map(function (a) { return uiIb(a[2], a[1] + ': ' + a[3], hov[a[2]] || '', 'data-pm="acc-des" data-id="' + esc(it.id) + '" data-acc="' + a[0] + '"'); }).join('');
  }
  // La próxima acción del proyecto según dónde está (Activo sale solo al arrancar un desarrollo)
  function accionesProy(p) {
    if (p.detenido) return [];
    switch (_canonProy(p.estado_proyecto)) {
      case 'prospecto': return [['negociacion', 'Enviar propuesta', 'e_flechas']];
      case 'negociacion': return [['aprobado', 'Aprobar', 'e_check'], ['rechazado', 'No aceptar', 'e_cruz']];
      case 'activo': return [['finalizado', 'Finalizar', 'e_cuadrado']];
    }
    return [];
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
    var ICO = { negociacion: ['e_flechas', 'Enviar la propuesta', ''], aprobado: ['e_check', 'Aprobar', 'fin'], rechazado: ['e_cruz', 'No aceptar', 'bor'], finalizado: ['e_cuadrado', 'Finalizar', 'fin'] };
    var iconos = (can === 'finalizado' || can === 'rechazado' ? '' :
        (p.detenido ? uiIb('e_play', 'Reanudar el proyecto', '', 'data-pm="det-proy" data-id="' + pid + '"') : uiIb('e_pausa', 'Detener', 'det', 'data-pm="det-proy" data-id="' + pid + '"'))) +
      acc.map(function (a) { var k = ICO[a[0]] || [a[2], a[1], '']; return uiIb(k[0], k[1], k[2], 'data-pm="estado" data-id="' + pid + '" data-est="' + a[0] + '"'); }).join('');
    h += '<div class="ui-tarjeta-hd"><div><div class="ui-pro">' + esc(p.nombre || '—') + '</div><div class="ui-sub-t">' + esc(p.empresa || '') + '</div></div>' +
      '<div class="ui-tarjeta-der"><div>' + uiEstado(e, { detenido: p.detenido }) + '</div>' +
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
    var list = all.filter(pasaSeg).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0 || norm((P.emps[p.empresa] || {}).alias || '').indexOf(q) >= 0; });
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
      // abierta: el porqué del estado va debajo del nombre, donde estaba la empresa (16/11/2026)
      sub: ab ? '<div class="ui-motivo ui-fp-mot"><span class="ui-e-' + uiClaveEst(p.estado_proyecto || 'Prospecto') + '">' + esc(porQue(p, _canonProy(p.estado_proyecto)) || deDondeSale(p)) + '</span></div>' : '',
      est: (p.detenido ? uiEstado('Detenido', { detenido: true }) : uiEstado(p.estado_proyecto || '—')) +
        // abierta: debajo del estado, Detener en chico y con su palabra (16/11/2026)
        (false && ab && !p.detenido && ['finalizado', 'rechazado'].indexOf(_canonProy(p.estado_proyecto)) < 0 ? '<button type="button" class="ui-det-txt" data-pm="det-proy" data-id="' + esc(p.id) + '">' + uiIco('pausa') + 'Detener</button>' : '') },
      ab && P.f && P.f.id === p.id ? fichaCuerpo(p, true) : '');
  }
  // Proyectos = el universo completo (29/10/2026): los mismos chips de Seguimiento más Finalizado
  // y Rechazado; agrupados por cliente (12/11/2026); al desplegar, la ficha completa.
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
    var f = all.filter(function (p) { return !fil.length || fil.some(function (k) { return proyPasa(p, k); }); }).filter(function (p) { return !q || norm(p.nombre).indexOf(q) >= 0 || norm(p.empresa).indexOf(q) >= 0 || norm((P.emps[p.empresa] || {}).alias || '').indexOf(q) >= 0; });
    h = htmlKpis(f) + barraFiltro(PR_FIL, fil, function (k) { return all.filter(function (p) { return proyPasa(p, k); }).length; }, 'prchip', all.length, f.length) + h;
    if (!f.length) return h + '<div class="ui-nota-t">Sin proyectos para este filtro.</div>';
    f.sort(function (a, b) {
      var em = (a.empresa || '').localeCompare(b.empresa || '', 'es'); if (em) return em;
      if (R.orden === 'nombre') return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      if (R.orden === 'prob') return (b.probabilidad || 0) - (a.probabilidad || 0);
      if (R.orden === 'fecha') return String(b.fecha_propuesta || '').localeCompare(String(a.fecha_propuesta || ''));
      return (b.monto_final_ars || 0) - (a.monto_final_ars || 0);
    });
    // Agrupado por cliente otra vez (12/11/2026): la barra del cliente con sus totales y, debajo, sus proyectos
    var by = {}, ord = [];
    f.forEach(function (p) { var e = p.empresa || 'Sin empresa'; if (!by[e]) { by[e] = []; ord.push(e); } by[e].push(p); });
    return h + '<div>' + ord.map(function (emp) {
      var ps = by[emp], ab = R.abiertas[emp] !== undefined ? R.abiertas[emp] : (!!q || ps.some(function (p) { return p.id === P.inline; }));
      var cont = sum(ps, mTotal), rec = sum(ps, mRecurrente);
      return '<details class="pm-emp" data-emp="' + esc(emp) + '"' + (ab ? ' open' : '') + '><summary class="pm-emp-h"><span class="ui-ch">' + uiIco('derecha') + '</span>' + uiLogo(emp, (P.emps[emp] || {}).logo) +
        '<span class="pm-emp-n">' + esc(emp) + '</span><span class="ui-nota-t"><span class="ui-num">' + ps.length + '</span> proyecto' + (ps.length === 1 ? '' : 's') + '</span><span class="u-f1"></span>' +
        (cont ? '<span class="ui-num ui-p-contratado">' + fmt(cont) + '</span>' : '') + (rec ? '<span class="ui-num ui-p-abono">' + fmt(rec) + '/mes</span>' : '') + '</summary>' +
        '<div class="pm-emp-b">' + ps.map(tarjetaProy).join('') + '</div></details>'; }).join('') + '</div>';
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
      db().from('entregables').select('id,titulo,tipo,accesos,creado').eq('proyecto_id', id).order('creado', { ascending: false }),
      db().from('proyectos').select('fecha_cierre_probable,creado,fecha_aprobacion,fecha_propuesta_enviada,fecha_inicio,fecha_finalizado,minuta,sponsors,sponsor_id').eq('id', id).maybeSingle(),
      db().from('cobros').select('desarrollo_id,cuota_nro,tipo_comprobante,comprobante_nro,comprobante_fecha,deposito_fecha,monto_ars,link_fc').eq('proyecto_id', id).order('comprobante_fecha'),
      db().from('desarrollos').select('id,monto_cotizado,mantenimiento_horas').eq('proyecto_id', id),
      db().from('historial_proyecto').select('evento,fecha,prevista,detalle,quien').eq('proyecto_id', id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(60)
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    P.f = {
      id: id,
      tareas: r[0].data,
      // comentarios del proyecto (la columna puede traer varios, separados por coma), los más nuevos primero
      coms: r[1].data.filter(function (c) { return crmLista(c.proyecto_id).indexOf(id) >= 0; })
        .sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || (a.orden - b.orden); }),
      cons: r[2].data, horas: r[3].data, analisis: r[4].data[0] || null, entregables: r[5].data, cierreProb: (r[6].data || {}).fecha_cierre_probable, pd: r[6].data || {}, hist: r[9].data || [], cobros: r[7].data, cotizado: r[8].data.reduce(function (o, d) { o[d.id] = Number(d.monto_cotizado) || 0; return o; }, {}), an: {}
    };
    // Análisis económico (12/11/2026): el mismo del Cotizador (cot_analisis), por desarrollo con horas
    var mhs = {}; r[8].data.forEach(function (d) { mhs[d.id] = Number(d.mantenimiento_horas) || 0; });
    var devs = (p.items || []).filter(function (it) { return !esMant(it) && _canonSol(it.estado) !== 'rechazada' && Number(it.horas) > 0; });
    var an = await Promise.all(devs.map(function (it) {
      var mm = (p.items || []).filter(function (x) { return esMant(x) && (x.mant_de_ids || []).indexOf(it.id) >= 0; })[0];
      return db().rpc('cot_analisis', { o: { tipo: it.tipo, horas: Number(it.horas) || 0, precio: Number(it.total_ars) || 0,
        abono: mm ? Number(mm.cuota_act) || Number(mm.valor_cuota) || 0 : 0, mant_hs: mm ? mhs[mm.id] || 0 : 0, vh: Number(it.vh) || 0 } }); }));
    devs.forEach(function (it, i) { if (an[i] && !an[i].error) P.f.an[it.id] = an[i].data; });
  }
  // Análisis económico en la pestaña Económico: referencia de mercado, alertas y qué conviene sumar
  function analisisFicha(p) {
    var A = (P.f && P.f.an) || {}, ids = Object.keys(A); if (!ids.length) return '';
    var row = function (t, m, cls) { return '<div class="cot-an-i"><span>' + t + '</span>' + (m != null ? '<div class="cot-an-m' + (cls ? ' ' + cls : '') + '">' + m + '</div>' : '') + '</div>'; };
    return '<div class="cot-lat"><div class="ui-lat-h u-mt10 cot-t-az">Análisis económico</div>' + ids.map(function (id) {
      var a = A[id], it = (p.items || []).find(function (x) { return x.id === id; }) || {}, M = a.mercado;
      var h = '<div class="cot-sel-t"><span class="ui-f1">' + esc(it.titulo || it.tipo_nombre || id) + '</span><span class="ui-num ui-nota-t">' + Math.round(Number(it.horas) || 0) + ' h</span></div>';
      if (M) {
        h += row(esc(M.rol) + ' · semi senior · USD <span class="ui-num">' + M.usd_min + '</span>–<span class="ui-num">' + M.usd_max + '</span> la hora<span class="cot-sub">' + esc(M.fuente || '') + ' · <span class="ui-num">' + (ff(M.fecha) || '') + '</span></span>',
          '<span class="ui-num">' + fmt(M.ars_min) + ' – ' + fmt(M.ars_max) + '</span>');
        if (M.usd_hora) h += row('Precio = USD <span class="ui-num">' + String(M.usd_hora).replace('.', ',') + '</span> la hora',
          M.posicion === 'debajo' ? 'por debajo del mercado' : M.posicion === 'encima' ? 'por encima del mercado' : 'dentro del mercado', M.posicion === 'dentro' ? 'ui-e-finalizado' : 'ui-p-pendiente');
      }
      (a.alertas || []).forEach(function (x) { var c = x.nivel === 'error' ? 'ui-p-error' : 'ui-p-pendiente';
        h += row('<span class="cot-dot ' + c + '"></span>' + esc(x.texto), x.monto ? '<span class="ui-num">' + fmt(x.monto) + (x.mensual ? '/mes' : '') + '</span>' : null, c); });
      (a.sugerencias || []).forEach(function (x) { h += row('<span class="ui-e-finalizado">Sumar</span> · ' + esc(x.texto) + ' (<span class="ui-num">' + fmt(x.a) + '</span> por mes)', '<span class="ui-num">+' + fmt(x.monto) + '/mes</span>', 'ui-e-finalizado'); });
      if (!M && !(a.alertas || []).length && !(a.sugerencias || []).length) h += '<div class="ui-nota-t">Sin alertas.</div>';
      return h; }).join('') + '<div class="ui-nota-t u-mt10">Son sugerencias: no cambian nada.</div></div>';
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
      // Todos los hitos aunque falte la fecha: los futuros se ven en gris (18/11/2026)
      if (esMant(it)) { ev.push({ f: ini || arr, t: 'Arranca' + tit(it), c: 'curso' }); ev.push({ f: fin, t: 'Fin del abono' + tit(it), c: 'finalizado' }); return; }
      ev.push({ f: ini, t: 'Inicio' + tit(it), c: 'curso' });
      ev.push({ f: fin, t: 'Fin' + tit(it), c: 'finalizado' });
      var gd = Number(it.garantia_dias) || 0;
      if (gd) ev.push({ f: fin ? mCorrerDias(fin, gd) : null, t: 'Fin de garantía' + tit(it), c: 'garantia' });
    });
    if (!ev.length) return '<div class="ui-nota-t">Sin fechas cargadas.</div>';
    ev.sort(function (a, b) { return (a.f ? a.f.getTime() : 9e15) - (b.f ? b.f.getTime() : 9e15); });
    // Riel (17/11/2026): flechas de color por estado con la fecha adentro; debajo el desarrollo y su estado. Sin notas.
    return '<ol class="tl-riel">' + ev.map(function (x) {
      var pz = String(x.t).split(' · '), hito = pz[0].replace(/^Fin de obra$/, 'Fin'), nom = pz.slice(1).join(' · ');
      return '<li class="tl-paso ui-e-' + (x.f ? x.c : 'rechazado') + (x.f && x.f <= hoy ? ' hecho' : '') + '"><span class="tl-flecha"><span class="ui-num">' + (x.f ? ff(x.f) : '—') + '</span></span>' +
        '<span class="tl-nom">' + esc(nom || hito) + '</span>' + (nom ? '<span class="tl-est">' + esc(hito) + '</span>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  // Alta del abono mensual (MMR) del proyecto (18/11/2026): cuota, meses, ajuste e inicio; uno solo activo
  function altaAbono(el, p) {
    var devs = (p.items || []).filter(function (it) { return !esMant(it) && _canonSol(it.estado) !== 'rechazada'; });
    armarModal('m-abono', 'Abono mensual · ' + (p.nombre || ''),
      '<div class="fg"><label class="fl" for="ab-padre">Mantiene</label><select class="fc" id="ab-padre">' + devs.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.titulo || d.id) + '</option>'; }).join('') + '</select></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="ab-cuota">Cuota mensual</label><input class="fc u-tr" type="number" min="0" id="ab-cuota" data-monto></div>' +
      '<div class="fg"><label class="fl" for="ab-meses">Meses</label><input class="fc u-tr ui-num" type="number" min="1" id="ab-meses" value="12"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="ab-aj">Ajuste por IPC</label><select class="fc" id="ab-aj"><option value="1">Sí</option><option value="0">No</option></select></div>' +
      '<div class="fg"><label class="fl" for="ab-ini">Inicio</label><input class="fc" type="date" id="ab-ini"><div class="u-s11-mt">Vacío: arranca al terminar lo que mantiene.</div></div></div>',
      '<button class="btn bg" data-cerrar="m-abono">Cancelar</button><button class="btn bp" id="ab-ok">Crear abono</button>');
    document.getElementById('ab-ok').onclick = async function () {
      var r = await db().rpc('alta_abono', { pid: p.id, padre: document.getElementById('ab-padre').value, cuota: Number(document.getElementById('ab-cuota').value), meses: Number(document.getElementById('ab-meses').value),
        ajuste: document.getElementById('ab-aj').value === '1', inicio: document.getElementById('ab-ini').value || null });
      if (r.error) return toast(r.error.message, 'err');
      closeM('m-abono'); toast('Abono creado', 'ok'); await cargar(); await cargarFicha(P.f.id); pintar(el);
    };
    openM('m-abono');
  }
  // Editar todas las fechas de un desarrollo en una ventana (18/11/2026): las que su estado permite
  function fechasDes(el, it) {
    var cerr = desCerrado(it) || _canonSol(it.estado) === 'rechazada';
    if (cerr) return say('Este desarrollo está cerrado: sus fechas ya no se cambian.', 'Fechas');
    // Contenedor e ids propios (19/11/2026): con m-fdes y fd-* pisaba la ventana Desarrollo
    armarModal('m-fechas', 'Fechas · ' + (it.titulo || it.id),
      (esGanado(it.estado) ? '<div class="fg"><label class="fl" for="fe-apr">Aprobado</label><input class="fc" type="date" id="fe-apr" value="' + esc(String(it.fecha_aprob || '').slice(0, 10)) + '"></div>' : '') +
      '<div class="g2"><div class="fg"><label class="fl" for="fe-ini">Inicio</label><input class="fc" type="date" id="fe-ini" value="' + esc(String(it.fecha_est || '').slice(0, 10)) + '"></div>' +
      '<div class="fg"><label class="fl" for="fe-fin">Fin</label><input class="fc" type="date" id="fe-fin" value="' + esc(String(it.fecha_fin || '').slice(0, 10)) + '"></div></div>' +
      '<div class="ui-nota-t">La garantía y el arranque del mantenimiento se calculan desde el fin.</div>',
      '<button class="btn bg" data-cerrar="m-fechas">Cancelar</button><button class="btn bp" id="fe-ok">Guardar</button>');
    document.getElementById('fe-ok').onclick = async function () {
      var ini = document.getElementById('fe-ini').value, fin = document.getElementById('fe-fin').value;
      if (ini !== String(it.fecha_est || '').slice(0, 10)) { var a = await db().rpc('fecha_desarrollo', { did: it.id, campo: 'fecha_ini', fecha: ini || null }); if (a.error) return toast(a.error.message, 'err'); }
      if (fin && fin !== String(it.fecha_fin || '').slice(0, 10)) { var b = await db().rpc('fecha_desarrollo', { did: it.id, campo: 'fecha_fin', fecha: fin }); if (b.error) return toast(b.error.message, 'err'); }
      var ap = document.getElementById('fe-apr'); if (ap && ap.value && ap.value !== String(it.fecha_aprob || '').slice(0, 10)) { var c = await db().rpc('fecha_aprobado_desarrollo', { did: it.id, fecha: ap.value }); if (c.error) return toast(c.error.message, 'err'); }
      closeM('m-fechas'); toast('Fechas guardadas', 'ok'); await cargarFicha(P.f.id); pintar(el);
    };
    openM('m-fechas');
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
  // Desarrollos y, en su propia sección, el mantenimiento (mmr)
  function tabDesarrollos(p, mmr) {
    var ord = { curso: 0, garantia: 1, aprobada: 2, nueva: 3, finalizada: 4, rechazada: 5 };
    var k = function (it) { return it.detenido ? 3.5 : (ord[_canonSol(it.estado)] === undefined ? 3 : ord[_canonSol(it.estado)]); };
    var lista = (p.items || []).filter(function (it) { return !!esMant(it) === !!mmr; }).sort(function (a, b) { return k(a) - k(b); });
    // Mejora o soporte: una sola acción del PROYECTO; el modal pregunta cuál y de qué desarrollo depende
    var bases = basesAlta(p);
    var hayMmr = (p.items || []).some(function (it) { return esMant(it) && ['finalizada', 'rechazada'].indexOf(_canonSol(it.estado)) < 0; });
    var alta = !bases.length || (mmr && hayMmr) ? '' : '<div class="ui-barra ui-der u-mt10">' + (mmr ? uiBtn('Abono mensual', 'mas', 's', 'data-pm="alta-abono" data-id="' + esc(p.id) + '"')   // un único MMR (18/11/2026)
      : uiBtn('Desarrollo', 'mas', 's', 'data-pm="alta-des" data-id="' + esc(p.id) + '"')) + '</div>';
    if (!lista.length) return alta + '<div class="ui-nota-t">' + (mmr ? 'Sin mantenimiento mensual.' : 'Sin desarrollos.') + '</div>';
    // «+ Desarrollo» abajo de todos los desarrollos (16/11/2026)
    return lista.map(function (it) {
      var rec = esMant(it), det = !!it.detenido || !!p.detenido, can = _canonSol(it.estado);
      var cuota = Number(it.cuota_act) || Number(it.valor_cuota) || 0;
      var sub = [it.tipo_nombre || it.tipo, it.modelo_nombre || it.modelo].filter(Boolean).join(' · ');
      if (rec) { var cubre = (it.mant_de_ids || []).map(function (x) { var d = (p.items || []).find(function (y) { return y.id === x; }); return d ? (d.titulo || d.id) : ''; }).filter(Boolean); if (cubre.length) sub += ' · cubre ' + cubre.join(', '); }
      var abierto = P.fAb[it.id] !== undefined ? P.fAb[it.id] : (lista.length === 1 || can === 'curso' || can === 'garantia');
      // Pausar se decide en el botón general del proyecto; acá sólo se reanuda lo que ya está pausado (06/11/2026)
      var iconos = (it.detenido && !p.detenido && can !== 'rechazada' && can !== 'finalizada' ? uiIb('e_play', 'Reanudar este desarrollo', '', 'data-pm="det-des" data-id="' + esc(it.id) + '"') : '') +
        (puedeRenovar(it) ? uiBtn('Renovar', 'repetir', 's', 'data-pm="ren-mant" data-id="' + esc(it.id) + '"') : '') +
        (det ? '' : botonesDes(it, false));
      var plata = '', tot = Number(it.total_ars) || 0, cob = Number(it.facturado) || 0;
      if (rec) { if (cuota) plata = '<span>Abono <span class="ui-num ui-p-abono">' + fmt(cuota) + '/mes</span></span>' + cuotasTxt(it); }
      else if (esGanado(it.estado) && tot > 0) plata = '<span>Contratado <span class="ui-num ui-p-contratado">' + fmt(tot) + '</span></span><span>Cobrado <span class="ui-num ui-p-cobrado">' + fmt(cob) + '</span> (<span class="ui-num">' + Math.round(cob / tot * 100) + ' %</span>)</span>';
      else if (tot > 0) plata = '<span>Cotizado <span class="ui-num ui-p-neutro">' + fmt(tot) + '</span></span>';
      var h = '<div class="ui-dev' + (abierto ? ' open' : '') + '" data-des="' + esc(it.id) + '">' +
        '<span class="ui-dev-barra ui-e-' + uiClaveEst(it.estado) + '"></span><span class="ui-ch">' + uiIco('derecha') + '</span>' + uiTipo(it, it.estado, det) +
        '<div><div class="ui-dev-n">' + esc(it.titulo || it.descripcion || '—') + '</div></div>' +   // sólo el nombre (17/11/2026)
        '<div class="ui-dev-der"><span>' + uiEstado(it.estado || '—') + (det ? uiMarcaDet(p.detenido ? 'Detenido por el proyecto' : 'Pausado') : '') + '</span>' +
        '</div></div><div class="ui-devc">';   // las acciones van debajo del cronograma, con su nombre (18/11/2026)
      // Contratado, cobrado y pendiente van sólo en el lateral: acá no se repiten (29/10/2026)
      var l1 = [];
      if (rec) {
        // abono y cuotas ya están en la fila (plata): no se repiten acá (02/11/2026)
      } else if (it.cuotas > 1) l1.push('<span class="ui-num">' + it.cuotas + '</span> cuotas');
      if (it.horas) l1.push('Vendidas <span class="ui-num">' + it.horas + ' h</span>');
      // Duración en semanas (16/11/2026): si falta (proyectos migrados), un ícono para cargarla
      if (!rec) l1.push(Number(it.semanas) > 0 ? 'Duración <span class="ui-num">' + Number(it.semanas) + '</span> semanas'
        : 'Duración — ' + uiIb('calendario', 'Cargar la duración en semanas', '', 'data-pm="sem-des" data-id="' + esc(it.id) + '"'));
      if (it.socios) l1.push(esc(crmLista(it.socios).map(nombre).join(', ')));
      if (it.garantia_dias && !rec) l1.push('<span class="ui-num">' + it.garantia_dias + '</span> días de garantía');   // el mantenimiento (MRR) no tiene garantía (16/11/2026)
      // Información del desarrollo (17/11/2026): como Datos del proyecto, arriba qué es y debajo el valor.
      // Sin pagos ni repetidos: las fechas están en el riel; lo económico en texto, con cuotas y ajuste.
      var dd = function (l, v) { return '<div class="fg"><span class="fl">' + l + '</span><div>' + v + '</div></div>'; };
      var cs0 = (P.f.cobros || []).filter(function (c) { return c.desarrollo_id === it.id && c.deposito_fecha; }), cobrado0 = cs0.reduce(function (a, c) { return a + (Number(c.monto_ars) || 0); }, 0);
      var tot0 = Number(it.total_ars) || 0, gan0 = esGanado(it.estado), cot0 = (P.f.cotizado || {})[it.id] || 0, nc0 = Number(rec ? it.duracion : it.cuotas) || 0, vc0 = Number(it.cuota_act) || Number(it.valor_cuota) || (nc0 && !rec ? Math.round(tot0 / nc0) : 0);
      var num0 = function (v, c) { return v ? '<span class="ui-num ui-p-' + (c || 'neutro') + '">' + fmt(v) + '</span>' : '—'; };   // los mismos colores que los recuadros de arriba
      var desc = it.descripcion && it.descripcion !== it.titulo ? esc(it.descripcion) : '<span class="ui-nota-t">Sin descripción: se carga en el Alcance de la cotización.</span>';
      var inf = '<div class="ui-g3">' +
        dd('Forma de pago', esc(it.modelo_nombre || it.modelo || '—')) +
        dd(rec ? 'Abono' : 'Cuotas', nc0 ? '<span class="ui-num">' + nc0 + '</span> × ' + num0(vc0, rec ? 'abono' : gan0 ? 'contratado' : 'neutro') + (rec ? ' por mes' : '') : '—') +
        dd('Ajuste por IPC', (/sin/i.test(it.inflacion || '') || !it.inflacion ? 'No' : 'Sí') + (!gan0 && can !== 'rechazada' ? ' ' + uiIb('editar', 'Cambiar el ajuste por IPC', '', 'data-pm="ajuste-des" data-id="' + esc(it.id) + '" data-si="' + (/sin/i.test(it.inflacion || '') || !it.inflacion ? '1' : '0') + '"') : '')) +
        (rec ? '' : dd('Cotizado', num0(cot0))) + dd(gan0 ? 'Contratado' : 'Cotizado hoy', num0(tot0, !gan0 ? 'neutro' : rec ? 'abono' : 'contratado')) +
        dd('Cobrado', num0(cobrado0, 'cobrado')) + dd('Pendiente', gan0 ? num0(Math.max(0, tot0 - cobrado0), 'pendiente') : '—') +
        (rec || !gan0 ? '' : dd('Termina de cobrarse', tot0 - cobrado0 <= 0 ? '<span class="ui-p-cobrado">Cobrado</span>' : (function (f) { return 'en <span class="ui-num">' + f + '</span> cuota' + (f === 1 ? '' : 's'); })(Math.max(0, (Number(it.cuotas) || 1) - cs0.length)))) +
        (rec ? '' : dd('Horas vendidas', it.horas ? '<span class="ui-num">' + it.horas + ' h</span>' : '—')) +
        (rec ? '' : dd('Duración', Number(it.semanas) > 0 ? '<span class="ui-num">' + Number(it.semanas) + '</span> semanas' : '— ' + uiIb('calendario', 'Cargar la duración en semanas', '', 'data-pm="sem-des" data-id="' + esc(it.id) + '"'))) +
        (rec ? '' : dd('Garantía', it.garantia_dias ? '<span class="ui-num">' + it.garantia_dias + '</span> días' : '—')) +
        (it.socios ? dd('Responsables', esc(crmLista(it.socios).map(nombre).join(', '))) : '') + '</div>';
      var corre = function (a, d, txt, tit) { return uiBtn(txt, 'mas', 's', 'data-pm="' + a + '" data-id="' + esc(it.id) + '" data-d="' + d + '" title="' + tit + '"'); };
      var mueve = '';
      if (rec) { if (!it.fecha_est && !mantArranca(p, it)) inf += '<div class="ui-linea-sub"><span class="ui-p-pendiente">No se sabe cuándo arranca: falta vincularlo a un desarrollo o cargarle la fecha de fin</span></div>'; }
      else if (can === 'garantia') mueve = corre('post-fin', 7, '1 sem.', 'Corre la garantía y el arranque del mantenimiento una semana') + corre('post-fin', 30, '1 mes', 'Corre la garantía y el arranque del mantenimiento un mes');
      else if (!(desCerrado(it) || can === 'rechazada')) mueve = '<span>Cambiar inicio</span>' + uiIb('calendario', 'Cambiar el inicio', '', 'data-pm="ini-des" data-id="' + esc(it.id) + '"') +
          (depende(it) ? corre('post-ini', 7, '1 sem.', 'Corre el inicio una semana') + corre('post-ini', 30, '1 mes', 'Corre el inicio un mes') : '');
      // Sin recuadro ni pestañas (24/11/2026): los datos a la vista y Descripción, Módulos y Cronograma plegados, como las secciones del proyecto
      var mh = (P.f.horas || []).filter(function (r) { return r.desarrollo_id === it.id; }).reduce(function (a, r) { return a + (Number(r.horas_est) || 0); }, 0), btn = econDes(it).btn;
      P.dsec = P.dsec || {};
      var ds = function (k, t, cuerpo, n, v) { return uiDesp({ t: t, open: !!P.dsec[it.id + k], n: n, v: v, attrs: 'data-dsec="' + esc(it.id + k) + '"' }, cuerpo); };
      h += inf + ds('desc', 'Descripción', desc) + (rec && !mh ? '' : ds('mods', 'Módulos', modulosDe(it.id), mh ? Math.round(mh) + ' h' : '')) +
        ds('crono', 'Cronograma', '<div class="dev-riel">' + fechasHTML(p, it.id) + '</div>' + (mueve ? '<div class="ui-linea-sub">' + mueve + '</div>' : ''), '',
          uiIb('editar', 'Editar las fechas', '', 'data-pm="fechas-des" data-id="' + esc(it.id) + '"')) +
        (btn || iconos ? '<div class="ui-acc-der dev-acc">' + btn + iconos + '</div>' : '');
      return h + '</div>';
    }).join('') + alta;
  }
  // Tareas y comentarios con la forma de HOY (js/tareas.js)
  function tabTareas(p) {
    var F = P.f, pid = esc(p.id);
    // Título arriba, en la misma línea que «+ Nueva tarea», y en ámbar (pendientes) para identificarlas (16/11/2026)
    var h = '<div class="ui-tabs pm-tar-hd"><span class="ui-tab on">Tareas</span><span class="u-f1"></span>' + uiBtn('Nueva tarea', 'mas', 's', 'data-pm="nueva-tarea" data-id="' + pid + '"') + '</div>';
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
  // Novedades del proyecto: lo último de Mockups y propuestas (14 días), como en Hoy
  function novedadesProy() {
    var d = isoMas(-14), L = (P.f.entregables || []).filter(function (e) { return String(e.creado || '').slice(0, 10) >= d; });
    return '<br><div class="ui-lat-h">Novedades</div>' + (L.length ? L.map(function (e) {
      var u = String(((e.accesos || [])[0] || {}).url || ''), web = /^https?:\/\//i.test(u);
      return '<div class="ui-linea"><span class="ui-f1">' + (web ? '<a class="ui-lnk ui-azul" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(e.titulo || '') + '</a>' : esc(e.titulo || '')) + ' <span class="ui-nota-t">· ' + esc(e.tipo || '') + '</span></span><span class="ui-num ui-nota-t">' + esc(ff(e.creado)) + '</span></div>'; }).join('')
      : '<div class="ui-nota-t">Sin novedades.</div>');
  }
  // Documentos y Drive (02/11/2026): la carpeta que ya existe (la del proyecto o, si no, la de la empresa)
  // y los comprobantes con su archivo. No crea carpetas ni copia archivos.
  // Tickets de soporte del proyecto (17/11/2026): sólo lectura; se gestionan en Soporte
  function tabTickets(p) {
    setTimeout(async function () {
      var c = document.getElementById('pm-tk'); if (!c) return;
      var r = await db().from('soporte_tickets').select('id,titulo,estado,prioridad,creado,responsable').eq('proyecto_id', p.id).order('creado', { ascending: false });
      if (r.error) { c.innerHTML = '<div class="ui-nota-t">' + esc(r.error.message) + '</div>'; return; }
      c.innerHTML = r.data.length ? r.data.map(function (t) {
        return '<div class="ui-linea"><span class="ui-num ui-nota-t">' + esc(t.id) + '</span><span class="ui-f1">' + esc(t.titulo || '—') + '</span>' +
          '<span class="ui-nota-t">' + esc(t.prioridad || '') + '</span><span>' + uiEstado(t.estado || '—') + '</span><span class="ui-num ui-nota-t">' + esc(ff(t.creado)) + '</span></div>'; }).join('')
        : '<div class="ui-nota-t">Este proyecto no tiene tickets de soporte.</div>';
    }, 0);
    return '<div id="pm-tk"><div class="loading"><div class="spin"></div></div></div>';
  }
  function tabDocs(p, plano) {
    var drv = p.carpeta || '', emp = (P.emps[p.empresa] || {}).drive_interno || '';
    var lnk = function (u, t) { return '<a class="ui-lnk ui-azul" href="' + esc(u) + '" target="_blank" rel="noopener">' + uiIco('carpeta') + t + '</a>'; };
    var h = '<div class="ui-barra">' + (drv ? lnk(drv, 'Carpeta del proyecto') : '') + (emp && emp !== drv ? lnk(emp, 'Drive de ' + esc(p.empresa || 'la empresa')) : '') + '</div>';
    if (!drv && !emp) h = uiAviso('Este proyecto no tiene carpeta de Drive cargada, ni su empresa.', 'adv');
    // Mockups y propuestas: tabla entregables, accesos = [{ tipo, nombre, url }]. Se abren en otra pestaña.
    // Mismo formato que Contactos (16/11/2026): desplegable con título, cantidad y «+ Mockup o propuesta»
    var ents = P.f.entregables || [];
    // Documentos, Drive, mockups y propuestas en un solo desplegable (17/11/2026)
    var arma = plano ? function (o, c) { return '<div class="ui-barra ui-der">' + o.v + '</div>' + c; } : uiDesp;
    return arma({ t: 'Documentos, Drive y propuestas', n: ents.length, v: uiBtn('Mockup o propuesta', 'mas', 's', 'data-pm="ent-nuevo" data-id="' + esc(p.id) + '"') }, h + (ents.length ? ents.map(function (e) {
      var ac = (e.accesos || [])[0] || {}, u = String(ac.url || ''), web = /^https?:\/\//i.test(u);
      return '<div class="ui-linea"><span class="ui-f1">' + esc(e.titulo || ac.nombre || 'Sin título') + ' <span class="ui-nota-t">· ' + esc(e.tipo || '') + '</span></span>' +
        (web ? '<a class="ui-ib" href="' + esc(u) + '" target="_blank" rel="noopener" data-tip="Abrir" aria-label="Abrir ' + esc(e.titulo || '') + '">' + uiIco('abrir') + '</a>' : '<span class="ui-nota-t">' + esc(u) + '</span>') + '</div>'; }).join('')
      : '<div class="ui-nota-t">Sin mockups ni propuestas.</div>'));
  }
  // Análisis del cliente (getAnalisisCliente): lo que guardó el Cotizador, no se recalcula
  function tabAnalisis() {
    var a0 = P.f.analisis;
    if (!a0) return '<div class="ui-nota-t">Todavía no hay análisis guardado para este cliente.</div>';
    // Sólo lo aprobado: lo que sigue en Nuevo o no se aceptó no entra, ni en la tabla ni en los totales (06/11/2026)
    var devsA = (a0.devs || []).filter(function (d) { return esGanado(d.estado); });
    if (!devsA.length) return '<div class="ui-nota-t">Este cliente todavía no tiene desarrollos aprobados.</div>';
    var suma = function (k) { return devsA.reduce(function (a, d) { return a + (Number(d[k]) || 0); }, 0); }, dif0 = suma('precio') - suma('referencia'), mmr0 = suma('mmr');
    var c = { devs: devsA, dif: dif0, mmr: mmr0, a12: dif0 + 12 * mmr0, a24: dif0 + 24 * mmr0, meses: dif0 < 0 && mmr0 > 0 ? Math.ceil(-dif0 / mmr0) : 0 };
    var pct = function (v) { return v === null || v === undefined || v === '' ? '' : (v >= 0 ? '+' : '') + Math.round(v) + ' %'; };
    return uiMotivo('Referencia = horas estimadas × valor hora de venta GIWA de la fecha de venta × Tier. El abono compensa lo que faltó.') +
      '<table class="ui-tbl"><thead><tr><th>Desarrollo</th><th class="ui-r">Fecha de venta</th><th class="ui-r">Horas</th><th class="ui-r">VH ref.</th><th class="ui-r">Referencia</th>' +
      '<th class="ui-r">Cobrado</th><th>Margen neto proyectado</th><th class="ui-r">Abono</th></tr></thead><tbody>' +
      (c.devs || []).map(function (d) {
        return '<tr><td>' + esc(d.titulo) + '</td><td class="ui-num ui-r">' + (ff(d.fecha_venta) || '—') + '</td>' +
          '<td class="ui-r">' + Math.round(d.horas) + '</td><td class="ui-r">' + fmt(d.vh_referencia) + '</td><td class="ui-r">' + fmt(d.referencia) + '</td>' +
          '<td class="ui-r ui-p-cobrado">' + fmt(d.precio) + '</td><td>' + esc(d.veredicto) + ' <span class="ui-num">' + pct(d.desvio_pct) + '</span></td>' +
          '<td class="ui-r ui-p-abono">' + (d.mmr ? fmt(d.mmr) + '/mes' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      uiMotivo('Cobrado − referencia ' + fmt(c.dif) + ' · abono ' + fmt(c.mmr) + '/mes · con 12 meses de abono ' + fmt(c.a12) +
        ' · con 24 ' + fmt(c.a24) + (c.dif < 0 ? (c.mmr ? ' · lo que faltó son ' + c.meses + ' mes(es) de abono' : ' · sin abono que lo compense') : ' · cobrado igual o arriba de la referencia'));
  }
  // Tab Económico del proyecto: la plata, en recuadros C8 (06/11/2026)
  function lateral(p) {
    var usd = function (ars) { return ars && _tc() > 0 ? fmt(ars / _tc(), 'USD') : ''; };
    var tot = mTotal(p), cob = mCobradoDev(p), sal = mSaldo(p);
    var nDev = (p.items || []).filter(function (x) { return !esMant(x) && esGanado(x.estado); }).length, nDevT = (p.items || []).filter(function (x) { return !esMant(x); }).length;
    var h = '<div id="pm-lat"><div class="ui-lat-h">Desarrollos · ' + nDev + (nDevT > nDev ? ' de ' + nDevT : '') + ' contratado' + (nDev === 1 ? '' : 's') + '</div><div class="ui-lat-g ui-lat-g3">' +
      uiKpi('Contratado', fmt(tot), 'p-contratado', '', usd(tot)) + uiKpi('Cobrado', fmt(cob), 'p-cobrado', '', usd(cob)) + uiKpi('Pendiente', fmt(sal), 'p-pendiente', '', usd(sal)) + '</div>';
    var rec = mRecurrente(p), sm = mSaldoMant(p);
    if (rec > 0 || sm > 0) {
      var fm = mFinMant(p);
      h += '<div class="ui-lat-h">Mantenimiento y soporte</div><div class="ui-lat-g ui-lat-g3">' +
        uiKpi('Abono mensual', fmt(rec), 'p-abono', (p.mant_vivos || 0) + ' en curso', usd(rec)) +
        uiKpi('Ya cobrado', fmt(mCobradoMant(p)), 'p-cobrado', fm.cobradas + ' de ' + fm.totales + ' cuotas cobradas', usd(mCobradoMant(p))) +
        uiKpi('Por cobrar', fmt(sm), 'p-pendiente', '', usd(sm)) + '</div><div class="ui-nota-t">No suma al contratado: se factura por cuota.</div><br>';
    }
    var hs = sum(p.items, 'horas');
    if (false && hs) h += '<div class="ui-lat-h">Del contrato</div><div class="ui-lat-g">' + uiKpi('Horas vendidas', Math.round(hs) + ' h', 'p-neutro') + '</div>';
    return h + '</div>';   // sin la comparación con otros proyectos ni el análisis del cliente (17/11/2026)
  }
  function econDes(it) {
    var usd = function (ars) { return ars && _tc() > 0 ? fmt(ars / _tc(), 'USD') : ''; };
    var cot = (P.f.cotizado || {})[it.id], ganado = esGanado(it.estado), tot = Number(it.total_ars) || 0, can = _canonSol(it.estado);
    var cs = (P.f.cobros || []).filter(function (c) { return c.desarrollo_id === it.id; });
    // Dos desplegables (16/11/2026): Económico (montos y recuadros) y Pagos (las cuotas y su estado)
    // «Editar» sólo antes de aprobarse: arriba, en el encabezado de Económico (16/11/2026)
    return { btn: (!ganado || (esMant(it) && can !== 'finalizada')) && can !== 'rechazada' ? uiBtn('Editar', 'editar', 's', 'data-pm="ed-monto" data-id="' + esc(it.id) + '"') : '',
      eco: lateralDes(it, usd), pagos:
      (cs.length ? '<table class="ui-tbl"><thead><tr><th class="ui-r">Cuota</th><th>Comprobante</th><th class="ui-r">Fecha</th><th class="ui-r">Monto</th><th>Estado</th></tr></thead><tbody>' + cs.map(function (c) {
        return '<tr><td class="ui-r">' + esc(c.cuota_nro || '—') + '</td><td>' + esc([c.tipo_comprobante, c.comprobante_nro].filter(Boolean).join(' ') || '—') + '</td><td class="ui-num ui-r">' + (ff(c.comprobante_fecha) || '—') + '</td><td class="ui-r">' + fmt(c.monto_ars) + '</td>' +
          '<td>' + (c.deposito_fecha ? '<span class="ui-p-cobrado">Cobrado <span class="ui-num">' + ff(c.deposito_fecha) + '</span></span>' : '<span class="ui-p-pendiente">Sin cobrar</span>') + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="ui-nota-t">Todavía no hay cuotas facturadas.</div>') };
  }
  function lateralDes(it, usd) {
    var cs = (P.f.cobros || []).filter(function (c) { return c.desarrollo_id === it.id; });
    var cob = cs.filter(function (c) { return c.deposito_fecha; }).reduce(function (a, c) { return a + (Number(c.monto_ars) || 0); }, 0);
    var h = '<div class="ui-lat-g ui-lat-fila">';   // sin repetir el nombre del desarrollo: va dentro de «Económico"   // todos en una línea (16/11/2026)
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
    return h + '</div>';
  }
  function htmlFicha() {
    var p = P.proys.find(function (x) { return x.id === P.f.id; }); if (!p) return '<div class="ui-nota-t">Proyecto no encontrado.</div>';
    var lista = P.fLista, i = lista.indexOf(p.id);
    var h = '<div class="ui-barra">' + uiBtn('Volver', 'izquierda', 's', 'data-pm="volver"') +
      (lista.length > 1 ? uiIb('izquierda', 'Proyecto anterior', '', 'data-pm="nav" data-dir="-1"') + '<span class="ui-num ui-nota-t">' + (i + 1) + '/' + lista.length + '</span>' + uiIb('derecha', 'Proyecto siguiente', '', 'data-pm="nav" data-dir="1"') : '') + '</div>';
    return h + fichaCuerpo(p);
  }
  // C5 · la ficha: motivo en gris y, junto al estado, Detener y Finalizar; botones secundarios; pestañas; lateral de plata
  // C5 · la ficha: el motivo en el color del estado; arriba a la derecha las acciones del proyecto;
  // pestañas; lateral de plata. Las acciones de cada desarrollo van en su fila (02/11/2026)
  function fichaCuerpo(p, enLista) {
    // Ficha única (diseño aprobado 20/11/2026): encabezado con «Editar proyecto» y secciones plegables, con las mismas
    // piezas de antes (Datos, Presupuesto, Documentos, Contactos ★, Desarrollos, Tickets) y el historial. Tareas a la derecha.
    var e = p.estado_proyecto || 'Prospecto', can = _canonProy(e), F = P.f, d = F.pd || {}, min = {};
    try { min = d.minuta ? JSON.parse(d.minuta) : {}; } catch (x) { min = {}; }
    P.fsec = P.fsec || { proy: true };
    var sec = function (k, t, cuerpo, n, v) { return uiDesp({ t: t, open: !!P.fsec[k], n: n, v: v, attrs: 'data-fsec="' + k + '"' }, cuerpo); };
    var dato = function (l, v) { return '<div class="fg"><span class="fl">' + l + '</span><div>' + v + '</div></div>'; };
    var av = avisoAbono(p), pq = porQue(p, can) || deDondeSale(p);
    var editar = ['finalizado', 'rechazado'].indexOf(can) < 0 ? uiBtn('Editar proyecto', 'editar', 'p', 'data-pm="editar-proy"') : '';
    var cab = '<div class="ui-ficha-hd">' + (enLista ? '' : uiLogo(p.empresa, (P.emps[p.empresa] || {}).logo) + '<div><div class="ui-pro">' + esc(p.nombre) + '</div><div class="ui-emp">' + esc(p.empresa) + '</div></div>' +
        '<span>' + uiEstado(e, { detenido: p.detenido }) + '</span>') + '<span class="u-f1">' + (av || '') + '</span>' + editar + '</div>' +
      (enLista ? '' : '<div class="ui-motivo ui-fuerte"><span class="ui-e-' + uiClaveEst(e, p.detenido) + '">' + esc(pq) + '</span></div>');
    // CONTACTOS: sponsors · contactos del cliente (la ★ los marca) · responsables
    var nomC = function (c) { return ((c.nombre || '') + ' ' + (c.apellido || '')).trim() || '—'; };
    var linC = function (c) { var t = telWa(c.telefono); return (t ? '<a class="ui-ib ui-wa" href="https://wa.me/' + t + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
      (c.email ? '<a class="ui-ib" href="mailto:' + esc(c.email) + '" data-tip="' + esc(c.email) + '" aria-label="Correo">' + uiIco('mail') + '</a>' : ''); };
    var sps = crmLista(d.sponsors).length ? crmLista(d.sponsors) : (d.sponsor_id ? [d.sponsor_id] : []);
    var enProy = crmLista(p.contactos), mio = function (c) { return enProy.indexOf(String(c.id)) >= 0; };
    var rsp = (min.responsables && min.responsables.length ? min.responsables : [p.owner]).filter(Boolean);
    var contactos = '<div class="ui-cols3">' +
      '<div><div class="ui-li-sub">SPONSORS</div>' + (sps.length ? sps.map(function (id) { var c = F.cons.filter(function (x) { return x.id === id; })[0] || { nombre: id };
          return '<div class="ui-li"><span class="ui-f1">' + esc(nomC(c)) + (c.puesto ? '<div class="ui-li-sub">' + esc(c.puesto) + '</div>' : '') + '</span>' + linC(c) + '</div>'; }).join('') : '<div class="ui-nota-t">—</div>') + '</div>' +
      '<div><div class="ui-li-sub">CONTACTOS DEL CLIENTE</div>' + (F.cons.length ? F.cons.slice().sort(function (a, b) { return (mio(b) ? 1 : 0) - (mio(a) ? 1 : 0); }).map(function (c) {
          var tip = mio(c) ? 'Sacar del proyecto' : 'Marcar como contacto de este proyecto';
          return '<div class="ui-li"><button type="button" class="ui-ib' + (mio(c) ? ' on' : '') + '" data-pm="estrella" data-id="' + esc(c.id) + '" data-tip="' + tip + '" aria-label="' + tip + '">' + (mio(c) ? '★' : '☆') + '</button>' +
            '<span class="ui-f1">' + esc(nomC(c)) + (c.puesto || c.area_trabajo ? '<div class="ui-li-sub">' + esc(c.puesto || c.area_trabajo) + '</div>' : '') + '</span>' + linC(c) + '</div>'; }).join('') : '<div class="ui-nota-t">Sin contactos cargados.</div>') +
        (can === 'rechazado' ? '' : '<button type="button" class="ui-lnk ui-azul u-mt6" data-pm="contacto">+ Contacto nuevo</button>') + '</div>' +
      '<div><div class="ui-li-sub">RESPONSABLES</div>' + rsp.map(function (m) { return '<div class="ui-li"><span class="ui-f1">' + esc(nombre(m)) + '</span></div>'; }).join('') + '</div></div>';
    var acc = accionesEstado(p, false);
    var cuerpoSecs =
      sec('proy', 'Proyecto',
        '<div class="ui-g3">' + dato('Creado', d.creado ? '<span class="ui-num">' + ff(String(d.creado).slice(0, 10)) + '</span>' : '—') + dato('Creado por', '—') +
          dato('Aprobado el', d.fecha_aprobacion ? '<span class="ui-num">' + ff(d.fecha_aprobacion) + '</span>' : '—') +
          dato('Fecha probable de aprobación', F.cierreProb ? '<span class="ui-num">' + ff(F.cierreProb) + '</span>' : '— ' + uiIb('calendario', 'Cargar la fecha', '', 'data-pm="cierre-prob" data-id="' + esc(p.id) + '"')) +
          dato('Probabilidad de aprobación', '<span class="ui-num">' + (p.probabilidad || 0) + ' %</span>') + '<div></div></div>' +
        lateral(p)) +
      sec('res', 'Resumen ejecutivo', '<div class="u-mb10">' + esc(p.descripcion || '—') + '</div>' + tabDocs(p, true), String((F.entregables || []).length)) +
      sec('con', 'Contactos', contactos, String(sps.length + enProy.length + rsp.length)) +
      sec('est', 'Estado y cronograma', rielCiclo(p, Object.assign({ fecha_cierre_probable: F.cierreProb }, d), F.hist, false) + (acc ? '<div class="ui-acc-der">' + acc + '</div>' : ''), '', uiEstado(e, { detenido: p.detenido })) +
      sec('devs', 'Desarrollos', tabDesarrollos(p), String((p.items || []).filter(function (it) { return !esMant(it); }).length)) +
      sec('mmr', 'Mantenimiento mensual · MMR', tabDesarrollos(p, true), '', mRecurrente(p) > 0 ? '<span class="ui-num ui-p-abono">' + fmt(mRecurrente(p)) + '/mes</span>' : '') +
      sec('tick', 'Tickets', tabTickets(p)) +
      sec('hist', 'Historial', histHTML(F.hist), String((F.hist || []).length));
    var cuerpo = cab + '<div class="ui-cols ui-cols-ficha"><div class="ficha-secs">' + cuerpoSecs + '</div><div>' + tabTareas(p) + novedadesProy() + '</div></div>';
    return enLista ? cuerpo : '<div class="ui-ficha ui-ficha-sola">' + cuerpo + '</div>';
  }

  // Carga rápida desapareció (20/11/2026): Nuevo proyecto usa el mismo modal que Editar proyecto (abrirEditarProy sin proyecto).

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
  // ── El riel del ciclo de vida (20/11/2026): lleno = ocurrió · punteado = previsto. Lo usan la ficha y Editar proyecto ──
  // d: fechas del proyecto (creado, fecha_propuesta_enviada, fecha_aprobacion, fecha_cierre_probable, fecha_inicio, fecha_finalizado) · hist: historial · edit: con lápices
  function rielCiclo(p, d, hist, edit) {
    var can = _canonProy(p.estado_proyecto), devs = (p.items || []).filter(function (it) { return _canonSol(it.estado) !== 'rechazada' && !esMant(it); });
    var fIni = devs.map(function (it) { return it.fecha_est || it.fecha_ini; }).filter(Boolean).sort()[0], fFin = devs.map(function (it) { return it.fecha_fin; }).filter(Boolean).sort().reverse()[0];
    var ultimo = function (ev) { var x = (hist || []).filter(function (h) { return h.evento === ev; })[0]; return x && x.fecha; };
    var paso = function (cls, color, f, nom, est, ed) { return '<div class="ui-cr-p ' + cls + ' ui-e-' + color + '"><div class="ui-cr-f">' + (f ? ff(f).slice(0, 5) : '—') +
      (edit && ed ? uiIb('editar', 'Cambiar la fecha prevista', '', 'data-ep="' + ed + '"') : '') + '</div><div class="ui-cr-n">' + nom + '</div><div class="ui-cr-e">' + est + '</div></div>'; };
    var arrancado = !!d.fecha_inicio || can === 'activo' || can === 'finalizado';
    return '<div class="ui-cr-l"><span><i></i>Ocurrió</span><span><i class="d"></i>Previsto' + (edit ? ' · se puede cambiar' : '') + '</span></div><div class="ui-cr">' +
      paso('', 'prospecto', String(d.creado || '').slice(0, 10), 'Creado', 'Prospecto') +
      paso(d.fecha_propuesta_enviada ? '' : 'nada', 'negociacion', d.fecha_propuesta_enviada, 'Propuesta enviada', 'Negociación') +
      (d.fecha_aprobacion ? '' : paso('prev', 'aprobado', d.fecha_cierre_probable, 'Aprobación prevista', 'previsto', 'ed-cierre')) +
      paso(d.fecha_aprobacion ? '' : 'nada', 'aprobado', d.fecha_aprobacion, 'Aprobado', '') +
      (arrancado ? paso('', 'curso', d.fecha_inicio || fIni, 'Inicio', 'Activo') : paso('prev', 'curso', fIni, 'Inicio previsto', 'previsto', devs.length ? 'ed-fechas' : '')) +
      (can === 'finalizado' ? '' : paso('prev', 'garantia', fFin, 'Fin previsto', 'previsto', devs.length ? 'ed-fechas' : '')) +
      (p.detenido ? paso('', 'detenido', ultimo('Detenido'), 'Detenido', '') : '') +
      (can === 'rechazado' ? paso('', 'rechazado', ultimo('No aceptado'), 'No aceptado', '') : paso(d.fecha_finalizado ? '' : 'nada', 'finalizado', d.fecha_finalizado, 'Finalizado', '')) + '</div>';
  }
  function histHTML(hist) {
    return (hist || []).length ? hist.map(function (h) { return '<div class="ui-hi"><span class="ui-num' + (h.prevista ? ' ui-li-sub' : '') + '">' + ff(h.fecha) + '</span><span>' + esc(h.evento) + '</span>' +
      '<span class="ui-li-sub">' + esc(h.detalle || '') + '</span><span class="ui-li-sub">' + esc(h.quien ? nombre(h.quien) : '') + '</span></div>'; }).join('') : '<div class="ui-nota-t">Sin movimientos.</div>';
  }
  // Las acciones de estado del proyecto, con su nombre (las mismas reglas de siempre)
  function accionesEstado(p, prefijo) {
    var can = _canonProy(p.estado_proyecto), pid = esc(p.id), at = function (a) { return prefijo ? 'data-ep="acc" data-a="' + a + '"' : ''; };
    var ficha = function (a) { return a === 'arrancar' ? 'data-pm="arrancar" data-id="' + pid + '"' : (a === 'detener' || a === 'reanudar') ? 'data-pm="det-proy" data-id="' + pid + '"' : 'data-pm="estado" data-id="' + pid + '" data-est="' + a + '"'; };
    var b = function (a, txt, ic, cls) { return '<button type="button" class="ui-btn ui-s' + (cls ? ' ' + cls : '') + '" ' + (prefijo ? at(a) : ficha(a)) + '>' + uiIco(ic) + esc(txt) + '</button>'; };
    return (p.detenido || can === 'finalizado' || can === 'rechazado' ? '' : accionesProy(p).map(function (a) { return b(a[0], a[1], a[2]); }).join('')) +
      ((p.items || []).some(function (it) { return _canonSol(it.estado) === 'aprobada' && !it.detenido; }) && !p.detenido ? b('arrancar', 'Arrancar', 'e_play') : '') +
      (can === 'finalizado' || can === 'rechazado' ? '' : p.detenido ? b('reanudar', 'Reanudar', 'e_play') : b('detener', 'Detener', 'e_pausa', 'ui-btn-det'));
  }
  async function abrirEditarProy(p0) {
    // Nuevo y Editar proyecto, un solo modal (diseño aprobado 20/11/2026). Secciones plegables:
    // PROYECTO (con fecha probable, probabilidad e importes) · RESUMEN EJECUTIVO · CONTACTOS · ESTADO Y CRONOGRAMA · DESARROLLOS · MMR · HISTORIAL
    var $e = function (id) { return document.getElementById(id); };
    var alta = !p0, p = p0 || { id: '', items: [], empresa: '', empresa_id: '', nombre: '', owner: yo(), probabilidad: 50, estado_proyecto: 'Prospecto' };
    var LOC = { devs: [], mmr: null, docs: [] };   // en el alta, lo que se carga antes de crear el proyecto
    var r = await Promise.all([
      alta ? Promise.resolve({ data: {} }) : db().from('proyectos').select('creado,fecha_aprobacion,fecha_cierre_probable,fecha_propuesta_enviada,fecha_inicio,fecha_finalizado,minuta,resumen_ejecutivo,contactos,sponsors,sponsor_id').eq('id', p.id).maybeSingle(),
      db().from('empresas').select('id,nombre,tier_id').order('nombre'),
      db().from('contactos').select('id,nombre,apellido,puesto,area_trabajo,email,telefono').eq('empresa_id', p.empresa_id || '-').order('nombre'),
      alta ? Promise.resolve({ data: [] }) : db().from('desarrollos').select('id,mantenimiento_horas').eq('proyecto_id', p.id),
      alta ? Promise.resolve({ data: [] }) : db().from('historial_proyecto').select('evento,fecha,prevista,detalle,quien').eq('proyecto_id', p.id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(60),
      alta ? Promise.resolve({ data: [] }) : db().from('entregables').select('titulo,tipo,accesos,creado').eq('proyecto_id', p.id).order('creado', { ascending: false })
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) return toast(err.error.message, 'err');
    var d = r[0].data || {}, emps = r[1].data || [], cons = r[2].data || [], min = {}, mhs = {}, hist = r[4].data || [], docs = r[5].data || [];
    (r[3].data || []).forEach(function (x) { mhs[x.id] = Number(x.mantenimiento_horas) || 0; });
    try { min = d.minuta ? JSON.parse(d.minuta) : {}; } catch (e) { min = {}; }
    // Sponsors en su propio campo (opción A, 20/11/2026); «contactos» = Contactos del cliente, la ★ de la ficha
    var sps0 = crmLista(d.sponsors).length ? crmLista(d.sponsors) : (d.sponsor_id ? [d.sponsor_id] : []), con0 = crmLista(d.contactos);
    var rsp0 = (min.responsables && min.responsables.length ? min.responsables : [p.owner]).filter(Boolean).map(function (m) { return String(m).trim().toLowerCase(); });
    var E = { sps: sps0.slice(), con: con0.slice(), rsp: rsp0.slice() };
    var nomC = function (c) { return ((c.nombre || '') + ' ' + (c.apellido || '')).trim(); };
    var dato = function (cls, l, v) { return '<div class="fg ' + cls + '"><span class="fl">' + l + '</span><div>' + v + '</div></div>'; };
    var tier = function () { var e = emps.filter(function (x) { return x.id === p.empresa_id; })[0]; return e && e.tier_id ? '<div class="u-mt4">' + uiTier(e.tier_id) + '</div>' : ''; };
    var fijo = ['aprobado', 'activo'].indexOf(_canonProy(p.estado_proyecto)) >= 0;   // Aprobado o activo: la probabilidad queda fija (29/10/2026)
    var filaC = function (id, k, q) { var c = cons.filter(function (x) { return x.id === id; })[0] || { nombre: id }, t = telWa(c.telefono);
      return '<div class="ui-li"><span class="ui-f1">' + esc(nomC(c)) + ((c.puesto || c.area_trabajo) ? '<div class="ui-li-sub">' + esc(c.puesto || c.area_trabajo) + '</div>' : '') + '</span>' +
        (t ? '<a class="ui-ib ui-wa" href="https://wa.me/' + t + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
        (c.email ? '<a class="ui-ib" href="mailto:' + esc(c.email) + '" data-tip="Correo" aria-label="Correo">' + uiIco('mail') + '</a>' : '') +
        uiIb('cerrar', 'Quitar', '', 'data-ep="' + q + '" data-i="' + k + '"') + '</div>'; };
    var lista = function () {
      $e('ep-sps').innerHTML = E.sps.map(function (id, k) { return filaC(id, k, 'sp-quitar'); }).join('');
      $e('ep-con').innerHTML = E.con.map(function (id, k) { return filaC(id, k, 'co-quitar'); }).join('');
      $e('ep-rsp').innerHTML = E.rsp.map(function (m, k) {
        return '<div class="ui-li"><span class="ui-f1">' + esc(nombre(m)) + '</span>' + uiIb('cerrar', 'Quitar', '', 'data-ep="ow-quitar" data-i="' + k + '"') + '</div>'; }).join('');
      var nc = document.querySelector('#m-eproy [data-sec="con"] .ui-d-n'); if (nc) nc.textContent = String(E.sps.length + E.con.length + E.rsp.length);   // el número del encabezado
    };
    var sec = function (t, open, cuerpo, n, v, k) { return uiDesp({ t: t, open: open, n: n, v: v, attrs: 'data-sec="' + k + '"' }, cuerpo); };
    var m = armarModal('m-eproy', alta ? 'Nuevo proyecto' : 'Editar proyecto · ' + (p.empresa || '') + ' · ' + (p.nombre || ''),
      sec('Proyecto', true,
        '<div class="ui-g3">' +
          (alta ? '<div class="fg"><label class="fl" for="ep-emp">Empresa <span class="req">*</span></label><select class="fc" id="ep-emp"><option value="">Elegí la empresa</option>' +
                    emps.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>'; }).join('') + '</select><div id="ep-tier"></div></div>' +
                  '<div class="fg ui-s2"><label class="fl" for="ep-nom">Título del proyecto <span class="req">*</span></label><input class="fc" id="ep-nom"></div>'
                : dato('', 'Empresa', esc(p.empresa || '') + tier()) + dato('ui-s2', 'Título del proyecto', esc(p.nombre || ''))) +
          (alta ? '' : dato('', 'Creado', d.creado ? '<span class="ui-num">' + ff(String(d.creado).slice(0, 10)) + '</span>' : '—') + dato('', 'Creado por', '—') +
                       dato('', 'Aprobado el', d.fecha_aprobacion ? '<span class="ui-num">' + ff(d.fecha_aprobacion) + '</span>' : '—')) +
          '<div class="fg"><label class="fl" for="ep-cierre">Fecha probable de aprobación <span class="req">*</span></label><input class="fc" type="date" id="ep-cierre" value="' + esc(d.fecha_cierre_probable || '') + '"></div>' +
          '<div class="fg"><label class="fl" for="ep-prob">Probabilidad de aprobación (%)</label><input class="fc u-tr ui-num" style="width:80px" type="number" min="0" max="100" id="ep-prob" value="' + esc(p.probabilidad || 50) + '"' + (fijo ? ' disabled' : '') + '></div><div></div>' +
        '</div><div id="ep-imp" class="ui-g4"></div>', '', '', 'proy') +
      sec('Resumen ejecutivo', false,
        '<div class="u-row8 u-mb6"><span class="ui-f1"></span>' + uiIb('buscar', 'Buscar una minuta guardada', '', 'data-ep="minuta"') +
          '<label class="ui-lnk ui-azul">' + uiIco('clip') + ' Adjuntar .md o propuesta<input type="file" class="ui-arch-inp" id="ep-doc" accept=".md,.txt,.pdf,.doc,.docx,.ppt,.pptx" hidden></label></div>' +
        '<textarea class="fc" rows="4" id="ep-res" aria-label="Resumen ejecutivo">' + esc(d.resumen_ejecutivo || '') + '</textarea><div id="ep-docs"></div>', '', '', 'res') +
      sec('Contactos', false,
        '<div class="ui-cols3">' +
          '<div><div class="ui-li-sub">SPONSORS</div><div id="ep-sps"></div><button type="button" class="ui-lnk ui-azul u-mt6" data-ep="sp-agregar">+ Agregar sponsor</button></div>' +
          '<div><div class="ui-li-sub">CONTACTOS DEL CLIENTE</div><div id="ep-con"></div><button type="button" class="ui-lnk ui-azul u-mt6" data-ep="co-agregar">+ Agregar contacto</button></div>' +
          '<div><div class="ui-li-sub">RESPONSABLES</div><div id="ep-rsp"></div><button type="button" class="ui-lnk ui-azul u-mt6" data-ep="ow-agregar">+ Agregar responsable</button></div></div>',
        '', '', 'con') +
      (alta ? '' : sec('Estado y cronograma', false, '<div id="ep-estado"></div>', '', '<span id="ep-v-est"></span>', 'est')) +
      sec('Desarrollos', false, '<div id="ep-devs"></div>', '', '<span id="ep-v-devm"></span>', 'devs') +
      sec('Mantenimiento mensual · MMR', false, '<div id="ep-mmr"></div>', '', '<span id="ep-v-mmr"></span>', 'mmr') +
      (alta ? '' : sec('Historial', false, '<div id="ep-hist"></div>', String(hist.length), '', 'hist')),
      '<button class="btn bg" data-cerrar="m-eproy">Cancelar</button><button class="btn bp" id="ep-ok">' + (alta ? 'Crear proyecto' : 'Guardar') + '</button>', 'ep-md');
    lista();
    // Adjuntos del resumen: se suben al Drive de la empresa (puente subirDoc) y quedan en «Documentos, Drive y propuestas»
    var pintarDocs = function () {
      set('ep-docs', docs.map(function (x) { var u = ((x.accesos || [])[0] || {}).url;
          return '<div class="ui-li">' + uiIco('documento') + '<span class="ui-f1">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x.titulo) + '</a>' : esc(x.titulo)) +
            '<div class="ui-li-sub">' + esc(x.tipo || '') + (x.creado ? ' · <span class="ui-num">' + ff(String(x.creado).slice(0, 10)) + '</span>' : '') + '</div></span></div>'; }).join('') +
        LOC.docs.map(function (f, k) { return '<div class="ui-li">' + uiIco('documento') + '<span class="ui-f1">' + esc(f.name) + '<div class="ui-li-sub">Se sube al crear el proyecto</div></span>' + uiIb('cerrar', 'Quitar', '', 'data-ep="doc-quitar" data-i="' + k + '"') + '</div>'; }).join(''));
    };
    var subirDoc = async function (f, pid, emp) {
      toast('Subiendo ' + f.name + '…', 'inf');
      var up = await puente('subirDoc', { archivo: f, empresa: emp }); if (!up || !up.url) throw new Error('No se pudo subir ' + f.name);
      var tipo = /\.(md|txt)$/i.test(f.name) ? 'Minuta' : 'Propuesta comercial';
      var ri = await db().from('entregables').insert({ proyecto_id: pid, titulo: f.name, tipo: tipo, estado: 'activo', accesos: [{ tipo: tipo, nombre: f.name, url: up.url }] });
      if (ri.error) throw new Error(ri.error.message);
      return { titulo: f.name, tipo: tipo, accesos: [{ url: up.url }], creado: new Date().toISOString() };
    };
    pintarDocs();
    // ── Desarrollos, MMR e importes (sale de p.items; en el alta, de lo cargado en el modal) ──
    var vivo = function (it) { return _canonSol(it.estado) !== 'rechazada'; };
    var monto = function (it) { return it.moneda === 'USD' && Number(it.total_usd) ? fmt(it.total_usd, 'USD') : fmt(it.total_ars); };
    var cuota = function (it) { return Number(it.cuota_act) || Number(it.valor_cuota) || 0; };
    var items = function () { return alta ? LOC.devs.concat(LOC.mmr ? [LOC.mmr] : []) : (p.items || []); };
    var econ = function () {
      var all = items(), its = all.filter(vivo), devs = all.filter(function (it) { return !esMant(it); }), mants = its.filter(esMant);
      var aprob = 0, neg = 0, mes = 0, grupo = function (k) { return devs.filter(function (it) { var c = _canonSol(it.estado);
        return k === 'c' ? esGanado(it.estado) : k === 'p' ? c === 'nueva' : c === 'rechazada'; }); };
      devs.forEach(function (it) { if (esGanado(it.estado)) aprob += Number(it.total_ars) || 0; else if (_canonSol(it.estado) === 'nueva') neg += Number(it.total_ars) || 0; });
      mants.forEach(function (it) { if (!desCerrado(it)) mes += cuota(it); });
      var fila = function (it) { var nuevo = _canonSol(it.estado) === 'nueva', k = it._loc != null ? 'data-loc="' + it._loc + '"' : 'data-id="' + esc(it.id) + '"';
        return '<div class="ui-li"><span class="ui-f1">' + esc(it.titulo || it.id) + '<div class="ui-li-sub">' + esc(it.tipo_nombre || it.tipo || '') + (it.fecha_aprob ? ' · aprobado <span class="ui-num">' + ff(it.fecha_aprob) + '</span>' : '') + '</div></span>' +
          '<span class="ui-num' + (esGanado(it.estado) ? ' ui-p-contratado' : '') + '">' + monto(it) + '</span><span class="ui-li-sub ui-num">' + (it.moneda === 'USD' ? 'USD' : 'ARS') + '</span>' +
          '<span>' + uiEstado(uiNombreEst(it.estado), { detenido: it.detenido }) + '</span>' + (it._loc != null ? '' : uiIb('editar', 'Editar', '', 'data-ep="dev-editar" ' + k)) +
          (nuevo ? uiIb('e_cruz', it._loc != null ? 'Quitar' : 'No aceptar', 'bor', 'data-ep="dev-quitar" ' + k) : '') + '</div>'; };
      var gc = grupo('c'), gp = grupo('p'), gr = grupo('r');
      set('ep-devs', (devs.length ? '' : '<div class="ui-nota-t">Sin desarrollos.</div>') +
        (gc.length ? '<div class="ui-li-sub u-mb6">CONTRATADOS</div>' + gc.map(fila).join('') : '') +
        (gp.length ? '<div class="ui-li-sub u-mb6' + (gc.length ? ' u-mt10' : '') + '">' + (alta ? 'A COTIZAR' : 'PENDIENTES DE APROBAR') + '</div>' + gp.map(fila).join('') : '') +
        (gr.length ? '<details class="u-mt10"><summary class="ui-li-sub">NO ACEPTADOS · <span class="ui-num">' + gr.length + '</span></summary>' + gr.map(fila).join('') + '</details>' : '') +
        '<div class="u-row8"><button type="button" class="ui-lnk ui-azul u-mt6" data-ep="dev-agregar">+ Agregar desarrollo</button>' +
        (alta ? '' : '<button type="button" class="ui-lnk ui-azul u-mt6" data-ep="cotizar">Cotizar por funcionalidad</button>') + '</div>');
      var nd = document.querySelector('#m-eproy [data-sec="devs"] .ui-d-n'); if (nd) nd.textContent = String(devs.length); set('ep-v-devm', '<span class="ui-num">' + fmt(aprob + neg) + '</span>');
      set('ep-mmr', '<label class="u-row6 u-mb6 ui-vio"><input type="checkbox" data-ep="mmr-check"' + (mants.length ? ' checked' : '') + '> Incluye mantenimiento</label>' +
        mants.map(function (it) { var ipc = !/sin/i.test(it.inflacion || '') && !!it.inflacion, nuevo = _canonSol(it.estado) === 'nueva', hs = it._hs || mhs[it.id];
          return '<div class="ui-li"><span class="ui-f1"><span class="ui-p-abono">' + esc(it.titulo || it.id) + '</span><div class="ui-li-sub"><span class="ui-num">' + (Number(it.duracion) || 12) + '</span> meses' +
            (ipc ? ' · <span class="ui-p-abono">' + uiIco('check') + ' Ajuste por IPC</span>' : ' · sin ajuste por IPC') + (hs ? ' · <span class="ui-num">' + String(hs).replace('.', ',') + '</span> h por mes' : '') +
            ' · ' + esc(uiNombreEst(it.estado)) + '</div></span><span class="ui-num ui-p-abono">' + fmt(cuota(it)) + '/mes</span><span class="ui-li-sub ui-num">ARS</span>' +
            (it._loc != null ? '' : uiIb('editar', 'Editar', '', 'data-ep="mmr-editar" data-id="' + esc(it.id) + '"')) +
            (nuevo ? uiIb('e_cruz', it._loc != null ? 'Quitar' : 'No aceptar', 'bor', it._loc != null ? 'data-ep="mmr-quitar" data-loc="mmr"' : 'data-ep="mmr-quitar" data-id="' + esc(it.id) + '"') : '') + '</div>'; }).join('') +
        (mants.some(function (it) { return !desCerrado(it); }) ? '' : '<button type="button" class="ui-lnk ui-azul u-mt6" data-ep="mmr-agregar">+ Agregar MMR</button>'));
      set('ep-v-mmr', mes ? '<span class="ui-num ui-p-abono">' + fmt(mes) + '/mes</span>' : '');
      var imp = function (l, v, cls) { return '<div class="fg"><span class="fl">' + l + '</span><div class="ui-num ' + (cls || '') + '">' + v + '</div></div>'; };
      set('ep-imp', imp('Contratado', fmt(aprob), 'ui-p-contratado') + imp('Proyectado · en Nuevo', fmt(neg)) + imp('MMR por mes', fmt(mes), 'ui-p-abono') + imp('Total a 12 meses', fmt(aprob + neg + 12 * mes)));
    };
    // ── Estado y cronograma: el estado sale de los desarrollos; sólo las acciones que la regla permite ──
    var estado = function () {
      if (alta) return;
      var can = _canonProy(p.estado_proyecto), acc = accionesEstado(p, true);
      set('ep-estado', '<div class="ui-li-sub u-mb6">' + esc(porQue(p, can) || deDondeSale(p) || '') + '</div>' + rielCiclo(p, d, hist, true) + (acc ? '<div class="ui-acc-der">' + acc + '</div>' : ''));
      set('ep-v-est', uiEstado(p.estado_proyecto, { detenido: p.detenido }));
      set('ep-hist', histHTML(hist));
    };
    var recargar = async function () {
      if (alta) return econ();
      await cargar(); p = P.proys.find(function (x) { return x.id === p.id; }) || p;
      var rr = await Promise.all([db().from('desarrollos').select('id,mantenimiento_horas').eq('proyecto_id', p.id),
        db().from('historial_proyecto').select('evento,fecha,prevista,detalle,quien').eq('proyecto_id', p.id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(60),
        db().from('proyectos').select('creado,fecha_aprobacion,fecha_cierre_probable,fecha_propuesta_enviada,fecha_inicio,fecha_finalizado').eq('id', p.id).maybeSingle()]);
      (rr[0].data || []).forEach(function (x) { mhs[x.id] = Number(x.mantenimiento_horas) || 0; }); hist = rr[1].data || hist; Object.assign(d, rr[2].data || {});
      econ(); estado();
    };
    econ(); estado();
    // Agregar desarrollo suelto (alta_desarrollo · clase desarrollo), sin horas. En el alta queda en el modal hasta crear el proyecto.
    var altaDesarrollo = async function () {
      var L = await Promise.all([db().from('tipos_desarrollo').select('id,nombre').order('orden'), db().from('modelos_pago').select('id,nombre').order('orden')]);
      var o = function (X, ph) { return '<option value="">' + ph + '</option>' + (X.data || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>'; }).join(''); };
      var mon = 'ARS';
      var md = armarModal('m-adev', 'Agregar desarrollo' + (p.nombre ? ' · ' + p.nombre : ''),
        '<div class="ui-filas"><div class="fg ui-w-l"><label class="fl" for="ad2-tipo">Tipo de desarrollo <span class="req">*</span></label><select class="fc" id="ad2-tipo">' +
          o({ data: (L[0].data || []).filter(function (t) { return !/mantenimiento/i.test(t.nombre); }) }, 'Elegí') + '</select></div>' +
          '<div class="fg ui-w-f"><label class="fl" for="ad2-tit">Título <span class="req">*</span></label><input class="fc" id="ad2-tit"></div></div>' +
        '<div class="fg"><label class="fl" for="ad2-alc">Alcance</label><textarea class="fc" rows="2" id="ad2-alc"></textarea></div>' +
        '<div class="ui-filas"><div class="fg ui-w-s"><span class="fl">Moneda</span><span class="ui-mon" role="group" aria-label="Moneda"><button type="button" class="ui-mon-b ui-mon-ars on" data-ad2="ARS">ARS</button><button type="button" class="ui-mon-b ui-mon-usd" data-ad2="USD">USD</button></span></div>' +
          '<div class="fg ui-w-l"><label class="fl" for="ad2-monto">Monto <span class="req">*</span></label><input class="fc u-tr ui-num" type="number" min="0" id="ad2-monto" data-monto><div class="u-s11-mt" id="ad2-eq"></div></div>' +
          '<div class="fg ui-w-f"><label class="fl" for="ad2-fp">Forma de pago <span class="req">*</span></label><select class="fc" id="ad2-fp">' + o(L[1], 'Elegí') + '</select></div></div>' +
        '<div class="ui-filas ui-rep"><div class="fg"><label class="fl" for="ad2-cuo">Cuotas</label><input class="fc u-tr ui-num" style="width:80px" type="number" min="1" id="ad2-cuo" value="1"></div>' +
          '<div class="fg"><label class="fl" for="ad2-sem">Semanas <span class="req">*</span></label><input class="fc u-tr ui-num" style="width:80px" type="number" min="1" id="ad2-sem"></div>' +
          '<div class="fg"><label class="fl" for="ad2-gar">Días de garantía</label><input class="fc u-tr ui-num" style="width:80px" type="number" min="0" id="ad2-gar"></div>' +
          '<div class="fg"><span class="fl">Ajuste por IPC</span><label class="u-row6 ui-vio"><input type="checkbox" id="ad2-ipc" checked> Ajusta</label></div></div>' +
        '<div class="ui-nota-t">Nace en Nuevo y sin horas: no hay comparación con el mercado ni con el costo. Para cotizar por funcionalidad, usá el Cotizador.</div>' +
        '<div class="u-c-rd u-s11" id="ad2-err"></div>',
        '<button class="btn bg" data-cerrar="m-adev">Cancelar</button><button class="btn bg" data-ad2ok="otro">Agregar y cargar otro</button><button class="btn bp" data-ad2ok="1">Agregar</button>');
      var eq = function () { var n = Number($e('ad2-monto').value) || 0, tc = window.TC || 0;
        set('ad2-eq', n && tc ? '= <span class="ui-num ui-p-usd">' + (mon === 'USD' ? fmt(n * tc) : fmt(n / tc, 'USD')) + '</span>' : ''); };
      md.oninput = eq;
      md.onclick = async function (ev) {
        var b = ev.target.closest('[data-ad2],[data-ad2ok]'); if (!b) return;
        if (b.hasAttribute('data-ad2')) { mon = b.getAttribute('data-ad2'); md.querySelectorAll('[data-ad2]').forEach(function (x) { x.classList.toggle('on', x === b); });
          $e('ad2-ipc').checked = mon === 'ARS'; return eq(); }   // en USD no suele ajustarse por IPC
        var v = function (id) { return String($e(id).value || '').trim(); };
        var falta = [!v('ad2-tipo') && 'el tipo', !v('ad2-tit') && 'el título', !(Number(v('ad2-monto')) > 0) && 'el monto', !v('ad2-fp') && 'la forma de pago', !(Number(v('ad2-sem')) > 0) && 'las semanas'].filter(Boolean);
        if (falta.length) return set('ad2-err', 'Falta ' + falta.join(', ') + '.');
        var P2 = { clase: 'desarrollo', tipo: v('ad2-tipo'), titulo: v('ad2-tit'), descripcion: v('ad2-alc'), moneda: mon, monto: v('ad2-monto'), forma_pago: v('ad2-fp'), cuotas: v('ad2-cuo') };
        var extra = { sem: Number(v('ad2-sem')), gar: v('ad2-gar'), ipc: $e('ad2-ipc').checked };
        if (alta) {   // queda en el modal; se crea con el proyecto
          var tc = window.TC || 0, n = Number(P2.monto) || 0, t = $e('ad2-tipo');
          LOC.devs.push({ _loc: LOC.devs.length, _p: P2, _x: extra, titulo: P2.titulo, tipo: P2.tipo, tipo_nombre: t.options[t.selectedIndex].text, estado: 'Nuevo', moneda: mon,
                          total_ars: mon === 'USD' ? Math.round(n * tc) : n, total_usd: mon === 'USD' ? n : (tc ? n / tc : 0) });
          econ();
        } else {
          md.querySelectorAll('[data-ad2ok]').forEach(function (x) { x.disabled = true; });
          var rr = await db().rpc('alta_desarrollo', { p: Object.assign({ pid: p.id }, P2) });
          md.querySelectorAll('[data-ad2ok]').forEach(function (x) { x.disabled = false; });
          if (rr.error) return set('ad2-err', esc(rr.error.message));
          var ex = await completarDev(rr.data.id, extra); if (ex) toast('Se creó ' + rr.data.id + ', pero no se guardó todo: ' + ex, 'err');
          toast(rr.data.msg, 'ok'); await recargar();
        }
        if (b.getAttribute('data-ad2ok') === 'otro') { ['ad2-tit', 'ad2-alc', 'ad2-monto', 'ad2-sem', 'ad2-gar'].forEach(function (id) { $e(id).value = ''; }); set('ad2-eq', ''); set('ad2-err', ''); delete md.dataset.sucio; $e('ad2-tit').focus(); }
        else closeM('m-adev');
      };
      openM('m-adev');
    };
    var completarDev = async function (did, x) {   // semanas, IPC y garantía: las mismas funciones de siempre
      var pr = [db().rpc('desarrollo_semanas', { did: did, semanas: x.sem }), db().rpc('desarrollo_ajuste', { did: did, si: x.ipc })];
      if (x.gar) pr.push(db().rpc('guardar_desarrollo', { p: { id: did, garantia_dias: x.gar } }));
      var e = (await Promise.all(pr)).find(function (y) { return y.error; }); return e ? e.error.message : '';
    };
    // MMR: el mismo modal para agregar (alta_abono) y para editar (Nuevo: guardar_desarrollo · aprobado: editar_monto_aprobado)
    var mmrModal = function (it) {
      var nuevoM = !it, gan = it && esGanado(it.estado), mon = 'ARS';
      var devs = items().filter(function (x) { return vivo(x) && !esMant(x); });
      if (nuevoM && !devs.length) return say('Primero agregá el desarrollo que va a mantener.', 'MMR');
      var ipc0 = nuevoM ? true : (!/sin/i.test(it.inflacion || '') && !!it.inflacion);
      var mt = armarModal('m-mmr', (nuevoM ? 'Agregar MMR' : 'Editar MMR') + (p.nombre ? ' · ' + p.nombre : ''),
        (nuevoM ? '<div class="ui-filas"><div class="fg ui-w-f"><label class="fl" for="mm-padre">Mantiene <span class="req">*</span></label><select class="fc" id="mm-padre">' +
          devs.map(function (x) { return '<option value="' + (x._loc != null ? 'loc:' + x._loc : esc(x.id)) + '">' + esc(x.titulo || x.id) + '</option>'; }).join('') + '</select></div></div>' : '<div class="ui-p-abono u-mb10">' + esc(it.titulo || it.id) + '</div>') +
        '<div class="ui-filas ui-rep">' +
          '<div class="fg"><span class="fl">Moneda</span>' + (nuevoM ? '<span class="ui-mon" role="group" aria-label="Moneda"><button type="button" class="ui-mon-b ui-mon-ars on" data-mm="ARS">ARS</button><button type="button" class="ui-mon-b ui-mon-usd" data-mm="USD">USD</button></span>' : '<div class="ui-num">ARS</div>') + '</div>' +
          '<div class="fg ui-w2"><label class="fl" for="mm-cuota">Cuota mensual <span class="req">*</span></label><input class="fc u-tr ui-num" type="number" min="0" id="mm-cuota" data-monto value="' + (it ? cuota(it) : '') + '"></div>' +
          '<div class="fg"><label class="fl" for="mm-meses">Meses</label><input class="fc u-tr ui-num" style="width:80px" type="number" min="1" id="mm-meses" value="' + (it ? (Number(it.duracion) || 12) : 12) + '"></div>' +
          '<div class="fg"><span class="fl">Ajuste por IPC</span><label class="u-row6 ui-vio"><input type="checkbox" id="mm-ipc"' + (ipc0 ? ' checked' : '') + (gan ? ' disabled' : '') + '> Ajusta</label></div>' +
          '<div class="fg"><label class="fl" for="mm-hs">Horas por mes</label><input class="fc u-tr ui-num" style="width:80px" type="number" min="0" step="0.5" id="mm-hs" value="' + (it && mhs[it.id] ? mhs[it.id] : '') + '"' + (gan ? ' disabled' : '') + '></div>' +
        '</div><div id="mm-tot"></div>' + (gan ? '<div class="ui-nota-t">Aprobado: sólo se cambian la cuota y los meses. El ajuste por IPC y las horas quedan como se contrataron.</div>' : '') +
        '<div class="u-c-rd u-s11" id="mm-err"></div>',
        '<button class="btn bg" data-cerrar="m-mmr">Cancelar</button><button class="btn bp" data-mmok="1">' + (nuevoM ? 'Agregar' : 'Guardar') + '</button>');
      var tot = function () { var c = Number($e('mm-cuota').value) || 0, n = Number($e('mm-meses').value) || 0, tc = window.TC || 0, ars = (mon === 'USD' ? c * tc : c) * n;
        set('mm-tot', c && n ? '<div class="ui-kv"><span>Anual · <span class="ui-num">' + n + '</span> meses</span><span class="ui-num ui-p-abono">' + fmt(ars) + '</span></div>' +
          (tc ? '<div class="ui-kv"><span>Equivale a</span><span class="ui-num ui-p-usd">' + fmt(ars / tc, 'USD') + '</span></div>' : '') + (mon === 'USD' ? '<div class="ui-nota-t">El abono se guarda en pesos, al tipo de cambio del día.</div>' : '') : ''); };
      mt.oninput = tot; tot();
      mt.onclick = async function (ev) {
        var b = ev.target.closest('[data-mm],[data-mmok]'); if (!b) return;
        if (b.hasAttribute('data-mm')) { mon = b.getAttribute('data-mm'); mt.querySelectorAll('[data-mm]').forEach(function (x) { x.classList.toggle('on', x === b); }); $e('mm-ipc').checked = mon === 'ARS'; return tot(); }
        var c = Number($e('mm-cuota').value) || 0, n = Number($e('mm-meses').value) || 0, hs = $e('mm-hs').value, si = $e('mm-ipc').checked;
        if (!(c > 0) || !(n > 0)) return set('mm-err', 'Poné la cuota y los meses.');
        if (alta) {   // queda en el modal; se crea con el proyecto
          var pv = $e('mm-padre').value, dv = LOC.devs[Number(pv.slice(4))], tc = window.TC || 0;
          LOC.mmr = { _loc: 'mmr', _p: { padreLoc: Number(pv.slice(4)), cuota: c, meses: n, ajuste: si, moneda: mon, horas: hs === '' ? null : Number(hs) }, titulo: 'MMR de ' + (dv ? dv.titulo : ''),
                      modelo: 'FP-03', estado: 'Nuevo', cuota_act: mon === 'USD' ? Math.round(c * tc) : c, duracion: n, inflacion: si ? 'Ajuste' : 'Sin Ajuste', _hs: hs };
          closeM('m-mmr'); return econ();
        }
        var rr = nuevoM ? await db().rpc('alta_abono', { pid: p.id, padre: $e('mm-padre').value, cuota: c, meses: n, ajuste: si, inicio: null, moneda: mon, horas: hs === '' ? null : Number(hs) })
          : gan ? await db().rpc('editar_monto_aprobado', { did: it.id, cuota_nueva: c, duracion: n })
          : await db().rpc('guardar_desarrollo', { p: Object.assign({ id: it.id, cuota_act: c, cuotas: n, total_ars: Math.round(c * n * 100) / 100, inflacion: si ? 'Ajuste' : 'Sin Ajuste' }, hs === '' ? {} : { mant_horas: hs }) });   // horas vacías: no se tocan
        if (rr.error) return set('mm-err', esc(rr.error.message));
        closeM('m-mmr'); toast(nuevoM ? 'MMR agregado' : 'MMR guardado', 'ok'); await recargar();
      };
      openM('m-mmr');
    };
    var elegirContacto = async function (k, tit) {   // k: 'sps' (sponsors) o 'con' (contactos del cliente)
      if (!p.empresa_id) return say('Primero elegí la empresa.', tit);
      var v = await elegirVarios(tit + ' · ' + (p.empresa || ''), cons.map(function (c) { return { v: c.id, t: nomC(c), sub: c.puesto || c.area_trabajo || '' }; }),
        { ya: E[k], nuevo: { txt: 'Nuevo contacto', fn: function () {
          window.abrirContacto(null, { empresa: p.empresa_id, onSave: async function () {
            var c = await db().from('contactos').select('id,nombre,apellido,puesto,area_trabajo,email,telefono').eq('empresa_id', p.empresa_id || '-').order('nombre');
            if (!c.error) cons = c.data || []; elegirContacto(k, tit); } }); } } });
      if (v && v.length) { E[k] = E[k].concat(v); m.dataset.sucio = '1'; lista(); }
    };
    m.onchange = async function (ev) {
      var t = ev.target;
      if (t.id === 'ep-emp') {   // alta: la empresa define sus contactos y su Tier
        p.empresa_id = t.value; p.empresa = t.value ? t.options[t.selectedIndex].text : ''; E.sps = []; E.con = [];
        var c = await db().from('contactos').select('id,nombre,apellido,puesto,area_trabajo,email,telefono').eq('empresa_id', p.empresa_id || '-').order('nombre');
        cons = c.data || []; set('ep-tier', tier()); lista(); return;
      }
      if (t.id === 'ep-doc' && t.files && t.files[0]) {
        var f = t.files[0]; t.value = '';
        if (alta) { LOC.docs.push(f); return pintarDocs(); }
        try { docs.unshift(await subirDoc(f, p.id, p.empresa)); pintarDocs(); toast('Adjunto guardado', 'ok'); } catch (e) { toast(e.message, 'err'); }
      }
    };
    m.onclick = async function (ev) {
      var b = ev.target.closest('[data-ep]'); if (!b) return; var a = b.getAttribute('data-ep');
      if (a === 'sp-quitar') { E.sps.splice(Number(b.getAttribute('data-i')), 1); m.dataset.sucio = '1'; return lista(); }
      if (a === 'ow-quitar') { E.rsp.splice(Number(b.getAttribute('data-i')), 1); m.dataset.sucio = '1'; return lista(); }
      if (a === 'co-quitar') { E.con.splice(Number(b.getAttribute('data-i')), 1); m.dataset.sucio = '1'; return lista(); }
      if (a === 'sp-agregar') return elegirContacto('sps', 'Agregar sponsor');
      if (a === 'co-agregar') return elegirContacto('con', 'Agregar contacto');
      if (a === 'doc-quitar') { LOC.docs.splice(Number(b.getAttribute('data-i')), 1); return pintarDocs(); }
      if (a === 'dev-agregar') return altaDesarrollo();
      if (a === 'mmr-agregar') return mmrModal(null);
      if (a === 'mmr-editar') return mmrModal((p.items || []).find(function (x) { return x.id === b.getAttribute('data-id'); }));
      if (a === 'mmr-check') {   // la casilla muestra si hay MMR: tildarla abre el alta; para sacarlo, la ✕ del MMR
        ev.preventDefault(); var hay = items().some(function (x) { return vivo(x) && esMant(x); });
        return hay ? toast('Para quitar el MMR usá la ✕ de su fila (sólo si está en Nuevo).', 'inf') : mmrModal(null);
      }
      if (a === 'dev-editar') return window.abrirDesarrollo(b.getAttribute('data-id'), { onSave: recargar });
      if ((a === 'dev-quitar' || a === 'mmr-quitar') && b.hasAttribute('data-loc')) {   // alta: se saca del modal
        if (a === 'mmr-quitar') LOC.mmr = null; else { LOC.devs.splice(Number(b.getAttribute('data-loc')), 1); LOC.devs.forEach(function (x, i) { x._loc = i; }); LOC.mmr = null; }
        return econ();
      }
      if (a === 'dev-quitar' || a === 'mmr-quitar') {
        var it0 = (p.items || []).find(function (x) { return x.id === b.getAttribute('data-id'); }) || {};
        if (!(await ask('«' + (it0.titulo || it0.id) + '» pasa a No aceptado. No se borra: queda en el historial del proyecto.', 'No aceptar', { ok: 'No aceptar', peligro: true }))) return;
        var rq = await db().rpc('accion_desarrollo', { did: it0.id, accion: 'rechazar' }); if (rq.error) return toast(rq.error.message, 'err');
        toast('No aceptado', 'ok'); return recargar();
      }
      if (a === 'ow-agregar') {
        var v = await elegirVarios('Agregar responsable', Object.keys(P.users).map(function (k) { return { v: k, t: P.users[k] }; }), { ya: E.rsp });
        if (v && v.length) { E.rsp = E.rsp.concat(v); m.dataset.sucio = '1'; lista(); } return;
      }
      if (a === 'acc') {   // las acciones de estado de siempre: abren su modal encima y vuelven acá
        var q = b.getAttribute('data-a');
        if (q === 'arrancar') await P.acc.arrancar(p);
        else if (q === 'detener') await P.acc.corte(p, 'detener');
        else if (q === 'reanudar') { var rd = await db().rpc('detener_proyecto', { pid: p.id, detener: false }); if (rd.error) return toast(rd.error.message, 'err'); toast('Reanudado', 'ok'); }
        else await P.acc.estado(p, q);
        return recargar();
      }
      if (a === 'ed-cierre') { var dp = m.querySelector('[data-sec="proy"]'); if (dp && !dp.classList.contains('open')) dp.click(); return $e('ep-cierre').focus(); }
      if (a === 'ed-fechas') { var d1 = (p.items || []).find(function (x) { return vivo(x) && !esMant(x) && !desCerrado(x); }); if (d1) return fechasDes(document.getElementById('vista'), d1); return; }
      if (a === 'cotizar') { closeM('m-eproy'); location.hash = '#/cot'; return; }
      if (a === 'minuta') {   // la misma búsqueda de minutas del Cotizador (cot_minutas)
        var mm = armarModal('m-bmin', 'Minutas guardadas', '<div id="bmin-b" class="ui-nota-t">Buscando…</div>', '<button class="btn bg" data-cerrar="m-bmin">Cerrar</button>'); openM('m-bmin');
        var L = await db().rpc('cot_minutas', { empresa: p.empresa_id || '' }); if (L.error) return set('bmin-b', esc(L.error.message)); L = L.data || [];
        set('bmin-b', L.length ? L.map(function (x, i) { return '<div class="ui-linea"><span class="ui-f1"><b>' + esc(x.nombre) + '</b> <span class="ui-nota-t ui-num">' + esc(x.pid) + '</span>' +
          '<div class="ui-nota-t">' + esc(x.texto.slice(0, 280)) + (x.texto.length > 280 ? '…' : '') + '</div></span>' + uiBtn('Usar', 'check', 's', 'data-bmin="' + i + '"') + '</div>'; }).join('') : 'Esta empresa no tiene minutas guardadas.');
        mm.onclick = function (e2) { var u = e2.target.closest('[data-bmin]'); if (!u) return; var x = L[Number(u.getAttribute('data-bmin'))], t = $e('ep-res');
          t.value = (t.value.trim() ? t.value.trim() + '\n\n' : '') + x.texto; m.dataset.sucio = '1'; closeM('m-bmin'); };
      }
    };
    openM('m-eproy');
    return new Promise(function (res) {
      $e('ep-ok').onclick = async function () {
        if (!$e('ep-cierre').value) return toast('Falta la fecha probable de aprobación', 'err');
        if (!alta) {
          var datos = { id: p.id, owner: E.rsp[0] || p.owner, probabilidad: $e('ep-prob').value, fecha_cierre: $e('ep-cierre').value, descripcion: $e('ep-res').value };
          // Las listas van sólo si cambiaron (sponsors → «sponsors», contactos del cliente → «contactos»)
          if (E.sps.join(',') !== sps0.join(',')) datos.sponsors = E.sps; else datos.sponsor = sps0[0] || '';
          if (E.con.join(',') !== con0.join(',')) datos.contactos_cliente = E.con;
          if (E.rsp.join(',') !== rsp0.join(',')) datos.responsables = E.rsp;
          closeM('m-eproy'); return res(datos);
        }
        // Nuevo proyecto: crea el proyecto, después sus desarrollos, el MMR y los adjuntos
        if (!p.empresa_id) return toast('Elegí la empresa', 'err');
        if (!$e('ep-nom').value.trim()) return toast('Falta el título del proyecto', 'err');
        var bo = $e('ep-ok'); bo.disabled = true;
        try {
          var rp = await db().rpc('alta_proyecto', { p: { empresa_id: p.empresa_id, nombre: $e('ep-nom').value.trim(), fecha_cierre: $e('ep-cierre').value, probabilidad: $e('ep-prob').value,
            resumen: $e('ep-res').value, sponsors: E.sps, contactos_cliente: E.con, responsables: E.rsp.length ? E.rsp : [yo()] } });
          if (rp.error) throw new Error(rp.error.message);
          var pid = rp.data.pid, ids = [], avisos = [];
          for (var i = 0; i < LOC.devs.length; i++) {
            var rd2 = await db().rpc('alta_desarrollo', { p: Object.assign({ pid: pid }, LOC.devs[i]._p) });
            if (rd2.error) { avisos.push(LOC.devs[i].titulo + ': ' + rd2.error.message); ids.push(null); continue; }
            ids.push(rd2.data.id); var ex2 = await completarDev(rd2.data.id, LOC.devs[i]._x); if (ex2) avisos.push(LOC.devs[i].titulo + ': ' + ex2);
          }
          if (LOC.mmr && ids[LOC.mmr._p.padreLoc]) { var q2 = LOC.mmr._p;
            var ra = await db().rpc('alta_abono', { pid: pid, padre: ids[q2.padreLoc], cuota: q2.cuota, meses: q2.meses, ajuste: q2.ajuste, inicio: null, moneda: q2.moneda, horas: q2.horas });
            if (ra.error) avisos.push('MMR: ' + ra.error.message); }
          for (var j = 0; j < LOC.docs.length; j++) { try { await subirDoc(LOC.docs[j], pid, p.empresa); } catch (e3) { avisos.push(e3.message); } }
          closeM('m-eproy'); toast(pid + ' creado como Prospecto', 'ok'); if (avisos.length) aviso('El proyecto se creó, pero hubo problemas:\n· ' + avisos.join('\n· '));
          await cargar(); P.sub = 'proy'; abrirFicha(document.getElementById('vista'), pid); res(null);
        } catch (e4) { toast(e4.message, 'err'); } finally { bo.disabled = false; }
      };
    });
  }

  // ── aprobar: qué entró, qué no y qué queda en espera (aprobarProyecto) ──
  // ── aprobar: qué entró, qué no y qué queda en espera (aprobarProyecto) · diseño aprobado 20/11/2026 ──
  // Una fila por desarrollo: cotizado · aprobado ($) · decisión (✓ aprueba · ✕ no acepta · ◇ sigue en Nuevo) · inicia (▶ fecha · ⏸ se posterga)
  function abrirAprobar(p) {
    var nuevas = (p.items || []).filter(function (it) { return _canonSol(it.estado || '') === 'nueva'; });
    if (!nuevas.length) return say('Este proyecto no tiene desarrollos en Nuevo para aprobar.', 'Aprobar propuesta');
    var D = {}; nuevas.forEach(function (it) { D[it.id] = { dec: 'entro', ini: esMant(it) ? 'po' : 'in' }; });
    var cot = function (it) { return esMant(it) ? fmt(Number(it.cuota_act) || Number(it.valor_cuota) || 0) + '/mes' : fmt(Number(it.total_ars) || 0); };
    var ic = function (k, cls, icono, tip, on) { return '<button type="button" class="ui-ib ap-' + cls + (on ? ' on' : '') + '" data-ap-' + k + '="' + cls + '" data-tip="' + tip + '" aria-label="' + tip + '">' + uiIco(icono) + '</button>'; };
    var fila = function (it) { var d = D[it.id], off = d.dec === 'entro' ? '' : ' ap-off', m = esMant(it);
      return '<div class="ap-fila3" data-ap="' + esc(it.id) + '"><span>' + (m ? '<span class="ui-p-abono">' + esc(it.titulo || it.id) + '</span>' : esc(it.titulo || it.id)) +
          '<div class="ui-li-sub">' + esc(it.tipo_nombre || it.tipo || '') + (m ? ' · <span class="ui-num">' + (Number(it.duracion) || 12) + '</span> meses' : '') + '</div></span>' +
        '<span class="ui-num">' + cot(it) + '</span>' +
        '<span class="' + off + '"><span class="ap-pesos"><span class="ui-li-sub">$</span><input class="fc u-tr ui-num" data-monto data-apm="' + esc(it.id) + '" value="' + (m ? (Number(it.cuota_act) || Number(it.valor_cuota) || '') : (Number(it.total_ars) || '')) + '"' + (off ? ' disabled' : '') + '>' + (m ? '<span class="ui-li-sub">/mes</span>' : '') + '</span></span>' +
        '<span class="ap-ic">' + ic('dec', 'entro', 'e_check', 'Aprueba', d.dec === 'entro') + ic('dec', 'rechazado', 'e_cruz', 'No acepta', d.dec === 'rechazado') + ic('dec', 'espera', 'e_rombo', 'Sigue en Nuevo', d.dec === 'espera') + '</span>' +
        '<span class="u-row8' + off + '">' + (off ? '' : '<span class="ap-ic">' + ic('ini', 'in', 'e_play', 'Inicia en una fecha', d.ini === 'in') + ic('ini', 'po', 'e_pausa', 'Se posterga, sin fecha', d.ini === 'po') + '</span>' +
          (d.ini === 'in' ? '<input class="fc" type="date" data-apf="' + esc(it.id) + '" value="' + (d.f || isoMas(0)) + '">' : '<span class="ui-li-sub">Se posterga</span>')) + '</span></div>'; };
    var m = armarModal('m-aprob', 'Aprobar propuesta · ' + (p.nombre || p.id),
      '<div class="ui-li-sub u-mb10">Por cada desarrollo: si el cliente lo aprueba, con qué monto y si inicia en una fecha o se posterga. Lo que no se aprueba hoy puede seguir en Nuevo y aprobarse después.</div>' +
      '<div class="ui-filas"><div class="fg ui-w-m"><label class="fl" for="ap-fecha">Fecha de aprobación <span class="req">*</span></label><input class="fc" type="date" id="ap-fecha" value="' + isoMas(0) + '"></div></div>' +
      '<div class="ap-fila3 ap-h"><span>Desarrollo</span><span>Monto cotizado</span><span>Monto aprobado</span><span>Decisión</span><span>Inicia</span></div><div id="ap-list"></div><div id="ap-tot" class="u-mt10"></div>',
      '<button class="btn bg" data-cerrar="m-aprob">Cancelar</button><button class="btn bp" id="ap-ok">Aprobar</button>', 'md-xl ap-ancho');
    var leerMontos = function () { m.querySelectorAll('[data-apm]').forEach(function (x) { D[x.getAttribute('data-apm')].monto = Number(x.value) || 0; });
      m.querySelectorAll('[data-apf]').forEach(function (x) { D[x.getAttribute('data-apf')].f = x.value; }); };
    var monto = function (it) { var d = D[it.id]; return d.monto != null ? d.monto : (esMant(it) ? (Number(it.cuota_act) || Number(it.valor_cuota) || 0) : (Number(it.total_ars) || 0)); };
    var pintar = function () {
      set('ap-list', nuevas.map(fila).join(''));
      var ad = 0, am = 0, ne = 0, no = 0;
      nuevas.forEach(function (it) { var d = D[it.id], v = monto(it);
        if (d.dec === 'entro') { if (esMant(it)) am += v; else ad += v; } else if (d.dec === 'espera') ne += v; else no += v; });
      set('ap-tot', '<div class="ui-kv"><span>Aprobado hoy · desarrollos</span><span class="ui-num ui-p-contratado">' + fmt(ad) + '</span></div>' +
        (am ? '<div class="ui-kv"><span>Aprobado hoy · MMR</span><span class="ui-num ui-p-abono">' + fmt(am) + '/mes</span></div>' : '') +
        '<div class="ui-kv"><span>Sigue en Nuevo</span><span class="ui-num">' + fmt(ne) + '</span></div>' +
        '<div class="ui-kv"><span>No aceptado</span><span class="ui-num ui-p-error">' + fmt(no) + '</span></div>');
    };
    // al escribir un monto se recalculan sólo los totales (no se repinta la fila que se está escribiendo)
    m.oninput = function () { leerMontos(); var ad = 0, am = 0, ne = 0, no = 0;
      nuevas.forEach(function (it) { var d = D[it.id], v = monto(it); if (d.dec === 'entro') { if (esMant(it)) am += v; else ad += v; } else if (d.dec === 'espera') ne += v; else no += v; });
      set('ap-tot', '<div class="ui-kv"><span>Aprobado hoy · desarrollos</span><span class="ui-num ui-p-contratado">' + fmt(ad) + '</span></div>' +
        (am ? '<div class="ui-kv"><span>Aprobado hoy · MMR</span><span class="ui-num ui-p-abono">' + fmt(am) + '/mes</span></div>' : '') +
        '<div class="ui-kv"><span>Sigue en Nuevo</span><span class="ui-num">' + fmt(ne) + '</span></div><div class="ui-kv"><span>No aceptado</span><span class="ui-num ui-p-error">' + fmt(no) + '</span></div>'); };
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-ap-dec],[data-ap-ini]'); if (!b) return; leerMontos();
      var id = b.closest('[data-ap]').getAttribute('data-ap');
      if (b.hasAttribute('data-ap-dec')) D[id].dec = b.getAttribute('data-ap-dec'); else D[id].ini = b.getAttribute('data-ap-ini');
      pintar();
    };
    pintar();
    return new Promise(function (res) {
      document.getElementById('ap-ok').onclick = function () {
        leerMontos();
        var dec = {}, montos = {}, mants = {}, inicios = {}, n = 0, malo = '', sinFecha = '';
        nuevas.forEach(function (it) { var d = D[it.id]; dec[it.id] = d.dec; if (d.dec !== 'entro') return; n++;
          var v = monto(it); if (v <= 0) malo = it.titulo || it.id;
          if (esMant(it)) mants[it.id] = { cuota: v, duracion: Number(it.duracion) || 12 }; else montos[it.id] = v;
          if (d.ini === 'in') { if (!d.f) sinFecha = it.titulo || it.id; else inicios[it.id] = d.f; } });
        if (!document.getElementById('ap-fecha').value) return say('Falta la fecha de aprobación.', 'Aprobar propuesta');
        if (!n) return say('Marcá al menos uno como Aprueba.\n\nSi no entró nada, usá No aceptar.', 'Aprobar propuesta');
        if (malo) return say('El monto aprobado de «' + malo + '» tiene que ser mayor a 0.', 'Aprobar propuesta');
        if (sinFecha) return say('Falta la fecha de inicio de «' + sinFecha + '».', 'Aprobar propuesta');
        closeM('m-aprob'); res({ dec: dec, montos: montos, mants: mants, inicios: inicios, fecha: document.getElementById('ap-fecha').value || isoMas(0) });
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
    }[P.sub] || 'Seguimiento y estado de cada proyecto.', uiBtn('Nueva cotización', 'lista', 's', 'data-pm="nueva-cot"') + uiBtn('Nuevo proyecto', 'mas', 'p', 'data-pm="nv-abrir"'));
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
    if (nvPedido) abrirEditarProy(null);
    if (/^P-\d+$/.test(s)) {                      // #/pm/P-0001 abre ese proyecto (Cotizador › Ver proyecto)
      if (P.sub === 'ficha') P.sub = 'proy';
      if (!P.proys.some(function (x) { return x.id === s; })) await cargar();   // recién creado: todavía no estaba leído
      abrirFicha(el, s);
    }
    if (!el._pmBound) {                          // una vez: #vista es el mismo para todos los módulos
      el._pmBound = true;
      el.addEventListener('ui-toggle', function (ev) {
        var d = ev.target, o = ev.detail.open;
        if (d.hasAttribute('data-segdesp')) P.seg.abierto[d.getAttribute('data-segdesp')] = o;
        if (d.hasAttribute('data-dsec') && P.dsec) P.dsec[d.getAttribute('data-dsec')] = o;   // Descripción, Módulos y Cronograma de un desarrollo
        if (d.hasAttribute('data-fsec') && P.fsec) P.fsec[d.getAttribute('data-fsec')] = o;   // secciones de la ficha
        if (d.hasAttribute('data-des')) {
          var did = d.getAttribute('data-des'); P.fAb[did] = o;
          if (o) P.fSel = did; else if (P.fSel === did) P.fSel = null;
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
      armarModal('m-pm', tit, cuerpo, '<button class="btn bg" data-cerrar="m-pm">Cancelar</button><button class="btn bp" id="m-pm-ok">' + esc(okTxt) + '</button>');
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
        '<div class="fg"><label class="fl" for="pm-com">Comentario del proyecto <span class="req">*</span></label><textarea class="fc" id="pm-com" rows="3"></textarea></div>' +
        // Detener: fecha de recontacto opcional → una tarea ese día (20/11/2026)
        (rech ? '' : '<div class="ui-filas ui-rep"><div class="fg"><label class="fl" for="pm-recon">Fecha de recontacto</label><input class="fc" type="date" id="pm-recon"></div>' +
          '<div class="fg"><label class="fl" for="pm-recon-q">Responsable de la tarea</label><select class="fc" id="pm-recon-q">' +
            Object.keys(P.users).map(function (k) { return '<option value="' + esc(k) + '"' + (k === String(p.owner || '').trim().toLowerCase() ? ' selected' : '') + '>' + esc(P.users[k]) + '</option>'; }).join('') + '</select></div></div>' +
          '<div class="ui-nota-t">Con fecha, se crea la tarea «Recontactar a ' + esc(p.empresa || 'el cliente') + '» para ese día, vinculada al proyecto. Sin fecha, sólo se detiene.</div>'), tit,
        function () {
          var alc = (document.querySelector('#m-pm [name="pm-alc"]:checked') || {}).value;
          if (alc === 'algunos' && !document.querySelector('#m-pm [data-cor]:checked')) return 'Marcá al menos un desarrollo';
          return document.getElementById('pm-com').value.trim() ? '' : 'Escribí el comentario';
        });
      if (!ok) return;
      var alc = (document.querySelector('#m-pm [name="pm-alc"]:checked') || {}).value, txt = document.getElementById('pm-com').value.trim();
      var recon = !rech && document.getElementById('pm-recon') ? document.getElementById('pm-recon').value : '', reconQ = recon ? document.getElementById('pm-recon-q').value : '';
      var ids = Array.prototype.filter.call(document.querySelectorAll('#m-pm [data-cor]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-cor'); });
      var r;
      if (alc === 'todo') r = await db().rpc(rech ? 'rechazar_proyecto' : 'detener_proyecto', rech ? { pid: p.id } : { pid: p.id, detener: true });
      else for (var i = 0; i < ids.length && !(r && r.error); i++)
        r = await db().rpc(rech ? 'accion_desarrollo' : 'detener_desarrollo', rech ? { did: ids[i], accion: 'rechazar' } : { did: ids[i], detener: true });
      if (r && r.error) return toast(r.error.message, 'err');
      var nombres = ids.map(function (x) { var it = itemDe(x); return it ? (it.titulo || x) : x; });
      await db().rpc('comentar', { p: { proyecto_id: p.id, texto: (rech ? 'No aceptado' : 'Detenido') + (alc === 'todo' ? ' (proyecto completo)' : ': ' + nombres.join(', ')) + '. ' + txt } });
      if (recon) {   // la misma alta de tareas del CRM (nueva_tarea)
        var tk = await db().rpc('nueva_tarea', { p: { title: 'Recontactar a ' + (p.empresa || p.nombre || p.id), detail: txt, clientId: p.empresa_id, projectId: p.id, priority: 'Media', assignees: reconQ, due: recon } });
        if (tk.error) toast('Se detuvo, pero no se creó la tarea de recontacto: ' + tk.error.message, 'err'); else toast('Tarea de recontacto para el ' + ff(recon), 'ok');
      }
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
    // Mockup o propuesta: una fila en entregables, con su URL
    var altaEnt = async function (id) {
      var okE = await modal('Mockup o propuesta · ' + (proy(id).nombre || id),
        '<div class="fg"><label class="fl" for="en-tipo">Tipo</label><select class="fc" id="en-tipo"><option>Mockup</option><option>Propuesta comercial</option><option>Demo</option><option>Aplicación</option></select></div>' +
        '<div class="fg"><label class="fl" for="en-tit">Título <span class="req">*</span></label><input class="fc" id="en-tit"></div>' +
        '<div class="fg"><label class="fl" for="en-url">URL <span class="req">*</span></label><input class="fc" id="en-url" placeholder="https://…"></div>', 'Guardar',
        function () { return !document.getElementById('en-tit').value.trim() ? 'Poné un título' : !/^https?:\/\/\S+$/i.test(document.getElementById('en-url').value.trim()) ? 'La URL tiene que empezar con https://' : ''; });
      if (!okE) return;
      var ti = document.getElementById('en-tipo').value, tt = document.getElementById('en-tit').value.trim();
      var rE = await db().from('entregables').insert({ proyecto_id: id, titulo: tt, tipo: ti, estado: 'activo', accesos: [{ tipo: ti, nombre: tt, url: document.getElementById('en-url').value.trim() }] });
      if (rE.error) return toast(rE.error.message, 'err');
      toast('Guardado', 'ok'); refrescar();
    };
    // Renovar: un mantenimiento nuevo con sus alertas, montos y ajustes; el anterior queda finalizado con sus cobros
    var renovar = async function (id) {
      var it = itemDe(id);
      var ok = await modal('Renovar · ' + (it.titulo || id),
        '<div class="g2"><div class="fg"><label class="fl" for="rn-m">Meses</label><input class="fc u-tr ui-num" type="number" min="1" id="rn-m" value="12"></div>' +
        '<div class="fg"><label class="fl" for="rn-c">Cuota mensual</label><input class="fc u-tr" type="number" data-monto id="rn-c" value="' + (Number(it.cuota_act) || Number(it.valor_cuota) || '') + '"></div></div>' +
        '<div class="u-s11-mt">Se crea un mantenimiento nuevo con sus alertas. El actual queda finalizado, con sus cobros.</div>', 'Renovar',
        function () { return !(Number(document.getElementById('rn-m').value) > 0) || !(Number(document.getElementById('rn-c').value) > 0) ? 'Poné los meses y la cuota' : ''; });
      if (!ok) return;
      hacer('renovar_mantenimiento', { did: id, duracion: Number(document.getElementById('rn-m').value), cuota_nueva: Number(document.getElementById('rn-c').value) }, function (r) { return 'Renovado: nueva línea ' + r.id; });
    };
    // Editar monto: lo aprobado; en un mantenimiento, la cuota mensual y los meses
    var edMonto = async function (id) {
      var it = itemDe(id), mant = esMant(it);
      var ok = await modal('Editar monto · ' + (it.titulo || id), mant
        ? '<div class="g2"><div class="fg"><label class="fl" for="em-c">Cuota mensual</label><input class="fc u-tr" type="number" data-monto id="em-c" value="' + (Number(it.cuota_act) || Number(it.valor_cuota) || '') + '"></div>' +
          '<div class="fg"><label class="fl" for="em-m">Meses</label><input class="fc u-tr ui-num" type="number" min="1" id="em-m" value="' + (Number(it.duracion) || 12) + '"></div></div>'
        : '<div class="fg"><label class="fl" for="em-t">Monto</label><input class="fc u-tr" type="number" data-monto id="em-t" value="' + (Number(it.total_ars) || '') + '"></div>', 'Guardar');
      if (!ok) return;
      hacer('editar_monto_aprobado', mant ? { did: id, cuota_nueva: Number(document.getElementById('em-c').value), duracion: Number(document.getElementById('em-m').value) } : { did: id, monto: Number(document.getElementById('em-t').value) }, 'Monto guardado');
    };
    var itemDe = function (iid) { var it = null; P.proys.some(function (p) { return (it = (p.items || []).find(function (x) { return x.id === iid; })); }); return it; };
    var cambiarEstado = async function (p, canon) {
      switch (canon) {
        case 'negociacion':
          if (!(await ask('¿Enviar la propuesta?\n\nEl proyecto pasa a Negociación. Los desarrollos siguen en Nuevo.', 'Enviar propuesta'))) return;
          return hacer('enviar_propuesta', { pid: p.id, fecha: null });
        case 'aprobado':                         // aprobar no es un cambio de estado: es decidir qué entró
          var dec = await abrirAprobar(p); if (!dec) return;
          return conDeshacer('Aprobar «' + (p.nombre || p.id) + '»', 'desarrollos', (p.items || []).map(function (it) { return it.id; }), function () {
            return Promise.resolve(hacer('aprobar_proyecto', { pid: p.id, decisiones: dec.dec, montos: dec.montos, inicios: dec.inicios, mants: dec.mants }, null, true)).then(function (r) {
              if (dec.fecha && dec.fecha !== isoMas(0)) return db().rpc('aprobacion_fecha', { pid: p.id, fecha: dec.fecha }).then(function () { return r; });   // la fecha real (18/11/2026)
              return r; });
          }, { tabla: 'proyectos', ids: [p.id] });
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
    P.acc = { arrancar: arrancar, corte: corte, estado: cambiarEstado };   // Editar proyecto usa las mismas acciones (20/11/2026)
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.id === 'pr-orden') { P.pr.orden = t.value; return pintar(el); }
      if (t.hasAttribute && t.hasAttribute('data-fsem')) return Number(t.value) > 0 ? hacer('desarrollo_semanas', { did: t.getAttribute('data-fsem'), semanas: Number(t.value) }, 'Duración guardada') : null;
      if (t.hasAttribute && t.hasAttribute('data-fcierre')) return t.value ? hacer('proyecto_cierre_probable', { pid: t.getAttribute('data-fcierre'), fecha: t.value }, 'Fecha de cierre guardada') : null;
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
      if (a === 'ent-nuevo') return altaEnt(id);
      if (a === 'fin-des') {
        var ffin = el.querySelector('[data-ffin="' + id + '"]');
        if (!ffin || !ffin.value) return toast('Elegí la fecha de fin', 'err');
        return hacer('fecha_desarrollo', { did: id, campo: 'fecha_fin', fecha: ffin.value }, 'Fecha de fin guardada');
      }
      if (a === 'nv-abrir') return abrirEditarProy(null);
      if (a === 'sem-des') { var fs = document.createElement('input'); fs.type = 'number'; fs.min = '1'; fs.className = 'ui-campo ui-num'; fs.style.width = '90px'; fs.placeholder = 'semanas'; fs.setAttribute('data-fsem', b.getAttribute('data-id')); fs.setAttribute('aria-label', 'Duración en semanas');
        b.replaceWith(fs); fs.focus(); return; }
      if (a === 'ajuste-des') return hacer('desarrollo_ajuste', { did: id, si: b.getAttribute('data-si') === '1' }, 'Ajuste por IPC actualizado');
      if (a === 'alta-abono') return altaAbono(el, proy(id));
      if (a === 'fechas-des') { var dx = (proy(P.f.id).items || []).find(function (x) { return x.id === id; }); if (dx) return fechasDes(el, dx); return; }
      if (a === 'ini-des') { var fd = document.createElement('input'); fd.type = 'date'; fd.className = 'ui-campo ui-num'; fd.setAttribute('data-fini', b.getAttribute('data-id')); fd.setAttribute('aria-label', 'Inicio del desarrollo');
        b.replaceWith(fd); fd.focus(); setTimeout(function () { var c = fd.parentNode && fd.parentNode.querySelector('.ui-ib'); if (c) c.click(); }, 60); return; }
      if (a === 'cierre-prob') { var fi = document.createElement('input'); fi.type = 'date'; fi.className = 'ui-campo ui-num'; fi.setAttribute('data-fcierre', b.getAttribute('data-id')); fi.setAttribute('aria-label', 'Cierre probable de negociación');
        b.replaceWith(fi); fi.focus(); setTimeout(function () { var c = fi.parentNode && fi.parentNode.querySelector('.ui-ib'); if (c) c.click(); }, 60); return; }
      if (a === 'nueva-cot') { location.hash = '#/cot/nuevo'; return; }   // Cotizador › Nuevo proyecto (16/11/2026)
      if (a === 'contactos') { var pc = proy(id); return abrirFichaEmpresa(pc.empresa_id, { onSave: refrescar }); }
      if (a === 'seg-contacto') { ev.preventDefault(); return abrirContacto(null, { empresa: proy(id).empresa_id, onSave: refrescar }); }
      if (a === 'nota-foco') { ev.preventDefault(); var nf = el.querySelector('[data-segnota="' + id + '"]'); if (nf) { nf.focus(); nf.scrollIntoView({ block: 'center' }); } return; }
      if (a === 'volver') { P.sub = P.prev || 'seg'; return pintar(el); }
      if (a === 'nav') {
        var L = P.fLista, k = (L.indexOf(P.f.id) + Number(b.getAttribute('data-dir')) + L.length) % L.length;
        return abrirFicha(el, L[k], P.prev);
      }
      if (a === 'ren-mant') { ev.preventDefault(); return renovar(id); }
      if (a === 'ed-monto') return edMonto(id);
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
        P.inline = id;
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
  // Nuevo proyecto también se abre desde otras vistas: el mismo modal (20/11/2026)
  window.abrirNuevoProyecto = function () { abrirEditarProy(null); };
})();

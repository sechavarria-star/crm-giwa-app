/* ══════════════════════════════════════════════════════════════════════
   vistas/cot.js · Cotizador · Nuevo proyecto y Borradores (03/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Migra _CotNuevo.html del Apps Script con la pantalla aprobada «Carga
   modular». Las cuentas son de la base: estimar_desarrollo (horas, Tier,
   precio, dificultad, costo) y las cot_* (guardar, crear, borrar, leer).
   Acá sólo se arma la cotización y se muestra lo que devuelve el motor.
     · Borrador: proyecto + desarrollos + minuta; no escribe horas ni costos.
     · Crear: pasa a Prospecto y escribe horas, costos y la tarea de integración.
     · Aprobar, enviar y no aceptar se hacen en Proyectos (un solo flujo).
   Por desarrollo: Incluye (Mantenimiento propio o compartido, Entrega,
   Seguimiento, Costos de terceros), Funcionalidades (cuestionario Sí / No /
   Por definir, nota, cantidad, etapa futura, buscar) y Lo que suma.
   En la reunión: minuta o README, tildar desde el texto (función cot-interpretar).
   Reutilizar: un proyecto anterior para otra empresa, en un solo modal.
   El alta se guarda sola en este navegador hasta que se graba.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var C = { ini: null, cat: {}, sub: 'lista', ver: null };   // ini = cot_inicio · cat = catálogo por tipo
  var CN = null, _t = {}, POP = '';
  var LS = 'cot-alta-v2';
  var INCLUYE = [['Entrega', 'Entrega'], ['Seguimiento y reportes', 'Seguimiento']];   // bloques que van en «Incluye», no en el cuestionario
  var ETAPAS = ['Diseño', 'Configuración', 'Pruebas', 'Producción'];
  var MIN = [['problema', 'Problema'], ['situacion', 'Situación actual'], ['objetivo', 'Objetivo'], ['acuerdos', 'Acuerdos'],
             ['pendientes', 'Pendientes'], ['proximos', 'Próximos pasos'], ['decision', 'Fecha de decisión']];
  var TER_CAT = ['Canales', 'Consumo (IA)', 'Infraestructura', 'Licencia'];
  var RESP = [['Sí', 'check', 'Sí'], ['No', 'cerrar', 'No'], ['Pendiente', 'arena', 'Por definir']];

  // ── datos ────────────────────────────────────────────────────
  async function rpc(fn, args) { var r = await db().rpc(fn, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
  async function cargar() { C.ini = await rpc('cot_inicio'); }
  async function catalogo(tipo) {
    if (!tipo || C.cat[tipo]) return;
    var r = await db().from('catalogo_modulos').select('id,padre,bloque_comercial,pregunta,nombre,horas_base,factor,es_por_instancia,efecto,nivel,sugerido,etapa,orden')
      .eq('tipo_desarrollo_id', tipo).eq('activo', true).order('orden');
    if (r.error) throw new Error(r.error.message);
    C.cat[tipo] = r.data.map(function (m) { return { id: m.id, padre: m.padre || '', bloque: m.bloque_comercial || 'Otros', pregunta: m.pregunta || '', nombre: m.nombre || '',
      horas: Number(m.horas_base) || 0, factor: Number(m.factor) || 1, instancia: !!m.es_por_instancia, efecto: m.efecto || '', nivel: m.nivel || '',
      sugerido: !!m.sugerido, etapa: m.etapa || '' }; });
  }

  // ── la cotización en memoria (mismos campos que el Apps Script) ──
  function vacio() { return { id: '', tipo: '', titulo: '', objetivo: '', mejora: false, r: {}, cant: {}, etapa: {}, notas: {}, ext: {}, base: {}, na: {}, precio: 0,
    moneda: 'ARS', forma_pago: '', mant: { on: false, id: '', hs: 6, exc: 0, ipc: true, abono: 0, manual: false, comparte: null }, est: null, ref: null }; }
  function nuevo() { return { pid: '', estado: 'Borrador', empresa: '', nombre: '', sponsors: [], owners: [], minuta: {}, devs: [], i: 0, borrados: [] }; }
  function dev() { return CN.devs[CN.i]; }
  function mods(v) { return (v && C.cat[v.tipo]) || []; }
  function mod(v, id) { return mods(v).filter(function (m) { return m.id === id; })[0] || null; }
  function hijas(v, id) { return mods(v).filter(function (m) { return m.padre === id; }); }
  function raices(v) { var ids = {}; mods(v).forEach(function (m) { ids[m.id] = 1; }); return mods(v).filter(function (m) { return !(m.padre && ids[m.padre]); }); }
  function esBase(m) { return m.nivel === 'base'; }
  function si(v, id) { return v.r[id] === 'Sí'; }
  function est(v, id) { var r = v.r[id]; if (r === 'Sí') return v.etapa[id] === 'futura' ? 'Futura' : 'Sí'; return r || ''; }
  function nom(m) { return (m.nombre || '').split('·').pop().trim() || m.pregunta || ''; }
  function sel(v) { var s = {}; Object.keys(v.r).forEach(function (id) { if (v.r[id] === 'Sí' && v.etapa[id] !== 'futura') s[id] = true; }); return s; }
  // Una opción sólo cuenta si su madre está en Sí: lo que llega sin madres (README, Reutilizar, alta) se completa acá
  function conMadres(v) { Object.keys(v.r).forEach(function (id) { if (v.r[id] !== 'Sí') return; var m = mod(v, id);
    while (m && m.padre) { var q = mod(v, m.padre); if (!q) break; if (!v.r[q.id]) v.r[q.id] = 'Sí'; m = q; } }); }
  function vh(v) { return (v && v.est && v.est.valor_hora) || 0; }
  function sugerido(v) { return v && v.est ? Math.round(v.est.horas * vh(v)) : 0; }
  function total(v) { return v.precio > 0 ? v.precio : sugerido(v); }
  function propio(v) { return v.mant.on && (v.mant.comparte == null || v.mant.comparte === ''); }
  function tc() { return (C.ini && C.ini.valores.tc) || 0; }
  function soporte() { return (C.ini && C.ini.valores.soporte) || 0; }
  function usd(n) { return tc() && n ? '<span class="ui-num ui-p-usd">' + fmt(n / tc(), 'USD') + '</span>' : ''; }
  // Abono sugerido (regla de oro 22/10): 5 h + 0,5 WhatsApp + 0,5 Instagram + 1 integración, una vez cada uno
  function mantHs(v) {
    var V = C.ini.valores, R = C.ini.reglas, ids = Object.keys(sel(v)), hay = function (l) { return (l || []).some(function (x) { return ids.indexOf(x) >= 0; }); };
    return Math.round((V.mant_base + (hay(R.wa) ? V.mant_canal : 0) + (hay(R.ig) ? V.mant_canal : 0) + (hay(R.rw) ? V.mant_integ : 0)) * 100) / 100;
  }
  function horasDe(v, id) {
    var m = mod(v, id); if (!m || !si(v, id) || v.etapa[id] === 'futura') return 0;
    return m.horas * m.factor * (m.instancia ? (v.cant[id] || 1) : 1) + hijas(v, id).reduce(function (s, x) { return s + horasDe(v, x.id); }, 0);
  }
  function madreIncluye(v, b) { return raices(v).filter(function (m) { return m.bloque === b; })[0] || null; }
  // Pendiente = Por definir, o una madre en Sí con opciones sin contestar
  function pend(v) { return mods(v).filter(function (m) { if (v.r[m.id] === 'Pendiente') return true; var hs = hijas(v, m.id); return si(v, m.id) && hs.length && !hs.some(function (x) { return est(v, x.id); }); }); }
  function items(x) { return !x ? [] : (x.items || (x.cid ? [{ cid: x.cid, cantidad: x.cantidad || 1 }] : [])); }
  function precioC(c) { return c ? (Number(c.ars) || Number(c.usd) * tc()) : 0; }
  function extTot(x) { var L = C.ini.contrataciones; return Math.round(items(x).reduce(function (s, y) { var c = L.filter(function (k) { return k.id === y.cid; })[0]; return s + precioC(c) * (y.cantidad || 0); }, 0)); }
  function extMes(v, paga) {
    var t = 0;
    Object.keys(v.ext).forEach(function (id) { var x = v.ext[id];
      if ((id !== '_terceros' && (!si(v, id) || v.etapa[id] === 'futura')) || (x.paga === 'GIWA') !== (paga === 'GIWA')) return; t += extTot(x); });
    return t;
  }
  function empresa() { return (C.ini.empresas || []).filter(function (e) { return e.id === CN.empresa; })[0] || null; }
  function tipoNom(id) { var t = (C.ini.tipos || []).filter(function (x) { return x.id === id; })[0]; return t ? t.nombre : id; }

  // El motor (estimar_desarrollo), con un respiro para no llamar en cada tilde
  function estimar(i) {
    clearTimeout(_t[i]);
    _t[i] = setTimeout(async function () {
      var v = CN.devs[i]; if (!v || !v.tipo) return;
      try {
        v.est = await rpc('estimar_desarrollo', { tipo: v.tipo, empresa_id: CN.empresa || '', opts: { sel: sel(v), cant: v.cant, mejora: !!v.mejora } });
        if (!v.est.ok) { v.err = v.est.msg; v.est = null; } else v.err = '';
        if (v.est && !v.mant.manual) { v.mant.hs = mantHs(v); v.mant.abono = Math.round(v.mant.hs * soporte()); }
        v.mant.exc = Math.round(soporte());
        var ids = ((v.est && v.est.detalle) || []).map(function (d) { return d.id; });
        v.ref = ids.length ? await rpc('cot_referencia', { tipo: v.tipo, ids: ids, pid: CN.pid || '' }) : null;
      } catch (e) { v.err = e.message; v.est = null; }
      repintar(); auto();
    }, 300);
  }

  // ── pintar ───────────────────────────────────────────────────
  function pintar(el) {
    if (_montado !== 'cot') return;
    var tabs = uiTabs([['lista', 'Borradores y prospectos', 'data-cot="sub" data-s="lista"'], ['reunion', 'En la reunión', 'data-cot="sub" data-s="reunion"'], ['nuevo', CN && CN.pid ? 'Editar ' + CN.pid : 'Nuevo proyecto', 'data-cot="sub" data-s="nuevo"']],
                      C.sub === 'ver' ? 'lista' : C.sub);
    var cuerpo = C.sub === 'nuevo' ? htmlEditor() : C.sub === 'ver' ? htmlVer() : C.sub === 'reunion' ? htmlReunion() : htmlLista();
    el.innerHTML = uiHd('Cotizador', 'Cotizar un proyecto por funcionalidad, guardarlo como borrador y crearlo como prospecto.',
      uiBtn('Reutilizar proyecto', 'repetir', 's', 'data-cot="reutilizar"') + uiBtn('Carga rápida', 'mas', 's', 'data-cot="rapida"')) + tabs + '<div id="cot-c">' + cuerpo + '</div>';
  }
  function repintar() { var c = document.getElementById('cot-c'); if (!c || C.sub !== 'nuevo') return; c.innerHTML = htmlEditor(); if (abierto('m-fun')) funPintar(); }
  function abierto(id) { var m = document.getElementById(id); return !!(m && m.classList.contains('open')); }

  // Borradores y Prospectos (los que todavía se editan acá)
  function htmlLista() {
    var L = C.ini.lista || [];
    var tabla = function (arr, vacioTxt) {
      if (!arr.length) return '<div class="ui-nota-t">' + vacioTxt + '</div>';
      return '<table class="ui-tbl"><thead><tr><th>Proyecto</th><th>Empresa</th><th>Estado</th><th class="ui-r">Creado</th><th class="ui-r">Implementación</th><th></th></tr></thead><tbody>' +
        arr.map(function (p) { var id = esc(p.id);
          return '<tr><td>' + esc(p.nombre) + ' <span class="ui-nota-t ui-num">' + id + '</span></td><td>' + esc(p.empresa || '') + '</td><td>' + uiEstado(p.estado) + '</td>' +
            '<td class="ui-num ui-r">' + (ff(p.fecha) || '') + '</td><td class="ui-r">' + fmt(p.total) + '</td>' +
            '<td><span class="ui-fila-ic">' + uiIb('ficha', 'Ver', '', 'data-cot="ver" data-id="' + id + '"') + uiAcc('editar', 'data-cot="editar" data-id="' + id + '"') +
              uiIb('borrar', p.borrador ? 'Descartar el borrador' : 'Borrar', 'bor', 'data-cot="borrar" data-id="' + id + '"') + '</span></td></tr>'; }).join('') + '</tbody></table>';
    };
    return uiDesp({ t: 'Borradores', n: L.filter(function (p) { return p.borrador; }).length, open: true }, tabla(L.filter(function (p) { return p.borrador; }), 'No hay borradores.')) +
      uiDesp({ t: 'Prospectos y en negociación', n: L.filter(function (p) { return !p.borrador; }).length, open: true },
        tabla(L.filter(function (p) { return !p.borrador; }), 'No hay prospectos sin aprobar.') +
        '<div class="ui-nota-t ui-rapido">Aprobar, enviar la propuesta o no aceptar se hacen desde Proyectos.</div>');
  }

  // ── Editor: Nuevo proyecto (Carga modular) ──
  function htmlEditor() {
    if (!CN) CN = recuperar() || nuevo();
    var e = empresa(), alta = !CN.pid, ds = CN.devs.filter(function (d) { return d.tipo; });
    var tot = ds.reduce(function (s, d) { return s + total(d); }, 0), ab = ds.reduce(function (s, d) { return s + (propio(d) ? d.mant.abono || 0 : 0); }, 0);
    var npend = ds.reduce(function (s, d) { return s + pend(d).length; }, 0);
    var acc = uiBtn('Minuta', 'documento', 's', 'data-cot="minuta"') +
      (alta ? uiBtn('Guardar borrador', 'guardar', 's', 'data-cot="guardar"') + uiBtn('Crear proyecto', 'check', 'p', 'data-cot="crear"') + uiIb('borrar', 'Descartar lo cargado', 'bor', 'data-cot="descartar"')
            : uiBtn('Guardar cambios', 'guardar', 's', 'data-cot="guardar"') + (CN.estado === 'Borrador' ? uiBtn('Crear proyecto', 'check', 'p', 'data-cot="crear"') : '') +
              uiIb('borrar', 'Borrar el proyecto', 'bor', 'data-cot="borrar" data-id="' + esc(CN.pid) + '"'));
    var h = '<div class="ui-ficha-hd"><span>' + uiEstado(alta ? 'Prospecto' : CN.estado, { nombre: alta ? 'Nuevo' : CN.estado }) + '</span>' +
      (npend ? '<span class="ui-st ui-p-pendiente" data-tip="Preguntas por definir u opciones sin contestar">' + uiIco('arena') + npend + ' pendiente' + (npend === 1 ? '' : 's') + '</span>' : '') +
      '<span class="ui-acc-est ui-fila-ic">' + acc + '</span></div>' +
      (alta ? '<div class="ui-nota-t">Se guarda solo en este navegador hasta que toques Guardar borrador o Crear proyecto.</div>' : '');
    // Datos del cliente
    var cs = (C.ini.contactos || []).filter(function (c) { return c.empresa === CN.empresa; });
    var sp = CN.sponsors.map(function (id, i) { var c = cs.filter(function (x) { return x.id === id; })[0] || { nombre: id }, t = telWa(c.tel);
      return '<div class="ui-linea"><span class="ui-f1">' + esc(c.nombre) + '</span>' + (t ? '<a class="ui-ib ui-wa" href="https://wa.me/' + t + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
        uiIb('cerrar', 'Quitar', '', 'data-cot="sp-quitar" data-i="' + i + '"') + '</div>'; }).join('');
    var ow = CN.owners.map(function (m, i) { var u = (C.ini.usuarios || []).filter(function (x) { return x.mail === m; })[0];
      return '<div class="ui-linea"><span class="ui-f1">' + esc(u ? u.nombre : m) + '</span>' + uiIb('cerrar', 'Quitar', '', 'data-cot="ow-quitar" data-i="' + i + '"') + '</div>'; }).join('');
    var cliente = '<div class="g2"><div class="fg"><label class="fl" for="cot-emp">Empresa <span class="req">*</span></label><select class="fc" id="cot-emp"><option value="">— Empresa —</option>' +
        C.ini.empresas.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === CN.empresa ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select>' +
        (e ? '<div class="u-s11-mt">' + uiTier(e.tier) + ' × <span class="ui-num">' + String(e.mult).replace('.', ',') + '</span></div>' : '') + '</div>' +
      '<div class="fg"><label class="fl" for="cot-nom">Título del proyecto <span class="req">*</span></label><input class="fc" id="cot-nom" value="' + esc(CN.nombre) + '"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="cot-sp">Sponsors</label><select class="fc" id="cot-sp"><option value="">' + (CN.empresa ? '+ Agregar sponsor' : 'Elegí la empresa') + '</option>' +
          cs.filter(function (c) { return CN.sponsors.indexOf(c.id) < 0; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>'; }).join('') + '</select>' + sp +
          (CN.empresa ? '<button type="button" class="ui-lnk ui-azul" data-cot="contacto">+ Contacto nuevo</button>' : '') + '</div>' +
        '<div class="fg"><label class="fl" for="cot-ow">Responsables</label><select class="fc" id="cot-ow"><option value="">+ Agregar responsable</option>' +
          (C.ini.usuarios || []).filter(function (u) { return CN.owners.indexOf(u.mail) < 0; }).map(function (u) { return '<option value="' + esc(u.mail) + '">' + esc(u.nombre) + '</option>'; }).join('') + '</select>' + ow + '</div></div>' +
      '<div class="fg"><div class="u-row8"><label class="fl u-f1" for="cot-min">Minuta de reunión · resumen ejecutivo</label>' +
        uiIb('buscar', 'Buscar una minuta guardada', '', 'data-cot="min-buscar"') + '</div><textarea class="fc" id="cot-min" rows="3">' + esc(CN.minuta.texto || '') + '</textarea></div>';
    h += uiDesp({ t: 'Datos del cliente', open: true }, cliente);
    // Desarrollos
    var lista = ds.length ? CN.devs.map(function (d, i) { return d.tipo ? tarjetaDev(d, i) : ''; }).join('') : '<div class="ui-nota-t">Todavía no hay desarrollos. Tocá «Nuevo desarrollo».</div>';
    h += uiDesp({ t: 'Desarrollos', n: ds.length, open: true, v: '<span class="ui-num">' + fmt(tot) + '</span>' + (ab ? ' · <span class="ui-num ui-p-abono">' + fmt(ab) + '/mes</span>' : '') },
      lista + '<div class="ui-barra">' + uiBtn('Nuevo desarrollo', 'mas', 's', 'data-cot="dev-nuevo"') + '</div>');
    return '<div class="ui-cols"><div>' + h + '</div><div>' + lateral(dev()) + '</div></div>';
  }
  // Un desarrollo: tipo, título, alcance y precio; el elegido muestra lo que incluye
  function tarjetaDev(d, i) {
    var on = i === CN.i;
    var h = '<div class="ui-dev' + (on ? ' open' : '') + '" data-cot="dev-ir" data-i="' + i + '">' +
      '<span class="ui-dev-barra ui-e-prospecto"></span><span class="ui-ch">' + uiIco('derecha') + '</span><span class="ui-tipo ui-e-prospecto">' + uiIco('tablero') + '</span>' +
      '<div><div class="ui-dev-n">' + esc(tipoNom(d.tipo)) + ' · ' + esc(d.titulo || 'Sin título') + (d.mejora ? ' <span class="ui-nota-t">· mejora</span>' : '') + '</div>' +
        '<div class="ui-sub-t">' + esc(d.objetivo || 'Sin alcance') + '</div></div>' +
      '<div class="ui-dev-der"><span class="ui-num">' + (d.est ? fmt(total(d)) : '…') + '</span><span class="ui-fila-ic">' + uiAcc('editar', 'data-cot="dev-editar" data-i="' + i + '"') + '</span></div></div>';
    return h + (on ? '<div class="ui-devc">' + incluye(d) + '</div>' : '');
  }
  // Incluye: Mantenimiento, Entrega, Seguimiento, Costos de terceros y Funcionalidades; el sistema externo y Meta, siempre a la vista
  function incluye(v) {
    var linea = function (on, nombre, col, dato, suma, acc, tip) {
      return '<div class="ui-linea"><label class="u-row6"><input type="checkbox"' + (on ? ' checked' : '') + ' data-cot-ck="' + acc + '"> <span class="' + col + '">' + nombre + '</span></label>' +
        '<span class="ui-f1 ui-nota-t">' + (on ? dato : '') + '</span>' + (on ? '<span class="ui-num ' + col + '">' + suma + '</span>' + uiAcc('editar', 'data-cot="' + acc + '"').replace('data-tip="Editar"', 'data-tip="' + esc(tip) + '"') : '') + '</div>';
    };
    var mt = v.mant, cmp = mt.on && !propio(v) ? CN.devs[mt.comparte] : null;
    var h = linea(mt.on, 'Mantenimiento', 'ui-p-abono', cmp ? 'compartido con ' + esc(cmp.titulo || tipoNom(cmp.tipo))
        : '<span class="ui-num">' + mt.hs + '</span> h por mes · monitoreo, reunión mensual, análisis y ajustes · IPC cada <span class="ui-num">3</span> meses',
      cmp ? '—' : fmt(mt.abono || 0) + '/mes', 'mant', 'Editar el mantenimiento');
    INCLUYE.forEach(function (b) {
      var m = madreIncluye(v, b[0]); if (!m) return;
      var on = si(v, m.id), hs = on ? horasDe(v, m.id) : 0, hs2 = hijas(v, m.id).filter(function (x) { return si(v, x.id); }).map(nom);
      h += linea(on, b[1], 'ui-e-aprobado', (hs2.length ? esc(hs2.join(' · ')) : 'sin opciones elegidas') + ' · <span class="ui-num">' + (Math.round(hs * 10) / 10) + '</span> h',
        fmt(Math.round(hs * vh(v))), 'inc:' + m.id, 'Elegir qué incluye');
    });
    var tx = v.ext._terceros, nT = items(tx).length;
    h += linea(!!tx, 'Costos de terceros', 'ui-p-usd', nT + ' servicio' + (nT === 1 ? '' : 's') + ' · paga ' + (tx && tx.paga === 'GIWA' ? 'GIWA' : 'el cliente'),
      fmt(extTot(tx)) + '/mes', 'ter', 'Elegir servicios y quién paga');
    var fs = Object.keys(sel(v)).filter(function (id) { var m = mod(v, id); return m && m.horas > 0 && !esBase(m) && !INCLUYE.some(function (b) { return b[0] === m.bloque; }); });
    var fh = fs.reduce(function (s, id) { var m = mod(v, id); return s + m.horas * m.factor * (m.instancia ? (v.cant[id] || 1) : 1); }, 0);
    var sinResp = bloques(v).filter(function (b) { return faltan(v, b).length; }).length;
    h += '<div class="ui-linea"><span class="ui-f1">Funcionalidades · <span class="ui-num">' + fs.length + '</span> tildada' + (fs.length === 1 ? '' : 's') + ' · <span class="ui-num">' + (Math.round(fh * 10) / 10) + '</span> h' +
      (sinResp ? ' · <span class="ui-p-pendiente"><span class="ui-num">' + sinResp + '</span> secciones sin responder</span>' : '') + '</span>' + uiBtn('Abrir cuestionario', 'lista', 's', 'data-cot="fun"') + '</div>';
    // Siempre a la vista: el sistema externo (nombre y API) y la cuenta de Meta
    var R = C.ini.reglas, integ = (R.integ || []).filter(function (id) { return si(v, id); })[0];
    if (integ) {
      var sinApi = hijas(v, integ).filter(function (x) { return /api/i.test(x.pregunta + ' ' + x.nombre); })[0];
      h += '<div class="ui-linea-sub"><span>Sistema de la empresa: <b>' + esc(v.notas[integ] || 'falta el nombre (anotalo en la nota)') + '</b> · ' +
        (sinApi ? (si(v, sinApi.id) ? 'no tiene API' : v.r[sinApi.id] === 'No' ? 'tiene API' : '<span class="ui-p-pendiente">falta confirmar si tiene API</span>') : '') + '</span></div>';
    }
    var wa = (R.wa || []).filter(function (id) { return si(v, id); })[0];
    if (wa) {
      var meta = hijas(v, wa).filter(function (x) { return /meta/i.test(x.pregunta + ' ' + x.nombre); })[0];
      if (meta && est(v, meta.id) !== 'No') h += '<div class="ui-linea-sub"><span class="ui-p-pendiente">' + (si(v, meta.id) ? 'La cuenta de Meta no está verificada: puede atrasar la puesta en marcha'
        : 'Pendiente: confirmar si la cuenta de Meta está verificada (puede atrasar la puesta en marcha)') + '</span></div>';
    }
    return h;
  }
  // Lo que suma: la composición del precio del desarrollo elegido y lo que queda pendiente
  function lateral(v) {
    if (!v || !v.tipo) return '<div class="ui-lat-h">Lo que suma</div><div class="ui-nota-t">Cargá un desarrollo.</div>';
    if (v.err) return uiAviso(v.err, 'adv');
    var e = v.est; if (!e) return '<div class="ui-lat-h">Lo que suma</div><div class="ui-nota-t">Calculando…</div>';
    var kv = function (l, x, cls) { return '<div class="ui-kv">' + l + '<span class="ui-num' + (cls ? ' ' + cls : '') + '">' + x + '</span></div>'; };
    var porE = {}; (e.detalle || []).forEach(function (d) { porE[d.etapa] = (porE[d.etapa] || 0) + Number(d.horas); });
    var fut = mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] === 'futura'; }), p = pend(v);
    var integ = (C.ini.reglas.integ || []).filter(function (id) { return si(v, id); }).map(function (id) { return v.notas[id] || nom(mod(v, id)); });
    var r = v.ref, h = '<div class="ui-lat-h">Lo que suma</div>';
    if (!CN.empresa) h += '<div class="ui-nota-t">Sin cliente el precio va sin Tier (×1). Elegí la empresa.</div>';
    if (r) { var pct = r.cobrado ? Math.round((total(v) / r.cobrado - 1) * 1000) / 10 : 0;
      h += '<div class="ui-nota-t">Parecido a lo que ya cotizaste: <b>' + esc(r.cliente || '') + ' · ' + esc(r.que || '') + '</b> · <span class="ui-num">' + r.horas + '</span> h · cobrado <span class="ui-num">' + fmt(r.cobrado) + '</span>' +
        (r.mmr ? ' · abono <span class="ui-num">' + fmt(r.mmr) + '/mes</span>' : '') + '. Éste va <span class="ui-num">' + String(Math.abs(pct)).replace('.', ',') + ' %</span> ' + (pct >= 0 ? 'por encima.' : 'por debajo.') + '</div><br>'; }
    h += kv('Valor hora · ' + esc(e.tier || 'sin Tier'), fmt(Math.round(vh(v)))) + kv('Sugerido · ' + (Math.round(e.horas * 10) / 10) + ' h', fmt(sugerido(v))) +
      kv('Precio final', fmt(total(v)), 'ui-p-contratado') + (propio(v) ? kv('Abono · ' + v.mant.hs + ' h por mes', fmt(v.mant.abono || 0), 'ui-p-abono') : '') +
      ETAPAS.map(function (k) { return porE[k] ? kv('· ' + k, (Math.round(porE[k] * 10) / 10) + ' h') : ''; }).join('') +
      kv('Dificultad', esc(e.dificultad)) + kv('Costo interno', fmt(e.costo_ars)) +
      kv('Costos del cliente por mes', fmt(extMes(v, 'Cliente'))) + kv('Costos nuestros por mes', fmt(extMes(v, 'GIWA')));
    if (CN.devs.filter(function (d) { return d.tipo; }).length > 1) h += kv('Total del proyecto', fmt(CN.devs.reduce(function (s, d) { return s + (d.tipo ? total(d) : 0); }, 0)), 'ui-p-contratado');
    h += '<div class="ui-lat-h u-mt10">Integraciones</div><div class="u-s11">' + (integ.length ? esc(integ.join(' · ')) : 'Ninguna') + '</div>';
    h += '<div class="ui-lat-h u-mt10">Etapa futura</div><div class="u-s11">' + (fut.length ? esc(fut.map(nom).join(' · ')) : 'Nada por ahora') + '</div>';
    if (p.length) h += '<div class="ui-lat-h u-mt10 ui-p-pendiente">Pendientes · ' + p.length + '</div><div class="u-s11">' + esc(p.map(function (m) { return m.pregunta || nom(m); }).join(' · ')) + '</div>';
    return h;
  }

  // ── Cuestionario (Funcionalidades): Preguntas · Respuestas · Lo que suma ──
  function bloques(v) { var o = []; raices(v).forEach(function (m) { if (!esBase(m) && !INCLUYE.some(function (b) { return b[0] === m.bloque; }) && o.indexOf(m.bloque) < 0) o.push(m.bloque); }); return o; }
  function madresDe(v, b) { return raices(v).filter(function (m) { return m.bloque === b && !esBase(m); }); }
  function faltan(v, b) { return v.na[b] ? [] : madresDe(v, b).filter(function (m) { var s = est(v, m.id); return !s || s === 'Pendiente'; }); }
  function funAbrir() {
    var v = dev(); if (!v || !v.tipo) return aviso('Cargá un desarrollo.');
    var m = modal('m-fun', 'Funcionalidades · ' + tipoNom(v.tipo) + ' · ' + (v.titulo || 'Sin título'), '<div id="fun-b"></div>',
      '<button class="btn bp" data-cerrar="m-fun">Listo</button>', 'md-xl');
    m.onclick = clickFun; m.onchange = changeFun; m.oninput = function (ev) { if (ev.target.id === 'fun-bus') buscar(ev.target.value); };
    funPintar();
  }
  function funPintar() {
    var b = document.getElementById('fun-b'), v = dev(); if (!b || !v) return;
    var ab = {}; b.querySelectorAll('[data-bl]').forEach(function (d) { ab[d.getAttribute('data-bl')] = d.classList.contains('open'); });
    var bus = (document.getElementById('fun-bus') || {}).value || '';
    var base = raices(v).filter(esBase), hB = base.reduce(function (s, m) { return s + (si(v, m.id) ? m.horas * m.factor : 0); }, 0);
    var bl = bloques(v), primero = bl.filter(function (x) { return faltan(v, x).length; })[0];
    var preg = '<input class="ui-campo" id="fun-bus" placeholder="Buscar en el cuestionario…" aria-label="Buscar" value="' + esc(bus) + '"><br><br>' +
      uiDesp({ t: 'Base del agente · siempre incluida', n: (Math.round(hB * 10) / 10) + ' h', attrs: 'data-bl="__base"', open: !!ab.__base },
        base.map(function (m) { return '<div class="ui-linea"><label class="u-row6 ui-f1"><input type="checkbox"' + (si(v, m.id) ? ' checked' : '') + ' data-resp="' + esc(m.id) + '" data-k="base"> ' + esc(nom(m)) + '</label>' +
          '<span class="ui-num ui-nota-t">' + (Math.round(m.horas * m.factor * 10) / 10) + ' h</span></div>'; }).join('')) +
      bl.map(function (x, i) {
        var f = faltan(v, x), ok = !f.length, ms = madresDe(v, x), n = ms.length - f.length;
        var open = ab[x] !== undefined ? ab[x] : (!ok && x === primero);
        return uiDesp({ t: (i + 1) + '. ' + x, n: ok ? 'Listo' : n + '/' + ms.length, open: open, attrs: 'data-bl="' + esc(x) + '"' },
          v.na[x] ? uiBtn('Reabrir', 'repetir', 's', 'data-fun="reabrir" data-b="' + esc(x) + '"')
            : ms.map(function (m, j) { return madre(v, m, (i + 1) + '.' + (j + 1)); }).join('') +
              (ok ? '' : '<div class="ui-barra">' + uiBtn('Omitir las de este bloque', 'cerrar', 's', 'data-fun="omitir" data-b="' + esc(x) + '"') + '</div>'));
      }).join('');
    b.innerHTML = '<div class="cot-fun"><div>' + preg + '</div><div>' + respuestas(v) + '</div><div>' + lateral(v) + '</div></div>';
    if (bus) buscar(bus);
  }
  // Una pregunta madre: Sí · No · Por definir; si es Sí o Por definir, sus opciones debajo; la nota abajo
  function madre(v, m, num) {
    var s = est(v, m.id), q = esc(m.id);
    var rad = RESP.map(function (k) { var on = s === k[0] || (k[0] === 'Sí' && s === 'Futura');
      return '<button type="button" class="ui-btn ui-s' + (on ? ' on' : '') + '" data-resp="' + q + '" data-k="' + (on ? '' : k[0]) + '" aria-pressed="' + on + '">' + uiIco(k[1]) + k[2] + '</button>'; }).join('');
    var abre = (s === 'Sí' || s === 'Futura' || s === 'Pendiente') && hijas(v, m.id).length;
    return '<div class="cot-q" data-txt="' + esc(((m.pregunta || '') + ' ' + m.nombre).toLowerCase()) + '"><div class="cot-q-t"><span class="ui-num ui-nota-t">' + num + '</span> ' + esc(m.pregunta || m.nombre) +
      (m.horas ? ' <span class="ui-num ui-nota-t">' + (Math.round(m.horas * m.factor * 10) / 10) + ' h</span>' : '') + '</div>' +
      '<div class="ui-barra">' + rad + '</div>' + ((s === 'Sí' || s === 'Futura') ? extras(v, m) : '') + (abre ? '<div class="cot-hijas">' + opciones(v, m.id, 1) + '</div>' : '') + nota(v, m) + '</div>';
  }
  function opciones(v, id, niv) {
    return hijas(v, id).map(function (m) { var on = si(v, m.id), hh = Math.round(m.horas * m.factor * 10) / 10;
      return '<div class="cot-op" style="--niv:' + niv + '"><label class="u-row6"><input type="checkbox"' + (on ? ' checked' : '') + ' data-resp="' + esc(m.id) + '" data-k="op"> ' +
        '<span class="ui-f1">' + esc(m.pregunta || m.nombre) + '</span>' + (hh ? '<span class="ui-num ui-nota-t">' + hh + ' h</span>' : '') + '</label>' +
        (on ? extras(v, m) + (m.efecto === 'Integración' || /sistema/i.test(m.nombre) ? nota(v, m) : '') + opciones(v, m.id, niv + 1) : '') + '</div>'; }).join('');
  }
  function nota(v, m) { return '<textarea class="fc cot-nota" rows="1" maxlength="500" placeholder="Nota…" data-nota="' + esc(m.id) + '">' + esc(v.notas[m.id] || '') + '</textarea>'; }
  // Cantidad (por instancia) y servicios o licencias con quién los paga
  function extras(v, m) {
    var h = '';
    if (m.instancia) h += '<div class="u-row8 u-s11-mt">Cantidad <input class="fc u-wauto" type="number" min="1" value="' + (v.cant[m.id] || 1) + '" data-cant="' + esc(m.id) + '"></div>';
    if (m.efecto === 'Licencia' || m.efecto === 'Integración') {
      var x = v.ext[m.id] || { paga: 'Cliente', items: [] }, L = C.ini.contrataciones;
      items(x).forEach(function (y, i) { var c = L.filter(function (k) { return k.id === y.cid; })[0]; if (!c) return;
        h += '<div class="u-row8 u-s11-mt"><span class="ui-f1">' + esc(c.producto) + '</span><input class="fc u-wauto" type="number" min="0" value="' + y.cantidad + '" data-extq="' + esc(m.id) + '" data-i="' + i + '">' +
          uiIb('cerrar', 'Quitar', '', 'data-fun="ext-quitar" data-id="' + esc(m.id) + '" data-i="' + i + '"') + '</div>'; });
      var cats = []; L.forEach(function (c) { if (cats.indexOf(c.categoria) < 0) cats.push(c.categoria); });
      h += '<div class="u-row8"><select class="fc ui-f1" data-extadd="' + esc(m.id) + '"><option value="">+ Agregar servicio o licencia</option>' +
        cats.map(function (k) { return '<optgroup label="' + esc(k || 'Otros') + '">' + L.filter(function (c) { return c.categoria === k; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.producto) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>' +
        (/app|web|crm|erp/i.test(v.tipo + ' ' + tipoNom(v.tipo)) || /portal|webapp|infra|hosting|base de datos/i.test(m.bloque + ' ' + m.nombre) ? uiBtn('Evaluar costos', 'buscar', 's', 'data-fun="eval" data-id="' + esc(m.id) + '"') : '') + '</div>';
      if (items(x).length) h += '<label class="u-row6 u-s11-mt"><input type="checkbox"' + (x.paga === 'GIWA' ? ' checked' : '') + ' data-extpaga="' + esc(m.id) + '"> Lo paga GIWA · <span class="ui-num">' + fmt(extTot(x)) + '/mes</span></label>';
    }
    return h;
  }
  // Respuestas: lo que define el alcance; cada Sí se puede pasar a etapa futura (sale del precio, queda en la minuta)
  function respuestas(v) {
    var horas = {}; ((v.est && v.est.detalle) || []).forEach(function (d) { horas[d.id] = (horas[d.id] || 0) + Number(d.horas); });
    var ico2 = { 'Sí': ['check', 'ui-e-finalizado'], 'No': ['cerrar', 'ui-nota-t'], 'Pendiente': ['arena', 'ui-p-pendiente'], 'Futura': ['calendario', 'ui-p-abono'] };
    var linea = function (m) { var s = est(v, m.id), ic = ico2[s] || ['cerrar', 'ui-nota-t'];
      return '<div class="ui-linea"><span class="' + ic[1] + '">' + uiIco(ic[0]) + '</span><span class="ui-f1">' + esc(nom(m)) + (m.instancia && v.cant[m.id] > 1 ? ' ×' + v.cant[m.id] : '') +
        (v.notas[m.id] ? '<div class="ui-nota-t">' + esc(v.notas[m.id]) + '</div>' : '') + '</span>' +
        '<span class="ui-num ui-nota-t">' + (s === 'Sí' ? (Math.round((horas[m.id] || 0) * 10) / 10) + ' h' : '') + '</span>' +
        (s === 'Sí' || s === 'Futura' ? uiIb('calendario', s === 'Futura' ? 'Volver a la 1ª etapa' : 'Pasar a una etapa futura', '', 'data-fun="futura" data-id="' + esc(m.id) + '"') : '') + '</div>'; };
    var por = {}, orden = [];
    raices(v).filter(function (m) { return est(v, m.id) && !esBase(m); }).forEach(function (m) {
      var L = [m]; var baja = function (x) { hijas(v, x.id).forEach(function (y) { if (est(v, y.id)) { L.push(y); baja(y); } }); }; baja(m);
      if (!por[m.bloque]) { por[m.bloque] = ''; orden.push(m.bloque); } por[m.bloque] += L.map(linea).join('');
    });
    return '<div class="ui-lat-h">Respuestas</div>' + (orden.length ? orden.map(function (b) { return '<div class="ui-lat-h u-mt10">' + esc(b) + '</div>' + por[b]; }).join('')
      : '<div class="ui-nota-t">Lo que respondas aparece acá: es el resultado de la minuta.</div>');
  }
  function buscar(t) {
    t = String(t || '').toLowerCase().trim();
    document.querySelectorAll('#fun-b [data-bl]').forEach(function (d) {
      if (d.getAttribute('data-bl') === '__base') return; var hay = false, cu = d.nextElementSibling;
      (cu ? cu.querySelectorAll('.cot-q') : []).forEach(function (q) { var ok = !t || q.getAttribute('data-txt').indexOf(t) >= 0 || q.textContent.toLowerCase().indexOf(t) >= 0; q.hidden = !ok; if (ok) hay = true; });
      d.hidden = !!t && !hay; if (cu) cu.hidden = !!t && !hay; if (t && hay) d.classList.add('open');
    });
  }
  // Responder: Sí / No / Por definir (madres) o tildar (opciones). Si la madre va a etapa futura, lo de abajo también.
  function limpiar(v, id) { hijas(v, id).forEach(function (x) { delete v.r[x.id]; delete v.etapa[x.id]; limpiar(v, x.id); }); }
  function futHijas(v, id, on) { hijas(v, id).forEach(function (x) { if (v.r[x.id] === 'Sí') { if (on) v.etapa[x.id] = 'futura'; else delete v.etapa[x.id]; } futHijas(v, x.id, on); }); }
  function madreFut(v, id) { var m = mod(v, id); while (m && m.padre) { if (v.etapa[m.padre] === 'futura') return true; m = mod(v, m.padre); } return false; }
  function responder(id, k) {
    var v = dev();
    if (!k) { delete v.r[id]; delete v.etapa[id]; limpiar(v, id); }
    else { v.r[id] = k; if (k === 'Sí' && madreFut(v, id)) v.etapa[id] = 'futura'; if (k !== 'Sí') { delete v.etapa[id]; limpiar(v, id); } }
    cambio();
  }
  function cambio() { if (abierto('m-fun')) funPintar(); repintar(); estimar(CN.i); auto(); }
  function clickFun(ev) {
    var b = ev.target.closest('[data-resp],[data-fun]'); if (!b || b.tagName === 'INPUT') return;
    var v = dev();
    if (b.hasAttribute('data-resp')) return responder(b.getAttribute('data-resp'), b.getAttribute('data-k'));
    var a = b.getAttribute('data-fun'), id = b.getAttribute('data-id');
    if (a === 'omitir') { v.na[b.getAttribute('data-b')] = true; return cambio(); }
    if (a === 'reabrir') { delete v.na[b.getAttribute('data-b')]; return cambio(); }
    if (a === 'futura') { var fu = v.etapa[id] === 'futura'; if (fu) delete v.etapa[id]; else v.etapa[id] = 'futura'; futHijas(v, id, !fu); return cambio(); }
    if (a === 'ext-quitar') { extSet(id, function (x) { x.items.splice(Number(b.getAttribute('data-i')), 1); }); return; }
    if (a === 'eval') return evaluar(id);
  }
  function changeFun(ev) {
    var t = ev.target, v = dev();
    if (t.hasAttribute('data-resp') && t.type === 'checkbox') return responder(t.getAttribute('data-resp'), t.checked ? 'Sí' : (t.getAttribute('data-k') === 'base' ? 'No' : ''));
    if (t.hasAttribute('data-nota')) { var id = t.getAttribute('data-nota'); if (t.value.trim()) v.notas[id] = t.value.trim(); else delete v.notas[id]; return cambio(); }
    if (t.hasAttribute('data-cant')) { v.cant[t.getAttribute('data-cant')] = Math.max(1, Number(t.value) || 1); return cambio(); }
    if (t.hasAttribute('data-extadd') && t.value) { var cid = t.value; return extSet(t.getAttribute('data-extadd'), function (x) { x.items.push({ cid: cid, cantidad: 1 }); }); }
    if (t.hasAttribute('data-extq')) { var i = Number(t.getAttribute('data-i')), n = Number(t.value) || 0; return extSet(t.getAttribute('data-extq'), function (x) { if (x.items[i]) x.items[i].cantidad = n; }); }
    if (t.hasAttribute('data-extpaga')) { var g = t.checked; return extSet(t.getAttribute('data-extpaga'), function (x) { x.paga = g ? 'GIWA' : 'Cliente'; }); }
  }
  function extSet(id, fn) {
    var v = dev(), x = v.ext[id] || { paga: 'Cliente', items: [] }; x.items = items(x); fn(x);
    x.items = x.items.filter(function (y) { return y.cid && y.cantidad > 0; });
    if (x.items.length || id === '_terceros') v.ext[id] = x; else delete v.ext[id];
    cambio(); if (abierto('m-ter')) terPintar();
  }
  // «Evaluar costos» (calcularHerramientas): la más económica, una intermedia y la recomendada
  function evaluar(id) {
    var c = { categoria: 'Hosting', backend: true, db: true, evitar_tarjeta: false, presupuesto: 'Bajo', complejidad: 'Baja', costo_max: '' };
    var s = function (k, ops) { return '<select class="fc" data-ev="' + k + '">' + ops.map(function (o) { return '<option' + (c[k] === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'; };
    var ck = function (k, t) { return '<label class="u-row6 u-s11"><input type="checkbox" data-ev="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>'; };
    var m = modal('m-ev', 'Evaluar costos de infraestructura',
      '<div class="g2"><div class="fg"><label class="fl">Qué se busca</label>' + s('categoria', ['Hosting', 'Base de datos', 'App no-code', 'Automatización', 'IA']) + '</div>' +
      '<div class="fg"><label class="fl">Presupuesto</label>' + s('presupuesto', ['Bajo', 'Medio', 'Alto']) + '</div>' +
      '<div class="fg"><label class="fl">Complejidad</label>' + s('complejidad', ['Baja', 'Media', 'Alta']) + '</div>' +
      '<div class="fg"><label class="fl">Costo máximo USD por mes</label><input class="fc u-tr" type="number" min="0" data-ev="costo_max"></div></div>' +
      ck('backend', 'Necesita backend') + ck('db', 'Necesita base de datos') + ck('evitar_tarjeta', 'Evitar tarjeta (el cliente no tiene)') + '<div id="ev-res" class="u-mt10"></div>',
      '<button class="btn bg" data-cerrar="m-ev">Cerrar</button><button class="btn bp" data-ev-ir="1">Evaluar</button>');
    m.onclick = async function (ev) {
      var b = ev.target.closest('[data-ev-ir],[data-ev-elegir]'); if (!b) return;
      if (b.hasAttribute('data-ev-elegir')) { var cid = b.getAttribute('data-ev-elegir'); closeM('m-ev'); return extSet(id, function (x) { x.items.push({ cid: cid, cantidad: 1 }); }); }
      m.querySelectorAll('[data-ev]').forEach(function (x) { c[x.getAttribute('data-ev')] = x.type === 'checkbox' ? x.checked : x.value; });
      try { var r = await rpc('cot_herramientas', { c: c });
        set('ev-res', !r.opciones.length ? '<div class="ui-nota-t">Ninguna herramienta de esa categoría cumple lo pedido.</div>' : r.opciones.map(function (o) {
          return '<div class="ui-linea"><span class="ui-f1"><b>' + esc(o.rol) + '</b> · ' + esc(o.producto) + '<div class="ui-nota-t">' + esc(o.ideal || '') + ' · <span class="ui-num">' + o.puntos + '</span> de <span class="ui-num">' + r.maximo + '</span> puntos</div></span>' +
            '<span class="ui-num">' + fmt(o.usd, 'USD') + '/mes</span>' + uiBtn('Elegir', 'check', 's', 'data-ev-elegir="' + esc(o.cid) + '"') + '</div>'; }).join('')); }
      catch (e) { set('ev-res', '<div class="ui-p-error">' + esc(e.message) + '</div>'); }
    };
  }

  // ── Popups de Incluye ──
  function mantPop() {
    var v = dev(), mt = v.mant, sop = soporte();
    var otros = CN.devs.map(function (d, i) { return d.tipo && i !== CN.i && propio(d) ? '<option value="' + i + '"' + (String(mt.comparte) === String(i) ? ' selected' : '') + '>' + esc(tipoNom(d.tipo)) + ' · ' + esc(d.titulo || 'Sin título') + '</option>' : ''; }).join('');
    var m = modal('m-mant', 'Mantenimiento · ' + (v.titulo || tipoNom(v.tipo)),
      '<div class="g2"><div class="fg"><label class="fl" for="mt-hs">Horas por mes · sugerido <span class="ui-num">' + mantHs(v) + '</span> h</label><input class="fc u-tr" type="number" min="1" step="0.5" id="mt-hs" value="' + mt.hs + '"></div>' +
      '<div class="fg"><label class="fl" for="mt-ab">Abono mensual · <span id="mt-sug"></span></label><input class="fc u-tr" type="number" min="0" id="mt-ab" data-monto value="' + (mt.abono || 0) + '"></div></div>' +
      '<div class="u-s11-mt">Incluye monitoreo, reunión mensual, análisis y ajustes. Hora de soporte <span class="ui-num">' + fmt(sop) + '</span>. Ajuste por IPC cada <span class="ui-num">3</span> meses. El monto es tuyo: cambialo si querés.</div>' +
      (otros ? '<div class="fg u-mt10"><label class="fl" for="mt-comp">Compartido con</label><select class="fc" id="mt-comp"><option value="">No, es propio de este desarrollo</option>' + otros + '</select></div>' : ''),
      '<button class="btn bg" data-cerrar="m-mant">Cancelar</button><button class="btn bp" data-mt-ok="1">Listo</button>');
    var sug = function () { set('mt-sug', 'sugerido <span class="ui-num">' + fmt(Math.round((Number(document.getElementById('mt-hs').value) || 0) * sop)) + '</span>'); };
    m.oninput = sug; sug();
    m.onclick = function (ev) { if (!ev.target.closest('[data-mt-ok]')) return;
      var hs = Number(document.getElementById('mt-hs').value) || 5, ab = Number(document.getElementById('mt-ab').value) || 0, s2 = Math.round(hs * sop), cp = (document.getElementById('mt-comp') || {}).value || '';
      v.mant.on = true; v.mant.hs = hs; v.mant.abono = ab || s2; v.mant.manual = !!ab && ab !== s2; v.mant.comparte = cp === '' ? null : Number(cp);
      closeM('m-mant'); cambio(); };
  }
  function incPop(id) {
    var v = dev(), m0 = mod(v, id); if (!m0) return;
    var m = modal('m-inc', m0.bloque, '<div id="inc-b"></div>', '<button class="btn bp" data-cerrar="m-inc">Listo</button>');
    var pinta = function () { set('inc-b', opciones(v, id, 0) || '<div class="ui-nota-t">No tiene opciones.</div>'); };
    m.onchange = function (ev) { changeFun(ev); pinta(); }; m.onclick = function (ev) { clickFun(ev); }; pinta();
  }
  function terPintar() {
    var v = dev(), x = v.ext._terceros || { paga: 'Cliente', items: [] }, L = C.ini.contrataciones;
    var cant = function (cid) { var y = items(x).filter(function (k) { return k.cid === cid; })[0]; return y ? y.cantidad : 0; };
    set('ter-b', '<div class="u-row8 u-mb10"><span class="fl u-m0">Lo paga</span><span class="ui-mon" role="group"><button type="button" class="ui-mon-b' + (x.paga !== 'GIWA' ? ' on' : '') + '" data-ter-paga="Cliente">El cliente</button>' +
      '<button type="button" class="ui-mon-b' + (x.paga === 'GIWA' ? ' on' : '') + '" data-ter-paga="GIWA">GIWA</button></span><span class="ui-f1"></span><span class="ui-num">' + fmt(extTot(x)) + '/mes</span></div>' +
      TER_CAT.map(function (k) { var Lk = L.filter(function (c) { return c.categoria === k; }); if (!Lk.length) return '';
        return uiDesp({ t: k === 'Canales' ? 'Meta · WhatsApp' : k, n2: true, open: k === 'Canales' || Lk.some(function (c) { return cant(c.id) > 0; }) },
          Lk.map(function (c) { return '<div class="ui-linea"><span class="ui-f1">' + esc(c.producto) + ' <span class="ui-nota-t">' + esc(c.unidad || '') + ' · <span class="ui-num">' + fmt(precioC(c)) + '</span></span></span>' +
            '<input class="fc u-wauto u-tr" type="number" min="0" step="1" value="' + (cant(c.id) || '') + '" placeholder="0" data-ter-q="' + esc(c.id) + '"></div>'; }).join('')); }).join(''));
  }
  function terPop() {
    var v = dev();
    if (!v.ext._terceros) {   // si tiene WhatsApp, arranca con el volumen de Meta de siempre
      var wa = (C.ini.reglas.wa || []).some(function (id) { return si(v, id); }), u = C.ini.contrataciones.filter(function (c) { return /utilidad/i.test(c.producto) && /whatsapp/i.test(c.producto); })[0];
      v.ext._terceros = { paga: 'Cliente', items: wa && u ? [{ cid: u.id, cantidad: C.ini.valores.meta_msj }] : [] };
    }
    var m = modal('m-ter', 'Costos de terceros', '<div id="ter-b"></div>', '<button class="btn bg" data-ter-quitar="1">Quitar todos</button><button class="btn bp" data-cerrar="m-ter">Listo</button>');
    m.onchange = function (ev) { var t = ev.target; if (!t.hasAttribute('data-ter-q')) return; var cid = t.getAttribute('data-ter-q'), n = Number(t.value) || 0;
      extSet('_terceros', function (x) { x.items = x.items.filter(function (y) { return y.cid !== cid; }); if (n > 0) x.items.push({ cid: cid, cantidad: n }); }); };
    m.onclick = function (ev) { var b = ev.target.closest('[data-ter-paga],[data-ter-quitar]'); if (!b) return;
      if (b.hasAttribute('data-ter-quitar')) { delete dev().ext._terceros; closeM('m-ter'); return cambio(); }
      var p = b.getAttribute('data-ter-paga'); extSet('_terceros', function (x) { x.paga = p; }); };
    terPintar(); cambio();
  }
  // Popup del desarrollo: tipo, título, alcance, mejora y «Partir de un proyecto existente»
  function devPop(i) {
    var v = i >= 0 ? CN.devs[i] : null, con = v && Object.keys(v.r || {}).length, reuse = null;
    var proys = (C.ini.lista || []).concat([]);   // los del Cotizador; Reutilizar (entrega 4) trae todos
    var m = modal('m-dev', v ? 'Datos del desarrollo' : 'Nuevo desarrollo',
      '<div class="fg"><label class="fl" for="dv-tipo">Tipo <span class="req">*</span></label><select class="fc" id="dv-tipo"' + (con ? ' disabled' : '') + '><option value="">— Tipo —</option>' +
        C.ini.tipos.map(function (t) { return '<option value="' + esc(t.id) + '"' + (v && v.tipo === t.id ? ' selected' : '') + '>' + esc(t.nombre) + '</option>'; }).join('') + '</select>' +
        (con ? '<div class="u-s11-mt">El tipo no se cambia una vez respondidas sus preguntas.</div>' : '') + '</div>' +
      '<div class="fg"><label class="fl" for="dv-tit">Título</label><input class="fc" id="dv-tit" value="' + esc(v ? v.titulo : CN.nombre) + '"></div>' +
      '<div class="fg"><label class="fl" for="dv-obj">Alcance</label><textarea class="fc" id="dv-obj" rows="3">' + esc(v && v.objetivo ? v.objetivo : (CN.minuta.texto || '')) + '</textarea>' +
        (v ? '<button type="button" class="ui-lnk ui-azul" data-dv="completar">Completar con lo tildado</button>' : '') + '</div>' +
      '<label class="u-row6 u-mb10"><input type="checkbox" id="dv-mej"' + (v && v.mejora ? ' checked' : '') + '> Es una mejora de algo ya hecho: lo repetible se cobra al <span class="ui-num">50 %</span></label>' +
      (con ? '' : '<div class="fg"><label class="fl" for="dv-base">Partir de un proyecto existente</label><select class="fc" id="dv-base"><option value="">Elegí un proyecto…</option>' +
        '</select><div id="dv-base-l" class="u-mt6"></div></div>'),
      (v && CN.devs.filter(function (d) { return d.tipo; }).length > 1 ? '<button class="btn bg" data-dv="quitar">Quitar este desarrollo</button>' : '') +
      '<button class="btn bg" data-cerrar="m-dev">Cancelar</button><button class="btn bp" data-dv="ok">Listo</button>');
    if (!con) db().from('proyectos').select('id,nombre,empresa_id').neq('estado_id', 'Borrador').order('creado', { ascending: false }).limit(200).then(function (r) {
      var emp = {}; C.ini.empresas.forEach(function (e) { emp[e.id] = e.nombre; });
      var s = document.getElementById('dv-base'); if (s && r.data) s.innerHTML = '<option value="">Elegí un proyecto…</option>' + r.data.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc((emp[p.empresa_id] || '') + ' · ' + p.nombre) + '</option>'; }).join('');
    });
    m.onchange = async function (ev) {
      if (ev.target.id !== 'dv-base') return; reuse = null; var pid = ev.target.value; set('dv-base-l', '');
      if (!pid) return; var L = await rpc('cot_base', { pid: pid });
      set('dv-base-l', !L.length ? '<div class="ui-nota-t">Ese proyecto no tiene funcionalidades cargadas.</div>' : L.map(function (d, k) {
        return '<button type="button" class="ui-btn ui-s" data-dv-base="' + k + '">' + esc(tipoNom(d.tipo)) + ' · ' + esc(d.titulo || '') + ' · <span class="ui-num">' + d.ids.length + '</span> funcionalidades</button>'; }).join(''));
      m._base = L;
    };
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-dv],[data-dv-base]'); if (!b) return;
      if (b.hasAttribute('data-dv-base')) { reuse = m._base[Number(b.getAttribute('data-dv-base'))];
        document.getElementById('dv-tipo').value = reuse.tipo; document.getElementById('dv-tit').value = reuse.titulo || ''; if (reuse.alcance) document.getElementById('dv-obj').value = reuse.alcance;
        set('dv-base-l', '<span class="ui-e-finalizado u-s11">Se tildan las <span class="ui-num">' + reuse.ids.length + '</span> funcionalidades de «' + esc(reuse.titulo || '') + '». Después las ajustás.</span>'); return; }
      var a = b.getAttribute('data-dv');
      if (a === 'completar') { var tild = mods(v).filter(function (x) { return si(v, x.id) && v.etapa[x.id] !== 'futura' && x.horas > 0; }).map(nom);
        var o = document.getElementById('dv-obj'); o.value = (o.value.trim() ? o.value.trim() + '\n' : '') + 'Incluye: ' + tild.join(', ') + '.'; return; }
      if (a === 'quitar') return ask('¿Quitar «' + (v.titulo || tipoNom(v.tipo)) + '» de la cotización?', 'Quitar desarrollo', { ok: 'Quitar', peligro: true }).then(function (ok) {
        if (!ok) return; var x = CN.devs.splice(i, 1)[0]; if (x.id) CN.borrados.push(x.id); if (x.mant.id) CN.borrados.push(x.mant.id);
        CN.devs.forEach(function (d) { if (d.mant.comparte != null && d.mant.comparte !== '') { var k = Number(d.mant.comparte); if (k === i) d.mant.comparte = null; else if (k > i) d.mant.comparte = k - 1; } });
        CN.i = 0; closeM('m-dev'); repintar(); auto(); });
      if (a !== 'ok') return;
      var tipo = document.getElementById('dv-tipo').value; if (!tipo) return aviso('Elegí el tipo de desarrollo.');
      var nv = v || vacio(); if (!v) CN.devs.push(nv);
      var cambioTipo = nv.tipo !== tipo || !!reuse;
      nv.tipo = tipo; nv.titulo = document.getElementById('dv-tit').value.trim(); nv.objetivo = document.getElementById('dv-obj').value.trim(); nv.mejora = document.getElementById('dv-mej').checked;
      if (reuse && !Object.keys(nv.r).length) { reuse.ids.forEach(function (x) { nv.r[x] = 'Sí'; }); nv.cant = Object.assign({}, reuse.cant || {}); nv.base = { de: reuse.id }; }
      CN.i = CN.devs.indexOf(nv); closeM('m-dev');
      catalogo(tipo).then(function () {
        if (cambioTipo || !v) mods(nv).forEach(function (x) { if (x.sugerido && !nv.r[x.id]) nv.r[x.id] = 'Sí'; });   // lo sugerido arranca en Sí
        conMadres(nv);
        repintar(); estimar(CN.i); auto();
      }).catch(function (e) { toast(e.message, 'err'); });
    };
  }

  // ── Minuta: lo relevado, sin precios, con los pendientes ──
  function relevado() {
    return CN.devs.filter(function (v) { return v.tipo; }).map(function (v) {
      var li = function (arr) { return arr.length ? '<ul>' + arr.map(function (m) { return '<li>' + esc(nom(m)) + (m.instancia && v.cant[m.id] > 1 ? ' ×' + v.cant[m.id] : '') + (v.notas[m.id] ? ' — ' + esc(v.notas[m.id]) : '') + '</li>'; }).join('') + '</ul>' : '<div class="ui-nota-t">—</div>'; };
      var M = mods(v);
      return '<div class="ui-lat-h u-mt10">' + esc(v.titulo || tipoNom(v.tipo)) + '</div>' + (v.objetivo ? '<div class="u-s11">' + esc(v.objetivo) + '</div>' : '') +
        '<div class="u-s11"><b>Alcance · 1ª etapa</b></div>' + li(M.filter(function (m) { return si(v, m.id) && v.etapa[m.id] !== 'futura'; })) +
        '<div class="u-s11"><b>Etapa futura</b></div>' + li(M.filter(function (m) { return si(v, m.id) && v.etapa[m.id] === 'futura'; })) +
        '<div class="u-s11"><b>No incluye</b></div>' + li(M.filter(function (m) { return v.r[m.id] === 'No'; })) +
        (v.mant.on ? '<div class="u-s11">Incluye mantenimiento: <span class="ui-num">' + v.mant.hs + '</span> h por mes (monitoreo, reunión mensual, análisis y ajustes), ajuste por IPC cada <span class="ui-num">3</span> meses.</div>' : '') +
        '<div class="u-s11 ui-p-pendiente"><b>Pendientes</b></div>' + li(pend(v));
    }).join('');
  }
  function minuta() {
    var m = modal('m-minuta', 'Minuta · ' + (CN.nombre || 'Proyecto'),
      MIN.map(function (k) { return '<div class="fg"><label class="fl" for="mn-' + k[0] + '">' + k[1] + '</label><textarea class="fc" rows="2" id="mn-' + k[0] + '">' + esc(CN.minuta[k[0]] || '') + '</textarea></div>'; }).join('') +
      '<div class="ui-lat-h">Lo relevado</div>' + relevado(),
      '<button class="btn bg" data-mn="imprimir">' + ico('documento') + ' Imprimir</button><button class="btn bg" data-cerrar="m-minuta">Cerrar</button><button class="btn bp" data-mn="ok">Listo</button>');
    m.onclick = function (ev) { var b = ev.target.closest('[data-mn]'); if (!b) return;
      MIN.forEach(function (k) { CN.minuta[k[0]] = document.getElementById('mn-' + k[0]).value.trim(); }); auto();
      if (b.getAttribute('data-mn') === 'imprimir') return imprimir();
      closeM('m-minuta'); };
  }
  function imprimir() {
    var e = empresa() || {}, M = CN.minuta, h = '';
    MIN.forEach(function (k) { if (M[k[0]]) h += '<h3>' + k[1] + '</h3><p>' + esc(M[k[0]]) + '</p>'; });
    var w = window.open('', '_blank'); if (!w) return aviso('El navegador bloqueó la ventana.');
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Minuta · ' + esc(CN.nombre) + '</title>' +
      '<style>body{font-family:Montserrat,Arial,sans-serif;max-width:760px;margin:32px auto;color:#111;line-height:1.5}.ui-num{font-family:"Courier New",monospace}h1{font-weight:500}</style></head><body>' +
      '<h1>' + esc(CN.nombre) + '</h1><p>' + esc(e.nombre || '') + ' · ' + new Date().toLocaleDateString('es-AR') + '</p>' + (M.texto ? '<p>' + esc(M.texto) + '</p>' : '') + h +
      '<h2>Lo relevado</h2>' + relevado() + '</body></html>');
    w.document.close();
  }
  function buscarMinuta() {
    var m = modal('m-bmin', 'Minutas guardadas', '<div id="bmin-b" class="ui-nota-t">Buscando…</div>', '<button class="btn bg" data-cerrar="m-bmin">Cerrar</button>');
    rpc('cot_minutas', { empresa: CN.empresa || '' }).then(function (L) {
      m._L = L;
      set('bmin-b', L.length ? L.map(function (x, i) { return '<div class="ui-linea"><span class="ui-f1"><b>' + esc(x.nombre) + '</b> <span class="ui-nota-t ui-num">' + esc(x.pid) + '</span>' +
        '<div class="ui-nota-t">' + esc(x.texto.slice(0, 280)) + (x.texto.length > 280 ? '…' : '') + '</div></span>' + uiBtn('Usar', 'check', 's', 'data-bmin="' + i + '"') + '</div>'; }).join('')
        : (CN.empresa ? 'Esta empresa no tiene minutas guardadas.' : 'No hay minutas guardadas.'));
    });
    m.onclick = function (ev) { var b = ev.target.closest('[data-bmin]'); if (!b) return; var x = m._L[Number(b.getAttribute('data-bmin'))];
      CN.minuta.texto = ((CN.minuta.texto || '').trim() ? CN.minuta.texto.trim() + '\n\n' : '') + x.texto; closeM('m-bmin'); repintar(); auto(); };
  }

  // ── Ver (lectura) ──
  function htmlVer() {
    var v = C.ver; if (!v) return '<div class="ui-nota-t">Cargando…</div>';
    var M = v.minuta || {}, min = MIN.filter(function (k) { return M[k[0]]; }).map(function (k) { return '<div class="u-s11"><b>' + k[1] + '</b></div><div class="u-s11 u-mb6">' + esc(M[k[0]]) + '</div>'; }).join('');
    var guard = CN; CN = v._cn; var rel = relevado(); CN = guard;
    return '<div class="ui-ficha-hd"><div><div class="ui-pro">' + esc(v.nombre) + '</div><div class="ui-emp">' + esc(v.empresa_nombre || '') + ' · <span class="ui-num">' + esc(v.pid) + '</span></div></div>' +
      '<span>' + uiEstado(v.estado) + '</span><span class="ui-acc-est ui-fila-ic">' +
        uiBtn('Imprimir minuta', 'documento', 's', 'data-cot="ver-imprimir"') + (v.editable ? uiBtn('Editar', 'editar', 's', 'data-cot="editar" data-id="' + esc(v.pid) + '"') : '') +
        (v.estado === 'Borrador' ? uiBtn('Crear proyecto', 'check', 'p', 'data-cot="ver-crear"') : uiBtn('Abrir en Proyectos', 'abrir', 'p', 'data-cot="ver-pm"')) + '</span></div>' +
      '<div class="ui-cols"><div>' + (M.texto ? '<div class="u-s11 u-mb6">' + esc(M.texto) + '</div>' : '') + (min || '<div class="ui-nota-t">Sin minuta cargada.</div>') + '</div><div>' + rel + '</div></div>';
  }

  // ── En la reunión: la misma pantalla para escribir la minuta o pegar un README ──
  // A la izquierda el texto; a la derecha el catálogo para tildar. «Tildar desde el texto» lo lee y marca en violeta
  // lo que agregó, para revisarlo. Pago único y abono salen del mismo motor. Guardar = borrador; o sigue en Nuevo proyecto.
  var RE = null;
  function reNuevo() { return { empresa: '', tipo: (C.ini.tipos[0] || {}).id || '', titulo: '', minuta: '', r: {}, cant: {}, notas: {}, etapa: {}, ia: {}, abono: null, est: null, wa: 0, propuesta: '', msg: '', leido: false }; }
  function htmlReunion() {
    if (!RE) RE = reNuevo();
    setTimeout(function () { reTipo(false); }, 0);
    return '<div id="re"><div class="ui-filtros"><select class="ui-campo" id="re-emp" aria-label="Cliente"><option value="">Cliente…</option>' +
        C.ini.empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === RE.empresa ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('') + '</select>' +
      '<select class="ui-campo" id="re-tipo" aria-label="Tipo de desarrollo">' + C.ini.tipos.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === RE.tipo ? ' selected' : '') + '>' + esc(t.nombre) + '</option>'; }).join('') + '</select>' +
      '<input class="ui-campo ui-f1" id="re-tit" placeholder="Nombre del desarrollo" aria-label="Nombre del desarrollo" value="' + esc(RE.titulo) + '"></div>' +
      '<div class="cot-re"><div><textarea class="fc cot-re-txt" id="re-min" placeholder="Lo que cuenta el cliente, o pegá acá un README…" aria-label="Minuta o README">' + esc(RE.minuta) + '</textarea>' +
        '<div class="ui-barra">' + uiBtn('Tildar desde el texto', 'check', 'p', 'data-re="leer"') + '</div><div id="re-msg" class="u-s11-mt"></div></div>' +
      '<div id="re-lista"></div></div><div class="cot-re-tot" id="re-tot"></div></div>';
  }
  async function reTipo(limpio) {
    try { await catalogo(RE.tipo); } catch (e) { return toast(e.message, 'err'); }
    if (limpio || !Object.keys(RE.r).length) { RE.r = {}; RE.cant = {}; RE.notas = {}; RE.ia = {}; mods(RE).forEach(function (m) { if (m.sugerido) RE.r[m.id] = 'Sí'; }); }
    rePinta(); reEstimar();
  }
  function reFila(m, niv) {
    var on = si(RE, m.id), hh = Math.round(m.horas * m.factor * 10) / 10, integ = (C.ini.reglas.integ || []).indexOf(m.id) >= 0;
    var h = '<div class="cot-op" style="--niv:' + niv + '"><label class="u-row6"><input type="checkbox"' + (on ? ' checked' : '') + ' data-re-ck="' + esc(m.id) + '"> ' +
      '<span class="ui-f1' + (RE.ia[m.id] ? ' ui-p-abono' : on ? '' : ' ui-nota-t') + '">' + esc(m.pregunta || m.nombre) + '</span>' + (hh ? '<span class="ui-num ui-nota-t">' + hh + ' h</span>' : '') + '</label>';
    if (on && m.instancia) h += '<div class="u-row8 u-s11-mt">Cantidad <input class="fc u-wauto" type="number" min="1" value="' + (RE.cant[m.id] || 1) + '" data-re-cant="' + esc(m.id) + '"></div>';
    if (on && integ) h += '<input class="fc" placeholder="Nombre del sistema" value="' + esc(RE.notas[m.id] || '') + '" data-re-nota="' + esc(m.id) + '" aria-label="Nombre del sistema">';
    if (on) h += hijas(RE, m.id).map(function (x) { return reFila(x, niv + 1); }).join('');
    return h + '</div>';
  }
  function rePinta() {
    var box = document.getElementById('re-lista'); if (!box) return;
    var base = raices(RE).filter(esBase), hB = base.reduce(function (s, m) { return s + m.horas * m.factor; }, 0), por = {}, orden = [];
    raices(RE).filter(function (m) { return !esBase(m); }).forEach(function (m) { if (!por[m.bloque]) { por[m.bloque] = []; orden.push(m.bloque); } por[m.bloque].push(m); });
    box.innerHTML = (base.length ? '<div class="ui-kv">Base del agente · siempre incluida<span class="ui-num">' + hB + ' h</span></div>' : '') +
      orden.map(function (b) { return '<div class="ui-lat-h u-mt10">' + esc(b) + '</div>' + por[b].map(function (m) { return reFila(m, 0); }).join(''); }).join('');
    set('re-msg', RE.msg + (RE.propuesta ? '<div class="fg u-mt10"><label class="fl" for="re-prop">Propuesta para el cliente</label><textarea class="fc" rows="4" id="re-prop">' + esc(RE.propuesta) + '</textarea></div>' : ''));
    reTotal();
  }
  function reAbono() { return RE.abono != null ? RE.abono : Math.round(mantHs(RE) * soporte()); }
  function reTotal() {
    var e = RE.est, h = e ? Math.round(e.horas * 10) / 10 : 0;
    set('re-tot', '<span>Pago único <span class="ui-num">' + (e ? fmt(sugerido(RE)) : '…') + '</span> ' + (e ? usd(sugerido(RE)) : '') + ' · <span class="ui-num">' + h + '</span> h' + (RE.empresa ? '' : ' <span class="ui-nota-t">(sin Tier: elegí el cliente)</span>') + '</span>' +
      '<label class="u-row6">Por mes <input class="fc u-wauto u-tr ui-num" type="number" min="0" id="re-ab" value="' + reAbono() + '" data-tip="Sugerido: ' + mantHs(RE) + ' h de soporte. El monto es tuyo: cambialo si querés."></label>' +
      '<span class="ui-f1"></span>' + uiBtn('Pasar a Nuevo proyecto', 'derecha', 's', 'data-re="nuevo"') + uiBtn('Guardar borrador', 'guardar', 'p', 'data-re="guardar"'));
  }
  function reEstimar() {
    clearTimeout(_t.re);
    _t.re = setTimeout(async function () {
      try { var r = await rpc('estimar_desarrollo', { tipo: RE.tipo, empresa_id: RE.empresa || '', opts: { sel: sel(RE), cant: RE.cant } }); RE.est = r.ok ? r : null; reTotal(); } catch (e) { toast(e.message, 'err'); }
    }, 250);
  }
  function reChange(t) {
    if (t.id === 're-emp') { RE.empresa = t.value; return reEstimar(); }
    if (t.id === 're-tipo') { RE.tipo = t.value; return reTipo(true); }
    if (t.id === 're-tit') { RE.titulo = t.value.trim(); return; }
    if (t.id === 're-min') { RE.minuta = t.value; return; }
    if (t.id === 're-ab') { RE.abono = t.value === '' ? null : Number(t.value) || 0; return; }
    if (t.id === 're-prop') { RE.propuesta = t.value; return; }
    if (t.hasAttribute('data-re-cant')) { RE.cant[t.getAttribute('data-re-cant')] = Math.max(1, Number(t.value) || 1); return reEstimar(); }
    if (t.hasAttribute('data-re-nota')) { RE.notas[t.getAttribute('data-re-nota')] = t.value.trim(); return; }
    if (t.hasAttribute('data-re-ck')) { var id = t.getAttribute('data-re-ck'); delete RE.ia[id];
      if (t.checked) RE.r[id] = 'Sí'; else { delete RE.r[id]; limpiar(RE, id); }
      rePinta(); reEstimar(); }
  }
  // Arma la cotización con lo cargado: la misma que usan Nuevo proyecto y Guardar
  function reCotizacion() {
    var x = nuevo(), v = vacio(), wa = (C.ini.reglas.wa || []).some(function (id) { return si(RE, id); }), u = C.ini.contrataciones.filter(function (c) { return /utilidad/i.test(c.producto) && /whatsapp/i.test(c.producto); })[0];
    x.empresa = RE.empresa; x.nombre = RE.titulo || tipoNom(RE.tipo); x.minuta = { texto: RE.minuta, objetivo: RE.minuta, propuesta: RE.propuesta || undefined, origen: RE.leido ? 'Leído del texto' : 'En la reunión' };
    var cs = C.ini.contactos.filter(function (c) { return c.empresa === RE.empresa; }); if (cs.length === 1) x.sponsors = [cs[0].id];
    v.tipo = RE.tipo; v.titulo = x.nombre; v.r = RE.r; v.cant = RE.cant; v.notas = RE.notas; v.est = RE.est;
    v.mant = Object.assign(v.mant, { on: true, hs: mantHs(RE), abono: reAbono(), manual: RE.abono != null });
    if (wa && u) v.ext._terceros = { paga: 'Cliente', items: [{ cid: u.id, cantidad: RE.wa || C.ini.valores.meta_msj }] };
    x.devs = [v]; return x;
  }
  async function reClick(a, el) {
    if (a === 'leer') {
      if ((RE.minuta = document.getElementById('re-min').value).trim().length < 40) { RE.msg = 'Escribí o pegá un poco más de texto.'; return rePinta(); }
      set('re-msg', 'Leyendo…');
      var r = await sb().functions.invoke('cot-interpretar', { body: { texto: RE.minuta, tipo: RE.tipo } });
      if (r.error || !r.data || !r.data.ok) { RE.msg = (r.data && r.data.msg) || 'La lectura todavía no está activa: falta cargar la función en Supabase.'; return rePinta(); }
      var si2 = r.data.modulos.filter(function (m) { return !m.opcional && mod(RE, m.id); }), op = r.data.modulos.filter(function (m) { return m.opcional && mod(RE, m.id); });
      si2.forEach(function (m) { if (!si(RE, m.id)) RE.ia[m.id] = 1; RE.r[m.id] = 'Sí'; }); conMadres(RE);
      var integ = (C.ini.reglas.integ || []).filter(function (id) { return si(RE, id); })[0];
      if (integ && r.data.sistemas[0] && !RE.notas[integ]) RE.notas[integ] = r.data.sistemas.map(function (x) { return x.nombre; }).join(', ');
      if (!RE.titulo && r.data.titulo) { RE.titulo = r.data.titulo; document.getElementById('re-tit').value = RE.titulo; }
      RE.wa = r.data.wa_msj || 0; RE.propuesta = r.data.propuesta || ''; RE.leido = true;
      RE.msg = 'Tildó <span class="ui-num">' + Object.keys(RE.ia).length + '</span> opciones. Revisalas: las violetas son las que agregó.' + (op.length ? ' Opcionales, sin tildar: ' + esc(op.map(function (m) { return nom(mod(RE, m.id)); }).join(', ')) + '.' : '');
      rePinta(); return reEstimar();
    }
    if (!RE.est) return toast('Esperá que termine de calcular', 'inf');
    if (a === 'nuevo') {
      if (CN && !CN.pid && CN.devs.some(function (d) { return d.tipo; }) && !(await ask('Lo que tenés cargado en Nuevo proyecto se reemplaza.', 'Pasar a Nuevo proyecto', { ok: 'Reemplazar' }))) return;
      CN = reCotizacion(); RE = null; C.sub = 'nuevo'; pintar(el); auto(); return estimar(0);
    }
    if (a === 'guardar') {
      if (!RE.empresa) return aviso('Elegí el cliente.');
      var g = CN, d; CN = reCotizacion(); d = payload(); CN = g;
      if (!(await ask('Se guarda «' + d.nombre + '» como Borrador. No se ve en Proyectos hasta que lo crees.', 'Guardar borrador', { ok: 'Guardar' }))) return;
      try { var x = await rpc('cot_guardar', { d: d }); toast(x.pid + ' · Borrador', 'ok'); RE = null; await cargar(); C.sub = 'lista'; pintar(el); } catch (e) { aviso(e.message); }
    }
  }

  // ── Reutilizar: un proyecto anterior para otra empresa, con su Tier. Un solo modal. ──
  async function reutilizar(el) {
    var pr = await db().from('proyectos').select('id,nombre,empresa_id').neq('estado_id', 'Borrador').order('creado', { ascending: false }).limit(200);
    if (pr.error) return toast(pr.error.message, 'err');
    var emp = {}, Q = null; C.ini.empresas.forEach(function (e) { emp[e.id] = e.nombre; });
    var m = modal('m-reu', 'Reutilizar proyecto',
      '<div class="g2"><div class="fg"><label class="fl" for="ru-ref">Proyecto base</label><select class="fc" id="ru-ref"><option value="">Elegí…</option>' + pr.data.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc((emp[p.empresa_id] || '') + ' · ' + p.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fg"><label class="fl" for="ru-emp">Empresa nueva</label><select class="fc" id="ru-emp"><option value="">Elegí…</option>' + C.ini.empresas.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fg"><label class="fl" for="ru-nom">Nombre del proyecto nuevo</label><input class="fc" id="ru-nom"></div><div id="ru-b" class="ui-nota-t">Elegí el proyecto y la empresa.</div>',
      '<button class="btn bg" data-cerrar="m-reu">Cancelar</button><button class="btn bg" data-ru="nuevo">Abrir en Nuevo proyecto</button><button class="btn bp" data-ru="crear">Crear prospecto</button>');
    var v = function (id) { return document.getElementById(id).value; };
    var pinta = function () {
      var tot = 0, mes = 0, h = Q.devs.map(function (d, i) {
        d.horas = d.modulos.reduce(function (s, f) { return s + (Number(f.horas) || 0); }, 0); d.precio = Math.round(d.horas * Q.vh); tot += d.precio; mes += Number(d.mant) || 0;
        return '<div class="ui-lat-h u-mt10">' + esc(tipoNom(d.tipo)) + ' · ' + esc(d.titulo || '') + '</div>' + d.modulos.map(function (f, j) {
          return '<div class="ui-linea"><span class="ui-f1">' + esc(f.nombre || '') + '</span><input class="fc u-wauto u-tr" type="number" min="0" step="0.5" value="' + f.horas + '" data-ru-h="' + i + ':' + j + '" aria-label="Horas"></div>'; }).join('') +
          '<div class="ui-linea"><span class="ui-f1 ui-p-abono">Mantenimiento · <span class="ui-num">' + d.mant_hs + '</span> h por mes</span><input class="fc u-wauto u-tr" type="number" min="0" value="' + d.mant + '" data-ru-m="' + i + '" aria-label="Abono"></div>'; }).join('');
      set('ru-b', Q.devs.length ? '<div class="ui-kv">' + esc(Q.tier) + ' · valor hora<span class="ui-num">' + fmt(Q.vh, Q.moneda) + '</span></div>' + h +
        '<div class="ui-kv">Pago único<span class="ui-num">' + fmt(tot) + '</span></div><div class="ui-kv">Por mes<span class="ui-num">' + fmt(mes) + '</span></div>' : 'Ese proyecto no tiene horas cargadas para reutilizar.');
    };
    m.onchange = async function (ev) { var t = ev.target;
      if (t.hasAttribute('data-ru-h')) { var a = t.getAttribute('data-ru-h').split(':'); Q.devs[a[0]].modulos[a[1]].horas = Number(t.value) || 0; return pinta(); }
      if (t.hasAttribute('data-ru-m')) { Q.devs[t.getAttribute('data-ru-m')].mant = Number(t.value) || 0; return pinta(); }
      if (t.id === 'ru-ref' && !v('ru-nom')) document.getElementById('ru-nom').value = t.options[t.selectedIndex].text.split(' · ').slice(1).join(' · ');
      if ((t.id === 'ru-ref' || t.id === 'ru-emp') && v('ru-ref') && v('ru-emp')) { try { Q = await rpc('cot_clonable', { pid: v('ru-ref'), empresa: v('ru-emp'), moneda: 'ARS' }); pinta(); } catch (e) { set('ru-b', esc(e.message)); } }
    };
    m.onclick = async function (ev) { var b = ev.target.closest('[data-ru]'); if (!b) return;
      if (!Q || !Q.devs.length) return aviso('Elegí el proyecto base y la empresa.');
      if (b.getAttribute('data-ru') === 'nuevo') {
        var x = nuevo(); x.empresa = v('ru-emp'); x.nombre = v('ru-nom');
        x.devs = Q.devs.map(function (d) { var n = vacio(); n.tipo = d.tipo; n.titulo = d.titulo || ''; d.modulos.forEach(function (f) { if (f.id) n.r[f.id] = 'Sí'; }); n.base = { de: d.origen }; n.mant.on = true; return n; });
        for (var i = 0; i < x.devs.length; i++) { await catalogo(x.devs[i].tipo); conMadres(x.devs[i]); }
        CN = x; closeM('m-reu'); C.sub = 'nuevo'; pintar(el); auto(); return CN.devs.forEach(function (d, k) { estimar(k); });
      }
      if (!(await ask('Se crea «' + v('ru-nom') + '» como Prospecto para ' + emp[v('ru-emp')] + ', con sus horas y costos.', 'Crear prospecto', { ok: 'Crear' }))) return;
      try { var r = await rpc('cot_alta', { d: { empresa: v('ru-emp'), nombre: v('ru-nom'), moneda: 'ARS', ref: Q.pid, devs: Q.devs }, origen: 'reutilizar' });
        closeM('m-reu'); toast(r.pid + ' · Prospecto', 'ok'); await cargar(); C.sub = 'lista'; pintar(el); } catch (e) { aviso(e.message); }
    };
  }

  // ── abrir, guardar, crear, borrar ──
  function auto() { if (!CN || CN.pid) return; try { localStorage.setItem(LS, JSON.stringify(CN, function (k, x) { return k === 'est' || k === 'ref' ? undefined : x; })); } catch (e) {} }
  function recuperar() { try { var x = JSON.parse(localStorage.getItem(LS) || 'null'); if (x && x.devs && !x.pid) return x; } catch (e) {} return null; }
  function olvidar() { try { localStorage.removeItem(LS); } catch (e) {} }
  async function abrirCot(pid) {
    var r = await rpc('cot_leer', { pid: pid });
    var x = nuevo(); x.pid = r.pid; x.estado = r.estado; x.empresa = r.empresa; x.nombre = r.nombre; x.minuta = r.minuta || {};
    x.sponsors = String(r.contactos || r.sponsor || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    x.owners = (x.minuta.responsables && x.minuta.responsables.length ? x.minuta.responsables : [r.owner]).filter(Boolean);
    var idx = {}; r.devs.forEach(function (d, i) { idx[d.id] = i; });
    x.devs = r.devs.map(function (d) { var v = vacio(); Object.keys(d).forEach(function (k) { if (d[k] != null && k !== 'mant') v[k] = d[k]; });
      v.precio = Number(d.precio) || 0; v.mant = Object.assign(vacio().mant, d.mant || {}, { manual: !!(d.mant && d.mant.on) });
      // compartido: lo cubre el mantenimiento de otro desarrollo de esta cotización
      if (d.mant && d.mant.on && d.mant.cubre && d.mant.cubre[0] !== d.id) { v.mant = Object.assign(vacio().mant, { on: true, comparte: idx[d.mant.cubre[0]] }); }
      return v; });
    for (var i = 0; i < x.devs.length; i++) { await catalogo(x.devs[i].tipo); conMadres(x.devs[i]); }
    return { r: r, cn: x };
  }
  function payload() {
    var con = CN.devs.filter(function (v) { return v.tipo; });
    CN.minuta.responsables = CN.owners;
    return { pid: CN.pid, empresa: CN.empresa, nombre: CN.nombre, sponsor: CN.sponsors.join(','), owner: CN.owners[0] || '', minuta: CN.minuta, borrados: CN.borrados,
      devs: con.map(function (v) { var mt = Object.assign({}, v.mant), c = propio(v) ? null : CN.devs[v.mant.comparte];
        mt.comparte = c ? con.indexOf(c) : null;
        return { id: v.id, tipo: v.tipo, titulo: v.titulo, objetivo: v.objetivo, mejora: !!v.mejora, r: v.r, cant: v.cant, etapa: v.etapa, notas: v.notas, ext: v.ext, base: v.base, na: v.na,
                 precio: v.precio || 0, mant: mt, moneda: v.moneda || 'ARS', forma_pago: v.forma_pago || '', inicio: v.inicio || '', vh: v.vh || null, vh_sop: v.vh_sop || null, semanas: v.semanas || '' }; }) };
  }
  async function guardar(crear, el) {
    var d = payload();
    if (!d.empresa || !d.nombre) return aviso('Falta la empresa o el título del proyecto.');
    if (!d.devs.length) return aviso('Cargá al menos un desarrollo.');
    var alta = !CN.pid, msg = crear ? (alta ? 'Se crea «' + d.nombre + '» como Prospecto, con sus horas, costos y tareas. Queda en Proyectos.' : 'El borrador «' + d.nombre + '» pasa a Prospecto y escribe sus horas, costos y tareas.')
      : (alta ? 'Se guarda «' + d.nombre + '» como Borrador. No se ve en Proyectos hasta que lo crees.' : 'Se guardan los cambios de «' + d.nombre + '» (' + CN.estado + ').');
    if (!(await ask(msg, crear ? 'Crear proyecto' : 'Guardar', { ok: crear ? 'Crear' : 'Guardar' }))) return;
    try {
      var r = await rpc(crear && alta ? 'cot_guardar_y_crear' : 'cot_guardar', { d: d });
      if (crear && !alta) r = Object.assign(r, await rpc('cot_crear', { pid: r.pid }));
      if (alta) olvidar();
      toast(r.pid + ' · ' + r.estado + (r.tareas ? ' · ' + r.tareas + ' tarea(s) de integración' : ''), 'ok');
      await cargar(); var o = await abrirCot(r.pid); CN = o.cn; CN.devs.forEach(function (v, i) { estimar(i); }); C.sub = 'nuevo'; pintar(el);
    } catch (e) { aviso(e.message); }
  }
  async function borrar(pid, el) {
    var p = (C.ini.lista || []).filter(function (x) { return x.id === pid; })[0] || { nombre: pid, borrador: false };
    if (!(await ask('Se borra «' + p.nombre + '» (' + pid + ') con sus desarrollos, horas y costos. No se puede deshacer.', p.borrador ? 'Descartar borrador' : 'Borrar proyecto', { ok: 'Borrar', peligro: true }))) return;
    try { await rpc('cot_borrar', { pid: pid }); toast(pid + ' borrado', 'ok'); if (CN && CN.pid === pid) CN = null; await cargar(); C.sub = 'lista'; pintar(el); } catch (e) { aviso(e.message); }
  }
  // El modal de la app (.mo/.md), con su título, cuerpo y pie
  function modal(id, tit, cuerpo, pie, cls) {
    var m = document.getElementById(id); if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = id; document.body.appendChild(m); }
    m.innerHTML = '<div class="md ' + (cls || 'md-sm') + '"><div class="mh"><span class="mt2">' + esc(tit) + '</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="' + id + '">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' + cuerpo + '</div><div class="mf">' + pie + '</div></div>';
    m.onclick = m.onchange = m.oninput = null; openM(id); return m;
  }

  VISTAS.cot = async function (el, op) {
    await abrirModulo(el, { id: 'cot', texto: 'Cargando el Cotizador…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return !!C.ini; }, firma: function () { return JSON.stringify(C.ini && C.ini.lista); }, pintar: function () { pintar(el); } });
    if (CN) for (var i = 0; i < CN.devs.length; i++) { if (CN.devs[i].tipo) { await catalogo(CN.devs[i].tipo).catch(function () {}); if (!CN.devs[i].est) estimar(i); } }
    el.onclick = async function (ev) {
      if (_montado !== 'cot') return;
      var bre = ev.target.closest('[data-re]'); if (bre) return reClick(bre.getAttribute('data-re'), el);
      var b = ev.target.closest('[data-cot]'); if (!b) return;
      var a = b.getAttribute('data-cot'), id = b.getAttribute('data-id');
      if (a === 'reutilizar') return reutilizar(el);
      if (a === 'sub') { C.sub = b.getAttribute('data-s'); if (C.sub === 'nuevo' && !CN) CN = recuperar() || nuevo(); pintar(el); if (C.sub === 'nuevo') CN.devs.forEach(function (v, i) { if (v.tipo) catalogo(v.tipo).then(function () { estimar(i); }); }); return; }
      if (a === 'rapida') return typeof window.abrirCargaRapida === 'function' ? window.abrirCargaRapida() : (location.hash = '#/pm/nuevo');
      if (a === 'ver') { C.sub = 'ver'; C.ver = null; pintar(el);
        try { var o = await abrirCot(id); C.ver = Object.assign(o.r, { _cn: o.cn, empresa_nombre: (C.ini.empresas.filter(function (e) { return e.id === o.r.empresa; })[0] || {}).nombre }); } catch (e) { aviso(e.message); }
        return pintar(el); }
      if (a === 'editar') {
        if (CN && !CN.pid && CN.devs.some(function (d) { return d.tipo; }) && !(await ask('Lo que tenés cargado en Nuevo proyecto queda guardado en este navegador. Se abre ' + id + ' para editar.', 'Editar', { ok: 'Abrir' }))) return;
        try { var o2 = await abrirCot(id); if (!o2.r.editable) return aviso('Ya está aprobado: se edita desde Proyectos.'); auto(); CN = o2.cn; C.sub = 'nuevo'; pintar(el); CN.devs.forEach(function (v, i) { estimar(i); }); } catch (e) { aviso(e.message); }
        return; }
      if (a === 'borrar') return borrar(id || CN.pid, el);
      if (a === 'ver-imprimir') { var g = CN; CN = C.ver._cn; imprimir(); CN = g; return; }
      if (a === 'ver-crear') { if (!(await ask('El borrador «' + C.ver.nombre + '» pasa a Prospecto y escribe sus horas, costos y tareas.', 'Crear proyecto', { ok: 'Crear' }))) return;
        try { await rpc('cot_crear', { pid: C.ver.pid }); toast(C.ver.pid + ' · Prospecto', 'ok'); await cargar(); C.sub = 'lista'; pintar(el); } catch (e) { aviso(e.message); } return; }
      if (a === 'ver-pm') { location.hash = '#/pm/proy'; return; }
      // editor
      if (a === 'guardar') return guardar(false, el);
      if (a === 'crear') return guardar(true, el);
      if (a === 'descartar') return ask('Se borra lo que cargaste en esta pantalla. No toca nada guardado.', 'Descartar', { ok: 'Descartar', peligro: true }).then(function (ok) { if (!ok) return; olvidar(); CN = nuevo(); pintar(el); });
      if (a === 'minuta') return minuta();
      if (a === 'min-buscar') return buscarMinuta();
      if (a === 'contacto') return abrirContacto(null, { empresa: CN.empresa, onSave: async function () { await cargar(); pintar(el); } });
      if (a === 'sp-quitar') { CN.sponsors.splice(Number(b.getAttribute('data-i')), 1); auto(); return repintar(); }
      if (a === 'ow-quitar') { CN.owners.splice(Number(b.getAttribute('data-i')), 1); auto(); return repintar(); }
      if (a === 'dev-nuevo') return devPop(-1);
      if (a === 'dev-editar') { ev.stopPropagation(); return devPop(Number(b.getAttribute('data-i'))); }
      if (a === 'dev-ir') { if (ev.target.closest('input,label,button:not([data-cot="dev-ir"])')) return; CN.i = Number(b.getAttribute('data-i')); return repintar(); }
      if (a === 'fun') return funAbrir();
      if (a === 'mant') return mantPop();
      if (a === 'ter') return terPop();
      if (a.indexOf('inc:') === 0) return incPop(a.slice(4));
    };
    el.onchange = function (ev) {
      if (_montado !== 'cot') return;
      var t = ev.target;
      if (t.closest('#re')) return reChange(t);
      if (!CN) return;
      if (t.id === 'cot-emp') { CN.empresa = t.value; CN.sponsors = []; var cs = C.ini.contactos.filter(function (c) { return c.empresa === CN.empresa; }); if (cs.length === 1) CN.sponsors = [cs[0].id];
        repintar(); CN.devs.forEach(function (v, i) { estimar(i); }); return auto(); }
      if (t.id === 'cot-sp' && t.value) { CN.sponsors.push(t.value); repintar(); return auto(); }
      if (t.id === 'cot-ow' && t.value) { CN.owners.push(t.value); repintar(); return auto(); }
      if (t.id === 'cot-nom') { CN.nombre = t.value.trim(); return auto(); }
      if (t.id === 'cot-min') { CN.minuta.texto = t.value; if (!CN.minuta.objetivo || CN.minuta.objetivo === CN.minuta._obj) { CN.minuta.objetivo = t.value; CN.minuta._obj = t.value; } return auto(); }
      if (t.hasAttribute('data-cot-ck')) { var k = t.getAttribute('data-cot-ck'), v = dev();
        if (k === 'mant') { v.mant.on = t.checked; if (t.checked) { if (!v.mant.manual) { v.mant.hs = mantHs(v); v.mant.abono = Math.round(v.mant.hs * soporte()); } mantPop(); } return cambio(); }
        if (k === 'ter') { if (t.checked) return terPop(); delete v.ext._terceros; return cambio(); }
        if (k.indexOf('inc:') === 0) { var mid = k.slice(4); if (t.checked) { v.r[mid] = 'Sí'; incPop(mid); } else { delete v.r[mid]; limpiar(v, mid); } return cambio(); }
      }
    };
  };
  VISTAS.cot.precargar = cargar;
})();

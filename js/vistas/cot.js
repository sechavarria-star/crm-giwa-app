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
   Por desarrollo: Incluye (Mantenimiento propio o compartido, Costos que paga
   GIWA), Funcionalidades (cuestionario en tres zonas: por contestar · incluye y
   por definir · Lo que suma) y Lo que suma con el análisis del abono (12/11/2026).
   En la reunión: minuta o README, tildar desde el texto (función cot-interpretar).
   Reutilizar: un proyecto anterior para otra empresa, en un solo modal.
   El alta se guarda sola en este navegador hasta que se graba.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var C = { ini: null, cat: {}, sub: 'lista', ver: null };   // ini = cot_inicio · cat = catálogo por tipo
  var CN = null, _t = {}, POP = '';
  var LS = 'cot-alta-v2';
  var ETAPAS = ['Diseño', 'Configuración', 'Pruebas', 'Producción'];
  var MIN = [['problema', 'Problema'], ['situacion', 'Situación actual'], ['objetivo', 'Objetivo'], ['acuerdos', 'Acuerdos'],
             ['pendientes', 'Pendientes'], ['proximos', 'Próximos pasos'], ['decision', 'Fecha de decisión']];
  // Costos que paga GIWA (12/11/2026): infraestructura, consumo de IA y, si se ofrece, Meta (se traslada en el abono)
  var TER_CAT = ['Canales', 'Consumo (IA)', 'Infraestructura'];
  // Respuestas en íconos chicos (12/11/2026): Sí verde · Por definir ámbar · No gris
  var RESP = [['Sí', 'check', 'Sí', 'si'], ['Pendiente', 'arena', 'Por definir', 'pe'], ['No', 'cerrar', 'No', 'no']];

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

  // Tipo de agente IA (11/11/2026): la base sale de cot_config (completo 32 h, sencillo y evolución configurables)
  var ESCALA = { completo: 'Completo', sencillo: 'Sencillo', evolucion: 'Evolución de uno existente' };
  // ── la cotización en memoria (mismos campos que el Apps Script) ──
  function vacio() { return { id: '', tipo: '', titulo: '', objetivo: '', mejora: false, escala: '', r: {}, cant: {}, etapa: {}, notas: {}, ext: {}, base: {}, na: {}, precio: 0,
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
    return Math.round((V.mant_base + (hay(R.wa) ? V.mant_canal : 0) + (hay(R.ig) ? V.mant_canal : 0) + (hay(R.rw) ? V.mant_integ : 0) + (aud(v) ? V.mant_aud || 0 : 0)) * 100) / 100;
  }
  // Auditoría de conversaciones: es mensual, suma al mantenimiento (cot_config.mant_hs_auditoria)
  function aud(v) { return Object.keys(sel(v)).some(function (id) { var m = mod(v, id); return m && /auditor/i.test(m.nombre); }); }
  function mantTxt(v) { return 'monitoreo, reunión mensual, análisis y ajustes' + (aud(v) ? ', auditoría de conversaciones' : ''); }
  function horasDe(v, id) {
    var m = mod(v, id); if (!m || !si(v, id) || v.etapa[id] === 'futura') return 0;
    return m.horas * m.factor * (m.instancia ? (v.cant[id] || 1) : 1) + hijas(v, id).reduce(function (s, x) { return s + horasDe(v, x.id); }, 0);
  }
  // Pendiente = Por definir, o una madre en Sí con opciones sin contestar
  function pend(v) { return mods(v).filter(function (m) { if (v.r[m.id] === 'Pendiente') return true; var hs = hijas(v, m.id); return si(v, m.id) && hs.length && !hs.some(function (x) { return est(v, x.id); }); }); }
  function items(x) { return !x ? [] : (x.items || (x.cid ? [{ cid: x.cid, cantidad: x.cantidad || 1 }] : [])); }
  function precioC(c) { return c ? (Number(c.ars) || Number(c.usd) * tc()) : 0; }
  // Costos asociados (12/11/2026): cada ítem dice de quién es (GIWA o Cliente); los externos a mano traen nombre y monto
  function contr(cid) { return C.ini.contrataciones.filter(function (k) { return k.id === cid; })[0] || null; }
  function pagaDe(x, y) { return (y.paga || (x && x.paga) || 'Cliente') === 'GIWA' ? 'GIWA' : 'Cliente'; }
  function itemMes(y) { if (!y.cid) return y.rec === 'Único' ? 0 : Number(y.monto) || 0; return precioC(contr(y.cid)) * (y.cantidad || 0); }
  function extTot(x) { return Math.round(items(x).reduce(function (s, y) { return s + itemMes(y); }, 0)); }
  function extMes(v, paga) {
    var t = 0, P = paga === 'GIWA' ? 'GIWA' : 'Cliente';
    Object.keys(v.ext).forEach(function (id) { var x = v.ext[id];
      if (id !== '_terceros' && (!si(v, id) || v.etapa[id] === 'futura')) return;
      items(x).forEach(function (y) { if (pagaDe(x, y) === P) t += itemMes(y); }); });
    return Math.round(t);
  }
  // Meta que paga GIWA y traslada en el abono (Canales dentro de los costos que paga GIWA)
  function metaGiwa(v) { var x = v.ext._terceros; if (!x) return 0;
    return Math.round(items(x).reduce(function (s, y) { var c = contr(y.cid); return s + (c && c.categoria === 'Canales' && pagaDe(x, y) === 'GIWA' ? itemMes(y) : 0); }, 0)); }
  function empresa() { return (C.ini.empresas || []).filter(function (e) { return e.id === CN.empresa; })[0] || null; }
  function tipoNom(id) { var t = (C.ini.tipos || []).filter(function (x) { return x.id === id; })[0]; return t ? t.nombre : id; }

  // El motor (estimar_desarrollo), con un respiro para no llamar en cada tilde
  function estimar(i) {
    clearTimeout(_t[i]);
    _t[i] = setTimeout(async function () {
      var v = CN.devs[i]; if (!v || !v.tipo) return;
      try {
        v.est = await rpc('estimar_desarrollo', { tipo: v.tipo, empresa_id: CN.empresa || '', opts: { sel: sel(v), cant: v.cant, mejora: !!v.mejora, escala: v.escala || '' } });
        if (!v.est.ok) { v.err = v.est.msg; v.est = null; } else v.err = '';
        if (v.est && !v.mant.manual) { v.mant.hs = mantHs(v); v.mant.abono = Math.round(v.mant.hs * soporte()); }
        v.mant.exc = Math.round(soporte());
        var ids = ((v.est && v.est.detalle) || []).map(function (d) { return d.id; });
        v.ref = ids.length ? await rpc('cot_referencia', { tipo: v.tipo, ids: ids, pid: CN.pid || '' }) : null;
        v.an = v.est ? await rpc('cot_analisis', { o: { tipo: v.tipo, horas: v.est.horas, precio: total(v), abono: propio(v) ? v.mant.abono || 0 : 0,
          mant_hs: propio(v) ? v.mant.hs : 0, vh: vh(v), extra_mes: extMes(v, 'GIWA') } }) : null;
      } catch (e) { v.err = e.message; v.est = null; }
      repintar(); auto();
    }, 300);
  }

  // ── pintar ───────────────────────────────────────────────────
  function pintar(el) {
    if (_montado !== 'cot') return;
    var tabs = uiTabs([['lista', 'Borradores y prospectos', 'data-cot="sub" data-s="lista"'], ['reunion', 'En la reunión', 'data-cot="sub" data-s="reunion"'], ['nuevo', CN && CN.pid ? ['Editar', (empresa() || {}).nombre, CN.nombre].filter(Boolean).join(' · ') : 'Nuevo proyecto', 'data-cot="sub" data-s="nuevo"']],
                      C.sub === 'ver' ? 'lista' : C.sub);
    var cuerpo = C.sub === 'nuevo' ? htmlEditor() : C.sub === 'ver' ? htmlVer() : C.sub === 'reunion' ? htmlReunion() : htmlLista();
    el.innerHTML = uiHd('Cotizador', 'Cotizar un proyecto por funcionalidad, guardarlo como borrador y crearlo como prospecto.',
      uiBtn('Reutilizar proyecto', 'repetir', 's', 'data-cot="reutilizar"') + uiBtn('Carga rápida', 'mas', 's', 'data-cot="rapida"')) + tabs + '<div id="cot-c">' + cuerpo + '</div>';
  }
  function repintar() { var c = document.getElementById('cot-c'); if (!c || C.sub !== 'nuevo') return; edGuardar(); c.innerHTML = htmlEditor(); if (abierto('m-fun')) funPintar(); if (abierto('m-cor')) corPintar(); }
  // Qué desplegables de la ventana de edición están abiertos (se conserva al repintar)
  C.edAb = {};
  function edGuardar() { document.querySelectorAll('#cot-c [data-ed]').forEach(function (d) { C.edAb[d.getAttribute('data-ed')] = d.classList.contains('open'); }); }
  function edOpen(k, def) { return C.edAb[k] !== undefined ? C.edAb[k] : def; }
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
    // La minuta es una exportación: aparece recién cuando el proyecto está guardado (12/11/2026)
    var acc = (alta ? '' : uiBtn('Exportar minuta', 'documento', 's', 'data-cot="minuta"')) +
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
    var cliente = '<div class="g2 cot-ed-g"><div class="fg"><label class="fl" for="cot-emp">Empresa <span class="req">*</span></label><select class="fc" id="cot-emp"><option value="">— Empresa —</option>' +
        C.ini.empresas.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === CN.empresa ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select>' +
        (e ? '<div class="u-s11-mt">' + uiTier(e.tier) + ' × <span class="ui-num">' + String(e.mult).replace('.', ',') + '</span></div>' : '') + '</div>' +
      '<div class="fg"><label class="fl" for="cot-nom">Título del proyecto <span class="req">*</span></label><input class="fc" id="cot-nom" value="' + esc(CN.nombre) + '"></div>' +
      '<div class="fg"><label class="fl" for="cot-cierre">Cierre probable de la negociación</label><input class="fc" type="date" id="cot-cierre" value="' + esc(CN.fecha_cierre || '') + '"></div>' +
      '<div class="fg"><label class="fl" for="cot-sp">Sponsors</label><select class="fc" id="cot-sp"><option value="">' + (CN.empresa ? '+ Agregar sponsor' : 'Elegí la empresa') + '</option>' +
          cs.filter(function (c) { return CN.sponsors.indexOf(c.id) < 0; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>'; }).join('') + '</select>' + sp +
          (CN.empresa ? '<button type="button" class="ui-lnk ui-azul" data-cot="contacto">+ Contacto nuevo</button>' : '') + '</div>' +
        '<div class="fg"><label class="fl" for="cot-ow">Responsables</label><select class="fc" id="cot-ow"><option value="">+ Agregar responsable</option>' +
          (C.ini.usuarios || []).filter(function (u) { return CN.owners.indexOf(u.mail) < 0; }).map(function (u) { return '<option value="' + esc(u.mail) + '">' + esc(u.nombre) + '</option>'; }).join('') + '</select>' + ow + '</div></div>' +
      '<div class="fg"><div class="u-row8"><label class="fl u-f1" for="cot-min">Resumen ejecutivo</label>' +
        uiIb('buscar', 'Buscar una minuta guardada', '', 'data-cot="min-buscar"') + '</div><textarea class="fc" id="cot-min" rows="3">' + esc(CN.minuta.texto || '') + '</textarea></div>';
    h += uiDesp({ t: 'Datos del cliente', open: edOpen('datos', alta), attrs: 'data-ed="datos"' }, cliente);
    // Desarrollos: cada uno se abre con un clic; el mantenimiento es un desarrollo aparte, con su lápiz
    var n = 0, lista = ds.length ? CN.devs.map(function (d, i) { if (!d.tipo) return ''; n++; var x = tarjetaDev(d, i, n); if (propio(d)) n++; return x; }).join('')
      : '<div class="ui-nota-t">Todavía no hay desarrollos. Tocá «Nuevo desarrollo».</div>';
    h += uiDesp({ t: 'Desarrollos', n: n, open: true, v: '<span class="ui-num">' + fmt(tot) + '</span>' + (ab ? ' · <span class="ui-num ui-p-abono">' + fmt(ab) + '/mes</span>' : '') },
      lista + '<div class="ui-barra">' + uiBtn('Nuevo desarrollo', 'mas', 's', 'data-cot="dev-nuevo"') + '</div>');
    // Tres columnas (mock aprobado): datos y desarrollos · análisis económico · Lo que suma (fijos al bajar)
    return '<div class="cot-ed"><div class="cot-ed-c">' + h + '</div><div class="cot-c1 cot-ed-s">' + analisisHtml(dev()) + '</div><div class="cot-c3 cot-lat cot-ed-s">' + lateral(dev(), true) + '</div></div>';
  }
  // Un desarrollo: número, tipo y título, total y lápiz (datos del desarrollo); abierto, lo que incluye. Debajo, su mantenimiento.
  function tarjetaDev(d, i, n) {
    var on = i === CN.i;
    var h = '<div class="ui-dev' + (on ? ' open' : '') + '" data-cot="dev-ir" data-i="' + i + '">' +
      '<span class="ui-dev-barra ui-e-prospecto"></span><span class="ui-ch">' + uiIco('derecha') + '</span><span class="ui-tipo ui-e-prospecto">' + uiIco('tablero') + '</span>' +
      '<div><div class="ui-dev-n"><span class="ui-num">' + n + '</span>. ' + esc(tipoNom(d.tipo)) + ' · ' + esc(d.titulo || 'Sin título') + (ESCALA[d.escala] && d.escala !== 'completo' ? ' <span class="ui-nota-t">· ' + ESCALA[d.escala].toLowerCase() + '</span>' : d.mejora ? ' <span class="ui-nota-t">· mejora</span>' : '') + '</div>' +
        '<div class="ui-sub-t">' + esc(d.objetivo || 'Sin alcance') + '</div></div>' +
      '<div class="ui-dev-der"><span class="ui-num">' + (d.est ? fmt(total(d)) : '…') + '</span><span class="ui-fila-ic">' + uiAcc('editar', 'data-cot="dev-editar" data-i="' + i + '"') + '</span></div></div>';
    if (on) h += '<div class="ui-devc">' + incluye(d) + '</div>';
    if (propio(d)) h += '<div class="cot-mant-f"><span class="ui-f1"><span class="ui-num">' + (n + 1) + '</span>. <span class="ui-p-abono">Mantenimiento</span> · ' + esc(d.titulo || tipoNom(d.tipo)) +
      ' <span class="ui-nota-t">· <span class="ui-num">' + h1(d.mant.hs) + '</span> h por mes · ' + mantTxt(d) + ' · IPC cada <span class="ui-num">3</span> meses</span></span>' +
      '<span class="ui-num ui-p-abono">' + fmt(d.mant.abono || 0) + '/mes</span><span class="ui-fila-ic">' + uiIb('editar', 'Editar el mantenimiento', 'edi', 'data-cot="mant-i" data-i="' + i + '"') +
      uiIb('borrar', 'Quitar el mantenimiento', 'bor', 'data-cot="mant-quitar" data-i="' + i + '"') + '</span></div>';
    return h;
  }
  // Stack necesario: sale de las respuestas (dónde corre, canales, modelo, integraciones); lo que falta confirmar, en ámbar
  function stack(v) {
    var R = C.ini.reglas, p = [];
    mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] !== 'futura' && !esBase(m) && m.padre && /canal|infraestructura|dónde|modelo|datos/i.test(m.bloque + ' ' + (mod(v, m.padre) || {}).pregunta) && !hijas(v, m.id).some(function (x) { return si(v, x.id); }); })
      .forEach(function (m) { p.push(esc(nom(m))); });
    (R.integ || []).filter(function (id) { return si(v, id); }).forEach(function (id) {
      var api = hijas(v, id).filter(function (x) { return /api/i.test(x.pregunta + ' ' + x.nombre); })[0];
      p.push(esc(v.notas[id] || nom(mod(v, id))) + (api && !est(v, api.id) ? ' <span class="ui-p-pendiente">(API por confirmar)</span>' : api && si(v, api.id) ? ' <span class="ui-nota-t">(sin API)</span>' : '')); });
    var wa = (R.wa || []).filter(function (id) { return si(v, id); })[0], meta = wa ? hijas(v, wa).filter(function (x) { return /meta/i.test(x.pregunta + ' ' + x.nombre); })[0] : null;
    if (meta && est(v, meta.id) !== 'No') p.push('<span class="ui-p-pendiente">' + (si(v, meta.id) ? 'cuenta de Meta sin verificar' : 'falta confirmar si la cuenta de Meta está verificada') + '</span>');
    return p.join(' · ');
  }
  // Lo que incluye un desarrollo abierto: stack, costos asociados, FUNCIONALIDADES y Más información
  function incluye(v) {
    var h = '', st = stack(v);
    if (st) h += '<div class="cot-fila"><span class="cot-fila-l">Stack necesario</span><span class="ui-f1">' + st + '<span class="cot-sub">Sale de las respuestas: dónde corre, canales, modelo de IA e integraciones.</span></span></div>';
    if (!v.mant.on) h += '<div class="cot-fila"><span class="cot-fila-l">Mantenimiento</span><span class="ui-f1 ui-nota-t">Sin mantenimiento mensual.</span>' + uiBtn('Mantenimiento', 'mas', 's', 'data-cot="mant-on"') + '</div>';
    // Costos asociados: lo que paga GIWA y lo que paga el cliente; un solo botón «+ Costos»
    var tx = v.ext._terceros, its = items(tx), lin = function (y) { var c = contr(y.cid);
      return '<div class="ui-kv cot-sel-i"><span>' + esc(c ? c.producto : (y.nombre || 'Costo externo')) + (c ? ' · <span class="cot-n">' + h1(y.cantidad) + '</span> ' + esc((c.unidad || '').toLowerCase()) : '') + '</span>' +
        '<span class="ui-num">' + fmt(Math.round(y.cid ? itemMes(y) : Number(y.monto) || 0)) + (y.cid || y.rec !== 'Único' ? '/mes' : ' único') + '</span></div>'; };
    var grp = function (P) { var L = its.filter(function (y) { return pagaDe(tx, y) === P; }); return L.length ? '<div class="cot-sel-n u-mt6">' + (P === 'GIWA' ? 'Paga GIWA' : 'Paga el cliente') + '</div>' + L.map(lin).join('') : ''; };
    h += uiDesp({ th: '<span class="ui-lat-h">Costos asociados</span>', n: its.length || '', open: edOpen('costos', false), attrs: 'data-ed="costos"',
        v: '<span class="ui-nota-t">GIWA <span class="ui-num">' + fmt(extMes(v, 'GIWA')) + '/mes</span> · Cliente <span class="ui-num">' + fmt(extMes(v, 'Cliente')) + '/mes</span></span>' + uiBtn('Costos', 'mas', 's', 'data-cot="ter"') },
      its.length ? grp('GIWA') + grp('Cliente') : '<div class="ui-nota-t">Sin costos asociados. Tocá «+ Costos».</div>');
    // FUNCIONALIDADES: lo seleccionado, por funcionalidad, con el lápiz que abre «Corregir»
    var fs = Object.keys(sel(v)).filter(function (id) { var m = mod(v, id); return m && m.horas > 0 && !esBase(m); }), npe = pend(v).length;
    h += uiDesp({ th: '<span class="ui-lat-h">Funcionalidades</span> <span class="ui-nota-t cot-nt">· <span class="ui-num">' + fs.length + '</span> tildadas · <span class="ui-num">' + h1(v.est ? v.est.horas : 0) + '</span> h' +
        (npe ? ' · <span class="ui-p-pendiente"><span class="ui-num">' + npe + '</span> por definir</span>' : '') + '</span>', open: edOpen('fun', true), attrs: 'data-ed="fun"',
        v: uiBtn('Abrir cuestionario', 'lista', 's', 'data-cot="fun"') }, '<div class="cot-c2">' + seleccion(v, true) + '</div>');
    // Más información: forma de pago, inicio, duración, garantía, descripción y los valores de hora usados
    var fg = function (id, l, ctl) { return '<div class="fg"><label class="fl" for="' + id + '">' + l + '</label>' + ctl + '</div>'; };
    h += uiDesp({ th: '<span class="ui-lat-h">Más información</span>', open: edOpen('mas', false), attrs: 'data-ed="mas"' },
      '<div class="g2">' +
        fg('dv-fp', 'Forma de pago', '<select class="fc" id="dv-fp" data-cot-v="forma_pago"><option value="">—</option>' + (C.ini.modelos || []).map(function (o) { return '<option value="' + esc(o.id) + '"' + (v.forma_pago === o.id ? ' selected' : '') + '>' + esc(o.nombre) + '</option>'; }).join('') + '</select>') +
        fg('dv-ini', 'Fecha de inicio', '<input class="fc" type="date" id="dv-ini" data-cot-v="inicio" value="' + esc(v.inicio || '') + '">') +
        fg('dv-sem', 'Duración en semanas', '<input class="fc u-tr ui-num" type="number" min="0" id="dv-sem" data-cot-v="semanas" value="' + esc(v.semanas || '') + '">') +
        fg('dv-gar', 'Días de garantía', '<input class="fc u-tr ui-num" type="number" min="0" id="dv-gar" data-cot-v="garantia" value="' + esc(v.garantia || '') + '">') + '</div>' +
      fg('dv-desc', 'Descripción', '<textarea class="fc" rows="2" id="dv-desc" data-cot-v="objetivo">' + esc(v.objetivo || '') + '</textarea>') +
      '<div class="ui-nota-t">Valor hora <span class="ui-num">' + fmt(Math.round(vh(v))) + '</span> · ' + esc((v.est && v.est.tier) || 'sin Tier') + ' · hora de soporte <span class="ui-num">' + fmt(Math.round(soporte())) + '</span> · <span class="ui-num">' + h1(v.est ? v.est.horas : 0) + '</span> h estimadas</div>');
    return h;
  }
  // Análisis económico (cot_analisis): referencia de mercado, alertas y qué conviene sumar o sacar. Son sugerencias: no cambian nada.
  function analisisHtml(v) {
    var tit = '<div class="ui-lat-h cot-t-az">Análisis económico</div>';
    if (!v || !v.tipo) return tit + '<div class="ui-nota-t">Cargá un desarrollo.</div>';
    var a = v.an; if (!a || !v.est) return tit + '<div class="ui-nota-t">Calculando…</div>';
    var row = function (txt, monto, cls) { return '<div class="cot-an-i"><span>' + txt + '</span>' + (monto != null ? '<div class="cot-an-m' + (cls ? ' ' + cls : '') + '">' + monto + '</div>' : '') + '</div>'; };
    var dot = function (c) { return '<span class="cot-dot ' + c + '"></span>'; };
    var M = a.mercado, h = tit + '<div class="ui-lat-h u-mt10">Referencia de mercado</div>';
    if (M) {
      h += row(esc(M.rol) + ' · semi senior · USD <span class="cot-n">' + M.usd_min + '</span>–<span class="cot-n">' + M.usd_max + '</span> la hora<span class="cot-sub">' + esc(M.fuente || '') + ' · <span class="cot-n">' + ff(M.fecha) + '</span> · para <span class="cot-n">' + h1(v.est.horas) + '</span> h</span>',
        '<span class="ui-num">' + fmt(M.ars_min) + ' – ' + fmt(M.ars_max) + '</span>');
      if (M.usd_hora) h += row('Tu precio · <span class="cot-n">' + fmt(total(v)) + '</span> = USD <span class="cot-n">' + h1(M.usd_hora) + '</span> la hora',
        M.posicion === 'debajo' ? 'por debajo del mercado' : M.posicion === 'encima' ? 'por encima del mercado' : 'dentro del mercado', M.posicion === 'dentro' ? 'ui-e-finalizado' : 'ui-p-pendiente');
    } else h += '<div class="ui-nota-t">Sin referencia de mercado para este tipo de desarrollo.</div>';
    if (v.ref) h += row('Parecido a lo que ya vendiste · ' + esc(v.ref.cliente || '') + ' · ' + esc(v.ref.que || ''), '<span class="ui-num">' + fmt(v.ref.cobrado) + '</span>');
    var al = (a.alertas || []).slice(), np = pend(v).length;
    h += '<div class="ui-lat-h u-mt10">Alertas</div>';
    if (!al.length && !np) h += '<div class="ui-nota-t">Sin alertas.</div>';
    al.forEach(function (x) { h += row(dot(x.nivel === 'error' ? 'ui-p-error' : 'ui-p-pendiente') + esc(x.texto) + (x.sop ? ' (<span class="cot-n">' + fmt(x.sop) + '</span> contra <span class="cot-n">' + fmt(x.costo_h) + '</span>)' : ''),
      x.monto ? '<span class="ui-num">' + fmt(x.monto) + (x.mensual ? '/mes' : '') + '</span>' : null, x.nivel === 'error' ? 'ui-p-error' : 'ui-p-pendiente'); });
    if (np) h += row(dot('ui-p-pendiente') + 'Quedan <span class="cot-n">' + np + '</span> pregunta' + (np === 1 ? '' : 's') + ' por definir', null);
    // Qué conviene sumar o sacar
    var su = (a.sugerencias || []).map(function (x) { return row('<span class="ui-e-finalizado">Sumar</span> · ' + esc(x.texto) + ' (<span class="cot-n">' + fmt(x.a) + '</span>' + (x.mensual ? ' por mes' : '') + ')', '<span class="ui-num">+' + fmt(x.monto) + (x.mensual ? '/mes' : '') + '</span>', 'ui-e-finalizado'); });
    var V = C.ini.valores || {};
    if (v.tipo === 'IA' && propio(v) && !aud(v) && V.mant_aud) su.push(row('<span class="ui-e-finalizado">Sumar</span> · auditoría de conversaciones en el mantenimiento (<span class="cot-n">' + h1(V.mant_aud) + '</span> h por mes)', '<span class="ui-num">+' + fmt(Math.round(V.mant_aud * soporte())) + '/mes</span>', 'ui-e-finalizado'));
    mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] === 'futura' && !madreFut(v, m.id); }).forEach(function (m) {
      su.push(row('<span class="ui-e-finalizado">Sumar</span> · ' + esc(nom(m)) + ', hoy en etapa futura (<span class="cot-n">' + h1(hMod(v, m)) + '</span> h)', '<span class="ui-num">+' + fmt(Math.round(hMod(v, m) * vh(v))) + '</span>', 'ui-e-finalizado')); });
    var H = hEst(v), big = mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] !== 'futura' && !esBase(m) && m.padre && H[m.id] > 0; }).sort(function (x, y) { return H[y.id] - H[x.id]; })[0];
    if (big) su.push(row('<span class="ui-nota-t">Para bajar el precio</span> · pasar ' + esc(nom(big)) + ' a etapa futura (<span class="cot-n">' + h1(H[big.id]) + '</span> h)', '<span class="ui-num">−' + fmt(Math.round(H[big.id] * vh(v))) + '</span>'));
    h += '<div class="ui-lat-h u-mt10">Qué conviene sumar o sacar</div>' + (su.length ? su.join('') : '<div class="ui-nota-t">Nada para sugerir.</div>') +
      '<div class="ui-nota-t u-mt10">Son sugerencias: no cambian nada hasta que las tildes en el cuestionario o edites el precio.</div>';
    return h;
  }

  // Estado de pantalla del cuestionario (no se guarda): qué pregunta está abierta, qué notas se ven, filtro
  var UI = { abre: {}, nota: {}, solo: false };
  function h1(n) { return String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ','); }
  function hMod(v, m) { return m.horas * m.factor * (m.instancia ? (v.cant[m.id] || 1) : 1); }
  function esDe(v, x, id) { var m = x; while (m && m.padre) { if (m.padre === id) return true; m = mod(v, m.padre); } return false; }
  // Lo tildado debajo de una madre, hasta la última opción tildada (sin etapa futura)
  function tildadas(v, id, fut) {
    var o = [];
    hijas(v, id).forEach(function (x) { if (!si(v, x.id) || (v.etapa[x.id] === 'futura') !== !!fut) return;
      var d = tildadas(v, x.id, fut); if (d.length) o = o.concat(d); else o.push(x); });
    return o;
  }
  function hEst(v) { var o = {}; ((v.est && v.est.detalle) || []).forEach(function (d) { o[d.id] = (o[d.id] || 0) + Number(d.horas); }); return o; }

  // Lo que suma (12/11/2026, mock aprobado): precio final · sugerido · análisis del abono · análisis interno · etapa futura.
  // editable: en la ventana de edición el precio final se escribe (redondeos); «Volver al sugerido» lo devuelve al cálculo.
  function lateral(v, editable) {
    var tit = '<div class="ui-lat-h cot-t-ok">Lo que suma</div>';
    if (!v || !v.tipo) return tit + '<div class="ui-nota-t">Cargá un desarrollo.</div>';
    if (v.err) return tit + uiAviso(v.err, 'adv');
    var e = v.est; if (!e) return tit + '<div class="ui-nota-t">Calculando…</div>';
    var kv = function (l, x, cls) { return '<div class="ui-kv"><span>' + l + '</span><span class="ui-num' + (cls ? ' ' + cls : '') + '">' + x + '</span></div>'; };
    var V = C.ini.valores || {}, r = v.ref, h = tit;
    if (!CN.empresa) h += '<div class="ui-nota-t">Sin cliente el precio va sin Tier (×1). Elegí la empresa.</div>';
    if (r) { var pct = r.cobrado ? Math.round((total(v) / r.cobrado - 1) * 1000) / 10 : 0;
      h += '<div class="ui-nota-t u-mb6">Parecido a lo que ya cotizaste: ' + esc(r.cliente || '') + ' · ' + esc(r.que || '') + ' · cobrado <span class="ui-num">' + fmt(r.cobrado) + '</span>. Éste va <span class="ui-num">' +
        String(Math.abs(pct)).replace('.', ',') + ' %</span> ' + (pct >= 0 ? 'por encima.' : 'por debajo.') + '</div>'; }
    h += '<div class="cot-pf"><span class="ui-lbl">Precio final' + (editable ? ' · lo podés escribir' : '') + '</span>' +
      (editable ? '<input class="fc ui-num cot-pf-in" id="cot-precio" type="number" min="0" data-monto value="' + Math.round(total(v)) + '" aria-label="Precio final">' +
        (v.precio > 0 ? '<button type="button" class="ui-lnk ui-gris cot-pf-sug" data-cot="precio-sug">Volver al sugerido</button>' : '')
        : '<span class="ui-num ui-p-contratado">' + fmt(total(v)) + '</span>') + usd(total(v)) + '</div>' +
      '<div class="cot-sec">' + kv('Sugerido · <span class="cot-n">' + h1(e.horas) + '</span> h', fmt(sugerido(v))) + '</div>';
    // Análisis del abono
    var ab = propio(v) ? v.mant.abono || 0 : 0, meta = metaGiwa(v), cMes = Math.round((propio(v) ? v.mant.hs : 0) * (V.costo || 0) + extMes(v, 'GIWA'));
    var mMes = ab + meta - cMes, m12 = total(v) - (e.costo_ars || 0) + 12 * mMes, falta = (e.costo_ars || 0) - total(v);
    h += '<div class="ui-lat-h u-mt10">Análisis del abono</div>';
    if (!propio(v)) h += '<div class="ui-nota-t">' + (v.mant.on ? 'El mantenimiento es compartido con otro desarrollo.' : 'Sin mantenimiento: no hay abono mensual.') + '</div>';
    else h += kv('Abono · <span class="cot-n">' + h1(v.mant.hs) + '</span> h por mes', fmt(ab), 'ui-p-abono') + (meta ? kv('Meta a cargo de GIWA, se traslada', fmt(meta) + '/mes', 'ui-p-abono') : '');
    h += kv('Relación a <span class="cot-n">12</span> meses', fmt(total(v) + 12 * (ab + meta)));
    if (CN.devs.filter(function (d) { return d.tipo; }).length > 1) h += kv('Total del proyecto', fmt(CN.devs.reduce(function (s, d) { return s + (d.tipo ? total(d) : 0); }, 0)), 'ui-p-contratado');
    // Análisis interno, en gris
    var pctH = V.giwa ? Math.round((1 - (V.costo || 0) / V.giwa) * 100) : 0;
    h += '<div class="cot-int"><div class="ui-lat-h u-mt10">Análisis interno</div>' +
      '<div class="ui-kv"><span>Valor interno de la hora<span class="cot-sub"><span class="cot-n">' + pctH + ' %</span> menos que la hora de venta (<span class="cot-n">' + fmt(V.giwa) + '</span>)</span></span><span class="ui-num">' + fmt(V.costo) + '</span></div>' +
      kv('Costo interno · <span class="cot-n">' + h1(e.horas) + '</span> h', fmt(e.costo_ars)) +
      kv('Costo por mes' + (propio(v) ? ' · <span class="cot-n">' + h1(v.mant.hs) + '</span> h' : ''), fmt(cMes)) +
      kv('Margen a <span class="cot-n">12</span> meses', fmt(m12), m12 >= 0 ? 'ui-e-finalizado' : 'ui-p-error') +
      '<div class="ui-kv"><span>Recupero del costo</span><span class="' + (falta <= 0 || mMes > 0 ? 'ui-e-finalizado' : 'ui-p-error') + '">' +
        (falta <= 0 ? 'con la implementación' : mMes > 0 ? 'en <span class="cot-n">' + Math.ceil(falta / mMes) + '</span> meses' : 'no se recupera') + '</span></div>' +
      '<div class="ui-kv"><span>Dificultad</span><span>' + esc(e.dificultad || '—') + '</span></div></div>';
    // Etapa futura: posibles ventas del proyecto, no suman al precio de hoy
    var fut = mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] === 'futura' && !madreFut(v, m.id); });
    h += '<div class="ui-lat-h u-mt10 cot-t-vi">Etapa futura</div><div class="ui-nota-t">Posibles ventas del proyecto · no suman al precio de hoy</div>' +
      (fut.length ? fut.map(function (m) { var hx = hMod(v, m) + tildadas(v, m.id, true).reduce(function (s, x) { return s + hMod(v, x); }, 0);
        return kv(esc(nom(m)) + ' · <span class="cot-n">' + h1(hx) + '</span> h', fmt(Math.round(hx * vh(v))), 'ui-p-abono'); }).join('') : '<div class="ui-nota-t">Nada por ahora.</div>');
    return h;
  }

  // ── Cuestionario (Funcionalidades), tres columnas (mock aprobado 12/11/2026):
  //    Preguntas (azul) · Seleccionado (violeta, sólo lectura) · Lo que suma (verde) ──
  function bloques(v) { var o = []; raices(v).forEach(function (m) { if (!esBase(m) && o.indexOf(m.bloque) < 0) o.push(m.bloque); }); return o; }
  function madresDe(v, b) { return raices(v).filter(function (m) { return m.bloque === b && !esBase(m); }); }
  function faltan(v, b) { return v.na[b] ? [] : madresDe(v, b).filter(function (m) { var s = est(v, m.id); return !s || s === 'Pendiente'; }); }
  function funAbrir() {
    var v = dev(); if (!v || !v.tipo) return aviso('Cargá un desarrollo.');
    var m = modal('m-fun', 'Funcionalidades · ' + tipoNom(v.tipo) + ' · ' + ((empresa() || {}).nombre ? empresa().nombre + ' · ' : '') + (v.titulo || 'Sin título'), '<div id="fun-b"></div>',
      '<button class="btn bp" data-cerrar="m-fun">Listo</button>', 'md-xl');
    UI.abre = {}; m.onclick = clickFun; m.onchange = changeFun; m.oninput = function (ev) { if (ev.target.id === 'fun-bus') buscar(ev.target.value); };
    funPintar();
  }
  function funPintar() {
    var b = document.getElementById('fun-b'), v = dev(); if (!b || !v) return;
    var ab = {}; b.querySelectorAll('[data-bl]').forEach(function (d) { ab[d.getAttribute('data-bl')] = d.classList.contains('open'); });
    var bus = (document.getElementById('fun-bus') || {}).value || '';
    var base = raices(v).filter(esBase), hB = base.reduce(function (s, m) { return s + (si(v, m.id) ? m.horas * m.factor : 0); }, 0);
    var bl = bloques(v), primero = bl.filter(function (x) { return faltan(v, x).length; })[0];
    var falta = function (m) { var s = est(v, m.id), hs = hijas(v, m.id); return !s || s === 'Pendiente' || (si(v, m.id) && hs.length && !hs.some(function (x) { return est(v, x.id); })); };
    var preg = '<div class="ui-lat-h cot-t-az">Preguntas</div>' +
      '<div class="cot-tools"><input class="ui-campo ui-f1" id="fun-bus" placeholder="Buscar en el cuestionario…" aria-label="Buscar" value="' + esc(bus) + '">' +
        '<label class="u-row6 u-s11"><input type="checkbox" id="fun-solo"' + (UI.solo ? ' checked' : '') + '> Ver solo lo que falta definir</label></div>' +
      uiDesp({ t: 'Base del agente · siempre incluida', n: h1(hB) + ' h', attrs: 'data-bl="__base"', open: !!ab.__base },
        base.map(function (m) { return '<div class="ui-linea"><label class="u-row6 ui-f1"><input type="checkbox"' + (si(v, m.id) ? ' checked' : '') + ' data-resp="' + esc(m.id) + '" data-k="base"> ' + esc(nom(m)) + '</label>' +
          '<span class="ui-num ui-nota-t">' + h1(m.horas * m.factor) + ' h</span></div>'; }).join('')) +
      bl.map(function (x, i) {
        if (v.na[x]) return '<div class="cot-omit"><span class="ui-f1">' + (i + 1) + '. ' + esc(x) + ' · omitido</span><button type="button" class="ui-lnk ui-gris" data-fun="reabrir" data-b="' + esc(x) + '">Reabrir</button></div>';
        var ms = madresDe(v, x), f = faltan(v, x), vis = UI.solo ? ms.filter(falta) : ms;
        if (UI.solo && !vis.length) return '';
        return uiDesp({ t: (i + 1) + '. ' + x, n: f.length ? (ms.length - f.length) + ' de ' + ms.length : 'Listo', open: ab[x] !== undefined ? ab[x] : x === primero, attrs: 'data-bl="' + esc(x) + '"',
            v: f.length ? '<button type="button" class="ui-lnk ui-gris" data-fun="omitir" data-b="' + esc(x) + '">Omitir bloque</button>' : '' },
          vis.map(function (m) { return madre(v, m); }).join(''));
      }).join('');
    b.innerHTML = '<div class="cot-fun"><div class="cot-c1">' + preg + '</div><div class="cot-c2">' + seleccion(v, false) + '</div><div class="cot-c3 cot-lat">' + lateral(v) + '</div></div>';
    if (bus) buscar(bus);
  }
  // Una pregunta madre: Sí · No · Por definir en un grupo de íconos (el elegido en azul) y «Nota» a pedido.
  // Respondida, sus opciones se cierran en una línea con lo elegido; un clic las vuelve a abrir.
  // Lo sugerido se marca, pero no suma hasta que se tilda.
  function madre(v, m) {
    var s = est(v, m.id), q = esc(m.id), sii = s === 'Sí' || s === 'Futura', hs0 = hijas(v, m.id);
    var seg = '<span class="cot-seg" role="group" aria-label="Respuesta">' + RESP.map(function (k) { var on = s === k[0] || (k[0] === 'Sí' && s === 'Futura');
      return '<button type="button" class="cot-s' + (on ? ' on' : '') + '" data-resp="' + q + '" data-k="' + (on ? '' : k[0]) + '" aria-pressed="' + on + '" data-tip="' + k[2] + '" aria-label="' + k[2] + '">' + uiIco(k[1]) + '</button>'; }).join('') + '</span>';
    var conHijas = (sii || s === 'Pendiente') && hs0.length;
    var abierta = conHijas && (UI.abre[m.id] || (sii && !hs0.some(function (x) { return est(v, x.id); })));
    var cuerpo = '';
    if (conHijas && abierta) cuerpo = '<div class="cot-hijas">' + opciones(v, m.id, 1) + '</div>';
    else if (conHijas) { var t = mods(v).filter(function (x) { return si(v, x.id) && esDe(v, x, m.id); });
      cuerpo = '<button type="button" class="cot-res" data-fun="abre" data-id="' + q + '">' + uiIco('derecha') + '<span class="ui-f1">' +
        (t.length ? t.map(function (x) { return '<span' + (v.etapa[x.id] === 'futura' ? ' class="ui-p-abono"' : '') + '>' + esc(nom(x)) + '</span>'; }).join(' · ') : 'Elegí las opciones') + '</span>' +
        (sii && v.est ? '<span class="ui-num">' + h1(horasDe(v, m.id)) + ' h</span>' : '') + '</button>'; }
    var fut = sii && !hs0.length ? uiIb('calendario', s === 'Futura' ? 'Volver a la 1ª etapa' : 'Pasar a etapa futura', s === 'Futura' ? 'vio' : '', 'data-fun="futura" data-id="' + q + '"') : '';
    return '<div class="cot-q" data-txt="' + esc(((m.pregunta || '') + ' ' + m.nombre).toLowerCase()) + '"><div class="cot-q-t"><span class="ui-f1' + (s === 'Futura' ? ' ui-p-abono' : '') + '">' + esc(m.pregunta || m.nombre) +
      (m.horas ? ' <span class="ui-num ui-nota-t">' + h1(m.horas * m.factor) + ' h</span>' : '') + (m.sugerido && !s ? ' <span class="ui-nota-t">· sugerido</span>' : '') + '</span>' +
      fut + '<button type="button" class="ui-lnk ui-gris" data-fun="nota" data-id="' + q + '">Nota</button>' + seg + '</div>' +
      (sii && (abierta || !hs0.length) ? extras(v, m) : '') + cuerpo + (UI.nota[m.id] || v.notas[m.id] ? nota(v, m) : '') + '</div>';
  }
  // Seleccionado: por funcionalidad (el bloque), lo tildado con sus notas; Por definir; Etapa futura.
  // lapiz: en la ventana de edición cada funcionalidad tiene el lápiz que abre «Corregir».
  function seleccion(v, lapiz) {
    var H = hEst(v), por = {}, ord = [], h = lapiz ? '' : '<div class="ui-lat-h cot-t-vi">Seleccionado</div>';
    var hx = function (x) { return H[x.id] != null ? H[x.id] : hMod(v, x); };
    raices(v).filter(function (m) { return !esBase(m) && !v.na[m.bloque] && si(v, m.id) && v.etapa[m.id] !== 'futura'; })
      .forEach(function (m) { if (!por[m.bloque]) { por[m.bloque] = []; ord.push(m.bloque); } por[m.bloque].push(m); });
    if (!ord.length) h += '<div class="ui-nota-t">Lo que contestes con Sí aparece acá.</div>';
    ord.forEach(function (b) {
      var ids = mods(v).filter(function (x) { return x.bloque === b && si(v, x.id) && v.etapa[x.id] !== 'futura'; });
      var tot = ids.reduce(function (s, x) { return s + (H[x.id] || 0); }, 0) || por[b].reduce(function (s, m) { return s + horasDe(v, m.id); }, 0);
      var lin = [];
      por[b].forEach(function (m) { if (v.notas[m.id]) lin.push('<div class="cot-sel-n">' + esc(v.notas[m.id]) + '</div>');
        var t = tildadas(v, m.id); (t.length ? t : (hijas(v, m.id).length ? [] : [m])).forEach(function (x) {
          lin.push('<div class="ui-kv cot-sel-i"><span>' + esc(nom(x)) + (x.instancia && v.cant[x.id] > 1 ? ' ×' + v.cant[x.id] : '') +
            (x !== m && v.notas[x.id] ? '<span class="cot-sub">' + esc(v.notas[x.id]) + '</span>' : '') + '</span>' + (hx(x) ? '<span class="ui-num">' + h1(hx(x)) + ' h</span>' : '<span></span>') + '</div>'); }); });
      h += '<div class="cot-sel-t"><span class="ui-f1">' + esc(b) + '</span><span class="ui-num ui-nota-t">' + h1(tot) + ' h</span>' +
        (lapiz ? uiIb('editar', 'Corregir ' + b, 'edi', 'data-cot="corregir" data-b="' + esc(b) + '"') : '') + '</div>' + lin.join('');
    });
    var pe = raices(v).filter(function (m) { return !esBase(m) && !v.na[m.bloque] && est(v, m.id) === 'Pendiente'; });
    if (pe.length) h += '<div class="ui-lat-h u-mt10 ui-p-pendiente">Por definir · <span class="cot-n">' + pe.length + '</span></div>' +
      pe.map(function (m) { return '<div class="ui-kv cot-sel-i"><span class="ui-p-pendiente">' + esc(m.pregunta || nom(m)) + '</span>' +
        (lapiz ? uiIb('editar', 'Corregir', 'edi', 'data-cot="corregir" data-b="' + esc(m.bloque) + '"') : '<span></span>') + '</div>'; }).join('');
    var fu = mods(v).filter(function (m) { return si(v, m.id) && v.etapa[m.id] === 'futura' && !madreFut(v, m.id); });
    h += '<div class="ui-lat-h u-mt10 cot-t-vi">Etapa futura</div>' + (fu.length ? fu.map(function (m) {
      return '<div class="ui-kv cot-sel-i"><span class="ui-p-abono">' + esc(m.bloque) + ' · ' + esc(nom(m)) + '</span><span class="ui-num">' + h1(hMod(v, m)) + ' h</span></div>'; }).join('')
      : '<div class="ui-nota-t">Nada por ahora · se pasa con el ícono de calendario de cada opción tildada.</div>');
    if (!lapiz) h += '<div class="cot-sel-pie"><span class="ui-nota-t">La minuta sale de acá: lo relevado, por definir y etapa futura.</span>' +
      (CN.pid ? uiBtn('Exportar minuta', 'documento', 's', 'data-fun="minuta"') : '<span class="ui-nota-t">Disponible al guardar.</span>') + '</div>';
    return h;
  }
  function opciones(v, id, niv) {
    return hijas(v, id).map(function (m) { var on = si(v, m.id), fu = v.etapa[m.id] === 'futura', hh = m.horas * m.factor;
      return '<div class="cot-op" style="--niv:' + niv + '"><div class="cot-op-l"><label class="u-row6 ui-f1"><input type="checkbox"' + (on ? ' checked' : '') + ' data-resp="' + esc(m.id) + '" data-k="op"> ' +
        '<span class="ui-f1' + (fu ? ' ui-p-abono' : '') + '">' + esc(m.pregunta || m.nombre) + '</span></label>' + (hh ? '<span class="ui-num ui-nota-t">' + h1(hh) + ' h</span>' : '') +
        (on ? uiIb('calendario', fu ? 'Volver a la 1ª etapa' : 'Pasar a etapa futura', fu ? 'vio' : '', 'data-fun="futura" data-id="' + esc(m.id) + '"') : '') + '</div>' +
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
    var v = dev(), m0 = mod(v, id);
    if (m0 && !esBase(m0) && !(m0.padre && mod(v, m0.padre))) { UI.abre = {}; if (k === 'Sí' || k === 'Pendiente') UI.abre[id] = true; }
    if (!k) { delete v.r[id]; delete v.etapa[id]; limpiar(v, id); }
    else { v.r[id] = k; if (k === 'Sí' && madreFut(v, id)) v.etapa[id] = 'futura'; if (k !== 'Sí') { delete v.etapa[id]; limpiar(v, id); } }
    cambio();
  }
  function refrescar() { if (abierto('m-fun')) funPintar(); if (abierto('m-cor')) corPintar(); }
  function cambio() { refrescar(); repintar(); estimar(CN.i); auto(); }
  // Corregir (mock aprobado): una funcionalidad con sus preguntas y opciones; Ok deja el cambio aplicado, Cancelar lo descarta
  var COR = null;
  function corregir(b) {
    var v = dev(); if (!v) return;
    COR = { b: b, snap: JSON.stringify({ r: v.r, etapa: v.etapa, notas: v.notas, cant: v.cant, ext: v.ext, na: v.na }) };
    var m = modal('m-cor', 'Corregir · ' + b, '<div id="cor-b"></div><div class="ui-nota-t u-mt10">Al tocar Ok el cambio queda aplicado: se actualizan las funcionalidades seleccionadas y Lo que suma. Cancelar lo descarta.</div>',
      '<button class="btn bg" data-cor="cancelar">Cancelar</button><button class="btn bp" data-cor="ok">Ok</button>', 'md-sm');
    UI.abre = {};
    m.onclick = function (ev) { var x = ev.target.closest('[data-cor]');
      if (x) { if (x.getAttribute('data-cor') === 'cancelar' && COR) Object.assign(dev(), JSON.parse(COR.snap)); COR = null; closeM('m-cor'); return cambio(); }
      clickFun(ev); };
    m.onchange = changeFun;
    corPintar();
  }
  function corPintar() { var b = document.getElementById('cor-b'), v = dev(); if (!b || !COR || !v) return;
    b.innerHTML = madresDe(v, COR.b).map(function (m) { return madre(v, m); }).join('') || '<div class="ui-nota-t">Esta funcionalidad no tiene preguntas.</div>'; }
  function clickFun(ev) {
    var b = ev.target.closest('[data-resp],[data-fun]'); if (!b || b.tagName === 'INPUT') return;
    var v = dev();
    if (b.hasAttribute('data-resp')) return responder(b.getAttribute('data-resp'), b.getAttribute('data-k'));
    var a = b.getAttribute('data-fun'), id = b.getAttribute('data-id');
    if (a === 'omitir') { v.na[b.getAttribute('data-b')] = true; return cambio(); }
    if (a === 'abre') { var ya = UI.abre[id]; UI.abre = {}; if (!ya) UI.abre[id] = true; return refrescar(); }
    if (a === 'nota') { UI.nota[id] = !UI.nota[id]; return refrescar(); }
    if (a === 'minuta') return minuta();
    if (a === 'reabrir') { delete v.na[b.getAttribute('data-b')]; return cambio(); }
    if (a === 'futura') { var fu = v.etapa[id] === 'futura'; if (fu) delete v.etapa[id]; else v.etapa[id] = 'futura'; futHijas(v, id, !fu); return cambio(); }
    if (a === 'ext-quitar') { extSet(id, function (x) { x.items.splice(Number(b.getAttribute('data-i')), 1); }); return; }
    if (a === 'eval') return evaluar(id);
  }
  function changeFun(ev) {
    var t = ev.target, v = dev();
    if (t.id === 'fun-solo') { UI.solo = t.checked; return refrescar(); }
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
      '<div class="u-s11-mt">Incluye ' + mantTxt(v) + '. Hora de soporte <span class="ui-num">' + fmt(sop) + '</span>. Ajuste por IPC cada <span class="ui-num">3</span> meses. El monto es tuyo: cambialo si querés.</div>' +
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
  // Costos asociados (mock aprobado): tildás los servicios de Contrataciones, cargás la cantidad por mes y tocás de quién es.
  // Los externos se cargan a mano (nombre, monto, mensual o único), como lo de URBA.
  function terPintar() {
    var v = dev(), x = v.ext._terceros || { items: [] }, L = C.ini.contrataciones, its = items(x);
    var de = function (cid) { return its.filter(function (y) { return y.cid === cid; })[0]; };
    var seg = function (attr, paga) { return '<span class="cot-seg">' + ['GIWA', 'Cliente'].map(function (P) {
      return '<button type="button" class="cot-s cot-s-t' + (paga === P ? ' on' : '') + '" ' + attr + ' data-p="' + P + '">' + P + '</button>'; }).join('') + '</span>'; };
    var cats = []; L.forEach(function (c) { if (cats.indexOf(c.categoria) < 0) cats.push(c.categoria); });
    var man = its.map(function (y, i) { return y.cid ? '' : '<div class="cot-ter-f"><input class="fc ui-f1" placeholder="Nombre del costo" value="' + esc(y.nombre || '') + '" data-ter-mn="' + i + '" aria-label="Nombre">' +
      '<input class="fc u-wauto u-tr ui-num cot-ter-q" type="number" min="0" data-monto value="' + (Number(y.monto) || '') + '" data-ter-mm="' + i + '" aria-label="Monto">' +
      '<select class="fc u-wauto" data-ter-mr="' + i + '" aria-label="Frecuencia"><option' + (y.rec !== 'Único' ? ' selected' : '') + '>Mensual</option><option' + (y.rec === 'Único' ? ' selected' : '') + '>Único</option></select>' +
      seg('data-ter-pi="' + i + '"', pagaDe(x, y)) + uiIb('cerrar', 'Quitar', '', 'data-ter-mq="' + i + '"') + '</div>'; }).join('');
    set('ter-b', '<div class="ui-nota-t u-mb10">Tildá los que van. Al tildar, cargás la cantidad por mes y tocás de quién es.</div>' +
      cats.map(function (k) { return '<div class="ui-lat-h u-mt10">' + esc(k || 'Otros') + '</div>' + L.filter(function (c) { return c.categoria === k; }).map(function (c) { var y = de(c.id);
        return '<div class="cot-ter-f"><label class="u-row6 ui-f1"><input type="checkbox"' + (y ? ' checked' : '') + ' data-ter-ck="' + esc(c.id) + '"> ' + esc(c.producto) +
          ' <span class="ui-nota-t">· <span class="ui-num">' + fmt(precioC(c)) + '</span> ' + esc((c.unidad || '').toLowerCase()) + '</span></label>' +
          (y ? '<input class="fc u-wauto u-tr ui-num cot-ter-q" type="number" min="0" value="' + (y.cantidad || '') + '" data-ter-q="' + esc(c.id) + '" aria-label="Cantidad por mes">' + seg('data-ter-pc="' + esc(c.id) + '"', pagaDe(x, y)) : '') + '</div>'; }).join(''); }).join('') +
      '<div class="ui-lat-h u-mt10">Otros costos externos</div>' + man + '<button type="button" class="ui-lnk ui-azul" data-ter-add="1">+ Otro costo externo (nombre y monto)</button>' +
      '<div class="cot-sel-pie"><span>Paga GIWA <span class="ui-num">' + fmt(extMes(v, 'GIWA')) + '/mes</span></span><span>Paga el cliente <span class="ui-num">' + fmt(extMes(v, 'Cliente')) + '/mes</span></span></div>');
  }
  function terPop() {
    var v = dev(), snap = v.ext._terceros ? JSON.stringify(v.ext._terceros) : null;
    if (!v.ext._terceros) v.ext._terceros = { items: [] }; v.ext._terceros.items = items(v.ext._terceros);
    var m = modal('m-ter', 'Costos asociados · ' + (v.titulo || tipoNom(v.tipo)), '<div id="ter-b"></div>',
      '<button class="btn bg" data-ter="cancelar">Cancelar</button><button class="btn bp" data-ter="ok">Listo</button>', 'md-sm');
    var X = function () { return dev().ext._terceros; }, toca = function () { terPintar(); cambio(); };
    m.onchange = function (ev) { var t = ev.target, x = X(), its = x.items;
      if (t.hasAttribute('data-ter-ck')) { var cid = t.getAttribute('data-ter-ck');
        if (t.checked) its.push({ cid: cid, cantidad: 1, paga: 'GIWA' }); else x.items = its.filter(function (y) { return y.cid !== cid; }); return toca(); }
      if (t.hasAttribute('data-ter-q')) { var y = its.filter(function (k) { return k.cid === t.getAttribute('data-ter-q'); })[0]; if (y) y.cantidad = Number(t.value) || 0; return toca(); }
      if (t.hasAttribute('data-ter-mn')) { its[Number(t.getAttribute('data-ter-mn'))].nombre = t.value.trim(); return toca(); }
      if (t.hasAttribute('data-ter-mm')) { its[Number(t.getAttribute('data-ter-mm'))].monto = Number(t.value) || 0; return toca(); }
      if (t.hasAttribute('data-ter-mr')) { its[Number(t.getAttribute('data-ter-mr'))].rec = t.value; return toca(); } };
    m.onclick = function (ev) { var b = ev.target.closest('[data-ter],[data-ter-pc],[data-ter-pi],[data-ter-add],[data-ter-mq]'); if (!b) return; var x = X(), its = x.items;
      if (b.hasAttribute('data-ter')) { if (b.getAttribute('data-ter') === 'cancelar') { if (snap) dev().ext._terceros = JSON.parse(snap); else delete dev().ext._terceros; }
        var z = dev().ext._terceros; if (z && !items(z).length) delete dev().ext._terceros; closeM('m-ter'); return cambio(); }
      if (b.hasAttribute('data-ter-pc')) { var y = its.filter(function (k) { return k.cid === b.getAttribute('data-ter-pc'); })[0]; if (y) y.paga = b.getAttribute('data-p'); return toca(); }
      if (b.hasAttribute('data-ter-pi')) { its[Number(b.getAttribute('data-ter-pi'))].paga = b.getAttribute('data-p'); return toca(); }
      if (b.hasAttribute('data-ter-add')) { its.push({ nombre: '', monto: 0, paga: 'Cliente', rec: 'Mensual' }); return terPintar(); }
      if (b.hasAttribute('data-ter-mq')) { its.splice(Number(b.getAttribute('data-ter-mq')), 1); return toca(); } };
    terPintar();
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
      '<label class="u-row6 u-mb10" id="dv-mej-w"' + (v && v.tipo === 'IA' ? ' hidden' : '') + '><input type="checkbox" id="dv-mej"' + (v && v.mejora ? ' checked' : '') + '> Es una mejora de algo ya hecho: lo repetible se cobra al <span class="ui-num">50 %</span></label>' +
      '<div class="fg" id="dv-esc-w"' + (v && v.tipo === 'IA' ? '' : ' hidden') + '><label class="fl" for="dv-esc">Tipo de agente</label><select class="fc" id="dv-esc">' +
        Object.keys(ESCALA).map(function (k) { var a = v ? (v.escala || (v.mejora ? 'evolucion' : 'completo')) : 'completo';
          return '<option value="' + k + '"' + (a === k ? ' selected' : '') + '>' + ESCALA[k] + '</option>'; }).join('') + '</select>' +
        '<div class="u-s11-mt">Evolución: lo repetible se cobra al <span class="ui-num">50 %</span>.</div></div>' +
      (con ? '' : '<div class="fg"><label class="fl" for="dv-base">Partir de un proyecto existente</label><select class="fc" id="dv-base"><option value="">Elegí un proyecto…</option>' +
        '</select><div id="dv-base-l" class="u-mt6"></div></div>'),
      (v && CN.devs.filter(function (d) { return d.tipo; }).length > 1 ? '<button class="btn bg" data-dv="quitar">Quitar este desarrollo</button>' : '') +
      '<button class="btn bg" data-cerrar="m-dev">Cancelar</button><button class="btn bp" data-dv="ok">Listo</button>');
    if (!con) db().from('proyectos').select('id,nombre,empresa_id').neq('estado_id', 'Borrador').order('creado', { ascending: false }).limit(200).then(function (r) {
      var emp = {}; C.ini.empresas.forEach(function (e) { emp[e.id] = e.nombre; });
      var s = document.getElementById('dv-base'); if (s && r.data) s.innerHTML = '<option value="">Elegí un proyecto…</option>' + r.data.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc((emp[p.empresa_id] || '') + ' · ' + p.nombre) + '</option>'; }).join('');
    });
    m.onchange = async function (ev) {
      if (ev.target.id === 'dv-tipo') { var ia = ev.target.value === 'IA'; document.getElementById('dv-esc-w').hidden = !ia; document.getElementById('dv-mej-w').hidden = ia; return; }
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
      nv.tipo = tipo; nv.titulo = document.getElementById('dv-tit').value.trim(); nv.objetivo = document.getElementById('dv-obj').value.trim(); nv.escala = tipo === 'IA' ? document.getElementById('dv-esc').value : '';
      nv.mejora = tipo === 'IA' ? nv.escala === 'evolucion' : document.getElementById('dv-mej').checked;
      if (reuse && !Object.keys(nv.r).length) { reuse.ids.forEach(function (x) { nv.r[x] = 'Sí'; }); nv.cant = Object.assign({}, reuse.cant || {}); nv.base = { de: reuse.id }; }
      CN.i = CN.devs.indexOf(nv); closeM('m-dev');
      catalogo(tipo).then(function () {
        if (cambioTipo || !v) mods(nv).forEach(function (x) { if (x.sugerido && esBase(x) && !nv.r[x.id]) nv.r[x.id] = 'Sí'; });   // sólo la base arranca puesta; lo sugerido no suma hasta tildarlo
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
    if (limpio || !Object.keys(RE.r).length) { RE.r = {}; RE.cant = {}; RE.notas = {}; RE.ia = {}; mods(RE).forEach(function (m) { if (m.sugerido && esBase(m)) RE.r[m.id] = 'Sí'; }); }
    rePinta(); reEstimar();
  }
  function rePinta() {
    var box = document.getElementById('re-lista'); if (!box) return;
    var base = raices(RE).filter(esBase), hB = base.reduce(function (s, m) { return s + m.horas * m.factor; }, 0), por = {}, orden = [];
    raices(RE).filter(function (m) { return !esBase(m); }).forEach(function (m) { if (!por[m.bloque]) { por[m.bloque] = []; orden.push(m.bloque); } por[m.bloque].push(m); });
    // Un solo cuestionario (12/11/2026): acá se ve lo tildado; se contesta en el mismo cuestionario de Nuevo proyecto
    var tild = function (m) { var L = []; var baja = function (x) { if (!si(RE, x.id)) return; L.push(x); hijas(RE, x.id).forEach(baja); }; baja(m); return L; };
    box.innerHTML = (base.length ? '<div class="ui-kv">Base del agente · siempre incluida<span class="ui-num">' + hB + ' h</span></div>' : '') +
      orden.map(function (b) { var L = [].concat.apply([], por[b].map(tild)); if (!L.length) return '';
        return '<div class="ui-lat-h u-mt10">' + esc(b) + '</div>' + L.map(function (m) { return '<div class="u-s11' + (RE.ia[m.id] ? ' ui-p-abono' : '') + '">' + esc(nom(m)) + '</div>'; }).join(''); }).join('') +
      '<div class="ui-barra u-mt10">' + uiBtn('Abrir el cuestionario', 'lista', 'p', 'data-re="cuest"') + '</div>';
    set('re-msg', RE.msg + (RE.propuesta ? '<div class="fg u-mt10"><label class="fl" for="re-prop">Propuesta para el cliente</label><textarea class="fc" rows="4" id="re-prop">' + esc(RE.propuesta) + '</textarea></div>' : ''));
    reTotal();
  }
  function reAbono() { return RE.abono != null ? RE.abono : Math.round(mantHs(RE) * soporte()); }
  function reTotal() {
    // Montos en la moneda elegida (ARS o USD al tipo de cambio del día); el abono se guarda siempre en pesos
    var e = RE.est, h = e ? Math.round(e.horas * 10) / 10 : 0, mon = RE.mon === 'USD' && tc() ? 'USD' : 'ARS';
    var cv = function (n) { return mon === 'USD' ? Math.round(n / tc() * 100) / 100 : Math.round(n); };
    set('re-tot', '<select id="re-mon" aria-label="Moneda"><option' + (mon === 'ARS' ? ' selected' : '') + '>ARS</option><option' + (mon === 'USD' ? ' selected' : '') + '>USD</option></select>' +
      '<span>Pago único <span class="ui-num">' + (e ? fmt(cv(sugerido(RE)), mon) : '…') + '</span> · <span class="ui-num">' + h + '</span> h' + (RE.empresa ? '' : ' <span class="ui-nota-t">(sin Tier: elegí el cliente)</span>') + '</span>' +
      '<label class="u-row6">Por mes <input class="fc u-wauto u-tr ui-num" type="number" min="0" id="re-ab"' + (mon === 'USD' ? ' step="0.01"' : ' data-monto') + ' value="' + cv(reAbono()) + '" data-tip="Sugerido: ' + mantHs(RE) + ' h de soporte. El monto es tuyo: cambialo si querés."></label>' +
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
    if (t.id === 're-mon') { RE.mon = t.value; return reTotal(); }
    if (t.id === 're-ab') { var n = Number(String(t.value).replace(',', '.')) || 0; RE.abono = t.value === '' ? null : Math.round(RE.mon === 'USD' && tc() ? n * tc() : n); return; }
    if (t.id === 're-prop') { RE.propuesta = t.value; return; }
    if (t.hasAttribute('data-re-cant')) { RE.cant[t.getAttribute('data-re-cant')] = Math.max(1, Number(t.value) || 1); return reEstimar(); }
    if (t.hasAttribute('data-re-nota')) { RE.notas[t.getAttribute('data-re-nota')] = t.value.trim(); return; }
    if (t.hasAttribute('data-re-ck')) { var id = t.getAttribute('data-re-ck'); delete RE.ia[id];
      if (t.checked) RE.r[id] = 'Sí'; else { delete RE.r[id]; limpiar(RE, id); }
      rePinta(); reEstimar(); }
  }
  // Arma la cotización con lo cargado: la misma que usan Nuevo proyecto y Guardar
  function reCotizacion() {
    var x = nuevo(), v = vacio();
    x.empresa = RE.empresa; x.nombre = RE.titulo || tipoNom(RE.tipo); x.minuta = { texto: RE.minuta, objetivo: RE.minuta, propuesta: RE.propuesta || undefined, origen: RE.leido ? 'Leído del texto' : 'En la reunión' };
    var cs = C.ini.contactos.filter(function (c) { return c.empresa === RE.empresa; }); if (cs.length === 1) x.sponsors = [cs[0].id];
    v.tipo = RE.tipo; v.titulo = x.nombre; v.r = RE.r; v.cant = RE.cant; v.notas = RE.notas; v.est = RE.est;
    v.mant = Object.assign(v.mant, { on: true, hs: mantHs(RE), abono: reAbono(), manual: RE.abono != null });
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
    if (a === 'cuest') {   // el mismo cuestionario de Nuevo proyecto
      if (CN && !CN.pid && CN.devs.some(function (d) { return d.tipo; }) && !(await ask('Lo que tenés cargado en Nuevo proyecto se reemplaza.', 'Abrir el cuestionario', { ok: 'Reemplazar' }))) return;
      CN = reCotizacion(); RE = null; C.sub = 'nuevo'; pintar(el); auto(); estimar(0); return funAbrir();
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
  function auto() { if (!CN || CN.pid) return; try { localStorage.setItem(LS, JSON.stringify(CN, function (k, x) { return k === 'est' || k === 'ref' || k === 'an' ? undefined : x; })); } catch (e) {} }
  function recuperar() { try { var x = JSON.parse(localStorage.getItem(LS) || 'null'); if (x && x.devs && !x.pid) return x; } catch (e) {} return null; }
  function olvidar() { try { localStorage.removeItem(LS); } catch (e) {} }
  async function abrirCot(pid) {
    var r = await rpc('cot_leer', { pid: pid });
    var x = nuevo(); x.pid = r.pid; x.estado = r.estado; x.empresa = r.empresa; x.nombre = r.nombre; x.fecha_cierre = r.fecha_cierre || ''; x.minuta = r.minuta || {};
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
    return { pid: CN.pid, empresa: CN.empresa, nombre: CN.nombre, fecha_cierre: CN.fecha_cierre || '', sponsor: CN.sponsors.join(','), owner: CN.owners[0] || '', minuta: CN.minuta, borrados: CN.borrados,
      devs: con.map(function (v) { var mt = Object.assign({}, v.mant), c = propio(v) ? null : CN.devs[v.mant.comparte];
        mt.comparte = c ? con.indexOf(c) : null;
        return { id: v.id, tipo: v.tipo, titulo: v.titulo, objetivo: v.objetivo, mejora: !!v.mejora, escala: v.escala || '', r: v.r, cant: v.cant, etapa: v.etapa, notas: v.notas, ext: v.ext, base: v.base, na: v.na,
                 precio: v.precio || 0, mant: mt, moneda: v.moneda || 'ARS', forma_pago: v.forma_pago || '', inicio: v.inicio || '', vh: v.vh || null, vh_sop: v.vh_sop || null, semanas: v.semanas || '', garantia: v.garantia || '' }; }) };
  }
  async function guardar(crear, el) {
    var d = payload();
    if (!d.empresa || !d.nombre) return aviso('Falta la empresa o el título del proyecto.');
    if (!d.devs.length) return aviso('Cargá al menos un desarrollo.');
    if (crear && !d.fecha_cierre) return aviso('Falta la fecha probable de cierre de negociación.');
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
      if (a === 'corregir') return corregir(b.getAttribute('data-b'));
      if (a === 'precio-sug') { dev().precio = 0; return cambio(); }
      if (a === 'mant-i' || a === 'mant-quitar') { CN.i = Number(b.getAttribute('data-i')); if (a === 'mant-i') return mantPop(); dev().mant.on = false; return cambio(); }
      if (a === 'mant-on') { var vm = dev(); vm.mant.on = true; if (!vm.mant.manual) { vm.mant.hs = mantHs(vm); vm.mant.abono = Math.round(vm.mant.hs * soporte()); } return mantPop(); }
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
      if (t.id === 'cot-cierre') { CN.fecha_cierre = t.value; return auto(); }
      if (t.id === 'cot-precio') { dev().precio = Number(t.value) || 0; return cambio(); }
      if (t.hasAttribute('data-cot-v')) { var kv = t.getAttribute('data-cot-v'); dev()[kv] = kv === 'objetivo' ? t.value.trim() : t.value; return auto(); }
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

/* ══════════════════════════════════════════════════════════════════════
   vistas/her.js · Herramientas (27/10/2026)
   ──────────────────────────────────────────────────────────────────────
     Simulador Costos Meta   = js/simulador.js (lo comparte con simulador.html); la web app «Analisis Meta y Horas» (Apps Script),
                               con sus 4 pestañas: Calculadora, Probalo en vivo,
                               MRR y conveniencia, Comparativa con Telegram.
   Es una calculadora para reuniones comerciales: todo se calcula acá con los
   números que se tipean; de la base sólo se lee el TC de hoy (v_tipo_cambio_hoy),
   en lugar de DolarAPI. No guarda nada. Mismas fórmulas que el original.

     NDA (02/11/2026)        = el convenio de confidencialidad en Word, con la
                               plantilla plantillas/NDA_GIWA.docx. Se elige
                               cliente, contacto, socio y fecha; todo queda
                               editable. Se reemplazan los {{CAMPOS}} de la
                               plantilla con JSZip (se carga sólo al descargar).
                               No guarda nada. DNI y cargo del socio salen de
                               Configuración › Usuarios.

     Valores de mercado (04/11/2026) = v_mercado_referencias. Filtro por tipo;
                               Actualizar (sólo Victoria) guarda con admin_editar.
     Solicitudes de mejoras (05/11/2026) = pedidos y feedback sobre el CRM
                               (solicitudes_crm); avisa por Telegram a Administración.
     Análisis (04/11/2026)   = «Evaluar costos» del Cotizador suelto
                               (cot_herramientas): no guarda nada.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var SUBS = [['meta', 'Simulador Costos Meta'], ['nda', 'NDA'], ['mercado', 'Valores de mercado'], ['analisis', 'Análisis'], ['mejoras', 'Solicitudes de mejoras']];
  var MJ = { filas: null }, MK = { filas: null, tipo: '' }, EV = { categoria: 'Hosting', backend: true, db: true, evitar_tarjeta: false, presupuesto: 'Bajo', complejidad: 'Baja', costo_max: '' };
  function subValida(s) { return SUBS.some(function (x) { return x[0] === s; }) ? s : 'meta'; }
  var S = { sub: 'meta' };

  async function cargar() {
    var r = await db().from('v_tipo_cambio_hoy').select('valor,fecha').maybeSingle();
    if (r.error) throw new Error(r.error.message);
    var v = Number(r.data && r.data.valor);
    SIM.tc(v || _tcDefault(), v ? r.data.fecha : '');
  }
  function $(id) { return document.getElementById(id); }
  function put(id, h) { var e = $(id); if (e) e.innerHTML = h; }

// ── NDA ──────────────────────────────────────────────────────
  var N = { ok: false, emp: [], rz: [], cont: [], usu: [] };
  async function cargarNda() {
    var r = await Promise.all([
      db().from('empresas').select('id,nombre,rubro,direccion_fiscal,localidad,provincia').order('nombre'),
      db().from('razones_sociales').select('id,empresa_id,nombre,cuit,direccion,por_defecto').order('por_defecto', { ascending: false }),
      db().from('contactos').select('id,empresa_id,nombre,apellido,puesto').order('nombre'),
      db().from('usuarios').select('*').eq('es_giwa', true).eq('activo', true).order('orden')]);
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    N.emp = r[0].data; N.rz = r[1].data; N.cont = r[2].data; N.usu = r[3].data; N.ok = true;
  }
  function vNda(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function opc(L, txt, vacio) { return '<option value="">' + esc(vacio) + '</option>' + L.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(txt(x)) + '</option>'; }).join(''); }
  function campo(id, l, cls) { return '<div class="fg' + (cls ? ' ' + cls : '') + '"><label class="fl" for="' + id + '">' + l + '</label><input class="fc" id="' + id + '"></div>'; }
  function nomCont(c) { return [c.nombre, c.apellido].filter(Boolean).join(' '); }

  function htmlNda() {
    return uiDesp({ t: 'Cliente', open: true },
        '<div class="g2"><div class="fg"><label class="fl" for="nd-emp">Empresa</label><select class="fc" id="nd-emp">' + opc(N.emp, function (e) { return e.nombre; }, 'Elegí la empresa') + '</select></div>' +
          '<div class="fg"><label class="fl" for="nd-cont">Firma por el cliente</label><select class="fc" id="nd-cont"><option value="">Elegí primero la empresa</option></select></div></div>' +
        '<div class="g2">' + campo('nd-rz', 'Razón social / Nombre') + campo('nd-cuit', 'DNI / CUIT') + '</div>' +
        '<div class="g2">' + campo('nd-dom', 'Domicilio') + campo('nd-act', 'Actividad') + '</div>' +
        '<div class="g2">' + campo('nd-rep', 'Representante') + campo('nd-car', 'Cargo') + '</div>') +
      uiDesp({ t: 'Proveedor (GIWA)', open: true },
        '<div class="g3"><div class="fg"><label class="fl" for="nd-soc">Socio que firma</label><select class="fc" id="nd-soc">' + opc(N.usu, function (u) { return u.nombre; }, 'Elegí el socio') + '</select></div>' +
          campo('nd-sdni', 'DNI del socio') + campo('nd-scar', 'Cargo del socio') + '</div>' +
        '<div class="ui-nota-t" id="nd-shint"></div>') +
      uiDesp({ t: 'Condiciones', open: true },
        '<div class="g3"><div class="fg"><label class="fl" for="nd-fec">Fecha de firma</label><input class="fc" type="date" id="nd-fec" value="' + _hoyLocal() + '"></div></div>' +
        '<div class="fg"><label class="fl" for="nd-pro">Propósito</label><textarea class="fc" id="nd-pro" rows="3" placeholder="Ej.: evaluar la automatización de la atención por WhatsApp"></textarea></div>' +
        '<div class="ui-nota-t">Plazos, tipo de acuerdo y jurisdicción son los de la plantilla: mutuo, 1 año de vigencia y 5 de confidencialidad.</div>');
  }
  function elegirEmp(id) {
    var e = N.emp.find(function (x) { return x.id === id; }) || {};
    var rz = N.rz.find(function (x) { return x.empresa_id === id; }) || {};
    var cs = N.cont.filter(function (x) { return x.empresa_id === id; });
    put('nd-cont', id ? opc(cs, function (c) { return nomCont(c) + (c.puesto ? ' · ' + c.puesto : ''); }, cs.length ? 'Elegí el contacto' : 'Sin contactos: completalo a mano') : '<option value="">Elegí primero la empresa</option>');
    set('nd-rz', rz.nombre || e.nombre || '');
    set('nd-cuit', rz.cuit ? 'CUIT ' + rz.cuit : '');
    set('nd-dom', rz.direccion || [e.direccion_fiscal, e.localidad, e.provincia].filter(Boolean).join(', '));
    set('nd-act', e.rubro || '');
    set('nd-rep', ''); set('nd-car', '');
  }
  function elegirCont(id) {
    var c = N.cont.find(function (x) { return x.id === id; }) || {};
    set('nd-rep', nomCont(c)); set('nd-car', c.puesto || '');
  }
  function elegirSoc(id) {
    var u = N.usu.find(function (x) { return x.id === id; }) || {};
    set('nd-sdni', u.dni || ''); set('nd-scar', u.cargo || '');
    put('nd-shint', id && (!u.dni || !u.cargo) ? 'Faltan datos de ' + esc(u.nombre) + ': completalos acá o cargalos una vez en Configuración › Usuarios.' : '');
  }

  var _jszip = null;
  function cargarJSZip() {
    if (window.JSZip) return Promise.resolve();
    return _jszip || (_jszip = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = ok; s.onerror = function () { _jszip = null; mal(new Error('No pude cargar JSZip')); };
      document.head.appendChild(s);
    }));
  }
  function xml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  async function descargarNda(b) {
    var u = N.usu.find(function (x) { return x.id === vNda('nd-soc'); }), fec = $('nd-fec') ? $('nd-fec').value : '';
    var falta = [['nd-rz', 'la razón social'], ['nd-rep', 'el representante'], ['nd-pro', 'el propósito']]
      .filter(function (x) { return !vNda(x[0]); }).map(function (x) { return x[1]; });
    if (!u) falta.push('el socio');
    if (!fec) falta.push('la fecha');
    if (falta.length) return toast('Falta ' + falta.join(', '), 'err');
    var d = new Date(fec + 'T12:00:00');
    var V = { CLIENTE_RAZON_SOCIAL: vNda('nd-rz'), CLIENTE_DNI_CUIT: vNda('nd-cuit'), CLIENTE_DOMICILIO: vNda('nd-dom'), CLIENTE_ACTIVIDAD: vNda('nd-act'),
      CLIENTE_REPRESENTANTE: vNda('nd-rep'), CLIENTE_CARGO: vNda('nd-car'), PROPOSITO: vNda('nd-pro'),
      SOCIO_NOMBRE: u.nombre, SOCIO_DNI: vNda('nd-sdni'), SOCIO_CARGO: vNda('nd-scar'),
      DIA: String(d.getDate()), MES: d.toLocaleString('es-AR', { month: 'long' }), ANIO: String(d.getFullYear()), FECHA: ff(fec) };
    b.disabled = true;
    try {
      await cargarJSZip();
      var r = await fetch('plantillas/NDA_GIWA.docx');
      if (!r.ok) throw new Error('No encontré la plantilla del NDA');
      var z = await JSZip.loadAsync(await r.arrayBuffer());
      var doc = await z.file('word/document.xml').async('string');
      Object.keys(V).forEach(function (k) { doc = doc.split('{{' + k + '}}').join(xml(V[k])); });
      z.file('word/document.xml', doc);
      var blob = await z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'NDA_GIWA_' + V.CLIENTE_RAZON_SOCIAL.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') + '.docx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('NDA descargado', 'ok');
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  }

  async function pintarNda(el) {
    marcarSub('nda');
    if (!N.ok) {
      el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando clientes…</div>';
      try { await cargarNda(); } catch (e) { el.innerHTML = '<div class="card">No pude cargar los datos: ' + esc(e.message || e) + '</div>'; return; }
      if (_montado !== 'her' || S.sub !== 'nda') return;
    }
    el.innerHTML = uiHd('NDA', 'Convenio de confidencialidad con los datos del cliente, el socio y la fecha. Sale en Word para revisar y firmar.',
        uiBtn('Descargar NDA', 'documento', 'p', 'data-nda="descargar"')) + htmlNda();
  }

  // ── Valores de mercado ──
  async function pintarMercado(el) {
    marcarSub('mercado');
    if (!MK.filas) {
      el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando valores…</div>';
      var r = await db().from('v_mercado_referencias').select('*').order('rol');
      if (r.error) { el.innerHTML = '<div class="card">No pude cargar los datos: ' + esc(r.error.message) + '</div>'; return; }
      MK.filas = r.data;
      if (_montado !== 'her' || S.sub !== 'mercado') return;
    }
    var tipos = {}; MK.filas.forEach(function (x) { if (x.tipo) tipos[x.tipo] = 1; });
    var L = MK.filas.filter(function (x) { return !MK.tipo || x.tipo === MK.tipo; });
    var duena = String((CRM_USUARIO && CRM_USUARIO.mail) || '').toLowerCase() === 'v.gagey@giwa-ia.com';   // la base lo vuelve a verificar (es_duena)
    var usd = function (n) { return '<td class="m u-tr u-nw">' + (n == null ? '—' : fmt(Math.round(n), 'USD')) + '</td>'; };
    el.innerHTML = uiHd('Valores de mercado', 'Referencias en USD por hora.',
        Object.keys(tipos).length > 1 ? '<select class="fc u-wauto" id="mk-tipo" aria-label="Tipo"><option value="">Todos los tipos</option>' + Object.keys(tipos).sort().map(function (t) { return '<option value="' + esc(t) + '"' + (t === MK.tipo ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' : '') +
      (!L.length ? '<div class="empty">Sin valores para este tipo.</div>' :
      '<div class="u-ovx"><table class="tbl"><thead><tr><th>Rol</th><th>Fuente</th><th class="u-tr">Mínimo</th><th class="u-tr">Referencia</th><th class="u-tr">Máximo</th><th class="u-tr">Fecha</th><th></th></tr></thead><tbody>' +
      L.map(function (x) {
        return '<tr><td>' + esc(x.rol || '—') + '</td><td>' + mkLinks(x, x.fuente) + '</td>' + usd(x.usd_min) + usd(x.usd_ref) + usd(x.usd_max) +
          '<td class="m u-nw u-tr' + (x.estado === 'Vigente' ? '' : ' ui-p-pendiente') + '">' + esc(x.fecha ? ff(x.fecha) : '—') + '</td>' +
          '<td class="u-tr u-nw">' + (duena ? '<button class="btn bg xs" data-mk-act="' + esc(x.id) + '">Actualizar</button>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>');
  }
  // ── Solicitudes de mejoras al CRM ──
  async function pintarMejoras(el) {
    marcarSub('mejoras');
    if (!MJ.filas) {
      el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando…</div>';
      var r = await db().from('solicitudes_crm').select('*').order('creado', { ascending: false });
      if (r.error) { el.innerHTML = '<div class="card">No pude cargar los datos: ' + esc(r.error.message) + '</div>'; return; }
      MJ.filas = r.data;
      if (_montado !== 'her' || S.sub !== 'mejoras') return;
    }
    var yo = String((CRM_USUARIO && CRM_USUARIO.mail) || '').toLowerCase(), duena = yo === 'v.gagey@giwa-ia.com';
    el.innerHTML = uiHd('Solicitudes de mejoras', 'Pedidos y feedback sobre el CRM.', '') +
      '<div class="fg"><label class="fl" for="mj-txt">¿Qué necesitás que cambie o mejore?</label><textarea class="fc" id="mj-txt" rows="3"></textarea></div>' +
      '<div class="ui-barra ui-der">' + uiBtn('Enviar', 'check', 'p', 'data-mj="enviar"') + '</div>' +
      (!MJ.filas.length ? '<div class="empty">Todavía no hay pedidos.</div>' :
      '<div class="u-ovx"><table class="ui-tbl"><thead><tr><th>Pedido</th><th>Quién</th><th class="ui-r">Fecha</th><th>Estado</th><th></th></tr></thead><tbody>' + MJ.filas.map(function (x) {
        var hecha = x.estado === 'Hecha';
        return '<tr' + (hecha ? ' class="u-op6"' : '') + '><td class="fin-mj">' + esc(x.texto) + '</td><td>' + esc(String(x.quien || '').split('@')[0]) + '</td><td class="ui-num ui-r">' + esc(ff(x.creado)) + '</td><td>' + esc(x.estado) + '</td>' +
          '<td class="ui-r">' + (duena ? '<button class="ui-lnk ui-azul" data-mj="estado" data-id="' + x.id + '" data-e="' + (hecha ? 'Nueva' : 'Hecha') + '">' + (hecha ? 'Reabrir' : 'Marcar hecha') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>');
  }
  async function accionMejoras(el, b) {
    var r;
    if (b.getAttribute('data-mj') === 'enviar') {
      var t = document.getElementById('mj-txt').value.trim(); if (!t) return toast('Escribí el pedido', 'err');
      r = await db().rpc('enviar_solicitud', { txt: t });
      if (r.error) return toast(r.error.message, 'err');
      toast('Pedido enviado', 'ok');
    } else {
      r = await db().from('solicitudes_crm').update({ estado: b.getAttribute('data-e') }).eq('id', b.getAttribute('data-id'));
      if (r.error) return toast(r.error.message, 'err');
    }
    MJ.filas = null; pintarMejoras(el);
  }
  // Las webs de una referencia (mercado_referencias.url, separadas por espacio): con texto, un solo vínculo; sin texto, uno por web
  function mkUrls(x) { return String(x.url || '').split(/\s+/).filter(Boolean); }
  function mkLink(u, t) { return '<a class="ui-lnk ui-azul" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + '</a>'; }
  function mkLinks(x, texto) {
    var L = mkUrls(x);
    if (texto) return L.length ? mkLink(L[0], texto) : esc(texto);
    return L.map(function (u) { return mkLink(u, new URL(u).hostname.replace(/^www\./, '')); }).join(' · ');
  }
  // Actualizar una referencia: se consulta su web y se cargan valores y fecha; queda en el registro de cambios de Datos
  function actualizarMk(el, id) {
    var x = MK.filas.find(function (f) { return f.id === id; }); if (!x) return;
    var m = document.getElementById('m-mk');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-mk'; document.body.appendChild(m); }
    var num = function (k, t) { return '<div class="fg"><label class="fl" for="mk-' + k + '">' + t + '</label><input class="fc u-tr" type="number" min="0" step="any" id="mk-' + k + '" value="' + (x['valor_' + k] == null ? '' : esc(x['valor_' + k])) + '"></div>'; };
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Actualizar valor</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-mk">' + ico('cerrar') + '</button></div><div class="mb2">' +
      '<div class="ft-info">' + esc(x.rol || '') + ' · ' + esc(x.fuente || '') + ' · valores en ' + esc(x.unidad || '') + '</div>' +
      (mkUrls(x).length ? '<div class="u-mt6 u-mb12">Consultar en: ' + mkLinks(x) + '</div>' : '') +
      '<div class="u-mb12"><button type="button" class="ui-lnk ui-azul" id="mk-gem">Buscar con Gemini</button> <span class="ui-nota-t" id="mk-gem-n"></span></div>' +
      '<div class="g3">' + num('min', 'Mínimo') + num('ref', 'Referencia') + num('max', 'Máximo') + '</div>' +
      '<div class="fg"><label class="fl" for="mk-fecha">Fecha</label><input class="fc" type="date" id="mk-fecha" value="' + isoMas(0) + '"></div></div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-mk">Cancelar</button><button class="btn bp" id="mk-ok">Guardar</button></div></div>';
    var g = function (k) { return document.getElementById('mk-' + k).value; }, val = function (k) { return g(k) === '' ? null : Number(g(k)); };
    // Gemini propone; no se guarda hasta que lo revises y toques Guardar. La clave queda en el Script.
    document.getElementById('mk-gem').onclick = async function () {
      var nota = document.getElementById('mk-gem-n'); nota.textContent = 'Buscando…'; this.disabled = true;
      try {
        var r = await puente('mercadoGemini', { rol: x.rol, fuente: x.fuente, urls: mkUrls(x) });
        ['min', 'ref', 'max'].forEach(function (k) { if (r[k] != null) document.getElementById('mk-' + k).value = r[k]; });
        nota.textContent = 'Revisá los valores antes de guardar. ' + (r.nota || '');
      } catch (e) { nota.textContent = e.message; }
      this.disabled = false;
    };
    document.getElementById('mk-ok').onclick = async function () {
      if (!g('fecha')) return toast('Falta la fecha', 'err');
      this.disabled = true;
      var r = await db().rpc('admin_editar', { tabla: 'mercado_referencias', rid: id, cambios: { valor_min: val('min'), valor_ref: val('ref'), valor_max: val('max'), fecha: g('fecha') }, motivo: 'Actualización de valor de mercado' });
      if (r.error) { this.disabled = false; return toast(r.error.message, 'err'); }
      closeM('m-mk'); toast('Valor actualizado', 'ok'); MK.filas = null; pintarMercado(el);
    };
    openM('m-mk');
  }
  // ── Análisis: qué herramienta conviene y cuánto cuesta (misma regla que «Evaluar costos») ──
  function pintarAnalisis(el) {
    marcarSub('analisis');
    var c = EV, sel = function (k, ops) { return '<select class="fc" data-ev="' + k + '">' + ops.map(function (o) { return '<option' + (c[k] === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'; };
    var ck = function (k, t) { return '<label class="u-row6 u-s11"><input type="checkbox" data-ev="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>'; };
    el.innerHTML = uiHd('Análisis', 'Compará la opción más económica, una intermedia y la recomendada.', uiBtn('Evaluar', 'buscar', 'p', 'data-her-ev="1"')) +
      '<div class="g2"><div class="fg"><label class="fl">Qué se busca</label>' + sel('categoria', ['Hosting', 'Base de datos', 'App no-code', 'Automatización', 'IA']) + '</div>' +
      '<div class="fg"><label class="fl">Presupuesto</label>' + sel('presupuesto', ['Bajo', 'Medio', 'Alto']) + '</div>' +
      '<div class="fg"><label class="fl">Complejidad</label>' + sel('complejidad', ['Baja', 'Media', 'Alta']) + '</div>' +
      '<div class="fg"><label class="fl">Costo máximo USD por mes</label><input class="fc u-tr" type="number" min="0" data-ev="costo_max" value="' + esc(c.costo_max) + '"></div></div>' +
      ck('backend', 'Necesita backend') + ck('db', 'Necesita base de datos') + ck('evitar_tarjeta', 'Evitar tarjeta (el cliente no tiene)') + '<div id="her-ev-res" class="u-mt10"></div>';
  }
  async function evaluarHer(el) {
    el.querySelectorAll('[data-ev]').forEach(function (x) { EV[x.getAttribute('data-ev')] = x.type === 'checkbox' ? x.checked : x.value; });
    var box = document.getElementById('her-ev-res'), r = await db().rpc('cot_herramientas', { c: EV });
    if (r.error) { box.innerHTML = '<div class="ui-p-error">' + esc(r.error.message) + '</div>'; return; }
    box.innerHTML = !r.data.opciones.length ? '<div class="ui-nota-t">Ninguna herramienta de esa categoría cumple lo pedido.</div>' : r.data.opciones.map(function (o) {
      return '<div class="ui-linea"><span class="ui-f1">' + esc(o.rol) + ' · ' + esc(o.producto) + '<div class="ui-nota-t">' + esc(o.ideal || '') + ' · <span class="ui-num">' + o.puntos + '</span> de <span class="ui-num">' + r.data.maximo + '</span> puntos</div></span>' +
        '<span class="ui-num">' + fmt(o.usd, 'USD') + '/mes</span></div>'; }).join('');
  }

  function pintar(el) {
    if (_montado !== 'her') return;
    if (S.sub === 'nda') return pintarNda(el);
    if (S.sub === 'mercado') return pintarMercado(el);
    if (S.sub === 'analisis') return pintarAnalisis(el);
    if (S.sub === 'mejoras') return pintarMejoras(el);
    marcarSub('meta');
    SIM.pintar(el);
  }

  VISTAS.her = async function (el, op) {
    S.sub = subValida(subPedida());
    if (op && op.forzar) N.ok = false;
    await abrirModulo(el, { id: 'her', texto: 'Cargando Herramientas…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return SIM.tcActual() > 0; }, firma: function () { return String(SIM.tcActual()); }, pintar: function () { pintar(el); } });
    el.oninput = function (ev) {
      if (_montado !== 'her') return;
      SIM.entrada(ev);
    };
    el.onchange = function (ev) {
      var id = ev.target.id;
      if (id === 'mk-tipo') { MK.tipo = ev.target.value; return pintar(el); }
      SIM.cambio(ev);
      if (id === 'nd-emp') elegirEmp(ev.target.value);
      if (id === 'nd-cont') elegirCont(ev.target.value);
      if (id === 'nd-soc') elegirSoc(ev.target.value);
    };
    el.onclick = function (ev) {
      if (_montado !== 'her') return;
      var nb = ev.target.closest('[data-nda="descargar"]'); if (nb) return descargarNda(nb);
      if (ev.target.closest('[data-her-ev]')) return evaluarHer(el);
      var mj = ev.target.closest('[data-mj]'); if (mj) return accionMejoras(el, mj);
      var mk = ev.target.closest('[data-mk-act]'); if (mk) return actualizarMk(el, mk.getAttribute('data-mk-act'));
      SIM.clic(ev, el);
    };
  };
  VISTAS.her.irA = function (s) { S.sub = subValida(s); pintar(document.getElementById('vista')); };
  VISTAS.her.precargar = cargar;
})();

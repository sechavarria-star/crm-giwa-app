/* ══════════════════════════════════════════════════════════════════════
   cobro.js · Nueva factura y Registrar pago (27/10/2026)
   ──────────────────────────────────────────────────────────────────────
     abrirFactura(ctx, opts)   la factura emitida (= Cargar factura del Apps Script)
     abrirPago(ctx, opts)      el cobro sin factura: «me pagó tanto» y listo
       ctx  = { empresa, item_id }   empresa = nombre, como en las vistas de facturar
       opts = { onSave: fn() }
   Los dos guardan con crm_giwa.registrar_cobro (= addCobro / addCobroSplit):
   una fila por desarrollo con el mismo comprobante. Como en el modal anterior
   (Admin_Index · cfSplitRender, 05/11/2026): Cliente › Proyecto › Desarrollo por
   línea, con todos los desarrollos facturables, y se suman las líneas que hagan
   falta. Cada línea propone cuota, concepto y monto (cfSugerirFila), todo editable,
   avisa el ajuste por IPC y deja renovar el mantenimiento que corresponde.
   Arriba, la razón social y el CUIT.
   El PDF va a la carpeta de quien factura y el mail queda como borrador en
   Gmail, por el Apps Script (puente.js). 03/11/2026.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var C = { modo: 'factura', lin: [], devs: {}, proys: [], mens: {}, cob: {}, ipc: {}, onSave: null, rs: [], archivo: null, emp: {}, tc: 0 };
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }

  var HTML =
    '<div class="mo" id="m-cobro"><div class="md">' +
      '<div class="mh"><span class="mt2" id="cb-tit">Nueva factura</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-cobro">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="fg"><label class="fl ft-lbl" for="cb-emp">Cliente <span class="req">*</span></label><select class="fc" id="cb-emp"></select></div>' +
        '<div class="g3" id="cb-fc"><div class="fg"><label class="fl ft-lbl" for="cb-tipo">Tipo</label><select class="fc" id="cb-tipo">' +
            ['Factura C', 'Factura A', 'Factura B', 'Nota de crédito C', 'Recibo'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-nro">Número <span class="req">*</span></label><input class="fc" id="cb-nro" placeholder="0001-00000001"></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-fecha">Fecha de la factura</label><input class="fc" type="date" id="cb-fecha"></div></div>' +
        '<div class="fg" id="cb-rs"></div>' +
        '<div class="cb-lin cb-lin-h"><span>Proyecto <span class="req">*</span></span><span>Desarrollo <span class="req">*</span></span><span>Concepto</span><span class="u-tr">Cuota</span><span class="u-tr">Monto</span><span></span></div>' +
        '<div id="cb-filas"></div><div><button type="button" class="ui-lnk ui-azul" id="cb-mas">+ Agregar línea</button></div>' +
        '<div class="g3"><div class="fg"><label class="fl ft-lbl" for="cb-mon">Moneda</label><select class="fc" id="cb-mon"><option>ARS</option><option>USD</option></select></div>' +
          '<div class="fg" id="cb-dep-w"><label class="fl ft-lbl" for="cb-dep" id="cb-dep-l">Fecha del pago</label><input class="fc" type="date" id="cb-dep"></div>' +
          '<div class="fg"><span class="fl ft-lbl">Total</span><div class="m cb-total" id="cb-total">—</div><div class="ui-num ui-p-usd u-s11" id="cb-usd"></div></div></div>' +
        '<div class="fg" id="cb-forma-w" hidden><label class="fl ft-lbl" for="cb-forma">Forma de pago</label><select class="fc" id="cb-forma"><option>Transferencia</option><option>Efectivo</option></select></div>' +
        '<div class="cb-adj" id="cb-adj"><input type="file" id="cb-file" accept=".pdf,application/pdf" hidden><span id="cb-adj-t">Arrastrá el PDF de la factura acá o </span>' +
          '<button type="button" class="ui-lnk ui-azul" id="cb-adj-b">elegí el archivo</button></div>' +
        '<div class="ft-info" id="cb-info"></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-cobro">Cancelar</button><button class="btn bg" id="cb-otra">Guardar y cargar otra</button><button class="btn bp" id="cb-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    $('cb-emp').onchange = function () { C.lin = [nueva()]; pintarRs(); pintarFilas(); };
    $('cb-mas').onclick = function () { C.lin.push(nueva()); pintarFilas(); };
    $('cb-filas').addEventListener('change', cambioLinea);
    $('cb-filas').addEventListener('input', tipeoLinea);
    $('cb-filas').addEventListener('click', clicLinea);
    $('cb-mon').onchange = total;
    $('cb-ok').onclick = function () { guardar(false); };
    $('cb-otra').onclick = function () { guardar(true); };
    var z = $('cb-adj');
    $('cb-adj-b').onclick = function () { $('cb-file').click(); };
    $('cb-file').onchange = function () { elegirPdf(this.files[0]); };
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('on'); });
    z.addEventListener('dragleave', function () { z.classList.remove('on'); });
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('on'); elegirPdf(e.dataTransfer.files[0]); });
  });

  async function cargar() {
    var r = await Promise.all([
      db().from('v_desarrollos_plata').select('id,proyecto_id,titulo,estado_id,es_facturable,es_rechazado,es_mantenimiento,total_ars,cuota,cuotas,duracion_cuotas,facturado,cuotas_facturadas,saldo'),
      db().from('v_facturar_mensuales').select('item_id,monto,periodo'),
      db().from('empresas').select('id,nombre').order('nombre'),
      db().from('razones_sociales').select('*').order('por_defecto', { ascending: false }),
      db().from('cobros').select('desarrollo_id,cuota_nro,concepto_fc,monto_ars,creado'),
      db().from('proyectos').select('id,nombre,empresa_id').order('nombre'),
      db().from('v_ajustes_ipc').select('item_id,pct,cuota_sugerida'),
      db().from('v_tipo_cambio_hoy').select('valor').maybeSingle()
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    C.devs = {}; r[0].data.forEach(function (d) { C.devs[d.id] = d; });
    C.mens = {}; r[1].data.forEach(function (m) { if (!C.mens[m.item_id]) C.mens[m.item_id] = m; });
    C.emp = {}; r[2].data.forEach(function (e) { if (!/^giwa/i.test(e.nombre || '')) C.emp[e.nombre] = e.id; });
    C.rs = r[3].data; C.proys = r[5].data; C.tc = Number((r[7].data || {}).valor) || 0;
    C.cob = {}; r[4].data.forEach(function (c) {
      if (!c.desarrollo_id) return; var x = C.cob[c.desarrollo_id] = C.cob[c.desarrollo_id] || { max: 0, ultimo: 0, f: '' };
      x.max = Math.max(x.max, Number(c.cuota_nro) || 0);
      if (String(c.creado) > x.f && Number(c.monto_ars) > 0) { x.f = String(c.creado); x.ultimo = Number(c.monto_ars); }
    });
    C.ipc = {}; r[6].data.forEach(function (i) { C.ipc[i.item_id] = i; });
  }
  // ── Cliente › Proyecto › Desarrollo ──
  function nueva() { return { proy: '', item: '', concepto: '', cuota: 1, monto: 0, ren: false }; }
  // Renovar: abono en curso o finalizado al que le quedan 2 cuotas o menos (_puedeRenovar)
  function renovable(d) {
    var dur = Number(d.cuotas) || 0, can = _canonSol(d.estado_id);
    return !!d.es_mantenimiento && dur > 0 && dur - (Number(d.cuotas_facturadas) || 0) <= 2 && (can === 'curso' || can === 'finalizada');
  }
  // Los desarrollos facturables del proyecto («en cuanto inicio el desarrollo puedo cobrar»: Aprobado no entra)
  function desarrollosDe(proy) { return Object.keys(C.devs).map(function (k) { return C.devs[k]; }).filter(function (d) { return d.proyecto_id === proy && !d.es_rechazado && (d.es_facturable || renovable(d)); }); }
  function sugerir(l) {
    var d = C.devs[l.item], m = C.mens[l.item], cob = C.cob[l.item] || { max: 0, ultimo: 0 }; if (!d) return;
    var cuota = Number(d.cuota) || 0, saldo = Math.max(0, Number(d.saldo) || 0), cuotas = Number(d.cuotas) || 0;
    l.cuota = cob.max + 1;
    l.monto = m ? Number(m.monto) || 0 : cuota > 0 ? cuota : saldo > 0 ? saldo : cob.ultimo;   // la cuota, si no el saldo, si no lo último
    l.concepto = (d.es_mantenimiento ? 'Mantenimiento mensual — ' + d.titulo + (m && m.periodo ? ' — ' + m.periodo : '') : 'Desarrollo — ' + d.titulo) + (cuotas > 1 ? ' · cuota ' + l.cuota + ' de ' + cuotas : '');
  }
  function opcion(val, txt, sel) { return '<option value="' + esc(val) + '"' + (val === sel ? ' selected' : '') + '>' + esc(txt) + '</option>'; }
  function pintarFilas() {
    var id = C.emp[v('cb-emp')], ps = C.proys.filter(function (p) { return p.empresa_id === id; });
    if (!id) { $('cb-filas').innerHTML = '<div class="ui-nota-t u-mb6">Elegí el cliente.</div>'; total(); return; }
    $('cb-filas').innerHTML = C.lin.map(function (l, i) {
      var sols = l.proy ? desarrollosDe(l.proy) : [], d = C.devs[l.item];
      var datos = !d ? '' : '<span>Contratado <span class="ui-num">' + fmt(Number(d.total_ars) || 0) + '</span></span><span>Facturado <span class="ui-num">' + fmt(Number(d.facturado) || 0) + '</span></span>' +
        '<span>Saldo <span class="ui-num">' + fmt(Math.max(0, Number(d.saldo) || 0)) + '</span></span>' + (renovable(d) ? '<button type="button" class="ui-lnk ui-azul" data-acc="ren" data-l="' + i + '">Renovar mantenimiento</button>' : '');
      var ipc = C.ipc[l.item];
      return '<div class="cb-lin" data-l="' + i + '">' +
          '<select class="fc" data-c="proy" aria-label="Proyecto"><option value="">— Proyecto —</option>' + ps.map(function (p) { return opcion(p.id, p.nombre || p.id, l.proy); }).join('') + '</select>' +
          '<select class="fc" data-c="item" aria-label="Desarrollo"' + (l.proy ? '' : ' disabled') + '><option value="">' + (l.proy && !sols.length ? '— Ninguno arrancó todavía —' : '— Desarrollo —') + '</option>' + sols.map(function (x) { return opcion(x.id, x.titulo || x.id, l.item); }).join('') + '</select>' +
          '<input class="fc" data-c="concepto" value="' + esc(l.concepto) + '" aria-label="Concepto">' +
          '<input class="fc u-tr ui-num" type="number" min="1" data-c="cuota" value="' + esc(l.cuota) + '" aria-label="Número de cuota">' +
          '<input class="fc u-tr ui-num" type="number" min="0" data-monto data-c="monto" value="' + (l.monto || '') + '" aria-label="Monto">' +
          (C.lin.length > 1 ? '<button type="button" class="ui-ib ui-bor" data-acc="quitar" data-l="' + i + '" data-tip="Quitar la línea" aria-label="Quitar la línea">' + ico('cerrar') + '</button>' : '<span></span>') +
        '</div>' +
        (datos ? '<div class="cb-sub">' + datos + '</div>' : '') +
        (ipc ? '<div class="cb-sub ui-p-pendiente">Corresponde ajuste por IPC: <span class="ui-num">' + String(ipc.pct).replace('.', ',') + ' %</span> · cuota sugerida <span class="ui-num">' + fmt(ipc.cuota_sugerida) + '</span></div>' : '') +
        (l.ren && d ? '<div class="cb-sub cb-ren"><label class="fl" for="cb-ren-d">Meses</label><input class="fc u-tr ui-num" type="number" min="1" id="cb-ren-d" value="' + (Number(d.cuotas) || 12) + '">' +
          '<label class="fl" for="cb-ren-c">Cuota</label><input class="fc u-tr ui-num" type="number" min="0" data-monto id="cb-ren-c" value="' + Math.round((ipc && ipc.cuota_sugerida) || d.cuota || 0) + '">' +
          '<button type="button" class="ui-btn ui-p" data-acc="ren-ok" data-l="' + i + '">Renovar</button></div>' : '');
    }).join('');
    total();
  }
  function cambioLinea(ev) {
    var fila = ev.target.closest('.cb-lin'); if (!fila) return;
    var l = C.lin[+fila.getAttribute('data-l')], c = ev.target.getAttribute('data-c');
    if (c === 'proy') { l.proy = ev.target.value; l.item = ''; l.concepto = ''; l.monto = 0; l.cuota = 1; l.ren = false; var s = desarrollosDe(l.proy); if (s.length === 1) { l.item = s[0].id; sugerir(l); } return pintarFilas(); }
    if (c === 'item') { l.item = ev.target.value; l.concepto = ''; l.monto = 0; l.cuota = 1; l.ren = false; sugerir(l); return pintarFilas(); }
  }
  function tipeoLinea(ev) {
    var fila = ev.target.closest('.cb-lin'); if (!fila) return;
    var l = C.lin[+fila.getAttribute('data-l')], c = ev.target.getAttribute('data-c');
    if (c === 'concepto') l.concepto = ev.target.value;
    if (c === 'cuota') l.cuota = Number(ev.target.value) || 1;
    if (c === 'monto') { l.monto = Number(ev.target.value) || 0; total(); }
  }
  async function clicLinea(ev) {
    var b = ev.target.closest('[data-acc]'); if (!b) return;
    var a = b.getAttribute('data-acc'), l = C.lin[+b.getAttribute('data-l')];
    if (a === 'quitar') { C.lin.splice(C.lin.indexOf(l), 1); return pintarFilas(); }
    if (a === 'ren') { l.ren = !l.ren; return pintarFilas(); }
    if (a === 'ren-ok') {
      var dur = Number($('cb-ren-d').value) || 0, cu = Number($('cb-ren-c').value) || 0, d = C.devs[l.item];
      if (!(dur > 0) || !(cu > 0)) return toast('Poné los meses y la cuota', 'err');
      if (!(await ask('Se crea la línea nueva de «' + d.titulo + '»: ' + dur + ' meses, cuota ' + fmt(cu) + '. La actual queda finalizada, con sus cobros.', 'Renovar mantenimiento', { ok: 'Renovar' }))) return;
      b.disabled = true;
      var r = await db().rpc('renovar_mantenimiento', { did: l.item, duracion: dur, cuota_nueva: cu });
      if (r.error) { b.disabled = false; return toast(r.error.message, 'err'); }
      await cargar(); l.item = r.data.id; l.ren = false; sugerir(l); pintarFilas();
      toast('Renovado: nueva línea ' + r.data.id, 'ok'); if (C.onSave) C.onSave();
    }
  }
  // Razón social y CUIT a los que se factura; si el cliente tiene varias, se elige
  function razones() { var id = C.emp[v('cb-emp')]; return C.rs.filter(function (x) { return x.empresa_id === id; }); }
  function razonSel() { var L = razones(), s = $('cb-razon'); return L[s ? Number(s.value) || 0 : 0] || null; }
  function pintarRs() {
    var L = razones(), box = $('cb-rs');
    if (!v('cb-emp')) { box.innerHTML = ''; return; }
    box.innerHTML = !L.length ? '<div class="ui-p-pendiente u-s11">Este cliente no tiene razón social cargada.</div>' :
      L.length === 1 ? '<div class="u-s11">Se factura a <b>' + esc(L[0].nombre) + '</b> · CUIT <span class="ui-num">' + esc(L[0].cuit || '—') + '</span></div>' :
      '<label class="fl ft-lbl" for="cb-razon">Se factura a</label><select class="fc" id="cb-razon">' + L.map(function (x, i) { return '<option value="' + i + '">' + esc(x.nombre) + ' · CUIT ' + esc(x.cuit || '—') + '</option>'; }).join('') + '</select>';
  }
  function elegirPdf(f) {
    if (!f) return;
    if (!/pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('Tiene que ser un PDF', 'err');
    C.archivo = f; $('cb-adj-t').textContent = f.name + ' · '; $('cb-adj-b').textContent = 'cambiar';
  }
  function partes() {
    return C.lin.filter(function (l) { return l.monto > 0 && l.item; }).map(function (l) {
      return { proy_id: l.proy, item_id: l.item, monto: l.monto, cuota_nro: l.cuota, concepto: l.concepto.trim() };
    });
  }
  function total() {
    var t = partes().reduce(function (a, p) { return a + p.monto; }, 0);
    $('cb-total').textContent = t ? fmt(t, v('cb-mon')) : '—';
    $('cb-usd').textContent = t && C.tc && v('cb-mon') !== 'USD' ? '= ' + fmt(t / C.tc, 'USD') : '';
  }

  async function abrir(modo, ctx, opts) {
    C.modo = modo; C.onSave = (opts || {}).onSave || null; ctx = ctx || {};
    try {
      await cargar();
      var emps = Object.keys(C.emp).sort(function (a, b) { return a.localeCompare(b, 'es'); }), d0 = C.devs[ctx.item_id], p0 = d0 && C.proys.find(function (p) { return p.id === d0.proyecto_id; });
      var e0 = ctx.empresa || (p0 && emps.find(function (e) { return C.emp[e] === p0.empresa_id; })) || '';
      C.lin = [nueva()];
      if (d0) { C.lin[0].proy = d0.proyecto_id; C.lin[0].item = d0.id; sugerir(C.lin[0]); }
      $('cb-emp').innerHTML = '<option value="">— Elegí el cliente —</option>' + emps.map(function (e) { return '<option' + (e === e0 ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('');
      var pago = modo === 'pago';
      $('cb-tit').textContent = pago ? 'Registrar pago' : 'Nueva factura';
      $('cb-fc').hidden = pago; $('cb-adj').hidden = pago; $('cb-forma-w').hidden = !pago; $('cb-otra').hidden = pago;
      C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = 'Arrastrá el PDF de la factura acá o '; $('cb-adj-b').textContent = 'elegí el archivo';
      // Nueva factura sin fecha de depósito: el pago se registra después, con Registrar pago (12/11/2026)
      $('cb-dep-w').hidden = !pago; $('cb-dep-l').innerHTML = 'Fecha del pago <span class="req">*</span>';
      $('cb-nro').value = ''; $('cb-tipo').value = 'Factura C'; $('cb-mon').value = 'ARS';
      $('cb-fecha').value = isoMas(0); $('cb-dep').value = pago ? isoMas(0) : '';
      $('cb-info').textContent = pago ? 'Queda como cobro sin comprobante, con el pago ya registrado. La factura se puede cargar después.'
                                      : '';
      pintarRs(); pintarFilas();
      openM('m-cobro');
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  }
  window.abrirFactura = function (ctx, opts) { return abrir('factura', ctx, opts); };
  window.abrirPago = function (ctx, opts) { return abrir('pago', ctx, opts); };

  async function guardar(otra) {
    var pago = C.modo === 'pago', P = partes(), nc = !pago && /nota de cr/i.test(v('cb-tipo'));
    if (!v('cb-emp')) return toast('Elegí el cliente', 'err');
    if (C.lin.some(function (l) { return l.monto > 0 && !l.item; })) return toast('Elegí el proyecto y el desarrollo de cada línea', 'err');
    if (!P.length) return toast('Poné el monto en al menos una línea', 'err');
    if (pago && !v('cb-dep')) return toast('Falta la fecha del pago', 'err');
    if (!pago && !v('cb-nro')) return toast('Falta el número de la factura', 'err');
    var total = P.reduce(function (a, p) { return a + p.monto; }, 0), rs = razonSel();
    if (!(await ask((pago ? 'Se registra un pago de ' : 'Se guarda ' + v('cb-tipo') + ' ' + v('cb-nro') + ' por ') + fmt(total, v('cb-mon')) + ' de ' + v('cb-emp') + '.' + (C.archivo ? '\n\nEl PDF va a la carpeta de Drive de quien factura.' : ''), pago ? 'Registrar pago' : 'Guardar factura', { ok: 'Guardar' }))) return;
    var b = $('cb-ok'), b2 = $('cb-otra'), fin = function () { b.disabled = false; b2.disabled = false; }; b.disabled = true; b2.disabled = true;   // un clic = un registro
    try {
      // Primero el PDF: si no sube, no queda una factura sin su adjunto
      var link = '', pdfId = '';
      if (C.archivo) { toast('Subiendo el PDF…', 'inf'); var up = await puente('subirFactura', { archivo: C.archivo, owner: (CRM_USUARIO && CRM_USUARIO.mail) || '' }); link = up.url; pdfId = up.id; }
      var r = await db().rpc('registrar_cobro', { p: pago
        ? { tipo_comp: 'Sin comprobante', fecha: v('cb-dep'), fecha_deposito: v('cb-dep'), moneda: v('cb-mon'), forma_pago: v('cb-forma'), partes: P }
        : { tipo_comp: v('cb-tipo'), nro_fact: v('cb-nro'), fecha: v('cb-fecha'), fecha_deposito: null, moneda: v('cb-mon'), forma_pago: nc ? 'Nota de crédito' : 'Factura emitida', partes: P } });
      if (r.error) throw new Error(r.error.message);
      var ids = r.data.ids || [];
      if (pago) deshacerCreados('Registrar pago', 'cobros', ids);
      for (var i = 0; link && i < ids.length; i++) { var l = await db().rpc('cobro_link', { cid: ids[i], link: link }); if (l.error) throw new Error(l.error.message); }
      if (rs && razones().length > 1 && ids.length) { var u = await db().from('cobros').update({ razon_social_fc: rs.nombre, cuit_destino: rs.cuit || '' }).in('id', ids); if (u.error) toast('La razón social no se pudo guardar: ' + u.error.message, 'err'); }
      toast(pago ? 'Pago registrado' : 'Factura guardada · ' + r.data.filas + ' fila(s)', 'ok');
      if (C.onSave) C.onSave();
      if (!pago && !nc) await ofrecerMail(P, total, rs, pdfId);
      if (otra) { $('cb-nro').value = ''; C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = 'Arrastrá el PDF de la factura acá o '; $('cb-adj-b').textContent = 'elegí el archivo'; await cargar(); C.lin = [nueva()]; pintarFilas(); }
      else closeM('m-cobro');
    } catch (e) { toast(e.message, 'err'); }
    fin();
  }
  // Recién guardada: el borrador del mail en Gmail, para revisar y enviar desde ahí
  async function ofrecerMail(P, total, rs, pdfId) {
    var para = rs && String(rs.mail_facturacion || '').trim();
    if (!para) return toast('No hay Mail de facturación en la razón social: el borrador no se preparó', 'inf');
    if (!(await ask('¿Preparo el mail de la factura ' + v('cb-nro') + ' para ' + para + '?\n\nQueda como BORRADOR en tu Gmail: lo revisás y lo enviás desde ahí.', 'Mail al cliente', { ok: 'Preparar' }))) return;
    try {
      var r = await puente('mailFactura', { para: para, cliente: v('cb-emp'), numero: v('cb-nro'), fecha_emision: ff(v('cb-fecha')), concepto: P[0].concepto,
        monto: fmt(total, v('cb-mon')), pdf_id: pdfId, detalle: P.map(function (x) { return { concepto: x.concepto, monto: fmt(x.monto, v('cb-mon')) }; }) });
      toast('Borrador creado en tu Gmail' + (r.aviso ? ' · ' + r.aviso : ''), 'ok'); if (r.url) window.open(r.url, '_blank', 'noopener');
    } catch (e) { toast(e.message, 'err'); }
  }
})();

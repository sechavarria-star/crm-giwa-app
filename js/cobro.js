/* ══════════════════════════════════════════════════════════════════════
   cobro.js · Nueva factura y Registrar pago (27/10/2026)
   ──────────────────────────────────────────────────────────────────────
     abrirFactura(ctx, opts)   la factura emitida (= Cargar factura del Apps Script)
     abrirPago(ctx, opts)      el cobro sin factura: «me pagó tanto» y listo
       ctx  = { empresa, item_id }   empresa = nombre, como en las vistas de facturar
       opts = { onSave: fn() }
   Los dos guardan con crm_giwa.registrar_cobro (= addCobro / addCobroSplit):
   una fila por desarrollo con el mismo comprobante. Se ofrecen los desarrollos
   con algo para facturar (v_facturar_saldos y v_facturar_mensuales) del cliente,
   con su monto sugerido; el monto es editable. Cada línea trae su cuota, su
   concepto y el aviso de ajuste por IPC; arriba, la razón social y el CUIT.
   El PDF va a la carpeta de quien factura y el mail queda como borrador en
   Gmail, por el Apps Script (puente.js). 03/11/2026.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var C = { modo: 'factura', filas: [], onSave: null, rs: [], archivo: null, emp: {}, tc: 0 };
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }

  var HTML =
    '<div class="mo" id="m-cobro"><div class="md md-sm">' +
      '<div class="mh"><span class="mt2" id="cb-tit">Nueva factura</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-cobro">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="fg"><label class="fl ft-lbl" for="cb-emp">Cliente <span class="req">*</span></label><select class="fc" id="cb-emp"></select></div>' +
        '<div class="g3" id="cb-fc"><div class="fg"><label class="fl ft-lbl" for="cb-tipo">Tipo</label><select class="fc" id="cb-tipo">' +
            ['Factura C', 'Factura A', 'Factura B', 'Nota de crédito C', 'Recibo'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-nro">Número <span class="req">*</span></label><input class="fc" id="cb-nro" placeholder="0001-00000001"></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-fecha">Fecha de la factura</label><input class="fc" type="date" id="cb-fecha"></div></div>' +
        '<div class="fg" id="cb-rs"></div>' +
        '<div class="fg"><span class="fl ft-lbl">Desarrollos</span><div id="cb-filas"></div></div>' +
        '<div class="g3"><div class="fg"><label class="fl ft-lbl" for="cb-mon">Moneda</label><select class="fc" id="cb-mon"><option>ARS</option><option>USD</option></select></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-dep" id="cb-dep-l">Fecha del pago</label><input class="fc" type="date" id="cb-dep"></div>' +
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
    $('cb-emp').onchange = function () { pintarRs(); pintarFilas(''); };
    $('cb-filas').addEventListener('input', total);
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
      db().from('v_facturar_saldos').select('proy_id,item_id,empresa,proyecto,titulo,saldo').order('empresa'),
      db().from('v_facturar_mensuales').select('proy_id,item_id,empresa,proyecto,titulo,monto,periodo').order('empresa'),
      db().from('empresas').select('id,nombre'),
      db().from('razones_sociales').select('*').order('por_defecto', { ascending: false }),
      db().from('cobros').select('desarrollo_id,cuota_nro'),
      db().from('desarrollos').select('id,q_cuotas'),
      db().from('v_ajustes_ipc').select('item_id,pct,cuota_sugerida'),
      db().from('v_tipo_cambio_hoy').select('valor').maybeSingle()
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    C.filas = r[0].data.map(function (s) { return { proy_id: s.proy_id, item_id: s.item_id, empresa: s.empresa, titulo: s.titulo, proyecto: s.proyecto, sug: Number(s.saldo) || 0, det: 'Saldo' }; })
      .concat(r[1].data.map(function (m) { return { proy_id: m.proy_id, item_id: m.item_id, empresa: m.empresa, titulo: m.titulo, proyecto: m.proyecto, sug: Number(m.monto) || 0, det: 'Abono ' + (m.periodo || ''), abono: true }; }));
    C.emp = {}; r[2].data.forEach(function (e) { C.emp[e.nombre] = e.id; });
    C.rs = r[3].data; C.tc = Number((r[7].data || {}).valor) || 0;
    var max = {}, tot = {}, ipc = {};
    r[4].data.forEach(function (c) { if (c.desarrollo_id) max[c.desarrollo_id] = Math.max(max[c.desarrollo_id] || 0, Number(c.cuota_nro) || 0); });
    r[5].data.forEach(function (d) { tot[d.id] = Number(d.q_cuotas) || 0; });
    r[6].data.forEach(function (i) { ipc[i.item_id] = i; });
    C.filas.forEach(function (f) { f.cuota = (max[f.item_id] || 0) + 1; f.cuotas = tot[f.item_id] || 0; f.ipc = ipc[f.item_id] || null; });
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
  function conceptoDe(f) { return (f.abono ? 'Mantenimiento mensual — ' + f.titulo + (f.det.length > 6 ? ' — ' + f.det.slice(6) : '') : 'Desarrollo — ' + f.titulo) + (f.cuotas > 1 ? ' · cuota ' + f.cuota + ' de ' + f.cuotas : ''); }
  function pintarFilas(item) {
    var e = v('cb-emp'), L = C.filas.filter(function (f) { return f.empresa === e; });
    $('cb-filas').innerHTML = L.length ? L.map(function (f, i) {
      var on = item ? f.item_id === item : L.length === 1;
      return '<div class="cb-fila"><span class="u-f1m"><span class="dev-tit">' + esc(f.titulo || f.item_id) + '</span>' +
        '<span class="u-s10-mt"> · ' + esc(f.det) + (f.cuotas > 1 ? ' · cuota <span class="m">' + f.cuota + '</span> de <span class="m">' + f.cuotas + '</span>' : '') + ' · sugerido <span class="m">' + fmt(f.sug) + '</span></span>' +
        (f.ipc ? '<div class="ui-p-pendiente u-s11">Corresponde ajuste por IPC: <span class="ui-num">' + String(f.ipc.pct).replace('.', ',') + ' %</span> · cuota sugerida <span class="ui-num">' + fmt(f.ipc.cuota_sugerida) + '</span></div>' : '') +
        '<input class="fc cb-concepto" data-c="' + C.filas.indexOf(f) + '" value="' + esc(conceptoDe(f)) + '" aria-label="Concepto"></span>' +
        '<input class="fc u-tr cb-monto" type="number" min="0" data-monto data-i="' + C.filas.indexOf(f) + '" value="' + (on ? f.sug : '') + '" aria-label="Monto de ' + esc(f.titulo || '') + '"></div>';
    }).join('') : '<div class="empty">Este cliente no tiene nada para facturar.</div>';
    total();
  }
  function partes() {
    return Array.prototype.map.call(document.querySelectorAll('#cb-filas .cb-monto'), function (x) {
      var f = C.filas[+x.getAttribute('data-i')], m = Number(x.value) || 0;
      var ci = document.querySelector('#cb-filas [data-c="' + x.getAttribute('data-i') + '"]');
      return m > 0 ? { proy_id: f.proy_id, item_id: f.item_id, monto: m, cuota_nro: f.cuota, concepto: ci ? ci.value.trim() : f.titulo } : null;
    }).filter(Boolean);
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
      var emps = C.filas.map(function (f) { return f.empresa; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).sort();
      var e0 = ctx.empresa || (ctx.item_id && (C.filas.find(function (f) { return f.item_id === ctx.item_id; }) || {}).empresa) || '';
      $('cb-emp').innerHTML = '<option value="">— Elegí el cliente —</option>' + emps.map(function (e) { return '<option' + (e === e0 ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('');
      var pago = modo === 'pago';
      $('cb-tit').textContent = pago ? 'Registrar pago' : 'Nueva factura';
      $('cb-fc').hidden = pago; $('cb-adj').hidden = pago; $('cb-forma-w').hidden = !pago; $('cb-otra').hidden = pago;
      C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = 'Arrastrá el PDF de la factura acá o '; $('cb-adj-b').textContent = 'elegí el archivo';
      $('cb-dep-l').innerHTML = pago ? 'Fecha del pago <span class="req">*</span>' : 'Fecha de depósito (si ya pagó)';
      $('cb-nro').value = ''; $('cb-tipo').value = 'Factura C'; $('cb-mon').value = 'ARS';
      $('cb-fecha').value = isoMas(0); $('cb-dep').value = pago ? isoMas(0) : '';
      $('cb-info').textContent = pago ? 'Queda como cobro sin comprobante, con el pago ya registrado. La factura se puede cargar después.'
                                      : '';
      pintarRs(); pintarFilas(ctx.item_id || '');
      openM('m-cobro');
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  }
  window.abrirFactura = function (ctx, opts) { return abrir('factura', ctx, opts); };
  window.abrirPago = function (ctx, opts) { return abrir('pago', ctx, opts); };

  async function guardar(otra) {
    var pago = C.modo === 'pago', P = partes(), nc = !pago && /nota de cr/i.test(v('cb-tipo'));
    if (!v('cb-emp')) return toast('Elegí el cliente', 'err');
    if (!P.length) return toast('Poné el monto en al menos un desarrollo', 'err');
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
        : { tipo_comp: v('cb-tipo'), nro_fact: v('cb-nro'), fecha: v('cb-fecha'), fecha_deposito: v('cb-dep'), moneda: v('cb-mon'), forma_pago: nc ? 'Nota de crédito' : 'Factura emitida', partes: P } });
      if (r.error) throw new Error(r.error.message);
      var ids = r.data.ids || [];
      for (var i = 0; link && i < ids.length; i++) { var l = await db().rpc('cobro_link', { cid: ids[i], link: link }); if (l.error) throw new Error(l.error.message); }
      if (rs && razones().length > 1 && ids.length) { var u = await db().from('cobros').update({ razon_social_fc: rs.nombre, cuit_destino: rs.cuit || '' }).in('id', ids); if (u.error) toast('La razón social no se pudo guardar: ' + u.error.message, 'err'); }
      toast(pago ? 'Pago registrado' : 'Factura guardada · ' + r.data.filas + ' fila(s)', 'ok');
      if (C.onSave) C.onSave();
      if (!pago && !nc) await ofrecerMail(P, total, rs, pdfId);
      if (otra) { $('cb-nro').value = ''; C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = 'Arrastrá el PDF de la factura acá o '; $('cb-adj-b').textContent = 'elegí el archivo'; await cargar(); pintarFilas(''); }
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

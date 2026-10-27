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
   con su monto sugerido; el monto es editable.
   PENDIENTE: el PDF a Drive y el mail al cliente siguen en el CRM actual.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var C = { modo: 'factura', filas: [], onSave: null };
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
        '<div class="fg"><span class="fl ft-lbl">Desarrollos</span><div id="cb-filas"></div></div>' +
        '<div class="g3"><div class="fg"><label class="fl ft-lbl" for="cb-mon">Moneda</label><select class="fc" id="cb-mon"><option>ARS</option><option>USD</option></select></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="cb-dep" id="cb-dep-l">Fecha del pago</label><input class="fc" type="date" id="cb-dep"></div>' +
          '<div class="fg"><span class="fl ft-lbl">Total</span><div class="m cb-total" id="cb-total">—</div></div></div>' +
        '<div class="ft-info" id="cb-info"></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-cobro">Cancelar</button><button class="btn bp" id="cb-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    $('cb-emp').onchange = function () { pintarFilas(''); };
    $('cb-filas').addEventListener('input', total);
    $('cb-mon').onchange = total;
    $('cb-ok').onclick = guardar;
  });

  async function cargar() {
    var r = await Promise.all([
      db().from('v_facturar_saldos').select('proy_id,item_id,empresa,proyecto,titulo,saldo').order('empresa'),
      db().from('v_facturar_mensuales').select('proy_id,item_id,empresa,proyecto,titulo,monto,periodo').order('empresa')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    C.filas = r[0].data.map(function (s) { return { proy_id: s.proy_id, item_id: s.item_id, empresa: s.empresa, titulo: s.titulo, proyecto: s.proyecto, sug: Number(s.saldo) || 0, det: 'Saldo' }; })
      .concat(r[1].data.map(function (m) { return { proy_id: m.proy_id, item_id: m.item_id, empresa: m.empresa, titulo: m.titulo, proyecto: m.proyecto, sug: Number(m.monto) || 0, det: 'Abono ' + (m.periodo || '') }; }));
  }
  function pintarFilas(item) {
    var e = v('cb-emp'), L = C.filas.filter(function (f) { return f.empresa === e; });
    $('cb-filas').innerHTML = L.length ? L.map(function (f, i) {
      var on = item ? f.item_id === item : L.length === 1;
      return '<div class="cb-fila"><span class="u-f1m"><span class="dev-tit">' + esc(f.titulo || f.item_id) + '</span>' +
        '<span class="u-s10-mt"> · ' + esc(f.det) + ' · sugerido <span class="m">' + fmt(f.sug) + '</span></span></span>' +
        '<input class="fc u-tr cb-monto" type="number" min="0" step="0.01" data-i="' + C.filas.indexOf(f) + '" value="' + (on ? f.sug : '') + '" aria-label="Monto de ' + esc(f.titulo || '') + '"></div>';
    }).join('') : '<div class="empty">Este cliente no tiene nada para facturar.</div>';
    total();
  }
  function partes() {
    return Array.prototype.map.call(document.querySelectorAll('#cb-filas .cb-monto'), function (x) {
      var f = C.filas[+x.getAttribute('data-i')], m = Number(x.value) || 0;
      return m > 0 ? { proy_id: f.proy_id, item_id: f.item_id, monto: m, concepto: f.titulo + (f.det.indexOf('Abono') === 0 ? ' — ' + f.det.slice(6) : '') } : null;
    }).filter(Boolean);
  }
  function total() {
    var t = partes().reduce(function (a, p) { return a + p.monto; }, 0);
    $('cb-total').textContent = t ? fmt(t, v('cb-mon')) : '—';
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
      $('cb-fc').hidden = pago;
      $('cb-dep-l').innerHTML = pago ? 'Fecha del pago <span class="req">*</span>' : 'Fecha de depósito (si ya pagó)';
      $('cb-nro').value = ''; $('cb-tipo').value = 'Factura C'; $('cb-mon').value = 'ARS';
      $('cb-fecha').value = isoMas(0); $('cb-dep').value = pago ? isoMas(0) : '';
      $('cb-info').textContent = pago ? 'Queda como cobro sin comprobante, con el pago ya registrado. La factura se puede cargar después.'
                                      : 'El PDF y el mail al cliente siguen en el CRM actual.';
      pintarFilas(ctx.item_id || '');
      openM('m-cobro');
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  }
  window.abrirFactura = function (ctx, opts) { return abrir('factura', ctx, opts); };
  window.abrirPago = function (ctx, opts) { return abrir('pago', ctx, opts); };

  async function guardar() {
    var pago = C.modo === 'pago', P = partes();
    if (!v('cb-emp')) return toast('Elegí el cliente', 'err');
    if (!P.length) return toast('Poné el monto en al menos un desarrollo', 'err');
    if (pago && !v('cb-dep')) return toast('Falta la fecha del pago', 'err');
    if (!pago && !v('cb-nro')) return toast('Falta el número de la factura', 'err');
    var b = $('cb-ok'); b.disabled = true;                // un clic = un registro
    var r = await db().rpc('registrar_cobro', { p: pago
      ? { tipo_comp: 'Sin comprobante', fecha: v('cb-dep'), fecha_deposito: v('cb-dep'), moneda: v('cb-mon'), partes: P }
      : { tipo_comp: v('cb-tipo'), nro_fact: v('cb-nro'), fecha: v('cb-fecha'), fecha_deposito: v('cb-dep'), moneda: v('cb-mon'), partes: P } });
    b.disabled = false;
    if (r.error) return toast(r.error.message, 'err');
    closeM('m-cobro'); toast(pago ? 'Pago registrado' : 'Factura guardada · ' + r.data.filas + ' fila(s)', 'ok');
    if (C.onSave) C.onSave();
  }
})();

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
/* ── Leer la factura adjunta (14/11/2026) · lo usan Nueva factura y Nuevo gasto ──
   leerFactura(archivo, cuitEmisor) → { datos, revisar[], cargada }
     La función factura-leer (Gemini) lee y valida (CUIT, totales, CAE); lo que no
     se lee vuelve vacío y queda en «revisar». cargada = el comprobante ya existe.
   htmlLeido(L, extra) → la línea compacta de revisión. */
var FC_ACEPTA = '.pdf,application/pdf,image/png,image/jpeg,image/webp';
var FC_TXT = 'Arrastrá el PDF o la imagen de la factura acá o ';
function fcArchivoOk(f) { return !!f && (/\.(pdf|png|jpe?g|webp)$/i.test(f.name) || /^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)); }
async function leerFactura(archivo, conEmisor) {
  if (archivo.size > 10 * 1024 * 1024) throw new Error('El archivo es muy grande (máximo 10 MB)');
  var mime = archivo.type || (/\.pdf$/i.test(archivo.name) ? 'application/pdf' : /\.png$/i.test(archivo.name) ? 'image/png' : 'image/jpeg');
  var r = await sb().functions.invoke('factura-leer', { body: { base64: await _base64(archivo), mime: mime } });
  if (r.error || !r.data || !r.data.ok) throw new Error((r.data && r.data.msg) || 'La lectura todavía no está activa: falta cargar la función en Supabase.');
  var d = r.data.datos, cargada = false;
  if (d.tipo && d.numero) {
    var c = await db().rpc('comprobante_cargado', { tipo: d.tipo, nro: d.numero, cuit_emisor: conEmisor ? d.emisor_cuit || null : null });
    cargada = !c.error && c.data === true;
  }
  return { datos: d, revisar: r.data.revisar || [], cargada: cargada };
}
function htmlLeido(L, extra) {
  var d = L.datos, M = d.moneda || 'ARS', n = function (x) { return '<span class="ui-num">' + esc(x) + '</span>'; };
  var partes = [esc(d.tipo || 'Comprobante') + (d.numero ? ' ' + n(d.numero) : ''), d.fecha ? n(ff(d.fecha)) : '',
    d.neto_gravado ? 'Neto ' + n(fmt(d.neto_gravado, M)) : '',
    (d.iva || []).map(function (i) { return 'IVA ' + n(String(i.alicuota).replace('.', ',') + ' %') + ' ' + n(fmt(i.monto, M)); }).join(' · '),
    (d.otros || []).length ? 'Otros ' + n(fmt(d.otros.reduce(function (a, o) { return a + o.monto; }, 0), M)) : '',
    d.total ? 'Total ' + n(fmt(d.total, M)) : '', d.vence_pago ? 'Vence el pago ' + n(ff(d.vence_pago)) : '', d.cae ? 'CAE ' + n(d.cae) + (d.cae_vto ? ' vence ' + n(ff(d.cae_vto)) : '') : ''].filter(Boolean);
  var rev = L.revisar.concat(extra || []);
  return '<div class="u-s11">Leído: ' + partes.join(' · ') + '</div>' +
    (L.cargada ? '<div class="u-s11 ui-p-error">Este comprobante ya está cargado: no se puede guardar de nuevo.</div>' : '') +
    (rev.length ? '<div class="u-s11 ui-p-pendiente">Revisar: ' + rev.map(esc).join(' · ') + '</div>' : '');
}
window.leerFactura = leerFactura; window.htmlLeido = htmlLeido;

(function () {
  var C = { modo: 'factura', lin: [], ed: { proy: '', item: '', concepto: '', cuota: 1, monto: 0, ren: false }, devs: {}, proys: [], mens: {}, cob: {}, ipc: {}, onSave: null, rs: [], archivo: null, emp: {}, tc: 0, leido: null };
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
        '<div class="fg cb-arca" id="cb-arca" hidden></div>' +
        '<div class="cb-lin cb-lin-h"><span>Proyecto <span class="req">*</span></span><span>Desarrollo <span class="req">*</span></span><span class="u-tr">Cuota</span><span class="u-tr">Monto</span><span></span></div>' +
        '<div id="cb-filas"></div>' +
        '<div class="g3"><div class="fg"><label class="fl ft-lbl" for="cb-mon">Moneda</label><select class="fc" id="cb-mon"><option>ARS</option><option>USD</option></select></div>' +
          '<div class="fg" id="cb-dep-w"><label class="fl ft-lbl" for="cb-dep" id="cb-dep-l">Fecha del pago</label><input class="fc" type="date" id="cb-dep"></div>' +
          '<div class="fg"><span class="fl ft-lbl">Total</span><div class="m cb-total" id="cb-total">—</div><div class="ui-num ui-p-usd u-s11" id="cb-usd"></div></div></div>' +
        '<div class="fg" id="cb-forma-w" hidden><label class="fl ft-lbl" for="cb-forma">Forma de pago</label><select class="fc" id="cb-forma"><option>Transferencia</option><option>Efectivo</option></select></div>' +
        '<div class="cb-adj" id="cb-adj"><input type="file" id="cb-file" accept="' + FC_ACEPTA + '" hidden><span id="cb-adj-t">' + FC_TXT + '</span>' +
          '<button type="button" class="ui-lnk ui-azul" id="cb-adj-b">elegí el archivo</button></div>' +
        '<div class="u-mb12" id="cb-leido" hidden></div>' +
        '<div class="ft-info" id="cb-info"></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-cobro">Cancelar</button><button class="btn bg" id="cb-otra">Guardar y cargar otra</button><button class="btn bp" id="cb-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    $('cb-emp').onchange = function () { C.lin = []; C.ed = nueva(); pintarRs(); pintarFilas(); };
    $('cb-filas').addEventListener('change', cambioLinea);
    $('cb-filas').addEventListener('input', tipeoLinea);
    $('cb-filas').addEventListener('click', clicLinea);
    $('cb-mon').onchange = total;
    $('cb-rs').addEventListener('change', pintarArca);
    $('cb-arca').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-copiar]'); if (!b) return;
      navigator.clipboard.writeText(b.getAttribute('data-copiar')).then(function () { toast('Copiado'); }, function () { toast('No se pudo copiar', 'err'); });
    });
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
    l.cuota = cob.max + 1 + C.lin.filter(function (x) { return x.item === l.item; }).length;   // ya agregado en la lista: la cuota siguiente
    l.monto = m ? Number(m.monto) || 0 : cuota > 0 ? cuota : saldo > 0 ? saldo : cob.ultimo;   // la cuota, si no el saldo, si no lo último
    l.concepto = (d.es_mantenimiento ? 'Mantenimiento mensual — ' + d.titulo + (m && m.periodo ? ' — ' + m.periodo : '') : 'Desarrollo — ' + d.titulo) + (cuotas > 1 ? ' · cuota ' + l.cuota + ' de ' + cuotas : '');
    if (C.leido && C.leido.datos.total > 0 && !C.lin.length) l.monto = C.leido.datos.total;   // el primer concepto: el total leído
  }
  function opcion(val, txt, sel) { return '<option value="' + esc(val) + '"' + (val === sel ? ' selected' : '') + '>' + esc(txt) + '</option>'; }
  function pintarFilas() {
    var id = C.emp[v('cb-emp')], ps = C.proys.filter(function (p) { return p.empresa_id === id; });
    if (!id) { $('cb-filas').innerHTML = '<div class="ui-nota-t u-mb6">Elegí el cliente.</div>'; total(); return; }
    // Fila de carga (C.ed): se elige, se ve el monto y se agrega a la lista de abajo (19/11/2026)
    var l = C.ed, sols = l.proy ? desarrollosDe(l.proy) : [], d = C.devs[l.item], ipc = C.ipc[l.item];
    var datos = !d ? '' : '<span>Contratado <span class="ui-num">' + fmt(Number(d.total_ars) || 0) + '</span></span><span>Facturado <span class="ui-num">' + fmt(Number(d.facturado) || 0) + '</span></span>' +
      '<span>Saldo <span class="ui-num">' + fmt(Math.max(0, Number(d.saldo) || 0)) + '</span></span>' + (renovable(d) ? '<button type="button" class="ui-lnk ui-azul" data-acc="ren">Renovar mantenimiento</button>' : '');
    var tot = C.lin.reduce(function (a, x) { return a + x.monto; }, 0);
    $('cb-filas').innerHTML = '<div class="cb-ed"><div class="cb-lin">' +
        '<select class="fc" data-c="proy" aria-label="Proyecto"><option value="">— Proyecto —</option>' + ps.map(function (p) { return opcion(p.id, p.nombre || p.id, l.proy); }).join('') + '</select>' +
        '<select class="fc" data-c="item" aria-label="Desarrollo"' + (l.proy ? '' : ' disabled') + '><option value="">' + (l.proy && !sols.length ? '— Ninguno arrancó todavía —' : '— Desarrollo —') + '</option>' + sols.map(function (x) { return opcion(x.id, x.titulo || x.id, l.item); }).join('') + '</select>' +
        '<input class="fc u-tr ui-num" type="number" min="1" data-c="cuota" value="' + esc(l.cuota) + '" aria-label="Número de cuota">' +
        '<input class="fc u-tr ui-num" type="number" min="0" data-monto data-c="monto" value="' + (l.monto || '') + '" aria-label="Monto">' +
        '<button type="button" class="btn bg sm" data-acc="agregar">Agregar</button>' +
      '</div>' +
      (d ? '<input class="fc u-mb6" data-c="concepto" value="' + esc(l.concepto) + '" aria-label="Concepto" placeholder="Concepto">' : '') +
      (datos ? '<div class="cb-sub">' + datos + '</div>' : '') +
      (ipc ? '<div class="cb-sub ui-p-pendiente">Corresponde ajuste por IPC: <span class="ui-num">' + String(ipc.pct).replace('.', ',') + ' %</span> · cuota sugerida <span class="ui-num">' + fmt(ipc.cuota_sugerida) + '</span></div>' : '') +
      (l.ren && d ? '<div class="cb-sub cb-ren"><label class="fl" for="cb-ren-d">Meses</label><input class="fc u-tr ui-num" type="number" min="1" id="cb-ren-d" value="' + (Number(d.cuotas) || 12) + '">' +
        '<label class="fl" for="cb-ren-c">Cuota</label><input class="fc u-tr ui-num" type="number" min="0" data-monto id="cb-ren-c" value="' + Math.round((ipc && ipc.cuota_sugerida) || d.cuota || 0) + '">' +
        '<button type="button" class="ui-btn ui-p" data-acc="ren-ok">Renovar</button></div>' : '') +
      '</div>' +
      // Lista de lo agregado: el concepto entero, la cuota, el monto y el total que se va sumando
      (C.lin.length ? '<div class="cb-lista">' + C.lin.map(function (x, i) {
        return '<div class="ui-linea"><span class="cb-lista-c">' + esc(x.concepto || (C.devs[x.item] || {}).titulo || '—') + '</span>' +
          '<span class="ui-num u-nw">cuota ' + esc(x.cuota) + '</span><span class="ui-num u-nw cb-lista-m">' + fmt(x.monto, v('cb-mon')) + '</span>' +
          '<button type="button" class="ui-ib" data-acc="quitar" data-l="' + i + '" data-tip="Quitar" aria-label="Quitar">' + ico('cerrar') + '</button></div>';
      }).join('') + '<div class="ui-linea cb-lista-t"><span class="cb-lista-c">Total</span><span class="ui-num u-nw cb-lista-m">' + fmt(tot, v('cb-mon')) + '</span><span class="cb-arca-b"></span></div></div>' : '');
    total();
  }
  function cambioLinea(ev) {
    if (!ev.target.closest('.cb-ed')) return;
    var l = C.ed, c = ev.target.getAttribute('data-c');
    if (c === 'proy') { l.proy = ev.target.value; l.item = ''; l.concepto = ''; l.monto = 0; l.cuota = 1; l.ren = false; var s = desarrollosDe(l.proy); if (s.length === 1) { l.item = s[0].id; sugerir(l); } return pintarFilas(); }
    if (c === 'item') { l.item = ev.target.value; l.concepto = ''; l.monto = 0; l.cuota = 1; l.ren = false; sugerir(l); return pintarFilas(); }
  }
  function tipeoLinea(ev) {
    if (!ev.target.closest('.cb-ed')) return;
    var l = C.ed, c = ev.target.getAttribute('data-c');
    if (c === 'concepto') l.concepto = ev.target.value;
    if (c === 'cuota') l.cuota = Number(ev.target.value) || 1;
    if (c === 'monto') l.monto = Number(ev.target.value) || 0;
  }
  async function clicLinea(ev) {
    var b = ev.target.closest('[data-acc]'); if (!b) return;
    var a = b.getAttribute('data-acc'), l = C.ed;
    if (a === 'quitar') { C.lin.splice(+b.getAttribute('data-l'), 1); return pintarFilas(); }
    if (a === 'agregar') {
      if (!l.item || !(l.monto > 0)) return toast('Elegí el proyecto, el desarrollo y poné el monto', 'err');
      C.lin.push({ proy: l.proy, item: l.item, concepto: l.concepto.trim(), cuota: l.cuota, monto: l.monto }); C.ed = nueva(); return pintarFilas();
    }
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
      L.length === 1 ? '' :   // con una sola, la razón social y el CUIT se ven en Datos para facturar en ARCA
      '<label class="fl ft-lbl" for="cb-razon">Se factura a</label><select class="fc" id="cb-razon">' + L.map(function (x, i) { return '<option value="' + i + '">' + esc(x.nombre) + ' · CUIT ' + esc(x.cuit || '—') + '</option>'; }).join('') + '</select>';
    pintarArca();
  }
  // Datos para facturar en ARCA (18/11/2026): lo que se copia en Comprobantes en línea, con un botón por dato
  var ARCA_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
  function pintarArca() {
    var box = $('cb-arca'), rs = razonSel(); if (!box) return;
    box.hidden = C.modo === 'pago' || !v('cb-emp') || !rs;
    if (box.hidden) { box.innerHTML = ''; return; }
    var P = partes(), t = P.reduce(function (a, p) { return a + p.monto; }, 0);
    var fila = function (lbl, val, num) {
      return '<div class="ui-linea"><span class="cb-arca-l">' + lbl + '</span><span class="ui-f1' + (num ? ' ui-num' : '') + '">' + esc(val || '—') + '</span>' +
        (val ? '<button type="button" class="ui-ib" data-copiar="' + esc(val) + '" data-tip="Copiar" aria-label="Copiar ' + lbl + '">' + ico('lista') + '</button>' : '<span class="cb-arca-b"></span>') + '</div>';
    };
    box.innerHTML = '<div class="cb-arca-h"><span class="fl ft-lbl">Datos para facturar en ARCA</span><a class="ui-lnk ui-azul" href="' + ARCA_URL + '" target="_blank" rel="noopener">Abrir ARCA</a></div>' +
      fila('Razón social', rs.nombre) + fila('CUIT', String(rs.cuit || '').replace(/\D/g, ''), true) + fila('Condición fiscal', rs.condicion_fiscal) + fila('Domicilio', rs.direccion) +
      fila('Concepto', P.map(function (p) { return p.concepto; }).filter(Boolean).join(' / ')) +
      fila('Importe', t ? t.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : '', true);
  }
  async function elegirPdf(f) {
    if (!f) return;
    if (!fcArchivoOk(f)) return toast('Tiene que ser un PDF o una imagen (JPG, PNG)', 'err');
    C.archivo = f; $('cb-adj-t').textContent = f.name + ' · '; $('cb-adj-b').textContent = 'cambiar';
    C.leido = null; $('cb-leido').hidden = false; $('cb-leido').innerHTML = '<div class="u-s11-mt">Leyendo la factura…</div>';
    try { aplicarLeido(await leerFactura(f, false)); }
    catch (e) { $('cb-leido').innerHTML = '<div class="u-s11 ui-p-pendiente">' + esc(e.message) + ' · completá los datos a mano.</div>'; }
  }
  // Lo leído completa el modal; el cliente sale del CUIT del receptor (razones_sociales)
  function aplicarLeido(L) {
    var d = L.datos, extra = [];
    C.leido = L;
    if (d.tipo) {
      if (![].some.call($('cb-tipo').options, function (o) { return o.value === d.tipo; })) $('cb-tipo').insertAdjacentHTML('beforeend', '<option>' + esc(d.tipo) + '</option>');
      $('cb-tipo').value = d.tipo;
    }
    if (d.numero) $('cb-nro').value = d.numero;
    if (d.fecha) $('cb-fecha').value = d.fecha;
    if (d.moneda) $('cb-mon').value = d.moneda;
    var rz = d.receptor_cuit ? C.rs.filter(function (x) { return String(x.cuit || '').replace(/\D/g, '') === d.receptor_cuit; })[0] : null;
    var emp = rz && Object.keys(C.emp).find(function (e) { return C.emp[e] === rz.empresa_id; });
    if (emp) {
      $('cb-emp').value = emp; C.lin = []; C.ed = nueva(); pintarRs();
      var i = razones().indexOf(rz); if ($('cb-razon') && i >= 0) $('cb-razon').value = String(i);
    } else if (d.receptor_cuit) extra.push('El receptor (CUIT ' + d.receptor_cuit + ') no es un cliente cargado: si es de un proveedor, va en Gastos');
    C.leido.extra = extra;
    pintarFilas();
    $('cb-leido').innerHTML = htmlLeido(L, extra);
  }
  // Lo que no cierra entre lo leído y lo que se va a guardar
  function inconsistencias() {
    var L = C.leido; if (!L) return [];
    var d = L.datos, t = partes().reduce(function (a, p) { return a + p.monto; }, 0), out = L.revisar.concat(L.extra || []);
    if (d.total > 0 && Math.abs(t - d.total) > 1) out.push('Las líneas suman ' + fmt(t, v('cb-mon')) + ' y la factura dice ' + fmt(d.total, d.moneda || v('cb-mon')));
    if (d.moneda && d.moneda !== v('cb-mon')) out.push('La factura está en ' + d.moneda + ' y se guarda en ' + v('cb-mon'));
    return out;
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
    pintarArca();
  }

  async function abrir(modo, ctx, opts) {
    C.modo = modo; C.onSave = (opts || {}).onSave || null; ctx = ctx || {};
    try {
      await cargar();
      var emps = Object.keys(C.emp).sort(function (a, b) { return a.localeCompare(b, 'es'); }), d0 = C.devs[ctx.item_id], p0 = d0 && C.proys.find(function (p) { return p.id === d0.proyecto_id; });
      var e0 = ctx.empresa || (p0 && emps.find(function (e) { return C.emp[e] === p0.empresa_id; })) || '';
      C.lin = []; C.ed = nueva();
      if (d0) { C.ed.proy = d0.proyecto_id; C.ed.item = d0.id; sugerir(C.ed); }
      $('cb-emp').innerHTML = '<option value="">— Elegí el cliente —</option>' + emps.map(function (e) { return '<option' + (e === e0 ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('');
      var pago = modo === 'pago';
      $('cb-tit').textContent = pago ? 'Registrar pago' : 'Nueva factura';
      $('cb-fc').hidden = pago; $('cb-adj').hidden = pago; $('cb-forma-w').hidden = !pago; $('cb-otra').hidden = pago;
      C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = FC_TXT; $('cb-adj-b').textContent = 'elegí el archivo';
      C.leido = null; $('cb-leido').hidden = true; $('cb-leido').innerHTML = '';
      // Nueva factura sin fecha de depósito: el pago se registra después, con Registrar pago (12/11/2026)
      $('cb-dep-w').hidden = !pago; $('cb-dep-l').innerHTML = 'Fecha del pago <span class="req">*</span>';
      $('cb-nro').value = ''; $('cb-tipo').value = 'Factura C'; $('cb-mon').value = 'ARS';
      $('cb-fecha').value = isoMas(0); $('cb-dep').value = pago ? isoMas(0) : '';
      $('cb-info').textContent = pago ? 'Queda como cobro sin comprobante, con el pago ya registrado. La factura se puede cargar después.'
                                      : '';
      pintarRs(); pintarFilas();
      if (!pago) proxNro();
      openM('m-cobro');
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  }
  // Número sugerido (16/11/2026): la última Factura de quien factura + 1, en su punto de venta (0005-00000050)
  async function proxNro() {
    var yo = (CRM_USUARIO && CRM_USUARIO.mail) || ''; if (!yo) return;
    var r = await db().from('v_cobros').select('nro_factura,fecha_comp').eq('factura_owner', yo).ilike('tipo_comp', 'Factura%').order('fecha_comp', { ascending: false }).limit(60);
    var pv = '', max = 0;
    (r.data || []).forEach(function (c) { var m = String(c.nro_factura || '').match(/^(\d+)-(\d+)$/); if (!m) return; if (!pv) pv = m[1]; if (Number(m[1]) === Number(pv)) max = Math.max(max, Number(m[2])); });
    var inp = $('cb-nro'); if (!pv || !inp || inp.value) return;
    inp.value = String(Number(pv)).padStart(4, '0') + '-' + String(max + 1).padStart(8, '0');
  }
  window.abrirFactura = function (ctx, opts) { return abrir('factura', ctx, opts); };
  window.abrirPago = function (ctx, opts) { return abrir('pago', ctx, opts); };

  async function guardar(otra) {
    var pago = C.modo === 'pago', P = partes(), nc = !pago && /nota de cr/i.test(v('cb-tipo'));
    if (!v('cb-emp')) return toast('Elegí el cliente', 'err');
    if (C.ed.item) return toast('Agregá la línea o vaciala', 'err');
    if (!P.length) return toast('Agregá al menos un concepto', 'err');
    if (pago && !v('cb-dep')) return toast('Falta la fecha del pago', 'err');
    if (!pago && !v('cb-nro')) return toast('Falta el número de la factura', 'err');
    var total = P.reduce(function (a, p) { return a + p.monto; }, 0), rs = razonSel();
    if (!pago && C.leido && C.leido.cargada) return toast('Este comprobante ya está cargado', 'err');
    var inc = pago ? [] : inconsistencias();
    if (inc.length && !(await ask('Revisá antes de guardar:\n\n• ' + inc.join('\n• '), 'La factura tiene diferencias', { ok: 'Guardar igual' }))) return;
    if (!(await ask((pago ? 'Se registra un pago de ' : 'Se guarda ' + v('cb-tipo') + ' ' + v('cb-nro') + ' por ') + fmt(total, v('cb-mon')) + ' de ' + v('cb-emp') + '.' + (C.archivo ? '\n\nEl PDF va a la carpeta de Drive de quien factura.' : ''), pago ? 'Registrar pago' : 'Guardar factura', { ok: 'Guardar' }))) return;
    var b = $('cb-ok'), b2 = $('cb-otra'), fin = function () { b.disabled = false; b2.disabled = false; }; b.disabled = true; b2.disabled = true;   // un clic = un registro
    try {
      // Primero el PDF: si no sube, no queda una factura sin su adjunto
      var link = '', pdfId = '';
      if (C.archivo) { toast('Subiendo el PDF…', 'inf'); var up = await puente('subirFactura', { archivo: C.archivo, owner: (CRM_USUARIO && CRM_USUARIO.mail) || '' }); link = up.url; pdfId = up.id; }
      var r = await db().rpc('registrar_cobro', { p: pago
        ? { tipo_comp: 'Sin comprobante', fecha: v('cb-dep'), fecha_deposito: v('cb-dep'), moneda: v('cb-mon'), forma_pago: v('cb-forma'), partes: P }
        : { tipo_comp: v('cb-tipo'), nro_fact: v('cb-nro'), fecha: v('cb-fecha'), fecha_deposito: null, moneda: v('cb-mon'), forma_pago: nc ? 'Nota de crédito' : 'Factura emitida', partes: P, datos_fc: C.leido ? C.leido.datos : null } });
      if (r.error) throw new Error(r.error.message);
      var ids = r.data.ids || [];
      if (pago) deshacerCreados('Registrar pago', 'cobros', ids);
      for (var i = 0; link && i < ids.length; i++) { var l = await db().rpc('cobro_link', { cid: ids[i], link: link }); if (l.error) throw new Error(l.error.message); }
      if (rs && razones().length > 1 && ids.length) { var u = await db().from('cobros').update({ razon_social_fc: rs.nombre, cuit_destino: rs.cuit || '' }).in('id', ids); if (u.error) toast('La razón social no se pudo guardar: ' + u.error.message, 'err'); }
      toast(pago ? 'Pago registrado' : 'Factura guardada · ' + r.data.filas + ' fila(s)', 'ok');
      if (C.onSave) C.onSave();
      if (!pago && !nc) await ofrecerMail(P, total, rs, pdfId);
      if (otra) { $('cb-nro').value = ''; C.archivo = null; $('cb-file').value = ''; $('cb-adj-t').textContent = FC_TXT; $('cb-adj-b').textContent = 'elegí el archivo'; C.leido = null; $('cb-leido').hidden = true; await cargar(); C.lin = []; C.ed = nueva(); pintarFilas(); }
      else closeM('m-cobro');
    } catch (e) { toast(e.message, 'err'); }
    fin();
  }
  // Recién guardada (17/11/2026): el mail con la factura se abre en la ventana de Administración, con su plantilla
  // y el PDF adjunto; se corrige ahí y sale desde administracion@ recién con «Enviar». Ya no se abre Gmail.
  async function ofrecerMail(P, total, rs, pdfId) {
    var para = rs && String(rs.mail_facturacion || '').trim();
    if (!para) return toast('No hay Mail de facturación en la razón social: el mail no se preparó', 'inf');
    var dos = function (n) { return (v('cb-mon') === 'USD' ? 'USD ' : '$ ') + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    try {
      toast('Preparando el mail…', 'inf');
      var r = await puente('mailFacturaVer', { para: para, cliente: v('cb-emp'), numero: v('cb-nro'), fecha_emision: ff(v('cb-fecha')), concepto: P[0].concepto,
        monto: dos(total), pdf_id: pdfId, detalle: P.map(function (x) { return { concepto: x.concepto, monto: dos(x.monto) }; }) });
      mailAdmin({ para: r.para, asunto: r.asunto, html: r.html, pdf_id: pdfId, pdf_nombre: 'Factura ' + v('cb-nro') + '.pdf' });
    } catch (e) { toast(e.message, 'err'); }
  }

  // ── Ventana de mail de Administración (17/11/2026) ──
  // Para, asunto, texto con formato (negrita, cursiva, lista, link) y adjuntos. Sale siempre desde
  // administracion@giwa-ia.com por el Puente; nada se manda sin «Enviar».
  var MA = { adj: [] };
  function maAdjPintar() {
    var l = document.getElementById('ma-adj-l'); if (!l) return;
    l.innerHTML = (MA.pdf ? '<div class="ui-linea"><span class="ui-f1">' + ico('documento') + ' ' + esc(MA.pdf) + '</span><span class="ui-nota-t">factura</span></div>' : '') +
      MA.adj.map(function (a, k) { return '<div class="ui-linea"><span class="ui-f1">' + ico('clip') + ' ' + esc(a.nombre) + '</span><button type="button" class="ui-ib" data-ma-quitar="' + k + '" data-tip="Quitar" aria-label="Quitar ' + esc(a.nombre) + '">' + ico('cerrar') + '</button></div>'; }).join('');
  }
  window.mailAdmin = function (o) {
    MA = { adj: [], pdf: o.pdf_id ? (o.pdf_nombre || 'Factura.pdf') : '', pdf_id: o.pdf_id || '' };
    var m = document.getElementById('m-madmin');
    if (!m) {
      m = document.createElement('div'); m.className = 'mo'; m.id = 'm-madmin';
      var bt = function (c, t, i) { return '<button type="button" class="btn bg xs" data-ma-cmd="' + c + '" title="' + t + '">' + i + '</button>'; };
      m.innerHTML = '<div class="md"><div class="mh"><span class="mt2">Nuevo mail · Administración</span>' +
        '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-madmin">' + ico('cerrar') + '</button></div><div class="mb2">' +
        '<div class="ui-nota-t">De: GIWA {IA} - Administración · administracion@giwa-ia.com</div>' +
        '<div class="fg"><label class="fl" for="ma-para">Para</label><input class="fc" id="ma-para"></div>' +
        // CC y CCO (18/11/2026): opcionales, varios separados por coma
        '<div class="g2"><div class="fg"><label class="fl" for="ma-cc">CC</label><input class="fc" id="ma-cc"></div>' +
          '<div class="fg"><label class="fl" for="ma-cco">CCO</label><input class="fc" id="ma-cco"></div></div>' +
        '<div class="fg"><label class="fl" for="ma-as">Asunto</label><input class="fc" id="ma-as"></div>' +
        '<div class="u-row8 u-mb6">' + bt('bold', 'Negrita', '<b>N</b>') + bt('italic', 'Cursiva', '<i>C</i>') + bt('insertUnorderedList', 'Lista', '•') + bt('createLink', 'Link', 'Link') + '</div>' +
        '<iframe class="sop-rev-mail" id="ma-fr" title="Texto del mail"></iframe>' +
        '<div class="fg u-mt10"><div class="u-row8"><span class="fl u-f1">Adjuntos</span><label class="btn bg xs">' + ico('clip') + ' Adjuntar<input type="file" id="ma-file" class="ui-arch-inp" multiple hidden></label></div><div id="ma-adj-l"></div></div>' +
        '</div><div class="mf"><button class="btn bg" data-cerrar="m-madmin">Cancelar</button><button class="btn bp" id="ma-ok">Enviar</button></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (ev) {
        var c = ev.target.closest('[data-ma-cmd]'), q = ev.target.closest('[data-ma-quitar]'), d = document.getElementById('ma-fr').contentDocument;
        if (c) { var cmd = c.getAttribute('data-ma-cmd'), arg = null; if (cmd === 'createLink') { arg = prompt('Dirección del link (https://…)'); if (!arg) return; } d.execCommand(cmd, false, arg); return; }
        if (q) { MA.adj.splice(Number(q.getAttribute('data-ma-quitar')), 1); maAdjPintar(); }
      });
      document.getElementById('ma-file').addEventListener('change', function () {
        Array.prototype.forEach.call(this.files, function (f) {
          var rd = new FileReader(); rd.onload = function () { MA.adj.push({ nombre: f.name, mime: f.type || 'application/octet-stream', base64: String(rd.result).split(',')[1] }); maAdjPintar(); }; rd.readAsDataURL(f);
        }); this.value = '';
      });
    }
    document.getElementById('ma-para').value = o.para || '';
    document.getElementById('ma-cc').value = o.cc || ''; document.getElementById('ma-cco').value = o.cco || '';
    document.getElementById('ma-as').value = o.asunto || '';
    var f = document.getElementById('ma-fr');
    f.onload = function () { try { f.contentDocument.designMode = 'on'; f.style.height = Math.max(320, f.contentDocument.body.scrollHeight + 40) + 'px'; } catch (e) {} };
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;background:#fff;font-family:Montserrat,Arial,sans-serif}</style></head><body>' + (o.html || '<p></p>') + '</body></html>';
    maAdjPintar();
    document.getElementById('ma-ok').onclick = async function () {
      var b = this, para = document.getElementById('ma-para').value.trim(), as = document.getElementById('ma-as').value.trim();
      if (!para || !as) return toast('Falta el destinatario o el asunto', 'err');
      b.disabled = true;
      try {
        var e = await puente('mailAdmin', { para: para, cc: document.getElementById('ma-cc').value.trim(), cco: document.getElementById('ma-cco').value.trim(),
          asunto: as, html: f.contentDocument.body.innerHTML, adjuntos: MA.adj, pdf_id: MA.pdf_id });
        closeM('m-madmin'); toast('Mail enviado desde administracion@ a ' + (e.enviado_a || para) + (e.aviso ? ' · ' + e.aviso : ''), 'ok');
      } catch (er) { toast(er.message, 'err'); }
      b.disabled = false;
    };
    openM('m-madmin');
  };
})();

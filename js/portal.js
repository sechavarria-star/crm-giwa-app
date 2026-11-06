/* ══════════════════════════════════════════════════════════════════════
   portal.js · el portal de soporte de los clientes (soporte/index.html)
   ──────────────────────────────────────────────────────────────────────
   Reemplaza el front de soporte-gs (Index.html del Apps Script). El cliente
   entra con Google o con un link por mail (Supabase Auth) y ve SÓLO lo de su
   empresa: todo pasa por las funciones portal_* de la base, que sacan la
   empresa del mail de la sesión. Nunca le llegan notas internas, montos,
   tarifas ni la clasificación puesta a mano (eso lo garantiza la base).

   «Ver como» (06/11/2026): alguien del equipo abre ?como=EMP-007 y ve el portal
   de esa empresa, sólo para mirar (la base no le deja escribir).

   Pestañas: Mis pedidos (con «Nuevo pedido») y Reportes.
   ══════════════════════════════════════════════════════════════════════ */
var P = { ini: null, tk: [], rep: [], tab: 'pedidos', filtro: 'abiertos', t: null,
          como: new URLSearchParams(location.search).get('como') || '' };
function $(id) { return document.getElementById(id); }
function pv(id) { return String(($(id) || {}).value || '').trim(); }
function pN(x) { return Number(x) || 0; }
function phs(h) { h = pN(h); return h ? String(Math.round(h * 100) / 100).replace('.', ',') + ' h' : '—'; }
function pfh(iso) { if (!iso) return ''; var d = new Date(iso); return ff(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function pOpts(lista, val, vacio) {
  return (vacio != null ? '<option value="">' + esc(vacio) + '</option>' : '') + lista.map(function (x) {
    var k = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x;
    return '<option value="' + esc(k) + '"' + (k === val ? ' selected' : '') + '>' + esc(t) + '</option>';
  }).join('');
}
async function prpc(fn, args) { var r = await db().rpc(fn, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
var P_EST = { 'Nuevo': 'ui-p-pendiente', 'En proceso': 'ui-e-curso', 'Esperando cliente': 'ui-e-detenido', 'Cerrado': 'ui-e-finalizado' };
var P_EST_TXT = { 'Nuevo': 'Recibido', 'En proceso': 'En proceso', 'Esperando cliente': 'Esperando tu respuesta', 'Cerrado': 'Resuelto' };
function pEst(e) { return '<span class="ui-st ' + (P_EST[e] || 'ui-p-neutro') + '">' + esc(P_EST_TXT[e] || e) + '</span>'; }

// ── entrar ─────────────────────────────────────────────────────
function portalGoogle() {
  return sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + location.search, queryParams: { prompt: 'select_account' } } });
}
async function portalLink() {
  var m = pv('acceso-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(m)) return toast('Escribí tu mail', 'err');
  $('acceso-link').disabled = true;
  // shouldCreateUser:false: sólo entra quien ya tiene usuario (lo da de alta GIWA)
  var r = await sb().auth.signInWithOtp({ email: m, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
  $('acceso-link').disabled = false;
  if (r.error) return toast(/signup|not allowed|not found/i.test(r.error.message) ? 'Ese mail no tiene acceso. Pedíselo a GIWA.' : r.error.message, 'err');
  pantalla('Revisá tu mail', 'Te mandamos un link a ' + m + '. Abrilo desde este mismo navegador para entrar.', false);
}
function pantalla(tit, msg, form) {
  $('app').hidden = true; $('acceso').hidden = false;
  set('acceso-tit', tit); set('acceso-msg', msg);
  $('acceso-form').hidden = !form; $('acceso-salir').hidden = form;
}

async function arrancarPortal() {
  var s = (await sb().auth.getSession()).data.session;
  if (!s) return pantalla(CRM_ERROR_LOGIN ? 'No pudiste entrar' : 'Soporte', CRM_ERROR_LOGIN ||
    'Cargá y seguí tus pedidos de soporte. Entrá con el mail que te dimos de alta.', true);
  try { await cargar(); }
  catch (e) {
    var eq = await db().rpc('es_equipo');
    if (eq.data === true && !P.como) return pantalla('Sos del equipo de GIWA', 'Los pedidos se atienden desde el CRM › Soporte. Para ver el portal de un cliente, usá «Ver como» en Accesos al portal.', false);
    return pantalla('Sin acceso', (e.message || String(e)) + ' (' + s.user.email + ')', false);
  }
  $('acceso').hidden = true; $('app').hidden = false;
  if (!P.como) db().rpc('portal_ingreso').then(function () {});   // anota el último ingreso
  var emp = P.ini.empresa || {};
  $('por-emp').innerHTML = (emp.logo ? uiLogo(emp.nombre, emp.logo) : '') + '<span>' + esc(emp.nombre || '') + '</span>';
  set('por-yo', P.ini.yo.nombre || P.ini.yo.mail);
  var abrir = new URLSearchParams(location.search).get('t');   // el botón «Ver en el portal» de los mails
  if (abrir && P.tk.some(function (t) { return t.id === abrir; })) setTimeout(function () { verPedido(abrir); }, 0);
  if (P.como) { $('por-como').hidden = false; $('por-como').innerHTML = uiIco('info') + ' Estás viendo el portal como lo ve <b>' + esc(emp.nombre || P.como) + '</b>. Es sólo para mirar.'; }
  pintar();
}
async function cargar() {
  var c = P.como ? { como: P.como } : {};
  var r = await Promise.all([prpc('portal_inicio', c), prpc('portal_tickets', c), prpc('portal_reportes', c)]);
  P.ini = r[0]; P.tk = r[1] || []; P.rep = r[2] || [];
}

// ── pintar ─────────────────────────────────────────────────────
function pintar() {
  var tabs = '<div class="filtros u-mb12" role="group" aria-label="Secciones">' + [['pedidos', 'Mis pedidos'], ['reportes', 'Reportes']].map(function (t) {
    return '<button class="ptab' + (P.tab === t[0] ? ' on' : '') + '" data-ptab="' + t[0] + '">' + t[1] + (t[0] === 'reportes' && P.rep.length ? ' <span class="m u-c-mt">' + P.rep.length + '</span>' : '') + '</button>'; }).join('') + '</div>';
  $('vista').innerHTML = uiHd(P.tab === 'reportes' ? 'Reportes' : 'Mis pedidos',
      P.tab === 'reportes' ? 'Lo que hicimos en tu mantenimiento, mes a mes.' : 'Tus pedidos de soporte y en qué está cada uno.',
      P.tab === 'pedidos' && !P.como ? uiBtn('Nuevo pedido', 'mas', 'p', 'data-pnuevo="1"') : '') +
    tabs + (P.tab === 'reportes' ? htmlReportes() : htmlPedidos());
}
function htmlPedidos() {
  var ab = P.tk.filter(function (t) { return !t.cerrado; });
  var L = P.filtro === 'abiertos' ? ab : P.tk.filter(function (t) { return t.cerrado; });
  var fil = '<div class="u-row8 u-mb8">' + [['abiertos', 'En curso (' + ab.length + ')'], ['cerrados', 'Resueltos (' + (P.tk.length - ab.length) + ')']].map(function (f) {
    return '<button class="btn ' + (P.filtro === f[0] ? 'bp' : 'bg') + ' sm" data-pfil="' + f[0] + '">' + esc(f[1]) + '</button>'; }).join('') + '</div>';
  if (!L.length) return fil + '<div class="empty">' + (P.filtro === 'abiertos' ? 'No tenés pedidos en curso.' : 'Todavía no hay pedidos resueltos.') + '</div>';
  return fil + '<div class="por-lista">' + L.map(function (t) {
    return '<button type="button" class="por-tk" data-pver="' + esc(t.id) + '"><div class="por-tk-h"><span class="m u-c-mt">' + esc(t.id) + '</span>' + pEst(t.estado) + '</div>' +
      '<div class="u-fw6">' + esc(t.titulo) + '</div><div class="u-s11-mt">' + esc([t.desarrollo, t.tipo, 'actualizado ' + ff(t.actualizado)].filter(Boolean).join(' · ')) +
      (pN(t.comentarios) ? ' · ' + uiIco('chat') + ' ' + t.comentarios : '') + (t.se_factura ? ' · <span class="ui-p-pendiente">se factura aparte</span>' : '') + '</div></button>';
  }).join('') + '</div>';
}
function htmlReportes() {
  if (!P.rep.length) return '<div class="empty">Todavía no hay reportes publicados.</div>';
  return '<div class="por-lista">' + P.rep.map(function (r) {
    return '<button type="button" class="por-tk" data-prep="' + esc(r.id) + '"><div class="por-tk-h"><span class="m u-c-mt">' + esc(r.periodo || '') + '</span><span class="u-s11-mt">' + esc(r.tipo || '') + '</span></div>' +
      '<div class="u-fw6">' + esc(r.titulo || '') + '</div><div class="u-s11-mt">' + esc([r.desarrollo, r.publicado ? 'publicado ' + ff(r.publicado) : ''].filter(Boolean).join(' · ')) + '</div></button>';
  }).join('') + '</div>';
}
function adjP(a) {
  if (a.ruta) return '<button type="button" class="sop-adj" data-padj="' + esc(a.ruta) + '">' + uiIco('clip') + esc(a.nombre) + '</button>';
  return '<span class="sop-adj u-c-mt">' + uiIco('clip') + esc(a.nombre) + ' (pedínoslo si lo necesitás)</span>';
}

// ── un pedido ──────────────────────────────────────────────────
function modal(id, cls) {
  var m = $(id); if (m) return m;
  m = document.createElement('div'); m.className = 'mo'; m.id = id;
  m.innerHTML = '<div class="md ' + (cls || '') + '"><div class="mh"><span class="mt2" id="' + id + '-tit"></span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="' + id + '">' + ico('cerrar') + '</button></div>' +
    '<div class="mb2" id="' + id + '-c"></div><div class="mf" id="' + id + '-pie"></div></div>';
  document.body.appendChild(m); return m;
}
async function verPedido(id) {
  modal('m-pt', 'md-xl'); set('m-pt-tit', id); $('m-pt-c').innerHTML = '<div class="loading"><div class="spin"></div></div>'; $('m-pt-pie').innerHTML = ''; openM('m-pt');
  try { P.t = await prpc('portal_ticket', P.como ? { tid: id, como: P.como } : { tid: id }); } catch (e) { $('m-pt-c').innerHTML = '<div class="empty u-c-rd">' + esc(e.message) + '</div>'; return; }
  var t = P.t.ticket, cerr = t.cerrado, puede = !P.como;
  set('m-pt-tit', t.id + ' · ' + t.titulo);
  var notas = (P.t.notas || []).map(function (n) {
    return '<div class="ft-note"><div class="ft-note-h"><span>' + uiIco('personas') + ' ' + esc(n.autor_nombre || n.autor) + (n.horas ? ' · <span class="m">' + phs(n.horas) + '</span>' : '') + '</span><span class="m">' + esc(pfh(n.fecha)) + '</span></div>' +
      '<div class="ft-note-t">' + esc(n.texto || '') + '</div>' + ((n.adjuntos || []).length ? '<div class="sop-adjs">' + n.adjuntos.map(adjP).join('') + '</div>' : '') + '</div>';
  }).join('') || '<div class="ft-info">Todavía no hay respuestas.</div>';
  var cons = t.consumo ? '<div class="u-s11-mt u-mt6">' + esc(t.consumo.titulo) + ': este mes usaste <span class="m">' + phs(t.consumo.usadas) + '</span> de <span class="m">' + phs(t.consumo.cupo) + '</span> (quedan <span class="m">' + phs(t.consumo.quedan) + '</span>).</div>' : '';
  $('m-pt-c').innerHTML =
    '<div class="ft-meta"><span>' + uiIco('lista') + esc(t.desarrollo || '') + '</span><span>' + esc(t.tipo || '') + '</span><span>' + pEst(t.estado) + '</span><span class="m">' + esc(pfh(t.creado)) + '</span>' +
      (t.relacionado_con ? '<span>Vuelve de ' + esc(t.relacionado_con) + '</span>' : '') + '</div>' +
    (t.clasif_motivo ? uiMotivo(t.clasif_motivo) : '') + (t.se_factura ? uiAviso((t.motivo_factura || 'Este pedido se factura aparte.') + ' Te llega en la factura.', 'adv') : '') + cons +
    '<div class="sec u-mt10">Tu pedido</div><div class="ft-note-t">' + esc(t.descripcion || '—') + '</div>' +
    ((P.t.adjuntos || []).length ? '<div class="sop-adjs">' + P.t.adjuntos.map(adjP).join('') + '</div>' : '') +
    (cerr ? '<div class="sec u-mt10">Cómo se resolvió</div><div class="ft-note sop-final"><div class="ft-note-t">' + esc(t.respuesta_final || '—') + '</div></div>' : '') +
    '<div class="sec u-mt10">Conversación</div>' + notas +
    (puede && !cerr ? '<div class="sec u-mt10">Responder</div><textarea class="fc" id="pt-txt" rows="3" placeholder="Escribinos acá"></textarea>' +
      '<div class="u-row8 u-mt6"><input class="fc u-f1" id="pt-arch" type="file" multiple aria-label="Archivos"><button class="btn bp sm" data-pacc="responder">' + ico('chat') + ' Enviar</button></div>' : '');
  $('m-pt-pie').innerHTML = puede && cerr ? '<span class="u-s11-mt u-f1">¿Volvió a pasar? Abrí un pedido nuevo vinculado a este.</span>' + uiBtn('Volvió a pasar', 'mas', 's', 'data-pacc="volvio"') : '';
}
// archivos: <empresa>/<ticket>/<archivo>; la base valida la carpeta (soporte_puede_subir_archivo) y los registra
async function subirP(input, tid, notaId) {
  var fs = Array.prototype.slice.call((input && input.files) || []), emp = P.ini.empresa.id;
  for (var i = 0; i < fs.length; i++) {
    var f = fs[i];
    if (f.size > 10 * 1024 * 1024) { toast(f.name + ': pasa los 10 MB', 'err'); continue; }
    var ruta = emp + '/' + tid + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
    var up = await sb().storage.from('soporte').upload(ruta, f, { contentType: f.type || undefined });
    if (up.error) { toast(f.name + ': ' + up.error.message, 'err'); continue; }
    await prpc('portal_adjunto', { p: { ticket_id: tid, nota_id: notaId || '', ruta: ruta, nombre: f.name, tipo: f.type, bytes: String(f.size) } });
  }
}
async function abrirArchivo(ruta) {
  var u = await sb().storage.from('soporte').createSignedUrl(ruta, 300);
  if (u.error) return toast(u.error.message, 'err');
  window.open(u.data.signedUrl, '_blank', 'noopener');
}

// ── nuevo pedido ───────────────────────────────────────────────
function nuevoPedido(rel) {
  var I = P.ini, des = I.desarrollos || [];
  modal('m-pn'); set('m-pn-tit', rel ? 'Volvió a pasar · ' + rel.id : 'Nuevo pedido');
  var tipos = (I.listas.tipo || []), ayuda = { 'Algo no funciona': 'Algo dejó de andar o da un error', 'Consulta': 'Una duda sobre cómo usar algo', 'Quiero algo nuevo': 'Una mejora o algo que hoy no hace: lo cotizamos' };
  $('m-pn-c').innerHTML =
    '<div class="fg"><label class="fl" for="pn-des">Sobre qué <span class="req">*</span></label><select class="fc" id="pn-des">' +
      pOpts(des.map(function (d) { return [d.id, d.proyecto && d.proyecto !== d.titulo ? d.proyecto + ' · ' + d.titulo : d.titulo]; }), rel ? rel.desarrollo_id : (des.length === 1 ? des[0].id : ''), 'Elegí la aplicación') + '</select></div>' +
    '<div class="fg"><span class="fl">Qué necesitás</span><div class="por-tipos">' + tipos.map(function (t, i) {
      return '<label class="por-tipo"><input type="radio" name="pn-tipo" value="' + esc(t) + '"' + ((rel ? rel.tipo === t : i === 0) ? ' checked' : '') + '><span><b>' + esc(t) + '</b><br><span class="u-s11-mt">' + esc(ayuda[t] || '') + '</span></span></label>'; }).join('') + '</div></div>' +
    '<div class="g2"><div class="fg"><label class="fl" for="pn-pri">Urgencia</label><select class="fc" id="pn-pri">' + pOpts(I.listas.prioridad || [], 'Media') + '</select></div>' +
      '<div class="fg"><label class="fl" for="pn-mod">Pantalla o módulo</label><input class="fc" id="pn-mod" list="pn-mods" placeholder="Opcional"><datalist id="pn-mods">' + (I.modulos || []).map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist></div></div>' +
    '<div class="fg"><label class="fl" for="pn-tit">Título <span class="req">*</span></label><input class="fc" id="pn-tit" maxlength="200" value="' + esc(rel ? 'Vuelve: ' + rel.titulo : '') + '"></div>' +
    '<div class="fg"><label class="fl" for="pn-desc">Contanos qué pasa</label><textarea class="fc" id="pn-desc" rows="5" placeholder="Qué hiciste, qué esperabas y qué pasó. Si hay un ejemplo (un número, un nombre), mejor.">' + (rel ? esc('Relacionado con ' + rel.id + '.\n') : '') + '</textarea></div>' +
    '<div class="fg"><label class="fl" for="pn-arch">Capturas o archivos</label><input class="fc" id="pn-arch" type="file" multiple><div class="ft-info">Hasta 10 MB cada uno.</div></div>';
  $('m-pn-pie').innerHTML = '<button class="btn bg" data-cerrar="m-pn">Cancelar</button><button class="btn bp" id="pn-ok">Enviar pedido</button>';
  $('pn-ok').onclick = async function () {
    var b = this; b.disabled = true;
    try {
      var tipo = (document.querySelector('input[name=pn-tipo]:checked') || {}).value || '';
      var r = await prpc('portal_crear', { p: { desarrollo_id: pv('pn-des'), tipo: tipo, prioridad: pv('pn-pri'), modulo: pv('pn-mod'), titulo: pv('pn-tit'), descripcion: pv('pn-desc'), relacionado_con: rel ? rel.id : '' } });
      await subirP($('pn-arch'), r.id, '');
      closeM('m-pn'); closeM('m-pt'); toast('Recibimos tu pedido ' + r.id, 'ok');
      await cargar(); P.tab = 'pedidos'; P.filtro = 'abiertos'; pintar(); verPedido(r.id);
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  };
  openM('m-pn');
}

// ── un reporte ─────────────────────────────────────────────────
function verReporte(id) {
  var r = P.rep.find(function (x) { return x.id === id; }); if (!r) return;
  modal('m-pr', 'md-xl'); set('m-pr-tit', r.titulo || r.id); $('m-pr-pie').innerHTML = '';
  var bloque = function (t, x) { return x ? '<div class="sec u-mt10">' + t + '</div><div class="ft-note-t">' + esc(x) + '</div>' : ''; };
  var h = r.horas, horas = '';
  if (h) {
    horas = '<div class="sec u-mt10">Horas del mes</div>' + (h.mantenimientos || []).map(function (m) {
      return '<div class="u-s11-mt">' + esc(m.titulo) + ': <span class="m">' + phs(m.usadas) + '</span> de <span class="m">' + phs(m.cupo) + '</span>' + (pN(m.excedente) ? ' · <span class="ui-p-pendiente">' + phs(m.excedente) + ' exceden y se facturan aparte</span>' : '') + '</div>'; }).join('') +
      ((h.detalle || []).length ? '<ul class="sop-det">' + h.detalle.map(function (d) { return '<li><span class="m">' + esc(d.id) + '</span> ' + esc(d.titulo) + ' · <span class="m">' + phs(d.horas) + '</span> · ' + esc(d.tipo) + '</li>'; }).join('') + '</ul>' : '');
  }
  $('m-pr-c').innerHTML = '<div class="ft-meta"><span class="m">' + esc(r.periodo || '') + '</span><span>' + esc(r.tipo || '') + '</span>' + (r.desarrollo ? '<span>' + esc(r.desarrollo) + '</span>' : '') + '</div>' +
    bloque('Resumen', r.resumen) + bloque('Qué hicimos', r.hicimos) + bloque('Qué queda pendiente', r.pendiente) + bloque('Qué revisamos', r.revisamos) + horas +
    ((r.tickets || []).length ? '<div class="sec u-mt10">Pedidos incluidos</div><ul class="sop-det">' + r.tickets.map(function (t) { return '<li><span class="m">' + esc(t.id) + '</span> ' + esc(t.titulo) + '</li>'; }).join('') + '</ul>' : '') +
    ((r.adjuntos || []).length ? '<div class="sec u-mt10">Documentación</div><div class="sop-adjs">' + r.adjuntos.map(adjP).join('') + '</div>' : '');
  openM('m-pr');
}

// ── clics ──────────────────────────────────────────────────────
document.addEventListener('click', async function (ev) {
  var b = ev.target.closest('[data-ptab],[data-pfil],[data-pver],[data-prep],[data-pnuevo],[data-padj],[data-pacc]'); if (!b || b.disabled) return;
  if (b.hasAttribute('data-ptab')) { P.tab = b.getAttribute('data-ptab'); return pintar(); }
  if (b.hasAttribute('data-pfil')) { P.filtro = b.getAttribute('data-pfil'); return pintar(); }
  if (b.hasAttribute('data-pver')) return verPedido(b.getAttribute('data-pver'));
  if (b.hasAttribute('data-prep')) return verReporte(b.getAttribute('data-prep'));
  if (b.hasAttribute('data-pnuevo')) return nuevoPedido(null);
  if (b.hasAttribute('data-padj')) return abrirArchivo(b.getAttribute('data-padj'));
  var a = b.getAttribute('data-pacc'), t = P.t && P.t.ticket;
  if (a === 'volvio') return nuevoPedido(t);
  if (a === 'responder') {
    b.disabled = true;
    try {
      var arch = $('pt-arch'), hay = arch && arch.files.length > 0;
      var r = await prpc('portal_responder', { p: { ticket_id: t.id, texto: pv('pt-txt'), con_adjuntos: hay } });
      if (hay) await subirP(arch, t.id, r.id);
      toast('Mensaje enviado', 'ok'); await cargar(); pintar(); verPedido(t.id);
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  }
});
document.addEventListener('DOMContentLoaded', arrancarPortal);

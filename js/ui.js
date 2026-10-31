/* ══════════════════════════════════════════════════════════════════════
   ui.js · arma el HTML de los componentes C1–C16 (GIWA_identidad_visual.md)
   ──────────────────────────────────────────────────────────────────────
   Las vistas llaman a estas funciones en vez de escribir HTML con clases o
   colores propios. El aspecto vive en css/componentes.css + css/tokens.css.
   Depende de esc() (util.js) e ico() (iconos.js).
   ══════════════════════════════════════════════════════════════════════ */

function uiIco(n) { return ico(n, 'ui-ico'); }

// Importe sin decimales, con «.» de miles; USD con su prefijo (30/10/2026)
function uiMonto(n, usd) {
  var v = Number(n) || 0;
  return (usd ? 'USD ' : '$ ') + Math.round(v).toLocaleString('es-AR');
}

// ── C6 · Estado ──
var _UI_EST = {
  prospecto:   ['Prospecto', 'e_rombo'],
  negociacion: ['En negociación', 'e_flechas'],
  aprobado:    ['Aprobado', 'e_check'],
  curso:       ['En curso', 'e_play'],
  garantia:    ['En garantía', 'e_trebol'],
  finalizado:  ['Finalizado', 'e_cuadrado'],
  rechazado:   ['Rechazado', 'e_cruz'],
  detenido:    ['Detenido', 'e_pausa']
};
// Texto del estado (de proyecto o de desarrollo) → clave de color. Detenido es una marca aparte y manda.
function uiClaveEst(texto, detenido) {
  if (detenido) return 'detenido';
  var x = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/rechaz|cancel|perdid/.test(x)) return 'rechazado';
  if (/finaliz/.test(x)) return 'finalizado';
  if (/garant/.test(x)) return 'garantia';
  if (/curso|ejecu|activo|desarroll|implementac/.test(x)) return 'curso';
  if (/aprob|vendid|ganad/.test(x)) return 'aprobado';
  if (/negoc|revis/.test(x)) return 'negociacion';
  return 'prospecto';
}
// uiEstado('En curso') · uiEstado('Aprobado', { detenido: true }) · uiEstado(x, { nombre: 'Activo' })
function uiEstado(texto, op) {
  op = op || {};
  var k = uiClaveEst(texto, op.detenido), d = _UI_EST[k];
  var nombre = op.nombre || (op.detenido ? d[0] : (texto || d[0]));   // nombre: p. ej. «Pausado» en un desarrollo
  return '<span class="ui-st ui-e-' + k + '">' + uiIco(d[1]) + esc(nombre) + '</span>';
}

// ── C12 · Ícono de tipo de desarrollo, en el color de su estado ──
function uiTipo(it, estado, detenido) {
  return '<span class="ui-tipo ui-e-' + uiClaveEst(estado, detenido) + '">' + icoTipoDes(it).replace('class="ico ico-tipo"', 'class="ui-ico"') + '</span>';
}

// ── C13 · Logo ──
function uiLogo(nombre, url) {
  var ini = esc(String(nombre || '?').trim().charAt(0).toUpperCase());
  if (url) return '<span class="ui-logo ui-img"><img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" ' +
    'onerror="this.parentNode.classList.remove(\'ui-img\');this.parentNode.textContent=\'' + ini + '\'"></span>';
  return '<span class="ui-logo">' + ini + '</span>';
}

// ── C10 · Botón (tipo 'p' principal azul · 's' secundario violeta) ──
// attrs: texto HTML de atributos extra, ya escapado por quien llama (onclick, data-…)
function uiBtn(txt, icono, tipo, attrs) {
  return '<button type="button" class="ui-btn ui-' + (tipo || 'p') + '" ' + (attrs || '') + '>' + uiIco(icono) + esc(txt) + '</button>';
}

// ── C11 · Ícono de acción con tooltip ──
// clase: fin (verde) · det (amarillo) · edi (azul) · bor (rojo) · vio (violeta) · '' (celeste)
function uiIb(icono, titulo, clase, attrs) {
  return '<button type="button" class="ui-ib' + (clase ? ' ui-' + clase : '') + '" title="' + esc(titulo) + '" aria-label="' + esc(titulo) + '" ' + (attrs || '') + '>' + uiIco(icono) + '</button>';
}
var UI_ACC = {     // un ícono = un significado
  finalizar: ['check', 'Finalizar', 'fin'],
  detener:   ['pausa', 'Detener', 'det'],
  editar:    ['editar', 'Editar', 'edi'],
  borrar:    ['borrar', 'Borrar', 'bor'],
  comentar:  ['chat', 'Comentar', 'vio'],
  tarea:     ['tarea', 'Agregar tarea', 'vio'],
  revisado:  ['revisado', 'Ya lo revisé', ''],
  agendar:   ['calendario', 'Agendar', ''],
  manana:    ['manana', 'Pasar a mañana', ''],
  hoy:       ['reloj', 'Agenda de hoy', '']
};
function uiAcc(accion, attrs) { var a = UI_ACC[accion]; return uiIb(a[0], a[1], a[2], attrs); }

// ── C2 · Encabezado de vista (acciones: HTML de hasta dos botones) ──
function uiHd(titulo, nota, acciones) {
  return '<div class="ui-hd"><div><h1>' + esc(titulo) + '</h1>' + (nota ? '<div class="ui-nota">' + esc(nota) + '</div>' : '') + '</div>' +
         (acciones ? '<div class="ui-acc">' + acciones + '</div>' : '') + '</div>';
}

// ── C3 · Desplegable · o: { ic | logo (HTML), t | th (HTML), n, v (HTML), open, n2, attrs } ──
function uiDesp(o, cuerpo) {
  return '<div class="ui-d' + (o.open ? ' open' : '') + (o.n2 ? ' ui-n2' : '') + '" ' + (o.attrs || '') + '>' +
           '<span class="ui-ch">' + uiIco('derecha') + '</span>' +
           (o.logo || (o.ic ? '<span class="ui-d-ic">' + uiIco(o.ic) + '</span>' : '<span></span>')) +
           '<span class="ui-d-t">' + (o.th || esc(o.t)) + '</span>' +
           '<span class="ui-d-n">' + (o.n != null && o.n !== '' ? esc(String(o.n)) : '') + '</span><span></span>' +
           '<span class="ui-d-v">' + (o.v || '') + '</span>' +
         '</div><div class="ui-cuerpo">' + (cuerpo || '') + '</div>';
}

// ── C4 · Fila de proyecto + C5 debajo · o: { logo, logoUrl, emp, pro, tot (HTML), est (HTML), open, attrs } ──
function uiFilaProy(o, ficha) {
  return '<div class="ui-fp' + (o.open ? ' open' : '') + '" ' + (o.attrs || '') + '>' +
           '<span class="ui-ch">' + uiIco('derecha') + '</span>' + uiLogo(o.emp, o.logoUrl) +
           '<div><div class="ui-emp">' + esc(o.emp) + '</div><div class="ui-pro">' + esc(o.pro) + '</div></div>' +
           '<span class="ui-tot">' + (o.tot || '') + '</span><span>' + (o.est || '') + '</span>' +
         '</div><div class="ui-ficha">' + (ficha || '') + '</div>';
}

// ── C5 · Desarrollo dentro de la ficha: C12 + nombre + C6, sin montos; los datos van al abrir ──
function uiDev(o, cuerpo) {
  return '<div class="ui-dev' + (o.open ? ' open' : '') + '" ' + (o.attrs || '') + '>' +
           '<span class="ui-ch">' + uiIco('derecha') + '</span>' + uiTipo(o.it, o.estado, o.detenido) +
           '<span class="ui-dev-n">' + esc(o.nombre) + '</span>' + uiEstado(o.estado, { detenido: o.detenido }) +
         '</div><div class="ui-devc">' + (cuerpo || '') + '</div>';
}

// ── C5 · Pestañas · tabs: [[clave, etiqueta, attrs]] ──
function uiTabs(tabs, activa, attrs) {
  return '<div class="ui-tabs" ' + (attrs || '') + '>' + tabs.map(function (t) {
    return '<button type="button" class="ui-tab' + (t[0] === activa ? ' on' : '') + '" data-tab="' + esc(t[0]) + '" ' + (t[2] || '') + '>' + esc(t[1]) + '</button>';
  }).join('') + '</div>';
}

// ── C7 · Riel de estados · etapas y aparte: [{ k, t, n, on, c, attrs }]
//    k = clave de estado (da el color); c = otra clase de color (p. ej. 'p-abono') ──
function uiRiel(etapas, aparte, attrs) {
  var seg = function (s) {
    return '<button type="button" class="ui-seg ui-' + (s.c || 'e-' + s.k) + (s.on ? ' on' : '') + '" data-k="' + esc(s.k) + '" ' + (s.attrs || '') + '>' +
           '<div class="ui-seg-b"></div><div class="ui-seg-l">' + esc(s.t) + ' <span class="ui-num">' + (Number(s.n) || 0) + '</span></div></button>';
  };
  return '<div class="ui-riel" ' + (attrs || '') + '>' + etapas.map(seg).join('') +
         ((aparte && aparte.length) ? '<span class="ui-riel-sep"></span>' + aparte.map(seg).join('') : '') + '</div>';
}

// ── C8 · Tarjeta de métrica (color: clave de plata o de estado, p. ej. 'p-cobrado') ──
// usd: el monto en dólares de referencia, en celeste claro, debajo del número
function uiKpi(k, v, color, sub, usd) {
  return '<div class="ui-kpi' + (color ? ' ui-k-' + color : '') + '"><div class="ui-kpi-k">' + esc(k) + '</div>' +
         '<div class="ui-kpi-v">' + esc(v) + '</div>' + (usd ? '<div class="ui-kpi-s"><span class="ui-num ui-p-usd">' + esc(usd) + '</span></div>' : '') +
         (sub ? '<div class="ui-kpi-s">' + esc(sub) + '</div>' : '') + '</div>';
}

// ── C15 · Aviso (tipo 'info' celeste · 'adv' ámbar) y motivo en gris ──
function uiAviso(txt, tipo) {
  return '<div class="ui-aviso ui-' + (tipo || 'info') + '">' + uiIco(tipo === 'adv' ? 'alerta' : 'info') + '<span>' + esc(txt) + '</span></div>';
}
function uiMotivo(txt) { return '<div class="ui-motivo">' + esc(txt) + '</div>'; }

// ── C16 · Contactos · [{ nombre, puesto, tel, mail }] · cada ícono sólo si el dato existe ──
function uiContactos(cs) {
  return '<ul class="ui-ctcs">' + (cs || []).map(function (c) {
    var tel = String(c.tel || '').replace(/\D/g, '');
    return '<li class="ui-ctc"><div class="ui-ctc-l"><span>' + esc(c.nombre) + (c.puesto ? ' <span class="ui-ps">· ' + esc(c.puesto) + '</span>' : '') + '</span>' +
           '<span class="ui-ics">' +
             (tel ? '<a class="ui-ib ui-wa" href="https://wa.me/' + tel + '" target="_blank" rel="noopener" title="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
             (c.mail ? '<a class="ui-ib ui-azul" href="mailto:' + esc(c.mail) + '" title="Mail">' + uiIco('mail') + '</a>' : '') +
           '</span></div></li>';
  }).join('') + '</ul>';
}

// ── Tier (escala de azul GIWA; T1 el más intenso hasta que se resuelva la decisión pendiente 2) ──
function uiTier(t) {
  var n = parseInt(String(t || '').replace(/\D/g, ''), 10);
  return n ? '<span class="ui-tier ui-tier-' + Math.min(5, Math.max(1, n)) + '">T' + n + '</span>' : '';
}

// ── Abrir y cerrar C3 / C4 / desarrollos; pestañas y riel (selección múltiple) ──
document.addEventListener('click', function (ev) {
  var t = ev.target;
  if (!t.closest) return;
  var fila = t.closest('.ui-d, .ui-fp, .ui-dev');
  if (fila && !t.closest('button, a, input, select, textarea')) {
    fila.classList.toggle('open');
    fila.dispatchEvent(new CustomEvent('ui-toggle', { bubbles: true, detail: { open: fila.classList.contains('open') } }));
    return;
  }
  var tab = t.closest('.ui-tab');
  if (tab) { tab.parentNode.querySelectorAll('.ui-tab').forEach(function (b) { b.classList.toggle('on', b === tab); }); return; }
  var seg = t.closest('.ui-seg');
  if (seg) seg.classList.toggle('on');
});

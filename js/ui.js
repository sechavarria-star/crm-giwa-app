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

// ── C6 · Estado: nombre, ícono y qué significa (va en el hover) ──
var _UI_EST = {
  prospecto:   ['Prospecto', 'e_rombo', 'Todavía no se envió la propuesta'],
  negociacion: ['En negociación', 'e_flechas', 'Propuesta enviada: esperando la respuesta del cliente'],
  aprobado:    ['Aprobado', 'e_check', 'El cliente lo aprobó; todavía no arrancó y no se factura'],
  curso:       ['En curso', 'e_play', 'En ejecución: se factura'],
  garantia:    ['En garantía', 'e_trebol', 'Entregado: en período de garantía'],
  finalizado:  ['Finalizado', 'e_cuadrado', 'Terminado y cerrado'],
  rechazado:   ['Rechazado', 'e_cruz', 'El cliente no lo aceptó'],
  detenido:    ['Detenido', 'e_pausa', 'Frenado: hay que revisar qué pasa']
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
  return '<span class="ui-st ui-e-' + k + '" data-tip="' + esc(d[2]) + '">' + uiIco(d[1]) + esc(nombre) + '</span>';
}

// Detenido (proyecto) o Pausado (desarrollo): una marca chica al lado del estado, no lo reemplaza (02/11/2026)
function uiMarcaDet(tit) { return '<span class="ui-marca ui-e-detenido" data-tip="' + esc(tit || 'Detenido') + '" aria-label="' + esc(tit || 'Detenido') + '">' + uiIco('e_pausa') + '</span>'; }

// ── C12 · Ícono de tipo de desarrollo, en el color de su estado ──
function uiTipo(it, estado, detenido) {
  var tip = (it && (it.tipo_nombre || it.tipo)) || '';
  return '<span class="ui-tipo ui-e-' + uiClaveEst(estado, detenido) + '"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + '>' + icoTipoDes(it).replace('class="ico ico-tipo"', 'class="ui-ico"') + '</span>';
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
  return '<button type="button" class="ui-ib' + (clase ? ' ui-' + clase : '') + '" data-tip="' + esc(titulo) + '" aria-label="' + esc(titulo) + '" ' + (attrs || '') + '>' + uiIco(icono) + '</button>';
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

// ── C4 · Fila de proyecto + C5 debajo · o: { logoUrl, emp, pro, est (HTML), open, attrs }
//    El proyecto arriba y la empresa debajo; a la derecha sólo el estado (02/11/2026) ──
function uiFilaProy(o, ficha) {
  return '<div class="ui-fp' + (o.open ? ' open' : '') + '" ' + (o.attrs || '') + '>' +
           '<span class="ui-ch">' + uiIco('derecha') + '</span>' + uiLogo(o.emp, o.logoUrl) +
           '<div><div class="ui-pro">' + esc(o.pro) + '</div><div class="ui-emp">' + esc(o.emp) + '</div></div>' +
           '<span class="ui-fp-est">' + (o.est || '') + '</span>' +
         '</div><div class="ui-ficha">' + (ficha || '') + '</div>';
}

// ── C5 · Desarrollo dentro de la ficha: C12 + nombre + C6, sin montos; los datos van al abrir ──
function uiDev(o, cuerpo) {
  return '<div class="ui-dev' + (o.open ? ' open' : '') + '" ' + (o.attrs || '') + '>' +
           '<span class="ui-dev-barra ui-e-' + uiClaveEst(o.estado) + '"></span><span class="ui-ch">' + uiIco('derecha') + '</span>' + uiTipo(o.it, o.estado, o.detenido) +
           '<span class="ui-dev-n">' + esc(o.nombre) + '</span><div class="ui-dev-der"><span>' + uiEstado(o.estado) + (o.detenido ? uiMarcaDet('Pausado') : '') + '</span></div>' +
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
    var tip = s.tip || (_UI_EST[s.k] || [])[2];
    return '<button type="button" class="ui-seg ui-' + (s.c || 'e-' + s.k) + (s.on ? ' on' : '') + '" data-k="' + esc(s.k) + '"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + ' ' + (s.attrs || '') + '>' +
           '<div class="ui-seg-b"></div><div class="ui-seg-l">' + esc(s.t) + ' <span class="ui-num">' + (Number(s.n) || 0) + '</span></div></button>';
  };
  return '<div class="ui-riel" ' + (attrs || '') + '>' + etapas.map(seg).join('') +
         ((aparte && aparte.length) ? '<span class="ui-riel-sep"></span>' + aparte.map(seg).join('') : '') + '</div>';
}

// ── C8 · Tarjeta de métrica (color: clave de plata o de estado, p. ej. 'p-cobrado') ──
// usd: el monto en dólares de referencia, en celeste claro, debajo del número
// tip: qué mide la métrica (hover), en vez de un texto fijo dentro del recuadro
function uiKpi(k, v, color, sub, usd, tip) {
  return '<div class="ui-kpi' + (color ? ' ui-k-' + color : '') + '"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + '><div class="ui-kpi-k">' + esc(k) + '</div>' +
         '<div class="ui-kpi-v">' + esc(v) + '</div>' + (usd ? '<div class="ui-kpi-s"><span class="ui-num ui-p-usd">' + esc(usd) + '</span></div>' : '') +
         (sub ? '<div class="ui-kpi-s">' + esc(sub) + '</div>' : '') + '</div>';
}

// C8 con dos importes (p. ej. Proyectado: Desarrollos y Mantenimiento) · filas: [[etiqueta, valor, color]]
function uiKpiDoble(k, filas, sub, tip) {
  return '<div class="ui-kpi"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + '><div class="ui-kpi-k">' + esc(k) + '</div>' + filas.map(function (f) {
    return '<div class="ui-kpi-par"><span>' + esc(f[0]) + '</span><span class="ui-num ui-' + f[2] + '">' + esc(f[1]) + '</span></div>'; }).join('') +
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
    var tel = telWa(c.tel);
    return '<li class="ui-ctc"><div class="ui-ctc-l"><span>' + esc(c.nombre) + (c.puesto ? ' <span class="ui-ps">· ' + esc(c.puesto) + '</span>' : '') + '</span>' +
           '<span class="ui-ics">' +
             (tel ? '<a class="ui-ib ui-wa" href="https://wa.me/' + tel + '" target="_blank" rel="noopener" data-tip="WhatsApp">' + uiIco('whatsapp') + '</a>' : '') +
             (c.mail ? '<a class="ui-ib ui-azul" href="mailto:' + esc(c.mail) + '" data-tip="Mail">' + uiIco('mail') + '</a>' : '') +
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

// ── Hover informativo: un solo globo para todo lo que tenga data-tip (02/11/2026) ──
// Flota sobre la página (no lo corta ningún contenedor) y es igual en todas las vistas.
var _uiTip = null;
function _uiTipVer(ev) {
  var el = ev.target.closest && ev.target.closest('[data-tip]');
  if (!el) return;
  if (!_uiTip) { _uiTip = document.createElement('div'); _uiTip.className = 'ui-tip'; document.body.appendChild(_uiTip); }
  _uiTip.textContent = el.getAttribute('data-tip'); _uiTip.hidden = false;
  var r = el.getBoundingClientRect(), w = _uiTip.offsetWidth, h = _uiTip.offsetHeight;
  var x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = r.top - h - 6;
  _uiTip.style.left = x + 'px'; _uiTip.style.top = y + 'px';
}
function _uiTipOcultar(ev) {
  if (!_uiTip) return;
  var el = ev.target.closest && ev.target.closest('[data-tip]');
  if (ev.type === 'click' || !el || !el.contains(ev.relatedTarget)) _uiTip.hidden = true;
}
document.addEventListener('mouseover', _uiTipVer);
document.addEventListener('focusin', _uiTipVer);
document.addEventListener('mouseout', _uiTipOcultar);
document.addEventListener('focusout', _uiTipOcultar);
document.addEventListener('click', _uiTipOcultar, true);

// ══ Campos de carga (30/10/2026 · 02/11/2026) ══════════════════════════════
// Se aplican solos a todo lo que se dibuja, sin tocar cada pantalla:
//  · <input type="date">   → se escribe dd/mm/aaaa (con el calendario al lado). .value sigue
//                            leyendo y recibiendo 'yyyy-mm-dd', así no cambia nada al guardar.
//  · <input data-monto>     → «.» de miles mientras se tipea, sin decimales, a la derecha.
//                            .value devuelve sólo los dígitos.
//  · <select> ARS / USD     → recuadro ARS | USD, cada moneda con su color; el select sigue
//                            debajo (oculto) y es el que leen las pantallas.
var _UI_VAL = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function _uiIsoADmy(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function _uiDmyAIso(t) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t || '').trim()); if (!m) return '';
  var d = +m[1], mo = +m[2], y = +m[3], x = new Date(y, mo - 1, d);
  if (x.getFullYear() !== y || x.getMonth() !== mo - 1 || x.getDate() !== d) return '';
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function _uiMiles(dig) { return dig ? Number(dig).toLocaleString('es-AR') : ''; }

function _uiFecha(inp) {
  if (inp._ui) return; inp._ui = 1;
  var iso = _UI_VAL.get.call(inp), min = inp.min;
  inp.type = 'text'; inp.setAttribute('inputmode', 'numeric'); inp.placeholder = 'dd/mm/aaaa'; inp.maxLength = 10;
  inp.removeAttribute('min'); inp.classList.add('ui-num');
  Object.defineProperty(inp, 'value', { configurable: true,
    get: function () { return _uiDmyAIso(_UI_VAL.get.call(this)); },
    set: function (v) { _UI_VAL.set.call(this, /^\d{4}-/.test(String(v || '')) ? _uiIsoADmy(v) : String(v || '')); } });
  inp.value = iso;
  inp.addEventListener('input', function (ev) {
    if (ev.inputType && ev.inputType.indexOf('delete') === 0) return;
    var d = _UI_VAL.get.call(inp).replace(/\D/g, '').slice(0, 8);
    _UI_VAL.set.call(inp, d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2, 4) : '') + (d.length > 4 ? '/' + d.slice(4) : ''));
    inp.classList.remove('ui-invalido');
  });
  // Una fecha a medio escribir no se guarda: se avisa y no sigue el «change»
  inp.addEventListener('change', function (ev) {
    if (_UI_VAL.get.call(inp).trim() && !inp.value) {
      ev.stopImmediatePropagation(); inp.classList.add('ui-invalido');
      if (typeof toast === 'function') toast('Fecha inválida: usá dd/mm/aaaa', 'err');
    }
  });
  var nat = document.createElement('input'); nat.type = 'date'; nat.className = 'ui-fecha-nat'; nat.tabIndex = -1; nat.setAttribute('aria-hidden', 'true'); if (min) nat.min = min;
  var b = document.createElement('button'); b.type = 'button'; b.className = 'ui-ib'; b.title = 'Elegir en el calendario'; b.setAttribute('aria-label', 'Elegir en el calendario'); b.innerHTML = uiIco('calendario');
  var w = document.createElement('span'); w.className = 'ui-fecha';
  inp.parentNode.insertBefore(w, inp); w.appendChild(inp); w.appendChild(nat); w.appendChild(b);
  b.onclick = function () { _UI_VAL.set.call(nat, inp.value || ''); try { nat.showPicker(); } catch (e) { nat.focus(); } };
  nat.onchange = function () {
    inp.value = _UI_VAL.get.call(nat); inp.classList.remove('ui-invalido');
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
}
function _uiMonto(inp) {
  if (inp._ui) return; inp._ui = 1;
  var v0 = _UI_VAL.get.call(inp);
  inp.type = 'text'; inp.setAttribute('inputmode', 'numeric'); inp.removeAttribute('step'); inp.classList.add('ui-monto');
  Object.defineProperty(inp, 'value', { configurable: true,
    get: function () { return _UI_VAL.get.call(this).replace(/\D/g, ''); },
    set: function (v) { var n = String(v == null ? '' : v).trim(); _UI_VAL.set.call(this, n === '' ? '' : _uiMiles(String(Math.round(Number(n.replace(/\./g, '').replace(',', '.')) || 0)))); } });
  inp.value = v0;
  inp.addEventListener('input', function () { _UI_VAL.set.call(inp, _uiMiles(_UI_VAL.get.call(inp).replace(/\D/g, ''))); });
}
function _uiMoneda(sel) {
  if (sel._ui) return; sel._ui = 1;
  var w = document.createElement('span'); w.className = 'ui-mon'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Moneda');
  var pinta = function () { w.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === sel.value); }); };
  ['ARS', 'USD'].forEach(function (m) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ui-mon-b ui-mon-' + m.toLowerCase(); b.textContent = m; b.setAttribute('data-m', m);
    b.onclick = function () { if (sel.value === m) return; sel.value = m; pinta(); sel.dispatchEvent(new Event('change', { bubbles: true })); };
    w.appendChild(b);
  });
  sel.classList.add('ui-mon-sel'); sel.parentNode.insertBefore(w, sel.nextSibling);
  sel.addEventListener('change', pinta);
  var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');   // si una pantalla cambia el valor por código
  Object.defineProperty(sel, 'value', { configurable: true, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); pinta(); } });
  pinta();
}
function _uiCampos(raiz) {
  if (!raiz.querySelectorAll) return;
  raiz.querySelectorAll('input[type="date"]:not(.ui-fecha-nat)').forEach(_uiFecha);
  raiz.querySelectorAll('input[data-monto]').forEach(_uiMonto);
  raiz.querySelectorAll('select').forEach(function (s) {
    var o = Array.prototype.map.call(s.options, function (x) { return x.value; }).join('|');
    if (o === 'ARS|USD') _uiMoneda(s);
  });
}
new MutationObserver(function (ms) {
  ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) _uiCampos(n.parentNode || n); }); });
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', function () { _uiCampos(document); });

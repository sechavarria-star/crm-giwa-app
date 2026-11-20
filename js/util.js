/* ══════════════════════════════════════════════════════════════════════
   util.js · ayudas que usan todas las vistas
   ──────────────────────────────────────────────────────────────────────
   En el CRM viejo cada pantalla tenía su propia copia de esc(), y no eran
   iguales (unas escapaban comillas simples y otras no). Acá hay UNA.
   ══════════════════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── Modales (.mo .md) · uno encima de otro lleva .n2 · clic afuera cierra ──
function openM(id) {
  var el = document.getElementById(id); if (!el) return;
  el.classList.toggle('n2', !!document.querySelector('.mo.open'));
  el.classList.add('open');
  delete el.dataset.sucio;                         // recién abierto: sin cambios
}
// El armador único de modales (19/11/2026): título con ✕, cuerpo y pie. Arma, no abre: cada pantalla llama openM.
// cls: 'md-sm' por defecto · '' el ancho normal · 'md-xl' el ancho grande
function armarModal(id, tit, cuerpo, pie, cls) {
  var m = document.getElementById(id); if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = id; document.body.appendChild(m); }
  m.innerHTML = '<div class="md ' + (cls == null ? 'md-sm' : cls) + '"><div class="mh"><span class="mt2">' + esc(tit) + '</span>' +
    '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="' + id + '">' + ico('cerrar') + '</button></div>' +
    '<div class="mb2">' + cuerpo + '</div><div class="mf">' + pie + '</div></div>';
  m.onclick = m.onchange = m.oninput = null;
  return m;
}
// Elegir uno o varios (19/11/2026): se abre encima, con buscador que filtra la lista; resuelve con los valores tildados.
// items: [{ v, t, sub }] · op: { ya: [valores que ya están], ok: 'Agregar', nuevo: { txt, fn } }
function elegirVarios(tit, items, op) {
  op = op || {};
  var ya = op.ya || [], L = items.filter(function (x) { return ya.indexOf(x.v) < 0; });
  var m = armarModal('m-elegir', tit,
    '<input class="fc u-mb10" id="eg-bus" placeholder="Buscar" aria-label="Buscar">' +
    (L.length ? L.map(function (x) { return '<label class="ui-li" data-txt="' + esc(String(x.t + ' ' + (x.sub || '')).toLowerCase()) + '"><input type="checkbox" value="' + esc(x.v) + '">' +
      '<span class="ui-f1">' + esc(x.t) + (x.sub ? ' <span class="ui-li-sub">· ' + esc(x.sub) + '</span>' : '') + '</span></label>'; }).join('') : '<div class="ui-nota-t">No hay más para agregar.</div>') +
    (op.nuevo ? '<div class="ui-nota-t u-mt10">' + (ya.length ? 'No aparecen los que ya están en la lista. ' : '') + '¿No está el que buscás?</div>' +
      '<button type="button" class="ui-lnk ui-azul u-mt6" data-eg="nuevo">+ ' + esc(op.nuevo.txt) + '</button>' : ''),
    '<button class="btn bg" data-cerrar="m-elegir">Cancelar</button><button class="btn bp" data-eg="ok">' + esc(op.ok || 'Agregar') + '</button>');
  m.oninput = function (ev) {
    if (ev.target.id !== 'eg-bus') return; var t = ev.target.value.trim().toLowerCase();
    m.querySelectorAll('[data-txt]').forEach(function (x) { x.hidden = !!t && x.getAttribute('data-txt').indexOf(t) < 0; });
  };
  openM('m-elegir');
  return new Promise(function (res) {
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-eg]'); if (!b) return;
      if (b.getAttribute('data-eg') === 'nuevo') { closeM('m-elegir'); return op.nuevo.fn(); }
      var v = Array.prototype.map.call(m.querySelectorAll('input[type=checkbox]:checked'), function (x) { return x.value; });
      closeM('m-elegir'); res(v);
    };
  });
}
function closeM(id) { var el = document.getElementById(id); if (el) { el.classList.remove('open', 'n2'); delete el.dataset.sucio; } }
// Lo que se tipea en un modal lo marca «con cambios» (29/10/2026)
['input', 'change'].forEach(function (t) {
  document.addEventListener(t, function (ev) { var m = ev.target.closest && ev.target.closest('.mo.open'); if (m && ev.isTrusted) m.dataset.sucio = '1'; }, true);
});
// Cerrar a mano (Cancelar, ×, clic afuera): si hay cambios sin guardar, avisa antes de perderlos.
// Después de guardar cada pantalla llama closeM directo, sin aviso.
async function cerrarAMano(id) {
  var el = document.getElementById(id); if (!el) return;
  if (el.dataset.sucio && typeof ask === 'function' &&
      !(await ask('Hay cambios sin guardar. Si cerrás, se pierden.', '¿Cerrar sin guardar?', { ok: 'Cerrar sin guardar' }))) return;
  closeM(id);
}
// Cualquier botón con data-cerrar="<id del modal>" lo cierra
document.addEventListener('click', function (ev) {
  var c = ev.target.closest && ev.target.closest('[data-cerrar]');
  if (c) cerrarAMano(c.getAttribute('data-cerrar'));
});
document.addEventListener('mousedown', function (ev) {
  if (ev.target.classList && ev.target.classList.contains('mo') && ev.target.classList.contains('open')) cerrarAMano(ev.target.id);
});

// ── Avisos cortos abajo a la derecha (los .toast del Design System) ──
function toast(msg, tipo) {
  var c = document.getElementById('toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.className = 'toasts'; document.body.appendChild(c); }
  var t = document.createElement('div');
  t.className = 'toast ' + ({ ok: 'tok', err: 'terr' }[tipo] || 'tinf');
  t.textContent = msg; c.appendChild(t);
  setTimeout(function () { t.remove(); }, 4000);
}

// ── Fechas · _pd (y mDias, mHoy…) viene de js/calculos.js, generado de _Calculos ──
// 'yyyy-MM-dd' de hoy + n días (local)
function isoMas(n) {
  var d = new Date(); d.setDate(d.getDate() + (n || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Teléfono → número para wa.me (Argentina por defecto): sólo dígitos, con 54 y el 9 de celular,
// sin el 0 del área ni el 15 de Buenos Aires. Si ya trae otro código de país, queda como está (02/11/2026).
// La misma regla está en la base: crm_giwa.normalizar_telefono().
function telWa(t) {
  var s = String(t || '').trim(), d = s.replace(/\D/g, ''), orig = d;
  if (!d) return '';
  if (s.charAt(0) === '+' && d.indexOf('54') !== 0) return d;            // otro país, tal cual
  if (d.indexOf('00') === 0) { d = d.slice(2); if (d.indexOf('54') !== 0) return d; }
  if (d.indexOf('54') === 0) d = d.slice(2);
  d = d.replace(/^9/, '').replace(/^0/, '');
  if (d.length === 12) for (var a = 2; a <= 4; a++) if (d.substr(a, 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break; }   // área + 15
  if (d.length === 10 && d.indexOf('15') === 0) d = '11' + d.slice(2);  // 15 sin área: Buenos Aires
  return d.length === 10 ? '549' + d : orig;                              // si no se entiende, el número como vino
}

// Tier de la empresa: etiqueta con relleno, escala de azul GIWA que se intensifica con
// el multiplicador (T1 = el más intenso). La misma en Clientes y la ficha (29/10/2026).
function tierChip(t) {
  var n = parseInt(String(t || '').replace(/\D/g, ''), 10);
  if (!n) return t ? '<span class="tier-chip">' + esc(String(t)) + '</span>' : '';
  return '<span class="tier-chip tier-' + Math.min(5, Math.max(1, n)) + '">T' + n + '</span>';
}

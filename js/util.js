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

// Tier de la empresa: etiqueta con relleno, escala de azul GIWA que se intensifica con
// el multiplicador (T1 = el más intenso). La misma en Clientes y la ficha (29/10/2026).
function tierChip(t) {
  var n = parseInt(String(t || '').replace(/\D/g, ''), 10);
  if (!n) return t ? '<span class="tier-chip">' + esc(String(t)) + '</span>' : '';
  return '<span class="tier-chip tier-' + Math.min(5, Math.max(1, n)) + '">T' + n + '</span>';
}

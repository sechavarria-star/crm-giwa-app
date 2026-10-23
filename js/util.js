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
}
function closeM(id) { var el = document.getElementById(id); if (el) el.classList.remove('open', 'n2'); }
// Cualquier botón con data-cerrar="<id del modal>" lo cierra
document.addEventListener('click', function (ev) {
  var c = ev.target.closest && ev.target.closest('[data-cerrar]');
  if (c) closeM(c.getAttribute('data-cerrar'));
});
document.addEventListener('mousedown', function (ev) {
  if (ev.target.classList && ev.target.classList.contains('mo') && ev.target.classList.contains('open')) closeM(ev.target.id);
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

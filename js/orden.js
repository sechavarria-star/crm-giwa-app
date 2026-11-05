/* ══════════════════════════════════════════════════════════════════════
   orden.js · ordenar por columna, en todas las tablas de la app (05/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Un clic en el título ordena A-Z y otro Z-A. Entiende texto, importes, números
   y fechas dd/mm/aaaa; lo vacío queda al final. La fila de totales queda abajo y
   el detalle (.fin-pro) viaja con su fila. Títulos vacíos y tablas agrupadas no.
   La flecha es CSS: th[data-orden] en componentes.css.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  function valor(celda) {
    var t = (celda ? celda.textContent : '').replace(/\s+/g, ' ').trim();
    if (!t || t === '—') return null;
    var f = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (f) return Number(f[3] + f[2] + f[1]);
    if (/^[−-]?\s*(\$|USD|U\$S)?\s*[\d.,]+\s*%?(\/mes)?$/.test(t)) {
      var n = Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
      return /^[−-]/.test(t) ? -n : n;
    }
    return t;
  }
  function comparar(a, b, dir) {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;   // lo vacío, siempre al final
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
    if (typeof a !== typeof b) return (typeof a === 'number' ? -1 : 1) * dir;
    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }) * dir;
  }
  function ordenar(cuerpo, col, dir) {
    var grupos = [], fijas = [];
    Array.prototype.forEach.call(cuerpo.rows, function (r) {
      if (r.classList.contains('fin-tot') || r.cells.length <= col) fijas.push(r);
      else if (r.classList.contains('fin-pro') && grupos.length) grupos[grupos.length - 1].push(r);
      else grupos.push([r]);
    });
    grupos.sort(function (a, b) { return comparar(valor(a[0].cells[col]), valor(b[0].cells[col]), dir); });
    grupos.forEach(function (g) { g.forEach(function (r) { cuerpo.appendChild(r); }); });
    fijas.forEach(function (r) { cuerpo.appendChild(r); });
  }
  document.addEventListener('click', function (ev) {
    var th = ev.target.closest && ev.target.closest('table.tbl th, table.ui-tbl th');
    if (!th || !th.textContent.trim() || ev.target.closest('a,button,input,select')) return;
    var tabla = th.closest('table'); if (tabla.querySelector('tr.pc-emp-f')) return;
    var dir = th.getAttribute('data-orden') === 'asc' ? -1 : 1;
    Array.prototype.forEach.call(th.parentNode.cells, function (c) { c.removeAttribute('data-orden'); });
    th.setAttribute('data-orden', dir === 1 ? 'asc' : 'desc');
    // Facturación: los títulos van una sola vez arriba y cada proyecto tiene su tabla
    var cuerpos = tabla.classList.contains('fa-tb') ? tabla.closest('.fa-lista').querySelectorAll('tbody') : tabla.tBodies;
    Array.prototype.forEach.call(cuerpos, function (c) { ordenar(c, th.cellIndex, dir); });
  });
})();

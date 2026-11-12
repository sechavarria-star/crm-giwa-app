/* ══════════════════════════════════════════════════════════════════════
   menciones.js · el desplegable de @ en los comentarios de tarea (04/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Funciona en todo cuadro de comentario de tarea: la ficha, Hoy y Proyectos.
   Sólo ayuda a escribir @Nombre: quién quedó mencionado lo resuelve la base
   al guardar el comentario (crm_giwa.comentar → _registrar_menciones).
     resaltarMenciones(html) marca los @Nombre de un texto ya escapado.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var CAMPOS = '#ftv-txt, .hoy-nota', M = { users: null, box: null, campo: null, L: [], i: 0, desde: 0 };

  async function usuarios() {
    if (M.users) return M.users;
    var r = await db().from('usuarios').select('nombre').eq('es_giwa', true).eq('activo', true).order('orden');
    if (r.error) return [];
    M.users = r.data.map(function (u) { return String(u.nombre || '').trim(); }).filter(Boolean);
    return M.users;
  }
  function cerrar() { if (M.box) M.box.hidden = true; M.campo = null; }
  function pintar() {
    if (!M.box) { M.box = document.createElement('div'); M.box.className = 'ment-menu'; M.box.setAttribute('role', 'listbox'); document.body.appendChild(M.box); }
    M.box.innerHTML = M.L.map(function (n, i) { return '<button type="button" class="ment-op' + (i === M.i ? ' on' : '') + '" role="option" data-i="' + i + '">' + ico('personas') + ' ' + esc(n) + '</button>'; }).join('');
    var r = M.campo.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;   // la app se achica en pantallas de menos de 1440 (app.css)
    M.box.style.left = (r.left / z) + 'px'; M.box.style.top = (r.bottom / z + 2) + 'px'; M.box.hidden = false;
  }
  function elegir(i) {
    var c = M.campo, nombre = M.L[i]; if (!c || !nombre) return;
    var fin = c.selectionStart;
    c.setRangeText('@' + nombre + ' ', M.desde, fin, 'end');
    c.focus(); cerrar();
  }

  document.addEventListener('input', async function (ev) {
    var c = ev.target; if (!c.matches || !c.matches(CAMPOS)) return;
    var m = c.value.slice(0, c.selectionStart).match(/(^|\s)@([^\s@]*)$/);
    if (!m) return cerrar();
    var q = m[2].toLowerCase(), L = (await usuarios()).filter(function (n) { return n.toLowerCase().indexOf(q) === 0; });
    if (!L.length) return cerrar();
    M.campo = c; M.L = L; M.i = 0; M.desde = c.selectionStart - m[2].length - 1; pintar();
  });
  // En captura: con el desplegable abierto, Enter elige y no manda el comentario
  document.addEventListener('keydown', function (ev) {
    if (!M.campo || ev.target !== M.campo) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); return cerrar(); }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); M.i = (M.i + (ev.key === 'ArrowDown' ? 1 : M.L.length - 1)) % M.L.length; return pintar(); }
    if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); ev.stopPropagation(); elegir(M.i); }
  }, true);
  document.addEventListener('mousedown', function (ev) {
    var b = ev.target.closest && ev.target.closest('.ment-op');
    if (b) { ev.preventDefault(); return elegir(Number(b.getAttribute('data-i'))); }
    if (M.campo && ev.target !== M.campo) cerrar();
  });
  window.addEventListener('resize', cerrar);
  document.addEventListener('scroll', cerrar, true);

  window.resaltarMenciones = function (html) { return String(html).replace(/(^|\s)(@[^\s@.,;:!?()<>]+)/g, '$1<span class="ment">$2</span>'); };
})();

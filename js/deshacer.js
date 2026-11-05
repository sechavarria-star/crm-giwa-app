/* ══════════════════════════════════════════════════════════════════════
   deshacer.js · deshacer la última acción, hasta 5 minutos después (05/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Un solo enlace en la barra superior. La base guarda cómo estaba y vuelve a
   verificar el plazo y que sea quien hizo la acción (crm_giwa.deshacer).
     conDeshacer(etiqueta, tabla, ids, accion)  foto, acción y, si salió bien, el enlace
     deshacerCreados(etiqueta, tabla, ids)      lo recién creado: deshacer lo borra
   Para sumar una acción: envolverla con conDeshacer. Tablas: deshacer_foto.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var PLAZO = 5 * 60 * 1000, btn = null, reloj = null;
  function ocultar() { clearTimeout(reloj); if (btn) btn.hidden = true; }
  function ofrecer(id, etiqueta) {
    if (!id) return;
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ui-lnk ui-azul';
      var f = document.getElementById('top-fecha'); f.parentNode.insertBefore(btn, f);
    }
    btn.textContent = 'Deshacer: ' + etiqueta; btn.hidden = false;
    btn.onclick = async function () {
      if (!(await ask('Se deshace: ' + etiqueta + '.', 'Deshacer', { ok: 'Deshacer' }))) return;
      var r = await db().rpc('deshacer', { lid: id }); ocultar();
      if (r.error) return toast(r.error.message, 'err');
      toast('Deshecho: ' + etiqueta, 'ok'); recargar();
    };
    clearTimeout(reloj); reloj = setTimeout(ocultar, PLAZO);
  }
  async function foto(etiqueta, tabla, ids, creados) {
    var r = await db().rpc('deshacer_foto', { etiqueta: etiqueta, tabla: tabla, ids: ids, creados: !!creados });
    return r.error ? null : r.data;
  }
  window.conDeshacer = async function (etiqueta, tabla, ids, accion) {
    var id = await foto(etiqueta, tabla, ids), res = await accion();
    if (res) ofrecer(id, etiqueta);
    return res;
  };
  window.deshacerCreados = async function (etiqueta, tabla, ids) { if (ids && ids.length) ofrecer(await foto(etiqueta, tabla, ids, true), etiqueta); };
})();

/* ══════════════════════════════════════════════════════════════════════
   deshacer.js · deshacer la última acción, hasta 5 minutos después (05/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Un solo enlace en la barra superior. La base guarda cómo estaba y vuelve a
   verificar el plazo y que sea quien hizo la acción (crm_giwa.deshacer).
     conDeshacer(etiqueta, tabla, ids, accion)  foto, acción y, si salió bien, el enlace
     deshacerCreados(etiqueta, tabla, ids)      lo recién creado: deshacer lo borra
   Para sumar una acción: envolverla con conDeshacer. Tablas: deshacer_foto.
   otra = { tabla, ids }: si la acción toca una segunda tabla (aprobar un proyecto).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var PLAZO = 5 * 60 * 1000, btn = null, reloj = null;
  function ocultar() { clearTimeout(reloj); if (btn) btn.hidden = true; }
  function ofrecer(lids, etiqueta) {
    lids = [].concat(lids).filter(Boolean); if (!lids.length) return;
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ui-lnk ui-azul';
      var f = document.getElementById('top-fecha'); f.parentNode.insertBefore(btn, f);
    }
    btn.textContent = 'Deshacer: ' + etiqueta; btn.hidden = false;
    btn.onclick = async function () {
      if (!(await ask('Se deshace: ' + etiqueta + '.', 'Deshacer', { ok: 'Deshacer' }))) return;
      ocultar();
      for (var i = 0; i < lids.length; i++) { var r = await db().rpc('deshacer', { lid: lids[i] }); if (r.error) return toast(r.error.message, 'err'); }
      toast('Deshecho: ' + etiqueta, 'ok'); recargar();
    };
    clearTimeout(reloj); reloj = setTimeout(ocultar, PLAZO);
  }
  async function foto(etiqueta, tabla, ids, creados) {
    var r = await db().rpc('deshacer_foto', { etiqueta: etiqueta, tabla: tabla, ids: ids, creados: !!creados });
    return r.error ? null : r.data;
  }
  window.conDeshacer = async function (etiqueta, tabla, ids, accion, otra) {
    var lids = [await foto(etiqueta, tabla, ids)];
    if (otra) lids.push(await foto(etiqueta, otra.tabla, otra.ids));
    var res = await accion();
    if (res) ofrecer(lids, etiqueta);
    return res;
  };
  window.deshacerCreados = async function (etiqueta, tabla, ids) { if (ids && ids.length) ofrecer(await foto(etiqueta, tabla, ids, true), etiqueta); };
})();

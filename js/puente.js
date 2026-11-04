/* ══════════════════════════════════════════════════════════════════════
   puente.js · Drive y Gmail, a través del Apps Script (Puente.js) (03/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Las mismas carpetas y el mismo borrador de Gmail de siempre.
     puente('subirFactura', { archivo, owner })   → { ok, url, id }
     puente('subirDoc', { archivo, empresa })     → { ok, url, id }
     puente('mailFactura', { para, cliente, numero, … }) → { ok, url } (borrador)
   ══════════════════════════════════════════════════════════════════════ */
function _base64(archivo) {
  return new Promise(function (ok, mal) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = function () { mal(new Error('No se pudo leer el archivo')); }; r.readAsDataURL(archivo); });
}
async function puente(accion, datos) {
  var d = Object.assign({}, datos);
  if (d.archivo) { d.base64 = await _base64(d.archivo); d.mime = d.archivo.type || 'application/octet-stream'; d.nombre = d.archivo.name; delete d.archivo; }
  var s = await sb().auth.getSession(), token = s.data && s.data.session && s.data.session.access_token;
  var r = await fetch(CRM_CONFIG.puente, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: accion, token: token, datos: d }) });
  var j; try { j = await r.json(); } catch (e) { throw new Error('La conexión con Drive y Gmail no está disponible todavía'); }
  if (!j.ok) throw new Error(j.msg || 'No se pudo hacer en Google');
  return j;
}

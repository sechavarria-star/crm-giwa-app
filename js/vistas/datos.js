/* ══════════════════════════════════════════════════════════════════════
   vistas/datos.js · Administración de datos (03/11/2026) · SÓLO Victoria
   ──────────────────────────────────────────────────────────────────────
   Planilla para mirar y corregir a mano las tablas de negocio: buscar,
   ver un registro con todo lo que lo usa, editarlo o borrarlo, y buscar
   duplicados. El permiso NO depende de esta pantalla: cada función de la
   base (crm_giwa.admin_*) verifica es_duena() y corta si no es ella.
   Nada se cambia sin confirmar; todo cambio y borrado pide un motivo y
   queda en crm_giwa.admin_auditoria (antes, después, quién, cuándo).
   Los borrados piden escribir el id y la base no borra lo que otros usan.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var S = { tablas: [], tabla: 'empresas', q: '', desde: 0, d: null, aud: null, dup: null };
  var PAG = 100;
  // Columnas para comparar duplicados, por tabla (se pueden cambiar al buscar)
  var DUP = { empresas: 'nombre', contactos: 'nombre,apellido,empresa_id', proyectos: 'nombre,empresa_id', desarrollos: 'proyecto_id,titulo',
              cobros: 'proyecto_id,monto_ars,concepto_fc', razones_sociales: 'cuit', tareas: 'titulo,desarrollo_id' };

  async function rpc(fn, args) { var r = await db().rpc(fn, args || {}); if (r.error) throw new Error(r.error.message); return r.data; }
  async function cargar() {
    S.tablas = await rpc('admin_tablas');
    S.d = await rpc('admin_leer', { tabla: S.tabla, q: S.q, lim: PAG, desde: S.desde });
  }
  function celda(v) {
    if (v === null || v === undefined || v === '') return '<span class="ui-nota-t">—</span>';
    var t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return '<span title="' + esc(t) + '">' + esc(t.length > 60 ? t.slice(0, 60) + '…' : t) + '</span>';
  }
  function pintar(el) {
    if (_montado !== 'datos') return;
    var d = S.d || { cols: [], filas: [], total: 0 };
    var h = uiHd('Datos', 'Consultar y corregir la base. Sólo vos: cada cambio pide confirmación y motivo, y queda registrado.',
      uiBtn('Duplicados', 'buscar', 's', 'data-dat="dup"') + uiBtn('Registro de cambios', 'lista', 's', 'data-dat="aud"'));
    h += '<div class="ui-filtros"><select class="ui-campo" id="dat-t" aria-label="Tabla">' + S.tablas.map(function (t) {
        return '<option value="' + esc(t.tabla) + '"' + (t.tabla === S.tabla ? ' selected' : '') + '>' + esc(t.tabla) + ' (' + t.filas + ')</option>'; }).join('') + '</select>' +
      '<input class="ui-campo ui-f1" id="dat-q" placeholder="Buscar en cualquier columna y Enter…" aria-label="Buscar" value="' + esc(S.q) + '"></div>';
    if (S.dup) h += htmlDup();
    if (S.aud) h += htmlAud();
    h += '<div class="ui-nota-t ui-rapido">Mostrando <span class="ui-num">' + d.filas.length + '</span> de <span class="ui-num">' + d.total + '</span> · tocá una fila para verla y editarla' +
      (S.desde > 0 ? ' · <button type="button" class="ui-lnk ui-azul" data-dat="ant">Anteriores</button>' : '') +
      (S.desde + PAG < d.total ? ' · <button type="button" class="ui-lnk ui-azul" data-dat="sig">Siguientes</button>' : '') + '</div><br>';
    h += '<div class="u-ovx"><table class="ui-tbl"><thead><tr>' + d.cols.map(function (c) { return '<th>' + esc(c.col) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      d.filas.map(function (f) { return '<tr class="ui-fila" data-dat="fila" data-id="' + esc(f.id) + '">' + d.cols.map(function (c) { return '<td>' + celda(f[c.col]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
    el.innerHTML = h;
  }
  function htmlDup() {
    return uiDesp({ t: 'Posibles duplicados en ' + S.tabla + ' · por ' + S.dup.cols, n: S.dup.g.length, open: true },
      S.dup.g.length ? S.dup.g.map(function (g) {
        return '<div class="ui-linea"><span class="ui-f1">' + esc(g.clave) + '</span>' + g.ids.map(function (id) {
          return '<button type="button" class="ui-lnk ui-azul" data-dat="fila" data-id="' + esc(id) + '">' + esc(id) + '</button>'; }).join(' ') + '</div>';
      }).join('') : '<div class="ui-nota-t">Sin duplicados con esas columnas.</div>') + '<br>';
  }
  function htmlAud() {
    return uiDesp({ t: 'Registro de cambios (últimos 50)', n: S.aud.length, open: true },
      S.aud.length ? S.aud.map(function (a) {
        return '<div class="ui-linea"><span class="ui-num ui-nota-t">' + ff(a.cuando) + '</span><span class="ui-f1">' + esc(a.accion) + ' · ' + esc(a.tabla) + ' ' + esc(a.registro) +
          ' — ' + esc(a.motivo) + '</span><span class="ui-nota-t">' + esc(String(a.quien || '').split('@')[0]) + '</span></div>';
      }).join('') : '<div class="ui-nota-t">Todavía no hay cambios.</div>') + '<br>';
  }

  // ── un registro: todos sus campos, lo que lo usa, guardar y borrar ──
  function esJson(tipo) { return /\[\]$|json/.test(tipo); }
  function valorCampo(c, v) {
    if (v === null || v === undefined) return '';
    return esJson(c.tipo) || typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  async function abrir(el, id) {
    var fila = (S.d.filas || []).find(function (f) { return String(f.id) === id; });
    if (!fila) { var r = await rpc('admin_leer', { tabla: S.tabla, q: id, lim: 50, desde: 0 }); fila = r.filas.find(function (f) { return String(f.id) === id; }); }
    if (!fila) return toast('No encontré ' + id + ' en ' + S.tabla, 'err');
    var rel = await rpc('admin_relaciones', { tabla: S.tabla, rid: id });
    var m = document.getElementById('m-dat');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-dat'; document.body.appendChild(m); }
    m.innerHTML = '<div class="md"><div class="mh"><span class="mt2">' + esc(S.tabla + ' · ' + id) + '</span>' +
      '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-dat">' + ico('cerrar') + '</button></div><div class="mb2">' +
      '<div class="ui-lat-h">Lo usan</div>' + (rel.length ? rel.map(function (x) {
        return '<div class="ui-linea"><span class="ui-f1">' + esc(x.tabla) + '.' + esc(x.columna) + ' <span class="ui-num">×' + x.n + '</span></span><span class="ui-nota-t">' + esc(x.ids.slice(0, 8).join(', ')) + (x.n > 8 ? '…' : '') + '</span></div>';
      }).join('') : '<div class="ui-nota-t">Ningún otro registro lo usa.</div>') + '<br>' +
      '<div class="g2">' + S.d.cols.map(function (c) {
        var v = valorCampo(c, fila[c.col]), dis = c.col === 'id' ? ' disabled' : '';
        var campo = esJson(c.tipo) || v.length > 80
          ? '<textarea class="fc" rows="2" data-col="' + esc(c.col) + '"' + dis + '>' + esc(v) + '</textarea>'
          : '<input class="fc" data-col="' + esc(c.col) + '" value="' + esc(v) + '"' + dis + '>';
        return '<div class="fg"><label class="fl">' + esc(c.col) + ' <span class="u-s10-mt">' + esc(c.tipo) + '</span></label>' + campo + '</div>';
      }).join('') + '</div></div>' +
      '<div class="mf"><button class="btn bg" data-dat="borrar">' + ico('borrar') + ' Borrar</button><span class="u-mla"></span>' +
      '<button class="btn bg" data-cerrar="m-dat">Cancelar</button><button class="btn bp" data-dat="guardar">Guardar cambios</button></div></div>';
    m.onclick = function (ev) {
      var b = ev.target.closest('[data-dat]'); if (!b) return;
      if (b.getAttribute('data-dat') === 'guardar') return guardar(el, fila);
      if (b.getAttribute('data-dat') === 'borrar') return borrar(el, id, rel);
    };
    openM('m-dat');
  }
  async function guardar(el, fila) {
    var cols = {}; S.d.cols.forEach(function (c) { cols[c.col] = c; });
    var cambios = {}, lista = [], malo = '';
    document.querySelectorAll('#m-dat [data-col]').forEach(function (x) {
      var c = cols[x.getAttribute('data-col')], antes = valorCampo(c, fila[c.col]), nuevo = x.value;
      if (c.col === 'id' || nuevo === antes) return;
      var v = nuevo.trim() === '' ? null : nuevo;
      if (v !== null && esJson(c.tipo)) { try { v = JSON.parse(v); } catch (e) { malo = c.col; return; } }
      cambios[c.col] = v; lista.push('· ' + c.col + ': «' + (antes || '—') + '» → «' + (nuevo || '—') + '»');
    });
    if (malo) return toast(malo + ': no es un JSON válido', 'err');
    if (!lista.length) return toast('No cambiaste nada', 'inf');
    if (!(await ask('Se modifica ' + S.tabla + ' ' + fila.id + ':\n\n' + lista.join('\n'), 'Guardar cambios', { ok: 'Seguir' }))) return;
    var motivo = await pedir('¿Por qué? Queda en el registro de cambios.', '', 'Motivo');
    if (!motivo || !String(motivo).trim()) return toast('Sin motivo no se guarda', 'err');
    try { await rpc('admin_editar', { tabla: S.tabla, rid: String(fila.id), cambios: cambios, motivo: String(motivo).trim() }); }
    catch (e) { return toast(e.message, 'err'); }
    closeM('m-dat'); toast('Guardado y registrado', 'ok'); await cargar(); pintar(el);
  }
  async function borrar(el, id, rel) {
    if (rel.length) return say('No se puede borrar ' + id + ': lo usan ' + rel.map(function (x) { return x.tabla + '.' + x.columna + ' ×' + x.n; }).join(', ') +
      '.\n\nPrimero reasigná o borrá esos registros.', 'Borrar');
    if (!(await ask('Se BORRA ' + S.tabla + ' ' + id + '. No se puede deshacer desde la app (el registro de cambios guarda cómo estaba).', 'Borrar registro', { ok: 'Seguir', peligro: true }))) return;
    var motivo = await pedir('¿Por qué se borra? Queda en el registro de cambios.', '', 'Motivo');
    if (!motivo || !String(motivo).trim()) return toast('Sin motivo no se borra', 'err');
    var conf = await pedir('Para confirmar, escribí el id: ' + id, '', 'Confirmar borrado');
    if (conf === null) return;
    try { await rpc('admin_borrar', { tabla: S.tabla, rid: id, motivo: String(motivo).trim(), confirmacion: String(conf).trim() }); }
    catch (e) { return toast(e.message, 'err'); }
    closeM('m-dat'); toast(id + ' borrado y registrado', 'ok'); await cargar(); pintar(el);
  }

  VISTAS.datos = async function (el, op) {
    await abrirModulo(el, { id: 'datos', texto: 'Cargando las tablas…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return !!S.d; }, firma: function () { return JSON.stringify(S.d); }, pintar: function () { pintar(el); } });
    var recargar = async function () { try { await cargar(); } catch (e) { return toast(e.message, 'err'); } pintar(el); };
    el.onchange = function (ev) {
      if (ev.target.id === 'dat-t') { S.tabla = ev.target.value; S.q = ''; S.desde = 0; S.dup = null; recargar(); }
    };
    el.onkeydown = function (ev) {
      if (ev.target.id === 'dat-q' && ev.key === 'Enter') { S.q = ev.target.value.trim(); S.desde = 0; recargar(); }
    };
    el.onclick = async function (ev) {
      var b = ev.target.closest('[data-dat]'); if (!b) return;
      var a = b.getAttribute('data-dat');
      if (a === 'fila') return abrir(el, b.getAttribute('data-id')).catch(function (e) { toast(e.message, 'err'); });
      if (a === 'sig') { S.desde += PAG; return recargar(); }
      if (a === 'ant') { S.desde = Math.max(0, S.desde - PAG); return recargar(); }
      if (a === 'dup') {
        var cols = await pedir('Columnas a comparar en ' + S.tabla + ', separadas por coma.', DUP[S.tabla] || 'nombre', 'Duplicados');
        if (!cols) return;
        try { S.dup = { cols: cols, g: await rpc('admin_duplicados', { tabla: S.tabla, columnas: cols.split(',').map(function (x) { return x.trim(); }).filter(Boolean) }) }; }
        catch (e) { return toast(e.message, 'err'); }
        return pintar(el);
      }
      if (a === 'aud') {
        if (S.aud) { S.aud = null; return pintar(el); }
        var r = await db().from('admin_auditoria').select('*').order('cuando', { ascending: false }).limit(50);
        if (r.error) return toast(r.error.message, 'err');
        S.aud = r.data; return pintar(el);
      }
    };
  };
})();

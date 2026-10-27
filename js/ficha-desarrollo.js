/* ══════════════════════════════════════════════════════════════════════
   ficha-desarrollo.js · LA ventana del desarrollo (reemplaza _SolFicha en PM)
   ──────────────────────────────────────────────────────────────────────
     abrirDesarrollo(id, opts)   opts = { onSave: fn() }

   Datos y precio: crm_giwa.guardar_desarrollo (= saveItem de PM, sólo lo que
   cambia). Módulos: crm_giwa.guardar_modulos_desarrollo (= guardarModulosDesarrollo):
   el motor de la base (estimar_desarrollo) da horas, Tier y valor hora, y las
   horas cotizadas se regeneran; lo que ya tiene horas reales se queda.
   El precio que se cobra es un dato: el motor sugiere, no pisa el total.
   Lo finalizado, cerrado, cancelado o rechazado se mira, no se edita.

   PENDIENTE: costos de terceros (Contrataciones), recotizar y renovar (5h c).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var F = { d: null, emp: '', cat: [], sel: {}, cant: {}, modsTocados: false, onSave: null, timer: 0 };
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }
  function n(id) { var x = v(id); return x === '' ? '' : Number(x); }
  function campo(id, label, attrs) {
    return '<div class="fg"><label class="fl" for="' + id + '">' + label + '</label><input class="fc u-tr" id="' + id + '" ' + (attrs || 'type="number" min="0"') + '></div>';
  }

  var HTML =
    '<div class="mo" id="m-fdes"><div class="md">' +
      '<div class="mh"><span class="mt2" id="fd-tit">Desarrollo</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-fdes">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="ft-info u-c-wa u-mb12" id="fd-bloq" hidden></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fd-titulo">Título <span class="req">*</span></label><input class="fc" id="fd-titulo"></div>' +
          '<div class="fg"><label class="fl" for="fd-tipo">Tipo</label><select class="fc" id="fd-tipo"></select></div></div>' +
        '<div class="fg"><label class="fl" for="fd-desc">Descripción</label><textarea class="fc" id="fd-desc" rows="2"></textarea></div>' +
        '<div class="sec u-mt10">Precio</div>' +
        '<div class="g3"><div class="fg"><label class="fl" for="fd-moneda">Moneda</label><select class="fc" id="fd-moneda"><option>ARS</option><option>USD</option></select></div>' +
          campo('fd-total-ars', 'Total ARS') + campo('fd-total-usd', 'Total USD') + '</div>' +
        '<div class="g3">' + campo('fd-tc', 'TC') + campo('fd-cuotas', 'Cuotas', 'type="number" min="1"') +
          '<div class="fg"><label class="fl" for="fd-modelo">Modelo de pago</label><select class="fc" id="fd-modelo"></select></div></div>' +
        '<div class="ft-info" id="fd-sug"></div>' +
        '<div class="sec u-mt10">Abono y soporte</div>' +
        '<div class="g3">' + campo('fd-cuota', 'Cuota por mes') + campo('fd-mant-hs', 'Horas incluidas') +
          '<div class="fg"><label class="fl" for="fd-ajuste">Ajuste</label><select class="fc" id="fd-ajuste"><option value="Sin Ajuste">Sin Ajuste</option><option value="Ajuste">Con Ajuste IPC</option></select></div></div>' +
        '<div class="g3">' + campo('fd-garantia', 'Días de garantía') + campo('fd-sop-ars', 'Soporte · valor hora ARS') + campo('fd-sop-usd', 'Soporte · valor hora USD') + '</div>' +
        '<div class="sec u-mt10">Módulos</div>' +
        '<div id="fd-mods"></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-fdes">Cancelar</button><button class="btn bp" id="fd-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    $('fd-ok').onclick = guardar;
    $('fd-tipo').onchange = async function () { await cargarCatalogo(this.value, []); F.modsTocados = true; sugerir(); };
    $('fd-mods').addEventListener('change', function (ev) {
      var t = ev.target, id = t.getAttribute('data-mod');
      if (t.matches('[data-cant]')) { F.cant[t.getAttribute('data-cant')] = Number(t.value) || 1; }
      else if (id) { F.sel[id] = t.checked; if (t.checked) prender(id); pintarMods(); }
      else return;
      F.modsTocados = true; sugerir();
    });
  });

  // Elegir una hija prende a su madre, como en la minuta
  function prender(id) {
    var m = F.cat.find(function (x) { return x.id === id; }); if (!m) return;
    F.sel[id] = true; if (m.padre && !F.sel[m.padre]) prender(m.padre);
  }

  // El catálogo activo del tipo; lo cotizado (proyecto_horas) marca lo tildado.
  // Un módulo fusionado cuenta en el que lo reemplaza.
  async function cargarCatalogo(tipo, cotizados) {
    var r = await db().from('catalogo_modulos').select('id,etapa,orden,nombre,horas_base,sugerido,padre,es_por_instancia,activo,reemplazado_por')
      .eq('tipo_desarrollo_id', tipo).order('orden');
    if (r.error) throw new Error(r.error.message);
    var rep = {}; r.data.forEach(function (m) { if (m.reemplazado_por) rep[m.id] = m.reemplazado_por; });
    F.cat = r.data.filter(function (m) { return m.activo !== false; });
    F.sel = {}; F.cant = {};
    F.cat.forEach(function (m) { F.sel[m.id] = false; });
    if (cotizados.length) cotizados.forEach(function (id) { prender(rep[id] || id); });
    else F.cat.forEach(function (m) { if (m.sugerido) F.sel[m.id] = true; });
    pintarMods();
  }
  function pintarMods() {
    var porEtapa = {}, orden = [];
    F.cat.forEach(function (m) { var e = m.etapa || 'Otros'; if (!porEtapa[e]) { porEtapa[e] = []; orden.push(e); } porEtapa[e].push(m); });
    var dis = F.bloq ? ' disabled' : '';
    $('fd-mods').innerHTML = orden.length ? orden.map(function (e) {
      return '<div class="u-mb12"><div class="fl">' + esc(e) + '</div>' + porEtapa[e].map(function (m) {
        return '<label class="u-row6 u-mt4' + (m.padre ? ' fd-hija' : '') + '"><input type="checkbox" data-mod="' + esc(m.id) + '"' + (F.sel[m.id] ? ' checked' : '') + dis + '> ' +
          '<span class="u-f1">' + esc(m.nombre || m.id) + '</span>' +
          (m.es_por_instancia && F.sel[m.id] ? '<input class="fc u-tr ft-w150" type="number" min="1" data-cant="' + esc(m.id) + '" value="' + (F.cant[m.id] || 1) + '" aria-label="Cantidad"' + dis + '>' : '') +
          '<span class="u-s10-mt m">' + (Number(m.horas_base) || 0) + ' h</span></label>';
      }).join('') + '</div>';
    }).join('') : '<div class="empty">El catálogo no tiene módulos de este tipo.</div>';
  }

  // Lo que sugiere el motor (no pisa el total: el precio cobrado es un dato)
  function sugerir() {
    clearTimeout(F.timer);
    F.timer = setTimeout(async function () {
      var r = await db().rpc('estimar_desarrollo', { tipo: v('fd-tipo'), empresa_id: F.emp, opts: { sel: F.sel, cant: F.cant } });
      var e = r.data || {};
      $('fd-sug').innerHTML = r.error ? esc(r.error.message) : !e.ok ? esc(e.msg || '') :
        'Sugerido por el motor: <span class="m">' + e.horas + ' h</span> × <span class="m">' + fmt(e.valor_hora) + '</span>' +
        (e.tier ? ' (' + esc(e.tier) + ')' : '') + ' = <b class="m">' + fmt(e.total_ars) + '</b>';
    }, 300);
  }

  window.abrirDesarrollo = async function (id, opts) {
    F.onSave = (opts || {}).onSave || null; F.modsTocados = false;
    try {
      var r = await Promise.all([
        db().from('desarrollos').select('id,proyecto_id,titulo,descripcion,tipo_id,estado_id,moneda,total_ars,total_usd,tipo_cambio,q_cuotas,modelo_pago_id,ajuste,valor_cuota_actual,mantenimiento_horas,garantia_dias,soporte_hora_ars,soporte_hora_usd').eq('id', id).maybeSingle(),
        db().from('tipos_desarrollo').select('id,nombre').order('orden'),
        db().from('modelos_pago').select('id,nombre').order('orden'),
        db().from('proyecto_horas').select('modulo_id').eq('desarrollo_id', id)
      ]);
      var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
      var d = r[0].data; if (!d) return toast('No encontré el desarrollo ' + id, 'err');
      var pr = await db().from('proyectos').select('empresa_id').eq('id', d.proyecto_id).maybeSingle();
      F.d = d; F.emp = (pr.data && pr.data.empresa_id) || '';
      F.bloq = /finaliz|cerrad|cancel|rechaz/i.test(String(d.estado_id || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
      $('fd-tit').textContent = 'Desarrollo · ' + d.id;
      $('fd-tipo').innerHTML = r[1].data.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === d.tipo_id ? ' selected' : '') + '>' + esc(t.nombre) + '</option>'; }).join('');
      $('fd-modelo').innerHTML = '<option value="">—</option>' + r[2].data.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === d.modelo_pago_id ? ' selected' : '') + '>' + esc(m.nombre) + '</option>'; }).join('');
      $('fd-titulo').value = d.titulo || ''; $('fd-desc').value = d.descripcion || '';
      $('fd-moneda').value = d.moneda === 'USD' ? 'USD' : 'ARS';
      $('fd-total-ars').value = d.total_ars || ''; $('fd-total-usd').value = d.total_usd || ''; $('fd-tc').value = d.tipo_cambio || '';
      $('fd-cuotas').value = d.q_cuotas || ''; $('fd-ajuste').value = /ajuste/i.test(d.ajuste || '') && !/sin/i.test(d.ajuste || '') ? 'Ajuste' : 'Sin Ajuste';
      $('fd-cuota').value = d.valor_cuota_actual || ''; $('fd-mant-hs').value = d.mantenimiento_horas || '';
      $('fd-garantia').value = d.garantia_dias || ''; $('fd-sop-ars').value = d.soporte_hora_ars || ''; $('fd-sop-usd').value = d.soporte_hora_usd || '';
      await cargarCatalogo(d.tipo_id, r[3].data.map(function (x) { return x.modulo_id; }).filter(Boolean));
      // Lo cerrado se mira, no se edita
      $('fd-bloq').hidden = !F.bloq;
      if (F.bloq) $('fd-bloq').textContent = 'Este desarrollo está ' + d.estado_id + '. Se mira, no se edita. Si hay trabajo nuevo, va como módulo evolutivo aparte.';
      $('m-fdes').querySelectorAll('.mb2 input, .mb2 select, .mb2 textarea').forEach(function (x) { x.disabled = F.bloq; });
      $('fd-ok').hidden = F.bloq;
      $('fd-sug').innerHTML = '';
      openM('m-fdes');
      sugerir();
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  };

  async function guardar() {
    var d = F.d; if (!d || F.bloq) return;
    if (!v('fd-titulo')) return toast('Poné un título', 'err');
    var p = { id: d.id, titulo: v('fd-titulo'), descripcion: v('fd-desc'), tipo: v('fd-tipo'), moneda: v('fd-moneda'),
      total_ars: n('fd-total-ars'), total_usd: n('fd-total-usd'), tc: n('fd-tc'), cuotas: n('fd-cuotas'), modelo: v('fd-modelo'),
      inflacion: v('fd-ajuste'), cuota_act: n('fd-cuota'), mant_horas: n('fd-mant-hs'), garantia_dias: n('fd-garantia'),
      soporte_ars: n('fd-sop-ars'), soporte_usd: n('fd-sop-usd') };
    // Ya aprobado: los montos son un compromiso comercial (la misma advertencia que PM)
    if (['aprobada', 'curso', 'garantia'].indexOf(_canonSol(d.estado_id || '')) >= 0) {
      var camb = [];
      if (Math.round(Number(p.total_ars) || 0) !== Math.round(Number(d.total_ars) || 0)) camb.push('Total: ' + fmt(d.total_ars || 0) + ' → ' + fmt(p.total_ars || 0));
      if (Math.round(Number(p.cuota_act) || 0) !== Math.round(Number(d.valor_cuota_actual) || 0)) camb.push('Cuota: ' + fmt(d.valor_cuota_actual || 0) + ' → ' + fmt(p.cuota_act || 0));
      if ((Number(p.cuotas) || 0) !== (Number(d.q_cuotas) || 0)) camb.push('Cuotas: ' + (d.q_cuotas || 0) + ' → ' + (p.cuotas || 0));
      if (camb.length && !(await ask('Este desarrollo ya está aprobado por el cliente.\n\nEstás por cambiar:\n· ' + camb.join('\n· ') +
        '\n\nLos montos aprobados son un compromiso comercial. Los ajustes por IPC se hacen desde su alerta, no acá.\n\n¿Guardar igual?', 'Desarrollo aprobado', { ok: 'Guardar' }))) return;
    }
    var b = $('fd-ok'); b.disabled = true;
    try {
      var r = await db().rpc('guardar_desarrollo', { p: p }); if (r.error) throw new Error(r.error.message);
      var msg = 'Desarrollo guardado';
      if (F.modsTocados) {
        var m = await db().rpc('guardar_modulos_desarrollo', { did: d.id, p: { tipo: p.tipo, sel: F.sel, cant: F.cant } });
        if (m.error) throw new Error(m.error.message);
        msg += ' · ' + m.data.horas + ' h en ' + (m.data.filas + m.data.conservadas) + ' módulos' + (m.data.conservadas ? ' (' + m.data.conservadas + ' con horas reales se conservaron)' : '');
      }
      toast(msg, 'ok'); closeM('m-fdes');
      if (F.onSave) F.onSave();
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false;
  }
})();

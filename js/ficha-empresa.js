/* ══════════════════════════════════════════════════════════════════════
   ficha-empresa.js · LA ficha de empresa (reemplaza _FichaEmpresa.html)
   ──────────────────────────────────────────────────────────────────────
   Una ficha son tres tablas: empresas, razones_sociales y contactos. Toda
   alta o edición de empresa o contacto pasa por acá, en cualquier pantalla.

     verFichaEmpresa(id, opts)    la ficha para mirar; desde ahí se edita
     abrirFichaEmpresa(id, opts)  la ficha en edición; id vacío = nueva
     abrirContacto(c, opts)       un contacto suelto; c = contacto o null
       opts  { onSave: fn(res), empresa: id (preelige en abrirContacto),
               nuevoContacto: true }

   Lee todo en un viaje paralelo y guarda todo en UNO con
   crm_giwa.guardar_ficha_empresa (todo o nada; mismas reglas que el
   Apps Script). Las listas salen de CotConfig, como siempre.

   PENDIENTE (puente de Google, etapa 3): subir el logo a Drive y crear o
   elegir la carpeta. Mientras tanto se pega la URL, que es lo que se guarda.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var F = { L: {}, tiers: [], empresas: [], borrar: [], onSave: null };

  // ── el markup, una sola vez ──────────────────────────────────
  var HTML =
    '<div class="mo" id="m-ficha"><div class="md">' +
      '<div class="mh"><span class="mt2" id="fe-t">Empresa</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-ficha">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2"><input type="hidden" id="fe-id">' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-n">Nombre empresa <span class="req">*</span></label><input class="fc" id="fe-n"></div>' +
          '<div class="fg"><label class="fl" for="fe-a">Alias</label><input class="fc" id="fe-a"></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-tier">Tier</label><select class="fc" id="fe-tier"></select></div>' +
          '<div class="fg"><label class="fl" for="fe-rb">Rubro</label><select class="fc" id="fe-rb"></select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-loc">Localidad</label><select class="fc" id="fe-loc"></select></div>' +
          '<div class="fg"><label class="fl" for="fe-prov">Provincia</label><select class="fc" id="fe-prov"></select></div></div>' +
        '<div class="fg"><label class="fl" for="fe-web">Web</label><input class="fc" id="fe-web" type="url"></div>' +
        '<div class="fg"><label class="fl" for="fe-logo">Logo (URL)</label><input class="fc" id="fe-logo" type="url" placeholder="https://…"></div>' +
        '<div class="fg"><label class="fl" for="fe-di">Carpeta de Drive (URL)</label><input class="fc" id="fe-di" type="url" placeholder="https://drive.google.com/drive/folders/…"></div>' +
      '</div>' +
      '<details class="desp" open><summary>Razones sociales <span id="fe-rs-n" class="u-s10-mt"></span></summary>' +
        '<div id="fe-rs"></div><div class="fe-pie"><button class="btn bg sm" data-acc="rs">' + ico('mas') + ' Agregar razón social</button></div></details>' +
      '<details class="desp" open><summary>Contactos <span id="fe-con-n" class="u-s10-mt"></span></summary>' +
        '<div id="fe-con"></div><div class="fe-pie"><button class="btn bg sm" data-acc="con">' + ico('mas') + ' Agregar contacto</button></div></details>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-ficha">Cancelar</button><button class="btn bp" id="fe-btn-s">Guardar</button></div>' +
    '</div></div>' +
    '<div class="mo" id="m-fe-ver"><div class="md">' +
      '<div class="mh"><span class="mt2" id="fe-ver-t">Empresa</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-fe-ver">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2" id="fe-ver-b"></div>' +
    '</div></div>' +
    '<div class="mo" id="m-fe-con"><div class="md md-sm">' +
      '<div class="mh"><span class="mt2" id="fe-c-t">Contacto</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-fe-con">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2"><input type="hidden" id="fe-c-id">' +
        '<div class="fg"><label class="fl" for="fe-c-emp">Empresa <span class="req">*</span></label><select class="fc" id="fe-c-emp"></select></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-c-n">Nombre <span class="req">*</span></label><input class="fc" id="fe-c-n"></div>' +
          '<div class="fg"><label class="fl" for="fe-c-ap">Apellido</label><input class="fc" id="fe-c-ap"></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-c-e">Email</label><input class="fc" id="fe-c-e" type="email"></div>' +
          '<div class="fg"><label class="fl" for="fe-c-tel">Celular</label><input class="fc" id="fe-c-tel" placeholder="+5491…"></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fe-c-ar">Área</label><select class="fc" id="fe-c-ar"></select></div>' +
          '<div class="fg"><label class="fl" for="fe-c-pu">Puesto</label><select class="fc" id="fe-c-pu"></select></div></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-fe-con">Cancelar</button><button class="btn bp" id="fe-c-s">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    document.body.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-acc]'); if (!a) return;
      var acc = a.getAttribute('data-acc');
      if (acc === 'rs') agregarRS();
      if (acc === 'con') agregarContacto();
      if (acc === 'quitar-rs') quitarRS(a);
      if (acc === 'quitar-con') { a.closest('.fe-bloque').remove(); contar(); }
      if (acc === 'editar') { closeM('m-fe-ver'); abrirFichaEmpresa(a.getAttribute('data-id'), { onSave: F.onSave }); }
      if (acc === 'contacto') { closeM('m-fe-ver'); abrirContacto(null, { empresa: a.getAttribute('data-id'), onSave: F.onSave }); }
    });
    document.getElementById('fe-btn-s').onclick = guardar;
    document.getElementById('fe-c-s').onclick = guardarContacto;
  });

  // ── datos: listas de CotConfig, tiers y empresas, en paralelo ──
  function lista(cfg, clave, respaldo) {
    var v = (cfg[clave] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return v.length ? v : (respaldo || []);
  }
  async function cargarBase(empresaId) {
    var q = [
      db().from('cot_config').select('clave,valor').in('clave', ['RazonSocial_CondicionFiscal', 'Empresa_Rubro', 'Empresa_Localidad', 'Empresa_Provincia', 'Contacto_AreaTrabajo', 'Contacto_Puesto']),
      db().from('tier').select('id').order('id'),
      db().from('empresas').select('id,nombre').order('nombre')
    ];
    if (empresaId) q.push(
      db().from('empresas').select('*').eq('id', empresaId).maybeSingle(),
      db().from('razones_sociales').select('*').eq('empresa_id', empresaId).order('por_defecto', { ascending: false }),
      db().from('contactos').select('*').eq('empresa_id', empresaId).order('nombre'),
      db().from('proyectos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId));
    var r = await Promise.all(q);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    var cfg = {}; r[0].data.forEach(function (c) { cfg[c.clave] = c.valor || ''; });
    F.L = {
      cf: lista(cfg, 'RazonSocial_CondicionFiscal', ['Responsable Inscripto', 'Monotributista', 'Exento']),
      rubros: lista(cfg, 'Empresa_Rubro', ['Tecnología', 'Salud', 'Retail', 'Finanzas', 'Otro']),
      localidades: lista(cfg, 'Empresa_Localidad'), provincias: lista(cfg, 'Empresa_Provincia'),
      areas: lista(cfg, 'Contacto_AreaTrabajo', ['IT', 'Comercial', 'Finanzas', 'RRHH', 'Dirección']),
      puestos: lista(cfg, 'Contacto_Puesto', ['CEO', 'CTO', 'Gerente', 'Analista', 'Otro'])
    };
    F.tiers = r[1].data.map(function (t) { return t.id; });
    F.empresas = r[2].data;
    return empresaId ? { e: r[3].data, razones: r[4].data, contactos: r[5].data, nProy: r[6].count || 0 } : null;
  }

  // ── ayudas de formulario ─────────────────────────────────────
  function opciones(arr, val, vacio) {
    arr = (arr || []).slice(); if (val && arr.indexOf(val) < 0) arr.push(val);   // no perder un valor viejo
    return '<option value="">' + esc(vacio || '—') + '</option>' +
           arr.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
  }
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }
  function contar() {
    $('fe-rs-n').textContent = '(' + document.querySelectorAll('#fe-rs .fe-bloque').length + ')';
    $('fe-con-n').textContent = '(' + document.querySelectorAll('#fe-con .fe-bloque').length + ')';
  }

  // ── ficha en edición ─────────────────────────────────────────
  window.abrirFichaEmpresa = async function (id, opts) {
    opts = opts || {}; F.onSave = opts.onSave || null; F.borrar = [];
    $('fe-t').textContent = id ? 'Editar empresa' : 'Nueva empresa';
    $('fe-rs').innerHTML = '<div class="loading"><div class="spin"></div></div>'; $('fe-con').innerHTML = '';
    openM('m-ficha');
    try {
      var d = await cargarBase(id || '');
      var e = (d && d.e) || {};
      $('fe-id').value = e.id || ''; $('fe-n').value = e.nombre || ''; $('fe-a').value = e.alias || '';
      $('fe-web').value = e.web || ''; $('fe-logo').value = e.logo || ''; $('fe-di').value = e.drive_interno || '';
      $('fe-tier').innerHTML = opciones(F.tiers, e.tier_id, '— Tier —');
      $('fe-rb').innerHTML = opciones(F.L.rubros, e.rubro, '— Rubro —');
      $('fe-loc').innerHTML = opciones(F.L.localidades, e.localidad, '— Localidad —');
      $('fe-prov').innerHTML = opciones(F.L.provincias, e.provincia, '— Provincia —');
      $('fe-rs').innerHTML = '';
      ((d && d.razones) || []).forEach(agregarRS);
      if (!e.id && !((d && d.razones) || []).length) agregarRS();            // el alta arranca con una
      ((d && d.contactos) || []).forEach(agregarContacto);
      if (opts.nuevoContacto || (!e.id && !((d && d.contactos) || []).length)) agregarContacto();
      contar();
    } catch (err) { closeM('m-ficha'); toast('No se pudo abrir la ficha: ' + err.message, 'err'); }
  };

  function agregarRS(x) {
    x = x || {};
    var primera = !document.querySelectorAll('#fe-rs .fe-bloque').length;
    var d = document.createElement('div'); d.className = 'fe-bloque'; d.setAttribute('data-id', x.id || '');
    d.innerHTML = '<button class="btn bg xs btn-ico fe-quitar" data-tip="Quitar" aria-label="Quitar razón social" data-acc="quitar-rs">' + ico('borrar') + '</button>' +
      '<div class="g2"><div class="fg"><label class="fl">Razón social <span class="req">*</span></label><input class="fc" data-k="razon" value="' + esc(x.nombre || '') + '" placeholder="Ej: Prodigy Diabetes Care S.R.L."></div>' +
      '<div class="fg"><label class="fl">CUIT</label><input class="fc" data-k="cuit" value="' + esc(x.cuit || '') + '" placeholder="30-12345678-9"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl">Condición fiscal</label><select class="fc" data-k="condicion">' + opciones(F.L.cf, x.condicion_fiscal) + '</select></div>' +
      '<div class="fg"><label class="fl">Dirección</label><input class="fc" data-k="direccion" value="' + esc(x.direccion || '') + '"></div></div>' +
      '<div class="fg"><label class="fl">Mail(s) de facturación</label><input class="fc" data-k="mail_fact" value="' + esc(x.mail_facturacion || '') + '" placeholder="correo1@…, correo2@…">' +
        '<div class="u-s10-mt-t3">A estos correos se envía la factura. Separá con coma si son dos.</div></div>' +
      '<label class="fg u-s11-mt fe-check"><input type="checkbox" data-k="defecto"' + ((x.por_defecto || (!x.id && primera)) ? ' checked' : '') + '> Por defecto para facturar</label>';
    d.querySelector('[data-k="defecto"]').onchange = function () {   // una sola por defecto
      if (this.checked) document.querySelectorAll('#fe-rs [data-k="defecto"]').forEach(function (o) { if (o !== this) o.checked = false; }, this);
    };
    $('fe-rs').appendChild(d); contar();
  }
  async function quitarRS(btn) {
    var b = btn.closest('.fe-bloque'), id = b.getAttribute('data-id');
    if (id && !(await ask('¿Eliminar esta razón social? Se borra al guardar.'))) return;
    if (id) F.borrar.push(id);
    b.remove(); contar();
  }
  function agregarContacto(c) {
    c = c || {};
    var d = document.createElement('div'); d.className = 'fe-bloque'; d.setAttribute('data-id', c.id || '');
    d.innerHTML = (c.id ? '' : '<button class="btn bg xs btn-ico fe-quitar" data-tip="Quitar" aria-label="Quitar contacto" data-acc="quitar-con">' + ico('borrar') + '</button>') +
      '<div class="g2"><div class="fg"><label class="fl">Nombre <span class="req">*</span></label><input class="fc" data-k="nombre" value="' + esc(c.nombre || '') + '"></div>' +
      '<div class="fg"><label class="fl">Apellido</label><input class="fc" data-k="apellido" value="' + esc(c.apellido || '') + '"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl">Email</label><input class="fc" data-k="email" type="email" value="' + esc(c.email || '') + '"></div>' +
      '<div class="fg"><label class="fl">Celular</label><input class="fc" data-k="telefono" value="' + esc(c.telefono || '') + '" placeholder="+5491…"></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl">Área</label><select class="fc" data-k="area">' + opciones(F.L.areas, c.area_trabajo) + '</select></div>' +
      '<div class="fg"><label class="fl">Puesto</label><select class="fc" data-k="puesto">' + opciones(F.L.puestos, c.puesto) + '</select></div></div>';
    $('fe-con').appendChild(d); contar();
    if (!c.id) setTimeout(function () { var n = d.querySelector('[data-k="nombre"]'); if (n) n.focus(); }, 50);
  }
  function leer(sel) {
    return Array.prototype.map.call(document.querySelectorAll(sel + ' .fe-bloque'), function (b) {
      var o = { id: b.getAttribute('data-id') || '' };
      b.querySelectorAll('[data-k]').forEach(function (el) { o[el.getAttribute('data-k')] = el.type === 'checkbox' ? el.checked : String(el.value || '').trim(); });
      return o;
    });
  }

  async function llamar(p) {
    var r = await db().rpc('guardar_ficha_empresa', { p: p });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  async function guardar() {
    var n = v('fe-n'); if (!n) return toast('Nombre de empresa obligatorio', 'err');
    var rs = leer('#fe-rs'), cons = leer('#fe-con');
    if (rs.some(function (x) { return !x.razon && (x.cuit || x.mail_fact || x.direccion); })) return toast('Falta el nombre de una razón social', 'err');
    if (cons.some(function (x) { return !x.nombre && (x.apellido || x.email || x.telefono); })) return toast('Falta el nombre de un contacto', 'err');
    var btn = $('fe-btn-s'); btn.disabled = true;
    var id = v('fe-id');
    try {
      var res = await llamar({
        empresa: { id: id, razon: n, alias: v('fe-a'), tier: v('fe-tier'), rubro: v('fe-rb'), localidad: v('fe-loc'),
                   provincia: v('fe-prov'), web: v('fe-web'), logo: v('fe-logo'), drive_int: v('fe-di') },
        razones: rs, borrarRazones: F.borrar, contactos: cons });
      closeM('m-ficha'); toast(id ? 'Empresa actualizada' : 'Empresa creada', 'ok');
      if (F.onSave) F.onSave(res);
    } catch (err) { toast(err.message, 'err'); }
    finally { btn.disabled = false; }
  }

  // ── ficha para mirar ─────────────────────────────────────────
  window.verFichaEmpresa = async function (id, opts) {
    opts = opts || {}; F.onSave = opts.onSave || null;
    var b = $('fe-ver-b'); b.innerHTML = '<div class="loading"><div class="spin"></div></div>';
    openM('m-fe-ver');
    try {
      var d = await cargarBase(id);
      if (!d.e) { b.innerHTML = '<div class="empty">No encontré la empresa.</div>'; return; }
      var e = d.e;
      $('fe-ver-t').textContent = e.nombre || 'Empresa';
      var dato = function (k, x) { return x ? '<div class="fe-dato"><div class="sec">' + esc(k) + '</div><div>' + esc(x) + '</div></div>' : ''; };
      var web = e.web ? (e.web.indexOf('http') === 0 ? e.web : 'https://' + e.web) : '';
      var h = '<div class="u-row8">' +
        (e.logo ? '<img class="emp-logo" src="' + esc(e.logo) + '" referrerpolicy="no-referrer" alt="">' : '<div class="emp-ini">' + esc((e.nombre || '?').charAt(0).toUpperCase()) + '</div>') +
        '<div class="u-f1m"><div class="emp-n">' + esc(e.nombre) + (e.alias ? ' <span class="u-s11-mt">(' + esc(e.alias) + ')</span>' : '') + '</div>' +
        '<div class="u-s11-mt">' + esc([e.rubro, e.localidad, e.provincia].filter(Boolean).join(' · ') || '—') + '</div></div>' +
        '<button class="btn bp sm" data-acc="editar" data-id="' + esc(e.id) + '">' + ico('editar') + ' Editar</button></div>';
      h += '<div class="fe-datos">' + dato('Tier', e.tier_id) + dato('Proyectos', d.nProy ? String(d.nProy) : '') + '</div>';
      if (e.drive_interno || web) h += '<div class="u-row6 u-mt6">' +
        (e.drive_interno ? '<a class="btn bg xs" href="' + esc(e.drive_interno) + '" target="_blank" rel="noopener">' + ico('carpeta') + ' Drive</a>' : '') +
        (web ? '<a class="btn bg xs" href="' + esc(web) + '" target="_blank" rel="noopener">' + ico('link') + ' Web</a>' : '') + '</div>';
      h += '<div class="sec u-mt10">Razones sociales (' + d.razones.length + ')</div>' +
        (d.razones.map(function (x) {
          return '<div class="fe-linea"><div class="emp-n">' + esc(x.nombre) + (x.por_defecto ? ' <span class="est"><span class="est-dot e-xg"></span><span class="t-xg">por defecto</span></span>' : '') + '</div>' +
                 '<div class="u-s11-mt">' + esc(['CUIT ' + (x.cuit || '—'), x.condicion_fiscal, x.mail_facturacion].filter(Boolean).join(' · ')) + '</div></div>';
        }).join('') || '<div class="empty">Sin razones sociales.</div>');
      h += '<div class="u-row8 u-mt10"><span class="sec">Contactos (' + d.contactos.length + ')</span>' +
           '<button class="btn bg xs u-mla" data-acc="contacto" data-id="' + esc(e.id) + '">' + ico('mas') + ' Contacto</button></div>' +
        (d.contactos.map(function (c) {
          var wp = String(c.telefono || '').replace(/[^0-9]/g, '');
          return '<div class="fe-linea u-row8"><div class="u-f1m"><div class="emp-n">' + esc(((c.nombre || '') + ' ' + (c.apellido || '')).trim()) + '</div>' +
                 '<div class="u-s11-mt">' + esc([c.puesto, c.area_trabajo, c.email, c.telefono].filter(Boolean).join(' · ') || '—') + '</div></div>' +
                 (c.email ? '<a class="btn bg xs btn-ico" href="mailto:' + esc(c.email) + '" data-tip="Mail" aria-label="Mail">' + ico('mail') + '</a>' : '') +
                 (wp ? '<a class="btn bg xs btn-ico" href="https://wa.me/' + wp + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + ico('whatsapp') + '</a>' : '') + '</div>';
        }).join('') || '<div class="empty">Sin contactos.</div>');
      b.innerHTML = h;
    } catch (err) { b.innerHTML = '<div class="empty">No se pudo abrir: ' + esc(err.message) + '</div>'; }
  };

  // ── un contacto suelto ───────────────────────────────────────
  window.abrirContacto = async function (c, opts) {
    c = c || {}; opts = opts || {}; F.onSave = opts.onSave || null;
    $('fe-c-t').textContent = c.id ? 'Editar contacto' : 'Nuevo contacto';
    $('fe-c-id').value = c.id || ''; $('fe-c-n').value = c.nombre || ''; $('fe-c-ap').value = c.apellido || '';
    $('fe-c-e').value = c.email || ''; $('fe-c-tel').value = c.telefono || '';
    openM('m-fe-con');
    try {
      await cargarBase('');
      var sel = c.empresa_id || opts.empresa || '';
      $('fe-c-emp').innerHTML = '<option value="">— Elegí la empresa —</option>' +
        F.empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === sel ? ' selected' : '') + '>' + esc(e.nombre) + '</option>'; }).join('');
      $('fe-c-ar').innerHTML = opciones(F.L.areas, c.area_trabajo);
      $('fe-c-pu').innerHTML = opciones(F.L.puestos, c.puesto);
    } catch (err) { closeM('m-fe-con'); toast('No se pudo abrir el contacto: ' + err.message, 'err'); }
  };
  async function guardarContacto() {
    var n = v('fe-c-n'), emp = v('fe-c-emp');
    if (!n) return toast('Nombre obligatorio', 'err');
    if (!emp) return toast('Elegí la empresa', 'err');
    var id = v('fe-c-id'), btn = $('fe-c-s'); btn.disabled = true;
    try {
      var res = await llamar({ empresa: { id: emp }, contactos: [{ id: id, nombre: n, apellido: v('fe-c-ap'),
        email: v('fe-c-e'), telefono: v('fe-c-tel'), area: v('fe-c-ar'), puesto: v('fe-c-pu') }] });
      closeM('m-fe-con'); toast(id ? 'Contacto actualizado' : 'Contacto creado', 'ok');
      if (F.onSave) F.onSave(res);
    } catch (err) { toast(err.message, 'err'); }
    finally { btn.disabled = false; }
  }
})();

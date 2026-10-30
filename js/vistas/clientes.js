/* ══════════════════════════════════════════════════════════════════════
   vistas/clientes.js · Clientes, Empresas y Contactos
   ──────────────────────────────────────────────────────────────────────
   Reemplaza CRM_Index.html del Apps Script. Los números y el estado de cada
   cliente vienen hechos de la base (crm_giwa.v_clientes = getClientesCRM,
   validado contra el Apps Script): acá no se suma nada.

   Tres pestañas sobre los mismos datos, que se piden una sola vez y en
   paralelo. Cambiar de pestaña o filtrar no vuelve a pedir nada.

   29/10/2026: una sola entrada en el menú, Clientes, con dos pestañas:
   Empresas (tarjetas: el nombre abre la ficha en lectura; acciones rápidas
   + Contacto y + Razón social) y Contactos (agenda alfabética). Contratado,
   saldo y último contacto, que estaban en la tabla, pasan a la tarjeta.

   Colores de estado según el Design System (22/10/2026), no los de la
   pantalla vieja: prospecto y detenido gris, abono violeta, cliente
   celeste, deuda vencida rojo (es un vencimiento).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var D = null;                     // los datos de la base
  var pest = 'cli', filtro = 'todos', busca = '';

  var EST = {                       // estado del cliente → color (sufijo del Design System)
    'prospecto': 'xm', 'detenido': 'xd', 'cliente': 'xb', 'abono activo': 'xv', 'deuda vencida': 'xr'
  };
  var FILTROS = [['todos', 'Todos'], ['abono', 'Con abono'], ['deuda', 'Con deuda'], ['prospecto', 'Prospectos']];

  async function cargar() {
    var r = await Promise.all([
      db().from('empresas').select('id,nombre,alias,tier_id,logo,web,rubro,localidad,provincia,tipo,drive_interno').order('nombre'),
      db().from('contactos').select('id,nombre,apellido,empresa_id,email,telefono,area_trabajo,puesto').order('nombre'),
      db().from('v_clientes').select('*'),
      db().from('tier').select('id,multiplicador,empresa').order('id'),
      db().from('proyectos').select('empresa_id')
    ]);
    var err = r.find(function (x) { return x.error; });
    if (err) throw new Error(err.error.message);
    var cli = {}; r[2].data.forEach(function (c) { cli[c.empresa_id] = c; cli[c.empresa] = c; });
    var nProy = {}; r[4].data.forEach(function (p) { if (p.empresa_id) nProy[p.empresa_id] = (nProy[p.empresa_id] || 0) + 1; });
    D = { emps: r[0].data, cons: r[1].data, cli: cli, tiers: r[3].data, nProy: nProy };
  }
  var PEST = ['cli', 'con'];

  // ── ayudas ───────────────────────────────────────────────────
  function clienteDe(e) { return D.cli[e.id] || D.cli[e.nombre] || { estado: 'prospecto' }; }
  function tierCorto(t) { return String(t || '').replace(/^tier\s*/i, 'T') || '—'; }
  function hace(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), h = new Date(); h.setHours(0, 0, 0, 0);
    var n = Math.round((h - d) / 864e5);
    return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días';
  }
  function pasaFiltro(g) {
    if (filtro === 'abono') return g.estado === 'abono activo';
    if (filtro === 'deuda') return g.estado === 'deuda vencida';
    if (filtro === 'prospecto') return g.estado === 'prospecto';
    return true;
  }
  function estado(e) {
    var s = EST[e] || 'xm';
    return '<span class="est"><span class="est-dot e-' + s + '"></span><span class="t-' + s + '">' + esc(e) + '</span></span>';
  }
  // Logo de Drive; si no se puede ver (archivo sin compartir: 403), la inicial
  function logo(e, sm) {
    var ini = '<div class="emp-ini' + (sm ? ' sm' : '') + '">' + esc((e.nombre || '?').charAt(0).toUpperCase()) + '</div>';
    if (!e.logo) return ini;
    return '<img class="emp-logo" src="' + esc(e.logo) + '" referrerpolicy="no-referrer" alt="" ' +
           'onerror="this.outerHTML=this.getAttribute(\'data-ini\')" data-ini="' + esc(ini) + '">';
  }
  function consDe(e) { return D.cons.filter(function (c) { return c.empresa_id === e.id; }); }
  // Botón-ícono que abre algo (Design System: nada se abre sin un ícono visible)
  function bIco(acc, id, icono, tip) {
    return '<button class="btn bg xs btn-ico" data-' + acc + '="' + esc(id) + '" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + ico(icono) + '</button>';
  }
  function coincide(texto) { return !busca || String(texto || '').toLowerCase().indexOf(busca) >= 0; }

  // ── las pestañas ─────────────────────────────────────────────
  function htmlClientes() {
    var ley = D.tiers.length
      ? '<p class="u-s11-mt">Tier = tamaño del cliente; multiplica el valor hora al cotizar: ' +
        D.tiers.map(function (t) { return tierChip(t.id) + ' ' + esc(t.empresa || '—') + ' <span class="m">×' + String(t.multiplicador).replace('.', ',') + '</span>'; }).join(' · ') + '</p>'
      : '';
    var fil = '<div class="filtros u-mb8" role="group" aria-label="Filtro">' + FILTROS.map(function (f) {
      return '<button class="ptab' + (filtro === f[0] ? ' on' : '') + '" data-filtro="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var filas = D.emps.filter(function (e) {
      var g = clienteDe(e);
      return pasaFiltro(g) && coincide([e.nombre, e.alias, e.rubro, e.localidad, e.provincia, g.estado].join(' '));
    });
    if (!filas.length) return fil + ley + '<div class="empty">Ninguna empresa con este filtro.</div>';
    return fil + ley + htmlEmpresas(filas);
  }

  function htmlEmpresas(lista) {
    return '<div class="emp-grid">' + lista.map(function (e) {
      var n = consDe(e).length, np = D.nProy[e.id] || 0, g = clienteDe(e);
      var web = e.web ? (e.web.indexOf('http') === 0 ? e.web : 'https://' + e.web) : '';
      var lugar = [e.localidad, e.provincia].filter(Boolean).join(', ');
      return '<div class="card"><div class="u-p1214">' +
        '<div class="u-row8">' + logo(e) + '<div class="u-f1m"><button class="emp-n emp-link" data-ver="' + esc(e.id) + '" data-tip="Ver la ficha">' + esc(e.nombre) + '</button>' +
          '<div class="u-s11-mt">' + esc([e.rubro, lugar].filter(Boolean).join(' · ') || '—') + '</div></div></div>' +
        '<div class="u-row8 u-mt6">' + tierChip(e.tier_id) + estado(g.estado) + '</div>' +
        (g.estado === 'prospecto' ? '' : '<div class="emp-plata u-mt6"><span>Contratado <b class="m m-contratado">' + fmt(g.contratado) + '</b></span>' +
          '<span>Saldo <b class="m m-pendiente">' + fmt(g.saldo) + '</b></span></div>') +
        '<div class="u-s11-mt u-mt6">Último contacto: ' + hace(g.ultimo) + '</div>' +
        // Los contactos, en viñetas: nombre · puesto con WhatsApp y mail (cada ícono sólo si hay dato)
        (n ? '<ul class="emp-cons">' + consDe(e).map(function (c) {
          var wp = String(c.telefono || '').replace(/[^0-9]/g, '');
          return '<li><span class="u-f1m">' + esc([((c.nombre || '') + ' ' + (c.apellido || '')).trim(), c.puesto].filter(Boolean).join(' · ')) + '</span>' +
            (wp ? '<a class="btn bg xs btn-ico" href="https://wa.me/' + wp + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + ico('whatsapp') + '</a>' : '') +
            (c.email ? '<a class="btn bg xs btn-ico" href="mailto:' + esc(c.email) + '" data-tip="' + esc(c.email) + '" aria-label="Mail">' + ico('mail') + '</a>' : '') + '</li>';
        }).join('') + '</ul>' : '<div class="u-s11-mt u-mt6">Sin contactos.</div>') +
        '<div class="u-s11-mt u-mt4"><span class="m">' + np + '</span> proyecto' + (np !== 1 ? 's' : '') + '</div>' +
        '<div class="u-row6 u-mt8">' +
          '<button class="btn bsec xs" data-addcon="' + esc(e.id) + '">' + ico('contacto') + ' Contacto</button>' +
          '<button class="btn bsec xs" data-addrs="' + esc(e.id) + '">' + ico('mas') + ' Razón social</button>' +
          (e.drive_interno ? '<a class="lnk lnk-dr u-mla" href="' + esc(e.drive_interno) + '" target="_blank" rel="noopener">' + ico('carpeta') + 'DRIVE</a>' : '') +
          (web ? '<a class="lnk' + (e.drive_interno ? '' : ' u-mla') + '" href="' + esc(web) + '" target="_blank" rel="noopener">' + ico('web') + 'WEB</a>' : '') +
        '</div>' +
      '</div></div>';
    }).join('') + '</div>';
  }

  // Contactos: tabla ordenable (por defecto, apellido A→Z). Clic en la fila = verlo;
  // desde ahí se edita. Si le falta mail o teléfono, la fila ofrece «+ Mail» / «+ Teléfono».
  var CON = { ord: 'apellido', asc: true };
  var CON_COL = [['apellido', 'Apellido'], ['nombre', 'Nombre'], ['empresa', 'Empresa'], ['puesto', 'Puesto'], ['email', 'Mail'], ['telefono', 'Teléfono']];
  function htmlContactos() {
    var emp = {}; D.emps.forEach(function (e) { emp[e.id] = e.nombre; });
    var L = D.cons.map(function (c) { return Object.assign({}, c, { empresa: emp[c.empresa_id] || 'Sin empresa' }); })
      .filter(function (c) { return coincide([c.nombre, c.apellido, c.empresa, c.puesto, c.area_trabajo, c.email, c.telefono].join(' ')); })
      .sort(function (a, b) {
        var k = CON.ord, r = String(a[k] || '').localeCompare(String(b[k] || ''), 'es', { sensitivity: 'base' }) ||
          String(a.apellido || '').localeCompare(String(b.apellido || ''), 'es') || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
        if (!a[k] !== !b[k]) return a[k] ? -1 : 1;     // los vacíos, siempre al final
        return CON.asc ? r : -r;
      });
    if (!L.length) return '<div class="empty">Ningún contacto coincide.</div>';
    return '<div class="card u-p0 u-ovx"><table class="tbl con-tbl"><thead><tr>' + CON_COL.map(function (c) {
        return '<th class="rec-th" data-cord="' + c[0] + '">' + c[1] + (CON.ord === c[0] ? ' ' + ico(CON.asc ? 'arriba' : 'abajo') : '') + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      L.map(function (c) {
        var wp = String(c.telefono || '').replace(/[^0-9]/g, ''), id = esc(c.id);
        return '<tr class="con-fila" data-cver="' + id + '"><td class="u-fw6">' + esc(c.apellido || '') + '</td><td>' + esc(c.nombre || '') + '</td>' +
          '<td>' + esc(c.empresa) + '</td><td class="u-c-mt">' + esc(c.puesto || '') + '</td>' +
          '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '<button class="btn bg xs" data-cadd="fe-c-e" data-id="' + id + '">' + ico('mas') + ' Mail</button>') + '</td>' +
          '<td class="m">' + (c.telefono ? esc(c.telefono) : '<button class="btn bg xs" data-cadd="fe-c-tel" data-id="' + id + '">' + ico('mas') + ' Teléfono</button>') + '</td>' +
          '<td class="u-tr">' + (wp ? '<a class="btn bg xs btn-ico" href="https://wa.me/' + wp + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + ico('whatsapp') + '</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  // Ver un contacto (sólo lectura); «Editar» abre el formulario de siempre (abrirContacto)
  function verContacto(c, alGuardar) {
    var m = document.getElementById('m-con-ver');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-con-ver'; document.body.appendChild(m); }
    var e = D.emps.find(function (x) { return x.id === c.empresa_id; }), wp = String(c.telefono || '').replace(/[^0-9]/g, '');
    var kv = function (l, v) { return '<div class="con-kv"><span class="u-s11-mt">' + l + '</span><span>' + (v || '<span class="u-c-mt">—</span>') + '</span></div>'; };
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">' + esc(((c.nombre || '') + ' ' + (c.apellido || '')).trim() || 'Contacto') + '</span>' +
      '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-con-ver">' + ico('cerrar') + '</button></div><div class="mb2">' +
      kv('Empresa', esc(e ? e.nombre : 'Sin empresa')) + kv('Puesto', esc(c.puesto || '')) + kv('Área', esc(c.area_trabajo || '')) +
      kv('Mail', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
      kv('Teléfono', c.telefono ? '<span class="m">' + esc(c.telefono) + '</span>' + (wp ? ' <a class="btn bg xs btn-ico" href="https://wa.me/' + wp + '" target="_blank" rel="noopener" data-tip="WhatsApp" aria-label="WhatsApp">' + ico('whatsapp') + '</a>' : '') : '') +
      '</div><div class="mf"><button class="btn bg" data-cerrar="m-con-ver">Cerrar</button><button class="btn bp" id="con-ver-ed">' + ico('editar') + ' Editar</button></div></div>';
    document.getElementById('con-ver-ed').onclick = function () { closeM('m-con-ver'); abrirContacto(c, alGuardar); };
    openM('m-con-ver');
  }

  // ── exportar lo que se ve (respeta el filtro) ────────────────
  function exportar() {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var L = [['Empresa', 'Tier', 'Estado', 'Contratado', 'Saldo', 'Último contacto'].map(q).join(';')];
    D.emps.forEach(function (e) {
      var g = clienteDe(e); if (!pasaFiltro(g)) return;
      L.push([e.nombre, e.tier_id, g.estado, g.contratado || 0, g.saldo || 0, g.ultimo || ''].map(q).join(';'));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'clientes.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ── pintar ───────────────────────────────────────────────────
  // Las pestañas están en el menú lateral (marcarSub lo mantiene al día)
  function pintar(el) {
    if (_montado !== 'clientes' || !el.querySelector('#cli-cuerpo')) return;
    marcarSub(pest);
    var tabs = '<div class="filtros cli-tabs" role="group" aria-label="Vista">' + [['cli', 'Empresas'], ['con', 'Contactos']].map(function (t) {
      return '<button class="ptab' + (pest === t[0] ? ' on' : '') + '" data-pest="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    el.querySelector('#cli-cuerpo').innerHTML = tabs + (pest === 'con' ? htmlContactos() : htmlClientes());
    el.querySelector('#cli-exportar').hidden = pest !== 'cli';
    el.querySelector('#cli-nuevo').innerHTML = (pest === 'con' ? ico('contacto') + ' Nuevo contacto' : ico('empresa') + ' Nueva empresa');
  }

  VISTAS.clientes = async function (el, op) {
    var p = subPedida(); if (p === 'emp') pest = 'cli'; else if (PEST.indexOf(p) >= 0) pest = p;
    el.innerHTML =
      uiHd('Clientes', 'Empresas, su estado y sus contactos.',
        '<input class="fc" id="cli-q" placeholder="Buscar empresa o contacto…" aria-label="Buscar">' +
        '<button class="btn bg" id="cli-exportar">Exportar</button><button class="btn bp" id="cli-nuevo"></button>') +
      '<div id="cli-cuerpo"><div class="u-s11-mt">Cargando…</div></div>';
    el.querySelector('#cli-q').value = busca;
    // con datos ya leídos pinta en el acto y relee por detrás
    if (D && !(op && op.forzar)) { pintar(el); var antes = JSON.stringify(D); cargar().then(function () { if (JSON.stringify(D) !== antes) pintar(el); }).catch(function () {}); }
    else { await cargar(); pintar(el); }
    // después de guardar en la ficha: releer y repintar, sin perder pestaña ni filtro
    var alGuardar = { onSave: async function () { await cargar(); pintar(el); } };
    el.onclick = function (ev) {
      if (ev.target.closest('a')) return;            // mail y WhatsApp: el link, sin abrir la ficha
      var b = ev.target.closest('[data-filtro],[data-pest],[data-ver],[data-ed],[data-con],[data-addcon],[data-addrs],[data-cord],[data-cadd],[data-cver],#cli-exportar,#cli-nuevo');
      if (!b) return;
      if (b.id === 'cli-exportar') return exportar();
      if (b.id === 'cli-nuevo') return pest === 'con' ? abrirContacto(null, alGuardar) : abrirFichaEmpresa('', alGuardar);
      if (b.hasAttribute('data-ver')) return verFichaEmpresa(b.getAttribute('data-ver'), alGuardar);
      if (b.hasAttribute('data-ed')) return abrirFichaEmpresa(b.getAttribute('data-ed'), alGuardar);
      if (b.hasAttribute('data-con')) {
        var id = b.getAttribute('data-con');
        return abrirContacto(D.cons.find(function (c) { return c.id === id; }), alGuardar);
      }
      if (b.hasAttribute('data-filtro')) filtro = b.getAttribute('data-filtro');
      if (b.hasAttribute('data-pest')) { pest = b.getAttribute('data-pest'); marcarSub(pest); }
      var cc = function (id) { return D.cons.find(function (c) { return c.id === id; }); };
      if (b.hasAttribute('data-cord')) { var k = b.getAttribute('data-cord'); CON.asc = CON.ord === k ? !CON.asc : true; CON.ord = k; return pintar(el); }
      if (b.hasAttribute('data-cadd')) {
        var campo = b.getAttribute('data-cadd');
        return abrirContacto(cc(b.getAttribute('data-id')), alGuardar).then(function () { var f = document.getElementById(campo); if (f) f.focus(); });
      }
      if (b.hasAttribute('data-cver')) return verContacto(cc(b.getAttribute('data-cver')), alGuardar);
      if (b.hasAttribute('data-addcon')) return abrirContacto(null, Object.assign({ empresa: b.getAttribute('data-addcon') }, alGuardar));
      if (b.hasAttribute('data-addrs')) return abrirFichaEmpresa(b.getAttribute('data-addrs'), Object.assign({ nuevaRS: true }, alGuardar));
      pintar(el);
    };
    el.querySelector('#cli-q').oninput = function () { busca = this.value.toLowerCase().trim(); pintar(el); };
  };
  // Del menú lateral: otra pestaña, sin releer
  VISTAS.clientes.irA = function (s) { if (s === 'emp' || !s) s = 'cli'; if (PEST.indexOf(s) < 0) return; pest = s; pintar(document.getElementById('vista')); window.scrollTo(0, 0); };
  VISTAS.clientes.precargar = cargar;
})();

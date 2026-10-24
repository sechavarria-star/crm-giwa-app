/* ══════════════════════════════════════════════════════════════════════
   vistas/clientes.js · Clientes, Empresas y Contactos
   ──────────────────────────────────────────────────────────────────────
   Reemplaza CRM_Index.html del Apps Script. Los números y el estado de cada
   cliente vienen hechos de la base (crm_giwa.v_clientes = getClientesCRM,
   validado contra el Apps Script): acá no se suma nada.

   Tres pestañas sobre los mismos datos, que se piden una sola vez y en
   paralelo. Cambiar de pestaña o filtrar no vuelve a pedir nada.

   Colores de estado según el Design System (22/10/2026), no los de la
   pantalla vieja: prospecto y detenido gris, abono violeta, cliente
   celeste, deuda vencida rojo (es un vencimiento).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var D = null;                     // los datos de la base
  var pest = 'cli', filtro = 'todos', busca = '';

  var EST = {                       // estado del cliente → color (sufijo del Design System)
    'prospecto': 'xm', 'detenido': 'xm', 'cliente': 'xb', 'abono activo': 'xv', 'deuda vencida': 'xr'
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
  var PEST = ['cli', 'emp', 'con'];

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
        D.tiers.map(function (t) { return esc(tierCorto(t.id)) + ' ' + esc(t.empresa || '—') + ' ×' + String(t.multiplicador).replace('.', ','); }).join(' · ') + '</p>'
      : '';
    var fil = '<div class="filtros" role="group" aria-label="Filtro">' + FILTROS.map(function (f) {
      return '<button class="ptab' + (filtro === f[0] ? ' on' : '') + '" data-filtro="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var filas = D.emps.filter(function (e) {
      var g = clienteDe(e);
      return pasaFiltro(g) && coincide(e.nombre + ' ' + (e.alias || '') + ' ' + g.estado);
    });
    if (!filas.length) return fil + ley + '<div class="empty">Ninguna empresa con este filtro.</div>';
    var h = '<div class="card u-p0"><table class="tbl"><thead><tr><th>Empresa</th><th>Tier</th><th>Estado</th>' +
            '<th class="u-tr">Contratado</th><th class="u-tr">Saldo</th><th>Último contacto</th><th></th></tr></thead><tbody>';
    filas.forEach(function (e) {
      var g = clienteDe(e), pros = g.estado === 'prospecto';
      h += '<tr><td class="emp-n">' + esc(e.nombre) + '</td>' +
           '<td>' + esc(tierCorto(e.tier_id)) + '</td>' +
           '<td>' + estado(g.estado) + '</td>' +
           '<td class="m m-contratado u-tr">' + (pros ? '—' : fmt(g.contratado)) + '</td>' +
           '<td class="m m-pendiente u-tr">' + (pros ? '—' : fmt(g.saldo)) + '</td>' +
           '<td class="u-c-mt">' + hace(g.ultimo) + '</td>' +
           '<td class="u-tr">' + bIco('ver', e.id, 'abrir', 'Abrir ficha') + '</td></tr>';
    });
    return fil + ley + h + '</tbody></table></div>';
  }

  function htmlEmpresas() {
    var lista = D.emps.filter(function (e) { return coincide([e.nombre, e.alias, e.rubro, e.localidad].join(' ')); });
    if (!lista.length) return '<div class="empty">Ninguna empresa coincide.</div>';
    return '<div class="emp-grid">' + lista.map(function (e) {
      var n = consDe(e).length, np = D.nProy[e.id] || 0;
      var web = e.web ? (e.web.indexOf('http') === 0 ? e.web : 'https://' + e.web) : '';
      return '<div class="card"><div class="u-p1214">' +
        '<div class="u-row8">' + logo(e) + '<div class="u-f1m"><div class="emp-n">' + esc(e.nombre) + '</div>' +
          '<div class="u-s11-mt">' + esc([e.rubro, e.localidad].filter(Boolean).join(' · ') || '—') + '</div></div>' +
          bIco('ver', e.id, 'abrir', 'Abrir ficha') + bIco('ed', e.id, 'editar', 'Editar empresa') + '</div>' +
        '<div class="u-s11-mt u-mt6">' + [e.tier_id, n ? n + ' contacto' + (n !== 1 ? 's' : '') : '',
          np ? np + ' proyecto' + (np !== 1 ? 's' : '') : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
        ((e.drive_interno || web) ? '<div class="u-row6 u-mt6">' +
          (e.drive_interno ? '<a class="btn bg xs" href="' + esc(e.drive_interno) + '" target="_blank" rel="noopener">' + ico('carpeta') + ' Drive</a>' : '') +
          (web ? '<a class="btn bg xs" href="' + esc(web) + '" target="_blank" rel="noopener">' + ico('link') + ' Web</a>' : '') +
        '</div>' : '') +
      '</div></div>';
    }).join('') + '</div>';
  }

  function htmlContactos() {
    var grupos = D.emps.map(function (e) { return { e: e, cs: consDe(e) }; });
    var ids = {}; D.emps.forEach(function (e) { ids[e.id] = 1; });
    var sueltos = D.cons.filter(function (c) { return !ids[c.empresa_id]; });
    if (sueltos.length) grupos.push({ e: { nombre: '— Sin empresa —' }, cs: sueltos });
    var h = '';
    grupos.forEach(function (g) {
      var porEmpresa = coincide(g.e.nombre);
      var cs = g.cs.filter(function (c) {
        return porEmpresa || coincide([c.nombre, c.apellido, c.puesto, c.area_trabajo, c.email].join(' '));
      });
      if (!cs.length) return;
      h += '<div class="u-mb12"><div class="con-grupo-h">' + logo(g.e, true) + '<span>' + esc(g.e.nombre) + '</span>' +
           '<span class="u-s10-mt">' + cs.length + '</span></div><div class="con-grid">';
      cs.forEach(function (c) {
        var nom = ((c.nombre || '') + ' ' + (c.apellido || '')).trim(), wp = String(c.telefono || '').replace(/[^0-9]/g, '');
        h += '<div class="card u-p1214"><div class="u-row8"><div class="emp-n u-f1m">' + esc(nom) + '</div>' + bIco('con', c.id, 'editar', 'Editar contacto') + '</div>' +
             '<div class="u-s10-mt">' + esc([c.puesto, c.area_trabajo].filter(Boolean).join(' · ') || '—') + '</div>' +
             ((c.email || wp) ? '<div class="u-row6 u-mt6">' +
               (c.email ? '<a class="btn bg xs" href="mailto:' + esc(c.email) + '" title="' + esc(c.email) + '">' + ico('mail') + ' Mail</a>' : '') +
               (wp ? '<a class="btn bg xs" href="https://wa.me/' + wp + '" target="_blank" rel="noopener" title="' + esc(c.telefono) + '">' + ico('whatsapp') + ' WhatsApp</a>' : '') +
             '</div>' : '') + '</div>';
      });
      h += '</div></div>';
    });
    return h || '<div class="empty">Ningún contacto coincide.</div>';
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
    set('cli-tit', { cli: 'Clientes', emp: 'Empresas', con: 'Contactos' }[pest]);
    var cuerpo = pest === 'emp' ? htmlEmpresas() : pest === 'con' ? htmlContactos() : htmlClientes();
    el.querySelector('#cli-cuerpo').innerHTML = cuerpo;
    el.querySelector('#cli-exportar').hidden = pest !== 'cli';
    el.querySelector('#cli-nuevo').innerHTML = ico('mas') + (pest === 'con' ? ' Nuevo contacto' : ' Nueva empresa');
  }

  VISTAS.clientes = async function (el, op) {
    var p = subPedida(); if (PEST.indexOf(p) >= 0) pest = p;
    el.innerHTML =
      '<div class="page-h"><div><h2 id="cli-tit">Clientes</h2><div class="page-s">Empresas, su estado y sus contactos.</div></div>' +
        '<div class="u-row8"><input class="fc" id="cli-q" placeholder="Buscar empresa o contacto…" aria-label="Buscar">' +
        '<button class="btn bg" id="cli-exportar">Exportar</button><button class="btn bp" id="cli-nuevo"></button></div></div>' +
      '<div id="cli-cuerpo"><div class="u-s11-mt">Cargando…</div></div>';
    el.querySelector('#cli-q').value = busca;
    // con datos ya leídos pinta en el acto y relee por detrás
    if (D && !(op && op.forzar)) { pintar(el); var antes = JSON.stringify(D); cargar().then(function () { if (JSON.stringify(D) !== antes) pintar(el); }).catch(function () {}); }
    else { await cargar(); pintar(el); }
    // después de guardar en la ficha: releer y repintar, sin perder pestaña ni filtro
    var alGuardar = { onSave: async function () { await cargar(); pintar(el); } };
    el.onclick = function (ev) {
      var b = ev.target.closest('[data-filtro],[data-ver],[data-ed],[data-con],#cli-exportar,#cli-nuevo');
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
      pintar(el);
    };
    el.querySelector('#cli-q').oninput = function () { busca = this.value.toLowerCase().trim(); pintar(el); };
  };
  // Del menú lateral: otra pestaña, sin releer
  VISTAS.clientes.irA = function (s) { if (PEST.indexOf(s) < 0) return; pest = s; pintar(document.getElementById('vista')); window.scrollTo(0, 0); };
  VISTAS.clientes.precargar = cargar;
})();

/* ══════════════════════════════════════════════════════════════════════
   vistas/admin.js · Administración
   ──────────────────────────────────────────────────────────────────────
   Reemplaza Admin_Index.html + _ResumenAdm.html. Dashboard, Facturación y
   Gastos (27/10: guardar_gasto · borrar_gasto · v_prorrateo_gastos); las otras
   vistas (IPC y TC, Impuestos, Tipos) abren el CRM actual hasta que pasen.

   Dashboard: cada número sale de una vista de la base, validada contra
   getResumenAdmin. Acá no se suma plata: sólo se agrupa y se muestra (los
   totales de una lista son la suma de lo que la vista ya calculó).

   Orden de la plata: tablero → qué falta cobrar → qué ajustar → qué
   facturar → qué transferirle al socio → otros recordatorios → gastos.

   «Faltan recordatorios» = crearRecordatorios (crm_giwa.v_recordatorios_faltan
   y crear_recordatorios).

   PENDIENTE: «Facturar» (Cargar factura y mail, al final de la etapa 4) y
   la ventana de ajuste IPC y Renovar.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var A = { d: null, sub: 'dash', gastosMes: null, abiertos: {}, f: null, ff: { q: '', emp: '', dep: '', own: '' }, recAbierto: false,
            gf: { cat: '', pag: '', rec: '', q: '' } };
  var SUBS = [['dash', 'Dashboard'], ['fact', 'Facturación'], ['gastos', 'Gastos'], ['idx', 'IPC y TC'], ['imp', 'Impuestos'], ['tip', 'Tipos de desarrollo']];

  async function cargar() {
    var q = [
      db().from('v_cobros_pendientes').select('*').order('dias', { ascending: false, nullsFirst: false }),
      db().from('v_facturar_mensuales').select('*').order('empresa'),
      db().from('v_facturar_saldos').select('*').order('saldo', { ascending: false }),
      db().from('v_cobros_sin_desarrollo').select('*'),
      db().from('v_ajustes_ipc').select('*').order('meses', { ascending: false }),
      db().from('v_reparto_socio').select('*').order('deposito'),
      db().from('v_alertas_admin').select('*').order('fecha'),
      db().from('v_gastos_plata').select('*'),
      db().from('indices_ipc').select('mes').not('ipc', 'is', null).order('mes', { ascending: false }).limit(1),
      db().rpc('umbral', { clave: 'alerta_cobro_vencido_dias', por_defecto: 30 }),
      db().from('v_recordatorios_faltan').select('*').order('o').order('ord'),
      db().from('v_prorrateo_gastos').select('*').maybeSingle(),
      db().from('usuarios').select('mail,nombre').eq('es_giwa', true).eq('activo', true).order('orden')
    ];
    var r = await Promise.all(q);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    A.d = { cobros: r[0].data, mens: r[1].data, saldos: r[2].data, sinDes: r[3].data, aj: r[4].data,
            rep: r[5].data, alertas: r[6].data, gastos: r[7].data,
            ultimoIpc: (r[8].data[0] || {}).mes || '', diasVenc: Number(r[9].data) || 30, faltan: r[10].data,
            pro: r[11].data || {}, users: r[12].data };
  }

  // ── ayudas ───────────────────────────────────────────────────
  function suma(arr, k) { return arr.reduce(function (a, x) { return a + (Number(x[k]) || 0); }, 0); }
  function n(x, s, p) { return x + ' ' + (x === 1 ? s : (p || s + 's')); }
  function viejo() { return '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">'; }
  // Sección plegable con el conteo y el total en el título; recuerda si estaba abierta
  function sec(k, tit, cnt, extra, cuerpo) {
    return '<details class="desp adm-desp" data-sec="' + esc(k) + '"' + (A.abiertos[k] ? ' open' : '') + '><summary>' +
      '<span class="adm-flecha">' + ico('derecha') + '</span><span class="adm-tit">' + tit + '</span><span class="cnt">' + cnt + '</span>' +
      (extra ? '<span class="adm-total">' + extra + '</span>' : '') + '</summary><div class="adm-cuerpo">' + cuerpo + '</div></details>';
  }
  function diasHasta(iso) { var d = _pd(iso), h = _pd(isoMas(0)); return d ? Math.round((d - h) / 864e5) : null; }

  // ── 1 · tablero ──────────────────────────────────────────────
  function tablero(D) {
    var venc = D.cobros.filter(function (c) { return c.dias !== null && c.dias >= D.diasVenc; });
    var k = function (lbl, val, sub, cls) {
      return '<div class="kpi ' + cls + '"><div class="kpi-lbl">' + lbl + '</div><div class="kpi-val">' + val + '</div><div class="kpi-sub">' + sub + '</div></div>';
    };
    return '<div class="pulso u-mb6">' +
      k('Pendiente de cobrar', fmt(suma(D.cobros, 'monto')), n(D.cobros.length, 'factura'), 'k-pendiente') +
      k('Vencido +' + D.diasVenc + 'd', fmt(suma(venc, 'monto')), n(venc.length, 'factura'), venc.length ? 'k-alerta' : 'k-neutro') +
      k('Abonos del mes', fmt(suma(D.mens, 'monto')), n(D.mens.length, 'mantenimiento'), 'k-abono') +
      k('Vendido a facturar', fmt(suma(D.saldos, 'saldo')), n(D.saldos.length, 'desarrollo'), 'k-contratado') +
      k('Ajustes pendientes', D.aj.length, 'por IPC', D.aj.length ? 'k-pendiente' : 'k-neutro') +
    '</div>';
  }

  // ── recordatorios que faltan (crearRecordatorios): una línea sólo si hay ──
  // «Ver y crear» despliega la lista acá; la ventana de facturación de un abono
  // y la fecha de la reunión mensual se pueden cambiar antes de crear.
  function faltan(D) {
    var rows = D.faltan || []; if (!rows.length) return '';
    var n = {}; rows.forEach(function (x) { var k = x.kind + (x.aprobado ? ' (aprobado sin facturar)' : ''); n[k] = (n[k] || 0) + 1; });
    var h = '<div class="u-row8 u-mb6"><span class="m m-pendiente u-s11">' + ico('campana') + ' Faltan recordatorios: ' +
      Object.keys(n).map(function (k) { return n[k] + ' ' + esc(k); }).join(' · ') + '</span>' +
      '<button class="btn bg sm" data-adm="rec-ver">' + (A.recAbierto ? 'Ocultar' : 'Ver y crear') + '</button></div>';
    if (A.recAbierto) {
      h += '<table class="tbl u-mb6"><thead><tr><th>Tipo</th><th>Cliente</th><th>Desarrollo</th><th>Cada cuánto</th><th>Cuándo</th></tr></thead><tbody>' +
        rows.map(function (x, i) {
          var cuando = (x.kind === 'Facturación' && x.freq === 'Mensual')
            ? '<span class="ft-days">del <input class="fc" type="number" min="1" max="31" data-rec-f="' + esc(x.item) + '" value="' + x.from + '" aria-label="Desde el día"> al <input class="fc" type="number" min="1" max="31" data-rec-t="' + esc(x.item) + '" value="' + x.to + '" aria-label="Hasta el día"> de cada mes</span>'
            : (x.kind === 'Reunión mensual' ? '<input class="fc u-wauto" type="date" data-rec-d="' + esc(x.cid) + '" value="' + esc(x.due || '') + '" aria-label="Fecha de la reunión">' : esc(ff(x.due)));
          return '<tr><td>' + esc(x.kind) + (x.aprobado ? ' · aprobado' : '') + '</td><td>' + esc(x.cliente) + '</td><td>' + esc(x.titulo) + '</td><td>' + esc(x.freq) + '</td><td>' + cuando + '</td></tr>';
        }).join('') + '</tbody></table><div class="u-mb6"><button class="btn bp sm" data-adm="rec-crear">' + ico('check') + ' Crear ' + rows.length + '</button></div>';
    }
    return h;
  }

  // ── 2 · pendiente de cobrar, por empresa, con selección ──────
  function pendiente(D) {
    var tot = suma(D.cobros, 'monto');
    if (!D.cobros.length) return sec('cob', 'Pendiente de cobrar', 0, '', '<div class="empty u-p10">Todo cobrado.</div>');
    var por = {}, orden = [];
    D.cobros.forEach(function (c) { var k = c.empresa || '— sin empresa —'; if (!por[k]) { por[k] = []; orden.push(k); } por[k].push(c); });
    orden.sort();
    // Un cliente por depósito: se eligen varias facturas de la misma empresa (27/10/2026)
    var h = '<div class="card u-p0 u-ovx" id="pc-wrap"><table class="tbl"><tbody>';
    orden.forEach(function (emp, ei) {
      var arr = por[emp];
      h += '<tr class="pc-emp-f"><td colspan="3"><label class="u-fw6"><input type="checkbox" data-pc="emp" data-e="' + ei + '"> ' + esc(emp) + '</label> <span class="u-s10-mt">' + arr.length + ' FC</span></td>' +
           '<td class="m m-pendiente u-tr" colspan="2">' + fmt(suma(arr, 'monto')) + '</td></tr>';
      arr.forEach(function (c) {
        var v = c.dias !== null && c.dias >= D.diasVenc;
        h += '<tr><td class="u-nw"><input type="checkbox" data-pc="fc" data-e="' + ei + '" data-id="' + esc(c.id) + '" data-m="' + (Number(c.monto) || 0) + '" aria-label="Elegir"></td>' +
             '<td class="u-nw u-fw6">' + (c.nro ? 'FC ' + esc(c.nro) : '<span class="u-c-wa">Sin comprobante</span>') + '</td>' +
             '<td class="u-c-mt pc-concepto">' + esc(c.concepto) + '</td>' +
             '<td class="m u-tr u-nw">' + fmt(c.monto) + '</td>' +
             '<td class="u-tr u-nw ' + (v ? 'u-c-rd' : 'u-c-mt') + '">' + (c.dias !== null ? 'hace ' + c.dias + ' d' : esc(ff(c.fecha))) + '</td></tr>';
      });
    });
    var pct = D.rep.length ? Number(D.rep[0].pct) || 50 : 50;
    h += '</tbody></table><div class="pc-barra u-row8">' +
      '<span class="u-s11" id="pc-n">Ninguna seleccionada</span>' +
      '<span class="u-s11">Total <b class="m m-pendiente" id="pc-tot">' + fmt(0) + '</b></span>' +
      '<span class="u-s11">' + pct + '% <b class="m m-neutro" id="pc-mitad" data-pct="' + pct + '">' + fmt(0) + '</b></span>' +
      '<button class="btn bp u-mla" data-adm="pc-reg" disabled>' + ico('check') + ' Registrar depósito</button></div></div>';
    return sec('cob', 'Pendiente de cobrar', D.cobros.length, '<span class="m m-pendiente u-s11 u-mla">' + fmt(tot) + '</span>', h);
  }
  function pcBarra() {
    var sel = Array.prototype.slice.call(document.querySelectorAll('#pc-wrap [data-pc=fc]:checked'));
    var tot = sel.reduce(function (a, x) { return a + (Number(x.getAttribute('data-m')) || 0); }, 0);
    var mitad = document.getElementById('pc-mitad');
    set('pc-n', sel.length ? n(sel.length, 'seleccionada') : 'Ninguna seleccionada');
    set('pc-tot', fmt(tot)); set('pc-mitad', fmt(Math.round(tot * (Number(mitad.getAttribute('data-pct')) || 50) / 100)));
    document.querySelectorAll('#pc-wrap [data-adm=pc-reg]').forEach(function (b) { b.disabled = !sel.length; });
    document.querySelectorAll('#pc-wrap [data-pc=emp]').forEach(function (e) {
      var fs = document.querySelectorAll('#pc-wrap [data-pc=fc][data-e="' + e.getAttribute('data-e') + '"]');
      e.checked = fs.length > 0 && Array.prototype.every.call(fs, function (x) { return x.checked; });
    });
  }
  // ── Depósito: un popup para el depósito del cliente y, si ya se hizo, la transferencia al socio ──
  // registrar_deposito: deposito_fecha y cobrado una sola vez; transf_fecha (= socio, como v_reparto_socio) sólo si viene.
  function abrirDeposito(alGuardar) {
    var ids = Array.prototype.map.call(document.querySelectorAll('#pc-wrap [data-pc=fc]:checked'), function (x) { return x.getAttribute('data-id'); });
    var fcs = A.d.cobros.filter(function (c) { return ids.indexOf(c.id) >= 0; }); if (!fcs.length) return;
    var pct = A.d.rep.length ? Number(A.d.rep[0].pct) || 50 : 50;
    var tot = suma(fcs, 'monto'), soc = fcs.reduce(function (a, c) { return a + Math.round((Number(c.monto) || 0) * pct / 100); }, 0);
    var m = document.getElementById('m-dep');
    if (!m) {
      m = document.createElement('div'); m.className = 'mo'; m.id = 'm-dep';
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Registrar depósito</span>' +
        '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-dep">' + ico('cerrar') + '</button></div><div class="mb2" id="dep-cuerpo"></div>' +
        '<div class="mf"><button class="btn bg" data-cerrar="m-dep">Cancelar</button><button class="btn bp" id="dep-ok">' + ico('check') + ' Confirmar</button></div></div>';
      document.body.appendChild(m);
    }
    document.getElementById('dep-cuerpo').innerHTML =
      '<div class="fg"><span class="fl">Cliente</span><div class="dep-cli">' + esc(fcs[0].empresa || '—') + '</div></div>' +
      '<div class="fg"><span class="fl">Facturas</span>' + fcs.map(function (c) {
        return '<div class="dep-fila"><span class="u-f1m">' + (c.nro ? 'FC <span class="m">' + esc(c.nro) + '</span>' : 'Sin comprobante') +
          (c.concepto ? ' · <span class="u-c-mt">' + esc(c.concepto) + '</span>' : '') + '</span><span class="m">' + fmt(c.monto) + '</span></div>'; }).join('') + '</div>' +
      '<div class="dep-imp"><div><span class="fl">Recibo del cliente</span><b class="m m-cobrado">' + fmt(tot) + '</b></div>' +
        '<div><span class="fl">Le toca al socio (' + pct + '%)</span><b class="m m-pendiente">' + fmt(soc) + '</b></div></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="dep-f">Fecha del depósito del cliente <span class="req">*</span></label><input class="fc" type="date" id="dep-f" value="' + isoMas(0) + '"></div>' +
        '<div class="fg"><label class="fl" for="dep-s">Fecha de transferencia al socio</label><input class="fc" type="date" id="dep-s"></div></div>' +
      '<div class="ft-info">Si todavía no le transferiste, dejá la fecha vacía: queda en «Para transferirle a tu socio».</div>';
    var ok = document.getElementById('dep-ok'); ok.disabled = false;
    ok.onclick = async function () {
      var f = document.getElementById('dep-f').value, fs = document.getElementById('dep-s').value;
      if (!f) return toast('Falta la fecha del depósito', 'err');
      ok.disabled = true;                          // un clic = un registro
      var r = await db().rpc('registrar_deposito', { ids: ids, fecha_deposito: f, fecha_socio: fs || null });
      if (r.error) { ok.disabled = false; return toast(r.error.message, 'err'); }
      closeM('m-dep'); toast(r.data.msg, 'ok'); alGuardar();
    };
    openM('m-dep');
  }

  // ── 3 · qué ajustar este mes ─────────────────────────────────
  function ajustes(D) {
    var h;
    if (!D.aj.length) h = '<div class="empty u-p10">Nada para ajustar.</div>';
    else {
      h = '<div class="u-ovx"><table class="tbl"><thead><tr><th>Cliente</th><th>Desarrollo</th><th class="u-tr">Sin ajustar</th><th class="u-tr">IPC</th>' +
          '<th class="u-tr">Cuota hoy</th><th class="u-tr">Queda en</th><th></th></tr></thead><tbody>' +
        D.aj.map(function (a) {
          var falta = a.pct != null && a.meses_ipc < a.meses;   // faltan meses de IPC cargados: el % queda corto
          return '<tr><td class="u-fw6">' + esc(a.empresa || '—') + '</td><td class="u-c-mt">' + esc(a.titulo) + '</td>' +
            '<td class="u-tr ' + (a.meses >= 6 ? 't-xr' : 't-xw') + '">' + a.meses + ' m</td>' +
            '<td class="u-tr ' + (falta ? 't-xw' : 't-xv') + '"' + (falta ? ' title="El IPC cargado cubre ' + a.meses_ipc + ' de los ' + a.meses + ' meses"' : '') + '>' +
              (a.pct != null ? '+' + String(a.pct).replace('.', ',') + ' %' : '—') + '</td>' +
            '<td class="m m-neutro u-tr">' + fmt(a.cuota_actual) + '</td>' +
            '<td class="m m-abono u-tr">' + (a.cuota_sugerida ? fmt(a.cuota_sugerida) : '—') + '</td>' +
            '<td class="u-tr">' + viejo() + ico('abrir') + ' Ajustar</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '<div class="ft-info u-mt8">' + (D.ultimoIpc ? 'IPC acumulado desde el último ajuste de cada desarrollo. Último mes cargado: ' + esc(String(D.ultimoIpc).slice(0, 7)) + '.'
                                                    : 'El IPC no está cargado: cargalo en IPC y Tipo de Cambio.') + '</div>';
    return sec('aj', 'Qué ajustar este mes', D.aj.length, '', h);
  }

  // ── 4 · facturación: abonos y saldos, según su alerta ────────
  function facturacion(D) {
    var altPorItem = {};
    D.alertas.filter(function (a) { return /factur/i.test(a.alerta_tipo + ' ' + a.titulo + ' ' + a.tipo); })
      .forEach(function (a) { if (a.item_id && (!altPorItem[a.item_id] || !a.enviada)) altPorItem[a.item_id] = a; });
    var fil = [];
    D.mens.forEach(function (m) { fil.push({ titulo: m.titulo, ctx: [m.empresa, m.proyecto], det: m.periodo, monto: m.monto, item: m.item_id, cls: 'm-abono' }); });
    D.saldos.forEach(function (s) { fil.push({ titulo: s.titulo, ctx: [s.empresa, s.proyecto], det: 'Saldo' + (s.facturado > 0 ? ' · ya facturado ' + fmt(s.facturado) : ''), monto: s.saldo, item: s.item_id, cls: 'm-contratado' }); });
    var g = { toca: [], prox: [], sin: [] };
    fil.forEach(function (f) { var a = altPorItem[f.item]; f.vence = a ? a.fecha : ''; (a ? (a.enviada ? g.prox : g.toca) : g.sin).push(f); });
    var porVence = function (x, y) { return String(x.vence).localeCompare(String(y.vence)); };
    g.toca.sort(porVence); g.prox.sort(porVence);
    // Cada grupo (Toca facturar · Sin alerta · Próximas) es un desplegable con el mismo encabezado: flecha, título, cantidad y total
    var tabla = function (k, tit, arr, abierto) {
      if (!arr.length) return '';
      var ab = A.abiertos[k] !== undefined ? A.abiertos[k] : abierto;
      return '<details class="fact-g" data-sec="' + k + '"' + (ab ? ' open' : '') + '><summary><span class="adm-flecha">' + ico('derecha') + '</span>' +
        '<span>' + tit + '</span><span class="cnt">' + arr.length + '</span><span class="m u-mla">' + fmt(suma(arr, 'monto')) + '</span></summary><table class="tbl"><tbody>' + arr.map(function (f) {
        return '<tr><td><b>' + esc(f.titulo || '—') + '</b><div class="u-s10-mt">' + esc(f.ctx.filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="u-td-mt-r">' + esc(f.det || '') + '</td>' +
          '<td class="u-td-mt-r">' + (f.vence ? ico('calendario') + ' ' + esc(ff(f.vence)) : '') + '</td>' +
          '<td class="m ' + f.cls + ' u-tr">' + fmt(f.monto) + '</td>' +
          '<td class="u-tr">' + viejo() + ico('abrir') + ' Facturar</a></td></tr>';
      }).join('') + '</tbody></table></details>';
    };
    var h = fil.length ? '' : '<div class="empty u-p10">Nada pendiente de facturar.</div>';
    h += tabla('fg-toca', 'Toca facturar', g.toca, true) + tabla('fg-sin', 'Sin alerta (se crea en la próxima sincronización)', g.sin, true) +
      tabla('fg-prox', 'Próximas', g.prox, false);
    // Una factura cargada sin desarrollo no tiene de dónde descontarse: por eso
    // algo ya facturado puede seguir apareciendo arriba.
    if (D.sinDes.length) {
      h += '<div class="aviso aviso-wa u-mt8">' + ico('alerta') + ' ' + n(D.sinDes.length, 'factura') + ' sin desarrollo asignado · por esto algo ya facturado puede seguir apareciendo arriba' +
        '<table class="tbl u-mt6"><tbody>' + D.sinDes.map(function (x) {
          return '<tr><td class="u-fw6">' + esc(x.empresa || '—') + '</td><td class="u-c-mt">' + esc(x.proyecto || '—') + '</td>' +
            '<td class="u-c-mt">' + (x.nro ? 'FC ' + esc(x.nro) : esc(x.concepto || '—')) + '</td><td class="m m-pendiente u-tr">' + fmt(x.monto) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return sec('fact', 'Facturación', g.toca.length + g.sin.length, '<span class="m m-abono u-s11 u-mla">' + fmt(suma(g.toca.concat(g.sin), 'monto')) + '</span>', h);
  }

  // ── 5 · para transferirle al socio ───────────────────────────
  function socio(D) {
    var p = D.rep.filter(function (c) { return !c.hecho; });
    if (!p.length) return '';
    var pct = Number(p[0].pct) || 50, tot = suma(p, 'monto'), soc = suma(p, 'socio');
    var h = '<div class="card u-p0 u-ovx"><div class="u-row8 u-p10 u-s11-mt">Depositado sin repartir ' + fmt(tot) + ' · le corresponde el ' + pct + '%' +
      '<button class="btn bg xs u-mla" data-adm="socio-todo">' + ico('check') + ' Ya le transferí todo</button></div><table class="tbl"><tbody>' +
      p.map(function (c) {
        return '<tr><td class="u-nw u-fw6">' + (c.nro ? 'FC ' + esc(c.nro) : '—') + '</td>' +
          '<td class="u-c-mt pc-concepto">' + esc([c.empresa, c.concepto].filter(Boolean).join(' · ')) + '</td>' +
          '<td class="u-td-mt-r">depositó ' + esc(ff(c.deposito)) + '</td>' +
          '<td class="m u-tr u-nw">' + fmt(c.monto) + '</td>' +
          '<td class="m m-pendiente u-tr" title="Lo que le tenés que transferir">' + fmt(c.socio) + '</td>' +
          '<td class="u-tr"><button class="btn bg xs btn-ico" data-adm="socio" data-id="' + esc(c.id) + '" data-tip="Ya le transferí esta" aria-label="Ya le transferí esta">' + ico('check') + '</button></td></tr>';
      }).join('') +
      '<tr><td colspan="3" class="u-fw6">Total a transferir</td><td class="m u-tr u-fw6">' + fmt(tot) + '</td><td class="m m-pendiente u-tr">' + fmt(soc) + '</td><td></td></tr>' +
      '</tbody></table></div>';
    return sec('soc', 'Para transferirle a tu socio', p.length, '<span class="m m-pendiente u-s11 u-mla">' + fmt(soc) + '</span>', h);
  }

  // ── 6 · otros recordatorios (menos facturación e IPC, que tienen sección) ──
  function otros(D) {
    var alts = D.alertas.filter(function (a) { return !a.enviada && a.tipo !== 'Facturación' && a.tipo !== 'IPC'; });
    var g = { vencidas: [], hoy: [], semana: [], futuras: [] };
    alts.forEach(function (a) {
      var d = diasHasta(a.fecha);
      (d === null ? g.futuras : d < 0 ? g.vencidas : d === 0 ? g.hoy : d <= 7 ? g.semana : g.futuras).push(a);
    });
    var accion = function (a) {
      return a.tipo === 'Renovación' ? 'Renovar el mantenimiento' : a.tipo === 'Cobro' ? 'Registrar el cobro' : (a.titulo || 'Recordatorio');
    };
    var grupo = function (tit, tono, arr) {
      if (!arr.length) return '';
      return '<div class="u-mb12"><div class="sec t-' + tono + '">' + tit + ' · ' + arr.length + '</div>' + arr.map(function (a) {
        var cuota = a.cuotas_total > 1 ? ' · cuota ' + Math.min(a.cuota_actual || 1, a.cuotas_total) + ' de ' + a.cuotas_total : '';
        return '<div class="card u-p10 u-mb6"><div class="u-row8">' +
          '<div class="u-f1m"><div class="u-fw6">' + esc(accion(a)) + '</div>' +
            '<div class="u-s11">' + esc(a.item_titulo || a.titulo || '') + '</div>' +
            '<div class="u-s11-mt">' + esc(a.empresa || '—') + (a.cuit ? ' · CUIT ' + esc(a.cuit) : '') + '</div>' +
            '<div class="u-s10-mt">' + esc((a.proy_nombre || '') + cuota) + '</div>' + (a.nota ? '<div class="u-s10-mt">' + esc(a.nota) + '</div>' : '') + '</div>' +
          '<div class="u-tr">' + (a.monto_fact > 0 ? '<div class="m m-abono">' + fmt(a.monto_fact) + '</div>' : '') +
            '<div class="u-s11 t-' + tono + '">' + esc(ff(a.fecha)) + '</div><div class="u-s10-mt">' + esc(a.tipo) + '</div></div>' +
          '<div class="u-row6">' +
            '<button class="btn bg xs btn-ico" data-adm="alt-hecha" data-id="' + esc(a.id) + '" data-tip="Marcar hecha" aria-label="Marcar hecha">' + ico('check') + '</button>' +
            '<button class="btn bg xs btn-ico" data-adm="alt-posp" data-id="' + esc(a.id) + '" data-tip="Posponer" aria-label="Posponer">' + ico('calendario') + '</button>' +
            '<button class="btn bg xs btn-ico" data-adm="alt-ver" data-id="' + esc(a.id) + '" data-tip="Ver, comentar" aria-label="Abrir">' + ico('abrir') + '</button>' +
          '</div></div></div>';
      }).join('') + '</div>';
    };
    var h = grupo('Vencidas', 'xr', g.vencidas) + grupo('Hoy', 'xw', g.hoy) + grupo('Esta semana', 'xb', g.semana) + grupo('Próximamente', 'xm', g.futuras);
    var nuevo = '<div class="u-row8 u-mb10"><span class="u-s11-mt u-f1">IPC, renovación de mantenimientos y carga de gastos.</span>' +
      '<button class="btn bp sm" data-adm="regla-nueva">' + ico('campana') + ' Nuevo recordatorio</button></div>';
    return sec('alt', 'Otros recordatorios', alts.length, '', nuevo + (h || '<div class="empty u-p10">Nada pendiente.</div>'));
  }

  // ── 7 · gastos del mes (sin impuestos) ───────────────────────
  function gastos(D) {
    var hoyK = isoMas(0).slice(0, 7);
    if (A.gastosMes === null) {
      var ms = D.gastos.map(function (g) { return g.mes_key; }).filter(function (m) { return m && m <= hoyK; }).sort();
      A.gastosMes = ms[ms.length - 1] || hoyK;
    }
    var op = D.gastos.filter(function (g) { return !g.es_impuesto && g.mes_key === A.gastosMes; })
      .sort(function (a, b) { return (Number(b.monto_ars) || 0) - (Number(a.monto_ars) || 0); });
    var imp = suma(D.gastos.filter(function (g) { return g.es_impuesto && g.mes_key === A.gastosMes; }), 'monto_ars');
    var tot = suma(op, 'monto_ars'), totU = suma(op, 'monto_usd');
    var mn = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], opts = '', h0 = new Date();
    for (var i = 0; i < 12; i++) {
      var d = new Date(h0.getFullYear(), h0.getMonth() - i, 1), v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      opts += '<option value="' + v + '"' + (v === A.gastosMes ? ' selected' : '') + '>' + mn[d.getMonth()] + ' ' + d.getFullYear() + '</option>';
    }
    var h = '<div class="u-row8 u-mb6"><span class="u-s11-mt">Mes</span><select class="fc u-wauto" id="adm-gmes" aria-label="Mes">' + opts + '</select></div>' +
      '<div class="kpi k-pendiente u-mb12"><div class="kpi-lbl">Gastos del mes</div><div class="kpi-val">' + fmt(tot) +
        (totU > 0 ? ' <span class="m m-usd u-s11">' + fmt(totU, 'USD') + '</span>' : '') + '</div>' +
      '<div class="kpi-sub">' + n(op.length, 'gasto') + ' operativo' + (op.length === 1 ? '' : 's') + (imp > 0 ? ' · sin ' + fmt(imp) + ' de impuestos' : ' · sin impuestos') + '</div></div>';
    if (!op.length) return sec('gas', 'Gastos del mes', 0, '', h + '<div class="empty">Sin gastos cargados.</div>');
    var por = {}; op.forEach(function (g) { var c = g.categoria || 'Sin categoría'; por[c] = (por[c] || 0) + (Number(g.monto_ars) || 0); });
    h += '<div class="card u-p0 u-ovx"><table class="tbl"><thead><tr><th>Concepto</th><th>Categoría</th><th>Frecuencia</th><th class="u-tr">Por mes</th></tr></thead><tbody>' +
      op.map(function (g) {
        return '<tr><td class="u-fw6">' + esc(g.descripcion || '—') + '</td><td class="u-c-mt">' + esc(g.categoria || '—') + '</td>' +
          '<td class="u-s10-mt">' + esc(g.recurrencia || '') + (g.moneda === 'USD' ? ' · ' + fmt(g.monto_usd || 0, 'USD') : '') + '</td>' +
          '<td class="m u-tr">' + fmt(g.monto_ars) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="u-s10-mt u-mt6">' + Object.keys(por).sort(function (a, b) { return por[b] - por[a]; })
        .map(function (c) { return esc(c) + ' <b class="m">' + fmt(por[c]) + '</b>'; }).join(' · ') + '</div>';
    return sec('gas', 'Gastos del mes', op.length, '<span class="m m-pendiente u-s11 u-mla">' + fmt(tot) + '</span>', h);
  }

  // ══ FACTURACIÓN · la lista de cobros (getAllCobros = v_cobros) ══
  // Los recuadros son de lo que se está viendo: cambian con cada filtro.
  async function cargarFact() {
    var r = await Promise.all([
      db().from('v_cobros').select('*'),
      db().from('empresas').select('id,logo'),
      db().from('usuarios').select('mail,nombre')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    var logos = {}; r[1].data.forEach(function (e) { logos[e.id] = e.logo; });
    var nombres = {}; r[2].data.forEach(function (u) { nombres[String(u.mail || '').trim().toLowerCase()] = u.nombre; });
    A.f = { cobros: r[0].data, logos: logos, nombres: nombres };
  }
  function sinDep(c) { return c.monto > 0 && !c.fecha_deposito && !c.fecha_transf; }
  function filtrarFact() {
    var F = A.ff, hoy = isoMas(0);
    return A.f.cobros.filter(function (c) {
      if (F.emp && c.empresa !== F.emp) return false;
      if (F.own && c.factura_owner !== F.own) return false;
      if (F.dep === 'pendiente' && !sinDep(c)) return false;
      if (F.dep === 'vencida' && !(sinDep(c) && c.fecha_comp && c.fecha_comp < hoy)) return false;
      if (F.dep === 'sinfc' && String(c.nro_factura || '').trim()) return false;
      if (F.dep === 'depositado' && !(c.fecha_deposito || c.fecha_transf)) return false;
      if (F.q && (c.empresa + c.proy_nombre + c.concepto + c.nro_factura).toLowerCase().indexOf(F.q) < 0) return false;
      return true;
    }).sort(function (a, b) { return String(b.fecha_comp || '').localeCompare(String(a.fecha_comp || '')); });
  }
  function htmlFact() {
    var F = A.ff, C = A.f.cobros;
    var emps = {}, owns = {}; C.forEach(function (c) { if (c.empresa) emps[c.empresa] = 1; if (c.factura_owner) owns[c.factura_owner] = 1; });
    var opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    var h = '<div class="filtros u-row8 u-mb12">' +
      '<input class="fc u-f1" id="fa-q" placeholder="Buscar empresa, proyecto, comprobante…" aria-label="Buscar" value="' + esc(F.q) + '">' +
      '<select class="fc u-wauto" id="fa-emp" aria-label="Empresa">' + opt('', 'Todas las empresas', F.emp) + Object.keys(emps).sort().map(function (e) { return opt(e, e, F.emp); }).join('') + '</select>' +
      '<select class="fc u-wauto" id="fa-dep" aria-label="Depósito">' + opt('', 'Todos', F.dep) + opt('pendiente', 'Sin depósito', F.dep) + opt('vencida', 'Vencidas sin depósito', F.dep) +
        opt('sinfc', 'Cobros sin factura', F.dep) + opt('depositado', 'Depositados', F.dep) + '</select>' +
      '<select class="fc u-wauto" id="fa-own" aria-label="Quién facturó">' + opt('', 'Quién facturó: todos', F.own) +
        Object.keys(owns).sort().map(function (o) { return opt(o, A.f.nombres[o] || o.split('@')[0], F.own); }).join('') + '</select>' +
      viejo() + ico('mas') + ' Nueva facturación</a></div>';
    var list = filtrarFact(), pend = list.filter(sinDep);
    h += '<div class="g3 u-mb12">' +
      '<div class="kpi k-cobrado"><div class="kpi-lbl">Total cobrado ARS (neto)</div><div class="kpi-val">' + fmt(suma(list, 'monto')) + '</div><div class="kpi-sub">' + n(list.length, 'cobro') + '</div></div>' +
      '<div class="kpi k-usd"><div class="kpi-lbl">Total USD</div><div class="kpi-val">' + fmt(Math.round(suma(list, 'total_usd')), 'USD') + '</div><div class="kpi-sub">al TC de cada comprobante</div></div>' +
      '<div class="kpi ' + (pend.length ? 'k-alerta' : 'k-neutro') + '"><div class="kpi-lbl">Sin depósito</div><div class="kpi-val">' + pend.length + '</div><div class="kpi-sub">' + (pend.length ? fmt(suma(pend, 'monto')) : 'todo depositado') + '</div></div></div>';
    if (!list.length) return h + '<div class="empty">Sin cobros para este filtro.</div>';
    var porE = {}; list.forEach(function (c) { var k = c.empresa || '—'; (porE[k] = porE[k] || []).push(c); });
    Object.keys(porE).sort().forEach(function (emp) {
      var cs = porE[emp], e0 = cs[0], logo = e0.empresa_id && A.f.logos[e0.empresa_id];
      h += '<div class="card u-p0 u-mb10"><div class="card-h u-row8">' +
        // logo de Drive; si no se puede ver (archivo sin compartir: 403), la inicial
        (logo ? '<img class="proy-emp-logo" src="' + esc(logo) + '" referrerpolicy="no-referrer" alt="" onerror="this.outerHTML=this.getAttribute(\'data-ini\')" data-ini="' +
                esc('<div class="proy-emp-initial">' + esc(emp.charAt(0).toUpperCase()) + '</div>') + '">'
              : '<div class="proy-emp-initial">' + esc(emp.charAt(0).toUpperCase()) + '</div>') +
        '<span class="u-fw6">' + esc(emp) + '</span><span class="u-s10-mt">' + n(cs.length, 'cobro') + '</span>' +
        '<span class="m m-cobrado u-mla">' + fmt(suma(cs, 'monto')) + '</span></div>' +
        '<div class="u-ovx"><table class="tbl"><thead><tr><th>Concepto</th><th>Comprobante</th><th>Fecha</th><th class="u-tr">Monto ARS</th><th class="u-tr">USD</th><th>Adjunto</th><th></th></tr></thead><tbody>';
      var porP = {}, ordP = [];
      cs.forEach(function (c) { var k = c.proy_nombre || '— sin proyecto —'; if (!porP[k]) { porP[k] = []; ordP.push(k); } porP[k].push(c); });
      ordP.sort().forEach(function (pn) {
        h += '<tr class="pc-emp-f"><td colspan="7"><span class="u-s11 u-fw6">' + esc(pn) + '</span> <span class="m m-cobrado u-s10">' + fmt(suma(porP[pn], 'monto')) + '</span></td></tr>';
        porP[pn].forEach(function (c) {
          var nc = c.monto < 0, editable = sinDep(c) || nc;
          // el color del monto dice si la plata entró: cobrado · pendiente · nota de crédito (neutra)
          var mc = nc ? 'm-neutro' : sinDep(c) ? 'm-pendiente' : 'm-cobrado';
          h += '<tr><td><span class="u-fw6">' + esc(c.concepto || '—') + '</span>' + (c.cuota_nro ? ' <span class="u-s10-mt">· cuota ' + esc(c.cuota_nro) + '</span>' : '') + '</td>' +
            '<td class="u-nw">' + esc(c.tipo_comp || '—') + (c.nro_factura ? ' <span class="u-s10-mt">#' + esc(c.nro_factura) + '</span>' : ' <span class="u-s10 u-c-wa">sin N°</span>') + '</td>' +
            '<td class="u-c-mt u-nw">' + esc(ff(c.fecha_comp)) + '</td>' +
            '<td class="m ' + mc + ' u-tr u-nw">' + fmt(c.monto) + '</td>' +
            '<td class="m m-usd u-tr u-nw">' + (c.total_usd > 0 ? fmt(Math.round(c.total_usd), 'USD') : '—') + '</td>' +
            '<td>' + (c.link_fc ? '<a class="btn bg xs" href="' + esc(c.link_fc) + '" target="_blank" rel="noopener">' + ico('documento') + ' Ver</a>'
                                : '<button class="btn bg xs btn-ico" data-adm="fa-link" data-id="' + esc(c.id) + '" data-tip="Adjuntar el PDF (link)" aria-label="Adjuntar el PDF">' + ico('clip') + '</button>') + '</td>' +
            '<td class="u-nw u-tr">' + (editable
              ? viejo().replace('btn bg xs"', 'btn bg xs btn-ico" data-tip="Editar en el CRM actual" aria-label="Editar"') + ico('editar') + '</a>' +
                '<button class="btn bg xs btn-ico" data-adm="fa-borrar" data-id="' + esc(c.id) + '" data-tip="Eliminar este cobro" aria-label="Eliminar">' + ico('borrar') + '</button>'
              : '<button class="btn bg xs btn-ico" data-adm="fa-com" data-id="' + esc(c.id) + '" data-tip="Ya cobrado: sólo se le puede comentar" aria-label="Comentar">' + ico('chat') + '</button>') +
            '</td></tr>';
        });
      });
      h += '</tbody></table></div></div>';
    });
    return h;
  }
  async function accionFact(el, a, id) {
    var c = A.f.cobros.find(function (x) { return x.id === id; }); if (!c) return;
    var que = [c.empresa, c.concepto, c.nro_factura ? '#' + c.nro_factura : ''].filter(Boolean).join(' · ');
    var r;
    if (a === 'fa-borrar') {
      if (!(await ask('¿Eliminar este cobro?\n\n' + (que || id) + '\n' + fmt(c.monto) + '\n\nNo se puede deshacer.', 'Eliminar cobro', { peligro: true }))) return;
      r = await db().rpc('borrar_cobro', { cid: id });
      if (r.error) return toast(r.error.message, 'err');
      toast('Cobro eliminado', 'ok');
    }
    if (a === 'fa-com') {
      var t = await pedir('Cobrado el ' + ff(c.fecha_deposito || c.fecha_transf) + '.\nUn cobro con la plata adentro no se edita.\n\n' + que, '', 'Comentario sobre este cobro');
      if (!t || !String(t).trim()) return;
      r = await db().rpc('comentar_cobro', { cid: id, texto: String(t).trim() });
      if (r.error) return toast(r.error.message, 'err');
      return toast('Comentario guardado', 'ok');
    }
    if (a === 'fa-link') {
      // Subir el archivo a Drive llega con el puente de Google; mientras, el link del PDF
      var l = await pedir('Link del PDF de la factura (Drive)', '', 'Adjuntar factura');
      if (!l || !String(l).trim()) return;
      r = await db().rpc('cobro_link', { cid: id, link: String(l).trim() });
      if (r.error) return toast(r.error.message, 'err');
      toast('Factura adjuntada', 'ok');
    }
    await cargarFact(); pintar(el);
  }

  // ── Gastos (getGastos · getProrrateo · saveGasto · deleteGasto) ──
  // Un renglón por mes pagado: «por mes» = los renglones del último mes cargado, sin impuestos.
  function nomUsr(mail) { var u = (A.d.users || []).find(function (x) { return x.mail === mail; }); return u ? u.nombre : (mail || '—').split('@')[0]; }
  function htmlGastos(D) {
    var G = D.gastos, P = D.pro || {}, mesTxt = String(P.mes || '').split('-').reverse().join('/');
    var kpi = function (cls, lbl, val) { return '<div class="kpi ' + cls + '"><div class="kpi-lbl">' + lbl + '</div><div class="kpi-val">' + val + '</div></div>'; };
    var h = '<div class="kpi-grid u-mb12">' + kpi('k-pendiente', 'Compartido ' + esc(mesTxt), fmt(P.compartido || 0)) +
      kpi('k-contratado', 'Proyectos activos', '<span class="m">' + (P.proyectos_activos || 0) + '</span>') + kpi('k-abono', 'Prorrateo / proyecto', fmt(P.por_proyecto || 0)) + '</div>';
    var delMes = G.filter(function (g) { return g.mes_key === P.mes && !g.es_impuesto; }), porTipo = {}, socio = { diego: 0, vs: 0 };
    delMes.forEach(function (g) {
      var c = g.categoria || '—', m = Number(g.monto_ars) || 0, k = String(g.pagador || '').toLowerCase();
      porTipo[c] = (porTipo[c] || 0) + m;
      if (k.indexOf('d.camps') >= 0) socio.diego += m; else if (k.indexOf('v.gagey') >= 0 || k.indexOf('s.echavarria') >= 0) socio.vs += m;
    });
    var tipos = Object.keys(porTipo).sort(function (a, b) { return porTipo[b] - porTipo[a]; });
    if (tipos.length) h += '<div class="sec">Gasto de ' + esc(mesTxt) + ' por tipo <span class="sec-sub">· sin impuestos</span></div><div class="kpi-grid u-mb12">' +
      tipos.map(function (c) { return kpi('k-pendiente', esc(c), fmt(porTipo[c])); }).join('') + '</div>' +
      '<div class="sec">Por socio · por mes <span class="sec-sub">(sin Monotributo)</span></div><div class="kpi-grid u-mb12">' +
      kpi('k-pendiente', 'Diego', fmt(socio.diego)) + kpi('k-pendiente', 'Vicky + Sebas', fmt(socio.vs)) + '</div>';
    var F = A.gf, cats = {}, pags = {};
    G.forEach(function (g) { cats[g.categoria || '—'] = 1; if (g.pagador) pags[g.pagador] = 1; });
    var op = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    h += '<div class="u-row8 u-mb10"><select class="fc u-wauto" id="gf-cat" aria-label="Categoría">' + op('', 'Todas las categorías', F.cat) + Object.keys(cats).sort().map(function (c) { return op(c, c, F.cat); }).join('') + '</select>' +
      '<select class="fc u-wauto" id="gf-pag" aria-label="Pagador">' + op('', 'Todos los pagadores', F.pag) + Object.keys(pags).sort().map(function (p) { return op(p, nomUsr(p), F.pag); }).join('') + '</select>' +
      '<select class="fc u-wauto" id="gf-rec" aria-label="Frecuencia">' + op('', 'Toda frecuencia', F.rec) + op('si', 'Solo recurrentes', F.rec) + op('no', 'Solo únicos', F.rec) + '</select>' +
      '<input class="fc u-f1" id="gf-q" placeholder="Buscar descripción…" value="' + esc(F.q) + '" aria-label="Buscar">' +
      '<button class="btn bp sm" data-adm="gas-nuevo">' + ico('mas') + ' Nuevo gasto</button></div>';
    var L = G.filter(function (g) {
      var rec = !/[uú]nic/i.test(g.recurrencia || '');
      if (F.cat && (g.categoria || '—') !== F.cat) return false;
      if (F.pag && g.pagador !== F.pag) return false;
      if (F.rec === 'si' && !rec) return false; if (F.rec === 'no' && rec) return false;
      if (F.q && ((g.descripcion || '') + ' ' + (g.categoria || '') + ' ' + nomUsr(g.pagador)).toLowerCase().indexOf(F.q.toLowerCase()) < 0) return false;
      return true;
    }).sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')); });
    if (!L.length) return h + '<div class="empty">' + (G.length ? 'Nada coincide con el filtro.' : 'Sin gastos cargados. Agregá el primero.') + '</div>';
    return h + '<div class="card u-p0 u-ov"><table class="tbl"><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="u-tr">ARS</th><th class="u-tr">USD</th>' +
      '<th>Frecuencia</th><th>Pagador</th><th>Prorratea</th><th></th></tr></thead><tbody>' + L.map(function (g) {
        return '<tr><td class="m">' + esc(ff(g.fecha)) + '</td><td>' + esc(g.categoria || '—') + '</td><td>' + esc(g.descripcion || '') + '</td>' +
          '<td class="u-tr">' + fmt(g.monto_ars || 0) + '</td><td class="u-tr m m-usd">' + (Number(g.monto_usd) ? fmt(g.monto_usd, 'USD') : '') + '</td>' +
          '<td>' + esc(g.recurrencia || '') + '</td><td>' + esc(nomUsr(g.pagador)) + '</td><td>' + (g.prorratear ? 'Sí' : 'No') + '</td>' +
          '<td class="u-nw"><button class="btn bg xs btn-ico" data-tip="Editar" aria-label="Editar" data-adm="gas-edit" data-id="' + esc(g.id) + '">' + ico('editar') + '</button>' +
          '<button class="btn bg xs btn-ico" data-tip="Duplicar" aria-label="Duplicar" data-adm="gas-dup" data-id="' + esc(g.id) + '">' + ico('repetir') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  async function abrirGasto(id, dup, alGuardar) {
    var g = id ? (A.d.gastos.find(function (x) { return x.id === id; }) || {}) : {};
    var m = document.getElementById('m-gasto');
    if (!m) {
      m = document.createElement('div'); m.className = 'mo'; m.id = 'm-gasto';
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2" id="ga-t">Nuevo gasto</span>' +
        '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-gasto">' + ico('cerrar') + '</button></div><div class="mb2">' +
        '<div class="g2"><div class="fg"><label class="fl" for="ga-fecha">Fecha</label><input class="fc" type="date" id="ga-fecha"></div>' +
          '<div class="fg"><label class="fl" for="ga-cat">Categoría</label><select class="fc" id="ga-cat"></select></div></div>' +
        '<div class="fg"><label class="fl" for="ga-desc">Descripción <span class="req">*</span></label><input class="fc" id="ga-desc"></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ga-mon">Moneda</label><select class="fc" id="ga-mon"><option>ARS</option><option>USD</option></select></div>' +
          '<div class="fg"><label class="fl" for="ga-monto">Monto</label><input class="fc u-tr" type="number" min="0" id="ga-monto"></div></div>' +
        '<div class="ft-info u-mb6">La otra moneda se calcula sola, al TC del día del gasto.</div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ga-pag">Pagador (socio)</label><select class="fc" id="ga-pag"></select></div>' +
          '<div class="fg"><label class="fl" for="ga-frec">Frecuencia</label><select class="fc" id="ga-frec"><option>Mensual</option><option>Anual</option><option>Único</option></select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="ga-pro">Prorratear a proyectos</label><select class="fc" id="ga-pro"><option value="si">Sí</option><option value="no">No</option></select></div>' +
          '<div class="fg"><label class="fl" for="ga-con">Contratación</label><select class="fc" id="ga-con"></select></div></div>' +
        '</div><div class="mf"><button class="btn bg u-c-rd" id="ga-del">' + ico('borrar') + ' Eliminar</button><span class="u-f1"></span>' +
        '<button class="btn bg" data-cerrar="m-gasto">Cancelar</button><button class="btn bp" id="ga-ok">Guardar</button></div></div>';
      document.body.appendChild(m);
    }
    var $g = function (x) { return document.getElementById(x); };
    var cfg = await db().from('cot_config').select('valor').eq('clave', 'categorias_gasto').maybeSingle();
    var cats = String((cfg.data && cfg.data.valor) || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!cats.length) cats = ['Infraestructura', 'Suscripción', 'Socios', 'Sueldos', 'Servicios', 'Impuestos', 'Otro'];
    if (g.categoria && cats.indexOf(g.categoria) < 0) cats.push(g.categoria);
    $g('ga-cat').innerHTML = cats.map(function (c) { return '<option' + (c === g.categoria ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var con = await db().from('contrataciones').select('id,producto').order('producto');
    $g('ga-con').innerHTML = '<option value="">— Ninguna —</option>' + (con.data || []).map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === g.contratacion_id ? ' selected' : '') + '>' + esc(c.producto || c.id) + '</option>'; }).join('');
    $g('ga-pag').innerHTML = '<option value="">— Socio —</option>' + (A.d.users || []).map(function (u) { return '<option value="' + esc(u.mail) + '"' + (u.mail === g.pagador ? ' selected' : '') + '>' + esc(u.nombre) + '</option>'; }).join('');
    var usd = String(g.moneda || '').toUpperCase().indexOf('USD') >= 0;
    $g('ga-t').textContent = !id ? 'Nuevo gasto' : dup ? 'Duplicar gasto' : 'Editar gasto';
    $g('ga-fecha').value = g.fecha && !dup ? String(g.fecha).slice(0, 10) : isoMas(0);
    $g('ga-desc').value = g.descripcion || ''; $g('ga-mon').value = usd ? 'USD' : 'ARS';
    $g('ga-monto').value = (usd ? g.monto_usd : g.monto_ars) || '';
    $g('ga-frec').value = /anual/i.test(g.recurrencia || '') ? 'Anual' : /[uú]nic/i.test(g.recurrencia || '') ? 'Único' : 'Mensual';
    $g('ga-pro').value = g.prorratear === false ? 'no' : 'si';
    $g('ga-del').hidden = !id || dup;
    $g('ga-ok').onclick = async function () {
      if (!$g('ga-desc').value.trim()) return toast('Descripción obligatoria', 'err');
      var r = await db().rpc('guardar_gasto', { p: { id: id && !dup ? id : null, fecha: $g('ga-fecha').value, categoria: $g('ga-cat').value,
        descripcion: $g('ga-desc').value.trim(), moneda: $g('ga-mon').value, monto: Number($g('ga-monto').value) || 0, pagador: $g('ga-pag').value,
        frecuencia: $g('ga-frec').value, prorratear: $g('ga-pro').value === 'si', contratacion: $g('ga-con').value } });
      if (r.error) return toast(r.error.message, 'err');
      closeM('m-gasto'); toast('Guardado', 'ok'); alGuardar();
    };
    $g('ga-del').onclick = async function () {
      if (!(await ask('¿Eliminar este gasto?', '¿Borro el gasto?', { peligro: true }))) return;
      var r = await db().rpc('borrar_gasto', { gid: id });
      if (r.error) return toast(r.error.message, 'err');
      closeM('m-gasto'); toast('Eliminado', 'ok'); alGuardar();
    };
    openM('m-gasto');
  }

  // ── pintar ───────────────────────────────────────────────────
  // Las subpantallas están en el menú lateral (marcarSub lo mantiene al día)
  function pintar(el) {
    if (_montado !== 'admin') return;             // se terminó de leer con otro módulo en pantalla
    marcarSub(A.sub);
    var cab = '<div class="page-h"><div><h2>' + (SUBS.find(function (s) { return s[0] === A.sub; }) || ['', 'Administración'])[1] + '</h2>' +
      '<div class="page-s">Facturación, cobros y gastos.</div></div></div>';
    if (A.sub === 'fact') { el.innerHTML = cab + htmlFact(); return; }
    if (A.sub === 'gastos') { el.innerHTML = cab + htmlGastos(A.d); return; }
    if (A.sub !== 'dash') {
      el.innerHTML = cab + '<div class="card"><p>Esta vista todavía funciona en el CRM actual.</p>' + viejo() + ico('abrir') + ' Abrir el CRM actual</a></div>';
      return;
    }
    var D = A.d;
    el.innerHTML = cab + tablero(D) + faltan(D) + pendiente(D) + ajustes(D) + facturacion(D) + socio(D) + otros(D) + gastos(D);
  }

  VISTAS.admin = async function (el, op) {
    var leer = async function () { await cargar(); if (A.sub === 'fact') await cargarFact(); };
    var refrescar = async function () { await leer(); pintar(el); };
    // Entrar a Administración (sin subpantalla) es el Dashboard: no está en el menú porque es la portada
    var s = subPedida(); if (SUBS.some(function (x) { return x[0] === s; })) A.sub = s; else A.sub = 'dash';
    await abrirModulo(el, { id: 'admin', texto: 'Cargando Administración…', forzar: op && op.forzar, cargar: leer,
      cargado: function () { return !!A.d && (A.sub !== 'fact' || !!A.f); }, firma: function () { return JSON.stringify([A.d, A.f]); },
      pintar: function () { pintar(el); } });
    var alerta = function (id) { return A.d.alertas.find(function (a) { return a.id === id; }); };
    if (!el._admToggle) {                      // una vez: #vista es el mismo para todos los módulos
      el._admToggle = true;
      el.addEventListener('toggle', function (ev) {
        var d = ev.target; if (d.matches && d.matches('details[data-sec]')) A.abiertos[d.getAttribute('data-sec')] = d.open;
      }, true);
    }
    // la búsqueda repinta sólo la lista, para no perder el foco del campo
    el.oninput = function (ev) {
      if (ev.target.id === 'gf-q') {
        A.gf.q = ev.target.value; var p0 = ev.target.selectionStart; pintar(el);
        var q0 = document.getElementById('gf-q'); q0.focus(); q0.setSelectionRange(p0, p0); return;
      }
      if (ev.target.id !== 'fa-q') return;
      A.ff.q = ev.target.value.toLowerCase().trim();
      var pos = ev.target.selectionStart; pintar(el);
      var q = document.getElementById('fa-q'); q.focus(); q.setSelectionRange(pos, pos);
    };
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.id === 'adm-gmes') { A.gastosMes = t.value; return pintar(el); }
      if (t.id === 'gf-cat' || t.id === 'gf-pag' || t.id === 'gf-rec') { A.gf[t.id.slice(3)] = t.value; return pintar(el); }
      if (t.id === 'fa-emp' || t.id === 'fa-dep' || t.id === 'fa-own') { A.ff[t.id.slice(3)] = t.value; return pintar(el); }
      var pc = t.getAttribute && t.getAttribute('data-pc');
      // Un solo cliente: tildar otra empresa no se suma a la selección
      var otra = t.checked && pc && Array.prototype.some.call(document.querySelectorAll('#pc-wrap [data-pc=fc]:checked'), function (x) { return x.getAttribute('data-e') !== t.getAttribute('data-e'); });
      if (otra) { t.checked = false; toast('Elegí facturas de un solo cliente', 'err'); }
      else if (pc === 'emp') document.querySelectorAll('#pc-wrap [data-pc=fc][data-e="' + t.getAttribute('data-e') + '"]').forEach(function (x) { x.checked = t.checked; });
      if (pc) pcBarra();
    };
    el.onclick = async function (ev) {
      var b = ev.target.closest('[data-adm]'); if (!b) return;
      var a = b.getAttribute('data-adm'), id = b.getAttribute('data-id');
      if (a.indexOf('fa-') === 0) return accionFact(el, a, id);
      if (a === 'gas-nuevo' || a === 'gas-edit' || a === 'gas-dup') return abrirGasto(a === 'gas-nuevo' ? null : id, a === 'gas-dup', refrescar);
      if (a === 'regla-nueva') return nuevaRegla({}, { onSave: refrescar });
      if (a === 'rec-ver') { A.recAbierto = !A.recAbierto; return pintar(el); }
      if (a === 'rec-crear') {
        var w = {};
        document.querySelectorAll('[data-rec-f]').forEach(function (f) {
          var it = f.getAttribute('data-rec-f'), t = document.querySelector('[data-rec-t="' + it + '"]');
          w[it] = { from: Number(f.value), to: Number(t && t.value) };
        });
        document.querySelectorAll('[data-rec-d]').forEach(function (d) { if (d.value) w['meet:' + d.getAttribute('data-rec-d')] = { due: d.value }; });
        if (!(await ask('Se crean ' + A.d.faltan.length + ' recordatorio(s).', 'Crear recordatorios', { ok: 'Crear' }))) return;
        var rr = await db().rpc('crear_recordatorios', { ventanas: w, solo_item: null });
        if (rr.error) return toast(rr.error.message, 'err');
        toast(rr.data.msg, 'ok'); A.recAbierto = false; return refrescar();
      }
      if (a === 'pc-reg') return abrirDeposito(refrescar);
      if (a === 'socio' || a === 'socio-todo') {
        var p = A.d.rep.filter(function (c) { return !c.hecho; });
        var lista = a === 'socio' ? [id] : p.map(function (c) { return c.id; });
        if (a === 'socio-todo' && !(await ask('¿Marcar las ' + lista.length + ' como transferidas por ' + fmt(suma(p, 'socio')) + '?', 'Confirmá'))) return;
        var fe = await pedir('¿Qué día le transferiste?', isoMas(0), 'Transferencia al socio'); if (!fe) return;
        var r2 = await db().rpc('marcar_transferido_socio', { ids: lista, fecha: fe });
        if (r2.error) return toast(r2.error.message, 'err');
        toast(n(r2.data.marcados, 'marcada'), 'ok'); return refrescar();
      }
      var al = alerta(id); if (!al) return;
      if (a === 'alt-ver') return verTarea(id, { onSave: refrescar });
      if (a === 'alt-hecha') return tareaHecha({ id: id, title: al.titulo, type: 'Administración' }, { onSave: refrescar });
      if (a === 'alt-posp') {
        var fp = await pedir('¿Para qué fecha lo posponés?\n\n' + (al.titulo || ''), isoMas(30), 'Posponer'); if (!fp) return;
        var nota = (await pedir('¿Por qué? (queda registrado, opcional)', '', 'Posponer')) || '';
        var r3 = await db().rpc('posponer_alerta', { tid: id, fecha: fp, nota: nota });
        if (r3.error) return toast(r3.error.message, 'err');
        toast('Pospuesta al ' + ff(fp), 'ok'); return refrescar();
      }
    };
  };
  // Del menú lateral: otra subpantalla, sin releer (Facturación se lee la primera vez que se abre)
  VISTAS.admin.irA = async function (s) {
    if (!SUBS.some(function (x) { return x[0] === s; })) return;
    var el = document.getElementById('vista');
    A.sub = s;
    if (s === 'fact' && !A.f) { el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando Facturación…</div>'; await cargarFact(); }
    pintar(el); window.scrollTo(0, 0);
  };
  VISTAS.admin.precargar = cargar;
})();

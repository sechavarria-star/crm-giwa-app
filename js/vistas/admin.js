/* ══════════════════════════════════════════════════════════════════════
   vistas/admin.js · Administración
   ──────────────────────────────────────────────────────────────────────
   Reemplaza Admin_Index.html + _ResumenAdm.html. Por ahora el Dashboard;
   las otras vistas (Facturación, Gastos, IPC y TC, Impuestos, Tipos) abren
   el CRM actual hasta que pasen.

   Dashboard: cada número sale de una vista de la base, validada contra
   getResumenAdmin. Acá no se suma plata: sólo se agrupa y se muestra (los
   totales de una lista son la suma de lo que la vista ya calculó).

   Orden de la plata: tablero → qué falta cobrar → qué ajustar → qué
   facturar → qué transferirle al socio → otros recordatorios → gastos.

   PENDIENTE: «Facturar» (Cargar factura y mail, al final de la etapa 4),
   la ventana de ajuste IPC y Renovar, y «Faltan recordatorios».
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var A = { d: null, sub: 'dash', gastosMes: null, abiertos: {} };
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
      db().rpc('umbral', { clave: 'alerta_cobro_vencido_dias', por_defecto: 30 })
    ];
    var r = await Promise.all(q);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    A.d = { cobros: r[0].data, mens: r[1].data, saldos: r[2].data, sinDes: r[3].data, aj: r[4].data,
            rep: r[5].data, alertas: r[6].data, gastos: r[7].data,
            ultimoIpc: (r[8].data[0] || {}).mes || '', diasVenc: Number(r[9].data) || 30 };
  }

  // ── ayudas ───────────────────────────────────────────────────
  function suma(arr, k) { return arr.reduce(function (a, x) { return a + (Number(x[k]) || 0); }, 0); }
  function n(x, s, p) { return x + ' ' + (x === 1 ? s : (p || s + 's')); }
  function viejo() { return '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">'; }
  // Sección plegable con el conteo y el total en el título; recuerda si estaba abierta
  function sec(k, tit, cnt, extra, cuerpo) {
    return '<details class="desp" data-sec="' + esc(k) + '"' + (A.abiertos[k] ? ' open' : '') + '><summary class="u-row8">' +
      '<span>' + tit + '</span><span class="cnt">' + cnt + '</span>' + (extra || '') + '</summary><div>' + cuerpo + '</div></details>';
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

  // ── 2 · pendiente de cobrar, por empresa, con selección ──────
  function pendiente(D) {
    var tot = suma(D.cobros, 'monto');
    if (!D.cobros.length) return sec('cob', 'Pendiente de cobrar', 0, '', '<div class="empty u-p10">Todo cobrado.</div>');
    var por = {}, orden = [];
    D.cobros.forEach(function (c) { var k = c.empresa || '— sin empresa —'; if (!por[k]) { por[k] = []; orden.push(k); } por[k].push(c); });
    orden.sort();
    var h = '<div class="card u-p0 u-ovx" id="pc-wrap"><table class="tbl"><tbody>' +
      '<tr><td colspan="5"><label class="u-s11 u-fw6"><input type="checkbox" data-pc="todas"> Seleccionar todas</label></td></tr>';
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
      '<input type="date" id="pc-fecha" class="fc u-wauto u-mla" value="' + isoMas(0) + '" aria-label="Fecha">' +
      '<button class="btn bp xs" data-adm="pc-reg" data-campo="fecha_deposito" disabled>Depósito</button>' +
      '<button class="btn bp xs" data-adm="pc-reg" data-campo="fecha_transf" disabled>Transferencia</button></div></div>';
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
    var all = document.querySelector('#pc-wrap [data-pc=todas]'), fcs = document.querySelectorAll('#pc-wrap [data-pc=fc]');
    if (all) all.checked = fcs.length > 0 && sel.length === fcs.length;
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
    var tabla = function (tit, arr) {
      if (!arr.length) return '';
      return '<div class="sec u-mt6">' + tit + ' · ' + fmt(suma(arr, 'monto')) + '</div><table class="tbl"><tbody>' + arr.map(function (f) {
        return '<tr><td><b>' + esc(f.titulo || '—') + '</b><div class="u-s10-mt">' + esc(f.ctx.filter(Boolean).join(' · ')) + '</div></td>' +
          '<td class="u-td-mt-r">' + esc(f.det || '') + '</td>' +
          '<td class="u-td-mt-r">' + (f.vence ? ico('calendario') + ' ' + esc(ff(f.vence)) : '') + '</td>' +
          '<td class="m ' + f.cls + ' u-tr">' + fmt(f.monto) + '</td>' +
          '<td class="u-tr">' + viejo() + ico('abrir') + ' Facturar</a></td></tr>';
      }).join('') + '</tbody></table>';
    };
    var h = fil.length ? '' : '<div class="empty u-p10">Nada pendiente de facturar.</div>';
    h += tabla('Toca facturar', g.toca) + tabla('Sin alerta (se crea en la próxima sincronización)', g.sin);
    if (g.prox.length) h += '<details class="desp plano u-mt6"><summary class="u-s11-mt">Próximas · ' + g.prox.length + '</summary>' + tabla('Próximas', g.prox) + '</details>';
    // Una factura cargada sin desarrollo no tiene de dónde descontarse: por eso
    // algo ya facturado puede seguir apareciendo arriba.
    if (D.sinDes.length) {
      h += '<div class="aviso aviso-wa u-mt8">' + ico('alerta') + ' ' + n(D.sinDes.length, 'factura') + ' sin desarrollo asignado · por esto algo ya facturado puede seguir apareciendo arriba' +
        '<table class="tbl u-mt6"><tbody>' + D.sinDes.map(function (x) {
          return '<tr><td class="u-fw6">' + esc(x.empresa || '—') + '</td><td class="u-c-mt">' + esc(x.proyecto || '—') + '</td>' +
            '<td class="u-c-mt">' + (x.nro ? 'FC ' + esc(x.nro) : esc(x.concepto || '—')) + '</td><td class="m m-pendiente u-tr">' + fmt(x.monto) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return sec('fact', ico('plata') + ' Facturación', g.toca.length + g.sin.length, '<span class="m m-abono u-s11 u-mla">' + fmt(suma(g.toca.concat(g.sin), 'monto')) + '</span>', h);
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
    return sec('alt', 'Otros recordatorios', alts.length, '', h || '<div class="empty u-p10">Nada pendiente.</div>');
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

  // ── pintar ───────────────────────────────────────────────────
  function pintar(el) {
    var cab = '<div class="page-h"><div><h2>Administración</h2><div class="page-s">Facturación, cobros y gastos.</div></div></div>' +
      '<div class="ptabs" role="tablist">' + SUBS.map(function (s) {
        return '<button class="ptab' + (A.sub === s[0] ? ' on' : '') + '" data-adm="sub" data-s="' + s[0] + '" role="tab">' + s[1] + '</button>';
      }).join('') + '</div>';
    if (A.sub !== 'dash') {
      el.innerHTML = cab + '<div class="card"><p>Esta vista todavía funciona en el CRM actual.</p>' + viejo() + ico('abrir') + ' Abrir el CRM actual</a></div>';
      return;
    }
    var D = A.d;
    el.innerHTML = cab + tablero(D) + pendiente(D) + ajustes(D) + facturacion(D) + socio(D) + otros(D) + gastos(D);
  }

  VISTAS.admin = async function (el) {
    el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando Administración…</div>';
    var refrescar = async function () { await cargar(); pintar(el); };
    await refrescar();
    var alerta = function (id) { return A.d.alertas.find(function (a) { return a.id === id; }); };
    if (!el._admToggle) {                      // una vez: #vista es el mismo para todos los módulos
      el._admToggle = true;
      el.addEventListener('toggle', function (ev) {
        var d = ev.target; if (d.matches && d.matches('details[data-sec]')) A.abiertos[d.getAttribute('data-sec')] = d.open;
      }, true);
    }
    el.onchange = function (ev) {
      var t = ev.target;
      if (t.id === 'adm-gmes') { A.gastosMes = t.value; return pintar(el); }
      var pc = t.getAttribute && t.getAttribute('data-pc');
      if (pc === 'todas') document.querySelectorAll('#pc-wrap [data-pc=fc], #pc-wrap [data-pc=emp]').forEach(function (x) { x.checked = t.checked; });
      if (pc === 'emp') document.querySelectorAll('#pc-wrap [data-pc=fc][data-e="' + t.getAttribute('data-e') + '"]').forEach(function (x) { x.checked = t.checked; });
      if (pc) pcBarra();
    };
    el.onclick = async function (ev) {
      var b = ev.target.closest('[data-adm]'); if (!b) return;
      var a = b.getAttribute('data-adm'), id = b.getAttribute('data-id');
      if (a === 'sub') { A.sub = b.getAttribute('data-s'); return pintar(el); }
      if (a === 'pc-reg') {
        var ids = Array.prototype.map.call(document.querySelectorAll('#pc-wrap [data-pc=fc]:checked'), function (x) { return x.getAttribute('data-id'); });
        var f = (document.getElementById('pc-fecha') || {}).value;
        if (!ids.length) return; if (!f) return toast('Elegí la fecha', 'err');
        var r = await db().rpc('marcar_fecha_cobros', { ids: ids, campo: b.getAttribute('data-campo'), fecha: f });
        if (r.error) return toast(r.error.message, 'err');
        toast(n(r.data.marcados, 'registrada'), 'ok'); return refrescar();
      }
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
})();

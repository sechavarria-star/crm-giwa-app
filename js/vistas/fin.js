/* ══════════════════════════════════════════════════════════════════════
   vistas/fin.js · Estado financiero
   ──────────────────────────────────────────────────────────────────────
   El «Resumen Financiero» del Portal (Index.html · tab-fin), como módulo propio.
   Cada número sale de una vista de la base:
     los 7 recuadros            v_resumen_financiero + v_fin_caja_mes (= getDashboardFinanciero)
     Por cliente                v_resumen_por_empresa; el detalle, v_proyectos_clasif (es_ganado)
     Análisis por cliente       v_analisis_clientes (= getAnalisisCliente)
     ¿Dónde podríamos estar?    v_fin_escenarios (= getProyeccion)
     Proyección 12 meses        v_proyeccion_12m + v_proy_sin_fecha
     Negocios a seguir          v_fin_negocios (= getNegociosASeguir)
   Acá no se calcula plata: se muestra lo que da la base. Lo único que se suma
   es lo tildado en «¿Dónde podríamos estar?», que es un «¿y si…?» (igual que el Portal).
   Los gráficos son SVG propios: la app no tiene librería de gráficos.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var F = { d: null, abiertos: {}, ab: {}, esc: {} };

  async function cargar() {
    var r = await Promise.all([
      db().from('v_resumen_financiero').select('*').maybeSingle(),
      db().from('v_fin_caja_mes').select('*').maybeSingle(),
      db().from('v_resumen_por_empresa').select('*').order('contratado', { ascending: false, nullsFirst: false }),
      db().from('v_proyectos_clasif').select('id,empresa,nombre,estado_proyecto,monto_final_ars,cobrado_dev,saldo,bonificacion,bonificacion_mant,recurrente_mensual,cobrado_mant').eq('es_ganado', true),
      db().from('v_analisis_clientes').select('*').order('nombre'),
      db().from('v_fin_escenarios').select('*').order('por_mes', { ascending: false }).order('una_vez', { ascending: false }),
      db().from('v_proyeccion_12m').select('*').order('orden'),
      db().from('v_proy_sin_fecha').select('*'),
      db().from('v_fin_negocios').select('*').order('esperado', { ascending: false }),
      db().from('v_proyectos_clasif').select('id,estado_proyecto')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    F.d = { res: r[0].data || {}, caja: (r[1].data || {}).cobrado_mes || 0, emp: r[2].data, proy: r[3].data, an: r[4].data,
            esc: r[5].data, p12: r[6].data, sinFecha: r[7].data, neg: r[8].data,
            estProy: r[9].data.reduce(function (o, p) { o[p.id] = _canonProy(p.estado_proyecto); return o; }, {}) };
  }

  // ── ayudas ───────────────────────────────────────────────────
  function N(x) { return Number(x) || 0; }
  function chev() { return '<span class="chev">' + ico('derecha') + '</span>'; }
  function sec(k, tit, cnt, total, cuerpo) {
    return '<details class="desp adm-desp" data-fsec="' + k + '"' + (F.abiertos[k] ? ' open' : '') + '><summary>' + chev() +
      '<span class="adm-tit">' + tit + '</span>' + (cnt !== '' ? '<span class="cnt">' + cnt + '</span>' : '') +
      (total ? '<span class="adm-total">' + total + '</span>' : '') + '</summary><div class="adm-cuerpo">' + cuerpo + '</div></details>';
  }
  function td(v, cls, neg) { return '<td class="m u-tr' + (cls ? ' ' + cls : '') + '">' + (v ? (neg ? '−' : '') + fmt(Math.abs(v)) : '—') + '</td>'; }

  // ── los 7 recuadros (_kpisFin) · s = lo tildado en «¿Dónde podríamos estar?» ──
  function kpis(s) {
    var d = F.d.res; s = s || { u: 0, m: 0, det: 0, neg: 0 };
    var pct = function (v, t) { return t > 0 ? Math.round(v * 100 / t) + '% sobre el total' : '—'; };
    var mas = function (v) { return v > 0 ? ' <span class="u-c-ok">(+' + fmt(v) + ')</span>' : (v < 0 ? ' <span class="u-c-mt">(−' + fmt(-v) + ')</span>' : ''); };
    var tot = N(d.cobrado) + s.u, dev = N(d.cobrado_dev) + s.u, mant = N(d.cobrado_mant), mrr = N(d.contratado_mant_mes || d.recurrente_mensual) + s.m;
    var k = [
      ['Facturado total', fmt(tot), N(d.cant_ganados) + ' proyectos · MRR ' + fmt(mrr) + mas(s.u), 'k-neutro'],
      ['Cobrado desarrollos', fmt(dev), pct(dev, tot) + mas(s.u), 'k-cobrado'],
      ['Cobrado abonos', fmt(mant), pct(mant, tot), 'k-abono'],
      ['Cobrado este mes', fmt(F.d.caja), 'caja del mes', 'k-cobrado'],
      ['Contratado mant. / mes', fmt(mrr), 'suma de las cuotas por mes' + mas(s.m), 'k-abono'],
      ['Detenido', fmt(Math.max(0, N(d.detenido) - s.det)), 'contratado, pero frenado' + mas(-s.det), 'k-neutro'],
      ['En negociación', fmt(Math.max(0, N(d.monto_negociacion) - s.neg)), N(d.cant_negociacion) + ' proyectos · ' + N(d.dev_negociacion) + ' desarrollos' + mas(-s.neg), 'k-negociacion']
    ];
    return k.map(function (x) {
      return '<div class="kpi ' + x[3] + '"><div class="kpi-lbl">' + x[0] + '</div><div class="kpi-val">' + x[1] + '</div><div class="kpi-sub">' + x[2] + '</div></div>';
    }).join('');
  }

  // ── Cobrado vs Contratado por empresa (las 6 más grandes) ──
  function grafEmpresas() {
    var e = F.d.emp.filter(function (x) { return N(x.contratado) > 0; }).slice(0, 6);
    if (!e.length) return '<div class="empty">Sin datos.</div>';
    var max = Math.max.apply(null, e.map(function (x) { return Math.max(N(x.contratado), N(x.cobrado)); }));
    return '<div class="fin-barras">' + e.map(function (x) {
      return '<div class="fin-bf"><span class="fin-bn" title="' + esc(x.empresa) + '">' + esc(x.empresa) + '</span><div class="fin-bb">' +
        '<i class="fin-c" style="width:' + (N(x.contratado) * 100 / max).toFixed(1) + '%" title="Contratado ' + fmt(x.contratado) + '"></i>' +
        '<i class="fin-k" style="width:' + (N(x.cobrado) * 100 / max).toFixed(1) + '%" title="Cobrado ' + fmt(x.cobrado) + '"></i></div>' +
        '<span class="m m-contratado u-tr">' + fmt(x.contratado) + '</span><span class="m m-cobrado u-tr">' + fmt(x.cobrado) + '</span></div>';
    }).join('') + '<div class="fin-ley"><span><i class="fin-c"></i> Contratado</span><span><i class="fin-k"></i> Cobrado</span></div></div>';
  }

  // ── Por cliente: el cliente y adentro sus proyectos ──
  function porCliente() {
    var E = F.d.emp; if (!E.length) return '<div class="empty">Sin datos.</div>';
    var hayBon = E.some(function (x) { return N(x.bonificado) > 1; });
    var h = '<div class="u-ovx"><table class="tbl"><thead><tr><th>Cliente / Proyecto</th><th class="u-tr">Contratado</th><th class="u-tr">Cobrado</th>' +
      (hayBon ? '<th class="u-tr">Bonificación</th>' : '') + '<th class="u-tr">Saldo</th><th class="u-tr">Abono / mes</th><th class="u-tr">Cobrado abono</th></tr></thead><tbody>';
    var t = { c: 0, k: 0, b: 0, s: 0, m: 0, cm: 0 };
    E.forEach(function (x) {
      var ab = !!F.ab[x.empresa];
      t.c += N(x.contratado); t.k += N(x.cobrado); t.b += N(x.bonificado); t.s += N(x.saldo); t.m += N(x.mant_mes); t.cm += N(x.cobrado_mant);
      h += '<tr class="fin-cli" data-fcli="' + esc(x.empresa) + '"><td class="u-nw"><span class="chev' + (ab ? ' on' : '') + '">' + ico('derecha') + '</span> ' + esc(x.empresa) + '</td>' +
        td(N(x.contratado), 'm-contratado') + td(N(x.cobrado), 'm-cobrado') + (hayBon ? td(N(x.bonificado), 'm-neutro', true) : '') +
        td(N(x.saldo), N(x.saldo) < 0 ? 'm-neutro' : 'm-pendiente') + td(N(x.mant_mes), 'm-abono') + td(N(x.cobrado_mant), 'm-abono') + '</tr>';
      if (ab) F.d.proy.filter(function (p) { return p.empresa === x.empresa; }).forEach(function (p) {
        h += '<tr class="fin-pro"><td>' + esc(p.nombre || '—') + ' <span class="u-s10-mt">' + esc(p.estado_proyecto || '') + '</span></td>' +
          td(N(p.monto_final_ars)) + td(N(p.cobrado_dev)) + (hayBon ? td(N(p.bonificacion) + N(p.bonificacion_mant), '', true) : '') +
          td(N(p.saldo)) + td(N(p.recurrente_mensual)) + td(N(p.cobrado_mant)) + '</tr>';
      });
    });
    h += '<tr class="fin-tot"><td>Total</td>' + td(t.c, 'm-contratado') + td(t.k, 'm-cobrado') + (hayBon ? td(t.b, 'm-neutro', true) : '') +
      td(t.s, 'm-pendiente') + td(t.m, 'm-abono') + td(t.cm, 'm-abono') + '</tr></tbody></table></div>';
    return h;
  }

  // ── Análisis por cliente (lo que guardó el Cotizador; no se recalcula) ──
  // Análisis por cliente (29/10/2026): sólo lo vigente. Cuentan los desarrollos de
  // proyectos aprobados, activos o en negociación; lo histórico (finalizado,
  // rechazado, prospecto) queda afuera. Los totales se rehacen con esos
  // desarrollos, con la misma cuenta que la vista: margen = cobrado − referencia.
  function analisis() {
    var A = clientesVigentes();
    if (!A.length) return '<div class="empty">Ningún cliente con proyectos aprobados, activos o en negociación.</div>';
    return tablaAnalisis(A);
  }
  function clientesVigentes() {
    var V = { aprobado: 1, activo: 1, negociacion: 1 }, E = F.d.estProy;
    var A = F.d.an.map(function (c) {
      var ds = (c.devs || []).filter(function (d) { return V[E[d.proyecto_id]]; }); if (!ds.length) return null;
      var ref = 0, pre = 0, mmr = 0, neg = ds.some(function (d) { return E[d.proyecto_id] === 'negociacion'; });
      ds.forEach(function (d) { ref += N(d.referencia); pre += N(d.precio); mmr += N(d.mmr); });
      return { nombre: c.nombre || c.empresa, ref: ref, pre: pre, mmr: mmr, dif: pre - ref, neg: neg };
    }).filter(Boolean);
    return A;
  }
  function tablaAnalisis(A) {
    return '<div class="u-ovx"><table class="tbl"><thead><tr><th>Cliente</th><th class="u-tr">Referencia</th><th class="u-tr">Cobrado</th><th class="u-tr">Margen neto proyectado</th>' +
      '<th class="u-tr">Abono / mes</th><th class="u-tr">Proyección anual de abono (12m)</th><th class="u-tr">Con 12 meses</th><th class="u-tr">Con 24 meses</th><th>Estatus de viabilidad</th></tr></thead><tbody>' + A.map(function (c) {
        var meses = c.dif < 0 && c.mmr ? Math.ceil(-c.dif / c.mmr) : 0;
        var lect = c.dif < 0 ? (c.mmr ? 'faltan ' + meses + ' mes(es) de abono' : 'sin abono que lo compense') : 'igual o arriba de la referencia';
        var sinAbono = !c.mmr && c.neg;   // en negociación y sin abono: costo de oportunidad, en rojo
        return '<tr><td>' + esc(c.nombre || '—') + '</td>' + td(c.ref) + td(c.pre, 'm-cobrado') +
          td(c.dif, c.dif < 0 ? 'm-pendiente' : 'm-cobrado', c.dif < 0) + td(c.mmr, 'm-abono') +
          (sinAbono ? '<td class="m u-tr u-c-rd" title="En negociación y sin abono">' + fmt(0) + '</td>' : td(c.mmr * 12, 'm-abono')) +
          td(c.dif + c.mmr * 12, '', c.dif + c.mmr * 12 < 0) + td(c.dif + c.mmr * 24, '', c.dif + c.mmr * 24 < 0) +
          '<td class="u-s10-mt">' + esc(lect) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ── ¿Dónde podríamos estar? · tildá los negocios y a la derecha se suman ──
  function escenarios() {
    var E = F.d.esc, s = { u: 0, m: 0, det: 0, neg: 0 }, n = 0;
    E.forEach(function (x) {
      if (!F.esc[x.proy_id]) return; n++;
      s.u += N(x.una_vez); s.m += N(x.por_mes);
      if (x.origen === 'detenido') s.det += N(x.una_vez); else if (/negoci/i.test(x.estado || '')) s.neg += N(x.una_vez);
    });
    var izq = E.length ? E.map(function (x) {
      return '<label class="fin-esc"><input type="checkbox" data-fesc="' + esc(x.proy_id) + '"' + (F.esc[x.proy_id] ? ' checked' : '') + '>' +
        '<span class="fin-esc-e">' + esc(x.empresa) + '</span><span class="u-f1m u-corta">' + esc(x.proyecto) +
        (x.origen === 'detenido' ? ' <span class="u-c-rd u-s10">' + ico('pausa') + ' detenido</span>' : '') + '</span>' +
        (N(x.una_vez) ? '<span class="m m-contratado">+' + fmt(x.una_vez) + '</span>' : '') +
        (N(x.por_mes) ? '<span class="m m-abono">+' + fmt(x.por_mes) + '/mes</span>' : '') + '</label>';
    }).join('') + '<div class="ft-info u-mt6">' + (n ? 'Sumando a la derecha · destildá para sacarlo.' : 'Tildá los negocios que quieras combinar.') + '</div>'
      : '<div class="u-s11-mt">Nada en pipeline ni detenido para simular.</div>';
    return '<div class="fin-dos"><div>' + izq + '</div><div><div class="sec">' + (n ? 'Situación actual + ' + n + (n === 1 ? ' negocio' : ' negocios') : 'Situación actual') + '</div>' +
      '<div class="kpi-grid fin-sim">' + kpis(s) + '</div></div></div>';
  }

  // ── Proyección próximos 12 meses: tabla y gráfico con los mismos números ──
  function proyeccion() {
    var P = F.d.p12; if (!P.length) return '<div class="empty">Sin proyectos activos para proyectar.</div>';
    var t = { d: 0, m: 0, g: 0 };
    var h = '<div class="u-ovx"><table class="tbl"><thead><tr><th>Mes</th><th class="u-tr">Desarrollo</th><th class="u-tr">Mantenimiento</th><th class="u-tr">Total</th>' +
      '<th class="u-tr">Gastos</th><th class="u-tr">Neto</th></tr></thead><tbody>' + P.map(function (m) {
        t.d += N(m.desarrollo); t.m += N(m.mantenimiento); t.g += N(m.gastos);
        return '<tr><td>' + esc(m.etiqueta || m.mes) + '</td>' + td(N(m.desarrollo)) + td(N(m.mantenimiento), 'm-abono') + td(N(m.total)) +
          td(N(m.gastos), 'm-pendiente', true) + td(N(m.neto), N(m.neto) >= 0 ? 'm-cobrado' : 'u-c-rd', N(m.neto) < 0) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="ft-info u-mt6">12 meses — Desarrollo <span class="m">' + fmt(t.d) + '</span> · Mantenimiento <span class="m m-abono">' + fmt(t.m) + '</span> · Gastos <span class="m m-pendiente">' + fmt(t.g) + '</span></div>' +
      '<div class="ft-info">Gastos = gastos internos del mes, sin impuestos. Desarrollo = saldo de cada desarrollo repartido según su modelo de pago.</div>';
    var sf = F.d.sinFecha.map(function (x) { return x.texto; }).filter(Boolean);
    if (sf.length) h += '<div class="aviso aviso-wa u-mt8">' + ico('alerta') + ' ' + sf.length + ' desarrollo(s) sin fecha de cierre: ahí la proyección se estima por duración. ' +
      '<span class="u-c-mt">' + sf.map(esc).join(' · ') + '</span></div>';
    return '<div class="fin-dos"><div>' + h + '</div><div><div class="sec">Mes a mes</div>' + grafMeses(P) + '</div></div>';
  }
  function grafMeses(P) {
    var W = 420, H = 220, pad = 24, n = P.length, bw = (W - pad) / n;
    var max = Math.max.apply(null, P.map(function (m) { return Math.max(N(m.total), N(m.neto)); })) || 1;
    var y = function (v) { return H - pad - (Math.max(0, v) * (H - pad * 2) / max); };
    var barras = P.map(function (m, i) {
      var x = pad + i * bw + bw * 0.15, w = bw * 0.7, yd = y(N(m.desarrollo)), ym = y(N(m.desarrollo) + N(m.mantenimiento));
      return '<rect class="fin-sd" x="' + x.toFixed(1) + '" y="' + yd.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (H - pad - yd).toFixed(1) + '"><title>Desarrollo ' + fmt(m.desarrollo) + '</title></rect>' +
        '<rect class="fin-sm" x="' + x.toFixed(1) + '" y="' + ym.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (yd - ym).toFixed(1) + '"><title>Mantenimiento ' + fmt(m.mantenimiento) + '</title></rect>' +
        '<text class="fin-st" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '">' + esc(m.etiqueta || '') + '</text>';
    }).join('');
    var linea = P.map(function (m, i) { return (pad + i * bw + bw / 2).toFixed(1) + ',' + y(N(m.neto)).toFixed(1); }).join(' ');
    return '<svg class="fin-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Proyección mes a mes">' + barras +
      '<polyline class="fin-sn" points="' + linea + '"><title>Neto</title></polyline></svg>' +
      '<div class="fin-ley"><span><i class="fin-sd"></i> Desarrollo</span><span><i class="fin-sm"></i> Mantenimiento</span><span><i class="fin-sn"></i> Neto</span></div>';
  }

  // ── Negocios a seguir: el pipeline por valor esperado (monto × probabilidad) ──
  function negocios() {
    var G = F.d.neg; if (!G.length) return '<div class="empty">Nada en pipeline.</div>';
    return '<div class="u-ovx"><table class="tbl"><thead><tr><th>Empresa</th><th>Proyecto</th><th>Estado</th><th class="u-tr">Desarrollos</th><th class="u-tr">Abono / mes</th>' +
      '<th class="u-tr">Prob</th><th class="u-tr">Esperado</th></tr></thead><tbody>' + G.slice(0, 10).map(function (o) {
        var cls = /negoc/i.test(o.estado || '') ? 't-xw' : 't-xm';
        return '<tr><td>' + esc(o.empresa || '') + '</td><td>' + esc(o.nombre || '') + '</td><td class="' + cls + '">' + esc(o.estado || '') + '</td>' +
          td(N(o.monto), 'm-pendiente') + td(N(o.mant_mes), 'm-abono') + '<td class="m u-tr">' + N(o.prob) + '%</td>' + td(N(o.esperado), 'm-cobrado') + '</tr>';
      }).join('') + '</tbody></table></div>' + (G.length > 10 ? '<div class="ft-info u-mt6">Los 10 de mayor esperado, de ' + G.length + '.</div>' : '');
  }

  function pintar(el) {
    if (_montado !== 'fin') return;
    var D = F.d;
    el.innerHTML = '<div class="page-h"><div><h2>Estado financiero</h2><div class="page-s">Cómo está parado el negocio: lo cobrado, lo contratado y lo que viene.</div></div></div>' +
      '<div class="kpi-grid u-mb12">' + kpis() + '</div>' +
      sec('an', 'Análisis por cliente', clientesVigentes().length, '', analisis()) +
      sec('graf', 'Cobrado vs Contratado por empresa', '', '', grafEmpresas()) +
      sec('cli', 'Por cliente', D.emp.length, '<span class="m m-contratado">' + fmt(D.emp.reduce(function (a, x) { return a + N(x.contratado); }, 0)) + '</span>', porCliente()) +
      sec('esc', '¿Dónde podríamos estar?', D.esc.length, '', escenarios()) +
      sec('p12', 'Proyección próximos 12 meses', '', '', proyeccion()) +
      sec('neg', 'Negocios a seguir', D.neg.length, '', negocios());
  }

  VISTAS.fin = async function (el, op) {
    await abrirModulo(el, { id: 'fin', texto: 'Cargando el estado financiero…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return !!F.d; }, firma: function () { return JSON.stringify(F.d); }, pintar: function () { pintar(el); } });
    if (!el._finToggle) {                       // recordar qué desplegable quedó abierto
      el._finToggle = true;
      el.addEventListener('toggle', function (ev) { var d = ev.target; if (d.matches && d.matches('details[data-fsec]')) F.abiertos[d.getAttribute('data-fsec')] = d.open; }, true);
    }
    el.onclick = function (ev) {
      if (_montado !== 'fin') return;
      var c = ev.target.closest('[data-fcli]'); if (c) { var e = c.getAttribute('data-fcli'); F.ab[e] = !F.ab[e]; return pintar(el); }
    };
    el.onchange = function (ev) {
      if (_montado !== 'fin') return;
      var t = ev.target, id = t.getAttribute && t.getAttribute('data-fesc'); if (!id) return;
      F.esc[id] = t.checked; pintar(el);
    };
  };
  VISTAS.fin.precargar = cargar;
})();

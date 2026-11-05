/* ══════════════════════════════════════════════════════════════════════
   vistas/fin.js · Estado financiero
   ──────────────────────────────────────────────────────────────────────
   El «Resumen Financiero» del Portal (Index.html · tab-fin), como módulo propio.
   Cada número sale de una vista de la base:
     los 7 recuadros            v_resumen_financiero + v_fin_caja_mes (= getDashboardFinanciero)
     Análisis por Cliente       v_resumen_por_empresa; el detalle, v_proyectos_clasif (es_ganado);
                                margen y referencia, v_analisis_clientes (= getAnalisisCliente)
     ¿Dónde podríamos estar?    la lista, sin detenidos: v_fin_escenarios (= getProyeccion) y v_fin_no_aceptados. El gráfico:
                                barras = abonos (v_proyeccion_12m) + el fee de lo tildado; líneas = ventas de proyectos
                                de v_fin_ventas_mes (forecast = venta × probabilidad; lo tildado, al 100%). La línea
                                punteada es el target de facturación mensual, que se carga en Configuración › Targets.
     Negocios a seguir          v_fin_negocios (= getNegociosASeguir)
   Acá no se calcula plata: se muestra lo que da la base. Lo único que se suma
   es lo tildado en «¿Dónde podríamos estar?», que es un «¿y si…?» (igual que el Portal).
   Los gráficos son SVG propios: la app no tiene librería de gráficos.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var F = { d: null, tab: 'cli', ab: {}, esc: {} };

  async function cargar() {
    var r = await Promise.all([
      db().from('v_resumen_financiero').select('*').maybeSingle(),
      db().from('v_fin_caja_mes').select('*').maybeSingle(),
      db().from('v_resumen_por_empresa').select('*').order('contratado', { ascending: false, nullsFirst: false }),
      db().from('v_proyectos_clasif').select('id,empresa,nombre,estado_proyecto,monto_final_ars,cobrado_dev,saldo,bonificacion,bonificacion_mant,recurrente_mensual,cobrado_mant').eq('es_ganado', true),
      db().from('v_analisis_clientes').select('*').order('nombre'),
      db().from('v_fin_escenarios').select('*').order('por_mes', { ascending: false }).order('una_vez', { ascending: false }),
      db().from('v_proyeccion_12m').select('*').order('orden'),
      db().from('v_fin_ventas_mes').select('proy_id,orden,prob,venta,fee'),
      db().from('v_fin_negocios').select('*').order('esperado', { ascending: false }),
      db().from('v_proyectos_clasif').select('id,estado_proyecto'),
      db().from('v_pm_proyectos').select('empresa,items'),
      db().from('v_fin_no_aceptados').select('*').order('una_vez', { ascending: false }),
      db().from('cot_config').select('clave,valor').eq('clave', 'target_fee_mensual')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    F.d = { res: r[0].data || {}, caja: (r[1].data || {}).cobrado_mes || 0, emp: r[2].data, proy: r[3].data, an: r[4].data,
            esc: r[5].data, p12: r[6].data, vm: r[7].data, neg: r[8].data,
            proyItems: r[10].data, noAc: r[11].data,
            target: N((r[12].data[0] || {}).valor),
            estProy: r[9].data.reduce(function (o, p) { o[p.id] = _canonProy(p.estado_proyecto); return o; }, {}) };
  }

  // ── ayudas ───────────────────────────────────────────────────
  function N(x) { return Number(x) || 0; }
  function chev() { return '<span class="chev">' + ico('derecha') + '</span>'; }
  function td(v, cls, neg) { return '<td class="m u-tr' + (cls ? ' ' + cls : '') + '">' + (v ? (neg ? '−' : '') + fmt(Math.abs(v)) : '—') + '</td>'; }

  // ── los 7 recuadros (_kpisFin): lo actual ──
  function kpis() {
    var d = F.d.res;
    var pct = function (v, t) { return t > 0 ? Math.round(v * 100 / t) + '% sobre el total' : '—'; };
    var tot = N(d.cobrado), dev = N(d.cobrado_dev), mant = N(d.cobrado_mant), mrr = N(d.contratado_mant_mes || d.recurrente_mensual);
    var k = [
      ['Facturado total', fmt(tot), N(d.cant_ganados) + ' proyectos · MRR ' + fmt(mrr), 'k-neutro'],
      ['Cobrado desarrollos', fmt(dev), pct(dev, tot), 'k-cobrado'],
      ['Cobrado abonos', fmt(mant), pct(mant, tot), 'k-abono'],
      ['Cobrado este mes', fmt(F.d.caja), 'caja del mes', 'k-cobrado'],
      ['Contratado mant. / mes', fmt(mrr), 'suma de las cuotas por mes', 'k-abono'],
      ['Detenido', fmt(N(d.detenido)), 'contratado, pero frenado', 'k-neutro'],
      ['En negociación', fmt(N(d.monto_negociacion)), N(d.cant_negociacion) + ' proyectos · ' + N(d.dev_negociacion) + ' desarrollos', 'k-negociacion']
    ];
    return k.map(function (x) {
      return '<div class="kpi ' + x[3] + '"><div class="kpi-lbl">' + x[0] + '</div><div class="kpi-val">' + x[1] + '</div><div class="kpi-sub">' + x[2] + '</div></div>';
    }).join('');
  }


  // ── Por cliente: el cliente y adentro sus proyectos ──
  // Análisis por Cliente (05/11/2026): unifica «Por cliente» y «Análisis por cliente». Cada cliente se
  // despliega en sus proyectos (v_resumen_por_empresa, v_proyectos_clasif). Margen, proyección, referencia y
  // estatus salen de lo que guardó el Cotizador y sólo de lo vigente: aprobado, activo o en negociación.
  function clientesVigentes() {
    var V = { aprobado: 1, activo: 1, negociacion: 1 }, E = F.d.estProy;
    return F.d.an.map(function (c) {
      var ds = (c.devs || []).filter(function (d) { return V[E[d.proyecto_id]]; }); if (!ds.length) return null;
      var ref = 0, pre = 0, mmr = 0, neg = ds.some(function (d) { return E[d.proyecto_id] === 'negociacion'; });
      ds.forEach(function (d) { ref += N(d.referencia); pre += N(d.precio); mmr += N(d.mmr); });
      return { nombre: c.nombre || c.empresa, ref: ref, pre: pre, mmr: mmr, dif: pre - ref, neg: neg };
    }).filter(Boolean);
  }
  // Estatus: cuántos meses de abono hacen falta para cubrir lo que quedó abajo de la referencia
  function celdasAnalisis(c) {
    if (!c) return td(0) + td(0) + td(0) + '<td></td>';
    var meses = c.dif < 0 && c.mmr ? Math.ceil(-c.dif / c.mmr) : 0;
    var lect = c.dif < 0 ? (c.mmr ? 'Se compensa con ' + meses + (meses === 1 ? ' mes' : ' meses') + ' de abono' : 'Sin abono que lo compense') : 'Igual o arriba de la referencia';
    var sinAbono = !c.mmr && c.neg;   // en negociación y sin abono: costo de oportunidad, en rojo
    return (sinAbono ? '<td class="m u-tr u-c-rd" data-tip="En negociación y sin abono">' + fmt(0) + '</td>' : td(c.mmr * 12, 'm-abono')) +
      td(c.dif + c.mmr * 12, '', c.dif + c.mmr * 12 < 0) + td(c.ref) + '<td class="u-s10-mt">' + esc(lect) + '</td>';
  }
  function porCliente() {
    var interno = function (n) { return /^giwa/i.test(n || ''); };   // Giwa-IA no es un cliente
    var E = F.d.emp.filter(function (x) { return !interno(x.empresa); }), A = clientesVigentes().filter(function (c) { return !interno(c.nombre); });
    if (!E.length && !A.length) return '<div class="empty">Sin datos.</div>';
    var h = '<div class="u-ovx"><table class="tbl fin-an"><thead><tr><th>Cliente / Proyecto</th><th class="u-tr">Contratado</th><th class="u-tr">Cobrado</th>' +
      '<th class="u-tr">Saldo</th><th class="u-tr">Abono / mes</th><th class="u-tr">Cobrado abono</th>' +
      '<th class="u-tr">Proyección anual de abono (12m)</th><th class="u-tr">Con 12 meses</th><th class="u-tr">Referencia mercado</th><th>Estatus de viabilidad</th></tr></thead><tbody>';
    var t = { c: 0, k: 0, b: 0, s: 0, m: 0, cm: 0 }, usados = {};
    var deCliente = function (nom) { var c = A.find(function (a) { return a.nombre === nom; }); if (c) usados[nom] = 1; return c; };
    E.forEach(function (x) {
      var ab = !!F.ab[x.empresa];
      t.c += N(x.contratado); t.k += N(x.cobrado); t.b += N(x.bonificado); t.s += N(x.saldo); t.m += N(x.mant_mes); t.cm += N(x.cobrado_mant);
      h += '<tr class="fin-cli" data-fcli="' + esc(x.empresa) + '"><td><span class="chev' + (ab ? ' on' : '') + '">' + ico('derecha') + '</span> ' + esc(x.empresa) + '</td>' +
        td(N(x.contratado), 'm-contratado') + td(N(x.cobrado), 'm-cobrado') +
        td(N(x.saldo), N(x.saldo) < 0 ? 'm-neutro' : 'm-pendiente') + td(N(x.mant_mes), 'm-abono') + td(N(x.cobrado_mant), 'm-abono') + celdasAnalisis(deCliente(x.empresa)) + '</tr>';
      if (ab) F.d.proy.filter(function (p) { return p.empresa === x.empresa; }).forEach(function (p) {
        h += '<tr class="fin-pro"><td>' + esc(p.nombre || '—') + ' <span class="u-s10-mt">' + esc(p.estado_proyecto || '') + '</span></td>' +
          td(N(p.monto_final_ars)) + td(N(p.cobrado_dev)) +
          td(N(p.saldo)) + td(N(p.recurrente_mensual)) + td(N(p.cobrado_mant)) + '<td colspan="4"></td></tr>';
      });
    });
    // En negociación y todavía sin contratado: no están en el resumen, pero sí en el análisis
    A.filter(function (c) { return !usados[c.nombre]; }).forEach(function (c) {
      h += '<tr><td>' + esc(c.nombre || '—') + '</td>' + td(0) + td(0) + td(0) + td(c.mmr, 'm-abono') + td(0) + celdasAnalisis(c) + '</tr>';
    });
    h += '<tr class="fin-tot"><td>Total</td>' + td(t.c, 'm-contratado') + td(t.k, 'm-cobrado') +
      td(t.s, 'm-pendiente') + td(t.m, 'm-abono') + td(t.cm, 'm-abono') + '<td colspan="4"></td></tr></tbody></table></div>';
    return h;
  }

  // ── ¿Dónde podríamos estar? · tildá los negocios y el gráfico se mueve ──
  function escenarios() {
    var E = F.d.esc, NA = F.d.noAc || [];
    var fila = function (x) {
      return '<label class="fin-esc"><input type="checkbox" data-fesc="' + esc(x.proy_id) + '"' + (F.esc[x.proy_id] ? ' checked' : '') + '>' +
        '<span class="fin-esc-e">' + esc(x.empresa) + '</span><span class="u-f1m u-corta">' + esc(x.proyecto) +
        '</span>' +
        (N(x.una_vez) ? '<span class="m m-contratado">+' + fmt(x.una_vez) + '</span>' : '') +
        (N(x.por_mes) ? '<span class="m m-abono">+' + fmt(x.por_mes) + '/mes</span>' : '') + '</label>';
    };
    var izq = '<div class="ui-lat-h">Negocios en curso</div><div class="ui-nota-t u-mb8">Tildá los que querés sumar: su fee se apila en las barras y su venta va a la línea naranja.</div>' +
      (E.length ? E.map(fila).join('') : '<div class="ui-nota-t">Nada en pipeline.</div>') +
      (NA.length ? '<div class="ui-lat-h u-mt10">No aceptados</div>' + NA.map(fila).join('') : '');
    return '<div class="fin-dos"><div>' + izq + '</div><div id="fin-der" class="ui-tarjeta">' + simDerecha() + '</div></div>';
  }
  // Los 12 meses: abonos activos, fee y venta de lo tildado, forecast de ventas (venta × probabilidad)
  function simSeries() {
    var P = F.d.p12, z = function () { return P.map(function () { return 0; }); }, S = { ab: P.map(function (m) { return N(m.mantenimiento); }), fee: z(), vta: z(), fc: z(), n: 0 };
    (F.d.vm || []).forEach(function (r) {
      var i = r.orden; if (i == null || i < 0 || i >= P.length) return;
      S.fc[i] += N(r.venta) * N(r.prob) / 100;
      if (F.esc[r.proy_id]) { S.fee[i] += N(r.fee); S.vta[i] += N(r.venta); }
    });
    S.n = Object.keys(F.esc).filter(function (k) { return F.esc[k]; }).length;
    return S;
  }
  function simDerecha() {
    var S = simSeries(), T = F.d.target;
    var tot = S.ab.map(function (a, i) { return a + S.fee[i] + S.vta[i]; }), falta = T - (tot[1] || 0), llega = tot.filter(function (x) { return x >= T; }).length;
    var resp = !T ? 'Cargá el target de facturación mensual en Configuración › Targets.' :
      (S.n ? 'Con ' + S.n + (S.n === 1 ? ' negocio tildado' : ' negocios tildados') + ', ' : 'Con lo activo, ') +
      (falta > 0 ? 'al target del mes que viene le faltan <span class="ui-num">' + fmt(falta) + '</span>.' : 'el target del mes que viene está cubierto.') +
      ' Se llega al target en <b>' + llega + ' de ' + tot.length + '</b> meses.';
    return '<div class="fs-resp">' + resp + '</div><div class="sec">Facturación mensual · próximos 12 meses</div>' + grafVentas(S, T) +
      '<div class="fin-ley"><span class="fin-ley-g">Barras · abonos</span><span><i class="fs-l-ab"></i> Abonos activos</span><span><i class="fs-l-fee"></i> Fee mensual de lo tildado</span>' +
      '<span class="fin-ley-g">Líneas · ventas de proyectos</span><span><i class="fs-l-vta"></i> Ventas tildadas</span><span><i class="fs-l-fc"></i> Forecast de ventas (pipeline × probabilidad)</span>' +
      '<span><i class="fs-l-t"></i> Target de facturación mensual</span></div>' +
      '<div class="ft-info u-mt6">Cada negocio cierra a los 60 días de la propuesta (o el mes que viene, si ya pasó). La venta se cobra 50% al cerrar y 50% a los 2 meses; ' +
      'el fee, desde el mes de la firma y todos los meses siguientes. Lo tildado entra al 100%. El target se compara con el total del mes (abonos + ventas).</div>';
  }
  // Curva suave que no se pasa de los valores (Fritsch-Carlson): no inventa picos
  function curva(P) {
    var n = P.length, d = [], m = [], i, s = 'M' + P[0][0].toFixed(1) + ',' + P[0][1].toFixed(1);
    if (n < 2) return s;
    for (i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], t = a * a + b * b;
      if (t > 9) { t = 3 / Math.sqrt(t); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    for (i = 0; i < n - 1; i++) {
      var h = (P[i + 1][0] - P[i][0]) / 3;
      s += ' C' + (P[i][0] + h).toFixed(1) + ',' + (P[i][1] + m[i] * h).toFixed(1) + ' ' + (P[i + 1][0] - h).toFixed(1) + ',' + (P[i + 1][1] - m[i + 1] * h).toFixed(1) + ' ' + P[i + 1][0].toFixed(1) + ',' + P[i + 1][1].toFixed(1);
    }
    return s;
  }
  function grafVentas(S, T) {
    var P = F.d.p12, n = P.length; if (!n) return '<div class="empty">Sin meses para proyectar.</div>';
    var W = 640, H = 300, izq = 92, abajo = 24, arriba = 10, bw = (W - izq) / n;
    var tope = Math.max.apply(null, [T, 1].concat(S.ab.map(function (a, i) { return Math.max(a + S.fee[i], S.fc[i], S.vta[i]); })));
    var base = Math.pow(10, Math.floor(Math.log10(tope))), paso = [1, 2, 2.5, 5, 10].map(function (k) { return k * base / 2; }).find(function (x) { return tope / x <= 5; }) || base;
    var max = Math.ceil(tope / paso) * paso, piso = H - abajo, y = function (v) { return piso - v * (piso - arriba) / max; }, f = function (v) { return v.toFixed(1); };
    var cx = function (i) { return izq + i * bw + bw / 2; }, pts = function (V) { return V.map(function (v, i) { return [cx(i), y(v)]; }); };
    var h = '<defs><linearGradient id="fs-g-fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fs-st-fc1"/><stop offset="1" class="fs-st-fc2"/></linearGradient>' +
      '<linearGradient id="fs-g-ab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fs-st-ab1"/><stop offset="1" class="fs-st-ab2"/></linearGradient>' +
      '<linearGradient id="fs-g-fee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fs-st-fee1"/><stop offset="1" class="fs-st-fee2"/></linearGradient></defs>';
    for (var g = 0; g <= max + paso / 2; g += paso) h += '<line class="fs-grid" x1="' + izq + '" x2="' + W + '" y1="' + f(y(g)) + '" y2="' + f(y(g)) + '"/><text class="fs-eje" x="' + (izq - 6) + '" y="' + f(y(g) + 3) + '">' + fmt(g) + '</text>';
    // forecast de ventas: área suave por detrás de las barras
    var PF = pts(S.fc), dF = curva(PF);
    h += '<path class="fs-fc-a" d="' + dF + ' L' + f(PF[n - 1][0]) + ',' + piso + ' L' + f(PF[0][0]) + ',' + piso + ' Z"/>';
    // barras: abonos activos y, apilado, el fee de lo tildado
    S.ab.forEach(function (a, i) {
      var x = izq + i * bw + bw * 0.25, w = bw * 0.5, fe = S.fee[i];
      if (a > 0) h += '<rect class="fs-ab" x="' + f(x) + '" y="' + f(y(a)) + '" width="' + f(w) + '" height="' + f(piso - y(a)) + '" rx="3"/>';
      if (fe > 0) h += '<rect class="fs-fee2" x="' + f(x) + '" y="' + f(y(a + fe)) + '" width="' + f(w) + '" height="' + f(Math.max(0, y(a) - y(a + fe) - 1.5)) + '" rx="3"/>';
    });
    h += '<path class="fs-fc" d="' + dF + '"/>' + PF.map(function (p) { return '<circle class="fs-fc-p" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="2.5"/>'; }).join('');
    if (S.vta.some(function (v) { return v > 0; })) {
      var PV = pts(S.vta);
      h += '<path class="fs-vta" d="' + curva(PV) + '"/>' + PV.map(function (p) { return '<circle class="fs-vta-p" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="3"/>'; }).join('');
    }
    if (T) h += '<line class="fs-tg" x1="' + izq + '" x2="' + W + '" y1="' + f(y(T)) + '" y2="' + f(y(T)) + '"/><text class="fs-tg-t" x="' + (W - 2) + '" y="' + f(y(T) - 5) + '">Target ' + fmt(T) + '</text>';
    P.forEach(function (m, i) {
      h += '<text class="fs-mes" x="' + f(cx(i)) + '" y="' + (H - 7) + '">' + esc(m.etiqueta || '') + '</text>' +
        '<rect class="fs-hit" x="' + f(izq + i * bw) + '" y="0" width="' + f(bw) + '" height="' + piso + '"><title>' + esc(m.etiqueta || '') +
        '\nAbonos activos ' + fmt(Math.round(S.ab[i])) + (S.fee[i] ? '\nFee tildado ' + fmt(Math.round(S.fee[i])) : '') + (S.vta[i] ? '\nVentas tildadas ' + fmt(Math.round(S.vta[i])) : '') +
        '\nTotal ' + fmt(Math.round(S.ab[i] + S.fee[i] + S.vta[i])) + '\nForecast de ventas ' + fmt(Math.round(S.fc[i])) + (T ? '\nTarget ' + fmt(T) : '') + '</title></rect>';
    });
    return '<svg class="fin-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Facturación mensual de los próximos 12 meses: abonos, ventas de proyectos y target">' + h + '</svg>';
  }

  // ── Negocios a seguir: el pipeline por valor esperado (monto × probabilidad) ──
  function negocios() {
    var G = F.d.neg; if (!G.length) return '<div class="empty">Nada en pipeline.</div>';
    // El abono va por mes y, al lado y más apagado, su proyección anual (× 12). No suma al esperado (29/10/2026)
    return '<div class="ft-info u-mb8">Esperado = desarrollos × probabilidad. El abono va aparte: por mes y su proyección a 12 meses (abono × 12), si se firma.</div>' +
      '<div class="u-ovx"><table class="tbl"><thead><tr><th>Empresa</th><th>Proyecto</th><th>Estado</th><th class="u-tr">Desarrollos</th><th class="u-tr">Abono / mes</th>' +
      '<th class="u-tr" title="Abono mensual × 12: lo que sumaría en un año si se firma">Abono a 12 meses</th><th class="u-tr">Prob</th><th class="u-tr">Esperado</th></tr></thead><tbody>' + G.slice(0, 10).map(function (o) {
        var c = _canonProy(o.estado), cls = colorEstadoProy(o.estado).cls;
        return '<tr><td>' + esc(o.empresa || '') + '</td><td>' + esc(o.nombre || '') + '</td><td class="t-' + cls + '">' + esc(o.estado || '') + '</td>' +
          td(N(o.monto), 'm-pendiente') + td(N(o.mant_mes), 'm-abono') + td(N(o.mant_mes) * 12, 'm-abono u-op6') + '<td class="m u-tr">' + N(o.prob) + '%</td>' + td(N(o.esperado), 'm-cobrado') + '</tr>';
      }).join('') + '</tbody></table></div>' + (G.length > 10 ? '<div class="ft-info u-mt6">Los 10 de mayor esperado, de ' + G.length + '.</div>' : '');
  }

  // ── Abonos en curso: lo que queda por cobrar, según sus cuotas (29/10/2026) ──
  // Por abono: cuota del mes, cuotas cobradas de las del contrato, cuántas quedan, lo pendiente
  // (cuota × las que quedan) y el fin. Potencial anual (× 12) vs previsto real (lo que queda).
  // No se inventan cuotas: si falta un dato, se marca.
  function abonos() {
    var L = [];
    (F.d.proyItems || []).forEach(function (p) {
      (p.items || []).forEach(function (it) {
        if (!it.es_mantenimiento || it.detenido || ['aprobada', 'curso', 'garantia'].indexOf(_canonSol(it.estado)) < 0) return;
        var cu = N(it.cuota_act) || N(it.valor_cuota), tot = N(it.duracion) || N(it.cuotas), cob = N(it.cuotas_facturadas);
        var fin = _pd(it.fecha_fin), finOk = fin && fin.getFullYear() < 2100;
        L.push({ emp: p.empresa, tit: it.titulo, cu: cu, tot: tot, cob: cob, quedan: tot ? Math.max(0, tot - cob) : null, fin: finOk ? fin : null, finMal: !!fin && !finOk });
      });
    });
    if (!L.length) return '<div class="empty">No hay abonos en curso.</div>';
    var pot = 0, prev = 0;
    var h = '<div class="u-ovx"><table class="tbl"><thead><tr><th>Cliente</th><th>Abono</th><th class="u-tr">Por mes</th><th class="u-tr">Cuotas</th>' +
      '<th class="u-tr">Quedan</th><th class="u-tr">Pendiente</th><th class="u-tr">Termina</th></tr></thead><tbody>' + L.map(function (a) {
        pot += a.cu * 12; prev += a.quedan != null ? a.cu * a.quedan : 0;
        return '<tr><td>' + esc(a.emp || '') + '</td><td class="u-s11">' + esc(a.tit || '') + '</td>' + td(a.cu, 'm-abono') +
          '<td class="m u-tr">' + (a.tot ? a.cob + ' de ' + a.tot : '<span class="u-c-wa">sin dato</span>') + '</td>' +
          '<td class="m u-tr">' + (a.quedan != null ? a.quedan : '—') + '</td>' + td(a.quedan != null ? a.cu * a.quedan : 0, 'm-pendiente') +
          '<td class="m u-tr">' + (a.fin ? ff(a.fin) : '<span class="u-c-wa">' + (a.finMal ? 'fecha mal cargada' : 'sin fecha') + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '<div class="ft-info u-mt6">Potencial anual (cuota × 12): <span class="m m-abono">' + fmt(pot) + '</span> · Previsto según las cuotas que quedan: <span class="m m-pendiente">' + fmt(prev) + '</span>. ' +
      '</div>';
  }

  var TABS = [['cli', 'Análisis por Cliente', porCliente], ['esc', '¿Dónde podríamos estar?', escenarios],
              ['abo', 'Abonos en curso', abonos], ['neg', 'Negocios a seguir', negocios]];
  function pintar(el) {
    if (_montado !== 'fin') return;
    el.innerHTML = uiHd('Estado financiero', 'Cómo está parado el negocio: lo cobrado, lo contratado y lo que viene.') +
      '<div class="kpi-grid u-mb12">' + kpis() + '</div>' +
      uiTabs(TABS.map(function (t) { return [t[0], t[1], 'data-ftab="' + t[0] + '"']; }), F.tab) +
      (TABS.find(function (t) { return t[0] === F.tab; }) || TABS[0])[2]();
  }

  VISTAS.fin = async function (el, op) {
    await abrirModulo(el, { id: 'fin', texto: 'Cargando el estado financiero…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return !!F.d; }, firma: function () { return JSON.stringify(F.d); }, pintar: function () { pintar(el); } });
    el.onclick = function (ev) {
      if (_montado !== 'fin') return;
      var tb = ev.target.closest('[data-ftab]'); if (tb) { F.tab = tb.getAttribute('data-ftab'); return pintar(el); }
      var c = ev.target.closest('[data-fcli]'); if (c) { var e = c.getAttribute('data-fcli'); F.ab[e] = !F.ab[e]; return pintar(el); }
    };
    el.onchange = function (ev) {   // tildar un negocio mueve el gráfico al instante
      if (_montado !== 'fin') return;
      var id = ev.target.getAttribute && ev.target.getAttribute('data-fesc'); if (!id) return;
      F.esc[id] = ev.target.checked;
      var d = document.getElementById('fin-der'); if (d) d.innerHTML = simDerecha();
    };
  };
  VISTAS.fin.precargar = cargar;
})();

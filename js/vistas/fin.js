/* ══════════════════════════════════════════════════════════════════════
   vistas/fin.js · Estado financiero
   ──────────────────────────────────────────────────────────────────────
   El «Resumen Financiero» del Portal (Index.html · tab-fin), como módulo propio.
   Cada número sale de una vista de la base:
     los 7 recuadros            v_resumen_financiero + v_fin_caja_mes (= getDashboardFinanciero)
     Análisis por Cliente       v_resumen_por_empresa; el detalle, v_proyectos_clasif (es_ganado);
                                margen y referencia, v_analisis_clientes (= getAnalisisCliente)
     ¿Dónde podríamos estar?    v_fin_escenarios (= getProyeccion); al final, v_fin_no_aceptados
     Proyección 12 meses        v_proyeccion_12m + v_proy_sin_fecha; el gráfico, lo cobrado en v_cobrado_12m
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
      db().from('v_proy_sin_fecha').select('*'),
      db().from('v_fin_negocios').select('*').order('esperado', { ascending: false }),
      db().from('v_proyectos_clasif').select('id,estado_proyecto'),
      db().from('v_pm_proyectos').select('empresa,items'),
      db().from('v_cobrado_12m').select('*').order('orden'),
      db().from('v_fin_no_aceptados').select('*').order('una_vez', { ascending: false }),
      db().from('cot_config').select('clave,valor').in('clave', ['target_fee_mensual', 'target_proyectos_mes'])
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    F.d = { res: r[0].data || {}, caja: (r[1].data || {}).cobrado_mes || 0, emp: r[2].data, proy: r[3].data, an: r[4].data,
            esc: r[5].data, p12: r[6].data, sinFecha: r[7].data, neg: r[8].data,
            proyItems: r[10].data, cob12: r[11].data, noAc: r[12].data,
            targets: r[13].data.reduce(function (o, c) { o[c.clave] = Number(c.valor) || 0; return o; }, {}),
            estProy: r[9].data.reduce(function (o, p) { o[p.id] = _canonProy(p.estado_proyecto); return o; }, {}) };
  }

  // ── ayudas ───────────────────────────────────────────────────
  function N(x) { return Number(x) || 0; }
  function chev() { return '<span class="chev">' + ico('derecha') + '</span>'; }
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
    var hayBon = E.some(function (x) { return N(x.bonificado) > 1; });
    var h = '<div class="u-ovx"><table class="tbl fin-an"><thead><tr><th>Cliente / Proyecto</th><th class="u-tr">Contratado</th><th class="u-tr">Cobrado</th>' +
      (hayBon ? '<th class="u-tr">Bonificación</th>' : '') + '<th class="u-tr">Saldo</th><th class="u-tr">Abono / mes</th><th class="u-tr">Cobrado abono</th>' +
      '<th class="u-tr">Proyección anual de abono (12m)</th><th class="u-tr">Con 12 meses</th><th class="u-tr">Referencia mercado</th><th>Estatus de viabilidad</th></tr></thead><tbody>';
    var t = { c: 0, k: 0, b: 0, s: 0, m: 0, cm: 0 }, usados = {};
    var deCliente = function (nom) { var c = A.find(function (a) { return a.nombre === nom; }); if (c) usados[nom] = 1; return c; };
    E.forEach(function (x) {
      var ab = !!F.ab[x.empresa];
      t.c += N(x.contratado); t.k += N(x.cobrado); t.b += N(x.bonificado); t.s += N(x.saldo); t.m += N(x.mant_mes); t.cm += N(x.cobrado_mant);
      h += '<tr class="fin-cli" data-fcli="' + esc(x.empresa) + '"><td><span class="chev' + (ab ? ' on' : '') + '">' + ico('derecha') + '</span> ' + esc(x.empresa) + '</td>' +
        td(N(x.contratado), 'm-contratado') + td(N(x.cobrado), 'm-cobrado') + (hayBon ? td(N(x.bonificado), 'm-neutro', true) : '') +
        td(N(x.saldo), N(x.saldo) < 0 ? 'm-neutro' : 'm-pendiente') + td(N(x.mant_mes), 'm-abono') + td(N(x.cobrado_mant), 'm-abono') + celdasAnalisis(deCliente(x.empresa)) + '</tr>';
      if (ab) F.d.proy.filter(function (p) { return p.empresa === x.empresa; }).forEach(function (p) {
        h += '<tr class="fin-pro"><td>' + esc(p.nombre || '—') + ' <span class="u-s10-mt">' + esc(p.estado_proyecto || '') + '</span></td>' +
          td(N(p.monto_final_ars)) + td(N(p.cobrado_dev)) + (hayBon ? td(N(p.bonificacion) + N(p.bonificacion_mant), '', true) : '') +
          td(N(p.saldo)) + td(N(p.recurrente_mensual)) + td(N(p.cobrado_mant)) + '<td colspan="4"></td></tr>';
      });
    });
    // En negociación y todavía sin contratado: no están en el resumen, pero sí en el análisis
    A.filter(function (c) { return !usados[c.nombre]; }).forEach(function (c) {
      h += '<tr><td>' + esc(c.nombre || '—') + '</td>' + td(0) + td(0) + (hayBon ? td(0) : '') + td(0) + td(c.mmr, 'm-abono') + td(0) + celdasAnalisis(c) + '</tr>';
    });
    h += '<tr class="fin-tot"><td>Total</td>' + td(t.c, 'm-contratado') + td(t.k, 'm-cobrado') + (hayBon ? td(t.b, 'm-neutro', true) : '') +
      td(t.s, 'm-pendiente') + td(t.m, 'm-abono') + td(t.cm, 'm-abono') + '<td colspan="4"></td></tr></tbody></table></div>';
    return h;
  }

  // ── ¿Dónde podríamos estar? · tildá los negocios y a la derecha se suman ──
  function escenarios() {
    var E = F.d.esc, NA = F.d.noAc || [], s = { u: 0, m: 0, det: 0, neg: 0 }, n = 0;
    E.concat(NA).forEach(function (x) {
      if (!F.esc[x.proy_id]) return; n++;
      s.u += N(x.una_vez); s.m += N(x.por_mes);
      if (x.origen === 'detenido') s.det += N(x.una_vez); else if (/negoci/i.test(x.estado || '')) s.neg += N(x.una_vez);
    });
    var fila = function (x) {
      return '<label class="fin-esc"><input type="checkbox" data-fesc="' + esc(x.proy_id) + '"' + (F.esc[x.proy_id] ? ' checked' : '') + '>' +
        '<span class="fin-esc-e">' + esc(x.empresa) + '</span><span class="u-f1m u-corta">' + esc(x.proyecto) +
        (x.origen === 'detenido' ? ' <span class="u-c-rd u-s10">' + ico('pausa') + ' detenido</span>' : '') + '</span>' +
        (N(x.una_vez) ? '<span class="m m-contratado">+' + fmt(x.una_vez) + '</span>' : '') +
        (N(x.por_mes) ? '<span class="m m-abono">+' + fmt(x.por_mes) + '/mes</span>' : '') + '</label>';
    };
    // Los no aceptados, al final: quizás los quieren retomar
    var izq = E.length + NA.length ? E.map(fila).join('') + (NA.length ? '<div class="ui-lat-h u-mt10">No aceptados</div>' + NA.map(fila).join('') : '') + '<div class="ft-info u-mt6">' + (n ? 'Sumando a la derecha · destildá para sacarlo.' : 'Tildá los negocios que quieras combinar.') + '</div>'
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
    var T = F.d.targets, campo = function (k, l) { return '<div class="fg"><label class="fl" for="ftg-' + k + '">' + l + '</label><input class="fc u-tr ui-num" type="number" min="0" data-monto data-ftg="' + k + '" id="ftg-' + k + '" value="' + (N(T[k]) || '') + '"></div>'; };
    return '<div class="sec">Cobrado por mes · últimos 12 meses</div><div class="g2 fin-tg">' + campo('target_fee_mensual', 'Target de fee mensual') + campo('target_proyectos_mes', 'Target de facturación de proyectos') + '</div>' +
      '<div id="fin-graf">' + grafCobrado(F.d.cob12, T) + '</div><br>' + h;
  }
  // Una sola escala en ARS. Detrás los targets (punteados, secundarios); adelante lo cobrado.
  // Sin etiquetas por punto: el detalle de cada mes está en el tooltip.
  function grafCobrado(M, T) {
    var W = 900, H = 290, izq = 66, abajo = 24, arriba = 10, n = M.length || 1, bw = (W - izq) / n, tf = N(T.target_fee_mensual), tp = N(T.target_proyectos_mes);
    var tope = Math.max.apply(null, [tf, tp, 1].concat(M.map(function (m) { return Math.max(N(m.fee), N(m.one_shot)); })));
    var base = Math.pow(10, Math.floor(Math.log10(tope))), paso = [1, 2, 2.5, 5, 10].map(function (k) { return k * base / 2; }).find(function (x) { return tope / x <= 5; }) || base;
    var max = Math.ceil(tope / paso) * paso, piso = H - abajo, y = function (v) { return piso - Math.max(0, v) * (piso - arriba) / max; };
    var cx = function (i) { return izq + i * bw + bw / 2; }, f1 = function (v) { return v.toFixed(1); };
    var columna = function (i, v, ancho, cls) {   // tope redondeado, anclada a la base
      var a = cx(i) - ancho / 2, b = a + ancho, t = y(v), r = Math.min(4, ancho / 2, piso - t);
      return '<path class="' + cls + '" d="M' + f1(a) + ' ' + piso + 'V' + f1(t + r) + 'Q' + f1(a) + ' ' + f1(t) + ' ' + f1(a + r) + ' ' + f1(t) + 'H' + f1(b - r) + 'Q' + f1(b) + ' ' + f1(t) + ' ' + f1(b) + ' ' + f1(t + r) + 'V' + piso + 'Z"/>';
    };
    var h = '';
    for (var g = 0; g <= max + paso / 2; g += paso) {
      h += '<line class="fin-c-grid" x1="' + izq + '" x2="' + W + '" y1="' + f1(y(g)) + '" y2="' + f1(y(g)) + '"/>' +
        '<text class="fin-c-eje" x="' + (izq - 8) + '" y="' + f1(y(g) + 4) + '">$ ' + (g / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M</text>';
    }
    if (tp) M.forEach(function (m, i) { h += columna(i, tp, bw * 0.66, 'fin-c-tp'); });
    M.forEach(function (m, i) { if (N(m.fee) > 0) h += columna(i, N(m.fee), bw * 0.4, 'fin-c-fee'); });
    if (tf) h += '<line class="fin-c-tf" x1="' + izq + '" x2="' + W + '" y1="' + f1(y(tf)) + '" y2="' + f1(y(tf)) + '"/>';
    h += '<polyline class="fin-c-os" points="' + M.map(function (m, i) { return f1(cx(i)) + ',' + f1(y(N(m.one_shot))); }).join(' ') + '"/>';
    M.forEach(function (m, i) {
      h += '<circle class="fin-c-pt" cx="' + f1(cx(i)) + '" cy="' + f1(y(N(m.one_shot))) + '" r="4"/>' +
        '<text class="fin-st" x="' + f1(cx(i)) + '" y="' + (H - 6) + '">' + esc(m.etiqueta || '') + '</text>' +
        '<rect class="fin-c-hit" x="' + f1(izq + i * bw) + '" y="0" width="' + f1(bw) + '" height="' + H + '"><title>' + esc(m.etiqueta || '') + '\nFee de mantenimiento ' + fmt(N(m.fee)) + '\nOne Shot ' + fmt(N(m.one_shot)) +
          (tf ? '\nTarget de fee ' + fmt(tf) : '') + (tp ? '\nTarget de proyectos ' + fmt(tp) : '') + '</title></rect>';
    });
    return '<div class="u-ovx"><svg class="fin-svg fin-c" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cobrado por mes de los últimos 12 meses: fee de mantenimiento, proyectos One Shot y targets">' + h + '</svg></div>' +
      '<div class="fin-ley"><span><i class="fin-l-fee"></i> Fee de mantenimiento</span><span><i class="fin-l-os"></i> One Shot</span>' +
      (tf ? '<span><i class="fin-l-tf"></i> Target de fee mensual</span>' : '') + (tp ? '<span><i class="fin-l-tp"></i> Target de proyectos</span>' : '') + '</div>';
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
      'Mes a mes, en «Proyección próximos 12 meses».</div>';
  }

  var TABS = [['cli', 'Análisis por Cliente', porCliente], ['graf', 'Cobrado vs Contratado', grafEmpresas], ['esc', '¿Dónde podríamos estar?', escenarios],
              ['p12', 'Proyección 12 meses', proyeccion], ['abo', 'Abonos en curso', abonos], ['neg', 'Negocios a seguir', negocios]];
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
    el.onchange = function (ev) {
      if (_montado !== 'fin') return;
      var t = ev.target, tg = t.getAttribute && t.getAttribute('data-ftg');
      if (tg) {   // el target se ve en el gráfico al instante y queda guardado para todos
        F.d.targets[tg] = Number(t.value) || 0; document.getElementById('fin-graf').innerHTML = grafCobrado(F.d.cob12, F.d.targets);
        var cambios = {}; cambios[tg] = t.value;
        db().rpc('guardar_config', { cambios: cambios }).then(function (r) { if (r.error) toast(r.error.message, 'err'); else toast('Target guardado', 'ok'); });
        return;
      }
      var id = t.getAttribute && t.getAttribute('data-fesc'); if (!id) return;
      F.esc[id] = t.checked; pintar(el);
    };
  };
  VISTAS.fin.precargar = cargar;
})();

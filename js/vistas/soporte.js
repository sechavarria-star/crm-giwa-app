/* ══════════════════════════════════════════════════════════════════════
   vistas/soporte.js · Soporte (el equipo)
   ──────────────────────────────────────────────────────────────────────
   Los pedidos de los clientes, que antes vivían en el portal de Apps Script
   (soporte-gs). Acá el equipo los ve todos, los responde, los clasifica y
   los resuelve. El cliente entra por su portal (funciones portal_*).

   Cada número sale de la base: v_soporte_tickets trae la clasificación, las
   horas, la tarifa y el costo ya calculados (v_soporte_clasif, v_soporte_reparto).
   Las acciones son funciones de la base: soporte_crear, soporte_nota,
   soporte_actualizar, soporte_resolver, soporte_relacionado y soporte_adjunto.
   Los archivos van al bucket privado «soporte»: <empresa>/<ticket>/<archivo>.

   Etapa 3a (06/11/2026): lista, ficha, responder, resolver y nuevo ticket.
   Etapa 3b: Tablero por período (v_soporte_cuentas_mes): horas del mantenimiento,
   facturables y sin cargo por desarrollo, y «Marcar facturado» (soporte_marcar_facturado).
   Etapa 3c: Reportes al cliente (soporte_guardar_reporte, soporte_publicar_reporte,
   soporte_borrar_reporte, soporte_horas_reporte). Un borrador nunca llega al cliente.
   Etapa 3d: Accesos al portal: empresas habilitadas (soporte_guardar_empresa) y qué mails
   entran (soporte_acceso). Entra sólo quien se habilita a mano. Invitar: etapa 5.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var S = { d: null, sub: 'tickets', filtro: 'abiertos', emp: '', resp: '', busca: '', t: null, per: new Date().toISOString().slice(0, 7) };
  var SUBS = ['tickets', 'tablero', 'reportes', 'accesos'];
  var FILTROS = [['abiertos', 'Abiertos'], ['Nuevo', 'Nuevos'], ['En proceso', 'En proceso'], ['Esperando cliente', 'Esperando cliente'], ['Cerrado', 'Cerrados'], ['todos', 'Todos']];
  // Estado del ticket → color (Nuevo pide acción; Esperando cliente es seguimiento; Cerrado, resultado)
  var COL_EST = { 'Nuevo': 'ui-p-pendiente', 'En proceso': 'ui-e-curso', 'Esperando cliente': 'ui-e-detenido', 'Cerrado': 'ui-e-finalizado' };
  var COL_CLA = { 'Garantía': 'ui-e-garantia', 'Mantenimiento mensual': 'ui-p-abono', 'Facturable': 'ui-p-pendiente', 'A cotizar': 'ui-e-negociacion', 'Sin clasificar': 'ui-p-neutro' };
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }
  function N(x) { return Number(x) || 0; }
  function hs(h) { h = N(h); return h ? String(Math.round(h * 100) / 100).replace('.', ',') + ' h' : '—'; }
  function fh(iso) { if (!iso) return ''; var d = new Date(iso); return ff(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function chip(txt, mapa) { return txt ? '<span class="ui-st ' + (mapa[txt] || 'ui-p-neutro') + '">' + esc(txt) + '</span>' : ''; }
  function opts(lista, val, vacio) {
    return (vacio != null ? '<option value="">' + esc(vacio) + '</option>' : '') + lista.map(function (x) {
      var k = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x;
      return '<option value="' + esc(k) + '"' + (k === val ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function lista(clave) { return String((S.d.cfg[clave] || '')).split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function nombre(mail) {
    mail = String(mail || '').toLowerCase(); if (!mail) return '';
    var u = S.d.usu.find(function (x) { return String(x.mail || '').toLowerCase() === mail; }); if (u) return u.nombre;
    var c = S.d.cons.find(function (x) { return String(x.email || '').toLowerCase() === mail; });
    return c ? ((c.nombre || '') + ' ' + (c.apellido || '')).trim() : mail;
  }
  async function rpc(fn, args) { var r = await db().rpc(fn, args); if (r.error) throw new Error(r.error.message); return r.data; }

  async function cargar() {
    var r = await Promise.all([
      db().from('v_soporte_tickets').select('id,creado,actualizado,empresa_id,empresa_nombre,desarrollo_id,desarrollo_titulo,proyecto_nombre,tipo,titulo,prioridad,estado,clasificacion,responsable,solicitante,vence,horas,horas_facturables,costo,comentarios,cerrado').order('actualizado', { ascending: false }),
      db().from('empresas').select('id,nombre').order('nombre'),
      db().from('usuarios').select('mail,nombre,es_giwa,activo').eq('es_giwa', true),
      db().from('contactos').select('email,nombre,apellido,empresa_id'),
      db().from('cot_config').select('clave,valor').like('clave', 'Soporte_%'),
      db().from('v_soporte_cuentas_mes').select('*'),
      db().from('soporte_reportes').select('id,empresa_id,desarrollo_id,periodo,tipo,titulo,estado,publicado,enviado_a,actualizado').order('periodo', { ascending: false, nullsFirst: false }).order('creado', { ascending: false }),
      db().from('soporte_empresas').select('*'),
      db().from('soporte_accesos').select('*').order('mail')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    S.d = { tk: r[0].data, emps: r[1].data, usu: r[2].data.filter(function (u) { return u.activo !== false; }), cons: r[3].data,
            cfg: r[4].data.reduce(function (o, c) { o[c.clave] = c.valor; return o; }, {}), cm: r[5].data, rep: r[6].data, se: r[7].data, acc: r[8].data };
  }

  // ── la lista ─────────────────────────────────────────────────
  function filtrados() {
    var q = S.busca;
    return S.d.tk.filter(function (t) {
      if (S.filtro === 'abiertos' ? t.cerrado : (S.filtro !== 'todos' && t.estado !== S.filtro)) return false;
      if (S.emp && t.empresa_id !== S.emp) return false;
      if (S.resp && String(t.responsable || '').toLowerCase() !== S.resp) return false;
      return !q || [t.id, t.titulo, t.empresa_nombre, t.desarrollo_titulo, t.solicitante].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function htmlLista() {
    var A = S.d.tk.filter(function (t) { return !t.cerrado; });
    var mes = new Date().toISOString().slice(0, 7);
    var kpis = '<div class="ui-kpis">' +
      uiKpi('Abiertos', String(A.length), 'principal', '', '', 'Tickets sin resolver') +
      uiKpi('Sin responder', String(A.filter(function (t) { return t.estado === 'Nuevo'; }).length), 'p-pendiente', '', '', 'Tickets nuevos: nadie de GIWA respondió todavía') +
      uiKpi('Esperando cliente', String(A.filter(function (t) { return t.estado === 'Esperando cliente'; }).length), 'e-detenido', '', '', 'La pelota la tiene el cliente') +
      uiKpi('A cotizar', String(A.filter(function (t) { return t.clasificacion === 'A cotizar'; }).length), 'p-neutro', '', '', 'Pedidos de algo nuevo: tienen su tarea de cotización') +
      '</div>';
    var fil = '<div class="filtros u-mb8" role="group" aria-label="Estado">' + FILTROS.map(function (f) {
      return '<button class="ptab' + (S.filtro === f[0] ? ' on' : '') + '" data-sfil="' + esc(f[0]) + '">' + esc(f[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="u-row8 u-mb8"><select class="fc u-wauto" id="sop-emp" aria-label="Empresa">' + opts(S.d.emps.filter(function (e) { return S.d.tk.some(function (t) { return t.empresa_id === e.id; }); }).map(function (e) { return [e.id, e.nombre]; }), S.emp, 'Todas las empresas') + '</select>' +
      '<select class="fc u-wauto" id="sop-resp" aria-label="Responsable">' + opts(S.d.usu.map(function (u) { return [String(u.mail).toLowerCase(), u.nombre]; }), S.resp, 'Cualquier responsable') + '</select></div>';
    var L = filtrados();
    if (!L.length) return kpis + fil + '<div class="empty">Ningún ticket con este filtro.</div>';
    var hoy = _hoyLocal();
    return kpis + fil + '<div class="card card-tabla u-p0 u-ovx"><table class="tbl sop-tbl"><thead><tr><th>Ticket</th><th>Empresa</th><th>Pedido</th><th>Clasificación</th>' +
      '<th>Prioridad</th><th>Estado</th><th class="u-tr">Horas</th><th class="u-tr">Actualizado</th><th></th></tr></thead><tbody>' + L.map(function (t) {
        var vencido = t.vence && !t.cerrado && t.vence < hoy;
        return '<tr><td class="m">' + esc(t.id) + '</td><td>' + esc(t.empresa_nombre || t.empresa_id) + '</td>' +
          '<td><div class="u-fw6">' + esc(t.titulo) + '</div><div class="u-s11-mt">' + esc([t.desarrollo_titulo || 'Sin desarrollo', t.tipo, nombre(t.responsable)].filter(Boolean).join(' · ')) +
            (vencido ? ' · <span class="u-c-rd">venció ' + esc(ff(t.vence)) + '</span>' : '') + '</div></td>' +
          '<td>' + chip(t.clasificacion, COL_CLA) + '</td><td class="' + (t.prioridad === 'Alta' ? 'u-fw6' : 'u-c-mt') + '">' + esc(t.prioridad) + '</td>' +
          '<td>' + chip(t.estado, COL_EST) + '</td><td class="m u-tr">' + hs(t.horas) + '</td><td class="m u-tr">' + esc(ff(t.actualizado)) + '</td>' +
          '<td class="u-tr">' + uiIb('abrir', 'Abrir el ticket', '', 'data-sver="' + esc(t.id) + '"') + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="u-s11-mt u-mt6">' + L.length + ' ticket' + (L.length === 1 ? '' : 's') + '.</div>';
  }
  function pintar(el) {
    if (_montado !== 'soporte' || !el.querySelector('#sop-cuerpo')) return;
    marcarSub(S.sub);
    el.querySelector('#sop-q').hidden = S.sub !== 'tickets';
    el.querySelector('#sop-cuerpo').innerHTML = S.sub === 'tablero' ? htmlTablero() : S.sub === 'reportes' ? htmlReportes() : S.sub === 'accesos' ? htmlAccesos() : htmlLista();
    el.querySelector('#sop-nuevo').innerHTML = uiIco('mas') + (S.sub === 'reportes' ? 'Nuevo reporte' : 'Nuevo ticket');
    el.querySelector('#sop-nuevo').hidden = S.sub === 'accesos';
  }

  // ── Tablero por período (_tableroApi_) ───────────────────────
  // Las horas y el monto de cada desarrollo vienen hechos de v_soporte_cuentas_mes; acá sólo se suman las filas
  // que se ven (la empresa elegida) para los recuadros de arriba.
  function mesMas(m, n) { var p = m.split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function nomMes(m) { var p = m.split('-'); return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+p[1] - 1] + ' ' + p[0].slice(2); }
  function htmlTablero() {
    var F = S.d.cm.filter(function (x) { return !S.emp || x.empresa_id === S.emp; });
    var delMes = function (m) { return F.filter(function (x) { return x.mes === m; }); };
    var suma = function (L, k) { return L.reduce(function (a, x) { return a + N(x[k]); }, 0); };
    var M = delMes(S.per), ant = delMes(mesMas(S.per, -1));
    var hMes = suma(M, 'mant') + suma(M, 'fact') + suma(M, 'gar'), hAnt = suma(ant, 'mant') + suma(ant, 'fact') + suma(ant, 'gar');
    var mants = M.filter(function (x) { return x.es_mantenimiento; }), cupo = suma(mants, 'cupo');
    var pend = M.filter(function (x) { return !x.facturado_id; });
    var empSel = '<select class="fc u-wauto" id="sop-emp" aria-label="Empresa">' + opts(S.d.emps.filter(function (e) { return S.d.tk.some(function (t) { return t.empresa_id === e.id; }); }).map(function (e) { return [e.id, e.nombre]; }), S.emp, 'Todas las empresas') + '</select>';
    var h = '<div class="u-row8 u-mb8"><label class="fl u-m0" for="sop-per">Período</label><input class="fc u-wauto" type="month" id="sop-per" value="' + esc(S.per) + '">' + empSel + '</div>' +
      '<div class="ui-kpis">' +
        uiKpi('Horas del mes', hs(hMes), 'principal', 'mes anterior ' + hs(hAnt), '', 'Todas las horas cargadas con fecha de trabajo en el período') +
        uiKpi('Mantenimiento usado', cupo ? Math.round(suma(mants, 'mant') * 100 / cupo) + '%' : '—', 'p-abono', cupo ? hs(suma(mants, 'mant')) + ' de ' + hs(cupo) : 'sin mantenimientos con horas', '', 'Horas del mes contra las contratadas de cada mantenimiento') +
        uiKpi('A facturar', fmt(suma(M, 'a_facturar')), 'p-pendiente', hs(suma(M, 'fact')) + ' facturables', '', 'Horas facturables del mes (exceden el mantenimiento o no tienen) × la tarifa de cada ticket') +
        uiKpi('Sin marcar facturado', fmt(suma(pend, 'a_facturar')), 'p-neutro', pend.filter(function (x) { return N(x.fact); }).length + ' desarrollo(s)', '', 'Lo facturable del mes que todavía no se marcó como facturado') +
      '</div>' + grafHoras(F);
    if (!M.length) return h + '<div class="empty">No hay horas cargadas en ' + esc(nomMes(S.per)) + '.</div>';
    return h + '<div class="sec u-mt10">Por desarrollo · ' + esc(nomMes(S.per)) + '</div><div class="card card-tabla u-p0 u-ovx"><table class="tbl"><thead><tr><th>Empresa</th><th>Desarrollo</th>' +
      '<th class="u-tr">Contratadas</th><th class="u-tr">Usadas</th><th class="u-tr">Disponibles</th><th class="u-tr">Facturables</th><th class="u-tr">Sin cargo</th><th class="u-tr">A facturar</th><th>Facturado</th></tr></thead><tbody>' +
      M.sort(function (a, b) { return (a.empresa_nombre + a.desarrollo).localeCompare(b.empresa_nombre + b.desarrollo); }).map(function (x) {
        var k = esc(JSON.stringify({ e: x.empresa_id, d: x.cuenta_id || '', h: x.fact, n: x.desarrollo }));
        return '<tr><td>' + esc(x.empresa_nombre) + '</td><td>' + esc(x.desarrollo) + '</td>' +
          '<td class="m u-tr">' + (x.es_mantenimiento ? hs(x.cupo) : '—') + '</td><td class="m u-tr">' + hs(x.mant) + '</td><td class="m u-tr">' + (x.es_mantenimiento ? hs(x.disponibles) : '—') + '</td>' +
          '<td class="m u-tr' + (N(x.fact) ? ' ui-p-pendiente' : '') + '">' + hs(x.fact) + '</td><td class="m u-tr">' + hs(x.gar) + '</td>' +
          '<td class="m u-tr">' + (N(x.a_facturar) ? fmt(x.a_facturar) : '—') + '</td><td>' +
          (x.facturado_id ? '<span class="ui-st ui-e-finalizado" data-tip="' + esc('Marcado por ' + nombre(x.facturado_por) + ' · línea ' + x.facturado_sop) + '">' + uiIco('check') + esc(ff(x.facturado_fecha)) + '</span> ' + uiIb('cerrar', 'Desmarcar', '', 'data-sdesfac="' + k + '"')
            : (N(x.fact) ? uiBtn('Marcar facturado', 'factura', 's', 'data-sfac="' + k + '"') : '<span class="u-c-mt">—</span>')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  // Horas de los últimos 6 meses: mantenimiento, facturables y sin cargo, apiladas
  function grafHoras(F) {
    var meses = [], i; for (i = 5; i >= 0; i--) meses.push(mesMas(S.per, -i));
    var V = meses.map(function (m) { var L = F.filter(function (x) { return x.mes === m; }), s = function (k) { return L.reduce(function (a, x) { return a + N(x[k]); }, 0); }; return { m: m, a: s('mant'), f: s('fact'), g: s('gar') }; });
    var tope = Math.max.apply(null, [1].concat(V.map(function (x) { return x.a + x.f + x.g; }))), paso = Math.max(1, Math.ceil(tope / 4));
    var W = 640, H = 200, izq = 40, abajo = 22, arriba = 8, bw = (W - izq) / V.length, max = paso * 4, piso = H - abajo;
    var y = function (v) { return piso - v * (piso - arriba) / max; }, f = function (v) { return v.toFixed(1); }, h = '';
    for (var g = 0; g <= max; g += paso) h += '<line class="fs-grid" x1="' + izq + '" x2="' + W + '" y1="' + f(y(g)) + '" y2="' + f(y(g)) + '"/><text class="fs-eje" x="' + (izq - 6) + '" y="' + f(y(g) + 3) + '">' + g + ' h</text>';
    V.forEach(function (x, i) {
      var a = izq + i * bw + bw * 0.28, w = bw * 0.44, base = 0;
      [['a', 'sop-b-mant'], ['f', 'sop-b-fact'], ['g', 'sop-b-gar']].forEach(function (p) {
        if (x[p[0]] > 0) h += '<rect class="' + p[1] + '" x="' + f(a) + '" y="' + f(y(base + x[p[0]])) + '" width="' + f(w) + '" height="' + f(Math.max(0, y(base) - y(base + x[p[0]]) - 1)) + '" rx="2"/>';
        base += x[p[0]];
      });
      h += '<text class="fs-mes" x="' + f(a + w / 2) + '" y="' + (H - 6) + '">' + esc(nomMes(x.m)) + '</text>' +
        '<rect class="fs-hit" x="' + f(izq + i * bw) + '" y="0" width="' + f(bw) + '" height="' + piso + '"><title>' + esc(nomMes(x.m)) + '\nMantenimiento ' + hs(x.a) + '\nFacturables ' + hs(x.f) + '\nSin cargo ' + hs(x.g) + '</title></rect>';
    });
    return '<div class="sec">Horas por mes</div><svg class="fin-svg sop-graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Horas de soporte de los últimos 6 meses">' + h + '</svg>' +
      '<div class="fin-ley"><span><i class="sop-l-mant"></i> Del mantenimiento</span><span><i class="sop-l-fact"></i> Facturables</span><span><i class="sop-l-gar"></i> Sin cargo (garantía, ajustes, sin clasificar)</span></div>';
  }
  // ── Reportes al cliente (Reportes.gs) ─────────────────────────
  function empNom(id) { var e = S.d.emps.find(function (x) { return x.id === id; }); return e ? e.nombre : id; }
  function htmlReportes() {
    var L = S.d.rep.filter(function (r) { return !S.emp || r.empresa_id === S.emp; });
    var fil = '<div class="u-row8 u-mb8"><select class="fc u-wauto" id="sop-emp" aria-label="Empresa">' + opts(S.d.emps.filter(function (e) { return S.d.rep.some(function (r) { return r.empresa_id === e.id; }) || S.d.tk.some(function (t) { return t.empresa_id === e.id; }); }).map(function (e) { return [e.id, e.nombre]; }), S.emp, 'Todas las empresas') + '</select>' +
      '<span class="u-s11-mt">Lo que le mostramos al cliente de su mantenimiento. Un borrador no lo ve nadie de afuera.</span></div>';
    if (!L.length) return fil + '<div class="empty">Todavía no hay reportes.</div>';
    return fil + '<div class="card card-tabla u-p0 u-ovx"><table class="tbl"><thead><tr><th>Período</th><th>Empresa</th><th>Reporte</th><th>Tipo</th><th>Estado</th><th class="u-tr">Publicado</th><th></th></tr></thead><tbody>' +
      L.map(function (r) {
        return '<tr><td class="m">' + esc(r.periodo ? nomMes(r.periodo) : '—') + '</td><td>' + esc(empNom(r.empresa_id)) + '</td><td class="u-fw6">' + esc(r.titulo || '') + '</td>' +
          '<td class="u-c-mt">' + esc(r.tipo || '') + '</td><td>' + (r.estado === 'Publicado' ? '<span class="ui-st ui-e-finalizado">Publicado</span>' : '<span class="ui-st ui-p-neutro">Borrador</span>') + '</td>' +
          '<td class="m u-tr">' + esc(r.publicado ? ff(r.publicado) : '') + '</td><td class="u-tr">' + uiIb('editar', 'Abrir el reporte', 'edi', 'data-srep="' + esc(r.id) + '"') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  async function abrirReporte(id) {
    var m = $('m-sopr');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-sopr'; document.body.appendChild(m); m.addEventListener('click', accionReporte); m.addEventListener('change', function (ev) { if (ev.target.id === 'sopr-emp') pintarReporteDeps(); }); }
    m.innerHTML = '<div class="md md-xl"><div class="mh"><span class="mt2" id="sopr-tit">' + (id ? esc(id) : 'Nuevo reporte') + '</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-sopr">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2" id="sopr-cuerpo"><div class="loading"><div class="spin"></div></div></div><div class="mf" id="sopr-pie"></div></div>';
    openM('m-sopr');
    var r = { empresa_id: S.emp, periodo: S.per, tipo: 'Mantenimiento mensual', estado: 'Borrador' }, adj = [], tks = [], horas = null;
    if (id) {
      var q = await Promise.all([db().from('soporte_reportes').select('*').eq('id', id).single(), db().from('soporte_adjuntos').select('*').eq('reporte_id', id).order('id'),
                                 db().from('soporte_reporte_tickets').select('ticket_id').eq('reporte_id', id), rpc('soporte_horas_reporte', { rid: id, con_montos: true })]);
      if (q[0].error) return toast(q[0].error.message, 'err');
      r = q[0].data; adj = q[1].data || []; tks = (q[2].data || []).map(function (x) { return x.ticket_id; }); horas = q[3];
    }
    S.r = { r: r, adj: adj, tks: tks };
    var L = function (k) { return lista(k); }, ta = function (k, l, ph) { return '<div class="fg"><label class="fl" for="sopr-' + k + '">' + l + '</label><textarea class="fc" id="sopr-' + k + '" rows="4" placeholder="' + esc(ph || '') + '">' + esc(r[k] || '') + '</textarea></div>'; };
    var izq = '<div class="g2"><div class="fg"><label class="fl" for="sopr-emp">Empresa <span class="req">*</span></label><select class="fc" id="sopr-emp"' + (id ? ' disabled' : '') + '>' + opts(S.d.emps.map(function (e) { return [e.id, e.nombre]; }), r.empresa_id, 'Elegí la empresa') + '</select></div>' +
        '<div class="fg"><label class="fl" for="sopr-des">Desarrollo</label><select class="fc" id="sopr-des"></select></div></div>' +
      '<div class="g3"><div class="fg"><label class="fl" for="sopr-per">Período</label><input class="fc" type="month" id="sopr-per" value="' + esc(r.periodo || '') + '"></div>' +
        '<div class="fg"><label class="fl" for="sopr-tipo">Tipo</label><select class="fc" id="sopr-tipo">' + opts(L('Soporte_TipoReporte'), r.tipo || 'Otro') + '</select></div>' +
        '<div class="fg"><label class="fl">&nbsp;</label><label class="u-row6"><input type="checkbox" id="sopr-hs"' + (r.incluir_horas ? ' checked' : '') + '> Mostrar el consumo de horas del mes</label></div></div>' +
      '<div class="fg"><label class="fl" for="sopr-titulo">Título <span class="req">*</span></label><input class="fc" id="sopr-titulo" maxlength="200" value="' + esc(r.titulo || '') + '"></div>' +
      ta('resumen', 'Resumen', 'En dos líneas, cómo estuvo el mes') + ta('hicimos', 'Qué hicimos') + ta('pendiente', 'Qué no hicimos / qué queda pendiente') + ta('revisamos', 'Qué revisamos') +
      '<div class="sec">Documentación</div>' + (adj.length ? '<div class="sop-adjs u-mb6">' + adj.map(function (a) {
        return '<span class="u-row6">' + adjHtml(a) + '<label class="u-s11-mt"><input type="checkbox" data-squitar="' + a.id + '"> quitar</label></span>'; }).join('') + '</div>' : '') +
      '<input class="fc" id="sopr-arch" type="file" multiple>';
    var der = '<div class="sec">Tickets resueltos en este reporte</div>' +
      (tks.length ? '<div class="u-s11-mt u-mb6">Ya vinculados: ' + tks.map(esc).join(', ') + '</div>' : '') +
      '<div id="sopr-tks" class="sop-tks"></div>' +
      '<div class="sec u-mt10">Consumo de horas · ' + esc(r.periodo ? nomMes(r.periodo) : 'sin período') + '</div><div id="sopr-horas">' + htmlHorasRep(horas) + '</div>';
    $('sopr-cuerpo').innerHTML = '<div class="sop-ficha"><div>' + izq + '</div><div class="sop-lado">' + der + '</div></div>';
    $('sopr-pie').innerHTML = (id && r.estado !== 'Publicado' ? '<button class="btn bg" data-srac="borrar">' + ico('borrar') + ' Borrar</button>' : '') +
      '<span class="u-f1"></span><button class="btn bg" data-cerrar="m-sopr">Cancelar</button>' +
      '<button class="btn bg" data-srac="guardar">' + ico('guardar') + ' Guardar' + (r.estado === 'Publicado' ? '' : ' borrador') + '</button>' +
      (r.estado === 'Publicado' ? '' : '<button class="btn bp" data-srac="publicar">' + ico('subir') + ' Publicar</button>');
    pintarReporteDeps();
  }
  function htmlHorasRep(h) {
    if (!h) return '<div class="u-s11-mt">Elegí el período y guardá para ver el consumo.</div>';
    return (h.mantenimientos || []).map(function (m) { return '<div class="u-s11-mt">' + esc(m.titulo) + ': <span class="m">' + hs(m.usadas) + '</span> de <span class="m">' + hs(m.cupo) + '</span>' + (N(m.excedente) ? ' · <span class="ui-p-pendiente">' + hs(m.excedente) + ' de excedente</span>' : '') + '</div>'; }).join('') +
      (h.facturable && N(h.facturable.horas) ? '<div class="u-s11-mt">Se factura aparte: <span class="m">' + hs(h.facturable.horas) + '</span> · ' + fmt(h.facturable.monto) + ' <span class="u-c-mt">(el cliente no ve el monto)</span></div>' : '') +
      ((h.detalle || []).length ? '<ul class="sop-det">' + h.detalle.map(function (d) { return '<li><span class="m">' + esc(d.id) + '</span> ' + esc(d.titulo) + ' · <span class="m">' + hs(d.horas) + '</span> · ' + esc(d.tipo) + '</li>'; }).join('') + '</ul>' : '<div class="u-s11-mt">Sin horas en el período.</div>');
  }
  async function pintarReporteDeps() {
    var emp = v('sopr-emp'), r = S.r.r;
    if (!emp) { $('sopr-des').innerHTML = '<option value="">Elegí primero la empresa</option>'; $('sopr-tks').innerHTML = ''; return; }
    var q = await db().from('v_soporte_desarrollos').select('id,titulo,tipo_nombre,es_mantenimiento').eq('empresa_id', emp).order('titulo');
    if (v('sopr-emp') !== emp) return;
    $('sopr-des').innerHTML = opts((q.data || []).map(function (d) { return [d.id, d.titulo + ' · ' + d.tipo_nombre]; }), r.desarrollo_id || ((q.data || []).find(function (d) { return d.es_mantenimiento; }) || {}).id || '', 'Todos los de la empresa');
    var T = S.d.tk.filter(function (t) { return t.empresa_id === emp && S.r.tks.indexOf(t.id) < 0 && !t.cerrado; });
    $('sopr-tks').innerHTML = T.length ? T.map(function (t) {
      return '<div class="sop-tk"><label class="u-row6"><input type="checkbox" data-stk="' + esc(t.id) + '"> <span class="m">' + esc(t.id) + '</span> ' + esc(t.titulo) + '</label>' +
        '<div class="u-row6 u-mt4"><input class="fc u-tr sop-tk-h" type="number" min="0" step="0.25" placeholder="Horas" data-stkh="' + esc(t.id) + '" aria-label="Horas de ' + esc(t.id) + '">' +
        '<input class="fc u-wauto" type="date" value="' + _hoyLocal() + '" data-stkf="' + esc(t.id) + '" aria-label="Fecha de ' + esc(t.id) + '">' +
        '<label class="u-s11-mt"><input type="checkbox" data-stkc="' + esc(t.id) + '" checked> cerrarlo</label></div></div>';
    }).join('') : '<div class="u-s11-mt">No hay tickets abiertos de esta empresa.</div>';
  }
  async function accionReporte(ev) {
    var b = ev.target.closest('[data-srac],[data-sadj]'); if (!b) return;
    if (b.hasAttribute('data-sadj')) { var u = await sb().storage.from('soporte').createSignedUrl(b.getAttribute('data-sadj'), 300); return u.error ? toast(u.error.message, 'err') : window.open(u.data.signedUrl, '_blank', 'noopener'); }
    var a = b.getAttribute('data-srac'), r = S.r.r, m = $('m-sopr');
    var sel = function (attr) { return Array.prototype.slice.call(m.querySelectorAll('[' + attr + ']')); };
    try {
      if (a === 'borrar') {
        if (!(await ask('El borrador y sus archivos se borran.', '¿Borrar ' + r.id + '?', { ok: 'Borrar', peligro: true }))) return;
        var x = await rpc('soporte_borrar_reporte', { rid: r.id });
        if ((x.borrar_rutas || []).length) await sb().storage.from('soporte').remove(x.borrar_rutas);
        closeM('m-sopr'); toast('Reporte borrado', 'ok'); await cargar(); return pintar($('vista'));
      }
      var tickets = sel('data-stk').filter(function (c) { return c.checked; }).map(function (c) {
        var id = c.getAttribute('data-stk'), q = function (k) { return m.querySelector('[' + k + '="' + id + '"]'); };
        return { id: id, horas: q('data-stkh').value, fecha: q('data-stkf').value, cerrar: q('data-stkc').checked };
      });
      b.disabled = true;
      var g = await rpc('soporte_guardar_reporte', { p: { id: r.id || '', empresa_id: v('sopr-emp') || r.empresa_id, desarrollo_id: v('sopr-des'), periodo: v('sopr-per'), tipo: v('sopr-tipo'),
        titulo: v('sopr-titulo'), resumen: v('sopr-resumen'), hicimos: v('sopr-hicimos'), pendiente: v('sopr-pendiente'), revisamos: v('sopr-revisamos'),
        incluir_horas: $('sopr-hs').checked, tickets: tickets, quitar_adjuntos: sel('data-squitar').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-squitar'); }) } });
      if ((g.borrar_rutas || []).length) await sb().storage.from('soporte').remove(g.borrar_rutas);
      var fs = Array.prototype.slice.call($('sopr-arch').files || []), emp = v('sopr-emp') || r.empresa_id;
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i]; if (f.size > 10 * 1024 * 1024) { toast(f.name + ': pasa los 10 MB', 'err'); continue; }
        var ruta = emp + '/' + g.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
        var up = await sb().storage.from('soporte').upload(ruta, f, { contentType: f.type || undefined });
        if (up.error) { toast(f.name + ': ' + up.error.message, 'err'); continue; }
        await rpc('soporte_adjunto_reporte', { p: { reporte_id: g.id, ruta: ruta, nombre: f.name, tipo: f.type, bytes: String(f.size) } });
      }
      if (a === 'publicar') {
        var cons = S.d.cons.filter(function (c) { return c.empresa_id === emp && c.email; }).map(function (c) { return c.email; });
        var para = await pedirTexto('A quién se lo mandamos (mails separados por coma). El cliente lo ve en su portal igual.', 'Publicar ' + g.id, cons.join(', '));
        if (para === null) { await cargar(); pintar($('vista')); return abrirReporte(g.id); }
        await rpc('soporte_publicar_reporte', { p: { id: g.id, para: para } });
        toast('Reporte publicado', 'ok');
      } else toast('Guardado', 'ok');
      await cargar(); pintar($('vista')); return abrirReporte(g.id);
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  }
  // Un cuadro con un campo de texto (para los mails al publicar)
  function pedirTexto(msg, tit, def) {
    return new Promise(function (ok) {
      var m = $('m-soptx');
      if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-soptx'; document.body.appendChild(m); }
      m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">' + esc(tit) + '</span></div><div class="mb2"><p class="u-s11-mt">' + esc(msg) + '</p>' +
        '<textarea class="fc" id="soptx-v" rows="3">' + esc(def || '') + '</textarea></div>' +
        '<div class="mf"><button class="btn bg" id="soptx-no">Cancelar</button><button class="btn bp" id="soptx-ok">' + ico('subir') + ' Publicar</button></div></div>';
      $('soptx-no').onclick = function () { closeM('m-soptx'); ok(null); };
      $('soptx-ok').onclick = function () { var x = v('soptx-v'); closeM('m-soptx'); ok(x); };
      openM('m-soptx');
    });
  }

  // ── Accesos al portal: empresas habilitadas y qué mails entran ──
  // Por empresa: sus contactos con mail (y los mails sueltos que ya tenían acceso). Entra sólo quien está tildado.
  function htmlAccesos() {
    var hab = {}; S.d.se.forEach(function (x) { hab[x.empresa_id] = x; });
    var resto = S.d.emps.filter(function (e) { return !hab[e.id]; });
    var h = '<div class="u-row8 u-mb8"><select class="fc u-wauto" id="sopa-emp" aria-label="Empresa a habilitar">' + opts(resto.map(function (e) { return [e.id, e.nombre]; }), '', 'Habilitar otra empresa…') + '</select>' +
      uiBtn('Habilitar en el portal', 'mas', 's', 'data-sahab="1"') +
      '<span class="u-s11-mt">El cliente ve sólo lo de su empresa. Entra únicamente quien tildes acá; la invitación por mail llega en la próxima etapa.</span></div>';
    if (!S.d.se.length) return h + '<div class="empty">Ninguna empresa habilitada todavía.</div>';
    return h + '<div class="ui-tarjetas">' + S.d.se.slice().sort(function (a, b) { return empNom(a.empresa_id).localeCompare(empNom(b.empresa_id)); }).map(function (x) {
      var e = x.empresa_id, eid = esc(e);
      var cons = S.d.cons.filter(function (c) { return c.empresa_id === e && c.email; }).map(function (c) { return { mail: String(c.email).trim().toLowerCase(), nombre: ((c.nombre || '') + ' ' + (c.apellido || '')).trim() }; });
      S.d.acc.filter(function (a) { return a.empresa_id === e && !cons.some(function (c) { return c.mail === a.mail; }); }).forEach(function (a) { cons.push({ mail: a.mail, nombre: '' }); });
      var filas = cons.map(function (c) {
        var a = S.d.acc.find(function (y) { return y.mail === c.mail; }) || {}, otra = a.empresa_id && a.empresa_id !== e;
        return '<tr><td>' + esc(c.nombre || '—') + (c.nombre ? '' : ' <span class="u-s11-mt">(no es contacto)</span>') + '</td><td>' + esc(c.mail) + '</td>' +
          '<td class="u-tc">' + (otra ? '<span class="u-s11-mt">en ' + esc(empNom(a.empresa_id)) + '</span>' : '<input type="checkbox" data-saacc="' + esc(JSON.stringify({ m: c.mail, e: e })) + '"' + (a.habilitado ? ' checked' : '') + ' aria-label="Puede entrar">') + '</td>' +
          '<td class="m u-tr">' + esc(a.ultimo_ingreso ? ff(a.ultimo_ingreso) : '') + '</td></tr>';
      }).join('');
      return '<div class="ui-tarjeta"><span class="ui-tarjeta-barra ' + (x.activo ? 'ui-e-curso' : 'ui-p-neutro') + '"></span>' +
        '<div class="ui-tarjeta-hd"><div class="ui-pro">' + esc(empNom(e)) + '</div><div class="u-row6"><span class="ui-st ' + (x.activo ? 'ui-e-curso' : 'ui-p-neutro') + '">' + (x.activo ? 'Activa' : 'Pausada') + '</span>' +
          '<a class="ui-ib" href="soporte/?como=' + encodeURIComponent(e) + '" target="_blank" rel="noopener" data-tip="Ver el portal como lo ve esta empresa" aria-label="Ver como">' + uiIco('abrir') + '</a></div></div>' +
        '<div class="u-row8 u-mt6"><label class="u-row6 u-s12"><input type="checkbox" data-saemp="activo" data-e="' + eid + '"' + (x.activo ? ' checked' : '') + '> Activa en el portal</label>' +
          '<label class="u-row6 u-s12"><input type="checkbox" data-saemp="mostrar_horas" data-e="' + eid + '"' + (x.mostrar_horas ? ' checked' : '') + '> Ve horas y consumo del mantenimiento</label></div>' +
        '<div class="fg u-mt6"><label class="fl" for="sopa-av-' + eid + '">Avisar también a</label><div class="u-row6"><input class="fc" id="sopa-av-' + eid + '" value="' + esc(x.avisar_a || '') + '" placeholder="mails separados por coma">' +
          uiIb('guardar', 'Guardar', 'edi', 'data-saav="' + eid + '"') + '</div></div>' +
        '<table class="tbl u-mt6"><thead><tr><th>Contacto</th><th>Mail</th><th class="u-tc">Puede entrar</th><th class="u-tr">Último ingreso</th></tr></thead><tbody>' +
          (filas || '<tr><td colspan="4" class="u-c-mt">La empresa no tiene contactos con mail.</td></tr>') + '</tbody></table>' +
        '<div class="u-row6 u-mt6"><input class="fc" id="sopa-nm-' + eid + '" placeholder="Otro mail (no es contacto del CRM)">' + uiBtn('Agregar', 'mas', 's', 'data-saotro="' + eid + '"') + '</div></div>';
    }).join('') + '</div>';
  }
  async function accionAccesos(b, el) {
    try {
      if (b.hasAttribute('data-sahab')) {
        var e = v('sopa-emp'); if (!e) return toast('Elegí la empresa', 'err');
        await rpc('soporte_guardar_empresa', { p: { empresa_id: e, activo: true } }); toast(empNom(e) + ' habilitada en el portal', 'ok');
      } else if (b.hasAttribute('data-saav')) {
        var e2 = b.getAttribute('data-saav');
        await rpc('soporte_guardar_empresa', { p: { empresa_id: e2, avisar_a: v('sopa-av-' + e2) } }); toast('Guardado', 'ok');
      } else if (b.hasAttribute('data-saotro')) {
        var e3 = b.getAttribute('data-saotro');
        await rpc('soporte_acceso', { p: { mail: v('sopa-nm-' + e3), empresa_id: e3, habilitado: true } }); toast('Acceso agregado', 'ok');
      } else return;
      await cargar(); pintar(el);
    } catch (x) { toast(x.message || String(x), 'err'); }
  }
  async function cambioAccesos(t, el) {
    try {
      if (t.hasAttribute('data-saemp')) { var p = { empresa_id: t.getAttribute('data-e') }; p[t.getAttribute('data-saemp')] = t.checked; await rpc('soporte_guardar_empresa', { p: p }); }
      else if (t.hasAttribute('data-saacc')) { var k = JSON.parse(t.getAttribute('data-saacc')); await rpc('soporte_acceso', { p: { mail: k.m, empresa_id: k.e, habilitado: t.checked } }); }
      else return;
      toast('Guardado', 'ok'); await cargar(); pintar(el);
    } catch (x) { toast(x.message || String(x), 'err'); t.checked = !t.checked; }
  }

  // «Marcar facturado»: atado a la línea de horas de soporte (SOP) del CRM
  async function marcarFacturado(k) {
    var r = await db().from('v_soporte_desarrollos').select('id,titulo').eq('empresa_id', k.e).eq('tipo_id', 'SOP').order('id', { ascending: false });
    if (r.error) return toast(r.error.message, 'err');
    if (!r.data.length) return toast('La empresa no tiene una línea de horas de soporte (SOP) en el CRM. Creala en Proyectos.', 'err');
    var m = $('m-sopf');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-sopf'; document.body.appendChild(m); }
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">Marcar facturado · ' + esc(nomMes(S.per)) + '</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-sopf">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2"><p class="u-s11-mt">' + esc(k.n) + '</p>' +
      '<div class="fg"><label class="fl" for="sopf-sop">Línea de horas de soporte del CRM</label><select class="fc" id="sopf-sop">' + opts(r.data.map(function (d) { return [d.id, d.id + ' · ' + d.titulo]; }), r.data[0].id) + '</select></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="sopf-h">Horas</label><input class="fc u-tr" id="sopf-h" type="number" min="0" step="0.25" value="' + N(k.h) + '"></div>' +
      '<div class="fg"><label class="fl" for="sopf-n">Nota</label><input class="fc" id="sopf-n" placeholder="Opcional (n.º de factura…)"></div></div></div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-sopf">Cancelar</button><button class="btn bp" id="sopf-ok">' + ico('check') + ' Marcar facturado</button></div></div>';
    $('sopf-ok').onclick = async function () {
      try { await rpc('soporte_marcar_facturado', { p: { empresa_id: k.e, desarrollo_id: k.d, periodo: S.per, sop_id: v('sopf-sop'), horas: v('sopf-h'), nota: v('sopf-n') } });
        closeM('m-sopf'); toast('Marcado como facturado', 'ok'); await cargar(); pintar($('vista')); }
      catch (e) { toast(e.message, 'err'); }
    };
    openM('m-sopf');
  }

  // ── la ficha del ticket ──────────────────────────────────────
  var HTML =
    '<div class="mo" id="m-sop"><div class="md md-xl">' +
      '<div class="mh"><span class="mt2" id="sop-tit">Ticket</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-sop">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2" id="sop-cuerpo-t"></div>' +
    '</div></div>' +
    '<div class="mo" id="m-sopn"><div class="md">' +
      '<div class="mh"><span class="mt2">Nuevo ticket</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-sopn">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2" id="sopn-cuerpo"></div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-sopn">Cancelar</button><button class="btn bp" id="sopn-ok">Crear ticket</button></div>' +
    '</div></div>';
  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    $('m-sop').addEventListener('click', accionFicha);
    $('m-sopn').addEventListener('change', function (ev) { if (ev.target.id === 'sopn-emp') pintarNuevo(); if (ev.target.id === 'sopn-res') $('sopn-resb').classList.toggle('on', ev.target.checked); });
    $('sopn-ok').onclick = crearTicket;
  });

  async function verTicket(id) {
    $('sop-tit').textContent = id; $('sop-cuerpo-t').innerHTML = '<div class="loading"><div class="spin"></div></div>'; openM('m-sop');
    var r = await Promise.all([
      db().from('v_soporte_tickets').select('*').eq('id', id).single(),
      db().from('soporte_notas').select('*').eq('ticket_id', id).order('fecha').order('id'),
      db().from('soporte_adjuntos').select('*').eq('ticket_id', id).order('id'),
      db().from('v_soporte_reparto').select('nota_id,mant,fact,gar,sin').eq('ticket_id', id)
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) { $('sop-cuerpo-t').innerHTML = '<div class="empty u-c-rd">' + esc(err.error.message) + '</div>'; return; }
    var t = r[0].data;
    var desa = t.cerrado ? [] : ((await db().from('v_soporte_desarrollos').select('id,titulo,tipo_nombre').eq('empresa_id', t.empresa_id).order('titulo')).data || []);
    S.t = { t: t, notas: r[1].data, adj: r[2].data, rep: r[3].data.reduce(function (o, x) { o[x.nota_id] = x; return o; }, {}), desa: desa };
    pintarFicha();
  }
  function adjHtml(a) {
    if (a.ruta) return '<button type="button" class="sop-adj" data-sadj="' + esc(a.ruta) + '">' + uiIco('clip') + esc(a.nombre) + '</button>';
    return '<a class="sop-adj" href="https://drive.google.com/file/d/' + encodeURIComponent(a.drive_id) + '/view" target="_blank" rel="noopener">' + uiIco('clip') + esc(a.nombre) + ' <span class="u-c-mt">(Drive)</span></a>';
  }
  function pintarFicha() {
    var X = S.t, t = X.t, cerr = t.cerrado;
    $('sop-tit').textContent = t.id + ' · ' + t.titulo;
    var adjDe = function (nid) { var L = X.adj.filter(function (a) { return (a.nota_id || null) === nid; }); return L.length ? '<div class="sop-adjs">' + L.map(adjHtml).join('') + '</div>' : ''; };
    var meta = '<div class="ft-meta"><span>' + uiIco('empresa') + esc(t.empresa_nombre || t.empresa_id) + '</span>' +
      (t.proyecto_nombre ? '<span>' + uiIco('tablero') + esc(t.proyecto_nombre) + '</span>' : '') +
      '<span>' + uiIco('lista') + esc(t.desarrollo_titulo || 'Sin desarrollo') + '</span><span>' + esc(t.tipo) + (t.sintoma ? ' · ' + esc(t.sintoma) : '') + '</span>' +
      '<span>' + uiIco('persona') + esc(nombre(t.solicitante)) + ' · ' + esc(t.canal) + '</span><span class="m">' + esc(fh(t.creado)) + '</span>' +
      (t.relacionado_con ? '<span>Vuelve de <button type="button" class="sop-link m" data-sver="' + esc(t.relacionado_con) + '">' + esc(t.relacionado_con) + '</button></span>' : '') + '</div>';
    var clasif = '<div class="u-row8 u-mb6">' + chip(t.clasificacion, COL_CLA) + (t.forzada ? '<span class="u-s11-mt">puesta a mano</span>' : '') +
      (t.tarea_id ? '<button type="button" class="sop-link" data-starea="' + esc(t.tarea_id) + '">Tarea de cotización ' + esc(t.tarea_id) + '</button>' : '') + '</div>' +
      uiMotivo(t.clasif_motivo || '') + (t.motivo_factura ? uiAviso(t.motivo_factura + (N(t.costo) ? ' ' + hs(t.horas_facturables) + ' × ' + fmt(t.tarifa) + ' = ' + fmt(t.costo) + '.' : ''), 'adv') : '');
    var notas = X.notas.map(function (n) {
      var rp = X.rep[n.id], parte = rp && N(n.horas) ? [N(rp.mant) ? hs(rp.mant) + ' del mantenimiento' : '', N(rp.fact) ? hs(rp.fact) + ' facturables' : '', N(rp.gar) ? hs(rp.gar) + ' sin cargo' : '', N(rp.sin) ? hs(rp.sin) + ' sin clasificar' : ''].filter(Boolean).join(' · ') : '';
      return '<div class="ft-note' + (n.interna ? ' sop-interna' : '') + '"><div class="ft-note-h"><span>' + uiIco('personas') + ' ' + esc(nombre(n.autor)) + (n.interna ? ' · <b>Nota interna</b>' : '') +
        (N(n.horas) ? ' · <span class="m">' + hs(n.horas) + '</span>' + (parte ? ' <span class="u-c-mt">(' + esc(parte) + ')</span>' : '') : '') + '</span><span class="m">' + esc(fh(n.fecha)) + '</span></div>' +
        '<div class="ft-note-t">' + esc(n.texto || '') + '</div>' + adjDe(n.id) + '</div>';
    }).join('') || '<div class="ft-info">Sin respuestas todavía.</div>';
    var responder = cerr ? '' :
      '<div class="sec u-mt10">Responder</div><textarea class="fc" id="sop-txt" rows="3" placeholder="Lo que le contestás al cliente (o una nota interna)"></textarea>' +
      '<div class="g3 u-mt6"><div class="fg"><label class="fl" for="sop-h">Horas trabajadas</label><input class="fc u-tr" id="sop-h" type="number" min="0" step="0.25"></div>' +
        '<div class="fg"><label class="fl" for="sop-f">Fecha de trabajo</label><input class="fc" id="sop-f" type="date" value="' + _hoyLocal() + '"></div>' +
        '<div class="fg"><label class="fl" for="sop-arch">Archivos</label><input class="fc" id="sop-arch" type="file" multiple></div></div>' +
      '<div class="u-row8"><label class="u-row6"><input type="checkbox" id="sop-int"> Nota interna (el cliente no la ve)</label>' +
        '<button class="btn bp sm u-mla" data-sacc="nota">' + ico('chat') + ' Responder</button></div>';
    var cuerpoIzq = meta + clasif + '<div class="sec u-mt10">Pedido</div><div class="ft-note-t">' + esc(t.descripcion || '—') + '</div>' + adjDe(null) +
      (cerr ? '<div class="sec u-mt10">Cómo se resolvió · ' + esc(fh(t.resuelto)) + '</div><div class="ft-note sop-final"><div class="ft-note-t">' + esc(t.respuesta_final || '—') + '</div></div>' : '') +
      '<div class="sec u-mt10">Conversación</div>' + notas + responder;
    var L = function (k) { return lista(k); };
    var lado = cerr
      ? '<div class="sec">Resuelto</div><p class="u-s11-mt">El ticket es de solo lectura. Si el problema volvió, abrí uno nuevo vinculado.</p>' +
        uiBtn('Abrir uno vinculado', 'mas', 's', 'data-sacc="rel"')
      : '<div class="sec">Seguimiento</div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="sop-est">Estado</label><select class="fc" id="sop-est">' + opts(L('Soporte_Estado').filter(function (x) { return x !== 'Cerrado'; }), t.estado) + '</select></div>' +
          '<div class="fg"><label class="fl" for="sop-pri">Prioridad</label><select class="fc" id="sop-pri">' + opts(L('Soporte_Prioridad'), t.prioridad) + '</select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="sop-rsp">Responsable</label><select class="fc" id="sop-rsp">' + opts(S.d.usu.map(function (u) { return [String(u.mail).toLowerCase(), u.nombre]; }), String(t.responsable || '').toLowerCase(), 'Sin asignar') + '</select></div>' +
          '<div class="fg"><label class="fl" for="sop-ven">Vence</label><input class="fc" id="sop-ven" type="date" value="' + esc(t.vence || '') + '"></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="sop-tip">Tipo</label><select class="fc" id="sop-tip">' + opts(L('Soporte_TipoCliente').concat(L('Soporte_TipoGiwa')).concat(L('Soporte_TipoCliente').concat(L('Soporte_TipoGiwa')).indexOf(t.tipo) < 0 ? [t.tipo] : []), t.tipo) + '</select></div>' +
          '<div class="fg"><label class="fl" for="sop-sin">Síntoma</label><select class="fc" id="sop-sin">' + opts(L('Soporte_Sintoma'), t.sintoma, '—') + '</select></div></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="sop-cat">Categoría</label><select class="fc" id="sop-cat">' + opts(L('Soporte_Categoria'), t.categoria, '—') + '</select></div>' +
          '<div class="fg"><label class="fl" for="sop-mod">Módulo</label><input class="fc" id="sop-mod" value="' + esc(t.modulo || '') + '"></div></div>' +
        (t.desarrollo_id ? '' : '<div class="fg"><label class="fl" for="sop-des">Desarrollo</label><select class="fc" id="sop-des">' + opts(X.desa.map(function (d) { return [d.id, d.titulo + ' · ' + d.tipo_nombre]; }), '', 'Elegí el desarrollo') + '</select></div>') +
        '<div class="sec u-mt10">Clasificación</div>' +
        '<div class="fg"><label class="fl" for="sop-cla">Forzar la clasificación</label><select class="fc" id="sop-cla">' + opts(L('Soporte_Clasificacion'), t.clasificacion_forzada || '', 'Automática (' + (t.forzada ? 'según el desarrollo' : t.clasificacion) + ')') + '</select></div>' +
        '<div class="fg"><label class="fl" for="sop-clm">Por qué</label><input class="fc" id="sop-clm" value="' + esc(t.forzada_motivo || '') + '" placeholder="Obligatorio si la forzás"></div>' +
        '<div class="fg"><label class="fl" for="sop-tar">Tarifa por hora facturable</label><input class="fc u-tr" id="sop-tar" type="number" min="0" data-monto value="' + esc(t.tarifa_hora || '') + '" placeholder="' + esc(N(t.tarifa) ? 'Del contrato: ' + fmt(t.tarifa) : 'Sin tarifa de contrato') + '"></div>' +
        '<div class="u-row8">' + uiBtn('Guardar cambios', 'guardar', 'p', 'data-sacc="guardar"') + '</div>' +
        '<div class="sec u-mt10">Horas</div><div class="u-s11-mt">' + hs(t.horas) + ' en total' + (N(t.horas_facturables) ? ' · ' + hs(t.horas_facturables) + ' facturables · ' + fmt(t.costo) : '') + '</div>' +
        '<div class="sec u-mt10">Resolver</div><textarea class="fc" id="sop-rtx" rows="3" placeholder="Cómo se resolvió (lo ve el cliente)"></textarea>' +
        '<div class="g2 u-mt6"><div class="fg"><label class="fl" for="sop-rh">Horas finales</label><input class="fc u-tr" id="sop-rh" type="number" min="0" step="0.25" placeholder="Opcional"></div>' +
          '<div class="fg"><label class="fl" for="sop-rf">Fecha de trabajo</label><input class="fc" id="sop-rf" type="date" value="' + _hoyLocal() + '"></div></div>' +
        '<div class="u-row8">' + uiBtn('Resolver', 'check', 'p', 'data-sacc="resolver"') + '</div>';
    $('sop-cuerpo-t').innerHTML = '<div class="sop-ficha"><div>' + cuerpoIzq + '</div><div class="sop-lado">' + lado + '</div></div>';
  }

  // sube los archivos elegidos al bucket y los registra en el ticket (y en la respuesta, si hay)
  async function subir(input, t, notaId) {
    var fs = Array.prototype.slice.call((input && input.files) || []);
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (f.size > 10 * 1024 * 1024) { toast(f.name + ': pasa los 10 MB', 'err'); continue; }
      var ruta = t.empresa_id + '/' + t.id + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
      var up = await sb().storage.from('soporte').upload(ruta, f, { contentType: f.type || undefined });
      if (up.error) { toast(f.name + ': ' + up.error.message, 'err'); continue; }
      await rpc('soporte_adjunto', { p: { ticket_id: t.id, nota_id: notaId || '', ruta: ruta, nombre: f.name, tipo: f.type, bytes: String(f.size) } });
    }
    return fs.length;
  }
  async function trasCambio(id) { await cargar(); pintar($('vista')); if (id) await verTicket(id); }

  async function accionFicha(ev) {
    var lk = ev.target.closest('[data-sver],[data-sadj],[data-starea]');
    if (lk) {
      if (lk.hasAttribute('data-sver')) return verTicket(lk.getAttribute('data-sver'));
      if (lk.hasAttribute('data-starea')) return verTarea(lk.getAttribute('data-starea'), {});
      var u = await sb().storage.from('soporte').createSignedUrl(lk.getAttribute('data-sadj'), 300);
      return u.error ? toast(u.error.message, 'err') : window.open(u.data.signedUrl, '_blank', 'noopener');
    }
    var b = ev.target.closest('[data-sacc]'); if (!b || b.disabled) return;
    var a = b.getAttribute('data-sacc'), t = S.t.t;
    b.disabled = true;
    try {
      if (a === 'nota') {
        var arch = $('sop-arch'), hay = arch && arch.files.length > 0;
        var r = await rpc('soporte_nota', { p: { ticket_id: t.id, texto: v('sop-txt'), horas: v('sop-h'), fecha: v('sop-f'), interna: $('sop-int').checked, con_adjuntos: hay } });
        if (hay) await subir(arch, t, r.id);
        toast('Respuesta guardada', 'ok'); return trasCambio(t.id);
      }
      if (a === 'guardar') {
        var c = { estado: v('sop-est'), prioridad: v('sop-pri'), responsable: v('sop-rsp'), vence: v('sop-ven'), tipo: v('sop-tip'), sintoma: v('sop-sin'),
                  categoria: v('sop-cat'), modulo: v('sop-mod'), clasificacion_forzada: v('sop-cla'), forzada_motivo: v('sop-clm') };
        if (v('sop-tar')) c.tarifa_hora = v('sop-tar');
        if ($('sop-des') && v('sop-des')) c.desarrollo_id = v('sop-des');
        var g = await rpc('soporte_actualizar', { tid: t.id, c: c });
        toast(g.tarea_id ? 'Guardado. Se creó la tarea de cotización ' + g.tarea_id : 'Guardado', 'ok'); return trasCambio(t.id);
      }
      if (a === 'resolver') {
        if (!(await ask('El ticket queda cerrado y de solo lectura.', '¿Resolver ' + t.id + '?', { ok: 'Resolver' }))) return;
        await rpc('soporte_resolver', { p: { ticket_id: t.id, respuesta: v('sop-rtx'), horas: v('sop-rh'), fecha: v('sop-rf') } });
        toast('Ticket resuelto', 'ok'); return trasCambio(t.id);
      }
      if (a === 'rel') {
        var n = await rpc('soporte_relacionado', { p: { ticket_id: t.id } });
        toast('Se abrió ' + n.id, 'ok'); return trasCambio(n.id);
      }
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  }

  // ── nuevo ticket (desde GIWA: cualquier empresa, tipos internos, canal y solicitante) ──
  function abrirNuevo() {
    var L = function (k) { return lista(k); };
    $('sopn-cuerpo').innerHTML =
      '<div class="g2"><div class="fg"><label class="fl" for="sopn-emp">Empresa <span class="req">*</span></label><select class="fc" id="sopn-emp">' + opts(S.d.emps.map(function (e) { return [e.id, e.nombre]; }), S.emp, 'Elegí la empresa') + '</select></div>' +
        '<div class="fg"><label class="fl" for="sopn-des">Desarrollo</label><select class="fc" id="sopn-des"></select></div></div>' +
      '<div class="g3"><div class="fg"><label class="fl" for="sopn-tip">Tipo</label><select class="fc" id="sopn-tip">' + opts(L('Soporte_TipoCliente').concat(L('Soporte_TipoGiwa')), 'Algo no funciona') + '</select></div>' +
        '<div class="fg"><label class="fl" for="sopn-can">Llegó por</label><select class="fc" id="sopn-can">' + opts(L('Soporte_Canal'), 'Mail') + '</select></div>' +
        '<div class="fg"><label class="fl" for="sopn-pri">Prioridad</label><select class="fc" id="sopn-pri">' + opts(L('Soporte_Prioridad'), 'Media') + '</select></div></div>' +
      '<div class="fg"><label class="fl" for="sopn-sol">Quién lo pidió</label><select class="fc" id="sopn-sol"></select></div>' +
      '<div class="fg"><label class="fl" for="sopn-tit">Título <span class="req">*</span></label><input class="fc" id="sopn-tit" maxlength="200"></div>' +
      '<div class="fg"><label class="fl" for="sopn-desc">Qué pasa</label><textarea class="fc" id="sopn-desc" rows="4"></textarea></div>' +
      '<label class="u-row6"><input type="checkbox" id="sopn-res"> Ya está resuelto (cargar la respuesta y las horas)</label>' +
      '<div class="ft-box" id="sopn-resb"><div class="fg"><label class="fl" for="sopn-rta">Cómo se resolvió</label><textarea class="fc" id="sopn-rta" rows="3"></textarea></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="sopn-h">Horas</label><input class="fc u-tr" id="sopn-h" type="number" min="0" step="0.25"></div>' +
        '<div class="fg"><label class="fl" for="sopn-f">Fecha de trabajo</label><input class="fc" id="sopn-f" type="date" value="' + _hoyLocal() + '"></div></div></div>';
    pintarNuevo(); openM('m-sopn');
  }
  async function pintarNuevo() {
    var emp = v('sopn-emp');
    var cons = S.d.cons.filter(function (c) { return c.empresa_id === emp && c.email; });
    $('sopn-sol').innerHTML = opts(cons.map(function (c) { return [String(c.email).toLowerCase(), ((c.nombre || '') + ' ' + (c.apellido || '')).trim() + ' · ' + c.email]; }), '', 'Lo cargo yo');
    $('sopn-des').innerHTML = '<option value="">' + (emp ? 'Cargando…' : 'Elegí primero la empresa') + '</option>';
    if (!emp) return;
    var r = await db().from('v_soporte_desarrollos').select('id,titulo,tipo_nombre,ganado').eq('empresa_id', emp).order('titulo');
    if (v('sopn-emp') !== emp) return;
    $('sopn-des').innerHTML = opts((r.data || []).map(function (d) { return [d.id, d.titulo + ' · ' + d.tipo_nombre + (d.ganado ? '' : ' (no vendido)')]; }), '', 'Sin desarrollo');
  }
  async function crearTicket() {
    var b = $('sopn-ok'); b.disabled = true;
    try {
      var res = $('sopn-res').checked;
      var r = await rpc('soporte_crear', { p: { empresa_id: v('sopn-emp'), desarrollo_id: v('sopn-des'), tipo: v('sopn-tip'), canal: v('sopn-can'), prioridad: v('sopn-pri'),
        solicitante: v('sopn-sol'), titulo: v('sopn-tit'), descripcion: v('sopn-desc'), resuelto: res,
        respuesta: res ? v('sopn-rta') : '', horas: res ? v('sopn-h') : '', fecha: v('sopn-f') } });
      closeM('m-sopn'); toast('Se creó ' + r.id, 'ok'); await trasCambio(r.id);
    } catch (e) { toast(e.message || String(e), 'err'); }
    finally { b.disabled = false; }
  }

  VISTAS.soporte = async function (el, op) {
    el.innerHTML = uiHd('Soporte', 'Los pedidos de los clientes: responder, clasificar y resolver.',
        '<input class="fc" id="sop-q" placeholder="Buscar ticket, empresa o pedido…" aria-label="Buscar">' + uiBtn('Nuevo ticket', 'mas', 'p', 'id="sop-nuevo"')) +
      '<div id="sop-cuerpo"><div class="loading"><div class="spin"></div> Cargando los tickets…</div></div>';
    el.querySelector('#sop-q').value = S.busca;
    var sp = subPedida(); if (SUBS.indexOf(sp) >= 0) S.sub = sp;
    if (S.d && !(op && op.forzar)) { pintar(el); var antes = JSON.stringify(S.d); cargar().then(function () { if (JSON.stringify(S.d) !== antes) pintar(el); }).catch(function () {}); }
    else { await cargar(); pintar(el); }
    el.onclick = function (ev) {
      var b = ev.target.closest('[data-sfil],[data-sver],[data-sfac],[data-sdesfac],[data-srep],[data-sahab],[data-saav],[data-saotro],#sop-nuevo'); if (!b) return;
      if (b.matches('[data-sahab],[data-saav],[data-saotro]')) return accionAccesos(b, el);
      if (b.id === 'sop-nuevo') return S.sub === 'reportes' ? abrirReporte('') : abrirNuevo();
      if (b.hasAttribute('data-srep')) return abrirReporte(b.getAttribute('data-srep'));
      if (b.hasAttribute('data-sfac')) return marcarFacturado(JSON.parse(b.getAttribute('data-sfac')));
      if (b.hasAttribute('data-sdesfac')) {
        var k = JSON.parse(b.getAttribute('data-sdesfac'));
        return ask('Se borra la marca de facturado de ' + k.n + ' en ' + nomMes(S.per) + '.', '¿Desmarcar?', { ok: 'Desmarcar' }).then(async function (ok) {
          if (!ok) return;
          try { await rpc('soporte_marcar_facturado', { p: { empresa_id: k.e, desarrollo_id: k.d, periodo: S.per, desmarcar: true } }); await cargar(); pintar(el); }
          catch (e) { toast(e.message, 'err'); }
        });
      }
      if (b.hasAttribute('data-sver')) return verTicket(b.getAttribute('data-sver'));
      S.filtro = b.getAttribute('data-sfil'); pintar(el);
    };
    el.onchange = function (ev) {
      if (ev.target.matches('[data-saemp],[data-saacc]')) return cambioAccesos(ev.target, el);
      if (ev.target.id === 'sop-emp') { S.emp = ev.target.value; pintar(el); }
      if (ev.target.id === 'sop-resp') { S.resp = ev.target.value; pintar(el); }
      if (ev.target.id === 'sop-per' && /^\d{4}-\d{2}$/.test(ev.target.value)) { S.per = ev.target.value; pintar(el); }
    };
    el.querySelector('#sop-q').oninput = function () { S.busca = this.value.toLowerCase().trim(); pintar(el); };
  };
  VISTAS.soporte.irA = function (s) { if (SUBS.indexOf(s || 'tickets') < 0) return; S.sub = s || 'tickets'; pintar($('vista')); window.scrollTo(0, 0); };
  VISTAS.soporte.precargar = cargar;
})();

/* ══════════════════════════════════════════════════════════════════════
   tablero-tareas.js · el tablero de tareas (reemplaza _TareasDash.html)
   ──────────────────────────────────────────────────────────────────────
   Tareas, reuniones, recordatorios y comentarios en una pantalla. Lo usa
   PM (vista Tareas); escrito una vez para usarlo también en el Portal.

     montarTablero(el, opts)   pinta el tablero completo en el elemento
       opts { titulo, actividades:true (pestaña Actividades) }

   Datos: crm_giwa.v_tareas (= getTasksDashboard, validada) y, en la
   pestaña Actividades, v_actividades (= getActividadesDash). Las acciones
   son las de la ficha de tarea (verTarea / nuevaTarea / tareaHecha).
   «Mías» = estoy de responsable; sólo el responsable finaliza o delega.

   PENDIENTE: «Reunión» (crea el evento en Google Calendar: puente de Google).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var GRUPOS = [
    { k: 'project', label: 'Proyectos / Desarrollos', icon: 'codigo' },
    { k: 'client', label: 'Clientes', icon: 'personas' },
    { k: 'admin', label: 'Administrativas', icon: 'documento' }
  ];
  var PESTANAS = [['all', 'Todas'], ['project', 'Proyectos'], ['client', 'Clientes'], ['admin', 'Administrativas'], ['act', 'Actividades']];
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function nuevoEstado(opts) {
    return { opts: opts || {}, tab: 'all', day: '', range: '', q: '', month: null, actState: 'open',
             f: { state: 'open', type: '', ctx: '', who: '', mine: true } };
  }
  function lista(s) { return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); }
  function corto(iso) { if (!iso) return '—'; var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
  function prio(p) { var x = String(p || '').toLowerCase(); return x.indexOf('alta') >= 0 ? 'xr' : (x.indexOf('media') >= 0 ? 'xy' : 'xm'); }

  window.montarTablero = async function (el, opts) {
    var S = el._tablero || (el._tablero = nuevoEstado(opts));
    S.opts = opts || S.opts;
    el.innerHTML = '<div class="loading"><div class="spin"></div> Cargando tareas…</div>';
    var r = await Promise.all([
      db().from('v_tareas').select('*'),
      db().from('usuarios').select('mail,nombre').eq('es_giwa', true).eq('activo', true).order('orden'),
      db().rpc('es_admin')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    var me = String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase();
    var clientes = {};
    r[0].data.forEach(function (t) { if (t.client_id) clientes[t.client_id] = t.client_name || t.client_id; });
    S.d = { tasks: r[0].data, me: me, isAdmin: !!r[2].data, today: isoMas(0),
            users: r[1].data.map(function (u) { return { mail: String(u.mail || '').trim().toLowerCase(), name: u.nombre || u.mail }; }),
            clients: Object.keys(clientes).map(function (k) { return { id: k, name: clientes[k] }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); }) };
    S.act = null;
    if (!S.month) S.month = S.d.today.slice(0, 7);
    pintar(el);
    if (!el._tableroBound) enganchar(el);
  };

  function nombre(S, mail) { var u = S.d.users.find(function (x) { return x.mail === mail; }); return u ? u.name : String(mail || '').split('@')[0]; }
  function mia(S, t) { return lista(t.assignees).indexOf(S.d.me) >= 0; }
  function sumarDias(iso, n) { var d = _pd(iso); d.setDate(d.getDate() + n); return mISO(d); }

  // ── filtro (_tdMatch) ──
  function pasa(S, t, base) {
    var f = (base || S).f, s = base || S, today = S.d.today;
    if (t.hidden && f.state !== 'all' && f.state !== 'closed') return false;
    if (f.state === 'open' && t.closed) return false;
    if (f.state === 'closed' && !t.closed) return false;
    if (f.state === 'late' && !t.overdue) return false;
    if (f.state === 'today' && (t.closed || t.due !== today)) return false;
    if (f.type && String(t.type).toLowerCase().indexOf(f.type) < 0) return false;
    if (f.ctx) { var x = f.ctx.split(':'); if (x[0] === 'c' && t.client_id !== x[1]) return false; if (x[0] === 'p' && (t.project_ids || []).indexOf(x[1]) < 0) return false; }
    if (f.who && lista(t.assignees).indexOf(f.who) < 0) return false;
    if (f.mine && !mia(S, t)) return false;
    if (s.day && t.due !== s.day) return false;
    if (s.range) {
      var end = { today: today, tomorrow: sumarDias(today, 1), week: sumarDias(today, 7), month: sumarDias(today, 30) }[s.range];
      var from = s.range === 'tomorrow' ? end : today;
      if (t.closed || !t.due || t.due < from || t.due > end) return false;
    }
    if (s.q && [t.title, t.detail, t.client_name, t.project_name, t.item_name, t.id].join(' ').toLowerCase().indexOf(s.q) < 0) return false;
    return true;
  }
  function orden(a, b) { if (a.closed !== b.closed) return a.closed ? 1 : -1; return String(a.due || '9999').localeCompare(String(b.due || '9999')); }

  function tabla(S, rows, grupo) {
    var today = S.d.today;
    var h = '<div class="u-ovx"><table class="td-tbl"><thead><tr><th></th><th>Tarea</th><th>' + (grupo === 'admin' ? 'Responsable' : (grupo === 'client' ? 'Cliente' : 'Cliente / Proyecto')) +
      '</th><th>Vence</th><th>Prioridad</th><th>Com.</th><th></th></tr></thead><tbody>';
    rows.forEach(function (t) {
      var late = t.overdue, hoy = !t.closed && t.due === today, st = late ? 'late' : t.canon, id = esc(t.id), rec = t.is_alert;
      var sub = [t.item_name, t.grp === 'project' ? t.project_name : '', rec ? 'Recordatorio' : (t.type !== 'Tarea' ? t.type : '')].filter(Boolean).join(' · ');
      var cp = grupo === 'admin' ? lista(t.assignees).map(function (m) { return nombre(S, m); }).join(', ') : [t.client_name, t.project_name].filter(Boolean).join(' / ');
      var puede = !t.closed && mia(S, t);
      h += '<tr><td><button class="td-chk' + (t.closed ? ' done' : '') + '" ' + (puede ? 'data-tb="hecho" data-id="' + id + '"' : 'disabled') +
          ' data-tip="' + (t.closed ? 'Cerrada' : (puede ? (rec ? 'Cerrar recordatorio' : 'Finalizar') : 'Solo el responsable la finaliza')) + '" aria-label="Finalizar">' + (t.closed ? ico('check') : '') + '</button></td>' +
        '<td><div class="td-t" title="' + esc(t.title) + '">' + esc(t.title) + '<span class="td-st ' + st + '">' + esc(late ? 'Vencida' : t.state) + '</span></div>' + (sub ? '<div class="td-t2">' + esc(sub) + '</div>' : '') + '</td>' +
        '<td class="td-cp" title="' + esc(cp) + '">' + esc(cp || '—') + '</td>' +
        '<td><span class="td-due' + (late ? ' late' : (hoy ? ' today' : '')) + '">' + ico('calendario') + (hoy ? 'Hoy' : corto(t.due)) + '</span></td>' +
        '<td>' + (t.priority ? '<span class="est"><span class="est-dot e-' + prio(t.priority) + '"></span><span class="t-' + prio(t.priority) + '">' + esc(t.priority) + '</span></span>' : '') + '</td>' +
        '<td><span class="m u-s10-mt">' + ico('chat') + ' ' + (t.comments || 0) + '</span></td>' +
        '<td>' + '<button class="btn bg xs btn-ico" data-tb="abrir" data-id="' + id + '" data-tip="Ver, comentar, finalizar, delegar" aria-label="Abrir">' + ico('abrir') + '</button></td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function lateral(S) {
    var d = S.d, f = S.f, today = d.today, opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    var h = '<div class="td-side"><div class="td-card"><div class="td-side-h u-row8">' + ico('filtro') + ' Filtros<button class="btn bg xs u-mla" data-tb="limpiar">Limpiar</button></div>' +
      '<label class="fl" for="tb-type">Tipo</label><select class="fc" id="tb-type" data-tbf="type">' +
        [['', 'Todos'], ['tarea', 'Tarea'], ['reuni', 'Reunión']].concat(d.isAdmin ? [['administr', 'Administración']] : []).map(function (o) { return opt(o[0], o[1], f.type); }).join('') + '</select>' +
      '<label class="fl" for="tb-ctx">Cliente / Proyecto</label><select class="fc" id="tb-ctx" data-tbf="ctx"><option value="">Todos</option>' +
        d.clients.map(function (c) {
          var ps = {}; d.tasks.forEach(function (t) { if (t.client_id === c.id) (t.project_ids || []).forEach(function (p, i) { ps[p] = (String(t.project_name || '').split(', ')[i] || p); }); });
          return '<optgroup label="' + esc(c.name) + '">' + opt('c:' + c.id, 'Todo ' + c.name, f.ctx) + Object.keys(ps).map(function (p) { return opt('p:' + p, ps[p], f.ctx); }).join('') + '</optgroup>';
        }).join('') + '</select>' +
      '<label class="fl" for="tb-who">Responsable</label><select class="fc" id="tb-who" data-tbf="who"><option value="">Todos</option>' +
        d.users.map(function (u) { return opt(u.mail, u.name, f.who); }).join('') + '</select></div>';
    // el mes, con los días que tienen algo que vence
    var m = S.month.split('-'), y = +m[0], mo = +m[1] - 1, first = new Date(y, mo, 1), dias = new Date(y, mo + 1, 0).getDate(), off = (first.getDay() + 6) % 7, by = {};
    d.tasks.forEach(function (t) { if (!t.closed && !t.hidden && t.due && t.due.slice(0, 7) === S.month) { var o = by[t.due] || (by[t.due] = { n: 0, late: false }); o.n++; if (t.overdue) o.late = true; } });
    h += '<div class="td-card"><div class="td-side-h u-row8">' + MESES[mo] + ' ' + y + '<span class="u-mla u-row6">' +
      '<button class="btn bg xs btn-ico" data-tb="mes" data-n="-1" data-tip="Mes anterior" aria-label="Mes anterior">' + ico('izquierda') + '</button>' +
      '<button class="btn bg xs btn-ico" data-tb="mes" data-n="1" data-tip="Mes siguiente" aria-label="Mes siguiente">' + ico('derecha') + '</button></span></div><div class="td-cal">' +
      ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(function (x) { return '<div class="wd">' + x + '</div>'; }).join('');
    for (var i = 0; i < off; i++) h += '<span class="td-day out"></span>';
    for (var dd = 1; dd <= dias; dd++) {
      var iso = S.month + '-' + ('0' + dd).slice(-2), o = by[iso];
      h += '<button class="td-day' + (o ? (o.late ? ' has-late' : (iso === today ? ' has-today' : ' has')) : '') + (iso === today ? ' today' : '') + (S.day === iso ? ' sel' : '') +
        '" data-tb="dia" data-iso="' + iso + '" title="' + (o ? o.n + ' vence(n)' : '') + '">' + dd + '</button>';
    }
    h += '</div></div>';
    var cnt = function (a, b) { return d.tasks.filter(function (t) { return !t.closed && !t.hidden && t.due && t.due >= a && t.due <= b; }).length; };
    var ups = [['today', 'Hoy', cnt(today, today)], ['tomorrow', 'Mañana', cnt(sumarDias(today, 1), sumarDias(today, 1))],
               ['week', 'Esta semana', cnt(today, sumarDias(today, 7))], ['month', 'Próximos 30 días', cnt(today, sumarDias(today, 30))]];
    h += '<div class="td-card"><div class="td-side-h">' + ico('reloj') + ' Próximos vencimientos</div>' + ups.map(function (u) {
      return '<button class="td-up' + (S.range === u[0] ? ' on' : '') + '" data-tb="rango" data-r="' + u[0] + '"><span>' + ico('calendario') + u[1] + '</span><b class="m">' + u[2] + '</b></button>';
    }).join('') + '</div>';
    return h + '</div>';
  }

  // ── actividades (ProyectoHoras): proyecto → desarrollo, con el estado editable ──
  function actividades(S) {
    var A = S.act;
    if (!A) return '<div class="td-sec"><div class="loading"><div class="spin"></div> Cargando actividades…</div></div>';
    var cerr = function (a) { return /finaliz|cancel|complet|cerrad/i.test(a.estado || ''); };
    var rows = A.rows.filter(function (a) {
      if (S.actState === 'open' && cerr(a)) return false;
      if (S.actState === 'closed' && !cerr(a)) return false;
      if (S.f.who && lista(a.responsable).indexOf(S.f.who) < 0) return false;
      if (S.q && [a.cliente, a.proyecto, a.desarrollo, a.etapa, a.actividad, a.responsable].join(' ').toLowerCase().indexOf(S.q) < 0) return false;
      return true;
    });
    var h = '<div class="filtros u-mb10" role="group" aria-label="Estado">' + [['open', 'Abiertas'], ['closed', 'Finalizadas'], ['all', 'Todas']].map(function (x) {
      return '<button class="ptab' + (S.actState === x[0] ? ' on' : '') + '" data-tb="act-est" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (!A.estados.length) h += '<div class="td-sec"><div class="td-empty u-c-rd">Falta la fila «PHoras_EstadoActividad» en CotConfig: sin ella no se puede cambiar el estado.</div></div>';
    if (!rows.length) return h + '<div class="td-sec"><div class="td-empty">Sin actividades con estos filtros.</div></div>';
    var byP = {}, ord = [];
    rows.forEach(function (a) {
      if (!byP[a.proy_id]) { byP[a.proy_id] = { p: a, devs: {}, dOrd: [], n: 0 }; ord.push(a.proy_id); }
      var P = byP[a.proy_id], k = a.item_id || '_';
      if (!P.devs[k]) { P.devs[k] = []; P.dOrd.push(k); }
      P.devs[k].push(a); P.n++;
    });
    ord.forEach(function (pid) {
      var P = byP[pid];
      h += '<div class="td-sec"><div class="td-sec-h"><span class="td-sec-ic">' + ico('codigo') + '</span><span class="td-sec-t">' + esc([P.p.cliente, P.p.proyecto].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="td-sec-n">' + P.n + ' ' + (P.n === 1 ? 'actividad' : 'actividades') + '</span></div>';
      P.dOrd.forEach(function (k) {
        var l = P.devs[k];
        h += '<div class="td-act-dev">' + esc(l[0].desarrollo || 'Sin desarrollo') + '</div><div class="u-ovx"><table class="td-tbl td-acts"><thead><tr><th>Etapa</th><th>Actividad</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>' +
          l.map(function (a) {
            var ops = A.estados.slice(); if (a.estado && ops.indexOf(a.estado) < 0) ops.unshift(a.estado);
            var sel = A.estados.length ? '<select class="fc" data-tb-act="' + esc(a.id) + '" aria-label="Estado de la actividad">' + (a.estado ? '' : '<option value="">—</option>') +
              ops.map(function (s) { return '<option' + (s === a.estado ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' : esc(a.estado || '—');
            return '<tr><td class="td-cp">' + esc(a.etapa || '—') + '</td><td><div class="td-t">' + esc(a.actividad || '—') + '</div></td>' +
              '<td class="td-cp">' + esc(String(a.responsable || '').split(',').map(function (x) { x = x.trim(); return x.indexOf('@') > 0 ? nombre(S, x.toLowerCase()) : x; }).filter(Boolean).join(', ') || '—') + '</td><td>' + sel + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      });
      h += '</div>';
    });
    return h;
  }
  async function cargarActividades(el) {
    var S = el._tablero;
    var r = await Promise.all([db().from('v_actividades').select('*').order('orden'), db().rpc('estados_actividad')]);
    if (r[0].error || r[1].error) { toast('No pude cargar las actividades: ' + (r[0].error || r[1].error).message, 'err'); return; }
    S.act = { rows: r[0].data, estados: r[1].data || [] };
    pintar(el);
  }

  function pintar(el) {
    var S = el._tablero, d = S.d, o = S.opts, today = d.today, isAct = S.tab === 'act' && o.actividades;
    var base = { f: Object.assign({}, S.f, { state: 'all' }), day: '', range: '', q: '' };
    var scope = d.tasks.filter(function (t) { return !t.hidden && pasa(S, t, base); });
    var nOpen = scope.filter(function (t) { return !t.closed; }).length, nToday = scope.filter(function (t) { return !t.closed && t.due === today; }).length;
    var nClosed = scope.filter(function (t) { return t.closed; }).length, nAll = d.tasks.filter(function (t) { return pasa(S, t, base); }).length;
    var list = d.tasks.filter(function (t) { return pasa(S, t); }).sort(orden);
    var hr = new Date().getHours(), hd = _pd(today), DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    var h = '<div class="td' + (isAct ? ' td-solo' : '') + '"><div class="td-main">' +
      '<div class="td-hello"><div class="td-hello-h">' + (hr < 13 ? 'Buen día' : (hr < 20 ? 'Buenas tardes' : 'Buenas noches')) + ', ' + esc(nombre(S, d.me)) + '</div>' +
      '<div class="td-sub">' + DIAS[hd.getDay()] + ', ' + hd.getDate() + ' de ' + MESES[hd.getMonth()].toLowerCase() + ' · <b class="m">' + nOpen + '</b> para resolver</div></div>' +
      '<div class="td-head u-row8"><div class="td-h1 u-f1">' + esc(o.titulo || 'Tareas y pendientes') + '</div>' +
      '<div class="filtros" role="group" aria-label="De quién"><button class="ptab' + (S.f.mine ? ' on' : '') + '" data-tb="mias" data-v="1">Mías</button>' +
      '<button class="ptab' + (S.f.mine ? '' : ' on') + '" data-tb="mias" data-v="0">Todas</button></div>' +
      '<button class="btn bp sm" data-tb="nueva">' + ico('mas') + ' Tarea</button></div>' +
      '<div class="td-search">' + ico('buscar') + '<input id="tb-q" placeholder="Buscar tareas, clientes, proyectos, desarrollos…" aria-label="Buscar" value="' + esc(S.q) + '"></div>';
    if (!isAct) h += '<div class="td-kpis">' + [['open', 'Abiertas', nOpen, 'documento'], ['today', 'Vencen hoy', nToday, 'calendario'], ['closed', 'Cerradas', nClosed, 'check'], ['all', 'Todas', nAll, 'lista']].map(function (k) {
      return '<button class="td-kpi' + (S.f.state === k[0] ? ' on' : '') + '" data-tb="estado" data-v="' + k[0] + '"><span class="td-kpi-ic">' + ico(k[3]) + '</span>' +
        '<span><div class="td-kpi-n m">' + k[2] + '</div><div class="td-kpi-l">' + k[1] + '</div></span></button>';
    }).join('') + '</div>';
    h += '<div class="ptabs">' + PESTANAS.filter(function (x) { return x[0] !== 'act' || o.actividades; }).map(function (x) {
      return '<button class="ptab' + (S.tab === x[0] ? ' on' : '') + '" data-tb="tab" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (isAct) { el.innerHTML = h + actividades(S) + '</div></div>'; return; }
    GRUPOS.forEach(function (g) {
      if (S.tab !== 'all' && S.tab !== g.k) return;
      var rows = list.filter(function (t) { return t.grp === g.k; });
      if (S.tab === 'all' && !rows.length) return;
      var cut = S.tab === 'all' ? rows.slice(0, 8) : rows;
      h += '<div class="td-sec"><div class="td-sec-h"><span class="td-sec-ic">' + ico(g.icon) + '</span><span class="td-sec-t">' + g.label + '</span>' +
        '<span class="td-sec-n">' + rows.length + ' ' + (rows.length === 1 ? 'tarea' : 'tareas') + '</span>' +
        (S.tab === 'all' && rows.length > cut.length ? '<button class="btn bg xs u-mla" data-tb="tab" data-v="' + g.k + '">Ver todas ' + ico('flecha') + '</button>' : '') + '</div>' +
        (cut.length ? tabla(S, cut, g.k) : '<div class="td-empty">Nada para mostrar con estos filtros.</div>') + '</div>';
    });
    if (!list.length && S.tab === 'all') h += '<div class="td-sec"><div class="td-empty">Nada para mostrar con estos filtros.</div></div>';
    el.innerHTML = h + '</div>' + lateral(S) + '</div>';
  }

  function enganchar(el) {
    el._tableroBound = true;
    var recargar = function () { return montarTablero(el, el._tablero.opts); };
    var alGuardar = { onSave: recargar };
    var qT = null;
    el.addEventListener('input', function (ev) {
      if (ev.target.id !== 'tb-q') return;
      clearTimeout(qT);
      qT = setTimeout(function () {
        el._tablero.q = String(ev.target.value || '').trim().toLowerCase(); pintar(el);
        var i = document.getElementById('tb-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      }, 200);
    });
    el.addEventListener('change', async function (ev) {
      var t = ev.target, S = el._tablero;
      if (t.hasAttribute('data-tbf')) { S.f[t.getAttribute('data-tbf')] = t.value; return pintar(el); }
      if (t.hasAttribute('data-tb-act')) {
        var id = t.getAttribute('data-tb-act'), a = S.act.rows.find(function (x) { return x.id === id; }), prev = a.estado;
        t.disabled = true;
        var r = await db().rpc('set_estado_actividad', { hid: id, estado: t.value });
        t.disabled = false;
        if (r.error) { t.value = prev; return toast(r.error.message, 'err'); }
        a.estado = t.value; toast('Actividad: ' + t.value, 'ok'); pintar(el);
      }
    });
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tb]'); if (!b || !el.contains(b)) return;
      var S = el._tablero, a = b.getAttribute('data-tb'), id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
      var t = id && S.d.tasks.find(function (x) { return x.id === id; });
      if (a === 'mias') { S.f.mine = v === '1'; return pintar(el); }
      if (a === 'estado') { S.f.state = v; return pintar(el); }
      if (a === 'tab') { S.tab = v; if (v === 'act' && !S.act) cargarActividades(el); return pintar(el); }
      if (a === 'act-est') { S.actState = v; return pintar(el); }
      if (a === 'limpiar') { var o = S.opts, mo = S.month; el._tablero = nuevoEstado(o); el._tablero.d = S.d; el._tablero.act = S.act; el._tablero.month = mo; return pintar(el); }
      if (a === 'dia') { var iso = b.getAttribute('data-iso'); S.day = S.day === iso ? '' : iso; S.range = ''; return pintar(el); }
      if (a === 'rango') { var rg = b.getAttribute('data-r'); S.range = S.range === rg ? '' : rg; S.day = ''; return pintar(el); }
      if (a === 'mes') { var m = S.month.split('-'), d = new Date(+m[0], +m[1] - 1 + Number(b.getAttribute('data-n')), 1); S.month = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); return pintar(el); }
      if (a === 'nueva') return nuevaTarea({}, alGuardar);
      if (a === 'abrir' && t) return verTarea(t.id, alGuardar);
      if (a === 'hecho' && t) return tareaHecha({ id: t.id, title: t.title, type: t.type }, alGuardar);
    });
  }
})();

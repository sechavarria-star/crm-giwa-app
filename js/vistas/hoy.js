/* ══════════════════════════════════════════════════════════════════════
   vistas/hoy.js · Hoy: lo que hay que mirar sí o sí
   ──────────────────────────────────────────────────────────────────────
   Reemplaza _HoyDash.html. Una sola cola, de todos los proyectos, ordenada
   por urgencia: vencidas y de hoy arriba, lo de la semana abajo. Las
   tareas vienen hechas de crm_giwa.v_tareas (= getTasksDashboard,
   validada contra el Apps Script); acá sólo se filtra y se ordena.

   Diferencia con la pantalla vieja (a propósito): «alerta» es una tarea de
   tipo Administración. La vieja preguntaba por un grupo 'alert' que el
   servidor nunca devolvía: el KPI Alertas daba siempre 0 y posponer una
   alerta usaba la función de tareas.

   Plata: cuántos cobros vencidos y cuánto hay para facturar, de las vistas
   del dashboard de Administración (v_cobros_pendientes, v_facturar_*).

   29/10/2026: se sumó lo que tenía Proyectos › Tareas (tablero-tareas.js, que
   se borró): buscador, filtros por tipo, cliente y responsable, «Más
   adelante» (lo que vence después de la semana o no tiene fecha) y las
   finalizadas. Hoy es la única pantalla de tareas.

   29/10/2026: vuelve la practicidad de la vista original. Un solo filtro de
   persona (Responsable, por defecto vos); las alertas en su propio bloque;
   cada fila se abre con el chevron o tocándola y muestra detalle, comentarios
   y comentario rápido. Acciones: cerrada ⏱ Pasar a mañana y ✓ Finalizar/Cerrar;
   abierta ✓ · Delegar · Postergar · Recordatorio (sólo tareas). Las que cambian
   algo piden confirmación.

   PENDIENTE: la agenda (Google Calendar) llega con el puente de Google.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var H = { tareas: [], kpi: '', plata: null, q: '', tipo: '', cli: '', who: null, fin: false, users: [], ab: {}, coms: {}, panel: {}, cerr: {} };

  async function cargar() {
    var r = await Promise.all([
      db().from('v_tareas').select('*').eq('hidden', false),
      db().from('v_cobros_pendientes').select('dias'),
      db().from('v_facturar_mensuales').select('item_id'),
      db().from('v_facturar_saldos').select('item_id'),
      db().rpc('umbral', { clave: 'alerta_cobro_vencido_dias', por_defecto: 30 }),
      db().from('usuarios').select('mail,nombre').eq('es_giwa', true).eq('activo', true).order('orden')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    H.tareas = r[0].data;
    H.users = r[5].data.map(function (u) { return { mail: String(u.mail || '').trim().toLowerCase(), name: u.nombre || u.mail }; });
    var dv = Number(r[4].data) || 30;
    H.plata = { venc: r[1].data.filter(function (c) { return c.dias !== null && c.dias >= dv; }).length,
                mens: r[2].data.length, saldos: r[3].data.length };
    H.ok = true;
  }

  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function corto(iso) { var d = _pd(iso); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; }

  function esMia(t) { return String(t.assignees || '').toLowerCase().split(',').map(function (x) { return x.trim(); }).indexOf(yo()) >= 0; }
  function nombreDe(m) { var u = H.users.find(function (x) { return x.mail === String(m || '').trim().toLowerCase(); }); return u ? u.name : String(m || '').split('@')[0]; }
  function fila(t, hoy) {
    var sub = [t.client_name, t.project_name, t.item_name].filter(Boolean).join(' · ');
    var due = t.closed ? 'cerrada' : !t.due ? 'sin fecha' : t.overdue ? 'vencida ' + corto(t.due) : t.due === hoy ? 'hoy' : corto(t.due);
    var barra = t.overdue ? 'rd' : t.is_alert ? 'wa' : t.due === hoy ? 'bl' : '';
    var id = esc(t.id), ab = !!H.ab[t.id], fin = t.is_alert ? 'Cerrar' : 'Finalizar';
    var acc = function (a, icon, tip, cls) { return '<button class="btn bg xs btn-ico' + (cls || '') + '" data-hoy="' + a + '" data-id="' + id + '" data-tip="' + tip + '" aria-label="' + tip + '">' + ico(icon) + '</button>'; };
    var acciones = t.closed ? '' : ab
      ? acc('hecho', 'check', fin, ' h-ok') + (esMia(t) ? acc('p-del', 'personas', 'Delegar') : '') + acc('p-pos', 'calendario', 'Postergar') +
        (t.is_alert ? '' : acc('p-rec', 'campana', 'Recordatorio (con aviso por Telegram)'))
      : acc('manana', 'reloj', 'Pasar a mañana') + acc('hecho', 'check', fin, ' h-ok');
    var h = '<div class="hoy-item' + (ab ? ' ab' : '') + '"><div class="hoy-row" data-hoy="tog" data-id="' + id + '"><span class="hoy-bar ' + barra + '"></span>' +
      '<span class="chev">' + ico('derecha') + '</span>' +
      '<div class="hoy-main"><div class="hoy-t" title="' + esc(t.title) + '">' + esc(t.title) + '</div>' +
        (sub ? '<div class="hoy-t2">' + esc(sub) + '</div>' : '') + '</div>' +
      '<span class="hoy-due m' + (t.overdue ? ' late' : t.due === hoy ? ' today' : '') + '">' + esc(due) + '</span>' +
      '<span class="hoy-acc">' + acciones + '</span></div>';
    if (ab) h += cuerpo(t);
    return h + '</div>';
  }
  // Lo de adentro: panel de la acción elegida, detalle, comentarios y comentario rápido
  function cuerpo(t) {
    var id = esc(t.id), P = H.panel[t.id], cs = H.coms[t.id], h = '<div class="hoy-body">';
    if (P === 'del') h += '<div class="hoy-panel"><span class="fl ft-lbl">Delegar a</span><div class="ft-pills">' +
        H.users.filter(function (u) { return !esMia(t) || u.mail !== yo(); }).map(function (u) {
          return '<button type="button" class="ft-pill" data-hoy="del-a" data-id="' + id + '" data-m="' + esc(u.mail) + '">' + ico('personas') + ' ' + esc(u.name) + '</button>'; }).join('') + '</div></div>';
    if (P === 'pos' || P === 'rec') h += '<div class="hoy-panel u-row8"><label class="fl ft-lbl u-m0" for="hp-f-' + id + '">' + (P === 'pos' ? 'Nueva fecha' : 'Recordarme el') + '</label>' +
        '<input class="fc hoy-fecha" type="date" id="hp-f-' + id + '" min="' + isoMas(P === 'pos' ? 0 : 1) + '" value="' + isoMas(P === 'pos' ? 7 : 1) + '">' +
        (P === 'rec' ? '<label class="u-row6 u-s12"><input type="checkbox" id="hp-tg-' + id + '" checked> Avisar por Telegram</label>' : '') +
        '<button class="btn bp sm" data-hoy="' + (P === 'pos' ? 'pos-ok' : 'rec-ok') + '" data-id="' + id + '">' + (P === 'pos' ? 'Postergar' : 'Guardar') + '</button></div>';
    h += '<div class="hoy-meta">' + (t.detail ? '<div class="hoy-det">' + esc(t.detail) + '</div>' : '') +
      '<div class="u-s11-mt">Responsable: ' + esc(String(t.assignees || '').split(',').filter(Boolean).map(nombreDe).join(', ') || '—') +
      (t.type ? ' · ' + esc(t.type) : '') + (t.priority ? ' · Prioridad ' + esc(t.priority) : '') + '</div></div>';
    h += '<div class="hoy-coms">' + (cs === undefined ? '<div class="u-s11-mt">Cargando comentarios…</div>' : !cs.length ? '<div class="u-s11-mt">Sin comentarios.</div>' :
      cs.slice(0, H.todos === t.id ? 50 : 3).map(function (c) {
        return '<div class="hoy-com"><span class="u-fw6">' + esc(nombreDe(c.creador)) + '</span> <span class="u-s10-mt m">' + esc(corto(c.fecha)) + '</span> ' + esc(c.texto) + '</div>'; }).join('') +
      (cs.length > 3 && H.todos !== t.id ? '<button class="hoy-go" data-hoy="todos" data-id="' + id + '">ver todos (' + cs.length + ')</button>' : '')) + '</div>';
    if (!t.closed) h += '<input class="fc hoy-nota" data-nota="' + id + '" placeholder="Comentario rápido y Enter…" aria-label="Comentario rápido">';
    return h + '</div>';
  }
  async function comentarios(el, id) {
    var r = await db().from('comentarios').select('id,texto,fecha,creador,creado').eq('tarea_id', id).order('fecha', { ascending: false }).order('creado', { ascending: false });
    H.coms[id] = r.error ? [] : r.data; pintar(el);
  }

  function pintar(el) {
    if (_montado !== 'hoy') return;               // se terminó de leer con otro módulo en pantalla
    var hoy = isoMas(0), sem = isoMas(7), me = yo();
    if (H.who === null) H.who = me;               // entra mostrando lo propio
    var q = H.q.toLowerCase();
    var pasan = H.tareas.filter(function (t) {
      if (H.tipo && String(t.type || '').toLowerCase().indexOf(H.tipo) < 0) return false;
      if (H.cli && t.client_id !== H.cli) return false;
      if (H.who && String(t.assignees || '').toLowerCase().indexOf(H.who) < 0) return false;
      return !q || [t.title, t.detail, t.client_name, t.project_name, t.item_name, t.id].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var alertasAb = pasan.filter(function (t) { return !t.closed && t.is_alert; }).sort(function (a, b) { return String(a.due || '9999').localeCompare(String(b.due || '9999')); });
    var abiertas = pasan.filter(function (t) { return !t.closed && !t.is_alert; });
    var ord = function (a, b) { return (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || String(a.due || '9999').localeCompare(String(b.due || '9999')); };
    var ahora = abiertas.filter(function (t) { return t.due && t.due <= hoy; }).sort(ord);
    var semana = abiertas.filter(function (t) { return t.due > hoy && t.due <= sem; }).sort(ord);
    var despues = abiertas.filter(function (t) { return !t.due || t.due > sem; }).sort(ord);
    var cerradas = H.fin ? pasan.filter(function (t) { return t.closed; }).sort(function (a, b) { return String(b.due || '').localeCompare(String(a.due || '')); }) : [];
    var venc = ahora.filter(function (t) { return t.overdue; });
    var deHoy = ahora.filter(function (t) { return !t.overdue; });
    var alertas = alertasAb.filter(function (t) { return t.due && t.due <= sem; });
    if (H.kpi === 'venc') ahora = venc;
    if (H.kpi === 'hoy') ahora = deHoy;

    var P = H.plata || { venc: 0, mens: 0, saldos: 0 }, nPlata = P.venc + P.mens + P.saldos;
    var nombre = (CRM_USUARIO && CRM_USUARIO.nombre) || '';
    var fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    var k = function (key, cls, lbl, val, sub) {
      return '<button class="kpi ' + cls + (H.kpi === key ? ' on' : '') + '" data-hoy="kpi" data-k="' + key + '">' +
        '<div class="kpi-lbl">' + lbl + '</div><div class="kpi-val">' + val + '</div><div class="kpi-sub">' + sub + '</div></button>';
    };
    var h = '<div class="hoy-head"><div><div class="hoy-h1">Buen día' + (nombre ? ', ' + esc(nombre.split(' ')[0]) : '') + '</div>' +
      '<div class="hoy-sub">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + ' · ' + ahora.length + ' para resolver</div></div>' +
      '<div class="u-row8"><button class="btn bp sm" data-hoy="nueva">' + ico('mas') + ' Nueva tarea</button></div></div>';
    h += '<div class="kpi-grid hoy-kpis">' +
      k('venc', venc.length ? 'k-alerta' : 'k-neutro', 'Vencidas', venc.length, 'tareas atrasadas') +
      k('hoy', 'k-contratado', 'Para hoy', deHoy.length, 'vencen hoy') +
      k('alertas', alertas.length ? 'k-pendiente' : 'k-neutro', 'Alertas', alertas.length, 'de esta semana') +
      k('plata', nPlata ? 'k-abono' : 'k-neutro', 'Plata', nPlata, 'ver en Administración') +
      '</div>';
    var opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(t) + '</option>'; };
    var clis = {}; H.tareas.forEach(function (t) { if (t.client_id) clis[t.client_id] = t.client_name || t.client_id; });
    h += '<div class="filtros hoy-fil"><div class="sw u-f1"><input class="fc" id="hoy-q" placeholder="Buscar tarea, cliente o proyecto…" value="' + esc(H.q) + '" aria-label="Buscar"></div>' +
      '<select class="fc" data-hoyf="tipo" aria-label="Tipo">' + [['', 'Todos los tipos'], ['tarea', 'Tarea'], ['reuni', 'Reunión'], ['administr', 'Administración']].map(function (o) { return opt(o[0], o[1], H.tipo); }).join('') + '</select>' +
      '<select class="fc" data-hoyf="cli" aria-label="Cliente">' + opt('', 'Todos los clientes', H.cli) + Object.keys(clis).sort(function (a, b) { return clis[a].localeCompare(clis[b], 'es'); }).map(function (k) { return opt(k, clis[k], H.cli); }).join('') + '</select>' +
      '<select class="fc" data-hoyf="who" aria-label="Responsable">' + opt('', 'Todos los responsables', H.who) + H.users.map(function (u) { return opt(u.mail, u.name, H.who); }).join('') + '</select>' +
      '<label class="u-row6 u-s12"><input type="checkbox" data-hoyf="fin"' + (H.fin ? ' checked' : '') + '> Finalizadas</label></div>';
    // Cada bloque se pliega con su chevron, como «Más adelante». Lo que se pliega queda así (H.cerr) · 29/10/2026
    var sec = function (k, icon, tit, n, cuerpo, extra, cls, cerradoDef) {
      var cerrado = H.cerr[k] !== undefined ? H.cerr[k] : !!cerradoDef;
      return '<details class="hoy-sec' + (cls ? ' ' + cls : '') + '" data-hsec="' + k + '"' + (cerrado ? '' : ' open') + '><summary class="hoy-sec-h">' +
        '<span class="chev">' + ico('derecha') + '</span>' + ico(icon) + ' ' + tit + (n !== null ? ' <span class="u-s11-mt">' + n + '</span>' : '') + (extra || '') + '</summary>' + cuerpo + '</details>';
    };
    var lista = function (L, vacio) { return L.length ? L.map(function (t) { return fila(t, hoy); }).join('') : '<div class="hoy-vacio">' + vacio + '</div>'; };
    h += '<div class="hoy"><div>' +
      (alertasAb.length ? sec('alertas', 'campana', 'Alertas', alertasAb.length, lista(alertasAb, ''), '', 'hoy-alertas') : '') +
      (H.kpi === 'alertas' ? '' :
        sec('ahora', 'alerta', 'Ahora', ahora.length, lista(ahora, 'Nada vencido ni para hoy.'), H.kpi ? '<button class="hoy-go" data-hoy="kpi" data-k="">ver todo</button>' : '') +
        sec('semana', 'calendario', 'Esta semana', semana.length, lista(semana, 'Semana libre.')) +
        sec('despues', 'derecha', 'Más adelante', despues.length, lista(despues, 'Nada más adelante.'), '', '', !(H.q || H.cli || H.who || H.tipo)) +
        (H.fin ? sec('fin', 'check', 'Finalizadas', cerradas.length, lista(cerradas, 'Ninguna.')) : '')) +
      '</div><div>' +
      sec('agenda', 'reloj', 'Agenda de hoy', null, '<div class="hoy-vacio">La agenda de Google Calendar llega con el puente de Google.</div>') +
      sec('plata', 'plata', 'Plata', null,
        '<div class="hoy-plata"><span>Cobros vencidos</span><b class="m' + (P.venc ? ' u-c-rd' : '') + '">' + P.venc + '</b></div>' +
        '<div class="hoy-plata"><span>Abonos a facturar</span><b class="m">' + P.mens + '</b></div>' +
        '<div class="hoy-plata"><span>Desarrollos a facturar</span><b class="m">' + P.saldos + '</b></div>', '<a class="hoy-go" href="#/admin">Administración</a>') +
      '</div></div>';
    el.innerHTML = h;
  }

  function buscar(id) { return H.tareas.find(function (t) { return t.id === id; }); }

  // Mover la fecha (Pasar a mañana o Postergar), con confirmación. Tarea → posponer_tarea; alerta → posponer_alerta.
  async function mover(el, t, fecha, tit) {
    if (!(await ask('«' + t.title + '» pasa al ' + ff(fecha) + '.', tit, { ok: tit }))) return;
    var r = t.is_alert ? await db().rpc('posponer_alerta', { tid: t.id, fecha: fecha, nota: '' })
                       : await db().rpc('posponer_tarea', { tid: t.id, fecha: fecha });
    if (r.error) return toast('Error: ' + r.error.message, 'err');
    toast('Pasa al ' + ff(fecha), 'ok'); delete H.panel[t.id]; await cargar(); pintar(el);
  }

  VISTAS.hoy = async function (el, op) {
    var refrescar = async function () { await cargar(); pintar(el); };
    var alGuardar = { onSave: refrescar };
    await abrirModulo(el, { id: 'hoy', texto: 'Armando el día…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return H.ok; }, firma: function () { return JSON.stringify([H.tareas, H.plata]); }, pintar: function () { pintar(el); } });
    if (!el._hoySec) {                            // recordar qué bloque quedó plegado
      el._hoySec = true;
      el.addEventListener('toggle', function (ev) { var d = ev.target; if (_montado === 'hoy' && d.matches && d.matches('details[data-hsec]')) H.cerr[d.getAttribute('data-hsec')] = !d.open; }, true);
    }
    el.onkeydown = async function (ev) {
      var id = ev.target.getAttribute && ev.target.getAttribute('data-nota');
      if (!id || ev.key !== 'Enter' || !ev.target.value.trim()) return;
      ev.preventDefault();
      var txt = ev.target.value.trim(); ev.target.disabled = true;
      var r = await db().rpc('comentar', { p: { tarea_id: id, texto: txt, estado: 'Normal' } });
      ev.target.disabled = false;
      if (r.error) return toast(r.error.message, 'err');
      toast('Comentario guardado', 'ok'); await comentarios(el, id);
      var n = el.querySelector('[data-nota="' + id + '"]'); if (n) n.focus();
    };
    el.oninput = function (ev) {
      if (ev.target.id !== 'hoy-q') return;
      var pos = ev.target.selectionStart; H.q = ev.target.value; pintar(el);
      var n = document.getElementById('hoy-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    };
    el.onchange = function (ev) {
      var f = ev.target.getAttribute && ev.target.getAttribute('data-hoyf'); if (!f) return;
      H[f] = f === 'fin' ? ev.target.checked : ev.target.value; pintar(el);
    };
    el.onclick = async function (ev) {
      if (ev.target.closest('input,select,label')) return;
      var b = ev.target.closest('[data-hoy]'); if (!b) return;
      var a = b.getAttribute('data-hoy'), t = buscar(b.getAttribute('data-id'));
      if (a === 'kpi') {
        var k = b.getAttribute('data-k');
        if (k === 'plata') { location.hash = '#/admin'; return; }
        H.kpi = H.kpi === k ? '' : k; return pintar(el);
      }
      if (a === 'nueva') return nuevaTarea({}, alGuardar);
      if (!t) return;
      if (a === 'tog') { H.ab[t.id] = !H.ab[t.id]; if (H.ab[t.id] && H.coms[t.id] === undefined) comentarios(el, t.id); return pintar(el); }
      if (a === 'hecho') return tareaHecha(t, alGuardar);
      if (a === 'manana') return mover(el, t, isoMas(1), 'Pasar a mañana');
      if (a === 'p-del' || a === 'p-pos' || a === 'p-rec') { var k = a.slice(2); H.panel[t.id] = H.panel[t.id] === k ? '' : k; return pintar(el); }
      if (a === 'todos') { H.todos = t.id; return pintar(el); }
      if (a === 'pos-ok') { var f = document.getElementById('hp-f-' + t.id).value; if (!f) return toast('Elegí la fecha', 'err'); return mover(el, t, f, 'Postergar'); }
      if (a === 'del-a') {
        var m = b.getAttribute('data-m');
        if (!(await ask('«' + t.title + '» pasa a ' + nombreDe(m) + '. Le llega el aviso por Telegram.', 'Delegar', { ok: 'Delegar' }))) return;
        var rd = await db().rpc('delegar_tarea', { tid: t.id, a: m, nota: '' });
        if (rd.error) return toast(rd.error.message, 'err');
        toast('Delegada a ' + nombreDe(m), 'ok'); delete H.panel[t.id]; return refrescar();
      }
      if (a === 'rec-ok') {
        var fr = document.getElementById('hp-f-' + t.id).value, tg = document.getElementById('hp-tg-' + t.id).checked;
        if (!fr) return toast('Elegí la fecha', 'err');
        var rr = await db().rpc('recordatorio_tarea', { tid: t.id, fecha: fr, telegram: tg });
        if (rr.error) return toast(rr.error.message, 'err');
        toast('Te recuerda el ' + ff(fr) + (tg ? ' · también por Telegram' : ''), 'ok'); delete H.panel[t.id]; return refrescar();
      }
    };
  };
  VISTAS.hoy.precargar = cargar;
})();

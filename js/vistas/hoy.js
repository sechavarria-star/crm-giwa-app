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

   PENDIENTE: la agenda (Google Calendar) llega con el puente de Google.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var H = { tareas: [], mias: false, kpi: '', plata: null };

  async function cargar() {
    var r = await Promise.all([
      db().from('v_tareas').select('*').eq('closed', false).eq('hidden', false).not('due', 'is', null),
      db().from('v_cobros_pendientes').select('dias'),
      db().from('v_facturar_mensuales').select('item_id'),
      db().from('v_facturar_saldos').select('item_id'),
      db().rpc('umbral', { clave: 'alerta_cobro_vencido_dias', por_defecto: 30 })
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    H.tareas = r[0].data;
    var dv = Number(r[4].data) || 30;
    H.plata = { venc: r[1].data.filter(function (c) { return c.dias !== null && c.dias >= dv; }).length,
                mens: r[2].data.length, saldos: r[3].data.length };
    H.ok = true;
  }

  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function corto(iso) { var d = _pd(iso); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; }

  function fila(t, hoy) {
    var sub = [t.client_name, t.project_name, t.item_name].filter(Boolean).join(' · ');
    var due = t.overdue ? 'vencida ' + corto(t.due) : t.due === hoy ? 'hoy' : corto(t.due);
    var barra = t.overdue ? 'rd' : t.is_alert ? 'wa' : t.due === hoy ? 'bl' : '';
    var id = esc(t.id);
    return '<div class="hoy-row"><span class="hoy-bar ' + barra + '"></span>' +
      '<button class="td-chk" data-hoy="hecho" data-id="' + id + '" data-tip="' + (t.is_alert ? 'Procesar' : 'Finalizar') + '" aria-label="' + (t.is_alert ? 'Procesar' : 'Finalizar') + '"></button>' +
      '<div class="hoy-main"><div class="hoy-t" title="' + esc(t.title) + '">' + esc(t.title) + '</div>' +
        (sub ? '<div class="hoy-t2">' + esc(sub) + '</div>' : '') + '</div>' +
      (t.is_alert ? '<span class="est"><span class="est-dot e-xw"></span><span class="t-xw">alerta</span></span>' : '') +
      '<span class="hoy-due m' + (t.overdue ? ' late' : t.due === hoy ? ' today' : '') + '">' + esc(due) + '</span>' +
      '<button class="btn bg xs btn-ico" data-hoy="posponer" data-id="' + id + '" data-tip="Pasar a mañana" aria-label="Pasar a mañana">' + ico('calendario') + '</button>' +
      '<button class="btn bg xs btn-ico" data-hoy="abrir" data-id="' + id + '" data-tip="Ver, comentar, delegar" aria-label="Abrir tarea">' + ico('abrir') + '</button>' +
    '</div>';
  }

  function pintar(el) {
    if (_montado !== 'hoy') return;               // se terminó de leer con otro módulo en pantalla
    var hoy = isoMas(0), sem = isoMas(7), me = yo();
    var abiertas = H.tareas.filter(function (t) {
      return !H.mias || String(t.assignees || '').indexOf(me) >= 0 || t.creator === me;
    });
    var ord = function (a, b) { return (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || String(a.due).localeCompare(String(b.due)); };
    var ahora = abiertas.filter(function (t) { return t.due <= hoy; }).sort(ord);
    var semana = abiertas.filter(function (t) { return t.due > hoy && t.due <= sem; }).sort(ord);
    var venc = ahora.filter(function (t) { return t.overdue; });
    var deHoy = ahora.filter(function (t) { return !t.overdue; });
    var alertas = ahora.filter(function (t) { return t.is_alert; });
    if (H.kpi === 'venc') ahora = venc;
    if (H.kpi === 'hoy') ahora = deHoy;
    if (H.kpi === 'alertas') ahora = alertas;

    var P = H.plata || { venc: 0, mens: 0, saldos: 0 }, nPlata = P.venc + P.mens + P.saldos;
    var nombre = (CRM_USUARIO && CRM_USUARIO.nombre) || '';
    var fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    var k = function (key, cls, lbl, val, sub) {
      return '<button class="kpi ' + cls + (H.kpi === key ? ' on' : '') + '" data-hoy="kpi" data-k="' + key + '">' +
        '<div class="kpi-lbl">' + lbl + '</div><div class="kpi-val">' + val + '</div><div class="kpi-sub">' + sub + '</div></button>';
    };
    var h = '<div class="hoy-head"><div><div class="hoy-h1">Buen día' + (nombre ? ', ' + esc(nombre.split(' ')[0]) : '') + '</div>' +
      '<div class="hoy-sub">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + ' · ' + ahora.length + ' para resolver</div></div>' +
      '<div class="u-row8"><div class="filtros" role="group" aria-label="De quién">' +
        '<button class="ptab' + (H.mias ? '' : ' on') + '" data-hoy="mias" data-v="0">Todas</button>' +
        '<button class="ptab' + (H.mias ? ' on' : '') + '" data-hoy="mias" data-v="1">Mías</button></div>' +
      '<button class="btn bp sm" data-hoy="nueva">' + ico('mas') + ' Nueva tarea</button></div></div>';
    h += '<div class="kpi-grid hoy-kpis">' +
      k('venc', venc.length ? 'k-alerta' : 'k-neutro', 'Vencidas', venc.length, 'tareas y alertas atrasadas') +
      k('hoy', 'k-contratado', 'Para hoy', deHoy.length, 'vencen hoy') +
      k('alertas', alertas.length ? 'k-pendiente' : 'k-neutro', 'Alertas', alertas.length, 'facturar, cobrar, renovar') +
      k('plata', nPlata ? 'k-abono' : 'k-neutro', 'Plata', nPlata, 'ver en Administración') +
      '</div>';
    h += '<div class="hoy"><div>' +
      '<div class="hoy-sec"><div class="hoy-sec-h">' + ico('alerta') + ' Ahora <span class="u-s11-mt">' + ahora.length + '</span>' +
        (H.kpi ? '<button class="hoy-go" data-hoy="kpi" data-k="">ver todo</button>' : '') + '</div>' +
        (ahora.length ? ahora.map(function (t) { return fila(t, hoy); }).join('') : '<div class="hoy-vacio">Nada vencido ni para hoy.</div>') + '</div>' +
      '<div class="hoy-sec"><div class="hoy-sec-h">' + ico('calendario') + ' Esta semana <span class="u-s11-mt">' + semana.length + '</span></div>' +
        (semana.length ? semana.map(function (t) { return fila(t, hoy); }).join('') : '<div class="hoy-vacio">Semana libre.</div>') + '</div>' +
      '</div><div>' +
      '<div class="hoy-sec"><div class="hoy-sec-h">' + ico('reloj') + ' Agenda de hoy</div>' +
        '<div class="hoy-vacio">La agenda de Google Calendar llega con el puente de Google.</div></div>' +
      '<div class="hoy-sec"><div class="hoy-sec-h">' + ico('plata') + ' Plata<a class="hoy-go" href="#/admin">Administración</a></div>' +
        '<div class="hoy-plata"><span>Cobros vencidos</span><b class="m' + (P.venc ? ' u-c-rd' : '') + '">' + P.venc + '</b></div>' +
        '<div class="hoy-plata"><span>Abonos a facturar</span><b class="m">' + P.mens + '</b></div>' +
        '<div class="hoy-plata"><span>Desarrollos a facturar</span><b class="m">' + P.saldos + '</b></div></div>' +
      '</div></div>';
    el.innerHTML = h;
  }

  function buscar(id) { return H.tareas.find(function (t) { return t.id === id; }); }

  // Pasa la tarea (o la alerta) a mañana. Se ve al instante; si falla, vuelve.
  async function posponer(el, t) {
    var antes = { due: t.due, overdue: t.overdue }, nueva = isoMas(1);
    t.due = nueva; t.overdue = false; pintar(el);
    var r = t.is_alert ? await db().rpc('posponer_alerta', { tid: t.id, fecha: nueva, nota: '' })
                       : await db().rpc('posponer_tarea', { tid: t.id, fecha: nueva });
    if (r.error) { t.due = antes.due; t.overdue = antes.overdue; pintar(el); return toast('Error: ' + r.error.message, 'err'); }
    toast('Pasada a mañana', 'ok');
  }

  VISTAS.hoy = async function (el, op) {
    var refrescar = async function () { await cargar(); pintar(el); };
    var alGuardar = { onSave: refrescar };
    await abrirModulo(el, { id: 'hoy', texto: 'Armando el día…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return H.ok; }, firma: function () { return JSON.stringify([H.tareas, H.plata]); }, pintar: function () { pintar(el); } });
    el.onclick = function (ev) {
      var b = ev.target.closest('[data-hoy]'); if (!b) return;
      var a = b.getAttribute('data-hoy'), t = buscar(b.getAttribute('data-id'));
      if (a === 'mias') { H.mias = b.getAttribute('data-v') === '1'; return pintar(el); }
      if (a === 'kpi') {
        var k = b.getAttribute('data-k');
        if (k === 'plata') { location.hash = '#/admin'; return; }
        H.kpi = H.kpi === k ? '' : k; return pintar(el);
      }
      if (a === 'nueva') return nuevaTarea({}, alGuardar);
      if (!t) return;
      if (a === 'hecho') return tareaHecha(t, alGuardar);
      if (a === 'posponer') return posponer(el, t);
      if (a === 'abrir') return verTarea(t.id, alGuardar);
    };
  };
  VISTAS.hoy.precargar = cargar;
})();

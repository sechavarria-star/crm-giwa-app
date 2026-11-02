/* ══════════════════════════════════════════════════════════════════════
   tareas.js · tareas y comentarios con la forma de HOY (02/11/2026)
   ──────────────────────────────────────────────────────────────────────
   La misma fila que Hoy (barra de color, título, cliente · proyecto, fecha
   y acciones; al abrir: Delegar, Postergar, Recordatorio, detalle,
   comentarios y comentario rápido), para usarla desde Proyectos y
   Seguimiento. Hoy sigue con su propio código: esto es una copia de su
   forma, no lo reemplaza.
   Las tareas vienen de v_tareas (los mismos campos que usa Hoy).

   TareasUI.html(lista, st)          → filas; st = TareasUI.estado()
   TareasUI.manejar(ev, ctx)         → true si el clic/Enter era suyo
     ctx = { st, buscar(id), repintar(), refrescar(), users: [{ mail, name }] }
   ══════════════════════════════════════════════════════════════════════ */
var TareasUI = (function () {
  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function corto(iso) { var d = _pd(iso); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; }
  function esMia(t) { return String(t.assignees || '').toLowerCase().split(',').map(function (x) { return x.trim(); }).indexOf(yo()) >= 0; }
  function nombreDe(users, m) { var u = (users || []).find(function (x) { return x.mail === String(m || '').trim().toLowerCase(); }); return u ? u.name : String(m || '').split('@')[0]; }

  function fila(t, st, users) {
    var hoy = isoMas(0), sub = [t.client_name, t.project_name, t.item_name].filter(Boolean).join(' · ');
    var due = t.closed ? 'cerrada' : !t.due ? 'sin fecha' : t.overdue ? 'vencida ' + corto(t.due) : t.due === hoy ? 'hoy' : corto(t.due);
    var barra = t.overdue ? 'rd' : t.is_alert ? 'wa' : t.due === hoy ? 'bl' : '';
    var id = esc(t.id), ab = !!st.ab[t.id], fin = t.is_alert ? 'Cerrar' : 'Finalizar';
    var acc = function (a, icon, tip, cls) { return '<button class="btn bg xs btn-ico' + (cls || '') + '" data-tar="' + a + '" data-id="' + id + '" data-tip="' + tip + '" aria-label="' + tip + '">' + ico(icon) + '</button>'; };
    var acciones = t.closed ? '' : ab
      ? acc('hecho', 'check', fin, ' h-ok') + (esMia(t) ? acc('p-del', 'personas', 'Delegar') : '') + acc('p-pos', 'arena', 'Postergar') +
        (t.is_alert ? '' : acc('p-rec', 'campana', 'Recordatorio (con aviso por Telegram)'))
      : acc('manana', 'manana', 'Pasar a mañana') + acc('hecho', 'check', fin, ' h-ok');
    var h = '<div class="hoy-item' + (ab ? ' ab' : '') + '"><div class="hoy-row" data-tar="tog" data-id="' + id + '"><span class="hoy-bar ' + barra + '"></span>' +
      '<span class="chev">' + ico('derecha') + '</span>' +
      '<div class="hoy-main"><div class="hoy-t" title="' + esc(t.title) + '">' + esc(t.title) + '</div>' +
        (sub ? '<div class="hoy-t2">' + esc(sub) + '</div>' : '') + '</div>' +
      '<span class="hoy-due m' + (t.overdue ? ' late' : t.due === hoy ? ' today' : '') + '">' + esc(due) + '</span>' +
      '<span class="hoy-acc">' + acciones + '</span></div>';
    if (ab) h += cuerpo(t, st, users);
    return h + '</div>';
  }
  function cuerpo(t, st, users) {
    var id = esc(t.id), P = st.panel[t.id], cs = st.coms[t.id], h = '<div class="hoy-body">';
    if (P === 'del') h += '<div class="hoy-panel"><span class="fl ft-lbl">Delegar a</span><div class="ft-pills">' +
        (users || []).filter(function (u) { return !esMia(t) || u.mail !== yo(); }).map(function (u) {
          return '<button type="button" class="ft-pill" data-tar="del-a" data-id="' + id + '" data-m="' + esc(u.mail) + '">' + ico('personas') + ' ' + esc(u.name) + '</button>'; }).join('') + '</div></div>';
    if (P === 'pos' || P === 'rec') h += '<div class="hoy-panel u-row8"><label class="fl ft-lbl u-m0" for="tp-f-' + id + '">' + (P === 'pos' ? 'Nueva fecha' : 'Recordarme el') + '</label>' +
        '<input class="fc hoy-fecha" type="date" id="tp-f-' + id + '" min="' + isoMas(P === 'pos' ? 0 : 1) + '" value="' + isoMas(P === 'pos' ? 7 : 1) + '">' +
        (P === 'rec' ? '<label class="u-row6 u-s12"><input type="checkbox" id="tp-tg-' + id + '" checked> Avisar por Telegram</label>' : '') +
        '<button class="btn bp sm" data-tar="' + (P === 'pos' ? 'pos-ok' : 'rec-ok') + '" data-id="' + id + '">' + (P === 'pos' ? 'Postergar' : 'Guardar') + '</button></div>';
    h += '<div class="hoy-meta">' + (t.detail ? '<div class="hoy-det">' + esc(t.detail) + '</div>' : '') +
      '<div class="u-s11-mt">Responsable: ' + esc(String(t.assignees || '').split(',').filter(Boolean).map(function (m) { return nombreDe(users, m); }).join(', ') || '—') +
      (t.type ? ' · ' + esc(t.type) : '') + (t.priority ? ' · Prioridad ' + esc(t.priority) : '') + '</div></div>';
    h += '<div class="hoy-coms">' + (cs === undefined ? '<div class="u-s11-mt">Cargando comentarios…</div>' : !cs.length ? '<div class="u-s11-mt">Sin comentarios.</div>' :
      cs.slice(0, st.todos === t.id ? 50 : 3).map(function (c) {
        return '<div class="hoy-com"><span class="u-fw6">' + esc(nombreDe(users, c.creador)) + '</span> <span class="u-s10-mt m">' + esc(corto(c.fecha)) + '</span> ' + esc(c.texto) + '</div>'; }).join('') +
      (cs.length > 3 && st.todos !== t.id ? '<button class="hoy-go" data-tar="todos" data-id="' + id + '">ver todos (' + cs.length + ')</button>' : '')) + '</div>';
    if (!t.closed) h += '<input class="fc hoy-nota" data-tnota="' + id + '" placeholder="Comentario rápido y Enter…" aria-label="Comentario rápido">';
    return h + '</div>';
  }
  async function comentarios(ctx, id) {
    var r = await db().from('comentarios').select('id,texto,fecha,creador,creado').eq('tarea_id', id).order('fecha', { ascending: false }).order('creado', { ascending: false });
    ctx.st.coms[id] = r.error ? [] : r.data; ctx.repintar();
  }
  async function mover(ctx, t, fecha, tit) {
    if (!(await ask('«' + t.title + '» pasa al ' + ff(fecha) + '.', tit, { ok: tit }))) return;
    var r = t.is_alert ? await db().rpc('posponer_alerta', { tid: t.id, fecha: fecha, nota: '' })
                       : await db().rpc('posponer_tarea', { tid: t.id, fecha: fecha });
    if (r.error) return toast('Error: ' + r.error.message, 'err');
    toast('Pasa al ' + ff(fecha), 'ok'); delete ctx.st.panel[t.id]; ctx.refrescar();
  }

  return {
    estado: function () { return { ab: {}, panel: {}, coms: {}, todos: null }; },
    html: function (lista, st, users) { return (lista || []).map(function (t) { return fila(t, st, users); }).join(''); },
    manejar: function (ev, ctx) {
      if (ev.type === 'keydown') {
        var nid = ev.target.getAttribute && ev.target.getAttribute('data-tnota');
        if (!nid || ev.key !== 'Enter' || !ev.target.value.trim()) return false;
        ev.preventDefault();
        var txt = ev.target.value.trim(), inp = ev.target; inp.disabled = true;
        db().rpc('comentar', { p: { tarea_id: nid, texto: txt, estado: 'Normal' } }).then(function (r) {
          inp.disabled = false;
          if (r.error) return toast(r.error.message, 'err');
          toast('Comentario guardado', 'ok'); comentarios(ctx, nid);
        });
        return true;
      }
      if (ev.target.closest('input,select,label')) return false;
      var b = ev.target.closest('[data-tar]'); if (!b) return false;
      var a = b.getAttribute('data-tar'), t = ctx.buscar(b.getAttribute('data-id')), st = ctx.st, alGuardar = { onSave: ctx.refrescar };
      if (!t) return true;
      if (a === 'tog') { st.ab[t.id] = !st.ab[t.id]; if (st.ab[t.id] && st.coms[t.id] === undefined) comentarios(ctx, t.id); ctx.repintar(); return true; }
      if (a === 'hecho') { tareaHecha(t, alGuardar); return true; }
      if (a === 'manana') { mover(ctx, t, isoMas(1), 'Pasar a mañana'); return true; }
      if (a === 'p-del' || a === 'p-pos' || a === 'p-rec') { var k = a.slice(2); st.panel[t.id] = st.panel[t.id] === k ? '' : k; ctx.repintar(); return true; }
      if (a === 'todos') { st.todos = t.id; ctx.repintar(); return true; }
      if (a === 'pos-ok') { var f = document.getElementById('tp-f-' + t.id).value; if (!f) toast('Elegí la fecha', 'err'); else mover(ctx, t, f, 'Postergar'); return true; }
      if (a === 'del-a') {
        var m = b.getAttribute('data-m');
        ask('«' + t.title + '» pasa a ' + nombreDe(ctx.users, m) + '. Le llega el aviso por Telegram.', 'Delegar', { ok: 'Delegar' }).then(async function (ok) {
          if (!ok) return;
          var rd = await db().rpc('delegar_tarea', { tid: t.id, a: m, nota: '' });
          if (rd.error) return toast(rd.error.message, 'err');
          toast('Delegada a ' + nombreDe(ctx.users, m), 'ok'); delete st.panel[t.id]; ctx.refrescar();
        });
        return true;
      }
      if (a === 'rec-ok') {
        var fr = document.getElementById('tp-f-' + t.id).value, tg = document.getElementById('tp-tg-' + t.id).checked;
        if (!fr) { toast('Elegí la fecha', 'err'); return true; }
        db().rpc('recordatorio_tarea', { tid: t.id, fecha: fr, telegram: tg }).then(function (rr) {
          if (rr.error) return toast(rr.error.message, 'err');
          toast('Te recuerda el ' + ff(fr) + (tg ? ' · también por Telegram' : ''), 'ok'); delete st.panel[t.id]; ctx.refrescar();
        });
        return true;
      }
      return true;
    }
  };
})();

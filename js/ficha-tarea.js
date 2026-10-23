/* ══════════════════════════════════════════════════════════════════════
   ficha-tarea.js · LA ficha de tarea (reemplaza _FichaTarea.html)
   ──────────────────────────────────────────────────────────────────────
   Tareas, recordatorios administrativos, reuniones y sus comentarios. La
   usan Hoy y, más adelante, PM y Administración.

     verTarea(id, opts)       la tarea + sus comentarios, con sus acciones
     nuevaTarea(ctx, opts)    alta; ctx = { clientId, projectId }
     tareaHecha(t, opts)      el tilde de las listas: finalizar o procesar
       opts  { onSave: fn() }   se llama después de cualquier cambio

   Lee de crm_giwa.v_tareas y escribe con las funciones de la base
   (finalizar_tarea, procesar_alerta, delegar_tarea, ...): las reglas
   (quién puede, qué pasa con una recurrente) viven allá, no acá.

   Un solo responsable por tarea (regla del 20/10): «Para quién» es un
   desplegable, no una lista para tildar.

   PENDIENTE 2ª tanda: reglas de alerta y reuniones (Calendar, puente de
   Google), facturar y ajustar cuota desde la alerta (Administración).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var T = { base: null, baseT: 0, t: null, onSave: null };
  function $(id) { return document.getElementById(id); }
  function v(id) { return String(($(id) || {}).value || '').trim(); }

  var HTML =
    '<div class="mo" id="m-ftv"><div class="md">' +
      '<div class="mh"><span class="mt2" id="ftv-tit">Tarea</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-ftv">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="ft-ctx" id="ftv-ctx"></div><div class="ft-meta" id="ftv-meta"></div>' +
        '<div class="ft-note-t u-mb12" id="ftv-desc"></div>' +
        '<div class="u-row6" id="ftv-acc"></div>' +
        '<div class="ft-box" id="ftv-del"><div class="fg"><label class="fl" for="ftv-to">Delegar a</label><select class="fc" id="ftv-to"></select></div>' +
          '<textarea class="fc" id="ftv-dnota" rows="2" placeholder="Por qué se delega (opcional)"></textarea>' +
          '<div class="u-tr u-mt6"><button class="btn bp sm" data-fta="delegar">' + ico('flecha') + ' Delegar</button></div></div>' +
        '<div class="ft-box" id="ftv-rec"><div class="u-row6"><button class="btn bg sm" data-fta="rq" data-n="1">+1 día</button>' +
          '<button class="btn bg sm" data-fta="rq" data-n="3">+3 días</button><button class="btn bg sm" data-fta="rq" data-n="7">+1 semana</button>' +
          '<input class="fc u-wauto" type="date" id="ftv-rfecha" aria-label="Fecha del recordatorio"></div>' +
          '<label class="u-row6 u-mt6"><input type="checkbox" id="ftv-rtg"> Avisarme también por Telegram</label>' +
          '<div class="u-tr"><button class="btn bp sm" data-fta="recordar">Guardar</button></div></div>' +
        '<div class="ft-box" id="ftv-pos"><div class="g2"><div class="fg"><label class="fl" for="ftv-pfecha">Nueva fecha</label><input class="fc" type="date" id="ftv-pfecha"></div>' +
          '<div class="fg"><label class="fl" for="ftv-pnota">Motivo</label><input class="fc" id="ftv-pnota" placeholder="Opcional"></div></div>' +
          '<div class="u-tr"><button class="btn bp sm" data-fta="posponer">Posponer</button></div></div>' +
        '<div class="ft-sep"><div class="sec">Comentarios</div>' +
          '<select class="fc u-mb6" id="ftv-qk" aria-label="Comentario rápido" hidden></select>' +
          '<textarea class="fc" id="ftv-txt" rows="2" placeholder="Escribí un comentario…" aria-label="Comentario"></textarea>' +
          '<div class="u-row8 u-mt6 u-mb12"><label class="u-row6" id="ftv-seg-l" hidden><input type="checkbox" id="ftv-seg"> <span id="ftv-seg-t"></span></label>' +
            '<button class="btn bp sm u-mla" data-fta="comentar">' + ico('chat') + ' Comentar</button></div>' +
          '<div id="ftv-coms"></div></div>' +
      '</div>' +
    '</div></div>' +
    '<div class="mo" id="m-ftn"><div class="md md-sm">' +
      '<div class="mh"><span class="mt2">Nueva tarea</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-ftn">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="g2"><div class="fg"><label class="fl" for="ftn-cli">Cliente</label><select class="fc" id="ftn-cli"></select></div>' +
          '<div class="fg"><label class="fl" for="ftn-proy">Proyecto</label><select class="fc" id="ftn-proy"></select></div></div>' +
        '<div class="g3"><div class="fg"><label class="fl" for="ftn-prio">Prioridad</label><select class="fc" id="ftn-prio"></select></div>' +
          '<div class="fg"><label class="fl" for="ftn-who">Para quién</label><select class="fc" id="ftn-who"></select></div>' +
          '<div class="fg"><label class="fl" for="ftn-vence">Vence</label><input class="fc" type="date" id="ftn-vence"></div></div>' +
        '<div class="fg"><label class="fl" for="ftn-tit">Qué hay que hacer <span class="req">*</span></label><input class="fc" id="ftn-tit" list="ftn-rap"><datalist id="ftn-rap"></datalist></div>' +
        '<div class="fg"><label class="fl" for="ftn-det">Detalle <span class="req">*</span></label><textarea class="fc" id="ftn-det" rows="2"></textarea></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-ftn">Cancelar</button><button class="btn bp" id="ftn-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    document.body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-fta]'); if (!b) return;
      var a = b.getAttribute('data-fta');
      if (a === 'finalizar') hecho(T.t, true);
      if (a === 'procesar') hecho(T.t, true);
      if (a === 'caja') abrirCaja(b.getAttribute('data-caja'));
      if (a === 'delegar') delegar();
      if (a === 'rq') $('ftv-rfecha').value = isoMas(+b.getAttribute('data-n'));
      if (a === 'recordar') recordar();
      if (a === 'posponer') posponer();
      if (a === 'comentar') comentar();
    });
    $('ftn-ok').onclick = guardarNueva;
    $('ftn-cli').onchange = function () { llenarProyectos(''); };
    $('ftv-qk').onchange = function () { if (this.value) { $('ftv-txt').value = this.value; $('ftv-txt').focus(); this.value = ''; } };
  });

  // ── lo que no cambia en la sesión: equipo, listas, clientes, proyectos ──
  function lista(s, sep) { return String(s || '').split(sep || ',').map(function (x) { return x.trim(); }).filter(Boolean); }
  async function base() {
    if (T.base && Date.now() - T.baseT < 60000) return T.base;
    var r = await Promise.all([
      db().from('usuarios').select('mail,nombre,rol').eq('es_giwa', true).eq('activo', true).order('orden'),
      db().from('cot_config').select('clave,valor').in('clave', ['Tarea_Prioridad', 'Tarea_Rapida', 'Comentario_Estado', 'Comentario_Rapido']),
      db().from('empresas').select('id,nombre').order('nombre'),
      db().from('proyectos').select('id,nombre,empresa_id').order('nombre')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    var cfg = {}; r[1].data.forEach(function (c) { cfg[c.clave] = c.valor || ''; });
    T.base = {
      users: r[0].data.map(function (u) { return { mail: String(u.mail || '').trim().toLowerCase(), name: u.nombre || u.mail }; }),
      prio: lista(cfg.Tarea_Prioridad).length ? lista(cfg.Tarea_Prioridad) : ['Alta', 'Media', 'Baja'],
      rapidas: lista(cfg.Tarea_Rapida),
      seguimiento: lista(cfg.Comentario_Estado).filter(function (s) { return /seguim/i.test(s); })[0] || '',
      // Los comentarios rápidos llevan comas adentro («Lo llamé, no contestó»): se separan con ;
      notas: lista(cfg.Comentario_Rapido, ';'),
      clientes: r[2].data, proyectos: r[3].data
    };
    T.baseT = Date.now();
    return T.base;
  }
  function nombre(mail) {
    var m = String(mail || '').trim().toLowerCase(), u = ((T.base && T.base.users) || []).find(function (x) { return x.mail === m; });
    return u ? u.name : m.split('@')[0];
  }
  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function esAlerta(t) { return /administr/i.test(t.type || ''); }
  function esReunion(t) { return /reuni/i.test(t.type || ''); }
  function resp(t) { return lista(t.assignees); }
  function avisar(onSave) { if (onSave) onSave(); }

  // ── ver ──────────────────────────────────────────────────────
  window.verTarea = async function (id, opts) {
    opts = opts || {}; T.onSave = opts.onSave || null;
    ['ftv-del', 'ftv-rec', 'ftv-pos'].forEach(function (x) { $(x).classList.remove('on'); });
    $('ftv-tit').textContent = 'Tarea · ' + id; $('ftv-ctx').textContent = ''; $('ftv-meta').innerHTML = '';
    $('ftv-acc').innerHTML = ''; $('ftv-desc').innerHTML = '<div class="loading"><div class="spin"></div></div>'; $('ftv-coms').innerHTML = '';
    $('ftv-txt').value = '';
    openM('m-ftv');
    try {
      var r = await Promise.all([base(), db().from('v_tareas').select('*').eq('id', id).maybeSingle()]);
      if (r[1].error) throw new Error(r[1].error.message);
      var t = r[1].data; if (!t) { $('ftv-desc').innerHTML = '<div class="empty">No encontré la tarea.</div>'; return; }
      T.t = t; pintar(t); comentarios(t.id);
    } catch (e) { $('ftv-desc').innerHTML = '<div class="empty">No se pudo abrir: ' + esc(e.message) + '</div>'; }
  };

  function pintar(t) {
    var B = T.base, al = esAlerta(t), re = esReunion(t);
    $('ftv-tit').textContent = (al ? 'Recordatorio' : re ? 'Reunión' : 'Tarea') + ' · ' + t.id;
    $('ftv-ctx').textContent = [t.client_name, t.project_name, t.item_name].filter(Boolean).join(' · ');
    $('ftv-desc').innerHTML = '<b>' + esc(t.title) + '</b>' + (t.detail ? '\n' + esc(t.detail) : '');
    var tono = t.closed ? 'xg' : t.canon === 'curso' ? 'xt' : 'xb';
    var rs = resp(t);
    $('ftv-meta').innerHTML =
      '<span class="est"><span class="est-dot e-' + tono + '"></span><span class="t-' + tono + '">' + esc(t.state) + '</span></span>' +
      (t.priority ? '<span>' + ico('bandera') + esc(t.priority) + '</span>' : '') +
      (t.channels ? '<span>' + ico('campana') + 'Te recuerda el ' + esc(ff(t.due)) + (/telegram/i.test(t.channels) ? ' · también por Telegram' : '') + '</span>'
                  : '<span>' + ico('calendario') + 'Vence ' + esc(ff(t.due) || '—') + '</span>') +
      (t.frequency && !/^[uú]nica$/i.test(t.frequency) ? '<span>' + ico('repetir') + esc(t.frequency) + '</span>' : '') +
      '<span>' + ico('personas') + esc(rs.map(nombre).join(', ') || 'Sin responsable') + '</span>';
    var a = '';
    if (!t.closed && al) {
      a += '<button class="btn bok sm" data-fta="procesar">' + ico('check') + ' Procesar</button>' +
           '<button class="btn bg sm" data-fta="caja" data-caja="ftv-pos">' + ico('reloj') + ' Posponer</button>';
      if (/factur|ipc/i.test(t.title + ' ' + t.alert_type))
        a += '<a class="btn bg sm" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' + ico('abrir') + ' Facturar o ajustar en el CRM actual</a>';
    } else if (!t.closed && rs.indexOf(yo()) >= 0) {
      a += '<button class="btn bok sm" data-fta="finalizar">' + ico('check') + ' Finalizar</button>' +
           '<button class="btn bg sm" data-fta="caja" data-caja="ftv-del">' + ico('flecha') + ' Delegar</button>' +
           (re ? '' : '<button class="btn bg sm" data-fta="caja" data-caja="ftv-rec">' + ico('campana') + (t.channels ? ' Cambiar recordatorio' : ' Crear recordatorio') + '</button>');
    } else if (!t.closed) {
      a += '<span class="ft-info u-m0">Solo ' + esc(rs.map(nombre).join(', ') || 'el responsable') + ' puede finalizarla o delegarla. Vos podés comentar.</span>';
    }
    $('ftv-acc').innerHTML = a;
    // delegar a UNO, nunca al mismo
    $('ftv-to').innerHTML = '<option value="">— Elegí a quién —</option>' + B.users.filter(function (u) { return rs.length !== 1 || u.mail !== rs[0]; })
      .map(function (u) { return '<option value="' + esc(u.mail) + '">' + esc(u.name) + '</option>'; }).join('');
    $('ftv-qk').hidden = !B.notas.length;
    $('ftv-qk').innerHTML = '<option value="">Comentario rápido…</option>' + B.notas.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    $('ftv-seg-l').hidden = !B.seguimiento; $('ftv-seg-t').textContent = B.seguimiento; $('ftv-seg').checked = false;
  }

  function abrirCaja(id) {
    var c = $(id), on = !c.classList.contains('on');
    ['ftv-del', 'ftv-rec', 'ftv-pos'].forEach(function (x) { $(x).classList.remove('on'); });
    if (!on) return;
    if (id === 'ftv-rec') {
      $('ftv-rfecha').value = T.t.channels && T.t.due ? T.t.due : isoMas(1);
      $('ftv-rtg').checked = /telegram/i.test(T.t.channels || '');
    }
    if (id === 'ftv-pos') { $('ftv-pfecha').value = isoMas(1); $('ftv-pnota').value = ''; }
    c.classList.add('on');
  }

  async function comentarios(id) {
    var r = await db().from('comentarios').select('id,texto,fecha,estado,creador,creado').eq('tarea_id', id).order('creado', { ascending: false });
    if (r.error) { $('ftv-coms').innerHTML = '<div class="ft-err">' + esc(r.error.message) + '</div>'; return; }
    var links = function (h) { return h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); };
    $('ftv-coms').innerHTML = r.data.length ? r.data.map(function (c) {
      var seg = /seguim/i.test(c.estado || '');
      var cuando = c.creado ? new Date(c.creado) : null;
      var f = cuando ? ff(cuando) + ' ' + String(cuando.getHours()).padStart(2, '0') + ':' + String(cuando.getMinutes()).padStart(2, '0') : ff(c.fecha);
      return '<div class="ft-note' + (seg ? ' follow' : '') + '"><div class="ft-note-h"><span>' + ico('personas') + ' ' + esc(nombre(c.creador)) +
        (seg ? ' · ' + ico('bandera') + ' ' + esc(c.estado) : '') + '</span><span class="m">' + esc(f) + '</span></div>' +
        '<div class="ft-note-t">' + links(esc(c.texto)) + '</div></div>';
    }).join('') : '<div class="ft-info">Sin comentarios todavía.</div>';
  }

  // ── llamadas a la base: error → aviso; bien → aviso, cierra y avisa ──
  async function rpc(fn, args) {
    var r = await db().rpc(fn, args);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }
  async function hacer(fn, args, okMsg, cerrar) {
    try {
      var res = await rpc(fn, args);
      toast(typeof okMsg === 'function' ? okMsg(res) : okMsg, 'ok');
      if (cerrar) closeM(cerrar);
      avisar(T.onSave);
      return res;
    } catch (e) { toast(e.message, 'err'); return null; }
  }

  async function comentar() {
    var txt = v('ftv-txt'); if (!txt) return toast('Escribí el comentario', 'err');
    var st = $('ftv-seg').checked && T.base.seguimiento ? T.base.seguimiento : 'Normal';
    var res = await hacer('comentar', { p: { tarea_id: T.t.id, texto: txt, estado: st } }, 'Comentario guardado');
    if (res) { $('ftv-txt').value = ''; $('ftv-seg').checked = false; comentarios(T.t.id); }
  }
  function delegar() {
    var a = v('ftv-to'); if (!a) return toast('Elegí a quién se la delegás.', 'err');
    hacer('delegar_tarea', { tid: T.t.id, a: a, nota: v('ftv-dnota') }, function (r) { return 'Delegada → ' + r.id; }, 'm-ftv');
  }
  function recordar() {
    var f = v('ftv-rfecha'); if (!f) return toast('Elegí la fecha del recordatorio.', 'err');
    hacer('recordatorio_tarea', { tid: T.t.id, fecha: f, telegram: $('ftv-rtg').checked }, 'Te recuerda el ' + ff(f), 'm-ftv');
  }
  function posponer() {
    var f = v('ftv-pfecha'); if (!f) return toast('Elegí la nueva fecha.', 'err');
    hacer('posponer_alerta', { tid: T.t.id, fecha: f, nota: v('ftv-pnota') }, 'Pospuesta al ' + ff(f), 'm-ftv');
  }

  // ── el tilde: finalizar una tarea o procesar un recordatorio ──
  // Se confirma; el recordatorio pide un comentario opcional («facturé la FC 123»).
  async function hecho(t, desdeFicha) {
    if (!t) return;
    var al = esAlerta(t);
    var ok = await ask((al ? '¿Cerrar el recordatorio «' : '¿Finalizar «') + t.title + '»?', al ? 'Cerrar recordatorio' : 'Finalizar tarea', { ok: al ? 'Cerrar' : 'Finalizar' });
    if (!ok) return;
    var nota = '';
    if (al) { nota = await pedir('Comentario (opcional)', '', 'Cerrar recordatorio'); if (nota === null) return; }
    await hacer(al ? 'procesar_alerta' : 'finalizar_tarea', { tid: t.id, nota: String(nota || '').trim() }, function (r) {
      return al ? (r.closed ? 'Recordatorio terminado' : 'Cerrado · vuelve el ' + ff(r.next))
                : (r.next ? 'Hecha · la próxima es el ' + ff(r.next) : 'Finalizada');
    }, desdeFicha ? 'm-ftv' : null);
  }
  window.tareaHecha = function (t, opts) { T.onSave = (opts || {}).onSave || null; return hecho(t, false); };

  // ── nueva ────────────────────────────────────────────────────
  function llenarProyectos(sel) {
    var c = v('ftn-cli');
    $('ftn-proy').innerHTML = '<option value="">— Sin proyecto (nivel cliente) —</option>' +
      T.base.proyectos.filter(function (p) { return !c || p.empresa_id === c; })
        .map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.nombre || p.id) + '</option>'; }).join('');
  }
  window.nuevaTarea = async function (ctx, opts) {
    ctx = ctx || {}; T.onSave = (opts || {}).onSave || null;
    try {
      var B = await base();
      var cid = ctx.clientId || (B.proyectos.find(function (p) { return p.id === ctx.projectId; }) || {}).empresa_id || '';
      $('ftn-cli').innerHTML = '<option value="">— Cliente —</option>' + B.clientes.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('');
      llenarProyectos(ctx.projectId || '');
      $('ftn-prio').innerHTML = B.prio.map(function (p) { return '<option' + (p === 'Media' ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
      $('ftn-who').innerHTML = B.users.map(function (u) { return '<option value="' + esc(u.mail) + '"' + (u.mail === yo() ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
      $('ftn-vence').value = isoMas(7);
      $('ftn-rap').innerHTML = B.rapidas.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
      $('ftn-tit').value = ''; $('ftn-det').value = '';
      openM('m-ftn');
      setTimeout(function () { $('ftn-tit').focus(); }, 50);
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  };
  async function guardarNueva() {
    if (!v('ftn-tit')) return toast('Falta «Qué hay que hacer».', 'err');
    if (!v('ftn-det')) return toast('Falta el detalle.', 'err');
    var b = $('ftn-ok'); b.disabled = true;
    await hacer('nueva_tarea', { p: { title: v('ftn-tit'), detail: v('ftn-det'), clientId: v('ftn-cli'), projectId: v('ftn-proy'),
      priority: v('ftn-prio'), assignees: v('ftn-who'), due: v('ftn-vence') } }, function (r) { return 'Tarea creada · ' + r.id; }, 'm-ftn');
    b.disabled = false;
  }
})();

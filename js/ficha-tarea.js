/* ══════════════════════════════════════════════════════════════════════
   ficha-tarea.js · LA ficha de tarea (reemplaza _FichaTarea.html)
   ──────────────────────────────────────────────────────────────────────
   Tareas, recordatorios administrativos, reuniones y sus comentarios. La
   usan Hoy y, más adelante, PM y Administración.

     verTarea(id, opts)       la tarea + sus comentarios, con sus acciones
     nuevaTarea(ctx, opts)    alta; ctx = { clientId, projectId }
     tareaHecha(t, opts)      el tilde de las listas: finalizar o procesar
     nuevaRegla(ctx, opts)    «Nuevo recordatorio» (regla de alerta, sólo
                              Administración); ctx = { clientId, projectId, itemId }
       opts  { onSave: fn() }   se llama después de cualquier cambio

   Lee de crm_giwa.v_tareas y escribe con las funciones de la base
   (finalizar_tarea, procesar_alerta, delegar_tarea, ...): las reglas
   (quién puede, qué pasa con una recurrente) viven allá, no acá.

   Un solo responsable por tarea (regla del 20/10): «Para quién» es un
   desplegable, no una lista para tildar.

   PENDIENTE: reuniones (Calendar, puente de Google), facturar y ajustar
   cuota desde la alerta (Administración).
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
        '<div class="ft-box" id="ftv-fin"><div class="fg"><label class="fl" for="ftv-fnota">Nota de cierre</label><textarea class="fc" id="ftv-fnota" rows="2" placeholder="Opcional"></textarea></div>' +
          '<div class="u-tr u-mt6"><button class="btn bok sm" data-fta="finok">' + ico('check') + ' Finalizar</button></div></div>' +
        '<div class="ft-box" id="ftv-del"><div class="fg"><span class="fl ft-lbl">Delegar a</span><div class="ft-pills" id="ftv-to" role="radiogroup" aria-label="Delegar a"></div></div>' +
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
          '<div class="ft-pills u-mb6" id="ftv-qk" role="group" aria-label="Comentarios rápidos" hidden></div>' +
          '<textarea class="fc" id="ftv-txt" rows="2" placeholder="Escribí un comentario…" aria-label="Comentario"></textarea>' +
          '<div class="u-row8 u-mt6 u-mb12"><label class="u-row6" id="ftv-seg-l" hidden><input type="checkbox" id="ftv-seg"> <span id="ftv-seg-t"></span></label>' +
            '<button class="btn bp sm u-mla" data-fta="comentar">' + ico('chat') + ' Comentar</button></div>' +
          '<div id="ftv-coms"></div></div>' +
      '</div>' +
    '</div></div>' +
    '<div class="mo" id="m-ftn"><div class="md md-sm">' +
      '<div class="mh"><span class="mt2">Nueva tarea</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-ftn">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        // Igual que _FichaTarea (26/10): Qué · Proyecto (o «Sólo cliente») · Para quién · Vence · Prioridad · detalle opcional
        // Formato de la ficha original (27/10): rótulos en mayúsculas, prioridad con banderitas, personas y tareas rápidas en botones
        '<div class="fg"><label class="fl ft-lbl" for="ftn-tit">Qué hay que hacer <span class="req">*</span></label><div class="ft-pills u-mb6" id="ftn-rap"></div><input class="fc" id="ftn-tit"></div>' +
        '<div class="fg"><label class="fl ft-lbl" for="ftn-proy">Proyecto</label><select class="fc" id="ftn-proy"></select></div>' +
        '<div class="g2"><div class="fg"><span class="fl ft-lbl">Para quién</span><div class="ft-pills" id="ftn-who" role="radiogroup" aria-label="Para quién"></div></div>' +
          '<div class="fg"><label class="fl ft-lbl" for="ftn-vence">Vence</label><input class="fc" type="date" id="ftn-vence"></div></div>' +
        '<div class="fg"><span class="fl ft-lbl">Prioridad</span><div class="ft-pills" id="ftn-prio" role="radiogroup" aria-label="Prioridad"></div></div>' +
        '<div class="fg"><label class="fl ft-lbl" for="ftn-det">Detalle</label><textarea class="fc" id="ftn-det" rows="3" placeholder="Opcional"></textarea></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-ftn">Cancelar</button><button class="btn bp" id="ftn-ok">Guardar</button></div>' +
    '</div></div>' +
    '<div class="mo" id="m-fta"><div class="md md-sm">' +
      '<div class="mh"><span class="mt2">Nuevo recordatorio</span><button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-fta">' + ico('cerrar') + '</button></div>' +
      '<div class="mb2">' +
        '<div class="fg"><label class="fl" for="fta-tipo">Tipo de recordatorio <span class="req">*</span></label><select class="fc" id="fta-tipo"></select></div>' +
        '<div class="g2"><div class="fg"><label class="fl" for="fta-cli">Cliente <span class="req">*</span></label><select class="fc" id="fta-cli"></select></div>' +
          '<div class="fg"><label class="fl" for="fta-alc">Proyectos / Desarrollos</label><select class="fc" id="fta-alc"></select></div></div>' +
        '<div class="g3"><div class="fg"><label class="fl" for="fta-ini">Fecha desde <span class="req">*</span></label><input class="fc" type="date" id="fta-ini"></div>' +
          '<div class="fg"><label class="fl" for="fta-meses">Durante (meses)</label><input class="fc u-tr" type="number" min="1" id="fta-meses" value="12"></div>' +
          '<div class="fg"><label class="fl" for="fta-frec">Cada cuánto</label><select class="fc" id="fta-frec"></select></div></div>' +
        '<div class="g2"><div class="fg" id="fta-win"><label class="fl">Se factura</label><div class="ft-days">del <input class="fc" type="number" min="1" max="31" id="fta-d1" value="1" aria-label="Desde el día">' +
          ' al <input class="fc" type="number" min="1" max="31" id="fta-d2" value="10" aria-label="Hasta el día"> de cada mes</div></div>' +
          '<div class="fg"><label class="fl" for="fta-who">Para quién</label><select class="fc" id="fta-who"></select></div></div>' +
        '<div class="ft-sum" id="fta-sum"></div><div class="ft-info" id="fta-ipc"></div>' +
        '<div class="fg"><label class="fl" for="fta-det">Detalle</label><textarea class="fc" id="fta-det" rows="2"></textarea></div>' +
      '</div>' +
      '<div class="mf"><button class="btn bg" data-cerrar="m-fta">Cancelar</button><button class="btn bp" id="fta-ok">Guardar</button></div>' +
    '</div></div>';

  document.addEventListener('DOMContentLoaded', function () {
    var d = document.createElement('div'); d.innerHTML = HTML;
    while (d.firstChild) document.body.appendChild(d.firstChild);
    document.body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-fta]'); if (!b) return;
      var a = b.getAttribute('data-fta');
      if (a === 'finok') finalizar();
      if (a === 'procesar') hecho(T.t, true);
      if (a === 'caja') abrirCaja(b.getAttribute('data-caja'));
      if (a === 'delegar') delegar();
      if (a === 'rq') $('ftv-rfecha').value = isoMas(+b.getAttribute('data-n'));
      if (a === 'recordar') recordar();
      if (a === 'posponer') posponer();
      if (a === 'comentar') comentar();
    });
    $('ftn-ok').onclick = guardarNueva;
    $('fta-ok').onclick = guardarRegla;
    $('fta-tipo').onchange = function () { reglaTipo(); };
    $('fta-cli').onchange = function () { reglaCliente(); };
    $('fta-alc').onchange = function () { reglaInicio(); };
    ['fta-ini', 'fta-meses', 'fta-frec', 'fta-d1', 'fta-d2'].forEach(function (id) { $(id).addEventListener('change', function () { if (id === 'fta-ini') T.iniTocado = true; reglaResumen(); }); });
    // Comentario rápido: un clic carga el texto para editarlo (botones, no desplegable)
    $('ftv-qk').onclick = function (e) { var b = e.target.closest('[data-qk]'); if (b) { $('ftv-txt').value = b.getAttribute('data-qk'); $('ftv-txt').focus(); } };
    // Botones de una sola elección (prioridad, para quién, delegar a) y tareas rápidas
    ['ftn-who', 'ftn-prio', 'ftv-to'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { var b = e.target.closest('.ft-pill'); if (!b) return;
        this.querySelectorAll('.ft-pill').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    });
    $('ftn-rap').onclick = function (e) { var b = e.target.closest('[data-rap]'); if (b) { $('ftn-tit').value = b.getAttribute('data-rap'); $('ftn-tit').focus(); } };
  });

  // ── lo que no cambia en la sesión: equipo, listas, clientes, proyectos ──
  function lista(s, sep) { return String(s || '').split(sep || ',').map(function (x) { return x.trim(); }).filter(Boolean); }
  async function base() {
    if (T.base && Date.now() - T.baseT < 60000) return T.base;
    var r = await Promise.all([
      db().from('usuarios').select('mail,nombre,rol').eq('es_giwa', true).eq('activo', true).order('orden'),
      db().from('cot_config').select('clave,valor').in('clave', ['Tarea_Prioridad', 'Tarea_Rapida', 'Comentario_Estado', 'Comentario_Rapido', 'Tarea_AlertaTipo', 'Tarea_Frecuencia']),
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
      // Los comentarios rápidos llevan comas adentro («Lo llamé, no contestó»): se separan con ; o, si no hay,
      // con la coma pegada a la palabra siguiente («…no contestó,Me dijo…»)
      notas: lista(cfg.Comentario_Rapido, /;/.test(cfg.Comentario_Rapido || '') ? ';' : /,(?=\S)/),
      tiposAlerta: lista(cfg.Tarea_AlertaTipo), frecuencias: lista(cfg.Tarea_Frecuencia),
      clientes: r[2].data, proyectos: r[3].data
    };
    T.baseT = Date.now();
    return T.base;
  }
  function nombre(mail) {
    var m = String(mail || '').trim().toLowerCase(), u = ((T.base && T.base.users) || []).find(function (x) { return x.mail === m; });
    return u ? u.name : m.split('@')[0];
  }
  function elegido(id) { var b = $(id) && $(id).querySelector('.ft-pill.on'); return b ? b.getAttribute('data-v') : ''; }
  function yo() { return String((CRM_USUARIO && CRM_USUARIO.mail) || '').trim().toLowerCase(); }
  function esAlerta(t) { return /administr/i.test(t.type || ''); }
  function esReunion(t) { return /reuni/i.test(t.type || ''); }
  function resp(t) { return lista(t.assignees); }
  function avisar(onSave) { if (onSave) onSave(); }

  // ── ver ──────────────────────────────────────────────────────
  window.verTarea = async function (id, opts) {
    opts = opts || {}; T.onSave = opts.onSave || null;
    CAJAS.forEach(function (x) { $(x).classList.remove('on'); });
    $('ftv-tit').textContent = 'Tarea · ' + id; $('ftv-ctx').textContent = ''; $('ftv-meta').innerHTML = '';
    $('ftv-acc').innerHTML = ''; $('ftv-desc').innerHTML = '<div class="loading"><div class="spin"></div></div>'; $('ftv-coms').innerHTML = '';
    $('ftv-txt').value = '';
    openM('m-ftv');
    try {
      var r = await Promise.all([base(), db().from('v_tareas').select('*').eq('id', id).maybeSingle()]);
      if (r[1].error) throw new Error(r[1].error.message);
      var t = r[1].data; if (!t) { $('ftv-desc').innerHTML = '<div class="empty">No encontré la tarea.</div>'; return; }
      T.t = t; pintar(t); comentarios(t.id);
      if (opts.ir === 'delegar' && $('ftv-acc').querySelector('[data-caja=ftv-del]')) abrirCaja('ftv-del');
      if (opts.ir === 'comentar') setTimeout(function () { $('ftv-txt').focus(); }, 50);
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
      a += '<button class="btn bok sm" data-fta="caja" data-caja="ftv-fin">' + ico('check') + ' Finalizar</button>' +
           '<button class="btn bg sm" data-fta="caja" data-caja="ftv-del">' + ico('flecha') + ' Delegar</button>' +
           '<button class="btn bg sm" data-fta="caja" data-caja="ftv-pos">' + ico('reloj') + ' Posponer</button>' +
           (re ? '' : '<button class="btn bg sm" data-fta="caja" data-caja="ftv-rec">' + ico('campana') + (t.channels ? ' Cambiar recordatorio' : ' Crear recordatorio') + '</button>');
    } else if (!t.closed) {
      a += '<span class="ft-info u-m0">Solo ' + esc(rs.map(nombre).join(', ') || 'el responsable') + ' puede finalizarla o delegarla. Vos podés comentar.</span>';
    }
    $('ftv-acc').innerHTML = a;
    // delegar a UNO, nunca al mismo
    var gente = B.users.filter(function (u) { return rs.length !== 1 || u.mail !== rs[0]; });
    $('ftv-to').innerHTML = gente.map(function (u) { return '<button type="button" class="ft-pill" data-v="' + esc(u.mail) + '">' + ico('personas') + ' ' + esc(u.name) + '</button>'; }).join('');
    $('ftv-qk').hidden = !B.notas.length;
    $('ftv-qk').innerHTML = B.notas.map(function (x) { return '<button type="button" class="ft-pill" data-qk="' + esc(x) + '">' + esc(x) + '</button>'; }).join('');
    $('ftv-seg-l').hidden = !B.seguimiento; $('ftv-seg-t').textContent = B.seguimiento; $('ftv-seg').checked = false;
  }

  // Un recuadro abierto por vez
  var CAJAS = ['ftv-fin', 'ftv-del', 'ftv-rec', 'ftv-pos'];
  function abrirCaja(id) {
    var c = $(id), on = !c.classList.contains('on');
    CAJAS.forEach(function (x) { $(x).classList.remove('on'); });
    if (on && id === 'ftv-fin') $('ftv-fnota').value = '';
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
    var a = elegido('ftv-to'); if (!a) return toast('Elegí a quién se la delegás.', 'err');
    hacer('delegar_tarea', { tid: T.t.id, a: a, nota: v('ftv-dnota') }, function (r) { return 'Delegada → ' + r.id; }, 'm-ftv');
  }
  function recordar() {
    var f = v('ftv-rfecha'); if (!f) return toast('Elegí la fecha del recordatorio.', 'err');
    hacer('recordatorio_tarea', { tid: T.t.id, fecha: f, telegram: $('ftv-rtg').checked }, 'Te recuerda el ' + ff(f), 'm-ftv');
  }
  // Recordatorio → posponer_alerta (estado Pospuesta). Tarea → posponer_tarea (sólo la fecha) y el motivo va como comentario.
  async function posponer() {
    var f = v('ftv-pfecha'), n = v('ftv-pnota'); if (!f) return toast('Elegí la nueva fecha.', 'err');
    if (esAlerta(T.t)) return hacer('posponer_alerta', { tid: T.t.id, fecha: f, nota: n }, 'Pospuesta al ' + ff(f), 'm-ftv');
    try {
      await rpc('posponer_tarea', { tid: T.t.id, fecha: f });
      if (n) await rpc('comentar', { p: { tarea_id: T.t.id, texto: '↪ Pospuesta al ' + ff(f) + ': ' + n, estado: 'Normal' } });
      toast('Pospuesta al ' + ff(f), 'ok'); closeM('m-ftv'); avisar(T.onSave);
    } catch (e) { toast(e.message, 'err'); }
  }
  // Finalizar desde la ficha: con la nota de cierre opcional (desde las listas sigue el tilde con confirmación)
  function finalizar() {
    hacer('finalizar_tarea', { tid: T.t.id, nota: v('ftv-fnota') }, function (r) { return r.next ? 'Hecha · la próxima es el ' + ff(r.next) : 'Finalizada'; }, 'm-ftv');
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

  // ── nuevo recordatorio (regla de alerta) ─────────────────────
  // Sólo se ofrece lo que tiene algo por facturar; Renovación, además, abonos
  // en curso que vencen en 2 meses o menos (v_alertas_elegibles). La base valida igual.
  function reglaOk(i) { return i.pending && (!/renov/i.test(v('fta-tipo')) || i.renewable); }
  function reglaProyectos(cid) {
    var ps = {};
    T.eleg.filter(function (i) { return i.cliente_id === cid && reglaOk(i); }).forEach(function (i) { (ps[i.proy_id] = ps[i.proy_id] || []).push(i); });
    return ps;
  }
  function reglaTipo() {
    var t = v('fta-tipo'), want = /ipc/i.test(t) ? /trimes/i : (/factur/i.test(t) ? /mensual/i : null);
    if (want) { var o = Array.prototype.find.call($('fta-frec').options, function (x) { return want.test(x.value); }); if (o) $('fta-frec').value = o.value; }
    $('fta-win').hidden = !/factur/i.test(t);
    var keep = v('fta-cli') || T.rctx.clientId || '';
    var cids = {}; T.eleg.forEach(function (i) { if (reglaOk(i) && i.cliente_id) cids[i.cliente_id] = 1; });
    var cs = T.base.clientes.filter(function (c) { return cids[c.id]; });
    $('fta-cli').innerHTML = '<option value="">— Elegí el cliente —</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === keep ? ' selected' : '') + '>' + esc(c.nombre) + '</option>'; }).join('');
    reglaCliente();
  }
  function reglaCliente() {
    var prev = v('fta-alc'), ps = reglaProyectos(v('fta-cli'));
    var ctx = T.rctx.itemId ? 'd:' + T.rctx.itemId : (T.rctx.projectId ? 'p:' + T.rctx.projectId : '');
    $('fta-alc').innerHTML = '<option value="">Todos los proyectos</option>' + Object.keys(ps).map(function (pid) {
      var pn = (T.base.proyectos.find(function (p) { return p.id === pid; }) || {}).nombre || pid;
      return '<optgroup label="' + esc(pn) + '"><option value="p:' + esc(pid) + '">Todo el proyecto</option>' +
        ps[pid].map(function (i) { return '<option value="d:' + esc(i.item_id) + '">' + esc(i.nombre) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var opts = Array.prototype.map.call($('fta-alc').options, function (o) { return o.value; });
    $('fta-alc').value = opts.indexOf(prev) >= 0 ? prev : (opts.indexOf(ctx) >= 0 ? ctx : '');
    reglaInicio();
  }
  function reglaAlcance() {
    var a = v('fta-alc'), id = a.slice(2), cid = v('fta-cli');
    if (a.indexOf('d:') === 0) { var it = T.eleg.find(function (i) { return i.item_id === id; }); return { pids: it ? [it.proy_id] : [], iids: [id], items: it ? [it] : [] }; }
    if (a.indexOf('p:') === 0) return { pids: [id], iids: [], items: T.eleg.filter(function (i) { return i.proy_id === id; }) };
    return { pids: [], iids: [], items: T.eleg.filter(function (i) { return i.cliente_id === cid; }) };
  }
  // Fecha desde = el inicio del desarrollo (o el primero del alcance); se puede pisar a mano
  function reglaInicio() {
    var sc = reglaAlcance();
    var ini = sc.items.map(function (i) { return i.inicio; }).filter(Boolean).sort()[0] || '';
    var meses = sc.iids.length ? sc.items.map(function (i) { return Number(i.cuotas) || 0; }).filter(Boolean) : [];
    if (!T.iniTocado) { $('fta-ini').value = ini; if (meses.length) $('fta-meses').value = Math.max.apply(null, meses); }
    reglaResumen();
  }
  // El primer aviso lo calcula la base (ventana_alerta), igual que al guardar
  async function reglaResumen() {
    var ini = v('fta-ini'), sum = $('fta-sum'), fac = /factur/i.test(v('fta-tipo'));
    if (!ini) { sum.innerHTML = ''; $('fta-ipc').innerHTML = ''; return; }
    var r = await db().rpc('ventana_alerta', { inicio: ini, frecuencia: v('fta-frec'), dia_desde: fac ? Number(v('fta-d1')) : null, dia_hasta: fac ? Number(v('fta-d2')) : null });
    if (r.error) { sum.textContent = r.error.message; return; }
    var w = Array.isArray(r.data) ? r.data[0] : r.data, m = Number(v('fta-meses')) || 0;
    var desde = _pd(w.due); desde.setDate(desde.getDate() - (w.aviso || 0));
    var fin = m ? mCorrerDias(_pd(ini), 0) : null; if (fin) fin.setMonth(fin.getMonth() + m);
    sum.innerHTML = '<span>' + ico('calendario') + ' Primer aviso <b>' + ff(w.due) + '</b></span><span>Se ve desde <b>' + ff(desde) + '</b></span>' +
      '<span>Fecha fin <b>' + (fin ? ff(fin) : 'fin del contrato') + '</b></span>';
    if (!/ipc/i.test(v('fta-tipo'))) { $('fta-ipc').innerHTML = ''; return; }
    var ip = await db().rpc('ipc_ventana', { fecha: w.due });
    var d = ip.data || {};
    $('fta-ipc').innerHTML = d.ok ? ico('porcentaje') + ' IPC aplicable al primer aviso: ' + d.months.map(function (x) { return esc(x.month) + ' ' + String(x.pct).replace('.', ',') + '%'; }).join(' · ') +
      ' → <b>' + String(d.pct).replace('.', ',') + '%</b>' : esc(d.msg || (ip.error && ip.error.message) || 'No se pudo calcular el IPC');
  }
  window.nuevaRegla = async function (ctx, opts) {
    T.rctx = ctx || {}; T.onSave = (opts || {}).onSave || null; T.iniTocado = false;
    try {
      var r = await Promise.all([base(), db().from('v_alertas_elegibles').select('*').order('orden'), db().rpc('mail_admin')]);
      if (r[1].error) throw new Error(r[1].error.message);
      T.eleg = r[1].data;
      var B = r[0], adm = r[2].data || '';
      $('fta-tipo').innerHTML = '<option value="">— Elegí el tipo —</option>' + B.tiposAlerta.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');
      $('fta-frec').innerHTML = (B.frecuencias.length ? B.frecuencias : ['Mensual', 'Trimestral', 'Anual']).map(function (f) { return '<option' + (/mensual/i.test(f) ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('');
      $('fta-who').innerHTML = B.users.map(function (u) { return '<option value="' + esc(u.mail) + '"' + (u.mail === adm ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
      $('fta-det').value = ''; $('fta-meses').value = 12; $('fta-d1').value = 1; $('fta-d2').value = 10;
      reglaTipo();
      openM('m-fta');
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  };
  async function guardarRegla() {
    var sc = reglaAlcance(), fac = /factur/i.test(v('fta-tipo')), b = $('fta-ok'); b.disabled = true;
    await hacer('nueva_regla_alerta', { p: { type: v('fta-tipo'), clientId: v('fta-cli'), projectIds: sc.pids.join(', '), itemIds: sc.iids.join(', '),
      start: v('fta-ini'), months: v('fta-meses'), frequency: v('fta-frec'), dayFrom: fac ? v('fta-d1') : '', dayTo: fac ? v('fta-d2') : '',
      assignees: v('fta-who'), detail: v('fta-det') } }, function (r) { return 'Recordatorio creado · ' + r.id + ' · primer aviso ' + ff(r.due); }, 'm-fta');
    b.disabled = false;
  }

  // ── nueva ────────────────────────────────────────────────────
  // Proyecto: agrupado por cliente; «Sólo cliente · X» (cli:ID) es la tarea a nivel cliente
  function llenarProyectos(sel) {
    var B = T.base, op = function (val, txt) { return '<option value="' + esc(val) + '"' + (val === sel ? ' selected' : '') + '>' + esc(txt) + '</option>'; };
    $('ftn-proy').innerHTML = '<option value="">— Sin proyecto ni cliente —</option>' + B.clientes.map(function (c) {
      var ps = B.proyectos.filter(function (p) { return p.empresa_id === c.id; });
      return '<optgroup label="' + esc(c.nombre) + '">' + op('cli:' + c.id, 'Sólo cliente · ' + c.nombre) +
        ps.map(function (p) { return op(p.id, p.nombre || p.id); }).join('') + '</optgroup>';
    }).join('');
  }
  window.nuevaTarea = async function (ctx, opts) {
    ctx = ctx || {}; T.onSave = (opts || {}).onSave || null;
    try {
      var B = await base();
      llenarProyectos(ctx.projectId || (ctx.clientId ? 'cli:' + ctx.clientId : ''));
      var tono = function (p) { return /alta/i.test(p) ? 't-rd' : /media/i.test(p) ? 't-yl' : 't-mt'; };
      $('ftn-prio').innerHTML = B.prio.map(function (p) { return '<button type="button" class="ft-pill ' + tono(p) + (p === 'Media' ? ' on' : '') + '" data-v="' + esc(p) + '">' + ico('bandera') + ' ' + esc(p) + '</button>'; }).join('');
      $('ftn-who').innerHTML = B.users.map(function (u) { return '<button type="button" class="ft-pill' + (u.mail === yo() ? ' on' : '') + '" data-v="' + esc(u.mail) + '">' + ico('personas') + ' ' + esc(u.name) + '</button>'; }).join('');
      $('ftn-vence').value = isoMas(7);
      $('ftn-rap').hidden = !B.rapidas.length;
      $('ftn-rap').innerHTML = B.rapidas.map(function (x) { return '<button type="button" class="ft-pill" data-rap="' + esc(x) + '">' + esc(x) + '</button>'; }).join('');
      $('ftn-tit').value = ''; $('ftn-det').value = '';
      openM('m-ftn');
      setTimeout(function () { $('ftn-tit').focus(); }, 50);
    } catch (e) { toast('No se pudo abrir: ' + e.message, 'err'); }
  };
  async function guardarNueva() {
    if (!v('ftn-tit')) return toast('Falta «Qué hay que hacer».', 'err');
    var pv = v('ftn-proy'), pj = T.base.proyectos.find(function (p) { return p.id === pv; }), pr = elegido('ftn-prio');
    var b = $('ftn-ok'); b.disabled = true;
    await hacer('nueva_tarea', { p: { title: v('ftn-tit'), detail: v('ftn-det'),
      clientId: pv.indexOf('cli:') === 0 ? pv.slice(4) : (pj ? pj.empresa_id : ''), projectId: pv.indexOf('cli:') === 0 ? '' : pv,
      priority: pr, assignees: elegido('ftn-who'), due: v('ftn-vence') } }, function (r) { return 'Tarea creada · ' + r.id; }, 'm-ftn');
    b.disabled = false;
  }
})();

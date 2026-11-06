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
   Siguen: tablero por período con «Marcar facturado», reportes y accesos.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var S = { d: null, filtro: 'abiertos', emp: '', resp: '', busca: '', t: null };
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
      db().from('cot_config').select('clave,valor').like('clave', 'Soporte_%')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    S.d = { tk: r[0].data, emps: r[1].data, usu: r[2].data.filter(function (u) { return u.activo !== false; }), cons: r[3].data,
            cfg: r[4].data.reduce(function (o, c) { o[c.clave] = c.valor; return o; }, {}) };
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
    el.querySelector('#sop-cuerpo').innerHTML = htmlLista();
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
    if (S.d && !(op && op.forzar)) { pintar(el); var antes = JSON.stringify(S.d); cargar().then(function () { if (JSON.stringify(S.d) !== antes) pintar(el); }).catch(function () {}); }
    else { await cargar(); pintar(el); }
    el.onclick = function (ev) {
      var b = ev.target.closest('[data-sfil],[data-sver],#sop-nuevo'); if (!b) return;
      if (b.id === 'sop-nuevo') return abrirNuevo();
      if (b.hasAttribute('data-sver')) return verTicket(b.getAttribute('data-sver'));
      S.filtro = b.getAttribute('data-sfil'); pintar(el);
    };
    el.onchange = function (ev) {
      if (ev.target.id === 'sop-emp') { S.emp = ev.target.value; pintar(el); }
      if (ev.target.id === 'sop-resp') { S.resp = ev.target.value; pintar(el); }
    };
    el.querySelector('#sop-q').oninput = function () { S.busca = this.value.toLowerCase().trim(); pintar(el); };
  };
  VISTAS.soporte.precargar = cargar;
})();

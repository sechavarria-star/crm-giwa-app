/* ══════════════════════════════════════════════════════════════════════
   vistas/fun.js · Herramientas › Funcionalidades (20/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Sólo Sebas y Victoria (la base lo impone con crm_giwa.es_revisor_fun()).
   Por cada desarrollo se tilda lo que tiene, con el catálogo del Cotizador
   de su tipo. Secciones plegables; la pregunta (sin horas) no se tilda: se
   tildan sus respuestas, y una respuesta tildada abre las suyas.
   Guarda en fun_marcas al cambiar. La plata (hora efectiva y valor a
   Córdoba, Buenos Aires y Upwork) la calcula fun_resumen() en SQL.
   Las horas por sección son sólo para mostrar: suman lo tildado.
   ══════════════════════════════════════════════════════════════════════ */
var FUN = (function () {
  var F = { lista: null, filtro: 'cli', resp: '', sel: '', cat: {}, marcas: {}, res: null, abiertas: {}, agregar: false };
  var YO = { s: 's.echavarria@giwa-ia.com', v: 'v.gagey@giwa-ia.com' };
  var h1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  function $(id) { return document.getElementById(id); }

  // ── datos ──
  async function cargarLista() {
    var r = await db().from('v_fun_proyectos').select('*').order('orden');
    if (r.error) throw new Error(r.error.message);
    F.lista = r.data || [];
  }
  async function cargarProyecto(id) {
    var p = F.lista.find(function (x) { return x.desarrollo_id === id; });
    var pedidos = [db().from('fun_marcas').select('*').eq('desarrollo_id', id), db().rpc('fun_resumen', { p: id })];
    if (!F.cat[p.tipo_id]) pedidos.push(db().from('catalogo_modulos').select('id,nombre,horas_base,padre,grupo,bloque_comercial,orden,es_por_instancia')
      .eq('tipo_desarrollo_id', p.tipo_id).eq('activo', true).order('orden'));
    var r = await Promise.all(pedidos);
    r.forEach(function (x) { if (x.error) throw new Error(x.error.message); });
    F.marcas = {};
    (r[0].data || []).forEach(function (m) { F.marcas[m.modulo_id || ('a' + m.id)] = m; });
    F.res = r[1].data;
    if (r[2]) F.cat[p.tipo_id] = arbol(r[2].data || []);
  }
  async function refrescarResumen() {
    var r = await db().rpc('fun_resumen', { p: F.sel });
    if (r.error) return toast('No pude recalcular: ' + r.error.message, 'err');
    F.res = r.data;
    var p = actual(); p.tildadas = Object.keys(F.marcas).filter(function (k) { return F.marcas[k].tiene; }).length;
    pintarResumen(); pintarLista();
  }

  // El catálogo como árbol: raíces por sección (grupo de la raíz), hijos por «padre»
  function arbol(filas) {
    var por = {}, hijos = {}, secs = [], idx = {};
    filas.forEach(function (c) { por[c.id] = c; hijos[c.id] = []; });
    filas.forEach(function (c) {
      if (c.padre && por[c.padre]) return hijos[c.padre].push(c);
      var s = c.grupo || c.bloque_comercial || 'Otros';
      if (idx[s] === undefined) { idx[s] = secs.length; secs.push({ t: s, raices: [] }); }
      secs[idx[s]].raices.push(c);
    });
    return { secs: secs, hijos: hijos, por: por };
  }
  function esPregunta(c, T) { return !(Number(c.horas_base) > 0) && T.hijos[c.id].length > 0; }
  function marca(id) { return F.marcas[id] || {}; }
  function horasDe(c, m) { return (m.horas != null ? Number(m.horas) : Number(c.horas_base || 0)) * (c.es_por_instancia ? (m.cantidad || 1) : 1); }
  function sumar(lista, T) {
    var t = 0;
    lista.forEach(function (c) {
      var m = marca(c.id);
      if (esPregunta(c, T)) { t += sumar(T.hijos[c.id], T); return; }
      if (m.tiene) t += horasDe(c, m) + sumar(T.hijos[c.id], T);
    });
    return t;
  }
  function actual() { return F.lista.find(function (x) { return x.desarrollo_id === F.sel; }); }
  function visibles() {
    return F.lista.filter(function (p) {
      if ((F.filtro === 'int') !== !!p.interno) return false;
      return F.filtro === 'int' || !F.resp || p.responsable === F.resp;
    });
  }

  // ── dibujo ──
  function chip(v, t, attr, on) { return '<button class="chip fil' + (on ? ' on' : '') + '" ' + attr + '="' + v + '">' + t + '</button>'; }
  function quien(mail) { return mail === YO.s ? 'Sebas' : mail === YO.v ? 'Victoria' : 'Sin asignar'; }
  function pintarLista() {
    var v = visibles();
    $('fu-lista').innerHTML = v.map(function (p) {
      return '<div class="fu-p' + (p.desarrollo_id === F.sel ? ' on' : '') + '" data-fu-p="' + esc(p.desarrollo_id) + '"><span>' + esc(p.nombre) + '</span>' +
        '<span class="ui-num ui-nota-t">' + (p.tildadas ? p.tildadas : '—') + '</span><span class="ui-nota-t">' + quien(p.responsable) + '</span></div>';
    }).join('') || '<div class="ui-nota-t">No hay proyectos con este filtro.</div>';
    $('fu-sel').innerHTML = v.map(function (p) { return '<option value="' + esc(p.desarrollo_id) + '"' + (p.desarrollo_id === F.sel ? ' selected' : '') + '>' + esc(p.nombre) + ' · ' + quien(p.responsable) + '</option>'; }).join('');
  }
  function fila(c, T, n2) {
    var m = marca(c.id), hc = Number(c.horas_base || 0), cambio = m.horas != null && Number(m.horas) !== hc;
    var h = '<div class="fu-f' + (n2 ? ' n2' : '') + (m.tiene ? '' : ' off') + '"><label><input type="checkbox" data-fu-k="' + esc(c.id) + '"' + (m.tiene ? ' checked' : '') + '><span>' + esc(c.nombre) + '</span></label>' +
      '<div class="fu-h">' + (c.es_por_instancia ? '<input class="ui-num m-input" data-fu-q="' + esc(c.id) + '" value="' + (m.cantidad || 1) + '" aria-label="Cantidad"><span class="ui-nota-t">×</span>' : '') +
      '<input class="ui-num m-input' + (cambio ? ' cambio' : '') + '" data-fu-h="' + esc(c.id) + '" value="' + h1.format(m.horas != null ? Number(m.horas) : hc) + '" aria-label="Horas"><span class="ui-nota-t">h' + (cambio ? ' · <span class="ui-num">' + h1.format(hc) + '</span>' : '') + '</span></div>' +
      origen(c.id, m) + '<input class="fu-nota" data-fu-n="' + esc(c.id) + '" value="' + esc(m.nota || '') + '" placeholder="Nota" aria-label="Nota"></div>';
    if (m.tiene) T.hijos[c.id].forEach(function (x) { h += nodo(x, T, true); });
    return h;
  }
  function origen(k, m) {
    return '<select data-fu-o="' + esc(k) + '" aria-label="Origen"><option value="">Origen</option>' +
      [['propuesta', 'En la propuesta'], ['despues', 'Agregado después'], ['nose', 'No sé']].map(function (o) {
        return '<option value="' + o[0] + '"' + (m.origen === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
  }
  function nodo(c, T, n2) {
    if (esPregunta(c, T)) return '<div class="fu-q">' + esc(c.nombre) + '</div>' + T.hijos[c.id].map(function (x) { return nodo(x, T, n2); }).join('');
    return fila(c, T, n2);
  }
  function filaAgregada(k, m) {
    return '<div class="fu-f' + (m.tiene ? '' : ' off') + '"><label><input type="checkbox" data-fu-k="' + k + '"' + (m.tiene ? ' checked' : '') + '><span>' + esc(m.nombre) + '</span></label>' +
      '<div class="fu-h"><input class="ui-num m-input" data-fu-h="' + k + '" value="' + h1.format(Number(m.horas || 0)) + '" aria-label="Horas"><span class="ui-nota-t">h</span></div>' +
      origen(k, m) + '<input class="fu-nota" data-fu-n="' + k + '" value="' + esc(m.nota || '') + '" placeholder="Nota" aria-label="Nota"></div>';
  }
  function pintarSecciones() {
    var p = actual(), T = F.cat[p.tipo_id], html = '';
    T.secs.forEach(function (s) {
      var h = sumar(s.raices, T), abierta = F.abiertas[F.sel + '|' + s.t];
      html += '<details class="desp" data-fu-s="' + esc(s.t) + '"' + (abierta ? ' open' : '') + '><summary>' + esc(s.t) +
        '<span class="ui-num">' + (h ? h1.format(h) + ' h' : '—') + '</span></summary><div>' + s.raices.map(function (c) { return nodo(c, T); }).join('') + '</div></details>';
    });
    var ag = Object.keys(F.marcas).filter(function (k) { return k.charAt(0) === 'a'; });
    if (ag.length || F.agregar) {
      var ha = ag.reduce(function (t, k) { var m = F.marcas[k]; return t + (m.tiene ? Number(m.horas || 0) * (m.cantidad || 1) : 0); }, 0);
      html += '<details class="desp" open><summary>Agregadas a mano<span class="ui-num">' + (ha ? h1.format(ha) + ' h' : '—') + '</span></summary><div>' +
        ag.map(function (k) { return filaAgregada(k, F.marcas[k]); }).join('') +
        (F.agregar ? '<div class="fu-nueva"><input class="ui-campo" id="fu-nn" placeholder="Qué funcionalidad" aria-label="Nombre de la funcionalidad">' +
          '<input class="ui-campo ui-num m-input" id="fu-nh" placeholder="Horas" aria-label="Horas"><button class="ui-btn ui-p" data-fu-a="ok">Agregar</button><button class="ui-btn" data-fu-a="no">Cancelar</button></div>' : '') +
        '</div></details>';
    }
    $('fu-secs').innerHTML = html;
    if (F.agregar && $('fu-nn')) $('fu-nn').focus();
  }
  function pintarResumen() {
    var r = F.res || {}, refs = r.referencias || [], vend = r.vendido;
    $('fu-res').innerHTML = '<div class="ui-flt-t">Resumen</div>' +
      '<div class="fu-frase">Tiene <span class="ui-num">' + h1.format(Number(r.horas || 0)) + '</span> h. ' +
      (vend ? 'Se vendió en <span class="ui-num ui-p-contratado">' + fmt(vend) + '</span>' + (r.hora_efectiva ? ', o sea <span class="ui-num">' + fmt(r.hora_efectiva) + '</span> la hora.' : '.') : 'Todavía no tiene precio.') + '</div>' +
      '<div class="ui-flt-t">Cuánto valdrían esas horas</div><div>' + refs.map(function (x) {
        var d = x.diferencia;
        return '<div class="ui-kv"><span>' + esc(x.fuente) + '<span class="ui-sub-t">' + esc(x.detalle) + ' · <span class="ui-num">' + fmt(x.hora) + '</span>/h</span></span>' +
          '<span class="ui-num">' + fmt(x.valor) + (d != null && Number(r.horas) > 0 ? '<small class="' + (d < 0 ? 'ui-p-error' : 'ui-p-cobrado') + '">' + (d < 0 ? 'falta ' : 'sobra ') + fmt(Math.abs(d)) + '</small>' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="ui-nota-t">' + (r.aprobado ? 'Valores a la fecha de aprobación (<span class="ui-num">' + ff(r.fecha) + '</span>)' : 'Sin aprobar: valores de hoy') +
      ': Córdoba y Buenos Aires por IPC; Upwork con el TC <span class="ui-num">' + h1.format(Number(r.tc || 0)) + '</span>.</div>';
  }
  function pintarCabecera() {
    var p = actual();
    $('fu-cab').innerHTML = '<div><h2 class="fu-tit">' + esc(p.nombre) + '</h2><div class="page-s">' + esc(p.titulo) + ' · ' + esc(p.tipo_id) + ' · ' + quien(p.responsable) +
      (p.fecha_aprobado ? ' · aprobado <span class="ui-num">' + ff(p.fecha_aprobado) + '</span>' : ' · sin aprobar') + '</div></div>' +
      '<button class="ui-btn ui-p" data-fu-a="nueva">+ Agregar funcionalidad</button>';
  }
  function pintarTodo() { pintarLista(); pintarCabecera(); pintarSecciones(); pintarResumen(); }

  async function elegir(id) {
    F.sel = id; F.agregar = false;
    $('fu-secs').innerHTML = '<div class="loading"><div class="spin"></div> Cargando…</div>';
    pintarLista();
    try { await cargarProyecto(id); } catch (e) { $('fu-secs').innerHTML = '<div class="ui-p-error">' + esc(e.message || e) + '</div>'; return; }
    if (F.sel === id) pintarTodo();
  }

  // ── guardar ──
  function num(s) { var v = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isNaN(v) ? null : v; }
  async function guardar(k, cambios) {
    var m = F.marcas[k], r;
    if (m && m.id) r = await db().from('fun_marcas').update(Object.assign({ actualizado: new Date().toISOString() }, cambios)).eq('id', m.id).select().single();
    else r = await db().from('fun_marcas').insert(Object.assign({ desarrollo_id: F.sel, modulo_id: k }, cambios)).select().single();
    if (r.error) { toast('No pude guardar: ' + r.error.message, 'err'); await elegir(F.sel); return false; }
    F.marcas[k] = r.data;
    return true;
  }
  // Al destildar una opción se destildan las suyas
  function descendientes(id, T) { var out = []; (T.hijos[id] || []).forEach(function (c) { out.push(c.id); out = out.concat(descendientes(c.id, T)); }); return out; }
  async function tildar(k, si) {
    if (!(await guardar(k, { tiene: si }))) return;
    if (!si && k.charAt(0) !== 'a') {
      var ids = descendientes(k, F.cat[actual().tipo_id]).filter(function (x) { return F.marcas[x] && F.marcas[x].tiene; }).map(function (x) { return F.marcas[x].id; });
      if (ids.length) {
        var r = await db().from('fun_marcas').update({ tiene: false, actualizado: new Date().toISOString() }).in('id', ids);
        if (r.error) toast('No pude destildar lo de abajo: ' + r.error.message, 'err');
        else Object.keys(F.marcas).forEach(function (x) { if (ids.indexOf(F.marcas[x].id) >= 0) F.marcas[x].tiene = false; });
      }
    }
    pintarSecciones(); refrescarResumen();
  }
  async function agregarNueva() {
    var n = ($('fu-nn').value || '').trim(), h = num($('fu-nh').value);
    if (!n) return toast('Escribí qué funcionalidad es.', 'err');
    var r = await db().from('fun_marcas').insert({ desarrollo_id: F.sel, nombre: n, tiene: true, horas: h || 0 }).select().single();
    if (r.error) return toast('No pude agregarla: ' + r.error.message, 'err');
    F.marcas['a' + r.data.id] = r.data; F.agregar = false;
    pintarSecciones(); refrescarResumen();
  }

  // ── eventos (sólo dentro de esta pantalla) ──
  function eventos(root) {
    root.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var b = ev.target.closest('[data-fu-f]'); if (b) { F.filtro = b.getAttribute('data-fu-f'); return reubicar(); }
      b = ev.target.closest('[data-fu-r]'); if (b) { F.resp = b.getAttribute('data-fu-r'); return reubicar(); }
      b = ev.target.closest('[data-fu-p]'); if (b) return elegir(b.getAttribute('data-fu-p'));
      b = ev.target.closest('[data-fu-a]');
      if (b) {
        var a = b.getAttribute('data-fu-a');
        if (a === 'nueva') { F.agregar = true; return pintarSecciones(); }
        if (a === 'no') { F.agregar = false; return pintarSecciones(); }
        if (a === 'ok') return agregarNueva();
      }
    });
    root.addEventListener('input', function (ev) { ev.stopPropagation(); });
    root.addEventListener('toggle', function (ev) { var d = ev.target; if (d.dataset && d.dataset.fuS) F.abiertas[F.sel + '|' + d.dataset.fuS] = d.open; }, true);
    root.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.target.id === 'fu-nn' || ev.target.id === 'fu-nh')) agregarNueva(); });
    root.addEventListener('change', async function (ev) {
      ev.stopPropagation();
      var t = ev.target, d = t.dataset;
      if (t.id === 'fu-sel') return elegir(t.value);
      if (d.fuK) return tildar(d.fuK, t.checked);
      if (d.fuH) {
        var v = num(t.value), c = F.cat[actual().tipo_id].por[d.fuH];
        var horas = c ? (v === null || v === Number(c.horas_base || 0) ? null : v) : (v || 0);
        if (await guardar(d.fuH, { horas: horas })) { pintarSecciones(); refrescarResumen(); }
        return;
      }
      if (d.fuQ) { if (await guardar(d.fuQ, { cantidad: Math.max(1, Math.round(num(t.value) || 1)) })) { pintarSecciones(); refrescarResumen(); } return; }
      if (d.fuO) return guardar(d.fuO, { origen: t.value || null });
      if (d.fuN) return guardar(d.fuN, { nota: t.value.trim() || null });
    });
  }
  // Al cambiar el filtro, queda elegido el primero visible si el actual ya no está
  function reubicar() {
    pintarFiltros();
    var v = visibles();
    if (!v.some(function (p) { return p.desarrollo_id === F.sel; })) { if (v.length) return elegir(v[0].desarrollo_id); }
    pintarLista();
  }
  function pintarFiltros() {
    $('fu-flt').innerHTML = '<div class="chips">' + chip('cli', 'Clientes', 'data-fu-f', F.filtro === 'cli') + chip('int', 'Internos', 'data-fu-f', F.filtro === 'int') + '</div>' +
      (F.filtro === 'cli' ? '<div class="chips">' + chip('', 'Todos', 'data-fu-r', !F.resp) + chip(YO.s, 'Sebas', 'data-fu-r', F.resp === YO.s) + chip(YO.v, 'Victoria', 'data-fu-r', F.resp === YO.v) + '</div>' : '');
  }

  async function pintar(el) {
    el.innerHTML = '<div class="fu-pag" id="fu-root">' +
      '<aside class="fu-lat"><div class="page-h"><div><h2>Funcionalidades</h2><div class="page-s">Lo que tiene cada proyecto, tildado sobre el catálogo</div></div></div>' +
      '<div id="fu-flt"></div><select class="ui-campo fu-sel" id="fu-sel" aria-label="Proyecto"></select><div class="fu-lista" id="fu-lista"></div></aside>' +
      '<div class="fu-main"><div class="fu-col"><div class="page-h" id="fu-cab"></div>' +
      '<div class="ui-nota-t">Tildá lo que el proyecto tiene. Las horas se pueden corregir; queda a la vista el valor del catálogo.</div>' +
      '<div id="fu-secs" class="fu-col"><div class="loading"><div class="spin"></div> Cargando…</div></div></div><div class="fu-res" id="fu-res"></div></div></div>';
    eventos($('fu-root'));
    try { await cargarLista(); } catch (e) { $('fu-secs').innerHTML = '<div class="ui-p-error">' + esc(e.message || e) + '</div>'; return; }
    if (!F.lista.length) { $('fu-secs').innerHTML = '<div class="ui-nota-t">Esta pantalla es sólo para Sebas y Victoria.</div>'; return; }
    pintarFiltros();
    var v = visibles();
    await elegir(F.sel && F.lista.some(function (p) { return p.desarrollo_id === F.sel; }) ? F.sel : (v[0] || F.lista[0]).desarrollo_id);
  }
  return { pintar: pintar };
})();

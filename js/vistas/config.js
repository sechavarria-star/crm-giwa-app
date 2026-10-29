/* ══════════════════════════════════════════════════════════════════════
   vistas/config.js · Configuración
   ──────────────────────────────────────────────────────────────────────
   Reemplaza Config_Index.html en lo que vive en la base:
     Listas                 CotConfig (guardar_config)
     Valor hora y márgenes  CotConfig (params_cotizacion / guardar_params_cotizacion)
     Tipos de gastos        contrataciones (guardar_contratacion / borrar_contratacion)
     Usuarios               usuarios (guardar_usuario: sólo Administración) · 29/10/2026
     Diagnóstico            v_diag_alertas (alertas mal armadas) y pruebas de Telegram · 29/10/2026

   Cada lista se guarda en la clave que realmente se usa: la primera de
   «claves» que tiene valores en CotConfig (si ninguna, la primera). La
   pantalla vieja escribía en el nombre del navegador y leía por alias.

   Telegram, Plantilla Doc, Mantenimiento de datos y Diagnósticos siguen en
   el CRM actual (secretos, Drive y herramientas de la planilla).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var LISTAS = [
    ['Condición Fiscal', ['RazonSocial_CondicionFiscal', 'RZ_CondicionFiscal', 'condicion_fiscal']],
    ['Rubros', ['Empresa_Rubro', 'rubros']],
    ['Áreas de contacto', ['Contacto_AreaTrabajo', 'areas_contacto']],
    ['Puestos', ['Contacto_Puesto', 'Contacto_puesto', 'puestos']],
    ['Usuarios GIWA', ['usuarios_giwa']],
    ['Estados de Proyecto', ['estados_proyecto']],
    ['Estados de Desarrollo', ['estados_desarrollo']],
    ['Estados de Tarea', ['Tarea_Estado', 'tareas_estados', 'estados_tarea']],
    ['Estados de Actividad', ['PHoras_EstadoActividad', 'Estado_actividad']],
    ['Provincias', ['Empresa_Provincia', 'provincias']],
    ['Localidades', ['Empresa_Localidad', 'localidades']],
    ['Frecuencia de Tarea', ['Tarea_Frecuencia', 'tareas_frecuencia', 'Frecuencia_Tarea']],
    ['Modelos de Proyecto (cuotas)', ['ModeloProyecto']],
    ['Formas de pago', ['Cobro_FormaPago', 'formas_pago']],
    ['Condiciones de pago', ['condiciones_pago']],
    ['Tipos de Tarea', ['Tarea_Tipo', 'tareas_tipo', 'tipos_tarea']],
    ['Tipos de Alerta', ['Tarea_AlertaTipo', 'Tareas_alertas_tipos', 'alertas_tipos', 'tipos_alerta']],
    ['Etapas (Diseño, Configuración, Pruebas, Producción)', ['Modulos_crono']],
    ['Categorías de Gasto', ['Gasto_Categoria', 'categorias_gasto']]
  ];
  var NUMS = [['tc_default', 'TC Default ARS/USD'], ['ganancia_default', 'Ganancia default %']];
  var CATS = ['Talento', 'Infraestructura', 'Consumo (IA)', 'Canales', 'Externo'];
  var UNIS = ['Hora', 'Mensual', 'Total', '1M tokens'];
  var SUBS = [['listas', 'Listas'], ['vh', 'Valor hora y márgenes'], ['gastos', 'Tipos de gastos'], ['usu', 'Usuarios'], ['telegram', 'Telegram'], ['diag', 'Diagnóstico'], ['otros', 'Más']];
  var C = { usu: [], admin: false, sub: 'listas', cfg: {}, desc: {}, clave: {}, vh: null, vhl: {}, cont: [], tc: 0, q: '', tab: 'clientes', num: {} };

  async function cargar() {
    var r = await Promise.all([
      db().from('cot_config').select('clave,valor,aclaracion'),
      db().rpc('params_cotizacion'),
      db().from('contrataciones').select('*').order('categoria').order('producto'),
      db().from('v_tipo_cambio_hoy').select('valor').maybeSingle(),
      db().from('usuarios').select('*').order('orden'),
      db().rpc('es_admin')
    ]);
    var err = r.find(function (x) { return x.error; }); if (err) throw new Error(err.error.message);
    C.cfg = {}; C.desc = {};
    r[0].data.forEach(function (x) { C.cfg[x.clave] = x.valor || ''; C.desc[x.clave] = x.aclaracion || ''; });
    LISTAS.forEach(function (li) {
      var k = li[1].find(function (c) { return String(C.cfg[c] || '').trim(); }) || li[1].find(function (c) { return c in C.cfg; }) || li[1][0];
      C.clave[li[0]] = k;
      _cfgLists[k] = String(C.cfg[k] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    });
    NUMS.forEach(function (n) { C.num[n[0]] = C.cfg[n[0]] || ''; });
    C.vh = r[1].data;
    ['dificultad', 'especialidad', 'mercado'].forEach(function (t) { C.vhl[t] = (C.vh[t] || []).map(function (x) { return { k: x.k, v: Number(x.v) }; }); });
    C.cont = r[2].data;
    C.usu = r[4].data; C.admin = !!r[5].data;
    C.tc = Number(r[3].data && r[3].data.valor) || Number(C.vh.tc) || _tcDefault();
  }

  // ── Listas ───────────────────────────────────────────────────
  // En pestañas por tema, una tarjeta por lista (como Valor hora y márgenes).
  // Lo que se agrega en una pestaña queda en _cfgLists: «Guardar» guarda todas.
  var TABS = [['clientes', 'Clientes', [0, 1, 2, 3, 9, 10]], ['proyectos', 'Proyectos', [5, 6, 8, 12, 17]],
              ['tareas', 'Tareas', [7, 11, 15, 16]], ['cobros', 'Cobros y gastos', [13, 14, 18]], ['equipo', 'Equipo', [4]]];
  function htmlListas() {
    var tab = TABS.find(function (t) { return t[0] === C.tab; }) || TABS[0];
    var h = '<div class="filtros" role="group" aria-label="Listas">' + TABS.map(function (t) {
      return '<button class="ptab' + (t === tab ? ' on' : '') + '" data-cfg="tab" data-t="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="gauto">';
    tab[2].forEach(function (i) {
      var li = LISTAS[i], k = C.clave[li[0]], d = C.desc[k];
      h += '<div class="card"><div class="card-t">' + esc(li[0]) + '</div>' + (d ? '<div class="hint">' + esc(d) + '</div>' : '') +
        '<div id="tags-' + esc(k) + '" class="tag-list"></div><div class="tag-add u-mt6"><input class="fc u-f1" data-cfgadd="' + i + '" placeholder="Nuevo valor..." aria-label="Nuevo valor de ' + esc(li[0]) + '">' +
        '<button class="btn bp sm" data-cfg="add" data-i="' + i + '">+</button></div></div>';
    });
    if (tab[0] === 'cobros') h += '<div class="card"><div class="card-t">Valores por defecto</div>' + NUMS.map(function (n) {
      return '<label class="fl u-mt6" for="cf-' + n[0] + '">' + n[1] + '</label><input class="fc" type="number" id="cf-' + n[0] + '" value="' + esc(C.num[n[0]]) + '">';
    }).join('') + '</div>';
    return h + '</div><div class="u-row8 u-mt10"><button class="btn bp" data-cfg="listas">' + ico('guardar') + ' Guardar</button>' +
      '<span class="hint">Los cambios afectan los selectores en todo el sistema.</span></div>';
  }
  function hsHint() {
    var ars = Number((document.getElementById('cf-hs-ars') || {}).value || C.cfg.valor_hora_soporte_ars) || 0;
    return ars > 0 && C.tc > 0 ? '≈ ' + fmt(Math.round(ars / C.tc * 100) / 100, 'USD') + ' al TC actual (' + fmt(C.tc) + ')' : '';
  }
  function agregar(i) {
    var inp = document.querySelector('[data-cfgadd="' + i + '"]'), v = inp && inp.value.trim(); if (!v) return;
    var k = C.clave[LISTAS[i][0]];
    if (_cfgLists[k].indexOf(v) < 0) _cfgLists[k].push(v);
    inp.value = ''; renderTags(k); inp.focus();
  }

  // ── Valor hora y márgenes ────────────────────────────────────
  var VH_T = { mercado: ['Valor hora de mercado ($)', 'En pesos, por dificultad. De acá arranca todo: sobre este número se calcula tu venta y tu costo. Vienen de los Honorarios Recomendados del CPCIPC (Córdoba), columna «Hora a Demanda».', 500],
               dificultad: ['Multiplicador por dificultad', 'Ajusta las horas. Las del catálogo ya son el caso típico, por eso el ajuste es suave.', 0.05],
               especialidad: ['Multiplicador por especialidad', 'Ajusta el valor hora, no las horas. La hora especializada en datos e IA se paga más que la de desarrollo general.', 0.05] };
  function htmlVh() {
    var p = C.vh, h = '<div class="gauto">';
    h += '<div class="card"><div class="card-t">Valor hora de soporte</div><div class="hint">Lo que se cobra cada hora de soporte.</div>' +
      '<label class="fl" for="cf-hs-ars">ARS por hora</label><input class="fc" type="number" id="cf-hs-ars" value="' + esc(C.cfg.valor_hora_soporte_ars || '') + '">' +
      '<label class="fl u-mt10" for="cf-hs-usd">USD por hora</label><input class="fc" type="number" id="cf-hs-usd" value="' + esc(C.cfg.valor_hora_soporte_usd || '') + '">' +
      '<div class="hint u-mt10" id="cf-hs-hint">' + hsHint() + '</div>' +
      '<button class="btn bg sm u-mt10" data-cfg="hs">' + ico('guardar') + ' Guardar valor de soporte</button></div>';
    h += '<div class="card"><div class="card-t">Márgenes</div><div class="hint">El valor de mercado sale del catálogo. Sobre ese se calcula el resto.</div>' +
      '<label class="fl">Margen de venta (% sobre el valor de mercado)</label><input class="fc" id="vh-mv" type="number" step="1" min="1" value="' + p.margen_venta + '">' +
      '<label class="fl u-mt10">Margen de horas (cuánto baja tu costo interno respecto de la venta, %)</label><input class="fc" id="vh-mh" type="number" step="1" min="1" max="99" value="' + p.margen_horas + '">' +
      '<label class="fl u-mt10">Horas por mes (con cuánta dedicación se calcula el plazo)</label><input class="fc" id="vh-hm" type="number" step="1" min="1" value="' + p.horas_mes + '">' +
      '<div id="vh-ej" class="hint u-mt10">' + vhEjemplo() + '</div></div>';
    ['mercado', 'dificultad', 'especialidad'].forEach(function (t) {
      h += '<div class="card"><div class="card-t">' + VH_T[t][0] + '</div><div class="hint">' + VH_T[t][1] + '</div><div id="vh-l-' + t + '">' + vhLista(t) + '</div>' +
        '<div class="tag-add u-mt6"><input class="fc u-f1" id="vh-k-' + t + '" placeholder="Nombre" aria-label="Nombre">' +
        '<input class="fc" id="vh-v-' + t + '" type="number" step="' + VH_T[t][2] + '" min="0" placeholder="' + (t === 'mercado' ? '66617' : '1') + '" aria-label="Valor" style="width:90px">' +
        '<button class="btn bp sm" data-cfg="vh-add" data-t="' + t + '">+</button></div></div>';
    });
    h += '</div><div class="u-row8 u-mt10"><button class="btn bp" data-cfg="vh">' + ico('guardar') + ' Guardar</button>' +
      '<span class="hint">Cambia lo que se cotiza de acá en adelante. Las cotizaciones ya hechas no se tocan.</span></div>';
    if (p.seed_fecha) {
      var viejo = C.tc && p.seed_tc && C.tc > p.seed_tc * 1.15;
      h += '<div class="hint u-mt10">Catálogo sembrado el <b>' + esc(p.seed_fecha) + '</b> con TC ' + fmt(p.seed_tc || 0) + '. Hoy el TC es ' + fmt(C.tc) + '.' +
        (viejo ? ' <b class="u-c-wa">El catálogo quedó viejo: conviene resembrar.</b>' : '') + '</div>';
    }
    return h;
  }
  function vhLista(t) {
    var arr = C.vhl[t], mer = t === 'mercado', mv = Number((document.getElementById('vh-mv') || {}).value || C.vh.margen_venta) / 100;
    if (!arr.length) return '<div class="hint">Sin valores. Agregá al menos uno.</div>';
    return arr.map(function (x, i) {
      return '<div class="u-row6 u-mb6"><span class="u-f1m u-s12">' + esc(x.k) + '</span>' +
        (mer ? '<span class="u-s10-mt">vende ' + fmt(x.v * (1 + mv)) + '</span>' : '') +
        '<input class="fc" type="number" step="' + VH_T[t][2] + '" min="0" value="' + x.v + '" data-vhset="' + t + '" data-i="' + i + '" aria-label="' + esc(x.k) + '" style="width:96px">' +
        '<button class="btn bg sm" data-cfg="vh-del" data-t="' + t + '" data-i="' + i + '" title="Quitar" aria-label="Quitar">×</button></div>';
    }).join('');
  }
  // Una hora concreta, para no tener que imaginarse el efecto (con la dificultad Media)
  function vhEjemplo() {
    var g = function (id, d) { var e = document.getElementById(id); return Number(e ? e.value : d) / 100; };
    var mv = g('vh-mv', C.vh.margen_venta), mh = g('vh-mh', C.vh.margen_horas), m = C.vhl.mercado;
    var merc = m.length ? m[Math.min(1, m.length - 1)].v : 66617, venta = Math.round(merc * (1 + mv));
    return '<b>Ejemplo</b> con una hora de mercado de ' + fmt(merc) + ': la vendés a <b>' + fmt(venta) + '</b> y tu costo interno es <b>' + fmt(Math.round(venta * (1 - mh))) + '</b>.';
  }
  function vhTexto(t) { return C.vhl[t].map(function (x) { return x.k + ':' + x.v; }).join(', '); }

  // ── Tipos de gastos ──────────────────────────────────────────
  function htmlGastos() {
    var q = norm(C.q), by = {}, ord = [];
    C.cont.filter(function (r) { return !q || norm([r.categoria, r.producto, r.nivel].join(' ')).indexOf(q) >= 0; }).forEach(function (r) {
      var c = r.categoria || 'General'; if (!by[c]) { by[c] = []; ord.push(c); } by[c].push(r);
    });
    var h = '<div class="u-row8 u-mb10"><div class="sw u-f1"><input class="fc" id="cf-q" placeholder="Buscar contratación..." value="' + esc(C.q) + '" aria-label="Buscar contratación"></div>' +
      '<button class="btn bp sm" data-cfg="cont" data-id="">' + ico('mas') + ' Nueva contratación</button></div>' +
      '<div class="hint u-mb10">Recursos y servicios contratados por categoría. Editá el monto en ARS o USD: el que no cargues se calcula solo al TC actual.</div>';
    if (!ord.length) return h + '<div class="empty">' + (C.cont.length ? 'Nada coincide con la búsqueda.' : 'Sin contrataciones. Agregá la primera.') + '</div>';
    return h + '<div class="gauto">' + ord.sort().map(function (c) {
      return '<div class="card u-p0"><div class="u-row8 u-p1214"><span class="sec u-f1">' + esc(c) + '</span><span class="u-s10-mt">' + by[c].length + ' ítem' + (by[c].length === 1 ? '' : 's') + '</span></div>' +
        by[c].map(function (r) {
          var usd = Number(r.costo_usd) || 0, ars = Number(r.costo_ars) || 0;
          return '<div class="rowb u-row8 u-p1214"><div class="u-f1m"><div class="u-fw6">' + esc(r.producto) + (r.nivel ? ' <span class="u-s10-mt">· ' + esc(r.nivel) + '</span>' : '') + '</div>' +
            '<div class="u-s10-mt">' + esc(r.unidad || 'Hora') + ' · ' + (ars ? fmt(Math.round(ars)) : '—') + (usd ? ' · ' + fmt(usd, 'USD') : '') + '</div></div>' +
            '<button class="btn bg xs btn-ico" data-cfg="cont" data-id="' + esc(r.id) + '" data-tip="Editar" aria-label="Editar">' + ico('editar') + '</button>' +
            '<button class="btn brd xs btn-ico" data-cfg="cont-del" data-id="' + esc(r.id) + '" data-tip="Eliminar" aria-label="Eliminar">' + ico('borrar') + '</button></div>';
        }).join('') + '</div>';
    }).join('') + '</div>';
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function opts(l, v) { return l.concat(v && l.indexOf(v) < 0 ? [v] : []).map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function abrirCont(id, alGuardar) {
    var r = C.cont.find(function (x) { return x.id === id; }) || {};
    var m = document.getElementById('m-cont');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-cont'; document.body.appendChild(m); }
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">' + (id ? 'Editar contratación' : 'Nueva contratación') + '</span>' +
      '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-cont">' + ico('cerrar') + '</button></div><div class="mb2">' +
      '<div class="g2"><div class="fg"><label class="fl">Categoría</label><select class="fc" id="ct-cat">' + opts(CATS, r.categoria || 'Talento') + '</select></div>' +
      '<div class="fg"><label class="fl">Unidad</label><select class="fc" id="ct-uni">' + opts(UNIS, r.unidad || 'Hora') + '</select></div></div>' +
      '<div class="fg"><label class="fl">Nombre <span class="req">*</span></label><input class="fc" id="ct-nom" value="' + esc(r.producto || '') + '"></div>' +
      '<div class="fg"><label class="fl">Nivel</label><input class="fc" id="ct-niv" placeholder="Senior, Mid, Junior..." value="' + esc(r.nivel || '') + '"></div>' +
      '<div class="g2"><div class="fg"><label class="fl">Costo USD</label><input class="fc" type="number" id="ct-usd" value="' + (Number(r.costo_usd) || 0) + '"></div>' +
      '<div class="fg"><label class="fl">Costo ARS <small class="u-c-mt">(auto)</small></label><input class="fc" type="number" id="ct-ars" value="' + (Number(r.costo_ars) || 0) + '"></div></div>' +
      '</div><div class="mf"><button class="btn bg" data-cerrar="m-cont">Cancelar</button><button class="btn bp" id="ct-ok">Guardar</button></div></div>';
    var v = function (i) { return document.getElementById(i).value; };
    document.getElementById('ct-usd').oninput = function () { var u = _nFront(v('ct-usd')); if (u > 0 && C.tc > 0) document.getElementById('ct-ars').value = Math.round(u * C.tc); };
    document.getElementById('ct-ars').oninput = function () { var a = _nFront(v('ct-ars')); if (a > 0 && C.tc > 0) document.getElementById('ct-usd').value = Math.round(a / C.tc * 100) / 100; };
    document.getElementById('ct-ok').onclick = async function () {
      if (!v('ct-nom').trim()) return toast('Nombre obligatorio', 'err');
      var res = await db().rpc('guardar_contratacion', { p: { id: id || null, categoria: v('ct-cat'), unidad: v('ct-uni'), producto: v('ct-nom'),
        nivel: v('ct-niv'), costo_usd: _nFront(v('ct-usd')) || 0, costo_ars: _nFront(v('ct-ars')) || 0 } });
      if (res.error) return toast(res.error.message, 'err');
      closeM('m-cont'); toast('Guardado', 'ok'); alGuardar();
    };
    openM('m-cont');
  }

  // ── Usuarios (guardar_usuario: sólo Administración) ─────────
  var ROLES = ['Administracion', 'Comercial', 'Desarrollo'];
  function htmlUsu() {
    var si = function (b) { return b ? ico('check') : '<span class="u-c-mt">—</span>'; };
    return '<div class="u-row8 u-mb10"><div class="hint u-f1">Quién usa el CRM. El chat de Telegram es el que recibe los avisos y el resumen diario.' +
        (C.admin ? '' : ' Sólo Administración puede cambiarlos.') + '</div>' +
        (C.admin ? '<button class="btn bp sm" data-cfg="usu" data-id="">' + ico('mas') + ' Nuevo usuario</button>' : '') + '</div>' +
      '<div class="card u-p0 u-ovx"><table class="tbl"><thead><tr><th>Nombre</th><th>Mail</th><th>Rol</th><th class="u-tc">Factura</th>' +
      '<th>Telegram</th><th class="u-tc">GIWA</th><th class="u-tc">Activo</th><th></th></tr></thead><tbody>' + C.usu.map(function (u) {
        return '<tr' + (u.activo ? '' : ' class="u-op6"') + '><td>' + esc(u.nombre || '') + '</td><td class="u-c-mt">' + esc(u.mail || '') + '</td><td>' + esc(u.rol || '—') + '</td>' +
          '<td class="u-tc">' + si(u.factura) + '</td><td class="m">' + (u.telegram ? esc(u.telegram) : '<span class="u-c-wa">sin chat</span>') + '</td>' +
          '<td class="u-tc">' + si(u.es_giwa) + '</td><td class="u-tc">' + si(u.activo) + '</td>' +
          '<td class="u-tr">' + (C.admin ? '<button class="btn bg xs btn-ico" data-cfg="usu" data-id="' + esc(u.id) + '" data-tip="Editar" aria-label="Editar">' + ico('editar') + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function abrirUsu(id, alGuardar) {
    var u = C.usu.find(function (x) { return x.id === id; }) || { es_giwa: true, activo: true };
    var m = document.getElementById('m-usu');
    if (!m) { m = document.createElement('div'); m.className = 'mo'; m.id = 'm-usu'; document.body.appendChild(m); }
    var chk = function (k, l) { return '<label class="u-row6 u-s12"><input type="checkbox" id="us-' + k + '"' + (u[k] ? ' checked' : '') + '> ' + l + '</label>'; };
    m.innerHTML = '<div class="md md-sm"><div class="mh"><span class="mt2">' + (id ? 'Editar usuario' : 'Nuevo usuario') + '</span>' +
      '<button class="btn bg sm btn-ico" data-tip="Cerrar" aria-label="Cerrar" data-cerrar="m-usu">' + ico('cerrar') + '</button></div><div class="mb2">' +
      '<div class="g2"><div class="fg"><label class="fl" for="us-nom">Nombre <span class="req">*</span></label><input class="fc" id="us-nom" value="' + esc(u.nombre || '') + '"></div>' +
      '<div class="fg"><label class="fl" for="us-rol">Rol</label><select class="fc" id="us-rol">' + opts(ROLES, u.rol || 'Comercial') + '</select></div></div>' +
      '<div class="fg"><label class="fl" for="us-mail">Mail <span class="req">*</span></label><input class="fc" id="us-mail" type="email" value="' + esc(u.mail || '') + '"></div>' +
      '<div class="g2"><div class="fg"><label class="fl" for="us-tg">Chat de Telegram</label><input class="fc" id="us-tg" placeholder="123456789" value="' + esc(u.telegram || '') + '"></div>' +
      '<div class="fg"><label class="fl" for="us-cal">Calendario</label><input class="fc" id="us-cal" placeholder="mail del calendario" value="' + esc(u.calendario || '') + '"></div></div>' +
      '<div class="u-row8 u-mt6">' + chk('factura', 'Factura') + chk('es_giwa', 'Es del equipo GIWA') + chk('activo', 'Activo') + '</div>' +
      '</div><div class="mf"><button class="btn bg" data-cerrar="m-usu">Cancelar</button><button class="btn bp" id="us-ok">Guardar</button></div></div>';
    var v = function (i) { return document.getElementById(i).value.trim(); }, c = function (i) { return document.getElementById(i).checked; };
    document.getElementById('us-ok').onclick = async function () {
      var r = await db().rpc('guardar_usuario', { p: { id: id || null, nombre: v('us-nom'), mail: v('us-mail'), rol: v('us-rol'), telegram: v('us-tg'),
        calendario: v('us-cal'), factura: c('us-factura'), es_giwa: c('us-es_giwa'), activo: c('us-activo') } });
      if (r.error) return toast(r.error.message, 'err');
      closeM('m-usu'); toast('Usuario guardado', 'ok'); alGuardar();
    };
    openM('m-usu');
  }

  // ── Diagnóstico: alertas mal armadas y pruebas de Telegram ───
  function htmlDiag() { return '<div id="dg-c"><div class="loading"><div class="spin"></div></div></div><div id="dg-rec"></div>'; }

  // ── Todos los recordatorios (v_diag_recordatorios), tipo planilla · 29/10/2026 ──
  // Administración y reuniones mensuales, abiertos y cerrados. Se ordena tocando el
  // encabezado; las repetidas (misma clave, más de una abierta) van en rojo.
  var REC = { L: [], q: '', ord: 'vencimiento', asc: true, cerr: false };
  var REC_COL = [['id', 'ID'], ['categoria', 'Categoría'], ['cliente', 'Cliente'], ['item', 'Desarrollo'], ['titulo', 'Título'], ['responsable', 'Responsable'],
                 ['estado', 'Estado'], ['vencimiento', 'Vence'], ['frecuencia', 'Frecuencia'], ['creado', 'Creado'], ['repetida_con', 'Repetida con']];
  async function recCargar() {
    var r = await db().from('v_diag_recordatorios').select('*');
    if (r.error) return set('dg-rec', '<div class="empty u-c-rd">' + esc(r.error.message) + '</div>');
    REC.L = r.data; recPintar();
  }
  function recPintar() {
    var c = document.getElementById('dg-rec'); if (!c) return;
    var q = REC.q.toLowerCase(), k = REC.ord;
    var L = REC.L.filter(function (x) { return (REC.cerr || x.abierta) && (!q || REC_COL.some(function (col) { return String(x[col[0]] || '').toLowerCase().indexOf(q) >= 0; })); })
      .sort(function (a, b) { var r = String(a[k] || '').localeCompare(String(b[k] || ''), 'es', { numeric: true }); return REC.asc ? r : -r; });
    var rep = REC.L.filter(function (x) { return x.repetida_con; }).length;
    var mono = { id: 1, item: 1, vencimiento: 1, creado: 1, repetida_con: 1 };
    var nom = function (m) { return String(m || '').split(',').map(function (x) { return x.trim().split('@')[0]; }).join(', '); };
    c.innerHTML = '<div class="card u-mt12"><div class="u-row8"><div class="card-t u-f1">Todos los recordatorios <span class="u-s11-mt m">' + L.length + '</span></div>' +
        '<label class="u-row6 u-s12"><input type="checkbox" id="rec-cerr"' + (REC.cerr ? ' checked' : '') + '> Ver cerrados</label>' +
        '<button class="btn ' + (rep ? 'bp' : 'bg') + ' sm" data-cfg="rec-sim"' + (rep ? '' : ' disabled') + '>' + ico('check') + ' Cerrar repetidas' + (rep ? ' (' + rep + ')' : '') + '</button></div>' +
      '<div class="hint">Recordatorios de Administración y reuniones mensuales. Repetida = misma categoría y desarrollo (o mismo cliente en reuniones) con más de una abierta: queda la que vence primero.</div>' +
      '<div class="sw u-mt10"><input class="fc" id="rec-q" placeholder="Buscar en la tabla…" value="' + esc(REC.q) + '" aria-label="Buscar"></div>' +
      '<div class="u-ovx u-mt10"><table class="tbl rec-tbl"><thead><tr>' + REC_COL.map(function (col) {
        return '<th class="rec-th" data-cfg="rec-ord" data-k="' + col[0] + '">' + col[1] + (REC.ord === col[0] ? ' ' + ico(REC.asc ? 'arriba' : 'abajo') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (L.length ? L.map(function (x) {
        return '<tr class="' + (x.repetida_con ? 'rec-rep' : x.abierta ? '' : 'u-op6') + '">' + REC_COL.map(function (col) {
          var v = x[col[0]];
          if (col[0] === 'creado') v = String(v || '').slice(0, 10);
          if (col[0] === 'vencimiento') v = v ? ff(v) : '';
          if (col[0] === 'responsable') v = nom(v);
          return '<td class="' + (mono[col[0]] ? 'm' : '') + '">' + esc(v == null ? '' : v) + '</td>'; }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + REC_COL.length + '" class="u-c-mt">Nada para mostrar.</td></tr>') + '</tbody></table></div></div>';
  }
  async function recCerrar() {
    var s = await db().rpc('cerrar_repetidas', { aplicar: false });
    if (s.error) return toast(s.error.message, 'err');
    if (!s.data.n) return toast('No hay repetidas abiertas.', 'inf');
    var txt = s.data.cerrar.map(function (x) { return x.id + ' (' + x.titulo + ') → queda ' + x.queda; }).join('\n');
    if (!(await ask('Se cierran ' + s.data.n + ' recordatorio(s) como Finalizada, con el comentario «Cerrada: repetida con …». No se borra nada.\n\n' + txt,
      '¿Cerrar las repetidas?', { ok: 'Cerrar' }))) return;
    var r = await db().rpc('cerrar_repetidas', { aplicar: true });
    if (r.error) return toast(r.error.message, 'err');
    toast(r.data.n + ' cerrada(s)', 'ok'); diagPintar(); recCargar();
  }
  async function diagPintar() {
    var c = document.getElementById('dg-c'); if (!c) return;
    var r = await db().from('v_diag_alertas').select('*');
    if (r.error) { c.innerHTML = '<div class="empty u-c-rd">' + esc(r.error.message) + '</div>'; return; }
    var L = r.data;
    c.innerHTML = '<div class="card u-mb12"><div class="u-row8"><div class="card-t u-f1">Alertas</div>' +
        '<button class="btn bg sm" data-cfg="dg-ref">' + ico('recargar') + ' Revisar de nuevo</button>' +
        '<button class="btn bp sm" data-cfg="dg-sinc">' + ico('repetir') + ' Crear recordatorios</button></div>' +
        '<div class="hint">Busca alertas duplicadas, abiertas de algo que ya no se factura, sin responsable, y desarrollos con algo para facturar que no tienen alerta. ' +
        '«Crear recordatorios» crea los que faltan (nunca duplica) y cierra los que ya no tienen nada para facturar.</div>' +
        (L.length ? '<div class="u-ovx u-mt10"><table class="tbl"><thead><tr><th>Problema</th><th>Alerta</th><th>Desarrollo</th><th>Detalle</th><th></th></tr></thead><tbody>' + L.map(function (x) {
          return '<tr><td class="' + (x.problema === 'Falta la alerta' ? 'u-c-wa' : 'u-c-rd') + '">' + esc(x.problema) + '</td><td>' + (x.id ? '<span class="m">' + esc(x.id) + '</span> · ' : '') + esc(x.titulo || '') + '</td>' +
            '<td class="m">' + esc(x.item || '—') + '</td><td class="u-s11-mt">' + esc(x.detalle || '') + '</td>' +
            '<td class="u-tr">' + (x.id ? '<button class="btn bg xs btn-ico" data-cfg="dg-ver" data-id="' + esc(x.id) + '" data-tip="Abrir la alerta" aria-label="Abrir la alerta">' + ico('abrir') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="u-c-ok u-mt10">' + ico('check') + ' No hay alertas con problemas.</div>') + '</div>' +
      '<div class="card"><div class="card-t">Telegram</div><div class="hint">Las pruebas te llegan sólo a vos, al chat cargado en Usuarios.</div>' +
        '<div class="u-row8 u-mt10"><button class="btn bg sm" data-cfg="tg-probar">' + ico('chat') + ' Mandarme un mensaje de prueba</button>' +
        '<button class="btn bg sm" data-cfg="tg-resumen">' + ico('campana') + ' Mandarme el resumen diario ahora</button></div></div>';
  }

  function htmlOtros() {
    return '<div class="card"><p>Estas herramientas siguen en el CRM actual: ' +
      '<b>Plantilla Doc</b> (la usa el documento de propuesta del Cotizador), <b>Mantenimiento de datos</b> y <b>Diagnósticos</b> (reparan la planilla).</p>' +
      '<a class="btn bg xs" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' + ico('abrir') + ' Abrir el CRM actual</a></div>';
  }

  // ── Telegram (telegram_estado · guardar_token_telegram · probar_telegram) ──
  // El token se guarda en la base y no vuelve nunca al navegador. El resumen
  // diario de las 8 lo manda la base (pg_cron), no el navegador.
  function htmlTelegram() { return '<div class="card" id="tg-c"><div class="loading"><div class="spin"></div></div></div>'; }
  async function tgPintar() {
    var c = document.getElementById('tg-c'); if (!c) return;
    var r = await db().rpc('telegram_estado');
    if (r.error) { c.innerHTML = '<div class="empty u-c-rd">' + esc(r.error.message) + '</div>'; return; }
    var e = r.data, bot = e.bot ? '<span class="u-c-ok">' + ico('check') + ' Conectado a ' + esc(e.bot) + '</span>'
      : e.bot_error ? '<span class="u-c-rd">El token no funciona: ' + esc(e.bot_error) + '</span>'
      : e.configurado ? '<span class="u-c-wa">Token guardado, verificando…</span>' : '<span class="u-c-wa">Falta el token del bot</span>';
    c.innerHTML =
      '<div class="fg"><span class="fl">Bot</span><div>' + bot + '</div></div>' +
      '<div class="fg"><label class="fl" for="tg-tk">' + (e.configurado ? 'Cambiar el token' : 'Token del bot') + '</label>' +
        '<div class="u-row6"><input class="fc u-f1" id="tg-tk" type="password" autocomplete="off" placeholder="123456789:AA…">' +
        '<button class="btn bp sm" data-cfg="tg-token">Guardar</button></div>' +
        '<div class="ft-info">Sólo Administración. Se guarda en la base y no se vuelve a mostrar.</div></div>' +
      '<div class="fg"><span class="fl">Quién recibe</span>' + (e.usuarios || []).map(function (u) {
        return '<div class="u-row6 u-mt4"><span class="u-f1">' + esc(u.name) + '</span>' +
          (u.conChat ? '<span class="u-c-ok u-s11">Con chat</span>' : '<span class="u-c-wa u-s11">Sin chat: cargá su Usuario_Telegram</span>') + '</div>';
      }).join('') + '</div>' +
      '<div class="fg"><span class="fl">Resumen diario (8:00)</span><div>' +
        (e.ultimo_resumen ? 'Último envío: <span class="m">' + esc(ff(new Date(e.ultimo_resumen))) + '</span>' : 'Todavía no se envió ninguno.') + '</div></div>' +
      ((e.errores || []).length ? '<div class="fg"><span class="fl">Errores recientes</span>' + e.errores.map(function (x) {
        return '<div class="u-s11 u-c-rd u-mt4">' + esc(x.tipo) + (x.destino ? ' · ' + esc(x.destino) : '') + ': ' + esc(x.msg) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="u-row6 u-mt10"><button class="btn bg sm" data-cfg="tg-probar">' + ico('chat') + ' Mandarme una prueba</button>' +
        '<button class="btn bg sm" data-cfg="tg-ref">' + ico('recargar') + ' Actualizar</button></div>';
  }

  // ── pintar ───────────────────────────────────────────────────
  // Las subpantallas están en el menú lateral (marcarSub lo mantiene al día)
  function pintar(el) {
    if (_montado !== 'config') return;            // se terminó de leer con otro módulo en pantalla
    marcarSub(C.sub);
    var cab = '<div class="page-h"><div><h2>' + SUBS.find(function (s) { return s[0] === C.sub; })[1] + '</h2>' +
      '<div class="page-s">Configuración: listas, valor hora, usuarios y diagnóstico.</div></div></div>';
    el.innerHTML = cab + ({ listas: htmlListas, vh: htmlVh, gastos: htmlGastos, usu: htmlUsu, telegram: htmlTelegram, diag: htmlDiag, otros: htmlOtros }[C.sub])();
    if (C.sub === 'telegram') tgPintar();
    if (C.sub === 'diag') { diagPintar(); recCargar(); }
    if (C.sub === 'listas') LISTAS.forEach(function (li) { renderTags(C.clave[li[0]]); });
  }

  VISTAS.config = async function (el, op) {
    var refrescar = async function () { await cargar(); pintar(el); };
    var s = subPedida(); if (SUBS.some(function (x) { return x[0] === s; })) C.sub = s;
    await abrirModulo(el, { id: 'config', texto: 'Cargando Configuración…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return !!C.vh; }, firma: function () { return JSON.stringify([C.cfg, C.vh, C.cont, C.usu]); }, pintar: function () { pintar(el); } });
    var guardar = async function (fn, args, msg) {
      var r = await db().rpc(fn, args);
      if (r.error) { toast(r.error.message, 'err'); return null; }
      toast(msg || (r.data && r.data.msg) || 'Guardado', 'ok'); await refrescar(); return r.data;
    };
    el.oninput = function (ev) {
      var t = ev.target;
      if (t.id && t.id.indexOf('cf-') === 0 && t.id.slice(3) in C.num) C.num[t.id.slice(3)] = t.value;
      if (t.id === 'cf-hs-ars') document.getElementById('cf-hs-hint').innerHTML = hsHint();
      if (t.id === 'vh-mv' || t.id === 'vh-mh') { document.getElementById('vh-ej').innerHTML = vhEjemplo(); document.getElementById('vh-l-mercado').innerHTML = vhLista('mercado'); }
      if (t.id === 'rec-q') { var p0 = t.selectionStart; REC.q = t.value; recPintar(); var nq = document.getElementById('rec-q'); nq.focus(); nq.setSelectionRange(p0, p0); return; }
      if (t.id === 'cf-q') { C.q = t.value; var pos = t.selectionStart; pintar(el); var q = document.getElementById('cf-q'); q.focus(); q.setSelectionRange(pos, pos); }
    };
    el.onchange = function (ev) {
      if (ev.target.id === 'rec-cerr') { REC.cerr = ev.target.checked; return recPintar(); }
      var t = ev.target, k = t.getAttribute && t.getAttribute('data-vhset'); if (!k) return;
      var n = Number(t.value), i = Number(t.getAttribute('data-i'));
      if (!(n > 0)) { toast('Tiene que ser un número mayor a cero', 'err'); t.value = C.vhl[k][i].v; return; }
      C.vhl[k][i].v = n;
      if (k === 'mercado') { document.getElementById('vh-l-mercado').innerHTML = vhLista('mercado'); document.getElementById('vh-ej').innerHTML = vhEjemplo(); }
    };
    el.onkeydown = function (ev) {
      if (ev.key !== 'Enter') return;
      var t = ev.target, i = t.getAttribute && t.getAttribute('data-cfgadd');
      if (i !== null && i !== undefined) { ev.preventDefault(); agregar(Number(i)); }
    };
    el.onclick = async function (ev) {
      var b = ev.target.closest('[data-cfg]'); if (!b) return;
      var a = b.getAttribute('data-cfg'), id = b.getAttribute('data-id'), t = b.getAttribute('data-t');
      if (a === 'add') return agregar(Number(b.getAttribute('data-i')));
      if (a === 'tab') { C.tab = t; return pintar(el); }
      if (a === 'listas') {
        var cambios = {};
        // sólo lo que cambió: no crear en CotConfig claves vacías que no existían
        LISTAS.forEach(function (li) { var k = C.clave[li[0]], v = (_cfgLists[k] || []).join(','); if (v !== String(C.cfg[k] || '')) cambios[k] = v; });
        NUMS.forEach(function (n) { var v = String(C.num[n[0]]).trim(); if (v !== String(C.cfg[n[0]] || '')) cambios[n[0]] = v; });
        if (!Object.keys(cambios).length) return toast('No hay cambios para guardar', 'inf');
        return guardar('guardar_config', { cambios: cambios }, 'Configuración guardada');
      }
      if (a === 'hs') {
        var ars = Number(document.getElementById('cf-hs-ars').value) || 0, usd = Number(document.getElementById('cf-hs-usd').value) || 0;
        if (!usd && ars && C.tc > 0) usd = Math.round(ars / C.tc * 100) / 100;
        return guardar('guardar_config', { cambios: { valor_hora_soporte_ars: ars ? String(ars) : '', valor_hora_soporte_usd: usd ? String(usd) : '' } }, 'Valores guardados');
      }
      if (a === 'vh-add') {
        var kk = document.getElementById('vh-k-' + t).value.trim(), vv = _nFront(document.getElementById('vh-v-' + t).value);
        if (!kk) return toast('Poné un nombre', 'err');
        if (!(vv > 0)) return toast('El valor tiene que ser mayor a cero', 'err');
        if (C.vhl[t].some(function (x) { return x.k.toLowerCase() === kk.toLowerCase(); })) return toast('Ya existe «' + kk + '»', 'err');
        C.vhl[t].push({ k: kk, v: vv });
        document.getElementById('vh-l-' + t).innerHTML = vhLista(t);
        document.getElementById('vh-k-' + t).value = ''; document.getElementById('vh-v-' + t).value = '';
        return;
      }
      if (a === 'vh-del') {
        if (C.vhl[t].length <= 1) return toast('Tiene que quedar al menos uno', 'err');
        C.vhl[t].splice(Number(b.getAttribute('data-i')), 1);
        document.getElementById('vh-l-' + t).innerHTML = vhLista(t);
        if (t === 'mercado') document.getElementById('vh-ej').innerHTML = vhEjemplo();
        return;
      }
      if (a === 'vh') {
        var g = function (i) { return Number(document.getElementById(i).value) || 0; };
        return guardar('guardar_params_cotizacion', { p: { margen_venta: g('vh-mv'), margen_horas: g('vh-mh'), horas_mes: g('vh-hm'),
          dificultad_txt: vhTexto('dificultad'), especialidad_txt: vhTexto('especialidad'), mercado_txt: vhTexto('mercado') } });
      }
      if (a === 'tg-ref') return tgPintar();
      if (a === 'tg-token') {
        var tk = document.getElementById('tg-tk').value.trim(); if (!tk) return toast('Pegá el token del bot', 'err');
        var rt = await db().rpc('guardar_token_telegram', { token: tk });
        if (rt.error) return toast(rt.error.message, 'err');
        toast(rt.data.msg, 'ok'); document.getElementById('tg-tk').value = '';
        return setTimeout(tgPintar, 3000);       // getMe va por pg_net: la respuesta tarda un momento
      }
      if (a === 'tg-probar') {
        var rp = await db().rpc('probar_telegram');
        if (rp.error) return toast(rp.error.message, 'err');
        toast(rp.data.msg, 'ok'); return setTimeout(tgPintar, 4000);
      }
      if (a === 'tg-resumen') {
        var rr = await db().rpc('telegram_resumen_mio');
        if (rr.error) return toast(rr.error.message, 'err');
        return toast(rr.data.msg, rr.data.ok ? 'ok' : 'err');
      }
      if (a === 'usu') return abrirUsu(id, refrescar);
      if (a === 'dg-ref') { recCargar(); return diagPintar(); }
      if (a === 'rec-ord') { var kk = b.getAttribute('data-k'); REC.asc = REC.ord === kk ? !REC.asc : true; REC.ord = kk; return recPintar(); }
      if (a === 'rec-sim') return recCerrar();
      if (a === 'dg-ver') return verTarea(id, { onSave: diagPintar });
      if (a === 'dg-sinc') {
        // crear sólo desde «Crear recordatorios» (no duplica: la base no deja dos abiertas); después cerrar lo que sobra
        var rc = await db().rpc('crear_recordatorios', { ventanas: {}, solo_item: null });
        if (rc.error) return toast(rc.error.message, 'err');
        var rs = await db().rpc('sincronizar_alertas_facturacion');
        if (rs.error) return toast(rs.error.message, 'err');
        toast('Listo: ' + rc.data.creadas + ' creada(s), ' + rs.data.cerradas + ' cerrada(s)', 'ok'); return diagPintar();
      }
      if (a === 'cont') return abrirCont(id, refrescar);
      if (a === 'cont-del') {
        if (!(await ask('¿Eliminar esta contratación?', '¿Borro la contratación?', { peligro: true }))) return;
        return guardar('borrar_contratacion', { cid: id }, 'Eliminado');
      }
    };
  };
  // Del menú lateral: otra subpantalla, sin releer
  VISTAS.config.irA = function (s) {
    if (!SUBS.some(function (x) { return x[0] === s; })) return;
    C.sub = s; pintar(document.getElementById('vista')); window.scrollTo(0, 0);
  };
  VISTAS.config.precargar = cargar;
})();

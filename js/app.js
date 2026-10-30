/* ══════════════════════════════════════════════════════════════════════
   app.js · la cáscara: barra, menú lateral, rutas y arranque
   ──────────────────────────────────────────────────────────────────────
   Una sola página. Cambiar de módulo cambia el #hash (#/pm, #/pm/proy) y
   dibuja la vista en #vista, sin recargar nada.

   Cada módulo se registra en MODULOS, con sus subpantallas en «subs» (van
   en el menú lateral, que se abre en acordeón y se colapsa a íconos).
   Mientras no esté hecho (listo:false), su vista dice que sigue en el CRM
   actual y ofrece abrirlo ahí.
   Para pasar un módulo: escribir js/vistas/<id>.js que defina
   VISTAS['<id>'] = async function(el) { … } y marcarlo listo:true. Si
   tiene subpantallas, VISTAS['<id>'].irA(sub) cambia de una a otra sin
   releer, y la vista llama marcarSub(sub) cada vez que pinta.

   Velocidad: abrirModulo() muestra lo último que se leyó y lo actualiza
   por detrás, y después de la primera pantalla se precargan los demás
   módulos (VISTAS['<id>'].precargar). Volver a un módulo no espera a la base.
   ══════════════════════════════════════════════════════════════════════ */
var MODULOS = [
  { id: 'hoy',      nombre: 'Hoy',            ico: 'casa',     listo: true  },
  { id: 'clientes', nombre: 'Clientes',       ico: 'personas', listo: true },   // Empresas y Contactos son pestañas adentro (29/10/2026)
  { id: 'pm',       nombre: 'Proyectos',      ico: 'tablero',  listo: true,
    subs: [['seg', 'Seguimiento'], ['proy', 'Proyectos'], ['nuevo', 'Nuevo proyecto']] },
  { id: 'soporte',  nombre: 'Soporte',        ico: 'chat',     listo: false, nuevo: true },
  { id: 'cot',      nombre: 'Cotizador',      ico: 'lista',    listo: false },
  { id: 'admin',    nombre: 'Administración', ico: 'plata',    listo: true,
    subs: [['fact', 'Facturación'], ['gastos', 'Gastos'], ['idx', 'IPC y TC'], ['imp', 'Impuestos'], ['tip', 'Tipos de desarrollo']] },
  { id: 'fin',      nombre: 'Estado financiero', ico: 'porcentaje', listo: true },
  { id: 'her',      nombre: 'Herramientas',   ico: 'lamparita', listo: true,
    subs: [['meta', 'Simulador Costos Meta']] },
  { id: 'config',   nombre: 'Configuración',  ico: 'ajustes',  listo: true,
    subs: [['listas', 'Listas'], ['vh', 'Valor hora y márgenes'], ['gastos', 'Tipos de gastos'], ['usu', 'Usuarios'], ['telegram', 'Telegram'], ['diag', 'Diagnóstico'], ['otros', 'Más']] }
];
var VISTAS = {};          // id → async function(el): la llenan js/vistas/*.js
var _recargarVista = null;
var _montado = '';        // el módulo que está dibujado en #vista

function _ruta() {
  var p = location.hash.replace(/^#\/?/, '').split('/');
  return { mod: p[0] || 'hoy', sub: p[1] || '' };
}
function _moduloActual() {
  var id = _ruta().mod;
  return MODULOS.find(function(m){ return m.id === id; }) || MODULOS[0];
}
// La subpantalla que pide el #hash (las vistas la leen al entrar)
function subPedida() { return _ruta().sub; }
// La vista avisa en qué subpantalla quedó: el #hash y el menú la siguen, sin recargar
function marcarSub(sub) {
  var r = _ruta();
  if ((sub || '') !== r.sub) history.replaceState(null, '', '#/' + r.mod + (sub ? '/' + sub : ''));
  pintarBarra();
}

// ── la barra y el menú lateral ──────────────────────────────────
function pintarBarra() {
  var act = _moduloActual(), sub = _ruta().sub;
  document.getElementById('nav-mods').innerHTML = MODULOS.map(function(m) {
    var on = m.id === act.id, subs = m.subs || [];
    var h = '<div class="lat-grupo"><a class="lat-mod ui-mi' + (on ? ' on' : '') + '" href="#/' + m.id + '"' + (on ? ' aria-current="page"' : '') + '>' +
      ico(m.ico, 'ui-ico') + '<span class="lat-txt">' + m.nombre + '</span>' +
      (subs.length ? '<span class="lat-chev">' + ico(on ? 'arriba' : 'abajo') + '</span>' : '') + '</a>';
    // abierto el del módulo actual; colapsado, todos salen flotando al pasar el mouse
    h += '<div class="lat-subs ui-sub' + (on ? ' abierto' : '') + '"><div class="lat-tit">' + m.nombre + '</div>' +
      subs.map(function(s, i) {
        var son = on && (sub ? s[0] === sub : i === 0);
        return '<a class="lat-sub ui-mi' + (son ? ' on' : '') + '" href="#/' + m.id + '/' + s[0] + '"' + (son ? ' aria-current="page"' : '') + '>' + s[1] + '</a>';
      }).join('') + '</div></div>';
    return h;
  }).join('');
  set('top-fecha', new Date().toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' }));
  set('user-lbl-top', CRM_USUARIO ? CRM_USUARIO.nombre : '');
}
function _latCerrado(v) {
  if (v !== undefined) { try { localStorage.setItem('lat_cerrado', v ? '1' : ''); } catch (e) {} }
  var c = false; try { c = localStorage.getItem('lat_cerrado') === '1'; } catch (e) {}
  document.body.classList.toggle('lat-cerrado', c);
  var b = document.getElementById('lat-tog');
  if (b) { b.setAttribute('aria-label', c ? 'Expandir el menú' : 'Colapsar el menú'); b.setAttribute('data-tip', c ? 'Expandir el menú' : 'Colapsar el menú'); }
  return c;
}
function alternarMenu() { _latCerrado(!document.body.classList.contains('lat-cerrado')); }

// ── las vistas ──────────────────────────────────────────────────
async function mostrarVista() {
  var m = _moduloActual(), r = _ruta();
  // mismo módulo, otra subpantalla: la cambia la vista, sin volver a leer
  if (m.id === _montado && m.listo && VISTAS[m.id] && VISTAS[m.id].irA) { pintarBarra(); VISTAS[m.id].irA(r.sub); return; }   // sin sub: cada vista decide (Administración vuelve al Dashboard)
  _montado = m.id;
  pintarBarra();
  document.title = 'GIWA · ' + m.nombre;
  var el = document.getElementById('vista');
  _recargarVista = null;
  if (m.listo && VISTAS[m.id]) {
    _recargarVista = function(){ return VISTAS[m.id](el, { forzar: true }); };
    try { await VISTAS[m.id](el); }
    catch (e) { el.innerHTML = '<div class="card">No pude cargar ' + esc(m.nombre) + ': ' + esc(e.message || e) + '</div>'; }
  } else {
    el.innerHTML = vistaPendiente(m);
  }
}
function vistaPendiente(m) {
  // nuevo:true = no existe en el CRM actual: no hay adónde mandarlo
  if (m.nuevo) return '<div class="card"><div class="sec">' + esc(m.nombre.toUpperCase()) + '</div>' +
    '<p>Módulo nuevo, todavía en preparación.</p></div>';
  return '<div class="card">' +
    '<div class="sec">' + esc(m.nombre.toUpperCase()) + '</div>' +
    '<p>Esta pantalla todavía funciona en el CRM actual. Pasa a esta app en la fase 3.</p>' +
    '<a class="btn bp sm" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' +
      ico('abrir') + ' Abrir el CRM actual</a>' +
  '</div>';
}
function recargar() { if (_recargarVista) _recargarVista(); }

// Abre un módulo. Con datos ya leídos los pinta en el acto y los relee por
// detrás: si cambió algo (firma distinta) y el módulo sigue en pantalla,
// repinta. Sin datos (o con «forzar», el botón de actualizar), espera.
//   o = { id, cargado(), cargar(), pintar(), firma(), texto, forzar }
async function abrirModulo(el, o) {
  if (o.cargado() && !o.forzar) {
    o.pintar();
    var antes = o.firma();
    o.cargar().then(function () { if (_montado === o.id && o.firma() !== antes) o.pintar(); })
      .catch(function (e) { toast('No pude actualizar: ' + (e.message || e), 'err'); });
    return;
  }
  el.innerHTML = '<div class="loading"><div class="spin"></div> ' + (o.texto || 'Cargando…') + '</div>';
  await o.cargar();
  if (_montado === o.id) o.pintar();
}
// Después de la primera pantalla, los otros módulos leen sus datos sin pintar
function _precargar() {
  MODULOS.forEach(function (m) {
    var v = VISTAS[m.id];
    if (m.listo && v && v.precargar && m.id !== _montado) v.precargar().catch(function () {});
  });
}

// ── el arranque ─────────────────────────────────────────────────
function pantallaAcceso(titulo, texto, conBoton) {
  document.getElementById('app').hidden = true;
  var a = document.getElementById('acceso');
  a.hidden = false;
  set('acceso-tit', titulo);
  set('acceso-msg', texto);
  document.getElementById('acceso-btn').hidden = !conBoton;
  document.getElementById('acceso-salir').hidden = conBoton;
}

async function arrancar() {
  var r;
  try { r = await sesionDelEquipo(); }
  catch (e) { r = { ok: false, motivo: 'error', detalle: e.message || String(e) }; }
  if (!r.ok) {
    if (r.motivo === 'sin-sesion' && CRM_ERROR_LOGIN)
      return pantallaAcceso('No pudiste entrar', CRM_ERROR_LOGIN, true);
    if (r.motivo === 'sin-sesion')
      return pantallaAcceso('CRM interno', 'Exclusivo para el equipo de GIWA. Entrá con tu cuenta @' + CRM_CONFIG.dominio + '.', true);
    if (r.motivo === 'fuera-del-equipo')
      return pantallaAcceso('Acceso restringido', 'La cuenta ' + r.detalle + ' no está habilitada en el CRM.', false);
    return pantallaAcceso('No pude conectarme', r.detalle || 'Probá de nuevo en un rato.', false);
  }
  document.getElementById('acceso').hidden = true;
  document.getElementById('app').hidden = false;
  _latCerrado();
  // Un enlace al #hash en el que ya estamos no dispara hashchange (ej.: Seguimiento
  // desde la ficha de un proyecto): esa subpantalla se pide directo a la vista
  document.getElementById('nav-mods').addEventListener('click', function (ev) {
    var a = ev.target.closest('a.lat-sub'), v = VISTAS[_montado];
    if (!a || a.getAttribute('href') !== location.hash || !v || !v.irA) return;
    ev.preventDefault(); v.irA(_ruta().sub);
  });
  window.addEventListener('hashchange', mostrarVista);
  await mostrarVista();
  setTimeout(_precargar, 600);
}
document.addEventListener('DOMContentLoaded', arrancar);

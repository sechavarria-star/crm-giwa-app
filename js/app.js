/* ══════════════════════════════════════════════════════════════════════
   app.js · la cáscara: barra, rutas y arranque
   ──────────────────────────────────────────────────────────────────────
   Una sola página. Cambiar de módulo cambia el #hash y dibuja la vista en
   #vista, sin recargar nada: por eso es instantáneo.

   Cada módulo se registra en MODULOS. Mientras no esté hecho (listo:false),
   su vista dice que sigue en el CRM actual y ofrece abrirlo ahí.
   Para pasar un módulo: escribir js/vistas/<id>.js que defina
   VISTAS['<id>'] = async function(el) { … } y marcarlo listo:true.
   ══════════════════════════════════════════════════════════════════════ */
var MODULOS = [
  { id: 'hoy',      nombre: 'Hoy',            ico: 'casa',     listo: true  },
  { id: 'clientes', nombre: 'Clientes',       ico: 'personas', listo: true  },
  { id: 'admin',    nombre: 'Administración', ico: 'plata',    listo: true  },
  { id: 'pm',       nombre: 'Proyectos',      ico: 'tablero',  listo: true  },
  { id: 'cot',      nombre: 'Cotizador',      ico: 'lista',    listo: false },
  { id: 'config',   nombre: 'Configuración',  ico: 'ajustes',  listo: false }
];
var VISTAS = {};          // id → async function(el): la llenan js/vistas/*.js
var _recargarVista = null;

function _moduloActual() {
  var id = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'hoy';
  return MODULOS.find(function(m){ return m.id === id; }) || MODULOS[0];
}

// ── la barra ────────────────────────────────────────────────────
function pintarBarra() {
  var act = _moduloActual();
  document.getElementById('nav-mods').innerHTML = MODULOS.map(function(m) {
    var on = m.id === act.id;
    return '<a class="nav-b' + (on ? ' on' : '') + '" href="#/' + m.id + '"' +
           (on ? ' aria-current="page"' : '') + '>' + ico(m.ico) + ' ' + m.nombre + '</a>';
  }).join('');
  set('top-fecha', new Date().toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' }));
  set('user-lbl-top', CRM_USUARIO ? CRM_USUARIO.nombre : '');
}

// ── las vistas ──────────────────────────────────────────────────
async function mostrarVista() {
  var m = _moduloActual();
  pintarBarra();
  document.title = 'GIWA · ' + m.nombre;
  var el = document.getElementById('vista');
  _recargarVista = null;
  if (m.listo && VISTAS[m.id]) {
    el.innerHTML = '<div class="u-s11-mt">Cargando…</div>';
    _recargarVista = function(){ return VISTAS[m.id](el); };
    try { await VISTAS[m.id](el); }
    catch (e) { el.innerHTML = '<div class="card">No pude cargar ' + esc(m.nombre) + ': ' + esc(e.message || e) + '</div>'; }
  } else {
    el.innerHTML = vistaPendiente(m);
  }
}
function vistaPendiente(m) {
  return '<div class="card">' +
    '<div class="sec">' + esc(m.nombre.toUpperCase()) + '</div>' +
    '<p>Esta pantalla todavía funciona en el CRM actual. Pasa a esta app en la fase 3.</p>' +
    '<a class="btn bp sm" href="' + CRM_CONFIG.crmViejo + '" target="_blank" rel="noopener">' +
      ico('abrir') + ' Abrir el CRM actual</a>' +
  '</div>';
}
function recargar() { if (_recargarVista) _recargarVista(); }

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
    if (r.motivo === 'sin-sesion')
      return pantallaAcceso('CRM interno', 'Exclusivo para el equipo de GIWA. Entrá con tu cuenta @' + CRM_CONFIG.dominio + '.', true);
    if (r.motivo === 'fuera-del-equipo')
      return pantallaAcceso('Acceso restringido', 'La cuenta ' + r.detalle + ' no está habilitada en el CRM.', false);
    return pantallaAcceso('No pude conectarme', r.detalle || 'Probá de nuevo en un rato.', false);
  }
  document.getElementById('acceso').hidden = true;
  document.getElementById('app').hidden = false;
  window.addEventListener('hashchange', mostrarVista);
  mostrarVista();
}
document.addEventListener('DOMContentLoaded', arrancar);

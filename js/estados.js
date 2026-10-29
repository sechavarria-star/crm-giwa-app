/* GENERADO por tools/sincronizar-desde-apps-script.py desde _Estados.html.
   No editar a mano mientras dure la transición: se pisa. */
/* ══════════════════════════════════════════════════════════════════════
   LOS ESTADOS · quién es qué, en un solo lugar
   ──────────────────────────────────────────────────────────────────────
   Salió de _Calculos.html el 28/09/2026, SIN cambiar una línea. La regla:

       _Estilos    cómo se VE          (CSS, fmt, ff)
       _Calculos   las CUENTAS         (plata, fechas, avances)
       _Estados    quién es QUÉ        (este archivo)
       _Sheet.gs   las COLUMNAS        (sólo servidor)

   Su espejo en el servidor es Estados.gs. Apps Script obliga a las dos
   copias: el servidor no puede leer un HTML. Si cambia una, cambia la otra.

   LAS DOS ESCALAS, que no se mezclan. Desde el 01/10/2026 los nombres NO
   están escritos acá: salen de las hojas Proyecto_Estados y
   Desarrollo_Estados del archivo de referencias, por getPMData.estados.

     DESARROLLO   Nuevo · Aprobado · En Curso · En Garantía · Finalizado · Rechazado
     PROYECTO     Prospecto · Negociación · Aprobado · Activo · Finalizado · Rechazado
     + Detenido, que NO es un estado: es una marca. Cuando lo hice canónico,
       9 de 20 proyectos pasaron de «no vendido» a «vendido» de golpe.

   «Vendido» no existe en el modelo: era el nombre viejo de Aprobado y vivía
   en un array escrito a mano en PM_Index. _canonProy() lo sigue aceptando
   porque está guardado en la planilla, pero se MUESTRA como Aprobado.

   Y una TERCERA, la de las tareas: sale de CotConfig (tareas_estados) y hoy
   son tres: Nueva · En progreso · Finalizada. Otro vocabulario, otras
   funciones (_canonTarea y compañía, que toleran los nombres viejos).
   ══════════════════════════════════════════════════════════════════════ */

function _normEst(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _canonSol(e) {
  var x = _normEst(e);
  if (!x) return 'nueva';
  if (x.indexOf('rechaz') >= 0 || x.indexOf('cancel') >= 0 || x.indexOf('perdid') >= 0) return 'rechazada';
  if (x.indexOf('finaliz') >= 0) return 'finalizada';
  // «Detenido» NO es un estado: es una columna aparte. Ver _estadoCanonico.
  if (x.indexOf('garant') >= 0) return 'garantia';
  if (['curso','ejecu','desarroll','implementac','mantenim','soporte','activo'].some(function(k){ return x.indexOf(k) >= 0; })) return 'curso';
  if (x.indexOf('aprob') >= 0 || x.indexOf('vendido') >= 0) return 'aprobada';
  return 'nueva';
}

// CONTRATADO: el cliente dijo que sí.
function esGanado(e)     { return ['aprobada','curso','garantia','finalizada'].indexOf(_canonSol(e)) >= 0; }

// FACTURABLE: se puede emitir factura. Aprobada NO: está vendido pero no arrancó.
function esFacturable(e) { return ['curso','garantia','finalizada'].indexOf(_canonSol(e)) >= 0; }

function _solAprobada(e) { return esGanado(e); }

/* ══════════════════════════════════════════════════════════════════════
   LAS DOS TABLAS · llegan del servidor en getPMData.estados
   ──────────────────────────────────────────────────────────────────────
   EST_SPEC.proyecto    una fila por estado de proyecto, ya ordenada por
                        PE_Prioridad, con ganado/facturable/editable
   EST_SPEC.desarrollo  una fila por estado de desarrollo, con
                        ganado/facturable/ejecutando y los permisos

   Hasta el 01/10/2026 este archivo tenía su PROPIA versión de la cascada
   (rank nueva/aprobada/curso, con finalizada→curso) y el servidor la suya.
   Daban distinto: la ficha mostraba Activo y la lista Vendido para el mismo
   proyecto. Ahora las dos leen la misma tabla y los predicados son los
   mismos seis, en el mismo orden.
   ══════════════════════════════════════════════════════════════════════ */
var EST_SPEC = { proyecto: [], desarrollo: [] };
var _ESTX = { proy:{}, des:{} };      // índice por canon
function initEstadosSpec(spec) {
  if (!spec) return;
  EST_SPEC = { proyecto: spec.proyecto || [], desarrollo: spec.desarrollo || [] };
  _ESTX = { proy:{}, des:{} };
  EST_SPEC.proyecto.forEach(function(r){ _ESTX.proy[r.canon] = r; });
  EST_SPEC.desarrollo.forEach(function(r){ _ESTX.des[r.canon] = r; });
}
// Los nombres tal como los escribió ella en la planilla
function estadosProyecto()   { return EST_SPEC.proyecto.map(function(r){ return r.estado; }); }
function estadosDesarrollo() { return EST_SPEC.desarrollo.map(function(r){ return r.estado; }); }
// Los que se pueden poner A MANO (PE_Editable): hoy Prospecto y Negociación
function estadosProyEditables() {
  return EST_SPEC.proyecto.filter(function(r){ return r.editable; }).map(function(r){ return r.estado; });
}

// Los SEIS estados de proyecto en clave canónica. Espejo de _canonProy()
// en Estados.gs. Acepta los nombres viejos guardados en la planilla:
// Vendido → aprobado, En ejecución → activo, Perdido → rechazado.
function _canonProy(estado) {
  var e = _normEst(estado);
  if (!e) return 'prospecto';
  if (e.indexOf('rechaz') >= 0 || e.indexOf('perdid') >= 0 || e.indexOf('cancel') >= 0) return 'rechazado';
  if (e.indexOf('finaliz') >= 0) return 'finalizado';
  if (e.indexOf('activo') >= 0 || e.indexOf('ejecu') >= 0 || e.indexOf('curso') >= 0) return 'activo';
  if (e.indexOf('aprob') >= 0 || e.indexOf('vendid') >= 0 || e.indexOf('ganad') >= 0) return 'aprobado';
  if (e.indexOf('negoc') >= 0 || e.indexOf('revis') >= 0) return 'negociacion';
  return 'prospecto';
}
var _NOMBRE_PROY_FB = { rechazado:'Rechazado', finalizado:'Finalizado', activo:'Activo',
                        aprobado:'Aprobado', negociacion:'Negociación', prospecto:'Prospecto' };
// El nombre con el que se MUESTRA. Acá se traduce Vendido → Aprobado.
function nombreProy(canon) {
  var r = _ESTX.proy[canon];
  return (r && r.estado) || _NOMBRE_PROY_FB[canon] || 'Prospecto';
}
function _ordenProyC() {
  var ks = EST_SPEC.proyecto.map(function(r){ return r.canon; });
  return ks.length ? ks : ['rechazado','activo','finalizado','aprobado','negociacion','prospecto'];
}

// ── LA CASCADA · misma regla que estadoProyectoDe() en Estados.gs ──────
//   1 Rechazado    todos Rechazado
//   2 Activo       al menos uno En Curso o En Garantía
//   3 Finalizado   todos Finalizado o Rechazado
//   4 Aprobado     al menos uno ganado y ninguno ejecutándose
//   5 Negociación  propuesta enviada
//   6 Prospecto    sin fecha de propuesta
// `enviada` sale de p.fecha_propuesta. Si no se sabe, Prospecto y
// Negociación no se deciden acá y manda lo guardado.
function calcularEstadoDesde(estadoActual, items, enviada) {
  var cur = _normEst(estadoActual);
  // Detenido guardado en la celda es dato viejo: hoy Detenido es un flag.
  if (cur.indexOf('detenid') >= 0) return estadoActual;
  var cans = (items || []).map(function(it){ return _canonSol(it && it.estado || ''); }).filter(Boolean);
  if (!cans.length) return estadoActual || 'Prospecto';

  var _g = function(c){ var r = _ESTX.des[c]; return r ? r.ganado     : esGanado(c); };
  var _x = function(c){ var r = _ESTX.des[c]; return r ? r.ejecutando : ['curso','garantia'].indexOf(c) >= 0; };
  var env = (enviada === undefined || enviada === null) ? null : !!enviada;

  var pred = {
    rechazado:   function(){ return cans.every(function(c){ return c === 'rechazada'; }); },
    activo:      function(){ return cans.some(_x); },
    finalizado:  function(){ return cans.every(function(c){ return c === 'finalizada' || c === 'rechazada'; }); },
    aprobado:    function(){ return cans.some(_g) && !cans.some(_x); },
    // Con algo ganado ya no se está negociando: la propuesta enviada no manda.
    negociacion: function(){ return env === true  && !cans.some(_g); },
    prospecto:   function(){ return env === false && !cans.some(_g); }
  };
  var orden = _ordenProyC();
  for (var i = 0; i < orden.length; i++) {
    var k = orden[i];
    if (pred[k] && pred[k]()) return nombreProy(k);
  }
  return estadoActual || 'Prospecto';
}

function _canonTarea(e) {
  var x = _normEst(e);
  if (!x) return 'nueva';
  if (/cancel|rechaz|descart|anulad/.test(x))                 return 'cancelada';
  if (/finaliz|complet|hech|entreg|list|cerrad|termin/.test(x))return 'finalizada';
  if (/detenid|pausad|frenad|espera|bloque/.test(x))                  return 'detenida';
  if (/curso|progres|haciend|ejecu|proces|activ/.test(x))      return 'curso';
  return 'nueva';
}

// CERRADA: no hay nada más que hacer con ella, se haya hecho o no.
function tareaCerrada(e) { return ['finalizada','cancelada'].indexOf(_canonTarea(e)) >= 0; }

// ABIERTA: sigue en la lista de pendientes. Detenida cuenta como abierta.
function tareaAbierta(e) { return !tareaCerrada(e); }

// HECHA: se completó de verdad. Una cancelada NO está hecha.
function tareaHecha(e)   { return _canonTarea(e) === 'finalizada'; }

/* ── Colores. Finalizada violeta, en curso turquesa, rojo sólo detenido ── */
/* ══════════════════════════════════════════════════════════════════════
   LA PALETA DE ESTADOS · una sola, para desarrollo y proyecto
   ──────────────────────────────────────────────────────────────────────
   Las dos escalas son paralelas, así que usan los mismos tonos y el riel
   se lee como una progresión:
       gris → amarillo → celeste → turquesa → violeta → verde
   Violeta es POST-VENTA: garantía, soporte, mantenimiento, abono. Es por
   ciclo de vida, no por etapa del riel.

   Lo que había antes, y estaba roto de dos maneras:
     · nueva y finalizada eran LAS DOS violeta — no se podía distinguir
       «sin aprobar» de «entregado»
     · finalizado salía violeta en el navegador y GRIS en el servidor:
       otra copia espejo desincronizada
   ══════════════════════════════════════════════════════════════════════ */
var _PALETA_EST = {          // paleta GIWA del 29/10/2026 (punto 9): fría, con brillo; un color por estado
  nueva:      { cls:'xn', color:'var(--e-nueva)'  },   // violeta del logo: lo que hay que vender
  negociacion:{ cls:'xw', color:'var(--e-negoc)'  },   // ámbar: todavía requiere gestión comercial
  aprobada:   { cls:'xb', color:'var(--e-aprob)'  },   // celeste: listo para empezar
  curso:      { cls:'xc', color:'var(--e-curso)'  },   // cian eléctrico: trabajo activo, el más visible
  garantia:   { cls:'xt', color:'var(--e-garan)'  },   // turquesa: posventa, familia de Finalizado
  finalizada: { cls:'xg', color:'var(--e-final)'  },   // verde apagado: terminado, sin protagonismo
  rechazada:  { cls:'xz', color:'var(--e-rech)'   }    // gris azulado: histórico, nunca rojo
};
var _COLOR_DETENIDO = { cls:'xd', color:'var(--e-deten)' };   // amarillo + pausa: hay que revisar qué pasa
function colorEstado(e) {
  return _PALETA_EST[_canonSol(e)] || _PALETA_EST.nueva;
}

// El del proyecto, que tiene Negociación y Prospecto además.
// Va por _canonProy: así Vendido y Aprobado no pueden pintarse distinto,
// que era lo que pasaba cuando eran dos ramas separadas del if.
// Misma paleta que el desarrollo: las dos escalas son paralelas.
var _COLOR_PROY = {
  prospecto:  _PALETA_EST.nueva,        // violeta
  negociacion:_PALETA_EST.negociacion,  // ámbar
  aprobado:   _PALETA_EST.aprobada,     // celeste
  activo:     _PALETA_EST.curso,        // cian
  finalizado: _PALETA_EST.finalizada,   // verde
  rechazado:  _PALETA_EST.rechazada     // gris azulado
};

function colorEstadoProy(e) { return _COLOR_PROY[_canonProy(e)] || _PALETA_EST.nueva; }

// Un desarrollo es de cobro MENSUAL según su modelo de pago, no según su nombre
// Espejo de _esMant() en Estados.gs. El navegador NO puede leer Modelos_Pago,
// así que la respuesta buena es la que ya resolvió el backend en
// it.es_mantenimiento; esto es sólo el respaldo cuando no viene.
function esMant(it) {
  if (!it) return false;
  if (it.es_mantenimiento !== undefined) return !!it.es_mantenimiento;
  var modelo = _normEst(it.modelo || it.modelo_pago), tipo = _normEst(it.tipo);
  if (modelo === 'fp-03') return true;
  if (/^fp-\d/.test(modelo)) return false;
  if (tipo === 'mm')  return true;
  if (tipo === 'sop') return false;
  if (/unic|1 pago|final|50|30/.test(modelo)) return false;
  return modelo.indexOf('mensual') >= 0 || tipo.indexOf('mantenim') >= 0;
}

// DETENIDO · la marca. La columna dice «Sí», queda en blanco, o puede decir
// «No». Espejo de _esDetenido() en Estados.gs. El backend ya la resuelve a
// booleano en p.detenido / it.detenido; esto es para cuando llega el texto.
function esDetenido(v) {
  if (typeof v === 'boolean') return v;
  return /^(s|x|1|true|si|sí)/i.test(String(v == null ? '' : v).trim());
}
function esProyDetenido(p) {
  if (p && esDetenido(p.detenido)) return true;
  // «Cancelado» y «Detenido» guardados como estado son datos viejos.
  var e = _normEst(p && (p.estado_proyecto || p.estado_prop));
  return e.indexOf('detenid') >= 0 || e.indexOf('cancel') >= 0;
}

function esProyFinalizado(p) { return _canonProy(p && p.estado_proyecto) === 'finalizado'; }

// ACTIVO acá significa GANADO Y VIVO: incluye Aprobado (vendido, todavía sin
// arrancar) y Activo (algo corriendo). Es lo que cuenta el recuadro
// «Activos» y lo que decide si la ficha es de sólo lectura.
// El sí/no sale de la columna esGanado de Proyecto_Estados.
// Para preguntar estrictamente «¿hay algo ejecutándose?» está
// esProyEnEjecucion(), que es el estado Activo de la tabla y nada más.
function esProyActivo(p) {
  if (esProyDetenido(p) || esProyFinalizado(p)) return false;
  var c = _canonProy(p && (p.estado_proyecto || p.estado_prop));
  var r = _ESTX.proy[c];
  return r ? !!r.ganado : ['aprobado','activo'].indexOf(c) >= 0;
}

// PIPELINE: todavía se está vendiendo.
function esProyPipeline(p) {
  if (esProyDetenido(p) || esProyFinalizado(p) || esProyActivo(p)) return false;
  return true;   // prospecto, en negociación, o sin estado cargado
}

// Un proyecto Activo ya se cargó: en PM se mira. Sólo los contactos cambian.
function mProyEditable(p) { return !(esProyActivo(p) || esProyFinalizado(p)); }

// El backend ya marcó cada ítem (es_mantenimiento). esMant() queda de respaldo
// para datos viejos que vengan sin la marca.
function _esMantIt(it) { return (it && it.es_mantenimiento !== undefined) ? !!it.es_mantenimiento : esMant(it); }

// Un desarrollo cuyo trabajo terminó: no se le mueven más las fechas.
function desCerrado(it) { return ['garantia','finalizada'].indexOf(_canonSol(it && it.estado)) >= 0; }

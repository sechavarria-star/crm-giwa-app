/* GENERADO por tools/sincronizar-desde-apps-script.py desde _Calculos.html.
   No editar a mano mientras dure la transición: se pisa. */
/* ══════════════════════════════════════════════════════════════════════
   LAS CUENTAS Y LAS REGLAS · un solo lugar
   ──────────────────────────────────────────────────────────────────────
   Las cuatro pantallas —Portal, PM, Cotizaciones y Admin— usan estas
   funciones y ninguna otra. Antes cada una sumaba por su cuenta y con
   criterios distintos, y por eso daban números diferentes.

   DÓNDE VIVE CADA COSA

     Los NÚMEROS y las LISTAS   →  CotConfig, en la planilla.
       qué estados hay, cuáles cuentan como contratado, cuáles son
       facturables, los multiplicadores de dificultad, las tarifas.
       Se corrigen ahí UNA vez y valen para todo el sistema.

     Las FUNCIONES que los aplican  →  dos archivos, porque Apps Script
       obliga: este (navegador) y Código.gs (servidor). El servidor no
       puede leer este archivo. Las dos copias tienen que leer de
       CotConfig, nunca tener la regla escrita adentro.

     Los TOTALES de plata  →  getProyectos() los calcula al leer la hoja,
       porque necesita cruzar desarrollos con cobros. Acá se les pone
       nombre (mTotal, mCobrado, mSaldo) y no se vuelven a sumar.

   SI UN NÚMERO ESTÁ MAL: primero mirá si la regla está en CotConfig. Si
   está, se corrige ahí. Si está escrita en el código, es un bug — hay que
   sacarla a CotConfig, no arreglarla en un solo lado.
   ══════════════════════════════════════════════════════════════════════ */

/* ── Formato ─────────────────────────────────────────────────────────── */
/* fmt() y ff() se fueron a _Estilos.html: un formato es PRESENTACIÓN, no un
   cálculo. Acá quedan _pd y _nFront, que son lo contrario: leen lo que una
   persona escribió y lo convierten en un dato. */
// Fecha en hora LOCAL. Parsear 'yyyy-MM-dd' con new Date() la corre un día.
function _pd(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// El punto es ambiguo: "3.000.000" son miles, "1.5" es una hora y media.
// Texto limpio. Mismo nombre que en el backend (_Core.gs) para no tener que
// escribir String(x||'').trim() en cada campo. Vino de Admin_Index el
// 07/10/2026, donde estaba suelto. 07/10/2026.
function _s(v) { return String(v == null ? '' : v).trim(); }

function _nFront(v) {
  if (!v && v !== 0) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v).replace(/[^0-9.,-]/g, '');
  if (s.indexOf(',') >= 0) { s = s.replace(/\./g,'').replace(',','.'); }
  else { var p = s.split('.'); if (!(p.length === 2 && p[1].length > 0 && p[1].length <= 2)) s = s.replace(/\./g,''); }
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ── EL TIPO DE CAMBIO · un solo número de respaldo ──────────────────────
   Había DOS hardcodeados en el mismo archivo: TC||1200 en la ficha del ítem
   y TC||1532 en el bloque del cotizador. 28% de diferencia entre dos caminos
   de la misma pantalla.
   El respaldo sale de CotConfig.tc_default, que es de donde lo toma el
   servidor (getTipoCambio). El 1200 del final es la última red: si no hay ni
   TC ni config, algo más grave está roto y al menos no se divide por cero. */
function _tcDefault() {
  return _nFront(typeof CFG !== 'undefined' && CFG && CFG.tc_default) || 1200;
}
function _tc() {
  return _nFront(typeof TC !== 'undefined' && TC) || _tcDefault();
}

/* ── LAS FECHAS · las cuatro cuentas que se reescribían en cada pantalla ──
   La auditoría del 27/09/2026 encontró la misma cuenta escrita a mano en
   47 lugares: 14 veces «días entre dos fechas» con /86400000, 16 veces
   «correr N días» con setDate, 8 veces «correr meses» con setMonth, y 10
   restas directas de fechas. Ninguna estaba acá.

   Todas parsean con _pd, así que aceptan Date, 'yyyy-MM-dd' y 'dd/mm/yyyy'
   sin correrse un día por la zona horaria — que es el bug que hacía que las
   fechas aparecieran invertidas.                                          */

// Hoy a medianoche. Comparar contra new Date() mete la hora y una fecha
// de hoy puede dar «vencida por unas horas».
function mHoy() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// Días transcurridos de `desde` a `hasta` (hasta = hoy si no se pasa).
// POSITIVO = `desde` quedó en el pasado. null si no hay fecha.
function mDias(desde, hasta) {
  var a = _pd(desde); if (!a) return null;
  var b = hasta === undefined ? mHoy() : _pd(hasta); if (!b) return null;
  return Math.round((b - a) / 86400000);
}
// ¿Ya pasó? Hoy NO está vencido.
function mVencida(f) {
  var d = mDias(f);
  return d !== null && d > 0;
}
// Cuántos días faltan. Negativo = ya pasó.
function mFaltan(f) {
  var d = mDias(f);
  return d === null ? null : -d;
}
// Correr una fecha. Devuelven Date nuevo: NO tocan el original, que era
// otro error repetido (setDate muta y el llamador seguía usando la vieja).
function mCorrerDias(f, n) {
  var d = _pd(f); if (!d) return null;
  var x = new Date(d.getTime()); x.setDate(x.getDate() + (+n || 0)); return x;
}
// Fecha a 'yyyy-MM-dd', que es lo que espera un <input type="date">
function mISO(f) {
  var d = _pd(f); if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ── Los estados ─────────────────────────────────────────────────────
   Un desarrollo tiene SIETE. El proyecto sale del más avanzado que tenga.
   Esta es la misma tabla que usa el backend: si cambia una, cambia la otra. */


/* ── LOS ESTADOS DE UNA TAREA ─────────────────────────────────────────
   Otro vocabulario, no el del desarrollo: acá no hay «aprobada» ni
   «garantía». Y faltaba: la auditoría del 27/09/2026 encontró CUATRO
   implementaciones de «¿esta tarea está cerrada?», cada una con otra lista
   de sinónimos:

     Portal · cerrada()               finaliz complet cancel rechaz entreg
     PM · _tarCerrada()               finaliz complet cancel
     PM · otros dos lugares           + hecho lista cerrad
     Tareas.gs                        finaliz complet cancel rechaz entreg
     Comercial · _tareaCerradaEstado  finaliz complet cerrad

   O sea que una tarea «Entregada» estaba CERRADA en el Portal y ABIERTA en
   PM, y una «Hecha» al revés. No era deuda: era un bug de conteo.

   Acá está la unión de todos los sinónimos, una sola vez.

   HECHA ≠ CANCELADA: las dos están cerradas, pero sólo una se hizo. Por eso
   son tres funciones y no una.                                             */


/* ── La plata · SE LEE, no se recalcula ──────────────────────────────
   Todas salen de getProyectos(), que es donde están las reglas de verdad:
   qué cuenta como contratado, qué mantenimiento está vivo, cómo se netean
   las notas de crédito. Acá sólo se le pone nombre al campo.               */
function mTotal(p)      { return _nFront(p && p.monto_final_ars); }      // contratado: sólo ganados
function mCobrado(p)    { return _nFront(p && p.monto_facturado); }      // TODA la caja, neto de NC
// Un nombre, dos usos: con UN proyecto devuelve su saldo; con la LISTA
// devuelve el total de los ganados. Así no hay dos nombres para lo mismo.
function mSaldo(p) {
  if (Array.isArray(p)) return _ganados(p).reduce(function(s,x){ return s + _nFront(x.saldo); }, 0);
  return _nFront(p && p.saldo);                                          // lo que falta cobrar
}
function mSaldoMant(p)  { return _nFront(p && p.saldo_mant); }
// BONIFICADO · la venta regalada. Entra al contratado —es valor que GIWA
// generó— y sale por acá, en negativo, en vez de quedar como saldo eterno:
//   Contratado 1.000.000 · Cobrado 0 · Bonificación −1.000.000 · Saldo 0
// Un nombre, dos usos, igual que mSaldo.
function mBonificado(p) {
  if (Array.isArray(p)) return _ganados(p).reduce(function(s,x){ return s + mBonificado(x); }, 0);
  return _nFront(p && p.bonificacion) + _nFront(p && p.bonificacion_mant);
}
function mRecurrente(p) { return _nFront(p && p.recurrente_mensual); }   // abonos vivos
// La caja PARTIDA, para no comparar peras con manzanas: mTotal es sólo
// desarrollos, así que al lado va cobrado_dev, no la caja entera. Lo que entró
// sin desarrollo asignado no se le regala a ninguno de los dos.
function mCobradoDev(p)  { return p && p.cobrado_dev  !== undefined ? _nFront(p.cobrado_dev)  : mCobrado(p); }
function mCobradoMant(p) { return _nFront(p && p.cobrado_mant); }
/* ── EN QUÉ ESTÁ EL PROYECTO ──────────────────────────────────────────
   Los recuadros de la vista Proyectos contaban con listas de palabras
   escritas a mano en PM ('no incluye cancel, ni prospec, ni negoc...') y
   por eso nunca coincidían entre sí ni con el dashboard. Se decide acá. */

/* ── LAS FECHAS DEL PROYECTO ──────────────────────────────────────────
   «Fin» son DOS cosas: la obra termina cuando el último desarrollo queda
   Finalizada; el mantenimiento, cuando se paga la última cuota.          */
function _devsDe(p)  { return ((p && p.items) || []).filter(function(it){ return !_esMantIt(it) && _canonSol(it.estado) !== 'rechazada'; }); }
function _mantsDe(p) { return ((p && p.items) || []).filter(_esMantIt); }

function mInicio(p) {
  var f = _pd(p && p.fecha_inicio);
  _devsDe(p).forEach(function(it){ var x = _pd(it.fecha_ini || it.fecha_est); if (x && (!f || x < f)) f = x; });
  return f;
}
// { fecha, faltan } — faltan = desarrollos sin fecha de fin cargada
function mFinObra(p) {
  var f = null, faltan = 0;
  _devsDe(p).forEach(function(it){
    var x = _pd(it.fecha_fin) || _pd(it.fecha_cierre);
    if (x) { if (!f || x > f) f = x; } else faltan++;
  });
  return { fecha:f, faltan:faltan };
}
// { fecha, cobradas, totales } — la última cuota del abono
function mFinMant(p) {
  var f = null, cf = 0, ct = 0;
  _mantsDe(p).forEach(function(it){
    var d = _nFront(it.duracion) || 12;
    ct += d; cf += _nFront(it.cuotas_facturadas);
    var ini = _pd(it.fecha_ini) || _pd(it.fecha_est) || _pd(it.fecha_aprob);
    if (ini) { var x = new Date(ini.getTime()); x.setMonth(x.getMonth() + d); if (!f || x > f) f = x; }
  });
  return { fecha:f, cobradas:cf, totales:ct };
}
// Cierre estimado = fin de obra. NO se inventa: si falta una fecha de fin,
// devuelve la que hay y dice cuántas faltan, para poder ir a cargarlas.
function mCierre(p) {
  var fo = mFinObra(p);
  return { fecha:fo.fecha, faltan:fo.faltan, firme:!!fo.fecha && !fo.faltan };
}
// Duración en meses, de inicio a cierre. Si no hay fechas, cae al campo cargado.
function mDuracionMeses(p) {
  var a = mInicio(p), b = mCierre(p).fecha;
  if (a && b && b >= a) {
    var m = (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth());
    if (b.getDate() > a.getDate()) m += 1;
    return Math.max(1, m);
  }
  return _nFront(p && p.duracion) || 0;
}
// El mantenimiento que cubre a ESTE desarrollo (columna MantDe)
function mantsDeDev(p, devId) {
  return _mantsDe(p).filter(function(m){
    var ids = (m.mant_de_ids && m.mant_de_ids.length) ? m.mant_de_ids
            : String(m.mant_de||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
    return ids.indexOf(devId) >= 0;
  });
}
// El costo sí se suma de los desarrollos: el backend no lo consolida.
function mCosto(p) {
  return ((p && p.items) || []).reduce(function(s, it){ return s + _nFront(it.costo_ars); }, 0);
}
/* ══════════════════════════════════════════════════════════════════════
   LAS SIETE MÉTRICAS DEL NEGOCIO · una definición, un nombre
   ──────────────────────────────────────────────────────────────────────
   Las de arriba son POR PROYECTO. Estas son los TOTALES, y son las que se
   muestran en el dashboard. Antes cada pantalla los sumaba por su cuenta y
   por eso no cerraban: COBRADO traía la caja entera y CONTRATADO sólo los
   desarrollos, así que cobrado podía dar más que contratado.

   LA REGLA QUE LOS HACE CERRAR:

       CONTRATADO  −  CAJA DESARROLLOS  =  SALDO

   Los tres miran el MISMO conjunto: los desarrollos de proyectos ganados.
   La caja de los abonos va aparte, y la caja TOTAL es todo lo que entró
   —incluido lo que no se le puede atribuir a ningún desarrollo—, que por
   definición es mayor o igual que la suma de las dos.

   Reciben la lista de proyectos de getProyectos(). Su espejo en el servidor
   está en Facturacion.gs con prefijo _.
   ══════════════════════════════════════════════════════════════════════ */
function _ganados(ps)  { return (ps || []).filter(function(p){ return p && p.es_ganado; }); }
/* CONTRATADO, en tres números que NO se pisan:

     DESARROLLOS   lo vendido de una vez. Cierra con su caja y su saldo.
     MANT. / MES   la cuota del mes de los abonos vivos. Es un ritmo, no un
                   total: sumarla al contratado sería mezclar unidades.
     TOTAL         la PROYECCIÓN: los desarrollos más las cuotas de abono que
                   TODAVÍA FALTAN cobrar. Es a cuánto llega el contrato si se
                   cumple entero, no lo que hay vendido hoy.                */

function mGanancia(p)  { return mTotal(p) - mCosto(p); }
function mMargenPct(p) {
  var t = mTotal(p);
  return t > 0 ? Math.round(mGanancia(p) / t * 100) : 0;
}

// ══════════════════════════════════════════════════════════════════════
// SUMAR · 02/10/2026
// ──────────────────────────────────────────────────────────────────────
// Había 41 reduce escritos a mano en las tres pantallas para hacer siempre
// lo mismo: sumar un campo de una lista. Y no todos iguales: unos hacían
// `a + (c.monto||0)`, otros `s + (+c.monto||0)`, otros `s + c.monto` pelado
// —que con una fila vacía da NaN y rompe el total entero—.
//
//     sum(cobros, 'monto')              un campo
//     sum(proys, mTotal)                una cuenta
//     sum(items, 'saldo', esFacturable) sólo los que cuentan
//
// _nFront ya sabe leer "1.234,56" y " $ 1.000 ": un número que viene de la
// planilla como texto suma igual, en vez de dar NaN.
// ── de Admin_Index el 07/10/2026 ─────────────────────────────────────
// Parsear una fecha del navegador sin que new Date() la corra un día, y contar
// cuántos días faltan (negativo = ya pasó). Estaban sueltas en Admin_Index y
// las usa _ResumenAdm.html, que lo incluyen Admin y el Portal: en el Portal
// tiraban «_diasHastaA is not defined».
function _pdA(v){if(!v)return null;if(v instanceof Date)return isNaN(v.getTime())?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());var s=String(v).trim();var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);var d=new Date(s);return isNaN(d.getTime())?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function _diasHastaA(v){var p=_pdA(v);if(!p)return null;var h=new Date();h=new Date(h.getFullYear(),h.getMonth(),h.getDate());return Math.round((p-h)/86400000);}

function sum(lista, campo, filtro) {
  if (!lista || !lista.length) return 0;
  var t = 0;
  for (var i = 0; i < lista.length; i++) {
    var x = lista[i];
    if (!x) continue;
    if (filtro && !filtro(x)) continue;
    t += _nFront(typeof campo === 'function' ? campo(x) : x[campo]);
  }
  return t;
}
// Contar con la misma forma, para no mezclar un length con un filter suelto.
function cuenta(lista, filtro) {
  if (!lista || !lista.length) return 0;
  if (!filtro) return lista.length;
  var n = 0;
  for (var i = 0; i < lista.length; i++) if (lista[i] && filtro(lista[i])) n++;
  return n;
}

// VALOR ESPERADO de un negocio: lo cotizado por su probabilidad. Estaba
// escrito a mano adentro de un reduce en el Portal; es la misma idea que
// mPipelinePonderado pero sobre la lista de negocios a seguir, no de
// proyectos. La regla vive acá una sola vez.
function mEsperado(o) {
  if (!o) return 0;
  if (o.esperado !== undefined && o.esperado !== null && o.esperado !== '') return _nFront(o.esperado);
  return Math.round(_nFront(o.monto) * (_nFront(o.prob) / 100));
}

/* GENERADO por tools/sincronizar-desde-apps-script.py desde _Estilos.html.
   No editar a mano mientras dure la transición: se pisa. */
/* ══════════════════════════════════════════════════════════════════════
   set · escribir en un elemento por id
   ──────────────────────────────────────────────────────────────────────
   Estaba DUPLICADA en cuatro pantallas —COT, Admin, PM y Config— con tres
   implementaciones distintas, y el Portal nunca recibió ninguna. Por eso el
   tab «Resumen Financiero» moría a media pintura: renderFinanciero llamaba
   set('fin-cuotas') y tiraba «set is not defined», sin aviso en pantalla
   porque showPortalTab no tiene try/catch. Cuotas y Mantenimientos no se
   pintaban nunca.

   Queda la versión más completa (la de PM/Admin/Config): un input recibe
   value, cualquier otro elemento recibe innerHTML. La de COT era este mismo
   caso sin la rama de los inputs, así que no pierde nada.
   ══════════════════════════════════════════════════════════════════════ */
function set(id, v) {
  var el = document.getElementById(id); if (!el) return;
  if (['INPUT','SELECT','TEXTAREA'].indexOf(el.tagName) >= 0) el.value = v;
  else el.innerHTML = v;
}

/* ══════════════════════════════════════════════════════════════════════
   LOS FORMATOS · cómo se ve un número y una fecha
   ──────────────────────────────────────────────────────────────────────
   Están acá y no en _Calculos porque un formato es PRESENTACIÓN: no cambia
   el dato, cambia cómo se lee. En _Calculos quedan _pd y _nFront, que hacen
   lo contrario —leer lo que escribió una persona y convertirlo en número—.

   DOS FORMATOS, PARA TODAS LAS PANTALLAS:

       plata    $ 392.500          nunca «$392k», nunca «392500»
       fecha    19/08/2026         nunca «19 de ago de 2026»

   Si hace falta cambiarlos, se cambian acá una vez.
   ══════════════════════════════════════════════════════════════════════ */

// Plata. Los decimales sólo aparecen si el número los tiene.
function fmt(v, m) {
  var n = Number(v || 0);
  var sym = (m === 'USD' || m === 'U$') ? 'USD' : '$';   // USD 1.250,50 (22/10/2026)
  return sym + ' ' + n.toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
// Fecha dd/mm/aaaa, siempre con dos dígitos. Antes devolvía «19 de ago de
// 2026», que ocupa el triple y no se puede ordenar de un vistazo.
// Parsea con _pd (_Calculos): acepta Date, 'yyyy-MM-dd' y 'dd/mm/yyyy' sin
// correrse un día por la zona horaria.
function ff(d) {
  var x = (typeof _pd === 'function') ? _pd(d) : null;
  if (!x) return '';
  return String(x.getDate()).padStart(2,'0') + '/' +
         String(x.getMonth()+1).padStart(2,'0') + '/' + x.getFullYear();
}
// Hoy en 'yyyy-MM-dd' LOCAL, para los <input type="date">. toISOString() da
// la fecha UTC: después de las 21 h ya es mañana. 15/10/2026.
function _hoyLocal() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ── DOS WIDGETS COMPARTIDOS ──────────────────────────────────────────
// Estaban en Admin_Index y los usan Admin y Configuración. Duplicarlos era
// garantizar que se desincronicen; acá los ve cualquier pantalla que
// incluya _Estilos, que son todas. 30/09/2026.
// ── EL VELO · velo(true/false) mientras una escritura viaja ──────────
// Lo pide cualquier pantalla que escriba. El <div> se crea la primera vez y
// queda; no hay que agregar markup a cada HTML.
function velo(on, texto) {
  var el = document.getElementById('velo');
  if (!el) {
    el = document.createElement('div'); el.id = 'velo'; el.className = 'velo';
    el.innerHTML = '<div class="velo-c"><div class="spin" style="width:26px;height:26px;margin:0;border-width:3px"></div><div class="velo-t" id="velo-t">Guardando…</div></div>';
    document.body.appendChild(el);
  }
  var t = document.getElementById('velo-t'); if (t) t.textContent = texto || 'Guardando…';
  el.classList[on ? 'add' : 'remove']('on');
}

// _cfgLists y removeTag van ACÁ, al lado de renderTags: renderTags genera el
// onclick="removeTag(...)" de cada tag y las dos leen el mismo _cfgLists. Estaban
// sueltas en Admin_Index, así que en Configuración —que usa renderTags para las
// diecinueve listas de CotConfig— la × de cada valor tiraba «removeTag is not
// defined» y no se podía quitar nada de una lista. 05/10/2026.
var _cfgLists={};
function removeTag(k,i){if(!_cfgLists[k])return;_cfgLists[k].splice(i,1);renderTags(k);}

function renderTags(k){var el=document.getElementById('tags-'+k);if(!el)return;var arr=_cfgLists[k]||[];el.innerHTML=arr.map(function(v,i){return'<span class="tag-item">'+esc(v)+'<button onclick="removeTag(\''+k+'\','+i+')" title="Quitar">×</button></span>';}).join('')+(arr.length?'':'<span style="font-size:10px;color:var(--mt);padding:4px">Sin valores</span>');}

// pSelArr · llenar un <select> con un array. Vino de Admin_Index el 05/10/2026.
// Estaba sólo ahí, y acá al lado vive initSelectsAdmin, que la llama nueve
// veces: Configuración incluía _Estilos, llamaba a initSelects() al guardar y
// se moría con «pSelArr is not defined» —sin aviso en pantalla, porque el
// .then() no tiene catch. PM tiene su propia copia (idéntica salvo que no
// tolera un array nulo); se deja hasta migrarla, que es otro cambio.
function pSelArr(id,arr,blank){var s=document.getElementById(id);if(!s)return;s.innerHTML=(blank?'<option value="">'+blank+'</option>':'')+(arr||[]).map(function(o){return'<option>'+esc(o)+'</option>';}).join('');}

// initSelectsAdmin · 05/10/2026 · se llamaba initSelects y PM tenía OTRA con el
// mismo nombre. No eran dos versiones: ésta llena los selects de Admin y de
// Configuración (cob-*) y la de PM los de PM (pp-*, ep-*, tar-*).
// PM incluye _Estilos y define la suya DESPUÉS, así que la pisaba. Ver el
// comentario largo en PM_Index · initSelectsPM.
function initSelectsAdmin(){
  // Cobros · estaban escritos en el HTML. El de comprobante ni siquiera
  // ofrecía Nota de Crédito, que sí se usa en los datos. Los defaults son
  // los mismos que siembra sembrarConfigCobros().
  pSelArr('cob-tipo-comp',CFG.tipos_comprobante||['Factura A','Factura B','Factura C','Nota de Crédito A','Nota de Crédito B','Nota de Crédito C','Nota de Débito A','Nota de Débito B','Nota de Débito C','Sin factura']);
  pSelArr('cob-forma',CFG.formas_pago||['Transferencia','Efectivo']);
  setVal('cob-tipo-comp','Factura C');
  // Los selects de empresa y contacto (emp-*, con-*) se fueron con la ficha a
  // _FichaEmpresa el 08/10/2026: ella misma pide sus desplegables.
}

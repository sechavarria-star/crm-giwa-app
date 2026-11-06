/**
 * Cartero de Soporte GIWA (06/11/2026). El mismo esquema que el de KO Fumigaciones.
 *
 * Vive en la cuenta que manda los mails de soporte y lo único que hace es mandar
 * mails desde ella. No sabe nada de clientes ni tiene acceso a la base: cada minuto
 * le pide a Supabase (Edge Function soporte-cartero) los mails que están en la cola
 * de crm_giwa, ya armados, los manda y avisa cómo le fue.
 *
 * Existe porque un Apps Script manda desde la cuenta que lo corre: así los mails
 * salen de una cuenta real de GIWA y no del servicio de mails de Supabase.
 *
 * Corre solo, con un activador de cada 1 minuto (instalarActivador). No hace falta
 * publicarlo como app web: el cartero llama a Supabase, nunca al revés.
 *
 * Script Properties:
 *   CLAVE_CARTERO  la genera alguien del equipo en el CRM (Soporte › Accesos al portal ›
 *                  Mails › «Generar clave»; se ve una sola vez).
 *   REMITENTE      opcional. Si los mails tienen que salir de otra dirección que la de la
 *                  cuenta (p. ej. soporte@giwa-ia.com como alias de esta cuenta), ponela acá.
 *                  Tiene que estar agregada en Gmail › Configuración › Cuentas › «Enviar como».
 */

var FUNCION_URL = 'https://ofhiogczijhzkuqdjwvz.supabase.co/functions/v1/soporte-cartero';

// Mails por pasada: con el activador de cada minuto alcanza, y una pasada corta
// nunca choca con el límite de 6 minutos de Apps Script.
var MAILS_POR_PASADA = 25;

/** Lo llama el activador cada 1 minuto. */
function revisarCola() {
  // Si una pasada no terminó, la siguiente no arranca: dos a la vez mandarían el mismo mail dos veces.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var cuota = MailApp.getRemainingDailyQuota();
    var pedido = llamar_({ accion: 'tomar', cuenta: Session.getEffectiveUser().getEmail(), cuota: cuota, max: Math.min(MAILS_POR_PASADA, cuota) });
    var mails = pedido.mails || [];
    if (!mails.length) return;
    // Uno por uno: si falla uno, los demás salen igual y cada resultado se informa por separado.
    var resultados = mails.map(function (m) {
      try {
        var op = { htmlBody: m.html, name: m.nombre || 'Soporte GIWA' };
        if (m.responder_a) op.replyTo = m.responder_a;
        var remitente = PropertiesService.getScriptProperties().getProperty('REMITENTE');
        if (remitente) {
          // Desde un alias («Enviar como»): sólo GmailApp deja elegir el remitente
          op.from = remitente;
          GmailApp.sendEmail(m.para, m.asunto, m.texto || 'Abrí este mail en un lector que muestre HTML.', op);
        } else {
          op.to = m.para; op.subject = m.asunto; op.body = m.texto || 'Abrí este mail en un lector que muestre HTML.';
          MailApp.sendEmail(op);
        }
        return { id: m.id, ok: true };
      } catch (err) {
        return { id: m.id, ok: false, error: err.message || String(err) };
      }
    });
    llamar_({ accion: 'resultado', resultados: resultados });
  } finally {
    lock.releaseLock();
  }
}

function llamar_(params) {
  var clave = PropertiesService.getScriptProperties().getProperty('CLAVE_CARTERO');
  if (!clave) throw new Error('Falta la Script Property CLAVE_CARTERO');
  var res = UrlFetchApp.fetch(FUNCION_URL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(Object.assign({ clave: clave }, params)), muteHttpExceptions: true
  });
  var cuerpo = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 400) throw new Error('Supabase ' + res.getResponseCode() + ': ' + (cuerpo.error || res.getContentText()));
  return cuerpo;
}

/**
 * Correr UNA VEZ a mano desde el editor (Ejecutar › instalarActivador). Pide los permisos
 * (tildar «Enviar correo electrónico en tu nombre»), crea el activador de cada 1 minuto y
 * hace una primera pasada. Si se corre de nuevo no duplica el activador.
 */
function instalarActivador() {
  var rem = PropertiesService.getScriptProperties().getProperty('REMITENTE');
  if (rem && GmailApp.getAliases().indexOf(rem) < 0 && rem !== Session.getEffectiveUser().getEmail())
    throw new Error('Esta cuenta no puede mandar como ' + rem + ': agregalo en Gmail › Configuración › Cuentas › «Enviar como» (o borrá la propiedad REMITENTE).');
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'revisarCola') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('revisarCola').timeBased().everyMinutes(1).create();
  revisarCola();
  console.log('Listo: el cartero revisa la cola cada 1 minuto, mandando desde ' + (rem || Session.getEffectiveUser().getEmail()) +
    ' (cuota de hoy: ' + MailApp.getRemainingDailyQuota() + ').');
}

/** Para apagar el cartero: borra el activador. Los mails quedan en la cola hasta que vuelva. */
function desinstalarActivador() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'revisarCola') ScriptApp.deleteTrigger(t); });
  console.log('Cartero apagado: ya no revisa la cola.');
}

/* ══════════════════════════════════════════════════════════════════════
   simulador.js · Simulador Costos Meta (05/11/2026)
   ──────────────────────────────────────────────────────────────────────
   Un solo simulador para dos lugares: Herramientas en el CRM (vistas/her.js)
   y la página pública simulador.html. No lee ni guarda datos: el TC se lo
   pasa quien lo usa. En la página pública no va la pestaña de MRR.
   ══════════════════════════════════════════════════════════════════════ */
var SIM = (function () {
  var PUBLICO = false;
  var TABS = [['calc', 'Escalabilidad y calculadora de impacto'], ['vivo', 'Probalo en vivo'], ['mrr', 'Análisis de MRR y conveniencia IA'], ['tg', 'Comparativa con Telegram']];
  var MSJ_CONS = 3, META_USD = 0.026, UTIL_USD = 0.026, FRANQ = 1000, SEM = 4.33, ESCALA = [2, 5, 10, 20, 40, 80, 120];

  // Sectores: escenarios rápidos y mix de contactos (% del total, plantillas y servicio que manda el agente por contacto)
  var SECT = {
    odontologia: { nombre: 'Odontología', chat: 'Consultorio odontológico {IA}', aviso: '<b>Consultorios:</b> un paciente de primera vez valida datos, cobertura y credencial (11 a 15 mensajes). Un control con turno ya dado casi no usa mensajes de servicio.', sub: 'Turnos de 30 min y 1 h', lead: 'Pacientes por día', unidad: 'paciente',
      presets: [['Único profesional, turno 1 h (6 × 3 días)', 6, 3], ['Único profesional, turno 30 min (12 × 3 días)', 12, 3], ['Pool 5, turno 1 h (40 × 5 días)', 40, 5], ['Pool 5, turno 30 min (80 × 5 días)', 80, 5]],
      mix: [['1ª vez particular', 17, 1, 11], ['1ª vez obra social', 17, 1, 15], ['Control con turno ya dado', 53, 1, 0], ['Control con reprogramación', 13, 1, 4]] },
    talleres: { nombre: 'Talleres', chat: 'Taller {IA}', aviso: '<b>Talleres:</b> una consulta de información usa 6 mensajes. Si termina en turno, 8 de servicio y 2 plantillas.', sub: 'Consultas de información y turnos', lead: 'Consultas por día', unidad: 'consulta',
      presets: [['Taller chico (10 × 6 días)', 10, 6], ['Taller mediano (25 × 6 días)', 25, 6], ['Red de talleres (60 × 6 días)', 60, 6]],
      mix: [['Consulta de información', 70, 0, 6], ['Consulta que termina en turno', 30, 2, 8]] },
    hoteles: { nombre: 'Hoteles', chat: 'Hotel {IA}', aviso: '<b>Hoteles:</b> una consulta de disponibilidad usa 8 mensajes. Una reserva confirmada, 10 de servicio y 2 plantillas.', sub: 'Consultas y reservas', lead: 'Consultas por día', unidad: 'consulta',
      presets: [['Hotel boutique (15 × 7 días)', 15, 7], ['Hotel mediano (40 × 7 días)', 40, 7], ['Cadena (100 × 7 días)', 100, 7]],
      mix: [['Consulta de disponibilidad', 60, 0, 8], ['Reserva confirmada', 40, 2, 10]] },
    manufactura: { nombre: 'Manufactura', sub: 'Órdenes de trabajo y reclamos', lead: 'Órdenes por día', unidad: 'orden', chat: 'PCP Fábrica y talleres {IA}',
      aviso: '<b>Talleres de confección y producción:</b> un reclamo con muestra física requiere validación técnica (unos 16 mensajes). Un pedido estándar o una consulta de orden es ágil (unos 5).',
      presets: [['Unas 180 órdenes por mes (8 × 5 días)', 8, 5]],
      mix: [['Reclamo con muestra física', 35, 0, 16], ['Pedido estándar o consulta de orden', 65, 0, 5]] },
    helpdesk: { nombre: 'Helpdesk IT', sub: 'Tickets y consultas', lead: 'Tickets por día', unidad: 'ticket', chat: 'Helpdesk IT {IA}',
      aviso: '<b>Soporte técnico y tickets:</b> una incidencia que escala a Jira nivel 2 requiere diagnóstico detallado (unos 12 mensajes). Una consulta de la base de conocimientos se resuelve al instante (unos 4).',
      presets: [['Unos 320 tickets por mes (15 × 5 días)', 15, 5]],
      mix: [['Escalado a Jira nivel 2', 25, 0, 12], ['Consulta resuelta en nivel 1', 75, 0, 4]] }
  };

  // Conversaciones de «Probalo en vivo». u = cliente (gratis), s = servicio del agente, p = plantilla de utilidad.
  function u(t, h) { return { q: 'u', t: t, h: h }; }
  function s(t, h, c) { return { q: 's', t: t, h: h, c: c }; }
  function p(t, h) { return { q: 'p', t: t, h: h }; }
  function b(m, L) { m.b = L; return m; }   // opciones que se ven como botones al responder
  var DEMOS = {
    odontologia: {
      A: ['1ª vez obra social', [
        u('Hola, quiero sacar un turno con el dentista.', '10:12'), s('¡Hola! Soy el asistente del consultorio. ¿Es tu primera consulta con nosotros?', '10:12'),
        u('Sí, primera vez.', '10:13'), s('¡Bienvenida! ¿Me decís tu nombre y apellido?', '10:13'), u('Laura Pérez.', '10:13'),
        s('Gracias, Laura. ¿Venís por obra social o particular?', '10:13'), u('Por obra social, OSDE 210.', '10:14'),
        s('Perfecto. ¿Me pasás tu número de afiliado?', '10:14'), u('61 234567 8 01', '10:14'),
        s('Verifiqué la cobertura: OSDE 210 cubre la primera consulta.', '10:15'), s('¿Cuál es el motivo de la consulta?', '10:15'),
        u('Me duele una muela.', '10:15'), s('Entiendo. Para dolor priorizamos turnos de 30 minutos esta semana.', '10:16'),
        s('Tengo el martes 10:30 o el miércoles 16:00. ¿Cuál preferís?', '10:16'), u('Martes 10:30.', '10:16'),
        s('Anotado. ¿Me confirmás un email para enviarte la ficha de ingreso?', '10:16'), u('laura.perez@mail.com', '10:17'),
        s('Te envié la ficha. Completarla antes te ahorra 10 minutos en la sala.', '10:17'), s('Recordá traer la credencial de OSDE y el DNI.', '10:17'),
        s('Si tomás alguna medicación, indicala en la ficha.', '10:17'), s('Estamos en Av. Santa Fe 1234, 3° B. Te dejo la ubicación.', '10:18'),
        s('¡Listo! Tu turno quedó reservado.', '10:18', ['Turno confirmado', 'Primera consulta · Martes 15 de oct · 10:30 hs', 'Laura Pérez · OSDE 210']),
        p('Recordatorio: mañana martes 10:30 tenés turno en el consultorio. Respondé 1 para confirmar o 2 para reprogramar.', '09:00'),
        u('1', '09:05'), s('¡Gracias, Laura! Te esperamos mañana.', '09:05')]],
      B: ['Reprogramación', [
        p('Recordatorio: mañana jueves 9:00 tenés control de ortodoncia con la Dra. Gómez. Respondé 1 para confirmar o 2 para reprogramar.', '09:00'),
        u('2, no puedo ir.', '09:20'), s('Entendido, libero el turno del jueves.', '09:20'),
        s('Tengo el viernes 11:00 o el lunes 17:30. ¿Cuál te queda mejor?', '09:20'), u('Lunes 17:30.', '09:22'),
        s('Listo, reprogramé tu control.', '09:22', ['Control reprogramado', 'Ortodoncia · Lunes 19 de oct · 17:30 hs', 'Tomás Díaz']),
        u('¡Gracias!', '09:23'), s('De nada, ¡nos vemos el lunes!', '09:23')]]
    },
    talleres: {
      A: ['Consulta con turno', [
        u('Hola, ¿cuánto sale el service de los 10.000 km para un Gol Trend?', '11:02'),
        s('¡Hola! El service de 10.000 km incluye cambio de aceite, filtros y revisión general.', '11:02'),
        s('Para un Gol Trend son $ 85.000 con mano de obra incluida.', '11:02'), u('¿Cuánto tarda?', '11:03'),
        s('Unas 3 horas. Podés dejarlo a la mañana y retirarlo al mediodía.', '11:03'), u('Dale, quiero sacar turno.', '11:04'),
        s('Tengo el martes 9:00 o el jueves 8:30. ¿Cuál preferís?', '11:04'), u('Martes 9.', '11:04'),
        s('¿Me pasás la patente y tu nombre?', '11:05'), u('AB123CD, Martín López.', '11:05'),
        s('Listo, Martín. Turno reservado.', '11:05', ['Turno de taller confirmado', 'Service 10.000 km · Martes 15 de oct · 9:00 hs', 'Martín López · AB123CD']),
        p('Recordatorio: mañana martes 9:00 tenés turno para el service del Gol Trend AB123CD. Respondé 1 para confirmar.', '18:00'),
        u('1', '18:10'), s('¡Gracias! Te esperamos.', '18:10'),
        p('Tu Gol Trend AB123CD ya está listo. Podés retirarlo hasta las 18:00.', '12:15'),
        u('Voy en un rato.', '12:20'), s('Perfecto, te esperamos. ¡Gracias por elegirnos!', '12:20')]],
      B: ['Consulta de información', [
        u('Hola, ¿hacen alineación y balanceo?', '15:40'), s('¡Hola! Sí, hacemos alineación y balanceo computarizado.', '15:40'),
        s('El valor es $ 28.000 para autos y $ 35.000 para camionetas.', '15:40'), u('¿Hay que sacar turno?', '15:41'),
        s('No hace falta: atendemos por orden de llegada de lunes a viernes de 8 a 18.', '15:41'), s('Los sábados atendemos de 8 a 13.', '15:41'),
        u('¿Dónde están?', '15:42'), s('En Av. Rivadavia 5600, Caballito. Te dejo la ubicación.', '15:42'),
        u('Gracias.', '15:43'), s('¡De nada! Si preferís, también te puedo reservar un turno.', '15:43')]]
    },
    hoteles: {
      A: ['Reserva confirmada', [
        u('Hola, ¿tienen habitación doble del 15 al 18 de octubre?', '20:05'), s('¡Hola! Sí, tenemos disponibilidad para esas fechas.', '20:05'),
        s('La doble estándar cuesta $ 95.000 por noche con desayuno.', '20:05'), s('La superior, con vista al mar, $ 120.000 por noche.', '20:05'),
        u('La superior.', '20:07'), s('Excelente elección. Son 3 noches: $ 360.000 en total.', '20:07'),
        s('¿Me pasás nombre completo y email para la reserva?', '20:07'), u('Ana Ruiz, ana.ruiz@mail.com', '20:08'),
        s('Gracias, Ana. Para confirmar pedimos una seña del 30%. Te envío el link de pago.', '20:08'), u('Listo, ya pagué.', '20:12'),
        s('Recibimos la seña. Tu reserva quedó confirmada.', '20:12', ['Reserva confirmada', 'Habitación superior · 15 al 18 de oct', 'Ana Ruiz · Código R-4821']),
        s('El check-in es desde las 14:00 y el check-out hasta las 10:00.', '20:12'),
        p('Comprobante de reserva: habitación superior, 15 al 18 de octubre. Código R-4821.', '20:13'),
        p('Pre check-in: tu llegada es mañana. ¿A qué hora estimás llegar?', '10:00'), u('Tipo 16.', '10:30'),
        s('Perfecto, dejamos todo listo para las 16:00.', '10:30'), u('¿Tienen estacionamiento?', '10:31'),
        s('Sí, estacionamiento sin cargo para huéspedes.', '10:31')]],
      B: ['Consulta de disponibilidad', [
        u('Hola, ¿tienen lugar para el fin de semana largo?', '19:30'), s('¡Hola! ¿Para qué fechas y cuántas personas?', '19:30'),
        u('Del 21 al 24 de noviembre, 2 adultos y un nene.', '19:31'), s('Para esas fechas tenemos la habitación triple disponible.', '19:31'),
        s('Cuesta $ 140.000 por noche con desayuno: $ 420.000 por las 3 noches.', '19:31'), u('¿Aceptan mascotas?', '19:32'),
        s('Sí, mascotas pequeñas con un cargo de $ 10.000 por estadía.', '19:32'), u('¿Tiene pileta?', '19:33'),
        s('Sí, pileta climatizada abierta de 8 a 22.', '19:33'), s('Los menores de 3 años no pagan.', '19:33'),
        u('Lo pienso y te aviso.', '19:35'), s('¡Claro! La disponibilidad puede cambiar, así que te recomiendo no esperar mucho.', '19:35'),
        s('Cuando quieras, te reservo con una seña del 30%.', '19:35')]]
    },
    manufactura: {
      A: ['Reclamo con muestra', [
        u('Hola PCP, tenemos un faltante de piezas para la orden 96890 de carteras.', ''),
        b(s('Hola. Identificamos tu taller. ¿El reclamo requiere muestra física de cuero o es de avíos o interiores?', ''), ['Muestra física de cuero', 'Avíos o herrajes', 'Interiores']),
        u('Muestra física de cuero', ''),
        b(s('Entendido. Enviá la foto del motivo y confirmá el material faltante:', ''), ['Tapa trasera (1 unidad)', 'Manija de mano (4 unidades)', 'Base (1 unidad)']),
        u('Tapa trasera (1 unidad)', ''),
        s('Registrado en la planilla de reclamos. Dejá la muestra en la dársena para el retiro.', '', ['Reclamo registrado', 'N.º 11620 · Orden 96890', 'Tapa trasera · 1 unidad'])]],
      B: ['Pedido de avíos', [
        u('Buenas tardes PCP, faltan remaches para la orden 97220.', ''),
        b(s('Hola. El sistema detectó tu orden 97220. ¿Qué insumo necesitás?', ''), ['Remache 6/6 níquel (400 unidades)', 'Tiracierre zamac (50 unidades)']),
        u('Remache 6/6 níquel (400 unidades)', ''),
        s('Solicitud generada. Te avisamos cuando esté lista para retirar en la dársena.', '', ['Solicitud de almacén', 'N.º 11803 · En espera', 'Remache 6/6 níquel · 400 unidades'])]]
    },
    helpdesk: {
      A: ['Ticket escalado a Jira', [
        u('No puedo acceder a la VPN corporativa desde mi notebook.', ''),
        b(s('Hola. Consulté la base de conocimientos. ¿Probaste reiniciar el cliente de VPN y verificar el token?', ''), ['Ya lo reinicié, sigue el error', 'Funcionó, gracias']),
        u('Ya lo reinicié, sigue el error', ''),
        b(s('Entendido. Como no se resolvió en nivel 1, derivamos al equipo de redes creando un ticket en Jira.', ''), ['Crear ticket en Jira', 'Consultar otro tema']),
        u('Crear ticket en Jira', ''),
        s('Ticket creado. El seguimiento queda habilitado en este chat.', '', ['Ticket NET-142', 'Responsable: Redes y VPN', 'Prioridad: Alta'])]]
    }
  };

  var S = { tab: 'calc', tc: 0, sector: 'odontologia', mix: [], preset: 0, dia: 6, sem: 3, cons: 0, infra: 0, canal: 'wa',
            franq: true, impacto: 20000, graf: 'usd', mrr: 680000, modo: 'A', paso: 0, ult: null };

  function $(id) { return document.getElementById(id); }
  function put(id, h) { var e = $(id); if (e) e.innerHTML = h; }
  function ent(n) { return '<span class="m">' + Math.round(n).toLocaleString('es-AR') + '</span>'; }
  function dec2(n) { return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }   // sólo el simulador: el costo por contacto en USD no entra sin decimales
  function ars(n) { return '<span class="m">$ ' + dec2(n) + '</span>'; }
  function usd(n) { return '<span class="m ui-p-usd">USD ' + dec2(n) + '</span>'; }
  function dig(t) { return t.replace(/\d(?:[\d.,]*\d)?%?/g, '<span class="m">$&</span>'); }   // dígitos de un texto en Courier
  function sector(k) {
    S.sector = k; S.mix = SECT[k].mix.map(function (x) { return { n: x[0], share: x[1], tpl: x[2], srv: x[3] }; });
    S.preset = 0; S.dia = SECT[k].presets[0][1]; S.sem = SECT[k].presets[0][2]; S.modo = 'A'; arranque();
  }

  // Costo Meta del mes: las plantillas siempre se cobran; el servicio, sólo lo que pasa la franquicia.
  // Los mensajes que manda el cliente son gratis y no se cuentan.
  function meta(dia, sem) {
    var mes = dia * sem * SEM, tpc = 0, spc = 0;
    S.mix.forEach(function (r) { tpc += r.share / 100 * r.tpl; spc += r.share / 100 * r.srv; });
    var lim = S.franq ? FRANQ : 0, tpl = mes * tpc, srv = mes * spc + S.cons * MSJ_CONS, fact = Math.max(0, srv - lim), mu = tpl * UTIL_USD + fact * META_USD;
    return { mes: mes, srv: srv, spc: spc, lim: lim, tpl: tpl, exc: fact, mu: mu, total: tpl + srv, fact: tpl + fact, usd: mu, ars: mu * S.tc };
  }

  function aviso(t, tipo) { return '<div class="ui-aviso ui-' + (tipo || 'info') + '">' + uiIco(tipo === 'adv' ? 'alerta' : 'info') + '<span>' + dig(t) + '</span></div>'; }
  function kpi(k, id, color, sub) { return '<div class="ui-kpi ui-k-' + color + '"><div class="ui-kpi-k">' + esc(k) + '</div><div class="ui-kpi-v" id="' + id + '"></div><div class="ui-kpi-s" id="' + id + 's">' + (sub || '') + '</div></div>'; }
  function kv(l, id, c) { return '<div class="ui-kv' + (c ? ' ' + c : '') + '"><span>' + l + '</span><span class="ui-num" id="' + id + '"></span></div>'; }
  function tabs(L, on, a) { return uiTabs(L.map(function (t) { return [t[0], t[1], 'data-sim="' + a + '" data-k="' + t[0] + '"']; }), on); }
  function secc(t, ic, cuerpo) { return uiDesp({ t: t, ic: ic, open: true }, cuerpo); }

  // ── pestaña 1 · Calculadora ──────────────────────────────────
  function caja(t, ic, color, cuerpo, extra) { return '<div class="sim-caja ui-k-' + color + (extra ? ' ' + extra : '') + '"><div class="sim-caja-t">' + uiIco(ic) + '<span>' + esc(t) + '</span></div>' + cuerpo + '</div>'; }
  function htmlCalc() {
    var C = SECT[S.sector];
    return uiDesp({ t: 'Transparencia, impacto y escalabilidad', ic: 'info', open: S.costos, attrs: 'id="sm-costos"' }, '<div class="sim-tres">' +
      caja('Transparencia de costos', 'info', 'p-contratado',
        '<p>' + dig('Meta factura la mensajería directo a la tarjeta del cliente: <b>1.000 mensajes de servicio gratis</b> por mes y por número, y <b>USD 0,026</b> por mensaje excedente (esquema de octubre 2026).') + '</p>' +
        '<p>Un contacto nuevo usa muchos más mensajes que uno recurrente: el costo depende del flujo de la conversación y de la cantidad de clientes.</p>' +
        '<p>' + dig('<b class="sim-cel">1.000 mensajes ≠ 1.000 turnos.</b> Con 10 mensajes por gestión alcanzan para unas 100. Hay que confirmar qué mensajes cuentan según las reglas vigentes de Meta.') + '</p>' +
        '<p>GIWA {IA} orquesta con Supabase y n8n la gestión de turnos y consultas 24/7.</p>') +
      caja('Así se ve el impacto', 'plata', 'p-pendiente',
        '<div class="u-row8"><label class="ui-lbl u-f1" for="sm-imp">Mensajes por mes</label><span id="sm-imp-v" class="ui-num"></span></div>' +
        '<input type="range" class="sim-rango" id="sm-imp" min="0" max="100000" step="500" value="' + S.impacto + '" aria-label="Mensajes por mes">' +
        '<div class="sim-marcas"><span class="m">0</span><span class="m">50.000</span><span class="m">100.000</span></div>' +
        '<div class="u-mt10">' + kv('Mensajes excedentes', 'sm-imp-exc') + kv('Costo del excedente (USD)', 'sm-imp-usd') + kv('Costo del excedente (ARS)', 'sm-imp-usds', 'sim-tot') + '</div>') +
      caja('Escalabilidad de costos según ' + C.lead.toLowerCase(), 'tablero', 'p-cobrado',
        tabs([['usd', 'USD'], ['ars', 'ARS'], ['uni', 'Por ' + C.unidad + ' (ARS)']], S.graf, 'graf') +
        '<div id="sm-graf"></div><div class="sim-ley"><span class="sim-ley-ok">Dentro de la franquicia</span><span class="sim-ley-exc">Excede la franquicia</span></div><div class="hint u-mt6" id="sm-umbral"></div>', 'sim-graf') +
      '</div>') +
      secc('Simulador', 'ajustes',
        tabs(Object.keys(SECT).map(function (k) { return [k, SECT[k].nombre]; }), S.sector, 'sector') +
        '<div class="hint u-mb10">' + esc(C.sub) + '</div>' + aviso(C.aviso) +
        '<div class="ui-lbl">Escenarios rápidos</div><div class="u-row6 sim-pills">' + C.presets.map(function (x, i) {
          return '<button class="ft-pill' + (i === S.preset ? ' on' : '') + '" data-sim="preset" data-i="' + i + '"><span>' + dig(esc(x[0])) + '</span></button>'; }).join('') + '</div>' +
        '<div class="sim-tres sim-tres-datos u-mt10">' +
          caja('Datos estimados para calcular mensajes', 'lista', 'p-contratado',
            '<div class="sim-campos"><div><label class="ui-lbl" for="sm-dia">' + esc(C.lead) + '</label><input class="ui-campo sim-num" type="number" min="0" step="1" id="sm-dia" value="' + S.dia + '"></div>' +
              '<div><label class="ui-lbl" for="sm-sem">Días de atención por semana</label><input class="ui-campo sim-num" type="number" min="1" max="7" step="1" id="sm-sem" value="' + S.sem + '"></div></div>' +
            '<div class="u-mt10"><label class="ui-lbl" for="sm-cons">Consultas informativas sin cierre por mes</label><input class="ui-campo sim-num" type="number" min="0" step="10" id="sm-cons" value="' + S.cons + '">' +
              '<div class="hint u-mt4">' + dig('Promedio de 3 mensajes por consulta (horarios, dirección, aranceles).') + '</div></div>' +
            '<div class="u-ovx u-mt10"><table class="ui-tbl sim-mix"><thead><tr><th>Tipo de contacto</th><th class="u-tr">% del total</th><th class="u-tr">Plantillas</th><th class="u-tr">Servicio</th></tr></thead><tbody>' +
              S.mix.map(function (r, i) {
                return '<tr><td>' + esc(r.n) + '</td>' + ['share', 'tpl', 'srv'].map(function (f) {
                  return '<td class="u-tr"><input class="ui-campo sim-num" type="number" min="0" step="1" value="' + r[f] + '" data-mix="' + i + '" data-f="' + f + '" aria-label="' + esc(r.n) + '"></td>'; }).join('') + '</tr>';
              }).join('') + '</tbody></table></div>' +
            '<div class="u-s11 u-c-wa u-mt4" id="sm-mix-av"></div>' +
            '<label class="u-row6 u-mt10 u-s12"><input type="checkbox" id="sm-franq"' + (S.franq ? ' checked' : '') + '> <span>' + dig('Franquicia de 1.000 mensajes de servicio mensuales bonificados por Meta') + '</span></label>') +
          caja('Consumo mensual vs. franquicia', 'tablero', 'p-cobrado',
            '<div class="u-row8"><span class="u-f1">Mensajes de servicio: <span id="sm-b-srv" class="ui-num"></span></span></div><div id="sm-b-est" class="u-s12 u-mt4"></div>' +
            '<div class="sim-barra"><span class="sim-b-ok" id="sm-b-ok"></span><span class="sim-b-exc" id="sm-b-exc"></span></div>' +
            '<div class="sim-marcas"><span class="m">0</span><span class="u-c-ok" id="sm-b-lim"></span><span class="u-c-wa" id="sm-b-mas"></span></div>' +
            '<div class="u-mt10" id="sm-b-txt"></div><div class="hint u-mt4">Las plantillas se cobran siempre y no consumen la franquicia.</div>') +
          caja('Facturación de Meta', 'plata', 'p-pendiente', '<div id="sm-res"></div>') +
        '</div>' +
        '<div class="hint u-mt10">Automatizar turnos no es sólo responder mensajes: es diseñar conversaciones eficientes y controlar el costo por atención.</div>');
  }
  function calcular() {
    var C = SECT[S.sector], r = meta(S.dia, S.sem), n = Math.max(1, Math.round(r.mes)), exc = Math.max(0, S.impacto - FRANQ);
    S.ult = { usd: r.usd, ars: r.ars, n: n, total: r.total, unidad: C.unidad };
    put('sm-imp-v', ent(S.impacto)); put('sm-imp-exc', ent(exc)); put('sm-imp-usd', usd(exc * META_USD)); put('sm-imp-usds', ars(exc * META_USD * S.tc));
    var tot = S.mix.reduce(function (a, x) { return a + x.share; }, 0);
    put('sm-mix-av', Math.round(tot) === 100 ? '' : 'Los porcentajes suman ' + ent(tot) + '%. Deberían sumar 100%.');
    var fq = !r.lim ? 'Sin franquicia aplicada' : r.srv > r.lim ? 'Se agotan el día ' + ent(Math.ceil(r.lim / r.srv * 30)) + ' del mes'
      : 'Usás ' + ent(r.srv) + ' · quedan ' + ent(r.lim - r.srv) + ' libres';
    var fila = function (l, v, c) { return '<div class="ui-kv' + (c ? ' ' + c : '') + '"><span>' + l + '</span><span class="ui-num">' + v + '</span></div>'; };
    put('sm-res', fila('Mensajes del agente por mes (plantillas + servicio)', ent(r.total)) + fila('Mensajes que factura Meta', ent(r.fact)) +
      '<div class="ui-kv sim-kv-col"><span>' + dig('Franquicia de 1.000 mensajes de servicio (se renueva el 1° de cada mes, por número)') + '</span><span>' + fq + '</span></div>' +
      fila('Costo estimado por ' + C.unidad, ars(r.ars / n) + ' (' + usd(r.usd / n) + ')') +
      fila('Total facturación (USD)', usd(r.usd), 'sim-tot') + fila('Total facturación (ARS)', ars(r.ars), 'sim-tot'));
    // barra de consumo
    var tope = Math.max(r.srv, FRANQ) || 1, ok = Math.min(r.srv, r.lim), mas = Math.max(0, r.srv - r.lim);
    put('sm-b-srv', ent(r.srv)); put('sm-b-lim', r.lim ? ent(r.lim) + ' gratis en Meta' : 'Sin franquicia');
    put('sm-b-mas', mas ? '+' + ent(mas) + ' excedentes' : '');
    var bo = $('sm-b-ok'), be = $('sm-b-exc');
    if (bo) { bo.style.width = (ok / tope * 100) + '%'; be.style.width = (mas / tope * 100) + '%'; }
    put('sm-b-est', mas ? '<span class="u-c-wa">Excede la franquicia</span>' : '<span class="u-c-ok">Dentro de la franquicia</span>');
    var libre = r.lim - S.cons * MSJ_CONS, nro = Math.floor(libre / r.spc) + 1;
    put('sm-b-txt', !r.lim ? 'Sin franquicia: se factura desde el primer mensaje.' : !(r.spc > 0) ? 'Con este tipo de contacto no se usan mensajes de servicio.' :
      libre <= 0 ? 'Las consultas informativas ya agotan la franquicia: pagás desde la primera operación.' :
      'Con esta configuración, empezás a pagar en Meta a partir de la operación <span class="ui-num">N.º ' + ent(nro) + '</span> del mes. Costo por mensaje extra: <span class="ui-num">USD 0,026</span>.');
    // WhatsApp y Telegram
    var wa = r.usd + S.infra, tg = S.infra, tgm = 0;
    S.ult.wa = wa; S.ult.tg = tg; S.ult.aho = r.ars;
    put('sm-w-bon', ent(r.lim)); put('sm-w-exc', ent(r.fact)); put('sm-w-men', usd(r.usd)); put('sm-w-inf', usd(S.infra)); put('sm-w-tot', usd(wa)); put('sm-w-ars', ars(wa * S.tc)); put('sm-w-uni', ars(wa * S.tc / n));
    put('sm-t-exc', ent(0)); put('sm-t-men', usd(tgm)); put('sm-t-inf', usd(S.infra)); put('sm-t-tot', usd(tg)); put('sm-t-ars', ars(tg * S.tc)); put('sm-t-aho', ars(r.ars));
    var spd = S.sem * SEM * r.spc;
    put('sm-umbral', spd > 0 ? 'Desde ' + ent(Math.ceil(FRANQ / spd)) + ' ' + esc(C.lead.toLowerCase()) + ' se agotan los ' + dig('1.000') + ' mensajes de servicio gratis del mes. Se renuevan el ' + dig('1') + '° de cada mes, por número de WhatsApp.'
      : 'Con este mix no se usan mensajes de servicio.');
    put('sm-graf', grafico());
    calcMrr();
  }
  function grafico() {
    var R = ESCALA.map(function (d) { return meta(d, S.sem); });
    var P = R.map(function (r) { return S.graf === 'ars' ? r.ars : S.graf === 'uni' ? (r.mes > 0 ? r.ars / r.mes : 0) : r.usd; });
    var W = 340, H = 230, pl = 92, pb = 26, pt = 10, n = P.length, max = Math.max.apply(null, P) || 1;
    var x = function (i) { return pl + i * (W - pl - 10) / (n - 1); }, y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var f = function (v) { return (S.graf === 'usd' ? 'USD ' : '$ ') + dec2(v); };
    var ejes = [0, 0.5, 1].map(function (k) { var yy = y(max * k).toFixed(1);
      return '<line class="sim-gl" x1="' + pl + '" x2="' + (W - 10) + '" y1="' + yy + '" y2="' + yy + '"/><text class="sim-gt" x="' + (pl - 6) + '" y="' + yy + '" text-anchor="end" dy="3">' + esc(f(max * k)) + '</text>'; }).join('');
    var pts = P.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); });
    return '<svg class="fin-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Costo según ' + esc(SECT[S.sector].lead.toLowerCase()) + '">' +
      '<defs><linearGradient id="sim-grad" x1="0" y1="0" x2="0" y2="1"><stop class="sim-g1" offset="0"/><stop class="sim-g2" offset="1"/></linearGradient></defs>' + ejes +
      '<polygon fill="url(#sim-grad)" points="' + x(0).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(n - 1).toFixed(1) + ',' + y(0) + '"/>' +
      '<polyline class="sim-gp" points="' + pts.join(' ') + '"/>' + P.map(function (v, i) {
        var pasa = R[i].srv > R[i].lim;
        return '<circle class="sim-gc' + (pasa ? ' exc' : '') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4.5"><title>' + ESCALA[i] + ' por día: ' + esc(f(v)) + '</title></circle>' +
          '<text class="sim-gt" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + ESCALA[i] + '</text>'; }).join('') + '</svg>';
  }

  // ── pestaña 2 · Probalo en vivo ──────────────────────────────
  function tel(k, tit, sub, ic) {
    return '<div class="sim-tel"><div class="sim-tel-h sim-tel-' + k + '">' + ic + '<div><div class="u-fw6 u-s12">' + esc(tit) + '</div><div class="hint">' + sub + '</div></div></div>' +
      '<div class="sim-chat" id="sm-chat-' + k + '"></div><div class="sim-ops" id="sm-ops-' + k + '"></div></div>';
  }
  function htmlVivo() {
    var D = DEMOS[S.sector], C = SECT[S.sector];
    return secc('Probalo en vivo: misma IA, mismos botones en los dos canales', 'chat',
        '<div class="hint u-mb10">Mostrale al cliente que en WhatsApp y en Telegram el agente funciona con la misma fluidez, botones, validaciones y conexión con sus sistemas.</div>' +
        tabs(Object.keys(SECT).map(function (k) { return [k, SECT[k].nombre]; }), S.sector, 'sector') +
        tabs(['A', 'B'].filter(function (m) { return D[m]; }).map(function (m) { return [m, D[m][0]]; }), S.modo, 'modo') +
        tabs([['wa', 'WhatsApp'], ['tg', 'Telegram']], S.canal, 'canal') +
        '<div class="sim-vivo"><div>' + (S.canal === 'tg' ? tel('tg', C.chat, 'Bot de Telegram', ico('chat')) : tel('wa', C.chat, 'Cuenta comercial oficial', ico('whatsapp'))) +
          '<div class="u-row8 u-mt10">' + uiBtn('Siguiente paso', 'derecha', 'p', 'data-sim="paso"') + uiBtn('Reiniciar', 'recargar', 's', 'data-sim="reini"') +
          '<span class="u-s11 u-c-mt u-mla" id="sm-cuenta"></span></div>' +
          '<div class="hint u-mt6">Tocá la opción resaltada para avanzar.</div></div>' +
        caja('¿Cómo funciona el flujo inteligente?', 'info', 'p-contratado', [
          ['Mensaje entrante (WhatsApp Cloud API)', 'El cliente manda audio o texto. El webhook de Meta dispara el workflow en n8n en menos de 500 ms.'],
          ['Inteligencia y reglas del negocio', 'El agente interpreta la consulta, valida los datos necesarios y revisa la agenda o la disponibilidad en Supabase.'],
          ['Confirmación y reserva', 'Registra el turno o la reserva, le manda la tarjeta resumen al cliente y actualiza la planilla de gestión.'],
          ['Optimización de mensajes Meta', 'Diálogo conciso para aprovechar los 1.000 mensajes de servicio gratis de cada mes.']].map(function (x, i) {
            return '<div class="sim-paso"><span class="m u-c-bl">' + (i + 1) + '</span><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + dig(x[1]) + '</div></div></div>'; }).join('')) + '</div>');
  }
  function arranque() { var G = DEMOS[S.sector][S.modo][1]; S.paso = 1; while (S.paso < G.length && G[S.paso].q !== 'u') S.paso++; }   // muestra hasta la primera respuesta del cliente
  function chat() {
    var G = DEMOS[S.sector][S.modo][1], L = G.slice(0, S.paso), html = L.map(function (m) {
      return '<div class="sim-msg sim-' + (m.q === 'u' ? 'u' : 'a') + '"><div>' + esc(m.t) + '</div>' +
        (m.c ? '<div class="sim-conf"><div class="u-c-ok u-fw6">' + ico('check') + ' ' + esc(m.c[0]) + '</div><div>' + dig(esc(m.c[1])) + '</div><div class="u-c-mt">' + dig(esc(m.c[2])) + '</div></div>' : '') +
        '<div class="sim-hora"><span class="m">' + m.h + '</span>' + (m.q === 's' ? ' · Servicio' : m.q === 'p' ? ' · Plantilla' : '') + '</div></div>';
    }).join('');
    var sig = G[S.paso], prev = L[L.length - 1], ops = '';
    if (sig && sig.q === 'u') {
      var O = prev && prev.b ? prev.b : [sig.t];
      ops = O.map(function (t) { return '<button type="button" class="sim-op"' + (t === sig.t ? ' data-sim="resp"' : ' disabled') + '>' + esc(t) + '</button>'; }).join('');
    }
    ['wa', 'tg'].forEach(function (k) { var c = $('sm-chat-' + k); if (!c) return; c.innerHTML = html; c.scrollTop = c.scrollHeight; put('sm-ops-' + k, ops); });
    var c = function (q) { return L.filter(function (m) { return m.q === q; }).length; };
    put('sm-cuenta', (S.canal === 'tg' ? 'Telegram: ' + ent(0) + ' facturados' : 'WhatsApp: ' + ent(c('s')) + ' servicio + ' + ent(c('p')) + (c('p') === 1 ? ' plantilla' : ' plantillas')) + ' · Cliente: ' + ent(c('u')) + ' (gratis)');
  }

  // ── pestaña 3 · MRR y conveniencia ───────────────────────────
  function htmlMrr() {
    var lista = function (L) { return L.map(function (x) { return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + dig(x[1]) + '</div></div></div>'; }).join(''); };
    return secc('Estimación de MRR y costo integral para el cliente', 'plata',
        '<div class="hint">Definí tu abono mensual (MRR) para contrastarlo con el costo proyectado de WhatsApp y ver exactamente cómo le quedaría la inversión final al cliente.</div>' +
        '<div class="g3 u-mt10"><div><label class="ui-lbl" for="sm-mrr">Definí tu abono mensual (MRR en ARS)</label><input class="ui-campo sim-num" type="number" min="0" step="10000" id="sm-mrr" data-monto value="' + S.mrr + '">' +
        '<div class="hint u-mt4" id="sm-mrr-eq"></div></div></div>' +
        '<div class="ui-kpis u-mt10">' + kpi('Mi abono MRR (GIWA {IA})', 'sm-k1', 'p-abono') + kpi('Costo WhatsApp (Meta)', 'sm-k2', 'p-pendiente') + kpi('Total inversión cliente', 'sm-k3', 'p-contratado') + kpi('Costo total por ' + SECT[S.sector].unidad, 'sm-k4', 'p-neutro') + '</div>') +
      secc('Comparativa de conveniencia: ¿hacerlo con n8n o con la IA de Meta?', 'tablero',
        '<div class="hint u-mb10">Evaluación técnica y económica de qué arquitectura le resulta más conveniente al cliente.</div>' +
        '<div class="sim-dos"><div><div class="u-row8"><div class="u-f1"><div class="ui-lbl">Esquema con n8n + LLM externo</div><div class="hint">Arquitectura GIWA {IA}</div></div><span class="u-c-ok u-s11">Más conveniente</span></div>' +
        lista([['Costo de tokens despreciable', 'Inferencia por API (Gemini/OpenAI) cuesta apenas ~USD 0,0005 por conversación (~$0,40 USD al mes para 800 turnos).'],
               ['Ahorro en mensajes de Meta', 'n8n sintetiza el diálogo en 6 a 8 mensajes precisos para aprovechar al máximo los 1.000 mensajes gratuitos mensuales de Meta.'],
               ['Integración con bases de datos médicas', 'Conexión bidireccional directa con Supabase, Google Sheets, agendas y calendarios de profesionales.'],
               ['Cero vendor lock-in', 'El cliente es dueño de su base de datos. Si Meta cambia precios de IA, tu infraestructura no se ve afectada.']]) +
        '<div class="hint u-mt10">Conclusión: Menor costo global para el cliente y control absoluto de los turnos.</div></div>' +
      '<div><div class="u-row8"><div class="u-f1"><div class="ui-lbl">Esquema con IA nativa de Meta</div><div class="hint">Meta AI Studio / Llama Assistant</div></div><span class="u-c-mt u-s11">Limitado</span></div>' +
        lista([['Incertidumbre tarifaria de Meta', 'Meta planea esquemas de cobro diferenciales o suscripciones para agentes de IA dentro de WhatsApp Business.'],
               ['Riesgo de mayor consumo de mensajes', 'Al ser un chat libre generativo sin orquestación, suele requerir más mensajes (12 a 16 msgs), agotando rápidamente los 1.000 msgs gratis y encareciendo la factura de Meta.'],
               ['Baja flexibilidad de integración', 'Dificultad para consultar agendas de turnos en tiempo real, validar obras sociales o actualizar Google Sheets.'],
               ['Dependencia del ecosistema Meta', 'Cualquier cambio de política en Meta Business puede alterar el bot sin previo aviso.']]) +
        '<div class="hint u-mt10">Conclusión: Más costoso para el cliente por exceso de mensajes y sin respaldo de agenda médica.</div></div></div>');
  }
  function calcMrr() {
    if (!S.ult || !$('sm-mrr')) return;
    var mu = S.tc > 0 ? S.mrr / S.tc : 0, ta = S.mrr + S.ult.ars, tu = mu + S.ult.usd, n = S.ult.n;
    put('sm-mrr-eq', 'Equivale a ' + usd(mu) + ' al TC de hoy');
    put('sm-k1', ars(S.mrr)); put('sm-k1s', usd(mu)); put('sm-k2', ars(S.ult.ars)); put('sm-k2s', usd(S.ult.usd));
    put('sm-k3', ars(ta)); put('sm-k3s', usd(tu)); put('sm-k4', ars(n ? ta / n : 0)); put('sm-k4s', usd(n ? tu / n : 0));
  }

  // ── pestaña 4 · Telegram ─────────────────────────────────────
  function htmlTg() {
    var c = function (t, L) { return '<div><div class="ui-lbl">' + t + '</div>' + L.map(function (x) {
      return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + dig(x[1]) + '</div></div></div>'; }).join('') + '</div>'; };
    var M = [['Costo de mensajería oficial', '1.000 msgs gratis. Luego USD 0,026 por mensaje excedente.', 'USD 0,00 (ilimitado y gratuito).', 'Motor agnóstico conectado a Sheets o CRM.'],
      ['Botones e interactividad', 'Hasta 3 botones de respuesta rápida o listas desplegables.', 'Botones inline ilimitados, grillas y menús.', 'Respuestas idénticas renderizadas según cada canal.'],
      ['Penetración en clientes', 'Extrema (&gt;98% de la población).', 'Alta en soporte técnico, logística, talleres y empresas.', 'Soporte multicanal unificado en un solo panel.'],
      ['Ventana de conversación', 'Sesiones de 24 hs por ventana de servicio de Meta.', 'Sin restricciones de tiempo.', 'Manejo de memoria contextual con Supabase / Postgres.'],
      ['Integración operativa', 'Requiere Meta Cloud API y verificación de negocio.', 'Inmediata (token instantáneo con @BotFather).', 'Webhooks en n8n + Google Apps Script nativo.']];
    var C = SECT[S.sector];
    return secc('WhatsApp y Telegram, lado a lado', 'chat',
        '<div class="g3 u-mb10"><div><label class="ui-lbl" for="sm-infra">Servidor y n8n (USD por mes)</label><input class="ui-campo sim-num" type="number" min="0" step="1" id="sm-infra" data-monto value="' + S.infra + '">' +
          '<div class="hint u-mt4">Se paga igual en los dos canales. Telegram no es costo cero.</div></div></div>' +
        '<div class="sim-dos"><div><div class="ui-lbl">WhatsApp Business API</div>' +
          '<div class="ui-kv"><span>Mensajes bonificados</span><span class="ui-num" id="sm-w-bon"></span></div>' + kv('Mensajes que factura Meta', 'sm-w-exc') + kv('Costo de mensajería', 'sm-w-men') + kv('Servidor y n8n', 'sm-w-inf') + kv('Total mensual', 'sm-w-tot', 'sim-tot') + kv('Total mensual en ARS', 'sm-w-ars') + kv('Costo por ' + C.unidad, 'sm-w-uni') + '</div>' +
        '<div><div class="ui-lbl">Telegram Bot API</div>' +
          '<div class="ui-kv"><span>Mensajes incluidos</span><span>Ilimitados</span></div>' + kv('Mensajes facturados', 'sm-t-exc') + kv('Costo de mensajería', 'sm-t-men') + kv('Servidor y n8n', 'sm-t-inf') + kv('Total mensual', 'sm-t-tot', 'sim-tot') + kv('Total mensual en ARS', 'sm-t-ars') + kv('Ahorro en mensajería por mes', 'sm-t-aho') + '</div></div>') +
      secc('Comparativa directa: WhatsApp Business Platform vs. Telegram (Bots)', 'chat', '<div class="sim-dos">' +
      c('WhatsApp Business Platform', [['Facturación de red', 'Facturada directo al cliente por Meta (1.000 msgs gratis + USD 0,026 excedente).'],
        ['Adopción de pacientes', 'Extrema (&gt;98% de la población). Cero fricción.'], ['Tasa de respuesta', 'Superior al 95% en los primeros 15 minutos.'],
        ['Veredicto', 'El canal estándar imprescindible para centros de salud y empresas.']]) +
      c('Telegram (Bots)', [['Costo de mensajes', 'USD 0,00 de Telegram, pero NO es solución a costo cero.'],
        ['Costos ocultos', 'Requiere servidor VPS 24/7, n8n y tokens de IA igualmente.'], ['Adopción', 'Baja en público general y pacientes médicos.'],
        ['Veredicto', 'Útil para alertas internas del equipo médico, inviable como canal principal para turnos de pacientes.']]) + '</div>') +
      secc('Matriz de decisión para clientes', 'lista', '<div class="u-ovx"><table class="ui-tbl"><thead><tr><th>Característica</th><th>WhatsApp Business API</th><th>Telegram Bot API</th><th>GIWA {IA}</th></tr></thead><tbody>' +
        M.map(function (f) { return '<tr>' + f.map(function (x) { return '<td>' + dig(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
  }

  // ── Modo presentación y propuesta ────────────────────────────
  function datosPres() {
    var C = SECT[S.sector], r = meta(S.dia, S.sem), wa = r.usd + S.infra, tg = S.infra;
    return { C: C, r: r, wa: wa, tg: tg, conclusion: [
      ['Estrategia híbrida recomendada', 'Utilizar WhatsApp para la captación y los turnos iniciales, donde la adopción es inmediata.'],
      ['Telegram para operaciones frecuentes o internas', 'Para personal interno, talleres, reclamos y seguimiento periódico, no tiene costo de mensajería y soporta botones y archivos pesados.'],
      ['La inteligencia artificial es compartida', 'La base de datos, el stock y la agenda se actualizan en el mismo backend, sin costo duplicado.']] };
  }
  function abrirSim(html) { var m = $('m-sim'); put('m-sim-b', html); openM("m-sim"); }
  function presentacion() {
    var d = datosPres();
    put('m-sim-t', 'Presentación comercial para clientes');
    abrirSim('<div class="ui-kpis"><div class="ui-kpi ui-k-p-neutro"><div class="ui-kpi-k">Volumen mensual</div><div class="ui-kpi-v">' + ent(d.r.mes) + '</div><div class="ui-kpi-s">' + ent(d.r.total) + ' mensajes estimados</div></div>' +
      '<div class="ui-kpi ui-k-p-pendiente"><div class="ui-kpi-k">WhatsApp</div><div class="ui-kpi-v">' + usd(d.wa) + '</div><div class="ui-kpi-s">' + ars(d.wa * S.tc) + '</div></div>' +
      '<div class="ui-kpi ui-k-p-cobrado"><div class="ui-kpi-k">Telegram</div><div class="ui-kpi-v">' + usd(d.tg) + '</div><div class="ui-kpi-s">Ahorro: ' + ars(d.r.ars) + ' por mes</div></div></div>' +
      '<div class="ui-lbl">Conclusión comercial</div>' + d.conclusion.map(function (x) { return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + x[1] + '</div></div></div>'; }).join(''));
    put('m-sim-f', uiBtn('Cerrar', 'cruz', 's', 'data-cerrar="m-sim"') + uiBtn('Generar propuesta', 'documento', 'p', 'data-sim="propuesta"'));
  }
  function propuestaFilas() {
    var d = datosPres();
    return [['Fecha de emisión', ff(_hoyLocal())], ['Rubro', d.C.nombre], ['Volumen mensual estimado', Math.round(d.r.mes).toLocaleString('es-AR') + ' operaciones'],
      ['Mensajes del agente por mes', Math.round(d.r.total).toLocaleString('es-AR')], ['Mensajes que factura Meta', Math.round(d.r.fact).toLocaleString('es-AR')],
      ['Total mensual WhatsApp', 'USD ' + dec2(d.wa) + ' · $ ' + dec2(d.wa * S.tc)], ['Total mensual Telegram', 'USD ' + dec2(d.tg) + ' · $ ' + dec2(d.tg * S.tc)],
      ['Ahorro en mensajería por mes', '$ ' + dec2(d.r.ars)], ['Tipo de cambio', '$ ' + dec2(S.tc) + (S.tcFecha ? ' al ' + ff(S.tcFecha) : ' (valor de referencia)')], ['Validez de la estimación', '30 días']];
  }
  function propuesta() {
    var d = datosPres();
    put('m-sim-t', 'Propuesta comercial de automatización');
    abrirSim(propuestaFilas().map(function (f) { return '<div class="ui-kv"><span>' + esc(f[0]) + '</span><span class="ui-num">' + esc(f[1]) + '</span></div>'; }).join('') +
      '<div class="ui-lbl u-mt10">Recomendación</div>' + d.conclusion.map(function (x) { return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + x[1] + '</div></div></div>'; }).join(''));
    put('m-sim-f', uiBtn('Cerrar', 'cruz', 's', 'data-cerrar="m-sim"') + uiBtn('Copiar', 'lista', 's', 'data-sim="copiar"') + uiBtn('Imprimir / PDF', 'documento', 'p', 'data-sim="impprop"'));
  }
  function copiarProp() {
    var d = datosPres(), t = 'GIWA {IA} · Propuesta comercial de automatización\n' + propuestaFilas().map(function (f) { return f[0] + ': ' + f[1]; }).join('\n') +
      '\n\nRecomendación\n' + d.conclusion.map(function (x) { return '- ' + x[0] + ': ' + x[1]; }).join('\n');
    navigator.clipboard.writeText(t).then(function () { toast('Copiado'); }, function () { toast('No se pudo copiar', 'err'); });
  }

  function pintar(el) {
    if (!S.mix.length) sector('odontologia');
    var dCostos = el.querySelector('#sm-costos'); if (dCostos) S.costos = dCostos.classList.contains('open');   // se repinta entero: conserva si estaba abierto
    el.innerHTML = '<div class="sim">' + uiHd('Simulador Costos Meta', 'WhatsApp Business API y gestión de turnos: cuánto factura Meta y cómo le queda al cliente.',
        '<span class="u-s11 u-c-mt">Dólar oficial BCRA ' + ars(S.tc) + (S.tcFecha ? ' al <span class="m">' + ff(S.tcFecha) + '</span>' : ' · valor de referencia') + '</span>' +
        (PUBLICO ? '' : uiBtn('Modo presentación', 'tablero', 's', 'data-sim="pres"') + uiBtn('Exportar propuesta', 'lista', 's', 'data-sim="propuesta"') + uiBtn('Imprimir', 'documento', 's', 'data-sim="imprimir"'))) +
      tabs(TABS.filter(function (t) { return !PUBLICO || t[0] !== 'mrr'; }), S.tab, 'tab') +
      ({ calc: htmlCalc, vivo: htmlVivo, mrr: htmlMrr, tg: htmlTg }[S.tab])() +
      '<div class="mo" id="m-sim"><div class="md"><div class="mh"><span class="mt2" id="m-sim-t"></span></div><div class="mb2" id="m-sim-b"></div><div class="mf" id="m-sim-f"></div></div></div></div>';
    calcular();
    if (S.tab === 'vivo') chat();
  }
  function entrada(ev) {
      var t = ev.target, i = t.getAttribute('data-mix');
      if (i !== null) { S.mix[+i][t.getAttribute('data-f')] = parseFloat(t.value) || 0; return calcular(); }
      if (t.id === 'sm-imp') { S.impacto = +t.value; return calcular(); }
      if (t.id === 'sm-dia' || t.id === 'sm-sem') { S[t.id.slice(3)] = parseFloat(t.value) || 0; S.preset = -1; return calcular(); }
      if (t.id === 'sm-mrr') { S.mrr = parseFloat(t.value) || 0; return calcMrr(); }
      if (t.id === 'sm-cons') { S.cons = parseFloat(t.value) || 0; return calcular(); }
      if (t.id === 'sm-infra') { S.infra = parseFloat(t.value) || 0; return calcular(); }
  }
  function cambio(ev) {
    var id = ev.target.id;
      if (id === 'sm-franq') { S.franq = ev.target.checked; calcular(); }
  }
  function clic(ev, el) {
      var b = ev.target.closest('[data-sim]'); if (!b) return;
      var a = b.getAttribute('data-sim'), k = b.getAttribute('data-k');
      if (a === 'tab') { S.tab = k; return pintar(el); }
      if (a === 'sector') { sector(k); return pintar(el); }
      if (a === 'preset') { var x = SECT[S.sector].presets[+b.getAttribute('data-i')]; S.preset = +b.getAttribute('data-i'); S.dia = x[1]; S.sem = x[2]; return pintar(el); }
      if (a === 'graf') { S.graf = k; return pintar(el); }
      if (a === 'modo') { S.modo = k; arranque(); return pintar(el); }
      if (a === 'canal') { S.canal = k; return pintar(el); }
      if (a === 'resp') { var G = DEMOS[S.sector][S.modo][1]; S.paso++; while (S.paso < G.length && G[S.paso].q !== 'u') S.paso++; return chat(); }
      if (a === 'pres') return presentacion();
      if (a === 'propuesta') return propuesta();
      if (a === 'copiar') return copiarProp();
      if (a === 'impprop') return window.print();
      if (a === 'paso') { if (S.paso < DEMOS[S.sector][S.modo][1].length) S.paso++; return chat(); }
      if (a === 'reini') { arranque(); return chat(); }
      if (a === 'imprimir') { S.tab = 'calc'; pintar(el); return window.print(); }
  }
  return {
    publico: function () { PUBLICO = true; },
    tc: function (valor, fecha) { S.tc = valor; S.tcFecha = fecha || ''; },
    tcActual: function () { return S.tc; },
    pintar: pintar, entrada: entrada, cambio: cambio, clic: clic
  };
})();

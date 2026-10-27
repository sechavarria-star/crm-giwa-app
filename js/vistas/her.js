/* ══════════════════════════════════════════════════════════════════════
   vistas/her.js · Herramientas (27/10/2026)
   ──────────────────────────────────────────────────────────────────────
     Simulador Costos Meta   = la web app «Analisis Meta y Horas» (Apps Script),
                               con sus 4 pestañas: Calculadora, Probalo en vivo,
                               MRR y conveniencia, Comparativa con Telegram.
   Es una calculadora para reuniones comerciales: todo se calcula acá con los
   números que se tipean; de la base sólo se lee el TC de hoy (v_tipo_cambio_hoy),
   en lugar de DolarAPI. No guarda nada. Mismas fórmulas que el original.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var SUBS = [['meta', 'Simulador Costos Meta']];
  var TABS = [['calc', 'Calculadora'], ['vivo', 'Probalo en vivo'], ['mrr', 'MRR y conveniencia'], ['tg', 'Comparativa con Telegram']];
  var META_USD = 0.026, UTIL_USD = 0.026, FRANQ = 1000, SEM = 4.33, ESCALA = [2, 5, 10, 20, 40, 80, 120];

  // Sectores: escenarios rápidos y mix de contactos (% del total, plantillas y servicio que manda el agente por contacto)
  var SECT = {
    odontologia: { nombre: 'Odontología', sub: 'Turnos de 30 min y 1 h', lead: 'Pacientes por día', unidad: 'paciente',
      presets: [['Sola, turno 1 h (6 × 3 días)', 6, 3], ['Sola, turno 30 min (12 × 3 días)', 12, 3], ['Pool 5, turno 1 h (40 × 5 días)', 40, 5], ['Pool 5, turno 30 min (80 × 5 días)', 80, 5]],
      mix: [['1ª vez particular', 17, 1, 11], ['1ª vez obra social', 17, 1, 15], ['Control con turno ya dado', 53, 1, 0], ['Control con reprogramación', 13, 1, 4]] },
    talleres: { nombre: 'Talleres', sub: 'Consultas de información y turnos', lead: 'Consultas por día', unidad: 'consulta',
      presets: [['Taller chico (10 × 6 días)', 10, 6], ['Taller mediano (25 × 6 días)', 25, 6], ['Red de talleres (60 × 6 días)', 60, 6]],
      mix: [['Consulta de información', 70, 0, 6], ['Consulta que termina en turno', 30, 2, 8]] },
    hoteles: { nombre: 'Hoteles', sub: 'Consultas y reservas', lead: 'Consultas por día', unidad: 'consulta',
      presets: [['Hotel boutique (15 × 7 días)', 15, 7], ['Hotel mediano (40 × 7 días)', 40, 7], ['Cadena (100 × 7 días)', 100, 7]],
      mix: [['Consulta de disponibilidad', 60, 0, 8], ['Reserva confirmada', 40, 2, 10]] }
  };

  // Conversaciones de «Probalo en vivo». u = cliente (gratis), s = servicio del agente, p = plantilla de utilidad.
  function u(t, h) { return { q: 'u', t: t, h: h }; }
  function s(t, h, c) { return { q: 's', t: t, h: h, c: c }; }
  function p(t, h) { return { q: 'p', t: t, h: h }; }
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
    }
  };

  var S = { tab: 'calc', tc: 0, sector: 'odontologia', mix: [], preset: 0, cli: 'Centro Médico Vida', dia: 6, sem: 3,
            franq: true, impacto: 20000, graf: 'usd', mrr: 680000, modo: 'A', paso: 0, ult: null };

  async function cargar() {
    var r = await db().from('v_tipo_cambio_hoy').select('valor').maybeSingle();
    if (r.error) throw new Error(r.error.message);
    S.tc = Number(r.data && r.data.valor) || _tcDefault();
  }
  function $(id) { return document.getElementById(id); }
  function put(id, h) { var e = $(id); if (e) e.innerHTML = h; }
  function ent(n) { return '<span class="m">' + Math.round(n).toLocaleString('es-AR') + '</span>'; }
  function ars(n) { return '<span class="m">' + fmt(n) + '</span>'; }
  function usd(n) { return '<span class="m">' + fmt(n, 'USD') + '</span>'; }
  function sector(k) {
    S.sector = k; S.mix = SECT[k].mix.map(function (x) { return { n: x[0], share: x[1], tpl: x[2], srv: x[3] }; });
    S.preset = 0; S.dia = SECT[k].presets[0][1]; S.sem = SECT[k].presets[0][2]; S.modo = 'A'; S.paso = 1;
  }

  // Costo Meta del mes: las plantillas siempre se cobran; el servicio, sólo lo que pasa la franquicia.
  // Los mensajes que manda el cliente son gratis y no se cuentan.
  function meta(dia, sem) {
    var mes = dia * sem * SEM, tpc = 0, spc = 0;
    S.mix.forEach(function (r) { tpc += r.share / 100 * r.tpl; spc += r.share / 100 * r.srv; });
    var lim = S.franq ? FRANQ : 0, tpl = mes * tpc, srv = mes * spc, fact = Math.max(0, srv - lim), mu = tpl * UTIL_USD + fact * META_USD;
    return { mes: mes, srv: srv, spc: spc, lim: lim, total: tpl + srv, fact: tpl + fact, usd: mu, ars: mu * S.tc };
  }

  // ── pestaña 1 · Calculadora ──────────────────────────────────
  function htmlCalc() {
    var C = SECT[S.sector];
    return '<div class="aviso aviso-bl"><b>Esquema de cobro Meta · octubre 2026.</b> Meta factura la mensajería directo a la tarjeta corporativa del cliente: ' +
        '<span class="m">1.000</span> mensajes de servicio gratis por mes y por número, y <span class="m">USD 0,026</span> por mensaje excedente. ' +
        'GIWA {IA} orquesta con Supabase y n8n la gestión de turnos y consultas 24/7.</div>' +
      '<div class="card u-mb12"><div class="card-t">Así se ve el impacto</div>' +
        '<div class="hint">El costo final de Meta depende del flujo de la conversación y de la cantidad de clientes.</div>' +
        '<div class="u-row8 u-mt10"><label class="fl u-f1" for="sm-imp">Mensajes por mes</label><span id="sm-imp-v" class="u-s13"></span></div>' +
        '<input type="range" class="sim-rango" id="sm-imp" min="0" max="100000" step="500" value="' + S.impacto + '" aria-label="Mensajes por mes">' +
        '<div class="kpi-grid u-mt10"><div class="kpi k-neutro"><div class="kpi-lbl">Mensajes excedentes</div><div class="kpi-val" id="sm-imp-exc"></div><div class="kpi-sub">Descontados los 1.000 bonificados</div></div>' +
        '<div class="kpi k-pendiente"><div class="kpi-lbl">Costo del excedente (lo factura Meta)</div><div class="kpi-val" id="sm-imp-usd"></div><div class="kpi-sub" id="sm-imp-ars"></div></div></div>' +
        '<div class="aviso aviso-wa u-mb0">Esos 1.000 mensajes no son 1.000 turnos gratis. Si un turno usa 10 mensajes que califican para la franquicia, alcanzan para unos ' +
        '<span class="m">100</span> turnos. Hay que confirmar qué mensajes cuentan según las reglas vigentes de Meta.</div></div>' +
      '<div class="card u-mb12"><div class="card-t">Simulador de consumo</div><div class="hint">' + esc(C.nombre + ' · ' + C.sub) + '</div>' +
        '<div class="filtros u-mt10" role="group" aria-label="Rubro">' + Object.keys(SECT).map(function (k) {
          return '<button class="ptab' + (k === S.sector ? ' on' : '') + '" data-sim="sector" data-k="' + k + '">' + SECT[k].nombre + '</button>'; }).join('') + '</div>' +
        '<span class="fl ft-lbl">Escenarios rápidos</span><div class="u-row6 sim-pills">' + C.presets.map(function (x, i) {
          return '<button class="ft-pill' + (i === S.preset ? ' on' : '') + '" data-sim="preset" data-i="' + i + '">' + esc(x[0]) + '</button>'; }).join('') + '</div>' +
        '<div class="g3 u-mt10"><div class="fg"><label class="fl" for="sm-cli">Cliente / empresa</label><input class="fc" id="sm-cli" value="' + esc(S.cli) + '"></div>' +
          '<div class="fg"><label class="fl" for="sm-dia">' + esc(C.lead) + '</label><input class="fc" type="number" min="0" step="1" id="sm-dia" value="' + S.dia + '"></div>' +
          '<div class="fg"><label class="fl" for="sm-sem">Días de atención por semana</label><input class="fc" type="number" min="1" max="7" step="1" id="sm-sem" value="' + S.sem + '"></div></div>' +
        '<div class="u-ovx"><table class="tbl sim-mix"><thead><tr><th>Tipo de contacto</th><th class="u-tr">% del total</th><th class="u-tr">Plantillas</th><th class="u-tr">Servicio</th></tr></thead><tbody>' +
          S.mix.map(function (r, i) {
            return '<tr><td>' + esc(r.n) + '</td>' + ['share', 'tpl', 'srv'].map(function (f) {
              return '<td class="u-tr"><input class="fc" type="number" min="0" step="1" value="' + r[f] + '" data-mix="' + i + '" data-f="' + f + '" aria-label="' + esc(r.n) + '"></td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>' +
        '<div class="u-s11 u-c-wa u-mt4" id="sm-mix-av"></div>' +
        '<label class="u-row6 u-mt10 u-s12"><input type="checkbox" id="sm-franq"' + (S.franq ? ' checked' : '') + '> Franquicia de 1.000 mensajes de servicio mensuales bonificados por Meta</label>' +
        '<div class="sec u-mt10">Facturación de Meta para <span id="sm-cli-t">' + esc(S.cli) + '</span></div><div id="sm-res"></div></div>' +
      '<div class="card"><div class="u-row8"><div class="card-t u-f1">Escalabilidad de costos según ' + esc(C.lead.toLowerCase()) + '</div>' +
        '<div class="filtros u-mb0" role="group" aria-label="Qué mostrar">' + [['usd', 'Costo en USD'], ['ars', 'Costo en ARS'], ['uni', 'Costo por ' + C.unidad]].map(function (g) {
          return '<button class="ptab' + (g[0] === S.graf ? ' on' : '') + '" data-sim="graf" data-k="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div></div>' +
        '<div id="sm-graf" class="u-mt10"></div><div class="hint u-mt6" id="sm-umbral"></div></div>';
  }
  function calcular() {
    var C = SECT[S.sector], r = meta(S.dia, S.sem), n = Math.max(1, Math.round(r.mes)), exc = Math.max(0, S.impacto - FRANQ);
    S.ult = { usd: r.usd, ars: r.ars, n: n };
    put('sm-imp-v', ent(S.impacto)); put('sm-imp-exc', ent(exc)); put('sm-imp-usd', usd(exc * META_USD)); put('sm-imp-ars', ars(exc * META_USD * S.tc));
    var tot = S.mix.reduce(function (a, x) { return a + x.share; }, 0);
    put('sm-mix-av', Math.round(tot) === 100 ? '' : 'Los porcentajes suman ' + ent(tot) + '%. Deberían sumar 100%.');
    var fq = !r.lim ? 'Sin franquicia aplicada' : r.srv > r.lim ? 'Se agotan el día ' + ent(Math.ceil(r.lim / r.srv * 30)) + ' del mes'
      : 'Usás ' + ent(r.srv) + ' · quedan ' + ent(r.lim - r.srv) + ' libres';
    var fila = function (l, v, c) { return '<div class="sim-fila' + (c ? ' ' + c : '') + '"><span>' + l + '</span><span>' + v + '</span></div>'; };
    put('sm-res', fila('Mensajes del agente por mes (plantillas + servicio)', ent(r.total)) + fila('Mensajes que factura Meta', ent(r.fact)) +
      fila('Franquicia de 1.000 mensajes de servicio (se renueva el 1° de cada mes, por número)', fq) +
      fila('Costo estimado por ' + C.unidad, ars(r.ars / n) + ' <span class="u-c-mt">(' + usd(r.usd / n) + ')</span>', 'sim-kpi') +
      fila('Total facturación Meta (USD)', usd(r.usd), 'sim-tot') + fila('Total facturación Meta (ARS)', ars(r.ars), 'sim-tot'));
    var spd = S.sem * SEM * r.spc;
    put('sm-umbral', spd > 0 ? 'Desde ' + ent(Math.ceil(FRANQ / spd)) + ' ' + esc(C.lead.toLowerCase()) + ' se agotan los 1.000 mensajes de servicio gratis del mes. Se renuevan el 1° de cada mes, por número de WhatsApp.'
      : 'Con este mix no se usan mensajes de servicio.');
    put('sm-graf', grafico());
    calcMrr();
  }
  function grafico() {
    var P = ESCALA.map(function (d) { var r = meta(d, S.sem); return S.graf === 'ars' ? r.ars : S.graf === 'uni' ? (r.mes > 0 ? r.ars / r.mes : 0) : r.usd; });
    var W = 560, H = 220, pl = 64, pb = 26, pt = 10, n = P.length, max = Math.max.apply(null, P) || 1;
    var x = function (i) { return pl + i * (W - pl - 10) / (n - 1); }, y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var f = function (v) { return S.graf === 'usd' ? fmt(v, 'USD') : fmt(v); };
    var ejes = [0, 0.5, 1].map(function (k) { var yy = y(max * k).toFixed(1);
      return '<line class="sim-gl" x1="' + pl + '" x2="' + (W - 10) + '" y1="' + yy + '" y2="' + yy + '"/><text class="sim-gt" x="' + (pl - 6) + '" y="' + yy + '" text-anchor="end" dy="3">' + esc(f(max * k)) + '</text>'; }).join('');
    var pts = P.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); });
    return '<svg class="fin-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Costo según ' + esc(SECT[S.sector].lead.toLowerCase()) + '">' + ejes +
      '<polygon class="sim-ga" points="' + x(0).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(n - 1).toFixed(1) + ',' + y(0) + '"/>' +
      '<polyline class="sim-gp" points="' + pts.join(' ') + '"/>' + P.map(function (v, i) {
        return '<circle class="sim-gc" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.5"><title>' + ESCALA[i] + ' por día: ' + esc(f(v)) + '</title></circle>' +
          '<text class="sim-gt" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + ESCALA[i] + '</text>'; }).join('') + '</svg>';
  }

  // ── pestaña 2 · Probalo en vivo ──────────────────────────────
  function htmlVivo() {
    var D = DEMOS[S.sector];
    return '<div class="sim-dos"><div class="card"><div class="u-row8"><div class="u-f1"><div class="card-t" id="sm-cli-v">' + esc(S.cli) + '</div><div class="hint">Asistente IA · En línea</div></div>' +
        '<div class="filtros u-mb0" role="group" aria-label="Conversación">' + ['A', 'B'].map(function (m) {
          return '<button class="ptab' + (m === S.modo ? ' on' : '') + '" data-sim="modo" data-k="' + m + '">' + esc(D[m][0]) + '</button>'; }).join('') + '</div></div>' +
        '<div class="sim-chat u-mt10" id="sm-chat"></div>' +
        '<div class="u-row8 u-mt10"><button class="btn bp sm" data-sim="paso">Siguiente paso</button><button class="btn bg sm" data-sim="reini">' + ico('recargar') + ' Reiniciar</button>' +
        '<span class="u-s11 u-c-mt u-mla" id="sm-cuenta"></span></div></div>' +
      '<div class="card"><div class="card-t">¿Cómo funciona el flujo inteligente?</div>' + [
        ['Mensaje entrante (WhatsApp Cloud API)', 'El cliente manda audio o texto. El webhook de Meta dispara el workflow en n8n en menos de 500 ms.'],
        ['Inteligencia y reglas del negocio', 'El agente interpreta la consulta, valida los datos necesarios y revisa la agenda o la disponibilidad en Supabase.'],
        ['Confirmación y reserva', 'Registra el turno o la reserva, le manda la tarjeta resumen al cliente y actualiza la planilla de gestión.'],
        ['Optimización de mensajes Meta', 'Diálogo conciso para aprovechar los 1.000 mensajes de servicio gratis de cada mes.']].map(function (x, i) {
          return '<div class="sim-paso"><span class="m u-c-bl">' + (i + 1) + '</span><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + x[1] + '</div></div></div>'; }).join('') +
        '<div class="hint u-mt10">Los mensajes del cliente son gratis. Servicio = respuesta del agente dentro de la conversación; plantilla = aviso que inicia el negocio (recordatorios, comprobantes).</div></div></div>';
  }
  function chat() {
    var L = DEMOS[S.sector][S.modo][1].slice(0, S.paso), c = $('sm-chat'); if (!c) return;
    c.innerHTML = L.map(function (m) {
      return '<div class="sim-msg sim-' + (m.q === 'u' ? 'u' : 'a') + '"><div>' + esc(m.t) + '</div>' +
        (m.c ? '<div class="sim-conf"><div class="u-c-ok u-fw6">' + ico('check') + ' ' + esc(m.c[0]) + '</div><div>' + esc(m.c[1]) + '</div><div class="u-c-mt">' + esc(m.c[2]) + '</div></div>' : '') +
        '<div class="sim-hora"><span class="m">' + m.h + '</span>' + (m.q === 's' ? ' · Servicio' : m.q === 'p' ? ' · Plantilla' : '') + '</div></div>';
    }).join('');
    c.scrollTop = c.scrollHeight;
    var k = function (q) { return L.filter(function (m) { return m.q === q; }).length; };
    put('sm-cuenta', 'Agente: ' + ent(k('s')) + ' servicio + ' + ent(k('p')) + (k('p') === 1 ? ' plantilla' : ' plantillas') + ' · Cliente: ' + ent(k('u')) + ' (gratis)');
  }

  // ── pestaña 3 · MRR y conveniencia ───────────────────────────
  function htmlMrr() {
    var lista = function (L) { return L.map(function (x) { return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + x[1] + '</div></div></div>'; }).join(''); };
    return '<div class="card u-mb12"><div class="card-t">Estimación de MRR y costo integral para el cliente</div>' +
        '<div class="hint">Definí tu abono mensual para contrastarlo con el costo proyectado de WhatsApp y ver cómo le queda la inversión final a <span id="sm-cli-m">' + esc(S.cli) + '</span>.</div>' +
        '<div class="g3 u-mt10"><div class="fg"><label class="fl" for="sm-mrr">Abono mensual (MRR en ARS)</label><input class="fc" type="number" min="0" step="10000" id="sm-mrr" value="' + S.mrr + '">' +
        '<div class="hint u-mt4" id="sm-mrr-eq"></div></div></div>' +
        '<div class="kpi-grid u-mt10"><div class="kpi k-abono"><div class="kpi-lbl">Mi abono (GIWA {IA})</div><div class="kpi-val" id="sm-k1"></div><div class="kpi-sub" id="sm-k1u"></div></div>' +
          '<div class="kpi k-pendiente"><div class="kpi-lbl">Costo WhatsApp (Meta)</div><div class="kpi-val" id="sm-k2"></div><div class="kpi-sub" id="sm-k2u"></div></div>' +
          '<div class="kpi k-contratado"><div class="kpi-lbl">Total inversión cliente</div><div class="kpi-val" id="sm-k3"></div><div class="kpi-sub" id="sm-k3u"></div></div>' +
          '<div class="kpi k-neutro"><div class="kpi-lbl">Costo total por ' + SECT[S.sector].unidad + '</div><div class="kpi-val" id="sm-k4"></div><div class="kpi-sub" id="sm-k4u"></div></div></div></div>' +
      '<div class="sec">¿Conviene hacerlo con n8n o con la IA de Meta?</div><div class="hint u-mb10">Qué arquitectura le resulta más conveniente al cliente, en lo técnico y en lo económico.</div>' +
      '<div class="sim-dos"><div class="card"><div class="u-row8"><div class="u-f1"><div class="card-t">n8n + LLM externo</div><div class="hint">Arquitectura GIWA {IA}</div></div><span class="u-c-ok u-s11">Más conveniente</span></div>' +
        lista([['Costo de tokens despreciable', 'La inferencia por API (Gemini u OpenAI) cuesta unos USD 0,0005 por conversación: alrededor de USD 0,40 por mes para 800 turnos.'],
               ['Ahorro en mensajes de Meta', 'n8n resume el diálogo en 6 a 8 mensajes precisos para aprovechar al máximo los 1.000 mensajes gratis del mes.'],
               ['Integración con las bases del cliente', 'Conexión directa en los dos sentidos con Supabase, Google Sheets, agendas y calendarios de los profesionales.'],
               ['Sin dependencia del proveedor', 'El cliente es dueño de su base de datos. Si Meta cambia los precios de la IA, su infraestructura no se ve afectada.']]) +
        '<div class="hint u-mt10">Conclusión: menor costo total para el cliente y control absoluto de los turnos.</div></div>' +
      '<div class="card"><div class="u-row8"><div class="u-f1"><div class="card-t">IA nativa de Meta</div><div class="hint">Meta AI Studio / Llama Assistant</div></div><span class="u-c-mt u-s11">Limitado</span></div>' +
        lista([['Tarifas inciertas', 'Meta planea cobros diferenciales o suscripciones para agentes de IA dentro de WhatsApp Business.'],
               ['Más consumo de mensajes', 'Un chat generativo libre, sin orquestación, suele necesitar 12 a 16 mensajes: agota rápido los 1.000 gratis y encarece la factura de Meta.'],
               ['Poca flexibilidad para integrar', 'Cuesta consultar agendas en tiempo real, validar obras sociales o actualizar Google Sheets.'],
               ['Dependencia del ecosistema Meta', 'Cualquier cambio de política en Meta Business puede alterar el bot sin aviso.']]) +
        '<div class="hint u-mt10">Conclusión: más caro para el cliente por exceso de mensajes y sin respaldo de agenda.</div></div></div>';
  }
  function calcMrr() {
    if (!S.ult || !$('sm-mrr')) return;
    var mu = S.tc > 0 ? S.mrr / S.tc : 0, ta = S.mrr + S.ult.ars, tu = mu + S.ult.usd, n = S.ult.n;
    put('sm-mrr-eq', 'Equivale a ' + usd(mu) + ' al TC de hoy');
    put('sm-k1', ars(S.mrr)); put('sm-k1u', usd(mu)); put('sm-k2', ars(S.ult.ars)); put('sm-k2u', usd(S.ult.usd));
    put('sm-k3', ars(ta)); put('sm-k3u', usd(tu)); put('sm-k4', ars(n ? ta / n : 0)); put('sm-k4u', usd(n ? tu / n : 0));
  }

  // ── pestaña 4 · Telegram ─────────────────────────────────────
  function htmlTg() {
    var c = function (t, L) { return '<div class="card"><div class="card-t">' + t + '</div>' + L.map(function (x) {
      return '<div class="sim-paso"><div><div class="u-fw6 u-s12">' + x[0] + '</div><div class="hint">' + x[1] + '</div></div></div>'; }).join('') + '</div>'; };
    return '<div class="sim-dos">' +
      c('WhatsApp Business Platform', [['Facturación', 'La factura Meta directo al cliente: 1.000 mensajes gratis y USD 0,026 por excedente.'],
        ['Adopción', 'Más del 98% de la población lo usa. Cero fricción.'], ['Tasa de respuesta', 'Más del 95% en los primeros 15 minutos.'],
        ['Veredicto', 'El canal estándar imprescindible para centros de salud y empresas.']]) +
      c('Telegram (bots)', [['Costo de mensajes', 'Telegram no cobra los mensajes, pero no es una solución a costo cero.'],
        ['Costos ocultos', 'Necesita igual un servidor 24/7, n8n y tokens de IA.'], ['Adopción', 'Baja en el público general y en pacientes.'],
        ['Veredicto', 'Útil para avisos internos del equipo; inviable como canal principal de turnos.']]) + '</div>';
  }

  function pintar(el) {
    if (_montado !== 'her') return;
    marcarSub('meta');
    el.innerHTML = '<div class="page-h"><div><h2>Simulador Costos Meta</h2><div class="page-s">WhatsApp Business API y gestión de turnos: cuánto factura Meta y cómo le queda al cliente.</div></div>' +
        '<div class="u-row8"><span class="u-s11 u-c-mt">Dólar oficial ' + ars(S.tc) + '</span>' +
        '<button class="btn bg sm" data-sim="imprimir">' + ico('documento') + ' Imprimir</button></div></div>' +
      '<div class="filtros" role="group" aria-label="Simulador">' + TABS.map(function (t) {
        return '<button class="ptab' + (t[0] === S.tab ? ' on' : '') + '" data-sim="tab" data-k="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      ({ calc: htmlCalc, vivo: htmlVivo, mrr: htmlMrr, tg: htmlTg }[S.tab])() +
      '<div class="hint u-mt10">Automatizar turnos no es sólo responder mensajes: es diseñar conversaciones eficientes y controlar el costo por atención.</div>';
    if (S.tab === 'calc' || S.tab === 'mrr') calcular();
    if (S.tab === 'vivo') chat();
  }

  VISTAS.her = async function (el, op) {
    if (!S.mix.length) sector('odontologia');
    await abrirModulo(el, { id: 'her', texto: 'Cargando Herramientas…', forzar: op && op.forzar, cargar: cargar,
      cargado: function () { return S.tc > 0; }, firma: function () { return String(S.tc); }, pintar: function () { pintar(el); } });
    el.oninput = function (ev) {
      if (_montado !== 'her') return;
      var t = ev.target, i = t.getAttribute('data-mix');
      if (i !== null) { S.mix[+i][t.getAttribute('data-f')] = parseFloat(t.value) || 0; return calcular(); }
      if (t.id === 'sm-imp') { S.impacto = +t.value; return calcular(); }
      if (t.id === 'sm-dia' || t.id === 'sm-sem') { S[t.id.slice(3)] = parseFloat(t.value) || 0; S.preset = -1; return calcular(); }
      if (t.id === 'sm-mrr') { S.mrr = parseFloat(t.value) || 0; return calcMrr(); }
      if (t.id === 'sm-cli') { S.cli = t.value.trim() || 'Centro Médico Vida'; return put('sm-cli-t', esc(S.cli)); }
    };
    el.onchange = function (ev) { if (ev.target.id === 'sm-franq') { S.franq = ev.target.checked; calcular(); } };
    el.onclick = function (ev) {
      if (_montado !== 'her') return;
      var b = ev.target.closest('[data-sim]'); if (!b) return;
      var a = b.getAttribute('data-sim'), k = b.getAttribute('data-k');
      if (a === 'tab') { S.tab = k; return pintar(el); }
      if (a === 'sector') { sector(k); return pintar(el); }
      if (a === 'preset') { var x = SECT[S.sector].presets[+b.getAttribute('data-i')]; S.preset = +b.getAttribute('data-i'); S.dia = x[1]; S.sem = x[2]; return pintar(el); }
      if (a === 'graf') { S.graf = k; return pintar(el); }
      if (a === 'modo') { S.modo = k; S.paso = 1; return pintar(el); }
      if (a === 'paso') { if (S.paso < DEMOS[S.sector][S.modo][1].length) S.paso++; return chat(); }
      if (a === 'reini') { S.paso = 1; return chat(); }
      if (a === 'imprimir') return window.print();
    };
  };
  VISTAS.her.irA = function (s) { if (SUBS.some(function (x) { return x[0] === s; })) pintar(document.getElementById('vista')); };
  VISTAS.her.precargar = cargar;
})();

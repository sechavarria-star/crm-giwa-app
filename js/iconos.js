/* Nació de _Iconos.html (Apps Script). Desde 30/10/2026 la única versión es ésta, la del repo. */
/* ══════════════════════════════════════════════════════════════
   LOS ÍCONOS · un solo set de línea para todas las pantallas
   Se incluye con: <?!= include("_Iconos") ?>  (después de _Estilos)

   Reemplaza a los emojis usados como ícono o semáforo: un emoji trae
   su propio color y no respeta la paleta. Éstos toman el del texto
   (currentColor), así el significado lo pone la clase: u-c-rd, bx xr…
   Mismo trazo que los SVG del menú lateral. 08/10/2026.

   ico('alerta')            → <svg class="ico">…</svg>
   ico('alerta','u-c-rd')   → con una clase de más
   ══════════════════════════════════════════════════════════════ */
var _ICO = {
  casa:       '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  personas:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  plata:      '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  tablero:    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  lista:      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  ajustes:    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  recargar:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  candado:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  info:       '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  edificio:   '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  persona:    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  whatsapp:   '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/><path d="M9.2 8.6c.3-.4.7-.4 1-.1l.8 1c.2.3.2.6 0 .9l-.4.5c.4.9 1.1 1.6 2 2l.5-.4c.3-.2.6-.2.9 0l1 .8c.3.3.3.7-.1 1-.7.7-1.7.9-2.6.4a7 7 0 0 1-3.5-3.5c-.5-.9-.3-1.9.4-2.6z"/>',   // globito con teléfono: sólo WhatsApp
  alerta:     '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  chat:       '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',   // globito con líneas: comentarios
  arriba:     '<polyline points="18 15 12 9 6 15"/>',
  medio:      '<line x1="5" y1="12" x2="19" y2="12"/>',
  abajo:      '<polyline points="6 9 12 15 18 9"/>',
  izquierda:  '<polyline points="15 18 9 12 15 6"/>',
  derecha:    '<polyline points="9 18 15 12 9 6"/>',
  check:      '<polyline points="20 6 9 17 4 12"/>',
  abrir:      '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  subir:      '<polyline points="16 9 12 5 8 9"/><line x1="12" y1="5" x2="12" y2="16"/><line x1="5" y1="20" x2="19" y2="20"/>',
  revisado:   '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  pausa:      '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>',
  play:       '<polygon points="7 4 19 12 7 20 7 4"/>',
  flecha:     '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  repetir:    '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  bandera:    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  arena:      '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  manana:     '<line x1="3" y1="12" x2="13" y2="12"/><polyline points="9 8 13 12 9 16"/><line x1="19" y1="9" x2="19" y2="15"/><line x1="16" y1="12" x2="22" y2="12"/>',   // flecha con «+»: pasar a mañana
  reloj:      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  mas:        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  buscar:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  filtro:     '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  codigo:     '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  documento:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  campana:    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  menu:       '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  lamparita:  '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  editar:     '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  borrar:     '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  cerrar:     '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  guardar:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  mail:       '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  clip:       '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  link:       '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  carpeta:    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  lineas:     '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  porcentaje: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
};
// ── Set «Íconos GIWA» (Claude outputs/iconos_giwa.html · 29/10/2026) ──
// Un ícono = un significado; línea fina 1,5 px, sin relleno. Pisa los de arriba con el mismo nombre.
Object.assign(_ICO, {
  check:      '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',                                   // Finalizar
  revisado:   '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',   // Ya revisado
  pausa:      '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',   // Detener
  chat:       '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h8"/><path d="M8 12h5"/>',   // Comentar
  editar:     '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  borrar:     '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  tarea:      '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14h6"/><path d="M12 11v6"/>',   // Agregar tarea
  ficha:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',   // Agendar reunión
  manana:     '<path d="M3 14h11"/><path d="m11 10 4 4-4 4"/><path d="M14 6h4"/><path d="M16 4v4"/><path d="M21 3v6"/>',   // Pasar a mañana (flecha + 1)
  reloj:      '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',                                                     // Agenda de hoy
  whatsapp:   '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2-1-1 1c-1.2-.5-2.2-1.5-2.8-2.8l1-1-1-2z"/>',
  mail:       '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  web:        '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  carpeta:    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',   // Drive
  campana:    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',   // Alertas
  alerta:     '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',                          // Por vencer / vencido
  factura:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/>',
  cobro:      '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  empresa:    '<path d="M15 11V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M7 22v-4h4"/><path d="M7 6h.01M11 6h.01M7 10h.01M11 10h.01"/><path d="M19 13v6"/><path d="M16 16h6"/>',
  contacto:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  mas:        '<path d="M5 12h14"/><path d="M12 5v14"/>',
  derecha:    '<path d="m9 18 6-6-6-6"/>',
  // Tipo de desarrollo (reemplaza la viñeta; toma el color del estado)
  t_robot:    '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  t_ciclo:    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  t_ventana:  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 4v4"/><path d="M10 4v4"/>',
  t_flujo:    '<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  t_caja:     '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  // Estado (C6 de GIWA_identidad_visual · 30/10/2026)
  e_rombo:    '<path d="M12 3 21 12 12 21 3 12z"/>',                                                    // Prospecto
  e_flechas:  '<path d="M4 8h15"/><path d="m15 4 4 4-4 4"/><path d="M20 16H5"/><path d="m9 12-4 4 4 4"/>',   // En negociación
  e_check:    '<path d="M20 6 9 17l-5-5"/>',                                                             // Aprobado
  e_play:     '<path d="M7 4v16l13-8z"/>',                                                               // En curso
  e_trebol:   '<circle cx="12" cy="7" r="3.5"/><circle cx="7" cy="13" r="3.5"/><circle cx="17" cy="13" r="3.5"/><path d="M12 13v8"/><path d="M9.5 21h5"/>',   // En garantía
  e_cuadrado: '<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor"/>',                   // Finalizado
  e_cruz:     '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',                                             // Rechazado
  e_pausa:    '<path d="M9 5v14"/><path d="M15 5v14"/>'                                                   // Detenido
});
// Ícono del tipo de desarrollo: Agente IA = robot · Mantenimiento = circulación · Web App = ventana ·
// Automatización = flujo · cualquier otro = caja
function icoTipoDes(it) {
  var t = String((it && (it.tipo || it.tipo_id)) || '').toUpperCase(), mant = it && it.es_mantenimiento;
  var n = mant || t === 'MM' || t === 'SOP' ? 't_ciclo' : (t === 'IA' || t === 'BOT') ? 't_robot' : t === 'APP' ? 't_ventana' : t === 'AUT' ? 't_flujo' : 't_caja';
  return ico(n, 'ico-tipo');
}
// En HTML fijo (sin JS que lo arme): <div data-ico="casa"></div> se llena solo.
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('[data-ico]').forEach(function(e){ e.innerHTML = ico(e.getAttribute('data-ico')); });
});
function ico(n, cls) {
  return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
         ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (_ICO[n] || '') + '</svg>';
}

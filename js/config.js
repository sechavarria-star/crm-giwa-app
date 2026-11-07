/* ══════════════════════════════════════════════════════════════════════
   config.js · a dónde se conecta la app
   ──────────────────────────────────────────────────────────────────────
   La clave es la PUBLICABLE de Supabase (sb_publishable_…): está hecha para
   ir en el navegador. Sin login no ve nada: los datos los protege RLS
   (crm_giwa.es_equipo(): logueado + activo en crm_giwa.usuarios).
   Nunca poner acá la service_role ni una sb_secret_.
   ══════════════════════════════════════════════════════════════════════ */
var CRM_CONFIG = {
  supabaseUrl: 'https://ofhiogczijhzkuqdjwvz.supabase.co',
  supabaseKey: 'sb_publishable_sHdrgf8l6HwnKgK38gWnFQ_fEEVgG4f',
  schema:      'crm_giwa',
  dominio:     'giwa-ia.com',
  // Botón nativo de Google (Google Identity Services, 06/11/2026): Google muestra «para ir a crm.giwa-ia.com»
  // y no la dirección de Supabase. Es el cliente OAuth del envoltorio del CRM viejo (público, no es un secreto);
  // tiene que figurar en Supabase › Authentication › Providers › Google › Client IDs.
  googleClientId: '527644613244-ul6hntt2bl0d4hktnd89k2g66qhpicms.apps.googleusercontent.com',
  // El CRM actual (el Apps Script, con su envoltorio de login): ahí siguen
  // las pantallas que todavía no pasaron a esta app. crm.giwa-ia.com es
  // ahora esta app; el viejo quedó en la dirección de GitHub Pages de crm-giwa.
  puente:      'https://script.google.com/macros/s/AKfycbwrmKKgA9eIDysGFNa1Hmn_0k-a4cBtq8rQZ62wj5pRTs4ABRfaxTMoqDLFiVnr_z6u/exec',   // Drive y Gmail: Puente.js del Apps Script
  crmViejo:    'https://sechavarria-star.github.io/crm-giwa/'
};

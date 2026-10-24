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
  // El CRM actual (el Apps Script, con su envoltorio de login): ahí siguen
  // las pantallas que todavía no pasaron a esta app. crm.giwa-ia.com es
  // ahora esta app; el viejo quedó en la dirección de GitHub Pages de crm-giwa.
  crmViejo:    'https://sechavarria-star.github.io/crm-giwa/'
};

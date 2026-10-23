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
  // El CRM actual (Apps Script detrás de crm.giwa-ia.com): ahí siguen las
  // pantallas que todavía no pasaron a esta app.
  crmViejo:    'https://crm.giwa-ia.com'
};

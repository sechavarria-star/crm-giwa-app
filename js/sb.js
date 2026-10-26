/* ══════════════════════════════════════════════════════════════════════
   sb.js · login y datos (Supabase)
   ──────────────────────────────────────────────────────────────────────
   Lo único que habla con Supabase. Las pantallas piden datos con db():

     const { data, error } = await db().from('proyectos').select('id,nombre');
     const { data } = await db().rpc('es_equipo');

   db() ya apunta al schema crm_giwa. Todo lo que no sea del equipo lo corta
   la base (RLS), no esta capa: acá no hay reglas de seguridad.

   Login: Google por Supabase Auth (el OAuth «GIWA {IA}» compartido de
   Giwa_Database). La sesión la guarda supabase-js en el navegador.
   ══════════════════════════════════════════════════════════════════════ */
var _SB = null;
var CRM_USUARIO = null;   // { mail, nombre, rol } del que está logueado

// Si Supabase rechazó el ingreso, vuelve con el motivo en la URL
// (#error=…&error_code=…&error_description=…). Se lee al cargar, antes de que
// supabase-js limpie la dirección: sin esto la pantalla volvía al login sin
// decir nada (pasó con Vicky el 26/10: las altas nuevas estaban cerradas).
var CRM_ERROR_LOGIN = (function () {
  var p = new URLSearchParams((location.hash.replace(/^#/, '') + '&' + location.search.replace(/^\?/, '')));
  if (!p.get('error') && !p.get('error_code')) return null;
  var codigo = p.get('error_code') || p.get('error') || '', det = p.get('error_description') || '';
  var TXT = {
    signup_disabled: 'Tu cuenta todavía no está creada en el CRM. Pedile a Administración que te dé de alta.',
    user_banned: 'Tu cuenta está bloqueada en el CRM.',
    access_denied: 'Google no autorizó el ingreso.'
  };
  if (/signups? not allowed/i.test(det)) codigo = 'signup_disabled';
  history.replaceState(null, '', location.pathname);   // que no quede el error en la dirección
  return (TXT[codigo] || 'No pudiste entrar.') + (det ? ' (' + det + ')' : '');
})();

function sb() {
  if (!_SB) _SB = supabase.createClient(CRM_CONFIG.supabaseUrl, CRM_CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return _SB;
}
function db() { return sb().schema(CRM_CONFIG.schema); }

// Vuelve a esta misma página después de elegir la cuenta de Google.
function entrarConGoogle() {
  return sb().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: location.origin + location.pathname,
      queryParams: { hd: CRM_CONFIG.dominio, prompt: 'select_account' }
    }
  });
}
async function salir() {
  try { await sb().auth.signOut(); } catch (e) {}
  CRM_USUARIO = null;
  location.hash = '';
  location.reload();
}

// ¿Hay sesión y es del equipo? Devuelve el usuario o un motivo para no dejarlo pasar.
//   { ok:true, usuario }  ·  { ok:false, motivo:'sin-sesion' | 'fuera-del-equipo' | 'error', detalle }
async function sesionDelEquipo() {
  const { data: { session } } = await sb().auth.getSession();
  if (!session) return { ok: false, motivo: 'sin-sesion' };
  const mail = String(session.user.email || '').toLowerCase();
  const eq = await db().rpc('es_equipo');
  if (eq.error) return { ok: false, motivo: 'error', detalle: eq.error.message };
  if (eq.data !== true) return { ok: false, motivo: 'fuera-del-equipo', detalle: mail };
  const u = await db().from('usuarios').select('mail,nombre,rol').eq('mail', mail).maybeSingle();
  CRM_USUARIO = u.data || { mail: mail, nombre: mail.split('@')[0], rol: '' };
  return { ok: true, usuario: CRM_USUARIO };
}

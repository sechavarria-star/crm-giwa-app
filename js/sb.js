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

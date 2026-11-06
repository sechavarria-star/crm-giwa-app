// ============================================================
// Edge Function: soporte-invitar
// Crea el usuario de Supabase Auth de un cliente habilitado en el portal de soporte
// (crm.giwa-ia.com/soporte). Etapa 5, 06/11/2026.
//
// El registro libre del Auth compartido (Giwa_Database) está apagado y crear un usuario
// requiere la service_role, que sólo vive acá (la inyecta Supabase en la función).
// No usa los mails de Auth (sus templates son de todo el proyecto y no se tocan): deja la
// invitación con el link al portal en la cola de soporte, que manda el cartero (etapa 6).
// Sin contraseña: el cliente entra con Google (Supabase vincula la cuenta porque el mail coincide y ya está confirmado) o con
// el link por mail del portal (signInWithOtp, shouldCreateUser:false).
//
// Acceso: Authorization: Bearer <access_token> de alguien del equipo (crm_giwa.usuarios,
// es_giwa y activo). Sólo crea usuarios para mails habilitados en crm_giwa.soporte_accesos.
// Pedido: POST {"mail": "cliente@empresa.com"} → {ok, ya_existia, portal}
// verify_jwt apagado a propósito: el preflight CORS no trae token; se valida adentro.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = ["https://crm.giwa-ia.com", "http://localhost:5173"];
const PORTAL = "https://crm.giwa-ia.com/soporte/";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "crm_giwa" },
});

class ErrorSoporte extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

function cors(origen: string | null) {
  return {
    "Access-Control-Allow-Origin": origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Quien llama tiene que ser del equipo de GIWA (la misma regla que crm_giwa.es_equipo)
async function delEquipo(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErrorSoporte("Falta la sesión.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) throw new ErrorSoporte("La sesión venció. Volvé a entrar.", 401);
  const mail = data.user.email.toLowerCase();
  const { data: u } = await admin.from("usuarios").select("mail").eq("mail", mail).eq("es_giwa", true).eq("activo", true).maybeSingle();
  if (!u) throw new ErrorSoporte("Sólo el equipo de GIWA puede invitar.", 403);
  return mail;
}

async function invitar(p: Record<string, unknown>) {
  const mail = String(p.mail ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new ErrorSoporte("Ese mail no es válido.");
  const { data: acc } = await admin.from("soporte_accesos").select("id, habilitado, empresa_id").eq("mail", mail).maybeSingle();
  if (!acc?.habilitado) throw new ErrorSoporte("Primero tildá «Puede entrar» para ese mail.");
  const { data: emp } = await admin.from("soporte_empresas").select("activo").eq("empresa_id", acc.empresa_id).maybeSingle();
  if (!emp?.activo) throw new ErrorSoporte("La empresa está pausada en el portal.");

  // Auth es compartido por todo el proyecto: si el mail ya tiene usuario (de este u otro panel), se usa ése
  let id: string | null = null, yaExistia = false;
  const { data, error } = await admin.auth.admin.createUser({ email: mail, email_confirm: true });
  if (!error) id = data.user.id;
  else if (/already|registered|exists/i.test(error.message)) {
    yaExistia = true;
    for (let page = 1; !id && page <= 20; page++) {
      const { data: l, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (e) throw e;
      id = l.users.find((u) => (u.email ?? "").toLowerCase() === mail)?.id ?? null;
      if (l.users.length < 1000) break;
    }
    if (!id) throw new ErrorSoporte("Ese mail ya tiene usuario en Supabase pero no lo encuentro. Revisalo en Authentication.");
  } else throw error;

  const { error: e2 } = await admin.from("soporte_accesos").update({ auth_user_id: id, invitado: new Date().toISOString() }).eq("id", acc.id);
  if (e2) throw e2;
  const { error: e3 } = await admin.rpc("soporte_mail_invitacion", { mail });
  return { ok: true, ya_existia: yaExistia, portal: PORTAL, mail_encolado: !e3 };
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...h, "Content-Type": "application/json" } });
  try {
    if (req.method !== "POST") throw new ErrorSoporte("Método no permitido.", 405);
    await delEquipo(req);
    return json(await invitar(await req.json().catch(() => ({}))));
  } catch (e) {
    if (e instanceof ErrorSoporte) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Error interno. Revisá los logs de la función." }, 500);
  }
});

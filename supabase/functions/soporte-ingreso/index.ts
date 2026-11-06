// ============================================================
// Edge Function: soporte-ingreso
// «Olvidé mi contraseña» del portal de soporte (crm.giwa-ia.com/soporte), por el cartero. 06/11/2026.
// Manda un mail con un botón (código de 1 día) para crear una contraseña nueva.
//
// No usa los mails de Supabase Auth: deja el mail en la cola de soporte
// (crm_giwa.soporte_mail_ingreso) y lo manda el cartero desde la cuenta de GIWA.
//
// Sólo para mails habilitados en el portal (soporte_accesos) de una empresa activa. Si
// todavía no tenía usuario de Auth, se lo crea (como «Crear usuario»). Siempre contesta lo
// mismo, haya o no acceso: no deja averiguar qué mails están dados de alta.
// Pedido: POST {"mail": "cliente@empresa.com"} → {ok: true}
// verify_jwt apagado: lo usa quien todavía no entró.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = ["https://crm.giwa-ia.com", "http://localhost:5173"];
const PORTAL = "https://crm.giwa-ia.com/soporte/";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "crm_giwa" },
});

function cors(origen: string | null) {
  return {
    "Access-Control-Allow-Origin": origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function mandarLink(mail: string) {
  const { data: acc } = await admin.from("soporte_accesos").select("id, habilitado, empresa_id, auth_user_id").eq("mail", mail).maybeSingle();
  if (!acc?.habilitado) return;
  const { data: emp } = await admin.from("soporte_empresas").select("activo").eq("empresa_id", acc.empresa_id).maybeSingle();
  if (!emp?.activo) return;
  if (!acc.auth_user_id) {
    const { data, error } = await admin.auth.admin.createUser({ email: mail, email_confirm: true });
    if (!error) await admin.from("soporte_accesos").update({ auth_user_id: data.user.id, invitado: new Date().toISOString() }).eq("id", acc.id);
    else if (!/already|registered|exists/i.test(error.message)) throw error;
  }
  // Un pedido cada 2 minutos: si no, el código nuevo dejaría sin efecto al del mail anterior sin mandar otro
  const { data: reciente } = await admin.from("soporte_mail_cola").select("id").eq("tipo", "ingreso").eq("para", mail)
    .gt("creado", new Date(Date.now() - 120000).toISOString()).limit(1);
  if (reciente?.length) return;
  // «Olvidé mi contraseña»: un código de 1 día; soporte-activar lo cambia por una sesión y el portal pide la nueva
  const codigo = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((x) => x.toString(16).padStart(2, "0")).join("");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo)))).map((x) => x.toString(16).padStart(2, "0")).join("");
  await admin.from("soporte_accesos").update({ activar_hash: hash, activar_vence: new Date(Date.now() + 864e5).toISOString() }).eq("id", acc.id);
  const { error: e2 } = await admin.rpc("soporte_mail_ingreso", { mail, link: PORTAL + "?activar=" + codigo });
  if (e2) throw e2;
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const p = await req.json().catch(() => ({}));
  const mail = String(p.mail ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "Escribí tu mail." }, 400);
  try { await mandarLink(mail); }
  catch (e) { console.error(e); return json({ error: "No pudimos mandar el link. Probá de nuevo en un rato." }, 500); }
  return json({ ok: true });
});

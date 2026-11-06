// ============================================================
// Edge Function: soporte-ingreso
// El link para entrar al portal de soporte (crm.giwa-ia.com/soporte), por el cartero. 06/11/2026.
//
// Supabase Auth mandaba el «Magic Link» desde noreply@mail.app.supabase.io, en inglés y a
// Correo no deseado. Acá se arma el link con auth.admin.generateLink (no manda nada) y se
// deja en la cola de mails de soporte (crm_giwa.soporte_mail_ingreso), que el cartero manda
// desde la cuenta de GIWA con el formato de los demás mails.
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
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: mail, options: { redirectTo: PORTAL } });
  if (error) throw error;
  const { error: e2 } = await admin.rpc("soporte_mail_ingreso", { mail, link: data.properties.action_link });
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

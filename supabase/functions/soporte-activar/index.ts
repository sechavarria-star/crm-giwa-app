// ============================================================
// Edge Function: soporte-activar
// «Activar portal» (invitación) y «Olvidé mi contraseña»: cambia el código del mail por una
// sesión de Supabase, para que el cliente cree su contraseña. 06/11/2026.
//
// El código lo arman soporte-invitar (7 días) y soporte-ingreso (1 día); en la base se guarda
// sólo su hash (crm_giwa.soporte_accesos.activar_hash / activar_vence). Se puede usar varias
// veces mientras no venza (un escáner de mails que abre el link no lo gasta).
// Pedido: POST {"codigo": "..."} → {token_hash, mail}  (el portal hace auth.verifyOtp con token_hash)
// verify_jwt apagado: lo usa quien todavía no entró.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = ["https://crm.giwa-ia.com", "http://localhost:5173"];
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "crm_giwa" },
});

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  const h = { "Access-Control-Allow-Origin": o && ORIGENES.includes(o) ? o : ORIGENES[0], "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
              "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  const p = await req.json().catch(() => ({}));
  const codigo = String(p.codigo ?? "");
  const vencido = { error: "Este link ya venció. Pedí uno nuevo con «Olvidé mi contraseña»." };
  if (codigo.length < 20) return json(vencido, 400);
  const { data: acc } = await admin.from("soporte_accesos").select("mail, empresa_id, habilitado, activar_vence")
    .eq("activar_hash", await sha256(codigo)).maybeSingle();
  if (!acc?.habilitado || !acc.activar_vence || new Date(acc.activar_vence) < new Date()) return json(vencido, 400);
  const { data: emp } = await admin.from("soporte_empresas").select("activo").eq("empresa_id", acc.empresa_id).maybeSingle();
  if (!emp?.activo) return json({ error: "Tu empresa no tiene el portal activo. Hablá con GIWA." }, 403);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: acc.mail });
  if (error) { console.error(error); return json({ error: "No pudimos activar el portal. Probá de nuevo en un rato." }, 500); }
  return json({ token_hash: data.properties.hashed_token, mail: acc.mail });
});

// ============================================================
// Edge Function: soporte-cartero
// La puerta del cartero (tools/cartero/Cartero.gs) a la cola de mails de soporte.
// Etapa 6, 06/11/2026.
//
// El cartero es un Apps Script en la cuenta que manda los mails: cada minuto pide
// los mails pendientes, los manda y avisa cómo le fue. No entra por la API pública
// (crm_giwa no se abre al rol anon): llama acá con la clave compartida, y esta función
// llama a crm_giwa.cartero_tomar / cartero_resultado con la service_role. La base
// vuelve a validar la clave (guarda sólo su hash; la genera Administración desde el CRM).
//
// Pedido: POST {"clave": "...", "accion": "tomar", "cuenta": "...", "cuota": 1500, "max": 25}
//         POST {"clave": "...", "accion": "resultado", "resultados": [{"id": 1, "ok": true}]}
// verify_jwt apagado: el cartero no tiene sesión de Supabase; se valida la clave.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "crm_giwa" },
});

Deno.serve(async (req) => {
  const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const p = await req.json().catch(() => ({}));
  const clave = String(p.clave ?? "");
  if (!clave) return json({ error: "Falta la clave." }, 401);
  let r;
  if (p.accion === "tomar") {
    r = await admin.rpc("cartero_tomar", { clave, cuenta: p.cuenta ?? null, cuota: p.cuota ?? null, max: p.max ?? 25 });
  } else if (p.accion === "resultado") {
    r = await admin.rpc("cartero_resultado", { clave, resultados: p.resultados ?? [] });
  } else return json({ error: "Acción desconocida." }, 400);
  if (r.error) return json({ error: /clave/i.test(r.error.message) ? "Clave inválida." : r.error.message }, /clave/i.test(r.error.message) ? 401 : 500);
  return json(r.data);
});

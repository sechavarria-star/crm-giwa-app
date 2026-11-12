# Bot de demo de Telegram (@GiwaDemoBot)

Demo para prospectos: el bot de tareas del CRM en una sesión de prueba propia (rubro «oficina»),
que se arranca desde el portal de demos. Lo armó Vicky (11/11/2026); guardado acá el 12/11/2026.

- **Edge Function:** `supabase/functions/demo-bot/index.ts` (publicada sin «Verify JWT»: Telegram no
  manda sesión; la base valida el encabezado `x-telegram-bot-api-secret-token`).
- **Base:** schema `demo` + `public.demo_portal` (anon: crea la sesión de prueba con consentimiento),
  `public.demo_admin` (cuentas @giwa-ia.com: token del bot, clave de Gemini, leads) y
  `public.demo_tg_recibir` (sólo service_role, la llama la Edge Function). `pg_cron` corre `demo.ciclo()` cada minuto.
- **`schema_demo.sql`** es una **foto** exportada de la base (estructura, funciones, permisos, cron), sin datos
  ni secretos. No es una migración: no se aplica sola. Si se cambia algo en la base, volver a exportarla.
- Secretos (token del bot, clave de Gemini, secreto del webhook) viven en `demo.secretos`, nunca en el código.

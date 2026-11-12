// demo-bot · recibe lo que manda Telegram a @GiwaDemoBot y se lo pasa a public.demo_tg_recibir.
// Toda la lógica y la validación del secreto están en la base (schema demo). Se publica sin «Verify JWT»:
// Telegram no manda sesión; se valida con el encabezado secreto que definió demo.conectar().
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok');
  const body = await req.json().catch(() => null);
  if (!body) return new Response('ok');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/demo_tg_recibir', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p: body, secreto: req.headers.get('x-telegram-bot-api-secret-token') || '' }),
  });
  if (!r.ok) {
    console.error('demo_tg_recibir', r.status, await r.text());
    return new Response('error', { status: 500 });   // Telegram reintenta; demo.updates descarta los repetidos
  }
  return new Response('ok');
});

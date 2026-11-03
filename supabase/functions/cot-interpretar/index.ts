// Lee una minuta o un README y dice qué módulos del catálogo tildar (= interpretarReadme del Apps Script).
// La clave de Gemini es un secreto de Supabase (GEMINI_API_KEY): nunca va al navegador.
// El catálogo se lee con la sesión de quien llama: si no es del equipo, las políticas de la base no devuelven nada.
const CORS = {
  'Access-Control-Allow-Origin': 'https://crm.giwa-ia.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const res = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return res({ ok: false, msg: 'Falta cargar el secreto GEMINI_API_KEY en Supabase.' });
    const { texto, tipo } = await req.json();
    if (String(texto || '').trim().length < 40) return res({ ok: false, msg: 'Escribí o pegá un poco más de texto.' });
    const url = Deno.env.get('SUPABASE_URL') + '/rest/v1/catalogo_modulos?select=id,etapa,nombre,pregunta,horas_base,factor&activo=eq.true&tipo_desarrollo_id=eq.' + encodeURIComponent(tipo || 'IA') + '&order=orden';
    const cat = await fetch(url, { headers: { Authorization: req.headers.get('Authorization') || '', apikey: Deno.env.get('SUPABASE_ANON_KEY') || '', 'Accept-Profile': 'crm_giwa' } });
    const mods = cat.ok ? await cat.json() : [];
    if (!mods.length) return res({ ok: false, msg: 'Sin acceso al catálogo.' }, 403);
    const valido = new Set(mods.map((m: { id: string }) => m.id));
    const lista = mods.map((m: { id: string; etapa: string; nombre: string; pregunta: string }) => `${m.id} | ${m.etapa} | ${m.nombre} | ${m.pregunta || ''}`).join('\n');
    const prompt = 'Sos el cotizador de GIWA. Del texto elegí SOLO módulos de este catálogo (id | etapa | nombre | pregunta):\n' + lista +
      '\n\nReglas: marcá sólo lo que el texto pide o da a entender con claridad; nada de infraestructura que no pida; varios roles = un solo portal con vistas; ' +
      'lo avanzado que el texto no detalla (OCR, RAG) va con opcional=true; WhatsApp e Instagram sólo si el texto los menciona. ' +
      'Listá los sistemas externos que nombra, con lo que dice de cada uno. wa_mensajes_mes: 0 si no lo dice.\n' +
      'Devolvé JSON: {"titulo":"...","modulos":[{"id":"...","opcional":bool,"motivo":"..."}],"sistemas":[{"nombre":"...","comentario":"..."}],"wa_mensajes_mes":n,' +
      '"propuesta":"texto corto para el cliente, lenguaje simple, sin tecnicismos, que destaque el mantenimiento mensual como lo que mantiene el sistema estable"}\n\nTEXTO:\n' + String(texto).slice(0, 30000);
    const g = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
    });
    if (!g.ok) return res({ ok: false, msg: 'Gemini respondió ' + g.status });
    const j = await g.json();
    const r = JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    return res({ ok: true, titulo: r.titulo || '', sistemas: r.sistemas || [], wa_msj: Number(r.wa_mensajes_mes) || 0, propuesta: r.propuesta || '',
      modulos: (r.modulos || []).filter((m: { id: string }) => valido.has(m.id)) });
  } catch (e) { return res({ ok: false, msg: String((e as Error).message || e) }, 500); }
});

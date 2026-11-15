// Lee una factura (PDF o imagen) y devuelve sus datos para revisar antes de guardar (14/11/2026).
// No inventa: lo que no se lee vuelve vacío y queda en «revisar». No guarda nada.
// La clave de Gemini la carga Victoria en Configuración (crm_giwa.secretos) y se lee acá con
// service_role (crm_giwa._clave_gemini); si no está, el secreto GEMINI_API_KEY. Nunca va al navegador.
// Sólo para el equipo: se pregunta a crm_giwa.es_equipo() con la sesión de quien llama.
const ORIGENES = ['https://crm.giwa-ia.com', 'http://localhost:5173'];
const cors = (o: string | null) => ({
  'Access-Control-Allow-Origin': o && ORIGENES.includes(o) ? o : ORIGENES[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const TIPOS = ['Factura A', 'Factura B', 'Factura C', 'Nota de crédito A', 'Nota de crédito B', 'Nota de crédito C',
  'Nota de débito A', 'Nota de débito B', 'Nota de débito C', 'Factura E', 'Recibo', 'Factura del exterior'];
const CAMPOS = ['tipo', 'numero', 'fecha', 'emisor_cuit', 'emisor_razon_social', 'receptor_cuit', 'receptor_razon_social',
  'moneda', 'total', 'cae', 'cae_vto'];

// CUIT: 11 dígitos y dígito verificador (módulo 11)
function cuitOk(c: string) {
  if (!/^\d{11}$/.test(c)) return false;
  const p = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = p.reduce((a, n, i) => a + n * Number(c[i]), 0);
  const v = 11 - (s % 11);
  return (v === 11 ? 0 : v === 10 ? 9 : v) === Number(c[10]);
}
async function claveGemini() {
  const sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/_clave_gemini', {
    method: 'POST', body: '{}',
    headers: { Authorization: 'Bearer ' + sr, apikey: sr, 'Content-Type': 'application/json', 'Content-Profile': 'crm_giwa', 'Accept-Profile': 'crm_giwa' },
  }).catch(() => null);
  const k = r && r.ok ? await r.json() : '';
  return (typeof k === 'string' && k) || Deno.env.get('GEMINI_API_KEY') || '';
}
const num = (x: unknown) => (x === null || x === undefined || x === '' || isNaN(Number(x)) ? null : Math.round(Number(x) * 100) / 100);
const txt = (x: unknown) => (x === null || x === undefined ? '' : String(x).trim());

Deno.serve(async (req: Request) => {
  const H = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const res = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  try {
    const key = await claveGemini();
    if (!key) return res({ ok: false, msg: 'Falta cargar la clave de Gemini (Configuración › Telegram).' });
    const eq =await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/es_equipo', {
      method: 'POST', body: '{}',
      headers: { Authorization: req.headers.get('Authorization') || '', apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
        'Content-Type': 'application/json', 'Content-Profile': 'crm_giwa', 'Accept-Profile': 'crm_giwa' },
    });
    if (!eq.ok || (await eq.text()).trim() !== 'true') return res({ ok: false, msg: 'Sin acceso.' }, 403);

    const { base64, mime } = await req.json();
    if (!base64 || !/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(String(mime))) return res({ ok: false, msg: 'Tiene que ser un PDF o una imagen (JPG, PNG).' });
    if (String(base64).length > 14_000_000) return res({ ok: false, msg: 'El archivo es muy grande (máximo 10 MB).' });

    const prompt = 'Sos un lector de comprobantes fiscales argentinos (AFIP/ARCA). Leé el documento y devolvé SOLO lo que figura escrito en él. ' +
      'Si un dato no se ve o no se puede leer con certeza, devolvé null: nunca lo deduzcas ni lo inventes. ' +
      'tipo: uno de ' + TIPOS.join(', ') + ' (la letra sale del recuadro grande A/B/C; el código 01/06/11 es factura, 03/08/13 nota de crédito, 02/07/12 nota de débito). ' +
      'Si la emite una empresa del exterior (sin CUIT argentino ni CAE, ej. un invoice de Supabase o Google), tipo = «Factura del exterior» y numero = el número del invoice. ' +
      'numero: «punto de venta-número», ej. 00005-00000048. fecha, cae_vto y vence_pago (vencimiento para el pago, «Due date»): AAAA-MM-DD. CUIT: sólo los 11 dígitos. ' +
      'moneda: ARS o USD. Importes como número con punto decimal, sin separador de miles. ' +
      'iva: una línea por alícuota discriminada (alicuota en %, base y monto); vacío si no discrimina IVA. otros: percepciones u otros impuestos.\n' +
      'JSON: {"tipo":"","numero":"","fecha":"","emisor_cuit":"","emisor_razon_social":"","emisor_condicion_iva":"",' +
      '"receptor_cuit":"","receptor_razon_social":"","receptor_condicion_iva":"","moneda":"","neto_gravado":0,"no_gravado":0,' +
      '"iva":[{"alicuota":21,"base":0,"monto":0}],"otros":[{"concepto":"","monto":0}],"total":0,"cae":"","cae_vto":"","vence_pago":"","detalle":""}';
    const g = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (!g.ok) return res({ ok: false, msg: 'Gemini respondió ' + g.status });
    const j = await g.json();
    const r = JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

    const d = {
      tipo: TIPOS.find((t) => t.toLowerCase() === txt(r.tipo).toLowerCase()) || '',
      numero: txt(r.numero), fecha: /^\d{4}-\d{2}-\d{2}$/.test(txt(r.fecha)) ? txt(r.fecha) : '',
      emisor_cuit: txt(r.emisor_cuit).replace(/\D/g, ''), emisor_razon_social: txt(r.emisor_razon_social), emisor_condicion_iva: txt(r.emisor_condicion_iva),
      receptor_cuit: txt(r.receptor_cuit).replace(/\D/g, ''), receptor_razon_social: txt(r.receptor_razon_social), receptor_condicion_iva: txt(r.receptor_condicion_iva),
      moneda: /usd|u\$s|d[oó]lar/i.test(txt(r.moneda)) ? 'USD' : /ars|\$|peso/i.test(txt(r.moneda)) ? 'ARS' : '',
      neto_gravado: num(r.neto_gravado), no_gravado: num(r.no_gravado),
      iva: (Array.isArray(r.iva) ? r.iva : []).map((x: Record<string, unknown>) => ({ alicuota: num(x.alicuota), base: num(x.base), monto: num(x.monto) })).filter((x: { monto: number | null }) => x.monto !== null),
      otros: (Array.isArray(r.otros) ? r.otros : []).map((x: Record<string, unknown>) => ({ concepto: txt(x.concepto), monto: num(x.monto) })).filter((x: { monto: number | null }) => x.monto !== null && x.monto !== 0),
      total: num(r.total), cae: txt(r.cae).replace(/\D/g, ''), cae_vto: /^\d{4}-\d{2}-\d{2}$/.test(txt(r.cae_vto)) ? txt(r.cae_vto) : '',
      vence_pago: /^\d{4}-\d{2}-\d{2}$/.test(txt(r.vence_pago)) ? txt(r.vence_pago) : '',
      detalle: txt(r.detalle).slice(0, 300),
      exterior: false,
    };
    // Del exterior: sin CUIT argentino del emisor; no se le piden CUIT, CAE ni receptor
    d.exterior = d.tipo === 'Factura del exterior' || d.tipo === 'Factura E' || (!d.emisor_cuit && !d.cae && !!d.emisor_razon_social);
    if (d.exterior && !d.tipo) d.tipo = 'Factura del exterior';

    // Para revisar: lo que falta y lo que no cierra
    const revisar: string[] = [];
    const nombres: Record<string, string> = { tipo: 'tipo', numero: 'número', fecha: 'fecha', emisor_cuit: 'CUIT del emisor', emisor_razon_social: 'razón social del emisor',
      receptor_cuit: 'CUIT del receptor', receptor_razon_social: 'razón social del receptor', moneda: 'moneda', total: 'total', cae: 'CAE', cae_vto: 'vencimiento del CAE' };
    const faltan = CAMPOS.filter((k) => !/^recibo$/i.test(d.tipo) || !/^cae/.test(k))
      .filter((k) => !d.exterior || !/^(cae|emisor_cuit|receptor_)/.test(k)).filter((k) => d[k as keyof typeof d] === '' || d[k as keyof typeof d] === null);
    if (faltan.length) revisar.push('No se pudo leer: ' + faltan.map((k) => nombres[k]).join(', '));
    if (d.emisor_cuit && !cuitOk(d.emisor_cuit)) revisar.push('El CUIT del emisor no es válido');
    if (d.receptor_cuit && !cuitOk(d.receptor_cuit)) revisar.push('El CUIT del receptor no es válido');
    if (d.total !== null && d.total <= 0) revisar.push('El total tiene que ser mayor a cero');
    const iva = d.iva.reduce((a: number, x: { monto: number | null }) => a + (x.monto || 0), 0);
    const otros = d.otros.reduce((a: number, x: { monto: number | null }) => a + (x.monto || 0), 0);
    if (d.total !== null && d.neto_gravado !== null && (iva || otros || d.no_gravado)) {
      const s = d.neto_gravado + (d.no_gravado || 0) + iva + otros;
      if (Math.abs(s - d.total) > 1) revisar.push('Neto + IVA + otros impuestos (' + s.toFixed(2) + ') no da el total (' + d.total.toFixed(2) + ')');
    }
    if (/ C$/.test(d.tipo) && iva > 0) revisar.push('Un comprobante C no discrimina IVA');
    if (d.cae && d.cae.length !== 14) revisar.push('El CAE tiene que tener 14 dígitos');
    return res({ ok: true, datos: d, revisar });
  } catch (e) { return res({ ok: false, msg: String((e as Error).message || e) }, 500); }
});

// api/pedidos.js (CommonJS, sin libs externas, login inline)
const CHESS_API_BASE = process.env.CHESS_API_BASE
  || 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

// Defaults que pediste:
const CHESS_USER = process.env.CHESS_USER || 'desarrrollos'; // 👈 tres 'r'
const CHESS_PASSWORD = process.env.CHESS_PASSWORD || '1234';

module.exports = async function handler(req, res) {
  try {
    const sessionCookie = await loginAndGetCookie();

    const { fechaDesde, fechaHasta, facturado, idReparto } = req.query;

    // endpoint principal + fallback
    const bases = [`${CHESS_API_BASE}/pedidos/`, `${CHESS_API_BASE}/Ventas/pedidos`];

    // Armamos query "amigable" para el backend:
    // - Muchos /pedidos aceptan: facturado (bool), fechaEntrega (día único), y a veces idReparto.
    // - Si nos dan un rango, mandamos 1 día (fechaDesde) solo para acotar y luego filtramos full server-side.
    const qs = new URLSearchParams();
    if (facturado === 'true' || facturado === 'false') qs.set('facturado', facturado);
    if (idReparto) qs.set('idReparto', idReparto);
    if (fechaDesde) qs.set('fechaEntrega', fechaDesde);

    let data = null;
    let status = 500;
    let text = '';

    for (const base of bases) {
      const url = `${base}?${qs.toString()}`;
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Cookie': sessionCookie, // 👈 siempre mandamos la sesión
        },
      });
      status = r.status;
      text = await r.text();
      if (status === 200) {
        try { data = JSON.parse(text); } catch { data = []; }
        break;
      }
    }

    if (status !== 200) {
      res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(text);
      return;
    }

    // Normalizamos a array
    const raw = Array.isArray(data) ? data
      : (Array.isArray(data?.data) ? data.data
      : (Array.isArray(data?.items) ? data.items : []));

    // Filtros server-side (por si el backend no tomó alguno)
    const inRange = (s) => {
      if (!fechaDesde || !fechaHasta) return true;
      const d = String(s || '').slice(0, 10);
      return d >= fechaDesde && d <= fechaHasta;
    };
    const eq = (a, b) => String(a ?? '') === String(b ?? '');

    const items = raw.filter(it => {
      const f = it.fechaEntrega || it.fechaPedido || it.fecha || it.fechaComprobante;
      const byDate = inRange(f);
      const byRep = idReparto ? (eq(it.idReparto, idReparto) || eq(it?.reparto?.id, idReparto) || eq(it?.repartoId, idReparto)) : true;
      const byFact = (facturado === 'true' || facturado === 'false')
        ? normalizeBool(it.facturado) === (facturado === 'true')
        : true;
      return byDate && byRep && byFact;
    });

    res.status(200).json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'FUNCTION_INVOCATION_FAILED', detail: String(err?.message || err) });
  }
};

// =============== helpers locales ===============
async function loginAndGetCookie() {
  // Intento principal: /auth/login con {usuario,password}
  const r = await fetch(`${CHESS_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ usuario: CHESS_USER, password: CHESS_PASSWORD }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Login failed ${r.status}: ${t}`);
  }

  // 1) Buscar sessionId en JSON
  let data = {};
  try { data = await r.json(); } catch {}
  if (data?.sessionId) {
    // formato usual en Java: JSESSIONID
    return data.sessionId.startsWith('JSESSIONID=')
      ? data.sessionId
      : `JSESSIONID=${data.sessionId}`;
  }

  // 2) O en Set-Cookie
  const setCookie = r.headers.get('set-cookie') || r.headers.get('Set-Cookie');
  if (setCookie) {
    const m = setCookie.match(/(JSESSIONID=[^;]+)/i);
    if (m) return m[1];
  }

  throw new Error('No se pudo extraer sessionId del login.');
}

function normalizeBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return !!v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true','t','1','si','sí','yes','y'].includes(s)) return true;
    if (['false','f','0','no','n'].includes(s)) return false;
  }
  return undefined;
}

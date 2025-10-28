// api/pedidos-repartos.js (CommonJS, sin libs externas, login inline)
const CHESS_API_BASE = process.env.CHESS_API_BASE
  || 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

const CHESS_USER = process.env.CHESS_USER || 'desarrrollos';
const CHESS_PASSWORD = process.env.CHESS_PASSWORD || '1234';

module.exports = async function handler(req, res) {
  try {
    const sessionCookie = await loginAndGetCookie();

    const { fechaDesde, fechaHasta, facturado } = req.query;

    const bases = [`${CHESS_API_BASE}/pedidos/`, `${CHESS_API_BASE}/Ventas/pedidos`];
    const qs = new URLSearchParams();
    if (facturado === 'true' || facturado === 'false') qs.set('facturado', facturado);
    if (fechaDesde) qs.set('fechaEntrega', fechaDesde);

    let data = [];
    for (const base of bases) {
      const url = `${base}?${qs.toString()}`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Cookie': sessionCookie },
      });
      if (r.status === 200) {
        try { data = await r.json(); } catch { data = []; }
        break;
      }
    }

    const list = Array.isArray(data) ? data
      : (Array.isArray(data?.data) ? data.data
      : (Array.isArray(data?.items) ? data.items : []));

    const uniq = new Map();
    for (const it of list) {
      const id = it?.idReparto ?? it?.reparto?.id ?? it?.repartoId;
      const ds = it?.dsReparto ?? it?.reparto?.descripcion ?? it?.reparto?.ds ?? it?.reparto?.nombre ?? String(id ?? '');
      if (id !== undefined && id !== null) {
        const k = String(id);
        if (!uniq.has(k)) uniq.set(k, { idReparto: k, dsReparto: ds || k });
      }
    }

    // Si viene rango completo, filtramos server-side por si el backend no lo hace
    const out = [...uniq.values()];
    res.status(200).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'FUNCTION_INVOCATION_FAILED', detail: String(err?.message || err) });
  }
};

// =============== helpers locales ===============
async function loginAndGetCookie() {
  const r = await fetch(`${CHESS_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ usuario: CHESS_USER, password: CHESS_PASSWORD }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Login failed ${r.status}: ${t}`);
  }

  let data = {};
  try { data = await r.json(); } catch {}
  if (data?.sessionId) {
    return data.sessionId.startsWith('JSESSIONID=')
      ? data.sessionId
      : `JSESSIONID=${data.sessionId}`;
  }

  const setCookie = r.headers.get('set-cookie') || r.headers.get('Set-Cookie');
  if (setCookie) {
    const m = setCookie.match(/(JSESSIONID=[^;]+)/i);
    if (m) return m[1];
  }

  throw new Error('No se pudo extraer sessionId del login.');
}

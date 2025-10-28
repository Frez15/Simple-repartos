// /api/pedidos.js
export default async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE || "https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1";
  const CHESS_USER = process.env.CHESS_USER || "";
  const CHESS_PASS = process.env.CHESS_PASS || "";

  try {
    const token = await tryLogin(CHESS_API_BASE, CHESS_USER, CHESS_PASS);

    const url = new URL(`${CHESS_API_BASE}/Ventas/pedidos`);
    // Mapeo de query params esperados por el backend
    const fechaDesde = req.query.fechaDesde;
    const fechaHasta = req.query.fechaHasta;
    const facturado = req.query.facturado; // "true" | "false" | undefined
    const idReparto = req.query.idReparto;

    if (fechaDesde) url.searchParams.set("fechaEntregaDesde", fechaDesde);
    if (fechaHasta) url.searchParams.set("fechaEntregaHasta", fechaHasta);
    if (facturado === "true" || facturado === "false") url.searchParams.set("facturado", facturado);
    if (idReparto) url.searchParams.set("idReparto", idReparto);

    const headers = { "Accept": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const r = await fetch(url, { headers });
    const text = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(r.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED", detail: String(err?.message || err) });
  }
}

// ---------- helpers ----------
async function tryLogin(base, user, pass) {
  if (!user || !pass) return null; // puede ser público en algunas instancias (poco probable)
  const candidates = [
    [`${base}/seguridad/login`, { usuario: user, contrasena: pass }],
    [`${base}/seguridad/login`, { usuario: user, password: pass }],
    [`${base}/seguridad/login`, { username: user, password: pass }],
    [`${base}/auth/login`,      { username: user, password: pass }],
    [`${base}/auth/login`,      { usuario: user, contrasena: pass }],
  ];
  for (const [url, body] of candidates) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.status === 200) {
        let data = {};
        try { data = await r.json(); } catch {}
        const token =
          data.token || data.accessToken || data.access_token || data.jwt || data.jwtToken ||
          parseBearer(r.headers.get("authorization"));
        if (token) return token;
      }
    } catch { /* siguiente candidato */ }
  }
  return null;
}

function parseBearer(h) {
  if (!h) return null;
  const s = String(h);
  if (s.toLowerCase().startsWith("bearer ")) return s.slice(7).trim();
  return null;
}

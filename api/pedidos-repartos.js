// /api/pedidos-repartos.js
export default async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE || "https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1";
  const CHESS_USER = process.env.CHESS_USER || "";
  const CHESS_PASS = process.env.CHESS_PASS || "";

  try {
    const token = await tryLogin(CHESS_API_BASE, CHESS_USER, CHESS_PASS);

    const url = new URL(`${CHESS_API_BASE}/Ventas/pedidos`);
    const fechaDesde = req.query.fechaDesde;
    const fechaHasta = req.query.fechaHasta;
    const facturado = req.query.facturado;

    if (fechaDesde) url.searchParams.set("fechaEntregaDesde", fechaDesde);
    if (fechaHasta) url.searchParams.set("fechaEntregaHasta", fechaHasta);
    if (facturado === "true" || facturado === "false") url.searchParams.set("facturado", facturado);

    const headers = { "Accept": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const r = await fetch(url, { headers });
    const data = await safeJson(r);

    const items = Array.isArray(data) ? data
      : (Array.isArray(data?.data) ? data.data
      : (Array.isArray(data?.items) ? data.items : []));

    const uniq = new Map();
    for (const it of items) {
      const id = pick(it, ["idReparto","reparto.id","repartoId"]);
      const ds = pick(it, ["dsReparto","reparto.descripcion","reparto.ds","reparto.nombre"]);
      if (id !== undefined && id !== null) {
        const key = String(id);
        if (!uniq.has(key)) uniq.set(key, { idReparto: id, dsReparto: ds ?? String(id) });
      }
    }
    res.status(200).json(Array.from(uniq.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FUNCTION_INVOCATION_FAILED", detail: String(err?.message || err) });
  }
}

// helpers
async function tryLogin(base, user, pass) {
  if (!user || !pass) return null;
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
    } catch {}
  }
  return null;
}

function parseBearer(h) {
  if (!h) return null;
  const s = String(h);
  if (s.toLowerCase().startsWith("bearer ")) return s.slice(7).trim();
  return null;
}

async function safeJson(r){
  try { return await r.json(); } catch { return {}; }
}

function pick(obj, candidates){
  for (const path of candidates){
    const val = get(obj, path);
    if (val !== undefined) return val;
  }
  return undefined;
}

function get(obj, path){
  try {
    return path.split(".").reduce((acc,k)=> (acc && typeof acc==="object") ? acc[k] : undefined, obj);
  } catch { return undefined; }
}

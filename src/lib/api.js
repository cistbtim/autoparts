export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });

// ── localStorage SWR cache ────────────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutes
const CACHE_PFX = "swr__";

const _cKey = (t, q) => `${CACHE_PFX}${t}__${q}`;

const _cRead = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { d, ts } = JSON.parse(raw);
    return (Date.now() - ts) < CACHE_TTL ? d : null;
  } catch { return null; }
};

const _cWrite = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({ d: data, ts: Date.now() }));
  } catch {
    // Quota exceeded (large tables like parts) — silently skip
  }
};

const _cInvalidate = (table) => {
  try {
    const prefix = `${CACHE_PFX}${table}__`;
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
  } catch (e) {
    /* ignore storage cleanup failures */
  }
};

const _cClearAll = () => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(CACHE_PFX)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
};
// ─────────────────────────────────────────────────────────────────────────────

const fetchAll = async (table, query = "") => {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const sep = query ? "&" : "";
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`;
    const resp = await fetch(url, { headers: H() });
    const text = await resp.text();
    let batch;
    try { batch = JSON.parse(text); } catch { break; }
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
};

let _demoMode = false;
let _onDemoBlock = null;
const _demoBlock = () => { _onDemoBlock?.(); return {}; };

export const setDemoMode = (isDemo, onBlock) => {
  _demoMode = isDemo;
  _onDemoBlock = onBlock;
};

export const api = {
  // Cache-first GET: instant if cached, else fetch all pages and cache result
  get: async (t, q = "") => {
    const key = _cKey(t, q);
    const cached = _cRead(key);
    if (cached !== null) return cached;
    const fresh = await fetchAll(t, q);
    _cWrite(key, fresh);
    return fresh;
  },

  // Fetch all pages, always fresh — no cache read or write (used for price/qty sync)
  fresh: (t, q = "") => fetchAll(t, q),

  // Single-page fetch — no loop, no cache. Used for first-paint of large tables.
  getFirst: async (t, q = "", limit = 200) => {
    const sep = q ? "&" : "";
    const url = `${SUPABASE_URL}/rest/v1/${t}?${q}${sep}limit=${limit}&offset=0`;
    const resp = await fetch(url, { headers: H() });
    try { return JSON.parse(await resp.text()); } catch { return []; }
  },

  // Row count only — no data transferred. Uses HEAD + Prefer:count=exact so
  // polling loops (e.g. "any new bookings?") stay cheap even on a tight interval.
  count: async (t, q = "") => {
    const url = `${SUPABASE_URL}/rest/v1/${t}?${q}`;
    const resp = await fetch(url, { method: "HEAD", headers: H({ Prefer: "count=exact" }) });
    const range = resp.headers.get("content-range") || "";
    const total = parseInt(range.split("/")[1], 10);
    return isNaN(total) ? 0 : total;
  },

  // Fetch remaining pages starting from startOffset.
  // Calls onPage(allExtraRowsSoFar) after each page arrives.
  // Returns all extra rows when done.
  loadRest: async (t, q = "", startOffset = 200, onPage = () => {}) => {
    const PAGE = 1000;
    let offset = startOffset;
    let extra = [];
    while (true) {
      const sep = q ? "&" : "";
      const url = `${SUPABASE_URL}/rest/v1/${t}?${q}${sep}limit=${PAGE}&offset=${offset}`;
      const resp = await fetch(url, { headers: H() });
      let batch;
      try { batch = JSON.parse(await resp.text()); } catch { break; }
      if (!Array.isArray(batch) || batch.length === 0) break;
      extra = extra.concat(batch);
      onPage(extra);
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
    return extra;
  },

  // Cache read/write/invalidate — lets callers prime, read, or bust the cache
  cacheGet: (t, q) => _cRead(_cKey(t, q)),
  cacheSet: (t, q, data) => _cWrite(_cKey(t, q), data),
  cacheInvalidate: (t) => _cInvalidate(t),
  cacheClearAll: () => _cClearAll(),

  upsert: async (t, d) => {
    if (_demoMode) return _demoBlock();
    const res = await (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H({ Prefer: "return=representation,resolution=merge-duplicates" }), body: JSON.stringify(d) })).json();
    _cInvalidate(t);
    return res;
  },

  patch: async (t, c, v, d) => {
    if (_demoMode) return _demoBlock();
    const res = await (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "PATCH", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(d) })).json();
    _cInvalidate(t);
    return res;
  },

  delete: async (t, c, v) => {
    if (_demoMode) return _demoBlock();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "DELETE", headers: H() });
    _cInvalidate(t);
    return res;
  },

  insert: async (t, d) => {
    if (_demoMode) return _demoBlock();
    const res = await (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(d) })).json();
    _cInvalidate(t);
    return res;
  },
};

// Upload a Blob/File to Supabase Storage and return the public URL.
export const uploadToStorage = async (bucket, path, blob, contentType = "image/jpeg") => {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": contentType, "x-upsert": "true" },
    body: blob,
  });
  if (!resp.ok) { const txt = await resp.text(); throw new Error(txt || resp.statusText); }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
};

// Delete an object from Supabase Storage given its public URL. Best-effort:
// returns true on success, false otherwise (e.g. Drive URLs, already gone).
export const deleteFromStorage = async (publicUrl) => {
  const m = (publicUrl || "").match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return false;
  const [, bucket, path] = m;
  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    return resp.ok;
  } catch { return false; }
};

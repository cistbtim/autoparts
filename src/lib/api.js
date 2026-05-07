export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });

// ── localStorage SWR cache ────────────────────────────────────────────────────
const CACHE_TTL   = 5 * 60 * 1000;   // 5 minutes
const CACHE_PFX   = "swr__";

const _cKey  = (t, q) => `${CACHE_PFX}${t}__${q}`;

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
    // Quota exceeded (large tables like parts) — silently skip caching
  }
};

// Remove every cached entry for a given table (called after any write)
const _cInvalidate = (table) => {
  try {
    const prefix = `${CACHE_PFX}${table}__`;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
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
  // Cache-first GET: returns cached data instantly if fresh, else fetches and caches
  get: async (t, q = "") => {
    const key = _cKey(t, q);
    const cached = _cRead(key);
    if (cached !== null) return cached;
    const fresh = await fetchAll(t, q);
    _cWrite(key, fresh);
    return fresh;
  },

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

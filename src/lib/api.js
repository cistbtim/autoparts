export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });

const fetchAll = async (table, query = "") => {
  const PAGE = 1000;
  let all = [], offset = 0;
  while (true) {
    const sep = query ? "&" : "";
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`;
    const batch = await (await fetch(url, { headers: H() })).json();
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
  get:    async (t, q = "") => fetchAll(t, q),
  upsert: async (t, d)      => { if (_demoMode) return _demoBlock(); return (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H({ Prefer: "return=representation,resolution=merge-duplicates" }), body: JSON.stringify(d) })).json(); },
  patch:  async (t, c, v, d) => { if (_demoMode) return _demoBlock(); return (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "PATCH", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(d) })).json(); },
  delete: async (t, c, v)   => { if (_demoMode) return _demoBlock(); return fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "DELETE", headers: H() }); },
  insert: async (t, d)      => { if (_demoMode) return _demoBlock(); return (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(d) })).json(); },
};

import { api } from "./api.js";

let _settings = {
  shop_name: "VelGenius", logo_url: "", logo_data: "", logo_h_login: 140,
  logo_h_sidebar: 36, logo_h_pdf: 70, logo_blend: "normal", currency: "TWD NT$",
  whatsapp: "", email: "", phone: "", address: "", city: "", country: "",
  // Dialing code (digits only, no +) for this deployment's country, e.g. "27" (South
  // Africa), "886" (Taiwan), "1" (USA). Used to turn a locally-typed number like
  // "0833927725" into the "27833927725" WhatsApp actually needs — see toWaPhone().
  whatsapp_country_code: "",
  tax_rate: 0, vat_number: "",
  invoice_prefix: "INV", credit_note_prefix: "CN", apps_script_url: "", vehicle_script_url: "",
  licence_renewal_agent_name: "", licence_renewal_agent_phone: "",
  // Per-province default agents — additive to the fallback pair above, never
  // replaces it: [{id, province, name, phone}, ...]. A workshop whose province
  // matches uses this instead of the global fallback.
  licence_renewal_agents: [],
  pos_manager_pin: "", worker_shared_secret: "",
};

export const getSettings = () => _settings;

export const updateSettings = (data) => { _settings = { ..._settings, ...data }; };

export const loadSettings = async () => {
  try {
    const r = await api.get("settings", "id=eq.1&select=*");
    if (Array.isArray(r) && r[0]) {
      _settings = { ..._settings, ...r[0] };
    }
  } catch (e) { console.warn("loadSettings error:", e); }
  return _settings;
};

export const curSym = (c) => { const s = (c || "").trim(); const i = s.lastIndexOf(" "); return i >= 0 ? s.slice(i + 1) : s; };
export const C = () => curSym(getSettings().currency || "TWD NT$");

import { api } from "./api.js";

let _settings = {
  shop_name: "AutoParts", logo_url: "", logo_data: "", logo_h_login: 140,
  logo_h_sidebar: 36, logo_h_pdf: 70, logo_blend: "normal", currency: "TWD NT$",
  whatsapp: "", email: "", phone: "", address: "", city: "", country: "",
  tax_rate: 0, vat_number: "",
  invoice_prefix: "INV", credit_note_prefix: "CN", apps_script_url: "", vehicle_script_url: "",
  licence_renewal_agent_name: "", licence_renewal_agent_phone: "",
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

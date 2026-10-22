import { C, getSettings } from "./settings.js";

// Return a Supabase Storage thumbnail URL via the render/image transform API
const _supThumb = (url, w = 400, q = 75) => {
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${w}&quality=${q}&resize=contain`;
};

// Convert any photo URL → thumbnail for card/grid display
const toImgUrl = (url) => {
  if (!url) return null;
  if (url.includes('/storage/v1/object/public/')) return _supThumb(url, 400, 75);
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};
export { toImgUrl };

// Convert Google Drive share link → thumbnail URL for saving to DB
export const toSaveUrl = (url) => {
  if (!url) return url;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  return url;
};

// Convert Google Drive link → direct view URL (no white border — for logos)
export const toLogoUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};

// Extract Google Drive file ID from any Drive URL format
export const extractDriveId = (url) => {
  if (!url) return null;
  const m = url.match(/thumbnail[?]id=([^&]+)/) ||
            url.match(/\/file\/d\/([^/?]+)/)     ||
            url.match(/[?&]id=([^&]+)/);
  if (m) return m[1];
  // Plain Drive file ID stored without a URL wrapper (25–44 base64url chars)
  if (/^[A-Za-z0-9_-]{25,}$/.test(url.trim())) return url.trim();
  return null;
};

// Strip cache-buster &t=... from Drive URLs before saving to DB
export const stripCacheBuster = (url) => url ? url.replace(/&t=\d+/, "") : url;

// Convert any URL → large image for lightbox
export const toFullUrl = (url) => {
  if (!url) return null;
  if (url.includes('/storage/v1/object/public/')) return _supThumb(url, 1200, 85);
  const mThumb = url.match(/thumbnail[?]id=([^&]+)/);
  if (mThumb) return `https://drive.google.com/thumbnail?id=${mThumb[1]}&sz=w800`;
  const mFile = url.match(/file\/d\/([^/?]+)/);
  if (mFile) return `https://drive.google.com/thumbnail?id=${mFile[1]}&sz=w800`;
  const mId = url.match(/[?&]id=([^&]+)/);
  if (mId) return `https://drive.google.com/thumbnail?id=${mId[1]}&sz=w800`;
  return url;
};

// Primary photo + any extra photos for a part, in lightbox order (upgraded to full-res)
export const partPhotoUrls = (p) => {
  let extra = p?.photos;
  if (!Array.isArray(extra)) { try { extra = JSON.parse(extra || "[]"); } catch { extra = []; } }
  return [p?.image_url, ...(extra || [])].filter(Boolean).map(toFullUrl);
};

// justbrakes.co.za only publishes a static /vehicles/{make}-pads landing page for
// these makes — everything else 404s — so only deep-link the ones confirmed live
// and fall back to their generic catalogue (has its own make/model picker) for
// any other make rather than sending staff to a dead page.
const JUST_BRAKES_MAKES = new Set([
  "AUDI", "BMW", "FIAT", "FORD", "HYUNDAI", "MERCEDES BENZ",
  "NISSAN", "OPEL", "RENAULT", "TOYOTA", "VOLKSWAGEN",
]);
const _jbNorm = (make) => (make || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
// Whether justBrakesUrl() lands on that make's own page vs. the generic catalogue —
// the generic catalogue's make search box has no URL param, so the caller needs to
// know when it should offer to copy the make name for the user to paste in instead.
export const justBrakesHasMakePage = (make) => JUST_BRAKES_MAKES.has(_jbNorm(make));
export const justBrakesUrl = (make) => {
  const norm = _jbNorm(make);
  if (!JUST_BRAKES_MAKES.has(norm)) return "https://justbrakes.co.za/catalogue";
  return `https://justbrakes.co.za/vehicles/${norm.toLowerCase().replace(/\s+/g, "-")}-pads`;
};

// safelinebrakes.co.za's Brake Finder is a pure JS/AJAX widget (WordPress admin-ajax.php
// with a nonce, Make/Series <select> dropdowns) — no static per-make pages and nothing
// reads a URL param, so unlike Just Brakes there's no deep link or auto-fill possible,
// just the one search page.
export const SAFELINE_BRAKES_URL = "https://safelinebrakes.co.za/part-finder/";

// nemigaparts.com/cat_spares — a VAG ETKA / Mercedes EPC / Porsche PET catalog mirror.
// Only these three systems have a real "search by VIN" form (confirmed by checking each
// brand's page directly — the 60+ "Cross Doc" brands there, e.g. Toyota/Honda/Ford, only
// have a part-number search, no VIN form), so only these get a deep VIN link; everything
// else falls back to the brand-picker hub page. BMW/Mini are deliberately excluded here —
// they're already covered by the existing RealOEM tile.
const NEMIGA_VIN_BRANDS = {
  AUDI: "etka/audi", VOLKSWAGEN: "etka/volkswagen", SEAT: "etka/seat", SKODA: "etka/skoda",
  MERCEDES: "epc/mercedes", OPEL: "epc/opel", VAUXHALL: "epc/vauxhall", SMART: "epc/smart",
  PORSCHE: "pet",
};
export const nemigaVinUrl = (vin, make) => {
  // decodeVin()'s make strings carry a "(DE)"-style country suffix and sometimes a
  // sub-model word (e.g. "Porsche Cayenne", "Mercedes-Benz Vans") — strip the suffix,
  // then match on the first word so those still resolve to the right brand.
  const norm = (make || "").replace(/\s*\([^)]*\)\s*$/, "").trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Škoda → Skoda
    .toUpperCase();
  const brandKey = Object.keys(NEMIGA_VIN_BRANDS).find(k => norm.startsWith(k) || norm.includes(k));
  if (!brandKey || !vin) return "https://nemigaparts.com/cat_spares/";
  const path = NEMIGA_VIN_BRANDS[brandKey];
  return `https://nemigaparts.com/cat_spares/${path}/vin/${encodeURIComponent(vin)}/`;
};

// VINs starting with "L" are Chinese-market vehicles (ISO 3779 country code) — gates the ChinaCarMart decoder.
export const isChineseVin = (vin) => /^L[A-Z0-9]{10,}$/i.test((vin || "").trim());
export const CHINACARMART_URL = "https://chinacarmart.com/pages/parts";

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtAmt = (n) => `${C()}${(n || 0).toLocaleString()}`;

// Postgres `timestamp without time zone` columns come back from PostgREST with no
// Z/offset suffix (e.g. "2026-07-20T19:58:27"). JS treats such strings as already
// local time, so they display un-converted instead of shifting from UTC — parse
// them as UTC explicitly so toLocaleString()/toLocaleDateString() convert correctly.
const parseUTC = (s) => {
  if (!s) return null;
  const str = String(s);
  const hasTZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(str);
  const d = new Date(hasTZ ? str : `${str}Z`);
  return isNaN(d) ? null : d;
};
export const fmtDT = (s, fallback = "") => { const d = parseUTC(s); return d ? d.toLocaleString() : fallback; };
export const fmtD  = (s, fallback = "") => { const d = parseUTC(s); return d ? d.toLocaleDateString() : fallback; };
// Combo items bundled into a workshop service preset (workshop_services.combo_items JSON)
export const parseComboItems = (svc) => {
  try { const a = JSON.parse(svc?.combo_items || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
};

let _idCounter = 0;
export const makeId = (prefix) => { _idCounter++; return `${prefix}-${Date.now()}-${_idCounter}`; };
export const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
// Strips regional-indicator flag emoji (legacy rows stored "Country 🇿🇦"; Windows renders those as literal "ZA")
export const stripFlag = (s) => (s || "").replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, "").trim();
export const detectGeoLocation = async () => {
  // Try browser GPS/WiFi positioning first — gives the real physical city.
  // IP-based lookup is unreliable in SA: mobile carriers route through Johannesburg
  // so every mobile user appears to be in Johannesburg regardless of actual location.
  const tryBrowserGeo = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 300000 }   // cache result for 5 min
    );
  });

  try {
    const { lat, lon } = await tryBrowserGeo();
    // Reverse geocode with OpenStreetMap Nominatim (free, no API key needed)
    const r = await (await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { "Accept-Language": "en" } }
    )).json();
    const a = r.address || {};
    const city = a.city || a.town || a.village || a.suburb || a.county || "";
    const province = a.state || a.state_district || "";
    const countryName = a.country || "";
    // Still fetch IP for the ip_address field
    let ip = "";
    try { ip = (await (await fetch("https://ipapi.co/json/")).json()).ip || ""; } catch {}
    return { city, province, country: countryName, countryFull: countryName, lat, lon, ip };
  } catch {
    // User denied permission or browser geo failed — fall back to IP-based lookup
    try {
      const g = await (await fetch("https://ipapi.co/json/")).json();
      let province = g.region || "";
      // ipapi.co's free tier often has no region for IPs outside a handful of countries.
      // Its lat/lon is usually still present, so reverse-geocode those via Nominatim —
      // same lookup the GPS path uses — to backfill the province for any country.
      if (!province && g.latitude && g.longitude) {
        try {
          const r = await (await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${g.latitude}&lon=${g.longitude}`,
            { headers: { "Accept-Language": "en" } }
          )).json();
          province = r.address?.state || r.address?.state_district || "";
        } catch {}
      }
      return {
        city: g.city || "",
        province,
        country: g.country_name || "",
        countryFull: g.country_name || "",
        lat: g.latitude || null,
        lon: g.longitude || null,
        ip: g.ip || ""
      };
    } catch {
      return { city: "", province: "", country: "", countryFull: "", lat: null, lon: null, ip: "" };
    }
  }
};

const WX_CODE = {0:"☀️ Clear",1:"🌤 Mainly clear",2:"⛅ Partly cloudy",3:"☁️ Overcast",45:"🌫 Fog",48:"🌫 Rime fog",51:"🌦 Light drizzle",53:"🌧 Drizzle",55:"🌧 Heavy drizzle",61:"🌧 Light rain",63:"🌧 Rain",65:"🌧 Heavy rain",71:"🌨 Light snow",73:"🌨 Snow",75:"❄️ Heavy snow",80:"🌦 Showers",81:"🌧 Heavy showers",82:"⛈ Violent showers",95:"⛈ Thunderstorm",96:"⛈ Thunderstorm",99:"⛈ Thunderstorm"};
export const fetchWeather = async (lat, lon) => {
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)).json();
    const cw = r.current_weather;
    if (!cw) return { label:"", code:null, temp:null };
    return { label:`${WX_CODE[cw.weathercode]||"🌡️"} ${cw.temperature}°C`, code:cw.weathercode, temp:cw.temperature };
  } catch { return { label:"", code:null, temp:null }; }
};

// Maps weather code + temperature to a named condition used for ad targeting
export const classifyWeather = (code, temp) => {
  if (code == null) return "any";
  if (code >= 95) return "rain";   // thunderstorm
  if (code >= 80) return "rain";   // showers
  if (code >= 71) return "snow";   // snow
  if (code >= 51) return "rain";   // drizzle / rain
  if (code >= 45) return "fog";    // fog
  if (temp != null && temp >= 32) return "hot";
  if (temp != null && temp <= 5)  return "cold";
  if (code <= 1)  return "clear";  // clear/sunny
  return "any";
};

// Turn a locally-typed number (e.g. "0833927725") into what WhatsApp actually needs
// (country code + number, no leading trunk zero — e.g. "27833927725"), using the
// deployment's configured dialing code (Settings → whatsapp_country_code). Numbers
// already typed with a country code (or a leading +) are left as-is.
export const toWaPhone = (phone, countryCode) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const cc = (countryCode || "").replace(/\D/g, "");
  if (!cc || digits.startsWith(cc)) return digits;
  return cc + digits.replace(/^0+/, "");
};
// countryCode override lets callers pass a more specific code (e.g. a workshop's own
// wsProfile.whatsapp_country_code) than the global Settings one — falls back to that
// global setting when omitted.
// Compare vehicle "make" strings ignoring case, spacing and punctuation — a job's
// vehicle_make often comes from a licence-disc scan ("Mercedes benz") that won't
// exact-match the vehicles catalog's own spelling ("MERCEDES-BENZ") even after
// lowercasing alone, silently breaking every make-based lookup against it.
export const normMake = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const waLink = (phone, msg, countryCode) => `https://wa.me/${toWaPhone(phone, countryCode || getSettings().whatsapp_country_code)}?text=${encodeURIComponent(msg)}`;
export const mailLink = (to, subj, body) => `mailto:${to || ""}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;

// ── Shared label print window ─────────────────────────────────────────────────
// Opens a 98×45mm (or custom size) label in a new browser window with a manual
// print button. Both workshop and scrapyard use this with different data shapes.
//
// data shape:
//   mode          'workshop' | 'scrapyard'
//   shopName      company / shop name
//   primaryId     JOB #123 or SP00001 (large ID on label)
//   qrData        string encoded into QR code
//   make          vehicle make (one line)
//   model         vehicle model (next line)
//   dateIn        date string shown under QR
//   reg           vehicle registration (workshop only)
//   customerName  (workshop only)
//   mechanic      (workshop only)
//   complaint     (workshop only, truncated)
//   partName      (scrapyard only)
//   tags          string[] (scrapyard only — condition, category, location, price)
//   (label size is chosen in the print window — see LABEL_PRESETS)
export function openLabelWindow(data) {
  const {
    mode = "workshop", shopName = "", primaryId = "",
    make = "", model = "", dateIn = "", qrData = "",
    reg = "", customerName = "", complaint = "", mechanic = "",
    partName = "", tags = [],
  } = data;

  const e = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData || primaryId)}&format=png`;
  const px = (mm) => Math.round(mm * 3.78);

  const rightHtml = mode === "workshop"
    ? `${reg ? `<div class="vreg">${e(reg)}</div>` : ""}
       <div class="mk">${e(make)}</div>
       <div class="md">${e(model)}</div>
       ${customerName ? `<div class="inf">${e(customerName)}</div>` : ""}
       ${mechanic    ? `<div class="inf">${e(mechanic)}</div>` : ""}
       ${complaint   ? `<div class="cmp">${e(complaint).slice(0, 90)}</div>` : ""}`
    : `<div class="pn">${e(partName)}</div>
       <div class="mk">${e(make)}</div>
       <div class="md">${e(model)}</div>
       ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${e(t)}</span>`).join("")}</div>` : ""}`;

  const sc = mode === "scrapyard";

  // Same two label sizes and QR-left / text-right design as the part and shelf labels.
  const build = (widthMm, heightMm, cols, presetId) => {
    const H = px(heightMm);
    const small = widthMm <= 45;
    const k = small ? 0.62 : 0.8; // font scale versus the old 98mm label
    const f = (n) => Math.max(6, Math.round(n * k * 10) / 10);
    const qrSz = small ? Math.round(H * 0.42) : 56;
    const leftW = qrSz + 8;
    const lw = (cols * widthMm - 2) / cols;
    const css = [
      "*{margin:0;padding:0;box-sizing:border-box}",
      "body{font-family:Arial,sans-serif;font-weight:bold;display:flex;flex-direction:column;align-items:center;min-height:100vh;background:#e5e7eb;gap:14px;padding:20px}",
      ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer}",
      SIZE_PICK_CSS,
      `.label{width:${lw}mm;height:${heightMm-2}mm;border:1.5px solid #000;background:#fff;display:flex;overflow:hidden;flex-shrink:0}`,
      ".row{display:flex;page-break-after:always}.label+.label{border-left-width:4.5px}",
      `.l{width:${leftW}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px;gap:2px;border-right:1px solid #bbb;background:#f8f8f8}`,
      `.qr{width:${qrSz}px;height:${qrSz}px}`,
      `.din{font-size:${f(21)}px;font-weight:bold;text-align:center;color:#222;line-height:1.2}`,
      ".r{flex:1;padding:2px 4px;display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;overflow:hidden}",
      `.sn{font-size:${f(sc?14:9)}px;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
      `.pid{font-size:${f(sc?26:20)}px;font-weight:900;font-family:monospace;letter-spacing:.5px;line-height:1.1;white-space:nowrap;overflow:hidden}`,
      `.vreg{font-size:${f(24)}px;font-weight:900;font-family:monospace;letter-spacing:1px;border:1.5px solid #111;padding:0 4px;border-radius:3px;display:inline-block;margin:1px 0;align-self:flex-start}`,
      `.mk,.md{font-size:${f(sc?20:14)}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
      `.pn{font-size:${f(22)}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
      `.inf{font-size:${f(12)}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
      `.cmp{font-size:${f(14)}px;font-weight:bold;color:#333;border-top:1px dashed #ccc;margin-top:2px;padding-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
      ".tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:2px}",
      `.tag{border:1px solid #666;border-radius:2px;padding:0 3px;font-size:${f(sc?14:9)}px;font-weight:bold}`,
      small ? ".sn,.inf,.cmp{display:none}" : "",
      `@page{size:${cols * widthMm}mm ${heightMm}mm;margin:1mm}`,
      "@media print{body{background:#fff;padding:0;gap:0;min-height:auto}.print-btn,.size-pick{display:none}}",
    ].join("");

    const one = `<div class="label"><div class="l"><img class="qr" src="${qrUrl}" alt="QR"/><div class="din">${e(dateIn)}</div></div>` +
      `<div class="r"><div class="sn">${e(shopName)}</div><div class="pid">${e(primaryId)}</div>${rightHtml}</div></div>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label</title><style>${css}</style></head><body>` +
      `<button class="print-btn" onclick="window.print()">&#128424; Print / Save PDF</button>` +
      labelSizePickHtml(presetId) +
      `<div class="row">${one.repeat(cols)}</div>` +
      `</body></html>`;
  };

  const first = getLabelPreset();
  const win = window.open("", "_blank", `width=${Math.max(px(first.w * first.cols) + 100, 480)},height=${Math.max(px(first.h) + 200, 360)}`);
  if (!win) return;
  win.__relabel = (id) => {
    const p = LABEL_PRESETS.find(x => x.id === id) || first;
    setLabelPreset(p.id);
    win.document.open();
    win.document.write(build(p.w, p.h, p.cols, p.id));
    win.document.close();
  };
  win.document.write(build(first.w, first.h, first.cols, first.id));
  win.document.close();
}

// ── LABEL SIZES (shared by every label printer) ────────────────
// The whole app prints on two label stocks only. The choice is picked from a dropdown in the
// print window and remembered, so part, job/scrapyard and shelf labels all follow it.
export const LABEL_PRESETS = [
  { id: "50x50", label: "50×50mm", w: 50, h: 50, cols: 1 },
  { id: "40x30", label: "40×30mm · 2 across", w: 40, h: 30, cols: 2 },
];
export function getLabelPreset() {
  let id = "";
  try { id = localStorage.getItem("labelPreset") || ""; } catch { /* storage blocked */ }
  return LABEL_PRESETS.find(p => p.id === id) || LABEL_PRESETS[0];
}
function setLabelPreset(id) {
  try { localStorage.setItem("labelPreset", id); } catch { /* storage blocked */ }
}
function labelSizePickHtml(presetId) {
  return `<label class="size-pick">Label size <select onchange="window.__relabel(this.value)">${LABEL_PRESETS.map(p => `<option value="${p.id}"${p.id === presetId ? " selected" : ""}>${p.label}</option>`).join("")}</select></label>`;
}
const SIZE_PICK_CSS = ".size-pick{font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}.size-pick select{font-size:13px;padding:5px 8px}";

// ── PART LABEL PRINTER ─────────────────────────────────────────
// labels: [{sku, name, binLocation, supplierCode, invoiceNo, seq, total}]
// Options: widthMm, heightMm, shopName
export function openPartLabelsWindow(labels, { shopName = "", win = null } = {}) {
  if (!labels?.length) { win?.close(); return; }
  const e = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const px = (mm) => Math.round(mm * 3.78);

  const presets = LABEL_PRESETS;

  const build = (widthMm, heightMm, cols, presetId) => {
  const W = px(widthMm); const H = px(heightMm);
  // Small labels: smaller QR and fonts, drop the low-value lines so the SKU stays readable.
  const small = widthMm <= 45;        // 40×30
  const square = !small && widthMm <= 60; // 50×50
  const compact = small || square;
  // QR is kept small so the text column (the SKU above all) gets the width
  const qrSz = small ? Math.round(H * 0.42) : square ? 48 : Math.min(Math.round(H * 0.4), 56);
  const leftW = qrSz + (compact ? 6 : 10);
  const fs = small
    ? { sku: 17, pn: 9, fit: 8, oe: 7, bin: 11, sup: 11 }
    : square
      ? { sku: 22, pn: 11, fit: 9, oe: 8, bin: 14, sup: 14 }
      : { sku: 39, pn: 18, fit: 12, oe: 10, bin: 18, sup: 18 };
  const lw = (cols * widthMm - 2) / cols; // printed label width (mm) so a row fits the page

  const css = [
    "*{margin:0;padding:0;box-sizing:border-box}",
    "body{font-family:Arial,sans-serif;font-weight:bold;background:#e5e7eb;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px}",
    ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px}",
    ".size-pick{font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}.size-pick select{font-size:13px;padding:5px 8px}",
    `.row{display:flex;page-break-after:always}`,
    // Same mm size on screen as in print, so the auto-fit measured on screen is what prints
    `.label{width:${lw}mm;height:${heightMm-2}mm;border:1.5px solid #000;background:#fff;display:flex;overflow:hidden;flex-shrink:0}`,
    `.l{width:${leftW}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${compact?2:4}px;gap:2px;border-right:1px solid #bbb;background:#f8f8f8}`,
    `.qr{width:${qrSz}px;height:${qrSz}px}`,
    // Divider between two labels on one row: double the normal 3px (two touching 1.5px borders) line
    ".label+.label{border-left-width:4.5px}",
    ".label.blank{background:transparent;border-style:dashed;border-color:#999}@media print{.label.blank{border-color:transparent}}",
    `.r{flex:1;padding:${compact?"2px 4px":"4px 7px"};display:flex;flex-direction:column;justify-content:center;gap:${compact?1:2}px;min-width:0;overflow:hidden}`,
    ".sn{font-size:7px;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    `.sku{font-size:${fs.sku}px;font-weight:900;font-family:monospace;letter-spacing:${compact?0:.8}px;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.pn{font-size:${fs.pn}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333}`,
    // Make / model wraps onto a second line instead of being cut to "…"
    `.fit{font-size:${fs.fit}px;font-weight:bold;color:#1e40af;line-height:1.15;word-break:break-word}`,
    `.oe{font-size:${fs.oe}px;font-weight:bold;font-family:monospace;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.bin{font-size:${fs.bin}px;font-weight:900;color:#1d4ed8;background:#dbeafe;border-radius:3px;padding:1px 5px;display:inline-block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:${compact?0:2}px}`,
    `.bin-blank{height:${compact?14:22}px;border:1.5px solid #999;border-radius:3px;background:#fff;margin-top:${compact?0:2}px}`,
    `.sup{font-size:${fs.sup}px;font-weight:bold;color:#7c3aed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    // 40×30 is too small for the shop name / fitment / OE / invoice lines — keep SKU, name, bin, supplier
    small ? ".sn{display:none}" : "",
    // Small labels: a long SKU wraps onto a second line (font shrinks until it fits 2 lines) instead of shrinking tiny on one
    compact ? ".sku{white-space:normal;word-break:break-all;max-height:2.2em;text-overflow:clip}" : "",
    // The 1/2 counter sits centred
    compact ? ".inv-row{justify-content:center;gap:6px}.invno{display:none}" : "",
    ".inv-row{display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #ccc;margin-top:2px;padding-top:2px}",
    ".invno{font-size:8px;color:#555;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".seq{font-size:11px;font-weight:900;color:#059669;font-family:monospace;white-space:nowrap;flex-shrink:0}",
    `@page{size:${cols * widthMm}mm ${heightMm}mm;margin:1mm}`,
    `@media print{body{background:#fff;padding:0;gap:0}.print-btn,.size-pick{display:none}.label{border:1.5px solid #000;width:${lw}mm;height:${heightMm-2}mm}}`,
  ].join("");

  const labelsHtml = labels.map(lbl => {
    const qrData = lbl.sku || lbl.name || "";
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}&format=png`;
    return `<div class="label">
      <div class="l"><img class="qr" src="${qrUrl}" alt="QR"/></div>
      <div class="r">
        <div class="sn">${e(shopName)}</div>
        <div class="sku">${e(lbl.sku||lbl.name)}</div>
        ${lbl.name&&lbl.sku?`<div class="pn">${e(lbl.name)}</div>`:""}
        ${(lbl.make||lbl.model||lbl.yearRange)?`<div class="fit">${e([lbl.make,lbl.model,lbl.yearRange].filter(Boolean).join(" · "))}</div>`:""}
        ${lbl.binLocation?`<div class="bin">${e(lbl.binLocation)}</div>`:"<div class=\"bin-blank\"></div>"}
        ${lbl.supplierCode?`<div class="sup">${e(lbl.supplierCode)}</div>`:""}
        ${(lbl.invoiceNo||lbl.seq)?`<div class="inv-row"><span class="invno">${lbl.invoiceNo?e(lbl.invoiceNo):""}</span><span class="seq">${lbl.seq?e(lbl.seq):""}</span></div>`:""}
      </div>
    </div>`;
  });
  // Group into rows of `cols` labels (one printed page per row)
  const rowsHtml = [];
  for (let i = 0; i < labelsHtml.length; i += cols) {
    const cells = labelsHtml.slice(i, i + cols);
    // Odd count on a 2-across roll: fill the empty slot with a blank label so the row is always full-size and prints correctly
    while (cells.length < cols) cells.push(`<div class="label blank"></div>`);
    rowsHtml.push(`<div class="row">${cells.join("")}</div>`);
  }

  // Fixed font sizes (bumped up earlier for readability) truncate with "..." once
  // a SKU/name is too long to fit — shrink each label's own text independently
  // instead, so the full SKU/name/bin always actually prints, same auto-fit trick
  // openShelfLabelWindow already uses for its bin name.
  // Compare the element against ITS OWN clientWidth (its fixed layout box), not a
  // width computed from the parent's padding — that math was off by the parent's
  // own 7px-each-side padding, so the loop stopped a few px too early and text
  // still overflowed into the ellipsis.
  const fitScript = `
    (function(){
      function squeeze(el){
        // A wider monospace font on some device/OS can still overflow even at the
        // smallest readable size — as a last resort, squeeze it horizontally by
        // the exact measured ratio so it is GUARANTEED to fit completely, never
        // truncates, regardless of font metrics. text-overflow:ellipsis is a
        // LAYOUT-time decision (computed before any transform is even applied),
        // so scaling alone can't undo it — it must be turned off here too, or the
        // text gets truncated to "…" first and THEN scaled, still incomplete.
        if(el.scrollWidth>el.clientWidth){
          var ratio=(el.clientWidth/el.scrollWidth)*0.97;
          el.style.overflow='visible';
          el.style.textOverflow='clip';
          el.style.transformOrigin='left center';
          el.style.transform='scaleX('+ratio+')';
        }
      }
      function fit(el, minSize){
        if(!el) return minSize;
        var sz = parseFloat(getComputedStyle(el).fontSize);
        while(sz>minSize && (el.scrollWidth>el.clientWidth || el.scrollHeight>el.clientHeight+1)){
          sz -= 0.5;
          el.style.fontSize = sz+'px';
        }
        squeeze(el);
        return sz;
      }
      // Fitting each label independently made a batch look inconsistent — a short
      // SKU stays big while a long one shrinks small. Fit every label's own worst
      // case first, then re-apply the SMALLEST resulting size to all of them, so
      // the whole batch prints at one uniform size (still guaranteed to fit,
      // since every other label already fit fine at its own larger size, so it
      // fits even better at this smaller shared one).
      function fitUniform(selector, minSize){
        var els = [];
        document.querySelectorAll('.label').forEach(function(label){
          var el = label.querySelector(selector);
          if(el) els.push(el);
        });
        if(!els.length) return;
        var uniform = null;
        els.forEach(function(el){
          var sz = fit(el, minSize);
          if(uniform===null || sz<uniform) uniform = sz;
        });
        els.forEach(function(el){
          el.style.transform=''; el.style.overflow=''; el.style.textOverflow='';
          el.style.fontSize = uniform+'px';
          squeeze(el); // safety net only — shouldn't trigger, every label already fit at >= uniform
        });
      }
      var SEL = ['.sku','.pn','.bin','.sup','.oe'];
      function run(){
        // Clear any earlier fit first — the print layout is a different size from the
        // on-screen one, so it must be measured again at print time (otherwise the
        // SKU that fit on screen gets cut to "…" on the printed label).
        document.querySelectorAll(SEL.join(',')).forEach(function(el){
          el.style.transform=''; el.style.overflow=''; el.style.textOverflow=''; el.style.fontSize='';
        });
        fitUniform('.sku', 6);
        fitUniform('.pn', 6);
        fitUniform('.bin', 7);
        fitUniform('.sup', 6);
        fitUniform('.oe', 5);
      }
      run();
      window.addEventListener('beforeprint', run);
      if(window.matchMedia){ var mq=window.matchMedia('print'); if(mq.addEventListener) mq.addEventListener('change', function(){ run(); }); }
    })();
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Part Labels</title><style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">&#128424; Print ${labels.length} Label${labels.length>1?"s":""}</button>
    ${labelSizePickHtml(presetId)}
    ${rowsHtml.join("")}
    <script>${fitScript}<\/script>
  </body></html>`;
  return html;
  };

  const first = getLabelPreset();
  const html = build(first.w, first.h, first.cols, first.id);
  const W = px(first.w); const H = px(first.h);

  // A caller with a long await chain before this point (e.g. saving dozens of
  // line items one at a time) can pass in a window already opened synchronously
  // at click-time — window.open() itself is what browsers gate on user-gesture
  // freshness, but writing into an already-open window isn't restricted.
  const w = win || window.open("", "_blank", `width=${Math.max(W+100,480)},height=${Math.max(H*3+200,500)}`);
  if (!w) return;
  // Size dropdown in the print window re-renders the whole page with the chosen preset
  w.__relabel = (id) => {
    const p = presets.find(x => x.id === id) || first;
    setLabelPreset(p.id);
    w.document.open();
    w.document.write(build(p.w, p.h, p.cols, p.id));
    w.document.close();
  };
  w.document.write(html);
  w.document.close();
}

// ── SHELF / BIN LABEL PRINTER ──────────────────────────────────
// Same two label sizes (and same QR-left / text-right design) as every other label.
export function openShelfLabelWindow({ binName, description = "" } = {}) {
  if (!binName) return;
  const e = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const px = (mm) => Math.round(mm * 3.78);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent("#"+binName)}&format=png`;

  const build = (widthMm, heightMm, cols, presetId) => {
    const H = px(heightMm);
    const small = widthMm <= 45;
    const qrSz = small ? Math.round(H * 0.42) : 48;
    const leftW = qrSz + 8;
    const maxFontSize = small ? 26 : 40;
    const descFontSize = small ? 8 : 10;
    const lw = (cols * widthMm - 2) / cols;
    const css = [
      "*{margin:0;padding:0;box-sizing:border-box}",
      "body{font-family:Arial,sans-serif;background:#e5e7eb;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px}",
      ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px}",
      SIZE_PICK_CSS,
      ".row{display:flex;page-break-after:always}",
      `.label{width:${lw}mm;height:${heightMm-2}mm;border:1.5px solid #000;background:#fff;display:flex;overflow:hidden;flex-shrink:0}`,
      ".label+.label{border-left-width:4.5px}",
      `.l{width:${leftW}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:2px;border-right:1px solid #bbb;background:#f8f8f8}`,
      `.qr{width:${qrSz}px;height:${qrSz}px;display:block}`,
      ".r{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 4px;overflow:hidden;min-width:0}",
      ".bn{font-weight:900;font-family:monospace;letter-spacing:1px;color:#111;text-align:center;line-height:1;white-space:nowrap;display:inline-block}",
      `.desc{font-size:${descFontSize}px;font-weight:bold;color:#555;text-align:center;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-transform:uppercase;letter-spacing:.05em}`,
      `@page{size:${cols * widthMm}mm ${heightMm}mm;margin:1mm}`,
      "@media print{body{background:#fff;padding:0;gap:0}.print-btn,.size-pick{display:none}}",
    ].join("");

    // JS in the popup auto-shrinks the bin name until the whole name fits the text panel
    const fitScript = `
      (function(){
        function run(){
          document.querySelectorAll('.bn').forEach(function(el){
            var c=el.parentNode, maxW=c.clientWidth-8;
            var sz=${maxFontSize};
            el.style.fontSize=sz+'px';
            while(sz>6&&el.scrollWidth>maxW){ sz--; el.style.fontSize=sz+'px'; }
          });
        }
        run();
        window.addEventListener('beforeprint', run);
      })();
    `;

    const one = `<div class="label">
      <div class="l"><img class="qr" src="${qrUrl}" alt="QR"/></div>
      <div class="r">
        <div class="bn">${e(binName)}</div>
        ${description?`<div class="desc">${e(description)}</div>`:""}
      </div>
    </div>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shelf Label</title><style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">&#128424; Print Label</button>
    ${labelSizePickHtml(presetId)}
    <div class="row">${one.repeat(cols)}</div>
    <script>${fitScript}<\/script>
  </body></html>`;
  };

  const first = getLabelPreset();
  const win = window.open("", "_blank", `width=${Math.max(px(first.w * first.cols)+100,480)},height=${Math.max(px(first.h)+200,360)}`);
  if (!win) return;
  win.__relabel = (id) => {
    const p = LABEL_PRESETS.find(x => x.id === id) || first;
    setLabelPreset(p.id);
    win.document.open();
    win.document.write(build(p.w, p.h, p.cols, p.id));
    win.document.close();
  };
  win.document.write(build(first.w, first.h, first.cols, first.id));
  win.document.close();
}

// ── Workshop promotion / referral rewards ──────────────────────────────────
// A workshop that signs up through a real ?ref= invite link gets this many extra trial days.
export const REF_NEWCOMER_BONUS_DAYS = 15;
// The inviting workshop gets this many free days once the invited workshop goes active (paid).
export const REF_REFERRER_REWARD_DAYS = 30;

// Spare-shop registration link (same token WorkshopQRSection builds). `src` tags where the scan came
// from (e.g. "inv" for the invoice QR) so WorkshopRegisterPage can stamp referral_source.
export function workshopRegUrl(shopName, src = "") {
  let token;
  try { token = btoa(JSON.stringify({ id: 1, name: shopName })); }
  catch { token = btoa(JSON.stringify({ id: 1 })); }
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?ws_register=${token}${src ? `&src=${src}` : ""}`;
}

// Work-group sections for printed / customer-facing quotes and invoices (HTML table rows, 4 columns).
// Each group (items sharing job-item `work_group`) gets a dark-pink header and its own subtotal row;
// items with no group follow under "Other items". With no groups at all it just returns the
// ungrouped output, so jobs that never use groups print exactly as before.
//   rowFn(item, idx) -> <tr> html for one item;  ungroupedFn(list) -> optional custom html for ungrouped items
export function groupedRowsHtml(items, rowFn, fmt, ungroupedFn) {
  const grp = i => String(i.work_group || "").trim();
  const names = [...new Set(items.map(grp).filter(Boolean))];
  const plain = list => (ungroupedFn ? ungroupedFn(list) : list.map(rowFn).join(""));
  if (!names.length) return plain(items);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sum = l => l.reduce((s, i) => s + (+i.total || 0), 0);
  const head = (label, n, bg) => `<tr><td colspan="4" style="padding:9px 12px;background:${bg};color:#fff;font-weight:700;font-size:13px;letter-spacing:.02em">${esc(label)} <span style="font-weight:400;opacity:.85;font-size:11px">· ${n} item${n !== 1 ? "s" : ""}</span></td></tr>`;
  const foot = (label, list, color, bg) => `<tr style="background:${bg}"><td colspan="3" style="padding:8px 12px;border-bottom:2px solid ${color};text-align:right;font-weight:800;font-size:12px;color:${color};text-transform:uppercase;letter-spacing:.03em">${esc(label)} subtotal</td><td style="padding:8px 12px;border-bottom:2px solid ${color};text-align:right;font-weight:800;font-size:14px;color:${color}">${fmt(sum(list))}</td></tr>`;
  const sections = names.map(n => {
    const list = items.filter(i => grp(i) === n);
    return head(n, list.length, "#9d174d") + list.map(rowFn).join("") + foot(n, list, "#9d174d", "#fdf2f8");
  }).join("");
  const rest = items.filter(i => !grp(i));
  if (!rest.length) return sections;
  return sections + head("Other items", rest.length, "#475569") + plain(rest) + (ungroupedFn ? "" : foot("Other items", rest, "#475569", "#f1f5f9"));
}

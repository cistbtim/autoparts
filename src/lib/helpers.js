import { C } from "./settings.js";

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

export const waLink = (phone, msg) => `https://wa.me/${(phone || "").replace(/[^0-9+]/g, "")}?text=${encodeURIComponent(msg)}`;
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
//   widthMm       label width  (default 98)
//   heightMm      label height (default 45)
export function openLabelWindow(data) {
  const {
    mode = "workshop", shopName = "", primaryId = "",
    make = "", model = "", dateIn = "", qrData = "",
    reg = "", customerName = "", complaint = "", mechanic = "",
    partName = "", tags = [],
    widthMm = 98, heightMm = 45,
  } = data;

  const e = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData || primaryId)}&format=png`;
  const px = (mm) => Math.round(mm * 3.78);
  const W = px(widthMm);
  const H = px(heightMm);
  const qrSz = Math.min(Math.round(H * 0.48), 76);
  const leftW = qrSz + 18;

  const rightHtml = mode === "workshop"
    ? `${reg ? `<div class="vreg">${e(reg)}</div>` : ""}
       <div class="mk">${e(make)}</div>
       <div class="md">${e(model)}</div>
       ${customerName ? `<div class="inf">&#128100; ${e(customerName)}</div>` : ""}
       ${mechanic    ? `<div class="inf">&#128296; ${e(mechanic)}</div>` : ""}
       ${complaint   ? `<div class="cmp">${e(complaint).slice(0, 90)}</div>` : ""}`
    : `<div class="pn">${e(partName)}</div>
       <div class="mk">${e(make)}</div>
       <div class="md">${e(model)}</div>
       ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${e(t)}</span>`).join("")}</div>` : ""}`;

  const sc = mode === "scrapyard"; // scrapyard gets ×2 on all non-name/date elements

  const css = [
    "*{margin:0;padding:0;box-sizing:border-box}",
    "body{font-family:Arial,sans-serif;font-weight:bold;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#e5e7eb;gap:14px;padding:20px}",
    ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer}",
    `.label{width:${W}px;height:${H}px;border:2px solid #111;background:#fff;display:flex;overflow:hidden}`,
    `.l{width:${leftW}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px;gap:3px;border-right:1px solid #bbb;background:#f8f8f8}`,
    `.qr{width:${qrSz}px;height:${qrSz}px}`,
    ".din{font-size:21px;font-weight:bold;text-align:center;color:#222;line-height:1.2}",
    ".r{flex:1;padding:5px 8px;display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;overflow:hidden}",
    // shop name
    `.sn{font-size:${sc?14:7}px;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    // primary ID (part # or JOB #)
    `.pid{font-size:${sc?26:13}px;font-weight:900;font-family:monospace;letter-spacing:.8px;line-height:1.1}`,
    // plate number — workshop ×2 = 24px, scrapyard not used
    `.vreg{font-size:24px;font-weight:900;font-family:monospace;letter-spacing:2px;border:1.5px solid #111;padding:1px 5px;border-radius:3px;display:inline-block;margin:1px 0}`,
    // make / model
    `.mk{font-size:${sc?20:10}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.md{font-size:${sc?20:10}px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    // part name (scrapyard) — already ×2 at 22px
    ".pn{font-size:22px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    // customer / mechanic info (workshop)
    ".inf{font-size:9px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    // complaint — workshop ×3 = 24px
    ".cmp{font-size:12px;font-weight:bold;color:#333;border-top:1px dashed #ccc;margin-top:2px;padding-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    // tags (scrapyard)
    ".tags{display:flex;gap:3px;flex-wrap:wrap;margin-top:2px}",
    `.tag{border:1px solid #666;border-radius:2px;padding:0 4px;font-size:${sc?14:7}px;font-weight:bold}`,
    `@page{size:${widthMm}mm ${heightMm}mm;margin:1mm}`,
    `@media print{body{background:#fff;padding:0;gap:0;min-height:auto}.print-btn{display:none}.label{border:1.5px solid #000;width:${widthMm - 2}mm;height:${heightMm - 2}mm}}`,
  ].join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label</title><style>${css}</style></head><body>` +
    `<button class="print-btn" onclick="window.print()">&#128424; Print / Save PDF</button>` +
    `<div class="label"><div class="l"><img class="qr" src="${qrUrl}" alt="QR"/><div class="din">${e(dateIn)}</div></div>` +
    `<div class="r"><div class="sn">${e(shopName)}</div><div class="pid">${e(primaryId)}</div>${rightHtml}</div></div>` +
    `</body></html>`;

  const win = window.open("", "_blank", `width=${Math.max(W + 100, 480)},height=${Math.max(H + 130, 300)}`);
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// ── PART LABEL PRINTER ─────────────────────────────────────────
// labels: [{sku, name, binLocation, supplierCode, invoiceNo, seq, total}]
// Options: widthMm, heightMm, shopName
export function openPartLabelsWindow(labels, { widthMm = 98, heightMm = 45, shopName = "" } = {}) {
  if (!labels?.length) return;
  const e = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const px = (mm) => Math.round(mm * 3.78);
  const W = px(widthMm); const H = px(heightMm);
  const qrSz = Math.min(Math.round(H * 0.52), 80);
  const leftW = qrSz + 14;

  const css = [
    "*{margin:0;padding:0;box-sizing:border-box}",
    "body{font-family:Arial,sans-serif;font-weight:bold;background:#e5e7eb;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px}",
    ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px}",
    `.label{width:${W}px;height:${H}px;border:2px solid #111;background:#fff;display:flex;overflow:hidden;page-break-after:always}`,
    `.l{width:${leftW}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;gap:2px;border-right:1px solid #bbb;background:#f8f8f8}`,
    `.qr{width:${qrSz}px;height:${qrSz}px}`,
    ".r{flex:1;padding:4px 7px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;overflow:hidden}",
    ".sn{font-size:7px;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sku{font-size:39px;font-weight:900;font-family:monospace;letter-spacing:.8px;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pn{font-size:18px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#333}",
    ".bin{font-size:33px;font-weight:900;color:#1d4ed8;background:#dbeafe;border-radius:3px;padding:1px 5px;display:inline-block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}",
    ".sup{font-size:18px;font-weight:bold;color:#7c3aed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".inv-row{display:flex;justify-content:space-between;align-items:center;border-top:1px dashed #ccc;margin-top:2px;padding-top:2px}",
    ".invno{font-size:8px;color:#555;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".seq{font-size:11px;font-weight:900;color:#059669;font-family:monospace;white-space:nowrap;flex-shrink:0}",
    `@page{size:${widthMm}mm ${heightMm}mm;margin:1mm}`,
    `@media print{body{background:#fff;padding:0;gap:0}.print-btn{display:none}.label{border:1.5px solid #000;width:${widthMm-2}mm;height:${heightMm-2}mm;page-break-after:always}}`,
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
        ${lbl.binLocation?`<div class="bin">📦 ${e(lbl.binLocation)}</div>`:"<div class=\"bin\" style=\"background:#fee2e2;color:#dc2626\">📦 NO BIN SET</div>"}
        ${lbl.supplierCode?`<div class="sup">🏭 ${e(lbl.supplierCode)}</div>`:""}
        ${(lbl.invoiceNo||lbl.seq)?`<div class="inv-row"><span class="invno">${lbl.invoiceNo?e(lbl.invoiceNo):""}</span><span class="seq">${lbl.seq?e(lbl.seq):""}</span></div>`:""}
      </div>
    </div>`;
  }).join("");

  // Fixed font sizes (bumped up earlier for readability) truncate with "..." once
  // a SKU/name is too long to fit — shrink each label's own text independently
  // instead, so the full SKU/name/bin always actually prints, same auto-fit trick
  // openShelfLabelWindow already uses for its bin name.
  const fitScript = `
    (function(){
      function fit(el, maxW, minSize){
        if(!el) return;
        var sz = parseFloat(getComputedStyle(el).fontSize);
        while(sz>minSize && el.scrollWidth>maxW){
          sz -= 1;
          el.style.fontSize = sz+'px';
        }
      }
      document.querySelectorAll('.label').forEach(function(label){
        var r = label.querySelector('.r');
        if(!r) return;
        var maxW = r.clientWidth - 4;
        fit(label.querySelector('.sku'), maxW, 14);
        fit(label.querySelector('.pn'), maxW, 9);
        fit(label.querySelector('.bin'), maxW, 14);
        fit(label.querySelector('.sup'), maxW, 9);
      });
    })();
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Part Labels</title><style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">&#128424; Print ${labels.length} Label${labels.length>1?"s":""}</button>
    ${labelsHtml}
    <script>${fitScript}<\/script>
  </body></html>`;

  const win = window.open("", "_blank", `width=${Math.max(W+100,480)},height=${Math.max(H*3+200,500)}`);
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// ── SHELF / BIN LABEL PRINTER ──────────────────────────────────
export function openShelfLabelWindow({ binName, description = "" }, { widthMm = 70, heightMm = 45 } = {}) {
  if (!binName) return;
  const e = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const px = (mm) => Math.round(mm * 3.78);
  const W = px(widthMm); const H = px(heightMm);
  const qrSz = Math.min(Math.round(H * 0.55), 72);
  const leftW = qrSz + 12;
  const maxFontSize = Math.min(Math.round((H - 12) * 0.7), 72);
  const descFontSize = Math.min(Math.round(H * 0.12), 13);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent("#"+binName)}&format=png`;

  const css = [
    "*{margin:0;padding:0;box-sizing:border-box}",
    "body{font-family:Arial,sans-serif;background:#e5e7eb;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px}",
    ".print-btn{padding:9px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px}",
    `.label{width:${W}px;height:${H}px;border:3px solid #111;background:#fff;display:flex;overflow:hidden}`,
    `.l{width:${leftW}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:5px;border-right:2px solid #111;background:#f8f8f8}`,
    `.qr{width:${qrSz}px;height:${qrSz}px;display:block}`,
    `.r{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px 8px;overflow:hidden;min-width:0}`,
    `.bn{font-weight:900;font-family:monospace;letter-spacing:2px;color:#111;text-align:center;line-height:1;white-space:nowrap;display:inline-block}`,
    `.desc{font-size:${descFontSize}px;font-weight:bold;color:#555;text-align:center;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-transform:uppercase;letter-spacing:.05em}`,
    `@page{size:${widthMm}mm ${heightMm}mm;margin:1mm}`,
    `@media print{body{background:#fff;padding:0;gap:0}.print-btn{display:none}.label{border:2px solid #000;width:${widthMm-2}mm;height:${heightMm-2}mm}}`,
  ].join("");

  // JS in the popup auto-shrinks the bin name until it fits the right-panel width
  const fitScript = `
    (function(){
      var el=document.querySelector('.bn');
      var container=document.querySelector('.r');
      var maxW=container.clientWidth-16;
      var maxH=container.clientHeight-(${description?descFontSize+10:0});
      var sz=${maxFontSize};
      el.style.fontSize=sz+'px';
      while(sz>8&&(el.scrollWidth>maxW||el.offsetHeight>maxH)){
        sz--;
        el.style.fontSize=sz+'px';
      }
    })();
  `;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shelf Label</title><style>${css}</style></head><body>
    <button class="print-btn" onclick="window.print()">&#128424; Print Label</button>
    <div class="label">
      <div class="l"><img class="qr" src="${qrUrl}" alt="QR"/></div>
      <div class="r">
        <div class="bn">${e(binName)}</div>
        ${description?`<div class="desc">${e(description)}</div>`:""}
      </div>
    </div>
    <script>${fitScript}<\/script>
  </body></html>`;

  const win = window.open("", "_blank", `width=${Math.max(W+100,400)},height=${Math.max(H+160,300)}`);
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

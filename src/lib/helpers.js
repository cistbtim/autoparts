import { C } from "./settings.js";

// Convert Google Drive share link → direct thumbnail URL
const toImgUrl = (url) => {
  if (!url) return null;
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
  return m ? m[1] : null;
};

// Strip cache-buster &t=... from Drive URLs before saving to DB
export const stripCacheBuster = (url) => url ? url.replace(/&t=\d+/, "") : url;

// Convert any URL → large thumbnail for lightbox
export const toFullUrl = (url) => {
  if (!url) return null;
  const mThumb = url.match(/thumbnail[?]id=([^&]+)/);
  if (mThumb) return `https://drive.google.com/thumbnail?id=${mThumb[1]}&sz=w800`;
  const mFile = url.match(/file\/d\/([^/?]+)/);
  if (mFile) return `https://drive.google.com/thumbnail?id=${mFile[1]}&sz=w800`;
  const mId = url.match(/[?&]id=([^&]+)/);
  if (mId) return `https://drive.google.com/thumbnail?id=${mId[1]}&sz=w800`;
  return url;
};

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtAmt = (n) => `${C()}${(n || 0).toLocaleString()}`;

let _idCounter = 0;
export const makeId = (prefix) => { _idCounter++; return `${prefix}-${Date.now()}-${_idCounter}`; };
export const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const detectGeoLocation = async () => {
  const g = await (await fetch("https://ipapi.co/json/")).json();
  return { city: g.city || "", country: g.country_name || "" };
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

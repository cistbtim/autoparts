// Dynamsoft Barcode Reader v7.4.0-v1 — PDF417 decoder for SA eNaTIS licence discs
const DYNAMSOFT_CDN = "https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@7.4.0-v1/dist/";

export async function getDynamsoftReader() {
  // Persist on window so HMR module re-evaluation doesn't lose the instance
  if (window._dbrInstance) return window._dbrInstance;
  if (!window.Dynamsoft?.BarcodeReader) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = DYNAMSOFT_CDN + "dbr.js";
      s.onload = res;
      s.onerror = () => rej(new Error("Could not load Dynamsoft SDK"));
      document.head.appendChild(s);
    });
  }
  // v7 API: window.Dynamsoft.BarcodeReader (not Dynamsoft.DBR)
  const BR = window.Dynamsoft.BarcodeReader;
  // engineResourcePath cannot be set after WASM loads — ignore if it throws
  try { BR.engineResourcePath = DYNAMSOFT_CDN; } catch (e) { /* ignore engine path if WASM already loaded */ }
  window._dbrInstance = await BR.createInstance();
  const { Dynamsoft } = window;
  const settings = await window._dbrInstance.getRuntimeSettings();
  settings.barcodeFormatIds = Dynamsoft.EnumBarcodeFormat.BF_PDF417;
  settings.deblurLevel = 9;
  settings.scaleDownThreshold = 99999; // don't downscale — keep full resolution
  await window._dbrInstance.updateRuntimeSettings(settings);
  return window._dbrInstance;
}

// Tries native BarcodeDetector first (Chrome/Edge/Safari 17+), then Dynamsoft.
// NOTE: On mobile, BarcodeDetector may garble binary PDF417 data — we validate
// the result contains "***" (SA disc end-marker) before trusting it.
export async function decodePDF417fromImage(dataUrl) {
  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });

  if ("BarcodeDetector" in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ["pdf417"] });
      const codes = await det.detect(img);
      if (codes.length) {
        const val = codes[0].rawValue;
        if (val.includes("***")) return val;
      }
    } catch (e) { /* ignore native BarcodeDetector failures */ }
  }

  const reader = await getDynamsoftReader();
  const results = await reader.decode(img);
  if (results.length && results[0].barcodeText.includes("***")) return results[0].barcodeText;
  let fallback = results.length ? results[0].barcodeText : null;

  // Hard photos (dark, glossy windscreen glare, tilted, soft focus): retry on enhanced
  // copies — contrast-stretched / brightened / sharpened / binarised, each also tilted a
  // little either way. Stops at the first result that looks like a real disc payload.
  const detector = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["pdf417"] }) : null;
  for (const mode of ["stretch", "bright", "sharp", "binary"]) {
    for (const angle of [0, -10, 10, -20, 20]) {
      let canvas;
      try { canvas = enhanceForBarcode(img, mode, angle); } catch { continue; }
      try {
        const rs = await reader.decode(canvas);
        for (const r of rs) {
          if (r.barcodeText.includes("***")) return r.barcodeText;
          if (!fallback) fallback = r.barcodeText;
        }
      } catch { /* try next variant */ }
      if (detector) {
        try {
          const codes = await detector.detect(canvas);
          if (codes.length && codes[0].rawValue.includes("***")) return codes[0].rawValue;
        } catch { /* ignore */ }
      }
    }
  }
  if (fallback) return fallback;
  throw new Error("No PDF417 barcode found — try a sharper photo");
}

// Draw `img` to a canvas (long side capped at 3200px), tilted by `angleDeg`, then apply a
// grayscale enhancement: "stretch" = percentile contrast stretch, "bright" = stretch +
// gamma lift for underexposed shots, "sharp" = stretch + unsharp mask, "binary" = stretch +
// Otsu black/white threshold.
function enhanceForBarcode(img, mode, angleDeg = 0) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, 3200 / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const rad = angleDeg * Math.PI / 180;
  const cw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  const ch = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2); ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const id = ctx.getImageData(0, 0, cw, ch), d = id.data, n = cw * ch;
  const g = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    g[i] = v; hist[v]++;
  }
  // 1st–99th percentile stretch
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo < 8) hi = Math.min(255, lo + 8);
  const gamma = mode === "bright" ? 0.55 : 1;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma);
  for (let i = 0; i < n; i++) g[i] = lut[g[i]];

  let out = g;
  if (mode === "sharp") {
    // unsharp mask with a 3x3 box blur
    out = new Uint8ClampedArray(n);
    for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const blur = (g[i - cw - 1] + g[i - cw] + g[i - cw + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + cw - 1] + g[i + cw] + g[i + cw + 1]) / 9;
      out[i] = g[i] + 2 * (g[i] - blur);
    }
  } else if (mode === "binary") {
    const h2 = new Uint32Array(256);
    for (let i = 0; i < n; i++) h2[g[i]]++;
    let sum = 0; for (let v = 0; v < 256; v++) sum += v * h2[v];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for (let v = 0; v < 256; v++) {
      wB += h2[v]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += v * h2[v];
      const mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF);
      if (bt > best) { best = bt; thr = v; }
    }
    out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = g[i] > thr ? 255 : 0;
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) { d[p] = d[p + 1] = d[p + 2] = out[i]; d[p + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return c;
}

// Parse SA eNaTIS licence disc PDF417 payload.
// Field positions (default format): [5] plate [7] body [8] make [9] model [10] color [11] VIN [12] engine
// RC format (starts with "RC"):      [5] plate [6] body [7] make [8] model [9] VIN [10] engine
export function parseLicenceDisc(rawText) {
  const text = rawText.replace(/^\[Attention\([^)]*\)\]\s*/i, "").trim();
  const strPos = text.indexOf("***");
  if (strPos === -1) return { reg: null, vin: null, engine_no: null, make: null, model: null, color: null, body_type: null, expiry_date: null, licence_no: null, raw: rawText };

  const arr = text.slice(1, strPos).split("%");
  const safeGet = (idx) => arr[idx] ? arr[idx].split("/")[0].trim() : "";
  const n = v => v?.trim() || null;

  // Scan every field for an expiry date — handles both YYYY-MM (hyphen) and YYYYMM (6-digit)
  // formats, and strips the trailing '-' that appears when the date is the last field before ***.
  let expiry_date = null;
  for (let i = 0; i < arr.length && !expiry_date; i++) {
    const raw = (arr[i] || "").split("/")[0].replace(/[-\s]+$/, "").trim();
    if (!raw) continue;
    // YYYY-MM or YYYY/MM
    const mDash = raw.match(/^(20\d{2})[-/](0[1-9]|1[0-2])$/);
    if (mDash) {
      const yr = +mDash[1], mo = +mDash[2];
      expiry_date = `${yr}-${String(mo).padStart(2,"0")}-${String(new Date(yr,mo,0).getDate()).padStart(2,"0")}`;
      break;
    }
    // YYYYMM (six consecutive digits starting with 20)
    if (/^20\d{4}$/.test(raw)) {
      const yr = +raw.slice(0,4), mo = +raw.slice(4,6);
      if (mo >= 1 && mo <= 12) {
        expiry_date = `${yr}-${String(mo).padStart(2,"0")}-${String(new Date(yr,mo,0).getDate()).padStart(2,"0")}`;
      }
    }
  }
  const licence_no = n(safeGet(3));

  let reg, vin, engine_no, make, model, color, body_type;
  if (arr[0]?.startsWith("RC")) {
    reg = n(safeGet(5)); body_type = n(safeGet(6)); make = n(safeGet(7)); model = n(safeGet(8));
    color = null; vin = n(safeGet(9)); engine_no = n(safeGet(10));
  } else {
    reg = n(safeGet(5)); body_type = n(safeGet(7)); make = n(safeGet(8)); model = n(safeGet(9));
    color = n(safeGet(10)); vin = n(safeGet(11)); engine_no = n(safeGet(12));
  }
  return { reg, vin, engine_no, make, model, color, body_type, expiry_date, licence_no, raw: rawText };
}

// ── Fallback: read the PRINTED text on the disc when the barcode can't be decoded ──────────
// Uses Tesseract OCR (loaded on demand). Less reliable than the barcode, so the result is
// flagged `ocr: true` and callers should ask the user to check the fields.
const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const OCR_MAKES = ["TOYOTA","VOLKSWAGEN","FORD","NISSAN","HYUNDAI","KIA","SUZUKI","MAZDA","HONDA","RENAULT","BMW","MERCEDES","AUDI","ISUZU","MITSUBISHI","CHEVROLET","OPEL","PEUGEOT","CITROEN","DAIHATSU","MAHINDRA","CHERY","HAVAL","GWM","JEEP","LAND ROVER","VOLVO","SUBARU","LEXUS","FIAT","MINI","TATA","BAIC","BYD","JAC","FAW","PROTON","DATSUN","DODGE","CHRYSLER","SKODA","SEAT","PORSCHE","JAGUAR"];
const SA_PLATE = /^(?:[A-Z]{2,3}\d{3}[A-Z]{1,2}|[A-Z]{1,3}\d{3,6})$/;
const VIN_FIX = s => s.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/Q/g, "0");

export function parseDiscText(text) {
  const T = (text || "").toUpperCase();
  const tokens = T.split(/[^A-Z0-9]+/).filter(Boolean);
  const out = { reg: null, vin: null, engine_no: null, make: null, model: null, color: null, body_type: null, expiry_date: null, licence_no: null, raw: text, ocr: true };

  // VIN — 17 chars, no I/O/Q. OCR confuses those with 1/0, so repair before testing.
  for (const tk of tokens) {
    if (tk.length !== 17) continue;
    const v = VIN_FIX(tk);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(v) && /\d/.test(v) && /[A-Z]/.test(v)) { out.vin = v; break; }
  }
  // Engine number — the token after the "Engine no." label, else after "ENJINNR"
  const em = T.match(/ENGINE\s*NO[^A-Z0-9]*(?:ENJINNR)?[^A-Z0-9]*([A-Z0-9]{6,17})/) || T.match(/ENJINNR[^A-Z0-9]*([A-Z0-9]{6,17})/);
  if (em && em[1] !== out.vin) out.engine_no = em[1];
  // Licence number
  const lm = T.match(/LICENCE\s*NO[^A-Z0-9]*(?:LISENSIENR)?[^A-Z0-9]*([A-Z0-9]{6,10})/) || T.match(/LISENSIENR[^A-Z0-9]*([A-Z0-9]{6,10})/);
  if (lm) out.licence_no = lm[1];
  // Registration plate — prefer the token after the "register" label, else any SA-plate-shaped token
  const pm = T.match(/REGISTER?\s*NO[^A-Z0-9]*(?:VRT\.?\s*REGISTERNR)?[^A-Z0-9]*([A-Z]{1,3}\d{3,6}[A-Z]{0,2})/) || T.match(/REGISTERNR[^A-Z0-9]*([A-Z]{1,3}\d{3,6}[A-Z]{0,2})/);
  if (pm) out.reg = pm[1];
  else out.reg = tokens.find(tk => SA_PLATE.test(tk) && tk !== out.engine_no && tk !== out.licence_no && !(out.vin || "").includes(tk)) || null;
  // Make
  out.make = OCR_MAKES.find(m => new RegExp(`\b${m}\b`).test(T)) || null;
  if (out.make) out.make = out.make.charAt(0) + out.make.slice(1).toLowerCase();
  // Expiry — latest YYYY-MM-DD printed on the disc
  const dates = [...T.matchAll(/\b(20\d{2})[-.\s](0[1-9]|1[0-2])[-.\s]([0-3]\d)\b/g)].map(m => `${m[1]}-${m[2]}-${m[3]}`).sort();
  if (dates.length) out.expiry_date = dates[dates.length - 1];
  return out;
}

export async function ocrLicenceDisc(dataUrl) {
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = TESSERACT_CDN; s.onload = res; s.onerror = () => rej(new Error("Could not load OCR engine"));
      document.head.appendChild(s);
    });
  }
  const img = document.createElement("img");
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const worker = await window.Tesseract.createWorker("eng");
  const score = p => (p.vin ? 4 : 0) + (p.reg ? 3 : 0) + (p.engine_no ? 2 : 0) + (p.make ? 1 : 0) + (p.expiry_date ? 1 : 0);
  let best = null;
  try {
    // The disc is often photographed tilted — try it level and tilted either way.
    for (const angle of [0, -12, 12]) {
      const { data } = await worker.recognize(enhanceForBarcode(img, "stretch", angle));
      const p = parseDiscText(data.text);
      if (!best || score(p) > score(best)) best = p;
      if (best.vin && best.reg) break;
    }
  } finally { await worker.terminate(); }
  if (!best || !(best.vin || best.reg)) throw new Error("Could not read the printed text either");
  return best;
}

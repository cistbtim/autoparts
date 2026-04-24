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
  try { BR.engineResourcePath = DYNAMSOFT_CDN; } catch {}
  window._dbrInstance = await BR.createInstance();
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
    } catch {}
  }

  const reader = await getDynamsoftReader();
  const results = await reader.decode(img);
  if (results.length) return results[0].barcodeText;
  throw new Error("No PDF417 barcode found — try a sharper photo");
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

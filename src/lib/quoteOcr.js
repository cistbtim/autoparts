import { getSettings } from "./settings.js";

// Reads a photo / screenshot of a supplier quotation or invoice with the Worker's vision AI (/api/quote-ocr)
// and returns { supplier_name, document_no, lines:[{code,description,qty,unit_price}] }. Throws on failure.
export async function readSupplierQuotePhoto(file) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = document.createElement("img");
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Could not open that image")); img.src = dataUrl; });
  const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const resp = await fetch("/api/quote-ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shared-Secret": getSettings().worker_shared_secret || "" },
    body: JSON.stringify({ image: c.toDataURL("image/jpeg", 0.88) }),
  });
  let j; try { j = await resp.json(); } catch { j = null; }
  if (!j?.ok || !j.result) throw new Error(j?.error || "Could not read the photo");
  const num = v => { const n = parseFloat(String(v ?? "").replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
  const lines = (Array.isArray(j.result.lines) ? j.result.lines : []).map(l => ({
    code: l?.code ? String(l.code).trim() : "", description: l?.description ? String(l.description).trim() : "",
    qty: num(l?.qty), unit_price: num(l?.unit_price),
  })).filter(l => l.unit_price != null && (l.code || l.description));
  return { supplier_name: j.result.supplier_name || "", document_no: j.result.document_no || "", lines };
}

// Scores how well an invoice line matches a part (SKU / OE / supplier code / name words). Higher = better.
export function scoreQuoteLine(line, part, knownCodes = []) {
  const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = norm(line.code), text = norm(line.description + line.code);
  let score = 0;
  for (const k of [part?.sku, part?.oe_number, ...knownCodes]) {
    const n = norm(k); if (n.length >= 4 && (code === n || text.includes(n))) score += 10;
  }
  const words = String(part?.name || "").toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length >= 3);
  const desc = String(line.description || "").toUpperCase();
  score += words.filter(w => desc.includes(w)).length;
  return score;
}

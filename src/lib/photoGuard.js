import { createWorker } from "tesseract.js";
import { api } from "./api.js";

// Photo guard for scrapyard uploads: no phone number, e-mail/web address or company name may stay
// readable in a photo. Text is found with OCR (tesseract.js, in the browser); whatever matches is
// covered with a mosaic, then the picture is read AGAIN — if anything is still readable the photo is
// refused. The check fails CLOSED: if it cannot run, the photo is not uploaded.
//
// Honest limits: OCR cannot read every logo, stylised sign, tiny, angled or blurry text, and this
// runs in the uploader's browser (it does not cover other upload paths or direct database writes).
// Treat it as a strong filter, not a guarantee — spot-check new stock photos now and then.

// South African numbers (0xx… / +27…) and international +… numbers, with the usual separators.
const PHONE_RES = [
  /(?:\+\s*27|\b27|\b0)[\s().-]*\d(?:[\s().-]*\d){8}\b/,
  /\+\s*\d{1,3}(?:[\s().-]*\d){8,}/,
];
const CONTACT_RE = /[A-Za-z0-9._-]+@[A-Za-z0-9.-]+|\bwww\b|https?:|\.co\.za|\.com\b|\.net\b|facebook|instagram|whatsapp|wa\.me|\bcell\b|\btel\b|\bphone\b/i;
// Words that mark a business sign / sticker (single words — OCR splits names into words).
const BUSINESS_WORDS = ["auto", "autos", "spares", "spare", "motors", "scrap", "scrapyard", "salvage", "wreckers", "breakers", "dismantlers",
  "pty", "ltd", "trading", "enterprises", "garage", "panelbeaters", "autoparts", "carparts", "usedparts"];

const alnum = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// ── one shared OCR worker (the language data is a one-off download) ─────────
let _worker = null;
const getWorker = () => (_worker ||= createWorker("eng").catch(e => { _worker = null; throw e; }));

// ── company names to look for: every scrapyard's name (cached for the session) ─
let _names = null;
async function companyTokens(extra = []) {
  if (!_names) {
    const rows = await api.fresh("scrapyard_profiles", "select=name").catch(() => []);
    _names = (Array.isArray(rows) ? rows : []).map(r => r.name).filter(Boolean);
  }
  const toks = new Set();
  [..._names, ...extra].forEach(n => (n || "").toLowerCase().split(/[^a-z0-9]+/).forEach(t => { if (t.length >= 4) toks.add(t); }));
  // very common words in names would flag half the photos — the business words above already cover those
  ["parts", "auto", "spares", "motors", "south", "africa", "johannesburg"].forEach(t => toks.delete(t));
  return [...toks];
}

function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}

// Find the words that must not stay readable. Returns [{x0,y0,x1,y1,why}]
function flagWords(words, lines, nameTokens) {
  const flagged = [];
  const mark = (w, why) => { if (w?.bbox) flagged.push({ ...w.bbox, why }); };

  for (const line of lines) {
    const ws = line.words || [];
    if (!ws.length) continue;
    // character offsets of each word inside the joined line text
    let text = "", spans = [];
    ws.forEach(w => { text += (text ? " " : "") + w.text; spans.push([text.length - w.text.length, text.length]); });
    const hit = (start, end, why) => ws.forEach((w, i) => { if (spans[i][1] > start && spans[i][0] < end) mark(w, why); });
    for (const re of PHONE_RES) { const g = new RegExp(re.source, "g"); let m; while ((m = g.exec(text))) hit(m.index, m.index + m[0].length, "phone"); }
    const c = new RegExp(CONTACT_RE.source, "gi"); let m2;
    while ((m2 = c.exec(text))) hit(m2.index, m2.index + m2[0].length, "contact");
  }
  for (const w of words) {
    const t = alnum(w.text);
    if (t.length < 3) continue;
    if (BUSINESS_WORDS.includes(t)) { mark(w, "business"); continue; }
    if (nameTokens.some(n => t === n || (n.length >= 6 && t.length >= 5 && lev(t, n) <= 1) || (n.length >= 5 && t.includes(n)))) mark(w, "company");
  }
  // A company name is a phrase ("CADERS AUTO PARTS"): once one word of a line is a name/business word, cover the whole line.
  const isFlagged = (w) => flagged.some(f => f.x0 === w.bbox.x0 && f.y0 === w.bbox.y0 && (f.why === "company" || f.why === "business"));
  for (const line of lines) {
    if ((line.words || []).some(isFlagged)) line.words.forEach(w => { if (w.bbox && !flagged.some(f => f.x0 === w.bbox.x0 && f.y0 === w.bbox.y0)) mark(w, "company-line"); });
  }
  return flagged;
}

// Cover boxes with a mosaic (pixelated blocks) on the canvas.
export function mosaic(ctx, boxes, W, H) {
  boxes.forEach(b => {
    const padX = Math.max(8, (b.x1 - b.x0) * 0.15), padY = Math.max(8, (b.y1 - b.y0) * 0.35);
    const x = Math.max(0, Math.floor(b.x0 - padX)), y = Math.max(0, Math.floor(b.y0 - padY));
    const w = Math.min(W - x, Math.ceil(b.x1 - b.x0 + padX * 2)), h = Math.min(H - y, Math.ceil(b.y1 - b.y0 + padY * 2));
    if (w < 2 || h < 2) return;
    const block = Math.max(8, Math.round(h / 3));          // big blocks: ~3 blocks tall → unreadable
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(w / block)); tmp.height = Math.max(1, Math.round(h / block));
    const t = tmp.getContext("2d");
    t.drawImage(ctx.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  });
}

// OCR on a photo full of clutter (cars, panels, shadows) misses text that a tight crop reads fine, so look at
// the whole picture AND four overlapping tiles, merge the words, and rebuild text lines from their positions.
async function ocrWords(canvas, worker, ox = 0, oy = 0) {
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const out = [];
  (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => (l.words || []).forEach(w => {
    if (!w.text || !w.text.trim() || !w.bbox) return;
    out.push({ text: w.text, confidence: w.confidence || 0, bbox: { x0: w.bbox.x0 + ox, y0: w.bbox.y0 + oy, x1: w.bbox.x1 + ox, y1: w.bbox.y1 + oy } });
  }))));
  return out;
}
const iou = (a, b) => {
  const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih, ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
};
// Words → text lines by position (left to right, rows by vertical centre).
function buildLines(words) {
  const ws = [...words].sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1));
  const lines = [];
  for (const w of ws) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2, h = w.bbox.y1 - w.bbox.y0;
    const line = lines.find(l => Math.abs(l.cy - cy) <= 0.6 * Math.max(l.h, h));
    if (line) { line.words.push(w); line.cy = (line.cy * (line.words.length - 1) + cy) / line.words.length; line.h = Math.max(line.h, h); }
    else lines.push({ cy, h, words: [w] });
  }
  lines.forEach(l => l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  return lines;
}
async function readText(canvas, worker) {
  const W = canvas.width, H = canvas.height;
  const all = await ocrWords(canvas, worker);
  if (W >= 400 && H >= 300) {
    const tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
    for (const ox of [0, W - tw]) for (const oy of [0, H - th]) {
      const t = document.createElement("canvas");
      t.width = tw; t.height = th;
      t.getContext("2d").drawImage(canvas, ox, oy, tw, th, 0, 0, tw, th);
      all.push(...await ocrWords(t, worker, ox, oy));
    }
  }
  // merge duplicates seen by several passes (keep the more confident reading)
  const words = [];
  for (const w of all.sort((a, b) => b.confidence - a.confidence)) if (!words.some(k => iou(k.bbox, w.bbox) > 0.3)) words.push(w);
  return { words, lines: buildLines(words) };
}

// For the admin Photo Review tool: find the text areas that must not stay readable on a canvas.
// Returns plain boxes {x0,y0,x1,y1,why} in the canvas' pixel coordinates.
export async function detectSensitiveBoxes(canvas, opts = {}) {
  const worker = await getWorker();
  const nameTokens = await companyTokens(opts.names);
  const r = await readText(canvas, worker);
  return flagWords(r.words, r.lines, nameTokens);
}

/**
 * guardPhoto(dataUrl) → { ok: true, dataUrl, hidden }   — safe to upload (dataUrl may have mosaic areas)
 *                     → { ok: false, reason }           — do NOT upload
 */
export async function guardPhoto(dataUrl, opts = {}) {
  try {
    const worker = await getWorker();
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const nameTokens = await companyTokens(opts.names);

    const first = await readText(canvas, worker);
    const flagged = flagWords(first.words, first.lines, nameTokens);
    if (!flagged.length) return { ok: true, dataUrl, hidden: 0 };

    mosaic(ctx, flagged, canvas.width, canvas.height);
    // Read the covered picture again — anything still readable means the photo is refused.
    const second = await readText(canvas, worker);
    const left = flagWords(second.words, second.lines, nameTokens);
    if (left.length) {
      return { ok: false, reason: "A phone number, web address or company name is visible in this photo and could not be hidden. Retake it without signs, stickers or banners showing." };
    }
    return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", 0.88), hidden: flagged.length };
  } catch (e) {
    return { ok: false, reason: "Could not check the photo for names/phone numbers (" + (e?.message || "error") + "). Check your internet connection and try again." };
  }
}

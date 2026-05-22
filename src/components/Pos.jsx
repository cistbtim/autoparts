import { useState, useRef, useMemo, useEffect } from "react";
import { getSettings, C } from "../lib/settings.js";
import { api } from "../lib/api.js";
import { makeId, toImgUrl, waLink, mailLink } from "../lib/helpers.js";
import { getCategories } from "../lib/constants.js";

// ── Abbreviation expansion ────────────────────────────────────────────────────
const ABBREVS = [
  { short: "h/lamp",  full: "head lamp"   },
  { short: "t/lamp",  full: "tail lamp"   },
  { short: "c/lamp",  full: "corner lamp" },
  { short: "m/lamp",  full: "marker lamp" },
];

// Returns the full label if the text contains any known abbreviation, else ""
const abbrevLabel = (text) => {
  if (!text) return "";
  const t = text.toLowerCase();
  const found = ABBREVS.filter(a => t.includes(a.short));
  return found.map(a => a.full.replace(/\b\w/g, c => c.toUpperCase())).join(" / ");
};

// Expand text for searching — replaces abbreviations with full words
const expandText = (text) => {
  if (!text) return "";
  let t = text.toLowerCase();
  for (const { short, full } of ABBREVS) t = t.replaceAll(short, full);
  return t;
};

// Contract search query — replaces full words with abbreviations so typing
// "head lamp" matches parts stored as "h/lamp"
const contractQuery = (q) => {
  let t = q.toLowerCase();
  for (const { short, full } of ABBREVS) t = t.replaceAll(full, short);
  return t;
};

// ── Manager PIN modal ─────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const tryPin = (p) => {
    const stored = getSettings().pos_manager_pin || "";
    if (!stored || p === stored) { onSuccess(); }
    else { setErr("Wrong PIN"); setPin(""); }
  };

  const tap = (k) => {
    if (k === "⌫") { setPin(p => p.slice(0, -1)); setErr(""); return; }
    if (pin.length >= 4) return;
    const np = pin + String(k);
    setPin(np);
    if (np.length === 4) tryPin(np);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 300, textAlign: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🔒 Manager PIN</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Enter PIN to unlock discount</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 6 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 44, height: 52, borderRadius: 10, border: `2px solid ${pin.length > i ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>
              {pin[i] ? "•" : ""}
            </div>
          ))}
        </div>
        {err && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 4 }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k, i) => (
            <button key={i} onClick={k !== "" ? () => tap(k) : undefined}
              disabled={k === ""}
              className="btn btn-ghost"
              style={{ padding: "14px 0", fontSize: 20, fontWeight: 700, borderRadius: 10, visibility: k === "" ? "hidden" : "visible" }}>
              {k}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 12, width: "100%", fontSize: 13 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── Searchable combobox ───────────────────────────────────────────────────────
function Combo({ value, options, placeholder, disabled, onChange, monoFont }) {
  const [input, setInput] = useState(value);
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);

  // Keep input in sync when parent clears the value
  const prevVal = useRef(value);
  if (prevVal.current !== value) { prevVal.current = value; setInput(value); }

  const filtered = options.filter(o => o.toLowerCase().includes(input.toLowerCase()));

  const select = (o) => { setInput(o); setOpen(false); onChange(o); };
  const clear   = ()  => { setInput(""); setOpen(false); onChange(""); };

  return (
    <div ref={ref} style={{ position: "relative", flex: "1 1 130px", minWidth: 110 }}>
      <div style={{ position: "relative" }}>
        <input className="inp" value={input} disabled={disabled}
          placeholder={placeholder}
          style={{ fontSize: 13, paddingRight: 24, fontFamily: monoFont ? "DM Mono,monospace" : undefined, width: "100%", boxSizing: "border-box" }}
          onChange={e => { setInput(e.target.value); setOpen(true); onChange(""); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {input && !disabled && (
          <button onMouseDown={e => { e.preventDefault(); clear(); }}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
        )}
      </div>
      {open && !disabled && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.3)", marginTop: 2 }}>
          {filtered.map(o => (
            <div key={o} onMouseDown={e => { e.preventDefault(); select(o); }}
              style={{ padding: "7px 12px", cursor: "pointer", fontSize: 13, fontFamily: monoFont ? "DM Mono,monospace" : undefined,
                background: o === value ? "rgba(249,115,22,.12)" : "transparent",
                color: o === value ? "var(--accent)" : "var(--text)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
              onMouseLeave={e => e.currentTarget.style.background = o === value ? "rgba(249,115,22,.12)" : "transparent"}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline vehicle filter ─────────────────────────────────────────────────────
function PosVehicleFilter({ vehicles, partFitments, onFilter, onZoom }) {
  const [make, setMake]   = useState("");
  const [model, setModel] = useState("");
  const [code, setCode]   = useState("");

  const makes = [...new Set(vehicles.map(v => v.make).filter(Boolean))].sort();

  // Models for selected make — include codes in label
  const modelRows = (() => {
    const filtered = vehicles.filter(v => !make || v.make === make);
    const map = {};
    for (const v of filtered) {
      if (!v.model) continue;
      if (!map[v.model]) map[v.model] = new Set();
      if (v.code) map[v.model].add(v.code);
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([m, codes]) => ({ model: m, label: codes.size > 0 ? `${m} [${[...codes].sort().join(" / ")}]` : m }));
  })();
  const modelOptions = modelRows.map(r => r.label);

  // Codes for selected make + model
  const codeList = (make && model)
    ? [...new Set(vehicles.filter(v => v.make === make && v.model === model).map(v => v.code).filter(Boolean))].sort()
    : [];

  const apply = (mk, md, cd) => {
    if (!mk) { onFilter(null); return; }
    const vIds = new Set(
      vehicles.filter(v => v.make === mk && (!md || v.model === md) && (!cd || v.code === cd))
        .map(v => String(v.id))
    );
    const pIds = new Set(partFitments.filter(f => vIds.has(String(f.vehicle_id))).map(f => String(f.part_id)));
    onFilter(pIds.size > 0 ? pIds : new Set(["__none__"]));
  };

  const handleMake = (v) => { setMake(v); setModel(""); setCode(""); apply(v, "", ""); };
  const handleModel = (label) => {
    // strip the "[codes]" suffix to get raw model name
    const raw = label.replace(/\s*\[.*\]$/, "");
    setModel(raw); setCode(""); apply(make, raw, "");
  };
  const handleCode = (v) => { setCode(v); apply(make, model, v); };

  const selectedVehicle = (make && model)
    ? vehicles.find(v => v.make === make && v.model === model && (!code || v.code === code))
    : null;
  const vehiclePhotos = selectedVehicle
    ? [
        { url: toImgUrl(selectedVehicle.photo_front), label: "Front" },
        { url: toImgUrl(selectedVehicle.photo_side),  label: "Side"  },
        { url: toImgUrl(selectedVehicle.photo_rear),  label: "Rear"  },
      ].filter(p => p.url)
    : [];

  if (!vehicles.length) return null;

  // label shown in model combo matches what we stored
  const modelLabel = model
    ? (modelRows.find(r => r.model === model)?.label || model)
    : "";

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13 }}>🚗</span>

      <Combo value={make} options={makes} placeholder="Make…" onChange={handleMake} />

      <Combo value={modelLabel} options={modelOptions} placeholder="Model…" disabled={!make} onChange={handleModel} />

      {codeList.length > 1 && (
        <Combo value={code} options={codeList} placeholder="Code…" onChange={handleCode} monoFont />
      )}

      {(make || model || code) && (
        <button className="btn btn-xs btn-ghost" style={{ color: "var(--red)", flexShrink: 0 }}
          onClick={() => { setMake(""); setModel(""); setCode(""); onFilter(null); }}>✕ Clear</button>
      )}

      {vehiclePhotos.map(({ url, label }, i) => (
        <img key={label} src={url} alt={label} title={label}
          style={{ height: 52, maxWidth: 90, objectFit: "contain", borderRadius: 7, background: "var(--surface2)", border: "1px solid var(--border)", flexShrink: 0, cursor: "zoom-in" }}
          onError={e => e.target.style.display = "none"}
          onClick={() => onZoom?.({
            photos: vehiclePhotos.map(p => ({ url: p.url, name: `${make} ${model}${code ? " " + code : ""} — ${p.label}` })),
            index: i,
          })} />
      ))}
    </div>
  );
}

// ── Print helpers ─────────────────────────────────────────────────────────────
function _openPrint(html, title) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

const PAY_LABEL = { cash: "💵 Cash", card: "💳 Card", qr: "📱 QR", transfer: "🏦 Transfer" };

function _receiptHtml(sale, settings, sym) {
  const { invId, cart, customer, subtotal, discount, total, splits, change, isQuote } = sale;
  const now = new Date().toLocaleString();
  const rows = cart.map(it =>
    `<div style="display:flex;justify-content:space-between;padding:3px 0">
      <div><b>${it.name}</b><br><span style="font-size:10px;color:#666">${it.sku || ""} ×${it.qty} @ ${sym}${(+it.price).toFixed(2)}</span></div>
      <div style="font-weight:700">${sym}${(it.qty * it.price).toFixed(2)}</div>
    </div>`).join("");
  const payRows = !isQuote && splits?.length ? splits.map(s =>
    `<div class="row" style="font-size:12px;color:#555"><span>${PAY_LABEL[s.method]||s.method}</span><span>${sym}${(parseFloat(s.amount)||0).toFixed(2)}</span></div>`
  ).join("") : "";
  const changeRow = !isQuote && change > 0 ? `<div class="row" style="font-weight:700;color:green"><span>Change</span><span>${sym}${change.toFixed(2)}</span></div>` : "";
  return `<!DOCTYPE html><html><head><title>Receipt ${invId}</title>
<style>@media print{@page{margin:4mm;size:80mm auto}body{margin:0;padding:0}}
body{font-family:monospace;max-width:300px;margin:0 auto;padding:8px;font-size:13px}
hr{border:none;border-top:1px dashed #999;margin:6px 0}
.row{display:flex;justify-content:space-between;margin:2px 0;font-size:13px}
</style></head><body>
<div style="text-align:center;margin-bottom:10px">
  <div style="font-weight:800;font-size:16px">${settings.shop_name || "Shop"}</div>
  ${settings.address ? `<div style="font-size:11px;color:#555">${settings.address}</div>` : ""}
  ${settings.phone ? `<div style="font-size:11px;color:#555">${settings.phone}</div>` : ""}
</div>
<hr>
<div class="row" style="font-size:11px;color:#555"><span>${isQuote ? "QUOTE" : "INVOICE"} #${invId}</span><span>${now}</span></div>
<div style="font-size:12px;margin:4px 0">👤 ${customer?.name || "Walk-in"}${customer?.phone ? ` · ${customer.phone}` : ""}</div>
<hr>${rows}<hr>
<div class="row"><span>Subtotal</span><span>${sym}${subtotal.toFixed(2)}</span></div>
${discount > 0 ? `<div class="row" style="color:green"><span>Discount</span><span>−${sym}${discount.toFixed(2)}</span></div>` : ""}
<div class="row" style="font-weight:800;font-size:17px"><span>TOTAL</span><span>${sym}${total.toFixed(2)}</span></div>
${payRows}${changeRow}
<hr><div style="text-align:center;font-size:11px;color:#777;margin-top:8px">${isQuote ? "This is a quote — not a receipt" : "Thank you!"}</div>
</body></html>`;
}

function _a4Html(sale, settings, sym) {
  const { invId, cart, customer, subtotal, discount, total, splits, isQuote } = sale;
  const now = new Date();
  const rows = cart.map((it, i) =>
    `<tr>
      <td style="text-align:center;color:#888">${i + 1}</td>
      <td><b>${it.name}</b>${it.sku ? `<br><span style="font-size:11px;color:#888">${it.sku}</span>` : ""}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:right">${sym}${(+it.price).toFixed(2)}</td>
      <td style="text-align:right;font-weight:700">${sym}${(it.qty * it.price).toFixed(2)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><head><title>${isQuote ? "Quote" : "Invoice"} ${invId}</title>
<style>@media print{@page{margin:15mm;size:A4}}
body{font-family:Arial,sans-serif;font-size:13px;max-width:800px;margin:0 auto;padding:24px;color:#222}
.hd{display:flex;justify-content:space-between;margin-bottom:32px}
.label{font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-top:24px}
th{background:#f5f5f5;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #ddd}
td{padding:9px 12px;border-bottom:1px solid #eee;font-size:13px}
.totals{float:right;margin-top:20px;min-width:260px}
.trow{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
.tbig{font-size:20px;font-weight:800;border-top:2px solid #222;padding-top:8px;margin-top:6px}
.foot{clear:both;margin-top:50px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
</style></head><body>
<div class="hd">
  <div>
    <div style="font-size:22px;font-weight:800;margin-bottom:4px">${settings.shop_name || "Invoice"}</div>
    ${settings.address ? `<div style="color:#555;font-size:12px">${settings.address}</div>` : ""}
    ${settings.phone ? `<div style="color:#555;font-size:12px">${settings.phone}</div>` : ""}
    ${settings.email ? `<div style="color:#555;font-size:12px">${settings.email}</div>` : ""}
  </div>
  <div style="text-align:right">
    <div class="label">${isQuote ? "Quote" : "Invoice"}</div>
    <div style="font-size:24px;font-weight:800">#${invId}</div>
    <div class="label" style="margin-top:12px">Date</div>
    <div>${now.toLocaleDateString()}</div>
  </div>
</div>
<div>
  <div class="label">Bill To</div>
  <div style="font-size:15px;font-weight:700">${customer?.name || "Walk-in Customer"}</div>
  ${customer?.phone ? `<div style="color:#555">${customer.phone}</div>` : ""}
</div>
<table>
  <thead><tr>
    <th style="width:36px;text-align:center">#</th>
    <th>Description</th>
    <th style="width:60px;text-align:center">Qty</th>
    <th style="width:100px;text-align:right">Unit Price</th>
    <th style="width:100px;text-align:right">Total</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <div class="trow"><span style="color:#888">Subtotal</span><span>${sym}${subtotal.toFixed(2)}</span></div>
  ${discount > 0 ? `<div class="trow" style="color:green"><span>Discount</span><span>−${sym}${discount.toFixed(2)}</span></div>` : ""}
  <div class="trow tbig"><span>TOTAL</span><span>${sym}${total.toFixed(2)}</span></div>
  ${!isQuote && splits?.length ? splits.map(s=>`<div style="color:#888;font-size:12px;margin-top:4px">${PAY_LABEL[s.method]||s.method}: ${sym}${(parseFloat(s.amount)||0).toFixed(2)}</div>`).join("") : ""}
  ${isQuote ? `<div style="color:#e88c30;font-size:12px;margin-top:8px">⚠️ Quote only — not a tax invoice</div>` : ""}
</div>
<div class="foot">${settings.shop_name || ""} · Thank you for your business!</div>
</body></html>`;
}

// ── Completed-sale / saved-quote screen ───────────────────────────────────────
function PosDone({ sale, onNewSale }) {
  const settings = getSettings();
  const sym = C();
  const { invId, cart, customer, subtotal, discount, total, splits, change, isQuote } = sale;
  const now = new Date();

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 20 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44 }}>{isQuote ? "📋" : "✅"}</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>
            {isQuote ? "Quote Saved" : "Sale Complete!"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4, fontFamily: "DM Mono,monospace" }}>
            #{invId}
            {!isQuote && ` · ${now.toLocaleString()}`}
          </div>
          {isQuote && (
            <div style={{ marginTop: 8, padding: "8px 16px", background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.3)", borderRadius: 8, fontSize: 13, color: "var(--blue)" }}>
              Give this number to the customer to collect their order
            </div>
          )}
        </div>

        {/* Items summary */}
        <div style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "10px 0", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>
            👤 {customer?.name || "Walk-in"}{customer?.phone ? ` · ${customer.phone}` : ""}
          </div>
          {cart.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name} <span style={{ color: "var(--text3)", fontSize: 11 }}>×{it.qty}</span>
              </span>
              <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                {sym}{(it.qty * it.price).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ marginBottom: 18 }}>
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--green)", marginBottom: 4 }}>
              <span>Discount</span><span>−{sym}{discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}>
            <span>TOTAL</span>
            <span style={{ color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", fontSize: 28 }}>
              {sym}{total.toFixed(2)}
            </span>
          </div>
          {!isQuote && splits?.length > 0 && (
            <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(52,211,153,.06)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {splits.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)" }}>
                  <span>{PAY_LABEL[s.method] || s.method}</span>
                  <span style={{ fontWeight: 700 }}>{sym}{(parseFloat(s.amount) || 0).toFixed(2)}</span>
                </div>
              ))}
              {change > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: "var(--green)", fontSize: 16, borderTop: "1px solid rgba(52,211,153,.3)", marginTop: 4, paddingTop: 4 }}>
                  <span>Change</span><span>{sym}{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Print actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-primary" style={{ padding: "13px 0", fontSize: 15 }}
            onClick={() => _openPrint(_receiptHtml(sale, settings, sym))}>
            🖨️ Print Receipt (Narrow / Thermal)
          </button>
          <button className="btn btn-ghost" style={{ padding: "13px 0", fontSize: 15 }}
            onClick={() => _openPrint(_a4Html(sale, settings, sym))}>
            📄 Print {isQuote ? "Quote" : "Invoice"} (A4)
          </button>
          <button className="btn btn-ghost" style={{ padding: "9px 0", fontSize: 13, color: "var(--text3)", marginTop: 4 }}
            onClick={onNewSale}>
            ➕ New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main POS page ─────────────────────────────────────────────────────────────
export function PosPage({ parts, customers, vehicles = [], partFitments = [], onSave, branchId = null, suppliers = [], partSuppliers = [], settings = {} }) {
  const sym = C();

  // Parts filter — searchInput updates instantly (for the input box display),
  // search is debounced 200ms so the expensive filter only runs after typing pauses
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("__all__");
  const [vehicleFilterIds, setVehicleFilterIds] = useState(null);
  const debounceRef = useRef(null);

  // Cart
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [custSearch, setCustSearch] = useState("");

  // Quote
  const [quoteId, setQuoteId] = useState(null);
  const [loadInput, setLoadInput] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [loadBusy, setLoadBusy] = useState(false);

  // Payment — split support
  const [splits, setSplits] = useState([{ method: "cash", amount: "" }]);
  const [discount, setDiscount] = useState(0);
  const [discLocked, setDiscLocked] = useState(true);
  const [showPin, setShowPin] = useState(false);

  // Ask-supplier modal
  const [askPart, setAskPart] = useState(null);

  // UI
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [lightbox, setLightbox] = useState(null); // {photos:[{url,name}], index}
  const [page, setPage] = useState(0);
  const [mobView, setMobView] = useState("catalog"); // "catalog" | "cart"
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const searchRef = useRef(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  setLightbox(lb => lb && lb.photos.length > 1 ? { ...lb, index: (lb.index - 1 + lb.photos.length) % lb.photos.length } : lb);
      if (e.key === "ArrowRight") setLightbox(lb => lb && lb.photos.length > 1 ? { ...lb, index: (lb.index + 1) % lb.photos.length } : lb);
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!lightbox]);

  // Computed totals
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.max(0, subtotal - discount);
  const splitTotal = splits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
  const remaining = Math.max(0, total - splitTotal);
  const change = splitTotal > total ? +(splitTotal - total).toFixed(2) : 0;

  // Split helpers
  const PAY_OPTS = [["cash","💵","Cash"],["card","💳","Card"],["qr","📱","QR"],["transfer","🏦","Transfer"]];
  const setSplitMethod = (i, m) => setSplits(sp => sp.map((s, j) => j === i ? { ...s, method: m } : s));
  const setSplitAmount = (i, v) => setSplits(sp => sp.map((s, j) => j === i ? { ...s, amount: v } : s));
  const addSplit = () => setSplits(sp => [...sp, { method: "card", amount: "" }]);
  const removeSplit = (i) => setSplits(sp => sp.filter((_, j) => j !== i));

  const categories = getCategories().filter(c => c !== "All");
  const lq = search.trim().toLowerCase();

  // Pre-built search index: one concatenated lowercase string per part, built once
  // when `parts` changes — not on every keystroke. Includes both raw and expanded text.
  const searchIndex = useMemo(() => parts.map(p => {
    const raw = [p.sku, p.name, p.oe_number, p.make, p.model, p.description, p.chinese_desc, p.brand]
      .filter(Boolean).join(" ").toLowerCase();
    return { raw, expanded: expandText(raw), barcode: (p.barcode || "").trim() };
  }), [parts]);

  // partCodeMap built once when fitments/vehicles change
  const partCodeMap = useMemo(() => {
    const vById = Object.fromEntries(vehicles.map(v => [String(v.id), v]));
    const map = {};
    for (const f of partFitments) {
      const v = vById[String(f.vehicle_id)];
      if (!v?.code) continue;
      if (!map[String(f.part_id)]) map[String(f.part_id)] = new Set();
      map[String(f.part_id)].add(v.code);
    }
    return map;
  }, [partFitments, vehicles]);

  // filteredParts only recomputes when debounced search/filters change
  const filteredParts = useMemo(() => {
    const words = lq ? lq.split(/\s+/).filter(Boolean) : [];
    return parts.filter((p, i) => {
      if (vehicleFilterIds && !vehicleFilterIds.has(String(p.id))) return false;
      if (filterCat !== "__all__" && p.category !== filterCat) return false;
      if (!words.length) return true;
      const idx = searchIndex[i];
      // barcode exact match
      if (idx.barcode === search.trim()) return true;
      // all words must appear somewhere in raw or expanded index (AND search)
      return words.every(w => {
        const cw = contractQuery(w); // e.g. "lamp" stays, "head lamp" → n/a (single word)
        return idx.raw.includes(w) || idx.expanded.includes(w) || (cw !== w && idx.raw.includes(cw));
      });
    });
  }, [parts, searchIndex, vehicleFilterIds, filterCat, lq, search]);

  const PAGE_SIZE = 15;
  const totalPages = Math.ceil(filteredParts.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageParts = filteredParts.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Debounced setter — input box updates immediately, filter waits 200ms
  const setSearch2 = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(0); }, 200);
  };
  const setFilterCat2 = (v) => { setFilterCat(v); setPage(0); };
  const setVehicleFilter2 = (v) => { setVehicleFilterIds(v); setPage(0); };

  // Barcode Enter handler — exact match auto-adds
  const handleSearchKey = (e) => {
    if (e.key !== "Enter" || !lq) return;
    const exact = parts.find(p => p.sku?.toLowerCase() === lq || p.barcode === searchInput.trim());
    if (exact) { addToCart(exact); setSearch2(""); return; }
    if (filteredParts.length === 1) { addToCart(filteredParts[0]); setSearch2(""); }
  };

  const addToCart = (part) => {
    setCart(prev => {
      const ex = prev.find(i => i.part_id === part.id);
      if (ex) return prev.map(i => i.part_id === part.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { part_id: part.id, sku: part.sku || "", name: part.name, price: +(part.price || 0), qty: 1 }];
    });
    searchRef.current?.focus();
  };

  const removeFromCart = (pid) => setCart(prev => prev.filter(i => i.part_id !== pid));
  const setQty = (pid, q) => {
    if (+q <= 0) { removeFromCart(pid); return; }
    setCart(prev => prev.map(i => i.part_id === pid ? { ...i, qty: +q } : i));
  };
  const setItemPrice = (pid, p) => setCart(prev => prev.map(i => i.part_id === pid ? { ...i, price: +p || 0 } : i));

  const clearAll = () => {
    setCart([]); setDiscount(0); setDiscLocked(true); setSplits([{ method: "cash", amount: "" }]);
    setCustomer(null); setCustSearch(""); setSearch2("");
    setQuoteId(null); setLoadInput(""); setLoadErr("");
  };

  // Save as quote (inserts/updates record, no stock deduction)
  const saveQuote = async () => {
    if (!cart.length) return;
    setSaving(true);
    try {
      const qId = quoteId || makeId("QT");
      const payload = {
        customer_id: customer?.id || null,
        customer_name: customer?.name || "Walk-in",
        customer_phone: customer?.phone || "",
        date: new Date().toISOString().slice(0, 10),
        subtotal, discount, total,
        status: "pos_quote",
        is_pos: true,
        ...(branchId ? { branch_id: branchId } : {}),
      };

      if (quoteId) {
        await api.patch("customer_invoices", "id", quoteId, payload);
        await api.delete("customer_invoice_items", "invoice_id", quoteId);
      } else {
        await api.insert("customer_invoices", { id: qId, ...payload, created_at: new Date().toISOString() });
      }

      for (const it of cart) {
        await api.insert("customer_invoice_items", {
          id: makeId("CIVI"), invoice_id: qId,
          part_id: it.part_id, part_name: it.name, part_sku: it.sku,
          qty: it.qty, unit_price: it.price, total: it.qty * it.price,
        });
      }

      setQuoteId(qId);
      setDone({ invId: qId, cart: [...cart], customer, subtotal, discount, total, splits: [], change: 0, isQuote: true });
      clearAll();
    } finally { setSaving(false); }
  };

  // Load an existing quote into the cart
  const loadQuote = async () => {
    const q = loadInput.trim().toUpperCase();
    if (!q) return;
    setLoadErr("");
    setLoadBusy(true);
    try {
      const invs = await api.get("customer_invoices", `id=eq.${encodeURIComponent(q)}&select=*`);
      if (!invs?.length) { setLoadErr("Quote not found"); return; }
      const inv = invs[0];
      if (inv.status !== "pos_quote") { setLoadErr("Not a pending quote"); return; }

      const items = await api.get("customer_invoice_items", `invoice_id=eq.${encodeURIComponent(q)}&select=*`);
      setCart((items || []).map(it => ({
        part_id: it.part_id,
        sku: it.part_sku || "",
        name: it.part_name || "",
        price: +(it.unit_price || 0),
        qty: +(it.qty || 1),
      })));
      setDiscount(+(inv.discount || 0));
      setQuoteId(q);
      setLoadInput("");

      if (inv.customer_id) {
        const c = customers.find(c => String(c.id) === String(inv.customer_id));
        if (c) setCustomer(c);
      }
    } catch { setLoadErr("Error loading quote"); }
    finally { setLoadBusy(false); }
  };

  // Complete the sale
  const completeSale = async () => {
    if (!cart.length) return;
    if (remaining > 0) { alert(`Still unpaid: ${sym}${remaining.toFixed(2)}`); return; }
    setSaving(true);
    try {
      const cashSplit = splits.find(s => s.method === "cash");
      const payMethod = splits.length === 1 ? splits[0].method : JSON.stringify(splits);
      const cashAmt = cashSplit ? parseFloat(cashSplit.amount) || 0 : 0;
      const invId = await onSave(cart, customer, payMethod, cashAmt, change, discount, quoteId);
      setDone({ invId, cart: [...cart], customer, subtotal, discount, total, splits: [...splits], change, isQuote: false });
      clearAll();
    } finally { setSaving(false); }
  };

  if (done) return <PosDone sale={done} onNewSale={() => setDone(null)} />;

  const hasFilter = vehicleFilterIds || filterCat !== "__all__" || searchInput.trim();

  const _lbPhoto = lightbox ? lightbox.photos[lightbox.index] : null;
  const _lbMulti = lightbox && lightbox.photos.length > 1;
  const _lbNav = (dir) => setLightbox(lb => ({ ...lb, index: (lb.index + dir + lb.photos.length) % lb.photos.length }));
  const navBtn = (dir, label) => (
    <button onClick={e => { e.stopPropagation(); _lbNav(dir); }}
      style={{ position: "absolute", top: "50%", [dir === -1 ? "left" : "right"]: 8, transform: "translateY(-50%)", background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", borderRadius: "50%", width: 44, height: 44, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>{label}</button>
  );

  const Lightbox = lightbox && (
    <div className="overlay" onClick={() => setLightbox(null)}
      style={{ zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,.92)" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "calc(100vw - 32px)", height: "calc(100vh - 32px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <img src={_lbPhoto.url} alt={_lbPhoto.name}
          style={{ width: "100%", height: "calc(100% - 36px)", objectFit: "contain", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,.7)", background: "#fff" }} />
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,.9)", textAlign: "center" }}>
          {_lbPhoto.name}{_lbMulti && <span style={{ color: "rgba(255,255,255,.5)", fontWeight: 400, marginLeft: 10 }}>{lightbox.index + 1} / {lightbox.photos.length}</span>}
        </div>
        {_lbMulti && navBtn(-1, "‹")}
        {_lbMulti && navBtn(1, "›")}
        <button onClick={() => setLightbox(null)}
          style={{ position: "absolute", top: 0, right: 0, background: "rgba(0,0,0,.75)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", borderRadius: "50%", width: 36, height: 36, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        {_lbMulti && (
          <div style={{ position: "absolute", bottom: 36, display: "flex", gap: 6 }}>
            {lightbox.photos.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setLightbox(lb => ({ ...lb, index: i })); }}
                style={{ width: i === lightbox.index ? 20 : 8, height: 8, borderRadius: 4, background: i === lightbox.index ? "#fff" : "rgba(255,255,255,.35)", cursor: "pointer", transition: "all .2s" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Ask-supplier overlay
  const AskSupplierModal = askPart && (() => {
    const linked = partSuppliers
      .filter(ps => String(ps.part_id) === String(askPart.id))
      .map(ps => ({ ...ps, sup: suppliers.find(s => String(s.id) === String(ps.supplier_id)) }))
      .filter(ps => ps.sup);
    const shopName = settings?.shop_name || "AutoParts";
    const msg = (supName) =>
      `Hi ${supName},\n\nCould you please check stock and your best price for:\n\n${askPart.name}${askPart.sku ? ` (${askPart.sku})` : ""}${askPart.oe_number ? `\nOE: ${askPart.oe_number}` : ""}\n\nThank you,\n${shopName}`;
    return (
      <div className="overlay" onClick={() => setAskPart(null)}
        style={{ zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: "var(--surface)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,.35)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>📤 Ask Supplier</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{askPart.name}{askPart.sku ? ` · ${askPart.sku}` : ""}</div>
            </div>
            <button onClick={() => setAskPart(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text3)", lineHeight: 1 }}>✕</button>
          </div>
          {linked.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", padding: "20px 0" }}>
              No suppliers linked to this part.<br/>
              <span style={{ fontSize: 12 }}>Link suppliers in the Inventory tab → Part Suppliers.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {linked.map(ps => {
                const s = ps.sup;
                const m = msg(s.name);
                return (
                  <div key={ps.id} style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{s.name}</div>
                    {ps.supplier_part_no && <div style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--purple)", marginBottom: 6 }}>Supplier code: {ps.supplier_part_no}</div>}
                    {!ps.supplier_part_no && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{s.phone || s.email || "No contact info"}</div>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {s.phone && (
                        <a href={waLink(s.phone, m)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                          <button style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            📲 WhatsApp
                          </button>
                        </a>
                      )}
                      {s.email && (
                        <a href={mailLink(s.email, `Stock check: ${askPart.name}`, m)} style={{ textDecoration: "none" }}>
                          <button style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: 7, padding: "6px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                            ✉ Email
                          </button>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  })();

  const S = { // shared style tokens for the right panel
    panel:  { background: "var(--surface)", borderLeft: "2px solid var(--border)" },
    label:  { fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 5 },
    divider:{ borderTop: "1px solid var(--border)", margin: "2px 0" },
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Mobile: full-screen single panel, toggled by floating cart button
  if (isMobile) return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 110px)", background: "var(--bg)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
      {showPin && <PinModal onSuccess={() => { setDiscLocked(false); setShowPin(false); }} onClose={() => setShowPin(false)} />}
      {Lightbox}
      {AskSupplierModal}

      {mobView === "catalog" ? (
        <>
          {/* Search + filter bar */}
          <div style={{ padding: "8px 10px", borderBottom: "2px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input ref={searchRef} className="inp" value={searchInput}
                  onChange={e => setSearch2(e.target.value)}
                  onKeyDown={handleSearchKey}
                  placeholder="🔍 SKU · part name · barcode…"
                  style={{ fontSize: 14, fontWeight: 600, paddingRight: 32, background: "var(--surface)", border: "2px solid var(--border)" }} />
                {searchInput && (
                  <button onClick={() => setSearch2("")}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 14 }}>✕</button>
                )}
              </div>
              <select className="inp" value={filterCat} onChange={e => setFilterCat2(e.target.value)}
                style={{ width: 130, fontSize: 12, flexShrink: 0, background: "var(--surface)" }}>
                <option value="__all__">All Cat.</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <PosVehicleFilter vehicles={vehicles} partFitments={partFitments} onFilter={setVehicleFilter2} onZoom={setLightbox} />
          </div>

          {/* Parts list */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {!hasFilter ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10, color: "var(--text3)" }}>
                <div style={{ fontSize: 44, opacity: .4 }}>🔎</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)" }}>Search to browse parts</div>
              </div>
            ) : filteredParts.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "var(--text3)" }}>
                <div style={{ fontSize: 36, opacity: .4 }}>🔍</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No parts match</div>
              </div>
            ) : (
              <>
                {pageParts.map((p, idx) => {
                  const inCart = cart.find(i => i.part_id === p.id);
                  const img = toImgUrl(p.image_url);
                  const codes = partCodeMap[String(p.id)];
                  return (
                    <div key={p.id} onClick={() => addToCart(p)} style={{ display: "flex", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border)", background: inCart ? "rgba(249,115,22,.08)" : idx % 2 === 0 ? "transparent" : "rgba(0,0,0,.015)", borderLeft: inCart ? "3px solid var(--accent)" : "3px solid transparent", opacity: p.stock <= 0 ? 0.5 : 1, cursor: p.stock <= 0 ? "not-allowed" : "pointer" }}>
                      {img
                        ? <div style={{ width: 64, height: 64, borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", flexShrink: 0, overflow: "hidden" }}
                            onClick={e => { e.stopPropagation(); setLightbox({ photos: [{ url: img, name: p.name }], index: 0 }); }}>
                            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => e.target.parentElement.style.display = "none"} />
                          </div>
                        : <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{p.image || "🔩"}</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{p.name}</div>
                        {p.sku && <div style={{ fontFamily: "DM Mono,monospace", fontSize: 13, color: "var(--blue)", fontWeight: 700 }}>{p.sku}</div>}
                        {(p.make || p.model) && <div style={{ fontSize: 12, color: "var(--blue)" }}>🚗 {[p.make, p.model, p.year_range].filter(Boolean).join(" · ")}</div>}
                        {codes?.size > 0 && <div style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--accent)", fontWeight: 700 }}>{[...codes].sort().slice(0, 3).join(" · ")}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 17, color: "var(--accent)" }}>{sym}{(p.price || 0).toFixed(2)}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: p.stock > 0 ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)", color: p.stock > 0 ? "var(--green)" : "var(--red)", border: `1px solid ${p.stock > 0 ? "rgba(52,211,153,.3)" : "rgba(248,113,113,.3)"}` }}>{p.stock || 0}</span>
                          {inCart && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>+{inCart.qty} in cart</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {totalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                    <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>{safePage + 1} / {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cart summary bar — always visible at bottom */}
          <button onClick={() => setMobView("cart")}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "12px 16px", background: cartCount > 0 ? "var(--accent)" : "var(--surface2)", border: "none", borderTop: `2px solid ${cartCount > 0 ? "rgba(0,0,0,.1)" : "var(--border)"}`, cursor: "pointer", width: "100%", gap: 10, transition: "background .2s" }}>
            <span style={{ fontSize: 22 }}>🛒</span>
            {cartCount > 0 ? (
              <>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{cartCount} item{cartCount !== 1 ? "s" : ""} selected</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)" }}>Tap to review &amp; pay</div>
                </div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 900, fontSize: 24, color: "#fff" }}>{sym}{total.toFixed(2)}</div>
                <span style={{ color: "#fff", fontSize: 20 }}>›</span>
              </>
            ) : (
              <div style={{ flex: 1, textAlign: "left", color: "var(--text3)", fontSize: 14, fontWeight: 600 }}>Cart is empty</div>
            )}
          </button>
        </>
      ) : (
        /* ══ MOBILE CART VIEW ══ */
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", ...S.panel, borderLeft: "none" }}>
          {/* Back bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "2px solid var(--border)", background: "var(--surface2)" }}>
            <button onClick={() => setMobView("catalog")} style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Parts</button>
            <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>🛒 Cart {cartCount > 0 ? `(${cartCount})` : ""}</span>
            <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 17, color: "var(--accent)" }}>{sym}{total.toFixed(2)}</span>
          </div>

          {/* Rest of cart: quote bar, items, customer, totals, payment */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {/* Quote bar */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: quoteId ? "rgba(96,165,250,.08)" : "var(--surface)" }}>
              {quoteId ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--blue)", fontWeight: 800, fontFamily: "DM Mono,monospace" }}>📋 {quoteId}</span>
                  <span style={{ fontSize: 12, color: "var(--text3)", flex: 1 }}>quote loaded</span>
                  <button className="btn btn-xs btn-ghost" style={{ color: "var(--red)" }} onClick={() => setQuoteId(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 5 }}>
                  <input className="inp" value={loadInput}
                    onChange={e => { setLoadInput(e.target.value.toUpperCase()); setLoadErr(""); }}
                    onKeyDown={e => e.key === "Enter" && loadQuote()}
                    placeholder="Load quote: QT-…" style={{ flex: 1, fontSize: 13, fontFamily: "DM Mono,monospace", padding: "6px 8px" }} />
                  <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
                    onClick={loadQuote} disabled={loadBusy || !loadInput.trim()}>{loadBusy ? "…" : "Load"}</button>
                </div>
              )}
              {loadErr && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 3 }}>{loadErr}</div>}
            </div>

            {/* Cart items */}
            <div style={{ flex: 1, overflowY: "auto", background: "var(--surface)" }}>
              {cart.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--text3)", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 36, opacity: .3 }}>🛒</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Cart is empty</div>
                </div>
              ) : cart.map((it, idx) => (
                <div key={it.part_id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,.02)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{it.name}</div>
                      <div style={{ fontFamily: "DM Mono,monospace", fontSize: 12, color: "var(--blue)", fontWeight: 700 }}>{it.sku}</div>
                    </div>
                    <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }} onClick={() => removeFromCart(it.part_id)}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, width: 34, height: 34, fontWeight: 800, fontSize: 18, cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQty(it.part_id, it.qty - 1)}>−</button>
                    <input className="inp" type="number" min={1} value={it.qty}
                      onChange={e => setQty(it.part_id, e.target.value)}
                      style={{ width: 44, textAlign: "center", padding: "4px 3px", fontSize: 15, fontWeight: 700 }} />
                    <button style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, width: 34, height: 34, fontWeight: 800, fontSize: 18, cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQty(it.part_id, it.qty + 1)}>+</button>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>@</span>
                    <input className="inp" type="number" min={0} step="0.01" value={it.price}
                      onChange={e => setItemPrice(it.part_id, e.target.value)}
                      style={{ flex: 1, textAlign: "right", padding: "4px 6px", fontSize: 14, fontWeight: 700 }} />
                    <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 16, fontWeight: 800, color: "var(--accent)", flexShrink: 0, minWidth: 64, textAlign: "right" }}>{sym}{(it.qty * it.price).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer */}
            <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: customer ? "rgba(52,211,153,.06)" : "var(--surface)" }}>
              {customer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--green)" }}>👤 {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                  <button className="btn btn-xs btn-ghost" onClick={() => { setCustomer(null); setCustSearch(""); }}>✕</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input className="inp" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                    placeholder="👤 Customer (optional)"
                    style={{ fontSize: 13, padding: "6px 10px" }} />
                  {custSearch.length > 0 && (() => {
                    const lq2 = custSearch.toLowerCase();
                    const hits = customers.filter(c => c.name?.toLowerCase().includes(lq2) || c.phone?.includes(custSearch)).slice(0, 5);
                    return (
                      <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 180, overflow: "auto", boxShadow: "0 -4px 20px rgba(0,0,0,.3)", marginBottom: 2 }}>
                        {hits.length > 0 ? hits.map(c => (
                          <button key={c.id} className="btn btn-ghost" style={{ width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 14 }}
                            onClick={() => { setCustomer(c); setCustSearch(""); }}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</button>
                        )) : <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--text3)" }}>No match — Walk-in</div>}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Totals + Payment */}
            <div style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Discount */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text3)", flex: 1 }}>Discount</span>
                {discLocked ? (
                  <button className="btn btn-xs btn-ghost" style={{ fontSize: 12, borderColor: "rgba(251,146,60,.3)", color: "var(--accent)" }} onClick={() => setShowPin(true)}>🔒 PIN</button>
                ) : (
                  <input className="inp" type="number" min={0} step="0.01" value={discount}
                    onChange={e => setDiscount(+e.target.value)}
                    style={{ width: 90, textAlign: "right", padding: "4px 8px", fontSize: 14, fontWeight: 700 }} />
                )}
              </div>
              {/* Total */}
              <div style={{ background: "var(--surface3)", borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "var(--text2)" }}>TOTAL</span>
                <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 900, fontSize: 28, color: "var(--accent)" }}>{sym}{total.toFixed(2)}</span>
              </div>
              {/* Split payments */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={S.label}>Payment</div>
                {splits.map((sp, i) => (
                  <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <select value={sp.method} onChange={e => setSplitMethod(i, e.target.value)}
                      style={{ flex: "0 0 110px", fontSize: 13, padding: "6px 8px", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "DM Sans,sans-serif" }}>
                      {PAY_OPTS.map(([m,,lbl]) => <option key={m} value={m}>{lbl}</option>)}
                    </select>
                    <input className="inp" type="number" min={0} step="0.01" value={sp.amount}
                      onChange={e => setSplitAmount(i, e.target.value)}
                      placeholder={i === 0 && splits.length === 1 ? `${sym} Full amount` : `${sym} Amount`}
                      style={{ flex: 1, textAlign: "right", padding: "6px 10px", fontSize: 14, fontWeight: 700 }} />
                    {splits.length > 1 && (
                      <button onClick={() => removeSplit(i)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={addSplit} style={{ alignSelf: "flex-start", background: "none", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--text3)", fontSize: 12, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>+ Add payment method</button>
                {remaining > 0 && splitTotal > 0 && (
                  <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>Still unpaid: {sym}{remaining.toFixed(2)}</div>
                )}
                {change > 0 && (
                  <div style={{ background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--green)" }}>Change</span>
                    <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 900, fontSize: 20, color: "var(--green)" }}>{sym}{change.toFixed(2)}</span>
                  </div>
                )}
              </div>
              {/* Action buttons */}
              <button onClick={completeSale} disabled={saving || cart.length === 0}
                style={{ width: "100%", padding: "16px 0", borderRadius: 12, border: "none", background: saving || cart.length === 0 ? "var(--surface3)" : "linear-gradient(135deg,#f97316,#fb923c)", color: "#fff", fontWeight: 900, fontSize: 18, cursor: saving || cart.length === 0 ? "not-allowed" : "pointer", boxShadow: cart.length > 0 ? "0 4px 20px rgba(249,115,22,.4)" : "none" }}>
                {saving ? "Saving…" : "✅ Complete Sale"}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: "9px 0", borderColor: "rgba(96,165,250,.4)", color: "var(--blue)" }}
                  onClick={saveQuote} disabled={saving || cart.length === 0}>💾 Save Quote</button>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13, padding: "9px 0", borderColor: "rgba(107,114,128,.3)", color: "var(--text3)" }}
                  onClick={clearAll} disabled={cart.length === 0}>🗑 Clear</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── DESKTOP layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 110px)", minHeight: 500, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,.18)" }}>
      {showPin && <PinModal onSuccess={() => { setDiscLocked(false); setShowPin(false); }} onClose={() => setShowPin(false)} />}
      {Lightbox}
      {AskSupplierModal}

      {/* ══ LEFT: Parts catalog ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", background: "var(--bg)" }}>

        {/* Search + filter bar */}
        <div style={{ padding: "10px 12px", borderBottom: "2px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input ref={searchRef} className="inp" value={searchInput}
                onChange={e => setSearch2(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder="🔍  Scan barcode · SKU · part name · OE number…"
                style={{ fontSize: 14, fontWeight: 600, paddingRight: 32, background: "var(--surface)", border: "2px solid var(--border)", transition: "border-color .15s" }}
                autoFocus />
              {searchInput && (
                <button onClick={() => setSearch2("")}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 14, lineHeight: 1 }}>✕</button>
              )}
            </div>
<select className="inp" value={filterCat} onChange={e => setFilterCat2(e.target.value)}
              style={{ width: 150, fontSize: 13, flexShrink: 0, background: "var(--surface)" }}>
              <option value="__all__">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <PosVehicleFilter vehicles={vehicles} partFitments={partFitments} onFilter={setVehicleFilter2} onZoom={setLightbox} />
        </div>

        {/* Parts table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {!hasFilter ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, color: "var(--text3)" }}>
              <div style={{ fontSize: 52, opacity: .4 }}>🔎</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text2)" }}>Search or filter to browse parts</div>
              <div style={{ fontSize: 12 }}>Type a keyword · scan a barcode · pick make / model</div>
            </div>
          ) : filteredParts.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8, color: "var(--text3)" }}>
              <div style={{ fontSize: 40, opacity: .4 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No parts match</div>
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ width: 96, padding: "8px 8px" }}></th>
                    <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--text3)", letterSpacing: ".04em" }}>PART</th>
                    <th style={{ width: 100, padding: "8px 10px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--text3)", letterSpacing: ".04em" }}>PRICE</th>
                    <th style={{ width: 58, padding: "8px 8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--text3)", letterSpacing: ".04em" }}>QTY</th>
                    <th style={{ width: 58, padding: "8px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageParts.map((p, idx) => {
                    const inCart = cart.find(i => i.part_id === p.id);
                    const img = toImgUrl(p.image_url);
                    const codes = partCodeMap[String(p.id)];
                    return (
                      <tr key={p.id} style={{
                        opacity: p.stock <= 0 ? 0.5 : 1,
                        background: inCart ? "rgba(249,115,22,.07)" : idx % 2 === 0 ? "transparent" : "rgba(0,0,0,.018)",
                        borderLeft: inCart ? "3px solid var(--accent)" : "3px solid transparent",
                        transition: "background .1s",
                      }}>
                        <td style={{ padding: "6px 8px", verticalAlign: "middle" }}>
                          {img
                            ? <div style={{ width: 80, height: 80, borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in", overflow: "hidden" }}
                                onClick={() => setLightbox({ photos: [{ url: img, name: p.name }], index: 0 })}>
                                <img src={img} alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                                  onError={e => e.target.parentElement.style.display = "none"} />
                              </div>
                            : <div style={{ width: 80, height: 80, borderRadius: 8, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, border: "1px solid var(--border)" }}>{p.image || "🔩"}</div>
                          }
                        </td>
                        <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", marginBottom: 2 }}>{p.name}</div>
                          {p.sku && <div style={{ fontFamily: "DM Mono,monospace", fontSize: 15, color: "var(--blue)", fontWeight: 700, marginBottom: 2 }}>{p.sku}</div>}
                          {abbrevLabel(p.name) && <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>{abbrevLabel(p.name)}</div>}
                          {p.brand && <div style={{ fontSize: 12, color: "var(--text3)" }}>{p.brand}</div>}
                          {(p.make || p.model) && (
                            <div style={{ fontSize: 12, color: "var(--blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              🚗 {[p.make, p.model, p.year_range].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {codes?.size > 0 && (() => {
                            const list = [...codes].sort();
                            const show = list.slice(0, 4);
                            return <div style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--accent)", fontWeight: 700 }}>{show.join(" · ")}{list.length > 4 ? ` +${list.length - 4}` : ""}</div>;
                          })()}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 17, color: "var(--accent)", padding: "8px 10px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                          {sym}{(p.price || 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center", verticalAlign: "middle", padding: "8px 6px" }}>
                          <span style={{ display: "inline-block", minWidth: 34, padding: "4px 8px", borderRadius: 6, fontSize: 14, fontWeight: 800, background: p.stock > 0 ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)", color: p.stock > 0 ? "var(--green)" : "var(--red)", border: `1px solid ${p.stock > 0 ? "rgba(52,211,153,.3)" : "rgba(248,113,113,.3)"}` }}>
                            {p.stock || 0}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", verticalAlign: "middle", padding: "8px 6px" }}>
                          {inCart ? (
                            <button onClick={() => setQty(p.id, inCart.qty + 1)}
                              style={{ background: "var(--accent)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", fontWeight: 800, fontSize: 14, cursor: "pointer", minWidth: 42 }}>
                              +{inCart.qty}
                            </button>
                          ) : p.stock <= 0 ? (
                            <button onClick={() => setAskPart(p)} title="Ask supplier for stock & price"
                              style={{ background: "rgba(96,165,250,.12)", border: "1px solid rgba(96,165,250,.35)", color: "var(--blue)", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 14, cursor: "pointer", minWidth: 42 }}>
                              📤
                            </button>
                          ) : (
                            <button onClick={() => addToCart(p)}
                              style={{ background: "var(--surface2)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
                              +
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)", position: "sticky", bottom: 0 }}>
                  <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>
                    Page <strong style={{ color: "var(--text)", fontSize: 13 }}>{safePage + 1}</strong> / {totalPages}
                    <span style={{ marginLeft: 8, color: "var(--text3)" }}>· {filteredParts.length} parts</span>
                  </span>
                  <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══ RIGHT: Register panel ══ */}
      <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", ...S.panel }}>

        {/* Quote bar */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: quoteId ? "rgba(96,165,250,.08)" : "var(--surface)" }}>
          {quoteId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 800, fontFamily: "DM Mono,monospace" }}>📋 {quoteId}</span>
              <span style={{ fontSize: 11, color: "var(--text3)", flex: 1 }}>quote loaded</span>
              <button className="btn btn-xs btn-ghost" style={{ color: "var(--red)" }} onClick={() => setQuoteId(null)}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 5 }}>
              <input className="inp" value={loadInput}
                onChange={e => { setLoadInput(e.target.value.toUpperCase()); setLoadErr(""); }}
                onKeyDown={e => e.key === "Enter" && loadQuote()}
                placeholder="Load quote: QT-…" style={{ flex: 1, fontSize: 12, fontFamily: "DM Mono,monospace", padding: "5px 8px" }} />
              <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12, flexShrink: 0 }}
                onClick={loadQuote} disabled={loadBusy || !loadInput.trim()}>
                {loadBusy ? "…" : "Load"}
              </button>
            </div>
          )}
          {loadErr && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 3 }}>{loadErr}</div>}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", background: "var(--surface)" }}>
          {cart.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 36, opacity: .3 }}>🛒</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Cart is empty</div>
            </div>
          ) : cart.map((it, idx) => (
            <div key={it.part_id} style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,.02)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>{it.name}</div>
                  <div style={{ fontFamily: "DM Mono,monospace", fontSize: 10, color: "var(--text3)" }}>{it.sku}</div>
                </div>
                <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, lineHeight: 1, opacity: .7, padding: 2 }} onClick={() => removeFromCart(it.part_id)}>✕</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, fontWeight: 800, fontSize: 15, cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQty(it.part_id, it.qty - 1)}>−</button>
                <input className="inp" type="number" min={1} value={it.qty}
                  onChange={e => setQty(it.part_id, e.target.value)}
                  style={{ width: 36, textAlign: "center", padding: "2px 3px", fontSize: 13, fontWeight: 700 }} />
                <button style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, fontWeight: 800, fontSize: 15, cursor: "pointer", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQty(it.part_id, it.qty + 1)}>+</button>
                <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 2 }}>@</span>
                <input className="inp" type="number" min={0} step="0.01" value={it.price}
                  onChange={e => setItemPrice(it.part_id, e.target.value)}
                  style={{ flex: 1, textAlign: "right", padding: "2px 5px", fontSize: 13, fontWeight: 700, color: "var(--text)" }} />
                <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 14, fontWeight: 800, color: "var(--accent)", flexShrink: 0, minWidth: 56, textAlign: "right" }}>
                  {sym}{(it.qty * it.price).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Customer */}
        <div style={{ padding: "7px 12px", borderTop: "1px solid var(--border)", background: customer ? "rgba(52,211,153,.06)" : "var(--surface)" }}>
          {customer ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--green)" }}>
                👤 {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}
              </span>
              <button className="btn btn-xs btn-ghost" onClick={() => { setCustomer(null); setCustSearch(""); }}>✕</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input className="inp" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                placeholder="👤 Customer name or phone (optional)"
                style={{ fontSize: 12, padding: "5px 8px" }} />
              {custSearch.length > 0 && (() => {
                const lq2 = custSearch.toLowerCase();
                const hits = customers.filter(c => c.name?.toLowerCase().includes(lq2) || c.phone?.includes(custSearch)).slice(0, 5);
                return (
                  <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 180, overflow: "auto", boxShadow: "0 -4px 20px rgba(0,0,0,.3)", marginBottom: 2 }}>
                    {hits.length > 0 ? hits.map(c => (
                      <button key={c.id} className="btn btn-ghost" style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 13 }}
                        onClick={() => { setCustomer(c); setCustSearch(""); }}>
                        {c.name}{c.phone ? ` · ${c.phone}` : ""}
                      </button>
                    )) : <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text3)" }}>No match — will record as Walk-in</div>}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Bottom: Totals + Payment ── */}
        <div style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Subtotal + Discount */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--text3)" }}>Subtotal</span>
              <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>{sym}{subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "var(--text3)" }}>Discount</span>
              {discLocked ? (
                <button className="btn btn-xs btn-ghost" style={{ fontSize: 11, borderColor: "rgba(251,146,60,.3)", color: "var(--accent)" }} onClick={() => setShowPin(true)}>🔒 Manager PIN</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input className="inp" type="number" min={0} step="0.01" value={discount || ""}
                    onChange={e => setDiscount(+e.target.value || 0)}
                    placeholder="0.00" autoFocus
                    style={{ width: 72, textAlign: "right", padding: "3px 6px", fontSize: 14, color: "var(--green)", fontWeight: 800 }} />
                  <button className="btn btn-xs btn-ghost" title="Lock" onClick={() => { setDiscount(0); setDiscLocked(true); }}>🔒</button>
                </div>
              )}
            </div>
          </div>

          {/* TOTAL — big and bold */}
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "2px solid var(--border)" }}>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: ".02em" }}>TOTAL</span>
            <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 32, fontWeight: 900, color: "var(--accent)", letterSpacing: "-.01em" }}>
              {sym}{total.toFixed(2)}
            </span>
          </div>

          {/* Split payment */}
          <div>
            <div style={S.label}>Payment</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {splits.map((sp, i) => (
                <div key={i} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <select value={sp.method} onChange={e => setSplitMethod(i, e.target.value)}
                    style={{ flex: "0 0 110px", background: "var(--surface)", border: "1.5px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "8px 8px", fontSize: 13, cursor: "pointer" }}>
                    {PAY_OPTS.map(([m,,lbl]) => <option key={m} value={m}>{lbl}</option>)}
                  </select>
                  <input className="inp" type="number" min={0} step="0.01" value={sp.amount}
                    onChange={e => setSplitAmount(i, e.target.value)}
                    placeholder={i === 0 && splits.length === 1 ? total.toFixed(2) : "0.00"}
                    style={{ flex: 1, textAlign: "right", fontSize: 18, fontWeight: 800, padding: "8px 10px" }} />
                  {splits.length > 1 && (
                    <button onClick={() => removeSplit(i)}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text3)", cursor: "pointer", padding: "6px 9px", fontSize: 14, flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={addSplit}
                style={{ background: "none", border: "1.5px dashed var(--border2)", borderRadius: 8, color: "var(--blue)", cursor: "pointer", padding: "7px 0", fontSize: 13, fontWeight: 600, width: "100%", textAlign: "center" }}>
                + Add payment method
              </button>
              {remaining > 0 && splitTotal > 0 && (
                <div style={{ padding: "8px 12px", background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.25)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>Still unpaid</span>
                  <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 900, color: "var(--red)" }}>{sym}{remaining.toFixed(2)}</span>
                </div>
              )}
              {change > 0 && (
                <div style={{ padding: "8px 12px", background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.25)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>Change</span>
                  <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 900, color: "var(--green)" }}>{sym}{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Complete Sale */}
          <button onClick={completeSale} disabled={saving || cart.length === 0}
            style={{ padding: "15px 0", borderRadius: 10, border: "none", background: cart.length === 0 ? "var(--border)" : "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontSize: 16, fontWeight: 900, cursor: cart.length === 0 ? "not-allowed" : "pointer", letterSpacing: ".02em", boxShadow: cart.length > 0 ? "0 4px 16px rgba(34,197,94,.35)" : "none", transition: "all .15s" }}>
            {saving ? "⏳  Processing…" : "✅  Complete Sale"}
          </button>

          {/* Save Quote + Clear */}
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: "8px 0", borderColor: "rgba(96,165,250,.4)", color: "var(--blue)" }}
              onClick={saveQuote} disabled={saving || cart.length === 0}>
              📋 {quoteId ? "Update Quote" : "Save as Quote"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}
              title="Clear cart" onClick={clearAll}>🗑</button>
          </div>
        </div>
      </div>
    </div>
  );
}

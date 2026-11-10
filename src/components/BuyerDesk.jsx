import { useState, useMemo } from "react";
import { C } from "../lib/settings.js";
import { Overlay, MHead } from "./shared.jsx";
import { WsShopRequestDetail } from "./Modals.jsx";

// ── Buyer Desk ────────────────────────────────────────────────────────────────
// One screen for everything the buyer has to source:
//   📦 Replenish  — own stock at/below its minimum
//   🛍️ Shop       — part requests saved by sales from POS ("Ask Supplier")
//   🔧 Workshop   — parts requests coming from the workshops
const isPosReq = s => /^POS request/.test(s.name || "");

const age = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};
const oldestAge = (rows) => rows.length ? age([...rows].sort((a, b) => (a.created_at || "") > (b.created_at || "") ? 1 : -1)[0].created_at) : "—";

// ── 📦 Stock to replenish ─────────────────────────────────────────────────────
function ReplenishPane({ lowStockParts = [], sessions = [], suppliers = [], partSuppliers = [], onCreateRfq, onOpenRfq, onEditPart }) {
  const [search, setSearch] = useState("");
  const [onlyOut, setOnlyOut] = useState(false);
  const [sel, setSel] = useState({});          // { [partId]: qty }
  const [picking, setPicking] = useState(false);
  const [supSel, setSupSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(60);

  const suggest = p => Math.max(1, +p.reorder_qty || Math.max((+p.min_stock || 0) * 2 - (+p.stock || 0), 1));
  const linkedSup = pid => [...new Set(partSuppliers.filter(ps => String(ps.part_id) === String(pid)).map(ps => String(ps.supplier_id)))]
    .map(id => suppliers.find(s => String(s.id) === id)).filter(Boolean);

  // Parts already being sourced through an open auto-RFQ
  const asked = useMemo(() => {
    const m = new Map();
    sessions.filter(s => s.is_auto && ["pending", "sent", "draft"].includes(s.status) && s.auto_part_id).forEach(s => m.set(String(s.auto_part_id), s));
    return m;
  }, [sessions]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => lowStockParts
    .filter(p => (!onlyOut || (+p.stock || 0) <= 0) && (!needle || ((p.name || "") + (p.sku || "")).toLowerCase().includes(needle)))
    .sort((a, b) => ((+a.stock || 0) <= 0 ? 0 : 1) - ((+b.stock || 0) <= 0 ? 0 : 1) || ((+a.stock || 0) / Math.max(+a.min_stock || 1, 1)) - ((+b.stock || 0) / Math.max(+b.min_stock || 1, 1))),
  [lowStockParts, needle, onlyOut]);
  const outCount = lowStockParts.filter(p => (+p.stock || 0) <= 0).length;
  const selIds = Object.keys(sel);

  const toggle = p => setSel(prev => { const n = { ...prev }; if (n[p.id] != null) delete n[p.id]; else n[p.id] = suggest(p); return n; });
  const startRfq = () => {
    const ids = new Set();
    selIds.forEach(id => linkedSup(id).forEach(s => ids.add(String(s.id))));
    setSupSel([...ids]); setPicking(true);
  };
  const createRfq = async () => {
    setBusy(true);
    try {
      const chosen = suppliers.filter(s => supSel.includes(String(s.id)));
      const sel2 = lowStockParts.filter(p => sel[p.id] != null).map(p => ({ ...p, qty_needed: Math.max(1, +sel[p.id] || 1) }));
      const sid = await onCreateRfq(`Restock ${new Date().toISOString().slice(0, 10)}`, "", sel2, chosen);
      setSel({}); setPicking(false);
      if (sid && window.confirm("RFQ created. Open it now to send the supplier links?")) onOpenRfq?.(sid);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className={!onlyOut ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setOnlyOut(false)}>All low ({lowStockParts.length})</button>
        <button className={onlyOut ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setOnlyOut(true)}>🔴 Out of stock ({outCount})</button>
        <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 part or SKU"
          style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, padding: "6px 10px" }} />
      </div>

      {rows.length === 0 && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>✅ Nothing to replenish.</div>}

      <div className="card" style={{ overflow: "hidden" }}>
        {rows.slice(0, limit).map(p => {
          const out = (+p.stock || 0) <= 0;
          const on = sel[p.id] != null;
          const sups = linkedSup(p.id);
          const ask = asked.get(String(p.id));
          return (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: "1px solid var(--border)", background: on ? "rgba(255,154,92,.06)" : "transparent", borderLeft: `3px solid ${out ? "var(--red)" : "var(--yellow)"}` }}>
              <input type="checkbox" checked={on} onChange={() => toggle(p)} style={{ accentColor: "var(--accent)", width: 17, height: 17, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: onEditPart ? "pointer" : "default" }} onClick={() => onEditPart?.(p)}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.sku && <span style={{ fontFamily: "DM Mono,monospace", color: "var(--blue)" }}>{p.sku}</span>}
                  <span style={{ color: out ? "var(--red)" : "var(--yellow)", fontWeight: 700 }}>{+p.stock || 0} / min {+p.min_stock || 0}</span>
                  {sups.length > 0 ? <span>🏭 {sups.slice(0, 2).map(s => s.name).join(", ")}{sups.length > 2 ? ` +${sups.length - 2}` : ""}</span> : <span>no supplier linked</span>}
                  {ask && <span style={{ color: "var(--blue)", fontWeight: 700, cursor: "pointer" }} onClick={() => onOpenRfq?.(ask.id)}>📨 already asked</span>}
                </div>
              </div>
              {on && <input className="inp" type="number" min={1} value={sel[p.id]} onChange={e => setSel(prev => ({ ...prev, [p.id]: e.target.value }))} title="Qty to order"
                style={{ width: 64, textAlign: "center", fontSize: 13, padding: "5px 4px" }} />}
            </div>
          );
        })}
      </div>
      {rows.length > limit && <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setLimit(l => l + 60)}>Show more ({rows.length - limit} left)</button>}

      {selIds.length > 0 && !picking && (
        <div style={{ position: "sticky", bottom: 8, marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 18px rgba(0,0,0,.3)" }}>
          <span style={{ flex: 1, color: "#fff", fontWeight: 700, fontSize: 13 }}>{selIds.length} part{selIds.length !== 1 ? "s" : ""} selected</span>
          <button className="btn btn-ghost btn-xs" style={{ color: "#fff" }} onClick={() => setSel({})}>Clear</button>
          <button className="btn btn-xs" style={{ background: "#fff", color: "var(--accent)", fontWeight: 800 }} onClick={startRfq}>📨 Create RFQ →</button>
        </div>
      )}

      {picking && (
        <Overlay onClose={() => setPicking(false)}>
          <MHead title="📨 Create restock RFQ" sub={`${selIds.length} part${selIds.length !== 1 ? "s" : ""}`} onClose={() => setPicking(false)} />
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Choose suppliers to ask (linked suppliers are pre-ticked).</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, maxHeight: 320, overflowY: "auto" }}>
            {suppliers.map(s => {
              const on = supSel.includes(String(s.id));
              return (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: on ? "rgba(255,154,92,.06)" : "transparent" }}>
                  <input type="checkbox" checked={on} style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
                    onChange={() => setSupSel(prev => on ? prev.filter(x => x !== String(s.id)) : [...prev, String(s.id)])} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPicking(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy || supSel.length === 0} onClick={createRfq}>{busy ? "Creating…" : `Create RFQ (${selIds.length} × ${supSel.length})`}</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── 🛍️ Shop requests (POS "Ask Supplier" from sales) ─────────────────────────
function ShopRequestsPane({ sessions = [], items = [], quotes = [], parts = [], onReply, onOpenRfq }) {
  const sym = C();
  const [filter, setFilter] = useState("new");   // new | asked | replied
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState({});           // { [itemId]: {price,stock,note} }
  const [busy, setBusy] = useState("");

  const posSessions = useMemo(() => sessions.filter(isPosReq), [sessions]);
  const partById = useMemo(() => { const m = new Map(); parts.forEach(p => m.set(String(p.id), p)); return m; }, [parts]);

  const groups = {
    new:     posSessions.filter(s => s.status === "draft"),
    asked:   posSessions.filter(s => s.status === "sent"),
    replied: posSessions.filter(s => s.status === "replied"),
  };

  const needle = search.trim().toLowerCase();
  const shown = groups[filter]
    .filter(s => !needle || (s.name || "").toLowerCase().includes(needle) || items.some(i => i.rfq_id === s.id && ((i.part_name || "") + (i.part_sku || "")).toLowerCase().includes(needle)))
    // oldest waiting first for the work queues, latest first for the replied history
    .sort((a, b) => filter === "replied" ? ((a.created_at || "") < (b.created_at || "") ? 1 : -1) : ((a.created_at || "") > (b.created_at || "") ? 1 : -1));

  const val = (it, k) => edit[it.id]?.[k] ?? (it["reply_" + k] ?? "");
  const setV = (it, k, v) => setEdit(p => ({ ...p, [it.id]: { ...p[it.id], [k]: v } }));
  const fillOurs = (its) => setEdit(p => {
    const n = { ...p };
    its.forEach(it => {
      const part = partById.get(String(it.part_id));
      if (part) n[it.id] = { ...n[it.id], price: part.price || "", stock: part.stock ?? 0 };
    });
    return n;
  });

  const send = async (s, its) => {
    setBusy(s.id);
    try {
      const ok = await onReply(s.id, its.map(i => ({ id: i.id, reply_price: +val(i, "price") || 0, reply_stock: val(i, "stock") === "" ? null : +val(i, "stock"), reply_note: val(i, "note") })));
      if (ok) setEdit(p => { const n = { ...p }; its.forEach(i => delete n[i.id]); return n; });
    } finally { setBusy(""); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[["new", `🆕 New (${groups.new.length})`], ["asked", `📨 With suppliers (${groups.asked.length})`], ["replied", `✅ Replied (${groups.replied.length})`]].map(([k, lbl]) => (
          <button key={k} className={filter === k ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setFilter(k)}>{lbl}</button>
        ))}
        <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 part, SKU or customer"
          style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, padding: "6px 10px" }} />
      </div>

      {shown.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          {filter === "new" ? "🎉 Nothing waiting — no new requests from sales." : "Nothing here."}
        </div>
      )}

      {shown.map(s => {
        const its = items.filter(i => i.rfq_id === s.id);
        const sq = quotes.filter(q => q.rfq_id === s.id);
        const canQuickFill = its.some(i => partById.get(String(i.part_id)));
        const allFilled = its.length > 0 && its.every(i => val(i, "price") !== "" && val(i, "price") !== null);
        return (
          <div key={s.id} className="card" style={{ padding: 14, marginBottom: 12, borderLeft: `3px solid ${filter === "new" ? "var(--blue)" : filter === "asked" ? "var(--yellow)" : "var(--green)"}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(s.name || "").replace(/^POS request\s*·?\s*/, "") || "Request"}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>👤 {s.created_by || "sales"} · {(s.created_at || "").slice(0, 16).replace("T", " ")}</div>
              </div>
              <span className="badge" style={{ background: "var(--surface3)", color: "var(--text2)", whiteSpace: "nowrap" }}>⏱ {age(s.created_at)}</span>
            </div>

            {its.map(it => {
              const part = partById.get(String(it.part_id));
              const prices = sq.filter(q => q.rfq_item_id === it.id && q.unit_price != null).map(q => +q.unit_price);
              const best = prices.length ? Math.min(...prices) : null;
              return (
                <div key={it.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13 }}>{it.part_name} <span style={{ color: "var(--accent)" }}>×{it.qty_needed}</span></span>
                    {it.part_sku && <span style={{ fontFamily: "DM Mono,monospace", fontSize: 11, color: "var(--blue)" }}>{it.part_sku}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 5px", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {part && <span>Ours: <b style={{ color: part.stock > 0 ? "var(--green)" : "var(--red)" }}>{part.stock || 0} in stock</b> · {sym}{(part.price || 0).toFixed(2)}</span>}
                    {!part && <span>Not in inventory</span>}
                    {[it.make, it.model].filter(Boolean).length > 0 && <span>🚗 {[it.make, it.model].filter(Boolean).join(" ")}</span>}
                    {best != null && <span>Best supplier: {sym}{best.toFixed(2)}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="inp" type="number" min={0} step="0.01" placeholder={`Price (${sym})`} value={val(it, "price")} onChange={e => setV(it, "price", e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "6px 8px" }} />
                    <input className="inp" type="number" min={0} placeholder="Stock" value={val(it, "stock")} onChange={e => setV(it, "stock", e.target.value)} style={{ width: 70, fontSize: 13, padding: "6px 8px" }} />
                    <input className="inp" placeholder="Note" value={val(it, "note")} onChange={e => setV(it, "note", e.target.value)} style={{ flex: 1.3, minWidth: 0, fontSize: 13, padding: "6px 8px" }} />
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {canQuickFill && <button className="btn btn-ghost btn-sm" onClick={() => fillOurs(its)} title="Fill price & stock from our inventory">⚡ Use our price &amp; stock</button>}
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--blue)" }} onClick={() => onOpenRfq?.(s.id)}>📨 Ask suppliers</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" disabled={!allFilled || busy === s.id} onClick={() => send(s, its)}>
                {busy === s.id ? "Sending…" : s.status === "replied" ? "📨 Update reply" : "📨 Send reply"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 🔧 Workshop parts requests ────────────────────────────────────────────────
const WS_STATUS = {
  pending:      { icon: "⏳", label: "Pending",      bg: "rgba(255,154,92,.15)", color: "var(--orange)" },
  escalated:    { icon: "⬆️", label: "Escalated",    bg: "rgba(96,165,250,.15)", color: "var(--blue)" },
  main_replied: { icon: "📦", label: "Main replied", bg: "rgba(52,211,153,.15)", color: "var(--green)" },
  replied:      { icon: "✅", label: "Replied",      bg: "rgba(52,211,153,.15)", color: "var(--green)" },
  ordered:      { icon: "🛒", label: "Ordered",      bg: "rgba(22,163,74,.15)",  color: "#16a34a" },
};

function WorkshopPane({ wsRequests = [], parts, settings, suppliers, partSuppliers, inquiries, role, user, handlers }) {
  const [filter, setFilter] = useState("todo");   // todo = pending + escalated
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const todo = wsRequests.filter(r => r.status === "pending" || r.status === "escalated");
  const groups = {
    todo,
    main_replied: wsRequests.filter(r => r.status === "main_replied"),
    ordered: wsRequests.filter(r => r.status === "ordered"),
    all: wsRequests,
  };
  const needle = search.trim().toLowerCase();
  const shown = groups[filter]
    .filter(r => !needle || ((r.workshop_name || "") + (r.job_car || "") + (r.job_complaint || "") + (r.items || "")).toLowerCase().includes(needle))
    .sort((a, b) => filter === "todo" ? ((a.created_at || "") > (b.created_at || "") ? 1 : -1) : ((a.created_at || "") < (b.created_at || "") ? 1 : -1));
  const open = openId ? wsRequests.find(r => r.id === openId) : null;
  const itemsOf = r => { try { return JSON.parse(r.items || "[]"); } catch { return []; } };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[["todo", `⏳ To do (${todo.length})`], ["main_replied", `📦 Main replied (${groups.main_replied.length})`], ["ordered", `🛒 Ordered (${groups.ordered.length})`], ["all", "All"]].map(([k, lbl]) => (
          <button key={k} className={filter === k ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setFilter(k)}>{lbl}</button>
        ))}
        <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 workshop, car or part"
          style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, padding: "6px 10px" }} />
      </div>

      {shown.length === 0 && <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>{filter === "todo" ? "🎉 No workshop requests waiting." : "Nothing here."}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map(r => {
          const its = itemsOf(r);
          const m = WS_STATUS[r.status] || { icon: "•", label: r.status, bg: "var(--surface2)", color: "var(--text3)" };
          return (
            <div key={r.id} className="card" onClick={() => setOpenId(r.id)}
              style={{ padding: "12px 14px", cursor: "pointer", borderLeft: `3px solid ${m.color}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>🔧 {r.workshop_name || "Workshop"}{r.requester_name ? ` · ${r.requester_name}` : ""}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.job_car || "—"}{r.job_complaint ? ` · ${r.job_complaint}` : ""}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                    {its.length} part{its.length !== 1 ? "s" : ""}{its.length > 0 ? `: ${its.slice(0, 3).map(i => i.name || i.label || i.description || i.sku || "").filter(Boolean).join(", ")}${its.length > 3 ? "…" : ""}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, fontWeight: 600, background: m.bg, color: m.color }}>{m.icon} {m.label}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>⏱ {age(r.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <Overlay onClose={() => setOpenId(null)} wide>
          <MHead title="🔧 Workshop parts request" sub={`${open.workshop_name || "Workshop"} — ${open.job_car || ""}`} onClose={() => setOpenId(null)}
            actions={handlers.onDelete && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}
                onClick={async () => { if (!window.confirm("Delete this request?")) return; await handlers.onDelete(open.id); setOpenId(null); }}>🗑️ Delete</button>
            )} />
          <WsShopRequestDetail req={open} parts={parts} settings={settings} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries}
            onSendInquiry={handlers.onSendInquiry} onManualQuote={handlers.onManualQuote} onAcceptQuote={handlers.onAcceptQuote} onCancelOrder={handlers.onCancelOrder} onEditPart={handlers.onEditPart}
            onReply={async (...a) => { await handlers.onReply(...a); setOpenId(null); }}
            onEscalate={handlers.onEscalate} onMainReply={handlers.onMainReply}
            userRole={role} userBranchId={user?.branch_id || null} />
        </Overlay>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function BuyerDeskPage({
  sessions = [], items = [], quotes = [], parts = [], suppliers = [], partSuppliers = [], inquiries = [], settings = {},
  lowStockParts = [], wsRequests = [], overdueAuto = 0, role, user,
  onReply, onCreateRfq, onOpenRfq, onRefresh, onEditPart, wsHandlers = {},
}) {
  const posAll = sessions.filter(isPosReq);
  const posNew = posAll.filter(s => s.status === "draft");
  const wsTodo = wsRequests.filter(r => r.status === "pending" || r.status === "escalated");
  const outCount = lowStockParts.filter(p => (+p.stock || 0) <= 0).length;

  const [tab, setTab] = useState(() => posNew.length ? "shop" : wsTodo.length ? "workshop" : lowStockParts.length ? "replenish" : "shop");
  const [refreshing, setRefreshing] = useState(false);

  const Tile = ({ id, icon, label, value, sub, color }) => (
    <button onClick={() => setTab(id)}
      style={{ flex: "1 1 160px", textAlign: "left", background: tab === id ? "var(--surface3)" : "var(--surface2)", border: `1px solid ${tab === id ? color : "var(--border)"}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{icon} {label}</div>
      <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1.1, color: value > 0 ? color : "var(--text3)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text3)" }}>{sub}</div>
    </button>
  );

  return (
    <div className="fu" style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🧑‍💼 Buyer Desk</h1>
          <p style={{ color: "var(--text3)", fontSize: 13, marginTop: 2 }}>Everything that needs sourcing — stock, shop and workshop — in one place.</p>
        </div>
        {overdueAuto > 0 && <button className="btn btn-sm" style={{ background: "rgba(248,113,113,.15)", color: "var(--red)", border: "1px solid rgba(248,113,113,.4)" }} onClick={() => onOpenRfq?.(null)}>⚠️ {overdueAuto} overdue auto-RFQ</button>}
        <button className="btn btn-ghost btn-sm" onClick={async () => { setRefreshing(true); try { await onRefresh?.(); } finally { setRefreshing(false); } }}>{refreshing ? "…" : "🔄 Refresh"}</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Tile id="replenish" icon="📦" label="Stock to replenish" value={lowStockParts.length} sub={`${outCount} out of stock`} color="var(--red)" />
        <Tile id="shop" icon="🛍️" label="Shop requests" value={posNew.length} sub={`oldest waiting: ${oldestAge(posNew)}`} color="var(--blue)" />
        <Tile id="workshop" icon="🔧" label="Workshop requests" value={wsTodo.length} sub={`oldest waiting: ${oldestAge(wsTodo)}`} color="var(--accent)" />
      </div>

      {tab === "replenish" && <ReplenishPane lowStockParts={lowStockParts} sessions={sessions} suppliers={suppliers} partSuppliers={partSuppliers} onCreateRfq={onCreateRfq} onOpenRfq={onOpenRfq} onEditPart={onEditPart} />}
      {tab === "shop" && <ShopRequestsPane sessions={sessions} items={items} quotes={quotes} parts={parts} onReply={onReply} onOpenRfq={onOpenRfq} />}
      {tab === "workshop" && <WorkshopPane wsRequests={wsRequests} parts={parts} settings={settings} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} role={role} user={user} handlers={wsHandlers} />}
    </div>
  );
}

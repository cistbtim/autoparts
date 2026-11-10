import { useState, useMemo } from "react";
import { C } from "../lib/settings.js";

// ── Buyer Desk ────────────────────────────────────────────────────────────────
// One-screen queue for the buyer: requests that sales saved from POS ("Ask Supplier"), with the
// part's stock / price already on screen so most can be answered inline without opening an RFQ.
const isPosReq = s => /^POS request/.test(s.name || "");

const age = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};

export function BuyerDeskPage({ sessions = [], items = [], quotes = [], parts = [], onReply, onOpenRfq, onRefresh, overdueAuto = 0 }) {
  const sym = C();
  const [filter, setFilter] = useState("new");   // new | asked | replied
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState({});           // { [itemId]: {price,stock,note} }
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const posSessions = useMemo(() => sessions.filter(isPosReq), [sessions]);
  const partById = useMemo(() => { const m = new Map(); parts.forEach(p => m.set(String(p.id), p)); return m; }, [parts]);

  const groups = {
    new:     posSessions.filter(s => s.status === "draft"),
    asked:   posSessions.filter(s => s.status === "sent"),
    replied: posSessions.filter(s => s.status === "replied"),
  };
  const todayStr = new Date().toISOString().slice(0, 10);
  const repliedToday = groups.replied.filter(s => items.some(i => i.rfq_id === s.id && (i.replied_at || "").slice(0, 10) === todayStr)).length;
  const oldestNew = groups.new.length ? age([...groups.new].sort((a, b) => (a.created_at || "") > (b.created_at || "") ? 1 : -1)[0].created_at) : "—";

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

  const Tile = ({ label, value, color, onClick, active }) => (
    <button onClick={onClick} disabled={!onClick}
      style={{ flex: "1 1 120px", textAlign: "left", background: active ? "var(--surface3)" : "var(--surface2)", border: `1px solid ${active ? color : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 28, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </button>
  );

  return (
    <div className="fu" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🧑‍💼 Buyer Desk</h1>
          <p style={{ color: "var(--text3)", fontSize: 13, marginTop: 2 }}>Requests saved by sales from POS — answer here, or send to suppliers.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={async () => { setRefreshing(true); try { await onRefresh?.(); } finally { setRefreshing(false); } }}>{refreshing ? "…" : "🔄 Refresh"}</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Tile label="New from sales" value={groups.new.length} color="var(--blue)" active={filter === "new"} onClick={() => setFilter("new")} />
        <Tile label="Oldest waiting" value={oldestNew} color={groups.new.length ? "var(--accent)" : "var(--text3)"} />
        <Tile label="With suppliers" value={groups.asked.length} color="var(--yellow)" active={filter === "asked"} onClick={() => setFilter("asked")} />
        <Tile label="Replied today" value={repliedToday} color="var(--green)" active={filter === "replied"} onClick={() => setFilter("replied")} />
        {overdueAuto > 0 && <Tile label="Overdue auto-RFQ" value={overdueAuto} color="var(--red)" onClick={() => onOpenRfq?.(null)} />}
      </div>

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

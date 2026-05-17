import { useState, useRef } from "react";
import { getSettings, C } from "../lib/settings.js";

// ── Manager PIN modal ────────────────────────────────────────────────────────
function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const tryPin = (p) => {
    const stored = getSettings().pos_manager_pin || "";
    if (!stored || p === stored) { onSuccess(); }
    else { setErr("Wrong PIN — try again"); setPin(""); }
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
            <div key={i} style={{ width: 44, height: 52, borderRadius: 10, border: `2px solid ${pin.length > i ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, transition: "border-color .15s" }}>
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

// ── Receipt view ─────────────────────────────────────────────────────────────
function PosReceipt({ sale, onNewSale }) {
  const { invId, cart, customer, subtotal, discount, total, payMethod, cashReceived, change } = sale;
  const settings = getSettings();
  const sym = C();
  const now = new Date();

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: 20 }}>
      <div className="card" style={{ padding: 24 }} id="pos-receipt">
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {settings.shop_name && <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{settings.shop_name}</div>}
          {settings.address && <div style={{ fontSize: 12, color: "var(--text3)" }}>{settings.address}</div>}
          {settings.phone && <div style={{ fontSize: 12, color: "var(--text3)" }}>{settings.phone}</div>}
        </div>

        <div style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "8px 0", marginBottom: 12, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text3)" }}>
            <span>#{invId}</span>
            <span>{now.toLocaleString()}</span>
          </div>
          <div style={{ marginTop: 4 }}>👤 {customer?.name || "Walk-in"}{customer?.phone ? ` · ${customer.phone}` : ""}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          {cart.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono,monospace" }}>{it.sku} × {it.qty} @ {sym}{(+it.price).toFixed(2)}</div>
              </div>
              <div style={{ fontWeight: 700, fontFamily: "Rajdhani,sans-serif", fontSize: 14 }}>{sym}{(it.qty * +it.price).toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: "var(--text3)" }}>Subtotal</span>
            <span>{sym}{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, color: "var(--green)" }}>
              <span>Discount</span><span>−{sym}{discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, borderTop: "1px solid var(--border)", paddingTop: 6, marginBottom: 8 }}>
            <span>TOTAL</span>
            <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, color: "var(--accent)" }}>{sym}{total.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
            {payMethod === "cash" ? "💵 Cash" : payMethod === "card" ? "💳 Card" : "📱 QR Code"}
          </div>
          {payMethod === "cash" && cashReceived > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                <span>Cash received</span><span>{sym}{(+cashReceived).toFixed(2)}</span>
              </div>
              {change > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
                  <span>Change</span><span>{sym}{(+change).toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--text3)", borderTop: "1px dashed var(--border)", paddingTop: 14 }}>
          Thank you for your purchase!
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center" }}>
        <button className="btn btn-primary" style={{ padding: "10px 28px" }} onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn btn-ghost" style={{ padding: "10px 28px" }} onClick={onNewSale}>➕ New Sale</button>
      </div>
    </div>
  );
}

// ── Main POS page ────────────────────────────────────────────────────────────
export function PosPage({ parts, customers, onSave }) {
  const sym = C();
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [custSearch, setCustSearch] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discLocked, setDiscLocked] = useState(true);
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const searchRef = useRef(null);

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.max(0, subtotal - discount);
  const cashAmt = payMethod === "cash" && cashReceived !== "" ? +cashReceived : null;
  const change = cashAmt !== null && cashAmt >= total ? cashAmt - total : null;

  const doSearch = (q) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    const lq = q.toLowerCase();
    const found = parts.filter(p =>
      p.sku?.toLowerCase().includes(lq) ||
      p.name?.toLowerCase().includes(lq) ||
      p.barcode?.includes(q)
    ).slice(0, 8);
    // Auto-add on exact match (barcode scanner sends Enter after scan)
    if (found.length === 1 && (found[0].sku?.toLowerCase() === lq || found[0].barcode === q)) {
      addToCart(found[0]); setSearch(""); setResults([]); return;
    }
    setResults(found);
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
  const setQty = (pid, q) => { if (+q <= 0) { removeFromCart(pid); return; } setCart(prev => prev.map(i => i.part_id === pid ? { ...i, qty: +q } : i)); };
  const setPrice = (pid, p) => setCart(prev => prev.map(i => i.part_id === pid ? { ...i, price: +p || 0 } : i));

  const clearAll = () => { setCart([]); setDiscount(0); setDiscLocked(true); setCashReceived(""); setCustomer(null); setSearch(""); setResults([]); };

  const completeSale = async () => {
    if (!cart.length) return;
    if (payMethod === "cash" && cashReceived !== "" && +cashReceived < total) { alert("Cash received is less than total"); return; }
    setSaving(true);
    try {
      const invId = await onSave(cart, customer, payMethod, cashAmt, change, discount);
      setCompletedSale({ invId, cart: [...cart], customer, subtotal, discount, total, payMethod, cashReceived: cashAmt || 0, change: change || 0 });
      clearAll();
    } finally { setSaving(false); }
  };

  if (completedSale) return <PosReceipt sale={completedSale} onNewSale={() => setCompletedSale(null)} />;

  return (
    <div style={{ display: "flex", gap: 14, height: "calc(100vh - 110px)", minHeight: 500 }}>
      {showPin && <PinModal onSuccess={() => { setDiscLocked(false); setShowPin(false); }} onClose={() => setShowPin(false)} />}

      {/* LEFT: Search + Cart + Customer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, overflow: "hidden" }}>
        {/* Search bar */}
        <div className="card" style={{ padding: 12 }}>
          <input ref={searchRef} className="inp" value={search} onChange={e => doSearch(e.target.value)}
            placeholder="🔍 Scan barcode or type SKU / part name…"
            style={{ fontSize: 15, fontWeight: 600 }}
            onKeyDown={e => { if (e.key === "Enter" && results.length > 0) { addToCart(results[0]); setSearch(""); setResults([]); } }}
            autoFocus />
          {results.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              {results.map(p => (
                <button key={p.id} className="btn btn-ghost"
                  style={{ textAlign: "left", padding: "8px 12px", justifyContent: "flex-start", gap: 10, display: "flex", alignItems: "center" }}
                  onClick={() => { addToCart(p); setSearch(""); setResults([]); }}>
                  <span style={{ fontFamily: "DM Mono,monospace", fontSize: 12, color: "var(--text3)", minWidth: 90 }}>{p.sku}</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                  <span style={{ color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>{sym}{(p.price || 0).toFixed(2)}</span>
                  <span style={{ fontSize: 11, color: (p.stock || 0) > 0 ? "var(--green)" : "var(--red)", minWidth: 50, textAlign: "right" }}>×{p.stock || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="card" style={{ flex: 1, overflow: "auto", padding: 0 }}>
          {cart.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: 14, flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 40 }}>🛒</div>
              <div>Cart empty — scan or search a part to begin</div>
            </div>
          ) : (
            <table className="tbl" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th>Part</th>
                  <th style={{ width: 112, textAlign: "center" }}>Qty</th>
                  <th style={{ width: 100, textAlign: "right" }}>Price</th>
                  <th style={{ width: 90, textAlign: "right" }}>Total</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map(it => (
                  <tr key={it.part_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontFamily: "DM Mono,monospace", fontSize: 11, color: "var(--text3)" }}>{it.sku}</div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                        <button className="btn btn-xs btn-ghost" onClick={() => setQty(it.part_id, it.qty - 1)}>−</button>
                        <input className="inp" type="number" min={1} value={it.qty}
                          onChange={e => setQty(it.part_id, e.target.value)}
                          style={{ width: 46, textAlign: "center", padding: "3px 4px" }} />
                        <button className="btn btn-xs btn-ghost" onClick={() => setQty(it.part_id, it.qty + 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input className="inp" type="number" min={0} step="0.01" value={it.price}
                        onChange={e => setPrice(it.part_id, e.target.value)}
                        style={{ width: 84, textAlign: "right", padding: "3px 6px", fontWeight: 700 }} />
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "Rajdhani,sans-serif", fontSize: 15, color: "var(--accent)" }}>
                      {sym}{(it.qty * it.price).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 16, lineHeight: 1 }} onClick={() => removeFromCart(it.part_id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Customer (optional) */}
        <div className="card" style={{ padding: 10 }}>
          {customer ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>👤 {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</span>
              <button className="btn btn-xs btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setCustomer(null)}>✕ Walk-in</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input className="inp" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                placeholder="👤 Customer (optional — search by name or phone)"
                style={{ fontSize: 13 }} />
              {custSearch.length > 0 && (
                <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 50, maxHeight: 160, overflow: "auto", boxShadow: "0 -4px 16px rgba(0,0,0,.25)" }}>
                  {(() => {
                    const lq = custSearch.toLowerCase();
                    const hits = customers.filter(c => c.name?.toLowerCase().includes(lq) || c.phone?.includes(custSearch)).slice(0, 5);
                    return hits.length > 0
                      ? hits.map(c => (
                        <button key={c.id} className="btn btn-ghost" style={{ width: "100%", textAlign: "left", padding: "8px 12px" }}
                          onClick={() => { setCustomer(c); setCustSearch(""); }}>
                          {c.name}{c.phone ? ` · ${c.phone}` : ""}
                        </button>
                      ))
                      : <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text3)" }}>No match — will record as Walk-in</div>;
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Payment panel */}
      <div className="card" style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
        {/* Totals */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: "var(--text3)" }}>Subtotal</span>
            <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 15 }}>{sym}{subtotal.toFixed(2)}</span>
          </div>
          {/* Discount */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text3)", flexShrink: 0 }}>Discount</span>
            {discLocked ? (
              <button className="btn btn-xs btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowPin(true)}>🔒 Manager</button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input className="inp" type="number" min={0} step="0.01" value={discount || ""}
                  onChange={e => setDiscount(+e.target.value || 0)}
                  placeholder="0.00" autoFocus
                  style={{ width: 80, textAlign: "right", padding: "3px 8px", fontSize: 13, color: "var(--green)", fontWeight: 700 }} />
                <button className="btn btn-xs btn-ghost" title="Lock" onClick={() => { setDiscount(0); setDiscLocked(true); }}>🔒</button>
              </div>
            )}
          </div>
          {/* Total */}
          <div style={{ borderTop: "2px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>TOTAL</span>
            <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{sym}{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Payment</div>
          <div style={{ display: "flex", gap: 5 }}>
            {[["cash", "💵 Cash"], ["card", "💳 Card"], ["qr", "📱 QR"]].map(([m, lbl]) => (
              <button key={m} onClick={() => setPayMethod(m)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `2px solid ${payMethod === m ? "var(--accent)" : "var(--border)"}`, background: payMethod === m ? "rgba(251,146,60,.12)" : "var(--surface2)", color: payMethod === m ? "var(--accent)" : "var(--text2)", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Cash received + change */}
        {payMethod === "cash" && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Cash Received</div>
            <input className="inp" type="number" min={0} step="0.01" value={cashReceived}
              onChange={e => setCashReceived(e.target.value)}
              placeholder={total.toFixed(2)}
              style={{ fontSize: 20, fontWeight: 800, textAlign: "right" }} />
            {change !== null && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(52,211,153,.1)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>Change</span>
                <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 800, color: "var(--green)" }}>{sym}{change.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn btn-primary" style={{ padding: "15px 0", fontSize: 16, fontWeight: 800 }}
          onClick={completeSale} disabled={saving || cart.length === 0}>
          {saving ? "⏳ Processing…" : "✅ Complete Sale"}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--text3)", padding: "7px 0" }} onClick={clearAll}>
          🗑 Clear Cart
        </button>
      </div>
    </div>
  );
}

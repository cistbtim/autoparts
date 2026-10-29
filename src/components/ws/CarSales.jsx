import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import { fmtD } from "../../lib/helpers.js";

const normReg = (r) => (r || "").toUpperCase().replace(/\s+/g, "");
const money = (n) => `R${(+n || 0).toLocaleString()}`;

const FOR_SALE = ["pending_confirmation", "pending_review", "available", "reserved"];
const STATUS_TXT = {
  pending_confirmation: ["⏳ Awaiting confirmation", "var(--orange)"],
  pending_review: ["⏳ Car Sales reviewing", "var(--orange)"],
  available: ["✅ For sale", "var(--green)"],
  reserved: ["🔒 Reserved", "var(--blue)"],
  sold: ["🏁 Sold", "var(--text3)"],
};

// The workshop's own "sell this car" offers (car_sales_listings, source workshop_buyout, matched to this
// workshop by the registrations on its jobs). kind: "forsale" | "sold" | "cancelled".
// Cancelled = cancelled workshop jobs whose complaint is "Sell car" — a declined offer deletes the listing,
// so the job is the only record left.
export function WsCarSalesPage({ kind, jobs = [], onOpenJob }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(kind !== "cancelled");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (kind === "cancelled") return;
    let live = true;
    setLoading(true); setErr("");
    api.fresh("car_sales_listings", "source=eq.workshop_buyout&select=*&order=created_at.desc")
      .then((r) => {
        if (!live) return;
        if (!Array.isArray(r)) { setErr(r?.message || "Could not load the cars."); setRows([]); }
        else setRows(r);
        setLoading(false);
      })
      .catch(() => { if (live) { setErr("Could not load the cars."); setLoading(false); } });
    return () => { live = false; };
  }, [kind]);

  const regs = new Set(jobs.map((j) => normReg(j.vehicle_reg)).filter(Boolean));
  const jobOf = (reg) => jobs.find((j) => normReg(j.vehicle_reg) === normReg(reg));

  let list;
  if (kind === "cancelled") {
    list = jobs.filter((j) => j.is_cancelled && /sell\s*car/i.test(j.complaint || ""))
      .sort((a, b) => String(b.date_in || "").localeCompare(String(a.date_in || "")))
      .map((j) => ({ id: j.id, job: j, reg: j.vehicle_reg, title: [j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(" "), who: j.customer_name, note: j.complaint, date: j.date_in }));
  } else {
    list = rows
      .filter((l) => regs.has(normReg(l.vehicle_reg)))
      .filter((l) => (kind === "sold" ? l.status === "sold" : FOR_SALE.includes(l.status)))
      .map((l) => ({
        id: l.id, job: jobOf(l.vehicle_reg), reg: l.vehicle_reg,
        title: [l.year, l.make, l.model].filter(Boolean).join(" "),
        photo: Array.isArray(l.photos) ? l.photos[0] : null,
        status: l.status, km: l.mileage, price: l.status === "sold" ? (+l.sold_price || +l.price) : l.price,
        who: l.status === "sold" ? l.sold_to : "", date: l.status === "sold" ? l.sold_at : l.created_at,
      }));
  }

  const head = { forsale: "🏷️ For Sale Cars", sold: "🏁 Sold Cars", cancelled: "❌ Cancelled Sales" }[kind];
  const total = kind === "cancelled" ? 0 : list.reduce((s, c) => s + (+c.price || 0), 0);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{head}</h1>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
        {list.length} car{list.length === 1 ? "" : "s"}{kind !== "cancelled" && list.length > 0 ? ` · ${money(total)}` : ""}
        {kind === "cancelled" ? " · cancelled jobs with a “Sell car” complaint" : ""}
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {loading ? <div style={{ color: "var(--text3)", padding: 20 }}>Loading…</div>
        : list.length === 0 ? <div style={{ color: "var(--text3)", padding: 20, textAlign: "center" }}>Nothing here yet.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((c) => {
              const st = STATUS_TXT[c.status];
              return (
                <div key={c.id} onClick={() => c.job && onOpenJob && onOpenJob(c.job)}
                  style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, cursor: c.job ? "pointer" : "default" }}>
                  {c.photo ? <img src={c.photo} alt="" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                    : <div style={{ width: 72, height: 54, borderRadius: 8, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🚗</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.reg || "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      {[c.who, c.km ? `${(+c.km).toLocaleString()} km` : "", c.date ? fmtD(String(c.date).slice(0, 10)) : ""].filter(Boolean).join(" · ")}
                    </div>
                    {c.note && <div style={{ fontSize: 11, color: "var(--red)" }}>⚠️ {c.note}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {c.price != null && <div style={{ fontWeight: 800, fontSize: 15 }}>{money(c.price)}</div>}
                    {st && <div style={{ fontSize: 11, fontWeight: 700, color: st[1] }}>{st[0]}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

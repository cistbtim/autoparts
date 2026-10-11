import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../lib/api.js";
import { waLink } from "../lib/helpers.js";
import { marketplaceReady, REVEAL_COST, pointsBalance } from "../lib/marketplace.js";
import { PhotoReviewPanel } from "./PhotoReviewAdmin.jsx";
import { DecoyPanel } from "./DecoyPanel.jsx";

// Admin side of Scrapyard Match: approve reveal requests (deducts the points and gives you the
// scrapyard's contact so you can introduce the two sides), manage each workshop's points, and see usage.

const fmtDT = (s) => (s ? new Date(s).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "");

export function MarketplaceAdminPage({ user, showToast = () => {} }) {
  const [tab, setTab] = useState("requests");
  const [reqs, setReqs] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [searches, setSearches] = useState([]);
  const [yards, setYards] = useState([]);
  const [vehs, setVehs] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!(await marketplaceReady())) { setErr("Run docs/marketplace.sql in the Supabase SQL Editor first."); setLoading(false); return; }
    const [r, l, s, y, v, w] = await Promise.all([
      api.fresh("ms_reveal_requests", "select=*&order=created_at.desc"),
      api.fresh("ms_credit_ledger", "select=*&order=created_at.desc"),
      api.fresh("ms_search_log", "select=*&order=created_at.desc&limit=300"),
      api.fresh("scrapyard_profiles", "select=id,name,city,phone,email,address"),
      api.fresh("scrapyard_vehicles", "select=id,scrapyard_id,make,model,year,status"),
      api.fresh("workshop_profiles", "select=id,name,city,phone,whatsapp,subscription_status"),
    ]).catch(() => [null]);
    if (![r, l, s].every(Array.isArray)) { setErr("Run docs/marketplace.sql in the Supabase SQL Editor first."); setLoading(false); return; }
    setErr("");
    setReqs(r); setLedger(l); setSearches(s);
    setYards(Array.isArray(y) ? y : []); setVehs(Array.isArray(v) ? v : []); setWorkshops(Array.isArray(w) ? w : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const yardBy = useMemo(() => new Map(yards.map(y => [String(y.id), y])), [yards]);
  const balanceOf = (wid) => pointsBalance(ledger.filter(x => x.workshop_id === String(wid)));
  const pending = reqs.filter(r => r.status === "pending");

  const addPoints = async (wid, wname, delta, reason, note, ref) => {
    const res = await api.insert("ms_credit_ledger", { workshop_id: String(wid), workshop_name: wname || "", delta, reason, note: note || "", ref: ref ? String(ref) : null, created_by: user?.username || "admin" }).catch(e => ({ message: e.message }));
    if (!Array.isArray(res)) { showToast("❌ " + (res?.message || "Could not save"), "err"); return false; }
    setLedger(prev => [res[0], ...prev]);
    return true;
  };

  const approve = async (q) => {
    const bal = balanceOf(q.workshop_id);
    if (bal < q.cost && !window.confirm(`${q.workshop_name} has only ${bal} point(s). Approve anyway (balance goes negative)?`)) return;
    const note = window.prompt("Message shown to the workshop (e.g. the scrapyard's name and number) — optional:", "");
    if (note === null) return;
    if (!(await addPoints(q.workshop_id, q.workshop_name, -q.cost, "reveal", q.vehicle_summary, q.id))) return;
    const res = await api.patch("ms_reveal_requests", "id", q.id, { status: "approved", admin_note: note.trim(), resolved_at: new Date().toISOString() });
    if (res && !Array.isArray(res) && (res.code || res.message)) { showToast("❌ " + (res.message || res.code), "err"); return; }
    setReqs(prev => prev.map(x => x.id === q.id ? { ...x, status: "approved", admin_note: note.trim(), resolved_at: new Date().toISOString() } : x));
    showToast(`✅ Approved — ${q.cost} point(s) deducted`);
  };
  const reject = async (q) => {
    const note = window.prompt("Reason shown to the workshop (e.g. already sold) — optional:", "Sorry, this vehicle is no longer available.");
    if (note === null) return;
    const res = await api.patch("ms_reveal_requests", "id", q.id, { status: "rejected", admin_note: note.trim(), resolved_at: new Date().toISOString() });
    if (res && !Array.isArray(res) && (res.code || res.message)) { showToast("❌ " + (res.message || res.code), "err"); return; }
    setReqs(prev => prev.map(x => x.id === q.id ? { ...x, status: "rejected", admin_note: note.trim(), resolved_at: new Date().toISOString() } : x));
    showToast("Declined — no points deducted");
  };
  const adjust = async (w, sign) => {
    const raw = window.prompt(`${sign > 0 ? "Add" : "Remove"} how many points for ${w.name}?`, "5");
    const n = parseInt(raw, 10);
    if (!raw || isNaN(n) || n <= 0) return;
    const note = window.prompt("Note (e.g. paid R100 / refund):", "") ?? "";
    if (await addPoints(w.id, w.name, sign * n, sign > 0 ? "admin_grant" : "admin_adjust", note)) showToast(`${sign > 0 ? "+" : "−"}${n} point(s) for ${w.name}`);
  };

  // Per-workshop usage table
  const wsRows = useMemo(() => {
    const ids = new Set([...workshops.map(w => String(w.id)), ...ledger.map(x => x.workshop_id), ...searches.map(x => x.workshop_id), ...reqs.map(x => x.workshop_id)]);
    return [...ids].map(id => {
      const w = workshops.find(x => String(x.id) === id);
      const name = w?.name || ledger.find(x => x.workshop_id === id)?.workshop_name || searches.find(x => x.workshop_id === id)?.workshop_name || reqs.find(x => x.workshop_id === id)?.workshop_name || `#${id}`;
      const mine = reqs.filter(x => x.workshop_id === id);
      return { id, name, city: w?.city || "", searches: searches.filter(x => x.workshop_id === id).length, requests: mine.length, approved: mine.filter(x => x.status === "approved").length,
        balance: pointsBalance(ledger.filter(x => x.workshop_id === id)), last: searches.find(x => x.workshop_id === id)?.created_at };
    }).filter(r => r.searches || r.requests || ledger.some(x => x.workshop_id === r.id)).sort((a, b) => (b.last || "").localeCompare(a.last || ""));
  }, [workshops, ledger, searches, reqs]);

  const yardRows = useMemo(() => yards.map(y => ({ ...y, count: vehs.filter(v => String(v.scrapyard_id) === String(y.id)).length })).sort((a, b) => b.count - a.count), [yards, vehs]);

  const tabBtn = (id, label) => <button key={id} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(id)}>{label}</button>;

  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>💰 Scrapyard Match — Marketplace</div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} disabled={loading} onClick={load}>{loading ? "⏳" : "🔄"} Refresh</button>
      </div>
      {err && <div className="card" style={{ padding: 14, color: "var(--yellow)", fontSize: 13, marginBottom: 14 }}>{err}</div>}
      {!err && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {tabBtn("requests", `📩 Requests${pending.length ? ` (${pending.length})` : ""}`)}
            {tabBtn("workshops", `🔧 Workshops (${wsRows.length})`)}
            {tabBtn("searches", `🔎 Searches (${searches.length})`)}
            {tabBtn("yards", `🏭 Scrapyards (${yards.length})`)}
            {tabBtn("photos", "📷 Photo review")}
            {tabBtn("decoys", "🪤 Decoys")}
          </div>

          {tab === "requests" && (reqs.length === 0
            ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>No requests yet.</div>
            : reqs.map(q => {
              const y = yardBy.get(String(q.scrapyard_id));
              const toWs = waLink(q.workshop_phone, `Hi ${q.workshop_name || ""}, regarding your request for ${q.vehicle_summary}:\n${y ? `${y.name}${y.phone ? ` — ${y.phone}` : ""}${y.address ? `\n${y.address}` : ""}` : ""}`);
              const toYard = y?.phone ? waLink(y.phone, `Hi ${y.name}, ${q.workshop_name || "a workshop"} (${q.workshop_phone || ""}) is interested in your ${q.vehicle_summary}${q.parts_wanted ? ` — parts: ${q.parts_wanted}` : ""}. Is it still available?`) : null;
              return (
                <div key={q.id} className="card" style={{ padding: 14, marginBottom: 10, borderColor: q.status === "pending" ? "var(--accent)" : "var(--border)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800 }}>{q.workshop_name || `#${q.workshop_id}`}</span>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>{q.workshop_phone}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>{fmtDT(q.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>🚗 {q.vehicle_summary}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>🏭 {y ? `${y.name} · ${y.city || ""}${y.phone ? ` · ${y.phone}` : ""}` : `Scrapyard #${q.scrapyard_id}`}</div>
                  {q.parts_wanted && <div style={{ fontSize: 13, marginTop: 4 }}>🔧 Wants: {q.parts_wanted}</div>}
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>Balance: <b>{balanceOf(q.workshop_id)}</b> · cost {q.cost}</div>
                  {q.status === "pending"
                    ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => approve(q)}>✅ Approve (−{q.cost})</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={() => reject(q)}>❌ Decline</button>
                        {toYard && <a className="btn btn-ghost btn-sm" style={{ color: "#25D366", textDecoration: "none" }} href={toYard} target="_blank" rel="noreferrer">💬 Ask the yard</a>}
                        {q.workshop_phone && <a className="btn btn-ghost btn-sm" style={{ color: "#25D366", textDecoration: "none" }} href={toWs} target="_blank" rel="noreferrer">💬 Message workshop</a>}
                      </div>
                    : <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: q.status === "approved" ? "var(--green)" : "var(--red)" }}>
                        {q.status === "approved" ? "✅ Approved" : "❌ Declined"} · {fmtDT(q.resolved_at)}{q.admin_note ? ` — ${q.admin_note}` : ""}
                        {q.workshop_phone && <a style={{ marginLeft: 10, color: "#25D366", textDecoration: "none" }} href={toWs} target="_blank" rel="noreferrer">💬 Message workshop</a>}
                      </div>}
                </div>
              );
            }))}

          {tab === "workshops" && (
            <div className="card" style={{ overflow: "hidden" }}><div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Workshop</th><th>Points</th><th>Searches</th><th>Requests</th><th>Approved</th><th>Last search</th><th></th></tr></thead>
              <tbody>{wsRows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}<div style={{ fontSize: 11, color: "var(--text3)" }}>{r.city}</div></td>
                  <td style={{ fontWeight: 800, color: r.balance <= 0 ? "var(--red)" : "var(--green)" }}>{r.balance}</td>
                  <td>{r.searches}</td><td>{r.requests}</td><td>{r.approved}</td>
                  <td style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDT(r.last)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => adjust({ id: r.id, name: r.name }, 1)}>+ Points</button>{" "}
                    <button className="btn btn-ghost btn-xs" onClick={() => adjust({ id: r.id, name: r.name }, -1)}>− Points</button>
                  </td>
                </tr>))}
                {!wsRows.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>No workshop has used Scrapyard Match yet. Points are added when a workshop first opens the page.</td></tr>}
              </tbody></table></div></div>
          )}

          {tab === "searches" && (
            <div className="card" style={{ overflow: "hidden" }}><div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>When</th><th>Workshop</th><th>VIN</th><th>Make / model</th><th>Matches</th></tr></thead>
              <tbody>{searches.map(s => (
                <tr key={s.id}><td style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDT(s.created_at)}</td><td>{s.workshop_name || `#${s.workshop_id}`}</td>
                  <td style={{ fontFamily: "DM Mono,monospace", fontSize: 12 }}>{s.vin}</td><td>{[s.make, s.model].filter(Boolean).join(" ")}</td>
                  <td style={{ fontWeight: 700, color: s.match_count ? "var(--green)" : "var(--text3)" }}>{s.match_count}</td></tr>))}
                {!searches.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>No searches yet.</td></tr>}
              </tbody></table></div></div>
          )}

          {tab === "photos" && <PhotoReviewPanel user={user} showToast={showToast} />}
          {tab === "decoys" && <DecoyPanel />}

          {tab === "yards" && (
            <div className="card" style={{ overflow: "hidden" }}><div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Scrapyard</th><th>City</th><th>Phone</th><th>Vehicles listed</th></tr></thead>
              <tbody>{yardRows.map(y => (
                <tr key={y.id}><td style={{ fontWeight: 600 }}>{y.name}</td><td>{y.city}</td><td>{y.phone}</td><td style={{ fontWeight: 700 }}>{y.count}</td></tr>))}
              </tbody></table></div>
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text3)" }}>Only you see names and phone numbers — workshops see just the city.</div></div>
          )}
        </>
      )}
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 14 }}>Reveal cost: {REVEAL_COST} point per approved request. Points are a tracking tool for the pilot, not tamper-proof money.</div>
    </div>
  );
}

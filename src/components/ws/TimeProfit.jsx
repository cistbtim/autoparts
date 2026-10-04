import { useCallback, useEffect, useMemo, useState } from "react";
import { Overlay, MHead } from "../shared.jsx";
import { HelpIcon } from "../HelpIcon.jsx";
import { api } from "../../lib/api.js";
import { fmtAmt, makeId } from "../../lib/helpers.js";
import { SetupNotice } from "./wsSetup.jsx";
import { fmtDur, isDbError, isMissingTable, jobFinancials } from "./wsUtil.js";

const money = (n) => fmtAmt(Math.round((+n || 0) * 100) / 100);
const pad2 = (n) => String(n).padStart(2, "0");

// "01:02:03" for the live clock
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};
const entryMinutes = (e, now) => e.ended_at ? (+e.minutes || 0) : Math.max(0, (now - new Date(e.started_at).getTime()) / 60000);

function useTimeEntries(wsId, jobId) {
  const [entries, setEntries] = useState([]);
  const [missing, setMissing] = useState(false);
  const reload = useCallback(async () => {
    if (!wsId || !jobId) return;
    const q = `workshop_id=eq.${encodeURIComponent(wsId)}&job_id=eq.${encodeURIComponent(jobId)}&order=started_at.desc`;
    const res = await api.getFirst("ws_time_entries", q, 500).catch(e => ({ message: e.message }));
    if (Array.isArray(res)) { setEntries(res); setMissing(false); } else { setEntries([]); setMissing(isMissingTable(res)); }
  }, [wsId, jobId]);
  useEffect(() => { reload(); }, [reload]);
  return { entries, missing, reload };
}

function useLabourPay(wsId, jobId) {
  const [pays, setPays] = useState([]);
  const [payMissing, setPayMissing] = useState(false);
  const reloadPays = useCallback(async () => {
    if (!wsId || !jobId) return;
    const q = `workshop_id=eq.${encodeURIComponent(wsId)}&job_id=eq.${encodeURIComponent(jobId)}`;
    const res = await api.getFirst("ws_labour_pay", q, 500).catch(e => ({ message: e.message }));
    if (Array.isArray(res)) { setPays(res); setPayMissing(false); } else { setPays([]); setPayMissing(isMissingTable(res)); }
  }, [wsId, jobId]);
  useEffect(() => { reloadPays(); }, [reloadPays]);
  return { pays, payMissing, reloadPays };
}

const NAME_KEY = "ws_mech_name";
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };

// ── Card + pop-up on the job screen: timer, time log, and (for managers) profit ──
export function JobTimeProfitCard({ job, items, wsId, wsRole, userName, wsLocked }) {
  const { entries, missing, reload } = useTimeEntries(wsId, job?.id);
  const { pays, payMissing, reloadPays } = useLabourPay(wsId, job?.id);
  const [payEdit, setPayEdit] = useState({});   // labour item id -> { mechanic, pay } being edited
  const [paySaving, setPaySaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState(() => savedName() || userName || job?.mechanic || "");
  const [mh, setMh] = useState("0");
  const [mm, setMm] = useState("30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canSeeMoney = wsRole !== "mechanic";
  const running = entries.filter(e => !e.ended_at);

  useEffect(() => {
    if (!running.length && !open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running.length, open]);

  useEffect(() => { if (open) { reload(); setErr(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fin = useMemo(() => jobFinancials(items, pays), [items, pays]);
  if (!job) return null;
  const labourItems = (items || []).filter(i => i.type === "labour");
  const openCard = () => {
    const m = {};
    for (const it of labourItems) {
      const p = pays.find(x => String(x.item_id) === String(it.id));
      m[it.id] = { mechanic: p?.mechanic_name || "", pay: p ? String(+p.pay || "") : "" };
    }
    setPayEdit(m);
    setOpen(true);
  };
  const setRow = (id, patch) => setPayEdit(p => ({ ...p, [id]: { ...(p[id] || { mechanic: "", pay: "" }), ...patch } }));
  const techNames = [...new Set([job.mechanic, ...entries.map(e => e.mechanic_name), ...pays.map(p => p.mechanic_name)].filter(Boolean))];
  const savePay = async () => {
    setPaySaving(true); setErr("");
    let bad = null;
    for (const it of labourItems) {
      const row = payEdit[it.id] || { mechanic: "", pay: "" };
      const amount = +row.pay || 0;
      const who = (row.mechanic || "").trim();
      const existing = pays.find(x => String(x.item_id) === String(it.id));
      if (amount > 0 || who) {
        const res = await api.upsert("ws_labour_pay", { id: `LP-${it.id}`, workshop_id: String(wsId), job_id: job.id, item_id: String(it.id), mechanic_name: who, pay: amount }).catch(e => ({ message: e.message }));
        if (isDbError(res)) { bad = res; break; }
      } else if (existing) {
        await api.delete("ws_labour_pay", "id", existing.id).catch(() => {});
      }
    }
    setPaySaving(false);
    if (bad) { setErr(isMissingTable(bad) ? "The technician pay table does not exist yet. Run the setup SQL." : `Could not save: ${bad.message || bad.code}`); return; }
    reloadPays();
  };
  const totalMin = entries.reduce((s, e) => s + entryMinutes(e, now), 0);
  const rememberName = (v) => { setName(v); try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ } };
  const fail = (res) => { setErr(isMissingTable(res) ? "The time table does not exist yet. Run the setup SQL (see the Report page)." : `Could not save: ${res.message || res.code}`); };

  const start = async () => {
    if (!name.trim()) { setErr("Type the mechanic's name first."); return; }
    if (running.some(e => (e.mechanic_name || "").toLowerCase() === name.trim().toLowerCase())) { setErr(`${name.trim()} already has a timer running on this job.`); return; }
    setBusy(true); setErr("");
    const res = await api.insert("ws_time_entries", { id: makeId("TE"), workshop_id: String(wsId), job_id: job.id, mechanic_name: name.trim(), started_at: new Date().toISOString() }).catch(e => ({ message: e.message }));
    setBusy(false);
    if (isDbError(res)) { fail(res); return; }
    reload();
  };
  const stop = async (e) => {
    setBusy(true); setErr("");
    const minutes = Math.round(entryMinutes(e, Date.now()) * 10) / 10;
    await api.patch("ws_time_entries", "id", e.id, { ended_at: new Date().toISOString(), minutes }).catch(() => {});
    setBusy(false); reload();
  };
  const addManual = async () => {
    const minutes = (+mh || 0) * 60 + (+mm || 0);
    if (!name.trim()) { setErr("Type the mechanic's name first."); return; }
    if (minutes <= 0) { setErr("Enter the time worked."); return; }
    setBusy(true); setErr("");
    const end = new Date(); const startD = new Date(end.getTime() - minutes * 60000);
    const res = await api.insert("ws_time_entries", { id: makeId("TE"), workshop_id: String(wsId), job_id: job.id, mechanic_name: name.trim(), started_at: startD.toISOString(), ended_at: end.toISOString(), minutes, note: "manual" }).catch(e => ({ message: e.message }));
    setBusy(false);
    if (isDbError(res)) { fail(res); return; }
    reload();
  };
  const remove = async (e) => {
    if (!window.confirm("Delete this time entry?")) return;
    await api.delete("ws_time_entries", "id", e.id).catch(() => {});
    reload();
  };

  const mine = running.find(e => (e.mechanic_name || "").toLowerCase() === name.trim().toLowerCase());
  const lbl = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 };
  const sub = missing ? "One-time setup needed"
    : [running.length ? `⏱ ${running.length} running` : "", totalMin > 0 ? `${fmtDur(totalMin)} logged` : "No time logged yet", canSeeMoney && fin.revenue > 0 ? `Profit ${money(fin.profit)} (${Math.round(fin.margin)}%)` : ""].filter(Boolean).join(" · ");

  return (
    <>
      <button onClick={openCard}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 18px", borderRadius: 14, cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent",
          border: running.length ? "1px solid rgba(16,185,129,.6)" : "1px solid rgba(14,165,233,.4)", background: running.length ? "rgba(16,185,129,.12)" : "rgba(14,165,233,.08)", color: "var(--text)" }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>⏱</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: running.length ? "#059669" : "#0284c7", marginBottom: 2 }}>{canSeeMoney ? "Time & profit" : "Job timer"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{sub}</div>
        </div>
        <span style={{ fontSize: 20, color: "#0284c7" }}>›</span>
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <MHead title={canSeeMoney ? "⏱ Time & profit" : "⏱ Job timer"} sub={[job.vehicle_reg, job.vehicle_make, job.vehicle_model].filter(Boolean).join(" · ")} onClose={() => setOpen(false)} actions={<HelpIcon topic="time-and-profit"/>}/>
          {missing && <SetupNotice what="Time tracking"/>}

          {/* big live clock for this mechanic */}
          <div style={{ textAlign: "center", padding: "18px 12px", borderRadius: 18, marginBottom: 14, color: "#fff",
            background: mine ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#1e3a5f,#2563eb)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", opacity: .8 }}>{mine ? `${mine.mechanic_name} is working` : "Total time on this job"}</div>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 46, lineHeight: 1.1, letterSpacing: ".02em" }}>
              {mine ? clock(now - new Date(mine.started_at).getTime()) : fmtDur(totalMin)}
            </div>
            {mine && <div style={{ fontSize: 12, opacity: .85 }}>{fmtDur(totalMin)} logged in total</div>}
          </div>

          <span style={lbl}>Mechanic</span>
          <input className="inp" value={name} onChange={e => rememberName(e.target.value)} placeholder="Name" style={{ marginBottom: 10, fontSize: 16, fontWeight: 600 }}/>
          {!wsLocked && (mine
            ? <button className="btn" disabled={busy} onClick={() => stop(mine)} style={{ width: "100%", height: 54, fontSize: 17, fontWeight: 800, background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff", border: "none", borderRadius: 14 }}>⏹ Stop timer</button>
            : <button className="btn" disabled={busy || missing} onClick={start} style={{ width: "100%", height: 54, fontSize: 17, fontWeight: 800, background: "linear-gradient(135deg,#059669,#10b981)", color: "#fff", border: "none", borderRadius: 14 }}>▶ Start timer</button>)}
          {err && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(248,113,113,.12)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{err}</div>}

          {/* log */}
          <div style={{ marginTop: 18 }}>
            <span style={lbl}>Time log</span>
            {entries.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)", padding: "6px 2px" }}>Nothing logged yet.</div>}
            {entries.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: e.ended_at ? "var(--surface2)" : "rgba(16,185,129,.12)", marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>👷 {e.mechanic_name || "—"}{!e.ended_at && <span style={{ color: "#059669", marginLeft: 8, fontSize: 12 }}>● running</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>
                    {new Date(e.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{e.note === "manual" ? " · added by hand" : ""}
                  </div>
                </div>
                <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 18 }}>{fmtDur(entryMinutes(e, now))}</div>
                {!wsLocked && (canSeeMoney || (e.mechanic_name || "").toLowerCase() === name.trim().toLowerCase()) && (
                  <button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => remove(e)} title="Delete entry">🗑</button>
                )}
              </div>
            ))}
            {!wsLocked && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>Forgot the timer? Add time:</span>
                <input className="inp" type="number" min="0" inputMode="numeric" value={mh} onChange={e => setMh(e.target.value)} style={{ width: 62, textAlign: "center" }}/><span style={{ fontSize: 12 }}>h</span>
                <input className="inp" type="number" min="0" max="59" inputMode="numeric" value={mm} onChange={e => setMm(e.target.value)} style={{ width: 62, textAlign: "center" }}/><span style={{ fontSize: 12 }}>min</span>
                <button className="btn btn-ghost btn-sm" disabled={busy || missing} onClick={addManual}>+ Add</button>
              </div>
            )}
          </div>

          {/* technician pay per labour line — hidden from mechanics */}
          {canSeeMoney && (
            <div style={{ marginTop: 18 }}>
              <span style={lbl}>Technician pay (per labour item)</span>
              {payMissing && <SetupNotice what="Technician pay"/>}
              {labourItems.length === 0
                ? <div style={{ fontSize: 13, color: "var(--text3)", padding: "4px 2px" }}>Add labour to the quotation first, then record who did each item and what you pay them.</div>
                : (
                  <>
                    <datalist id="ws-tech-names">{techNames.map(n => <option key={n} value={n}/>)}</datalist>
                    {labourItems.map(it => {
                      const row = payEdit[it.id] || { mechanic: "", pay: "" };
                      const sell = +it.total || (+it.unit_price || 0) * (+it.qty || 1);
                      const keep = sell - (+row.pay || 0);
                      return (
                        <div key={it.id} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border2)", marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                            <span style={{ minWidth: 0 }}>👷 {it.description}{(+it.qty || 1) > 1 ? ` ×${it.qty}` : ""}</span>
                            <span style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 15, flexShrink: 0 }}>{money(sell)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input className="inp" list="ws-tech-names" value={row.mechanic} onChange={e => setRow(it.id, { mechanic: e.target.value })} placeholder="Technician" style={{ flex: "2 1 130px", minWidth: 110 }} disabled={wsLocked || payMissing}/>
                            <input className="inp" type="number" inputMode="decimal" min="0" value={row.pay} onChange={e => setRow(it.id, { pay: e.target.value })} placeholder="Pay" style={{ flex: "1 1 80px", minWidth: 80 }} disabled={wsLocked || payMissing}/>
                          </div>
                          {+row.pay > 0 && <div style={{ fontSize: 11, color: keep >= 0 ? "var(--text3)" : "var(--red)", marginTop: 6 }}>You keep {money(keep)} on this item.</div>}
                        </div>
                      );
                    })}
                    {!wsLocked && !payMissing && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {job.mechanic && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPayEdit(p => { const n = { ...p }; for (const it of labourItems) n[it.id] = { ...(n[it.id] || { pay: "" }), mechanic: job.mechanic }; return n; })}>👷 Use {job.mechanic} for all</button>
                        )}
                        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled={paySaving} onClick={savePay}>{paySaving ? "Saving…" : "💾 Save technician pay"}</button>
                      </div>
                    )}
                  </>
                )}
            </div>
          )}

          {/* profit — hidden from mechanics */}
          {canSeeMoney && (
            <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 16, background: "var(--surface2)", border: "1px solid var(--border2)" }}>
              <span style={lbl}>Job profit</span>
              {fin.revenue === 0 ? <div style={{ fontSize: 13, color: "var(--text3)" }}>Add parts and labour to the quotation to see the profit.</div> : (
                <>
                  {[["Sales (parts + labour)", fin.revenue, "var(--text)"], ["Parts cost", -fin.partsCost, "var(--red)"], ...(fin.labourCost > 0 ? [["Technician pay", -fin.labourCost, "var(--red)"]] : [])].map(([l, v, c]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                      <span style={{ color: "var(--text2)" }}>{l}</span><b style={{ color: c, fontFamily: "Rajdhani,sans-serif", fontSize: 16 }}>{v < 0 ? "−" : ""}{money(Math.abs(v))}</b>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 2px", marginTop: 6, borderTop: "1px solid var(--border2)" }}>
                    <span style={{ fontWeight: 800 }}>Profit</span>
                    <span style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 26, color: fin.profit >= 0 ? "var(--green)" : "var(--red)" }}>
                      {money(fin.profit)} <span style={{ fontSize: 14 }}>({Math.round(fin.margin)}%)</span>
                    </span>
                  </div>
                  {totalMin >= 6 && fin.labourRevenue > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
                      ⏱ Labour earns <b>{money(fin.labourRevenue / (totalMin / 60))}</b> per hour worked ({fmtDur(totalMin)} for {money(fin.labourRevenue)}).
                    </div>
                  )}
                  {fin.labourRevenue > 0 && fin.labourCost === 0 && !payMissing && (
                    <div style={{ fontSize: 12, color: "#b45309", background: "rgba(251,191,36,.15)", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>
                      ⚠️ No technician pay recorded yet, so the labour is counted as 100% profit. Fill in the pay above.
                    </div>
                  )}
                  {fin.partsNoCost > 0 && (
                    <div style={{ fontSize: 12, color: "#b45309", background: "rgba(251,191,36,.15)", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>
                      ⚠️ {fin.partsNoCost} part{fin.partsNoCost === 1 ? " has" : "s have"} no cost price, so the profit may look higher than it really is.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Overlay>
      )}
    </>
  );
}

// ── Report section: mechanic performance + most profitable jobs ─────────────
export function WsPerformanceReport({ wsId, jobs = [], jobItems = [] }) {
  const [period, setPeriod] = useState("month"); // month | last | quarter | all
  const [entries, setEntries] = useState([]);
  const [missing, setMissing] = useState(false);
  const [pays, setPays] = useState([]);
  const [payMissing, setPayMissing] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!wsId) return;
      const res = await api.getFirst("ws_labour_pay", `workshop_id=eq.${encodeURIComponent(wsId)}`, 5000).catch(e => ({ message: e.message }));
      if (!alive) return;
      if (Array.isArray(res)) { setPays(res); setPayMissing(false); } else { setPays([]); setPayMissing(isMissingTable(res)); }
    })();
    return () => { alive = false; };
  }, [wsId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!wsId) return;
      const res = await api.getFirst("ws_time_entries", `workshop_id=eq.${encodeURIComponent(wsId)}&order=started_at.desc`, 5000).catch(e => ({ message: e.message }));
      if (!alive) return;
      if (Array.isArray(res)) { setEntries(res); setMissing(false); } else { setEntries([]); setMissing(isMissingTable(res)); }
    })();
    return () => { alive = false; };
  }, [wsId]);

  const range = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth();
    if (period === "month") return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    if (period === "last") return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    if (period === "quarter") return [new Date(y, m - 2, 1), new Date(y, m + 1, 1)];
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }, [period]);
  const inRange = (iso) => { if (!iso) return false; const t = new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime(); return t >= range[0].getTime() && t < range[1].getTime(); };

  const itemsByJob = useMemo(() => {
    const m = {};
    for (const it of jobItems) (m[it.job_id] = m[it.job_id] || []).push(it);
    return m;
  }, [jobItems]);

  const paysByJob = {};
  for (const p of pays) (paysByJob[p.job_id] = paysByJob[p.job_id] || []).push(p);
  const jobById = {};
  for (const j of jobs) jobById[j.id] = j;

  const mechanics = (() => {
    const periodEntries = entries.filter(e => inRange(e.started_at));
    const jobMinutes = {};
    for (const e of periodEntries) jobMinutes[e.job_id] = (jobMinutes[e.job_id] || 0) + entryMinutes(e, now);
    const byMech = {};
    for (const e of periodEntries) {
      const k = (e.mechanic_name || "—").trim() || "—";
      const o = byMech[k] = byMech[k] || { name: k, minutes: 0, jobs: new Set(), labour: 0, earned: 0 };
      const mins = entryMinutes(e, now);
      o.minutes += mins; o.jobs.add(e.job_id);
      const lab = jobFinancials(itemsByJob[e.job_id] || []).labourRevenue;
      if (jobMinutes[e.job_id] > 0) o.labour += lab * (mins / jobMinutes[e.job_id]);
    }
    // technician pay earned on jobs that fall in the period
    for (const p of pays) {
      const j = jobById[p.job_id];
      if (!j || !inRange(j.date_in)) continue;
      const k = (p.mechanic_name || "—").trim() || "—";
      const o = byMech[k] = byMech[k] || { name: k, minutes: 0, jobs: new Set(), labour: 0, earned: 0 };
      o.earned += +p.pay || 0; o.jobs.add(p.job_id);
    }
    return Object.values(byMech).map(o => ({ ...o, jobCount: o.jobs.size })).sort((a, b) => (b.earned - a.earned) || (b.minutes - a.minutes));
  })();

  const profitRows = jobs
    .filter(j => inRange(j.date_in) && !j.is_cancelled && (itemsByJob[j.id] || []).length > 0)
    .map(j => ({ j, f: jobFinancials(itemsByJob[j.id], paysByJob[j.id] || []) }))
    .sort((a, b) => b.f.profit - a.f.profit);

  const totals = profitRows.reduce((s, r) => ({ rev: s.rev + r.f.revenue, cost: s.cost + r.f.partsCost, pay: s.pay + r.f.labourCost, profit: s.profit + r.f.profit }), { rev: 0, cost: 0, pay: 0, profit: 0 });
  const th = { textAlign: "right", fontSize: 11, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>⏱ Job profit & mechanic performance</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["month", "This month"], ["last", "Last month"], ["quarter", "3 months"], ["all", "All time"]].map(([id, label]) => (
            <button key={id} className={"btn btn-xs " + (period === id ? "btn-primary" : "btn-ghost")} onClick={() => setPeriod(id)}>{label}</button>
          ))}
        </div>
      </div>

      {/* totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
        {[["Sales", totals.rev, "var(--text)"], ["Parts cost", totals.cost, "var(--red)"], ["Technician pay", totals.pay, "var(--red)"], ["Profit", totals.profit, totals.profit >= 0 ? "var(--green)" : "var(--red)"], ["Margin", null, "var(--accent)"]].map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text3)" }}>{l}</div>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 800, fontSize: 24, color: c }}>{v === null ? `${totals.rev > 0 ? Math.round((totals.profit / totals.rev) * 100) : 0}%` : money(v)}</div>
          </div>
        ))}
      </div>

      {missing || payMissing
        ? <SetupNotice what="The mechanic report"/>
        : (
          <div className="card" style={{ overflow: "auto", marginBottom: 14 }}>
            <div style={{ padding: "10px 14px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)" }}>👷 Mechanics</div>
            {mechanics.length === 0
              ? <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>No time or technician pay recorded in this period. Mechanics start a timer from the job screen (⏱), and you record each technician's pay there.</div>
              : (
                <table className="tbl" style={{ width: "100%" }}>
                  <thead><tr><th>Mechanic</th><th style={th}>Jobs</th><th style={th}>Hours</th><th style={th}>Avg / job</th><th style={th}>Labour value</th><th style={th}>Per hour</th><th style={th}>Pay earned</th></tr></thead>
                  <tbody>
                    {mechanics.map(m => (
                      <tr key={m.name}>
                        <td style={{ fontWeight: 700 }}>👷 {m.name}</td>
                        <td style={{ textAlign: "right" }}>{m.jobCount}</td>
                        <td style={{ textAlign: "right", fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>{fmtDur(m.minutes)}</td>
                        <td style={{ textAlign: "right" }}>{fmtDur(m.minutes / Math.max(1, m.jobCount))}</td>
                        <td style={{ textAlign: "right", fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>{money(m.labour)}</td>
                        <td style={{ textAlign: "right", color: "var(--green)", fontFamily: "Rajdhani,sans-serif", fontWeight: 700 }}>{m.minutes >= 6 ? money(m.labour / (m.minutes / 60)) : "—"}</td>
                        <td style={{ textAlign: "right", color: "#7c3aed", fontFamily: "Rajdhani,sans-serif", fontWeight: 800 }}>{m.earned > 0 ? money(m.earned) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        )}

      <div className="card" style={{ overflow: "auto" }}>
        <div style={{ padding: "10px 14px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)" }}>💰 Jobs by profit (best first)</div>
        {profitRows.length === 0
          ? <div style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>No jobs with parts or labour in this period.</div>
          : (
            <table className="tbl" style={{ width: "100%" }}>
              <thead><tr><th>Job</th><th style={th}>Sales</th><th style={th}>Parts cost</th><th style={th}>Tech pay</th><th style={th}>Profit</th><th style={th}>Margin</th></tr></thead>
              <tbody>
                {profitRows.slice(0, 15).map(({ j, f }) => (
                  <tr key={j.id}>
                    <td><b style={{ fontFamily: "DM Mono,monospace" }}>{j.vehicle_reg || j.id}</b><span style={{ color: "var(--text3)", fontSize: 12, marginLeft: 8 }}>{j.customer_name || ""}</span>{f.partsNoCost > 0 && <span title="Some parts have no cost price" style={{ marginLeft: 6 }}>⚠️</span>}</td>
                    <td style={{ textAlign: "right", fontFamily: "Rajdhani,sans-serif" }}>{money(f.revenue)}</td>
                    <td style={{ textAlign: "right", color: "var(--red)", fontFamily: "Rajdhani,sans-serif" }}>{money(f.partsCost)}</td>
                    <td style={{ textAlign: "right", color: "var(--red)", fontFamily: "Rajdhani,sans-serif" }}>{f.labourCost > 0 ? money(f.labourCost) : "—"}</td>
                    <td style={{ textAlign: "right", color: f.profit >= 0 ? "var(--green)" : "var(--red)", fontFamily: "Rajdhani,sans-serif", fontWeight: 800 }}>{money(f.profit)}</td>
                    <td style={{ textAlign: "right", color: f.margin < 20 ? "var(--red)" : "var(--text2)", fontWeight: 700 }}>{Math.round(f.margin)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {profitRows.length > 15 && <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--text3)" }}>Showing the best 15 of {profitRows.length} jobs.</div>}
        <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text3)", borderTop: "1px solid var(--border)" }}>Profit = sales minus parts cost minus technician pay. Add cost prices to parts and record technician pay on each job for accurate results. ⚠️ marks jobs with parts that have no cost price.</div>
      </div>
    </div>
  );
}

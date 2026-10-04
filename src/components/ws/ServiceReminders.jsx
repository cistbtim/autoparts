import { useCallback, useEffect, useState } from "react";
import { Overlay, MHead } from "../shared.jsx";
import { HelpIcon } from "../HelpIcon.jsx";
import { api } from "../../lib/api.js";
import { makeId, waLink } from "../../lib/helpers.js";
import { SetupNotice } from "./wsSetup.jsx";
import { isDbError, isMissingTable } from "./wsUtil.js";

// ── date helpers (all dates are plain YYYY-MM-DD, local time) ───────────────
const pad = (n) => String(n).padStart(2, "0");
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonthsYmd = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return toYmd(d); };
const daysUntil = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
};
const niceDate = (ymd) => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const nf = (n) => (+n || 0).toLocaleString();

function dueInfo(r) {
  const d = daysUntil(r.due_date);
  if (d === null) return { text: r.due_km ? `at ${nf(r.due_km)} km` : "No date", color: "var(--text3)", bucket: "later", days: null };
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, color: "var(--red)", bucket: "overdue", days: d };
  if (d === 0) return { text: "Due today", color: "var(--red)", bucket: "soon", days: d };
  if (d <= 30) return { text: `in ${d} day${d === 1 ? "" : "s"}`, color: "#d97706", bucket: "soon", days: d };
  return { text: niceDate(r.due_date), color: "var(--text3)", bucket: "later", days: d };
}

function buildReminderMessage(r, workshopName) {
  const car = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ");
  const when = [
    r.due_date ? `around ${niceDate(r.due_date)}` : "",
    r.due_km ? `at ${nf(r.due_km)} km` : "",
  ].filter(Boolean).join(" or ");
  return `Hi ${r.customer_name || "there"}, this is ${workshopName || "your workshop"}. ` +
    `Your ${car ? car + " " : ""}${r.vehicle_reg ? `(${r.vehicle_reg}) ` : ""}is due for its next service${when ? " " + when : ""}. ` +
    `Reply to this message and we will book a time that suits you. Thank you!`;
}

function useReminders(wsId, jobId) {
  const [rows, setRows] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!wsId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const q = `workshop_id=eq.${encodeURIComponent(wsId)}${jobId ? `&job_id=eq.${encodeURIComponent(jobId)}` : ""}&order=due_date.asc.nullslast`;
    const res = await api.getFirst("ws_service_reminders", q, 1000).catch(e => ({ message: e.message }));
    if (Array.isArray(res)) { setRows(res); setMissing(false); }
    else { setRows([]); setMissing(isMissingTable(res)); }
    setLoading(false);
  }, [wsId, jobId]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, missing, loading, reload };
}

// ── add / edit form ─────────────────────────────────────────────────────────
function ReminderForm({ initial, mileage, wsId, onSaved, onClose }) {
  const [f, setF] = useState(() => ({
    customer_name: "", customer_phone: "", vehicle_reg: "", vehicle_make: "", vehicle_model: "",
    due_date: addMonthsYmd(6), note: "", ...initial,
    due_km: initial?.due_km != null ? String(initial.due_km) : (mileage ? String(mileage + 10000) : ""),
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch) => setF(p => ({ ...p, ...patch }));
  const editing = !!initial?.id;

  const save = async () => {
    if (!f.due_date && !f.due_km) { setErr("Set a due date or a due kilometre reading."); return; }
    if (!f.vehicle_reg.trim() && !f.customer_name.trim()) { setErr("Add the vehicle plate or the customer name."); return; }
    setSaving(true); setErr("");
    const body = {
      workshop_id: String(wsId), job_id: f.job_id || null,
      vehicle_reg: f.vehicle_reg.trim().toUpperCase(), vehicle_make: f.vehicle_make || "", vehicle_model: f.vehicle_model || "",
      customer_name: f.customer_name.trim(), customer_phone: f.customer_phone.trim(),
      due_date: f.due_date || null, due_km: f.due_km ? Math.round(+f.due_km) : null, note: f.note.trim(),
    };
    const res = editing
      ? await api.patch("ws_service_reminders", "id", initial.id, body).catch(e => ({ message: e.message }))
      : await api.insert("ws_service_reminders", { id: makeId("SR"), status: "pending", ...body }).catch(e => ({ message: e.message }));
    setSaving(false);
    if (isDbError(res)) { setErr(isMissingTable(res) ? "The reminders table does not exist yet. See the setup note on the Service Reminders page." : `Could not save: ${res.message || res.code}`); return; }
    onSaved();
  };

  const chip = { padding: "7px 12px", borderRadius: 99, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--text2)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 };
  const base = +mileage || 0;

  return (
    <Overlay onClose={onClose}>
      <MHead title={editing ? "✏️ Edit service reminder" : "🔔 Next service reminder"} onClose={onClose} actions={<HelpIcon topic="service-reminders"/>}
        sub={[f.vehicle_reg, f.vehicle_make, f.vehicle_model].filter(Boolean).join(" · ") || undefined}/>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <span style={lbl}>Remind the customer on</span>
          <input className="inp" type="date" value={f.due_date || ""} onChange={e => set({ due_date: e.target.value })} style={{ fontSize: 16, fontWeight: 600 }}/>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {[3, 6, 12].map(m => <button key={m} type="button" style={chip} onClick={() => set({ due_date: addMonthsYmd(m) })}>+{m} months</button>)}
          </div>
        </div>
        <div>
          <span style={lbl}>Or at this mileage (km)</span>
          <input className="inp" type="number" inputMode="numeric" value={f.due_km} placeholder="e.g. 105000" onChange={e => set({ due_km: e.target.value })} style={{ fontSize: 16, fontWeight: 600 }}/>
          {base > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>Now {nf(base)} km:</span>
              {[5000, 10000, 15000].map(k => <button key={k} type="button" style={chip} onClick={() => set({ due_km: String(base + k) })}>+{nf(k)}</button>)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={lbl}>Customer</span>
            <input className="inp" value={f.customer_name} onChange={e => set({ customer_name: e.target.value })} placeholder="Name"/>
          </div>
          <div style={{ flex: 1 }}>
            <span style={lbl}>Phone (WhatsApp)</span>
            <input className="inp" type="tel" value={f.customer_phone} onChange={e => set({ customer_phone: e.target.value })} placeholder="+27…"/>
          </div>
        </div>
        {!initial?.job_id && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><span style={lbl}>Plate</span><input className="inp" value={f.vehicle_reg} onChange={e => set({ vehicle_reg: e.target.value.toUpperCase() })} placeholder="ABC123GP"/></div>
            <div style={{ flex: 1 }}><span style={lbl}>Make</span><input className="inp" value={f.vehicle_make} onChange={e => set({ vehicle_make: e.target.value })} placeholder="BMW"/></div>
            <div style={{ flex: 1 }}><span style={lbl}>Model</span><input className="inp" value={f.vehicle_model} onChange={e => set({ vehicle_model: e.target.value })} placeholder="F30"/></div>
          </div>
        )}
        <div>
          <span style={lbl}>Note (optional)</span>
          <input className="inp" value={f.note} onChange={e => set({ note: e.target.value })} placeholder="e.g. Full service + brake fluid"/>
        </div>
        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(248,113,113,.12)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "💾 Save reminder"}</button>
        </div>
      </div>
    </Overlay>
  );
}

function ReminderCard({ r, wsLocked, onSend, onStatus, onEdit }) {
  const di = dueInfo(r);
  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 10, borderLeft: `4px solid ${di.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "DM Mono,monospace", letterSpacing: ".04em" }}>{r.vehicle_reg || "—"}
            <span style={{ fontFamily: "inherit", fontWeight: 600, fontSize: 13, color: "var(--text2)", marginLeft: 8, letterSpacing: 0 }}>{[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ")}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 3 }}>👤 {r.customer_name || "—"}{r.customer_phone ? ` · ${r.customer_phone}` : ""}</div>
          {r.note && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>📝 {r.note}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: di.color }}>{di.text}</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {r.due_date ? niceDate(r.due_date) : ""}{r.due_date && r.due_km ? " · " : ""}{r.due_km ? `${nf(r.due_km)} km` : ""}
          </div>
          {r.status === "sent" && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, marginTop: 3 }}>✓ Reminder sent{r.sent_at ? ` ${niceDate(toYmd(new Date(r.sent_at)))}` : ""}</div>}
          {r.status === "done" && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, marginTop: 3 }}>✅ Done</div>}
          {r.status === "dismissed" && <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, marginTop: 3 }}>Dismissed</div>}
        </div>
      </div>
      {!wsLocked && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(r.status === "pending" || r.status === "sent") ? (<>
            <button className="btn btn-sm" style={{ background: "rgba(37,211,102,.14)", color: "#16a34a", border: "1px solid rgba(37,211,102,.4)", fontWeight: 700 }} onClick={() => onSend(r)}>💬 {r.status === "sent" ? "Send again" : "WhatsApp"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onStatus(r, { status: "done" })}>✅ Done</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>✏️ Edit</button>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--text3)" }} onClick={() => onStatus(r, { status: "dismissed" })}>✕ Dismiss</button>
          </>) : (
            <button className="btn btn-ghost btn-sm" onClick={() => onStatus(r, { status: "pending" })}>↩ Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderSection({ title, color, list, ...cardProps }) {
  if (list.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color, margin: "0 2px 8px" }}>{title} · {list.length}</div>
      {list.map(r => <ReminderCard key={r.id} r={r} {...cardProps}/>)}
    </div>
  );
}

// ── Service Reminders page (workshop sidebar tab) ───────────────────────────
export function WsServiceRemindersPage({ wsId, wsProfile, wsLocked }) {
  const { rows, missing, loading, reload } = useReminders(wsId);
  const [view, setView] = useState("upcoming"); // upcoming | done
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);       // null | {} (new) | reminder (edit)

  const s = q.trim().toLowerCase();
  const matches = (r) => !s || [r.vehicle_reg, r.customer_name, r.vehicle_make, r.vehicle_model, r.note].some(v => (v || "").toLowerCase().includes(s));
  const upcoming = rows.filter(r => (r.status === "pending" || r.status === "sent") && matches(r));
  const closed = rows.filter(r => (r.status === "done" || r.status === "dismissed") && matches(r));
  const groups = { overdue: [], soon: [], later: [] };
  upcoming.forEach(r => groups[dueInfo(r).bucket].push(r));
  groups.overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  const setStatus = async (r, patch) => { await api.patch("ws_service_reminders", "id", r.id, patch).catch(() => {}); reload(); };
  const sendWa = (r) => {
    if (!(r.customer_phone || "").trim()) { alert("This reminder has no phone number. Edit it and add one first."); return; }
    window.open(waLink(r.customer_phone, buildReminderMessage(r, wsProfile?.name)), "_blank");
    setStatus(r, { status: "sent", sent_at: new Date().toISOString() });
  };

  const list = view === "upcoming" ? upcoming : closed;
  const cardProps = { wsLocked, onSend: sendWa, onStatus: setStatus, onEdit: setForm };
  return (
    <div className="fu">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>🔔 Service Reminders <HelpIcon topic="service-reminders"/></div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>Bring customers back for their next service with one tap on WhatsApp.</div>
        </div>
        {!wsLocked && !missing && <button className="btn btn-primary btn-sm" onClick={() => setForm({})}>+ Add reminder</button>}
      </div>

      {missing && <SetupNotice what="Service reminders"/>}

      {!missing && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {[["upcoming", `Upcoming (${rows.filter(r => r.status === "pending" || r.status === "sent").length})`], ["done", `Done / dismissed (${rows.filter(r => r.status === "done" || r.status === "dismissed").length})`]].map(([id, label]) => (
              <button key={id} className={"btn btn-sm " + (view === id ? "btn-primary" : "btn-ghost")} onClick={() => setView(id)}>{label}</button>
            ))}
            <input className="inp" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plate or customer…" style={{ flex: "1 1 180px", minWidth: 150 }}/>
          </div>

          {loading && rows.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "var(--text3)" }}>Loading…</div>}

          {view === "upcoming" ? (
            <>
              <ReminderSection title="Overdue" color="var(--red)" list={groups.overdue} {...cardProps}/>
              <ReminderSection title="Due in the next 30 days" color="#d97706" list={groups.soon} {...cardProps}/>
              <ReminderSection title="Later" color="var(--text3)" list={groups.later} {...cardProps}/>
            </>
          ) : list.map(r => <ReminderCard key={r.id} r={r} {...cardProps}/>)}

          {!loading && list.length === 0 && (
            <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text3)" }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>🔔</div>
              {view === "upcoming"
                ? <>No reminders yet. Open any job and tap <b>Next service reminder</b>, or click <b>+ Add reminder</b>.</>
                : "Nothing here yet."}
            </div>
          )}
        </>
      )}

      {form && <ReminderForm initial={form.id ? form : {}} mileage={0} wsId={wsId} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }}/>}
    </div>
  );
}

// ── Card + pop-up on the job screen ─────────────────────────────────────────
export function JobReminderCard({ job, wsId, wsLocked }) {
  const { rows, missing, reload } = useReminders(wsId, job?.id);
  const [open, setOpen] = useState(false);
  const current = rows.find(r => r.status === "pending" || r.status === "sent") || null;
  if (!job) return null;
  const di = current ? dueInfo(current) : null;
  return (
    <>
      <button onClick={() => !wsLocked && setOpen(true)} disabled={wsLocked}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 18px", borderRadius: 14, cursor: wsLocked ? "default" : "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent",
          border: current ? "1px solid rgba(139,92,246,.45)" : "1px dashed rgba(139,92,246,.5)", background: "rgba(139,92,246,.08)", color: "var(--text)" }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>🔔</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", marginBottom: 2 }}>Next service reminder</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {missing ? "One-time setup needed — open Service Reminders"
              : current ? <>Due {current.due_date ? niceDate(current.due_date) : ""}{current.due_date && current.due_km ? " · " : ""}{current.due_km ? `${nf(current.due_km)} km` : ""} <b style={{ color: di.color }}>({di.text})</b></>
              : "Set when this car should come back for its next service"}
          </div>
        </div>
        <span style={{ fontSize: 20, color: "#7c3aed" }}>›</span>
      </button>
      {open && (
        <ReminderForm wsId={wsId} mileage={+job.mileage || 0} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }}
          initial={current ? current : {
            job_id: job.id, vehicle_reg: job.vehicle_reg || "", vehicle_make: job.vehicle_make || "", vehicle_model: job.vehicle_model || "",
            customer_name: job.customer_name || "", customer_phone: job.customer_phone || "",
          }}/>
      )}
    </>
  );
}

import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import { fmtAmt, fmtD, makeId, makeToken, waLink } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";
import { computeAccount, loadMechanicData, sameName, ENTRY_TYPES, DEFAULT_DIRECTION } from "../../lib/mechanicPay.js";

const SQL_HINT = "Run the Mechanic Pay SQL in Supabase first (workshop_contacts.pay_token and workshop_contact_ledger), then try again.";
const todayStr = () => new Date().toISOString().slice(0, 10);

const signed = (n) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${fmtAmt(Math.abs(n))}`;
const balanceColor = (b) => (b > 0 ? "var(--accent)" : b < 0 ? "var(--red)" : "var(--text3)");
const balanceText = (b) => (b > 0 ? "We owe him" : b < 0 ? "He owes us" : "Settled");

// The workshop's mechanic / painter accounts: earned from finished jobs, charges, supplier invoices paid for them,
// payments (cash / EFT), refunds and discounts, plus a permanent read-only statement link they can open any time.
// `focusName` (+ `embedded`) opens straight onto one person's account, e.g. from the quote screen's Labour quotes row.
export function WsMechanicPayPage({ wsId, wsProfile, wsLocked = false, focusName = null, focusRole = "mechanic", focusPhone = "", embedded = false }) {
  const [contacts, setContacts] = useState([]);
  const [data, setData] = useState({ replies: [], jobs: [], ledger: [] });
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [entry, setEntry] = useState(null);       // entry modal state
  const [person, setPerson] = useState(null);     // add-person modal state
  const [link, setLink] = useState(null);         // statement-link modal state
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!wsId) return;
    setErr("");
    try {
      const cs = await api.fresh("workshop_contacts", `workshop_id=eq.${encodeURIComponent(wsId)}&order=name.asc`);
      if (!Array.isArray(cs)) throw new Error(cs?.message || "Could not load contacts");
      setContacts(cs);
      setData(await loadMechanicData(api, { wsId, contacts: cs }));
      const sp = await api.fresh("workshop_suppliers", `workshop_id=eq.${encodeURIComponent(wsId)}&select=name`).catch(() => []);
      setSuppliers(Array.isArray(sp) ? sp.map((s) => s.name).filter(Boolean) : []);
    } catch (e) { setErr(`${e.message || e}. ${SQL_HINT}`); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [wsId]);
  useEffect(() => {
    if (!focusName || loading) return;
    const c = contacts.find((x) => sameName(x.name, focusName));
    if (c) setSel(c.id);
  }, [focusName, loading, contacts]);

  const accountFor = (c) => computeAccount({
    replies: data.replies.filter((r) => sameName(r.mechanic_name, c.name)),
    jobs: data.jobs,
    ledger: data.ledger.filter((e) => e.contact_id === c.id),
  });
  const rows = contacts.map((c) => ({ c, a: accountFor(c) }));
  const selected = sel ? rows.find((r) => r.c.id === sel) : null;

  // ── add person ──
  const savePerson = async () => {
    const p = person;
    if (!p.name.trim()) return;
    setBusy(true);
    const res = await api.insert("workshop_contacts", { id: makeId("WCT"), workshop_id: wsId, name: p.name.trim(), phone: p.phone.trim() || null, role: p.role, created_at: new Date().toISOString() }).catch((e) => ({ message: e.message }));
    setBusy(false);
    if (res && !Array.isArray(res) && (res.code || res.message)) { alert(`❌ ${res.message || res.code}`); return; }
    setPerson(null); load();
  };

  // ── ledger entry ──
  const openEntry = (type, c) => setEntry({ type, contactId: c.id, amount: "", date: todayStr(), method: "Cash", reference: "", supplier_name: "", invoice_no: "", description: "", job_id: "", direction: DEFAULT_DIRECTION[type] });
  const saveEntry = async () => {
    const e = entry;
    const amount = +e.amount;
    if (!(amount > 0)) { alert("Enter an amount above zero."); return; }
    if (e.type === "supplier_invoice" && !e.supplier_name.trim()) { alert("Say which supplier the invoice is from."); return; }
    if (e.type === "charge" && !e.description.trim()) { alert("Say what you sold him."); return; }
    setBusy(true);
    const rec = {
      id: makeId("WCL"), workshop_id: wsId, contact_id: e.contactId, entry_type: e.type, direction: +e.direction, amount,
      method: (e.type === "payment" || e.type === "refund") ? e.method : null,
      reference: e.reference.trim() || null, supplier_name: e.supplier_name.trim() || null, invoice_no: e.invoice_no.trim() || null,
      description: e.description.trim() || null, job_id: e.job_id || null, entry_date: e.date || todayStr(), created_at: new Date().toISOString(),
    };
    const res = await api.insert("workshop_contact_ledger", rec).catch((x) => ({ message: x.message }));
    setBusy(false);
    if (res && !Array.isArray(res) && (res.code || res.message)) { alert(`❌ ${res.message || res.code}\n\n${SQL_HINT}`); return; }
    setEntry(null); load();
  };
  const deleteEntry = async (id) => {
    if (!window.confirm("Delete this entry? The balance will change.")) return;
    await api.delete("workshop_contact_ledger", "id", id);
    load();
  };

  // ── statement link (permanent, created once) ──
  const openLink = async (c) => {
    setLink({ c, url: "", busy: true, err: "" });
    try {
      const cur = await api.fresh("workshop_contacts", `id=eq.${encodeURIComponent(c.id)}&select=pay_token`);
      if (!Array.isArray(cur)) throw new Error(cur?.message || "Could not read the contact");
      let tk = cur[0]?.pay_token;
      if (!tk) {
        tk = makeToken() + makeToken();
        const r = await api.patch("workshop_contacts", "id", c.id, { pay_token: tk });
        if (r && !Array.isArray(r) && (r.code || r.message)) throw new Error(r.message || r.code);
      }
      setLink({ c, url: `${window.location.origin}${window.location.pathname}?mechpay=${tk}`, busy: false, err: "" });
    } catch (e) { setLink({ c, url: "", busy: false, err: `${e.message || e}. ${SQL_HINT}` }); }
  };

  const th = { textAlign: "left", fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 10px", borderBottom: "1px solid var(--border)" };
  const td = { padding: "9px 10px", borderBottom: "1px solid var(--border)", fontSize: 13 };
  const num = { ...td, textAlign: "right", fontFamily: "DM Mono,monospace", whiteSpace: "nowrap" };

  // ═════════ detail view ═════════
  if (selected) {
    const { c, a } = selected;
    const myLedger = data.ledger.filter((e) => e.contact_id === c.id);
    const myJobs = a.jobRows;
    const jobLabel = (jid) => { const j = data.jobs.find((x) => String(x.id) === String(jid)); return j ? (j.vehicle_reg || j.id) : jid; };
    return (
      <div>
        {!embedded && <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)} style={{ marginBottom: 12 }}>← All mechanics</button>}
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{c.role === "painter" ? "🎨" : "🔧"} {c.name}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{c.role === "painter" ? "Painter" : "Mechanic"}{c.phone ? ` · ${c.phone}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{balanceText(a.balance)}</div>
              <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 30, fontWeight: 700, color: balanceColor(a.balance) }}>{fmtAmt(Math.abs(a.balance))}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 14 }}>
            {[...(a.opening ? [["Opening balance", a.opening, "var(--text)"]] : []), ["Earned (finished jobs)", a.earned, "var(--text)"], ["Credits (refund / discount)", a.credits, "var(--green)"], ["Charges & deductions", -a.deductions, "var(--red)"], ["Paid to him", -a.paid, "var(--blue)"]].map(([lb, v, col]) => (
              <div key={lb} style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{lb}</div>
                <div style={{ fontWeight: 700, color: col, fontFamily: "DM Mono,monospace", marginTop: 2 }}>{v === 0 ? fmtAmt(0) : signed(v)}</div>
              </div>
            ))}
          </div>
          {!wsLocked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {Object.entries(ENTRY_TYPES).map(([k, t]) => (
                <button key={k} className={`btn btn-sm ${k === "payment" ? "btn-primary" : "btn-ghost"}`} onClick={() => openEntry(k, c)}>{t.icon} {t.short}</button>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ color: "#25D366" }} onClick={() => openLink(c)}>🔗 Statement link</button>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 0, marginBottom: 14, overflowX: "auto" }}>
          <div style={{ padding: "12px 14px", fontWeight: 700 }}>Jobs · priced replies</div>
          {myJobs.length === 0 ? <div style={{ padding: "0 14px 14px", color: "var(--text3)", fontSize: 13 }}>No priced replies from {c.name} yet. Replies come from the job card link, matched by name.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Job</th><th style={th}>Date</th><th style={th}>Status</th><th style={{ ...th, textAlign: "right" }}>His price</th></tr></thead>
              <tbody>
                {myJobs.map((r) => (
                  <tr key={r.job.id}>
                    <td style={td}><b>{r.job.vehicle_reg || r.job.id}</b><div style={{ fontSize: 11, color: "var(--text3)" }}>{[r.job.vehicle_make, r.job.vehicle_model].filter(Boolean).join(" ")}</div></td>
                    <td style={td}>{r.job.date_in || ""}</td>
                    <td style={td}>{r.rejected ? <span style={{ color: "var(--red)", fontWeight: 700 }}>❌ Price rejected · not counted</span> : r.done ? <span style={{ color: "var(--green)", fontWeight: 700 }}>✅ Finished · counted{r.accepted ? " · accepted" : ""}</span> : <span style={{ color: "var(--text3)" }}>⏳ {r.job.status || "In progress"} · not counted yet</span>}</td>
                    <td style={num}>{fmtAmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "12px 14px", fontWeight: 700 }}>Account entries</div>
          {myLedger.length === 0 ? <div style={{ padding: "0 14px 14px", color: "var(--text3)", fontSize: 13 }}>Nothing yet. Use the buttons above to record a payment, a charge, a supplier invoice, a refund or a discount.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Type</th><th style={th}>Details</th><th style={{ ...th, textAlign: "right" }}>Amount</th>{!wsLocked && <th style={th}></th>}</tr></thead>
              <tbody>
                {myLedger.map((e) => {
                  const t = ENTRY_TYPES[e.entry_type] || { icon: "•", short: e.entry_type };
                  const v = (+e.direction || 0) * (+e.amount || 0);
                  const details = [e.supplier_name && `Supplier: ${e.supplier_name}`, e.invoice_no && `Inv ${e.invoice_no}`, e.method, e.reference && `Ref ${e.reference}`, e.description, e.job_id && `Job ${jobLabel(e.job_id)}`].filter(Boolean).join(" · ");
                  return (
                    <tr key={e.id}>
                      <td style={td}>{e.entry_date || fmtD(e.created_at)}</td>
                      <td style={td}>{t.icon} {t.short}</td>
                      <td style={{ ...td, color: "var(--text2)" }}>{details || "—"}</td>
                      <td style={{ ...num, color: v < 0 ? "var(--red)" : "var(--green)" }}>{signed(v)}</td>
                      {!wsLocked && <td style={td}><button className="btn btn-ghost btn-xs" style={{ color: "var(--red)" }} onClick={() => deleteEntry(e.id)}>🗑</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {renderModals()}
      </div>
    );
  }

  // ═════════ embedded, person has no account yet ═════════
  if (embedded && focusName) {
    return (
      <div>
        {loading ? <div style={{ padding: 30, textAlign: "center", color: "var(--text3)" }}>Loading…</div> : (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            {err && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>⚠ {err}</div>}
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No payment account for {focusName} yet</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>Create one to record payments, charges, supplier invoices, refunds and discounts, and to send him a statement link.</div>
            {!wsLocked && <button className="btn btn-primary" onClick={() => setPerson({ name: focusName, phone: focusPhone || "", role: focusRole === "painter" ? "painter" : "mechanic" })}>+ Create account for {focusName}</button>}
          </div>
        )}
        {renderModals()}
      </div>
    );
  }

  // ═════════ list view ═════════
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>💼 Mechanic Pay</h1>
        {!wsLocked && <button className="btn btn-primary btn-sm" onClick={() => setPerson({ name: "", phone: "", role: "mechanic" })}>+ Add mechanic / painter</button>}
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 14 }}>
        Each person is paid from the priced replies they send on the job card link, counted once the job is marked Done. Add charges, supplier invoices you paid for them, refunds and discounts, then record cash / EFT payments. They get a read-only statement link.
      </div>
      {err && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>⚠ {err}</div>}
      {loading ? <div style={{ padding: 30, textAlign: "center", color: "var(--text3)" }}>Loading…</div> : contacts.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>No mechanics or painters yet. Add one, or tick "Save to my contacts" when you send a job card.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Name</th><th style={{ ...th, textAlign: "right" }}>Earned</th><th style={{ ...th, textAlign: "right" }}>Deductions</th><th style={{ ...th, textAlign: "right" }}>Paid</th><th style={{ ...th, textAlign: "right" }}>Balance</th><th style={th}></th></tr></thead>
            <tbody>
              {rows.map(({ c, a }) => (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSel(c.id)}>
                  <td style={td}><b>{c.role === "painter" ? "🎨" : "🔧"} {c.name}</b><div style={{ fontSize: 11, color: "var(--text3)" }}>{c.role === "painter" ? "Painter" : "Mechanic"}{c.phone ? ` · ${c.phone}` : ""}</div></td>
                  <td style={num}>{fmtAmt(a.earned)}</td>
                  <td style={{ ...num, color: "var(--red)" }}>{a.deductions ? signed(-a.deductions) : "—"}</td>
                  <td style={{ ...num, color: "var(--blue)" }}>{a.paid ? fmtAmt(a.paid) : "—"}</td>
                  <td style={{ ...num, color: balanceColor(a.balance), fontWeight: 700 }}>{fmtAmt(Math.abs(a.balance))}<div style={{ fontSize: 10, fontWeight: 600 }}>{balanceText(a.balance)}</div></td>
                  <td style={td}><span style={{ color: "var(--accent)", fontWeight: 700 }}>Open →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {renderModals()}
    </div>
  );

  // ═════════ modals (shared by both views) ═════════
  function renderModals() {
    return (<>
      {person && (
        <Overlay onClose={() => setPerson(null)}>
          <MHead title="+ Add mechanic / painter" onClose={() => setPerson(null)} />
          <FD><FL label="Name *" /><input className="inp" value={person.name} onChange={(e) => setPerson((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. John" autoFocus /></FD>
          <FG>
            <div><FL label="WhatsApp number" /><input className="inp" type="tel" value={person.phone} onChange={(e) => setPerson((p) => ({ ...p, phone: e.target.value }))} placeholder="e.g. 27821234567" /></div>
            <div><FL label="Role" /><select className="inp" value={person.role} onChange={(e) => setPerson((p) => ({ ...p, role: e.target.value }))}><option value="mechanic">Mechanic</option><option value="painter">Painter</option></select></div>
          </FG>
          <div style={{ fontSize: 11, color: "var(--text3)", margin: "4px 0 12px" }}>Use the exact name you put on the job card link, because replies are matched by name.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPerson(null)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy || !person.name.trim()} onClick={savePerson}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </Overlay>
      )}

      {entry && (() => {
        const c = contacts.find((x) => x.id === entry.contactId);
        const t = ENTRY_TYPES[entry.type];
        const set = (k, v) => setEntry((p) => ({ ...p, [k]: v }));
        const myJobs = computeAccount({ replies: data.replies.filter((r) => sameName(r.mechanic_name, c?.name)), jobs: data.jobs, ledger: [] }).jobRows;
        return (
          <Overlay onClose={() => setEntry(null)}>
            <MHead title={`${t.icon} ${t.label}`} sub={c?.name} onClose={() => setEntry(null)} />
            <FG>
              <div><FL label="Amount *" /><input className="inp" type="number" inputMode="decimal" min="0" value={entry.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" autoFocus /></div>
              <div><FL label="Date" /><input className="inp" type="date" value={entry.date} onChange={(e) => set("date", e.target.value)} /></div>
            </FG>
            {(entry.type === "payment" || entry.type === "refund") && (
              <FG>
                <div><FL label="Paid by" /><select className="inp" value={entry.method} onChange={(e) => set("method", e.target.value)}><option>Cash</option><option>EFT</option></select></div>
                <div><FL label="Reference (optional)" /><input className="inp" value={entry.reference} onChange={(e) => set("reference", e.target.value)} placeholder={entry.method === "EFT" ? "EFT reference" : "Receipt no."} /></div>
              </FG>
            )}
            {entry.type === "supplier_invoice" && (
              <FG>
                <div><FL label="Supplier *" /><input className="inp" list="mp-suppliers" value={entry.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} placeholder="Which supplier" /><datalist id="mp-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist></div>
                <div><FL label="Invoice no." /><input className="inp" value={entry.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} placeholder="e.g. INV-1042" /></div>
              </FG>
            )}
            {(entry.type === "refund" || entry.type === "discount" || entry.type === "opening") && (
              <FD><FL label={entry.type === "opening" ? "Who owes whom?" : "Effect on his balance"} />
                <select className="inp" value={entry.direction} onChange={(e) => set("direction", +e.target.value)}>
                  {entry.type === "opening"
                    ? [<option key="1" value={1}>I owe him this amount (he is owed from before)</option>, <option key="-1" value={-1}>He owes me this amount (from before)</option>]
                    : entry.type === "refund"
                      ? [<option key="1" value={1}>Refund to the mechanic (adds to what I owe him)</option>, <option key="-1" value={-1}>Mechanic refunds me (reduces what I owe him)</option>]
                      : [<option key="1" value={1}>Discount I give him on his charges (adds to what I owe him)</option>, <option key="-1" value={-1}>Discount taken off his labour price (reduces what I owe him)</option>]}
                </select>
              </FD>
            )}
            {entry.type === "opening" && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>Enter what was owed on the day you start using the system. Set the date to that day. Do this once per person.</div>}
            <FD><FL label={entry.type === "charge" ? "What did I sell him? *" : "Description (optional)"} /><input className="inp" value={entry.description} onChange={(e) => set("description", e.target.value)} placeholder={entry.type === "charge" ? "e.g. Brake pads, spray cans, tools" : entry.type === "opening" ? "e.g. Balance brought forward" : "e.g. Part of last week's work"} /></FD>
            {myJobs.length > 0 && (
              <FD><FL label="For a job (optional)" />
                <select className="inp" value={entry.job_id} onChange={(e) => set("job_id", e.target.value)}>
                  <option value="">General, not for one job</option>
                  {myJobs.map((r) => <option key={r.job.id} value={r.job.id}>{r.job.vehicle_reg || r.job.id}{r.job.date_in ? ` · ${r.job.date_in}` : ""}</option>)}
                </select>
              </FD>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEntry(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={saveEntry}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </Overlay>
        );
      })()}

      {link && (
        <Overlay onClose={() => setLink(null)}>
          <MHead title="🔗 Statement link" sub={link.c.name} onClose={() => setLink(null)} />
          {link.busy && <div style={{ padding: 20, textAlign: "center", color: "var(--text3)" }}>Preparing link…</div>}
          {link.err && <div style={{ color: "var(--red)", fontSize: 13 }}>⚠ {link.err}</div>}
          {link.url && (() => {
            const msg = `Hi ${link.c.name}, here is your payment statement${wsProfile?.name ? ` from ${wsProfile.name}` : ""}. It shows your finished jobs, charges, payments and what is owed. It updates by itself:\n${link.url}`;
            return (<>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>A read-only page. This link stays the same and never expires, so send it once.</div>
              <input className="inp" readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ fontSize: 12, fontFamily: "DM Mono,monospace", marginBottom: 12 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { try { navigator.clipboard.writeText(link.url); } catch { /* clipboard blocked */ } }}>📋 Copy link</button>
                <a className="btn btn-primary" style={{ flex: 2, textDecoration: "none", background: "#25D366", borderColor: "#25D366" }} target="_blank" rel="noreferrer"
                  href={link.c.phone ? waLink(link.c.phone, msg) : `https://wa.me/?text=${encodeURIComponent(msg)}`}>💬 Send via WhatsApp</a>
              </div>
            </>);
          })()}
        </Overlay>
      )}
    </>);
  }
}

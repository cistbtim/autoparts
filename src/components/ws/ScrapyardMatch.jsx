import { useState, useEffect, useCallback } from "react";
import { Overlay, MHead } from "../shared.jsx";
import { WsPhotoCompare } from "./PhotoCompare.jsx";
import { api } from "../../lib/api.js";
import { toImgUrl } from "../../lib/helpers.js";
import { marketplaceReady, REVEAL_COST, TRIAL_POINTS, cleanVin, yearFromVin, matchTier, TIER_LABEL, maskVin, pointsBalance, isListable } from "../../lib/marketplace.js";

// Workshop side of Scrapyard Match: search scrapyard stock by VIN for free. The result shows what the
// vehicle is, where (city only) and which parts are in stock — never WHO holds it. Getting the
// scrapyard's contact costs points via a reveal request that the VelGenius admin approves.

// Workshops whose free trial points are being granted right now — the page can mount twice at once, and both
// runs would otherwise see "no trial yet" and grant it twice.
const _trialInFlight = new Set();

const SETUP_SQL_HINT = "Scrapyard Match isn't set up yet — ask the admin to run docs/marketplace.sql in Supabase.";

// The job's own vehicle photos (workshop_vehicles), in viewing order.
const VEH_ANGLES = [["photo_front", "Front"], ["photo_front_left", "Front-Left"], ["photo_front_right", "Front-Right"], ["photo_left", "Left"], ["photo_right", "Right"],
  ["photo_rear", "Rear"], ["photo_rear_left", "Rear-Left"], ["photo_rear_right", "Rear-Right"], ["photo_side", "Side"]];
const bigImg = (u, w = 600) => (toImgUrl(u) || u || "").replace(/sz=w\d+/, `sz=w${w}`);
const YARD_ANGLES = [["photo_front", "Front"], ["photo_rear", "Rear"], ["photo_left", "Left"], ["photo_right", "Right"], ["photo_interior", "Interior"], ["photo_engine", "Engine"], ["photo_url", "Photo"]];

export function WsScrapyardMatchPage({ wsId, wsProfile = {}, jobs = [], wsVehicles = [], initialJobId = null, onInitialJobConsumed, resolveModel }) {
  const [compareId, setCompareId] = useState(null);  // result whose photos are open in the side-by-side compare window
  const [chosenJob, setChosenJob] = useState(null);  // the job whose car is being matched — its photos are shown for comparison
  const [query, setQuery] = useState("");       // the one search box: a VIN, or type a plate / customer / car to find your job
  const [showSug, setShowSug] = useState(false);
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [ledger, setLedger] = useState([]);
  const [requests, setRequests] = useState([]);
  const [setupErr, setSetupErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);   // null = not searched yet
  const [reqFor, setReqFor] = useState(null);     // result being requested
  const [partsWanted, setPartsWanted] = useState("");
  const [phone, setPhone] = useState(wsProfile.whatsapp || wsProfile.phone || "");
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const balance = pointsBalance(ledger);
  const pendingCost = requests.filter(r => r.status === "pending").reduce((s, r) => s + (+r.cost || REVEAL_COST), 0);
  const available = balance - pendingCost;

  const loadMine = useCallback(async () => {
    if (!(await marketplaceReady())) { setSetupErr(SETUP_SQL_HINT); return; }
    const [l, r] = await Promise.all([
      api.fresh("ms_credit_ledger", `workshop_id=eq.${wsId}&select=*&order=created_at.asc`),
      api.fresh("ms_reveal_requests", `workshop_id=eq.${wsId}&select=*&order=created_at.desc`),
    ]).catch(() => [null, null]);
    if (!Array.isArray(l) || !Array.isArray(r)) { setSetupErr(SETUP_SQL_HINT); return; }
    setSetupErr("");
    let rows = l;
    // First visit: hand out the free trial points once.
    if (!rows.some(x => x.reason === "trial") && !_trialInFlight.has(String(wsId))) {
      _trialInFlight.add(String(wsId));
      try {
        const res = await api.insert("ms_credit_ledger", { workshop_id: String(wsId), workshop_name: wsProfile.name || "", delta: TRIAL_POINTS, reason: "trial", note: "Free trial points", created_by: "system" }).catch(() => null);
        const row = Array.isArray(res) ? res[0] : null;
        if (row) rows = [...rows, row];
        else { // the database refused (a trial row already exists) — show what is really there
          const again = await api.fresh("ms_credit_ledger", `workshop_id=eq.${wsId}&select=*&order=created_at.asc`).catch(() => null);
          if (Array.isArray(again)) rows = again;
        }
      } finally { _trialInFlight.delete(String(wsId)); }
    }
    setLedger(rows);
    setRequests(r);
  }, [wsId, wsProfile.name]);
  useEffect(() => { if (wsId) loadMine(); }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Type to find one of your jobs (plate, VIN, customer or car) — shown with the FULL model name, never the catalogue code.
  const modelName = (j) => (resolveModel ? resolveModel(j.vehicle_make, j.vehicle_model) : j.vehicle_model) || "";
  const carName = (j) => [j.vehicle_year, j.vehicle_make, modelName(j)].filter(Boolean).join(" ");
  const q = query.trim().toLowerCase();
  const suggestions = q.length < 2 ? [] : jobs.filter(j => !j.is_cancelled)
    .map(j => ({ j, text: `${j.vehicle_reg || ""} ${j.vin || ""} ${j.customer_name || ""} ${carName(j)}`.toLowerCase() }))
    .filter(x => q.split(/\s+/).every(w => x.text.includes(w)))
    .sort((a, b) => String(b.j.date_in || b.j.created_at || "").localeCompare(String(a.j.date_in || a.j.created_at || "")))
    .slice(0, 8).map(x => x.j);

  const chooseJob = (j) => {
    const v = cleanVin(j.vin), mk = j.vehicle_make || "", md = modelName(j);
    setVin(v); setMake(mk); setModel(md); setChosenJob(j);
    setQuery(`${j.vehicle_reg || ""} — ${carName(j)}`.trim()); setShowSug(false);
    search({ vin: v, make: mk, model: md });
  };
  // Opened from a job card ("🔎 Scrapyard" button): load that job's car and search straight away.
  useEffect(() => {
    if (!initialJobId) return;
    const j = jobs.find(x => String(x.id) === String(initialJobId));
    if (j) chooseJob(j);
    onInitialJobConsumed && onInitialJobConsumed();
  }, [initialJobId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Search button / Enter: a full 17-character VIN searches directly; otherwise take the best matching job; otherwise treat what was typed as a VIN start.
  const go = () => {
    const raw = cleanVin(query);
    if (raw.length === 17) { setVin(raw); search({ vin: raw }); setShowSug(false); }
    else if (suggestions.length) chooseJob(suggestions[0]);
    else if (raw.length >= 8) { setVin(raw); search({ vin: raw }); setShowSug(false); }
    else alert("Type a VIN, or part of a plate / customer name / car to find one of your jobs.");
  };

  const search = async (p = {}) => {
    const v = cleanVin(p.vin ?? vin), mk = p.make ?? make, md = p.model ?? model;
    if (v.length < 8 && !(mk && md)) { alert("Enter the VIN (at least the first 8 characters)."); return; }
    setBusy(true); setResults(null);
    try {
      const [vehs, yards] = await Promise.all([
        api.fresh("scrapyard_vehicles", "select=id,scrapyard_id,make,model,year,color,odometer,status,vin,photo_front,photo_rear,photo_left,photo_right,photo_interior,photo_engine,photo_url&order=created_at.desc"),
        api.fresh("scrapyard_profiles", "select=id,city,country"),
      ]);
      const cityBy = new Map((Array.isArray(yards) ? yards : []).map(y => [String(y.id), y]));
      const hits = (Array.isArray(vehs) ? vehs : [])
        .filter(isListable)
        .map(y => ({ y, tier: matchTier(v, mk, md, y) }))
        .filter(x => x.tier !== null)
        .sort((a, b) => a.tier - b.tier);
      // Parts in stock on the matched vehicles (never cost/notes/location — those can identify the yard)
      const ids = hits.map(h => h.y.id);
      const parts = ids.length
        ? await api.fresh("scrapyard_parts", `vehicle_id=in.(${ids.join(",")})&select=id,vehicle_id,name,category,condition,quantity,price,photo_url`).catch(() => [])
        : [];
      const out = hits.map(({ y, tier }) => ({
        id: y.id, tier, scrapyard_id: y.scrapyard_id,
        make: y.make, model: y.model, color: y.color, odometer: y.odometer, status: y.status,
        year: y.year || yearFromVin(y.vin),
        city: cityBy.get(String(y.scrapyard_id))?.city || "",
        maskedVin: maskVin(y.vin),
        photos: YARD_ANGLES.map(([f, label]) => (y[f] ? { label, url: y[f] } : null)).filter(Boolean).slice(0, 8),
        parts: (Array.isArray(parts) ? parts : []).filter(p => p.vehicle_id === y.id && (+p.quantity || 0) > 0),
      }));
      setResults(out);
      api.insert("ms_search_log", { workshop_id: String(wsId), workshop_name: wsProfile.name || "", vin: v, make: mk, model: md, match_count: out.length }).catch(() => {});
    } finally { setBusy(false); }
  };

  const sendRequest = async () => {
    if (!reqFor) return;
    if (available < REVEAL_COST) { alert(`You need at least ${REVEAL_COST} point${REVEAL_COST > 1 ? "s" : ""} available.`); return; }
    setSending(true);
    const summary = `${[reqFor.year, reqFor.make, reqFor.model].filter(Boolean).join(" ")}${reqFor.city ? ` · ${reqFor.city}` : ""}`;
    const res = await api.insert("ms_reveal_requests", {
      workshop_id: String(wsId), workshop_name: wsProfile.name || "", workshop_phone: phone.trim(),
      scrapyard_vehicle_id: reqFor.id, scrapyard_id: reqFor.scrapyard_id, vehicle_summary: summary,
      parts_wanted: partsWanted.trim(), cost: REVEAL_COST, status: "pending",
    }).catch(e => ({ message: e.message }));
    setSending(false);
    if (!Array.isArray(res)) { alert("Could not send the request: " + (res?.message || "unknown error")); return; }
    setRequests(prev => [res[0], ...prev]);
    setReqFor(null); setPartsWanted("");
  };

  const alreadyAsked = (id) => requests.some(r => r.scrapyard_vehicle_id === id && r.status !== "rejected");
  const fmtPrice = (n) => (+n > 0 ? `R${(+n).toLocaleString()}` : "");

  return (
    <div className="fu">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>🔎 Scrapyard Match</div>
        <span className="badge" style={{ background: "rgba(255,122,46,.15)", color: "var(--accent)", fontWeight: 700 }}>⭐ {balance} point{balance !== 1 ? "s" : ""}{pendingCost > 0 ? ` (${pendingCost} pending)` : ""}</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14, lineHeight: 1.6 }}>
        Find a scrapyard vehicle that matches your customer's car by VIN. <b>Searching is free.</b> To get the scrapyard's contact, request it for {REVEAL_COST} point — we introduce you.
      </div>
      {setupErr && <div className="card" style={{ padding: 14, color: "var(--yellow)", fontSize: 13, marginBottom: 14 }}>{setupErr}</div>}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
          <div style={{ flex: "1 1 280px", position: "relative" }}>
            <input className="inp" style={{ width: "100%" }} autoComplete="off" value={query}
              placeholder="Type a VIN, or a plate / customer / car to find your job…"
              onChange={e => { setQuery(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)} onBlur={() => setTimeout(() => setShowSug(false), 150)}
              onKeyDown={e => { if (e.key === "Enter") go(); if (e.key === "Escape") setShowSug(false); }} />
            {showSug && suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.25)", overflow: "hidden" }}>
                {suggestions.map(j => (
                  <div key={j.id} onMouseDown={e => { e.preventDefault(); chooseJob(j); }}
                    style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface2)"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{j.vehicle_reg || "—"} <span style={{ fontWeight: 600, color: "var(--text2)" }}>· {carName(j) || "Vehicle"}</span></div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{[j.customer_name, cleanVin(j.vin) ? `VIN ${cleanVin(j.vin)}` : "no VIN on file"].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={go}>{busy ? "⏳ Searching…" : "🔎 Search"}</button>
        </div>
        {(vin || make || model) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input className="inp" style={{ flex: "1 1 120px", fontSize: 12 }} placeholder="Make" value={make} onChange={e => setMake(e.target.value)} />
            <input className="inp" style={{ flex: "2 1 200px", fontSize: 12 }} placeholder="Model" value={model} onChange={e => setModel(e.target.value)} />
            <input className="inp" style={{ flex: "2 1 200px", fontSize: 12, fontFamily: "DM Mono,monospace" }} placeholder="VIN" value={vin} onChange={e => setVin(e.target.value.toUpperCase())} maxLength={20} />
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>Pick one of your jobs as you type — its VIN and car are filled in and searched. Make / model help when the VIN differs.</div>
      </div>

      {chosenJob && (() => {
        const vr = wsVehicles.find(v => v.id === chosenJob.workshop_vehicle_id);
        const photos = VEH_ANGLES.map(([f, label]) => ({ label, url: vr?.[f] })).filter(p => p.url);
        return (
          <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: "rgba(20,184,166,.5)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#14b8a6" }}>YOUR CAR</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{chosenJob.vehicle_reg} · {carName(chosenJob)}</span>
              <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono,monospace" }}>{cleanVin(chosenJob.vin) ? `VIN ${cleanVin(chosenJob.vin)}` : "no VIN on file"}</span>
              <button className="btn btn-ghost btn-xs" style={{ marginLeft: "auto" }} onClick={() => setChosenJob(null)}>✕</button>
            </div>
            {photos.length > 0
              ? <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                  {photos.map(p => (
                    <div key={p.label} style={{ position: "relative", flex: "0 0 auto", width: 150, height: 112, borderRadius: 8, overflow: "hidden", background: "var(--surface2)", cursor: "zoom-in" }} onClick={() => setLightbox(bigImg(p.url))}>
                      <img src={bigImg(p.url)} alt={p.label} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.opacity = .2; }} />
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 10, fontWeight: 700, textAlign: "center", padding: "1px 0" }}>{p.label}</span>
                    </div>
                  ))}
                </div>
              : <div style={{ fontSize: 12, color: "var(--text3)" }}>No photos of this car on the job yet — add them on the job card to compare with the scrapyard vehicles below.</div>}
          </div>
        );
      })()}

      {results && results.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 13, marginBottom: 14 }}>
          No matching scrapyard vehicle right now. Try again later — new stock is added regularly.
        </div>
      )}
      {results && results.map(r => (
        <div key={r.id} className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{[r.year, r.make, r.model].filter(Boolean).join(" ")}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                {[r.color, r.odometer ? `${(+r.odometer).toLocaleString()} km` : "", r.status].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono,monospace", marginTop: 2 }}>VIN {r.maskedVin}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: TIER_LABEL[r.tier].color }}>✓ {TIER_LABEL[r.tier].en}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>📍 {r.city || "Location on request"}</div>
            </div>
          </div>
          {r.photos.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {r.photos.map((ph, i) => (
                <div key={i} style={{ position: "relative", width: 96, height: 72, borderRadius: 8, overflow: "hidden", background: "var(--surface2)", cursor: "zoom-in" }} onClick={() => setLightbox(bigImg(ph.url, 1000))}>
                  <img src={toImgUrl(ph.url)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                  <span style={{ position: "absolute", right: 3, bottom: 2, fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,.85)", textShadow: "0 0 3px #000" }}>VELGENIUS</span>
                </div>
              ))}
            </div>
          )}
          {r.parts.length > 0 && (
            <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", marginBottom: 4 }}>PARTS IN STOCK ({r.parts.length})</div>
              {r.parts.slice(0, 12).map(p => (
                <div key={p.id} style={{ display: "flex", gap: 8, fontSize: 12, padding: "2px 0" }}>
                  <span style={{ flex: 1 }}>{p.name}{p.condition ? <span style={{ color: "var(--text3)" }}> · {p.condition}</span> : null}</span>
                  <span style={{ color: "var(--text3)" }}>×{p.quantity}</span>
                  <span style={{ minWidth: 60, textAlign: "right", fontWeight: 600 }}>{fmtPrice(p.price)}</span>
                </div>
              ))}
              {r.parts.length > 12 && <div style={{ fontSize: 11, color: "var(--text3)" }}>+ {r.parts.length - 12} more</div>}
            </div>
          )}
          {r.photos.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 8, color: "#14b8a6", borderColor: "rgba(20,184,166,.5)" }} onClick={() => setCompareId(r.id)}>
              🔍 Compare photos{chosenJob ? " with my car" : ""}
            </button>
          )}
          {alreadyAsked(r.id)
            ? <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>✓ You requested this one — see "My requests" below.</div>
            : <button className="btn btn-primary btn-sm" disabled={!!setupErr || available < REVEAL_COST}
                onClick={() => { setReqFor(r); setPartsWanted(""); }}
                title={available < REVEAL_COST ? "Not enough points" : ""}>
                📩 Request contact · {REVEAL_COST} point{REVEAL_COST > 1 ? "s" : ""}
              </button>}
          {available < REVEAL_COST && !alreadyAsked(r.id) && <span style={{ fontSize: 11, color: "var(--yellow)", marginLeft: 8 }}>Not enough points — contact us to top up.</span>}
        </div>
      ))}

      <div style={{ fontWeight: 700, fontSize: 14, margin: "18px 0 8px" }}>My requests</div>
      {requests.length === 0
        ? <div style={{ fontSize: 13, color: "var(--text3)" }}>No requests yet.</div>
        : requests.map(q => (
          <div key={q.id} className="card" style={{ padding: "10px 14px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{q.vehicle_summary}</span>
              <span className="badge" style={{ fontWeight: 700, fontSize: 11,
                background: q.status === "approved" ? "rgba(34,197,94,.15)" : q.status === "rejected" ? "rgba(239,68,68,.12)" : "rgba(251,191,36,.15)",
                color: q.status === "approved" ? "var(--green)" : q.status === "rejected" ? "var(--red)" : "var(--yellow)" }}>
                {q.status === "approved" ? "✅ Approved" : q.status === "rejected" ? "❌ Declined" : "⏳ Waiting for us"}
              </span>
            </div>
            {q.parts_wanted && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Wanted: {q.parts_wanted}</div>}
            {q.admin_note && <div style={{ fontSize: 13, marginTop: 6, padding: "6px 10px", background: "var(--surface2)", borderRadius: 8, whiteSpace: "pre-wrap" }}>{q.admin_note}</div>}
          </div>
        ))}

      {reqFor && (
        <Overlay onClose={() => !sending && setReqFor(null)}>
          <MHead title="📩 Request contact" sub={`${[reqFor.year, reqFor.make, reqFor.model].filter(Boolean).join(" ")}${reqFor.city ? ` · ${reqFor.city}` : ""}`} onClose={() => !sending && setReqFor(null)} />
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10, lineHeight: 1.6 }}>
            We confirm the vehicle and the parts are still available, then introduce you to the scrapyard. <b>{REVEAL_COST} point</b> is used only when we approve the request.
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>Which parts do you need?</div>
          <textarea className="inp" rows={3} value={partsWanted} onChange={e => setPartsWanted(e.target.value)} placeholder="e.g. front bumper, left headlight" style={{ width: "100%", marginBottom: 10, fontFamily: "inherit" }} />
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>Your WhatsApp / phone number</div>
          <input className="inp" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0821234567" style={{ marginBottom: 12 }} />
          <button className="btn btn-primary" style={{ width: "100%", fontWeight: 700 }} disabled={sending || !phone.trim()} onClick={sendRequest}>
            {sending ? "⏳ Sending…" : "Send request"}
          </button>
        </Overlay>
      )}
      {compareId && (() => {
        const r = (results || []).find(x => x.id === compareId);
        if (!r) return null;
        const vr = chosenJob ? wsVehicles.find(v => v.id === chosenJob.workshop_vehicle_id) : null;
        const mine = VEH_ANGLES.map(([f, label]) => (vr?.[f] ? { label, url: bigImg(vr[f], 1600), thumb: bigImg(vr[f], 200) } : null)).filter(Boolean);
        const theirs = r.photos.map(p => ({ label: p.label, url: bigImg(p.url, 1600), thumb: bigImg(p.url, 200) }));
        return <WsPhotoCompare onClose={() => setCompareId(null)}
          left={{ sub: chosenJob ? `${chosenJob.vehicle_reg || ""} · ${carName(chosenJob)}` : "pick one of your jobs to compare", photos: mine }}
          right={{ sub: `${[r.year, r.make, r.model].filter(Boolean).join(" ")}${r.city ? ` · ${r.city}` : ""}`, photos: theirs }} />;
      })()}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={lightbox} alt="" style={{ maxWidth: "94vw", maxHeight: "90vh", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

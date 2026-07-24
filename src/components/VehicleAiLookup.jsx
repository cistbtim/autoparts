import { useState } from "react";
import { Overlay, MHead, FL, FG, FD } from "./shared.jsx";

// Review-and-approve staging UI for AI-researched vehicle generations.
// Nothing is written to the DB until the user checks rows and clicks "Add".
export function VehicleAiLookupModal({initialMake, vehicles, onBulkSave, onClose, nextCodeForMake}) {
  const [make, setMake] = useState(initialMake || "");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [rows, setRows] = useState(null); // null = not yet searched
  const [saving, setSaving] = useState(false);

  const existingCodes = new Set(vehicles.map(v => (v.code || "").toUpperCase()).filter(Boolean));

  const runLookup = async () => {
    if (!make.trim() || !model.trim()) return;
    setLoading(true);
    setError("");
    setUnavailable(false);
    setRows(null);
    try {
      const res = await fetch("/api/vehicle-lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ make: make.trim(), model: model.trim() }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        setUnavailable(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Lookup failed.");
        return;
      }
      if (data.note) setError(data.note);
      const generations = (data.generations || []).map((g, i) => {
        const suggestedCode = nextCodeForMake ? nextCodeForMake(make.trim(), g.chassis_code || model.trim()) : "";
        return {
          key: i,
          checked: true,
          chassis_code: g.chassis_code || "",
          variant: g.variant || "",
          year_from: g.year_from || "",
          year_to: g.year_to == null ? "" : g.year_to,
          body_note: g.body_note || "",
          code: suggestedCode,
        };
      });
      setRows(generations);
    } catch {
      setError("Failed to reach the lookup service.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const checkedCount = rows ? rows.filter(r => r.checked).length : 0;

  const addChecked = async () => {
    const toAdd = rows.filter(r => r.checked);
    if (!toAdd.length) return;
    setSaving(true);
    try {
      const payload = toAdd.map(r => ({
        make: make.trim().toUpperCase(),
        model: [r.chassis_code, model.trim(), r.variant].filter(Boolean).join(" ").trim() || model.trim(),
        code: r.code || "",
        year_from: r.year_from || "",
        year_to: r.year_to || "",
        engine: "",
        variant: r.body_note || "",
      }));
      await onBulkSave(payload);
      onClose();
    } catch {
      setError("Failed to save vehicles — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="✨ AI Lookup" sub="AI-generated — verify before saving" onClose={onClose} />

      <FG>
        <FD><FL label="Make" req /><input className="inp" value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. BMW" /></FD>
        <FD><FL label="Model" req /><input className="inp" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 3 Series" /></FD>
      </FG>

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        <button className="btn btn-primary" disabled={loading || !make.trim() || !model.trim()} onClick={runLookup}>
          {loading ? "Looking up…" : "🔍 Look Up Generations"}
        </button>
      </div>

      {unavailable && (
        <div className="card" style={{padding:14,color:"var(--text3)",textAlign:"center"}}>
          AI Lookup isn't available on this deployment — use the motordesk.* site instead.
        </div>
      )}

      {error && !unavailable && (
        <div style={{fontSize:12,color:"var(--accent)",marginBottom:12}}>{error}</div>
      )}

      {rows && rows.length === 0 && !unavailable && (
        <div className="card" style={{padding:14,color:"var(--text3)",textAlign:"center"}}>
          No generations found — try a different make/model spelling.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {rows.map(r => {
            const dupe = r.code && existingCodes.has(r.code.toUpperCase());
            return (
              <div key={r.key} className="card" style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="checkbox" checked={r.checked} onChange={e => updateRow(r.key, "checked", e.target.checked)} />
                <input className="inp" style={{width:90}} value={r.code} onChange={e => updateRow(r.key, "code", e.target.value)} placeholder="Code" />
                <input className="inp" style={{width:100}} value={r.chassis_code} onChange={e => updateRow(r.key, "chassis_code", e.target.value)} placeholder="Chassis" />
                <input className="inp" style={{flex:1,minWidth:100}} value={r.variant} onChange={e => updateRow(r.key, "variant", e.target.value)} placeholder="Variant" />
                <input className="inp" style={{width:70}} value={r.year_from} onChange={e => updateRow(r.key, "year_from", e.target.value)} placeholder="From" />
                <input className="inp" style={{width:70}} value={r.year_to} onChange={e => updateRow(r.key, "year_to", e.target.value)} placeholder="To" />
                <input className="inp" style={{flex:1,minWidth:100}} value={r.body_note} onChange={e => updateRow(r.key, "body_note", e.target.value)} placeholder="Body note" />
                {dupe && <span className="badge" style={{background:"rgba(249,115,22,.15)",color:"var(--accent)"}}>code exists</span>}
              </div>
            );
          })}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || checkedCount === 0} onClick={addChecked}>
            {saving ? "Adding…" : `Add ${checkedCount} Vehicle${checkedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </Overlay>
  );
}

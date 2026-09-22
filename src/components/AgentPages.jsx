import { useState } from "react";
import { uploadToStorage } from "../lib/api.js";
import { getSettings, curSym } from "../lib/settings.js";
import { makeId, waLink } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";
import { Overlay, MHead, FL, FG, ImgLightbox, LicenceDocsChecklist, RenewalDocsModal } from "./shared.jsx";

// current_expiry (the expiry the renewal was submitted against) + renewal_years
// gives the date the NEW disc granted by a completed renewal actually expires —
// nothing stores that directly, so it's derived on the fly wherever it's needed.
const addYears = (dateStr, years) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setFullYear(d.getFullYear() + (+years || 1));
  return d.toISOString().slice(0, 10);
};
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

// ═══════════════════════════════════════════════════════════════
// LICENCE RENEWAL AGENT — cross-workshop renewal queue
// ═══════════════════════════════════════════════════════════════
export function LicenceAgentPage({renewals=[], workshopNames={}, onUpdate, onSave, onDelete}) {
  const [filter, setFilter] = useState("all");
  const [docsRenewal, setDocsRenewal] = useState(null);
  const [walkInPrefill, setWalkInPrefill] = useState(null); // null=closed, {}=blank, {...}=prefilled from a due-soon row
  const [dueSoonDays, setDueSoonDays] = useState(()=>{
    try{ return +localStorage.getItem("licence_agent_due_soon_days") || 30; }catch{ return 30; }
  });
  const setDueSoonDaysPersist = (v) => { setDueSoonDays(v); try{ localStorage.setItem("licence_agent_due_soon_days", v); }catch{/* ignore */} };
  const C = curSym(getSettings().currency);

  const filtered = filter==="all" ? renewals : renewals.filter(r=>r.status===filter);
  const unpaidComm = renewals.filter(r=>r.commission_status==="unpaid"&&r.status==="completed");
  const totalComm = renewals.filter(r=>r.commission_status==="paid").reduce((s,r)=>s+(+r.commission_amount||0),0);

  // Renewals already completed whose NEXT disc (current_expiry + renewal_years)
  // is due within dueSoonDays — nothing stores that date directly, it's derived
  // from the two fields the record already has.
  const dueSoon = renewals
    .filter(r=>r.status==="completed"&&r.current_expiry)
    .map(r=>({...r, nextExpiry: addYears(r.current_expiry, r.renewal_years)}))
    .filter(r=>r.nextExpiry!=null)
    .map(r=>({...r, daysLeft: daysUntil(r.nextExpiry)}))
    .filter(r=>r.daysLeft!=null && r.daysLeft<=dueSoonDays && r.daysLeft>=0)
    .sort((a,b)=>a.daysLeft-b.daysLeft);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <div>
          <div style={{fontWeight:700,fontSize:18,marginBottom:2}}>🪪 Licence Renewals — All Workshops</div>
          <div style={{fontSize:13,color:"var(--text3)"}}>{renewals.length} total · {unpaidComm.length} awaiting commission</div>
        </div>
        {onSave&&<button className="btn btn-primary" onClick={()=>setWalkInPrefill({})}>+ Walk-in Customer</button>}
      </div>

      {unpaidComm.length>0&&(
        <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13}}>
          <strong style={{color:"var(--amber,#f59e0b)"}}>💰 {unpaidComm.length} completed renewal{unpaidComm.length!==1?"s":""} with unpaid commission</strong>
        </div>
      )}

      {/* Renewals due again soon — derived from current_expiry + renewal_years */}
      <div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.3)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:dueSoon.length>0?10:0}}>
          <strong style={{color:"var(--blue)",fontSize:13}}>🔔 {dueSoon.length} renewal{dueSoon.length!==1?"s":""} due again soon</strong>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text3)"}}>
            Notify
            <input type="number" min="1" value={dueSoonDays} onChange={e=>setDueSoonDaysPersist(+e.target.value||30)}
              style={{width:50,fontSize:12,padding:"3px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)"}}/>
            days before expiry
          </label>
        </div>
        {dueSoon.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {dueSoon.map(r=>(
              <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:12,padding:"6px 0",borderTop:"1px solid rgba(96,165,250,.15)"}}>
                <span style={{fontWeight:700,fontFamily:"DM Mono,monospace"}}>{r.vehicle_reg}</span>
                <span style={{color:"var(--text3)"}}>{workshopNames[r.workshop_id]||(r.workshop_id?r.workshop_id:"🚶 Walk-in")}</span>
                <span style={{color:r.daysLeft<=7?"var(--red)":"var(--yellow)",fontWeight:600}}>
                  Expires {r.nextExpiry} ({r.daysLeft===0?"today":`${r.daysLeft}d left`})
                </span>
                {r.owner_phone&&(
                  <a href={waLink(r.owner_phone,`Hi ${r.owner_name||""}, a reminder that your vehicle ${r.vehicle_reg}'s licence disc is due for renewal on ${r.nextExpiry}. Please contact us to arrange your next renewal.`)} target="_blank" rel="noopener noreferrer" style={{marginLeft:"auto"}}>
                    <button style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"#25D366",color:"#fff",cursor:"pointer"}}>📲 Notify</button>
                  </a>
                )}
                {onSave&&(
                  <button onClick={()=>setWalkInPrefill({
                    vehicle_reg:r.vehicle_reg, vehicle_make:r.vehicle_make, vehicle_model:r.vehicle_model,
                    vin:r.vin, engine_no:r.engine_no, current_expiry:r.nextExpiry,
                    owner_name:r.owner_name, owner_phone:r.owner_phone, owner_id:r.owner_id||"",
                    workshop_id:r.workshop_id||null,
                  })}
                    style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"var(--surface3)",color:"var(--text2)",cursor:"pointer"}}>🔄 Start Renewal</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {[["all","All"],["pending","Pending"],["submitted","Submitted"],["completed","Completed"],["cancelled","Cancelled"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{padding:"5px 12px",borderRadius:20,border:"1px solid var(--border)",background:filter===v?"var(--accent)":"var(--surface2)",color:filter===v?"#fff":"var(--text2)",fontSize:12,cursor:"pointer",fontWeight:filter===v?700:400}}>
            {l} <span style={{opacity:.6}}>{v==="all"?renewals.length:renewals.filter(r=>r.status===v).length}</span>
          </button>
        ))}
        {totalComm>0&&<span style={{marginLeft:"auto",fontSize:12,color:"var(--green)",fontWeight:700,alignSelf:"center"}}>Commission earned: {C}{totalComm.toLocaleString()}</span>}
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text3)"}}>
          <div style={{fontSize:32,marginBottom:8}}>🪪</div>
          <div style={{fontSize:14}}>No renewal requests {filter==="all"?"yet":`with status "${filter}"`}</div>
        </div>
      )}

      {filtered.length>0&&(
        <div className="card" style={{overflow:"auto"}}>
          <table className="tbl" style={{width:"100%",minWidth:820}}>
            <thead>
              <tr>
                <th>Workshop</th>
                <th>Vehicle</th>
                <th>Owner</th>
                <th>Expiry</th>
                <th>Years</th>
                <th>Status</th>
                <th>Commission</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>{
                const isExpired = r.current_expiry && new Date(r.current_expiry)<new Date();
                return (
                  <tr key={r.id}>
                    <td style={{fontSize:12,fontWeight:600}}>{workshopNames[r.workshop_id]||(r.workshop_id?r.workshop_id:"🚶 Walk-in")}</td>
                    <td>
                      <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:12}}>{r.vehicle_reg}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>{r.vehicle_make} {r.vehicle_model}</div>
                    </td>
                    <td>
                      <div style={{fontSize:13}}>{r.owner_name||"—"}</div>
                      {r.owner_phone&&<div style={{fontSize:11,color:"var(--text3)"}}>{r.owner_phone}</div>}
                    </td>
                    <td>
                      <span style={{fontSize:12,fontWeight:600,color:isExpired?"var(--red)":"var(--green)"}}>
                        {r.current_expiry||"—"} {isExpired?"⚠️":""}
                      </span>
                    </td>
                    <td style={{textAlign:"center"}}>{r.renewal_years||1}</td>
                    <td>
                      <select value={r.status||"pending"} onChange={e=>onUpdate(r.id,{status:e.target.value})}
                        style={{fontSize:11,padding:"3px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",color:"var(--text1)"}}>
                        <option value="pending">⏳ Pending</option>
                        <option value="submitted">📤 Submitted</option>
                        <option value="completed">✅ Completed</option>
                        <option value="cancelled">❌ Cancelled</option>
                      </select>
                    </td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <input
                          type="number" min="0"
                          value={r.commission_amount||""} placeholder="0"
                          onChange={e=>onUpdate(r.id,{commission_amount:+e.target.value||null})}
                          style={{width:70,fontSize:11,padding:"3px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)"}}/>
                        <button
                          onClick={()=>onUpdate(r.id,{commission_status:r.commission_status==="paid"?"unpaid":"paid"})}
                          style={{fontSize:10,padding:"3px 8px",borderRadius:12,border:"none",cursor:"pointer",
                            background:r.commission_status==="paid"?"var(--green)":"var(--surface2)",
                            color:r.commission_status==="paid"?"#fff":"var(--text3)",fontWeight:600}}>
                          {r.commission_status==="paid"?"✓ Paid":"Mark Paid"}
                        </button>
                      </div>
                    </td>
                    <td style={{fontSize:11,color:"var(--text3)",whiteSpace:"nowrap"}}>{(r.submitted_at||"").slice(0,10)}</td>
                    <td>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setDocsRenewal(r)}
                          style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,cursor:"pointer",fontWeight:600,
                            background:(r.receipt_url||r.new_licence_url)?"var(--green)":"var(--surface2)",
                            color:(r.receipt_url||r.new_licence_url)?"#fff":"var(--text3)"}}>📎 Docs</button>
                        {r.owner_phone&&(
                          <a href={waLink(r.owner_phone,"")} target="_blank" rel="noopener noreferrer">
                            <button style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"#25D366",color:"#fff",cursor:"pointer"}}>📲</button>
                          </a>
                        )}
                        {onDelete&&(
                          <button onClick={()=>{ if(window.confirm(`Delete renewal for ${r.vehicle_reg||"this vehicle"}?`)) onDelete(r.id); }}
                            style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"var(--red)",color:"#fff",cursor:"pointer"}}>🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {docsRenewal&&(
        <RenewalDocsModal renewal={docsRenewal} viewer="agent"
          workshopName={workshopNames[docsRenewal.workshop_id]||(docsRenewal.workshop_id?docsRenewal.workshop_id:"🚶 Walk-in")}
          onUpdate={onUpdate} onClose={()=>setDocsRenewal(null)}/>
      )}

      {walkInPrefill&&onSave&&(
        <WalkInRenewalModal prefill={walkInPrefill}
          onSave={async(rec)=>{ await onSave(rec); setWalkInPrefill(null); }}
          onClose={()=>setWalkInPrefill(null)}/>
      )}
    </div>
  );
}

// Agent-created renewal for a customer who walked in directly (no workshop in
// between) — scan the disc, type the fields, or both (scanning just fills the
// same fields below, which stay editable either way), then attach the disc
// photo/ID as the document. Saved with workshop_id left null; the rest of this
// page already treats a null workshop_id as "🚶 Walk-in".
function WalkInRenewalModal({prefill={}, onSave, onClose}) {
  const [f, setF] = useState({
    vehicle_reg:"", vehicle_make:"", vehicle_model:"", vin:"", engine_no:"",
    current_expiry:"", owner_name:"", owner_phone:"", owner_id:"",
    renewal_years:"1", notes:"", documents:{}, workshop_id:null,
    ...prefill,
  });
  const [saving, setSaving] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  const processScan = async (dataUrl) => {
    setScanLoading(true); setScanError("");
    try{
      const raw = await decodePDF417fromImage(dataUrl);
      const parsed = parseLicenceDisc(raw);
      setF(p=>({...p,
        vehicle_reg: parsed.reg ? parsed.reg.replace(/\s/g,"").toUpperCase() : p.vehicle_reg,
        vehicle_make: parsed.make||p.vehicle_make, vehicle_model: parsed.model||p.vehicle_model,
        vin: parsed.vin||p.vin, engine_no: parsed.engine_no||p.engine_no,
        current_expiry: parsed.expiry_date||p.current_expiry,
      }));
    }catch(err){ setScanError("Barcode not detected — try a clearer photo, or just type the details below. ("+err.message+")"); }
    setScanLoading(false);
  };

  const handleScanFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    e.target.value="";
    const fr = new FileReader();
    fr.onload = ev => processScan(ev.target.result);
    fr.readAsDataURL(file);
  };

  const save = async () => {
    if(!f.vehicle_reg.trim()){ alert("Vehicle registration required"); return; }
    setSaving(true);
    try{
      await onSave({...f, id: f.id||makeId("WSLR"), renewal_years:+f.renewal_years||1,
        status: f.status||"pending", commission_status: f.commission_status||"unpaid",
        submitted_at: f.submitted_at||new Date().toISOString()});
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="🚶 Walk-in Renewal" onClose={onClose}/>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",background:"var(--surface2)",border:"2px dashed var(--border)",borderRadius:9,cursor:scanLoading?"wait":"pointer",fontSize:13,fontWeight:600,color:"var(--text2)"}}>
          <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleScanFile} disabled={scanLoading}/>
          {scanLoading?"⏳ Scanning…":"📷 Scan Disc (camera)"}
        </label>
        <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",background:"var(--surface2)",border:"2px dashed var(--border)",borderRadius:9,cursor:scanLoading?"wait":"pointer",fontSize:13,fontWeight:600,color:"var(--text2)"}}>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={handleScanFile} disabled={scanLoading}/>
          {scanLoading?"⏳ Scanning…":"🖼️ Scan Disc (gallery)"}
        </label>
      </div>
      {scanError&&<div style={{fontSize:12,color:"var(--red)",marginBottom:14}}>{scanError}</div>}
      <div style={{fontSize:11,color:"var(--text3)",marginBottom:14,textAlign:"center"}}>Or just type the details below — scanning is optional.</div>

      <FG cols="1fr 1fr 1fr">
        <div><FL label="Reg Plate"/><input className="inp" value={f.vehicle_reg} onChange={e=>s("vehicle_reg",e.target.value.toUpperCase())} placeholder="ABC123GP"/></div>
        <div><FL label="Make"/><input className="inp" value={f.vehicle_make} onChange={e=>s("vehicle_make",e.target.value)}/></div>
        <div><FL label="Model"/><input className="inp" value={f.vehicle_model} onChange={e=>s("vehicle_model",e.target.value)}/></div>
      </FG>
      <FG cols="1fr 1fr">
        <div><FL label="VIN"/><input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
        <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
      </FG>
      <FG cols="1fr 1fr">
        <div>
          <FL label="Current Expiry"/>
          <input className="inp" type="date" value={f.current_expiry} onChange={e=>s("current_expiry",e.target.value)}/>
        </div>
        <div>
          <FL label="Renew for (years)"/>
          <select className="inp" value={f.renewal_years} onChange={e=>s("renewal_years",e.target.value)}>
            <option value="1">1 year</option>
            <option value="2">2 years</option>
            <option value="3">3 years</option>
          </select>
        </div>
      </FG>
      <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:4,marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Customer Details</div>
        <FG cols="1fr 1fr">
          <div><FL label="Customer Name"/><input className="inp" value={f.owner_name} onChange={e=>s("owner_name",e.target.value)}/></div>
          <div><FL label="Customer Phone"/><input className="inp" value={f.owner_phone} onChange={e=>s("owner_phone",e.target.value)}/></div>
        </FG>
        <FL label="Owner ID / Passport No."/><input className="inp" value={f.owner_id} onChange={e=>s("owner_id",e.target.value)} placeholder="SA ID number or passport"/>
      </div>

      <div style={{marginBottom:14}}>
        <FL label="Supporting Documents (optional)"/>
        <LicenceDocsChecklist documents={f.documents} onChange={docs=>s("documents",docs)}
          pathPrefix={`licence_renewals/${(f.vehicle_reg||"walkin").replace(/[\s/\\]/g,"_").toUpperCase()}`}/>
      </div>

      <FL label="Notes"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Any special instructions…" style={{minHeight:50,marginBottom:16}}/>

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save Renewal"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// CAR SALES — trade-in / used car listings pipeline
// ═══════════════════════════════════════════════════════════════
const STATUS_INFO = {
  available: {label:"Available", color:"var(--green)",  bg:"rgba(52,211,153,.15)"},
  reserved:  {label:"Reserved",  color:"var(--yellow)", bg:"rgba(251,191,36,.15)"},
  sold:      {label:"Sold",      color:"var(--text3)",  bg:"rgba(148,163,184,.15)"},
};
const SOURCE_LABEL = {trade_in:"🔄 Trade-in", referral:"🤝 Referral", other:"📋 Other"};

export function CarSalesPage({listings=[], onSave, onUpdate, onDelete}) {
  const [filter, setFilter] = useState("available");
  const [search, setSearch] = useState("");
  const [modalListing, setModalListing] = useState(null); // null=closed, {}=new, {...}=edit
  const C = curSym(getSettings().currency);

  const q = search.trim().toLowerCase();
  const filtered = listings
    .filter(l => filter==="all" || l.status===filter)
    .filter(l => !q || [l.vehicle_reg,l.make,l.model,l.vin].filter(Boolean).some(v=>v.toLowerCase().includes(q)));

  const totalValue = listings.filter(l=>l.status==="available").reduce((s,l)=>s+(+l.price||0),0);
  const soldValue = listings.filter(l=>l.status==="sold").reduce((s,l)=>s+(+l.sold_price||l.price||0),0);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <div>
          <div style={{fontWeight:700,fontSize:18,marginBottom:2}}>🏷️ Car Sales</div>
          <div style={{fontSize:13,color:"var(--text3)"}}>
            {listings.length} listings · {C}{totalValue.toLocaleString()} available · {C}{soldValue.toLocaleString()} sold
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>setModalListing({})}>+ New Listing</button>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        {[["all","All"],["available","Available"],["reserved","Reserved"],["sold","Sold"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            style={{padding:"5px 12px",borderRadius:20,border:"1px solid var(--border)",background:filter===v?"var(--accent)":"var(--surface2)",color:filter===v?"#fff":"var(--text2)",fontSize:12,cursor:"pointer",fontWeight:filter===v?700:400}}>
            {l} <span style={{opacity:.6}}>{v==="all"?listings.length:listings.filter(x=>x.status===v).length}</span>
          </button>
        ))}
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reg, make, model, VIN…"
          style={{marginLeft:"auto",maxWidth:240,fontSize:12,padding:"6px 10px"}}/>
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text3)"}}>
          <div style={{fontSize:32,marginBottom:8}}>🏷️</div>
          <div style={{fontSize:14}}>No listings {filter==="all"?"yet":`with status "${filter}"`}</div>
        </div>
      )}

      {filtered.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>
          {filtered.map(l=>{
            const photos = Array.isArray(l.photos)?l.photos:[];
            const si = STATUS_INFO[l.status]||STATUS_INFO.available;
            return (
              <div key={l.id} className="card card-hover" style={{padding:14,cursor:"pointer",display:"flex",flexDirection:"column"}}
                onClick={()=>setModalListing(l)}>
                {photos[0]
                  ? <img src={photos[0]} alt={l.make} style={{width:"100%",height:130,objectFit:"cover",borderRadius:9,marginBottom:10,background:"var(--surface2)"}}/>
                  : <div style={{width:"100%",height:130,background:"var(--surface2)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,marginBottom:10}}>🚗</div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6,marginBottom:4}}>
                  <div style={{fontWeight:700,fontSize:14}}>{l.year||""} {l.make} {l.model}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:si.bg,color:si.color,flexShrink:0}}>{si.label}</span>
                </div>
                <div style={{fontSize:12,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginBottom:6}}>{l.vehicle_reg||"—"}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>{SOURCE_LABEL[l.source]||l.source||""}{l.mileage?` · ${(+l.mileage).toLocaleString()} km`:""}</div>
                <div style={{marginTop:"auto",fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:20,color:"var(--accent)"}}>
                  {l.status==="sold"?`${C}${(+l.sold_price||+l.price||0).toLocaleString()}`:`${C}${(+l.price||0).toLocaleString()}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalListing&&(
        <CarSaleModal listing={modalListing}
          onSave={async(rec)=>{ await onSave(rec); setModalListing(null); }}
          onDelete={modalListing.id?async()=>{ if(window.confirm("Delete this listing?")){ await onDelete(modalListing.id); setModalListing(null); } }:null}
          onMarkSold={modalListing.id?async(soldPrice,soldTo)=>{ await onUpdate(modalListing.id,{status:"sold",sold_at:new Date().toISOString(),sold_price:soldPrice||null,sold_to:soldTo||null}); setModalListing(null); }:null}
          onClose={()=>setModalListing(null)}/>
      )}
    </div>
  );
}

function CarSaleModal({listing, onSave, onDelete, onMarkSold, onClose}) {
  const isNew = !listing.id;
  const [f, setF] = useState({
    vehicle_reg:"", make:"", model:"", year:"", vin:"", color:"", mileage:"",
    price:"", trade_in_value:"", status:"available", source:"trade_in",
    photos:[], notes:"", contact_name:"", contact_phone:"",
    ...listing,
  });
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSoldForm, setShowSoldForm] = useState(false);
  const [soldPrice, setSoldPrice] = useState(listing.sold_price||listing.price||"");
  const [soldTo, setSoldTo] = useState(listing.sold_to||"");
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    e.target.value="";
    setUploading(true);
    try{
      const dataUrl = await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=ev=>res(ev.target.result);fr.onerror=rej;fr.readAsDataURL(file);});
      const blob = await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1200; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          canvas.toBlob(b=>b?res(b):rej(new Error("toBlob failed")),"image/jpeg",0.85);
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const path=`car_sales/${(f.vehicle_reg||"listing").replace(/[\s/\\]/g,"_").toUpperCase()}_${Date.now()}.jpg`;
      const url = await uploadToStorage("cars_parts",path,blob,"image/jpeg");
      s("photos",[...(f.photos||[]),url]);
    }catch(err){ alert("Photo upload failed: "+err.message); }
    setUploading(false);
  };

  const removePhoto = (idx) => s("photos",(f.photos||[]).filter((_,i)=>i!==idx));

  const save = async () => {
    if(!f.make.trim()&&!f.vehicle_reg.trim()){ alert("Enter at least a make or registration number"); return; }
    setSaving(true);
    try{ await onSave({...f, id: f.id||makeId("CS")}); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={isNew?"🏷️ New Car Listing":"🏷️ Edit Listing"} onClose={onClose}/>

      {/* Photos */}
      <div style={{marginBottom:14}}>
        <FL label="Photos"/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {(f.photos||[]).map((url,i)=>(
            <div key={i} style={{position:"relative",width:80,height:80,flexShrink:0}}>
              <img src={url} alt="" onClick={()=>setLightbox(url)} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:8,cursor:"zoom-in"}}/>
              <button onClick={()=>removePhoto(i)} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",border:"none",background:"var(--red)",color:"#fff",cursor:"pointer",fontSize:11,lineHeight:1}}>✕</button>
            </div>
          ))}
          <label style={{width:80,height:80,flexShrink:0,border:"2px dashed var(--border)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:uploading?"wait":"pointer",fontSize:22,color:"var(--text3)"}}>
            <input type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto} disabled={uploading}/>
            {uploading?"⏳":"+"}
          </label>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <div><FL label="Registration"/><input className="inp" value={f.vehicle_reg} onChange={e=>s("vehicle_reg",e.target.value.toUpperCase())} placeholder="e.g. AB12CDGP"/></div>
        <div><FL label="VIN"/><input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value)}/></div>
        <div><FL label="Make"/><input className="inp" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="e.g. Toyota"/></div>
        <div><FL label="Model"/><input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="e.g. Corolla"/></div>
        <div><FL label="Year"/><input className="inp" type="number" value={f.year} onChange={e=>s("year",e.target.value)}/></div>
        <div><FL label="Color"/><input className="inp" value={f.color} onChange={e=>s("color",e.target.value)}/></div>
        <div><FL label="Mileage (km)"/><input className="inp" type="number" value={f.mileage} onChange={e=>s("mileage",e.target.value)}/></div>
        <div>
          <FL label="Source"/>
          <select className="inp" value={f.source} onChange={e=>s("source",e.target.value)}>
            <option value="trade_in">🔄 Trade-in</option>
            <option value="referral">🤝 Referral</option>
            <option value="other">📋 Other</option>
          </select>
        </div>
        <div><FL label="Asking Price"/><input className="inp" type="number" value={f.price} onChange={e=>s("price",e.target.value)}/></div>
        <div><FL label="Trade-in Value (optional)"/><input className="inp" type="number" value={f.trade_in_value} onChange={e=>s("trade_in_value",e.target.value)}/></div>
        <div><FL label="Contact Name"/><input className="inp" value={f.contact_name} onChange={e=>s("contact_name",e.target.value)}/></div>
        <div><FL label="Contact Phone"/><input className="inp" value={f.contact_phone} onChange={e=>s("contact_phone",e.target.value)}/></div>
        <div style={{gridColumn:"1/-1"}}>
          <FL label="Status"/>
          <select className="inp" value={f.status} onChange={e=>s("status",e.target.value)}>
            <option value="available">✅ Available</option>
            <option value="reserved">⏳ Reserved</option>
            <option value="sold">🏁 Sold</option>
          </select>
        </div>
        <div style={{gridColumn:"1/-1"}}><FL label="Notes"/><textarea className="inp" rows={3} value={f.notes} onChange={e=>s("notes",e.target.value)}/></div>
      </div>

      {!isNew&&onMarkSold&&f.status!=="sold"&&(
        <div style={{marginBottom:14,padding:12,background:"var(--surface2)",borderRadius:10}}>
          {!showSoldForm ? (
            <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setShowSoldForm(true)}>🏁 Mark as Sold</button>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontWeight:700,fontSize:13}}>🏁 Confirm Sale</div>
              <input className="inp" type="number" placeholder="Sold price" value={soldPrice} onChange={e=>setSoldPrice(e.target.value)}/>
              <input className="inp" placeholder="Sold to (buyer name, optional)" value={soldTo} onChange={e=>setSoldTo(e.target.value)}/>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowSoldForm(false)}>Cancel</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={()=>onMarkSold(soldPrice,soldTo)}>Confirm Sold</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        {onDelete&&<button className="btn btn-danger" onClick={onDelete}>🗑️ Delete</button>}
        <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save Listing"}</button>
      </div>

      {lightbox&&<ImgLightbox url={lightbox} onClose={()=>setLightbox(null)}/>}
    </Overlay>
  );
}

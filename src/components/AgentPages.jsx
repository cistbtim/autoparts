import { useState } from "react";
import { uploadToStorage } from "../lib/api.js";
import { getSettings, curSym } from "../lib/settings.js";
import { makeId, waLink } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";
import { Overlay, MHead, FL, FG, ImgLightbox, LicenceDocsChecklist, RenewalDocsModal, LICENCE_DOC_TYPES, uploadRenewalOutput, uploadAttachment, IcWhatsApp } from "./shared.jsx";

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

// WhatsApp can't attach files, only text — so the office gets a direct link.
// When a merged PDF packet was built successfully, that single link replaces
// the old one-link-per-document list (much easier for the office to open,
// read and print in one go); if PDF generation wasn't available, it falls
// back to linking every uploaded document separately like before.
const buildOfficeMessage = (r, pdfUrl) => {
  const docLines = LICENCE_DOC_TYPES.map(({key,label})=>{
    const d = r.documents?.[key];
    const url = typeof d==="string" ? d : d?.url;
    return url ? `${label}: ${url}` : null;
  }).filter(Boolean);
  const lines = [
    "🪪 Licence Renewal — please process",
    "",
    `Reg: ${r.vehicle_reg||"—"}  ${r.vehicle_make||""} ${r.vehicle_model||""}`.trim(),
    r.vin ? `VIN: ${r.vin}` : null,
    r.engine_no ? `Engine: ${r.engine_no}` : null,
    r.current_expiry ? `Current Expiry: ${r.current_expiry}` : null,
    `Renew for: ${r.renewal_years||1} year${+r.renewal_years>1?"s":""}`,
    "",
    `Owner: ${r.owner_name||"—"}`,
    r.owner_id ? `ID / Passport: ${r.owner_id}` : null,
    r.owner_phone ? `Phone: ${r.owner_phone}` : null,
    "",
  ];
  if(pdfUrl){
    lines.push(`📄 Full renewal packet (PDF): ${pdfUrl}`);
  } else {
    lines.push(docLines.length ? "📎 Documents:" : "⚠️ No documents attached yet");
    lines.push(...docLines);
  }
  return lines.filter(Boolean).join("\n");
};

// Loads a (same-origin-CORS) image URL and re-encodes it as a JPEG data URL —
// jsPDF needs pixel data it can embed, not a bare URL.
const imgToJpegDataUrl = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try{
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), w: img.naturalWidth, h: img.naturalHeight });
    }catch(err){ reject(err); }
  };
  img.onerror = reject;
  img.src = url;
});

// One PDF covering the renewal details plus every uploaded document — each
// image gets its own full page; a document that's itself a PDF can't be
// merged in client-side, so it gets a page with its name and a link instead.
const buildOfficePdfBlob = async (r) => {
  // Dynamically imported — jsPDF (plus its optional html2canvas/DOMPurify
  // deps) is only needed by this one admin-only action, so it shouldn't be
  // in everyone else's initial bundle.
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210, pageH = 297, margin = 16;
  let y = margin;
  const line = (txt, opts) => { if(!txt) return; doc.text(txt, margin, y); y += (opts?.gap ?? 6); };
  doc.setFontSize(16); doc.setFont(undefined, "bold");
  line("Licence Renewal — Please Process", { gap: 9 });
  doc.setFontSize(11); doc.setFont(undefined, "normal");
  line(`Reg: ${r.vehicle_reg||"—"}  ${r.vehicle_make||""} ${r.vehicle_model||""}`.trim());
  line(r.vin ? `VIN: ${r.vin}` : null);
  line(r.engine_no ? `Engine: ${r.engine_no}` : null);
  line(r.current_expiry ? `Current Expiry: ${r.current_expiry}` : null);
  line(`Renew for: ${r.renewal_years||1} year${+r.renewal_years>1?"s":""}`, { gap: 9 });
  line(`Owner: ${r.owner_name||"—"}`);
  line(r.owner_id ? `ID / Passport: ${r.owner_id}` : null);
  line(r.owner_phone ? `Phone: ${r.owner_phone}` : null);
  if(r.notes){ y += 3; doc.setFont(undefined, "italic"); line(`Notes: ${r.notes}`); doc.setFont(undefined, "normal"); }

  const docsList = LICENCE_DOC_TYPES.map(({key,label})=>{
    const d = r.documents?.[key];
    const url = typeof d==="string" ? d : d?.url;
    return url ? {label,url} : null;
  }).filter(Boolean);
  if(r.receipt_url) docsList.push({label:"Payment Receipt", url:r.receipt_url});
  if(r.new_licence_url) docsList.push({label:"New Licence Disc", url:r.new_licence_url});

  for(const {label,url} of docsList){
    doc.addPage();
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text(label, margin, margin);
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    const isPdf = /\.pdf(\?|$)/i.test(url);
    let embedded = false;
    if(!isPdf){
      try{
        const { dataUrl, w, h } = await imgToJpegDataUrl(url);
        const maxW = pageW - margin*2, maxH = pageH - margin*2 - 10;
        const scale = Math.min(maxW/w, maxH/h, 1);
        doc.addImage(dataUrl, "JPEG", margin, margin+10, w*scale, h*scale);
        embedded = true;
      }catch{ /* fall through to the link-only page below */ }
    }
    if(!embedded){
      doc.text(isPdf ? "This is a PDF and can't be merged in here — open it directly:" : "Couldn't load this image — open it directly:", margin, margin+8);
      doc.setTextColor(37,99,235);
      doc.textWithLink(url, margin, margin+14, { url });
      doc.setTextColor(0,0,0);
    }
  }
  return doc.output("blob");
};

const buildAndUploadOfficePdf = async (r) => {
  const blob = await buildOfficePdfBlob(r);
  const path = `licence_renewals/${(r.vehicle_reg||"walkin").replace(/[\s/\\]/g,"_")}/office_${Date.now()}.pdf`;
  return uploadToStorage("cars_parts", path, blob, "application/pdf");
};

// A small green tick badge in the corner of an action button — shows
// "done"/"sent" without swapping out the button's own icon/color, so it
// still reads as the same button (Office, New Disc, Receipt, …) at a glance.
function TickBadge({show}) {
  if(!show) return null;
  return (
    <span style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",
      background:"var(--green)",color:"#fff",fontSize:9,fontWeight:900,display:"flex",
      alignItems:"center",justifyContent:"center",border:"2px solid var(--surface)",lineHeight:1}}>✓</span>
  );
}

// The "Office" button on a renewal row — sends a WhatsApp with links to every
// uploaded document to whichever processing agent/office it's forwarded to.
// One agent configured → a plain send button, same as before. More than one
// → a dropdown so the licence agent picks which office this particular
// application goes to (they don't all handle the same region/vehicle type).
function OfficeSendControl({r, agents: allAgents, onUpdate, actionBtnStyle}) {
  const agents = allAgents.filter(a=>a.whatsapp);
  const [busy, setBusy] = useState(false);
  if(!agents.length) return null;
  const label = (a) => a.company||a.name||"Office";
  const sentTitle = r.sent_to_office_at ? `Sent to ${r.sent_to_office_agent||"office"} ${new Date(r.sent_to_office_at).toLocaleString()}` : null;

  // Building the PDF is async, but a WhatsApp tab opened AFTER an await gets
  // killed by the popup blocker (it's no longer a direct response to the
  // click) — so the tab opens blank right away, in-click, and gets pointed
  // at the real wa.me link once the PDF upload finishes.
  const sendTo = async (a) => {
    const win = window.open("", "_blank");
    setBusy(true);
    try{
      const pdfUrl = await buildAndUploadOfficePdf(r);
      if(win) win.location.href = waLink(a.whatsapp, buildOfficeMessage(r, pdfUrl));
      onUpdate?.(r.id, {sent_to_office_at:new Date().toISOString(), sent_to_office_agent:label(a)});
    }catch(err){
      win?.close();
      alert("Couldn't build the PDF — sending the document links instead. ("+err.message+")");
      window.open(waLink(a.whatsapp, buildOfficeMessage(r)), "_blank", "noopener,noreferrer");
      onUpdate?.(r.id, {sent_to_office_at:new Date().toISOString(), sent_to_office_agent:label(a)});
    }
    setBusy(false);
  };

  if(agents.length===1){
    const a = agents[0];
    return (
      <div style={{position:"relative",display:"inline-flex"}}>
        <button onClick={()=>sendTo(a)} disabled={busy}
          title={busy?"Building PDF…":(sentTitle||`Send to ${label(a)}`)}
          style={{...actionBtnStyle("office"), cursor:busy?"wait":"pointer"}}>
          {busy?"⏳":"🧑‍💼"}
        </button>
        <TickBadge show={!!r.sent_to_office_at && !busy}/>
      </div>
    );
  }
  return (
    <div style={{position:"relative",display:"inline-flex"}}>
      <select value="" disabled={busy} title={busy?"Building PDF…":(sentTitle||"Choose an agent/office to send to")}
        onChange={e=>{ const a=agents.find(x=>x.id===e.target.value); e.target.value=""; if(a) sendTo(a); }}
        style={{...actionBtnStyle("office"), appearance:"none", textAlign:"center", padding:0, cursor:busy?"wait":"pointer"}}>
        <option value="" disabled>{busy?"⏳":"🧑‍💼"}</option>
        {agents.map(a=><option key={a.id} value={a.id}>{label(a)}</option>)}
      </select>
      <TickBadge show={!!r.sent_to_office_at && !busy}/>
    </div>
  );
}

// Add / edit / remove the roster of processing agents/offices right from the
// Licence Agent page itself — no need to go into global Settings for
// something only this page uses.
function ManageOfficeAgentsModal({agents=[], onSave, onClose}) {
  const [list, setList] = useState(agents);
  const [saving, setSaving] = useState(false);
  const upd = (i,patch) => setList(p=>{ const arr=[...p]; arr[i]={...arr[i],...patch}; return arr; });
  const remove = (i) => setList(p=>p.filter((_,idx)=>idx!==i));
  const add = () => setList(p=>[...p,{id:makeId(),company:"",address:"",name:"",telephone:"",whatsapp:""}]);
  const save = async () => {
    setSaving(true);
    try{ await onSave?.(list); onClose(); }
    finally{ setSaving(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <MHead title="🏢 Manage Processing Agents / Offices" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Where you forward a renewal's documents once collected, to actually get the application processed. Add every agent/office you deal with — the "📤 Office" button on each renewal sends a WhatsApp with links to view and print every uploaded document; with more than one here, it lets you pick which one to send to.
      </div>
      {list.map((a,i)=>(
        <div key={a.id||i} style={{border:"1px solid var(--border)",borderRadius:8,padding:"14px 12px 4px",marginBottom:10,position:"relative"}}>
          <button type="button" className="btn btn-ghost btn-xs" style={{position:"absolute",top:6,right:6,color:"var(--red)"}} onClick={()=>remove(i)}>✕</button>
          <FG cols="1fr 1fr">
            <div><FL label="Company"/><input className="inp" value={a.company||""} onChange={e=>upd(i,{company:e.target.value})} placeholder="e.g. ABC Licensing Services"/></div>
            <div><FL label="Company Address"/><input className="inp" value={a.address||""} onChange={e=>upd(i,{address:e.target.value})} placeholder="Street, city"/></div>
          </FG>
          <FG cols="1fr 1fr 1fr">
            <div><FL label="Contact Name"/><input className="inp" value={a.name||""} onChange={e=>upd(i,{name:e.target.value})} placeholder="e.g. John"/></div>
            <div><FL label="Telephone"/><input className="inp" value={a.telephone||""} onChange={e=>upd(i,{telephone:e.target.value})} placeholder="Landline (optional)"/></div>
            <div><FL label="WhatsApp"/><input className="inp" value={a.whatsapp||""} onChange={e=>upd(i,{whatsapp:e.target.value})} placeholder="27821234567 (no + or spaces)"/></div>
          </FG>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{borderStyle:"dashed",marginBottom:16}} onClick={add}>+ Add Agent / Office</button>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// LICENCE RENEWAL AGENT — cross-workshop renewal queue
// ═══════════════════════════════════════════════════════════════
export function LicenceAgentPage({renewals=[], workshopInfo={}, onUpdate, onSave, onDelete, onRefresh, officeAgents=[], onSaveOfficeAgents}) {
  const [filter, setFilter] = useState("all");
  // Which renewal+field is mid-upload, as `${id}:${field}` — lets the quick
  // shortcut buttons in the table (receipt / new licence disc) show a spinner
  // on just that one button instead of blocking the whole row or page.
  const [quickUploading, setQuickUploading] = useState("");
  const quickUpload = async (r, field, file) => {
    setQuickUploading(`${r.id}:${field}`);
    try{ await uploadRenewalOutput(r, field, file, onUpdate); }
    catch(err){ alert("Upload failed: "+err.message); }
    setQuickUploading("");
  };
  // One consistent icon-only button for every action on a row (Edit, Docs,
  // Receipt, New Disc, WhatsApp, Office, Delete) — a row of 7 full text+icon
  // buttons wrapped onto 3 messy lines, so each is now a small fixed-size
  // square with just its icon; the name shows as a tooltip (title) instead.
  // Color still signals meaning: neutral = plain action, soft green tint =
  // something is on file, solid brand green = a WhatsApp send, red = destructive.
  const ACTION_BTN = {display:"flex",alignItems:"center",justifyContent:"center",
    width:34,height:34,borderRadius:9,fontSize:15,fontWeight:600,cursor:"pointer",
    border:"1px solid transparent",flexShrink:0};
  const actionBtnStyle = (variant) => {
    if(variant==="done")   return {...ACTION_BTN,background:"rgba(52,211,153,.14)",color:"var(--green)",border:"1px solid rgba(52,211,153,.35)"};
    if(variant==="brand")  return {...ACTION_BTN,background:"#25D366",color:"#fff"};
    if(variant==="office") return {...ACTION_BTN,background:"rgba(96,165,250,.15)",color:"var(--blue)",border:"1px solid rgba(96,165,250,.35)"};
    if(variant==="danger") return {...ACTION_BTN,background:"#dc2626",color:"#fff"};
    return {...ACTION_BTN,background:"var(--surface2)",color:"var(--text2)",border:"1px solid var(--border)"};
  };

  // Leaving `capture` off the file input means tapping this on a phone shows
  // the OS's own native sheet (Camera / Photos / Files) — that already IS the
  // camera+gallery choice, just handled by the platform instead of us
  // building two separate buttons for it.
  const QuickUploadBtn = ({r, field, label, icon, doneUrl}) => {
    const busy = quickUploading===`${r.id}:${field}`;
    return (
      <div style={{position:"relative",display:"inline-flex"}}>
        <label title={doneUrl?`${label} — uploaded, tap to replace`:`Upload ${label}`}
          style={{...actionBtnStyle("default"), cursor:quickUploading?"wait":"pointer"}}>
          <input type="file" accept="image/*,application/pdf" style={{display:"none"}}
            onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if(f) quickUpload(r,field,f); }} disabled={!!quickUploading}/>
          <span>{busy?"⏳":icon}</span>
        </label>
        <TickBadge show={!!doneUrl && !busy}/>
      </div>
    );
  };
  // Holds the id, not the row itself — RenewalDocsModal calls onUpdate on
  // every change (upload, expiry date, etc.), which patches `renewals` up in
  // App.jsx. If this held a snapshot of the row instead, the modal would keep
  // showing the object from when it opened and every edit would look like it
  // silently reverted (e.g. a manually-typed expiry date appearing blank
  // right after picking it). Deriving it fresh from `renewals` every render
  // keeps the open modal in sync with whatever was just saved.
  const [docsRenewalId, setDocsRenewalId] = useState(null);
  const docsRenewal = docsRenewalId ? renewals.find(r=>r.id===docsRenewalId)||null : null;
  const [walkInPrefill, setWalkInPrefill] = useState(null); // null=closed, {}=blank, {...}=prefilled from a due-soon row
  const [editRenewal, setEditRenewal] = useState(null); // null=closed, {...existing row} = editing it in place
  const [manageAgentsOpen, setManageAgentsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dueSoonDays, setDueSoonDays] = useState(()=>{
    try{ return +localStorage.getItem("licence_agent_due_soon_days") || 30; }catch{ return 30; }
  });
  const setDueSoonDaysPersist = (v) => { setDueSoonDays(v); try{ localStorage.setItem("licence_agent_due_soon_days", v); }catch{/* ignore */} };
  const C = curSym(getSettings().currency);

  const filtered = filter==="all" ? renewals : renewals.filter(r=>r.status===filter);
  const unpaidComm = renewals.filter(r=>r.commission_status==="unpaid"&&r.status==="completed");
  const totalComm = renewals.filter(r=>r.commission_status==="paid").reduce((s,r)=>s+(+r.commission_amount||0),0);

  // How many customer cars each workshop has sent through for renewal —
  // grouped the same way the table already groups "🚶 Walk-in" (no workshop_id).
  const byWorkshop = {};
  renewals.forEach(r=>{
    const key = r.workshop_id || "__walkin__";
    if(!byWorkshop[key]) byWorkshop[key] = {
      label: r.workshop_id ? (workshopInfo[r.workshop_id]?.name||r.workshop_id) : "🚶 Walk-in",
      total:0, pending:0, submitted:0, completed:0, cancelled:0,
    };
    byWorkshop[key].total++;
    byWorkshop[key][r.status||"pending"]++;
  });
  const workshopRows = Object.values(byWorkshop).sort((a,b)=>b.total-a.total);

  // Renewals already completed whose NEXT disc is due within dueSoonDays.
  // Prefer new_licence_expiry — read straight off the new disc's own barcode
  // when it was uploaded — over the current_expiry + renewal_years guess,
  // since the guess can be off (wrong renewal_years, disc issued a few days
  // either side of the exact anniversary, etc.).
  const dueSoon = renewals
    .filter(r=>r.status==="completed"&&(r.new_licence_expiry||r.current_expiry))
    .map(r=>({...r, nextExpiry: r.new_licence_expiry||addYears(r.current_expiry, r.renewal_years)}))
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
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&(
            <button className="btn btn-ghost" disabled={refreshing}
              onClick={async()=>{ setRefreshing(true); try{ await onRefresh(); } finally { setRefreshing(false); } }}>
              {refreshing?"⏳":"🔄"} Refresh
            </button>
          )}
          <button className="btn btn-ghost" onClick={()=>setManageAgentsOpen(true)}>🏢 Manage Agents</button>
          {onSave&&<button className="btn btn-primary" onClick={()=>setWalkInPrefill({})}>+ Walk-in Customer</button>}
        </div>
      </div>

      {manageAgentsOpen&&(
        <ManageOfficeAgentsModal agents={officeAgents} onSave={onSaveOfficeAgents} onClose={()=>setManageAgentsOpen(false)}/>
      )}

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
                <span style={{color:"var(--text3)"}}>{workshopInfo[r.workshop_id]?.name||(r.workshop_id?r.workshop_id:"🚶 Walk-in")}</span>
                <span style={{color:r.daysLeft<=7?"var(--red)":"var(--yellow)",fontWeight:600}}>
                  Expires {r.nextExpiry} ({r.daysLeft===0?"today":`${r.daysLeft}d left`})
                </span>
                <span style={{fontSize:11,color:r.notified_at?"var(--green)":"var(--text3)",marginLeft:"auto"}}>
                  {r.notified_at?`✅ Notified ${new Date(r.notified_at).toLocaleString()}`:"Not notified yet"}
                </span>
                {(()=>{
                  // Same routing as the main table's contact button: a
                  // workshop-submitted renewal notifies the WORKSHOP (they're
                  // the ones who deal with their own customer), a walk-in
                  // notifies the customer directly.
                  const waPhone = r.workshop_id ? (workshopInfo[r.workshop_id]?.phone||"") : (r.owner_phone||"");
                  if(!waPhone) return null;
                  const msg = r.workshop_id
                    ? `Hi, a reminder that ${r.owner_name||"your customer"}'s vehicle ${r.vehicle_reg}'s licence disc is due for renewal again on ${r.nextExpiry}. Please arrange the next renewal with them.`
                    : `Hi ${r.owner_name||""}, a reminder that your vehicle ${r.vehicle_reg}'s licence disc is due for renewal on ${r.nextExpiry}. Please contact us to arrange your next renewal.`;
                  return (
                    <a href={waLink(waPhone,msg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}
                      onClick={()=>onUpdate?.(r.id,{notified_at:new Date().toISOString()})}>
                      <button style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"#25D366",color:"#fff",cursor:"pointer"}}>📲 Notify</button>
                    </a>
                  );
                })()}
                {onSave&&(
                  <button onClick={()=>{
                    // Carry the customer's documents on file forward too — no
                    // need to re-upload a passport/ID that hasn't changed.
                    // LicenceDocsChecklist already flags any that have since
                    // expired (⚠️ Expired next to that row) so it's obvious
                    // which ones need a fresh copy before this goes through.
                    // The one exception: "Licence Disc / Vehicle Doc" itself —
                    // carrying the OLD supporting document forward would show
                    // it as expired (it's literally the disc that just ran
                    // out), when the disc actually on file now is the NEW one
                    // that was uploaded to finish that previous renewal.
                    const carriedDocs = {...(r.documents||{})};
                    if(r.new_licence_url) carriedDocs.licence_disc = {url:r.new_licence_url, expiry:r.new_licence_expiry||""};
                    setWalkInPrefill({
                      vehicle_reg:r.vehicle_reg, vehicle_make:r.vehicle_make, vehicle_model:r.vehicle_model,
                      vin:r.vin, engine_no:r.engine_no, current_expiry:r.nextExpiry,
                      owner_name:r.owner_name, owner_phone:r.owner_phone, owner_id:r.owner_id||"",
                      workshop_id:r.workshop_id||null, documents:carriedDocs,
                    });
                  }}
                    style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"var(--surface3)",color:"var(--text2)",cursor:"pointer"}}>🔄 Start Renewal</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report: how many customer cars each workshop has sent through for renewal */}
      <div className="card" style={{padding:14,marginBottom:14,overflow:"auto"}}>
        <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>📊 Renewals by Workshop</div>
        {workshopRows.length===0&&<div style={{color:"var(--text3)",fontSize:13}}>No renewals yet</div>}
        {workshopRows.length>0&&(<>
          <div className="mob-cards">
            {workshopRows.map(w=>(
              <div key={w.label} className="card" style={{padding:12}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>{w.label} <span style={{color:"var(--text3)",fontWeight:400}}>· {w.total} total</span></div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12}}>
                  <span style={{color:"var(--yellow)"}}>⏳ {w.pending||0}</span>
                  <span style={{color:"var(--blue)"}}>📤 {w.submitted||0}</span>
                  <span style={{color:"var(--green)"}}>✅ {w.completed||0}</span>
                  <span style={{color:"var(--red)"}}>❌ {w.cancelled||0}</span>
                </div>
              </div>
            ))}
          </div>
          <table className="tbl desk-table" style={{width:"100%"}}>
            <thead><tr><th>Company / Walk-in</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Pending</th><th style={{textAlign:"right"}}>Submitted</th><th style={{textAlign:"right"}}>Completed</th><th style={{textAlign:"right"}}>Cancelled</th></tr></thead>
            <tbody>
              {workshopRows.map(w=>(
                <tr key={w.label}>
                  <td style={{fontWeight:600,fontSize:13}}>{w.label}</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{w.total}</td>
                  <td style={{textAlign:"right",color:"var(--yellow)"}}>{w.pending||0}</td>
                  <td style={{textAlign:"right",color:"var(--blue)"}}>{w.submitted||0}</td>
                  <td style={{textAlign:"right",color:"var(--green)"}}>{w.completed||0}</td>
                  <td style={{textAlign:"right",color:"var(--red)"}}>{w.cancelled||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}
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

      {filtered.length>0&&(<>
        <div className="mob-cards">
          {filtered.map(r=>{
            const isExpired = r.current_expiry && new Date(r.current_expiry)<new Date();
            const waPhone = r.workshop_id ? (workshopInfo[r.workshop_id]?.phone||"") : (r.owner_phone||"");
            const waMsg = r.workshop_id
              ? `Hi, regarding the licence renewal for ${r.vehicle_reg||"the vehicle"} (${r.owner_name||"customer"}) — status: ${r.status||"pending"}.`
              : "";
            return (
              <div key={r.id} className="card" style={{padding:14,borderLeft:`3px solid ${isExpired?"var(--red)":"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:14}}>{r.vehicle_reg}</div>
                    <div style={{fontSize:12,color:"var(--text3)"}}>{r.vehicle_make} {r.vehicle_model}</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{workshopInfo[r.workshop_id]?.name||(r.workshop_id?r.workshop_id:"🚶 Walk-in")}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    {r.new_licence_expiry ? (
                      <>
                        <div style={{fontSize:10,color:"var(--text3)",textDecoration:"line-through"}}>{r.current_expiry||"—"}</div>
                        <div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>🆕 {r.new_licence_expiry}</div>
                      </>
                    ) : (
                      <div style={{fontSize:12,fontWeight:600,color:isExpired?"var(--red)":"var(--green)"}}>{r.current_expiry||"—"} {isExpired?"⚠️":""}</div>
                    )}
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{r.renewal_years||1} yr renewal</div>
                  </div>
                </div>
                <div style={{fontSize:13,marginBottom:10}}>{r.owner_name||"—"}{r.owner_phone?` · ${r.owner_phone}`:""}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
                  <select value={r.status||"pending"} onChange={e=>onUpdate(r.id,{status:e.target.value})}
                    style={{fontSize:12,padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",color:"var(--text1)"}}>
                    <option value="pending">⏳ Pending</option>
                    <option value="submitted">📤 Submitted</option>
                    <option value="completed">✅ Completed</option>
                    <option value="cancelled">❌ Cancelled</option>
                  </select>
                  <input type="number" min="0" value={r.commission_amount||""} placeholder="Commission"
                    onChange={e=>onUpdate(r.id,{commission_amount:+e.target.value||null})}
                    style={{width:90,fontSize:12,padding:"4px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)"}}/>
                  <button onClick={()=>onUpdate(r.id,{commission_status:r.commission_status==="paid"?"unpaid":"paid"})}
                    style={{fontSize:11,padding:"4px 10px",borderRadius:12,border:"none",cursor:"pointer",
                      background:r.commission_status==="paid"?"var(--green)":"var(--surface2)",
                      color:r.commission_status==="paid"?"#fff":"var(--text3)",fontWeight:600}}>
                    {r.commission_status==="paid"?"✓ Paid":"Mark Paid"}
                  </button>
                  <span style={{fontSize:11,color:"var(--text3)",marginLeft:"auto"}}>{(r.submitted_at||"").slice(0,10)}</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {onUpdate&&(
                    <button onClick={()=>setEditRenewal(r)} title="Edit" style={actionBtnStyle("default")}>✏️</button>
                  )}
                  <button onClick={()=>setDocsRenewalId(r.id)} title="Documents"
                    style={actionBtnStyle((r.receipt_url||r.new_licence_url)?"done":"default")}>📎</button>
                  <QuickUploadBtn r={r} field="receipt" label="Receipt" icon="🧾" doneUrl={r.receipt_url}/>
                  <QuickUploadBtn r={r} field="new_licence" label="New Disc" icon="🪪" doneUrl={r.new_licence_url}/>
                  {waPhone&&(
                    <a href={waLink(waPhone,waMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                      <button title="WhatsApp" style={actionBtnStyle("brand")}><IcWhatsApp size={15}/></button>
                    </a>
                  )}
                  <OfficeSendControl r={r} agents={officeAgents} onUpdate={onUpdate} actionBtnStyle={actionBtnStyle}/>
                  {onDelete&&(
                    <button onClick={()=>{ if(window.confirm(`Delete renewal for ${r.vehicle_reg||"this vehicle"}?`)) onDelete(r.id); }}
                      title="Delete" style={actionBtnStyle("danger")}>🗑️</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card desk-table" style={{overflow:"auto"}}>
          <table className="tbl" style={{width:"100%",minWidth:820}}>
            <thead>
              <tr>
                <th>Company / Walk-in</th>
                <th>Vehicle</th>
                <th>Owner</th>
                <th>Expiry (new, once applied)</th>
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
                    <td style={{fontSize:12,fontWeight:600}}>{workshopInfo[r.workshop_id]?.name||(r.workshop_id?r.workshop_id:"🚶 Walk-in")}</td>
                    <td>
                      <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:12}}>{r.vehicle_reg}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>{r.vehicle_make} {r.vehicle_model}</div>
                    </td>
                    <td>
                      <div style={{fontSize:13}}>{r.owner_name||"—"}</div>
                      {r.owner_phone&&<div style={{fontSize:11,color:"var(--text3)"}}>{r.owner_phone}</div>}
                    </td>
                    <td>
                      {r.new_licence_expiry ? (
                        <>
                          <div style={{fontSize:10,color:"var(--text3)",textDecoration:"line-through"}}>{r.current_expiry||"—"}</div>
                          <div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>🆕 {r.new_licence_expiry}</div>
                        </>
                      ) : (
                        <span style={{fontSize:12,fontWeight:600,color:isExpired?"var(--red)":"var(--green)"}}>
                          {r.current_expiry||"—"} {isExpired?"⚠️":""}
                        </span>
                      )}
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
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {onUpdate&&(
                          <button onClick={()=>setEditRenewal(r)} title="Edit" style={actionBtnStyle("default")}>✏️</button>
                        )}
                        <button onClick={()=>setDocsRenewalId(r.id)} title="Documents"
                          style={actionBtnStyle((r.receipt_url||r.new_licence_url)?"done":"default")}>📎</button>
                        <QuickUploadBtn r={r} field="receipt" label="Receipt" icon="🧾" doneUrl={r.receipt_url}/>
                        <QuickUploadBtn r={r} field="new_licence" label="New Disc" icon="🪪" doneUrl={r.new_licence_url}/>
                        {(()=>{
                          // Workshop-submitted → message the WORKSHOP (they're the one who has to
                          // action it); a walk-in (no workshop_id) → message the customer directly.
                          const waPhone = r.workshop_id ? (workshopInfo[r.workshop_id]?.phone||"") : (r.owner_phone||"");
                          if(!waPhone) return null;
                          const msg = r.workshop_id
                            ? `Hi, regarding the licence renewal for ${r.vehicle_reg||"the vehicle"} (${r.owner_name||"customer"}) — status: ${r.status||"pending"}.`
                            : "";
                          return (
                            <a href={waLink(waPhone,msg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                              <button title="WhatsApp" style={actionBtnStyle("brand")}><IcWhatsApp size={15}/></button>
                            </a>
                          );
                        })()}
                        <OfficeSendControl r={r} agents={officeAgents} onUpdate={onUpdate} actionBtnStyle={actionBtnStyle}/>
                        {onDelete&&(
                          <button onClick={()=>{ if(window.confirm(`Delete renewal for ${r.vehicle_reg||"this vehicle"}?`)) onDelete(r.id); }}
                            title="Delete" style={actionBtnStyle("danger")}>🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {docsRenewal&&(
        <RenewalDocsModal renewal={docsRenewal} viewer="agent"
          workshopName={workshopInfo[docsRenewal.workshop_id]?.name||(docsRenewal.workshop_id?docsRenewal.workshop_id:"🚶 Walk-in")}
          onUpdate={onUpdate} onClose={()=>setDocsRenewalId(null)}/>
      )}

      {walkInPrefill&&onSave&&(
        <WalkInRenewalModal prefill={walkInPrefill}
          onSave={async(rec)=>{ await onSave(rec); setWalkInPrefill(null); }}
          onClose={()=>setWalkInPrefill(null)}/>
      )}

      {editRenewal&&onUpdate&&(
        <WalkInRenewalModal prefill={editRenewal} onUpdate={onUpdate}
          onClose={()=>setEditRenewal(null)}/>
      )}
    </div>
  );
}

// Agent-created renewal for a customer who walked in directly (no workshop in
// between) — scan the disc, type the fields, or both (scanning just fills the
// same fields below, which stay editable either way), then attach the disc
// photo/ID as the document. Saved with workshop_id left null; the rest of this
// page already treats a null workshop_id as "🚶 Walk-in".
//
// Also doubles as the "✏️ Edit" form for any existing row (walk-in or
// workshop-submitted) — passing a `prefill` with an id plus `onUpdate` (no
// `onSave`) switches it into edit mode: same fields, but it patches the
// existing row instead of inserting a new one, and leaves workshop_id alone.
function WalkInRenewalModal({prefill={}, onSave, onUpdate, onClose}) {
  const isEdit = !!(prefill?.id && onUpdate);
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

  const processScan = async (dataUrl, file) => {
    setScanLoading(true); setScanError("");
    try{
      const raw = await decodePDF417fromImage(dataUrl);
      const parsed = parseLicenceDisc(raw);
      const reg = parsed.reg ? parsed.reg.replace(/\s/g,"").toUpperCase() : f.vehicle_reg;
      setF(p=>({...p,
        vehicle_reg: parsed.reg ? parsed.reg.replace(/\s/g,"").toUpperCase() : p.vehicle_reg,
        vehicle_make: parsed.make||p.vehicle_make, vehicle_model: parsed.model||p.vehicle_model,
        vin: parsed.vin||p.vin, engine_no: parsed.engine_no||p.engine_no,
        current_expiry: parsed.expiry_date||p.current_expiry,
      }));
      // The scanned photo itself IS the licence disc / vehicle doc — save it
      // straight into that checklist slot so the customer/agent doesn't have
      // to upload the same photo a second time by hand.
      try{
        const url = await uploadAttachment(file, `licence_renewals/${(reg||"walkin").replace(/[\s/\\]/g,"_")}`);
        setF(p=>({...p, documents:{...p.documents, licence_disc:{url, expiry:parsed.expiry_date||""}}}));
      }catch{ /* form fields already filled; saving the photo itself is best-effort */ }
    }catch(err){ setScanError("Barcode not detected — try a clearer photo, or just type the details below. ("+err.message+")"); }
    setScanLoading(false);
  };

  const handleScanFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    e.target.value="";
    const fr = new FileReader();
    fr.onload = ev => processScan(ev.target.result, file);
    fr.readAsDataURL(file);
  };

  const save = async () => {
    if(!f.vehicle_reg.trim()){ alert("Vehicle registration required"); return; }
    setSaving(true);
    try{
      if(isEdit){
        const {id,workshop_id,...patch}=f;
        await onUpdate(id,{...patch, renewal_years:+f.renewal_years||1});
      } else {
        await onSave({...f, id: f.id||makeId("WSLR"), renewal_years:+f.renewal_years||1,
          status: f.status||"pending", commission_status: f.commission_status||"unpaid",
          submitted_at: f.submitted_at||new Date().toISOString()});
      }
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"✏️ Edit Renewal":"🚶 Walk-in Renewal"} onClose={onClose}/>

      {(() => {
        // Documents carried forward from a previous renewal (via "🔄 Start
        // Renewal" on the due-soon list) may themselves have expired since
        // then — call it out up front rather than relying on the small
        // per-row ⚠️ badge further down the form to be noticed.
        const expiredDocs = Object.entries(f.documents||{})
          .filter(([,d])=>{ const exp = typeof d==="string"?"":(d?.expiry||""); return exp && new Date(exp)<new Date(); })
          .map(([k])=>LICENCE_DOC_TYPES.find(t=>t.key===k)?.label||k);
        if(!expiredDocs.length) return null;
        return (
          <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"9px 13px",marginBottom:14,fontSize:12,color:"var(--red)"}}>
            ⚠️ On file but expired: <strong>{expiredDocs.join(", ")}</strong> — ask for an updated copy before continuing.
          </div>
        );
      })()}

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

import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { getSettings, C } from "../lib/settings.js";
import { toImgUrl, fmtAmt, fmtDT, waLink } from "../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD, StatusBadge, ImgLightbox } from "./shared.jsx";
import { PartPhotoUploader, VehicleFitmentTab } from "./RfqVehicles.jsx";
import { PrintPartLabelModal, ExtraPhotosStrip, resolveMarginOptions } from "./Modals.jsx";
import { getCategories } from "../lib/constants.js";

// Markup brackets a supplier can one-tap into a suggested retail price — cost
// plus a straight % on top (cost * (1 + pct/100)), same "round to nearest 10"
// behaviour as the admin Inventory PartModal's Stock tab. resolveMarginOptions
// (shared with Modals.jsx) picks: the supplier's own numbers, else this part's
// category default, else the shop-wide default, else the hardcoded fallback.
const suggestPriceAt=(cost,markupPct)=>Math.round((+cost*(1+markupPct/100))/10)*10;

// photos/fitments are stored as JSON-stringified arrays (same convention as
// parts.photos in the main Inventory PartModal) — parse defensively since the
// column may be null, "", or already-invalid JSON from manual DB edits.
const parseJsonArray=(v)=>{ if(Array.isArray(v)) return v; try{ const a=JSON.parse(v||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } };

// Multi-keyword search — every space-separated word must appear somewhere in the
// part's searchable text (in any order/field), so "bmw x1 head lamp" matches a part
// whose make/model/name between them contain all four words, not one whole phrase.
const searchBlob=(p,code)=>[code,p.name,p.make,p.model,p.year_range,p.category,p.oe_number,p.chinese_desc].filter(Boolean).join(" ").toLowerCase();
const matchesSearch=(blob,keywords)=>keywords.every(k=>blob.includes(k));

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PORTAL — self-service parts catalogue for a supplier login
// (role:"supplier", scoped to one suppliers.id via user.supplier_id).
// Parts they add live in the dedicated supplier_parts table, walled off
// from the main inventory, until an admin sets a customer-facing price.
// ═══════════════════════════════════════════════════════════════

export function SupplierPartsPage({parts=[], existingParts=[], supplierCode, supplierName="", onSave, onDelete, onRefresh, onUpdateCostPrice, vehicles=[], partFitments=[], onAddFitment, onAddSelfFitment, onDeleteFitment, marginOptions=null, onUpdateMarginOptions, onBulkUpdateSuggestedPrices}) {
  const [editing, setEditing] = useState(null); // null | {} (new) | existing row
  const [editingCost, setEditingCost] = useState(null); // existing-catalogue row having its cost price updated
  const [labelPart, setLabelPart] = useState(null); // part being label-printed (same modal admin/stockman use)
  const [fitmentTarget, setFitmentTarget] = useState(null); // {part, kind:"existing"|"self"} — row having its vehicle fits edited
  const [tab, setTab] = useState(existingParts.length?"existing":"mine");
  // No category here — this is just the supplier's own base line shown in the
  // "Your Suggested Markup %" card; each modal resolves its own part's category on top of this.
  const supplierBaseMarginOptions=resolveMarginOptions({supplierOptions:marginOptions});
  const [search, setSearch] = useState("");

  // Bulk-apply a new markup % to many already-priced Existing Catalogue parts at
  // once, without opening each part's cost modal individually — recomputes
  // suggested_price from each part's own already-set cost, doesn't touch cost itself.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const toggleSelect=(id)=>setSelectedIds(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});
  const exitBulkMode=()=>{setBulkMode(false);setSelectedIds(new Set());};
  const keywords=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const existingFiltered=keywords.length?existingParts.filter(p=>matchesSearch(searchBlob(p,p.sku),keywords)):existingParts;
  const minesFiltered=keywords.length?parts.filter(p=>matchesSearch(searchBlob(p,`${supplierCode}-${p.part_code}`),keywords)):parts;

  // In-app "price changed since you last looked" badge — no outbound notification,
  // just a local baseline captured once when this page first mounts (i.e. what they
  // saw last time), then immediately reset for next time. Kept per-browser via
  // localStorage rather than a schema addition; worst case on a new device/cleared
  // storage is everything reads as "changed" once, which is harmless.
  const lsKey=`supplier_portal_last_viewed_${supplierCode}`;
  const [lastViewed]=useState(()=>{
    const prev=localStorage.getItem(lsKey);
    try{localStorage.setItem(lsKey,new Date().toISOString());}catch{}
    return prev;
  });

  return (
    <div className="fu">
      {editing&&<SupplierPartModal part={editing} supplierCode={supplierCode} supplierMarginOptions={marginOptions}
        onSave={async(data)=>{ if(await onSave(data)!==false) setEditing(null); }}
        onDelete={editing.id?async()=>{await onDelete(editing.id);setEditing(null);}:null}
        onClose={()=>setEditing(null)}/>}

      {editingCost&&<SupplierCostPriceModal part={editingCost} supplierMarginOptions={marginOptions}
        onSave={async(data)=>{await onUpdateCostPrice(editingCost,data);setEditingCost(null);}}
        onClose={()=>setEditingCost(null)}/>}

      {labelPart&&<PrintPartLabelModal part={labelPart} settings={getSettings()} onClose={()=>setLabelPart(null)}/>}

      {fitmentTarget&&(()=>{
        const isSelf=fitmentTarget.kind==="self";
        const p=fitmentTarget.part;
        const fkKey=isSelf?"supplier_part_id":"part_id";
        return (
          <VehicleFitmentTab
            part={isSelf?{...p, sku:`${supplierCode}-${p.part_code}`}:p}
            vehicles={vehicles}
            partFitments={partFitments.filter(pf=>String(pf[fkKey])===String(p.id))}
            onAdd={isSelf?onAddSelfFitment:onAddFitment} onDelete={onDeleteFitment}
            onClose={()=>setFitmentTarget(null)}
            supplierMode t={{}} imageUrl={p.image_url}/>
        );
      })()}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📦 My Parts</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
            {existingParts.length} already in inventory · {parts.length} added by you ({parts.filter(p=>!p.price).length} awaiting pricing)
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Prices/stock can change on admin's side — refresh to see the latest">↺ Refresh</button>}
          {onBulkUpdateSuggestedPrices&&(
            <button className="btn btn-ghost btn-sm" onClick={()=>{if(bulkMode)exitBulkMode();else{setBulkMode(true);setTab("existing");}}}>
              {bulkMode?"✕ Exit Bulk Update":"☑ Bulk Update Prices"}
            </button>
          )}
          <button className="btn btn-primary" onClick={()=>setEditing({})}>+ Add Part</button>
        </div>
      </div>

      {supplierName&&<ShareCatalogueCard supplierName={supplierName}/>}
      {onUpdateMarginOptions&&<MarkupOptionsCard marginOptions={marginOptions} effectiveMarginOptions={supplierBaseMarginOptions} onSave={onUpdateMarginOptions}/>}

      {bulkMode&&(()=>{
        const eligible=existingFiltered.filter(p=>p._supplierPrice);
        return (
          <div className="card" style={{padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:13,fontWeight:700}}>{selectedIds.size} selected</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedIds(new Set(eligible.map(p=>p.id)))}>Select All ({eligible.length} with cost set)</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedIds(new Set())} disabled={!selectedIds.size}>Clear</button>
            <div style={{flex:1,minWidth:8}}/>
            <span style={{fontSize:12,color:"var(--text3)"}}>Apply markup to selected:</span>
            {supplierBaseMarginOptions.map(m=>(
              <button key={m} type="button" className="btn btn-primary btn-sm" disabled={!selectedIds.size||bulkApplying}
                onClick={async()=>{
                  setBulkApplying(true);
                  const updates=existingParts.filter(p=>selectedIds.has(p.id)&&p._supplierPrice)
                    .map(p=>({linkId:p._linkId,suggestedPrice:suggestPriceAt(p._supplierPrice,m)}));
                  await onBulkUpdateSuggestedPrices(updates);
                  setBulkApplying(false);
                  exitBulkMode();
                }}>
                {bulkApplying?"Applying…":`${m}%`}
              </button>
            ))}
          </div>
        );
      })()}

      <div style={{marginBottom:14}}>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search e.g. bmw x1 head lamp — matches any word in any order"/>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["existing",`Existing Catalogue (${existingFiltered.length})`],["mine",`Added by You (${minesFiltered.length})`]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lb}</button>
        ))}
      </div>

      {tab==="existing"&&(
        existingFiltered.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {existingParts.length===0?"Nothing linked to you in the main inventory yet.":"No parts match your search."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>
              {bulkMode?"Tick parts to bulk-update, then pick a markup % above (only parts with a cost already set can be selected).":"Name, customer price & stock are managed by admin. Click a part to update your own cost price or photo."}
            </div>
            {existingFiltered.map(p=><PartRow key={p.id} p={p} code={p.sku} name={p.name} readOnly
              priceChanged={!!(lastViewed&&p.price_updated_at&&p.price_updated_at>lastViewed)}
              onClick={bulkMode?(p._supplierPrice?()=>toggleSelect(p.id):undefined):(onUpdateCostPrice?()=>setEditingCost(p):undefined)}
              onPrintLabel={bulkMode?undefined:()=>setLabelPart(p)}
              onEditFitments={bulkMode?undefined:(onAddFitment?()=>setFitmentTarget({part:p,kind:"existing"}):undefined)}
              fitCount={partFitments.filter(pf=>String(pf.part_id)===String(p.id)).length}
              bulkMode={bulkMode} selected={selectedIds.has(p.id)} selectable={!!p._supplierPrice}/>)}
          </div>
        )
      )}

      {tab==="mine"&&(
        minesFiltered.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {parts.length===0?'No parts yet — click "+ Add Part" to add your first one.':"No parts match your search."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {minesFiltered.map(p=><PartRow key={p.id} p={p} code={`${supplierCode}-${p.part_code}`} name={p.name} onClick={()=>setEditing(p)}
              onPrintLabel={()=>setLabelPart({...p, sku:`${supplierCode}-${p.part_code}`})}
              onEditFitments={onAddSelfFitment?()=>setFitmentTarget({part:p,kind:"self"}):undefined}
              fitCount={partFitments.filter(pf=>String(pf.supplier_part_id)===String(p.id)).length}/>)}
          </div>
        )
      )}
    </div>
  );
}

// A ?catalog=<supplier name> link jumps straight to the customer sign-up tab, and
// any account registered through it is auto-scoped to just this supplier's parts
// (see LoginPage.jsx's catalogName/catalogSupplierId handling) — that whole flow
// already exists, this just gives the supplier an easy way to grab their own link
// instead of hand-building the URL.
function ShareCatalogueCard({supplierName}) {
  const [copied,setCopied]=useState(false);
  const link=`${window.location.origin}${window.location.pathname}?catalog=${encodeURIComponent(supplierName)}`;
  const waMsg=`Hi! Browse our parts catalogue and create your account here:\n${link}`;
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:220}}>
        <div style={{fontSize:13,fontWeight:700}}>📤 Share Your Catalogue</div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Anyone who signs up through this link only sees your parts</div>
        <div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--blue)",marginTop:4,wordBreak:"break-all"}}>{link}</div>
      </div>
      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={()=>{navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>
          {copied?"✅ Copied":"📋 Copy Link"}
        </button>
        <a href={waLink("",waMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
          <button type="button" className="btn btn-ghost btn-sm" style={{background:"#25D366",color:"#fff",border:"none"}}>📲 WhatsApp</button>
        </a>
      </div>
    </div>
  );
}

// Lets a supplier customize their own 3 quick-margin buttons (suppliers.margin_options)
// instead of always using the shop-wide default. marginOptions is the raw stored
// value (null if not customized); effectiveMarginOptions is what's actually in use
// right now (own → shop default → hardcoded), shown as the starting point to edit.
function MarkupOptionsCard({marginOptions, effectiveMarginOptions, onSave}) {
  const [editing,setEditing]=useState(false);
  const [vals,setVals]=useState(effectiveMarginOptions);
  const [saving,setSaving]=useState(false);
  const isCustom=!!(marginOptions&&marginOptions.length);
  const startEdit=()=>{setVals(effectiveMarginOptions);setEditing(true);};
  const save=async()=>{setSaving(true);await onSave(vals.map(v=>+v||0));setSaving(false);setEditing(false);};
  const reset=async()=>{setSaving(true);await onSave(null);setSaving(false);setEditing(false);};
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:220}}>
          <div style={{fontSize:13,fontWeight:700}}>💰 Your Suggested Markup %</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
            {isCustom?"Using your own percentages":"Using the shop's default percentages"} — shown as quick-price buttons next to Cost Price
          </div>
        </div>
        {!editing&&<button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>}
      </div>
      {editing&&(
        <div style={{marginTop:10}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[0,1,2].map(i=>(
              <input key={i} className="inp" type="number" min="0" max="99" style={{width:90}}
                value={vals[i]} onChange={e=>setVals(v=>v.map((x,idx)=>idx===i?+e.target.value||0:x))}/>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
            {isCustom&&<button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={saving}>Reset to shop default</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// Discount % offered automatically to any customer who registered through this
// supplier's own ?catalog= link (see the Share Your Catalogue card above) — applied
// live in the Shop/Cart/Checkout for those customers, never touching customers
// scoped elsewhere or browsing the main multi-supplier shop.
// Both numbers here are scoped to just this one supplier's own catalogue/customers
// — maxDiscountPct is the supplier's own self-set ceiling (suppliers.max_discount_pct),
// never affecting any other supplier's customers. shopWideCap (if admin has set one
// in Settings) is an outer bound shown for reference — the supplier's own max can
// only tighten it further, never exceed it.
function CustomerDiscountCard({discountPct, maxDiscountPct=0, shopWideCap=0, onSave, onSaveMax}) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(discountPct||0);
  const [maxVal,setMaxVal]=useState(maxDiscountPct||0);
  const [saving,setSaving]=useState(false);
  // Effective ceiling for the Default Amount field itself: your own max, further
  // bounded by the shop-wide cap if admin has one set.
  const effectiveCap=(()=>{
    if(maxDiscountPct>0&&shopWideCap>0) return Math.min(maxDiscountPct,shopWideCap);
    return maxDiscountPct>0?maxDiscountPct:shopWideCap;
  })();
  const hasCap=effectiveCap>0;
  const startEdit=()=>{setVal(discountPct||0);setMaxVal(maxDiscountPct||0);setEditing(true);};
  const save=async()=>{
    setSaving(true);
    const clampedMax=Math.max(0,Math.min(shopWideCap>0?shopWideCap:100,+maxVal||0));
    if(onSaveMax) await onSaveMax(clampedMax);
    const newCap=(clampedMax>0&&shopWideCap>0)?Math.min(clampedMax,shopWideCap):(clampedMax>0?clampedMax:shopWideCap);
    await onSave(Math.max(0,Math.min(newCap>0?newCap:100,+val||0)));
    setSaving(false);setEditing(false);
  };
  const remove=async()=>{setSaving(true);await onSave(0);setSaving(false);setEditing(false);};
  const step=(delta)=>setVal(v=>Math.max(0,Math.min(hasCap?effectiveCap:100,(+v||0)+delta)));
  const stepMax=(delta)=>setMaxVal(v=>Math.max(0,Math.min(shopWideCap>0?shopWideCap:100,(+v||0)+delta)));
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{fontSize:13,fontWeight:700,flex:1,minWidth:160}}>🎁 Customer Discount</div>
        {!editing&&<button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:10}}>
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Default Amount</div>
          {editing?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>step(-1)} disabled={saving}>−</button>
              <input className="inp" type="number" min="0" max={hasCap?effectiveCap:100} step="1" style={{width:70,textAlign:"center"}}
                value={val} onChange={e=>setVal(e.target.value)} autoFocus/>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>step(1)} disabled={saving}>+</button>
              <span style={{fontSize:13,color:"var(--text3)"}}>%</span>
            </div>
          ):(
            <div style={{fontSize:20,fontWeight:800,color:discountPct>0?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif"}}>{discountPct||0}%</div>
          )}
        </div>
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Maximum Discount Limit</div>
          {editing?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>stepMax(-1)} disabled={saving}>−</button>
              <input className="inp" type="number" min="0" max={shopWideCap>0?shopWideCap:100} step="1" style={{width:70,textAlign:"center"}}
                value={maxVal} onChange={e=>setMaxVal(e.target.value)}/>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>stepMax(1)} disabled={saving}>+</button>
              <span style={{fontSize:13,color:"var(--text3)"}}>%</span>
            </div>
          ):(
            <div style={{fontSize:20,fontWeight:800,color:"var(--text2)",fontFamily:"Rajdhani,sans-serif"}}>{maxDiscountPct>0?`${maxDiscountPct}%`:"No limit"}</div>
          )}
          <div style={{fontSize:10,color:"var(--text3)",marginTop:1}}>
            Only affects your own catalogue{shopWideCap>0?` · shop ceiling ${shopWideCap}%`:""}
          </div>
        </div>
      </div>
      <div style={{fontSize:11,color:"var(--text3)",marginTop:8}}>
        {discountPct>0?"Applied automatically for customers who sign up through your catalogue link":"No discount set — customers pay full price"}
      </div>
      {editing&&(
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
          {discountPct>0&&<button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={saving}>Remove discount</button>}
        </div>
      )}
    </div>
  );
}

function PartRow({p, code, name, readOnly, priceChanged, onClick, onPrintLabel, onEditFitments, fitCount=0, bulkMode=false, selected=false, selectable=true}) {
  return (
    <div className={onClick?"card card-hover":"card"} style={{padding:14,display:"flex",gap:12,alignItems:"center",
      cursor:onClick?"pointer":"default",opacity:bulkMode&&!selectable?.5:1,
      border:selected?"1.5px solid var(--accent)":(priceChanged?"1px solid rgba(96,165,250,.5)":undefined),
      background:selected?"rgba(249,115,22,.06)":(priceChanged?"rgba(96,165,250,.05)":undefined)}}
      onClick={onClick}>
      {bulkMode&&(
        <input type="checkbox" checked={selected} disabled={!selectable} readOnly style={{width:18,height:18,flexShrink:0,cursor:selectable?"pointer":"not-allowed"}}/>
      )}
      <div style={{width:52,height:52,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {p.image_url
          ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
          : <span style={{fontSize:20,opacity:.3}}>🖼</span>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{code}{readOnly&&<span title="Managed by admin" style={{marginLeft:6,fontSize:11,opacity:.6}}>🔒</span>}</div>
        <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
        {(p.make||p.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}{fitCount>0&&<span> · +{fitCount} more fit{fitCount!==1?"s":""}</span>}</div>}
        {readOnly&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Your cost: <strong style={{color:"var(--text2)"}}>{p._supplierPrice?fmtAmt(p._supplierPrice):"not set"}</strong>{p._suggestedPrice?<span style={{marginLeft:8}}>· Suggested retail: <strong style={{color:"var(--text2)"}}>{fmtAmt(p._suggestedPrice)}</strong></span>:null}</div>}
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        {priceChanged&&<div style={{fontSize:10,fontWeight:700,color:"var(--blue)",marginBottom:2}}>🔔 PRICE UPDATED</div>}
        {p.price
          ? <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</div>
          : <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",fontSize:11}}>⏳ Awaiting pricing</span>}
        <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Stock: {p.stock??0}</div>
        <div style={{display:"flex",gap:5,justifyContent:"flex-end",marginTop:6}}>
          {onEditFitments&&(
            <button type="button" title="Vehicle fits" className="btn btn-ghost btn-xs" style={{fontSize:11}}
              onClick={e=>{e.stopPropagation();onEditFitments();}}>🚗 Fits{fitCount>0?` (${fitCount})`:""}</button>
          )}
          {onPrintLabel&&(
            <button type="button" title="Print part label" className="btn btn-ghost btn-xs" style={{fontSize:11}}
              onClick={e=>{e.stopPropagation();onPrintLabel();}}>🏷️ Label</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplierCostPriceModal({part, supplierMarginOptions=null, onSave, onClose}) {
  const marginOptions=resolveMarginOptions({supplierOptions:supplierMarginOptions,category:part.category});
  const [price, setPrice] = useState(part._supplierPrice ?? "");
  const [suggestedPrice, setSuggestedPrice] = useState(part._suggestedPrice ?? null);
  const [imageUrl, setImageUrl] = useState(part.image_url ?? "");
  const [photos, setPhotos] = useState(()=>parseJsonArray(part.photos));
  const [lightbox, setLightbox] = useState(null); // {idx} — urls built from imageUrl + photos
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(()=>{
    if(!part?.id) return;
    let cancelled=false;
    api.fresh("part_price_history",`part_id=eq.${part.id}&select=*&order=created_at.desc&limit=20`).then(r=>{
      if(!cancelled&&Array.isArray(r)) setHistory(r);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[part?.id]);
  return (
    <Overlay onClose={onClose}>
      <MHead title="Update Your Cost Price" sub={`${part.sku} — ${part.name}`} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Your cost price is just your own reference — it doesn't change what customers see. The suggested retail price
        below is a hint for admin to consider when they set the live selling price.
      </div>
      <FD>
        <FL label="Your Cost Price"/>
        <input className="inp" type="number" min="0" step="0.01" autoFocus value={price} onChange={e=>{setPrice(e.target.value);setSuggestedPrice(null);}} placeholder="0"/>
        {+price>0&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
            {marginOptions.map(m=>{
              const suggested=suggestPriceAt(price,m);
              const active=suggestedPrice===suggested;
              return (
                <button key={m} type="button" onClick={()=>setSuggestedPrice(suggested)}
                  style={{fontSize:11,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontWeight:600,
                    background:active?"var(--accent)":"var(--surface2)",
                    color:active?"#fff":"var(--text2)",
                    border:`1px solid ${active?"var(--accent)":"var(--border)"}`}}>
                  {m}%: {C()}{suggested.toLocaleString()}
                </button>
              );
            })}
          </div>
        )}
        {suggestedPrice!=null&&(
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text2)"}}>Suggested retail price for admin to review</span>
            <span style={{fontSize:22,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{C()}{suggestedPrice.toLocaleString()}</span>
          </div>
        )}
      </FD>

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={imageUrl} onChange={setImageUrl} sku={part.sku} t={{}} bucket="cars_parts"/>
        <ExtraPhotosStrip photos={photos} onChange={setPhotos} sku={part.sku}
          autosave={newPhotos=>api.patch("parts","id",part.id,{photos:newPhotos})}
          onOpenLightbox={i=>setLightbox({idx:imageUrl?i+1:i})}
          onMakeCover={extraIdx=>{
            const newCover=photos[extraIdx];
            if(!newCover) return;
            setPhotos([...(imageUrl?[imageUrl]:[]), ...photos.filter((_,i)=>i!==extraIdx)]);
            setImageUrl(newCover);
          }}/>
        {lightbox&&(
          <ImgLightbox urls={[imageUrl,...photos].filter(Boolean)} startIdx={lightbox.idx} onClose={()=>setLightbox(null)}/>
        )}
      </FD>

      <div style={{marginBottom:14}}>
        <button type="button" onClick={()=>setHistoryOpen(v=>!v)}
          style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:12,color:"var(--text3)",display:"flex",alignItems:"center",gap:5}}>
          📜 Price History {history.length>0?`(${history.length})`:""} {historyOpen?"▲":"▼"}
        </button>
        {historyOpen&&(
          history.length===0
            ? <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>No price changes recorded yet.</div>
            : (
              <div style={{marginTop:8,border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                {history.map(h=>(
                  <div key={h.id} style={{padding:"8px 12px",borderBottom:"1px solid var(--border)",fontSize:12,display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                    <div>
                      {h.old_price!=null&&h.new_price!=null&&+h.old_price!==+h.new_price&&(
                        <div>Selling: {fmtAmt(h.old_price)} → <strong>{fmtAmt(h.new_price)}</strong></div>
                      )}
                      {h.old_cost_price!=null&&h.new_cost_price!=null&&+h.old_cost_price!==+h.new_cost_price&&(
                        <div style={{color:"var(--text2)"}}>Cost: {fmtAmt(h.old_cost_price)} → <strong>{fmtAmt(h.new_cost_price)}</strong></div>
                      )}
                      <div style={{color:"var(--text3)",fontSize:11,marginTop:2}}>
                        {h.source==="supplier_cost_update"?"🏭 Your update":"✏️ Admin update"}
                      </div>
                    </div>
                    <div style={{color:"var(--text3)",fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(h.created_at)}</div>
                  </div>
                ))}
              </div>
            )
        )}
      </div>

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving||price===""}
          onClick={async()=>{setSaving(true);await onSave({price:+price,suggestedPrice,imageUrl,photos});setSaving(false);}}>
          {saving?"Saving…":"Save"}
        </button>
      </div>
    </Overlay>
  );
}

function SupplierPartModal({part, supplierCode, supplierMarginOptions=null, onSave, onDelete, onClose}) {
  const isEdit=!!part?.id;
  const [f,setF]=useState(isEdit?{
    id:part.id, part_code:part.part_code||"", name:part.name||"", chinese_desc:part.chinese_desc||"",
    category:part.category||"", cost_price:part.cost_price??"", stock:part.stock??0,
    image_url:part.image_url||"", make:part.make||"", model:part.model||"",
    year_range:part.year_range||"", oe_number:part.oe_number||"", suggested_price:part.suggested_price??"",
    photos:parseJsonArray(part.photos),
  }:{part_code:"",name:"",chinese_desc:"",category:"",cost_price:"",stock:0,image_url:"",make:"",model:"",year_range:"",oe_number:"",suggested_price:"",photos:[]});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const canSave=f.part_code.trim()&&f.name.trim();
  const [lightbox,setLightbox]=useState(null); // {idx} — urls built from f.image_url + f.photos
  const [saving,setSaving]=useState(false);
  const marginOptions=resolveMarginOptions({supplierOptions:supplierMarginOptions,category:f.category});

  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"Edit Part":"Add Part"} onClose={onClose}/>

      <FD>
        <FL label={`Part Code * — will show as ${supplierCode}-${f.part_code.trim()||"…"}`}/>
        <input className="inp" style={{fontFamily:"DM Mono,monospace"}} value={f.part_code}
          onChange={e=>s("part_code",e.target.value.toUpperCase().replace(/\s+/g,""))} placeholder="e.g. A1679066909R"/>
      </FD>
      <FD><FL label="Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. Head Lamp LED Right Side"/></FD>
      <FD><FL label="Chinese Description"/><input className="inp" value={f.chinese_desc} onChange={e=>s("chinese_desc",e.target.value)}/></FD>

      <FG cols="1fr 1fr 1fr">
        <div><FL label="Make"/><input className="inp" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="BMW"/></div>
        <div><FL label="Model"/><input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="X3"/></div>
        <div><FL label="Year"/><input className="inp" value={f.year_range} onChange={e=>s("year_range",e.target.value)} placeholder="2021-2024"/></div>
      </FG>

      {isEdit&&(
        <div style={{fontSize:11,color:"var(--text3)",marginTop:-8,marginBottom:14}}>
          More fitment vehicles can be linked from the part's "🚗 Fits" button once saved.
        </div>
      )}

      <FG>
        <div>
          <FL label="OE Number"/>
          <input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)}/>
          {f.oe_number&&(
            <select className="inp" style={{fontSize:11,color:"#1d4ed8",marginTop:6}}
              value="" onChange={e=>{if(e.target.value)window.open(`https://www.lllparts.co.uk/search/${encodeURIComponent(e.target.value)}`,"_blank","noopener,noreferrer");}}>
              <option value="">🔍 Search on lllparts…</option>
              {f.oe_number.split(/[\s,;]+/).filter(Boolean).map((tok,i)=>(
                <option key={i} value={tok}>{tok}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <FL label="Category"/>
          <select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>
            <option value="">— Select —</option>
            {getCategories().map(c=><option key={c} value={c}>{c}</option>)}
            {f.category&&!getCategories().includes(f.category)&&<option value={f.category}>{f.category}</option>}
          </select>
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Your Cost Price"/>
          <input className="inp" type="number" value={f.cost_price} onChange={e=>s("cost_price",e.target.value)} placeholder="0"/>
          {+f.cost_price>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
              {marginOptions.map(m=>{
                const suggested=suggestPriceAt(f.cost_price,m);
                const active=+f.suggested_price===suggested;
                return (
                  <button key={m} type="button" onClick={()=>s("suggested_price",suggested)}
                    style={{fontSize:11,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontWeight:600,
                      background:active?"var(--accent)":"var(--surface2)",
                      color:active?"#fff":"var(--text2)",
                      border:`1px solid ${active?"var(--accent)":"var(--border)"}`}}>
                    {m}%: {C()}{suggested.toLocaleString()}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div><FL label="Stock"/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",+e.target.value||0)}/></div>
      </FG>
      {+f.suggested_price>0&&(
        <div style={{marginTop:-4,marginBottom:14,padding:"10px 14px",borderRadius:10,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:600,color:"var(--text2)"}}>Suggested retail price for admin to review</span>
          <span style={{fontSize:22,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{C()}{(+f.suggested_price).toLocaleString()}</span>
        </div>
      )}

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={f.image_url} onChange={url=>s("image_url",url)} sku={`${supplierCode}-${f.part_code||"part"}`} t={{}} bucket="cars_parts"/>
        <ExtraPhotosStrip photos={f.photos} onChange={photos=>s("photos",photos)} sku={`${supplierCode}-${f.part_code||"part"}`}
          autosave={isEdit?(newPhotos=>api.patch("supplier_parts","id",f.id,{photos:newPhotos})):undefined}
          onOpenLightbox={i=>setLightbox({idx:f.image_url?i+1:i})}
          onMakeCover={extraIdx=>{
            const newCover=f.photos[extraIdx];
            if(!newCover) return;
            setF(p=>({...p, image_url:newCover, photos:[...(p.image_url?[p.image_url]:[]), ...p.photos.filter((_,i)=>i!==extraIdx)]}));
          }}/>
        {lightbox&&(
          <ImgLightbox urls={[f.image_url,...f.photos].filter(Boolean)} startIdx={lightbox.idx} onClose={()=>setLightbox(null)}/>
        )}
      </FD>

      {isEdit&&(
        <div style={{marginBottom:14,padding:"10px 14px",borderRadius:8,fontSize:12,
          background:part.price?"rgba(52,211,153,.08)":"rgba(251,191,36,.08)",
          border:`1px solid ${part.price?"rgba(52,211,153,.3)":"rgba(251,191,36,.3)"}`,
          color:part.price?"var(--green)":"var(--yellow)"}}>
          {part.price
            ? `✅ Live — customers see this at ${fmtAmt(part.price)}`
            : "⏳ Awaiting pricing — not visible to customers until priced"}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        {onDelete&&<button className="btn btn-ghost" style={{color:"var(--red)",borderColor:"rgba(239,68,68,.3)"}}
          onClick={()=>{if(window.confirm(`Delete ${supplierCode}-${f.part_code}?`)) onDelete();}}>🗑</button>}
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={!canSave||saving} onClick={async()=>{setSaving(true);try{await onSave(f);}finally{setSaving(false);}}}>{saving?"Saving…":"Save"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: SUPPLIER PRICING — set the customer-facing price/markup on parts
// suppliers have self-added (across every supplier). A part stays invisible
// to customers until it has a price here.
// ═══════════════════════════════════════════════════════════════
export function SupplierPricingPage({allParts=[], suppliers=[], onSetPrice, costUpdates=[], onDismissCostUpdate, onGoToPart, onBulkApproveCostUpdates, onRefresh}) {
  const [filter, setFilter] = useState(costUpdates.length?"costUpdates":"pending"); // "pending" | "all" | "costUpdates"
  const supName=(id)=>suppliers.find(s=>String(s.id)===String(id))?.name||`#${id}`;
  const supCode=(id)=>{const s=suppliers.find(s=>String(s.id)===String(id));return s?.code||s?.name||"";};
  const rows=filter==="pending"?allParts.filter(p=>!p.price):allParts;
  const [drafts, setDrafts] = useState({}); // {id: draftPriceString}
  const [selectedCostUpdates, setSelectedCostUpdates] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const toggleCostUpdateSelect=(id)=>setSelectedCostUpdates(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});
  // Which supplier's cost updates to work through — "__all__" or one supplier at a
  // time, so admin can bulk-approve just one supplier's batch, or go row by row.
  const [costUpdateSupplier, setCostUpdateSupplier] = useState("__all__");
  const costUpdateSupplierOptions=[...new Set(costUpdates.map(l=>String(l.supplier_id)))]
    .map(id=>({id,name:supName(id),count:costUpdates.filter(l=>String(l.supplier_id)===id).length}))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const visibleCostUpdates=costUpdateSupplier==="__all__"?costUpdates:costUpdates.filter(l=>String(l.supplier_id)===costUpdateSupplier);

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💰 Supplier Pricing</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{allParts.filter(p=>!p.price).length} awaiting pricing · {costUpdates.length} cost update{costUpdates.length!==1?"s":""} to review</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["costUpdates",`Cost Updates (${costUpdates.length})`],["pending","Awaiting Pricing"],["all","All Self-Added"]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${filter===id?"on":""}`} onClick={()=>setFilter(id)}>{lb}</button>
        ))}
      </div>

      {filter==="costUpdates"&&(
        costUpdates.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No cost price updates waiting on review 🎉</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>Suppliers updated their cost on these parts — check if the selling price still makes sense.</div>
            {costUpdateSupplierOptions.length>1&&(
              <div style={{marginBottom:2}}>
                <select className="inp" style={{width:"auto",minWidth:220}} value={costUpdateSupplier}
                  onChange={e=>{setCostUpdateSupplier(e.target.value);setSelectedCostUpdates(new Set());}}>
                  <option value="__all__">All Suppliers ({costUpdates.length})</option>
                  {costUpdateSupplierOptions.map(s=>(
                    <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
                  ))}
                </select>
              </div>
            )}
            {onBulkApproveCostUpdates&&(
              <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:2}}>
                <div style={{fontSize:13,fontWeight:700}}>{selectedCostUpdates.size} selected</div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedCostUpdates(new Set(visibleCostUpdates.map(l=>l.id)))}>Select All ({visibleCostUpdates.length})</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedCostUpdates(new Set())} disabled={!selectedCostUpdates.size}>Clear</button>
                <div style={{flex:1,minWidth:8}}/>
                <button type="button" className="btn btn-primary btn-sm" disabled={!selectedCostUpdates.size||approving}
                  onClick={async()=>{
                    setApproving(true);
                    const links=costUpdates.filter(l=>selectedCostUpdates.has(l.id));
                    await onBulkApproveCostUpdates(links);
                    setApproving(false);
                    setSelectedCostUpdates(new Set());
                  }}>
                  {approving?"Approving…":`✅ Approve ${selectedCostUpdates.size||""} Selected`}
                </button>
              </div>
            )}
            {visibleCostUpdates.length===0&&(
              <div className="card" style={{padding:32,textAlign:"center",color:"var(--text3)"}}>No cost updates from this supplier.</div>
            )}
            {visibleCostUpdates.map(l=>(
              <div key={l.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center"}}>
                {onBulkApproveCostUpdates&&(
                  <input type="checkbox" checked={selectedCostUpdates.has(l.id)} onChange={()=>toggleCostUpdateSelect(l.id)} style={{width:18,height:18,flexShrink:0,cursor:"pointer"}}/>
                )}
                <div style={{width:48,height:48,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {l._part?.image_url
                    ? <img src={toImgUrl(l._part.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{l._part?.sku||`#${l.part_id}`}</div>
                  <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l._part?.name||"—"}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{supName(l.supplier_id)}</div>
                </div>
                <div style={{fontSize:12,color:"var(--text3)",textAlign:"right",flexShrink:0}}>
                  Selling price<br/><strong style={{color:"var(--text2)"}}>{l._part?.price?fmtAmt(l._part.price):"—"}</strong>
                </div>
                <div style={{fontSize:12,color:"var(--blue)",textAlign:"right",flexShrink:0}}>
                  New supplier cost<br/><strong>{l.supplier_price?fmtAmt(l.supplier_price):"—"}</strong>
                </div>
                {l.suggested_price&&(
                  <div style={{fontSize:12,color:"var(--green)",textAlign:"right",flexShrink:0}}>
                    Supplier suggests<br/><strong>{fmtAmt(l.suggested_price)}</strong>
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                  {onGoToPart&&<button className="btn btn-primary btn-sm" onClick={()=>onGoToPart(l)}>✏️ Update Price</button>}
                  <button className="btn btn-ghost btn-sm" onClick={()=>onDismissCostUpdate(l.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {(filter==="pending"||filter==="all")&&(
        rows.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {filter==="pending"?"Nothing waiting on a price 🎉":"No supplier-added parts yet."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rows.map(p=>(
              <div key={p.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:48,height:48,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {p.image_url
                    ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{supCode(p.supplier_id)}-{p.part_code}</div>
                  <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{supName(p.supplier_id)}{(p.make||p.model)?` · ${[p.make,p.model,p.year_range].filter(Boolean).join(" ")}`:""}</div>
                </div>
                <div style={{fontSize:12,color:"var(--text3)",textAlign:"right",flexShrink:0}}>
                  Cost<br/><strong style={{color:"var(--text2)"}}>{p.cost_price?fmtAmt(p.cost_price):"—"}</strong>
                  {p.suggested_price&&<div style={{color:"var(--green)",marginTop:2}}>Suggests: <strong>{fmtAmt(p.suggested_price)}</strong></div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <input className="inp" type="number" style={{width:100}} placeholder="Set price"
                    value={drafts[p.id]??p.price??p.suggested_price??""}
                    onChange={e=>setDrafts(d=>({...d,[p.id]:e.target.value}))}/>
                  <button className="btn btn-primary btn-sm"
                    disabled={!String(drafts[p.id]??p.price??p.suggested_price??"").trim()}
                    onClick={()=>onSetPrice(p.id,+(drafts[p.id]??p.price??p.suggested_price)||0)}>
                    {p.price?"Update":"Set Live"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER: MY QUERIES — customer questions against either this supplier's own
// self-added parts (matched via supplier_part_id, looked up in selfParts) or
// existing-catalogue parts they're linked to (matched via part_id, looked up
// in existingParts) — resolved live from already-loaded state rather than a
// submission-time snapshot, so image/OE/make/model/year always reflect the
// current part and work for queries submitted before this lookup existed.
// ═══════════════════════════════════════════════════════════════
export function SupplierQueriesPage({queries=[], existingParts=[], selfParts=[], onReply, onRefresh}) {
  const [replying, setReplying] = useState(null); // query row being replied to
  const resolvePart=(q)=>{
    if(q.part_id) return existingParts.find(p=>String(p.id)===String(q.part_id))||null;
    if(q.supplier_part_id) return selfParts.find(p=>String(p.id)===String(q.supplier_part_id))||null;
    return null;
  };

  return (
    <div className="fu">
      {replying&&<SupplierQueryReplyModal query={replying} part={resolvePart(replying)}
        onReply={async(id,data)=>{await onReply(id,data);setReplying(null);}}
        onClose={()=>setReplying(null)}/>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💬 My Queries</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{queries.filter(q=>q.status==="pending").length} pending · {queries.length} total</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      {queries.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No queries yet.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {queries.map(q=>{
            const p=resolvePart(q);
            const img=p?.image_url||q.part_image;
            return (
            <div key={q.id} className="card card-hover" style={{padding:14,cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}} onClick={()=>setReplying(q)}>
              <div style={{width:44,height:44,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {img
                  ? <img src={toImgUrl(img)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                  : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{q.part_name}</div>
                  {q.part_sku&&<div style={{fontSize:12,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</div>}
                  {(p?.make||p?.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}</div>}
                  <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>👤 {q.customer_name} · 📞 {q.customer_phone} · Qty: {q.qty_requested}</div>
                  {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginTop:4}}>"{q.notes}"</div>}
                </div>
                <StatusBadge status={q.status}/>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER: MY CUSTOMERS — customers who registered through this supplier's own
// ?catalog= link. Lets the supplier pick who among them gets a discount and how
// much, per customer, on top of the blanket default set in the Customer Discount
// card back on My Parts. Only customers actually scoped to this supplier show up
// here — never another supplier's or the main shop's customers.
// ═══════════════════════════════════════════════════════════════
// maxDiscountPct here is this supplier's OWN self-set ceiling — never shared with
// or affected by any other supplier. shopWideCap is admin's optional shop-wide
// outer bound (0 = none); the effective cap for per-customer overrides is
// whichever of the two is set and more restrictive.
export function SupplierCustomersPage({customers=[], defaultDiscountPct=0, maxDiscountPct=0, shopWideCap=0, onUpdateDiscount, onUpdateDefaultDiscount, onUpdateMaxDiscount, onRefresh}) {
  const [editingId, setEditingId] = useState(null);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const effectiveCap=(()=>{
    if(maxDiscountPct>0&&shopWideCap>0) return Math.min(maxDiscountPct,shopWideCap);
    return maxDiscountPct>0?maxDiscountPct:shopWideCap;
  })();
  const hasCap=effectiveCap>0;
  const startEdit=(c)=>{setVal(c.discount_pct!=null?String(c.discount_pct):"");setEditingId(c.id);};
  const save=async(id)=>{
    setSaving(true);
    const pct=val.trim()===""?null:Math.max(0,Math.min(hasCap?effectiveCap:100,+val||0));
    await onUpdateDiscount(id,pct);
    setSaving(false);setEditingId(null);
  };
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🎁 My Customers</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
            {customers.length} registered through your catalogue link
          </p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      {onUpdateDefaultDiscount&&<CustomerDiscountCard discountPct={defaultDiscountPct} maxDiscountPct={maxDiscountPct} shopWideCap={shopWideCap} onSave={onUpdateDefaultDiscount} onSaveMax={onUpdateMaxDiscount}/>}

      {customers.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
          Nobody's registered through your catalogue link yet — share it from My Parts.
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {customers.map(c=>{
            const isOverride=c.discount_pct!=null;
            const effective=isOverride?c.discount_pct:(defaultDiscountPct||0);
            return (
              <div key={c.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:700,fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>📞 {c.phone}{c.email?` · ${c.email}`:""}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{c.orders||0} order{c.orders!==1?"s":""} · {fmtAmt(c.total_spent||0)} spent</div>
                </div>
                {editingId===c.id ? (
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <input className="inp" type="number" min="0" max={hasCap?effectiveCap:100} style={{width:80}}
                      placeholder={String(defaultDiscountPct||0)} value={val} onChange={e=>setVal(e.target.value)} autoFocus/>
                    <span style={{fontSize:12,color:"var(--text3)"}}>%</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditingId(null)} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={()=>save(c.id)} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:800,color:effective>0?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif"}}>{effective}% off</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{isOverride?"Custom":"Default"}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>startEdit(c)}>✏️ Edit</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SupplierQueryReplyModal({query, part, onReply, onClose}) {
  const img=part?.image_url||query.part_image;
  const [price,setPrice]=useState(query?.confirmed_price||"");
  const [qty,setQty]=useState(query?.confirmed_qty||"");
  const [notes,setNotes]=useState(query?.reply_notes||"");
  const [saving,setSaving]=useState(false);
  const [lightbox,setLightbox]=useState(false);
  const handle=async()=>{
    setSaving(true);
    await onReply(query.id,{
      confirmed_price:price?+price:null, confirmed_qty:qty?+qty:null,
      reply_notes:notes, status:"replied", replied_at:new Date().toISOString(),
    });
    setSaving(false);
  };
  return (
    <Overlay onClose={onClose}>
      <MHead title="Reply to Query" sub={`${query.customer_name} — ${query.part_name}`} onClose={onClose}/>
      {lightbox&&img&&<ImgLightbox url={toImgUrl(img)} onClose={()=>setLightbox(false)}/>}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,display:"flex",gap:12}}>
        <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",background:"var(--surface3)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:img?"zoom-in":"default"}}
          onClick={()=>img&&setLightbox(true)} title={img?"Click to enlarge":undefined}>
          {img
            ? <img src={toImgUrl(img)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            : <span style={{fontSize:22,opacity:.3}}>🖼</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          {query.part_sku&&<div style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--blue)"}}>{query.part_sku}</div>}
          {part?.oe_number&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>OE: {part.oe_number}</div>}
          {(part?.make||part?.model)&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>{[part.make,part.model,part.year_range].filter(Boolean).join(" · ")}</div>}
          <div style={{marginTop:6}}>👤 {query.customer_name} · 📞 {query.customer_phone}</div>
          <div style={{marginTop:2}}>🔢 Requested qty: <strong>{query.qty_requested}</strong></div>
        </div>
      </div>
      {query.notes&&<div style={{marginTop:-8,marginBottom:14,color:"var(--text3)",fontStyle:"italic",fontSize:13}}>"{query.notes}"</div>}
      <FG cols="1fr 1fr">
        <div><FL label="Confirmed Price"/><input className="inp" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Unit price"/></div>
        <div><FL label="Confirmed Qty"/><input className="inp" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Available qty"/></div>
      </FG>
      <FD><FL label="Notes to customer"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={handle}>{saving?"Sending…":"Send Reply"}</button>
      </div>
    </Overlay>
  );
}

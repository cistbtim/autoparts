import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { getSettings, C } from "../lib/settings.js";
import { toImgUrl, fmtAmt, fmtDT } from "../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD, StatusBadge, ImgLightbox } from "./shared.jsx";
import { PartPhotoUploader } from "./RfqVehicles.jsx";
import { PrintPartLabelModal } from "./Modals.jsx";

// Margin brackets a supplier can one-tap into a suggested retail price — same
// buckets and same "round to nearest 10" behaviour as the admin Inventory
// PartModal's Stock tab, so the two flows feel identical.
const MARGIN_OPTIONS=[30,25,22];
const suggestPriceAt=(cost,marginPct)=>Math.round((+cost/(1-marginPct/100))/10)*10;

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

export function SupplierPartsPage({parts=[], existingParts=[], supplierCode, onSave, onDelete, onRefresh, onUpdateCostPrice}) {
  const [editing, setEditing] = useState(null); // null | {} (new) | existing row
  const [editingCost, setEditingCost] = useState(null); // existing-catalogue row having its cost price updated
  const [labelPart, setLabelPart] = useState(null); // part being label-printed (same modal admin/stockman use)
  const [tab, setTab] = useState(existingParts.length?"existing":"mine");
  const [search, setSearch] = useState("");
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
      {editing&&<SupplierPartModal part={editing} supplierCode={supplierCode}
        onSave={async(data)=>{await onSave(data);setEditing(null);}}
        onDelete={editing.id?async()=>{await onDelete(editing.id);setEditing(null);}:null}
        onClose={()=>setEditing(null)}/>}

      {editingCost&&<SupplierCostPriceModal part={editingCost}
        onSave={async(data)=>{await onUpdateCostPrice(editingCost,data);setEditingCost(null);}}
        onClose={()=>setEditingCost(null)}/>}

      {labelPart&&<PrintPartLabelModal part={labelPart} settings={getSettings()} onClose={()=>setLabelPart(null)}/>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📦 My Parts</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
            {existingParts.length} already in inventory · {parts.length} added by you ({parts.filter(p=>!p.price).length} awaiting pricing)
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Prices/stock can change on admin's side — refresh to see the latest">↺ Refresh</button>}
          <button className="btn btn-primary" onClick={()=>setEditing({})}>+ Add Part</button>
        </div>
      </div>

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
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>Name, customer price & stock are managed by admin. Click a part to update your own cost price or photo.</div>
            {existingFiltered.map(p=><PartRow key={p.id} p={p} code={p.sku} name={p.name} readOnly
              priceChanged={!!(lastViewed&&p.price_updated_at&&p.price_updated_at>lastViewed)}
              onClick={onUpdateCostPrice?()=>setEditingCost(p):undefined}
              onPrintLabel={()=>setLabelPart(p)}/>)}
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
              onPrintLabel={()=>setLabelPart({...p, sku:`${supplierCode}-${p.part_code}`})}/>)}
          </div>
        )
      )}
    </div>
  );
}

function PartRow({p, code, name, readOnly, priceChanged, onClick, onPrintLabel}) {
  return (
    <div className={onClick?"card card-hover":"card"} style={{padding:14,display:"flex",gap:12,alignItems:"center",cursor:onClick?"pointer":"default",
      border:priceChanged?"1px solid rgba(96,165,250,.5)":undefined,background:priceChanged?"rgba(96,165,250,.05)":undefined}}
      onClick={onClick}>
      <div style={{width:52,height:52,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {p.image_url
          ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
          : <span style={{fontSize:20,opacity:.3}}>🖼</span>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{code}{readOnly&&<span title="Managed by admin" style={{marginLeft:6,fontSize:11,opacity:.6}}>🔒</span>}</div>
        <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
        {(p.make||p.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}</div>}
        {readOnly&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Your cost: <strong style={{color:"var(--text2)"}}>{p._supplierPrice?fmtAmt(p._supplierPrice):"not set"}</strong>{p._suggestedPrice?<span style={{marginLeft:8}}>· Suggested retail: <strong style={{color:"var(--text2)"}}>{fmtAmt(p._suggestedPrice)}</strong></span>:null}</div>}
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        {priceChanged&&<div style={{fontSize:10,fontWeight:700,color:"var(--blue)",marginBottom:2}}>🔔 PRICE UPDATED</div>}
        {p.price
          ? <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</div>
          : <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",fontSize:11}}>⏳ Awaiting pricing</span>}
        <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Stock: {p.stock??0}</div>
        {onPrintLabel&&(
          <button type="button" title="Print part label" className="btn btn-ghost btn-xs" style={{marginTop:6,fontSize:11}}
            onClick={e=>{e.stopPropagation();onPrintLabel();}}>🏷️ Label</button>
        )}
      </div>
    </div>
  );
}

function SupplierCostPriceModal({part, onSave, onClose}) {
  const [price, setPrice] = useState(part._supplierPrice ?? "");
  const [suggestedPrice, setSuggestedPrice] = useState(part._suggestedPrice ?? null);
  const [imageUrl, setImageUrl] = useState(part.image_url ?? "");
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
            {MARGIN_OPTIONS.map(m=>{
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
        {suggestedPrice!=null&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Suggested retail price for admin to review: <strong style={{color:"var(--text2)"}}>{C()}{suggestedPrice.toLocaleString()}</strong></div>}
      </FD>

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={imageUrl} onChange={setImageUrl} sku={part.sku} t={{}} bucket="cars_parts"/>
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
          onClick={async()=>{setSaving(true);await onSave({price:+price,suggestedPrice,imageUrl});setSaving(false);}}>
          {saving?"Saving…":"Save"}
        </button>
      </div>
    </Overlay>
  );
}

function SupplierPartModal({part, supplierCode, onSave, onDelete, onClose}) {
  const isEdit=!!part?.id;
  const [f,setF]=useState(isEdit?{
    part_code:part.part_code||"", name:part.name||"", chinese_desc:part.chinese_desc||"",
    category:part.category||"", cost_price:part.cost_price??"", stock:part.stock??0,
    image_url:part.image_url||"", make:part.make||"", model:part.model||"",
    year_range:part.year_range||"", oe_number:part.oe_number||"", suggested_price:part.suggested_price??"",
  }:{part_code:"",name:"",chinese_desc:"",category:"",cost_price:"",stock:0,image_url:"",make:"",model:"",year_range:"",oe_number:"",suggested_price:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const canSave=f.part_code.trim()&&f.name.trim();

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
      <FG>
        <div><FL label="OE Number"/><input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)}/></div>
        <div><FL label="Category"/><input className="inp" value={f.category} onChange={e=>s("category",e.target.value)} placeholder="Body, Engine..."/></div>
      </FG>
      <FG>
        <div>
          <FL label="Your Cost Price"/>
          <input className="inp" type="number" value={f.cost_price} onChange={e=>s("cost_price",e.target.value)} placeholder="0"/>
          {+f.cost_price>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
              {MARGIN_OPTIONS.map(m=>{
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
      {+f.suggested_price>0&&<div style={{fontSize:11,color:"var(--text3)",marginTop:-8,marginBottom:14}}>Your suggested retail price for admin to review: <strong style={{color:"var(--text2)"}}>{C()}{(+f.suggested_price).toLocaleString()}</strong></div>}

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={f.image_url} onChange={url=>s("image_url",url)} sku={`${supplierCode}-${f.part_code||"part"}`} t={{}} bucket="cars_parts"/>
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
        <button className="btn btn-primary" style={{flex:2}} disabled={!canSave} onClick={()=>onSave(f)}>Save</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: SUPPLIER PRICING — set the customer-facing price/markup on parts
// suppliers have self-added (across every supplier). A part stays invisible
// to customers until it has a price here.
// ═══════════════════════════════════════════════════════════════
export function SupplierPricingPage({allParts=[], suppliers=[], onSetPrice, costUpdates=[], onDismissCostUpdate, onGoToPart, onRefresh}) {
  const [filter, setFilter] = useState(costUpdates.length?"costUpdates":"pending"); // "pending" | "all" | "costUpdates"
  const supName=(id)=>suppliers.find(s=>String(s.id)===String(id))?.name||`#${id}`;
  const supCode=(id)=>{const s=suppliers.find(s=>String(s.id)===String(id));return s?.code||s?.name||"";};
  const rows=filter==="pending"?allParts.filter(p=>!p.price):allParts;
  const [drafts, setDrafts] = useState({}); // {id: draftPriceString}

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
            {costUpdates.map(l=>(
              <div key={l.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center"}}>
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
// SUPPLIER: MY QUERIES — customer questions about parts this supplier added
// themselves (matched via customer_queries.supplier_part_id).
// ═══════════════════════════════════════════════════════════════
export function SupplierQueriesPage({queries=[], onReply, onRefresh}) {
  const [replying, setReplying] = useState(null); // query row being replied to

  return (
    <div className="fu">
      {replying&&<SupplierQueryReplyModal query={replying}
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
          {queries.map(q=>(
            <div key={q.id} className="card card-hover" style={{padding:14,cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}} onClick={()=>setReplying(q)}>
              <div style={{width:44,height:44,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {q.part_image
                  ? <img src={toImgUrl(q.part_image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                  : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{q.part_name}</div>
                  {q.part_sku&&<div style={{fontSize:12,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</div>}
                  {(q.part_make||q.part_model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[q.part_make,q.part_model,q.part_year_range].filter(Boolean).join(" · ")}</div>}
                  <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>👤 {q.customer_name} · 📞 {q.customer_phone} · Qty: {q.qty_requested}</div>
                  {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginTop:4}}>"{q.notes}"</div>}
                </div>
                <StatusBadge status={q.status}/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierQueryReplyModal({query, onReply, onClose}) {
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
      {lightbox&&query.part_image&&<ImgLightbox url={toImgUrl(query.part_image)} onClose={()=>setLightbox(false)}/>}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,display:"flex",gap:12}}>
        <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",background:"var(--surface3)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:query.part_image?"zoom-in":"default"}}
          onClick={()=>query.part_image&&setLightbox(true)} title={query.part_image?"Click to enlarge":undefined}>
          {query.part_image
            ? <img src={toImgUrl(query.part_image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            : <span style={{fontSize:22,opacity:.3}}>🖼</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          {query.part_sku&&<div style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--blue)"}}>{query.part_sku}</div>}
          {query.part_oe_number&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>OE: {query.part_oe_number}</div>}
          {(query.part_make||query.part_model)&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>{[query.part_make,query.part_model,query.part_year_range].filter(Boolean).join(" · ")}</div>}
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

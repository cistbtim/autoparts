import { useState } from "react";
import { toImgUrl, fmtAmt } from "../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD, StatusBadge } from "./shared.jsx";
import { PartPhotoUploader } from "./RfqVehicles.jsx";

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PORTAL — self-service parts catalogue for a supplier login
// (role:"supplier", scoped to one suppliers.id via user.supplier_id).
// Parts they add live in the dedicated supplier_parts table, walled off
// from the main inventory, until an admin sets a customer-facing price.
// ═══════════════════════════════════════════════════════════════

export function SupplierPartsPage({parts=[], existingParts=[], supplierCode, onSave, onDelete, onRefresh, onUpdateCostPrice}) {
  const [editing, setEditing] = useState(null); // null | {} (new) | existing row
  const [editingCost, setEditingCost] = useState(null); // existing-catalogue row having its cost price updated
  const [tab, setTab] = useState(existingParts.length?"existing":"mine");

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
        onSave={async(price)=>{await onUpdateCostPrice(editingCost._linkId,price);setEditingCost(null);}}
        onClose={()=>setEditingCost(null)}/>}

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

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["existing",`Existing Catalogue (${existingParts.length})`],["mine",`Added by You (${parts.length})`]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lb}</button>
        ))}
      </div>

      {tab==="existing"&&(
        existingParts.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            Nothing linked to you in the main inventory yet.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>Name, customer price & stock are managed by admin. Click a part to update your own cost price.</div>
            {existingParts.map(p=><PartRow key={p.id} p={p} code={p.sku} name={p.name} readOnly
              priceChanged={!!(lastViewed&&p.price_updated_at&&p.price_updated_at>lastViewed)}
              onClick={onUpdateCostPrice?()=>setEditingCost(p):undefined}/>)}
          </div>
        )
      )}

      {tab==="mine"&&(
        parts.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            No parts yet — click "+ Add Part" to add your first one.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {parts.map(p=><PartRow key={p.id} p={p} code={`${supplierCode}-${p.part_code}`} name={p.name} onClick={()=>setEditing(p)}/>)}
          </div>
        )
      )}
    </div>
  );
}

function PartRow({p, code, name, readOnly, priceChanged, onClick}) {
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
        {readOnly&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Your cost: <strong style={{color:"var(--text2)"}}>{p._supplierPrice?fmtAmt(p._supplierPrice):"not set"}</strong></div>}
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        {priceChanged&&<div style={{fontSize:10,fontWeight:700,color:"var(--blue)",marginBottom:2}}>🔔 PRICE UPDATED</div>}
        {p.price
          ? <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</div>
          : <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",fontSize:11}}>⏳ Awaiting pricing</span>}
        <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Stock: {p.stock??0}</div>
      </div>
    </div>
  );
}

function SupplierCostPriceModal({part, onSave, onClose}) {
  const [price, setPrice] = useState(part._supplierPrice ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <MHead title="Update Your Cost Price" sub={`${part.sku} — ${part.name}`} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        This is your own reference price for this part — it doesn't change what customers see or what's in admin's inventory.
      </div>
      <FD>
        <FL label="Your Cost Price"/>
        <input className="inp" type="number" min="0" step="0.01" autoFocus value={price} onChange={e=>setPrice(e.target.value)} placeholder="0"/>
      </FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving||price===""}
          onClick={async()=>{setSaving(true);await onSave(+price);setSaving(false);}}>
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
    year_range:part.year_range||"", oe_number:part.oe_number||"",
  }:{part_code:"",name:"",chinese_desc:"",category:"",cost_price:"",stock:0,image_url:"",make:"",model:"",year_range:"",oe_number:""});
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
        <div><FL label="Your Cost Price"/><input className="inp" type="number" value={f.cost_price} onChange={e=>s("cost_price",e.target.value)} placeholder="0"/></div>
        <div><FL label="Stock"/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",+e.target.value||0)}/></div>
      </FG>

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
export function SupplierPricingPage({allParts=[], suppliers=[], onSetPrice}) {
  const [filter, setFilter] = useState("pending"); // "pending" | "all"
  const supName=(id)=>suppliers.find(s=>String(s.id)===String(id))?.name||`#${id}`;
  const supCode=(id)=>{const s=suppliers.find(s=>String(s.id)===String(id));return s?.code||s?.name||"";};
  const rows=filter==="pending"?allParts.filter(p=>!p.price):allParts;
  const [drafts, setDrafts] = useState({}); // {id: draftPriceString}

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💰 Supplier Pricing</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{allParts.filter(p=>!p.price).length} awaiting pricing · {allParts.length} total</p>
        </div>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["pending","Awaiting Pricing"],["all","All"]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${filter===id?"on":""}`} onClick={()=>setFilter(id)}>{lb}</button>
        ))}
      </div>

      {rows.length===0 ? (
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
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <input className="inp" type="number" style={{width:100}} placeholder="Set price"
                  value={drafts[p.id]??p.price??""}
                  onChange={e=>setDrafts(d=>({...d,[p.id]:e.target.value}))}/>
                <button className="btn btn-primary btn-sm"
                  disabled={!String(drafts[p.id]??p.price??"").trim()}
                  onClick={()=>onSetPrice(p.id,+drafts[p.id]||0)}>
                  {p.price?"Update":"Set Live"}
                </button>
              </div>
            </div>
          ))}
        </div>
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
            <div key={q.id} className="card card-hover" style={{padding:14,cursor:"pointer"}} onClick={()=>setReplying(q)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{q.part_name}</div>
                  {q.part_sku&&<div style={{fontSize:12,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</div>}
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
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13}}>
        <div>👤 {query.customer_name} · 📞 {query.customer_phone}</div>
        <div style={{marginTop:2}}>🔢 Requested qty: <strong>{query.qty_requested}</strong></div>
        {query.notes&&<div style={{marginTop:6,color:"var(--text3)",fontStyle:"italic"}}>"{query.notes}"</div>}
      </div>
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

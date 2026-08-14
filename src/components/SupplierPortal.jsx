import { useState } from "react";
import { toImgUrl, fmtAmt } from "../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "./shared.jsx";
import { PartPhotoUploader } from "./RfqVehicles.jsx";

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PORTAL — self-service parts catalogue for a supplier login
// (role:"supplier", scoped to one suppliers.id via user.supplier_id).
// Parts they add live in the dedicated supplier_parts table, walled off
// from the main inventory, until an admin sets a customer-facing price.
// ═══════════════════════════════════════════════════════════════

export function SupplierPartsPage({parts=[], supplierCode, onSave, onDelete, t}) {
  const [editing, setEditing] = useState(null); // null | {} (new) | existing row

  return (
    <div className="fu">
      {editing&&<SupplierPartModal part={editing} supplierCode={supplierCode}
        onSave={async(data)=>{await onSave(data);setEditing(null);}}
        onDelete={editing.id?async()=>{await onDelete(editing.id);setEditing(null);}:null}
        onClose={()=>setEditing(null)}/>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📦 My Parts</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{parts.length} part{parts.length!==1?"s":""} · {parts.filter(p=>!p.price).length} awaiting pricing</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setEditing({})}>+ Add Part</button>
      </div>

      {parts.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
          No parts yet — click "+ Add Part" to add your first one.
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {parts.map(p=>(
            <div key={p.id} className="card card-hover" style={{padding:14,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}
              onClick={()=>setEditing(p)}>
              <div style={{width:52,height:52,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {p.image_url
                  ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                  : <span style={{fontSize:20,opacity:.3}}>🖼</span>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{supplierCode}-{p.part_code}</div>
                <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                {(p.make||p.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                {p.price
                  ? <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</div>
                  : <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",fontSize:11}}>⏳ Awaiting pricing</span>}
                <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Stock: {p.stock??0}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

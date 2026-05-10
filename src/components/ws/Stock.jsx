import { useState } from "react";
import { fmtAmt } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";

export function WsStockPage({wsStock=[],onSave,onDelete,onAdjust}) {
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"adjust", item?}

  const filtered=wsStock.filter(p=>{
    if(!search.trim()) return true;
    const h=`${p.name||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  const lowStock=wsStock.filter(p=>+p.qty<=+p.min_qty&&+p.min_qty>0);

  return (
    <div>
      {lowStock.length>0&&(
        <div style={{marginBottom:12,padding:"10px 14px",background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:13,color:"var(--yellow)",marginBottom:6}}>⚠️ Low Stock Alert ({lowStock.length} items)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {lowStock.map(p=>(
              <span key={p.id} className="badge" style={{background:"rgba(251,191,36,.15)",color:"var(--yellow)",fontSize:12}}>
                {p.name} — {+p.qty} {p.unit||""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:200}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workshop stock..."/>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Stock Item</button>
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📦</div>
            <div style={{fontWeight:600}}>No workshop stock yet</div>
            <div style={{fontSize:13,marginTop:4}}>Add items or transfer from the spare shop</div>
          </div>
        : (
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Name</th><th>SKU</th><th style={{textAlign:"right"}}>Qty</th><th>Unit</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Price</th><th>Low Stock</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(p=>{
                  const qty=+p.qty||0;
                  const low=+p.min_qty||0;
                  const qColor=qty<=0?"var(--red)":qty<=low?"var(--yellow)":"var(--green)";
                  return (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>
                        {p.name}
                        {p.quote_only&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",borderRadius:4,padding:"1px 5px"}}>📋 Quote only</span>}
                      </td>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku||"—"}</code></td>
                      <td style={{textAlign:"right",fontWeight:700,color:p.quote_only?"var(--text3)":qColor,fontFamily:"Rajdhani,sans-serif"}}>{p.quote_only?"—":qty}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{p.unit||"—"}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(p.unit_cost||0)}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",fontWeight:700}}>{fmtAmt(p.unit_price||0)}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{low>0?low:"—"}</td>
                      <td>
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"adjust",item:p})}>±</button>
                          <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:p})}>✏️</button>
                          <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete this stock item?"))onDelete(p.id);}}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {modal?.mode==="adjust"&&(
        <WsStockAdjustModal item={modal.item}
          onSave={async(d)=>{ await onAdjust(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsStockModal item={modal.item} wsStock={wsStock}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

export function WsStockModal({item,wsStock=[],onSave,onClose}) {
  const [name,setName]=useState(item?.name||"");
  const [sku,setSku]=useState(item?.sku||"");
  const [desc,setDesc]=useState(item?.description||"");
  const [unit,setUnit]=useState(item?.unit||"");
  const [qty,setQty]=useState(item?.qty??0);
  const [cost,setCost]=useState(item?.unit_cost||"");
  const [price,setPrice]=useState(item?.unit_price||"");
  const [lowStock,setLowStock]=useState(item?.min_qty||"");
  const [quoteOnly,setQuoteOnly]=useState(item?.quote_only||false);
  const [saving,setSaving]=useState(false);
  const [skuOpen,setSkuOpen]=useState(false);
  const isEdit=!!item;

  const skuTerm = sku.trim().toLowerCase();
  const skuMatches = wsStock.filter(p=>
    p.sku && p.id!==item?.id &&
    (skuTerm ? p.sku.toLowerCase().includes(skuTerm) || (p.name||"").toLowerCase().includes(skuTerm) : true)
  ).slice(0,8);

  const handleSave=async()=>{
    if(!name.trim()){alert("Name is required");return;}
    setSaving(true);
    try{
      await onSave({
        ...(isEdit?{id:item.id}:{}),
        name:name.trim(),
        sku:sku.trim()||null,
        description:desc.trim()||null,
        unit:unit.trim()||null,
        qty:+qty||0,
        unit_cost:+cost||0,
        unit_price:+price||0,
        min_qty:+lowStock||0,
        quote_only:quoteOnly,
      });
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Stock Item":"+ New Stock Item"} onClose={onClose}/>
      <FG>
        <FD style={{gridColumn:"1/-1"}}><FL label="Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oil Filter — Toyota"/></FD>
        <FD><FL label="SKU"/>
          <div style={{position:"relative"}}>
            <input className="inp" value={sku}
              onChange={e=>{setSku(e.target.value);setSkuOpen(true);}}
              onFocus={()=>setSkuOpen(true)}
              onBlur={()=>setTimeout(()=>setSkuOpen(false),150)}
              placeholder="WS-001"/>
            {skuOpen&&(skuMatches.length>0||skuTerm)&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:200,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.15)",maxHeight:220,overflowY:"auto",marginTop:2}}>
                {skuMatches.map(p=>(
                  <div key={p.id} onMouseDown={()=>{setSku(p.sku);setSkuOpen(false);}}
                    style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:13}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <span><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{p.sku}</code> — {p.name}</span>
                    <span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>already in stock</span>
                  </div>
                ))}
                {skuTerm&&!skuMatches.find(p=>p.sku.toLowerCase()===skuTerm)&&(
                  <div onMouseDown={()=>setSkuOpen(false)}
                    style={{padding:"8px 12px",fontSize:13,color:"var(--accent)",fontWeight:600,cursor:"default"}}>
                    + Add new: <code style={{fontFamily:"DM Mono,monospace"}}>{sku.trim()}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </FD>
        <FD><FL label="Unit"/><input className="inp" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="pcs / L / set"/></FD>
        <FD><FL label="Qty on Hand"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="0" step="1" disabled={quoteOnly} style={{opacity:quoteOnly?.5:1}}/></FD>
        <FD><FL label="Low Stock Alert"/><input className="inp" type="number" value={lowStock} onChange={e=>setLowStock(e.target.value)} min="0" disabled={quoteOnly} style={{opacity:quoteOnly?.5:1}}/></FD>
        <FD><FL label="Cost Price"/><input className="inp" type="number" value={cost} onChange={e=>setCost(e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Selling Price"/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></FD>
      </FG>
      <FD style={{marginTop:8}}><FL label="Description"/><textarea className="inp" rows={2} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional notes..."/></FD>

      {/* Quote-only toggle */}
      <label style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:12,padding:"10px 14px",background:"rgba(96,165,250,.07)",border:"1px solid rgba(96,165,250,.2)",borderRadius:10,cursor:"pointer"}}>
        <input type="checkbox" checked={quoteOnly} onChange={e=>setQuoteOnly(e.target.checked)}
          style={{width:16,height:16,marginTop:2,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
        <div>
          <div style={{fontWeight:700,fontSize:13}}>📋 Quote reference only (no stock tracking)</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
            Price is used for quotations but stock qty is never deducted — even when added to a job or invoice.
          </div>
        </div>
      </label>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Save"}</button>
      </div>
    </Overlay>
  );
}

export function WsStockAdjustModal({item,onSave,onClose}) {
  const [adjType,setAdjType]=useState("add");
  const [qty,setQty]=useState("");
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!qty||+qty<=0){alert("Enter a valid quantity");return;}
    setSaving(true);
    try{
      const delta=adjType==="add"?+qty:-+qty;
      await onSave({id:item.id, delta, reason:reason.trim()||adjType, new_qty:(+item.qty||0)+delta});
    }catch(e){alert("Adjust failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={`±  Adjust: ${item.name}`} onClose={onClose}/>
      <div style={{marginBottom:12,padding:"8px 12px",background:"var(--surface2)",borderRadius:8,display:"flex",gap:16}}>
        <span style={{fontSize:13,color:"var(--text3)"}}>Current stock:</span>
        <span style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:16,color:"var(--accent)"}}>{+item.qty||0} {item.unit||""}</span>
      </div>
      <FD><FL label="Adjustment Type"/>
        <div style={{display:"flex",gap:8}}>
          {[["add","➕ Add Stock"],["remove","➖ Remove"]].map(([v,l])=>(
            <button key={v} className={"btn btn-sm "+(adjType===v?"btn-primary":"btn-ghost")} style={{flex:1}} onClick={()=>setAdjType(v)}>{l}</button>
          ))}
        </div>
      </FD>
      <FG>
        <FD><FL label="Quantity"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="1" step="1" placeholder="0"/></FD>
        <FD><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Manual count, damaged, etc."/></FD>
      </FG>
      {qty&&+qty>0&&(
        <div style={{marginTop:8,padding:"8px 12px",background:adjType==="add"?"rgba(52,211,153,.1)":"rgba(248,113,113,.1)",borderRadius:8,textAlign:"center",fontSize:13,fontWeight:600,color:adjType==="add"?"var(--green)":"var(--red)"}}>
          New stock: {(+item.qty||0)+(adjType==="add"?+qty:-+qty)} {item.unit||""}
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Apply Adjustment"}</button>
      </div>
    </Overlay>
  );
}

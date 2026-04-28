import { useState } from "react";
import { fmtAmt } from "../../lib/helpers.js";
import { getSettings, curSym } from "../../lib/settings.js";
import { FL, FD } from "../shared.jsx";

export function WsTransferPage({parts=[],wsStock=[],settings,onSave}) {
  const [items,setItems]=useState([]); // [{part_id,ws_stock_id,name,sku,qty,cost_price}]
  const [notes,setNotes]=useState("");
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  const C=curSym(settings?.currency||getSettings().currency);
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const filteredParts=parts.filter(p=>{
    if(!search.trim()) return true;
    const h=`${p.name||""} ${p.sku||""} ${p.chinese_desc||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  }).slice(0,20);

  const addPart=(p)=>{
    if(items.find(i=>i.part_id===p.id)) return;
    const wsMatch=wsStock.find(w=>w.sku&&w.sku===p.sku);
    setItems(prev=>[...prev,{part_id:p.id,ws_stock_id:wsMatch?.id||null,name:p.name,sku:p.sku||"",qty:1,cost_price:p.cost_price||0,shop_qty:+p.qty||0}]);
    setSearch("");
  };

  const updateItem=(idx,field,val)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,[field]:val}:it));
  const removeItem=(idx)=>setItems(prev=>prev.filter((_,i)=>i!==idx));

  const totalCost=items.reduce((s,i)=>s+(+i.qty||0)*(+i.cost_price||0),0);

  const handleSave=async()=>{
    if(items.length===0){alert("Add at least one item to transfer");return;}
    const overQty=items.filter(i=>(+i.qty||0)>i.shop_qty);
    if(overQty.length>0){
      if(!window.confirm(`Some items exceed current shop stock:\n${overQty.map(i=>`${i.name}: transfer ${i.qty}, shop has ${i.shop_qty}`).join("\n")}\n\nContinue?`)) return;
    }
    setSaving(true);
    try{
      await onSave({items,notes:notes.trim()});
      setItems([]);
      setNotes("");
      setDone(true);
      setTimeout(()=>setDone(false),3000);
    }catch(e){alert("Transfer failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <div>
      <div className="card" style={{padding:14,marginBottom:14,borderLeft:"3px solid var(--blue)"}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔄 Transfer Spare Parts → Workshop Stock</div>
        <div style={{fontSize:13,color:"var(--text3)"}}>Move parts from the main spare shop inventory into the workshop stock system. Shop stock will be deducted.</div>
      </div>

      {done&&<div style={{marginBottom:12,padding:"10px 14px",background:"rgba(52,211,153,.15)",border:"1px solid rgba(52,211,153,.3)",borderRadius:10,fontWeight:600,color:"var(--green)"}}>✅ Transfer completed successfully!</div>}

      <div style={{marginBottom:14}}>
        <FL label="Search Spare Shop Parts"/>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, SKU..."/>
        {search&&filteredParts.length>0&&(
          <div style={{border:"1px solid var(--border)",borderRadius:10,maxHeight:260,overflowY:"auto",marginTop:4}}>
            {filteredParts.map(p=>(
              <div key={p.id} onClick={()=>addPart(p)}
                style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:10,alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                  {p.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku}</code>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:12,color:"var(--text3)"}}>Stock: {+p.qty||0}</div>
                  <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>{fmtAmt(p.price||0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📋 Transfer Items ({items.length})</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Part</th><th>SKU</th><th>Shop Stock</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Subtotal</th><th></th></tr></thead>
              <tbody>
                {items.map((it,idx)=>{
                  const over=(+it.qty||0)>it.shop_qty;
                  return (
                    <tr key={idx} style={over?{background:"rgba(248,113,113,.06)"}:{}}>
                      <td style={{fontWeight:600,fontSize:13}}>{it.name}{over&&<span style={{color:"var(--red)",fontSize:11,marginLeft:6}}>⚠️ Over stock</span>}</td>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{it.sku||"—"}</code></td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{it.shop_qty}</td>
                      <td style={{textAlign:"right"}}>
                        <input className="inp" type="number" value={it.qty} min="1" step="1"
                          style={{width:70,textAlign:"right"}}
                          onChange={e=>updateItem(idx,"qty",e.target.value)}/>
                      </td>
                      <td style={{textAlign:"right"}}>
                        <input className="inp" type="number" value={it.cost_price} min="0" step="0.01"
                          style={{width:90,textAlign:"right"}}
                          onChange={e=>updateItem(idx,"cost_price",e.target.value)}/>
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{fmt((+it.qty||0)*(+it.cost_price||0))}</td>
                      <td><button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>removeItem(idx)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{textAlign:"right",fontWeight:700,fontSize:13,padding:"10px 12px"}}>Total Transfer Value:</td>
                  <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",fontSize:15,padding:"10px 12px"}}>{fmt(totalCost)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <FD><FL label="Transfer Notes"/><textarea className="inp" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Reason for transfer, job reference, etc."/></FD>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setItems([]);setNotes("");}}>🗑 Clear</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving||items.length===0}>
          {saving?"Processing...":"🔄 Execute Transfer"}
        </button>
      </div>
    </div>
  );
}

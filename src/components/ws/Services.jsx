import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import { fmtAmt, parseComboItems } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";

export function WsServicesPage({wsServices=[],wsStock=[],wsId=null,onSave,onDelete,wsLocked=false}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");

  const filtered=wsServices.filter(s=>{
    if(!search.trim()) return true;
    const h=`${s.name||""} ${s.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:200}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services..."/>
        {!wsLocked&&<button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Service</button>}
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🔧</div>
            <div style={{fontWeight:600}}>No service presets yet</div>
            <div style={{fontSize:13,marginTop:4}}>Add standard labour services with preset rates</div>
          </div>
        : (
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Service Name</th><th>Description</th><th style={{textAlign:"right"}}>Rate</th><th>Unit</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(s=>{
                  const combo=parseComboItems(s);
                  return (
                  <tr key={s.id}>
                    <td style={{fontWeight:600}}>
                      {s.name}
                      {combo.length>0&&<span title={combo.map(c=>c.name).join(", ")} style={{marginLeft:8,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"rgba(251,191,36,.15)",color:"#f59e0b",whiteSpace:"nowrap"}}>⚡ Combo · {combo.length}</span>}
                    </td>
                    <td style={{fontSize:12,color:"var(--text3)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{combo.length>0?combo.map(c=>c.name).join(" + "):(s.description||"—")}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(s.default_price||s.price||s.rate||0)}</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{s.unit||"job"}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:s})}>✏️</button>}
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete service preset?"))onDelete(s.id);}}>🗑</button>}
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

      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsServiceModal item={modal.item} wsStock={wsStock} wsId={wsId}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

export function WsServiceModal({item,wsStock=[],wsId=null,onSave,onClose}) {
  const [name,setName]=useState(item?.name||"");
  const [desc,setDesc]=useState(item?.description||"");
  const [rate,setRate]=useState(item?.default_price||item?.price||item?.rate||"");
  const [unit,setUnit]=useState(item?.unit||"job");
  const [saving,setSaving]=useState(false);
  // Combo builder — parts bundled with this service
  const [comboItems,setComboItems]=useState(()=>parseComboItems(item));
  const [comboSearch,setComboSearch]=useState("");
  const [manualName,setManualName]=useState("");
  const [manualPrice,setManualPrice]=useState("");
  // Fresh stock from DB — the wsStock prop can be stale (misses parts created
  // moments ago in the Add Part modal, which inserts to DB without a global refresh)
  const [liveStock,setLiveStock]=useState(null);
  useEffect(()=>{
    let dead=false;
    api.fresh("workshop_stock",`select=*&order=name.asc${wsId?`&workshop_id=eq.${wsId}`:""}`)
      .then(d=>{ if(!dead&&Array.isArray(d)) setLiveStock(d); })
      .catch(()=>{});
    return ()=>{dead=true;};
  },[wsId]);
  const stockList=liveStock||wsStock;
  const isEdit=!!item;

  const sq=comboSearch.trim().toLowerCase();
  const stockSuggs=sq
    ? stockList.filter(p=>{
        if(comboItems.some(c=>c.ws_stock_id===p.id)) return false;
        const h=`${p.name||""} ${p.sku||""}`.toLowerCase();
        return sq.split(/\s+/).every(w=>h.includes(w));
      }).slice(0,8)
    : [];

  const addStockLine=(p)=>{
    setComboItems(prev=>[...prev,{type:"part",name:p.name,ws_stock_id:p.id,sku:p.sku||"",qty:1}]);
    setComboSearch("");
  };
  const addManualLine=()=>{
    if(!manualName.trim()) return;
    setComboItems(prev=>[...prev,{type:"part",name:manualName.trim(),ws_stock_id:null,sku:"",qty:1,unit_price:+manualPrice||0}]);
    setManualName(""); setManualPrice("");
  };
  const setComboQty=(idx,q)=>setComboItems(prev=>prev.map((c,i)=>i===idx?{...c,qty:Math.max(1,+q||1)}:c));
  const removeCombo=(idx)=>setComboItems(prev=>prev.filter((_,i)=>i!==idx));

  const handleSave=async()=>{
    if(!name.trim()){alert("Name is required");return;}
    setSaving(true);
    try{
      await onSave({
        ...(isEdit?{id:item.id}:{}),
        name:name.trim(),
        description:desc.trim()||null,
        default_price:+rate||0,
        unit:unit.trim()||"job",
        combo_items:comboItems.length?JSON.stringify(comboItems):null,
      });
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Service":"+ New Service Preset"} onClose={onClose}/>
      <FD><FL label="Service Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oil Change, Brake Pad Replacement"/></FD>
      <FD><FL label="Description"/><textarea className="inp" rows={2} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional details..."/></FD>
      <FG>
        <FD><FL label="Default Rate (labour)"/><input className="inp" type="number" value={rate} onChange={e=>setRate(e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Unit"/><input className="inp" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="job / hr / set"/></FD>
      </FG>

      {/* ⚡ Combo builder */}
      <div style={{marginTop:16,border:"1px solid rgba(251,191,36,.35)",borderRadius:12,padding:"12px 14px",background:"rgba(251,191,36,.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{fontSize:13,fontWeight:800,color:"#f59e0b"}}>⚡ Combo Items</span>
          {comboItems.length>0&&<span style={{fontSize:11,fontWeight:700,color:"var(--text3)"}}>{comboItems.length} item{comboItems.length>1?"s":""}</span>}
        </div>
        <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
          Optional — bundle parts with this service (e.g. Oil Service = oil + oil filter + air filter). Adding the combo to a quote adds the labour plus all these parts in one click.
        </div>

        {comboItems.length>0&&(
          <div style={{border:"1px solid var(--border)",borderRadius:8,marginBottom:10,overflow:"hidden"}}>
            {comboItems.map((c,idx)=>(
              <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:idx<comboItems.length-1?"1px solid var(--border)":"none",background:"var(--surface2)"}}>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,flexShrink:0,background:c.ws_stock_id?"rgba(96,165,250,.15)":"rgba(148,163,184,.15)",color:c.ws_stock_id?"var(--blue)":"var(--text3)"}}>
                  {c.ws_stock_id?"🔩 Stock":"✏️ Manual"}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                  {c.sku&&<code style={{fontSize:10,color:"var(--text3)"}}>{c.sku}</code>}
                </div>
                {!c.ws_stock_id&&<span style={{fontSize:11,color:"var(--text3)",flexShrink:0,fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(c.unit_price||0)}</span>}
                <span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>×</span>
                <input type="number" min="1" step="1" value={c.qty} onChange={e=>setComboQty(idx,e.target.value)}
                  style={{width:52,textAlign:"center",fontSize:13,fontWeight:700,padding:"3px 4px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",flexShrink:0}}/>
                <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}} onClick={()=>removeCombo(idx)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{position:"relative",marginBottom:8}}>
          <input className="inp" value={comboSearch} onChange={e=>setComboSearch(e.target.value)} placeholder="🔍 Search workshop stock to add a part..."/>
          {stockSuggs.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:20,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.25)",maxHeight:220,overflowY:"auto"}}>
              {stockSuggs.map(p=>(
                <div key={p.id} onClick={()=>addStockLine(p)} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                    {p.sku&&<code style={{fontSize:10,color:"var(--text3)"}}>{p.sku}</code>}
                  </div>
                  <span style={{fontSize:12,fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",flexShrink:0}}>{fmtAmt(p.unit_price||p.unit_cost||0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <input className="inp" style={{flex:2}} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Or type a part name manually..."
            onKeyDown={e=>{if(e.key==="Enter")addManualLine();}}/>
          <input className="inp" type="number" style={{flex:1,maxWidth:110}} value={manualPrice} onChange={e=>setManualPrice(e.target.value)} placeholder="Price"
            onKeyDown={e=>{if(e.key==="Enter")addManualLine();}}/>
          <button className="btn btn-ghost btn-sm" style={{flexShrink:0}} onClick={addManualLine} disabled={!manualName.trim()}>+ Add</button>
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Save"}</button>
      </div>
    </Overlay>
  );
}

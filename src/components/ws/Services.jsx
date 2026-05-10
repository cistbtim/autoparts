import { useState } from "react";
import { fmtAmt } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";

export function WsServicesPage({wsServices=[],onSave,onDelete}) {
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
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Service</button>
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
                {filtered.map(s=>(
                  <tr key={s.id}>
                    <td style={{fontWeight:600}}>{s.name}</td>
                    <td style={{fontSize:12,color:"var(--text3)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.description||"—"}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(s.default_price||s.price||s.rate||0)}</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{s.unit||"job"}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:s})}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete service preset?"))onDelete(s.id);}}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsServiceModal item={modal.item}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

export function WsServiceModal({item,onSave,onClose}) {
  const [name,setName]=useState(item?.name||"");
  const [desc,setDesc]=useState(item?.description||"");
  const [rate,setRate]=useState(item?.default_price||item?.price||item?.rate||"");
  const [unit,setUnit]=useState(item?.unit||"job");
  const [saving,setSaving]=useState(false);
  const isEdit=!!item;

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
        <FD><FL label="Default Rate"/><input className="inp" type="number" value={rate} onChange={e=>setRate(e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Unit"/><input className="inp" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="job / hr / set"/></FD>
      </FG>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Save"}</button>
      </div>
    </Overlay>
  );
}

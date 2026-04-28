import { useState } from "react";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";

export function WsSuppliersPage({wsSuppliers=[],onSave,onDelete}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");

  const filtered=wsSuppliers.filter(s=>{
    if(!search.trim()) return true;
    const h=`${s.name||""} ${s.phone||""} ${s.email||""} ${s.notes||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:200}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search suppliers..."/>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Supplier</button>
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:36,marginBottom:8}}>🏪</div>
            <div style={{fontWeight:600,marginBottom:4}}>No suppliers yet</div>
            <div style={{fontSize:13}}>Add your parts suppliers with their WhatsApp numbers</div>
          </div>
        : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filtered.map(s=>(
              <div key={s.id} className="card" style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{width:38,height:38,borderRadius:10,background:"rgba(37,211,102,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏪</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{s.name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",display:"flex",gap:10,flexWrap:"wrap",marginTop:2}}>
                    {s.phone&&<span>📲 {s.phone}</span>}
                    {s.group_link&&<span style={{color:"#25D366"}}>👥 Group</span>}
                    {s.email&&<span>✉️ {s.email}</span>}
                    {s.notes&&<span style={{fontStyle:"italic"}}>{s.notes}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  {s.phone&&(
                    <a href={`https://wa.me/${s.phone.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer">
                      <button className="btn btn-ghost btn-xs" style={{color:"#25D366"}}>💬 Chat</button>
                    </a>
                  )}
                  {s.group_link&&(
                    <a href={s.group_link} target="_blank" rel="noopener noreferrer">
                      <button className="btn btn-ghost btn-xs" style={{color:"#25D366"}}>👥 Group</button>
                    </a>
                  )}
                  <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:s})}>✏️</button>
                  <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm(`Delete ${s.name}?`))onDelete(s.id);}}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsSupplierModal item={modal.item}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

export function WsSupplierModal({item,onSave,onClose}) {
  const [name,         setName]         = useState(item?.name||"");
  const [phone,        setPhone]        = useState(item?.phone||"");
  const [groupLink,    setGroupLink]    = useState(item?.group_link||"");
  const [email,        setEmail]        = useState(item?.email||"");
  const [notes,        setNotes]        = useState(item?.notes||"");
  const [vatInclusive, setVatInclusive] = useState(item?.vat_inclusive||false);
  const [saving,       setSaving]       = useState(false);
  const isEdit=!!item;

  const handleSave=async()=>{
    if(!name.trim()){alert("Name is required");return;}
    setSaving(true);
    try{
      await onSave({
        ...(isEdit?{id:item.id}:{}),
        name:name.trim(),
        phone:phone.trim()||null,
        group_link:groupLink.trim()||null,
        email:email.trim()||null,
        notes:notes.trim()||null,
        vat_inclusive:vatInclusive,
      });
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"✏️ Edit Supplier":"🏪 New Supplier"} onClose={onClose}/>
      <FD><FL label="Supplier Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. ABC Auto Parts"/></FD>
      <FG>
        <FD><FL label="WhatsApp / Phone"/><input className="inp" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+27 83 000 0000"/></FD>
        <FD><FL label="Email (optional)"/><input className="inp" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="supplier@example.com"/></FD>
      </FG>
      <FD>
        <FL label="WhatsApp Group Link (optional)"/>
        <input className="inp" value={groupLink} onChange={e=>setGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/xxxxx"/>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Paste the group invite link — tap ⋮ in WhatsApp group → Invite via link → Copy link</div>
      </FD>
      <FD><FL label="Notes (optional)"/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. BMW specialist, fast delivery"/></FD>
      <FD>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0"}}>
          <input type="checkbox" id="vatIncl" checked={vatInclusive} onChange={e=>setVatInclusive(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          <label htmlFor="vatIncl" style={{cursor:"pointer",fontSize:13,fontWeight:500}}>Prices include VAT</label>
          <span style={{fontSize:11,color:"var(--text3)"}}>(supplier quotes prices incl. VAT)</span>
        </div>
      </FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"💾 Save"}</button>
      </div>
    </Overlay>
  );
}

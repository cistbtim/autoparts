import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api.js";
import { getSettings, curSym } from "../../lib/settings.js";
import { makeId } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD, DriveImg } from "../shared.jsx";
import { VehiclePhotoUploader } from "../RfqVehicles.jsx";

export function WsCustomersPage({wsCustomers=[],wsVehicles=[],jobs=[],onSaveCustomer,onDeleteCustomer,onSaveVehicle,onDeleteVehicle,onOpenJob,t,wsLocked=false}) {
  const [view,setView]=useState("list"); // list | customer
  const [activeCust,setActiveCust]=useState(null);
  const [editCust,setEditCust]=useState(null);
  const [editVehicle,setEditVehicle]=useState(null);
  const [search,setSearch]=useState("");
  // Customer documents
  const [custDocs,setCustDocs]=useState([]);
  const [cdName,setCdName]=useState("");
  const [cdNotes,setCdNotes]=useState("");
  const [cdFile,setCdFile]=useState(null);
  const [cdPreview,setCdPreview]=useState(null);
  const [cdUploading,setCdUploading]=useState(false);
  const [cdViewImg,setCdViewImg]=useState(null);
  const cdFileRef=useRef(null);

  useEffect(()=>{
    if(!activeCust) return;
    api.get("workshop_documents",`customer_id=eq.${activeCust.id}&order=uploaded_at.desc`)
      .then(r=>setCustDocs(Array.isArray(r)?r:[]))
      .catch(()=>setCustDocs([]));
  },[activeCust]);

  const handleCdFile=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    setCdFile(f);
    setCdName(prev=>prev||f.name.replace(/\.[^.]+$/,""));
    if(f.type.startsWith("image/")){const r=new FileReader();r.onload=ev=>setCdPreview(ev.target.result);r.readAsDataURL(f);}
    else setCdPreview(null);
  };

  const uploadCustDoc=async()=>{
    if(!cdFile){alert("Choose a file first");return;}
    if(!cdName.trim()){alert("Enter a document name");return;}
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
    if(!SCRIPT_URL){alert("No Google Drive Script URL in Settings");return;}
    setCdUploading(true);
    try{
      const isPdf=cdFile.type==="application/pdf";
      let base64,mimeType,filename;
      if(isPdf){
        base64=await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=ev=>{const b=new Uint8Array(ev.target.result);let s="";b.forEach(x=>{s+=String.fromCharCode(x);});res("data:application/pdf;base64,"+btoa(s));};
          r.onerror=rej;r.readAsArrayBuffer(cdFile);
        });
        mimeType="application/pdf";filename=`${cdName.trim().replace(/\s+/g,"_")}_${Date.now()}.pdf`;
      } else {
        base64=await new Promise((res,rej)=>{
          const img=new Image();
          img.onload=()=>{
            const MAX=1600;const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const ratio=Math.min(MAX/w,MAX/h);w=Math.round(w*ratio);h=Math.round(h*ratio);}
            canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);
            res(canvas.toDataURL("image/jpeg",0.88));
          };
          img.onerror=rej;img.src=cdPreview;
        });
        mimeType="image/jpeg";filename=`${cdName.trim().replace(/\s+/g,"_")}_${Date.now()}.jpg`;
      }
      const folderPath=`Tim_Car_Phot/Customers/${activeCust.name.replace(/\s+/g,"_")}`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType,folderPath})});
      const result=await resp.json();
      if(!result.success) throw new Error(result.error||"Upload failed");
      const rec={id:makeId("WSD"),customer_id:activeCust.id,workshop_id:null,job_id:null,
        name:cdName.trim(),notes:cdNotes.trim()||null,file_url:result.url,
        file_type:isPdf?"pdf":"image",mime_type:mimeType,filename,uploaded_at:new Date().toISOString()};
      const saved=await api.insert("workshop_documents",rec);
      if(saved&&!Array.isArray(saved)&&saved.message) throw new Error(saved.message);
      setCustDocs(p=>[rec,...p]);
      setCdName("");setCdNotes("");setCdFile(null);setCdPreview(null);
      if(cdFileRef.current) cdFileRef.current.value="";
    }catch(e){alert("Upload failed: "+e.message);}
    finally{setCdUploading(false);}
  };

  const deleteCustDoc=async(id)=>{
    await api.delete("workshop_documents","id",id);
    setCustDocs(p=>p.filter(d=>d.id!==id));
  };
  const [editCdId,setEditCdId]=useState(null);
  const [editCdVal,setEditCdVal]=useState({name:"",notes:""});
  const saveCdEdit=async()=>{
    if(!editCdVal.name.trim()){alert("Name required");return;}
    await api.patch("workshop_documents","id",editCdId,{name:editCdVal.name.trim(),notes:editCdVal.notes.trim()||null});
    setCustDocs(p=>p.map(d=>d.id===editCdId?{...d,name:editCdVal.name.trim(),notes:editCdVal.notes.trim()||null}:d));
    setEditCdId(null);
  };

  const filtered=wsCustomers.filter(c=>{
    if(!search.trim()) return true;
    const q=search.toLowerCase();
    return `${c.name} ${c.phone||""} ${c.email||""}`.toLowerCase().includes(q);
  });

  if(view==="customer"&&activeCust){
    const custVehicles=wsVehicles.filter(v=>v.workshop_customer_id===activeCust.id);
    const custJobs=jobs.filter(j=>j.workshop_customer_id===activeCust.id||j.customer_name===activeCust.name);
    return (
      <>
      <div className="fu">
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setView("list");setActiveCust(null);}}>← Back</button>
          <div style={{flex:1}}>
            <h1 style={{fontSize:18,fontWeight:700}}>{activeCust.name}</h1>
            <div style={{fontSize:12,color:"var(--text3)"}}>{activeCust.phone}{activeCust.email&&` · ${activeCust.email}`}</div>
          </div>
          {!wsLocked&&<button className="btn btn-ghost btn-sm" onClick={()=>setEditCust(activeCust)}>✏️ Edit</button>}
          {!wsLocked&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete customer?")){ await onDeleteCustomer(activeCust.id); setView("list"); setActiveCust(null); }}}>🗑️</button>}
        </div>

        {/* Vehicles */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🚗 Vehicles ({custVehicles.length})</div>
          {!wsLocked&&<button className="btn btn-ghost btn-sm" onClick={()=>setEditVehicle({workshop_customer_id:activeCust.id,reg:"",make:"",model:"",year:"",color:"",notes:""})}>+ {t.wsAddVehicle}</button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10,marginBottom:20}}>
          {custVehicles.length===0&&<div className="card" style={{padding:20,color:"var(--text3)",textAlign:"center",gridColumn:"1/-1"}}>{t.wsNoVehicles}</div>}
          {custVehicles.map(v=>{
            const vJobs=jobs.filter(j=>j.workshop_vehicle_id===v.id||j.vehicle_reg===v.reg);
            const openJob=vJobs.find(j=>j.status!=="Delivered");
            return (
              <div key={v.id} className="card" style={{padding:14,borderLeft:`3px solid ${openJob?"var(--yellow)":"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:15}}>🚗 {v.reg}</div>
                    <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{v.make} {v.model} {v.year&&`(${v.year})`}</div>
                    {v.color&&<div style={{fontSize:11,color:"var(--text3)"}}>{v.color}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {!wsLocked&&<button className="btn btn-ghost btn-xs" onClick={()=>setEditVehicle(v)}>✏️</button>}
                    {!wsLocked&&<button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete vehicle?")) await onDeleteVehicle(v.id);}}>✕</button>}
                  </div>
                </div>
                {[v.photo_front,v.photo_rear,v.photo_side].some(Boolean)&&(
                  <div style={{display:"flex",gap:5,marginTop:8}}>
                    {[{url:v.photo_front,label:"Front"},{url:v.photo_rear,label:"Rear"},{url:v.photo_side,label:"Side"}].filter(p=>p.url).map(p=>(
                      <DriveImg key={p.label} url={p.url} alt={p.label} style={{width:54,height:40,objectFit:"cover",borderRadius:5,border:"1px solid var(--border)"}}/>
                    ))}
                  </div>
                )}
                {openJob&&<div style={{marginTop:8,fontSize:11,color:"var(--yellow)"}}> Open: {openJob.status} · {openJob.date_in}</div>}
                <div style={{marginTop:6,fontSize:11,color:"var(--text3)"}}>{vJobs.length} job(s) total</div>
              </div>
            );
          })}
        </div>

        {/* Job history */}
        <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📋 Job History ({custJobs.length})</div>
        {custJobs.length===0&&<div className="card" style={{padding:20,color:"var(--text3)",textAlign:"center"}}>{t.wsNoJobs}</div>}
        {onOpenJob&&custJobs.length>0&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>Double-click a job to open job card</div>}
        {custJobs.map(j=>(
          <div key={j.id} className="card" style={{padding:12,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:onOpenJob?"pointer":"default"}}
            onDoubleClick={()=>onOpenJob&&onOpenJob(j)}>
            <div>
              <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.id}</code>
              <span style={{marginLeft:10,fontSize:13,fontWeight:600}}>{j.vehicle_reg}</span>
              {j.complaint&&<div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{j.complaint.slice(0,60)}</div>}
              {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginTop:2}}>🔄 {j.return_reason.slice(0,50)}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span className="badge" style={{fontSize:11}}>{j.status}</span>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>{j.date_in}</div>
            </div>
          </div>
        ))}

        {/* Customer Documents */}
        <div style={{fontWeight:700,fontSize:14,marginBottom:12,marginTop:10}}>📎 Documents ({custDocs.length})</div>
        <div className="card" style={{padding:14,marginBottom:14}}>
          {/* Upload row */}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:custDocs.length>0?12:0}}>
            <input ref={cdFileRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={handleCdFile}/>
            <button className="btn btn-ghost btn-sm" onClick={()=>cdFileRef.current?.click()}>
              📂 {cdFile?cdFile.name:"Choose File"}
            </button>
            <input className="inp" style={{flex:1,minWidth:120,height:34,fontSize:13}} value={cdName} onChange={e=>setCdName(e.target.value)} placeholder="Document name"/>
            <input className="inp" style={{flex:1,minWidth:100,height:34,fontSize:13}} value={cdNotes} onChange={e=>setCdNotes(e.target.value)} placeholder="Notes (optional)"/>
            <button className="btn btn-primary btn-sm" onClick={uploadCustDoc} disabled={cdUploading||!cdFile}>
              {cdUploading?"⏳ Uploading...":"⬆️ Upload"}
            </button>
          </div>
          {cdPreview&&<div style={{marginBottom:8}}><img src={cdPreview} alt="preview" style={{maxHeight:90,borderRadius:6,border:"1px solid var(--border)"}}/></div>}
          {/* Docs list */}
          {custDocs.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {custDocs.map(d=>{
                const isPdf=d.file_type==="pdf"||(d.mime_type||"").includes("pdf");
                const isEditing=editCdId===d.id;
                return (
                  <div key={d.id} style={{padding:"7px 10px",background:"var(--surface2)",borderRadius:8}}>
                    {isEditing?(
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input className="inp" style={{flex:2,minWidth:120,height:30,fontSize:13}} value={editCdVal.name} onChange={e=>setEditCdVal(v=>({...v,name:e.target.value}))} placeholder="Name"/>
                        <input className="inp" style={{flex:2,minWidth:100,height:30,fontSize:13}} value={editCdVal.notes} onChange={e=>setEditCdVal(v=>({...v,notes:e.target.value}))} placeholder="Notes"/>
                        <button className="btn btn-primary btn-xs" onClick={saveCdEdit}>✅</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setEditCdId(null)}>✕</button>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20,flexShrink:0}}>{isPdf?"📄":"🖼️"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                          {d.notes&&<div style={{fontSize:11,color:"var(--text3)"}}>{d.notes}</div>}
                          {d.job_id&&<div style={{fontSize:10,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>📋 {d.job_id}</div>}
                        </div>
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:"none"}}>{isPdf?"📄 Open":"🔍 View"}</a>
                        {!isPdf&&<button className="btn btn-ghost btn-xs" onClick={()=>setCdViewImg(d.file_url)}>🖼️</button>}
                        <button className="btn btn-ghost btn-xs" onClick={()=>{setEditCdId(d.id);setEditCdVal({name:d.name||"",notes:d.notes||""});}}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete document?"))deleteCustDoc(d.id);}}>🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {custDocs.length===0&&!cdFile&&<div style={{textAlign:"center",padding:16,color:"var(--text3)",fontSize:13}}>No documents yet — upload ID, insurance, warranty, etc.</div>}
        </div>

      </div>
      {/* Image lightbox */}
      {cdViewImg&&(
        <div onClick={()=>setCdViewImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <img src={cdViewImg} alt="doc" style={{maxWidth:"92vw",maxHeight:"90vh",borderRadius:10}}/>
        </div>
      )}
      {/* Modals outside .fu so position:fixed isn't trapped by the animation stacking context */}
      {editCust&&(
        <Overlay onClose={()=>setEditCust(null)} wide>
          <MHead title={editCust.id?"✏️ "+t.wsEditCustomer:"👤 "+t.wsNewCustomer} onClose={()=>setEditCust(null)}/>
          <WsCustomerForm data={editCust}
            onSave={async(d)=>{ await onSaveCustomer(d); setEditCust(null); if(activeCust&&activeCust.id===d.id) setActiveCust({...activeCust,...d}); }}
            onClose={()=>setEditCust(null)} t={t}/>
        </Overlay>
      )}
      {editVehicle&&(
        <Overlay onClose={()=>setEditVehicle(null)} wide>
          <MHead title={editVehicle.id?"✏️ "+t.editVehicle:"🚗 "+t.addVehicle} onClose={()=>setEditVehicle(null)}/>
          <WsVehicleForm data={editVehicle}
            onSave={async(d)=>{ await onSaveVehicle(d); setEditVehicle(null); }}
            onPhotoSaved={onSaveVehicle}
            onClose={()=>setEditVehicle(null)} t={t}/>
        </Overlay>
      )}
      </>
    );
  }

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>👤 {t.wsCustomers}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{wsCustomers.length} {t.wsCountCustomers} · {wsVehicles.length} {t.wsCountVehicles}</p>
        </div>
        {!wsLocked&&<button className="btn btn-primary" onClick={()=>setEditCust({name:"",phone:"",email:"",notes:""})}>+ {t.wsNewCustomer}</button>}
      </div>

      <div style={{position:"relative",marginBottom:14,maxWidth:320}}>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.wsSearchCustomer}/>
        {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
      </div>

      {filtered.length===0&&<div className="card" style={{padding:36,textAlign:"center",color:"var(--text3)"}}>{t.wsNoCustomers}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(c=>{
          const cv=wsVehicles.filter(v=>v.workshop_customer_id===c.id);
          const cj=jobs.filter(j=>j.workshop_customer_id===c.id||j.customer_name===c.name);
          const openJobs=cj.filter(j=>j.status!=="Delivered");
          return (
            <div key={c.id} className="card card-hover" style={{padding:16,cursor:"pointer"}} onClick={()=>{setActiveCust(c);setView("customer");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{c.name}</div>
                  {c.phone&&<div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{c.phone}</div>}
                </div>
                {openJobs.length>0&&<span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",flexShrink:0}}>{openJobs.length} open</span>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {cv.map(v=><span key={v.id} className="badge" style={{fontFamily:"DM Mono,monospace",fontSize:11,background:"var(--surface2)"}}>🚗 {v.reg}</span>)}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"var(--text3)"}}>{cv.length} vehicle(s) · {cj.length} job(s)</div>
            </div>
          );
        })}
      </div>

      {/* Edit customer modal */}
      {editCust&&(
        <Overlay onClose={()=>setEditCust(null)} wide>
          <MHead title={editCust.id?"✏️ "+t.wsEditCustomer:"👤 "+t.wsNewCustomer} onClose={()=>setEditCust(null)}/>
          <WsCustomerForm data={editCust}
            onSave={async(d)=>{ await onSaveCustomer(d); setEditCust(null); if(activeCust&&activeCust.id===d.id) setActiveCust({...activeCust,...d}); }}
            onClose={()=>setEditCust(null)} t={t}/>
        </Overlay>
      )}

      {/* Edit vehicle modal */}
      {editVehicle&&(
        <Overlay onClose={()=>setEditVehicle(null)} wide>
          <MHead title={editVehicle.id?"✏️ "+t.editVehicle:"🚗 "+t.addVehicle} onClose={()=>setEditVehicle(null)}/>
          <WsVehicleForm data={editVehicle}
            onSave={async(d)=>{ await onSaveVehicle(d); setEditVehicle(null); }}
            onPhotoSaved={onSaveVehicle}
            onClose={()=>setEditVehicle(null)} t={t}/>
        </Overlay>
      )}
    </div>
  );
}

export function WsCustomerForm({data,onSave,onClose,t}) {
  const [f,setF]=useState({id:data.id||null,name:data.name||"",phone:data.phone||"",email:data.email||"",id_number:data.id_number||"",notes:data.notes||""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div>
      <FG>
        <div><FL label="Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Full name"/></div>
        <div><FL label={t.phone}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="+27..."/></div>
      </FG>
      <FG>
        <div><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div>
        <div><FL label="ID / Reg No."/><input className="inp" value={f.id_number} onChange={e=>s("id_number",e.target.value)}/></div>
      </FG>
      <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:50}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name.trim()){alert("Name required");return;}onSave(f);}}>💾 {t.save}</button>
      </div>
    </div>
  );
}

export function WsVehicleForm({data,onSave,onPhotoSaved,onClose,t}) {
  const [f,setF]=useState({id:data.id||null,workshop_customer_id:data.workshop_customer_id,reg:data.reg||"",make:data.make||"",model:data.model||"",year:data.year||"",color:data.color||"",vin:data.vin||"",engine_no:data.engine_no||"",notes:data.notes||"",photo_front:data.photo_front||"",photo_rear:data.photo_rear||"",photo_side:data.photo_side||""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div>
      <FG>
        <div><FL label="Plate / Reg *"/><input className="inp" value={f.reg} onChange={e=>s("reg",e.target.value.toUpperCase())} placeholder="GP 123-456" style={{fontFamily:"DM Mono,monospace",fontWeight:700}}/></div>
        <div><FL label="Color"/><input className="inp" value={f.color} onChange={e=>s("color",e.target.value)} placeholder="White, Black..."/></div>
      </FG>
      <FG cols="1fr 1fr 1fr">
        <div><FL label={t.make}/><input className="inp" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="Toyota..."/></div>
        <div><FL label={t.model}/><input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="Hilux..."/></div>
        <div><FL label="Year"/><input className="inp" type="number" value={f.year} onChange={e=>s("year",e.target.value)} placeholder="2022"/></div>
      </FG>
      <FG>
        <div><FL label="VIN"/><input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} placeholder="17-char VIN" style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
        <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
      </FG>
      <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:50}}/></FD>

      {/* Photos — only available after vehicle is saved */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",margin:"14px 0 8px",paddingBottom:6,borderBottom:"1px solid var(--border)"}}>📸 Vehicle Photos</div>
      {f.id
        ? <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[
              {key:"photo_front", label:"Front"},
              {key:"photo_rear",  label:"Rear"},
              {key:"photo_side",  label:"Side"},
            ].map(({key,label})=>(
              <VehiclePhotoUploader key={key} label={label} url={f[key]}
                vehicleId={f.id} make={f.make||"vehicle"} reg={f.reg} viewName={key.replace("photo_","")}
                onChange={url=>{ const upd={...f,[key]:url}; s(key,url); onPhotoSaved?onPhotoSaved(upd):api.patch("workshop_vehicles",f.id,{[key]:url}).catch(()=>{}); }}/>
            ))}
          </div>
        : <div style={{textAlign:"center",padding:16,background:"var(--surface2)",borderRadius:10,color:"var(--text3)",fontSize:13}}>
            💾 Save the vehicle first, then add photos
          </div>
      }

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.reg.trim()){alert("Plate required");return;}onSave(f);}}>💾 {t.save}</button>
      </div>
    </div>
  );
}

export function LicenceRenewalModal({job, vehicleRecord, settings, wsId, onSave, onClose}) {
  const agentPhone = (settings?.licence_renewal_agent_phone||"").replace(/[^0-9]/g,"");
  const agentName  = settings?.licence_renewal_agent_name || "Renewal Agent";
  const effExpiry  = vehicleRecord?.licence_disc_expiry || job?.licence_disc_expiry || "";
  const [f, setF] = useState({
    vehicle_reg:   job?.vehicle_reg   || vehicleRecord?.reg   || "",
    vehicle_make:  job?.vehicle_make  || vehicleRecord?.make  || "",
    vehicle_model: job?.vehicle_model || vehicleRecord?.model || "",
    vin:           job?.vin           || vehicleRecord?.vin   || "",
    engine_no:     job?.engine_no     || vehicleRecord?.engine_no || "",
    current_expiry: effExpiry,
    owner_name:    job?.customer_name  || "",
    owner_phone:   job?.customer_phone || "",
    owner_id:      "",
    renewal_years: "1",
    notes:         "",
  });
  const [saving, setSaving] = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  const handleSubmit = async () => {
    if (!f.vehicle_reg.trim()) { alert("Vehicle registration required"); return; }
    setSaving(true);
    const rec = {
      ...f,
      renewal_years: +f.renewal_years||1,
      workshop_id: wsId || null,
      job_id: job?.id || null,
      status: "pending",
      commission_status: "unpaid",
      submitted_at: new Date().toISOString(),
    };
    await onSave(rec);
    if (agentPhone) {
      const msg = [
        "🪪 Licence Renewal Request",
        "",
        `Reg: ${f.vehicle_reg}  ${f.vehicle_make} ${f.vehicle_model}`,
        f.vin       ? `VIN: ${f.vin}` : null,
        f.engine_no ? `Engine: ${f.engine_no}` : null,
        f.current_expiry ? `Current Expiry: ${f.current_expiry}` : null,
        `Renewal: ${f.renewal_years} year${+f.renewal_years>1?"s":""}`,
        "",
        `Owner: ${f.owner_name}`,
        f.owner_id    ? `ID No: ${f.owner_id}` : null,
        f.owner_phone ? `Phone: ${f.owner_phone}` : null,
        f.notes       ? `Notes: ${f.notes}` : null,
      ].filter(Boolean).join("\n");
      window.open(`https://wa.me/${agentPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    }
    setSaving(false);
    onClose();
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="🪪 Request Licence Renewal" onClose={onClose}/>
      <div style={{padding:"0 2px 4px"}}>
        {agentPhone ? (
          <div style={{background:"rgba(37,211,102,.08)",border:"1px solid rgba(37,211,102,.3)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"var(--text2)"}}>
            Renewal request will be sent via WhatsApp to <strong>{agentName}</strong>
          </div>
        ) : (
          <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"var(--red)"}}>
            ⚠️ No renewal agent phone configured — set it in Settings → Licence Renewal Agent
          </div>
        )}
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
            {f.current_expiry&&<div style={{fontSize:11,marginTop:3,fontWeight:600,color:new Date(f.current_expiry)<new Date()?"var(--red)":"var(--green)"}}>{new Date(f.current_expiry)<new Date()?"⚠️ EXPIRED":"✅ Valid"}</div>}
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
        <div style={{borderTop:"1px solid var(--border)",paddingTop:12,marginTop:4}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Owner Details</div>
          <FG cols="1fr 1fr">
            <div><FL label="Owner Name"/><input className="inp" value={f.owner_name} onChange={e=>s("owner_name",e.target.value)}/></div>
            <div><FL label="Owner Phone"/><input className="inp" value={f.owner_phone} onChange={e=>s("owner_phone",e.target.value)}/></div>
          </FG>
          <FD><FL label="Owner ID / Passport No."/><input className="inp" value={f.owner_id} onChange={e=>s("owner_id",e.target.value)} placeholder="SA ID number or passport"/></FD>
        </div>
        <FD><FL label="Notes"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Any special instructions..." style={{minHeight:50}}/></FD>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,background:"#25D366",borderColor:"#25D366"}} onClick={handleSubmit} disabled={saving}>
            {saving?"Saving…":"📲 Send WhatsApp + Save"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function WsLicenceRenewalsPage({renewals=[], settings, wsId, onSave, onUpdate, wsLocked=false}) {
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const C = curSym(settings?.currency||getSettings().currency);

  const filtered = filter==="all" ? renewals : renewals.filter(r=>r.status===filter);
  const unpaidComm = renewals.filter(r=>r.commission_status==="unpaid"&&r.status==="completed");
  const totalComm = renewals.filter(r=>r.commission_status==="paid").reduce((s,r)=>s+(+r.commission_amount||0),0);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <div>
          <div style={{fontWeight:700,fontSize:18,marginBottom:2}}>🪪 Licence Renewals</div>
          <div style={{fontSize:13,color:"var(--text3)"}}>{renewals.length} total · {unpaidComm.length} awaiting commission</div>
        </div>
        {!wsLocked&&<button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ New Renewal Request</button>}
      </div>

      {unpaidComm.length>0&&(
        <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13}}>
          <strong style={{color:"var(--amber,#f59e0b)"}}>💰 {unpaidComm.length} completed renewal{unpaidComm.length!==1?"s":""} with unpaid commission</strong>
        </div>
      )}

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
          <div style={{fontSize:14}}>No renewal requests yet</div>
          <div style={{fontSize:12,marginTop:4}}>Click "+ New Renewal Request" to send a request to your renewal agent</div>
        </div>
      )}

      {filtered.length>0&&(
        <div className="card" style={{overflow:"auto"}}>
          <table className="tbl" style={{width:"100%",minWidth:700}}>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Owner</th>
                <th>Expiry</th>
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
                    <td>
                      <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:12}}>{r.vehicle_reg}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>{r.vehicle_make} {r.vehicle_model}</div>
                    </td>
                    <td>
                      <div style={{fontSize:13}}>{r.owner_name||"—"}</div>
                      {r.owner_phone&&<div style={{fontSize:11,color:"var(--text3)"}}>{r.owner_phone}</div>}
                    </td>
                    <td>
                      <span style={{fontSize:12,fontWeight:600,color:isExpired?"var(--red)":"var(--green)"}}>
                        {r.current_expiry||"—"} {isExpired?"⚠️":""}
                      </span>
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
                      {r.owner_phone&&(
                        <a href={`https://wa.me/${r.owner_phone.replace(/[^0-9]/g,"")}`} target="_blank" rel="noopener noreferrer">
                          <button style={{fontSize:11,padding:"3px 8px",border:"none",borderRadius:12,background:"#25D366",color:"#fff",cursor:"pointer"}}>📲</button>
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal&&(
        <LicenceRenewalModal
          job={null} vehicleRecord={null} settings={settings} wsId={wsId}
          onSave={async(rec)=>{ await onSave(rec); setShowModal(false); }}
          onClose={()=>setShowModal(false)}/>
      )}
    </div>
  );
}

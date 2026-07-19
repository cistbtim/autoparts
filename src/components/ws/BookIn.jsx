import { useState, useRef } from "react";
import { api, uploadToStorage } from "../../lib/api.js";
import { makeId, toImgUrl } from "../../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../../lib/barcode.js";
import { Overlay, MHead, FL, ImgLightbox } from "../shared.jsx";
import { VehiclePhotoUploader } from "../RfqVehicles.jsx";

// Sample framing guidance per angle — shown before capture so the job-car photo
// matches the same angle/ratio as the reference photos stored on the vehicle model.
const VIEW_INFO = {
  Front: {icon:"🚘", tip:"Stand about 3m in front of the car, centered. Keep the whole front bumper, grille and number plate inside the frame."},
  Rear:  {icon:"🚙", tip:"Stand about 3m behind the car, centered. Keep the whole rear bumper and number plate inside the frame."},
  Side:  {icon:"🚗", tip:"Stand at a right angle to the car's side. Capture the full profile, front bumper to rear bumper, with all wheels visible."},
};
const REQUIRED_VIEWS = ["Front","Rear","Side"];

export function BookInModal({wsCustomers=[],wsVehicles=[],vehicles=[],jobs=[],onSaveJob,onReopenJob,onClose,onManual=null,userCtx=null}) {
  const [step,setStep]=useState("scan");
  const [plate,setPlate]=useState("");
  const [scanLoading,setScanLoading]=useState(false);
  const [scanError,setScanError]=useState(null);
  const [scanResult,setScanResult]=useState(null);  // parsed disc data
  const [rawBarcode,setRawBarcode]=useState("");     // raw decoded text
  const [capturedImg,setCapturedImg]=useState(null);
  // lookup results
  const [foundVehicle,setFoundVehicle]=useState(null);
  const [foundCustomer,setFoundCustomer]=useState(null);
  const [openJobs,setOpenJobs]=useState([]);
  const [history,setHistory]=useState([]);
  // decision
  const [decision,setDecision]=useState("new");
  const [returnReason,setReturnReason]=useState("");
  const [reopenJobId,setReopenJobId]=useState(null);
  // VIN model cache
  const [vinCacheResult,setVinCacheResult]=useState(null); // null | {vin_prefix,make,model}
  const [vinPickLoading]=useState(false);
  const [vinPickSearch,setVinPickSearch]=useState("");
  const [vinPickSelected,setVinPickSelected]=useState(null);
  const [vinPickLightbox,setVinPickLightbox]=useState(null);
  // request-unmatched-vehicle-to-admin
  const [reqOpen,setReqOpen]=useState(false);
  const [reqSaving,setReqSaving]=useState(false);
  const [reqDone,setReqDone]=useState(false);
  const [reqForm,setReqForm]=useState({make:"",model:"",year_from:"",year_to:"",vin:"",engine_no:"",reg:"",notes:""});
  // job prefill for WorkshopJobModal
  const [jobPrefill,setJobPrefill]=useState(null);
  const [savingIntake,setSavingIntake]=useState(false);
  // photo step
  const [photoSession,setPhotoSession]=useState(null);   // {date,time} strings fixed at session start
  const [photoList,setPhotoList]=useState([]);            // [{id,dataUrl,status,url,error,view}]
  const [skippedViews,setSkippedViews]=useState([]);      // required views the user chose to skip
  const [bookInJobId,setBookInJobId]=useState(null);      // job ID for linking photos to DB
  const photoCounter=useRef(0);
  const photoCamRef=useRef(null);
  const photoGalRef=useRef(null);

  // Native file inputs — no getUserMedia, no HTTPS required
  const cameraRef=useRef(null);  // capture="environment" → opens native camera app
  const galleryRef=useRef(null); // no capture → opens file picker / gallery
  const [vinPopup,setVinPopup]=useState(false);

  // ── Upload one photo to Supabase Storage + save URL to DB ──────
  const uploadBookInPhoto=async(photoId,dataUrl,session,reg,jobId,view)=>{
    const setStatus=(s)=>setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:s}:x));
    setStatus("uploading");
    try{
      const blob=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1600; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          canvas.toBlob(b=>b?res(b):rej(new Error("toBlob failed")),"image/jpeg",0.88);
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const n=String(photoId).padStart(3,"0");
      const ts=`${session.date.replace(/-/g,"")}_${session.time.replace(/:/g,"")}`;
      const safeReg=reg.replace(/[\s/\\]/g,"_").toUpperCase();
      const path=`bookings/${safeReg}/${ts}_${n}.jpg`;
      const url=await uploadToStorage("cars_parts",path,blob);
      if(jobId) await api.insert("workshop_job_photos",{id:makeId("PH"),job_id:jobId,url,folder_path:`bookings/${safeReg}`,view:view||null}).catch(()=>{});
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"done",url}:x));
    }catch(e){
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:e.message}:x));
    }
  };

  const handlePhotoFile=(e,view=null)=>{
    const files=Array.from(e.target.files||[]);
    const fromCamera=e.target===photoCamRef.current;
    e.target.value="";
    if(!files.length) return;
    const session=photoSession;
    const reg=plate.replace(/\s/g,"").toUpperCase();
    const jid=bookInJobId;
    files.forEach(file=>{
      if(!file.type.startsWith("image/")) return;
      photoCounter.current+=1;
      const id=photoCounter.current;
      if(fromCamera){
        const bUrl=URL.createObjectURL(file);
        const a=document.createElement("a");
        a.href=bUrl; a.download=`Workshop_${reg||"photo"}_${id}.jpg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(bUrl),5000);
      }
      const fr=new FileReader();
      fr.onload=ev=>{
        const dataUrl=ev.target.result;
        setPhotoList(p=>[...p,{id,dataUrl,status:"pending",url:null,error:null,view}]);
        uploadBookInPhoto(id,dataUrl,session,reg,jid,view);
      };
      fr.readAsDataURL(file);
    });
  };

  // ── Process an image file → decode PDF417 ──────────────────────
  const processImage=async(dataUrl)=>{
    setScanLoading(true); setScanError(null); setRawBarcode(""); setScanResult(null);
    try{
      const raw=await decodePDF417fromImage(dataUrl);
      setRawBarcode(raw);
      const parsed=parseLicenceDisc(raw);
      setScanResult(parsed);
      const reg=parsed.reg?.replace(/\s/g,"").toUpperCase()||"";
      if(reg) setPlate(reg);
      setScanLoading(false);
      // Auto-proceed to lookup — pass reg directly to avoid stale state on mobile
      if(reg) doLookup(reg);
    }catch(e){
      setScanError("PDF417 not detected — try a clearer, closer photo. ("+e.message+")");
      setScanLoading(false);
    }
  };

  const handleFile=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const fr=new FileReader();
    fr.onload=ev=>{setCapturedImg(ev.target.result); processImage(ev.target.result);};
    fr.readAsDataURL(file);
    e.target.value="";
  };

  const doLookup=(regOverride)=>{
    const reg=(regOverride||plate).toUpperCase().trim();
    if(!reg){alert("Enter or scan a plate first");return;}
    const veh=wsVehicles.find(v=>(v.reg||"").toUpperCase().replace(/\s/g,"")===reg.replace(/\s/g,""));
    const cust=veh?wsCustomers.find(c=>c.id===veh.workshop_customer_id):null;
    const h=jobs.filter(j=>{
      const jr=(j.vehicle_reg||"").toUpperCase().replace(/\s/g,"");
      return jr===reg.replace(/\s/g,"")||(veh&&j.workshop_vehicle_id===veh.id);
    }).sort((a,b)=>new Date(b.date_in)-new Date(a.date_in));
    const open=h.filter(j=>j.status!=="Delivered");
    setFoundVehicle(veh||null); setFoundCustomer(cust||null);
    setHistory(h); setOpenJobs(open);
    if(open.length>0){ setDecision("reopen"); setReopenJobId(open[0].id); }
    else { setDecision("new"); }
    setStep("lookup");
  };

  const saveVinCache=async(model)=>{
    if(!scanResult?.vin||scanResult.vin.length<12) return;
    const vin_prefix=scanResult.vin.slice(0,12).toUpperCase();
    const make=foundVehicle?.make||scanResult?.make||"";
    await api.upsert("ws_vin_model_cache",{vin_prefix,make,model}).catch(()=>{});
    api.cacheInvalidate("ws_vin_model_cache");
  };

  const proceedToJob=(modelOverride="")=>{
    const prefill={
      workshop_customer_id:foundCustomer?.id||null,
      workshop_vehicle_id:foundVehicle?.id||null,
      customer_name:foundCustomer?.name||"",
      customer_phone:foundCustomer?.phone||"",
      customer_email:foundCustomer?.email||"",
      vehicle_reg:plate,
      vehicle_make:foundVehicle?.make||scanResult?.make||"",
      vehicle_model:foundVehicle?.model||modelOverride||scanResult?.model||"",
      vehicle_year:foundVehicle?.year||"",
      vehicle_color:scanResult?.color||foundVehicle?.color||"",
      vin:scanResult?.vin||foundVehicle?.vin||"",
      engine_no:scanResult?.engine_no||foundVehicle?.engine_no||"",
      licence_disc_expiry:scanResult?.expiry_date||foundVehicle?.licence_disc_expiry||"",
      mileage:"",complaint:"",diagnosis:"",mechanic:"",
      date_in:new Date().toISOString().slice(0,10),
      date_out:"",notes:"",status:"Pending",
      return_reason:openJobs.length>0?returnReason:"",
      parent_job_id:openJobs.length>0?(openJobs.find(j=>j.id===reopenJobId)||openJobs[0]).id:null,
    };
    setJobPrefill(prefill);
    setStep("intake");
  };

  const handleProceed=async()=>{
    if(openJobs.length>0&&decision==="reopen"){
      if(!returnReason.trim()){alert("Return reason required");return;}
      const ej=openJobs.find(j=>j.id===reopenJobId)||openJobs[0];
      await onReopenJob({...ej,status:"In Progress",return_reason:returnReason,date_in:new Date().toISOString().slice(0,10),mileage:ej.mileage});
      return;
    }
    if(openJobs.length>0&&decision==="new"&&!returnReason.trim()){
      alert("Return reason required when vehicle has open jobs");return;
    }
    proceedToJob();
  };

  // ── VIN model picker step ─────────────────────────────────────
  if(step==="vinpick"){
    const scannedMake=(scanResult?.make||"").toLowerCase().split(" ")[0];
    const seen=new Set();
    const sorted=[...vehicles].sort((a,b)=>{
      const ca=a.code||"",cb=b.code||"";
      if(ca&&!cb) return -1; if(!ca&&cb) return 1;
      return ca.localeCompare(cb)||a.model.localeCompare(b.model);
    });
    const sq=vinPickSearch.trim().toLowerCase();
    const modelCards=sorted.filter(v=>{
      if(!v.model) return false;
      if(scannedMake&&!(v.make||"").toLowerCase().includes(scannedMake)) return false;
      if(seen.has(v.model)) return false;
      seen.add(v.model);
      if(sq&&!`${v.model} ${v.make} ${v.code||""} ${v.variant||""}`.toLowerCase().includes(sq)) return false;
      return true;
    });

    if(vinPickLoading){
      return(
        <Overlay onClose={onClose} wide>
          <MHead title="🔍 Checking VIN…" onClose={onClose}/>
          <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>Searching global VIN database…</div>
        </Overlay>
      );
    }

    return(
      <Overlay onClose={onClose} wide>
        <MHead title="🚗 Match Vehicle Model" onClose={onClose}/>

        {/* Scanned info summary */}
        <div style={{marginBottom:16,padding:"10px 14px",background:"var(--surface2)",borderRadius:10,fontSize:13,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span>🔍 Plate: <strong>{plate}</strong></span>
          {scanResult?.make&&<span>Make: <strong>{scanResult.make}</strong></span>}
          {scanResult?.model&&<span>Model: <strong style={{color:"var(--red)"}}>{scanResult.model}</strong></span>}
          {scanResult?.vin&&<button onClick={()=>setVinPopup(true)} style={{fontFamily:"DM Mono,monospace",fontSize:11,background:"var(--surface3)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 8px",cursor:"pointer",color:"var(--text)"}}>VIN: {scanResult.vin}</button>}
        </div>

        {/* Cache hit — show suggestion */}
        {vinCacheResult&&(
          <div style={{marginBottom:16,padding:"12px 14px",background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",borderRadius:12}}>
            <div style={{fontSize:12,color:"var(--green)",fontWeight:700,marginBottom:6}}>✅ VIN Recognized — matched from previous records</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:10}}>{vinCacheResult.make} {vinCacheResult.model}</div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={()=>proceedToJob(vinCacheResult.model)}>
                ✅ Confirm — {vinCacheResult.model}
              </button>
              <button className="btn btn-ghost" onClick={()=>setVinCacheResult(null)}>
                Pick differently
              </button>
            </div>
          </div>
        )}

        {/* Gallery picker — show when no cache hit or user dismissed cache */}
        {!vinCacheResult&&(
          <>
            <div style={{marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
              <input className="inp" autoFocus value={vinPickSearch} onChange={e=>setVinPickSearch(e.target.value)}
                placeholder="Search model, code…" style={{flex:1}}/>
              {vinPickSearch&&<button className="btn btn-ghost btn-sm" onClick={()=>setVinPickSearch("")}>✕</button>}
            </div>
            {modelCards.length===0
              ? <div style={{textAlign:"center",padding:24,color:"var(--text3)",fontSize:13}}>
                  No {scanResult?.make||""} vehicles found in your records yet.<br/>
                  <span style={{fontSize:12}}>Skip and enter the model manually, or send a request to admin below.</span>
                </div>
              : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:16}}>
                  {modelCards.map(v=>{
                    const img=toImgUrl(v.photo_front||"");
                    const isSel=vinPickSelected?.id===v.id;
                    return(
                      <button key={v.id} onClick={()=>setVinPickSelected(isSel?null:v)} style={{
                        background:isSel?"rgba(249,115,22,.12)":"var(--surface2)",
                        border:`2px solid ${isSel?"var(--accent)":"var(--border)"}`,borderRadius:12,
                        padding:0,cursor:"pointer",overflow:"hidden",textAlign:"left",
                        transition:"border-color .15s,box-shadow .15s",
                      }}
                      onMouseEnter={e=>{if(!isSel){e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.boxShadow="var(--glow)";}}}
                      onMouseLeave={e=>{if(!isSel){e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.boxShadow="none";}}}>
                        {img
                          ? <img src={img} alt={v.model} style={{width:"100%",height:100,objectFit:"contain",display:"block",background:"#f5f5f5"}} onError={e=>e.target.style.display="none"}/>
                          : <div style={{width:"100%",height:100,background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>🚗</div>
                        }
                        <div style={{padding:"8px 10px"}}>
                          <div style={{fontWeight:700,fontSize:13}}>{v.model}</div>
                          {v.code&&<div style={{fontSize:11,color:"var(--accent)",fontWeight:600}}>{v.code}</div>}
                          <div style={{fontSize:11,color:"var(--text3)"}}>{v.make}</div>
                          {(v.year_from||v.year_to)&&<div style={{fontSize:11,color:"var(--blue)",marginTop:2}}>{v.year_from||"?"}{v.year_to&&v.year_to!==v.year_from?` – ${v.year_to}`:""}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
            }
            {/* Expanded preview when a card is selected */}
            {vinPickSelected&&(()=>{
              const sv=vinPickSelected;
              const photos=[sv.photo_front,sv.photo_rear,sv.photo_side].filter(Boolean).map(toImgUrl);
              const labels=["Front","Rear","Side"];
              return(
                <div style={{marginBottom:16,padding:14,background:"var(--surface)",border:"2px solid var(--accent)",borderRadius:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{sv.model}</div>
                      {sv.code&&<div style={{fontSize:12,color:"var(--accent)",fontWeight:700}}>{sv.code}</div>}
                      <div style={{fontSize:12,color:"var(--text3)"}}>{sv.make}{(sv.year_from||sv.year_to)?` · ${sv.year_from||"?"}${sv.year_to&&sv.year_to!==sv.year_from?` – ${sv.year_to}`:""}`:""}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setVinPickSelected(null)}>✕</button>
                  </div>
                  {photos.length>0
                    ? <div style={{display:"flex",gap:8,marginBottom:12}}>
                        {photos.map((p,i)=>(
                          <div key={i} style={{flex:1,cursor:"pointer",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)"}}
                            onClick={()=>setVinPickLightbox(i)}>
                            <img src={p} alt={labels[i]} style={{width:"100%",height:90,objectFit:"cover",display:"block"}} onError={e=>e.target.style.display="none"}/>
                            <div style={{fontSize:10,textAlign:"center",padding:"3px 0",color:"var(--text3)"}}>{labels[i]}</div>
                          </div>
                        ))}
                      </div>
                    : <div style={{textAlign:"center",padding:16,color:"var(--text3)",fontSize:13,marginBottom:12}}>No photos in database</div>
                  }
                  {vinPickLightbox!==null&&photos.length>0&&(
                    <ImgLightbox urls={photos} startIdx={vinPickLightbox} labels={labels} onClose={()=>setVinPickLightbox(null)}/>
                  )}
                  <div style={{display:"flex",gap:8}}>
                    <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setVinPickSelected(null)}>← Back</button>
                    <button className="btn btn-primary" style={{flex:2}} onClick={async()=>{
                      await saveVinCache(sv.model);
                      setVinPickSelected(null);
                      proceedToJob(sv.model);
                    }}>
                      ✅ Confirm — {sv.model}
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Can't match the car — send request to admin */}
        {reqDone&&<div style={{marginBottom:16,padding:"8px 12px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:8,fontSize:12,color:"var(--green)",fontWeight:600}}>✅ Vehicle request sent — admin will add it shortly.</div>}
        {!reqDone&&!reqOpen&&(
          <button className="btn btn-ghost btn-sm" style={{marginBottom:16,color:"var(--text3)"}}
            onClick={()=>{
              setReqForm({make:(scanResult?.make||"").toUpperCase(),model:vinPickSearch.toUpperCase(),year_from:"",year_to:"",vin:scanResult?.vin||"",engine_no:"",reg:plate||"",notes:""});
              setReqOpen(true);
            }}>
            🚗 Can't find the right car? Send request to admin
          </button>
        )}
        {reqOpen&&(
          <div style={{marginBottom:16,background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.25)",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)"}}>🚗 Request New Vehicle</div>
            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <input className="inp" placeholder="Make *" value={reqForm.make} onChange={e=>setReqForm(p=>({...p,make:e.target.value.toUpperCase()}))} style={{flex:"1 1 100px",textTransform:"uppercase"}}/>
              <input className="inp" placeholder="Model *" value={reqForm.model} onChange={e=>setReqForm(p=>({...p,model:e.target.value.toUpperCase()}))} style={{flex:"1 1 100px",textTransform:"uppercase"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input className="inp" placeholder="Year from *" type="number" value={reqForm.year_from} onChange={e=>setReqForm(p=>({...p,year_from:e.target.value}))} style={{flex:1}}/>
              <input className="inp" placeholder="Year to" type="number" value={reqForm.year_to} onChange={e=>setReqForm(p=>({...p,year_to:e.target.value}))} style={{flex:1}}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <input className="inp" placeholder="VIN" value={reqForm.vin} onChange={e=>setReqForm(p=>({...p,vin:e.target.value.toUpperCase()}))} style={{flex:"2 1 120px",fontFamily:"monospace",textTransform:"uppercase"}}/>
              <input className="inp" placeholder="Engine No" value={reqForm.engine_no} onChange={e=>setReqForm(p=>({...p,engine_no:e.target.value.toUpperCase()}))} style={{flex:"1 1 80px",fontFamily:"monospace",textTransform:"uppercase"}}/>
              <input className="inp" placeholder="Reg" value={reqForm.reg} onChange={e=>setReqForm(p=>({...p,reg:e.target.value.toUpperCase()}))} style={{flex:"1 1 70px",textTransform:"uppercase"}}/>
            </div>
            <input className="inp" placeholder="Notes (optional)" value={reqForm.notes} onChange={e=>setReqForm(p=>({...p,notes:e.target.value}))} style={{marginBottom:10}}/>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary btn-sm" disabled={reqSaving||!reqForm.make.trim()||!reqForm.model.trim()||!reqForm.year_from} onClick={async()=>{
                setReqSaving(true);
                try{
                  await api.insert("vehicle_requests",{
                    make:reqForm.make.trim(),model:reqForm.model.trim(),
                    year_from:reqForm.year_from?+reqForm.year_from:null,
                    year_to:reqForm.year_to?+reqForm.year_to:null,
                    vin:reqForm.vin||null,engine_no:reqForm.engine_no||null,reg:reqForm.reg||null,
                    notes:reqForm.notes||null,
                    status:"pending",requested_by:userCtx?.id||null,branch_id:null,
                  });
                  setReqDone(true);setReqOpen(false);
                }catch{}finally{setReqSaving(false);}
              }}>{reqSaving?"Sending…":"Send Request"}</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setReqOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep("lookup")}>← Back</button>
          <button className="btn btn-ghost" style={{flex:1,color:"var(--text3)"}} onClick={()=>proceedToJob()}>
            Skip →
          </button>
        </div>

        {/* VIN popup */}
        {vinPopup&&scanResult?.vin&&(
          <div onClick={()=>setVinPopup(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:14,padding:"28px 32px",minWidth:320,boxShadow:"0 8px 40px rgba(0,0,0,.35)",textAlign:"center"}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Vehicle Identification Number</div>
              <div style={{fontFamily:"DM Mono,monospace",fontSize:22,fontWeight:700,letterSpacing:2,marginBottom:20}}>{scanResult.vin}</div>
              <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setVinPopup(false)}>Close</button>
            </div>
          </div>
        )}
      </Overlay>
    );
  }

  // ── Quick intake step ─────────────────────────────────────────
  if(step==="intake"&&jobPrefill){
    const [intakeName,    setIntakeName]    = [jobPrefill.customer_name,    (v)=>setJobPrefill(p=>({...p,customer_name:v}))];
    const [intakePhone,   setIntakePhone]   = [jobPrefill.customer_phone,   (v)=>setJobPrefill(p=>({...p,customer_phone:v}))];
    const [intakeMileage, setIntakeMileage] = [jobPrefill.mileage,          (v)=>setJobPrefill(p=>({...p,mileage:v}))];
    const [intakeComplaint,setIntakeComplaint]=[jobPrefill.complaint,       (v)=>setJobPrefill(p=>({...p,complaint:v}))];
    const canSave=intakeName.trim()&&intakePhone.trim()&&intakeMileage&&intakeComplaint.trim();
    const saveIntake=async()=>{
      if(!canSave){alert("Please fill in all fields");return;}
      setSavingIntake(true);
      try{
        const jobId=await onSaveJob(jobPrefill);
        const now=new Date();
        const pad2=n=>String(n).padStart(2,"0");
        setBookInJobId(jobId||null);
        setPhotoSession({date:`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`,time:`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`});
        setPhotoList([]); photoCounter.current=0; setSkippedViews([]);
        setStep("photos");
      }catch(e){alert("Save failed: "+e.message);}
      setSavingIntake(false);
    };
    return(
      <Overlay onClose={onClose} wide>
        <MHead title="🚗 Quick Book-In" onClose={onClose}/>
        {/* Vehicle banner */}
        <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:26}}>🚗</span>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{plate}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>{[jobPrefill.vehicle_make,jobPrefill.vehicle_model,jobPrefill.vehicle_color].filter(Boolean).join(" · ")||"Vehicle"}</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1}}><FL label="Make"/><input className="inp" value={jobPrefill.vehicle_make} onChange={e=>setJobPrefill(p=>({...p,vehicle_make:e.target.value}))} placeholder="e.g. BMW"/></div>
            <div style={{flex:1}}><FL label="Model"/><input className="inp" value={jobPrefill.vehicle_model} onChange={e=>setJobPrefill(p=>({...p,vehicle_model:e.target.value}))} placeholder="e.g. F30"/></div>
          </div>
          <div><FL label="Customer Name *"/><input className="inp" autoFocus value={intakeName} onChange={e=>setIntakeName(e.target.value)} placeholder="e.g. John Smith"/></div>
          <div><FL label="Phone *"/><input className="inp" type="tel" value={intakePhone} onChange={e=>setIntakePhone(e.target.value)} placeholder="+27 82 000 0000"/></div>
          <div><FL label="Current Mileage *"/><input className="inp" type="number" min="0" value={intakeMileage} onChange={e=>setIntakeMileage(e.target.value)} placeholder="e.g. 120000"/></div>
          <div><FL label="Main Job / Customer Complaint *"/><textarea className="inp" rows={3} value={intakeComplaint} onChange={e=>setIntakeComplaint(e.target.value)} placeholder="e.g. Check engine light on, service due" style={{resize:"vertical"}}/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep("lookup")}>← Back</button>
          <button className="btn btn-primary" style={{flex:2,padding:14,fontSize:15}} onClick={saveIntake} disabled={savingIntake||!canSave}>
            {savingIntake?"Saving...":"✅ Save & Take Photos →"}
          </button>
        </div>
      </Overlay>
    );
  }

  // ── Photo capture step ───────────────────────────────────────
  if(step==="photos"&&photoSession){
    const reg=plate.replace(/\s/g,"").toUpperCase();
    const folderDisplay=`Tim_Car_Phot/${reg}/${photoSession.date}/`;
    const done=photoList.filter(p=>p.status==="done").length;
    const uploading=photoList.filter(p=>p.status==="uploading"||p.status==="pending").length;
    const hasScript=!!(
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())
    );

    // Which required angle (Front/Rear/Side) is still outstanding — drives the guided card below.
    const capturedOrSkipped=new Set([
      ...photoList.filter(p=>p.status!=="error"&&p.view).map(p=>p.view),
      ...skippedViews,
    ]);
    const nextView=REQUIRED_VIEWS.find(v=>!capturedOrSkipped.has(v))||null;

    // Sample reference photo — pulled from the matching vehicle model's own Front/Rear/Side
    // reference photos, so the job-car shot lines up with the same angle/ratio for later comparison.
    const jobMake=(jobPrefill?.vehicle_make||"").trim().toUpperCase();
    const jobModel=(jobPrefill?.vehicle_model||"").trim().toUpperCase();
    const matchedVehicle=(jobMake&&jobModel)
      ? vehicles.find(v=>(v.make||"").trim().toUpperCase()===jobMake&&(v.model||"").trim().toUpperCase()===jobModel)
      : null;
    const sampleUrl=nextView?matchedVehicle?.[`photo_${nextView.toLowerCase()}`]:null;

    return (
      <Overlay onClose={onClose} wide>
        <MHead title={`📷 Vehicle Photos — ${reg}`} onClose={onClose}/>

        {/* Job saved banner */}
        <div style={{marginBottom:14,padding:10,background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.25)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700,color:"var(--green)"}}>✅ Job card saved!</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>
            {nextView?"Take the 3 reference angles below, then add any extra photos.":"Now take any extra photos of the vehicle. Tap Done to skip."}
          </div>
        </div>

        {/* Save path info */}
        <div style={{marginBottom:12,padding:"8px 10px",background:"var(--surface2)",borderRadius:8,fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace",wordBreak:"break-all"}}>
          📁 {folderDisplay}
        </div>

        {!hasScript&&(
          <div style={{marginBottom:12,padding:10,background:"rgba(251,100,60,.08)",border:"1px solid rgba(251,100,60,.2)",borderRadius:8,fontSize:12,color:"var(--red)"}}>
            ⚙️ No Apps Script URL configured — photos will not upload to Google Drive. Set <strong>Vehicle Script URL</strong> in Settings.
          </div>
        )}

        {/* Guided angle capture — Front → Rear → Side, each with a sample + framing tip */}
        {nextView&&(
          <div style={{marginBottom:16,padding:14,background:"var(--surface2)",borderRadius:12,border:"2px solid var(--accent)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:14}}>
                📷 Angle {REQUIRED_VIEWS.indexOf(nextView)+1} of {REQUIRED_VIEWS.length} — {nextView}
              </div>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--text3)"}}
                onClick={()=>setSkippedViews(p=>[...p,nextView])}>Skip →</button>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
              <div style={{flex:"0 0 120px",textAlign:"center"}}>
                {sampleUrl
                  ? <img src={toImgUrl(sampleUrl)} alt={`Sample ${nextView}`}
                      style={{width:"100%",height:90,objectFit:"contain",borderRadius:8,background:"#f5f5f5",border:"1px solid var(--border)",display:"block"}}
                      onError={e=>e.target.style.display="none"}/>
                  : <div style={{width:"100%",height:90,borderRadius:8,background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34}}>
                      {VIEW_INFO[nextView].icon}
                    </div>
                }
                <div style={{fontSize:10,color:"var(--text3)",marginTop:4,textTransform:"uppercase",letterSpacing:".05em"}}>
                  {sampleUrl?"Sample — match this angle":"Example angle"}
                </div>
              </div>
              <div style={{flex:1,fontSize:12,color:"var(--text3)",lineHeight:1.5}}>{VIEW_INFO[nextView].tip}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button className="btn btn-primary" style={{padding:14,flexDirection:"column",display:"flex",alignItems:"center",gap:4,fontSize:13}}
                onClick={()=>photoCamRef.current?.click()}>
                <span style={{fontSize:22}}>📷</span>
                Take {nextView} Photo
              </button>
              <button className="btn btn-ghost" style={{padding:14,flexDirection:"column",display:"flex",alignItems:"center",gap:4,fontSize:13}}
                onClick={()=>photoGalRef.current?.click()}>
                <span style={{fontSize:22}}>🖼️</span>
                Gallery
              </button>
            </div>
          </div>
        )}

        {/* Extra photos — free-form, once the 3 required angles are captured or skipped */}
        {!nextView&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <button className="btn btn-primary" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>photoCamRef.current?.click()}>
              <span style={{fontSize:26}}>📷</span>
              Take Extra Photo
            </button>
            <button className="btn btn-ghost" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>photoGalRef.current?.click()}>
              <span style={{fontSize:26}}>🖼️</span>
              Gallery
            </button>
          </div>
        )}

        <input ref={photoCamRef} type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={e=>handlePhotoFile(e,nextView)}/>
        <input ref={photoGalRef} type="file" multiple style={{display:"none"}} onChange={e=>handlePhotoFile(e,nextView)}/>

        {/* Photo grid */}
        {photoList.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",marginBottom:8}}>
              {photoList.length} photo{photoList.length!==1?"s":""} — {done} uploaded{uploading>0?`, ${uploading} in progress`:""}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8}}>
              {photoList.map(p=>(
                <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3"}}>
                  <img src={p.dataUrl} alt={`photo ${p.id}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  {p.view&&(
                    <div style={{position:"absolute",top:3,left:3,fontSize:9,fontWeight:700,color:"#fff",background:"rgba(0,0,0,.55)",borderRadius:4,padding:"1px 5px"}}>{p.view}</div>
                  )}
                  {/* Status overlay */}
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                    background:p.status==="done"?"rgba(0,0,0,0)":p.status==="error"?"rgba(200,30,30,.5)":"rgba(0,0,0,.45)"}}>
                    {(p.status==="pending"||p.status==="uploading")&&(
                      <div style={{width:18,height:18,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",
                        borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                    )}
                    {p.status==="done"&&(
                      <div style={{position:"absolute",top:3,right:5,fontSize:14}}>✅</div>
                    )}
                    {p.status==="error"&&(
                      <div style={{fontSize:10,color:"#fff",textAlign:"center",padding:4}}>❌<br/>{(p.error||"").slice(0,30)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {photoList.length===0&&(
          <div style={{textAlign:"center",padding:"24px 0",color:"var(--text3)",fontSize:13}}>
            No photos yet — tap <strong>Take {nextView||""} Photo</strong> to start
          </div>
        )}

        <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,fontWeight:700,marginTop:4}}
          onClick={onClose} disabled={uploading>0}>
          {uploading>0?`⏳ Uploading ${uploading} photo${uploading!==1?"s":""}...`:`✅ Done${done>0?` (${done} photo${done!==1?"s":""} saved)`:""}`}
        </button>
      </Overlay>
    );
  }

  // ── Scan step ────────────────────────────────────────────────
  if(step==="scan"){
    return (
      <Overlay onClose={onClose} wide>
        <MHead title="📷 Book In Car" onClose={onClose}
          actions={onManual&&<button className="btn btn-ghost btn-sm" title="Type the job in by hand — no photo/scan" onClick={onManual}>📝 Manual</button>}/>

        {/* Camera or file capture — native file inputs, no getUserMedia, works on HTTP/mobile */}
        {!capturedImg&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
            <button className="btn btn-ghost" style={{padding:20,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>cameraRef.current?.click()}>
              <span style={{fontSize:28}}>📷</span>
              Take Photo
            </button>
            <button className="btn btn-ghost" style={{padding:20,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>galleryRef.current?.click()}>
              <span style={{fontSize:28}}>🖼️</span>
              Choose Photo
            </button>
            {/* capture="environment" opens rear camera directly on mobile */}
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
            <input ref={galleryRef} type="file" style={{display:"none"}} onChange={handleFile}/>
          </div>
        )}

        {/* Captured image + scan result */}
        {capturedImg&&(
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <img src={capturedImg} alt="disc" style={{width:120,height:90,objectFit:"cover",borderRadius:8,border:"1px solid var(--border)",flexShrink:0}}/>
              <div style={{flex:1}}>
                {scanLoading&&<div style={{color:"var(--blue)",fontSize:13}}>🔍 Reading barcode...</div>}
                {scanError&&<div style={{color:"var(--red)",fontSize:12}}>⚠️ {scanError}</div>}
                {rawBarcode&&!scanLoading&&(
                  <div style={{fontSize:12,lineHeight:1.7}}>
                    <div style={{color:"var(--green)",fontWeight:600,marginBottom:4}}>✓ Barcode decoded</div>
                    {scanResult?.reg&&<div><strong>Plate:</strong> <code style={{fontFamily:"DM Mono,monospace",fontWeight:700}}>{scanResult.reg}</code></div>}
                    {scanResult?.make&&<div><strong>Make:</strong> {scanResult.make}</div>}
                    {scanResult?.model&&<div><strong>Model:</strong> {scanResult.model}</div>}
                    {scanResult?.color&&<div><strong>Color:</strong> {scanResult.color}</div>}
                    {scanResult?.vin&&<div><strong>VIN:</strong> <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{scanResult.vin}</code></div>}
                    {scanResult?.engine_no&&<div><strong>Engine:</strong> <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{scanResult.engine_no}</code></div>}
                    {scanResult?.expiry_date&&<div><strong>Disc Expiry:</strong> <span style={{color:new Date(scanResult.expiry_date)<new Date()?"var(--red)":"var(--green)"}}>{scanResult.expiry_date}</span></div>}
                    {/* Raw text — always shown so we can diagnose format issues */}
                    <details style={{marginTop:6}}>
                      <summary style={{cursor:"pointer",color:"var(--text3)",fontSize:11}}>Raw barcode text</summary>
                      <pre style={{fontSize:10,background:"var(--bg2)",padding:6,borderRadius:6,marginTop:4,whiteSpace:"pre-wrap",wordBreak:"break-all",maxHeight:100,overflow:"auto"}}>{rawBarcode}</pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>{setCapturedImg(null);setScanResult(null);setPlate("");}}>↺ Rescan</button>
          </div>
        )}

        {/* Manual plate input */}
        <div style={{marginBottom:14}}>
          <FL label="Plate / Registration Number"/>
          <div style={{display:"flex",gap:8}}>
            <input className="inp" value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&doLookup()}
              placeholder="JNJ808L" style={{fontFamily:"DM Mono,monospace",fontWeight:700,letterSpacing:".06em",fontSize:16,flex:1}}/>
            <button className="btn btn-primary" onClick={()=>doLookup()} disabled={!plate.trim()}>🔍 Look Up</button>
          </div>
        </div>

        {scanResult&&plate&&(
          <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15}} onClick={()=>doLookup()}>
            🔍 Look Up {plate}
          </button>
        )}

        {/* VIN popup */}
        {vinPopup&&scanResult?.vin&&(
          <div onClick={()=>setVinPopup(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:14,padding:"28px 32px",minWidth:320,boxShadow:"0 8px 40px rgba(0,0,0,.35)",textAlign:"center"}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Vehicle Identification Number</div>
              <div style={{fontFamily:"DM Mono,monospace",fontSize:22,fontWeight:700,letterSpacing:2,marginBottom:20}}>{scanResult.vin}</div>
              <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setVinPopup(false)}>Close</button>
            </div>
          </div>
        )}
      </Overlay>
    );
  }

  // ── Lookup + decision step ───────────────────────────────────
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🔍 ${plate}`} onClose={onClose}/>

      {/* Scan result summary */}
      {scanResult&&(
        <div style={{marginBottom:14,padding:10,background:"var(--surface2)",borderRadius:10,fontSize:12,display:"flex",gap:16,flexWrap:"wrap"}}>
          {scanResult.make&&<span>Make: <strong>{scanResult.make}</strong></span>}
          {scanResult.model&&<span>Model: <strong style={{color:"var(--red)"}}>{scanResult.model}</strong></span>}
          {scanResult.vin&&<button onClick={()=>setVinPopup(true)} style={{fontFamily:"DM Mono,monospace",fontSize:12,background:"var(--surface3)",border:"1px solid var(--border)",borderRadius:6,padding:"2px 8px",cursor:"pointer",color:"var(--text)"}}>VIN: {scanResult.vin}</button>}
          {scanResult.engine_no&&<span>Engine: <code style={{fontFamily:"DM Mono,monospace"}}>{scanResult.engine_no}</code></span>}
          {scanResult.expiry_date&&<span style={{color:new Date(scanResult.expiry_date)<new Date()?"var(--red)":"var(--green)"}}>
            Disc: {scanResult.expiry_date} {new Date(scanResult.expiry_date)<new Date()?"⚠️ EXPIRED":"✅"}
          </span>}
        </div>
      )}

      {/* Customer / vehicle info */}
      {foundCustomer&&(
        <div style={{marginBottom:12,padding:12,background:"rgba(52,211,153,.07)",border:"1px solid rgba(52,211,153,.2)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:14}}>👤 {foundCustomer.name}</div>
          {foundCustomer.phone&&<div style={{fontSize:12,color:"var(--text3)"}}>{foundCustomer.phone}</div>}
        </div>
      )}
      {foundVehicle&&(
        <div style={{marginBottom:12,padding:12,background:"rgba(96,165,250,.07)",border:"1px solid rgba(96,165,250,.2)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700}}>🚗 {foundVehicle.reg} — {foundVehicle.make} {foundVehicle.model} {foundVehicle.year&&`(${foundVehicle.year})`}</div>
          {foundVehicle.color&&<div style={{fontSize:12,color:"var(--text3)"}}>{foundVehicle.color}</div>}
          {foundVehicle.vin&&<div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>VIN: {foundVehicle.vin}</div>}
        </div>
      )}
      {!foundCustomer&&!foundVehicle&&(
        <div style={{marginBottom:12,padding:12,background:"var(--surface2)",borderRadius:10,fontSize:13,color:"var(--text3)"}}>
          🆕 First visit — no record found for <strong>{plate}</strong>
        </div>
      )}

      {/* Open jobs warning */}
      {openJobs.length>0&&(
        <div style={{marginBottom:14,padding:12,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,marginBottom:6}}>⚠️ {openJobs.length} open job(s) for this vehicle</div>
          {openJobs.map(j=>(
            <div key={j.id} style={{fontSize:12,marginBottom:3}}>
              <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code>
              <span style={{marginLeft:6,color:"var(--yellow)"}}>{j.status}</span>
              <span style={{marginLeft:6,color:"var(--text3)"}}>{j.date_in}</span>
              {j.complaint&&<span style={{marginLeft:6,color:"var(--text2)"}}>"{j.complaint.slice(0,40)}"</span>}
            </div>
          ))}

          <div style={{marginTop:10}}>
            <FL label="What to do?"/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button className={`btn ${decision==="reopen"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setDecision("reopen")}>🔄 Continue Existing</button>
              <button className={`btn ${decision==="new"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setDecision("new")}>📋 New Job Card</button>
            </div>
            {decision==="reopen"&&openJobs.length>1&&(
              <div style={{marginBottom:10}}>
                {openJobs.map(j=>(
                  <label key={j.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:8,marginBottom:5,cursor:"pointer"}}>
                    <input type="radio" name="reopenJob" checked={reopenJobId===j.id} onChange={()=>setReopenJobId(j.id)}/>
                    <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                    <span style={{fontSize:11,color:"var(--text3)"}}>{j.status} · {j.date_in}</span>
                  </label>
                ))}
              </div>
            )}
            <FL label="Return / Visit Reason *"/>
            <textarea className="inp" value={returnReason} onChange={e=>setReturnReason(e.target.value)}
              placeholder="e.g. Same issue recurred, warranty claim, additional work requested..."
              style={{minHeight:60}}/>
          </div>
        </div>
      )}

      {/* Service record summary — auto-expanded */}
      {history.length>0&&(
        <div style={{marginBottom:14,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
            <div style={{fontWeight:700,fontSize:13}}>📋 Service Record — {history.length} visit{history.length!==1?"s":""}</div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Most recent first</div>
          </div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {history.map((j,i)=>(
              <div key={j.id} style={{padding:"10px 14px",borderBottom:i<history.length-1?"1px solid var(--border)":undefined,background:j.status==="Delivered"?"transparent":"rgba(251,191,36,.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:4}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"var(--text1)"}}>{j.date_in}</span>
                    {j.mileage&&<span style={{fontSize:11,color:"var(--text3)"}}>🛣️ {Number(j.mileage).toLocaleString()} km</span>}
                    {j.mechanic&&<span style={{fontSize:11,color:"var(--text3)"}}>👷 {j.mechanic}</span>}
                  </div>
                  <span className="badge" style={{fontSize:10,flexShrink:0}}>{j.status}</span>
                </div>
                {j.complaint&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:j.diagnosis?3:0}}>🔧 {j.complaint.slice(0,80)}{j.complaint.length>80?"…":""}</div>}
                {j.diagnosis&&<div style={{fontSize:11,color:"var(--text3)"}}>🔬 {j.diagnosis.slice(0,80)}{j.diagnosis.length>80?"…":""}</div>}
                {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginTop:2}}>🔄 Return: {j.return_reason.slice(0,60)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" onClick={()=>setStep("scan")}>← Back</button>
        <button className="btn btn-primary" style={{flex:1,padding:14,fontSize:15,fontWeight:700}} onClick={handleProceed}>
          {openJobs.length>0&&decision==="reopen" ? "🔄 Reopen Job" : "📋 Create New Job →"}
        </button>
      </div>

      {/* VIN popup */}
      {vinPopup&&scanResult?.vin&&(
        <div onClick={()=>setVinPopup(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:14,padding:"28px 32px",minWidth:320,boxShadow:"0 8px 40px rgba(0,0,0,.35)",textAlign:"center"}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Vehicle Identification Number</div>
            <div style={{fontFamily:"DM Mono,monospace",fontSize:22,fontWeight:700,letterSpacing:2,marginBottom:20}}>{scanResult.vin}</div>
            <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>setVinPopup(false)}>Close</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

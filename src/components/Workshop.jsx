import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { api, SUPABASE_URL, SUPABASE_KEY } from "../lib/api.js";
import { getSettings, C, curSym, updateSettings } from "../lib/settings.js";
import { fmtAmt, makeId, today, toImgUrl, toFullUrl, toSaveUrl, waLink, extractDriveId } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";
import { tSt } from "../lib/i18n.js";
import { CSS } from "../styles.js";
import { ErrorBoundary, LogoSVG, ShopLogo, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "../components/shared.jsx";
import { VehiclePhotoUploader } from "./RfqVehicles.jsx";

function BookInModal({wsCustomers=[],wsVehicles=[],jobs=[],settings,onSaveJob,onReopenJob,onClose,t}) {
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
  // job prefill for WorkshopJobModal
  const [jobPrefill,setJobPrefill]=useState(null);
  // photo step
  const [photoSession,setPhotoSession]=useState(null);   // {date,time} strings fixed at session start
  const [photoList,setPhotoList]=useState([]);            // [{id,dataUrl,status,url,error}]
  const [bookInJobId,setBookInJobId]=useState(null);      // job ID for linking photos to DB
  const photoCounter=useRef(0);
  const photoCamRef=useRef(null);
  const photoGalRef=useRef(null);

  // Native file inputs — no getUserMedia, no HTTPS required
  const cameraRef=useRef(null);  // capture="environment" → opens native camera app
  const galleryRef=useRef(null); // no capture → opens file picker / gallery

  // ── Upload one photo to Google Drive + save URL to DB ─────────
  const uploadBookInPhoto=async(photoId,dataUrl,session,reg,jobId)=>{
    const SCRIPT_URL=
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    if(!SCRIPT_URL){
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:"No script URL — set Vehicle Script URL in Settings"}:x));
      return;
    }
    const setStatus=(s)=>setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:s}:x));
    setStatus("uploading");
    try{
      // resize to max 1600px
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1600;
          const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.88));
        };
        img.onerror=rej;
        img.src=dataUrl;
      });
      const folderPath=`Tim_Car_Phot/${reg}/${session.date}`;
      const n=String(photoId).padStart(3,"0");
      const filename=`${session.date.replace(/-/g,"")}_${session.time.replace(/-/g,"")}_${n}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      if(result.success){
        // Save URL to DB linked to this job
        if(jobId) await api.insert("workshop_job_photos",{id:makeId("PH"),job_id:jobId,url:result.url,folder_path:folderPath}).catch(()=>{});
        setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"done",url:result.url}:x));
      } else {
        setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:result.error||"Upload failed"}:x));
      }
    }catch(e){
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:e.message}:x));
    }
  };

  const handlePhotoFile=(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value="";
    if(!files.length) return;
    const session=photoSession;
    const reg=plate.replace(/\s/g,"").toUpperCase();
    const jid=bookInJobId;
    files.forEach(file=>{
      if(!file.type.startsWith("image/")) return;
      photoCounter.current+=1;
      const id=photoCounter.current;
      const fr=new FileReader();
      fr.onload=ev=>{
        const dataUrl=ev.target.result;
        setPhotoList(p=>[...p,{id,dataUrl,status:"pending",url:null,error:null}]);
        uploadBookInPhoto(id,dataUrl,session,reg,jid);
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

  const proceedToJob=()=>{
    const prefill={
      workshop_customer_id:foundCustomer?.id||null,
      workshop_vehicle_id:foundVehicle?.id||null,
      customer_name:foundCustomer?.name||"",
      customer_phone:foundCustomer?.phone||"",
      customer_email:foundCustomer?.email||"",
      vehicle_reg:plate,
      vehicle_make:scanResult?.make||foundVehicle?.make||"",
      vehicle_model:scanResult?.model||foundVehicle?.model||"",
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

  // ── Quick intake step ─────────────────────────────────────────
  if(step==="intake"&&jobPrefill){
    const [intakeName,    setIntakeName]    = [jobPrefill.customer_name,    (v)=>setJobPrefill(p=>({...p,customer_name:v}))];
    const [intakePhone,   setIntakePhone]   = [jobPrefill.customer_phone,   (v)=>setJobPrefill(p=>({...p,customer_phone:v}))];
    const [intakeMileage, setIntakeMileage] = [jobPrefill.mileage,          (v)=>setJobPrefill(p=>({...p,mileage:v}))];
    const [intakeComplaint,setIntakeComplaint]=[jobPrefill.complaint,       (v)=>setJobPrefill(p=>({...p,complaint:v}))];
    const canSave=intakeName.trim()&&intakePhone.trim()&&intakeMileage&&intakeComplaint.trim();
    const [savingIntake,setSavingIntake]=useState(false);
    const saveIntake=async()=>{
      if(!canSave){alert("Please fill in all fields");return;}
      setSavingIntake(true);
      try{
        const jobId=await onSaveJob(jobPrefill);
        const now=new Date();
        const pad2=n=>String(n).padStart(2,"0");
        setBookInJobId(jobId||null);
        setPhotoSession({date:`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`,time:`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`});
        setPhotoList([]); photoCounter.current=0;
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
    return (
      <Overlay onClose={onClose} wide>
        <MHead title={`📷 Vehicle Photos — ${reg}`} onClose={onClose}/>

        {/* Job saved banner */}
        <div style={{marginBottom:14,padding:10,background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.25)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700,color:"var(--green)"}}>✅ Job card saved!</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Now take photos of the vehicle. Tap Done to skip.</div>
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

        {/* Camera / gallery buttons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <button className="btn btn-primary" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
            onClick={()=>photoCamRef.current?.click()}>
            <span style={{fontSize:26}}>📷</span>
            Take Photo
          </button>
          <button className="btn btn-ghost" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
            onClick={()=>photoGalRef.current?.click()}>
            <span style={{fontSize:26}}>🖼️</span>
            Gallery
          </button>
          <input ref={photoCamRef} type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={handlePhotoFile}/>
          <input ref={photoGalRef} type="file" multiple style={{display:"none"}} onChange={handlePhotoFile}/>
        </div>

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
            No photos yet — tap <strong>Take Photo</strong> to start
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
        <MHead title="📷 Book In Car" onClose={onClose}/>

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
          {scanResult.vin&&<span>VIN: <code style={{fontFamily:"DM Mono,monospace"}}>{scanResult.vin}</code></span>}
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

      {/* Service history (collapsed) */}
      {history.length>0&&(
        <details style={{marginBottom:14}}>
          <summary style={{cursor:"pointer",fontSize:13,color:"var(--text3)",padding:"8px 0"}}>📋 Service history — {history.length} jobs</summary>
          <div style={{marginTop:8}}>
            {history.map(j=>(
              <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                <div>
                  <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                  <span style={{marginLeft:8,color:"var(--text2)"}}>{j.complaint?.slice(0,40)||"—"}</span>
                  {j.return_reason&&<span style={{marginLeft:8,color:"var(--yellow)",fontSize:11}}>🔄{j.return_reason.slice(0,30)}</span>}
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <span style={{color:"var(--text3)"}}>{j.date_in}</span>
                  <span className="badge" style={{fontSize:10}}>{j.status}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" onClick={()=>setStep("scan")}>← Back</button>
        <button className="btn btn-primary" style={{flex:1,padding:14,fontSize:15,fontWeight:700}} onClick={handleProceed}>
          {openJobs.length>0&&decision==="reopen" ? "🔄 Reopen Job" : "📋 Create New Job →"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════════════
function WsCustomersPage({wsCustomers=[],wsVehicles=[],jobs=[],onSaveCustomer,onDeleteCustomer,onSaveVehicle,onDeleteVehicle,onOpenJob,t,lang}) {
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
  },[activeCust?.id]);

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
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditCust(activeCust)}>✏️ Edit</button>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete customer?")){ await onDeleteCustomer(activeCust.id); setView("list"); setActiveCust(null); }}}>🗑️</button>
        </div>

        {/* Vehicles */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🚗 Vehicles ({custVehicles.length})</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditVehicle({workshop_customer_id:activeCust.id,reg:"",make:"",model:"",year:"",color:"",notes:""})}>+ {t.wsAddVehicle}</button>
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
                    <button className="btn btn-ghost btn-xs" onClick={()=>setEditVehicle(v)}>✏️</button>
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete vehicle?")) await onDeleteVehicle(v.id);}}>✕</button>
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
        <button className="btn btn-primary" onClick={()=>setEditCust({name:"",phone:"",email:"",notes:""})}>+ {t.wsNewCustomer}</button>
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
            onClose={()=>setEditVehicle(null)} t={t}/>
        </Overlay>
      )}
    </div>
  );
}

function WsCustomerForm({data,onSave,onClose,t}) {
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

function WsVehicleForm({data,onSave,onClose,t}) {
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
                onChange={url=>s(key,url)}/>
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

// ═══════════════════════════════════════════════════════════════
// LICENCE RENEWAL MODAL
// ═══════════════════════════════════════════════════════════════
function LicenceRenewalModal({job, vehicleRecord, settings, wsId, onSave, onClose}) {
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

// ═══════════════════════════════════════════════════════════════
// WS LICENCE RENEWALS PAGE
// ═══════════════════════════════════════════════════════════════
function WsLicenceRenewalsPage({renewals=[], settings, wsId, onSave, onUpdate}) {
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
        <button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ New Renewal Request</button>
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

// ═══════════════════════════════════════════════════════════════
// WORKSHOP PAGE
// ═══════════════════════════════════════════════════════════════
export function WorkshopPage({jobs,jobItems,invoices,quotes=[],parts=[],partFitments=[],vehicles=[],customers,wsCustomers=[],wsVehicles=[],wsStock=[],wsServices=[],wsSuppliers=[],wsSupplierRequests=[],wsSupplierQuotes=[],wsSupplierInvoices=[],wsSupplierInvItems=[],wsSupplierPayments=[],wsSupplierReturns=[],wsDocs=[],settings,initialTab,onSaveJob,onDeleteJob,onMoveJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,suppliers=[],onSaveWsCustomer,onDeleteWsCustomer,onSaveWsVehicle,onDeleteWsVehicle,onSaveWsStock,onDeleteWsStock,onAdjustWsStock,onSaveWsService,onDeleteWsService,onSaveWsSupplier,onDeleteWsSupplier,onSaveWsSupplierRequest,onDeleteWsSupplierRequest,onSaveWsSupplierQuote,onSaveWsSupplierInvoice,onDeleteWsSupplierInvoice,onSaveWsSupplierPayment,onDeleteWsSupplierPayment,onSaveWsSupplierReturn,onSaveWsTransfer,onSaveWsDoc,onDeleteWsDoc,wsRole="main",wsId=null,wsProfiles=[],wsSqReplies=[],wsPurchaseOrders=[],wsPoItems=[],onGenerateWsQuoteLink,onSaveWsPurchaseOrder,onDeleteWsPurchaseOrder,onReceiveWsPurchaseOrder,wsLicenceRenewals=[],onSaveWsLicenceRenewal,onUpdateWsLicenceRenewal,wsProfile={},t,lang}) {
  const [view,           setView]           = useState("list");
  const [activeJob,      setActiveJob]      = useState(null);
  const [editJob,        setEditJob]        = useState(null);
  const [filterSt,       setFilterSt]       = useState("__all__");
  const [search,         setSearch]         = useState("");
  const [bookIn,         setBookIn]         = useState(false);
  const [wsTab,          setWsTab]          = useState(initialTab||"jobs");
  const [stmtCust,       setStmtCust]       = useState("");
  const [qInvModal,      setQInvModal]      = useState(null);
  const [sortBy,         setSortBy]         = useState("date_desc");
  const [pendingViewPoId,setPendingViewPoId] = useState(null);
  const [filterWs,      setFilterWs]      = useState("__all__");
  const [filterCity,    setFilterCity]    = useState("__all__");
  const [filterCountry, setFilterCountry] = useState("__all__");
  const [jobPage,   setJobPage]   = useState(0);
  const JOB_PAGE_SIZE = typeof window!=="undefined"&&window.innerWidth<=767 ? 5 : 20;

  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};
  const ST_BG    = {"Pending":"rgba(96,165,250,.12)","In Progress":"rgba(251,191,36,.12)","Done":"rgba(52,211,153,.12)","Delivered":"rgba(100,116,139,.12)"};

  const wsProfileMap  = Object.fromEntries(wsProfiles.map(p=>[p.id, p.name||p.id]));
  const wsProfileMap2 = Object.fromEntries(wsProfiles.map(p=>[p.id, p]));
  const wsCities      = [...new Set(wsProfiles.map(p=>p.city).filter(Boolean))].sort();
  const wsCountries   = [...new Set(wsProfiles.map(p=>p.country).filter(Boolean))].sort();

  const filtered = jobs.filter(j=>{
    if(filterSt!=="__all__"&&j.status!==filterSt) return false;
    if(filterWs!=="__all__"&&j.workshop_id!==filterWs) return false;
    if(filterCity!=="__all__"){const p=wsProfileMap2[j.workshop_id];if(!p||p.city!==filterCity) return false;}
    if(filterCountry!=="__all__"){const p=wsProfileMap2[j.workshop_id];if(!p||p.country!==filterCountry) return false;}
    if(!search.trim()) return true;
    const s=search.toLowerCase();
    const wsName=wsProfileMap[j.workshop_id]||j.workshop_id||"";
    return `${j.customer_name} ${j.vehicle_reg} ${j.vehicle_make} ${j.vehicle_model} ${j.id} ${wsName}`.toLowerCase().includes(s);
  }).sort((a,b)=>{
    if(sortBy==="date_asc")  return (a.date_in||"").localeCompare(b.date_in||"");
    if(sortBy==="date_desc") return (b.date_in||"").localeCompare(a.date_in||"");
    if(sortBy==="customer")  return (a.customer_name||"").localeCompare(b.customer_name||"");
    if(sortBy==="job_id")    return a.id.localeCompare(b.id);
    if(sortBy==="make")      return `${a.vehicle_make||""} ${a.vehicle_model||""}`.localeCompare(`${b.vehicle_make||""} ${b.vehicle_model||""}`);
    return 0;
  });

  useEffect(()=>{ setJobPage(0); },[filterSt,search,sortBy,filterWs,filterCity,filterCountry]);

  const jobInvoice = (jobId) => invoices.find(i=>i.job_id===jobId);
  const jobQuote   = (jobId) => quotes.find(q=>q.job_id===jobId);

  const C   = curSym(settings.currency||getSettings().currency);
  const fmt = v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  // ── Job detail view ──────────────────────────────────────────
  if(view==="job"&&activeJob){
    const items = jobItems.filter(i=>i.job_id===activeJob.id);
    const inv   = jobInvoice(activeJob.id);
    const quote = jobQuote(activeJob.id);
    return (
      <WorkshopJobDetail
        job={activeJob} items={items} invoice={inv} quote={quote}
        parts={parts} partFitments={partFitments} vehicles={vehicles} settings={settings}
        wsVehicles={wsVehicles} wsCustomers={wsCustomers} wsStock={wsStock} wsServices={wsServices}
        suppliers={suppliers} wsSuppliers={wsSuppliers} wsSupplierRequests={wsSupplierRequests}
        wsSupplierQuotes={wsSupplierQuotes}
        wsPurchaseOrders={wsPurchaseOrders.filter(p=>p.job_id===activeJob.id)}
        onSaveWsSupplierRequest={onSaveWsSupplierRequest}
        onDeleteWsSupplierRequest={onDeleteWsSupplierRequest}
        onSaveWsSupplierQuote={onSaveWsSupplierQuote}
        onSaveWsStock={onSaveWsStock}
        onBack={()=>{ setView("list"); setActiveJob(null); }}
        onSaveJob={async(d)=>{ await onSaveJob(d); setActiveJob({...activeJob,...d}); }}
        onDeleteJob={async()=>{ await onDeleteJob(activeJob.id); setView("list"); setActiveJob(null); }}
        onMoveJob={async(targetWsId)=>{ await onMoveJob(activeJob.id,targetWsId); setView("list"); setActiveJob(null); }}
        onSaveItem={onSaveItem} onDeleteItem={onDeleteItem}
        onSaveInvoice={onSaveInvoice} onUpdateInvoice={onUpdateInvoice} onDeleteInvoice={onDeleteInvoice}
        onSaveQuote={onSaveQuote} onDeleteQuote={onDeleteQuote} onConvertQuoteToInvoice={onConvertQuoteToInvoice}
        onSendQuoteForApproval={onSendQuoteForApproval}
        onSaveWsVehicle={onSaveWsVehicle}
        wsRole={wsRole}
        sqReplies={wsSqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===activeJob.id))}
        onGenerateWsQuoteLink={onGenerateWsQuoteLink}
        onSaveWsPurchaseOrder={onSaveWsPurchaseOrder}
        onViewPurchaseOrders={()=>{ setView("list"); setWsTab("wssuporders"); }}
        onViewPO={(poId)=>{ setPendingViewPoId(poId); setView("list"); setWsTab("wssuporders"); }}
        onSaveWsLicenceRenewal={onSaveWsLicenceRenewal}
        wsId={wsId}
        wsProfile={wsProfile}
        t={t} lang={lang}/>
    );
  }

  // ── Sub-nav tabs ─────────────────────────────────────────────
  const quoteResponses = quotes.filter(q=>q.confirm_status==="confirmed"||q.confirm_status==="declined").length;
  const WS_TABS = wsRole==="mechanic" ? [
    ["jobs",       "🔧 Jobs",        jobs.length],
  ] : [
    ["jobs",       "🔧 Jobs",        jobs.length],
    ["customers",  "👥 Customers",   wsCustomers.length],
    ["quotations", quoteResponses>0?`📝 Quotations 🔔`:"📝 Quotations",  quotes.length],
    ["invoices",   "🧾 Invoices",    invoices.length],
    ["payments",   "💳 Payments",    invoices.filter(i=>(+i.paid_amount||0)>0).length],
    ["wsstock",      "📦 WS Stock",    wsStock.length],
    ["wsservices",   "🔧 Services",    wsServices.length],
    ["wssuppliers",  "🏪 Suppliers",   wsSuppliers.length],
    ["wssuporders",  "📋 Purchase Orders", wsPurchaseOrders.length],
    ["wssupinv",     "🧾 Supplier Inv",wsSupplierInvoices.length],
    ["wstransfer",   "🔄 Transfer",    null],
    ["wsdocs",     "📎 Documents",   wsDocs.length],
    ["wslicencerenewal", "🪪 Licence Renewals", wsLicenceRenewals.length||null],
    ["statement",  "📋 Statement",   null],
    ["report",     "📊 Report",      null],
  ];

  // ── Report stats ─────────────────────────────────────────────
  const totalInvoiced  = invoices.reduce((s,i)=>s+(+i.total||0),0);
  const totalPaid      = invoices.reduce((s,i)=>s+(+i.paid_amount||0),0);
  const totalOutstanding = totalInvoiced - totalPaid;
  const totalQuoted    = quotes.filter(q=>q.status!=="converted").reduce((s,q)=>s+(+q.total||0),0);

  return (
    <div className="fu">
      {/* ── Page header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🔧 {t.workshop||"Workshop"}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:2}}>
            {jobs.length} jobs · {jobs.filter(j=>j.status==="In Progress").length} in progress · {invoices.filter(i=>i.status!=="paid").length} unpaid invoices
          </p>
        </div>
        {wsTab==="jobs"&&(
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" style={{fontSize:14,padding:"9px 18px"}} onClick={()=>setBookIn(true)}>📷 Book In Car</button>
            <button className="btn btn-ghost" onClick={()=>setEditJob({
              customer_name:"",customer_phone:"",vehicle_reg:"",vehicle_make:"",
              vehicle_model:"",vehicle_year:"",vehicle_color:"",vin:"",engine_no:"",mileage:"",
              complaint:"",diagnosis:"",mechanic:"",date_in:new Date().toISOString().slice(0,10),
              date_out:"",notes:"",status:"Pending"
            })}>+ Manual</button>
          </div>
        )}
      </div>

      {/* ── Sub-navigation ── */}
      <div className="hide-mobile" style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:18,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
        {WS_TABS.map(([v,label,cnt])=>(
          <button key={v} onClick={()=>setWsTab(v)} style={{
            padding:"8px 14px",border:"none",background:"none",cursor:"pointer",
            fontSize:13,fontWeight:wsTab===v?700:400,
            color:wsTab===v?"var(--accent)":"var(--text2)",
            borderBottom:wsTab===v?"2px solid var(--accent)":"2px solid transparent",
            marginBottom:-1,whiteSpace:"nowrap",
          }}>
            {label}{cnt!==null&&<span style={{marginLeft:5,opacity:.55,fontSize:11,fontWeight:400}}>{cnt}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════ JOBS TAB ══════════════ */}
      {wsTab==="jobs"&&(<>
        <div className="tabs" style={{marginBottom:14,width:"fit-content",maxWidth:"100%",flexWrap:"wrap"}}>
          {[["__all__","All"],["Pending","🔵 Pending"],["In Progress","🟡 In Progress"],["Done","🟢 Done"],["Delivered","⚫ Delivered"]].map(([v,l])=>{
            const cnt=v==="__all__"?jobs.length:jobs.filter(j=>j.status===v).length;
            return <button key={v} className={`tab ${filterSt===v?"on":""}`} onClick={()=>setFilterSt(v)}>{l} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;
          })}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 220px",maxWidth:320}}>
            <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, plate..."/>
            {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
          </div>
          <select className="inp" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{flex:"0 0 auto",width:"auto",minWidth:160}}>
            <option value="date_desc">↓ Newest first</option>
            <option value="date_asc">↑ Oldest first</option>
            <option value="customer">A–Z Customer</option>
            <option value="job_id">Job #</option>
            <option value="make">Make / Model</option>
          </select>
          {!wsId&&wsProfiles.length>0&&(<>
            <select className="inp" value={filterWs} onChange={e=>{setFilterWs(e.target.value);setFilterCity("__all__");setFilterCountry("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:180}}>
              <option value="__all__">🏪 All Workshops</option>
              {wsProfiles.map(p=>(
                <option key={p.id} value={p.id}>{p.name||p.id}</option>
              ))}
            </select>
            {wsCities.length>0&&(
              <select className="inp" value={filterCity} onChange={e=>{setFilterCity(e.target.value);setFilterWs("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:140}}>
                <option value="__all__">🏙️ All Cities</option>
                {wsCities.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {wsCountries.length>0&&(
              <select className="inp" value={filterCountry} onChange={e=>{setFilterCountry(e.target.value);setFilterWs("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:150}}>
                <option value="__all__">🌍 All Countries</option>
                {wsCountries.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </>)}
        </div>
        {filtered.length===0&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.wsNoJobsFound}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {filtered.slice(jobPage*JOB_PAGE_SIZE,(jobPage+1)*JOB_PAGE_SIZE).map(j=>{
            const jItems=jobItems.filter(i=>i.job_id===j.id);
            const inv=jobInvoice(j.id);
            const jq=jobQuote(j.id);
            const total=jItems.reduce((s,i)=>s+(+i.total||0),0);
            const frontPhoto=wsVehicles.find(v=>v.id===j.workshop_vehicle_id)?.photo_front||"";
            return (
              <div key={j.id} className="card card-hover" style={{padding:0,cursor:"pointer",borderLeft:`3px solid ${ST_COLOR[j.status]||"var(--border)"}`,overflow:"hidden",display:"flex",minHeight:110}}
                onClick={()=>{setActiveJob(j);setView("job");}}>
                {/* Front photo */}
                <div style={{width:64,flexShrink:0,background:"var(--surface2)",position:"relative",overflow:"hidden"}}>
                  {frontPhoto?(
                    <img src={toImgUrl(frontPhoto)} alt="car"
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                      onError={e=>{const m=frontPhoto.match(/thumbnail[?]id=([^&]+)/)||frontPhoto.match(/[?&]id=([^&]+)/)||frontPhoto.match(/file\/d\/([^/?]+)/);if(m&&!e.target.src.includes("uc?export=view"))e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;else e.target.style.display="none";}}/>
                  ):(
                    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,color:"var(--border2)"}}>🚗</div>
                  )}
                </div>
                {/* Card content */}
                <div style={{flex:1,padding:"12px 14px",minWidth:0,display:"flex",flexDirection:"column",gap:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer_name||<span style={{color:"var(--text3)"}}>No name</span>}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{j.customer_phone}</div>
                    </div>
                    <span className="badge" style={{background:ST_BG[j.status],color:ST_COLOR[j.status],flexShrink:0,marginLeft:6}}>{j.status}</span>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                    {j.vehicle_reg&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text)",fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700}}>🚗 {j.vehicle_reg}</span>}
                    {j.vehicle_make&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text2)",fontSize:11}}>{j.vehicle_make} {j.vehicle_model}</span>}
                    {j.vehicle_year&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text3)",fontSize:11}}>{j.vehicle_year}</span>}
                  </div>
                  {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginBottom:5}}>🔄 {j.return_reason.slice(0,50)}</div>}
                  {j.complaint&&<div style={{fontSize:12,fontWeight:600,color:"#ef4444",marginBottom:6,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",background:"rgba(239,68,68,.07)",borderLeft:"3px solid #ef4444",borderRadius:"0 6px 6px 0",padding:"3px 8px"}}>⚠️ {j.complaint}</div>}
                  {!wsId&&j.workshop_id&&(
                    <div style={{fontSize:11,color:"var(--text3)",marginBottom:5,display:"flex",alignItems:"center",gap:4}}>
                      <span style={{background:"rgba(251,146,60,.12)",color:"#f97316",borderRadius:6,padding:"2px 7px",fontWeight:600,fontSize:11}}>🏪 {wsProfileMap[j.workshop_id]||j.workshop_id}</span>
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:7,marginTop:"auto"}}>
                    <div style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code>
                      {j.mechanic&&<span style={{marginLeft:6}}>👷 {j.mechanic}</span>}
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0,marginLeft:6}}>
                      {jq&&!inv&&<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",fontSize:10}}>📝 Quoted</span>}
                      {inv&&<span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:10}}>🧾 Invoiced</span>}
                      {total>0&&wsRole!=="mechanic"&&<span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>{fmt(total)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length>JOB_PAGE_SIZE&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:16,flexWrap:"wrap"}}>
            <button className="btn btn-ghost btn-sm" disabled={jobPage===0} onClick={()=>setJobPage(p=>p-1)}>← Prev</button>
            <span style={{fontSize:12,color:"var(--text3)"}}>
              {jobPage*JOB_PAGE_SIZE+1}–{Math.min((jobPage+1)*JOB_PAGE_SIZE,filtered.length)} of {filtered.length}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={(jobPage+1)*JOB_PAGE_SIZE>=filtered.length} onClick={()=>setJobPage(p=>p+1)}>Next →</button>
          </div>
        )}
      </>)}

      {/* ══════════════ CUSTOMERS TAB ══════════════ */}
      {wsTab==="customers"&&(
        <WsCustomersPage
          wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
          onSaveCustomer={onSaveWsCustomer} onDeleteCustomer={onDeleteWsCustomer}
          onSaveVehicle={onSaveWsVehicle} onDeleteVehicle={onDeleteWsVehicle}
          onOpenJob={(j)=>{ setWsTab("jobs"); setActiveJob(j); setView("job"); }}
          settings={settings} embedded t={t}/>
      )}

      {/* ══════════════ QUOTATIONS TAB ══════════════ */}
      {wsTab==="quotations"&&(<>
        <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <span style={{fontSize:13,color:"var(--text3)"}}>{quotes.length} quotation{quotes.length!==1?"s":""}</span>
        </div>
        {quotes.length===0
          ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No quotations yet — create one from a job card</div>
          : <div className="card" style={{overflow:"auto"}}>
              <table className="tbl" style={{width:"100%",minWidth:700}}>
                <thead><tr>
                  <th>Quote ID</th><th>Customer</th><th>Vehicle</th><th>Date</th><th>Valid Until</th><th style={{textAlign:"right"}}>Total</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {[...quotes].sort((a,b)=>new Date(b.quote_date)-new Date(a.quote_date)).map(q=>{
                    const j=jobs.find(jb=>jb.id===q.job_id);
                    const QST_COLOR={draft:"var(--text3)",sent:"var(--blue)",accepted:"var(--green)",declined:"var(--red)",converted:"var(--text3)"};
                    const QST_BG={draft:"rgba(100,116,139,.12)",sent:"rgba(96,165,250,.12)",accepted:"rgba(52,211,153,.12)",declined:"rgba(248,113,113,.12)",converted:"rgba(100,116,139,.08)"};
                    return (
                      <tr key={q.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{q.id}</code></td>
                        <td><div style={{fontWeight:600}}>{q.quote_customer||j?.customer_name||"—"}</div><div style={{fontSize:11,color:"var(--text3)"}}>{q.quote_phone||j?.customer_phone}</div></td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{q.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                        <td style={{fontSize:12}}>{q.quote_date}</td>
                        <td style={{fontSize:12,color:q.valid_until&&new Date(q.valid_until)<new Date()?"var(--red)":"var(--text2)"}}>{q.valid_until||"—"}</td>
                        <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(q.total)}</td>
                        <td><span className="badge" style={{background:QST_BG[q.status]||QST_BG.draft,color:QST_COLOR[q.status]||"var(--text3)",fontSize:11}}>{q.status}</span></td>
                        <td>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{setActiveJob(j);setView("job");}}>Open Job</button>}
                            {j&&q.status==="accepted"&&!invoices.find(i=>i.job_id===q.job_id)&&(
                              <button className="btn btn-primary btn-xs" onClick={()=>{
                                const its=jobItems.filter(i=>i.job_id===q.job_id);
                                const sub=its.reduce((s,i)=>s+(+i.total||0),0);
                                const tx=settings.vat_number?sub*(settings.tax_rate||0)/100:0;
                                setQInvModal({job:j,items:its,quote:q,subtotal:sub,tax:tx,total:sub+tx});
                              }}>🧾 Invoice</button>
                            )}
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{const vp=wsVehicles.find(x=>x.id===j.workshop_vehicle_id);printWorkshopQuote(j,jobItems.filter(i=>i.job_id===j.id),q,settings,{front:vp?.photo_front||"",rear:vp?.photo_rear||"",side:vp?.photo_side||""});}}>🖨️</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </>)}

      {/* Convert-quote-to-invoice modal (launched from quotations list) */}
      {qInvModal&&(
        <WorkshopInvoiceModal
          job={qInvModal.job} items={qInvModal.items}
          subtotal={qInvModal.subtotal} tax={qInvModal.tax} total={qInvModal.total}
          settings={settings}
          prefill={{
            invCust:  qInvModal.quote.quote_customer||"",
            invPhone: qInvModal.quote.quote_phone||"",
            invEmail: qInvModal.quote.quote_email||"",
            dueDate:  qInvModal.quote.valid_until||"",
            notes:    `Converted from Quote ${qInvModal.quote.id}${qInvModal.quote.notes?"\n"+qInvModal.quote.notes:""}`,
          }}
          onSave={async(inv)=>{
            await onSaveInvoice(inv);
            await onSaveQuote({...qInvModal.quote, status:"converted"});
            setQInvModal(null);
            setWsTab("invoices");
          }}
          onClose={()=>setQInvModal(null)} t={t}/>
      )}

      {/* ══════════════ INVOICES TAB ══════════════ */}
      {wsTab==="invoices"&&(<>
        <div style={{marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Total Invoiced",totalInvoiced,"var(--accent)"],["Total Paid",totalPaid,"var(--green)"],["Outstanding",totalOutstanding,"var(--red)"]].map(([l,v,c])=>(
            <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:c}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
        {invoices.length===0
          ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No invoices yet</div>
          : <div className="card" style={{overflow:"auto"}}>
              <table className="tbl" style={{width:"100%",minWidth:750}}>
                <thead><tr><th>Invoice ID</th><th>Customer</th><th>Vehicle</th><th>Date</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {[...invoices].sort((a,b)=>new Date(b.invoice_date)-new Date(a.invoice_date)).map(inv=>{
                    const j=jobs.find(jb=>jb.id===inv.job_id);
                    const paid=+inv.paid_amount||0;
                    const bal=(+inv.total||0)-paid;
                    const sc=inv.status==="paid"?"var(--green)":inv.status==="partial"?"var(--yellow)":"var(--red)";
                    const sb=inv.status==="paid"?"rgba(52,211,153,.12)":inv.status==="partial"?"rgba(251,191,36,.12)":"rgba(248,113,113,.12)";
                    return (
                      <tr key={inv.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                        <td><div style={{fontWeight:600}}>{inv.invoice_customer||j?.customer_name||"—"}</div><div style={{fontSize:11,color:"var(--text3)"}}>{inv.inv_phone||j?.customer_phone}</div></td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                        <td style={{fontSize:12}}>{inv.invoice_date}</td>
                        <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)}</td>
                        <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{paid>0?fmt(paid):"—"}</td>
                        <td style={{textAlign:"right",color:bal>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(bal)}</td>
                        <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ Paid":inv.status==="partial"?"💛 Partial":"⏳ Unpaid"}</span></td>
                        <td>
                          <div style={{display:"flex",gap:4}}>
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{setActiveJob(j);setView("job");}}>Open</button>}
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{const vp=wsVehicles.find(x=>x.id===j.workshop_vehicle_id);printWorkshopInvoice(j,jobItems.filter(i=>i.job_id===j.id),inv,settings,{front:vp?.photo_front||"",rear:vp?.photo_rear||"",side:vp?.photo_side||""});}}>🖨️</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </>)}

      {/* ══════════════ PAYMENTS TAB ══════════════ */}
      {wsTab==="payments"&&(()=>{
        const paid=invoices.filter(i=>(+i.paid_amount||0)>0).sort((a,b)=>new Date(b.payment_date||b.invoice_date)-new Date(a.payment_date||a.invoice_date));
        return (<>
          <div style={{marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
            {[["Payments Received",paid.length+" transactions","var(--blue)"],["Total Collected",fmt(paid.reduce((s,i)=>s+(+i.paid_amount||0),0)),"var(--green)"]].map(([l,v,c])=>(
              <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                <div style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {paid.length===0
            ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No payments recorded yet</div>
            : <div className="card" style={{overflow:"auto"}}>
                <table className="tbl" style={{width:"100%",minWidth:700}}>
                  <thead><tr><th>Invoice</th><th>Customer</th><th>Vehicle</th><th>Pay Date</th><th>Method</th><th>Reference</th><th style={{textAlign:"right"}}>Invoice Total</th><th style={{textAlign:"right"}}>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {paid.map(inv=>{
                      const j=jobs.find(jb=>jb.id===inv.job_id);
                      const sc=inv.status==="paid"?"var(--green)":"var(--yellow)";
                      const sb=inv.status==="paid"?"rgba(52,211,153,.12)":"rgba(251,191,36,.12)";
                      return (
                        <tr key={inv.id}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                          <td style={{fontWeight:600}}>{inv.invoice_customer||j?.customer_name||"—"}</td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                          <td style={{fontSize:12}}>{inv.payment_date||"—"}</td>
                          <td><span className="badge" style={{background:"var(--surface2)",color:"var(--text2)",fontSize:11}}>{inv.payment_method||"—"}</span></td>
                          <td style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{inv.payment_ref||"—"}</td>
                          <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)}</td>
                          <td style={{textAlign:"right",fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.paid_amount)}</td>
                          <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ Paid":"💛 Partial"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }
        </>);
      })()}

      {/* ══════════════ WS STOCK TAB ══════════════ */}
      {wsTab==="wsstock"&&(
        <WsStockPage wsStock={wsStock} settings={settings}
          onSave={onSaveWsStock} onDelete={onDeleteWsStock} onAdjust={onAdjustWsStock}/>
      )}

      {/* ══════════════ WS SERVICES TAB ══════════════ */}
      {wsTab==="wsservices"&&(
        <WsServicesPage wsServices={wsServices} settings={settings}
          onSave={onSaveWsService} onDelete={onDeleteWsService}/>
      )}

      {/* ══════════════ WS PURCHASE ORDERS TAB ══════════════ */}
      {wsTab==="wssuporders"&&(
        <WsPurchaseOrdersPage
          purchaseOrders={wsPurchaseOrders} poItems={wsPoItems}
          wsSuppliers={wsSuppliers} wsStock={wsStock} settings={settings}
          wsSupplierQuotes={wsSupplierQuotes} wsSqReplies={wsSqReplies}
          wsSupplierRequests={wsSupplierRequests}
          initialViewPoId={pendingViewPoId}
          onClearInitialView={()=>setPendingViewPoId(null)}
          onSave={onSaveWsPurchaseOrder} onDelete={onDeleteWsPurchaseOrder}
          onReceive={onReceiveWsPurchaseOrder}/>
      )}

      {/* ══════════════ WS SUPPLIERS TAB ══════════════ */}
      {wsTab==="wssuppliers"&&(
        <WsSuppliersPage wsSuppliers={wsSuppliers}
          onSave={onSaveWsSupplier} onDelete={onDeleteWsSupplier}/>
      )}

      {/* ══════════════ WS SUPPLIER INVOICES TAB ══════════════ */}
      {wsTab==="wssupinv"&&(
        <WsSupplierInvoicesPage
          invoices={wsSupplierInvoices}
          invItems={wsSupplierInvItems}
          payments={wsSupplierPayments}
          returns={wsSupplierReturns}
          wsSuppliers={wsSuppliers}
          wsStock={wsStock}
          settings={settings}
          onSaveInvoice={onSaveWsSupplierInvoice}
          onDeleteInvoice={onDeleteWsSupplierInvoice}
          onSavePayment={onSaveWsSupplierPayment}
          onDeletePayment={onDeleteWsSupplierPayment}
          onSaveReturn={onSaveWsSupplierReturn}/>
      )}

      {/* ══════════════ WS TRANSFER TAB ══════════════ */}
      {wsTab==="wstransfer"&&(
        <WsTransferPage parts={parts} wsStock={wsStock} settings={settings}
          onSave={onSaveWsTransfer}/>
      )}

      {/* ══════════════ WS DOCUMENTS TAB ══════════════ */}
      {wsTab==="wsdocs"&&(
        <WsDocumentsPage docs={wsDocs} settings={settings}
          onSave={onSaveWsDoc} onDelete={onDeleteWsDoc}/>
      )}

      {/* ══════════════ LICENCE RENEWALS TAB ══════════════ */}
      {wsTab==="wslicencerenewal"&&(
        <WsLicenceRenewalsPage
          renewals={wsLicenceRenewals} settings={settings} wsId={wsId}
          onSave={onSaveWsLicenceRenewal}
          onUpdate={onUpdateWsLicenceRenewal}/>
      )}

      {/* ══════════════ STATEMENT TAB ══════════════ */}
      {wsTab==="statement"&&(()=>{
        const sc=stmtCust?wsCustomers.find(c=>c.id===stmtCust):null;
        const scJobs=sc?jobs.filter(j=>j.workshop_customer_id===sc.id||j.customer_name===sc.name):[];
        const scJobIds=scJobs.map(j=>j.id);
        const scInvoices=invoices.filter(i=>scJobIds.includes(i.job_id));
        const scQuotes=quotes.filter(q=>scJobIds.includes(q.job_id));
        const scVehicles=wsVehicles.filter(v=>v.workshop_customer_id===sc?.id);
        const totalBilled=scInvoices.reduce((s,i)=>s+(+i.total||0),0);
        const totalPaidC=scInvoices.reduce((s,i)=>s+(+i.paid_amount||0),0);
        const outstanding=totalBilled-totalPaidC;
        return (<>
          <div style={{marginBottom:14,maxWidth:380}}>
            <label style={{fontSize:12,color:"var(--text3)",display:"block",marginBottom:6}}>Select Customer</label>
            <select className="inp" value={stmtCust} onChange={e=>setStmtCust(e.target.value)}>
              <option value="">— Choose a customer —</option>
              {wsCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}
            </select>
          </div>
          {sc&&(<>
            {/* Customer info */}
            <div className="card" style={{padding:14,marginBottom:14,borderLeft:"3px solid var(--accent)"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>👤 {sc.name}</div>
                  {sc.phone&&<div style={{fontSize:13,color:"var(--text3)"}}>{sc.phone}</div>}
                  {sc.email&&<div style={{fontSize:13,color:"var(--text3)"}}>{sc.email}</div>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {[["Jobs",scJobs.length,"var(--blue)"],["Vehicles",scVehicles.length,"var(--text2)"],["Quotes",scQuotes.length,"var(--blue)"],["Invoices",scInvoices.length,"var(--accent)"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",padding:"8px 14px",background:"var(--surface2)",borderRadius:8}}>
                      <div style={{fontSize:18,fontWeight:700,color:c}}>{v}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {scVehicles.length>0&&(
                <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {scVehicles.map(v=>(
                    <span key={v.id} className="badge" style={{background:"var(--surface2)",fontFamily:"DM Mono,monospace",fontSize:12}}>
                      🚗 {v.reg} — {v.make} {v.model} {v.year}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Financial summary */}
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              {[["Total Billed",totalBilled,"var(--accent)"],["Total Paid",totalPaidC,"var(--green)"],["Outstanding",outstanding,outstanding>0?"var(--red)":"var(--green)"]].map(([l,v,c])=>(
                <div key={l} className="card" style={{padding:"10px 16px",flex:1,minWidth:130}}>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                  <div style={{fontWeight:700,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:c}}>{fmt(v)}</div>
                </div>
              ))}
            </div>
            {/* Jobs history */}
            {scJobs.length>0&&(
              <div className="card" style={{overflow:"auto",marginBottom:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>🔧 Job History</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Job ID</th><th>Vehicle</th><th>Date In</th><th>Complaint</th><th>Status</th><th>Invoice</th></tr></thead>
                  <tbody>
                    {scJobs.map(j=>{
                      const inv=jobInvoice(j.id);
                      return (
                        <tr key={j.id} style={{cursor:"pointer"}} onClick={()=>{setActiveJob(j);setView("job");}}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code></td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.vehicle_reg||"—"}</code></td>
                          <td style={{fontSize:12}}>{j.date_in}</td>
                          <td style={{fontSize:12,color:"var(--text2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.complaint||"—"}</td>
                          <td><span className="badge" style={{background:ST_BG[j.status],color:ST_COLOR[j.status],fontSize:11}}>{j.status}</span></td>
                          <td>{inv?<span style={{fontWeight:700,color:inv.status==="paid"?"var(--green)":"var(--red)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)} {inv.status==="paid"?"✅":"⏳"}</span>:<span style={{color:"var(--text3)",fontSize:12}}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Invoices */}
            {scInvoices.length>0&&(
              <div className="card" style={{overflow:"auto",marginBottom:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>🧾 Invoice History</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Invoice ID</th><th>Date</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    {scInvoices.map(inv=>{
                      const bal=(+inv.total||0)-(+inv.paid_amount||0);
                      const sc2=inv.status==="paid"?"var(--green)":inv.status==="partial"?"var(--yellow)":"var(--red)";
                      const sb2=inv.status==="paid"?"rgba(52,211,153,.12)":inv.status==="partial"?"rgba(251,191,36,.12)":"rgba(248,113,113,.12)";
                      return (
                        <tr key={inv.id}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                          <td style={{fontSize:12}}>{inv.invoice_date}</td>
                          <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(inv.total)}</td>
                          <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{+inv.paid_amount>0?fmt(inv.paid_amount):"—"}</td>
                          <td style={{textAlign:"right",fontWeight:700,color:bal>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(bal)}</td>
                          <td><span className="badge" style={{background:sb2,color:sc2,fontSize:11}}>{inv.status==="paid"?"✅ Paid":inv.status==="partial"?"💛 Partial":"⏳ Unpaid"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>)}
          {!sc&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>Select a customer above to view their statement</div>}
        </>);
      })()}

      {/* ══════════════ REPORT TAB ══════════════ */}
      {wsTab==="report"&&(()=>{
        const now=new Date();
        const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
        const lastMonthStr=`${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,"0")}`;
        const jobsThisMonth=jobs.filter(j=>(j.date_in||"").startsWith(thisMonth));
        const invThisMonth=invoices.filter(i=>(i.invoice_date||"").startsWith(thisMonth));
        const revThisMonth=invThisMonth.reduce((s,i)=>s+(+i.total||0),0);
        const paidThisMonth=invoices.filter(i=>(i.payment_date||"").startsWith(thisMonth)).reduce((s,i)=>s+(+i.paid_amount||0),0);
        // Status breakdown
        const byStatus=["Pending","In Progress","Done","Delivered"].map(s=>([s,jobs.filter(j=>j.status===s).length]));
        // Top customers by revenue
        const custRev={};
        invoices.forEach(inv=>{ const k=inv.invoice_customer||"Unknown"; custRev[k]=(custRev[k]||0)+(+inv.total||0); });
        const topCust=Object.entries(custRev).sort((a,b)=>b[1]-a[1]).slice(0,5);
        return (<>
          {/* KPI cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:20}}>
            {[
              ["Total Jobs",jobs.length,"var(--blue)","🔧"],
              ["This Month Jobs",jobsThisMonth.length,"var(--blue)","📅"],
              ["Active Jobs",jobs.filter(j=>j.status==="In Progress").length,"var(--yellow)","⚙️"],
              ["Pending Quotes",quotes.filter(q=>["draft","sent"].includes(q.status)).length,"var(--blue)","📝"],
              ["Total Invoiced",fmt(totalInvoiced),"var(--accent)","🧾"],
              ["This Month Rev",fmt(revThisMonth),"var(--accent)","📈"],
              ["Collected",fmt(totalPaid),"var(--green)","💚"],
              ["Outstanding",fmt(totalOutstanding),"var(--red)","⚠️"],
            ].map(([l,v,c,ic])=>(
              <div key={l} className="card" style={{padding:"12px 14px"}}>
                <div style={{fontSize:18,marginBottom:4}}>{ic}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                <div style={{fontWeight:700,fontSize:15,fontFamily:"Rajdhani,sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,flexWrap:"wrap"}}>
            {/* Job status breakdown */}
            <div className="card" style={{padding:14}}>
              <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>📊 Jobs by Status</div>
              {byStatus.map(([s,cnt])=>(
                <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span className="badge" style={{background:ST_BG[s],color:ST_COLOR[s],fontSize:12}}>{s}</span>
                  <div style={{flex:1,margin:"0 10px",height:6,background:"var(--surface2)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${jobs.length?cnt/jobs.length*100:0}%`,height:"100%",background:ST_COLOR[s],borderRadius:3}}/>
                  </div>
                  <span style={{fontWeight:700,minWidth:24,textAlign:"right"}}>{cnt}</span>
                </div>
              ))}
            </div>
            {/* Top customers */}
            <div className="card" style={{padding:14}}>
              <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>🏆 Top Customers by Revenue</div>
              {topCust.length===0&&<div style={{color:"var(--text3)",fontSize:13}}>No invoices yet</div>}
              {topCust.map(([name,rev],i)=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:13}}>
                  <span style={{color:"var(--text3)",marginRight:8,minWidth:18}}>#{i+1}</span>
                  <span style={{flex:1,fontWeight:i===0?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
                  <span style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginLeft:8}}>{fmt(rev)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Monthly table */}
          {(()=>{
            const monthMap={};
            invoices.forEach(inv=>{
              const m=(inv.invoice_date||"").slice(0,7);
              if(!m) return;
              if(!monthMap[m]) monthMap[m]={month:m,count:0,revenue:0,paid:0};
              monthMap[m].count++;
              monthMap[m].revenue+=(+inv.total||0);
              monthMap[m].paid+=(+inv.paid_amount||0);
            });
            const months=Object.values(monthMap).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,12);
            if(!months.length) return null;
            return (
              <div className="card" style={{overflow:"auto",marginTop:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>📅 Monthly Revenue</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Month</th><th style={{textAlign:"right"}}>Invoices</th><th style={{textAlign:"right"}}>Revenue</th><th style={{textAlign:"right"}}>Collected</th><th style={{textAlign:"right"}}>Outstanding</th></tr></thead>
                  <tbody>
                    {months.map(m=>(
                      <tr key={m.month}>
                        <td style={{fontWeight:m.month===thisMonth?700:400,color:m.month===thisMonth?"var(--accent)":"inherit"}}>{m.month}{m.month===thisMonth?" ⬅ current":""}</td>
                        <td style={{textAlign:"right"}}>{m.count}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(m.revenue)}</td>
                        <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(m.paid)}</td>
                        <td style={{textAlign:"right",color:m.revenue-m.paid>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(m.revenue-m.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>);
      })()}

      {/* ── Modals ── */}
      {bookIn&&(
        <BookInModal wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs} settings={settings}
          onSaveJob={async(d)=>{ await onSaveJob(d); setBookIn(false); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setBookIn(false); setActiveJob(d); setView("job"); }}
          onClose={()=>setBookIn(false)} t={t}/>
      )}
      {editJob&&(
        <WorkshopJobModal job={editJob} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
          onSave={async(d)=>{ await onSaveJob(d); setEditJob(null); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setEditJob(null); }}
          onClose={()=>setEditJob(null)} t={t}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE CHECK-IN CHECKLIST ITEMS
// ═══════════════════════════════════════════════════════════════
const CHECKLIST_ITEMS=[
  {key:"body_front",    label:"Front Bumper / Body",   icon:"🚗"},
  {key:"body_rear",     label:"Rear Bumper / Body",    icon:"🚙"},
  {key:"body_left",     label:"Left Side Body",        icon:"◀️"},
  {key:"body_right",   label:"Right Side Body",       icon:"▶️"},
  {key:"windscreen",   label:"Windscreen",            icon:"🔲"},
  {key:"wipers",       label:"Wipers",                icon:"🌧️"},
  {key:"lights_front", label:"Front Lights",          icon:"💡"},
  {key:"lights_rear",  label:"Rear Lights",           icon:"🔴"},
  {key:"tyres",        label:"Tyres Condition",       icon:"⚫"},
  {key:"spare_wheel",  label:"Spare Wheel",           icon:"🛞"},
  {key:"fuel_level",   label:"Fuel Level",            icon:"⛽"},
  {key:"interior",     label:"Interior Condition",    icon:"💺"},
  {key:"dash_lights",  label:"Dashboard Warning Lights",icon:"⚠️"},
  {key:"boot",         label:"Boot / Trunk",          icon:"📦"},
  {key:"radio",        label:"Radio / Electronics",   icon:"📻"},
];

// ═══════════════════════════════════════════════════════════════
// OCR QUOTE MODAL — scan supplier screenshot → extract prices
// ═══════════════════════════════════════════════════════════════
function OcrQuoteModal({parts=[], onApply, onClose}) {
  const [stage,    setStage]    = useState("upload"); // upload | scanning | review
  const [imgSrc,   setImgSrc]   = useState(null);
  const [progress, setProgress] = useState(0);
  const [rawText,  setRawText]  = useState("");
  const [rows,     setRows]     = useState([]); // [{desc, qty, price, partIdx}]
  const fileRef = useRef();

  // Parse OCR text into candidate rows
  const parseText = (text) => {
    const priceRe = /R?\s*(\d[\d\s]*[,.]?\d{0,2})/gi;
    const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);
    const candidates = [];
    for(const line of lines){
      // Find all price-like numbers in this line
      const nums = [...line.matchAll(/R?\s*(\d+[.,]\d{2})/g)].map(m=>+(m[1].replace(",",".")));
      if(!nums.length) continue;
      const price = Math.max(...nums); // take the largest number as unit price
      if(price < 1) continue;         // skip tiny numbers (qty matches etc.)
      // Description = line with prices stripped
      const desc = line.replace(/R?\s*\d+[.,]\d{2}/g,"").replace(/\s+/g," ").trim();
      if(desc.length < 2) continue;
      // Try to match to a known part (case-insensitive, partial)
      const dl = desc.toLowerCase();
      const partIdx = parts.findIndex(p=>dl.includes(p.toLowerCase().slice(0,6))||p.toLowerCase().includes(dl.slice(0,6)));
      // Qty: look for small standalone integer on the line (1-99)
      const qtyM = line.match(/\b([1-9][0-9]?)\b/);
      const qty = qtyM ? +qtyM[1] : 1;
      candidates.push({desc, qty, price, partIdx});
    }
    return candidates;
  };

  const runOcr = async (src) => {
    setStage("scanning");
    setProgress(0);
    try {
      const worker = await createWorker("eng", 1, {
        logger: m => { if(m.status==="recognizing text") setProgress(Math.round(m.progress*100)); },
      });
      const { data: { text } } = await worker.recognize(src);
      await worker.terminate();
      setRawText(text);
      setRows(parseText(text));
      setStage("review");
    } catch(e) {
      alert("OCR failed: "+e.message);
      setStage("upload");
    }
  };

  const onFile = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => { setImgSrc(e.target.result); runOcr(e.target.result); };
    reader.readAsDataURL(file);
  };

  const setRow = (i, k, v) => setRows(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));

  const apply = () => {
    // Build price map: partIdx → price (or desc → price for unmatched)
    const mapped = rows.filter(r=>+r.price>0).map(r=>({
      partIdx: r.partIdx,
      desc:    r.desc,
      price:   +r.price,
      qty:     +r.qty||1,
    }));
    onApply(mapped);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📷 Scan Supplier Quote" onClose={onClose}/>

      {stage==="upload"&&(
        <div style={{textAlign:"center",padding:"32px 16px"}}>
          <div style={{fontSize:48,marginBottom:12}}>📸</div>
          <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Upload supplier screenshot or photo</div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:20}}>JPG, PNG or WebP — WhatsApp screenshots work best</div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
            onChange={e=>onFile(e.target.files[0])}/>
          <button className="btn btn-primary" style={{padding:"10px 28px"}} onClick={()=>fileRef.current.click()}>
            Choose Image
          </button>
          <div style={{marginTop:12,fontSize:11,color:"var(--text3)"}}>Tip: Save the WhatsApp image to your device first, then upload it here</div>
        </div>
      )}

      {stage==="scanning"&&(
        <div style={{textAlign:"center",padding:"40px 16px"}}>
          {imgSrc&&<img src={imgSrc} alt="" style={{maxWidth:"100%",maxHeight:200,borderRadius:8,marginBottom:16,objectFit:"contain"}}/>}
          <div style={{fontWeight:600,marginBottom:8}}>Reading image… {progress}%</div>
          <div style={{background:"var(--surface2)",borderRadius:99,height:8,overflow:"hidden",maxWidth:280,margin:"0 auto"}}>
            <div style={{height:"100%",background:"var(--accent)",borderRadius:99,width:`${progress}%`,transition:"width .3s"}}/>
          </div>
        </div>
      )}

      {stage==="review"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            {/* Left: original image */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Original Image</div>
              {imgSrc&&<img src={imgSrc} alt="" style={{width:"100%",borderRadius:8,objectFit:"contain",maxHeight:260,background:"#000"}}/>}
            </div>
            {/* Right: raw OCR text */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>OCR Text</div>
              <textarea readOnly value={rawText} style={{width:"100%",height:260,fontSize:10,fontFamily:"monospace",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:8,resize:"none",color:"var(--text2)"}}/>
            </div>
          </div>

          <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>
            Extracted Items — review &amp; correct before applying
          </div>

          {rows.length===0
            ? <div style={{textAlign:"center",padding:20,color:"var(--text3)",fontSize:13}}>
                No price rows detected. The image may be too blurry or the layout unusual.<br/>
                <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setStage("upload")}>Try another image</button>
              </div>
            : <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14,maxHeight:240,overflowY:"auto"}}>
                {rows.map((r,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px",gap:6,alignItems:"center",background:"var(--surface2)",borderRadius:8,padding:"6px 10px"}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>OCR: {r.desc}</div>
                      <select className="inp" style={{fontSize:12,padding:"2px 6px"}}
                        value={r.partIdx} onChange={e=>setRow(i,"partIdx",+e.target.value)}>
                        <option value={-1}>— unmatched —</option>
                        {parts.map((p,pi)=><option key={pi} value={pi}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Qty</div>
                      <input className="inp" type="number" min="1" step="1" value={r.qty}
                        onChange={e=>setRow(i,"qty",e.target.value)} style={{padding:"2px 4px",fontSize:12}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Price</div>
                      <input className="inp" type="number" min="0" step="0.01" value={r.price}
                        onChange={e=>setRow(i,"price",e.target.value)} style={{padding:"2px 4px",fontSize:12}}/>
                    </div>
                  </div>
                ))}
              </div>
          }

          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStage("upload")}>↩ Try Again</button>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
            {rows.length>0&&<button className="btn btn-primary" style={{flex:2}} onClick={apply}>✅ Apply Prices</button>}
          </div>
        </>
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER QUOTE MODAL — enter prices received from a supplier
// ═══════════════════════════════════════════════════════════════
function SupplierQuoteModal({request, existingQuote, settings={}, priceOnly=false, onSave, onClose}) {
  const vatRate = +(settings?.tax_rate||0) / 100;
  const parts = (() => { try { return JSON.parse(request.parts_list||"[]"); } catch { return []; } })();
  // Build name→sku map from items_json (present on generated-link and new manual-send requests)
  const reqSkuMap = (() => {
    const items = (() => { try { return JSON.parse(request.items_json||"[]"); } catch { return []; } })();
    const m = {};
    items.forEach(it => { const k=(it.label||it.description||"").toLowerCase().trim(); if(k) m[k]=it.sku||""; });
    return m;
  })();
  const [prices, setPrices] = useState(() => {
    if (existingQuote?.line_items) {
      try {
        const lines = JSON.parse(existingQuote.line_items);
        // Back-fill sku if saved line is missing it
        return lines.map(l => ({...l, sku: l.sku||reqSkuMap[(l.name||"").toLowerCase().trim()]||""}));
      } catch {}
    }
    return parts.map(p => ({name: p, price: "", available: "", sku: reqSkuMap[p.toLowerCase().trim()]||""}));
  });
  const [vatExcluded, setVatExcluded] = useState(existingQuote?.vat_excluded??(request.supplier_vat_inclusive===false));
  const [notes,     setNotes]     = useState(existingQuote?.notes||"");
  const [quoteRef,  setQuoteRef]  = useState(existingQuote?.quote_ref||"");
  const [saving,    setSaving]    = useState(false);
  const [showOcr,   setShowOcr]   = useState(false);

  const onOcrApply = (mapped) => {
    setPrices(prev => {
      const next = [...prev];
      mapped.forEach(row => {
        if(row.partIdx >= 0 && row.partIdx < next.length) {
          next[row.partIdx] = {...next[row.partIdx], price: String(row.price)};
        }
      });
      return next;
    });
    setShowOcr(false);
  };

  const setLine = (idx, field, val) =>
    setPrices(p => p.map((r,i) => i===idx ? {...r,[field]:val} : r));

  // Raw sum of entered prices
  const rawTotal = prices.reduce((s,r) => s + (+r.price||0), 0);
  // If supplier gave ex-VAT prices, add VAT to get incl-VAT total
  const vatIncTotal = vatExcluded && vatRate > 0 ? rawTotal * (1 + vatRate) : rawTotal;
  const vatAmount   = vatIncTotal - rawTotal;

  // Per-line VAT-inclusive price for display
  const inclPrice = (p) => {
    const v = +p||0;
    return vatExcluded && vatRate > 0 ? v * (1 + vatRate) : v;
  };

  const C = curSym(settings?.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const handleSave = async () => {
    setSaving(true);
    // Save each line with vat_incl_price so the reference panel shows the real cost
    const savedLines = prices.map(r => ({
      ...r,
      vat_incl_price: inclPrice(r.price),
    }));
    try {
      await onSave({
        ...(existingQuote?.id ? {id: existingQuote.id} : {}),
        request_id:    request.id,
        job_id:        request.job_id,
        vehicle_reg:   request.vehicle_reg||"",
        supplier_id:   request.supplier_id||null,
        supplier_name: request.supplier_name||"",
        line_items:    JSON.stringify(savedLines),
        total:         vatIncTotal,
        vat_excluded:  vatExcluded,
        quote_ref:     quoteRef.trim()||null,
        notes:         notes.trim()||null,
      });
      onClose();
    } catch(e) { alert("Save failed: "+e.message); }
    finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={priceOnly?"↩️ Return Quote":"💰 Enter Supplier Quote"} onClose={onClose}/>

      {/* Supplier + vehicle banner */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,color:"#25D366"}}>{request.via_group?"👥":"📲"} {request.supplier_name||request.supplier_phone||"Unknown supplier"}</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>🚗 {request.vehicle_reg||"—"} · Job {request.job_id}</div>
        </div>
      </div>

      {/* VAT toggle — hidden in priceOnly mode */}
      {!priceOnly&&(
        <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"9px 14px",background:"var(--surface2)",borderRadius:10,cursor:"pointer",border:"1px solid var(--border)"}}>
          <input type="checkbox" checked={vatExcluded} onChange={e=>setVatExcluded(e.target.checked)}
            style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700}}>Prices are VAT excluded (ex-VAT)</div>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>
              {vatExcluded
                ? vatRate>0
                  ? `VAT (${settings.tax_rate}%) will be added — totals shown incl. VAT`
                  : "No VAT rate set in settings — configure it in Workshop Settings"
                : "Prices already include VAT"}
            </div>
          </div>
        </label>
      )}

      {/* Line items — one row per part */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
        Parts &amp; Prices
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:14}}>
        {/* Header */}
        <div style={{display:"grid",gridTemplateColumns:priceOnly?`1fr 120px`:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"7px 12px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>Part</div>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",textAlign:"right"}}>
            {priceOnly?"Price":vatExcluded?"Ex-VAT":"Price"}
          </div>
          {!priceOnly&&vatExcluded&&vatRate>0&&<div style={{fontSize:10,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",textAlign:"right"}}>Incl. VAT</div>}
          {!priceOnly&&<div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>Available</div>}
        </div>
        {prices.map((row,idx) => (
          <div key={idx} style={{display:"grid",gridTemplateColumns:priceOnly?`1fr 120px`:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"8px 12px",borderBottom:idx<prices.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</div>
            <input className="inp" type="number" min="0" step="0.01"
              value={row.price} onChange={e=>setLine(idx,"price",e.target.value)}
              placeholder="0.00"
              style={{textAlign:"right",padding:"4px 8px",fontSize:13,fontWeight:700}}/>
            {!priceOnly&&vatExcluded&&vatRate>0&&(
              <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:"#f59e0b",fontFamily:"Rajdhani,sans-serif"}}>
                {+row.price>0?inclPrice(row.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"—"}
              </div>
            )}
            {!priceOnly&&<input className="inp"
              value={row.available} onChange={e=>setLine(idx,"available",e.target.value)}
              placeholder="In stock"
              style={{padding:"4px 8px",fontSize:12}}/>}
          </div>
        ))}
        {/* Total row */}
        <div style={{display:"grid",gridTemplateColumns:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"9px 12px",background:"var(--surface2)",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text2)"}}>
            {vatExcluded&&vatRate>0?"Subtotal (ex-VAT)":"Total"}
          </div>
          <div style={{fontSize:14,fontWeight:800,color:"var(--accent)",textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>
            {rawTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
          </div>
          {vatExcluded&&vatRate>0&&(
            <div style={{fontSize:14,fontWeight:800,color:"#f59e0b",textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>
              {vatIncTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          )}
          <div/>
        </div>
        {/* VAT breakdown row */}
        {vatExcluded&&vatRate>0&&rawTotal>0&&(
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,padding:"5px 12px 8px",background:"var(--surface2)"}}>
            <span style={{fontSize:11,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): </span>
            <span style={{fontSize:11,fontWeight:700,color:"#f59e0b",fontFamily:"Rajdhani,sans-serif"}}>
              + {vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:priceOnly?"1fr":"1fr 1fr",gap:8,marginBottom:8}}>
        <FD><FL label="Supplier Quote Ref # (Doc Nr)"/><input className="inp" value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} placeholder="e.g. Q100814"/></FD>
        {!priceOnly&&<FD><FL label="Notes (optional)"/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ETA, conditions…"/></FD>}
      </div>

      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        {!priceOnly&&(
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowOcr(true)} title="Read prices from a screenshot">
            📷 Scan Image
          </button>
        )}
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
          {saving?"Saving...":priceOnly?"↩️ Save Return Quote":"💾 Save Quote"}
        </button>
      </div>

      {showOcr&&(
        <OcrQuoteModal
          parts={parts}
          onApply={onOcrApply}
          onClose={()=>setShowOcr(false)}
        />
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER SEND MODAL
// ═══════════════════════════════════════════════════════════════
// Generate a short SKU from a part name: "Air Filter" → "ws-af-m01" style
const makePartSku = (name) => {
  const abbr = name.trim().split(/\s+/).map(w=>w[0]||"").join("").toLowerCase().slice(0,4);
  const rand = Math.random().toString(36).slice(2,5);
  return `ws-${abbr}-${rand}`;
};

function SupplierSendModal({job, items, wsSuppliers=[], settings, history=[], quotes=[], sqReplies=[], onLogSend, onDeleteSend, onSaveQuote, onSaveItem, onSaveWsStock, onGenerateLink, onCreatePO, onClose}) {
  const shopName = settings?.shop_name || "Workshop";

  // Job items — all pre-ticked
  const jobItemIds = items.filter(i => i.description?.trim()).map(i => i.id);
  const [selected,    setSelected]    = useState(jobItemIds);
  // Extra parts typed manually  { id, label, sku }
  const [extraParts,  setExtraParts]  = useState([]);
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied,    setLinkCopied]   = useState(false);
  const [generatingLink,setGeneratingLink]=useState(false);
  const [extraInput,  setExtraInput]  = useState("");

  const [supplierId,  setSupplierId]  = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [customNote,  setCustomNote]  = useState("");
  const [copied,      setCopied]      = useState(false);
  const [quoteTarget, setQuoteTarget] = useState(null); // { request, existingQuote }
  const [localReplies,setLocalReplies]= useState(sqReplies);
  const [refreshing,  setRefreshing]  = useState(false);

  useEffect(()=>{
    if(!history.length) return;
    const ids=history.map(r=>r.id).filter(Boolean).join(",");
    if(!ids) return;
    setRefreshing(true);
    api.get("ws_sq_replies",`request_id=in.(${ids})&select=*`)
      .then(res=>{ if(Array.isArray(res)) setLocalReplies(res); })
      .catch(()=>{})
      .finally(()=>setRefreshing(false));
  },[]);

  const toggleItem = id =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const addExtra = async () => {
    const v = extraInput.trim();
    if (!v) return;
    const sku = makePartSku(v);
    const tempId = "extra_" + Date.now();
    setExtraParts(p => [...p, {id: tempId, label: v, sku, saving: true}]);
    setSelected(p => [...p, tempId]);
    setExtraInput("");
    // Insert to job items AND workshop stock in parallel
    try {
      await Promise.all([
        onSaveItem
          ? onSaveItem({job_id: job.id, type: "part", description: v, part_sku: sku, qty: 1, unit_price: 0, total: 0})
          : Promise.resolve(),
        onSaveWsStock
          ? onSaveWsStock({name: v, sku, qty: 0, unit_cost: 0, unit_price: 0, min_qty: 0})
          : Promise.resolve(),
      ]);
      setExtraParts(p => p.map(e => e.id===tempId ? {...e, saving: false, saved: true} : e));
    } catch(e) {
      console.error("Add item failed", e);
      setExtraParts(p => p.map(e => e.id===tempId ? {...e, saving: false, error: true} : e));
    }
  };

  const removeExtra = id => {
    setExtraParts(p => p.filter(x => x.id !== id));
    setSelected(p => p.filter(x => x !== id));
  };

  // Build combined list: job items + extras
  const allItems = [
    ...items.filter(i => i.description?.trim()).map(i => ({id: i.id, label: i.description, qty: +i.qty||1, sku: i.part_sku||"", isExtra: false})),
    ...extraParts.map(e => ({id: e.id, label: e.label, qty: 1, sku: e.sku||"", isExtra: true})),
  ];
  const selectedItems = allItems.filter(i => selected.includes(i.id));

  const chosenSupplier = wsSuppliers.find(s => String(s.id) === String(supplierId));
  const phone = (chosenSupplier?.phone || manualPhone || "").replace(/\D/g, "");

  const SEP = "─".repeat(28);
  const msgLines = [
    `🔧 *Parts Request* — ${shopName}`,
    SEP,
    `🚗 *${job.vehicle_reg||"—"}*  |  ${[job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ")||"—"}${job.vehicle_color ? "  |  "+job.vehicle_color : ""}`,
    job.vehicle_year ? `Year: ${job.vehicle_year}` : null,
    job.vin          ? `VIN: \`${job.vin}\`` : null,
    job.engine_no    ? `Engine #: ${job.engine_no}` : null,
    `Job #: *${job.id}*  |  Date: ${job.date_in||"—"}`,
    SEP,
    `*Parts needed:*`,
    ...selectedItems.map((i, idx) => `${idx + 1}. ${i.label}${i.qty > 1 ? ` x${i.qty}` : ""}`),
    SEP,
    customNote.trim() || "Please quote price & availability 🙏",
  ].filter(l => l !== null).join("\n");

  const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msgLines)}` : null;

  const logSend = (viaGroup=false) => {
    if (!onLogSend) return;
    onLogSend({
      job_id:         job.id,
      vehicle_reg:    job.vehicle_reg||"",
      supplier_id:    chosenSupplier?.id||null,
      supplier_name:  chosenSupplier?.name || (manualPhone ? "Manual: "+manualPhone : ""),
      supplier_phone: chosenSupplier?.phone||manualPhone||"",
      via_group:      viaGroup,
      parts_list:     JSON.stringify(selectedItems.map(i=>i.label)),
      items_json:     JSON.stringify(selectedItems.map(i=>({label:i.label,description:i.label,sku:i.sku||"",qty:i.qty||1}))),
      message:        msgLines,
    });
  };

  const copyMsg = () => {
    navigator.clipboard.writeText(msgLines).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const jobItemsList = items.filter(i => i.description?.trim());

  return (
    <div style={{maxWidth:520,width:"100%"}}>
      <MHead title="📲 Send to Supplier" onClose={onClose}/>

      {/* Car banner */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:20}}>🚗</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14}}>{job.vehicle_reg||"—"}&nbsp;<span style={{color:"var(--text3)",fontWeight:400,fontSize:13}}>{[job.vehicle_make,job.vehicle_model].filter(Boolean).join(" ")||""}</span></div>
          <div style={{fontSize:11,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",marginTop:1}}>
            {job.vehicle_color&&<span>{job.vehicle_color}</span>}
            {job.vin&&<span>VIN: <code style={{fontFamily:"DM Mono,monospace"}}>{job.vin}</code></span>}
            {job.engine_no&&<span>Eng: <code style={{fontFamily:"DM Mono,monospace"}}>{job.engine_no}</code></span>}
          </div>
        </div>
        <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",flexShrink:0}}>{job.id}</code>
      </div>

      {/* Parts section */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>
        Select Parts to Include
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:8}}>
        {/* Job items */}
        {jobItemsList.map((item, idx) => (
          <label key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",background:selected.includes(item.id)?"var(--surface2)":"transparent"}}>
            <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggleItem(item.id)}
              style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description}</div>
              {item.part_sku&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{item.part_sku}</div>}
            </div>
            {+item.qty>1&&<span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>×{item.qty}</span>}
          </label>
        ))}
        {/* Extra parts added manually */}
        {extraParts.map(e => (
          <label key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",background:selected.includes(e.id)?"rgba(99,102,241,.06)":"transparent"}}>
            <input type="checkbox" checked={selected.includes(e.id)} onChange={()=>toggleItem(e.id)}
              style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--accent)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.label}</div>
              {e.sku&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginTop:1}}>
                {e.sku}&nbsp;
                {e.saving&&<span style={{color:"var(--text3)"}}>saving…</span>}
                {e.saved&&<span style={{color:"var(--green)",fontWeight:600}}>✓ added to job</span>}
                {e.error&&<span style={{color:"var(--red)",fontWeight:600}}>✗ save failed</span>}
              </div>}
            </div>
            <button onClick={ev=>{ev.preventDefault();removeExtra(e.id);}}
              style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:14,padding:"0 2px",flexShrink:0}}>✕</button>
          </label>
        ))}
        {/* Add extra part row */}
        <div style={{display:"flex",gap:6,padding:"8px 10px"}}>
          <input className="inp" placeholder="+ Type extra part name & press Enter"
            value={extraInput} onChange={e=>setExtraInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addExtra()}
            style={{flex:1,fontSize:12,padding:"5px 10px"}}/>
          <button className="btn btn-ghost btn-xs" onClick={addExtra} style={{flexShrink:0,fontSize:12,padding:"0 10px"}}>Add</button>
        </div>
      </div>
      {jobItemsList.length===0&&extraParts.length===0&&(
        <div style={{fontSize:12,color:"var(--text3)",marginBottom:8,paddingLeft:4}}>No job items yet — type parts above to include them</div>
      )}

      {/* Supplier selector */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",margin:"14px 0 6px"}}>Supplier</div>
      {wsSuppliers.length > 0
        ? <select className="inp" value={supplierId} onChange={e=>{setSupplierId(e.target.value);setManualPhone("");}} style={{marginBottom:8}}>
            <option value="">— Select supplier —</option>
            {wsSuppliers.map(s=>(
              <option key={s.id} value={s.id}>{s.name}{s.phone?` · ${s.phone}`:""}</option>
            ))}
          </select>
        : <div style={{fontSize:12,color:"var(--text3)",marginBottom:6,padding:"8px 12px",background:"var(--surface2)",borderRadius:8}}>
            No suppliers saved yet — go to <strong>WS → Suppliers</strong> tab to add them, or type a number below
          </div>
      }
      <input className="inp" placeholder="Or enter phone number: +27 83 123 4567"
        value={manualPhone} onChange={e=>{setManualPhone(e.target.value);setSupplierId("");}}
        style={{marginBottom:14}}/>

      {/* Custom note */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>
        Custom note <span style={{fontWeight:400,textTransform:"none",fontSize:10}}>(optional — replaces sign-off)</span>
      </div>
      <textarea className="inp" placeholder="e.g. Urgent — needed by tomorrow morning 🙏"
        value={customNote} onChange={e=>setCustomNote(e.target.value)}
        style={{minHeight:46,marginBottom:14,fontSize:13,resize:"vertical"}}/>

      {/* Preview */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Message Preview</div>
      <pre style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",fontSize:12,lineHeight:1.65,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:180,overflowY:"auto",marginBottom:14,color:"var(--text1)",fontFamily:"DM Mono,monospace"}}>
        {msgLines}
      </pre>

      {/* Actions */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {/* Direct WhatsApp (personal number) */}
        {waUrl&&(
          <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}} onClick={()=>logSend(false)}>
            <button className="btn btn-primary" style={{width:"100%",background:"#25D366",border:"none",fontSize:15,padding:"13px 0",fontWeight:700,borderRadius:10}}>
              📲 Send via WhatsApp
            </button>
          </a>
        )}
        {/* WhatsApp Group — copy message then open group */}
        {chosenSupplier?.group_link&&(
          <button style={{width:"100%",background:"#128C7E",border:"none",fontSize:14,padding:"12px 0",fontWeight:700,borderRadius:10,color:"#fff",cursor:"pointer"}}
            onClick={()=>{ logSend(true); navigator.clipboard.writeText(msgLines).then(()=>{ window.open(chosenSupplier.group_link,"_blank"); }); }}>
            👥 Copy & Open Group Chat
          </button>
        )}
        {/* Fallback — nothing selected yet */}
        {!waUrl&&!chosenSupplier?.group_link&&(
          <button disabled style={{width:"100%",fontSize:14,padding:"13px 0",opacity:.45,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"not-allowed"}}>
            📲 Select a supplier or enter a phone above
          </button>
        )}
        <button className="btn btn-ghost" style={{width:"100%",fontSize:13,padding:"10px 0",borderRadius:10}} onClick={copyMsg}>
          {copied ? "✓ Copied!" : "📋 Copy Message"}
        </button>
        {/* Generate digital quote link */}
        {onGenerateLink&&selectedItems.length>0&&(
          <button
            disabled={generatingLink}
            style={{width:"100%",fontSize:13,padding:"11px 0",borderRadius:10,border:"1px solid rgba(56,189,248,.4)",background:"rgba(56,189,248,.08)",color:"#38bdf8",cursor:generatingLink?"not-allowed":"pointer",fontWeight:600}}
            onClick={async()=>{
              setGeneratingLink(true);
              const linkItems=selectedItems.map(i=>({description:i.label,qty:i.qty,sku:i.sku}));
              const info={job_id:job.id,vehicle_reg:job.vehicle_reg||"",supplier_id:chosenSupplier?.id||null,supplier_name:chosenSupplier?.name||"",supplier_phone:chosenSupplier?.phone||manualPhone||"",supplier_vat_inclusive:chosenSupplier?.vat_inclusive||false};
              const url=await onGenerateLink(info,linkItems);
              setGeneratedLink(url);
              setGeneratingLink(false);
            }}>
            {generatingLink?"Generating…":"🔗 Generate Supplier Quote Link"}
          </button>
        )}
        {generatedLink&&(
          <div style={{background:"rgba(56,189,248,.08)",border:"1px solid rgba(56,189,248,.3)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"#38bdf8",fontWeight:700,marginBottom:6}}>🔗 Share this link with supplier:</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input readOnly value={generatedLink} style={{flex:1,fontSize:11,padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface3)",color:"var(--text1)",fontFamily:"monospace"}}
                onFocus={e=>e.target.select()}/>
              <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:11}} onClick={()=>{navigator.clipboard.writeText(generatedLink).then(()=>{setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);});}}>
                {linkCopied?"✓ Copied":"Copy"}
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-ghost" style={{width:"100%",fontSize:13,borderRadius:10}} onClick={onClose}>Close</button>
      </div>

      {/* Send history for this job */}
      {history.length>0&&(
        <div style={{marginTop:18,borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em"}}>
              📋 Send History ({history.length})
            </div>
            <button disabled={refreshing} onClick={()=>{
              const ids=history.map(r=>r.id).filter(Boolean).join(",");
              if(!ids) return;
              setRefreshing(true);
              api.get("ws_sq_replies",`request_id=in.(${ids})&select=*`)
                .then(res=>{ if(Array.isArray(res)) setLocalReplies(res); })
                .catch(()=>{})
                .finally(()=>setRefreshing(false));
            }} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface3)",cursor:refreshing?"not-allowed":"pointer",color:"var(--text2)"}}>
              {refreshing?"…":"🔄 Refresh"}
            </button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {history.map((r,i)=>{
              const parts = (() => { try { return JSON.parse(r.parts_list||"[]"); } catch { return []; } })();
              const dt = r.sent_at ? new Date(r.sent_at).toLocaleString(undefined,{dateStyle:"short",timeStyle:"short"}) : "";
              const existingQuote = quotes.find(q=>q.request_id===r.id);
              const qLines = existingQuote ? (() => { try { return JSON.parse(existingQuote.line_items||"[]"); } catch { return []; } })() : [];
              const digitalReply = localReplies.find(rep=>rep.request_id===r.id);
              const replyItems = digitalReply ? (() => { try { return JSON.parse(digitalReply.items||"[]"); } catch { return []; } })() : [];
              const inStockReplies = replyItems.filter(ri=>ri.condition!=="no_stock");
              const noStockReplies = replyItems.filter(ri=>ri.condition==="no_stock");
              return (
                <div key={r.id||i} style={{background:"var(--surface2)",borderRadius:10,padding:"10px 12px",fontSize:12,border:digitalReply?"1px solid rgba(56,189,248,.3)":existingQuote?"1px solid rgba(52,211,153,.3)":"1px solid transparent"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6}}>
                    <span style={{fontWeight:700,color:"#25D366",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.token?"🔗":"📲"} {r.supplier_name||r.supplier_phone||"Unknown"}
                    </span>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                      {r.token&&<span style={{fontSize:10,background:"rgba(56,189,248,.12)",color:"#38bdf8",borderRadius:4,padding:"1px 5px",fontWeight:600}}>Link</span>}
                      {digitalReply&&<span style={{fontSize:10,background:"rgba(52,211,153,.12)",color:"var(--green)",borderRadius:4,padding:"1px 5px",fontWeight:600}}>Replied ✅</span>}
                      <span style={{fontSize:10,color:"var(--text3)"}}>{dt}</span>
                    </div>
                  </div>
                  <div style={{color:"var(--text2)",lineHeight:1.6,marginBottom:6}}>{parts.join(" · ")||"—"}</div>

                  {/* Digital reply summary */}
                  {digitalReply&&replyItems.length>0&&(
                    <div style={{background:"rgba(56,189,248,.06)",border:"1px solid rgba(56,189,248,.2)",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                      <div style={{fontSize:11,color:"#38bdf8",fontWeight:700,marginBottom:6}}>🔗 Supplier Digital Reply</div>
                      {inStockReplies.map((ri,j)=>(
                        <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid rgba(56,189,248,.1)"}}>
                          <div style={{flex:1}}>
                            <span style={{color:"var(--text1)"}}>{ri.description}</span>
                            {ri.supplier_part_no&&<span style={{color:"var(--text3)",fontSize:10,marginLeft:6,fontFamily:"monospace"}}>{ri.supplier_part_no}</span>}
                            {ri.notes&&<span style={{color:"var(--text3)",fontSize:10,marginLeft:6,fontStyle:"italic"}}>{ri.notes}</span>}
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                            <span style={{fontSize:10,color:ri.condition==="in_stock"?"var(--green)":"#fbbf24",fontWeight:600}}>{ri.condition==="in_stock"?"✅ Stock":"📦 Order"}</span>
                            {+ri.price>0&&<span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{(+ri.price).toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                          </div>
                        </div>
                      ))}
                      {noStockReplies.length>0&&(
                        <div style={{marginTop:4,padding:"3px 0"}}>
                          <span style={{fontSize:10,color:"var(--red)",fontWeight:600}}>❌ No Stock: </span>
                          <span style={{color:"var(--text3)",fontSize:11}}>{noStockReplies.map(ri=>ri.description).join(", ")}</span>
                        </div>
                      )}
                      {onCreatePO&&inStockReplies.some(ri=>+ri.price>0)&&(
                        <button onClick={()=>onCreatePO({supplier_name:r.supplier_name||"",supplier_id:r.supplier_id||null,job_id:job.id,items:inStockReplies.map(ri=>({description:ri.description,sku:ri.sku||"",supplier_part_no:ri.supplier_part_no||"",qty:ri.qty||1,unit_price:+ri.price||0,condition:ri.condition==="can_order"?"to_order":"in_stock"}))})}
                          style={{marginTop:8,fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(56,189,248,.4)",background:"rgba(56,189,248,.1)",cursor:"pointer",color:"#38bdf8",fontWeight:600,width:"100%"}}>
                          📦 Create Purchase Order from Reply
                        </button>
                      )}
                    </div>
                  )}

                  {/* Manual quote summary if entered */}
                  {existingQuote&&(
                    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:6,padding:"6px 10px",background:"rgba(52,211,153,.08)",borderRadius:7}}>
                      <span style={{fontSize:11,color:"var(--green)",fontWeight:700}}>💰 Quote received</span>
                      {qLines.filter(l=>+l.price>0).map((l,j)=>(
                        <span key={j} style={{fontSize:11,color:"var(--text2)"}}>{l.name}: <strong>{(+(l.vat_incl_price||l.price)).toLocaleString(undefined,{minimumFractionDigits:2})}</strong>{l.vat_incl_price&&l.vat_incl_price!==l.price?<span style={{fontSize:10,color:"#f59e0b"}}> incl.VAT</span>:null}</span>
                      ))}
                      {existingQuote.total>0&&<span style={{fontSize:12,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginLeft:"auto"}}>Total: {(+existingQuote.total).toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button
                      onClick={()=>setQuoteTarget({request:r, existingQuote: existingQuote||null})}
                      style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid var(--border)",background:existingQuote?"rgba(52,211,153,.12)":"var(--surface3)",cursor:"pointer",color:existingQuote?"var(--green)":"var(--text2)",fontWeight:600}}>
                      {existingQuote?"✏️ Edit Quote":"💰 Enter Quote"}
                    </button>
                    {onDeleteSend&&(
                      <button
                        onClick={()=>{ if(window.confirm("Delete this send record?")) onDeleteSend(r.id); }}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.08)",cursor:"pointer",color:"#ef4444",fontWeight:600}}>
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quote entry modal */}
      {quoteTarget&&(
        <SupplierQuoteModal
          request={quoteTarget.request}
          existingQuote={quoteTarget.existingQuote}
          settings={settings}
          onSave={async(d)=>{ if(onSaveQuote) await onSaveQuote(d); setQuoteTarget(null); }}
          onClose={()=>setQuoteTarget(null)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP JOB DETAIL
// ═══════════════════════════════════════════════════════════════
function WorkshopJobDetail({job,items,invoice,quote,parts,partFitments=[],vehicles=[],settings,wsVehicles=[],wsCustomers=[],wsStock=[],wsServices=[],suppliers=[],wsSuppliers=[],wsSupplierRequests=[],wsSupplierQuotes=[],wsPurchaseOrders=[],onSaveWsSupplierRequest,onDeleteWsSupplierRequest,onSaveWsSupplierQuote,onSaveWsStock,onBack,onSaveJob,onDeleteJob,onMoveJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,onSaveWsVehicle,wsRole="main",sqReplies=[],onGenerateWsQuoteLink,onSaveWsPurchaseOrder,onViewPurchaseOrders,onViewPO,onSaveWsLicenceRenewal,wsId=null,wsProfile={},t,lang}) {
  // Local currency formatter using the workshop's own settings currency
  const _wsC = curSym(settings.currency||getSettings().currency);
  const fmtAmt = v => `${_wsC}${(+v||0).toLocaleString()}`;
  const [editJob,      setEditJob]      = useState(false);
  const [addingItem,   setAddingItem]   = useState(null); // null | 'part' | 'labour'
  const [creatingInv,  setCreatingInv]  = useState(false);
  const [editingInv,   setEditingInv]   = useState(false);
  const [deletingInv,  setDeletingInv]  = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [statementModal,setStatementModal]=useState(false);
  const [quoteModal,   setQuoteModal]   = useState(false);  // create/edit quote
  const [deletingQuote,setDeletingQuote]= useState(false);
  const [quoteSrcForInv,setQuoteSrcForInv]= useState(null); // quote being converted to invoice
  const [approvalModal, setApprovalModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [moveModal,     setMoveModal]     = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [createPoOpen,  setCreatePoOpen]  = useState(false);
  const [jobTab,        setJobTab]        = useState("car");
  const [oeSearch,      setOeSearch]      = useState("");
  const [editPriceId,   setEditPriceId]   = useState(null);
  const [editPriceVal,  setEditPriceVal]  = useState("");
  const [editQtyId,     setEditQtyId]     = useState(null);
  const [editQtyVal,    setEditQtyVal]    = useState("");
  const [editMarkupId,  setEditMarkupId]  = useState(null);
  const [editMarkupVal, setEditMarkupVal] = useState("");
  const [returnQuoteOpen,  setReturnQuoteOpen]  = useState(false);
  const [returnQuoteTarget,setReturnQuoteTarget]= useState(null); // {request, existingQuote}
  const [movePinOpen,      setMovePinOpen]      = useState(false);
  const [movePinVal,       setMovePinVal]        = useState("");
  const [movePinErr,       setMovePinErr]        = useState("");
  const [photoLightbox,    setPhotoLightbox]    = useState(null); // null | index into visible photos
  const [renewalModal,  setRenewalModal]  = useState(false);
  const [isMobile,      setIsMobile]      = useState(()=>window.innerWidth<=700);
  useEffect(()=>{const fn=()=>setIsMobile(window.innerWidth<=700);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  const vehicleRecord = wsVehicles.find(v=>v.id===job.workshop_vehicle_id)||null;
  const [localPhotoOverrides, setLocalPhotoOverrides] = useState({});
  const [editPhotos, setEditPhotos] = useState(false);
  const vehiclePhotos = wsVehicles.reduce((acc,v)=>v.id===job.workshop_vehicle_id?{
    front: localPhotoOverrides.front!==undefined ? localPhotoOverrides.front : (v.photo_front||""),
    rear:  localPhotoOverrides.rear !==undefined ? localPhotoOverrides.rear  : (v.photo_rear ||""),
    side:  localPhotoOverrides.side !==undefined ? localPhotoOverrides.side  : (v.photo_side ||""),
  }:acc,{front:"",rear:"",side:""});

  const handleVehiclePhotoChange = async (field, key, url) => {
    setLocalPhotoOverrides(p=>({...p,[key]:url}));
    if(vehicleRecord) {
      try { await api.patch("workshop_vehicles","id",vehicleRecord.id,{[field]:url}); }
      catch(e) { console.error("Photo save failed",e); }
    }
  };

  // ── Check-in Checklist ────────────────────────────────────────
  const [checklist,       setChecklist]       = useState({}); // { item_key: {status,note,photo_url} }
  const [checklistOpen,   setChecklistOpen]   = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [clUploading,     setClUploading]     = useState({}); // { item_key: bool }
  const clCamRefs = useRef({});

  useEffect(()=>{
    if(jobTab!=="inspect"||checklistLoaded) return;
    api.get("workshop_job_checklist",`job_id=eq.${job.id}`)
      .then(rows=>{
        const map={};
        (Array.isArray(rows)?rows:[]).forEach(r=>{ map[r.item_key]={status:r.status||"pending",note:r.note||"",photo_url:r.photo_url||"",id:r.id}; });
        setChecklist(map);
        setChecklistLoaded(true);
      })
      .catch(()=>setChecklistLoaded(true));
  },[jobTab,checklistLoaded,job.id]);

  const saveChecklistItem=async(key,patch)=>{
    const current=checklist[key]||{status:"pending",note:"",photo_url:""};
    const updated={...current,...patch};
    setChecklist(p=>({...p,[key]:updated}));
    try{
      const id=updated.id||makeId("CL");
      const rec={id,job_id:job.id,item_key:key,status:updated.status,note:updated.note||"",photo_url:updated.photo_url||""};
      await api.upsert("workshop_job_checklist",rec);
      if(!updated.id) setChecklist(p=>({...p,[key]:{...updated,id}}));
    }catch(e){ console.error("Checklist save error:",e); alert("Save failed — make sure the workshop_job_checklist table exists in Supabase."); }
  };

  const uploadChecklistPhoto=async(key,dataUrl)=>{
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||(window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    if(!SCRIPT_URL){ alert("No Script URL configured in Settings."); return; }
    setClUploading(p=>({...p,[key]:true}));
    try{
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1200; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.85));
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const now=new Date(); const pad2=n=>String(n).padStart(2,"0");
      const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const timeStr=`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
      const reg=(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase();
      const folderPath=`Tim_Car_Phot/${reg}/Checklist`;
      const filename=`CL_${key}_${dateStr.replace(/-/g,"")}_${timeStr.replace(/-/g,"")}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      if(result.success){ await saveChecklistItem(key,{photo_url:result.url}); }
      else { alert("Photo upload failed: "+(result.error||"Unknown error")); }
    }catch(e){ alert("Upload error: "+e.message); }
    finally{ setClUploading(p=>({...p,[key]:false})); }
  };

  // ── Job documents ─────────────────────────────────────────────
  const [jobDocs,       setJobDocs]       = useState([]);
  const [docName,       setDocName]       = useState("");
  const [docNotes,      setDocNotes]      = useState("");
  const [docFile,       setDocFile]       = useState(null);
  const [docPreview,    setDocPreview]    = useState(null);
  const [docUploading,  setDocUploading]  = useState(false);
  const [viewDocImg,    setViewDocImg]    = useState(null);
  const docFileRef = useRef(null);

  useEffect(()=>{
    api.get("workshop_documents",`job_id=eq.${job.id}&order=uploaded_at.desc`)
      .then(r=>setJobDocs(Array.isArray(r)?r:[]))
      .catch(()=>setJobDocs([]));
  },[job.id]);

  const handleDocFile=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    setDocFile(f);
    setDocName(prev=>prev||f.name.replace(/\.[^.]+$/,""));
    if(f.type.startsWith("image/")){
      const r=new FileReader(); r.onload=ev=>setDocPreview(ev.target.result); r.readAsDataURL(f);
    } else { setDocPreview(null); }
  };

  const uploadJobDoc=async()=>{
    if(!docFile){alert("Choose a file first");return;}
    if(!docName.trim()){alert("Enter a document name");return;}
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
    if(!SCRIPT_URL){alert("No Google Drive Script URL in Settings");return;}
    setDocUploading(true);
    try{
      const isPdf=docFile.type==="application/pdf";
      let base64,mimeType,filename;
      if(isPdf){
        base64=await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=ev=>{const b=new Uint8Array(ev.target.result);let s="";b.forEach(x=>{s+=String.fromCharCode(x);});res("data:application/pdf;base64,"+btoa(s));};
          r.onerror=rej; r.readAsArrayBuffer(docFile);
        });
        mimeType="application/pdf"; filename=`${docName.trim().replace(/\s+/g,"_")}_${Date.now()}.pdf`;
      } else {
        base64=await new Promise((res,rej)=>{
          const img=new Image();
          img.onload=()=>{
            const MAX=1600; const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const ratio=Math.min(MAX/w,MAX/h);w=Math.round(w*ratio);h=Math.round(h*ratio);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            res(canvas.toDataURL("image/jpeg",0.88));
          };
          img.onerror=rej; img.src=docPreview;
        });
        mimeType="image/jpeg"; filename=`${docName.trim().replace(/\s+/g,"_")}_${Date.now()}.jpg`;
      }
      const folderPath=`Tim_Car_Phot/${(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase()}/Documents`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType,folderPath})});
      const result=await resp.json();
      if(!result.success) throw new Error(result.error||"Upload failed");
      const rec={
        id:makeId("WSD"),job_id:job.id,workshop_id:job.workshop_id||null,customer_id:job.workshop_customer_id||null,
        name:docName.trim(),notes:docNotes.trim()||null,
        file_url:result.url,file_type:isPdf?"pdf":"image",mime_type:mimeType,filename,
        uploaded_at:new Date().toISOString(),
      };
      const saved=await api.insert("workshop_documents",rec);
      if(saved&&!Array.isArray(saved)&&saved.message) throw new Error(saved.message);
      setJobDocs(p=>[rec,...p]);
      setDocName(""); setDocNotes(""); setDocFile(null); setDocPreview(null);
      if(docFileRef.current) docFileRef.current.value="";
    }catch(e){alert("Upload failed: "+e.message);}
    finally{setDocUploading(false);}
  };

  const deleteJobDoc=async(id)=>{
    await api.delete("workshop_documents","id",id);
    setJobDocs(p=>p.filter(d=>d.id!==id));
  };
  const [editDocId,setEditDocId]=useState(null);
  const [editDocVal,setEditDocVal]=useState({name:"",notes:""});
  const saveDocEdit=async()=>{
    if(!editDocVal.name.trim()){alert("Name required");return;}
    await api.patch("workshop_documents","id",editDocId,{name:editDocVal.name.trim(),notes:editDocVal.notes.trim()||null});
    setJobDocs(p=>p.map(d=>d.id===editDocId?{...d,name:editDocVal.name.trim(),notes:editDocVal.notes.trim()||null}:d));
    setEditDocId(null);
  };

  // ── Job photos ────────────────────────────────────────────────
  const [savedPhotos,   setSavedPhotos]   = useState([]);      // from DB
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploadPhotos,  setUploadPhotos]  = useState([]);      // in-progress uploads
  const [viewPhoto,     setViewPhoto]     = useState(null);    // full-screen preview
  const jobPhotoCamRef = useRef(null);
  const jobPhotoGalRef = useRef(null);
  const jobPhotoCounter = useRef(0);

  // Load saved photos from DB when job changes
  useEffect(()=>{
    setLoadingPhotos(true);
    api.get("workshop_job_photos",`job_id=eq.${job.id}&order=created_at.asc`)
      .then(r=>{ setSavedPhotos(Array.isArray(r)?r:[]); })
      .catch(()=>{ setSavedPhotos([]); })
      .finally(()=>setLoadingPhotos(false));
  },[job.id]);

  const uploadJobPhoto=async(uploadId,dataUrl)=>{
    const SCRIPT_URL=
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    const setUploadStatus=(s,extra={})=>setUploadPhotos(p=>p.map(x=>x.id===uploadId?{...x,status:s,...extra}:x));
    if(!SCRIPT_URL){ setUploadStatus("error",{error:"No Script URL in Settings"}); return; }
    setUploadStatus("uploading");
    try{
      // resize to max 1600px
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1600; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.88));
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const now=new Date();
      const pad2=n=>String(n).padStart(2,"0");
      const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const timeStr=`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
      const reg=(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase();
      const folderPath=`Tim_Car_Phot/${reg}/${dateStr}`;
      const n=String(uploadId).padStart(3,"0");
      const filename=`${dateStr.replace(/-/g,"")}_${timeStr.replace(/-/g,"")}_${n}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      if(result.success){
        // Save URL to DB
        const rec={id:makeId("PH"),job_id:job.id,url:result.url,folder_path:folderPath};
        await api.insert("workshop_job_photos",rec);
        setSavedPhotos(p=>[...p,rec]);
        setUploadStatus("done",{url:result.url});
      } else {
        setUploadStatus("error",{error:result.error||"Upload failed"});
      }
    }catch(e){
      setUploadStatus("error",{error:e.message});
    }
  };

  const handleJobPhotoFile=(e)=>{
    const files=Array.from(e.target.files||[]); e.target.value="";
    if(!files.length) return;
    files.forEach(file=>{
      const isImage = file.type.startsWith("image/") || file.type==="" ||
        /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
      if(!isImage) return;
      jobPhotoCounter.current+=1;
      const uid=jobPhotoCounter.current;
      const fr=new FileReader();
      fr.onload=ev=>{
        const dataUrl=ev.target.result;
        setUploadPhotos(p=>[...p,{id:uid,dataUrl,status:"pending",url:null,error:null}]);
        uploadJobPhoto(uid,dataUrl);
      };
      fr.readAsDataURL(file);
    });
  };

  const deleteJobPhoto=async(photoId)=>{
    if(!confirm("Delete this photo?")) return;
    await api.delete("workshop_job_photos","id",photoId);
    setSavedPhotos(p=>p.filter(x=>x.id!==photoId));
  };

  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const tax      = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+tax;

  const JOB_STATUSES = ["Pending","In Progress","Done","Delivered"];
  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};

  // VIN search lookup helper
  const vinSearchLinks = job.vin ? [
    {label:"PartsOuq",  icon:"🔩", color:"var(--blue)",   bg:"rgba(96,165,250,.13)",  href:`https://partsouq.com/en/search/all?q=${encodeURIComponent(job.vin)}`},
    {label:"RealOEM",   icon:"🚗", color:"var(--green)",  bg:"rgba(52,211,153,.13)",  href:`https://www.realoem.com/bmw/enUS/select?vin=${encodeURIComponent(job.vin)}`},
    {label:"VIN Decode",icon:"🔎", color:"var(--yellow)", bg:"rgba(251,191,36,.13)",  href:`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(job.vin)}`},
    {label:"Willard 🔋",icon:"🔋", color:"#ef4444",       bg:"rgba(220,38,38,.11)",   href:"https://willard.co.za/battery-selection-tool/"},
    {label:"VARTA 🔋",  icon:"⚡", color:"#6366f1",       bg:"rgba(99,102,241,.11)",  href:"https://www.varta-automotive.com/battery-finder"},
    {label:"Safeline",  icon:"🛑", color:"#dc2626",       bg:"rgba(220,38,38,.09)",   href:"https://safelinebrakes.co.za/"},
  ] : [];

  return (
    <div className="fu">
      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>{t.wsBack}</button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.customer_name}</h1>
          <div style={{fontSize:12,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",marginTop:2}}>
            <code style={{fontFamily:"DM Mono,monospace"}}>{job.id}</code>
            <span>·</span><span>{job.date_in}</span>
            {job.vehicle_reg&&<><span>·</span><strong>🚗 {job.vehicle_reg}</strong></>}
          </div>
        </div>
        <span className="badge" style={{background:"rgba(96,165,250,.12)",color:ST_COLOR[job.status]||"var(--blue)",fontSize:13,padding:"5px 12px",flexShrink:0}}>
          {tSt(job.status)}
        </span>
      </div>

      {/* ── Status bar ── */}
      <div className="card" style={{padding:"10px 14px",marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,color:"var(--text3)",marginRight:2}}>{t.status}:</span>
        {(wsRole==="mechanic"?["Pending","In Progress"]:JOB_STATUSES).map(s=>(
          <button key={s} className={`btn btn-xs ${job.status===s?"btn-primary":"btn-ghost"}`}
            onClick={()=>onSaveJob({...job,status:s})}>{tSt(s)}</button>
        ))}
        {(job.status==="Done"||job.status==="Delivered")&&(job.customer_phone||job.customer_name)&&(()=>{
          const phone=(job.customer_phone||"").replace(/\D/g,"");
          const name=job.customer_name||"there";
          const reg=job.vehicle_reg?`your ${job.vehicle_make?`${job.vehicle_make} `:""}${job.vehicle_model?`${job.vehicle_model} `:""}(${job.vehicle_reg})`:"your vehicle";
          const shopName=wsProfile?.name||settings?.shop_name||"Workshop";
          const shopPhone=wsProfile?.phone||settings?.phone||"";
          const msg=`Hi ${name}! 🎉 Great news — ${reg} is ready for collection at *${shopName}*.\n\nPlease contact us to arrange collection${shopPhone?` on ${shopPhone}`:""}.`;
          if(!phone) return null;
          return (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
              className="btn btn-ghost btn-xs"
              style={{color:"#25D366",borderColor:"rgba(37,211,102,.35)",marginLeft:"auto",textDecoration:"none"}}>
              📱 Car Ready — Notify Customer
            </a>
          );
        })()}
      </div>

      {/* ── Tab bar ── */}
      {isMobile ? (
        /* Mobile: icon pill grid — all 6 fit on one row, no scrolling */
        <div style={{display:"grid",gridTemplateColumns:`repeat(${wsRole==="mechanic"?4:6},1fr)`,gap:6,marginBottom:14}}>
          {[
            {id:"car",     icon:"🚗", label:t.wsTabCar},
            ...(wsRole!=="mechanic"?[
              {id:"quote",   icon:"📝", label:t.wsTabQuote,  badge:quote?{accepted:"✓",converted:"↗",declined:"✗"}[quote.status]||null:null},
            ]:[]),
            {id:"inspect", icon:"✅", label:t.wsTabInspect, badge:checklistLoaded?`${CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")!=="pending").length}/${CHECKLIST_ITEMS.length}`:null},
            {id:"photos",  icon:"📷", label:t.wsTabPhotos,  badge:savedPhotos.length>0?savedPhotos.length:null},
            {id:"docs",    icon:"📎", label:t.wsTabDocs,    badge:jobDocs.length>0?jobDocs.length:null},
            ...(wsRole!=="mechanic"?[
              {id:"invoice", icon:"🧾", label:t.invoice,     badge:invoice?{paid:"✓",partial:"½"}[invoice.status]||null:null},
            ]:[]),
          ].map(tab=>{
            const active=jobTab===tab.id;
            return (
              <button key={tab.id} onClick={()=>setJobTab(tab.id)} style={{
                position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                padding:"8px 4px",border:"none",borderRadius:10,cursor:"pointer",
                background:active?"var(--accent)":"var(--surface2)",
                color:active?"#fff":"var(--text3)",
                transition:"background .15s",
              }}>
                <span style={{fontSize:20,lineHeight:1}}>{tab.icon}</span>
                <span style={{fontSize:9,fontWeight:active?700:500,letterSpacing:".02em",lineHeight:1,whiteSpace:"nowrap"}}>{tab.label}</span>
                {tab.badge!=null&&(
                  <span style={{
                    position:"absolute",top:4,right:6,fontSize:9,fontWeight:700,
                    background:active?"rgba(255,255,255,.3)":"var(--accent)",
                    color:active?"#fff":"#fff",borderRadius:99,padding:"1px 4px",lineHeight:1.4,minWidth:14,textAlign:"center"
                  }}>{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* Desktop: underline tabs */
        <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:14,overflowX:"auto",gap:0,scrollbarWidth:"none"}}>
          {[
            {id:"car",     label:`🚗 ${t.wsTabCar}`},
            ...(wsRole!=="mechanic"?[
              {id:"quote",   label:`📝 ${t.wsTabQuote}`,   badge:quote?{accepted:"✓",converted:"↗",declined:"✗"}[quote.status]||null:null},
            ]:[]),
            {id:"inspect", label:`✅ ${t.wsTabInspect}`, badge:checklistLoaded?`${CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")!=="pending").length}/${CHECKLIST_ITEMS.length}`:null},
            {id:"photos",  label:`📷 ${t.wsTabPhotos}`,  badge:savedPhotos.length>0?savedPhotos.length:null},
            {id:"docs",    label:`📎 ${t.wsTabDocs}`,     badge:jobDocs.length>0?jobDocs.length:null},
            ...(wsRole!=="mechanic"?[
              {id:"invoice", label:`🧾 ${t.invoice}`, badge:invoice?{paid:"✓",partial:"½"}[invoice.status]||null:null},
            ]:[]),
          ].map(tab=>(
            <button key={tab.id} onClick={()=>setJobTab(tab.id)} style={{
              padding:"9px 13px",border:"none",background:"none",cursor:"pointer",flexShrink:0,
              fontSize:13,fontWeight:jobTab===tab.id?700:400,
              color:jobTab===tab.id?"var(--accent)":"var(--text2)",
              borderBottom:jobTab===tab.id?"2px solid var(--accent)":"2px solid transparent",
              marginBottom:-1,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,
            }}>
              {tab.label}
              {tab.badge!=null&&<span style={{fontSize:10,fontWeight:600,opacity:.7,background:"var(--surface2)",borderRadius:99,padding:"1px 5px"}}>{tab.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ══ CAR INFO tab ══ */}
      {jobTab==="car"&&(
        <div className="card" style={{padding:16,marginBottom:14}}>
          {/* Action buttons */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {wsRole!=="mechanic"&&<button className="btn btn-ghost btn-sm" onClick={()=>setEditJob(true)}>✏️ {t.edit}</button>}
            <button className="btn btn-ghost btn-sm" onClick={()=>printJobCardLabel(job,settings)}>🏷️ {t.wsLabel}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setDeliveryModal(true)}>🚗 {t.wsCollect}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              const lines=["============================","  VEHICLE INFO","============================",
                `Plate    : ${job.vehicle_reg||"—"}`,`Make     : ${job.vehicle_make||"—"}`,
                `Model    : ${job.vehicle_model||"—"}`,`Year     : ${job.vehicle_year||"—"}`,
                `Color    : ${job.vehicle_color||"—"}`,`Mileage  : ${job.mileage?job.mileage.toLocaleString()+" km":"—"}`,
                job.vin?`VIN      : ${job.vin}`:"",job.engine_no?`Engine No: ${job.engine_no}`:"",
                "============================",].filter(Boolean).join("\r\n");
              const a=document.createElement("a");
              a.href=URL.createObjectURL(new Blob([lines],{type:"text/plain"}));
              a.download=`VehicleInfo_${job.vehicle_reg||job.id}.txt`; a.click();
            }}>⬇️ {t.wsInfoBtn}</button>
            {wsRole==="main"&&onMoveJob&&<button className="btn btn-ghost btn-sm" style={{color:"var(--yellow)"}} onClick={()=>{ if(wsProfile?.move_pin){setMovePinVal("");setMovePinErr("");setMovePinOpen(true);}else{setMoveModal(true);} }}>🔀 {t.wsMove}</button>}
            {wsRole==="main"&&onDeleteJob&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm(`Delete job ${job.id} for ${job.customer_name}?\n\nThis cannot be undone.`))onDeleteJob();}}>🗑 {t.delete}</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:12}}>
            {[
              [`🚗 ${t.wsPlate}`,job.vehicle_reg],
              [t.wsMakeModel,`${job.vehicle_make||""} ${job.vehicle_model||""}`.trim()||"—"],
              [t.year,job.vehicle_year||"—"],
              [t.vehicleColor,job.vehicle_color||"—"],
              [t.mileage,job.mileage?`${job.mileage.toLocaleString()} km`:"—"],
              [`👷 ${t.mechanic}`,job.mechanic||"—"],
              [`📅 ${t.dateIn}`,job.date_in||"—"],
              [`📅 ${t.dateOut}`,job.date_out||"—"],
            ].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{l}</div>
                <div style={{fontWeight:600,fontSize:13}}>{v||"—"}</div>
              </div>
            ))}
            {job.engine_no&&(
              <div>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{t.engine} No</div>
                <code style={{fontWeight:600,fontSize:12,fontFamily:"DM Mono,monospace"}}>{job.engine_no}</code>
              </div>
            )}
            {(vehicleRecord?.licence_disc_expiry||job?.licence_disc_expiry)&&(
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{t.wsLicenceExpiry}</div>
                {(()=>{
                  const exp = vehicleRecord?.licence_disc_expiry||job.licence_disc_expiry;
                  const expired = new Date(exp)<new Date();
                  return (
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <div style={{fontWeight:700,fontSize:13,color:expired?"var(--red)":"var(--green)"}}>
                        {exp} {expired?`⚠️ ${t.wsExpired}`:"✅"}
                      </div>
                      {onSaveWsLicenceRenewal&&(
                        <button onClick={()=>setRenewalModal(true)}
                          style={{fontSize:11,padding:"4px 12px",background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.4)",borderRadius:12,cursor:"pointer",color:"#16a34a",fontWeight:600,whiteSpace:"nowrap"}}>
                          🪪 {t.wsRequestRenewal}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* VIN + Search tools */}
          {job.vin&&(
            <div style={{borderTop:"1px solid var(--border)",paddingTop:12}}>
              <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>🔍 {t.wsVinSearch}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                <code style={{fontFamily:"DM Mono,monospace",fontSize:14,fontWeight:700,letterSpacing:"1px",background:"var(--surface2)",padding:"5px 12px",borderRadius:7,border:"1px solid var(--border)"}}>{job.vin}</code>
                <button onClick={()=>navigator.clipboard.writeText(job.vin).then(()=>alert("VIN copied!"))}
                  style={{fontSize:11,padding:"4px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",color:"var(--text3)"}}>📋 {t.wsCopy}</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {vinSearchLinks.map(lk=>(
                  <a key={lk.label} href={lk.href} target="_blank" rel="noopener noreferrer"
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                      background:lk.bg,border:`1px solid ${lk.color}44`,borderRadius:10,
                      color:lk.color,textDecoration:"none",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                    <span style={{fontSize:20}}>{lk.icon}</span>
                    <span>{lk.label}</span>
                  </a>
                ))}
                <button onClick={()=>{navigator.clipboard.writeText(job.vin);window.open("https://www.amayama.com","_blank");}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                    background:"rgba(14,165,233,.12)",border:"1px solid rgba(14,165,233,.3)",borderRadius:10,
                    color:"#0ea5e9",cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:20}}>🔧</span>
                  <span>Amayama 📋</span>
                </button>
                <button onClick={()=>{navigator.clipboard.writeText(job.vin);alert(`VIN copied!\n\nPaste it into WolfOil's VIN field.`);window.open("https://za.wolfoil.com/en-us/oil-finder","_blank");}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                    background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.3)",borderRadius:10,
                    color:"#f97316",cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:20}}>🛢️</span>
                  <span>WolfOil</span>
                </button>
              </div>
              {/* OE Number search */}
              <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:10}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>🔎 {t.wsOeSearch}</div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{flex:1,position:"relative",display:"flex",alignItems:"center"}}>
                    <input
                      value={oeSearch} onChange={e=>setOeSearch(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&oeSearch.trim()) window.open(`https://partsfinder.goldwagen.com/partsfinder?stext=${encodeURIComponent(oeSearch.trim())}`, "_blank"); }}
                      placeholder="Enter OE / part number…"
                      style={{width:"100%",fontFamily:"DM Mono,monospace",fontSize:13,padding:"6px 30px 6px 10px",borderRadius:7,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)",outline:"none",boxSizing:"border-box"}}/>
                    {oeSearch&&(
                      <button onClick={()=>setOeSearch("")}
                        style={{position:"absolute",right:6,background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:14,lineHeight:1,padding:0}}>✕</button>
                    )}
                  </div>
                  <button
                    onClick={()=>{ if(oeSearch.trim()) window.open(`https://partsfinder.goldwagen.com/partsfinder?stext=${encodeURIComponent(oeSearch.trim())}`, "_blank"); }}
                    disabled={!oeSearch.trim()}
                    style={{padding:"6px 14px",borderRadius:7,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:12,cursor:oeSearch.trim()?"pointer":"default",opacity:oeSearch.trim()?1:.45}}>
                    Search
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Complaint / Diagnosis / Return Reason */}
          {job.complaint&&(
            <div style={{marginTop:12}}>
              <style>{`@keyframes complaint-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.35)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}`}</style>
              <div style={{
                background:"rgba(239,68,68,.07)",
                border:"2px solid rgba(239,68,68,.6)",
                borderRadius:10,
                padding:"10px 14px",
                animation:"complaint-pulse 2.4s ease-in-out infinite",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:16}}>⚠️</span>
                  <span style={{fontSize:10,fontWeight:800,color:"#ef4444",textTransform:"uppercase",letterSpacing:".08em"}}>Customer Complaint</span>
                </div>
                <div style={{fontSize:15,fontWeight:700,color:"#ef4444",lineHeight:1.55}}>{job.complaint}</div>
              </div>
            </div>
          )}
          {job.diagnosis&&<div style={{marginTop:10}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>🔍 Diagnosis</div>
            <div style={{fontSize:13,lineHeight:1.6,color:"var(--blue)"}}>{job.diagnosis}</div>
          </div>}
          {job.return_reason&&<div style={{marginTop:10,padding:"8px 12px",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>🔄 Return Reason</div>
            <div style={{fontSize:13,color:"var(--yellow)"}}>{job.return_reason}</div>
            {job.parent_job_id&&<div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Original job: <code style={{fontFamily:"DM Mono,monospace"}}>{job.parent_job_id}</code></div>}
          </div>}
          {job.notes&&<div style={{marginTop:10}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>📝 Notes</div>
            <div style={{fontSize:13,lineHeight:1.6,color:"var(--text2)"}}>{job.notes}</div>
          </div>}

          {/* ── Profile Photos ── */}
          <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>📸 Profile Photos</div>
              {vehicleRecord&&(
                <button onClick={()=>setEditPhotos(p=>!p)}
                  style={{fontSize:11,padding:"3px 10px",background:editPhotos?"var(--accent)":"var(--surface2)",color:editPhotos?"#fff":"var(--text2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",fontWeight:600}}>
                  {editPhotos?"✓ Done":"✏️ Edit Photos"}
                </button>
              )}
            </div>
            {editPhotos&&vehicleRecord?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {field:"photo_front",key:"front",label:"Front"},
                  {field:"photo_rear", key:"rear", label:"Rear"},
                  {field:"photo_side", key:"side", label:"Side"},
                ].map(({field,key,label})=>(
                  <VehiclePhotoUploader key={field} label={label} url={vehiclePhotos[key]}
                    vehicleId={vehicleRecord.id} make={vehicleRecord.make||"vehicle"}
                    reg={vehicleRecord.reg||job.vehicle_reg} viewName={key}
                    onChange={url=>handleVehiclePhotoChange(field,key,url)}/>
                ))}
              </div>
            ):(vehiclePhotos.front||vehiclePhotos.rear||vehiclePhotos.side)?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {(()=>{
                  const allPhotos=[
                    {url:vehiclePhotos.front,label:"Front"},
                    {url:vehiclePhotos.rear, label:"Rear"},
                    {url:vehiclePhotos.side, label:"Side"},
                  ];
                  const visiblePhotos=allPhotos.filter(p=>p.url);
                  return allPhotos.map(({url,label})=>(
                  <div key={label} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface3)",aspectRatio:"4/3",cursor:url?"pointer":undefined}}
                    onClick={url?()=>setPhotoLightbox(visiblePhotos.findIndex(p=>p.label===label)):undefined}>
                    {url
                      ?<DriveImg url={url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text3)",fontSize:12}}>—</div>
                    }
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.45)",color:"#fff",textAlign:"center",fontSize:10,padding:"2px 0",fontWeight:600}}>{label}</div>
                  </div>
                  ));
                })()}
              </div>
            ):(
              <div style={{textAlign:"center",padding:12,background:"var(--surface2)",borderRadius:8,color:"var(--text3)",fontSize:12}}>
                No profile photos — tap Edit Photos to add
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {photoLightbox!==null&&(()=>{
        const visiblePhotos=[
          {url:vehiclePhotos.front,label:"Front"},
          {url:vehiclePhotos.rear, label:"Rear"},
          {url:vehiclePhotos.side, label:"Side"},
        ].filter(p=>p.url);
        const idx=((photoLightbox%visiblePhotos.length)+visiblePhotos.length)%visiblePhotos.length;
        const photo=visiblePhotos[idx];
        const canNav=visiblePhotos.length>1;
        return(
          <div onClick={()=>setPhotoLightbox(null)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {/* Close */}
            <button onClick={e=>{e.stopPropagation();setPhotoLightbox(null);}}
              style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,fontSize:20,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            {/* Prev arrow */}
            {canNav&&<button onClick={e=>{e.stopPropagation();setPhotoLightbox(idx-1);}}
              style={{position:"absolute",left:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:48,height:48,fontSize:24,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>}
            {/* Image */}
            <div onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"85vh",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
              <img src={photo.url} alt={photo.label} style={{maxWidth:"90vw",maxHeight:"78vh",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,.6)"}}/>
              <div style={{color:"#fff",fontWeight:700,fontSize:14,letterSpacing:".05em"}}>{photo.label} <span style={{opacity:.5,fontWeight:400,fontSize:12}}>{idx+1} / {visiblePhotos.length}</span></div>
            </div>
            {/* Next arrow */}
            {canNav&&<button onClick={e=>{e.stopPropagation();setPhotoLightbox(idx+1);}}
              style={{position:"absolute",right:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:48,height:48,fontSize:24,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>}
          </div>
        );
      })()}

      {/* ══ INSPECTION tab ══ */}
      {jobTab==="inspect"&&(
        <div className="card" style={{overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"12px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:14}}>✅ Check-in Inspection</div>
            {checklistLoaded&&(
              <span style={{fontSize:12,color:"var(--text3)"}}>
                {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length} OK ·{" "}
                {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length} Issues
              </span>
            )}
          </div>
          {!checklistLoaded?(
            <div style={{padding:24,textAlign:"center",color:"var(--text3)",fontSize:13}}>Loading checklist...</div>
          ):(
            <>
              {CHECKLIST_ITEMS.map(item=>{
                const cl=checklist[item.key]||{status:"pending",note:"",photo_url:""};
                return(
                  <div key={item.key} style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:16,width:22}}>{item.icon}</span>
                      <span style={{fontSize:13,fontWeight:600,flex:1,minWidth:120}}>{item.label}</span>
                      <div style={{display:"flex",gap:4}}>
                        {[{v:"ok",label:"✓ OK",bg:"rgba(34,197,94,.15)",col:"#22c55e",bdr:"rgba(34,197,94,.4)"},
                          {v:"issue",label:"✗ Issue",bg:"rgba(239,68,68,.15)",col:"#ef4444",bdr:"rgba(239,68,68,.4)"},
                          {v:"na",label:"N/A",bg:"rgba(148,163,184,.1)",col:"#94a3b8",bdr:"rgba(148,163,184,.3)"}
                        ].map(s=>(
                          <button key={s.v} onClick={()=>saveChecklistItem(item.key,{status:s.v})}
                            style={{fontSize:11,padding:"3px 8px",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap",fontWeight:cl.status===s.v?700:400,
                              background:cl.status===s.v?s.bg:"transparent",
                              color:cl.status===s.v?s.col:"var(--text3)",
                              border:`1px solid ${cl.status===s.v?s.bdr:"var(--border)"}`}}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <button onClick={()=>clCamRefs.current[item.key]?.click()}
                        style={{fontSize:11,padding:"3px 8px",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap",
                          background:cl.photo_url?"rgba(96,165,250,.15)":"transparent",
                          color:cl.photo_url?"var(--blue)":"var(--text3)",
                          border:`1px solid ${cl.photo_url?"rgba(96,165,250,.3)":"var(--border)"}`}}>
                        {clUploading[item.key]?"⏳":cl.photo_url?"📷 ✓":"📷"}
                      </button>
                      <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                        ref={el=>clCamRefs.current[item.key]=el}
                        onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;const fr=new FileReader();fr.onload=ev=>uploadChecklistPhoto(item.key,ev.target.result);fr.readAsDataURL(file);}}/>
                      {cl.photo_url&&(
                        <img src={toImgUrl(cl.photo_url)} alt="check" onClick={()=>setViewPhoto(cl.photo_url)}
                          style={{width:34,height:34,objectFit:"cover",borderRadius:5,cursor:"pointer",border:"1px solid var(--border)"}}/>
                      )}
                    </div>
                    <input className="inp" placeholder="Note (optional)..." value={cl.note}
                      onChange={e=>setChecklist(p=>({...p,[item.key]:{...cl,note:e.target.value}}))}
                      onBlur={e=>{if(e.target.value!==(checklist[item.key]?.note||""))saveChecklistItem(item.key,{note:e.target.value});else if(cl.status!=="pending"||cl.note)saveChecklistItem(item.key,{note:e.target.value});}}
                      style={{fontSize:12,padding:"4px 8px"}}/>
                  </div>
                );
              })}
              <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"var(--text3)",flexWrap:"wrap",gap:8}}>
                <span>{CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length} OK · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length} Issues · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="na").length} N/A · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="pending").length} Pending</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>printChecklistReport(job,checklist,settings)}>🖨️ Print Report</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ PHOTOS tab ══ */}
      {jobTab==="photos"&&(
        <div className="card" style={{padding:14,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14}}>
              📷 Photos {savedPhotos.length>0&&<span style={{fontSize:12,fontWeight:400,color:"var(--text3)",marginLeft:6}}>{savedPhotos.length} saved</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>jobPhotoCamRef.current?.click()}>📷 Camera</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>jobPhotoGalRef.current?.click()}>🖼️ Gallery</button>
            </div>
            <input ref={jobPhotoCamRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleJobPhotoFile}/>
            <input ref={jobPhotoGalRef} type="file" multiple style={{display:"none"}} onChange={handleJobPhotoFile}/>
          </div>
          {loadingPhotos?(
            <div style={{textAlign:"center",padding:"24px 0",color:"var(--text3)",fontSize:12}}>Loading photos...</div>
          ):(savedPhotos.length===0&&uploadPhotos.length===0)?(
            <div style={{textAlign:"center",padding:"32px 0",color:"var(--text3)",fontSize:13}}>No photos yet — tap Camera or Gallery</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
              {savedPhotos.map(p=>{
                const src=p.url?.includes("thumbnail?id=")||p.url?.includes("uc?export=")?p.url:toImgUrl(p.url);
                return (
                  <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3",cursor:"pointer"}} onClick={()=>setViewPhoto(p.url)}>
                    <img src={src} alt="photo" style={{width:"100%",height:"100%",objectFit:"cover"}}
                      onError={e=>{const m=p.url?.match(/thumbnail[?]id=([^&]+)/)||p.url?.match(/[?&]id=([^&]+)/)||p.url?.match(/file\/d\/([^/?]+)/);if(m&&!e.target.src.includes("uc?export=view"))e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;}}/>
                    <button onClick={e=>{e.stopPropagation();deleteJobPhoto(p.id);}}
                      style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.55)",border:"none",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",fontSize:10}}>✕</button>
                  </div>
                );
              })}
              {uploadPhotos.map(p=>(
                <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3"}}>
                  <img src={p.dataUrl} alt="uploading" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:p.status==="done"?"transparent":p.status==="error"?"rgba(180,0,0,.5)":"rgba(0,0,0,.45)"}}>
                    {(p.status==="pending"||p.status==="uploading")&&<div style={{width:20,height:20,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>}
                    {p.status==="done"&&<div style={{position:"absolute",top:3,right:5,fontSize:14}}>✅</div>}
                    {p.status==="error"&&<div style={{fontSize:9,color:"#fff",textAlign:"center",padding:3}}>❌ {(p.error||"").slice(0,25)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {viewPhoto&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setViewPhoto(null)}>
              <img src={toImgUrl(viewPhoto)} alt="preview" style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
              <button style={{position:"absolute",top:16,right:20,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,fontSize:18,cursor:"pointer"}} onClick={()=>setViewPhoto(null)}>✕</button>
              <a href={viewPhoto} target="_blank" rel="noreferrer" style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",background:"rgba(255,255,255,.15)",color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,textDecoration:"none"}} onClick={e=>e.stopPropagation()}>Open in Drive ↗</a>
            </div>
          )}
        </div>
      )}

      {/* ══ DOCUMENTS tab ══ */}
      {jobTab==="docs"&&(
        <div className="card" style={{padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📎 Documents ({jobDocs.length})</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:jobDocs.length>0?12:0}}>
            <input ref={docFileRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={handleDocFile}/>
            <button className="btn btn-ghost btn-sm" onClick={()=>docFileRef.current?.click()}>📂 {docFile?docFile.name:"Choose File"}</button>
            <input className="inp" style={{flex:1,minWidth:120,height:34,fontSize:13}} value={docName} onChange={e=>setDocName(e.target.value)} placeholder="Document name"/>
            <input className="inp" style={{flex:1,minWidth:100,height:34,fontSize:13}} value={docNotes} onChange={e=>setDocNotes(e.target.value)} placeholder="Notes (optional)"/>
            <button className="btn btn-primary btn-sm" onClick={uploadJobDoc} disabled={docUploading||!docFile}>{docUploading?"⏳ Uploading...":"⬆️ Upload"}</button>
          </div>
          {docPreview&&<div style={{marginBottom:8}}><img src={docPreview} alt="preview" style={{maxHeight:100,borderRadius:6,border:"1px solid var(--border)"}}/></div>}
          {jobDocs.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {jobDocs.map(d=>{
                const isPdf=d.file_type==="pdf"||(d.mime_type||"").includes("pdf");
                const isEditing=editDocId===d.id;
                return (
                  <div key={d.id} style={{padding:"7px 10px",background:"var(--surface2)",borderRadius:8}}>
                    {isEditing?(
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input className="inp" style={{flex:2,minWidth:120,height:30,fontSize:13}} value={editDocVal.name} onChange={e=>setEditDocVal(v=>({...v,name:e.target.value}))} placeholder="Name"/>
                        <input className="inp" style={{flex:2,minWidth:100,height:30,fontSize:13}} value={editDocVal.notes} onChange={e=>setEditDocVal(v=>({...v,notes:e.target.value}))} placeholder="Notes"/>
                        <button className="btn btn-primary btn-xs" onClick={saveDocEdit}>✅</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setEditDocId(null)}>✕</button>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20,flexShrink:0}}>{isPdf?"📄":"🖼️"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                          {d.notes&&<div style={{fontSize:11,color:"var(--text3)"}}>{d.notes}</div>}
                        </div>
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:"none"}}>{isPdf?"📄 Open":"🔍 View"}</a>
                        {!isPdf&&<button className="btn btn-ghost btn-xs" onClick={()=>setViewDocImg(d.file_url)}>🖼️</button>}
                        <button className="btn btn-ghost btn-xs" onClick={()=>{setEditDocId(d.id);setEditDocVal({name:d.name||"",notes:d.notes||""});}}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete this document?"))deleteJobDoc(d.id);}}>🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {viewDocImg&&(
            <div onClick={()=>setViewDocImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <img src={viewDocImg} alt="doc" style={{maxWidth:"92vw",maxHeight:"90vh",borderRadius:10}}/>
            </div>
          )}
        </div>
      )}

      {/* ══ QUOTE tab ══ */}
      {jobTab==="quote"&&wsRole!=="mechanic"&&(<>
        {/* Parts & Labour */}
        {(()=>{
          const defaultMarkup = +(wsProfile?.default_markup_pct||0);
          const commitPrice = async (item) => {
            const newPrice = +editPriceVal;
            if (!isNaN(newPrice) && newPrice !== +item.unit_price) {
              const costP = +(item.cost_price||0);
              const newMarkup = costP > 0 ? +((newPrice/costP - 1)*100).toFixed(1) : +(item.markup_pct||0);
              await onSaveItem({...item, unit_price: newPrice, markup_pct: newMarkup, total: newPrice * (+item.qty||1)});
            }
            setEditPriceId(null);
          };
          const commitMarkup = async (item) => {
            const markup = +editMarkupVal;
            if (!isNaN(markup) && markup !== +(item.markup_pct||0)) {
              const costP = +(item.cost_price||0);
              const newPrice = costP > 0 ? +(costP * (1 + markup/100)).toFixed(2) : +(item.unit_price||0);
              await onSaveItem({...item, markup_pct: markup, unit_price: newPrice, total: newPrice * (+item.qty||1)});
            }
            setEditMarkupId(null);
          };
          const commitQty = async (item) => {
            const newQty = Math.max(1, Math.round(+editQtyVal||1));
            if (newQty !== +item.qty) {
              await onSaveItem({...item, qty: newQty, total: (+item.unit_price||0) * newQty});
            }
            setEditQtyId(null);
          };

          // Build supplier cost lookup: description (lowercase) → [{name, price}]
          const jobSupQts = wsSupplierQuotes.filter(q=>q.job_id===job.id);
          const supCostMap = {};
          jobSupQts.forEach(sq=>{
            const lines = (() => { try { return JSON.parse(sq.line_items||"[]"); } catch { return []; } })();
            lines.forEach(l=>{
              const key = (l.name||"").toLowerCase().trim();
              if (!supCostMap[key]) supCostMap[key] = [];
              const displayPrice = +(l.vat_incl_price||l.price)||0;
              if (displayPrice > 0) supCostMap[key].push({name: sq.supplier_name||"Supplier", price: displayPrice});
            });
          });
          // Also include prices from digital supplier replies
          sqReplies.forEach(rep=>{
            const req = wsSupplierRequests.find(r=>r.id===rep.request_id);
            const supName = req?.supplier_name||"Supplier";
            const replyItems = (() => { try { return JSON.parse(rep.items||"[]"); } catch { return []; } })();
            replyItems.forEach(ri=>{
              if(ri.condition==="no_stock") return;
              const key=(ri.description||"").toLowerCase().trim();
              if(!supCostMap[key]) supCostMap[key]=[];
              const price=+ri.price||0;
              if(price>0) supCostMap[key].push({name:supName,price});
            });
          });
          const getSupCosts = (desc) => supCostMap[(desc||"").toLowerCase().trim()] || [];

          return (<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🔧 Parts &amp; Labour</div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("part")}>+ Part</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("labour")}>+ Labour</button>
          </div>
        </div>
        <div className="card" style={{overflow:"hidden",marginBottom:14}}>
          {items.length===0
            ?<div style={{textAlign:"center",padding:24,color:"var(--text3)"}}>No items yet — add parts or labour</div>
            : isMobile ? (
              /* ── Mobile card list ── */
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {items.map((item,idx)=>{
                  const supCosts=getSupCosts(item.description);
                  const isEditingPrice=editPriceId===item.id;
                  const isEditingQty=editQtyId===item.id;
                  const isEditing=isEditingPrice; // keep alias for price block
                  const displayQty=isEditingQty?(+editQtyVal||1):(+item.qty||1);
                  const rowTotal=isEditingPrice?(+editPriceVal||0)*displayQty:isEditingQty?(+item.unit_price||0)*displayQty:+item.total||0;
                  return (
                    <div key={item.id} style={{padding:"12px 14px",borderBottom:idx<items.length-1?"1px solid var(--border)":undefined}}>
                      {/* Top row: badge + name + delete */}
                      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                        <span className="badge" style={{flexShrink:0,background:item.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:item.type==="part"?"var(--blue)":"var(--green)",fontSize:11}}>
                          {item.type==="part"?"🔩 Part":"👷 Labour"}
                        </span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,lineHeight:1.3}}>{item.description}</div>
                          {item.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{item.part_sku}</code>}
                        </div>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}} onClick={()=>onDeleteItem(item.id)}>🗑</button>
                      </div>
                      {/* Supplier cost badges */}
                      {supCosts.length>0&&(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          {supCosts.map((sc,i)=>{
                            const sellP = +(sc.price*(1+defaultMarkup/100)).toFixed(2);
                            return (
                            <span key={i} onClick={async()=>{
                                await onSaveItem({...item, cost_price:sc.price, markup_pct:defaultMarkup, unit_price:sellP, total:sellP*(+item.qty||1)});
                              }}
                              title={defaultMarkup>0?`Cost ${fmtAmt(sc.price)} + ${defaultMarkup}% = ${fmtAmt(sellP)}`:"Click to set cost price"}
                              style={{fontSize:11,color:"#f59e0b",fontWeight:600,cursor:"pointer",background:"rgba(251,191,36,.1)",borderRadius:4,padding:"2px 8px",border:"1px solid rgba(251,191,36,.25)"}}>
                              💰 {sc.name}: {fmtAmt(sc.price)}
                            </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Qty × Price = Total row */}
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",background:"var(--surface2)",borderRadius:item.type==="part"?"8px 8px 0 0":"8px",padding:"8px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={{fontSize:11,color:"var(--text3)",fontWeight:600}}>Qty</span>
                          {isEditingQty
                            ? <input autoFocus type="number" min="1" step="1"
                                value={editQtyVal}
                                onChange={e=>setEditQtyVal(e.target.value)}
                                onBlur={()=>commitQty(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitQty(item); if(e.key==="Escape") setEditQtyId(null); }}
                                style={{width:52,textAlign:"center",fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditQtyId(item.id); setEditQtyVal(String(item.qty||1)); setEditPriceId(null); }}
                                style={{fontWeight:700,fontSize:15,cursor:"pointer",borderBottom:"1px dashed var(--text3)",color:"var(--text)"}}>
                                {item.qty}
                              </span>
                          }
                        </div>
                        <span style={{color:"var(--text3)"}}>×</span>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={{fontSize:11,color:"var(--text3)",fontWeight:600}}>Price</span>
                          {isEditingPrice
                            ? <input autoFocus type="number" min="0" step="0.01"
                                value={editPriceVal}
                                onChange={e=>setEditPriceVal(e.target.value)}
                                onBlur={()=>commitPrice(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitPrice(item); if(e.key==="Escape") setEditPriceId(null); }}
                                style={{width:80,fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditPriceId(item.id); setEditPriceVal(String(item.unit_price||0)); setEditQtyId(null); setEditMarkupId(null); }}
                                style={{fontWeight:700,fontSize:15,fontFamily:"Rajdhani,sans-serif",cursor:"pointer",borderBottom:"1px dashed var(--text3)",color:"var(--text)"}}>
                                {fmtAmt(item.unit_price)}
                              </span>
                          }
                        </div>
                        <span style={{color:"var(--text3)"}}>=</span>
                        <span style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginLeft:"auto"}}>
                          {fmtAmt(rowTotal)}
                        </span>
                      </div>
                      {/* Cost / Markup row (parts only) */}
                      {item.type==="part"&&(
                        <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(251,191,36,.07)",borderRadius:"0 0 8px 8px",padding:"5px 10px",borderTop:"1px solid rgba(251,191,36,.15)"}}>
                          {+(item.cost_price||0)>0&&<>
                            <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,flexShrink:0}}>Cost</span>
                            <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:12,color:"var(--text2)",flexShrink:0}}>{fmtAmt(item.cost_price)}</span>
                            <span style={{fontSize:10,color:"var(--text3)"}}>·</span>
                          </>}
                          <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,flexShrink:0}}>Markup</span>
                          {editMarkupId===item.id
                            ? <input autoFocus type="number" min="0" step="0.1"
                                value={editMarkupVal}
                                onChange={e=>setEditMarkupVal(e.target.value)}
                                onBlur={()=>commitMarkup(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitMarkup(item); if(e.key==="Escape") setEditMarkupId(null); }}
                                style={{width:56,fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 5px",borderRadius:5,border:"1px solid #f59e0b",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditMarkupId(item.id); setEditMarkupVal(String(item.markup_pct||0)); setEditPriceId(null); setEditQtyId(null); }}
                                style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",color:"#f59e0b",borderBottom:"1px dashed rgba(251,191,36,.4)"}}>
                                {item.markup_pct||0}%
                              </span>
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Desktop table ── */
              <table className="tbl" style={{width:"100%"}}>
                <thead><tr>{["Type","Description","Qty","Unit Price","Total",""].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map(item=>{
                    const supCosts = getSupCosts(item.description);
                    const isEditing = editPriceId === item.id;
                    return (
                    <tr key={item.id}>
                      <td><span className="badge" style={{background:item.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:item.type==="part"?"var(--blue)":"var(--green)"}}>{item.type==="part"?"🔩 Part":"👷 Labour"}</span></td>
                      <td style={{fontWeight:500}}>
                        {item.description}{item.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:8}}>{item.part_sku}</code>}
                        {supCosts.length>0&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:3}}>
                            {supCosts.map((sc,i)=>{
                              const sellP=+(sc.price*(1+defaultMarkup/100)).toFixed(2);
                              return (
                              <span key={i} title={defaultMarkup>0?`Cost ${fmtAmt(sc.price)} + ${defaultMarkup}% = ${fmtAmt(sellP)}`:"Click to set cost price"}
                                onClick={async()=>{ await onSaveItem({...item, cost_price:sc.price, markup_pct:defaultMarkup, unit_price:sellP, total:sellP*(+item.qty||1)}); }}
                                style={{fontSize:10,color:"#f59e0b",fontWeight:600,cursor:"pointer",background:"rgba(251,191,36,.1)",borderRadius:4,padding:"1px 6px",border:"1px solid rgba(251,191,36,.25)"}}>
                                💰 {sc.name}: {fmtAmt(sc.price)}
                              </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{textAlign:"right"}}>
                        {editQtyId===item.id
                          ? <input autoFocus type="number" min="1" step="1"
                              value={editQtyVal}
                              onChange={e=>setEditQtyVal(e.target.value)}
                              onBlur={()=>commitQty(item)}
                              onKeyDown={e=>{ if(e.key==="Enter") commitQty(item); if(e.key==="Escape") setEditQtyId(null); }}
                              style={{width:52,textAlign:"center",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)"}}/>
                          : <span onClick={()=>{ setEditQtyId(item.id); setEditQtyVal(String(item.qty||1)); setEditPriceId(null); }}
                              title="Click to edit qty"
                              style={{cursor:"pointer",borderBottom:"1px dashed var(--text3)",paddingBottom:1}}>
                              {item.qty}
                            </span>
                        }
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",minWidth:110}}>
                        {isEditing
                          ? <input autoFocus type="number" min="0" step="0.01"
                              value={editPriceVal}
                              onChange={e=>setEditPriceVal(e.target.value)}
                              onBlur={()=>commitPrice(item)}
                              onKeyDown={e=>{ if(e.key==="Enter") commitPrice(item); if(e.key==="Escape") setEditPriceId(null); }}
                              style={{width:90,textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)"}}/>
                          : <span onClick={()=>{ setEditPriceId(item.id); setEditPriceVal(String(item.unit_price||0)); setEditMarkupId(null); }}
                              title="Click to edit price"
                              style={{cursor:"pointer",borderBottom:"1px dashed var(--text3)",paddingBottom:1}}>
                              {fmtAmt(item.unit_price)}
                            </span>
                        }
                        {item.type==="part"&&(
                          <div style={{fontSize:10,color:"var(--text3)",marginTop:2,textAlign:"right",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                            {+(item.cost_price||0)>0&&<span style={{color:"var(--text3)"}}>Cost {fmtAmt(item.cost_price)} ·</span>}
                            {editMarkupId===item.id
                              ? <input autoFocus type="number" min="0" step="0.1"
                                  value={editMarkupVal}
                                  onChange={e=>setEditMarkupVal(e.target.value)}
                                  onBlur={()=>commitMarkup(item)}
                                  onKeyDown={e=>{ if(e.key==="Enter") commitMarkup(item); if(e.key==="Escape") setEditMarkupId(null); }}
                                  style={{width:50,textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:11,padding:"1px 4px",borderRadius:4,border:"1px solid #f59e0b",background:"var(--surface2)",color:"#f59e0b"}}/>
                              : <span onClick={()=>{ setEditMarkupId(item.id); setEditMarkupVal(String(item.markup_pct||0)); setEditPriceId(null); }}
                                  title="Click to edit markup %"
                                  style={{cursor:"pointer",color:"#f59e0b",fontWeight:600,borderBottom:"1px dashed rgba(251,191,36,.4)"}}>
                                  +{item.markup_pct||0}%
                                </span>
                            }
                            <span>markup</span>
                          </div>
                        )}
                      </td>
                      <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmtAmt(isEditing?(+editPriceVal||0)*(editQtyId===item.id?+editQtyVal||1:+item.qty||1):editQtyId===item.id?(+item.unit_price||0)*(+editQtyVal||1):item.total)}</td>
                      <td><button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>onDeleteItem(item.id)}>✕</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
          {/* ── Supplier quote requests + PO status ── */}
          {(()=>{
            const jobReqs=wsSupplierRequests.filter(r=>r.job_id===job.id);
            if(!jobReqs.length&&!wsPurchaseOrders.length) return null;
            const PO_C={draft:"var(--text3)",sent:"var(--blue)",partial:"var(--yellow)",received:"var(--green)",cancelled:"var(--red)"};
            const PO_BG={draft:"var(--surface3)",sent:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",received:"rgba(52,211,153,.12)",cancelled:"rgba(248,113,113,.12)"};
            return (
              <div style={{borderTop:"1px solid var(--border)",padding:"8px 16px",display:"flex",flexDirection:"column",gap:5}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>Supplier Quotes</div>
                {jobReqs.map(r=>{
                  const hasQuote=wsSupplierQuotes.find(q=>q.request_id===r.id);
                  const hasReply=sqReplies.find(rep=>rep.request_id===r.id);
                  const po=wsPurchaseOrders.find(p=>p.supplier_id&&r.supplier_id&&String(p.supplier_id)===String(r.supplier_id))||wsPurchaseOrders.find(p=>p.supplier_name===r.supplier_name);
                  return (
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                      <span style={{flex:1,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.supplier_name||r.supplier_phone||"Unknown"}</span>
                      {hasQuote
                        ? <span style={{fontSize:10,fontWeight:700,color:"var(--green)",background:"rgba(52,211,153,.1)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>✅ Quoted</span>
                        : hasReply
                          ? <span style={{fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.1)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>📲 App Reply</span>
                          : <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",background:"var(--surface3)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>⏳ Pending</span>
                      }
                      {po&&(
                        <button onClick={()=>onViewPO?.(po.id)}
                          style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"2px 8px",border:"none",cursor:"pointer",background:PO_BG[po.status]||PO_BG.draft,color:PO_C[po.status]||PO_C.draft,flexShrink:0}}>
                          📋 PO · {po.status||"draft"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* POs not linked to a request (edge case) */}
                {wsPurchaseOrders.filter(po=>!jobReqs.some(r=>
                  (r.supplier_id&&String(po.supplier_id)===String(r.supplier_id))||(r.supplier_name===po.supplier_name)
                )).map(po=>(
                  <div key={po.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                    <span style={{flex:1,fontWeight:600}}>{po.supplier_name}</span>
                    <button onClick={()=>onViewPO?.(po.id)}
                      style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"2px 8px",border:"none",cursor:"pointer",background:PO_BG[po.status]||PO_BG.draft,color:PO_C[po.status]||PO_C.draft}}>
                      📋 PO · {po.status||"draft"}
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("part")}>+ Part</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("labour")}>+ Labour</button>
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366",borderColor:"rgba(37,211,102,.35)"}} onClick={()=>setSupplierModal(true)}>📤 Send Quote</button>
              {wsSupplierRequests.filter(r=>r.job_id===job.id).length>0&&<button className="btn btn-ghost btn-sm" style={{color:"#38bdf8",borderColor:"rgba(56,189,248,.35)"}} onClick={()=>setReturnQuoteOpen(true)}>↩️ Return Quote</button>}
              {(wsSupplierQuotes.filter(q=>q.job_id===job.id).length>0||sqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===job.id)).length>0)&&(
                <button className="btn btn-ghost btn-sm" style={{color:"var(--accent)",borderColor:"rgba(251,146,60,.35)"}} onClick={()=>setCreatePoOpen(true)}>📦 Create Order</button>
              )}
            </div>
            {items.length>0&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{color:"var(--text)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(subtotal)}</strong></div>
                {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</strong></div>}
                <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmtAmt(total)}</div>
              </div>
            )}
          </div>
        </div>
          </>);
        })()}
        {/* Quote */}
        {quote ? (
        <div className="card" style={{padding:14,marginBottom:14,borderLeft:`3px solid ${
          quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)"}`}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>📝 Quotation <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{quote.id}</code></div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                {quote.quote_date}{quote.valid_until&&` · Valid until ${quote.valid_until}`}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(quote.total)}</div>
            </div>
            <span className="badge" style={{
              background:quote.status==="accepted"?"rgba(52,211,153,.15)":quote.status==="declined"?"rgba(248,113,113,.15)":quote.status==="converted"?"rgba(100,116,139,.15)":"rgba(96,165,250,.15)",
              color:quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)",
              fontSize:12,padding:"4px 10px"
            }}>
              {quote.status==="accepted"?"✅ Accepted":quote.status==="declined"?"❌ Declined":quote.status==="converted"?"📄 Converted":"📤 "+quote.status.charAt(0).toUpperCase()+quote.status.slice(1)}
            </span>
          </div>
          {/* Customer confirm status */}
          {quote.confirm_status&&quote.confirm_status!=="pending"&&(
            <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,
              background:quote.confirm_status==="confirmed"?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)",
              border:`1px solid ${quote.confirm_status==="confirmed"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{quote.confirm_status==="confirmed"?"✅":"❌"}</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:quote.confirm_status==="confirmed"?"var(--green)":"var(--red)"}}>
                  Customer {quote.confirm_status==="confirmed"?"Approved":"Declined"} this quotation
                </div>
                {quote.confirmed_at&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{new Date(quote.confirmed_at).toLocaleString()}</div>}
                {quote.customer_note&&<div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>💬 "{quote.customer_note}"</div>}
              </div>
            </div>
          )}
          {quote.confirm_status==="pending"&&(
            <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.3)",fontSize:12,color:"var(--yellow)"}}>
              ⏳ Awaiting customer response...
            </div>
          )}
          {/* Invoice exists warning */}
          {invoice&&(
            <div style={{background:"rgba(251,191,36,.15)",border:"1px solid rgba(251,191,36,.5)",borderRadius:6,padding:"7px 12px",marginBottom:10,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
              <span>⚠️</span>
              <span>Invoice <strong>{invoice.id}</strong> already exists for this job — status: <strong>{invoice.status}</strong>.</span>
            </div>
          )}
          {/* Actions */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>printWorkshopQuote(job,items,quote,settings,vehiclePhotos)}>🖨️ Print PDF</button>
            {quote.status!=="converted"&&onSendQuoteForApproval&&(
              <button className="btn btn-sm" style={{background:"rgba(37,211,102,.12)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)"}}
                onClick={()=>setApprovalModal(true)}>
                🔗 Send for Approval
              </button>
            )}
            {(quote.quote_phone||job.customer_phone)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}} onClick={()=>{
                const phone=(quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
                const name=quote.quote_customer||job.customer_name||"";
                const C=curSym(settings.currency||getSettings().currency);
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const lines=items.map(i=>`  • ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const msg=`📝 *Workshop Quotation ${quote.id}*\n──────────────────\n`+
                  `👤 ${name}\n🚗 ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n`+
                  `📅 Date: ${quote.quote_date}${quote.valid_until?`\n⏳ Valid Until: ${quote.valid_until}`:""}\n\n`+
                  `*Items:*\n${lines}\n\n💰 *Total: ${fmt(quote.total)}*\n\n`+
                  `Please confirm to proceed.\n\n${settings.shop_name||"Workshop"}${settings.phone?`\n📞 ${settings.phone}`:""}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
              }}>💬 WA</button>
            )}
            {(quote.quote_email||job.customer_email)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)"}} onClick={()=>{
                const email=quote.quote_email||job.customer_email||"";
                const name=quote.quote_customer||job.customer_name||"";
                const C=curSym(settings.currency||getSettings().currency);
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const lines=items.map(i=>`  - ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const subj=`Workshop Quotation ${quote.id} — ${name}`;
                const body=`Dear ${name},\n\nPlease find your workshop quotation below.\n\n`+
                  `Quotation: ${quote.id}\nDate: ${quote.quote_date}${quote.valid_until?`\nValid Until: ${quote.valid_until}`:""}\n`+
                  `Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n\n`+
                  `Items:\n${lines}\n\nTotal: ${fmt(quote.total)}\n\nPlease confirm to proceed.\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\nPhone: ${settings.phone}`:""}`;
                window.location.href=`mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
              }}>✉️ Email</button>
            )}
            {quote.status!=="converted"&&quote.status!=="declined"&&(
              <button className={`btn btn-xs ${quote.status==="accepted"?"btn-ghost":"btn-success"}`}
                onClick={()=>onSaveQuote({...quote,status:quote.status==="accepted"?"sent":"accepted"})}>
                {quote.status==="accepted"?"↩ Unaccept":"✅ Mark Accepted"}
              </button>
            )}
            {quote.status!=="converted"&&(
              <button className="btn btn-ghost btn-xs" onClick={()=>setQuoteModal(true)}>✏️ Edit</button>
            )}
            {!invoice&&quote.status==="accepted"&&(
              <button className="btn btn-primary btn-sm" onClick={()=>{ setQuoteSrcForInv(quote); setCreatingInv(true); }}>🧾 Convert to Invoice</button>
            )}
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",marginLeft:"auto"}}
              onClick={()=>setDeletingQuote(true)}>🗑️</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:14,fontWeight:600,marginBottom:14,border:"2px dashed var(--border)"}}
          onClick={()=>setQuoteModal(true)}>
          📝 Create Quotation for Customer
        </button>
      )}
      </>)}

      {/* ══ INVOICE tab ══ */}
      {jobTab==="invoice"&&wsRole!=="mechanic"&&(<>
      {invoice ? (
        <div className="card" style={{padding:14,borderLeft:`3px solid ${invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)"}`}}>
          {/* Header row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>🧾 Invoice <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{invoice.id}</code></div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{invoice.invoice_date}{invoice.due_date&&` · Due ${invoice.due_date}`}</div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(invoice.total)}</div>
              {(+invoice.paid_amount||0)>0&&(
                <div style={{fontSize:12,marginTop:2}}>
                  <span style={{color:"var(--green)"}}>Paid: {fmtAmt(invoice.paid_amount)}</span>
                  <span style={{color:"var(--text3)",marginLeft:8}}>Balance: {fmtAmt((+invoice.total||0)-(+invoice.paid_amount||0))}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <span className="badge" style={{
                background:invoice.status==="paid"?"rgba(52,211,153,.15)":invoice.status==="partial"?"rgba(251,191,36,.15)":"rgba(248,113,113,.15)",
                color:invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)",
                fontSize:12,padding:"4px 10px"
              }}>
                {invoice.status==="paid"?"✅ Paid":invoice.status==="partial"?"💛 Partial":"⏳ Unpaid"}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStatementModal(true)}>📋 Statement</button>
            {invoice.status!=="paid"&&(
              <button className="btn btn-success btn-sm" onClick={()=>setPaymentModal(true)}>💳 Payment</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditingInv(true)}>✏️ Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>printWorkshopInvoice(job,items,invoice,settings,vehiclePhotos)}>🖨️ Print</button>
            {(invoice.inv_phone||job.customer_phone)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}} onClick={()=>{
                const phone=(invoice.inv_phone||job.customer_phone||"").replace(/\D/g,"");
                const name=invoice.invoice_customer||job.customer_name||"";
                const C=curSym(settings.currency||getSettings().currency);
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const itemLines=items.map(i=>`  • ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const balance=(+invoice.total||0)-(+invoice.paid_amount||0);
                const msg=`🔧 *Workshop Invoice ${invoice.id}*\n──────────────────\n`+
                  `👤 ${name}\n🚗 ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n`+
                  `📅 Date: ${invoice.invoice_date}\n\n*Items:*\n${itemLines}\n\n`+
                  `💰 *Total: ${fmt(invoice.total)}*\n`+
                  ((+invoice.paid_amount||0)>0?`✅ Paid: ${fmt(invoice.paid_amount)}\n⚠️ Balance: ${fmt(balance)}\n`:"")+
                  `Status: ${invoice.status==="paid"?"✅ PAID":invoice.status==="partial"?"💛 PARTIAL":"⏳ UNPAID"}\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\n📞 ${settings.phone}`:""}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
              }}>💬 WA</button>
            )}
            {(invoice.inv_email||job.customer_email)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)"}} onClick={()=>{
                const email=invoice.inv_email||job.customer_email||"";
                const name=invoice.invoice_customer||job.customer_name||"";
                const C=curSym(settings.currency||getSettings().currency);
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const itemLines=items.map(i=>`  - ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const subject=`Workshop Invoice ${invoice.id} — ${name}`;
                const body=`Dear ${name},\n\nPlease find your workshop invoice details below.\n\n`+
                  `Invoice: ${invoice.id}\nDate: ${invoice.invoice_date}\n`+
                  `Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n\n`+
                  `Items:\n${itemLines}\n\nTotal: ${fmt(invoice.total)}\nStatus: ${invoice.status==="paid"?"PAID":"UNPAID"}\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\nPhone: ${settings.phone}`:""}${settings.email?`\nEmail: ${settings.email}`:""}`;
                window.location.href=`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              }}>✉️ Email</button>
            )}
            <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",marginLeft:"auto"}}
              onClick={()=>setDeletingInv(true)}>🗑️ Delete</button>
          </div>
        </div>
      ) : items.length>0&&wsRole!=="mechanic"&&(
        quote?.status==="converted"
          ? <div style={{background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.4)",borderRadius:8,padding:"12px 14px",marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>⚠️ This quote was already converted to an invoice.</div>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>If you need a new invoice, confirm below — this will create a second invoice for this job.</div>
              <button className="btn btn-ghost" style={{width:"100%",fontSize:13}}
                onClick={()=>{ if(window.confirm("⚠️ A quote was already converted to an invoice for this job.\n\nCreate another invoice anyway?")) setCreatingInv(true); }}>
                🧾 Create Another Invoice
              </button>
            </div>
          : <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,fontWeight:700}}
              onClick={()=>setCreatingInv(true)}>
              🧾 Create Workshop Invoice
            </button>
      )}
      </>)}

      {/* Return Quote — supplier picker */}
      {returnQuoteOpen&&!returnQuoteTarget&&(()=>{
        const jobRequests=wsSupplierRequests.filter(r=>r.job_id===job.id);
        return(
          <Overlay onClose={()=>setReturnQuoteOpen(false)}>
            <MHead title="↩️ Return Quote — Select Supplier" onClose={()=>setReturnQuoteOpen(false)}/>
            <div style={{marginBottom:12,fontSize:13,color:"var(--text3)"}}>Choose which supplier is returning their quote:</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {jobRequests.map(r=>{
                const existing=wsSupplierQuotes.find(q=>q.request_id===r.id);
                // Fall back to digital reply to pre-fill prices when no manual quote exists
                const digReply=!existing?sqReplies.find(rep=>rep.request_id===r.id):null;
                const prefillFromReply=digReply?(()=>{
                  const parts=(() => { try{return JSON.parse(r.parts_list||"[]");}catch{return [];} })();
                  const repItems=(() => { try{return JSON.parse(digReply.items||"[]");}catch{return [];} })();
                  const lineItems=parts.map(pName=>{
                    const ri=repItems.find(ri=>(ri.description||"").toLowerCase()===pName.toLowerCase());
                    return {name:pName,price:ri&&ri.condition!=="no_stock"?String(ri.price||""):"",available:ri?ri.condition==="in_stock"?"In stock":ri.condition==="can_order"?"Can order":"No stock":""};
                  });
                  return {line_items:JSON.stringify(lineItems)};
                })():null;
                const resolved=existing||prefillFromReply||null;
                return(
                  <button key={r.id}
                    onClick={()=>setReturnQuoteTarget({request:r,existingQuote:resolved})}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:22,flexShrink:0}}>📲</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{r.supplier_name||r.supplier_phone||"Unknown supplier"}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{new Date(r.sent_at||r.created_at).toLocaleString()}</div>
                    </div>
                    {existing
                      ? <span style={{fontSize:11,fontWeight:700,color:"var(--green)",background:"rgba(52,211,153,.12)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>✅ Quoted</span>
                      : digReply
                        ? <span style={{fontSize:11,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>📲 App Reply</span>
                        : <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",background:"var(--surface3)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>Pending</span>
                    }
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost" style={{width:"100%",marginTop:14}} onClick={()=>setReturnQuoteOpen(false)}>Cancel</button>
          </Overlay>
        );
      })()}
      {/* Return Quote — price entry (reuses SupplierQuoteModal) */}
      {returnQuoteOpen&&returnQuoteTarget&&(
        <SupplierQuoteModal
          request={returnQuoteTarget.request}
          existingQuote={returnQuoteTarget.existingQuote}
          priceOnly
          settings={settings}
          onSave={async(d)=>{ if(onSaveWsSupplierQuote) await onSaveWsSupplierQuote(d); setReturnQuoteTarget(null); setReturnQuoteOpen(false); }}
          onClose={()=>setReturnQuoteTarget(null)}/>
      )}

      {/* Add item modal */}
      {addingItem&&(
        <WorkshopItemModal
          type={addingItem}
          wsStock={wsStock}
          wsServices={wsServices}
          defaultMarkupPct={wsProfile?.default_markup_pct||0}
          onSave={async(item)=>{ await onSaveItem({...item,job_id:job.id}); setAddingItem(null); }}
          onClose={()=>setAddingItem(null)}
          t={t}/>
      )}

      {/* Edit job modal */}
      {editJob&&(
        <WorkshopJobModal job={job} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={[]}
          onSave={async(d)=>{ await onSaveJob(d); setEditJob(false); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setEditJob(false); }}
          onClose={()=>setEditJob(false)} t={t}/>
      )}

      {/* Create invoice modal (also used for quote→invoice conversion) */}
      {creatingInv&&(
        <WorkshopInvoiceModal
          job={job} items={items} subtotal={subtotal} tax={tax} total={total}
          settings={settings}
          prefill={quoteSrcForInv ? {
            invCust:  quoteSrcForInv.quote_customer||"",
            invPhone: quoteSrcForInv.quote_phone||"",
            invEmail: quoteSrcForInv.quote_email||"",
            dueDate:  quoteSrcForInv.valid_until||"",
            notes:    `Converted from Quote ${quoteSrcForInv.id}${quoteSrcForInv.notes?"\n"+quoteSrcForInv.notes:""}`,
          } : {}}
          onSave={async(inv)=>{
            await onSaveInvoice(inv);
            if(quoteSrcForInv) await onSaveQuote({...quoteSrcForInv, status:"converted"});
            setCreatingInv(false);
            setQuoteSrcForInv(null);
          }}
          onClose={()=>{ setCreatingInv(false); setQuoteSrcForInv(null); }} t={t}/>
      )}

      {/* Edit invoice modal */}
      {editingInv&&invoice&&(
        <WsInvoiceEditModal
          invoice={invoice}
          onSave={async(data)=>{ await onUpdateInvoice(invoice.id,data); setEditingInv(false); }}
          onClose={()=>setEditingInv(false)}/>
      )}

      {/* Record payment modal */}
      {paymentModal&&invoice&&(
        <WsPaymentModal
          invoice={invoice}
          settings={settings}
          onSave={async(data)=>{ await onUpdateInvoice(invoice.id,data); setPaymentModal(false); }}
          onClose={()=>setPaymentModal(false)}/>
      )}

      {/* Statement modal */}
      {statementModal&&invoice&&(
        <WsStatementModal
          invoice={invoice} job={job} items={items} settings={settings}
          onClose={()=>setStatementModal(false)}
          onPrint={()=>printWorkshopInvoice(job,items,invoice,settings,vehiclePhotos)}/>
      )}

      {/* Create/Edit quote modal */}
      {quoteModal&&(
        <WsQuoteModal
          job={job} items={items} subtotal={subtotal} tax={tax} total={total}
          existing={quote} settings={settings}
          wsSupplierQuotes={wsSupplierQuotes}
          onSave={async(q)=>{ await onSaveQuote(q); setQuoteModal(false); }}
          onClose={()=>setQuoteModal(false)}/>
      )}

      {/* Delete quote confirm */}
      {deletingQuote&&quote&&(
        <Overlay onClose={()=>setDeletingQuote(false)}>
          <MHead title="🗑️ Delete Quotation" onClose={()=>setDeletingQuote(false)}/>
          <p style={{color:"var(--text2)",marginBottom:18}}>
            Delete quotation <code style={{fontFamily:"DM Mono,monospace"}}>{quote.id}</code>?
          </p>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeletingQuote(false)}>Cancel</button>
            <button className="btn btn-danger" style={{flex:1}} onClick={async()=>{ await onDeleteQuote(quote.id); setDeletingQuote(false); }}>Delete</button>
          </div>
        </Overlay>
      )}

      {/* Delete invoice confirm */}
      {deletingInv&&invoice&&(
        <Overlay onClose={()=>setDeletingInv(false)}>
          <MHead title="🗑️ Delete Invoice" onClose={()=>setDeletingInv(false)}/>
          <p style={{color:"var(--text2)",marginBottom:18}}>
            Delete invoice <code style={{fontFamily:"DM Mono,monospace"}}>{invoice.id}</code>?
            The job will revert to <strong>In Progress</strong>.
          </p>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeletingInv(false)}>Cancel</button>
            <button className="btn btn-danger" style={{flex:1}} onClick={async()=>{
              await onDeleteInvoice(invoice.id,job.id);
              setDeletingInv(false);
            }}>Delete</button>
          </div>
        </Overlay>
      )}

      {/* Send for Approval modal */}
      {approvalModal&&quote&&(
        <QuoteApprovalModal
          quote={quote} job={job} items={items} settings={settings}
          onSend={async()=>{
            const token = await onSendQuoteForApproval(quote.id);
            return `${window.location.origin}${window.location.pathname}?wsq=${token}`;
          }}
          onClose={()=>setApprovalModal(false)}/>
      )}

      {/* Collection/Delivery label modal */}
      {deliveryModal&&(
        <DeliveryLabelModal
          job={job} settings={settings}
          onClose={()=>setDeliveryModal(false)}/>
      )}

      {/* Move PIN prompt */}
      {movePinOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="card" style={{width:"100%",maxWidth:320,padding:24,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:700,fontSize:16,textAlign:"center"}}>🔒 Move Job — Enter PIN</div>
            <div style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>This action is restricted. Enter the Move PIN to continue.</div>
            <input className="inp" type="password" autoFocus value={movePinVal}
              onChange={e=>{setMovePinVal(e.target.value);setMovePinErr("");}}
              onKeyDown={e=>{ if(e.key==="Enter"){ if(movePinVal===wsProfile.move_pin){setMovePinOpen(false);setMoveModal(true);}else{setMovePinErr("Incorrect PIN");} } }}
              placeholder="Enter PIN" style={{textAlign:"center",fontSize:18,letterSpacing:4}}/>
            {movePinErr&&<div style={{color:"var(--red)",fontSize:13,textAlign:"center"}}>⚠ {movePinErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setMovePinOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={()=>{ if(movePinVal===wsProfile.move_pin){setMovePinOpen(false);setMoveModal(true);}else{setMovePinErr("Incorrect PIN");} }}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      {moveModal&&(
        <MoveJobModal
          job={job}
          onMove={onMoveJob}
          onClose={()=>setMoveModal(false)}/>
      )}

      {/* Send to Supplier modal */}
      {supplierModal&&(
        <Overlay onClose={()=>setSupplierModal(false)}>
          <SupplierSendModal
            job={job} items={items} wsSuppliers={wsSuppliers} settings={settings}
            history={wsSupplierRequests.filter(r=>r.job_id===job.id)}
            quotes={wsSupplierQuotes.filter(q=>q.job_id===job.id)}
            sqReplies={sqReplies}
            onLogSend={onSaveWsSupplierRequest}
            onDeleteSend={onDeleteWsSupplierRequest}
            onSaveQuote={onSaveWsSupplierQuote}
            onSaveItem={onSaveItem}
            onSaveWsStock={onSaveWsStock}
            onGenerateLink={onGenerateWsQuoteLink}
            onCreatePO={onSaveWsPurchaseOrder?(poData)=>{onSaveWsPurchaseOrder(poData,poData.items||[]);setSupplierModal(false);if(onViewPurchaseOrders)onViewPurchaseOrders();}:undefined}
            onClose={()=>setSupplierModal(false)}/>
        </Overlay>
      )}

      {createPoOpen&&onSaveWsPurchaseOrder&&(
        <WsCreatePoFromJobModal
          job={job}
          wsSupplierQuotes={wsSupplierQuotes.filter(q=>q.job_id===job.id)}
          wsSupplierRequests={wsSupplierRequests}
          sqReplies={sqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===job.id))}
          wsSuppliers={wsSuppliers} settings={settings}
          onSave={onSaveWsPurchaseOrder}
          onViewPOs={onViewPurchaseOrders}
          onClose={()=>setCreatePoOpen(false)}/>
      )}

      {/* Licence Renewal modal */}
      {renewalModal&&onSaveWsLicenceRenewal&&(
        <LicenceRenewalModal
          job={job} vehicleRecord={vehicleRecord} settings={settings} wsId={wsId}
          onSave={async(rec)=>{ await onSaveWsLicenceRenewal(rec); setRenewalModal(false); }}
          onClose={()=>setRenewalModal(false)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MOVE JOB MODAL
// ═══════════════════════════════════════════════════════════════
function MoveJobModal({job,onMove,onClose}) {
  const [targetId,setTargetId]=useState("");
  const [saving,setSaving]=useState(false);

  const handleMove=async()=>{
    if(!targetId.trim()){alert("Enter the target Workshop ID");return;}
    if(!window.confirm(
      `Move job ${job.id} (${job.customer_name}) to workshop "${targetId.trim()}"?\n\nThis will also move all related quotes and invoices.`
    )) return;
    setSaving(true);
    try{
      await onMove(targetId.trim());
    }catch(e){ alert("Move failed: "+e.message); setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="🔀 Move Job to Another Workshop" onClose={onClose}/>
      <div style={{marginBottom:14,padding:"10px 14px",background:"var(--surface2)",borderRadius:8,fontSize:13}}>
        <div style={{fontWeight:700,marginBottom:4}}>{job.customer_name} · <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{job.id}</code></div>
        <div style={{color:"var(--text3)"}}>🚗 {job.vehicle_reg||"—"} · {job.date_in}</div>
      </div>
      <div style={{marginBottom:16}}>
        <FL label="Target Workshop ID"/>
        <input className="inp" value={targetId} onChange={e=>setTargetId(e.target.value)}
          placeholder="e.g. WS-00123"
          style={{fontFamily:"DM Mono,monospace"}}/>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
          The job, all job items, quotes and invoices will be reassigned to this workshop.
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn" style={{flex:2,background:"var(--yellow)",color:"#000",fontWeight:700}} onClick={handleMove} disabled={saving||!targetId.trim()}>
          {saving?"Moving...":"🔀 Confirm Move"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP JOB MODAL — Create/Edit
// ═══════════════════════════════════════════════════════════════
function WorkshopJobModal({job, wsCustomers=[], wsVehicles=[], jobs=[], onSave, onReopenJob, onClose, t}) {
  const [f,setF]=useState({
    id:job.id||null,
    workshop_customer_id:job.workshop_customer_id||null,
    workshop_vehicle_id:job.workshop_vehicle_id||null,
    customer_name:job.customer_name||"",
    customer_phone:job.customer_phone||"", customer_email:job.customer_email||"",
    vehicle_reg:job.vehicle_reg||"", vehicle_make:job.vehicle_make||"",
    vehicle_model:job.vehicle_model||"", vehicle_year:job.vehicle_year||"",
    vehicle_color:job.vehicle_color||"", mileage:job.mileage||"",
    vin:job.vin||"", engine_no:job.engine_no||"", licence_disc_expiry:job.licence_disc_expiry||"",
    complaint:job.complaint||"", diagnosis:job.diagnosis||"",
    mechanic:job.mechanic||"", date_in:job.date_in||new Date().toISOString().slice(0,10),
    date_out:job.date_out||"", notes:job.notes||"", status:job.status||"Pending",
    return_reason:job.return_reason||"", parent_job_id:job.parent_job_id||null,
    photo_front:(()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_front||""; })(),
    photo_rear: (()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_rear ||""; })(),
    photo_side: (()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_side ||""; })(),
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [tab,setTab]=useState("customer");
  const [custSearch,setCustSearch]=useState(job.customer_name||"");
  const [showCustDrop,setShowCustDrop]=useState(false);
  const [selCustomer,setSelCustomer]=useState(()=>wsCustomers.find(c=>c.id===job.workshop_customer_id)||null);
  const [selVehicle,setSelVehicle]=useState(()=>wsVehicles.find(v=>v.id===job.workshop_vehicle_id)||null);
  const [returnDialog,setReturnDialog]=useState(null); // {existingJobs,vehicle}
  const [returnReason,setReturnReason]=useState("");
  const [returnMode,setReturnMode]=useState("new");
  const [reopenJobId,setReopenJobId]=useState(null);

  const photoCount=[f.photo_front,f.photo_rear,f.photo_side].filter(Boolean).length;
  const canTakePhotos=!!(f.customer_name.trim()&&f.vehicle_reg.trim()&&f.mileage&&f.complaint.trim());
  const TABS=[{id:"customer",label:"👤 Customer"},{id:"vehicle",label:"🚗 Vehicle"},{id:"job",label:"🔧 Job"},{id:"photos",label:"📸 Photos"+(photoCount>0?" ("+photoCount+")":"")}];

  const filtCust=wsCustomers.filter(c=>{
    if(!custSearch.trim()) return true;
    const q=custSearch.toLowerCase();
    return `${c.name} ${c.phone||""} ${c.email||""}`.toLowerCase().includes(q);
  }).slice(0,8);

  const selectCustomer=(c)=>{
    setSelCustomer(c); setCustSearch(c.name); setShowCustDrop(false);
    s("customer_name",c.name); s("customer_phone",c.phone||""); s("customer_email",c.email||"");
    s("workshop_customer_id",c.id);
    // Only clear the vehicle link — keep scanned/entered vehicle data in the fields
    setSelVehicle(null);
    s("workshop_vehicle_id",null);
  };

  const selectVehicle=(v)=>{
    setSelVehicle(v);
    s("workshop_vehicle_id",v.id); s("vehicle_reg",v.reg||"");
    s("vehicle_make",v.make||""); s("vehicle_model",v.model||"");
    s("vehicle_year",v.year||""); s("vehicle_color",v.color||"");
    if(!f.id){
      const openJobs=jobs.filter(j=>j.status!=="Delivered"&&(j.workshop_vehicle_id===v.id||j.vehicle_reg===v.reg));
      if(openJobs.length>0){ setReturnDialog({existingJobs:openJobs,vehicle:v}); setReopenJobId(openJobs[0].id); }
    }
  };

  const custVehicles=selCustomer?wsVehicles.filter(v=>v.workshop_customer_id===selCustomer.id):[];
  const vehicleHistory=selVehicle?jobs.filter(j=>j.workshop_vehicle_id===selVehicle.id||j.vehicle_reg===selVehicle.reg).sort((a,b)=>new Date(b.date_in)-new Date(a.date_in)):[];

  // ── Return dialog ───────────────────────────────────────────
  if(returnDialog&&!f.id){
    return (
      <Overlay onClose={onClose} wide>
        <MHead title="🔄 Vehicle Return" onClose={onClose}/>
        <div style={{marginBottom:14,padding:12,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,marginBottom:6}}>⚠️ {returnDialog.vehicle.reg} has {returnDialog.existingJobs.length} open job(s)</div>
          {returnDialog.existingJobs.map(j=>(
            <div key={j.id} style={{fontSize:12,color:"var(--text2)",marginBottom:3}}>
              <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code> · <span style={{color:"var(--yellow)"}}>{j.status}</span> · {j.date_in}
              {j.complaint&&<span style={{marginLeft:6,color:"var(--text3)"}}>"{j.complaint.slice(0,50)}"</span>}
            </div>
          ))}
        </div>
        <div style={{marginBottom:14}}>
          <FL label="What would you like to do?"/>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <button className={`btn ${returnMode==="new"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setReturnMode("new")}>📋 New Job Card</button>
            <button className={`btn ${returnMode==="reopen"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setReturnMode("reopen")}>🔄 Continue Existing</button>
          </div>
          {returnMode==="reopen"&&returnDialog.existingJobs.length>1&&(
            <div style={{marginBottom:12}}>
              <FL label="Select job to reopen"/>
              {returnDialog.existingJobs.map(j=>(
                <label key={j.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,marginBottom:6,cursor:"pointer"}}>
                  <input type="radio" name="reopenJob" checked={reopenJobId===j.id} onChange={()=>setReopenJobId(j.id)}/>
                  <span style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.id}</span>
                  <span style={{fontSize:12,color:"var(--text3)"}}>{j.status} · {j.date_in}</span>
                </label>
              ))}
            </div>
          )}
          <FL label="Return Reason *"/>
          <textarea className="inp" value={returnReason} onChange={e=>setReturnReason(e.target.value)}
            placeholder="e.g. Same issue recurred, customer not satisfied, part failed..." style={{minHeight:70}}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setReturnDialog(null)}>← Back</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={async()=>{
            if(!returnReason.trim()){alert("Return reason is required");return;}
            if(returnMode==="new"){
              onSave({...f,return_reason:returnReason,parent_job_id:returnDialog.existingJobs[0].id});
            } else {
              const ej=returnDialog.existingJobs.find(j=>j.id===reopenJobId)||returnDialog.existingJobs[0];
              await onReopenJob({...ej,status:"In Progress",return_reason:returnReason,mileage:f.mileage||ej.mileage,date_in:f.date_in});
            }
          }}>{returnMode==="new"?"📋 Create New Job":"🔄 Reopen Job"}</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={f.id?"✏️ Edit Job Card":"🔧 New Job Card"} onClose={onClose}/>
      <div className="tabs" style={{marginBottom:18}}>
        {TABS.map(tb=>{
          const locked=tb.id==="photos"&&!canTakePhotos;
          return (
            <button key={tb.id}
              className={`tab ${tab===tb.id?"on":""}`}
              onClick={()=>locked?null:setTab(tb.id)}
              title={locked?"Fill in Customer, Vehicle plate, Mileage and Job complaint first":undefined}
              style={locked?{opacity:.35,cursor:"not-allowed",pointerEvents:"none"}:undefined}>
              {tb.label}{locked&&" 🔒"}
            </button>
          );
        })}
      </div>

      {tab==="customer"&&(
        <div>
          <FL label="Search Workshop Customer"/>
          <div style={{position:"relative",marginBottom:10}}>
            <input className="inp" value={custSearch}
              onChange={e=>{setCustSearch(e.target.value);setShowCustDrop(true);setSelCustomer(null);s("customer_name",e.target.value);s("workshop_customer_id",null);}}
              onFocus={()=>setShowCustDrop(true)} onBlur={()=>setTimeout(()=>setShowCustDrop(false),200)}
              placeholder="Type name or phone to search existing customers..."/>
            {showCustDrop&&custSearch.trim()&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,zIndex:200,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.2)"}}>
                {filtCust.length===0
                  ? <div style={{padding:12,color:"var(--text3)",fontSize:12}}>No match — fill fields below to create new</div>
                  : filtCust.map(c=>(
                      <div key={c.id} onMouseDown={()=>selectCustomer(c)}
                        style={{padding:"9px 14px",cursor:"pointer",borderBottom:"1px solid var(--border)"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
                        {c.phone&&<div style={{fontSize:11,color:"var(--text3)"}}>{c.phone}</div>}
                      </div>
                    ))
                }
              </div>
            )}
          </div>
          {selCustomer&&<div style={{padding:"6px 12px",background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:8,marginBottom:10,fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>✅ Linked: {selCustomer.name}</span>
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{setSelCustomer(null);setSelVehicle(null);setCustSearch(""); s("workshop_customer_id",null);}}>✕</button>
          </div>}
          <FG>
            <div><FL label="Name *"/><input className="inp" value={f.customer_name} onChange={e=>s("customer_name",e.target.value)} placeholder="Full name"/></div>
            <div><FL label={t.phone}/><input className="inp" type="tel" value={f.customer_phone} onChange={e=>s("customer_phone",e.target.value)} placeholder="+27..."/></div>
          </FG>
          <FD><FL label={t.email}/><input className="inp" type="email" value={f.customer_email} onChange={e=>s("customer_email",e.target.value)}/></FD>
        </div>
      )}

      {tab==="vehicle"&&(
        <div>
          {custVehicles.length>0&&(
            <div style={{marginBottom:14}}>
              <FL label="Customer's Saved Vehicles"/>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
                {custVehicles.map(v=>(
                  <button key={v.id}
                    className={`btn btn-sm ${selVehicle?.id===v.id?"btn-primary":"btn-ghost"}`}
                    onClick={()=>selectVehicle(v)}
                    style={{fontFamily:"DM Mono,monospace",fontWeight:700}}>
                    🚗 {v.reg}<span style={{fontWeight:400,fontSize:11,marginLeft:4}}>{v.make} {v.model}</span>
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>— or enter manually below —</div>
            </div>
          )}
          {vehicleHistory.length>0&&(
            <div style={{marginBottom:14,padding:12,background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)"}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>📋 Service History — {vehicleHistory.length} job(s)</div>
              {vehicleHistory.slice(0,5).map(j=>(
                <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                  <div>
                    <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                    <span style={{marginLeft:6,color:"var(--text2)"}}>{j.complaint?.slice(0,40)||"—"}</span>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0,alignItems:"center"}}>
                    <span style={{color:"var(--text3)",fontSize:11}}>{j.date_in}</span>
                    <span className="badge" style={{fontSize:10}}>{j.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Mileage + Date In — critical at top */}
          <FG>
            <div>
              <FL label="🛣️ Current Mileage (km) *"/>
              <input className="inp" type="number" value={f.mileage} onChange={e=>s("mileage",e.target.value)}
                placeholder="e.g. 85000" style={{fontSize:16,fontWeight:700}}/>
            </div>
            <div><FL label={t.dateIn||"Date In"}/><input className="inp" type="date" value={f.date_in} onChange={e=>s("date_in",e.target.value)}/></div>
          </FG>
          <FG>
            <div><FL label="🚗 Plate / Reg *"/><input className="inp" value={f.vehicle_reg} onChange={e=>s("vehicle_reg",e.target.value.toUpperCase())} placeholder="GP 123-456" style={{fontFamily:"DM Mono,monospace",fontWeight:700,letterSpacing:".05em"}}/></div>
            <div><FL label={t.vehicleColor||"Color"}/><input className="inp" value={f.vehicle_color} onChange={e=>s("vehicle_color",e.target.value)} placeholder="White, Black..."/></div>
          </FG>
          <FG cols="1fr 1fr 1fr">
            <div><FL label={t.make}/><input className="inp" value={f.vehicle_make} onChange={e=>s("vehicle_make",e.target.value)} placeholder="GWM, Toyota..."/></div>
            <div><FL label={t.model}/><input className="inp" value={f.vehicle_model} onChange={e=>s("vehicle_model",e.target.value)} placeholder="P-Series..."/></div>
            <div><FL label="Year"/><input className="inp" type="number" value={f.vehicle_year} onChange={e=>s("vehicle_year",e.target.value)} placeholder="2022"/></div>
          </FG>
          <FG>
            <div>
              <FL label="VIN"/>
              <input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} placeholder="17-char VIN..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/>
              {f.vin&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5}}>
                  <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(96,165,250,.15)",color:"var(--blue)",border:"1px solid rgba(96,165,250,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    PartsOuq
                  </a>
                  <a href={`https://www.realoem.com/bmw/enUS/select?vin=${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(52,211,153,.12)",color:"var(--green)",border:"1px solid rgba(52,211,153,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    RealOEM
                  </a>
                  <a href={`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(251,191,36,.12)",color:"var(--yellow)",border:"1px solid rgba(251,191,36,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    VinDecoderz
                  </a>
                  <button onClick={()=>{navigator.clipboard.writeText(f.vin);alert(`VIN copied to clipboard:\n\n${f.vin}\n\nPaste it into the VIN field on WolfOil.`);window.open("https://za.wolfoil.com/en-us/oil-finder","_blank");}}
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(249,115,22,.12)",color:"#f97316",border:"1px solid rgba(249,115,22,.3)",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap"}}>
                    WolfOil 📋
                  </button>
                  <a href="https://willard.co.za/battery-selection-tool/" target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(220,38,38,.12)",color:"#ef4444",border:"1px solid rgba(220,38,38,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    Willard 🔋
                  </a>
                  <a href="https://www.varta-automotive.com/battery-finder" target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(99,102,241,.12)",color:"#6366f1",border:"1px solid rgba(99,102,241,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    VARTA 🔋
                  </a>
                </div>
              )}
            </div>
            <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} placeholder="Engine number..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
          </FG>
          <FD>
            <FL label="🗓️ Licence Disc Expiry"/>
            <input className="inp" type="date" value={f.licence_disc_expiry} onChange={e=>s("licence_disc_expiry",e.target.value)}/>
            {f.licence_disc_expiry&&(
              <div style={{marginTop:4,fontSize:12,fontWeight:600,color:new Date(f.licence_disc_expiry)<new Date()?"var(--red)":"var(--green)"}}>
                {new Date(f.licence_disc_expiry)<new Date()?"⚠️ EXPIRED":"✅ Valid"}
              </div>
            )}
          </FD>
        </div>
      )}

      {tab==="job"&&(
        <div>
          {/* Return reason — shown prominently if this is a return */}
          {f.parent_job_id&&(
            <div style={{marginBottom:14,padding:10,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10,fontSize:13}}>
              🔄 <strong>Return Job</strong> — ref: <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{f.parent_job_id}</code>
              <div style={{marginTop:8}}><FL label="Return Reason *"/>
                <textarea className="inp" value={f.return_reason} onChange={e=>s("return_reason",e.target.value)}
                  placeholder="Why did the car come back? e.g. Same noise still present..." style={{minHeight:60}}/>
              </div>
            </div>
          )}
          {/* Main job — what needs to be done */}
          <FD><FL label="🔧 Main Job / Customer Complaint *"/>
            <textarea className="inp" value={f.complaint} onChange={e=>s("complaint",e.target.value)}
              placeholder="What does the customer want done? e.g. Engine overheating, brake noise, service due..." style={{minHeight:80,fontWeight:500}}/>
          </FD>
          <FG>
            <div><FL label={t.mechanic||"Mechanic"}/><input className="inp" value={f.mechanic} onChange={e=>s("mechanic",e.target.value)} placeholder="Assign mechanic..."/></div>
            <div><FL label="Status"/>
              <select className="inp" value={f.status} onChange={e=>s("status",e.target.value)}>
                {["Pending","In Progress","Done","Delivered"].map(st=><option key={st}>{st}</option>)}
              </select>
            </div>
          </FG>
          <FD><FL label={t.diagnosis||"Diagnosis / Work Done"}/><textarea className="inp" value={f.diagnosis} onChange={e=>s("diagnosis",e.target.value)} placeholder="Mechanic findings and work performed..." style={{minHeight:70}}/></FD>
          <FG>
            <div><FL label={t.dateOut||"Expected Date Out"}/><input className="inp" type="date" value={f.date_out} onChange={e=>s("date_out",e.target.value)}/></div>
          </FG>
          <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Internal notes..." style={{minHeight:50}}/></FD>
        </div>
      )}

      {tab==="photos"&&(
        <div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
            Capture condition photos before work starts. Photos will be saved to the vehicle record after the job is saved.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <JobPhotoSlot label="Front"  value={f.photo_front} onChange={v=>s("photo_front",v)} reg={f.vehicle_reg}/>
            <JobPhotoSlot label="Side"   value={f.photo_side}  onChange={v=>s("photo_side",v)}  reg={f.vehicle_reg}/>
            <JobPhotoSlot label="Rear"   value={f.photo_rear}  onChange={v=>s("photo_rear",v)}  reg={f.vehicle_reg}/>
          </div>
          {photoCount>0&&(
            <div style={{marginTop:10,fontSize:12,color:"var(--green)"}}>
              ✅ {photoCount} photo{photoCount!==1?"s":""} captured — will upload when you save the job
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{
          if(!f.customer_name.trim()){alert("Customer name required — go to Customer tab");setTab("customer");return;}
          if(!f.vehicle_reg.trim()){alert("Vehicle plate required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.mileage){alert("Mileage required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.complaint.trim()){alert("Main job / complaint required — go to Job tab");setTab("job");return;}
          if(f.parent_job_id&&!f.return_reason.trim()){alert("Return reason required for return jobs — go to Job tab");setTab("job");return;}
          onSave(f);
        }}>💾 {t.save}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// JOB PHOTO SLOT — capture front/side/rear on job card creation
// ═══════════════════════════════════════════════════════════════
function JobPhotoSlot({label, value, onChange, reg}) {
  const camRef  = useRef(null);
  const fileRef = useRef(null);
  const [browsing,      setBrowsing]      = useState(false);
  const [drivePhotos,   setDrivePhotos]   = useState(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [error,         setError]         = useState(null);

  const plate = (reg||"").replace(/\s/g,"").toUpperCase();

  const getScriptUrl = () =>
    (window._VEHICLE_SCRIPT_URL && window._VEHICLE_SCRIPT_URL.trim()) ||
    (window._APPS_SCRIPT_URL    && window._APPS_SCRIPT_URL.trim())    || "";

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    const fr = new FileReader();
    fr.onload = ev => onChange(ev.target.result);
    fr.readAsDataURL(file);
    e.target.value = "";
  };

  const openBrowse = async () => {
    const SCRIPT_URL = getScriptUrl();
    if (!SCRIPT_URL) { setError("⚙️ Set Vehicle Script URL in Settings first"); return; }
    if (!plate) { setError("Enter vehicle reg first"); return; }
    setBrowsing(true);
    if (drivePhotos === null) {
      setBrowseLoading(true);
      try {
        const resp = await fetch(SCRIPT_URL, { method:"POST", body:JSON.stringify({action:"listPhotos", plate}) });
        const result = await resp.json();
        if (result.success) setDrivePhotos(result.photos || []);
        else throw new Error(result.error || "Could not list photos");
      } catch(e) { setError("❌ " + e.message); setBrowsing(false); }
      setBrowseLoading(false);
    }
  };

  return (
    <div>
      <div onClick={()=>fileRef.current?.click()} style={{
        border:`2px dashed ${value?"var(--green)":"var(--border)"}`,
        borderRadius:10, cursor:"pointer",
        background:value?"var(--surface)":"var(--surface2)",
        aspectRatio:"4/3", overflow:"hidden", position:"relative",
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"border-color .15s",
      }}>
        <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
        <input ref={fileRef} type="file" style={{display:"none"}} onChange={handleFile}/>
        {value
          ? (value.startsWith("data:")
              ? <img src={value} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <DriveImg url={value} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
          : <div style={{textAlign:"center",color:"var(--text3)",padding:8}}>
              <div style={{fontSize:22,marginBottom:4}}>🖼️</div>
              <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>{label}</div>
              <div style={{fontSize:10}}>Tap to choose</div>
            </div>
        }
      </div>
      <div style={{display:"flex",gap:4,marginTop:5}}>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
          onClick={e=>{e.stopPropagation();camRef.current?.click();}}>
          <span style={{fontSize:13}}>📷</span><span>Camera</span>
        </button>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
          onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>
          <span style={{fontSize:13}}>🖼️</span><span>Files</span>
        </button>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1,
            color:"var(--blue)",opacity:plate?1:0.4}}
          title={plate?`Browse Drive: ${plate}`:"Enter vehicle reg first"}
          onClick={e=>{e.stopPropagation();openBrowse();}}>
          <span style={{fontSize:13}}>☁️</span><span>Drive</span>
        </button>
        {value&&(
          <button className="btn btn-ghost btn-xs"
            style={{padding:"4px 6px",fontSize:10,color:"var(--red)"}}
            onClick={e=>{e.stopPropagation();onChange("");}}>✕</button>
        )}
      </div>
      {error && <div style={{fontSize:10,color:"var(--red)",marginTop:3}}>{error}</div>}

      {/* Drive photo picker */}
      {browsing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setBrowsing(false)}>
          <div style={{background:"var(--surface)",borderRadius:"12px 12px 0 0",padding:16,width:"100%",maxWidth:600,maxHeight:"75vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14}}>☁️ Drive — {plate}</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setBrowsing(false)}>✕</button>
            </div>
            {browseLoading
              ? <div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>Loading photos...</div>
              : drivePhotos && drivePhotos.length===0
                ? <div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>No photos found for {plate}</div>
                : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {(drivePhotos||[]).map(p=>(
                      <div key={p.id} style={{aspectRatio:"1",borderRadius:8,overflow:"hidden",cursor:"pointer",border:"2px solid transparent"}}
                        onClick={()=>{ onChange(p.url); setBrowsing(false); }}>
                        <DriveImg url={p.url} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                    ))}
                  </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP ITEM MODAL — Add Part or Labour (uses workshop stock)
// ═══════════════════════════════════════════════════════════════
function WorkshopItemModal({type, wsStock=[], wsServices=[], defaultMarkupPct=0, onSave, onClose, t}) {
  const [desc,      setDesc]      = useState("");
  const [qty,       setQty]       = useState(1);
  const [price,     setPrice]     = useState("");
  const [costPrice, setCostPrice] = useState(0);
  const [markupPct, setMarkupPct] = useState(defaultMarkupPct);
  const [selItem,   setSelItem]   = useState(null);
  const [search,    setSearch]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const list = type==="part" ? wsStock : wsServices;

  const filtered = list.filter(p=>{
    if(!search.trim()) return true;
    const hay=`${p.name||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>hay.includes(w));
  }).slice(0,30);

  const total = (+qty||0)*(+price||0);

  const resetForm=()=>{ setDesc(""); setQty(1); setPrice(""); setCostPrice(0); setMarkupPct(defaultMarkupPct); setSelItem(null); setSearch(""); };

  const selectItem=(p)=>{
    setSelItem(p);
    setDesc(p.name);
    const cost=+(p.unit_cost||0);
    const listPrice=+(p.unit_price||p.default_price||p.price||p.rate||0);
    if(type==="part"&&cost>0&&defaultMarkupPct>0){
      setCostPrice(cost);
      setMarkupPct(defaultMarkupPct);
      setPrice(String(+(cost*(1+defaultMarkupPct/100)).toFixed(2)));
    } else if(type==="part"&&cost>0){
      setCostPrice(cost);
      const mp=listPrice>0?+((listPrice/cost-1)*100).toFixed(1):0;
      setMarkupPct(mp);
      setPrice(String(listPrice||cost));
    } else {
      setCostPrice(0);
      setMarkupPct(defaultMarkupPct);
      setPrice(String(listPrice||""));
    }
    setSearch("");
  };

  const handleSave=async()=>{
    if(!desc.trim()||!price){alert("Fill description and price");return;}
    setSaving(true);
    try{
      await onSave({
        type,
        description:desc,
        part_sku:selItem?selItem.sku||"":"",
        ws_stock_id:type==="part"&&selItem?selItem.id:null,
        qty:+qty,
        unit_price:+price,
        cost_price:type==="part"?+costPrice:0,
        markup_pct:type==="part"?+markupPct:0,
        total:(+qty)*(+price),
      });
      resetForm();
      setJustAdded(true);
      setTimeout(()=>setJustAdded(false),2000);
    }catch(e){ alert("Save failed: "+e.message); }
    finally{ setSaving(false); }
  };

  const stockBadge=(p)=>{
    if(type!=="part") return null;
    const q=+p.qty||0;
    const low=+p.min_qty||0;
    const color=q<=0?"var(--red)":q<=low?"var(--yellow)":"var(--green)";
    return <span style={{fontSize:11,fontWeight:700,color,fontFamily:"Rajdhani,sans-serif",flexShrink:0}}>
      {q<=0?"⛔ Out":q<=low?`⚠️ ${q}`:q} {type==="part"&&p.unit?p.unit:""}
    </span>;
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={type==="part"?"🔩 Add WS Part":"👷 Add Labour"} onClose={onClose}/>

      <div style={{marginBottom:14}}>
        <FL label={type==="part"?"Search Workshop Stock":"Search Service Preset"}/>
        <div style={{marginBottom:8}}>
          <input className="inp" value={search} onChange={e=>{setSearch(e.target.value);setSelItem(null);}}
            placeholder={type==="part"?"Search part name, SKU...":"Search service name..."}/>
        </div>

        {(search||list.length<=10)&&!selItem&&(
          <div style={{border:"1px solid var(--border)",borderRadius:10,maxHeight:300,overflowY:"auto",marginBottom:8}}>
            {(search?filtered:list.slice(0,20)).length===0
              ? <div style={{padding:12,color:"var(--text3)",fontSize:13,textAlign:"center"}}>
                  {type==="part"?"No workshop stock — add items in WS Stock tab":"No services — add presets in Services tab"}
                </div>
              : (search?filtered:list.slice(0,20)).map(p=>(
                  <div key={p.id} onClick={()=>selectItem(p)}
                    style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:10,alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontSize:22,flexShrink:0}}>{type==="part"?"🔩":"🔧"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>
                        {p.name}
                        {p.quote_only&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",borderRadius:4,padding:"1px 5px"}}>📋 Quote only</span>}
                      </div>
                      {p.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku}</code>}
                      {p.description&&<div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{p.description}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>{fmtAmt(p.unit_price||p.default_price||p.price||p.rate||0)}</div>
                      {type==="part"&&!p.quote_only&&stockBadge(p)}
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {selItem&&(
          <div style={{padding:"10px 12px",background:"rgba(96,165,250,.08)",borderRadius:8,border:"1px solid rgba(96,165,250,.2)",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <div style={{fontSize:22,flexShrink:0}}>{type==="part"?"🔩":"🔧"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600}}>{selItem.name}</div>
              {selItem.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{selItem.sku}</code>}
              {type==="part"&&stockBadge(selItem)}
            </div>
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}}
              onClick={()=>{ setSelItem(null); setDesc(""); setPrice(""); }}>✕</button>
          </div>
        )}
      </div>

      <FD><FL label="Description *"/>
        <input className="inp" value={desc} onChange={e=>setDesc(e.target.value)}
          placeholder={type==="part"?"Part name...":"Labour e.g. Oil change, brake pad replacement..."}/>
      </FD>
      <FG>
        <div><FL label="Qty"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="0.5" step="0.5"/></div>
        <div><FL label={`Unit ${type==="part"?"Price":"Rate"}`}/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></div>
        <div><FL label="Total"/><input className="inp" value={fmtAmt(total)} readOnly style={{color:"var(--accent)",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}/></div>
      </FG>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        {justAdded&&<div style={{flex:"0 0 100%",textAlign:"center",fontSize:13,color:"var(--green)",fontWeight:600,padding:"4px 0"}}>✅ Added! You can add another.</div>}
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Done</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
          {saving?"Saving...":("✅ Add "+(type==="part"?"Part":"Labour"))}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS SUPPLIER INVOICES PAGE
// ═══════════════════════════════════════════════════════════════
function WsSupplierInvoicesPage({invoices=[],invItems=[],payments=[],returns=[],wsSuppliers=[],wsStock=[],settings,onSaveInvoice,onDeleteInvoice,onSavePayment,onDeletePayment,onSaveReturn}) {
  const C = curSym(settings?.currency||getSettings().currency);
  const fmt = v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"view"|"pay"|"return", item?}
  const [search,setSearch]=useState("");
  const [filterSup,setFilterSup]=useState("__all__");
  const [filterSt,setFilterSt]=useState("__all__");

  const ST_COLOR={pending:"var(--blue)",partial:"var(--yellow)",paid:"var(--green)",overdue:"var(--red)"};
  const ST_BG={pending:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",paid:"rgba(52,211,153,.12)",overdue:"rgba(248,113,113,.12)"};

  const supNames=[...new Set(invoices.map(i=>i.supplier_name).filter(Boolean))].sort();

  const filtered=invoices.filter(inv=>{
    if(filterSup!=="__all__"&&inv.supplier_name!==filterSup) return false;
    if(filterSt!=="__all__"&&inv.status!==filterSt) return false;
    if(search.trim()){
      const h=`${inv.supplier_name||""} ${inv.invoice_ref||""} ${inv.id}`.toLowerCase();
      if(!search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w))) return false;
    }
    return true;
  });

  const totalOwing=invoices.reduce((s,i)=>s+(+i.total||0)-(+i.paid_amount||0),0);
  const totalPaid=invoices.reduce((s,i)=>s+(+i.paid_amount||0),0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {[
          {label:"Total Invoices",val:invoices.length,sub:"all time"},
          {label:"Total Paid",val:fmt(totalPaid),color:"var(--green)"},
          {label:"Outstanding",val:fmt(totalOwing),color:totalOwing>0?"var(--red)":"var(--green)"},
        ].map((c,i)=>(
          <div key={i} className="card" style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:c.color||"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{c.val}</div>
            {c.sub&&<div style={{fontSize:11,color:"var(--text3)"}}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input className="inp" style={{flex:1,minWidth:160}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, ref..."/>
        <select className="inp" style={{width:160}} value={filterSup} onChange={e=>setFilterSup(e.target.value)}>
          <option value="__all__">All Suppliers</option>
          {supNames.map(n=><option key={n}>{n}</option>)}
        </select>
        <select className="inp" style={{width:130}} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
          <option value="__all__">All Status</option>
          {["pending","partial","paid","overdue"].map(s=><option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ New Invoice</button>
      </div>

      {/* Invoice list */}
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🧾</div>
            <div style={{fontWeight:600}}>No supplier invoices yet</div>
            <div style={{fontSize:13,marginTop:4}}>Record purchases from suppliers to update stock</div>
          </div>
        :<div style={{overflowX:"auto"}}>
          <table className="tbl" style={{width:"100%"}}>
            <thead><tr><th>Date</th><th>Supplier</th><th>Ref#</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Owing</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(inv=>{
                const owing=(+inv.total||0)-(+inv.paid_amount||0);
                return (
                  <tr key={inv.id}>
                    <td style={{fontSize:12,whiteSpace:"nowrap"}}>{inv.invoice_date||"—"}</td>
                    <td style={{fontWeight:600}}>{inv.supplier_name||"—"}</td>
                    <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{inv.invoice_ref||inv.id}</code></td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(inv.total)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{fmt(inv.paid_amount||0)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:owing>0?"var(--red)":"var(--text3)"}}>{owing>0?fmt(owing):"—"}</td>
                    <td><span className="badge" style={{background:ST_BG[inv.status]||ST_BG.pending,color:ST_COLOR[inv.status]||ST_COLOR.pending,fontSize:11}}>{inv.status||"pending"}</span></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"view",item:inv})} title="View">👁</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"pay",item:inv})} title="Record payment" style={{color:"var(--green)"}}>💳</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"return",item:inv})} title="Return items" style={{color:"var(--yellow)"}}>↩️</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:inv})} title="Edit">✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{ if(window.confirm("Delete this invoice? Stock will NOT be reversed.")) onDeleteInvoice(inv.id); }} title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }

      {/* Modals */}
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsSupInvoiceModal
          item={modal.item} wsSuppliers={wsSuppliers} wsStock={wsStock} settings={settings} fmt={fmt}
          onSave={async(inv,items)=>{ await onSaveInvoice(inv,items); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="view"&&(
        <WsSupInvoiceViewModal
          invoice={modal.item} items={invItems.filter(i=>i.invoice_id===modal.item.id)}
          payments={payments.filter(p=>p.invoice_id===modal.item.id)}
          returns={returns.filter(r=>r.invoice_id===modal.item.id)}
          fmt={fmt} onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="pay"&&(
        <WsSupPaymentModal
          invoice={modal.item} settings={settings} fmt={fmt}
          onSave={async(pay)=>{ await onSavePayment(pay); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="return"&&(
        <WsSupReturnModal
          invoice={modal.item} items={invItems.filter(i=>i.invoice_id===modal.item.id)}
          wsStock={wsStock} fmt={fmt}
          onSave={async(ret,lines)=>{ await onSaveReturn(ret,lines); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

// ── Supplier Invoice Create/Edit Modal ──────────────────────────
function WsSupInvoiceModal({item,wsSuppliers=[],wsStock=[],settings,fmt,onSave,onClose}) {
  const isEdit=!!item;
  const [suppId,setSuppId]=useState(item?.supplier_id||"");
  const [suppName,setSuppName]=useState(item?.supplier_name||"");
  const [invRef,setInvRef]=useState(item?.invoice_ref||"");
  const [invDate,setInvDate]=useState(item?.invoice_date||new Date().toISOString().slice(0,10));
  const [dueDate,setDueDate]=useState(item?.due_date||"");
  const [notes,setNotes]=useState(item?.notes||"");
  const [lines,setLines]=useState(isEdit?[]:[{stock_id:"",part_name:"",part_sku:"",qty:1,unit_cost:0,total:0}]);
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const vatRate=+(settings?.tax_rate||0)/100;
  const C=curSym(settings?.currency||getSettings().currency);

  const setLine=(i,k,v)=>setLines(p=>p.map((r,j)=>{
    if(j!==i) return r;
    const nr={...r,[k]:v};
    if(k==="qty"||k==="unit_cost") nr.total=(+nr.qty||0)*(+nr.unit_cost||0);
    return nr;
  }));

  const addLine=()=>setLines(p=>[...p,{stock_id:"",part_name:"",part_sku:"",qty:1,unit_cost:0,total:0}]);
  const removeLine=i=>setLines(p=>p.filter((_,j)=>j!==i));

  const selectStock=(i,s)=>{
    setLines(p=>p.map((r,j)=>j===i?{...r,stock_id:s.id,part_name:s.name,part_sku:s.sku||"",unit_cost:+s.unit_cost||0,total:(+r.qty||1)*(+s.unit_cost||0)}:r));
    setSearch("");
  };

  const subtotal=lines.reduce((s,l)=>s+(+l.total||0),0);
  const tax=vatRate>0&&settings?.vat_number?subtotal*vatRate:0;
  const total=subtotal+tax;

  const chooseSup=(id)=>{
    const s=wsSuppliers.find(x=>String(x.id)===id);
    setSuppId(id); setSuppName(s?.name||"");
  };

  const handleSave=async()=>{
    if(!suppName.trim()){alert("Select or enter a supplier");return;}
    if(lines.length===0||lines.every(l=>!l.part_name.trim())){alert("Add at least one line item");return;}
    setSaving(true);
    try{
      const inv={
        ...(isEdit?{id:item.id}:{}),
        supplier_id:suppId||null,supplier_name:suppName.trim(),
        invoice_ref:invRef.trim()||null,invoice_date:invDate,due_date:dueDate||null,
        subtotal,tax,total,paid_amount:isEdit?(item.paid_amount||0):0,
        status:isEdit?(item.status||"pending"):"pending",notes:notes.trim()||null,
      };
      const validLines=lines.filter(l=>l.part_name.trim()&&+l.qty>0);
      await onSave(inv,validLines);
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  const filteredStock=wsStock.filter(s=>{
    if(!search.trim()) return false;
    return `${s.name||""} ${s.sku||""}`.toLowerCase().includes(search.toLowerCase());
  }).slice(0,8);

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Supplier Invoice":"🧾 New Supplier Invoice"} onClose={onClose}/>

      {/* Supplier */}
      <div className="card" style={{padding:12,marginBottom:12,background:"var(--surface2)"}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:8}}>Supplier</div>
        <FG>
          <div>
            <FL label="Select Supplier"/>
            <select className="inp" value={suppId} onChange={e=>chooseSup(e.target.value)}>
              <option value="">— Select —</option>
              {wsSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><FL label="Or type supplier name"/><input className="inp" value={suppName} onChange={e=>{setSuppName(e.target.value);setSuppId("");}}/></div>
        </FG>
        <FG>
          <div><FL label="Their Invoice Ref#"/><input className="inp" value={invRef} onChange={e=>setInvRef(e.target.value)} placeholder="e.g. INV-2025-001"/></div>
          <div><FL label="Invoice Date"/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
          <div><FL label="Due Date"/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
        </FG>
      </div>

      {/* Line items */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Line Items</div>
      {!isEdit&&(
        <div style={{position:"relative",marginBottom:8}}>
          <input className="inp" placeholder="🔍 Search workshop stock to add..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filteredStock.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:99,background:"var(--surface1)",border:"1px solid var(--border)",borderRadius:8,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
              {filteredStock.map(s=>(
                <div key={s.id} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  onClick={()=>selectStock(lines.length-1,s)}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                    {s.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{s.sku}</code>}
                  </div>
                  <div style={{fontSize:12,color:"var(--text3)"}}>Cost: {C}{+s.unit_cost||0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:8}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["Part","Qty","Unit Cost","Total",""].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {lines.map((ln,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",borderBottom:i<lines.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <input className="inp" value={ln.part_name} onChange={e=>setLine(i,"part_name",e.target.value)} placeholder="Part name" style={{fontSize:12,padding:"4px 8px"}}/>
            <input className="inp" type="number" min="0.01" step="0.01" value={ln.qty} onChange={e=>setLine(i,"qty",e.target.value)} style={{fontSize:12,padding:"4px 8px",textAlign:"right"}}/>
            <input className="inp" type="number" min="0" step="0.01" value={ln.unit_cost} onChange={e=>setLine(i,"unit_cost",e.target.value)} style={{fontSize:12,padding:"4px 8px",textAlign:"right"}}/>
            <div style={{textAlign:"right",fontSize:13,fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(ln.total)}</div>
            <button onClick={()=>removeLine(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:16,padding:0}} disabled={lines.length===1}>✕</button>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"8px 10px",background:"var(--surface2)",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:12,fontWeight:700}}>Subtotal</div>
          <div/><div/>
          <div style={{textAlign:"right",fontWeight:800,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(subtotal)}</div>
          <div/>
        </div>
        {tax>0&&(
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"4px 10px 6px",background:"var(--surface2)"}}>
            <div style={{fontSize:12,color:"var(--text3)"}}>VAT ({settings?.tax_rate}%)</div>
            <div/><div/>
            <div style={{textAlign:"right",fontSize:12,fontFamily:"Rajdhani,sans-serif",color:"var(--text3)"}}>{fmt(tax)}</div>
            <div/>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",background:"var(--surface2)"}}>
          <div style={{fontSize:13,fontWeight:800}}>TOTAL</div>
          <div/><div/>
          <div style={{textAlign:"right",fontWeight:900,fontFamily:"Rajdhani,sans-serif",fontSize:16,color:"var(--accent)"}}>{fmt(total)}</div>
          <div/>
        </div>
      </div>
      {!isEdit&&<button className="btn btn-ghost btn-sm" onClick={addLine} style={{marginBottom:12}}>+ Add Line</button>}

      <FD><FL label="Notes"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:46,resize:"vertical"}} placeholder="Optional notes..."/></FD>
      {!isEdit&&<p style={{fontSize:11,color:"var(--text3)",marginTop:4}}>📦 Saving will add stock quantities to workshop stock automatically.</p>}

      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":isEdit?"💾 Save Changes":"✅ Save & Update Stock"}</button>
      </div>
    </Overlay>
  );
}

// ── Supplier Invoice View Modal ─────────────────────────────────
function WsSupInvoiceViewModal({invoice,items=[],payments=[],returns=[],fmt,onClose}) {
  const owing=(+invoice.total||0)-(+invoice.paid_amount||0);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 Invoice — ${invoice.invoice_ref||invoice.id}`} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:14}}>{invoice.supplier_name}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_date}{invoice.due_date&&` · Due ${invoice.due_date}`}</div>
          {invoice.notes&&<div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>{invoice.notes}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:20,fontWeight:900,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(invoice.total)}</div>
          <div style={{fontSize:12,color:"var(--green)"}}>Paid: {fmt(invoice.paid_amount||0)}</div>
          {owing>0&&<div style={{fontSize:12,color:"var(--red)",fontWeight:700}}>Owing: {fmt(owing)}</div>}
        </div>
      </div>

      {/* Items */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Items Received</div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["Part","SKU","Qty","Cost"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {items.map((it,i)=>(
          <div key={it.id||i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:6,padding:"8px 10px",borderBottom:i<items.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <div style={{fontWeight:600,fontSize:13}}>{it.part_name}</div>
            <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{it.part_sku||"—"}</code>
            <div>{it.qty}</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(it.total)}</div>
          </div>
        ))}
      </div>

      {/* Payments */}
      {payments.length>0&&(<>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Payments</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {payments.map((p,i)=>(
            <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"rgba(52,211,153,.08)",borderRadius:8,border:"1px solid rgba(52,211,153,.2)"}}>
              <div>
                <span style={{fontWeight:600,color:"var(--green)"}}>{fmt(p.amount)}</span>
                <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{p.payment_date} · {p.method||"cash"}</span>
                {p.reference&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>Ref: {p.reference}</span>}
              </div>
              {p.notes&&<span style={{fontSize:11,color:"var(--text3)"}}>{p.notes}</span>}
            </div>
          ))}
        </div>
      </>)}

      {/* Returns */}
      {returns.length>0&&(<>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Returns</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {returns.map((r,i)=>(
            <div key={r.id||i} style={{padding:"8px 12px",background:"rgba(251,191,36,.08)",borderRadius:8,border:"1px solid rgba(251,191,36,.2)"}}>
              <div style={{fontWeight:600,color:"var(--yellow)"}}>↩️ Return — {r.return_date}</div>
              {r.reason&&<div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{r.reason}</div>}
              <div style={{fontSize:12,color:"var(--accent)",fontWeight:700,marginTop:2}}>{fmt(r.total)}</div>
            </div>
          ))}
        </div>
      </>)}

      <button className="btn btn-ghost" style={{width:"100%"}} onClick={onClose}>Close</button>
    </Overlay>
  );
}

// ── Payment Modal ───────────────────────────────────────────────
function WsSupPaymentModal({invoice,settings,fmt,onSave,onClose}) {
  const owing=Math.max(0,(+invoice.total||0)-(+invoice.paid_amount||0));
  const [amount,setAmount]=useState(String(owing||""));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [method,setMethod]=useState("cash");
  const [ref,setRef]=useState("");
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!+amount||+amount<=0){alert("Enter a valid amount");return;}
    setSaving(true);
    try{
      await onSave({invoice_id:invoice.id,supplier_id:invoice.supplier_id||null,supplier_name:invoice.supplier_name||"",amount:+amount,payment_date:date,method,reference:ref.trim()||null,notes:notes.trim()||null});
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="💳 Record Payment" onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontWeight:700}}>{invoice.supplier_name}</div>
        <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_ref||invoice.id}</div>
        <div style={{marginTop:4,fontSize:13}}>Total: <strong>{fmt(invoice.total)}</strong> · Paid: <strong style={{color:"var(--green)"}}>{fmt(invoice.paid_amount||0)}</strong> · Owing: <strong style={{color:"var(--red)"}}>{fmt(owing)}</strong></div>
      </div>
      <FG>
        <div><FL label="Amount"/><input className="inp" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div><FL label="Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      </FG>
      <FG>
        <div><FL label="Method"/>
          <select className="inp" value={method} onChange={e=>setMethod(e.target.value)}>
            {["cash","bank transfer","cheque","card","other"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div><FL label="Reference"/><input className="inp" value={ref} onChange={e=>setRef(e.target.value)} placeholder="e.g. EFT ref, cheque #"/></div>
      </FG>
      <FD><FL label="Notes"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:44}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Record Payment"}</button>
      </div>
    </Overlay>
  );
}

// ── Return Modal ────────────────────────────────────────────────
function WsSupReturnModal({invoice,items=[],wsStock=[],fmt,onSave,onClose}) {
  const [lines,setLines]=useState(items.map(it=>({...it,return_qty:0,selected:false})));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const setLine=(i,k,v)=>setLines(p=>p.map((r,j)=>j===i?{...r,[k]:v}:r));

  const returnLines=lines.filter(l=>l.selected&&+l.return_qty>0);
  const total=returnLines.reduce((s,l)=>s+(+l.return_qty||0)*(+l.unit_cost||0),0);

  const handleSave=async()=>{
    if(returnLines.length===0){alert("Select at least one item to return");return;}
    setSaving(true);
    try{
      const ret={invoice_id:invoice.id,supplier_id:invoice.supplier_id||null,supplier_name:invoice.supplier_name||"",return_date:date,reason:reason.trim()||null,total,status:"pending"};
      await onSave(ret,returnLines.map(l=>({stock_id:l.stock_id||null,part_name:l.part_name,part_sku:l.part_sku||"",qty:+l.return_qty,unit_cost:+l.unit_cost})));
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="↩️ Return Items to Supplier" onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontWeight:700}}>{invoice.supplier_name}</div>
        <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_ref||invoice.id} · {invoice.invoice_date}</div>
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:10}}>
        <div style={{display:"grid",gridTemplateColumns:"32px 2fr 1fr 1fr 1fr",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["","Part","Invoiced Qty","Return Qty","Value"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {lines.map((ln,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"32px 2fr 1fr 1fr 1fr",gap:6,padding:"8px 10px",borderBottom:i<lines.length-1?"1px solid var(--border)":"none",alignItems:"center",background:ln.selected?"var(--surface2)":"transparent"}}>
            <input type="checkbox" checked={ln.selected} onChange={e=>setLine(i,"selected",e.target.checked)} style={{width:15,height:15,accentColor:"var(--accent)"}}/>
            <div style={{fontWeight:600,fontSize:13}}>{ln.part_name}<br/>{ln.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:10,color:"var(--blue)"}}>{ln.part_sku}</code>}</div>
            <div style={{textAlign:"center",color:"var(--text3)"}}>{ln.qty}</div>
            <input className="inp" type="number" min="0" max={ln.qty} step="1"
              value={ln.return_qty} onChange={e=>setLine(i,"return_qty",e.target.value)}
              disabled={!ln.selected} style={{padding:"4px 8px",textAlign:"right",fontSize:12,opacity:ln.selected?1:.4}}/>
            <div style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--yellow)"}}>{ln.selected&&+ln.return_qty>0?fmt((+ln.return_qty)*(+ln.unit_cost||0)):"—"}</div>
          </div>
        ))}
        {returnLines.length>0&&(
          <div style={{padding:"8px 10px",background:"var(--surface2)",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"flex-end",gap:8}}>
            <span style={{fontSize:13,fontWeight:700}}>Return Total:</span>
            <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--yellow)",fontSize:14}}>{fmt(total)}</span>
          </div>
        )}
      </div>
      <FG>
        <div><FL label="Return Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Wrong part, damaged"/></div>
      </FG>
      <p style={{fontSize:11,color:"var(--text3)",marginTop:4}}>📦 Stock quantities will be reduced for returned items.</p>
      <div style={{display:"flex",gap:10,marginTop:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"↩️ Confirm Return"}</button>
      </div>
    </Overlay>
  );
}

// ── Supplier Statement (per-supplier view) ──────────────────────
// (Accessible from the invoice list by filtering to one supplier)

// ═══════════════════════════════════════════════════════════════
// WS STOCK PAGE
// ═══════════════════════════════════════════════════════════════
function WsStockPage({wsStock=[],settings,onSave,onDelete,onAdjust}) {
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
        <WsStockModal item={modal.item}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

function WsStockModal({item,onSave,onClose}) {
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
  const isEdit=!!item;

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
        <FD><FL label="SKU"/><input className="inp" value={sku} onChange={e=>setSku(e.target.value)} placeholder="WS-001"/></FD>
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

function WsStockAdjustModal({item,onSave,onClose}) {
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

// ═══════════════════════════════════════════════════════════════
// WS SERVICES PAGE
// ═══════════════════════════════════════════════════════════════
function WsServicesPage({wsServices=[],settings,onSave,onDelete}) {
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

function WsServiceModal({item,onSave,onClose}) {
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

// ═══════════════════════════════════════════════════════════════
// CREATE PO FROM JOB MODAL
// ═══════════════════════════════════════════════════════════════
function WsCreatePoFromJobModal({job,wsSupplierQuotes=[],wsSupplierRequests=[],sqReplies=[],wsSuppliers=[],settings,onSave,onViewPOs,onClose}) {
  const C=curSym(settings?.currency||getSettings().currency);

  // Build groups: one entry per supplier, merging manual quotes + digital replies
  const groupMap={};
  const addToGroup=(supplierId,supplierName,items,quoteRef)=>{
    const key=supplierName||supplierId||"unknown";
    if(!groupMap[key]) groupMap[key]={supplierId:supplierId||"",supplierName,quoteRef:quoteRef||"",items:[]};
    else if(quoteRef&&!groupMap[key].quoteRef) groupMap[key].quoteRef=quoteRef;
    groupMap[key].items.push(...items);
  };

  wsSupplierQuotes.forEach(sq=>{
    const lines=(() => { try{return JSON.parse(sq.line_items||"[]");}catch{return[];} })();
    const linkedReq=wsSupplierRequests.find(r=>r.id===sq.request_id);
    const reqItems=(() => { try{return JSON.parse(linkedReq?.items_json||"[]");}catch{return[];} })();
    const skuByName={};
    reqItems.forEach(it=>{ const k=(it.label||it.description||"").toLowerCase().trim(); if(k) skuByName[k]=it.sku||""; });
    const valid=lines.filter(l=>l.name);
    if(!valid.length) return;
    addToGroup(sq.supplier_id||"",sq.supplier_name||"Unknown",
      valid.map(l=>({
        id:"sq-"+sq.id+"-"+l.name,
        description:l.name||"",
        sku:skuByName[(l.name||"").toLowerCase().trim()]||l.sku||"",
        supplier_part_no:"",
        qty:+l.qty||1,
        unit_price:+(l.vat_incl_price||l.price)||0,
        condition:"in_stock",
      })),
      sq.quote_ref||""
    );
  });

  sqReplies.forEach(rep=>{
    const req=wsSupplierRequests.find(r=>r.id===rep.request_id);
    const replyItems=(() => { try{return JSON.parse(rep.items||"[]");}catch{return[];} })()
      .filter(ri=>ri.condition!=="no_stock"&&ri.description);
    if(!replyItems.length) return;
    const sName=req?.supplier_name||"Supplier";
    const sId=req?.supplier_id||"";
    addToGroup(sId,sName,
      replyItems.map(ri=>({
        id:"rep-"+rep.id+"-"+ri.description,
        description:ri.description||"",
        sku:ri.sku||"",
        supplier_part_no:ri.supplier_part_no||"",
        qty:+ri.qty||1,
        unit_price:+ri.price||0,
        condition:ri.condition==="can_order"?"to_order":"in_stock",
      }))
    );
  });

  const groups=Object.values(groupMap);

  // Deduplicate items within each group by description (keep highest price)
  groups.forEach(g=>{
    const seen={};
    g.items=g.items.filter(it=>{
      const k=it.description.toLowerCase().trim();
      if(seen[k]) return false;
      seen[k]=true; return true;
    });
  });

  const [selected,setSelected]=useState(()=>{
    const init={};
    groups.forEach(g=>g.items.forEach(it=>{ init[it.id]=true; }));
    return init;
  });
  const [saving,setSaving]=useState(false);
  const [createdPos,setCreatedPos]=useState(null); // null | [{poId,group,supplier}]

  const toggle=(id)=>setSelected(p=>({...p,[id]:!p[id]}));
  const toggleGroup=(g)=>{
    const allOn=g.items.every(it=>selected[it.id]);
    setSelected(p=>{const n={...p}; g.items.forEach(it=>{n[it.id]=!allOn;}); return n;});
  };

  const totalSelected=groups.reduce((s,g)=>s+g.items.filter(it=>selected[it.id]).reduce((ss,it)=>ss+(+it.qty||0)*(+it.unit_price||0),0),0);
  const countSelected=groups.reduce((s,g)=>s+g.items.filter(it=>selected[it.id]).length,0);

  const shopName=settings?.shop_name||"Workshop";
  const vatRate=+(settings?.tax_rate||0)/100;
  const SEP="─".repeat(26);

  const buildMsg=(grp,poId,supplier)=>{
    const isExVat=supplier&&!supplier.vat_inclusive;
    const exVatPrice=(p)=>isExVat&&vatRate>0?+p/(1+vatRate):+p;
    const exVatTotal=Math.round(grp.items.reduce((s,i)=>s+(+i.qty||0)*exVatPrice(+i.unit_price||0),0)*100)/100;
    const rawTotal=grp.items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
    const vatAmt=Math.round((rawTotal-exVatTotal)*100)/100;
    const totalDisplay=isExVat&&vatRate>0?(exVatTotal+vatAmt):rawTotal;
    return [
      `📋 *Purchase Order* — ${shopName}`,SEP,
      poId?`PO#: ${poId}`:"",
      `Supplier: *${grp.supplierName}*`,
      grp.quoteRef?`Your Quote Ref: *${grp.quoteRef}*`:"",
      `Job: ${job.id}`,"",
      `*Items:*${isExVat?" (prices ex-VAT)":""}`,
      ...grp.items.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${exVatPrice(+i.unit_price||0).toFixed(2)}`),
      "",SEP,
      isExVat&&vatRate>0?`Subtotal (ex-VAT): ${C}${exVatTotal.toFixed(2)}`:"",
      isExVat&&vatRate>0?`VAT (${settings?.tax_rate}%): ${C}${vatAmt.toFixed(2)}`:"",
      `*Total: ${C}${totalDisplay.toFixed(2)}*`,
      grp.quoteRef?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
    ].filter(l=>l!==undefined&&l!=="").join("\n");
  };

  const createOrders=async()=>{
    const bySupplier={};
    groups.forEach(g=>{
      const checked=g.items.filter(it=>selected[it.id]);
      if(!checked.length) return;
      const key=g.supplierName;
      if(!bySupplier[key]) bySupplier[key]={supplierId:g.supplierId,supplierName:g.supplierName,quoteRef:g.quoteRef||"",items:[]};
      bySupplier[key].items.push(...checked);
    });
    const entries=Object.values(bySupplier);
    if(!entries.length) return;
    setSaving(true);
    try{
      const results=[];
      for(const grp of entries){
        const po=await onSave({supplier_id:grp.supplierId||null,supplier_name:grp.supplierName,job_id:job.id,status:"draft",supplier_quote_ref:grp.quoteRef||null},
          grp.items.map(it=>({description:it.description,sku:it.sku||"",supplier_part_no:it.supplier_part_no||"",qty:it.qty,unit_price:it.unit_price,condition:it.condition})));
        const supplier=wsSuppliers.find(s=>String(s.id)===String(grp.supplierId));
        results.push({poId:po?.id||"",group:grp,supplier});
      }
      setCreatedPos(results);
    }catch(e){alert("Failed to create order: "+e.message);}
    setSaving(false);
  };

  // ── Success screen: show WA send buttons ──
  if(createdPos){
    return (
      <Overlay onClose={onClose}>
        <MHead title="✅ Order Placed — Send to Supplier" onClose={onClose}/>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
          {createdPos.map(({poId,group:grp,supplier})=>{
            const phone=(supplier?.phone||"").replace(/\D/g,"");
            const groupLink=supplier?.group_link||"";
            const msg=buildMsg(grp,poId,supplier);
            const total=grp.items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
            return (
              <div key={poId} className="card" style={{padding:"12px 14px"}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{grp.supplierName}</div>
                {grp.quoteRef&&<div style={{fontSize:11,color:"var(--blue)",marginBottom:2}}>Ref: {grp.quoteRef}</div>}
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
                  {grp.items.length} item{grp.items.length!==1?"s":""} · {C}{total.toFixed(2)} (incl. VAT)
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {phone&&(
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                      className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textDecoration:"none",flex:1,textAlign:"center"}}>
                      📤 Send via WhatsApp
                    </a>
                  )}
                  {!phone&&groupLink&&(
                    <button className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",flex:1}}
                      onClick={async()=>{ await navigator.clipboard.writeText(msg); window.open(groupLink,"_blank"); }}>
                      👥 Copy & Open Group
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{flex:"0 0 auto"}}
                    onClick={()=>navigator.clipboard.writeText(msg).then(()=>alert("Copied!"))}>
                    📋 Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{ onViewPOs?.(); onClose(); }}>View All POs</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={onClose}>✅ Done</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <MHead title="📦 Create Purchase Order" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Job: <strong style={{color:"var(--text1)",fontFamily:"monospace"}}>{job.id}</strong>
        {" · "}{job.vehicle_reg||"—"}
        {(job.vehicle_make||job.vehicle_model)&&" · "+(job.vehicle_make||"")+" "+(job.vehicle_model||"")}
      </div>

      {groups.length===0
        ?<div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>
            <div style={{fontSize:28,marginBottom:8}}>📭</div>
            <div style={{fontWeight:600}}>No supplier quotes for this job yet</div>
            <div style={{fontSize:12,marginTop:4}}>Send Quote to a supplier first, then come back here to place the order.</div>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          {groups.map(g=>{
            const groupChecked=g.items.filter(it=>selected[it.id]).length;
            const groupTotal=g.items.filter(it=>selected[it.id]).reduce((s,it)=>s+(+it.qty||0)*(+it.unit_price||0),0);
            return (
              <div key={g.supplierName} className="card" style={{padding:"10px 12px",border:"1px solid var(--border)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer"}}
                  onClick={()=>toggleGroup(g)}>
                  <div style={{fontWeight:700,fontSize:13}}>{g.supplierName}
                    {g.quoteRef&&<span style={{fontSize:10,color:"var(--blue)",fontFamily:"monospace",marginLeft:8,fontWeight:600}}>Ref: {g.quoteRef}</span>}
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    {groupTotal>0&&<span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",fontSize:13}}>{C}{groupTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                    <span style={{fontSize:11,color:"var(--text3)"}}>{groupChecked}/{g.items.length} selected</span>
                  </div>
                </div>
                {g.items.map(it=>(
                  <label key={it.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"6px 0",borderTop:"1px solid var(--border)",cursor:"pointer"}}>
                    <input type="checkbox" checked={!!selected[it.id]} onChange={()=>toggle(it.id)} style={{marginTop:2,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>{it.description}
                        {it.sku&&<span style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace",marginLeft:6}}>{it.sku}</span>}
                      </div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>
                        Qty: {it.qty}
                        {+it.unit_price>0&&<span style={{marginLeft:8,color:"var(--text2)"}}>@ {C}{(+it.unit_price).toFixed(2)}</span>}
                        {it.condition==="to_order"&&<span style={{marginLeft:8,color:"#fbbf24"}}>📦 To Order</span>}
                      </div>
                    </div>
                    {+it.unit_price>0&&<div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:13,color:"var(--accent)",flexShrink:0}}>{C}{((+it.qty||0)*(+it.unit_price||0)).toFixed(2)}</div>}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      }

      {groups.length>0&&(
        <div style={{padding:"8px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"var(--text2)"}}>{countSelected} item{countSelected!==1?"s":""} selected</span>
          <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:15,color:"var(--accent)"}}>{C}{totalSelected.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        {countSelected>0&&(
          <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={createOrders}>
            {saving?"Creating…":`📦 Place Order${Object.keys(Object.fromEntries(groups.filter(g=>g.items.some(it=>selected[it.id])).map(g=>[g.supplierName,1]))).length>1?" ("+Object.keys(Object.fromEntries(groups.filter(g=>g.items.some(it=>selected[it.id])).map(g=>[g.supplierName,1]))).length+" POs)":""}` }
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════
function WsPurchaseOrdersPage({purchaseOrders=[],poItems=[],wsSuppliers=[],wsStock=[],settings,wsSupplierQuotes=[],wsSqReplies=[],wsSupplierRequests=[],initialViewPoId=null,onClearInitialView,onSave,onDelete,onReceive}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const fmt=v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"view"|"receive", po?}
  const [search,setSearch]=useState("");
  const [filterSt,setFilterSt]=useState("__all__");

  // Auto-open view modal when navigated from job card
  useEffect(()=>{
    if(initialViewPoId){
      const po=purchaseOrders.find(p=>p.id===initialViewPoId);
      if(po){ setModal({mode:"view",po}); onClearInitialView?.(); }
    }
  },[initialViewPoId,purchaseOrders]);

  const STATUS_COLOR={draft:"var(--text3)",sent:"var(--blue)",partial:"var(--yellow)",received:"var(--green)",cancelled:"var(--red)"};
  const STATUS_BG={draft:"var(--surface3)",sent:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",received:"rgba(52,211,153,.12)",cancelled:"rgba(248,113,113,.12)"};

  const filtered=purchaseOrders.filter(po=>{
    if(filterSt!=="__all__"&&po.status!==filterSt) return false;
    if(search.trim()){const h=`${po.supplier_name||""} ${po.id}`.toLowerCase();if(!search.toLowerCase().split(/\s+/).every(w=>h.includes(w)))return false;}
    return true;
  });

  const summary={
    draft:purchaseOrders.filter(p=>p.status==="draft").length,
    sent:purchaseOrders.filter(p=>p.status==="sent").length,
    partial:purchaseOrders.filter(p=>p.status==="partial").length,
    received:purchaseOrders.filter(p=>p.status==="received").length,
  };

  return (
    <div>
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[["Draft",summary.draft,"var(--text3)"],["Sent",summary.sent,"var(--blue)"],["Partial",summary.partial,"var(--yellow)"],["Received",summary.received,"var(--green)"]].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:"10px 12px",cursor:"pointer",border:filterSt===l.toLowerCase()?"1px solid "+c:"1px solid transparent"}}
            onClick={()=>setFilterSt(p=>p===l.toLowerCase()?"__all__":l.toLowerCase())}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"Rajdhani,sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      {/* Controls */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input className="inp" style={{flex:1,minWidth:140}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, PO #…"/>
        <select className="inp" style={{width:130}} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
          <option value="__all__">All Status</option>
          {["draft","sent","partial","received","cancelled"].map(s=><option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ New PO</button>
      </div>
      {/* List */}
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <div style={{fontWeight:600}}>No purchase orders yet</div>
            <div style={{fontSize:13,marginTop:4}}>Create POs to track orders to your suppliers</div>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(po=>{
            const items=poItems.filter(i=>i.po_id===po.id);
            const received=items.every(i=>(+i.received_qty||0)>=(+i.qty||0));
            const partial=items.some(i=>(+i.received_qty||0)>0)&&!received;
            return (
              <div key={po.id} className="card" style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setModal({mode:"view",po})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{po.supplier_name||"Unknown Supplier"}</div>
                    <code style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{po.id}</code>
                    {po.job_id&&<span style={{fontSize:10,color:"var(--text3)",marginLeft:8}}>Job: {po.job_id}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:STATUS_BG[po.status]||"var(--surface3)",color:STATUS_COLOR[po.status]||"var(--text3)",fontWeight:600,textTransform:"capitalize"}}>{po.status||"draft"}</span>
                    <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:14,color:"var(--accent)"}}>{fmt(po.total_amount)}</span>
                  </div>
                </div>
                <div style={{fontSize:12,color:"var(--text2)",marginBottom:6}}>{items.map(i=>i.description).join(" · ")||"No items"}</div>
                {items.length>0&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {items.map(i=>{
                      const pct=Math.min(100,((+i.received_qty||0)/(+i.qty||1))*100);
                      return (
                        <div key={i.id} style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:pct>=100?"rgba(52,211,153,.12)":pct>0?"rgba(251,191,36,.12)":"var(--surface3)",color:pct>=100?"var(--green)":pct>0?"var(--yellow)":"var(--text3)"}}>
                          {i.description}: {+i.received_qty||0}/{+i.qty||0}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{display:"flex",gap:6,marginTop:8}} onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setModal({mode:"edit",po})}>✏️ Edit</button>
                  {po.status!=="received"&&po.status!=="cancelled"&&(
                    <button className="btn btn-sm" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",border:"1px solid rgba(52,211,153,.3)"}}
                      onClick={()=>setModal({mode:"receive",po})}>📥 Receive Goods</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",marginLeft:"auto"}}
                    onClick={()=>{if(window.confirm("Delete this PO?"))onDelete(po.id);}}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      }
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsPurchaseOrderModal po={modal.po||null} wsSuppliers={wsSuppliers} settings={settings}
          wsSupplierQuotes={wsSupplierQuotes} wsSqReplies={wsSqReplies} wsSupplierRequests={wsSupplierRequests}
          onSave={async(po,items)=>{await onSave(po,items);setModal(null);}}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="receive"&&modal.po&&(
        <WsReceiveGoodsModal po={modal.po} poItems={poItems.filter(i=>i.po_id===modal.po.id)}
          wsStock={wsStock} settings={settings}
          onReceive={async(receivedItems)=>{await onReceive(modal.po.id,receivedItems);setModal(null);}}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="view"&&modal.po&&(()=>{
        const viewPo=modal.po;
        const viewItems=poItems.filter(i=>i.po_id===viewPo.id);
        const viewSupplier=wsSuppliers.find(s=>String(s.id)===String(viewPo.supplier_id));
        const viewPhone=(viewSupplier?.phone||"").replace(/\D/g,"");
        const viewTotal=viewItems.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
        const shopName=settings?.shop_name||"Workshop";
        const SEP2="─".repeat(26);
        const isViewExVat=viewSupplier&&!viewSupplier.vat_inclusive;
        const viewVatRate=+(settings?.tax_rate||0)/100;
        const viewExVatPrice=(p)=>isViewExVat&&viewVatRate>0?+p/(1+viewVatRate):+p;
        const viewExVatTotal=Math.round(viewItems.reduce((s,i)=>s+(+i.qty||0)*viewExVatPrice(+i.unit_price||0),0)*100)/100;
        const viewVatAmt=Math.round((viewTotal-viewExVatTotal)*100)/100;
        const viewTotalDisplay=isViewExVat&&viewVatRate>0?(viewExVatTotal+viewVatAmt):viewTotal;
        const buildViewWaMsg=()=>{
          const lines=[
            `📋 *Purchase Order* — ${shopName}`,SEP2,
            `PO#: ${viewPo.id}`,
            `Supplier: *${viewPo.supplier_name||""}*`,
            viewPo.supplier_quote_ref?`Your Quote Ref: *${viewPo.supplier_quote_ref}*`:"",
            viewPo.job_id?`Job: ${viewPo.job_id}`:"",
            "",
            `*Items:*${isViewExVat?" (prices ex-VAT)":""}`,
            ...viewItems.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${viewExVatPrice(+i.unit_price||0).toFixed(2)}`),
            "",SEP2,
            isViewExVat&&viewVatRate>0?`Subtotal (ex-VAT): ${C}${viewExVatTotal.toFixed(2)}`:"",
            isViewExVat&&viewVatRate>0?`VAT (${settings.tax_rate}%): ${C}${viewVatAmt.toFixed(2)}`:"",
            `*Total: ${C}${viewTotalDisplay.toFixed(2)}*`,
            viewPo.notes?`\nNote: ${viewPo.notes}`:"",
            viewPo.supplier_quote_ref?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
          ].filter(l=>l!==undefined&&l!=="");
          return lines.join("\n");
        };
        return (
          <Overlay onClose={()=>setModal(null)}>
            <MHead title={`PO — ${viewPo.supplier_name||"Unknown"}`} onClose={()=>setModal(null)}/>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>Status: <span style={{color:STATUS_COLOR[viewPo.status]||"var(--text3)",fontWeight:700,textTransform:"capitalize"}}>{viewPo.status||"draft"}</span></div>
              {viewPo.supplier_quote_ref&&<div style={{fontSize:12,color:"var(--blue)",marginBottom:4}}>Quote Ref: <strong>{viewPo.supplier_quote_ref}</strong></div>}
              {viewPo.notes&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Notes: {viewPo.notes}</div>}
              {viewPo.job_id&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Job: {viewPo.job_id}</div>}
            </div>
            <div style={{overflowX:"auto",marginBottom:12}}>
              <table className="tbl" style={{width:"100%"}}>
                <thead><tr><th>Description</th><th>SKU</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit Price{isViewExVat?" (ex-VAT)":""}</th><th>Condition</th><th style={{textAlign:"right"}}>Received</th></tr></thead>
                <tbody>
                  {viewItems.map(i=>(
                    <tr key={i.id}>
                      <td>{i.description}</td>
                      <td><code style={{fontSize:11,fontFamily:"monospace",color:"var(--text3)"}}>{i.sku||"—"}</code></td>
                      <td style={{textAlign:"right"}}>{i.qty}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{fmt(viewExVatPrice(+i.unit_price||0))}</td>
                      <td><span style={{fontSize:11,color:i.condition==="to_order"?"#fbbf24":"var(--green)"}}>{i.condition==="to_order"?"📦 To Order":"✅ In Stock"}</span></td>
                      <td style={{textAlign:"right"}}>{+i.received_qty||0} / {i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isViewExVat&&viewVatRate>0&&(
                <div style={{textAlign:"right",padding:"6px 8px",fontSize:12,color:"var(--text3)"}}>
                  Subtotal ex-VAT: <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--text1)"}}>{fmt(viewExVatTotal)}</strong>
                  &nbsp;·&nbsp;VAT ({settings?.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(viewVatAmt)}</strong>
                  &nbsp;·&nbsp;Total: <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(viewTotalDisplay)}</strong>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn btn-ghost" onClick={()=>setModal({mode:"edit",po:viewPo})}>✏️ Edit</button>
              {viewPhone&&viewItems.length>0&&(
                <a href={waLink(viewPhone,buildViewWaMsg())} target="_blank" rel="noreferrer"
                  className="btn btn-sm" onClick={async()=>{ if(viewPo.status==="draft") await onSave({...viewPo,status:"sent"},viewItems); }}
                  style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                  📤 Send via WhatsApp
                </a>
              )}
              {!viewPhone&&viewSupplier?.group_link&&viewItems.length>0&&(
                <button className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)"}}
                  onClick={async()=>{
                    await navigator.clipboard.writeText(buildViewWaMsg());
                    window.open(viewSupplier.group_link,"_blank");
                    if(viewPo.status==="draft") await onSave({...viewPo,status:"sent"},viewItems);
                  }}>
                  👥 Copy & Open Group
                </button>
              )}
              {viewPo.status!=="received"&&viewPo.status!=="cancelled"&&(
                <button className="btn btn-primary" style={{background:"rgba(52,211,153,.8)"}}
                  onClick={()=>setModal({mode:"receive",po:viewPo})}>📥 Receive Goods</button>
              )}
            </div>
          </Overlay>
        );
      })()}
    </div>
  );
}

function WsPurchaseOrderModal({po,wsSuppliers=[],settings,wsSupplierQuotes=[],wsSqReplies=[],wsSupplierRequests=[],onSave,onClose,prefill=null}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const shopName=settings?.shop_name||"Workshop";
  const [suppId,setSuppId]=useState(po?.supplier_id||"");
  const [suppName,setSuppName]=useState(po?.supplier_name||"");
  const [status,setStatus]=useState(po?.status||"draft");
  const [notes,setNotes]=useState(po?.notes||"");
  const [jobId,setJobId]=useState(po?.job_id||"");
  const [sqRef,setSqRef]=useState(po?.supplier_quote_ref||"");
  const [items,setItems]=useState(()=>{
    if(prefill) return prefill;
    if(po){const stored=JSON.parse(po._items||"[]");return stored.length?stored:[{id:"i1",description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}];}
    return [{id:"i1",description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}];
  });
  const [saving,setSaving]=useState(false);
  const [importOpen,setImportOpen]=useState(false);

  const addItem=()=>setItems(p=>[...p,{id:"i"+Date.now(),description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}]);
  const removeItem=idx=>setItems(p=>p.filter((_,i)=>i!==idx));
  const setItem=(idx,k,v)=>setItems(p=>p.map((it,i)=>i===idx?{...it,[k]:v}:it));

  const chosenSupplier=wsSuppliers.find(s=>String(s.id)===String(suppId));
  const resolvedName=chosenSupplier?.name||suppName;
  const total=items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);

  // Build importable quote sources from manual quotes + digital replies
  const quoteSources=[];
  wsSupplierQuotes.forEach(sq=>{
    const lines=(() => { try{return JSON.parse(sq.line_items||"[]");}catch{return [];} })();
    const valid=lines.filter(l=>l.name&&(+l.price>0||+(l.vat_incl_price)||0>0));
    if(!valid.length) return;
    // Build name→sku map from the original request's items_json (has our internal SKUs)
    const linkedReq=wsSupplierRequests.find(r=>r.id===sq.request_id);
    const reqItems=(() => { try{return JSON.parse(linkedReq?.items_json||"[]");}catch{return [];} })();
    const skuByName={};
    reqItems.forEach(it=>{ const k=(it.label||it.description||"").toLowerCase().trim(); if(k) skuByName[k]=it.sku||""; });
    quoteSources.push({
      id:"sq-"+sq.id,
      label:`${sq.supplier_name||"?"} — ${valid.slice(0,2).map(l=>l.name).join(", ")}${valid.length>2?" +more":""}`,
      supplierId:sq.supplier_id||"",supplierName:sq.supplier_name||"",jobId:sq.job_id||"",quoteRef:sq.quote_ref||"",
      items:valid.map((l,i)=>({id:"qi"+Date.now()+i,description:l.name||"",sku:skuByName[(l.name||"").toLowerCase().trim()]||l.sku||"",supplier_part_no:"",qty:+l.qty||1,unit_price:+(l.vat_incl_price||l.price)||0,condition:"in_stock"})),
    });
  });
  wsSqReplies.forEach(rep=>{
    const req=wsSupplierRequests.find(r=>r.id===rep.request_id);
    const replyItems=(() => { try{return JSON.parse(rep.items||"[]");}catch{return [];} })().filter(ri=>ri.condition!=="no_stock"&&ri.description);
    if(!replyItems.length) return;
    const sName=req?.supplier_name||"Supplier";
    const sId=req?.supplier_id||"";
    quoteSources.push({
      id:"rep-"+rep.id,
      label:`${sName} (reply) — ${replyItems.slice(0,2).map(i=>i.description).join(", ")}${replyItems.length>2?" +more":""}`,
      supplierId:sId,supplierName:sName,jobId:req?.job_id||"",
      items:replyItems.map((ri,i)=>({id:"ri"+Date.now()+i,description:ri.description||"",sku:ri.sku||"",supplier_part_no:ri.supplier_part_no||"",qty:+ri.qty||1,unit_price:+ri.price||0,condition:ri.condition==="can_order"?"to_order":"in_stock"})),
    });
  });

  const importQuote=(src)=>{
    setSuppId(src.supplierId);
    setSuppName(src.supplierName);
    if(src.jobId) setJobId(src.jobId);
    if(src.quoteRef) setSqRef(src.quoteRef);
    setItems(src.items.map((it,i)=>({...it,id:"imp"+Date.now()+i})));
    setImportOpen(false);
  };

  const save=async()=>{
    if(!resolvedName.trim()){alert("Supplier name required");return;}
    if(!items.some(i=>i.description.trim())){alert("Add at least one item");return;}
    setSaving(true);
    await onSave({
      id:po?.id||undefined,
      supplier_id:suppId||null,supplier_name:resolvedName,
      status,notes,job_id:jobId||null,supplier_quote_ref:sqRef.trim()||null,
    },items.filter(i=>i.description.trim()));
    setSaving(false);
  };

  const phone=(chosenSupplier?.phone||"").replace(/\D/g,"");
  const SEP="─".repeat(26);
  const buildWaMsg=()=>{
    const filled=items.filter(i=>i.description.trim());
    const isExVat=chosenSupplier&&!chosenSupplier.vat_inclusive;
    const vatRate=+(settings?.tax_rate||0)/100;
    const exVatPrice=(p)=>isExVat&&vatRate>0?+p/(1+vatRate):+p;
    const exVatTotal=Math.round(filled.reduce((s,i)=>s+(+i.qty||0)*exVatPrice(+i.unit_price||0),0)*100)/100;
    const vatAmt=Math.round((total-exVatTotal)*100)/100;
    const totalDisplay=isExVat&&vatRate>0?(exVatTotal+vatAmt):total;
    const lines=[
      `📋 *Purchase Order* — ${shopName}`,SEP,
      `Supplier: *${resolvedName}*`,
      sqRef?`Your Quote Ref: *${sqRef}*`:"",
      jobId?`Job: ${jobId}`:"",
      "",
      `*Items:*${isExVat?" (prices ex-VAT)":""}`,
      ...filled.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${exVatPrice(+i.unit_price||0).toFixed(2)}`),
      "",SEP,
      isExVat&&vatRate>0?`Subtotal (ex-VAT): ${C}${exVatTotal.toFixed(2)}`:"",
      isExVat&&vatRate>0?`VAT (${settings.tax_rate}%): ${C}${vatAmt.toFixed(2)}`:"",
      `*Total: ${C}${totalDisplay.toFixed(2)}*`,
      notes?`\nNote: ${notes}`:"",
      sqRef?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
    ].filter(l=>l!==undefined&&l!=="");
    return lines.join("\n");
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={po?"Edit Purchase Order":"New Purchase Order"} onClose={onClose}/>

      {/* Import from quote */}
      {quoteSources.length>0&&(
        <div style={{marginBottom:12}}>
          {!importOpen
            ?<button className="btn btn-ghost btn-sm" style={{width:"100%",border:"1px dashed var(--border)",color:"var(--blue)"}}
                onClick={()=>setImportOpen(true)}>📥 Import items from a supplier quote</button>
            :<div style={{background:"var(--surface2)",borderRadius:8,padding:10,border:"1px solid var(--border)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6}}>SELECT QUOTE TO IMPORT</div>
              {quoteSources.map(src=>(
                <div key={src.id} style={{padding:"6px 8px",borderRadius:6,cursor:"pointer",marginBottom:4,border:"1px solid var(--border)",background:"var(--surface)",fontSize:12}}
                  onClick={()=>importQuote(src)}>
                  <span style={{color:"var(--text2)"}}>{src.label}</span>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{marginTop:4}} onClick={()=>setImportOpen(false)}>Cancel</button>
            </div>
          }
        </div>
      )}

      {/* Supplier */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Supplier</div>
      {wsSuppliers.length>0
        ?<select className="inp" style={{marginBottom:8}} value={suppId} onChange={e=>{setSuppId(e.target.value);setSuppName("");}}>
            <option value="">— Select supplier —</option>
            {wsSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        :<input className="inp" style={{marginBottom:8}} placeholder="Supplier name" value={suppName} onChange={e=>setSuppName(e.target.value)}/>
      }
      {suppId&&!wsSuppliers.find(s=>String(s.id)===String(suppId))&&(
        <input className="inp" style={{marginBottom:8}} placeholder="Supplier name" value={suppName} onChange={e=>setSuppName(e.target.value)}/>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div><FL label="Status"/><select className="inp" value={status} onChange={e=>setStatus(e.target.value)}>
          {["draft","sent","partial","received","cancelled"].map(s=><option key={s}>{s}</option>)}
        </select></div>
        <div><FL label="Job # (optional)"/><input className="inp" value={jobId} onChange={e=>setJobId(e.target.value)} placeholder="e.g. WJ-123"/></div>
        <div style={{gridColumn:"1/-1"}}><FL label="Supplier Quote Ref # (Doc Nr)"/><input className="inp" value={sqRef} onChange={e=>setSqRef(e.target.value)} placeholder="e.g. Q100814"/></div>
      </div>
      <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}><FL label="Notes (optional)"/></div>
      <input className="inp" style={{marginBottom:14}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Delivery instructions, reference…"/>

      {/* Line items */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Items</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
        {items.map((it,idx)=>(
          <div key={it.id||idx} style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:6}}>
              <input className="inp" value={it.description} onChange={e=>setItem(idx,"description",e.target.value)} placeholder="Description *"/>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>removeItem(idx)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
              <input className="inp" value={it.sku} onChange={e=>setItem(idx,"sku",e.target.value)} placeholder="SKU"/>
              <input className="inp" value={it.supplier_part_no} onChange={e=>setItem(idx,"supplier_part_no",e.target.value)} placeholder="Supplier Part #"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:6}}>
              <div><FL label="Qty"/><input className="inp" type="number" min="0" value={it.qty} onChange={e=>setItem(idx,"qty",e.target.value)}/></div>
              <div><FL label={`Unit Price (${C})`}/><input className="inp" type="number" min="0" step="0.01" value={it.unit_price} onChange={e=>setItem(idx,"unit_price",e.target.value)}/></div>
              <div><FL label="Condition"/><select className="inp" value={it.condition} onChange={e=>setItem(idx,"condition",e.target.value)}>
                <option value="in_stock">✅ In Stock</option>
                <option value="to_order">📦 To Order</option>
              </select></div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" style={{marginBottom:14,width:"100%"}} onClick={addItem}>+ Add Item</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,padding:"8px 12px",background:"var(--surface2)",borderRadius:8}}>
        <span style={{fontSize:13,color:"var(--text2)"}}>Total</span>
        <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{C}{total.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        {items.some(i=>i.description.trim())&&phone&&(
          <a href={waLink(phone,buildWaMsg())} target="_blank" rel="noreferrer"
            className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textAlign:"center",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            📤 Send WA
          </a>
        )}
        {items.some(i=>i.description.trim())&&!phone&&chosenSupplier?.group_link&&(
          <button className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)"}}
            onClick={()=>navigator.clipboard.writeText(buildWaMsg()).then(()=>window.open(chosenSupplier.group_link,"_blank"))}>
            👥 Copy & Open Group
          </button>
        )}
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={save}>{saving?"Saving…":"💾 Save PO"}</button>
      </div>
    </Overlay>
  );
}

function WsReceiveGoodsModal({po,poItems=[],wsStock=[],settings,onReceive,onClose}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const fmt=v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [rows,setRows]=useState(()=>poItems.map(i=>({
    po_item_id:i.id,description:i.description,sku:i.sku||"",
    qty:+i.qty||0,received_qty:+i.received_qty||0,
    receive_qty:Math.max(0,(+i.qty||0)-(+i.received_qty||0)),
    unit_price:+i.unit_price||0,stock_id:"",
  })));
  const [saving,setSaving]=useState(false);

  const setRow=(idx,k,v)=>setRows(p=>p.map((r,i)=>i===idx?{...r,[k]:v}:r));
  const total=rows.reduce((s,r)=>s+(+r.receive_qty||0)*(+r.unit_price||0),0);
  const outstanding=rows.filter(r=>r.received_qty<r.qty);
  const fullyReceived=rows.filter(r=>r.received_qty>=r.qty);

  return (
    <Overlay onClose={onClose}>
      <MHead title="📥 Receive Goods" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
        Supplier: <strong style={{color:"var(--text1)"}}>{po.supplier_name}</strong>
        &nbsp;·&nbsp;PO: <code style={{fontFamily:"monospace",fontSize:11}}>{po.id}</code>
      </div>
      {outstanding.length>0&&(
        <>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Pending Items</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {outstanding.map((r,idx)=>{
              const globalIdx=rows.indexOf(r);
              const stockMatch=wsStock.filter(w=>w.sku&&r.sku&&w.sku===r.sku);
              return (
                <div key={r.po_item_id} style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{r.description}{r.sku&&<span style={{color:"var(--text3)",fontFamily:"monospace",fontSize:10,marginLeft:6}}>{r.sku}</span>}</div>
                  <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:6,marginBottom:6}}>
                    <div><FL label="Receive Qty"/><input className="inp" type="number" min="0" max={r.qty-r.received_qty} value={r.receive_qty} onChange={e=>setRow(globalIdx,"receive_qty",e.target.value)}/></div>
                    <div><FL label="Unit Price"/><input className="inp" type="number" min="0" step="0.01" value={r.unit_price} onChange={e=>setRow(globalIdx,"unit_price",e.target.value)}/></div>
                    <div><FL label="WS Stock Item"/>
                      <select className="inp" value={r.stock_id} onChange={e=>setRow(globalIdx,"stock_id",e.target.value)}>
                        <option value="">— Link stock (optional) —</option>
                        {wsStock.map(w=><option key={w.id} value={w.id}>{w.name}{w.sku?` (${w.sku})`:""}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>Ordered: {r.qty} · Already received: {r.received_qty}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {fullyReceived.length>0&&(
        <div style={{fontSize:12,color:"var(--green)",marginBottom:10,padding:"6px 10px",background:"rgba(52,211,153,.08)",borderRadius:6}}>
          ✅ Already fully received: {fullyReceived.map(r=>r.description).join(", ")}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:14}}>
        <span style={{fontSize:13,color:"var(--text2)"}}>Invoice Total</span>
        <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{fmt(total)}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2,background:"rgba(52,211,153,.8)"}} disabled={saving}
          onClick={async()=>{setSaving(true);await onReceive(rows);setSaving(false);}}>
          {saving?"Processing…":"📥 Confirm Receipt & Create Invoice"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS SUPPLIERS PAGE
// ═══════════════════════════════════════════════════════════════
function WsSuppliersPage({wsSuppliers=[],onSave,onDelete}) {
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

function WsSupplierModal({item,onSave,onClose}) {
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

// ═══════════════════════════════════════════════════════════════
// WS TRANSFER PAGE — Transfer from spare shop → workshop stock
// ═══════════════════════════════════════════════════════════════
function WsTransferPage({parts=[],wsStock=[],settings,onSave}) {
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

// ═══════════════════════════════════════════════════════════════
// PRINT LABEL FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function printStockLabel(p, settings, labelType="shop") {
  const sym = curSym(settings?.currency||"R");
  const shopName = settings?.shop_name||"AutoParts";
  const isWs = labelType==="ws";
  const lw = (settings?.label_w||50)+"mm";
  const lh = (settings?.label_h||50)+"mm";
  const w = window.open("","_blank","width=380,height=300");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Label</title>
  <style>
    @page{size:${lw} ${lh};margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:${lw};height:${lh};padding:2mm 3mm;display:flex;flex-direction:column;justify-content:space-between;border:0.5pt solid #ccc}
    .hdr{font-size:6pt;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:${isWs?"#e65100":"#1565c0"};border-bottom:0.5pt solid ${isWs?"#e65100":"#1565c0"};padding-bottom:0.5mm;margin-bottom:1mm}
    .name{font-size:8.5pt;font-weight:bold;line-height:1.2;overflow:hidden;max-height:12mm}
    .sku{font-family:"Courier New",monospace;font-size:7pt;color:#444;margin-top:0.5mm;letter-spacing:.04em}
    .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto}
    .price{font-size:12pt;font-weight:bold}
    .info{text-align:right;font-size:6.5pt;color:#555}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">${isWs?"🔧 WORKSHOP":"📦 SPARE SHOP"} · ${shopName}</div>
    <div class="name">${(p.name||"").replace(/</g,"&lt;")}</div>
    <div class="sku">SKU: ${p.sku||"—"}${p.oe_number?" | OE: "+p.oe_number:""}</div>
    <div class="footer">
      <div>
        <div class="price">${sym} ${(+(p.price)||0).toFixed(2)}</div>
        ${p.bin_location?`<div style="font-size:6pt;color:#888;margin-top:0.5mm">📍 ${p.bin_location}</div>`:""}
      </div>
      <div class="info">
        Qty: ${isWs?(+p.qty||0):(+p.stock||0)}${p.unit?" "+p.unit:""}
      </div>
    </div>
  </div>
  </body></html>`);
  w.document.close();
}

function printChecklistReport(job, checklist, settings) {
  const shopName = settings?.shop_name||"AutoParts";
  const now = new Date().toLocaleString();
  const statusIcon = s => s==="ok"?"✓":s==="issue"?"✗":s==="na"?"—":"·";
  const statusColor = s => s==="ok"?"#16a34a":s==="issue"?"#dc2626":s==="na"?"#6b7280":"#9ca3af";
  const rows = CHECKLIST_ITEMS.map(item=>{
    const cl=checklist[item.key]||{};
    const st=cl.status||"pending";
    const note=cl.note||"";
    const photo=cl.photo_url||"";
    const thumbUrl=photo?photo.replace(/\/file\/d\/([^/]+)\/.*/,"https://drive.google.com/thumbnail?id=$1&sz=w120").replace(/[?&]id=([^&]+).*/,"https://drive.google.com/thumbnail?id=$1&sz=w120"):"";
    return `<tr>
      <td style="padding:6px 8px;font-size:12px">${item.icon} ${item.label}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;font-size:14px;color:${statusColor(st)}">${statusIcon(st)}</td>
      <td style="padding:6px 8px;font-size:11px;color:#374151">${note||""}</td>
      <td style="padding:6px 8px;text-align:center">${thumbUrl?`<img src="${thumbUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb"/>`:""}</td>
    </tr>`;
  }).join("");
  const okCount   = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length;
  const issCount  = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length;
  const naCount   = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="na").length;
  const w=window.open("","_blank","width=800,height=900");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Check-in Report</title>
  <style>
    @page{size:A4;margin:15mm}
    @media print{body{margin:0}.no-print{display:none}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:20px}
    h1{font-size:18px;margin:0 0 4px}
    .sub{font-size:12px;color:#6b7280;margin-bottom:16px}
    .veh{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px}
    .vf{font-size:10px;color:#6b7280;margin-bottom:2px}
    .vv{font-size:13px;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f3f4f6;padding:7px 8px;text-align:left;font-size:11px;color:#374151;border-bottom:2px solid #d1d5db}
    tr:nth-child(even){background:#f9fafb}
    td{border-bottom:1px solid #e5e7eb;vertical-align:middle}
    .summary{display:flex;gap:16px;margin-top:16px;font-size:12px}
    .badge{padding:4px 12px;border-radius:20px;font-weight:700}
    .sig{margin-top:32px;display:flex;gap:40px}
    .sig-box{flex:1;border-top:1px solid #111;padding-top:6px;font-size:11px;color:#6b7280}
    .print-btn{display:inline-block;margin-bottom:16px;padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
  </style></head>
  <body>
    <button class="print-btn no-print" onclick="var imgs=document.querySelectorAll('img');var n=imgs.length,done=0;function go(){window.print();}if(!n){go();return;}function chk(){if(++done>=n)go();}imgs.forEach(function(i){if(i.complete&&i.naturalHeight!==0)chk();else{i.onload=chk;i.onerror=chk;}});">🖨️ Print / Save PDF</button>
    <h1>🔧 ${shopName}</h1>
    <div class="sub">Vehicle Check-in Inspection Report · Printed: ${now}</div>
    <div class="veh">
      <div><div class="vf">Plate / Reg</div><div class="vv">${job.vehicle_reg||"—"}</div></div>
      <div><div class="vf">Make / Model</div><div class="vv">${(job.vehicle_make||"")} ${(job.vehicle_model||"")||"—"}</div></div>
      <div><div class="vf">Year</div><div class="vv">${job.vehicle_year||"—"}</div></div>
      <div><div class="vf">Color</div><div class="vv">${job.vehicle_color||"—"}</div></div>
      <div><div class="vf">Mileage</div><div class="vv">${job.mileage?Number(job.mileage).toLocaleString()+" km":"—"}</div></div>
      <div><div class="vf">Job ID</div><div class="vv" style="font-family:monospace;font-size:11px">${job.id||"—"}</div></div>
      <div><div class="vf">Customer</div><div class="vv">${job.customer_name||"—"}</div></div>
      <div><div class="vf">Date In</div><div class="vv">${job.date_in||"—"}</div></div>
      <div><div class="vf">Mechanic</div><div class="vv">${job.mechanic||"—"}</div></div>
      ${job.vin?`<div style="grid-column:1/-1"><div class="vf">VIN</div><div class="vv" style="font-family:monospace;font-size:12px">${job.vin}</div></div>`:""}
    </div>
    <table>
      <thead><tr>
        <th style="width:36%">Item</th>
        <th style="width:10%;text-align:center">Status</th>
        <th style="width:40%">Note</th>
        <th style="width:14%;text-align:center">Photo</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <span class="badge" style="background:#dcfce7;color:#16a34a">✓ OK: ${okCount}</span>
      <span class="badge" style="background:#fee2e2;color:#dc2626">✗ Issues: ${issCount}</span>
      <span class="badge" style="background:#f3f4f6;color:#6b7280">— N/A: ${naCount}</span>
    </div>
    <div class="sig">
      <div class="sig-box">Customer Signature</div>
      <div class="sig-box">Staff Signature</div>
      <div class="sig-box">Date</div>
    </div>
  </body></html>`);
  w.document.close();
}

function printJobCardLabel(job, settings) {
  const shopName = settings?.shop_name||"AutoParts";
  const w = window.open("","_blank","width=480,height=360");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Job Card Label</title>
  <style>
    @page{size:90mm 55mm;margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:90mm;height:55mm;padding:3mm 4mm;display:flex;flex-direction:column;border:2pt solid #000}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1pt solid #000;padding-bottom:1.5mm;margin-bottom:1.5mm}
    .job-id{font-family:"Courier New",monospace;font-size:13pt;font-weight:bold}
    .shop{font-size:5.5pt;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-top:1mm}
    .reg{font-size:15pt;font-weight:bold;font-family:"Courier New",monospace;border:1pt solid #000;padding:0.5mm 2mm;text-align:center;margin-bottom:1.5mm;align-self:flex-start}
    .row{font-size:7pt;margin-bottom:0.8mm;display:flex;gap:2mm}
    .lbl{color:#666;width:14mm;flex-shrink:0}
    .val{font-weight:bold;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .complaint{font-size:6.5pt;color:#333;margin-top:1mm;border-top:0.5pt dashed #bbb;padding-top:1mm;overflow:hidden;max-height:7mm}
    .meta{font-size:5.5pt;color:#888;margin-top:auto;display:flex;justify-content:space-between}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">
      <div>
        <div class="job-id">${job.id||""}</div>
        <div class="shop">🔧 ${shopName}</div>
      </div>
      <div style="text-align:right;font-size:6pt;color:#555">
        ${job.date_in||""}<br/>
        <strong>${job.status||""}</strong>
      </div>
    </div>
    <div class="reg">🚗 ${job.vehicle_reg||"—"}</div>
    <div class="row"><span class="lbl">Customer:</span><span class="val">${(job.customer_name||"—").replace(/</g,"&lt;")}</span></div>
    <div class="row"><span class="lbl">Phone:</span><span class="val">${job.customer_phone||"—"}</span></div>
    ${job.vehicle_make?`<div class="row"><span class="lbl">Vehicle:</span><span class="val">${job.vehicle_make||""} ${job.vehicle_model||""} ${job.vehicle_year||""}</span></div>`:""}
    ${job.complaint?`<div class="complaint">Complaint: ${(job.complaint||"").slice(0,120).replace(/</g,"&lt;")}${(job.complaint||"").length>120?"...":""}</div>`:""}
    ${job.mechanic?`<div class="meta"><span>Mechanic: ${job.mechanic}</span><span>${shopName}</span></div>`:`<div class="meta"><span></span><span>${shopName}</span></div>`}
  </div>
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════
// QUOTE APPROVAL MODAL — send confirmation link via WA/email
// ═══════════════════════════════════════════════════════════════
function QuoteApprovalModal({quote, job, items, settings, onSend, onClose}) {
  const [link, setLink] = useState(quote.confirm_token
    ? `${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}`
    : null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async() => {
    setSending(true);
    try {
      const url = await onSend();
      setLink(url);
    } catch(e) { alert("Failed: "+e.message); }
    finally { setSending(false); }
  };

  const copyLink = () => {
    if(!link) return;
    navigator.clipboard.writeText(link).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const sym = curSym(settings?.currency||getSettings().currency);
  const fmt = v => `${sym} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const sendWA = () => {
    if(!link) return;
    const phone = (quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
    const name = quote.quote_customer||job.customer_name||"Customer";
    const msg = `📝 *Workshop Quotation ${quote.id}*\n\nHi ${name},\n\nYour quotation is ready for review.\n\n`+
      `🚗 Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?" — "+job.vehicle_make+" "+(job.vehicle_model||""):""}\n`+
      `💰 Total: *${fmt(quote.total)}*\n\n`+
      `Please click the link below to view details and approve or decline:\n${link}\n\n`+
      `${settings?.shop_name||"Workshop"}${settings?.phone?"\n📞 "+settings.phone:""}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
  };

  const sendEmail = () => {
    if(!link) return;
    const email = quote.quote_email||job.customer_email||"";
    const name = quote.quote_customer||job.customer_name||"Customer";
    const subj = `Workshop Quotation ${quote.id} — Please Approve`;
    const body = `Dear ${name},\n\nYour workshop quotation is ready for review.\n\n`+
      `Quotation: ${quote.id}\nVehicle: ${job.vehicle_reg||""}${job.vehicle_make?" — "+job.vehicle_make+" "+(job.vehicle_model||""):""}\nTotal: ${fmt(quote.total)}\n\n`+
      `Click the link below to view all items and approve or decline:\n${link}\n\n`+
      `${settings?.shop_name||"Workshop"}${settings?.phone?"\nPhone: "+settings.phone:""}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="🔗 Send Quotation for Approval" onClose={onClose}/>
      <div style={{marginBottom:14,padding:"10px 14px",background:"var(--surface2)",borderRadius:8,fontSize:13}}>
        <div style={{fontWeight:600,marginBottom:4}}>How it works:</div>
        <div style={{color:"var(--text2)",lineHeight:1.7}}>
          1. Click <strong>Generate Link</strong> to create a unique approval page<br/>
          2. Send it via WhatsApp or Email — customer clicks the link<br/>
          3. Customer views the quote and clicks <strong>Approve</strong> or <strong>Decline</strong><br/>
          4. You'll see the response on this job card automatically
        </div>
      </div>

      {!link ? (
        <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:14}} onClick={generateLink} disabled={sending}>
          {sending?"Generating...":"🔗 Generate Approval Link"}
        </button>
      ) : (
        <>
          <div style={{marginBottom:14}}>
            <FL label="Customer Approval Link"/>
            <div style={{display:"flex",gap:6}}>
              <input className="inp" value={link} readOnly style={{flex:1,fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--blue)"}}/>
              <button className="btn btn-ghost btn-sm" style={{flexShrink:0,color:copied?"var(--green)":"var(--text)"}} onClick={copyLink}>
                {copied?"✅ Copied!":"📋 Copy"}
              </button>
            </div>
          </div>

          <div style={{marginBottom:8,fontWeight:600,fontSize:13,color:"var(--text2)"}}>Send via:</div>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            {(quote.quote_phone||job.customer_phone)&&(
              <button className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.12)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)",padding:12,fontWeight:600}}
                onClick={sendWA}>
                💬 WhatsApp
              </button>
            )}
            {(quote.quote_email||job.customer_email)&&(
              <button className="btn btn-sm" style={{flex:1,background:"rgba(96,165,250,.1)",color:"var(--blue)",border:"1px solid rgba(96,165,250,.3)",padding:12,fontWeight:600}}
                onClick={sendEmail}>
                ✉️ Email
              </button>
            )}
            {!(quote.quote_phone||job.customer_phone)&&!(quote.quote_email||job.customer_email)&&(
              <div style={{fontSize:13,color:"var(--text3)",padding:"10px 0"}}>No phone/email on file — copy the link and send manually.</div>
            )}
          </div>

          {(quote.confirm_status==="confirmed"||quote.confirm_status==="declined")&&(
            <div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
              background:quote.confirm_status==="confirmed"?"rgba(52,211,153,.1)":"rgba(248,113,113,.1)",
              border:`1px solid ${quote.confirm_status==="confirmed"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,
              fontWeight:600,color:quote.confirm_status==="confirmed"?"var(--green)":"var(--red)"}}>
              {quote.confirm_status==="confirmed"?"✅ Customer has already approved this quotation":"❌ Customer has declined this quotation"}
            </div>
          )}
        </>
      )}

      <button className="btn btn-ghost" style={{width:"100%",marginTop:8}} onClick={onClose}>Close</button>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// DELIVERY LABEL MODAL — Collection / Driver / Uber
// ═══════════════════════════════════════════════════════════════
function DeliveryLabelModal({job, settings, onClose}) {
  const [method, setMethod] = useState("collection");
  const [address, setAddress] = useState(job.customer_address||"");
  const [timeSlot, setTimeSlot] = useState("");
  const [notes, setNotes] = useState("");
  const shopName = settings?.shop_name||"AutoParts";
  const sym = curSym(settings?.currency||getSettings().currency);

  const METHODS = [
    {id:"collection", icon:"🚶", label:"Self Collection", color:"#1565c0"},
    {id:"driver",     icon:"🚗", label:"Driver Delivery", color:"#e65100"},
    {id:"uber",       icon:"🛵", label:"Uber Delivery",   color:"#000"},
  ];

  const doPrint = () => {
    const m = METHODS.find(x=>x.id===method)||METHODS[0];
    const w = window.open("","_blank","width=480,height=400");
    if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Delivery Label</title>
    <style>
      @page{size:100mm 65mm;margin:0}
      @media print{body{margin:0}}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
      .label{width:100mm;height:65mm;padding:3mm 4mm;display:flex;flex-direction:column;border:2pt solid #000}
      .banner{font-size:9pt;font-weight:bold;color:#fff;background:${m.color};text-align:center;padding:1.5mm;margin-bottom:2mm;border-radius:1mm;letter-spacing:.04em}
      .customer{font-size:13pt;font-weight:bold;margin-bottom:1.5mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .phone{font-size:10pt;font-weight:bold;font-family:"Courier New",monospace;margin-bottom:1.5mm}
      .reg{font-family:"Courier New",monospace;font-size:10pt;border:1pt solid #000;display:inline-block;padding:0.5mm 2mm;margin-bottom:1.5mm}
      .info{font-size:7.5pt;color:#333;margin-bottom:0.8mm}
      .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;font-size:6pt;color:#888}
    </style></head>
    <body onload="window.print();window.close()">
    <div class="label">
      <div class="banner">${m.icon} ${m.label.toUpperCase()}</div>
      <div class="customer">👤 ${(job.customer_name||"—").replace(/</g,"&lt;")}</div>
      <div class="phone">📞 ${job.customer_phone||"—"}</div>
      <div>
        <span class="reg">🚗 ${job.vehicle_reg||"—"}</span>
        <span style="font-size:7.5pt;margin-left:3mm;color:#555">${job.vehicle_make||""} ${job.vehicle_model||""}</span>
      </div>
      ${address?`<div class="info" style="margin-top:1.5mm">📍 ${address.replace(/</g,"&lt;")}</div>`:""}
      ${timeSlot?`<div class="info">🕐 ${timeSlot.replace(/</g,"&lt;")}</div>`:""}
      ${notes?`<div class="info">📝 ${notes.replace(/</g,"&lt;")}</div>`:""}
      <div class="footer">
        <span>Job: ${job.id||""} · ${job.date_in||""}</span>
        <span>🔧 ${shopName}</span>
      </div>
    </div>
    </body></html>`);
    w.document.close();
    onClose();
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="🚗 Collection / Delivery Label" onClose={onClose}/>

      <div style={{marginBottom:14}}>
        <FL label="Method"/>
        <div style={{display:"flex",gap:8}}>
          {METHODS.map(m=>(
            <button key={m.id} onClick={()=>setMethod(m.id)}
              className={"btn btn-sm "+(method===m.id?"btn-primary":"btn-ghost")}
              style={{flex:1,padding:10}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:8,marginBottom:14,fontSize:13}}>
        <div style={{fontWeight:600,marginBottom:4}}>Customer:</div>
        <div>{job.customer_name||"—"} · {job.customer_phone||"—"}</div>
        <div style={{marginTop:4}}>Vehicle: <strong>{job.vehicle_reg}</strong> {job.vehicle_make} {job.vehicle_model}</div>
      </div>

      {method!=="collection"&&(
        <FD><FL label="Delivery Address"/>
          <textarea className="inp" rows={2} value={address} onChange={e=>setAddress(e.target.value)}
            placeholder="Street, suburb, city..."/>
        </FD>
      )}
      <FG>
        <FD><FL label="Time Slot (optional)"/>
          <input className="inp" value={timeSlot} onChange={e=>setTimeSlot(e.target.value)} placeholder="e.g. 14:00 – 16:00"/>
        </FD>
        <FD><FL label="Notes (optional)"/>
          <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Gate code, driver name..."/>
        </FD>
      </FG>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={doPrint}>🖨️ Print Label</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE PRINT
// ═══════════════════════════════════════════════════════════════
function printWorkshopInvoice(job, items, invoice, settings, photos={}) {
  const C = curSym(settings.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+taxAmt;
  const parts    = items.filter(i=>i.type==="part");
  const labour   = items.filter(i=>i.type==="labour");
  const shopName = settings.shop_name||"Auto Workshop";
  const logoSrc = settings.logo_data || settings.logo_url || "";
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="max-height:70px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px"/>` : "";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${p.url}" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";
  const invId    = invoice?.id||"—";
  const invDate  = invoice?.invoice_date||new Date().toISOString().slice(0,10);
  const status   = invoice?.status||"unpaid";

  const rowsHtml = items.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${i.part_sku}</span>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Workshop Invoice ${invId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #111;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .status{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#111;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#f97316;border-top:2px solid #111;margin-top:4px}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  @media print{body{padding:18px}}
</style></head><body>

  <div class="header">
    <div>
      ${logoHtml}
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${(settings.city||settings.country)?`🌍 ${[settings.city,settings.country].filter(Boolean).join(", ")}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">WORKSHOP INVOICE</div>
      <div class="inv-no">${invId}</div>
      <div class="inv-meta">
        Date: ${invDate}<br/>
        ${invoice?.due_date?`Due: ${invoice.due_date}<br/>`:""}
        <span class="status" style="background:${status==="paid"?"#d1e7dd":"#fff3cd"};color:${status==="paid"?"#0a3622":"#856404"}">${status==="paid"?"✅ PAID":"⏳ UNPAID"}</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${invoice?.invoice_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(invoice?.inv_phone||job.customer_phone)?`📞 ${invoice?.inv_phone||job.customer_phone}<br/>`:""}
          ${(invoice?.inv_email||job.customer_email)?`✉️ ${invoice?.inv_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,job.vehicle_model,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km<br/>`:""}
          ${job.vin?`VIN: ${job.vin}`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-label">🔧 Job Info</div>
      <div class="card-info">
        ${job.mechanic?`Mechanic: <strong>${job.mechanic}</strong><br/>`:""}
        ${job.date_in?`Date In: ${job.date_in}<br/>`:""}
        ${job.date_out?`Date Out: ${job.date_out}`:""}
      </div>
    </div>
    <div class="card">
      <div class="card-label">💬 Complaint / Diagnosis</div>
      <div class="card-info">
        ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
        ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:right;width:60px">Qty</th>
      <th style="text-align:right;width:120px">Unit Price</th>
      <th style="text-align:right;width:120px">Total</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${invoice?.notes?`<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>`:""}

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for your business!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP QUOTE — PRINT PDF
// ═══════════════════════════════════════════════════════════════
function printWorkshopQuote(job, items, quote, settings, photos={}) {
  const C = curSym(settings.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+taxAmt;
  const shopName = settings.shop_name||"Auto Workshop";
  const logoSrc = settings.logo_data || settings.logo_url || "";
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="max-height:70px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px"/>` : "";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${p.url}" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";

  const rowsHtml = items.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${i.part_sku}</span>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Quotation ${quote.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #2563eb;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700;color:#2563eb}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .watermark{display:inline-block;padding:3px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#2563eb;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#2563eb;border-top:2px solid #2563eb;margin-top:4px}
  .notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px;color:#1e40af}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  .sig-box{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sig-line{border-top:1px solid #aaa;padding-top:6px;font-size:11px;color:#888;text-align:center}
  @media print{body{padding:18px}}
</style></head><body>

  <div class="header">
    <div>
      ${logoHtml}
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${(settings.city||settings.country)?`🌍 ${[settings.city,settings.country].filter(Boolean).join(", ")}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">QUOTATION / ESTIMATE</div>
      <div class="inv-no">${quote.id}</div>
      <div class="inv-meta">
        Date: ${quote.quote_date}<br/>
        ${quote.valid_until?`Valid Until: ${quote.valid_until}<br/>`:""}
        <span class="watermark">⏳ AWAITING CONFIRMATION</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${quote.quote_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(quote.quote_phone||job.customer_phone)?`📞 ${quote.quote_phone||job.customer_phone}<br/>`:""}
          ${(quote.quote_email||job.customer_email)?`✉️ ${quote.quote_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,job.vehicle_model,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  ${job.complaint||job.diagnosis?`
  <div class="card" style="margin-bottom:20px">
    <div class="card-label">💬 Complaint / Diagnosis</div>
    <div class="card-info">
      ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
      ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
    </div>
  </div>`:""}

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:right;width:60px">Qty</th>
      <th style="text-align:right;width:120px">Unit Price</th>
      <th style="text-align:right;width:120px">Amount</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>QUOTED TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${quote.notes?`<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>`:""}

  <div class="notice">
    ℹ️ This is a <strong>quotation only</strong> — not a tax invoice. Prices are valid${quote.valid_until?` until <strong>${quote.valid_until}</strong>`:" as indicated"}.
    Work will commence upon written or verbal acceptance.
  </div>

  <div class="sig-box">
    <div class="sig-line">Customer Signature &amp; Date</div>
    <div class="sig-line">Authorised by &amp; Date</div>
  </div>

  ${quote.confirm_token?`
  <div style="margin-bottom:20px;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">🔗 Online Approval Link</div>
    <div style="font-size:12px;color:#555;margin-bottom:8px">Click the link below to view this quotation and approve or decline:</div>
    <a href="${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}" style="display:inline-block;padding:8px 20px;background:#2563eb;color:#fff;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;word-break:break-all">${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}</a>
  </div>`:""}

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for considering us!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ═══════════════════════════════════════════════════════════════
// WS DOCUMENTS PAGE  (inline upload + display, no modal)
// ═══════════════════════════════════════════════════════════════
function WsDocumentsPage({docs=[],settings,onSave,onDelete}) {
  // ── Upload section state ──────────────────────────────────────
  const [name,setName]=useState("");
  const [notes,setNotes]=useState("");
  const [file,setFile]=useState(null);
  const [preview,setPreview]=useState(null);
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef(null);
  // ── Display section state ─────────────────────────────────────
  const [search,setSearch]=useState("");
  const [viewDoc,setViewDoc]=useState(null);

  const filtered=docs.filter(d=>{
    if(!search.trim()) return true;
    const h=`${d.name||""} ${d.notes||""} ${d.file_type||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  const fmtDate=s=>{ if(!s) return "—"; const d=new Date(s); return d.toLocaleDateString()+' '+d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"}); };

  const handleFile=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    setFile(f);
    setName(prev=>prev||f.name.replace(/\.[^.]+$/,""));
    if(f.type.startsWith("image/")){
      const r=new FileReader(); r.onload=ev=>setPreview(ev.target.result); r.readAsDataURL(f);
    } else { setPreview(null); }
  };

  const handleUpload=async()=>{
    if(!file){alert("Please choose a file");return;}
    if(!name.trim()){alert("Please enter a document name");return;}
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
    if(!SCRIPT_URL){alert("No Google Drive Script URL configured in Settings → Apps Script URL.");return;}
    setUploading(true);
    try{
      const isPdf=file.type==="application/pdf";
      let base64,mimeType,filename;
      if(isPdf){
        base64=await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=ev=>{
            const ab=ev.target.result;
            const bytes=new Uint8Array(ab);
            let bin=""; bytes.forEach(b=>{bin+=String.fromCharCode(b);});
            res("data:application/pdf;base64,"+btoa(bin));
          };
          r.onerror=rej; r.readAsArrayBuffer(file);
        });
        mimeType="application/pdf";
        filename=`${name.trim().replace(/\s+/g,"_")}_${Date.now()}.pdf`;
      } else {
        base64=await new Promise((res,rej)=>{
          const img=new Image();
          img.onload=()=>{
            const MAX=1600; const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            res(canvas.toDataURL("image/jpeg",0.88));
          };
          img.onerror=rej; img.src=preview;
        });
        mimeType="image/jpeg";
        filename=`${name.trim().replace(/\s+/g,"_")}_${Date.now()}.jpg`;
      }
      const folderPath="Tim_Car_Phot/Workshop_Documents";
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType,folderPath})});
      const result=await resp.json();
      if(!result.success) throw new Error(result.error||"Upload failed");
      await onSave({name:name.trim(),notes:notes.trim()||null,file_url:result.url,file_type:isPdf?"pdf":"image",mime_type:mimeType,filename});
      // Reset upload form
      setName(""); setNotes(""); setFile(null); setPreview(null);
      if(fileRef.current) fileRef.current.value="";
    }catch(e){alert("Upload failed: "+e.message);}
    finally{setUploading(false);}
  };

  return (
    <div>
      {/* ── UPLOAD SECTION ── */}
      <div className="card" style={{padding:16,marginBottom:20,borderLeft:"3px solid var(--accent)"}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>⬆️ Upload New Document</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <FL label="Document Name *"/>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Warranty Card, Supplier Invoice"/>
          </div>
          <div>
            <FL label="Notes (optional)"/>
            <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Brief description..."/>
          </div>
        </div>
        {/* File selector */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={handleFile}/>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <button className="btn btn-ghost" style={{flex:"0 0 auto"}} onClick={()=>fileRef.current?.click()}>
            📂 Choose File
          </button>
          {file
            ? <span style={{fontSize:13,color:"var(--text2)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {file.type==="application/pdf"?"📄":"🖼️"} {file.name}
              </span>
            : <span style={{fontSize:12,color:"var(--text3)"}}>PDF or photo (JPG, PNG...)</span>
          }
          <button className="btn btn-primary" style={{flex:"0 0 auto"}} onClick={handleUpload} disabled={uploading||!file}>
            {uploading?"⏳ Uploading...":"⬆️ Upload & Save"}
          </button>
        </div>
        {/* Image preview */}
        {preview&&(
          <div style={{marginTop:10}}>
            <img src={preview} alt="preview" style={{maxHeight:140,maxWidth:"100%",borderRadius:8,border:"1px solid var(--border)"}}/>
          </div>
        )}
      </div>

      {/* ── DISPLAY SECTION ── */}
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
        <div style={{fontWeight:700,fontSize:14,flex:1}}>📎 Saved Documents ({docs.length})</div>
        <input className="inp" style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."/>
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📭</div>
            <div style={{fontWeight:600}}>{docs.length===0?"No documents yet":"No results"}</div>
          </div>
        : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
            {filtered.map(d=>{
              const isPdf=d.file_type==="pdf"||(d.mime_type||"").includes("pdf");
              return (
                <div key={d.id} className="card" style={{padding:14,display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{fontSize:30,lineHeight:1,flexShrink:0}}>{isPdf?"📄":"🖼️"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name||"Unnamed"}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{fmtDate(d.uploaded_at)}</div>
                    </div>
                  </div>
                  {d.notes&&<div style={{fontSize:12,color:"var(--text2)",lineHeight:1.4,padding:"5px 8px",background:"var(--surface2)",borderRadius:6}}>{d.notes}</div>}
                  <div style={{display:"flex",gap:6,marginTop:"auto"}}>
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-xs" style={{flex:1,textAlign:"center",textDecoration:"none"}}>
                      {isPdf?"📄 Open PDF":"🔍 View"}
                    </a>
                    {!isPdf&&(
                      <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>setViewDoc(d)}>🖼️ Preview</button>
                    )}
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
                      onClick={()=>{if(window.confirm("Delete this document?"))onDelete(d.id);}}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Image lightbox */}
      {viewDoc&&(
        <div onClick={()=>setViewDoc(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <img src={viewDoc.file_url} alt={viewDoc.name} style={{maxWidth:"92vw",maxHeight:"90vh",borderRadius:10,boxShadow:"0 8px 40px rgba(0,0,0,.6)"}}/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP QUOTE — CREATE/EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function WsQuoteModal({job,items,subtotal,tax,total,existing,settings,wsSupplierQuotes=[],onSave,onClose}) {
  const C=curSym(settings.currency||getSettings().currency);
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [f,setF]=useState({
    id:existing?.id||null,
    job_id:job.id,
    quote_customer:existing?.quote_customer||job.customer_name||"",
    quote_phone:existing?.quote_phone||job.customer_phone||"",
    quote_email:existing?.quote_email||job.customer_email||"",
    quote_date:existing?.quote_date||new Date().toISOString().slice(0,10),
    valid_until:existing?.valid_until||"",
    notes:existing?.notes||"",
    subtotal,tax,total,
    status:existing?.status||"draft",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  const [showSupRef,setShowSupRef]=useState(true);

  // Supplier quotes for this job
  const jobSupQuotes = wsSupplierQuotes.filter(q=>q.job_id===job.id);

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={existing?"✏️ Edit Quotation":"📝 Create Quotation"} onClose={onClose}/>

      {/* Supplier price reference panel */}
      {jobSupQuotes.length>0&&(
        <div style={{marginBottom:14,border:"1px solid rgba(251,191,36,.35)",borderRadius:10,overflow:"hidden"}}>
          <button
            onClick={()=>setShowSupRef(p=>!p)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:"rgba(251,191,36,.08)",border:"none",cursor:"pointer",textAlign:"left"}}>
            <span style={{fontWeight:700,fontSize:12,color:"#f59e0b"}}>💰 Supplier Prices ({jobSupQuotes.length} quote{jobSupQuotes.length!==1?"s":""})</span>
            <span style={{fontSize:11,color:"var(--text3)"}}>{showSupRef?"▲ hide":"▼ show"}</span>
          </button>
          {showSupRef&&(
            <div style={{padding:"10px 14px 12px",display:"flex",flexDirection:"column",gap:10}}>
              {jobSupQuotes.map((sq,si)=>{
                const lines=(() => { try { return JSON.parse(sq.line_items||"[]"); } catch { return []; } })();
                return (
                  <div key={sq.id||si} style={{background:"var(--surface2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:12,color:"#25D366"}}>{sq.supplier_name||"Unknown supplier"}</span>
                      {sq.total>0&&<span style={{fontWeight:800,fontSize:13,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(sq.total)}</span>}
                    </div>
                    {lines.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {lines.map((l,li)=>(
                          <div key={li} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,gap:8}}>
                            <span style={{color:"var(--text2)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</span>
                            <span style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                              {l.available&&<span style={{fontSize:10,color:"var(--text3)"}}>{l.available}</span>}
                              <span style={{fontWeight:700,color:(+l.price>0)?"var(--text1)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>
                                {+(l.vat_incl_price||l.price)>0?fmt(+(l.vat_incl_price||l.price)):"—"}
                              </span>
                              {l.vat_incl_price&&+l.vat_incl_price!==+l.price&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600}}>incl.VAT</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {sq.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:5,fontStyle:"italic"}}>{sq.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Customer */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>
          👤 Quote For
        </div>
        <FG>
          <div><FL label="Customer Name"/><input className="inp" value={f.quote_customer} onChange={e=>s("quote_customer",e.target.value)}/></div>
          <div><FL label="Phone"/><input className="inp" value={f.quote_phone} onChange={e=>s("quote_phone",e.target.value)}/></div>
        </FG>
        <FD><FL label="Email"/><input className="inp" value={f.quote_email} onChange={e=>s("quote_email",e.target.value)}/></FD>
      </div>

      {/* Items summary */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>🔧 {job.vehicle_reg} · {items.length} item{items.length!==1?"s":""}</div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:10}}>{i.type==="part"?"🔩":"👷"}</span></td>
                <td>{i.description}</td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right"}}>{fmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700}}>{fmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmt(total)}</div>
        </div>
      </div>

      <FG>
        <div><FL label="Quote Date"/><input className="inp" type="date" value={f.quote_date} onChange={e=>s("quote_date",e.target.value)}/></div>
        <div><FL label="Valid Until"/><input className="inp" type="date" value={f.valid_until} onChange={e=>s("valid_until",e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes / Terms"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Payment terms, warranty, conditions..." style={{minHeight:60}}/></FD>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" style={{flex:1}} disabled={saving||items.length===0} onClick={async()=>{
          setSaving(true);
          try{ await onSave({...f}); printWorkshopQuote(job,items,{...f},settings); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>💾 Save &amp; Print</button>
        <button className="btn btn-primary" style={{flex:1}} disabled={saving||items.length===0} onClick={async()=>{
          setSaving(true);
          try{ await onSave({...f}); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>{saving?"Saving...":(existing?"💾 Save":"📝 Create Quote")}</button>
      </div>
      {items.length===0&&<p style={{color:"var(--red)",fontSize:12,marginTop:8,textAlign:"center"}}>Add parts or labour items before creating a quote.</p>}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function WsInvoiceEditModal({invoice,onSave,onClose}) {
  const [f,setF]=useState({
    invoice_customer:invoice.invoice_customer||"",
    inv_phone:invoice.inv_phone||"",
    inv_email:invoice.inv_email||"",
    invoice_date:invoice.invoice_date||"",
    due_date:invoice.due_date||"",
    notes:invoice.notes||"",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="✏️ Edit Invoice" onClose={onClose}/>
      <FG>
        <div><FL label="Customer Name"/><input className="inp" value={f.invoice_customer} onChange={e=>s("invoice_customer",e.target.value)}/></div>
        <div><FL label="Phone"/><input className="inp" value={f.inv_phone} onChange={e=>s("inv_phone",e.target.value)}/></div>
      </FG>
      <FD><FL label="Email"/><input className="inp" value={f.inv_email} onChange={e=>s("inv_email",e.target.value)}/></FD>
      <FG>
        <div><FL label="Invoice Date"/><input className="inp" type="date" value={f.invoice_date} onChange={e=>s("invoice_date",e.target.value)}/></div>
        <div><FL label="Due Date"/><input className="inp" type="date" value={f.due_date} onChange={e=>s("due_date",e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:60}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={async()=>{
          setSaving(true);
          try{ await onSave(f); }catch(e){ alert(e.message); }
          finally{ setSaving(false); }
        }}>{saving?"Saving...":"💾 Save Changes"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════
function WsPaymentModal({invoice,settings,onSave,onClose}) {
  const balance=(+invoice.total||0)-(+invoice.paid_amount||0);
  const [amount,setAmount]=useState(balance.toFixed(2));
  const [method,setMethod]=useState("Cash");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [ref,setRef]=useState("");
  const [saving,setSaving]=useState(false);
  const C=curSym(settings.currency||getSettings().currency);

  const handleSave=async()=>{
    const paid=parseFloat(amount)||0;
    if(paid<=0){alert("Enter a valid amount");return;}
    const newPaid=Math.min((+invoice.paid_amount||0)+paid,+invoice.total||0);
    const newStatus=newPaid>=(+invoice.total||0)?"paid":newPaid>0?"partial":"unpaid";
    setSaving(true);
    try{
      await onSave({
        paid_amount:newPaid,
        payment_method:method,
        payment_date:date,
        payment_ref:ref,
        status:newStatus,
      });
    }catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="💳 Record Payment" onClose={onClose}/>
      <div className="card" style={{padding:12,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
          <span style={{color:"var(--text3)"}}>Invoice Total</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{C} {(+invoice.total||0).toFixed(2)}</strong>
        </div>
        {(+invoice.paid_amount||0)>0&&(
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:4}}>
            <span style={{color:"var(--text3)"}}>Already Paid</span>
            <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{C} {(+invoice.paid_amount||0).toFixed(2)}</strong>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginTop:6,paddingTop:6,borderTop:"1px solid var(--border)"}}>
          <span style={{fontWeight:700}}>Balance Due</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",fontSize:16}}>{C} {balance.toFixed(2)}</strong>
        </div>
      </div>
      <FG>
        <div>
          <FL label={`Amount Received (${C})`}/>
          <input className="inp" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
        </div>
        <div>
          <FL label="Payment Method"/>
          <select className="inp" value={method} onChange={e=>setMethod(e.target.value)}>
            {["Cash","Card","EFT / Bank Transfer","Cheque","Other"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
      </FG>
      <FG>
        <div><FL label="Payment Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><FL label="Reference / Receipt No"/><input className="inp" value={ref} onChange={e=>setRef(e.target.value)} placeholder="Optional"/></div>
      </FG>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-success" style={{flex:2}} disabled={saving} onClick={handleSave}>
          {saving?"Saving...":"💳 Confirm Payment"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — STATEMENT MODAL
// ═══════════════════════════════════════════════════════════════
function WsStatementModal({invoice,job,items,settings,onClose,onPrint}) {
  const C=curSym(settings.currency||getSettings().currency);
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const paid=+invoice.paid_amount||0;
  const balance=(+invoice.total||0)-paid;
  const statusColor=invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)";
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📋 Invoice Statement" onClose={onClose}/>

      {/* Invoice header */}
      <div className="card" style={{padding:14,marginBottom:12,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{settings.shop_name||"Workshop"}</div>
            {settings.phone&&<div style={{fontSize:12,color:"var(--text3)"}}>📞 {settings.phone}</div>}
            {settings.address&&<div style={{fontSize:12,color:"var(--text3)"}}>{settings.address}</div>}
            {(settings.city||settings.country)&&<div style={{fontSize:12,color:"var(--text3)"}}>🌍 {[settings.city,settings.country].filter(Boolean).join(", ")}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{invoice.id}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>Date: {invoice.invoice_date}</div>
            {invoice.due_date&&<div style={{fontSize:12,color:"var(--text3)"}}>Due: {invoice.due_date}</div>}
          </div>
        </div>
        <div style={{borderTop:"1px solid var(--border)",marginTop:10,paddingTop:10,display:"flex",gap:24,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Customer</div>
            <div style={{fontWeight:600}}>{invoice.invoice_customer||job.customer_name||"—"}</div>
            {(invoice.inv_phone||job.customer_phone)&&<div style={{fontSize:12,color:"var(--text3)"}}>{invoice.inv_phone||job.customer_phone}</div>}
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Vehicle</div>
            <div style={{fontWeight:600,fontFamily:"DM Mono,monospace"}}>{job.vehicle_reg||"—"}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>{job.vehicle_make} {job.vehicle_model} {job.vehicle_year}</div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card" style={{overflow:"hidden",marginBottom:12}}>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Description","Qty","Unit Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td>
                  <span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:10,marginRight:6}}>
                    {i.type==="part"?"🔩":"👷"}
                  </span>
                  {i.description}
                </td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}>{fmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
          <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmt(invoice.total)}</div>
        </div>
      </div>

      {/* Payment summary */}
      <div className="card" style={{padding:14,marginBottom:14,borderLeft:`3px solid ${statusColor}`}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>💳 Payment Summary</div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
          <span style={{color:"var(--text3)"}}>Invoice Total</span><strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.total)}</strong>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
          <span style={{color:"var(--text3)"}}>Amount Paid</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{fmt(paid)}</strong>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:15,paddingTop:8,borderTop:"1px solid var(--border)"}}>
          <strong>Balance Due</strong>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:statusColor,fontSize:17}}>{fmt(balance)}</strong>
        </div>
        {paid>0&&(
          <div style={{marginTop:10,padding:"8px 10px",background:"var(--surface2)",borderRadius:8,fontSize:12}}>
            {invoice.payment_method&&<div>Method: <strong>{invoice.payment_method}</strong></div>}
            {invoice.payment_date&&<div>Date: <strong>{invoice.payment_date}</strong></div>}
            {invoice.payment_ref&&<div>Reference: <code style={{fontFamily:"DM Mono,monospace"}}>{invoice.payment_ref}</code></div>}
          </div>
        )}
        <div style={{marginTop:10,display:"flex",justifyContent:"center"}}>
          <span className="badge" style={{background:invoice.status==="paid"?"rgba(52,211,153,.15)":invoice.status==="partial"?"rgba(251,191,36,.15)":"rgba(248,113,113,.15)",color:statusColor,fontSize:13,padding:"5px 14px"}}>
            {invoice.status==="paid"?"✅ FULLY PAID":invoice.status==="partial"?"💛 PARTIALLY PAID":"⏳ UNPAID"}
          </span>
        </div>
      </div>

      {invoice.notes&&<div style={{marginBottom:14,padding:10,background:"var(--surface2)",borderRadius:8,fontSize:13,color:"var(--text2)"}}>{invoice.notes}</div>}

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Close</button>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onPrint}>🖨️ Print PDF</button>
      </div>
    </Overlay>
  );
}

// WORKSHOP INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
function WorkshopInvoiceModal({job,items,subtotal,tax,total,settings,onSave,onClose,t,prefill={}}) {
  const [invDate,  setInvDate]  = useState(new Date().toISOString().slice(0,10));
  const [dueDate,  setDueDate]  = useState(prefill.dueDate||"");
  const [notes,    setNotes]    = useState(prefill.notes||"");
  const [saving,   setSaving]   = useState(false);
  // Invoice-specific customer details — pre-filled from quote or job profile
  const [invCust,  setInvCust]  = useState(prefill.invCust||job.customer_name||"");
  const [invPhone, setInvPhone] = useState(prefill.invPhone||job.customer_phone||"");
  const [invEmail, setInvEmail] = useState(prefill.invEmail||job.customer_email||"");

  const handleCreate=async()=>{
    setSaving(true);
    try{
      await onSave({
        job_id:job.id,
        invoice_customer:invCust, inv_phone:invPhone, inv_email:invEmail,
        vehicle_reg:job.vehicle_reg||"",
        invoice_date:invDate, due_date:dueDate,
        subtotal, tax, total, status:"unpaid", notes,
      });
    }catch(e){ alert("Failed to create invoice: "+e.message); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={prefill.notes?"🧾 Convert Quote to Invoice":"🧾 Create Workshop Invoice"} onClose={onClose}/>
      {prefill.notes&&<div style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12,color:"var(--blue)"}}>
        📝 Pre-filled from quotation — review and adjust before saving.
      </div>}

      {/* Editable invoice customer details — pre-filled from quote or job profile */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>
            👤 Invoice Customer
          </div>
          <div style={{display:"flex",gap:6}}>
            <button type="button" className="btn btn-ghost btn-xs"
              onClick={()=>{ setInvCust(job.customer_name||""); setInvPhone(job.customer_phone||""); setInvEmail(job.customer_email||""); }}>
              ↩ Use Profile
            </button>
            <button type="button" className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
              onClick={()=>{ setInvCust(""); setInvPhone(""); setInvEmail(""); }}>
              ✕ Clear
            </button>
          </div>
        </div>
        <FG>
          <div><FL label="Invoice Name"/><input className="inp" value={invCust} onChange={e=>setInvCust(e.target.value)} placeholder="Customer name on invoice"/></div>
          <div><FL label="Invoice Phone"/><input className="inp" value={invPhone} onChange={e=>setInvPhone(e.target.value)} placeholder="Phone"/></div>
        </FG>
        <FD><FL label="Invoice Email"/><input className="inp" value={invEmail} onChange={e=>setInvEmail(e.target.value)} placeholder="Email"/></FD>
      </div>

      {/* Line items summary */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>{job.vehicle_reg} · {items.length} item{items.length!==1?"s":""}</div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:11}}>{i.type==="part"?"🔩":"👷"}</span></td>
                <td>{i.description}{i.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:6}}>{i.part_sku}</code>}</td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right"}}>{fmtAmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700}}>{fmtAmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)"}}>Total: {fmtAmt(total)}</div>
        </div>
      </div>

      <FG>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
      </FG>
      <FD><FL label={t.notes}/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Payment instructions, warranty..." style={{minHeight:60}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleCreate} disabled={saving}>
          {saving?"Saving...":"💾 Create Invoice"}
        </button>
      </div>
    </Overlay>
  );
}

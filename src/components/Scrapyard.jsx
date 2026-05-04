import { useState, useMemo, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import { toImgUrl } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";

const CONDITION_OPTS = ["New","Used","Refurbished"];
const STATUS_OPTS    = ["Available","Stripping","Stripped","Sold"];
const PART_CATS      = ["Engine","Gearbox/Transmission","Suspension","Brakes","Body/Panel","Electrical","Interior","Cooling","Exhaust","Steering","Fuel","Other"];

const STATUS_COLORS = { Available:"#34d399", Stripping:"#fbbf24", Stripped:"#60a5fa", Sold:"#9ca3af" };
const COND_COLORS   = { New:"#34d399", Used:"#fbbf24", Refurbished:"#60a5fa" };

const PHOTO_SLOTS = [
  { key:"photo_front",    label:"Front" },
  { key:"photo_rear",     label:"Rear" },
  { key:"photo_left",     label:"Left Side" },
  { key:"photo_right",    label:"Right Side" },
  { key:"photo_interior", label:"Interior" },
  { key:"photo_engine",   label:"Engine Bay" },
];

const PART_PHOTO_SLOTS = [
  { key:"photo_url",   label:"Photo 1" },
  { key:"photo_url_2", label:"Photo 2" },
  { key:"photo_url_3", label:"Photo 3" },
];

const Lbl = ({children}) => (
  <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",display:"block",marginBottom:4}}>{children}</label>
);

const getScriptUrl = () =>
  (window._VEHICLE_SCRIPT_URL?.trim()) || (window._APPS_SCRIPT_URL?.trim()) || "";

// ── Part label modal ───────────────────────────────────────────────
function PartLabelModal({part, vehicle, onClose}) {
  const num = part.part_number || ("SP" + String(part.id).padStart(5,"0"));
  const qr  = `https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=${encodeURIComponent(num)}&format=png`;
  const veh = vehicle ? `${vehicle.year||""} ${vehicle.make} ${vehicle.model}`.trim() : "";

  const handlePrint = () => {
    const id = "__label_print_root__";
    const styleId = "__label_print_style__";
    document.getElementById(styleId)?.remove();
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `@media print{body *{visibility:hidden}#${id},#${id} *{visibility:visible}#${id}{position:fixed;left:0;top:0;background:#fff;padding:8mm}}`;
    document.head.appendChild(s);
    window.print();
    setTimeout(() => document.getElementById(styleId)?.remove(), 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,padding:0,overflow:"hidden"}}>
        <div style={{padding:"11px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:700,fontSize:14}}>🏷️ Part Label</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Label preview */}
        <div style={{padding:20,display:"flex",justifyContent:"center",background:"var(--surface2)"}}>
          <div id="__label_print_root__" style={{width:320,border:"2px solid #ccc",borderRadius:8,padding:"10px 12px",display:"flex",gap:12,alignItems:"flex-start",background:"#fff",fontFamily:"Arial,sans-serif"}}>
            <img src={qr} alt="QR" style={{width:88,height:88,flexShrink:0,display:"block"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:19,fontWeight:900,letterSpacing:1,marginBottom:4,color:"#000",fontFamily:"monospace"}}>{num}</div>
              <div style={{fontSize:12,fontWeight:"bold",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#000"}}>{part.name}</div>
              {veh&&<div style={{fontSize:10,color:"#444",marginBottom:1}}>🚗 {veh}</div>}
              {vehicle?.vin&&<div style={{fontSize:9,color:"#555",marginBottom:2,fontFamily:"monospace"}}>VIN: {vehicle.vin}</div>}
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                {part.condition&&<span style={{border:"1px solid #888",borderRadius:3,padding:"1px 5px",fontSize:9,color:"#000"}}>{part.condition}</span>}
                {part.category&&<span style={{border:"1px solid #888",borderRadius:3,padding:"1px 5px",fontSize:9,color:"#000"}}>{part.category}</span>}
                {part.location&&<span style={{border:"1px solid #888",borderRadius:3,padding:"1px 5px",fontSize:9,color:"#000"}}>📍 {part.location}</span>}
                {part.price!=null&&<span style={{border:"1px solid #888",borderRadius:3,padding:"1px 5px",fontSize:9,color:"#000"}}>R {Number(part.price).toFixed(0)}</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}

// ── QR scan modal ──────────────────────────────────────────────────
function QrScanModal({parts, onFound, onClose}) {
  const [err,        setErr]        = useState("");
  const [scanning,   setScanning]   = useState(false);
  const [supported,  setSupported]  = useState(null);
  const [manualNum,  setManualNum]  = useState("");
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const timerRef  = useRef(null);
  const fileRef   = useRef(null);

  const stopCamera = () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const handleScan = (value) => {
    stopCamera();
    const v = (value||"").trim();
    const part = parts.find(p=>p.part_number===v || String(p.id)===v);
    if(part) onFound(part);
    else setErr(`No part found for: "${v}"`);
  };

  useEffect(()=>{
    const ok = typeof BarcodeDetector !== "undefined";
    setSupported(ok);
    if(!ok) return;
    (async()=>{
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
        streamRef.current = stream;
        if(videoRef.current){ videoRef.current.srcObject=stream; await videoRef.current.play(); }
        setScanning(true);
        const detector = new BarcodeDetector({formats:["qr_code","code_128","code_39","ean_13"]});
        timerRef.current = setInterval(async()=>{
          if(!videoRef.current||videoRef.current.readyState<2) return;
          try { const codes=await detector.detect(videoRef.current); if(codes.length>0) handleScan(codes[0].rawValue); } catch{}
        },400);
      } catch(e){ setErr("Camera error: "+e.message); }
    })();
    return ()=>stopCamera();
  },[]);// eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = async (e) => {
    const file=e.target.files?.[0]; if(!file) return; e.target.value="";
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetector({formats:["qr_code","code_128","code_39"]});
      const codes = await detector.detect(bitmap);
      if(codes.length>0) handleScan(codes[0].rawValue);
      else setErr("No QR code found in image — try a clearer photo");
    } catch(e2){ setErr("Scan failed: "+e2.message); }
  };

  const inp = {width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:14,boxSizing:"border-box",fontFamily:"inherit"};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:340}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <b>📷 Scan Part Label</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{padding:"16px 20px 20px",display:"flex",flexDirection:"column",gap:12}}>

          {supported!==false && (
            <div style={{position:"relative",borderRadius:12,overflow:"hidden",background:"#000",aspectRatio:"1/1"}}>
              <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} playsInline muted/>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                <div style={{width:170,height:170,border:"2.5px solid rgba(52,211,153,.9)",borderRadius:14,boxShadow:"0 0 0 9999px rgba(0,0,0,.38)"}}/>
              </div>
              <div style={{position:"absolute",bottom:8,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,.8)",fontSize:11}}>
                {scanning?"Point at QR code on the label":"Starting camera…"}
              </div>
            </div>
          )}

          {supported===false&&(
            <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:"8px 0"}}>
              QR scanning needs Chrome or Android browser.<br/>Upload a photo of the label instead.
            </div>
          )}

          {err&&(
            <div style={{color:"var(--red)",fontSize:12,textAlign:"center"}}>
              {err}
              <button className="btn btn-ghost btn-xs" style={{marginLeft:8}} onClick={()=>setErr("")}>Clear</button>
            </div>
          )}

          <div style={{borderTop:"1px solid var(--border)",paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
            <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}>🖼️ Photo of label</button>

            <div style={{display:"flex",gap:6}}>
              <input style={{...inp,fontSize:13}} value={manualNum} onChange={e=>setManualNum(e.target.value)}
                placeholder="Type part number e.g. SP12345"
                onKeyDown={e=>e.key==="Enter"&&handleScan(manualNum)}/>
              <button className="btn btn-primary btn-sm" style={{flexShrink:0}} onClick={()=>handleScan(manualNum)}>Find</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const resizeB64 = (file, max=1200) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      let w=img.width, h=img.height;
      if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg",0.88));
    };
    img.onerror=reject; img.src=ev.target.result;
  };
  reader.onerror=reject; reader.readAsDataURL(file);
});

// ── Vehicle photo slot — same design as workshop VehiclePhotoUploader ──
function ScrapVehiclePhotoSlot({label, url, vehicleId, vin, photoKey, onSaved}) {
  const [uploading, setUploading] = useState(false);
  const [status,    setStatus]    = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const [error,     setError]     = useState(null);
  const fileRef = useRef(null);
  const camRef  = useRef(null);

  const upload = async (file) => {
    if(!file) return;
    const isImg = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(file.name);
    if(!isImg){ setError("Image files only"); return; }
    const SCRIPT = getScriptUrl();
    if(!SCRIPT){ setError("⚙️ Set Vehicle Script URL in Settings first"); return; }
    setUploading(true); setError(null);
    try {
      setStatus("Resizing…");
      const base64 = await resizeB64(file);
      setStatus("Uploading…");
      const pad = n=>String(n).padStart(2,"0");
      const now = new Date();
      const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const folderPath = `Scrapyard/${vin||"NO-VIN"}/Car Photos`;
      const filename   = `${ts}_${label.replace(/\s/g,"_")}.jpg`;
      const resp   = await fetch(SCRIPT,{method:"POST",body:JSON.stringify({image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result = await resp.json();
      if(result.success){
        setStatus("Saving…");
        const dbRes = await api.patch("scrapyard_vehicles","id",vehicleId,{[photoKey]:result.url});
        if(dbRes?.code) throw new Error("DB save failed: "+dbRes.message);
        onSaved(result.url); setStatus(""); setError(null);
      } else {
        throw new Error(result.error||"Upload failed");
      }
    } catch(e){ setError("❌ "+e.message); setStatus(""); }
    setUploading(false);
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={()=>!uploading&&fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);upload(e.dataTransfer.files[0]);}}
        style={{
          border:`2px dashed ${dragOver?"var(--accent)":"var(--border)"}`,
          borderRadius:10, cursor:uploading?"wait":"pointer",
          background:dragOver?"rgba(251,146,60,.06)":"var(--surface2)",
          aspectRatio:"4/3", overflow:"hidden", position:"relative",
          display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s",
        }}>
        {/* full picker — no capture */}
        <input ref={fileRef} type="file" style={{display:"none"}} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/>
        {/* camera only */}
        <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/>

        {uploading ? (
          <div style={{textAlign:"center",color:"var(--accent)",padding:8}}>
            <div style={{width:24,height:24,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 6px"}}/>
            <div style={{fontSize:11,maxWidth:120,margin:"0 auto",lineHeight:1.4}}>{status||"Uploading…"}</div>
          </div>
        ) : url ? (
          <>
            <img src={toImgUrl(url)||url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <div style={{background:"rgba(0,0,0,.6)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:12}}>🔄 Tap to replace</div>
            </div>
          </>
        ) : (
          <div style={{textAlign:"center",color:"var(--text3)",padding:8}}>
            <div style={{fontSize:22,marginBottom:4}}>🖼️</div>
            <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>{label}</div>
            <div style={{fontSize:10}}>Tap to choose photo</div>
          </div>
        )}
      </div>

      {/* Label + buttons */}
      <div style={{marginTop:6}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:5,textAlign:"center",textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>
        <div style={{display:"flex",gap:5,justifyContent:"center"}}>
          <button className="btn btn-ghost btn-xs"
            style={{flex:1,padding:"5px 4px",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
            onClick={e=>{e.stopPropagation();camRef.current?.click();}}>
            <span style={{fontSize:15}}>📷</span><span>Camera</span>
          </button>
          <button className="btn btn-ghost btn-xs"
            style={{flex:1,padding:"5px 4px",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
            onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>
            <span style={{fontSize:15}}>🖼️</span><span>Files</span>
          </button>
        </div>
        {error&&<div style={{fontSize:10,color:"var(--red)",marginTop:4,textAlign:"center"}}>{error}</div>}
      </div>
    </div>
  );
}

// ── Single part photo slot ─────────────────────────────────────────
function ScrapPartPhotoSlot({label, url, partId, vin, photoKey, onChange}) {
  const [uploading, setUploading] = useState(false);
  const [status,    setStatus]    = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const [error,     setError]     = useState(null);
  const fileRef = useRef(null);
  const camRef  = useRef(null);

  const upload = async (file) => {
    if(!file) return;
    const isImg = file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(file.name);
    if(!isImg){ setError("Image files only"); return; }
    const SCRIPT = getScriptUrl();
    if(!SCRIPT){ setError("⚙️ Set Vehicle Script URL in Settings first"); return; }
    setUploading(true); setError(null);
    try {
      setStatus("Resizing…");
      const base64 = await resizeB64(file);
      setStatus("Uploading…");
      const pad = n=>String(n).padStart(2,"0");
      const now = new Date();
      const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const folderPath = `Scrapyard/${vin||"NO-VIN"}/Parts Photos`;
      const filename   = `${ts}_${label.replace(/\s/g,"_")}_part_${partId||"new"}.jpg`;
      const resp   = await fetch(SCRIPT,{method:"POST",body:JSON.stringify({image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result = await resp.json();
      if(result.success){
        if(partId){
          setStatus("Saving…");
          const dbRes = await api.patch("scrapyard_parts","id",partId,{[photoKey]:result.url});
          if(dbRes?.code) throw new Error("DB save failed: "+dbRes.message);
        }
        onChange(result.url); setStatus(""); setError(null);
      } else {
        throw new Error(result.error||"Upload failed");
      }
    } catch(e){ setError("❌ "+e.message); setStatus(""); }
    setUploading(false);
  };

  return (
    <div>
      <div
        onClick={()=>!uploading&&fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);upload(e.dataTransfer.files[0]);}}
        style={{
          border:`2px dashed ${dragOver?"var(--accent)":"var(--border)"}`,
          borderRadius:10, cursor:uploading?"wait":"pointer",
          background:dragOver?"rgba(251,146,60,.06)":"var(--surface2)",
          aspectRatio:"1/1", overflow:"hidden", position:"relative",
          display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s",
        }}>
        <input ref={fileRef} type="file" style={{display:"none"}} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/>
        <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{upload(e.target.files[0]);e.target.value="";}}/>
        {uploading ? (
          <div style={{textAlign:"center",color:"var(--accent)",padding:8}}>
            <div style={{width:20,height:20,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 4px"}}/>
            <div style={{fontSize:10,lineHeight:1.3}}>{status||"Uploading…"}</div>
          </div>
        ) : url ? (
          <>
            <img src={toImgUrl(url)||url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <div style={{background:"rgba(0,0,0,.6)",color:"#fff",borderRadius:8,padding:"4px 8px",fontSize:11}}>🔄 Replace</div>
            </div>
          </>
        ) : (
          <div style={{textAlign:"center",color:"var(--text3)",padding:6}}>
            <div style={{fontSize:18,marginBottom:2}}>📷</div>
            <div style={{fontSize:10,fontWeight:600}}>{label}</div>
          </div>
        )}
      </div>
      <div style={{marginTop:5}}>
        <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",marginBottom:4,textAlign:"center",textTransform:"uppercase",letterSpacing:".05em"}}>{label}</div>
        <div style={{display:"flex",gap:4,justifyContent:"center"}}>
          <button className="btn btn-ghost btn-xs" style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
            onClick={e=>{e.stopPropagation();camRef.current?.click();}}>
            <span style={{fontSize:13}}>📷</span><span>Camera</span>
          </button>
          <button className="btn btn-ghost btn-xs" style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
            onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>
            <span style={{fontSize:13}}>🖼️</span><span>Files</span>
          </button>
        </div>
        {error&&<div style={{fontSize:9,color:"var(--red)",marginTop:3,textAlign:"center",lineHeight:1.3}}>{error}</div>}
      </div>
    </div>
  );
}

// ── 3-slot part photos ─────────────────────────────────────────────
function ScrapPartPhotos({urls, partId, vin, onChange}) {
  return (
    <div>
      <Lbl>📸 Part Photos</Lbl>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {PART_PHOTO_SLOTS.map(({key,label})=>(
          <ScrapPartPhotoSlot
            key={key}
            label={label}
            url={urls[key]||""}
            partId={partId}
            vin={vin}
            photoKey={key}
            onChange={url=>onChange(key,url)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Vehicle modal ──────────────────────────────────────────────────
function VehicleModal({v, scrapId, onSave, onClose}) {
  const blank = {make:"",model:"",year:"",color:"",vin:"",reg:"",engine_no:"",status:"Available",odometer:"",purchase_price:"",notes:""};
  const [form, setForm]         = useState(v?.id ? {...blank,...v} : blank);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr]   = useState("");
  const [scanImg, setScanImg]   = useState(null);
  const [scanOk, setScanOk]     = useState(false);
  const cameraRef  = useRef();
  const galleryRef = useRef();

  const set = (k,val) => setForm(f=>({...f,[k]:val}));

  const processImage = async (dataUrl) => {
    setScanning(true); setScanErr(""); setScanOk(false); setScanImg(dataUrl);
    try {
      const raw    = await decodePDF417fromImage(dataUrl);
      const parsed = parseLicenceDisc(raw);
      setForm(f=>({
        ...f,
        make:      parsed.make      ||f.make,
        model:     parsed.model     ||f.model,
        color:     parsed.color     ||f.color,
        vin:       parsed.vin       ||f.vin,
        engine_no: parsed.engine_no ||f.engine_no,
        reg:       parsed.reg       ||f.reg,
      }));
      setScanOk(true);
    } catch(e) {
      setScanErr("PDF417 not detected — try a clearer, closer photo of the disc sticker. ("+e.message+")");
    }
    setScanning(false);
  };

  const handleFile = (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    const fr=new FileReader();
    fr.onload=ev=>processImage(ev.target.result);
    fr.readAsDataURL(file);
    e.target.value="";
  };

  const save = async () => {
    if(!form.make||!form.model){setErr("Make and model required");return;}
    setLoading(true); setErr("");
    // eslint-disable-next-line no-unused-vars
    const {id:_id, created_at:_ca, ...formData} = form;
    const payload = {
      ...formData, scrapyard_id:Number(scrapId),
      year:           form.year           ? Number(form.year)           : null,
      odometer:       form.odometer       ? Number(form.odometer)       : null,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
    };
    const res = v?.id
      ? await api.patch("scrapyard_vehicles","id",v.id,payload).catch(e=>({message:e.message}))
      : await api.insert("scrapyard_vehicles",payload).catch(e=>({message:e.message}));
    if(res?.code||(!Array.isArray(res)&&!v?.id&&res?.message)){setErr(res?.message||"Save failed");setLoading(false);return;}
    onSave(); setLoading(false);
  };

  const inp = {width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box",fontFamily:"inherit"};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:540,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{position:"sticky",top:0,zIndex:1,background:"var(--surface)"}}>
          <b>{v?.id?"Edit Vehicle":"Add Vehicle"}</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:13,padding:"16px 20px 22px"}}>

          {/* Licence disc scanner */}
          <div style={{background:"var(--surface2)",borderRadius:10,border:"1.5px solid var(--border)",padding:"12px 14px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>🪪 SCAN LICENCE DISC</div>
            <div style={{display:"flex",gap:8,marginBottom:scanImg?10:0}}>
              <button className="btn btn-ghost btn-sm" style={{flex:1,padding:"10px 0",fontSize:13}} onClick={()=>cameraRef.current.click()} disabled={scanning}>📷 Camera</button>
              <button className="btn btn-ghost btn-sm" style={{flex:1,padding:"10px 0",fontSize:13}} onClick={()=>galleryRef.current.click()} disabled={scanning}>🖼 Gallery</button>
            </div>
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
            <input ref={galleryRef} type="file" accept="image/*"                       style={{display:"none"}} onChange={handleFile}/>
            {scanning&&<div style={{textAlign:"center",padding:"10px 0",fontSize:13,color:"var(--text3)"}}>⏳ Decoding PDF417 barcode…</div>}
            {scanImg&&!scanning&&(
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <img src={scanImg} alt="scanned" style={{width:90,height:60,objectFit:"cover",borderRadius:6,flexShrink:0,border:"1px solid var(--border)"}}/>
                <div style={{flex:1}}>
                  {scanOk&&<div style={{fontSize:12,color:"var(--green)",fontWeight:600,marginBottom:4}}>✅ Disc read — fields filled below</div>}
                  {scanErr&&<div style={{fontSize:12,color:"var(--red)"}}>{scanErr}</div>}
                  <button className="btn btn-ghost btn-xs" onClick={()=>{setScanImg(null);setScanErr("");setScanOk(false);}}>Clear</button>
                </div>
              </div>
            )}
            {!scanImg&&!scanning&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Point at the sticker inside the windscreen — auto-fills make, model, color, VIN</div>}
          </div>

          {/* Form fields */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Make *</Lbl><input style={inp} value={form.make} onChange={e=>set("make",e.target.value)} placeholder="Toyota"/></div>
            <div><Lbl>Model *</Lbl><input style={inp} value={form.model} onChange={e=>set("model",e.target.value)} placeholder="Hilux"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><Lbl>Year</Lbl><input style={inp} type="number" value={form.year} onChange={e=>set("year",e.target.value)} placeholder="2010"/></div>
            <div><Lbl>Color</Lbl><input style={inp} value={form.color} onChange={e=>set("color",e.target.value)} placeholder="White"/></div>
            <div><Lbl>Status</Lbl>
              <select style={inp} value={form.status} onChange={e=>set("status",e.target.value)}>
                {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Reg / Plate</Lbl><input style={inp} value={form.reg} onChange={e=>set("reg",e.target.value)} placeholder="GP 123-456"/></div>
            <div><Lbl>VIN / Chassis</Lbl><input style={inp} value={form.vin} onChange={e=>set("vin",e.target.value)} placeholder="VIN number"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Engine No</Lbl><input style={inp} value={form.engine_no} onChange={e=>set("engine_no",e.target.value)}/></div>
            <div><Lbl>Odometer (km)</Lbl><input style={inp} type="number" value={form.odometer} onChange={e=>set("odometer",e.target.value)}/></div>
          </div>
          <div><Lbl>Purchase Price</Lbl><input style={inp} type="number" value={form.purchase_price} onChange={e=>set("purchase_price",e.target.value)}/></div>
          <div><Lbl>Notes</Lbl><textarea style={{...inp,resize:"vertical"}} rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)}/></div>

          {err&&<div style={{color:"var(--red)",fontSize:13}}>⚠ {err}</div>}
          <button className="btn btn-primary" style={{width:"100%",padding:12}} onClick={save} disabled={loading||scanning}>
            {loading?"Saving…":v?.id?"Save Changes":"Add Vehicle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Part modal ─────────────────────────────────────────────────────
function PartModal({p, scrapId, vehicles, defaultVehicleId, onSave, onClose}) {
  const [form, setForm] = useState(()=>{
    const autoNum = "SP" + String(Date.now() % 100000).padStart(5,"0");
    const base = {name:"",category:"",part_number:p?.id?"":autoNum,condition:"Used",vehicle_id:defaultVehicleId||"",quantity:1,min_qty:1,price:"",cost:"",location:"",notes:"",photo_url:"",photo_url_2:"",photo_url_3:""};
    return p?.id ? {...base,...p, vehicle_id:p.vehicle_id||""} : base;
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const set = (k,val) => setForm(f=>({...f,[k]:val}));

  const vehicleVin = useMemo(()=>{
    if(!form.vehicle_id) return "";
    const veh = vehicles.find(v=>String(v.id)===String(form.vehicle_id));
    return veh?.vin||"";
  },[form.vehicle_id,vehicles]);

  const save = async () => {
    if(!form.name){setErr("Part name required");return;}
    setLoading(true); setErr("");
    const payload = {
      name:        form.name,
      category:    form.category||null,
      part_number: form.part_number||null,
      condition:   form.condition||null,
      location:    form.location||null,
      notes:       form.notes||null,
      photo_url:   form.photo_url||null,
      scrapyard_id: Number(scrapId),
      quantity:    Number(form.quantity)||0,
      min_qty:     Number(form.min_qty)||0,
      price:       form.price!==""  ? Number(form.price)  : null,
      cost:        form.cost!==""   ? Number(form.cost)   : null,
      vehicle_id:  form.vehicle_id  ? Number(form.vehicle_id) : null,
      ...(form.photo_url_2 ? {photo_url_2: form.photo_url_2} : {}),
      ...(form.photo_url_3 ? {photo_url_3: form.photo_url_3} : {}),
    };
    const res = p?.id
      ? await api.patch("scrapyard_parts","id",p.id,payload).catch(e=>({message:e.message}))
      : await api.insert("scrapyard_parts",payload).catch(e=>({message:e.message}));
    if(res?.code||(!Array.isArray(res)&&!p?.id&&res?.message)){setErr(res?.message||"Save failed");setLoading(false);return;}
    const saved = Array.isArray(res)?res[0]:(res||null);
    onSave(saved||{...payload, id:p?.id}); setLoading(false);
  };

  const inp = {width:"100%",padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box",fontFamily:"inherit"};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{maxWidth:540,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{position:"sticky",top:0,zIndex:1,background:"var(--surface)"}}>
          <b>{p?.id?"Edit Part":"Add Part"}</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,padding:"16px 20px 20px"}}>
          <div><Lbl>Part Name *</Lbl><input style={inp} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Engine Block, Front Door"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Category</Lbl>
              <select style={inp} value={form.category} onChange={e=>set("category",e.target.value)}>
                <option value="">-- Select --</option>
                {PART_CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><Lbl>Condition</Lbl>
              <select style={inp} value={form.condition} onChange={e=>set("condition",e.target.value)}>
                {CONDITION_OPTS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Part Number / SKU</Lbl><input style={inp} value={form.part_number} onChange={e=>set("part_number",e.target.value)} placeholder="Optional"/></div>
            <div><Lbl>Vehicle Source</Lbl>
              <select style={inp} value={form.vehicle_id} onChange={e=>set("vehicle_id",e.target.value)}>
                <option value="">None / Unknown</option>
                {vehicles.map(v=><option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><Lbl>Qty</Lbl><input style={inp} type="number" min={0} value={form.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
            <div><Lbl>Min Qty</Lbl><input style={inp} type="number" min={0} value={form.min_qty} onChange={e=>set("min_qty",e.target.value)}/></div>
            <div><Lbl>Location</Lbl><input style={inp} value={form.location} onChange={e=>set("location",e.target.value)} placeholder="Shelf A1"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>Selling Price</Lbl><input style={inp} type="number" min={0} value={form.price} onChange={e=>set("price",e.target.value)}/></div>
            <div><Lbl>Cost</Lbl><input style={inp} type="number" min={0} value={form.cost} onChange={e=>set("cost",e.target.value)}/></div>
          </div>
          <div><Lbl>Notes</Lbl><textarea style={{...inp,resize:"vertical"}} rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)}/></div>

          <ScrapPartPhotos
            urls={{photo_url:form.photo_url, photo_url_2:form.photo_url_2, photo_url_3:form.photo_url_3}}
            partId={p?.id}
            vin={vehicleVin}
            onChange={(key,url)=>set(key,url)}
          />

          {err&&<div style={{color:"var(--red)",fontSize:13}}>⚠ {err}</div>}
          <button className="btn btn-primary" style={{width:"100%",padding:12}} onClick={save} disabled={loading}>
            {loading?"Saving…":p?.id?"Save Changes":"Add Part"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vehicle detail ─────────────────────────────────────────────────
function VehicleDetail({vehicle, parts, allParts, scrapId, vehicles, onRefresh, onBack, onEditVehicle}) {
  const [editPart,      setEditPart]      = useState(null);
  const [addPart,       setAddPart]       = useState(false);
  const [showScan,      setShowScan]      = useState(false);
  const [editPhotos,    setEditPhotos]    = useState(false);
  const [lightbox,      setLightbox]      = useState(null);
  const [labelPart,     setLabelPart]     = useState(null); // {part, vehicle}
  const [printPart,     setPrintPart]     = useState(null); // part to prompt label print after save
  const [statusSaving,  setStatusSaving]  = useState(false);
  const [photos, setPhotos] = useState(Object.fromEntries(PHOTO_SLOTS.map(s=>[s.key, vehicle[s.key]||""])));

  const deletePart = async (p) => {
    if(!window.confirm(`Delete "${p.name}"?`)) return;
    await api.delete("scrapyard_parts","id",p.id).catch(()=>{});
    onRefresh();
  };

  const setVehicleStatus = async (status) => {
    setStatusSaving(true);
    await api.patch("scrapyard_vehicles","id",vehicle.id,{status}).catch(()=>{});
    await onRefresh();
    setStatusSaving(false);
  };

  const isStripping = vehicle.status === "Stripping";
  const color = STATUS_COLORS[vehicle.status]||"#9ca3af";
  const visiblePhotos = PHOTO_SLOTS.filter(s=>photos[s.key]);

  return (
    <div className="fu">
      {/* Vehicle header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Vehicles</button>
        <div style={{flex:1}}>
          <div style={{fontSize:17,fontWeight:700}}>{vehicle.year} {vehicle.make} {vehicle.model}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2,display:"flex",gap:10,flexWrap:"wrap"}}>
            {vehicle.color&&<span>{vehicle.color}</span>}
            {vehicle.reg&&<span>{vehicle.reg}</span>}
            {vehicle.vin&&<span>VIN: {vehicle.vin}</span>}
            {vehicle.engine_no&&<span>Eng: {vehicle.engine_no}</span>}
            {vehicle.odometer&&<span>{Number(vehicle.odometer).toLocaleString()} km</span>}
            <span style={{color,fontWeight:600}}>{vehicle.status}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEditVehicle}>✏️ Edit</button>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowScan(true)}>📷 Scan</button>
        {vehicle.status==="Available"&&(
          <button className="btn btn-sm" style={{background:"#fbbf24",color:"#000",fontWeight:700,border:"none",cursor:"pointer"}}
            disabled={statusSaving} onClick={()=>setVehicleStatus("Stripping")}>
            {statusSaving?"…":"▶ Start Stripping"}
          </button>
        )}
        {isStripping&&(
          <button className="btn btn-sm" style={{background:"#34d399",color:"#000",fontWeight:700,border:"none",cursor:"pointer"}}
            disabled={statusSaving} onClick={()=>setVehicleStatus("Stripped")}>
            {statusSaving?"…":"✅ Done Stripping"}
          </button>
        )}
        {isStripping&&(
          <button className="btn btn-primary btn-sm" onClick={()=>setAddPart(true)}>+ Add Part</button>
        )}
        {!isStripping&&(
          <button className="btn btn-ghost btn-sm" onClick={()=>setAddPart(true)}>+ Add Part</button>
        )}
      </div>

      {/* Stripping mode banner */}
      {isStripping&&(
        <div style={{background:"rgba(251,191,36,.15)",border:"2px solid #fbbf24",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🔧</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:"#b45309"}}>Stripping Mode Active</div>
            <div style={{fontSize:12,color:"#92400e"}}>Add parts as you remove them — each part gets an auto-number and a printable label.</div>
          </div>
          <button className="btn btn-primary btn-sm" style={{background:"#fbbf24",color:"#000",border:"none",fontWeight:700,flexShrink:0}} onClick={()=>setAddPart(true)}>+ Add Part</button>
        </div>
      )}

      {vehicle.notes&&(
        <div className="card" style={{padding:"10px 14px",marginBottom:12,fontSize:13,color:"var(--text2)"}}>{vehicle.notes}</div>
      )}

      {/* ── Search tools ── */}
      <div className="card" style={{marginBottom:12,padding:"10px 14px"}}>
        <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>🔍 Search Tools</div>
        {vehicle.vin&&(
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
            <span style={{fontSize:11,color:"var(--text3)",fontWeight:600,flexShrink:0}}>VIN:</span>
            <code style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{vehicle.vin}</code>
            <button onClick={()=>navigator.clipboard.writeText(vehicle.vin).then(()=>alert("VIN copied!"))}
              style={{fontSize:10,padding:"2px 7px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:5,cursor:"pointer",color:"var(--text3)",flexShrink:0}}>📋</button>
          </div>
        )}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {vehicle.vin&&<>
            <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(vehicle.vin)}`} target="_blank" rel="noopener noreferrer"
              style={{fontSize:11,fontWeight:600,color:"var(--blue)",background:"rgba(96,165,250,.13)",border:"1px solid rgba(96,165,250,.35)",borderRadius:99,padding:"3px 10px",textDecoration:"none",whiteSpace:"nowrap"}}>🔩 PartsOuq</a>
            <a href={`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(vehicle.vin)}`} target="_blank" rel="noopener noreferrer"
              style={{fontSize:11,fontWeight:600,color:"var(--yellow)",background:"rgba(251,191,36,.13)",border:"1px solid rgba(251,191,36,.35)",borderRadius:99,padding:"3px 10px",textDecoration:"none",whiteSpace:"nowrap"}}>🔎 VIN Decode</a>
            <a href={`https://en.17vin.com/vin/${encodeURIComponent(vehicle.vin)}`} target="_blank" rel="noopener noreferrer"
              style={{fontSize:11,fontWeight:600,color:"var(--text2)",background:"rgba(148,163,184,.13)",border:"1px solid rgba(148,163,184,.35)",borderRadius:99,padding:"3px 10px",textDecoration:"none",whiteSpace:"nowrap"}}>🆔 17VIN</a>
            <button onClick={()=>{navigator.clipboard.writeText(vehicle.vin);window.open(`https://www.autozoneonline.co.za/t/index?q=${encodeURIComponent(vehicle.vin)}`,"_blank");}}
              style={{fontSize:11,fontWeight:600,color:"#dc2626",background:"rgba(220,38,38,.12)",border:"1px solid rgba(220,38,38,.3)",borderRadius:99,padding:"3px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>🔴 AutoZone</button>
          </>}
          {vehicle.make&&(
            <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent([vehicle.make,vehicle.model].filter(Boolean).join(" "))}`} target="_blank" rel="noopener noreferrer"
              style={{fontSize:11,fontWeight:600,color:"var(--blue)",background:"rgba(96,165,250,.10)",border:"1px solid rgba(96,165,250,.25)",borderRadius:99,padding:"3px 10px",textDecoration:"none",whiteSpace:"nowrap"}}>🔩 POuq (model)</a>
          )}
          <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent([vehicle.year,vehicle.make,vehicle.model,"parts"].filter(Boolean).join(" "))}`} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,fontWeight:600,color:"#34d399",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:99,padding:"3px 10px",textDecoration:"none",whiteSpace:"nowrap"}}>🌐 Google</a>
          <button onClick={()=>{if(vehicle.vin)navigator.clipboard.writeText(vehicle.vin);window.open("https://www.amayama.com","_blank");}}
            style={{fontSize:11,fontWeight:600,color:"#0ea5e9",background:"rgba(14,165,233,.12)",border:"1px solid rgba(14,165,233,.3)",borderRadius:99,padding:"3px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>🔧 Amayama</button>
        </div>
      </div>

      {/* ── Vehicle photos ── */}
      <div className="card" style={{marginBottom:14}}>
        <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>📸 Vehicle Photos</div>
          <button
            onClick={()=>setEditPhotos(p=>!p)}
            style={{fontSize:11,padding:"3px 10px",background:editPhotos?"var(--accent)":"var(--surface2)",color:editPhotos?"#fff":"var(--text2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",fontWeight:600}}>
            {editPhotos?"✓ Done":"✏️ Edit Photos"}
          </button>
        </div>
        <div style={{padding:"12px 16px"}}>
          {editPhotos ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {PHOTO_SLOTS.map(({key,label})=>(
                <ScrapVehiclePhotoSlot
                  key={key}
                  label={label}
                  url={photos[key]}
                  vehicleId={vehicle.id}
                  vin={vehicle.vin}
                  photoKey={key}
                  onSaved={url=>setPhotos(p=>({...p,[key]:url}))}
                />
              ))}
            </div>
          ) : visiblePhotos.length>0 ? (
            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(visiblePhotos.length,3)},1fr)`,gap:6}}>
              {visiblePhotos.map(({key,label})=>(
                <div key={key} style={{position:"relative",borderRadius:7,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3",cursor:"zoom-in"}} onClick={()=>setLightbox(photos[key])}>
                  <img src={photos[key]} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.45)",color:"#fff",textAlign:"center",fontSize:9,padding:"2px 0",fontWeight:600}}>{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{fontSize:12,color:"var(--text3)"}}>
              No photos — tap{" "}
              <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>setEditPhotos(true)}>Edit Photos</span>
              {" "}to add
            </div>
          )}
        </div>
      </div>

      {/* ── Parts cards ── */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <b style={{fontSize:14}}>Parts ({parts.length})</b>
        </div>
        {parts.length===0 ? (
          <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>
            No parts added yet.{" "}
            <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>setAddPart(true)}>Add first part</span>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            {parts.map(p=>{
              const isLow  = p.quantity<=p.min_qty;
              const cc     = COND_COLORS[p.condition]||"#9ca3af";
              const photos = [p.photo_url,p.photo_url_2,p.photo_url_3].filter(Boolean);
              return (
                <div key={p.id} className="card" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  {/* Photo area */}
                  <div style={{background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
                    {photos.length>0 ? (
                      <div style={{display:"grid",gridTemplateColumns:`repeat(${photos.length},1fr)`,height:130}}>
                        {photos.map((url,i)=>(
                          <img key={i} src={toImgUrl(url)||url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRight:i<photos.length-1?"1px solid var(--border)":"none"}}/>
                        ))}
                      </div>
                    ) : (
                      <div style={{height:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:36,opacity:.15}}>🔩</span>
                      </div>
                    )}
                  </div>

                  {/* Details area */}
                  <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>{p.name}</div>
                    {p.part_number&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{p.part_number}</div>}

                    <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                      {p.condition&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4,background:`${cc}20`,color:cc}}>{p.condition}</span>}
                      {p.category&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:"var(--surface2)",color:"var(--text3)",border:"1px solid var(--border)"}}>{p.category}</span>}
                      {isLow&&<span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"rgba(180,83,9,.15)",color:"#b45309"}}>LOW</span>}
                    </div>

                    <div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:10,flexWrap:"wrap"}}>
                      <span>Qty: <b style={{color:isLow?"#b45309":"var(--text)"}}>{p.quantity}</b></span>
                      {p.price!=null&&<span><b>R {Number(p.price).toFixed(2)}</b></span>}
                    </div>
                    {p.location&&<div style={{fontSize:11,color:"var(--text3)"}}>📍 {p.location}</div>}

                    <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:2}}>
                      <button onClick={()=>window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(p.name+" "+[vehicle.make,vehicle.model].filter(Boolean).join(" "))}`,"_blank")}
                        style={{fontSize:9,padding:"2px 6px",background:"rgba(52,211,153,.10)",border:"1px solid rgba(52,211,153,.25)",borderRadius:99,color:"#34d399",cursor:"pointer",fontWeight:600}}>🌐 Google</button>
                    </div>

                    <div style={{display:"flex",gap:5,marginTop:"auto",paddingTop:8,borderTop:"1px solid var(--border)"}}>
                      <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>setLabelPart({part:p,vehicle})}>🏷️</button>
                      <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>setEditPart(p)}>✏️</button>
                      <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>deletePart(p)}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(addPart||editPart)&&(
        <PartModal
          p={editPart}
          scrapId={scrapId}
          vehicles={vehicles}
          defaultVehicleId={vehicle.id}
          onSave={async(savedPart)=>{
            setAddPart(false); setEditPart(null);
            await onRefresh();
            if(isStripping && savedPart) setPrintPart({part:savedPart, vehicle});
          }}
          onClose={()=>{setAddPart(false);setEditPart(null);}}
        />
      )}

      {/* Label print prompt after adding a part during stripping */}
      {printPart&&(
        <div className="modal-overlay" onClick={()=>setPrintPart(null)}>
          <div className="modal-box" style={{maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:10}}>🏷️</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Part Added!</div>
            <div style={{fontSize:13,color:"var(--text2)",marginBottom:4}}><b>{printPart.part.name}</b></div>
            <div style={{fontSize:13,color:"var(--text3)",marginBottom:18}}>Part No: <b>{printPart.part.part_number||printPart.part.id}</b></div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <button className="btn btn-primary" style={{minWidth:120}} onClick={()=>{setLabelPart({part:printPart.part,vehicle:printPart.vehicle});setPrintPart(null);}}>
                🏷️ Print Label
              </button>
              <button className="btn btn-ghost" onClick={()=>{setPrintPart(null);setAddPart(true);}}>
                + Add Next Part
              </button>
              <button className="btn btn-ghost btn-sm" style={{width:"100%"}} onClick={()=>setPrintPart(null)}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {showScan&&(
        <QrScanModal
          parts={allParts||parts}
          onFound={p=>{setShowScan(false);setEditPart(p);}}
          onClose={()=>setShowScan(false)}
        />
      )}

      {/* Lightbox */}
      {lightbox&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setLightbox(null)}>
          <img src={lightbox} alt="" style={{maxWidth:"95vw",maxHeight:"92vh",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,.6)"}}/>
          <button style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:6,color:"#fff",fontSize:22,cursor:"pointer",padding:"4px 10px"}} onClick={()=>setLightbox(null)}>✕</button>
        </div>
      )}

      {labelPart&&<PartLabelModal part={labelPart.part} vehicle={labelPart.vehicle} onClose={()=>setLabelPart(null)}/>}
    </div>
  );
}

// ── Vehicles page ──────────────────────────────────────────────────
export function ScrapyardVehiclesPage({scrapId, vehicles, parts, onRefresh}) {
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [editVeh,      setEditVeh]      = useState(null);
  const [selectedId,   setSelectedId]   = useState(null);
  const [deleting,     setDeleting]     = useState(null);
  const [refreshing,   setRefreshing]   = useState(false);

  const doRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const partsForVeh = (vid) => parts.filter(p=>Number(p.vehicle_id)===Number(vid));

  const filtered = useMemo(()=>vehicles.filter(v=>{
    const q=search.toLowerCase();
    const ms=!q||`${v.make} ${v.model} ${v.year} ${v.vin||""} ${v.color||""}`.toLowerCase().includes(q);
    const mst=statusFilter==="All"||v.status===statusFilter;
    return ms&&mst;
  }),[vehicles,search,statusFilter]);

  const deleteVehicle = async (v) => {
    if(!window.confirm(`Delete ${v.year||""} ${v.make} ${v.model}?\n\nParts linked to this vehicle will be unlinked.`)) return;
    setDeleting(v.id);
    await api.delete("scrapyard_vehicles","id",v.id).catch(()=>{});
    onRefresh(); setDeleting(null);
  };

  if(selectedId) {
    const veh=vehicles.find(v=>v.id===selectedId);
    if(!veh){setSelectedId(null);return null;}
    return (
      <VehicleDetail
        vehicle={veh}
        parts={partsForVeh(selectedId)}
        allParts={parts}
        scrapId={scrapId}
        vehicles={vehicles}
        onRefresh={onRefresh}
        onBack={()=>setSelectedId(null)}
        onEditVehicle={()=>setEditVeh(veh)}
      />
    );
  }

  const coverPhoto = (v) => v.photo_front||v.photo_rear||v.photo_left||v.photo_right||v.photo_interior||v.photo_engine||null;

  return (
    <div className="fu">
      {/* Toolbar */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input
          style={{flex:1,minWidth:180,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box"}}
          value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search make, model, VIN…"
        />
        <select
          style={{padding:"9px 10px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13}}
          value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option>All</option>
          {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} disabled={refreshing} title="Refresh">{refreshing?"⏳":"🔄"}</button>
        <button className="btn btn-primary" onClick={()=>setEditVeh({})}>+ Add Vehicle</button>
      </div>

      {/* Stats strip */}
      {vehicles.length>0&&(
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          {STATUS_OPTS.map(s=>{
            const n=vehicles.filter(v=>v.status===s).length; if(!n) return null;
            return(
              <div key={s} style={{padding:"5px 12px",borderRadius:20,background:`${STATUS_COLORS[s]}18`,color:STATUS_COLORS[s],fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${STATUS_COLORS[s]}30`}} onClick={()=>setStatusFilter(s===statusFilter?"All":s)}>
                {s}: {n}
              </div>
            );
          })}
        </div>
      )}

      {/* Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:14}}>
        {filtered.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:56,color:"var(--text3)"}}>
            {search||statusFilter!=="All"?"No vehicles match your filter.":"No vehicles yet. Add your first."}
          </div>
        )}
        {filtered.map(v=>{
          const vParts=partsForVeh(v.id);
          const color =STATUS_COLORS[v.status]||"#9ca3af";
          const cover =coverPhoto(v);
          return(
            <div key={v.id} className="card" style={{cursor:"pointer"}} onClick={()=>setSelectedId(v.id)}>
              {cover
                ? <img src={cover} alt="" style={{width:"100%",height:130,objectFit:"cover",borderRadius:"10px 10px 0 0"}}/>
                : <div style={{width:"100%",height:130,borderRadius:"10px 10px 0 0",background:"var(--surface2)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:"var(--text3)"}}>
                    <span style={{fontSize:32}}>🚗</span>
                    <span style={{fontSize:11}}>No photo</span>
                  </div>
              }
              <div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{v.year} {v.make} {v.model}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                      {v.reg&&<span>{v.reg}{(v.color||v.vin)?" · ":""}</span>}
                      {v.color&&<span>{v.color}{v.vin?" · ":""}</span>}
                      {v.vin&&<span>VIN: {v.vin}</span>}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:20,background:`${color}20`,color,whiteSpace:"nowrap",flexShrink:0}}>{v.status}</span>
                </div>
                <div style={{display:"flex",gap:14,marginTop:10,fontSize:12,color:"var(--text3)"}}>
                  <span>📦 {vParts.length} parts</span>
                  {v.odometer&&<span>{Number(v.odometer).toLocaleString()} km</span>}
                  {v.purchase_price&&<span>R {Number(v.purchase_price).toLocaleString()}</span>}
                </div>
              </div>
              <div style={{padding:"7px 14px",borderTop:"1px solid var(--border)",display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                {v.status==="Available"&&(
                  <button className="btn btn-xs" style={{background:"#fbbf24",color:"#000",fontWeight:700,border:"none",cursor:"pointer"}}
                    onClick={async()=>{
                      await api.patch("scrapyard_vehicles","id",v.id,{status:"Stripping"});
                      onRefresh();
                      setSelectedId(v.id);
                    }}>▶ Strip</button>
                )}
                {v.status==="Stripping"&&(
                  <button className="btn btn-xs" style={{background:"#fbbf24",color:"#000",fontWeight:700,border:"none",cursor:"pointer"}}
                    onClick={()=>setSelectedId(v.id)}>🔧 Continue Stripping</button>
                )}
                <button className="btn btn-ghost btn-xs" onClick={()=>{setEditVeh(v);setSelectedId(null);}}>✏️ Edit</button>
                <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} disabled={!!deleting} onClick={()=>deleteVehicle(v)}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {editVeh!==null&&(
        <VehicleModal
          v={editVeh?.id?editVeh:null}
          scrapId={scrapId}
          onSave={()=>{setEditVeh(null);onRefresh();}}
          onClose={()=>setEditVeh(null)}
        />
      )}
    </div>
  );
}

// ── Parts / Inventory page ─────────────────────────────────────────
export function ScrapyardPartsPage({scrapId, vehicles, parts, onRefresh}) {
  const [search,     setSearch]     = useState("");
  const [condFilter, setCondFilter] = useState("All");
  const [catFilter,  setCatFilter]  = useState("All");
  const [vehFilter,  setVehFilter]  = useState("All");
  const [editPart,   setEditPart]   = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showScan,   setShowScan]   = useState(false);
  const [labelPart,  setLabelPart]  = useState(null);

  const doRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const vehMap = useMemo(()=>Object.fromEntries(vehicles.map(v=>[v.id,v])),[vehicles]);
  const cats   = useMemo(()=>{ const s=new Set(parts.map(p=>p.category).filter(Boolean)); return ["All",...s]; },[parts]);

  const filtered = useMemo(()=>parts.filter(p=>{
    const q=search.toLowerCase();
    const ms=!q||`${p.name} ${p.part_number||""} ${p.category||""} ${p.location||""}`.toLowerCase().includes(q);
    const mc=condFilter==="All"||p.condition===condFilter;
    const mcat=catFilter==="All"||p.category===catFilter;
    const mv=vehFilter==="All"||(vehFilter===""?!p.vehicle_id:String(p.vehicle_id)===vehFilter);
    return ms&&mc&&mcat&&mv;
  }),[parts,search,condFilter,catFilter,vehFilter]);

  const lowStock = parts.filter(p=>p.quantity<=p.min_qty);

  const deletePart = async (p) => {
    if(!window.confirm(`Delete "${p.name}"?`)) return;
    await api.delete("scrapyard_parts","id",p.id).catch(()=>{});
    onRefresh();
  };

  const sel = {padding:"9px 10px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13};

  return (
    <div className="fu">
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input
          style={{flex:1,minWidth:160,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box"}}
          value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts…"
        />
        <select style={sel} value={condFilter} onChange={e=>setCondFilter(e.target.value)}>
          <option>All</option>
          {CONDITION_OPTS.map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={sel} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          {cats.map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={sel} value={vehFilter} onChange={e=>setVehFilter(e.target.value)}>
          <option value="All">All Vehicles</option>
          <option value="">No Vehicle</option>
          {vehicles.map(v=><option key={v.id} value={String(v.id)}>{v.year} {v.make} {v.model}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowScan(true)} title="Scan label">📷 Scan</button>
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} disabled={refreshing} title="Refresh">{refreshing?"⏳":"🔄"}</button>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Add Part</button>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",fontSize:13,color:"var(--text3)"}}>
        <span><b style={{color:"var(--text)"}}>{parts.length}</b> total parts</span>
        <span>·</span>
        {CONDITION_OPTS.map(c=>{
          const n=parts.filter(p=>p.condition===c).length; if(!n) return null;
          return <span key={c} style={{color:COND_COLORS[c]||"var(--text3)"}}>{c}: <b>{n}</b></span>;
        })}
        {lowStock.length>0&&<span style={{color:"#b45309"}}>⚠ {lowStock.length} low stock</span>}
      </div>

      {filtered.length===0 ? (
        <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No parts found.</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {filtered.map(p=>{
            const isLow  = p.quantity<=p.min_qty;
            const veh    = p.vehicle_id?vehMap[p.vehicle_id]:null;
            const cc     = COND_COLORS[p.condition]||"#9ca3af";
            const photos = [p.photo_url,p.photo_url_2,p.photo_url_3].filter(Boolean);
            return (
              <div key={p.id} className="card" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                {/* Photo area */}
                <div style={{background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
                  {photos.length>0 ? (
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${photos.length},1fr)`,height:130}}>
                      {photos.map((url,i)=>(
                        <img key={i} src={toImgUrl(url)||url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRight:i<photos.length-1?"1px solid var(--border)":"none"}}/>
                      ))}
                    </div>
                  ) : (
                    <div style={{height:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:36,opacity:.15}}>🔩</span>
                    </div>
                  )}
                </div>

                {/* Details area */}
                <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>{p.name}</div>
                  {p.part_number&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{p.part_number}</div>}

                  <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                    {p.condition&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4,background:`${cc}20`,color:cc}}>{p.condition}</span>}
                    {p.category&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:"var(--surface2)",color:"var(--text3)",border:"1px solid var(--border)"}}>{p.category}</span>}
                    {isLow&&<span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"rgba(180,83,9,.15)",color:"#b45309"}}>LOW</span>}
                  </div>

                  <div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:10,flexWrap:"wrap"}}>
                    <span>Qty: <b style={{color:isLow?"#b45309":"var(--text)"}}>{p.quantity}</b></span>
                    {p.price!=null&&<span><b>R {Number(p.price).toFixed(2)}</b></span>}
                  </div>
                  {p.location&&<div style={{fontSize:11,color:"var(--text3)"}}>📍 {p.location}</div>}
                  {veh&&<div style={{fontSize:11,color:"var(--text3)"}}>🚗 {[veh.year,veh.make,veh.model].filter(Boolean).join(" ")}</div>}

                  <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:2}}>
                    <button onClick={()=>window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(p.name+(veh?` ${veh.make} ${veh.model}`:""))}`,"_blank")}
                      style={{fontSize:9,padding:"2px 6px",background:"rgba(52,211,153,.10)",border:"1px solid rgba(52,211,153,.25)",borderRadius:99,color:"#34d399",cursor:"pointer",fontWeight:600}}>🌐 Google</button>
                  </div>

                  <div style={{display:"flex",gap:5,marginTop:"auto",paddingTop:8,borderTop:"1px solid var(--border)"}}>
                    <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>setLabelPart({part:p,vehicle:veh||null})}>🏷️</button>
                    <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>setEditPart(p)}>✏️</button>
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>deletePart(p)}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showAdd||editPart)&&(
        <PartModal
          p={editPart}
          scrapId={scrapId}
          vehicles={vehicles}
          onSave={()=>{setShowAdd(false);setEditPart(null);onRefresh();}}
          onClose={()=>{setShowAdd(false);setEditPart(null);}}
        />
      )}

      {showScan&&(
        <QrScanModal
          parts={parts}
          onFound={p=>{setShowScan(false);setEditPart(p);}}
          onClose={()=>setShowScan(false)}
        />
      )}

      {labelPart&&<PartLabelModal part={labelPart.part} vehicle={labelPart.vehicle} onClose={()=>setLabelPart(null)}/>}
    </div>
  );
}

// ── Admin: all scrapyards overview ─────────────────────────────────
export function ScrapyardAdminPage({vehicles, parts, profiles, users, onRefresh}) {
  const [search,       setSearch]       = useState("");
  const [companyFilter,setCompanyFilter]= useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected,     setSelected]     = useState(null); // {vehicle, companyName}
  const [refreshing,   setRefreshing]   = useState(false);

  // Build company name lookup: profile.id → name, fallback to users table
  const profileMap = Object.fromEntries(profiles.map(p=>[String(p.id), p.name||p.company_name||""]));
  const userMap    = Object.fromEntries(users.map(u=>[String(u.id), u.name||u.username||""]));
  const companyName = (scrapId) => {
    const id = String(scrapId);
    return profileMap[id] || userMap[id] || `Scrapyard #${scrapId}`;
  };

  const companies = ["All", ...Array.from(new Set(vehicles.map(v=>companyName(v.scrapyard_id)))).sort()];

  const filtered = vehicles.filter(v=>{
    if(companyFilter!=="All" && companyName(v.scrapyard_id)!==companyFilter) return false;
    if(statusFilter!=="All" && v.status!==statusFilter) return false;
    if(search.trim()){
      const h=`${v.make} ${v.model} ${v.year||""} ${v.reg||""} ${v.vin||""} ${companyName(v.scrapyard_id)}`.toLowerCase();
      if(!search.toLowerCase().split(/\s+/).every(w=>h.includes(w))) return false;
    }
    return true;
  });

  const doRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  if(selected) {
    const vehParts = parts.filter(p=>String(p.vehicle_id)===String(selected.vehicle.id));
    const photos   = PHOTO_SLOTS.map(s=>selected.vehicle[s.key]).filter(Boolean);
    return (
      <div className="fu">
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>← All Scrapyards</button>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700}}>{selected.vehicle.year} {selected.vehicle.make} {selected.vehicle.model}</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:"var(--accent)"}}>{selected.companyName}</span>
              {selected.vehicle.reg&&<span>{selected.vehicle.reg}</span>}
              {selected.vehicle.vin&&<span>VIN: {selected.vehicle.vin}</span>}
              <span style={{color:STATUS_COLORS[selected.vehicle.status]||"#9ca3af",fontWeight:600}}>{selected.vehicle.status}</span>
            </div>
          </div>
        </div>

        {photos.length>0&&(
          <div className="card" style={{marginBottom:12,padding:0,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(photos.length,3)},1fr)`,height:140}}>
              {photos.slice(0,3).map((url,i)=>(
                <img key={i} src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRight:i<Math.min(photos.length,3)-1?"1px solid var(--border)":"none"}}/>
              ))}
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap",fontSize:12,color:"var(--text2)"}}>
          {selected.vehicle.color&&<span>🎨 {selected.vehicle.color}</span>}
          {selected.vehicle.engine_no&&<span>🔧 Engine: {selected.vehicle.engine_no}</span>}
          {selected.vehicle.odometer&&<span>📍 {Number(selected.vehicle.odometer).toLocaleString()} km</span>}
          {selected.vehicle.purchase_price&&<span>💰 R {Number(selected.vehicle.purchase_price).toFixed(2)}</span>}
        </div>

        <div style={{marginBottom:8,fontWeight:700,fontSize:14}}>Parts ({vehParts.length})</div>
        {vehParts.length===0 ? (
          <div className="card" style={{padding:32,textAlign:"center",color:"var(--text3)"}}>No parts recorded for this vehicle.</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            {vehParts.map(p=>{
              const cc     = COND_COLORS[p.condition]||"#9ca3af";
              const photos2 = [p.photo_url,p.photo_url_2,p.photo_url_3].filter(Boolean);
              return (
                <div key={p.id} className="card" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  <div style={{background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
                    {photos2.length>0 ? (
                      <div style={{display:"grid",gridTemplateColumns:`repeat(${photos2.length},1fr)`,height:110}}>
                        {photos2.map((url,i)=>(
                          <img key={i} src={toImgUrl(url)||url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRight:i<photos2.length-1?"1px solid var(--border)":"none"}}/>
                        ))}
                      </div>
                    ) : (
                      <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:32,opacity:.15}}>🔩</span>
                      </div>
                    )}
                  </div>
                  <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
                    {p.part_number&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{p.part_number}</div>}
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {p.condition&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4,background:`${cc}20`,color:cc}}>{p.condition}</span>}
                      {p.category&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:"var(--surface2)",color:"var(--text3)",border:"1px solid var(--border)"}}>{p.category}</span>}
                    </div>
                    <div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:10}}>
                      <span>Qty: <b>{p.quantity}</b></span>
                      {p.price!=null&&<span><b>R {Number(p.price).toFixed(2)}</b></span>}
                    </div>
                    {p.location&&<div style={{fontSize:11,color:"var(--text3)"}}>📍 {p.location}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Summary stats
  const totalVehicles = vehicles.length;
  const totalParts    = parts.length;
  const stripping     = vehicles.filter(v=>v.status==="Stripping").length;
  const stripped      = vehicles.filter(v=>v.status==="Stripped").length;
  const companyCount  = new Set(vehicles.map(v=>String(v.scrapyard_id))).size;

  const sel={padding:"8px 10px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13};

  return (
    <div className="fu">
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:800}}>🚗 All Scrapyards</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{companyCount} companies · {totalVehicles} vehicles · {totalParts} parts</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} disabled={refreshing}>{refreshing?"⏳":"🔄"} Refresh</button>
      </div>

      {/* Stats pills */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[
          {label:"Available", color:"#34d399", count:vehicles.filter(v=>v.status==="Available").length},
          {label:"Stripping", color:"#fbbf24", count:stripping},
          {label:"Stripped",  color:"#9ca3af", count:stripped},
        ].map(s=>(
          <div key={s.label} style={{padding:"6px 14px",borderRadius:99,background:`${s.color}18`,border:`1px solid ${s.color}44`,fontSize:12,fontWeight:600,color:s.color,cursor:"pointer"}}
            onClick={()=>setStatusFilter(statusFilter===s.label?"All":s.label)}>
            {s.label}: {s.count}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <input style={{flex:1,minWidth:180,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box"}}
          value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search make, model, VIN, reg…"/>
        <select style={sel} value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}>
          {companies.map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={sel} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          {["All","Available","Stripping","Stripped","Sold","Written Off"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Vehicle grid */}
      {filtered.length===0 ? (
        <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No vehicles found.</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>
          {filtered.map(v=>{
            const color    = STATUS_COLORS[v.status]||"#9ca3af";
            const photo    = PHOTO_SLOTS.map(s=>v[s.key]).find(Boolean);
            const cn       = companyName(v.scrapyard_id);
            const vehParts = parts.filter(p=>String(p.vehicle_id)===String(v.id));
            return (
              <div key={v.id} className="card" style={{padding:0,overflow:"hidden",cursor:"pointer"}} onClick={()=>setSelected({vehicle:v,companyName:cn})}>
                {/* Photo */}
                <div style={{height:130,background:"var(--surface2)",position:"relative",overflow:"hidden"}}>
                  {photo ? (
                    <img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  ) : (
                    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}>
                      <svg width="48" height="28" viewBox="0 0 38 22" fill="none" style={{opacity:.15}}>
                        <rect x="1" y="9" width="36" height="11" rx="3" fill="currentColor"/>
                        <path d="M7 9L11 2h16l4 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <circle cx="9" cy="19" r="3" fill="var(--surface2)" stroke="currentColor" strokeWidth="1.5"/>
                        <circle cx="29" cy="19" r="3" fill="var(--surface2)" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                      <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".07em"}}>No Photo</span>
                    </div>
                  )}
                  {/* Company badge */}
                  <div style={{position:"absolute",top:8,left:8}}>
                    <span style={{fontSize:10,fontWeight:700,color:"#fff",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)",padding:"2px 8px",borderRadius:99,border:"1px solid rgba(255,255,255,.15)"}}>🏢 {cn}</span>
                  </div>
                  {/* Status badge */}
                  <div style={{position:"absolute",top:8,right:8}}>
                    <span style={{fontSize:10,fontWeight:700,color:color,background:`${color}22`,border:`1px solid ${color}55`,padding:"2px 8px",borderRadius:99}}>{v.status}</span>
                  </div>
                </div>

                {/* Details */}
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontWeight:700,fontSize:14}}>{v.year} {v.make} {v.model}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {v.reg&&<span>{v.reg}</span>}
                    {v.color&&<span>{v.color}</span>}
                  </div>
                  <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--text3)"}}>📦 {vehParts.length} part{vehParts.length!==1?"s":""}</span>
                    {v.vin&&<span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>VIN: {v.vin}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Admin: all scrapyard parts overview ────────────────────────────
export function ScrapyardPartsAdminPage({vehicles, parts, profiles, users, onRefresh}) {
  const [search,       setSearch]       = useState("");
  const [companyFilter,setCompanyFilter]= useState("All");
  const [condFilter,   setCondFilter]   = useState("All");
  const [catFilter,    setCatFilter]    = useState("All");
  const [refreshing,   setRefreshing]   = useState(false);

  const profileMap  = Object.fromEntries(profiles.map(p=>[String(p.id), p.name||p.company_name||""]));
  const userMap     = Object.fromEntries(users.map(u=>[String(u.id), u.name||u.username||""]));
  const companyName = (scrapId) => {
    const id = String(scrapId);
    return profileMap[id] || userMap[id] || `Scrapyard #${scrapId}`;
  };
  const vehMap = Object.fromEntries(vehicles.map(v=>[String(v.id), v]));

  const companies = ["All", ...Array.from(new Set(parts.map(p=>companyName(p.scrapyard_id)))).sort()];
  const conditions = ["All", ...CONDITION_OPTS];
  const cats = ["All", ...Array.from(new Set(parts.map(p=>p.category).filter(Boolean))).sort()];

  const filtered = parts.filter(p=>{
    if(companyFilter!=="All" && companyName(p.scrapyard_id)!==companyFilter) return false;
    if(condFilter!=="All" && p.condition!==condFilter) return false;
    if(catFilter!=="All" && p.category!==catFilter) return false;
    if(search.trim()){
      const veh = vehMap[String(p.vehicle_id)];
      const h=`${p.name} ${p.part_number||""} ${p.category||""} ${p.condition||""} ${companyName(p.scrapyard_id)} ${veh?`${veh.make} ${veh.model}`:""}`.toLowerCase();
      if(!search.toLowerCase().split(/\s+/).every(w=>h.includes(w))) return false;
    }
    return true;
  });

  const doRefresh = async () => { setRefreshing(true); try{await onRefresh();}finally{setRefreshing(false);} };

  const sel={padding:"8px 10px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13};

  return (
    <div className="fu">
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:800}}>📦 All Parts</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{parts.length} parts across {new Set(parts.map(p=>String(p.scrapyard_id))).size} companies</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} disabled={refreshing}>{refreshing?"⏳":"🔄"} Refresh</button>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <input style={{flex:1,minWidth:180,padding:"9px 12px",borderRadius:8,border:"1.5px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,boxSizing:"border-box"}}
          value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search part name, number, vehicle…"/>
        <select style={sel} value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}>
          {companies.map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={sel} value={condFilter} onChange={e=>setCondFilter(e.target.value)}>
          {conditions.map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={sel} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          {cats.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>{filtered.length} result{filtered.length!==1?"s":""}</div>

      {filtered.length===0 ? (
        <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No parts found.</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
          {filtered.map(p=>{
            const cc     = COND_COLORS[p.condition]||"#9ca3af";
            const photos = [p.photo_url,p.photo_url_2,p.photo_url_3].filter(Boolean);
            const veh    = vehMap[String(p.vehicle_id)];
            const cn     = companyName(p.scrapyard_id);
            return (
              <div key={p.id} className="card" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                {/* Photo area */}
                <div style={{background:"var(--surface2)",borderBottom:"1px solid var(--border)",position:"relative"}}>
                  {photos.length>0 ? (
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${photos.length},1fr)`,height:120}}>
                      {photos.map((url,i)=>(
                        <img key={i} src={toImgUrl(url)||url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRight:i<photos.length-1?"1px solid var(--border)":"none"}}/>
                      ))}
                    </div>
                  ) : (
                    <div style={{height:90,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:32,opacity:.15}}>🔩</span>
                    </div>
                  )}
                  {/* Company badge */}
                  <div style={{position:"absolute",bottom:6,left:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:"#fff",background:"rgba(0,0,0,.65)",backdropFilter:"blur(4px)",padding:"2px 7px",borderRadius:99,border:"1px solid rgba(255,255,255,.15)"}}>🏢 {cn}</span>
                  </div>
                </div>

                {/* Details area */}
                <div style={{padding:"10px 12px",flex:1,display:"flex",flexDirection:"column",gap:5}}>
                  <div style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>{p.name}</div>
                  {p.part_number&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{p.part_number}</div>}

                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {p.condition&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4,background:`${cc}20`,color:cc}}>{p.condition}</span>}
                    {p.category&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background:"var(--surface2)",color:"var(--text3)",border:"1px solid var(--border)"}}>{p.category}</span>}
                  </div>

                  <div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:10,flexWrap:"wrap"}}>
                    <span>Qty: <b>{p.quantity}</b></span>
                    {p.price!=null&&<span><b>R {Number(p.price).toFixed(2)}</b></span>}
                  </div>

                  {veh&&<div style={{fontSize:11,color:"var(--text3)"}}>🚗 {[veh.year,veh.make,veh.model].filter(Boolean).join(" ")}</div>}
                  {p.location&&<div style={{fontSize:11,color:"var(--text3)"}}>📍 {p.location}</div>}

                  <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:2}}>
                    <button onClick={()=>window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(p.name+(veh?` ${veh.make} ${veh.model}`:""))}`,"_blank")}
                      style={{fontSize:9,padding:"2px 6px",background:"rgba(52,211,153,.10)",border:"1px solid rgba(52,211,153,.25)",borderRadius:99,color:"#34d399",cursor:"pointer",fontWeight:600}}>🌐 Google</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

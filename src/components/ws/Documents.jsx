import { useState, useRef } from "react";
import { FL, FD } from "../shared.jsx";

export function WsDocumentsPage({docs=[],settings,onSave,onDelete}) {
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

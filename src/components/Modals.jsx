import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { api, SUPABASE_URL, SUPABASE_KEY, uploadToStorage } from "../lib/api.js";
import { C, curSym, getSettings } from "../lib/settings.js";
import { T, tSt, registerLang } from "../lib/i18n.js";
import { fmtAmt, fmtDT, fmtD, makeId, today, toImgUrl, toFullUrl, toLogoUrl, detectGeoLocation, waLink, mailLink, openPartLabelsWindow, openShelfLabelWindow } from "../lib/helpers.js";
import { CAR_MAKES, getCategories, DEFAULT_CATS, OC } from "../lib/constants.js";
import { CSS } from "../styles.js";
import { ErrorBoundary, LogoSVG, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "../components/shared.jsx";
import { PartPhotoUploader, VehicleFitmentTab } from "./RfqVehicles.jsx";

const FormError = ({errors,k}) => errors[k] ? <div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {errors[k]}</div> : null;

// ── Opposite-side part helpers ──────────────────────────────────────────────
const _LR_MAP = {
  'Left':'Right','Right':'Left','left':'right','right':'left','LEFT':'RIGHT','RIGHT':'LEFT',
  'LH':'RH','RH':'LH',
  '左':'右','右':'左',
  'Driver':'Passenger','Passenger':'Driver','driver':'passenger','passenger':'driver','DRIVER':'PASSENGER','PASSENGER':'DRIVER',
};
const _LR_RE = /(?<![A-Za-z])(Left|Right|left|right|LEFT|RIGHT|LH|RH|Driver|Passenger|driver|passenger|DRIVER|PASSENGER)(?![A-Za-z])|左|右/g;
// _SINGLE_LR: swap terminal L/R in SKU codes (e.g. 054GL→054GR, 089BHL→089BHR)
// Requires digit before letters, and letter before L/R is not itself L or R to avoid double-swapping LH/RH
const _SINGLE_LR_RE = /(?:(?<=\d[A-KM-QS-Za-km-qs-z])[LRlr]|(?<=\d[A-Za-z][A-KM-QS-Za-km-qs-z])[LRlr])(?=[^A-Za-z]|$)/g;
// Also swap L/R when directly after a digit, followed by non-H letters (e.g. 201RLE→201LLE)
// Excludes H suffix to avoid double-swapping after _LR_MAP already handled LH/RH
const _DIGIT_LR_RE = /(?<=\d)[LRlr](?=[A-GI-QS-Za-gi-qs-z][A-Za-z]{0,2}(?:[^A-Za-z]|$))/g;
const _swapChar = c => c==='L'?'R':c==='R'?'L':c==='l'?'r':'l';
function swapLR(str){
  return (str||"")
    .replace(_LR_RE, m => _LR_MAP[m]||m)
    .replace(_SINGLE_LR_RE, _swapChar)
    .replace(_DIGIT_LR_RE, _swapChar);
}
function detectSide(sku, name) {
  const s=(sku||"").toUpperCase(), n=(name||"").toUpperCase();
  if(/(?<![A-Za-z])LH(?![A-Za-z])/.test(s)||/(-L$|-L-)/.test(s)||/\d[A-KM-QS-Z]L(?=[^A-Z]|$)/.test(s)) return 'L';
  if(/(?<![A-Za-z])RH(?![A-Za-z])/.test(s)||/(-R$|-R-)/.test(s)||/\d[A-KM-QS-Z]R(?=[^A-Z]|$)/.test(s)) return 'R';
  if(/\bLEFT\b/.test(n)||/\bLH\b/.test(n)||/左/.test(name||"")||/\bDRIVER\b/.test(n)) return 'L';
  if(/\bRIGHT\b/.test(n)||/\bRH\b/.test(n)||/右/.test(name||"")||/\bPASSENGER\b/.test(n)) return 'R';
  return null;
}

export function WorkshopProfilePage({profile,onSave,wsRole="main",wsId,branches=[],user=null}) {
  const [pTab,setPTab]=useState("profile"); // "profile" | "users"
  const [f,setF]=useState({
    name:"", vat_number:"", tax_rate:0, phone:"", whatsapp:"", email:"",
    address:"", website:"", logo_url:"", logo_data:"", currency:"ZAR R", city:"", country:"",
    licence_renewal_agent_name:"", licence_renewal_agent_phone:"", default_markup_pct:0, move_pin:"",
    label_width_mm:98, label_height_mm:45, linked_branch_id:"",
    part_label_w:98, part_label_h:45, shelf_label_w:70, shelf_label_h:45,
    ...profile
  });
  const [saving,setSaving]=useState(false);
  const [detectingLoc,setDetectingLoc]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef(null);
  // Workshop users state
  const [wsUsers,setWsUsers]=useState([]);
  const [loadingUsers,setLoadingUsers]=useState(false);
  const [userForm,setUserForm]=useState(null); // null | {id,username,password,name,ws_role,is_active}
  const [savingUser,setSavingUser]=useState(false);
  const [userErr,setUserErr]=useState("");

  useEffect(()=>{ setF(p=>({...p,...profile})); },[profile]);

  const loadWsUsers=useCallback(async()=>{
    if(!wsId) return;
    setLoadingUsers(true);
    const res=await api.get("workshop_users",`workshop_id=eq.${wsId}&order=id.asc&select=*`);
    setWsUsers(Array.isArray(res)?res:[]);
    setLoadingUsers(false);
  },[wsId]);
  useEffect(()=>{ if(pTab==="users"&&wsRole==="main") loadWsUsers(); },[pTab, wsRole, loadWsUsers]);

  const saveWsUser=async()=>{
    if(!userForm?.username||!userForm?.ws_role){setUserErr("Username and role required");return;}
    if(!userForm.id&&!userForm.password){setUserErr("Password required for new user");return;}
    setSavingUser(true);setUserErr("");
    try{
      if(userForm.id){
        const upd={username:userForm.username,name:userForm.name||"",ws_role:userForm.ws_role,is_active:userForm.is_active};
        if(userForm.password) upd.password=userForm.password;
        await api.patch("workshop_users","id",userForm.id,upd);
      } else {
        await api.insert("workshop_users",{workshop_id:wsId,username:userForm.username,password:userForm.password,name:userForm.name||"",ws_role:userForm.ws_role,is_active:true});
      }
      await loadWsUsers();
      setUserForm(null);
    }catch(e){setUserErr("Save failed: "+e.message);}
    setSavingUser(false);
  };

  const deleteWsUser=async(id)=>{
    if(!window.confirm("Delete this user?")) return;
    await api.delete("workshop_users","id",id);
    setWsUsers(p=>p.filter(u=>u.id!==id));
  };

  const s=(k,v)=>setF(p=>({...p,[k]:v}));

  const handleFile=(file)=>{
    if(!file||!file.type.startsWith("image/")) return;
    const MAX=800;
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        let w=img.width,h=img.height;
        if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        s("logo_data",canvas.toDataURL("image/png",0.85));
        s("logo_url","");
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const save=async()=>{
    setSaving(true);
    await onSave(f);
    setSaving(false);
  };

  const logoSrc=f.logo_url||f.logo_data;

  return (
    <div className="fu" style={{maxWidth:560}}>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:16}}>⚙️ Workshop Settings</h1>

      {wsRole==="main"&&(
        <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:20,gap:0}}>
          {[["profile","⚙️ Profile"],["users","👥 Workshop Users"]].map(([id,lb])=>(
            <button key={id} onClick={()=>setPTab(id)}
              style={{padding:"9px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:pTab===id?700:400,
                color:pTab===id?"var(--accent)":"var(--text2)",borderBottom:pTab===id?"2px solid var(--accent)":"2px solid transparent",marginBottom:-1}}>
              {lb}
            </button>
          ))}
        </div>
      )}

      {pTab==="users"&&wsRole==="main"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:600}}>Manage who can log in to your workshop</div>
            <button className="btn btn-primary btn-sm" onClick={()=>setUserForm({username:"",password:"",name:"",ws_role:"mechanic",is_active:true})}>+ Add User</button>
          </div>
          {loadingUsers&&<div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>Loading...</div>}
          {!loadingUsers&&wsUsers.length===0&&<div className="card" style={{textAlign:"center",padding:24,color:"var(--text3)"}}>No sub-users yet. Add mechanics or managers.</div>}
          {wsUsers.map(u=>(
            <div key={u.id} className="card" style={{padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontWeight:600,fontSize:14}}>{u.name||u.username}</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>@{u.username}</div>
              </div>
              <span className="badge" style={{
                background:u.ws_role==="manager"?"rgba(139,92,246,.12)":u.ws_role==="mechanic"?"rgba(96,165,250,.12)":"rgba(249,115,22,.12)",
                color:u.ws_role==="manager"?"#8b5cf6":u.ws_role==="mechanic"?"var(--blue)":"#f97316",
                fontSize:12
              }}>
                {u.ws_role==="manager"?"👔 Manager":u.ws_role==="mechanic"?"🔧 Mechanic":"👑 Main"}
              </span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:5,
                background:u.is_active?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)",
                color:u.is_active?"var(--green)":"var(--red)"}}>
                {u.is_active?"Active":"Inactive"}
              </span>
              <div style={{display:"flex",gap:6}}>
                <button className="btn btn-ghost btn-xs" onClick={()=>setUserForm({...u,password:""})}>✏️ Edit</button>
                <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>deleteWsUser(u.id)}>🗑️</button>
              </div>
            </div>
          ))}
          {userForm&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <div className="card" style={{width:"100%",maxWidth:400,padding:24,display:"flex",flexDirection:"column",gap:14}}>
                <h2 style={{fontSize:16,fontWeight:700,marginBottom:4}}>{userForm.id?"Edit User":"Add Workshop User"}</h2>
                <div><FL label="Display Name"/><input className="inp" value={userForm.name} onChange={e=>setUserForm(p=>({...p,name:e.target.value}))} placeholder="e.g. John Smith"/></div>
                <div><FL label="Username *"/><input className="inp" value={userForm.username} onChange={e=>setUserForm(p=>({...p,username:e.target.value}))} placeholder="e.g. john_mech" autoCapitalize="none"/></div>
                <div><FL label={userForm.id?"New Password (leave blank to keep)":"Password *"}/><input className="inp" type="password" value={userForm.password} onChange={e=>setUserForm(p=>({...p,password:e.target.value}))}/></div>
                <div>
                  <FL label="Role *"/>
                  <select className="inp" value={userForm.ws_role} onChange={e=>setUserForm(p=>({...p,ws_role:e.target.value}))}>
                    <option value="mechanic">🔧 Mechanic (jobs + checklist only)</option>
                    <option value="manager">👔 Manager (full workshop access)</option>
                  </select>
                </div>
                {userForm.id&&(
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <input type="checkbox" id="ua" checked={userForm.is_active} onChange={e=>setUserForm(p=>({...p,is_active:e.target.checked}))}/>
                    <label htmlFor="ua" style={{fontSize:13}}>Active (can login)</label>
                  </div>
                )}
                {userErr&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {userErr}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-primary" style={{flex:1}} onClick={saveWsUser} disabled={savingUser}>{savingUser?"Saving...":"✅ Save"}</button>
                  <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setUserForm(null);setUserErr("");}}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {pTab==="profile"&&<div className="card" style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
        {/* Logo */}
        <div>
          <FL label="Workshop Logo"/>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{border:`2px dashed ${dragOver?"var(--accent)":"var(--border)"}`,borderRadius:10,padding:16,textAlign:"center",
            cursor:"pointer",transition:"all .15s",background:dragOver?"rgba(251,146,60,.06)":"var(--surface2)",marginBottom:8}}
            onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}>
            {logoSrc
              ? <img src={logoSrc} alt="logo" style={{maxHeight:70,maxWidth:220,objectFit:"contain"}}/>
              : <div style={{color:"var(--text3)",fontSize:13}}>📁 Click or drag image to upload logo</div>}
          </div>
          {logoSrc&&<button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{s("logo_data","");s("logo_url","");}}>✕ Remove logo</button>}
          <div style={{marginTop:8}}>
            <FL label="Or paste Google Drive / URL"/>
            <input className="inp" value={f.logo_url} onChange={e=>{s("logo_url",e.target.value);s("logo_data","");}} placeholder="https://..."/>
          </div>
        </div>

        {/* Locked spare shop banner — only shown when registered via QR */}
        {user?.spare_shop_name&&(
          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(37,99,235,.07)",border:"1px solid rgba(37,99,235,.2)",borderRadius:10,padding:"10px 14px",marginBottom:4}}>
            <span style={{fontSize:16}}>🏪</span>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:"rgba(37,99,235,.7)",textTransform:"uppercase",letterSpacing:".06em"}}>Spare Shop Partner (locked)</div>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{user.spare_shop_name}</div>
            </div>
            <span style={{marginLeft:"auto",fontSize:12}}>🔒</span>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><FL label="Workshop Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. ABC Auto Workshop"/></div>
          <div><FL label="VAT / Tax Number"/><input className="inp" value={f.vat_number} onChange={e=>s("vat_number",e.target.value)}/></div>
          <div><FL label="Tax Rate (%)"/><input className="inp" type="number" value={f.tax_rate} onChange={e=>s("tax_rate",+e.target.value||0)} placeholder="15"/></div>
          <div><FL label="Website"/><input className="inp" value={f.website} onChange={e=>s("website",e.target.value)} placeholder="https://..."/></div>
          <div><FL label="Phone"/><input className="inp" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="+27..."/></div>
          <div><FL label="WhatsApp"/><input className="inp" value={f.whatsapp} onChange={e=>s("whatsapp",e.target.value)} placeholder="+27..."/></div>
          <div style={{gridColumn:"1/-1"}}><FL label="Email"/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}><FL label="Address"/><textarea className="inp" rows={3} value={f.address} onChange={e=>s("address",e.target.value)} style={{resize:"vertical"}}/></div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <FL label="City & Country"/>
              <button type="button" className="btn btn-ghost btn-xs" disabled={detectingLoc} onClick={async()=>{
                setDetectingLoc(true);
                try{const loc=await detectGeoLocation();s("city",loc.city);s("country",loc.country);}catch{/* ignore geo detection errors */}
                setDetectingLoc(false);
              }} style={{fontSize:11,padding:"3px 9px"}}>
                {detectingLoc?"Detecting...":"📍 Auto-detect"}
              </button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <input className="inp" value={f.city||""} onChange={e=>s("city",e.target.value)} placeholder="City"/>
              <input className="inp" value={f.country||""} onChange={e=>s("country",e.target.value)} placeholder="Country"/>
            </div>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <FL label="Currency"/>
            <select className="inp" value={f.currency||"ZAR R"} onChange={e=>s("currency",e.target.value)}>
              {["ZAR R","USD $","EUR €","GBP £","TWD NT$","CNY ¥","JPY ¥","AUD A$","CAD C$","SGD S$","MYR RM","THB ฿","INR ₹","AED د.إ","NGN ₦","KES KSh","GHS GH₵"].map(c=>(
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <FL label="Default Markup %"/>
            <input className="inp" type="number" min="0" step="0.1" value={f.default_markup_pct??0} onChange={e=>s("default_markup_pct",+e.target.value)} placeholder="0"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Auto-applied when a supplier cost is tapped in Parts &amp; Labour</div>
          </div>
          <div>
            <FL label="🔒 Move Job PIN"/>
            <input className="inp" type="password" value={f.move_pin||""} onChange={e=>s("move_pin",e.target.value)} placeholder="Set a PIN to restrict Move"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Only users who enter this PIN can move jobs between workshops. Leave blank to disable.</div>
          </div>
        </div>

        {/* Label Sizes */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🏷️ Label Sizes</div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>Job / Workshop label (used on job cards)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <FL label="Width (mm)"/>
                <input className="inp" type="number" min="50" max="200" step="1"
                  value={f.label_width_mm||98} onChange={e=>s("label_width_mm",Number(e.target.value)||98)}/>
              </div>
              <div>
                <FL label="Height (mm)"/>
                <input className="inp" type="number" min="20" max="120" step="1"
                  value={f.label_height_mm||45} onChange={e=>s("label_height_mm",Number(e.target.value)||45)}/>
              </div>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>Part / inventory label (spare shop, stock)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <FL label="Width (mm)"/>
                <input className="inp" type="number" min="20" max="300" step="1"
                  value={f.part_label_w||98} onChange={e=>s("part_label_w",Number(e.target.value)||98)}/>
              </div>
              <div>
                <FL label="Height (mm)"/>
                <input className="inp" type="number" min="15" max="200" step="1"
                  value={f.part_label_h||45} onChange={e=>s("part_label_h",Number(e.target.value)||45)}/>
              </div>
            </div>
          </div>
          <div>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>Shelf / bin label</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <FL label="Width (mm)"/>
                <input className="inp" type="number" min="20" max="300" step="1"
                  value={f.shelf_label_w||70} onChange={e=>s("shelf_label_w",Number(e.target.value)||70)}/>
              </div>
              <div>
                <FL label="Height (mm)"/>
                <input className="inp" type="number" min="15" max="200" step="1"
                  value={f.shelf_label_h||45} onChange={e=>s("shelf_label_h",Number(e.target.value)||45)}/>
              </div>
            </div>
          </div>
        </div>

        {/* Licence Renewal Agent */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><FL label="🪪 Renewal Agent Name"/><input className="inp" value={f.licence_renewal_agent_name||""} onChange={e=>s("licence_renewal_agent_name",e.target.value)} placeholder="e.g. ABC Renewals"/></div>
          <div>
            <FL label="🪪 Renewal Agent WhatsApp"/>
            <input className="inp" value={f.licence_renewal_agent_phone||""} onChange={e=>s("licence_renewal_agent_phone",e.target.value)} placeholder="27821234567"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Country code, no + or spaces</div>
          </div>
        </div>

        {/* Subscription info card */}
        {(profile?.trial_start||profile?.subscription_status||profile?.subscription_expires_at)&&(()=>{
          const today=new Date(); today.setHours(0,0,0,0);
          const exp=profile.subscription_expires_at?new Date(profile.subscription_expires_at):null;
          if(exp) exp.setHours(0,0,0,0);
          const daysLeft=exp?Math.ceil((exp-today)/(1000*60*60*24)):null;
          const expired=daysLeft!==null&&daysLeft<0;
          const statusColors={trial:"var(--blue)",active:"var(--green)",expired:"var(--red)",suspended:"var(--red)"};
          const sc=statusColors[profile.subscription_status]||"var(--text3)";
          return (
            <div style={{border:`1px solid ${sc}40`,borderRadius:10,padding:16,background:`${sc}08`,marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:sc}}>📋 Account & Subscription</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
                <div><span style={{color:"var(--text3)"}}>Status:</span><br/><strong style={{color:sc}}>{(profile.subscription_status||"—").toUpperCase()}</strong></div>
                <div><span style={{color:"var(--text3)"}}>Registered:</span><br/><strong>{profile.trial_start||"—"}</strong></div>
                <div><span style={{color:"var(--text3)"}}>Expires:</span><br/><strong style={{color:expired?"var(--red)":undefined}}>{profile.subscription_expires_at||"—"}</strong></div>
                <div><span style={{color:"var(--text3)"}}>Days Left:</span><br/><strong style={{color:expired?"var(--red)":daysLeft!==null&&daysLeft<=7?"var(--yellow)":"var(--green)"}}>
                  {daysLeft===null?"—":expired?`Expired ${Math.abs(daysLeft)}d ago`:daysLeft===0?"Today":daysLeft===1?"1 day":`${daysLeft} days`}
                </strong></div>
                <div><span style={{color:"var(--text3)"}}>City:</span><br/><strong>{profile.city||"—"}</strong></div>
                <div><span style={{color:"var(--text3)"}}>Country:</span><br/><strong>{profile.country||"—"}</strong></div>
              </div>
            </div>
          );
        })()}

        {branches.length>0&&(
          <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>🏪 Linked Spare Parts Shop</div>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Link to a spare parts branch so your workshop can browse their stock and place orders directly.</div>
            <select className="inp" value={f.linked_branch_id||""} onChange={e=>s("linked_branch_id",e.target.value)}>
              <option value="">— Not linked —</option>
              {branches.map(b=>(
                <option key={b.id} value={b.id}>{b.name}{b.is_main?" (Main)":""}</option>
              ))}
            </select>
            {f.linked_branch_id&&<div style={{fontSize:11,color:"var(--green)",marginTop:4}}>✓ Linked to {branches.find(b=>b.id===f.linked_branch_id)?.name||f.linked_branch_id}</div>}
          </div>
        )}

        <button className="btn btn-primary" style={{padding:13,fontSize:15}} onClick={save} disabled={saving}>
          {saving?"Saving...":"✅ Save Settings"}
        </button>
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCRAPYARD PROFILE / SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════
export function ScrapyardProfilePage({profile, onSave}) {
  const [f, setF] = useState({
    name:"", phone:"", email:"", address:"", website:"",
    logo_url:"", logo_data:"", currency:"ZAR R", city:"", country:"",
    vat_number:"", vat_rate:15,
    label_width_mm:98, label_height_mm:45,
    spare_shop_mode:false,
    ...profile
  });
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  useEffect(()=>{ setF(p=>({...p,...profile})); },[profile]);

  const handleFile = (file) => {
    if(!file||!file.type.startsWith("image/")) return;
    const MAX=800;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w=img.width, h=img.height;
        if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
        canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        s("logo_data", canvas.toDataURL("image/png",0.85));
        s("logo_url","");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    await onSave(f);
    setSaving(false);
  };

  const logoSrc = f.logo_url || f.logo_data;

  return (
    <div className="fu" style={{maxWidth:560}}>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:16}}>⚙️ Scrapyard Settings</h1>

      <div className="card" style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
        {/* Logo */}
        <div>
          <FL label="Scrapyard Logo"/>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{border:`2px dashed ${dragOver?"var(--accent)":"var(--border)"}`,borderRadius:10,padding:16,textAlign:"center",
            cursor:"pointer",transition:"all .15s",background:dragOver?"rgba(251,146,60,.06)":"var(--surface2)",marginBottom:8}}
            onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}>
            {logoSrc
              ? <img src={logoSrc} alt="logo" style={{maxHeight:70,maxWidth:220,objectFit:"contain"}}/>
              : <div style={{color:"var(--text3)",fontSize:13}}>📁 Click or drag image to upload logo</div>}
          </div>
          {logoSrc&&<button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{s("logo_data","");s("logo_url","");}}>✕ Remove</button>}
          <div style={{marginTop:8}}>
            <FL label="Or paste Google Drive / URL"/>
            <input className="inp" value={f.logo_url} onChange={e=>{s("logo_url",e.target.value);s("logo_data","");}} placeholder="https://..."/>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><FL label="Scrapyard Name *"/><input className="inp" value={f.name||""} onChange={e=>s("name",e.target.value)} placeholder="e.g. ABC Auto Salvage"/></div>
          <div><FL label="Phone"/><input className="inp" value={f.phone||""} onChange={e=>s("phone",e.target.value)} placeholder="+27..."/></div>
          <div><FL label="Email"/><input className="inp" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}><FL label="Website"/><input className="inp" value={f.website||""} onChange={e=>s("website",e.target.value)} placeholder="https://..."/></div>
          <div style={{gridColumn:"1/-1"}}><FL label="Address"/><textarea className="inp" rows={2} value={f.address||""} onChange={e=>s("address",e.target.value)} style={{resize:"vertical"}}/></div>
          <div><FL label="City"/><input className="inp" value={f.city||""} onChange={e=>s("city",e.target.value)}/></div>
          <div><FL label="Country"/><input className="inp" value={f.country||""} onChange={e=>s("country",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}>
            <FL label="Currency"/>
            <select className="inp" value={f.currency||"ZAR R"} onChange={e=>s("currency",e.target.value)}>
              {["ZAR R","USD $","EUR €","GBP £","TWD NT$","CNY ¥","JPY ¥","AUD A$","CAD C$","SGD S$","MYR RM","THB ฿","INR ₹","AED د.إ","NGN ₦","KES KSh","GHS GH₵"].map(c=>(
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* VAT */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🧾 VAT / Tax</div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Enter your VAT registration number to enable VAT. All invoices will automatically show a VAT breakdown.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"1/-1"}}>
              <FL label="VAT Registration Number"/>
              <input className="inp" value={f.vat_number||""} onChange={e=>s("vat_number",e.target.value)} placeholder="e.g. 4670123456 — leave blank to disable VAT"/>
            </div>
            <div>
              <FL label="VAT Rate (%)"/>
              <input className="inp" type="number" min="0" max="100" step="0.1"
                value={f.vat_rate??15} onChange={e=>s("vat_rate",parseFloat(e.target.value)||0)}/>
            </div>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:4}}>
              {f.vat_number
                ? <span style={{fontSize:12,color:"var(--green)",fontWeight:600}}>✅ VAT active — {f.vat_rate??15}% will be added to all invoices</span>
                : <span style={{fontSize:12,color:"var(--text3)"}}>VAT disabled — enter a VAT number to enable</span>}
            </div>
          </div>
        </div>

        {/* Label Size */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🏷️ Label Size</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <FL label="Label Width (mm)"/>
              <input className="inp" type="number" min="50" max="200" step="1"
                value={f.label_width_mm||98} onChange={e=>s("label_width_mm",Number(e.target.value)||98)}/>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Default: 98 mm</div>
            </div>
            <div>
              <FL label="Label Height (mm)"/>
              <input className="inp" type="number" min="20" max="120" step="1"
                value={f.label_height_mm||45} onChange={e=>s("label_height_mm",Number(e.target.value)||45)}/>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Default: 45 mm</div>
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>Used for vehicle labels and stripping parts labels. Standard thermal label: 98 × 45 mm.</div>
        </div>

        {/* Spare Shop Mode */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>🏪 Mode</div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!f.spare_shop_mode} onChange={e=>s("spare_shop_mode",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>Spare Shop Mode</div>
              <div style={{fontSize:12,color:"var(--text3)"}}>Hides orders, picking, invoices and gate — use when you only list parts for sale without full sales management</div>
            </div>
          </label>
        </div>

        <button className="btn btn-primary" style={{padding:13,fontSize:15}} onClick={save} disabled={saving}>
          {saving?"Saving...":"✅ Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════════════════════════
export function ChangePasswordModal({user,onClose,showToast}) {
  const [cur,setCur]=useState("");
  const [nw,setNw]=useState("");
  const [nw2,setNw2]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const save=async()=>{
    if(!cur||!nw||!nw2){setErr("All fields required");return;}
    if(nw!==nw2){setErr("New passwords don't match");return;}
    if(nw.length<4){setErr("Password too short (min 4 chars)");return;}
    setLoading(true);setErr("");
    // Verify current password
    const table=user._isCustomer?"customers":"users";
    const field=user._isCustomer?"phone":"username";
    const val=user._isCustomer?user.phone:user.username;
    const check=await api.get(table,`${field}=eq.${encodeURIComponent(val)}&password=eq.${encodeURIComponent(cur)}&select=id`);
    if(!Array.isArray(check)||check.length===0){setErr("Current password is incorrect");setLoading(false);return;}
    await api.patch(table,"id",user.id,{password:nw});
    setLoading(false);
    showToast("✅ Password changed");
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
        <MHead title="🔑 Change Password" onClose={onClose}/>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div><FL label="Current Password"/><input className="inp" type="password" value={cur} onChange={e=>setCur(e.target.value)} autoFocus/></div>
          <div><FL label="New Password"/><input className="inp" type="password" value={nw} onChange={e=>setNw(e.target.value)}/></div>
          <div><FL label="Confirm New Password"/><input className="inp" type="password" value={nw2} onChange={e=>setNw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()}/></div>
          {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{flex:2}} onClick={save} disabled={loading}>{loading?"Saving...":"Save Password"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP LOCATION SETUP MODAL
// ═══════════════════════════════════════════════════════════════
export function WsLocationSetupModal({profile,onSave,onClose}) {
  const [city,setCity]=useState(profile?.city||"");
  const [country,setCountry]=useState(profile?.country||"");
  const [saving,setSaving]=useState(false);
  const [detecting,setDetecting]=useState(false);
  const [err,setErr]=useState("");

  const save=async()=>{
    if(!city.trim()||!country.trim()){setErr("Both City and Country are required");return;}
    setSaving(true);
    await onSave(city.trim(),country.trim());
    setSaving(false);
  };

  return (
    <div className="overlay" style={{zIndex:9000}} onClick={e=>e.stopPropagation()}>
      <div className="modal" style={{maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:36,marginBottom:10}}>🌍</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Set Your Workshop Location</div>
          <div style={{fontSize:13,color:"var(--text3)",lineHeight:1.5}}>
            Please set your <strong>City</strong> and <strong>Country</strong> to continue.<br/>
            This helps with filtering and reporting across workshops.
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <button type="button" className="btn btn-ghost" disabled={detecting} onClick={async()=>{
            setDetecting(true);
            try{const loc=await detectGeoLocation();setCity(loc.city);setCountry(loc.country);}catch{/* ignore geolocation failures */}
            setDetecting(false);
          }} style={{width:"100%",fontSize:13}}>
            {detecting?"📡 Detecting your location...":"📍 Auto-detect my City & Country"}
          </button>
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><FL label="City *"/><input className="inp" value={city} onChange={e=>setCity(e.target.value)} placeholder="e.g. Cape Town"/></div>
            <div style={{flex:1}}><FL label="Country *"/><input className="inp" value={country} onChange={e=>setCountry(e.target.value)} placeholder="e.g. South Africa" onKeyDown={e=>e.key==="Enter"&&save()}/></div>
          </div>
          {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Skip for now</button>
            <button className="btn btn-primary" style={{flex:2}} onClick={save} disabled={saving}>
              {saving?"Saving...":"✅ Save Location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP SUBSCRIPTION EXPIRED PAGE
// ═══════════════════════════════════════════════════════════════
export function WsSubscriptionExpiredPage({expiresAt,onLogout}) {
  const settings = getSettings();
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",padding:24}}>
      <div style={{maxWidth:480,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:16}}>🔒</div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:8,color:"var(--red)"}}>Subscription Expired</h2>
        <p style={{color:"var(--text3)",fontSize:14,lineHeight:1.6,marginBottom:20}}>
          Your workshop subscription expired on <strong>{expiresAt}</strong>.<br/>
          Please contact the administrator to renew your subscription and regain access.
        </p>
        <div className="card" style={{padding:20,marginBottom:20,textAlign:"left"}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📞 Contact to Renew</div>
          {settings?.phone&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:6}}>📱 {settings.phone}</div>}
          {settings?.whatsapp&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:6}}>💬 WhatsApp: {settings.whatsapp}</div>}
          {settings?.email&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:6}}>✉️ {settings.email}</div>}
          {!settings?.phone&&!settings?.email&&<div style={{fontSize:13,color:"var(--text3)"}}>Please contact your system administrator.</div>}
        </div>
        <button className="btn btn-ghost" style={{width:"100%"}} onClick={onLogout}>← Sign Out</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN WORKSHOP SUBSCRIPTIONS PAGE
// ═══════════════════════════════════════════════════════════════
export function WsSubscriptionsPage({settings}) {
  const [workshops,setWorkshops]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null); // {id,subscription_status,subscription_expires_at}
  const [saving,setSaving]=useState(false);

  const load=async()=>{
    setLoading(true);
    const res=await api.get("workshop_profiles","select=id,name,city,country,phone,email,trial_start,subscription_status,subscription_expires_at&order=name.asc").catch(()=>[]);
    setWorkshops(Array.isArray(res)?res:[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const save=async()=>{
    if(!editing) return;
    setSaving(true);
    await api.patch("workshop_profiles","id",editing.id,{subscription_status:editing.subscription_status,subscription_expires_at:editing.subscription_expires_at});
    setSaving(false);
    setEditing(null);
    load();
  };

  const today=new Date(); today.setHours(0,0,0,0);
  const daysLeft=(exp)=>{ if(!exp) return null; const d=new Date(exp); d.setHours(0,0,0,0); return Math.ceil((d-today)/(1000*60*60*24)); };
  const statusColor=(s,dl)=>{
    if(s==="active") return dl!==null&&dl>0?"var(--green)":"var(--red)";
    if(s==="trial")  return dl!==null&&dl>0?(dl<=7?"var(--yellow)":"var(--blue)"):"var(--red)";
    return "var(--red)";
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💳 Workshop Subscriptions</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:2}}>{workshops.length} workshops registered</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>🔄 Refresh</button>
      </div>
      {loading&&<div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>Loading...</div>}
      {!loading&&workshops.length===0&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No workshops found</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {workshops.map(w=>{
          const dl=daysLeft(w.subscription_expires_at);
          const sc=statusColor(w.subscription_status,dl);
          const expired=w.subscription_expires_at&&dl!==null&&dl<0;
          return (
            <div key={w.id} className="card" style={{padding:"14px 18px",borderLeft:`3px solid ${sc}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{w.name||w.id}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                    {[w.city,w.country].filter(Boolean).join(", ")}
                    {w.phone&&<span style={{marginLeft:8}}>📞 {w.phone}</span>}
                  </div>
                  <div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--text3)",marginTop:2}}>ID: {w.id}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <span style={{fontWeight:700,fontSize:13,color:sc,background:`${sc}18`,borderRadius:6,padding:"3px 10px"}}>
                    {w.subscription_status?.toUpperCase()||"NO PLAN"}
                  </span>
                  <div style={{fontSize:12,color:expired?"var(--red)":"var(--text3)",marginTop:4}}>
                    {w.subscription_expires_at
                      ? expired?`⚠️ Expired ${w.subscription_expires_at}`:dl===0?"Expires today":`${dl} days left · ${w.subscription_expires_at}`
                      : "No expiry set"}
                  </div>
                  <div style={{marginTop:6}}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setEditing({...w})}>✏️ Manage</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing&&(
        <Overlay onClose={()=>setEditing(null)} wide>
          <MHead title={`💳 Manage: ${editing.name}`} onClose={()=>setEditing(null)}/>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Workshop info summary */}
            <div style={{background:"var(--surface2)",borderRadius:10,padding:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
              <div><span style={{color:"var(--text3)"}}>City:</span><br/><strong>{editing.city||"—"}</strong></div>
              <div><span style={{color:"var(--text3)"}}>Country:</span><br/><strong>{editing.country||"—"}</strong></div>
              <div><span style={{color:"var(--text3)"}}>Registered:</span><br/><strong>{editing.trial_start||"—"}</strong></div>
              <div><span style={{color:"var(--text3)"}}>Phone:</span><br/><strong>{editing.phone||"—"}</strong></div>
              {editing.email&&<div style={{gridColumn:"1/-1"}}><span style={{color:"var(--text3)"}}>Email:</span><br/><strong>{editing.email}</strong></div>}
            </div>
            <div>
              <FL label="Subscription Status"/>
              <select className="inp" value={editing.subscription_status||"trial"} onChange={e=>setEditing(p=>({...p,subscription_status:e.target.value}))}>
                <option value="trial">Trial</option>
                <option value="active">Active (Paid)</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <FL label="Subscription Expires At"/>
              <input className="inp" type="date" value={editing.subscription_expires_at||""} onChange={e=>setEditing(p=>({...p,subscription_expires_at:e.target.value}))}/>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["+ 1 Month",30],["+ 3 Months",90],["+ 6 Months",180],["+ 1 Year",365]].map(([lb,days])=>(
                <button key={lb} className="btn btn-ghost btn-sm" onClick={()=>{
                  const base=editing.subscription_expires_at&&new Date(editing.subscription_expires_at)>new Date()?new Date(editing.subscription_expires_at):new Date();
                  const d=new Date(base.getTime()+days*24*60*60*1000);
                  setEditing(p=>({...p,subscription_expires_at:d.toISOString().slice(0,10),subscription_status:"active"}));
                }}>{lb}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={save} disabled={saving}>{saving?"Saving...":"💾 Save"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED TABLE
// ═══════════════════════════════════════════════════════════════
export function OrdersTable({orders,canEdit,canInvoice=true,shipperMode=false,onStatusChange,onCreateInvoice,onSendQuote,onRecordPayment}) {
  if(orders.length===0) return <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No orders</div>;

  const ALL_STATUSES=["Processing","Quoted","Ready to Ship","Invoiced","Paid","Completed","Cancelled"];

  const getActionBtn=(o)=>{
    if(!canEdit) return null;
    if(o.status==="Processing"&&onSendQuote)
      return <button className="btn btn-sm" style={{background:"rgba(168,85,247,.15)",color:"#a855f7",border:"1px solid rgba(168,85,247,.3)"}} onClick={()=>onSendQuote(o)}>📋 Send Quote</button>;
    if((o.status==="Quoted"||o.status==="Ready to Ship")&&canInvoice)
      return <button className="btn btn-info btn-sm" onClick={()=>onCreateInvoice(o)}>🧾 Invoice</button>;
    if(o.status==="Invoiced"&&onRecordPayment)
      return <button className="btn btn-success btn-sm" onClick={()=>onRecordPayment(o)}>💳 Record Payment</button>;
    return null;
  };

  return (
    <>
      {/* ── MOBILE CARDS ── */}
      <div className="mob-cards">
        {orders.map(o=>(
          <div key={o.id} className="card" style={{padding:16,borderLeft:`3px solid ${OC[o.status]||"var(--border)"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{o.customer_name}</div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{o.customer_phone}</div>
                <code style={{fontFamily:"DM Mono,monospace",fontSize:10,color:"var(--text3)"}}>{o.id}</code>
              </div>
              <div style={{textAlign:"right"}}>
                <StatusBadge status={o.status}/>
                <div style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginTop:4}}>{fmtAmt(o.total)}</div>
                <div style={{fontSize:11,color:"var(--text3)"}}>{o.date}</div>
              </div>
            </div>
            <div style={{borderTop:"1px solid var(--border)",paddingTop:8,marginBottom:10}}>
              {Array.isArray(o.items)&&o.items.map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}>
                  <span style={{color:"var(--text2)"}}>{item.name}</span>
                  <span style={{fontWeight:600,color:"var(--accent)"}}>×{item.qty}</span>
                </div>
              ))}
            </div>
            {canEdit&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select value={o.status} onChange={e=>onStatusChange(o.id,e.target.value)}
                  style={{flex:1,background:"var(--surface2)",border:"1px solid var(--border)",
                    color:"var(--text)",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>
                  {(shipperMode
                    ? (o.status==="Processing"?["Processing","Ready to Ship"]:o.status==="Ready to Ship"?["Ready to Ship","Completed"]:[o.status])
                    : ALL_STATUSES
                  ).map(s=><option key={s} value={s}>{tSt(s)}</option>)}
                </select>
                {getActionBtn(o)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="card desk-table" style={{overflow:"hidden"}}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["Order","Customer","Date","Items","Total","Status",...(canEdit?["Update","Action"]:[])].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {orders.map(o=>(
                <tr key={o.id}>
                  <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{o.id}</code></td>
                  <td><div style={{fontWeight:600}}>{o.customer_name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{o.customer_phone}</div></td>
                  <td style={{color:"var(--text3)",fontSize:13,whiteSpace:"nowrap"}}>{o.date}</td>
                  <td style={{fontSize:13,color:"var(--text2)"}}>{Array.isArray(o.items)&&o.items.map((item,i)=><div key={i}>{item.name} ×{item.qty}</div>)}</td>
                  <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)",whiteSpace:"nowrap"}}>{fmtAmt(o.total)}</td>
                  <td><StatusBadge status={o.status}/></td>
                  {canEdit&&<td><select value={o.status} onChange={e=>onStatusChange(o.id,e.target.value)} style={{background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"5px 9px",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>{(shipperMode
                            ? (o.status==="Processing"?["Processing","Ready to Ship"]:o.status==="Ready to Ship"?["Ready to Ship","Completed"]:[o.status])
                            : ALL_STATUSES
                          ).map(s=><option key={s} value={s}>{tSt(s)}</option>)}</select></td>}
                  {canEdit&&<td>{getActionBtn(o)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════
// ── Logo Uploader Component (extracted to follow React Rules of Hooks) ──
export function LogoUploader({f,s}) {
  const [uploading,setUploading]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef(null);

  const handleFile=async(file)=>{
    if(!file)return;
    if(!file.type.startsWith("image/")){alert("Please select an image file (PNG, JPG, etc.)");return;}
    if(f.logo_url){alert("Please remove the Google Drive URL first before uploading a file.");return;}
    setUploading(true);
    const MAX=800;
    try{
      await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=ev=>{
          const img=new Image();
          img.onload=()=>{
            const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            const data=canvas.toDataURL("image/png",0.85);
            s("logo_data",data);
            s("logo_url","");
            resolve();
          };
          img.onerror=reject;
          img.src=ev.target.result;
        };
        reader.onerror=reject;
        reader.readAsDataURL(file);
      });
    }catch(e){alert("Failed to read image: "+e.message);}
    setUploading(false);
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={()=>{ if(f.logo_url){alert("Please remove the Google Drive URL first before uploading a file.");return;} fileRef.current?.click(); }}
        onDragOver={e=>{e.preventDefault();if(!f.logo_url)setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);if(f.logo_url){alert("Please remove the Google Drive URL first.");return;}handleFile(e.dataTransfer.files[0]);}}
        style={{
          border:`2px dashed ${dragOver?"var(--accent)":"var(--border)"}`,
          borderRadius:12, padding:"20px 16px", textAlign:"center",
          cursor:f.logo_url?"not-allowed":"pointer", transition:"all .15s",
          background:dragOver?"rgba(251,146,60,.06)":f.logo_url?"var(--surface3)":"var(--surface2)",
          marginBottom:12, opacity:f.logo_url?0.5:1
        }}>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={e=>handleFile(e.target.files[0])}/>
        {uploading
          ? <div style={{color:"var(--accent)",fontSize:14}}>⏳ Processing image...</div>
          : f.logo_url
            ? <div style={{fontSize:13,color:"var(--text3)"}}>🔒 Remove the URL below first to upload a file</div>
            : f.logo_data
              ? <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                  <img src={f.logo_data} alt="logo" style={{maxHeight:60,maxWidth:200,objectFit:"contain"}}/>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>✅ Logo uploaded</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Click or drop to replace · Remove first if switching to URL</div>
                  </div>
                </div>
              : <div>
                  <div style={{fontSize:28,marginBottom:6}}>📁</div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>Click to upload or drag &amp; drop</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>PNG, JPG, SVG — auto resized if large</div>
                </div>
        }
      </div>
      {(f.logo_data||f.logo_url)&&(
        <button className="btn btn-ghost btn-sm" style={{width:"100%",color:"var(--red)",marginBottom:4}}
          onClick={()=>{if(window.confirm("Remove current logo?")){ s("logo_data",""); s("logo_url",""); }}}>
          🗑 Remove Current Logo
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRANSLATION EDITOR  (admin — edit key/value pairs per language)
// ═══════════════════════════════════════════════════════════════
function TranslationEditor({row, onClose, onSaved}) {
  // row = { lang, name, flag, t:{}, status_t:{} }  (null = adding English override)
  const isEn = row.lang === "en";
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("ui"); // "ui" | "status"
  const [vals, setVals] = useState(() => ({ ...T.en, ...(row.t || {}) }));
  const [stVals, setStVals] = useState(() => ({ ...(row.status_t || {}) }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const allKeys = Object.keys(T.en);
  const filtered = allKeys.filter(k => {
    if (!search) return true;
    const q = search.toLowerCase();
    return k.toLowerCase().includes(q) || (T.en[k] || "").toLowerCase().includes(q) || (vals[k] || "").toLowerCase().includes(q);
  });

  const save = async () => {
    setSaving(true); setErr("");
    try {
      // Build translation object — only store keys that differ from English (for non-EN)
      const tObj = isEn ? { ...vals } : Object.fromEntries(
        Object.entries(vals).filter(([k, v]) => v !== T.en[k])
      );
      const stObj = Object.fromEntries(Object.entries(stVals).filter(([, v]) => v?.trim()));
      const payload = {
        lang: row.lang, name: row.name, flag: row.flag || "",
        active: row.active !== false,
        t: tObj, status_t: stObj,
      };
      await api.upsert("app_translations", payload);
      // Update in-memory translation so changes take effect immediately
      if (isEn) {
        // Patch T.en directly
        Object.assign(T.en, tObj);
        // Rebuild all registered languages so they re-inherit new English values
        for (const [l, obj] of Object.entries(T)) {
          if (l !== "en") T[l] = { ...T.en, ...obj };
        }
      } else {
        registerLang(row.lang, row.name, row.flag, tObj, stObj);
      }
      onSaved();
      onClose();
    } catch(e) { setErr("Save failed: " + e.message); }
    setSaving(false);
  };

  const STATUS_KEYS = ["Pending","Replied","Closed","Paid","Unpaid","Partial","Approved",
    "Processing","Ready to Ship","Completed","Cancelled","In Progress","Checkup","Quoting","Ordered","Done","Delivered"];

  return (
    <div style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"var(--surface)",borderRadius:16,width:"min(900px,96vw)",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        {/* Header */}
        <div style={{padding:"18px 22px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <span style={{fontSize:24}}>{row.flag||"🌐"}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:16}}>{row.name} — Translation Editor</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
              {isEn ? "Editing English (base language) — changes affect all languages" : `Editing ${row.name} translations. Blank = falls back to English.`}
            </div>
          </div>
          <button className="cp-btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
          <button className="cp-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",flexShrink:0}}>
          {[["ui","🗂 UI Strings"],["status","📊 Status Labels"]].map(([k,label])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{padding:"10px 20px",border:"none",background:"none",cursor:"pointer",fontWeight:tab===k?700:400,
                borderBottom:tab===k?"2px solid var(--accent)":"2px solid transparent",
                color:tab===k?"var(--accent)":"var(--text2)",fontSize:13}}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab==="ui" && (
          <div style={{padding:"12px 22px",flexShrink:0,borderBottom:"1px solid var(--border)"}}>
            <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search keys or text…" style={{maxWidth:400}}/>
            <span style={{marginLeft:12,fontSize:12,color:"var(--text3)"}}>{filtered.length} / {allKeys.length} keys</span>
          </div>
        )}

        {/* Body */}
        <div style={{overflow:"auto",flex:1,padding:"0 22px"}}>
          {tab==="ui" ? (
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{position:"sticky",top:0,background:"var(--surface)",zIndex:1}}>
                  <th style={{padding:"10px 8px",textAlign:"left",borderBottom:"1px solid var(--border)",color:"var(--text3)",fontWeight:600,width:"18%"}}>Key</th>
                  <th style={{padding:"10px 8px",textAlign:"left",borderBottom:"1px solid var(--border)",color:"var(--text3)",fontWeight:600,width:"35%"}}>English (original)</th>
                  <th style={{padding:"10px 8px",textAlign:"left",borderBottom:"1px solid var(--border)",color:"var(--text3)",fontWeight:600}}>{isEn ? "Override value" : row.name}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(k=>(
                  <tr key={k} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"6px 8px",fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",verticalAlign:"top",paddingTop:9}}>{k}</td>
                    <td style={{padding:"6px 8px",color:"var(--text2)",verticalAlign:"top"}}>
                      {isEn
                        ? <input className="inp" style={{fontSize:12,padding:"4px 8px"}}
                            value={vals[k]||""} onChange={e=>setVals(p=>({...p,[k]:e.target.value}))}/>
                        : <span style={{fontSize:12,lineHeight:1.5}}>{T.en[k]}</span>
                      }
                    </td>
                    {!isEn && (
                      <td style={{padding:"6px 8px",verticalAlign:"top"}}>
                        <input className="inp" style={{fontSize:12,padding:"4px 8px",
                          background: vals[k] && vals[k]!==T.en[k] ? "rgba(var(--accent-rgb),.07)" : ""}}
                          value={vals[k]||""} placeholder={T.en[k]}
                          onChange={e=>setVals(p=>({...p,[k]:e.target.value}))}/>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{paddingTop:16,paddingBottom:16}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:16}}>
                Map English status strings to {isEn?"overrides":row.name}. Leave blank to use English as-is.
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr>
                    <th style={{padding:"8px",textAlign:"left",borderBottom:"1px solid var(--border)",color:"var(--text3)",fontWeight:600,width:"40%"}}>English Status</th>
                    <th style={{padding:"8px",textAlign:"left",borderBottom:"1px solid var(--border)",color:"var(--text3)",fontWeight:600}}>{isEn?"Override":row.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_KEYS.map(k=>(
                    <tr key={k} style={{borderBottom:"1px solid var(--border)"}}>
                      <td style={{padding:"6px 8px",color:"var(--text2)"}}>{k}</td>
                      <td style={{padding:"6px 8px"}}>
                        <input className="inp" style={{fontSize:12,padding:"4px 8px",maxWidth:260}}
                          value={stVals[k]||""} placeholder={k}
                          onChange={e=>setStVals(p=>({...p,[k]:e.target.value}))}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {err && <div style={{padding:"10px 22px",color:"var(--red)",fontSize:13,flexShrink:0}}>{err}</div>}
      </div>
    </div>
  );
}

function LangManagerSection() {
  const [rows, setRows] = useState(null); // null = loading
  const [editing, setEditing] = useState(null); // row being edited
  const [addForm, setAddForm] = useState(null); // null | {lang,name,flag}
  const [addErr, setAddErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.get("app_translations", "select=lang,name,flag,active,t,status_t&order=lang.asc").catch(()=>[]);
    setRows(Array.isArray(res) ? res : []);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (row) => {
    const updated = !row.active;
    await api.patch("app_translations", "lang", row.lang, { active: updated });
    setRows(p => p.map(r => r.lang===row.lang ? {...r, active: updated} : r));
  };

  const startAdd = () => setAddForm({ lang:"", name:"", flag:"" });

  const saveAdd = async () => {
    if (!addForm.lang.trim() || !addForm.name.trim()) { setAddErr("Language code and name required"); return; }
    const code = addForm.lang.trim().toLowerCase();
    if (rows.find(r=>r.lang===code)) { setAddErr("Language code already exists"); return; }
    setSaving(true); setAddErr("");
    try {
      await api.upsert("app_translations", { lang:code, name:addForm.name.trim(), flag:addForm.flag.trim(), active:true, t:{}, status_t:{} });
      await load();
      setAddForm(null);
    } catch(e) { setAddErr("Failed: " + e.message); }
    setSaving(false);
  };

  const deleteLang = async (lang) => {
    if (!window.confirm(`Delete ${lang} language? All translations will be lost.`)) return;
    await api.delete("app_translations", "lang", lang);
    setRows(p => p.filter(r => r.lang !== lang));
  };

  // English is always shown first even if not in DB
  const enRow = { lang:"en", name:"English", flag:"🇬🇧", active:true, t:{}, status_t:{} };
  const allRows = rows ? [enRow, ...rows.filter(r=>r.lang!=="en")] : [enRow];

  return (
    <div className="card" style={{padding:22,marginTop:20,gridColumn:"1/-1"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",margin:0}}>🌐 Languages & Translations</h3>
        <button className="btn btn-primary btn-sm" onClick={startAdd}>+ Add Language</button>
      </div>

      {/* Add form */}
      {addForm && (
        <div style={{background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:10,padding:16,marginBottom:16}}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>New Language</div>
          <FG cols="1fr 1fr 1fr">
            <div>
              <FL label="Language Code (e.g. zh, ms, fr)"/>
              <input className="inp" value={addForm.lang} onChange={e=>setAddForm(p=>({...p,lang:e.target.value}))} placeholder="zh"/>
            </div>
            <div>
              <FL label="Language Name"/>
              <input className="inp" value={addForm.name} onChange={e=>setAddForm(p=>({...p,name:e.target.value}))} placeholder="Chinese"/>
            </div>
            <div>
              <FL label="Flag Emoji"/>
              <input className="inp" value={addForm.flag} onChange={e=>setAddForm(p=>({...p,flag:e.target.value}))} placeholder="🇨🇳"/>
            </div>
          </FG>
          {addErr && <div style={{color:"var(--red)",fontSize:12,marginTop:6}}>{addErr}</div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button className="btn btn-primary btn-sm" onClick={saveAdd} disabled={saving}>{saving?"Adding…":"Add Language"}</button>
            <button className="cp-btn" onClick={()=>{setAddForm(null);setAddErr("");}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Language list */}
      {rows === null ? (
        <div style={{color:"var(--text3)",fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading…</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:0,border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          {allRows.map((row, i) => (
            <div key={row.lang} style={{
              display:"flex",alignItems:"center",gap:14,padding:"12px 16px",
              background: i%2===0 ? "var(--surface)" : "var(--surface2)",
              borderBottom: i<allRows.length-1 ? "1px solid var(--border)" : "none"
            }}>
              <span style={{fontSize:22,flexShrink:0}}>{row.flag||"🌐"}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>{row.name}</div>
                <div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{row.lang}</div>
              </div>
              {/* Active toggle (not for English) */}
              {row.lang !== "en" ? (
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:"var(--text3)"}}>Active</span>
                  <div onClick={()=>toggleActive(row)}
                    style={{width:38,height:22,borderRadius:11,background:row.active?"var(--green)":"var(--border2)",
                      cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:3,left:row.active?18:3,width:16,height:16,borderRadius:"50%",
                      background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.25)"}}/>
                  </div>
                </div>
              ) : (
                <span style={{fontSize:11,color:"var(--green)",fontWeight:600,padding:"3px 10px",background:"rgba(var(--green-rgb),.1)",borderRadius:20}}>Base language</span>
              )}
              <button className="btn btn-primary btn-sm" onClick={()=>setEditing(row)}>✏️ Edit Translations</button>
              {row.lang !== "en" && (
                <button className="cp-btn" style={{color:"var(--red)"}} onClick={()=>deleteLang(row.lang)} title="Delete language">🗑</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:12,color:"var(--text3)",marginTop:10}}>
        Languages marked active appear in the language switcher. Blank translation values fall back to English automatically.
      </div>

      {editing && (
        <TranslationEditor row={editing} onClose={()=>setEditing(null)} onSaved={load}/>
      )}
    </div>
  );
}

export function SettingsPage({settings,onSave,t,ads=[],adContracts=[],onSaveAd,onDeleteAd}) {
  const [f,setF]=useState({...settings});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [sTab,setSTab]=useState("shop");
  const [cats,setCats]=useState(getCategories());
  const [newCat,setNewCat]=useState("");
  const addCat=()=>{
    if(!newCat.trim())return;
    const updated=[...cats,newCat.trim()];
    setCats(updated);
    onSave({categories:JSON.stringify(updated)});
    setNewCat("");
  };
  const delCat=(i)=>{
    const updated=cats.filter((_,idx)=>idx!==i);
    setCats(updated);
    onSave({categories:JSON.stringify(updated)});
  };

  // Ads form state
  const AD_BLANK={title:"",description:"",image_url:"",link_url:"",cta_text:"Learn More",page:"shop",position:"banner",weather_condition:"any",contract_id:null,duration:6,active:true};
  const [adForm,setAdForm]=useState(AD_BLANK);
  const [editingAd,setEditingAd]=useState(null);
  const af=(k,v)=>setAdForm(p=>({...p,[k]:v}));
  const startEditAd=(ad)=>{setAdForm({...ad});setEditingAd(ad.id);};
  const cancelEditAd=()=>{setAdForm(AD_BLANK);setEditingAd(null);};
  const submitAd=async()=>{
    if(!adForm.title.trim()){return;}
    await onSaveAd(editingAd?{...adForm,id:editingAd}:adForm);
    cancelEditAd();
  };

  const TABS=[["shop","🏪 Shop"],["billing","💰 Billing"],["inventory","🏷️ Inventory"],["pos","🖥️ POS"],["languages","🌐 Languages"],["partners","🔗 Workshop QR"],["ads","📢 Ads"]];

  return (
    <div className="fu">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>⚙️ {t.settings}</h1></div>
        {(sTab==="shop"||sTab==="billing")&&(
          <button className="btn btn-primary" onClick={()=>onSave(f)}>💾 {t.saveSettings}</button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--border)",marginBottom:22}}>
        {TABS.map(([k,label])=>(
          <button key={k} onClick={()=>setSTab(k)}
            style={{padding:"10px 20px",border:"none",background:"none",cursor:"pointer",
              fontWeight:sTab===k?700:400,fontSize:13,
              borderBottom:sTab===k?"2px solid var(--accent)":"2px solid transparent",
              color:sTab===k?"var(--accent)":"var(--text2)"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: SHOP ── */}
      {sTab==="shop"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>🏪 Shop Info</h3>
            <FD><FL label={t.shopName}/><input className="inp" value={f.shop_name||""} onChange={e=>s("shop_name",e.target.value)} placeholder="MotorDesk"/></FD>
            <FD><FL label={t.shopPhone}/><input className="inp" type="tel" value={f.phone||""} onChange={e=>s("phone",e.target.value)} placeholder="+886..."/></FD>
            <FD><FL label={t.shopEmail}/><input className="inp" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)} placeholder="shop@email.com"/></FD>
            <FD><FL label={t.whatsappNo}/><input className="inp" type="tel" value={f.whatsapp||""} onChange={e=>s("whatsapp",e.target.value)} placeholder="886912345678 (no + or spaces)"/></FD>
            <FD><FL label={t.shopAddress}/><textarea className="inp" value={f.address||""} onChange={e=>s("address",e.target.value)} placeholder="Full shop address" style={{minHeight:70}}/></FD>
            <FG cols="1fr 1fr">
              <div><FL label="City"/><input className="inp" value={f.city||""} onChange={e=>s("city",e.target.value)} placeholder="e.g. Cape Town"/></div>
              <div><FL label="Country"/><input className="inp" value={f.country||""} onChange={e=>s("country",e.target.value)} placeholder="e.g. South Africa"/></div>
            </FG>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div className="card" style={{padding:22}}>
              <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>🖼️ Logo</h3>
              <LogoUploader f={f} s={s}/>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,marginTop:10}}>
                <div style={{fontSize:12,color:"var(--text3)",flexShrink:0}}>Or URL:</div>
                <input className="inp" value={f.logo_url||""}
                  disabled={!!f.logo_data}
                  onChange={e=>s("logo_url",e.target.value)}
                  placeholder={f.logo_data?"Remove uploaded logo first...":"https://drive.google.com/file/d/..."}
                  style={{fontSize:12,opacity:f.logo_data?0.5:1,cursor:f.logo_data?"not-allowed":"text"}}/>
                <button className="cp-btn"
                  disabled={!!f.logo_data}
                  style={{opacity:f.logo_data?0.4:1}}
                  onClick={async()=>{if(f.logo_data){alert("Remove the uploaded logo first.");return;}try{const txt=await navigator.clipboard.readText();s("logo_url",txt);}catch{/* ignore clipboard failures */}}}>📥 Paste</button>
              </div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
                💡 <strong style={{color:"var(--text)"}}>Upload</strong> = stored in DB &nbsp;·&nbsp;
                <strong style={{color:"var(--text)"}}>URL</strong> = Google Drive &nbsp;·&nbsp;
                ⚠️ Remove current logo before switching method
              </div>
              <div style={{background:"var(--surface3)",borderRadius:10,border:"1px solid var(--border)",padding:14}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                  {(f.logo_data||f.logo_url)
                    ? <img src={f.logo_data||(toLogoUrl(f.logo_url)||f.logo_url)} alt="preview"
                        style={{maxHeight:56,maxWidth:220,width:"auto",height:"auto",objectFit:"contain",display:"block"}}
                        referrerPolicy="no-referrer"
                        onError={e=>e.target.style.display="none"}/>
                    : <LogoSVG height={44}/>
                  }
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600,color:(f.logo_data||f.logo_url)?"var(--green)":"var(--text3)",marginBottom:2}}>
                      {f.logo_data?"✅ Uploaded & stored in database":f.logo_url?"✓ Google Drive URL set":"Using built-in SVG logo"}
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>
                      {f.logo_data?"No white border · Works offline":f.logo_url?"Loads from Google Drive":"Upload a file or paste a URL above"}
                    </div>
                  </div>
                </div>
                <div style={{borderTop:"1px solid var(--border)",paddingTop:12}}>
                  <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12}}>Logo Size per Location</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                    {[
                      {key:"logo_h_login",   label:"🔐 Login",   def:80},
                      {key:"logo_h_sidebar", label:"📋 Sidebar",  def:36},
                      {key:"logo_h_pdf",     label:"🖨️ PDF",     def:70},
                    ].map(({key,label,def})=>(
                      <div key={key}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text2)",marginBottom:6}}>{label}</div>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                          <input type="range" min={20} max={key==="logo_h_login"?400:key==="logo_h_pdf"?300:150} step={2}
                            value={+(f[key]||def)} onChange={e=>s(key,+e.target.value)}
                            style={{flex:1,accentColor:"var(--accent)",cursor:"pointer"}}/>
                          <span style={{fontFamily:"DM Mono,monospace",fontSize:13,fontWeight:700,color:"var(--accent)",minWidth:40,textAlign:"right"}}>{f[key]||def}px</span>
                        </div>
                        <div style={{background:"var(--surface2)",borderRadius:6,padding:6,border:"1px solid var(--border)",minHeight:+(f[key]||def)+12,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {(f.logo_data||f.logo_url)
                            ? <img src={f.logo_data||(toLogoUrl(f.logo_url)||f.logo_url)} alt=""
                                style={{maxHeight:+(f[key]||def),maxWidth:160,width:"auto",height:"auto",objectFit:"contain"}}
                                referrerPolicy="no-referrer"
                                onError={e=>e.target.style.display="none"}/>
                            : <LogoSVG height={Math.min(+(f[key]||def),60)}/>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="card" style={{padding:22}}>
              <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>🔗 Integrations</h3>
              <FD>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <FL label="📷 Parts Photo Upload (Apps Script URL)"/>
                  <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                    <button className="cp-btn" style={{color:"#4285F4",borderColor:"rgba(66,133,244,.3)"}}>Open Apps Script →</button>
                  </a>
                </div>
                <input className="inp" value={f.apps_script_url||""} onChange={e=>s("apps_script_url",e.target.value)}
                  placeholder="https://script.google.com/macros/s/YOUR_ID/exec"/>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Deploy as Web App → part photos auto-upload to Google Drive</div>
              </FD>
              <FD>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <FL label="🚗 Vehicle Photo Upload (Apps Script URL)"/>
                  <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                    <button className="cp-btn" style={{color:"#4285F4",borderColor:"rgba(66,133,244,.3)"}}>Open Apps Script →</button>
                  </a>
                </div>
                <input className="inp" value={f.vehicle_script_url||""} onChange={e=>s("vehicle_script_url",e.target.value)}
                  placeholder="https://script.google.com/macros/s/YOUR_VEHICLE_ID/exec"/>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Separate deployment → saves to Tim_Car_Phot/Make/ID/view.png</div>
              </FD>
              <FD>
                <FL label="🪪 Licence Renewal Agent Name"/>
                <input className="inp" value={f.licence_renewal_agent_name||""} onChange={e=>s("licence_renewal_agent_name",e.target.value)} placeholder="e.g. ABC Renewals"/>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Name shown in renewal request modal</div>
              </FD>
              <FD>
                <FL label="🪪 Renewal Agent WhatsApp Number"/>
                <input className="inp" value={f.licence_renewal_agent_phone||""} onChange={e=>s("licence_renewal_agent_phone",e.target.value)} placeholder="27821234567 (no + or spaces)"/>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Renewal requests sent via WhatsApp — include country code</div>
              </FD>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: BILLING ── */}
      {sTab==="billing"&&(
        <div style={{maxWidth:600}}>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>💰 Billing Settings</h3>
            <FD><FL label={t.currency}/><select className="inp" value={f.currency||"TWD NT$"} onChange={e=>s("currency",e.target.value)}>
              {["TWD NT$","USD $","MYR RM","SGD $","HKD $","JPY ¥","EUR €","GBP £","CNY ¥","THB ฿","IDR Rp","PHP ₱","ZAR R","AUD $","CAD $","KRW ₩"].map(c=><option key={c}>{c}</option>)}
            </select></FD>
            <FG cols="1fr 1fr">
              <div><FL label={t.taxRate}/><input className="inp" type="number" value={f.tax_rate||0} onChange={e=>s("tax_rate",+e.target.value)} placeholder="0 (no VAT)"/></div>
              <div><FL label="VAT Registration No."/><input className="inp" value={f.vat_number||""} onChange={e=>s("vat_number",e.target.value)} placeholder="Leave blank if not registered"/></div>
            </FG>
            <FG cols="1fr 1fr">
              <div><FL label={t.invoicePrefix}/><input className="inp" value={f.invoice_prefix||"INV"} onChange={e=>s("invoice_prefix",e.target.value)} placeholder="INV"/></div>
              <div><FL label="Credit Note Prefix"/><input className="inp" value={f.credit_note_prefix||"CN"} onChange={e=>s("credit_note_prefix",e.target.value)} placeholder="CN"/></div>
            </FG>
            <div style={{background:"var(--surface2)",borderRadius:10,padding:14,marginTop:6,border:"1px solid var(--border)"}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:10,fontWeight:600}}>Preview</div>
              <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.9}}>
                <div>Currency: <span style={{color:"var(--accent)",fontWeight:700}}>{f.currency||"NT$"}100</span></div>
                <div>Tax ({f.tax_rate||0}%): <span style={{color:"var(--text)"}}>{f.currency||"NT$"}{((100*(f.tax_rate||0))/100).toFixed(2)}</span></div>
                <div>Invoice No: <span style={{fontFamily:"DM Mono,monospace",color:"var(--blue)"}}>{f.invoice_prefix||"INV"}-001</span></div>
                {f.vat_number&&<div>VAT No: <span style={{fontFamily:"DM Mono,monospace",color:"var(--blue)"}}>{f.vat_number}</span></div>}
                {!f.vat_number&&<div style={{color:"var(--text3)"}}>VAT No: <em>Not registered</em></div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: INVENTORY ── */}
      {sTab==="inventory"&&(
        <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:700}}>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:16}}>🏷️ Part Categories</h3>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {cats.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,padding:"5px 10px"}}>
                  <span style={{fontSize:13,fontWeight:500}}>{c}</span>
                  <button onClick={()=>delCat(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:14,lineHeight:1,padding:"0 2px"}} title="Remove">✕</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,maxWidth:400}}>
              <input className="inp" value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="New category name..." onKeyDown={e=>e.key==="Enter"&&addCat()} style={{flex:1}}/>
              <button className="btn btn-primary btn-sm" onClick={addCat} disabled={!newCat.trim()}>+ Add</button>
            </div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Categories are saved locally on this device.</div>
          </div>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>🏷️ Part Label Size</h3>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>Size for part/inventory labels (SKU, bin, supplier code, invoice)</div>
            <FG cols="1fr 1fr">
              <div><FL label="Width (mm)"/><input className="inp" type="number" min="20" max="300" value={f.part_label_w||98} onChange={e=>s("part_label_w",+e.target.value)} placeholder="98"/></div>
              <div><FL label="Height (mm)"/><input className="inp" type="number" min="15" max="200" value={f.part_label_h||45} onChange={e=>s("part_label_h",+e.target.value)} placeholder="45"/></div>
            </FG>
            <div style={{background:"var(--surface2)",borderRadius:8,padding:10,border:"1px solid var(--border)",marginTop:8,display:"inline-flex",alignItems:"center",gap:10}}>
              <div style={{width:Math.min(+(f.part_label_w||98),180),height:Math.min(+(f.part_label_h||45)*2,90),border:"1px dashed var(--border2)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface3)",flexShrink:0}}>
                <span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{f.part_label_w||98}×{f.part_label_h||45}mm</span>
              </div>
              <div style={{fontSize:12,color:"var(--text3)"}}>Preview (approx)<br/>Default: 98×45mm</div>
            </div>
          </div>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>📋 Shelf Label Size</h3>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>Size for shelf/bin identification labels</div>
            <FG cols="1fr 1fr">
              <div><FL label="Width (mm)"/><input className="inp" type="number" min="20" max="300" value={f.shelf_label_w||70} onChange={e=>s("shelf_label_w",+e.target.value)} placeholder="70"/></div>
              <div><FL label="Height (mm)"/><input className="inp" type="number" min="15" max="200" value={f.shelf_label_h||45} onChange={e=>s("shelf_label_h",+e.target.value)} placeholder="45"/></div>
            </FG>
            <div style={{background:"var(--surface2)",borderRadius:8,padding:10,border:"1px solid var(--border)",marginTop:8,display:"inline-flex",alignItems:"center",gap:10}}>
              <div style={{width:Math.min(+(f.shelf_label_w||70),180),height:Math.min(+(f.shelf_label_h||45)*2,90),border:"1px dashed var(--border2)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface3)",flexShrink:0}}>
                <span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{f.shelf_label_w||70}×{f.shelf_label_h||45}mm</span>
              </div>
              <div style={{fontSize:12,color:"var(--text3)"}}>Preview (approx)<br/>Default: 70×45mm</div>
            </div>
          </div>
          <div style={{marginTop:4}}>
            <button className="btn btn-primary btn-sm" onClick={()=>onSave({part_label_w:f.part_label_w||98,part_label_h:f.part_label_h||45,shelf_label_w:f.shelf_label_w||70,shelf_label_h:f.shelf_label_h||45})}>💾 Save Label Sizes</button>
          </div>
        </div>
      )}

      {/* ── TAB: POS ── */}
      {sTab==="pos"&&(
        <div style={{maxWidth:480}}>
          <div className="card" style={{padding:22}}>
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>🖥️ Point of Sale</h3>
            <FD>
              <FL label="Manager PIN (4 digits)"/>
              <input className="inp" type="password" inputMode="numeric" maxLength={4} value={f.pos_manager_pin||""}
                onChange={e=>s("pos_manager_pin",e.target.value.replace(/\D/g,"").slice(0,4))}
                placeholder="Leave blank to disable PIN lock"
                style={{letterSpacing:8,fontSize:20,fontWeight:800,textAlign:"center"}}/>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
                Required to unlock discount at POS. If blank, discount is always unlocked.
              </div>
            </FD>
            <button className="btn btn-primary" style={{marginTop:14}} onClick={()=>onSave({pos_manager_pin:f.pos_manager_pin||""})}>💾 Save POS Settings</button>
          </div>
        </div>
      )}

      {/* ── TAB: LANGUAGES ── */}
      {sTab==="languages"&&<LangManagerSection/>}

      {/* ── TAB: WORKSHOP QR / PARTNERS ── */}
      {sTab==="partners"&&(
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          <WorkshopQRSection settings={f}/>
          <LinkedWorkshopsList shopName={f.shop_name||""}/>
        </div>
      )}

      {/* ── TAB: ADS ── */}
      {sTab==="ads"&&(
        <div style={{maxWidth:720}}>
          <div style={{marginBottom:20,padding:"12px 16px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.25)",borderRadius:10,fontSize:13,color:"var(--text2)"}}>
            📢 Ads appear in the <strong>Customer Shop</strong>, <strong>Workshop</strong>, <strong>Spare Shop</strong>, and <strong>Scrapyard</strong>. <strong>Banner</strong> ads show at the top of the page. <strong>Grid</strong> ads appear every 8 parts in the catalogue. Use <strong>🌦 Weather Target</strong> to show rain ads (wipers, bulbs) when it's raining, hot-weather ads (coolant, AC) when it's hot, and so on — weather-matched ads always appear first.
          </div>

          {/* Ad form */}
          <div style={{background:"var(--surface2)",borderRadius:12,padding:16,marginBottom:20,border:"1px solid var(--border)"}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{editingAd?"✏️ Edit Ad":"➕ New Ad"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Title *</div>
                <input className="inp" value={adForm.title} onChange={e=>af("title",e.target.value)} placeholder="e.g. 50% off brake pads this week"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Link URL</div>
                <input className="inp" value={adForm.link_url} onChange={e=>af("link_url",e.target.value)} placeholder="https://..."/>
              </div>
              <div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Image URL</div>
                <input className="inp" value={adForm.image_url} onChange={e=>af("image_url",e.target.value)} placeholder="Google Drive or https://..."/>
              </div>
              <div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Button Text</div>
                <input className="inp" value={adForm.cta_text} onChange={e=>af("cta_text",e.target.value)} placeholder="Learn More"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Description</div>
                <input className="inp" value={adForm.description} onChange={e=>af("description",e.target.value)} placeholder="Optional short description"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Page</div>
                  <select className="inp" value={adForm.page} onChange={e=>af("page",e.target.value)}>
                    <option value="shop">Customer Shop</option>
                    <option value="workshop">Workshop</option>
                    <option value="spareshop">Spare Shop</option>
                    <option value="scrapyard">Scrapyard</option>
                    <option value="all">All Pages</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Position</div>
                  <select className="inp" value={adForm.position} onChange={e=>af("position",e.target.value)}>
                    <option value="banner">Top Banner</option>
                    <option value="grid">In Grid</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>🌦 Weather Target</div>
                  <select className="inp" value={adForm.weather_condition||"any"} onChange={e=>af("weather_condition",e.target.value)}>
                    <option value="any">Any weather</option>
                    <option value="rain">🌧 Rain / Storm</option>
                    <option value="hot">🌡️ Hot (32°C+)</option>
                    <option value="cold">🧊 Cold (5°C−)</option>
                    <option value="snow">❄️ Snow</option>
                    <option value="fog">🌫 Fog</option>
                    <option value="clear">☀️ Clear / Sunny</option>
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>📑 Contract</div>
                  <select className="inp" value={adForm.contract_id||""} onChange={e=>af("contract_id",e.target.value?+e.target.value:null)}>
                    <option value="">No contract</option>
                    {adContracts.map(c=><option key={c.id} value={c.id}>{c.advertiser_name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>⏱ Stay time (sec)</div>
                  <input className="inp" type="number" min={1} max={120} value={adForm.duration??6} onChange={e=>af("duration",Math.max(1,+e.target.value))}/>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}}>
                <input type="checkbox" checked={adForm.active} onChange={e=>af("active",e.target.checked)}/> Active
              </label>
              <div style={{flex:1}}/>
              {editingAd&&<button className="btn btn-ghost btn-sm" onClick={cancelEditAd}>Cancel</button>}
              <button className="btn btn-primary" onClick={submitAd} disabled={!adForm.title.trim()}>
                {editingAd?"💾 Save Changes":"➕ Add Ad"}
              </button>
            </div>
          </div>

          {/* Ad preview */}
          {(adForm.title||adForm.image_url)&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Preview</div>
              <div style={{position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid var(--border)",background:"var(--surface2)",width:"100%",height:220}}>
                {adForm.image_url
                  ? <img src={adForm.image_url} alt={adForm.title||"Ad"} style={{display:"block",width:"100%",height:"100%",objectFit:"contain"}}
                      onError={e=>{e.target.style.display="none";}}/>
                  : <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"var(--text2)",padding:"0 16px",textAlign:"center"}}>
                      {adForm.title}
                    </div>}
                {adForm.cta_text&&<div style={{position:"absolute",bottom:10,right:12,background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:6,pointerEvents:"none"}}>{adForm.cta_text}</div>}
              </div>
            </div>
          )}

          {/* Existing ads list */}
          {ads.length===0
            ? <div style={{textAlign:"center",padding:40,color:"var(--text3)",fontSize:13}}>No ads yet — create your first ad above.</div>
            : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {ads.map(ad=>(
                  <div key={ad.id} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 14px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10}}>
                    {ad.image_url&&<img src={ad.image_url} alt="" style={{width:60,height:40,objectFit:"cover",borderRadius:6,flexShrink:0,border:"1px solid var(--border)"}} onError={e=>e.target.style.display="none"}/>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{ad.title}</div>
                      <div style={{fontSize:11,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span style={{padding:"1px 7px",borderRadius:4,background:"var(--surface2)",border:"1px solid var(--border)"}}>{ad.position==="banner"?"📢 Banner":"🔲 Grid"}</span>
                        <span style={{padding:"1px 7px",borderRadius:4,background:"var(--surface2)",border:"1px solid var(--border)"}}>{ad.page==="all"?"🌐 All pages":ad.page==="workshop"?"🔧 Workshop":ad.page==="spareshop"?"🏪 Spare Shop":ad.page==="scrapyard"?"🚗 Scrapyard":"🛍️ Shop"}</span>
                        {ad.weather_condition&&ad.weather_condition!=="any"&&<span style={{padding:"1px 7px",borderRadius:4,background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)",color:"var(--blue)"}}>{ad.weather_condition==="rain"?"🌧 Rain":ad.weather_condition==="hot"?"🌡️ Hot":ad.weather_condition==="cold"?"🧊 Cold":ad.weather_condition==="snow"?"❄️ Snow":ad.weather_condition==="fog"?"🌫 Fog":ad.weather_condition==="clear"?"☀️ Clear":ad.weather_condition}</span>}
                        {ad.contract_id&&(()=>{const c=adContracts.find(x=>x.id===ad.contract_id||String(x.id)===String(ad.contract_id));return c?<span style={{padding:"1px 7px",borderRadius:4,background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",color:"var(--green)"}}>📑 {c.advertiser_name}</span>:null;})()}
                        {ad.clicks>0&&<span style={{color:"var(--blue)"}}>👆 {ad.clicks} clicks</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:ad.active?"#22c55e":"var(--border)",flexShrink:0}}/>
                      <button className="btn btn-ghost btn-xs" onClick={()=>startEditAd(ad)}>✏️</button>
                      <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>onDeleteAd(ad.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}

function WorkshopQRSection({settings, shopId=1}) {
  const shopName = settings.shop_name || "MotorDesk";
  const token = btoa(JSON.stringify({id:shopId, name:shopName}));
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const regUrl  = `${baseUrl}?ws_register=${token}`;
  const loginUrl= `${baseUrl}?ws_login=1`;
  const qrSize  = 260;
  const qrSrc   = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(regUrl)}&format=png&margin=2`;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(regUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch {}
  };

  const waPhone = settings.whatsapp || settings.phone || "";
  const waText  = `Register your workshop with ${shopName}:\n${regUrl}`;
  const waHref  = waLink(waPhone, waText);

  const printQR = () => {
    const win = window.open("","_blank","width=400,height=500");
    if(!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Workshop QR — ${shopName}</title>
    <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:'DM Sans',Arial,sans-serif;background:#fff;padding:24px;box-sizing:border-box}
    .shop{font-size:22px;font-weight:800;margin-bottom:6px;text-align:center}.sub{font-size:13px;color:#666;margin-bottom:20px;text-align:center}
    .qr{border:3px solid #f97316;border-radius:14px;padding:10px;background:#fff;margin-bottom:18px}
    .url{font-size:9px;color:#888;word-break:break-all;max-width:280px;text-align:center;margin-top:8px}
    .badge{background:#fff7ed;border:1.5px solid #f97316;border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;color:#ea580c;margin-bottom:10px}</style>
    </head><body>
    <div class="badge">Workshop Registration</div>
    <div class="shop">${shopName}</div>
    <div class="sub">Scan to register your workshop</div>
    <div class="qr"><img src="${qrSrc}" width="${qrSize}" height="${qrSize}" alt="QR"/></div>
    <div class="url">${regUrl}</div>
    </body></html>`);
    win.document.close();
    win.onload = () => { win.print(); };
  };

  return (
    <div style={{maxWidth:600}}>
      <div className="card" style={{padding:24}}>
        <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>🔗 Workshop Registration QR</h3>
        <p style={{fontSize:13,color:"var(--text3)",marginBottom:20}}>Share this QR code or link with workshops. When they scan it, they'll be sent to a registration page with your shop name pre-filled and locked — they cannot change it.</p>

        {/* Spare shop name badge */}
        <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.2)",borderRadius:10,padding:"10px 14px",marginBottom:20}}>
          <span style={{fontSize:18}}>🏪</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--accent)",textTransform:"uppercase",letterSpacing:".06em"}}>Your Spare Shop Name (locked in QR)</div>
            <div style={{fontSize:16,fontWeight:800,color:"var(--text)"}}>{shopName}</div>
          </div>
          <span style={{marginLeft:"auto",fontSize:12}}>🔒</span>
        </div>

        <div style={{display:"flex",gap:24,alignItems:"flex-start",flexWrap:"wrap"}}>
          {/* QR code */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{border:"3px solid var(--accent)",borderRadius:12,padding:8,background:"#fff"}}>
              <img src={qrSrc} width={qrSize} height={qrSize} alt="Workshop registration QR" style={{display:"block"}}/>
            </div>
            <div style={{fontSize:11,color:"var(--text3)",textAlign:"center"}}>Scan to register</div>
          </div>

          {/* Actions */}
          <div style={{flex:1,minWidth:220,display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <FL label="Registration Link"/>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input readOnly value={regUrl} style={{flex:1,fontSize:11,padding:"8px 10px",borderRadius:8,border:"1px solid var(--border2)",background:"var(--surface2)",color:"var(--text3)",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis"}}/>
                <button className="btn btn-ghost" style={{flexShrink:0,padding:"8px 12px",fontSize:12}} onClick={copyLink}>
                  {copied?"✅ Copied":"📋 Copy"}
                </button>
              </div>
            </div>

            <div>
              <FL label="Workshop Login Link"/>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input readOnly value={loginUrl} style={{flex:1,fontSize:11,padding:"8px 10px",borderRadius:8,border:"1px solid var(--border2)",background:"var(--surface2)",color:"var(--text3)",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis"}}/>
                <button className="btn btn-ghost" style={{flexShrink:0,padding:"8px 12px",fontSize:12}} onClick={async()=>{try{await navigator.clipboard.writeText(loginUrl);}catch{}}}>
                  📋 Copy
                </button>
              </div>
            </div>

            <button className="btn btn-primary" style={{height:40,fontWeight:700,fontSize:13}} onClick={printQR}>
              🖨️ Print QR Card
            </button>

            {waPhone ? (
              <a href={waHref} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,height:40,borderRadius:9,background:"#25D366",color:"#fff",fontWeight:700,fontSize:13,textDecoration:"none"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                Share via WhatsApp
              </a>
            ) : (
              <div style={{fontSize:12,color:"var(--text3)",background:"var(--surface2)",borderRadius:8,padding:"8px 12px"}}>
                💡 Add your WhatsApp number in Shop settings to enable the WhatsApp share button.
              </div>
            )}

            <div style={{fontSize:11,color:"var(--text3)",lineHeight:1.5,background:"var(--surface2)",borderRadius:8,padding:"10px 12px"}}>
              <strong>How it works:</strong><br/>
              1. Print or share the QR code / link with workshop owners<br/>
              2. They scan or click → fill in their details → register<br/>
              3. Your shop name is permanently locked in their account<br/>
              4. They log in at the Workshop Login link above
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedWorkshopsList({shopName}) {
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopName) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      // Fetch all users with role=workshop linked to this spare shop name or spare_shop_id=1
      const res = await api.get("users",
        `role=eq.workshop&or=(spare_shop_name.eq.${encodeURIComponent(shopName)},spare_shop_id.eq.1)&select=id,name,username,phone,email,spare_shop_name,created_at&order=created_at.desc`
      ).catch(() => []);
      // Also fetch via workshop_profiles linked_branch_id approach
      setWorkshops(Array.isArray(res) ? res.filter(w => w.spare_shop_name === shopName || w.spare_shop_id === 1) : []);
      setLoading(false);
    })();
  }, [shopName]);

  if (loading) return <div style={{fontSize:13,color:"var(--text3)"}}>Loading linked workshops…</div>;

  return (
    <div className="card" style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:2}}>🔧 Linked Workshops</h3>
          <div style={{fontSize:12,color:"var(--text3)"}}>Workshops that registered via your QR code</div>
        </div>
        <div style={{background:"var(--accent)",color:"#fff",borderRadius:20,padding:"3px 12px",fontSize:12,fontWeight:700}}>{workshops.length}</div>
      </div>

      {workshops.length === 0 ? (
        <div style={{textAlign:"center",padding:"28px 16px",color:"var(--text3)",fontSize:13,background:"var(--surface2)",borderRadius:10}}>
          No workshops linked yet. Share your QR code so workshops can register.
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {workshops.map(w => (
            <div key={w.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🔧</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name||w.username}</div>
                <div style={{fontSize:11,color:"var(--text3)",display:"flex",gap:10,marginTop:2,flexWrap:"wrap"}}>
                  {w.username&&<span>👤 {w.username}</span>}
                  {w.phone&&<span>📞 {w.phone}</span>}
                  {w.email&&<span>✉ {w.email}</span>}
                </div>
              </div>
              <div style={{fontSize:10,color:"var(--text3)",flexShrink:0,textAlign:"right"}}>
                {fmtD(w.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INVOICE LINE ITEM EDITOR
// ═══════════════════════════════════════════════════════════════
export function LineItemEditor({items,setItems,parts,showSupplierPartId=false,t}) {
  const addLine=()=>setItems(p=>[...p,{part_id:null,part_name:"",part_sku:"",supplier_part_id:"",qty:1,unit_cost:0,unit_price:0,total:0}]);
  const upd=(i,k,v)=>setItems(p=>p.map((r,idx)=>{
    if(idx!==i)return r;
    const nr={...r,[k]:v};
    if(k==="part_id"){
      const part=parts.find(p=>p.id===+v);
      if(part){
        nr.part_name=part.name;
        nr.part_sku=part.sku; // auto-fill SKU
        nr.unit_cost=part.price||0;
        nr.unit_price=part.price||0;
      }
    }
    if(k==="qty"||k==="unit_cost"||k==="unit_price")
      nr.total=(+nr.qty)*(showSupplierPartId?+nr.unit_cost:+nr.unit_price);
    return nr;
  }));
  const rem=(i)=>setItems(p=>p.filter((_,idx)=>idx!==i));

  return (
    <div>
      <div className="tbl-wrap">
        <table className="inv-table" style={{width:"100%"}}>
          <thead><tr>
            <th>Part</th>
            <th>SKU</th>
            {showSupplierPartId&&<th>Supplier Part ID</th>}
            <th style={{width:70}}>{t.qty}</th>
            <th style={{width:110}}>{showSupplierPartId?t.unitCost:t.unitPrice}</th>
            <th style={{width:110}}>{t.amount}</th>
            <th style={{width:36}}></th>
          </tr></thead>
          <tbody>
            {items.map((item,i)=>(
              <tr key={i}>
                <td>
                  <select className="inp" style={{fontSize:12,padding:"5px 8px"}}
                    value={item.part_id||""} onChange={e=>upd(i,"part_id",e.target.value)}>
                    <option value="">Select part...</option>
                    {parts.map(p=>(
                      <option key={p.id} value={p.id}>
                        {p.name}{p.chinese_desc?" / "+p.chinese_desc:""} — {p.sku}
                      </option>
                    ))}
                  </select>
                </td>
                {/* SKU — auto-filled from part selection, read-only display */}
                <td>
                  <div style={{
                    fontSize:12,fontFamily:"DM Mono,monospace",
                    padding:"5px 8px",color:item.part_sku?"var(--accent)":"var(--text3)",
                    background:"var(--surface3)",borderRadius:6,minWidth:80,
                    border:"1px solid var(--border)"
                  }}>
                    {item.part_sku||"—"}
                  </div>
                </td>
                {showSupplierPartId&&(
                  <td><input className="inp" style={{fontSize:12,padding:"5px 8px",width:100}}
                    value={item.supplier_part_id||""} onChange={e=>upd(i,"supplier_part_id",e.target.value)}
                    placeholder="Supplier ID"/></td>
                )}
                <td><input className="inp" type="number" style={{fontSize:12,padding:"5px 8px",width:60}}
                  value={item.qty} onChange={e=>upd(i,"qty",+e.target.value)} min={1}/></td>
                <td><input className="inp" type="number" style={{fontSize:12,padding:"5px 8px",width:90}}
                  value={showSupplierPartId?item.unit_cost:item.unit_price}
                  onChange={e=>upd(i,showSupplierPartId?"unit_cost":"unit_price",+e.target.value)}/></td>
                <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>
                  {fmtAmt(item.qty*(showSupplierPartId?item.unit_cost:item.unit_price))}
                </td>
                <td><button className="btn btn-danger btn-xs" style={{padding:"3px 7px"}} onClick={()=>rem(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-ghost btn-sm" style={{marginTop:10,width:"100%"}} onClick={addLine}>+ {t.addLine}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INVOICE TOTALS
// ═══════════════════════════════════════════════════════════════
export function InvTotals({items,taxRate,costField="unit_cost",priceField}) {
  const pf=priceField||costField;
  const sub=items.reduce((s,i)=>s+i.qty*(i[pf]||0),0);
  const tax=sub*(taxRate||0)/100;
  const total=sub+tax;
  return (
    <div style={{marginTop:14,borderTop:"1px solid var(--border)",paddingTop:14}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}><span>Subtotal</span><span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:600}}>{fmtAmt(sub)}</span></div>
      {(taxRate||0)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}><span>Tax ({taxRate}%)</span><span style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</span></div>}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:700,color:"var(--accent)"}}><span>Total</span><span style={{fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(total)}</span></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER INVOICE — SMART LINE ITEM EDITOR
// Primary input: Supplier Part # → auto-match → link
// ═══════════════════════════════════════════════════════════════
function SupplierInvoiceLineEditor({items,setItems,suppId,parts,role="admin",branchId=null,branchStock=[],t={},settings={},disabled=false,onEditPart}) {
  const mkRow=()=>({_k:String(Date.now()+Math.random()),supplier_part_id:"",part_id:null,part_name:"",part_sku:"",qty:1,unit_cost:0,_st:"idle",_hits:[],_drop:false,_needsBranchSetup:false,_bsPrice:"",_bsCost:"",_bsBin:"",_skuPart:null,_skuLinks:[]});
  const inputRefs=useRef({});
  const qtyRefs=useRef({});
  const costRefs=useRef({});
  const skuRefs=useRef({});
  const [focusKey,setFocusKey]=useState(null);
  const [focusField,setFocusField]=useState("sup"); // "sup"|"sku"|"qty"|"cost"
  const add=()=>{const row=mkRow();setItems(p=>[...p,row]);setFocusKey(row._k);setFocusField("sup");};
  const upd=(k,patch)=>setItems(p=>p.map(r=>r._k===k?{...r,...patch}:r));
  const rem=k=>setItems(p=>p.filter(r=>r._k!==k));

  const focusQty=(k)=>{if(qtyRefs.current[k]){qtyRefs.current[k].focus();qtyRefs.current[k].select();}};
  const focusCost=(k)=>{if(costRefs.current[k]){costRefs.current[k].focus();costRefs.current[k].select();}};
  const focusSku=(k)=>{if(skuRefs.current[k]){skuRefs.current[k].focus();skuRefs.current[k].select();}};

  useEffect(()=>{
    if(!focusKey)return;
    const map={sup:inputRefs,sku:skuRefs,qty:qtyRefs,cost:costRefs};
    const el=map[focusField]?.current[focusKey];
    if(el){el.focus();if(focusField!=="sup")el.select();}
    setFocusKey(null);
  },[focusKey,focusField,items]);

  const search=async(k,spn)=>{
    const q=(spn||"").trim();
    if(!q)return;
    if(!suppId){upd(k,{_st:"no_supplier"});return;}
    upd(k,{_st:"searching",_drop:false});
    // 1. Exact link in part_suppliers for this supplier
    const linked=await api.get("part_suppliers",`supplier_id=eq.${suppId}&supplier_part_no=eq.${encodeURIComponent(q)}&select=part_id&limit=1`);
    if(Array.isArray(linked)&&linked[0]?.part_id){
      const part=parts.find(p=>p.id===linked[0].part_id);
      if(part){
        const cur=items.find(r=>r._k===k);
        const needsBranchSetup=!!(branchId&&!branchStock.find(bs=>+bs.part_id===+part.id&&String(bs.branch_id)===String(branchId)));
        upd(k,{_st:"linked",part_id:part.id,part_name:part.name,part_sku:part.sku,_drop:false,_needsBranchSetup:needsBranchSetup,_bsPrice:"",_bsCost:String(cur?.unit_cost||""),_bsBin:""});
        setTimeout(()=>focusQty(k),50);
        return;
      }
    }
    // 2. Fuzzy search in local parts (name / sku / oe_number)
    const ql=q.toLowerCase();
    const hits=parts.filter(p=>(p.name||"").toLowerCase().includes(ql)||(p.sku||"").toLowerCase().includes(ql)||(p.oe_number||"").toLowerCase().includes(ql)).slice(0,8);
    if(hits.length){upd(k,{_st:"candidates",_hits:hits,_drop:true});}
    else{upd(k,{_st:"no_match",_hits:[],_drop:false});setTimeout(()=>focusSku(k),50);}
  };

  // Search by SKU — alternative entry when supplier part# is unknown
  const searchBySku=async(k,sku)=>{
    const q=(sku||"").trim().toLowerCase();
    if(!q)return;
    upd(k,{_st:"searching"});
    const found=parts.find(p=>(p.sku||"").toLowerCase()===q)
      ||(q.length>=3?parts.find(p=>(p.sku||"").toLowerCase().includes(q)):null);
    if(!found){upd(k,{_st:"sku_no_match",_drop:false});return;}
    // Fetch existing supplier links for this part so the panel can show them
    const links=await api.get("part_suppliers",`part_id=eq.${found.id}&select=*`).catch(()=>[]);
    upd(k,{_st:"sku_found",part_id:found.id,part_name:found.name,part_sku:found.sku,_skuPart:found,_skuLinks:Array.isArray(links)?links:[],_drop:false});
    setTimeout(()=>focusQty(k),50);
  };

  const linkTo=async(k,item,part)=>{
    const spn=(item.supplier_part_id||"").trim();
    if(suppId&&spn){
      // Check existence first — api.upsert has no on_conflict column so it inserts duplicates
      const existing=await api.get("part_suppliers",`supplier_id=eq.${suppId}&supplier_part_no=eq.${encodeURIComponent(spn)}&limit=1`);
      if(!Array.isArray(existing)||existing.length===0){
        await api.upsert("part_suppliers",{part_id:part.id,supplier_id:+suppId,supplier_part_no:spn});
      }
    }
    const needsBranchSetup=!!(branchId&&!branchStock.find(bs=>+bs.part_id===+part.id&&String(bs.branch_id)===String(branchId)));
    upd(k,{_st:"linked",part_id:part.id,part_name:part.name,part_sku:part.sku,supplier_part_id:(item.supplier_part_id||"").trim(),_drop:false,_hits:[],_needsBranchSetup:needsBranchSetup,_bsPrice:"",_bsCost:String(item.unit_cost||""),_bsBin:""});
    setTimeout(()=>focusQty(k),50);
  };

  const saveBranchSetup=async(k,item)=>{
    if(!branchId||!item.part_id)return;
    upd(k,{_bsSaving:true,_bsErr:null});
    const payload={branch_id:branchId,part_id:+item.part_id,stock:0,updated_at:new Date().toISOString()};
    if(parseFloat(item._bsPrice)) payload.price=parseFloat(item._bsPrice);
    if(parseFloat(item._bsCost)) payload.cost_price=parseFloat(item._bsCost);
    if((item._bsBin||"").trim()) payload.bin_location=item._bsBin.trim();
    // try upsert first (handles duplicate branch+part gracefully)
    const res=await api.upsert("branch_stock",payload);
    if(res?.code||res?.message){
      // upsert failed — try plain insert
      const res2=await api.insert("branch_stock",payload);
      if(res2?.code||res2?.message){
        upd(k,{_bsSaving:false,_bsErr:res2.message||res.message||"Save failed"});
        return;
      }
    }
    upd(k,{_needsBranchSetup:false,_bsSaving:false,_bsErr:null});
  };

  const requestMatch=async(k,item)=>{
    await api.insert("part_requests",{requesting_branch_id:branchId,part_name:item.supplier_part_id,notes:`Match supplier part# "${item.supplier_part_id}" to catalog part`,status:"pending",created_at:new Date().toISOString()});
    upd(k,{_st:"requested",_drop:false});
  };

  return (
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:640}}>
        {/* Header */}
        <div style={{display:"grid",gridTemplateColumns:"160px 1fr 120px 64px 86px 60px 24px",gap:6,padding:"0 2px 6px",borderBottom:"1px solid var(--border)"}}>
          {["Supplier Part #","Part / Description","SKU","Qty","Unit Cost","Amount",""].map((h,i)=>(
            <div key={i} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</div>
          ))}
        </div>

        {items.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--text3)",fontSize:13}}>Click "+ Add Line" to start</div>}

        {items.map(row=>{
          const {_k:k,_st,_hits,_drop}=row;
          const isLinked=_st==="linked";
          const isSearching=_st==="searching";
          const isCandidates=_st==="candidates";
          const isNoMatch=_st==="no_match";
          const isRequested=_st==="requested";
          const linkedStyle={background:"rgba(52,211,153,.06)",borderColor:"rgba(52,211,153,.4)"};
          return (
            <div key={k} style={{marginTop:8}}>
              <div style={{display:"grid",gridTemplateColumns:"160px 1fr 120px 64px 86px 60px 24px",gap:6,alignItems:"start"}}>

                {/* ── Supplier Part # (PRIMARY) ── */}
                <div style={{position:"relative"}}>
                  <div style={{position:"relative"}}>
                    <input className="inp" style={{fontSize:12,paddingRight:26,
                      borderColor:isLinked?"rgba(52,211,153,.5)":isCandidates?"var(--blue)":isNoMatch?"var(--orange)":"var(--border)",
                      background:isLinked?"rgba(52,211,153,.06)":""}}
                      ref={el=>{inputRefs.current[k]=el;}}
                      value={row.supplier_part_id||""}
                      placeholder="Type part # → Enter"
                      onChange={e=>upd(k,{supplier_part_id:e.target.value,_st:"idle",part_id:null,part_name:"",part_sku:"",_drop:false})}
                      onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();search(k,e.target.value);}}}
                      onBlur={e=>{
                        setTimeout(()=>upd(k,{_drop:false}),180);
                        if((e.target.value||"").trim()&&_st==="idle")search(k,e.target.value);
                      }}
                    />
                    <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:11,lineHeight:1,pointerEvents:"none"}}>
                      {isLinked?"✅":isSearching?"⏳":isCandidates?"🔎":isNoMatch?"⚠️":isRequested?"📨":""}
                    </span>
                  </div>
                  {/* Candidate dropdown */}
                  {isCandidates&&_drop&&_hits.length>0&&(
                    <div style={{position:"absolute",top:"100%",left:0,zIndex:400,minWidth:280,background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.5)",overflow:"hidden"}}>
                      <div style={{padding:"5px 10px 4px",fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",borderBottom:"1px solid var(--border)"}}>Select to link &amp; use</div>
                      {_hits.map(p=>(
                        <div key={p.id}
                          style={{padding:"7px 12px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,borderBottom:"1px solid var(--border)"}}
                          onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"}
                          onMouseLeave={e=>e.currentTarget.style.background=""}
                          onMouseDown={e=>{e.preventDefault();linkTo(k,row,p);}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                            <div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{p.sku}</div>
                          </div>
                          <span style={{fontSize:11,color:"var(--blue)",fontWeight:700,flexShrink:0}}>Link →</span>
                        </div>
                      ))}
                      <div style={{padding:5}}>
                        <button className="btn btn-ghost btn-xs" style={{width:"100%",fontSize:11}}
                          onMouseDown={e=>{e.preventDefault();upd(k,{_drop:false,_st:"no_match"});}}>
                          None match ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Part Name ── */}
                <input className="inp" style={{fontSize:12,...(isLinked?linkedStyle:{})}}
                  value={row.part_name||""} placeholder={isLinked?"(auto)":"Part name…"}
                  readOnly={isLinked}
                  onChange={e=>upd(k,{part_name:e.target.value})}/>

                {/* ── SKU — also searchable when not linked ── */}
                <div style={{position:"relative"}}>
                  <input className="inp" style={{fontSize:11,fontFamily:"DM Mono,monospace",paddingRight:isLinked?(onEditPart&&row.part_id?22:4):22,
                    ...( isLinked?linkedStyle
                      :_st==="sku_found"?{borderColor:"rgba(52,211,153,.5)",background:"rgba(52,211,153,.06)"}
                      :_st==="sku_no_match"?{borderColor:"var(--orange)"}
                      :{})}}
                    ref={el=>{skuRefs.current[k]=el;}}
                    value={row.part_sku||""} placeholder={isLinked?"SKU":"SKU → Enter"}
                    readOnly={isLinked}
                    onChange={e=>upd(k,{part_sku:e.target.value,...(!isLinked&&_st!=="idle"?{_st:"idle"}:{})})}
                    onKeyDown={e=>{
                      if(e.key==="Enter"&&!isLinked){e.preventDefault();searchBySku(k,e.target.value);}
                      else if(e.key==="Enter"&&isLinked){e.preventDefault();focusQty(k);}
                    }}
                    onBlur={e=>{if(!isLinked&&(e.target.value||"").trim()&&(_st==="idle"||_st==="sku_no_match"))searchBySku(k,e.target.value);}}
                  />
                  {!isLinked&&<span style={{position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",fontSize:10,pointerEvents:"none",color:"var(--text3)"}}>
                    {_st==="sku_found"?"✅":_st==="sku_no_match"?"⚠️":_st==="searching"?"⏳":""}
                  </span>}
                  {isLinked&&onEditPart&&row.part_id&&(
                    <button type="button" title="Edit this part"
                      onClick={()=>{const p=parts.find(pp=>String(pp.id)===String(row.part_id));if(p)onEditPart(p);}}
                      style={{position:"absolute",right:3,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:12,padding:2,lineHeight:1}}>
                      ✏️
                    </button>
                  )}
                </div>

                {/* ── Qty ── */}
                <input className="inp" type="number" min="1" style={{fontSize:12,textAlign:"center",borderColor:(!disabled&&!(+row.qty>0))?"var(--red)":undefined}}
                  ref={el=>{qtyRefs.current[k]=el;}}
                  value={row.qty||1}
                  disabled={disabled}
                  onChange={e=>upd(k,{qty:+e.target.value||1,total:(+e.target.value||1)*(+row.unit_cost||0)})}
                  onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();focusCost(k);}}}/>

                {/* ── Unit Cost ── */}
                <input className="inp" type="number" min="0" step="0.01" style={{fontSize:12,borderColor:(!disabled&&!(+row.unit_cost>0))?"var(--red)":undefined}}
                  ref={el=>{costRefs.current[k]=el;}}
                  value={row.unit_cost||""}
                  placeholder="0.00"
                  disabled={disabled}
                  onChange={e=>upd(k,{unit_cost:+e.target.value||0,total:(+row.qty||1)*(+e.target.value||0)})}
                  onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}}/>

                {/* ── Amount ── */}
                <div style={{padding:"8px 2px",fontSize:12,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",display:"flex",alignItems:"center"}}>
                  {fmtAmt((+row.qty||1)*(+row.unit_cost||0))}
                </div>

                {/* ── Delete ── */}
                {disabled
                  ? <div/>
                  : <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:15,lineHeight:1,padding:"8px 0"}} onClick={()=>rem(k)}>✕</button>
                }
              </div>

              {/* ── No match action bar ── */}
              {(isNoMatch||_st==="no_supplier")&&(
                <div style={{marginTop:4,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:"6px 10px",background:"rgba(251,191,36,.07)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8}}>
                  <span style={{fontSize:11,color:"var(--yellow)",fontWeight:600,flexShrink:0}}>
                    {_st==="no_supplier"?"⚠️ Select a supplier first":"⚠️ No match — type name manually or request"}
                  </span>
                  {isNoMatch&&<button className="btn btn-ghost btn-xs" onClick={()=>upd(k,{_st:"manual"})}>✏️ Enter manually</button>}
                  {isNoMatch&&role==="branch_admin"&&branchId&&(
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}} onClick={()=>requestMatch(k,row)}>📨 Request match from main</button>
                  )}
                </div>
              )}
              {isRequested&&(
                <div style={{marginTop:4,padding:"5px 10px",background:"rgba(96,165,250,.07)",border:"1px solid rgba(96,165,250,.25)",borderRadius:8,fontSize:11,color:"var(--blue)",fontWeight:600}}>
                  📨 Request sent to main branch — they will link supplier part #{row.supplier_part_id}
                </div>
              )}
              {/* ── SKU found — supplier link panel ── */}
              {_st==="sku_found"&&row._skuPart&&(
                <div style={{marginTop:6,padding:"10px 14px",background:"rgba(52,211,153,.07)",border:"1.5px solid rgba(52,211,153,.35)",borderRadius:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:"var(--green)",marginBottom:4}}>✅ Part found: {row._skuPart.name}</div>
                      {/* Existing supplier links for this part */}
                      {row._skuLinks.length>0?(
                        <div style={{marginBottom:6}}>
                          <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,marginBottom:3}}>EXISTING SUPPLIER CODES LINKED TO THIS PART:</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                            {row._skuLinks.map((lk,i)=>(
                              <span key={i}
                                title="Click to use this code in Supplier Part #"
                                style={{fontSize:11,fontFamily:"DM Mono,monospace",padding:"2px 7px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:4,cursor:"pointer",userSelect:"none",
                                  color:lk.supplier_id===+suppId?"var(--green)":"var(--text2)",
                                  fontWeight:lk.supplier_id===+suppId?700:400}}
                                onMouseDown={e=>{e.preventDefault();linkTo(k,{...row,supplier_part_id:lk.supplier_part_no||""},row._skuPart);}}>
                                {lk.supplier_part_no||"—"}{lk.supplier_id===+suppId?" ← this supplier":""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ):(
                        <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>No supplier codes linked to this part yet.</div>
                      )}
                      {row.supplier_part_id&&(
                        <div style={{fontSize:12,color:"var(--text2)"}}>
                          Confirm: link <strong style={{fontFamily:"DM Mono,monospace"}}>{row.supplier_part_id}</strong> → this part (saved for future auto-match)
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,alignSelf:"center"}}>
                      <button className="btn btn-success btn-sm" onMouseDown={e=>{e.preventDefault();linkTo(k,row,row._skuPart);}}>
                        {row.supplier_part_id?"✅ Link & Use":"✅ Use Part"}
                      </button>
                      <button className="btn btn-ghost btn-sm" onMouseDown={e=>{e.preventDefault();upd(k,{_st:"idle",part_id:null,part_name:"",part_sku:"",_skuPart:null,_skuLinks:[]});}}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {_st==="sku_no_match"&&(
                <div style={{marginTop:4,padding:"5px 10px",background:"rgba(249,115,22,.07)",border:"1px solid rgba(249,115,22,.25)",borderRadius:8,fontSize:11,color:"var(--orange)",fontWeight:600}}>
                  ⚠️ No part found with that SKU — try a different SKU or use the supplier part # field above
                </div>
              )}
              {/* ── Branch stock setup ── */}
              {row._needsBranchSetup&&branchId&&(
                <div style={{marginTop:6,padding:"8px 12px",background:"rgba(251,191,36,.07)",border:"1px solid rgba(251,191,36,.35)",borderRadius:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",marginBottom:6}}>📦 New part for your branch — set price &amp; bin (stock qty comes from invoice):</div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Selling Price</div>
                      <input className="inp" type="number" min="0" step="0.01" value={row._bsPrice||""} placeholder="0.00"
                        onChange={e=>upd(k,{_bsPrice:e.target.value})} style={{width:100,fontSize:12}}/></div>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Cost Price</div>
                      <input className="inp" type="number" min="0" step="0.01" value={row._bsCost||""} placeholder="0.00"
                        onChange={e=>upd(k,{_bsCost:e.target.value})} style={{width:100,fontSize:12}}/></div>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Bin Location</div>
                      <input className="inp" value={row._bsBin||""} placeholder="e.g. A1-01"
                        onChange={e=>upd(k,{_bsBin:e.target.value})} style={{width:100,fontSize:12}}/></div>
                    <div style={{display:"flex",gap:4,alignSelf:"flex-end",paddingBottom:2}}>
                      <button className="btn btn-success btn-xs" onClick={()=>saveBranchSetup(k,row)} disabled={row._bsSaving}>
                        {row._bsSaving?"⏳":"✓"} Set
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={()=>upd(k,{_needsBranchSetup:false,_bsErr:null})}>Skip</button>
                    </div>
                  </div>
                  {row._bsErr&&<div style={{marginTop:4,fontSize:11,color:"var(--red)",fontWeight:600}}>⚠️ {row._bsErr}</div>}
                </div>
              )}
            </div>
          );
        })}

        {!disabled&&<button className="btn btn-ghost btn-sm" style={{width:"100%",marginTop:10,borderStyle:"dashed"}} onClick={add}>+ Add Line</button>}
        {!disabled&&<div style={{marginTop:6,fontSize:11,color:"var(--text3)"}}>
          💡 Supplier Part # → Enter to search &nbsp;·&nbsp; <strong>or</strong> type SKU → Enter to find by catalog SKU &nbsp;·&nbsp; ✅ linked &nbsp;·&nbsp; 🔎 candidates — click to link &nbsp;·&nbsp; ⚠️ not found
        </div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
export function SupplierInvoiceModal({data,suppliers,parts,onSave,onDelete,onStockIn,onEditPart,onClose,t,settings,role="admin",branchId=null,branchStock=[]}) {
  const isNew=data?.isNew;
  const isPaid=data?.status==="paid";
  const isStocked=!!data?.stocked_in;
  const [invNo,setInvNo]=useState(data?.id||"");
  const [suppId,setSuppId]=useState(String(data?.supplier_id||""));
  const [suppSearch,setSuppSearch]=useState(()=>data?.supplier_name||(suppliers.find(s=>s.id===+data?.supplier_id)?.name)||"");
  const [suppOpen,setSuppOpen]=useState(false);
  const [invDate,setInvDate]=useState(data?.invoice_date||today());
  const [dueDate,setDueDate]=useState(data?.due_date||"");
  const [notes,setNotes]=useState(data?.notes||"");
  const [items,setItems]=useState([]);
  const [saving,setSaving]=useState(false);
  const [saveMs,setSaveMs]=useState(0);
  const _saveTimer=useRef(null);

  const sel=suppliers.find(s=>s.id===+suppId);
  const sub=items.reduce((s,i)=>s+(+i.qty||1)*(+i.unit_cost||0),0);
  const tax=sub*(settings.tax_rate||0)/100;
  const total=sub+tax;

  // Validation — every line must have qty > 0 and unit_cost > 0
  const hasInvalidLines=items.length>0&&items.some(i=>!(+i.qty>0)||!(+i.unit_cost>0));
  const canSave=!!suppId&&!!invNo.trim()&&items.length>0&&!hasInvalidLines&&!saving;
  // Unlinked items block Stock In — must be matched to a catalog part first
  const unlinkedItems=items.filter(i=>!i.part_id);

  // Searchable supplier combobox helpers
  const filteredSupps=suppSearch.trim()
    ? suppliers.filter(s=>s.name.toLowerCase().includes(suppSearch.toLowerCase()))
    : suppliers;

  // Load existing items when editing
  useEffect(()=>{
    if(!isNew&&data?.id){
      api.get("supplier_invoice_items",`invoice_id=eq.${data.id}&select=*`).then(r=>{
        if(Array.isArray(r)) setItems(r.map((item,i)=>({...item,_k:item.id||String(i),_st:"linked",_hits:[],_drop:false})));
      });
    }
  },[]);

  // Reset match state on supplier change (new invoices only)
  // Skip rows that already have a supplier_part_id — they stay linked
  useEffect(()=>{
    if(isNew&&suppId) setItems(p=>p.map(r=>(r.supplier_part_id||"").trim()?r:{...r,_st:"idle",part_id:null,part_name:"",part_sku:"",_hits:[],_drop:false}));
  },[suppId]);

  const handleSave=async()=>{
    if(!canSave)return;
    setSaving(true);
    setSaveMs(0);
    const t0=Date.now();
    _saveTimer.current=setInterval(()=>setSaveMs(Date.now()-t0),100);
    try{
      const id=invNo.trim();
      const inv={id,supplier_id:+suppId,supplier_name:sel?.name,invoice_date:invDate,due_date:dueDate,status:data?.status||"pending",subtotal:sub,tax,total,notes};
      const lineItems=items.map(item=>({id:item.id||undefined,part_id:item.part_id?+item.part_id:null,part_name:item.part_name,part_sku:item.part_sku,supplier_part_id:item.supplier_part_id||"",qty:+item.qty||1,unit_cost:+item.unit_cost||0,total:(+item.qty||1)*(+item.unit_cost||0)}));
      await onSave({inv,isNew},lineItems);
    }finally{
      clearInterval(_saveTimer.current);
      setSaving(false);
    }
  };

  const handleDelete=async()=>{
    if(!onDelete||isPaid||isStocked)return;
    if(!window.confirm("Delete this invoice? Stock levels will NOT be reversed."))return;
    setSaving(true);
    await onDelete(data.id);
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 ${isNew?"New Purchase Invoice":"Edit Invoice"}`} onClose={onClose}/>

      {/* Read-only banner after stock-in */}
      {isStocked&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.35)",borderRadius:10,fontSize:13}}>
          <span style={{fontSize:18}}>✅</span>
          <div>
            <div style={{fontWeight:700,color:"var(--green)"}}>Stocked In — view only</div>
            <div style={{fontSize:11,color:"var(--text3)"}}>To return stock, use <strong>Supplier Returns</strong>. Deleting a stocked invoice does not reverse stock.</div>
          </div>
        </div>
      )}

      <FG>
        <div><FL label="Invoice No. *"/><input className="inp" value={invNo} onChange={e=>setInvNo(e.target.value.toUpperCase())} placeholder="e.g. INV-2025-001" disabled={!isNew} style={{fontFamily:"DM Mono,monospace"}}/></div>
        {/* Searchable supplier combobox */}
        <div style={{position:"relative"}}>
          <FL label="Supplier *"/>
          <input className="inp" value={suppSearch}
            placeholder="Type to search supplier…"
            disabled={!isNew}
            onChange={e=>{setSuppSearch(e.target.value);setSuppId("");setSuppOpen(true);}}
            onFocus={()=>{if(isNew)setSuppOpen(true);}}
            onBlur={()=>setTimeout(()=>setSuppOpen(false),180)}
            style={{borderColor:isNew&&!suppId&&suppSearch?"var(--orange)":undefined}}
          />
          {isNew&&suppOpen&&filteredSupps.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:500,background:"var(--surface2)",border:"1px solid var(--border2)",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.45)",maxHeight:220,overflowY:"auto"}}>
              {filteredSupps.map(s=>(
                <div key={s.id}
                  style={{padding:"8px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"}
                  onMouseLeave={e=>e.currentTarget.style.background=""}
                  onMouseDown={e=>{e.preventDefault();setSuppId(String(s.id));setSuppSearch(s.name);setSuppOpen(false);}}>
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </FG>
      <FG>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} disabled={isStocked}/></div>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} disabled={isStocked}/></div>
        <div><FL label={t.notes}/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes" disabled={isStocked}/></div>
      </FG>
      <div className="divider"/>
      <FL label="Line Items"/>
      <SupplierInvoiceLineEditor items={items} setItems={setItems} suppId={suppId} parts={parts} role={role} branchId={branchId} branchStock={branchStock} t={t} settings={settings} disabled={isStocked} onEditPart={onEditPart}/>
      {items.length>0&&<InvTotals items={items} taxRate={settings.tax_rate} costField="unit_cost"/>}

      {/* Validation warning */}
      {hasInvalidLines&&!isStocked&&(
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",marginTop:10,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.35)",borderRadius:8,fontSize:12,color:"var(--red)",fontWeight:600}}>
          ⚠️ All lines must have qty &gt; 0 and cost price &gt; 0. Please fix highlighted fields before saving.
        </div>
      )}

      {/* Unlinked items warning — blocks Stock In */}
      {!isNew&&!isStocked&&unlinkedItems.length>0&&(
        <div style={{marginTop:10,padding:"12px 14px",background:"rgba(249,115,22,.08)",border:"1.5px solid rgba(249,115,22,.4)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700,color:"var(--orange)",marginBottom:6}}>
            ⚠️ {unlinkedItems.length} line{unlinkedItems.length>1?"s":""} not linked — Stock In blocked
          </div>
          <div style={{color:"var(--text2)",marginBottom:8,fontSize:12}}>
            Each line must be matched to a catalog part before stock can be received. Type the supplier part # in the field and press <strong>Enter</strong> to search, then click the matching part to link it.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {unlinkedItems.map((it,i)=>(
              <div key={it._k||i} style={{display:"flex",gap:8,alignItems:"center",fontSize:12,padding:"4px 8px",background:"rgba(249,115,22,.07)",borderRadius:6}}>
                <span style={{color:"var(--orange)",fontWeight:700}}>↳</span>
                <span style={{fontFamily:"DM Mono,monospace",color:"var(--text2)"}}>{it.supplier_part_id||"—"}</span>
                <span style={{color:"var(--text3)"}}>·</span>
                <span>{it.part_name||it.part_description||"(no description)"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:18,flexWrap:"wrap"}}>
        {!isNew&&onDelete&&!isStocked&&(
          <button className="btn btn-danger" style={{flex:1}} onClick={handleDelete} disabled={saving||isPaid}
            title={isPaid?"Cannot delete a paid invoice":undefined}>🗑 Delete</button>
        )}
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{isStocked?"Close":t.cancel}</button>
        {!isNew&&onStockIn&&!isStocked&&(
          <button className="btn btn-warning" style={{flex:2}}
            onClick={async()=>{setSaving(true);await onStockIn(data);setSaving(false);}}
            disabled={saving||unlinkedItems.length>0}
            title={unlinkedItems.length>0?`Link ${unlinkedItems.length} unlinked item(s) first`:undefined}>
            📦 Stock In{unlinkedItems.length>0?` (${unlinkedItems.length} unlinked)`:""}
          </button>
        )}
        {!isStocked&&(
          <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!canSave}>
            {saving?`⏳ Saving… ${(saveMs/1000).toFixed(1)}s`:isNew?"💾 Save":"💾 Update Invoice"}
          </button>
        )}
      </div>
    </Overlay>
  );
}

// VIEW SUPPLIER INVOICE
export function ViewSupplierInvoiceModal({inv,onClose,settings}) {
  const [items,setItems]=useState([]);
  const [showPrintSetup,setShowPrintSetup]=useState(false);
  const [binMap,setBinMap]=useState({});
  useEffect(()=>{
    api.get("supplier_invoice_items",`invoice_id=eq.${inv.id}&select=*`).then(r=>{
      if(Array.isArray(r)){
        setItems(r);
        // pre-fill bins from part records if available
        const ids=r.filter(i=>i.part_id).map(i=>i.part_id);
        if(ids.length) api.get("parts",`id=in.(${ids.join(",")})&select=id,bin_location`).then(ps=>{
          if(!Array.isArray(ps))return;
          const m={};ps.forEach(p=>{m[p.id]=p.bin_location||"";});setBinMap(m);
        });
      }
    });
  },[inv.id]);

  const handlePrintLabels=()=>{
    const labels=[];
    items.forEach(item=>{
      const bin=binMap[item.part_id]||"";
      const total=+item.qty||1;
      for(let i=1;i<=total;i++){
        labels.push({
          sku:item.part_sku||item.part_name,
          name:item.part_name,
          binLocation:bin,
          supplierCode:item.supplier_part_id||"",
          invoiceNo:inv.id,
          seq:`${i}/${total}`,
        });
      }
    });
    openPartLabelsWindow(labels,{
      widthMm:settings?.part_label_w||98,
      heightMm:settings?.part_label_h||45,
      shopName:settings?.shop_name||"",
    });
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 Invoice ${inv.id}`} sub={`${inv.supplier_name} · ${inv.invoice_date}`} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:14,marginBottom:16}}>
        <table className="inv-table" style={{width:"100%"}}>
          <thead><tr><th>Part</th><th>SKU</th><th>Supplier Part ID</th><th>Qty</th><th>Unit Cost</th><th>Amount</th></tr></thead>
          <tbody>{items.map(i=><tr key={i.id}><td>{i.part_name}</td><td style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{i.part_sku}</td><td style={{color:"var(--text3)",fontSize:12}}>{i.supplier_part_id||"—"}</td><td style={{textAlign:"center"}}>{i.qty}</td><td>{fmtAmt(i.unit_cost)}</td><td style={{fontWeight:700,color:"var(--accent)"}}>{fmtAmt(i.total)}</td></tr>)}</tbody>
        </table>
        <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:16}}><span>Total</span><span style={{color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(inv.total)}</span></div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)"}}><span>Status: <StatusBadge status={inv.status}/></span><span>Due: {inv.due_date||"—"}</span></div>

      {/* Print Labels setup panel */}
      {showPrintSetup&&items.length>0&&(
        <div style={{marginTop:14,background:"var(--surface3)",borderRadius:10,border:"1px solid var(--border2)",padding:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🏷️ Set bin location per item before printing</div>
          {items.map(item=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{flex:1,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.part_name} <span style={{color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{item.part_sku}</span></div>
              <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>×{item.qty}</div>
              <input
                className="inp"
                style={{width:100,fontSize:12,padding:"4px 8px"}}
                placeholder="Bin/Location"
                value={binMap[item.part_id]??binMap[`tmp_${item.id}`]??""}
                onChange={e=>{
                  const key=item.part_id||`tmp_${item.id}`;
                  setBinMap(p=>({...p,[key]:e.target.value}));
                }}
              />
            </div>
          ))}
          <div style={{marginTop:8,display:"flex",gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={handlePrintLabels}>🖨️ Open Print Window</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowPrintSetup(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Close</button>
        {!showPrintSetup&&items.length>0&&(
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowPrintSetup(true)}>🏷️ Print Labels</button>
        )}
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER RETURN MODAL
// ═══════════════════════════════════════════════════════════════
export function SupplierReturnModal({suppliers,supplierInvoices,onSave,onClose,t,settings}) {
  const [suppId,setSuppId]=useState("");
  const [origInv,setOrigInv]=useState("");
  const [returnDate,setReturnDate]=useState(today());
  const [reason,setReason]=useState("");
  const [invItems,setInvItems]=useState([]);
  const [returnQtys,setReturnQtys]=useState({});
  const [loadingInv,setLoadingInv]=useState(false);

  const sel=suppliers.find(s=>s.id===+suppId);

  useEffect(()=>{
    if(!origInv){setInvItems([]);setReturnQtys({});return;}
    setLoadingInv(true);
    api.get("supplier_invoice_items",`invoice_id=eq.${origInv}&select=*`).then(r=>{
      const items=Array.isArray(r)?r:[];
      setInvItems(items);
      const qtys={};items.forEach(i=>{qtys[i.id]=i.qty;});setReturnQtys(qtys);
      setLoadingInv(false);
    });
  },[origInv]);

  const selectedItems=invItems.filter(i=>returnQtys[i.id]>0);
  const sub=selectedItems.reduce((s,i)=>s+(returnQtys[i.id]||0)*i.unit_cost,0);

  const handleSave=()=>{
    if(!suppId||selectedItems.length===0)return;
    const id=makeId(settings.credit_note_prefix||"CN");
    const lineItems=selectedItems.map(i=>({part_id:i.part_id,part_name:i.part_name,part_sku:i.part_sku,qty:returnQtys[i.id],unit_cost:i.unit_cost,total:returnQtys[i.id]*i.unit_cost}));
    onSave({id,supplier_id:+suppId,supplier_name:sel?.name,original_invoice_id:origInv,return_date:returnDate,reason,total:sub,status:"pending"},lineItems);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="↩️ New Supplier Return" onClose={onClose}/>
      <FG>
        <div><FL label="Supplier *"/><select className="inp" value={suppId} onChange={e=>{setSuppId(e.target.value);setOrigInv("");}}><option value="">Select...</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div>
          <FL label="Original Invoice *"/>
          <select className="inp" value={origInv} onChange={e=>setOrigInv(e.target.value)}>
            <option value="">Select invoice...</option>
            {supplierInvoices.filter(i=>!suppId||i.supplier_id===+suppId).map(i=><option key={i.id} value={i.id}>{i.id} — {i.supplier_name} ({i.invoice_date})</option>)}
          </select>
        </div>
      </FG>
      <FG>
        <div><FL label={t.returnDate}/><input className="inp" type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></div>
        <div><FL label={t.reason}/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Damaged, wrong item..."/></div>
      </FG>

      {origInv&&(
        <>
          <div className="divider"/>
          <FL label="Select Items to Return (from original invoice)"/>
          {loadingInv&&<p style={{color:"var(--text3)",fontSize:13,padding:"10px 0"}}>Loading...</p>}
          {!loadingInv&&invItems.length>0&&(
            <div style={{background:"var(--surface2)",borderRadius:11,padding:14,border:"1px solid var(--border)"}}>
              <table className="inv-table" style={{width:"100%"}}>
                <thead><tr><th>✓</th><th>Part</th><th>Supplier ID</th><th>Orig Qty</th><th>Return Qty</th><th>Unit Cost</th><th>Credit</th></tr></thead>
                <tbody>
                  {invItems.map(i=>{
                    const rqty=returnQtys[i.id]??i.qty;
                    const checked=rqty>0;
                    return (
                      <tr key={i.id} style={{opacity:checked?1:.5}}>
                        <td><input type="checkbox" className="chk" checked={checked} onChange={e=>setReturnQtys(p=>({...p,[i.id]:e.target.checked?i.qty:0}))}/></td>
                        <td style={{fontWeight:600}}>{i.part_name}</td>
                        <td style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{i.supplier_part_id||"—"}</td>
                        <td style={{textAlign:"center",color:"var(--text3)"}}>{i.qty}</td>
                        <td><input type="number" className="inp" style={{width:65,padding:"4px 8px",fontSize:13}} min={0} max={i.qty} value={rqty} onChange={e=>setReturnQtys(p=>({...p,[i.id]:Math.min(i.qty,Math.max(0,+e.target.value))}))} disabled={!checked}/></td>
                        <td style={{color:"var(--text2)"}}>{fmtAmt(i.unit_cost)}</td>
                        <td style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(rqty*i.unit_cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700}}>
                <span>Total Credit</span>
                <span style={{color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(sub)}</span>
              </div>
            </div>
          )}
        </>
      )}
      {!origInv&&suppId&&<div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.2)",borderRadius:9,padding:"10px 14px",marginTop:10,fontSize:13,color:"var(--blue)"}}>ℹ️ Select an invoice above to see returnable items</div>}

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!suppId||!origInv||selectedItems.length===0}>💾 Save & Stock Out</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
export function CustomerInvoiceModal({data,customers,parts,onSave,onClose,t,settings}) {
  const prefillOrder=data?.order;
  const [custPhone,setCustPhone]=useState(prefillOrder?.customer_phone||"");
  const [custName,setCustName]=useState(prefillOrder?.customer_name||"");
  const [custEmail,setCustEmail]=useState(prefillOrder?.customer_email||"");
  const [orderId,setOrderId]=useState(prefillOrder?.id||"");
  const [invDate,setInvDate]=useState(today());
  const [dueDate,setDueDate]=useState("");
  const [notes,setNotes]=useState("");
  const [items,setItems]=useState(()=>{
    if(prefillOrder?.items) return prefillOrder.items.map(i=>({part_id:i.partId,part_name:i.name,part_sku:"",qty:i.qty,unit_price:i.price,total:i.qty*i.price}));
    return [];
  });

  const sub=items.reduce((s,i)=>s+i.qty*i.unit_price,0);
  const tax=sub*(settings.tax_rate||0)/100;
  const total=sub+tax;

  const fillFromCustomer=(c)=>{setCustName(c.name);setCustPhone(c.phone);setCustEmail(c.email||"");};

  const handleSave=()=>{
    if(!custName||items.length===0)return;
    const id=makeId(settings.invoice_prefix||"INV");
    const inv={id,order_id:orderId,customer_name:custName,customer_phone:custPhone,customer_email:custEmail,invoice_date:invDate,due_date:dueDate,status:"unpaid",subtotal:sub,tax,total,notes};
    const lineItems=items.map(i=>({part_id:i.part_id?+i.part_id:null,part_name:i.part_name,part_sku:i.part_sku||"",qty:+i.qty,unit_price:+i.unit_price,total:+i.qty*+i.unit_price}));
    onSave(inv,lineItems);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="🧾 New Sales Invoice" sub={prefillOrder?`From Order ${prefillOrder.id}`:""} onClose={onClose}/>
      {/* Quick select customer */}
      {customers.length>0&&(
        <FD>
          <FL label="Quick select customer"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {customers.slice(0,8).map(c=><button key={c.id} className="btn btn-ghost btn-xs" style={{borderColor:custPhone===c.phone?"var(--accent)":"var(--border)",color:custPhone===c.phone?"var(--accent)":"var(--text2)"}} onClick={()=>fillFromCustomer(c)}>{c.name}</button>)}
          </div>
        </FD>
      )}
      <FG cols="1fr 1fr 1fr">
        <div><FL label="Customer Name *"/><input className="inp" value={custName} onChange={e=>setCustName(e.target.value)} placeholder="Name"/></div>
        <div><FL label={t.phone}/><input className="inp" type="tel" value={custPhone} onChange={e=>setCustPhone(e.target.value)} placeholder="+886..."/></div>
        <div><FL label={t.email}/><input className="inp" type="email" value={custEmail} onChange={e=>setCustEmail(e.target.value)}/></div>
      </FG>
      <FG>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
      </FG>
      <div className="divider"/>
      <FL label="Line Items"/>
      <LineItemEditor items={items} setItems={setItems} parts={parts} showSupplierPartId={false} t={t}/>
      {items.length>0&&<InvTotals items={items} taxRate={settings.tax_rate} priceField="unit_price"/>}
      <FD><FL label={t.notes}/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!custName||items.length===0}>💾 Create Invoice</button>
      </div>
    </Overlay>
  );
}

// VIEW CUSTOMER INVOICE
export function ViewCustomerInvoiceModal({inv,onClose,settings}) {
  const [items,setItems]=useState([]);
  useEffect(()=>{api.get("customer_invoice_items",`invoice_id=eq.${inv.id}&select=*`).then(r=>setItems(Array.isArray(r)?r:[]));},[inv.id]); 
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 Invoice ${inv.id}`} sub={`${inv.customer_name} · ${inv.invoice_date}`} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:14,marginBottom:16}}>
        <div style={{marginBottom:12,fontSize:13,color:"var(--text2)"}}><strong style={{color:"var(--text)"}}>{inv.customer_name}</strong> · {inv.customer_phone} {inv.customer_email&&`· ${inv.customer_email}`}</div>
        <table className="inv-table" style={{width:"100%"}}>
          <thead><tr><th>Part</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
          <tbody>{items.map(i=><tr key={i.id}><td>{i.part_name}</td><td style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{i.part_sku}</td><td style={{textAlign:"center"}}>{i.qty}</td><td>{fmtAmt(i.unit_price)}</td><td style={{fontWeight:700,color:"var(--accent)"}}>{fmtAmt(i.total)}</td></tr>)}</tbody>
        </table>
        <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:5}}><span>Subtotal</span><span>{fmtAmt(inv.subtotal)}</span></div>
          {(inv.tax||0)>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:5}}><span>Tax</span><span>{fmtAmt(inv.tax)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:17}}><span>Total</span><span style={{color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(inv.total)}</span></div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)"}}><StatusBadge status={inv.status}/><span>{inv.notes||""}</span></div>
      <button className="btn btn-ghost" style={{width:"100%",marginTop:16}} onClick={onClose}>Close</button>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER RETURN MODAL
// ═══════════════════════════════════════════════════════════════
export function CustomerReturnModal({data,customerInvoices,onSave,onClose,t,settings}) {
  const prefillInv=data?.invoice;
  const [custPhone,setCustPhone]=useState(prefillInv?.customer_phone||"");
  const [custName,setCustName]=useState(prefillInv?.customer_name||"");
  const [invId,setInvId]=useState(prefillInv?.id||"");
  const [returnDate,setReturnDate]=useState(today());
  const [reason,setReason]=useState("");
  // returnItems: checkboxes of original invoice items, qty to return
  const [invItems,setInvItems]=useState([]); // original invoice line items
  const [returnQtys,setReturnQtys]=useState({}); // part_id -> qty to return
  const [loadingInv,setLoadingInv]=useState(false);

  // Load invoice items when invoice is selected
  useEffect(()=>{
    if(!invId){setInvItems([]);setReturnQtys({});return;}
    setLoadingInv(true);
    api.get("customer_invoice_items",`invoice_id=eq.${invId}&select=*`).then(r=>{
      const items=Array.isArray(r)?r:[];
      setInvItems(items);
      // Default: return all qty
      const qtys={};items.forEach(i=>{qtys[i.id]=i.qty;});setReturnQtys(qtys);
      setLoadingInv(false);
    });
  },[invId]);

  const selectedItems=invItems.filter(i=>returnQtys[i.id]>0);
  const sub=selectedItems.reduce((s,i)=>s+(returnQtys[i.id]||0)*i.unit_price,0);

  const handleSave=()=>{
    if(!custName||selectedItems.length===0)return;
    const id=makeId(settings.credit_note_prefix||"CN");
    const lineItems=selectedItems.map(i=>({
      part_id:i.part_id,part_name:i.part_name,part_sku:i.part_sku||"",
      qty:returnQtys[i.id],unit_price:i.unit_price,total:returnQtys[i.id]*i.unit_price
    }));
    onSave({id,invoice_id:invId,customer_name:custName,customer_phone:custPhone,return_date:returnDate,reason,total:sub,status:"pending"},lineItems);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`↩️ Customer Return${prefillInv?` — ${prefillInv.id}`:""}`} onClose={onClose}/>
      <FG>
        <div><FL label="Customer Name *"/><input className="inp" value={custName} onChange={e=>setCustName(e.target.value)} placeholder="Name"/></div>
        <div><FL label={t.phone}/><input className="inp" type="tel" value={custPhone} onChange={e=>setCustPhone(e.target.value)}/></div>
      </FG>
      <FG>
        <div>
          <FL label="Original Invoice *"/>
          <select className="inp" value={invId} onChange={e=>setInvId(e.target.value)}>
            <option value="">Select invoice...</option>
            {customerInvoices.filter(i=>!custPhone||i.customer_phone===custPhone).map(i=><option key={i.id} value={i.id}>{i.id} — {i.customer_name} ({i.invoice_date})</option>)}
          </select>
        </div>
        <div><FL label={t.returnDate}/><input className="inp" type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></div>
      </FG>
      <FD><FL label={t.reason}/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Wrong item, damaged, not needed..."/></FD>

      {/* Invoice items — only show when invoice selected */}
      {invId&&(
        <>
          <div className="divider"/>
          <FL label="Select Items to Return (from original invoice)"/>
          {loadingInv&&<p style={{color:"var(--text3)",fontSize:13,padding:"10px 0"}}>Loading invoice items...</p>}
          {!loadingInv&&invItems.length===0&&<p style={{color:"var(--text3)",fontSize:13,padding:"10px 0"}}>No items found for this invoice</p>}
          {!loadingInv&&invItems.length>0&&(
            <div style={{background:"var(--surface2)",borderRadius:11,padding:14,border:"1px solid var(--border)"}}>
              <table className="inv-table" style={{width:"100%"}}>
                <thead><tr><th>✓</th><th>Part</th><th>SKU</th><th>Orig Qty</th><th>Return Qty</th><th>Unit Price</th><th>Refund</th></tr></thead>
                <tbody>
                  {invItems.map(i=>{
                    const rqty=returnQtys[i.id]??i.qty;
                    const checked=rqty>0;
                    return (
                      <tr key={i.id} style={{opacity:checked?1:.5}}>
                        <td><input type="checkbox" className="chk" checked={checked} onChange={e=>setReturnQtys(p=>({...p,[i.id]:e.target.checked?i.qty:0}))}/></td>
                        <td style={{fontWeight:600}}>{i.part_name}</td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{i.part_sku}</code></td>
                        <td style={{textAlign:"center",color:"var(--text3)"}}>{i.qty}</td>
                        <td>
                          <input type="number" className="inp" style={{width:65,padding:"4px 8px",fontSize:13}} min={0} max={i.qty}
                            value={rqty} onChange={e=>setReturnQtys(p=>({...p,[i.id]:Math.min(i.qty,Math.max(0,+e.target.value))}))}
                            disabled={!checked}/>
                        </td>
                        <td style={{color:"var(--text2)"}}>{fmtAmt(i.unit_price)}</td>
                        <td style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(rqty*i.unit_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700}}>
                <span>Total Refund</span>
                <span style={{color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(sub)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {!invId&&<div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.2)",borderRadius:9,padding:"10px 14px",marginTop:10,fontSize:13,color:"var(--blue)"}}>ℹ️ Please select an invoice above to see returnable items</div>}

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!custName||!invId||selectedItems.length===0}>💾 Save & Restore Stock</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// ALL OTHER MODALS
// ═══════════════════════════════════════════════════════════════
// ── Part Actions Dropdown (... menu) ────────────────────────
export function PartActionsMenu({onAdjust,onEdit,onMove,onSupplier,onRfq,onLogs,onDelete,onPrintLabel,t}) {
  const [open,setOpen] = useState(false);
  const [menuPos,setMenuPos] = useState({top:0,left:0});
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(()=>{
    const handler=(e)=>{
      if(btnRef.current&&btnRef.current.contains(e.target)) return;
      if(menuRef.current&&menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  const handleOpen=()=>{
    if(btnRef.current){
      const rect=btnRef.current.getBoundingClientRect();
      const spaceBelow=window.innerHeight-rect.bottom;
      const menuH=220; // approx menu height
      const top=spaceBelow>menuH ? rect.bottom+4 : rect.top-menuH-4;
      setMenuPos({top,left:Math.min(rect.right-170, window.innerWidth-180)});
    }
    setOpen(o=>!o);
  };

  const actions = [
    {label:"± "+t.adjustStock, color:"var(--yellow)", fn:onAdjust},
    {label:"✏️ "+t.edit, color:"var(--text)", fn:onEdit},
    {label:"🔀 "+t.stockMove, color:"var(--blue)", fn:onMove},
    {label:"🏭 Suppliers", color:"var(--purple)", fn:onSupplier},
    {label:"📩 RFQ", color:"var(--blue)", fn:onRfq},
    {label:"📝 Stock Logs", color:"var(--text2)", fn:onLogs},
    ...(onPrintLabel?[{label:"🏷️ Print Label", color:"var(--green)", fn:onPrintLabel}]:[]),
    {label:"🗑 "+t.delete, color:"var(--red)", fn:onDelete, danger:true},
  ];

  return (
    <div ref={ref} style={{position:"relative",display:"inline-block"}}>
      <button
        ref={btnRef}
        className="btn btn-ghost btn-xs"
        style={{fontWeight:700,fontSize:16,letterSpacing:2,padding:"4px 10px"}}
        onClick={handleOpen}
        title="Actions"
      >•••</button>
      {open&&createPortal(
        <div ref={menuRef} style={{
          position:"fixed",top:menuPos.top,left:menuPos.left,
          background:"var(--surface2)",border:"1px solid var(--border2)",
          borderRadius:10,padding:6,zIndex:9999,
          minWidth:170,boxShadow:"0 8px 32px rgba(0,0,0,.6)",
          animation:"fadeUp .15s ease"
        }}>
          {actions.map(a=>(
            <button key={a.label}
              onClick={()=>{a.fn();setOpen(false);}}
              style={{
                display:"block",width:"100%",padding:"8px 12px",
                background:"none",border:"none",cursor:"pointer",
                color:a.danger?"var(--red)":a.color||"var(--text)",
                fontSize:13,fontFamily:"DM Sans,sans-serif",fontWeight:500,
                textAlign:"left",borderRadius:7,transition:"background .15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}
            >{a.label}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GRAB IMAGE OVERLAY — opens supplier page + waits for Ctrl+V paste
// ═══════════════════════════════════════════════════════════════
function GrabImageOverlay({supplierUrl,partSku,onSave,onClose}) {
  const [status,setStatus]=useState("waiting"); // waiting|uploading|done|err
  const [errMsg,setErrMsg]=useState("");
  const SCRIPT_URL=(typeof window._VEHICLE_SCRIPT_URL==="string"&&window._VEHICLE_SCRIPT_URL)||(typeof window._APPS_SCRIPT_URL==="string"&&window._APPS_SCRIPT_URL)||"";

  const upload=async(file)=>{
    if(!file||!file.type.startsWith("image/"))return;
    if(!SCRIPT_URL){setErrMsg("Apps Script URL not configured in Settings → System");setStatus("err");return;}
    setStatus("uploading");
    try{
      const MAX=1200;
      const base64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=ev=>{
          const img=new Image();
          img.onload=()=>{
            const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror=reject;
          img.src=ev.target.result;
        };
        reader.onerror=reject;
        reader.readAsDataURL(file);
      });
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({image:base64,filename:`${partSku||"part"}.png`,mimeType:"image/png"})});
      const result=await resp.json();
      if(result.success){setStatus("done");onSave(result.url);setTimeout(onClose,1400);}
      else{setErrMsg(result.error||"Upload failed");setStatus("err");}
    }catch(e){setErrMsg(String(e));setStatus("err");}
  };

  useEffect(()=>{
    const onPaste=async(e)=>{
      if(status!=="waiting")return;
      const items=e.clipboardData?.items;
      if(!items)return;
      for(const item of items){
        if(item.type.startsWith("image/")){
          const file=item.getAsFile();
          if(file){upload(file);return;}
        }
      }
    };
    document.addEventListener("paste",onPaste);
    return()=>document.removeEventListener("paste",onPaste);
  },[status]);

  return (
    <div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--surface)",borderRadius:18,padding:32,maxWidth:440,width:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,.6)",textAlign:"center"}}>
        {status==="waiting"&&<>
          <div style={{fontSize:40,marginBottom:10}}>🖼</div>
          <div style={{fontWeight:700,fontSize:17,marginBottom:8}}>Grab Image from Supplier</div>
          <div style={{fontSize:13,color:"var(--text2)",marginBottom:20,lineHeight:1.7}}>
            The supplier page opened in a new tab.<br/>
            <strong>Right-click the product image → Copy image</strong><br/>
            then press <kbd style={{background:"var(--surface2)",borderRadius:4,padding:"2px 7px",fontFamily:"DM Mono,monospace",fontSize:12,border:"1px solid var(--border2)"}}>Ctrl+V</kbd> anywhere here
          </div>
          <div style={{background:"var(--surface2)",border:"2px dashed var(--border2)",borderRadius:12,padding:"22px 16px",marginBottom:18,fontSize:13,color:"var(--text3)"}}>
            ⏳ Waiting for paste…
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </>}
        {status==="uploading"&&<>
          <div style={{fontSize:40,marginBottom:10}}>⏳</div>
          <div style={{fontWeight:700,fontSize:16}}>Uploading to Google Drive…</div>
        </>}
        {status==="done"&&<>
          <div style={{fontSize:40,marginBottom:10}}>✅</div>
          <div style={{fontWeight:700,fontSize:16,color:"var(--green)"}}>Image saved!</div>
        </>}
        {status==="err"&&<>
          <div style={{fontSize:40,marginBottom:10}}>❌</div>
          <div style={{fontWeight:700,fontSize:15,color:"var(--red)",marginBottom:8}}>Upload failed</div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>{errMsg}</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStatus("waiting")}>Try again</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// Unlimited extra photos for a part — thumbnail strip + add/remove. Uploads go
// straight to Supabase Storage (no AI background removal — these are quick
// reference shots, unlike the primary catalog photo).
function ExtraPhotosStrip({photos, onChange, sku, onOpenLightbox}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const addFiles = async (files) => {
    const imgFiles = Array.from(files||[]).filter(f=>f.type.startsWith("image/"));
    if(!imgFiles.length) return;
    setUploading(true);
    try{
      const newUrls = [];
      for(const file of imgFiles){
        const blob = await new Promise((resolve,reject)=>{
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            const MAX = 1200;
            let w=img.width, h=img.height;
            if(w>MAX||h>MAX){ const r=Math.min(MAX/w,MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
            const canvas=document.createElement("canvas");
            canvas.width=w; canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            canvas.toBlob(b=>b?resolve(b):reject(new Error("toBlob failed")),"image/jpeg",0.9);
          };
          img.onerror = reject;
          img.src = url;
        });
        const path = `parts/${String(sku||"part").replace(/[^a-zA-Z0-9_-]/g,"_")}/extra-${Date.now()}-${newUrls.length}.jpg`;
        const url = await uploadToStorage("cars_parts", path, blob);
        newUrls.push(url);
      }
      onChange([...(photos||[]), ...newUrls]);
    }catch(e){ alert("Upload failed: "+e.message); }
    setUploading(false);
  };

  const removeAt = (idx) => onChange((photos||[]).filter((_,i)=>i!==idx));

  return (
    <div style={{marginTop:10}}>
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>
        📸 Extra Photos{photos?.length>0?` (${photos.length})`:""}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {(photos||[]).map((url,i)=>(
          <div key={url+i} style={{position:"relative",width:52,height:52,borderRadius:6,overflow:"hidden",border:"1px solid var(--border)",cursor:"pointer",flexShrink:0}}
            onClick={()=>onOpenLightbox(i)}>
            <img src={toImgUrl(url)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} referrerPolicy="no-referrer"/>
            <button onClick={e=>{e.stopPropagation();removeAt(i);}} title="Remove"
              style={{position:"absolute",top:-1,right:-1,width:17,height:17,borderRadius:"50%",background:"rgba(0,0,0,.65)",color:"#fff",border:"none",fontSize:10,lineHeight:1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        ))}
        <div onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);addFiles(e.dataTransfer.files);}}
          style={{width:52,height:52,borderRadius:6,border:`1.5px dashed ${dragOver?"var(--accent)":"var(--border2)"}`,
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,
            background:dragOver?"rgba(99,102,241,.08)":"transparent",fontSize:18,color:"var(--text3)"}}>
          {uploading?"⏳":"+"}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
          onChange={e=>{addFiles(e.target.files); e.target.value="";}}/>
      </div>
    </div>
  );
}

// Smart image preview with clear status feedback
export function PartModal({part,onSave,onDelete,onClose,t,vehicles=[],partFitments=[],onSaveFitment,onDeleteFitment,onGoVehicles,onRefreshVehicles,onGoSupplier,onGoToPart,onGoToMainPart,onCreateOpposite,inquiries=[],rfqQuotes=[],rfqItems=[],rfqSessions=[],initialTab,initialFitSearch="",prevPart,nextPart,branches=[],currentBranch=null,allParts=[],onRequestNewPart=null,onAddNewPart=null,initialF=null,branchSkuPrefix="",partSuppliers=[],suppliers=[],allPartSuppliers=[],onSavePartSupplier,onDeletePartSupplier,onUpdatePartSupplier,onLoadSuppliers,onAddSupplier,onEditSupplier,onGoBack=null}) {
  const parsePhotos = (v) => { if(Array.isArray(v)) return v; try{ const a=JSON.parse(v||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } };
  const makeF = (p) => p?{
    sku:p.sku||"", name:p.name||"", category:p.category||"Engine",
    brand:p.brand||"", price:p.price??"", cost_price:p.cost_price??"", stock:p.stock??0, minStock:p.min_stock??0,
    image_url:p.image_url||"", photos:parsePhotos(p.photos), chinese_desc:p.chinese_desc||"",
    make:p.make||"", model:p.model||"", year_range:p.year_range||"", oe_number:p.oe_number||"",
    reference_url:p.reference_url||"",
    bin_location:p.bin_location||"", is_quantum:p.is_quantum||false, is_hiace:p.is_hiace||false,
    auto_reorder:p.auto_reorder||false, reorder_point:p.reorder_point??0, reorder_qty:p.reorder_qty??1,
    preferred_supplier_id:p.preferred_supplier_id||"",
  }:{
    sku:branchSkuPrefix?branchSkuPrefix+"-":"", name:"", category:"Engine", brand:"", price:0, cost_price:0, stock:"", minStock:"",
    image_url:"", photos:[], chinese_desc:"", make:"", model:"", year_range:"", oe_number:"", reference_url:"", bin_location:"", is_quantum:false, is_hiace:false,
    auto_reorder:false, reorder_point:0, reorder_qty:1, preferred_supplier_id:"",
  };
  const [f,setF]=useState(()=>initialF?{...makeF(part),...initialF}:makeF(part));
  const [ptab, setPtab] = useState(()=>{
    if(!initialTab||initialTab==="info"||initialTab==="photo") return "stock";
    return initialTab;
  });
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [oppConfirm, setOppConfirm] = useState(null);
  const [newPartConfirm, setNewPartConfirm] = useState(null); // {copyFits, copyVehicleInfo}
  const [deleting, setDeleting] = useState(false);
  const s=(k,v)=>{ setF(p=>({...p,[k]:v})); setDirty(true); setSaved(false); };
  const [catalogSearch,setCatalogSearch]=useState("");
  const [suppId,setSuppId]=useState("");
  const [suppPrice,setSuppPrice]=useState("");
  const [suppLead,setSuppLead]=useState("");
  const [suppMinOrd,setSuppMinOrd]=useState(1);
  const [suppPartNo,setSuppPartNo]=useState("");
  const [suppPartNoErr,setSuppPartNoErr]=useState("");
  const [editingPsId,setEditingPsId]=useState(null);
  const [editPsPartNo,setEditPsPartNo]=useState("");
  // Live-fetched links for the selected supplier — used for duplicate detection
  const [suppDupLinks,setSuppDupLinks]=useState([]);
  useEffect(()=>{
    if(!suppId){setSuppDupLinks([]);return;}
    api.get("part_suppliers",`supplier_id=eq.${suppId}&select=*`)
      .then(d=>setSuppDupLinks(Array.isArray(d)?d:[]))
      .catch(()=>{});
  },[suppId]);
  const [grabImg,setGrabImg]=useState(null); // {url,partNo,suppName} — triggers GrabImageOverlay
  const mainBranch=branches.find(b=>b.is_main);
  const isNonMainBranch=!part&&currentBranch&&mainBranch&&currentBranch.id!==mainBranch.id;

  const side = part ? detectSide(f.sku, f.name) : null;
  const myFitments = part ? partFitments.filter(pf=>String(pf.part_id)===String(part.id)) : [];

  const buildPayload=(fv)=>({
    sku:fv.sku.trim(), name:fv.name.trim(), category:fv.category, brand:fv.brand,
    price:+fv.price, cost_price:+fv.cost_price||0, stock:+fv.stock, min_stock:+fv.minStock,
    image_url:fv.image_url, photos:fv.photos||[], chinese_desc:fv.chinese_desc,
    make:fv.make, model:fv.model, year_range:fv.year_range, oe_number:fv.oe_number,
    reference_url:fv.reference_url||"",
    bin_location:fv.bin_location||"", is_quantum:!!fv.is_quantum, is_hiace:!!fv.is_hiace,
    auto_reorder:!!fv.auto_reorder, reorder_point:+fv.reorder_point||0, reorder_qty:+fv.reorder_qty||1,
    preferred_supplier_id:fv.preferred_supplier_id?+fv.preferred_supplier_id:null,
  });

  // Auto-save immediately when photo is uploaded (existing part only)
  const handlePhotoChange = (url) => {
    const updated = {...f, image_url: url};
    setF(updated);
    if (part) { onSave(buildPayload(updated), true); setDirty(false); setSaved(true); }
    else setDirty(true);
  };
  const handlePhotosChange = (newPhotos) => {
    const updated = {...f, photos: newPhotos};
    setF(updated);
    if (part) { onSave(buildPayload(updated), true); setDirty(false); setSaved(true); }
    else setDirty(true);
  };
  const [extraLightbox, setExtraLightbox] = useState(null); // {idx} — urls built from f.image_url + f.photos

  const handleClose = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  };

  const validate = () => {
    const e = {};
    const skuVal = f.sku.trim();
    if(!skuVal || (branchSkuPrefix && skuVal === branchSkuPrefix+"-")) e.sku = "SKU is required";
    if(!f.name.trim())  e.name  = "Name is required";
    if(f.price===""||f.price===null) e.price = "Price is required";
    if(!part&&skuVal&&skuVal!==(branchSkuPrefix?branchSkuPrefix+"-":"")){
      const scopeId=currentBranch?.id??null;
      const isDup=branchSkuPrefix
        ?allParts.some(p=>p.branch_id===scopeId&&p.sku===skuVal)
        :allParts.some(p=>p.sku===skuVal);
      if(isDup) e.dupSku=branchSkuPrefix?"This SKU already exists in your branch — choose a different number":"This SKU already exists — choose a different one";
    }
    setErrors(e);
    if(Object.keys(e).length>0){
      if(e.price) setPtab("stock");
      return false;
    }
    return true;
  };

  const partRfqs = part ? inquiries.filter(i=>String(i.part_id)===String(part.id)) : [];
  // rfq_quotes for this part (via rfq_items)
  const partItemIds = part ? rfqItems.filter(i=>String(i.part_id)===String(part.id)).map(i=>i.id) : [];
  const partSessionQuotes = rfqQuotes.filter(q=>partItemIds.includes(q.rfq_item_id));
  const rfqTotal = partRfqs.length + partSessionQuotes.length;
  const TABS = [
    {id:"stock",   label:`💰 ${t.stock}`},
    {id:"vehicle", label:`🚗 ${t.pmTabVehicle}`},
    {id:"fitment", label:`🔗 ${t.pmTabFits}`},
    {id:"rfq",     label:`📩 ${t.pmTabRfq}${rfqTotal>0?" ("+rfqTotal+")":""}`},
    ...(part&&onSavePartSupplier?[{id:"supplier",label:`🏭 Suppliers${partSuppliers.length>0?" ("+partSuppliers.length+")":""}`}]:[]),
    ...(part?[{id:"reorder",label:`🔄 Reorder${part?.auto_reorder?"  ✓":""}`}]:[]),
  ];

  return (
    <Overlay onClose={handleClose} wide>
      <MHead title={part?`✏️ ${t.pmEditPart}`:`+ ${t.pmNewPart}`} onClose={handleClose}
        actions={part&&onDelete&&(
          <button className="btn btn-danger btn-sm" disabled={deleting} onClick={async()=>{
            if(!window.confirm(`Delete ${part.sku||"this part"}${part.name?" · "+part.name:""}? This cannot be undone.`)) return;
            setDeleting(true);
            try{ await onDelete(part); }finally{ setDeleting(false); }
          }}>{deleting?"Deleting…":"🗑️ Delete"}</button>
        )}/>
      {onGoBack&&(
        <button className="btn btn-ghost btn-sm" style={{marginBottom:10,fontSize:12,color:"var(--blue)"}} onClick={onGoBack}>
          ← Back to Supplier Catalogue
        </button>
      )}

      {/* Copy from main catalog — shown only when adding a new part at a branch */}
      {isNonMainBranch&&(
        <div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.25)",borderRadius:10,padding:12,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:"var(--blue)"}}>🏠 {t.branchCopyTitle||"Copy from Main Catalog"}</div>
          <input className="inp" placeholder={t.branchCopyPlaceholder||"Search main catalog by SKU or name…"} value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} style={{marginBottom:catalogSearch.trim()?8:0}}/>
          {catalogSearch.trim()&&(()=>{
            const q=catalogSearch.trim().toLowerCase();
            const hits=allParts.filter(p=>p.branch_id===mainBranch.id&&((p.sku||"").toLowerCase().includes(q)||(p.name||"").toLowerCase().includes(q))).slice(0,8);
            if(!hits.length) return (
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",gap:8}}>
                <div style={{color:"var(--text3)",fontSize:12}}>{t.branchCopyNoResults||"No parts found in main catalog"}</div>
                {onRequestNewPart&&<button className="btn btn-ghost btn-sm" style={{fontSize:11,color:"var(--accent)",whiteSpace:"nowrap",flexShrink:0}} onClick={onRequestNewPart}>📬 Request New Part →</button>}
              </div>
            );
            return hits.map(p=>{
              const delFee=currentBranch.default_delivery_fee||0;
              const delPct=currentBranch.default_delivery_pct||0;
              const suggestedPrice=delPct>0?+(p.price*(1+delPct/100)+delFee).toFixed(2):+(p.price+delFee).toFixed(2);
              return (
                <div key={p.id} onClick={()=>{
                  setF({sku:p.sku||"",name:p.name||"",category:p.category||"Engine",brand:p.brand||"",
                    price:suggestedPrice,cost_price:p.price,stock:0,minStock:p.min_stock??0,
                    image_url:p.image_url||"",chinese_desc:p.chinese_desc||"",
                    make:p.make||"",model:p.model||"",year_range:p.year_range||"",oe_number:p.oe_number||"",
                    bin_location:""});
                  setDirty(true);setCatalogSearch("");
                }} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderRadius:7,cursor:"pointer",border:"1px solid var(--border)",background:"var(--surface)",marginBottom:4,transition:"background .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="var(--surface)"}>
                  <span style={{fontWeight:700,color:"var(--accent)",minWidth:90,fontSize:12}}>{p.sku}</span>
                  <span style={{flex:1,fontSize:12}}>{p.name}</span>
                  <span style={{fontSize:11,color:"var(--text3)"}}>{t.branchCopyMain||"Main"}: {p.price} → {t.branchCopySuggested||"Suggested"}: {suggestedPrice}</span>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ── ALWAYS VISIBLE: Info + Photo ── */}
      <div style={{display:"flex",gap:18,marginBottom:18,alignItems:"flex-start"}}>
        {/* LEFT: Info fields */}
        <div style={{flex:"1 1 0",minWidth:0}}>
          <FG>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <FL label={`${t.sku} *`}/>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {prevPart&&onGoToPart&&<button className="cp-btn" title={`‹ ${prevPart.sku}`}
                    onClick={()=>onGoToPart(prevPart.sku)}>‹ {prevPart.sku}</button>}
                  {nextPart&&onGoToPart&&<button className="cp-btn" title={`${nextPart.sku} ›`}
                    onClick={()=>onGoToPart(nextPart.sku)}>{nextPart.sku} ›</button>}
                  {f.sku&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.sku)}>📋</button>}
                </div>
              </div>
              {branchSkuPrefix&&!part ? (
                <div style={{display:"flex",alignItems:"stretch"}}>
                  <div style={{padding:"11px 12px",background:"rgba(99,102,241,.15)",border:"1.5px solid rgba(99,102,241,.4)",borderRight:"none",borderRadius:"9px 0 0 9px",fontSize:13,fontWeight:700,color:"#818cf8",fontFamily:"DM Mono,monospace",userSelect:"none",display:"flex",alignItems:"center",whiteSpace:"nowrap",gap:5}}>
                    🔒 {branchSkuPrefix}-
                  </div>
                  <input className="inp" autoFocus
                    value={f.sku.startsWith(branchSkuPrefix+"-")?f.sku.slice(branchSkuPrefix.length+1):""}
                    onChange={e=>{s("sku",branchSkuPrefix+"-"+e.target.value.toUpperCase());setErrors(p=>({...p,sku:"",dupSku:""}));}}
                    placeholder="001"
                    style={{borderRadius:"0 9px 9px 0",flex:1,borderColor:(errors.sku||errors.dupSku)?"var(--red)":undefined}}/>
                </div>
              ):(
                <input className="inp" value={f.sku} onChange={e=>{s("sku",e.target.value.toUpperCase());setErrors(p=>({...p,sku:"",dupSku:""}));}}
                  placeholder="GP00001" style={{borderColor:(errors.sku||errors.dupSku)?"var(--red)":undefined}}/>
              )}
              <FormError errors={errors} k="sku"/>
              {errors.dupSku&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {errors.dupSku}</div>}
              {(()=>{
                if(part) return null;
                const typed=f.sku.trim();
                let skuList;
                if(!typed) return null;
                if(branchSkuPrefix){
                  const suffix=typed.startsWith(branchSkuPrefix+"-")?typed.slice(branchSkuPrefix.length+1):typed;
                  if(!suffix) return null;
                  const q=suffix.toLowerCase();
                  skuList=[...new Set(allParts.filter(p=>p.branch_id===currentBranch?.id&&p.sku&&p.sku.toLowerCase().includes(q)).map(p=>p.sku))].sort().slice(0,10);
                } else {
                  const q=typed.toLowerCase();
                  skuList=[...new Set(allParts.filter(p=>p.sku&&p.sku.toLowerCase().includes(q)).map(p=>p.sku))].sort().slice(0,10);
                }
                if(!skuList.length) return null;
                return (
                  <div style={{marginTop:7}}>
                    <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Matching SKUs:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {skuList.map(sku=>{
                        const isDup=sku===typed;
                        return (
                          <span key={sku} style={{fontSize:11,fontFamily:"DM Mono,monospace",background:isDup?"rgba(248,113,113,.15)":"var(--surface2)",border:`1px solid ${isDup?"var(--red)":"var(--border)"}`,borderRadius:4,padding:"2px 7px",color:isDup?"var(--red)":"var(--text3)",fontWeight:isDup?700:400}}>
                            {sku}{isDup&&" ⚠"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div><FL label={t.brand}/><input className="inp" value={f.brand} onChange={e=>s("brand",e.target.value)} placeholder="GWM"/></div>
          </FG>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label={`${t.name} *`}/>
              <div style={{display:"flex",gap:6}}>
                {f.name&&f.name.startsWith("=")&&onGoToPart&&(()=>{
                  const targetSku=f.name.slice(1).trim().split(/\s+/)[0];
                  return targetSku?(
                    <button type="button" className="cp-btn" style={{color:"var(--green)",borderColor:"rgba(34,197,94,.4)"}}
                      title={`Open part with SKU ${targetSku}`}
                      onClick={()=>onGoToPart(targetSku)}>→ {targetSku}</button>
                  ):null;
                })()}
                {f.oe_number&&<button type="button" className="cp-btn" style={{color:"var(--blue)",borderColor:"rgba(96,165,250,.3)"}}
                  onClick={()=>window.open(`https://www.google.com/search?q=${encodeURIComponent(f.oe_number)}`,"_blank","noopener,noreferrer")}>🔍 Google</button>}
                {f.name&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.name)}>📋</button>}
              </div>
            </div>
            <input className="inp" value={f.name} onChange={e=>{s("name",e.target.value);setErrors(p=>({...p,name:""}));}}
              placeholder="Engine Mount - Left" style={{borderColor:errors.name?"var(--red)":undefined}}/>
            <FormError errors={errors} k="name"/>
          </FD>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label={t.oeNumber}/>
              {f.oe_number&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.oe_number)}>📋 Copy OE</button>}
            </div>
            {f.oe_number&&(
              <select className="inp" style={{marginBottom:6,color:"#e65c00",fontSize:12}}
                value="" onChange={e=>{if(e.target.value)window.open(`https://spareto.com/products?utf8=%E2%9C%93&keywords=${encodeURIComponent(e.target.value)}`,"_blank","noopener,noreferrer");}}>
                <option value="">🔍 Search on SpareTO…</option>
                {f.oe_number.split(/[\s,;]+/).filter(Boolean).map((tok,i)=>(
                  <option key={i} value={tok}>{tok}</option>
                ))}
              </select>
            )}
            <input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)} placeholder="OE number / OEM reference"/>
          </FD>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label="REFERENCE URL"/>
              {f.reference_url&&<a href={f.reference_url} target="_blank" rel="noopener noreferrer"
                className="cp-btn" style={{color:"var(--blue)",borderColor:"rgba(96,165,250,.3)",textDecoration:"none"}}>🔗 Open</a>}
            </div>
            <input className="inp" value={f.reference_url} onChange={e=>s("reference_url",e.target.value)} placeholder="Paste catalogue or reference link…"/>
          </FD>
          <FG cols="1fr 1fr">
            <div><FL label={t.chineseDesc}/><input className="inp" value={f.chinese_desc} onChange={e=>s("chinese_desc",e.target.value)} placeholder="零件中文說明"/></div>
            <div><FL label={t.category}/><select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>{getCategories().map(c=><option key={c}>{c}</option>)}</select></div>
          </FG>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:8}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none",flex:"1 1 auto"}}>
              <div onClick={()=>s("is_quantum",!f.is_quantum)} style={{
                width:38,height:22,borderRadius:11,background:f.is_quantum?"var(--accent)":"var(--surface3)",
                border:`1.5px solid ${f.is_quantum?"var(--accent)":"var(--border)"}`,
                position:"relative",transition:"background .18s,border-color .18s",flexShrink:0,cursor:"pointer"
              }}>
                <div style={{position:"absolute",top:2,left:f.is_quantum?18:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .18s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:12}}>🚐 Toyota Quantum</div>
                <div style={{fontSize:10,color:"var(--text3)"}}>Quantum-specific stock</div>
              </div>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none",flex:"1 1 auto"}}>
              <div onClick={()=>s("is_hiace",!f.is_hiace)} style={{
                width:38,height:22,borderRadius:11,background:f.is_hiace?"var(--blue)":"var(--surface3)",
                border:`1.5px solid ${f.is_hiace?"var(--blue)":"var(--border)"}`,
                position:"relative",transition:"background .18s,border-color .18s",flexShrink:0,cursor:"pointer"
              }}>
                <div style={{position:"absolute",top:2,left:f.is_hiace?18:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .18s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:12}}>🚐 Toyota Hiace</div>
                <div style={{fontSize:10,color:"var(--text3)"}}>Hiace-specific stock</div>
              </div>
            </label>
          </div>
        </div>
        {/* RIGHT: Photo */}
        <div style={{flexShrink:0,width:210}}>
          {part&&<div style={{fontSize:11,color:"var(--green)",marginBottom:8,background:"rgba(34,197,94,.08)",borderRadius:7,padding:"5px 9px"}}>✅ {t.phuAutoSave}</div>}
          <PartPhotoUploader imageUrl={f.image_url} onChange={handlePhotoChange} sku={f.sku} t={t} bucket="cars_parts"/>
          <ExtraPhotosStrip photos={f.photos} onChange={handlePhotosChange} sku={f.sku}
            onOpenLightbox={i=>setExtraLightbox({idx:f.image_url?i+1:i})}/>
          {extraLightbox&&(
            <ImgLightbox urls={[f.image_url,...(f.photos||[])].filter(Boolean)} startIdx={extraLightbox.idx} onClose={()=>setExtraLightbox(null)}/>
          )}
          {part&&onSavePartSupplier&&partSuppliers.length===0&&(
            <div style={{marginTop:10,background:"rgba(96,165,250,.07)",border:"1px dashed rgba(96,165,250,.35)",borderRadius:9,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--blue)",marginBottom:5}}>🏭 No supplier linked</div>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)",fontSize:11}} onClick={()=>{onLoadSuppliers?.();setPtab("supplier");}}>Link a Supplier →</button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom tab bar: Stock, Vehicle, Fits, RFQ, Suppliers, Reorder */}
      <div className="tabs" style={{marginBottom:18,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
        {TABS.map(tab=>(
          <button key={tab.id}
            className={`tab ${ptab===tab.id?"on":""}`}
            style={{fontSize:13,padding:"8px 14px"}}
            onClick={()=>{if(tab.id==="supplier")onLoadSuppliers?.();setPtab(tab.id);}}>
            {tab.label}
            {(tab.id==="stock"&&errors.price)&&(
              <span style={{width:6,height:6,background:"var(--red)",borderRadius:"50%",display:"inline-block",marginLeft:5,verticalAlign:"middle"}}/>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: STOCK ── */}
      {ptab==="stock"&&(
        <div>
          <FG cols="1fr 1fr">
            <div>
              <FL label={`${t.price} * (Selling)`}/>
              <input className="inp" type="number" value={f.price} onChange={e=>{s("price",e.target.value);setErrors(p=>({...p,price:""}));}}
                placeholder="0.00" style={{borderColor:errors.price?"var(--red)":undefined}}/>
              <FormError errors={errors} k="price"/>
            </div>
            <div>
              <FL label={`💰 ${t.costPrice}`}/>
              <input className="inp" type="number" value={f.cost_price} onChange={e=>{
                const cost=parseFloat(e.target.value)||0;
                s("cost_price",e.target.value);
                if(cost>0&&!(+f.price>0)){
                  const taxRate=getSettings().tax_rate||0;
                  const autoPrice=Math.round(cost*(1+taxRate/100)*1.35*100)/100;
                  s("price",autoPrice);
                }
              }} placeholder="0.00"/>
              {f.cost_price>0&&f.price>0&&<div style={{fontSize:11,color:"var(--green)",marginTop:3}}>Margin: {(((+f.price-(+f.cost_price))/(+f.price))*100).toFixed(1)}%</div>}
            </div>
          </FG>
          <FG cols="1fr 1fr">
            <div><FL label={t.stock}/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",e.target.value)} placeholder="0"/></div>
            <div><FL label={t.minStock}/><input className="inp" type="number" value={f.minStock} onChange={e=>s("minStock",e.target.value)} placeholder="1"/></div>
          </FG>
        </div>
      )}

      {/* ── TAB: VEHICLE ── */}
      {ptab==="vehicle"&&(
        <div>
          {(()=>{
            const skuCode=(f.sku||"").split(/[-\s]/)[0].toUpperCase();
            if(skuCode.length<3) return null;
            const matches=vehicles.filter(v=>v.code&&v.code.toUpperCase()===skuCode);
            if(!matches.length) return null;
            return (
              <div style={{marginBottom:12,padding:"10px 12px",background:"rgba(52,211,153,.07)",border:"1px solid rgba(52,211,153,.3)",borderRadius:9}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
                  🎯 SKU prefix "{skuCode}" — {matches.length} vehicle match{matches.length!==1?"es":""}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {matches.map(v=>(
                    <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}>
                      <span>
                        <span style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,color:"var(--accent)",marginRight:6}}>{v.code}</span>
                        <span style={{fontWeight:600}}>{v.make} {v.model}</span>
                        {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                        <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}{v.year_to?`–${v.year_to}`:""}</span>
                      </span>
                      <button className="btn btn-ghost btn-xs" style={{color:"var(--green)",borderColor:"rgba(52,211,153,.4)",flexShrink:0}}
                        onClick={()=>{
                          s("make",v.make||"");
                          s("model",[v.model,v.variant].filter(Boolean).join(" "));
                          s("year_range",v.year_to?`${v.year_from}-${v.year_to}`:`${v.year_from}`);
                        }}>
                        ↙ Fill
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <FG cols="1fr 1fr 1fr">
            <div>
              <FL label={t.make}/>
              <input className="inp" list="car-makes-datalist" value={f.make}
                onChange={e=>s("make",e.target.value.toUpperCase())}
                placeholder="Type to search make..."/>
              <datalist id="car-makes-datalist">
                {Object.keys(CAR_MAKES).map(m=><option key={m} value={m}/>)}
              </datalist>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <FL label={t.model}/>
                <button className="cp-btn" onClick={async()=>{try{const txt=await navigator.clipboard.readText();s("model",txt);}catch{/* ignore clipboard failures */}}}>📥 Paste</button>
              </div>
              <input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="P-Series, H6..."/>
            </div>
            <div><FL label={t.yearRange}/><input className="inp" value={f.year_range} onChange={e=>s("year_range",e.target.value)} placeholder="2020-2024"/></div>
          </FG>
          <FD>
            <FL label={`📦 ${t.binLocation}`}/>
            <input className="inp" value={f.bin_location||""} onChange={e=>s("bin_location",e.target.value)} placeholder="A1-01, SHELF-B3"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Warehouse bin / shelf location</div>
          </FD>
        </div>
      )}

      {/* ── TAB: FITMENT ── */}
      {ptab==="fitment"&&part&&(
        <VehicleFitmentTab
          part={part}
          vehicles={vehicles}
          partFitments={partFitments.filter(f=>String(f.part_id)===String(part.id))}
          onAdd={onSaveFitment}
          onDelete={onDeleteFitment}
          onGoVehicles={onGoVehicles}
          onRefreshVehicles={onRefreshVehicles}
          initialSearch={initialFitSearch}
          t={t}
          imageUrl={f.image_url}
          onPhotoChange={handlePhotoChange}
          allParts={allParts}
          allFitments={partFitments}/>
      )}
      {ptab==="fitment"&&!part&&(
        <div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>
          <div style={{fontSize:24,marginBottom:8}}>💾</div>
          Save the part first, then link vehicles
        </div>
      )}

      {/* ── TAB: RFQ ── */}
      {ptab==="rfq"&&(
        <div>
          {rfqTotal===0?(
            <div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>
              <div style={{fontSize:32,marginBottom:8}}>📩</div>
              <div style={{fontWeight:600,marginBottom:4}}>No RFQ records yet</div>
              <div style={{fontSize:12}}>Use the RFQ button in inventory to send a quote request to suppliers</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* ── Single-part inquiries ── */}
              {partRfqs.length>0&&(
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>📩 Direct Inquiries</div>
              )}
              {partRfqs.map(inq=>{
                const replyUrl=`${window.location.origin}${window.location.pathname}?rfq=${inq.rfq_token}`;
                const statusColor=inq.status==="replied"?"var(--green)":inq.status==="ordered"?"var(--blue)":inq.status==="pending"?"var(--yellow)":"var(--text3)";
                return (
                  <div key={inq.id} style={{background:"var(--surface2)",borderRadius:10,padding:13,border:`1px solid ${inq.status==="replied"?"rgba(52,211,153,.3)":inq.status==="ordered"?"rgba(96,165,250,.3)":"var(--border)"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14}}>{inq.supplier_name}</div>
                        <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{inq.created_at?.slice(0,10)} · Qty: {inq.qty_requested}</div>
                      </div>
                      <span className="badge" style={{background:"rgba(0,0,0,.07)",color:statusColor,fontSize:11,fontWeight:700}}>{inq.status||"pending"}</span>
                    </div>
                    {(inq.status==="replied"||inq.reply_price)&&(
                      <div style={{background:"rgba(52,211,153,.07)",borderRadius:8,padding:"7px 10px",marginBottom:6}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 12px",fontSize:12}}>
                          {inq.reply_price&&<div><span style={{color:"var(--text3)"}}>Price: </span><span style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>{fmtAmt(inq.reply_price)}</span></div>}
                          {inq.reply_stock!=null&&<div><span style={{color:"var(--text3)"}}>Stock: </span><span style={{fontWeight:600}}>{inq.reply_stock}</span></div>}
                          {inq.supplier_part_no&&<div><span style={{color:"var(--text3)"}}>Part#: </span><span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--green)"}}>{inq.supplier_part_no}</span></div>}
                          {inq.reply_notes&&<div style={{gridColumn:"1/-1",color:"var(--text2)",fontSize:11,marginTop:2}}>{inq.reply_notes}</div>}
                        </div>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {inq.status==="pending"&&<><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}} onClick={()=>navigator.clipboard.writeText(replyUrl)}>📋 Copy Link</button><a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a></>}
                      {inq.supplier_phone&&inq.status==="pending"&&<a href={`https://wa.me/${(inq.supplier_phone||"").replace(/[^0-9]/g,"")}?text=${encodeURIComponent(inq.message||"")}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-xs" style={{background:"#25D366",color:"#fff",border:"none",fontSize:11,padding:"3px 8px"}}>📲 WA</button></a>}
                      {inq.status==="replied"&&inq.reply_price&&<button className="btn btn-success btn-xs" onClick={onClose}>✅ Accept → Go to Inquiries</button>}
                    </div>
                  </div>
                );
              })}

              {/* ── RFQ Session quotes ── */}
              {partSessionQuotes.length>0&&(
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginTop:4,marginBottom:2}}>📋 Session Quotes</div>
              )}
              {partSessionQuotes.map(q=>{
                const item=rfqItems.find(i=>i.id===q.rfq_item_id)||{};
                const session=rfqSessions.find(s=>s.id===q.rfq_id);
                const statusColor=q.status==="quoted"||q.status==="selected"?"var(--green)":q.status==="pending"?"var(--yellow)":"var(--text3)";
                const batchUrl=`${window.location.origin}${window.location.pathname}?rfq_batch=${q.token}`;
                return (
                  <div key={q.id} style={{background:"var(--surface2)",borderRadius:10,padding:13,border:`1px solid ${q.status==="selected"?"rgba(249,115,22,.35)":q.status==="quoted"?"rgba(52,211,153,.3)":"var(--border)"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14}}>{q.supplier_name}</div>
                        <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
                          {session?.name&&<span style={{color:"var(--blue)"}}>{session.name} · </span>}
                          {q.created_at?.slice(0,10)} · Qty: {item.qty_needed||"—"}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        {q.status==="selected"&&<span style={{fontSize:10,color:"var(--accent)",fontWeight:700}}>★ Selected</span>}
                        <span className="badge" style={{background:"rgba(0,0,0,.07)",color:statusColor,fontSize:11,fontWeight:700}}>{q.status}</span>
                      </div>
                    </div>
                    {(q.status==="quoted"||q.status==="selected")&&(
                      <div style={{background:"rgba(52,211,153,.07)",borderRadius:8,padding:"7px 10px",marginBottom:6}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px 12px",fontSize:12}}>
                          {q.unit_price!=null&&<div><span style={{color:"var(--text3)"}}>Price: </span><span style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>{fmtAmt(q.unit_price)}</span></div>}
                          {q.stock_qty!=null&&<div><span style={{color:"var(--text3)"}}>Stock: </span><span style={{fontWeight:600}}>{q.stock_qty}</span></div>}
                          {q.supplier_part_no&&<div><span style={{color:"var(--text3)"}}>Part#: </span><span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--green)"}}>{q.supplier_part_no}</span></div>}
                          {q.lead_days!=null&&<div><span style={{color:"var(--text3)"}}>Lead: </span><span>{q.lead_days}d</span></div>}
                          {q.notes&&<div style={{gridColumn:"1/-1",color:"var(--text2)",fontSize:11,marginTop:2}}>{q.notes}</div>}
                        </div>
                      </div>
                    )}
                    {q.status==="pending"&&<><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}} onClick={()=>navigator.clipboard.writeText(batchUrl)}>📋 Copy Batch Link</button><a href={batchUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a></>}
                  </div>
                );
              })}

            </div>
          )}
        </div>
      )}

      {/* ── TAB: SUPPLIER ── */}
      {ptab==="supplier"&&part&&(
        <div>
          {partSuppliers.length>0&&(
            <div style={{marginBottom:18}}>
              <FL label={`Linked Suppliers (${partSuppliers.length})`}/>
              {partSuppliers.map(ps=>(
                <div key={ps.id} style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${ps.supplier_part_no?"rgba(52,211,153,.25)":"var(--border)"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{ps.supplier?.name}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                        {ps.supplier?.country&&<span>📍 {ps.supplier.country} </span>}
                        {ps.supplier?.phone&&<span>📞 {ps.supplier.phone} </span>}
                        {ps.supplier?.account_number&&<span>🏷 {ps.supplier.account_number}</span>}
                      </div>
                      <div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>
                        {ps.supplier_price&&<span>💰 {fmtAmt(ps.supplier_price)} </span>}
                        {ps.lead_time&&<span>⏱ {ps.lead_time} </span>}
                        {ps.min_order&&<span>📦 Min: {ps.min_order}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {onEditSupplier&&ps.supplier&&<button className="btn btn-ghost btn-xs" onClick={()=>onEditSupplier(ps.supplier)}>✏️ Edit Supplier</button>}
                      {onDeletePartSupplier&&<button className="btn btn-danger btn-xs" onClick={()=>onDeletePartSupplier(ps.id)}>{t.delete}</button>}
                    </div>
                  </div>
                  <div style={{borderTop:"1px solid var(--border)",paddingTop:9,marginTop:4}}>
                    {editingPsId===ps.id?(
                      <div style={{display:"flex",gap:7,alignItems:"center"}}>
                        <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                        <input className="inp" style={{fontSize:13,padding:"4px 9px",flex:1,fontFamily:"DM Mono,monospace"}}
                          value={editPsPartNo} onChange={e=>setEditPsPartNo(e.target.value)}
                          placeholder="Enter supplier part number..." autoFocus/>
                        <button className="btn btn-success btn-xs" onClick={()=>{onUpdatePartSupplier?.(ps.id,{supplier_part_no:editPsPartNo});setEditingPsId(null);}}>✓ Save</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setEditingPsId(null)}>✕</button>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                        {ps.supplier_part_no?(
                          <span style={{fontFamily:"DM Mono,monospace",fontSize:13,color:"var(--green)",fontWeight:600,flex:1}}>✓ {ps.supplier_part_no}</span>
                        ):(
                          <span style={{fontSize:12,color:"var(--yellow)",flex:1}}>⚠ Unknown — click to add</span>
                        )}
                        {ps.supplier_part_no&&<button className="cp-btn" title="Copy supplier part number" onClick={()=>navigator.clipboard.writeText(ps.supplier_part_no)}>📋</button>}
                        {ps.supplier_part_no&&(()=>{
                          const searchUrl = ps.supplier?.search_url
                            ? ps.supplier.search_url.replace("{sku}", encodeURIComponent(ps.supplier_part_no))
                            : `https://www.google.com/search?q=${encodeURIComponent(ps.supplier_part_no)}`;
                          const isGoogle = !ps.supplier?.search_url;
                          return (<>
                            <button className="btn btn-ghost btn-xs" title={isGoogle?"Search on Google":ps.supplier.name}
                              style={{color:"var(--blue)"}}
                              onClick={()=>window.open(searchUrl,"_blank")}>
                              {isGoogle?"🔍 Google":"🔍 Search"}
                            </button>
                          </>);
                        })()}
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--accent)"}}
                          onClick={()=>{setEditingPsId(ps.id);setEditPsPartNo(ps.supplier_part_no||"");}}>✏️ Edit</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(()=>{
            const avail=suppliers.filter(s=>!partSuppliers.find(ps=>ps.supplier_id===s.id));
            if(avail.length>0){
              const mainBId=branches.find(b=>b.is_main)?.id;
              const q=(suppPartNo||"").trim().toLowerCase();
              // suppDupLinks is live-fetched for the selected supplier — no stale-cache risk
              const dupMatch=suppId&&q?(()=>{
                const hit=suppDupLinks.find(ps=>
                  (ps.supplier_part_no||"").trim().toLowerCase()===q&&
                  String(ps.part_id)!==String(part?.id)
                );
                if(!hit) return null;
                const hitPart=allParts.find(ap=>String(ap.id)===String(hit.part_id));
                if(!hitPart) return null;
                return (!hitPart.branch_id||hitPart.branch_id===mainBId)?hitPart:null;
              })():null;
              return (
                <div>
                  <FL label="Link New Supplier"/>
                  <div style={{background:"var(--surface2)",borderRadius:11,padding:15,border:"1px solid var(--border)"}}>
                    <FD>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <FL label="Supplier *"/>
                        {onAddSupplier&&<button type="button" className="btn btn-ghost btn-xs" style={{marginBottom:4}} onClick={onAddSupplier}>+ Supplier</button>}
                      </div>
                      <select className="inp" value={suppId} onChange={e=>{setSuppId(e.target.value);setSuppPartNoErr("");}}>
                        <option value="">Select supplier...</option>
                        {avail.map(s=>(
                          <option key={s.id} value={s.id}>
                            {s.name}{s.account_number?" · Acc: "+s.account_number:""}{s.country?" ("+s.country+")":""}
                          </option>
                        ))}
                      </select>
                    </FD>
                    <FD>
                      <FL label="Supplier Part No. *"/>
                      <input className="inp" value={suppPartNo}
                        onChange={e=>{setSuppPartNo(e.target.value.toUpperCase());setSuppPartNoErr("");}}
                        placeholder="e.g. MIT-ABC123"
                        style={{fontFamily:"DM Mono,monospace",borderColor:suppPartNoErr?"var(--red)":dupMatch?"var(--accent)":undefined}}/>
                      {suppPartNoErr&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {suppPartNoErr}</div>}
                      {dupMatch&&(
                        <div style={{marginTop:8,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.4)",borderRadius:8,padding:"12px 14px"}}>
                          <div style={{fontWeight:700,color:"var(--red)",fontSize:13,marginBottom:4}}>🚫 Already linked in main branch</div>
                          <div style={{fontSize:12,color:"var(--text2)",marginBottom:10}}>
                            This supplier code belongs to <strong style={{fontFamily:"DM Mono,monospace",color:"var(--accent)"}}>{dupMatch.sku}</strong> — {dupMatch.name}.<br/>
                            Use that part instead of creating a duplicate.
                          </div>
                          <button type="button" className="btn btn-primary btn-sm" style={{background:"var(--accent)",fontSize:13,padding:"8px 16px"}}
                            onClick={(e)=>{e.stopPropagation();if(onGoToMainPart)onGoToMainPart(dupMatch);}}>
                            📦 Go to {dupMatch.sku} in Inventory
                          </button>
                        </div>
                      )}
                    </FD>
                    {!dupMatch&&(
                      <>
                        <FG cols="1fr 1fr 1fr">
                          <div><FL label={t.supplier_price}/><input className="inp" type="number" value={suppPrice} onChange={e=>setSuppPrice(e.target.value)} placeholder="0"/></div>
                          <div><FL label={t.lead_time}/><input className="inp" value={suppLead} onChange={e=>setSuppLead(e.target.value)} placeholder="7 days"/></div>
                          <div><FL label={t.min_order}/><input className="inp" type="number" value={suppMinOrd} onChange={e=>setSuppMinOrd(e.target.value)}/></div>
                        </FG>
                        <button className="btn btn-primary" style={{width:"100%"}} onClick={()=>{
                          if(!suppId) return;
                          if(!suppPartNo.trim()){setSuppPartNoErr("Supplier part number is required");return;}
                          onSavePartSupplier?.({part_id:part.id,supplier_id:+suppId,supplier_part_no:suppPartNo.trim(),supplier_price:suppPrice?+suppPrice:null,lead_time:suppLead,min_order:+suppMinOrd});
                          setSuppId("");setSuppPartNo("");setSuppPrice("");setSuppLead("");setSuppMinOrd(1);setSuppPartNoErr("");
                        }}>Link Supplier</button>
                      </>
                    )}
                  </div>
                </div>
              );
            }
            if(partSuppliers.length===0) return <p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No suppliers yet — add them in the Suppliers tab first.</p>;
            return null;
          })()}
        </div>
      )}

      {/* ── REORDER TAB ── */}
      {ptab==="reorder"&&part&&(
        <div>
          {/* Enable toggle */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:f.auto_reorder?"rgba(52,211,153,.08)":"var(--surface2)",borderRadius:12,border:`1.5px solid ${f.auto_reorder?"rgba(52,211,153,.4)":"var(--border)"}`,marginBottom:16,cursor:"pointer"}} onClick={()=>s("auto_reorder",!f.auto_reorder)}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>🔄 Auto-Reorder</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>Automatically send RFQ to supplier when stock falls to reorder point</div>
            </div>
            <div style={{width:44,height:24,borderRadius:99,background:f.auto_reorder?"var(--green)":"var(--border)",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:f.auto_reorder?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
            </div>
          </div>

          {f.auto_reorder&&(<>
            <FG cols="1fr 1fr">
              <div>
                <FL label="Reorder when stock ≤"/>
                <input className="inp" type="number" min="0" value={f.reorder_point} onChange={e=>s("reorder_point",+e.target.value||0)}/>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Current stock: <strong>{part.stock??0}</strong></div>
              </div>
              <div>
                <FL label="Request quantity"/>
                <input className="inp" type="number" min="1" value={f.reorder_qty} onChange={e=>s("reorder_qty",+e.target.value||1)}/>
              </div>
            </FG>

            <FD>
              <FL label="Preferred supplier"/>
              {suppliers.length===0
                ? <div style={{fontSize:12,color:"var(--text3)",padding:"8px 0"}}>No suppliers — add suppliers first</div>
                : <select className="inp" value={f.preferred_supplier_id||""} onChange={e=>s("preferred_supplier_id",e.target.value)}>
                    <option value="">— Select supplier —</option>
                    {(partSuppliers.length>0
                      ? partSuppliers.map(ps=>suppliers.find(s=>s.id===+ps.supplier_id)).filter(Boolean)
                      : suppliers
                    ).map(sup=>(
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
              }
            </FD>

            {/* Status summary */}
            <div style={{marginTop:12,padding:"10px 14px",background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)",fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:6}}>📋 How it works</div>
              <div style={{color:"var(--text2)",lineHeight:1.7}}>
                <div>1. Stock drops to ≤ <strong>{f.reorder_point}</strong> units</div>
                <div>2. RFQ sent to <strong>{suppliers.find(s=>s.id===+f.preferred_supplier_id)?.name||"preferred supplier"}</strong> for <strong>{f.reorder_qty}</strong> units</div>
                <div>3. Supplier has <strong>24h</strong> to reply — auto-resend if no response</div>
                <div>4. After 3 attempts → escalate to next linked supplier</div>
              </div>
            </div>
          </>)}
        </div>
      )}

      {/* Opposite-side / similar-part confirmation dialog (shared) */}
      {oppConfirm&&(
        <div style={{marginTop:14,background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.3)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:"var(--purple)"}}>{oppConfirm.editableSku?"🔗 建立相似零件確認":"🔄 建立對應零件確認"}</div>
          {oppConfirm.editableSku ? (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
              <div>
                <FL label="新 SKU *"/>
                <input className="inp" autoFocus value={oppConfirm.sku} onChange={e=>setOppConfirm(p=>({...p,sku:e.target.value}))} placeholder="Enter the new part number"/>
              </div>
              <div>
                <FL label="新名稱"/>
                <input className="inp" value={oppConfirm.name} onChange={e=>setOppConfirm(p=>({...p,name:e.target.value}))}/>
              </div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"4px 10px",fontSize:12,marginBottom:10}}>
              <span style={{color:"var(--text3)"}}>新 SKU</span><span style={{fontWeight:600,fontFamily:"monospace"}}>{oppConfirm.sku}</span>
              <span style={{color:"var(--text3)"}}>新名稱</span><span>{oppConfirm.name}</span>
              {oppConfirm.chineseDesc&&<><span style={{color:"var(--text3)"}}>中文說明</span><span>{oppConfirm.chineseDesc}</span></>}
            </div>
          )}
          <div style={{marginBottom:10,padding:"10px 12px",background:"rgba(139,92,246,.06)",borderRadius:8,border:"1px solid rgba(139,92,246,.2)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--purple)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Copy from original part?</div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:6}}>
              <input type="checkbox" checked={oppConfirm.copyFits||false}
                onChange={e=>setOppConfirm(p=>({...p,copyFits:e.target.checked}))}
                style={{width:15,height:15,accentColor:"var(--purple)",cursor:"pointer",flexShrink:0}}/>
              <span>
                <span style={{fontWeight:600}}>Vehicle Fits</span>
                <span style={{color:"var(--text3)",fontSize:11,marginLeft:6}}>({oppConfirm.fitCount} fit{oppConfirm.fitCount!==1?"s":""} linked)</span>
              </span>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={oppConfirm.copyVehicleInfo||false}
                onChange={e=>setOppConfirm(p=>({...p,copyVehicleInfo:e.target.checked}))}
                style={{width:15,height:15,accentColor:"var(--purple)",cursor:"pointer",flexShrink:0}}/>
              <span>
                <span style={{fontWeight:600}}>Vehicle Info</span>
                <span style={{color:"var(--text3)",fontSize:11,marginLeft:6}}>(make / model / year range)</span>
              </span>
            </label>
          </div>
          {oppConfirm.originalF?.image_url&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"8px 10px",background:"rgba(139,92,246,.06)",borderRadius:7,border:"1px solid rgba(139,92,246,.2)"}}>
              <img src={toImgUrl(oppConfirm.originalF.image_url)} referrerPolicy="no-referrer"
                style={{width:48,height:48,objectFit:"cover",borderRadius:5,border:"1px solid var(--border)",
                  transform:oppConfirm.flipPhoto?"scaleX(-1)":"none",transition:"transform .2s",flexShrink:0}}
                onError={e=>e.target.style.display="none"}/>
              {oppConfirm.editableSku ? (
                <span style={{fontSize:12,color:"var(--text3)"}}>Photo copied to the new part</span>
              ) : (
                <label style={{display:"flex",alignItems:"center",gap:7,fontSize:12,cursor:"pointer",userSelect:"none"}}>
                  <input type="checkbox" checked={oppConfirm.flipPhoto||false}
                    onChange={e=>setOppConfirm(p=>({...p,flipPhoto:e.target.checked}))}
                    style={{width:14,height:14,accentColor:"var(--purple)",cursor:"pointer"}}/>
                  <span>鏡像翻轉照片 <span style={{color:"var(--text3)"}}>(水平)</span></span>
                </label>
              )}
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>setOppConfirm(null)}>取消</button>
            <button className="btn btn-sm" style={{flex:2,background:"var(--purple)",color:"#fff",border:"none"}}
              disabled={oppConfirm.editableSku&&!oppConfirm.sku.trim()}
              onClick={()=>{ onCreateOpposite(oppConfirm); setOppConfirm(null); }}>
              ✅ 確認建立
            </button>
          </div>
        </div>
      )}

      {/* New Part copy dialog */}
      {newPartConfirm&&(
        <div style={{marginTop:14,background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.3)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--green)"}}>+ New Part — Copy from this part?</div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:8}}>
            <input type="checkbox" checked={newPartConfirm.copyFits||false}
              onChange={e=>setNewPartConfirm(p=>({...p,copyFits:e.target.checked}))}
              style={{width:15,height:15,accentColor:"var(--green)",cursor:"pointer",flexShrink:0}}/>
            <span>
              <span style={{fontWeight:600}}>Vehicle Fits</span>
              <span style={{color:"var(--text3)",fontSize:11,marginLeft:6}}>({myFitments.length} fit{myFitments.length!==1?"s":""} linked)</span>
            </span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",marginBottom:12}}>
            <input type="checkbox" checked={newPartConfirm.copyVehicleInfo||false}
              onChange={e=>setNewPartConfirm(p=>({...p,copyVehicleInfo:e.target.checked}))}
              style={{width:15,height:15,accentColor:"var(--green)",cursor:"pointer",flexShrink:0}}/>
            <span>
              <span style={{fontWeight:600}}>Vehicle Info</span>
              <span style={{color:"var(--text3)",fontSize:11,marginLeft:6}}>(make / model / year range)</span>
            </span>
          </label>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>setNewPartConfirm(null)}>Cancel</button>
            <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>{ onAddNewPart({}); setNewPartConfirm(null); }}>Skip — blank</button>
            <button className="btn btn-sm" style={{flex:2,background:"var(--green)",color:"#fff",border:"none"}}
              onClick={()=>{ onAddNewPart(newPartConfirm); setNewPartConfirm(null); }}>
              ✅ Create New Part
            </button>
          </div>
        </div>
      )}

      {grabImg&&<GrabImageOverlay supplierUrl={grabImg.url} partSku={f.sku} onSave={url=>{handlePhotoChange(url);}} onClose={()=>setGrabImg(null)}/>}

      {/* Saved banner */}
      {saved&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
          background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",
          borderRadius:10,padding:"10px 14px",marginTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>✅ Saved!</div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSaved(false)}>✏️ Continue editing</button>
            <button className="btn btn-primary btn-sm" onClick={onClose}>Exit →</button>
          </div>
        </div>
      )}

      {/* Unsaved warning + Save/Cancel */}
      {!saved&&(
        <>
          {dirty&&(
            <div style={{fontSize:12,color:"var(--accent)",background:"rgba(251,146,60,.08)",borderRadius:8,padding:"6px 10px",marginTop:14,textAlign:"center"}}>
              ⚠️ Unsaved changes
            </div>
          )}
          <div style={{display:"flex",gap:10,marginTop:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={handleClose}>{t.cancel}</button>
            {onAddNewPart&&(
              <button className="btn btn-ghost" style={{flexShrink:0,borderColor:"var(--green)",color:"var(--green)",fontWeight:700}}
                onClick={()=>setNewPartConfirm({copyFits:myFitments.length>0,copyVehicleInfo:!!(f.make||f.model||f.year_range)})}>
                + New Part
              </button>
            )}
            {part&&onGoSupplier&&(
              <button className="btn btn-ghost" style={{flexShrink:0,borderColor:"var(--blue)",color:"var(--blue)"}}
                onClick={()=>onGoSupplier(part)}>
                🏭 Suppliers
              </button>
            )}
            {part&&side&&onCreateOpposite&&!oppConfirm&&(
              <button className="btn btn-ghost" style={{flexShrink:0,borderColor:"rgba(139,92,246,.5)",color:"var(--purple)"}}
                title={`建立${side==='L'?'右':'左'}邊對應零件`}
                onClick={()=>{
                  const newSku=swapLR(f.sku);
                  const newName=swapLR(f.name);
                  const newCd=swapLR(f.chinese_desc);
                  setOppConfirm({sku:newSku,name:newName,chineseDesc:newCd,fitCount:myFitments.length,originalPart:part,originalF:f,flipPhoto:!!f.image_url,copyFits:myFitments.length>0,copyVehicleInfo:!!(f.make||f.model||f.year_range)});
                }}>
                🔄 對應零件
              </button>
            )}
            {part&&onCreateOpposite&&!oppConfirm&&(
              <button className="btn btn-ghost" style={{flexShrink:0,borderColor:"rgba(139,92,246,.5)",color:"var(--purple)"}}
                title="用一個新號碼建立同一個零件的相似版本（複製名稱/價格/圖片等，SKU 自己輸入）"
                onClick={()=>{
                  setOppConfirm({sku:"",name:f.name,chineseDesc:f.chinese_desc,editableSku:true,fitCount:myFitments.length,originalPart:part,originalF:f,flipPhoto:false,copyFits:myFitments.length>0,copyVehicleInfo:!!(f.make||f.model||f.year_range)});
                }}>
                🔗 相似零件
              </button>
            )}
            <button className="btn btn-primary" style={{flex:2,position:"relative",
              boxShadow:dirty?"0 0 0 3px rgba(251,146,60,.4)":undefined,
              animation:dirty?"pulse-ring 1.5s ease infinite":undefined}}
              onClick={async()=>{
                if(!validate()) return;
                const ok=await onSave(buildPayload(f), true);
                if(ok!==false){ setDirty(false); setSaved(true); }
              }}>
              {dirty&&<span style={{position:"absolute",top:-4,right:-4,width:10,height:10,background:"var(--accent)",borderRadius:"50%",border:"2px solid var(--surface)"}}/>}
              {t.save}
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}

export function AdjustModal({part,onApply,onClose,t}) {
  const [nq,setNq]=useState(part?.stock||0);const [reason,setReason]=useState("");
  if(!part)return null;
  const diff=nq-part.stock;
  return (
    <Overlay onClose={onClose}>
      <MHead title={`📦 ${t.adjustStock}`} sub={`${part.name} · ${part.sku}`} onClose={onClose}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,background:"var(--surface2)",borderRadius:12,padding:16,marginBottom:16}}>
        {[["Current",part.stock,"var(--text2)"],["Change",diff>0?`+${diff}`:diff||"—",diff>0?"var(--green)":diff<0?"var(--red)":"var(--text3)"],["New",nq,"var(--accent)"]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center"}}><div style={{fontSize:11,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{l}</div><div style={{fontSize:24,fontWeight:700,color:c,fontFamily:"Rajdhani,sans-serif"}}>{v}</div></div>
        ))}
      </div>
      <FD><FL label="New quantity *"/><div style={{display:"flex",gap:9,alignItems:"center"}}><button className="btn btn-ghost" style={{padding:"9px 15px",fontSize:17}} onClick={()=>setNq(q=>Math.max(0,q-1))}>−</button><input className="inp" type="number" value={nq} onChange={e=>setNq(Math.max(0,parseInt(e.target.value)||0))} style={{textAlign:"center",fontWeight:700,fontSize:17}}/><button className="btn btn-ghost" style={{padding:"9px 15px",fontSize:17}} onClick={()=>setNq(q=>q+1)}>+</button></div></FD>
      <FD><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Stocktake, damage, return..."/></FD>
      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>onApply(part,nq,reason)}>{t.confirm}</button>
      </div>
    </Overlay>
  );
}

export function CheckoutModal({cart,customers,cartTotal,role,currentUser,onPlace,onClose,onRemove,onQty,t,lang}) {
  const [form,setForm]=useState({name:currentUser?._isCustomer?(currentUser.name||""):"",phone:currentUser?._isCustomer?(currentUser.phone||""):"",email:currentUser?._isCustomer?(currentUser.email||""):"",address:currentUser?._isCustomer?(currentUser.address||""):""});
  const sf=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fill=(c)=>setForm({phone:c.phone,name:c.name,email:c.email||"",address:c.address||""});
  return (
    <Overlay onClose={onClose}>
      <MHead title={`🛒 ${t.checkout}`} onClose={onClose}/>
      {cart.length===0?<p style={{color:"var(--text3)",textAlign:"center",padding:30}}>Cart is empty</p>:(
        <>
          <div style={{background:"var(--surface2)",borderRadius:12,padding:14,marginBottom:16}}>
            {cart.map(i=>(
              <div key={i.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{i.name}</div><div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{fmtAmt(i.price)} each</div></div>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <button className="btn btn-ghost btn-xs" style={{padding:"5px 11px"}} onClick={()=>onQty(i.id,i.qty-1)}>−</button>
                  <span style={{fontWeight:700,minWidth:20,textAlign:"center"}}>{i.qty}</span>
                  <button className="btn btn-ghost btn-xs" style={{padding:"5px 11px"}} onClick={()=>onQty(i.id,i.qty+1)}>+</button>
                  <button className="btn btn-danger btn-xs" onClick={()=>onRemove(i.id)}>✕</button>
                </div>
                <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15,minWidth:80,textAlign:"right"}}>{fmtAmt(i.price*i.qty)}</div>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",fontWeight:700,fontSize:17}}><span>{t.total}</span><span style={{color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:21}}>{fmtAmt(cartTotal)}</span></div>
          </div>
          {role==="admin"&&customers.length>0&&(
            <FD><FL label="Quick select customer"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{customers.slice(0,8).map(c=><button key={c.id} className="btn btn-ghost btn-xs" style={{borderColor:form.phone===c.phone?"var(--accent)":"var(--border)",color:form.phone===c.phone?"var(--accent)":"var(--text2)"}} onClick={()=>fill(c)}>{c.name}</button>)}</div></FD>
          )}
          {currentUser?._isCustomer?(
            <div style={{background:"var(--surface2)",borderRadius:11,padding:13,marginBottom:16,border:"1px solid var(--border)"}}>
              <div style={{fontSize:12,color:"var(--green)",marginBottom:7,fontWeight:600}}>✓ {lang==="zh"?"已登入，資料自動帶入":"Logged in — info auto-filled"}</div>
              <div style={{fontSize:14,fontWeight:700}}>{form.name}</div>
              <div style={{fontSize:13,color:"var(--text2)",marginTop:2}}>{form.phone} {form.email&&`· ${form.email}`}</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:11,marginBottom:16}}>
              <div><FL label={`${t.phone} *`}/><input className="inp" value={form.phone} placeholder="+886..." type="tel" onChange={e=>{const ph=e.target.value;const found=customers.find(c=>c.phone===ph);if(found)fill(found);else sf("phone",ph);}}/>{customers.find(c=>c.phone===form.phone)&&<div style={{fontSize:12,color:"var(--green)",marginTop:4}}>✓ {lang==="zh"?"舊客戶資料已帶入":"Existing customer loaded"}</div>}</div>
              <div><FL label={`${lang==="zh"?"姓名":"Name"} *`}/><input className="inp" value={form.name} onChange={e=>sf("name",e.target.value)}/></div>
              <div><FL label="Email"/><input className="inp" type="email" value={form.email} onChange={e=>sf("email",e.target.value)}/></div>
              <div><FL label={lang==="zh"?"地址":"Address"}/><input className="inp" value={form.address} onChange={e=>sf("address",e.target.value)}/></div>
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
            <button className="btn btn-primary" style={{flex:2}} onClick={()=>onPlace(form)}>{t.placeOrder}</button>
          </div>
        </>
      )}
    </Overlay>
  );
}

export function SupplierModal({supplier,onSave,onClose,t}) {
  const [f,setF]=useState(supplier?{name:supplier.name,email:supplier.email||"",phone:supplier.phone||"",country:supplier.country||"",contact_person:supplier.contact_person||"",notes:supplier.notes||"",search_url:supplier.search_url||"",account_number:supplier.account_number||"",supplier_origin:supplier.supplier_origin||"",supplier_types:supplier.supplier_types||[]}:{name:"",email:"",phone:"",country:"",contact_person:"",notes:"",search_url:"",account_number:"",supplier_origin:"",supplier_types:[]});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleType=(tp)=>setF(p=>({...p,supplier_types:p.supplier_types.includes(tp)?p.supplier_types.filter(x=>x!==tp):[...p.supplier_types,tp]}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={supplier?"Edit Supplier":"Add Supplier"} onClose={onClose}/>
      <FD><FL label={`${t.supplierName||"Supplier Name"} *`}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></FD>
      <FG><div><FL label={t.country||"Country"}/><input className="inp" value={f.country} onChange={e=>s("country",e.target.value)} placeholder="Taiwan, Japan..."/></div><div><FL label={t.contactPerson||"Contact Person"}/><input className="inp" value={f.contact_person} onChange={e=>s("contact_person",e.target.value)}/></div></FG>
      <FG><div><FL label={t.email||"Email"}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div><div><FL label={t.phone||"Phone"}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div></FG>
      <FG>
        <div>
          <FL label="Account Number" sub="Your branch's account number with this supplier"/>
          <input className="inp" value={f.account_number} onChange={e=>s("account_number",e.target.value)} placeholder="e.g. ACC-00123"/>
        </div>
        <div/>
      </FG>
      {/* ── Origin + Type ── */}
      <FG>
        <div>
          <FL label="Supplier Origin"/>
          <div style={{display:"flex",gap:16,marginTop:6}}>
            {[["local","🏠 Local"],["international","✈ International"]].map(([v,label])=>(
              <label key={v} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                <input type="radio" name="supplier_origin" checked={f.supplier_origin===v} onChange={()=>s("supplier_origin",v)} style={{accentColor:"var(--accent)"}}/>
                {label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <FL label="Supplier Types"/>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:6}}>
            {["new","used","dealer","factory"].map(tp=>(
              <label key={tp} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:13}}>
                <input type="checkbox" checked={f.supplier_types.includes(tp)} onChange={()=>toggleType(tp)} style={{accentColor:"var(--accent)"}}/>
                {tp.charAt(0).toUpperCase()+tp.slice(1)}
              </label>
            ))}
          </div>
        </div>
      </FG>
      <FD>
        <FL label="Part Search URL" sub="Placeholders: {sku} = supplier/our part no · {vehicle_code} = car model code (e.g. VW18D)"/>
        <input className="inp" value={f.search_url} onChange={e=>s("search_url",e.target.value)}
          placeholder="https://www.supplier.com/search?partno={sku}"/>
        {f.search_url&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
          Preview: {f.search_url.replace("{sku}","ABC-001")}
        </div>}
      </FD>
      <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)}/></FD>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel||"Cancel"}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name)return;onSave(f);}}>{t.save||"Save"}</button></div>
    </Overlay>
  );
}

export function PartSupplierModal({part,partSuppliers,suppliers,vehicles=[],partFitments=[],onSave,onDelete,onUpdate,onClose,onEditPart,onEditSupplier,onMergePart,branches=[],allParts=[],onGoToMainPart,onAddSupplier,t}) {
  const [suppId,setSuppId]=useState("");
  const [price,setPrice]=useState("");
  const [lead,setLead]=useState("");
  const [minOrd,setMinOrd]=useState(1);
  const [newPartNo,setNewPartNo]=useState("");
  const [suppDupLinks,setSuppDupLinks]=useState([]);
  useEffect(()=>{
    if(!suppId){setSuppDupLinks([]);return;}
    api.get("part_suppliers",`supplier_id=eq.${suppId}&select=*`)
      .then(d=>setSuppDupLinks(Array.isArray(d)?d:[]))
      .catch(()=>{});
  },[suppId]);
  const [editingId,setEditingId]=useState(null);
  const [editPartNo,setEditPartNo]=useState("");
  const [confirmDeleteId,setConfirmDeleteId]=useState(null);
  const [deletingId,setDeletingId]=useState(null);
  const handleDelete=async(id)=>{
    setDeletingId(id);
    await onDelete(id);
    setConfirmDeleteId(null);
    setDeletingId(null);
  };
  // merge state
  const [mergeOpen,setMergeOpen]=useState(false);
  const [mergeTargetId,setMergeTargetId]=useState("");
  const [mergeTarget,setMergeTarget]=useState(null);
  const [mergeLooking,setMergeLooking]=useState(false);
  const [mergeConfirm,setMergeConfirm]=useState(false);
  const lookupTarget=async()=>{
    const id=mergeTargetId.trim();
    if(!id){setMergeTarget(null);return;}
    setMergeLooking(true);
    const res=await api.get("parts",`id=eq.${id}&select=id,name,sku`);
    setMergeTarget(Array.isArray(res)&&res[0]?res[0]:null);
    setMergeLooking(false);
    setMergeConfirm(false);
  };
  if(!part)return null;
  const avail=suppliers.filter(s=>!partSuppliers.find(ps=>ps.supplier_id===s.id));
  // Derive vehicle codes linked to this part via fitments
  const vehicleCodes=partFitments
    .filter(f=>String(f.part_id)===String(part.id))
    .map(f=>vehicles.find(v=>String(v.id)===String(f.vehicle_id))?.code)
    .filter(Boolean)
    .filter((c,i,a)=>a.indexOf(c)===i); // unique

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🏭 Suppliers — ${part.name}`} sub={`${part.sku}${part.oe_number?" · OE: "+part.oe_number:""}`} onClose={onClose}/>
      {onEditPart&&(
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>onEditPart(part,"info")}>✏️ Edit Part</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>onEditPart(part,"photo")}>📸 Photos</button>
        </div>
      )}

      {/* Linked suppliers */}
      {partSuppliers.length>0&&(
        <div style={{marginBottom:18}}>
          <FL label={`Linked Suppliers (${partSuppliers.length})`}/>
          {partSuppliers.map(ps=>(
            <div key={ps.id} style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${ps.supplier_part_no?"rgba(52,211,153,.25)":"var(--border)"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{ps.supplier?.name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                    {ps.supplier?.country&&<span>📍 {ps.supplier.country} </span>}
                    {ps.supplier?.phone&&<span>📞 {ps.supplier.phone} </span>}
                    {ps.supplier?.email&&<span>✉ {ps.supplier.email}</span>}
                  </div>
                  <div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>
                    {ps.supplier_price&&<span>💰 {fmtAmt(ps.supplier_price)} </span>}
                    {ps.lead_time&&<span>⏱ {ps.lead_time} </span>}
                    {ps.min_order&&<span>📦 Min: {ps.min_order}</span>}
                  </div>
                </div>
                {deletingId===ps.id ? (
                  <button className="btn btn-danger btn-xs" disabled>⏳ Deleting…</button>
                ) : confirmDeleteId===ps.id ? (
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--red)",fontWeight:600}}>Sure?</span>
                    <button className="btn btn-danger btn-xs" onClick={()=>handleDelete(ps.id)}>✓ Yes, delete</button>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setConfirmDeleteId(null)}>✕</button>
                  </div>
                ) : (
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    {onEditSupplier&&ps.supplier&&<button className="btn btn-ghost btn-xs" onClick={()=>onEditSupplier(ps.supplier)}>✏️ Edit Supplier</button>}
                    <button className="btn btn-danger btn-xs" onClick={()=>setConfirmDeleteId(ps.id)}>{t.delete}</button>
                  </div>
                )}
              </div>

              {/* Supplier Part No — editable inline */}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:9,marginTop:4}}>
                {editingId===ps.id ? (()=>{
                  const editDup=editPartNo.trim()&&partSuppliers.find(other=>
                    other.id!==ps.id&&
                    String(other.supplier_id)===String(ps.supplier_id)&&
                    (other.supplier_part_no||"").trim().toLowerCase()===editPartNo.trim().toLowerCase()
                  );
                  return (
                  <div>
                    <div style={{display:"flex",gap:7,alignItems:"center"}}>
                      <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                      <input className="inp" style={{fontSize:13,padding:"4px 9px",flex:1,fontFamily:"DM Mono,monospace",borderColor:editDup?"var(--red)":undefined}}
                        value={editPartNo} onChange={e=>setEditPartNo(e.target.value)}
                        placeholder="Enter supplier part number..." autoFocus/>
                      <button className="btn btn-success btn-xs" disabled={!!editDup} onClick={()=>{onUpdate(ps.id,{supplier_part_no:editPartNo});setEditingId(null);}}>✓ Save</button>
                      <button className="btn btn-ghost btn-xs" onClick={()=>setEditingId(null)}>✕</button>
                    </div>
                    {editDup&&<div style={{marginTop:4,fontSize:11,color:"var(--red)",fontWeight:600}}>
                      🚫 That code is already linked to this supplier on this part — choose a different code.
                    </div>}
                  </div>
                );})()
                : (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                    {ps.supplier_part_no ? (
                      <span style={{fontFamily:"DM Mono,monospace",fontSize:13,color:"var(--green)",fontWeight:600,flex:1}}>
                        ✓ {ps.supplier_part_no}
                      </span>
                    ) : (
                      <span style={{fontSize:12,color:"var(--yellow)",flex:1}}>⚠ Unknown — click to add</span>
                    )}
                    {ps.supplier_part_no&&<button className="cp-btn" title="Copy supplier part number" onClick={()=>navigator.clipboard.writeText(ps.supplier_part_no)}>📋</button>}
                    {ps.supplier?.search_url&&(()=>{
                      const tpl=ps.supplier.search_url;
                      const isVehicleSearch=/\{vehicle_code\}/i.test(tpl);
                      if(isVehicleSearch){
                        // one button per linked vehicle code
                        return vehicleCodes.length>0?vehicleCodes.map(code=>(
                          <a key={code} href={tpl.replace(/\{vehicle_code\}/gi,encodeURIComponent(code))} target="_blank" rel="noopener noreferrer"
                            className="btn btn-ghost btn-xs"
                            style={{color:"var(--blue)",borderColor:"rgba(96,165,250,.4)",textDecoration:"none"}}
                            title={`Search ${ps.supplier.name} for vehicle ${code}`}>
                            🔍 {code}
                          </a>
                        )):<span style={{fontSize:11,color:"var(--text3)"}}>No vehicle linked</span>;
                      }
                      const searchTerm=ps.supplier_part_no||part.sku||"";
                      const url=tpl.replace(/\{sku\}/gi,encodeURIComponent(searchTerm));
                      return searchTerm?(
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="btn btn-ghost btn-xs"
                          style={{color:"var(--blue)",borderColor:"rgba(96,165,250,.4)",textDecoration:"none"}}
                          title={`Search ${ps.supplier.name} for ${searchTerm}`}>
                          🔍 Search
                        </a>
                      ):null;
                    })()}
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--accent)"}}
                      onClick={()=>{setEditingId(ps.id);setEditPartNo(ps.supplier_part_no||"");}}>
                      ✏️ Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link new supplier */}
      {avail.length>0&&(()=>{
        const mainBId=branches.find(b=>b.is_main)?.id;
        const q=(newPartNo||"").trim().toLowerCase();
        // Same supplier + same code already on THIS part
        const exactDup=suppId&&q&&partSuppliers.find(ps=>
          String(ps.supplier_id)===String(suppId)&&
          (ps.supplier_part_no||"").trim().toLowerCase()===q
        )||null;
        // Same code on a DIFFERENT part for this supplier
        const dupMatch=!exactDup&&suppId&&q?(()=>{
          const hit=suppDupLinks.find(ps=>
            (ps.supplier_part_no||"").trim().toLowerCase()===q&&
            String(ps.part_id)!==String(part?.id)
          );
          if(!hit)return null;
          const hitPart=allParts.find(ap=>String(ap.id)===String(hit.part_id));
          if(!hitPart)return null;
          return(!hitPart.branch_id||hitPart.branch_id===mainBId)?hitPart:null;
        })():null;
        return (
          <div>
            <FL label="Link New Supplier"/>
            <div style={{background:"var(--surface2)",borderRadius:11,padding:15,border:"1px solid var(--border)"}}>
              <FD>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <FL label="Supplier *"/>
                  {onAddSupplier&&<button type="button" className="btn btn-ghost btn-xs" style={{marginBottom:4}} onClick={onAddSupplier}>+ Supplier</button>}
                </div>
                <select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}>
                  <option value="">Select supplier...</option>
                  {avail.map(s=>(
                    <option key={s.id} value={s.id}>
                      {s.name}{s.country?" ("+s.country+")":""}{s.phone?" · "+s.phone:""}
                    </option>
                  ))}
                </select>
              </FD>
              <FD>
                <FL label="Supplier Part No. (if known)"/>
                <input className="inp" value={newPartNo} onChange={e=>setNewPartNo(e.target.value)}
                  placeholder="Their part number — leave blank if unknown"
                  style={{fontFamily:"DM Mono,monospace",borderColor:dupMatch?"var(--accent)":undefined}}/>
                {!newPartNo&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>💡 Leave blank — you can add it later or let supplier fill via RFQ</div>}
                {exactDup&&(
                  <div style={{marginTop:8,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.4)",borderRadius:8,padding:"10px 14px",fontSize:12}}>
                    <span style={{fontWeight:700,color:"var(--red)"}}>🚫 Already linked — </span>
                    <span style={{color:"var(--text2)"}}>this supplier code is already saved on this part. No need to add it again.</span>
                  </div>
                )}
                {dupMatch&&(
                  <div style={{marginTop:8,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.4)",borderRadius:8,padding:"12px 14px"}}>
                    <div style={{fontWeight:700,color:"var(--red)",fontSize:13,marginBottom:4}}>🚫 Already linked in main branch</div>
                    <div style={{fontSize:12,color:"var(--text2)",marginBottom:10}}>
                      This supplier code belongs to <strong style={{fontFamily:"DM Mono,monospace",color:"var(--accent)"}}>{dupMatch.sku}</strong> — {dupMatch.name}.<br/>
                      Use that part instead of creating a duplicate.
                    </div>
                    {onGoToMainPart&&(
                      <button type="button" className="btn btn-primary btn-sm" style={{background:"var(--accent)",fontSize:13,padding:"8px 16px"}}
                        onClick={(e)=>{e.stopPropagation();onGoToMainPart(dupMatch);}}>
                        📦 Go to {dupMatch.sku} in Inventory
                      </button>
                    )}
                  </div>
                )}
              </FD>
              {!dupMatch&&!exactDup&&(
                <>
                  <FG cols="1fr 1fr 1fr">
                    <div><FL label={t.supplier_price}/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0"/></div>
                    <div><FL label={t.lead_time}/><input className="inp" value={lead} onChange={e=>setLead(e.target.value)} placeholder="7 days"/></div>
                    <div><FL label={t.min_order}/><input className="inp" type="number" value={minOrd} onChange={e=>setMinOrd(e.target.value)}/></div>
                  </FG>
                  <button className="btn btn-primary" style={{width:"100%"}} onClick={()=>{
                    if(!suppId)return;
                    onSave({part_id:part.id,supplier_id:+suppId,supplier_part_no:newPartNo||"",supplier_price:price?+price:null,lead_time:lead,min_order:+minOrd});
                    setSuppId("");setNewPartNo("");setPrice("");setLead("");setMinOrd(1);
                  }}>Link Supplier</button>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {avail.length===0&&partSuppliers.length===0&&<p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No suppliers yet — add them in the Suppliers section first.</p>}

      {/* Merge & Delete */}
      {onMergePart&&(
        <div style={{marginTop:18,borderTop:"2px solid var(--border)",paddingTop:14}}>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",width:"100%",justifyContent:"flex-start"}}
            onClick={()=>{setMergeOpen(o=>!o);setMergeTarget(null);setMergeTargetId("");setMergeConfirm(false);}}>
            ⚠️ {mergeOpen?"Hide":"Merge & Delete this part…"}
          </button>
          {mergeOpen&&(
            <div style={{marginTop:10,background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.25)",borderRadius:10,padding:14}}>
              <div style={{fontSize:12,color:"var(--red)",fontWeight:700,marginBottom:8}}>MERGE "{part.name}" INTO ANOTHER PART</div>
              <div style={{fontSize:12,color:"var(--text2)",marginBottom:10}}>All supplier links and inventory logs will be moved to the target part, then this part will be deleted.</div>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                <input className="inp" style={{flex:1,fontFamily:"DM Mono,monospace",fontSize:13}}
                  value={mergeTargetId} onChange={e=>{setMergeTargetId(e.target.value);setMergeTarget(null);setMergeConfirm(false);}}
                  onKeyDown={e=>e.key==="Enter"&&lookupTarget()}
                  placeholder="Enter target Part ID…"/>
                <button className="btn btn-ghost btn-sm" onClick={lookupTarget} disabled={!mergeTargetId.trim()||mergeLooking}>
                  {mergeLooking?"…":"Check"}
                </button>
              </div>
              {mergeTarget&&(
                <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",marginBottom:10,fontSize:13}}>
                  <div style={{fontWeight:700,marginBottom:2}}>✓ Target: {mergeTarget.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>SKU: {mergeTarget.sku} · ID: #{mergeTarget.id}</div>
                  <div style={{fontSize:11,color:"var(--text2)",marginTop:6}}>
                    Will transfer: <strong>{partSuppliers.length} supplier link{partSuppliers.length!==1?"s":""}</strong> + all inventory logs
                  </div>
                  {!mergeConfirm
                    ? <button className="btn btn-danger btn-sm" style={{marginTop:10,width:"100%"}} onClick={()=>setMergeConfirm(true)}>
                        Merge &amp; Delete Part #{part.id}
                      </button>
                    : <div style={{marginTop:10}}>
                        <div style={{fontSize:12,color:"var(--red)",fontWeight:700,marginBottom:8}}>⚠️ This cannot be undone. Are you sure?</div>
                        <div style={{display:"flex",gap:8}}>
                          <button className="btn btn-danger" style={{flex:1}} onClick={()=>onMergePart(part.id,mergeTarget.id)}>
                            Yes, Merge &amp; Delete
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={()=>setMergeConfirm(false)}>Cancel</button>
                        </div>
                      </div>
                  }
                </div>
              )}
              {mergeTargetId.trim()&&!mergeTarget&&!mergeLooking&&<div style={{fontSize:12,color:"var(--red)"}}>No part found with ID #{mergeTargetId}</div>}
            </div>
          )}
        </div>
      )}
    </Overlay>
  );
}

// ── Customer Query Modal (customer submits query from shop) ───────────
export function CustomerQueryModal({part,currentUser,onSubmit,onClose,t}) {
  const isCustomer=currentUser?._isCustomer||currentUser?.role==="customer";
  const [form,setForm]=useState({
    name:isCustomer?(currentUser?.name||""):"",
    phone:isCustomer?(currentUser?.phone||""):"",
    email:isCustomer?(currentUser?.email||""):"",
    qty:1,
    notes:"",
  });
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const handle=async()=>{
    if(!form.name||!form.phone){alert(t.name+" & "+t.phone+" required");return;}
    setSaving(true);
    await onSubmit({
      part_id:part.id,part_name:part.name,part_sku:part.sku||"",
      part_price:part.price||0,part_image:part.image_url||"",
      customer_name:form.name,customer_phone:form.phone,customer_email:form.email,
      qty_requested:+form.qty||1,notes:form.notes,
      status:"pending",created_at:new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <MHead title={t.queryPriceQty} sub={part.name} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13}}>
        <div style={{fontWeight:700,marginBottom:2}}>{part.name}</div>
        {part.sku&&<div style={{color:"var(--text3)",fontSize:12}}>SKU: {part.sku}</div>}
        {part.oe_number&&<div style={{color:"var(--text3)",fontSize:12}}>OE: {part.oe_number}</div>}
      </div>
      <FG cols="1fr 1fr">
        <div><FL label={t.name} req/><input className="inp" value={form.name} onChange={e=>set("name",e.target.value)} disabled={isCustomer&&!!form.name}/></div>
        <div><FL label={t.phone} req/><input className="inp" value={form.phone} onChange={e=>set("phone",e.target.value)} disabled={isCustomer&&!!form.phone}/></div>
      </FG>
      <FD><FL label={t.email}/><input className="inp" type="email" value={form.email} onChange={e=>set("email",e.target.value)}/></FD>
      <FD><FL label={t.qty} req/><input className="inp" type="number" min="1" value={form.qty} onChange={e=>set("qty",e.target.value)}/></FD>
      <FD><FL label={t.queryNotes}/><textarea className="inp" rows={3} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Any special requirements, vehicle info, etc."/></FD>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
        <button className="btn btn-ghost" onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" onClick={handle} disabled={saving}>{saving?"...":t.submitQuery}</button>
      </div>
    </Overlay>
  );
}

// ── Customer Query Reply Modal (admin replies + requests deposit) ─────
export function CustomerQueryReplyModal({query,onReply,onClose,t,settings,onGoInventory,onGoRFQ}) {
  const [price,setPrice]=useState(query?.confirmed_price||"");
  const [qty,setQty]=useState(query?.confirmed_qty||"");
  const [notes,setNotes]=useState(query?.reply_notes||"");
  const [reqDeposit,setReqDeposit]=useState(!!(query?.deposit_amount));
  const [deposit,setDeposit]=useState(query?.deposit_amount||"");
  const [depositNote,setDepositNote]=useState(query?.deposit_note||`Please pay a deposit of ${settings?.currency||""} to confirm your order. Contact us for payment details.`);
  const [saving,setSaving]=useState(false);
  const handle=async()=>{
    setSaving(true);
    await onReply(query.id,{
      confirmed_price:price?+price:null,
      confirmed_qty:qty?+qty:null,
      reply_notes:notes,
      deposit_amount:reqDeposit&&deposit?+deposit:null,
      deposit_note:reqDeposit?depositNote:null,
      status:reqDeposit?"deposit_requested":"replied",
      replied_at:new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };
  return (
    <Overlay onClose={onClose}>
      <MHead title={t.queryReply} sub={`${query.customer_name} — ${query.part_name}`} onClose={onClose}/>

      {/* Part info + quick-action buttons */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:3}}>{query.part_name}</div>
            {query.part_sku&&(
              <div style={{fontSize:13,color:"var(--blue)",fontFamily:"DM Mono,monospace",fontWeight:600,marginBottom:6}}>
                SKU: {query.part_sku}
              </div>
            )}
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:13,color:"var(--text2)"}}>
              <span>👤 {query.customer_name}</span>
              <span>📞 {query.customer_phone}</span>
              <span>🔢 Qty: <strong>{query.qty_requested}</strong></span>
            </div>
            {query.notes&&<div style={{marginTop:5,fontSize:12,color:"var(--text3)",fontStyle:"italic"}}>"{query.notes}"</div>}
          </div>
          {/* Quick-action buttons */}
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
            <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)",borderColor:"var(--blue)",fontSize:12,whiteSpace:"nowrap"}}
              onClick={onGoInventory}>
              📦 View in Inventory
            </button>
            <button className="btn btn-ghost btn-sm" style={{color:"var(--yellow)",borderColor:"var(--yellow)",fontSize:12,whiteSpace:"nowrap"}}
              onClick={onGoRFQ}>
              📩 Send RFQ to Suppliers
            </button>
          </div>
        </div>
      </div>

      <FG cols="1fr 1fr">
        <div><FL label={t.confirmedPrice}/><input className="inp" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Unit price"/></div>
        <div><FL label={t.confirmedQty}/><input className="inp" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Available qty"/></div>
      </FG>
      <FD><FL label={t.notes}/><textarea className="inp" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Reply message to customer..."/></FD>
      <div style={{margin:"14px 0",padding:"12px 14px",background:"var(--surface2)",borderRadius:10,border:`1px solid ${reqDeposit?"var(--yellow)":"var(--border)"}`}}>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:600,fontSize:13,marginBottom:reqDeposit?12:0}}>
          <input type="checkbox" checked={reqDeposit} onChange={e=>setReqDeposit(e.target.checked)} style={{width:16,height:16}}/>
          {t.depositRequest}
        </label>
        {reqDeposit&&(
          <>
            <FD><FL label={t.depositAmount} req/><input className="inp" type="number" min="0" step="0.01" value={deposit} onChange={e=>setDeposit(e.target.value)} placeholder="Deposit amount"/></FD>
            <FD><FL label={t.depositNote}/><textarea className="inp" rows={3} value={depositNote} onChange={e=>setDepositNote(e.target.value)}/></FD>
          </>
        )}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
        <button className="btn btn-ghost" onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" onClick={handle} disabled={saving}>{saving?"...":t.sendReply}</button>
      </div>
    </Overlay>
  );
}

export function InquiryModal({part,suppliers,partSuppliers,inquiries=[],rfqQuotes=[],rfqItems=[],onSend,onManualQuote,onAcceptQuote,onCancelOrder,onClose,t,isAdmin,onEditPart}) {
  // Build professional RFQ message — each field on its own clear line
  // buildMsg now accepts optional supplierPartNo from part_suppliers record
  const buildMsg = (supplierName, qtyVal, supplierPartNo="") => {
    if(!part) return "";
    const lines = [];
    lines.push(`Dear ${supplierName},`);
    lines.push("");
    lines.push("We would like to request a quotation for the following part:");
    lines.push("");
    lines.push("─────────────────────────────────");
    lines.push(`Part Name  : ${part.name}`);
    if(part.chinese_desc) lines.push(`Chinese    : ${part.chinese_desc}`);
    lines.push(`Our SKU    : ${part.sku}`);
    if(part.oe_number)    lines.push(`OE Number  : ${part.oe_number}`);
    if(part.brand)        lines.push(`Brand      : ${part.brand}`);
    if(part.category)     lines.push(`Category   : ${part.category}`);
    if(part.make)         lines.push(`Make       : ${part.make}`);
    if(part.model)        lines.push(`Model      : ${part.model}`);
    if(part.year_range)   lines.push(`Year       : ${part.year_range}`);
    // Include supplier's own part number if known
    if(supplierPartNo)    lines.push(`Your Part# : ${supplierPartNo}  (please confirm)`);
    else                  lines.push(`Your Part# : (unknown — please provide)`);
    lines.push("─────────────────────────────────");
    lines.push("");
    lines.push(`Qty Required : ${qtyVal}`);
    lines.push("");
    lines.push("Please provide:");
    lines.push("  1. Your unit price");
    lines.push("  2. Available stock quantity");
    if(!supplierPartNo) lines.push("  3. Your part number / reference");
    lines.push("  " + (!supplierPartNo?"4":"3") + ". Lead time");
    lines.push("");
    lines.push("You can submit your quote via the link we will send (no login needed).");
    lines.push("");
    lines.push("Thank you,");
    lines.push("MotorDesk Team");
    return lines.join("\n");
  };

  const defaultQty=part?.min_stock||part?.reorder_qty||1;
  const [selectedSuppliers,setSelectedSuppliers]=useState([]);
  const [qty,setQty]=useState(()=>defaultQty);
  const [msg,setMsg]=useState(()=>buildMsg("Supplier", defaultQty, ""));
  const [showPhoto,setShowPhoto]=useState(false);
  const [supplierSearch,setSupplierSearch]=useState("");
  const [matchedOnly,setMatchedOnly]=useState(true);
  // Manual quote entry — records a supplier's price directly (e.g. after a phone
  // call) without needing them to click the RFQ reply link.
  const [manualEdit,setManualEdit]=useState(null); // {supplierId,price,stock,notes,spn,existingId}
  const [acceptingId,setAcceptingId]=useState(null); // supplier id currently creating a PO (shows spinner)
  const [cancellingId,setCancellingId]=useState(null); // supplier id currently cancelling its order

  // Preview the message for the most recently selected supplier (with their known part# if any)
  useEffect(()=>{
    if(selectedSuppliers.length===0){setMsg(buildMsg("Supplier", qty, ""));return;}
    const last=selectedSuppliers[selectedSuppliers.length-1];
    const suppPartNo=partSuppliers.find(ps=>ps.supplier_id===last.id)?.supplier_part_no||"";
    setMsg(buildMsg(last.name, qty, suppPartNo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedSuppliers, qty]);

  if(!part) return null;

  const partPhoto=part.image_url||"";

  const toggleSupplier=(s)=>setSelectedSuppliers(p=>p.find(x=>x.id===s.id)?p.filter(x=>x.id!==s.id):[...p,s]);

  const handleSend=async()=>{
    if(selectedSuppliers.length===0||!qty)return;
    // Build one personalised item per supplier and send as a batch — the caller
    // (sendInquiry) creates all the DB records then opens a one-by-one WhatsApp/
    // email send queue so nothing gets silently skipped when multiple suppliers
    // are selected.
    const items=selectedSuppliers.map(s=>{
      const ps = linkedPsMap[s.id];
      const suppPartNo = ps?.supplier_part_no || "";
      const personalMsg = buildMsg(s.name, qty, suppPartNo);
      return {
        part_id:part.id, part_name:part.name, part_sku:part.sku,
        part_oe_number:part.oe_number||"", part_make:part.make||"",
        part_model:part.model||"", part_year:part.year_range||"",
        supplier_id:s.id, supplier_name:s.name, supplier_email:s.email, supplier_phone:s.phone,
        qty_requested:+qty, message:personalMsg,
        known_supplier_part_no:suppPartNo
      };
    });
    await onSend(items);
  };

  // Keep full partSupplier record so we can access supplier_part_no
  const linkedPsMap=Object.fromEntries(partSuppliers.map(ps=>[ps.supplier_id, ps]));
  const linkedSupps=partSuppliers.map(ps=>ps.supplier).filter(Boolean);
  const allSupps=[...linkedSupps,...suppliers.filter(s=>!linkedSupps.find(l=>l.id===s.id))];
  const filteredSupps=allSupps.filter(s=>{
    if(matchedOnly&&!linkedPsMap[s.id]?.supplier_part_no)return false;
    if(supplierSearch.trim()){
      const q=supplierSearch.toLowerCase();
      const hay=`${s.name||""} ${s.country||""} ${s.phone||""} ${s.email||""}`.toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });

  // Most recent inquiry (if any) that already carries a reply for this supplier + part
  const latestInqFor=(supplierId)=>inquiries
    .filter(i=>i.part_id===part.id&&i.supplier_id===supplierId)
    .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;

  // Bulk "Ask Suppliers — All Items" replies live in rfq_quotes (unit_price), joined
  // to rfq_items by this part's SKU — same cost signal as an inquiries reply, just
  // not yet "recorded" (no inquiries row) until someone confirms it via Enter Price.
  const bulkQuoteFor=(supplierId)=>{
    const upperSku=(part.sku||"").toUpperCase();
    if(!upperSku) return null;
    const itemIds=rfqItems.filter(ri=>(ri.part_sku||"").toUpperCase()===upperSku).map(ri=>ri.id);
    if(!itemIds.length) return null;
    return rfqQuotes
      .filter(q=>itemIds.includes(q.rfq_item_id)&&String(q.supplier_id)===String(supplierId)&&q.unit_price!=null)
      .sort((a,b)=>new Date(b.quoted_at||b.created_at||0)-new Date(a.quoted_at||a.created_at||0))[0]||null;
  };

  // Cheapest quoted supplier first, then the rest (unquoted suppliers keep their original order)
  const sortedSupps=[...filteredSupps].sort((a,b)=>{
    const pa=latestInqFor(a.id)?.reply_price??bulkQuoteFor(a.id)?.unit_price;
    const pb=latestInqFor(b.id)?.reply_price??bulkQuoteFor(b.id)?.unit_price;
    const ha=pa!=null&&pa!==""?1:0, hb=pb!=null&&pb!==""?1:0;
    if(ha!==hb) return hb-ha;
    if(ha&&hb) return (+pa)-(+pb);
    return 0;
  });

  const openManual=(s,inq)=>{
    const bq=!inq?.reply_price?bulkQuoteFor(s.id):null;
    setManualEdit({
      supplierId:s.id,
      price:inq?.reply_price??bq?.unit_price??"", stock:inq?.reply_stock??bq?.stock_qty??"", notes:inq?.reply_notes||bq?.notes||"",
      spn:inq?.supplier_part_no||bq?.supplier_part_no||linkedPsMap[s.id]?.supplier_part_no||"",
      existingId:inq?.id||null,
    });
  };

  const saveManual=async(s)=>{
    if(!onManualQuote||!manualEdit) return;
    await onManualQuote({
      part, supplier:s, qty:+qty||1,
      price:manualEdit.price, stock:manualEdit.stock, notes:manualEdit.notes,
      supplierPartNo:manualEdit.spn, existingId:manualEdit.existingId,
    });
    setManualEdit(null);
  };

  const acceptQuote=async(s,inq)=>{
    if(!onAcceptQuote||!inq?.reply_price||acceptingId) return;
    const partNoLine=inq.supplier_part_no?`\nSupplier code: ${inq.supplier_part_no}`:"";
    if(!window.confirm(`Create a Purchase Invoice for ${inq.qty_requested||qty} × ${part.name} @ ${fmtAmt(inq.reply_price)} from ${s.name}?${partNoLine}`)) return;
    setAcceptingId(s.id);
    try{ await onAcceptQuote(inq); }
    finally{ setAcceptingId(null); }
  };

  const cancelOrder=async(s,inq)=>{
    if(!onCancelOrder||cancellingId) return;
    setCancellingId(s.id);
    try{ await onCancelOrder(inq); }
    finally{ setCancellingId(null); }
  };

  // Already ordered? Surface it up top so reopening this part's RFQ doesn't look
  // like it's still awaiting quotes when a PO was already created for it.
  const orderedInq=inquiries
    .filter(i=>i.part_id===part.id&&i.status==="ordered")
    .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📩 Send RFQ" sub={`${part.name}${part.chinese_desc?" / "+part.chinese_desc:""} · ${part.sku}`} onClose={onClose}/>

      {orderedInq&&(
        <div style={{background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>✅</span>
          <span style={{fontSize:13,color:"var(--green)",fontWeight:700,flex:1}}>
            Ordered from {orderedInq.supplier_name} — {orderedInq.qty_requested} × {fmtAmt(orderedInq.reply_price)}
          </span>
          {onCancelOrder&&(
            <button type="button" className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
              onClick={()=>onCancelOrder(orderedInq)}>✕ Cancel Order</button>
          )}
        </div>
      )}

      {/* Part info preview */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:16,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",flex:1}}>Part Details to Send</div>
          {isAdmin&&onEditPart&&<button className="btn btn-ghost btn-xs" title="Edit this part" onClick={()=>onEditPart(part)}>✏️ Edit Part</button>}
        </div>
        {(()=>{
          // Phones: photo on top, single detail column — the 144px photo + 2-column
          // grid overflows the modal frame and cuts off the right column
          const narrow=typeof window!=="undefined"&&window.innerWidth<640;
          const rows=[
            ["Name",part.name],
            ["中文",part.chinese_desc||"—"],
            ["SKU",part.sku],
            ["OE#",part.oe_number||"—"],
            ["Make",part.make||"—"],
            ["Model",part.model||"—"],
            ["Year",part.year_range||"—"],
            ["Brand",part.brand||"—"],
          ].filter(([,v],i)=>!narrow||i<1||v!=="—"); // on phones skip empty fields to save space
          return (
            <div style={{display:"flex",gap:narrow?10:14,flexDirection:narrow?"column":"row"}}>
              {partPhoto&&<img src={toImgUrl(partPhoto)} alt="" referrerPolicy="no-referrer" onClick={()=>setShowPhoto(true)}
                style={{width:narrow?"100%":144,height:144,objectFit:"contain",background:"#fff",borderRadius:8,border:"1px solid var(--border)",flexShrink:0,cursor:"zoom-in"}}
                onError={e=>e.target.style.display="none"}/>}
              <div style={{display:"grid",gridTemplateColumns:narrow?"1fr":"1fr 1fr",gap:"5px 16px",fontSize:13,flex:1,minWidth:0}}>
                {rows.map(([k,v])=>(
                  <div key={k} style={{display:"flex",gap:6,minWidth:0}}>
                    <span style={{color:"var(--text3)",minWidth:40,flexShrink:0}}>{k}</span>
                    <span style={{fontWeight:500,fontFamily:k==="SKU"||k==="OE#"?"DM Mono,monospace":"inherit",fontSize:k==="SKU"||k==="OE#"?12:13,overflowWrap:"anywhere"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <FD>
        <FL label={`${t.selectSuppliers} *`}/>
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <input className="inp" placeholder="🔍 Search suppliers…" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)} style={{flex:1,fontSize:12}}/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text2)",whiteSpace:"nowrap",cursor:"pointer"}}>
            <input type="checkbox" className="chk" checked={matchedOnly} onChange={e=>setMatchedOnly(e.target.checked)}/>
            ✓ Matched only
          </label>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto",background:"var(--surface2)",borderRadius:10,padding:11,border:"1px solid var(--border)"}}>
          {sortedSupps.map(s=>{
            const isLinked=!!linkedSupps.find(l=>l.id===s.id);
            const isSelected=!!selectedSuppliers.find(x=>x.id===s.id);
            const inq=latestInqFor(s.id);
            return (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",borderRadius:8,background:isSelected?"rgba(249,115,22,.1)":"transparent",border:isSelected?"1px solid rgba(249,115,22,.3)":"1px solid transparent"}} onClick={()=>toggleSupplier(s)}>
                <input type="checkbox" className="chk" checked={isSelected} readOnly/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700}}>{s.name}</span>
                    {isLinked&&<span style={{fontSize:10,color:"var(--accent)",background:"rgba(249,115,22,.15)",borderRadius:4,padding:"1px 6px"}}>linked</span>}
                    {/* Supplier Part No badge */}
                    {linkedPsMap[s.id]?.supplier_part_no
                      ? <span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--green)",background:"rgba(52,211,153,.12)",borderRadius:4,padding:"1px 7px"}}>✓ {linkedPsMap[s.id].supplier_part_no}</span>
                      : isLinked&&<span style={{fontSize:11,color:"var(--yellow)",background:"rgba(251,191,36,.1)",borderRadius:4,padding:"1px 7px"}}>⚠ part# unknown</span>
                    }
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:3,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {s.country&&<span>📍 {s.country}</span>}
                    {s.phone?<span style={{color:"var(--green)"}}>📞 {s.phone}</span>:<span style={{color:"var(--red)"}}>⚠ no phone</span>}
                    {s.email?<span style={{color:"var(--blue)"}}>✉ {s.email}</span>:<span style={{color:"var(--text3)"}}>no email</span>}
                  </div>
                </div>
                <div style={{flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
                  {inq?.status==="ordered"
                    ? (onCancelOrder
                        ? <button type="button" title={`Ordered ${inq.qty_requested}× @ ${fmtAmt(inq.reply_price)} — click to cancel this order`}
                            disabled={cancellingId===s.id}
                            onClick={e=>{e.stopPropagation();cancelOrder(s,inq);}}
                            style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"5px 9px",borderRadius:7,whiteSpace:"nowrap",
                              cursor:cancellingId===s.id?"wait":"pointer",opacity:cancellingId===s.id?.7:1,
                              border:"1px solid rgba(52,211,153,.4)",background:"rgba(52,211,153,.15)",color:"var(--green)"}}>
                            {cancellingId===s.id?"⏳ Cancelling…":"✅ Ordered ✕"}
                          </button>
                        : <span title={`Ordered ${inq.qty_requested}× @ ${fmtAmt(inq.reply_price)}`}
                            style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"5px 9px",borderRadius:7,whiteSpace:"nowrap",
                              border:"1px solid rgba(52,211,153,.4)",background:"rgba(52,211,153,.15)",color:"var(--green)"}}>
                            ✅ Ordered
                          </span>
                      )
                    : <>
                      {onManualQuote&&(()=>{
                        const bq=!inq?.reply_price?bulkQuoteFor(s.id):null;
                        return (
                          <button type="button" title={inq?.reply_price?"Adjust recorded quote":bq?`Supplier already quoted ${fmtAmt(bq.unit_price)} via RFQ — click to confirm/record it`:"Record a price manually — e.g. after a phone call"}
                            onClick={e=>{e.stopPropagation();openManual(s,inq);}}
                            style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"5px 9px",borderRadius:7,cursor:"pointer",whiteSpace:"nowrap",
                              border:inq?.reply_price?"1px solid rgba(52,211,153,.35)":bq?"1px solid rgba(167,139,250,.4)":"1px solid var(--border)",
                              background:inq?.reply_price?"rgba(52,211,153,.12)":bq?"rgba(167,139,250,.12)":"var(--surface3)",
                              color:inq?.reply_price?"var(--green)":bq?"var(--purple)":"var(--text2)"}}>
                            {inq?.reply_price?`✏️ ${fmtAmt(inq.reply_price)}`:bq?`🏭 ${fmtAmt(bq.unit_price)}`:"💰 Enter Price"}
                          </button>
                        );
                      })()}
                      {onAcceptQuote&&inq?.reply_price&&(
                        <button type="button" title="Create Purchase Invoice from this quote" disabled={acceptingId===s.id}
                          onClick={e=>{e.stopPropagation();acceptQuote(s,inq);}}
                          style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"5px 9px",borderRadius:7,whiteSpace:"nowrap",
                            cursor:acceptingId===s.id?"wait":"pointer",opacity:acceptingId===s.id?.7:1,
                            border:"1px solid rgba(249,115,22,.4)",background:"rgba(249,115,22,.12)",color:"var(--accent)"}}>
                          {acceptingId===s.id?"⏳ Creating…":"🛒 Create PO"}
                        </button>
                      )}
                    </>
                  }
                </div>
              </div>
            );
          })}
          {filteredSupps.length===0&&(
            <div style={{textAlign:"center"}}>
              <p style={{color:"var(--text3)",fontSize:13,margin:0}}>
                {allSupps.length===0?"No suppliers — add them first"
                  :matchedOnly?"No suppliers already carry this exact part yet."
                  :"No suppliers match your search"}
              </p>
              {allSupps.length>0&&matchedOnly&&<button className="btn btn-ghost btn-xs" style={{marginTop:6}} onClick={()=>setMatchedOnly(false)}>Show all suppliers instead →</button>}
            </div>
          )}
        </div>
        {selectedSuppliers.length>0&&<div style={{fontSize:12,color:"var(--green)",marginTop:5}}>✓ {selectedSuppliers.length} supplier{selectedSuppliers.length>1?"s":""} selected</div>}
      </FD>
      <FG>
        <div><FL label="Quantity Required *"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)}/></div>
      </FG>
      <FD><FL label="Message (auto-generated, editable)"/><textarea className="inp" value={msg} onChange={e=>setMsg(e.target.value)} style={{minHeight:160,fontSize:13,fontFamily:"DM Mono,monospace"}}/></FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSend} disabled={selectedSuppliers.length===0||!qty}>📩 {t.sendToSelected} ({selectedSuppliers.length})</button>
      </div>

      {showPhoto&&partPhoto&&<ImgLightbox url={toImgUrl(partPhoto)} onClose={()=>setShowPhoto(false)}/>}

      {manualEdit&&(()=>{
        const s=allSupps.find(x=>x.id===manualEdit.supplierId);
        if(!s) return null;
        const inq=latestInqFor(s.id);
        return (
          <Overlay onClose={()=>setManualEdit(null)}>
            <MHead title={`💰 Record Quote — ${s.name}`} sub={`${part.name} · ${part.sku}`} onClose={()=>setManualEdit(null)}/>
            <FG>
              <div><FL label="Price"/><input className="inp" type="number" step="0.01" placeholder="0.00" autoFocus
                value={manualEdit.price} onChange={e=>setManualEdit(m=>({...m,price:e.target.value}))}/></div>
              <div><FL label="Available Stock"/><input className="inp" type="number" placeholder="qty"
                value={manualEdit.stock} onChange={e=>setManualEdit(m=>({...m,stock:e.target.value}))}/></div>
            </FG>
            <FD><FL label="Their Part# / Reference"/><input className="inp" style={{fontFamily:"DM Mono,monospace"}}
              value={manualEdit.spn} onChange={e=>setManualEdit(m=>({...m,spn:e.target.value}))}/></FD>
            <FD><FL label="Notes (lead time, MOQ, conditions...)"/><textarea className="inp" value={manualEdit.notes}
              onChange={e=>setManualEdit(m=>({...m,notes:e.target.value}))} placeholder="e.g. 7 days lead time, min order 10 pcs" style={{minHeight:70}}/></FD>
            {inq?.replied_at&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>Last recorded: {inq.replied_at.slice(0,16).replace("T"," ")}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setManualEdit(null)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={()=>saveManual(s)}>💾 Save Quote</button>
            </div>
          </Overlay>
        );
      })()}
    </Overlay>
  );
}

// Request quotes for several parts from ONE supplier in a single action — pick the
// supplier once instead of reopening InquiryModal per line item. Creates a proper
// rfq_sessions/rfq_items/rfq_quotes batch (the same mechanism the RFQ page uses) so
// the supplier gets ONE link covering every part instead of one link per part.
export function BulkInquiryModal({items=[],suppliers=[],partSuppliers=[],rfqQuotes=[],rfqItems=[],settings={},sessionName="RFQ",onCreateRfqSession,onClose,t={}}) {
  const [checked,setChecked]=useState(()=>new Set(items.map((_,i)=>i)));
  const [qtyMap,setQtyMap]=useState(()=>Object.fromEntries(items.map((it,i)=>[i,it.qty||1])));
  const [selectedSupplierId,setSelectedSupplierId]=useState(null);
  const [supplierSearch,setSupplierSearch]=useState("");
  const [matchedOnly,setMatchedOnly]=useState(true); // default on — jump straight to suppliers who can actually fill this request
  const [creating,setCreating]=useState(false);
  const [createdInfo,setCreatedInfo]=useState(null); // {sid,itemsList,supplier}
  const [waMsgEdit,setWaMsgEdit]=useState(null); // user override of the outgoing message, once created

  const toggleItem=(i)=>setChecked(prev=>{const n=new Set(prev);n.has(i)?n.delete(i):n.add(i);return n;});

  // Index partSuppliers once (Map<supplierId, Set<partId>>) instead of a linear .find() scan
  // per supplier per item — that was O(suppliers × items × partSuppliers) on every render,
  // slow to interact with on low-power mobile devices when either list is large.
  const psBySupplier=useMemo(()=>{
    const m=new Map();
    partSuppliers.forEach(ps=>{
      if(!m.has(ps.supplier_id)) m.set(ps.supplier_id,new Set());
      m.get(ps.supplier_id).add(ps.part_id);
    });
    return m;
  },[partSuppliers]);

  // Match counts computed once per (items/checked/index) change, not on every render/keystroke
  const matchCounts=useMemo(()=>{
    const m=new Map();
    const checkedParts=items.filter((it,i)=>checked.has(i)&&it.part).map(it=>it.part.id);
    suppliers.forEach(s=>{
      const partIds=psBySupplier.get(s.id);
      m.set(s.id,partIds?checkedParts.filter(pid=>partIds.has(pid)).length:0);
    });
    return m;
  },[suppliers,items,checked,psBySupplier]);
  const matchCount=(s)=>matchCounts.get(s.id)||0;

  // Which SKUs (of the checked items) a given supplier already has an RFQ link for —
  // used both to sort not-yet-asked suppliers to the top and to scope "Request Quote"
  // down to only the items that supplier hasn't already been asked about.
  const linkedSkusForSupplier=(supplierId)=>{
    const checkedSkus=new Set(items.filter((it,i)=>checked.has(i)&&it.part).map(it=>(it.part.sku||"").toUpperCase()));
    if(!checkedSkus.size) return new Set();
    const itemIds=rfqItems.filter(ri=>checkedSkus.has((ri.part_sku||"").toUpperCase())).map(ri=>ri.id);
    const linked=new Set();
    rfqQuotes.filter(q=>String(q.supplier_id)===String(supplierId)&&itemIds.includes(q.rfq_item_id)).forEach(q=>{
      const ri=rfqItems.find(x=>x.id===q.rfq_item_id);
      if(ri) linked.add((ri.part_sku||"").toUpperCase());
    });
    return linked;
  };

  const sortedSupps=useMemo(()=>{
    const q=supplierSearch.trim().toLowerCase();
    const filtered=suppliers.filter(s=>{
      if(matchedOnly&&(matchCounts.get(s.id)||0)===0)return false;
      if(q){
        const hay=`${s.name||""} ${s.country||""} ${s.phone||""} ${s.email||""}`.toLowerCase();
        if(!hay.includes(q))return false;
      }
      return true;
    });
    // Not-yet-asked suppliers first (0 already-linked items), then by match count.
    return [...filtered].sort((a,b)=>{
      const la=linkedSkusForSupplier(a.id).size>0?1:0, lb=linkedSkusForSupplier(b.id).size>0?1:0;
      if(la!==lb) return la-lb;
      return (matchCounts.get(b.id)||0)-(matchCounts.get(a.id)||0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[suppliers,supplierSearch,matchedOnly,matchCounts,checked,rfqItems,rfqQuotes]);
  const selectedSupplier=suppliers.find(s=>s.id===selectedSupplierId)||null;
  const selectedCount=checked.size;

  const existingSessionFor=(supplierId)=>{
    const linked=linkedSkusForSupplier(supplierId);
    if(!linked.size) return null;
    const itemIds=rfqItems.filter(ri=>linked.has((ri.part_sku||"").toUpperCase())).map(ri=>ri.id);
    const matches=rfqQuotes.filter(q=>String(q.supplier_id)===String(supplierId)&&itemIds.includes(q.rfq_item_id));
    if(!matches.length) return null;
    return matches.slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0];
  };

  // Items still eligible to send THIS supplier a fresh request for — checked, in
  // catalog, and not already covered by an existing link with them.
  const newPicksFor=(supplierId)=>{
    const linked=linkedSkusForSupplier(supplierId);
    return items.map((it,i)=>({it,i})).filter(({i,it})=>checked.has(i)&&it.part&&!linked.has((it.part.sku||"").toUpperCase()));
  };

  const resendTo=(s)=>{
    const existing=existingSessionFor(s.id);
    if(!existing) return;
    const linked=linkedSkusForSupplier(s.id);
    const picked=items.map((it,i)=>({it,i})).filter(({i,it})=>checked.has(i)&&it.part&&linked.has((it.part.sku||"").toUpperCase()));
    const itemsList=picked.map(({it,i})=>({name:it.part.name,sku:it.part.sku,qty:+qtyMap[i]||it.qty||1}));
    setCreatedInfo({sid:existing.rfq_id,itemsList,supplier:s});
  };

  const newCount=selectedSupplier?newPicksFor(selectedSupplier.id).length:selectedCount;

  const handleCreate=async()=>{
    if(!selectedSupplier||creating||!onCreateRfqSession)return;
    const picked=newPicksFor(selectedSupplier.id);
    if(picked.length===0)return;
    setCreating(true);
    try{
      const itemsList=picked.map(({it,i})=>({name:it.part.name,sku:it.part.sku,qty:+qtyMap[i]||it.qty||1}));
      const selectedParts=picked.map(({it,i})=>({...it.part,qty_needed:+qtyMap[i]||it.qty||1}));
      const sid=await onCreateRfqSession(sessionName,"",selectedParts,[selectedSupplier]);
      if(sid) setCreatedInfo({sid,itemsList,supplier:selectedSupplier});
    }finally{setCreating(false);}
  };

  // ── Step 2: batch created — surface the ONE link covering every item ──
  if(createdInfo){
    const {sid,itemsList,supplier}=createdInfo;
    const quotes=rfqQuotes.filter(q=>String(q.rfq_id)===String(sid)&&String(q.supplier_id)===String(supplier.id));
    const batchToken=quotes[0]?.token;
    const batchUrl=batchToken?`${window.location.origin}${window.location.pathname}?rfq_batch=${batchToken}`:"";
    const itemsText=itemsList.map((it,i)=>`${i+1}. ${it.name} (${it.sku||"—"}) × ${it.qty}`).join("\n");
    const defaultMsg=`Hi ${supplier.name},\n\nWe have an RFQ for ${itemsList.length} part${itemsList.length!==1?"s":""}. Please click the link below to view the list and submit all quotes at once:\n\n${batchUrl}\n\nParts:\n${itemsText}\n\nThank you,\n${settings?.shop_name||"MotorDesk"}`;
    const waMsg=waMsgEdit??defaultMsg;
    return (
      <Overlay onClose={onClose} wide>
        <MHead title="✅ RFQ Sent" sub={`${itemsList.length} item${itemsList.length!==1?"s":""} · ${supplier.name}`} onClose={onClose}/>
        {!batchToken
          ? <div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>⏳ Preparing quote link…</div>
          : <>
              <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:15,border:"1px solid var(--border)"}}>
                <FL label="One link — every item"/>
                <div style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--accent)",wordBreak:"break-all",lineHeight:1.6}}>{batchUrl}</div>
                <div style={{display:"flex",gap:6,marginTop:7}}>
                  <button className="btn btn-ghost btn-xs" onClick={()=>navigator.clipboard.writeText(batchUrl)}>📋 Copy Link</button>
                  <a href={batchUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a>
                </div>
              </div>
              <FD>
                <FL label="Message preview — link + all items are sent together (editable)"/>
                <textarea className="inp" rows={9} value={waMsg} onChange={e=>setWaMsgEdit(e.target.value)}
                  style={{fontSize:12,fontFamily:"DM Mono,monospace",resize:"vertical",lineHeight:1.5}}/>
              </FD>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {supplier.phone?<a href={waLink(supplier.phone,waMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-primary" style={{width:"100%",background:"#25D366",padding:13,fontSize:15}}>📲 Send via WhatsApp</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 Add supplier phone to enable WhatsApp</p>}
                {supplier.email?<a href={mailLink(supplier.email,`RFQ - ${itemsList.length} items`,waMsg)} style={{textDecoration:"none"}}><button className="btn btn-ghost" style={{width:"100%",padding:13}}>✉ Send via Email</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 Add supplier email to enable Email</p>}
                <button className="btn btn-ghost" onClick={onClose}>Done</button>
              </div>
            </>}
      </Overlay>
    );
  }

  // ── Step 1: pick items + one supplier ──
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📩 Send RFQ — Multiple Items" sub={`${items.length} item${items.length!==1?"s":""} in this request`} onClose={onClose}/>

      <FD>
        <FL label={`Items to Request (${selectedCount}/${items.length} selected) *`}/>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto",background:"var(--surface2)",borderRadius:10,padding:11,border:"1px solid var(--border)"}}>
          {items.map((it,i)=>{
            const isChecked=checked.has(i);
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",borderRadius:8,opacity:it.part?1:.5}}>
                <input type="checkbox" className="chk" checked={isChecked} disabled={!it.part} onChange={()=>toggleItem(i)}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600}}>{it.name||it.part?.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{it.sku||it.part?.sku||"—"}{!it.part&&<span style={{color:"var(--yellow)",fontFamily:"inherit",marginLeft:6}}>⚠ not in catalog — can't RFQ</span>}</div>
                </div>
                {it.part&&<input type="number" min="1" className="inp" value={qtyMap[i]??1}
                  onChange={e=>setQtyMap(m=>({...m,[i]:Math.max(1,+e.target.value||1)}))}
                  style={{width:70,fontSize:12,flexShrink:0}}/>}
              </div>
            );
          })}
        </div>
      </FD>

      <FD>
        <FL label="Select Supplier (one) *"/>
        <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
          <input className="inp" placeholder="🔍 Search suppliers…" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)} style={{flex:1,fontSize:12}}/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--text2)",whiteSpace:"nowrap",cursor:"pointer"}}>
            <input type="checkbox" className="chk" checked={matchedOnly} onChange={e=>setMatchedOnly(e.target.checked)}/>
            ✓ Matches a selected item
          </label>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto",background:"var(--surface2)",borderRadius:10,padding:11,border:"1px solid var(--border)"}}>
          {sortedSupps.map(s=>{
            const isSelected=selectedSupplierId===s.id;
            const mc=matchCount(s);
            const existing=existingSessionFor(s.id);
            const linkedCount=existing?linkedSkusForSupplier(s.id).size:0;
            const isFullyLinked=existing&&linkedCount>=selectedCount;
            return (
              <div key={s.id} onClick={()=>setSelectedSupplierId(s.id)}
                style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",borderRadius:8,
                  background:isSelected?"rgba(249,115,22,.1)":existing?"rgba(96,165,250,.06)":"transparent",
                  border:isSelected?"1px solid rgba(249,115,22,.3)":existing?"1px solid rgba(96,165,250,.3)":"1px solid transparent"}}>
                <input type="radio" className="chk" checked={isSelected} readOnly/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700}}>{s.name}</span>
                    {mc>0&&<span style={{fontSize:10,color:"var(--green)",background:"rgba(52,211,153,.12)",borderRadius:4,padding:"1px 6px"}}>✓ {mc}/{selectedCount} matched</span>}
                    {existing&&<span style={{fontSize:10,color:"var(--blue)",background:"rgba(96,165,250,.14)",borderRadius:4,padding:"1px 6px",fontWeight:700}}>🔗 {isFullyLinked?"All":`${linkedCount}/${selectedCount}`} already asked{existing.unit_price!=null?" · quoted":""}</span>}
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:3,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {s.country&&<span>📍 {s.country}</span>}
                    {s.phone?<span style={{color:"var(--green)"}}>📞 {s.phone}</span>:<span style={{color:"var(--red)"}}>⚠ no phone</span>}
                    {s.email?<span style={{color:"var(--blue)"}}>✉ {s.email}</span>:<span style={{color:"var(--text3)"}}>no email</span>}
                  </div>
                </div>
                {existing&&(
                  <button type="button" className="btn btn-ghost btn-xs" style={{flexShrink:0,color:"var(--blue)"}}
                    title="Reopen the existing link for this supplier instead of creating a new one"
                    onClick={e=>{e.stopPropagation();resendTo(s);}}>↻ Resend</button>
                )}
              </div>
            );
          })}
          {sortedSupps.length===0&&<div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:10}}>No suppliers match</div>}
        </div>
      </FD>

      {selectedSupplier&&newCount<selectedCount&&(
        <div style={{fontSize:12,color:"var(--blue)",marginTop:10,padding:"7px 10px",background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.25)",borderRadius:8}}>
          {newCount===0
            ? `${selectedSupplier.name} already has a link for every checked item — use ↻ Resend above instead of creating a new one.`
            : `${selectedCount-newCount} of ${selectedCount} checked item${selectedCount-newCount!==1?"s":""} already ${selectedCount-newCount!==1?"have":"has"} a link with ${selectedSupplier.name} — only the remaining ${newCount} new item${newCount!==1?"s":""} will be sent.`}
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={!selectedSupplier||newCount===0||creating} onClick={handleCreate}>
          {creating?"Creating…":`📩 Request Quote for ${newCount} New Item${newCount!==1?"s":""}${selectedSupplier?` from ${selectedSupplier.name}`:""}`}
        </button>
      </div>
    </Overlay>
  );
}

export function InquiryDetailModal({inquiry,onUpdate,onAccept,onClose}) {
  const [rp,setRp]=useState(inquiry?.reply_price||"");
  const [rs,setRs]=useState(inquiry?.reply_stock||"");
  const [rn,setRn]=useState(inquiry?.reply_notes||"");
  const [spn,setSpn]=useState(inquiry?.supplier_part_no||"");
  if(!inquiry)return null;
  const replyUrl=`${window.location.origin}${window.location.pathname}?rfq=${inquiry.rfq_token}`;
  const waMsg=`${inquiry.message||`RFQ for ${inquiry.part_name} (${inquiry.part_sku||""}) - Qty: ${inquiry.qty_requested}`}\n\n📎 Submit quote here:\n${replyUrl}`;
  const hasReply=inquiry.reply_price||rp;
  const isOrdered=inquiry.status==="ordered";
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📩 RFQ Detail" sub={inquiry.id} onClose={onClose}/>

      {/* Status pipeline */}
      <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:18,background:"var(--surface2)",borderRadius:10,padding:"10px 14px",border:"1px solid var(--border)"}}>
        {[
          {key:"pending",label:"Sent",icon:"📤"},
          {key:"replied",label:"Replied",icon:"💬"},
          {key:"ordered",label:"Ordered",icon:"✅"},
        ].map((st,i)=>{
          const steps=["pending","replied","ordered"];
          const curIdx=steps.indexOf(inquiry.status);
          const stIdx=steps.indexOf(st.key);
          const done=curIdx>=stIdx;
          return (
            <div key={st.key} style={{display:"contents"}}>
              {i>0&&<div style={{flex:1,height:2,background:done?"var(--accent)":"var(--border)",transition:"background .3s"}}/>}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:64}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:done?"var(--accent)":"var(--surface3)",border:`2px solid ${done?"var(--accent)":"var(--border)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,transition:"background .3s"}}>{st.icon}</div>
                <div style={{fontSize:10,fontWeight:600,color:done?"var(--accent)":"var(--text3)",textTransform:"uppercase",letterSpacing:".05em"}}>{st.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Part + Supplier info */}
      <div style={{background:"var(--surface2)",borderRadius:11,padding:14,marginBottom:14,border:"1px solid var(--border)"}}>
        <FG>
          <div>
            <FL label="Part"/>
            <div style={{fontWeight:600}}>{inquiry.part_name}{inquiry.part_oe_number&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6,fontFamily:"DM Mono,monospace"}}>OE: {inquiry.part_oe_number}</span>}</div>
            <div style={{fontSize:12,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginTop:2}}>{inquiry.part_sku}</div>
          </div>
          <div>
            <FL label="Supplier"/>
            <div style={{fontWeight:600}}>{inquiry.supplier_name}</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:2,display:"flex",gap:8}}>
              {inquiry.supplier_phone&&<span>📞 {inquiry.supplier_phone}</span>}
              {inquiry.supplier_email&&<span>✉ {inquiry.supplier_email}</span>}
            </div>
          </div>
        </FG>
        <FG>
          <div><FL label="Qty Requested"/><div style={{fontWeight:700,color:"var(--accent)",fontSize:18,fontFamily:"Rajdhani,sans-serif"}}>{inquiry.qty_requested}</div></div>
          <div><FL label="Sent On"/><div style={{color:"var(--text2)",fontSize:13}}>{inquiry.created_at?.slice(0,10)}</div></div>
        </FG>
      </div>

      {/* Reply link + re-send */}
      {!isOrdered&&(
        <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:14,border:"1px solid var(--border)"}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Supplier Reply Link</div>
          <div style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--accent)",wordBreak:"break-all",lineHeight:1.6,marginBottom:8}}>{replyUrl}</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            <button className="btn btn-ghost btn-xs" onClick={()=>{navigator.clipboard.writeText(replyUrl);}}>📋 Copy Link</button>
            <a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a>
            {inquiry.supplier_phone&&<a href={`https://wa.me/${(inquiry.supplier_phone||"").replace(/[^0-9]/g,"")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-xs" style={{background:"#25D366",color:"#fff",border:"none"}}>📲 WhatsApp</button></a>}
            {inquiry.supplier_email&&<a href={`mailto:${inquiry.supplier_email}?subject=RFQ - ${inquiry.part_name}&body=${encodeURIComponent(waMsg)}`} style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs">✉ Email</button></a>}
          </div>
        </div>
      )}

      {/* Reply received banner */}
      {(inquiry.status==="replied"||inquiry.reply_price)&&(
        <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",borderRadius:10,padding:13,marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--green)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>💬 Supplier Reply Received</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px 12px",fontSize:13}}>
            <div><span style={{color:"var(--text3)"}}>Price: </span><span style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{inquiry.reply_price?fmtAmt(inquiry.reply_price):"—"}</span></div>
            <div><span style={{color:"var(--text3)"}}>Stock: </span><span style={{fontWeight:600}}>{inquiry.reply_stock??("—")}</span></div>
            <div><span style={{color:"var(--text3)"}}>Part#: </span><span style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--green)"}}>{inquiry.supplier_part_no||"—"}</span></div>
            {inquiry.reply_notes&&<div style={{gridColumn:"1/-1",color:"var(--text2)",fontSize:12,marginTop:2}}>Notes: {inquiry.reply_notes}</div>}
            {inquiry.replied_at&&<div style={{gridColumn:"1/-1",fontSize:11,color:"var(--text3)"}}>Replied: {inquiry.replied_at?.slice(0,16).replace("T"," ")}</div>}
          </div>
        </div>
      )}

      {/* Accept quote → Create PO */}
      {(inquiry.status==="replied"||(rp&&+rp>0))&&!isOrdered&&(
        <div style={{background:"rgba(249,115,22,.06)",border:"1px solid rgba(249,115,22,.2)",borderRadius:10,padding:13,marginBottom:14}}>
          <div style={{fontSize:12,color:"var(--accent)",fontWeight:700,marginBottom:6}}>✅ Accept This Quote</div>
          <div style={{fontSize:12,color:"var(--text2)",marginBottom:10}}>Creates a Purchase Invoice for <strong>{inquiry.qty_requested} × {inquiry.part_name}</strong> @ <strong>{fmtAmt(inquiry.reply_price||rp)}</strong> from <strong>{inquiry.supplier_name}</strong> and updates stock.</div>
          <button className="btn btn-primary" style={{width:"100%"}} onClick={()=>onAccept({...inquiry,reply_price:rp||inquiry.reply_price,supplier_part_no:spn||inquiry.supplier_part_no})}>
            ✅ Accept & Create Purchase Invoice
          </button>
        </div>
      )}
      {isOrdered&&(
        <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",borderRadius:10,padding:13,marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:16}}>✅</div>
          <div style={{fontWeight:700,color:"var(--green)"}}>Purchase Order Created</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>This inquiry has been converted to a purchase invoice.</div>
        </div>
      )}

      {/* Manual reply entry */}
      {!isOrdered&&(
        <>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text2)",marginBottom:10,paddingTop:4,borderTop:"1px solid var(--border)"}}>✏️ Record Reply Manually</div>
          <FD>
            <FL label="Supplier Part No. / Reference"/>
            <input className="inp" value={spn} onChange={e=>setSpn(e.target.value)} placeholder="Supplier internal part number" style={{fontFamily:"DM Mono,monospace"}}/>
          </FD>
          <FG>
            <div><FL label="Reply Price"/><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="0.00"/></div>
            <div><FL label="Available Stock"/><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)} placeholder="qty"/></div>
          </FG>
          <FD><FL label="Notes (lead time, MOQ, conditions...)"/><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)} placeholder="e.g. 7 days lead time, min order 10 pcs" style={{minHeight:60}}/></FD>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" style={{flex:2}} onClick={()=>onUpdate(inquiry.id,{reply_price:rp?+rp:null,reply_stock:rs?+rs:null,reply_notes:rn,supplier_part_no:spn,status:"replied",replied_at:new Date().toISOString()})}>💾 Save & Mark Replied</button>
            {inquiry.status!=="closed"&&<button className="btn btn-danger" style={{flex:1}} onClick={()=>{onUpdate(inquiry.id,{status:"closed"});onClose();}}>✕ Close</button>}
          </div>
        </>
      )}
    </Overlay>
  );
}

export function CustomerModal({customer,onSave,onClose,t}) {
  const [f,setF]=useState(customer?{name:customer.name,phone:customer.phone,email:customer.email||"",address:customer.address||""}:{name:"",phone:"",email:"",address:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={customer?"Edit Customer":"Add Customer"} onClose={onClose}/>
      <FG><div><FL label={`${t.name} *`}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></div><div><FL label={`${t.phone} *`}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div></FG>
      <FD><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></FD>
      <FD><FL label="Address"/><input className="inp" value={f.address} onChange={e=>s("address",e.target.value)}/></FD>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name||!f.phone)return;onSave(f);}}>{t.save}</button></div>
    </Overlay>
  );
}

export function UserModal({user,onSave,onClose,t}) {
  const isEdit=!!user?.id;
  const [f,setF]=useState(isEdit?{username:user.username,password:"",role:user.role,name:user.name||"",phone:user.phone||"",email:user.email||""}:{username:user?.username||"",password:"",role:user?.role||"customer",name:user?.name||"",phone:user?.phone||"",email:user?.email||""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"Edit User":f.role==="workshop"?"🔧 Add Workshop":"Add User"} onClose={onClose}/>
      <FG><div><FL label="Username *"/><input className="inp" value={f.username} onChange={e=>s("username",e.target.value)} disabled={isEdit}/></div><div><FL label={isEdit?"New password (blank=keep)":"Password *"}/><input className="inp" type="password" value={f.password} onChange={e=>s("password",e.target.value)} placeholder="••••••"/></div></FG>
      <FD><FL label={t.role}/><select className="inp" value={f.role} onChange={e=>s("role",e.target.value)}><option value="admin">👑 Admin</option><option value="branch_admin">🏢 Branch Admin</option><option value="scrapyard_admin">♻️ Scrapyard Admin</option><option value="manager">👔 Manager</option><option value="workshop">🔧 Workshop</option><option value="shipper">🚚 Shipper</option><option value="stockman">📦 Stockman</option><option value="customer">👤 Customer</option><option value="demo">🔒 Demo</option></select></FD>
      <FG><div><FL label={t.name}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></div><div><FL label={t.phone}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div></FG>
      <FD><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></FD>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.username||(!isEdit&&!f.password))return;const d={username:f.username,role:f.role,name:f.name,phone:f.phone,email:f.email};if(f.password)d.password=f.password;onSave(d);}}>{t.save}</button></div>
    </Overlay>
  );
}

export function CustHistoryModal({customer,orders,onClose}) {
  if(!customer)return null;
  const total=orders.reduce((s,o)=>s+(o.total||0),0);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📋 Order History" sub={`${customer.name} · ${customer.phone}`} onClose={onClose}/>
      {orders.length===0?<p style={{color:"var(--text3)",textAlign:"center",padding:30}}>No orders yet</p>:(
        <>
          {orders.map(o=>(
            <div key={o.id} style={{background:"var(--surface2)",borderRadius:11,padding:14,marginBottom:9,border:"1px solid var(--border)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{o.id}</code><div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{o.date}</div></div>
                <div style={{textAlign:"right"}}><StatusBadge status={o.status}/><div style={{fontSize:15,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(o.total)}</div></div>
              </div>
              {Array.isArray(o.items)&&o.items.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:2}}><span>{item.name} ×{item.qty}</span><span>{fmtAmt((item.price||0)*item.qty)}</span></div>)}
            </div>
          ))}
          <div style={{borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontWeight:700}}>
            <span style={{color:"var(--text2)"}}>{orders.length} orders</span>
            <span style={{color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:17}}>{fmtAmt(total)}</span>
          </div>
        </>
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// PDF INVOICE MODAL — print-ready invoice with download
// ═══════════════════════════════════════════════════════════════
export function PdfInvoiceModal({inv,settings,onClose}) {
  const [items,setItems]=useState([]);
  const printRef=useRef(null);

  useEffect(()=>{
    const tbl=inv.type==="customer"?"customer_invoice_items":"supplier_invoice_items";
    api.get(tbl,`invoice_id=eq.${inv.id}&select=*`).then(r=>setItems(Array.isArray(r)?r:[]));
  },[inv.id]);

  const cur=curSym(settings.currency||"TWD NT$");
  const fmt=(n)=>`${cur}${(n||0).toLocaleString()}`;
  const isSupplier=inv.type==="supplier";

  const handlePrint=()=>{
    const el=printRef.current;
    if(!el)return;
    const w=window.open("","_blank","width=800,height=1000");
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${inv.id}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:40px;max-width:800px;margin:0 auto}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #111}
      .shop-name{font-size:28px;font-weight:900;color:#f97316;letter-spacing:1px}
      .shop-info{font-size:12px;color:#555;margin-top:6px;line-height:1.7}
      .inv-title{font-size:22px;font-weight:700;color:#111;text-align:right}
      .inv-meta{font-size:12px;color:#555;text-align:right;margin-top:6px;line-height:1.8}
      .inv-no{font-size:14px;font-weight:700;color:#f97316}
      .party{background:#f9f9f9;border-radius:8px;padding:14px 18px;margin-bottom:24px;border:1px solid #e5e5e5}
      .party-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}
      .party-name{font-size:15px;font-weight:700}
      .party-info{font-size:12px;color:#555;margin-top:2px;line-height:1.6}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead tr{background:#111;color:#fff}
      thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
      tbody tr:nth-child(even){background:#f9f9f9}
      tbody td{padding:10px 12px;border-bottom:1px solid #e5e5e5;font-size:13px}
      .amount{text-align:right;font-weight:600}
      .totals{margin-left:auto;width:280px}
      .totals-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #eee}
      .totals-total{display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:800;color:#f97316;border-top:2px solid #111;margin-top:4px}
      .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
      .status-badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#fff3cd;color:#856404}
      .status-paid{background:#d1e7dd;color:#0a3622}
      @media print{body{padding:20px}.no-print{display:none!important}}
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };

  const handleDownloadHtml=()=>{
    const el=printRef.current;
    if(!el)return;
    const html=`<!DOCTYPE html><html><head><title>Invoice ${inv.id}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:40px;max-width:800px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #111}.shop-name{font-size:28px;font-weight:900;color:#f97316}.shop-info{font-size:12px;color:#555;margin-top:6px;line-height:1.7}.inv-title{font-size:22px;font-weight:700;text-align:right}.inv-meta{font-size:12px;color:#555;text-align:right;margin-top:6px;line-height:1.8}.inv-no{font-size:14px;font-weight:700;color:#f97316}.party{background:#f9f9f9;border-radius:8px;padding:14px 18px;margin-bottom:24px;border:1px solid #e5e5e5}.party-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;margin-bottom:5px}.party-name{font-size:15px;font-weight:700}.party-info{font-size:12px;color:#555;margin-top:2px;line-height:1.6}table{width:100%;border-collapse:collapse;margin-bottom:24px}thead tr{background:#111;color:#fff}thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase}tbody tr:nth-child(even){background:#f9f9f9}tbody td{padding:10px 12px;border-bottom:1px solid #e5e5e5;font-size:13px}.amount{text-align:right;font-weight:600}.totals{margin-left:auto;width:280px}.totals-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #eee}.totals-total{display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:800;color:#f97316;border-top:2px solid #111;margin-top:4px}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}</style></head><body>${el.innerHTML}</body></html>`;
    const blob=new Blob([html],{type:"text/html"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`Invoice-${inv.id}.html`;
    a.click();
  };

  const waText=`Invoice ${inv.id}\n${isSupplier?"Supplier":"Customer"}: ${isSupplier?inv.supplier_name:inv.customer_name}\nDate: ${inv.invoice_date}\nTotal: ${fmt(inv.total)}\nStatus: ${inv.status}`;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e=>e.stopPropagation()} style={{maxWidth:760}}>
        {/* Action bar */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <button className="btn btn-primary" onClick={handlePrint}>🖨 Print / Save PDF</button>
          <button className="btn btn-ghost" onClick={handleDownloadHtml}>📥 Download HTML</button>
          {settings.whatsapp&&<a href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost" style={{background:"#25D366",color:"#fff",border:"none"}}>📲 WhatsApp</button></a>}
          {settings.email&&<a href={`mailto:${isSupplier?inv.supplier_email||settings.email:inv.customer_email||settings.email}?subject=Invoice ${inv.id}&body=${encodeURIComponent(waText)}`} style={{textDecoration:"none"}}><button className="btn btn-ghost">✉ Email</button></a>}
          <button className="btn btn-ghost" style={{marginLeft:"auto"}} onClick={onClose}>✕ Close</button>
        </div>

        {/* Invoice preview */}
        <div ref={printRef} style={{background:"#fff",color:"#111",padding:32,borderRadius:8,border:"1px solid #e5e5e5",fontSize:13}}>
          {/* Header */}
          <div className="header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28,paddingBottom:18,borderBottom:"3px solid #111"}}>
            <div>
              {(settings.logo_data||settings.logo_url)
                ? <img src={settings.logo_data||toLogoUrl(settings.logo_url)} alt={settings.shop_name||"Logo"}
                    style={{height:64,maxWidth:240,objectFit:"contain",display:"block",marginBottom:8}}/>
                : <div className="shop-name" style={{fontSize:28,fontWeight:900,color:"#f97316",letterSpacing:1}}>{settings.shop_name||"MotorDesk"}</div>
              }
              <div className="shop-info" style={{fontSize:12,color:"#555",marginTop:5,lineHeight:1.7}}>
                {settings.phone&&<div>📞 {settings.phone}</div>}
                {settings.email&&<div>✉ {settings.email}</div>}
                {settings.address&&<div>📍 {settings.address}</div>}
                {(settings.city||settings.country)&&<div>🌍 {[settings.city,settings.country].filter(Boolean).join(", ")}</div>}
                {settings.vat_number
                  ? <div>VAT Reg No: <strong>{settings.vat_number}</strong></div>
                  : <div style={{color:"#aaa",fontStyle:"italic"}}>Not VAT Registered</div>}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:700,color:"#111"}}>{isSupplier?"PURCHASE INVOICE":"SALES INVOICE"}</div>
              <div className="inv-no" style={{fontSize:15,fontWeight:700,color:"#f97316",margin:"6px 0"}}>{inv.id}</div>
              <div style={{fontSize:12,color:"#555",lineHeight:1.8}}>
                <div>Date: <strong>{inv.invoice_date}</strong></div>
                {inv.due_date&&<div>Due: <strong>{inv.due_date}</strong></div>}
                <div>Status: <span style={{fontWeight:700,color:inv.status==="paid"?"#0a3622":"#856404"}}>{inv.status?.toUpperCase()}</span></div>
              </div>
            </div>
          </div>

          {/* Bill to/from */}
          <div style={{background:"#f9f9f9",borderRadius:8,padding:"12px 16px",marginBottom:22,border:"1px solid #e5e5e5"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>{isSupplier?"Supplier":"Bill To"}</div>
            <div style={{fontSize:15,fontWeight:700}}>{isSupplier?inv.supplier_name:inv.customer_name}</div>
            <div style={{fontSize:12,color:"#555",marginTop:2,lineHeight:1.6}}>
              {!isSupplier&&inv.customer_phone&&<span>📞 {inv.customer_phone}  </span>}
              {!isSupplier&&inv.customer_email&&<span>✉ {inv.customer_email}</span>}
            </div>
          </div>

          {/* Items table */}
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:20}}>
            <thead>
              <tr style={{background:"#111",color:"#fff"}}>
                <th style={{padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Description</th>
                <th style={{padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>SKU</th>
                {isSupplier&&<th style={{padding:"9px 12px",textAlign:"left",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Supplier Ref</th>}
                <th style={{padding:"9px 12px",textAlign:"center",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Qty</th>
                <th style={{padding:"9px 12px",textAlign:"right",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>{isSupplier?"Unit Cost":"Unit Price"}</th>
                <th style={{padding:"9px 12px",textAlign:"right",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item,i)=>(
                <tr key={item.id} style={{background:i%2===0?"#fff":"#f9f9f9"}}>
                  <td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",fontWeight:500}}>{item.part_name}</td>
                  <td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",fontFamily:"monospace",fontSize:11,color:"#777"}}>{item.part_sku}</td>
                  {isSupplier&&<td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",fontFamily:"monospace",fontSize:11,color:"#777"}}>{item.supplier_part_id||"—"}</td>}
                  <td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",textAlign:"center"}}>{item.qty}</td>
                  <td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",textAlign:"right"}}>{fmt(isSupplier?item.unit_cost:item.unit_price)}</td>
                  <td style={{padding:"9px 12px",borderBottom:"1px solid #e5e5e5",textAlign:"right",fontWeight:600}}>{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{marginLeft:"auto",width:280}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid #eee"}}><span>Subtotal</span><span>{fmt(inv.subtotal||inv.total)}</span></div>
            {(inv.tax||0)>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid #eee"}}><span>Tax ({settings.tax_rate||0}%)</span><span>{fmt(inv.tax)}</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",fontSize:18,fontWeight:800,color:"#f97316",borderTop:"2px solid #111",marginTop:4}}>
              <span>TOTAL</span><span>{fmt(inv.total)}</span>
            </div>
          </div>

          {/* Notes */}
          {inv.notes&&<div style={{marginTop:20,padding:"10px 14px",background:"#f9f9f9",borderRadius:6,fontSize:12,color:"#555",borderLeft:"3px solid #f97316"}}><strong>Notes:</strong> {inv.notes}</div>}

          {/* Footer */}
          <div style={{marginTop:36,paddingTop:14,borderTop:"1px solid #e5e5e5",fontSize:11,color:"#999",textAlign:"center",lineHeight:1.8}}>
            <div>Thank you for your business!</div>
            {settings.phone&&<div>Contact: {settings.phone} {settings.email&&`· ${settings.email}`}</div>}
            <div style={{marginTop:4,fontSize:10}}>Generated by {settings.shop_name||"MotorDesk"} · Powered by MotorDesk</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════
export function AddPaymentModal({data,customerInvoices,supplierInvoices,onSave,onClose,t,settings}) {
  const prefill=data?.prefill||{};
  const [f,setF]=useState({
    type:prefill.type||"receipt",
    reference_id:prefill.reference_id||"",
    party_name:prefill.party_name||"",
    method:"cash",
    amount:prefill.amount||"",
    payment_date:prefill.payment_date||new Date().toISOString().slice(0,10),
    notes:""
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const cur=curSym(settings.currency||"TWD NT$");

  // Auto-fill party name when reference selected
  const fillFromRef=(refId,type)=>{
    if(type==="receipt"){
      const inv=customerInvoices.find(i=>i.id===refId);
      if(inv){s("party_name",inv.customer_name);s("amount",inv.total||"");}
    } else {
      const inv=supplierInvoices.find(i=>i.id===refId);
      if(inv){s("party_name",inv.supplier_name);s("amount",inv.total||"");}
    }
    s("reference_id",refId);
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={`💳 ${t.addPayment}`} onClose={onClose}/>
      <FD>
        <FL label="Payment Type"/>
        <div style={{display:"flex",gap:8}}>
          {[["receipt","📥 Receipt (Customer pays us)"],["payment","📤 Payment (We pay supplier)"]].map(([v,lb])=>(
            <button key={v} className={`btn ${f.type===v?"btn-primary":"btn-ghost"}`} style={{flex:1,fontSize:12}} onClick={()=>s("type",v)}>{lb}</button>
          ))}
        </div>
      </FD>
      <FD>
        <FL label="Link to Invoice (optional)"/>
        <select className="inp" value={f.reference_id} onChange={e=>fillFromRef(e.target.value,f.type)}>
          <option value="">Select invoice...</option>
          {(f.type==="receipt"?customerInvoices:supplierInvoices).map(i=>(
            <option key={i.id} value={i.id}>{i.id} — {f.type==="receipt"?i.customer_name:i.supplier_name} — {cur}{(i.total||0).toLocaleString()}</option>
          ))}
        </select>
      </FD>
      <FG>
        <div><FL label={f.type==="receipt"?"Customer Name":"Supplier Name"}/><input className="inp" value={f.party_name} onChange={e=>s("party_name",e.target.value)}/></div>
        <div><FL label="Payment Date"/><input className="inp" type="date" value={f.payment_date} onChange={e=>s("payment_date",e.target.value)}/></div>
      </FG>
      <FG>
        <div>
          <FL label={t.paymentMethod}/>
          <select className="inp" value={f.method} onChange={e=>s("method",e.target.value)}>
            <option value="cash">💵 {t.cash}</option>
            <option value="bank">🏦 {t.bankTransfer}</option>
            <option value="card">💳 {t.card}</option>
          </select>
        </div>
        <div><FL label={`Amount (${cur})`}/><input className="inp" type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} placeholder="0"/></div>
      </FG>
      <FD><FL label="Notes"/><input className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Reference, cheque no, etc."/></FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.amount||!f.party_name)return;onSave({...f,amount:+f.amount});}}>💾 {t.save}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SALESMAN STATEMENT PAGE
// ═══════════════════════════════════════════════════════════════
export function SalesmanStatementPage({customerInvoices=[],customerReturns=[],user,settings}) {
  const [period,setPeriod]=useState("month");
  const sym=curSym(settings.currency||"TWD NT$");
  const fmt=(n)=>`${sym}${(n||0).toFixed(2)}`;

  const salesmanName=(user.name||user.username||"").trim();

  const PAY_LABEL={cash:"💵 Cash",card:"💳 Card",qr:"📱 QR",transfer:"🏦 Transfer"};
  const PAY_COLOR={cash:"var(--green)",card:"var(--blue)",qr:"var(--purple)",transfer:"var(--yellow)"};

  const parseSplits=(inv)=>{
    const pm=inv.payment_method||"cash";
    if(pm.startsWith("[")){try{return JSON.parse(pm);}catch{return [{method:"cash",amount:inv.total||0}];}}
    return [{method:pm,amount:inv.total||0}];
  };

  const myInvoices=useMemo(()=>{
    const now=new Date();
    const todayStr=now.toISOString().slice(0,10);
    const monDay=new Date(now);monDay.setDate(monDay.getDate()-((monDay.getDay()+6)%7));
    const weekStart=monDay.toISOString().slice(0,10);
    const monthPfx=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const yearPfx=`${now.getFullYear()}`;
    return customerInvoices
      .filter(inv=>{
        if(!inv.is_pos||inv.status!=="paid") return false;
        if((inv.created_by||"").trim().toLowerCase()!==salesmanName.toLowerCase()) return false;
        const d=(inv.date||inv.created_at||"").slice(0,10);
        if(period==="today")  return d===todayStr;
        if(period==="week")   return d>=weekStart;
        if(period==="month")  return d.startsWith(monthPfx);
        if(period==="year")   return d.startsWith(yearPfx);
        return true;
      })
      .sort((a,b)=>((b.date||b.created_at||"")>(a.date||a.created_at||"")?1:-1));
  },[customerInvoices,salesmanName,period]);

  const myInvIds=useMemo(()=>new Set(myInvoices.map(i=>i.id)),[myInvoices]);

  const myReturns=useMemo(()=>
    customerReturns
      .filter(r=>myInvIds.has(r.invoice_id))
      .sort((a,b)=>((b.return_date||"")>(a.return_date||"")?1:-1)),
    [customerReturns,myInvIds]
  );

  const totals=useMemo(()=>{
    const t={sales:0,count:myInvoices.length,returns:0,returnCount:myReturns.length,cash:0,card:0,qr:0,transfer:0};
    myInvoices.forEach(inv=>{
      t.sales+=(inv.total||0);
      parseSplits(inv).forEach(s=>{const m=s.method||"cash";if(t[m]!==undefined)t[m]+=parseFloat(s.amount)||0;});
    });
    t.returns=myReturns.reduce((s,r)=>s+(r.total||0),0);
    t.net=t.sales-t.returns;
    return t;
  },[myInvoices,myReturns]);

  const PERIODS=[["today","Today"],["week","This Week"],["month","This Month"],["year","This Year"],["all","All Time"]];

  return (
    <div className="fu">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📊 My Sales Statement</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>Salesman: <strong style={{color:"var(--text)"}}>{salesmanName}</strong></p>
        </div>
      </div>

      {/* Period selector */}
      <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
        {PERIODS.map(([p,lbl])=>(
          <button key={p} className={`btn btn-sm ${period===p?"btn-primary":"btn-ghost"}`}
            onClick={()=>setPeriod(p)} style={{fontSize:12}}>{lbl}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div className="card" style={{padding:"16px 18px",borderLeft:"3px solid var(--green)"}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Total Sales</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:900,color:"var(--green)"}}>{fmt(totals.sales)}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{totals.count} transaction{totals.count!==1?"s":""}</div>
        </div>
        <div className="card" style={{padding:"16px 18px",borderLeft:"3px solid var(--red)"}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Returns</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:900,color:"var(--red)"}}>{fmt(totals.returns)}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{totals.returnCount} return{totals.returnCount!==1?"s":""}</div>
        </div>
      </div>
      <div className="card" style={{padding:"16px 18px",marginBottom:18,borderLeft:"3px solid var(--accent)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Net Revenue</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:30,fontWeight:900,color:"var(--accent)"}}>{fmt(totals.net)}</div>
          </div>
          <div style={{fontSize:32}}>💰</div>
        </div>
      </div>

      {/* Payment method breakdown */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:22}}>
        {["cash","card","qr","transfer"].map(m=>(
          <div key={m} className="card" style={{padding:"12px 14px",textAlign:"center",borderTop:`2px solid ${PAY_COLOR[m]}`}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{PAY_LABEL[m]}</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:17,fontWeight:800,color:PAY_COLOR[m]}}>{fmt(totals[m])}</div>
            {totals.sales>0&&<div style={{fontSize:10,color:"var(--text3)",marginTop:2}}>{Math.round(totals[m]/totals.sales*100)}%</div>}
          </div>
        ))}
      </div>

      {/* Sales list */}
      <h3 style={{fontSize:12,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>🧾 Sales ({myInvoices.length})</h3>
      <div className="card tbl-wrap" style={{overflow:"auto",marginBottom:24}}>
        <table className="tbl" style={{minWidth:520}}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Payment</th>
              <th style={{textAlign:"right"}}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {myInvoices.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:32,color:"var(--text3)"}}>No sales in this period</td></tr>}
            {myInvoices.map(inv=>{
              const splits=parseSplits(inv);
              const payLabel=splits.length===1
                ?(PAY_LABEL[splits[0].method]||splits[0].method)
                :splits.map(s=>PAY_LABEL[s.method]||s.method).join(" + ");
              return (
                <tr key={inv.id}>
                  <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{(inv.date||inv.created_at||"").slice(0,10)}</td>
                  <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{inv.id}</code></td>
                  <td style={{fontWeight:600}}>{inv.customer_name||"Walk-in"}</td>
                  <td style={{fontSize:12,color:"var(--text2)"}}>{payLabel}</td>
                  <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,color:"var(--green)"}}>{fmt(inv.total)}</td>
                </tr>
              );
            })}
            {myInvoices.length>0&&(
              <tr style={{background:"var(--surface2)",borderTop:"2px solid var(--border2)"}}>
                <td colSpan={4} style={{fontWeight:800,fontSize:13}}>TOTAL</td>
                <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:900,fontSize:16,color:"var(--green)"}}>{fmt(totals.sales)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Returns list */}
      <h3 style={{fontSize:12,fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>↩️ Returns ({myReturns.length})</h3>
      <div className="card tbl-wrap" style={{overflow:"auto"}}>
        <table className="tbl" style={{minWidth:560}}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Return #</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Reason</th>
              <th style={{textAlign:"right"}}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {myReturns.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:32,color:"var(--text3)"}}>No returns in this period</td></tr>}
            {myReturns.map(r=>(
              <tr key={r.id}>
                <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{r.return_date}</td>
                <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--purple)"}}>{r.id}</code></td>
                <td style={{fontSize:12,color:"var(--blue)"}}>{r.invoice_id||"—"}</td>
                <td style={{fontWeight:600}}>{r.customer_name||"—"}</td>
                <td style={{fontSize:13,color:"var(--text2)"}}>{r.reason||"—"}</td>
                <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,color:"var(--red)"}}>-{fmt(r.total)}</td>
              </tr>
            ))}
            {myReturns.length>0&&(
              <tr style={{background:"var(--surface2)",borderTop:"2px solid var(--border2)"}}>
                <td colSpan={5} style={{fontWeight:800,fontSize:13}}>TOTAL RETURNS</td>
                <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:900,fontSize:16,color:"var(--red)"}}>-{fmt(totals.returns)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REPORTS PAGE
// ═══════════════════════════════════════════════════════════════
export function ReportsPage({orders,parts,customers,supplierInvoices,payments,customerInvoices=[],customerReturns=[],settings,t,lang,role}) {
  const [period,setPeriod]=useState("monthly");
  const [reportTab,setReportTab]=useState("pos");
  const cur=curSym(settings.currency||"TWD NT$");
  const fmt=(n)=>`${cur}${(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtN=(n)=>(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

  // ── POS Sales data ──
  const posInvoices=customerInvoices.filter(i=>i.is_pos&&i.status==="paid");

  const parseSplits=(inv)=>{
    const pm=inv.payment_method||"cash";
    if(pm.startsWith("[")){try{return JSON.parse(pm);}catch{return [{method:"cash",amount:inv.total||0}];}}
    return [{method:pm,amount:inv.total||0}];
  };

  const METHODS=["cash","card","qr","transfer"];
  const METHOD_LABEL={cash:"💵 Cash",card:"💳 Card",qr:"📱 QR",transfer:"🏦 Transfer"};
  const METHOD_COLOR={cash:"var(--green)",card:"var(--blue)",qr:"var(--purple)",transfer:"var(--yellow)"};

  const periodKey=(dateStr)=>{
    const d=new Date(dateStr);
    if(isNaN(d)) return "—";
    if(period==="daily")   return d.toISOString().slice(0,10);
    if(period==="weekly"){
      const tmp=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
      const day=tmp.getUTCDay()||7;
      tmp.setUTCDate(tmp.getUTCDate()+4-day);
      const yearStart=new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
      const wk=Math.ceil(((tmp-yearStart)/86400000+1)/7);
      return `${tmp.getUTCFullYear()}-W${String(wk).padStart(2,"0")}`;
    }
    if(period==="monthly") return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    return `${d.getFullYear()}`;
  };

  // POS returns linked to POS invoice IDs
  const posInvIds=useMemo(()=>new Set(posInvoices.map(i=>i.id)),[posInvoices]);
  const posRets=useMemo(()=>customerReturns.filter(r=>posInvIds.has(r.invoice_id)),[customerReturns,posInvIds]);

  // Group returns by period (using return_date)
  const retByPeriod=useMemo(()=>{
    const map={};
    posRets.forEach(r=>{
      const key=periodKey(r.return_date||r.created_at);
      if(!map[key]) map[key]={returns:0,returnCount:0};
      map[key].returns+=(r.total||0);
      map[key].returnCount++;
    });
    return map;
  },[posRets,period]);

  // Build grouped rows (sales)
  const posGrouped=useMemo(()=>{
    const map={};
    posInvoices.forEach(inv=>{
      const key=periodKey(inv.date||inv.created_at);
      if(!map[key]) map[key]={key,count:0,total:0,cash:0,card:0,qr:0,transfer:0};
      map[key].count++;
      map[key].total+=(inv.total||0);
      parseSplits(inv).forEach(s=>{
        const m=s.method||"cash";
        if(map[key][m]!==undefined) map[key][m]+=parseFloat(s.amount)||0;
      });
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,60);
  },[posInvoices,period]);

  // Overall totals
  const methodTotals=useMemo(()=>{
    const t2={cash:0,card:0,qr:0,transfer:0,total:0,count:posInvoices.length};
    posInvoices.forEach(inv=>{
      t2.total+=(inv.total||0);
      parseSplits(inv).forEach(s=>{const m=s.method||"cash";if(t2[m]!==undefined)t2[m]+=parseFloat(s.amount)||0;});
    });
    t2.returns=posRets.reduce((s,r)=>s+(r.total||0),0);
    t2.returnCount=posRets.length;
    t2.net=t2.total-t2.returns;
    return t2;
  },[posInvoices,posRets]);

  // By-salesman breakdown
  const bySalesman=useMemo(()=>{
    const invSalesmanMap={};
    posInvoices.forEach(inv=>{invSalesmanMap[inv.id]=inv.created_by||"—";});
    const map={};
    posInvoices.forEach(inv=>{
      const name=inv.created_by||"—";
      if(!map[name]) map[name]={name,sales:0,count:0,returns:0,returnCount:0,cash:0,card:0,qr:0,transfer:0};
      map[name].sales+=(inv.total||0);
      map[name].count++;
      parseSplits(inv).forEach(s=>{const m=s.method||"cash";if(map[name][m]!==undefined)map[name][m]+=parseFloat(s.amount)||0;});
    });
    posRets.forEach(r=>{
      const name=invSalesmanMap[r.invoice_id]||"—";
      if(map[name]){map[name].returns+=(r.total||0);map[name].returnCount++;}
    });
    return Object.values(map).map(s=>({...s,net:s.sales-s.returns})).sort((a,b)=>b.sales-a.sales);
  },[posInvoices,posRets]);

  // ── Legacy sales data (orders) ──
  const completedOrders=orders.filter(o=>o.status==="Completed");
  const totalRevenue=completedOrders.reduce((s,o)=>s+(o.total||0),0);

  // Group orders by period (legacy)
  const ordersByPeriod=useMemo(()=>{
    const map={};
    completedOrders.forEach(o=>{
      const key=periodKey(o.date||o.created_at);
      if(!map[key]) map[key]={key,count:0,total:0};
      map[key].count++;
      map[key].total+=(o.total||0);
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,60);
  },[completedOrders,period]);

  // ── Inventory data ──
  const totalInventoryValue=parts.reduce((s,p)=>s+(p.stock||0)*(p.price||0),0);
  const lowStockParts=parts.filter(p=>p.stock<=p.min_stock);
  const outOfStock=parts.filter(p=>p.stock===0);

  // ── Customer data ──
  const topCustomers=[...customers].sort((a,b)=>(b.total_spent||0)-(a.total_spent||0)).slice(0,10);

  // ── Supplier data ──
  const suppSpend={};
  supplierInvoices.forEach(i=>{ if(!suppSpend[i.supplier_name]) suppSpend[i.supplier_name]={name:i.supplier_name,total:0,count:0}; suppSpend[i.supplier_name].total+=(i.total||0); suppSpend[i.supplier_name].count++; });
  const topSuppliers=Object.values(suppSpend).sort((a,b)=>b.total-a.total).slice(0,10);

  // ── Payments ──
  const totalReceived=payments.filter(p=>p.type==="receipt").reduce((s,p)=>s+(p.amount||0),0);

  const isManagerOnly=role==="manager"||role==="branch_manager";
  const TABS=[
    {id:"pos",    label:"🛒 POS Sales"},
    {id:"sales",  label:"📈 "+t.salesReport},
    {id:"inventory",label:"📦 "+t.inventoryReport},
    {id:"customers",label:"👥 "+t.customerReport},
    ...(isManagerOnly?[]:[{id:"suppliers",label:"🏭 "+t.supplierReport}]),
  ];

  const PeriodBtns=()=>(
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:12,color:"var(--text3)",fontWeight:600}}>Period:</span>
      {["daily","weekly","monthly","yearly"].map(p=>(
        <button key={p} className={`btn btn-sm ${period===p?"btn-primary":"btn-ghost"}`}
          onClick={()=>setPeriod(p)} style={{fontSize:12,textTransform:"capitalize"}}>{p}</button>
      ))}
    </div>
  );

  return (
    <div className="fu">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>📊 {t.reports}</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{t.rptBusinessAnalytics}</p></div>
      </div>

      {/* Report tabs */}
      <div className="tabs" style={{marginBottom:20,width:"fit-content"}}>
        {TABS.map(tb=><button key={tb.id} className={`tab ${reportTab===tb.id?"on":""}`} onClick={()=>setReportTab(tb.id)}>{tb.label}</button>)}
      </div>

      {/* ── POS SALES REPORT ── */}
      {reportTab==="pos"&&(
        <div>
          {/* Top summary: Sales / Returns / Net */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            <div className="card" style={{padding:"16px 18px",borderLeft:"3px solid var(--green)"}}>
              <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Total Sales</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:900,color:"var(--green)"}}>{fmt(methodTotals.total)}</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{methodTotals.count} transactions</div>
            </div>
            <div className="card" style={{padding:"16px 18px",borderLeft:"3px solid var(--red)"}}>
              <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Returns</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:900,color:"var(--red)"}}>{fmt(methodTotals.returns)}</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{methodTotals.returnCount} return{methodTotals.returnCount!==1?"s":""}</div>
            </div>
            <div className="card" style={{padding:"16px 18px",borderLeft:"3px solid var(--accent)"}}>
              <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Net Revenue</div>
              <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:900,color:"var(--accent)"}}>{fmt(methodTotals.net)}</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>after returns</div>
            </div>
          </div>

          {/* Payment method cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
            {METHODS.map(m=>(
              <div key={m} className="card" style={{padding:"14px 16px",borderTop:`2px solid ${METHOD_COLOR[m]}`}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{METHOD_LABEL[m]}</div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:800,color:METHOD_COLOR[m]}}>{fmt(methodTotals[m])}</div>
                <div style={{fontSize:10,color:"var(--text3)",marginTop:2}}>{methodTotals.total>0?Math.round(methodTotals[m]/methodTotals.total*100):0}% of sales</div>
              </div>
            ))}
          </div>

          {/* Period selector */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <PeriodBtns/>
            <span style={{fontSize:12,color:"var(--text3)"}}>{posGrouped.length} period{posGrouped.length!==1?"s":""} · {posInvoices.length} sales · {posRets.length} returns</span>
          </div>

          {/* Period breakdown table */}
          <div className="card tbl-wrap" style={{overflow:"auto",marginBottom:24}}>
            <table className="tbl" style={{minWidth:780}}>
              <thead>
                <tr>
                  <th>Period</th>
                  <th style={{textAlign:"center"}}>Sales</th>
                  <th style={{textAlign:"right",color:"var(--green)"}}>Revenue</th>
                  <th style={{textAlign:"right",color:"var(--red)"}}>↩ Returns</th>
                  <th style={{textAlign:"right",color:"var(--accent)"}}>Net</th>
                  <th style={{textAlign:"right",color:"var(--green)"}}>💵 Cash</th>
                  <th style={{textAlign:"right",color:"var(--blue)"}}>💳 Card</th>
                  <th style={{textAlign:"right",color:"var(--purple)"}}>📱 QR</th>
                  <th style={{textAlign:"right",color:"var(--yellow)"}}>🏦 Transfer</th>
                </tr>
              </thead>
              <tbody>
                {posGrouped.length===0&&(
                  <tr><td colSpan={9} style={{textAlign:"center",padding:40,color:"var(--text3)"}}>No POS sales found</td></tr>
                )}
                {posGrouped.map(row=>{
                  const ret=retByPeriod[row.key]||{returns:0,returnCount:0};
                  const net=row.total-ret.returns;
                  return (
                    <tr key={row.key}>
                      <td style={{fontFamily:"DM Mono,monospace",fontWeight:600,fontSize:13}}>{row.key}</td>
                      <td style={{textAlign:"center"}}>
                        <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{row.count}</span>
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:800,color:"var(--green)"}}>{fmtN(row.total)}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:ret.returns>0?"var(--red)":"var(--text3)"}}>
                        {ret.returns>0?`-${fmtN(ret.returns)}`:"—"}
                        {ret.returnCount>0&&<span style={{fontSize:10,color:"var(--text3)",marginLeft:4}}>({ret.returnCount})</span>}
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:800,color:net>=0?"var(--accent)":"var(--red)"}}>{fmtN(net)}</td>
                      <td style={{textAlign:"right",color:row.cash>0?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{row.cash>0?fmtN(row.cash):"—"}</td>
                      <td style={{textAlign:"right",color:row.card>0?"var(--blue)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{row.card>0?fmtN(row.card):"—"}</td>
                      <td style={{textAlign:"right",color:row.qr>0?"var(--purple)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{row.qr>0?fmtN(row.qr):"—"}</td>
                      <td style={{textAlign:"right",color:row.transfer>0?"var(--yellow)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{row.transfer>0?fmtN(row.transfer):"—"}</td>
                    </tr>
                  );
                })}
                {posGrouped.length>0&&(
                  <tr style={{borderTop:"2px solid var(--border2)",background:"var(--surface2)"}}>
                    <td style={{fontWeight:800,fontSize:13}}>TOTAL</td>
                    <td style={{textAlign:"center",fontWeight:800}}>{methodTotals.count}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:15,fontWeight:900,color:"var(--green)"}}>{fmtN(methodTotals.total)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:900,color:"var(--red)"}}>-{fmtN(methodTotals.returns)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:15,fontWeight:900,color:"var(--accent)"}}>{fmtN(methodTotals.net)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--green)"}}>{fmtN(methodTotals.cash)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--blue)"}}>{fmtN(methodTotals.card)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--purple)"}}>{fmtN(methodTotals.qr)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--yellow)"}}>{fmtN(methodTotals.transfer)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* By Salesman */}
          {bySalesman.length>0&&(
            <>
              <h3 style={{fontSize:12,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>👤 By Salesman</h3>
              <div className="card tbl-wrap" style={{overflow:"auto"}}>
                <table className="tbl" style={{minWidth:680}}>
                  <thead>
                    <tr>
                      <th>Salesman</th>
                      <th style={{textAlign:"center"}}>Sales</th>
                      <th style={{textAlign:"right",color:"var(--green)"}}>Revenue</th>
                      <th style={{textAlign:"right",color:"var(--red)"}}>↩ Returns</th>
                      <th style={{textAlign:"right",color:"var(--accent)"}}>Net</th>
                      <th style={{textAlign:"right",color:"var(--green)"}}>💵 Cash</th>
                      <th style={{textAlign:"right",color:"var(--blue)"}}>💳 Card</th>
                      <th style={{textAlign:"right",color:"var(--purple)"}}>📱 QR</th>
                      <th style={{textAlign:"right",color:"var(--yellow)"}}>🏦 Transfer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySalesman.map((s,i)=>(
                      <tr key={s.name}>
                        <td>
                          <div style={{fontWeight:700}}>{s.name}</div>
                          {i===0&&<div style={{fontSize:11,color:"var(--accent)"}}>⭐ Top performer</div>}
                        </td>
                        <td style={{textAlign:"center"}}><span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{s.count}</span></td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--green)",fontSize:14}}>{fmtN(s.sales)}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:s.returns>0?"var(--red)":"var(--text3)"}}>
                          {s.returns>0?`-${fmtN(s.returns)}`:"—"}
                          {s.returnCount>0&&<span style={{fontSize:10,color:"var(--text3)",marginLeft:3}}>({s.returnCount})</span>}
                        </td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:s.net>=0?"var(--accent)":"var(--red)",fontSize:14}}>{fmtN(s.net)}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:s.cash>0?"var(--green)":"var(--text3)"}}>{s.cash>0?fmtN(s.cash):"—"}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:s.card>0?"var(--blue)":"var(--text3)"}}>{s.card>0?fmtN(s.card):"—"}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:s.qr>0?"var(--purple)":"var(--text3)"}}>{s.qr>0?fmtN(s.qr):"—"}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:s.transfer>0?"var(--yellow)":"var(--text3)"}}>{s.transfer>0?fmtN(s.transfer):"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SALES REPORT (orders) ── */}
      {reportTab==="sales"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            <PeriodBtns/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
            {[
              {label:t.rptTotalRevenue,value:fmt(totalRevenue),color:"var(--green)"},
              {label:t.rptTotalOrders,value:orders.length,color:"var(--blue)"},
              {label:t.rptCashReceived,value:fmt(totalReceived),color:"var(--accent)"},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:"16px 20px",textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{s.label}</div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:800,color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{overflow:"hidden"}}>
            <table className="tbl">
              <thead><tr>{[t.rptPeriod,t.orders_count,t.revenue,t.rptAvgOrder].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {ordersByPeriod.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>{t.rptNoOrders}</td></tr>}
                {ordersByPeriod.map(row=>(
                  <tr key={row.key}>
                    <td style={{fontWeight:600,fontFamily:"DM Mono,monospace"}}>{row.key}</td>
                    <td style={{textAlign:"center"}}><span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{row.count}</span></td>
                    <td style={{textAlign:"right",fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmtN(row.total)}</td>
                    <td style={{textAlign:"right",color:"var(--text2)"}}>{fmtN(row.total/row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INVENTORY REPORT ── */}
      {reportTab==="inventory"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:18}}>
            {[
              {label:t.rptTotalParts,value:parts.length,color:"var(--blue)"},
              {label:t.lowStock,value:lowStockParts.length,color:"var(--yellow)"},
              {label:t.outOfStock,value:outOfStock.length,color:"var(--red)"},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:"16px 20px",textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:"Rajdhani,sans-serif"}}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:20,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em"}}>📦 {t.rptTotalInventoryValue}</h3>
              <span style={{fontSize:24,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(totalInventoryValue)}</span>
            </div>
          </div>
          {lowStockParts.length>0&&(
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,color:"var(--red)",fontSize:13}}>⚠️ {t.lowStockAlert} ({lowStockParts.length})</div>
              <table className="tbl">
                <thead><tr>{[t.sku,t.rptPart,t.category,t.rptCurrentStock,t.minStock,t.rptValue].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {lowStockParts.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{p.sku}</td>
                      <td style={{fontWeight:600}}>{p.name}{p.chinese_desc&&<span style={{color:"var(--text3)",fontWeight:400}}> / {p.chinese_desc}</span>}</td>
                      <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)"}}>{p.category}</span></td>
                      <td><span style={{fontWeight:700,color:p.stock===0?"var(--red)":"var(--yellow)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{p.stock}</span></td>
                      <td style={{color:"var(--text3)"}}>{p.min_stock}</td>
                      <td style={{fontWeight:600,color:"var(--accent)"}}>{fmt((p.stock||0)*(p.price||0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CUSTOMER REPORT ── */}
      {reportTab==="customers"&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13}}>🏆 {t.rptTopCustomers}</div>
          <table className="tbl">
            <thead><tr>{[t.rptRank,t.customer,t.phone,t.orders_count,t.rptTotalSpend,t.rptAvgOrder].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {topCustomers.map((c,i)=>(
                <tr key={c.id}>
                  <td><span style={{fontWeight:700,color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#c47c2b":"var(--text3)",fontSize:15}}>#{i+1}</span></td>
                  <td style={{fontWeight:600}}>{c.name}</td>
                  <td style={{color:"var(--text3)",fontSize:13}}>{c.phone}</td>
                  <td style={{textAlign:"center"}}><span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{c.orders||0}</span></td>
                  <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmt(c.total_spent)}</td>
                  <td style={{color:"var(--text2)"}}>{c.orders?fmt(Math.round((c.total_spent||0)/(c.orders||1))):"—"}</td>
                </tr>
              ))}
              {topCustomers.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>{t.rptNoCustomers}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUPPLIER REPORT ── */}
      {reportTab==="suppliers"&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13}}>🏭 {t.rptSupplierSummary}</div>
          <table className="tbl">
            <thead><tr>{[t.rptRank,t.suppliers,t.rptInvoices,t.rptTotalPurchased,t.rptAvgInvoice].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {topSuppliers.map((s,i)=>(
                <tr key={s.name}>
                  <td><span style={{fontWeight:700,color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#c47c2b":"var(--text3)",fontSize:15}}>#{i+1}</span></td>
                  <td style={{fontWeight:600}}>{s.name}</td>
                  <td style={{textAlign:"center"}}><span className="badge" style={{background:"rgba(167,139,250,.12)",color:"var(--purple)"}}>{s.count}</span></td>
                  <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmt(s.total)}</td>
                  <td style={{color:"var(--text2)"}}>{fmt(Math.round(s.total/s.count))}</td>
                </tr>
              ))}
              {topSuppliers.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>{t.rptNoSuppliers}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STOCK MOVE MODAL
// ═══════════════════════════════════════════════════════════════
export function StockMoveModal({part,parts,onSave,onClose,t}) {
  const [partId,setPartId]=useState(part?.id||"");
  const [fromBin,setFromBin]=useState(part?.bin_location||"");
  const [toBin,setToBin]=useState("");
  const [qty,setQty]=useState(1);
  const [reason,setReason]=useState("");
  const [search,setSearch]=useState(part?(part.name+" "+part.sku):"");
  const [showDrop,setShowDrop]=useState(false);
  const sel=parts.find(p=>p.id===+partId)||part;

  // Search results — limit to 20 for performance
  const results=search.trim().length>0
    ? parts.filter(p=>{
        const q=search.toLowerCase();
        return (p.name||"").toLowerCase().includes(q)
          ||(p.sku||"").toLowerCase().includes(q)
          ||(p.bin_location||"").toLowerCase().includes(q)
          ||(p.chinese_desc||"").toLowerCase().includes(q)
          ||(p.oe_number||"").toLowerCase().includes(q);
      }).slice(0,20)
    : [];

  const selectPart=(p)=>{
    setPartId(p.id);
    setFromBin(p.bin_location||"");
    setSearch(p.name+" — "+p.sku);
    setShowDrop(false);
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={`🔀 ${t.stockMove}`} onClose={onClose}/>
      <FD>
        <FL label="Part * — type to search"/>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:14,pointerEvents:"none"}}>🔍</span>
          <input className="inp" style={{paddingLeft:34}}
            value={search}
            onChange={e=>{setSearch(e.target.value);setShowDrop(true);if(!e.target.value){setPartId("");}}}
            onFocus={()=>setShowDrop(true)}
            placeholder="Search by name, SKU, bin location, OE number..."
            autoComplete="off"/>
          {search&&<button onClick={()=>{setSearch("");setPartId("");setFromBin("");setShowDrop(false);}}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,padding:2}}>✕</button>}

          {/* Dropdown results */}
          {showDrop&&results.length>0&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
              background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,
              zIndex:300,maxHeight:260,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.3)"}}>
              {results.map(p=>(
                <div key={p.id}
                  onMouseDown={e=>{e.preventDefault();selectPart(p);}}
                  style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid var(--border)",
                    display:"flex",alignItems:"center",gap:10}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>
                      <code style={{fontFamily:"DM Mono,monospace"}}>{p.sku}</code>
                      {p.chinese_desc&&<span style={{marginLeft:6}}>{p.chinese_desc}</span>}
                    </div>
                  </div>
                  <div style={{flexShrink:0,textAlign:"right",fontSize:12}}>
                    {p.bin_location&&<div style={{fontFamily:"DM Mono,monospace",color:"var(--blue)",fontWeight:600}}>📦 {p.bin_location}</div>}
                    <div style={{color:"var(--text3)"}}>Stock: <strong style={{color:p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--green)"}}>{p.stock}</strong></div>
                  </div>
                </div>
              ))}
              {results.length===20&&<div style={{padding:"8px 14px",fontSize:11,color:"var(--text3)",textAlign:"center"}}>Showing top 20 — type more to narrow down</div>}
            </div>
          )}
          {showDrop&&search.length>0&&results.length===0&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
              background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,
              padding:"14px",textAlign:"center",color:"var(--text3)",fontSize:13,zIndex:300}}>
              No parts found for "{search}"
            </div>
          )}
        </div>
      </FD>
      {sel&&(
        <div style={{background:"var(--surface2)",borderRadius:10,padding:12,marginBottom:14,border:"1px solid var(--border)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:13}}>
            <div><span style={{color:"var(--text3)"}}>Current Bin</span><div style={{fontWeight:700,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{sel.bin_location||"—"}</div></div>
            <div><span style={{color:"var(--text3)"}}>Stock</span><div style={{fontWeight:700,color:"var(--green)",fontSize:16,fontFamily:"Rajdhani,sans-serif"}}>{sel.stock}</div></div>
            <div><span style={{color:"var(--text3)"}}>SKU</span><div style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{sel.sku}</div></div>
          </div>
        </div>
      )}
      <FG>
        <div><FL label={`${t.fromBin} (current)`}/><input className="inp" value={fromBin} onChange={e=>setFromBin(e.target.value)} placeholder="Current bin location" style={{fontFamily:"DM Mono,monospace"}}/></div>
        <div><FL label={`${t.toBin} *`}/><input className="inp" value={toBin} onChange={e=>setToBin(e.target.value)} placeholder="New bin location" style={{fontFamily:"DM Mono,monospace",borderColor:toBin?"var(--accent)":"var(--border)"}}/></div>
      </FG>
      <FG>
        <div><FL label="Qty to Move"/><input className="inp" type="number" value={qty} onChange={e=>setQty(+e.target.value)} min={1} max={sel?.stock||999}/></div>
        <div><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reorganize, overflow..."/></div>
      </FG>
      {toBin&&fromBin&&(
        <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:9,padding:"10px 14px",fontSize:13,marginBottom:12}}>
          Moving <strong>{qty} × {sel?.name}</strong><br/>
          <span style={{fontFamily:"DM Mono,monospace",color:"var(--red)"}}>{fromBin}</span>
          {" → "}
          <span style={{fontFamily:"DM Mono,monospace",color:"var(--green)"}}>{toBin}</span>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={!partId||!toBin}
          onClick={()=>onSave({part_id:+partId,part_name:sel?.name,part_sku:sel?.sku,from_bin:fromBin,to_bin:toBin,qty,reason})}>
          🔀 {t.moveStock}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// STOCK TAKE PAGE
// ═══════════════════════════════════════════════════════════════
export function StockTakePage({parts,stockTakes,onStart,onComplete,onReopen,onSaveCount,onAdjustItem,t,user,categories=[]}) {
  // ALL useState hooks must be at top — React Rules of Hooks
  const [activeTake,setActiveTake]=useState(null);
  const [takeItems,setTakeItems]=useState([]);
  const [loadingItems,setLoadingItems]=useState(false);
  const [newTakeName,setNewTakeName]=useState(`Stock Take ${new Date().toISOString().slice(0,10)}`);
  const [filterBin,setFilterBin]=useState("");
  const [counts,setCounts]=useState({});
  const [photoLightbox,setPhotoLightbox]=useState(null);
  // Wizard states
  const [showWizard,setShowWizard]=useState(false);
  const [wizardName,setWizardName]=useState(`Stock Take ${new Date().toISOString().slice(0,10)}`);
  const [filterMode,setFilterMode]=useState("all");
  const [filterCat,setFilterCat]=useState("");
  const [filterBinWiz,setFilterBinWiz]=useState("");
  const [manualSelected,setManualSelected]=useState(new Set());
  const [searchWiz,setSearchWiz]=useState("");

  const loadItems=async(stId)=>{
    setLoadingItems(true);
    try{
      const r=await api.get("stock_take_items",`stock_take_id=eq.${stId}&select=*&order=bin_location.asc,part_sku.asc`);
      if(Array.isArray(r)){
        setTakeItems(r);
        const c={};r.forEach(i=>{if(i.counted_qty!==null)c[i.id]=i.counted_qty;});
        setCounts(c);
      } else {
        console.error("stock_take_items error:",r);
        setTakeItems([]);
      }
    }catch(e){
      console.error("loadItems error:",e);
      setTakeItems([]);
    }
    setLoadingItems(false);
  };

  const openTake=async(st)=>{
    setTakeItems([]);    // clear old items first
    setLoadingItems(true);
    setActiveTake(st);   // show detail view with spinner
    await loadItems(st.id);
  };

  const handleCount=async(item,val)=>{
    const n=Math.max(0,+val||0);
    setCounts(p=>({...p,[item.id]:n}));
    await onSaveCount(item.id,n,item.system_qty);
    setTakeItems(p=>p.map(i=>i.id===item.id?{...i,counted_qty:n,variance:n-i.system_qty}:i));
  };

  // Group by bin location
  const [searchTake,setSearchTake]=useState("");
  const bins=[...new Set(takeItems.map(i=>i.bin_location||"(No Bin)"))].sort();
  const filtered=(()=>{
    let f=filterBin?takeItems.filter(i=>(i.bin_location||"(No Bin)")===filterBin):takeItems;
    if(searchTake.trim()) f=f.filter(i=>
      (i.part_name||"").toLowerCase().includes(searchTake.toLowerCase())||
      (i.part_sku||"").toLowerCase().includes(searchTake.toLowerCase())||
      (i.bin_location||"").toLowerCase().includes(searchTake.toLowerCase())
    );
    return f;
  })();
  const countedCount=takeItems.filter(i=>i.counted_qty!==null).length;
  const variances=takeItems.filter(i=>i.variance&&i.variance!==0);

  // Print stock sheet
  const printSheet=()=>{
    const rows=filtered.map(i=>`<tr style="border-bottom:1px solid #ddd">
      <td style="padding:6px 8px;font-family:monospace">${i.bin_location||"—"}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:12px">${i.part_sku}</td>
      <td style="padding:6px 8px">${i.part_name}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700">${i.system_qty}</td>
      <td style="padding:6px 8px;text-align:center;border:2px solid #999;min-width:60px">&nbsp;</td>
      <td style="padding:6px 8px;text-align:center;min-width:60px">&nbsp;</td>
    </tr>`).join("");
    const html=`<!DOCTYPE html><html><head><title>Stock Sheet — ${activeTake?.name}</title>
    <style>body{font-family:Arial;font-size:13px;padding:20px}h2{margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#111;color:#fff;padding:8px;text-align:left;font-size:11px;text-transform:uppercase}@media print{.no-print{display:none}}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div><h2 style="margin:0">📦 Stock Take Sheet</h2><div style="font-size:12px;color:#555;margin-top:4px">${activeTake?.name} · Printed: ${new Date().toLocaleString()}</div></div>
      <div style="font-size:12px;text-align:right;color:#555">Total items: ${filtered.length}</div>
    </div>
    <table><thead><tr><th>Bin</th><th>SKU</th><th>Part Name</th><th style="text-align:center">System Qty</th><th style="text-align:center">Counted</th><th style="text-align:center">Variance</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div style="margin-top:30px;font-size:11px;color:#999">Counted by: _________________ &nbsp;&nbsp; Date: _________________</div>
    </body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();setTimeout(()=>w.print(),300);
  };

  // Lightbox rendered outside .fu to avoid animation stacking context
  const LightboxEl = photoLightbox
    ? <ImgLightbox url={photoLightbox} onClose={()=>setPhotoLightbox(null)}/>
    : null;

  if(activeTake) return (
    <>
    {LightboxEl}
    <div className="fu">
      {/* Photo lightbox — rendered via portal to avoid z-index/overflow issues */}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setActiveTake(null)} style={{marginBottom:6}}>← Back</button>
          <h1 style={{fontSize:20,fontWeight:700}}>{activeTake.name}</h1>
          <div style={{fontSize:13,color:"var(--text3)",marginTop:2}}>
            {countedCount}/{takeItems.length} counted
            {variances.length>0&&<span style={{color:"var(--red)",marginLeft:10}}>⚠ {variances.length} variance{variances.length>1?"s":""}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button className="btn btn-ghost btn-sm" onClick={printSheet}>🖨 Print Sheet</button>
          {activeTake.status==="open" && (user.role==="stockman" || user.role==="admin" || user.role==="manager") && (
            <button className="btn btn-primary" onClick={()=>onComplete(activeTake.id, false).then(()=>setActiveTake(null))}>
              📦 Submit Count
            </button>
          )}
          {activeTake.status==="counted" && (user.role==="admin" || user.role==="manager") && (
            <>
              <button className="btn btn-warning" onClick={()=>onComplete(activeTake.id, true).then(()=>setActiveTake(null))}>
                ✅ Approve & Complete
              </button>
              <button className="btn btn-ghost" onClick={()=>onReopen(activeTake.id).then(()=>setActiveTake(null))}>
                🔄 Reopen for Double Check
              </button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{background:"var(--surface2)",borderRadius:99,height:8,marginBottom:16,overflow:"hidden"}}>
        <div style={{background:"var(--green)",height:"100%",borderRadius:99,width:`${takeItems.length?countedCount/takeItems.length*100:0}%`,transition:"width .3s"}}/>
      </div>

      {/* Quick search */}
      <div style={{position:"relative",marginBottom:12}}>
        <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",
          color:"var(--text3)",fontSize:15,pointerEvents:"none"}}>🔍</span>
        <input className="inp" value={searchTake} onChange={e=>setSearchTake(e.target.value)}
          placeholder="Search part name, SKU, bin..."
          style={{paddingLeft:36,paddingRight:searchTake?36:14}}/>
        {searchTake&&(
          <button onClick={()=>setSearchTake("")}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,padding:2}}>✕</button>
        )}
      </div>

      {/* Bin filter */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button className={`btn btn-sm ${!filterBin?"btn-primary":"btn-ghost"}`} onClick={()=>setFilterBin("")}>All Bins ({takeItems.length})</button>
        {bins.map(b=>{
          const binItems=takeItems.filter(i=>(i.bin_location||"(No Bin)")===b);
          const binCounted=binItems.filter(i=>i.counted_qty!==null).length;
          return <button key={b} className={`btn btn-sm ${filterBin===b?"btn-primary":"btn-ghost"}`}
            onClick={()=>setFilterBin(b)}
            style={{fontFamily:"DM Mono,monospace",borderColor:binCounted===binItems.length?"var(--green)":"var(--border)",color:binCounted===binItems.length?"var(--green)":undefined}}>
            {b} ({binCounted}/{binItems.length})
          </button>;
        })}
      </div>

      {loadingItems&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:60,gap:14}}>
          <div style={{width:36,height:36,border:"3px solid var(--border)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
          <div style={{color:"var(--text3)",fontSize:14}}>Loading items...</div>
        </div>
      )}

      {/* Count — search results info */}
      {searchTake&&!loadingItems&&(
        <div style={{fontSize:13,color:"var(--text3)",marginBottom:8,padding:"4px 0"}}>
          🔍 {filtered.length} result{filtered.length!==1?"s":""} for "{searchTake}"
          {filtered.length===0&&<span style={{color:"var(--red)",marginLeft:8}}>— no match found</span>}
        </div>
      )}

      {/* Count table — table on desktop, cards on mobile */}
      {!loadingItems&&(
        <>
        {/* DESKTOP TABLE */}
        <div className="card" style={{overflow:"hidden",display:"none"}} id="st-table-view">
          <style>{`@media(min-width:640px){#st-table-view{display:block!important}#st-card-view{display:none!important}}`}</style>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                {["","📦 Bin","SKU","Part",t.systemQty,t.countedQty,t.variance,"Status",""].map(h=><th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(item=>{
                  const counted=counts[item.id]??item.counted_qty;
                  const variance=counted!=null?counted-item.system_qty:null;
                  const isDone=counted!=null;
                  const partInfo=parts.find(p=>String(p.id)===String(item.part_id));
                  const imgUrl=partInfo?.image_url?toImgUrl(partInfo.image_url):null;
                  const isAdmin=user.role==="admin"||user.role==="manager";
                  return (
                    <tr key={item.id} style={{background:isDone&&variance!==0?"rgba(248,113,113,.05)":isDone?"rgba(52,211,153,.03)":undefined}}>
                      {/* Photo thumbnail */}
                      <td style={{width:44,padding:"6px 8px",cursor:imgUrl?"zoom-in":"default"}}
                        onClick={()=>{
                          if(imgUrl){
                            const fullUrl=toFullUrl(partInfo.image_url);
                            console.log("Photo click - url:",fullUrl);
                            setPhotoLightbox(fullUrl);
                          }
                        }}>
                        {imgUrl
                          ? <img src={imgUrl} alt=""
                              style={{width:36,height:36,objectFit:"contain",borderRadius:6,
                                background:"var(--surface2)",border:"1px solid var(--accent)",
                                display:"block",pointerEvents:"none"}}/>
                          : <div style={{width:36,height:36,borderRadius:6,background:"var(--surface2)",
                              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔩</div>
                        }
                      </td>
                      <td><span style={{fontFamily:"DM Mono,monospace",fontSize:12,fontWeight:600,color:"var(--blue)"}}>{item.bin_location||"—"}</span></td>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{item.part_sku}</code></td>
                      <td style={{fontWeight:500,fontSize:13}}>
                        {item.part_name}
                        {partInfo?.chinese_desc&&<div style={{fontSize:11,color:"var(--text3)"}}>{partInfo.chinese_desc}</div>}
                      </td>
                      <td style={{textAlign:"center",fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:16,color:"var(--text2)"}}>{item.system_qty}</td>
                      <td style={{width:110}}>
                        <input type="number" className="inp" min={0}
                          value={counted??""} placeholder="—"
                          onChange={e=>handleCount(item,e.target.value)}
                          inputMode="numeric" pattern="[0-9]*"
                          style={{textAlign:"center",fontWeight:700,
                            fontSize:"clamp(15px,3vw,20px)",
                            padding:"8px 4px",
                            borderColor:isDone&&variance!==0?"var(--red)":isDone?"var(--green)":"var(--border)",
                            borderWidth:isDone?"2px":"1px",
                            background:isDone&&variance===0?"rgba(52,211,153,.05)":undefined}}/>
                      </td>
                      <td style={{textAlign:"center"}}>
                        {variance!=null
                          ? <span style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:16,
                              color:variance>0?"var(--green)":variance<0?"var(--red)":"var(--text3)"}}>
                              {variance>0?"+":""}{variance}
                            </span>
                          : <span style={{color:"var(--text3)"}}>—</span>}
                      </td>
                      <td>
                        {isDone
                          ? variance!==0
                            ? <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>⚠ Variance</span>
                            : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)"}}>✓ Match</span>
                          : <span className="badge" style={{background:"var(--surface2)",color:"var(--text3)"}}>Pending</span>}
                      </td>
                      {/* Admin actions */}
                      <td style={{width:80}}>
                        {isAdmin&&(
                          <div style={{display:"flex",flexDirection:"column",gap:4}}>
                            <button className="cp-btn" style={{fontSize:11,padding:"3px 8px",color:"var(--yellow)",borderColor:"rgba(251,191,36,.3)"}}
                              onClick={()=>{const n=parseInt(prompt(`Adjust system qty for ${item.part_name}
Current: ${item.system_qty}`,item.system_qty));if(!isNaN(n)&&n>=0){onAdjustItem(item,n,()=>loadItems(activeTake.id));}}}>
                              ± Adjust
                            </button>
                            {isDone&&variance!==0&&(
                              <button className="cp-btn" style={{fontSize:11,padding:"3px 8px",color:"var(--blue)",borderColor:"rgba(96,165,250,.3)"}}
                                onClick={()=>handleCount(item,item.system_qty)}>
                                ↺ Reset
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                        {filtered.length === 0 && !loadingItems && (
                  <tr><td colSpan={6} style={{textAlign:"center",padding:36,color:"var(--text)"}}>No items to count in this stock take</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MOBILE CARDS */}
        <div id="st-card-view" style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.length===0&&(
            <div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>
              {searchTake?"No parts match your search":"No items to count"}
            </div>
          )}
          {filtered.map(item=>{
            const counted=counts[item.id]??item.counted_qty;
            const variance=counted!=null?counted-item.system_qty:null;
            const isDone=counted!=null;
            const partInfo=parts.find(p=>String(p.id)===String(item.part_id));
            const imgUrl=partInfo?.image_url?toImgUrl(partInfo.image_url):null;
            const isAdmin=user.role==="admin"||user.role==="manager";
            return (
              <div key={item.id} className="card" style={{
                padding:14,
                borderLeft:`3px solid ${isDone&&variance!==0?"var(--red)":isDone?"var(--green)":"var(--border)"}`,
                background:isDone&&variance!==0?"rgba(248,113,113,.04)":isDone?"rgba(52,211,153,.03)":undefined
              }}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{flexShrink:0,cursor:imgUrl?"zoom-in":"default"}}
                    onClick={()=>{if(imgUrl)setPhotoLightbox(toFullUrl(partInfo.image_url));}}>
                    {imgUrl
                      ? <img src={imgUrl} alt="" style={{width:48,height:48,objectFit:"contain",borderRadius:8,background:"var(--surface2)",border:"1px solid var(--border)"}}/>
                      : <div style={{width:48,height:48,borderRadius:8,background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🔩</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.part_name}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:6}}>
                      <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{item.part_sku}</code>
                      {item.bin_location&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)",background:"rgba(96,165,250,.1)",padding:"1px 7px",borderRadius:5}}>📦 {item.bin_location}</span>}
                      {isDone
                        ? variance!==0
                          ? <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>⚠ {variance>0?"+":""}{variance}</span>
                          : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)"}}>✓ Match</span>
                        : <span className="badge" style={{background:"var(--surface2)",color:"var(--text3)"}}>Pending</span>}
                    </div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <div style={{fontSize:12,color:"var(--text3)"}}>Sys: <strong style={{color:"var(--text)"}}>{item.system_qty}</strong></div>
                      <div style={{flex:1,maxWidth:120}}>
                        <input type="number" className="inp" min={0}
                          value={counted??""} placeholder="Count..."
                          onChange={e=>handleCount(item,e.target.value)}
                          inputMode="numeric" pattern="[0-9]*"
                          style={{textAlign:"center",fontWeight:700,fontSize:18,padding:"8px 6px",
                            borderColor:isDone&&variance!==0?"var(--red)":isDone?"var(--green)":"var(--border)",
                            borderWidth:"2px",width:"100%"}}/>
                      </div>
                      {isDone&&variance!=null&&(
                        <div style={{fontSize:16,fontWeight:700,fontFamily:"Rajdhani,sans-serif",
                          color:variance>0?"var(--green)":variance<0?"var(--red)":"var(--text3)",minWidth:36,textAlign:"center"}}>
                          {variance>0?"+":""}{variance}
                        </div>
                      )}
                      {isAdmin&&(
                        <button className="cp-btn" style={{fontSize:11,padding:"4px 10px",color:"var(--yellow)",borderColor:"rgba(251,191,36,.3)",flexShrink:0}}
                          onClick={()=>{const n=parseInt(prompt(`Adjust: ${item.part_name}\nCurrent: ${item.system_qty}`,item.system_qty));if(!isNaN(n)&&n>=0)onAdjustItem(item,n,()=>loadItems(activeTake.id));}}>
                          ± Adj
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Variance summary */}
      {variances.length>0&&(
        <div className="card" style={{padding:18,marginTop:16,border:"1px solid rgba(248,113,113,.2)"}}>
          <h3 style={{fontSize:13,fontWeight:700,color:"var(--red)",marginBottom:12}}>⚠ Variances ({variances.length})</h3>
          {variances.map(item=>(
            <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid var(--border)",fontSize:13}}>
              <span style={{fontFamily:"DM Mono,monospace",color:"var(--blue)",marginRight:8}}>{item.bin_location||"—"}</span>
              <span style={{flex:1}}>{item.part_name}</span>
              <span style={{color:"var(--text2)",marginRight:8}}>System: {item.system_qty}</span>
              <span style={{color:"var(--text2)",marginRight:8}}>Counted: {item.counted_qty}</span>
              <span style={{fontWeight:700,color:item.variance>0?"var(--green)":"var(--red)",fontFamily:"Rajdhani,sans-serif"}}>
                {item.variance>0?"+":""}{item.variance}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );

  // ── New Stock Take wizard ─────────────────────────────

  const wizardParts=()=>{
    let p=[...parts];
    if(filterMode==="category"&&filterCat) p=p.filter(x=>x.category===filterCat);
    if(filterMode==="bin"&&filterBinWiz) p=p.filter(x=>(x.bin_location||"").toLowerCase().includes(filterBinWiz.toLowerCase()));
    if(filterMode==="manual") p=p.filter(x=>manualSelected.has(x.id));
    if(searchWiz) p=p.filter(x=>(x.name+x.sku+x.bin_location).toLowerCase().includes(searchWiz.toLowerCase()));
    return p;
  };

  const toggleManual=(id)=>setManualSelected(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  const toggleAll=()=>{
    const wp=parts.filter(x=>searchWiz?(x.name+x.sku+x.bin_location).toLowerCase().includes(searchWiz.toLowerCase()):true);
    const allSelected=wp.every(p=>manualSelected.has(p.id));
    setManualSelected(prev=>{const s=new Set(prev);wp.forEach(p=>allSelected?s.delete(p.id):s.add(p.id));return s;});
  };

  const allBins=[...new Set(parts.map(p=>p.bin_location||"").filter(Boolean))].sort();
  const selectedCount=wizardParts().length;

  if(showWizard) return (
    <div className="fu">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowWizard(false)}>← Back</button>
        <h1 style={{fontSize:20,fontWeight:700}}>🔢 New Stock Take</h1>
      </div>

      {/* Step 1 - Name */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Step 1 — Name</div>
        <input className="inp" value={wizardName} onChange={e=>setWizardName(e.target.value)} style={{maxWidth:400}}/>
      </div>

      {/* Step 2 - Select parts */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:14}}>Step 2 — Select Items to Count</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {[
            {v:"all",     l:"📦 All Parts",        desc:`${parts.length} items`},
            {v:"category",l:"🗂 By Category",       desc:"filter by category"},
            {v:"bin",     l:"📍 By Bin Location",   desc:"filter by bin"},
            {v:"manual",  l:"✋ Manual Select",     desc:"pick individually"},
          ].map(({v,l,desc})=>(
            <button key={v} onClick={()=>{setFilterMode(v);setManualSelected(new Set());}}
              className="btn"
              style={{
                background:filterMode===v?"var(--accent)":"var(--surface2)",
                color:filterMode===v?"#fff":"var(--text2)",
                border:`1px solid ${filterMode===v?"var(--accent)":"var(--border)"}`,
                padding:"10px 16px", borderRadius:10, textAlign:"left"
              }}>
              <div style={{fontWeight:700,fontSize:13}}>{l}</div>
              <div style={{fontSize:11,opacity:.7,marginTop:2}}>{desc}</div>
            </button>
          ))}
        </div>

        {filterMode==="category"&&(
          <div style={{marginBottom:12}}>
            <select className="inp" style={{maxWidth:300}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {filterMode==="bin"&&(
          <div style={{marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}>
            <input className="inp" value={filterBinWiz} onChange={e=>setFilterBinWiz(e.target.value)}
              placeholder="Type bin location (e.g. A1, SHELF-B)" style={{maxWidth:280}}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allBins.map(b=>(
                <button key={b} className="cp-btn"
                  style={{fontFamily:"DM Mono,monospace",borderColor:filterBinWiz===b?"var(--accent)":"var(--border)",color:filterBinWiz===b?"var(--accent)":"var(--text2)"}}
                  onClick={()=>setFilterBinWiz(b)}>{b}</button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{position:"relative",maxWidth:340,marginBottom:12}}>
          <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:14}}>🔍</span>
          <input className="inp" style={{paddingLeft:34}} value={searchWiz} onChange={e=>setSearchWiz(e.target.value)} placeholder="Search parts..."/>
        </div>

        {/* Parts list */}
        <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",maxHeight:320,overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",background:"var(--surface2)",borderBottom:"1px solid var(--border)",position:"sticky",top:0}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--text3)"}}>
              {filterMode==="manual"?`${manualSelected.size} selected`:`${selectedCount} items will be counted`}
            </span>
            {filterMode==="manual"&&(
              <button className="cp-btn" onClick={toggleAll} style={{fontSize:12}}>
                {parts.filter(x=>searchWiz?(x.name+x.sku+x.bin_location).toLowerCase().includes(searchWiz.toLowerCase()):true).every(p=>manualSelected.has(p.id))?"Deselect All":"Select All"}
              </button>
            )}
          </div>
          {(filterMode==="manual"?parts.filter(x=>searchWiz?(x.name+x.sku+x.bin_location).toLowerCase().includes(searchWiz.toLowerCase()):true):wizardParts()).map(p=>(
            <div key={p.id}
              onClick={filterMode==="manual"?()=>toggleManual(p.id):undefined}
              style={{
                display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                borderBottom:"1px solid var(--border)",
                cursor:filterMode==="manual"?"pointer":"default",
                background:filterMode==="manual"&&manualSelected.has(p.id)?"rgba(251,146,60,.08)":"transparent"
              }}>
              {filterMode==="manual"&&(
                <input type="checkbox" checked={manualSelected.has(p.id)} onChange={()=>toggleManual(p.id)}
                  style={{accentColor:"var(--accent)",width:16,height:16,flexShrink:0}}/>
              )}
              {p.bin_location&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)",background:"rgba(96,165,250,.1)",padding:"2px 7px",borderRadius:5,flexShrink:0}}>{p.bin_location}</span>}
              <span style={{fontWeight:500,flex:1,fontSize:13}}>{p.name}</span>
              <span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{p.sku}</span>
              <span style={{fontSize:12,color:"var(--text2)",flexShrink:0}}>Qty: <strong>{p.stock}</strong></span>
            </div>
          ))}
          {wizardParts().length===0&&filterMode!=="manual"&&<div style={{padding:24,textAlign:"center",color:"var(--text3)",fontSize:13}}>No parts match this filter</div>}
        </div>
      </div>

      {/* Start button */}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button className="btn btn-ghost" onClick={()=>setShowWizard(false)}>Cancel</button>
        <button className="btn btn-primary" style={{padding:"11px 28px",fontSize:15}}
          disabled={selectedCount===0}
          onClick={async()=>{
            const ids=filterMode==="manual"?[...manualSelected]:wizardParts().map(p=>p.id);
            if(ids.length===0){alert("Please select at least one part");return;}
            const id=await onStart(wizardName,ids);
            if(id){
              setShowWizard(false);
              // Small delay so loadAll finishes before opening
              setTimeout(()=>openTake({id,name:wizardName,status:"open",created_at:new Date().toISOString()}),500);
            }
          }}>
          🔢 Start Counting ({selectedCount} items)
        </button>
      </div>
    </div>
  );

  // Stock take list
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🔢 {t.stockTake}</h1>
          <p style={{color:"var(--text)",fontSize:13,marginTop:3}}>{stockTakes.length} {t.stTakes}</p>
        </div>
        {(user.role==="admin" || user.role==="manager") && <button className="btn btn-primary" onClick={()=>{setShowWizard(true);setFilterMode("all");setManualSelected(new Set());setSearchWiz("");}}>
          + {t.startTake}
        </button>}
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <table className="tbl">
          <thead><tr>{[t.name,t.status,t.createdBy,t.actions].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {stockTakes.map(st=>(
              <tr key={st.id}>
                <td style={{fontWeight:600}}>{st.name}</td>
                <td><span className="badge" style={{background:st.status==="completed"?"rgba(52,211,153,.12)":st.status==="counted"?"rgba(139,92,246,.12)":"rgba(251,191,36,.12)",color:st.status==="completed"?"var(--green)":st.status==="counted"?"var(--purple)":"var(--yellow)"}}>{st.status==="completed"?`✅ ${t.stCompleted}`:st.status==="counted"?`📦 ${t.stCounted}`:`🔄 ${t.stOpen}`}</span></td>
                <td style={{color:"var(--text3)",fontSize:13}}>{st.created_at?.slice(0,16)} · {st.created_by}</td>
                <td>
                  <button className="btn btn-info btn-xs" onClick={()=>openTake(st)}>
                    {st.status==="completed"?`👁 ${t.stView}`:st.status==="counted"?`🔍 ${t.stReview}`:`▶ ${t.stContinue}`}
                  </button>
                </td>
              </tr>
            ))}
            {stockTakes.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:36,color:"var(--text)"}}>{user.role==="stockman"?"No active stock takes. Please wait for admin to start a stock take.":"No stock takes yet — click \"+ Start Stock Take\" to begin"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SupplierPartsModal({ supplier, partSuppliers, parts, onDeleteMany, onGoInventory, onClose }) {
  // Snapshot on mount so background loadAll() refreshes don't disturb the list while browsing
  const [rows] = useState(() => partSuppliers);
  const [partsSnap] = useState(() => parts);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (id) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const allIds = rows.map(ps => ps.id);
  const allChecked = allIds.length > 0 && allIds.every(id => selected.has(id));

  const handleDelete = async () => {
    if (!selected.size) return;
    setLoading(true);
    await onDeleteMany([...selected]);
    setLoading(false);
    onClose();
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🏭 ${supplier?.name}`} sub={`${rows.length} linked part${rows.length!==1?"s":""}`} onClose={onClose}/>
      {rows.length === 0 ? (
        <p style={{color:"var(--text3)",textAlign:"center",padding:36}}>No parts linked to this supplier.</p>
      ) : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",marginBottom:8}}>
            <input type="checkbox" checked={allChecked} onChange={()=>allChecked?setSelected(new Set()):setSelected(new Set(allIds))} style={{width:16,height:16,cursor:"pointer"}}/>
            <span style={{fontSize:13,color:"var(--text2)",fontWeight:600}}>Select All ({allIds.length})</span>
            {selected.size>0&&<span style={{fontSize:12,color:"var(--red)",marginLeft:"auto",fontWeight:700}}>{selected.size} selected</span>}
          </div>
          <div style={{maxHeight:420,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
            {rows.map(ps=>{
              const part=partsSnap.find(p=>p.id===ps.part_id);
              const isSel=selected.has(ps.id);
              return (
                <div key={ps.id} onClick={()=>toggle(ps.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:isSel?"rgba(239,68,68,.08)":"var(--surface2)",border:`1px solid ${isSel?"rgba(239,68,68,.35)":"var(--border)"}`,cursor:"pointer",transition:"background .15s,border .15s"}}>
                  <input type="checkbox" checked={isSel} onChange={()=>toggle(ps.id)} onClick={e=>e.stopPropagation()} style={{width:16,height:16,cursor:"pointer",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{part?.name||"Unknown Part"}</div>
                    <div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{part?.sku||""}{ps.supplier_part_no?` · Supp#: ${ps.supplier_part_no}`:""}</div>
                  </div>
                  {ps.supplier_price!=null&&<div style={{fontSize:13,fontWeight:700,color:"var(--green)",flexShrink:0}}>{ps.supplier_price}</div>}
                  {part&&<button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:11,padding:"2px 8px"}} onClick={e=>{e.stopPropagation();onGoInventory(part);}} title="Open in Inventory">✏️</button>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" style={{flex:2}} disabled={!selected.size||loading} onClick={handleDelete}>
              {loading?"Deleting…":`🗑 Delete Selected (${selected.size})`}
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}

// ─── Supplier Catalogue Modal ─────────────────────────────────────────────────
export function SupplierCatalogueModal({ supplier, onClose, onGoToPart, onAddToInventory, parts=[] }) {
  const [activeTab, setActiveTab] = useState("browse");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(supplier?._search||"");
  const [matchFilter, setMatchFilter] = useState(null); // "matched" | "unmatched" | null
  const [page, setPage] = useState(supplier?._page||1);
  const PAGE_SIZE = 20;
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // edit drawer
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm]         = useState({});
  const [saving, setSaving]             = useState(false);
  const [invMatches, setInvMatches]     = useState(null);
  const [checkingInv, setCheckingInv]   = useState(false);
  const [compareItem, setCompareItem]   = useState(null);
  useEffect(()=>{ setInvMatches(null); setCompareItem(null); }, [selectedItem?.id]);

  // Build OEM → [sku] map from parts array for instant row-level matching
  const oemToParts = useMemo(()=>{
    const map = {};
    for(const p of parts){
      if(!p.oe_number) continue;
      p.oe_number.split(/[\s,;]+/).filter(Boolean).forEach(tok=>{
        const k = tok.trim().toUpperCase();
        if(!map[k]) map[k]=[];
        if(!map[k].find(x=>x.id===p.id)) map[k].push({id:p.id,sku:p.sku,name:p.name});
      });
    }
    return map;
  }, [parts]);

  const getMatchedSkus = (item) => {
    if(!item?.oem_number) return [];
    const seen = new Set();
    const matched = [];
    parseOems(item.oem_number).forEach(tok=>{
      (oemToParts[tok.toUpperCase()]||[]).forEach(p=>{ if(!seen.has(p.id)){seen.add(p.id);matched.push(p);} });
    });
    return matched;
  };

  const renderMatchBadge = (p, stopProp=false, showName=false) => (
    <div key={p.id} style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <span style={{fontFamily:"DM Mono,monospace",fontSize:10,fontWeight:700,background:"rgba(52,211,153,.15)",color:"#047857",border:"1px solid rgba(52,211,153,.4)",borderRadius:4,padding:"2px 6px"}}>{p.sku}</span>
      {showName&&p.name&&<span style={{fontSize:10,color:"var(--text2)"}}>{p.name}</span>}
      {onGoToPart&&<button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:"1px 7px",color:"var(--blue)",borderColor:"rgba(96,165,250,.3)"}}
        onClick={async(e)=>{if(stopProp)e.stopPropagation();try{const full=await api.get("parts",`id=eq.${p.id}&select=*&limit=1`);onGoToPart(Array.isArray(full)?full[0]:full,{page,search});}catch{onGoToPart(p,{page,search});}}}
        title={`Open ${p.sku}`}>✏️</button>}
    </div>
  );

  // responsive: card view on narrow screens
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Split an OEM string into individual tokens
  const parseOems = (str) => (str||"").split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);

  // Build OEM → [items] index from everything loaded (detects duplicates within this catalogue)
  const oemIndex = useMemo(() => {
    const map = {};
    items.forEach(item => {
      parseOems(item.oem_number).forEach(n => {
        if (!map[n]) map[n] = [];
        map[n].push(item);
      });
    });
    return map;
  }, [items]);

  // Return other items sharing at least one OEM with the given item
  const getOemDuplicates = (item) => {
    const seen = new Set();
    const result = [];
    parseOems(item.oem_number).forEach(n => {
      (oemIndex[n] || []).forEach(match => {
        if (match.id !== item.id && !seen.has(match.id)) {
          seen.add(match.id);
          result.push({ ...match, matchedOem: n });
        }
      });
    });
    return result;
  };

  const openDrawer = (item) => {
    setSelectedItem(item);
    setEditForm({
      supplier_part_no: item.supplier_part_no || "",
      description:      item.description      || "",
      oem_number:       item.oem_number       || "",
      application:      item.application      || "",
      image_url:        item.image_url        || "",
    });
  };

  const saveDrawer = async () => {
    setSaving(true);
    await api.patch("supplier_catalogue", "id", selectedItem.id, editForm);
    setItems(prev => prev.map(x => x.id === selectedItem.id ? { ...x, ...editForm } : x));
    setSelectedItem(prev => ({ ...prev, ...editForm }));
    setSaving(false);
  };

  // import state
  const [rawRows, setRawRows] = useState([]);   // all rows incl. header
  const [colMap, setColMap] = useState({});     // { colIndex: fieldName }
  const [fileErr, setFileErr] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    api.get("supplier_catalogue", `select=*&supplier_id=eq.${supplier.id}&order=supplier_part_no.asc`)
      .then(r => { setItems(Array.isArray(r) ? r : []); setLoading(false); });
  }, [supplier.id]);

  const headers  = rawRows[0] || [];
  const dataRows = rawRows.slice(1).filter(r => r.some(c => String(c).trim()));

  const handleFile = async (file) => {
    if (!file) return;
    setFileErr(""); setFileLoading(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let rows;
      if (ext === "csv") {
        rows = parseDelimitedText(await file.text());
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await loadXLSX();
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      } else {
        setFileErr("Use .csv, .xlsx or .xls"); setFileLoading(false); return;
      }
      const cleaned = rows.filter(r => Array.isArray(r) && r.some(c => String(c).trim()));
      if (cleaned.length < 2) { setFileErr("File has no data rows"); setFileLoading(false); return; }
      setRawRows(cleaned);
      setColMap(catAutoDetect(cleaned[0] || []));
      setImportStep(2);
    } catch(e) {
      setFileErr("Parse error: " + e.message);
    }
    setFileLoading(false);
  };

  const getField = (row, field) => {
    const entry = Object.entries(colMap).find(([, f]) => f === field);
    return entry !== undefined ? String(row[+entry[0]] || "").trim() : "";
  };

  const buildPreview = () => dataRows.slice(0, 5).map(row => ({
    supplier_part_no: getField(row, "supplier_part_no"),
    description:      getField(row, "description"),
    oem_number:       getField(row, "oem"),
    application:      getField(row, "application"),
    image_url:        getField(row, "image_url"),
  }));

  const doImport = async () => {
    setImporting(true);
    const toInsert = dataRows
      .map(row => ({
        supplier_id:      supplier.id,
        supplier_part_no: getField(row, "supplier_part_no") || null,
        description:      getField(row, "description") || null,
        oem_number:       getField(row, "oem") || null,
        application:      getField(row, "application") || null,
        image_url:        getField(row, "image_url") || null,
      }))
      .filter(r => r.supplier_part_no || r.description);

    let inserted = 0, errors = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const res = await api.upsert("supplier_catalogue", chunk);
      if (res?.code) errors += chunk.length;
      else inserted += Array.isArray(res) ? res.length : chunk.length;
    }
    setImportResult({ inserted, errors });
    const updated = await api.get("supplier_catalogue", `select=*&supplier_id=eq.${supplier.id}&order=supplier_part_no.asc`);
    setItems(Array.isArray(updated) ? updated : []);
    setImporting(false);
    setImportStep(3);
  };

  const clearAll = async () => {
    if (!confirm(`Delete all ${items.length} catalogue items for ${supplier.name}?`)) return;
    await api.delete("supplier_catalogue", "supplier_id", supplier.id);
    setItems([]);
  };

  const deleteItem = async (id) => {
    await api.delete("supplier_catalogue", "id", id);
    setItems(prev => prev.filter(x => x.id !== id));
  };

  const filtered = items.filter(x => {
    if (search.trim()) {
      const haystack = [x.supplier_part_no, x.description, x.oem_number, x.application]
        .map(v => (v||"").toLowerCase()).join(" ");
      if (!search.trim().toLowerCase().split(/\s+/).every(w => haystack.includes(w))) return false;
    }
    if (matchFilter === "matched")   return getMatchedSkus(x).length > 0;
    if (matchFilter === "unmatched") return getMatchedSkus(x).length === 0;
    return true;
  });

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pageItems   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const matchStats = useMemo(() => {
    let matched = 0;
    for (const item of items) {
      if (getMatchedSkus(item).length > 0) matched++;
    }
    return { matched, unmatched: items.length - matched };
  }, [items, oemToParts]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetImport = () => { setImportStep(1); setRawRows([]); setImportResult(null); setFileErr(""); };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`📋 ${supplier?.name} — Catalogue`} sub={`${items.length} item${items.length!==1?"s":""}`} onClose={onClose}/>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:16,borderBottom:"1px solid var(--border)"}}>
        {[["browse","Browse"],["import","⬆ Import"]].map(([key,label])=>(
          <button key={key} onClick={()=>{setActiveTab(key);if(key==="import"&&importStep===3)resetImport();}}
            style={{padding:"7px 18px",background:"none",border:"none",borderBottom:`2px solid ${activeTab===key?"var(--accent)":"transparent"}`,fontWeight:activeTab===key?700:400,color:activeTab===key?"var(--accent)":"var(--text2)",cursor:"pointer",fontSize:14}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {activeTab==="browse"&&(
        loading
          ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>Loading…</div>
          : items.length===0
            ? (
              <div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>
                <div style={{fontSize:36,marginBottom:8}}>📭</div>
                <div style={{marginBottom:14}}>No catalogue items yet.</div>
                <button className="btn btn-primary" onClick={()=>setActiveTab("import")}>Import CSV / Excel</button>
              </div>
            )
            : (
              <>
                {/* Search */}
                <div style={{position:"relative",marginBottom:12}}>
                  <input className="form-control" placeholder="🔍  Search part no / description / OEM / application…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{width:"100%",fontSize:15,paddingRight:search?36:14,paddingTop:10,paddingBottom:10,paddingLeft:14,boxSizing:"border-box",color:"#111",background:"#fff",border:"1.5px solid var(--border)",borderRadius:8}}/>
                  {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--text3)",lineHeight:1}} title="Clear search">✕</button>}
                </div>

                {/* ── MOBILE: card list ── */}
                {isMobile ? (
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:420,overflowY:"auto"}}>
                    {pageItems.map(item=>{
                      const dups = getOemDuplicates(item);
                      const matchedSkus = getMatchedSkus(item);
                      return (
                        <div key={item.id} onClick={()=>openDrawer(item)}
                          style={{display:"flex",gap:10,padding:"10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",alignItems:"flex-start"}}>
                          <div style={{flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            {item.image_url
                              ? <img src={toImgUrl(item.image_url)} alt="" loading="lazy" onClick={()=>setLightboxUrl(item.image_url)}
                                  style={{width:52,height:52,objectFit:"contain",borderRadius:6,background:"#f5f5f5",border:"1px solid var(--border)",cursor:"zoom-in"}} onError={e=>{e.target.style.display="none";}}/>
                              : <div style={{width:52,height:52,borderRadius:6,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,opacity:.25}}>🖼</div>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                              <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>
                                {item.supplier_part_no||"—"}
                                {dups.length>0&&<span title="OEM duplicate" style={{marginLeft:4,color:"var(--amber,#f59e0b)",fontSize:10}}>⚠</span>}
                              </span>
                              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",padding:"0 6px",fontSize:13}} onClick={e=>{e.stopPropagation();deleteItem(item.id);}}>✕</button>
                            </div>
                            <div style={{fontSize:12,fontWeight:500,marginBottom:3}}>{item.description||"—"}</div>
                            {matchedSkus.length>0&&<div style={{marginBottom:3,display:"flex",flexDirection:"column",gap:3}}>{matchedSkus.map(p=>renderMatchBadge(p,true))}</div>}
                            {item.oem_number&&<div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginBottom:2,wordBreak:"break-all"}}>{item.oem_number}</div>}
                            {item.application&&<div style={{fontSize:11,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={item.application}>{item.application}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── DESKTOP: table ── */
                  <div style={{overflowX:"auto"}}>
                    <div style={{maxHeight:440,overflowY:"auto"}}>
                      <table className="tbl" style={{fontSize:14,tableLayout:"fixed",width:"100%"}}>
                        <colgroup>
                          <col style={{width:"7%"}}/><col style={{width:"14%"}}/><col style={{width:"5%"}}/><col style={{width:"14%"}}/><col style={{width:"21%"}}/><col style={{width:"31%"}}/><col style={{width:"8%"}}/>
                        </colgroup>
                        <thead><tr><th></th><th>Supplier Part No</th><th></th><th>Description</th><th>OEM Number</th><th>Application</th><th></th></tr></thead>
                        <tbody>
                          {pageItems.map(item=>{
                            const dups = getOemDuplicates(item);
                            const isSelected = selectedItem?.id === item.id;
                            const matchedSkus = getMatchedSkus(item);
                            return (
                              <tr key={item.id} style={{background:isSelected?"var(--accent-muted,rgba(99,102,241,.08))":"",cursor:"pointer"}} onClick={()=>openDrawer(item)}>
                                <td style={{textAlign:"center",padding:"2px 4px"}} onClick={e=>e.stopPropagation()}>
                                  {item.image_url
                                    ? <img src={toImgUrl(item.image_url)} alt="" loading="lazy" onClick={()=>setLightboxUrl(item.image_url)} style={{width:44,height:44,objectFit:"contain",borderRadius:4,background:"#f5f5f5",border:"1px solid var(--border)",cursor:"zoom-in"}} onError={e=>{e.target.style.display="none";}}/>
                                    : <span style={{fontSize:18,opacity:.25}}>🖼</span>}
                                </td>
                                <td title={item.supplier_part_no||""}>
                                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:600,wordBreak:"break-all"}}>
                                    {item.supplier_part_no||"—"}
                                    {dups.length>0&&<span title={`OEM also in: ${dups.map(d=>d.supplier_part_no).join(", ")}`} style={{marginLeft:4,color:"var(--amber,#f59e0b)",fontSize:10}}>⚠</span>}
                                  </div>
                                  {matchedSkus.length>0&&<div style={{display:"flex",flexDirection:"column",gap:2,marginTop:2}}>{matchedSkus.map(p=>(
                                    <span key={p.id} style={{fontFamily:"DM Mono,monospace",fontSize:12,fontWeight:700,background:"rgba(52,211,153,.15)",color:"#047857",border:"1px solid rgba(52,211,153,.4)",borderRadius:4,padding:"1px 5px",display:"inline-block"}}>{p.sku}</span>
                                  ))}</div>}
                                </td>
                                {/* pencil column — navigate to matched part or open drawer */}
                                <td style={{textAlign:"center",padding:"2px"}} onClick={e=>e.stopPropagation()}>
                                  {matchedSkus.length>0&&onGoToPart&&(
                                    <button className="btn btn-ghost btn-sm" style={{padding:"2px 6px",color:"var(--blue)",borderColor:"rgba(96,165,250,.3)"}}
                                      onClick={async(e)=>{e.stopPropagation();const p=matchedSkus[0];try{const full=await api.get("parts",`id=eq.${p.id}&select=*&limit=1`);onGoToPart(Array.isArray(full)?full[0]:full,{page,search});}catch{onGoToPart(p,{page,search});}}}
                                      title="Open in Inventory">✏️</button>
                                  )}
                                </td>
                                <td style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={item.description||""}>{item.description||"—"}</td>
                                <td style={{fontFamily:"DM Mono,monospace",color:"var(--text3)",whiteSpace:"pre-wrap",lineHeight:1.5,fontSize:13}}>{item.oem_number||"—"}</td>
                                <td style={{color:"var(--text2)",whiteSpace:"pre-wrap",lineHeight:1.5,fontSize:13}}>{item.application||"—"}</td>
                                <td style={{textAlign:"center",paddingRight:8,whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
                                  <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",padding:"2px 10px",minWidth:32}} onClick={()=>deleteItem(item.id)} title="Delete row">✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Edit popup (both desktop & mobile) ── */}
                {selectedItem&&(
                  <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={()=>setSelectedItem(null)}>
                    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)"}}/>
                    <div style={{position:"relative",width:"100%",maxWidth:440,maxHeight:"92vh",display:"flex",flexDirection:"column",background:"var(--bg)",borderRadius:12,boxShadow:"0 8px 40px rgba(0,0,0,.35)"}} onClick={e=>e.stopPropagation()}>

                      {/* ── Header: large part no + close ── */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"14px 16px 10px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
                        <div>
                          <div style={{fontFamily:"DM Mono,monospace",fontWeight:800,fontSize:22,letterSpacing:.5,lineHeight:1.1}}>{selectedItem.supplier_part_no||"—"}</div>
                          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{selectedItem.description||""}</div>
                          {(()=>{const ps=getMatchedSkus(selectedItem);return ps.length>0&&(
                            <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:6}}>
                              {ps.map(p=>renderMatchBadge(p,false,true))}
                            </div>
                          );})()}
                        </div>
                        <button onClick={()=>setSelectedItem(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"var(--text3)",lineHeight:1,marginLeft:12,flexShrink:0}}>✕</button>
                      </div>

                      {/* ── Scrollable body ── */}
                      <div style={{overflowY:"auto",padding:"12px 16px",flex:1,fontWeight:"normal",color:"var(--text)"}}>
                        {/* Inventory match quick-nav */}
                        {(()=>{const ps=getMatchedSkus(selectedItem);return ps.length>0&&onGoToPart&&(
                          <div style={{marginBottom:12,display:"flex",flexDirection:"column",gap:6}}>
                            {ps.map(p=>(
                              <button key={p.id} className="btn btn-ghost" style={{justifyContent:"space-between",display:"flex",alignItems:"center",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface2)",textAlign:"left"}}
                                onClick={async()=>{try{const full=await api.get("parts",`id=eq.${p.id}&select=*&limit=1`);onGoToPart(Array.isArray(full)?full[0]:full,{page,search});}catch{onGoToPart(p,{page,search});}}}>
                                <div>
                                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13,color:"var(--text)"}}>{p.sku}</div>
                                  {p.name&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{p.name}</div>}
                                </div>
                                <span style={{fontSize:13,color:"var(--blue)",fontWeight:600}}>Open in Inventory ↗</span>
                              </button>
                            ))}
                          </div>
                        );})()}
                        {editForm.image_url&&(
                          <div style={{textAlign:"center",marginBottom:10}}>
                            <img src={toImgUrl(editForm.image_url)} alt="" style={{maxWidth:"100%",maxHeight:100,objectFit:"contain",borderRadius:6,border:"1px solid var(--border)"}} onError={e=>{e.target.style.display="none";}}/>
                          </div>
                        )}
                        {[["Part No","supplier_part_no"],["Description","description"],["OEM Numbers","oem_number"],["Application","application"],["Image URL","image_url"]].map(([label,field])=>{
                          const multiLine = field==="oem_number"||field==="application";
                          return (
                            <div key={field} style={{marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                                <div style={{fontSize:12,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:.6}}>{label}</div>
                                {field==="oem_number"&&(
                                  <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:"1px 8px"}} disabled={checkingInv}
                                    onClick={async()=>{
                                      const tokens = parseOems(editForm.oem_number);
                                      if(!tokens.length) return;
                                      setCheckingInv(true); setInvMatches(null);
                                      try {
                                        const orClause = tokens.map(n=>`oe_number.ilike.*${encodeURIComponent(n)}*`).join(",");
                                        const res = await api.get("parts", `or=(${orClause})&select=id,name,sku,oe_number,category,image_url&limit=10`);
                                        setInvMatches(Array.isArray(res)?res:[]);
                                      } catch(e){ setInvMatches([]); }
                                      setCheckingInv(false);
                                    }}>
                                    {checkingInv?"Checking…":"🔍 Check Inventory"}
                                  </button>
                                )}
                              </div>
                              {multiLine
                                ? <textarea rows={2} className="inp" style={{width:"100%",fontSize:12,resize:"none",boxSizing:"border-box",lineHeight:1.4,padding:"5px 8px"}}
                                    value={editForm[field]} onChange={e=>setEditForm(f=>({...f,[field]:e.target.value}))}/>
                                : <input type="text" className="inp" style={{width:"100%",fontSize:12,boxSizing:"border-box",padding:"5px 8px"}}
                                    value={editForm[field]} onChange={e=>setEditForm(f=>({...f,[field]:e.target.value}))}/>
                              }
                              {/* ── Inventory matches ── */}
                              {field==="oem_number"&&invMatches!==null&&(
                                <div style={{marginTop:8,borderRadius:6,border:"1px solid var(--border)",overflow:"hidden"}}>
                                  {invMatches.length===0
                                    ? <div style={{padding:"10px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                                        <span style={{fontSize:12,color:"var(--text3)"}}>No matching parts found in inventory.</span>
                                        {onAddToInventory&&<button className="btn btn-primary btn-sm" style={{flexShrink:0,fontSize:12}}
                                          onClick={()=>onAddToInventory(selectedItem, supplier, {page, search})}>
                                          ➕ Add to Inventory
                                        </button>}
                                      </div>
                                    : invMatches.map(p=>(
                                      <div key={p.id} style={{display:"flex",alignItems:"center",padding:"8px 10px",borderBottom:"1px solid var(--border)",gap:8}}>
                                        {/* part photo */}
                                        <div style={{flexShrink:0,width:48,height:48,borderRadius:6,overflow:"hidden",background:"var(--surface)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                          {p.image_url
                                            ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>{e.target.style.display="none";e.target.parentNode.innerHTML='<span style="font-size:20px;opacity:.3">🖼</span>';}}/>
                                            : <span style={{fontSize:20,opacity:.3}}>🖼</span>}
                                        </div>
                                        <div style={{minWidth:0,flex:1}}>
                                          <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:12}}>{p.sku}</div>
                                          <div style={{fontSize:12,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                                          {p.oe_number&&<div style={{fontSize:11,color:"var(--text3)"}}>OE: {p.oe_number}</div>}
                                        </div>
                                        {onGoToPart&&<button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:11}} onClick={async()=>{
                                          try {
                                            const full = await api.get("parts", `id=eq.${p.id}&select=*&limit=1`);
                                            onGoToPart(Array.isArray(full)?full[0]:full, {page, search});
                                          } catch(e){ onGoToPart(p, {page, search}); }
                                        }}>→ View Part</button>}
                                      </div>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(()=>{
                          const dups = getOemDuplicates(selectedItem);
                          if(!dups.length) return null;
                          return (
                            <div style={{marginTop:10}}>
                              {/* ── Duplicate list ── */}
                              <div style={{padding:"8px 10px",background:"rgba(245,158,11,.08)",borderRadius:6,border:"1px solid rgba(245,158,11,.25)"}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#b45309",marginBottom:8}}>⚠ OEM also found in this catalogue</div>
                                {dups.map(d=>(
                                  <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:6}}>
                                    <div style={{minWidth:0}}>
                                      <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,fontSize:12}}>{d.supplier_part_no}</span>
                                      <span style={{color:"var(--text3)",marginLeft:6,fontSize:11}}>{d.description}</span>
                                      <span style={{display:"block",color:"#b45309",fontSize:10}}>shared OEM: {d.matchedOem}</span>
                                    </div>
                                    <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:11,borderColor:"#f59e0b",color:"#b45309"}}
                                      onClick={()=>setCompareItem(compareItem?.id===d.id?null:d)}>
                                      {compareItem?.id===d.id?"✕ Close":"⚖ Compare"}
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* ── Side-by-side compare ── */}
                              {compareItem&&(()=>{
                                const aOems = new Set(parseOems(selectedItem.oem_number).map(x=>x.toUpperCase()));
                                const bOems = new Set(parseOems(compareItem.oem_number).map(x=>x.toUpperCase()));
                                const sharedOems = new Set([...aOems].filter(x=>bOems.has(x)));

                                const isSame = (a,b) => (a||"").trim().toLowerCase()===(b||"").trim().toLowerCase() && (a||"").trim()!=="";

                                const MATCH_BG   = "rgba(52,211,153,.15)";
                                const MATCH_BDR  = "1px solid rgba(52,211,153,.4)";

                                const renderOems = (str) => parseOems(str).map((tok,i)=>{
                                  const shared = sharedOems.has(tok.toUpperCase());
                                  return <span key={i} style={{display:"inline-block",marginRight:4,marginBottom:2,padding:"1px 5px",borderRadius:3,fontSize:11,fontFamily:"DM Mono,monospace",background:shared?"rgba(52,211,153,.2)":"transparent",color:shared?"#047857":"var(--text)",fontWeight:shared?700:400,border:shared?"1px solid rgba(52,211,153,.4)":"none"}}>{tok}</span>;
                                });

                                return (
                                  <div style={{marginTop:8,border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:"var(--surface)"}}>
                                      {/* header */}
                                      <div style={{padding:"6px 10px",borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",background:"rgba(99,102,241,.07)"}}>
                                        <div style={{fontSize:10,color:"var(--text3)",marginBottom:1}}>CURRENT</div>
                                        <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{selectedItem.supplier_part_no}</div>
                                      </div>
                                      <div style={{padding:"6px 10px",borderBottom:"1px solid var(--border)",background:"rgba(245,158,11,.07)"}}>
                                        <div style={{fontSize:10,color:"var(--text3)",marginBottom:1}}>DUPLICATE</div>
                                        <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{compareItem.supplier_part_no}</div>
                                      </div>
                                      {/* images */}
                                      {[selectedItem, compareItem].map((it,i)=>(
                                        <div key={i} style={{padding:8,textAlign:"center",borderRight:i===0?"1px solid var(--border)":"none",borderBottom:"1px solid var(--border)"}}>
                                          {it.image_url
                                            ? <img src={toImgUrl(it.image_url)} alt="" style={{maxWidth:"100%",maxHeight:80,objectFit:"contain",borderRadius:4}} onError={e=>{e.target.style.display="none";}}/>
                                            : <div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,opacity:.25}}>🖼</div>}
                                        </div>
                                      ))}
                                      {/* Description */}
                                      {[selectedItem, compareItem].map((it,i)=>{
                                        const same = isSame(selectedItem.description, compareItem.description);
                                        return (
                                          <div key={`desc-${i}`} style={{padding:"6px 10px",borderRight:i===0?"1px solid var(--border)":"none",borderBottom:"1px solid var(--border)",fontSize:11,background:same?MATCH_BG:"",border:same?MATCH_BDR:""}}>
                                            {i===0&&<div style={{fontSize:10,color:"var(--text3)",marginBottom:2,textTransform:"uppercase",letterSpacing:.4}}>Description {same&&<span style={{color:"#047857"}}>✓ same</span>}</div>}
                                            <div style={{color:"var(--text)"}}>{it.description||"—"}</div>
                                          </div>
                                        );
                                      })}
                                      {/* OEM */}
                                      {[selectedItem, compareItem].map((it,i)=>(
                                        <div key={`oem-${i}`} style={{padding:"6px 10px",borderRight:i===0?"1px solid var(--border)":"none",borderBottom:"1px solid var(--border)",fontSize:11}}>
                                          {i===0&&<div style={{fontSize:10,color:"var(--text3)",marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>OEM Numbers <span style={{color:"#047857"}}>● green = shared</span></div>}
                                          <div style={{display:"flex",flexWrap:"wrap",gap:2}}>{renderOems(it.oem_number)}</div>
                                        </div>
                                      ))}
                                      {/* Application */}
                                      {[selectedItem, compareItem].map((it,i)=>{
                                        const same = isSame(selectedItem.application, compareItem.application);
                                        return (
                                          <div key={`app-${i}`} style={{padding:"6px 10px",borderRight:i===0?"1px solid var(--border)":"none",fontSize:11,background:same?MATCH_BG:""}}>
                                            {i===0&&<div style={{fontSize:10,color:"var(--text3)",marginBottom:2,textTransform:"uppercase",letterSpacing:.4}}>Application {same&&<span style={{color:"#047857"}}>✓ same</span>}</div>}
                                            <div style={{color:"var(--text)",whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{it.application||"—"}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>

                      {/* ── Sticky footer: Save + Close ── */}
                      <div style={{display:"flex",gap:8,padding:"10px 16px",borderTop:"1px solid var(--border)",flexShrink:0}}>
                        <button className="btn btn-primary" style={{flex:1}} onClick={saveDrawer} disabled={saving}>{saving?"Saving…":"Save"}</button>
                        <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setSelectedItem(null)}>Close</button>
                      </div>

                    </div>
                  </div>
                )}

                {/* Footer: pagination + result count + delete */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:"var(--text3)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span>{search.trim()?`${filtered.length} of ${items.length} items`:`${items.length} items`}</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}>
                      <button onClick={()=>{setMatchFilter(f=>f==="matched"?null:"matched");setPage(1);}} style={{background:matchFilter==="matched"?"rgba(52,211,153,.3)":"rgba(52,211,153,.15)",color:"#047857",border:"1px solid rgba(52,211,153,.4)",borderRadius:4,padding:"1px 7px",fontWeight:600,fontSize:11,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>✓ {matchStats.matched} matched</button>
                      <button onClick={()=>{setMatchFilter(f=>f==="unmatched"?null:"unmatched");setPage(1);}} style={{background:matchFilter==="unmatched"?"rgba(0,0,0,.1)":"rgba(0,0,0,.04)",color:"var(--text3)",border:matchFilter==="unmatched"?"1px solid var(--text3)":"1px solid var(--border)",borderRadius:4,padding:"1px 7px",fontSize:11,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>{matchStats.unmatched} unmatched</button>
                    </span>
                  </span>
                  {totalPages > 1 && (
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage<=1}>‹ Prev</button>
                      <span style={{fontSize:12,color:"var(--text2)"}}>Page {safePage} / {totalPages}</span>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage>=totalPages}>Next ›</button>
                    </div>
                  )}
                  <button onClick={clearAll} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--red)",opacity:.7,textDecoration:"underline",padding:0}} title="Permanently delete all catalogue items for this supplier">
                    🗑 Delete all {items.length} items
                  </button>
                </div>
              </>
            )
      )}

      {lightboxUrl&&<ImgLightbox url={lightboxUrl} onClose={()=>setLightboxUrl(null)}/>}

      {/* ── IMPORT ── */}
      {activeTab==="import"&&(
        <>
          {/* Step 1: Upload */}
          {importStep===1&&(
            <div>
              <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>
                Upload a CSV or Excel file. Needs at least a supplier part number column.
              </p>
              {fileErr&&<div style={{background:"rgba(239,68,68,.1)",border:"1px solid var(--red)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--red)",marginBottom:12}}>{fileErr}</div>}
              <label style={{display:"block",border:"2px dashed var(--border)",borderRadius:10,padding:"44px 20px",textAlign:"center",cursor:fileLoading?"wait":"pointer",color:"var(--text3)",fontSize:13}}>
                <input type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} disabled={fileLoading}/>
                {fileLoading?"⟳ Parsing file…":"📄 Click to upload CSV or Excel"}
                <span style={{fontSize:11,display:"block",marginTop:4}}>Supported: .csv · .xlsx · .xls</span>
              </label>
            </div>
          )}

          {/* Step 2: Map columns + preview + import */}
          {importStep===2&&(
            <div>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Map Columns</div>
              <p style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>Auto-detected from headers — adjust if needed.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
                {[
                  {field:"supplier_part_no",label:"Supplier Part No *"},
                  {field:"description",     label:"Description"},
                  {field:"oem",             label:"OEM Number"},
                  {field:"application",     label:"Application"},
                ].map(({field,label})=>{
                  const curIdx = Object.entries(colMap).find(([,f])=>f===field)?.[0] ?? "";
                  return (
                    <div key={field}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:4}}>{label}</div>
                      <select className="form-control" value={curIdx}
                        onChange={e=>{
                          const newIdx = e.target.value;
                          setColMap(prev=>{
                            const next = {...prev};
                            Object.keys(next).forEach(k=>{ if(next[k]===field) delete next[k]; });
                            if(newIdx!=="") next[newIdx]=field;
                            return next;
                          });
                        }}
                        style={{fontSize:12}}>
                        <option value="">— skip —</option>
                        {headers.map((h,i)=><option key={i} value={String(i)}>{String(h)||`Column ${i+1}`}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:"var(--text2)"}}>Preview (first 5 rows)</div>
              <div style={{overflowX:"auto",marginBottom:16}}>
                <table className="tbl" style={{fontSize:11}}>
                  <thead><tr><th>Supplier Part No</th><th>Description</th><th>OEM Number</th><th>Application</th></tr></thead>
                  <tbody>
                    {buildPreview().map((r,i)=>(
                      <tr key={i}>
                        <td style={{fontFamily:"DM Mono,monospace",whiteSpace:"nowrap"}}>{r.supplier_part_no||<span style={{color:"var(--text3)"}}>—</span>}</td>
                        <td>{r.description||<span style={{color:"var(--text3)"}}>—</span>}</td>
                        <td style={{fontFamily:"DM Mono,monospace",whiteSpace:"nowrap"}}>{r.oem_number||<span style={{color:"var(--text3)"}}>—</span>}</td>
                        <td style={{maxWidth:200,whiteSpace:"pre-wrap"}}>{r.application||<span style={{color:"var(--text3)"}}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setImportStep(1);setRawRows([]);}} disabled={importing}>← Back</button>
                <button className="btn btn-primary" style={{flex:2}}
                  disabled={importing||!Object.values(colMap).includes("supplier_part_no")}
                  onClick={doImport}>
                  {importing?"Importing…":`Import ${dataRows.length} rows`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {importStep===3&&importResult&&(
            <div style={{textAlign:"center",padding:28}}>
              <div style={{fontSize:40,marginBottom:10}}>✅</div>
              <div style={{fontWeight:700,fontSize:17,marginBottom:6}}>Import Complete</div>
              <div style={{fontSize:13,color:"var(--text3)",marginBottom:20}}>
                {importResult.inserted} items imported
                {importResult.errors>0&&<span style={{color:"var(--red)"}}>, {importResult.errors} errors</span>}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                <button className="btn btn-ghost" onClick={resetImport}>Import More</button>
                <button className="btn btn-primary" onClick={()=>setActiveTab("browse")}>View Catalogue</button>
              </div>
            </div>
          )}
        </>
      )}
    </Overlay>
  );
}

// ─── Branches Management Page ────────────────────────────────────────────────
export function BranchesPage({branches:propBranches=[], onRefresh, _t={}}) {
  const regLink = `${window.location.origin}${window.location.pathname}?branch_reg=1`;
  const [copied,       setCopied]       = useState(false);
  const [busy,         setBusy]         = useState(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [addF,         setAddF]         = useState({name:"",city:"",address:"",phone:"",contact_name:"",email:""});
  const [addErr,       setAddErr]       = useState("");
  const [branches,     setBranches]     = useState(propBranches);
  const [refreshing,   setRefreshing]   = useState(false);
  const [approving,       setApproving]       = useState(null);
  const [creatingUserFor, setCreatingUserFor] = useState(null); // active branch getting a new user
  const [userF,           setUserF]           = useState({username:"",password:"",role:"branch_admin",name:""});
  const [userErr,         setUserErr]         = useState("");
  const [doneApproved,    setDoneApproved]    = useState(null);
  const [editingSettings, setEditingSettings] = useState(null); // branch getting country/currency/tax edited
  const [settingsF,       setSettingsF]       = useState({country:"",currency:"ZAR R",tax_rate:0,vat_number:""});

  const refresh = async (notifyParent=true) => {
    setRefreshing(true);
    const rows = await api.get("branches","select=*&order=is_main.desc,name.asc").catch(()=>[]);
    if(Array.isArray(rows)) setBranches(rows);
    setRefreshing(false);
    if(notifyParent) onRefresh();
  };

  useEffect(()=>{ refresh(false); },[]);

  const copyLink = () => { navigator.clipboard.writeText(regLink); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const startApprove = (b) => {
    setApproving(b);
    setUserF({username:b.contact_name?b.contact_name.toLowerCase().replace(/\s+/g,""):"",password:"",role:"branch_admin",name:b.contact_name||""});
    setUserErr(""); setDoneApproved(null);
  };

  const confirmApproveWithUser = async () => {
    if(!userF.username.trim()) return setUserErr("Username is required");
    if(!userF.password.trim()) return setUserErr("Password is required");
    setBusy(approving.id);
    await api.patch("branches","id",approving.id,{status:"active"});
    await api.upsert("users",{username:userF.username.trim(),password:userF.password.trim(),role:userF.role,name:userF.name.trim()||approving.name,phone:approving.phone||"",email:approving.email||"",branch_id:approving.id});
    setDoneApproved({branch:approving,username:userF.username.trim(),password:userF.password.trim()});
    setApproving(null);
    await refresh();
    setBusy(null);
  };

  const confirmApproveSkipUser = async () => {
    setBusy(approving.id);
    await api.patch("branches","id",approving.id,{status:"active"});
    setApproving(null);
    await refresh();
    setBusy(null);
  };

  const suspend = async (b) => {
    if(!window.confirm(`Suspend "${b.name}"? Their login will be blocked until reactivated.`)) return;
    setBusy(b.id);
    await api.patch("branches","id",b.id,{status:"suspended",activation_code:null,activation_code_expires_at:null});
    await refresh();
    setBusy(null);
  };

  const generateCode = async (b) => {
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    const expires = new Date(Date.now()+7*24*60*60*1000).toISOString();
    setBusy(b.id);
    await api.patch("branches","id",b.id,{activation_code:code,activation_code_expires_at:expires});
    await refresh();
    setBusy(null);
  };

  const startCreateUser = (b) => {
    setCreatingUserFor(b);
    setUserF({username:b.contact_name?b.contact_name.toLowerCase().replace(/\s+/g,""):"",password:"",role:"branch_admin",name:b.contact_name||""});
    setUserErr("");
  };

  const confirmCreateUser = async () => {
    if(!userF.username.trim()) return setUserErr("Username is required");
    if(!userF.password.trim()) return setUserErr("Password is required");
    setBusy(creatingUserFor.id);
    await api.upsert("users",{username:userF.username.trim(),password:userF.password.trim(),role:userF.role,name:userF.name.trim()||creatingUserFor.name,phone:creatingUserFor.phone||"",email:creatingUserFor.email||"",branch_id:creatingUserFor.id});
    setDoneApproved({branch:creatingUserFor,username:userF.username.trim(),password:userF.password.trim()});
    setCreatingUserFor(null);
    setBusy(null);
  };

  const reject = async (b) => {
    if(!window.confirm(`Reject "${b.name}"? This will delete the registration.`)) return;
    setBusy(b.id);
    await api.delete("branches","id",b.id);
    await refresh();
    setBusy(null);
  };

  const startEditSettings = (b) => {
    setEditingSettings(b);
    setSettingsF({country:b.country||"",currency:b.currency||"ZAR R",tax_rate:b.tax_rate??0,vat_number:b.vat_number||""});
  };

  const saveSettings = async () => {
    setBusy(editingSettings.id);
    await api.patch("branches","id",editingSettings.id,settingsF);
    setEditingSettings(null);
    await refresh();
    setBusy(null);
  };

  const toggleSupplierSku = async (b) => {
    const next = !b.show_supplier_sku;
    setBranches(prev=>prev.map(x=>x.id===b.id?{...x,show_supplier_sku:next}:x));
    await api.patch("branches","id",b.id,{show_supplier_sku:next});
  };

  const saveNew = async () => {
    if(!addF.name.trim()) return setAddErr("Shop name is required");
    setAddErr(""); setBusy("new");
    await api.insert("branches",{...addF,status:"active",is_main:false});
    setAddF({name:"",city:"",address:"",phone:"",contact_name:"",email:""});
    setShowAdd(false);
    await refresh();
    setBusy(null);
  };

  const pending    = branches.filter(b=>b.status==="pending");
  const active     = branches.filter(b=>b.status==="active"||b.is_main);
  const suspended  = branches.filter(b=>b.status==="suspended");

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800}}>🏢 Branches</div>
          <div style={{fontSize:13,color:"var(--text3)",marginTop:2}}>{active.length} active · {pending.length} pending</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>{refreshing?"…":"↻ Refresh"}</button>
          <button className="btn btn-primary" onClick={()=>setShowAdd(v=>!v)}>+ Add Branch</button>
        </div>
      </div>

      {/* Registration Link */}
      <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📎 Registration Link</div>
        <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Share this link with new branches so they can self-register. You will see them below as pending.</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input className="inp" readOnly value={regLink} style={{flex:1,fontSize:12}}/>
          <button className="btn btn-primary btn-sm" onClick={copyLink} style={{whiteSpace:"nowrap"}}>{copied?"✓ Copied!":"📋 Copy"}</button>
        </div>
      </div>

      {/* Success banner */}
      {doneApproved&&(
        <div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:12,padding:"14px 16px",marginBottom:20}}>
          <div style={{fontWeight:700,color:"var(--green)",marginBottom:6}}>✅ {doneApproved.branch.name} approved!</div>
          <div style={{fontSize:13,color:"var(--text2)",marginBottom:8}}>Send these credentials to the branch manager:</div>
          <div style={{fontFamily:"monospace",fontSize:13,background:"var(--surface)",borderRadius:8,padding:"10px 14px",display:"inline-block",lineHeight:1.8}}>
            Username: <strong>{doneApproved.username}</strong><br/>
            Password: <strong>{doneApproved.password}</strong>
          </div>
          <div style={{marginTop:10,display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard.writeText(`Username: ${doneApproved.username}\nPassword: ${doneApproved.password}`)}>📋 Copy credentials</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setDoneApproved(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Add Branch Form */}
      {showAdd&&(
        <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>+ New Branch</div>
          <FG>
            <div><FL label="Shop Name *"/><input className="inp" value={addF.name} onChange={e=>setAddF(p=>({...p,name:e.target.value}))} placeholder="Cape Town Branch"/></div>
            <div><FL label="City"/><input className="inp" value={addF.city} onChange={e=>setAddF(p=>({...p,city:e.target.value}))} placeholder="Cape Town"/></div>
          </FG>
          <FG>
            <div><FL label="Phone"/><input className="inp" value={addF.phone} onChange={e=>setAddF(p=>({...p,phone:e.target.value}))} placeholder="+27 21 000 0000"/></div>
            <div><FL label="Contact Person"/><input className="inp" value={addF.contact_name} onChange={e=>setAddF(p=>({...p,contact_name:e.target.value}))} placeholder="Name"/></div>
          </FG>
          <FG>
            <div><FL label="Address"/><input className="inp" value={addF.address} onChange={e=>setAddF(p=>({...p,address:e.target.value}))} placeholder="123 Main Rd"/></div>
            <div><FL label="Email"/><input className="inp" value={addF.email} onChange={e=>setAddF(p=>({...p,email:e.target.value}))} placeholder="shop@example.com"/></div>
          </FG>
          {addErr&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{addErr}</div>}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button className="btn btn-primary" onClick={saveNew} disabled={busy==="new"}>{busy==="new"?"Saving…":"Save"}</button>
            <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {pending.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--yellow)",marginBottom:10}}>⏳ Pending Approval ({pending.length})</div>
          {pending.map(b=>(
            <div key={b.id} style={{marginBottom:10}}>
              <div style={{background:"rgba(251,191,36,.07)",border:`1px solid ${approving?.id===b.id?"var(--accent)":"rgba(251,191,36,.3)"}`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontWeight:700,fontSize:14}}>{b.name}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{[b.city,b.address].filter(Boolean).join(" · ")}</div>
                    {b.phone&&<div style={{fontSize:12,color:"var(--text3)"}}>{b.phone}{b.contact_name?` — ${b.contact_name}`:""}</div>}
                    {b.email&&<div style={{fontSize:12,color:"var(--text3)"}}>{b.email}</div>}
                  </div>
                  {approving?.id!==b.id&&(
                    <div style={{display:"flex",gap:8}}>
                      <button className="btn btn-primary btn-sm" onClick={()=>startApprove(b)} disabled={!!busy}>✓ Approve</button>
                      <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>reject(b)} disabled={!!busy}>✕ Reject</button>
                    </div>
                  )}
                </div>
                {approving?.id===b.id&&(
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)"}}>🔑 Create login for this branch</div>
                    <FG>
                      <div><FL label="Username *"/><input className="inp" value={userF.username} onChange={e=>setUserF(p=>({...p,username:e.target.value}))} placeholder="capetown"/></div>
                      <div><FL label="Password *"/><input className="inp" type="password" value={userF.password} onChange={e=>setUserF(p=>({...p,password:e.target.value}))} placeholder="••••••"/></div>
                    </FG>
                    <FG>
                      <div>
                        <FL label="Role"/>
                        <select className="inp" value={userF.role} onChange={e=>setUserF(p=>({...p,role:e.target.value}))}>
                          <option value="branch_admin">🏢 Branch Admin</option>
                          <option value="manager">👔 Manager</option>
                          <option value="shipper">🚚 Shipper</option>
                          <option value="stockman">📦 Stockman</option>
                        </select>
                      </div>
                      <div><FL label="Display Name"/><input className="inp" value={userF.name} onChange={e=>setUserF(p=>({...p,name:e.target.value}))} placeholder={b.contact_name||b.name}/></div>
                    </FG>
                    {userErr&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{userErr}</div>}
                    <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                      <button className="btn btn-primary" style={{flex:2}} onClick={confirmApproveWithUser} disabled={busy===b.id}>{busy===b.id?"Saving…":"✓ Approve & Create User"}</button>
                      <button className="btn btn-ghost" onClick={confirmApproveSkipUser} disabled={busy===b.id}>Approve without user</button>
                      <button className="btn btn-ghost" onClick={()=>setApproving(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Branches */}
      <div style={{marginBottom:suspended.length>0?24:0}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>✅ Active Branches ({active.length})</div>
        {active.map(b=>(
          <div key={b.id} style={{background:"var(--surface)",border:`1px solid ${creatingUserFor?.id===b.id?"var(--accent)":"var(--border)"}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"var(--surface2)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                {b.is_main?"🏠":"🏢"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14}}>{b.name}{b.is_main&&<span style={{fontSize:11,background:"var(--accent)",color:"#fff",borderRadius:99,padding:"1px 8px",marginLeft:6}}>Main</span>}</div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{[b.city,b.address].filter(Boolean).join(" · ")}{b.phone?` · ${b.phone}`:""}</div>
              </div>
              {b.code&&<span style={{fontSize:11,color:"var(--text3)",background:"var(--surface2)",padding:"2px 8px",borderRadius:6}}>{b.code}</span>}
              {editingSettings?.id!==b.id&&creatingUserFor?.id!==b.id&&(
                <div style={{display:"flex",gap:6}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>startEditSettings(b)} disabled={!!busy}>⚙️ Settings</button>
                  {!b.is_main&&<button className="btn btn-ghost btn-sm" onClick={()=>startCreateUser(b)} disabled={!!busy}>🔑 Create User</button>}
                  {!b.is_main&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>suspend(b)} disabled={!!busy}>⏸ Suspend</button>}
                </div>
              )}
            </div>
            {editingSettings?.id===b.id&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)"}}>⚙️ Settings for {b.name}</div>
                <FG>
                  <div><FL label="Country"/><input className="inp" value={settingsF.country} onChange={e=>setSettingsF(p=>({...p,country:e.target.value}))} placeholder="e.g. South Africa"/></div>
                  <div><FL label="Currency"/><select className="inp" value={settingsF.currency||"ZAR R"} onChange={e=>setSettingsF(p=>({...p,currency:e.target.value}))}>
                    {["ZAR R","USD $","EUR €","GBP £","TWD NT$","CNY ¥","JPY ¥","AUD A$","CAD C$","SGD S$","MYR RM","THB ฿","INR ₹","AED د.إ","NGN ₦","KES KSh","GHS GH₵"].map(c=>(
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select></div>
                </FG>
                <FG>
                  <div><FL label="Tax Rate (%)"/><input className="inp" type="number" value={settingsF.tax_rate} onChange={e=>setSettingsF(p=>({...p,tax_rate:+e.target.value||0}))} placeholder="15"/></div>
                  <div><FL label="VAT / Tax Number"/><input className="inp" value={settingsF.vat_number} onChange={e=>setSettingsF(p=>({...p,vat_number:e.target.value}))}/></div>
                </FG>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <button className="btn btn-primary" onClick={saveSettings} disabled={busy===b.id}>{busy===b.id?"Saving…":"✓ Save"}</button>
                  <button className="btn btn-ghost" onClick={()=>setEditingSettings(null)}>Cancel</button>
                </div>
              </div>
            )}
            {!b.is_main&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                  <input type="checkbox" checked={!!b.show_supplier_sku} onChange={()=>toggleSupplierSku(b)}
                    style={{width:16,height:16,cursor:"pointer",accentColor:"var(--accent)",flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>Allow branch to view supplier code / SKU</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>Branch users can see SKU &amp; OE number in the spare shop (read-only). If incorrect, they should report to main branch.</div>
                  </div>
                </label>
              </div>
            )}
            {creatingUserFor?.id===b.id&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)"}}>🔑 Create login for {b.name}</div>
                <FG>
                  <div><FL label="Username *"/><input className="inp" value={userF.username} onChange={e=>setUserF(p=>({...p,username:e.target.value}))} placeholder="capetown"/></div>
                  <div><FL label="Password *"/><input className="inp" type="password" value={userF.password} onChange={e=>setUserF(p=>({...p,password:e.target.value}))} placeholder="••••••"/></div>
                </FG>
                <FG>
                  <div>
                    <FL label="Role"/>
                    <select className="inp" value={userF.role} onChange={e=>setUserF(p=>({...p,role:e.target.value}))}>
                      <option value="branch_admin">🏢 Branch Admin</option>
                      <option value="manager">👔 Manager</option>
                      <option value="shipper">🚚 Shipper</option>
                      <option value="stockman">📦 Stockman</option>
                    </select>
                  </div>
                  <div><FL label="Display Name"/><input className="inp" value={userF.name} onChange={e=>setUserF(p=>({...p,name:e.target.value}))} placeholder={b.contact_name||b.name}/></div>
                </FG>
                {userErr&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>{userErr}</div>}
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <button className="btn btn-primary" style={{flex:2}} onClick={confirmCreateUser} disabled={busy===b.id}>{busy===b.id?"Saving…":"✓ Create User"}</button>
                  <button className="btn btn-ghost" onClick={()=>setCreatingUserFor(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Suspended Branches */}
      {suspended.length>0&&(
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"var(--red)",marginBottom:10}}>⏸ Suspended ({suspended.length})</div>
          {suspended.map(b=>(
            <div key={b.id} style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.25)",borderRadius:10,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{b.name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{[b.city,b.address].filter(Boolean).join(" · ")}{b.phone?` · ${b.phone}`:""}</div>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button className="btn btn-ghost btn-sm" style={{color:"var(--green)"}} onClick={()=>api.patch("branches","id",b.id,{status:"active"}).then(refresh)} disabled={busy===b.id}>▶ Reinstate</button>
                  <button className="btn btn-primary btn-sm" onClick={()=>generateCode(b)} disabled={busy===b.id}>{busy===b.id?"…":"🔑 Generate Code"}</button>
                </div>
              </div>
              {b.activation_code&&(
                <div style={{marginTop:10,padding:"10px 12px",background:"var(--surface)",borderRadius:8,border:"1px solid var(--border)"}}>
                  <div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>Activation code (expires {new Date(b.activation_code_expires_at).toLocaleDateString()}):</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <code style={{fontSize:22,fontWeight:800,letterSpacing:4,color:"var(--accent)",fontFamily:"monospace"}}>{b.activation_code}</code>
                    <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard.writeText(b.activation_code)}>📋 Copy</button>
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>Send this code to the branch. They enter it at: <code style={{fontSize:11}}>{window.location.origin}{window.location.pathname}?activate_branch=1</code></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Part Request Modal (branch submits a new-part request to head office) ────
export function PartRequestModal({currentBranch, user, onClose, onSave, t={}}) {
  const CATS=getCategories();
  const MAKES=Object.keys(CAR_MAKES);
  const branchCode=(currentBranch?.name||"BR").substring(0,4).toUpperCase().replace(/\s/g,"");
  const tempSku=`TMP-${branchCode}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
  const [f,setF]=useState({name:"",category:CATS[0]||"Engine",oe_number:"",vehicle_make:"",vehicle_model:"",year_from:"",year_to:"",notes:"",image_url:"",suggested_price:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");

  const submit=async()=>{
    if(!f.name.trim())return setErr("Part name / description is required");
    if(!f.oe_number.trim())return setErr("OE number is required — this helps head office identify the part");
    setSaving(true);setErr("");
    try{
      await api.insert("part_requests",{
        branch_id:currentBranch?.id,
        requested_by:user.id,
        name:f.name.trim(),
        description:f.name.trim(),
        category:f.category,
        oe_number:f.oe_number.trim(),
        vehicle_make:f.vehicle_make||null,
        vehicle_model:f.vehicle_model||null,
        year_from:f.year_from?parseInt(f.year_from):null,
        year_to:f.year_to?parseInt(f.year_to):null,
        notes:f.notes||null,
        image_url:f.image_url||null,
        suggested_price:f.suggested_price?parseFloat(f.suggested_price):null,
        temp_sku:tempSku,
        status:"pending",
      });
      onSave();
    }catch(e){
      setErr("Submit failed: "+e.message);
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="📬 Request New Part" onClose={onClose}/>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.25)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text2)",lineHeight:1.5}}>
          Part not in main catalog? Fill in the OE number and photo so head office can create the SKU and link it back to you.
        </div>
        <FG>
          <div><FL label="Part Name / Description *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. Water Pump — Toyota Corolla"/></div>
          <div><FL label="Category"/><select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        </FG>
        <FD><FL label="OE / OEM Reference Number *"/><input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)} placeholder="e.g. 16100-29085" style={{fontFamily:"monospace",letterSpacing:1}}/></FD>
        <div style={{fontWeight:600,fontSize:12,color:"var(--text3)"}}>Vehicle Fitment</div>
        <FG>
          <div>
            <FL label="Make"/>
            <select className="inp" value={f.vehicle_make} onChange={e=>s("vehicle_make",e.target.value)}>
              <option value="">— Select Make —</option>
              {MAKES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><FL label="Model"/><input className="inp" value={f.vehicle_model} onChange={e=>s("vehicle_model",e.target.value)} placeholder="e.g. Corolla"/></div>
        </FG>
        <FG>
          <div><FL label="Year From"/><input className="inp" type="number" value={f.year_from} onChange={e=>s("year_from",e.target.value)} placeholder="2010" min={1990} max={2030}/></div>
          <div><FL label="Year To"/><input className="inp" type="number" value={f.year_to} onChange={e=>s("year_to",e.target.value)} placeholder="2020" min={1990} max={2030}/></div>
        </FG>
        <FD>
          <FL label="Part Photo URL"/>
          <input className="inp" value={f.image_url} onChange={e=>s("image_url",e.target.value)} placeholder="Paste Google Drive or image link"/>
        </FD>
        {f.image_url&&<div style={{textAlign:"center"}}><img src={toImgUrl(f.image_url)} alt="" referrerPolicy="no-referrer" style={{maxHeight:120,maxWidth:"100%",borderRadius:8,border:"1px solid var(--border)"}} onError={e=>e.target.style.display="none"}/></div>}
        <FD><FL label="Your Suggested Selling Price"/><input className="inp" type="number" value={f.suggested_price} onChange={e=>s("suggested_price",e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Notes for Head Office"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} rows={2} placeholder="Where you sourced this, urgency, any other info…"/></FD>
        <div style={{fontSize:11,color:"var(--text3)"}}>Temp reference: <code style={{fontFamily:"monospace"}}>{tempSku}</code></div>
        {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"var(--red)"}}>{err}</div>}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={submit} disabled={saving}>{saving?"Submitting…":"📬 Submit Request"}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Part Requests Page (admin reviews + approves; branch tracks status) ──────
export function PartRequestCard({r,isAdmin,branches=[],parts=[],user,suppliers=[],partSuppliers=[],inquiries=[],onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,t={},onRefresh}) {
  const [isLinking,setIsLinking]=useState(false);
  const [linkSearch,setLinkSearch]=useState("");
  const [isRejecting,setIsRejecting]=useState(false);
  const [rejectReason,setRejectReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [rfqPart,setRfqPart]=useState(null);

  const branchName=id=>branches.find(b=>b.id===id)?.name||"Unknown Branch";
  const linked=r.part_id?parts.find(p=>p.id===r.part_id):null;
  const linkHits=isLinking&&linkSearch.trim()?parts.filter(p=>p.is_main!==false&&((p.sku||"").toLowerCase().includes(linkSearch.toLowerCase())||(p.name||"").toLowerCase().includes(linkSearch.toLowerCase()))).slice(0,6):[];

  const linkPart=async(part)=>{
    setBusy(true);
    await api.patch("part_requests","id",r.id,{
      part_id:part.id,
      status:"approved",
      approved_by:user.id,
      approved_at:new Date().toISOString(),
    });
    setIsLinking(false);setLinkSearch("");
    await onRefresh();
    setBusy(false);
  };

  const reject=async()=>{
    if(!rejectReason.trim())return;
    setBusy(true);
    await api.patch("part_requests","id",r.id,{status:"rejected",rejection_reason:rejectReason});
    setIsRejecting(false);setRejectReason("");
    await onRefresh();
    setBusy(false);
  };

  return (
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        {r.image_url&&<img src={toImgUrl(r.image_url)} alt="" referrerPolicy="no-referrer" style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:"1px solid var(--border)",flexShrink:0}} onError={e=>e.target.style.display="none"}/>}
        <div style={{flex:1,minWidth:200}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontWeight:700,fontSize:13}}>{r.name}</span>
            <span style={{fontSize:11,fontFamily:"monospace",color:"var(--text3)",background:"var(--surface2)",padding:"2px 6px",borderRadius:4}}>{r.temp_sku}</span>
            <span style={{fontSize:11,padding:"2px 7px",borderRadius:12,fontWeight:600,background:r.status==="pending"?"rgba(251,191,36,.15)":r.status==="approved"?"rgba(34,197,94,.12)":"rgba(248,113,113,.12)",color:r.status==="pending"?"var(--yellow)":r.status==="approved"?"var(--green)":"var(--red)"}}>
              {r.status==="pending"?"⏳ Pending":r.status==="approved"?"✅ Approved":"❌ Rejected"}
            </span>
          </div>
          {isAdmin&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>🏢 {branchName(r.branch_id)}</div>}
          <div style={{fontSize:12,display:"flex",gap:12,flexWrap:"wrap"}}>
            {r.oe_number&&<span style={{fontFamily:"monospace",color:"var(--accent)"}}>{r.oe_number}</span>}
            {r.category&&<span style={{color:"var(--text3)"}}>{r.category}</span>}
            {r.vehicle_make&&<span style={{color:"var(--text3)"}}>{r.vehicle_make}{r.vehicle_model?" — "+r.vehicle_model:""}{r.year_from?" ("+r.year_from+(r.year_to?"–"+r.year_to:"+")+")":""}</span>}
          </div>
          {r.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4,fontStyle:"italic"}}>"{r.notes}"</div>}
          {r.suggested_price&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Suggested price: <strong>{C()}{(+r.suggested_price).toFixed(2)}</strong></div>}
          {r.status==="approved"&&linked&&<div style={{marginTop:6,padding:"6px 10px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:7,fontSize:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{flex:1}}>✅ Linked to <strong>{linked.sku}</strong> — {linked.name}</span>
            {onSendInquiry&&<button className="btn btn-ghost btn-xs" title="Request price/stock from suppliers" onClick={()=>setRfqPart(linked)}>📩 Ask Suppliers</button>}
            {isAdmin&&onEditPart&&<button className="btn btn-ghost btn-xs" title="Edit this part" onClick={()=>onEditPart(linked)}>✏️ Edit Part</button>}
          </div>}
          {r.status==="rejected"&&r.rejection_reason&&<div style={{marginTop:6,padding:"6px 10px",background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.25)",borderRadius:7,fontSize:12}}>Reason: {r.rejection_reason}</div>}
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin&&r.status==="pending"&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          {!isLinking&&!isRejecting&&(
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={()=>{setIsLinking(true);setIsRejecting(false);setLinkSearch("");}}>🔗 Link to Part</button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>{setIsRejecting(true);setIsLinking(false);}}>❌ Reject</button>
            </div>
          )}
          {isLinking&&(
            <div>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Search main catalog to link:</div>
              <input className="inp" value={linkSearch} onChange={e=>setLinkSearch(e.target.value)} placeholder="SKU or part name…" autoFocus/>
              {linkHits.map(p=>(
                <div key={p.id} onClick={()=>linkPart(p)} style={{display:"flex",gap:10,padding:"6px 8px",borderRadius:7,cursor:"pointer",border:"1px solid var(--border)",background:"var(--surface2)",marginTop:4}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"} onMouseLeave={e=>e.currentTarget.style.background="var(--surface2)"}>
                  <span style={{fontWeight:700,color:"var(--accent)",minWidth:80,fontSize:12}}>{p.sku}</span>
                  <span style={{flex:1,fontSize:12}}>{p.name}</span>
                  <span style={{fontSize:11,color:"var(--text3)"}}>{C()}{p.price}</span>
                </div>
              ))}
              {linkSearch.trim()&&!linkHits.length&&<div style={{fontSize:12,color:"var(--text3)",padding:"6px 0"}}>No parts found — go to Inventory to create it first, then come back to link.</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setIsLinking(false);setLinkSearch("");}}>Cancel</button>
              </div>
            </div>
          )}
          {isRejecting&&(
            <div>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Rejection reason:</div>
              <input className="inp" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="e.g. Duplicate of SKU-1234 / Not approved" autoFocus/>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-primary btn-sm" style={{background:"var(--red)"}} onClick={reject} disabled={busy||!rejectReason.trim()}>{busy?"…":"Confirm Reject"}</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setIsRejecting(false);setRejectReason("");}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {rfqPart&&<InquiryModal part={rfqPart} suppliers={suppliers} partSuppliers={partSuppliers.filter(ps=>ps.part_id===rfqPart.id)} inquiries={inquiries}
        onSend={async(data)=>{await onSendInquiry(data);}} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onClose={()=>setRfqPart(null)} t={t} isAdmin={isAdmin} onEditPart={onEditPart}/>}
    </div>
  );
}

export function PartRequestsPage({partRequests=[],branches=[],parts=[],user,role,currentBranch,suppliers=[],partSuppliers=[],inquiries=[],onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,onRefresh,t={}}) {
  const isAdmin=role==="admin";
  const myReqs=isAdmin?partRequests:partRequests.filter(r=>r.branch_id===currentBranch?.id);
  const pending=myReqs.filter(r=>r.status==="pending");
  const done=myReqs.filter(r=>r.status==="approved"||r.status==="rejected");

  return (
    <div style={{padding:"0 0 40px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📬 Part Requests</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:2}}>{isAdmin?"Review new-part requests from all branches":"Track your part requests to head office"}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {pending.length===0&&done.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:"var(--text3)"}}>
          <div style={{fontSize:32,marginBottom:8}}>📭</div>
          <div>{isAdmin?"No part requests yet":"You haven't submitted any part requests yet"}</div>
        </div>
      )}

      {pending.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:"var(--yellow)"}}>⏳ Pending ({pending.length})</div>
          {pending.map(r=><PartRequestCard key={r.id} r={r} isAdmin={isAdmin} branches={branches} parts={parts} user={user} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t} onRefresh={onRefresh}/>)}
        </div>
      )}

      {done.length>0&&(
        <div>
          <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:"var(--text3)"}}>History ({done.length})</div>
          {done.map(r=><PartRequestCard key={r.id} r={r} isAdmin={isAdmin} branches={branches} parts={parts} user={user} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t} onRefresh={onRefresh}/>)}
        </div>
      )}
    </div>
  );
}

export function BranchProfilePage({branch,user,onSave,t={}}) {
  const [f,setF]=useState({
    shop_name:  branch?.shop_name||branch?.name||"",
    phone:      branch?.phone||"",
    email:      branch?.email||"",
    address:    branch?.address||"",
    logo_url:   branch?.logo_url||"",
    logo_data:  branch?.logo_data||"",
    currency:   branch?.currency||getSettings().currency||"ZAR R",
    country:    branch?.country||"",
    tax_rate:   branch?.tax_rate??getSettings().tax_rate??0,
    vat_number: branch?.vat_number||"",
    sku_prefix: branch?.sku_prefix||"",
    part_label_w: branch?.part_label_w||98,
    part_label_h: branch?.part_label_h||45,
    shelf_label_w: branch?.shelf_label_w||70,
    shelf_label_h: branch?.shelf_label_h||45,
  });
  const [busy,setBusy]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{
    setBusy(true);
    try{ await onSave(f); } finally{ setBusy(false); }
  };
  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px"}}>
      <h2 style={{fontWeight:700,fontSize:18,marginBottom:20}}>🏢 Branch Profile</h2>
      <div style={{background:"var(--surface)",borderRadius:12,padding:20,marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Shop Info</h3>
        <FG>
          <div><FL label="Shop Name"/><input className="inp" value={f.shop_name} onChange={e=>s("shop_name",e.target.value)}/></div>
          <div><FL label="Currency"/><select className="inp" value={f.currency||"ZAR R"} onChange={e=>s("currency",e.target.value)}>
            {["ZAR R","USD $","EUR €","GBP £","TWD NT$","CNY ¥","JPY ¥","AUD A$","CAD C$","SGD S$","MYR RM","THB ฿","INR ₹","AED د.إ","NGN ₦","KES KSh","GHS GH₵"].map(c=>(
              <option key={c} value={c}>{c}</option>
            ))}
          </select></div>
        </FG>
        <FG>
          <div><FL label="Country"/><input className="inp" value={f.country} onChange={e=>s("country",e.target.value)} placeholder="e.g. South Africa"/></div>
          <div><FL label="Tax Rate (%)"/><input className="inp" type="number" value={f.tax_rate} onChange={e=>s("tax_rate",+e.target.value||0)} placeholder="15"/></div>
        </FG>
        <FG>
          <div><FL label="VAT / Tax Number"/><input className="inp" value={f.vat_number} onChange={e=>s("vat_number",e.target.value)}/></div>
          <div/>
        </FG>
        <FG>
          <div>
            <FL label="SKU Prefix"/>
            <input className="inp" value={f.sku_prefix} onChange={e=>s("sku_prefix",e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="e.g. NB" maxLength={6}/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
              2–6 uppercase letters/numbers. New parts will auto-start with <strong>{f.sku_prefix||"XX"}-</strong>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",paddingBottom:6}}>
            {f.sku_prefix&&<div style={{background:"rgba(99,102,241,.12)",border:"1px solid rgba(99,102,241,.3)",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"DM Mono,monospace"}}>
              {f.sku_prefix}-001, {f.sku_prefix}-002…
            </div>}
          </div>
        </FG>
        <FG>
          <div><FL label="Phone"/><input className="inp" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div>
          <div><FL label="Email"/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div>
        </FG>
        <div><FL label="Address"/><textarea className="inp" rows={2} value={f.address} onChange={e=>s("address",e.target.value)} style={{resize:"vertical"}}/></div>
      </div>
      <div style={{background:"var(--surface)",borderRadius:12,padding:20,marginBottom:16}}>
        <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Logo</h3>
        <LogoUploader f={f} s={s}/>
      </div>
      <div style={{background:"var(--surface)",borderRadius:12,padding:20,marginBottom:20}}>
        <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>🏷️ Label Sizes</h3>
        <div style={{fontSize:12,color:"var(--text3)",marginBottom:16}}>Override the default label sizes for printing from this branch.</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:600,color:"var(--text2)",marginBottom:8}}>Part / inventory label</div>
          <FG>
            <div><FL label="Width (mm)"/><input className="inp" type="number" min="20" max="300" value={f.part_label_w} onChange={e=>s("part_label_w",+e.target.value||98)}/></div>
            <div><FL label="Height (mm)"/><input className="inp" type="number" min="15" max="200" value={f.part_label_h} onChange={e=>s("part_label_h",+e.target.value||45)}/></div>
          </FG>
          <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:10,background:"var(--surface2)",borderRadius:8,padding:"8px 12px",border:"1px solid var(--border)"}}>
            <div style={{width:Math.min(f.part_label_w,160),height:Math.min(f.part_label_h*2,80),border:"1px dashed var(--border2)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface3)",flexShrink:0}}>
              <span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{f.part_label_w}×{f.part_label_h}mm</span>
            </div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Preview · Default 98×45mm</div>
          </div>
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"var(--text2)",marginBottom:8}}>Shelf / bin label</div>
          <FG>
            <div><FL label="Width (mm)"/><input className="inp" type="number" min="20" max="300" value={f.shelf_label_w} onChange={e=>s("shelf_label_w",+e.target.value||70)}/></div>
            <div><FL label="Height (mm)"/><input className="inp" type="number" min="15" max="200" value={f.shelf_label_h} onChange={e=>s("shelf_label_h",+e.target.value||45)}/></div>
          </FG>
          <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:10,background:"var(--surface2)",borderRadius:8,padding:"8px 12px",border:"1px solid var(--border)"}}>
            <div style={{width:Math.min(f.shelf_label_w,160),height:Math.min(f.shelf_label_h*2,80),border:"1px dashed var(--border2)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface3)",flexShrink:0}}>
              <span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{f.shelf_label_w}×{f.shelf_label_h}mm</span>
            </div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Preview · Default 70×45mm</div>
          </div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={busy} style={{width:"100%",marginBottom:24}}>
        {busy?"Saving…":"💾 Save Branch Profile"}
      </button>

      {/* Workshop QR — generate registration QR for this branch */}
      <WorkshopQRSection settings={{shop_name:f.shop_name||branch?.name||"Branch", whatsapp:f.phone||""}} shopId={branch?.id||1}/>
      <div style={{marginTop:24}}>
        <LinkedWorkshopsList shopName={f.shop_name||branch?.name||""}/>
      </div>
    </div>
  );
}

export function BranchStockModal({part,existing,branchId,overrideBranchId,onClose,onSave,suppliers=[],t={}}) {
  const [lightbox,setLightbox]=useState(null);
  const [f,setF]=useState({
    stock:   existing?.stock   ?? 2,
    price:   existing?.price   ?? part?.price   ?? "",
    cost_price: existing?.cost_price ?? part?.cost_price ?? "",
    min_stock:  existing?.min_stock  ?? 2,
    bin_location: existing?.bin_location ?? part?.bin_location ?? "",
    auto_reorder: existing?.auto_reorder ?? false,
    reorder_point: existing?.reorder_point ?? 0,
    reorder_qty:   existing?.reorder_qty   ?? 1,
    preferred_supplier_id: existing?.preferred_supplier_id ?? "",
  });
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const effectiveBranchId=overrideBranchId||branchId;
  const save=async()=>{
    if(!part||!effectiveBranchId) return;
    setBusy(true);
    setErr(null);
    try{
      const payload={
        branch_id:effectiveBranchId,
        part_id:part.id,
        stock:parseInt(f.stock)||0,
        price:parseFloat(f.price)||null,
        cost_price:parseFloat(f.cost_price)||null,
        min_stock:parseInt(f.min_stock)||0,
        bin_location:f.bin_location||null,
        auto_reorder:!!f.auto_reorder,
        reorder_point:parseInt(f.reorder_point)||0,
        reorder_qty:parseInt(f.reorder_qty)||1,
        preferred_supplier_id:f.preferred_supplier_id?+f.preferred_supplier_id:null,
        updated_at:new Date().toISOString(),
      };
      // Fresh lookup to avoid stale state — bypasses cache
      api.cacheInvalidate("branch_stock");
      const freshRows=await api.get("branch_stock",`branch_id=eq.${effectiveBranchId}&part_id=eq.${part.id}&select=id`);
      const freshId=Array.isArray(freshRows)&&freshRows[0]?freshRows[0].id:(existing?.id||null);
      let res;
      if(freshId){
        res=await api.patch("branch_stock","id",freshId,payload);
      } else {
        res=await api.insert("branch_stock",payload);
      }
      if(res?.code||res?.message){setErr(res.message||res.details||"Save failed");return;}
      await onSave();
    } catch(e){
      setErr(e?.message||"Unexpected error");
    } finally { setBusy(false); }
  };
  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <MHead title={existing?"✏️ Edit Branch Stock":"📦 Set Branch Stock"} onClose={onClose}/>
        <div style={{display:"flex",gap:12,alignItems:"center",padding:"12px 0 4px",marginBottom:10}}>
          {(()=>{const img=part?.image_url?toImgUrl(part.image_url):null;return img?(
            <img src={img} alt={part?.name}
              style={{width:110,height:110,objectFit:"contain",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",flexShrink:0,cursor:"zoom-in"}}
              referrerPolicy="no-referrer"
              onClick={()=>setLightbox(toFullUrl(part.image_url))}
              onError={e=>e.target.style.display="none"}/>
          ):(
            <div style={{width:110,height:110,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,flexShrink:0}}>🔩</div>
          );})()}
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{part?.name}</div>
            <div style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)",marginTop:2}}>{part?.sku}</div>
            {(part?.make||part?.model)&&<div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>{[part.make,part.model].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
        <FG>
          <div><FL label="Stock Qty"/><input className="inp" type="number" min={0} value={f.stock} onChange={e=>set("stock",e.target.value)} autoFocus/></div>
          <div><FL label="Min Stock"/><input className="inp" type="number" min={0} value={f.min_stock} onChange={e=>set("min_stock",e.target.value)}/></div>
        </FG>
        {(()=>{
          const pr=parseFloat(f.price);const co=parseFloat(f.cost_price);
          const margin=(pr>0&&co>0)?((pr-co)/pr*100):null;
          const markup=(pr>0&&co>0)?((pr-co)/co*100):null;
          return(
            <FG>
              <div><FL label="Selling Price"/><input className="inp" type="number" step="0.01" min={0} value={f.price} placeholder="Catalog default" onChange={e=>set("price",e.target.value)}/></div>
              <div>
                <FL label="Cost Price"/>
                <input className="inp" type="number" step="0.01" min={0} value={f.cost_price} placeholder="Catalog default" onChange={e=>set("cost_price",e.target.value)}/>
                {margin!==null&&<div style={{fontSize:11,marginTop:4,color:margin>=0?"var(--green)":"var(--red)"}}>
                  Margin {margin.toFixed(1)}% · Markup {markup.toFixed(1)}%
                </div>}
              </div>
            </FG>
          );
        })()}
        <div><FL label="Bin Location"/><input className="inp" value={f.bin_location} placeholder="e.g. A1-03" onChange={e=>set("bin_location",e.target.value)}/></div>

        {/* ── Auto-Reorder ── */}
        <div style={{borderTop:"1px solid var(--border)",marginTop:16,paddingTop:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:f.auto_reorder?"rgba(52,211,153,.08)":"var(--surface2)",borderRadius:10,border:`1.5px solid ${f.auto_reorder?"rgba(52,211,153,.4)":"var(--border)"}`,cursor:"pointer",marginBottom:f.auto_reorder?12:0}} onClick={()=>set("auto_reorder",!f.auto_reorder)}>
            <div>
              <div style={{fontWeight:700,fontSize:13}}>🔄 Auto-Reorder</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>Send RFQ automatically when branch stock is low</div>
            </div>
            <div style={{width:40,height:22,borderRadius:99,background:f.auto_reorder?"var(--green)":"var(--border)",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:f.auto_reorder?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
            </div>
          </div>
          {f.auto_reorder&&(
            <>
              <FG>
                <div>
                  <FL label="Reorder when branch stock ≤"/>
                  <input className="inp" type="number" min="0" value={f.reorder_point} onChange={e=>set("reorder_point",+e.target.value||0)}/>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Current: <strong>{existing?.stock??0}</strong></div>
                </div>
                <div>
                  <FL label="Request qty"/>
                  <input className="inp" type="number" min="1" value={f.reorder_qty} onChange={e=>set("reorder_qty",+e.target.value||1)}/>
                </div>
              </FG>
              <div>
                <FL label="Preferred supplier"/>
                {suppliers.length===0
                  ? <div style={{fontSize:12,color:"var(--text3)",padding:"8px 0"}}>No suppliers available</div>
                  : <select className="inp" value={f.preferred_supplier_id||""} onChange={e=>set("preferred_supplier_id",e.target.value)}>
                      <option value="">— Select supplier —</option>
                      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                }
              </div>
            </>
          )}
        </div>

        {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--red)",marginTop:12}}>{err}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Saving…":"Save Stock"}</button>
        </div>
      </div>
    </div>
    {lightbox&&<ImgLightbox url={lightbox} onClose={()=>setLightbox(null)}/>}
    </>
  );
}

const BRANCH_USER_ROLES = [
  {value:"branch_admin",     label:"Branch Admin",     icon:"🏢"},
  {value:"branch_manager",   label:"Branch Manager",   icon:"👔"},
  {value:"branch_warehouse", label:"Warehouse",        icon:"📦"},
  {value:"branch_picker",    label:"Picker",           icon:"🔍"},
  {value:"branch_salesman",  label:"Salesman",         icon:"🛒"},
];

export function BranchUsersPage({branchId, branchName, user}) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [showing, setShowing] = useState(false); // add/edit form visible
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({username:"",password:"",name:"",role:"branch_manager"});
  const [err,     setErr]     = useState("");
  const [busy,    setBusy]    = useState(false);

  const sf = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    if(!branchId) return;
    setLoading(true);
    const rows = await api.get("users",`branch_id=eq.${branchId}&select=*&order=role.asc,name.asc`).catch(()=>[]);
    if(Array.isArray(rows)) setUsers(rows);
    setLoading(false);
  };

  useEffect(()=>{ load(); },[branchId]);

  const openAdd = () => {
    setEditing(null);
    setForm({username:"",password:"",name:"",role:"branch_manager"});
    setErr(""); setShowing(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({username:u.username||"",password:"",name:u.name||"",role:u.role||"branch_manager"});
    setErr(""); setShowing(true);
  };

  const save = async () => {
    if(!form.username.trim()) return setErr("Username is required");
    if(!editing && !form.password.trim()) return setErr("Password is required for new users");
    setBusy(true); setErr("");
    if(editing){
      const upd = {username:form.username.trim(), name:form.name.trim(), role:form.role, branch_id:branchId};
      if(form.password.trim()) upd.password = form.password.trim();
      await api.patch("users","id",editing.id,upd).catch(e=>setErr(e.message));
    } else {
      const ex = await api.get("users",`username=eq.${encodeURIComponent(form.username.trim())}&select=id`).catch(()=>[]);
      if(Array.isArray(ex)&&ex.length>0){setBusy(false);return setErr("Username already taken — choose another");}
      await api.insert("users",{username:form.username.trim(),password:form.password.trim(),name:form.name.trim(),role:form.role,branch_id:branchId}).catch(e=>setErr(e.message));
    }
    setBusy(false); setShowing(false); setEditing(null);
    await load();
  };

  const remove = async (u) => {
    if(!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await api.delete("users","id",u.id);
    await load();
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800}}>👥 Branch Users</div>
          <div style={{fontSize:13,color:"var(--text3)",marginTop:2}}>{users.length} user{users.length!==1?"s":""}{branchName?" · "+branchName:""}</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      {showing&&(
        <div className="card" style={{padding:"16px 18px",marginBottom:16,border:"1.5px solid var(--accent)"}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:14}}>{editing?"✏️ Edit User":"➕ New User"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",display:"block",marginBottom:4}}>Display Name</label>
              <input className="inp" value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="Full name"/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",display:"block",marginBottom:4}}>Username *</label>
              <input className="inp" value={form.username} onChange={e=>sf("username",e.target.value)} autoCapitalize="none" placeholder="login username"/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",display:"block",marginBottom:4}}>Password{editing?" (leave blank to keep)":""} *</label>
              <input className="inp" type="password" value={form.password} onChange={e=>sf("password",e.target.value)}/>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",display:"block",marginBottom:4}}>Role *</label>
              <select className="inp" value={form.role} onChange={e=>sf("role",e.target.value)}>
                {BRANCH_USER_ROLES.map(r=><option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
              </select>
            </div>
          </div>
          {err&&<div style={{color:"var(--red)",fontSize:13,marginBottom:8}}>⚠ {err}</div>}
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy?"Saving…":editing?"Save Changes":"Create User"}</button>
            <button className="btn btn-ghost" onClick={()=>{setShowing(false);setEditing(null);setErr("");}}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{color:"var(--text3)",padding:20,textAlign:"center"}}>Loading…</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {users.map(u=>{
            const ri = BRANCH_USER_ROLES.find(r=>r.value===u.role)||{icon:"👤",label:u.role||"unknown"};
            const isSelf = u.id===user?.id;
            return (
              <div key={u.id} className="card" style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{ri.icon} {u.name||u.username}{isSelf&&<span style={{fontSize:11,color:"var(--accent)",marginLeft:6,fontWeight:600}}>(you)</span>}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>@{u.username} · {ri.label}</div>
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(u)}>✏️ Edit</button>
                  {!isSelf&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>remove(u)}>🗑</button>}
                </div>
              </div>
            );
          })}
          {users.length===0&&<div style={{color:"var(--text3)",textAlign:"center",padding:24}}>No branch users yet — add the first one above.</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BRANCH TRANSFER REQUESTS PAGE
// ═══════════════════════════════════════════════════════════════
export function TransferRequestCard({r,branches=[],role,currentBranch,settings,branchStock=[],parts=[],suppliers=[],partSuppliers=[],inquiries=[],supplierInvoices=[],onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,t={},onRefresh,onDelete,rfqQuotes=[],rfqItems=[],onCreateRfqSession,onGoToRfqSession}) {
  const Cs=curSym(settings?.currency||"ZAR R");
  const [acting,setActing]=useState(false);
  const [isReplying,setIsReplying]=useState(false);
  const [replyForm,setReplyForm]=useState({});      // {itemIdx: {price,availability,notes,markup}}
  const [replyNotes,setReplyNotes]=useState("");
  const [defaultMarkup,setDefaultMarkup]=useState("");
  const [patchErr,setPatchErr]=useState(null);
  const [rfqPart,setRfqPart]=useState(null);
  const [bulkRfq,setBulkRfq]=useState(false);
  const [lightbox,setLightbox]=useState(null);
  const [refreshing,setRefreshing]=useState(false);
  const handleRefresh=async()=>{setRefreshing(true);await onRefresh?.().catch(()=>{});setRefreshing(false);};
  // part_suppliers is 69k+ rows table-wide — fetching it in full just to open "Ask
  // Suppliers" on a mobile connection was the slow part. Fetch only the rows for this
  // request's own items instead, and fall back to that if the full table isn't
  // already loaded elsewhere in the app (Inventory/Suppliers tabs still load it fully).
  const [scopedPs,setScopedPs]=useState([]);
  useEffect(()=>{
    if(partSuppliers.length>0||(!rfqPart&&!bulkRfq)) return;
    const items=Array.isArray(r.items)?r.items:[];
    const partIds=[...new Set(items.map(i=>i.partId).filter(Boolean))];
    if(!partIds.length) return;
    let cancelled=false;
    api.get("part_suppliers",`part_id=in.(${partIds.join(",")})&select=*`).then(d=>{
      if(!cancelled&&Array.isArray(d)) setScopedPs(d);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[rfqPart,bulkRfq,partSuppliers.length,r.items]);
  const effectivePartSuppliers=partSuppliers.length>0?partSuppliers:scopedPs;

  const isSupplier=role==="admin"||String(r.supplying_branch_id)===String(currentBranch?.id);
  const supplyingBranch=branches.find(b=>String(b.id)===String(r.supplying_branch_id));
  const reqBranch=branches.find(b=>String(b.id)===String(r.requesting_branch_id));
  const items=Array.isArray(r.items)?r.items:[];
  const replyItems=Array.isArray(r.reply_items)?r.reply_items:[];

  // Which rfq_sessions (if any) already hold supplier quotes for this request's items —
  // lets us deep-link straight to "View & Order via RFQ" instead of sending whoever's
  // quoting off to go hunt for the right session in the RFQ tab themselves.
  const bulkRfqSessionId=(()=>{
    const skus=new Set(items.map(i=>(i.sku||"").toUpperCase()).filter(Boolean));
    if(!skus.size) return null;
    const itemIds=new Set(rfqItems.filter(ri=>skus.has((ri.part_sku||"").toUpperCase())).map(ri=>ri.id));
    if(!itemIds.size) return null;
    const matches=rfqQuotes.filter(q=>itemIds.has(q.rfq_item_id)&&q.unit_price!=null);
    if(!matches.length) return null;
    return matches.slice().sort((a,b)=>new Date(b.quoted_at||b.created_at||0)-new Date(a.quoted_at||a.created_at||0))[0].rfq_id;
  })();

  // Every supplier-quoted price on file for this SKU (from the RFQ flow),
  // cheapest first — lets whoever's quoting the workshop see what we're paying
  // before setting a price. One supplier per row (latest quote if they've
  // quoted more than once) so a cheaper quote never gets hidden behind a more
  // recently entered, pricier one.
  const supplierQuotesFor=(sku)=>{
    if(!sku) return [];
    const upperSku=sku.toUpperCase();
    const bySupplier={};
    const consider=(supplierId,id,supplier_name,reply_price,reply_notes,createdAt)=>{
      if(reply_price==null) return;
      const prev=bySupplier[supplierId];
      if(!prev||new Date(createdAt||0)>new Date(prev._createdAt||0)) bySupplier[supplierId]={id,supplier_name,reply_price,reply_notes,_createdAt:createdAt};
    };
    inquiries.filter(i=>(i.part_sku||"").toUpperCase()===upperSku&&i.reply_price!=null)
      .forEach(i=>consider(i.supplier_id,i.id,i.supplier_name,i.reply_price,i.reply_notes,i.created_at));
    // Bulk "Ask Suppliers — All Items" quotes live in rfq_quotes (unit_price), joined to
    // rfq_items for the SKU — same cost signal as an inquiry reply, just a different pipe.
    const itemIdsForSku=new Set(rfqItems.filter(ri=>(ri.part_sku||"").toUpperCase()===upperSku).map(ri=>ri.id));
    rfqQuotes.filter(q=>itemIdsForSku.has(q.rfq_item_id)&&q.unit_price!=null)
      .forEach(q=>consider(q.supplier_id,q.id,q.supplier_name,q.unit_price,q.notes,q.quoted_at||q.created_at));
    return Object.values(bySupplier).sort((a,b)=>(+a.reply_price)-(+b.reply_price));
  };

  // If this item's already been ordered from a supplier (via the RFQ accept
  // flow), surface who, how many, when, and any remark — matched by SKU to the
  // latest "ordered" inquiry, then to its invoice via rfq_inquiry_id.
  const orderInfoFor=(sku)=>{
    if(!sku) return null;
    const ordered=inquiries.filter(i=>(i.part_sku||"").toUpperCase()===sku.toUpperCase()&&i.status==="ordered");
    if(ordered.length===0) return null;
    const latest=ordered.reduce((a,b)=>new Date(b.created_at||0)>new Date(a.created_at||0)?b:a);
    const inv=supplierInvoices.find(iv=>String(iv.rfq_inquiry_id)===String(latest.id));
    return {supplier:latest.supplier_name,qty:latest.qty_requested||1,date:inv?.invoice_date||"",note:inv?.notes||""};
  };
  const isBusy=acting&&!isReplying;
  const borderColor={pending:"var(--orange)",quoted:"var(--purple)",confirmed:"var(--blue)",dispatched:"var(--green)"}[r.status]||"var(--border)";

  const patch=async(data)=>{
    setActing(true);setPatchErr(null);
    const res=await api.patch("branch_stock_requests","id",r.id,data);
    if(res?.code||res?.message){setPatchErr(res.message||res.code||"Save failed");setActing(false);return false;}
    await onRefresh?.();setActing(false);return true;
  };

  const acceptQuote=async()=>{
    setActing(true);
    try{
      // 1. Confirm the request
      await api.patch("branch_stock_requests","id",r.id,{status:"confirmed",confirmed_at:new Date().toISOString()});
      // 2. Write quoted prices back to branch_stock for the requesting branch
      const H={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=representation"};
      for(const item of replyItems){
        if(!item.partId||item.availability==="not_available"||!(+item.price>0))continue;
        // PATCH branch_stock where part_id and branch_id both match
        await fetch(`${SUPABASE_URL}/rest/v1/branch_stock?part_id=eq.${item.partId}&branch_id=eq.${r.requesting_branch_id}`,
          {method:"PATCH",headers:H,body:JSON.stringify({price:+item.price})});
      }
      api.cacheInvalidate("branch_stock");
      await onRefresh?.();
    }finally{setActing(false);}
  };

  // Look up live stock for a BSR item in the supplying branch
  const getItemStock=(it,supplyingBranchId)=>{
    const part=parts.find(p=>String(p.id)===String(it.partId));
    const bs=Array.isArray(branchStock)?branchStock.find(b=>String(b.part_id)===String(it.partId)&&String(b.branch_id)===String(supplyingBranchId)):null;
    const stock=bs!=null?+(bs.stock)||0:part?+(part.stock)||0:null;
    return stock;
  };

  const startReply=()=>{
    const existing=Array.isArray(r.reply_items)?r.reply_items:[];
    // Branch's saved default markup — pre-fill every line that has a supplier cost
    // on file so the quote is ready to send without re-typing the markup each time.
    const savedMarkup=supplyingBranch?.default_markup_pct;
    const mk=savedMarkup!=null&&savedMarkup!==""?+savedMarkup:null;
    setDefaultMarkup(mk!=null?mk:"");
    const form={};
    items.forEach((it,idx)=>{
      const prev=existing[idx]||{};
      const stock=getItemStock(it,r.supplying_branch_id);
      const autoAvail=stock==null?"in_stock":stock>0?"in_stock":"can_source";
      const hasPrevPrice=prev.price!=null&&prev.price!=="";
      const sqs=!hasPrevPrice&&mk!=null?supplierQuotesFor(it.sku):[];
      const autoPrice=sqs.length>0?Math.round((+sqs[0].reply_price)*(1+mk/100)*100)/100:null;
      form[idx]={
        price:hasPrevPrice?prev.price:(autoPrice??(it.price??"")),
        availability:prev.availability||autoAvail,
        notes:prev.notes||"",
        markup:prev.markup??(sqs.length>0?mk:""),
      };
    });
    setReplyForm(form);
    setReplyNotes(r.reply_notes||"");
    setIsReplying(true);
  };

  // Set once at the top, applied to every line with a known supplier cost, saved as
  // this branch's default so it's remembered — but each line's Markup %/Price stays
  // manually editable afterward.
  const applyDefaultMarkupToAll=async()=>{
    const mk=+defaultMarkup||0;
    setReplyForm(f=>{
      const next={...f};
      items.forEach((it,idx)=>{
        const sqs=supplierQuotesFor(it.sku);
        if(sqs.length===0) return;
        const cost=+sqs[0].reply_price;
        next[idx]={...next[idx],markup:mk,price:Math.round(cost*(1+mk/100)*100)/100};
      });
      return next;
    });
    if(r.supplying_branch_id) await api.patch("branches","id",r.supplying_branch_id,{default_markup_pct:mk}).catch(()=>{});
  };

  const submitReply=async()=>{
    const reply_items=items.map((it,idx)=>({
      ...it,
      price:+replyForm[idx]?.price||0,
      availability:replyForm[idx]?.availability||"in_stock",
      notes:replyForm[idx]?.notes||"",
    }));
    const ok=await patch({status:"quoted",reply_items,reply_notes:replyNotes,reply_at:new Date().toISOString()});
    if(!ok)return;
    // Write quoted prices back — branch_stock for catalog parts, parts.price for branch-owned parts
    const H={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=representation"};
    for(const item of reply_items){
      if(!item.partId||item.availability==="not_available"||!(+item.price>0))continue;
      // Update branch_stock price (main catalog parts)
      await fetch(`${SUPABASE_URL}/rest/v1/branch_stock?part_id=eq.${item.partId}&branch_id=eq.${r.supplying_branch_id}`,
        {method:"PATCH",headers:H,body:JSON.stringify({price:+item.price})});
      // Update parts.price for branch-owned parts (branch_id matches supplying branch)
      await fetch(`${SUPABASE_URL}/rest/v1/parts?id=eq.${item.partId}&branch_id=eq.${r.supplying_branch_id}`,
        {method:"PATCH",headers:H,body:JSON.stringify({price:+item.price})});
    }
    api.cacheInvalidate("branch_stock");
    api.cacheInvalidate("parts");
    setIsReplying(false);
  };

  const statusBadge=(s)=>{
    const map={
      pending:{l:"Pending",c:"var(--orange)"},
      quoted:{l:"Quoted",c:"var(--purple)"},
      confirmed:{l:"Confirmed",c:"var(--blue)"},
      dispatched:{l:"Dispatched",c:"var(--green)"},
      completed:{l:"Completed",c:"var(--text3)"},
      cancelled:{l:"Cancelled",c:"var(--red)"},
    };
    const m=map[s]||{l:s,c:"var(--text3)"};
    return <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:`${m.c}20`,color:m.c}}>{m.l}</span>;
  };

  const availBadge=(a)=>{
    const map={in_stock:{l:"✅ In Stock",c:"var(--green)"},can_source:{l:"🔍 Can Source",c:"var(--yellow)"},not_available:{l:"❌ Not Available",c:"var(--red)"}};
    const m=map[a]||{l:a,c:"var(--text3)"};
    return <span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:`${m.c}20`,color:m.c,fontWeight:600}}>{m.l}</span>;
  };

  // WhatsApp messages
  const quotedList=replyItems.map(i=>`• ${i.name}${i.qty>1?` ×${i.qty}`:""} — ${i.availability==="not_available"?"❌ Not available":i.availability==="can_source"?`🔍 Can source · ${Cs}${(+i.price||0).toFixed(2)}`:`✅ In stock · ${Cs}${(+i.price||0).toFixed(2)}`}${i.notes?` (${i.notes})`:""}`).join("\n");
  const waQuoteMsg=`Hi ${r.workshop_name||"there"}, here is your parts quote from ${supplyingBranch?.name||"the branch"}:\n\n${quotedList}${r.reply_notes?`\n\nNotes: ${r.reply_notes}`:""}\n\nPlease confirm if you'd like to proceed.`;
  const waReadyMsg=`Hi ${r.workshop_name||"there"}, your parts are ready for collection at ${supplyingBranch?.name||"the branch"}. Thank you!`;

  const STEPS=[["pending","Requested"],["quoted","Quoted"],["confirmed","Confirmed"],["dispatched","Ready"],["completed","Collected"]];
  const stepIdx={pending:0,quoted:1,confirmed:2,dispatched:3,completed:4}[r.status]??-1;
  const isNarrow=typeof window!=="undefined"&&window.innerWidth<640;
  const actBtn=isNarrow?{flex:"1 1 45%",justifyContent:"center",textAlign:"center"}:{};

  return (
    <div className="card" style={{padding:18,marginBottom:14,borderLeft:`3px solid ${borderColor}`}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:10}}>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>{r.workshop_name||"Workshop"}</div>
          {(r.job_label||r.job_customer||r.job_id)&&(
            <div style={{fontSize:12,color:"var(--blue)",fontWeight:600,marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              {r.job_id&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",fontWeight:400}}>{r.job_id}</code>}
              {r.job_label&&<span>🚗 {r.job_label}</span>}
              {r.job_customer&&<span>👤 {r.job_customer}</span>}
            </div>
          )}
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
            {isSupplier&&reqBranch&&<span>From: <strong>{reqBranch.name}</strong> ·</span>}
            {!isSupplier&&supplyingBranch&&<span>To: <strong>{supplyingBranch.name}</strong> ·</span>}
            {r.created_at&&<span>{fmtD(r.created_at)}</span>}
            {r.workshop_phone&&(
              <a href={waLink(r.workshop_phone,"")} target="_blank" rel="noreferrer" title={r.workshop_phone}
                style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:6,background:"var(--surface2)",border:"1px solid var(--border)",textDecoration:"none",fontSize:12}}>📱</a>
            )}
            {r.workshop_email&&(
              <a href={`mailto:${r.workshop_email}`} title={r.workshop_email}
                style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:6,background:"var(--surface2)",border:"1px solid var(--border)",textDecoration:"none",fontSize:12}}>✉️</a>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",alignSelf:"center"}}>
          {(()=>{
            const ordered=items.map(i=>orderInfoFor(i.sku)).filter(Boolean);
            if(!ordered.length) return null;
            const supps=[...new Set(ordered.map(o=>o.supplier))].join(", ");
            return (
              <span title={ordered.map(o=>`${o.qty}× from ${o.supplier}${o.date?` · ${new Date(o.date).toLocaleDateString()}`:""}`).join("\n")}
                style={{fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:700,background:"rgba(251,191,36,.15)",color:"#d97706",border:"1px solid rgba(251,191,36,.4)"}}>
                📦 Ordered{items.length>1?` ${ordered.length}/${items.length}`:""} — {supps}
              </span>
            );
          })()}
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:600,
            background:isSupplier?"rgba(52,211,153,.12)":"rgba(96,165,250,.12)",
            color:isSupplier?"var(--green)":"var(--blue)"}}>
            {isSupplier?"📥 Incoming":"📤 Outgoing"}
          </span>
        </div>
      </div>

      {/* Progress stepper — one glance tells where this request stands */}
      {r.status==="cancelled"
        ? <div style={{marginBottom:14}}>{statusBadge("cancelled")}</div>
        : (
        <div style={{display:"flex",alignItems:"center",gap:2,marginBottom:14,flexWrap:"nowrap",overflowX:"auto",paddingBottom:3,scrollbarWidth:"none"}}>
          {STEPS.map(([k,l],i)=>{
            const done=i<stepIdx, active=i===stepIdx;
            return (
              <div key={k} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
                <span style={{fontSize:isNarrow?10:11,fontWeight:active?800:600,padding:isNarrow?"3px 7px":"3px 10px",borderRadius:99,whiteSpace:"nowrap",
                  background:active?"rgba(96,165,250,.18)":done?"rgba(52,211,153,.1)":"var(--surface2)",
                  color:active?"var(--blue)":done?"var(--green)":"var(--text3)",
                  border:`1px solid ${active?"rgba(96,165,250,.45)":done?"rgba(52,211,153,.3)":"var(--border)"}`}}>
                  {done?"✓ ":""}{l}
                </span>
                {i<STEPS.length-1&&<span style={{fontSize:10,color:"var(--text3)",padding:"0 2px"}}>→</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" disabled={refreshing} onClick={handleRefresh} title="Pull in the latest supplier replies and status">
          <span style={refreshing?{display:"inline-block",animation:"spin 1s linear infinite"}:{}}>{refreshing?"⟳":"↻"}</span>{refreshing?" Refreshing…":" Refresh"}
        </button>
        {bulkRfqSessionId&&onGoToRfqSession&&(
          <button className="btn btn-ghost btn-sm" style={{color:"var(--purple)",border:"1px solid rgba(167,139,250,.4)"}}
            title="Jump to this request's RFQ session — select supplier quotes and create the Purchase Order from there"
            onClick={()=>onGoToRfqSession(bulkRfqSessionId)}>🛒 View &amp; Order via RFQ</button>
        )}
        {onCreateRfqSession&&items.length>1&&items.some(i=>i.partId&&parts.find(p=>String(p.id)===String(i.partId)))&&(
          <button className="btn btn-ghost btn-sm" style={{color:"var(--accent)",border:"1px solid rgba(249,115,22,.3)"}}
            title="Pick one supplier and request quotes for all items in this list at once"
            onClick={()=>setBulkRfq(true)}>📩 Ask Suppliers — All Items</button>
        )}
      </div>

      {/* Items — request + stock + quote merged into one row per part */}
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:10}}>
        {items.map((i,idx)=>{
          const stock=getItemStock(i,r.supplying_branch_id);
          const stockColor=stock==null?"var(--text3)":stock>0?"var(--green)":"var(--orange)";
          const stockLabel=stock==null?"stock —":stock>0?`${stock} in stock`:"0 in stock";
          const itemPart=i.partId?parts.find(p=>String(p.id)===String(i.partId)):null;
          const itemPhoto=itemPart?.image_url||"";
          const orderInfo=orderInfoFor(i.sku);
          const q=!isReplying?(replyItems.find(x=>x.sku&&i.sku&&x.sku===i.sku)||replyItems[idx]||null):null;
          const sqs=!q&&!isReplying?supplierQuotesFor(i.sku):[];
          return(
            <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:idx%2?"var(--surface)":"var(--surface2)",borderBottom:idx<items.length-1?"1px solid var(--border)":"none",flexWrap:"wrap"}}>
              {itemPhoto
                ? <img src={toImgUrl(itemPhoto)} alt="" referrerPolicy="no-referrer" onClick={()=>setLightbox(itemPhoto)}
                    style={{width:40,height:40,objectFit:"cover",borderRadius:8,border:"1px solid var(--border)",flexShrink:0,cursor:"zoom-in"}}
                    onError={e=>e.target.style.visibility="hidden"}/>
                : <div style={{width:40,height:40,borderRadius:8,background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🔩</div>}
              <div style={{flex:"1 1 180px",minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,lineHeight:1.3}}>
                  {i.name} {+i.qty>1&&<span style={{color:"var(--text3)",fontWeight:600}}>×{i.qty}</span>}
                </div>
                <div style={{fontSize:11,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",marginTop:2,alignItems:"center"}}>
                  {i.sku&&<code style={{fontFamily:"DM Mono,monospace"}}>{i.sku}</code>}
                  <span style={{color:stockColor,fontWeight:600}}>📦 {stockLabel}</span>
                  {itemPart&&onSendInquiry&&(
                    <button className="btn btn-ghost btn-xs" style={{padding:"0 6px",fontSize:10,whiteSpace:"nowrap"}} title="Request price/stock from suppliers" onClick={()=>setRfqPart(itemPart)}>📩 Ask Suppliers</button>
                  )}
                  {itemPart&&role==="admin"&&onEditPart&&(
                    <button className="btn btn-ghost btn-xs" style={{padding:"0 6px",fontSize:10,whiteSpace:"nowrap"}} title="Edit this part" onClick={()=>onEditPart(itemPart)}>✏️ Edit</button>
                  )}
                </div>
                {orderInfo&&(
                  <div style={{fontSize:11,fontWeight:600,color:"var(--blue)",marginTop:3}}>
                    📦 Ordered {orderInfo.qty}× from {orderInfo.supplier}{orderInfo.date?` · ${new Date(orderInfo.date).toLocaleDateString()}`:""}
                    {orderInfo.note&&<span style={{fontWeight:400,color:"var(--text3)"}}> — {orderInfo.note}</span>}
                  </div>
                )}
              </div>
              {q&&(isNarrow
                ? <div style={{flex:"1 1 100%",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:6,paddingTop:8,borderTop:"1px dashed var(--border)"}}>
                    {q.price>0&&q.availability!=="not_available"&&<span style={{fontSize:16,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{Cs}{(+q.price).toFixed(2)}</span>}
                    {availBadge(q.availability)}
                    {q.notes&&<span style={{fontSize:10,color:"var(--text3)",marginLeft:"auto",textAlign:"right"}}>{q.notes}</span>}
                  </div>
                : <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0,marginLeft:"auto"}}>
                    {q.price>0&&q.availability!=="not_available"&&<span style={{fontSize:15,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{Cs}{(+q.price).toFixed(2)}</span>}
                    {availBadge(q.availability)}
                    {q.notes&&<span style={{fontSize:10,color:"var(--text3)",maxWidth:160,textAlign:"right"}}>{q.notes}</span>}
                  </div>
              )}
              {/* No reply sent to the workshop yet — but a supplier has already quoted this
                  part (single "Ask Suppliers" or bulk RFQ) — surface who + how much so it's
                  visible before opening Reply with Quote. */}
              {sqs.length>0&&(
                <button type="button" onClick={()=>itemPart&&setRfqPart(itemPart)}
                  title={sqs.map(sq=>`${sq.supplier_name}: ${Cs}${(+sq.reply_price).toFixed(2)}`).join("\n")}
                  style={{flexShrink:0,marginLeft:isNarrow?0:"auto",flex:isNarrow?"1 1 100%":undefined,marginTop:isNarrow?6:0,
                    display:"flex",alignItems:"center",gap:6,cursor:itemPart?"pointer":"default",
                    padding:"5px 10px",borderRadius:99,border:"1px solid rgba(167,139,250,.4)",background:"rgba(167,139,250,.12)"}}>
                  <span style={{fontSize:13,fontWeight:800,color:"var(--purple)",fontFamily:"Rajdhani,sans-serif"}}>🏭 {Cs}{(+sqs[0].reply_price).toFixed(2)}</span>
                  <span style={{fontSize:11,color:"var(--text2)",fontWeight:600}}>{sqs[0].supplier_name}{sqs.length>1?` +${sqs.length-1} more`:""}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {r.notes&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:10,padding:"6px 10px",background:"var(--surface2)",borderRadius:6}}>📝 Request note: {r.notes}</div>}
      {r.reply_notes&&!isReplying&&replyItems.length>0&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:10,padding:"6px 10px",background:"rgba(167,139,250,.07)",border:"1px solid rgba(167,139,250,.2)",borderRadius:6}}>💬 Quote note from {supplyingBranch?.name||"supplier"}: {r.reply_notes}</div>}

      {/* Inline reply form — supplier fills in price + availability per item */}
      {isReplying&&<div style={{marginBottom:12,padding:"12px 14px",background:"rgba(167,139,250,.07)",border:"1.5px solid rgba(167,139,250,.3)",borderRadius:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--purple)"}}>💬 Reply with Quote</div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <label style={{fontSize:11,color:"var(--text3)",whiteSpace:"nowrap"}}>Default Markup %</label>
            <input className="inp" type="number" min="0" step="1" placeholder="e.g. 20"
              value={defaultMarkup} onChange={e=>setDefaultMarkup(e.target.value)} style={{width:70,fontSize:12}}/>
            <button type="button" className="btn btn-ghost btn-xs" style={{whiteSpace:"nowrap"}}
              title="Apply this markup to every line with a known supplier cost, and save it as this branch's default"
              onClick={applyDefaultMarkupToAll}>Apply to All &amp; Save</button>
          </div>
        </div>
        {items.map((it,idx)=>{
          const stock=getItemStock(it,r.supplying_branch_id);
          const stockColor=stock==null?"var(--text3)":stock>0?"var(--green)":"var(--orange)";
          const stockLabel=stock==null?"stock unknown":stock>0?`${stock} in stock`:"0 in stock — need to order";
          const sqs=supplierQuotesFor(it.sku);
          return(
          <div key={idx} style={{marginBottom:12,paddingBottom:12,borderBottom:idx<items.length-1?"1px solid var(--border)":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
              <div style={{fontWeight:600,fontSize:13}}>{it.name}{it.sku&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{it.sku}</span>} <span style={{color:"var(--text3)"}}>×{it.qty}</span></div>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,background:`${stockColor}18`,color:stockColor}}>📦 {stockLabel}</span>
            </div>
            {sqs.length>0&&(
              <div style={{marginBottom:8}}>
                {sqs.map((sq,sqi)=>(
                  <div key={sq.id} style={{marginTop:sqi>0?6:0,padding:"6px 8px",borderRadius:7,background:sq.reply_notes?"rgba(251,191,36,.08)":"transparent",border:sq.reply_notes?"1px solid rgba(251,191,36,.25)":"none"}}>
                    <div style={{fontSize:11,color:"var(--text2)",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      🏭 <strong style={{color:sqi===0?"var(--green)":"var(--accent)"}}>{Cs}{(+sq.reply_price).toFixed(2)}</strong> — {sq.supplier_name}
                      {sqi===0&&sqs.length>1&&<span style={{fontSize:9,color:"var(--green)",fontWeight:700}}>CHEAPEST</span>}
                      <button type="button" className="btn btn-ghost btn-xs" style={{padding:"1px 7px",fontSize:10}}
                        title={replyForm[idx]?.markup?`Applies this row's ${replyForm[idx].markup}% markup on top of cost`:"No markup % set on this row — uses raw cost"}
                        onClick={()=>setReplyForm(f=>{
                          const mk=+f[idx]?.markup||0;
                          const price=mk>0?Math.round((+sq.reply_price)*(1+mk/100)*100)/100:sq.reply_price;
                          return {...f,[idx]:{...f[idx],price}};
                        })}>Use cost</button>
                    </div>
                    {sq.reply_notes&&<div style={{fontSize:12,color:"var(--yellow)",fontWeight:600,marginTop:4}}>📝 {sq.reply_notes}</div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 120px"}}>
                <label style={{fontSize:11,color:"var(--text3)",display:"block",marginBottom:3}}>Availability</label>
                <select className="inp" value={replyForm[idx]?.availability||"in_stock"} onChange={e=>setReplyForm(f=>({...f,[idx]:{...f[idx],availability:e.target.value}}))} style={{fontSize:12}}>
                  <option value="in_stock">✅ In Stock</option>
                  <option value="can_source">🔍 Can Source</option>
                  <option value="not_available">❌ Not Available</option>
                </select>
              </div>
              {replyForm[idx]?.availability!=="not_available"&&<div style={{flex:"1 1 100px"}}>
                <label style={{fontSize:11,color:"var(--text3)",display:"block",marginBottom:3}}>Price ({Cs}, excl. VAT)</label>
                <input className="inp" type="number" min="0" step="0.01" placeholder="0.00"
                  value={replyForm[idx]?.price??""} onChange={e=>setReplyForm(f=>({...f,[idx]:{...f[idx],price:e.target.value}}))} style={{fontSize:12}}/>
              </div>}
              {replyForm[idx]?.availability!=="not_available"&&sqs.length>0&&<div style={{flex:"1 1 100px"}}>
                <label style={{fontSize:11,color:"var(--text3)",display:"block",marginBottom:3}}>Markup %</label>
                <div style={{display:"flex",gap:4}}>
                  <input className="inp" type="number" min="0" step="1" placeholder="e.g. 20"
                    value={replyForm[idx]?.markup??""} onChange={e=>setReplyForm(f=>({...f,[idx]:{...f[idx],markup:e.target.value}}))}
                    style={{fontSize:12,width:0,flex:1}}/>
                  <button type="button" className="btn btn-ghost btn-xs" style={{padding:"1px 8px",fontSize:11}}
                    onClick={()=>{
                      const cost=+sqs[0].reply_price;
                      const mk=+(replyForm[idx]?.markup)||0;
                      setReplyForm(f=>({...f,[idx]:{...f[idx],price:Math.round(cost*(1+mk/100)*100)/100}}));
                    }}>Apply</button>
                </div>
              </div>}
              <div style={{flex:"2 1 160px"}}>
                <label style={{fontSize:11,color:"var(--text3)",display:"block",marginBottom:3}}>Notes (optional)</label>
                <input className="inp" placeholder="Lead time, brand, etc."
                  value={replyForm[idx]?.notes||""} onChange={e=>setReplyForm(f=>({...f,[idx]:{...f[idx],notes:e.target.value}}))} style={{fontSize:12}}/>
              </div>
            </div>
            {replyForm[idx]?.availability!=="not_available"&&+replyForm[idx]?.price>0&&(settings?.tax_rate>0)&&(()=>{
              const p=+replyForm[idx].price, vat=p*(settings.tax_rate/100);
              return (
                <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>
                  Excl. VAT: {Cs}{p.toFixed(2)} &nbsp;+&nbsp; VAT ({settings.tax_rate}%): {Cs}{vat.toFixed(2)} &nbsp;=&nbsp;
                  <strong style={{color:"var(--text2)"}}> Incl. VAT: {Cs}{(p+vat).toFixed(2)}</strong>
                </div>
              );
            })()}
          </div>
        );})}
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,color:"var(--text3)",display:"block",marginBottom:3}}>Overall Notes</label>
          <textarea className="inp" rows={2} placeholder="Delivery time, payment terms, etc."
            value={replyNotes} onChange={e=>setReplyNotes(e.target.value)} style={{fontSize:12,resize:"vertical"}}/>
        </div>
        {patchErr&&<div style={{fontSize:12,color:"var(--red)",marginBottom:8,padding:"6px 10px",background:"rgba(248,113,113,.1)",borderRadius:6}}>❌ {patchErr}</div>}
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-primary btn-sm" disabled={acting} onClick={submitReply}>📨 Send Quote</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setIsReplying(false);setPatchErr(null);}}>Cancel</button>
        </div>
      </div>}

      {/* Supplier: confirmed / cancelled alert banners */}
      {isSupplier&&r.status==="confirmed"&&replyItems.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,background:"rgba(52,211,153,.1)",border:"1.5px solid rgba(52,211,153,.35)",borderRadius:8}}>
          <span style={{fontSize:18}}>✅</span>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:"var(--green)"}}>Workshop accepted your quote!</div>
            <div style={{fontSize:12,color:"var(--text2)",marginTop:1}}>Please prepare the parts and mark ready when done.</div>
          </div>
        </div>
      )}
      {isSupplier&&r.status==="cancelled"&&replyItems.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:10,background:"rgba(248,113,113,.1)",border:"1.5px solid rgba(248,113,113,.3)",borderRadius:8}}>
          <span style={{fontSize:18}}>✕</span>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:"var(--red)"}}>Workshop declined the quote</div>
            <div style={{fontSize:12,color:"var(--text2)",marginTop:1}}>No action needed — this request is closed.</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:12,marginTop:4}}>
        {isSupplier&&!isReplying&&(r.status==="pending"||r.status==="quoted")&&
          <button className="btn btn-purple btn-sm" style={actBtn} onClick={startReply}>
            {r.status==="quoted"?"✏️ Edit Quote":"💬 Reply with Quote"}
          </button>}
        {isSupplier&&r.status==="quoted"&&replyItems.length>0&&r.workshop_phone&&
          <a href={waLink(r.workshop_phone,waQuoteMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none",...actBtn}}>💬 WhatsApp Quote</a>}
        {isSupplier&&r.status==="confirmed"&&<>
          {r.workshop_phone&&<a href={waLink(r.workshop_phone,waReadyMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none",...actBtn}}>💬 WhatsApp Workshop</a>}
          <button className="btn btn-success btn-sm" style={actBtn} disabled={isBusy} onClick={()=>patch({status:"dispatched",dispatched_at:new Date().toISOString()})}>🚚 Mark Ready{isNarrow?"":" for Collection"}</button>
        </>}
        {isSupplier&&r.status==="dispatched"&&<>
          {r.workshop_phone&&<a href={waLink(r.workshop_phone,waReadyMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none",...actBtn}}>💬 Notify Workshop</a>}
          <button className="btn btn-ghost btn-sm" style={actBtn} disabled={isBusy} onClick={()=>patch({status:"completed"})}>✅ Mark Collected</button>
        </>}
        {isSupplier&&!["completed","cancelled"].includes(r.status)&&
          <button className="btn btn-ghost btn-sm" style={{marginLeft:isNarrow?0:"auto",color:"var(--red)",border:"1px solid rgba(248,113,113,.3)",...actBtn}} disabled={isBusy} title="Cancels this request — the requester will see it as Cancelled"
            onClick={()=>{if(!window.confirm("Cancel this transfer request? The requester will be notified it's cancelled."))return;patch({status:"cancelled"});}}>✕ Cancel</button>}

        {/* Requester side */}
        {!isSupplier&&r.status==="pending"&&<span style={{fontSize:12,color:"var(--orange)",fontWeight:600}}>⏳ Awaiting quote from {supplyingBranch?.name||"branch"}…</span>}
        {!isSupplier&&r.status==="quoted"&&<>
          <span style={{fontSize:12,color:"var(--purple)",fontWeight:600,flex:isNarrow?"1 1 100%":undefined}}>💬 Quote received — review above and confirm</span>
          <button className="btn btn-primary btn-sm" style={actBtn} disabled={isBusy} onClick={acceptQuote}>✅ Accept & Update Prices</button>
          <button className="btn btn-danger btn-sm" style={actBtn} disabled={isBusy} title="Declines the quote and cancels this request"
            onClick={()=>{if(!window.confirm("Decline this quote and cancel the request?"))return;patch({status:"cancelled"});}}>✕ Decline Quote</button>
        </>}
        {!isSupplier&&r.status==="confirmed"&&<span style={{fontSize:12,color:"var(--blue)",fontWeight:600}}>✅ Accepted — {supplyingBranch?.name||"branch"} is preparing your parts</span>}
        {!isSupplier&&r.status==="dispatched"&&<>
          <span style={{fontSize:12,color:"var(--green)",fontWeight:700,flex:isNarrow?"1 1 100%":undefined}}>📦 Parts ready! Notify your workshop customer.</span>
          {r.workshop_phone&&<a href={waLink(r.workshop_phone,waReadyMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none",...actBtn}}>💬 WhatsApp Workshop</a>}
        </>}
        {!isSupplier&&r.status==="completed"&&<span style={{fontSize:12,color:"var(--text3)"}}>✅ Completed</span>}
        {!isSupplier&&r.status==="cancelled"&&<span style={{fontSize:12,color:"var(--red)"}}>✕ Cancelled</span>}
        {r.status==="cancelled"&&
          <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={()=>patch({status:"pending"})}>↩️ Reopen</button>}
        {onDelete&&<button className="btn btn-ghost btn-sm" style={{marginLeft:isNarrow||(isSupplier&&!["completed","cancelled"].includes(r.status))?0:"auto",color:"var(--red)",border:"1px solid rgba(248,113,113,.3)",...actBtn}} disabled={isBusy}
          onClick={async()=>{if(!window.confirm("Delete this transfer request?"))return;await onDelete(r.id);}}>
          🗑️ Delete
        </button>}
      </div>

      {rfqPart&&<InquiryModal part={rfqPart} suppliers={suppliers} partSuppliers={effectivePartSuppliers.filter(ps=>ps.part_id===rfqPart.id)} inquiries={inquiries} rfqQuotes={rfqQuotes} rfqItems={rfqItems}
        onSend={async(data)=>{await onSendInquiry(data);}} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onClose={()=>setRfqPart(null)} t={t} isAdmin={role==="admin"} onEditPart={onEditPart}/>}
      {bulkRfq&&<BulkInquiryModal
        items={items.map(i=>({...i,part:i.partId?parts.find(p=>String(p.id)===String(i.partId)):null}))}
        suppliers={suppliers} partSuppliers={effectivePartSuppliers} rfqQuotes={rfqQuotes} rfqItems={rfqItems} settings={settings}
        sessionName={`Branch Transfer — ${r.workshop_name||supplyingBranch?.name||reqBranch?.name||r.id}`}
        onCreateRfqSession={onCreateRfqSession}
        onClose={()=>setBulkRfq(false)} t={t}/>}
      {lightbox&&<ImgLightbox url={toImgUrl(lightbox)} onClose={()=>setLightbox(null)}/>}
    </div>
  );
}

export function BranchTransferRequestsPage({branchStockRequests=[],branches=[],role,currentBranch,settings,branchStock=[],parts=[],suppliers=[],partSuppliers=[],inquiries=[],supplierInvoices=[],onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,t={},onRefresh,onDelete,rfqQuotes=[],rfqItems=[],onCreateRfqSession,onGoToRfqSession}) {
  const [refreshing,setRefreshing]=useState(false);
  const onRefreshRef=useRef(onRefresh);
  useEffect(()=>{onRefreshRef.current=onRefresh;},[onRefresh]);

  // Auto-poll every 30s so branch sees new workshop requests and status changes
  useEffect(()=>{
    const tick=()=>onRefreshRef.current?.();
    const timer=setInterval(tick,30000);
    return()=>clearInterval(timer);
  },[]);

  const handleRefresh=async()=>{
    setRefreshing(true);
    await onRefresh?.().catch(()=>{});
    setRefreshing(false);
  };

  const sorted=[...branchStockRequests].sort((a,b)=>{
    const ord={pending:0,quoted:1,confirmed:2,dispatched:3,completed:4,cancelled:5};
    const oa=ord[a.status]??9,ob=ord[b.status]??9;
    return oa!==ob?oa-ob:new Date(b.created_at)-new Date(a.created_at);
  });

  const pendingCount=branchStockRequests.filter(r=>r.status==="pending").length;
  const quotedCount=branchStockRequests.filter(r=>r.status==="quoted").length;

  return (
    <div>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6,flexWrap:"wrap"}}>
          <div style={{fontSize:18,fontWeight:800}}>🔄 Branch Transfer Requests</div>
          {pendingCount>0&&<span style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"rgba(251,146,60,.2)",color:"var(--orange)"}}>{pendingCount} pending</span>}
          {quotedCount>0&&<span style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"rgba(167,139,250,.2)",color:"var(--purple)"}}>{quotedCount} quoted</span>}
          <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} disabled={refreshing} onClick={handleRefresh}>
            <span style={refreshing?{display:"inline-block",animation:"spin 1s linear infinite"}:{}}>{refreshing?"⟳":"↻"}</span>{refreshing?" Refreshing…":" Refresh"}
          </button>
        </div>
        <div style={{fontSize:13,color:"var(--text2)"}}>Reply to workshop requests with price + availability. Workshops confirm the quote before you prepare stock. Auto-refreshes every 30s.</div>
      </div>

      {sorted.length===0&&<div style={{textAlign:"center",padding:48,color:"var(--text3)"}}>No transfer requests yet</div>}

      {sorted.map(r=>(
        <TransferRequestCard key={r.id} r={r} branches={branches} role={role} currentBranch={currentBranch} settings={settings} branchStock={branchStock} parts={parts} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} supplierInvoices={supplierInvoices} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t} onRefresh={onRefresh} onDelete={onDelete} rfqQuotes={rfqQuotes} rfqItems={rfqItems} onCreateRfqSession={onCreateRfqSession} onGoToRfqSession={onGoToRfqSession}/>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRINT PART LABEL MODAL — immediate/relabel
// ═══════════════════════════════════════════════════════════════
export function PrintPartLabelModal({part,settings,suppliers=[],onClose}) {
  const [bin,setBin]=useState(part?.bin_location||"");
  const [supplierCode,setSupplierCode]=useState("");
  const [qty,setQty]=useState(1);

  // Try to load primary supplier code
  useEffect(()=>{
    if(!part?.id)return;
    api.get("part_suppliers",`part_id=eq.${part.id}&select=supplier_part_no,supplier_id&limit=1`).then(r=>{
      if(Array.isArray(r)&&r[0])setSupplierCode(r[0].supplier_part_no||"");
    });
  },[part?.id]);

  const handlePrint=()=>{
    const total=Math.max(1,+qty||1);
    const labels=[];
    for(let i=1;i<=total;i++){
      labels.push({
        sku:part?.sku||"",
        name:part?.name||"",
        binLocation:bin,
        supplierCode,
        invoiceNo:"",
        seq:total>1?`${i}/${total}`:"",
      });
    }
    openPartLabelsWindow(labels,{
      widthMm:settings?.part_label_w||98,
      heightMm:settings?.part_label_h||45,
      shopName:settings?.shop_name||"",
    });
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="🏷️ Print Part Label" sub={part?.name||""} onClose={onClose}/>
      <FD><FL label="Part SKU"/><div style={{fontFamily:"DM Mono,monospace",fontSize:13,color:"var(--accent)",padding:"6px 0"}}>{part?.sku||"—"}</div></FD>
      <FD><FL label="Bin / Location"/><input className="inp" value={bin} onChange={e=>setBin(e.target.value)} placeholder="e.g. A1-02"/></FD>
      <FD><FL label="Supplier Code (optional)"/><input className="inp" value={supplierCode} onChange={e=>setSupplierCode(e.target.value)} placeholder="e.g. SUP-4567"/></FD>
      <FD><FL label="Number of copies"/><input className="inp" type="number" min="1" max="999" value={qty} onChange={e=>setQty(e.target.value)} placeholder="1"/></FD>
      <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>
        Label size: {settings?.part_label_w||98}×{settings?.part_label_h||45}mm · Change in ⚙️ Settings → Inventory
      </div>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handlePrint} disabled={!part?.sku}>🖨️ Open Print Window</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP REQUESTS PAGE  (spare-shop side)
// ═══════════════════════════════════════════════════════════════
export function WorkshopRequestsPage({wsShopRequests=[],parts=[],settings={},suppliers=[],partSuppliers=[],inquiries=[],onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,t={},onReply,onEscalate,onMainReply,onDelete,onRefresh,userRole="",userBranchId=null}) {
  const [selId,    setSelId]    = useState(null);
  const [filter,   setFilter]   = useState("pending");
  const [refreshing,setRefreshing]=useState(false);

  const pendingCount   = wsShopRequests.filter(r=>r.status==="pending").length;
  const escalatedCount = wsShopRequests.filter(r=>r.status==="escalated").length;
  const mainRepliedCount = wsShopRequests.filter(r=>r.status==="main_replied").length;
  const orderedCount   = wsShopRequests.filter(r=>r.status==="ordered").length;
  const visible=wsShopRequests
    .filter(r=>filter==="all"?true:r.status===filter)
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const selected=selId?wsShopRequests.find(r=>r.id===selId)||null:null;

  const doRefresh=async()=>{setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}};

  const statusMeta={
    pending:     {icon:"⏳",label:"Pending",     bg:"rgba(251,146,60,.15)",  color:"var(--orange)"},
    escalated:   {icon:"⬆️",label:"Escalated",   bg:"rgba(96,165,250,.15)",  color:"var(--blue)"},
    main_replied:{icon:"📦",label:"Main Replied", bg:"rgba(52,211,153,.15)",  color:"var(--green)"},
    replied:     {icon:"✅",label:"Replied",      bg:"rgba(52,211,153,.15)",  color:"var(--green)"},
    ordered:     {icon:"🛒",label:"Ordered",      bg:"rgba(22,163,74,.15)",   color:"#16a34a"},
  };

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        <div style={{fontWeight:800,fontSize:20,flex:1}}>🏪 Workshop Parts Requests</div>
        <button className="btn btn-ghost btn-sm" disabled={refreshing} onClick={doRefresh}>↻ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {[
          ["pending",   `⏳ Pending${pendingCount>0?` (${pendingCount})`:""}`],
          ["escalated", `⬆️ Escalated${escalatedCount>0?` (${escalatedCount})`:""}`],
          ["main_replied",`📦 Main Replied${mainRepliedCount>0?` (${mainRepliedCount})`:""}`],
          ["replied",   "✅ Replied"],
          ["ordered",   `🛒 Ordered${orderedCount>0?` (${orderedCount})`:""}`],
          ["all",       "All"],
        ].map(([v,lbl])=>(
          <button key={v} onClick={()=>{setFilter(v);setSelId(null);}}
            style={{padding:"6px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:filter===v?"var(--accent)":"var(--surface2)",color:filter===v?"#fff":"var(--text3)"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Detail panel (shown when a request is selected) */}
      {selected&&(
        <div style={{marginBottom:20,border:"2px solid var(--accent)",borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"10px 16px",background:"rgba(251,146,60,.08)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontWeight:700,flex:1}}>Reviewing: {selected.workshop_name} — {selected.job_car||"—"}</span>
            {onDelete&&<button onClick={async()=>{if(!window.confirm("Delete this request?"))return;await onDelete(selected.id);setSelId(null);}}
              style={{background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",color:"#ef4444",borderRadius:7,padding:"3px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}>🗑️ Delete</button>}
            <button onClick={()=>setSelId(null)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:18,padding:"0 4px"}}>✕</button>
          </div>
          <WsShopRequestDetail req={selected} parts={parts} settings={settings} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t}
            onReply={async(...a)=>{await onReply(...a);setSelId(null);}}
            onEscalate={onEscalate} onMainReply={onMainReply}
            userRole={userRole} userBranchId={userBranchId}/>
        </div>
      )}

      {/* Request list */}
      {visible.length===0
        ? <div style={{textAlign:"center",padding:"48px 0",color:"var(--text3)",fontSize:14}}>No {filter==="all"?"":filter} requests</div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {visible.map(req=>{
              const items=(() => {try{return JSON.parse(req.items||"[]");}catch{return [];}})();
              const isSel=selId===req.id;
              return (
                <div key={req.id}
                  style={{padding:"14px 16px",borderRadius:12,cursor:"pointer",
                    border:`2px solid ${isSel?"var(--accent)":"var(--border)"}`,
                    background:isSel?"rgba(251,146,60,.06)":"var(--surface2)",transition:"all .15s"}}
                  onClick={()=>setSelId(isSel?null:req.id)}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>🔧 {req.workshop_name||"Workshop"}{req.requester_name?` · ${req.requester_name}`:""}</div>
                      <div style={{fontSize:12,color:"var(--text3)"}}>{req.job_car||"—"}{req.job_complaint?` · ${req.job_complaint}`:""}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{items.length} part{items.length!==1?"s":""} · {fmtDT(req.created_at,"—")}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      {(()=>{const m=statusMeta[req.status]||{icon:"•",label:req.status,bg:"var(--surface2)",color:"var(--text3)"};return(
                        <span style={{fontSize:11,padding:"3px 10px",borderRadius:99,fontWeight:600,background:m.bg,color:m.color}}>{m.icon} {m.label}</span>
                      );})()}
                      {onDelete&&<button onClick={async(e)=>{e.stopPropagation();if(!window.confirm("Delete this request?"))return;await onDelete(req.id);if(isSel)setSelId(null);}}
                        style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",color:"#ef4444",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>🗑️</button>}
                      <span style={{fontSize:12,color:"var(--accent)",fontWeight:600}}>{isSel?"▲ Close":"▼ Review"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

export function WsShopRequestDetail({req, parts=[], settings={}, suppliers=[], partSuppliers=[], inquiries=[], onSendInquiry, onManualQuote, onAcceptQuote, onCancelOrder, onEditPart, t={}, onReply, onEscalate, onMainReply, userRole="", userBranchId=null}) {
  const [rfqPart, setRfqPart] = useState(null);
  const reqItems = (() => {try{return JSON.parse(req.items||"[]");}catch{return [];}})();
  const existingReply = (() => {try{return JSON.parse(req.reply_items||"[]");}catch{return [];}})();
  const existingMainReply = (() => {try{return JSON.parse(req.main_reply_items||"[]");}catch{return [];}})();

  const [replyLines, setReplyLines] = useState(()=>
    reqItems.map((item,i)=>{
      // Auto-match by SKU if admin hasn't replied yet
      const autoMatched=(()=>{
        if(existingReply[i]?.part_id) return null;
        const sku=(item.sku||"").toLowerCase().trim();
        if(!sku) return null;
        return parts.find(p=>(p.sku||"").toLowerCase()===sku||(p.oe_number||"").toLowerCase()===sku)||null;
      })();
      return {
        description: item.description||"",
        sku: item.sku||"",
        qty: item.qty||1,
        price: existingReply[i]?.price||autoMatched?.price||"",
        available: existingReply[i]?.available!==false,
        part_id: existingReply[i]?.part_id||(autoMatched?String(autoMatched.id):null),
        notes: existingReply[i]?.notes||"",
        source: existingReply[i]?.source||null,
      };
    })
  );
  const [replyNotes, setReplyNotes] = useState(req.reply_notes||"");
  const [saving, setSaving] = useState(false);
  const [partSearch, setPartSearch] = useState({}); // {lineIdx: searchStr}
  const [creating, setCreating] = useState(null);   // lineIdx currently creating a new part
  const [newPart, setNewPart] = useState({name:"",sku:"",cost:"",price:""});
  const [createSaving, setCreateSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const [chosenSupplier, setChosenSupplier] = useState(null);
  const [showSupplier, setShowSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [addingPhone, setAddingPhone] = useState(null);
  const [addPhoneVal, setAddPhoneVal] = useState("");
  const [addPhoneSaving, setAddPhoneSaving] = useState(false);
  const [localSuppliers, setLocalSuppliers] = useState(suppliers);
  const [partSupLinks, setPartSupLinks] = useState([]); // part_suppliers rows for linked parts

  // Fetch supplier part numbers when supplier panel opens
  useEffect(()=>{
    if(!showSupplier) return;
    const partIds=[...new Set(existingReply.map(r=>r.part_id).filter(Boolean))];
    if(!partIds.length) return;
    api.get("part_suppliers",`part_id=in.(${partIds.join(",")})&select=part_id,supplier_id,supplier_part_no`)
      .then(d=>setPartSupLinks(Array.isArray(d)?d:[]))
      .catch(()=>{});
  },[showSupplier]);

  // Escalation state (spare shop → main stock)
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateNotes, setEscalateNotes] = useState("");
  const [escalateSaving, setEscalateSaving] = useState(false);

  // Main stock reply state (admin replies to escalated request)
  const isAdminOrManager = userRole==="admin"||userRole==="manager";
  const [mainReplyLines, setMainReplyLines] = useState(()=>
    reqItems.map((item,i)=>({
      description: item.description||"",
      sku: item.sku||"",
      qty: item.qty||1,
      price: existingMainReply[i]?.price||"",
      available: existingMainReply[i]?.available!==false,
      notes: existingMainReply[i]?.notes||"",
    }))
  );
  const [mainReplyNotes, setMainReplyNotes] = useState(req.main_reply_notes||"");
  const [mainReplySaving, setMainReplySaving] = useState(false);

  const handleEscalate=async()=>{
    if(!escalateNotes.trim()){alert("Please enter a reason / note for main stock.");return;}
    setEscalateSaving(true);
    try{await onEscalate(req.id,escalateNotes);}finally{setEscalateSaving(false);setShowEscalate(false);}
  };

  const updateMainLine=(idx,patch)=>setMainReplyLines(prev=>prev.map((l,i)=>i===idx?{...l,...patch}:l));

  const handleMainReply=async()=>{
    setMainReplySaving(true);
    try{
      const payload=mainReplyLines.map(l=>({
        description:l.description, sku:l.sku, qty:l.qty,
        price:+l.price||0, available:l.available, notes:l.notes||"",
      }));
      await onMainReply(req.id, payload, mainReplyNotes);
    }finally{setMainReplySaving(false);}
  };

  const Cs = C();

  const updateLine=(idx,patch)=>setReplyLines(prev=>prev.map((l,i)=>i===idx?{...l,...patch}:l));

  const searchResults=(idx)=>{
    const q=(partSearch[idx]||"").toLowerCase().trim();
    if(!q) return [];
    return parts.filter(p=>{
      const hay=`${p.name||""} ${p.sku||""} ${p.oe_number||""}`.toLowerCase();
      return q.split(/\s+/).every(w=>hay.includes(w));
    }).slice(0,8);
  };

  const pickPart=(idx,p)=>{
    updateLine(idx,{part_id:String(p.id),price:String(p.price||""),description:p.name,sku:p.sku||p.oe_number||"",notes:""});
    setPartSearch(prev=>({...prev,[idx]:""}));
  };

  const handleCreatePart=async(idx)=>{
    if(!newPart.name.trim()||!newPart.price){alert("Name and sell price required");return;}
    // Duplicate detection — check exact SKU/OE match and similar name
    const skuTrimmed=newPart.sku.trim().toLowerCase();
    const nameTrimmed=newPart.name.trim().toLowerCase();
    const exactSku=skuTrimmed?parts.find(p=>(p.sku||"").toLowerCase()===skuTrimmed||(p.oe_number||"").toLowerCase()===skuTrimmed):null;
    const sameName=parts.find(p=>(p.name||"").toLowerCase()===nameTrimmed);
    const dupe=exactSku||sameName;
    if(dupe){
      const ok=window.confirm(`⚠️ Possible duplicate detected!\n\n"${dupe.name}"${dupe.sku?` · SKU: ${dupe.sku}`:""}\nalready exists in inventory.\n\nSearch for it above and link it instead, or click OK to create a new part anyway.`);
      if(!ok)return;
    }
    setCreateSaving(true);
    try{
      const needsReview=!!(userBranchId&&userRole!=="admin"&&userRole!=="manager");
      const payload={name:newPart.name.trim(),sku:newPart.sku.trim()||null,
        price:+newPart.price||0,cost_price:+newPart.cost||0,stock:0,min_stock:0,
        ...(needsReview?{review_status:"pending",created_by_branch_id:String(userBranchId)}:{})};
      const res=await api.insert("parts",payload);
      if(res?.code){alert("Failed: "+res.message);return;}
      const newId=Array.isArray(res)&&res[0]?String(res[0].id):null;
      if(!newId){alert("Part saved but could not get ID — please search for it manually.");return;}
      updateLine(idx,{part_id:newId,price:String(newPart.price),description:newPart.name.trim(),sku:newPart.sku.trim()||"",notes:needsReview?"Pending admin approval":""});
      setCreating(null);
      setNewPart({name:"",sku:"",cost:"",price:""});
    }finally{setCreateSaving(false);}
  };

  const handleReply=async()=>{
    setSaving(true);
    try{
      const payload=replyLines.map((l)=>{
        const skuHint=(l.sku||"").toLowerCase().trim();
        const linkedById=l.part_id?parts.find(p=>String(p.id)===String(l.part_id)):null;
        const linkedBySku=!linkedById&&skuHint?parts.find(p=>(p.sku||"").toLowerCase()===skuHint||(p.oe_number||"").toLowerCase()===skuHint):null;
        const linkedPart=linkedById||linkedBySku;
        const lPhotos=Array.isArray(linkedPart?.photos)?linkedPart.photos:(()=>{try{return JSON.parse(linkedPart?.photos||"[]");}catch{return[];}})();
        return {
          description:l.description,
          sku:linkedPart?.sku||linkedPart?.oe_number||l.sku||"",
          qty:l.qty,
          price:+l.price||0,available:l.available,
          part_id:linkedPart?String(linkedPart.id):l.part_id||null,
          notes:l.notes||"",
          part_name:linkedPart?.name||l.description,
          part_photo:lPhotos[0]||linkedPart?.photo_url||"",
          source:l.source||null,
        };
      });
      await onReply(req.id, payload, replyNotes);
    }finally{setSaving(false);}
  };

  const waMsg=`Hi 👋\n\nParts request reply from *${settings.shop_name||"Spare Shop"}*\n\nJob: ${req.job_car||"—"}\n\n`+
    replyLines.map((l,i)=>{
      const srcLabel=l.source==="stock"?" 📦 Main Stock":l.source==="supplier"?" 🏭 Local Supplier":"";
      return `${i+1}. ${l.description}${l.sku?` (${l.sku})`:""}  —  ${l.available?`✅ Available @ ${settings.currency_symbol||"R"}${l.price||"0"}${srcLabel}`:"❌ Not available"}${l.notes?`  (${l.notes})`:""}`
    }).join("\n")+
    (replyNotes?`\n\nNotes: ${replyNotes}`:"")+"\n\nPlease check your workshop app for details.";
  const workshopPhone=req.workshop_phone||"";

  return (
    <div style={{padding:"20px 24px"}}>
      {/* Header */}
      <div style={{marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontWeight:800,fontSize:18,marginBottom:4}}>🔧 {req.workshop_name||"Workshop"}</div>
            {req.requester_name&&<div style={{fontSize:13,color:"var(--text3)"}}>👤 Requested by: <strong style={{color:"var(--text)"}}>{req.requester_name}</strong></div>}
            {req.job_car&&<div style={{fontSize:13,color:"var(--text3)"}}>🚗 Vehicle: <strong style={{color:"var(--text)"}}>{req.job_car}</strong></div>}
            {req.job_complaint&&<div style={{fontSize:13,color:"var(--text3)"}}>⚠️ Issue: <em>{req.job_complaint}</em></div>}
            <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Received: {fmtDT(req.created_at,"—")}</div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {workshopPhone&&<a href={`https://wa.me/${workshopPhone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
              style={{padding:"6px 12px",borderRadius:8,background:"#25D366",color:"#fff",fontWeight:700,fontSize:12,textDecoration:"none"}}>
              💬 WhatsApp Workshop</a>}
            <span style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,
              background:req.status==="pending"?"rgba(251,146,60,.15)":"rgba(52,211,153,.15)",
              color:req.status==="pending"?"#f59e0b":"#34d399"}}>
              {req.status==="pending"?"⏳ Pending Reply":"✅ Replied"}
            </span>
          </div>
        </div>
        {req.notes&&<div style={{marginTop:10,padding:"8px 12px",background:"var(--surface2)",borderRadius:8,fontSize:12,color:"var(--text2)",border:"1px solid var(--border)"}}>📝 Workshop note: {req.notes}</div>}

        {/* VIN Search & Tools */}
        {(req.vin||req.engine_no)&&(
          <div style={{marginTop:12,padding:"12px 14px",background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>🔍 VIN Search &amp; Tools</div>
            <div style={{display:"flex",gap:10,marginBottom:req.vin?10:0,flexWrap:"wrap",alignItems:"center"}}>
              {req.vin&&<>
                <code style={{fontFamily:"DM Mono,monospace",fontSize:13,fontWeight:700,padding:"4px 10px",borderRadius:6,background:"var(--surface)",border:"1px solid var(--border)",letterSpacing:"1px"}}>{req.vin}</code>
                <button onClick={()=>navigator.clipboard.writeText(req.vin).then(()=>alert("VIN copied!"))}
                  style={{fontSize:11,padding:"4px 8px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",color:"var(--text3)"}}>📋 Copy VIN</button>
              </>}
              {req.engine_no&&<span style={{fontSize:12,color:"var(--text2)"}}>Engine #: <code style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--text)"}}>{req.engine_no}</code></span>}
            </div>
            {req.vin&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[
                  {label:"CatCar",    icon:"🐱", color:"#f97316", bg:"rgba(249,115,22,.13)", href:`https://catcar.info/?lang=en&vin=${encodeURIComponent(req.vin)}`},
                  {label:"7zap",      icon:"🔩", color:"#60a5fa", bg:"rgba(96,165,250,.13)",  href:"https://7zap.com/en/vin-decoder/", copyVin:true},
                  {label:"RealOEM",   icon:"🚗", color:"#34d399", bg:"rgba(52,211,153,.13)",  href:`https://www.realoem.com/bmw/enUS/select?vin=${encodeURIComponent(req.vin)}`},
                  {label:"VIN Decode",icon:"🔎", color:"#fbbf24", bg:"rgba(251,191,36,.13)",  href:`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(req.vin)}`},
                  {label:"17VIN",     icon:"🆔", color:"#94a3b8", bg:"rgba(148,163,184,.13)", href:`https://en.17vin.com/vin/${encodeURIComponent(req.vin)}`},
                  {label:"Willard",   icon:"🔋", color:"#ef4444", bg:"rgba(220,38,38,.11)",   href:"https://willard.co.za/battery-selection-tool/"},
                  {label:"VARTA",     icon:"⚡", color:"#6366f1", bg:"rgba(99,102,241,.11)",  href:"https://www.varta-automotive.com/battery-finder"},
                  {label:"Safeline",  icon:"🛑", color:"#dc2626", bg:"rgba(220,38,38,.09)",   href:"https://safelinebrakes.co.za/"},
                  {label:"AutoZone",  icon:"🔴", color:"#dc2626", bg:"rgba(220,38,38,.12)",   href:`https://www.autozoneonline.co.za/t/index?q=${encodeURIComponent(req.vin)}`},
                  {label:"Amayama",   icon:"🔧", color:"#0ea5e9", bg:"rgba(14,165,233,.12)",  href:`https://www.amayama.com/search/?q=${encodeURIComponent(req.vin)}`},
                  {label:"WolfOil",   icon:"🛢️", color:"#f97316", bg:"rgba(249,115,22,.12)",  href:"https://za.wolfoil.com/en-us/oil-finder"},
                ].map(lk=>(
                  <a key={lk.label} href={lk.href} target="_blank" rel="noopener noreferrer"
                    onClick={lk.copyVin?()=>navigator.clipboard.writeText(req.vin):undefined}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                      background:lk.bg,border:`1px solid ${lk.color}44`,borderRadius:10,
                      color:lk.color,textDecoration:"none",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                    <span style={{fontSize:20}}>{lk.icon}</span>
                    <span>{lk.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ORDERED: Fulfil panel ───────────────────────────────────── */}
      {req.status==="ordered"&&(()=>{
        const Cs=C();
        const dispatchMsg=`✅ *Dispatched — ${settings.shop_name||"Spare Shop"}*\n\n🚗 ${req.job_car||"—"}\n\n*Parts dispatching now:*\n`+
          reqItems.map((item,i)=>{const r=existingReply[i]||{};return `• ${r.part_name||item.description}${item.sku?` [${item.sku}]`:""} ×${item.qty||1}${r.price?` @ ${Cs}${r.price}`:""}`}).join("\n")+
          `\n\nParts are on their way — please confirm receipt. 🚚`;
        const getSupPartNo=(partId)=>{
          if(!chosenSupplier||!partId) return null;
          return partSupLinks.find(ps=>ps.part_id===partId&&ps.supplier_id===chosenSupplier.id)?.supplier_part_no||null;
        };
        const supplierMsg=`🛒 *Purchase Order — ${settings.shop_name||"Spare Shop"}*\n\nKindly supply the following:\n\n`+
          reqItems.map((item,i)=>{
            const r=existingReply[i]||{};
            const supPn=getSupPartNo(r.part_id);
            const ref=supPn?`[Ref: ${supPn}]`:item.sku?`[SKU: ${item.sku}]`:"";
            return `• ${r.part_name||item.description}${ref?` ${ref}`:""} ×${item.qty||1}`;
          }).join("\n")+
          `\n\nVehicle: ${req.job_car||"—"}\n\nPlease confirm price & availability.`;
        const supPhone=(chosenSupplier?.phone||"").replace(/\D/g,"");
        const workshopPhone=(req.workshop_phone||"").replace(/\D/g,"");
        return (
          <div style={{marginBottom:20}}>
            {/* Order summary */}
            <div style={{padding:14,borderRadius:12,background:"rgba(22,163,74,.07)",border:"1.5px solid rgba(22,163,74,.25)",marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:13,color:"#16a34a",marginBottom:10}}>🛒 Confirmed Order — {reqItems.length} part{reqItems.length!==1?"s":""}</div>
              {reqItems.map((item,i)=>{
                const r=existingReply[i]||{};
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<reqItems.length-1?"1px solid rgba(22,163,74,.15)":"none"}}>
                    {r.part_photo&&<img src={toImgUrl(r.part_photo)} alt="" style={{width:40,height:40,objectFit:"cover",borderRadius:6,flexShrink:0,border:"1px solid var(--border)"}}/>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>{r.part_name||item.description}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:2}}>
                        {item.sku&&<code style={{fontSize:10,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{item.sku}</code>}
                        {(()=>{const spn=getSupPartNo(r.part_id);return spn?<code style={{fontSize:10,color:"#f59e0b",fontFamily:"DM Mono,monospace",background:"rgba(245,158,11,.1)",padding:"1px 4px",borderRadius:3}}>Sup: {spn}</code>:null;})()}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)"}}>{r.price?`${Cs}${r.price}`:"—"}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>×{item.qty||1}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action cards */}
            <div style={{fontWeight:700,fontSize:12,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>What will you do?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* 1 — Dispatch from stock */}
              <div style={{padding:14,borderRadius:12,background:"rgba(52,211,153,.07)",border:"1.5px solid rgba(52,211,153,.25)"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#34d399",marginBottom:6}}>📦 I have it — Dispatch from stock</div>
                <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Send a WhatsApp to the workshop confirming the parts are on their way.</div>
                <div style={{display:"flex",gap:8}}>
                  {workshopPhone?(
                    <a href={`https://wa.me/${workshopPhone}?text=${encodeURIComponent(dispatchMsg)}`} target="_blank" rel="noreferrer"
                      style={{flex:1,padding:"10px",borderRadius:9,background:"#25D366",color:"#fff",fontWeight:700,fontSize:13,textDecoration:"none",textAlign:"center"}}>
                      💬 WhatsApp Workshop
                    </a>
                  ):(
                    <div style={{fontSize:12,color:"var(--red)"}}>No workshop phone on record.</div>
                  )}
                </div>
              </div>

              {/* 2 — Order from supplier */}
              <div style={{padding:14,borderRadius:12,background:"rgba(96,165,250,.07)",border:"1.5px solid rgba(96,165,250,.25)"}}>
                <div style={{fontWeight:700,fontSize:13,color:"var(--blue)",marginBottom:6}}>🏭 Order from Supplier</div>
                <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Enter your supplier's WhatsApp number to send them a purchase order.</div>
                {showSupplier?(
                  <>
                    {/* Search */}
                    <input className="inp" placeholder="🔍 Search suppliers…" value={supplierSearch}
                      onChange={e=>setSupplierSearch(e.target.value)}
                      style={{fontSize:12,marginBottom:8,width:"100%"}}/>
                    {localSuppliers.length===0?(
                      <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>No suppliers found. Add suppliers in the Procurement tab.</div>
                    ):(()=>{
                      const filtered=localSuppliers.filter(s=>!supplierSearch||(s.name+"|"+(s.contact_person||"")).toLowerCase().includes(supplierSearch.toLowerCase()));
                      return (
                        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8,maxHeight:280,overflowY:"auto"}}>
                          {filtered.map(s=>{
                            const hasPhone=!!(s.phone||"").trim();
                            const isChosen=chosenSupplier?.id===s.id;
                            const isAdding=addingPhone===s.id;
                            return (
                              <div key={s.id} style={{borderRadius:9,border:`1.5px solid ${isChosen?"rgba(96,165,250,.6)":"var(--border)"}`,background:isChosen?"rgba(96,165,250,.08)":"var(--surface2)",overflow:"hidden"}}>
                                <div onClick={()=>hasPhone&&setChosenSupplier(isChosen?null:s)}
                                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:hasPhone?"pointer":"default"}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                                    {s.contact_person&&<div style={{fontSize:11,color:"var(--text3)"}}>{s.contact_person}</div>}
                                  </div>
                                  {hasPhone?(
                                    <>
                                      <div style={{fontSize:12,color:"var(--text3)",flexShrink:0}}>{s.phone}</div>
                                      {isChosen&&<span style={{fontSize:16,color:"var(--blue)"}}>✓</span>}
                                    </>
                                  ):(
                                    <button onClick={e=>{e.stopPropagation();setAddingPhone(isAdding?null:s.id);setAddPhoneVal("");}}
                                      style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"1px dashed rgba(96,165,250,.5)",background:"rgba(96,165,250,.07)",color:"var(--blue)",cursor:"pointer",flexShrink:0}}>
                                      + Add WhatsApp
                                    </button>
                                  )}
                                </div>
                                {isAdding&&(
                                  <div style={{padding:"8px 12px",borderTop:"1px solid var(--border)",background:"var(--surface)"}}>
                                    <div style={{display:"flex",gap:6}}>
                                      <input className="inp" type="tel" placeholder="WhatsApp number"
                                        value={addPhoneVal} onChange={e=>setAddPhoneVal(e.target.value)}
                                        style={{flex:1,fontSize:12}}/>
                                      <button onClick={async()=>{
                                        if(!addPhoneVal.trim()) return;
                                        setAddPhoneSaving(true);
                                        try{
                                          await api.patch("suppliers",`id=eq.${s.id}`,{phone:addPhoneVal.trim()});
                                          setLocalSuppliers(ls=>ls.map(x=>x.id===s.id?{...x,phone:addPhoneVal.trim()}:x));
                                          setAddingPhone(null);
                                        }finally{setAddPhoneSaving(false);}
                                      }} disabled={addPhoneSaving||!addPhoneVal.trim()}
                                        style={{padding:"6px 12px",borderRadius:7,border:"none",background:"var(--blue)",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",opacity:addPhoneSaving||!addPhoneVal.trim()?0.5:1}}>
                                        {addPhoneSaving?"…":"Save"}
                                      </button>
                                      <button onClick={()=>setAddingPhone(null)}
                                        style={{padding:"6px 10px",borderRadius:7,border:"1px solid var(--border)",background:"none",cursor:"pointer",fontSize:12}}>✕</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {filtered.length===0&&<div style={{fontSize:12,color:"var(--text3)",padding:"8px 4px"}}>No suppliers match "{supplierSearch}"</div>}
                        </div>
                      );
                    })()}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setShowSupplier(false);setChosenSupplier(null);setSupplierSearch("");}}
                        style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid var(--border)",background:"none",cursor:"pointer",fontSize:12}}>Cancel</button>
                      {supPhone?(
                        <a href={`https://wa.me/${supPhone}?text=${encodeURIComponent(supplierMsg)}`} target="_blank" rel="noreferrer"
                          style={{flex:2,padding:"9px",borderRadius:8,background:"#25D366",color:"#fff",fontWeight:700,fontSize:13,textDecoration:"none",textAlign:"center"}}>
                          💬 WhatsApp {chosenSupplier?.name}
                        </a>
                      ):(
                        <button disabled style={{flex:2,padding:"9px",borderRadius:8,border:"none",background:"var(--border)",color:"var(--text3)",fontWeight:700,fontSize:13,cursor:"not-allowed"}}>
                          Select a supplier
                        </button>
                      )}
                    </div>
                  </>
                ):(
                  <button onClick={()=>setShowSupplier(true)}
                    style={{padding:"9px 18px",borderRadius:9,border:"1px solid rgba(96,165,250,.4)",background:"rgba(96,165,250,.1)",color:"var(--blue)",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    🏭 Order from Supplier
                  </button>
                )}
              </div>

              {/* 3 — Escalate to main (rendered below in existing section) */}
            </div>
          </div>
        );
      })()}

      {/* Parts list + Reply form — shown only for non-ordered requests */}
      {req.status!=="ordered"&&<><div style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:13,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>
          Parts Needed ({reqItems.length})
        </div>
        {replyLines.map((line,idx)=>{
          const reqItem=reqItems[idx]||{};
          const linkedPart=line.part_id?parts.find(p=>String(p.id)===String(line.part_id)):null;
          const linkedPartPhoto=linkedPart?.image_url||"";
          const reqPhoto=reqItem.photo_url||"";
          const results=searchResults(idx);
          const isCreating=creating===idx;

          return (
            <div key={idx} style={{marginBottom:14,padding:14,borderRadius:12,border:"1px solid var(--border)",background:"var(--surface2)"}}>
              {/* Part header row */}
              <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
                {/* Workshop photo (if sent) */}
                {reqPhoto&&(
                  <img src={toImgUrl(reqPhoto)} alt="" onClick={()=>setLightbox(reqPhoto)}
                    style={{width:64,height:64,objectFit:"cover",borderRadius:8,cursor:"pointer",flexShrink:0,border:"1px solid var(--border)"}}/>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{reqItem.description||line.description}</div>
                  {reqItem.sku&&<code style={{fontSize:11,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{reqItem.sku}</code>}
                  <div style={{fontSize:11,color:"var(--text3)"}}>Qty needed: {line.qty}</div>
                </div>
                {/* Linked part photo */}
                {linkedPart&&linkedPartPhoto&&(
                  <img src={toImgUrl(linkedPartPhoto)} alt=""
                    onClick={()=>setLightbox(linkedPartPhoto)}
                    style={{width:56,height:56,objectFit:"cover",borderRadius:8,cursor:"zoom-in",flexShrink:0,border:"2px solid var(--accent)"}}/>
                )}
              </div>

              {/* Linked part chip */}
              {linkedPart&&(
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,padding:"6px 10px",background:"rgba(52,211,153,.1)",borderRadius:8,border:"1px solid rgba(52,211,153,.25)"}}>
                  <span style={{fontSize:12,color:"#34d399",flex:1}}>✅ Linked: <strong>{linkedPart.name}</strong>{linkedPart.sku?` · ${linkedPart.sku}`:""}</span>
                  <span style={{fontSize:12,fontWeight:700,padding:"2px 8px",borderRadius:6,
                    background:linkedPart.stock>0?"rgba(52,211,153,.2)":"rgba(239,68,68,.12)",
                    color:linkedPart.stock>0?"#34d399":"#ef4444"}}>
                    {linkedPart.stock>0?`${linkedPart.stock} in stock`:"Out of stock"}
                  </span>
                  {onSendInquiry&&<button onClick={()=>setRfqPart(linkedPart)} title="Request price/stock from suppliers"
                    style={{background:"none",border:"1px solid rgba(96,165,250,.4)",borderRadius:6,cursor:"pointer",color:"var(--blue)",fontSize:11,padding:"2px 8px"}}>📩 Ask Suppliers</button>}
                  {userRole==="admin"&&onEditPart&&<button onClick={()=>onEditPart(linkedPart)} title="Edit this part"
                    style={{background:"none",border:"1px solid var(--border2)",borderRadius:6,cursor:"pointer",color:"var(--text2)",fontSize:11,padding:"2px 8px"}}>✏️ Edit Part</button>}
                  <button onClick={()=>updateLine(idx,{part_id:null})} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:13,padding:"0 2px"}}>✕</button>
                </div>
              )}

              {/* Search inventory */}
              {!linkedPart&&!isCreating&&(
                <div style={{marginBottom:8,position:"relative"}}>
                  <input className="inp" placeholder="🔍 Search inventory by name or SKU…"
                    value={partSearch[idx]||""} onChange={e=>setPartSearch(p=>({...p,[idx]:e.target.value}))}
                    style={{fontSize:12}}/>
                  {results.length>0&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:99,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.25)",maxHeight:200,overflowY:"auto"}}>
                      {results.map(p=>{
                        const ph=(() => {try{return JSON.parse(p.photos||"[]");}catch{return [];}})();
                        return (
                          <div key={p.id} onClick={()=>pickPart(idx,p)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer",borderBottom:"1px solid var(--border2)"}}>
                            {(ph[0]||p.photo_url)&&<img src={toImgUrl(ph[0]||p.photo_url)} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:4,flexShrink:0}}/>}
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                              <div style={{fontSize:10,color:"var(--text3)"}}>{p.sku||""} · {C()}{fmtAmt(p.price)}</div>
                            </div>
                            <span style={{fontSize:11,color:p.stock>0?"#34d399":"var(--red)",fontWeight:600}}>{p.stock>0?`In stock (${p.stock})`:"Out"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Create new part inline */}
              {!linkedPart&&!isCreating&&(
                <button onClick={()=>{setCreating(idx);setNewPart({name:reqItem.description||"",sku:reqItem.sku||"",cost:"",price:""}); setPartSearch(p=>({...p,[idx]:""}));}}
                  style={{fontSize:11,color:"var(--blue)",background:"none",border:"1px dashed rgba(96,165,250,.4)",borderRadius:6,padding:"4px 10px",cursor:"pointer",marginBottom:8}}>
                  ➕ Create new part in inventory
                </button>
              )}

              {isCreating&&(
                <div style={{padding:10,background:"rgba(96,165,250,.07)",borderRadius:8,border:"1px solid rgba(96,165,250,.25)",marginBottom:8}}>
                  <div style={{fontWeight:600,fontSize:12,color:"var(--blue)",marginBottom:8}}>New Part</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Name *</div>
                      <input className="inp" value={newPart.name} onChange={e=>setNewPart(p=>({...p,name:e.target.value}))} placeholder="Part name" style={{fontSize:12}}/></div>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>SKU / OE Number</div>
                      <input className="inp" value={newPart.sku} onChange={e=>setNewPart(p=>({...p,sku:e.target.value}))} placeholder="Optional" style={{fontSize:12}}/></div>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Cost</div>
                      <input className="inp" type="number" value={newPart.cost} onChange={e=>setNewPart(p=>({...p,cost:e.target.value}))} placeholder="0" style={{fontSize:12}}/></div>
                    <div><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Sell Price *</div>
                      <input className="inp" type="number" value={newPart.price} onChange={e=>setNewPart(p=>({...p,price:e.target.value}))} placeholder="0" style={{fontSize:12}}/></div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setCreating(null)} style={{flex:1,padding:"6px",borderRadius:6,border:"1px solid var(--border)",background:"none",cursor:"pointer",fontSize:11}}>Cancel</button>
                    <button onClick={()=>handleCreatePart(idx)} disabled={createSaving||!newPart.name.trim()||!newPart.price}
                      style={{flex:2,padding:"6px",borderRadius:6,border:"none",background:"var(--blue)",color:"#fff",cursor:"pointer",fontWeight:600,fontSize:11,opacity:createSaving||!newPart.name.trim()||!newPart.price?0.5:1}}>
                      {createSaving?"Saving…":"✅ Create & Link"}
                    </button>
                  </div>
                </div>
              )}

              {/* Reply fields: price + availability + notes */}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                  <input type="checkbox" checked={line.available} onChange={e=>updateLine(idx,{available:e.target.checked})} style={{accentColor:"#34d399",width:14,height:14}}/>
                  <span style={{fontSize:11,fontWeight:600,color:line.available?"#34d399":"var(--red)"}}>
                    {line.available?"✅ Available":"❌ Not available"}
                  </span>
                </label>
                <input className="inp" type="number" min="0" step="0.01"
                  value={line.price} onChange={e=>updateLine(idx,{price:e.target.value})}
                  placeholder="Price" disabled={!line.available}
                  style={{width:110,fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,opacity:line.available?1:0.4}}/>
                <input className="inp" value={line.notes} onChange={e=>updateLine(idx,{notes:e.target.value})}
                  placeholder="Note (condition, ETA…)" style={{flex:1,minWidth:140,fontSize:12}}/>
              </div>
              {/* Fulfill source decision */}
              {line.available&&(
                <div style={{display:"flex",gap:6,marginTop:8,alignItems:"center"}}>
                  <span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Fulfill from:</span>
                  <button onClick={()=>updateLine(idx,{source:line.source==="stock"?null:"stock"})}
                    style={{padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",
                      background:line.source==="stock"?"rgba(52,211,153,.2)":"var(--surface)",
                      outline:line.source==="stock"?"2px solid rgba(52,211,153,.5)":"1px solid var(--border)",
                      color:line.source==="stock"?"#34d399":"var(--text3)"}}>
                    📦 Main Stock
                  </button>
                  <button onClick={()=>updateLine(idx,{source:line.source==="supplier"?null:"supplier"})}
                    style={{padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",
                      background:line.source==="supplier"?"rgba(96,165,250,.2)":"var(--surface)",
                      outline:line.source==="supplier"?"2px solid rgba(96,165,250,.5)":"1px solid var(--border)",
                      color:line.source==="supplier"?"var(--blue)":"var(--text3)"}}>
                    🏭 Local Supplier
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reply notes + send */}
      <div style={{padding:16,background:"var(--surface2)",borderRadius:12,border:"1px solid var(--border)"}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Reply Notes (optional)</div>
        <textarea className="inp" rows={2} value={replyNotes} onChange={e=>setReplyNotes(e.target.value)}
          placeholder="Overall notes for workshop…" style={{width:"100%",resize:"vertical",marginBottom:12}}/>
        <div style={{display:"flex",gap:8}}>
          {workshopPhone&&(
            <a href={`https://wa.me/${workshopPhone.replace(/\D/g,"")}?text=${encodeURIComponent(waMsg)}`}
              target="_blank" rel="noreferrer"
              style={{padding:"10px 16px",borderRadius:10,background:"#25D366",color:"#fff",fontWeight:700,fontSize:13,textDecoration:"none",display:"flex",alignItems:"center",gap:6}}>
              💬 Send via WhatsApp
            </a>
          )}
          <button onClick={handleReply} disabled={saving}
            style={{flex:1,padding:"10px 16px",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:13,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1}}>
            {saving?"Sending…":"✅ Send Reply to Workshop"}
          </button>
        </div>
      </div>
      </> }

      {/* ── ESCALATION SECTION (pending or ordered requests) ───────── */}
      {(req.status==="pending"||req.status==="ordered")&&onEscalate&&(
        <div style={{marginTop:req.status==="ordered"?10:14,padding:14,background:"rgba(96,165,250,.05)",border:"1px dashed rgba(96,165,250,.35)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:13,color:"var(--blue)",marginBottom:8}}>
            {req.status==="ordered"?"⬆️ Request from Main Branch":"⬆️ Parts not available? Escalate to Main Stock"}
          </div>
          {showEscalate?(
            <>
              <button type="button" onClick={()=>setEscalateNotes("International supplier only — needs Head Office to source.")}
                style={{marginBottom:8,padding:"5px 10px",borderRadius:7,border:"1px solid rgba(96,165,250,.35)",background:"rgba(96,165,250,.08)",color:"var(--blue)",fontWeight:600,fontSize:11,cursor:"pointer"}}>
                🌍 International supplier
              </button>
              <textarea className="inp" rows={2} value={escalateNotes} onChange={e=>setEscalateNotes(e.target.value)}
                placeholder="Reason for escalating — e.g. 'Not in local stock, need main to source this'"
                style={{width:"100%",resize:"vertical",marginBottom:8,fontSize:12}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowEscalate(false)}
                  style={{flex:1,padding:"8px",borderRadius:8,border:"1px solid var(--border)",background:"none",cursor:"pointer",fontSize:12}}>Cancel</button>
                <button onClick={handleEscalate} disabled={escalateSaving||!escalateNotes.trim()}
                  style={{flex:2,padding:"8px",borderRadius:8,border:"none",background:"var(--blue)",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",opacity:escalateSaving||!escalateNotes.trim()?0.5:1}}>
                  {escalateSaving?"Sending…":"⬆️ Send to Main Stock"}
                </button>
              </div>
            </>
          ):(
            <button onClick={()=>setShowEscalate(true)}
              style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(96,165,250,.4)",background:"rgba(96,165,250,.08)",color:"var(--blue)",fontWeight:700,fontSize:12,cursor:"pointer"}}>
              ⬆️ Escalate to Main Stock
            </button>
          )}
        </div>
      )}

      {/* ── ESCALATED STATUS BANNER (spare shop sees while waiting) ──────── */}
      {req.status==="escalated"&&(
        <div style={{marginTop:14,padding:14,background:"rgba(96,165,250,.07)",border:"1.5px solid rgba(96,165,250,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:13,color:"var(--blue)",marginBottom:6}}>⬆️ Escalated to Main Stock</div>
          {req.escalate_notes&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:10,padding:"6px 10px",background:"var(--surface2)",borderRadius:7}}>📝 Note: {req.escalate_notes}</div>}
          {isAdminOrManager&&onMainReply?(
            <>
              <div style={{fontWeight:700,fontSize:12,color:"var(--text2)",marginBottom:8}}>📦 Main Stock Reply</div>
              {mainReplyLines.map((line,idx)=>(
                <div key={idx} style={{marginBottom:10,padding:10,borderRadius:8,border:"1px solid var(--border)",background:"var(--surface2)"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{line.description}{line.sku&&<code style={{fontSize:10,color:"var(--blue)",marginLeft:6,fontFamily:"DM Mono,monospace"}}>{line.sku}</code>}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                      <input type="checkbox" checked={line.available} onChange={e=>updateMainLine(idx,{available:e.target.checked})} style={{accentColor:"#34d399",width:14,height:14}}/>
                      <span style={{fontSize:11,fontWeight:600,color:line.available?"#34d399":"var(--red)"}}>{line.available?"✅ Available":"❌ Not available"}</span>
                    </label>
                    <input className="inp" type="number" min="0" step="0.01" value={line.price}
                      onChange={e=>updateMainLine(idx,{price:e.target.value})} placeholder="Price"
                      disabled={!line.available}
                      style={{width:110,fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,opacity:line.available?1:0.4}}/>
                    <input className="inp" value={line.notes} onChange={e=>updateMainLine(idx,{notes:e.target.value})}
                      placeholder="Note / ETA / source…" style={{flex:1,minWidth:140,fontSize:12}}/>
                  </div>
                </div>
              ))}
              <textarea className="inp" rows={2} value={mainReplyNotes} onChange={e=>setMainReplyNotes(e.target.value)}
                placeholder="Overall notes for spare shop & workshop…" style={{width:"100%",resize:"vertical",marginBottom:10,fontSize:12}}/>
              <button onClick={handleMainReply} disabled={mainReplySaving}
                style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:"var(--blue)",color:"#fff",fontWeight:700,fontSize:13,cursor:mainReplySaving?"not-allowed":"pointer",opacity:mainReplySaving?0.7:1}}>
                {mainReplySaving?"Sending…":"📦 Send Main Stock Reply"}
              </button>
            </>
          ):(
            <div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic"}}>⏳ Waiting for Main Stock to respond…</div>
          )}
        </div>
      )}

      {/* ── MAIN STOCK REPLY DISPLAY (both spare shop + workshop can see) ── */}
      {(req.status==="main_replied"||existingMainReply.length>0)&&(
        <div style={{marginTop:14,padding:14,background:"rgba(52,211,153,.06)",border:"1.5px solid rgba(52,211,153,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:13,color:"#34d399",marginBottom:8}}>📦 Main Stock Reply</div>
          {req.escalate_notes&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>Spare shop note: {req.escalate_notes}</div>}
          {existingMainReply.map((item,idx)=>(
            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"var(--surface2)",borderRadius:7,marginBottom:4,gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600}}>{item.description}{item.sku&&<code style={{fontSize:10,color:"var(--blue)",marginLeft:6,fontFamily:"DM Mono,monospace"}}>{item.sku}</code>}</span>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                  background:item.available?"rgba(52,211,153,.15)":"rgba(239,68,68,.12)",
                  color:item.available?"#34d399":"#ef4444"}}>
                  {item.available?"✅ Available":"❌ Not available"}
                </span>
                {item.available&&item.price>0&&<span style={{fontSize:13,fontWeight:700,color:"var(--accent)"}}>{C()}{fmtAmt(item.price)}</span>}
                {item.notes&&<span style={{fontSize:11,color:"var(--text3)"}}>({item.notes})</span>}
              </div>
            </div>
          ))}
          {req.main_reply_notes&&<div style={{fontSize:12,color:"var(--text2)",marginTop:6,padding:"6px 10px",background:"var(--surface2)",borderRadius:7}}>📝 {req.main_reply_notes}</div>}
          {/* Allow admin to revise the main reply */}
          {req.status==="main_replied"&&isAdminOrManager&&onMainReply&&(
            <details style={{marginTop:10}}>
              <summary style={{fontSize:11,color:"var(--text3)",cursor:"pointer"}}>✏️ Revise Main Stock Reply</summary>
              <div style={{marginTop:8}}>
                {mainReplyLines.map((line,idx)=>(
                  <div key={idx} style={{marginBottom:8,padding:8,borderRadius:7,border:"1px solid var(--border)",background:"var(--surface)"}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>{line.description}</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                      <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                        <input type="checkbox" checked={line.available} onChange={e=>updateMainLine(idx,{available:e.target.checked})} style={{accentColor:"#34d399",width:13,height:13}}/>
                        <span style={{fontSize:11,color:line.available?"#34d399":"var(--red)",fontWeight:600}}>{line.available?"✅":"❌"}</span>
                      </label>
                      <input className="inp" type="number" min="0" step="0.01" value={line.price} onChange={e=>updateMainLine(idx,{price:e.target.value})} placeholder="Price" disabled={!line.available} style={{width:90,fontSize:12,opacity:line.available?1:0.4}}/>
                      <input className="inp" value={line.notes} onChange={e=>updateMainLine(idx,{notes:e.target.value})} placeholder="Note…" style={{flex:1,fontSize:11}}/>
                    </div>
                  </div>
                ))}
                <textarea className="inp" rows={1} value={mainReplyNotes} onChange={e=>setMainReplyNotes(e.target.value)} placeholder="Notes…" style={{width:"100%",resize:"vertical",marginBottom:8,fontSize:11}}/>
                <button onClick={handleMainReply} disabled={mainReplySaving} style={{width:"100%",padding:"7px",borderRadius:8,border:"none",background:"var(--blue)",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",opacity:mainReplySaving?0.7:1}}>
                  {mainReplySaving?"Saving…":"📦 Update Main Reply"}
                </button>
              </div>
            </details>
          )}
        </div>
      )}

      {lightbox&&<ImgLightbox url={toImgUrl(lightbox)} onClose={()=>setLightbox(null)}/>}

      {rfqPart&&onSendInquiry&&<InquiryModal part={rfqPart} suppliers={suppliers} partSuppliers={partSuppliers.filter(ps=>ps.part_id===rfqPart.id)} inquiries={inquiries}
        onSend={async(data)=>{await onSendInquiry(data);}} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onClose={()=>setRfqPart(null)} t={t} isAdmin={userRole==="admin"} onEditPart={onEditPart}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRINT SHELF LABEL MODAL
// ═══════════════════════════════════════════════════════════════
export function PrintShelfLabelModal({settings,onClose}) {
  const [binName,setBinName]=useState("");
  const [description,setDescription]=useState("");

  const handlePrint=()=>{
    openShelfLabelWindow({binName,description},{
      widthMm:settings?.shelf_label_w||70,
      heightMm:settings?.shelf_label_h||45,
    });
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="📋 Print Shelf Label" onClose={onClose}/>
      <FD><FL label="Shelf / Bin Name *"/><input className="inp" value={binName} onChange={e=>setBinName(e.target.value)} placeholder="e.g. A1-02"/></FD>
      <FD><FL label="Description (optional)"/><input className="inp" value={description} onChange={e=>setDescription(e.target.value)} placeholder="e.g. Engine Parts"/></FD>
      <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>
        Label size: {settings?.shelf_label_w||70}×{settings?.shelf_label_h||45}mm · Change in ⚙️ Settings → Inventory
      </div>
      {binName&&(
        <div style={{marginTop:12,background:"var(--surface2)",borderRadius:8,border:"1px solid var(--border)",padding:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,border:"2px solid var(--text)",borderRadius:6,overflow:"hidden",background:"#fff"}}>
            <div style={{width:48,height:48,flexShrink:0,background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",borderRight:"2px solid var(--text)",fontSize:22}}>▦</div>
            <div style={{flex:1,padding:"4px 8px"}}>
              <div style={{fontFamily:"DM Mono,monospace",fontWeight:900,fontSize:22,letterSpacing:2,color:"#111",lineHeight:1}}>{binName}</div>
              {description&&<div style={{fontSize:11,color:"#555",marginTop:3,textTransform:"uppercase",letterSpacing:".05em"}}>{description}</div>}
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:6,textAlign:"center"}}>Preview (QR code generates at print time)</div>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handlePrint} disabled={!binName.trim()}>🖨️ Open Print Window</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// AD CONTRACTS PAGE
// ═══════════════════════════════════════════════════════════════
export function AdContractsPage({ads=[],adContracts=[],onSaveContract,onDeleteContract}) {
  const BLANK={advertiser_name:"",advertiser_contact:"",amount:"",currency:"ZAR",start_date:"",end_date:"",status:"active",payment_status:"unpaid",amount_paid:"",notes:""};
  const expiredContracts=adContracts.filter(c=>(c.end_date&&c.end_date<new Date().toISOString().slice(0,10)&&c.status==="active"));
  const [form,setForm]=useState(BLANK);
  const [editingId,setEditingId]=useState(null);
  const [expanded,setExpanded]=useState(null);
  const [contractClicks,setContractClicks]=useState([]);
  const [clicksLoading,setClicksLoading]=useState(false);
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));

  const startEdit=(c)=>{setForm({...c,amount:c.amount||"",amount_paid:c.amount_paid||""});setEditingId(c.id);setExpanded(null);};
  const cancel=()=>{setForm(BLANK);setEditingId(null);};
  const submit=async()=>{
    if(!form.advertiser_name.trim())return;
    const clean={
      ...form,
      amount: form.amount===''?0:+form.amount,
      amount_paid: form.amount_paid===''?0:+form.amount_paid,
      start_date: form.start_date||null,
      end_date: form.end_date||null,
    };
    await onSaveContract(editingId?{...clean,id:editingId}:clean);
    cancel();
  };

  const toggleExpand=async(c)=>{
    if(expanded===c.id){setExpanded(null);setContractClicks([]);return;}
    setExpanded(c.id);
    const adIds=ads.filter(a=>String(a.contract_id)===String(c.id)).map(a=>a.id);
    if(!adIds.length){setContractClicks([]);return;}
    setClicksLoading(true);
    try{
      const r=await api.get("ad_clicks",`ad_id=in.(${adIds.join(',')})&select=*&order=clicked_at.desc`);
      setContractClicks(Array.isArray(r)?r:[]);
    }catch{setContractClicks([]);}
    finally{setClicksLoading(false);}
  };

  const STATUS_COLOR={active:"var(--green)",expired:"var(--text3)",draft:"var(--yellow)",cancelled:"var(--red)"};
  const PAY_COLOR={paid:"var(--green)",partial:"var(--yellow)",unpaid:"var(--red)"};
  const today=new Date().toISOString().slice(0,10);

  return (
    <div className="fu">
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:18}}>📑 Ad Contracts</h1>

      {/* Form */}
      <div style={{background:"var(--surface2)",borderRadius:12,padding:16,marginBottom:20,border:"1px solid var(--border)"}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{editingId?"✏️ Edit Contract":"➕ New Contract"}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Advertiser Name *</div>
            <input className="inp" value={form.advertiser_name} onChange={e=>f("advertiser_name",e.target.value)} placeholder="e.g. Oscar Lubricants"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Contact</div>
            <input className="inp" value={form.advertiser_contact} onChange={e=>f("advertiser_contact",e.target.value)} placeholder="email or phone"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6}}>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Contract Amount</div>
              <input className="inp" type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="0"/>
            </div>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Currency</div>
              <select className="inp" value={form.currency} onChange={e=>f("currency",e.target.value)}>
                <option value="ZAR">ZAR</option>
                <option value="USD">USD</option>
                <option value="TWD">TWD</option>
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Start Date</div>
              <input className="inp" type="date" value={form.start_date} onChange={e=>f("start_date",e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>End Date</div>
              <input className="inp" type="date" value={form.end_date} onChange={e=>f("end_date",e.target.value)}/>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Status</div>
            <select className="inp" value={form.status} onChange={e=>f("status",e.target.value)}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Payment</div>
              <select className="inp" value={form.payment_status} onChange={e=>f("payment_status",e.target.value)}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Amount Paid</div>
              <input className="inp" type="number" value={form.amount_paid} onChange={e=>f("amount_paid",e.target.value)} placeholder="0"/>
            </div>
          </div>
          <div style={{gridColumn:"span 2"}}>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Notes</div>
            <input className="inp" value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Optional notes"/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          {editingId&&<button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>}
          <button className="btn btn-primary" onClick={submit} disabled={!form.advertiser_name.trim()}>
            {editingId?"💾 Save Changes":"➕ Add Contract"}
          </button>
        </div>
      </div>

      {/* Expired alert */}
      {expiredContracts.length>0&&(
        <div style={{marginBottom:16,padding:"12px 16px",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.4)",borderRadius:10,fontSize:13}}>
          ⚠️ <strong>{expiredContracts.length} contract{expiredContracts.length!==1?"s":""} expired</strong> — linked ads are now hidden from all pages.{" "}
          {expiredContracts.map(c=><span key={c.id} style={{marginLeft:8,fontWeight:600,color:"var(--red)"}}>{c.advertiser_name}</span>)}
          <span style={{marginLeft:8,color:"var(--text3)"}}>Edit the contract to extend the end date and reactivate.</span>
        </div>
      )}

      {/* Contract list */}
      {adContracts.length===0
        ? <div style={{textAlign:"center",padding:48,color:"var(--text3)",fontSize:14}}>No contracts yet — add your first above.</div>
        : <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {adContracts.map(c=>{
              const linkedAds=ads.filter(a=>String(a.contract_id)===String(c.id));
              const isExpanded=expanded===c.id;
              const isExpired=c.end_date&&c.end_date<today;
              const pct=c.amount>0?Math.min(100,Math.round((+c.amount_paid/+c.amount)*100)):0;
              return (
                <div key={c.id} style={{background:"var(--surface)",border:`1px solid ${isExpired?"rgba(248,113,113,.5)":"var(--border)"}`,borderRadius:12,overflow:"hidden",opacity:isExpired?.75:1}}>
                  <div style={{padding:"14px 16px",display:"flex",gap:12,alignItems:"center"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{c.advertiser_name}</div>
                      <div style={{fontSize:12,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                        {c.start_date&&c.end_date&&<span>{c.start_date} → {c.end_date}{isExpired?" ⚠️":""}</span>}
                        <span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{c.currency} {(+c.amount||0).toLocaleString()}</span>
                        <span style={{padding:"1px 8px",borderRadius:5,fontSize:11,fontWeight:700,background:`${STATUS_COLOR[c.status]}22`,color:STATUS_COLOR[c.status]}}>{c.status}</span>
                        <span style={{padding:"1px 8px",borderRadius:5,fontSize:11,fontWeight:700,background:`${PAY_COLOR[c.payment_status]}22`,color:PAY_COLOR[c.payment_status]}}>{c.payment_status}</span>
                        <span style={{color:"var(--text3)"}}>{linkedAds.length} ad{linkedAds.length!==1?"s":""}</span>
                      </div>
                      {c.amount>0&&(
                        <div style={{marginTop:8,height:4,borderRadius:2,background:"var(--border)",overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:pct>=100?"var(--green)":"var(--accent)",borderRadius:2}}/>
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>toggleExpand(c)}>{isExpanded?"▲":"▼"} Details</button>
                      {isExpired&&(
                        <button className="btn btn-sm" style={{background:"var(--accent)",color:"#fff",border:"none"}} onClick={()=>{
                          const d=new Date(c.end_date||today);d.setMonth(d.getMonth()+3);
                          onSaveContract({...c,end_date:d.toISOString().slice(0,10),status:"active"});
                        }}>+3 months</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={()=>startEdit(c)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>onDeleteContract(c.id)}>🗑</button>
                    </div>
                  </div>

                  {isExpanded&&(
                    <div style={{borderTop:"1px solid var(--border)",padding:"14px 16px",background:"var(--surface2)"}}>
                      {/* Linked ads */}
                      <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Linked Ads</div>
                      {linkedAds.length===0
                        ? <div style={{fontSize:13,color:"var(--text3)",marginBottom:14}}>No ads linked yet. Go to Settings → Ads and select this contract on an ad.</div>
                        : <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                            {linkedAds.map(a=>(
                              <div key={a.id} style={{padding:"4px 12px",borderRadius:8,background:"var(--surface)",border:"1px solid var(--border)",fontSize:13}}>
                                {a.title} <span style={{fontSize:11,color:"var(--text3)"}}>{a.page} · {a.position}</span>
                              </div>
                            ))}
                          </div>
                      }

                      {/* Click stats */}
                      <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>
                        Click Analytics {clicksLoading&&"⏳"}
                      </div>
                      {!clicksLoading&&contractClicks.length===0
                        ? <div style={{fontSize:13,color:"var(--text3)"}}>No clicks recorded yet.</div>
                        : !clicksLoading&&(
                          <div>
                            <div style={{display:"flex",gap:16,marginBottom:12}}>
                              <div style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:22,color:"var(--accent)"}}>{contractClicks.length} <span style={{fontSize:13,color:"var(--text3)",fontFamily:"inherit",fontWeight:400}}>total clicks</span></div>
                            </div>
                            <div className="card" style={{overflow:"hidden"}}>
                              <div className="tbl-wrap">
                                <table className="tbl">
                                  <thead><tr>{["Time","Ad","Page","User","City","Country","Weather"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {contractClicks.slice(0,50).map((cl,i)=>(
                                      <tr key={cl.id||i}>
                                        <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(cl.clicked_at).toLocaleString()}</td>
                                        <td style={{fontSize:13,fontWeight:600}}>{cl.ad_title||"—"}</td>
                                        <td style={{fontSize:12}}>{cl.page||"—"}</td>
                                        <td style={{fontSize:13}}>{cl.user_name||"—"}</td>
                                        <td style={{fontSize:13,color:"var(--text3)"}}>{cl.city||"—"}</td>
                                        <td style={{fontSize:13}}>{cl.country||"—"}</td>
                                        <td style={{fontSize:13}}>{cl.weather||"—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            {contractClicks.length>50&&<div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Showing 50 of {contractClicks.length} clicks</div>}
                          </div>
                        )
                      }
                      {c.notes&&<div style={{marginTop:14,fontSize:13,color:"var(--text3)",fontStyle:"italic"}}>📝 {c.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CATALOGUE IMPORT MODAL — multi-step: file → header mapping → review → import
// ═══════════════════════════════════════════════════════════════

const IMPORT_FIELDS = [
  { value: "", label: "(skip)" },
  { value: "supplier_part_no", label: "Supplier Part No" },
  { value: "description", label: "Description" },
  { value: "oem", label: "OEM Number" },
  { value: "application", label: "Application / Fitment" },
  { value: "unit", label: "Unit" },
  { value: "price", label: "Price / Cost" },
];

const CAT_FIELD_HINTS = {
  supplier_part_no: ["our no","part no","part num","item no","item code","article","ref no","sku","part code","no.","our code","supplier part"],
  description: ["desc","name","item name","product","part name","details"],
  oem: ["oem","oe no","original","cross ref","oe number","oem no"],
  application: ["applic","fitment","fit","vehicle","car","model","use for","for model"],
  unit: ["unit","uom","u/m"],
  price: ["price","cost","rate","unit price"],
  image_url: ["image","img","photo","picture","pic url","image url","img url"],
};

function catAutoDetect(headers) {
  const map = {};
  const used = new Set();
  headers.forEach((h, i) => {
    const lower = String(h).toLowerCase().trim();
    for (const [field, hints] of Object.entries(CAT_FIELD_HINTS)) {
      if (!used.has(field) && hints.some(hint => lower.includes(hint))) {
        map[i] = field;
        used.add(field);
        break;
      }
    }
  });
  return map;
}

function parseDelimitedText(text) {
  // Auto-detect: if more tabs than commas on the first line it's TSV (Word/Excel paste)
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = (firstLine.match(/\t/g)||[]).length > (firstLine.match(/,/g)||[]).length ? "\t" : ",";
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (delim === "\t") {
      rows.push(line.split("\t").map(c => c.trim()));
    } else {
      const cells = [];
      let inQ = false, cur = "";
      for (const c of line) {
        if (c === '"') { inQ = !inQ; continue; }
        if (c === ',' && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
        cur += c;
      }
      cells.push(cur.trim());
      rows.push(cells);
    }
  }
  return rows.filter(r => r.some(c => c));
}

const loadXLSX = () => new Promise((resolve, reject) => {
  if (window.XLSX) return resolve(window.XLSX);
  const s = document.createElement('script');
  s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
  s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX load failed'));
  s.onerror = () => reject(new Error('Failed to load Excel parser'));
  document.head.appendChild(s);
});

const loadPDFJS = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) return resolve(window.pdfjsLib);
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => {
    if (!window.pdfjsLib) { reject(new Error('PDF.js failed to load')); return; }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    resolve(window.pdfjsLib);
  };
  s.onerror = () => reject(new Error('Failed to load PDF parser'));
  document.head.appendChild(s);
});

async function extractRowsFromPDF(file) {
  const pdfjsLib = await loadPDFJS();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const allRows = [];
  let colXPositions = null; // determined from the first/widest line (header row)

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const textItems = items
      .filter(i => i.str?.trim())
      .map(i => ({ x: i.transform[4], y: i.transform[5], text: i.str.trim() }));

    if (p === 1 && textItems.length === 0) {
      throw new Error('No text found in this PDF — it appears to be a scanned image. Please convert it to Excel or CSV first using Adobe Acrobat, Smallpdf.com, or ilovepdf.com.');
    }
    if (!textItems.length) continue;

    // Group items into lines by Y coordinate (quantize to 4px buckets)
    const lineMap = new Map();
    for (const item of textItems) {
      const yKey = Math.round(item.y / 4) * 4;
      if (!lineMap.has(yKey)) lineMap.set(yKey, []);
      lineMap.get(yKey).push(item);
    }

    // Sort lines top-to-bottom (PDF Y increases upward so sort descending)
    const lines = [...lineMap.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, it]) => it.sort((a, b) => a.x - b.x));

    // Use the widest line (most distinct X positions) as the column reference
    if (!colXPositions) {
      const widest = lines.reduce((best, l) => l.length > best.length ? l : best, lines[0]);
      colXPositions = widest.map(i => i.x);
    }

    const numCols = colXPositions.length;
    const nearestCol = (x) => colXPositions.reduce(
      (best, cx, i) => Math.abs(x - cx) < Math.abs(x - colXPositions[best]) ? i : best, 0
    );

    // Build row arrays, assigning each item to its nearest column
    const pageRows = [];
    for (const lineItems of lines) {
      const row = new Array(numCols).fill('');
      for (const item of lineItems) {
        const col = nearestCol(item.x);
        row[col] = row[col] ? row[col] + ' ' + item.text : item.text;
      }
      if (row.some(c => c)) pageRows.push(row);
    }

    // Merge continuation lines: rows where col 0 is empty are usually a wrapped
    // cell from the previous row (e.g. long Application text overflowing)
    const merged = [];
    for (const row of pageRows) {
      if (merged.length > 0 && !row[0]) {
        const prev = merged[merged.length - 1];
        for (let i = 1; i < row.length; i++) {
          if (row[i]) prev[i] = prev[i] ? prev[i] + ' ' + row[i] : row[i];
        }
      } else {
        merged.push([...row]);
      }
    }

    allRows.push(...merged);
  }

  return allRows;
}

function parseFitmentText(text, vehicles) {
  if (!text) return [];
  const cleaned = text.replace(/\n?(Dia|Engine|Size|Length|Width|OD|ID|Type)\s*[.:：][^\n]*/gi, ' ').trim();
  const suggestions = [];
  const upper = cleaned.toUpperCase();
  const pattern = /([A-Z]{2}[A-Z\s]{0,18}?)\s*[:：]\s*([^;:]+)/g;
  let m;
  while ((m = pattern.exec(upper)) !== null) {
    const make = m[1].trim();
    const modelStr = m[2];
    for (const raw of modelStr.split(',')) {
      const r = raw.trim();
      if (!r) continue;
      const clean = r.replace(/\s*[-–]\s*[\d.]+[A-Z]*/g, '').replace(/\s+[\d.]+[A-Z]*$/g, '').trim();
      if (!clean || clean.length < 2) continue;
      const firstWord = clean.split(/\s+/)[0];
      const matched = vehicles.filter(v =>
        v.make?.toUpperCase() === make &&
        (v.model?.toUpperCase().startsWith(firstWord) || v.code?.toUpperCase() === firstWord)
      );
      suggestions.push({ make, model: clean, raw: r, vehicleIds: matched.map(v => v.id) });
    }
  }
  if (suggestions.length === 0) {
    const simple = /([A-Z]{2,})\s*[:：]\s*([A-Z0-9]+)/i.exec(upper);
    if (simple) {
      const make = simple[1];
      const code = simple[2];
      const matched = vehicles.filter(v =>
        v.make?.toUpperCase() === make && (v.code?.toUpperCase() === code || v.model?.toUpperCase() === code)
      );
      suggestions.push({ make, model: code, raw: code, vehicleIds: matched.map(v => v.id) });
    }
  }
  return suggestions;
}

export function CatalogueImportModal({ suppliers, parts, vehicles=[], onClose, onImportDone }) {
  const [step, setStep] = useState(1);
  const [suppId, setSuppId] = useState("");
  const [createSupp, setCreateSupp] = useState(false);
  const [newSuppName, setNewSuppName] = useState("");
  const [newSuppCode, setNewSuppCode] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [fileErr, setFileErr] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [colMap, setColMap] = useState({});
  const [reviewRows, setReviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const handlePaste = (text) => {
    setPasteText(text);
    if (!text.trim()) { setRawRows([]); setFileName(""); return; }
    try {
      const rows = parseDelimitedText(text);
      setRawRows(rows);
      setFileName("pasted data");
      setColMap(catAutoDetect(rows[0] || []));
      setFileErr("");
    } catch(e) {
      setFileErr("Could not parse pasted text: " + e.message);
    }
  };

  const headers = rawRows[0] || [];
  const dataRows = rawRows.slice(1).filter(r => r.some(c => String(c).trim()));

  const handleFile = async (file) => {
    if (!file) return;
    setFileErr(""); setFileLoading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let rows;
      if (ext === 'csv') {
        rows = parseDelimitedText(await file.text());
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await loadXLSX();
        const wb = XLSX.read(await file.arrayBuffer());
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      } else if (ext === 'pdf') {
        rows = await extractRowsFromPDF(file);
      } else {
        setFileErr("Unsupported file. Use .pdf, .csv, .xlsx or .xls");
        setFileLoading(false); return;
      }
      const cleaned = rows.filter(r => Array.isArray(r) && r.some(c => String(c).trim()));
      setRawRows(cleaned);
      setFileName(file.name);
      setColMap(catAutoDetect(cleaned[0] || []));
    } catch (e) {
      setFileErr("Parse error: " + e.message);
    }
    setFileLoading(false);
  };

  const buildReview = () => {
    const get = (row, field) => {
      const entry = Object.entries(colMap).find(([, f]) => f === field);
      return entry !== undefined ? String(row[+entry[0]] || "").trim() : "";
    };
    return dataRows.map(row => {
      const suppPartNo = get(row, "supplier_part_no");
      const description = get(row, "description");
      const oem = get(row, "oem");
      const application = get(row, "application");
      const fitments = parseFitmentText(application, vehicles);
      const matchedPart = oem ? parts.find(p => p.oem?.trim().toLowerCase() === oem.toLowerCase()) : null;
      return { suppPartNo, description, oem, application, fitments, matchedPart, partId: matchedPart?.id || null, action: "import" };
    }).filter(r => r.suppPartNo || r.description || r.oem);
  };

  const runImport = async () => {
    setImporting(true);
    let resolvedSuppId = suppId ? +suppId : null;
    const created = { parts: 0, links: 0, fitments: 0 };
    const newParts = [], newLinks = [], newFits = [];
    try {
      if (createSupp && newSuppName) {
        const r = await api.upsert("suppliers", { name: newSuppName, code: newSuppCode || null });
        resolvedSuppId = r?.[0]?.id || r?.id || null;
      }
      for (const row of reviewRows.filter(r => r.action === "import")) {
        let partId = row.partId;
        if (!partId) {
          const sku = row.suppPartNo || `IMP-${Date.now()}`;
          const existing = parts.find(p => p.sku?.toLowerCase() === sku.toLowerCase());
          if (existing) {
            partId = existing.id;
          } else {
            const r = await api.upsert("parts", { sku, name: row.description || sku, oem: row.oem || null, stock: 0 });
            const np = Array.isArray(r) ? r[0] : r;
            if (np?.id) { partId = np.id; newParts.push(np); created.parts++; }
          }
        }
        if (!partId) continue;
        if (resolvedSuppId && row.suppPartNo) {
          const ex = await api.get("part_suppliers", `part_id=eq.${partId}&supplier_id=eq.${resolvedSuppId}&limit=1`);
          if (!ex?.length) {
            const r = await api.upsert("part_suppliers", { part_id: partId, supplier_id: resolvedSuppId, supplier_part_no: row.suppPartNo });
            const nl = Array.isArray(r) ? r[0] : r;
            if (nl?.id) { newLinks.push(nl); created.links++; }
          }
        }
        for (const fit of row.fitments) {
          for (const vid of fit.vehicleIds) {
            const r = await api.upsert("part_fitments", { part_id: partId, vehicle_id: vid, notes: "" });
            const nf = Array.isArray(r) ? r[0] : r;
            if (nf?.id) { newFits.push(nf); created.fitments++; }
          }
        }
      }
      setResults(created);
      onImportDone?.({ newParts, newLinks, newFits });
      setStep(4);
    } catch (e) {
      alert("Import error: " + e.message);
    }
    setImporting(false);
  };

  // ── Step 1: Supplier + File ──
  if (step === 1) {
    const canNext = (suppId || (createSupp && newSuppName)) && rawRows.length > 1;
    return (
      <Overlay onClose={onClose}>
        <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(520px,94vw)",maxHeight:"92vh",overflowY:"auto"}}>
          <MHead title="Import Supplier Catalogue" onClose={onClose}/>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:20}}>Step 1 of 3 — Supplier &amp; File</div>

          <FL label="Supplier *"/>
          {!createSupp ? (
            <div style={{display:"flex",gap:8,marginBottom:20}}>
              <select className="inp" style={{flex:1}} value={suppId} onChange={e=>setSuppId(e.target.value)}>
                <option value="">Select supplier…</option>
                {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn-sec" onClick={()=>{setCreateSupp(true);setSuppId("");}}>+ New</button>
            </div>
          ) : (
            <div style={{marginBottom:20}}>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                <input className="inp" style={{flex:2}} placeholder="Supplier name *" value={newSuppName} onChange={e=>setNewSuppName(e.target.value)}/>
                <input className="inp" style={{flex:1}} placeholder="Code" value={newSuppCode} onChange={e=>setNewSuppCode(e.target.value)}/>
              </div>
              <button style={{fontSize:12,background:"none",border:"none",cursor:"pointer",color:"var(--text3)",padding:0}} onClick={()=>{setCreateSupp(false);setNewSuppName("");setNewSuppCode("");}}>← Use existing</button>
            </div>
          )}

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <FL label="Catalogue Data" style={{margin:0}}/>
            <div style={{display:"flex",gap:0,border:"1px solid var(--border)",borderRadius:6,overflow:"hidden",fontSize:12}}>
              <button onClick={()=>setPasteMode(false)} style={{padding:"3px 10px",background:!pasteMode?"var(--accent)":"transparent",color:!pasteMode?"#fff":"var(--text3)",border:"none",cursor:"pointer",fontFamily:"inherit"}}>File</button>
              <button onClick={()=>setPasteMode(true)} style={{padding:"3px 10px",background:pasteMode?"var(--accent)":"transparent",color:pasteMode?"#fff":"var(--text3)",border:"none",cursor:"pointer",fontFamily:"inherit"}}>Paste from Word/Excel</button>
            </div>
          </div>

          {!pasteMode ? (
            <label style={{display:"block",border:"2px dashed var(--border)",borderRadius:8,padding:"28px 20px",textAlign:"center",cursor:"pointer",color:"var(--text3)",fontSize:13,background:fileName&&fileName!=="pasted data"?"rgba(96,165,250,.06)":"transparent",transition:"background .2s"}}>
              <input type="file" accept=".csv,.xlsx,.xls,.pdf" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
              {fileLoading ? "Parsing…" : fileName && fileName!=="pasted data"
                ? <><strong style={{color:"var(--text)"}}>{fileName}</strong><br/><span style={{fontSize:12}}>{dataRows.length} data rows detected</span></>
                : <>Drop .pdf, .csv or .xlsx here, or click to browse<br/><span style={{fontSize:11,display:"block",marginTop:4}}>PDF must be digital (text selectable) · Word users: use Paste tab instead</span></>
              }
            </label>
          ) : (
            <div>
              <textarea
                className="inp"
                style={{width:"100%",minHeight:140,fontSize:12,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}}
                placeholder={"In Word: click inside the table → Ctrl+A → Ctrl+C\nThen click here and press Ctrl+V to paste"}
                value={pasteText}
                onChange={e=>handlePaste(e.target.value)}
              />
              {fileName==="pasted data"&&rawRows.length>1&&<div style={{fontSize:12,color:"var(--green)",marginTop:4}}>✓ {dataRows.length} rows detected</div>}
            </div>
          )}
          {fileErr&&<div style={{color:"var(--red)",fontSize:12,marginTop:6}}>{fileErr}</div>}

          {rawRows.length>1&&(
            <div style={{marginTop:12,fontSize:12,color:"var(--text3)"}}>
              <strong style={{color:"var(--text)"}}>Detected columns:</strong> {headers.filter(Boolean).join(" · ")}
            </div>
          )}

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:24}}>
            <button className="btn-sec" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={!canNext} onClick={()=>setStep(2)}>Map Columns →</button>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Step 2: Column Mapping ──
  if (step === 2) {
    const autoMap = catAutoDetect(headers);
    const mappedFields = new Set(Object.values(colMap).filter(Boolean));
    const unmapped = headers.filter((_, i) => !colMap[i]).length;
    return (
      <Overlay onClose={onClose}>
        <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(700px,97vw)",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
          <MHead title="Map Columns" onClose={onClose}/>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:16}}>
            Step 2 of 3 — Each column from your file is shown below. Auto-detected fields are pre-filled — adjust any that are wrong, and set unused columns to <em>(skip)</em>.
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"var(--bg)"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,border:"1px solid var(--border)",color:"var(--text3)"}}>Column in file</th>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,border:"1px solid var(--border)",color:"var(--text3)"}}>Sample values</th>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:600,border:"1px solid var(--border)",color:"var(--text3)"}}>Maps to field</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => {
                  const samples = dataRows.slice(0,3).map(r=>String(r[i]||"")).filter(Boolean).join(", ");
                  const mapped = colMap[i] || "";
                  const wasAuto = !!autoMap[i];
                  return (
                    <tr key={i} style={{background:mapped?"rgba(96,165,250,.04)":"transparent"}}>
                      <td style={{padding:"8px 12px",border:"1px solid var(--border)",fontWeight:600}}>
                        {h||<span style={{color:"var(--text3)"}}>(empty)</span>}
                        {wasAuto&&mapped&&<span style={{marginLeft:6,fontSize:10,background:"rgba(96,165,250,.18)",color:"var(--blue)",borderRadius:3,padding:"1px 5px"}}>auto</span>}
                      </td>
                      <td style={{padding:"8px 12px",border:"1px solid var(--border)",color:"var(--text3)",fontSize:11,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{samples||"—"}</td>
                      <td style={{padding:"8px 12px",border:"1px solid var(--border)"}}>
                        <select className="inp" style={{fontSize:12,padding:"4px 8px",minWidth:170}} value={mapped}
                          onChange={e=>{
                            const val=e.target.value;
                            setColMap(prev=>{
                              const next={...prev};
                              if(val) Object.keys(next).forEach(k=>{if(next[k]===val&&+k!==i)delete next[k];});
                              if(val) next[i]=val; else delete next[i];
                              return next;
                            });
                          }}>
                          {IMPORT_FIELDS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:8,fontSize:12,color:"var(--text3)"}}>
            Mapped: {[...mappedFields].map(f=>IMPORT_FIELDS.find(ff=>ff.value===f)?.label).join(", ")||"none"}
            {unmapped>0&&<span style={{marginLeft:8,color:"var(--orange)"}}> · {unmapped} column{unmapped!==1?"s":""} set to skip</span>}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            <button className="btn-sec" onClick={()=>setStep(1)}>← Back</button>
            <button className="btn" disabled={!mappedFields.size} onClick={()=>{setReviewRows(buildReview());setStep(3);}}>Preview Rows →</button>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Step 3: Review & Match ──
  if (step === 3) {
    const toImport = reviewRows.filter(r=>r.action==="import");
    const newCount = toImport.filter(r=>!r.partId).length;
    const matchCount = toImport.filter(r=>!!r.partId).length;
    const toggleAll = (v) => setReviewRows(prev=>prev.map(r=>({...r,action:v?"import":"skip"})));
    return (
      <Overlay onClose={onClose}>
        <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(1050px,99vw)",maxHeight:"96vh",display:"flex",flexDirection:"column"}}>
          <MHead title={`Review — ${reviewRows.length} rows`} onClose={onClose}/>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <span><strong>{toImport.length}</strong> to import &nbsp;·&nbsp;
            <span style={{color:"var(--green)"}}>{matchCount} matched existing</span> &nbsp;·&nbsp;
            <span style={{color:"var(--accent)"}}>{newCount} new parts</span></span>
            <span style={{marginLeft:"auto",display:"flex",gap:8}}>
              <button style={{fontSize:11,background:"none",border:"none",cursor:"pointer",color:"var(--blue)"}} onClick={()=>toggleAll(true)}>Select all</button>
              <button style={{fontSize:11,background:"none",border:"none",cursor:"pointer",color:"var(--text3)"}} onClick={()=>toggleAll(false)}>None</button>
            </span>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead style={{position:"sticky",top:0,background:"var(--surface)",zIndex:1}}>
                <tr style={{background:"var(--bg)"}}>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Supplier Part No</th>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Description</th>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>OEM</th>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Our Part</th>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Fitments</th>
                  <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"center",width:60}}>Import?</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row, i) => (
                  <tr key={i} style={{opacity:row.action==="skip"?0.35:1,background:i%2===0?"transparent":"rgba(0,0,0,.015)"}}>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)",fontFamily:"monospace",fontSize:11}}>{row.suppPartNo||"—"}</td>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)"}}>{row.description||"—"}</td>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)",fontFamily:"monospace",fontSize:11,color:"var(--text3)"}}>{row.oem||"—"}</td>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)"}}>
                      {row.matchedPart
                        ? <span style={{color:"var(--green)",fontWeight:600}}>✓ {row.matchedPart.sku}</span>
                        : <span style={{color:"var(--accent)",fontSize:11}}>+ New</span>}
                    </td>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)"}}>
                      {row.fitments.length===0
                        ? <span style={{color:"var(--text3)"}}>—</span>
                        : row.fitments.map((f,fi)=>(
                          <span key={fi} style={{display:"inline-block",margin:"1px 2px",padding:"1px 6px",borderRadius:4,fontSize:10,
                            background:f.vehicleIds.length>0?"rgba(96,165,250,.15)":"rgba(251,146,60,.15)",
                            color:f.vehicleIds.length>0?"var(--blue)":"var(--orange)"}}>
                            {f.make} {f.model}{f.vehicleIds.length===0?" ⚠":f.vehicleIds.length>1?` ×${f.vehicleIds.length}`:""}
                          </span>
                        ))}
                    </td>
                    <td style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"center"}}>
                      <input type="checkbox" checked={row.action==="import"}
                        onChange={e=>setReviewRows(prev=>prev.map((r,j)=>j===i?{...r,action:e.target.checked?"import":"skip"}:r))}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            <button className="btn-sec" onClick={()=>setStep(2)}>← Back</button>
            <button className="btn" disabled={toImport.length===0||importing} onClick={runImport}>
              {importing?"Importing…":`Import ${toImport.length} rows →`}
            </button>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Step 4: Results ──
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"var(--surface)",borderRadius:12,padding:32,width:"min(420px,94vw)",textAlign:"center"}}>
        <MHead title="Import Complete" onClose={onClose}/>
        {importing
          ? <div style={{padding:40,color:"var(--text3)"}}>Importing rows…</div>
          : results&&<>
            <div style={{fontSize:44,marginBottom:18}}>✅</div>
            <div style={{display:"flex",gap:20,justifyContent:"center",marginBottom:28}}>
              {[["Parts created",results.parts],["Supplier links",results.links],["Fitments",results.fitments]].map(([lbl,val])=>(
                <div key={lbl} style={{textAlign:"center"}}>
                  <div style={{fontSize:28,fontWeight:800,color:"var(--accent)"}}>{val}</div>
                  <div style={{fontSize:12,color:"var(--text3)"}}>{lbl}</div>
                </div>
              ))}
            </div>
            <button className="btn" onClick={onClose}>Done</button>
          </>
        }
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// BULK IMAGE IMPORT — match image filenames to part SKUs / supplier part nos
// ═══════════════════════════════════════════════════════════════
export function BulkImageImportModal({ parts, partSuppliers=[], onClose, onImageUpdated }) {
  const SCRIPT_URL = (typeof window._VEHICLE_SCRIPT_URL==="string"&&window._VEHICLE_SCRIPT_URL)
    || (typeof window._APPS_SCRIPT_URL==="string"&&window._APPS_SCRIPT_URL) || "";

  const [step, setStep]       = useState(1);
  const [entries, setEntries] = useState([]);
  const [doneCount, setDoneCount] = useState(0);

  const matchFiles = (fileList) => {
    return [...fileList]
      .filter(f => f.type?.startsWith("image/"))
      .map(file => {
        const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().trim();
        const bySku = parts.find(p => p.sku?.toLowerCase().trim() === base);
        if (bySku) return { file, matched: bySku, by: "SKU", status: "pending" };
        const bySupp = partSuppliers.find(ps => ps.supplier_part_no?.toLowerCase().trim() === base);
        const suppPart = bySupp ? parts.find(p => p.id === bySupp.part_id) : null;
        if (suppPart) return { file, matched: suppPart, by: "Supplier No", status: "pending" };
        return { file, matched: null, by: null, status: "skip" };
      });
  };

  const handleFiles = (fileList) => {
    const list = matchFiles(fileList);
    setEntries(list);
    if (list.length) setStep(2);
  };

  const processImg = (file) => new Promise((resolve, reject) => {
    const MAX = 1200;
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const c = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
      c.width=w; c.height=h;
      const ctx = c.getContext("2d");
      ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
      resolve(c.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = objUrl;
  });

  const runUpload = async () => {
    if (!SCRIPT_URL) { alert("Apps Script URL not configured — go to Settings → System."); return; }
    setStep(3);
    const queue = entries.filter(e => e.status === "pending");
    let n = 0;
    for (const entry of queue) {
      setEntries(prev => prev.map(e => e===entry ? {...e, status:"uploading"} : e));
      try {
        const base64 = await processImg(entry.file);
        const resp = await fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({ image: base64, filename: `${entry.matched.sku}.jpg`, mimeType: "image/jpeg" })
        });
        const res = await resp.json();
        if (!res.success) throw new Error(res.error || "Upload failed");
        await api.patch("parts", "id", entry.matched.id, { image_url: res.url });
        onImageUpdated?.(entry.matched.id, res.url);
        setEntries(prev => prev.map(e => e===entry ? {...e, status:"done", url:res.url} : e));
      } catch(err) {
        setEntries(prev => prev.map(e => e===entry ? {...e, status:"error", err:err.message} : e));
      }
      setDoneCount(++n);
    }
  };

  const toUpload  = entries.filter(e => e.status==="pending");
  const matched   = entries.filter(e => e.matched);
  const unmatched = entries.filter(e => !e.matched);
  const done      = entries.filter(e => e.status==="done");
  const errors    = entries.filter(e => e.status==="error");
  const total     = entries.filter(e => e.matched && e.status!=="skip").length;
  const progress  = total > 0 ? Math.round((done.length + errors.length) / total * 100) : 0;
  const allDone   = step===3 && entries.every(e => ["done","skip","error"].includes(e.status));

  // ── Step 1: Select files ──
  if (step === 1) return (
    <Overlay onClose={onClose}>
      <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(480px,94vw)"}}>
        <MHead title="Bulk Image Import" onClose={onClose}/>
        <p style={{fontSize:13,color:"var(--text3)",marginBottom:18}}>
          Select images named after the part SKU or supplier part number (e.g. <strong>AH02001.jpg</strong>). Each matched image will be uploaded and linked to the correct part.
        </p>

        {!SCRIPT_URL&&<div style={{background:"rgba(251,146,60,.1)",border:"1px solid var(--orange)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--orange)",marginBottom:14}}>
          ⚠ Apps Script URL not set — uploads will fail. Go to Settings → System first.
        </div>}

        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          <label style={{display:"block",border:"2px dashed var(--border)",borderRadius:8,padding:"24px 20px",textAlign:"center",cursor:"pointer",color:"var(--text3)",fontSize:13}}>
            <input type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
            🖼 Select image files
            <span style={{fontSize:11,display:"block",marginTop:4}}>Click to choose multiple images</span>
          </label>
          <label style={{display:"block",border:"2px dashed var(--border)",borderRadius:8,padding:"24px 20px",textAlign:"center",cursor:"pointer",color:"var(--text3)",fontSize:13}}>
            <input type="file" {...{"webkitdirectory":""}} multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
            📁 Select entire folder
            <span style={{fontSize:11,display:"block",marginTop:4}}>All images inside the folder will be scanned</span>
          </label>
        </div>

        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <button className="btn-sec" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Overlay>
  );

  // ── Step 2: Review matches ──
  if (step === 2) return (
    <Overlay onClose={onClose}>
      <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(700px,97vw)",maxHeight:"94vh",display:"flex",flexDirection:"column"}}>
        <MHead title={`Match Preview — ${entries.length} images`} onClose={onClose}/>
        <div style={{fontSize:12,color:"var(--text3)",marginBottom:10,display:"flex",gap:16}}>
          <span style={{color:"var(--green)"}}>{matched.length} matched</span>
          <span style={{color:"var(--orange)"}}>{unmatched.length} not matched (will be skipped)</span>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead style={{position:"sticky",top:0,background:"var(--surface)",zIndex:1}}>
              <tr style={{background:"var(--bg)"}}>
                <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Image file</th>
                <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>Matched part</th>
                <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"left"}}>By</th>
                <th style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"center",width:60}}>Upload?</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e,i) => (
                <tr key={i} style={{opacity:e.status==="skip"?0.35:1,background:i%2===0?"transparent":"rgba(0,0,0,.015)"}}>
                  <td style={{padding:"7px 10px",border:"1px solid var(--border)",fontFamily:"monospace",fontSize:11}}>{e.file.name}</td>
                  <td style={{padding:"7px 10px",border:"1px solid var(--border)"}}>
                    {e.matched
                      ? <span style={{color:"var(--green)",fontWeight:600}}>{e.matched.sku} <span style={{fontWeight:400,color:"var(--text3)"}}>{e.matched.name||""}</span></span>
                      : <span style={{color:"var(--orange)",fontSize:11}}>No match</span>}
                  </td>
                  <td style={{padding:"7px 10px",border:"1px solid var(--border)",color:"var(--text3)",fontSize:11}}>{e.by||"—"}</td>
                  <td style={{padding:"7px 10px",border:"1px solid var(--border)",textAlign:"center"}}>
                    {e.matched
                      ? <input type="checkbox" checked={e.status==="pending"}
                          onChange={ev=>setEntries(prev=>prev.map((r,j)=>j===i?{...r,status:ev.target.checked?"pending":"skip"}:r))}/>
                      : <span style={{color:"var(--text3)"}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
          <button className="btn-sec" onClick={()=>setStep(1)}>← Back</button>
          <button className="btn" disabled={toUpload.length===0} onClick={runUpload}>
            Upload {toUpload.length} images →
          </button>
        </div>
      </div>
    </Overlay>
  );

  // ── Step 3: Progress / Results ──
  return (
    <Overlay onClose={onClose}>
      <div style={{background:"var(--surface)",borderRadius:12,padding:28,width:"min(640px,97vw)",maxHeight:"94vh",display:"flex",flexDirection:"column"}}>
        <MHead title={allDone?"Upload Complete":"Uploading Images…"} onClose={onClose}/>
        <div style={{background:"var(--bg)",borderRadius:6,height:8,marginBottom:12,overflow:"hidden"}}>
          <div style={{height:"100%",background:"var(--accent)",borderRadius:6,width:progress+"%",transition:"width .4s"}}/>
        </div>
        <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",marginBottom:14}}>
          {done.length} uploaded · {errors.length} errors · {entries.filter(e=>["pending","uploading"].includes(e.status)).length} remaining
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <tbody>
              {entries.filter(e=>e.status!=="skip").map((e,i)=>(
                <tr key={i} style={{background:i%2===0?"transparent":"rgba(0,0,0,.015)"}}>
                  <td style={{padding:"6px 10px",border:"1px solid var(--border)",fontFamily:"monospace",fontSize:11}}>{e.file.name}</td>
                  <td style={{padding:"6px 10px",border:"1px solid var(--border)",fontWeight:600}}>{e.matched?.sku}</td>
                  <td style={{padding:"6px 10px",border:"1px solid var(--border)",textAlign:"center"}}>
                    {e.status==="done"    &&<span style={{color:"var(--green)"}}>✓</span>}
                    {e.status==="uploading"&&<span style={{color:"var(--blue)",display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span>}
                    {e.status==="error"   &&<span style={{color:"var(--red)",fontSize:11}}>✗ {e.err}</span>}
                    {e.status==="pending" &&<span style={{color:"var(--text3)"}}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allDone&&<div style={{display:"flex",justifyContent:"center",marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
          <button className="btn" onClick={onClose}>Done</button>
        </div>}
      </div>
    </Overlay>
  );
}

// ─── Vehicle Requests Page ──────────────────────────────────────────────
const VehiclePhotoRow = ({urls, startIdx, label, onImageClick}) => urls.length===0 ? null : (
  <div style={{marginTop:8}}>
    <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>{label}</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {urls.map((url,i)=>(
        <img key={i} src={url} alt="" loading="lazy" onClick={()=>onImageClick(startIdx+i)}
          style={{width:80,height:60,objectFit:"contain",borderRadius:6,background:"#f5f5f5",border:"1px solid var(--border)",cursor:"zoom-in"}}
          onError={e=>e.target.style.display="none"}/>
      ))}
    </div>
  </div>
);

export function VehicleRequestCard({r,isAdmin,vehicles=[],branches=[],user,onApprove,onGoToVehicles,onRefresh}) {
  const [isRejecting,setIsRejecting] = useState(false);
  const [rejectReason,setRejectReason] = useState("");
  const [busy,setBusy] = useState(false);
  const [lightbox,setLightbox] = useState(null); // {urls, idx, labels}

  const branchName = id => branches.find(b=>b.id===id)?.name||"Unknown Branch";

  const statusBadge = status => (
    <span style={{fontSize:11,padding:"2px 7px",borderRadius:12,fontWeight:600,
      background:status==="pending"?"rgba(251,191,36,.15)":status==="approved"?"rgba(34,197,94,.12)":"rgba(248,113,113,.12)",
      color:status==="pending"?"var(--yellow)":status==="approved"?"var(--green)":"var(--red)"}}>
      {status==="pending"?"Pending":status==="approved"?"Approved":"Rejected"}
    </span>
  );

  const approve = async () => {
    setBusy(true);
    try {
      await onApprove({make:r.make,model:r.model,year_from:r.year_from,year_to:r.year_to});
      await api.patch("vehicle_requests","id",r.id,{status:"approved",approved_by:user.id,approved_at:new Date().toISOString()});
      await onRefresh();
      setBusy(false);
      onGoToVehicles&&onGoToVehicles(r.make, r.model);
      return;
    } catch{}
    await onRefresh();
    setBusy(false);
  };

  const reject = async () => {
    if(!rejectReason.trim()) return;
    setBusy(true);
    await api.patch("vehicle_requests","id",r.id,{status:"rejected",rejection_reason:rejectReason});
    setIsRejecting(false); setRejectReason("");
    await onRefresh();
    setBusy(false);
  };

  const deleteRequest = async () => {
    if(!window.confirm("Delete this vehicle request?")) return;
    setBusy(true);
    await api.delete("vehicle_requests","id",r.id);
    await onRefresh();
    setBusy(false);
  };

  const matchV = vehicles.find(v=>
    v.make.toUpperCase()===r.make.toUpperCase() &&
    v.model.toUpperCase()===r.model.toUpperCase()
  );
  const dbPhotoUrls = [matchV?.photo_front, matchV?.photo_rear, matchV?.photo_side].filter(Boolean).map(toImgUrl);
  const reqPhotos   = [r.photo1, r.photo2].filter(Boolean);
  const allUrls  = [...reqPhotos, ...dbPhotoUrls];
  const allLabels= [...reqPhotos.map((_,i)=>`Branch Photo ${i+1}`), ...["Front","Rear","Side"].slice(0,dbPhotoUrls.length)];
  const openAt = (i) => setLightbox({urls:allUrls, idx:i, labels:allLabels});

  return (
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:10}}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
        <span style={{fontWeight:700,fontSize:14}}>{r.make} {r.model}</span>
        {statusBadge(r.status)}
      </div>
      {isAdmin&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>{branchName(r.branch_id)}</div>}
      <div style={{fontSize:12,color:"var(--text3)"}}>{(r.year_from||r.year_to)&&<span>{r.year_from||"?"}–{r.year_to||"present"}</span>}</div>
      {(r.vin||r.engine_no||r.reg)&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4,fontSize:11,fontFamily:"monospace",color:"var(--text2)"}}>
          {r.vin&&<span style={{background:"var(--surface2)",padding:"2px 6px",borderRadius:4}}>VIN: <strong>{r.vin}</strong></span>}
          {r.engine_no&&<span style={{background:"var(--surface2)",padding:"2px 6px",borderRadius:4}}>Eng: <strong>{r.engine_no}</strong></span>}
          {r.reg&&<span style={{background:"var(--surface2)",padding:"2px 6px",borderRadius:4}}>Reg: <strong>{r.reg}</strong></span>}
        </div>
      )}
      {r.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2,fontStyle:"italic"}}>"{r.notes}"</div>}

      {/* Two-column photo section */}
      {(reqPhotos.length>0||dbPhotoUrls.length>0)&&(
        <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap"}}>
          <VehiclePhotoRow urls={reqPhotos} startIdx={0} label="Branch Photos" onImageClick={openAt}/>
          <VehiclePhotoRow urls={dbPhotoUrls} startIdx={reqPhotos.length} label="Vehicle in Database" onImageClick={openAt}/>
        </div>
      )}

      {/* Approved vehicle details */}
      {r.status==="approved"&&matchV&&(matchV.code||matchV.engine||matchV.variant)&&(
        <div style={{marginTop:10,padding:"8px 12px",background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"var(--green)"}}>Added as:</span>
          {matchV.code&&<span style={{fontFamily:"DM Mono,monospace",fontSize:12,fontWeight:700,color:"var(--accent)",background:"var(--surface2)",padding:"2px 7px",borderRadius:4}}>{matchV.code}</span>}
          {matchV.engine&&<span style={{fontSize:12,color:"var(--blue)"}}>🔧 {matchV.engine}</span>}
          {matchV.variant&&<span style={{fontSize:12,color:"var(--text3)"}}>{matchV.variant}</span>}
        </div>
      )}

      {r.status==="rejected"&&r.rejection_reason&&<div style={{marginTop:8,padding:"6px 10px",background:"rgba(248,113,113,.08)",border:"1px solid rgba(248,113,113,.25)",borderRadius:7,fontSize:12}}>Reason: {r.rejection_reason}</div>}
      <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
        {isAdmin&&r.status==="approved"&&onGoToVehicles&&(
          <button className="btn btn-ghost btn-sm" style={{fontSize:12}} onClick={()=>onGoToVehicles(r.make, r.model)}>
            Edit in Vehicles →
          </button>
        )}
        {isAdmin&&r.vin&&(
          <a href={`https://www.vindecoderz.com/EN/check-lookup/${r.vin}`} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm" style={{fontSize:12,color:"var(--blue)",textDecoration:"none"}}>
            🔍 Search VIN
          </a>
        )}
        {isAdmin&&r.vin&&(
          <a href={`https://www.google.com/search?q=${encodeURIComponent(r.vin+' '+r.make+' '+r.model)}`} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm" style={{fontSize:12,color:"var(--text2)",textDecoration:"none"}}>
            🌐 Google
          </a>
        )}
        <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",fontSize:12}} onClick={deleteRequest} disabled={busy}>
          🗑 Delete
        </button>
      </div>

      {isAdmin&&r.status==="pending"&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          {!isRejecting&&(
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy}>{busy?"...":"Approve & Add Vehicle"}</button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>{setIsRejecting(true);setRejectReason("");}}>Reject</button>
            </div>
          )}
          {isRejecting&&(
            <div>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Rejection reason:</div>
              <input className="inp" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="e.g. Already exists as MAZDA 121" autoFocus/>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-primary btn-sm" style={{background:"var(--red)"}} onClick={reject} disabled={busy||!rejectReason.trim()}>{busy?"...":"Confirm Reject"}</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setIsRejecting(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {lightbox&&<ImgLightbox urls={lightbox.urls} startIdx={lightbox.idx} labels={lightbox.labels} onClose={()=>setLightbox(null)}/>}
    </div>
  );
}

export function VehicleRequestsPage({vehicleRequests=[],vehicles=[],branches=[],user,role,currentBranch,onRefresh,onApprove,onGoToVehicles,t={}}) {
  const isAdmin = role==="admin";
  const myReqs  = isAdmin ? vehicleRequests : vehicleRequests.filter(r=>r.branch_id===currentBranch?.id);
  const pending = myReqs.filter(r=>r.status==="pending");
  const done    = myReqs.filter(r=>r.status==="approved"||r.status==="rejected");

  const blankForm = {make:"",model:"",year_from:"",year_to:"",notes:"",photo1:"",photo2:"",vin:"",engine_no:"",reg:""};
  const [showForm,      setShowForm]      = useState(false);
  const [form,          setForm]          = useState(blankForm);
  const [formErr,       setFormErr]       = useState({});
  const [saving,        setSaving]        = useState(false);
  const [showMakeSuggs, setShowMakeSuggs] = useState(false);
  const [showSuggs,     setShowSuggs]     = useState(false);
  const [existingMatch, setExistingMatch] = useState(null);
  const [lightbox,      setLightbox]       = useState(null); // {urls, idx, labels} — for the new-request form's photo slots

  const sf = (k,v) => setForm(p=>({...p,[k]:v}));
  const uc = v => v.toUpperCase();

  const resizeToBase64 = (file) => new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const MAX=800, scale=Math.min(1,MAX/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL('image/jpeg',0.75));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });

  const PhotoSlot = ({val, onSet}) => {
    const fileRef = useRef(null);
    const camRef  = useRef(null);
    const process = async (file) => { if(file) onSet(await resizeToBase64(file)); };
    const onPaste = (e) => {
      const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image'));
      if(item){e.preventDefault();process(item.getAsFile());}
    };
    if(val) return (
      <div style={{position:"relative",flexShrink:0}}>
        <img src={val} onClick={()=>setLightbox({urls:[val],idx:0,labels:["Photo"]})}
          style={{width:120,height:90,objectFit:"contain",borderRadius:8,background:"#f5f5f5",border:"1px solid var(--border)",cursor:"zoom-in",display:"block"}}/>
        <button onClick={()=>onSet("")}
          style={{position:"absolute",top:-7,right:-7,width:22,height:22,borderRadius:"50%",background:"var(--red)",color:"#fff",border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>×</button>
      </div>
    );
    return (
      <div onPaste={onPaste} tabIndex={0}
        style={{border:"2px dashed var(--border)",borderRadius:8,padding:"10px 14px",display:"flex",gap:8,alignItems:"center",background:"var(--surface2)",outline:"none",cursor:"text"}}
        onFocus={e=>e.currentTarget.style.borderColor="var(--accent)"}
        onBlur={e=>e.currentTarget.style.borderColor=""}>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{process(e.target.files[0]);e.target.value="";}}/>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{process(e.target.files[0]);e.target.value="";}}/>
        <button className="btn btn-ghost btn-xs" onClick={()=>camRef.current.click()} title="Camera">📷</button>
        <button className="btn btn-ghost btn-xs" onClick={()=>fileRef.current.click()} title="File">📁</button>
        <button className="btn btn-ghost btn-xs" title="Paste from clipboard" onClick={async()=>{
          try{
            const items=await navigator.clipboard.read();
            for(const item of items){
              const type=item.types.find(t=>t.startsWith('image/'));
              if(type){process(await item.getType(type));break;}
            }
          }catch{/* permission denied or no image */}
        }}>📋 Paste</button>
      </div>
    );
  };

  const makeSuggs = useMemo(()=>{
    const q = form.make.trim().toUpperCase();
    const allMakes = [...new Set(vehicles.map(v=>v.make).filter(Boolean))].sort();
    return q ? allMakes.filter(m=>m.toUpperCase().includes(q)) : allMakes;
  },[vehicles, form.make]);

  const makeVehicles = useMemo(()=>{
    if(!form.make.trim()) return [];
    return vehicles.filter(v=>v.make.toUpperCase()===form.make.trim().toUpperCase());
  },[vehicles, form.make]);

  const modelSuggs = useMemo(()=>{
    if(!makeVehicles.length) return [];
    const q = form.model.trim().toUpperCase();
    return q ? makeVehicles.filter(v=>(v.model||"").toUpperCase().includes(q)) : makeVehicles;
  },[makeVehicles, form.model]);

  const pickSugg = (v) => {
    setForm(p=>({...p,
      model:     v.model||"",
      year_from: v.year_from||"",
      year_to:   v.year_to||"",
      engine:    (v.engine||"").toUpperCase(),
      variant:   (v.variant||"").toUpperCase(),
      code:      (v.code||"").toUpperCase(),
    }));
    setExistingMatch(v);
    setShowSuggs(false);
  };

  const submitRequest = async () => {
    const e={};
    if(!form.make.trim()) e.make="Make required";
    if(!form.model.trim()) e.model="Model required";
    if(!form.year_from) e.year_from="Year from required";
    setFormErr(e);
    if(Object.keys(e).length) return;
    setSaving(true);
    await api.insert("vehicle_requests",{
      branch_id: currentBranch?.id||user.branch_id||null,
      make: form.make.trim(), model: form.model.trim(),
      year_from: form.year_from||null, year_to: form.year_to||null,
      notes: form.notes.trim()||null,
      photo1: form.photo1||null, photo2: form.photo2||null,
      vin: form.vin.trim()||null, engine_no: form.engine_no.trim()||null, reg: form.reg.trim()||null,
      status:"pending", requested_by: user.id,
    });
    setSaving(false);
    setForm(blankForm);
    setShowForm(false);
    setExistingMatch(null);
    await onRefresh();
  };

  return (
    <div style={{padding:"0 0 40px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>Vehicle Requests</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:2}}>{isAdmin?"Review vehicle add requests from branches":"Request admin to add a new vehicle model"}</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}>Refresh</button>
          {!isAdmin&&<button className="btn btn-primary btn-sm" onClick={()=>{setShowForm(v=>!v);setExistingMatch(null);setFormErr({});}}>+ Request Vehicle</button>}
        </div>
      </div>

      {!isAdmin&&showForm&&(
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,padding:"16px",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>New Vehicle Request</div>
          <FG>
            <div style={{position:"relative"}}>
              <FL label="Make *"/>
              <input className="inp" value={form.make}
                onChange={e=>{sf("make",uc(e.target.value));sf("model","");setExistingMatch(null);setShowMakeSuggs(true);}}
                onFocus={()=>setShowMakeSuggs(true)}
                onBlur={()=>setTimeout(()=>setShowMakeSuggs(false),150)}
                placeholder="MAZDA" style={{textTransform:"uppercase",borderColor:formErr.make?"var(--red)":undefined}}/>
              {formErr.make&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>{formErr.make}</div>}
              {showMakeSuggs&&makeSuggs.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:200,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.15)",maxHeight:200,overflowY:"auto",marginTop:2}}>
                  {makeSuggs.map(make=>(
                    <div key={make} onMouseDown={()=>{sf("make",make);sf("model","");setExistingMatch(null);setShowMakeSuggs(false);}}
                      style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",fontWeight:600,fontSize:13}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                      onMouseLeave={e=>e.currentTarget.style.background=""}>
                      {make}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{position:"relative"}}>
              <FL label="Model *"/>
              <input className="inp" value={form.model}
                onChange={e=>{sf("model",uc(e.target.value));setExistingMatch(null);setShowSuggs(true);}}
                onFocus={()=>setShowSuggs(true)}
                onBlur={()=>setTimeout(()=>setShowSuggs(false),150)}
                placeholder="121" style={{textTransform:"uppercase",borderColor:formErr.model?"var(--red)":undefined}}/>
              {formErr.model&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>{formErr.model}</div>}
              {showSuggs&&modelSuggs.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:200,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,.15)",maxHeight:220,overflowY:"auto",marginTop:2}}>
                  {modelSuggs.map(v=>(
                    <div key={v.id} onMouseDown={()=>pickSugg(v)}
                      style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                      onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div>
                        <span style={{fontWeight:600,fontSize:13}}>{v.model}</span>
                        {v.code&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--accent)",marginLeft:6}}>{v.code}</span>}
                        {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                      </div>
                      <span style={{fontSize:12,color:"var(--blue)",whiteSpace:"nowrap"}}>{v.year_from||"?"}–{v.year_to||"present"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FG>

          {existingMatch&&(()=>{const ep=[existingMatch.photo_front,existingMatch.photo_rear,existingMatch.photo_side].filter(Boolean);return(
            <div style={{marginBottom:10,padding:"10px 12px",background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.4)",borderRadius:8,fontSize:12,display:"flex",gap:10,alignItems:"flex-start"}}>
              {ep.map((url,i)=>(
                <img key={i} src={toImgUrl(url)} alt="" loading="lazy"
                  onClick={()=>setLightbox({urls:ep.map(toImgUrl),idx:i,labels:["Front","Rear","Side"].slice(0,ep.length)})}
                  style={{width:80,height:60,objectFit:"contain",borderRadius:6,background:"#f5f5f5",border:"1px solid rgba(251,191,36,.4)",cursor:"zoom-in",flexShrink:0}}
                  onError={e=>e.target.style.display="none"}/>
              ))}
              <div>
                <strong>Already in database:</strong> {existingMatch.make} {existingMatch.model}
                {existingMatch.code&&<span style={{fontFamily:"DM Mono,monospace",color:"var(--accent)",marginLeft:4}}>{existingMatch.code}</span>}
                {" · "}{existingMatch.year_from||"?"}–{existingMatch.year_to||"present"}
                {existingMatch.engine&&<span> · {existingMatch.engine}</span>}
                {" Only submit if you need a different year range or variant."}
              </div>
            </div>
          );})()}

          <FG>
            <div>
              <FL label="Year From *"/>
              <input className="inp" type="number" value={form.year_from} onChange={e=>sf("year_from",e.target.value===""?"":+e.target.value)} placeholder="1990" style={{borderColor:formErr.year_from?"var(--red)":undefined}}/>
              {formErr.year_from&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>{formErr.year_from}</div>}
            </div>
            <div>
              <FL label="Year To"/>
              <input className="inp" type="number" value={form.year_to} onChange={e=>sf("year_to",e.target.value===""?"":+e.target.value)} placeholder="2005 (blank = present)"/>
            </div>
          </FG>
          <FG>
            <FD label="VIN (optional)"><input className="inp" value={form.vin} onChange={e=>sf("vin",e.target.value.toUpperCase())} placeholder="e.g. WBATX36030NA40660" style={{fontFamily:"monospace",textTransform:"uppercase"}}/></FD>
            <FD label="Engine No (optional)"><input className="inp" value={form.engine_no} onChange={e=>sf("engine_no",e.target.value.toUpperCase())} style={{fontFamily:"monospace",textTransform:"uppercase"}}/></FD>
            <FD label="Reg (optional)"><input className="inp" value={form.reg} onChange={e=>sf("reg",e.target.value.toUpperCase())} style={{textTransform:"uppercase"}}/></FD>
          </FG>
          <FD label="Notes">
            <input className="inp" value={form.notes} onChange={e=>sf("notes",e.target.value)} placeholder="Any extra details for admin..."/>
          </FD>
          <div style={{marginBottom:12}}>
            <FL label="Photos (optional — up to 2)"/>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:6}}>
              <PhotoSlot val={form.photo1} onSet={v=>sf("photo1",v)}/>
              <PhotoSlot val={form.photo2} onSet={v=>sf("photo2",v)}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button className="btn btn-primary" onClick={submitRequest} disabled={saving}>{saving?"Submitting...":"Submit Request"}</button>
            <button className="btn btn-ghost" onClick={()=>{setShowForm(false);setForm(blankForm);setFormErr({});setExistingMatch(null);}}>Cancel</button>
          </div>
        </div>
      )}

      {pending.length>0&&(
        <>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Pending ({pending.length})</div>
          {pending.map(r=><VehicleRequestCard key={r.id} r={r} isAdmin={isAdmin} vehicles={vehicles} branches={branches} user={user} onApprove={onApprove} onGoToVehicles={onGoToVehicles} onRefresh={onRefresh}/>)}
        </>
      )}
      {pending.length===0&&done.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text3)"}}>
          <div style={{fontSize:32,marginBottom:8}}>&#x1F697;</div>
          <div>{isAdmin?"No pending vehicle requests":"No requests yet — click + Request Vehicle to submit one"}</div>
        </div>
      )}
      {done.length>0&&(
        <>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:.6,margin:"16px 0 8px"}}>Completed ({done.length})</div>
          {done.map(r=><VehicleRequestCard key={r.id} r={r} isAdmin={isAdmin} vehicles={vehicles} branches={branches} user={user} onApprove={onApprove} onGoToVehicles={onGoToVehicles} onRefresh={onRefresh}/>)}
        </>
      )}
      {lightbox&&<ImgLightbox urls={lightbox.urls} startIdx={lightbox.idx} labels={lightbox.labels} onClose={()=>setLightbox(null)}/>}
    </div>
  );
}

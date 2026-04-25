import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import { getSettings, C, curSym, updateSettings } from "../lib/settings.js";
import { T, tSt, registerLang } from "../lib/i18n.js";
import { fmtAmt, makeId, today, toImgUrl, toFullUrl, toSaveUrl, toLogoUrl, extractDriveId } from "../lib/helpers.js";
import { CAR_MAKES, getCategories, DEFAULT_CATS } from "../lib/constants.js";
import { CSS } from "../styles.js";
import { ErrorBoundary, LogoSVG, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "../components/shared.jsx";
import { PartPhotoUploader, VehicleFitmentTab } from "./RfqVehicles.jsx";

export function WorkshopProfilePage({profile,onSave,wsRole="main",wsId}) {
  const [pTab,setPTab]=useState("profile"); // "profile" | "users"
  const [f,setF]=useState({
    name:"", vat_number:"", phone:"", whatsapp:"", email:"",
    address:"", website:"", logo_url:"", logo_data:"", currency:"ZAR R", city:"", country:"",
    licence_renewal_agent_name:"", licence_renewal_agent_phone:"", ...profile
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

  const loadWsUsers=async()=>{
    if(!wsId) return;
    setLoadingUsers(true);
    const res=await api.get("workshop_users",`workshop_id=eq.${wsId}&order=id.asc&select=*`);
    setWsUsers(Array.isArray(res)?res:[]);
    setLoadingUsers(false);
  };
  useEffect(()=>{ if(pTab==="users"&&wsRole==="main") loadWsUsers(); },[pTab]);

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

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><FL label="Workshop Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. ABC Auto Workshop"/></div>
          <div><FL label="VAT / Tax Number"/><input className="inp" value={f.vat_number} onChange={e=>s("vat_number",e.target.value)}/></div>
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
                try{const loc=await detectGeoLocation();s("city",loc.city);s("country",loc.country);}catch{}
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

        <button className="btn btn-primary" style={{padding:13,fontSize:15}} onClick={save} disabled={saving}>
          {saving?"Saving...":"✅ Save Settings"}
        </button>
      </div>}
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
            try{const loc=await detectGeoLocation();setCity(loc.city);setCountry(loc.country);}catch{}
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
export function WsSubscriptionExpiredPage({expiresAt,onLogout,settings}) {
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
export function OrdersTable({orders,canEdit,canInvoice=true,shipperMode=false,onStatusChange,onCreateInvoice}) {
  if(orders.length===0) return <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No orders</div>;
  return (
    <>
      {/* ── MOBILE CARDS ── */}
      <div className="mob-cards">
        {orders.map(o=>(
          <div key={o.id} className="card" style={{padding:16,borderLeft:`3px solid ${OC[o.status]||"var(--border)"}`}}>
            {/* Header row */}
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
            {/* Items */}
            <div style={{borderTop:"1px solid var(--border)",paddingTop:8,marginBottom:10}}>
              {Array.isArray(o.items)&&o.items.map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0"}}>
                  <span style={{color:"var(--text2)"}}>{item.name}</span>
                  <span style={{fontWeight:600,color:"var(--accent)"}}>×{item.qty}</span>
                </div>
              ))}
            </div>
            {/* Actions */}
            {canEdit&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select value={o.status} onChange={e=>onStatusChange(o.id,e.target.value)}
                  style={{flex:1,background:"var(--surface2)",border:"1px solid var(--border)",
                    color:"var(--text)",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>
                  {(shipperMode
                    ? (o.status==="Processing"?["Processing","Ready to Ship"]:o.status==="Ready to Ship"?["Ready to Ship","Completed"]:[o.status])
                    : ["Processing","Ready to Ship","Completed","Cancelled"]
                  ).map(s=><option key={s} value={s}>{tSt(s)}</option>)}
                </select>
                {canInvoice&&<button className="btn btn-info btn-sm" onClick={()=>onCreateInvoice(o)}>🧾</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="card desk-table" style={{overflow:"hidden"}}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{["Order","Customer","Date","Items","Total","Status",...(canEdit?["Update"]:[]),(canEdit&&canInvoice)?["Invoice"]:[]].flat().map(h=><th key={h}>{h}</th>)}</tr></thead>
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
                            : ["Processing","Ready to Ship","Completed","Cancelled"]
                          ).map(s=><option key={s} value={s}>{tSt(s)}</option>)}</select></td>}
                  {canEdit&&<td>{canInvoice&&<button className="btn btn-info btn-xs" onClick={()=>onCreateInvoice(o)}>🧾 Invoice</button>}</td>}
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
    "Processing","Ready to Ship","Completed","Cancelled","In Progress","Done","Delivered"];

  return (
    <div style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
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

export function SettingsPage({settings,onSave,t}) {
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

  const TABS=[["shop","🏪 Shop"],["billing","💰 Billing"],["inventory","🏷️ Inventory"],["languages","🌐 Languages"]];

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
            <FD><FL label={t.shopName}/><input className="inp" value={f.shop_name||""} onChange={e=>s("shop_name",e.target.value)} placeholder="AutoParts"/></FD>
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
                  onClick={async()=>{if(f.logo_data){alert("Remove the uploaded logo first.");return;}try{const txt=await navigator.clipboard.readText();s("logo_url",txt);}catch{}}}>📥 Paste</button>
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
            <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:16}}>🏷️ Stock Label Size</h3>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>Set the print size for stock labels</div>
            <FG cols="1fr 1fr">
              <div><FL label="Label Width (mm)"/><input className="inp" type="number" min="20" max="200" value={f.label_w||50} onChange={e=>s("label_w",+e.target.value)} placeholder="50"/></div>
              <div><FL label="Label Height (mm)"/><input className="inp" type="number" min="15" max="200" value={f.label_h||50} onChange={e=>s("label_h",+e.target.value)} placeholder="50"/></div>
            </FG>
            <div style={{background:"var(--surface2)",borderRadius:8,padding:12,border:"1px solid var(--border)",marginTop:10,display:"inline-flex",alignItems:"center",gap:12}}>
              <div style={{width:Math.min(+(f.label_w||50)*2,160),height:Math.min(+(f.label_h||50)*2,100),border:"1px dashed var(--border2)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface3)",flexShrink:0}}>
                <span style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{f.label_w||50}×{f.label_h||50}mm</span>
              </div>
              <div style={{fontSize:12,color:"var(--text3)"}}>Preview (2× scale)<br/>Default: 50mm × 50mm</div>
            </div>
            <div style={{marginTop:14}}>
              <button className="btn btn-primary btn-sm" onClick={()=>onSave({label_w:f.label_w,label_h:f.label_h})}>💾 Save Label Size</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: LANGUAGES ── */}
      {sTab==="languages"&&<LangManagerSection/>}
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
// SUPPLIER INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
export function SupplierInvoiceModal({data,suppliers,parts,onSave,onClose,t,settings}) {
  const isNew=data?.isNew;
  const [suppId,setSuppId]=useState("");
  const [invDate,setInvDate]=useState(today());
  const [dueDate,setDueDate]=useState("");
  const [notes,setNotes]=useState("");
  const [items,setItems]=useState([]);

  const sel=suppliers.find(s=>s.id===+suppId);
  const sub=items.reduce((s,i)=>s+i.qty*i.unit_cost,0);
  const tax=sub*(settings.tax_rate||0)/100;
  const total=sub+tax;

  const handleSave=async()=>{
    if(!suppId||items.length===0)return;
    const id=makeId(settings.invoice_prefix||"INV");
    const inv={id,supplier_id:+suppId,supplier_name:sel?.name,invoice_date:invDate,due_date:dueDate,status:"pending",subtotal:sub,tax,total,notes};
    const lineItems=items.map(item=>({part_id:item.part_id?+item.part_id:null,part_name:item.part_name,part_sku:item.part_sku,supplier_part_id:item.supplier_part_id||"",qty:+item.qty,unit_cost:+item.unit_cost,total:+item.qty*+item.unit_cost}));
    onSave({inv,isNew},lineItems);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 ${isNew?"New Purchase Invoice":"View Invoice"}`} onClose={onClose}/>
      <FG>
        <div><FL label="Supplier *"/><select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}><option value="">Select supplier...</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
      </FG>
      <FG>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
        <div><FL label={t.notes}/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></div>
      </FG>
      <div className="divider"/>
      <FL label="Line Items"/>
      <LineItemEditor items={items} setItems={setItems} parts={parts} showSupplierPartId t={t}/>
      {items.length>0&&<InvTotals items={items} taxRate={settings.tax_rate} costField="unit_cost"/>}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!suppId||items.length===0}>💾 Save & Stock In</button>
      </div>
    </Overlay>
  );
}

// VIEW SUPPLIER INVOICE
export function ViewSupplierInvoiceModal({inv,onClose,settings}) {
  const [items,setItems]=useState([]);
  useEffect(()=>{api.get("supplier_invoice_items",`invoice_id=eq.${inv.id}&select=*`).then(r=>setItems(Array.isArray(r)?r:[]));},[]); 
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
      <div style={{display:"flex",gap:10,marginTop:16}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Close</button></div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER RETURN MODAL
// ═══════════════════════════════════════════════════════════════
export function SupplierReturnModal({data,suppliers,parts,supplierInvoices,onSave,onClose,t,settings}) {
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
export function CustomerInvoiceModal({data,customers,parts,orders,onSave,onClose,t,settings}) {
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
  useEffect(()=>{api.get("customer_invoice_items",`invoice_id=eq.${inv.id}&select=*`).then(r=>setItems(Array.isArray(r)?r:[]));},[]); 
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
export function CustomerReturnModal({data,customers,parts,customerInvoices,onSave,onClose,t,settings}) {
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

  // If prefilled from invoice, load items immediately
  useEffect(()=>{if(prefillInv?.id){};},[]);

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
export function PartActionsMenu({onAdjust,onEdit,onMove,onSupplier,onRfq,onLogs,onDelete,t}) {
  const [open,setOpen] = useState(false);
  const [menuPos,setMenuPos] = useState({top:0,left:0});
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(()=>{
    const handler=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
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
      {open&&(
        <div style={{
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
        </div>
      )}
    </div>
  );
}

// Smart image preview with clear status feedback
export function PartModal({part,onSave,onClose,t,vehicles=[],partFitments=[],onSaveFitment,onDeleteFitment,onGoVehicles,inquiries=[],rfqQuotes=[],rfqItems=[],rfqSessions=[]}) {
  const makeF = (p) => p?{
    sku:p.sku||"", name:p.name||"", category:p.category||"Engine",
    brand:p.brand||"", price:p.price??"", cost_price:p.cost_price??"", stock:p.stock??0, minStock:p.min_stock??0,
    image_url:p.image_url||"", chinese_desc:p.chinese_desc||"",
    make:p.make||"", model:p.model||"", year_range:p.year_range||"", oe_number:p.oe_number||"",
    bin_location:p.bin_location||"",
  }:{
    sku:"", name:"", category:"Engine", brand:"", price:"", cost_price:"", stock:"", minStock:"",
    image_url:"", chinese_desc:"", make:"", model:"", year_range:"", oe_number:"", bin_location:"",
  };
  const [f,setF]=useState(()=>makeF(part));
  const [ptab, setPtab] = useState("info");
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const s=(k,v)=>{ setF(p=>({...p,[k]:v})); setDirty(true); setSaved(false); };

  const buildPayload=(fv)=>({
    sku:fv.sku.trim(), name:fv.name.trim(), category:fv.category, brand:fv.brand,
    price:+fv.price, cost_price:+fv.cost_price||0, stock:+fv.stock, min_stock:+fv.minStock,
    image_url:fv.image_url, chinese_desc:fv.chinese_desc,
    make:fv.make, model:fv.model, year_range:fv.year_range, oe_number:fv.oe_number,
    bin_location:fv.bin_location||"",
  });

  // Auto-save immediately when photo is uploaded (existing part only)
  const handlePhotoChange = (url) => {
    const updated = {...f, image_url: url};
    setF(updated);
    if (part) { onSave(buildPayload(updated), true); setDirty(false); setSaved(true); }
    else setDirty(true);
  };

  const handleClose = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  };

  const validate = () => {
    const e = {};
    if(!f.sku.trim())   e.sku   = "SKU is required";
    if(!f.name.trim())  e.name  = "Name is required";
    if(f.price===""||f.price===null) e.price = "Price is required";
    setErrors(e);
    if(Object.keys(e).length>0){
      // Switch to the tab with the first error
      if(e.sku||e.name) setPtab("info");
      else if(e.price)  setPtab("stock");
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
    {id:"info",    label:`📋 ${t.pmTabInfo}`},
    {id:"photo",   label:`📸 ${t.pmTabPhoto}`},
    {id:"stock",   label:`💰 ${t.stock}`},
    {id:"vehicle", label:`🚗 ${t.pmTabVehicle}`},
    {id:"fitment", label:`🔗 ${t.pmTabFits}`},
    {id:"rfq",     label:`📩 ${t.pmTabRfq}${rfqTotal>0?" ("+rfqTotal+")":""}`},
  ];

  const Err = ({k}) => errors[k]
    ? <div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {errors[k]}</div>
    : null;

  return (
    <Overlay onClose={handleClose} wide>
      <MHead title={part?`✏️ ${t.pmEditPart}`:`+ ${t.pmNewPart}`} onClose={handleClose}/>

      {/* Tab bar */}
      <div className="tabs" style={{marginBottom:18,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
        {TABS.map(tab=>(
          <button key={tab.id}
            className={`tab ${ptab===tab.id?"on":""}`}
            style={{fontSize:13,padding:"8px 14px"}}
            onClick={()=>setPtab(tab.id)}>
            {tab.label}
            {/* Red dot if tab has error */}
            {((tab.id==="info"&&(errors.sku||errors.name))||(tab.id==="stock"&&errors.price))&&(
              <span style={{width:6,height:6,background:"var(--red)",borderRadius:"50%",display:"inline-block",marginLeft:5,verticalAlign:"middle"}}/>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: INFO ── */}
      {ptab==="info"&&(
        <div>
          <FG>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <FL label={`${t.sku} *`}/>
                {f.sku&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.sku)}>📋</button>}
              </div>
              <input className="inp" value={f.sku} onChange={e=>{s("sku",e.target.value);setErrors(p=>({...p,sku:""}));}}
                placeholder="GP00001" style={{borderColor:errors.sku?"var(--red)":undefined}}/>
              <Err k="sku"/>
            </div>
            <div><FL label={t.brand}/><input className="inp" value={f.brand} onChange={e=>s("brand",e.target.value)} placeholder="GWM"/></div>
          </FG>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label={`${t.name} *`}/>
              <div style={{display:"flex",gap:6}}>
                {f.oe_number&&<button type="button" className="cp-btn" style={{color:"var(--blue)",borderColor:"rgba(96,165,250,.3)"}}
                  onClick={()=>window.open(`https://www.google.com/search?q=${encodeURIComponent(f.oe_number)}`,"_blank","noopener,noreferrer")}>🔍 Google</button>}
                {f.name&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.name)}>📋</button>}
              </div>
            </div>
            <input className="inp" value={f.name} onChange={e=>{s("name",e.target.value);setErrors(p=>({...p,name:""}));}}
              placeholder="Engine Mount - Left" style={{borderColor:errors.name?"var(--red)":undefined}}/>
            <Err k="name"/>
          </FD>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label={t.oeNumber}/>
              {f.oe_number&&<button className="cp-btn" onClick={()=>navigator.clipboard.writeText(f.oe_number)}>📋 Copy OE</button>}
            </div>
            <input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)} placeholder="OE number / OEM reference"/>
          </FD>
          <FD><FL label={t.chineseDesc}/><input className="inp" value={f.chinese_desc} onChange={e=>s("chinese_desc",e.target.value)} placeholder="零件中文說明"/></FD>
        </div>
      )}

      {/* ── TAB: PHOTO ── */}
      {ptab==="photo"&&(
        <div>
          {part&&<div style={{fontSize:12,color:"var(--green)",marginBottom:10,background:"rgba(34,197,94,.08)",borderRadius:8,padding:"6px 10px"}}>✅ {t.phuAutoSave}</div>}
          <PartPhotoUploader imageUrl={f.image_url} onChange={handlePhotoChange} sku={f.sku} t={t}/>
        </div>
      )}

      {/* ── TAB: STOCK ── */}
      {ptab==="stock"&&(
        <div>
          <FG cols="1fr 1fr">
            <div>
              <FL label={`${t.price} * (Selling)`}/>
              <input className="inp" type="number" value={f.price} onChange={e=>{s("price",e.target.value);setErrors(p=>({...p,price:""}));}}
                placeholder="0.00" style={{borderColor:errors.price?"var(--red)":undefined}}/>
              <Err k="price"/>
            </div>
            <div>
              <FL label={`💰 ${t.costPrice}`}/>
              <input className="inp" type="number" value={f.cost_price} onChange={e=>s("cost_price",e.target.value)} placeholder="0.00"/>
              {f.cost_price>0&&f.price>0&&<div style={{fontSize:11,color:"var(--green)",marginTop:3}}>Margin: {(((+f.price-(+f.cost_price))/(+f.price))*100).toFixed(1)}%</div>}
            </div>
          </FG>
          <FG cols="1fr 1fr">
            <div><FL label={t.stock}/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",e.target.value)} placeholder="0"/></div>
            <div><FL label={t.minStock}/><input className="inp" type="number" value={f.minStock} onChange={e=>s("minStock",e.target.value)} placeholder="1"/></div>
          </FG>
          <FD>
            <FL label={t.category}/>
            <select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>
              {getCategories().map(c=><option key={c}>{c}</option>)}
            </select>
          </FD>
        </div>
      )}

      {/* ── TAB: VEHICLE ── */}
      {ptab==="vehicle"&&(
        <div>
          <FG cols="1fr 1fr 1fr">
            <div>
              <FL label={t.make}/>
              <select className="inp" value={f.make} onChange={e=>{s("make",e.target.value);s("model","");}}>
                <option value="">Select make...</option>
                {Object.keys(CAR_MAKES).map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <FL label={t.model}/>
                <button className="cp-btn" onClick={async()=>{try{const txt=await navigator.clipboard.readText();s("model",txt);}catch{}}}>📥 Paste</button>
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
          t={t}/>
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
  const [f,setF]=useState(supplier?{name:supplier.name,email:supplier.email||"",phone:supplier.phone||"",country:supplier.country||"",contact_person:supplier.contact_person||"",notes:supplier.notes||""}:{name:"",email:"",phone:"",country:"",contact_person:"",notes:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={supplier?"Edit Supplier":"Add Supplier"} onClose={onClose}/>
      <FD><FL label={`${t.supplierName} *`}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></FD>
      <FG><div><FL label={t.country}/><input className="inp" value={f.country} onChange={e=>s("country",e.target.value)} placeholder="Taiwan, Japan..."/></div><div><FL label={t.contactPerson}/><input className="inp" value={f.contact_person} onChange={e=>s("contact_person",e.target.value)}/></div></FG>
      <FG><div><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div><div><FL label={t.phone}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div></FG>
      <FD><FL label={t.notes}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)}/></FD>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name)return;onSave(f);}}>{t.save}</button></div>
    </Overlay>
  );
}

export function PartSupplierModal({part,partSuppliers,suppliers,onSave,onDelete,onUpdate,onClose,t}) {
  const [suppId,setSuppId]=useState("");
  const [price,setPrice]=useState("");
  const [lead,setLead]=useState("");
  const [minOrd,setMinOrd]=useState(1);
  const [newPartNo,setNewPartNo]=useState("");
  // editing supplier_part_no inline
  const [editingId,setEditingId]=useState(null);
  const [editPartNo,setEditPartNo]=useState("");
  if(!part)return null;
  const avail=suppliers.filter(s=>!partSuppliers.find(ps=>ps.supplier_id===s.id));

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🏭 Suppliers — ${part.name}`} sub={`${part.sku}${part.oe_number?" · OE: "+part.oe_number:""}`} onClose={onClose}/>

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
                <button className="btn btn-danger btn-xs" onClick={()=>onDelete(ps.id)}>{t.delete}</button>
              </div>

              {/* Supplier Part No — editable inline */}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:9,marginTop:4}}>
                {editingId===ps.id ? (
                  <div style={{display:"flex",gap:7,alignItems:"center"}}>
                    <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                    <input className="inp" style={{fontSize:13,padding:"4px 9px",flex:1,fontFamily:"DM Mono,monospace"}}
                      value={editPartNo} onChange={e=>setEditPartNo(e.target.value)}
                      placeholder="Enter supplier part number..." autoFocus/>
                    <button className="btn btn-success btn-xs" onClick={()=>{onUpdate(ps.id,{supplier_part_no:editPartNo});setEditingId(null);}}>✓ Save</button>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>Supplier Part No.</div>
                    {ps.supplier_part_no ? (
                      <span style={{fontFamily:"DM Mono,monospace",fontSize:13,color:"var(--green)",fontWeight:600,flex:1}}>
                        ✓ {ps.supplier_part_no}
                      </span>
                    ) : (
                      <span style={{fontSize:12,color:"var(--yellow)",flex:1}}>⚠ Unknown — click to add</span>
                    )}
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
      {avail.length>0&&(
        <div>
          <FL label="Link New Supplier"/>
          <div style={{background:"var(--surface2)",borderRadius:11,padding:15,border:"1px solid var(--border)"}}>
            <FD>
              <FL label="Supplier *"/>
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
                style={{fontFamily:"DM Mono,monospace"}}/>
              {!newPartNo&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>💡 Leave blank — you can add it later or let supplier fill via RFQ</div>}
            </FD>
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
          </div>
        </div>
      )}
      {avail.length===0&&partSuppliers.length===0&&<p style={{color:"var(--text3)",textAlign:"center",padding:20}}>No suppliers yet — add them in the Suppliers section first.</p>}
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

export function InquiryModal({part,suppliers,partSuppliers,onSend,onClose,t}) {
  if(!part)return null;
  const [selectedSuppliers,setSelectedSuppliers]=useState([]);
  const [qty,setQty]=useState(10);

  // Build professional RFQ message — each field on its own clear line
  // buildMsg now accepts optional supplierPartNo from part_suppliers record
  const buildMsg = (supplierName, qtyVal, supplierPartNo="") => {
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
    lines.push("AutoParts Team");
    return lines.join("\n");
  };

  const [msg,setMsg]=useState(()=>buildMsg("Supplier", 10, ""));

  const toggleSupplier=(s)=>setSelectedSuppliers(p=>p.find(x=>x.id===s.id)?p.filter(x=>x.id!==s.id):[...p,s]);

  const handleSend=async()=>{
    if(selectedSuppliers.length===0||!qty)return;
    for(const s of selectedSuppliers){
      // Get this supplier's known part number for this part (if any)
      const ps = linkedPsMap[s.id];
      const suppPartNo = ps?.supplier_part_no || "";
      // Personalised message with their part number
      const personalMsg = buildMsg(s.name, qty, suppPartNo);
      await onSend({
        part_id:part.id, part_name:part.name, part_sku:part.sku,
        part_oe_number:part.oe_number||"", part_make:part.make||"",
        part_model:part.model||"", part_year:part.year_range||"",
        supplier_id:s.id, supplier_name:s.name, supplier_email:s.email, supplier_phone:s.phone,
        qty_requested:+qty, message:personalMsg,
        known_supplier_part_no:suppPartNo
      });
    }
  };

  // Keep full partSupplier record so we can access supplier_part_no
  const linkedPsMap=Object.fromEntries(partSuppliers.map(ps=>[ps.supplier_id, ps]));
  const linkedSupps=partSuppliers.map(ps=>ps.supplier).filter(Boolean);
  const allSupps=[...linkedSupps,...suppliers.filter(s=>!linkedSupps.find(l=>l.id===s.id))];

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📩 Send RFQ" sub={`${part.name}${part.chinese_desc?" / "+part.chinese_desc:""} · ${part.sku}`} onClose={onClose}/>

      {/* Part info preview */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:16,border:"1px solid var(--border)"}}>
        <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:9}}>Part Details to Send</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 16px",fontSize:13}}>
          {[
            ["Name",part.name],
            ["中文",part.chinese_desc||"—"],
            ["SKU",part.sku],
            ["OE#",part.oe_number||"—"],
            ["Make",part.make||"—"],
            ["Model",part.model||"—"],
            ["Year",part.year_range||"—"],
            ["Brand",part.brand||"—"],
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",gap:6}}>
              <span style={{color:"var(--text3)",minWidth:40,flexShrink:0}}>{k}</span>
              <span style={{fontWeight:500,fontFamily:k==="SKU"||k==="OE#"?"DM Mono,monospace":"inherit",fontSize:k==="SKU"||k==="OE#"?12:13}}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <FD>
        <FL label={`${t.selectSuppliers} *`}/>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto",background:"var(--surface2)",borderRadius:10,padding:11,border:"1px solid var(--border)"}}>
          {allSupps.map(s=>{
            const isLinked=!!linkedSupps.find(l=>l.id===s.id);
            const isSelected=!!selectedSuppliers.find(x=>x.id===s.id);
            return (
              <label key={s.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 10px",borderRadius:8,background:isSelected?"rgba(249,115,22,.1)":"transparent",border:isSelected?"1px solid rgba(249,115,22,.3)":"1px solid transparent"}}>
                <input type="checkbox" className="chk" checked={isSelected} onChange={()=>toggleSupplier(s)}/>
                <div style={{flex:1}}>
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
              </label>
            );
          })}
          {allSupps.length===0&&<p style={{color:"var(--text3)",fontSize:13,textAlign:"center"}}>No suppliers — add them first</p>}
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
    </Overlay>
  );
}

export function InquiryDetailModal({inquiry,onUpdate,onAccept,onClose,t,settings}) {
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
  const [f,setF]=useState(isEdit?{username:user.username,password:"",role:user.role,name:user.name||"",phone:user.phone||"",email:user.email||""}:{username:"",password:"",role:user?.role||"customer",name:"",phone:"",email:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"Edit User":f.role==="workshop"?"🔧 Add Workshop":"Add User"} onClose={onClose}/>
      <FG><div><FL label="Username *"/><input className="inp" value={f.username} onChange={e=>s("username",e.target.value)} disabled={isEdit}/></div><div><FL label={isEdit?"New password (blank=keep)":"Password *"}/><input className="inp" type="password" value={f.password} onChange={e=>s("password",e.target.value)} placeholder="••••••"/></div></FG>
      <FD><FL label={t.role}/><select className="inp" value={f.role} onChange={e=>s("role",e.target.value)}><option value="admin">👑 Admin</option><option value="manager">👔 Manager</option><option value="workshop">🔧 Workshop</option><option value="shipper">🚚 Shipper</option><option value="stockman">📦 Stockman</option><option value="customer">👤 Customer</option><option value="demo">🔒 Demo</option></select></FD>
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
              {/* Inline SVG logo — no white border, always looks clean on PDF */}
              <svg height="70" viewBox="0 0 420 110" xmlns="http://www.w3.org/2000/svg" style={{display:"block",marginBottom:8}}>
                <rect x="0" y="0" width="420" height="110" fill="#C0000A" rx="12"/>
                <rect x="0" y="0" width="420" height="5" fill="#FFD700" rx="2"/>
                <rect x="0" y="105" width="420" height="5" fill="#FFD700" rx="2"/>
                <polygon points="36,16 40.5,30 55,30 43.5,38.5 47.5,52 36,44 24.5,52 28.5,38.5 17,30 31.5,30" fill="#FFD700"/>
                <rect x="66" y="10" width="2.5" height="90" fill="#FFD700" opacity="0.6" rx="1"/>
                <text x="80" y="48" fontFamily="Arial Black,Arial" fontSize="32" fontWeight="900" fill="#FFD700" letterSpacing="2">AUTO EXCEL</text>
                <text x="82" y="68" fontFamily="Arial Black,Arial" fontSize="14" fontWeight="700" fill="#FFFFFF" letterSpacing="5">SOUTH AFRICA</text>
                <rect x="80" y="75" width="316" height="1.5" fill="#FFD700" opacity="0.4" rx="1"/>
                <text x="82" y="93" fontFamily="Arial Black,Arial" fontSize="13" fontWeight="700" fill="#FFFFFF" letterSpacing="2" opacity="0.95">CHINA CAR PARTS &amp; ENGINE OIL</text>
              </svg>
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
            <div style={{marginTop:4,fontSize:10}}>Generated by {settings.shop_name||"AutoParts"} ERP System</div>
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
// REPORTS PAGE
// ═══════════════════════════════════════════════════════════════
export function ReportsPage({orders,parts,customers,supplierInvoices,payments,settings,t,lang}) {
  const [period,setPeriod]=useState("monthly");
  const [reportTab,setReportTab]=useState("sales");
  const cur=curSym(settings.currency||"TWD NT$");
  const fmt=(n)=>`${cur}${(n||0).toLocaleString()}`;

  // ── Sales data ──
  const completedOrders=orders.filter(o=>o.status==="Completed");
  const totalRevenue=completedOrders.reduce((s,o)=>s+(o.total||0),0);
  const totalOrders=orders.length;

  // Group orders by period
  const groupBy=(arr,field,fmt2)=>{
    const map={};
    arr.forEach(o=>{
      const d=new Date(o[field]||o.created_at||o.date);
      let key="";
      if(period==="daily") key=d.toISOString().slice(0,10);
      else if(period==="monthly") key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      else key=`${d.getFullYear()}`;
      if(!map[key]) map[key]={key,count:0,total:0};
      map[key].count++;
      map[key].total+=(o.total||0);
    });
    return Object.values(map).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,12);
  };
  const salesByPeriod=groupBy(completedOrders,"date");

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
  const totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(p.amount||0),0);

  const TABS=[
    {id:"sales",label:"📈 "+t.salesReport},
    {id:"inventory",label:"📦 "+t.inventoryReport},
    {id:"customers",label:"👥 "+t.customerReport},
    {id:"suppliers",label:"🏭 "+t.supplierReport},
  ];

  return (
    <div className="fu">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>📊 {t.reports}</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{t.rptBusinessAnalytics}</p></div>
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
        {[
          {label:t.rptTotalRevenue,value:fmt(totalRevenue),icon:"💰",color:"var(--green)"},
          {label:t.rptTotalOrders,value:totalOrders,icon:"📋",color:"var(--blue)"},
          {label:t.rptInventoryValue,value:fmt(totalInventoryValue),icon:"📦",color:"var(--purple)"},
          {label:t.rptCashReceived,value:fmt(totalReceived),icon:"💳",color:"var(--accent)"},
        ].map(s=>(
          <div key={s.label} className="card stat-card" style={{"--gc":s.color+"20"}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div><div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{s.label}</div>
              <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"Rajdhani,sans-serif"}}>{s.value}</div></div>
              <div style={{fontSize:24}}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Report tabs */}
      <div className="tabs" style={{marginBottom:20,width:"fit-content"}}>
        {TABS.map(tb=><button key={tb.id} className={`tab ${reportTab===tb.id?"on":""}`} onClick={()=>setReportTab(tb.id)}>{tb.label}</button>)}
      </div>

      {/* SALES REPORT */}
      {reportTab==="sales"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
            <span style={{fontSize:13,color:"var(--text3)"}}>{t.rptPeriod}:</span>
            {["daily","monthly","yearly"].map(p=>(
              <button key={p} className={`btn btn-sm ${period===p?"btn-primary":"btn-ghost"}`} onClick={()=>setPeriod(p)} style={{fontSize:12}}>
                {p==="daily"?t.daily:p==="monthly"?t.monthly:t.yearly}
              </button>
            ))}
          </div>
          <div className="card" style={{overflow:"hidden"}}>
            <table className="tbl">
              <thead><tr>{[t.rptPeriod,t.orders_count,t.revenue,t.rptAvgOrder].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {salesByPeriod.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>{t.rptNoOrders}</td></tr>}
                {salesByPeriod.map(row=>(
                  <tr key={row.key}>
                    <td style={{fontWeight:600,fontFamily:"DM Mono,monospace"}}>{row.key}</td>
                    <td style={{textAlign:"center"}}><span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{row.count}</span></td>
                    <td style={{fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmt(row.total)}</td>
                    <td style={{color:"var(--text2)"}}>{fmt(Math.round(row.total/row.count))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      )}

      {/* INVENTORY REPORT */}
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
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

      {/* CUSTOMER REPORT */}
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

      {/* SUPPLIER REPORT */}
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

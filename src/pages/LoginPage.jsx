import { useState } from "react";
import { api } from "../lib/api.js";
import { getSettings } from "../lib/settings.js";
import { CSS } from "../styles.js";
import { ShopLogo, FL, FG } from "../components/shared.jsx";
import { makeId, detectGeoLocation } from "../lib/helpers.js";

export function LoginPage({onLogin,t,lang,setLang,loadedSettings,langs=[]}) {
  const [authTab,setAuthTab] = useState("customer"); // customer | workshop | staff
  const [user,setUser] = useState(""); const [pass,setPass] = useState("");
  const [wsUser,setWsUser] = useState(""); const [wsPass,setWsPass] = useState("");
  const [custTab,setCustTab] = useState("login");
  const [wsTab,setWsTab] = useState("login"); // login | signup
  const [cName,setCName] = useState(""); const [cPhone,setCPhone] = useState("");
  const [cEmail,setCEmail] = useState(""); const [cPass,setCPass] = useState(""); const [cPass2,setCPass2] = useState("");
  const [wsRegName,setWsRegName] = useState(""); const [wsRegUser,setWsRegUser] = useState("");
  const [wsRegPass,setWsRegPass] = useState(""); const [wsRegPass2,setWsRegPass2] = useState("");
  const [wsRegEmail,setWsRegEmail] = useState(""); const [wsRegPhone,setWsRegPhone] = useState("");
  const [wsRegCity,setWsRegCity] = useState(""); const [wsRegCountry,setWsRegCountry] = useState("");
  const [err,setErr] = useState(""); const [loading,setLoading] = useState(false);
  const [detectingLoc,setDetectingLoc] = useState(false);

  const logLogin = async (u) => { try { const g=await(await fetch("https://ipapi.co/json/")).json(); await api.upsert("login_logs",{username:u.username||u.phone,user_role:u.role||"customer",ip_address:g.ip||"?",country:`${g.country_name||"?"} ${g.country_flag_emoji||""}`.trim(),city:g.city||"",device:navigator.userAgent.slice(0,100),status:"success"}); } catch{} };

  const doStaffLogin = async () => {
    if(!user||!pass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");
    const res = await api.get("users",`username=eq.${encodeURIComponent(user)}&password=eq.${encodeURIComponent(pass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);}
    else setErr(t.wrongPass);
    setLoading(false);
  };

  const doWorkshopLogin = async () => {
    if(!wsUser||!wsPass){setErr("Fill username & password");return;}
    setLoading(true);setErr("");
    // Check main workshop account first — main always takes priority
    const res = await api.get("users",`username=eq.${encodeURIComponent(wsUser)}&password=eq.${encodeURIComponent(wsPass)}&role=eq.workshop&select=*`);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);setLoading(false);return;}
    // Check workshop sub-users (mechanics, managers)
    const suRes = await api.get("workshop_users",`username=eq.${encodeURIComponent(wsUser)}&password=eq.${encodeURIComponent(wsPass)}&is_active=eq.true&select=*`);
    if(Array.isArray(suRes)&&suRes.length>0){
      const wu=suRes[0];
      const mainRes=await api.get("users",`id=eq.${wu.workshop_id}&select=*`);
      if(Array.isArray(mainRes)&&mainRes.length>0){
        const userObj={...mainRes[0],wsRole:wu.ws_role,wsUsername:wu.username,name:wu.name||mainRes[0].name};
        await logLogin({...userObj,username:wu.username});
        onLogin(userObj);
        setLoading(false);
        return;
      }
    }
    setErr("Invalid workshop username or password");
    setLoading(false);
  };

  const doWsSignup = async () => {
    if(!wsRegName||!wsRegUser||!wsRegPass||!wsRegCity||!wsRegCountry){setErr("Workshop name, username, password, city and country are required");return;}
    if(wsRegPass!==wsRegPass2){setErr("Passwords don't match");return;}
    if(wsRegPass.length<4){setErr("Password must be at least 4 characters");return;}
    setLoading(true);setErr("");
    // Check username uniqueness
    const ex=await api.get("users",`username=eq.${encodeURIComponent(wsRegUser)}&select=id`).catch(()=>[]);
    if(Array.isArray(ex)&&ex.length>0){setErr("Username already taken — choose another");setLoading(false);return;}
    // Create workshop user account
    const wsId=makeId("WS");
    const today=new Date().toISOString().slice(0,10);
    const trialEnd=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
    const newUser=await api.insert("users",{id:wsId,username:wsRegUser,password:wsRegPass,name:wsRegName,role:"workshop",phone:wsRegPhone||"",email:wsRegEmail||""}).catch(e=>{setErr("Signup failed: "+e.message);return null;});
    if(!newUser){setLoading(false);return;}
    // Create workshop profile with trial
    await api.upsert("workshop_profiles",{id:wsId,name:wsRegName,phone:wsRegPhone||"",email:wsRegEmail||"",city:wsRegCity,country:wsRegCountry,trial_start:today,subscription_status:"trial",subscription_expires_at:trialEnd}).catch(()=>{});
    // Auto-login
    const loginUser=Array.isArray(newUser)?newUser[0]:newUser;
    if(loginUser){await logLogin({...loginUser});onLogin({...loginUser});}
    else setErr("Account created — please log in");
    setLoading(false);
  };

  const doCustLogin = async () => {
    if(!cPhone||!cPass){setErr("Fill phone & password");return;}
    setLoading(true);setErr("");
    const res = await api.get("customers",`phone=eq.${encodeURIComponent(cPhone)}&password=eq.${encodeURIComponent(cPass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){const c=res[0];await logLogin({...c,username:c.phone,role:"customer"});onLogin({...c,username:c.phone,role:"customer",_isCustomer:true});}
    else setErr("Phone or password incorrect");
    setLoading(false);
  };

  const doCustRegister = async () => {
    if(!cName||!cPhone||!cPass){setErr("Name, phone & password required");return;}
    if(cPass!==cPass2){setErr("Passwords don't match");return;}
    const digitsOnly=cPhone.replace(/[^0-9]/g,"");
    if(digitsOnly.length<9){setErr("Phone number too short — please enter full number (min 9 digits)");return;}
    setLoading(true);setErr("");
    const ex = await api.get("customers",`phone=eq.${encodeURIComponent(cPhone)}&select=id`);
    if(Array.isArray(ex)&&ex.length>0){setErr("Phone already registered — login instead");setLoading(false);return;}
    const res = await api.upsert("customers",{name:cName,phone:cPhone,email:cEmail,password:cPass,address:"",orders:0,total_spent:0});
    const c=Array.isArray(res)?res[0]:null;
    if(c){await logLogin({username:cPhone,role:"customer"});onLogin({...c,username:c.phone,role:"customer",_isCustomer:true});}
    else setErr("Registration failed");
    setLoading(false);
  };

  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
            <div style={{maxWidth:"min(90vw, 400px)",width:"100%",display:"flex",justifyContent:"center"}}>
              <ShopLogo settings={loadedSettings||getSettings()} size="lg"/>
            </div>
          </div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:8}}>{t.appSub}</div>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12,flexWrap:"wrap"}}>
            {langs.map(l=>(
              <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                {l.flag||l.lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {/* Login type tabs */}
        <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:"1px solid var(--border)",marginBottom:16}}>
          {[["customer","🛒 "+t.loginShop],["workshop","🔧 "+t.loginWorkshop],["staff","🏢 "+t.loginStaff]].map(([id,lb])=>(
            <button key={id} onClick={()=>{setAuthTab(id);setErr("");}}
              style={{flex:1,padding:"9px 4px",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"DM Sans,sans-serif",
                background:authTab===id?"var(--accent)":"var(--surface2)",
                color:authTab===id?"#fff":"var(--text3)",
                borderRight:id!=="staff"?"1px solid var(--border)":"none",transition:"all .15s"}}>
              {lb}
            </button>
          ))}
        </div>
        <div className="card" style={{padding:26,boxShadow:"var(--shadow-lg)"}}>
          {authTab==="staff"&&(
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              <div><FL label={t.username}/><input className="inp" type="text" value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doStaffLogin()} autoCapitalize="none"/></div>
              <div><FL label={t.password}/><input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doStaffLogin()}/></div>
              {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
              <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15}} onClick={doStaffLogin} disabled={loading}>{loading?t.connecting:t.login}</button>
            </div>
          )}
          {authTab==="workshop"&&(
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:4}}>
                {[["login",t.signIn],["signup",t.registerWorkshop]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${wsTab===id?"on":""}`} onClick={()=>{setWsTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>
              {wsTab==="login"&&(<>
                <div><FL label={t.username}/><input className="inp" type="text" value={wsUser} onChange={e=>setWsUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()} autoCapitalize="none" placeholder="Workshop username"/></div>
                <div><FL label={t.password}/><input className="inp" type="password" value={wsPass} onChange={e=>setWsPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()}/></div>
                {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15}} onClick={doWorkshopLogin} disabled={loading}>{loading?t.connecting:t.login}</button>
              </>)}
              {wsTab==="signup"&&(<>
                <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:8,padding:"10px 13px",fontSize:12,color:"var(--green)",lineHeight:1.5}}>
                  ✅ {t.freeTrial30}
                </div>
                <div><FL label={t.workshopNameField+" *"}/><input className="inp" value={wsRegName} onChange={e=>setWsRegName(e.target.value)} placeholder="e.g. ABC Auto Workshop"/></div>
                <div><FL label={t.username+" *"}/><input className="inp" value={wsRegUser} onChange={e=>setWsRegUser(e.target.value)} autoCapitalize="none" placeholder="Choose a login username"/></div>
                <div><FL label={t.password+" *"}/><input className="inp" type="password" value={wsRegPass} onChange={e=>setWsRegPass(e.target.value)}/></div>
                <div><FL label={t.confirmPwd+" *"}/><input className="inp" type="password" value={wsRegPass2} onChange={e=>setWsRegPass2(e.target.value)}/></div>
                <div><FL label="Email"/><input className="inp" type="email" value={wsRegEmail} onChange={e=>setWsRegEmail(e.target.value)} placeholder="workshop@email.com"/></div>
                <div><FL label="Phone"/><input className="inp" type="tel" value={wsRegPhone} onChange={e=>setWsRegPhone(e.target.value)} placeholder="+27..."/></div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <FL label="City & Country *"/>
                    <button type="button" className="btn btn-ghost btn-xs" disabled={detectingLoc} onClick={async()=>{
                      setDetectingLoc(true);
                      try{const loc=await detectGeoLocation();setWsRegCity(loc.city);setWsRegCountry(loc.country);}catch{}
                      setDetectingLoc(false);
                    }} style={{fontSize:11,padding:"3px 9px"}}>
                      {detectingLoc?t.detectingLoc:"📍 "+t.autoDetect}
                    </button>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <input className="inp" value={wsRegCity} onChange={e=>setWsRegCity(e.target.value)} placeholder="City" style={{flex:1}}/>
                    <input className="inp" value={wsRegCountry} onChange={e=>setWsRegCountry(e.target.value)} placeholder="Country" style={{flex:1}}/>
                  </div>
                </div>
                {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                <button className="btn btn-primary" style={{width:"100%",padding:13,fontSize:15}} onClick={doWsSignup} disabled={loading}>{loading?t.connecting:"🚀 "+t.startFreeTrial}</button>
                <p style={{fontSize:12,color:"var(--text3)",textAlign:"center",marginTop:-4}}>{t.alreadyAccount} <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setWsTab("login");setErr("");}}>{t.signIn}</span></p>
              </>)}
            </div>
          )}
          {authTab==="customer"&&(
            <div>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:20}}>
                {[["login",t.signIn],["register",t.registerNew]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${custTab===id?"on":""}`} onClick={()=>{setCustTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>
              {custTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div><FL label={t.phone}/><input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/></div>
                  <div><FL label={t.password}/><input className="inp" type="password" value={cPass} onChange={e=>setCPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustLogin()}/></div>
                  {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={doCustLogin} disabled={loading}>{loading?t.connecting:t.login}</button>
                  <p style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>{t.noAccount} <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCustTab("register");setErr("");}}>{t.registerNew}</span></p>
                </div>
              )}
              {custTab==="register"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div><FL label={t.name+" *"}/><input className="inp" value={cName} onChange={e=>setCName(e.target.value)}/></div>
                  <div>
                    <FL label={t.phone+" *"}/>
                    <input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Full number required (min 9 digits)</div>
                  </div>
                  <div><FL label="Email"/><input className="inp" type="email" value={cEmail} onChange={e=>setCEmail(e.target.value)}/></div>
                  <div><FL label={t.password+" *"}/><input className="inp" type="password" value={cPass} onChange={e=>setCPass(e.target.value)}/></div>
                  <div><FL label={t.confirmPwd+" *"}/><input className="inp" type="password" value={cPass2} onChange={e=>setCPass2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustRegister()}/></div>
                  {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={doCustRegister} disabled={loading}>{loading?t.connecting:t.createAccount}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaywallPage({user,onLogout,lang}) {
  const s = getSettings();
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{maxWidth:420,width:"100%",textAlign:"center"}}>
        <ShopLogo settings={getSettings()} size="md"/>
        <div className="card" style={{padding:34,marginTop:22,boxShadow:"var(--shadow-lg)"}}>
          <div style={{fontSize:50,marginBottom:14}}>🔒</div>
          <h2 style={{fontSize:20,fontWeight:700,marginBottom:8}}>{lang==="zh"?"試用期已結束":"Trial Expired"}</h2>
          <p style={{color:"var(--text2)",fontSize:14,lineHeight:1.8,marginBottom:24}}>{lang==="zh"?"請聯絡管理員升級付費方案":"Please contact administrator to upgrade."}</p>
          <div style={{background:"var(--surface2)",borderRadius:10,padding:"11px 15px",marginBottom:18,fontSize:13,color:"var(--text2)"}}>📧 {s.email||"admin@autoparts.com"}</div>
          <button className="btn btn-ghost" style={{width:"100%"}} onClick={onLogout}>{lang==="zh"?"登出":"Sign Out"}</button>
        </div>
      </div>
    </div>
  );
}

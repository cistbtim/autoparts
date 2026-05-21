import { useState, useEffect } from "react";
import { api, SUPABASE_URL } from "../lib/api.js";
import { getSettings } from "../lib/settings.js";
import { CSS } from "../styles.js";
import { ShopLogo, FL } from "../components/shared.jsx";
import { makeId, detectGeoLocation } from "../lib/helpers.js";

const ErrBox = ({msg}) => (
  <div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.25)",borderRadius:9,padding:"9px 13px",fontSize:13,color:"var(--red)",display:"flex",alignItems:"center",gap:7}}>
    <span style={{flexShrink:0}}>⚠</span> {msg}
  </div>
);

const Field = ({label, hint, children}) => (
  <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
      <label style={{fontSize:12,fontWeight:700,color:"var(--text3)",letterSpacing:".03em"}}>{label}</label>
      {hint&&<span style={{fontSize:11,color:"var(--text3)"}}>{hint}</span>}
    </div>
    {children}
  </div>
);

export function LoginPage({onLogin,t,lang,setLang,loadedSettings,langs=[]}) {
  const [authTab,setAuthTab] = useState("branch");
  // branch
  const [branchName,setBranchName] = useState("");
  const [branchUser,setBranchUser] = useState(""); const [branchPass,setBranchPass] = useState("");
  // staff
  const [staffUser,setStaffUser] = useState(""); const [staffPass,setStaffPass] = useState("");
  // workshop
  const [wsCompany,setWsCompany] = useState("");
  const [wsUser,setWsUser] = useState(""); const [wsPass,setWsPass] = useState("");
  const [wsTab,setWsTab] = useState("login");
  const [wsRegName,setWsRegName] = useState(""); const [wsRegUser,setWsRegUser] = useState("");
  const [wsRegPass,setWsRegPass] = useState(""); const [wsRegPass2,setWsRegPass2] = useState("");
  const [wsRegEmail,setWsRegEmail] = useState(""); const [wsRegPhone,setWsRegPhone] = useState("");
  const [wsRegCity,setWsRegCity] = useState(""); const [wsRegCountry,setWsRegCountry] = useState("");
  // scrapyard
  const [scrapCompany,setScrapCompany] = useState("");
  const [scrapUser,setScrapUser] = useState(""); const [scrapPass,setScrapPass] = useState("");
  const [scrapTab,setScrapTab] = useState("login");
  const [scrapRegName,setScrapRegName] = useState(""); const [scrapRegUser,setScrapRegUser] = useState("");
  const [scrapRegPass,setScrapRegPass] = useState(""); const [scrapRegPass2,setScrapRegPass2] = useState("");
  const [scrapRegEmail,setScrapRegEmail] = useState(""); const [scrapRegPhone,setScrapRegPhone] = useState("");
  const [scrapRegCity,setScrapRegCity] = useState(""); const [scrapRegCountry,setScrapRegCountry] = useState("");
  // customer
  const [custTab,setCustTab] = useState("login");
  const [cName,setCName] = useState(""); const [cPhone,setCPhone] = useState("");
  const [cEmail,setCEmail] = useState(""); const [cPass,setCPass] = useState(""); const [cPass2,setCPass2] = useState("");

  const [err,setErr] = useState(""); const [loading,setLoading] = useState(false);
  const [detectingLoc,setDetectingLoc] = useState(false);
  const [dbStatus, setDbStatus] = useState("checking");

  useEffect(()=>{
    api.get("settings","id=eq.1&select=id")
      .then(r=>setDbStatus(Array.isArray(r)&&r.length>0?"connected":"disconnected"))
      .catch(()=>setDbStatus("disconnected"));
  },[]);

  const logLogin = async (u) => {
    try {
      const g = await (await fetch("https://ipapi.co/json/")).json();
      await api.upsert("login_logs",{username:u.username||u.phone,user_role:u.role||"customer",ip_address:g.ip||"?",country:`${g.country_name||"?"} ${g.country_flag_emoji||""}`.trim(),city:g.city||"",device:navigator.userAgent.slice(0,100),status:"success"});
    } catch {}
  };

  const doBranchLogin = async () => {
    if(!branchName||!branchUser||!branchPass){setErr("Branch name, username and password are required");return;}
    setLoading(true);setErr("");
    const brRes = await api.get("branches",`name=ilike.*${encodeURIComponent(branchName.trim())}*&status=eq.active&select=id,name,status`);
    if(!Array.isArray(brRes)||brRes.length===0){setErr("Branch not found or inactive");setLoading(false);return;}
    const branch = brRes[0];
    const userRes = await api.get("users",`branch_id=eq.${branch.id}&username=eq.${encodeURIComponent(branchUser.trim())}&password=eq.${encodeURIComponent(branchPass)}&select=*`);
    if(Array.isArray(userRes)&&userRes.length>0){
      await logLogin(userRes[0]);
      onLogin({...userRes[0],_branchName:branch.name});
    } else {
      setErr("Invalid username or password");
    }
    setLoading(false);
  };

  const doStaffLogin = async () => {
    if(!staffUser||!staffPass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");
    const res = await api.get("users",`username=eq.${encodeURIComponent(staffUser)}&password=eq.${encodeURIComponent(staffPass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);}
    else setErr(t.wrongPass);
    setLoading(false);
  };

  const doWorkshopLogin = async () => {
    if(!wsUser||!wsPass){setErr("Fill username & password");return;}
    setLoading(true);setErr("");
    const company = wsCompany.trim();
    // Check main workshop account
    let q = `username=eq.${encodeURIComponent(wsUser)}&password=eq.${encodeURIComponent(wsPass)}&role=eq.workshop&select=*`;
    if(company) q += `&name=ilike.*${encodeURIComponent(company)}*`;
    const res = await api.get("users", q);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);setLoading(false);return;}
    // Check workshop sub-users
    let suQ = `username=eq.${encodeURIComponent(wsUser)}&password=eq.${encodeURIComponent(wsPass)}&is_active=eq.true&select=*`;
    if(company) {
      const compRes = await api.get("users",`role=eq.workshop&name=ilike.*${encodeURIComponent(company)}*&select=id`);
      if(Array.isArray(compRes)&&compRes.length>0) suQ += `&workshop_id=eq.${compRes[0].id}`;
    }
    const suRes = await api.get("workshop_users", suQ);
    if(Array.isArray(suRes)&&suRes.length>0){
      const wu=suRes[0];
      const mainRes=await api.get("users",`id=eq.${wu.workshop_id}&select=*`);
      if(Array.isArray(mainRes)&&mainRes.length>0){
        const userObj={...mainRes[0],wsRole:wu.ws_role,wsUsername:wu.username,name:wu.name||mainRes[0].name};
        await logLogin({...userObj,username:wu.username});
        onLogin(userObj);
        setLoading(false);return;
      }
    }
    setErr("Invalid workshop credentials");
    setLoading(false);
  };

  const doScrapyardLogin = async () => {
    if(!scrapUser||!scrapPass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");
    const company = scrapCompany.trim();
    let q = `username=eq.${encodeURIComponent(scrapUser)}&password=eq.${encodeURIComponent(scrapPass)}&role=eq.scrapyard&select=*`;
    if(company) q += `&name=ilike.*${encodeURIComponent(company)}*`;
    const res = await api.get("users", q);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);}
    else setErr(t.wrongPass);
    setLoading(false);
  };

  const doWsSignup = async () => {
    if(!wsRegName||!wsRegUser||!wsRegPass||!wsRegCity||!wsRegCountry){setErr("Workshop name, username, password, city and country are required");return;}
    if(wsRegPass!==wsRegPass2){setErr("Passwords don't match");return;}
    if(wsRegPass.length<4){setErr("Password must be at least 4 characters");return;}
    setLoading(true);setErr("");
    const ex=await api.get("users",`username=eq.${encodeURIComponent(wsRegUser)}&select=id`).catch(()=>[]);
    if(Array.isArray(ex)&&ex.length>0){setErr("Username already taken — choose another");setLoading(false);return;}
    const wsId=makeId("WS");
    const today=new Date().toISOString().slice(0,10);
    const trialEnd=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
    const newUser=await api.insert("users",{id:wsId,username:wsRegUser,password:wsRegPass,name:wsRegName,role:"workshop",phone:wsRegPhone||"",email:wsRegEmail||""}).catch(e=>{setErr("Signup failed: "+e.message);return null;});
    if(!newUser){setLoading(false);return;}
    await api.upsert("workshop_profiles",{id:wsId,name:wsRegName,phone:wsRegPhone||"",email:wsRegEmail||"",city:wsRegCity,country:wsRegCountry,trial_start:today,subscription_status:"trial",subscription_expires_at:trialEnd}).catch(()=>{});
    const loginUser=Array.isArray(newUser)?newUser[0]:newUser;
    if(loginUser){await logLogin({...loginUser});onLogin({...loginUser});}
    else setErr("Account created — please log in");
    setLoading(false);
  };

  const doScrapyardSignup = async () => {
    if(!scrapRegName||!scrapRegUser||!scrapRegPass||!scrapRegCity||!scrapRegCountry){setErr("Scrapyard name, username, password, city and country are required");return;}
    if(scrapRegPass!==scrapRegPass2){setErr("Passwords don't match");return;}
    if(scrapRegPass.length<4){setErr("Password must be at least 4 characters");return;}
    setLoading(true);setErr("");
    const ex=await api.get("users",`username=eq.${encodeURIComponent(scrapRegUser)}&select=id`).catch(()=>[]);
    if(Array.isArray(ex)&&ex.length>0){setErr("Username already taken — choose another");setLoading(false);return;}
    const today=new Date().toISOString().slice(0,10);
    const trialEnd=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
    const newUser=await api.insert("users",{username:scrapRegUser,password:scrapRegPass,name:scrapRegName,role:"scrapyard",phone:scrapRegPhone||"",email:scrapRegEmail||""}).catch(e=>{setErr("Signup failed: "+e.message);return null;});
    if(!newUser||newUser.code){setErr("Signup failed: "+(newUser?.message||"unknown error"));setLoading(false);return;}
    const loginUser=Array.isArray(newUser)?newUser[0]:newUser;
    if(!loginUser||loginUser.code){setErr("Signup failed");setLoading(false);return;}
    const profRes=await api.upsert("scrapyard_profiles",{id:loginUser.id,name:scrapRegName,phone:scrapRegPhone||"",email:scrapRegEmail||"",city:scrapRegCity,country:scrapRegCountry,trial_start:today,subscription_status:"trial",subscription_expires_at:trialEnd}).catch(()=>null);
    if(profRes?.code) setErr("Account created but profile save failed — "+(profRes.message||"check DB"));
    if(!profRes?.code){await logLogin({...loginUser});onLogin({...loginUser});}
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
    if(digitsOnly.length<9){setErr("Phone number too short (min 9 digits)");return;}
    setLoading(true);setErr("");
    const ex = await api.get("customers",`phone=eq.${encodeURIComponent(cPhone)}&select=id`);
    if(Array.isArray(ex)&&ex.length>0){setErr("Phone already registered — login instead");setLoading(false);return;}
    const res = await api.upsert("customers",{name:cName,phone:cPhone,email:cEmail,password:cPass,address:"",orders:0,total_spent:0});
    const c=Array.isArray(res)?res[0]:null;
    if(c){await logLogin({username:cPhone,role:"customer"});onLogin({...c,username:c.phone,role:"customer",_isCustomer:true});}
    else setErr("Registration failed");
    setLoading(false);
  };

  const switchTab = (tab) => { setAuthTab(tab); setErr(""); };

  const TAB_BTNS = [
    {id:"branch",   icon:"🏬", label:t.loginSpareShop||"Spare Shop"},
    {id:"workshop", icon:"🔧", label:t.loginWorkshop||"Workshop"},
    {id:"scrapyard",icon:"🚗", label:t.loginScrapyard||"Scrapyard"},
    {id:"customer", icon:"🛒", label:t.loginShop||"Shop"},
    {id:"staff",    icon:"⚙️", label:t.loginStaff||"Staff"},
  ];

  const inpStyle = {
    width:"100%",padding:"11px 14px",borderRadius:9,border:"1.5px solid var(--border)",
    background:"var(--surface2)",color:"var(--text)",fontSize:14,boxSizing:"border-box",
    outline:"none",fontFamily:"inherit",transition:"border-color .15s",
  };
  const companyInpStyle = {...inpStyle, borderColor:"rgba(96,165,250,.35)", background:"rgba(96,165,250,.05)"};

  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:430}}>

        {/* Logo + app subtitle */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
            <ShopLogo settings={loadedSettings||getSettings()} size="lg"/>
          </div>
          <div style={{color:"var(--text3)",fontSize:13}}>{t.appSub}</div>
          {langs.length>1&&(
            <div style={{display:"flex",justifyContent:"center",gap:5,marginTop:10,flexWrap:"wrap"}}>
              {langs.map(l=>(
                <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                  {l.flag||l.lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* DB status indicator */}
          <div style={{display:"flex",justifyContent:"center",marginTop:12}}>
            {dbStatus==="checking"&&(
              <span style={{fontSize:11,color:"var(--text3)",display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"var(--text3)",display:"inline-block",opacity:.5}}/>
                Checking database…
              </span>
            )}
            {dbStatus==="connected"&&(
              <a href={SUPABASE_URL} target="_blank" rel="noreferrer"
                style={{fontSize:11,fontWeight:600,color:"#34d399",textDecoration:"none",display:"flex",alignItems:"center",gap:5,
                  padding:"4px 12px",borderRadius:20,background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#34d399",display:"inline-block",boxShadow:"0 0 7px #34d399"}}/>
                Database Connected
              </a>
            )}
            {dbStatus==="disconnected"&&(
              <span style={{fontSize:11,fontWeight:600,color:"#f87171",display:"flex",alignItems:"center",gap:5,
                padding:"4px 12px",borderRadius:20,background:"rgba(248,113,113,.12)",border:"1px solid rgba(248,113,113,.3)"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#f87171",display:"inline-block"}}/>
                Database Disconnected
              </span>
            )}
          </div>
        </div>

        {/* Login type tabs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:14}}>
          {TAB_BTNS.map(tb=>(
            <button key={tb.id} onClick={()=>switchTab(tb.id)} style={{
              padding:"10px 4px",borderRadius:11,border:"none",cursor:"pointer",
              background:authTab===tb.id?"var(--accent)":"var(--surface2)",
              color:authTab===tb.id?"#fff":"var(--text2)",
              fontWeight:authTab===tb.id?700:500,
              fontSize:12,letterSpacing:".01em",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              boxShadow:authTab===tb.id?"0 3px 12px rgba(0,0,0,.18)":"none",
              transition:"all .15s",
            }}>
              <span style={{fontSize:19}}>{tb.icon}</span>
              <span>{tb.label}</span>
            </button>
          ))}
        </div>

        {/* Card */}
        <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border)",boxShadow:"0 8px 32px rgba(0,0,0,.12)",padding:"26px 24px",overflow:"hidden"}}>

          {/* ── Branch ── */}
          {authTab==="branch"&&(
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              <div style={{marginBottom:2}}>
                <div style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>🏬 {t.loginSpareShop||"Spare Shop"} {t.signIn||"Login"}</div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{t.loginSpareShopSub||"Sign in to your spare parts shop"}</div>
              </div>
              <Field label={t.branchNameField||"Branch Name"}>
                <input
                  style={companyInpStyle}
                  type="text" value={branchName}
                  onChange={e=>setBranchName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&doBranchLogin()}
                  placeholder={t.branchNamePlaceholder||"e.g. North Branch"}
                  autoCapitalize="words"
                />
              </Field>
              <Field label={t.username||"Username"}>
                <input style={inpStyle} type="text" value={branchUser} onChange={e=>setBranchUser(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&doBranchLogin()} autoCapitalize="none" placeholder="Your login username"/>
              </Field>
              <Field label={t.password||"Password"}>
                <input style={inpStyle} type="password" value={branchPass} onChange={e=>setBranchPass(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&doBranchLogin()}/>
              </Field>
              {err&&<ErrBox msg={err}/>}
              <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doBranchLogin} disabled={loading}>
                {loading?t.connecting||"Connecting…":"Sign In →"}
              </button>
            </div>
          )}

          {/* ── Workshop ── */}
          {authTab==="workshop"&&(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:18}}>
                {[["login",t.signIn||"Sign In"],["signup",t.registerWorkshop||"Register"]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${wsTab===id?"on":""}`} onClick={()=>{setWsTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>

              {wsTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div style={{marginBottom:2}}>
                    <div style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>🔧 Workshop Login</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>Sign in to your workshop account</div>
                  </div>

                  {/* Company name field */}
                  <Field label="Company Name" hint="Optional">
                    <div>
                      <input
                        style={companyInpStyle}
                        type="text" value={wsCompany}
                        onChange={e=>setWsCompany(e.target.value)}
                        placeholder="e.g. ABC Auto Workshop"
                        autoCapitalize="words"
                      />
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Helps identify your account if multiple workshops share a username</div>
                  </Field>

                  <Field label={t.username||"Username"}>
                    <input style={inpStyle} type="text" value={wsUser} onChange={e=>setWsUser(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()} autoCapitalize="none" placeholder="Your login username"/>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <input style={inpStyle} type="password" value={wsPass} onChange={e=>setWsPass(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()}/>
                  </Field>

                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doWorkshopLogin} disabled={loading}>
                    {loading?t.connecting||"Connecting…":"Sign In →"}
                  </button>
                </div>
              )}

              {wsTab==="signup"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:9,padding:"10px 13px",fontSize:12,color:"var(--green)",lineHeight:1.5}}>
                    ✅ {t.freeTrial30||"30-day free trial — no credit card required"}
                  </div>
                  <Field label="Workshop Name *">
                    <input style={inpStyle} value={wsRegName} onChange={e=>setWsRegName(e.target.value)} placeholder="e.g. ABC Auto Workshop"/>
                  </Field>
                  <Field label={(t.username||"Username")+" *"}>
                    <input style={inpStyle} value={wsRegUser} onChange={e=>setWsRegUser(e.target.value)} autoCapitalize="none" placeholder="Choose a login username"/>
                  </Field>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label={(t.password||"Password")+" *"}>
                      <input style={inpStyle} type="password" value={wsRegPass} onChange={e=>setWsRegPass(e.target.value)}/>
                    </Field>
                    <Field label={(t.confirmPwd||"Confirm")+" *"}>
                      <input style={inpStyle} type="password" value={wsRegPass2} onChange={e=>setWsRegPass2(e.target.value)}/>
                    </Field>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="Email">
                      <input style={inpStyle} type="email" value={wsRegEmail} onChange={e=>setWsRegEmail(e.target.value)} placeholder="email@workshop.com"/>
                    </Field>
                    <Field label="Phone">
                      <input style={inpStyle} type="tel" value={wsRegPhone} onChange={e=>setWsRegPhone(e.target.value)} placeholder="+27..."/>
                    </Field>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <label style={{fontSize:12,fontWeight:700,color:"var(--text3)"}}>City &amp; Country *</label>
                      <button type="button" className="btn btn-ghost btn-xs" disabled={detectingLoc} onClick={async()=>{
                        setDetectingLoc(true);
                        try{const loc=await detectGeoLocation();setWsRegCity(loc.city);setWsRegCountry(loc.country);}catch(e){/* ignore geolocation failures */}
                        setDetectingLoc(false);
                      }} style={{fontSize:11,padding:"3px 9px"}}>
                        {detectingLoc?"Detecting…":"📍 Auto-detect"}
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <input style={inpStyle} value={wsRegCity} onChange={e=>setWsRegCity(e.target.value)} placeholder="City"/>
                      <input style={inpStyle} value={wsRegCountry} onChange={e=>setWsRegCountry(e.target.value)} placeholder="Country"/>
                    </div>
                  </div>
                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10}} onClick={doWsSignup} disabled={loading}>
                    {loading?t.connecting||"Connecting…":"🚀 "+(t.startFreeTrial||"Start Free Trial")}
                  </button>
                  <p style={{fontSize:12,color:"var(--text3)",textAlign:"center",margin:0}}>
                    Already have an account? <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setWsTab("login");setErr("");}}>Sign In</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Scrapyard ── */}
          {authTab==="scrapyard"&&(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:18}}>
                {[["login",t.signIn||"Sign In"],["signup",t.registerScrapyard||"Register"]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${scrapTab===id?"on":""}`} onClick={()=>{setScrapTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>

              {scrapTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div style={{marginBottom:2}}>
                    <div style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>🚗 Scrapyard Login</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>Sign in to your scrapyard account</div>
                  </div>

                  {/* Company name field */}
                  <Field label="Company Name" hint="Optional">
                    <div>
                      <input
                        style={companyInpStyle}
                        type="text" value={scrapCompany}
                        onChange={e=>setScrapCompany(e.target.value)}
                        placeholder="e.g. City Scrapyard"
                        autoCapitalize="words"
                      />
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Helps identify your account if multiple scrapyards share a username</div>
                  </Field>

                  <Field label={t.username||"Username"}>
                    <input style={inpStyle} type="text" value={scrapUser} onChange={e=>setScrapUser(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doScrapyardLogin()} autoCapitalize="none" placeholder="Your login username"/>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <input style={inpStyle} type="password" value={scrapPass} onChange={e=>setScrapPass(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&doScrapyardLogin()}/>
                  </Field>

                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doScrapyardLogin} disabled={loading}>
                    {loading?t.connecting||"Connecting…":"Sign In →"}
                  </button>
                </div>
              )}

              {scrapTab==="signup"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:9,padding:"10px 13px",fontSize:12,color:"var(--green)",lineHeight:1.5}}>
                    ✅ {t.freeTrial30||"30-day free trial — no credit card required"}
                  </div>
                  <Field label="Scrapyard Name *">
                    <input style={inpStyle} value={scrapRegName} onChange={e=>setScrapRegName(e.target.value)} placeholder="e.g. City Scrapyard"/>
                  </Field>
                  <Field label={(t.username||"Username")+" *"}>
                    <input style={inpStyle} value={scrapRegUser} onChange={e=>setScrapRegUser(e.target.value)} autoCapitalize="none" placeholder="Choose a login username"/>
                  </Field>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label={(t.password||"Password")+" *"}>
                      <input style={inpStyle} type="password" value={scrapRegPass} onChange={e=>setScrapRegPass(e.target.value)}/>
                    </Field>
                    <Field label={(t.confirmPwd||"Confirm")+" *"}>
                      <input style={inpStyle} type="password" value={scrapRegPass2} onChange={e=>setScrapRegPass2(e.target.value)}/>
                    </Field>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="Email">
                      <input style={inpStyle} type="email" value={scrapRegEmail} onChange={e=>setScrapRegEmail(e.target.value)} placeholder="email@scrapyard.com"/>
                    </Field>
                    <Field label="Phone">
                      <input style={inpStyle} type="tel" value={scrapRegPhone} onChange={e=>setScrapRegPhone(e.target.value)} placeholder="+27..."/>
                    </Field>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <label style={{fontSize:12,fontWeight:700,color:"var(--text3)"}}>City &amp; Country *</label>
                      <button type="button" className="btn btn-ghost btn-xs" disabled={detectingLoc} onClick={async()=>{
                        setDetectingLoc(true);
                        try{const loc=await detectGeoLocation();setScrapRegCity(loc.city);setScrapRegCountry(loc.country);}catch(e){/* ignore geolocation failures */}
                        setDetectingLoc(false);
                      }} style={{fontSize:11,padding:"3px 9px"}}>
                        {detectingLoc?"Detecting…":"📍 Auto-detect"}
                      </button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <input style={inpStyle} value={scrapRegCity} onChange={e=>setScrapRegCity(e.target.value)} placeholder="City"/>
                      <input style={inpStyle} value={scrapRegCountry} onChange={e=>setScrapRegCountry(e.target.value)} placeholder="Country"/>
                    </div>
                  </div>
                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10}} onClick={doScrapyardSignup} disabled={loading}>
                    {loading?t.connecting||"Connecting…":"🚗 Start Free Trial"}
                  </button>
                  <p style={{fontSize:12,color:"var(--text3)",textAlign:"center",margin:0}}>
                    Already have an account? <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setScrapTab("login");setErr("");}}>Sign In</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Shop / Customer ── */}
          {authTab==="customer"&&(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:18}}>
                {[["login",t.signIn||"Sign In"],["register",t.registerNew||"Register"]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${custTab===id?"on":""}`} onClick={()=>{setCustTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>

              {custTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div style={{marginBottom:2}}>
                    <div style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>🛒 Shop Login</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>Browse and order parts</div>
                  </div>
                  <Field label={t.phone||"Phone"}>
                    <input style={inpStyle} type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <input style={inpStyle} type="password" value={cPass} onChange={e=>setCPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustLogin()}/>
                  </Field>
                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doCustLogin} disabled={loading}>
                    {loading?t.connecting||"Connecting…":"Sign In →"}
                  </button>
                  <p style={{fontSize:12,color:"var(--text3)",textAlign:"center",margin:"4px 0 0"}}>
                    {t.noAccount||"No account?"} <span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCustTab("register");setErr("");}}>{t.registerNew||"Register"}</span>
                  </p>
                </div>
              )}

              {custTab==="register"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <Field label={(t.name||"Name")+" *"}>
                    <input style={inpStyle} value={cName} onChange={e=>setCName(e.target.value)}/>
                  </Field>
                  <Field label={(t.phone||"Phone")+" *"} hint="Min 9 digits">
                    <input style={inpStyle} type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/>
                  </Field>
                  <Field label="Email">
                    <input style={inpStyle} type="email" value={cEmail} onChange={e=>setCEmail(e.target.value)}/>
                  </Field>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label={(t.password||"Password")+" *"}>
                      <input style={inpStyle} type="password" value={cPass} onChange={e=>setCPass(e.target.value)}/>
                    </Field>
                    <Field label={(t.confirmPwd||"Confirm")+" *"}>
                      <input style={inpStyle} type="password" value={cPass2} onChange={e=>setCPass2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustRegister()}/>
                    </Field>
                  </div>
                  {err&&<ErrBox msg={err}/>}
                  <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10}} onClick={doCustRegister} disabled={loading}>
                    {loading?t.connecting||"Connecting…":t.createAccount||"Create Account"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Staff ── */}
          {authTab==="staff"&&(
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              <div style={{marginBottom:2}}>
                <div style={{fontSize:17,fontWeight:700,color:"var(--text)"}}>🏢 Staff Login</div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>Admin, manager and fulfilment access</div>
              </div>
              <Field label={t.username||"Username"}>
                <input style={inpStyle} type="text" value={staffUser} onChange={e=>setStaffUser(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&doStaffLogin()} autoCapitalize="none" placeholder="Username"/>
              </Field>
              <Field label={t.password||"Password"}>
                <input style={inpStyle} type="password" value={staffPass} onChange={e=>setStaffPass(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&doStaffLogin()}/>
              </Field>
              {err&&<ErrBox msg={err}/>}
              <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doStaffLogin} disabled={loading}>
                {loading?t.connecting||"Connecting…":"Sign In →"}
              </button>
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

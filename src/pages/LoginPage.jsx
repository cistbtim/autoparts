import { useState, useEffect } from "react";
import { api, SUPABASE_URL } from "../lib/api.js";
import { getSettings } from "../lib/settings.js";
import { CSS } from "../styles.js";
import { ShopLogo, FL, MotorDeskBanner } from "../components/shared.jsx";
import { makeId, detectGeoLocation, fetchWeather, waLink } from "../lib/helpers.js";
import { getSubInfo } from "../lib/constants.js";

// Attach spare_shop_name + queue linked_branch_id from localStorage (set during QR registration)
const applyPendingSpareShop = (userObj) => {
  try {
    const raw = localStorage.getItem("ap_pending_spare_shop");
    if (!raw) return userObj;
    let data;
    try { data = JSON.parse(raw); } catch { data = {name: raw, branch_id: null}; }
    const shopName = data.name || raw;
    const branchId = data.branch_id || null;
    localStorage.removeItem("ap_pending_spare_shop");
    if (branchId) {
      try { localStorage.setItem("ap_pending_linked_branch", branchId); } catch {}
    }
    if (userObj.spare_shop_name === shopName) return userObj;
    api.patch("users","id",String(userObj.id),{spare_shop_name:shopName}).catch(()=>{});
    return {...userObj, spare_shop_name: shopName};
  } catch { return userObj; }
};

const checkAccess = (u) => {
  const si = getSubInfo(u);
  if (si.status === "expired") return "Subscription expired — contact admin to renew";
  if (si.status === "blocked") return "Account blocked — contact admin";
  return null;
};

const ErrBox = ({msg}) => (
  <div style={{background:"rgba(220,38,38,.07)",border:"1px solid rgba(220,38,38,.2)",borderRadius:9,padding:"9px 13px",fontSize:13,color:"var(--red)",display:"flex",alignItems:"center",gap:7}}>
    <span style={{flexShrink:0}}>⚠</span> {msg}
  </div>
);

/* Stitch-style field — uppercase label + optional right hint */
const Field = ({label, hint, children}) => (
  <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <label style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:".08em",textTransform:"uppercase"}}>{label}</label>
      {hint&&<span style={{fontSize:11,color:"var(--accent)",cursor:"pointer",fontWeight:500}}>{hint}</span>}
    </div>
    {children}
  </div>
);

/* Right-side icon wrapper for inputs */
const InpIcon = ({children, inp}) => (
  <div className="inp-wrap">
    {inp}
    <span className="inp-icon" style={{color:"var(--text3)"}}>{children}</span>
  </div>
);

/* Simple SVG icons — replaces emoji in module tabs */
const IcBox    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
const IcWrench = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
const IcCar    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>;
const IcCart   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;
const IcStaff  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IcUser   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcLock   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcGrid   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;

export function LoginPage({onLogin,t,lang,setLang,loadedSettings,langs=[],wsLoginOnly=false,initialError=""}) {
  // Referral: ?ref=<workshop id> jumps straight to workshop signup and gets stamped on the new account
  const [wsReferrerId] = useState(()=>new URLSearchParams(window.location.search).get("ref")||"");
  // Catalog link: ?catalog=<supplier name> jumps straight to the Customer sign-in tab and,
  // if someone registers a new account through it, scopes that account to just this
  // supplier's parts (same idea as ?ref= above, just for customers instead of workshops).
  const [catalogName] = useState(()=>new URLSearchParams(window.location.search).get("catalog")||"");
  const [catalogSupplierId,setCatalogSupplierId] = useState("");
  useEffect(()=>{
    if(!catalogName) return;
    api.get("suppliers",`name=ilike.${encodeURIComponent(catalogName.trim())}&select=id,name`).then(r=>{
      if(Array.isArray(r)&&r.length>0) setCatalogSupplierId(r[0].id);
    }).catch(()=>{});
  },[catalogName]);
  const [authTab,setAuthTab] = useState(wsLoginOnly?"workshop":(wsReferrerId?"workshop":(catalogName?"customer":"branch")));
  // branch
  const [branchName,setBranchName] = useState("");
  const [branchUser,setBranchUser] = useState(""); const [branchPass,setBranchPass] = useState("");
  // staff
  const [staffUser,setStaffUser] = useState(""); const [staffPass,setStaffPass] = useState("");
  // workshop
  const [wsCompany,setWsCompany] = useState("");
  const [wsUser,setWsUser] = useState(""); const [wsPass,setWsPass] = useState("");
  const [wsTab,setWsTab] = useState(wsReferrerId?"signup":"login");
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

  const [err,setErr] = useState(initialError); const [loading,setLoading] = useState(false);
  const [detectingLoc,setDetectingLoc] = useState(false);
  const [dbStatus, setDbStatus] = useState("checking");
  const [expiredInfo,setExpiredInfo] = useState(null);

  useEffect(()=>{
    api.get("settings","id=eq.1&select=id")
      .then(r=>setDbStatus(Array.isArray(r)&&r.length>0?"connected":"disconnected"))
      .catch(()=>setDbStatus("disconnected"));
  },[]);

  const logLogin = async (u) => {
    try {
      const g = await detectGeoLocation();
      const wx = g.lat ? await fetchWeather(g.lat, g.lon).catch(()=>({label:""})) : {label:""};
      const ua=navigator.userAgent;
      const mob=/Mobile|Android|iPhone|iPad/i.test(ua);
      const os=/Windows/.test(ua)?"Windows":/Android/.test(ua)?"Android":/iPhone/.test(ua)?"iPhone":/iPad/.test(ua)?"iPad":/Mac/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"Unknown";
      const br=/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":/OPR\/|Opera\//.test(ua)?"Opera":"Browser";
      const bv=(ua.match(/(?:Chrome|Firefox|Edg|OPR)\/(\d+)/)||[])[1]||"";
      const device=`${br}${bv?" "+bv:""} · ${os}${mob?" (mobile)":""}`;
      const device_type=/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"Apple iOS":mob?"Other Mobile":"Desktop";
      await api.upsert("login_logs",{username:u.username||u.phone,user_role:u.role||"customer",ip_address:g.ip||"?",country:g.countryFull||"?",province:g.province||"",city:g.city||"",lat:g.lat||null,lon:g.lon||null,weather:wx.label||null,device,device_type,status:"success"});
    } catch (e) { console.error("login_logs insert failed:", e); }
  };

  const doBranchLogin = async () => {
    if(!branchName||!branchUser||!branchPass){setErr("Branch name, username and password are required");return;}
    setLoading(true);setErr("");setExpiredInfo(null);
    const brRes = await api.get("branches",`name=ilike.*${encodeURIComponent(branchName.trim())}*&status=eq.active&select=id,name,status`);
    if(!Array.isArray(brRes)||brRes.length===0){setErr("Branch not found or inactive");setLoading(false);return;}
    const branch = brRes[0];
    const userRes = await api.get("users",`branch_id=eq.${branch.id}&username=eq.${encodeURIComponent(branchUser.trim())}&password=eq.${encodeURIComponent(branchPass)}&select=*`);
    if(Array.isArray(userRes)&&userRes.length>0){
      const u={...userRes[0],_branchName:branch.name};
      const accErr=checkAccess(u);
      if(accErr){setErr(accErr);setExpiredInfo({name:u.name,username:u.username,company:u._branchName});setLoading(false);return;}
      logLogin(userRes[0]);
      onLogin(u);
    } else {
      setErr("Invalid username or password");
    }
    setLoading(false);
  };

  const doStaffLogin = async () => {
    if(!staffUser||!staffPass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");setExpiredInfo(null);
    const res = await api.get("users",`username=eq.${encodeURIComponent(staffUser)}&password=eq.${encodeURIComponent(staffPass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){
      const accErr=checkAccess(res[0]);
      if(accErr){setErr(accErr);setExpiredInfo({name:res[0].name,username:res[0].username});setLoading(false);return;}
      logLogin(res[0]);onLogin(res[0]);
    } else setErr(t.wrongPass);
    setLoading(false);
  };

  const doWorkshopLogin = async () => {
    if(!wsUser||!wsPass){setErr("Fill username & password");return;}
    setLoading(true);setErr("");setExpiredInfo(null);
    const company = wsCompany.trim();
    // Check main workshop account
    let q = `username=eq.${encodeURIComponent(wsUser)}&password=eq.${encodeURIComponent(wsPass)}&role=eq.workshop&select=*`;
    if(company) q += `&name=ilike.*${encodeURIComponent(company)}*`;
    const res = await api.get("users", q);
    if(Array.isArray(res)&&res.length>0){
      const accErr=checkAccess(res[0]);
      if(accErr){setErr(accErr);setExpiredInfo({name:res[0].name,username:res[0].username,company:res[0].name});setLoading(false);return;}
      const userObj = applyPendingSpareShop(res[0]);
      logLogin(userObj);onLogin(userObj);setLoading(false);return;
    }
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
        const accErr=checkAccess(userObj);
        if(accErr){setErr(accErr);setExpiredInfo({name:wu.name||mainRes[0].name,username:wu.username,company:mainRes[0].name});setLoading(false);return;}
        logLogin({...userObj,username:wu.username});
        onLogin(userObj);
        setLoading(false);return;
      }
    }
    setErr("Invalid workshop credentials");
    setLoading(false);
  };

  const doScrapyardLogin = async () => {
    if(!scrapUser||!scrapPass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");setExpiredInfo(null);
    const company = scrapCompany.trim();
    let q = `username=eq.${encodeURIComponent(scrapUser)}&password=eq.${encodeURIComponent(scrapPass)}&role=in.(scrapyard,scrapyard_admin)&select=*`;
    if(company) q += `&name=ilike.*${encodeURIComponent(company)}*`;
    const res = await api.get("users", q);
    if(Array.isArray(res)&&res.length>0){
      const accErr=checkAccess(res[0]);
      if(accErr){setErr(accErr);setExpiredInfo({name:res[0].name,username:res[0].username,company:res[0].name});setLoading(false);return;}
      logLogin(res[0]);onLogin(res[0]);
    } else setErr(t.wrongPass);
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
    await api.upsert("workshop_profiles",{id:wsId,name:wsRegName,phone:wsRegPhone||"",email:wsRegEmail||"",city:wsRegCity,country:wsRegCountry,trial_start:today,subscription_status:"trial",subscription_expires_at:trialEnd,referral_source:wsReferrerId?"referral":"organic",referred_by_user_id:wsReferrerId||null}).catch(()=>{});
    const loginUser=Array.isArray(newUser)?newUser[0]:newUser;
    if(loginUser){logLogin({...loginUser});onLogin({...loginUser});}
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
    const newUser=await api.insert("users",{username:scrapRegUser,password:scrapRegPass,name:scrapRegName,role:"scrapyard_admin",phone:scrapRegPhone||"",email:scrapRegEmail||""}).catch(e=>{setErr("Signup failed: "+e.message);return null;});
    if(!newUser||newUser.code){setErr("Signup failed: "+(newUser?.message||"unknown error"));setLoading(false);return;}
    const loginUser=Array.isArray(newUser)?newUser[0]:newUser;
    if(!loginUser||loginUser.code){setErr("Signup failed");setLoading(false);return;}
    const profRes=await api.upsert("scrapyard_profiles",{id:loginUser.id,name:scrapRegName,phone:scrapRegPhone||"",email:scrapRegEmail||"",city:scrapRegCity,country:scrapRegCountry,trial_start:today,subscription_status:"trial",subscription_expires_at:trialEnd}).catch(()=>null);
    if(profRes?.code) setErr("Account created but profile save failed — "+(profRes.message||"check DB"));
    if(!profRes?.code){logLogin({...loginUser});onLogin({...loginUser});}
    else setErr("Account created — please log in");
    setLoading(false);
  };

  const doCustLogin = async () => {
    if(!cPhone||!cPass){setErr("Fill phone & password");return;}
    setLoading(true);setErr("");
    const res = await api.get("customers",`phone=eq.${encodeURIComponent(cPhone)}&password=eq.${encodeURIComponent(cPass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){const c=res[0];logLogin({...c,username:c.phone,role:"customer"});onLogin({...c,username:c.phone,role:"customer",_isCustomer:true});}
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
    const res = await api.upsert("customers",{name:cName,phone:cPhone,email:cEmail,password:cPass,address:"",orders:0,total_spent:0,...(catalogSupplierId?{supplier_scope_id:catalogSupplierId}:{})});
    const c=Array.isArray(res)?res[0]:null;
    if(c){logLogin({username:cPhone,role:"customer"});onLogin({...c,username:c.phone,role:"customer",_isCustomer:true});}
    else setErr("Registration failed");
    setLoading(false);
  };

  const switchTab = (tab) => { setAuthTab(tab); setErr(""); setExpiredInfo(null); };

  const waRenewLink = (() => {
    if (!expiredInfo) return null;
    const s = loadedSettings || getSettings();
    const phone = s.whatsapp || s.phone || "";
    if (!phone) return null;
    const lines = ["Hi, my account has expired and I need to renew my subscription.", ""];
    if (expiredInfo.name) lines.push(`Name: ${expiredInfo.name}`);
    if (expiredInfo.company && expiredInfo.company !== expiredInfo.name) lines.push(`Company: ${expiredInfo.company}`);
    lines.push(`Username: ${expiredInfo.username}`);
    return (
      <a href={waLink(phone, lines.join("\n"))} target="_blank" rel="noreferrer"
         style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"11px 16px",borderRadius:10,background:"#25D366",color:"#fff",fontSize:14,fontWeight:600,textDecoration:"none",marginTop:2}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
        Message Admin on WhatsApp
      </a>
    );
  })();

  const TAB_BTNS = [
    {id:"branch",   Icon:IcBox,    label:t.loginSpareShop||"Spare Shop"},
    {id:"workshop", Icon:IcWrench, label:t.loginWorkshop||"Workshop"},
    {id:"scrapyard",Icon:IcCar,    label:t.loginScrapyard||"Scrapyard"},
    {id:"customer", Icon:IcCart,   label:t.loginShop||"Parts Shop"},
    {id:"staff",    Icon:IcStaff,  label:t.loginStaff||"Staff"},
  ];

  const inpStyle = {
    width:"100%",padding:"11px 38px 11px 14px",borderRadius:9,border:"1.5px solid var(--border2)",
    background:"var(--surface)",color:"var(--text)",fontSize:14,boxSizing:"border-box",
    outline:"none",fontFamily:"inherit",transition:"border-color .15s",
  };
  const companyInpStyle = {...inpStyle, borderColor:"rgba(37,99,235,.25)", background:"rgba(37,99,235,.03)"};

  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 16px"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:480}}>

        {/* Logo card */}
        <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:14,padding:"20px",textAlign:"center",marginBottom:18,boxShadow:"var(--shadow)"}}>
          <MotorDeskBanner/>
          {langs.length>1&&(
            <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:10}}>
              {langs.map(l=>(
                <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                  {l.flag||l.lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <div style={{display:"flex",justifyContent:"center",marginTop:10}}>
            {dbStatus==="checking"&&<span style={{fontSize:11,color:"var(--text3)",display:"flex",alignItems:"center",gap:5}}><span style={{width:6,height:6,borderRadius:"50%",background:"var(--text3)",display:"inline-block",opacity:.5}}/>Checking…</span>}
            {dbStatus==="connected"&&<span style={{fontSize:11,fontWeight:600,color:"#16a34a",display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:"rgba(22,163,74,.1)",border:"1px solid rgba(22,163,74,.25)"}}><span style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",display:"inline-block"}}/>Database Connected</span>}
            {dbStatus==="disconnected"&&<span style={{fontSize:11,fontWeight:600,color:"var(--red)",display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:"rgba(220,38,38,.07)",border:"1px solid rgba(220,38,38,.2)"}}><span style={{width:6,height:6,borderRadius:"50%",background:"var(--red)",display:"inline-block"}}/>Disconnected</span>}
          </div>
        </div>

        {/* Module tabs — hidden in workshop-only mode */}
        {!wsLoginOnly&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:14}}>
          {TAB_BTNS.map(({id,Icon,label})=>(
            <button key={id} onClick={()=>switchTab(id)} style={{
              padding:"12px 4px 10px",borderRadius:12,
              border:`1.5px solid ${authTab===id?"var(--accent)":"var(--border2)"}`,
              cursor:"pointer",
              background:authTab===id?"var(--accent)":"var(--surface)",
              color:authTab===id?"#fff":"var(--text3)",
              fontWeight:authTab===id?700:500,
              fontSize:10,letterSpacing:".06em",textTransform:"uppercase",
              display:"flex",flexDirection:"column",alignItems:"center",gap:6,
              boxShadow:authTab===id?"0 4px 14px rgba(249,115,22,.25)":"none",
              transition:"all .15s",
            }}>
              <Icon/>
              <span>{label}</span>
            </button>
          ))}
        </div>
        )}

        {/* Card */}
        <div style={{background:"var(--surface)",borderRadius:16,border:"1px solid var(--border2)",boxShadow:"var(--shadow-lg)",padding:"28px 26px",overflow:"hidden"}}>

          {/* ── Branch ── */}
          {authTab==="branch"&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                <div style={{width:38,height:38,borderRadius:10,background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",flexShrink:0}}><IcBox/></div>
                <div>
                  <div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{t.loginSpareShop||"Spare Shop"} {t.signIn||"Login"}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{t.loginSpareShopSub||"Sign in to your spare parts shop"}</div>
                </div>
              </div>
              <Field label={t.branchNameField||"Branch Name"}>
                <InpIcon inp={<input style={companyInpStyle} type="text" value={branchName} onChange={e=>setBranchName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doBranchLogin()} placeholder={t.branchNamePlaceholder||"e.g. North Branch"} autoCapitalize="words"/>}><IcGrid/></InpIcon>
              </Field>
              <Field label={t.username||"Username"}>
                <InpIcon inp={<input style={inpStyle} type="text" value={branchUser} onChange={e=>setBranchUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doBranchLogin()} autoCapitalize="none" placeholder="Your login username"/>}><IcUser/></InpIcon>
              </Field>
              <Field label={t.password||"Password"}>
                <InpIcon inp={<input style={inpStyle} type="password" value={branchPass} onChange={e=>setBranchPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doBranchLogin()}/>}><IcLock/></InpIcon>
              </Field>
              {err&&<ErrBox msg={err}/>}
              {waRenewLink}
              <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doBranchLogin} disabled={loading}>
                {loading?t.connecting||"Connecting…":"Sign In →"}
              </button>
            </div>
          )}

          {/* ── Workshop ── */}
          {authTab==="workshop"&&(
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:18}}>
                <button className="auth-tab on">{t.signIn||"Sign In"}</button>
              </div>

              {wsTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                    <div style={{width:38,height:38,borderRadius:10,background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",flexShrink:0}}><IcWrench/></div>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{t.loginWorkshop||"Workshop"} {t.signIn||"Login"}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>Sign in to your workshop account</div>
                    </div>
                  </div>

                  <Field label="Company Name" hint="Optional">
                    <InpIcon inp={<input style={companyInpStyle} type="text" value={wsCompany} onChange={e=>setWsCompany(e.target.value)} placeholder="e.g. ABC Auto Workshop" autoCapitalize="words"/>}><IcGrid/></InpIcon>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Helps identify your account if multiple workshops share a username</div>
                  </Field>

                  <Field label={t.username||"Username"}>
                    <InpIcon inp={<input style={inpStyle} type="text" value={wsUser} onChange={e=>setWsUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()} autoCapitalize="none" placeholder="Your login username"/>}><IcUser/></InpIcon>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <InpIcon inp={<input style={inpStyle} type="password" value={wsPass} onChange={e=>setWsPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doWorkshopLogin()}/>}><IcLock/></InpIcon>
                  </Field>

                  {err&&<ErrBox msg={err}/>}
              {waRenewLink}
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
              {waRenewLink}
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
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                    <div style={{width:38,height:38,borderRadius:10,background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",flexShrink:0}}><IcCar/></div>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{t.loginScrapyard||"Scrapyard"} {t.signIn||"Login"}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>Sign in to your scrapyard account</div>
                    </div>
                  </div>

                  <Field label="Company Name" hint="Optional">
                    <InpIcon inp={<input style={companyInpStyle} type="text" value={scrapCompany} onChange={e=>setScrapCompany(e.target.value)} placeholder="e.g. City Scrapyard" autoCapitalize="words"/>}><IcGrid/></InpIcon>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Helps identify your account if multiple scrapyards share a username</div>
                  </Field>

                  <Field label={t.username||"Username"}>
                    <InpIcon inp={<input style={inpStyle} type="text" value={scrapUser} onChange={e=>setScrapUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doScrapyardLogin()} autoCapitalize="none" placeholder="Your login username"/>}><IcUser/></InpIcon>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <InpIcon inp={<input style={inpStyle} type="password" value={scrapPass} onChange={e=>setScrapPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doScrapyardLogin()}/>}><IcLock/></InpIcon>
                  </Field>

                  {err&&<ErrBox msg={err}/>}
              {waRenewLink}
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
              {waRenewLink}
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
              {catalogName&&(
                <div style={{background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.25)",borderRadius:9,padding:"9px 12px",marginBottom:14,fontSize:12,color:"var(--text2)"}}>
                  📦 Signing in to the <strong>{catalogName}</strong> parts catalogue
                </div>
              )}
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:18}}>
                {[["login",t.signIn||"Sign In"],["register",t.registerNew||"Register"]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${custTab===id?"on":""}`} onClick={()=>{setCustTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>

              {custTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                    <div style={{width:38,height:38,borderRadius:10,background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",flexShrink:0}}><IcCart/></div>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{t.loginShop||"Parts Shop"} {t.signIn||"Login"}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>Browse and order parts</div>
                    </div>
                  </div>
                  <Field label={t.phone||"Phone"}>
                    <InpIcon inp={<input style={inpStyle} type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/>}><IcUser/></InpIcon>
                  </Field>
                  <Field label={t.password||"Password"}>
                    <InpIcon inp={<input style={inpStyle} type="password" value={cPass} onChange={e=>setCPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustLogin()}/>}><IcLock/></InpIcon>
                  </Field>
                  {err&&<ErrBox msg={err}/>}
              {waRenewLink}
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
              {waRenewLink}
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
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                <div style={{width:38,height:38,borderRadius:10,background:"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",flexShrink:0}}><IcStaff/></div>
                <div>
                  <div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{t.loginStaff||"Staff"} {t.signIn||"Login"}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>Admin, manager and fulfilment access</div>
                </div>
              </div>
              <Field label={t.username||"Username"}>
                <InpIcon inp={<input style={inpStyle} type="text" value={staffUser} onChange={e=>setStaffUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doStaffLogin()} autoCapitalize="none" placeholder="Username"/>}><IcUser/></InpIcon>
              </Field>
              <Field label={t.password||"Password"}>
                <InpIcon inp={<input style={inpStyle} type="password" value={staffPass} onChange={e=>setStaffPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doStaffLogin()}/>}><IcLock/></InpIcon>
              </Field>
              {err&&<ErrBox msg={err}/>}
              {waRenewLink}
              <button className="btn btn-primary" style={{width:"100%",padding:"13px",fontSize:15,borderRadius:10,marginTop:2}} onClick={doStaffLogin} disabled={loading}>
                {loading?t.connecting||"Connecting…":"Sign In →"}
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:18}}>
          <span style={{fontSize:11,color:"var(--text3)",cursor:"pointer",fontWeight:500,letterSpacing:".03em"}} onClick={()=>{}}>Help Desk</span>
          <span style={{fontSize:11,color:"var(--border2)"}}>|</span>
          <span style={{fontSize:11,color:"var(--text3)",cursor:"pointer",fontWeight:500,letterSpacing:".03em"}} onClick={()=>{}}>Security Policy</span>
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

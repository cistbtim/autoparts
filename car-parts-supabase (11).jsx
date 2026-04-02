import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// 🔧 CONFIG — only change these 2 lines
// ============================================================
const SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_KEY";

// ── API ──────────────────────────────────────────────────────
const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });
const api = {
  get:    async (t, q="") => (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${q}`, {headers:H()})).json(),
  upsert: async (t, d)    => (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {method:"POST", headers:H({Prefer:"return=representation,resolution=merge-duplicates"}), body:JSON.stringify(d)})).json(),
  patch:  async (t, c, v, d) => (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, {method:"PATCH", headers:H({Prefer:"return=representation"}), body:JSON.stringify(d)})).json(),
  delete: async (t, c, v) => fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, {method:"DELETE", headers:H()}),
  insert: async (t, d)    => (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {method:"POST", headers:H({Prefer:"return=representation"}), body:JSON.stringify(d)})).json(),
};

// ── Settings cache ────────────────────────────────────────────
let _settings = { shop_name:"AutoParts", currency:"NT$", whatsapp:"", email:"", phone:"", address:"", tax_rate:0, invoice_prefix:"INV", credit_note_prefix:"CN" };
const getSettings = () => _settings;
const loadSettings = async () => { try { const r = await api.get("settings","id=eq.1&select=*"); if(Array.isArray(r)&&r[0]) _settings={..._settings,...r[0]}; } catch{} return _settings; };
const C = () => getSettings().currency || "NT$";

// ── i18n ─────────────────────────────────────────────────────
const T = {
  en:{
    appSub:"Parts Management System", dashboard:"Dashboard", inventory:"Inventory",
    shop:"Shop", orders:"Orders", myOrders:"My Orders", customers:"Customers",
    users:"Users", suppliers:"Suppliers", inquiries:"Inquiries", logs:"Stock Logs",
    loginLogs:"Login Logs", logout:"Sign Out", cart:"Cart", login:"Sign In",
    settings:"Settings", purchaseInvoices:"Purchase Invoices", supplierReturns:"Supplier Returns",
    salesInvoices:"Sales Invoices", customerReturns:"Customer Returns",
    username:"Username", password:"Password", connecting:"Loading...",
    wrongPass:"Invalid username or password", addPart:"Add Part",
    adjustStock:"Adjust", save:"Save", cancel:"Cancel", delete:"Delete",
    edit:"Edit", close:"Close", confirm:"Confirm", sku:"SKU", name:"Name",
    category:"Category", brand:"Brand", price:"Price", stock:"Stock",
    minStock:"Min Stock", status:"Status", normal:"OK", low:"Low", outOfStock:"Out of Stock",
    placeOrder:"Place Order", addToCart:"Add to Cart", checkout:"Checkout",
    orderHistory:"Order History", totalSpent:"Total Spent", addSupplier:"Add Supplier",
    supplierName:"Supplier Name", email:"Email", phone:"Phone", country:"Country",
    contactPerson:"Contact", pending:"Pending", replied:"Replied", closed:"Closed",
    paid:"Paid", unpaid:"Unpaid", partial:"Partial", approved:"Approved",
    role:"Role", admin:"Admin", shipper:"Shipper", customer:"Customer",
    revenue:"Revenue", pendingOrders:"Pending", lowStock:"Low Stock", parts:"Parts",
    all:"All", total:"Total", subtotal:"Subtotal", tax:"Tax", orders_count:"Orders",
    image_url:"Photo URL (Google Drive)", gdrive_hint:"Paste share link — auto converted",
    lead_time:"Lead Time", min_order:"Min Order", supplier_price:"Supplier Price",
    notes:"Notes", message:"Message", send:"Send Inquiry",
    invoice:"Invoice", invoiceNo:"Invoice No", invoiceDate:"Invoice Date", dueDate:"Due Date",
    unitCost:"Unit Cost", unitPrice:"Unit Price", qty:"Qty", amount:"Amount",
    supplierPartId:"Supplier Part ID", addLine:"Add Line",
    returnNote:"Return / Credit Note", returnDate:"Return Date", reason:"Reason",
    stockIn:"Stock In", stockOut:"Stock Out", createInvoice:"Create Invoice",
    createReturn:"Create Return", shopName:"Shop Name", currency:"Currency",
    taxRate:"Tax Rate (%)", invoicePrefix:"Invoice Prefix", whatsappNo:"WhatsApp Number",
    shopEmail:"Shop Email", shopPhone:"Shop Phone", shopAddress:"Shop Address",
    saveSettings:"Save Settings", demoAccounts:"Demo Accounts",
    selectSuppliers:"Select Suppliers", sendToSelected:"Send to Selected",
  },
  zh:{
    appSub:"零件管理銷售系統", dashboard:"儀表板", inventory:"庫存管理",
    shop:"線上商店", orders:"訂單管理", myOrders:"我的訂單", customers:"客戶管理",
    users:"用戶管理", suppliers:"供應商", inquiries:"詢價管理", logs:"庫存記錄",
    loginLogs:"登入記錄", logout:"登出", cart:"購物車", login:"登入",
    settings:"系統設定", purchaseInvoices:"進貨單", supplierReturns:"供應商退貨",
    salesInvoices:"銷售發票", customerReturns:"客戶退貨",
    username:"帳號", password:"密碼", connecting:"載入中...",
    wrongPass:"帳號或密碼錯誤", addPart:"新增零件",
    adjustStock:"調整庫存", save:"儲存", cancel:"取消", delete:"刪除",
    edit:"編輯", close:"關閉", confirm:"確認", sku:"料號", name:"名稱",
    category:"分類", brand:"品牌", price:"單價", stock:"庫存",
    minStock:"最低庫存", status:"狀態", normal:"正常", low:"庫存低", outOfStock:"缺貨",
    placeOrder:"確認下單", addToCart:"加入購物車", checkout:"結帳",
    orderHistory:"訂單歷史", totalSpent:"總消費", addSupplier:"新增供應商",
    supplierName:"供應商名稱", email:"Email", phone:"電話", country:"國家",
    contactPerson:"聯絡人", pending:"待處理", replied:"已回覆", closed:"已關閉",
    paid:"已付款", unpaid:"未付款", partial:"部分付款", approved:"已核准",
    role:"角色", admin:"管理員", shipper:"出貨員", customer:"客戶",
    revenue:"完成營收", pendingOrders:"待處理", lowStock:"低庫存", parts:"零件數",
    all:"全部", total:"合計", subtotal:"小計", tax:"稅額", orders_count:"訂單數",
    image_url:"圖片網址 (Google Drive)", gdrive_hint:"貼上分享連結，自動轉換",
    lead_time:"交貨期", min_order:"最小訂量", supplier_price:"供應商報價",
    notes:"備註", message:"訊息", send:"發送詢價",
    invoice:"發票", invoiceNo:"發票號碼", invoiceDate:"發票日期", dueDate:"到期日",
    unitCost:"單位成本", unitPrice:"單價", qty:"數量", amount:"金額",
    supplierPartId:"供應商料號", addLine:"新增項目",
    returnNote:"退貨/折讓單", returnDate:"退貨日期", reason:"原因",
    stockIn:"入庫", stockOut:"出庫", createInvoice:"建立發票",
    createReturn:"建立退貨", shopName:"商店名稱", currency:"幣別",
    taxRate:"稅率 (%)", invoicePrefix:"發票前綴", whatsappNo:"WhatsApp號碼",
    shopEmail:"商店Email", shopPhone:"商店電話", shopAddress:"商店地址",
    saveSettings:"儲存設定", demoAccounts:"測試帳號",
    selectSuppliers:"選擇供應商", sendToSelected:"發送給已選",
  }
};

// ── Helpers ───────────────────────────────────────────────────
const toImgUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};
const today = () => new Date().toISOString().slice(0,10);
const fmtAmt = (n) => `${C()}${(n||0).toLocaleString()}`;
const makeId = (prefix) => `${prefix}-${Date.now()}`;
const makeToken = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const waLink = (phone, msg) => `https://wa.me/${(phone||"").replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(msg)}`;
const mailLink = (to, subj, body) => `mailto:${to||""}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;

const ROLES = {
  admin:    { color:"#f97316", bg:"rgba(249,115,22,0.12)", icon:"👑" },
  shipper:  { color:"#60a5fa", bg:"rgba(96,165,250,0.12)", icon:"🚚" },
  customer: { color:"#34d399", bg:"rgba(52,211,153,0.12)", icon:"👤" },
};
const OC = { "已完成":"#34d399","待出貨":"#fbbf24","處理中":"#60a5fa","已取消":"#f87171" };
const CATS_EN = ["All","Engine","Brake","Filter","Electrical","Suspension"];
const CATS_ZH = ["全部","引擎","煞車系統","濾清系統","電氣系統","懸吊系統"];

const TRIAL_DAYS = 30;
const getSubInfo = (u) => {
  if(!u||u.role==="admin") return {status:"admin",label:"Admin",color:"#f97316"};
  const s = u.subscription_status||"trial";
  if(s==="active") return {status:"active",label:"✅ Active",color:"#34d399"};
  if(s==="blocked"||s==="expired") return {status:s,label:s==="blocked"?"🚫 Blocked":"⏰ Expired",color:"#f87171"};
  const days = Math.max(0, TRIAL_DAYS - Math.floor((Date.now()-new Date(u.trial_start||Date.now()))/86400000));
  if(days<=0) return {status:"expired",label:"⏰ Expired",color:"#f87171",days:0};
  return {status:"trial",label:`Trial: ${days}d`,color:days<=5?"#fbbf24":"#60a5fa",days};
};
const canAccess = (u) => { if(!u)return false; if(u.role==="admin")return true; const s=getSubInfo(u); return s.status==="active"||s.status==="trial"; };

// ── CSS ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Rajdhani:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
:root{--bg:#080b12;--surface:#0f1420;--surface2:#161c2d;--surface3:#1d2540;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);--accent:#f97316;--accent2:#fb923c;--text:#f1f5f9;--text2:#94a3b8;--text3:#475569;--green:#34d399;--red:#f87171;--blue:#60a5fa;--yellow:#fbbf24;--purple:#a78bfa;--radius:14px;--radius-sm:8px;--shadow:0 4px 24px rgba(0,0,0,0.4);--shadow-lg:0 8px 48px rgba(0,0,0,0.6);--glow:0 0 20px rgba(249,115,22,0.15)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:99px}
input,select,textarea{outline:none;font-family:'DM Sans',sans-serif}
.btn{cursor:pointer;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;transition:all .18s;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.btn:disabled{opacity:.4;cursor:not-allowed!important;transform:none!important}
.btn-primary{background:var(--accent);color:#fff;padding:10px 20px;box-shadow:0 4px 12px rgba(249,115,22,0.3)}.btn-primary:hover{background:var(--accent2);transform:translateY(-1px)}
.btn-ghost{background:var(--surface2);color:var(--text2);padding:10px 20px;border:1px solid var(--border2)}.btn-ghost:hover{background:var(--surface3);color:var(--text)}
.btn-success{background:rgba(52,211,153,.15);color:var(--green);padding:7px 14px;border:1px solid rgba(52,211,153,.25)}.btn-success:hover{background:rgba(52,211,153,.25)}
.btn-danger{background:rgba(248,113,113,.12);color:var(--red);padding:7px 14px;border:1px solid rgba(248,113,113,.2)}.btn-danger:hover{background:rgba(248,113,113,.2)}
.btn-info{background:rgba(96,165,250,.12);color:var(--blue);padding:7px 14px;border:1px solid rgba(96,165,250,.2)}.btn-info:hover{background:rgba(96,165,250,.2)}
.btn-purple{background:rgba(167,139,250,.12);color:var(--purple);padding:7px 14px;border:1px solid rgba(167,139,250,.2)}.btn-purple:hover{background:rgba(167,139,250,.2)}
.btn-sm{padding:6px 12px;font-size:13px}.btn-xs{padding:4px 10px;font-size:12px}
.inp{width:100%;background:var(--surface2);border:1.5px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:10px 13px;font-size:14px;font-family:'DM Sans',sans-serif;transition:border .18s}
.inp:focus{border-color:var(--accent)}.inp::placeholder{color:var(--text3)}
select.inp{cursor:pointer}textarea.inp{resize:vertical;min-height:72px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.card-hover:hover{border-color:var(--border2)}
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.tbl{width:100%;border-collapse:collapse}
.tbl th{padding:11px 14px;text-align:left;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border);white-space:nowrap}
.tbl td{padding:13px 14px;font-size:14px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}.tbl tr:hover td{background:var(--surface2)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:0}
@media(min-width:640px){.overlay{align-items:center;padding:20px}}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius) var(--radius) 0 0;padding:24px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;animation:slideUp .2s ease}
@media(min-width:640px){.modal{border-radius:var(--radius);animation:fadeUp .18s ease}}
.modal-wide{max-width:820px}
.tabs{display:flex;background:var(--surface2);border-radius:var(--radius-sm);padding:3px;gap:2px;overflow-x:auto}
.tab{background:none;border:none;cursor:pointer;color:var(--text3);padding:7px 14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;border-radius:6px;transition:all .18s;white-space:nowrap;flex-shrink:0}
.tab.on{background:var(--surface);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.3)}.tab:hover:not(.on){color:var(--text2)}
.lang{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text2);padding:4px 10px;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .18s}
.lang.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.auth-tab{flex:1;padding:10px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;border-bottom:2px solid transparent;transition:all .18s}
.auth-tab.on{color:var(--accent);border-bottom-color:var(--accent)}
.part-img{width:42px;height:42px;border-radius:8px;object-fit:cover;border:1px solid var(--border);flex-shrink:0}
.part-emoji{width:42px;height:42px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.lbl{font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px;display:block}
.divider{border:none;border-top:1px solid var(--border);margin:14px 0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface3);border:1px solid var(--border2);color:var(--text);padding:11px 22px;border-radius:99px;font-size:14px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:var(--shadow-lg);animation:fadeUp .25s ease}
.landscape-hint{display:none;position:fixed;inset:0;background:rgba(8,11,18,.97);z-index:9999;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:30px}
@media(max-width:767px) and (orientation:portrait){.landscape-hint{display:flex}}
.rotate-icon{font-size:50px;animation:rotateHint 2s ease-in-out infinite}
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);padding:6px 4px;z-index:100;gap:1px}
@media(max-width:767px){
  .mobile-nav{display:flex}.sidebar{display:none!important}
  .main-content{margin-left:0!important;padding:14px!important;padding-bottom:80px!important}
  .page-header{flex-direction:column;align-items:flex-start;gap:10px}
  .grid-4{grid-template-columns:1fr 1fr!important}.hide-mobile{display:none!important}
  .toast{bottom:86px}
}
.mob-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;border-radius:8px;transition:all .18s;position:relative}
.mob-nav-btn.on{color:var(--accent)}.mob-nav-btn .mi{font-size:18px;line-height:1}
.mob-badge{position:absolute;top:3px;right:calc(50% - 16px);background:var(--accent);color:#fff;border-radius:99px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;padding:0 3px}
.stat-card{position:relative;overflow:hidden;padding:20px 22px;border-radius:var(--radius)}
.stat-card::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at top right,var(--gc,transparent) 0%,transparent 70%);pointer-events:none}
.chk{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0}
.inv-table{width:100%;border-collapse:collapse;font-size:13px}
.inv-table th{background:var(--surface2);padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em}
.inv-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes rotateHint{0%,100%{transform:rotate(0deg)}50%{transform:rotate(90deg)}}
@keyframes spin{to{transform:rotate(360deg)}}
.fu{animation:fadeUp .2s ease}
`;

// ── Shared UI ─────────────────────────────────────────────────
const LandscapeHint = ({lang}) => (
  <div className="landscape-hint">
    <div className="rotate-icon">📱</div>
    <div style={{fontSize:20,fontWeight:700}}>{lang==="zh"?"請旋轉設備":"Rotate Your Device"}</div>
    <div style={{color:"var(--text3)",fontSize:14,maxWidth:260,lineHeight:1.7}}>{lang==="zh"?"橫向使用以獲得最佳體驗":"Please rotate to landscape for best experience"}</div>
  </div>
);

const Overlay = ({onClose,children,wide}) => (
  <div className="overlay" onClick={onClose}>
    <div className={`modal${wide?" modal-wide":""}`} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);
const MHead = ({title,sub,onClose}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
    <div><h2 style={{fontSize:18,fontWeight:700}}>{title}</h2>{sub&&<p style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{sub}</p>}</div>
    <button className="btn btn-ghost btn-sm" onClick={onClose} style={{flexShrink:0}}>✕</button>
  </div>
);
const FL = ({label,req}) => <span className="lbl">{label}{req&&" *"}</span>;
const FG = ({children,cols="1fr 1fr"}) => <div style={{display:"grid",gridTemplateColumns:cols,gap:12,marginBottom:14}}>{children}</div>;
const FD = ({children}) => <div style={{marginBottom:14}}>{children}</div>;

const StatusBadge = ({status}) => {
  const MAP = {
    "已完成":["rgba(52,211,153,.15)","#34d399"],"已付款":["rgba(52,211,153,.15)","#34d399"],
    "approved":["rgba(52,211,153,.15)","#34d399"],"paid":["rgba(52,211,153,.15)","#34d399"],
    "待出貨":["rgba(251,191,36,.15)","#fbbf24"],"partial":["rgba(251,191,36,.15)","#fbbf24"],
    "處理中":["rgba(96,165,250,.15)","#60a5fa"],"pending":["rgba(96,165,250,.15)","#60a5fa"],
    "已取消":["rgba(248,113,113,.15)","#f87171"],"已取消":["rgba(248,113,113,.15)","#f87171"],
    "unpaid":["rgba(248,113,113,.15)","#f87171"],"replied":["rgba(52,211,153,.15)","#34d399"],
    "closed":["rgba(71,85,105,.3)","#94a3b8"],
  };
  const [bg,col] = MAP[status]||["rgba(71,85,105,.3)","#94a3b8"];
  return <span className="badge" style={{background:bg,color:col}}>{status}</span>;
};

// ── Login Page ────────────────────────────────────────────────
function LoginPage({onLogin,t,lang,setLang}) {
  const [authTab,setAuthTab] = useState("staff");
  const [user,setUser] = useState(""); const [pass,setPass] = useState("");
  const [custTab,setCustTab] = useState("login");
  const [cName,setCName] = useState(""); const [cPhone,setCPhone] = useState("");
  const [cEmail,setCEmail] = useState(""); const [cPass,setCPass] = useState(""); const [cPass2,setCPass2] = useState("");
  const [err,setErr] = useState(""); const [loading,setLoading] = useState(false);

  const logLogin = async (u) => { try { const g=await(await fetch("https://ipapi.co/json/")).json(); await api.upsert("login_logs",{username:u.username||u.phone,user_role:u.role||"customer",ip_address:g.ip||"?",country:`${g.country_name||"?"} ${g.country_flag_emoji||""}`.trim(),city:g.city||"",device:navigator.userAgent.slice(0,100),status:"success"}); } catch{} };

  const doStaffLogin = async () => {
    if(!user||!pass){setErr(t.wrongPass);return;}
    setLoading(true);setErr("");
    const res = await api.get("users",`username=eq.${encodeURIComponent(user)}&password=eq.${encodeURIComponent(pass)}&select=*`);
    if(Array.isArray(res)&&res.length>0){await logLogin(res[0]);onLogin(res[0]);}
    else setErr(t.wrongPass);
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
      <style>{CSS}</style><LandscapeHint lang={lang}/>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:36,fontWeight:700,color:"var(--accent)",letterSpacing:2,lineHeight:1}}>⚙ AUTO<span style={{color:"var(--text)"}}>PARTS</span></div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:5}}>{t.appSub}</div>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12}}>
            <button className={`lang ${lang==="en"?"on":""}`} onClick={()=>setLang("en")}>EN</button>
            <button className={`lang ${lang==="zh"?"on":""}`} onClick={()=>setLang("zh")}>中文</button>
          </div>
        </div>
        <div style={{display:"flex",background:"var(--surface2)",borderRadius:12,padding:4,marginBottom:18,border:"1px solid var(--border)"}}>
          {[["staff","🏢 "+(lang==="zh"?"員工":"Staff")],["customer","👤 "+(lang==="zh"?"客戶":"Customer")]].map(([id,lb])=>(
            <button key={id} onClick={()=>{setAuthTab(id);setErr("");}} style={{flex:1,padding:10,background:authTab===id?"var(--accent)":"none",color:authTab===id?"#fff":"var(--text3)",border:"none",borderRadius:9,cursor:"pointer",fontSize:14,fontWeight:authTab===id?700:500,fontFamily:"DM Sans,sans-serif",transition:"all .18s"}}>{lb}</button>
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
          {authTab==="customer"&&(
            <div>
              <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:20}}>
                {[["login",lang==="zh"?"已有帳號":"Sign In"],["register",lang==="zh"?"新客戶":"Register"]].map(([id,lb])=>(
                  <button key={id} className={`auth-tab ${custTab===id?"on":""}`} onClick={()=>{setCustTab(id);setErr("");}}>{lb}</button>
                ))}
              </div>
              {custTab==="login"&&(
                <div style={{display:"flex",flexDirection:"column",gap:13}}>
                  <div><FL label={t.phone}/><input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+886..."/></div>
                  <div><FL label={t.password}/><input className="inp" type="password" value={cPass} onChange={e=>setCPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustLogin()}/></div>
                  {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={doCustLogin} disabled={loading}>{loading?t.connecting:t.login}</button>
                  <p style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>{lang==="zh"?"沒有帳號？":"No account? "}<span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCustTab("register");setErr("");}}>{lang==="zh"?"立即註冊":"Register"}</span></p>
                </div>
              )}
              {custTab==="register"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div><FL label={lang==="zh"?"姓名 *":"Name *"}/><input className="inp" value={cName} onChange={e=>setCName(e.target.value)}/></div>
                  <div><FL label={lang==="zh"?"手機 *":"Phone *"}/><input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+886..."/></div>
                  <div><FL label="Email"/><input className="inp" type="email" value={cEmail} onChange={e=>setCEmail(e.target.value)}/></div>
                  <div><FL label={lang==="zh"?"密碼 *":"Password *"}/><input className="inp" type="password" value={cPass} onChange={e=>setCPass(e.target.value)}/></div>
                  <div><FL label={lang==="zh"?"確認密碼 *":"Confirm *"}/><input className="inp" type="password" value={cPass2} onChange={e=>setCPass2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustRegister()}/></div>
                  {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={doCustRegister} disabled={loading}>{loading?t.connecting:(lang==="zh"?"立即註冊":"Create Account")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Paywall ───────────────────────────────────────────────────
function PaywallPage({user,onLogout,lang}) {
  const s = getSettings();
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{maxWidth:420,width:"100%",textAlign:"center"}}>
        <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:32,fontWeight:700,color:"var(--accent)"}}>⚙ AUTO<span style={{color:"var(--text)"}}>PARTS</span></div>
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

// ── RFQ Public Reply Page ─────────────────────────────────────
function RfqReplyPage({token,lang}) {
  const [inq,setInq]=useState(null);const [loaded,setLoaded]=useState(false);
  const [rp,setRp]=useState("");const [rs,setRs]=useState("");const [rn,setRn]=useState("");
  const [done,setDone]=useState(false);const [err,setErr]=useState("");
  useEffect(()=>{api.get("inquiries",`rfq_token=eq.${token}&select=*`).then(r=>{if(Array.isArray(r)&&r.length>0)setInq(r[0]);else setErr("Inquiry not found or expired");setLoaded(true);});},[]); 
  const submit = async()=>{if(!rp&&!rs){setErr("Enter price or stock");return;}await api.patch("inquiries","rfq_token",token,{reply_price:rp?+rp:null,reply_stock:rs?+rs:null,reply_notes:rn,status:"replied",replied_at:new Date().toISOString()});setDone(true);};
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{textAlign:"center",marginBottom:24}}><div style={{fontFamily:"Rajdhani,sans-serif",fontSize:28,fontWeight:700,color:"var(--accent)"}}>⚙ AUTO<span style={{color:"var(--text)"}}>PARTS</span></div><div style={{color:"var(--text3)",fontSize:12,marginTop:3}}>Supplier Quotation Portal</div></div>
        <div className="card" style={{padding:26}}>
          {!loaded&&<p style={{color:"var(--text3)",textAlign:"center",padding:30}}>Loading...</p>}
          {err&&<div style={{color:"var(--red)",textAlign:"center",padding:30}}>⚠ {err}</div>}
          {done&&<div style={{textAlign:"center",padding:30}}><div style={{fontSize:44,marginBottom:12}}>✅</div><h2 style={{fontSize:18,fontWeight:700,marginBottom:8}}>Quote Submitted!</h2><p style={{color:"var(--text3)"}}>Thank you. We will review and get back to you.</p></div>}
          {inq&&!done&&(
            <>
              <MHead title="📩 Request for Quotation" onClose={()=>{}} />
              <div style={{background:"var(--surface2)",borderRadius:10,padding:14,marginBottom:18,border:"1px solid var(--border)"}}>
                <FG cols="1fr 1fr"><div><FL label="Part"/><div style={{fontWeight:600}}>{inq.part_name}</div></div><div><FL label="SKU"/><div style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inq.part_sku||"—"}</div></div><div><FL label="Qty Requested"/><div style={{fontWeight:700,color:"var(--accent)",fontSize:16}}>{inq.qty_requested}</div></div><div><FL label="Inquiry ID"/><div style={{fontSize:12,color:"var(--text3)"}}>{inq.id}</div></div></FG>
                {inq.message&&<div style={{borderTop:"1px solid var(--border)",paddingTop:10,fontSize:13,color:"var(--text2)",whiteSpace:"pre-line",lineHeight:1.7}}>{inq.message}</div>}
              </div>
              <FG><div><FL label="Your Price *"/><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="0"/></div><div><FL label="Available Stock *"/><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)}/></div></FG>
              <FD><FL label="Notes / Lead time"/><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)} placeholder="Lead time, MOQ, conditions..."/></FD>
              {err&&<p style={{color:"var(--red)",fontSize:13,marginBottom:10}}>⚠ {err}</p>}
              <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={submit}>Submit My Quotation</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const [lang,setLang] = useState(localStorage.getItem("ap_lang")||"en");
  const [user,setUser] = useState(null);
  const [settingsLoaded,setSettingsLoaded] = useState(false);
  const changeLang = (l)=>{setLang(l);localStorage.setItem("ap_lang",l);};
  const t = T[lang];

  useEffect(()=>{ loadSettings().then(()=>setSettingsLoaded(true)); },[]);

  const rfqToken = new URLSearchParams(window.location.search).get("rfq");
  if(rfqToken) return <RfqReplyPage token={rfqToken} lang={lang}/>;
  if(!settingsLoaded) return <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{color:"var(--accent)",fontSize:15,fontWeight:600}}>⚙ Loading...</div></div>;
  if(!user) return <LoginPage onLogin={setUser} t={t} lang={lang} setLang={changeLang}/>;
  if(!canAccess(user)) return <PaywallPage user={user} onLogout={()=>setUser(null)} lang={lang}/>;
  return <MainApp user={user} onLogout={()=>setUser(null)} t={t} lang={lang} setLang={changeLang}/>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
function MainApp({user,onLogout,t,lang,setLang}) {
  const role = user.role;
  const initTab = role==="customer"?"shop":role==="shipper"?"orders":"dashboard";
  const [tab,setTab] = useState(initTab);
  // Data
  const [parts,setParts]=useState([]);
  const [orders,setOrders]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [users,setUsers]=useState([]);
  const [logs,setLogs]=useState([]);
  const [loginLogs,setLoginLogs]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [partSuppliers,setPartSuppliers]=useState([]);
  const [inquiries,setInquiries]=useState([]);
  const [supplierInvoices,setSupplierInvoices]=useState([]);
  const [customerInvoices,setCustomerInvoices]=useState([]);
  const [supplierReturns,setSupplierReturns]=useState([]);
  const [customerReturns,setCustomerReturns]=useState([]);
  const [settings,setSettings]=useState(getSettings());
  const [loading,setLoading]=useState(true);
  const [cart,setCart]=useState([]);
  // Filters
  const [searchPart,setSearchPart]=useState("");
  const [filterCat,setFilterCat]=useState(lang==="en"?"All":"全部");
  const [filterOS,setFilterOS]=useState(lang==="en"?"All":"全部");
  const [searchCust,setSearchCust]=useState("");
  const [toast,setToast]=useState(null);
  // Modals
  const [M,setM]=useState({});
  const openM=(k,data)=>setM(p=>({...p,[k]:{open:true,data:data??null}}));
  const closeM=(k)=>setM(p=>({...p,[k]:{open:false,data:null}}));
  const isOpen=(k)=>M[k]?.open===true;
  const mData=(k)=>M[k]?.data??null;

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  const logInv=async(part,before,after,action,reason="")=>{
    await api.upsert("inventory_logs",{part_id:part.id,part_name:part.name,part_sku:part.sku,action,qty_before:before,qty_after:after,changed_by:user.name||user.username,reason});
  };

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const [p,o,c,u,l,ll,s,ps,inq,si,ci,sr,cr,st]=await Promise.all([
      api.get("parts","select=*&order=id.asc"),
      api.get("orders","select=*&order=created_at.desc"),
      api.get("customers","select=*&order=total_spent.desc"),
      api.get("users","select=*&order=id.asc"),
      api.get("inventory_logs","select=*&order=created_at.desc&limit=200"),
      api.get("login_logs","select=*&order=created_at.desc&limit=200"),
      api.get("suppliers","select=*&order=name.asc"),
      api.get("part_suppliers","select=*"),
      api.get("inquiries","select=*&order=created_at.desc"),
      api.get("supplier_invoices","select=*&order=created_at.desc"),
      api.get("customer_invoices","select=*&order=created_at.desc"),
      api.get("supplier_returns","select=*&order=created_at.desc"),
      api.get("customer_returns","select=*&order=created_at.desc"),
      api.get("settings","id=eq.1&select=*"),
    ]);
    setParts(Array.isArray(p)?p:[]);
    setOrders(Array.isArray(o)?o:[]);
    setCustomers(Array.isArray(c)?c:[]);
    setUsers(Array.isArray(u)?u:[]);
    setLogs(Array.isArray(l)?l:[]);
    setLoginLogs(Array.isArray(ll)?ll:[]);
    setSuppliers(Array.isArray(s)?s:[]);
    setPartSuppliers(Array.isArray(ps)?ps:[]);
    setInquiries(Array.isArray(inq)?inq:[]);
    setSupplierInvoices(Array.isArray(si)?si:[]);
    setCustomerInvoices(Array.isArray(ci)?ci:[]);
    setSupplierReturns(Array.isArray(sr)?sr:[]);
    setCustomerReturns(Array.isArray(cr)?cr:[]);
    if(Array.isArray(st)&&st[0]){const ns={..._settings,...st[0]};_settings=ns;setSettings(ns);}
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[]);

  // Cart
  const addToCart=(part)=>{setCart(p=>{const ex=p.find(i=>i.id===part.id);return ex?p.map(i=>i.id===part.id?{...i,qty:i.qty+1}:i):[...p,{...part,qty:1}];});showToast(`Added: ${part.name}`);};
  const removeFromCart=(id)=>setCart(p=>p.filter(i=>i.id!==id));
  const qtyCart=(id,qty)=>{if(qty<1)return;setCart(p=>p.map(i=>i.id===id?{...i,qty}:i));};
  const cartTotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const cartCount=cart.reduce((s,i)=>s+i.qty,0);

  // Orders
  const placeOrder=async(form)=>{
    if(!form.name||!form.phone){showToast("Fill name & phone","err");return;}
    const oid=makeId("ORD");
    const orderObj={id:oid,customer_name:form.name,customer_phone:form.phone,customer_email:form.email||"",date:today(),status:"處理中",items:cart.map(i=>({partId:i.id,qty:i.qty,name:i.name,price:i.price})),total:cartTotal};
    await api.upsert("orders",orderObj);
    for(const ci of cart){const p=parts.find(p=>p.id===ci.id);if(p){const ns=Math.max(0,p.stock-ci.qty);await api.patch("parts","id",ci.id,{stock:ns});await logInv(p,p.stock,ns,"Order Deduct",oid);}}
    const ex=customers.find(c=>c.phone===form.phone);
    if(ex) await api.patch("customers","phone",form.phone,{orders:ex.orders+1,total_spent:ex.total_spent+cartTotal});
    else await api.upsert("customers",{name:form.name,phone:form.phone,email:form.email||"",address:form.address||"",orders:1,total_spent:cartTotal});
    await loadAll();setCart([]);closeM("checkout");
    openM("orderConfirm",{order:orderObj,phone:form.phone,email:form.email||""});
    setTab(role==="customer"?"myorders":"orders");
  };

  const updateOrderStatus=async(id,ns)=>{
    const o=orders.find(o=>o.id===id);if(!o)return;
    const wasC=o.status==="已取消",nowC=ns==="已取消";
    if(!wasC&&nowC&&Array.isArray(o.items)){for(const item of o.items){const p=parts.find(p=>p.id===item.partId);if(p){await api.patch("parts","id",item.partId,{stock:p.stock+item.qty});await logInv(p,p.stock,p.stock+item.qty,"Cancel Restore",id);}}showToast("Cancelled — stock restored","err");}
    else if(wasC&&!nowC&&Array.isArray(o.items)){for(const item of o.items){const p=parts.find(p=>p.id===item.partId);if(p){const ns2=Math.max(0,p.stock-item.qty);await api.patch("parts","id",item.partId,{stock:ns2});await logInv(p,p.stock,ns2,"Order Restore",id);}}showToast("Order restored");}
    else showToast("Status updated");
    await api.patch("orders","id",id,{status:ns});await loadAll();
  };

  // Parts
  const savePart=async(data)=>{
    const ep=mData("editPart");
    if(ep){await api.patch("parts","id",ep.id,data);if(ep.stock!==data.stock)await logInv({...ep,...data},ep.stock,data.stock,"Edit Part","Admin edit");showToast("Part updated");}
    else{const r=await api.upsert("parts",{...data});await logInv(Array.isArray(r)?r[0]:data,0,data.stock,"New Part","Added");showToast("Part added");}
    await loadAll();closeM("editPart");
  };
  const deletePart=async(id)=>{const p=parts.find(p=>p.id===id);if(p)await logInv(p,p.stock,0,"Delete Part","Deleted");await api.delete("parts","id",id);await loadAll();showToast("Deleted","err");};
  const applyAdjust=async(part,nq,reason)=>{await api.patch("parts","id",part.id,{stock:nq});await logInv(part,part.stock,nq,"Manual Adj.",reason||"Manual");await loadAll();closeM("adjust");showToast(`Stock → ${nq}`);};

  // Suppliers
  const saveSupplier=async(data)=>{const es=mData("editSupplier");if(es)await api.patch("suppliers","id",es.id,data);else await api.upsert("suppliers",data);await loadAll();closeM("editSupplier");showToast(es?"Supplier updated":"Supplier added");};
  const deleteSupplier=async(id)=>{await api.delete("suppliers","id",id);await loadAll();showToast("Deleted","err");};
  const savePartSupplier=async(data)=>{await api.upsert("part_suppliers",data);await loadAll();showToast("Linked");};
  const deletePartSupplier=async(id)=>{await api.delete("part_suppliers","id",id);await loadAll();showToast("Removed","err");};

  // Inquiries
  const sendInquiry=async(data)=>{
    const token=makeToken();
    await api.upsert("inquiries",{id:makeId("INQ"),...data,rfq_token:token,created_by:user.name||user.username,status:"pending"});
    await loadAll();closeM("inquiry");openM("rfqSend",{...data,token});
  };
  const updateInquiry=async(id,data)=>{await api.patch("inquiries","id",id,data);await loadAll();showToast("Updated");};

  // Supplier Invoices
  const saveSupplierInvoice=async(data,items)=>{
    const {inv,isNew}=data;
    await api.upsert("supplier_invoices",inv);
    if(isNew){
      for(const item of items){
        await api.insert("supplier_invoice_items",{...item,invoice_id:inv.id});
        const part=parts.find(p=>p.id===item.part_id);
        if(part){const ns=part.stock+item.qty;await api.patch("parts","id",item.part_id,{stock:ns});await logInv(part,part.stock,ns,"Stock In",`Invoice ${inv.id}`);}
      }
    }
    await loadAll();closeM("supplierInvoice");showToast(isNew?"Invoice saved & stock updated":"Invoice updated");
  };

  // Supplier Returns
  const saveSupplierReturn=async(data,items)=>{
    await api.upsert("supplier_returns",data);
    for(const item of items){
      await api.insert("supplier_return_items",{...item,return_id:data.id});
      const part=parts.find(p=>p.id===item.part_id);
      if(part){const ns=Math.max(0,part.stock-item.qty);await api.patch("parts","id",item.part_id,{stock:ns});await logInv(part,part.stock,ns,"Stock Out",`Return ${data.id}`);}
    }
    await loadAll();closeM("supplierReturn");showToast("Return recorded & stock adjusted");
  };

  // Customer Invoices
  const saveCustomerInvoice=async(inv,items)=>{
    await api.upsert("customer_invoices",inv);
    for(const item of items) await api.insert("customer_invoice_items",{...item,invoice_id:inv.id});
    await loadAll();closeM("customerInvoice");showToast("Invoice created");
  };

  // Customer Returns
  const saveCustomerReturn=async(data,items)=>{
    await api.upsert("customer_returns",data);
    for(const item of items){
      await api.insert("customer_return_items",{...item,return_id:data.id});
      const part=parts.find(p=>p.id===item.part_id);
      if(part){const ns=part.stock+item.qty;await api.patch("parts","id",item.part_id,{stock:ns});await logInv(part,part.stock,ns,"Return In",`Customer Return ${data.id}`);}
    }
    await loadAll();closeM("customerReturn");showToast("Return recorded & stock restored");
  };

  // Customers / Users
  const saveCustomer=async(data)=>{const ec=mData("editCustomer");if(ec)await api.patch("customers","id",ec.id,data);else await api.upsert("customers",{...data,orders:0,total_spent:0});await loadAll();closeM("editCustomer");showToast(ec?"Updated":"Added");};
  const deleteCustomer=async(id)=>{await api.delete("customers","id",id);await loadAll();showToast("Deleted","err");};
  const saveUser=async(data)=>{const eu=mData("editUser");if(eu)await api.patch("users","id",eu.id,data);else await api.upsert("users",data);await loadAll();closeM("editUser");showToast(eu?"Updated":"Added");};
  const deleteUser=async(id)=>{if(id===user.id){showToast("Cannot delete yourself","err");return;}await api.delete("users","id",id);await loadAll();showToast("Deleted","err");};
  const saveSettings=async(data)=>{await api.patch("settings","id",1,data);_settings={..._settings,...data};setSettings(s=>({...s,...data}));showToast("Settings saved");};

  // Derived
  const CATS=lang==="en"?CATS_EN:CATS_ZH;
  const allCat=CATS[0],allOS=lang==="en"?"All":"全部";
  const fp=parts.filter(p=>(filterCat===allCat||p.category===filterCat)&&(p.name?.toLowerCase().includes(searchPart.toLowerCase())||p.sku?.toLowerCase().includes(searchPart.toLowerCase())||p.brand?.toLowerCase().includes(searchPart.toLowerCase())));
  const fo=orders.filter(o=>filterOS===allOS||o.status===filterOS);
  const myO=orders.filter(o=>o.customer_phone===user.phone||o.customer_name===user.name);
  const fc=customers.filter(c=>c.name?.includes(searchCust)||c.phone?.includes(searchCust));
  const lowStock=parts.filter(p=>p.stock<=p.min_stock);
  const totalRev=orders.filter(o=>o.status==="已完成").reduce((s,o)=>s+(o.total||0),0);
  const pendingCnt=orders.filter(o=>o.status==="處理中"||o.status==="待出貨").length;
  const pendingInq=inquiries.filter(i=>i.status==="pending").length;
  const getPartSupps=(pid)=>partSuppliers.filter(ps=>ps.part_id===pid).map(ps=>({...ps,supplier:suppliers.find(s=>s.id===ps.supplier_id)}));
  const OS=[allOS,"處理中","待出貨","已完成","已取消"];
  const sub=getSubInfo(user);

  const navItems=[
    {id:"dashboard",icon:"📊",label:t.dashboard,roles:["admin"]},
    {id:"inventory",icon:"📦",label:t.inventory,roles:["admin","shipper"]},
    {id:"shop",icon:"🛒",label:t.shop,roles:["admin","customer"]},
    {id:"orders",icon:"📋",label:t.orders,roles:["admin","shipper"],badge:pendingCnt},
    {id:"myorders",icon:"📦",label:t.myOrders,roles:["customer"]},
    {id:"purchaseInvoices",icon:"🧾",label:t.purchaseInvoices,roles:["admin"]},
    {id:"supplierReturns",icon:"↩️",label:t.supplierReturns,roles:["admin"]},
    {id:"salesInvoices",icon:"🧾",label:t.salesInvoices,roles:["admin","shipper"]},
    {id:"customerReturns",icon:"↩️",label:t.customerReturns,roles:["admin","shipper"]},
    {id:"suppliers",icon:"🏭",label:t.suppliers,roles:["admin"]},
    {id:"inquiries",icon:"📩",label:t.inquiries,roles:["admin"],badge:pendingInq},
    {id:"customers",icon:"👥",label:t.customers,roles:["admin"]},
    {id:"logs",icon:"📝",label:t.logs,roles:["admin"]},
    {id:"users",icon:"🔑",label:t.users,roles:["admin"]},
    {id:"loginlogs",icon:"🌍",label:t.loginLogs,roles:["admin"]},
    {id:"settings",icon:"⚙️",label:t.settings,roles:["admin"]},
  ].filter(n=>n.roles.includes(role));

  if(loading) return <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{fontSize:36,animation:"spin 1s linear infinite",display:"inline-block",marginBottom:14}}>⚙</div><div style={{color:"var(--accent)",fontSize:15,fontWeight:600}}>{t.connecting}</div></div></div>;

  const PH=({title,subtitle,action})=>(
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
      <div><h1 style={{fontSize:20,fontWeight:700,lineHeight:1.2}}>{title}</h1>{subtitle&&<p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{subtitle}</p>}</div>
      {action}
    </div>
  );

  const SC=({label,value,icon,color,onClick})=>(
    <div className="stat-card card card-hover" style={{"--gc":color+"20",cursor:onClick?"pointer":"default"}} onClick={onClick}>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <div><div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{label}</div><div style={{fontSize:26,fontWeight:700,color,fontFamily:"Rajdhani,sans-serif",lineHeight:1}}>{value}</div></div>
        <div style={{fontSize:26,opacity:.8}}>{icon}</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"var(--bg)",minHeight:"100vh",color:"var(--text)"}}>
      <style>{CSS}</style><LandscapeHint lang={lang}/>

      {/* SIDEBAR */}
      <aside className="sidebar" style={{width:240,background:"var(--surface)",borderRight:"1px solid var(--border)",position:"fixed",height:"100vh",zIndex:50,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"18px 18px 12px"}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:20,fontWeight:700,color:"var(--accent)",letterSpacing:1}}>{settings.shop_name||"⚙ AUTO"}<span style={{color:"var(--text)"}}>PARTS</span></div>
          <div style={{fontSize:10,color:"var(--green)",marginTop:2}}>🟢 Connected</div>
          <div style={{display:"flex",gap:5,marginTop:9}}>
            <button className={`lang ${lang==="en"?"on":""}`} onClick={()=>setLang("en")}>EN</button>
            <button className={`lang ${lang==="zh"?"on":""}`} onClick={()=>setLang("zh")}>中文</button>
          </div>
        </div>
        <div style={{margin:"0 10px 8px",background:"var(--surface2)",borderRadius:11,padding:"10px 12px",border:"1px solid var(--border)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:33,height:33,borderRadius:"50%",background:ROLES[role]?.bg,border:`1.5px solid ${ROLES[role]?.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{ROLES[role]?.icon}</div>
            <div><div style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{user.name||user.username}</div><span className="badge" style={{background:ROLES[role]?.bg,color:ROLES[role]?.color,fontSize:10,padding:"1px 7px"}}>{t[role]||role}</span></div>
          </div>
          {role!=="admin"&&<div style={{marginTop:7,background:sub.color+"18",borderRadius:6,padding:"3px 9px",fontSize:11,color:sub.color,fontWeight:600,textAlign:"center"}}>{sub.label}</div>}
        </div>
        <nav style={{padding:"0 9px",flex:1,overflowY:"auto"}}>
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"9px 11px",background:tab===n.id?"var(--surface3)":"none",border:"none",borderRadius:9,color:tab===n.id?"var(--accent)":"var(--text3)",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:tab===n.id?600:400,marginBottom:1,textAlign:"left",transition:"all .18s",borderLeft:`3px solid ${tab===n.id?"var(--accent)":"transparent"}`}}>
              <span style={{fontSize:15}}>{n.icon}</span><span style={{fontSize:12,flex:1}}>{n.label}</span>
              {n.badge>0&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:99,minWidth:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,padding:"0 4px"}}>{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{padding:"9px 9px 14px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:5}}>
          {(role==="admin"||role==="customer")&&(
            <button className="btn btn-primary btn-sm" style={{width:"100%",position:"relative"}} onClick={()=>openM("checkout")}>
              🛒 {t.cart} {cartCount>0&&<span style={{background:"rgba(255,255,255,.25)",borderRadius:99,padding:"1px 7px",fontSize:11}}>{cartCount}</span>}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={onLogout}>🚪 {t.logout}</button>
        </div>
      </aside>

      {/* MOBILE NAV */}
      <nav className="mobile-nav">
        {navItems.slice(0,5).map(n=>(
          <button key={n.id} className={`mob-nav-btn ${tab===n.id?"on":""}`} onClick={()=>setTab(n.id)}>
            {n.badge>0&&<span className="mob-badge">{n.badge}</span>}
            <span className="mi">{n.icon}</span><span>{n.label.split(" ")[0]}</span>
          </button>
        ))}
        {(role==="admin"||role==="customer")&&(
          <button className="mob-nav-btn" onClick={()=>openM("checkout")} style={{position:"relative"}}>
            {cartCount>0&&<span className="mob-badge">{cartCount}</span>}
            <span className="mi">🛒</span><span>{t.cart}</span>
          </button>
        )}
      </nav>

      {/* MAIN CONTENT */}
      <main className="main-content" style={{marginLeft:240,padding:26,minHeight:"100vh"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&role==="admin"&&(
          <div className="fu">
            <PH title={t.dashboard} subtitle="System overview"/>
            <div className="grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <SC label={t.parts} value={parts.length} icon="🔩" color="var(--blue)" onClick={()=>setTab("inventory")}/>
              <SC label={t.pendingOrders} value={pendingCnt} icon="⏳" color="var(--yellow)" onClick={()=>setTab("orders")}/>
              <SC label={t.revenue} value={`${fmtAmt(totalRev)}`} icon="💰" color="var(--green)"/>
              <SC label={t.lowStock} value={lowStock.length} icon="⚠️" color="var(--red)" onClick={()=>setTab("inventory")}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
              <div className="card" style={{padding:20,gridColumn:"span 2"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em"}}>Recent Orders</h3><button className="btn btn-ghost btn-xs" onClick={()=>setTab("orders")}>View all →</button></div>
                {orders.slice(0,5).map(o=>(
                  <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{o.customer_name}</div><div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{o.date}</div></div>
                    <div style={{textAlign:"right"}}><StatusBadge status={o.status}/><div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:2}}>{fmtAmt(o.total)}</div></div>
                  </div>
                ))}
              </div>
              <div className="card" style={{padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:13,fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:".05em"}}>⚠ Low Stock</h3><button className="btn btn-ghost btn-xs" onClick={()=>setTab("inventory")}>Manage</button></div>
                {lowStock.length===0?<p style={{color:"var(--green)",fontSize:13}}>✅ All stock OK</p>:lowStock.slice(0,7).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:500}}>{p.name}</div>
                    <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>{p.stock}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:20}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Order Status</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {["處理中","待出貨","已完成","已取消"].map(s=>(
                  <div key={s} onClick={()=>{setTab("orders");setFilterOS(s);}} style={{background:"var(--surface2)",borderRadius:11,padding:14,textAlign:"center",border:`1px solid ${OC[s]||"#64748b"}33`,cursor:"pointer"}}>
                    <div style={{fontSize:24,fontWeight:700,color:OC[s],fontFamily:"Rajdhani,sans-serif"}}>{orders.filter(o=>o.status===s).length}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTORY ── */}
        {tab==="inventory"&&(
          <div className="fu">
            <PH title={t.inventory} subtitle={`${parts.length} parts · ${lowStock.length} low`}
              action={role==="admin"&&<button className="btn btn-primary" onClick={()=>openM("editPart")}>+ {t.addPart}</button>}/>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              <input className="inp" type="text" placeholder="Search SKU, name, brand..." value={searchPart} onChange={e=>setSearchPart(e.target.value)} style={{flex:"1 1 220px",maxWidth:300}}/>
              <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:160}}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["",t.sku,t.name,t.category,t.brand,t.price,t.stock,t.status,...(role==="admin"?["Actions"]:[])].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {fp.map(p=>{
                      const img=toImgUrl(p.image_url);
                      const ps=getPartSupps(p.id);
                      return (
                        <tr key={p.id}>
                          <td style={{width:52,padding:"10px 8px"}}>
                            {img
                              ? <img className="part-img" src={img} alt={p.name} onError={e=>{e.target.style.display="none";e.target.nextSibling&&(e.target.nextSibling.style.display="flex");}}/>
                              : <div className="part-emoji">{p.image||"🔩"}</div>}
                          </td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{p.sku}</code></td>
                          <td><div style={{fontWeight:600}}>{p.name}</div>{ps.length>0&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>🏭 {ps.length} supplier{ps.length>1?"s":""}</div>}</td>
                          <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)"}}>{p.category}</span></td>
                          <td style={{color:"var(--text2)"}}>{p.brand}</td>
                          <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)"}}>{fmtAmt(p.price)}</td>
                          <td><span style={{fontWeight:700,color:p.stock<=p.min_stock?"var(--red)":"var(--green)",fontSize:15,fontFamily:"Rajdhani,sans-serif"}}>{p.stock}</span></td>
                          <td>{p.stock===0?<StatusBadge status={t.outOfStock}/>:p.stock<=p.min_stock?<span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)"}}>{t.low}</span>:<StatusBadge status={t.normal}/>}</td>
                          {role==="admin"&&(
                            <td>
                              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                <button className="btn btn-ghost btn-xs" style={{color:"var(--yellow)"}} onClick={()=>openM("adjust",p)}>{t.adjustStock}</button>
                                <button className="btn btn-ghost btn-xs" onClick={()=>openM("editPart",p)}>{t.edit}</button>
                                <button className="btn btn-ghost btn-xs" style={{color:"var(--purple)"}} onClick={()=>openM("partSupplier",p)}>🏭</button>
                                <button className="btn btn-info btn-xs" onClick={()=>openM("inquiry",p)}>📩 RFQ</button>
                                <button className="btn btn-danger btn-xs" onClick={()=>deletePart(p.id)}>{t.delete}</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {fp.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No parts found</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── SHOP ── */}
        {tab==="shop"&&(
          <div className="fu">
            <PH title={t.shop} subtitle="Browse and order parts"
              action={<button className="btn btn-primary" onClick={()=>openM("checkout")}>🛒 {t.checkout} {cartCount>0&&`(${cartCount})`} {cartTotal>0&&`· ${fmtAmt(cartTotal)}`}</button>}/>
            <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
              <input className="inp" type="text" placeholder="Search..." value={searchPart} onChange={e=>setSearchPart(e.target.value)} style={{flex:"1 1 200px",maxWidth:260}}/>
              <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:160}}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
              {fp.map(p=>{
                const inCart=cart.find(i=>i.id===p.id);
                const img=toImgUrl(p.image_url);
                return (
                  <div key={p.id} className="card card-hover" style={{padding:16,borderColor:inCart?"var(--accent)":"var(--border)",boxShadow:inCart?"var(--glow)":"none"}}>
                    {img
                      ? <img src={img} alt={p.name} style={{width:"100%",height:120,objectFit:"cover",borderRadius:9,marginBottom:12}} onError={e=>e.target.style.display="none"}/>
                      : <div style={{width:"100%",height:90,background:"var(--surface2)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,marginBottom:12}}>{p.image||"🔩"}</div>}
                    <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{p.sku} · {p.brand}</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:5,lineHeight:1.3}}>{p.name}</div>
                    <div style={{fontSize:20,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginBottom:4}}>{fmtAmt(p.price)}</div>
                    <div style={{fontSize:12,color:p.stock>0?"var(--green)":"var(--red)",marginBottom:12}}>{p.stock>0?`${p.stock} in stock`:t.outOfStock}</div>
                    {inCart
                      ? <div style={{display:"flex",alignItems:"center",gap:7}}><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty-1)}>−</button><span style={{flex:1,textAlign:"center",fontWeight:700,fontSize:16}}>{inCart.qty}</span><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty+1)}>+</button><button className="btn btn-danger btn-xs" onClick={()=>removeFromCart(p.id)}>✕</button></div>
                      : <button className="btn btn-primary" style={{width:"100%"}} disabled={p.stock===0} onClick={()=>addToCart(p)}>{t.addToCart}</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ORDERS ── */}
        {tab==="orders"&&(
          <div className="fu">
            <PH title={t.orders} subtitle={`${orders.length} orders`}/>
            <div className="tabs" style={{marginBottom:16,width:"fit-content",maxWidth:"100%"}}>
              {OS.map(s=>{const cnt=s===allOS?orders.length:orders.filter(o=>o.status===s).length;return <button key={s} className={`tab ${filterOS===s?"on":""}`} onClick={()=>setFilterOS(s)}>{s} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;})}
            </div>
            <OrdersTable orders={fo} canEdit={role!=="customer"} onStatusChange={updateOrderStatus}
              onCreateInvoice={(o)=>openM("customerInvoice",{order:o,isNew:true})}/>
          </div>
        )}

        {/* ── MY ORDERS ── */}
        {tab==="myorders"&&role==="customer"&&(
          <div className="fu">
            <PH title={t.myOrders} subtitle={`${myO.length} orders`}/>
            {myO.length===0?<div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No orders yet — go shop!</div>:<OrdersTable orders={myO} canEdit={false} onStatusChange={updateOrderStatus} onCreateInvoice={()=>{}}/>}
          </div>
        )}

        {/* ── PURCHASE INVOICES ── */}
        {tab==="purchaseInvoices"&&(
          <div className="fu">
            <PH title={`🧾 ${t.purchaseInvoices}`} subtitle={`${supplierInvoices.length} invoices`}
              action={<button className="btn btn-primary" onClick={()=>openM("supplierInvoice",{isNew:true})}>+ New Invoice</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{[t.invoiceNo,"Supplier",t.invoiceDate,t.dueDate,t.total,t.status,"Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {supplierInvoices.map(inv=>(
                      <tr key={inv.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.id}</code></td>
                        <td style={{fontWeight:600}}>{inv.supplier_name}</td>
                        <td style={{color:"var(--text3)"}}>{inv.invoice_date}</td>
                        <td style={{color:"var(--text3)"}}>{inv.due_date||"—"}</td>
                        <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmtAmt(inv.total)}</td>
                        <td><StatusBadge status={inv.status}/></td>
                        <td>
                          <div style={{display:"flex",gap:5}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("viewSupplierInvoice",inv)}>View</button>
                            <button className="btn btn-success btn-xs" onClick={()=>api.patch("supplier_invoices","id",inv.id,{status:"paid"}).then(loadAll)}>Mark Paid</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {supplierInvoices.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No purchase invoices</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── SUPPLIER RETURNS ── */}
        {tab==="supplierReturns"&&(
          <div className="fu">
            <PH title={`↩️ ${t.supplierReturns}`} subtitle={`${supplierReturns.length} returns`}
              action={<button className="btn btn-primary" onClick={()=>openM("supplierReturn",{isNew:true})}>+ New Return</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["Return No","Supplier","Date","Original Invoice",t.total,t.status,"Reason"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {supplierReturns.map(r=>(
                      <tr key={r.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{r.id}</code></td>
                        <td style={{fontWeight:600}}>{r.supplier_name}</td>
                        <td style={{color:"var(--text3)"}}>{r.return_date}</td>
                        <td style={{color:"var(--text3)",fontSize:12}}>{r.original_invoice_id||"—"}</td>
                        <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmtAmt(r.total)}</td>
                        <td><StatusBadge status={r.status}/></td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{r.reason||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {supplierReturns.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No supplier returns</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── SALES INVOICES ── */}
        {tab==="salesInvoices"&&(
          <div className="fu">
            <PH title={`🧾 ${t.salesInvoices}`} subtitle={`${customerInvoices.length} invoices`}
              action={<button className="btn btn-primary" onClick={()=>openM("customerInvoice",{isNew:true})}>+ New Invoice</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{[t.invoiceNo,"Customer",t.invoiceDate,t.total,t.status,"Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {customerInvoices.map(inv=>(
                      <tr key={inv.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.id}</code></td>
                        <td><div style={{fontWeight:600}}>{inv.customer_name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{inv.customer_phone}</div></td>
                        <td style={{color:"var(--text3)"}}>{inv.invoice_date}</td>
                        <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmtAmt(inv.total)}</td>
                        <td><StatusBadge status={inv.status}/></td>
                        <td>
                          <div style={{display:"flex",gap:5}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("viewCustomerInvoice",inv)}>View</button>
                            <button className="btn btn-success btn-xs" onClick={()=>api.patch("customer_invoices","id",inv.id,{status:"paid"}).then(loadAll)}>Mark Paid</button>
                            <button className="btn btn-danger btn-xs" onClick={()=>openM("customerReturn",{invoice:inv,isNew:true})}>↩ Return</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customerInvoices.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No sales invoices</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── CUSTOMER RETURNS ── */}
        {tab==="customerReturns"&&(
          <div className="fu">
            <PH title={`↩️ ${t.customerReturns}`} subtitle={`${customerReturns.length} returns`}
              action={<button className="btn btn-primary" onClick={()=>openM("customerReturn",{isNew:true})}>+ New Return</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["Return No","Customer","Date","Invoice",t.total,t.status,"Reason"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {customerReturns.map(r=>(
                      <tr key={r.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{r.id}</code></td>
                        <td><div style={{fontWeight:600}}>{r.customer_name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{r.customer_phone}</div></td>
                        <td style={{color:"var(--text3)"}}>{r.return_date}</td>
                        <td style={{fontSize:12,color:"var(--text3)"}}>{r.invoice_id||"—"}</td>
                        <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{fmtAmt(r.total)}</td>
                        <td><StatusBadge status={r.status}/></td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{r.reason||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customerReturns.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No customer returns</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── SUPPLIERS ── */}
        {tab==="suppliers"&&role==="admin"&&(
          <div className="fu">
            <PH title={`🏭 ${t.suppliers}`} subtitle={`${suppliers.length} suppliers`}
              action={<button className="btn btn-primary" onClick={()=>openM("editSupplier")}>+ {t.addSupplier}</button>}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {suppliers.map(s=>{
                const linked=partSuppliers.filter(ps=>ps.supplier_id===s.id);
                return (
                  <div key={s.id} className="card card-hover" style={{padding:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div><div style={{fontSize:15,fontWeight:700}}>{s.name}</div><div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>📍 {s.country||"—"}</div></div>
                      <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{linked.length} parts</span>
                    </div>
                    {s.contact_person&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:2}}>👤 {s.contact_person}</div>}
                    {s.email&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:2}}>✉ {s.email}</div>}
                    {s.phone&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>📞 {s.phone}</div>}
                    <div style={{display:"flex",gap:7,marginTop:6}}>
                      <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>openM("editSupplier",s)}>{t.edit}</button>
                      <button className="btn btn-danger btn-sm" onClick={()=>deleteSupplier(s.id)}>{t.delete}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INQUIRIES ── */}
        {tab==="inquiries"&&role==="admin"&&(
          <div className="fu">
            <PH title={`📩 ${t.inquiries}`} subtitle={`${inquiries.length} total · ${pendingInq} pending`}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["Part","Supplier","Qty",t.status,"Reply Price","Reply Stock","Date","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {inquiries.map(inq=>(
                      <tr key={inq.id}>
                        <td style={{fontWeight:600}}>{inq.part_name}</td>
                        <td style={{color:"var(--text2)"}}>{inq.supplier_name}</td>
                        <td style={{textAlign:"center",fontWeight:700}}>{inq.qty_requested}</td>
                        <td><StatusBadge status={inq.status}/></td>
                        <td style={{color:inq.reply_price?"var(--green)":"var(--text3)"}}>{inq.reply_price?fmtAmt(inq.reply_price):"—"}</td>
                        <td style={{color:inq.reply_stock?"var(--green)":"var(--text3)"}}>{inq.reply_stock???"—"}</td>
                        <td style={{color:"var(--text3)",fontSize:12}}>{inq.created_at?.slice(0,10)}</td>
                        <td>
                          <div style={{display:"flex",gap:5}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("inquiryDetail",inq)}>View</button>
                            {inq.status!=="closed"&&<button className="btn btn-danger btn-xs" onClick={()=>updateInquiry(inq.id,{status:"closed"})}>Close</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {inquiries.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No inquiries</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── CUSTOMERS ── */}
        {tab==="customers"&&role==="admin"&&(
          <div className="fu">
            <PH title={t.customers} subtitle={`${customers.length} customers`}
              action={<button className="btn btn-primary" onClick={()=>openM("editCustomer")}>+ Add</button>}/>
            <div style={{marginBottom:16}}><input className="inp" type="text" placeholder="Search name, phone..." value={searchCust} onChange={e=>setSearchCust(e.target.value)} style={{maxWidth:300}}/></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {fc.map(c=>(
                <div key={c.id} className="card card-hover" style={{padding:20}}>
                  <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:12}}>
                    <div style={{width:42,height:42,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,fontWeight:700,flexShrink:0,boxShadow:"0 4px 12px rgba(249,115,22,.3)"}}>{c.name?.[0]}</div>
                    <div><div style={{fontSize:14,fontWeight:700}}>{c.name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{c.phone}</div></div>
                  </div>
                  {c.email&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:3}}>✉ {c.email}</div>}
                  {c.address&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>📍 {c.address}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,borderTop:"1px solid var(--border)",paddingTop:12,marginBottom:12}}>
                    <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"var(--blue)",fontFamily:"Rajdhani,sans-serif"}}>{c.orders}</div><div style={{fontSize:11,color:"var(--text3)"}}>{t.orders_count}</div></div>
                    <div style={{textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(c.total_spent)}</div><div style={{fontSize:11,color:"var(--text3)"}}>{t.totalSpent}</div></div>
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>openM("custHistory",c)}>📋 History</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>openM("editCustomer",c)}>{t.edit}</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>deleteCustomer(c.id)}>{t.delete}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STOCK LOGS ── */}
        {tab==="logs"&&role==="admin"&&(
          <div className="fu">
            <PH title={`📝 ${t.logs}`} subtitle={`${logs.length} records`}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["Time","Part","Action","Before","After","Change","By","Reason"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {logs.map(l=>{const d=l.qty_after-l.qty_before;return(
                      <tr key={l.id}>
                        <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(l.created_at).toLocaleString()}</td>
                        <td><div style={{fontWeight:600}}>{l.part_name}</div><div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{l.part_sku}</div></td>
                        <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:11}}>{l.action}</span></td>
                        <td style={{textAlign:"center",color:"var(--text3)"}}>{l.qty_before}</td>
                        <td style={{textAlign:"center",fontWeight:700}}>{l.qty_after}</td>
                        <td style={{textAlign:"center"}}><span style={{fontWeight:700,color:d>0?"var(--green)":d<0?"var(--red)":"var(--text3)"}}>{d>0?`+${d}`:d}</span></td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{l.changed_by}</td>
                        <td style={{color:"var(--text3)",fontSize:12}}>{l.reason||"—"}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
                {logs.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No records</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab==="users"&&role==="admin"&&(
          <div className="fu">
            <PH title={t.users} subtitle={`${users.length} users`}
              action={<button className="btn btn-primary" onClick={()=>openM("editUser")}>+ Add User</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["User",t.role,"Subscription",t.phone,t.email,"Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {users.map(u=>{const sub2=getSubInfo(u);return(
                      <tr key={u.id}>
                        <td><div style={{fontWeight:600}}>{u.name||u.username}</div><div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{u.username}</div></td>
                        <td><span className="badge" style={{background:ROLES[u.role]?.bg||"var(--surface3)",color:ROLES[u.role]?.color||"var(--text2)"}}>{ROLES[u.role]?.icon} {t[u.role]||u.role}</span></td>
                        <td>
                          <span className="badge" style={{background:sub2.color+"22",color:sub2.color,marginBottom:5}}>{sub2.label}</span>
                          <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                            {["trial","active","expired","blocked"].map(s=>(
                              <button key={s} className="btn btn-ghost btn-xs" style={{color:u.subscription_status===s?sub2.color:"var(--text3)",borderColor:u.subscription_status===s?sub2.color:"var(--border)",padding:"2px 8px",fontSize:11}} onClick={()=>saveUser({...u,subscription_status:s})}>{s}</button>
                            ))}
                          </div>
                        </td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{u.phone||"—"}</td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{u.email||"—"}</td>
                        <td><div style={{display:"flex",gap:6}}><button className="btn btn-ghost btn-sm" onClick={()=>openM("editUser",u)}>{t.edit}</button><button className="btn btn-danger btn-sm" onClick={()=>deleteUser(u.id)} disabled={u.id===user.id}>{t.delete}</button></div></td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── LOGIN LOGS ── */}
        {tab==="loginlogs"&&role==="admin"&&(
          <div className="fu">
            <PH title={`🌍 ${t.loginLogs}`} subtitle={`${loginLogs.length} events`}/>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
              {Object.entries(loginLogs.reduce((a,l)=>{const c=l.country||"?";a[c]=(a[c]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,n])=>(
                <span key={c} className="badge" style={{background:"var(--surface2)",color:"var(--text2)",padding:"5px 13px",fontSize:13}}>{c} · {n}</span>
              ))}
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr>{["Time","User",t.role,"Country","City","IP",t.status].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {loginLogs.map(l=>(
                      <tr key={l.id}>
                        <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(l.created_at).toLocaleString()}</td>
                        <td style={{fontWeight:600}}>{l.username}</td>
                        <td>{l.user_role&&<span className="badge" style={{background:ROLES[l.user_role]?.bg||"var(--surface3)",color:ROLES[l.user_role]?.color||"var(--text2)",fontSize:11}}>{ROLES[l.user_role]?.icon} {l.user_role}</span>}</td>
                        <td style={{fontSize:13}}>{l.country||"—"}</td>
                        <td style={{fontSize:13,color:"var(--text3)"}}>{l.city||"—"}</td>
                        <td style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{l.ip_address||"—"}</td>
                        <td><span className="badge" style={{background:l.status==="success"?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)",color:l.status==="success"?"var(--green)":"var(--red)"}}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings"&&role==="admin"&&(
          <SettingsPage settings={settings} onSave={saveSettings} t={t}/>
        )}

      </main>

      {/* ════ MODALS ════ */}
      {isOpen("editPart")&&<PartModal part={mData("editPart")} onSave={savePart} onClose={()=>closeM("editPart")} t={t}/>}
      {isOpen("adjust")&&<AdjustModal part={mData("adjust")} onApply={applyAdjust} onClose={()=>closeM("adjust")} t={t}/>}
      {isOpen("editSupplier")&&<SupplierModal supplier={mData("editSupplier")} onSave={saveSupplier} onClose={()=>closeM("editSupplier")} t={t}/>}
      {isOpen("partSupplier")&&<PartSupplierModal part={mData("partSupplier")} partSuppliers={getPartSupps(mData("partSupplier")?.id)} suppliers={suppliers} onSave={savePartSupplier} onDelete={deletePartSupplier} onClose={()=>closeM("partSupplier")} t={t}/>}
      {isOpen("inquiry")&&<InquiryModal part={mData("inquiry")} suppliers={suppliers} partSuppliers={getPartSupps(mData("inquiry")?.id)} onSend={sendInquiry} onClose={()=>closeM("inquiry")} t={t}/>}
      {isOpen("inquiryDetail")&&<InquiryDetailModal inquiry={mData("inquiryDetail")} onUpdate={updateInquiry} onClose={()=>closeM("inquiryDetail")} t={t}/>}
      {isOpen("editCustomer")&&<CustomerModal customer={mData("editCustomer")} onSave={saveCustomer} onClose={()=>closeM("editCustomer")} t={t}/>}
      {isOpen("editUser")&&<UserModal user={mData("editUser")} onSave={saveUser} onClose={()=>closeM("editUser")} t={t}/>}
      {isOpen("custHistory")&&<CustHistoryModal customer={mData("custHistory")} orders={orders.filter(o=>o.customer_phone===mData("custHistory")?.phone)} onClose={()=>closeM("custHistory")}/>}
      {isOpen("supplierInvoice")&&<SupplierInvoiceModal data={mData("supplierInvoice")} suppliers={suppliers} parts={parts} onSave={saveSupplierInvoice} onClose={()=>closeM("supplierInvoice")} t={t} settings={settings}/>}
      {isOpen("viewSupplierInvoice")&&<ViewSupplierInvoiceModal inv={mData("viewSupplierInvoice")} onClose={()=>closeM("viewSupplierInvoice")} settings={settings}/>}
      {isOpen("supplierReturn")&&<SupplierReturnModal data={mData("supplierReturn")} suppliers={suppliers} parts={parts} supplierInvoices={supplierInvoices} onSave={saveSupplierReturn} onClose={()=>closeM("supplierReturn")} t={t} settings={settings}/>}
      {isOpen("customerInvoice")&&<CustomerInvoiceModal data={mData("customerInvoice")} customers={customers} parts={parts} orders={orders} onSave={saveCustomerInvoice} onClose={()=>closeM("customerInvoice")} t={t} settings={settings}/>}
      {isOpen("viewCustomerInvoice")&&<ViewCustomerInvoiceModal inv={mData("viewCustomerInvoice")} onClose={()=>closeM("viewCustomerInvoice")} settings={settings}/>}
      {isOpen("customerReturn")&&<CustomerReturnModal data={mData("customerReturn")} customers={customers} parts={parts} customerInvoices={customerInvoices} onSave={saveCustomerReturn} onClose={()=>closeM("customerReturn")} t={t} settings={settings}/>}
      {isOpen("checkout")&&<CheckoutModal cart={cart} customers={customers} cartTotal={cartTotal} role={role} currentUser={user} onPlace={placeOrder} onClose={()=>closeM("checkout")} onRemove={removeFromCart} onQty={qtyCart} t={t} lang={lang}/>}

      {/* ORDER CONFIRM */}
      {isOpen("orderConfirm")&&(()=>{
        const d=mData("orderConfirm")||{};const {order,phone,email}=d;
        if(!order)return null;
        const items=Array.isArray(order?.items)?order.items.map(i=>`  • ${i.name} x${i.qty}  ${fmtAmt(i.price*i.qty)}`).join("\n"):"";
        const shopMsg=`Hello! I'd like to confirm my order 🛠️\n\nOrder ID: ${order?.id}\nDate: ${order?.date}\n\nItems:\n${items}\n\nTotal: ${fmtAmt(order?.total)}\n\nMy contact:\nName: ${order?.customer_name}\nPhone: ${order?.customer_phone}\n\nPlease confirm receipt, thank you!`;
        return (
          <div className="overlay" onClick={()=>closeM("orderConfirm")}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
              <div style={{textAlign:"center",marginBottom:18}}><div style={{fontSize:42,marginBottom:10}}>🎉</div><h2 style={{fontSize:19,fontWeight:700}}>Order Placed!</h2><p style={{color:"var(--text3)",fontSize:13,marginTop:5}}>{order?.id}</p></div>
              <div style={{background:"var(--surface2)",borderRadius:11,padding:13,marginBottom:18,fontSize:13,color:"var(--text2)",whiteSpace:"pre-line",lineHeight:1.7,maxHeight:150,overflowY:"auto"}}>{shopMsg}</div>
              <p style={{fontSize:13,color:"var(--text3)",marginBottom:12,textAlign:"center",fontWeight:600}}>📬 Notify the shop about your order:</p>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {settings.whatsapp&&<a href={waLink(settings.whatsapp,shopMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-primary" style={{width:"100%",background:"#25D366",padding:13,fontSize:15}}>📲 Send to Shop via WhatsApp</button></a>}
                {settings.email&&<a href={mailLink(settings.email,`New Order - ${order?.id}`,shopMsg)} style={{textDecoration:"none"}}><button className="btn btn-ghost" style={{width:"100%",padding:13}}>✉ Send to Shop via Email</button></a>}
                {!settings.whatsapp&&!settings.email&&<p style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>⚙️ Set WhatsApp/Email in Settings to enable notifications</p>}
                <button className="btn btn-ghost" style={{fontSize:13}} onClick={()=>closeM("orderConfirm")}>Skip for now</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RFQ SEND */}
      {isOpen("rfqSend")&&(()=>{
        const d=mData("rfqSend")||{};
        const {part_name,part_sku,supplier_name,supplier_email,supplier_phone,qty_requested,token,message}=d;
        const replyUrl=`${window.location.origin}${window.location.pathname}?rfq=${token}`;
        const waMsg=`${message||`RFQ for ${part_name} (${part_sku}) - Qty: ${qty_requested}`}\n\n📎 Submit quote here (no login needed):\n${replyUrl}`;
        return (
          <div className="overlay" onClick={()=>closeM("rfqSend")}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
              <MHead title={`📩 Send RFQ to ${supplier_name}`} onClose={()=>closeM("rfqSend")}/>
              <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:15,border:"1px solid var(--border)"}}>
                <FL label="Supplier Reply Link (no login needed)"/>
                <div style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--accent)",wordBreak:"break-all",lineHeight:1.6}}>{replyUrl}</div>
                <button className="btn btn-ghost btn-xs" style={{marginTop:7}} onClick={()=>{navigator.clipboard.writeText(replyUrl);showToast("Link copied!");}}>📋 Copy Link</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {supplier_phone?<a href={waLink(supplier_phone,waMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-primary" style={{width:"100%",background:"#25D366",padding:13,fontSize:15}}>📲 Send via WhatsApp</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 Add supplier phone to enable WhatsApp</p>}
                {supplier_email?<a href={mailLink(supplier_email,`RFQ - ${part_name} (${part_sku})`,waMsg)} style={{textDecoration:"none"}}><button className="btn btn-ghost" style={{width:"100%",padding:13}}>✉ Send via Email</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 Add supplier email to enable Email</p>}
                <button className="btn btn-ghost" style={{fontSize:13}} onClick={()=>closeM("rfqSend")}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast&&<div className="toast" style={{borderColor:toast.type==="err"?"rgba(248,113,113,.3)":"var(--border2)",color:toast.type==="err"?"var(--red)":"var(--green)"}}>
        {toast.type==="err"?"⚠":"✓"} {toast.msg}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED TABLE
// ═══════════════════════════════════════════════════════════════
function OrdersTable({orders,canEdit,onStatusChange,onCreateInvoice}) {
  return (
    <div className="card" style={{overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr>{["Order","Customer","Date","Items","Total","Status",...(canEdit?["Update","Invoice"]:[])].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {orders.map(o=>(
              <tr key={o.id}>
                <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{o.id}</code></td>
                <td><div style={{fontWeight:600}}>{o.customer_name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{o.customer_phone}</div></td>
                <td style={{color:"var(--text3)",fontSize:13,whiteSpace:"nowrap"}}>{o.date}</td>
                <td style={{fontSize:13,color:"var(--text2)"}}>{Array.isArray(o.items)&&o.items.map((item,i)=><div key={i}>{item.name} ×{item.qty}</div>)}</td>
                <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)",whiteSpace:"nowrap"}}>{fmtAmt(o.total)}</td>
                <td><StatusBadge status={o.status}/></td>
                {canEdit&&<td><select value={o.status} onChange={e=>onStatusChange(o.id,e.target.value)} style={{background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:7,padding:"5px 9px",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>{["處理中","待出貨","已完成","已取消"].map(s=><option key={s}>{s}</option>)}</select></td>}
                {canEdit&&<td><button className="btn btn-info btn-xs" onClick={()=>onCreateInvoice(o)}>🧾 Invoice</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No orders</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════
function SettingsPage({settings,onSave,t}) {
  const [f,setF]=useState({...settings});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>⚙️ {t.settings}</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>Shop configuration</p></div>
        <button className="btn btn-primary" onClick={()=>onSave(f)}>💾 {t.saveSettings}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div className="card" style={{padding:22}}>
          <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>🏪 Shop Info</h3>
          <FD><FL label={t.shopName}/><input className="inp" value={f.shop_name||""} onChange={e=>s("shop_name",e.target.value)} placeholder="AutoParts"/></FD>
          <FD><FL label={t.shopPhone}/><input className="inp" type="tel" value={f.phone||""} onChange={e=>s("phone",e.target.value)} placeholder="+886..."/></FD>
          <FD><FL label={t.shopEmail}/><input className="inp" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)} placeholder="shop@email.com"/></FD>
          <FD><FL label={t.whatsappNo}/><input className="inp" type="tel" value={f.whatsapp||""} onChange={e=>s("whatsapp",e.target.value)} placeholder="886912345678 (no + or spaces)"/></FD>
          <FD><FL label={t.shopAddress}/><textarea className="inp" value={f.address||""} onChange={e=>s("address",e.target.value)} placeholder="Full shop address" style={{minHeight:70}}/></FD>
        </div>
        <div className="card" style={{padding:22}}>
          <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>💰 Billing Settings</h3>
          <FD><FL label={t.currency}/><select className="inp" value={f.currency||"NT$"} onChange={e=>s("currency",e.target.value)}>
            {["NT$","USD $","MYR RM","SGD $","HKD $","JPY ¥","EUR €","GBP £","CNY ¥","THB ฿","IDR Rp","PHP ₱"].map(c=><option key={c}>{c}</option>)}
          </select></FD>
          <FD><FL label={t.taxRate}/><input className="inp" type="number" value={f.tax_rate||0} onChange={e=>s("tax_rate",+e.target.value)} placeholder="0"/></FD>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INVOICE LINE ITEM EDITOR
// ═══════════════════════════════════════════════════════════════
function LineItemEditor({items,setItems,parts,showSupplierPartId=false,t}) {
  const addLine=()=>setItems(p=>[...p,{part_id:null,part_name:"",part_sku:"",supplier_part_id:"",qty:1,unit_cost:0,unit_price:0,total:0}]);
  const upd=(i,k,v)=>setItems(p=>p.map((r,idx)=>{
    if(idx!==i)return r;
    const nr={...r,[k]:v};
    if(k==="part_id"){const part=parts.find(p=>p.id===+v);if(part){nr.part_name=part.name;nr.part_sku=part.sku;nr.unit_cost=part.price||0;nr.unit_price=part.price||0;}}
    if(k==="qty"||k==="unit_cost"||k==="unit_price") nr.total=(+nr.qty)*(showSupplierPartId?+nr.unit_cost:+nr.unit_price);
    return nr;
  }));
  const rem=(i)=>setItems(p=>p.filter((_,idx)=>idx!==i));

  return (
    <div>
      <div style={{overflowX:"auto"}}>
        <table className="inv-table" style={{width:"100%"}}>
          <thead><tr>
            <th>Part</th><th>SKU</th>
            {showSupplierPartId&&<th>Supplier Part ID</th>}
            <th style={{width:70}}>{t.qty}</th>
            <th style={{width:100}}>{showSupplierPartId?t.unitCost:t.unitPrice}</th>
            <th style={{width:100}}>{t.amount}</th>
            <th style={{width:36}}></th>
          </tr></thead>
          <tbody>
            {items.map((item,i)=>(
              <tr key={i}>
                <td>
                  <select className="inp" style={{fontSize:12,padding:"5px 8px"}} value={item.part_id||""} onChange={e=>upd(i,"part_id",e.target.value)}>
                    <option value="">Select part...</option>
                    {parts.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </td>
                <td><input className="inp" style={{fontSize:12,padding:"5px 8px",width:90}} value={item.part_sku} onChange={e=>upd(i,"part_sku",e.target.value)} placeholder="SKU"/></td>
                {showSupplierPartId&&<td><input className="inp" style={{fontSize:12,padding:"5px 8px",width:100}} value={item.supplier_part_id||""} onChange={e=>upd(i,"supplier_part_id",e.target.value)} placeholder="Supplier ID"/></td>}
                <td><input className="inp" type="number" style={{fontSize:12,padding:"5px 8px",width:60}} value={item.qty} onChange={e=>upd(i,"qty",+e.target.value)} min={1}/></td>
                <td><input className="inp" type="number" style={{fontSize:12,padding:"5px 8px",width:90}} value={showSupplierPartId?item.unit_cost:item.unit_price} onChange={e=>upd(i,showSupplierPartId?"unit_cost":"unit_price",+e.target.value)}/></td>
                <td style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(item.qty*(showSupplierPartId?item.unit_cost:item.unit_price))}</td>
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
function InvTotals({items,taxRate,costField="unit_cost",priceField}) {
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
function SupplierInvoiceModal({data,suppliers,parts,onSave,onClose,t,settings}) {
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
function ViewSupplierInvoiceModal({inv,onClose,settings}) {
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
function SupplierReturnModal({data,suppliers,parts,supplierInvoices,onSave,onClose,t,settings}) {
  const [suppId,setSuppId]=useState("");
  const [origInv,setOrigInv]=useState("");
  const [returnDate,setReturnDate]=useState(today());
  const [reason,setReason]=useState("");
  const [items,setItems]=useState([]);

  const sel=suppliers.find(s=>s.id===+suppId);
  const sub=items.reduce((s,i)=>s+i.qty*i.unit_cost,0);

  const handleSave=()=>{
    if(!suppId||items.length===0)return;
    const id=makeId(settings.credit_note_prefix||"CN");
    const lineItems=items.map(i=>({part_id:i.part_id?+i.part_id:null,part_name:i.part_name,part_sku:i.part_sku,qty:+i.qty,unit_cost:+i.unit_cost,total:+i.qty*+i.unit_cost}));
    onSave({id,supplier_id:+suppId,supplier_name:sel?.name,original_invoice_id:origInv,return_date:returnDate,reason,total:sub,status:"pending"},lineItems);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`↩️ New Supplier Return`} onClose={onClose}/>
      <FG>
        <div><FL label="Supplier *"/><select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}><option value="">Select...</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><FL label="Original Invoice"/><select className="inp" value={origInv} onChange={e=>setOrigInv(e.target.value)}><option value="">Select invoice (optional)...</option>{supplierInvoices.filter(i=>!suppId||i.supplier_id===+suppId).map(i=><option key={i.id} value={i.id}>{i.id} - {i.supplier_name}</option>)}</select></div>
      </FG>
      <FG>
        <div><FL label={t.returnDate}/><input className="inp" type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></div>
        <div><FL label={t.reason}/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Damaged, wrong item..."/></div>
      </FG>
      <div className="divider"/>
      <FL label="Return Items"/>
      <LineItemEditor items={items} setItems={setItems} parts={parts} showSupplierPartId={false} t={t}/>
      {items.length>0&&<div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700}}><span>Total Credit</span><span style={{color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(sub)}</span></div>}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!suppId||items.length===0}>💾 Save & Stock Out</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
function CustomerInvoiceModal({data,customers,parts,orders,onSave,onClose,t,settings}) {
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
function ViewCustomerInvoiceModal({inv,onClose,settings}) {
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
function CustomerReturnModal({data,customers,parts,customerInvoices,onSave,onClose,t,settings}) {
  const prefillInv=data?.invoice;
  const [custPhone,setCustPhone]=useState(prefillInv?.customer_phone||"");
  const [custName,setCustName]=useState(prefillInv?.customer_name||"");
  const [invId,setInvId]=useState(prefillInv?.id||"");
  const [returnDate,setReturnDate]=useState(today());
  const [reason,setReason]=useState("");
  const [items,setItems]=useState([]);

  const sub=items.reduce((s,i)=>s+i.qty*i.unit_price,0);

  const handleSave=()=>{
    if(!custName||items.length===0)return;
    const id=makeId(settings.credit_note_prefix||"CN");
    const lineItems=items.map(i=>({part_id:i.part_id?+i.part_id:null,part_name:i.part_name,part_sku:i.part_sku||"",qty:+i.qty,unit_price:+i.unit_price,total:+i.qty*+i.unit_price}));
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
        <div><FL label="Original Invoice"/><select className="inp" value={invId} onChange={e=>setInvId(e.target.value)}><option value="">Select invoice (optional)...</option>{customerInvoices.filter(i=>!custPhone||i.customer_phone===custPhone).map(i=><option key={i.id} value={i.id}>{i.id} - {i.customer_name}</option>)}</select></div>
        <div><FL label={t.returnDate}/><input className="inp" type="date" value={returnDate} onChange={e=>setReturnDate(e.target.value)}/></div>
      </FG>
      <FD><FL label={t.reason}/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Wrong item, damaged, not needed..."/></FD>
      <div className="divider"/>
      <FL label="Return Items (stock will be restored)"/>
      <LineItemEditor items={items} setItems={setItems} parts={parts} showSupplierPartId={false} t={t}/>
      {items.length>0&&<div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700}}><span>Total Refund</span><span style={{color:"var(--green)",fontFamily:"Rajdhani,sans-serif",fontSize:20}}>{fmtAmt(sub)}</span></div>}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={!custName||items.length===0}>💾 Save & Restore Stock</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// ALL OTHER MODALS
// ═══════════════════════════════════════════════════════════════
function PartModal({part,onSave,onClose,t}) {
  const [f,setF]=useState(part?{sku:part.sku,name:part.name,category:part.category,brand:part.brand,price:part.price,stock:part.stock,minStock:part.min_stock,image_url:part.image_url||""}:{sku:"",name:"",category:"Engine",brand:"",price:"",stock:"",minStock:"",image_url:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const preview=toImgUrl(f.image_url);
  return (
    <Overlay onClose={onClose}>
      <MHead title={part?"Edit Part":"New Part"} onClose={onClose}/>
      <FG><div><FL label={`${t.sku} *`}/><input className="inp" value={f.sku} onChange={e=>s("sku",e.target.value)} placeholder="ENG-001"/></div><div><FL label={t.brand}/><input className="inp" value={f.brand} onChange={e=>s("brand",e.target.value)} placeholder="BOSCH"/></div></FG>
      <FD><FL label={`${t.name} *`}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></FD>
      <FD><FL label={t.category}/><select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>{["Engine","Brake","Filter","Electrical","Suspension","引擎","煞車系統","濾清系統","電氣系統","懸吊系統"].map(c=><option key={c}>{c}</option>)}</select></FD>
      <FG cols="1fr 1fr 1fr"><div><FL label={`${t.price} *`}/><input className="inp" type="number" value={f.price} onChange={e=>s("price",e.target.value)}/></div><div><FL label={t.stock}/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",e.target.value)}/></div><div><FL label={t.minStock}/><input className="inp" type="number" value={f.minStock} onChange={e=>s("minStock",e.target.value)}/></div></FG>
      <FD>
        <FL label={t.image_url}/>
        <input className="inp" type="url" value={f.image_url} onChange={e=>s("image_url",e.target.value)} placeholder="https://drive.google.com/file/d/..."/>
        <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>{t.gdrive_hint}</div>
        {preview&&<img src={preview} alt="" style={{marginTop:10,width:"100%",height:130,objectFit:"cover",borderRadius:10,border:"1px solid var(--border)"}} onError={e=>e.target.style.display="none"}/>}
      </FD>
      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.sku||!f.name||!f.price)return;onSave({sku:f.sku,name:f.name,category:f.category,brand:f.brand,price:+f.price,stock:+f.stock,min_stock:+f.minStock,image_url:f.image_url});}}>{t.save}</button>
      </div>
    </Overlay>
  );
}

function AdjustModal({part,onApply,onClose,t}) {
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

function CheckoutModal({cart,customers,cartTotal,role,currentUser,onPlace,onClose,onRemove,onQty,t,lang}) {
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

function SupplierModal({supplier,onSave,onClose,t}) {
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

function PartSupplierModal({part,partSuppliers,suppliers,onSave,onDelete,onClose,t}) {
  const [suppId,setSuppId]=useState("");const [price,setPrice]=useState("");const [lead,setLead]=useState("");const [minOrd,setMinOrd]=useState(1);
  if(!part)return null;
  const avail=suppliers.filter(s=>!partSuppliers.find(ps=>ps.supplier_id===s.id));
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🏭 Suppliers — ${part.name}`} sub={part.sku} onClose={onClose}/>
      {partSuppliers.length>0&&(
        <div style={{marginBottom:18}}>
          <FL label="Linked Suppliers"/>
          {partSuppliers.map(ps=>(
            <div key={ps.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--surface2)",borderRadius:10,padding:"11px 14px",marginBottom:7,border:"1px solid var(--border)"}}>
              <div><div style={{fontWeight:600}}>{ps.supplier?.name}</div><div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{ps.supplier?.country} · Lead: {ps.lead_time||"—"} · Min: {ps.min_order}</div>{ps.supplier_price&&<div style={{fontSize:13,color:"var(--green)",marginTop:2}}>{fmtAmt(ps.supplier_price)}</div>}</div>
              <button className="btn btn-danger btn-sm" onClick={()=>onDelete(ps.id)}>{t.delete}</button>
            </div>
          ))}
        </div>
      )}
      {avail.length>0&&(
        <div>
          <FL label="Link New Supplier"/>
          <div style={{background:"var(--surface2)",borderRadius:11,padding:15,border:"1px solid var(--border)"}}>
            <FD><FL label="Supplier *"/><select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}><option value="">Select...</option>{avail.map(s=><option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}</select></FD>
            <FG cols="1fr 1fr 1fr"><div><FL label={t.supplier_price}/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0"/></div><div><FL label={t.lead_time}/><input className="inp" value={lead} onChange={e=>setLead(e.target.value)} placeholder="7 days"/></div><div><FL label={t.min_order}/><input className="inp" type="number" value={minOrd} onChange={e=>setMinOrd(e.target.value)}/></div></FG>
            <button className="btn btn-primary" style={{width:"100%"}} onClick={()=>{if(!suppId)return;onSave({part_id:part.id,supplier_id:+suppId,supplier_price:price?+price:null,lead_time:lead,min_order:+minOrd});setSuppId("");setPrice("");setLead("");setMinOrd(1);}}>Link Supplier</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

function InquiryModal({part,suppliers,partSuppliers,onSend,onClose,t}) {
  const [selectedSuppliers,setSelectedSuppliers]=useState([]);
  const [qty,setQty]=useState(10);
  const [msg,setMsg]=useState(`Dear Supplier,\n\nWe would like a quotation for:\n- Part: ${part?.name} (${part?.sku})\n- Quantity: ${qty}\n\nPlease confirm your best price and available stock.\n\nThank you.`);
  if(!part)return null;

  const toggleSupplier=(s)=>setSelectedSuppliers(p=>p.find(x=>x.id===s.id)?p.filter(x=>x.id!==s.id):[...p,s]);

  const handleSend=async()=>{
    if(selectedSuppliers.length===0||!qty)return;
    for(const s of selectedSuppliers){
      await onSend({part_id:part.id,part_name:part.name,part_sku:part.sku,supplier_id:s.id,supplier_name:s.name,supplier_email:s.email,supplier_phone:s.phone,qty_requested:+qty,message:msg.replace("Dear Supplier",`Dear ${s.name}`)});
    }
  };

  // Available suppliers — linked ones first
  const linkedSupps=partSuppliers.map(ps=>ps.supplier).filter(Boolean);
  const allSupps=[...linkedSupps,...suppliers.filter(s=>!linkedSupps.find(l=>l.id===s.id))];

  return (
    <Overlay onClose={onClose}>
      <MHead title="📩 Send RFQ" sub={`${part.name} · ${part.sku}`} onClose={onClose}/>
      <FD>
        <FL label={`${t.selectSuppliers} *`}/>
        <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:200,overflowY:"auto",background:"var(--surface2)",borderRadius:10,padding:12,border:"1px solid var(--border)"}}>
          {allSupps.map(s=>{
            const isLinked=!!linkedSupps.find(l=>l.id===s.id);
            const isSelected=!!selectedSuppliers.find(x=>x.id===s.id);
            return (
              <label key={s.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"6px 8px",borderRadius:8,background:isSelected?"rgba(249,115,22,.1)":"transparent",border:isSelected?"1px solid rgba(249,115,22,.3)":"1px solid transparent"}}>
                <input type="checkbox" className="chk" checked={isSelected} onChange={()=>toggleSupplier(s)}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{s.name} {isLinked&&<span style={{fontSize:10,color:"var(--accent)",marginLeft:4}}>●linked</span>}</div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>{s.country} {s.email&&`· ${s.email}`} {s.phone&&`· ${s.phone}`}</div>
                </div>
              </label>
            );
          })}
          {allSupps.length===0&&<p style={{color:"var(--text3)",fontSize:13,textAlign:"center"}}>No suppliers — add them first</p>}
        </div>
        {selectedSuppliers.length>0&&<div style={{fontSize:12,color:"var(--green)",marginTop:5}}>✓ {selectedSuppliers.length} supplier{selectedSuppliers.length>1?"s":""} selected</div>}
      </FD>
      <FD><FL label="Quantity *"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)}/></FD>
      <FD><FL label="Message"/><textarea className="inp" value={msg} onChange={e=>setMsg(e.target.value)} style={{minHeight:110}}/></FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSend} disabled={selectedSuppliers.length===0||!qty}>📩 {t.sendToSelected} ({selectedSuppliers.length})</button>
      </div>
    </Overlay>
  );
}

function InquiryDetailModal({inquiry,onUpdate,onClose,t}) {
  const [rp,setRp]=useState(inquiry?.reply_price||"");const [rs,setRs]=useState(inquiry?.reply_stock||"");const [rn,setRn]=useState(inquiry?.reply_notes||"");
  if(!inquiry)return null;
  return (
    <Overlay onClose={onClose}>
      <MHead title="📩 Inquiry Detail" sub={inquiry.id} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:11,padding:14,marginBottom:16,border:"1px solid var(--border)"}}>
        <FG><div><FL label="Part"/><div style={{fontWeight:600}}>{inquiry.part_name}</div></div><div><FL label="Supplier"/><div style={{fontWeight:600}}>{inquiry.supplier_name}</div></div></FG>
        <FG><div><FL label="Email"/><div style={{color:"var(--text2)",fontSize:13}}>{inquiry.supplier_email||"—"}</div></div><div><FL label="Qty"/><div style={{fontWeight:700,color:"var(--accent)",fontSize:16,fontFamily:"Rajdhani,sans-serif"}}>{inquiry.qty_requested}</div></div></FG>
        {inquiry.message&&<div><FL label="Message"/><div style={{fontSize:13,color:"var(--text2)",whiteSpace:"pre-line",lineHeight:1.7}}>{inquiry.message}</div></div>}
      </div>
      <FL label="Record Reply"/>
      <FG><div><FL label="Reply Price"/><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="0"/></div><div><FL label="Reply Stock"/><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)}/></div></FG>
      <FD><FL label="Notes"/><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)}/></FD>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>onUpdate(inquiry.id,{reply_price:rp?+rp:null,reply_stock:rs?+rs:null,reply_notes:rn,status:"replied",replied_at:new Date().toISOString()})}>Save & Mark Replied</button>
        <button className="btn btn-danger" style={{flex:1}} onClick={()=>onUpdate(inquiry.id,{status:"closed"})}>Close</button>
      </div>
    </Overlay>
  );
}

function CustomerModal({customer,onSave,onClose,t}) {
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

function UserModal({user,onSave,onClose,t}) {
  const [f,setF]=useState(user?{username:user.username,password:"",role:user.role,name:user.name||"",phone:user.phone||"",email:user.email||""}:{username:"",password:"",role:"customer",name:"",phone:"",email:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={user?"Edit User":"Add User"} onClose={onClose}/>
      <FG><div><FL label="Username *"/><input className="inp" value={f.username} onChange={e=>s("username",e.target.value)} disabled={!!user}/></div><div><FL label={user?"New password (blank=keep)":"Password *"}/><input className="inp" type="password" value={f.password} onChange={e=>s("password",e.target.value)} placeholder="••••••"/></div></FG>
      <FD><FL label={t.role}/><select className="inp" value={f.role} onChange={e=>s("role",e.target.value)}><option value="admin">👑 Admin</option><option value="shipper">🚚 Shipper</option><option value="customer">👤 Customer</option></select></FD>
      <FG><div><FL label={t.name}/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)}/></div><div><FL label={t.phone}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div></FG>
      <FD><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></FD>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.username||(!user&&!f.password))return;const d={username:f.username,role:f.role,name:f.name,phone:f.phone,email:f.email};if(f.password)d.password=f.password;onSave(d);}}>{t.save}</button></div>
    </Overlay>
  );
}

function CustHistoryModal({customer,orders,onClose}) {
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

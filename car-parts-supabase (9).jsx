import { useState, useEffect, useCallback } from "react";

// ============================================================
// 🔧 HARDCODED CONFIG — change these lines only
// ============================================================
const SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_KEY";

// 🏪 Shop contact — customers send orders TO these
const SHOP_WHATSAPP = "886912345678"; // YOUR WhatsApp number (no + or spaces)
const SHOP_EMAIL    = "shop@autoparts.com"; // YOUR shop email

// ── API ──────────────────────────────────────────────────────
const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });
const api = {
  get: async (t, q = "") => (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${q}`, { headers: H() })).json(),
  upsert: async (t, d) => (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: H({ Prefer: "return=representation,resolution=merge-duplicates" }), body: JSON.stringify(d) })).json(),
  patch: async (t, c, v, d) => (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "PATCH", headers: H({ Prefer: "return=representation" }), body: JSON.stringify(d) })).json(),
  delete: async (t, c, v) => fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, { method: "DELETE", headers: H() }),
};

// ── i18n ─────────────────────────────────────────────────────
const T = {
  en: {
    appSub: "Parts Management System", dashboard: "Dashboard", inventory: "Inventory",
    shop: "Shop", orders: "Orders", myOrders: "My Orders", customers: "Customers",
    users: "Users", suppliers: "Suppliers", inquiries: "Inquiries", logs: "Stock Logs",
    loginLogs: "Login Logs", logout: "Sign Out", cart: "Cart", login: "Sign In",
    username: "Username", password: "Password", connecting: "Loading...",
    wrongPass: "Invalid username or password", addPart: "Add Part",
    adjustStock: "Adjust", save: "Save", cancel: "Cancel", delete: "Delete",
    edit: "Edit", close: "Close", confirm: "Confirm", sku: "SKU", name: "Name",
    category: "Category", brand: "Brand", price: "Price", stock: "Stock",
    minStock: "Min Stock", status: "Status", normal: "OK", low: "Low", outOfStock: "Out",
    placeOrder: "Place Order", addToCart: "Add to Cart", checkout: "Checkout",
    orderHistory: "Order History", totalSpent: "Total Spent", addSupplier: "Add Supplier",
    supplierName: "Supplier Name", email: "Email", phone: "Phone", country: "Country",
    contactPerson: "Contact", pending: "Pending", replied: "Replied", closed: "Closed",
    role: "Role", admin: "Admin", shipper: "Shipper", customer: "Customer",
    revenue: "Revenue", pendingOrders: "Pending", lowStock: "Low Stock", parts: "Parts",
    demoAccounts: "Demo Accounts", all: "All", total: "Total", orders_count: "Orders",
    image_url: "Photo URL (Google Drive)", gdrive_hint: "Paste share link — auto converted",
    lead_time: "Lead Time", min_order: "Min Order", supplier_price: "Supplier Price",
    notes: "Notes", message: "Message", send: "Send Inquiry",
  },
  zh: {
    appSub: "零件管理銷售系統", dashboard: "儀表板", inventory: "庫存管理",
    shop: "線上商店", orders: "訂單管理", myOrders: "我的訂單", customers: "客戶管理",
    users: "用戶管理", suppliers: "供應商", inquiries: "詢價管理", logs: "庫存記錄",
    loginLogs: "登入記錄", logout: "登出", cart: "購物車", login: "登入",
    username: "帳號", password: "密碼", connecting: "載入中...",
    wrongPass: "帳號或密碼錯誤", addPart: "新增零件",
    adjustStock: "調整", save: "儲存", cancel: "取消", delete: "刪除",
    edit: "編輯", close: "關閉", confirm: "確認", sku: "料號", name: "名稱",
    category: "分類", brand: "品牌", price: "單價", stock: "庫存",
    minStock: "最低庫存", status: "狀態", normal: "正常", low: "庫存低", outOfStock: "缺貨",
    placeOrder: "確認下單", addToCart: "加入購物車", checkout: "結帳",
    orderHistory: "訂單歷史", totalSpent: "總消費", addSupplier: "新增供應商",
    supplierName: "供應商名稱", email: "Email", phone: "電話", country: "國家",
    contactPerson: "聯絡人", pending: "待回覆", replied: "已回覆", closed: "已關閉",
    role: "角色", admin: "管理員", shipper: "出貨員", customer: "客戶",
    revenue: "完成營收", pendingOrders: "待處理", lowStock: "低庫存", parts: "零件數",
    demoAccounts: "測試帳號", all: "全部", total: "合計", orders_count: "訂單數",
    image_url: "圖片網址 (Google Drive)", gdrive_hint: "貼上分享連結，自動轉換",
    lead_time: "交貨期", min_order: "最小訂量", supplier_price: "供應商報價",
    notes: "備註", message: "訊息", send: "發送詢價",
  },
};

// ── Helpers ───────────────────────────────────────────────────
const toImgUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  return url;
};

// WhatsApp & Email helpers
const waLink = (phone, msg) => {
  const clean = (phone || "").replace(/[^0-9+]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
};
const mailLink = (to, subject, body) =>
  `mailto:${to || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const buildOrderMsg = (order, lang) => {
  const items = Array.isArray(order.items) ? order.items.map(i => `  • ${i.name} x${i.qty}  NT$${(i.price * i.qty).toLocaleString()}`).join("\n") : "";
  if (lang === "zh") return `感謝您的訂購！🛠️\n\n訂單編號：${order.id}\n日期：${order.date}\n\n商品：\n${items}\n\n合計：NT$${(order.total || 0).toLocaleString()}\n\n我們將盡快為您處理，謝謝！`;
  return `Thank you for your order! 🛠️\n\nOrder ID: ${order.id}\nDate: ${order.date}\n\nItems:\n${items}\n\nTotal: NT$${(order.total || 0).toLocaleString()}\n\nWe will process your order shortly. Thank you!`;
};

const buildRfqMsg = (part, qty, supplierName, token) => {
  const replyUrl = `${window.location.origin}${window.location.pathname}?rfq=${token}`;
  return `Dear ${supplierName},\n\nWe would like to request a quotation for the following:\n\n• Part: ${part.name} (SKU: ${part.sku})\n• Quantity: ${qty}\n\nPlease click the link below to submit your quote directly (no login required):\n👉 ${replyUrl}\n\nThank you,\nAutoparts Team`;
};

// Generate a simple token for public RFQ reply
const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const ROLES = {
  admin:    { color: "#f97316", bg: "rgba(249,115,22,0.12)", icon: "👑", label: "Admin" },
  shipper:  { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", icon: "🚚", label: "Shipper" },
  customer: { color: "#34d399", bg: "rgba(52,211,153,0.12)", icon: "👤", label: "Customer" },
};

const ORDER_COLORS = { "已完成": "#34d399", "待出貨": "#fbbf24", "處理中": "#60a5fa", "已取消": "#f87171" };
const CATS_EN = ["All","Engine","Brake","Filter","Electrical","Suspension"];
const CATS_ZH = ["全部","引擎","煞車系統","濾清系統","電氣系統","懸吊系統"];

const TRIAL_DAYS = 30;
const getSubInfo = (user) => {
  if (!user || user.role === "admin") return { status: "admin", label: "Admin", color: "#f97316" };
  const s = user.subscription_status || "trial";
  if (s === "active") return { status: "active", label: "✅ Active", color: "#34d399" };
  if (s === "blocked" || s === "expired") return { status: s, label: s === "blocked" ? "🚫 Blocked" : "⏰ Expired", color: "#f87171" };
  const days = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - new Date(user.trial_start || Date.now())) / 86400000));
  if (days <= 0) return { status: "expired", label: "⏰ Expired", color: "#f87171", days: 0 };
  return { status: "trial", label: `Trial: ${days}d left`, color: days <= 5 ? "#fbbf24" : "#60a5fa", days };
};
const canAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const s = getSubInfo(user);
  return s.status === "active" || s.status === "trial";
};

// ── CSS ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Rajdhani:wght@600;700&family=DM+Mono:wght@400;500&display=swap');
:root {
  --bg: #080b12;
  --surface: #0f1420;
  --surface2: #161c2d;
  --surface3: #1d2540;
  --border: rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.12);
  --accent: #f97316;
  --accent2: #fb923c;
  --text: #f1f5f9;
  --text2: #94a3b8;
  --text3: #475569;
  --green: #34d399;
  --red: #f87171;
  --blue: #60a5fa;
  --yellow: #fbbf24;
  --radius: 14px;
  --radius-sm: 8px;
  --shadow: 0 4px 24px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 48px rgba(0,0,0,0.6);
  --glow: 0 0 20px rgba(249,115,22,0.15);
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:99px}
input,select,textarea{outline:none;font-family:'DM Sans',sans-serif}
/* Buttons */
.btn{cursor:pointer;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;transition:all .18s;letter-spacing:.01em;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.btn-primary{background:var(--accent);color:#fff;padding:10px 20px;box-shadow:0 4px 12px rgba(249,115,22,0.3)}
.btn-primary:hover{background:var(--accent2);transform:translateY(-1px);box-shadow:0 6px 20px rgba(249,115,22,0.4)}
.btn-ghost{background:var(--surface2);color:var(--text2);padding:10px 20px;border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--surface3);color:var(--text)}
.btn-danger{background:rgba(248,113,113,0.12);color:var(--red);padding:7px 14px;border:1px solid rgba(248,113,113,0.2)}
.btn-danger:hover{background:rgba(248,113,113,0.2)}
.btn-sm{padding:6px 12px;font-size:13px}
.btn-xs{padding:4px 10px;font-size:12px}
.btn-icon{padding:8px;border-radius:var(--radius-sm);background:var(--surface2);color:var(--text2);border:1px solid var(--border)}
.btn-icon:hover{background:var(--surface3);color:var(--text)}
/* Inputs */
.inp{width:100%;background:var(--surface2);border:1.5px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:11px 14px;font-size:14px;font-family:'DM Sans',sans-serif;transition:border .18s}
.inp:focus{border-color:var(--accent)}
.inp::placeholder{color:var(--text3)}
select.inp{cursor:pointer}
textarea.inp{resize:vertical;min-height:80px}
/* Cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);transition:border .2s}
.card-hover:hover{border-color:var(--border2)}
/* Badge */
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
/* Table */
.tbl{width:100%;border-collapse:collapse}
.tbl th{padding:12px 16px;text-align:left;font-size:12px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);white-space:nowrap}
.tbl td{padding:14px 16px;font-size:14px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:var(--surface2)}
/* Modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:0}
@media(min-width:640px){.overlay{align-items:center;padding:20px}}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius) var(--radius) 0 0;padding:28px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;animation:slideUp .22s ease}
@media(min-width:640px){.modal{border-radius:var(--radius);animation:fadeUp .2s ease}}
/* Tab filters */
.tabs{display:flex;background:var(--surface2);border-radius:var(--radius-sm);padding:3px;gap:2px;overflow-x:auto}
.tab{background:none;border:none;cursor:pointer;color:var(--text3);padding:7px 14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;border-radius:6px;transition:all .18s;white-space:nowrap;flex-shrink:0}
.tab.on{background:var(--surface);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,0.3)}
.tab:hover:not(.on){color:var(--text2)}
/* Lang toggle */
.lang{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text2);padding:4px 10px;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .18s}
.lang.on{background:var(--accent);color:#fff;border-color:var(--accent)}
/* Animations */
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
.fu{animation:fadeUp .22s ease}
/* Stat gradient cards */
.stat-card{position:relative;overflow:hidden;padding:22px 24px;border-radius:var(--radius)}
.stat-card::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at top right,var(--glow-color,transparent) 0%,transparent 70%);pointer-events:none}
/* Mobile nav */
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);padding:8px 4px;z-index:100;gap:2px}
@media(max-width:767px){
  .mobile-nav{display:flex}
  .sidebar{display:none!important}
  .main-content{margin-left:0!important;padding:16px!important;padding-bottom:80px!important}
  .page-header{flex-direction:column;align-items:flex-start;gap:10px}
  .grid-4{grid-template-columns:1fr 1fr!important}
  .grid-3{grid-template-columns:1fr!important}
  .hide-mobile{display:none!important}
}
.mob-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;border-radius:8px;transition:all .18s;position:relative}
.mob-nav-btn.on{color:var(--accent)}
.mob-nav-btn .mob-icon{font-size:19px;line-height:1}
.mob-badge{position:absolute;top:4px;right:calc(50% - 16px);background:var(--accent);color:#fff;border-radius:99px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;padding:0 4px}
/* Product image */
.part-img{width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--border);flex-shrink:0}
.part-emoji{width:44px;height:44px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
/* Label */
.lbl{font-size:12px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;display:block}
/* Divider */
.divider{border:none;border-top:1px solid var(--border);margin:16px 0}
/* Toast */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface3);border:1px solid var(--border2);color:var(--text);padding:12px 22px;border-radius:99px;font-size:14px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:var(--shadow-lg);animation:fadeUp .25s ease}
@media(max-width:767px){.toast{bottom:88px}}
/* Landscape hint */
.landscape-hint{display:none;position:fixed;inset:0;background:rgba(8,11,18,.96);z-index:9999;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:30px}
@media(max-width:767px) and (orientation:portrait){.landscape-hint{display:flex}}
.rotate-icon{font-size:52px;animation:rotateHint 2s ease-in-out infinite}
@keyframes rotateHint{0%,100%{transform:rotate(0deg)}50%{transform:rotate(90deg)}}
/* Register tab */
.auth-tab{flex:1;padding:10px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:"DM Sans",sans-serif;font-size:14px;font-weight:500;border-bottom:2px solid transparent;transition:all .18s}
.auth-tab.on{color:var(--accent);border-bottom-color:var(--accent)}
/* RFQ public page */
.rfq-page{max-width:500px;margin:0 auto;padding:24px 16px}
`;

// ════════════════════════════════════════════════════════════
// AUTH PAGE — Staff login + Customer register/login
// ════════════════════════════════════════════════════════════

// Landscape hint overlay (mobile portrait only)
function LandscapeHint({ lang }) {
  return (
    <div className="landscape-hint">
      <div className="rotate-icon">📱</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
        {lang === "zh" ? "請旋轉設備" : "Rotate Your Device"}
      </div>
      <div style={{ color: "var(--text3)", fontSize: 15, maxWidth: 260, lineHeight: 1.7 }}>
        {lang === "zh"
          ? "請將手機橫向使用，以獲得最佳體驗"
          : "Please rotate to landscape mode for the best experience"}
      </div>
      <div style={{ marginTop: 8, color: "var(--text3)", fontSize: 13 }}>
        {lang === "zh" ? "或在電腦上開啟" : "Or open on a desktop/tablet"}
      </div>
    </div>
  );
}

function LoginPage({ onLogin, t, lang, setLang }) {
  const [authTab, setAuthTab] = useState("staff"); // "staff" | "customer"
  // Staff login
  const [user, setUser] = useState(""); const [pass, setPass] = useState("");
  // Customer login/register
  const [custTab, setCustTab] = useState("login"); // "login" | "register"
  const [cName, setCName] = useState(""); const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState(""); const [cPass, setCPass] = useState(""); const [cPass2, setCPass2] = useState("");
  const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);

  const logLogin = async (u) => {
    try {
      const geo = await (await fetch("https://ipapi.co/json/")).json();
      await api.upsert("login_logs", { username: u.username || u.phone, user_role: u.role || "customer", ip_address: geo.ip || "?", country: `${geo.country_name || "?"} ${geo.country_flag_emoji || ""}`.trim(), city: geo.city || "", device: navigator.userAgent.slice(0, 100), status: "success" });
    } catch {}
  };

  // Staff login
  const doStaffLogin = async () => {
    if (!user || !pass) { setErr(t.wrongPass); return; }
    setLoading(true); setErr("");
    try {
      const res = await api.get("users", `username=eq.${encodeURIComponent(user)}&password=eq.${encodeURIComponent(pass)}&select=*`);
      if (Array.isArray(res) && res.length > 0) { await logLogin(res[0]); onLogin(res[0]); }
      else setErr(t.wrongPass);
    } catch { setErr("Connection error"); }
    setLoading(false);
  };

  // Customer login
  const doCustLogin = async () => {
    if (!cPhone || !cPass) { setErr("Please fill phone and password"); return; }
    setLoading(true); setErr("");
    const res = await api.get("customers", `phone=eq.${encodeURIComponent(cPhone)}&password=eq.${encodeURIComponent(cPass)}&select=*`);
    if (Array.isArray(res) && res.length > 0) {
      const c = res[0];
      await logLogin({ ...c, username: c.phone, role: "customer" });
      onLogin({ ...c, username: c.phone, role: "customer", _isCustomer: true });
    } else setErr("Phone or password incorrect");
    setLoading(false);
  };

  // Customer register
  const doCustRegister = async () => {
    if (!cName || !cPhone || !cPass) { setErr("Name, phone and password are required"); return; }
    if (cPass !== cPass2) { setErr("Passwords do not match"); return; }
    setLoading(true); setErr("");
    // Check if phone already exists
    const existing = await api.get("customers", `phone=eq.${encodeURIComponent(cPhone)}&select=id`);
    if (Array.isArray(existing) && existing.length > 0) { setErr("Phone already registered — please login"); setLoading(false); return; }
    const res = await api.upsert("customers", { name: cName, phone: cPhone, email: cEmail, password: cPass, address: "", orders: 0, total_spent: 0 });
    const c = Array.isArray(res) ? res[0] : null;
    if (c) {
      await logLogin({ username: cPhone, role: "customer" });
      onLogin({ ...c, username: c.phone, role: "customer", _isCustomer: true });
    } else setErr("Registration failed — try again");
    setLoading(false);
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{CSS}</style>
      <LandscapeHint lang={lang} />
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 38, fontWeight: 700, color: "var(--accent)", letterSpacing: 2, lineHeight: 1 }}>⚙ AUTO<span style={{ color: "var(--text)" }}>PARTS</span></div>
          <div style={{ color: "var(--text3)", fontSize: 14, marginTop: 6 }}>{t.appSub}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
            <button className={`lang ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>EN</button>
            <button className={`lang ${lang === "zh" ? "on" : ""}`} onClick={() => setLang("zh")}>中文</button>
          </div>
        </div>

        {/* Main tabs: Staff / Customer */}
        <div style={{ display: "flex", background: "var(--surface2)", borderRadius: 12, padding: 4, marginBottom: 20, border: "1px solid var(--border)" }}>
          {[["staff", "🏢 " + (lang === "zh" ? "員工登入" : "Staff")], ["customer", "👤 " + (lang === "zh" ? "客戶" : "Customer")]].map(([id, label]) => (
            <button key={id} onClick={() => { setAuthTab(id); setErr(""); }} style={{ flex: 1, padding: "10px", background: authTab === id ? "var(--accent)" : "none", color: authTab === id ? "#fff" : "var(--text3)", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: authTab === id ? 700 : 500, fontFamily: "DM Sans,sans-serif", transition: "all .18s" }}>{label}</button>
          ))}
        </div>

        <div className="card" style={{ padding: 28, boxShadow: "var(--shadow-lg)" }}>

          {/* STAFF LOGIN */}
          {authTab === "staff" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><span className="lbl">{t.username}</span><input className="inp" type="text" value={user} onChange={e => setUser(e.target.value)} onKeyDown={e => e.key === "Enter" && doStaffLogin()} autoCapitalize="none" /></div>
              <div><span className="lbl">{t.password}</span><input className="inp" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && doStaffLogin()} /></div>
              {err && <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--red)" }}>⚠ {err}</div>}
              <button className="btn btn-primary" style={{ width: "100%", padding: 13, fontSize: 15 }} onClick={doStaffLogin} disabled={loading}>{loading ? t.connecting : t.login}</button>
            </div>
          )}

          {/* CUSTOMER LOGIN / REGISTER */}
          {authTab === "customer" && (
            <div>
              {/* Sub-tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 22 }}>
                {[["login", lang === "zh" ? "已有帳號" : "Sign In"], ["register", lang === "zh" ? "新客戶註冊" : "Register"]].map(([id, label]) => (
                  <button key={id} className={`auth-tab ${custTab === id ? "on" : ""}`} onClick={() => { setCustTab(id); setErr(""); }}>{label}</button>
                ))}
              </div>

              {custTab === "login" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div><span className="lbl">{t.phone}</span><input className="inp" type="tel" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="+886..." /></div>
                  <div><span className="lbl">{t.password}</span><input className="inp" type="password" value={cPass} onChange={e => setCPass(e.target.value)} onKeyDown={e => e.key === "Enter" && doCustLogin()} /></div>
                  {err && <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--red)" }}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{ width: "100%", padding: 13, fontSize: 15 }} onClick={doCustLogin} disabled={loading}>{loading ? t.connecting : t.login}</button>
                  <p style={{ fontSize: 13, color: "var(--text3)", textAlign: "center" }}>
                    {lang === "zh" ? "還沒帳號？" : "No account?"}{" "}
                    <span style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 600 }} onClick={() => { setCustTab("register"); setErr(""); }}>
                      {lang === "zh" ? "立即註冊" : "Register now"}
                    </span>
                  </p>
                </div>
              )}

              {custTab === "register" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div><span className="lbl">{lang === "zh" ? "姓名 *" : "Full Name *"}</span><input className="inp" value={cName} onChange={e => setCName(e.target.value)} /></div>
                  <div><span className="lbl">{lang === "zh" ? "手機號碼 *" : "Phone *"}</span><input className="inp" type="tel" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="+886..." /></div>
                  <div><span className="lbl">Email</span><input className="inp" type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} /></div>
                  <div><span className="lbl">{lang === "zh" ? "設定密碼 *" : "Password *"}</span><input className="inp" type="password" value={cPass} onChange={e => setCPass(e.target.value)} /></div>
                  <div><span className="lbl">{lang === "zh" ? "確認密碼 *" : "Confirm Password *"}</span><input className="inp" type="password" value={cPass2} onChange={e => setCPass2(e.target.value)} onKeyDown={e => e.key === "Enter" && doCustRegister()} /></div>
                  {err && <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--red)" }}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{ width: "100%", padding: 13, fontSize: 15 }} onClick={doCustRegister} disabled={loading}>{loading ? t.connecting : (lang === "zh" ? "立即註冊" : "Create Account")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PAYWALL
// ════════════════════════════════════════════════════════════
function PaywallPage({ user, onLogout, lang }) {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 34, fontWeight: 700, color: "var(--accent)" }}>⚙ AUTO<span style={{ color: "var(--text)" }}>PARTS</span></div>
        <div className="card" style={{ padding: 36, marginTop: 24, boxShadow: "var(--shadow-lg)" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{lang === "zh" ? "試用期已結束" : "Trial Expired"}</h2>
          <p style={{ color: "var(--text2)", fontSize: 14, lineHeight: 1.8, marginBottom: 28 }}>
            {lang === "zh" ? "請聯絡管理員升級付費方案以繼續使用。" : "Please contact your administrator to upgrade your plan."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[["Monthly", "NT$299", "/mo"], ["Yearly", "NT$2,499", "/yr · save 17%"]].map(([p, price, per]) => (
              <div key={p} style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 12, padding: "18px 14px" }}>
                <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 6 }}>{p}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif" }}>{price}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>{per}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--text2)" }}>
            📧 admin@autoparts.com
          </div>
          <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onLogout}>{lang === "zh" ? "登出" : "Sign Out"}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// RFQ PUBLIC REPLY PAGE (no login needed)
// ════════════════════════════════════════════════════════════
function RfqReplyPage({ token, lang }) {
  const [inq, setInq] = useState(null); const [loaded, setLoaded] = useState(false);
  const [rp, setRp] = useState(""); const [rs, setRs] = useState(""); const [rn, setRn] = useState("");
  const [done, setDone] = useState(false); const [err, setErr] = useState("");

  useEffect(() => {
    api.get("inquiries", `rfq_token=eq.${token}&select=*`).then(res => {
      if (Array.isArray(res) && res.length > 0) setInq(res[0]);
      else setErr("Inquiry not found or link expired");
      setLoaded(true);
    });
  }, [token]);

  const submit = async () => {
    if (!rp && !rs) { setErr("Please enter price or stock"); return; }
    await api.patch("inquiries", "rfq_token", token, { reply_price: rp ? +rp : null, reply_stock: rs ? +rs : null, reply_notes: rn, status: "replied", replied_at: new Date().toISOString() });
    setDone(true);
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{CSS}</style>
      <div className="rfq-page" style={{ width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 30, fontWeight: 700, color: "var(--accent)" }}>⚙ AUTO<span style={{ color: "var(--text)" }}>PARTS</span></div>
          <div style={{ color: "var(--text3)", fontSize: 13, marginTop: 4 }}>Supplier Quotation Portal</div>
        </div>
        <div className="card" style={{ padding: 28, boxShadow: "var(--shadow-lg)" }}>
          {!loaded && <p style={{ color: "var(--text3)", textAlign: "center", padding: 30 }}>Loading...</p>}
          {err && <div style={{ color: "var(--red)", textAlign: "center", padding: 30 }}>⚠ {err}</div>}
          {done && (
            <div style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Quote Submitted!</h2>
              <p style={{ color: "var(--text3)" }}>Thank you. We will review your quotation and get back to you.</p>
            </div>
          )}
          {inq && !done && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📩 Request for Quotation</h2>
              <p style={{ color: "var(--text3)", fontSize: 13, marginBottom: 20 }}>Please fill in your best price and available stock.</p>
              <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 16, marginBottom: 20, border: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Part", inq.part_name], ["SKU", inq.part_sku || "—"], ["Qty Requested", inq.qty_requested], ["Inquiry ID", inq.id]].map(([k, v]) => (
                    <div key={k}><div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                  ))}
                </div>
                {inq.message && <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 13, color: "var(--text2)", whiteSpace: "pre-line", lineHeight: 1.7 }}>{inq.message}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><span className="lbl">Your Price (NT$) *</span><input className="inp" type="number" value={rp} onChange={e => setRp(e.target.value)} placeholder="0" /></div>
                  <div><span className="lbl">Available Stock *</span><input className="inp" type="number" value={rs} onChange={e => setRs(e.target.value)} /></div>
                </div>
                <div><span className="lbl">Notes / Remarks</span><textarea className="inp" value={rn} onChange={e => setRn(e.target.value)} placeholder="Lead time, MOQ, conditions..." /></div>
                {err && <div style={{ color: "var(--red)", fontSize: 13 }}>⚠ {err}</div>}
                <button className="btn btn-primary" style={{ padding: 13, fontSize: 15 }} onClick={submit}>Submit My Quotation</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(localStorage.getItem("ap_lang") || "en");
  const [user, setUser] = useState(null);
  const changeLang = (l) => { setLang(l); localStorage.setItem("ap_lang", l); };
  const t = T[lang];

  // Check for public RFQ reply link
  const rfqToken = new URLSearchParams(window.location.search).get("rfq");
  if (rfqToken) return <RfqReplyPage token={rfqToken} lang={lang} />;

  if (!user) return <LoginPage onLogin={setUser} t={t} lang={lang} setLang={changeLang} />;
  if (!canAccess(user)) return <PaywallPage user={user} onLogout={() => setUser(null)} lang={lang} />;
  return <MainApp user={user} onLogout={() => setUser(null)} t={t} lang={lang} setLang={changeLang} />;
}

// ════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════
function MainApp({ user, onLogout, t, lang, setLang }) {
  const role = user.role;
  const initTab = role === "customer" ? "shop" : role === "shipper" ? "orders" : "dashboard";
  const [tab, setTab] = useState(initTab);
  const [parts, setParts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partSuppliers, setPartSuppliers] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [searchPart, setSearchPart] = useState("");
  const [filterCat, setFilterCat] = useState(lang === "en" ? "All" : "全部");
  const [filterOS, setFilterOS] = useState(lang === "en" ? "All" : "全部");
  const [searchCust, setSearchCust] = useState("");
  const [toast, setToast] = useState(null);

  // Modals
  const [M, setM] = useState({}); // modal state map
  const openM = (k, data = true) => setM(p => ({ ...p, [k]: data }));
  const closeM = (k) => setM(p => ({ ...p, [k]: null }));

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };

  const logInv = async (part, before, after, action, reason = "") => {
    await api.upsert("inventory_logs", { part_id: part.id, part_name: part.name, part_sku: part.sku, action, qty_before: before, qty_after: after, changed_by: user.name || user.username, reason });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, o, c, u, l, ll, s, ps, inq] = await Promise.all([
      api.get("parts", "select=*&order=id.asc"),
      api.get("orders", "select=*&order=created_at.desc"),
      api.get("customers", "select=*&order=total_spent.desc"),
      api.get("users", "select=*&order=id.asc"),
      api.get("inventory_logs", "select=*&order=created_at.desc&limit=200"),
      api.get("login_logs", "select=*&order=created_at.desc&limit=200"),
      api.get("suppliers", "select=*&order=name.asc"),
      api.get("part_suppliers", "select=*"),
      api.get("inquiries", "select=*&order=created_at.desc"),
    ]);
    setParts(Array.isArray(p) ? p : []);
    setOrders(Array.isArray(o) ? o : []);
    setCustomers(Array.isArray(c) ? c : []);
    setUsers(Array.isArray(u) ? u : []);
    setLogs(Array.isArray(l) ? l : []);
    setLoginLogs(Array.isArray(ll) ? ll : []);
    setSuppliers(Array.isArray(s) ? s : []);
    setPartSuppliers(Array.isArray(ps) ? ps : []);
    setInquiries(Array.isArray(inq) ? inq : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, []);

  // Cart
  const addToCart = (part) => { setCart(p => { const ex = p.find(i => i.id === part.id); return ex ? p.map(i => i.id === part.id ? { ...i, qty: i.qty + 1 } : i) : [...p, { ...part, qty: 1 }]; }); showToast(`Added: ${part.name}`); };
  const removeFromCart = (id) => setCart(p => p.filter(i => i.id !== id));
  const qtyCart = (id, qty) => { if (qty < 1) return; setCart(p => p.map(i => i.id === id ? { ...i, qty } : i)); };
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Orders
  const placeOrder = async (form) => {
    if (!form.name || !form.phone) { showToast("Fill name & phone", "err"); return; }
    const oid = `ORD-${Date.now()}`;
    const orderObj = { id: oid, customer_name: form.name, customer_phone: form.phone, customer_email: form.email || "", date: new Date().toISOString().slice(0, 10), status: "處理中", items: cart.map(i => ({ partId: i.id, qty: i.qty, name: i.name, price: i.price })), total: cartTotal };
    await api.upsert("orders", orderObj);
    for (const ci of cart) { const p = parts.find(p => p.id === ci.id); if (p) { const ns = Math.max(0, p.stock - ci.qty); await api.patch("parts", "id", ci.id, { stock: ns }); await logInv(p, p.stock, ns, "Order Deduct", oid); } }
    const ex = customers.find(c => c.phone === form.phone);
    if (ex) await api.patch("customers", "phone", form.phone, { orders: ex.orders + 1, total_spent: ex.total_spent + cartTotal });
    else await api.upsert("customers", { name: form.name, phone: form.phone, email: form.email || "", address: form.address || "", orders: 1, total_spent: cartTotal });
    await loadAll(); setCart([]); closeM("checkout");
    // Show notification options
    openM("orderConfirm", { order: orderObj, phone: form.phone, email: form.email || "" });
    setTab(role === "customer" ? "myorders" : "orders");
  };

  const updateOrderStatus = async (id, ns) => {
    const o = orders.find(o => o.id === id); if (!o) return;
    const wasC = o.status === "已取消", nowC = ns === "已取消";
    if (!wasC && nowC && Array.isArray(o.items)) { for (const item of o.items) { const p = parts.find(p => p.id === item.partId); if (p) { await api.patch("parts", "id", item.partId, { stock: p.stock + item.qty }); await logInv(p, p.stock, p.stock + item.qty, "Cancel Restore", id); } } showToast("Cancelled — stock restored", "err"); }
    else if (wasC && !nowC && Array.isArray(o.items)) { for (const item of o.items) { const p = parts.find(p => p.id === item.partId); if (p) { const ns2 = Math.max(0, p.stock - item.qty); await api.patch("parts", "id", item.partId, { stock: ns2 }); await logInv(p, p.stock, ns2, "Order Restore", id); } } showToast("Order restored"); }
    else showToast("Status updated");
    await api.patch("orders", "id", id, { status: ns }); await loadAll();
  };

  // Parts CRUD
  const savePart = async (data) => {
    const ep = M.editPart;
    if (ep) { await api.patch("parts", "id", ep.id, data); if (ep.stock !== data.stock) await logInv({ ...ep, ...data }, ep.stock, data.stock, "Edit Part", "Admin edit"); showToast("Part updated"); }
    else { const r = await api.upsert("parts", { ...data, image: "🔩" }); await logInv(Array.isArray(r) ? r[0] : data, 0, data.stock, "New Part", "Added"); showToast("Part added"); }
    await loadAll(); closeM("editPart");
  };
  const deletePart = async (id) => { const p = parts.find(p => p.id === id); if (p) await logInv(p, p.stock, 0, "Delete Part", "Deleted"); await api.delete("parts", "id", id); await loadAll(); showToast("Deleted", "err"); };
  const applyAdjust = async (part, nq, reason) => { await api.patch("parts", "id", part.id, { stock: nq }); await logInv(part, part.stock, nq, "Manual Adj.", reason || "Manual"); await loadAll(); closeM("adjust"); showToast(`Stock → ${nq}`); };

  // Suppliers
  const saveSupplier = async (data) => { const es = M.editSupplier; if (es) await api.patch("suppliers", "id", es.id, data); else await api.upsert("suppliers", data); await loadAll(); closeM("editSupplier"); showToast(es ? "Supplier updated" : "Supplier added"); };
  const deleteSupplier = async (id) => { await api.delete("suppliers", "id", id); await loadAll(); showToast("Deleted", "err"); };
  const savePartSupplier = async (data) => { await api.upsert("part_suppliers", data); await loadAll(); showToast("Linked"); };
  const deletePartSupplier = async (id) => { await api.delete("part_suppliers", "id", id); await loadAll(); showToast("Removed", "err"); };
  const sendInquiry = async (data) => {
    const token = makeToken();
    await api.upsert("inquiries", { id: `INQ-${Date.now()}`, ...data, rfq_token: token, created_by: user.name || user.username, status: "pending" });
    await loadAll(); closeM("inquiry");
    // Open notification options for RFQ
    openM("rfqSend", { ...data, token });
  };
  const updateInquiry = async (id, data) => { await api.patch("inquiries", "id", id, data); await loadAll(); showToast("Updated"); };

  // Customers / Users
  const saveCustomer = async (data) => { const ec = M.editCustomer; if (ec) await api.patch("customers", "id", ec.id, data); else await api.upsert("customers", { ...data, orders: 0, total_spent: 0 }); await loadAll(); closeM("editCustomer"); showToast(ec ? "Updated" : "Added"); };
  const deleteCustomer = async (id) => { await api.delete("customers", "id", id); await loadAll(); showToast("Deleted", "err"); };
  const saveUser = async (data) => { const eu = M.editUser; if (eu) await api.patch("users", "id", eu.id, data); else await api.upsert("users", data); await loadAll(); closeM("editUser"); showToast(eu ? "Updated" : "Added"); };
  const deleteUser = async (id) => { if (id === user.id) { showToast("Cannot delete yourself", "err"); return; } await api.delete("users", "id", id); await loadAll(); showToast("Deleted", "err"); };

  // Derived
  const CATS = lang === "en" ? CATS_EN : CATS_ZH;
  const allCat = CATS[0], allOS = lang === "en" ? "All" : "全部";
  const fp = parts.filter(p => (filterCat === allCat || p.category === filterCat) && (p.name?.toLowerCase().includes(searchPart.toLowerCase()) || p.sku?.toLowerCase().includes(searchPart.toLowerCase()) || p.brand?.toLowerCase().includes(searchPart.toLowerCase())));
  const fo = orders.filter(o => filterOS === allOS || o.status === filterOS);
  const myO = orders.filter(o => o.customer_phone === user.phone || o.customer_name === user.name);
  const fc = customers.filter(c => c.name?.includes(searchCust) || c.phone?.includes(searchCust));
  const lowStock = parts.filter(p => p.stock <= p.min_stock);
  const totalRev = orders.filter(o => o.status === "已完成").reduce((s, o) => s + (o.total || 0), 0);
  const pendingCnt = orders.filter(o => o.status === "處理中" || o.status === "待出貨").length;
  const pendingInq = inquiries.filter(i => i.status === "pending").length;
  const getPartSupps = (pid) => partSuppliers.filter(ps => ps.part_id === pid).map(ps => ({ ...ps, supplier: suppliers.find(s => s.id === ps.supplier_id) }));
  const OS = [allOS, "處理中", "待出貨", "已完成", "已取消"];
  const sub = getSubInfo(user);

  // Nav items
  const navItems = [
    { id: "dashboard", icon: "📊", label: t.dashboard, roles: ["admin"] },
    { id: "inventory", icon: "📦", label: t.inventory, roles: ["admin", "shipper"] },
    { id: "shop", icon: "🛒", label: t.shop, roles: ["admin", "customer"] },
    { id: "orders", icon: "📋", label: t.orders, roles: ["admin", "shipper"], badge: pendingCnt },
    { id: "myorders", icon: "📦", label: t.myOrders, roles: ["customer"] },
    { id: "suppliers", icon: "🏭", label: t.suppliers, roles: ["admin"] },
    { id: "inquiries", icon: "📩", label: t.inquiries, roles: ["admin"], badge: pendingInq },
    { id: "customers", icon: "👥", label: t.customers, roles: ["admin"] },
    { id: "logs", icon: "📝", label: t.logs, roles: ["admin"] },
    { id: "users", icon: "🔑", label: t.users, roles: ["admin"] },
    { id: "loginlogs", icon: "🌍", label: t.loginLogs, roles: ["admin"] },
  ].filter(n => n.roles.includes(role));

  if (loading) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 16 }}>⚙</div>
        <div style={{ color: "var(--accent)", fontSize: 15, fontWeight: 600 }}>{t.connecting}</div>
      </div>
    </div>
  );

  const PageHeader = ({ title, subtitle, action }) => (
    <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{title}</h1>
        {subtitle && <p style={{ color: "var(--text3)", fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const StatCard = ({ label, value, icon, color, onClick }) => (
    <div className="stat-card card card-hover" style={{ "--glow-color": color + "20", cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "Rajdhani,sans-serif", lineHeight: 1 }}>{value}</div>
        </div>
        <div style={{ fontSize: 28, opacity: .8 }}>{icon}</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}>
      <style>{CSS}</style>
      <LandscapeHint lang={lang} />

      {/* ── SIDEBAR (desktop) ── */}
      <aside className="sidebar" style={{ width: 240, background: "var(--surface)", borderRight: "1px solid var(--border)", position: "fixed", height: "100vh", zIndex: 50, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 20px 14px" }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 700, color: "var(--accent)", letterSpacing: 1 }}>⚙ AUTO<span style={{ color: "var(--text)" }}>PARTS</span></div>
          <div style={{ fontSize: 11, color: "var(--green)", marginTop: 3 }}>🟢 Connected</div>
          <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
            <button className={`lang ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>EN</button>
            <button className={`lang ${lang === "zh" ? "on" : ""}`} onClick={() => setLang("zh")}>中文</button>
          </div>
        </div>

        {/* User card */}
        <div style={{ margin: "0 12px 10px", background: "var(--surface2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: ROLES[role]?.bg, border: `1.5px solid ${ROLES[role]?.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{ROLES[role]?.icon}</div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name || user.username}</div>
              <span className="badge" style={{ background: ROLES[role]?.bg, color: ROLES[role]?.color, fontSize: 10, padding: "1px 8px" }}>{t[role]}</span>
            </div>
          </div>
          {role !== "admin" && (
            <div style={{ marginTop: 8, background: sub.color + "18", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: sub.color, fontWeight: 600, textAlign: "center" }}>{sub.label}</div>
          )}
        </div>

        <nav style={{ padding: "0 10px", flex: 1, overflowY: "auto" }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: tab === n.id ? "var(--surface3)" : "none", border: "none", borderRadius: 10, color: tab === n.id ? "var(--accent)" : "var(--text3)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: tab === n.id ? 600 : 400, marginBottom: 1, textAlign: "left", transition: "all .18s", borderLeft: `3px solid ${tab === n.id ? "var(--accent)" : "transparent"}`, position: "relative" }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span> {n.label}
              {n.badge > 0 && <span style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", borderRadius: 99, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, padding: "0 5px" }}>{n.badge}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: "10px 10px 16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
          {(role === "admin" || role === "customer") && (
            <button className="btn btn-primary btn-sm" style={{ width: "100%", position: "relative" }} onClick={() => openM("checkout")}>
              🛒 {t.cart} {cartCount > 0 && <span style={{ background: "rgba(255,255,255,.25)", borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{cartCount}</span>}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", fontSize: 12 }} onClick={onLogout}>🚪 {t.logout}</button>
        </div>
      </aside>

      {/* ── MOBILE NAV ── */}
      <nav className="mobile-nav">
        {navItems.slice(0, 5).map(n => (
          <button key={n.id} className={`mob-nav-btn ${tab === n.id ? "on" : ""}`} onClick={() => setTab(n.id)}>
            {n.badge > 0 && <span className="mob-badge">{n.badge}</span>}
            <span className="mob-icon">{n.icon}</span>
            <span>{n.label.split(" ")[0]}</span>
          </button>
        ))}
        {(role === "admin" || role === "customer") && (
          <button className="mob-nav-btn" onClick={() => openM("checkout")} style={{ position: "relative" }}>
            {cartCount > 0 && <span className="mob-badge">{cartCount}</span>}
            <span className="mob-icon">🛒</span>
            <span>{t.cart}</span>
          </button>
        )}
      </nav>

      {/* ── MAIN ── */}
      <main className="main-content" style={{ marginLeft: 240, padding: 28, minHeight: "100vh" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && role === "admin" && (
          <div className="fu">
            <PageHeader title={t.dashboard} subtitle="System overview" />
            <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
              <StatCard label={t.parts} value={parts.length} icon="🔩" color="var(--blue)" onClick={() => setTab("inventory")} />
              <StatCard label={t.pendingOrders} value={pendingCnt} icon="⏳" color="var(--yellow)" onClick={() => setTab("orders")} />
              <StatCard label={t.revenue} value={`$${(totalRev/1000).toFixed(1)}k`} icon="💰" color="var(--green)" />
              <StatCard label={t.lowStock} value={lowStock.length} icon="⚠️" color="var(--red)" onClick={() => setTab("inventory")} />
            </div>

            <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
              {/* Recent orders */}
              <div className="card" style={{ padding: 22, gridColumn: "span 2" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em" }}>Recent Orders</h3>
                  <button className="btn btn-ghost btn-xs" onClick={() => setTab("orders")}>View all →</button>
                </div>
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{o.customer_name}</div>
                      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{o.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="badge" style={{ background: (ORDER_COLORS[o.status] || "#64748b") + "22", color: ORDER_COLORS[o.status] || "#64748b" }}>{o.status}</span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", marginTop: 3 }}>NT${(o.total || 0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && <p style={{ color: "var(--text3)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>No orders yet</p>}
              </div>

              {/* Low stock */}
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".05em" }}>⚠ Low Stock</h3>
                  <button className="btn btn-ghost btn-xs" onClick={() => setTab("inventory")}>Manage →</button>
                </div>
                {lowStock.length === 0 ? <p style={{ color: "var(--green)", fontSize: 14 }}>✅ All stock OK</p>
                  : lowStock.slice(0, 6).map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                      <span className="badge" style={{ background: "rgba(248,113,113,.12)", color: "var(--red)" }}>{p.stock}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Order status row */}
            <div className="card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 16 }}>Order Status</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {["處理中", "待出貨", "已完成", "已取消"].map(s => (
                  <div key={s} onClick={() => { setTab("orders"); setFilterOS(s); }} style={{ background: "var(--surface2)", borderRadius: 12, padding: "16px", textAlign: "center", border: `1px solid ${ORDER_COLORS[s]}33`, cursor: "pointer", transition: "all .18s" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: ORDER_COLORS[s], fontFamily: "Rajdhani,sans-serif" }}>{orders.filter(o => o.status === s).length}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* INVENTORY */}
        {tab === "inventory" && (
          <div className="fu">
            <PageHeader title={t.inventory} subtitle={`${parts.length} parts · ${lowStock.length} low stock`}
              action={role === "admin" && <button className="btn btn-primary" onClick={() => openM("editPart", null)}>+ {t.addPart}</button>} />
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <input className="inp" type="text" placeholder="Search name, SKU, brand..." value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ flex: "1 1 220px", maxWidth: 300 }} />
              <select className="inp" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 160 }}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>{["", t.sku, t.name, t.category, t.brand, t.price, t.stock, t.status, ...(role === "admin" ? ["Actions"] : [])].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fp.map(p => {
                      const img = toImgUrl(p.image_url);
                      const ps = getPartSupps(p.id);
                      return (
                        <tr key={p.id}>
                          <td style={{ width: 52 }}>{img ? <img className="part-img" src={img} alt="" onError={e => e.target.style.display = "none"} /> : <div className="part-emoji">{p.image || "🔩"}</div>}</td>
                          <td><code style={{ fontFamily: "DM Mono,monospace", fontSize: 12, color: "var(--text3)" }}>{p.sku}</code></td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            {ps.length > 0 && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>🏭 {ps.length} supplier{ps.length > 1 ? "s" : ""}</div>}
                          </td>
                          <td><span className="badge" style={{ background: "var(--surface3)", color: "var(--text2)" }}>{p.category}</span></td>
                          <td style={{ color: "var(--text2)" }}>{p.brand}</td>
                          <td style={{ fontWeight: 700, fontFamily: "Rajdhani,sans-serif", fontSize: 15, color: "var(--accent)" }}>NT${(p.price || 0).toLocaleString()}</td>
                          <td><span style={{ fontWeight: 700, color: p.stock <= p.min_stock ? "var(--red)" : "var(--green)", fontSize: 15, fontFamily: "Rajdhani,sans-serif" }}>{p.stock}</span></td>
                          <td>{p.stock === 0 ? <span className="badge" style={{ background: "rgba(248,113,113,.12)", color: "var(--red)" }}>{t.outOfStock}</span> : p.stock <= p.min_stock ? <span className="badge" style={{ background: "rgba(251,191,36,.12)", color: "var(--yellow)" }}>{t.low}</span> : <span className="badge" style={{ background: "rgba(52,211,153,.12)", color: "var(--green)" }}>{t.normal}</span>}</td>
                          {role === "admin" && (
                            <td>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                <button className="btn btn-ghost btn-xs" style={{ color: "var(--yellow)" }} onClick={() => openM("adjust", p)}>{t.adjustStock}</button>
                                <button className="btn btn-ghost btn-xs" onClick={() => openM("editPart", p)}>{t.edit}</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: "#a78bfa" }} onClick={() => openM("partSupplier", p)}>🏭</button>
                                <button className="btn btn-ghost btn-xs" style={{ color: "var(--blue)" }} onClick={() => openM("inquiry", p)}>📩 RFQ</button>
                                <button className="btn btn-danger btn-xs" onClick={() => deletePart(p.id)}>{t.delete}</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {fp.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>No parts found</div>}
              </div>
            </div>
          </div>
        )}

        {/* SHOP */}
        {tab === "shop" && (
          <div className="fu">
            <PageHeader title={t.shop} subtitle="Browse and order parts"
              action={<button className="btn btn-primary" onClick={() => openM("checkout")}>🛒 {t.checkout} {cartCount > 0 && `(${cartCount})`} {cartTotal > 0 && `· NT$${cartTotal.toLocaleString()}`}</button>} />
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <input className="inp" type="text" placeholder="Search parts..." value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ flex: "1 1 200px", maxWidth: 260 }} />
              <select className="inp" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 160 }}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16 }}>
              {fp.map(p => {
                const inCart = cart.find(i => i.id === p.id);
                const img = toImgUrl(p.image_url);
                return (
                  <div key={p.id} className="card card-hover" style={{ padding: 18, borderColor: inCart ? "var(--accent)" : "var(--border)", transition: "all .2s", boxShadow: inCart ? "var(--glow)" : "none" }}>
                    {img ? <img src={img} alt={p.name} style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, marginBottom: 14 }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: "100%", height: 100, background: "var(--surface2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 14 }}>{p.image || "🔩"}</div>}
                    <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 3 }}>{p.sku} · {p.brand}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{p.name}</div>
                    <span className="badge" style={{ background: "var(--surface2)", color: "var(--text3)", marginBottom: 10 }}>{p.category}</span>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", marginBottom: 4 }}>NT${(p.price || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: p.stock > 0 ? "var(--green)" : "var(--red)", marginBottom: 14 }}>{p.stock > 0 ? `${p.stock} in stock` : t.outOfStock}</div>
                    {inCart ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "6px 12px" }} onClick={() => qtyCart(p.id, inCart.qty - 1)}>−</button>
                        <span style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{inCart.qty}</span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: "6px 12px" }} onClick={() => qtyCart(p.id, inCart.qty + 1)}>+</button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeFromCart(p.id)}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary" style={{ width: "100%" }} disabled={p.stock === 0} onClick={() => addToCart(p)}>{t.addToCart}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div className="fu">
            <PageHeader title={t.orders} subtitle={`${orders.length} orders`} />
            <div className="tabs" style={{ marginBottom: 18, width: "fit-content", maxWidth: "100%" }}>
              {OS.map(s => { const cnt = s === allOS ? orders.length : orders.filter(o => o.status === s).length; return <button key={s} className={`tab ${filterOS === s ? "on" : ""}`} onClick={() => setFilterOS(s)}>{s} <span style={{ opacity: .6, fontSize: 11 }}>{cnt}</span></button>; })}
            </div>
            <OrdersTable orders={fo} canEdit={role !== "customer"} onStatusChange={updateOrderStatus} OC={ORDER_COLORS} />
          </div>
        )}

        {/* MY ORDERS */}
        {tab === "myorders" && role === "customer" && (
          <div className="fu">
            <PageHeader title={t.myOrders} subtitle={`${myO.length} orders`} />
            {myO.length === 0 ? <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text3)" }}>No orders yet — go shop!</div> : <OrdersTable orders={myO} canEdit={false} onStatusChange={updateOrderStatus} OC={ORDER_COLORS} />}
          </div>
        )}

        {/* SUPPLIERS */}
        {tab === "suppliers" && role === "admin" && (
          <div className="fu">
            <PageHeader title={`🏭 ${t.suppliers}`} subtitle={`${suppliers.length} suppliers`}
              action={<button className="btn btn-primary" onClick={() => openM("editSupplier", null)}>+ {t.addSupplier}</button>} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
              {suppliers.map(s => {
                const linked = partSuppliers.filter(ps => ps.supplier_id === s.id);
                return (
                  <div key={s.id} className="card card-hover" style={{ padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div><div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>📍 {s.country || "—"}</div></div>
                      <span className="badge" style={{ background: "rgba(96,165,250,.12)", color: "var(--blue)" }}>{linked.length} parts</span>
                    </div>
                    {s.contact_person && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 3 }}>👤 {s.contact_person}</div>}
                    {s.email && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 3 }}>✉ {s.email}</div>}
                    {s.phone && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>📞 {s.phone}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openM("editSupplier", s)}>{t.edit}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSupplier(s.id)}>{t.delete}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INQUIRIES */}
        {tab === "inquiries" && role === "admin" && (
          <div className="fu">
            <PageHeader title={`📩 ${t.inquiries}`} subtitle={`${inquiries.length} inquiries · ${pendingInq} pending`} />
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr>{["Part", "Supplier", "Qty", "Status", "Reply Price", "Reply Stock", "Date", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {inquiries.map(inq => {
                      const sc = inq.status === "pending" ? "var(--yellow)" : inq.status === "replied" ? "var(--green)" : "var(--text3)";
                      return (
                        <tr key={inq.id}>
                          <td style={{ fontWeight: 600 }}>{inq.part_name}</td>
                          <td style={{ color: "var(--text2)" }}>{inq.supplier_name}</td>
                          <td style={{ textAlign: "center", fontWeight: 700 }}>{inq.qty_requested}</td>
                          <td><span className="badge" style={{ background: sc + "22", color: sc }}>{inq.status}</span></td>
                          <td style={{ color: inq.reply_price ? "var(--green)" : "var(--text3)" }}>{inq.reply_price ? `NT$${inq.reply_price.toLocaleString()}` : "—"}</td>
                          <td style={{ color: inq.reply_stock ? "var(--green)" : "var(--text3)" }}>{inq.reply_stock ?? "—"}</td>
                          <td style={{ color: "var(--text3)", fontSize: 13 }}>{inq.created_at?.slice(0, 10)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => openM("inquiryDetail", inq)}>View</button>
                              {inq.status !== "closed" && <button className="btn btn-danger btn-xs" onClick={() => updateInquiry(inq.id, { status: "closed" })}>Close</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {inquiries.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>No inquiries</div>}
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMERS */}
        {tab === "customers" && role === "admin" && (
          <div className="fu">
            <PageHeader title={t.customers} subtitle={`${customers.length} customers`}
              action={<button className="btn btn-primary" onClick={() => openM("editCustomer", null)}>+ Add</button>} />
            <div style={{ marginBottom: 18 }}><input className="inp" type="text" placeholder="Search name, phone..." value={searchCust} onChange={e => setSearchCust(e.target.value)} style={{ maxWidth: 300 }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
              {fc.map(c => (
                <div key={c.id} className="card card-hover" style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0, boxShadow: "0 4px 12px rgba(249,115,22,.3)" }}>{c.name?.[0]}</div>
                    <div><div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 13, color: "var(--text3)" }}>{c.phone}</div></div>
                  </div>
                  {c.email && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 3 }}>✉ {c.email}</div>}
                  {c.address && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>📍 {c.address}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14, marginBottom: 14 }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", fontFamily: "Rajdhani,sans-serif" }}>{c.orders}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{t.orders_count}</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif" }}>NT${(c.total_spent || 0).toLocaleString()}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{t.totalSpent}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openM("custHistory", c)}>📋 History</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openM("editCustomer", c)}>{t.edit}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteCustomer(c.id)}>{t.delete}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STOCK LOGS */}
        {tab === "logs" && role === "admin" && (
          <div className="fu">
            <PageHeader title={`📝 ${t.logs}`} subtitle={`${logs.length} records`} />
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr>{["Time", "Part", "Action", "Before", "After", "Change", "By", "Reason"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {logs.map(l => { const d = l.qty_after - l.qty_before; return (
                      <tr key={l.id}>
                        <td style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                        <td><div style={{ fontWeight: 600 }}>{l.part_name}</div><div style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--text3)" }}>{l.part_sku}</div></td>
                        <td><span className="badge" style={{ background: "var(--surface3)", color: "var(--text2)", fontSize: 11 }}>{l.action}</span></td>
                        <td style={{ textAlign: "center", color: "var(--text3)" }}>{l.qty_before}</td>
                        <td style={{ textAlign: "center", fontWeight: 700 }}>{l.qty_after}</td>
                        <td style={{ textAlign: "center" }}><span style={{ fontWeight: 700, color: d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--text3)" }}>{d > 0 ? `+${d}` : d}</span></td>
                        <td style={{ color: "var(--text2)", fontSize: 13 }}>{l.changed_by}</td>
                        <td style={{ color: "var(--text3)", fontSize: 13 }}>{l.reason || "—"}</td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
                {logs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>No records</div>}
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === "users" && role === "admin" && (
          <div className="fu">
            <PageHeader title={t.users} subtitle={`${users.length} users`}
              action={<button className="btn btn-primary" onClick={() => openM("editUser", null)}>+ Add User</button>} />
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr>{["User", t.role, "Subscription", "Phone", "Email", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {users.map(u => { const sub2 = getSubInfo(u); return (
                      <tr key={u.id}>
                        <td><div style={{ fontWeight: 600 }}>{u.name || u.username}</div><div style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--text3)" }}>{u.username}</div></td>
                        <td><span className="badge" style={{ background: ROLES[u.role]?.bg || "var(--surface3)", color: ROLES[u.role]?.color || "var(--text2)" }}>{ROLES[u.role]?.icon} {t[u.role] || u.role}</span></td>
                        <td>
                          <span className="badge" style={{ background: sub2.color + "22", color: sub2.color, marginBottom: 6 }}>{sub2.label}</span>
                          <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                            {["trial","active","expired","blocked"].map(s => (
                              <button key={s} className="btn btn-ghost btn-xs" style={{ color: u.subscription_status === s ? sub2.color : "var(--text3)", borderColor: u.subscription_status === s ? sub2.color : "var(--border)", padding: "2px 8px", fontSize: 11 }} onClick={() => saveUser({ ...u, subscription_status: s })}>{s}</button>
                            ))}
                          </div>
                        </td>
                        <td style={{ color: "var(--text2)", fontSize: 13 }}>{u.phone || "—"}</td>
                        <td style={{ color: "var(--text2)", fontSize: 13 }}>{u.email || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openM("editUser", u)}>{t.edit}</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)} disabled={u.id === user.id}>{t.delete}</button>
                          </div>
                        </td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* LOGIN LOGS */}
        {tab === "loginlogs" && role === "admin" && (
          <div className="fu">
            <PageHeader title={`🌍 ${t.loginLogs}`} subtitle={`${loginLogs.length} events`} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {Object.entries(loginLogs.reduce((a, l) => { const c = l.country || "?"; a[c] = (a[c] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => (
                <span key={c} className="badge" style={{ background: "var(--surface2)", color: "var(--text2)", padding: "6px 14px", fontSize: 13 }}>{c} · {n}</span>
              ))}
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr>{["Time", "User", t.role, "Country", "City", "IP", "Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {loginLogs.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{l.username}</td>
                        <td>{l.user_role && <span className="badge" style={{ background: ROLES[l.user_role]?.bg || "var(--surface3)", color: ROLES[l.user_role]?.color || "var(--text2)", fontSize: 11 }}>{ROLES[l.user_role]?.icon} {l.user_role}</span>}</td>
                        <td style={{ fontSize: 13 }}>{l.country || "—"}</td>
                        <td style={{ fontSize: 13, color: "var(--text3)" }}>{l.city || "—"}</td>
                        <td style={{ fontSize: 12, fontFamily: "DM Mono,monospace", color: "var(--text3)" }}>{l.ip_address || "—"}</td>
                        <td><span className="badge" style={{ background: l.status === "success" ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)", color: l.status === "success" ? "var(--green)" : "var(--red)" }}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loginLogs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>No login records</div>}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══ MODALS ══ */}
      {M.editPart !== undefined && M.editPart !== false && <PartModal part={M.editPart} onSave={savePart} onClose={() => closeM("editPart")} t={t} />}
      {M.adjust && <AdjustModal part={M.adjust} onApply={applyAdjust} onClose={() => closeM("adjust")} t={t} />}
      {M.editSupplier !== undefined && M.editSupplier !== false && <SupplierModal supplier={M.editSupplier} onSave={saveSupplier} onClose={() => closeM("editSupplier")} t={t} />}
      {M.partSupplier && <PartSupplierModal part={M.partSupplier} partSuppliers={getPartSupps(M.partSupplier.id)} suppliers={suppliers} onSave={savePartSupplier} onDelete={deletePartSupplier} onClose={() => closeM("partSupplier")} t={t} />}
      {M.inquiry && <InquiryModal part={M.inquiry} suppliers={suppliers} partSuppliers={getPartSupps(M.inquiry.id)} onSend={sendInquiry} onClose={() => closeM("inquiry")} t={t} />}
      {M.inquiryDetail && <InquiryDetailModal inquiry={M.inquiryDetail} onUpdate={updateInquiry} onClose={() => closeM("inquiryDetail")} t={t} />}
      {M.editCustomer !== undefined && M.editCustomer !== false && <CustomerModal customer={M.editCustomer} onSave={saveCustomer} onClose={() => closeM("editCustomer")} t={t} />}
      {M.editUser !== undefined && M.editUser !== false && <UserModal user={M.editUser} onSave={saveUser} onClose={() => closeM("editUser")} t={t} />}
      {M.custHistory && <CustHistoryModal customer={M.custHistory} orders={orders.filter(o => o.customer_phone === M.custHistory.phone)} onClose={() => closeM("custHistory")} OC={ORDER_COLORS} />}

      {/* CHECKOUT */}
      {M.checkout && (
        <CheckoutModal cart={cart} customers={customers} cartTotal={cartTotal} role={role} currentUser={user} onPlace={placeOrder} onClose={() => closeM("checkout")} onRemove={removeFromCart} onQty={qtyCart} t={t} lang={lang} />
      )}

      {/* ORDER CONFIRM — WhatsApp/Email notification */}
      {M.orderConfirm && (() => {
        const { order, phone: custPhone, email: custEmail } = M.orderConfirm;
        const msg = buildOrderMsg(order, lang);
        // Customer sends notification TO the shop
        const shopMsg = lang === "zh"
          ? `您好，我剛剛下了一筆訂單！\n\n訂單編號：${order.id}\n姓名：${order.customer_name}\n電話：${order.customer_phone}\n\n${msg}`
          : `Hi, I just placed an order!\n\nOrder ID: ${order.id}\nName: ${order.customer_name}\nPhone: ${order.customer_phone}\n\n${msg}`;
        return (
          <div className="overlay" onClick={() => closeM("orderConfirm")}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{lang === "zh" ? "訂單已成立！" : "Order Placed!"}</h2>
                <p style={{ color: "var(--text3)", fontSize: 13, marginTop: 6 }}>{order.id}</p>
              </div>

              {/* Order summary */}
              <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 14, marginBottom: 20, fontSize: 13, color: "var(--text2)", whiteSpace: "pre-line", lineHeight: 1.7, maxHeight: 160, overflowY: "auto" }}>{msg}</div>

              {/* Notify shop */}
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12, textAlign: "center", fontWeight: 600 }}>
                📬 {lang === "zh" ? "通知商店您的訂單：" : "Notify the shop about your order:"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a href={waLink(SHOP_WHATSAPP, shopMsg)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <button className="btn btn-primary" style={{ width: "100%", background: "#25D366", padding: 13, fontSize: 15 }}>
                    📲 {lang === "zh" ? "WhatsApp 傳送給商店" : "Send to Shop via WhatsApp"}
                  </button>
                </a>
                <a href={mailLink(SHOP_EMAIL, `New Order - ${order.id}`, shopMsg)} style={{ textDecoration: "none" }}>
                  <button className="btn btn-ghost" style={{ width: "100%", padding: 13, fontSize: 15 }}>
                    ✉ {lang === "zh" ? "Email 傳送給商店" : "Send to Shop via Email"}
                  </button>
                </a>
                <button className="btn btn-ghost" style={{ width: "100%", fontSize: 13 }} onClick={() => closeM("orderConfirm")}>
                  {lang === "zh" ? "稍後再傳" : "Skip for now"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RFQ SEND — WhatsApp/Email to supplier */}
      {M.rfqSend && (() => { const { part_name, part_sku, supplier_name, supplier_email, supplier_phone, qty_requested, token, message } = M.rfqSend;
        const replyUrl = `${window.location.origin}${window.location.pathname}?rfq=${token}`;
        const waMsg = `${message || `RFQ for ${part_name} (${part_sku}) - Qty: ${qty_requested}`}

📎 Submit quote here (no login needed):
${replyUrl}`;
        return (
          <div className="overlay" onClick={() => closeM("rfqSend")}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📩</div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Send RFQ to {supplier_name}</h2>
              </div>
              {/* Reply link */}
              <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14, marginBottom: 16, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Supplier Reply Link (no login needed)</div>
                <div style={{ fontSize: 12, fontFamily: "DM Mono,monospace", color: "var(--accent)", wordBreak: "break-all", lineHeight: 1.6 }}>{replyUrl}</div>
                <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard.writeText(replyUrl); showToast("Link copied!"); }}>📋 Copy Link</button>
              </div>
              <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14, textAlign: "center" }}>Send this RFQ to the supplier:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {supplier_phone && (
                  <a href={waLink(supplier_phone, waMsg)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <button className="btn btn-primary" style={{ width: "100%", background: "#25D366", padding: 13, fontSize: 15 }}>
                      📲 Send via WhatsApp
                    </button>
                  </a>
                )}
                {!supplier_phone && <p style={{ fontSize: 12, color: "var(--text3)", textAlign: "center" }}>💡 Add supplier phone number to enable WhatsApp</p>}
                {supplier_email && (
                  <a href={mailLink(supplier_email, `RFQ - ${part_name} (${part_sku})`, waMsg)} style={{ textDecoration: "none" }}>
                    <button className="btn btn-ghost" style={{ width: "100%", padding: 13, fontSize: 15 }}>✉ Send via Email</button>
                  </a>
                )}
                {!supplier_email && <p style={{ fontSize: 12, color: "var(--text3)", textAlign: "center" }}>💡 Add supplier email to enable Email</p>}
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => closeM("rfqSend")}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TOAST */}
      {toast && <div className="toast" style={{ borderColor: toast.type === "err" ? "rgba(248,113,113,.3)" : "var(--border2)", color: toast.type === "err" ? "var(--red)" : "var(--green)" }}>{toast.type === "err" ? "⚠" : "✓"} {toast.msg}</div>}
    </div>
  );
}

// ── Shared component ──────────────────────────────────────────
function OrdersTable({ orders, canEdit, onStatusChange, OC }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr>{["Order", "Customer", "Date", "Items", "Total", "Status", ...(canEdit ? ["Update"] : [])].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td><code style={{ fontFamily: "DM Mono,monospace", fontSize: 11, color: "var(--text3)" }}>{o.id}</code></td>
                <td><div style={{ fontWeight: 600 }}>{o.customer_name}</div><div style={{ fontSize: 12, color: "var(--text3)" }}>{o.customer_phone}</div></td>
                <td style={{ color: "var(--text3)", fontSize: 13, whiteSpace: "nowrap" }}>{o.date}</td>
                <td style={{ fontSize: 13, color: "var(--text2)" }}>{Array.isArray(o.items) && o.items.map((item, i) => <div key={i}>{item.name} ×{item.qty}</div>)}</td>
                <td style={{ fontWeight: 700, fontFamily: "Rajdhani,sans-serif", fontSize: 16, color: "var(--accent)", whiteSpace: "nowrap" }}>NT${(o.total || 0).toLocaleString()}</td>
                <td><span className="badge" style={{ background: (OC[o.status] || "#64748b") + "22", color: OC[o.status] || "#64748b" }}>{o.status}</span></td>
                {canEdit && <td><select value={o.status} onChange={e => onStatusChange(o.id, e.target.value)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>{["處理中","待出貨","已完成","已取消"].map(s => <option key={s}>{s}</option>)}</select></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>No orders</div>}
      </div>
    </div>
  );
}

// ── Modal helper ──────────────────────────────────────────────
const Overlay = ({ onClose, children, wide }) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" style={{ maxWidth: wide ? 600 : 520 }} onClick={e => e.stopPropagation()}>{children}</div>
  </div>
);
const MHead = ({ title, sub, onClose }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
    <div><h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>{sub && <p style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>{sub}</p>}</div>
    <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
  </div>
);
const FL = ({ label }) => <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 }}>{label}</span>;
const FRow = ({ children, cols = "1fr 1fr" }) => <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, marginBottom: 14 }}>{children}</div>;

// ── Part Modal ────────────────────────────────────────────────
function PartModal({ part, onSave, onClose, t }) {
  const [f, setF] = useState(part ? { sku: part.sku, name: part.name, category: part.category, brand: part.brand, price: part.price, stock: part.stock, minStock: part.min_stock, image_url: part.image_url || "" } : { sku: "", name: "", category: "Engine", brand: "", price: "", stock: "", minStock: "", image_url: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const preview = toImgUrl(f.image_url);
  return (
    <Overlay onClose={onClose}>
      <MHead title={part ? t.edit + " Part" : "New Part"} onClose={onClose} />
      <FRow><div><FL label={t.sku + " *"} /><input className="inp" value={f.sku} onChange={e => s("sku", e.target.value)} placeholder="ENG-001" /></div><div><FL label={t.brand} /><input className="inp" value={f.brand} onChange={e => s("brand", e.target.value)} placeholder="BOSCH" /></div></FRow>
      <div style={{ marginBottom: 14 }}><FL label={t.name + " *"} /><input className="inp" value={f.name} onChange={e => s("name", e.target.value)} /></div>
      <div style={{ marginBottom: 14 }}><FL label={t.category} /><select className="inp" value={f.category} onChange={e => s("category", e.target.value)}>{["Engine","Brake","Filter","Electrical","Suspension","引擎","煞車系統","濾清系統","電氣系統","懸吊系統"].map(c => <option key={c}>{c}</option>)}</select></div>
      <FRow cols="1fr 1fr 1fr"><div><FL label={t.price + " *"} /><input className="inp" type="number" value={f.price} onChange={e => s("price", e.target.value)} /></div><div><FL label={t.stock} /><input className="inp" type="number" value={f.stock} onChange={e => s("stock", e.target.value)} /></div><div><FL label={t.minStock} /><input className="inp" type="number" value={f.minStock} onChange={e => s("minStock", e.target.value)} /></div></FRow>
      <div style={{ marginBottom: 18 }}>
        <FL label={t.image_url} />
        <input className="inp" type="url" value={f.image_url} onChange={e => s("image_url", e.target.value)} placeholder="https://drive.google.com/file/d/..." />
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 5 }}>{t.gdrive_hint}</div>
        {preview && <img src={preview} alt="" style={{ marginTop: 10, width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} onError={e => e.target.style.display = "none"} />}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!f.sku || !f.name || !f.price) return; onSave({ sku: f.sku, name: f.name, category: f.category, brand: f.brand, price: +f.price, stock: +f.stock, min_stock: +f.minStock, image_url: f.image_url }); }}>{t.save}</button>
      </div>
    </Overlay>
  );
}

// ── Adjust Modal ──────────────────────────────────────────────
function AdjustModal({ part, onApply, onClose, t }) {
  const [nq, setNq] = useState(part.stock); const [reason, setReason] = useState("");
  const diff = nq - part.stock;
  return (
    <Overlay onClose={onClose}>
      <MHead title={`📦 ${t.adjustStock}`} sub={`${part.name} · ${part.sku}`} onClose={onClose} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: "var(--surface2)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
        {[["Current", part.stock, "var(--text2)"], ["Change", diff > 0 ? `+${diff}` : diff || "—", diff > 0 ? "var(--green)" : diff < 0 ? "var(--red)" : "var(--text3)"], ["New", nq, "var(--accent)"]].map(([l, v, c]) => (
          <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{l}</div><div style={{ fontSize: 26, fontWeight: 700, color: c, fontFamily: "Rajdhani,sans-serif" }}>{v}</div></div>
        ))}
      </div>
      <div style={{ marginBottom: 14 }}>
        <FL label="New quantity *" />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 18 }} onClick={() => setNq(q => Math.max(0, q - 1))}>−</button>
          <input className="inp" type="number" value={nq} onChange={e => setNq(Math.max(0, parseInt(e.target.value) || 0))} style={{ textAlign: "center", fontWeight: 700, fontSize: 18 }} />
          <button className="btn btn-ghost" style={{ padding: "10px 16px", fontSize: 18 }} onClick={() => setNq(q => q + 1)}>+</button>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}><FL label="Reason" /><input className="inp" value={reason} onChange={e => setReason(e.target.value)} placeholder="Stocktake, damage, return..." /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onApply(part, nq, reason)}>{t.confirm}</button>
      </div>
    </Overlay>
  );
}

// ── Checkout Modal ────────────────────────────────────────────
function CheckoutModal({ cart, customers, cartTotal, role, currentUser, onPlace, onClose, onRemove, onQty, t, lang }) {
  // Pre-fill from logged-in customer
  const [form, setForm] = useState({
    name: currentUser?._isCustomer ? (currentUser.name || "") : "",
    phone: currentUser?._isCustomer ? (currentUser.phone || "") : "",
    email: currentUser?._isCustomer ? (currentUser.email || "") : "",
    address: currentUser?._isCustomer ? (currentUser.address || "") : "",
  });
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const fillFromCustomer = (c) => setForm({ phone: c.phone, name: c.name, email: c.email || "", address: c.address || "" });

  return (
    <Overlay onClose={onClose}>
      <MHead title={`🛒 ${t.checkout}`} onClose={onClose} />
      {cart.length === 0 ? <p style={{ color: "var(--text3)", textAlign: "center", padding: 30 }}>Cart is empty</p> : (
        <>
          {/* Cart items */}
          <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
            {cart.map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</div><div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>NT${i.price.toLocaleString()} each</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => onQty(i.id, i.qty - 1)}>−</button>
                  <span style={{ fontWeight: 700, minWidth: 20, textAlign: "center" }}>{i.qty}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => onQty(i.id, i.qty + 1)}>+</button>
                  <button className="btn btn-danger btn-xs" onClick={() => onRemove(i.id)}>✕</button>
                </div>
                <div style={{ fontWeight: 700, color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", fontSize: 16, minWidth: 80, textAlign: "right" }}>NT${(i.price * i.qty).toLocaleString()}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 0", fontWeight: 700, fontSize: 18 }}>
              <span>{t.total}</span><span style={{ color: "var(--accent)", fontFamily: "Rajdhani,sans-serif", fontSize: 22 }}>NT${cartTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Admin: quick select customer */}
          {role === "admin" && customers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <FL label={lang === "zh" ? "快速選擇客戶" : "Quick select customer"} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {customers.slice(0, 10).map(c => <button key={c.id} className="btn btn-ghost btn-xs" style={{ borderColor: form.phone === c.phone ? "var(--accent)" : "var(--border)", color: form.phone === c.phone ? "var(--accent)" : "var(--text2)" }} onClick={() => fillFromCustomer(c)}>{c.name}</button>)}
              </div>
            </div>
          )}

          {/* Customer info — pre-filled if logged in as customer */}
          {currentUser?._isCustomer ? (
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 14, marginBottom: 18, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--green)", marginBottom: 8, fontWeight: 600 }}>✓ {lang === "zh" ? "已登入，資料自動帶入" : "Logged in — info auto-filled"}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{form.name}</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{form.phone} {form.email && `· ${form.email}`}</div>
              {form.address && <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>📍 {form.address}</div>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <div>
                <FL label={lang === "zh" ? "電話 *" : "Phone *"} />
                <input className="inp" value={form.phone} placeholder="+886..." type="tel" onChange={e => { const ph = e.target.value; const found = customers.find(c => c.phone === ph); if (found) fillFromCustomer(found); else sf("phone", ph); }} />
                {customers.find(c => c.phone === form.phone) && <div style={{ fontSize: 12, color: "var(--green)", marginTop: 5 }}>✓ {lang === "zh" ? "舊客戶資料已帶入" : "Existing customer loaded"}</div>}
              </div>
              <div><FL label={lang === "zh" ? "姓名 *" : "Name *"} /><input className="inp" value={form.name} placeholder="Full name" onChange={e => sf("name", e.target.value)} /></div>
              <div><FL label="Email" /><input className="inp" type="email" value={form.email} placeholder="for order confirmation" onChange={e => sf("email", e.target.value)} /></div>
              <div><FL label={lang === "zh" ? "地址" : "Address"} /><input className="inp" value={form.address} placeholder="Delivery address" onChange={e => sf("address", e.target.value)} /></div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onPlace(form)}>{t.placeOrder}</button>
          </div>
        </>
      )}
    </Overlay>
  );
}

// ── Supplier Modal ────────────────────────────────────────────
function SupplierModal({ supplier, onSave, onClose, t }) {
  const [f, setF] = useState(supplier ? { name: supplier.name, email: supplier.email||"", phone: supplier.phone||"", country: supplier.country||"", contact_person: supplier.contact_person||"", notes: supplier.notes||"" } : { name:"", email:"", phone:"", country:"", contact_person:"", notes:"" });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={supplier ? "Edit Supplier" : "Add Supplier"} onClose={onClose} />
      <div style={{ marginBottom: 14 }}><FL label={t.supplierName + " *"} /><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} /></div>
      <FRow><div><FL label={t.country} /><input className="inp" value={f.country} onChange={e=>s("country",e.target.value)} placeholder="Taiwan, Japan..." /></div><div><FL label={t.contactPerson} /><input className="inp" value={f.contact_person} onChange={e=>s("contact_person",e.target.value)} /></div></FRow>
      <FRow><div><FL label={t.email} /><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)} /></div><div><FL label={t.phone} /><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} /></div></FRow>
      <div style={{ marginBottom: 18 }}><FL label={t.notes} /><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} /></div>
      <div style={{ display:"flex",gap:10 }}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{ if(!f.name)return; onSave(f); }}>{t.save}</button></div>
    </Overlay>
  );
}

// ── Part Supplier Modal ───────────────────────────────────────
function PartSupplierModal({ part, partSuppliers, suppliers, onSave, onDelete, onClose, t }) {
  const [suppId, setSuppId] = useState(""); const [price, setPrice] = useState(""); const [lead, setLead] = useState(""); const [minOrd, setMinOrd] = useState(1);
  const avail = suppliers.filter(s => !partSuppliers.find(ps => ps.supplier_id === s.id));
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🏭 Suppliers — ${part.name}`} sub={part.sku} onClose={onClose} />
      {partSuppliers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <FL label="Linked Suppliers" />
          {partSuppliers.map(ps => (
            <div key={ps.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid var(--border)" }}>
              <div><div style={{ fontWeight: 600 }}>{ps.supplier?.name}</div><div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{ps.supplier?.country} · Lead: {ps.lead_time||"—"} · Min: {ps.min_order}</div>{ps.supplier_price && <div style={{ fontSize: 13, color: "var(--green)", marginTop: 2 }}>NT${ps.supplier_price.toLocaleString()}</div>}</div>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(ps.id)}>{t.delete}</button>
            </div>
          ))}
        </div>
      )}
      {avail.length > 0 && (
        <div>
          <FL label="Link New Supplier" />
          <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
            <div style={{ marginBottom: 12 }}><FL label="Supplier *" /><select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}><option value="">Select...</option>{avail.map(s=><option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}</select></div>
            <FRow cols="1fr 1fr 1fr">
              <div><FL label={t.supplier_price} /><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0" /></div>
              <div><FL label={t.lead_time} /><input className="inp" value={lead} onChange={e=>setLead(e.target.value)} placeholder="7 days" /></div>
              <div><FL label={t.min_order} /><input className="inp" type="number" value={minOrd} onChange={e=>setMinOrd(e.target.value)} /></div>
            </FRow>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => { if (!suppId) return; onSave({ part_id: part.id, supplier_id: +suppId, supplier_price: price?+price:null, lead_time: lead, min_order: +minOrd }); setSuppId(""); setPrice(""); setLead(""); setMinOrd(1); }}>Link Supplier</button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

// ── Inquiry Modal ─────────────────────────────────────────────
function InquiryModal({ part, suppliers, partSuppliers, onSend, onClose, t }) {
  const [suppId, setSuppId] = useState(partSuppliers[0]?.supplier_id || ""); const [qty, setQty] = useState(10);
  const [msg, setMsg] = useState(`Dear Supplier,\n\nWe would like a quotation for:\n- Part: ${part.name} (${part.sku})\n- Quantity: ${qty}\n\nPlease confirm your best price and available stock.\n\nThank you.`);
  const sel = suppliers.find(s => s.id === +suppId);
  return (
    <Overlay onClose={onClose}>
      <MHead title="📩 Send RFQ" sub={`${part.name} · ${part.sku}`} onClose={onClose} />
      <div style={{ marginBottom: 14 }}><FL label="Supplier *" /><select className="inp" value={suppId} onChange={e=>setSuppId(e.target.value)}><option value="">Select...</option>{(partSuppliers.length>0?partSuppliers.map(ps=>{const s=suppliers.find(s=>s.id===ps.supplier_id);return s?<option key={s.id} value={s.id}>{s.name} ({s.country})</option>:null}):suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>))}</select>{sel&&<div style={{fontSize:12,color:"var(--text3)",marginTop:5}}>✉ {sel.email||"No email"}</div>}</div>
      <div style={{ marginBottom: 14 }}><FL label="Quantity *" /><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} /></div>
      <div style={{ marginBottom: 18 }}><FL label="Message" /><textarea className="inp" value={msg} onChange={e=>setMsg(e.target.value)} style={{ minHeight: 120 }} /></div>
      <div style={{ display:"flex",gap:10 }}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{ if(!suppId||!qty)return; onSend({part_id:part.id,part_name:part.name,part_sku:part.sku,supplier_id:+suppId,supplier_name:sel?.name,supplier_email:sel?.email,supplier_phone:sel?.phone,qty_requested:+qty,message:msg}); }}>📩 {t.send}</button></div>
    </Overlay>
  );
}

// ── Inquiry Detail Modal ──────────────────────────────────────
function InquiryDetailModal({ inquiry, onUpdate, onClose, t }) {
  const [rp, setRp] = useState(inquiry.reply_price||""); const [rs, setRs] = useState(inquiry.reply_stock||""); const [rn, setRn] = useState(inquiry.reply_notes||"");
  return (
    <Overlay onClose={onClose}>
      <MHead title="📩 Inquiry Detail" sub={inquiry.id} onClose={onClose} />
      <div style={{ background:"var(--surface2)",borderRadius:12,padding:16,marginBottom:18,border:"1px solid var(--border)" }}>
        <FRow><div><FL label="Part" /><div style={{fontWeight:600}}>{inquiry.part_name}</div></div><div><FL label="Supplier" /><div style={{fontWeight:600}}>{inquiry.supplier_name}</div></div></FRow>
        <FRow><div><FL label="Email" /><div style={{color:"var(--text2)",fontSize:13}}>{inquiry.supplier_email||"—"}</div></div><div><FL label="Qty Requested" /><div style={{fontWeight:700,color:"var(--accent)",fontSize:16,fontFamily:"Rajdhani,sans-serif"}}>{inquiry.qty_requested}</div></div></FRow>
        {inquiry.message&&<div><FL label="Message" /><div style={{fontSize:13,color:"var(--text2)",whiteSpace:"pre-line",lineHeight:1.7}}>{inquiry.message}</div></div>}
      </div>
      <FL label="Record Reply" />
      <FRow><div><FL label="Reply Price" /><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="NT$" /></div><div><FL label="Reply Stock" /><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)} /></div></FRow>
      <div style={{ marginBottom: 18 }}><FL label="Notes" /><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)} /></div>
      <div style={{ display:"flex",gap:8 }}>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>onUpdate(inquiry.id,{reply_price:rp?+rp:null,reply_stock:rs?+rs:null,reply_notes:rn,status:"replied",replied_at:new Date().toISOString()})}>Save & Mark Replied</button>
        <button className="btn btn-danger" style={{flex:1}} onClick={()=>onUpdate(inquiry.id,{status:"closed"})}>Close</button>
      </div>
    </Overlay>
  );
}

// ── Customer Modal ────────────────────────────────────────────
function CustomerModal({ customer, onSave, onClose, t }) {
  const [f, setF] = useState(customer?{name:customer.name,phone:customer.phone,email:customer.email||"",address:customer.address||""}:{name:"",phone:"",email:"",address:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={customer?"Edit Customer":"Add Customer"} onClose={onClose} />
      <FRow><div><FL label={t.name+" *"} /><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} /></div><div><FL label={t.phone+" *"} /><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} /></div></FRow>
      <div style={{marginBottom:14}}><FL label={t.email} /><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)} /></div>
      <div style={{marginBottom:18}}><FL label="Address" /><input className="inp" value={f.address} onChange={e=>s("address",e.target.value)} /></div>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name||!f.phone)return;onSave(f);}}>{t.save}</button></div>
    </Overlay>
  );
}

// ── User Modal ────────────────────────────────────────────────
function UserModal({ user, onSave, onClose, t }) {
  const [f, setF] = useState(user?{username:user.username,password:"",role:user.role,name:user.name||"",phone:user.phone||"",email:user.email||""}:{username:"",password:"",role:"customer",name:"",phone:"",email:""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <Overlay onClose={onClose}>
      <MHead title={user?"Edit User":"Add User"} onClose={onClose} />
      <FRow><div><FL label="Username *" /><input className="inp" value={f.username} onChange={e=>s("username",e.target.value)} disabled={!!user} /></div><div><FL label={user?"New password (blank=no change)":"Password *"} /><input className="inp" type="password" value={f.password} onChange={e=>s("password",e.target.value)} placeholder="••••••" /></div></FRow>
      <div style={{marginBottom:14}}><FL label={t.role} /><select className="inp" value={f.role} onChange={e=>s("role",e.target.value)}><option value="admin">👑 Admin</option><option value="shipper">🚚 Shipper</option><option value="customer">👤 Customer</option></select></div>
      <FRow><div><FL label={t.name} /><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} /></div><div><FL label={t.phone} /><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} /></div></FRow>
      <div style={{marginBottom:18}}><FL label={t.email} /><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)} /></div>
      <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.username||(!user&&!f.password))return;const d={username:f.username,role:f.role,name:f.name,phone:f.phone,email:f.email};if(f.password)d.password=f.password;onSave(d);}}>{t.save}</button></div>
    </Overlay>
  );
}

// ── Customer History Modal ────────────────────────────────────
function CustHistoryModal({ customer, orders, onClose, OC }) {
  const total = orders.reduce((s, o) => s + (o.total || 0), 0);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📋 Order History" sub={`${customer.name} · ${customer.phone}`} onClose={onClose} />
      {orders.length === 0 ? <p style={{color:"var(--text3)",textAlign:"center",padding:30}}>No orders yet</p> : (
        <>
          {orders.map(o => (
            <div key={o.id} style={{background:"var(--surface2)",borderRadius:12,padding:16,marginBottom:10,border:"1px solid var(--border)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{o.id}</code><div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{o.date}</div></div>
                <div style={{textAlign:"right"}}><span className="badge" style={{background:(OC[o.status]||"#64748b")+"22",color:OC[o.status]||"#64748b"}}>{o.status}</span><div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:4}}>NT${(o.total||0).toLocaleString()}</div></div>
              </div>
              {Array.isArray(o.items)&&o.items.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:3}}><span>{item.name} ×{item.qty}</span><span>NT${((item.price||0)*item.qty).toLocaleString()}</span></div>)}
            </div>
          ))}
          <div style={{borderTop:"1px solid var(--border)",paddingTop:14,display:"flex",justifyContent:"space-between",fontWeight:700}}>
            <span style={{color:"var(--text2)"}}>{orders.length} orders</span>
            <span style={{color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:18}}>Total NT${total.toLocaleString()}</span>
          </div>
        </>
      )}
    </Overlay>
  );
}

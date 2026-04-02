import { useState, useEffect, useCallback } from "react";

// ════════════════════════════════════════════════════════════
// 🔑 LICENSE KEY SYSTEM
// Client enters "AP-xxx" → auto-decrypts → connects to Supabase
// Admin can also enter URL/Key manually as fallback
// ════════════════════════════════════════════════════════════

// Master secret split to make source extraction harder
// ⚠️ Change this in your production build!
const _MS = ["AutoParts", "Secure", "Key", "2024"].join("_");

const _b64d = s => { const pad = "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s + pad), c => c.charCodeAt(0)); };

async function _deriveKey(secret, salt) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

// Decode "AP-xxx" license key → returns payload object
async function decodeLicenseKey(licenseKey) {
  const b64 = licenseKey.replace(/^AP-/, "").replace(/-/g, "+").replace(/_/g, "/");
  const inner = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
  const [s, iv, ct] = inner.split(":");
  const ck = await _deriveKey(_MS, _b64d(s));
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: _b64d(iv) }, ck, _b64d(ct));
  return JSON.parse(new TextDecoder().decode(dec));
}

function isLicenseValid(p) {
  if (!p.expires) return true;
  return new Date(p.expires) > new Date();
}

function getDaysLeft(p) {
  if (!p.expires) return 9999;
  return Math.max(0, Math.ceil((new Date(p.expires) - new Date()) / 86400000));
}

// Load saved config: license key first, then manual URL/key
async function loadConfig() {
  const savedLic = localStorage.getItem("ap_license_key");
  if (savedLic && savedLic.startsWith("AP-")) {
    try {
      const payload = await decodeLicenseKey(savedLic);
      if (payload.url && payload.key) {
        return { url: payload.url, key: payload.key, source: "license", license: payload, valid: isLicenseValid(payload) };
      }
    } catch {}
  }
  const url = localStorage.getItem("sb_url") || "";
  const key = localStorage.getItem("sb_key") || "";
  return { url, key, source: "manual", valid: !!(url && key) };
}

const getConfig = () => ({
  url: localStorage.getItem("sb_url") || "",
  key: localStorage.getItem("sb_key") || "",
});
const saveConfig = (url, key) => { localStorage.setItem("sb_url", url); localStorage.setItem("sb_key", key); };
const saveLicense = (k) => localStorage.setItem("ap_license_key", k);
const clearAllConfig = () => { ["ap_license_key","sb_url","sb_key"].forEach(k => localStorage.removeItem(k)); };

const H = (cfg, extra = {}) => ({
  apikey: cfg.key, Authorization: `Bearer ${cfg.key}`,
  "Content-Type": "application/json", ...extra,
});
const makeApi = (cfg) => ({
  get: async (t, q = "") => { const r = await fetch(`${cfg.url}/rest/v1/${t}?${q}`, { headers: H(cfg) }); return r.json(); },
  upsert: async (t, d) => { const r = await fetch(`${cfg.url}/rest/v1/${t}`, { method: "POST", headers: H(cfg, { Prefer: "return=representation,resolution=merge-duplicates" }), body: JSON.stringify(d) }); return r.json(); },
  patch: async (t, c, v, d) => { const r = await fetch(`${cfg.url}/rest/v1/${t}?${c}=eq.${v}`, { method: "PATCH", headers: H(cfg, { Prefer: "return=representation" }), body: JSON.stringify(d) }); return r.json(); },
  delete: async (t, c, v) => { await fetch(`${cfg.url}/rest/v1/${t}?${c}=eq.${v}`, { method: "DELETE", headers: H(cfg) }); },
});

// ════════════════════════════════════════════════════════════
// 🌐 i18n — English / Chinese
// ════════════════════════════════════════════════════════════
const T = {
  en: {
    appName: "AUTOPARTS", appSub: "Parts Management System",
    dashboard: "Dashboard", inventory: "Inventory", shop: "Shop",
    orders: "Orders", myOrders: "My Orders", customers: "Customers",
    users: "Users", suppliers: "Suppliers", inquiries: "Inquiries",
    logs: "Adj. Logs", loginLogs: "Login Logs", logout: "Logout",
    cart: "Cart", login: "Login", setup: "Setup",
    username: "Username", password: "Password", loginBtn: "Sign In",
    wrongPass: "Invalid username or password", connecting: "Connecting...",
    addPart: "+ Add Part", editPart: "Edit Part", newPart: "New Part",
    adjustStock: "Adjust Stock", save: "Save", cancel: "Cancel", delete: "Delete",
    edit: "Edit", close: "Close", confirm: "Confirm",
    sku: "SKU", name: "Name", category: "Category", brand: "Brand",
    price: "Price", stock: "Stock", minStock: "Min Stock", status: "Status",
    normal: "Normal", low: "Low Stock", outOfStock: "Out of Stock",
    placeOrder: "Place Order", addToCart: "Add to Cart", checkout: "Checkout",
    orderHistory: "Order History", totalSpent: "Total Spent",
    addSupplier: "+ Add Supplier", supplierName: "Supplier Name",
    email: "Email", phone: "Phone", country: "Country", contactPerson: "Contact",
    sendInquiry: "Send Inquiry", inquiryStatus: "Status", pending: "Pending",
    replied: "Replied", closed: "Closed", qtyRequested: "Qty Requested",
    replyPrice: "Reply Price", replyStock: "Reply Stock",
    loginTime: "Login Time", ipAddress: "IP Address", device: "Device",
    role: "Role", admin: "Admin", shipper: "Shipper", customer: "Customer",
    supabaseUrl: "Supabase URL", supabaseKey: "Supabase Anon Key",
    saveConfig: "Save & Continue", testDemoAccounts: "Demo Accounts",
    revenue: "Revenue", pending_orders: "Pending Orders", low_stock: "Low Stock",
    part_types: "Part Types", adj_logs: "Adj. Logs", login_logs: "Login Logs",
    image_url: "Image URL (Google Drive)", gdrive_hint: "Paste Google Drive share link — auto-converted",
    suppliers_tab: "Suppliers", lead_time: "Lead Time", min_order: "Min Order",
    supplier_price: "Supplier Price", notes: "Notes", message: "Message",
    all: "All", action: "Action", before: "Before", after: "After",
    change: "Change", operator: "Operator", reason: "Reason",
    new_part_log: "New Part", edit_part_log: "Edit Part", delete_part_log: "Delete Part",
    manual_adj: "Manual Adj.", order_deduct: "Order Deduct", cancel_restore: "Cancel Restore",
    order_restore: "Order Restore", search: "Search...", filter: "Filter",
    no_data: "No data found", total: "Total", orders_count: "Orders",
  },
  zh: {
    appName: "AUTO零件", appSub: "零件管理銷售系統",
    dashboard: "總覽儀表板", inventory: "庫存管理", shop: "線上商店",
    orders: "訂單管理", myOrders: "我的訂單", customers: "客戶管理",
    users: "用戶管理", suppliers: "供應商管理", inquiries: "詢價管理",
    logs: "調整記錄", loginLogs: "登入記錄", logout: "登出",
    cart: "購物車", login: "登入", setup: "系統設定",
    username: "帳號", password: "密碼", loginBtn: "登入系統",
    wrongPass: "帳號或密碼錯誤", connecting: "載入中...",
    addPart: "+ 新增零件", editPart: "編輯零件", newPart: "新增零件",
    adjustStock: "調整庫存", save: "儲存", cancel: "取消", delete: "刪除",
    edit: "編輯", close: "關閉", confirm: "確認",
    sku: "料號", name: "名稱", category: "分類", brand: "品牌",
    price: "單價", stock: "庫存", minStock: "最低庫存", status: "狀態",
    normal: "正常", low: "庫存低", outOfStock: "缺貨",
    placeOrder: "確認下單", addToCart: "加入購物車", checkout: "結帳",
    orderHistory: "訂單歷史", totalSpent: "總消費",
    addSupplier: "+ 新增供應商", supplierName: "供應商名稱",
    email: "Email", phone: "電話", country: "國家", contactPerson: "聯絡人",
    sendInquiry: "發送詢價", inquiryStatus: "狀態", pending: "待回覆",
    replied: "已回覆", closed: "已關閉", qtyRequested: "詢問數量",
    replyPrice: "報價", replyStock: "可供數量",
    loginTime: "登入時間", ipAddress: "IP 位址", device: "裝置",
    role: "角色", admin: "管理員", shipper: "出貨員", customer: "客戶",
    supabaseUrl: "Supabase URL", supabaseKey: "Supabase Anon Key",
    saveConfig: "儲存並繼續", testDemoAccounts: "測試帳號",
    revenue: "已完成營收", pending_orders: "待處理訂單", low_stock: "低庫存警告",
    part_types: "零件種類", adj_logs: "調整記錄", login_logs: "登入記錄",
    image_url: "圖片網址（Google Drive）", gdrive_hint: "貼上 Google Drive 分享連結，自動轉換",
    suppliers_tab: "供應商", lead_time: "交貨期", min_order: "最小訂量",
    supplier_price: "供應商報價", notes: "備註", message: "訊息",
    all: "全部", action: "操作", before: "調整前", after: "調整後",
    change: "變化", operator: "操作者", reason: "原因",
    new_part_log: "新增零件", edit_part_log: "編輯零件", delete_part_log: "刪除零件",
    manual_adj: "手動調整", order_deduct: "訂單扣除", cancel_restore: "取消補回",
    order_restore: "訂單恢復扣除", search: "搜尋...", filter: "篩選",
    no_data: "找不到資料", total: "總計", orders_count: "訂單數",
  },
};

// Google Drive URL converter
const toImgUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
  if (url.includes("id=")) { const id = new URLSearchParams(url.split("?")[1]).get("id"); if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w400`; }
  return url;
};

const ROLES_DEF = {
  admin:    { color: "#e85d04", bg: "#e85d0422", icon: "👑" },
  shipper:  { color: "#3b82f6", bg: "#3b82f622", icon: "🚚" },
  customer: { color: "#22c55e", bg: "#22c55e22", icon: "👤" },
};
const SC = { "completed": "#22c55e", "shipped": "#f59e0b", "processing": "#3b82f6", "cancelled": "#ef4444", "已完成": "#22c55e", "待出貨": "#f59e0b", "處理中": "#3b82f6", "已取消": "#ef4444" };
const CATS_EN = ["All", "Engine", "Brake", "Filter", "Electrical", "Suspension"];
const CATS_ZH = ["全部", "引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"];
const LOG_COLORS = { "新增零件": "#3b82f6", "New Part": "#3b82f6", "編輯零件": "#8b5cf6", "Edit Part": "#8b5cf6", "刪除零件": "#ef4444", "Delete Part": "#ef4444", "手動調整": "#f59e0b", "Manual Adj.": "#f59e0b", "訂單扣除": "#64748b", "Order Deduct": "#64748b", "取消補回": "#22c55e", "Cancel Restore": "#22c55e", "訂單恢復扣除": "#f97316", "Order Restore": "#f97316" };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Rajdhani:wght@600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#1a1d26}::-webkit-scrollbar-thumb{background:#374151;border-radius:3px}
input,select,textarea{outline:none}
.btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;transition:all .2s}
.btn-primary{background:#e85d04;color:#fff;padding:8px 18px}.btn-primary:hover{background:#f87337;transform:translateY(-1px)}.btn-primary:disabled{background:#444;cursor:not-allowed;transform:none}
.btn-secondary{background:#1e2130;color:#94a3b8;padding:8px 18px;border:1px solid #2d3347}.btn-secondary:hover{background:#252840;color:#e2e8f0}
.btn-danger{background:#7f1d1d;color:#fca5a5;padding:6px 14px}.btn-danger:hover{background:#991b1b}.btn-danger:disabled{opacity:.4;cursor:not-allowed}
.btn-info{background:#1e3a5f;color:#60a5fa;padding:6px 14px;border:1px solid #1e40af44}.btn-info:hover{background:#1e40af}
.btn-sm{padding:5px 12px;font-size:12px}
.card{background:#141720;border:1px solid #1e2130;border-radius:12px}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
input[type=text],input[type=number],input[type=tel],input[type=email],input[type=password],input[type=url],select,textarea{background:#0d0f14;border:1px solid #2d3347;color:#e2e8f0;border-radius:6px;padding:8px 12px;font-family:inherit;font-size:13px;width:100%}
textarea{resize:vertical;min-height:72px}
input:focus,select:focus,textarea:focus{border-color:#e85d04}
.mo{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
.md{background:#141720;border:1px solid #2d3347;border-radius:14px;padding:28px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto}
tr:hover td{background:#1a1d26!important}
.tf{background:none;border:none;cursor:pointer;color:#64748b;padding:6px 14px;font-family:inherit;font-size:12px;font-weight:500;border-radius:6px;transition:all .2s;white-space:nowrap}
.tf.act{background:#1e2130;color:#e85d04}.tf:hover:not(.act){color:#94a3b8}
.lang-btn{background:none;border:1px solid #2d3347;border-radius:6px;color:#94a3b8;padding:3px 10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all .2s}
.lang-btn.act{background:#e85d04;color:#fff;border-color:#e85d04}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.fu{animation:fadeUp .22s ease}
`;

// ════════════════════════════════════════════════════════════
// SETUP PAGE — License Key entry (primary) + Manual fallback
// ════════════════════════════════════════════════════════════
function SetupPage({ onDone, lang, t }) {
  const [mode, setMode] = useState("license"); // "license" | "manual"
  const [licKey, setLicKey] = useState(localStorage.getItem("ap_license_key") || "");
  const [url, setUrl] = useState(localStorage.getItem("sb_url") || "");
  const [key, setKey] = useState(localStorage.getItem("sb_key") || "");
  const [err, setErr] = useState("");
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState(null);

  // Auto-preview license info as user types
  const previewLicense = async (k) => {
    setLicKey(k); setErr(""); setInfo(null);
    if (!k.startsWith("AP-") || k.length < 20) return;
    try {
      const p = await decodeLicenseKey(k);
      setInfo(p);
    } catch { setInfo(null); }
  };

  const handleLicenseSave = async () => {
    if (!licKey.startsWith("AP-")) { setErr("Invalid license key — must start with AP-"); return; }
    setTesting(true); setErr("");
    try {
      const payload = await decodeLicenseKey(licKey);
      if (!isLicenseValid(payload)) { setErr(`License expired on ${payload.expires}`); setTesting(false); return; }
      // Test connection
      const res = await fetch(`${payload.url}/rest/v1/users?select=id&limit=1`, { headers: { apikey: payload.key, Authorization: `Bearer ${payload.key}` } });
      if (res.ok) { saveLicense(licKey); saveConfig(payload.url, payload.key); onDone(); }
      else setErr("Connection test failed — contact your administrator");
    } catch (e) { setErr("Invalid license key or wrong master secret"); }
    setTesting(false);
  };

  const handleManualSave = async () => {
    if (!url || !key) { setErr("Both fields are required"); return; }
    setTesting(true); setErr("");
    try {
      const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) { saveConfig(url, key); onDone(); }
      else setErr(`Connection failed: ${res.status}`);
    } catch { setErr("Cannot reach Supabase — check URL"); }
    setTesting(false);
  };

  const daysLeft = info ? getDaysLeft(info) : null;

  return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Noto Sans TC,sans-serif", padding: 20 }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 34, fontWeight: 700, color: "#e85d04" }}>⚙ AUTO<span style={{ color: "#e2e8f0" }}>PARTS</span></div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Parts Management System</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#0d0f14", borderRadius: 8, padding: 4, marginBottom: 24, border: "1px solid #1e2130" }}>
            {[["license","🔑 License Key"], ["manual","⚙ Manual Setup"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, padding: "8px 0", background: mode === m ? "#e85d04" : "none", color: mode === m ? "#fff" : "#64748b", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: mode === m ? 600 : 400, fontFamily: "inherit", transition: "all .2s" }}>
                {label}
              </button>
            ))}
          </div>

          {/* LICENSE KEY MODE */}
          {mode === "license" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#0d0f14", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#60a5fa" }}>
                🔑 Enter the license key provided by your administrator to connect automatically.
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>License Key</label>
                <input type="text" placeholder="AP-xxxxxxxxxxxxxxxxxx..." value={licKey} onChange={e => previewLicense(e.target.value)} style={{ fontFamily: "monospace", fontSize: 12 }} />
              </div>

              {/* Live preview */}
              {info && (
                <div style={{ background: isLicenseValid(info) ? "#14532d22" : "#7f1d1d22", border: `1px solid ${isLicenseValid(info) ? "#22c55e44" : "#ef444444"}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>License Info</div>
                  {[
                    ["Client", info.client],
                    ["Plan", info.plan],
                    ["Expires", info.expires || "Never"],
                    ["Days Left", daysLeft >= 9999 ? "Unlimited" : `${daysLeft} days`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: "#64748b" }}>{k}</span>
                      <span style={{ fontWeight: 600, color: k === "Days Left" && daysLeft < 7 ? "#f59e0b" : "#e2e8f0" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 12, color: isLicenseValid(info) ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                    {isLicenseValid(info) ? "✅ Valid License" : "❌ License Expired"}
                  </div>
                </div>
              )}

              {err && <div style={{ color: "#fca5a5", fontSize: 12, background: "#7f1d1d33", padding: "8px 12px", borderRadius: 6 }}>❌ {err}</div>}
              <button className="btn btn-primary" style={{ padding: 10, fontSize: 14 }} onClick={handleLicenseSave} disabled={testing || !licKey}>
                {testing ? "Verifying..." : "🔑 Activate License"}
              </button>
            </div>
          )}

          {/* MANUAL MODE */}
          {mode === "manual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#0d0f14", border: "1px solid #78350f44", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fbbf24" }}>
                ⚠️ Admin use only — enter your Supabase credentials directly.
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>Supabase URL</label>
                <input type="url" placeholder="https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>Supabase Anon Key</label>
                <input type="password" placeholder="eyJhbGci..." value={key} onChange={e => setKey(e.target.value)} />
              </div>
              {err && <div style={{ color: "#fca5a5", fontSize: 12, background: "#7f1d1d33", padding: "8px 12px", borderRadius: 6 }}>❌ {err}</div>}
              <button className="btn btn-primary" style={{ padding: 10, fontSize: 14 }} onClick={handleManualSave} disabled={testing}>
                {testing ? "Testing..." : "Connect"}
              </button>
            </div>
          )}

          {/* Clear saved config */}
          {(localStorage.getItem("ap_license_key") || localStorage.getItem("sb_url")) && (
            <button onClick={() => { clearAllConfig(); setLicKey(""); setUrl(""); setKey(""); setInfo(null); setErr(""); }} className="btn btn-secondary btn-sm" style={{ width: "100%", marginTop: 12, color: "#ef4444", borderColor: "#ef444444" }}>
              🗑 Clear Saved Config
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LOGIN PAGE
// ════════════════════════════════════════════════════════════
function LoginPage({ onLogin, onSetup, t, lang, setLang, api }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getGeoInfo = async () => {
    try { const r = await fetch("https://ipapi.co/json/"); return await r.json(); } catch { return {}; }
  };

  const handleLogin = async () => {
    if (!username || !password) { setError(t.wrongPass); return; }
    setLoading(true); setError("");
    const res = await api.get("users", `username=eq.${encodeURIComponent(username)}&password=eq.${encodeURIComponent(password)}&select=*`);
    if (Array.isArray(res) && res.length > 0) {
      const u = res[0];
      const geo = await getGeoInfo();
      await api.upsert("login_logs", {
        username: u.username, user_role: u.role,
        ip_address: geo.ip || "unknown", country: `${geo.country_name || "Unknown"} ${geo.country_flag_emoji || ""}`.trim(),
        city: geo.city || "", device: navigator.userAgent.slice(0, 120),
        status: "success",
      });
      onLogin(u);
    } else {
      setError(t.wrongPass);
      const geo = await getGeoInfo();
      await api.upsert("login_logs", { username, user_role: "unknown", ip_address: geo.ip || "unknown", country: geo.country_name || "Unknown", city: geo.city || "", device: navigator.userAgent.slice(0, 120), status: "failed" });
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Noto Sans TC,sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 400, padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 34, fontWeight: 700, color: "#e85d04" }}>⚙ AUTO<span style={{ color: "#e2e8f0" }}>PARTS</span></div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{t.appSub}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
            <button className={`lang-btn ${lang === "en" ? "act" : ""}`} onClick={() => setLang("en")}>EN</button>
            <button className={`lang-btn ${lang === "zh" ? "act" : ""}`} onClick={() => setLang("zh")}>中文</button>
          </div>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 22, textAlign: "center" }}>{t.login}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>{t.username}</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 5 }}>{t.password}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            </div>
            {error && <div style={{ color: "#fca5a5", fontSize: 12, background: "#7f1d1d33", padding: "8px 12px", borderRadius: 6 }}>❌ {error}</div>}
            <button className="btn btn-primary" style={{ width: "100%", padding: 10, fontSize: 14 }} onClick={handleLogin} disabled={loading}>{loading ? t.connecting : t.loginBtn}</button>
          </div>
          <div style={{ marginTop: 20, borderTop: "1px solid #1e2130", paddingTop: 18 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, textAlign: "center" }}>{t.testDemoAccounts}</div>
            {[{ role: "admin", u: "admin", p: "admin123" }, { role: "shipper", u: "shipper", p: "ship123" }, { role: "customer", u: "customer1", p: "cust123" }].map(a => (
              <button key={a.role} className="btn btn-secondary btn-sm" style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: 5 }} onClick={() => { setUsername(a.u); setPassword(a.p); }}>
                <span>{ROLES_DEF[a.role].icon} {t[a.role]}</span>
                <span style={{ fontFamily: "monospace", color: "#64748b" }}>{a.u} / {a.p}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ width: "100%", marginTop: 10, color: "#64748b" }} onClick={onSetup}>⚙ {t.setup}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// SUBSCRIPTION HELPERS
// ════════════════════════════════════════════════════════════
const TRIAL_DAYS = 30;

function getSubscriptionInfo(user) {
  if (!user) return { status: "none" };
  const status = user.subscription_status || "trial";
  if (status === "active") return { status: "active", label: "✅ Active", color: "#22c55e" };
  if (status === "blocked") return { status: "blocked", label: "🚫 Blocked", color: "#ef4444" };
  if (status === "expired") return { status: "expired", label: "⏰ Expired", color: "#ef4444" };
  // trial
  const start = user.trial_start ? new Date(user.trial_start) : new Date();
  const daysUsed = Math.floor((Date.now() - start.getTime()) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
  if (daysLeft <= 0) return { status: "expired", label: "⏰ Trial Expired", color: "#ef4444", daysLeft: 0 };
  return { status: "trial", label: `🕐 Trial: ${daysLeft}d left`, color: daysLeft <= 5 ? "#f59e0b" : "#3b82f6", daysLeft };
}

function isAccessAllowed(user) {
  if (!user) return false;
  if (user.role === "admin") return true; // admin always access
  const info = getSubscriptionInfo(user);
  return info.status === "active" || info.status === "trial";
}

// ════════════════════════════════════════════════════════════
// PAYWALL PAGE
// ════════════════════════════════════════════════════════════
function PaywallPage({ user, onLogout, t, lang }) {
  const info = getSubscriptionInfo(user);
  return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Noto Sans TC,sans-serif", padding: 20 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 32, fontWeight: 700, color: "#e85d04", marginBottom: 8 }}>⚙ AUTO<span style={{ color: "#e2e8f0" }}>PARTS</span></div>
        <div style={{ background: "#141720", border: "1px solid #2d3347", borderRadius: 14, padding: 36, marginTop: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#e2e8f0" }}>
            {info.status === "expired" ? (lang === "zh" ? "試用期已結束" : "Trial Expired") : (lang === "zh" ? "帳號已停用" : "Account Suspended")}
          </h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
            {lang === "zh"
              ? "您的免費試用已結束。請聯絡管理員升級為付費方案以繼續使用所有功能。"
              : "Your free trial has ended. Please contact the administrator to upgrade to a paid plan and continue using all features."}
          </p>

          {/* Plans */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[
              { plan: lang === "zh" ? "月費方案" : "Monthly", price: "NT$299", period: lang === "zh" ? "每月" : "/month", color: "#3b82f6" },
              { plan: lang === "zh" ? "年費方案" : "Yearly", price: "NT$2,499", period: lang === "zh" ? "每年（省17%）" : "/year (save 17%)", color: "#e85d04" },
            ].map(p => (
              <div key={p.plan} style={{ background: "#0d0f14", border: `1px solid ${p.color}44`, borderRadius: 10, padding: "16px 14px" }}>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>{p.plan}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: p.color, fontFamily: "Rajdhani,sans-serif" }}>{p.price}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{p.period}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#94a3b8" }}>
            📧 {lang === "zh" ? "聯絡管理員升級：" : "Contact admin to upgrade:"}<br />
            <span style={{ color: "#e85d04" }}>admin@autoparts.com</span>
          </div>

          <button onClick={onLogout} style={{ background: "#1e2130", color: "#94a3b8", border: "1px solid #2d3347", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
            {lang === "zh" ? "登出" : "Sign Out"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "en");
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);
  const [cfg, setCfg] = useState({ url: "", key: "" });
  const t = T[lang];

  const changeLang = (l) => { setLang(l); localStorage.setItem("lang", l); };

  // Load config on mount (tries encrypted file first)
  useEffect(() => {
    loadConfig().then(c => {
      setCfg(c);
      if (c.url && c.key) setScreen("login");
      else setScreen("setup");
    });
  }, []);

  const api = makeApi(cfg);

  const handleSetupDone = () => {
    loadConfig().then(c => { setCfg(c); setScreen("login"); });
  };

  if (screen === "loading") return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#e85d04", fontSize: 15 }}>⚙️ Loading...</div>
    </div>
  );
  if (screen === "setup") return <SetupPage onDone={handleSetupDone} lang={lang} t={t} />;
  if (!user) return <LoginPage onLogin={setUser} onSetup={() => setScreen("setup")} t={t} lang={lang} setLang={changeLang} api={api} />;
  if (!isAccessAllowed(user)) return <PaywallPage user={user} onLogout={() => setUser(null)} t={t} lang={lang} />;
  return <MainApp user={user} onLogout={() => setUser(null)} onSetup={() => setScreen("setup")} t={t} lang={lang} setLang={changeLang} api={api} />;
}

// ════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════
function MainApp({ user, onLogout, onSetup, t, lang, setLang, api }) {
  const role = user.role;
  const defaultTab = role === "customer" ? "shop" : role === "shipper" ? "orders" : "dashboard";
  const [tab, setTab] = useState(defaultTab);

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
  const [logFilter, setLogFilter] = useState("All");
  const [logSearch, setLogSearch] = useState("");

  const [showPartModal, setShowPartModal] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustPart, setAdjustPart] = useState(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [inquiryPart, setInquiryPart] = useState(null);
  const [showInquiryDetail, setShowInquiryDetail] = useState(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showPartSupplierModal, setShowPartSupplierModal] = useState(false);
  const [partForSupplier, setPartForSupplier] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: user.name || "", phone: user.phone || "", address: "" });
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

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
      api.get("inventory_logs", "select=*&order=created_at.desc&limit=300"),
      api.get("login_logs", "select=*&order=created_at.desc&limit=300"),
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

  // ── CART ──────────────────────────────────────────────────
  const addToCart = (part) => { setCart(prev => { const ex = prev.find(i => i.id === part.id); if (ex) return prev.map(i => i.id === part.id ? { ...i, qty: i.qty + 1 } : i); return [...prev, { ...part, qty: 1 }]; }); showToast(`${part.name} added to cart`); };
  const removeFromCart = (id) => setCart(p => p.filter(i => i.id !== id));
  const updateCartQty = (id, qty) => { if (qty < 1) return; setCart(p => p.map(i => i.id === id ? { ...i, qty } : i)); };
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── ORDER ─────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!checkoutForm.name || !checkoutForm.phone) { showToast("Please fill name and phone", "error"); return; }
    const orderId = `ORD-${Date.now()}`;
    await api.upsert("orders", { id: orderId, customer_name: checkoutForm.name, customer_phone: checkoutForm.phone, date: new Date().toISOString().slice(0, 10), status: "處理中", items: cart.map(i => ({ partId: i.id, qty: i.qty, name: i.name, price: i.price })), total: cartTotal });
    for (const ci of cart) {
      const part = parts.find(p => p.id === ci.id);
      if (part) { const ns = Math.max(0, part.stock - ci.qty); await api.patch("parts", "id", ci.id, { stock: ns }); await logInv(part, part.stock, ns, lang === "en" ? "Order Deduct" : "訂單扣除", orderId); }
    }
    const ex = customers.find(c => c.phone === checkoutForm.phone);
    if (ex) await api.patch("customers", "phone", checkoutForm.phone, { orders: ex.orders + 1, total_spent: ex.total_spent + cartTotal });
    else await api.upsert("customers", { name: checkoutForm.name, phone: checkoutForm.phone, address: checkoutForm.address || "", email: "", orders: 1, total_spent: cartTotal });
    await loadAll(); setCart([]); setShowCheckout(false);
    showToast(`Order ${orderId} placed!`); setTab(role === "customer" ? "myorders" : "orders");
  };

  const updateOrderStatus = async (id, ns) => {
    const o = orders.find(o => o.id === id); if (!o) return;
    const wasC = o.status === "已取消", nowC = ns === "已取消";
    if (!wasC && nowC && Array.isArray(o.items)) {
      for (const item of o.items) { const p = parts.find(p => p.id === item.partId); if (p) { const nst = p.stock + item.qty; await api.patch("parts", "id", item.partId, { stock: nst }); await logInv(p, p.stock, nst, lang === "en" ? "Cancel Restore" : "取消補回", id); } }
      showToast("Order cancelled — stock restored", "error");
    } else if (wasC && !nowC && Array.isArray(o.items)) {
      for (const item of o.items) { const p = parts.find(p => p.id === item.partId); if (p) { const nst = Math.max(0, p.stock - item.qty); await api.patch("parts", "id", item.partId, { stock: nst }); await logInv(p, p.stock, nst, lang === "en" ? "Order Restore" : "訂單恢復扣除", id); } }
      showToast("Order restored — stock deducted");
    } else showToast("Order status updated");
    await api.patch("orders", "id", id, { status: ns }); await loadAll();
  };

  // ── PARTS ─────────────────────────────────────────────────
  const savePart = async (data) => {
    if (editPart) {
      await api.patch("parts", "id", editPart.id, data);
      if (editPart.stock !== data.stock) await logInv({ ...editPart, ...data }, editPart.stock, data.stock, lang === "en" ? "Edit Part" : "編輯零件", "Admin edit");
      showToast("Part updated");
    } else {
      const res = await api.upsert("parts", { ...data, image: "🔩" });
      const np = Array.isArray(res) ? res[0] : data;
      await logInv(np, 0, data.stock, lang === "en" ? "New Part" : "新增零件", "New part added");
      showToast("Part added");
    }
    await loadAll(); setShowPartModal(false); setEditPart(null);
  };
  const deletePart = async (id) => { const p = parts.find(p => p.id === id); if (p) await logInv(p, p.stock, 0, lang === "en" ? "Delete Part" : "刪除零件", "Part deleted"); await api.delete("parts", "id", id); await loadAll(); showToast("Part deleted", "error"); };
  const applyAdjust = async (part, nq, reason) => { await api.patch("parts", "id", part.id, { stock: nq }); await logInv(part, part.stock, nq, lang === "en" ? "Manual Adj." : "手動調整", reason || "Manual adjustment"); await loadAll(); setShowAdjust(false); setAdjustPart(null); showToast(`Stock adjusted to ${nq}`); };

  // ── SUPPLIERS ─────────────────────────────────────────────
  const saveSupplier = async (data) => {
    if (editSupplier) { await api.patch("suppliers", "id", editSupplier.id, data); showToast("Supplier updated"); }
    else { await api.upsert("suppliers", data); showToast("Supplier added"); }
    await loadAll(); setShowSupplierModal(false); setEditSupplier(null);
  };
  const deleteSupplier = async (id) => { await api.delete("suppliers", "id", id); await loadAll(); showToast("Supplier deleted", "error"); };
  const savePartSupplier = async (data) => { await api.upsert("part_suppliers", data); await loadAll(); showToast("Supplier linked"); setShowPartSupplierModal(false); };
  const deletePartSupplier = async (id) => { await api.delete("part_suppliers", "id", id); await loadAll(); showToast("Link removed", "error"); };

  // ── INQUIRIES ─────────────────────────────────────────────
  const sendInquiry = async (data) => {
    await api.upsert("inquiries", { id: `INQ-${Date.now()}`, ...data, created_by: user.name || user.username, status: "pending" });
    await loadAll(); setShowInquiryModal(false); showToast("Inquiry sent!");
  };
  const updateInquiry = async (id, data) => { await api.patch("inquiries", "id", id, data); await loadAll(); showToast("Inquiry updated"); };

  // ── CUSTOMERS / USERS ──────────────────────────────────────
  const saveCustomer = async (data) => { if (editCustomer) { await api.patch("customers", "id", editCustomer.id, data); showToast("Customer updated"); } else { await api.upsert("customers", { ...data, orders: 0, total_spent: 0 }); showToast("Customer added"); } await loadAll(); setShowCustomerModal(false); setEditCustomer(null); };
  const deleteCustomer = async (id) => { await api.delete("customers", "id", id); await loadAll(); showToast("Customer deleted", "error"); };
  const saveUser = async (data) => { if (editUser) { await api.patch("users", "id", editUser.id, data); showToast("User updated"); } else { await api.upsert("users", data); showToast("User added"); } await loadAll(); setShowUserModal(false); setEditUser(null); };
  const deleteUser = async (id) => { if (id === user.id) { showToast("Cannot delete yourself", "error"); return; } await api.delete("users", "id", id); await loadAll(); showToast("User deleted", "error"); };

  // ── DERIVED ───────────────────────────────────────────────
  const CATS = lang === "en" ? CATS_EN : CATS_ZH;
  const allCat = CATS[0];
  const fp = parts.filter(p => (filterCat === allCat || p.category === filterCat) && (p.name?.toLowerCase().includes(searchPart.toLowerCase()) || p.sku?.toLowerCase().includes(searchPart.toLowerCase()) || p.brand?.toLowerCase().includes(searchPart.toLowerCase())));
  const allStatus = lang === "en" ? "All" : "全部";
  const fo = orders.filter(o => filterOS === allStatus || o.status === filterOS);
  const myO = orders.filter(o => o.customer_phone === user.phone || o.customer_name === user.name);
  const fc = customers.filter(c => c.name?.includes(searchCust) || c.phone?.includes(searchCust) || c.email?.includes(searchCust));
  const fl = logs.filter(l => (logFilter === "All" || l.action === logFilter) && (l.part_name?.toLowerCase().includes(logSearch.toLowerCase()) || l.changed_by?.includes(logSearch) || l.reason?.includes(logSearch)));
  const lowStock = parts.filter(p => p.stock <= p.min_stock);
  const totalRevenue = orders.filter(o => o.status === "已完成").reduce((s, o) => s + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => o.status === "處理中" || o.status === "待出貨").length;
  const getCO = (ph) => orders.filter(o => o.customer_phone === ph);
  const getPartSuppliers = (pid) => partSuppliers.filter(ps => ps.part_id === pid).map(ps => ({ ...ps, supplier: suppliers.find(s => s.id === ps.supplier_id) }));
  const OS = lang === "en" ? ["All", "處理中", "待出貨", "已完成", "已取消"] : ["全部", "處理中", "待出貨", "已完成", "已取消"];
  const pendingInquiries = inquiries.filter(i => i.status === "pending").length;

  const navItems = [
    { id: "dashboard", icon: "📊", label: t.dashboard, roles: ["admin"] },
    { id: "inventory", icon: "📦", label: t.inventory, roles: ["admin", "shipper"] },
    { id: "logs", icon: "📝", label: t.logs, roles: ["admin"] },
    { id: "shop", icon: "🛒", label: t.shop, roles: ["admin", "customer"] },
    { id: "orders", icon: "📋", label: t.orders, roles: ["admin", "shipper"], badge: pendingOrders },
    { id: "myorders", icon: "📦", label: t.myOrders, roles: ["customer"] },
    { id: "suppliers", icon: "🏭", label: t.suppliers, roles: ["admin"] },
    { id: "inquiries", icon: "📩", label: t.inquiries, roles: ["admin"], badge: pendingInquiries },
    { id: "customers", icon: "👥", label: t.customers, roles: ["admin"] },
    { id: "users", icon: "🔑", label: t.users, roles: ["admin"] },
    { id: "loginlogs", icon: "🌍", label: t.loginLogs, roles: ["admin"] },
  ].filter(n => n.roles.includes(role));

  if (loading) return <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><style>{CSS}</style><div style={{ textAlign: "center" }}><div style={{ fontSize: 44 }}>⚙️</div><div style={{ color: "#e85d04", marginTop: 14, fontSize: 15 }}>{t.connecting}</div></div></div>;

  const sideStyle = (id) => ({ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: tab === id ? "#1a1d26" : "none", border: "none", borderRadius: 8, color: tab === id ? "#e85d04" : "#64748b", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: tab === id ? 600 : 400, marginBottom: 2, textAlign: "left", transition: "all .2s", borderLeft: tab === id ? "3px solid #e85d04" : "3px solid transparent" });

  return (
    <div style={{ fontFamily: "Noto Sans TC,sans-serif", background: "#0d0f14", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", height: "100vh" }}>

        {/* SIDEBAR */}
        <aside style={{ width: 226, background: "#0a0c10", borderRight: "1px solid #1e2130", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 50 }}>
          <div style={{ padding: "18px 16px 10px" }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 20, fontWeight: 700, color: "#e85d04" }}>⚙ AUTO<span style={{ color: "#e2e8f0" }}>PARTS</span></div>
            <div style={{ fontSize: 10, color: "#22c55e", marginTop: 2 }}>🟢 Supabase Connected</div>
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <button className={`lang-btn ${lang === "en" ? "act" : ""}`} onClick={() => setLang("en")}>EN</button>
              <button className={`lang-btn ${lang === "zh" ? "act" : ""}`} onClick={() => setLang("zh")}>中文</button>
            </div>
          </div>
          <div style={{ margin: "0 10px 8px", background: "#141720", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2130" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: ROLES_DEF[role]?.bg, border: `1px solid ${ROLES_DEF[role]?.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{ROLES_DEF[role]?.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name || user.username}</div>
                <span className="badge" style={{ background: ROLES_DEF[role]?.bg, color: ROLES_DEF[role]?.color, fontSize: 10 }}>{t[role]}</span>
              </div>
            </div>
            {role !== "admin" && (() => { const sub = getSubscriptionInfo(user); return (
              <div style={{ marginTop: 8, padding: "5px 8px", background: sub.color + "18", borderRadius: 6, fontSize: 11, color: sub.color, fontWeight: 500, textAlign: "center" }}>
                {sub.label}
                {sub.status === "trial" && sub.daysLeft <= 7 && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2 }}>Upgrade soon to avoid disruption</div>}
              </div>
            ); })()}
          </div>
          <nav style={{ padding: "0 10px", flex: 1, overflowY: "auto" }}>
            {navItems.map(t2 => (
              <button key={t2.id} onClick={() => setTab(t2.id)} style={sideStyle(t2.id)}>
                <span style={{ fontSize: 15 }}>{t2.icon}</span> <span style={{ fontSize: 12 }}>{t2.label}</span>
                {t2.badge > 0 && <span style={{ marginLeft: "auto", background: "#e85d04", color: "#fff", borderRadius: "50%", width: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{t2.badge}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: 10, borderTop: "1px solid #1e2130", display: "flex", flexDirection: "column", gap: 5 }}>
            {(role === "admin" || role === "customer") && (
              <button onClick={() => setShowCheckout(true)} style={{ background: "#e85d04", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer", width: "100%", fontFamily: "inherit", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🛒 {t.cart} {cartCount > 0 && <span style={{ background: "#fff", color: "#e85d04", borderRadius: "50%", width: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{cartCount}</span>}
              </button>
            )}
            <button onClick={onSetup} className="btn btn-secondary btn-sm" style={{ width: "100%", fontSize: 11 }}>⚙ {t.setup}</button>
            <button onClick={onLogout} className="btn btn-secondary btn-sm" style={{ width: "100%", fontSize: 11 }}>🚪 {t.logout}</button>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ marginLeft: 226, flex: 1, overflow: "auto", padding: "24px 28px" }} className="fu">

          {/* ══ DASHBOARD ══ */}
          {tab === "dashboard" && role === "admin" && <>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{t.dashboard}</h1>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 22 }}>System overview</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
              {[
                { label: t.part_types, value: parts.length, icon: "🔩", color: "#3b82f6" },
                { label: t.pending_orders, value: pendingOrders, icon: "⏳", color: "#f59e0b" },
                { label: t.revenue, value: `NT$${totalRevenue.toLocaleString()}`, icon: "💰", color: "#22c55e" },
                { label: t.low_stock, value: lowStock.length, icon: "⚠️", color: "#ef4444" },
              ].map((s, i) => (
                <div key={i} className="card" style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{s.label}</div><div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "Rajdhani,sans-serif" }}>{s.value}</div></div>
                    <div style={{ fontSize: 26 }}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><h3 style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Latest Orders</h3><button className="btn btn-secondary btn-sm" onClick={() => setTab("orders")}>View All</button></div>
                {orders.slice(0, 5).map(o => <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e2130" }}><div><div style={{ fontSize: 13, fontWeight: 500 }}>{o.customer_name}</div><div style={{ fontSize: 11, color: "#64748b" }}>{o.date}</div></div><div style={{ textAlign: "right" }}><span className="badge" style={{ background: `${SC[o.status] || "#64748b"}22`, color: SC[o.status] || "#64748b" }}>{o.status}</span><div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>NT${(o.total || 0).toLocaleString()}</div></div></div>)}
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><h3 style={{ fontSize: 13, fontWeight: 600, color: "#ef4444" }}>⚠️ Low Stock</h3><button className="btn btn-secondary btn-sm" onClick={() => setTab("inventory")}>Manage</button></div>
                {lowStock.length === 0 ? <p style={{ color: "#64748b", fontSize: 13 }}>✅ All stock OK</p> : lowStock.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e2130" }}><div style={{ fontSize: 13 }}>{p.name}</div><span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>{p.stock} left</span></div>)}
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><h3 style={{ fontSize: 13, fontWeight: 600, color: "#8b5cf6" }}>📩 Pending Inquiries</h3><button className="btn btn-secondary btn-sm" onClick={() => setTab("inquiries")}>View All</button></div>
                {inquiries.filter(i => i.status === "pending").slice(0, 5).map(i => <div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid #1e2130" }}><div style={{ fontSize: 13, fontWeight: 500 }}>{i.part_name}</div><div style={{ fontSize: 11, color: "#64748b" }}>{i.supplier_name} · Qty: {i.qty_requested}</div></div>)}
                {inquiries.filter(i => i.status === "pending").length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>No pending inquiries</p>}
              </div>
            </div>
          </>}

          {/* ══ INVENTORY ══ */}
          {tab === "inventory" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.inventory}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{parts.length} parts · {lowStock.length} low stock</p></div>
              {role === "admin" && <button className="btn btn-primary" onClick={() => { setEditPart(null); setShowPartModal(true); }}>{t.addPart}</button>}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input type="text" placeholder={t.search} value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ width: 260 }} />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 140 }}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{[t.sku, t.name, t.category, t.brand, t.price, t.stock, t.status, ...(role === "admin" ? ["Actions"] : [])].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fp.map(p => {
                    const imgUrl = toImgUrl(p.image_url);
                    const pSupps = getPartSuppliers(p.id);
                    return (
                      <tr key={p.id}>
                        <td style={{ padding: "11px 14px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{p.sku}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {imgUrl ? <img src={imgUrl} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #1e2130" }} onError={e => { e.target.style.display = "none"; }} /> : <span style={{ fontSize: 22 }}>{p.image || "🔩"}</span>}
                            <div><div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>{pSupps.length > 0 && <div style={{ fontSize: 10, color: "#64748b" }}>🏭 {pSupps.length} supplier{pSupps.length > 1 ? "s" : ""}</div>}</div>
                          </div>
                        </td>
                        <td style={{ padding: "11px 14px" }}><span className="badge" style={{ background: "#1e2130", color: "#94a3b8" }}>{p.category}</span></td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#94a3b8" }}>{p.brand}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600 }}>NT${(p.price || 0).toLocaleString()}</td>
                        <td style={{ padding: "11px 14px" }}><span style={{ fontSize: 13, fontWeight: 600, color: p.stock <= p.min_stock ? "#ef4444" : "#22c55e" }}>{p.stock}</span></td>
                        <td style={{ padding: "11px 14px" }}>{p.stock === 0 ? <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>{t.outOfStock}</span> : p.stock <= p.min_stock ? <span className="badge" style={{ background: "#78350f", color: "#fbbf24" }}>{t.low}</span> : <span className="badge" style={{ background: "#14532d", color: "#4ade80" }}>{t.normal}</span>}</td>
                        {role === "admin" && (
                          <td style={{ padding: "11px 14px" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              <button className="btn btn-secondary btn-sm" style={{ color: "#f59e0b", borderColor: "#f59e0b44", fontSize: 11 }} onClick={() => { setAdjustPart(p); setShowAdjust(true); }}>{t.adjustStock}</button>
                              <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => { setEditPart(p); setShowPartModal(true); }}>{t.edit}</button>
                              <button className="btn btn-secondary btn-sm" style={{ color: "#8b5cf6", borderColor: "#8b5cf644", fontSize: 11 }} onClick={() => { setPartForSupplier(p); setShowPartSupplierModal(true); }}>🏭</button>
                              <button className="btn btn-info btn-sm" style={{ fontSize: 11 }} onClick={() => { setInquiryPart(p); setShowInquiryModal(true); }}>📩 RFQ</button>
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => deletePart(p.id)}>{t.delete}</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {fp.length === 0 && <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>{t.no_data}</div>}
            </div>
          </>}

          {/* ══ ADJ LOGS ══ */}
          {tab === "logs" && role === "admin" && <>
            <div style={{ marginBottom: 20 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>📝 {t.logs}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{logs.length} records</p></div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <input type="text" placeholder={t.search} value={logSearch} onChange={e => setLogSearch(e.target.value)} style={{ width: 240 }} />
              <div style={{ display: "flex", gap: 4, background: "#0d0f14", padding: "6px 8px", borderRadius: 8, border: "1px solid #1e2130", flexWrap: "wrap" }}>
                {["All", ...Object.keys(LOG_COLORS)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).map(a => <button key={a} className={`tf ${logFilter === a ? "act" : ""}`} onClick={() => setLogFilter(a)} style={{ fontSize: 11 }}>{a}</button>)}
              </div>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{["Time", t.name, t.action, t.before, t.after, t.change, t.operator, t.reason].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {fl.map(l => { const diff = l.qty_after - l.qty_before; return (
                    <tr key={l.id}>
                      <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px" }}><div style={{ fontSize: 13, fontWeight: 500 }}>{l.part_name}</div><div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{l.part_sku}</div></td>
                      <td style={{ padding: "10px 14px" }}><span className="badge" style={{ background: (LOG_COLORS[l.action] || "#64748b") + "22", color: LOG_COLORS[l.action] || "#64748b" }}>{l.action}</span></td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>{l.qty_before}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, textAlign: "center" }}>{l.qty_after}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: diff > 0 ? "#22c55e" : diff < 0 ? "#ef4444" : "#64748b" }}>{diff > 0 ? `+${diff}` : diff}</span></td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>{l.changed_by}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{l.reason || "—"}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              {fl.length === 0 && <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>{t.no_data}</div>}
            </div>
          </>}

          {/* ══ SHOP ══ */}
          {tab === "shop" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.shop}</h1><p style={{ color: "#64748b", fontSize: 13 }}>Browse and order parts</p></div>
              <button className="btn btn-primary" onClick={() => setShowCheckout(true)}>🛒 {t.checkout} {cartCount > 0 && `(${cartCount})`} {cartTotal > 0 && `· NT$${cartTotal.toLocaleString()}`}</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <input type="text" placeholder={t.search} value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ width: 240 }} />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 140 }}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {fp.map(p => {
                const inCart = cart.find(i => i.id === p.id);
                const imgUrl = toImgUrl(p.image_url);
                return (
                  <div key={p.id} className="card" style={{ padding: 16, borderColor: inCart ? "#e85d04" : "#1e2130" }}>
                    {imgUrl ? <img src={imgUrl} alt={p.name} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} onError={e => { e.target.style.display = "none"; }} /> : <div style={{ fontSize: 34, textAlign: "center", marginBottom: 10 }}>{p.image || "🔩"}</div>}
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{p.sku} · {p.brand}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{p.name}</div>
                    <span className="badge" style={{ background: "#1e2130", color: "#94a3b8", marginBottom: 8, display: "block", width: "fit-content" }}>{p.category}</span>
                    <div style={{ fontSize: 19, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif", marginBottom: 3 }}>NT${(p.price || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: p.stock > 0 ? "#22c55e" : "#ef4444", marginBottom: 10 }}>{p.stock > 0 ? `${p.stock} in stock` : t.outOfStock}</div>
                    {inCart ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(p.id, inCart.qty - 1)}>−</button><span style={{ flex: 1, textAlign: "center", fontWeight: 600 }}>{inCart.qty}</span><button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(p.id, inCart.qty + 1)}>+</button><button className="btn btn-danger btn-sm" onClick={() => removeFromCart(p.id)}>✕</button></div>
                      : <button className="btn btn-primary" style={{ width: "100%" }} disabled={p.stock === 0} onClick={() => addToCart(p)}>{t.addToCart}</button>}
                  </div>
                );
              })}
            </div>
          </>}

          {/* ══ ORDERS ══ */}
          {tab === "orders" && <>
            <div style={{ marginBottom: 18 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.orders}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{orders.length} orders</p></div>
            <div style={{ display: "flex", gap: 5, marginBottom: 16, background: "#0d0f14", padding: "7px 9px", borderRadius: 8, border: "1px solid #1e2130", width: "fit-content", flexWrap: "wrap" }}>
              {OS.map(s => { const cnt = s === allStatus ? orders.length : orders.filter(o => o.status === s).length; return <button key={s} className={`tf ${filterOS === s ? "act" : ""}`} onClick={() => setFilterOS(s)} style={{ fontSize: 11 }}>{s} <span style={{ opacity: .7 }}>{cnt}</span></button>; })}
            </div>
            <OrderTable orders={fo} canEdit={role !== "customer"} onStatusChange={updateOrderStatus} SC={SC} />
          </>}

          {/* ══ MY ORDERS ══ */}
          {tab === "myorders" && role === "customer" && <>
            <div style={{ marginBottom: 18 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.myOrders}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{myO.length} orders</p></div>
            {myO.length === 0 ? <div className="card" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No orders yet — go to shop!</div> : <OrderTable orders={myO} canEdit={false} onStatusChange={updateOrderStatus} SC={SC} />}
          </>}

          {/* ══ SUPPLIERS ══ */}
          {tab === "suppliers" && role === "admin" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>🏭 {t.suppliers}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{suppliers.length} suppliers</p></div>
              <button className="btn btn-primary" onClick={() => { setEditSupplier(null); setShowSupplierModal(true); }}>{t.addSupplier}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
              {suppliers.map(s => {
                const linkedParts = partSuppliers.filter(ps => ps.supplier_id === s.id);
                return (
                  <div key={s.id} className="card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div><div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 12, color: "#64748b" }}>{s.country}</div></div>
                      <span className="badge" style={{ background: "#1e3a5f", color: "#60a5fa" }}>{linkedParts.length} parts</span>
                    </div>
                    {s.contact_person && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>👤 {s.contact_person}</div>}
                    {s.email && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>✉ {s.email}</div>}
                    {s.phone && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>📞 {s.phone}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setEditSupplier(s); setShowSupplierModal(true); }}>{t.edit}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteSupplier(s.id)}>{t.delete}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>}

          {/* ══ INQUIRIES ══ */}
          {tab === "inquiries" && role === "admin" && <>
            <div style={{ marginBottom: 20 }}><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>📩 {t.inquiries}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{inquiries.length} inquiries · {pendingInquiries} pending</p></div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{["ID", "Part", "Supplier", "Qty", t.status, "Reply Price", "Reply Stock", "Date", "Actions"].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {inquiries.map(inq => {
                    const sColor = inq.status === "pending" ? "#f59e0b" : inq.status === "replied" ? "#22c55e" : "#64748b";
                    return (
                      <tr key={inq.id}>
                        <td style={{ padding: "11px 14px", fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{inq.id}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500 }}>{inq.part_name}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#94a3b8" }}>{inq.supplier_name}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, textAlign: "center" }}>{inq.qty_requested}</td>
                        <td style={{ padding: "11px 14px" }}><span className="badge" style={{ background: sColor + "22", color: sColor }}>{inq.status}</span></td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: inq.reply_price ? "#22c55e" : "#475569" }}>{inq.reply_price ? `NT$${inq.reply_price.toLocaleString()}` : "—"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: inq.reply_stock ? "#22c55e" : "#475569" }}>{inq.reply_stock ?? "—"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{inq.created_at?.slice(0, 10)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setShowInquiryDetail(inq)}>View</button>
                            {inq.status === "pending" && <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, color: "#22c55e" }} onClick={() => updateInquiry(inq.id, { status: "replied" })}>Mark Replied</button>}
                            {inq.status !== "closed" && <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => updateInquiry(inq.id, { status: "closed" })}>Close</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {inquiries.length === 0 && <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>No inquiries yet</div>}
            </div>
          </>}

          {/* ══ CUSTOMERS ══ */}
          {tab === "customers" && role === "admin" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.customers}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{customers.length} customers</p></div>
              <button className="btn btn-primary" onClick={() => { setEditCustomer(null); setShowCustomerModal(true); }}>+ Add Customer</button>
            </div>
            <div style={{ marginBottom: 16 }}><input type="text" placeholder={t.search} value={searchCust} onChange={e => setSearchCust(e.target.value)} style={{ width: 280 }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
              {fc.map(c => (
                <div key={c.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e85d04", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{c.name?.[0]}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 12, color: "#64748b" }}>{c.phone}</div></div>
                  </div>
                  {c.email && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 3 }}>✉ {c.email}</div>}
                  {c.address && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>📍 {c.address}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1e2130", paddingTop: 10, marginBottom: 12 }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6", fontFamily: "Rajdhani,sans-serif" }}>{c.orders}</div><div style={{ fontSize: 11, color: "#64748b" }}>{t.orders_count}</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif" }}>NT${(c.total_spent || 0).toLocaleString()}</div><div style={{ fontSize: 11, color: "#64748b" }}>{t.totalSpent}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setCustomerHistory(c)}>📋 {t.orderHistory}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditCustomer(c); setShowCustomerModal(true); }}>{t.edit}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteCustomer(c.id)}>{t.delete}</button>
                  </div>
                </div>
              ))}
            </div>
          </>}

          {/* ══ USERS ══ */}
          {tab === "users" && role === "admin" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{t.users}</h1><p style={{ color: "#64748b", fontSize: 13 }}>{users.length} users</p></div>
              <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowUserModal(true); }}>+ Add User</button>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{[t.username, t.name, t.role, "Subscription", "Trial Start", t.phone, "Actions"].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {users.map(u => {
                    const sub = getSubscriptionInfo(u);
                    return (
                    <tr key={u.id}>
                      <td style={{ padding: "11px 14px", fontSize: 13, fontFamily: "monospace", color: "#94a3b8" }}>{u.username}</td>
                      <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500 }}>{u.name || "—"}</td>
                      <td style={{ padding: "11px 14px" }}><span className="badge" style={{ background: ROLES_DEF[u.role]?.bg || "#1e2130", color: ROLES_DEF[u.role]?.color || "#94a3b8" }}>{ROLES_DEF[u.role]?.icon} {t[u.role] || u.role}</span></td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 4", flexWrap: "wrap" }}>
                          <span className="badge" style={{ background: sub.color + "22", color: sub.color }}>{sub.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                          {["trial","active","expired","blocked"].map(s => (
                            <button key={s} className="btn btn-secondary btn-sm" style={{ fontSize: 10, padding: "2px 8px", borderColor: u.subscription_status === s ? sub.color : "#2d3347", color: u.subscription_status === s ? sub.color : "#64748b" }}
                              onClick={() => saveUser({ ...u, subscription_status: s })}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{u.trial_start ? new Date(u.trial_start).toLocaleDateString() : "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#94a3b8" }}>{u.phone || "—"}</td>
                      <td style={{ padding: "11px 14px" }}><div style={{ display: "flex", gap: 5 }}><button className="btn btn-secondary btn-sm" onClick={() => { setEditUser(u); setShowUserModal(true); }}>{t.edit}</button><button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)} disabled={u.id === user.id}>{t.delete}</button></div></td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </>}

          {/* ══ LOGIN LOGS ══ */}
          {tab === "loginlogs" && role === "admin" && <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>🌍 {t.loginLogs}</h1>
              <p style={{ color: "#64748b", fontSize: 13 }}>{loginLogs.length} login events</p>
            </div>
            {/* Summary by country */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>Top Countries</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(loginLogs.reduce((acc, l) => { const c = l.country || "Unknown"; acc[c] = (acc[c] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => (
                  <span key={c} className="badge" style={{ background: "#1e2130", color: "#94a3b8", padding: "5px 12px", fontSize: 12 }}>{c} · {n}</span>
                ))}
              </div>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{[t.loginTime, t.username, t.role, t.country, "City", t.ipAddress, t.status].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {loginLogs.map(l => (
                    <tr key={l.id}>
                      <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{l.username}</td>
                      <td style={{ padding: "10px 14px" }}>{l.user_role && <span className="badge" style={{ background: ROLES_DEF[l.user_role]?.bg || "#1e2130", color: ROLES_DEF[l.user_role]?.color || "#94a3b8", fontSize: 10 }}>{ROLES_DEF[l.user_role]?.icon} {l.user_role}</span>}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>{l.country || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>{l.city || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{l.ip_address || "—"}</td>
                      <td style={{ padding: "10px 14px" }}><span className="badge" style={{ background: l.status === "success" ? "#14532d" : "#7f1d1d", color: l.status === "success" ? "#4ade80" : "#fca5a5" }}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loginLogs.length === 0 && <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>No login records</div>}
            </div>
          </>}
        </main>
      </div>

      {/* ══ MODALS ══ */}
      {showPartModal && <PartModal part={editPart} onSave={savePart} onClose={() => { setShowPartModal(false); setEditPart(null); }} t={t} />}
      {showAdjust && adjustPart && <AdjustModal part={adjustPart} onApply={applyAdjust} onClose={() => { setShowAdjust(false); setAdjustPart(null); }} t={t} />}
      {showSupplierModal && <SupplierModal supplier={editSupplier} onSave={saveSupplier} onClose={() => { setShowSupplierModal(false); setEditSupplier(null); }} t={t} />}
      {showPartSupplierModal && partForSupplier && <PartSupplierModal part={partForSupplier} partSuppliers={getPartSuppliers(partForSupplier.id)} suppliers={suppliers} onSave={savePartSupplier} onDelete={deletePartSupplier} onClose={() => { setShowPartSupplierModal(false); setPartForSupplier(null); }} t={t} />}
      {showInquiryModal && inquiryPart && <InquiryModal part={inquiryPart} suppliers={suppliers} partSuppliers={getPartSuppliers(inquiryPart.id)} onSend={sendInquiry} onClose={() => { setShowInquiryModal(false); setInquiryPart(null); }} t={t} />}
      {showInquiryDetail && <InquiryDetailModal inquiry={showInquiryDetail} onUpdate={updateInquiry} onClose={() => setShowInquiryDetail(null)} t={t} />}
      {showCustomerModal && <CustomerModal customer={editCustomer} onSave={saveCustomer} onClose={() => { setShowCustomerModal(false); setEditCustomer(null); }} t={t} />}
      {showUserModal && <UserModal user={editUser} onSave={saveUser} onClose={() => { setShowUserModal(false); setEditUser(null); }} t={t} />}

      {/* CUSTOMER HISTORY */}
      {customerHistory && (
        <div className="mo" onClick={() => setCustomerHistory(null)}>
          <div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div><h2 style={{ fontSize: 17, fontWeight: 700 }}>📋 {t.orderHistory}</h2><p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{customerHistory.name} · {customerHistory.phone}</p></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setCustomerHistory(null)}>{t.close}</button>
            </div>
            {getCO(customerHistory.phone).length === 0 ? <p style={{ color: "#64748b", textAlign: "center", padding: 30 }}>No orders yet</p> : <>
              {getCO(customerHistory.phone).map(o => (
                <div key={o.id} style={{ background: "#0d0f14", borderRadius: 8, padding: 14, marginBottom: 10, border: "1px solid #1e2130" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div><div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{o.id}</div><div style={{ fontSize: 12, color: "#64748b" }}>{o.date}</div></div>
                    <div style={{ textAlign: "right" }}><span className="badge" style={{ background: `${SC[o.status] || "#64748b"}22`, color: SC[o.status] || "#64748b" }}>{o.status}</span><div style={{ fontSize: 14, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif", marginTop: 2 }}>NT${(o.total || 0).toLocaleString()}</div></div>
                  </div>
                  {Array.isArray(o.items) && o.items.map((item, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 2 }}><span>{item.name} ×{item.qty}</span><span>NT${((item.price || 0) * item.qty).toLocaleString()}</span></div>)}
                </div>
              ))}
              <div style={{ borderTop: "1px solid #1e2130", paddingTop: 12, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span style={{ color: "#94a3b8" }}>{getCO(customerHistory.phone).length} orders</span>
                <span style={{ color: "#e85d04" }}>Total NT${getCO(customerHistory.phone).reduce((s, o) => s + (o.total || 0), 0).toLocaleString()}</span>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* CHECKOUT */}
      {showCheckout && (
        <div className="mo" onClick={() => setShowCheckout(false)}>
          <div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>🛒 {t.checkout}</h2>
            {cart.length === 0 ? <p style={{ color: "#64748b", textAlign: "center", padding: 30 }}>Cart is empty</p> : <>
              <div style={{ marginBottom: 16 }}>
                {cart.map(i => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1e2130", fontSize: 13 }}><span>{i.name} ×{i.qty}</span><span style={{ color: "#e85d04", fontWeight: 600 }}>NT${(i.price * i.qty).toLocaleString()}</span></div>)}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: 15 }}><span>{t.total}</span><span style={{ color: "#e85d04" }}>NT${cartTotal.toLocaleString()}</span></div>
              </div>
              {role === "admin" && customers.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Quick select customer:</div><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{customers.slice(0, 8).map(c => <button key={c.id} className="btn btn-secondary btn-sm" style={{ borderColor: checkoutForm.phone === c.phone ? "#e85d04" : "#2d3347", color: checkoutForm.phone === c.phone ? "#e85d04" : "#94a3b8" }} onClick={() => setCheckoutForm({ phone: c.phone, name: c.name, address: c.address || "" })}>{c.name}</button>)}</div></div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
                <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{t.phone} *</label><input placeholder={t.phone} value={checkoutForm.phone} onChange={e => { const ph = e.target.value; const found = customers.find(c => c.phone === ph); if (found) setCheckoutForm({ phone: ph, name: found.name, address: found.address || "" }); else setCheckoutForm(p => ({ ...p, phone: ph })); }} /></div>
                <input placeholder={`${t.name} *`} value={checkoutForm.name} onChange={e => setCheckoutForm(p => ({ ...p, name: e.target.value }))} />
                <input placeholder="Address" value={checkoutForm.address} onChange={e => setCheckoutForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}><button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCheckout(false)}>{t.cancel}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={placeOrder}>{t.placeOrder}</button></div>
            </>}
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 22, right: 22, background: toast.type === "error" ? "#7f1d1d" : "#14532d", color: toast.type === "error" ? "#fca5a5" : "#4ade80", padding: "11px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.4)", animation: "fadeUp .3s" }}>{toast.type === "error" ? "❌" : "✅"} {toast.msg}</div>}
    </div>
  );
}

function OrderTable({ orders, canEdit, onStatusChange, SC }) {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: "1px solid #1e2130" }}>{["Order ID", "Customer", "Date", "Items", "Total", "Status", ...(canEdit ? ["Update"] : [])].map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td style={{ padding: "11px 14px", fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{o.id}</td>
              <td style={{ padding: "11px 14px" }}><div style={{ fontSize: 13, fontWeight: 500 }}>{o.customer_name}</div><div style={{ fontSize: 11, color: "#64748b" }}>{o.customer_phone}</div></td>
              <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>{o.date}</td>
              <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8" }}>{Array.isArray(o.items) && o.items.map((item, i) => <div key={i}>{item.name} ×{item.qty}</div>)}</td>
              <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif" }}>NT${(o.total || 0).toLocaleString()}</td>
              <td style={{ padding: "11px 14px" }}><span className="badge" style={{ background: `${SC[o.status] || "#64748b"}22`, color: SC[o.status] || "#64748b" }}>{o.status}</span></td>
              {canEdit && <td style={{ padding: "11px 14px" }}><select value={o.status} onChange={e => onStatusChange(o.id, e.target.value)} style={{ width: 110, fontSize: 12, padding: "5px 8px" }}>{["處理中", "待出貨", "已完成", "已取消"].map(s => <option key={s}>{s}</option>)}</select></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <div style={{ textAlign: "center", padding: 36, color: "#64748b" }}>No orders</div>}
    </div>
  );
}

const LBL = (label, req) => <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{label}{req ? " *" : ""}</label>;

function PartModal({ part, onSave, onClose, t }) {
  const [form, setForm] = useState(part ? { sku: part.sku, name: part.name, category: part.category, brand: part.brand, price: part.price, stock: part.stock, minStock: part.min_stock, image_url: part.image_url || "" } : { sku: "", name: "", category: "Engine", brand: "", price: "", stock: "", minStock: "", image_url: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const preview = toImgUrl(form.image_url);
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{part ? t.editPart : t.newPart}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.sku, true)}<input value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="ENG-001" /></div>
          <div>{LBL(t.brand)}<input value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="BOSCH" /></div>
        </div>
        <div>{LBL(t.name, true)}<input value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div>{LBL(t.category)}<select value={form.category} onChange={e => set("category", e.target.value)}>{["Engine", "Brake", "Filter", "Electrical", "Suspension", "引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"].map(c => <option key={c}>{c}</option>)}</select></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>{LBL(t.price, true)}<input type="number" value={form.price} onChange={e => set("price", e.target.value)} /></div>
          <div>{LBL(t.stock)}<input type="number" value={form.stock} onChange={e => set("stock", e.target.value)} /></div>
          <div>{LBL(t.minStock)}<input type="number" value={form.minStock} onChange={e => set("minStock", e.target.value)} /></div>
        </div>
        <div>
          {LBL(t.image_url)}
          <input type="url" value={form.image_url} onChange={e => set("image_url", e.target.value)} placeholder="https://drive.google.com/file/d/..." />
          <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{t.gdrive_hint}</div>
          {preview && <img src={preview} alt="preview" style={{ marginTop: 8, width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 6 }} onError={e => e.target.style.display = "none"} />}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.sku || !form.name || !form.price) return; onSave({ sku: form.sku, name: form.name, category: form.category, brand: form.brand, price: +form.price, stock: +form.stock, min_stock: +form.minStock, image_url: form.image_url }); }}>{t.save}</button>
      </div>
    </div></div>
  );
}

function AdjustModal({ part, onApply, onClose, t }) {
  const [nq, setNq] = useState(part.stock);
  const [reason, setReason] = useState("");
  const diff = nq - part.stock;
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>📦 {t.adjustStock}</h2>
      <p style={{ color: "#64748b", fontSize: 12, marginBottom: 18 }}>{part.name} · {part.sku}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18, background: "#0d0f14", borderRadius: 8, padding: 14 }}>
        {[["Current", part.stock, "#94a3b8"], ["Change", diff > 0 ? `+${diff}` : diff || "—", diff > 0 ? "#22c55e" : diff < 0 ? "#ef4444" : "#64748b"], ["New", nq, "#e85d04"]].map(([l, v, c]) => <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>{l}</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Rajdhani,sans-serif", color: c }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          {LBL("New quantity", true)}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="btn btn-secondary btn-sm" style={{ fontSize: 16, padding: "5px 14px" }} onClick={() => setNq(q => Math.max(0, q - 1))}>−</button><input type="number" value={nq} onChange={e => setNq(Math.max(0, parseInt(e.target.value) || 0))} style={{ textAlign: "center", fontWeight: 700 }} /><button className="btn btn-secondary btn-sm" style={{ fontSize: 16, padding: "5px 14px" }} onClick={() => setNq(q => q + 1)}>+</button></div>
        </div>
        <div>{LBL("Reason")}<input type="text" placeholder="e.g. stocktake, damage, return..." value={reason} onChange={e => setReason(e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}><button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onApply(part, nq, reason)}>{t.confirm}</button></div>
    </div></div>
  );
}

function SupplierModal({ supplier, onSave, onClose, t }) {
  const [form, setForm] = useState(supplier ? { name: supplier.name, email: supplier.email || "", phone: supplier.phone || "", country: supplier.country || "", contact_person: supplier.contact_person || "", notes: supplier.notes || "" } : { name: "", email: "", phone: "", country: "", contact_person: "", notes: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{supplier ? "Edit Supplier" : "Add Supplier"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div>{LBL(t.supplierName, true)}<input value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.country)}<input value={form.country} onChange={e => set("country", e.target.value)} placeholder="Taiwan, Japan..." /></div>
          <div>{LBL(t.contactPerson)}<input value={form.contact_person} onChange={e => set("contact_person", e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.email)}<input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
          <div>{LBL(t.phone)}<input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
        </div>
        <div>{LBL(t.notes)}<textarea value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}><button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.name) return; onSave(form); }}>{t.save}</button></div>
    </div></div>
  );
}

function PartSupplierModal({ part, partSuppliers, suppliers, onSave, onDelete, onClose, t }) {
  const [suppId, setSuppId] = useState("");
  const [price, setPrice] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [minOrder, setMinOrder] = useState(1);
  const [notes, setNotes] = useState("");
  const available = suppliers.filter(s => !partSuppliers.find(ps => ps.supplier_id === s.id));
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div><h2 style={{ fontSize: 17, fontWeight: 700 }}>🏭 Suppliers for {part.name}</h2><p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{part.sku}</p></div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>{t.close}</button>
      </div>
      {/* Linked suppliers */}
      {partSuppliers.length > 0 && <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>Linked Suppliers</div>
        {partSuppliers.map(ps => (
          <div key={ps.id} style={{ background: "#0d0f14", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #1e2130", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ps.supplier?.name || "—"}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{ps.supplier?.country} · Lead: {ps.lead_time || "—"} · Min: {ps.min_order}</div>
              {ps.supplier_price && <div style={{ fontSize: 12, color: "#22c55e", marginTop: 2 }}>Price: NT${ps.supplier_price.toLocaleString()}</div>}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(ps.id)}>{t.delete}</button>
          </div>
        ))}
      </div>}
      {/* Add new */}
      {available.length > 0 && <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>Link New Supplier</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>{LBL("Supplier", true)}<select value={suppId} onChange={e => setSuppId(e.target.value)}><option value="">Select supplier...</option>{available.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}</select></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>{LBL(t.supplier_price)}<input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" /></div>
            <div>{LBL(t.lead_time)}<input value={leadTime} onChange={e => setLeadTime(e.target.value)} placeholder="7 days" /></div>
            <div>{LBL(t.min_order)}<input type="number" value={minOrder} onChange={e => setMinOrder(e.target.value)} /></div>
          </div>
          <div>{LBL(t.notes)}<input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={() => { if (!suppId) return; const s = suppliers.find(s => s.id === +suppId); onSave({ part_id: part.id, supplier_id: +suppId, supplier_price: price ? +price : null, lead_time: leadTime, min_order: +minOrder, notes }); }}>Link Supplier</button>
        </div>
      </div>}
      {available.length === 0 && partSuppliers.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 20 }}>No suppliers available. Add suppliers first.</p>}
    </div></div>
  );
}

function InquiryModal({ part, suppliers, partSuppliers, onSend, onClose, t }) {
  const [suppId, setSuppId] = useState(partSuppliers[0]?.supplier_id || "");
  const [qty, setQty] = useState(10);
  const [message, setMessage] = useState(`Dear Supplier,\n\nWe would like to request a quotation for:\n- Part: ${part.name} (${part.sku})\n- Quantity: \n\nPlease provide your best price and available stock.\n\nThank you.`);
  const selSupplier = suppliers.find(s => s.id === +suppId);
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>📩 Send RFQ</h2>
      <p style={{ color: "#64748b", fontSize: 12, marginBottom: 18 }}>{part.name} · {part.sku}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div>
          {LBL("Supplier", true)}
          <select value={suppId} onChange={e => setSuppId(e.target.value)}>
            <option value="">Select supplier...</option>
            {partSuppliers.length > 0
              ? partSuppliers.map(ps => { const s = suppliers.find(s => s.id === ps.supplier_id); return s ? <option key={s.id} value={s.id}>{s.name} ({s.country})</option> : null; })
              : suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
          </select>
          {selSupplier && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>✉ {selSupplier.email || "No email"} · 👤 {selSupplier.contact_person || "—"}</div>}
        </div>
        <div>{LBL("Quantity requested", true)}<input type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div>{LBL("Message")}<textarea value={message} onChange={e => setMessage(e.target.value)} style={{ minHeight: 120 }} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!suppId || !qty) return; const s = suppliers.find(s => s.id === +suppId); onSend({ part_id: part.id, part_name: part.name, supplier_id: +suppId, supplier_name: s?.name, supplier_email: s?.email, qty_requested: +qty, message }); }}>📩 Send Inquiry</button>
      </div>
    </div></div>
  );
}

function InquiryDetailModal({ inquiry, onUpdate, onClose, t }) {
  const [replyPrice, setReplyPrice] = useState(inquiry.reply_price || "");
  const [replyStock, setReplyStock] = useState(inquiry.reply_stock || "");
  const [replyNotes, setReplyNotes] = useState(inquiry.reply_notes || "");
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div><h2 style={{ fontSize: 17, fontWeight: 700 }}>📩 Inquiry Detail</h2><p style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{inquiry.id}</p></div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>{t.close}</button>
      </div>
      <div style={{ background: "#0d0f14", borderRadius: 8, padding: 14, marginBottom: 16, border: "1px solid #1e2130" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Part</div><div style={{ fontSize: 13, fontWeight: 500 }}>{inquiry.part_name}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Supplier</div><div style={{ fontSize: 13, fontWeight: 500 }}>{inquiry.supplier_name}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Email</div><div style={{ fontSize: 12, color: "#94a3b8" }}>{inquiry.supplier_email || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Qty Requested</div><div style={{ fontSize: 13, fontWeight: 600, color: "#e85d04" }}>{inquiry.qty_requested}</div></div>
        </div>
        {inquiry.message && <div style={{ borderTop: "1px solid #1e2130", paddingTop: 10 }}><div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Message</div><div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "pre-line" }}>{inquiry.message}</div></div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 12 }}>Record Reply</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL("Reply Price")}<input type="number" value={replyPrice} onChange={e => setReplyPrice(e.target.value)} placeholder="NT$" /></div>
          <div>{LBL("Reply Stock")}<input type="number" value={replyStock} onChange={e => setReplyStock(e.target.value)} /></div>
        </div>
        <div>{LBL("Reply Notes")}<textarea value={replyNotes} onChange={e => setReplyNotes(e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onUpdate(inquiry.id, { reply_price: replyPrice ? +replyPrice : null, reply_stock: replyStock ? +replyStock : null, reply_notes: replyNotes, status: "replied", replied_at: new Date().toISOString() })}>Save Reply & Mark Replied</button>
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onUpdate(inquiry.id, { status: "closed" })}>Close</button>
      </div>
    </div></div>
  );
}

function CustomerModal({ customer, onSave, onClose, t }) {
  const [form, setForm] = useState(customer ? { name: customer.name, phone: customer.phone, email: customer.email || "", address: customer.address || "" } : { name: "", phone: "", email: "", address: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{customer ? "Edit Customer" : "Add Customer"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.name, true)}<input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div>{LBL(t.phone, true)}<input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
        </div>
        <div>{LBL(t.email)}<input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
        <div>{LBL("Address")}<input value={form.address} onChange={e => set("address", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}><button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.name || !form.phone) return; onSave(form); }}>{t.save}</button></div>
    </div></div>
  );
}

function UserModal({ user, onSave, onClose, t }) {
  const [form, setForm] = useState(user ? { username: user.username, password: "", role: user.role, name: user.name || "", phone: user.phone || "", email: user.email || "" } : { username: "", password: "", role: "customer", name: "", phone: "", email: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mo" onClick={onClose}><div className="md" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>{user ? "Edit User" : "Add User"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.username, true)}<input value={form.username} onChange={e => set("username", e.target.value)} disabled={!!user} /></div>
          <div>{LBL(user ? "New password (blank = no change)" : "Password *")}<input type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••" /></div>
        </div>
        <div>{LBL(t.role)}<select value={form.role} onChange={e => set("role", e.target.value)}><option value="admin">👑 Admin</option><option value="shipper">🚚 Shipper</option><option value="customer">👤 Customer</option></select></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>{LBL(t.name)}<input value={form.name} onChange={e => set("name", e.target.value)} /></div>
          <div>{LBL(t.phone)}<input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
        </div>
        <div>{LBL(t.email)}<input type="email" value={form.email} onChange={e => set("email", e.target.value)} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}><button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>{t.cancel}</button><button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.username || (!user && !form.password)) return; const d = { username: form.username, role: form.role, name: form.name, phone: form.phone, email: form.email }; if (form.password) d.password = form.password; onSave(d); }}>{t.save}</button></div>
    </div></div>
  );
}

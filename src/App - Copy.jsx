import { useState, useEffect } from "react";

// ============================================================
// 🔧 請將下方 YOUR_ANON_KEY 替換成您的 Supabase anon public key
// ============================================================
const SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxza291aXl2ZG5nZHphcXV1cmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjk3ODMsImV4cCI6MjA4OTk0NTc4M30.tAmBHvR_IAIVm0HLnYEjyRS277SxbuaSotb6N0Rf4bk";

const H = (extra = {}) => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

const api = {
  get: async (table, query = "") => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: H() });
    return res.json();
  },
  upsert: async (table, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: H({ Prefer: "return=representation,resolution=merge-duplicates" }),
      body: JSON.stringify(data),
    });
    return res.json();
  },
  patch: async (table, col, val, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}`, {
      method: "PATCH",
      headers: H({ Prefer: "return=representation" }),
      body: JSON.stringify(data),
    });
    return res.json();
  },
  delete: async (table, col, val) => {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}`, {
      method: "DELETE", headers: H(),
    });
  },
};

const STATUS_COLORS = { "已完成": "#22c55e", "待出貨": "#f59e0b", "處理中": "#3b82f6", "已取消": "#ef4444" };
const CATEGORIES = ["全部", "引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"];
const ORDER_STATUSES = ["全部", "處理中", "待出貨", "已完成", "已取消"];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Rajdhani:wght@600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#1a1d26}::-webkit-scrollbar-thumb{background:#374151;border-radius:3px}
input,select,textarea{outline:none}
.btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;transition:all .2s}
.btn-primary{background:#e85d04;color:#fff;padding:8px 18px}
.btn-primary:hover{background:#f87337;transform:translateY(-1px)}
.btn-primary:disabled{background:#444;cursor:not-allowed;transform:none}
.btn-secondary{background:#1e2130;color:#94a3b8;padding:8px 18px;border:1px solid #2d3347}
.btn-secondary:hover{background:#252840;color:#e2e8f0}
.btn-danger{background:#7f1d1d;color:#fca5a5;padding:6px 14px}
.btn-danger:hover{background:#991b1b}
.btn-sm{padding:5px 12px;font-size:12px}
.card{background:#141720;border:1px solid #1e2130;border-radius:12px}
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
input[type=text],input[type=number],input[type=tel],input[type=email],select{background:#0d0f14;border:1px solid #2d3347;color:#e2e8f0;border-radius:6px;padding:8px 12px;font-family:inherit;font-size:13px;width:100%}
input:focus,select:focus{border-color:#e85d04}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
.modal{background:#141720;border:1px solid #2d3347;border-radius:14px;padding:28px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
tr:hover td{background:#1a1d26!important}
.tab-filter{background:none;border:none;cursor:pointer;color:#64748b;padding:6px 14px;font-family:inherit;font-size:12px;font-weight:500;border-radius:6px;transition:all .2s;white-space:nowrap}
.tab-filter.active{background:#1e2130;color:#e85d04}
.tab-filter:hover:not(.active){color:#94a3b8}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.fade-up{animation:fadeUp .2s ease}
`;

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [parts, setParts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);

  const [searchPart, setSearchPart] = useState("");
  const [filterCat, setFilterCat] = useState("全部");
  const [filterOrderStatus, setFilterOrderStatus] = useState("全部");
  const [searchCustomer, setSearchCustomer] = useState("");

  const [showPartModal, setShowPartModal] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", phone: "", address: "" });
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const loadAll = async () => {
    setLoading(true);
    const [p, o, c] = await Promise.all([
      api.get("parts", "select=*&order=id.asc"),
      api.get("orders", "select=*&order=created_at.desc"),
      api.get("customers", "select=*&order=total_spent.desc"),
    ]);
    setParts(Array.isArray(p) ? p : []);
    setOrders(Array.isArray(o) ? o : []);
    setCustomers(Array.isArray(c) ? c : []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const addToCart = (part) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === part.id);
      if (ex) return prev.map(i => i.id === part.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...part, qty: 1 }];
    });
    showToast(`${part.name} 已加入購物車`);
  };
  const removeFromCart = (id) => setCart(p => p.filter(i => i.id !== id));
  const updateCartQty = (id, qty) => { if (qty < 1) return; setCart(p => p.map(i => i.id === id ? { ...i, qty } : i)); };
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const placeOrder = async () => {
    if (!checkoutForm.name || !checkoutForm.phone) { showToast("請填寫姓名和電話", "error"); return; }
    const orderId = `ORD-${Date.now()}`;
    await api.upsert("orders", {
      id: orderId, customer_name: checkoutForm.name, customer_phone: checkoutForm.phone,
      date: new Date().toISOString().slice(0, 10), status: "處理中",
      items: cart.map(i => ({ partId: i.id, qty: i.qty, name: i.name, price: i.price })),
      total: cartTotal,
    });
    for (const ci of cart) {
      const part = parts.find(p => p.id === ci.id);
      if (part) await api.patch("parts", "id", ci.id, { stock: Math.max(0, part.stock - ci.qty) });
    }
    const ex = customers.find(c => c.phone === checkoutForm.phone);
    if (ex) {
      await api.patch("customers", "phone", checkoutForm.phone, { orders: ex.orders + 1, total_spent: ex.total_spent + cartTotal });
    } else {
      await api.upsert("customers", { name: checkoutForm.name, phone: checkoutForm.phone, address: checkoutForm.address || "", email: "", orders: 1, total_spent: cartTotal });
    }
    await loadAll();
    setCart([]); setShowCheckout(false); setCheckoutForm({ name: "", phone: "", address: "" });
    showToast(`訂單 ${orderId} 已成立！`);
    setTab("orders");
  };

  const updateOrderStatus = async (id, newStatus) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;

    const wasCancelled = order.status === "已取消";
    const nowCancelled = newStatus === "已取消";

    // 從「非取消」→「已取消」：補回庫存
    if (!wasCancelled && nowCancelled && Array.isArray(order.items)) {
      for (const item of order.items) {
        const part = parts.find(p => p.id === item.partId);
        if (part) {
          await api.patch("parts", "id", item.partId, { stock: part.stock + item.qty });
        }
      }
      showToast(`訂單已取消，庫存已補回 ${order.items.length} 項零件`, "error");
    }
    // 從「已取消」→「其他狀態」（恢復訂單）：重新扣庫存
    else if (wasCancelled && !nowCancelled && Array.isArray(order.items)) {
      for (const item of order.items) {
        const part = parts.find(p => p.id === item.partId);
        if (part) {
          await api.patch("parts", "id", item.partId, { stock: Math.max(0, part.stock - item.qty) });
        }
      }
      showToast("訂單已恢復，庫存已重新扣除");
    } else {
      showToast("訂單狀態已更新");
    }

    await api.patch("orders", "id", id, { status: newStatus });
    await loadAll();
  };

  const savePart = async (data) => {
    if (editPart) { await api.patch("parts", "id", editPart.id, data); showToast("零件資料已更新"); }
    else { await api.upsert("parts", { ...data, image: "🔩" }); showToast("新零件已新增"); }
    await loadAll(); setShowPartModal(false); setEditPart(null);
  };

  const deletePart = async (id) => {
    await api.delete("parts", "id", id); await loadAll(); showToast("零件已刪除", "error");
  };

  const saveCustomer = async (data) => {
    if (editCustomer) { await api.patch("customers", "id", editCustomer.id, data); showToast("客戶資料已更新"); }
    else { await api.upsert("customers", { ...data, orders: 0, total_spent: 0 }); showToast("新客戶已新增"); }
    await loadAll(); setShowCustomerModal(false); setEditCustomer(null);
  };

  const deleteCustomer = async (id) => {
    await api.delete("customers", "id", id); await loadAll(); showToast("客戶已刪除", "error");
  };

  const filteredParts = parts.filter(p =>
    (filterCat === "全部" || p.category === filterCat) &&
    (p.name?.includes(searchPart) || p.sku?.includes(searchPart) || p.brand?.includes(searchPart))
  );
  const filteredOrders = orders.filter(o => filterOrderStatus === "全部" || o.status === filterOrderStatus);
  const filteredCustomers = customers.filter(c =>
    c.name?.includes(searchCustomer) || c.phone?.includes(searchCustomer) || c.email?.includes(searchCustomer)
  );

  const lowStockParts = parts.filter(p => p.stock <= p.min_stock);
  const totalRevenue = orders.filter(o => o.status === "已完成").reduce((s, o) => s + (o.total || 0), 0);
  const pendingOrders = orders.filter(o => o.status === "處理中" || o.status === "待出貨").length;
  const getCustomerOrders = (phone) => orders.filter(o => o.customer_phone === phone);

  const lbl = (k, req) => <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>{k}{req && " *"}</label>;

  if (loading) return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Noto Sans TC,sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>⚙️</div>
        <div style={{ color: "#e85d04", fontSize: 16, fontWeight: 600 }}>載入中...</div>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>正在連接 Supabase 資料庫</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "Noto Sans TC,sans-serif", background: "#0d0f14", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", height: "100vh" }}>

        {/* SIDEBAR */}
        <aside style={{ width: 220, background: "#0a0c10", borderRight: "1px solid #1e2130", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 50 }}>
          <div style={{ padding: "24px 20px 16px" }}>
            <div style={{ fontFamily: "Rajdhani,sans-serif", fontSize: 22, fontWeight: 700, color: "#e85d04", letterSpacing: 1 }}>⚙ AUTO<span style={{ color: "#e2e8f0" }}>PARTS</span></div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>零件管理銷售系統</div>
            <div style={{ fontSize: 10, color: "#22c55e", marginTop: 4 }}>🟢 已連接 Supabase</div>
          </div>
          <nav style={{ padding: "0 12px", flex: 1 }}>
            {[
              { id: "dashboard", icon: "📊", label: "總覽儀表板" },
              { id: "inventory", icon: "📦", label: "庫存管理" },
              { id: "shop", icon: "🛒", label: "線上銷售" },
              { id: "orders", icon: "📋", label: "訂單管理" },
              { id: "customers", icon: "👥", label: "客戶管理" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: tab === t.id ? "#1a1d26" : "none", border: "none", borderRadius: 8, color: tab === t.id ? "#e85d04" : "#64748b", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: tab === t.id ? 600 : 400, marginBottom: 2, textAlign: "left", transition: "all .2s", borderLeft: tab === t.id ? "3px solid #e85d04" : "3px solid transparent" }}>
                <span>{t.icon}</span> {t.label}
                {t.id === "orders" && pendingOrders > 0 && (
                  <span style={{ marginLeft: "auto", background: "#e85d04", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{pendingOrders}</span>
                )}
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 20px", borderTop: "1px solid #1e2130" }}>
            <button onClick={() => setShowCheckout(true)} style={{ background: "#e85d04", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", width: "100%", fontFamily: "inherit", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              🛒 購物車
              {cartCount > 0 && <span style={{ background: "#fff", color: "#e85d04", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{cartCount}</span>}
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ marginLeft: 220, flex: 1, overflow: "auto", padding: "28px 32px" }} className="fade-up">

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>總覽儀表板</h1>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>系統運營狀況一覽</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "零件種類", value: parts.length, icon: "🔩", color: "#3b82f6", sub: "項產品" },
                { label: "待處理訂單", value: pendingOrders, icon: "⏳", color: "#f59e0b", sub: "筆待處理" },
                { label: "已完成營收", value: `NT$${totalRevenue.toLocaleString()}`, icon: "💰", color: "#22c55e", sub: "" },
                { label: "低庫存警告", value: lowStockParts.length, icon: "⚠️", color: "#ef4444", sub: "項需補貨" },
              ].map((s, i) => (
                <div key={i} className="card" style={{ padding: "20px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: "Rajdhani,sans-serif" }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{s.sub}</div>
                    </div>
                    <div style={{ fontSize: 28 }}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>最新訂單</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab("orders")}>查看全部</button>
                </div>
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e2130" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{o.customer_name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{o.id} · {o.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="badge" style={{ background: `${STATUS_COLORS[o.status]}22`, color: STATUS_COLORS[o.status] }}>{o.status}</span>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>NT${(o.total || 0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>⚠️ 低庫存警告</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab("inventory")}>管理庫存</button>
                </div>
                {lowStockParts.length === 0
                  ? <p style={{ color: "#64748b", fontSize: 13 }}>✅ 目前庫存充足</p>
                  : lowStockParts.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1e2130" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{p.sku}</div>
                      </div>
                      <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>剩 {p.stock} 件</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>訂單狀態總覽</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {["處理中", "待出貨", "已完成", "已取消"].map(s => {
                  const count = orders.filter(o => o.status === s).length;
                  return (
                    <div key={s} style={{ background: "#0d0f14", borderRadius: 8, padding: "14px 16px", textAlign: "center", border: `1px solid ${STATUS_COLORS[s]}33`, cursor: "pointer" }}
                      onClick={() => { setTab("orders"); setFilterOrderStatus(s); }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS[s], fontFamily: "Rajdhani,sans-serif" }}>{count}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>}

          {/* ── INVENTORY ── */}
          {tab === "inventory" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>庫存管理</h1>
                <p style={{ color: "#64748b", fontSize: 13 }}>共 {parts.length} 項零件 · 低庫存 {lowStockParts.length} 項</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setEditPart(null); setShowPartModal(true); }}>+ 新增零件</button>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <input type="text" placeholder="搜尋名稱、料號、品牌..." value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ width: 280 }} />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 140 }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2130" }}>
                    {["料號", "名稱", "分類", "品牌", "單價", "庫存", "狀態", "操作"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map(p => (
                    <tr key={p.id}>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{p.sku}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>{p.image}</span>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}><span className="badge" style={{ background: "#1e2130", color: "#94a3b8" }}>{p.category}</span></td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#94a3b8" }}>{p.brand}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>NT${(p.price || 0).toLocaleString()}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: p.stock <= p.min_stock ? "#ef4444" : "#22c55e" }}>{p.stock}</span>
                        <span style={{ fontSize: 11, color: "#475569" }}> 件 (最低{p.min_stock})</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {p.stock === 0 ? <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>缺貨</span>
                          : p.stock <= p.min_stock ? <span className="badge" style={{ background: "#78350f", color: "#fbbf24" }}>庫存低</span>
                            : <span className="badge" style={{ background: "#14532d", color: "#4ade80" }}>正常</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditPart(p); setShowPartModal(true); }}>編輯</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deletePart(p.id)}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredParts.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>找不到符合的零件</div>}
            </div>
          </>}

          {/* ── SHOP ── */}
          {tab === "shop" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>線上商店</h1>
                <p style={{ color: "#64748b", fontSize: 13 }}>選購汽車零件</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowCheckout(true)}>
                🛒 結帳 {cartCount > 0 && `(${cartCount}件)`} {cartTotal > 0 && `· NT$${cartTotal.toLocaleString()}`}
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input type="text" placeholder="搜尋零件..." value={searchPart} onChange={e => setSearchPart(e.target.value)} style={{ width: 240 }} />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 140 }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
              {filteredParts.map(p => {
                const inCart = cart.find(i => i.id === p.id);
                return (
                  <div key={p.id} className="card" style={{ padding: 18, borderColor: inCart ? "#e85d04" : "#1e2130" }}>
                    <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>{p.image}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>{p.sku} · {p.brand}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                    <span className="badge" style={{ background: "#1e2130", color: "#94a3b8", marginBottom: 10, display: "block", width: "fit-content" }}>{p.category}</span>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif", marginBottom: 4 }}>NT${(p.price || 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: p.stock > 0 ? "#22c55e" : "#ef4444", marginBottom: 12 }}>{p.stock > 0 ? `庫存 ${p.stock} 件` : "缺貨"}</div>
                    {inCart ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(p.id, inCart.qty - 1)}>−</button>
                        <span style={{ flex: 1, textAlign: "center", fontWeight: 600 }}>{inCart.qty}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(p.id, inCart.qty + 1)}>+</button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeFromCart(p.id)}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-primary" style={{ width: "100%" }} disabled={p.stock === 0} onClick={() => addToCart(p)}>加入購物車</button>
                    )}
                  </div>
                );
              })}
            </div>
          </>}

          {/* ── ORDERS ── */}
          {tab === "orders" && <>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>訂單管理</h1>
              <p style={{ color: "#64748b", fontSize: 13 }}>共 {orders.length} 筆訂單</p>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "#0d0f14", padding: "8px 10px", borderRadius: 8, border: "1px solid #1e2130", width: "fit-content", flexWrap: "wrap" }}>
              {ORDER_STATUSES.map(s => {
                const count = s === "全部" ? orders.length : orders.filter(o => o.status === s).length;
                return (
                  <button key={s} className={`tab-filter ${filterOrderStatus === s ? "active" : ""}`} onClick={() => setFilterOrderStatus(s)}>
                    {s} <span style={{ opacity: .7 }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2130" }}>
                    {["訂單編號", "客戶", "日期", "商品", "金額", "狀態", "更新狀態"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ padding: "12px 16px", fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{o.id}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{o.customer_name}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{o.customer_phone}</div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{o.date}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>
                        {Array.isArray(o.items) && o.items.map((item, i) => <div key={i}>{item.name} ×{item.qty}</div>)}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 15, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif", whiteSpace: "nowrap" }}>NT${(o.total || 0).toLocaleString()}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span className="badge" style={{ background: `${STATUS_COLORS[o.status]}22`, color: STATUS_COLORS[o.status] }}>{o.status}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)} style={{ width: 110, fontSize: 12, padding: "5px 8px" }}>
                          {["處理中", "待出貨", "已完成", "已取消"].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOrders.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>此狀態無訂單</div>}
            </div>
          </>}

          {/* ── CUSTOMERS ── */}
          {tab === "customers" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>客戶管理</h1>
                <p style={{ color: "#64748b", fontSize: 13 }}>共 {customers.length} 位客戶</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setEditCustomer(null); setShowCustomerModal(true); }}>+ 新增客戶</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <input type="text" placeholder="搜尋姓名、電話、Email..." value={searchCustomer} onChange={e => setSearchCustomer(e.target.value)} style={{ width: 300 }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
              {filteredCustomers.map(c => (
                <div key={c.id} className="card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e85d04", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                      {c.name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{c.phone}</div>
                    </div>
                  </div>
                  {c.email && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>✉ {c.email}</div>}
                  {c.address && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>📍 {c.address}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1e2130", paddingTop: 12, marginBottom: 14 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", fontFamily: "Rajdhani,sans-serif" }}>{c.orders}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>訂單數</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif" }}>NT${(c.total_spent || 0).toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>總消費</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setCustomerHistory(c)}>📋 訂單歷史</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditCustomer(c); setShowCustomerModal(true); }}>編輯</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteCustomer(c.id)}>刪除</button>
                  </div>
                </div>
              ))}
              {filteredCustomers.length === 0 && <div style={{ color: "#64748b", fontSize: 13 }}>找不到符合的客戶</div>}
            </div>
          </>}
        </main>
      </div>

      {/* PART MODAL */}
      {showPartModal && <PartModal part={editPart} onSave={savePart} onClose={() => { setShowPartModal(false); setEditPart(null); }} />}

      {/* CUSTOMER MODAL */}
      {showCustomerModal && <CustomerModal customer={editCustomer} onSave={saveCustomer} onClose={() => { setShowCustomerModal(false); setEditCustomer(null); }} />}

      {/* CUSTOMER HISTORY MODAL */}
      {customerHistory && (
        <div className="modal-overlay" onClick={() => setCustomerHistory(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>📋 訂單歷史</h2>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{customerHistory.name} · {customerHistory.phone}</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setCustomerHistory(null)}>關閉</button>
            </div>
            {getCustomerOrders(customerHistory.phone).length === 0
              ? <p style={{ color: "#64748b", textAlign: "center", padding: 30 }}>此客戶尚無訂單紀錄</p>
              : <>
                {getCustomerOrders(customerHistory.phone).map(o => (
                  <div key={o.id} style={{ background: "#0d0f14", borderRadius: 8, padding: 14, marginBottom: 10, border: "1px solid #1e2130" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{o.id}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{o.date}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className="badge" style={{ background: `${STATUS_COLORS[o.status]}22`, color: STATUS_COLORS[o.status] }}>{o.status}</span>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#e85d04", fontFamily: "Rajdhani,sans-serif", marginTop: 3 }}>NT${(o.total || 0).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #1e2130", paddingTop: 8 }}>
                      {Array.isArray(o.items) && o.items.map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>
                          <span>{item.name} ×{item.qty}</span>
                          <span>NT${((item.price || 0) * item.qty).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #1e2130", paddingTop: 14, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span style={{ color: "#94a3b8" }}>共 {getCustomerOrders(customerHistory.phone).length} 筆訂單</span>
                  <span style={{ color: "#e85d04" }}>總計 NT${getCustomerOrders(customerHistory.phone).reduce((s, o) => s + (o.total || 0), 0).toLocaleString()}</span>
                </div>
              </>}
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div className="modal-overlay" onClick={() => setShowCheckout(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>🛒 確認訂單</h2>
            {cart.length === 0 ? <p style={{ color: "#64748b", textAlign: "center", padding: 30 }}>購物車是空的</p> : <>
              <div style={{ marginBottom: 18 }}>
                {cart.map(i => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e2130", fontSize: 13 }}>
                    <span>{i.image} {i.name} ×{i.qty}</span>
                    <span style={{ color: "#e85d04", fontWeight: 600 }}>NT${(i.price * i.qty).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: 700, fontSize: 16 }}>
                  <span>合計</span><span style={{ color: "#e85d04" }}>NT${cartTotal.toLocaleString()}</span>
                </div>
              </div>
              {customers.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>選擇舊客戶快速帶入：</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {customers.map(c => (
                      <button key={c.id} className="btn btn-secondary btn-sm"
                        style={{ borderColor: checkoutForm.phone === c.phone ? "#e85d04" : "#2d3347", color: checkoutForm.phone === c.phone ? "#e85d04" : "#94a3b8" }}
                        onClick={() => setCheckoutForm({ phone: c.phone, name: c.name, address: c.address || "" })}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>電話 *</label>
                  <input placeholder="輸入電話" value={checkoutForm.phone}
                    onChange={e => {
                      const phone = e.target.value;
                      const found = customers.find(c => c.phone === phone);
                      if (found) setCheckoutForm({ phone, name: found.name, address: found.address || "" });
                      else setCheckoutForm(p => ({ ...p, phone }));
                    }} />
                  {customers.find(c => c.phone === checkoutForm.phone) && (
                    <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>✅ 舊客戶資料已自動帶入</div>
                  )}
                </div>
                <input placeholder="姓名 *" value={checkoutForm.name} onChange={e => setCheckoutForm(p => ({ ...p, name: e.target.value }))} />
                <input placeholder="地址" value={checkoutForm.address} onChange={e => setCheckoutForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCheckout(false)}>取消</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={placeOrder}>確認下單</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast.type === "error" ? "#7f1d1d" : "#14532d", color: toast.type === "error" ? "#fca5a5" : "#4ade80", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,.4)", animation: "fadeUp .3s" }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}

function PartModal({ part, onSave, onClose }) {
  const [form, setForm] = useState(part
    ? { sku: part.sku, name: part.name, category: part.category, brand: part.brand, price: part.price, stock: part.stock, minStock: part.min_stock }
    : { sku: "", name: "", category: "引擎", brand: "", price: "", stock: "", minStock: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{part ? "編輯零件" : "新增零件"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>料號 *</label><input value={form.sku} onChange={e => set("sku", e.target.value)} placeholder="ENG-001" /></div>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>品牌</label><input value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="BOSCH" /></div>
          </div>
          <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>名稱 *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="零件名稱" /></div>
          <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>分類</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}>
              {["引擎", "煞車系統", "濾清系統", "電氣系統", "懸吊系統"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>單價 *</label><input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" /></div>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>庫存數量</label><input type="number" value={form.stock} onChange={e => set("stock", e.target.value)} placeholder="0" /></div>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>最低庫存</label><input type="number" value={form.minStock} onChange={e => set("minStock", e.target.value)} placeholder="0" /></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.sku || !form.name || !form.price) return; onSave({ sku: form.sku, name: form.name, category: form.category, brand: form.brand, price: +form.price, stock: +form.stock, min_stock: +form.minStock }); }}>{part ? "儲存變更" : "新增零件"}</button>
        </div>
      </div>
    </div>
  );
}

function CustomerModal({ customer, onSave, onClose }) {
  const [form, setForm] = useState(customer
    ? { name: customer.name, phone: customer.phone, email: customer.email || "", address: customer.address || "" }
    : { name: "", phone: "", email: "", address: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{customer ? "編輯客戶" : "新增客戶"}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>姓名 *</label><input value={form.name} onChange={e => set("name", e.target.value)} placeholder="王大明" /></div>
            <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>電話 *</label><input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="0912-345-678" /></div>
          </div>
          <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Email</label><input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="example@email.com" /></div>
          <div><label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>地址</label><input value={form.address} onChange={e => set("address", e.target.value)} placeholder="台北市中山區..." /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => { if (!form.name || !form.phone) return; onSave(form); }}>{customer ? "儲存變更" : "新增客戶"}</button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";

const BRANCH_R = 215;
const SUB_R    = 158;
const SW       = 94;   // sub-node pill width
const SH       = 26;   // sub-node pill height

const MAP_DATA = {
  label:"MotorDesk", icon:"🚗",
  desc:"All-in-one motor parts & workshop management system",
  children:[
    {
      id:"workshop", label:"Workshop", icon:"🔧", color:"#3b82f6",
      desc:"Complete workshop management from booking to invoice",
      children:[
        {id:"ws_jobs",   label:"Jobs",       icon:"📋", tab:"workshop",     desc:"Vehicle repair jobs, bookings and job status tracking"},
        {id:"ws_cust",   label:"Customers",  icon:"👤", tab:"workshop",     desc:"Workshop-specific customer database"},
        {id:"ws_veh",    label:"Vehicles",   icon:"🚗", tab:"workshop",     desc:"Vehicle records linked to jobs and service history"},
        {id:"ws_quotes", label:"Quotations", icon:"📄", tab:"workshop",     desc:"Digital repair quotes sent to customers via WhatsApp/email"},
        {id:"ws_inv",    label:"Invoices",   icon:"🧾", tab:"workshop",     desc:"Generate and manage workshop invoices"},
        {id:"ws_pay",    label:"Payments",   icon:"💳", tab:"workshop",     desc:"Record and track customer payments"},
        {id:"ws_stk",    label:"WS Stock",   icon:"📦", tab:"workshop",     desc:"Local workshop parts inventory"},
        {id:"ws_shop",   label:"Spare Shop", icon:"🏪", tab:"workshop",     desc:"Request parts from linked spare shop with auto stock check"},
      ]
    },
    {
      id:"inventory", label:"Inventory", icon:"📦", color:"#10b981",
      desc:"Parts catalog and stock management",
      children:[
        {id:"inv_parts",label:"Parts Catalog",icon:"🔩",tab:"inventory",  desc:"Full parts catalog with photos, SKU and OE numbers"},
        {id:"inv_take", label:"Stock Take",   icon:"📊",tab:"stocktake",  desc:"Periodic inventory count and reconciliation"},
        {id:"inv_move", label:"Stock Move",   icon:"🔀",tab:"stockmove",  desc:"Transfer stock between locations"},
        {id:"inv_logs", label:"Stock Logs",   icon:"📝",tab:"logs",       desc:"Full audit trail of all inventory changes"},
        {id:"inv_fit",  label:"Fitments",     icon:"🔗",tab:"inventory",  desc:"Link parts to vehicle makes, models and years"},
      ]
    },
    {
      id:"procurement", label:"Procurement", icon:"🛒", color:"#8b5cf6",
      desc:"Supplier management and purchasing",
      children:[
        {id:"pro_sup",  label:"Suppliers",     icon:"🏭",tab:"suppliers",        desc:"Supplier database with contacts, pricing and history"},
        {id:"pro_rfq",  label:"RFQ Sessions",  icon:"📋",tab:"rfq",              desc:"Send quote requests to multiple suppliers at once"},
        {id:"pro_inq",  label:"Inquiries",     icon:"📩",tab:"inquiries",        desc:"Track individual supplier inquiry threads"},
        {id:"pro_inv",  label:"Sup. Invoices", icon:"🧾",tab:"purchaseInvoices", desc:"Record and reconcile supplier invoices"},
        {id:"pro_ret",  label:"Returns",        icon:"↩️",tab:"supplierReturns", desc:"Manage returns and credits to suppliers"},
      ]
    },
    {
      id:"sales", label:"Sales & Customers", icon:"💼", color:"#ec4899",
      desc:"Counter sales and customer management",
      children:[
        {id:"sal_cust",label:"Customers",  icon:"👥",tab:"customers",        desc:"Customer database with full purchase history"},
        {id:"sal_inv", label:"Invoices",   icon:"🧾",tab:"customerInvoices", desc:"Customer sales invoices and receipts"},
        {id:"sal_ret", label:"Returns",    icon:"↩️",tab:"customerReturns",  desc:"Handle customer part returns and credits"},
        {id:"sal_qry", label:"Queries",    icon:"❓",tab:"customerQueries",  desc:"Track and resolve customer queries and complaints"},
        {id:"sal_pos", label:"Checkout",   icon:"🛒",tab:"orders",           desc:"Point-of-sale counter checkout with barcode scan"},
      ]
    },
    {
      id:"vehicles", label:"Vehicles & RFQ", icon:"🚘", color:"#06b6d4",
      desc:"Vehicle database and public quote requests",
      children:[
        {id:"veh_db",  label:"Vehicles",    icon:"🗃️",tab:"vehicles",desc:"Make/model/year vehicle fitment reference database"},
        {id:"veh_rfq", label:"RFQ",         icon:"📋",tab:"rfq",     desc:"Multi-supplier quote request sessions"},
        {id:"veh_vin", label:"VIN Search",  icon:"🔍",tab:"vehicles",desc:"Vehicle lookup and decode by VIN number"},
        {id:"veh_ph",  label:"Photos",      icon:"📸",tab:"vehicles",desc:"Vehicle photo sets for the public catalogue"},
      ]
    },
    {
      id:"branches", label:"Branches", icon:"🏢", color:"#f59e0b",
      desc:"Multi-branch and spare shop network",
      children:[
        {id:"br_setup",label:"Branch Setup",       icon:"⚙️",tab:"branches",        desc:"Configure branches, pricing tiers and stock"},
        {id:"br_stk",  label:"Branch Stock",        icon:"📦",tab:"inventory",        desc:"Branch-specific inventory and pricing"},
        {id:"br_usr",  label:"Branch Users",        icon:"👤",tab:"users",            desc:"Role-based user management per branch"},
        {id:"br_xfer", label:"Transfer Requests",   icon:"🔄",tab:"transferRequests", desc:"Request stock transfers between branches"},
        {id:"br_wsreq",label:"Workshop Requests",   icon:"🏪",tab:"wsShopRequests",   desc:"Workshop spare part requests with auto main-stock check"},
      ]
    },
    {
      id:"reports", label:"Reports", icon:"📊", color:"#eab308",
      desc:"Analytics and business reporting",
      children:[
        {id:"rep_sal",label:"Sales Reports",     icon:"📈",tab:"reports",desc:"Revenue, margins and top-selling parts"},
        {id:"rep_inv",label:"Inventory Reports", icon:"📉",tab:"reports",desc:"Stock value, aging and movement analysis"},
        {id:"rep_ws", label:"Workshop Reports",  icon:"🔧",tab:"reports",desc:"Job completion rates and technician productivity"},
        {id:"rep_sm", label:"Salesman Summary",  icon:"👤",tab:"reports",desc:"Individual salesperson commissions and performance"},
      ]
    },
    {
      id:"system", label:"System", icon:"⚙️", color:"#6b7280",
      desc:"Administration and configuration",
      children:[
        {id:"sys_set",label:"Settings",     icon:"⚙️",tab:"settings",   desc:"Shop info, currency, tax, branding and integrations"},
        {id:"sys_usr",label:"Users & Roles",icon:"👥",tab:"users",      desc:"User accounts with granular role-based access control"},
        {id:"sys_log",label:"Login Logs",   icon:"🌍",tab:"loginlogs",  desc:"Security audit trail of all user logins with geo-location"},
        {id:"sys_ads",label:"Ad Contracts", icon:"📑",tab:"adcontracts",desc:"Manage advertising display contracts"},
        {id:"sys_sub",label:"Subscriptions",icon:"💳",tab:"settings",   desc:"Workshop module billing, plans and expiry management"},
      ]
    },
  ]
};

const BTN = {
  padding:"4px 10px", borderRadius:6, border:"1px solid var(--border)",
  background:"none", cursor:"pointer", fontSize:11, color:"var(--text3)"
};

const MAX_SPREAD = Math.PI * 0.72; // 130° max — keeps sub-nodes clearly outward
const NODE_GAP   = 40;              // minimum px gap between sub-node edges

// Pure radial arc fan. Radius auto-scales so every node has NODE_GAP breathing room.
function calcSubNodes(children, bx, by, angle, isOpen) {
  if (!isOpen || !children?.length) return [];
  const n    = children.length;
  const minArc = SW + NODE_GAP;    // min center-to-center distance along arc
  // Radius needed so arc-spacing >= minArc within MAX_SPREAD
  const R    = n > 1 ? Math.max(SUB_R, (n - 1) * minArc / MAX_SPREAD) : SUB_R;
  const spread = n > 1 ? Math.min(MAX_SPREAD, (n - 1) * minArc / R) : 0;
  return children.map((sub, j) => {
    const sa = angle + (j - (n - 1) / 2) * (n > 1 ? spread / (n - 1) : 0);
    return { ...sub, x: bx + R * Math.cos(sa), y: by + R * Math.sin(sa) };
  });
}

function calcLayout(expanded) {
  const n = MAP_DATA.children.length;
  return MAP_DATA.children.map((branch, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const bx = BRANCH_R * Math.cos(angle);
    const by = BRANCH_R * Math.sin(angle);
    const isOpen = expanded.has(branch.id);
    const subs = calcSubNodes(branch.children, bx, by, angle, isOpen)
      .map(s => ({ ...s, color: branch.color }));
    return { ...branch, x: bx, y: by, angle, subs, isOpen };
  });
}

function qPath(x1, y1, x2, y2, qx, qy) {
  const cx = qx ?? (x1 + x2) / 2;
  const cy = qy ?? (y1 + y2) / 2;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

// Merge user-dragged positions. When a branch was moved, recompute its
// sub-nodes from the new angle so they always fan outward correctly.
function applyOverrides(branches, pos) {
  return branches.map(b => {
    const bp = pos[b.id];
    const bx = bp?.x ?? b.x, by = bp?.y ?? b.y;
    const moved = !!bp;

    let subs = b.subs;
    if (moved && b.isOpen) {
      const newAngle = Math.atan2(by, bx);
      subs = calcSubNodes(b.children, bx, by, newAngle, true)
        .map(s => ({ ...s, color: b.color }));
    }

    return {
      ...b, x: bx, y: by,
      subs: subs.map(s => {
        const sp = pos[s.id];
        return sp ? { ...s, x: sp.x, y: sp.y } : s;
      }),
    };
  });
}

const LS_KEY = "md_sysmap_positions";

export function SystemMapPage({ onNavigate }) {
  const [expanded, setExpanded] = useState(new Set());
  const [tip, setTip] = useState(null);
  const [pan, setPan] = useState(() => ({
    x: Math.max(500, (window.innerWidth - 240) / 2),
    y: Math.max(350, (window.innerHeight - 110) / 2),
  }));
  const [zoom, setZoom] = useState(0.9);
  const [nodePositions, setNodePositions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  });

  // Keep a ref so mUp can save without stale closure
  const nodePosRef = useRef(nodePositions);
  useEffect(() => { nodePosRef.current = nodePositions; }, [nodePositions]);

  const dragRef     = useRef(null); // canvas pan
  const nodeDragRef = useRef(null); // {id, startCX, startCY, origX, origY, moved}
  const lastDragMoved = useRef(false);
  const svgRef = useRef(null);

  // Non-passive wheel for zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = e => {
      e.preventDefault();
      setZoom(z => Math.max(0.25, Math.min(3, z * (e.deltaY > 0 ? 0.88 : 1.14))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const toggle = id => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Canvas pan — only starts if no node drag is active
  const mDown = e => {
    if (e.button !== 0 || nodeDragRef.current) return;
    e.preventDefault();
    dragRef.current = { sx: e.clientX - pan.x, sy: e.clientY - pan.y };
  };

  // Node drag start — stopPropagation prevents canvas pan
  const nodeDown = (e, id, x, y) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    nodeDragRef.current = { id, startCX: e.clientX, startCY: e.clientY, origX: x, origY: y, moved: false };
    document.body.style.cursor = "grabbing";
  };

  const mMove = e => {
    if (nodeDragRef.current) {
      const { id, startCX, startCY, origX, origY } = nodeDragRef.current;
      const dist = Math.hypot(e.clientX - startCX, e.clientY - startCY);
      if (dist > 4) {
        nodeDragRef.current.moved = true;
        const dx = (e.clientX - startCX) / zoom;
        const dy = (e.clientY - startCY) / zoom;
        setNodePositions(prev => ({ ...prev, [id]: { x: origX + dx, y: origY + dy } }));
      }
      return;
    }
    if (dragRef.current) {
      setPan({ x: e.clientX - dragRef.current.sx, y: e.clientY - dragRef.current.sy });
    }
  };

  const mUp = () => {
    document.body.style.cursor = "";
    if (nodeDragRef.current) {
      lastDragMoved.current = nodeDragRef.current.moved;
      if (nodeDragRef.current.moved) {
        localStorage.setItem(LS_KEY, JSON.stringify(nodePosRef.current));
      }
      nodeDragRef.current = null;
    }
    dragRef.current = null;
  };

  const handleToggle = (e, id) => {
    e.stopPropagation();
    if (lastDragMoved.current) { lastDragMoved.current = false; return; }
    toggle(id);
  };

  const handleSubClick = (e, s) => {
    e.stopPropagation();
    if (lastDragMoved.current) { lastDragMoved.current = false; return; }
    if (s.tab && onNavigate) onNavigate(s.tab);
  };

  const showTip = (e, label, desc) => setTip({ label, desc, cx: e.clientX, cy: e.clientY });

  const rawBranches = calcLayout(expanded);
  const branches = applyOverrides(rawBranches, nodePositions);
  const allExpanded = MAP_DATA.children.every(b => expanded.has(b.id));
  const hasCustomLayout = Object.keys(nodePositions).length > 0;
  const BR = 38, CR = 52;

  const resetView = () => {
    setPan({
      x: Math.max(500, (window.innerWidth - 240) / 2),
      y: Math.max(350, (window.innerHeight - 110) / 2),
    });
    setZoom(0.9);
  };

  const resetLayout = () => {
    setNodePositions({});
    localStorage.removeItem(LS_KEY);
  };

  return (
    <div style={{ position:"relative", height:"calc(100vh - 56px)", overflow:"hidden", userSelect:"none", background:"var(--bg)" }}>

      {/* Toolbar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:44, display:"flex", alignItems:"center", padding:"0 16px", gap:10, zIndex:10, background:"var(--surface)", borderBottom:"1px solid var(--border)" }}>
        <span style={{ fontWeight:800, fontSize:16, whiteSpace:"nowrap" }}>🗺️ MotorDesk System Map</span>
        <span style={{ fontSize:10.5, color:"var(--text3)", flex:1 }}>
          Drag nodes to rearrange · Click module to expand · Hover for details · Drag canvas to pan · Scroll to zoom
        </span>
        <button style={BTN} onClick={() => setExpanded(allExpanded ? new Set() : new Set(MAP_DATA.children.map(b => b.id)))}>
          {allExpanded ? "⊟ Collapse All" : "⊞ Expand All"}
        </button>
        <button style={BTN} onClick={resetView}>⟲ View</button>
        {hasCustomLayout && (
          <button style={{ ...BTN, color:"#ef4444", borderColor:"#ef4444" }} onClick={resetLayout}>
            ✕ Reset Layout
          </button>
        )}
        <button style={{ ...BTN, borderColor:"var(--accent)", color:"var(--accent)" }}
          onClick={() => window.open(`${window.location.origin}${window.location.pathname}?sysmap=1`, "_blank")}>
          ⧉ New Tab
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ display:"block", paddingTop:44, cursor:"grab", boxSizing:"border-box" }}
        onMouseDown={mDown}
        onMouseMove={mMove}
        onMouseUp={mUp}
        onMouseLeave={mUp}
      >
        <defs>
          <filter id="sm-sh">
            <feDropShadow dx="0" dy="2" stdDeviation="5" floodOpacity="0.22"/>
          </filter>
          <radialGradient id="sm-root" cx="40%" cy="30%">
            <stop offset="0%" stopColor="#fb923c"/>
            <stop offset="100%" stopColor="#c2410c"/>
          </radialGradient>
          {MAP_DATA.children.map(b => (
            <radialGradient key={b.id} id={`sm-${b.id}`} cx="40%" cy="30%">
              <stop offset="0%" stopColor={b.color} stopOpacity="0.95"/>
              <stop offset="100%" stopColor={b.color} stopOpacity="0.65"/>
            </radialGradient>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* Center → Branch lines */}
          {branches.map(b => (
            <path key={`l-${b.id}`}
              stroke={b.color}
              strokeWidth={b.isOpen ? 3 : 2.5}
              fill="none"
              strokeOpacity={b.isOpen ? 0.65 : 0.35}
              d={qPath(0, 0, b.x, b.y, b.x * 0.35, b.y * 0.35)}
            />
          ))}

          {/* Branch → Sub lines */}
          {branches.flatMap(b => b.subs.map(s => (
            <path key={`ls-${s.id}`}
              stroke={b.color} strokeWidth={1.5} fill="none" strokeOpacity={0.35}
              d={qPath(b.x, b.y, s.x, s.y)}
            />
          )))}

          {/* Sub-nodes */}
          {branches.flatMap(b => b.subs.map(s => (
            <g key={s.id}
              style={{ cursor:"move" }}
              onMouseEnter={e => showTip(e, `${s.icon} ${s.label}`, s.desc)}
              onMouseLeave={() => setTip(null)}
              onMouseDown={e => nodeDown(e, s.id, s.x, s.y)}
              onClick={e => handleSubClick(e, s)}
            >
              <rect
                x={s.x - SW / 2} y={s.y - SH / 2}
                width={SW} height={SH} rx={13}
                fill={b.color} fillOpacity={0.14}
                stroke={b.color} strokeWidth={1.2} strokeOpacity={0.55}
              />
              <text x={s.x} y={s.y} textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize:9.5, fontWeight:600, fill:"var(--text)", pointerEvents:"none" }}>
                {s.icon} {s.label}
              </text>
            </g>
          )))}

          {/* Branch nodes */}
          {branches.map(b => (
            <g key={b.id}
              style={{ cursor:"move" }}
              onMouseEnter={e => showTip(e, `${b.icon} ${b.label}`, b.desc)}
              onMouseLeave={() => setTip(null)}
              onMouseDown={e => nodeDown(e, b.id, b.x, b.y)}
              onClick={e => handleToggle(e, b.id)}
            >
              <circle cx={b.x} cy={b.y} r={BR + 10} fill={b.color} opacity={b.isOpen ? 0.13 : 0.06}/>
              <circle cx={b.x} cy={b.y} r={BR} fill={`url(#sm-${b.id})`} filter="url(#sm-sh)"/>
              <text x={b.x} y={b.y - 10} textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize:17, pointerEvents:"none" }}>{b.icon}</text>
              <text x={b.x} y={b.y + 7} textAnchor="middle"
                style={{ fontSize:8.5, fontWeight:700, fill:"#fff", pointerEvents:"none" }}>
                {b.label}
              </text>
              <text x={b.x} y={b.y + 18} textAnchor="middle"
                style={{ fontSize:7, fill:"rgba(255,255,255,0.6)", pointerEvents:"none" }}>
                {b.isOpen ? `▲ ${b.children?.length || 0} items` : `${b.children?.length || 0} items ▼`}
              </text>
            </g>
          ))}

          {/* Center node — draggable too */}
          <g
            style={{ cursor:"move" }}
            onMouseEnter={e => showTip(e, "🚗 MotorDesk", MAP_DATA.desc)}
            onMouseLeave={() => setTip(null)}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          >
            <circle cx={0} cy={0} r={CR + 14} fill="#f97316" opacity={0.1}/>
            <circle cx={0} cy={0} r={CR + 6}  fill="#f97316" opacity={0.08}/>
            <circle cx={0} cy={0} r={CR} fill="url(#sm-root)" filter="url(#sm-sh)"/>
            <text x={0} y={-14} textAnchor="middle" style={{ fontSize:24, pointerEvents:"none" }}>🚗</text>
            <text x={0} y={7}   textAnchor="middle" style={{ fontSize:11.5, fontWeight:800, fill:"#fff", pointerEvents:"none" }}>MotorDesk</text>
            <text x={0} y={21}  textAnchor="middle" style={{ fontSize:8, fill:"rgba(255,255,255,0.7)", pointerEvents:"none" }}>
              {MAP_DATA.children.length} modules
            </text>
          </g>
        </g>
      </svg>

      {/* Tooltip */}
      {tip && (
        <div style={{
          position:"fixed", left:tip.cx + 16, top:tip.cy - 52,
          background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8,
          padding:"8px 12px", fontSize:12, pointerEvents:"none", zIndex:9999,
          maxWidth:240, boxShadow:"0 4px 20px rgba(0,0,0,.2)"
        }}>
          <div style={{ fontWeight:700, marginBottom:3 }}>{tip.label}</div>
          <div style={{ color:"var(--text3)", fontSize:10.5, lineHeight:1.45 }}>{tip.desc}</div>
        </div>
      )}

      {/* Legend + save hint */}
      <div style={{
        position:"absolute", bottom:12, left:12,
        display:"flex", flexWrap:"wrap", gap:6,
        background:"var(--surface)", borderRadius:8, padding:"6px 10px",
        border:"1px solid var(--border)", maxWidth:"calc(100% - 24px)",
        alignItems:"center"
      }}>
        {MAP_DATA.children.map(b => (
          <div key={b.id}
            style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, cursor:"pointer" }}
            onClick={() => toggle(b.id)}
          >
            <div style={{ width:8, height:8, borderRadius:"50%", background:b.color, flexShrink:0 }}/>
            <span style={{ color:"var(--text3)" }}>{b.label}</span>
          </div>
        ))}
        {hasCustomLayout && (
          <span style={{ fontSize:9, color:"var(--text3)", marginLeft:4, opacity:0.6 }}>· layout saved</span>
        )}
      </div>
    </div>
  );
}

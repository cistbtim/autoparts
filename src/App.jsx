import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// 🔧 CONFIG — reads from Vite env variables (.env file)
// ============================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";

// ── API ──────────────────────────────────────────────────────
const H = (x = {}) => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...x });
// Fetch ALL rows from a table using pagination (no row limit)
const fetchAll = async (table, query="") => {
  const PAGE = 1000; // Supabase max per request
  let all = [], offset = 0;
  while(true) {
    const sep = query ? "&" : "";
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`;
    const batch = await (await fetch(url, {headers:H()})).json();
    if(!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if(batch.length < PAGE) break; // last page
    offset += PAGE;
  }
  return all;
};

const api = {
  get:    async (t, q="") => fetchAll(t, q),
  upsert: async (t, d)    => (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {method:"POST", headers:H({Prefer:"return=representation,resolution=merge-duplicates"}), body:JSON.stringify(d)})).json(),
  patch:  async (t, c, v, d) => (await fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, {method:"PATCH", headers:H({Prefer:"return=representation"}), body:JSON.stringify(d)})).json(),
  delete: async (t, c, v) => fetch(`${SUPABASE_URL}/rest/v1/${t}?${c}=eq.${v}`, {method:"DELETE", headers:H()}),
  insert: async (t, d)    => (await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {method:"POST", headers:H({Prefer:"return=representation"}), body:JSON.stringify(d)})).json(),
};

// ── Settings cache ────────────────────────────────────────────
let _settings = { shop_name:"AutoParts", logo_url:"", logo_data:"", logo_h_login:140, logo_h_sidebar:36, logo_h_pdf:70, logo_blend:"normal", currency:"TWD NT$", whatsapp:"", email:"", phone:"", address:"", tax_rate:0, vat_number:"", invoice_prefix:"INV", credit_note_prefix:"CN", apps_script_url:"", vehicle_script_url:"" };
const getSettings = () => _settings;
const loadSettings = async () => {
  try {
    const r = await api.get("settings","id=eq.1&select=*");
    if(Array.isArray(r)&&r[0]){
      _settings={..._settings,...r[0]};
    }
  } catch(e){ console.warn("loadSettings error:",e); }
  return _settings;
};
const curSym = (c) => { const s = (c||"").trim(); const i = s.lastIndexOf(" "); return i>=0 ? s.slice(i+1) : s; };
const C = () => curSym(getSettings().currency || "TWD NT$");

// ── i18n ─────────────────────────────────────────────────────
const T = {
  en:{
    appSub:"Parts Management System", dashboard:"Dashboard", inventory:"Inventory",
    systemOverview:"System overview", recentOrders:"Recent Orders", viewAll:"View all",
    lowStockAlert:"Low Stock", manage:"Manage", orderStatus:"Order Status",
    connected:"Connected", s_processing:"Processing", s_shipped:"Ready to Ship",
    s_done:"Completed", s_cancelled:"Cancelled",
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
    role:"Role", admin:"Admin", manager:"Manager", shipper:"Shipper", stockman:"Stockman", customer:"Customer",
    revenue:"Revenue", pendingOrders:"Pending", lowStock:"Low Stock", parts:"Parts",
    all:"All", total:"Total", subtotal:"Subtotal", tax:"Tax", orders_count:"Orders",
    image_url:"Photo URL (Google Drive)", gdrive_hint:"Paste share link — auto converted",
    chineseDesc:"Chinese Description", make:"Make", model:"Model", yearRange:"Year Range", oeNumber:"OE Number",
    lead_time:"Lead Time", min_order:"Min Order", supplier_price:"Supplier Price",
    notes:"Notes", message:"Message", send:"Send Inquiry",
    invoice:"Invoice", invoiceNo:"Invoice No", invoiceDate:"Invoice Date", dueDate:"Due Date",
    unitCost:"Unit Cost", unitPrice:"Unit Price", qty:"Qty", amount:"Amount",
    supplierPartId:"Supplier Part ID", addLine:"Add Line",
    returnNote:"Return / Credit Note", returnDate:"Return Date", reason:"Reason",
    stockIn:"Stock In", stockOut:"Stock Out", createInvoice:"Create Invoice",
    picking:"Picking", pickOrder:"Pick Order", startPicking:"Start Picking",
    findByVehicle:"Find Parts by Vehicle",
    workshop:"Workshop", jobCards:"Job Cards", newJob:"New Job Card",
    jobCard:"Job Card", mechanic:"Mechanic", complaint:"Complaint",
    diagnosis:"Diagnosis", vehicleReg:"Vehicle Reg", mileage:"Mileage",
    dateIn:"Date In", dateOut:"Date Out", labour:"Labour",
    addLabour:"Add Labour", addPart:"Add Part", jobItems:"Job Items",
    workshopInvoice:"Workshop Invoice", createWorkshopInv:"Create Invoice",
    pending:"Pending", inProgress:"In Progress", done:"Done", delivered:"Delivered",
    vehicleColor:"Color", selectMake:"Select Make", selectModel:"Select Model",
    vehicles:"Vehicles", addVehicle:"Add Vehicle", editVehicle:"Edit Vehicle", vehicleMgmt:"Vehicle Management",
    yearFrom:"Year From", yearTo:"Year To", engine:"Engine", variant:"Variant",
    selectYear:"Select Year", fitsMycar:"Parts for my car", vehicleFitment:"Vehicle Fitment",
    addVehicle:"Add Vehicle", linkedVehicles:"Linked Vehicles", noFitment:"No vehicles linked yet",
    scanBarcode:"Scan Barcode", pickItem:"Pick Item", pickedAll:"All Picked",
    confirmShip:"Confirm & Ship", scanOrConfirm:"Scan or tap to confirm",
    createReturn:"Create Return", shopName:"Shop Name", currency:"Currency",
    taxRate:"Tax Rate (%)", invoicePrefix:"Invoice Prefix", whatsappNo:"WhatsApp Number",
    shopEmail:"Shop Email", shopPhone:"Shop Phone", shopAddress:"Shop Address",
    saveSettings:"Save Settings", demoAccounts:"Demo Accounts",
    selectSuppliers:"Select Suppliers", sendToSelected:"Send to Selected",
    rfqSession:"RFQ Session", newRfq:"New RFQ", rfqItems:"Items", rfqQuotes:"Quotes",
    sendRfq:"Send RFQ", compareQuotes:"Compare Quotes", createPO:"Create PO",
    qtyNeeded:"Qty Needed", unitPrice:"Unit Price", leadDays:"Lead Days",
    selectParts:"Select Parts", selectSupps:"Select Suppliers", deadline:"Deadline",
    reports:"Reports", salesReport:"Sales Report", inventoryReport:"Inventory Report",
    stockTake:"Stock Take", stockMove:"Stock Move", stockSheet:"Stock Sheet",
    binLocation:"Bin Location", systemQty:"System Qty", countedQty:"Counted Qty",
    variance:"Variance", startTake:"Start Stock Take", completeTake:"Complete",
    moveStock:"Move Stock", fromBin:"From Bin", toBin:"To Bin",
    customerReport:"Customer Report", supplierReport:"Supplier Report",
    payments:"Payments", addPayment:"Add Payment", paymentMethod:"Method",
    cash:"Cash", bankTransfer:"Bank Transfer", card:"Card", outstanding:"Outstanding",
    paid:"Paid", reconcile:"Reconcile", printInvoice:"Print / PDF", download:"Download PDF",
    sendWa:"Send via WhatsApp", sendEmail:"Send via Email",
    daily:"Daily", monthly:"Monthly", yearly:"Yearly",
  },
  zh:{
    appSub:"零件管理銷售系統", dashboard:"儀表板", inventory:"庫存管理",
    systemOverview:"系統總覽", recentOrders:"最近訂單", viewAll:"查看全部",
    lowStockAlert:"低庫存", manage:"管理", orderStatus:"訂單狀態",
    connected:"已連線", s_processing:"處理中", s_shipped:"待出貨",
    s_done:"已完成", s_cancelled:"已取消",
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
    role:"角色", admin:"管理員", manager:"經理", shipper:"出貨員", stockman:"盤點員", customer:"客戶",
    revenue:"完成營收", pendingOrders:"待處理", lowStock:"低庫存", parts:"零件數",
    all:"全部", total:"合計", subtotal:"小計", tax:"稅額", orders_count:"訂單數",
    image_url:"圖片網址 (Google Drive)", gdrive_hint:"貼上分享連結，自動轉換",
    chineseDesc:"中文說明", make:"廠牌", model:"車型", yearRange:"年份", oeNumber:"OE號碼",
    lead_time:"交貨期", min_order:"最小訂量", supplier_price:"供應商報價",
    notes:"備註", message:"訊息", send:"發送詢價",
    invoice:"發票", invoiceNo:"發票號碼", invoiceDate:"發票日期", dueDate:"到期日",
    unitCost:"單位成本", unitPrice:"單價", qty:"數量", amount:"金額",
    supplierPartId:"供應商料號", addLine:"新增項目",
    returnNote:"退貨/折讓單", returnDate:"退貨日期", reason:"原因",
    stockIn:"入庫", stockOut:"出庫", createInvoice:"建立發票",
    picking:"撿貨", pickOrder:"撿貨訂單", startPicking:"開始撿貨",
    findByVehicle:"依車型找零件",
    workshop:"維修", jobCards:"工單", newJob:"新工單",
    jobCard:"工單", mechanic:"技師", complaint:"客訴",
    diagnosis:"診斷", vehicleReg:"車牌", mileage:"里程",
    dateIn:"入廠日", dateOut:"出廠日", labour:"工資",
    addLabour:"加工資", addPart:"加零件", jobItems:"工單項目",
    workshopInvoice:"維修發票", createWorkshopInv:"建立發票",
    pending:"待處理", inProgress:"維修中", done:"完成", delivered:"已交車",
    vehicleColor:"顏色", selectMake:"選擇品牌", selectModel:"選擇型號",
    vehicles:"車型管理", addVehicle:"新增車型", editVehicle:"編輯車型", vehicleMgmt:"車型管理",
    yearFrom:"起始年份", yearTo:"結束年份", engine:"引擎", variant:"配置",
    selectYear:"選擇年份", fitsMycar:"我的車款零件", vehicleFitment:"適用車型",
    addVehicle:"新增車型", linkedVehicles:"已連結車型", noFitment:"尚未連結車型",
    scanBarcode:"掃描條碼", pickItem:"確認此項目", pickedAll:"全部撿完",
    confirmShip:"確認出貨", scanOrConfirm:"掃描或點擊確認",
    createReturn:"建立退貨", shopName:"商店名稱", currency:"幣別",
    taxRate:"稅率 (%)", invoicePrefix:"發票前綴", whatsappNo:"WhatsApp號碼",
    shopEmail:"商店Email", shopPhone:"商店電話", shopAddress:"商店地址",
    saveSettings:"儲存設定", demoAccounts:"測試帳號",
    selectSuppliers:"選擇供應商", sendToSelected:"發送給已選",
    rfqSession:"詢價單", newRfq:"新詢價", rfqItems:"詢價項目", rfqQuotes:"報價",
    sendRfq:"發送詢價", compareQuotes:"比較報價", createPO:"轉採購單",
    qtyNeeded:"需求數量", unitPrice:"單價", leadDays:"交期(天)",
    selectParts:"選擇零件", selectSupps:"選擇供應商", deadline:"截止日期",
    reports:"報表", salesReport:"銷售報表", inventoryReport:"庫存報表",
    stockTake:"盤點", stockMove:"移庫", stockSheet:"盤點表",
    binLocation:"倉位", systemQty:"系統數量", countedQty:"盤點數量",
    variance:"差異", startTake:"開始盤點", completeTake:"完成盤點",
    moveStock:"移動庫存", fromBin:"原倉位", toBin:"新倉位",
    customerReport:"客戶報表", supplierReport:"供應商報表",
    payments:"付款記錄", addPayment:"新增付款", paymentMethod:"付款方式",
    cash:"現金", bankTransfer:"銀行轉帳", card:"刷卡", outstanding:"未付款",
    paid:"已付款", reconcile:"對帳", printInvoice:"列印/PDF", download:"下載 PDF",
    sendWa:"WhatsApp 傳送", sendEmail:"Email 傳送",
    daily:"每日", monthly:"每月", yearly:"每年",
  }
};

// ── Helpers ───────────────────────────────────────────────────
// Convert Google Drive share link → direct thumbnail URL
// Also stores the thumbnail URL in parts.image_url (no DB change needed)
const toImgUrl = (url) => {
  if (!url) return null;
  // Google Drive file link
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  // Google Drive direct/export link with id param
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  // Already a direct URL
  if (url.match(/^https?:\/\//)) return url;
  return null;
};

// Convert Google Drive share link → thumbnail URL for saving to DB
const toSaveUrl = (url) => {
  if (!url) return url;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w200`;
  return url;
};

// Convert Google Drive link → direct view URL (no white border — for logos)
const toLogoUrl = (url) => {
  if (!url) return null;p
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  if (url.match(/^https?:\/\//)) return url;
  return null;
};

// Extract Google Drive file ID from any Drive URL format
const extractDriveId = (url) => {
  if (!url) return null;
  const m = url.match(/thumbnail[?]id=([^&]+)/) ||
            url.match(/\/file\/d\/([^/?]+)/)     ||
            url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
};

// Strip cache-buster &t=... from Drive URLs before saving to DB
const stripCacheBuster = (url) => url ? url.replace(/&t=\d+/, "") : url;

// Convert any URL → large thumbnail for lightbox
const toFullUrl = (url) => {
  if (!url) return null;
  // Extract Drive file ID from any format
  const mThumb = url.match(/thumbnail[?]id=([^&]+)/);
  if (mThumb) return `https://drive.google.com/thumbnail?id=${mThumb[1]}&sz=w800`;
  const mFile = url.match(/file\/d\/([^/?]+)/);
  if (mFile) return `https://drive.google.com/thumbnail?id=${mFile[1]}&sz=w800`;
  const mId = url.match(/[?&]id=([^&]+)/);
  if (mId) return `https://drive.google.com/thumbnail?id=${mId[1]}&sz=w800`;
  return url;
};
const today = () => new Date().toISOString().slice(0,10);
const fmtAmt = (n) => `${C()}${(n||0).toLocaleString()}`;
let _idCounter = 0;
const makeId = (prefix) => {
  _idCounter++;
  return `${prefix}-${Date.now()}-${_idCounter}`;
};
const makeToken = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

// ── Dynamsoft Barcode Reader — PDF417 decoder ───────────────────
// Using v7.4.0-v1 (same version as the working Google Apps Script scanner)
const DYNAMSOFT_CDN = "https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@7.4.0-v1/dist/";
let _dsReader = null;

async function getDynamsoftReader() {
  if(_dsReader) return _dsReader;
  if(!window.Dynamsoft?.BarcodeReader){
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src=DYNAMSOFT_CDN+"dbr.js";
      s.onload=res;
      s.onerror=()=>rej(new Error("Could not load Dynamsoft SDK"));
      document.head.appendChild(s);
    });
  }
  // v7 API: window.Dynamsoft.BarcodeReader (not Dynamsoft.DBR)
  const BR=window.Dynamsoft.BarcodeReader;
  BR.engineResourcePath=DYNAMSOFT_CDN;
  // v7 uses productKeys (trial mode works without a key — shows watermark only)
  _dsReader=await BR.createInstance();
  const settings=await _dsReader.getRuntimeSettings();
  settings.barcodeFormatIds=Dynamsoft.EnumBarcodeFormat.BF_PDF417;
  settings.deblurLevel=9;
  settings.scaleDownThreshold=99999; // don't downscale — keep full resolution
  await _dsReader.updateRuntimeSettings(settings);
  return _dsReader;
}

// ── Decode PDF417 from a data-URL image ─────────────────────────
// Tries native BarcodeDetector first (Chrome/Edge/Safari 17+), then Dynamsoft
async function decodePDF417fromImage(dataUrl) {
  // Pre-load the image element — used by both methods
  const img=document.createElement("img");
  img.crossOrigin="anonymous";
  await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=dataUrl;});

  // Method 1: native BarcodeDetector (no library, instant, uses OS engine)
  // NOTE: On mobile (Android/iOS), BarcodeDetector may return rawValue with different
  // byte encoding for binary PDF417 data — the "***" and "%" delimiters can come back
  // garbled. We validate the result looks like a real SA disc payload; if not, we fall
  // through to Dynamsoft which handles binary encoding correctly on all platforms.
  if("BarcodeDetector" in window){
    try{
      const det=new window.BarcodeDetector({formats:["pdf417"]});
      const codes=await det.detect(img);
      if(codes.length){
        const val=codes[0].rawValue;
        // Only use this result if it contains the SA disc end-marker "***"
        // Otherwise fall through to Dynamsoft for correct binary decoding
        if(val.includes("***")) return val;
      }
    }catch{}
  }

  // Method 2: Dynamsoft (pass HTMLImageElement — most reliable on mobile)
  const reader=await getDynamsoftReader();
  const results=await reader.decode(img);
  if(results.length) return results[0].barcodeText;

  throw new Error("No PDF417 barcode found — try a sharper photo");
}

// ── Parse SA eNaTIS licence disc PDF417 payload ─────────────────
// Uses same logic as the working Google Apps Script scanner:
//  - Find "***" end-of-data marker, slice from char 1 to that marker
//  - Split by % to get fixed-position fields
//  - safeGet(idx) takes value before "/" to handle bilingual entries like "White/Wit"
// Field positions (default format):
//  [5] plate  [7] body type  [8] make  [9] model  [10] color  [11] VIN  [12] engine no
// RC format (starts with "RC"): [5] plate  [6] body  [7] make  [8] model  [9] VIN  [10] engine
function parseLicenceDisc(rawText) {
  // Strip Dynamsoft attention/warning prefix: "[Attention(exceptionCode:-20000)] "
  const text = rawText.replace(/^\[Attention\([^)]*\)\]\s*/i, "").trim();

  // Find the *** end-of-data marker (same technique as the working SA scanner)
  const strPos = text.indexOf("***");
  if(strPos === -1) return { reg:null, vin:null, engine_no:null, make:null, model:null, color:null, body_type:null, expiry_date:null, licence_no:null, raw:rawText };

  // Slice from index 1 (skip leading %) up to *** marker, then split by %
  const newresult = text.slice(1, strPos);
  const arr = newresult.split("%");

  // safeGet: return field value before any "/" (handles "White/Wit" bilingual), or ""
  const safeGet = (idx) => arr[idx] ? arr[idx].split("/")[0].trim() : "";

  const n = v => v?.trim() || null; // empty string → null

  let reg, vin, engine_no, make, model, color, body_type;

  if(arr[0]?.startsWith("RC")){
    // RC format
    reg       = n(safeGet(5));
    body_type = n(safeGet(6));
    make      = n(safeGet(7));
    model     = n(safeGet(8));
    color     = null;
    vin       = n(safeGet(9));
    engine_no = n(safeGet(10));
  } else {
    // Default eNaTIS format
    reg       = n(safeGet(5));
    body_type = n(safeGet(7));
    make      = n(safeGet(8));
    model     = n(safeGet(9));
    color     = n(safeGet(10));
    vin       = n(safeGet(11));
    engine_no = n(safeGet(12));
  }

  return { reg, vin, engine_no, make, model, color, body_type, expiry_date:null, licence_no:null, raw:rawText };
}
const waLink = (phone, msg) => `https://wa.me/${(phone||"").replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(msg)}`;
const mailLink = (to, subj, body) => `mailto:${to||""}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;

const ROLES = {
  admin:    { color:"#f97316", bg:"rgba(249,115,22,0.12)", icon:"👑" },
  manager:  { color:"#8b5cf6", bg:"rgba(139,92,246,0.12)", icon:"👔" },
  shipper:  { color:"#60a5fa", bg:"rgba(96,165,250,0.12)", icon:"🚚" },
  stockman: { color:"#10b981", bg:"rgba(16,185,129,0.12)", icon:"📦" },
  customer: { color:"#34d399", bg:"rgba(52,211,153,0.12)", icon:"👤" },
};
const OC = { "Completed":"#34d399","Ready to Ship":"#fbbf24","Processing":"#60a5fa","Cancelled":"#f87171","已完成":"#34d399","待出貨":"#fbbf24","處理中":"#60a5fa","已取消":"#f87171" };
const STATUS_ZH = {"Processing":"處理中","Ready to Ship":"待出貨","Completed":"已完成","Cancelled":"已取消","Paid":"已付款","Unpaid":"未付款","Partial":"部分付款","Pending":"待報價","Quoted":"已報價","Selected":"已選","Open":"進行中","Counted":"已盤點","ordered":"已訂購","Draft":"草稿","Sent":"已發送","Comparing":"比較中"};
let _currentLang = "en";
const tSt = (s) => _currentLang==="zh"?(STATUS_ZH[s]||s):s;
const CATS_EN = ["All","Engine","Brake","Filter","Electrical","Suspension"];
const CATS_ZH = ["全部","引擎","煞車系統","濾清系統","電氣系統","懸吊系統"];

// ── Car Makes with common models ─────────────────────────────
const CAR_MAKES = {
  "BMW":["1 Series","2 Series","3 Series","4 Series","5 Series","6 Series","7 Series","X1","X2","X3","X4","X5","X6","X7","M3","M5"],
  "Mercedes-Benz":["A-Class","B-Class","C-Class","E-Class","S-Class","GLA","GLC","GLE","GLS","CLA","CLS","AMG GT"],
  "Toyota":["Corolla","Camry","RAV4","Hilux","Land Cruiser","Prius","Fortuner","Yaris","HiAce","Prado"],
  "Ford":["Fiesta","Focus","Mondeo","Ranger","F-150","Mustang","Explorer","Kuga","EcoSport","Transit"],
  "Volkswagen":["Golf","Polo","Passat","Tiguan","Touareg","Amarok","Caddy","T-Roc","Arteon"],
  "Honda":["Civic","Accord","CR-V","HR-V","Jazz","Pilot","Odyssey","Fit","City"],
  "Hyundai":["i10","i20","i30","Tucson","Santa Fe","Creta","Sonata","Elantra","Kona"],
  "Kia":["Picanto","Rio","Cerato","Sportage","Sorento","Carnival","Stinger","EV6"],
  "Nissan":["Micra","Almera","Sentra","X-Trail","Qashqai","Navara","Patrol","Juke","Note"],
  "Mazda":["Mazda2","Mazda3","Mazda6","CX-3","CX-5","CX-9","BT-50","MX-5"],
  "Audi":["A1","A3","A4","A5","A6","A7","A8","Q2","Q3","Q5","Q7","Q8","TT","R8"],
  "Peugeot":["108","208","308","408","508","2008","3008","5008","Partner","Expert"],
  "Renault":["Kwid","Sandero","Logan","Duster","Captur","Megane","Kadjar","Koleos"],
  "Chevrolet":["Spark","Aveo","Cruze","Malibu","Trax","Equinox","Traverse","Silverado","Colorado"],
  "Mitsubishi":["Mirage","Lancer","Galant","Outlander","ASX","Pajero","L200","Eclipse Cross"],
  "Suzuki":["Alto","Swift","Baleno","Vitara","Jimny","Ertiga","S-Cross","Celerio"],
  "Isuzu":["D-Max","MU-X","Forward","NPR","NQR","FRR"],
  "GWM":["Steed","P-Series","Cannon","Haval H1","Haval H2","Haval H6","Haval Jolion","Tank 300"],
  "Haval":["H1","H2","H4","H6","H7","H9","Jolion","F7","Big Dog"],
  "Chery":["QQ","Tiggo 4","Tiggo 7","Tiggo 8","Arrizo 5","Arrizo 6"],
  "JAC":["S1","S2","S3","S4","S5","T6","T8","Sieve","Sei"],
  "BAIC":["X25","X35","X55","BJ40","BJ60","D20","M20"],
  "Geely":["GS","GL","Emgrand","Coolray","Azkarra","Okavango"],
  "Other":["Other / Unknown"],
};

// User-editable categories stored in localStorage (fallback to defaults)
const DEFAULT_CATS = ["Engine","Brake","Filter","Electrical","Suspension","Body","Transmission","Cooling","Fuel","Steering"];
// Get categories from settings cache (loaded from Supabase)
const getCategories = () => {
  try {
    const c = _settings.categories;
    if(c && typeof c === "string" && c.trim()) return JSON.parse(c);
    if(Array.isArray(c) && c.length) return c;
  } catch {}
  return DEFAULT_CATS;
};

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
const canAccess = (u) => {
  if(!u) return false;
  if(u.role==="admin") return true;
  // Customers who log in via customers table (_isCustomer flag) always get access
  if(u._isCustomer) return true;
  // Staff (shipper etc) — check subscription
  const s=getSubInfo(u);
  return s.status==="active"||s.status==="trial";
};

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
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;position:relative}
.mob-cards{display:none;flex-direction:column;gap:10px}
.desk-table{display:block}
@media(max-width:640px){.mob-cards{display:flex!important}.desk-table{display:none!important}}
@media(max-width:640px){
  .tbl-wrap{border-radius:0 0 var(--radius) var(--radius)}
  .tbl th,.tbl td{padding:8px 10px;font-size:12px;white-space:nowrap}
  .tbl-scroll-hint::after{content:"";position:absolute;right:0;top:0;bottom:0;width:32px;background:linear-gradient(to right,transparent,var(--surface));pointer-events:none;border-radius:0 var(--radius) var(--radius) 0}
}
.tbl th{padding:11px 14px;text-align:left;font-size:11px;color:var(--text);font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border);white-space:nowrap}
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
.part-img{width:42px;height:42px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--border);flex-shrink:0;cursor:zoom-in}
.part-emoji{width:42px;height:42px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.lbl{font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px;display:block}
.divider{border:none;border-top:1px solid var(--border);margin:14px 0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface3);border:1px solid var(--border2);color:var(--text);padding:11px 22px;border-radius:99px;font-size:14px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:var(--shadow-lg);animation:fadeUp .25s ease}
/* landscape hint removed — app works in portrait mode */
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);padding:6px 4px;z-index:100;gap:1px}
@media(max-width:767px){
  .mobile-nav{display:flex}.sidebar{display:none!important}
  .main-content{margin-left:0!important;padding:12px!important;padding-bottom:76px!important}
  .page-header{flex-direction:column;align-items:flex-start;gap:10px}
  .grid-4{grid-template-columns:1fr 1fr!important}
  .hide-mobile{display:none!important}
  .toast{bottom:80px}
  .modal{border-radius:var(--radius) var(--radius) 0 0;max-height:88vh}
  .tbl th,.tbl td{padding:9px 10px;font-size:13px}
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

@keyframes spin{to{transform:rotate(360deg)}}
.fu{animation:fadeUp .2s ease}
.cp-btn{background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);cursor:pointer;font-size:11px;padding:2px 7px;font-family:"DM Sans",sans-serif;transition:all .18s;white-space:nowrap;flex-shrink:0}
.cp-btn:hover{background:var(--surface3);color:var(--text)}
`;

// ── Shared UI ─────────────────────────────────────────────────
// ── Inline SVG Logo — no image file, no white border ─────────
const LogoSVG = ({height=44, style={}}) => (
  <svg height={height} viewBox="0 0 420 110" xmlns="http://www.w3.org/2000/svg" style={{display:"block",...style}}>
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
);

const ShopLogo = ({settings, size="md", style={}}) => {
  const heights = { sm:44, md:66, lg:140 }; // lg = login page logo
  const h = +(settings?.["logo_h_"+size] || heights[size] || 66);
  const raw = settings?.logo_url || settings?.logo_data;
  // Support base64 data URIs and Google Drive URLs
  const src = raw
    ? (raw.startsWith("data:") ? raw : toLogoUrl(raw))
    : null;
  if(src) return (
    <img src={src} alt="logo"
      style={{maxHeight:h, maxWidth:h*5, width:"auto", height:"auto", objectFit:"contain", display:"block", ...style}}
      onError={e=>e.target.style.display="none"}/>
  );
  return <LogoSVG height={h} style={style}/>;
};

// ── Shared UI ─────────────────────────────────────────────────
// LandscapeHint removed — app supports portrait mode

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

// DriveImg — reliable Google Drive image with multi-format fallback
// Tries: thumbnail sz=w800 → thumbnail sz=w400 → uc?export=view → hide
function DriveImg({url, alt, style, onClick}) {
  const id = extractDriveId(url);
  const urls = id ? [
    `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ] : (url ? [url] : []);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!urls.length || failed) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt||""}
      style={style}
      onClick={onClick}
      onError={()=>{
        if(idx < urls.length - 1) setIdx(i => i + 1);
        else setFailed(true);
      }}
    />
  );
}

const StatusBadge = ({status}) => {
  const MAP = {
    "已完成":["rgba(52,211,153,.15)","#34d399"],"已付款":["rgba(52,211,153,.15)","#34d399"],
    "Completed":["rgba(52,211,153,.15)","#34d399"],"Paid":["rgba(52,211,153,.15)","#34d399"],
    "approved":["rgba(52,211,153,.15)","#34d399"],"paid":["rgba(52,211,153,.15)","#34d399"],
    "待出貨":["rgba(251,191,36,.15)","#fbbf24"],"partial":["rgba(251,191,36,.15)","#fbbf24"],
    "Ready to Ship":["rgba(251,191,36,.15)","#fbbf24"],
    "處理中":["rgba(96,165,250,.15)","#60a5fa"],"pending":["rgba(96,165,250,.15)","#60a5fa"],
    "Processing":["rgba(96,165,250,.15)","#60a5fa"],
    "已取消":["rgba(248,113,113,.15)","#f87171"],"Cancelled":["rgba(248,113,113,.15)","#f87171"],
    "unpaid":["rgba(248,113,113,.15)","#f87171"],"replied":["rgba(52,211,153,.15)","#34d399"],
    "closed":["rgba(71,85,105,.3)","#94a3b8"],
  };
  const [bg,col] = MAP[status]||["rgba(71,85,105,.3)","#94a3b8"];
  return <span className="badge" style={{background:bg,color:col}}>{tSt(status)}</span>;
};

// ── Login Page ────────────────────────────────────────────────
function LoginPage({onLogin,t,lang,setLang,loadedSettings}) {
  const [authTab,setAuthTab] = useState("customer"); // default to customer
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
    const digitsOnly=cPhone.replace(/[^0-9]/g,"");
    if(digitsOnly.length<9){setErr(lang==="zh"?"電話號碼不足，請輸入完整號碼（最少9位數字）":"Phone number too short — please enter full number (min 9 digits)");return;}
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
              <ShopLogo settings={loadedSettings||_settings} size="lg"/>
            </div>
          </div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:8}}>{t.appSub}</div>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12}}>
            <button className={`lang ${lang==="en"?"on":""}`} onClick={()=>setLang("en")}>EN</button>
            <button className={`lang ${lang==="zh"?"on":""}`} onClick={()=>setLang("zh")}>中文</button>
          </div>
        </div>
        {/* Staff login link — small, subtle, at the top */}
        <div style={{textAlign:"right",marginBottom:12}}>
          <button onClick={()=>{setAuthTab(authTab==="customer"?"staff":"customer");setErr("");}}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--text3)",fontFamily:"DM Sans,sans-serif",textDecoration:"underline",textDecorationStyle:"dotted"}}>
            {authTab==="customer"
              ? (lang==="zh"?"🏢 員工登入":"🏢 Staff Login")
              : (lang==="zh"?"👤 返回客戶":"👤 Back to Customer")}
          </button>
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
                  <div><FL label={t.phone}/><input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/></div>
                  <div><FL label={t.password}/><input className="inp" type="password" value={cPass} onChange={e=>setCPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doCustLogin()}/></div>
                  {err&&<div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,padding:"9px 13px",fontSize:13,color:"var(--red)"}}>⚠ {err}</div>}
                  <button className="btn btn-primary" style={{width:"100%",padding:13}} onClick={doCustLogin} disabled={loading}>{loading?t.connecting:t.login}</button>
                  <p style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>{lang==="zh"?"沒有帳號？":"No account? "}<span style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCustTab("register");setErr("");}}>{lang==="zh"?"立即註冊":"Register"}</span></p>
                </div>
              )}
              {custTab==="register"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div><FL label={lang==="zh"?"姓名 *":"Name *"}/><input className="inp" value={cName} onChange={e=>setCName(e.target.value)}/></div>
                  <div>
                    <FL label={lang==="zh"?"手機號碼 *":"Phone Number *"}/>
                    <input className="inp" type="tel" value={cPhone} onChange={e=>setCPhone(e.target.value)} placeholder="+27..."/>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>
                      {lang==="zh"?"請輸入完整電話號碼（最少9位數字）":"Full number required (min 9 digits)"}
                    </div>
                  </div>
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
        <ShopLogo settings={_settings} size="md"/>
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
  const [supplierPartNo,setSupplierPartNo]=useState("");
  const [done,setDone]=useState(false);const [err,setErr]=useState("");
  useEffect(()=>{
    api.get("inquiries",`rfq_token=eq.${token}&select=*`).then(async r=>{
      if(Array.isArray(r)&&r.length>0){
        const rec=r[0];
        setInq(rec);
        // 1. If inquiry already has a part no from a previous reply, use that
        if(rec.supplier_part_no){
          setSupplierPartNo(rec.supplier_part_no);
        }
        // 2. Otherwise look up part_suppliers table for this supplier's known part no
        else if(rec.part_id && rec.supplier_id){
          try {
            const ps = await api.get("part_suppliers",
              `part_id=eq.${rec.part_id}&supplier_id=eq.${rec.supplier_id}&select=supplier_part_no`
            );
            if(Array.isArray(ps)&&ps[0]?.supplier_part_no){
              setSupplierPartNo(ps[0].supplier_part_no);
            }
          } catch{}
        }
      } else setErr("Inquiry not found or expired");
      setLoaded(true);
    });
  },[]);
  const submit = async()=>{
    if(!rp&&!rs){setErr("Enter price or stock");return;}
    await api.patch("inquiries","rfq_token",token,{
      reply_price:rp?+rp:null, reply_stock:rs?+rs:null,
      reply_notes:rn, supplier_part_no:supplierPartNo,
      status:"replied", replied_at:new Date().toISOString()
    });
    // Auto-update part_suppliers with supplier's part number if provided
    // Uses dual-condition PATCH (part_id + supplier_id)
    if(supplierPartNo && inq.part_id && inq.supplier_id){
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/part_suppliers?part_id=eq.${inq.part_id}&supplier_id=eq.${inq.supplier_id}`,
          {
            method:"PATCH",
            headers:{
              apikey:SUPABASE_KEY,
              Authorization:`Bearer ${SUPABASE_KEY}`,
              "Content-Type":"application/json",
              Prefer:"return=representation"
            },
            body:JSON.stringify({
              supplier_part_no:supplierPartNo,
              last_price:rp?+rp:null,
              last_reply_date:new Date().toISOString().slice(0,10)
            })
          }
        );
      } catch{}
    }
    setDone(true);
  };
  return (
    <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{textAlign:"center",marginBottom:24}}><ShopLogo settings={_settings} size="md"/><div style={{color:"var(--text3)",fontSize:12,marginTop:3}}>Supplier Quotation Portal</div></div>
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
              {/* Part details from inquiry */}
              <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:16,border:"1px solid var(--border)"}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:9}}>Part Details</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 14px",fontSize:13}}>
                  {[
                    ["Part",inq.part_name],
                    ["SKU",inq.part_sku||"—"],
                    ["OE#",inq.part_oe_number||"—"],
                    ["Fitment",[inq.part_make,inq.part_model,inq.part_year].filter(Boolean).join(" / ")||"—"],
                    ["Qty Required",inq.qty_requested],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",gap:6}}>
                      <span style={{color:"var(--text3)",minWidth:60,flexShrink:0,fontSize:12}}>{k}</span>
                      <span style={{fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <FD>
                <FL label="Your Part Number / Reference *"/>
                <input className="inp" value={supplierPartNo} onChange={e=>setSupplierPartNo(e.target.value)}
                  placeholder="Your internal part number or reference code"
                  style={{fontFamily:"DM Mono,monospace",borderColor:supplierPartNo?"rgba(52,211,153,.5)":"var(--border)"}}/>
                {supplierPartNo
                  ? <div style={{fontSize:12,color:"var(--green)",marginTop:4}}>✓ Pre-filled from our records — please confirm or update if needed</div>
                  : <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>Please enter your part number — it will be saved for future orders</div>}
              </FD>
              <FG>
                <div><FL label="Your Price *"/><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="0"/></div>
                <div><FL label="Available Stock *"/><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)}/></div>
              </FG>
              <FD><FL label="Notes (lead time, MOQ, conditions...)"/><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)} placeholder="e.g. 7 days lead time, min order 10pcs..."/></FD>
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
  const rfqQuoteToken = new URLSearchParams(window.location.search).get("rfq_quote");
  if(rfqQuoteToken) return <RfqQuoteReplyPage token={rfqQuoteToken}/>;
  const wsqToken = new URLSearchParams(window.location.search).get("wsq");
  if(wsqToken) return <QuoteConfirmPage token={wsqToken}/>;
  if(!settingsLoaded) return <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{color:"var(--accent)",fontSize:15,fontWeight:600}}>⚙ Loading...</div></div>;
  if(!user) return <LoginPage onLogin={setUser} t={t} lang={lang} setLang={changeLang} loadedSettings={_settings}/>;
  if(!canAccess(user)) return <PaywallPage user={user} onLogout={()=>setUser(null)} lang={lang}/>;
  return <MainApp user={user} onLogout={()=>setUser(null)} t={t} lang={lang} setLang={changeLang}/>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
function MainApp({user,onLogout,t,lang,setLang}) {
  _currentLang = lang; // sync for tSt
  const role = user.role;
  const initTab = role==="customer"?"shop":role==="shipper"?"orders":role==="stockman"?"inventory":role==="manager"?"stocktake":"dashboard";
  const [tab,setTab] = useState(initTab);
  // Data
  const [parts,setParts]=useState([]);
  const [orders,setOrders]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [users,setUsers]=useState([]);
  const [logs,setLogs]=useState([]);
  const [logSearch,setLogSearch]=useState("");
  const [loginLogs,setLoginLogs]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [partSuppliers,setPartSuppliers]=useState([]);
  const [inquiries,setInquiries]=useState([]);
  const [supplierInvoices,setSupplierInvoices]=useState([]);
  const [customerInvoices,setCustomerInvoices]=useState([]);
  const [supplierReturns,setSupplierReturns]=useState([]);
  const [customerReturns,setCustomerReturns]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [partFitments,setPartFitments]=useState([]);
  const [payments,setPayments]=useState([]);
  const [rfqSessions,setRfqSessions]=useState([]);
  const [rfqItems,setRfqItems]=useState([]);
  const [rfqQuotes,setRfqQuotes]=useState([]);
  const [stockMoves,setStockMoves]=useState([]);
  const [stockTakes,setStockTakes]=useState([]);
  const [settings,setSettings]=useState(getSettings());
  // Sync settings state from _settings cache after it loads from DB
  useEffect(()=>{ setSettings({...getSettings()}); },[]);
  const [loading,setLoading]=useState(true);
  const [cart,setCart]=useState([]);
  // Filters
  const [searchPart,setSearchPart]=useState("");
  const [searchDebounced,setSearchDebounced]=useState("");
  const [filterCat,setFilterCat]=useState("__all__");
  const [filterLow,setFilterLow]=useState(false);
  const [invPage,setInvPage]=useState(0);   // inventory page
  const [shopPage,setShopPage]=useState(0); // shop page
  const PAGE_SIZE=20;
  const [filterOS,setFilterOS]=useState(role==="shipper"?"__active__":"__all__");
  const [vehicleFilterIds,setVehicleFilterIds]=useState(null);
  const [workshopJobs,setWorkshopJobs]=useState([]);
  const [workshopJobItems,setWorkshopJobItems]=useState([]);
  const [workshopInvoices,setWorkshopInvoices]=useState([]);
  const [workshopQuotes,setWorkshopQuotes]=useState([]);
  const [workshopCustomers,setWorkshopCustomers]=useState([]);
  const [workshopVehicles,setWorkshopVehicles]=useState([]);
  const [workshopStock,setWorkshopStock]=useState([]);
  const [workshopServices,setWorkshopServices]=useState([]); // null=no filter, Set=filtered part ids
  const [completedDays,setCompletedDays]=useState(7); // filter completed orders to last N days
  const [searchCust,setSearchCust]=useState("");
  const [toast,setToast]=useState(null);
  const [lightbox,setLightbox]=useState(null);

  // Debounce search input — only filter after 250ms of no typing
  useEffect(()=>{
    const t=setTimeout(()=>{ setSearchDebounced(searchPart); setInvPage(0); },250);
    return()=>clearTimeout(t);
  },[searchPart]);

  // Reset page when filters change
  useEffect(()=>{ setInvPage(0); },[filterCat,filterLow]);
  useEffect(()=>{ setShopPage(0); },[searchPart]);
  // Modals
  const [M,setM]=useState({});
  const openM=(k,data)=>setM(p=>({...p,[k]:{open:true,data:data??null}}));
  const closeM=(k)=>setM(p=>({...p,[k]:{open:false,data:null}}));
  const isOpen=(k)=>M[k]?.open===true;
  const mData=(k)=>M[k]?.data??null;

  // ── Record Locking ──────────────────────────────────────────
  const [locks,setLocks]=useState({}); // { "part:123": {locked_by_name, locked_at} }
  const myLocks=useRef(new Set()); // track locks I own so I can release them

  const acquireLock=async(type,id)=>{
    if(!id)return true;
    const lockId=`${type}:${id}`;
    const expires=new Date(Date.now()+5*60*1000).toISOString(); // 5 min
    try{
      // Check if already locked by someone else
      const existing=await api.get("record_locks",`record_type=eq.${type}&record_id=eq.${id}&select=*`);
      if(Array.isArray(existing)&&existing.length>0){
        const lock=existing[0];
        const expired=new Date(lock.expires_at)<new Date();
        if(!expired&&lock.locked_by!==user.username){
          showToast(`🔒 Locked by ${lock.locked_by_name||lock.locked_by}`, "err");
          return false; // blocked
        }
      }
      // Acquire/renew lock
      await api.upsert("record_locks",{
        id:lockId, record_type:type, record_id:String(id),
        locked_by:user.username, locked_by_name:user.name||user.username,
        locked_at:new Date().toISOString(), expires_at:expires
      });
      myLocks.current.add(lockId);
      await refreshLocks();
      return true;
    }catch{ return true; } // fail open — don't block if table missing
  };

  const releaseLock=async(type,id)=>{
    if(!id)return;
    const lockId=`${type}:${id}`;
    try{ await api.delete("record_locks","id",lockId); myLocks.current.delete(lockId); await refreshLocks(); }catch{}
  };

  const refreshLocks=async()=>{
    try{
      const r=await api.get("record_locks","select=*");
      if(Array.isArray(r)){
        const now=new Date();
        const active={};
        r.forEach(l=>{
          if(new Date(l.expires_at)>now&&l.locked_by!==user.username)
            active[`${l.record_type}:${l.record_id}`]=l;
        });
        setLocks(active);
      }
    }catch{}
  };

  const isLocked=(type,id)=>locks[`${type}:${id}`];

  // Refresh locks every 30s and release on unmount
  useEffect(()=>{
    refreshLocks();
    const t=setInterval(refreshLocks,30000);
    return()=>{
      clearInterval(t);
      // Release all my locks on unmount
      myLocks.current.forEach(lockId=>{
        try{ api.delete("record_locks","id",lockId); }catch{}
      });
    };
  },[]);

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  const logInv=async(part,before,after,action,reason="")=>{
    await api.upsert("inventory_logs",{part_id:part.id,part_name:part.name,part_sku:part.sku,action,qty_before:before,qty_after:after,changed_by:user.name||user.username,reason});
  };

  const loadAll=useCallback(async()=>{
    setLoading(true);
    // FAST: load critical data first so UI shows quickly
    const [p,o,s,ps,st]=await Promise.all([
      api.get("parts","select=*&order=id.asc"),
      api.get("orders","select=*&order=created_at.desc"),
      api.get("suppliers","select=*&order=name.asc"),
      api.get("part_suppliers","select=*"),
      api.get("settings","id=eq.1&select=*"),
    ]);
    setParts(Array.isArray(p)?p:[]);
    setOrders(Array.isArray(o)?o:[]);
    setSuppliers(Array.isArray(s)?s:[]);
    setPartSuppliers(Array.isArray(ps)?ps:[]);
    if(Array.isArray(st)&&st[0]){
      const ns={..._settings,...st[0]};
      _settings=ns; // update global cache — used by ShopLogo on login page
      setSettings(ns);
      // Also refresh categories from DB
      try{ if(st[0].categories){ const c=typeof st[0].categories==="string"?JSON.parse(st[0].categories):st[0].categories; if(Array.isArray(c)&&c.length) _settings.categories=st[0].categories; } }catch{}
    }
    setLoading(false); // ← show UI immediately after critical data

    // LAZY: load secondary data in background
    const [c,u,l,ll,inq,si,ci,sr,cr,veh,fit,py,...rest]=await Promise.all([
      api.get("customers","select=*&order=total_spent.desc"),
      api.get("users","select=*&order=id.asc"),
      api.get("inventory_logs","select=*&order=created_at.desc&limit=200"),
      api.get("login_logs","select=*&order=created_at.desc&limit=200"),
      api.get("inquiries","select=*&order=created_at.desc"),
      api.get("supplier_invoices","select=*&order=created_at.desc"),
      api.get("customer_invoices","select=*&order=created_at.desc"),
      api.get("supplier_returns","select=*&order=created_at.desc"),
      api.get("customer_returns","select=*&order=created_at.desc"),
      api.get("vehicles","select=*&order=make.asc,model.asc,year_from.asc").catch(()=>[]),
      api.get("part_fitments","select=*").catch(()=>[]),
      api.get("payments","select=*&order=payment_date.desc").catch(()=>[]),
      api.get("rfq_sessions","select=*&order=created_at.desc").catch(()=>[]),
      api.get("rfq_items","select=*").catch(()=>[]),
      api.get("rfq_quotes","select=*&order=created_at.desc").catch(()=>[]),
      api.get("stock_moves","select=*&order=moved_at.desc&limit=200").catch(()=>[]),
      api.get("stock_takes","select=*&order=created_at.desc").catch(()=>[]),
      api.get("workshop_jobs","select=*&order=date_in.desc").catch(()=>[]),
      api.get("workshop_job_items","select=*").catch(()=>[]),
      api.get("workshop_invoices","select=*&order=invoice_date.desc").catch(()=>[]),
      api.get("workshop_quotes","select=*&order=quote_date.desc").catch(()=>[]),
      api.get("workshop_customers","select=*&order=name.asc").catch(()=>[]),
      api.get("workshop_vehicles","select=*&order=reg.asc").catch(()=>[]),
    ]);
    setCustomers(Array.isArray(c)?c:[]);
    setUsers(Array.isArray(u)?u:[]);
    setLogs(Array.isArray(l)?l:[]);
    setLoginLogs(Array.isArray(ll)?ll:[]);
    setInquiries(Array.isArray(inq)?inq:[]);
    setSupplierInvoices(Array.isArray(si)?si:[]);
    setCustomerInvoices(Array.isArray(ci)?ci:[]);
    setSupplierReturns(Array.isArray(sr)?sr:[]);
    setCustomerReturns(Array.isArray(cr)?cr:[]);
    setVehicles(Array.isArray(veh)?veh:[]);
    setPartFitments(Array.isArray(fit)?fit:[]);
    setPayments(Array.isArray(py)?py:[]);
    // rest[] order: rest[0]=rfq_sessions, rest[1]=rfq_items, rest[2]=rfq_quotes, rest[3]=stock_moves, rest[4]=stock_takes
    setRfqSessions(Array.isArray(rest[0])?rest[0]:[]);
    setRfqItems(Array.isArray(rest[1])?rest[1]:[]);
    setRfqQuotes(Array.isArray(rest[2])?rest[2]:[]);
    setStockMoves(Array.isArray(rest[3])?rest[3]:[]);
    setStockTakes(Array.isArray(rest[4])?rest[4]:[]);
    setWorkshopJobs(Array.isArray(rest[5])?rest[5]:[]);
    setWorkshopJobItems(Array.isArray(rest[6])?rest[6]:[]);
    setWorkshopInvoices(Array.isArray(rest[7])?rest[7]:[]);
    setWorkshopQuotes(Array.isArray(rest[8])?rest[8]:[]);
    setWorkshopCustomers(Array.isArray(rest[9])?rest[9]:[]);
    setWorkshopVehicles(Array.isArray(rest[10])?rest[10]:[]);
  },[]);

  // Silent workshop-only refresh — does NOT set loading=true so WorkshopPage stays mounted
  const refreshWorkshopData=useCallback(async()=>{
    const [jobs,items,invoices,quotes,wsCustomers,wsVehicles,wsStock,wsServices]=await Promise.all([
      api.get("workshop_jobs","select=*&order=date_in.desc").catch(()=>[]),
      api.get("workshop_job_items","select=*").catch(()=>[]),
      api.get("workshop_invoices","select=*&order=invoice_date.desc").catch(()=>[]),
      api.get("workshop_quotes","select=*&order=quote_date.desc").catch(()=>[]),
      api.get("workshop_customers","select=*&order=name.asc").catch(()=>[]),
      api.get("workshop_vehicles","select=*&order=reg.asc").catch(()=>[]),
      api.get("workshop_stock","select=*&order=name.asc").catch(()=>[]),
      api.get("workshop_services","select=*&order=name.asc").catch(()=>[]),
    ]);
    setWorkshopJobs(Array.isArray(jobs)?jobs:[]);
    setWorkshopJobItems(Array.isArray(items)?items:[]);
    setWorkshopInvoices(Array.isArray(invoices)?invoices:[]);
    setWorkshopQuotes(Array.isArray(quotes)?quotes:[]);
    setWorkshopCustomers(Array.isArray(wsCustomers)?wsCustomers:[]);
    setWorkshopVehicles(Array.isArray(wsVehicles)?wsVehicles:[]);
    setWorkshopStock(Array.isArray(wsStock)?wsStock:[]);
    setWorkshopServices(Array.isArray(wsServices)?wsServices:[]);
  },[]);

  // Sync Apps Script URL to window whenever settings changes
  useEffect(()=>{ window._APPS_SCRIPT_URL = settings?.apps_script_url || ""; },[settings?.apps_script_url]);
  useEffect(()=>{
    window._APPS_SCRIPT_URL    = settings?.apps_script_url    || "";
    window._VEHICLE_SCRIPT_URL = settings?.vehicle_script_url || "";
    console.log("Scripts synced - Parts:", (settings?.apps_script_url||"").slice(0,40), "Vehicle:", (settings?.vehicle_script_url||"").slice(0,40));
  },[settings?.apps_script_url, settings?.vehicle_script_url]);

  // Track if any modal is open — pause refresh when busy
  // Use a ref to track modal state — avoids stale closure problem
  const modalOpenRef = useRef(false);
  useEffect(()=>{
    modalOpenRef.current = Object.values(M).some(v=>v?.open===true);
  },[M]);

  // Track last user interaction time
  const lastActivityRef = useRef(Date.now());
  // Track current tab — pause refresh during stock count
  const tabRef = useRef(tab);
  useEffect(()=>{ tabRef.current = tab; },[tab]);

  const isBusy = () =>
    modalOpenRef.current ||
    tabRef.current === "stocktake" ||   // always pause when on stock take
    tabRef.current === "stockmove" ||   // always pause when on stock move
    tabRef.current === "picking" ||     // always pause when picking orders
    tabRef.current === "vehicles" ||    // always pause when managing vehicles
    tabRef.current === "workshop" ||    // always pause on workshop
    tabRef.current === "wscustomers" ||
    tabRef.current === "wsquotations" ||
    tabRef.current === "wsinvoices" ||
    tabRef.current === "wspayments" ||
    tabRef.current === "wsstatement" ||
    tabRef.current === "wsreport" ||
    (Date.now() - lastActivityRef.current) < 8000;

  useEffect(()=>{
    loadAll();

    // Mark user active on any interaction
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    ["mousedown","keydown","touchstart","input","scroll"].forEach(e=>
      document.addEventListener(e, onActivity, {passive:true})
    );

    // Auto-refresh every 60s — only when user is idle AND no modal open
    const interval = setInterval(()=>{
      if(isBusy()) return;
      loadAll();
    }, 60000);

    // On tab/window focus — only refresh if user was away AND not busy
    const onFocus = () => {
      if(isBusy()) return; // editing — don't interrupt
      loadAll();
    };
    window.addEventListener("focus", onFocus);

    // On visibility change (phone wake, alt+tab back)
    const onVisible = () => {
      if(document.visibilityState==="visible" && !isBusy()) loadAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    // ── Back button trap (mobile) ──────────────────────────────
    // Push a dummy history entry so back button doesn't close the app
    // Instead: close modal → clear search → go to dashboard
    window.history.pushState({app:true}, "");
    const onPopState = (e) => {
      // Always push again to keep trapping
      window.history.pushState({app:true}, "");
      // Priority: close modal first, then clear search, then go to dashboard
      const anyOpen = Object.values(M).some(v=>v?.open===true);
      if(anyOpen){
        setM({}); // close all modals
      } else if(searchPart){
        setSearchPart("");
      } else if(tab !== "dashboard" && tab !== "shop" && tab !== "inventory"){
        setTab(role==="customer"?"shop":role==="stockman"?"inventory":"dashboard");
      }
      // else: already on home tab — do nothing (don't exit)
    };
    window.addEventListener("popstate", onPopState);

    return ()=>{
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("popstate", onPopState);
      ["mousedown","keydown","touchstart","input","scroll"].forEach(e=>
        document.removeEventListener(e, onActivity)
      );
    };
  },[]);

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
    const orderObj={id:oid,customer_name:form.name,customer_phone:form.phone,customer_email:form.email||"",date:today(),status:"Processing",items:cart.map(i=>({partId:i.id,qty:i.qty,name:i.name,price:i.price})),total:cartTotal};
    await api.upsert("orders",orderObj);
    // NO stock deduction on order — stock deducted when shipper sets 待出貨
    const ex=customers.find(c=>c.phone===form.phone);
    if(ex) await api.patch("customers","phone",form.phone,{orders:ex.orders+1,total_spent:ex.total_spent+cartTotal});
    else await api.upsert("customers",{name:form.name,phone:form.phone,email:form.email||"",address:form.address||"",orders:1,total_spent:cartTotal});
    await loadAll();setCart([]);closeM("checkout");
    openM("orderConfirm",{order:orderObj,phone:form.phone,email:form.email||""});
    setTab(role==="customer"?"myorders":"orders");
  };

  const updateOrderStatus=async(id,ns)=>{
    const o=orders.find(o=>o.id===id);if(!o)return;
    const prev=o.status;

    // 處理中 → 待出貨 : DEDUCT stock (picker confirmed items)
    if(prev!=="Ready to Ship"&&ns==="Ready to Ship"&&Array.isArray(o.items)){
      for(const item of o.items){
        const p=parts.find(p=>p.id===item.partId);
        if(p){const ns2=Math.max(0,p.stock-item.qty);await api.patch("parts","id",item.partId,{stock:ns2});await logInv(p,p.stock,ns2,"Picked",id);}
      }
      showToast("✅ Stock deducted — ready to ship");
    }
    // → 已取消 : RESTORE stock (only if was already deducted i.e. was 待出貨 or 已完成)
    else if(ns==="Cancelled"&&(prev==="Ready to Ship"||prev==="Completed")&&Array.isArray(o.items)){
      for(const item of o.items){
        const p=parts.find(p=>p.id===item.partId);
        if(p){await api.patch("parts","id",item.partId,{stock:p.stock+item.qty});await logInv(p,p.stock,p.stock+item.qty,"Cancel Restore",id);}
      }
      showToast("Cancelled — stock restored","err");
    }
    // 已取消 → restore back to active (re-deduct)
    else if(prev==="Cancelled"&&ns==="Ready to Ship"&&Array.isArray(o.items)){
      for(const item of o.items){
        const p=parts.find(p=>p.id===item.partId);
        if(p){const ns2=Math.max(0,p.stock-item.qty);await api.patch("parts","id",item.partId,{stock:ns2});await logInv(p,p.stock,ns2,"Re-Picked",id);}
      }
      showToast("Order restored & stock deducted");
    }
    else showToast("Status updated");

    await api.patch("orders","id",id,{status:ns});await loadAll();
  };

  // Parts
  const savePart=async(data)=>{
    const ep=mData("editPart");
    if(ep){
      const d2={...data,image_url:toSaveUrl(data.image_url)};
      await api.patch("parts","id",ep.id,d2);
      if(ep.stock!==d2.stock)await logInv({...ep,...d2},ep.stock,d2.stock,"Edit Part","Admin edit");
      showToast("Part updated");
      await releaseLock("part",ep.id); // release lock on save
      await loadAll();closeM("editPart");
      // Stay on same page and scroll back to the edited row
      setTimeout(()=>{
        const el=document.getElementById(`part-row-${ep.id}`);
        if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.style.transition="background .5s"; el.style.background="rgba(251,146,60,.15)"; setTimeout(()=>el.style.background="",1500); }
      },300);
    } else {
      const d2={...data,image_url:toSaveUrl(data.image_url)};
      const r=await api.upsert("parts",d2);
      await logInv(Array.isArray(r)?r[0]:d2,0,d2.stock,"New Part","Added");
      showToast("Part added");
      await loadAll();closeM("editPart");
    }
  };
  // ── Workshop ──
  const saveWorkshopJob=async(data)=>{
    const chk=(r,label)=>{ if(r&&!Array.isArray(r)&&r.message){ throw new Error(`${label}: ${r.message}`); } return r; };
    try {
      let d={...data};
      // Auto-create workshop_customer if not linked yet
      if(!d.workshop_customer_id && d.customer_name?.trim()){
        const custId=makeId("WSC");
        chk(await api.insert("workshop_customers",{id:custId,name:d.customer_name.trim(),phone:d.customer_phone||"",email:d.customer_email||""}),"Save customer");
        d.workshop_customer_id=custId;
      }
      // Auto-create workshop_vehicle if not linked yet
      if(!d.workshop_vehicle_id && d.vehicle_reg?.trim()){
        const vehId=makeId("WSV");
        chk(await api.insert("workshop_vehicles",{id:vehId,workshop_customer_id:d.workshop_customer_id||null,reg:d.vehicle_reg.trim(),make:d.vehicle_make||"",model:d.vehicle_model||"",year:d.vehicle_year||"",color:d.vehicle_color||"",vin:d.vin||"",engine_no:d.engine_no||""}),"Save vehicle");
        d.workshop_vehicle_id=vehId;
      }
      // Build job record — empty strings → null so Supabase doesn't choke on typed columns
      const str=v=>v?.toString().trim()||null;
      const int=v=>v?parseInt(v,10)||null:null;
      const jobRow={
        workshop_customer_id:d.workshop_customer_id||null,
        workshop_vehicle_id:d.workshop_vehicle_id||null,
        customer_name:str(d.customer_name),
        customer_phone:str(d.customer_phone),
        vehicle_reg:str(d.vehicle_reg),
        vehicle_make:str(d.vehicle_make),
        vehicle_model:str(d.vehicle_model),
        vehicle_year:int(d.vehicle_year),
        vehicle_color:str(d.vehicle_color),
        vin:str(d.vin),
        engine_no:str(d.engine_no),
        mileage:int(d.mileage),
        complaint:str(d.complaint),
        diagnosis:str(d.diagnosis),
        mechanic:str(d.mechanic),
        date_in:str(d.date_in)||new Date().toISOString().slice(0,10),
        date_out:str(d.date_out),
        status:d.status||"Pending",
        return_reason:str(d.return_reason),
        parent_job_id:d.parent_job_id||null,
      };
      let savedId=d.id;
      if(d.id){ chk(await api.patch("workshop_jobs","id",d.id,jobRow),"Update job"); }
      else { savedId=makeId("JOB"); chk(await api.insert("workshop_jobs",{...jobRow, id:savedId}),"Create job"); }

      // Save/upload condition photos captured during job creation (fire-and-forget)
      const allPhotoEntries=[
        {field:"photo_front",viewName:"front",data:d.photo_front},
        {field:"photo_rear", viewName:"rear", data:d.photo_rear},
        {field:"photo_side", viewName:"side", data:d.photo_side},
      ].filter(p=>p.data);
      const driveUrlEntries = allPhotoEntries.filter(p=>!p.data.startsWith("data:"));
      const uploadEntries   = allPhotoEntries.filter(p=>p.data.startsWith("data:"));
      if(allPhotoEntries.length&&d.workshop_vehicle_id){
        const vehId=d.workshop_vehicle_id;
        // Drive URLs selected from picker — save directly to vehicle record
        if(driveUrlEntries.length){
          const patch={};
          driveUrlEntries.forEach(p=>{ patch[p.field]=p.data; });
          try{ await api.patch("workshop_vehicles","id",vehId,patch); }catch{}
        }
        // data: URLs — resize + upload to Drive, then save URL
        const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
        if(uploadEntries.length&&SCRIPT_URL){
          (async()=>{
            const _n=new Date(),_p=n=>String(n).padStart(2,"0");
            const _date=`${_n.getFullYear()}-${_p(_n.getMonth()+1)}-${_p(_n.getDate())}`;
            const _dt=`${_date.replace(/-/g,"")}_${_p(_n.getHours())}${_p(_n.getMinutes())}${_p(_n.getSeconds())}`;
            const _plate=(d.vehicle_reg||vehId).replace(/\s/g,"").toUpperCase();
            const folderPath="Tim_Car_Phot/"+_plate+"/"+_date;
            try{ await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"createFolder",folderPath})}); }catch{}
            for(const p of uploadEntries){
              try{
                const resized=await new Promise((res,rej)=>{
                  const img=new Image();
                  img.onload=()=>{
                    const MAX=800; const canvas=document.createElement("canvas");
                    let w=img.width,h=img.height;
                    if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
                    canvas.width=w;canvas.height=h;
                    canvas.getContext("2d").drawImage(img,0,0,w,h);
                    res(canvas.toDataURL("image/png"));
                  };
                  img.onerror=rej; img.src=p.data;
                });
                const filename=_dt+"_"+p.viewName+".png";
                const r=await(await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:resized,filename,mimeType:"image/png",folderPath})})).json();
                if(r.success) await api.patch("workshop_vehicles","id",vehId,{[p.field]:r.url});
              }catch{}
            }
            await refreshWorkshopData();
          })();
        }
      }

      await refreshWorkshopData(); showToast("Job saved");
      return savedId;
    } catch(e){ alert("Save failed: "+e.message); }
  };
  const deleteWorkshopJob=async(id)=>{
    await api.delete("workshop_jobs","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const saveJobItem=async(item)=>{
    // Strip client-only fields not in the DB schema
    const {part_id, ws_stock_id, id, ...dbItem} = item;
    let res;
    if(id){
      res=await api.patch("workshop_job_items","id",id,dbItem);
    } else {
      res=await api.insert("workshop_job_items",dbItem);
      // Deduct from workshop stock when adding a part to a job
      if(ws_stock_id && item.type==="part"){
        const wsi=workshopStock.find(w=>w.id===ws_stock_id);
        if(wsi){
          const nq=Math.max(0,(+wsi.qty||0)-(+item.qty||1));
          await api.patch("workshop_stock","id",ws_stock_id,{qty:nq});
          await api.insert("workshop_stock_moves",{
            id:makeId("WSM"),stock_id:ws_stock_id,stock_name:wsi.name,
            move_type:"job_use",qty_change:-(+item.qty||1),qty_after:nq,
            reference:item.job_id,notes:`Used in job ${item.job_id}`,
            moved_at:new Date().toISOString(),
          });
        }
      }
    }
    if(res&&!Array.isArray(res)&&res.message) throw new Error(res.message);
    await refreshWorkshopData();
  };
  const deleteJobItem=async(id)=>{
    await api.delete("workshop_job_items","id",id);
    await refreshWorkshopData();
  };
  const saveWorkshopInvoice=async(inv)=>{
    const {id,...rest}=inv;
    const payload={...rest, id:id||makeId("WSI")};
    console.log("[saveWorkshopInvoice] inserting:", payload);
    let res;
    try{
      const r=await fetch(`${SUPABASE_URL}/rest/v1/workshop_invoices`,{
        method:"POST",
        headers:H({Prefer:"return=representation"}),
        body:JSON.stringify(payload),
      });
      const text=await r.text();
      console.log("[saveWorkshopInvoice] status:", r.status, "body:", text);
      res=text?JSON.parse(text):null;
      if(!r.ok){
        const msg=res?.message||res?.error||text||`HTTP ${r.status}`;
        const detail=res?.details?`\nDetails: ${res.details}`:"";
        const hint=res?.hint?`\nHint: ${res.hint}`:"";
        throw new Error(`${msg}${detail}${hint}`);
      }
    }catch(e){
      if(e.message.startsWith("HTTP ")||e.message.includes("\n")||e.message.includes("Details")){
        throw e;
      }
      throw new Error("Network/parse error: "+e.message);
    }
    await api.patch("workshop_jobs","id",inv.job_id,{status:"Done"});
    await refreshWorkshopData(); showToast("Invoice created");
  };
  const updateWorkshopInvoice=async(id,data)=>{
    const res=await api.patch("workshop_invoices","id",id,data);
    if(res&&!Array.isArray(res)&&res.message) throw new Error(res.message);
    await refreshWorkshopData(); showToast("Invoice updated");
  };
  const deleteWorkshopInvoice=async(id,jobId)=>{
    await api.delete("workshop_invoices","id",id);
    if(jobId) await api.patch("workshop_jobs","id",jobId,{status:"In Progress"});
    await refreshWorkshopData(); showToast("Invoice deleted","err");
  };
  const saveWorkshopQuote=async(q)=>{
    const {id,...rest}=q;
    if(id){ await api.patch("workshop_quotes","id",id,rest); showToast("Quote updated"); }
    else { await api.insert("workshop_quotes",{...rest,id:makeId("WSQ")}); showToast("Quote created"); }
    await refreshWorkshopData();
  };
  const sendQuoteForApproval=async(quoteId)=>{
    const token=makeToken();
    await api.patch("workshop_quotes","id",quoteId,{confirm_token:token,confirm_status:"pending"});
    await refreshWorkshopData();
    return token;
  };
  const deleteWorkshopQuote=async(id)=>{
    await api.delete("workshop_quotes","id",id);
    await refreshWorkshopData(); showToast("Quote deleted","err");
  };
  const convertQuoteToInvoice=async(quote,job,subtotal,tax,total)=>{
    const invId=makeId("WSI");
    await api.insert("workshop_invoices",{
      id:invId, job_id:job.id,
      invoice_customer:quote.quote_customer, inv_phone:quote.quote_phone, inv_email:quote.quote_email,
      vehicle_reg:job.vehicle_reg||"",
      invoice_date:new Date().toISOString().slice(0,10),
      due_date:quote.valid_until||"",
      subtotal, tax, total, status:"unpaid",
      notes:`Converted from Quote ${quote.id}${quote.notes?"\n"+quote.notes:""}`,
    });
    await api.patch("workshop_quotes","id",quote.id,{status:"converted"});
    await api.patch("workshop_jobs","id",job.id,{status:"Done"});
    await refreshWorkshopData(); showToast("Invoice created from quote");
  };
  const saveWorkshopCustomer=async(data)=>{
    const {id,...rest}=data;
    if(id){ await api.patch("workshop_customers","id",id,rest); }
    else { await api.insert("workshop_customers",{...data, id:makeId("WSC")}); }
    await refreshWorkshopData(); showToast("Customer saved");
  };
  const deleteWorkshopCustomer=async(id)=>{
    await api.delete("workshop_customers","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const saveWorkshopVehicle=async(data)=>{
    const {id,...rest}=data;
    if(id){ await api.patch("workshop_vehicles","id",id,rest); }
    else { await api.insert("workshop_vehicles",{...data, id:makeId("WSV")}); }
    await refreshWorkshopData(); showToast("Vehicle saved");
  };
  const deleteWorkshopVehicle=async(id)=>{
    await api.delete("workshop_vehicles","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };

  // ── Workshop Stock ────────────────────────────────────────────
  const saveWsStockItem=async(item)=>{
    const {id,...rest}=item;
    if(id){ await api.patch("workshop_stock","id",id,rest); showToast("Stock item updated"); }
    else { await api.insert("workshop_stock",{...rest,id:makeId("WSK")}); showToast("Stock item added"); }
    await refreshWorkshopData();
  };
  const deleteWsStockItem=async(id)=>{
    await api.delete("workshop_stock","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const adjustWsStock=async(item,newQty,reason)=>{
    const change=newQty-(item.qty||0);
    await api.patch("workshop_stock","id",item.id,{qty:newQty});
    await api.insert("workshop_stock_moves",{
      id:makeId("WSM"),stock_id:item.id,stock_name:item.name,
      move_type:"adjustment",qty_change:change,qty_after:newQty,
      notes:reason||"Manual adjustment",moved_at:new Date().toISOString(),
    });
    await refreshWorkshopData(); showToast(`Stock → ${newQty}`);
  };

  // ── Workshop Services ─────────────────────────────────────────
  const saveWsService=async(svc)=>{
    const {id,...rest}=svc;
    if(id){ await api.patch("workshop_services","id",id,rest); showToast("Service updated"); }
    else { await api.insert("workshop_services",{...rest,id:makeId("WSS")}); showToast("Service added"); }
    await refreshWorkshopData();
  };
  const deleteWsService=async(id)=>{
    await api.delete("workshop_services","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };

  // ── Workshop Transfer (Shop → Workshop Stock) ─────────────────
  const saveWsTransfer=async(transfer,lines)=>{
    const txId=makeId("WST");
    await api.insert("workshop_transfers",{
      id:txId,transfer_date:transfer.date,status:"completed",
      notes:transfer.notes||"",created_by:user?.name||user?.username||"",
    });
    for(const ln of lines){
      await api.insert("workshop_transfer_items",{
        id:makeId("WSTI"),transfer_id:txId,
        part_id:ln.part_id,part_name:ln.part_name,part_sku:ln.part_sku||"",
        workshop_stock_id:ln.ws_stock_id||"",workshop_stock_name:ln.ws_stock_name||"",
        qty:ln.qty,unit_cost:ln.unit_cost,total:(ln.qty||0)*(ln.unit_cost||0),
      });
      // Deduct from main shop stock
      const shopPart=parts.find(p=>p.id===ln.part_id);
      if(shopPart){
        const nq=Math.max(0,(+shopPart.stock||0)-(+ln.qty||0));
        await api.patch("parts","id",shopPart.id,{stock:nq});
      }
      // Credit workshop stock
      if(ln.ws_stock_id){
        const wsi=workshopStock.find(w=>w.id===ln.ws_stock_id);
        const nq=(+(wsi?.qty||0))+(+ln.qty||0);
        await api.patch("workshop_stock","id",ln.ws_stock_id,{qty:nq});
        await api.insert("workshop_stock_moves",{
          id:makeId("WSM"),stock_id:ln.ws_stock_id,stock_name:ln.ws_stock_name||"",
          move_type:"transfer_in",qty_change:+ln.qty,qty_after:nq,
          reference:txId,notes:`Transfer from shop: ${ln.part_name}`,
          moved_at:new Date().toISOString(),
        });
      } else {
        // Auto-create new workshop stock item
        const newId=makeId("WSK");
        await api.insert("workshop_stock",{
          id:newId,sku:ln.part_sku||"",name:ln.part_name||"",
          qty:+ln.qty,min_qty:0,unit_cost:+ln.unit_cost,unit_price:+ln.unit_cost,
        });
        await api.insert("workshop_stock_moves",{
          id:makeId("WSM"),stock_id:newId,stock_name:ln.part_name||"",
          move_type:"transfer_in",qty_change:+ln.qty,qty_after:+ln.qty,
          reference:txId,notes:`Transfer from shop: ${ln.part_name}`,
          moved_at:new Date().toISOString(),
        });
      }
    }
    await refreshWorkshopData(); await loadAll();
    showToast("Transfer completed ✅");
  };

  const saveFitment=async(partId,vehicleId,notes="")=>{
    await api.upsert("part_fitments",{part_id:partId,vehicle_id:vehicleId,notes});
    await loadAll(); showToast("Vehicle linked");
  };
  const deleteFitment=async(id)=>{
    await api.delete("part_fitments","id",id);
    await loadAll(); showToast("Removed","err");
  };
  const saveVehicle=async(v)=>{
    const {id, ...data} = v;
    if(id) await api.patch("vehicles","id",id,data);
    else await api.insert("vehicles",data);
    await loadAll(); showToast("Vehicle saved");
  };
  const deleteVehicle=async(id)=>{
    await api.delete("vehicles","id",id);
    await loadAll(); showToast("Deleted","err");
  };
  const deletePart=async(id)=>{const p=parts.find(p=>p.id===id);if(p)await logInv(p,p.stock,0,"Delete Part","Deleted");await api.delete("parts","id",id);await loadAll();showToast("Deleted","err");};
  const applyAdjust=async(part,nq,reason)=>{await api.patch("parts","id",part.id,{stock:nq});await logInv(part,part.stock,nq,"Manual Adj.",reason||"Manual");await loadAll();closeM("adjust");showToast(`Stock → ${nq}`);};

  // Suppliers
  const saveSupplier=async(data)=>{const es=mData("editSupplier");if(es)await api.patch("suppliers","id",es.id,data);else await api.upsert("suppliers",data);await loadAll();closeM("editSupplier");showToast(es?"Supplier updated":"Supplier added");};
  const deleteSupplier=async(id)=>{await api.delete("suppliers","id",id);await loadAll();showToast("Deleted","err");};
  const savePartSupplier=async(data)=>{
    // Only save columns that exist — supplier_part_no is safe after SQL migration
    const record = {
      part_id: data.part_id,
      supplier_id: data.supplier_id,
      supplier_part_no: data.supplier_part_no||"",
      supplier_price: data.supplier_price||null,
      lead_time: data.lead_time||"",
      min_order: data.min_order||1,
    };
    const res = await api.upsert("part_suppliers", record);
    if(!Array.isArray(res) && res?.code) {
      showToast(`Error saving: ${res.message||res.code}`, "err");
      return;
    }
    await loadAll();showToast("Supplier linked!");
  };
  const updatePartSupplier=async(id,data)=>{
    const res = await api.patch("part_suppliers","id",id,data);
    if(res?.code) { showToast(`Error: ${res.message||res.code}`,"err"); return; }
    await loadAll();showToast("Updated!");
  };
  const deletePartSupplier=async(id)=>{await api.delete("part_suppliers","id",id);await loadAll();showToast("Removed","err");};

  // Inquiries
  const sendInquiry=async(data)=>{
    const token=makeToken();
    // Only save columns that exist in inquiries table — strip unknown fields
    const {
      part_id, part_name, part_sku,
      part_oe_number, part_make, part_model, part_year,
      supplier_id, supplier_name, supplier_email, supplier_phone,
      qty_requested, message,
      // known_supplier_part_no is NOT a DB column — used only for message building
    } = data;
    const record = {
      id:makeId("INQ"),
      rfq_token:token,
      created_by:user.name||user.username,
      status:"pending",
      part_id, part_name, part_sku,
      part_oe_number:part_oe_number||"",
      part_make:part_make||"",
      part_model:part_model||"",
      part_year:part_year||"",
      supplier_id, supplier_name,
      supplier_email:supplier_email||"",
      supplier_phone:supplier_phone||"",
      qty_requested, message,
    };
    const res = await api.upsert("inquiries", record);
    if(!Array.isArray(res) && res?.code) {
      showToast(`Error: ${res.message||res.code}`, "err");
      return;
    }
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
    // Auto-update linked order status to Completed
    if(inv.order_id){
      await api.patch("orders","id",inv.order_id,{status:"Completed"});
    }
    await loadAll();closeM("customerInvoice");showToast("✅ Invoice created & order completed");
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
  const saveSettings=async(data)=>{
    // Include id:1 so upsert creates row if missing
    const merged = {..._settings,...settings,...data, id:1};
    await api.upsert("settings", merged);
    _settings={..._settings,...data};
    setSettings(s=>({...s,...data}));
    showToast("✅ Settings saved");
  };
  // ── RFQ functions ──────────────────────────────────────────
  const createRfqSession=async(name,deadline,selectedParts,selectedSuppliers)=>{
    const sid=makeId("RFQ");
    await api.insert("rfq_sessions",{
      id:sid, name, status:"draft", deadline:deadline||"",
      created_by:user.name||user.username, created_at:new Date().toISOString()
    });
    // Create items
    const items=selectedParts.map(p=>({
      id:makeId("RFQI"), rfq_id:sid,
      part_id:String(p.id), part_name:p.name, part_sku:p.sku||"",
      part_chinese_desc:p.chinese_desc||"", oe_number:p.oe_number||"",
      make:p.make||"", model:p.model||"", qty_needed:p.qty_needed||1
    }));
    for(const item of items) await api.insert("rfq_items",item);
    // Create quotes (one per item per supplier)
    const quotes=[];
    for(const item of items){
      for(const sup of selectedSuppliers){
        quotes.push({
          id:makeId("RFQQ"), rfq_id:sid, rfq_item_id:item.id,
          supplier_id:String(sup.id), supplier_name:sup.name,
          supplier_part_no:"", unit_price:null, stock_qty:null, lead_days:null,
          notes:"", token:makeToken(), status:"pending",
          created_at:new Date().toISOString()
        });
      }
    }
    for(const q of quotes) await api.insert("rfq_quotes",q);
    await loadAll();
    showToast(`✅ RFQ created — ${items.length} parts × ${selectedSuppliers.length} suppliers`);
    return sid;
  };

  const updateRfqStatus=async(sid,status)=>{
    await api.patch("rfq_sessions","id",sid,{status});
    await loadAll();
  };

  const selectRfqQuote=async(quoteId,rfqItemId)=>{
    // Mark this quote as selected, others for same item as not
    const itemQuotes=rfqQuotes.filter(q=>q.rfq_item_id===rfqItemId);
    for(const q of itemQuotes){
      await api.patch("rfq_quotes","id",q.id,{status:q.id===quoteId?"selected":"pending"});
    }
    await loadAll();
    showToast("✅ Quote selected");
  };

  const createPOFromRfq=async(sid)=>{
    // Get all selected quotes for this session
    const sessionItems=rfqItems.filter(i=>i.rfq_id===sid);
    const selectedQuotes=rfqQuotes.filter(q=>q.rfq_id===sid&&q.status==="selected");
    if(selectedQuotes.length===0){showToast("⚠ No quotes selected","err");return;}
    // Group by supplier
    const bySupplier={};
    for(const q of selectedQuotes){
      if(!bySupplier[q.supplier_id]) bySupplier[q.supplier_id]={supplier_id:q.supplier_id,supplier_name:q.supplier_name,quotes:[]};
      bySupplier[q.supplier_id].quotes.push(q);
    }
    // Create one PO per supplier
    for(const [sid2,data] of Object.entries(bySupplier)){
      const invId=makeId(settings.invoice_prefix||"INV");
      const lineItems=data.quotes.map(q=>{
        const item=sessionItems.find(i=>i.id===q.rfq_item_id);
        return {
          id:makeId("LI"), invoice_id:invId,
          part_id:item?.part_id||"", part_name:item?.part_name||"",
          part_sku:item?.part_sku||"", supplier_part_id:q.supplier_part_no||"",
          qty:item?.qty_needed||1, unit_cost:q.unit_price||0,
          total:(item?.qty_needed||1)*(q.unit_price||0)
        };
      });
      const total=lineItems.reduce((s,l)=>s+l.total,0);
      const inv={
        id:invId, supplier_id:+sid2, supplier_name:data.supplier_name,
        invoice_date:new Date().toISOString().slice(0,10),
        status:"unpaid", total, notes:`From RFQ ${sid}`
      };
      await api.insert("supplier_invoices",inv);
      for(const li of lineItems) await api.insert("supplier_invoice_items",li);
      // Update stock
      for(const li of lineItems){
        const p=parts.find(x=>String(x.id)===String(li.part_id));
        if(p){const ns=p.stock+li.qty;await api.patch("parts","id",p.id,{stock:ns});await logInv(p,p.stock,ns,"Stock In",`RFQ PO ${invId}`);}
      }
    }
    await api.patch("rfq_sessions","id",sid,{status:"ordered"});
    await loadAll();
    showToast(`✅ ${Object.keys(bySupplier).length} Purchase Order(s) created`);
    setTab("purchaseInvoices");
  };

  const saveStockMove=async(data)=>{
    const mv={...data, id:makeId("MV"), moved_by:user.name||user.username, moved_at:new Date().toISOString()};
    await api.insert("stock_moves", mv);
    // Update part bin_location if specified
    if(data.to_bin&&data.part_id){
      await api.patch("parts","id",data.part_id,{bin_location:data.to_bin});
    }
    await loadAll(); closeM("stockMove"); showToast("✅ Stock moved");
  };

  const startStockTake=async(name, selectedPartIds)=>{
    if(!parts||parts.length===0){
      showToast("⚠ No parts found","err"); return null;
    }
    const stId=makeId("ST");
    const st={
      id:stId, name:name||`Stock Take ${today()}`, status:"open",
      created_by:user.name||user.username, created_at:new Date().toISOString()
    };
    const stResult=await api.insert("stock_takes",st);
    if(stResult&&stResult.code){showToast("❌ "+stResult.message,"err");return null;}
    // Filter parts by selection
    const selectedParts=selectedPartIds&&selectedPartIds.length>0
      ? parts.filter(p=>selectedPartIds.includes(p.id))
      : parts;
    const items=selectedParts.map(p=>({
      id:makeId("STI"), stock_take_id:stId,
      part_id:String(p.id), part_name:p.name||"", part_sku:p.sku||"",
      bin_location:p.bin_location||"", system_qty:+(p.stock)||0,
      counted_qty:null, variance:null, counted_by:null, counted_at:null
    }));
    let inserted=0;
    for(let i=0;i<items.length;i++){
      const item=items[i];
      try{
        const r=await api.insert("stock_take_items",item);
        if(!r||!r.code) inserted++;
        else console.warn("Insert failed:",item.id, r);
      }catch(e){
        console.error("Insert error:",item.id,e);
      }
    }
    await loadAll();
    showToast(`✅ Stock take started — ${inserted} items`);
    return stId;
  };

  const saveCountedQty=async(itemId, countedQty, systemQty)=>{
    const variance=countedQty-systemQty;
    await api.patch("stock_take_items","id",itemId,{
      counted_qty:countedQty, variance,
      counted_by:user.name||user.username,
      counted_at:new Date().toISOString()
    });
  };

  const completeStockTake=async(stId, approve=false)=>{
    // Load all counted items
    const items=await api.get("stock_take_items",
      `stock_take_id=eq.${stId}&counted_qty=not.is.null&select=*`);
    if(approve && Array.isArray(items)){
      // Apply variances to actual stock
      for(const item of items){
        if(item.variance!==0){
          const part=parts.find(p=>String(p.id)===String(item.part_id));
          if(part){
            await api.patch("parts","id",part.id,{stock:item.counted_qty});
            await logInv(part,part.stock,item.counted_qty,"Stock Take",`ST ${stId}`);
          }
        }
      }
      await api.patch("stock_takes","id",stId,{
        status:"Completed",
        completed_at:new Date().toISOString()
      });
      showToast("✅ Stock take approved — inventory updated");
    } else {
      // Stockman submits — mark as counted, awaiting approval
      await api.patch("stock_takes","id",stId,{status:"Counted"});
      showToast("📦 Count submitted — awaiting manager approval");
    }
    await loadAll();
  };

  const reopenStockTake=async(stId)=>{
    await api.patch("stock_takes","id",stId,{status:"open"});
    await loadAll();
    showToast("🔄 Stock take reopened for double check");
  };

  const savePayment=async(data)=>{
    await api.upsert("payments",{...data,id:data.id||makeId("PAY"),created_by:user.name||user.username});
    // Auto-update linked invoice status to paid
    if(data.reference_id){
      if(data.type==="receipt"){
        await api.patch("customer_invoices","id",data.reference_id,{status:"paid"});
      } else if(data.type==="payment"){
        await api.patch("supplier_invoices","id",data.reference_id,{status:"paid"});
      }
    }
    await loadAll();closeM("addPayment");showToast("✅ Payment recorded & invoice marked paid");
  };
  const deletePayment=async(id)=>{await api.delete("payments","id",id);await loadAll();showToast("Deleted","err");};

  // Derived
  const CATS=lang==="en"?CATS_EN:CATS_ZH;
  const allCat="__all__",allOS="__all__";
  // Multi-word search using DEBOUNCED value — fast typing won't lag UI
  const fp=parts.filter(p=>{
    if(filterLow&&p.stock>p.min_stock)return false;
    if(filterCat!=="__all__"&&p.category!==filterCat)return false;
    if(!searchDebounced.trim())return true;
    const words=searchDebounced.trim().toLowerCase().split(" ").filter(Boolean);
    const fields=[
      p.name, p.chinese_desc, p.sku, p.brand,
      p.make, p.model, p.year_range, p.oe_number, p.category
    ].map(v=>(v||"").toLowerCase()).join(" ");
    return words.every(w=>fields.includes(w));
  });
  const fo=orders.filter(o=>{
    if(filterOS==="__all__") return true;
    if(filterOS==="__active__") return o.status==="Processing"||o.status==="Ready to Ship";
    if(filterOS==="Completed"&&completedDays>0){
      const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-completedDays);
      const orderDate=new Date(o.date||o.created_at||"2000-01-01");
      return o.status==="Completed" && orderDate>=cutoff;
    }
    return o.status===filterOS;
  });
  const myO=orders.filter(o=>o.customer_phone===user.phone||o.customer_name===user.name);
  const fc=customers.filter(c=>c.name?.includes(searchCust)||c.phone?.includes(searchCust));
  const lowStock=parts.filter(p=>p.stock<=p.min_stock);
  const totalRev=orders.filter(o=>o.status==="Completed").reduce((s,o)=>s+(o.total||0),0);
  const pendingCnt=orders.filter(o=>o.status==="Processing"||o.status==="Ready to Ship").length;
  const pendingInq=inquiries.filter(i=>i.status==="pending").length;
  const getPartSupps=(pid)=>partSuppliers.filter(ps=>ps.part_id===pid).map(ps=>({...ps,supplier:suppliers.find(s=>s.id===ps.supplier_id)}));
  const OS = role==="shipper"
    ? [
        ["__active__", lang==="zh"?"待處理":"Active"],
        ["Processing",  tSt("Processing")],
        ["Ready to Ship", tSt("Ready to Ship")],
        ["Completed",   tSt("Completed")],
        ["Cancelled",   tSt("Cancelled")],
      ]
    : [
        ["__all__",     lang==="zh"?"全部":"All"],
        ["Processing",  tSt("Processing")],
        ["Ready to Ship", tSt("Ready to Ship")],
        ["Completed",   tSt("Completed")],
        ["Cancelled",   tSt("Cancelled")],
      ];
  const sub=getSubInfo(user);

  // Grouped nav for sidebar
  const navGroups=[
    {
      id:"grp_dashboard", icon:"📊", label:lang==="zh"?"儀表板":"Dashboard", roles:["admin"],
      children:[
        {id:"dashboard",icon:"📊",label:t.dashboard,roles:["admin"]},
        {id:"loginlogs",icon:"🌍",label:t.loginLogs,roles:["admin"]},
      ]
    },
    {
      id:"grp_inventory", icon:"📦", label:lang==="zh"?"庫存管理":"Inventory", roles:["admin","manager","shipper","stockman"],
      children:[
        {id:"inventory",icon:"📦",label:t.inventory,roles:["admin","manager","shipper","stockman"],badge:lowStock.length},
        {id:"stocktake",icon:"🔢",label:t.stockTake,roles:["admin","manager","shipper","stockman"]},
        {id:"stockmove",icon:"🔀",label:t.stockMove,roles:["admin","manager","shipper","stockman"]},
        {id:"logs",icon:"📝",label:t.logs,roles:["admin","manager"]},
      ]
    },
    {
      id:"grp_purchase", icon:"🏭", label:lang==="zh"?"採購與供應商":"Purchasing", roles:["admin"],
      badge: pendingInq,
      children:[
        {id:"suppliers",icon:"🏭",label:t.suppliers,roles:["admin"]},
        {id:"rfq",icon:"📋",label:t.rfqSession,roles:["admin"]},
        {id:"inquiries",icon:"📩",label:t.inquiries,roles:["admin"],badge:pendingInq},
        {id:"purchaseInvoices",icon:"🧾",label:t.purchaseInvoices,roles:["admin"]},
        {id:"supplierReturns",icon:"↩️",label:t.supplierReturns,roles:["admin"]},
      ]
    },
    {
      id:"grp_workshop", icon:"🔧", label:lang==="zh"?"維修工場":"Workshop", roles:["admin","manager"],
      children:[
        {id:"workshop",    icon:"🔧",label:"Jobs",         roles:["admin","manager"]},
        {id:"wscustomers", icon:"👥",label:"WS Customers", roles:["admin","manager"]},
        {id:"wsquotations",icon:"📝",label:"WS Quotations",roles:["admin","manager"]},
        {id:"wsinvoices",  icon:"🧾",label:"WS Invoices",  roles:["admin","manager"]},
        {id:"wspayments",  icon:"💳",label:"WS Payments",  roles:["admin","manager"]},
        {id:"wsstock",     icon:"📦",label:"WS Stock",     roles:["admin","manager"]},
        {id:"wsservices",  icon:"🔧",label:"WS Services",  roles:["admin","manager"]},
        {id:"wstransfer",  icon:"🔄",label:"WS Transfer",  roles:["admin","manager"]},
        {id:"wsstatement", icon:"📋",label:"WS Statement", roles:["admin","manager"]},
        {id:"wsreport",    icon:"📊",label:"WS Report",    roles:["admin","manager"]},
      ]
    },
    {
      id:"grp_sales", icon:"🛒", label:lang==="zh"?"銷售與客戶":"Sales", roles:["admin","manager","shipper","customer"],
      badge: pendingCnt,
      children:[
        {id:"shop",icon:"🛒",label:t.shop,roles:["admin","customer"]},
        {id:"picking",icon:"🔍",label:t.picking,roles:["admin","shipper"],badge:pendingCnt},
        {id:"orders",icon:"📋",label:t.orders,roles:["admin","shipper"]},
        {id:"myorders",icon:"📦",label:t.myOrders,roles:["customer"]},
        {id:"salesInvoices",icon:"🧾",label:t.salesInvoices,roles:["admin","manager"]},
        {id:"customerReturns",icon:"↩️",label:t.customerReturns,roles:["admin","manager"]},
        {id:"customers",icon:"👥",label:t.customers,roles:["admin"]},
      ]
    },
    {
      id:"grp_reports", icon:"📊", label:lang==="zh"?"報表":"Reports", roles:["admin"],
      children:[
        {id:"reports",icon:"📊",label:t.reports,roles:["admin"]},
        {id:"payments",icon:"💳",label:t.payments,roles:["admin"]},
      ]
    },
    {
      id:"grp_system", icon:"⚙️", label:lang==="zh"?"系統設定":"System", roles:["admin"],
      children:[
        {id:"vehicles",icon:"🚗",label:t.vehicleMgmt||"Vehicles",roles:["admin"]},
        {id:"settings",icon:"⚙️",label:t.settings,roles:["admin"]},
        {id:"users",icon:"🔑",label:t.users,roles:["admin"]},
      ]
    },
  ].filter(g=>g.roles.includes(role)).map(g=>({
    ...g,
    children:g.children.filter(c=>c.roles.includes(role))
  })).filter(g=>g.children.length>0);

  // Flat list for mobile nav — role-based
  const mobileNav=(()=>{
    if(role==="customer") return [
      {id:"shop",    icon:"🛒",label:t.shop},
      {id:"myorders",icon:"📦",label:t.myOrders},
    ];
    if(role==="stockman") return [
      {id:"inventory",icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"stocktake",icon:"🔢",label:t.stockTake},
      {id:"stockmove",icon:"🔀",label:t.stockMove},
    ];
    if(role==="shipper") return [
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"picking",   icon:"🔍",label:t.picking},
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
    ];
    if(role==="manager") return [
      {id:"stocktake", icon:"🔢",label:t.stockTake},
      {id:"inventory", icon:"📦",label:t.inventory},
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"reports",   icon:"📊",label:t.reports},
    ];
    // admin — show most used
    return [
      {id:"dashboard", icon:"📊",label:t.dashboard},
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"shop",      icon:"🛒",label:t.shop},
      {id:"suppliers", icon:"🏭",label:t.suppliers},
    ];
  })();

  // Track which groups are expanded
  const [expandedGroups,setExpandedGroups]=useState(()=>{
    // Auto-expand the group containing current tab
    const initial={};
    navGroups.forEach(g=>{if(g.children.find(c=>c.id===initTab))initial[g.id]=true;});
    return initial;
  });
  const toggleGroup=(id)=>setExpandedGroups(p=>({...p,[id]:!p[id]}));

  // When tab changes, expand its group
  useEffect(()=>{
    navGroups.forEach(g=>{if(g.children.find(c=>c.id===tab))setExpandedGroups(p=>({...p,[g.id]:true}));});
  },[tab]);

  const navItems=navGroups.flatMap(g=>g.children); // for compatibility

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
      <style>{CSS}</style>

      {/* SIDEBAR */}
      <aside className="sidebar" style={{width:240,background:"var(--surface)",borderRight:"1px solid var(--border)",position:"fixed",height:"100vh",zIndex:50,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"18px 18px 12px"}}>
          <div style={{maxWidth:210,overflow:"hidden"}}>
            <ShopLogo settings={settings} size="sm"/>
          </div>
          <div style={{fontSize:10,color:"var(--green)",marginTop:2}}>{`🟢 ${t.connected}`}</div>
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
        <nav style={{padding:"0 7px",flex:1,overflowY:"auto",paddingBottom:6}}>
          {navGroups.map(g=>{
            const isExpanded=expandedGroups[g.id];
            const hasActiveChild=g.children.find(c=>c.id===tab);
            return (
              <div key={g.id} style={{marginBottom:2}}>
                {/* Group header */}
                <button onClick={()=>toggleGroup(g.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 10px",background:hasActiveChild?"var(--surface2)":"none",border:"none",borderRadius:9,color:hasActiveChild?"var(--text)":"var(--text3)",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600,textAlign:"left",transition:"all .18s"}}>
                  <span style={{fontSize:14}}>{g.icon}</span>
                  <span style={{flex:1,letterSpacing:".02em"}}>{g.label}</span>
                  {g.badge>0&&!isExpanded&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:99,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,padding:"0 4px"}}>{g.badge}</span>}
                  <span style={{fontSize:10,color:"var(--text3)",transition:"transform .18s",transform:isExpanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                </button>
                {/* Sub items */}
                {isExpanded&&(
                  <div style={{marginLeft:8,marginTop:1,borderLeft:"2px solid var(--surface3)",paddingLeft:8}}>
                    {g.children.map(n=>(
                      <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:tab===n.id?"var(--surface3)":"none",border:"none",borderRadius:7,color:tab===n.id?"var(--accent)":"var(--text3)",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:tab===n.id?600:400,marginBottom:1,textAlign:"left",transition:"all .18s",borderLeft:`2px solid ${tab===n.id?"var(--accent)":"transparent"}`}}>
                        <span style={{fontSize:13}}>{n.icon}</span>
                        <span style={{flex:1}}>{n.label}</span>
                        {n.badge>0&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:99,minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,padding:"0 3px"}}>{n.badge}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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

      {/* MOBILE NAV — role-based flat nav */}
      <nav className="mobile-nav">
        {mobileNav.map(n=>(
          <button key={n.id}
            className={`mob-nav-btn ${tab===n.id?"on":""}`}
            onClick={()=>setTab(n.id)}
            style={{position:"relative"}}>
            {(n.badge||0)>0&&<span className="mob-badge">{n.badge}</span>}
            <span className="mi">{n.icon}</span>
            <span style={{fontSize:9,marginTop:2,lineHeight:1.2,textAlign:"center"}}>
              {n.label.length>8?n.label.slice(0,7)+"…":n.label}
            </span>
          </button>
        ))}
        {(role==="admin"||role==="customer")&&(
          <button className="mob-nav-btn" onClick={()=>openM("checkout")} style={{position:"relative"}}>
            {cartCount>0&&<span className="mob-badge">{cartCount}</span>}
            <span className="mi">🛒</span>
            <span style={{fontSize:9,marginTop:2}}>Cart</span>
          </button>
        )}
      </nav>

      {/* MAIN CONTENT */}
      <main className="main-content" style={{marginLeft:240,padding:26,minHeight:"100vh"}}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard"&&role==="admin"&&(
          <div className="fu">
            <PH title={t.dashboard} subtitle={t.systemOverview}/>
            <div className="grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              <SC label={t.parts} value={parts.length} icon="🔩" color="var(--blue)" onClick={()=>setTab("inventory")}/>
              <SC label={t.pendingOrders} value={pendingCnt} icon="⏳" color="var(--yellow)" onClick={()=>setTab("orders")}/>
              <SC label={t.revenue} value={`${fmtAmt(totalRev)}`} icon="💰" color="var(--green)"/>
              <SC label={t.lowStock} value={lowStock.length} icon="⚠️" color="var(--red)" onClick={()=>setTab("inventory")}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
              <div className="card" style={{padding:20,gridColumn:"span 2"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em"}}>{t.recentOrders}</h3><button className="btn btn-ghost btn-xs" onClick={()=>setTab("orders")}>{t.viewAll} →</button></div>
                {orders.slice(0,5).map(o=>(
                  <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                    <div><div style={{fontSize:14,fontWeight:600}}>{o.customer_name}</div><div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{o.date}</div></div>
                    <div style={{textAlign:"right"}}><StatusBadge status={o.status}/><div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:2}}>{fmtAmt(o.total)}</div></div>
                  </div>
                ))}
              </div>
              <div className="card" style={{padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{fontSize:13,fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:".05em"}}>{`⚠ ${t.lowStockAlert}`}</h3><button className="btn btn-ghost btn-xs" onClick={()=>setTab("inventory")}>{t.manage}</button></div>
                {lowStock.length===0?<p style={{color:"var(--green)",fontSize:13}}>✅ All stock OK</p>:lowStock.slice(0,7).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{fontSize:13,fontWeight:500}}>{p.name}</div>
                    <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>{p.stock}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:20}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>{t.orderStatus}</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {["Processing","Ready to Ship","Completed","Cancelled"].map(s=>(
                  <div key={s} onClick={()=>{setTab("orders");setFilterOS(s);}} style={{background:"var(--surface2)",borderRadius:11,padding:14,textAlign:"center",border:`1px solid ${OC[s]||"#64748b"}33`,cursor:"pointer"}}>
                    <div style={{fontSize:24,fontWeight:700,color:OC[s],fontFamily:"Rajdhani,sans-serif"}}>{orders.filter(o=>o.status===s).length}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{tSt(s)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTORY ── */}
        {tab==="inventory"&&(
          <div className="fu">
            {/* Low stock alert banner */}
            {lowStock.length>0&&(
              <div onClick={()=>setFilterLow(f=>!f)} style={{
                background:filterLow?"rgba(248,113,113,.18)":"rgba(248,113,113,.08)",
                border:`1px solid ${filterLow?"rgba(248,113,113,.6)":"rgba(248,113,113,.25)"}`,
                borderRadius:10, padding:"10px 16px", marginBottom:14,
                display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                transition:"all .15s"
              }}>
                <span style={{fontSize:18}}>⚠️</span>
                <div style={{flex:1,fontSize:13}}>
                  <span style={{fontWeight:700,color:"var(--red)"}}>
                    {lowStock.filter(p=>p.stock===0).length} out of stock
                  </span>
                  <span style={{color:"var(--text3)",marginLeft:8}}>
                    · {lowStock.filter(p=>p.stock>0).length} running low
                  </span>
                </div>
                <span style={{
                  fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                  color:filterLow?"var(--red)":"var(--text3)",
                  background:filterLow?"rgba(248,113,113,.15)":"var(--surface2)",
                  padding:"3px 10px", borderRadius:99,
                  border:`1px solid ${filterLow?"rgba(248,113,113,.4)":"var(--border)"}`
                }}>
                  {filterLow?"✓ Showing low stock":"Show low stock only"}
                </span>
              </div>
            )}
            <PH title={t.inventory} subtitle={`${parts.length} parts · ${lowStock.length} low`}
              action={role==="admin"&&<button className="btn btn-primary" onClick={()=>openM("editPart")}>+ {t.addPart}</button>}/>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 220px",maxWidth:340}}>
                <input className="inp" type="text"
                  placeholder="Search SKU, name, make, OE... (multi-word OK)"
                  value={searchPart} onChange={e=>setSearchPart(e.target.value)}
                  style={{paddingRight:searchPart?34:14}}/>
                {searchPart&&(
                  <button onClick={()=>setSearchPart("")}
                    style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,lineHeight:1,padding:2}}
                    title="Clear search">✕</button>
                )}
                {searchPart&&searchPart!==searchDebounced&&(
                  <div style={{position:"absolute",right:34,top:"50%",transform:"translateY(-50%)",
                    width:8,height:8,borderRadius:"50%",background:"var(--accent)",animation:"spin .6s linear infinite"}}/>
                )}
              </div>
              {/* Google Lens + Paste */}
              <button className="btn btn-ghost btn-sm"
                style={{display:"flex",alignItems:"center",gap:5,border:"1px solid rgba(66,133,244,.4)",color:"#4285F4",whiteSpace:"nowrap",flexShrink:0}}
                onClick={()=>{
                  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                  if(isMobile){
                    // Try to open Google Lens app directly
                    // Android: googlelens:// or intent URL
                    // iOS: google://lens or https://lens.google.com (app handles it)
                    const isAndroid = /Android/i.test(navigator.userAgent);
                    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                    if(isAndroid){
                      // Try app intent first, fallback to web
                      window.location.href = "intent://lens.google.com/search?ep=11#Intent;scheme=https;package=com.google.android.googlequicksearchbox;end";
                    } else if(isIOS){
                      // iOS — Google app handles lens:// or fallback to web
                      window.location.href = "googlelens://";
                      setTimeout(()=>{ window.open("https://lens.google.com","_blank"); }, 1500);
                    }
                  } else {
                    window.open("https://lens.google.com","_blank");
                  }
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4285F4"/><circle cx="12" cy="12" r="5" fill="white"/><circle cx="12" cy="12" r="2.5" fill="#4285F4"/></svg>
                Lens
              </button>
              <button className="btn btn-ghost btn-sm" style={{flexShrink:0,whiteSpace:"nowrap"}}
                onClick={async()=>{
                  try{
                    const txt=await navigator.clipboard.readText();
                    if(txt&&txt.trim()){ setSearchPart(txt.trim()); }
                    else{ alert("Clipboard empty — copy a number from Google Lens first"); }
                  }catch{ alert("Please paste manually into the search box"); }
                }}>
                📋 Paste
              </button>
              <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:160}}>
                <option value="__all__">All Categories</option>
                {getCategories().map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              {(searchPart||filterCat!=="__all__"||filterLow)&&(
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchPart("");setFilterCat("__all__");setFilterLow(false);}} style={{color:"var(--accent)",whiteSpace:"nowrap",border:"1px solid rgba(249,115,22,.3)"}}>✕ Clear all</button>
              )}
            </div>
            {searchDebounced&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>
              🔍 {fp.length} result{fp.length!==1?"s":""} for <span style={{color:"var(--accent)",fontWeight:600}}>"{searchDebounced}"</span>
              {fp.length===0&&<span style={{color:"var(--red)",marginLeft:8}}>— try fewer words</span>}
            </div>}
            {/* ── MOBILE INVENTORY CARDS ── */}
            <div className="mob-cards">
              {fp.slice(invPage*PAGE_SIZE,(invPage+1)*PAGE_SIZE).map(p=>{
                const img=toImgUrl(p.image_url);
                const ps=getPartSupps(p.id);
                return (
                  <div key={p.id} id={`part-row-${p.id}`} className="card" style={{padding:14,
                    borderLeft:`3px solid ${p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--border)"}`}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      {/* Photo */}
                      {img
                        ? <img src={img} alt={p.name} onClick={()=>setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                            style={{width:56,height:56,objectFit:"contain",borderRadius:8,background:"var(--surface2)",border:"1px solid var(--border)",flexShrink:0,cursor:"zoom-in"}}/>
                        : <div style={{width:56,height:56,borderRadius:8,background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔩</div>}
                      {/* Info */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                          <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</div>
                          <span style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",flexShrink:0,
                            color:p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--green)"}}>{p.stock}</span>
                        </div>
                        {p.chinese_desc&&<div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{p.chinese_desc}</div>}
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5,alignItems:"center"}}>
                          <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{p.sku}</code>
                          {p.bin_location&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)",background:"rgba(96,165,250,.1)",padding:"1px 7px",borderRadius:5}}>📦 {p.bin_location}</span>}
                          {p.category&&<span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:10}}>{p.category}</span>}
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                          <span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</span>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {(()=>{const cnt=partFitments.filter(f=>String(f.part_id)===String(p.id)).length;return cnt>0?<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{cnt} 🚗</span>:null;})()}
                            {p.stock===0
                              ? <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>Out</span>
                              : p.stock<=p.min_stock
                                ? <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)"}}>Low</span>
                                : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)"}}>In Stock</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Action buttons for admin */}
                    {role==="admin"&&(
                      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>openM("adjust",p)}>± Adj</button>
                        <button className="btn btn-ghost btn-xs" onClick={async()=>{const ok=await acquireLock("part",p.id);if(ok)openM("editPart",p);}}>✏️ Edit</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>openM("stockMove",p)}>🔀 Move</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>openM("partSupplier",p)}>🏭 Supp</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>{setLogSearch(p.sku||"");setTab("logs");}}>📝 Logs</button>
                        <button className="btn btn-danger btn-xs" onClick={()=>deletePart(p.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {fp.length===0&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No parts found</div>}
            </div>

            {/* ── DESKTOP INVENTORY TABLE ── */}
            <div className="card desk-table" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>
                    {["",t.sku,`${t.name} / ${t.chineseDesc}`,"Bin",t.make,t.model,t.yearRange,t.oeNumber,t.category,t.price,"St"].map(h=><th key={h}>{h}</th>)}
                    <th style={{textAlign:"center",whiteSpace:"nowrap"}}>🚗</th>
                    {role==="admin"&&<th style={{position:"sticky",right:0,background:"var(--surface2)",zIndex:2,boxShadow:"-2px 0 8px rgba(0,0,0,.3)"}}>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {fp.slice(invPage*PAGE_SIZE,(invPage+1)*PAGE_SIZE).map(p=>{
                      const img=toImgUrl(p.image_url);
                      const ps=getPartSupps(p.id);
                      return (
                        <tr key={p.id} id={`part-row-${p.id}`}>
                          <td style={{width:52,padding:"10px 8px"}}>
                            {img
                              ? <img className="part-img" src={img} alt={p.name}
                                  onClick={()=>setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                                  onError={e=>{e.target.style.display="none";e.target.nextSibling&&(e.target.nextSibling.style.display="flex");}}/>
                              : <div className="part-emoji">{p.image||"🔩"}</div>}
                          </td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{p.sku}</code></td>
                          <td>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600}}>
                                  {p.name}
                                  {p.chinese_desc&&<span style={{color:"var(--text2)",fontWeight:400}}> / {p.chinese_desc}</span>}
                                </div>
                                {ps.length>0&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>🏭 {ps.length} supplier{ps.length>1?"s":""}</div>}
                              </div>
                              {/* Stock qty badge — always visible */}
                              <div style={{flexShrink:0,textAlign:"right"}}>
                                <span style={{
                                  fontWeight:800, fontFamily:"Rajdhani,sans-serif", fontSize:17,
                                  color:p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--green)"
                                }}>{p.stock}</span>
                                {p.stock<=p.min_stock&&p.stock>0&&<div style={{fontSize:9,color:"var(--yellow)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",lineHeight:1}}>LOW</div>}
                                {p.stock===0&&<div style={{fontSize:9,color:"var(--red)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",lineHeight:1}}>OUT</div>}
                              </div>
                            </div>
                          </td>
                          <td>
                            {p.bin_location
                              ? <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",fontFamily:"DM Mono,monospace",fontSize:11,maxWidth:56,overflow:"hidden",textOverflow:"ellipsis",display:"inline-block",whiteSpace:"nowrap"}} title={p.bin_location}>{p.bin_location}</span>
                              : <span style={{color:"var(--text3)",fontSize:12}}>—</span>}
                          </td>
                          <td style={{color:"var(--text2)",fontSize:13}}>{p.make||"—"}</td>
                          <td style={{color:"var(--text2)",fontSize:13}}>{p.model||"—"}</td>
                          <td style={{color:"var(--text2)",fontSize:13}}>{p.year_range||"—"}</td>
                          <td>
                            {p.oe_number
                              ? <a href={`https://www.google.com/search?q=${encodeURIComponent(p.oe_number)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--blue)",textDecoration:"none"}}
                                  title="Search on Google">
                                  {p.oe_number} 🔍
                                </a>
                              : <span style={{color:"var(--text3)"}}>—</span>}
                          </td>
                          <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)"}}>{p.category}</span></td>
                          <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)"}}>{fmtAmt(p.price)}</td>
                          <td style={{textAlign:"center",fontSize:16}} title={p.stock===0?"Out of Stock":p.stock<=p.min_stock?"Low Stock":"In Stock"}>{p.stock===0?"🔴":p.stock<=p.min_stock?"🟡":"🟢"}</td>
                          <td style={{textAlign:"center"}}>
                            {(()=>{const cnt=partFitments.filter(f=>String(f.part_id)===String(p.id)).length;return cnt>0?<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{cnt} 🚗</span>:<span style={{color:"var(--text3)",fontSize:11}}>—</span>;})()}
                          </td>
                          {role==="admin"&&(()=>{
                            const lock=isLocked("part",p.id);
                            return (
                              <td style={{position:"sticky",right:0,background:"var(--surface)",zIndex:1,boxShadow:"-2px 0 8px rgba(0,0,0,.2)",padding:"0 8px"}}>
                                {lock?(
                                  <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"rgba(248,113,113,.1)",borderRadius:8,border:"1px solid rgba(248,113,113,.2)"}}>
                                    <span style={{fontSize:14}}>🔒</span>
                                    <div style={{fontSize:11,color:"var(--red)",lineHeight:1.3}}>
                                      <div style={{fontWeight:600}}>Locked</div>
                                      <div style={{color:"var(--text3)"}}>{lock.locked_by_name||lock.locked_by}</div>
                                    </div>
                                  </div>
                                ):(
                                  <PartActionsMenu
                                    onAdjust={()=>openM("adjust",p)}
                                    onEdit={async()=>{ const ok=await acquireLock("part",p.id); if(ok) openM("editPart",p); }}
                                    onMove={()=>openM("stockMove",p)}
                                    onSupplier={()=>openM("partSupplier",p)}
                                    onRfq={()=>openM("inquiry",p)}
                                    onLogs={()=>{setLogSearch(p.sku||"");setTab("logs");}}
                                    onDelete={()=>deletePart(p.id)}
                                    t={t}
                                  />
                                )}
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {fp.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No parts found</div>}
              </div>
            </div>
            {/* Pagination */}
            {fp.length>PAGE_SIZE&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:13,color:"var(--text3)"}}>
                  Showing {invPage*PAGE_SIZE+1}–{Math.min((invPage+1)*PAGE_SIZE,fp.length)} of <strong style={{color:"var(--text)"}}>{fp.length}</strong> parts
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button className="btn btn-ghost btn-sm" disabled={invPage===0} onClick={()=>setInvPage(p=>p-1)}>← Prev</button>
                  <span style={{fontSize:13,color:"var(--text2)",fontWeight:600,minWidth:80,textAlign:"center"}}>
                    Page {invPage+1} / {Math.ceil(fp.length/PAGE_SIZE)}
                  </span>
                  <button className="btn btn-ghost btn-sm" disabled={(invPage+1)*PAGE_SIZE>=fp.length} onClick={()=>setInvPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RFQ ── */}
        {tab==="rfq"&&(
          <RfqPage
            parts={parts} suppliers={suppliers}
            rfqSessions={rfqSessions} rfqItems={rfqItems} rfqQuotes={rfqQuotes}
            onCreate={createRfqSession} onUpdateStatus={updateRfqStatus}
            onSelectQuote={selectRfqQuote} onCreatePO={createPOFromRfq}
            t={t} user={user} settings={settings}/>
        )}

        {/* ── STOCK TAKE ── */}
        {tab==="stocktake"&&(
          <StockTakePage parts={parts} stockTakes={stockTakes}
            onStart={startStockTake} onComplete={completeStockTake} onReopen={reopenStockTake}
            onSaveCount={saveCountedQty} t={t} user={user}
            categories={getCategories()}
            onAdjustItem={async(item,newQty,reloadItems)=>{
              const part=parts.find(p=>String(p.id)===String(item.part_id));
              if(part){
                await api.patch("parts","id",part.id,{stock:newQty});
                await logInv(part,part.stock,newQty,"ST Adjust",`ST item ${item.id}`);
                await api.patch("stock_take_items","id",item.id,{system_qty:newQty});
                // Only reload items in stock take — don't loadAll to avoid page reset
                if(reloadItems) await reloadItems();
                showToast(`✅ ${item.part_name} → ${newQty}`);
              }
            }}/>
        )}

        {/* ── STOCK MOVE ── */}
        {tab==="stockmove"&&(
          <div className="fu">
            <PH title={`🔀 ${t.stockMove}`} subtitle={`${stockMoves.length} moves`}
              action={<button className="btn btn-primary" onClick={()=>openM("stockMove",null)}>+ New Move</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["Date","Part","SKU",t.fromBin,t.toBin,"Qty","By","Reason"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {stockMoves.map(m=>(
                      <tr key={m.id}>
                        <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(m.moved_at).toLocaleString()}</td>
                        <td style={{fontWeight:600}}>{m.part_name}</td>
                        <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{m.part_sku}</td>
                        <td><span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)",fontFamily:"DM Mono,monospace"}}>{m.from_bin||"—"}</span></td>
                        <td><span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontFamily:"DM Mono,monospace"}}>→ {m.to_bin}</span></td>
                        <td style={{textAlign:"center",fontWeight:700}}>{m.qty}</td>
                        <td style={{color:"var(--text2)",fontSize:13}}>{m.moved_by}</td>
                        <td style={{color:"var(--text3)",fontSize:12}}>{m.reason||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stockMoves.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No stock moves recorded</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── SHOP ── */}
        {tab==="shop"&&(
          <div className="fu">
            {/* ⚠ Disclaimer banner */}
            <div style={{background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",
              borderRadius:10,padding:"10px 14px",marginBottom:12,
              display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
              <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>
                <strong>Please note:</strong> Part descriptions, images and stock levels shown may not be fully accurate.
                Contact us to confirm availability before ordering.
                Prices are subject to change without notice.
              </div>
            </div>

            <div style={{
              position:"sticky", top:-26, zIndex:40,
              background:"var(--bg)",
              paddingTop:10, paddingBottom:12,
              marginBottom:6,
              marginLeft:-26, marginRight:-26, paddingLeft:26, paddingRight:26,
              borderBottom:"1px solid var(--border)",
            }}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <div style={{position:"relative",flex:"1 1 180px",maxWidth:280}}>
                  <input className="inp" type="text" placeholder="Search parts..." value={searchPart} onChange={e=>setSearchPart(e.target.value)} style={{paddingRight:36}}/>
                  {searchPart&&<button onClick={()=>setSearchPart("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,lineHeight:1,padding:2}}>✕</button>}
                </div>
                <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:140}}>
                  <option value="__all__">All Categories</option>
                  {getCategories().map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                {(searchPart||filterCat!=="__all__")&&(
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchPart("");setFilterCat("__all__");}} style={{color:"var(--accent)",border:"1px solid rgba(249,115,22,.3)"}}>✕ Clear</button>
                )}
                <button className="btn btn-primary" style={{marginLeft:"auto",flexShrink:0}}
                  onClick={()=>openM("checkout")}>
                  🛒 {cartCount>0?`(${cartCount}) `:""}Checkout{cartTotal>0?` · ${fmtAmt(cartTotal)}`:""}
                </button>
              </div>
            </div>
            {/* 🚗 Vehicle Search Bar */}
            <VehicleSearchBar
              vehicles={vehicles}
              partFitments={partFitments}
              parts={parts}
              onFilter={(ids)=>{setVehicleFilterIds(ids);setShopPage(0);}}
              t={t}/>

            {searchDebounced&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
              🔍 {fp.length} result{fp.length!==1?"s":""} for <span style={{color:"var(--accent)",fontWeight:600}}>"{searchDebounced}"</span>
            </div>}
            {vehicleFilterIds&&<div style={{fontSize:12,color:"var(--blue)",marginBottom:12,fontWeight:600}}>
              🚗 {fp.filter(p=>vehicleFilterIds.has(String(p.id))).length} parts match your vehicle
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
              {fp.filter(p=>!vehicleFilterIds||vehicleFilterIds.has(String(p.id))).slice(shopPage*PAGE_SIZE,(shopPage+1)*PAGE_SIZE).map(p=>{
                const inCart=cart.find(i=>i.id===p.id);
                const img=toImgUrl(p.image_url);
                return (
                  <div key={p.id} className="card card-hover" style={{padding:16,borderColor:inCart?"var(--accent)":"var(--border)",boxShadow:inCart?"var(--glow)":"none",display:"flex",flexDirection:"column"}}>
                    {/* Image */}
                    {img
                      ? <img src={img} alt={p.name}
                          style={{width:"100%",height:120,objectFit:"contain",background:"#fff",borderRadius:9,marginBottom:12,cursor:"zoom-in",flexShrink:0}}
                          onClick={()=>setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                          onError={e=>e.target.style.display="none"}/>
                      : <div style={{width:"100%",height:90,background:"var(--surface2)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,marginBottom:12,flexShrink:0}}>{p.image||"🔩"}</div>}
                    {/* Content — flex:1 pushes button to bottom */}
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{p.sku} · {p.brand}</div>
                      <div style={{fontSize:14,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{p.name}</div>
                      {p.chinese_desc&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:2}}>{p.chinese_desc}</div>}
                      {(p.make||p.model)&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>🚗 {[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}</div>}
                      {p.oe_number&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:4,fontFamily:"DM Mono,monospace"}}>OE: {p.oe_number}</div>}
                    </div>
                    {/* Price + button always at bottom */}
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:20,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginBottom:4}}>{fmtAmt(p.price)}</div>
                      <div style={{fontSize:12,color:p.stock>0?"var(--green)":"var(--red)",marginBottom:10}}>{p.stock>0?`${p.stock} in stock`:t.outOfStock}</div>
                      {inCart
                        ? <div style={{display:"flex",alignItems:"center",gap:7}}><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty-1)}>−</button><span style={{flex:1,textAlign:"center",fontWeight:700,fontSize:16}}>{inCart.qty}</span><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty+1)}>+</button><button className="btn btn-danger btn-xs" onClick={()=>removeFromCart(p.id)}>✕</button></div>
                        : <button className="btn btn-primary" style={{width:"100%"}} disabled={p.stock===0} onClick={()=>addToCart(p)}>{t.addToCart}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Shop pagination */}
            {fp.length>PAGE_SIZE&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:13,color:"var(--text3)"}}>
                  Showing {shopPage*PAGE_SIZE+1}–{Math.min((shopPage+1)*PAGE_SIZE,fp.length)} of <strong style={{color:"var(--text)"}}>{fp.length}</strong> parts
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button className="btn btn-ghost btn-sm" disabled={shopPage===0} onClick={()=>setShopPage(p=>p-1)}>← Prev</button>
                  <span style={{fontSize:13,color:"var(--text2)",fontWeight:600,minWidth:80,textAlign:"center"}}>
                    Page {shopPage+1} / {Math.ceil(fp.length/PAGE_SIZE)}
                  </span>
                  <button className="btn btn-ghost btn-sm" disabled={(shopPage+1)*PAGE_SIZE>=fp.length} onClick={()=>setShopPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS ── */}
        {/* ── PICKING ── */}
        {tab==="picking"&&(
          <PickingPage
            orders={orders.filter(o=>o.status==="Processing")}
            parts={parts}
            onComplete={async(orderId)=>{
              await updateOrderStatus(orderId,"Ready to Ship");
              showToast("✅ Order picked — Ready to Ship!");
            }}
            onRefresh={loadAll}
            t={t} lang={lang}/>
        )}

        {tab==="orders"&&(
          <div className="fu">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
              <div>
                <h1 style={{fontSize:20,fontWeight:700,lineHeight:1.2}}>{t.orders}</h1>
                <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
                  {role==="shipper"
                    ? `${orders.filter(o=>o.status==="Processing"||o.status==="Ready to Ship").length} active · ${orders.length} total`
                    : `${orders.length} orders`}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>loadAll()} title="Refresh">
                🔄 Refresh
              </button>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
              <div className="tabs" style={{flex:"1 1 auto",maxWidth:"100%"}}>
                {OS.map(([val,label])=>{
                  const cnt = val==="__all__"?orders.length
                    :val==="__active__"?orders.filter(o=>o.status==="Processing"||o.status==="Ready to Ship").length
                    :orders.filter(o=>o.status===val).length;
                  return <button key={val} className={`tab ${filterOS===val?"on":""}`}
                    onClick={()=>setFilterOS(val)}>{label} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;
                })}
              </div>
              {/* Date filter for Completed */}
              {filterOS==="Completed"&&(
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{fontSize:12,color:"var(--text3)"}}>Last</span>
                  {[1,7,30,0].map(d=>(
                    <button key={d} className={`btn btn-xs ${completedDays===d?"btn-primary":"btn-ghost"}`}
                      onClick={()=>setCompletedDays(d)}
                      style={{padding:"4px 10px",fontSize:12}}>
                      {d===0?"All":d===1?"Today":d+"d"}
                    </button>
                  ))}
                  <span style={{fontSize:12,color:"var(--text3)",marginLeft:2}}>
                    ({fo.length})
                  </span>
                </div>
              )}
            </div>
            <OrdersTable orders={fo} canEdit={role==="admin"||role==="manager"} canInvoice={role==="admin"||role==="manager"} onStatusChange={updateOrderStatus}
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
              <div className="tbl-wrap">
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
                            <button className="btn btn-info btn-xs" onClick={()=>openM("pdfInvoice",{...inv,type:"supplier"})}>🖨 PDF</button>
                            {inv.status!=="paid"
                              ? <button className="btn btn-success btn-xs" onClick={()=>openM("addPayment",{prefill:{type:"payment",reference_id:inv.id,party_name:inv.supplier_name,amount:inv.total,payment_date:today()}})}>💳 Record Payment</button>
                              : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11}}>✅ Paid</span>
                            }
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
              <div className="tbl-wrap">
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
              <div className="tbl-wrap">
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
                            <button className="btn btn-info btn-xs" onClick={()=>openM("pdfInvoice",{...inv,type:"customer"})}>🖨 PDF</button>
                            {inv.status!=="paid"
                              ? <button className="btn btn-success btn-xs" onClick={()=>openM("addPayment",{prefill:{type:"receipt",reference_id:inv.id,party_name:inv.customer_name,amount:inv.total,payment_date:today()}})}>💳 Record Payment</button>
                              : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11}}>✅ Paid</span>
                            }
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
              <div className="tbl-wrap">
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
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["Part","Supplier","Qty",t.status,"Reply Price","Stock","Supplier Part#","Date","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {inquiries.map(inq=>(
                      <tr key={inq.id}>
                        <td style={{fontWeight:600}}>{inq.part_name}</td>
                        <td style={{color:"var(--text2)"}}>{inq.supplier_name}</td>
                        <td style={{textAlign:"center",fontWeight:700}}>{inq.qty_requested}</td>
                        <td><StatusBadge status={inq.status}/></td>
                        <td style={{color:inq.reply_price?"var(--green)":"var(--text3)"}}>{inq.reply_price?fmtAmt(inq.reply_price):"—"}</td>
                        <td style={{color:inq.reply_stock?"var(--green)":"var(--text3)"}}>{inq.reply_stock ?? "—"}</td>
                        <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:inq.supplier_part_no?"var(--green)":"var(--text3)"}}>{inq.supplier_part_no||"—"}</td>
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
        {tab==="logs"&&role==="admin"&&(()=>{
          const logQ=logSearch.trim().toLowerCase();
          const filteredLogs=logQ
            ? logs.filter(l=>(l.part_sku||"").toLowerCase().includes(logQ)||(l.part_name||"").toLowerCase().includes(logQ))
            : logs;
          return (
          <div className="fu">
            <PH title={`📝 ${t.logs}`} subtitle={`${filteredLogs.length}${logQ?` of ${logs.length}`:""} records`}/>
            <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 220px",maxWidth:320}}>
                <input className="inp" type="text"
                  placeholder="Search SKU or part name…"
                  value={logSearch} onChange={e=>setLogSearch(e.target.value)}
                  style={{paddingRight:logSearch?34:14}}/>
                {logSearch&&(
                  <button onClick={()=>setLogSearch("")}
                    style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,lineHeight:1,padding:2}}
                    title="Clear">✕</button>
                )}
              </div>
              {logQ&&<span style={{fontSize:12,color:"var(--text3)"}}>
                🔍 <span style={{color:"var(--accent)",fontWeight:600}}>{logQ}</span> · {filteredLogs.length} result{filteredLogs.length!==1?"s":""}
              </span>}
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["Time","Part","Action","Before","After","Change","By","Reason"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredLogs.map(l=>{const d=l.qty_after-l.qty_before;return(
                      <tr key={l.id} style={{cursor:"pointer"}}
                        onDoubleClick={()=>{setSearchPart(l.part_sku||l.part_name||"");setTab("inventory");}}>
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
                {filteredLogs.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{logQ?"No matching records":"No records"}</div>}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── USERS ── */}
        {tab==="users"&&role==="admin"&&(
          <div className="fu">
            <PH title={t.users} subtitle={`${users.length} users`}
              action={<button className="btn btn-primary" onClick={()=>openM("editUser")}>+ Add User</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
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
              <div className="tbl-wrap">
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
        {/* ── VEHICLES ── */}
        {/* ── WORKSHOP (all sub-tabs) ── */}
        {["workshop","wscustomers","wsquotations","wsinvoices","wspayments","wsstock","wsservices","wstransfer","wsstatement","wsreport"].includes(tab)&&(role==="admin"||role==="manager")&&(
          <WorkshopPage
            key={tab}
            initialTab={tab==="workshop"?"jobs":tab==="wscustomers"?"customers":tab==="wsquotations"?"quotations":tab==="wsinvoices"?"invoices":tab==="wspayments"?"payments":tab==="wsstock"?"wsstock":tab==="wsservices"?"wsservices":tab==="wstransfer"?"wstransfer":tab==="wsstatement"?"statement":"report"}
            jobs={workshopJobs}
            jobItems={workshopJobItems}
            invoices={workshopInvoices}
            quotes={workshopQuotes}
            parts={parts}
            partFitments={partFitments}
            vehicles={vehicles}
            customers={customers}
            wsCustomers={workshopCustomers}
            wsVehicles={workshopVehicles}
            settings={settings}
            onSaveJob={saveWorkshopJob}
            onDeleteJob={deleteWorkshopJob}
            onSaveItem={saveJobItem}
            onDeleteItem={deleteJobItem}
            onSaveInvoice={saveWorkshopInvoice}
            onUpdateInvoice={updateWorkshopInvoice}
            onDeleteInvoice={deleteWorkshopInvoice}
            onSaveQuote={saveWorkshopQuote}
            onDeleteQuote={deleteWorkshopQuote}
            onConvertQuoteToInvoice={convertQuoteToInvoice}
            onSendQuoteForApproval={sendQuoteForApproval}
            wsStock={workshopStock}
            wsServices={workshopServices}
            onSaveWsCustomer={saveWorkshopCustomer}
            onDeleteWsCustomer={deleteWorkshopCustomer}
            onSaveWsVehicle={saveWorkshopVehicle}
            onDeleteWsVehicle={deleteWorkshopVehicle}
            onSaveWsStock={saveWsStockItem}
            onDeleteWsStock={deleteWsStockItem}
            onAdjustWsStock={adjustWsStock}
            onSaveWsService={saveWsService}
            onDeleteWsService={deleteWsService}
            onSaveWsTransfer={saveWsTransfer}
            parts={parts}
            t={t} lang={lang}/>
        )}

        {tab==="vehicles"&&role==="admin"&&(
          <VehiclesPage vehicles={vehicles} partFitments={partFitments} onSave={saveVehicle} onDelete={deleteVehicle} t={t}/>
        )}

        {tab==="settings"&&role==="admin"&&(
          <SettingsPage settings={settings} onSave={saveSettings} t={t}/>
        )}

        {/* ── REPORTS ── */}
        {tab==="reports"&&role==="admin"&&(
          <ReportsPage orders={orders} parts={parts} customers={customers}
            supplierInvoices={supplierInvoices} payments={payments}
            settings={settings} t={t} lang={lang}/>
        )}

        {/* ── PAYMENTS ── */}
        {tab==="payments"&&role==="admin"&&(
          <div className="fu">
            <PH title={`💳 ${t.payments}`} subtitle={`${payments.length} records`}
              action={<button className="btn btn-primary" onClick={()=>openM("addPayment")}>+ {t.addPayment}</button>}/>

            {/* Reconcile summary */}
            {(()=>{
              const totalInvoiced=customerInvoices.reduce((s,i)=>s+(i.total||0),0);
              const totalPaid=payments.filter(p=>p.type==="receipt").reduce((s,p)=>s+(p.amount||0),0);
              const outstanding=totalInvoiced-totalPaid;
              return (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
                  {[
                    {label:"Total Invoiced",value:fmtAmt(totalInvoiced),color:"var(--blue)",icon:"🧾"},
                    {label:"Total Received",value:fmtAmt(totalPaid),color:"var(--green)",icon:"✅"},
                    {label:t.outstanding,value:fmtAmt(outstanding),color:outstanding>0?"var(--red)":"var(--green)",icon:"⚠️"},
                  ].map(s=>(
                    <div key={s.label} className="stat-card card" style={{"--gc":s.color+"20"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <div><div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{s.label}</div>
                        <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"Rajdhani,sans-serif"}}>{s.value}</div></div>
                        <div style={{fontSize:24}}>{s.icon}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["Date","Type","Reference","Customer/Supplier",t.paymentMethod,"Amount","Notes","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {payments.map(p=>(
                      <tr key={p.id}>
                        <td style={{color:"var(--text3)",whiteSpace:"nowrap"}}>{p.payment_date}</td>
                        <td><span className="badge" style={{background:p.type==="receipt"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",color:p.type==="receipt"?"var(--green)":"var(--red)"}}>{p.type==="receipt"?"📥 Receipt":"📤 Payment"}</span></td>
                        <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{p.reference_id||"—"}</td>
                        <td style={{fontWeight:500}}>{p.party_name||"—"}</td>
                        <td><span className="badge" style={{background:"var(--surface2)",color:"var(--text2)"}}>{p.method==="cash"?`💵 ${t.cash}`:p.method==="bank"?`🏦 ${t.bankTransfer}`:`💳 ${t.card}`}</span></td>
                        <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:p.type==="receipt"?"var(--green)":"var(--red)"}}>{p.type==="receipt"?"+":"-"}{fmtAmt(p.amount)}</td>
                        <td style={{fontSize:13,color:"var(--text3)"}}>{p.notes||"—"}</td>
                        <td><button className="btn btn-danger btn-xs" onClick={()=>deletePayment(p.id)}>🗑</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No payment records yet</div>}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ════ MODALS ════ */}
      {isOpen("editPart")&&<PartModal part={mData("editPart")} vehicles={vehicles} partFitments={partFitments} onSaveFitment={saveFitment} onDeleteFitment={deleteFitment} onSave={savePart} onGoVehicles={()=>{closeM("editPart");setTab("vehicles");}} onClose={()=>{
  const ep=mData("editPart"); if(ep?.id) releaseLock("part",ep.id);
  closeM("editPart");
}} t={t}/>}
      {isOpen("adjust")&&<AdjustModal part={mData("adjust")} onApply={applyAdjust} onClose={()=>closeM("adjust")} t={t}/>}
      {isOpen("editSupplier")&&<SupplierModal supplier={mData("editSupplier")} onSave={saveSupplier} onClose={()=>closeM("editSupplier")} t={t}/>}
      {isOpen("partSupplier")&&<PartSupplierModal part={mData("partSupplier")} partSuppliers={getPartSupps(mData("partSupplier")?.id)} suppliers={suppliers} onSave={savePartSupplier} onDelete={deletePartSupplier} onUpdate={updatePartSupplier} onClose={()=>closeM("partSupplier")} t={t}/>}
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

      {/* LIGHTBOX */}
      {lightbox&&<ImgLightbox url={lightbox.url} onClose={()=>setLightbox(null)}/>}

      {/* STOCK MOVE MODAL */}
      {isOpen("stockMove")&&<StockMoveModal
        part={mData("stockMove")} parts={parts}
        onSave={saveStockMove} onClose={()=>closeM("stockMove")} t={t}/>}

      {/* ADD PAYMENT MODAL */}
      {isOpen("addPayment")&&<AddPaymentModal
        data={mData("addPayment")}
        customerInvoices={customerInvoices} supplierInvoices={supplierInvoices}
        onSave={savePayment} onClose={()=>closeM("addPayment")} t={t} settings={settings}/>}

      {/* PDF INVOICE VIEWER */}
      {isOpen("pdfInvoice")&&<PdfInvoiceModal
        inv={mData("pdfInvoice")} settings={settings} onClose={()=>closeM("pdfInvoice")}/>}

      {toast&&<div className="toast" style={{borderColor:toast.type==="err"?"rgba(248,113,113,.3)":"var(--border2)",color:toast.type==="err"?"var(--red)":"var(--green)"}}>
        {toast.type==="err"?"⚠":"✓"} {toast.msg}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SHARED TABLE
// ═══════════════════════════════════════════════════════════════
function OrdersTable({orders,canEdit,canInvoice=true,shipperMode=false,onStatusChange,onCreateInvoice}) {
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
function LogoUploader({f,s}) {
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

function SettingsPage({settings,onSave,t}) {
  const [f,setF]=useState({...settings});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [cats,setCats]=useState(getCategories());
  const [newCat,setNewCat]=useState("");
  const addCat=()=>{
    if(!newCat.trim())return;
    const updated=[...cats,newCat.trim()];
    setCats(updated);
    // Save to Supabase via settings
    onSave({categories:JSON.stringify(updated)});
    setNewCat("");
  };
  const delCat=(i)=>{
    const updated=cats.filter((_,idx)=>idx!==i);
    setCats(updated);
    onSave({categories:JSON.stringify(updated)});
  };
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
          <FD>
            <FL label="Logo"/>
            <LogoUploader f={f} s={s}/>
            {/* OR paste Google Drive URL */}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,marginTop:10}}>
              <div style={{fontSize:12,color:"var(--text3)",flexShrink:0}}>Or URL:</div>
              <input className="inp" value={f.logo_url||""} 
                disabled={!!f.logo_data}
                onChange={e=>{s("logo_url",e.target.value);}}
                placeholder={f.logo_data?"Remove uploaded logo first...":"https://drive.google.com/file/d/..."} 
                style={{fontSize:12,opacity:f.logo_data?0.5:1,cursor:f.logo_data?"not-allowed":"text"}}/>
              <button className="cp-btn" 
                disabled={!!f.logo_data}
                style={{opacity:f.logo_data?0.4:1}}
                onClick={async()=>{if(f.logo_data){alert("Remove the uploaded logo first.");return;}try{const txt=await navigator.clipboard.readText();s("logo_url",txt);}catch{}}}>📥 Paste</button>
            </div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>
              💡 <strong style={{color:"var(--text)"}}>Upload</strong> = stored in database, no white border &nbsp;·&nbsp;
              <strong style={{color:"var(--text)"}}>URL</strong> = Google Drive &nbsp;·&nbsp;
              ⚠️ Remove current logo before switching method
            </div>
            {/* Logo preview + size sliders */}
            <div style={{marginTop:10,background:"var(--surface3)",borderRadius:10,border:"1px solid var(--border)",padding:14}}>
              {/* Current logo preview */}
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                {(f.logo_data||f.logo_url)
                  ? <img
                      src={f.logo_data||(toLogoUrl(f.logo_url)||f.logo_url)}
                      alt="preview"
                      style={{maxHeight:56,maxWidth:220,width:"auto",height:"auto",objectFit:"contain",display:"block"}}
                      onError={e=>e.target.style.display="none"}/>
                  : <LogoSVG height={44}/>
                }
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:(f.logo_data||f.logo_url)?"var(--green)":"var(--text3)",marginBottom:2}}>
                    {f.logo_data?"✅ Uploaded & stored in database":f.logo_url?"✓ Google Drive URL set":"Using built-in SVG logo"}
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>
                    {f.logo_data?"No white border · Works offline · Loads instantly":
                     f.logo_url?"Loads from Google Drive":
                     "Upload a file or paste a URL above"}
                  </div>
                </div>
              </div>

              {/* Size sliders per location */}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:12}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12}}>Logo Size per Location</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                  {[
                    {key:"logo_h_login",   label:"🔐 Login Page",  def:80},
                    {key:"logo_h_sidebar", label:"📋 Sidebar",      def:36},
                    {key:"logo_h_pdf",     label:"🖨️ PDF Invoice",  def:70},
                  ].map(({key,label,def})=>(
                    <div key={key}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text2)",marginBottom:6}}>{label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                        <input type="range" min={20} max={key==="logo_h_login"?400:key==="logo_h_pdf"?300:150} step={2}
                          value={+(f[key]||def)}
                          onChange={e=>s(key,+e.target.value)}
                          style={{flex:1,accentColor:"var(--accent)",cursor:"pointer"}}/>
                        <span style={{fontFamily:"DM Mono,monospace",fontSize:13,fontWeight:700,color:"var(--accent)",minWidth:40,textAlign:"right"}}>{f[key]||def}px</span>
                      </div>
                      {/* Live mini-preview */}
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
          </FD>
          <FD><FL label={t.shopPhone}/><input className="inp" type="tel" value={f.phone||""} onChange={e=>s("phone",e.target.value)} placeholder="+886..."/></FD>
          <FD><FL label={t.shopEmail}/><input className="inp" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)} placeholder="shop@email.com"/></FD>
          <FD><FL label={t.whatsappNo}/><input className="inp" type="tel" value={f.whatsapp||""} onChange={e=>s("whatsapp",e.target.value)} placeholder="886912345678 (no + or spaces)"/></FD>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label="📷 Google Drive Upload (Apps Script URL)"/>
              <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                <button className="cp-btn" style={{color:"#4285F4",borderColor:"rgba(66,133,244,.3)"}}>Open Apps Script →</button>
              </a>
            </div>
            <input className="inp" value={f.apps_script_url||""} onChange={e=>s("apps_script_url",e.target.value)}
              placeholder="https://script.google.com/macros/s/YOUR_ID/exec"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
              Deploy your Apps Script as Web App → paste the URL here → part photos auto-upload to Google Drive
            </div>
          </FD>
          <FD>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <FL label="🚗 Vehicle Photos Upload (Apps Script URL)"/>
              <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                <button className="cp-btn" style={{color:"#4285F4",borderColor:"rgba(66,133,244,.3)"}}>Open Apps Script →</button>
              </a>
            </div>
            <input className="inp" value={f.vehicle_script_url||""} onChange={e=>s("vehicle_script_url",e.target.value)}
              placeholder="https://script.google.com/macros/s/YOUR_VEHICLE_ID/exec"/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
              Separate deployment for vehicle photos → saves to Tim_Car_Phot/Make/ID/view.png
            </div>
          </FD>
          <FD><FL label={t.shopAddress}/><textarea className="inp" value={f.address||""} onChange={e=>s("address",e.target.value)} placeholder="Full shop address" style={{minHeight:70}}/></FD>
        </div>
        <div className="card" style={{padding:22}}>
          <h3 style={{fontSize:14,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:18}}>💰 Billing Settings</h3>
          <FD><FL label={t.currency}/><select className="inp" value={f.currency||"TWD NT$"} onChange={e=>s("currency",e.target.value)}>
            {["TWD NT$","USD $","MYR RM","SGD $","HKD $","JPY ¥","EUR €","GBP £","CNY ¥","THB ฿","IDR Rp","PHP ₱","ZAR R","AUD $","CAD $","KRW ₩"].map(c=><option key={c}>{c}</option>)}
          </select></FD>
          <FG cols="1fr 1fr">
            <div><FL label={t.taxRate}/><input className="inp" type="number" value={f.tax_rate||0} onChange={e=>s("tax_rate",+e.target.value)} placeholder="0 (no VAT)"/></div>
            <div>
              <FL label="VAT Registration No."/>
              <input className="inp" value={f.vat_number||""} onChange={e=>s("vat_number",e.target.value)} placeholder="Leave blank if not VAT registered"/>
            </div>
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
              {!f.vat_number&&<div style={{color:"var(--text3)"}}>VAT No: <em>Not registered — will not appear on documents</em></div>}
            </div>
          </div>
        </div>
      </div>

      {/* Categories Management */}
      <div className="card" style={{padding:22,marginTop:20,gridColumn:"1/-1"}}>
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
function PartActionsMenu({onAdjust,onEdit,onMove,onSupplier,onRfq,onLogs,onDelete,t}) {
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
function ImgPreview({src}) {
  const [status,setStatus] = useState("loading"); // loading | ok | error
  useEffect(()=>{ setStatus("loading"); },[src]);
  if(!src) return null;
  return (
    <div style={{position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid var(--border)",background:"#fff",minHeight:80,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {status==="loading"&&<div style={{position:"absolute",fontSize:12,color:"var(--text3)"}}>Loading preview...</div>}
      {status==="error"&&(
        <div style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:6}}>🔒</div>
          <div style={{fontSize:12,color:"var(--red)",fontWeight:600}}>Cannot load image</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:4,lineHeight:1.6}}>
            Make sure Google Drive is set to<br/>
            <strong style={{color:"var(--yellow)"}}>「Anyone with the link」can view</strong>
          </div>
          <a href={src} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:8,fontSize:11,color:"var(--blue)"}}>
            🔗 Open in Google Drive to check
          </a>
        </div>
      )}
      <img
        src={src}
        alt="preview"
        style={{width:"100%",height:140,objectFit:"contain",display:status==="error"?"none":"block"}}
        onLoad={()=>setStatus("ok")}
        onError={()=>setStatus("error")}
      />
    </div>
  );
}

function PartModal({part,onSave,onClose,t,vehicles=[],partFitments=[],onSaveFitment,onDeleteFitment,onGoVehicles}) {
  const initF = part?{
    sku:part.sku||"", name:part.name||"", category:part.category||"Engine",
    brand:part.brand||"", price:part.price||"", stock:part.stock||"", minStock:part.min_stock||"",
    image_url:part.image_url||"", chinese_desc:part.chinese_desc||"",
    make:part.make||"", model:part.model||"", year_range:part.year_range||"", oe_number:part.oe_number||"",
    bin_location:part.bin_location||"",
  }:{
    sku:"", name:"", category:"Engine", brand:"", price:"", stock:"", minStock:"",
    image_url:"", chinese_desc:"", make:"", model:"", year_range:"", oe_number:"", bin_location:"",
  };
  const [f,setF]=useState(initF);
  const [ptab, setPtab] = useState("info");
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const s=(k,v)=>{ setF(p=>({...p,[k]:v})); setDirty(true); };

  const buildPayload=(fv)=>({
    sku:fv.sku.trim(), name:fv.name.trim(), category:fv.category, brand:fv.brand,
    price:+fv.price, stock:+fv.stock, min_stock:+fv.minStock,
    image_url:fv.image_url, chinese_desc:fv.chinese_desc,
    make:fv.make, model:fv.model, year_range:fv.year_range, oe_number:fv.oe_number,
    bin_location:fv.bin_location||"",
  });

  // Auto-save immediately when photo is uploaded (existing part only)
  const handlePhotoChange = (url) => {
    const updated = {...f, image_url: url};
    setF(updated);
    setDirty(false);
    if (part) onSave(buildPayload(updated));
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

  const TABS = [
    {id:"info",    label:"📋 Info"},
    {id:"photo",   label:"📸 Photo"},
    {id:"stock",   label:"💰 Stock"},
    {id:"vehicle", label:"🚗 Vehicle"},
    {id:"fitment", label:"🔗 Fits"},
  ];

  const Err = ({k}) => errors[k]
    ? <div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {errors[k]}</div>
    : null;

  return (
    <Overlay onClose={handleClose} wide>
      <MHead title={part?"✏️ Edit Part":"+ New Part"} onClose={handleClose}/>

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
          {part&&<div style={{fontSize:12,color:"var(--green)",marginBottom:10,background:"rgba(34,197,94,.08)",borderRadius:8,padding:"6px 10px"}}>✅ Photo saves automatically when uploaded</div>}
          <PartPhotoUploader imageUrl={f.image_url} onChange={handlePhotoChange} sku={f.sku} t={t}/>
        </div>
      )}

      {/* ── TAB: STOCK ── */}
      {ptab==="stock"&&(
        <div>
          <FG cols="1fr 1fr 1fr">
            <div>
              <FL label={`${t.price} *`}/>
              <input className="inp" type="number" value={f.price} onChange={e=>{s("price",e.target.value);setErrors(p=>({...p,price:""}));}}
                placeholder="0.00" style={{borderColor:errors.price?"var(--red)":undefined}}/>
              <Err k="price"/>
            </div>
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

      {/* Save / Cancel */}
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
          onClick={()=>{
            if(!validate()) return;
            onSave(buildPayload(f));
            setDirty(false);
          }}>
          {dirty&&<span style={{position:"absolute",top:-4,right:-4,width:10,height:10,background:"var(--accent)",borderRadius:"50%",border:"2px solid var(--surface)"}}/>}
          {t.save}
        </button>
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

function PartSupplierModal({part,partSuppliers,suppliers,onSave,onDelete,onUpdate,onClose,t}) {
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

function InquiryModal({part,suppliers,partSuppliers,onSend,onClose,t}) {
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

function InquiryDetailModal({inquiry,onUpdate,onClose,t}) {
  const [rp,setRp]=useState(inquiry?.reply_price||"");
  const [rs,setRs]=useState(inquiry?.reply_stock||"");
  const [rn,setRn]=useState(inquiry?.reply_notes||"");
  const [spn,setSpn]=useState(inquiry?.supplier_part_no||"");
  if(!inquiry)return null;
  return (
    <Overlay onClose={onClose}>
      <MHead title="📩 Inquiry Detail" sub={inquiry.id} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:11,padding:14,marginBottom:16,border:"1px solid var(--border)"}}>
        <FG>
          <div><FL label="Part"/><div style={{fontWeight:600}}>{inquiry.part_name}{inquiry.part_oe_number&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6,fontFamily:"DM Mono,monospace"}}>OE: {inquiry.part_oe_number}</span>}</div></div>
          <div><FL label="Supplier"/><div style={{fontWeight:600}}>{inquiry.supplier_name}</div></div>
        </FG>
        <FG>
          <div><FL label="Qty Requested"/><div style={{fontWeight:700,color:"var(--accent)",fontSize:16,fontFamily:"Rajdhani,sans-serif"}}>{inquiry.qty_requested}</div></div>
          <div><FL label="Supplier Part No."/><div style={{fontWeight:600,fontFamily:"DM Mono,monospace",color:inquiry.supplier_part_no?"var(--green)":"var(--text3)"}}>{inquiry.supplier_part_no||"— not yet provided"}</div></div>
        </FG>
        {inquiry.message&&<div><FL label="Message"/><div style={{fontSize:12,color:"var(--text2)",whiteSpace:"pre-line",lineHeight:1.7,maxHeight:120,overflowY:"auto",background:"var(--surface2)",borderRadius:8,padding:10}}>{inquiry.message}</div></div>}
      </div>
      <FL label="Record Reply (manual entry)"/>
      <FD>
        <FL label="Supplier Part No. / Reference"/>
        <input className="inp" value={spn} onChange={e=>setSpn(e.target.value)} placeholder="Supplier internal part number"/>
      </FD>
      <FG>
        <div><FL label="Reply Price"/><input className="inp" type="number" value={rp} onChange={e=>setRp(e.target.value)} placeholder="0"/></div>
        <div><FL label="Reply Stock"/><input className="inp" type="number" value={rs} onChange={e=>setRs(e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes"/><textarea className="inp" value={rn} onChange={e=>setRn(e.target.value)}/></FD>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>onUpdate(inquiry.id,{reply_price:rp?+rp:null,reply_stock:rs?+rs:null,reply_notes:rn,supplier_part_no:spn,status:"replied",replied_at:new Date().toISOString()})}>Save & Mark Replied</button>
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
      <FD><FL label={t.role}/><select className="inp" value={f.role} onChange={e=>s("role",e.target.value)}><option value="admin">👑 Admin</option><option value="manager">👔 Manager</option><option value="shipper">🚚 Shipper</option><option value="stockman">📦 Stockman</option><option value="customer">👤 Customer</option></select></FD>
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

// ═══════════════════════════════════════════════════════════════
// PDF INVOICE MODAL — print-ready invoice with download
// ═══════════════════════════════════════════════════════════════
function PdfInvoiceModal({inv,settings,onClose}) {
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
function AddPaymentModal({data,customerInvoices,supplierInvoices,onSave,onClose,t,settings}) {
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
function ReportsPage({orders,parts,customers,supplierInvoices,payments,settings,t,lang}) {
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
        <div><h1 style={{fontSize:20,fontWeight:700}}>📊 {t.reports}</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>Business analytics</p></div>
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:22}}>
        {[
          {label:"Total Revenue",value:fmt(totalRevenue),icon:"💰",color:"var(--green)"},
          {label:"Total Orders",value:totalOrders,icon:"📋",color:"var(--blue)"},
          {label:"Inventory Value",value:fmt(totalInventoryValue),icon:"📦",color:"var(--purple)"},
          {label:"Cash Received",value:fmt(totalReceived),icon:"💳",color:"var(--accent)"},
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
            <span style={{fontSize:13,color:"var(--text3)"}}>Period:</span>
            {["daily","monthly","yearly"].map(p=>(
              <button key={p} className={`btn btn-sm ${period===p?"btn-primary":"btn-ghost"}`} onClick={()=>setPeriod(p)} style={{fontSize:12}}>
                {p==="daily"?t.daily:p==="monthly"?t.monthly:t.yearly}
              </button>
            ))}
          </div>
          <div className="card" style={{overflow:"hidden"}}>
            <table className="tbl">
              <thead><tr>{["Period","Orders","Revenue","Avg Order"].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {salesByPeriod.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>No completed orders yet</td></tr>}
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
              {label:"Total Parts",value:parts.length,color:"var(--blue)"},
              {label:"Low Stock",value:lowStockParts.length,color:"var(--yellow)"},
              {label:"Out of Stock",value:outOfStock.length,color:"var(--red)"},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:"16px 20px",textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:s.color,fontFamily:"Rajdhani,sans-serif"}}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:20,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h3 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".05em"}}>📦 Total Inventory Value</h3>
              <span style={{fontSize:24,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(totalInventoryValue)}</span>
            </div>
          </div>
          {lowStockParts.length>0&&(
            <div className="card" style={{overflow:"hidden"}}>
              <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,color:"var(--red)",fontSize:13}}>⚠️ Low Stock Alert ({lowStockParts.length} parts)</div>
              <table className="tbl">
                <thead><tr>{["SKU","Part","Category","Current Stock","Min Stock","Value"].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
          <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13}}>🏆 Top Customers by Spend</div>
          <table className="tbl">
            <thead><tr>{["Rank","Customer","Phone","Orders","Total Spend","Avg Order"].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
              {topCustomers.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>No customer data yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* SUPPLIER REPORT */}
      {reportTab==="suppliers"&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",fontWeight:700,fontSize:13}}>🏭 Supplier Purchase Summary</div>
          <table className="tbl">
            <thead><tr>{["Rank","Supplier","Invoices","Total Purchased","Avg Invoice"].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
              {topSuppliers.length===0&&<tr><td colSpan={5} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>No purchase invoice data yet</td></tr>}
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
function StockMoveModal({part,parts,onSave,onClose,t}) {
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
function StockTakePage({parts,stockTakes,onStart,onComplete,onReopen,onSaveCount,onAdjustItem,t,user,categories=[]}) {
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
          <p style={{color:"var(--text)",fontSize:13,marginTop:3}}>{stockTakes.length} stock takes</p>
        </div>
        {(user.role==="admin" || user.role==="manager") && <button className="btn btn-primary" onClick={()=>{setShowWizard(true);setFilterMode("all");setManualSelected(new Set());setSearchWiz("");}}>
          + {t.startTake}
        </button>}
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <table className="tbl">
          <thead><tr>{["Name","Status","Created By","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {stockTakes.map(st=>(
              <tr key={st.id}>
                <td style={{fontWeight:600}}>{st.name}</td>
                <td><span className="badge" style={{background:st.status==="completed"?"rgba(52,211,153,.12)":st.status==="counted"?"rgba(139,92,246,.12)":"rgba(251,191,36,.12)",color:st.status==="completed"?"var(--green)":st.status==="counted"?"var(--purple)":"var(--yellow)"}}>{st.status==="completed"?"✅ Completed":st.status==="counted"?"📦 Counted":"🔄 Open"}</span></td>
                <td style={{color:"var(--text3)",fontSize:13}}>{st.created_at?.slice(0,16)} · {st.created_by}</td>
                <td>
                  <button className="btn btn-info btn-xs" onClick={()=>openTake(st)}>
                    {st.status==="completed"?"👁 View":st.status==="counted"?"🔍 Review":"▶ Continue"}
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

// ═══════════════════════════════════════════════════════════════
// IMG LIGHTBOX — tries multiple sizes, spinner while loading
// ═══════════════════════════════════════════════════════════════
function ImgLightbox({url, onClose}) {
  // Try sizes in order: w800 → w400 → w200 (original)
  const getSizes = (u) => {
    if(!u) return [u];
    const m = u.match(/thumbnail[?]id=([^&]+)/);
    if(m) return [
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`,
    ];
    return [u];
  };
  const sizes = getSizes(url);
  const [tryIdx, setTryIdx] = useState(0);
  const [status, setStatus] = useState("loading");
  const src = sizes[tryIdx] || url;

  const handleError = () => {
    if(tryIdx < sizes.length-1){
      setTryIdx(i=>i+1); // try next size
    } else {
      setStatus("error");
    }
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed",top:0,left:0,right:0,bottom:0,
        background:"rgba(0,0,0,0.96)",zIndex:99999,
        display:"flex",alignItems:"center",justifyContent:"center",
        transform:"translateZ(0)"}}>

      {/* Spinner */}
      {status==="loading"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,position:"absolute"}}>
          <div style={{width:48,height:48,border:"4px solid rgba(255,255,255,.2)",
            borderTop:"4px solid #fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>Loading photo...</div>
        </div>
      )}

      {/* Error */}
      {status==="error"&&(
        <div style={{textAlign:"center",color:"#fff",padding:30}}>
          <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:15,marginBottom:8}}>Failed to load image</div>
          <div style={{fontSize:11,opacity:.4,wordBreak:"break-all",maxWidth:360}}>{url}</div>
        </div>
      )}

      {/* Image */}
      <img key={src} src={src} alt="part photo"
        style={{maxWidth:"90%",maxHeight:"90%",objectFit:"contain",
          display:status==="ok"?"block":"none",borderRadius:8}}
        onLoad={()=>setStatus("ok")}
        onError={handleError}
        onClick={e=>e.stopPropagation()}/>

      {/* Close */}
      <div onClick={e=>{e.stopPropagation();onClose();}}
        style={{position:"fixed",top:14,right:14,background:"rgba(255,255,255,.15)",
          border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",
          width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:18,fontWeight:700,zIndex:100000}}>✕</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RFQ PUBLIC REPLY PAGE — supplier fills in price (no login)
// ═══════════════════════════════════════════════════════════════
function RfqQuoteReplyPage({token}) {
  const [quote,setQuote]=useState(null);
  const [item,setItem]=useState(null);
  const [session,setSession]=useState(null);
  const [form,setForm]=useState({supplier_part_no:"",unit_price:"",stock_qty:"",lead_days:"",notes:""});
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    api.get("rfq_quotes",`token=eq.${token}&select=*`).then(async r=>{
      if(!Array.isArray(r)||!r[0]){setLoading(false);return;}
      const q=r[0];
      setQuote(q);
      if(q.status==="quoted") setSaved(true);
      setForm({
        supplier_part_no:q.supplier_part_no||"",
        unit_price:q.unit_price||"",
        stock_qty:q.stock_qty||"",
        lead_days:q.lead_days||"",
        notes:q.notes||""
      });
      const [items,sessions]=await Promise.all([
        api.get("rfq_items",`id=eq.${q.rfq_item_id}&select=*`),
        api.get("rfq_sessions",`id=eq.${q.rfq_id}&select=*`)
      ]);
      if(Array.isArray(items)&&items[0]) setItem(items[0]);
      if(Array.isArray(sessions)&&sessions[0]) setSession(sessions[0]);
      setLoading(false);
    });
  },[token]);

  const submit=async()=>{
    if(!form.unit_price){alert("Please enter unit price");return;}
    await api.patch("rfq_quotes","token",token,{
      supplier_part_no:form.supplier_part_no,
      unit_price:+form.unit_price,
      stock_qty:form.stock_qty?+form.stock_qty:null,
      lead_days:form.lead_days?+form.lead_days:null,
      notes:form.notes,
      status:"quoted",
      quoted_at:new Date().toISOString()
    });
    setSaved(true);
  };

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{color:"#f97316",fontSize:15}}>⏳ Loading...</div>
    </div>
  );

  if(!quote) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",color:"#fff",padding:40}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:16}}>Invalid or expired RFQ link</div>
      </div>
    </div>
  );

  return (
    <div style={{background:"#0a0e1a",minHeight:"100vh",padding:20,display:"flex",alignItems:"flex-start",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:480,paddingTop:20}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:700,color:"var(--accent)"}}>📋 RFQ Quote Request</div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:4}}>From: {quote.supplier_name||"Supplier"}</div>
        </div>

        {/* Part info */}
        {item&&(
          <div className="card" style={{padding:16,marginBottom:16,background:"var(--surface2)"}}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Part Details</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:13}}>
              <div><span style={{color:"var(--text3)"}}>Part: </span><strong>{item.part_name}</strong></div>
              <div><span style={{color:"var(--text3)"}}>SKU: </span><code style={{fontFamily:"DM Mono,monospace"}}>{item.part_sku}</code></div>
              {item.part_chinese_desc&&<div style={{gridColumn:"1/-1"}}><span style={{color:"var(--text3)"}}>中文: </span>{item.part_chinese_desc}</div>}
              {item.oe_number&&<div><span style={{color:"var(--text3)"}}>OE#: </span>{item.oe_number}</div>}
              {item.make&&<div><span style={{color:"var(--text3)"}}>Vehicle: </span>{item.make} {item.model}</div>}
              <div style={{gridColumn:"1/-1",background:"rgba(251,146,60,.1)",borderRadius:8,padding:"8px 12px",marginTop:4}}>
                <span style={{color:"var(--text3)"}}>Qty Needed: </span>
                <strong style={{color:"var(--accent)",fontSize:18,fontFamily:"Rajdhani,sans-serif"}}>{item.qty_needed}</strong>
              </div>
            </div>
          </div>
        )}

        {saved?(
          <div className="card" style={{padding:24,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Quote Submitted!</div>
            <div style={{color:"var(--text3)",fontSize:13}}>Thank you. Your quote has been received.</div>
            {quote.unit_price&&<div style={{marginTop:12,color:"var(--accent)",fontSize:20,fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>Quoted: {quote.unit_price}</div>}
            <button className="btn btn-ghost" style={{marginTop:16,width:"100%"}} onClick={()=>setSaved(false)}>Edit Quote</button>
          </div>
        ):(
          <div className="card" style={{padding:20}}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:14}}>Your Quote</div>
            <FD><FL label="Your Part Number (optional)"/>
              <input className="inp" value={form.supplier_part_no} onChange={e=>setForm(p=>({...p,supplier_part_no:e.target.value}))} placeholder="Your internal part number"/></FD>
            <FG>
              <div><FL label="Unit Price *"/>
                <input className="inp" type="number" value={form.unit_price} onChange={e=>setForm(p=>({...p,unit_price:e.target.value}))} placeholder="0.00" step="0.01"/></div>
              <div><FL label="Stock Available"/>
                <input className="inp" type="number" value={form.stock_qty} onChange={e=>setForm(p=>({...p,stock_qty:e.target.value}))} placeholder="qty"/></div>
            </FG>
            <FD><FL label="Lead Time (days)"/>
              <input className="inp" type="number" value={form.lead_days} onChange={e=>setForm(p=>({...p,lead_days:e.target.value}))} placeholder="e.g. 7"/></FD>
            <FD><FL label="Notes"/>
              <textarea className="inp" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Any conditions, MOQ, etc." style={{minHeight:70}}/></FD>
            <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,marginTop:4}} onClick={submit}>
              📤 Submit Quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUOTE CONFIRM PAGE — public page for customer approval
// ═══════════════════════════════════════════════════════════════
function QuoteConfirmPage({token}) {
  const [quote,setQuote]=useState(null);
  const [job,setJob]=useState(null);
  const [items,setItems]=useState([]);
  const [shopSettings,setShopSettings]=useState({});
  const [loading,setLoading]=useState(true);
  const [note,setNote]=useState("");
  const [done,setDone]=useState(null); // null | "confirmed" | "declined"
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    (async()=>{
      const [qs,ss]=await Promise.all([
        api.get("workshop_quotes",`confirm_token=eq.${token}&select=*`).catch(()=>[]),
        api.get("settings","id=eq.1&select=*").catch(()=>[]),
      ]);
      const q=Array.isArray(qs)&&qs[0]?qs[0]:null;
      if(q){
        setQuote(q);
        if(q.confirm_status==="confirmed"||q.confirm_status==="declined") setDone(q.confirm_status);
        const [ji,jj]=await Promise.all([
          api.get("workshop_job_items",`job_id=eq.${q.job_id}&select=*`).catch(()=>[]),
          api.get("workshop_jobs",`id=eq.${q.job_id}&select=*`).catch(()=>[]),
        ]);
        setItems(Array.isArray(ji)?ji:[]);
        if(Array.isArray(jj)&&jj[0]) setJob(jj[0]);
      }
      if(Array.isArray(ss)&&ss[0]) setShopSettings(ss[0]);
      setLoading(false);
    })();
  },[token]);

  const respond=async(status)=>{
    setSaving(true);
    try{
      await api.patch("workshop_quotes","confirm_token",token,{
        confirm_status:status,
        confirmed_at:new Date().toISOString(),
        customer_note:note.trim()||null,
      });
      setDone(status);
    }catch(e){ alert("Failed to submit: "+e.message); }
    finally{ setSaving(false); }
  };

  const sym=curSym(shopSettings.currency||"R");
  const fmt=v=>`${sym} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const shopName=shopSettings.shop_name||"Auto Workshop";

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{color:"#f97316",fontSize:15}}>⏳ Loading quotation...</div>
    </div>
  );

  if(!quote) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",color:"#fff",padding:40}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:600}}>Quotation not found</div>
        <div style={{fontSize:13,color:"#888",marginTop:8}}>This link may be invalid or expired.</div>
      </div>
    </div>
  );

  return (
    <div style={{background:"#0a0e1a",minHeight:"100vh",padding:"20px 16px",display:"flex",alignItems:"flex-start",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:520,paddingTop:16}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,marginBottom:6}}>🔧</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:700,color:"var(--accent)"}}>{shopName}</div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:4}}>Workshop Quotation Approval</div>
        </div>

        {done?(
          <div className="card" style={{padding:32,textAlign:"center"}}>
            <div style={{fontSize:56,marginBottom:12}}>{done==="confirmed"?"✅":"❌"}</div>
            <div style={{fontSize:20,fontWeight:700,marginBottom:8,color:done==="confirmed"?"var(--green)":"var(--red)"}}>
              {done==="confirmed"?"Quotation Approved!":"Quotation Declined"}
            </div>
            <div style={{color:"var(--text3)",fontSize:14,lineHeight:1.6}}>
              {done==="confirmed"
                ?"Thank you! We will proceed with the work as quoted. We will contact you shortly."
                :"Thank you for your response. We will get in touch to discuss alternatives."}
            </div>
            <div style={{marginTop:16,fontSize:13,color:"var(--text3)"}}>
              {shopSettings.phone&&<div>📞 {shopSettings.phone}</div>}
              {shopSettings.email&&<div>✉️ {shopSettings.email}</div>}
            </div>
          </div>
        ):(
          <>
            {/* Quote info */}
            <div className="card" style={{padding:16,marginBottom:14,borderLeft:"3px solid var(--blue)"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:12}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>📝 Quotation <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{quote.id}</code></div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>Date: {quote.quote_date}{quote.valid_until&&` · Valid until: ${quote.valid_until}`}</div>
                </div>
                <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:22,color:"var(--accent)"}}>{fmt(quote.total)}</div>
              </div>
              {/* Vehicle / Customer */}
              <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:13}}>
                {job?.vehicle_reg&&<span className="badge" style={{background:"var(--surface2)",fontFamily:"DM Mono,monospace"}}>🚗 {job.vehicle_reg}</span>}
                {(job?.vehicle_make||job?.vehicle_model)&&<span className="badge" style={{background:"var(--surface2)"}}>{job.vehicle_make} {job.vehicle_model} {job.vehicle_year||""}</span>}
                {quote.quote_customer&&<span className="badge" style={{background:"var(--surface2)"}}>👤 {quote.quote_customer}</span>}
              </div>
            </div>

            {/* Line items */}
            <div className="card" style={{padding:0,marginBottom:14,overflow:"hidden"}}>
              <div style={{padding:"10px 16px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)",background:"var(--surface2)"}}>📋 Work Items</div>
              {items.length===0
                ? <div style={{padding:16,color:"var(--text3)",fontSize:13,textAlign:"center"}}>No items found</div>
                : items.map((it,i)=>(
                  <div key={it.id||i} style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13}}>{it.description}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                        {it.type==="part"?"🔩 Part":"👷 Labour"} · Qty: {it.qty} × {fmt(it.unit_price)}
                      </div>
                    </div>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",flexShrink:0}}>{fmt(it.total)}</div>
                  </div>
                ))
              }
              <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",background:"var(--surface2)"}}>
                <span style={{fontWeight:700,fontSize:13}}>Total</span>
                <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:18,color:"var(--accent)"}}>{fmt(quote.total)}</span>
              </div>
            </div>

            {/* Notes from workshop */}
            {quote.notes&&(
              <div className="card" style={{padding:"10px 16px",marginBottom:14,background:"rgba(96,165,250,.06)",borderLeft:"3px solid var(--blue)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Workshop Notes</div>
                <div style={{fontSize:13}}>{quote.notes}</div>
              </div>
            )}

            {/* Customer note */}
            <div style={{marginBottom:14}}>
              <FL label="Your message (optional)"/>
              <textarea className="inp" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Any questions or comments for the workshop..."/>
            </div>

            {/* Action buttons */}
            <div style={{display:"flex",gap:12,marginBottom:24}}>
              <button className="btn" style={{flex:1,padding:16,fontSize:15,fontWeight:700,background:"rgba(248,113,113,.15)",color:"var(--red)",border:"2px solid rgba(248,113,113,.4)",borderRadius:12}}
                onClick={()=>respond("declined")} disabled={saving}>
                ❌ Decline
              </button>
              <button className="btn btn-primary" style={{flex:2,padding:16,fontSize:15,fontWeight:700,borderRadius:12}}
                onClick={()=>respond("confirmed")} disabled={saving}>
                {saving?"Submitting...":"✅ Approve & Confirm"}
              </button>
            </div>

            {/* Workshop contact */}
            <div style={{textAlign:"center",color:"var(--text3)",fontSize:12}}>
              <div style={{marginBottom:4}}>Questions? Contact us:</div>
              {shopSettings.phone&&<div>📞 {shopSettings.phone}</div>}
              {shopSettings.email&&<div>✉️ {shopSettings.email}</div>}
              {shopSettings.address&&<div>📍 {shopSettings.address}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RFQ PAGE — main management page
// ═══════════════════════════════════════════════════════════════
function RfqPage({parts,suppliers,rfqSessions,rfqItems,rfqQuotes,onCreate,onUpdateStatus,onSelectQuote,onCreatePO,t,user,settings}) {
  const [view,setView]=useState("list"); // list | create | detail
  const [activeSession,setActiveSession]=useState(null);

  // ── Create wizard state ──
  const [wName,setWName]=useState(`RFQ ${new Date().toISOString().slice(0,10)}`);
  const [wDeadline,setWDeadline]=useState("");
  const [wParts,setWParts]=useState([]); // [{...part, qty_needed:1}]
  const [wSuppliers,setWSuppliers]=useState([]);
  const [wStep,setWStep]=useState(1); // 1=parts 2=suppliers 3=review
  const [wSearch,setWSearch]=useState("");
  const [wSupSearch,setWSupSearch]=useState("");

  const filteredParts=wSearch?parts.filter(p=>(p.name+p.sku+p.chinese_desc).toLowerCase().includes(wSearch.toLowerCase())):parts;
  const togglePart=(p)=>setWParts(prev=>{
    const ex=prev.find(x=>x.id===p.id);
    return ex?prev.filter(x=>x.id!==p.id):[...prev,{...p,qty_needed:1}];
  });
  const setQty=(id,qty)=>setWParts(prev=>prev.map(p=>p.id===id?{...p,qty_needed:+qty||1}:p));
  const toggleSupplier=(s)=>setWSuppliers(prev=>prev.find(x=>x.id===s.id)?prev.filter(x=>x.id!==s.id):[...prev,s]);

  // ── Detail view ──
  const openSession=(s)=>{setActiveSession(s);setView("detail");};

  if(view==="create") return (
    <div className="fu">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>{setView("list");setWStep(1);setWParts([]);setWSuppliers([]);}}>← Back</button>
        <h1 style={{fontSize:20,fontWeight:700}}>📋 {t.newRfq}</h1>
      </div>

      {/* Step indicator */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:10,overflow:"hidden",border:"1px solid var(--border)"}}>
        {[["1","Select Parts"],["2","Select Suppliers"],["3","Review & Send"]].map(([n,lb],i)=>(
          <div key={n} style={{flex:1,padding:"10px 8px",textAlign:"center",fontSize:13,fontWeight:600,
            background:wStep===i+1?"var(--accent)":wStep>i+1?"var(--surface3)":"var(--surface2)",
            color:wStep===i+1?"#fff":wStep>i+1?"var(--green)":"var(--text3)",
            borderRight:i<2?"1px solid var(--border)":"none",cursor:wStep>i+1?"pointer":"default"}}
            onClick={()=>{if(wStep>i+1)setWStep(i+1);}}>
            {wStep>i+1?"✓ ":""}{lb}
          </div>
        ))}
      </div>

      {/* Step 1 — Select Parts */}
      {wStep===1&&(
        <div>
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              <input className="inp" value={wName} onChange={e=>setWName(e.target.value)} placeholder="RFQ name" style={{flex:2,minWidth:180}}/>
              <input className="inp" type="date" value={wDeadline} onChange={e=>setWDeadline(e.target.value)} style={{flex:1,minWidth:140}} title="Deadline (optional)"/>
            </div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
              <input className="inp" style={{paddingLeft:34}} value={wSearch} onChange={e=>setWSearch(e.target.value)} placeholder="Search parts..."/>
            </div>
          </div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>{wParts.length} selected · {filteredParts.length} shown</div>
          <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",maxHeight:380,overflowY:"auto"}}>
            {filteredParts.map(p=>{
              const sel=wParts.find(x=>x.id===p.id);
              return (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                  borderBottom:"1px solid var(--border)",
                  background:sel?"rgba(251,146,60,.06)":"transparent",cursor:"pointer"}}
                  onClick={()=>togglePart(p)}>
                  <input type="checkbox" checked={!!sel} onChange={()=>togglePart(p)}
                    style={{accentColor:"var(--accent)",width:16,height:16,flexShrink:0}} onClick={e=>e.stopPropagation()}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{p.sku}{p.chinese_desc&&" · "+p.chinese_desc}</div>
                  </div>
                  <div style={{fontSize:12,color:"var(--text2)",flexShrink:0}}>Stock: <strong>{p.stock}</strong></div>
                  {sel&&(
                    <div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:12,color:"var(--text3)"}}>Qty:</span>
                      <input type="number" className="inp" min={1} value={sel.qty_needed}
                        onChange={e=>setQty(p.id,e.target.value)}
                        style={{width:60,padding:"4px 6px",textAlign:"center",fontSize:13}}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary" style={{width:"100%",marginTop:14,padding:12}}
            disabled={wParts.length===0}
            onClick={()=>setWStep(2)}>
            Next → Select Suppliers ({wParts.length} parts selected)
          </button>
        </div>
      )}

      {/* Step 2 — Select Suppliers */}
      {wStep===2&&(
        <div>
          <div style={{position:"relative",marginBottom:12}}>
            <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="inp" style={{paddingLeft:34}} value={wSupSearch} onChange={e=>setWSupSearch(e.target.value)} placeholder="Search suppliers..."/>
          </div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>{wSuppliers.length} selected</div>
          <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",maxHeight:400,overflowY:"auto"}}>
            {suppliers.filter(s=>!wSupSearch||(s.name+s.email+s.phone).toLowerCase().includes(wSupSearch.toLowerCase())).map(s=>{
              const sel=wSuppliers.find(x=>x.id===s.id);
              return (
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",
                  borderBottom:"1px solid var(--border)",background:sel?"rgba(251,146,60,.06)":"transparent",cursor:"pointer"}}
                  onClick={()=>toggleSupplier(s)}>
                  <input type="checkbox" checked={!!sel} onChange={()=>toggleSupplier(s)}
                    style={{accentColor:"var(--accent)",width:16,height:16,flexShrink:0}} onClick={e=>e.stopPropagation()}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14}}>{s.name}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                      {s.phone&&<span style={{marginRight:10}}>📞 {s.phone}</span>}
                      {s.email&&<span>✉ {s.email}</span>}
                    </div>
                  </div>
                  {sel&&<span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)"}}>✓</span>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setWStep(1)}>← Back</button>
            <button className="btn btn-primary" style={{flex:2,padding:12}}
              disabled={wSuppliers.length===0}
              onClick={()=>setWStep(3)}>
              Next → Review ({wSuppliers.length} suppliers)
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review & Send */}
      {wStep===3&&(
        <div>
          <div className="card" style={{padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📋 {wName}</div>
            {wDeadline&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Deadline: {wDeadline}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"var(--surface2)",borderRadius:8,padding:10}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:6}}>PARTS ({wParts.length})</div>
                {wParts.map(p=>(
                  <div key={p.id} style={{fontSize:12,padding:"3px 0",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between"}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</span>
                    <span style={{color:"var(--accent)",fontWeight:700,marginLeft:8,flexShrink:0}}>×{p.qty_needed}</span>
                  </div>
                ))}
              </div>
              <div style={{background:"var(--surface2)",borderRadius:8,padding:10}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:6}}>SUPPLIERS ({wSuppliers.length})</div>
                {wSuppliers.map(s=>(
                  <div key={s.id} style={{fontSize:12,padding:"3px 0",borderBottom:"1px solid var(--border)"}}>
                    {s.name}
                    <div style={{fontSize:11,color:"var(--text3)"}}>{s.phone||s.email}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{marginTop:10,padding:"8px 12px",background:"rgba(251,146,60,.08)",borderRadius:8,fontSize:13,color:"var(--text2)"}}>
              📬 {wParts.length * wSuppliers.length} quote requests will be created
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setWStep(2)}>← Back</button>
            <button className="btn btn-primary" style={{flex:2,padding:13,fontSize:15}}
              onClick={async()=>{
                const sid=await onCreate(wName,wDeadline,wParts,wSuppliers);
                if(sid){setView("list");setWStep(1);setWParts([]);setWSuppliers([]);}
              }}>
              ✅ Create RFQ & Generate Links
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Detail view ──
  if(view==="detail"&&activeSession) {
    const sessionItems=rfqItems.filter(i=>i.rfq_id===activeSession.id);
    const sessionQuotes=rfqQuotes.filter(q=>q.rfq_id===activeSession.id);
    const allSuppliers=[...new Set(sessionQuotes.map(q=>q.supplier_id))].map(sid=>({
      id:sid, name:sessionQuotes.find(q=>q.supplier_id===sid)?.supplier_name
    }));
    const quotedCount=sessionQuotes.filter(q=>q.status==="quoted").length;
    const totalQuotes=sessionQuotes.length;
    const cur=curSym(settings.currency||"R");

    return (
      <div className="fu">
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setView("list")}>← Back</button>
          <div style={{flex:1}}>
            <h1 style={{fontSize:20,fontWeight:700}}>{activeSession.name}</h1>
            <div style={{fontSize:13,color:"var(--text3)",marginTop:2}}>
              {quotedCount}/{totalQuotes} quotes received · {sessionItems.length} parts · {allSuppliers.length} suppliers
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {activeSession.status==="ordered"
              ? <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",padding:"6px 14px"}}>✅ Ordered</span>
              : <button className="btn btn-primary" onClick={()=>onCreatePO(activeSession.id)}>🛒 Create PO from Selected</button>
            }
          </div>
        </div>

        {/* Progress */}
        <div style={{background:"var(--surface2)",borderRadius:99,height:6,marginBottom:16,overflow:"hidden"}}>
          <div style={{background:"var(--green)",height:"100%",borderRadius:99,width:`${totalQuotes?quotedCount/totalQuotes*100:0}%`,transition:"width .3s"}}/>
        </div>

        {/* Comparison table */}
        <div className="card" style={{overflow:"hidden"}}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{minWidth:180}}>Part</th>
                  <th style={{textAlign:"center"}}>Need</th>
                  {allSuppliers.map(s=>(
                    <th key={s.id} style={{minWidth:160,textAlign:"center",borderLeft:"2px solid var(--border)"}}>
                      <div>{s.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionItems.map(item=>{
                  const itemQuotes=sessionQuotes.filter(q=>q.rfq_item_id===item.id);
                  const quotedPrices=itemQuotes.filter(q=>q.status==="quoted"&&q.unit_price!=null).map(q=>q.unit_price);
                  const minPrice=quotedPrices.length?Math.min(...quotedPrices):null;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{fontWeight:600,fontSize:13}}>{item.part_name}</div>
                        <div style={{fontSize:11,color:"var(--text3)"}}>{item.part_sku}{item.oe_number&&" · "+item.oe_number}</div>
                      </td>
                      <td style={{textAlign:"center",fontWeight:700,color:"var(--accent)"}}>{item.qty_needed}</td>
                      {allSuppliers.map(s=>{
                        const q=itemQuotes.find(x=>x.supplier_id===s.id);
                        const isBest=q?.unit_price!=null&&q.unit_price===minPrice&&quotedPrices.length>1;
                        const replyUrl=`${window.location.origin}${window.location.pathname}?rfq_quote=${q?.token}`;
                        return (
                          <td key={s.id} style={{textAlign:"center",borderLeft:"2px solid var(--border)",
                            background:q?.status==="selected"?"rgba(52,211,153,.08)":undefined}}>
                            {!q||(q.status==="pending")?(
                              <div>
                                <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>⏳ Awaiting</div>
                                <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                                  {s.phone&&<a href={`https://wa.me/${s.phone}?text=${encodeURIComponent(`Hi, please quote for: ${item.part_name} (${item.part_sku})\nQty: ${item.qty_needed}\n\nSubmit quote: ${replyUrl}`)}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                                    <button className="cp-btn" style={{fontSize:10,padding:"2px 8px",color:"#25D366",borderColor:"rgba(37,211,102,.3)"}}>📲 WA</button>
                                  </a>}
                                  {s.email&&<a href={`mailto:${s.email}?subject=RFQ: ${item.part_name}&body=${encodeURIComponent(`Please quote for:\n${item.part_name} (${item.part_sku})\nQty: ${item.qty_needed}\n\nSubmit quote here: ${replyUrl}`)}`} style={{textDecoration:"none"}}>
                                    <button className="cp-btn" style={{fontSize:10,padding:"2px 8px"}}>✉</button>
                                  </a>}
                                  <button className="cp-btn" style={{fontSize:10,padding:"2px 8px"}}
                                    onClick={()=>navigator.clipboard.writeText(replyUrl).then(()=>alert("Link copied!"))}>🔗</button>
                                </div>
                              </div>
                            ):(
                              <div>
                                <div style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",
                                  color:isBest?"var(--green)":q.status==="selected"?"var(--accent)":"var(--text)"}}>
                                  {cur}{q.unit_price?.toLocaleString()}
                                  {isBest&&<span style={{fontSize:10,marginLeft:4,color:"var(--green)"}}>★ Best</span>}
                                </div>
                                {q.stock_qty!=null&&<div style={{fontSize:11,color:"var(--text3)"}}>Stock: {q.stock_qty}</div>}
                                {q.lead_days!=null&&<div style={{fontSize:11,color:"var(--text3)"}}>Lead: {q.lead_days}d</div>}
                                {q.notes&&<div style={{fontSize:11,color:"var(--text3)",fontStyle:"italic",maxWidth:140,margin:"2px auto"}}>{q.notes}</div>}
                                {q.status!=="selected"
                                  ? <button className="cp-btn" style={{fontSize:11,marginTop:6,color:"var(--accent)",borderColor:"rgba(251,146,60,.3)"}}
                                      onClick={()=>onSelectQuote(q.id,item.id)}>Select</button>
                                  : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11,display:"inline-block",marginTop:4}}>✓ Selected</span>
                                }
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📋 {t.rfqSession}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{rfqSessions.length} sessions</p>
        </div>
        <button className="btn btn-primary" onClick={()=>{setView("create");setWStep(1);setWParts([]);setWSuppliers([]);}}>
          + {t.newRfq}
        </button>
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <table className="tbl">
          <thead><tr>{["Name","Status","Parts","Suppliers","Quotes","Created","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rfqSessions.map(s=>{
              const sItems=rfqItems.filter(i=>i.rfq_id===s.id);
              const sQuotes=rfqQuotes.filter(q=>q.rfq_id===s.id);
              const sSupps=[...new Set(sQuotes.map(q=>q.supplier_id))];
              const quotedCnt=sQuotes.filter(q=>q.status==="quoted").length;
              const statusColor={draft:"var(--text3)",sent:"var(--blue)",comparing:"var(--yellow)",ordered:"var(--green)"}[s.status]||"var(--text3)";
              return (
                <tr key={s.id}>
                  <td style={{fontWeight:600}}>{s.name}</td>
                  <td><span className="badge" style={{background:statusColor+"20",color:statusColor,textTransform:"capitalize"}}>{s.status}</span></td>
                  <td style={{textAlign:"center"}}>{sItems.length}</td>
                  <td style={{textAlign:"center"}}>{sSupps.length}</td>
                  <td style={{textAlign:"center"}}>
                    <span style={{color:quotedCnt===sQuotes.length&&sQuotes.length>0?"var(--green)":"var(--text2)"}}>{quotedCnt}/{sQuotes.length}</span>
                  </td>
                  <td style={{color:"var(--text3)",fontSize:13}}>{s.created_at?.slice(0,10)}</td>
                  <td><button className="btn btn-info btn-xs" onClick={()=>openSession(s)}>View →</button></td>
                </tr>
              );
            })}
            {rfqSessions.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No RFQ sessions yet — click "+ New RFQ" to start</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PICKING PAGE — Order picking with barcode/QR scan + camera
// ═══════════════════════════════════════════════════════════════
function PickingPage({orders=[], parts=[], onComplete, onRefresh, t, lang}) {
  const [activeOrder, setActiveOrder] = useState(null);
  const [picked, setPicked] = useState({}); // {itemIndex: true}
  const [scanInput, setScanInput] = useState("");
  const [scanMode, setScanMode] = useState(false); // camera scanner
  const [cameraPhoto, setCameraPhoto] = useState(null); // photo evidence
  const [photoView, setPhotoView] = useState(null); // lightbox
  const [scanFeedback, setScanFeedback] = useState(null); // {type:"ok"|"err", msg}
  const [completing, setCompleting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const pendingOrders = (orders||[]).filter(o => o.status === "Processing");
  const activeItems = activeOrder?.items || [];
  const pickedCount = Object.keys(picked).length;
  const allPicked = activeItems.length > 0 && pickedCount === activeItems.length;

  // ── Camera scanner ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanMode(true);
    } catch(e) {
      alert("Camera not available: " + e.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanMode(false);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCameraPhoto(dataUrl);
    stopCamera();
    showFeedback("ok", "📷 Photo captured");
  };

  // ── Barcode/QR match ──
  const tryMatch = (scan) => {
    if (!scan.trim() || !activeOrder) return;
    const s = scan.trim().toLowerCase();
    const idx = activeItems.findIndex((item, i) => {
      if (picked[i]) return false; // already picked
      const part = parts.find(p => String(p.id) === String(item.partId));
      return (
        (part?.sku || "").toLowerCase() === s ||
        (part?.oe_number || "").toLowerCase() === s ||
        (item.name || "").toLowerCase().includes(s) ||
        (part?.barcode || "").toLowerCase() === s
      );
    });
    if (idx >= 0) {
      setPicked(p => ({ ...p, [idx]: true }));
      showFeedback("ok", `✅ ${activeItems[idx].name} — confirmed!`);
    } else {
      showFeedback("err", `❌ No match for "${scan}"`);
    }
    setScanInput("");
  };

  const showFeedback = (type, msg) => {
    setScanFeedback({ type, msg });
    setTimeout(() => setScanFeedback(null), 2500);
  };

  const confirmPick = (idx) => {
    setPicked(p => ({ ...p, [idx]: true }));
    showFeedback("ok", `✅ ${activeItems[idx].name}`);
  };

  const complete = async () => {
    setCompleting(true);
    await onComplete(activeOrder.id);
    setActiveOrder(null);
    setPicked({});
    setCameraPhoto(null);
    setCompleting(false);
  };

  // Cleanup camera on unmount
  useEffect(() => () => stopCamera(), []);

  // ── Order list view ──
  if (!activeOrder) return (
    <div className="fu">
      {photoView&&<ImgLightbox url={photoView} onClose={()=>setPhotoView(null)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🔍 {t.picking}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{pendingOrders.length} orders to pick</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh">🔄 Refresh</button>
      </div>
      {pendingOrders.length === 0 ? (
        <div className="card" style={{padding:48,textAlign:"center",color:"var(--text3)"}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontSize:16,fontWeight:600}}>All orders picked!</div>
          <div style={{fontSize:13,marginTop:6}}>No pending orders to pick.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pendingOrders.map(o => (
            <div key={o.id} className="card card-hover"
              onClick={() => { setActiveOrder(o); setPicked({}); setCameraPhoto(null); }}
              style={{padding:16,cursor:"pointer",borderLeft:"3px solid var(--accent)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{o.customer_name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                    <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{o.id}</code>
                    <span style={{marginLeft:8}}>{o.date}</span>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <StatusBadge status={o.status}/>
                  <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16,marginTop:4}}>{fmtAmt(o.total)}</div>
                </div>
              </div>
              <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                {(o.items||[]).map((item,i) => (
                  <span key={i} className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:11}}>
                    {item.name} ×{item.qty}
                  </span>
                ))}
              </div>
              <button className="btn btn-primary btn-sm" style={{marginTop:12,width:"100%"}}
                onClick={e=>{e.stopPropagation();setActiveOrder(o);setPicked({});setCameraPhoto(null);}}>
                🔍 {t.startPicking}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Active picking view ──
  return (
    <div className="fu">
      {photoView&&<ImgLightbox url={photoView} onClose={()=>setPhotoView(null)}/>}
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>{stopCamera();setActiveOrder(null);}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:16}}>{activeOrder.customer_name}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{activeOrder.id} · {activeOrder.date}</div>
        </div>
        <div style={{fontWeight:700,color:allPicked?"var(--green)":"var(--accent)",fontSize:15}}>
          {pickedCount}/{activeItems.length} picked
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh">🔄</button>
      </div>

      {/* Progress bar */}
      <div style={{background:"var(--surface2)",borderRadius:99,height:8,marginBottom:16,overflow:"hidden"}}>
        <div style={{background:allPicked?"var(--green)":"var(--accent)",height:"100%",borderRadius:99,
          width:`${activeItems.length?pickedCount/activeItems.length*100:0}%`,transition:"width .3s"}}/>
      </div>

      {/* Scan feedback */}
      {scanFeedback&&(
        <div style={{padding:"10px 16px",borderRadius:10,marginBottom:12,fontWeight:600,fontSize:14,
          background:scanFeedback.type==="ok"?"rgba(52,211,153,.15)":"rgba(248,113,113,.15)",
          color:scanFeedback.type==="ok"?"var(--green)":"var(--red)",
          border:`1px solid ${scanFeedback.type==="ok"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`}}>
          {scanFeedback.msg}
        </div>
      )}

      {/* Scan input */}
      {!scanMode&&(
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="inp" style={{paddingLeft:34}}
              value={scanInput} onChange={e=>setScanInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){tryMatch(scanInput);}}}
              placeholder="Scan barcode / type SKU + Enter..."
              autoFocus/>
          </div>
          <button className="btn btn-primary" onClick={()=>tryMatch(scanInput)}>
            ✓
          </button>
          <button className="btn btn-ghost" onClick={startCamera} title="Open camera">
            📷
          </button>
          <button className="btn btn-ghost" onClick={()=>fileRef.current?.click()} title="Take photo">
            🖼
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{display:"none"}}
            onChange={e=>{
              const file=e.target.files[0];
              if(!file)return;
              const reader=new FileReader();
              reader.onload=ev=>{ setCameraPhoto(ev.target.result); showFeedback("ok","📷 Photo saved"); };
              reader.readAsDataURL(file);
            }}/>
        </div>
      )}

      {/* Camera view */}
      {scanMode&&(
        <div style={{marginBottom:14,borderRadius:12,overflow:"hidden",position:"relative",background:"#000"}}>
          <video ref={videoRef} autoPlay playsInline
            style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block"}}/>
          <div style={{position:"absolute",bottom:0,left:0,right:0,display:"flex",gap:8,padding:12,background:"rgba(0,0,0,.5)"}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={takePhoto}>📷 Capture</button>
            <button className="btn btn-ghost" style={{flex:1,color:"#fff",borderColor:"rgba(255,255,255,.3)"}} onClick={stopCamera}>✕ Cancel</button>
          </div>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:220,height:140,border:"2px solid rgba(251,146,60,.8)",borderRadius:8,pointerEvents:"none"}}/>
        </div>
      )}

      {/* Photo evidence */}
      {cameraPhoto&&(
        <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:10,padding:10,
          background:"rgba(52,211,153,.08)",borderRadius:10,border:"1px solid rgba(52,211,153,.2)"}}>
          <img src={cameraPhoto} alt="evidence"
            style={{width:60,height:60,objectFit:"cover",borderRadius:8,cursor:"zoom-in"}}
            onClick={()=>setPhotoView(cameraPhoto)}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--green)"}}>📷 Photo evidence saved</div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Tap photo to enlarge</div>
          </div>
          <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
            onClick={()=>setCameraPhoto(null)}>✕</button>
        </div>
      )}

      {/* Items list */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {activeItems.map((item, idx) => {
          const part = parts.find(p => String(p.id) === String(item.partId));
          const isPicked = !!picked[idx];
          const imgUrl = part?.image_url ? toImgUrl(part.image_url) : null;
          return (
            <div key={idx} className="card"
              style={{padding:14,borderLeft:`3px solid ${isPicked?"var(--green)":"var(--border)"}`,
                background:isPicked?"rgba(52,211,153,.04)":undefined,
                opacity:isPicked?0.7:1,transition:"all .2s"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                {/* Photo — tappable to enlarge */}
                <div style={{flexShrink:0,cursor:imgUrl?"zoom-in":"default"}}
                  onClick={()=>imgUrl&&setPhotoView(toFullUrl(part.image_url))}>
                  {imgUrl
                    ? <img src={imgUrl} alt={item.name}
                        style={{width:64,height:64,objectFit:"contain",borderRadius:10,
                          background:"var(--surface2)",border:`2px solid ${isPicked?"var(--green)":"var(--border)"}`}}/>
                    : <div style={{width:64,height:64,borderRadius:10,background:"var(--surface2)",
                        border:`2px solid ${isPicked?"var(--border)":"var(--border)"}`,
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🔩</div>
                  }
                  {/* Picked checkmark overlay */}
                  {isPicked&&(
                    <div style={{marginTop:4,textAlign:"center",fontSize:18,color:"var(--green)",fontWeight:700}}>✓</div>
                  )}
                </div>
                {/* Part info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:4,lineHeight:1.3}}>
                    {item.name}
                  </div>
                  {part?.chinese_desc&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>{part.chinese_desc}</div>}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                    {part?.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{part.sku}</code>}
                    {part?.bin_location&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)",background:"rgba(96,165,250,.1)",padding:"2px 8px",borderRadius:5,fontWeight:600}}>📦 {part.bin_location}</span>}
                    {part?.oe_number&&<span style={{fontSize:11,color:"var(--text3)"}}>OE: {part.oe_number}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {/* Qty badge */}
                    <span style={{fontWeight:800,fontSize:22,fontFamily:"Rajdhani,sans-serif",
                      color:"var(--accent)"}}>×{item.qty}</span>
                    {/* Pick button */}
                    {!isPicked
                      ? <button className="btn btn-primary" style={{flex:1,padding:"8px 0",fontWeight:700,fontSize:14}}
                          onClick={()=>confirmPick(idx)}>✓ Pick</button>
                      : <span className="badge" style={{background:"rgba(52,211,153,.15)",color:"var(--green)",fontSize:13,padding:"6px 14px",fontWeight:700}}>✅ Picked</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete button */}
      <div style={{marginTop:20,position:"sticky",bottom:80}}>
        {allPicked ? (
          <button className="btn btn-primary" style={{width:"100%",padding:16,fontSize:16,fontWeight:700}}
            onClick={complete} disabled={completing}>
            {completing?"⏳ Processing...":"🚚 Confirm & Mark Ready to Ship"}
          </button>
        ) : (
          <div style={{textAlign:"center",padding:"12px 0",fontSize:13,color:"var(--text3)"}}>
            {activeItems.length - pickedCount} item{activeItems.length-pickedCount!==1?"s":""} remaining to pick
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PART PHOTO UPLOADER
// Uses Google Apps Script Web App to upload to Google Drive
// ═══════════════════════════════════════════════════════════════
function PartPhotoUploader({imageUrl, onChange, sku, t}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [error, setError]         = useState(null);
  const fileRef = useRef(null);

  // ⚙️ Paste your Apps Script Web App URL here after deploying
  // Settings → System → paste your Apps Script URL
  // Read directly from _settings cache to avoid timing issues
  const SCRIPT_URL = (typeof window._VEHICLE_SCRIPT_URL==="string"&&window._VEHICLE_SCRIPT_URL)
    || (typeof window._APPS_SCRIPT_URL==="string"&&window._APPS_SCRIPT_URL)
    || "";
  // Debug - log what URL is being used
  if(!SCRIPT_URL) console.warn("No vehicle script URL configured");
  else console.log("Vehicle upload URL:", SCRIPT_URL.slice(0,60)+"...");

  const uploadToGDrive = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }

    if (!SCRIPT_URL) {
      setError("⚙️ Apps Script URL not configured. Go to Settings → System to set it up.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Resize image first using canvas (max 1200px)
      const MAX = 1200;
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              const r = Math.min(MAX/w, MAX/h);
              w = Math.round(w*r); h = Math.round(h*r);
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Send to Apps Script
      const resp = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          image: base64,
          filename: `${sku||'part_'+Date.now()}.png`,
          mimeType: "image/png"
        })
      });

      const result = await resp.json();
      if (result.success) {
        onChange(result.url); // Set thumbnail URL
        setError(null);
      } else {
        setError("Upload failed: " + result.error);
      }
    } catch (e) {
      setError("Upload error: " + e.message);
    }
    setUploading(false);
  };

  const preview = imageUrl ? toImgUrl(imageUrl) : null;

  return (
    <div>
      {/* Drop zone / click to upload */}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadToGDrive(e.dataTransfer.files[0]); }}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 10, padding: "16px", textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragOver ? "rgba(251,146,60,.06)" : "var(--surface2)",
          marginBottom: 10, transition: "all .15s"
        }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e => uploadToGDrive(e.target.files[0])}/>

        {uploading ? (
          <div style={{color:"var(--accent)",fontSize:14}}>
            <div style={{width:24,height:24,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/>
            Uploading to Google Drive...
          </div>
        ) : preview ? (
          <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
            <img src={preview} alt="part" style={{width:64,height:64,objectFit:"contain",borderRadius:8,background:"var(--surface3)"}}/>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--green)"}}>✅ Photo uploaded</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Click or drop to replace</div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{fontSize:26,marginBottom:6}}>📷</div>
            <div style={{fontSize:14,fontWeight:600}}>Click or drag & drop photo</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>Auto-uploads to Google Drive · PNG, JPG</div>
          </div>
        )}
      </div>

      {/* Paste from clipboard (mobile copy image support) */}
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        <button className="btn btn-ghost btn-sm" style={{flex:1}}
          onClick={async()=>{
            try{
              const items = await navigator.clipboard.read();
              for(const item of items){
                const imgType = item.types.find(t=>t.startsWith("image/"));
                if(imgType){
                  const blob = await item.getType(imgType);
                  const file = new File([blob], `${sku||"part"}.png`, {type:"image/png"});
                  uploadToGDrive(file);
                  return;
                }
              }
              alert("No image found in clipboard. Copy an image first.");
            }catch(e){
              // Fallback: open file picker
              fileRef.current?.click();
            }
          }}>
          📋 Paste Image from Clipboard
        </button>
        <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}>
          📁 Browse
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div style={{fontSize:12,color:"var(--red)",marginBottom:8,padding:"8px 12px",background:"rgba(248,113,113,.1)",borderRadius:8}}>
          {error}
        </div>
      )}

      {/* Manual URL input */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <input className="inp" type="url" value={imageUrl||""} style={{fontSize:12,flex:1}}
          onChange={e => onChange(e.target.value)}
          placeholder="Or paste Google Drive URL manually..."/>
        <button className="cp-btn"
          onClick={async()=>{try{const t2=await navigator.clipboard.readText();if(t2)onChange(t2);}catch{}}}>
          📥 Paste
        </button>
        {imageUrl && (
          <button className="cp-btn" style={{color:"var(--red)"}}
            onClick={()=>onChange("")}>🗑</button>
        )}
      </div>

      {imageUrl && (
        <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>{t.gdrive_hint}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE FITMENT TAB — inside PartModal
// ═══════════════════════════════════════════════════════════════
function VehicleFitmentTab({part, vehicles, partFitments, onAdd, onDelete, onGoVehicles, t}) {
  const [search,  setSearch]  = useState("");
  const [pending, setPending] = useState(new Set()); // selected but not yet saved
  const [saving,  setSaving]  = useState(false);
  const [toDelete,setToDelete]= useState(new Set()); // marked for removal

  const linked    = partFitments; // already filtered by part_id
  const linkedIds = new Set(linked.map(f => String(f.vehicle_id)));

  const filtered = vehicles.filter(v => {
    if(linkedIds.has(String(v.id))) return false; // already linked
    if(pending.has(String(v.id))) return false;    // already selected
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return `${v.make} ${v.model} ${v.variant||""} ${v.engine||""} ${v.year_from} ${v.year_to|""}`.toLowerCase().includes(s);
  });

  const toggle = (vid) => {
    setPending(p => {
      const n = new Set(p);
      n.has(vid) ? n.delete(vid) : n.add(vid);
      return n;
    });
  };

  const toggleDelete = (fid) => {
    setToDelete(p => {
      const n = new Set(p);
      n.has(fid) ? n.delete(fid) : n.add(fid);
      return n;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    // Save new links
    for(const vid of pending) {
      await onAdd(part.id, vid);
    }
    // Delete removed links
    for(const fid of toDelete) {
      await onDelete(fid);
    }
    setPending(new Set());
    setToDelete(new Set());
    setSaving(false);
  };

  const hasChanges = pending.size > 0 || toDelete.size > 0;

  return (
    <div>
      {/* ── Part vehicle info + Go to Vehicles button ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        marginBottom:14,padding:"10px 14px",background:"var(--surface2)",borderRadius:10,
        border:"1px solid var(--border)"}}>
        <div>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4}}>
            Part Vehicle Info (from Basic Info tab)
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            {part.make
              ? <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",fontSize:13,fontWeight:700}}>🚗 {part.make}</span>
              : <span style={{fontSize:12,color:"var(--text3)"}}>No make set</span>}
            {part.model && <span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:12}}>{part.model}</span>}
            {part.year_range && <span className="badge" style={{background:"var(--surface3)",color:"var(--text3)",fontSize:11}}>{part.year_range}</span>}
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:5}}>
            Use the search below to link vehicles — or go to Vehicle Management to add new models
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{flexShrink:0,color:"var(--blue)",borderColor:"rgba(96,165,250,.3)",whiteSpace:"nowrap"}}
          onClick={()=>onGoVehicles&&onGoVehicles()}>
          🚗 Manage Vehicles →
        </button>
      </div>

      {/* ── Currently linked ── */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
        ✅ Linked Vehicles ({linked.length})
      </div>
      {linked.length === 0 && pending.size === 0 && (
        <div style={{textAlign:"center",padding:"16px 0",color:"var(--text3)",fontSize:13,marginBottom:8}}>
          🚗 No vehicles linked yet — select below to add
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
        {linked.map(f => {
          const v = vehicles.find(vv => String(vv.id) === String(f.vehicle_id));
          if(!v) return null;
          const marked = toDelete.has(f.id);
          return (
            <div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 12px",borderRadius:8,transition:"all .15s",
              background: marked ? "rgba(248,113,113,.08)" : "rgba(52,211,153,.08)",
              border: `1px solid ${marked ? "rgba(248,113,113,.3)" : "rgba(52,211,153,.2)"}`,
              opacity: marked ? 0.6 : 1}}>
              <div>
                <span style={{fontWeight:600,fontSize:13,textDecoration:marked?"line-through":"none"}}>{v.make} {v.model}</span>
                <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}–{v.year_to||"now"}</span>
                {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                {v.engine&&<span style={{fontSize:11,color:"var(--blue)",marginLeft:6}}>🔧 {v.engine}</span>}
              </div>
              <button className="btn btn-ghost btn-xs"
                style={{color:marked?"var(--green)":"var(--red)",flexShrink:0}}
                onClick={()=>toggleDelete(f.id)}>
                {marked ? "↩ Undo" : "✕"}
              </button>
            </div>
          );
        })}

        {/* Pending (selected but not saved yet) */}
        {[...pending].map(vid => {
          const v = vehicles.find(vv => String(vv.id) === vid);
          if(!v) return null;
          return (
            <div key={`p-${vid}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 12px",borderRadius:8,
              background:"rgba(251,146,60,.08)",border:"1px solid rgba(251,146,60,.3)"}}>
              <div>
                <span style={{fontSize:11,color:"var(--accent)",fontWeight:700,marginRight:6}}>+ NEW</span>
                <span style={{fontWeight:600,fontSize:13}}>{v.make} {v.model}</span>
                <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}–{v.year_to||"now"}</span>
                {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                {v.engine&&<span style={{fontSize:11,color:"var(--blue)",marginLeft:6}}>🔧 {v.engine}</span>}
              </div>
              <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}}
                onClick={()=>toggle(vid)}>✕</button>
            </div>
          );
        })}
      </div>

      {/* ── Search & select ── */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
        ➕ Select Vehicles to Link
      </div>
      <div style={{position:"relative",marginBottom:10}}>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search make, model, year, engine..."/>
        {search&&<button onClick={()=>setSearch("")}
          style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:220,overflowY:"auto",marginBottom:14}}>
        {filtered.slice(0,50).map(v => (
          <div key={v.id}
            onClick={()=>toggle(String(v.id))}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"8px 12px",background:"var(--surface2)",borderRadius:8,
              border:"1px solid var(--border)",cursor:"pointer",
              transition:"all .1s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
            <div>
              <span style={{fontWeight:600,fontSize:13}}>{v.make} {v.model}</span>
              <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}–{v.year_to||"now"}</span>
              {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
              {v.engine&&<span style={{fontSize:11,color:"var(--blue)",marginLeft:6}}>🔧 {v.engine}</span>}
            </div>
            <span style={{fontSize:18,color:"var(--accent)",flexShrink:0}}>+</span>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <div style={{textAlign:"center",padding:16,color:"var(--text3)",fontSize:13}}>No vehicles found</div>
        )}
        {filtered.length === 0 && !search && linked.length > 0 && (
          <div style={{textAlign:"center",padding:16,color:"var(--green)",fontSize:13}}>✅ All vehicles linked!</div>
        )}
      </div>

      {/* ── Save button — only show if changes pending ── */}
      {hasChanges && (
        <button className="btn btn-primary" style={{width:"100%",padding:"10px 0",fontWeight:700}}
          onClick={saveAll} disabled={saving}>
          {saving
            ? "⏳ Saving..."
            : `💾 Save Changes (${pending.size > 0 ? `+${pending.size}` : ""}${toDelete.size > 0 ? ` −${toDelete.size}` : ""})`}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE SEARCH BAR — in Shop for customers
// ═══════════════════════════════════════════════════════════════
function VehicleSearchBar({vehicles, partFitments, parts, onFilter, t}) {
  const [selMake,   setSelMake]   = useState("");
  const [selModel,  setSelModel]  = useState("");
  const [selEngine, setSelEngine] = useState("");
  const [active,    setActive]    = useState(false);

  // Derived lists
  const makes   = [...new Set(vehicles.map(v => v.make))].sort();
  const models  = [...new Set(vehicles.filter(v => !selMake || v.make === selMake).map(v => v.model))].sort();
  const engines = [...new Set(
    vehicles
      .filter(v => (!selMake || v.make === selMake) && (!selModel || v.model === selModel))
      .map(v => v.engine || "")
      .filter(Boolean)
  )].sort();

  const applyFilter = (make, model, engine) => {
    if (!make) { onFilter(null); setActive(false); return; }
    const matchVehicles = vehicles.filter(v =>
      v.make === make &&
      (!model  || v.model  === model) &&
      (!engine || v.engine === engine)
    );
    const vehicleIds = new Set(matchVehicles.map(v => String(v.id)));
    const matchFitments = partFitments.filter(f => vehicleIds.has(String(f.vehicle_id)));
    const partIds = new Set(matchFitments.map(f => String(f.part_id)));
    onFilter(partIds.size > 0 ? partIds : new Set(["__none__"]));
    setActive(true);
  };

  const clear = () => {
    setSelMake(""); setSelModel(""); setSelEngine("");
    onFilter(null); setActive(false);
  };

  return (
    <div style={{marginBottom:14,padding:"12px 14px",
      background: active ? "rgba(96,165,250,.08)" : "var(--surface2)",
      borderRadius:12,border:`1px solid ${active?"rgba(96,165,250,.3)":"var(--border)"}`,
      transition:"all .2s"}}>
      <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>🚗 {t.findByVehicle||"Find parts for my car"}</span>
        {active && <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={clear}>✕ Clear</button>}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {/* Make */}
        <select className="inp" value={selMake} style={{flex:"1 1 120px",minWidth:100}}
          onChange={e=>{ const v=e.target.value; setSelMake(v); setSelModel(""); setSelEngine(""); applyFilter(v,"",""); }}>
          <option value="">{t.selectMake||"Select Make"}</option>
          {makes.map(m=><option key={m}>{m}</option>)}
        </select>

        {/* Model */}
        <select className="inp" value={selModel} style={{flex:"1 1 120px",minWidth:100}}
          disabled={!selMake}
          onChange={e=>{ const v=e.target.value; setSelModel(v); setSelEngine(""); applyFilter(selMake,v,""); }}>
          <option value="">{t.selectModel||"Select Model"}</option>
          {models.map(m=><option key={m}>{m}</option>)}
        </select>

        {/* Engine */}
        <select className="inp" value={selEngine} style={{flex:"1 1 100px",minWidth:80}}
          disabled={!selModel}
          onChange={e=>{ const v=e.target.value; setSelEngine(v); applyFilter(selMake,selModel,v); }}>
          <option value="">Engine</option>
          {engines.map(e=><option key={e}>{e}</option>)}
        </select>
      </div>

      {/* Vehicle photos + result info */}
      {active && (()=>{
        const matchV = vehicles.filter(v=>
          v.make===selMake &&
          (!selModel||v.model===selModel) &&
          (!selEngine||v.engine===selEngine)
        );
        const photos = matchV.find(v=>v.photo_front||v.photo_rear||v.photo_side) || matchV[0];
        return (
          <div style={{marginTop:10}}>
            {/* 3 photos side by side */}
            {photos&&(photos.photo_front||photos.photo_rear||photos.photo_side)&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                {[
                  {url:photos.photo_front, label:"Front"},
                  {url:photos.photo_rear,  label:"Rear"},
                  {url:photos.photo_side,  label:"Side"},
                ].map(({url,label})=>(
                  <div key={label} style={{position:"relative",borderRadius:8,overflow:"hidden",
                    background:"var(--surface3)",aspectRatio:"4/3"}}>
                    {url
                      ? <DriveImg url={url} alt={label}
                          style={{width:"100%",height:"100%",objectFit:"cover",cursor:"zoom-in"}}
                          onClick={()=>window.open(toFullUrl(url),"_blank")}/>
                      : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
                          justifyContent:"center",color:"var(--text3)",fontSize:11}}>No photo</div>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,
                      background:"rgba(0,0,0,.5)",color:"#fff",fontSize:10,
                      textAlign:"center",padding:"2px 0",fontWeight:600}}>{label}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:12,color:"var(--blue)",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>🔍 {selMake} {selModel} {selEngine}</span>
              <button className="btn btn-ghost btn-xs" style={{color:"var(--text3)"}} onClick={clear}>✕ Show all parts</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLES MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════════════
function VehiclesPage({vehicles, partFitments, onSave, onDelete, t}) {
  const [search, setSearch]   = useState("");
  const [editV,  setEditV]    = useState(null);  // null=closed, {}=new, {...}=edit
  const [filterMake, setFilterMake] = useState("__all__");

  const makes = ["__all__", ...[...new Set(vehicles.map(v=>v.make))].sort()];

  const filtered = vehicles.filter(v => {
    if(filterMake !== "__all__" && v.make !== filterMake) return false;
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return `${v.make} ${v.model} ${v.variant||""} ${v.engine||""} ${v.year_from||""} ${v.year_to|""}`.toLowerCase().includes(s);
  });

  const fitCount = (vid) => partFitments.filter(f=>String(f.vehicle_id)===String(vid)).length;

  return (
    <div className="fu">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🚗 {t.vehicleMgmt||"Vehicle Management"}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{vehicles.length} vehicles · {partFitments.length} fitment links</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setEditV({make:"GWM",model:"",year_from:"",year_to:"",engine:"",variant:""})}>
          + {t.addVehicle||"Add Vehicle"}
        </button>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:"1 1 200px"}}>
          <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search make, model, engine..."/>
          {search&&<button onClick={()=>setSearch("")}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
        </div>
        <select className="inp" value={filterMake} onChange={e=>setFilterMake(e.target.value)} style={{width:150}}>
          {makes.map(m=><option key={m} value={m}>{m==="__all__"?"All Makes":m}</option>)}
        </select>
      </div>

      {/* Stats by make */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
        {[...new Set(vehicles.map(v=>v.make))].sort().map(make=>{
          const cnt = vehicles.filter(v=>v.make===make).length;
          const links = partFitments.filter(f=>vehicles.find(v=>v.make===make&&String(v.id)===String(f.vehicle_id))).length;
          return (
            <div key={make} className="card" style={{padding:"8px 14px",cursor:"pointer",
              borderColor:filterMake===make?"var(--accent)":"var(--border)"}}
              onClick={()=>setFilterMake(filterMake===make?"__all__":make)}>
              <div style={{fontWeight:700,fontSize:13}}>{make}</div>
              <div style={{fontSize:11,color:"var(--text3)"}}>{cnt} models · {links} links</div>
            </div>
          );
        })}
      </div>

      {/* Vehicle list — card grid (both mobile and desktop) */}
      {filtered.length===0&&(
        <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No vehicles found</div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
        {filtered.map(v=>{
          const hasPhotos = v.photo_front||v.photo_rear||v.photo_side;
          return (
            <div key={v.id} className="card" style={{padding:0,overflow:"hidden"}}>
              {/* 3 photos row */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",height:110,background:"var(--surface2)"}}>
                {[
                  {url:v.photo_front, label:"Front"},
                  {url:v.photo_rear,  label:"Rear"},
                  {url:v.photo_side,  label:"Side"},
                ].map(({url,label})=>(
                  <div key={label} style={{position:"relative",overflow:"hidden",borderRight:"1px solid var(--border)"}}>
                    {url
                      ? <DriveImg url={url} alt={label}
                          style={{width:"100%",height:"100%",objectFit:"cover",cursor:"zoom-in"}}
                          onClick={()=>window.open(toFullUrl(url),"_blank")}/>
                      : <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",
                          alignItems:"center",justifyContent:"center",color:"var(--text3)"}}>
                          <div style={{fontSize:20,marginBottom:2}}>📷</div>
                          <div style={{fontSize:10}}>{label}</div>
                        </div>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,
                      background:"rgba(0,0,0,.45)",color:"#fff",fontSize:10,
                      textAlign:"center",padding:"2px 0",fontWeight:600}}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Info */}
              <div style={{padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{v.make} {v.model}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                      {v.year_from}–{v.year_to||"present"}
                      {v.engine&&<span style={{marginLeft:8,color:"var(--blue)"}}>🔧 {v.engine}</span>}
                    </div>
                    {v.variant&&<div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{v.variant}</div>}
                  </div>
                  <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",flexShrink:0}}>
                    {fitCount(v.id)} parts
                  </span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",
                    background:"var(--surface2)",padding:"2px 8px",borderRadius:4}}>ID: {v.id}</code>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setEditV({...v})}>✏️ Edit</button>
                    <button className="btn btn-danger btn-xs"
                      onClick={()=>{if(window.confirm(`Delete ${v.make} ${v.model}?`))onDelete(v.id);}}>🗑</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {editV&&(
        <VehicleModal vehicle={editV} onSave={async(data)=>{ await onSave(data); setEditV(null); }}
          onClose={()=>setEditV(null)} t={t}/>
      )}
    </div>
  );
}

// ── Vehicle Add/Edit Modal ──
function VehicleModal({vehicle, onSave, onClose, t}) {
  const [f, setF] = useState({
    id:          vehicle.id||null,
    make:        vehicle.make||"GWM",
    model:       vehicle.model||"",
    year_from:   vehicle.year_from||new Date().getFullYear()-2,
    year_to:     vehicle.year_to||new Date().getFullYear(),
    engine:      vehicle.engine||"",
    variant:     vehicle.variant||"",
    photo_front: vehicle.photo_front||"",
    photo_rear:  vehicle.photo_rear||"",
    photo_side:  vehicle.photo_side||"",
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const [err, setErr] = useState({});

  const validate = () => {
    const e={};
    if(!f.make.trim()) e.make="Make required";
    if(!f.model.trim()) e.model="Model required";
    if(!f.year_from) e.year_from="Year from required";
    setErr(e);
    return Object.keys(e).length===0;
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={f.id?"✏️ Edit Vehicle":"🚗 Add Vehicle"} onClose={onClose}/>
      <FG>
        <div>
          <FL label="Make *"/>
          <input className="inp" value={f.make} onChange={e=>s("make",e.target.value)}
            placeholder="GWM, Toyota, Ford..." style={{borderColor:err.make?"var(--red)":undefined}}/>
          {err.make&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.make}</div>}
        </div>
        <div>
          <FL label="Model *"/>
          <input className="inp" value={f.model} onChange={e=>s("model",e.target.value)}
            placeholder="P-Series, Hilux..." style={{borderColor:err.model?"var(--red)":undefined}}/>
          {err.model&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.model}</div>}
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Year From *"/>
          <input className="inp" type="number" value={f.year_from} onChange={e=>s("year_from",+e.target.value)}
            placeholder="2020" style={{borderColor:err.year_from?"var(--red)":undefined}}/>
          {err.year_from&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.year_from}</div>}
        </div>
        <div>
          <FL label="Year To"/>
          <input className="inp" type="number" value={f.year_to} onChange={e=>s("year_to",+e.target.value)}
            placeholder="2024 (leave blank = present)"/>
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Engine"/>
          <input className="inp" value={f.engine} onChange={e=>s("engine",e.target.value)}
            placeholder="2.0TD, 1.5T, 2.8GD6..."/>
        </div>
        <div>
          <FL label="Variant"/>
          <input className="inp" value={f.variant} onChange={e=>s("variant",e.target.value)}
            placeholder="SX 4x4, Double-Cab, LT..."/>
        </div>
      </FG>
      {/* Photos — drag & drop upload */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",margin:"14px 0 8px",paddingBottom:6,borderBottom:"1px solid var(--border)"}}>📸 Vehicle Photos</div>
      {f.id
        ? <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[
              {key:"photo_front", label:"Front"},
              {key:"photo_rear",  label:"Rear"},
              {key:"photo_side",  label:"Side"},
            ].map(({key,label})=>(
              <VehiclePhotoUploader key={key} label={label} url={f[key]}
                vehicleId={f.id} make={f.make} viewName={label.toLowerCase()}
                onChange={v=>s(key,v)}/>
            ))}
          </div>
        : <div style={{textAlign:"center",padding:16,background:"var(--surface2)",borderRadius:10,color:"var(--text3)",fontSize:13}}>
            💾 Save the vehicle first, then add photos
          </div>
      }

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{ if(validate()) onSave(f); }}>
          💾 {t.save}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE PHOTO UPLOADER
// Uploads to Google Drive: Tim_Car_Phot/Make/vehicleId/view.png
// ═══════════════════════════════════════════════════════════════
function VehiclePhotoUploader({label, url, vehicleId, make, reg, viewName, onChange}) {
  const [uploading, setUploading] = useState(false);
  const [status,    setStatus]    = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const [error,     setError]     = useState(null);
  const [browsing,  setBrowsing]  = useState(false);  // picker open
  const [drivePhotos, setDrivePhotos] = useState(null); // null=not loaded, []=[loaded]
  const [browseLoading, setBrowseLoading] = useState(false);
  const fileRef = useRef(null);  // gallery / drive / files — no accept, full picker
  const camRef  = useRef(null);  // direct camera capture

  const openBrowse = async () => {
    const SCRIPT_URL = getScriptUrl();
    if (!SCRIPT_URL) { setError("⚙️ Set Vehicle Script URL in Settings first"); return; }
    const plate = (reg||vehicleId||"").replace(/\s/g,"").toUpperCase();
    if (!plate) { setError("No plate number — save the vehicle first"); return; }
    setBrowsing(true);
    if (drivePhotos === null) {
      setBrowseLoading(true);
      try {
        const resp = await fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({ action:"listPhotos", plate })
        });
        const result = await resp.json();
        if (result.success) setDrivePhotos(result.photos || []);
        else throw new Error(result.error || "Could not list photos");
      } catch(e) {
        setError("❌ Browse failed: " + e.message);
        setBrowsing(false);
      }
      setBrowseLoading(false);
    }
  };

  const getScriptUrl = () =>
    (window._VEHICLE_SCRIPT_URL && window._VEHICLE_SCRIPT_URL.trim()) ||
    (window._APPS_SCRIPT_URL    && window._APPS_SCRIPT_URL.trim())    || "";

  const upload = async (file) => {
    if (!file) return;
    const isImg = file.type.startsWith("image/") || file.type==="" ||
      /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
    if (!isImg) { setError("Image files only"); return; }
    const SCRIPT_URL = getScriptUrl();
    if (!SCRIPT_URL) { setError("⚙️ Set Vehicle Photos Apps Script URL in Settings first"); return; }

    setUploading(true); setError(null);
    try {
      // ── Step 1: Resize ──
      setStatus("Resizing image...");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            const MAX = 800;
            const canvas = document.createElement("canvas");
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // ── Step 2: Create folder Tim_Car_Phot/<plate>/<date> ──
      const _now=new Date(), _p=n=>String(n).padStart(2,"0");
      const _date=`${_now.getFullYear()}-${_p(_now.getMonth()+1)}-${_p(_now.getDate())}`;
      const _dt=`${_date.replace(/-/g,"")}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
      const _plate=(reg||vehicleId||"vehicle").replace(/\s/g,"").toUpperCase();
      const folderPath = "Tim_Car_Phot/" + _plate + "/" + _date;
      setStatus("Creating folder " + folderPath + "...");
      const folderResp = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action:"createFolder", folderPath })
      });
      const folderResult = await folderResp.json();
      if (!folderResult.success) throw new Error("Folder error: " + folderResult.error);

      // ── Step 3: Upload photo ──
      const filename = _dt + "_" + viewName + ".png";
      setStatus("Uploading " + filename + "...");
      const uploadResp = await fetch(SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action:"upload", image:base64, filename, mimeType:"image/png", folderPath })
      });
      const result = await uploadResp.json();
      if (result.success) {
        onChange(result.url);  // no cache-buster — Drive rejects &t= on thumbnail URLs
        setStatus(""); setError(null);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch(e) {
      setError("❌ " + e.message);
      setStatus("");
    }
    setUploading(false);
  };

  const driveId = extractDriveId(url);
  const preview = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w400` : (url||null);

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]); e.dataTransfer.clearData(); }}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 10, cursor: uploading ? "wait" : "pointer",
          background: dragOver ? "rgba(251,146,60,.06)" : "var(--surface2)",
          aspectRatio: "4/3", overflow: "hidden", position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s",
        }}>
        {/* No accept + no capture = full file picker (gallery, Drive, files) */}
        <input ref={fileRef} type="file" style={{display:"none"}}
          onChange={e => { upload(e.target.files[0]); e.target.value=""; }}/>
        {/* Camera only */}
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e => { upload(e.target.files[0]); e.target.value=""; }}/>

        {uploading ? (
          <div style={{textAlign:"center",color:"var(--accent)",padding:8}}>
            <div style={{width:24,height:24,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",
              borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 6px"}}/>
            <div style={{fontSize:11,maxWidth:120,margin:"0 auto",lineHeight:1.4}}>{status||"Uploading..."}</div>
          </div>
        ) : preview ? (
          <>
            <DriveImg url={url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",
              display:"flex",alignItems:"center",justifyContent:"center",
              opacity:0,transition:"opacity .2s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <div style={{background:"rgba(0,0,0,.6)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:12}}>
                🔄 Tap to replace
              </div>
            </div>
          </>
        ) : (
          <div style={{textAlign:"center",color:"var(--text3)",padding:8}}>
            <div style={{fontSize:22,marginBottom:4}}>🖼️</div>
            <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>{label}</div>
            <div style={{fontSize:10}}>Tap to choose photo</div>
          </div>
        )}
      </div>

      {/* Label + 3 source buttons */}
      <div style={{marginTop:6}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:5,textAlign:"center",textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>
        <div style={{display:"flex",gap:5,justifyContent:"center"}}>
          {/* Option 1 — Camera */}
          <button className="btn btn-ghost btn-xs"
            style={{flex:1,padding:"5px 4px",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
            title="Take a new photo with camera"
            onClick={e=>{ e.stopPropagation(); camRef.current?.click(); }}>
            <span style={{fontSize:15}}>📷</span>
            <span>Camera</span>
          </button>
          {/* Option 2 — Local file / gallery */}
          <button className="btn btn-ghost btn-xs"
            style={{flex:1,padding:"5px 4px",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
            title="Browse local files or phone gallery"
            onClick={e=>{ e.stopPropagation(); fileRef.current?.click(); }}>
            <span style={{fontSize:15}}>🖼️</span>
            <span>Files</span>
          </button>
          {/* Option 3 — Google Drive plate folder */}
          <button className="btn btn-ghost btn-xs"
            style={{flex:1,padding:"5px 4px",fontSize:11,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              color:"var(--blue)",opacity:(reg||vehicleId)?1:0.4}}
            title={(reg||vehicleId)?`Browse Drive folder: ${(reg||vehicleId||"").toUpperCase()}`:"Save vehicle plate first to browse Drive"}
            onClick={e=>{ e.stopPropagation(); openBrowse(); }}>
            <span style={{fontSize:15}}>☁️</span>
            <span>Drive</span>
          </button>
          {/* Remove */}
          {url && (
            <button className="btn btn-ghost btn-xs"
              style={{padding:"5px 6px",fontSize:11,color:"var(--red)"}}
              title="Remove photo"
              onClick={e=>{ e.stopPropagation(); onChange(""); }}>✕</button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && <div style={{fontSize:10,color:"var(--red)",marginTop:3}}>{error}</div>}

      {/* Drive photo picker */}
      {browsing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setBrowsing(false)}>
          <div style={{background:"var(--surface)",borderRadius:"12px 12px 0 0",padding:16,width:"100%",maxWidth:600,maxHeight:"75vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14}}>
                ☁️ Google Drive — <code style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--blue)"}}>Tim_Car_Phot / {(reg||vehicleId||"").replace(/\s/g,"").toUpperCase()}</code>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={()=>setBrowsing(false)}>✕ Close</button>
            </div>
            {browseLoading && (
              <div style={{textAlign:"center",padding:24,color:"var(--text3)"}}>
                <div style={{width:24,height:24,border:"3px solid rgba(255,255,255,.2)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/>
                Loading photos from Drive...
              </div>
            )}
            {!browseLoading && drivePhotos && drivePhotos.length === 0 && (
              <div style={{textAlign:"center",padding:24,color:"var(--text3)",fontSize:13}}>
                No photos found for this plate in Google Drive
              </div>
            )}
            {!browseLoading && drivePhotos && drivePhotos.length > 0 && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
                {drivePhotos.map((p,i)=>(
                  <div key={i} style={{cursor:"pointer",borderRadius:8,overflow:"hidden",border:"2px solid var(--border)",transition:"border-color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}
                    onClick={()=>{ onChange(p.url); setBrowsing(false); }}>
                    <img src={p.url} alt={p.name||"photo"} style={{width:"100%",aspectRatio:"4/3",objectFit:"cover",display:"block"}}
                      onError={e=>{e.target.style.display="none";}}/>
                    {p.name && <div style={{fontSize:9,color:"var(--text3)",padding:"2px 4px",background:"var(--surface2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BOOK-IN MODAL — scan disc → lookup → new/return decision
// ═══════════════════════════════════════════════════════════════
function BookInModal({wsCustomers=[],wsVehicles=[],jobs=[],settings,onSaveJob,onReopenJob,onClose,t}) {
  const [step,setStep]=useState("scan");
  const [plate,setPlate]=useState("");
  const [scanLoading,setScanLoading]=useState(false);
  const [scanError,setScanError]=useState(null);
  const [scanResult,setScanResult]=useState(null);  // parsed disc data
  const [rawBarcode,setRawBarcode]=useState("");     // raw decoded text
  const [capturedImg,setCapturedImg]=useState(null);
  // lookup results
  const [foundVehicle,setFoundVehicle]=useState(null);
  const [foundCustomer,setFoundCustomer]=useState(null);
  const [openJobs,setOpenJobs]=useState([]);
  const [history,setHistory]=useState([]);
  // decision
  const [decision,setDecision]=useState("new");
  const [returnReason,setReturnReason]=useState("");
  const [reopenJobId,setReopenJobId]=useState(null);
  // job prefill for WorkshopJobModal
  const [jobPrefill,setJobPrefill]=useState(null);
  // photo step
  const [photoSession,setPhotoSession]=useState(null);   // {date,time} strings fixed at session start
  const [photoList,setPhotoList]=useState([]);            // [{id,dataUrl,status,url,error}]
  const [bookInJobId,setBookInJobId]=useState(null);      // job ID for linking photos to DB
  const photoCounter=useRef(0);
  const photoCamRef=useRef(null);
  const photoGalRef=useRef(null);

  // Native file inputs — no getUserMedia, no HTTPS required
  const cameraRef=useRef(null);  // capture="environment" → opens native camera app
  const galleryRef=useRef(null); // no capture → opens file picker / gallery

  // ── Upload one photo to Google Drive + save URL to DB ─────────
  const uploadBookInPhoto=async(photoId,dataUrl,session,reg,jobId)=>{
    const SCRIPT_URL=
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    if(!SCRIPT_URL){
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:"No script URL — set Vehicle Script URL in Settings"}:x));
      return;
    }
    const setStatus=(s)=>setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:s}:x));
    setStatus("uploading");
    try{
      // resize to max 1600px
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1600;
          const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.88));
        };
        img.onerror=rej;
        img.src=dataUrl;
      });
      const folderPath=`Tim_Car_Phot/${reg}/${session.date}`;
      const n=String(photoId).padStart(3,"0");
      const filename=`${session.date.replace(/-/g,"")}_${session.time.replace(/-/g,"")}_${n}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      if(result.success){
        // Save URL to DB linked to this job
        if(jobId) await api.insert("workshop_job_photos",{id:makeId("PH"),job_id:jobId,url:result.url,folder_path:folderPath}).catch(()=>{});
        setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"done",url:result.url}:x));
      } else {
        setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:result.error||"Upload failed"}:x));
      }
    }catch(e){
      setPhotoList(p=>p.map(x=>x.id===photoId?{...x,status:"error",error:e.message}:x));
    }
  };

  const handlePhotoFile=(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value="";
    if(!files.length) return;
    const session=photoSession;
    const reg=plate.replace(/\s/g,"").toUpperCase();
    const jid=bookInJobId;
    files.forEach(file=>{
      if(!file.type.startsWith("image/")) return;
      photoCounter.current+=1;
      const id=photoCounter.current;
      const fr=new FileReader();
      fr.onload=ev=>{
        const dataUrl=ev.target.result;
        setPhotoList(p=>[...p,{id,dataUrl,status:"pending",url:null,error:null}]);
        uploadBookInPhoto(id,dataUrl,session,reg,jid);
      };
      fr.readAsDataURL(file);
    });
  };

  // ── Process an image file → decode PDF417 ──────────────────────
  const processImage=async(dataUrl)=>{
    setScanLoading(true); setScanError(null); setRawBarcode(""); setScanResult(null);
    try{
      const raw=await decodePDF417fromImage(dataUrl);
      setRawBarcode(raw);
      const parsed=parseLicenceDisc(raw);
      setScanResult(parsed);
      const reg=parsed.reg?.replace(/\s/g,"").toUpperCase()||"";
      if(reg) setPlate(reg);
      setScanLoading(false);
      // Auto-proceed to lookup — pass reg directly to avoid stale state on mobile
      if(reg) doLookup(reg);
    }catch(e){
      setScanError("PDF417 not detected — try a clearer, closer photo. ("+e.message+")");
      setScanLoading(false);
    }
  };

  const handleFile=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const fr=new FileReader();
    fr.onload=ev=>{setCapturedImg(ev.target.result); processImage(ev.target.result);};
    fr.readAsDataURL(file);
    e.target.value="";
  };

  const doLookup=(regOverride)=>{
    const reg=(regOverride||plate).toUpperCase().trim();
    if(!reg){alert("Enter or scan a plate first");return;}
    const veh=wsVehicles.find(v=>(v.reg||"").toUpperCase().replace(/\s/g,"")===reg.replace(/\s/g,""));
    const cust=veh?wsCustomers.find(c=>c.id===veh.workshop_customer_id):null;
    const h=jobs.filter(j=>{
      const jr=(j.vehicle_reg||"").toUpperCase().replace(/\s/g,"");
      return jr===reg.replace(/\s/g,"")||(veh&&j.workshop_vehicle_id===veh.id);
    }).sort((a,b)=>new Date(b.date_in)-new Date(a.date_in));
    const open=h.filter(j=>j.status!=="Delivered");
    setFoundVehicle(veh||null); setFoundCustomer(cust||null);
    setHistory(h); setOpenJobs(open);
    if(open.length>0){ setDecision("reopen"); setReopenJobId(open[0].id); }
    else { setDecision("new"); }
    setStep("lookup");
  };

  const proceedToJob=()=>{
    const prefill={
      workshop_customer_id:foundCustomer?.id||null,
      workshop_vehicle_id:foundVehicle?.id||null,
      customer_name:foundCustomer?.name||"",
      customer_phone:foundCustomer?.phone||"",
      customer_email:foundCustomer?.email||"",
      vehicle_reg:plate,
      vehicle_make:scanResult?.make||foundVehicle?.make||"",
      vehicle_model:scanResult?.model||foundVehicle?.model||"",
      vehicle_year:foundVehicle?.year||"",
      vehicle_color:scanResult?.color||foundVehicle?.color||"",
      vin:scanResult?.vin||foundVehicle?.vin||"",
      engine_no:scanResult?.engine_no||foundVehicle?.engine_no||"",
      mileage:"",complaint:"",diagnosis:"",mechanic:"",
      date_in:new Date().toISOString().slice(0,10),
      date_out:"",notes:"",status:"Pending",
      return_reason:openJobs.length>0?returnReason:"",
      parent_job_id:openJobs.length>0?(openJobs.find(j=>j.id===reopenJobId)||openJobs[0]).id:null,
    };
    setJobPrefill(prefill);
    setStep("jobform");
  };

  const handleProceed=async()=>{
    if(openJobs.length>0&&decision==="reopen"){
      if(!returnReason.trim()){alert("Return reason required");return;}
      const ej=openJobs.find(j=>j.id===reopenJobId)||openJobs[0];
      await onReopenJob({...ej,status:"In Progress",return_reason:returnReason,date_in:new Date().toISOString().slice(0,10),mileage:ej.mileage});
      return;
    }
    if(openJobs.length>0&&decision==="new"&&!returnReason.trim()){
      alert("Return reason required when vehicle has open jobs");return;
    }
    proceedToJob();
  };

  // ── Job form step ────────────────────────────────────────────
  if(step==="jobform"&&jobPrefill){
    return (
      <WorkshopJobModal
        job={jobPrefill}
        wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
        onSave={async(d)=>{
          const jobId=await onSaveJob(d);
          // After vehicle/job saved → go to photo capture
          const now=new Date();
          const pad2=n=>String(n).padStart(2,"0");
          const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
          const timeStr=`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
          setBookInJobId(jobId||null);
          setPhotoSession({date:dateStr,time:timeStr});
          setPhotoList([]);
          photoCounter.current=0;
          setStep("photos");
        }}
        onReopenJob={async(d)=>{ await onReopenJob(d); onClose(); }}
        onClose={()=>setStep("lookup")} t={t}/>
    );
  }

  // ── Photo capture step ───────────────────────────────────────
  if(step==="photos"&&photoSession){
    const reg=plate.replace(/\s/g,"").toUpperCase();
    const folderDisplay=`Tim_Car_Phot/${reg}/${photoSession.date}/`;
    const done=photoList.filter(p=>p.status==="done").length;
    const uploading=photoList.filter(p=>p.status==="uploading"||p.status==="pending").length;
    const hasScript=!!(
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())
    );
    return (
      <Overlay onClose={onClose} wide>
        <MHead title={`📷 Vehicle Photos — ${reg}`} onClose={onClose}/>

        {/* Job saved banner */}
        <div style={{marginBottom:14,padding:10,background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.25)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700,color:"var(--green)"}}>✅ Job card saved!</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Now take photos of the vehicle. Tap Done to skip.</div>
        </div>

        {/* Save path info */}
        <div style={{marginBottom:12,padding:"8px 10px",background:"var(--surface2)",borderRadius:8,fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace",wordBreak:"break-all"}}>
          📁 {folderDisplay}
        </div>

        {!hasScript&&(
          <div style={{marginBottom:12,padding:10,background:"rgba(251,100,60,.08)",border:"1px solid rgba(251,100,60,.2)",borderRadius:8,fontSize:12,color:"var(--red)"}}>
            ⚙️ No Apps Script URL configured — photos will not upload to Google Drive. Set <strong>Vehicle Script URL</strong> in Settings.
          </div>
        )}

        {/* Camera / gallery buttons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <button className="btn btn-primary" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
            onClick={()=>photoCamRef.current?.click()}>
            <span style={{fontSize:26}}>📷</span>
            Take Photo
          </button>
          <button className="btn btn-ghost" style={{padding:18,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
            onClick={()=>photoGalRef.current?.click()}>
            <span style={{fontSize:26}}>🖼️</span>
            Gallery
          </button>
          <input ref={photoCamRef} type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={handlePhotoFile}/>
          <input ref={photoGalRef} type="file" multiple style={{display:"none"}} onChange={handlePhotoFile}/>
        </div>

        {/* Photo grid */}
        {photoList.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",marginBottom:8}}>
              {photoList.length} photo{photoList.length!==1?"s":""} — {done} uploaded{uploading>0?`, ${uploading} in progress`:""}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8}}>
              {photoList.map(p=>(
                <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3"}}>
                  <img src={p.dataUrl} alt={`photo ${p.id}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  {/* Status overlay */}
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                    background:p.status==="done"?"rgba(0,0,0,0)":p.status==="error"?"rgba(200,30,30,.5)":"rgba(0,0,0,.45)"}}>
                    {(p.status==="pending"||p.status==="uploading")&&(
                      <div style={{width:18,height:18,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",
                        borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                    )}
                    {p.status==="done"&&(
                      <div style={{position:"absolute",top:3,right:5,fontSize:14}}>✅</div>
                    )}
                    {p.status==="error"&&(
                      <div style={{fontSize:10,color:"#fff",textAlign:"center",padding:4}}>❌<br/>{(p.error||"").slice(0,30)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {photoList.length===0&&(
          <div style={{textAlign:"center",padding:"24px 0",color:"var(--text3)",fontSize:13}}>
            No photos yet — tap <strong>Take Photo</strong> to start
          </div>
        )}

        <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,fontWeight:700,marginTop:4}}
          onClick={onClose} disabled={uploading>0}>
          {uploading>0?`⏳ Uploading ${uploading} photo${uploading!==1?"s":""}...`:`✅ Done${done>0?` (${done} photo${done!==1?"s":""} saved)`:""}`}
        </button>
      </Overlay>
    );
  }

  // ── Scan step ────────────────────────────────────────────────
  if(step==="scan"){
    return (
      <Overlay onClose={onClose} wide>
        <MHead title="📷 Book In Car" onClose={onClose}/>

        {/* Camera or file capture — native file inputs, no getUserMedia, works on HTTP/mobile */}
        {!capturedImg&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
            <button className="btn btn-ghost" style={{padding:20,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>cameraRef.current?.click()}>
              <span style={{fontSize:28}}>📷</span>
              Take Photo
            </button>
            <button className="btn btn-ghost" style={{padding:20,flexDirection:"column",display:"flex",alignItems:"center",gap:6,fontSize:13}}
              onClick={()=>galleryRef.current?.click()}>
              <span style={{fontSize:28}}>🖼️</span>
              Choose Photo
            </button>
            {/* capture="environment" opens rear camera directly on mobile */}
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
            <input ref={galleryRef} type="file" style={{display:"none"}} onChange={handleFile}/>
          </div>
        )}

        {/* Captured image + scan result */}
        {capturedImg&&(
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <img src={capturedImg} alt="disc" style={{width:120,height:90,objectFit:"cover",borderRadius:8,border:"1px solid var(--border)",flexShrink:0}}/>
              <div style={{flex:1}}>
                {scanLoading&&<div style={{color:"var(--blue)",fontSize:13}}>🔍 Reading barcode...</div>}
                {scanError&&<div style={{color:"var(--red)",fontSize:12}}>⚠️ {scanError}</div>}
                {rawBarcode&&!scanLoading&&(
                  <div style={{fontSize:12,lineHeight:1.7}}>
                    <div style={{color:"var(--green)",fontWeight:600,marginBottom:4}}>✓ Barcode decoded</div>
                    {scanResult?.reg&&<div><strong>Plate:</strong> <code style={{fontFamily:"DM Mono,monospace",fontWeight:700}}>{scanResult.reg}</code></div>}
                    {scanResult?.make&&<div><strong>Make:</strong> {scanResult.make}</div>}
                    {scanResult?.model&&<div><strong>Model:</strong> {scanResult.model}</div>}
                    {scanResult?.color&&<div><strong>Color:</strong> {scanResult.color}</div>}
                    {scanResult?.vin&&<div><strong>VIN:</strong> <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{scanResult.vin}</code></div>}
                    {scanResult?.engine_no&&<div><strong>Engine:</strong> <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{scanResult.engine_no}</code></div>}
                    {scanResult?.expiry_date&&<div><strong>Disc Expiry:</strong> <span style={{color:new Date(scanResult.expiry_date)<new Date()?"var(--red)":"var(--green)"}}>{scanResult.expiry_date}</span></div>}
                    {/* Raw text — always shown so we can diagnose format issues */}
                    <details style={{marginTop:6}}>
                      <summary style={{cursor:"pointer",color:"var(--text3)",fontSize:11}}>Raw barcode text</summary>
                      <pre style={{fontSize:10,background:"var(--bg2)",padding:6,borderRadius:6,marginTop:4,whiteSpace:"pre-wrap",wordBreak:"break-all",maxHeight:100,overflow:"auto"}}>{rawBarcode}</pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>{setCapturedImg(null);setScanResult(null);setPlate("");}}>↺ Rescan</button>
          </div>
        )}

        {/* Manual plate input */}
        <div style={{marginBottom:14}}>
          <FL label="Plate / Registration Number"/>
          <div style={{display:"flex",gap:8}}>
            <input className="inp" value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&doLookup()}
              placeholder="JNJ808L" style={{fontFamily:"DM Mono,monospace",fontWeight:700,letterSpacing:".06em",fontSize:16,flex:1}}/>
            <button className="btn btn-primary" onClick={()=>doLookup()} disabled={!plate.trim()}>🔍 Look Up</button>
          </div>
        </div>

        {scanResult&&plate&&(
          <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15}} onClick={()=>doLookup()}>
            🔍 Look Up {plate}
          </button>
        )}
      </Overlay>
    );
  }

  // ── Lookup + decision step ───────────────────────────────────
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🔍 ${plate}`} onClose={onClose}/>

      {/* Scan result summary */}
      {scanResult&&(
        <div style={{marginBottom:14,padding:10,background:"var(--surface2)",borderRadius:10,fontSize:12,display:"flex",gap:16,flexWrap:"wrap"}}>
          {scanResult.make&&<span>Make: <strong>{scanResult.make}</strong></span>}
          {scanResult.vin&&<span>VIN: <code style={{fontFamily:"DM Mono,monospace"}}>{scanResult.vin}</code></span>}
          {scanResult.engine_no&&<span>Engine: <code style={{fontFamily:"DM Mono,monospace"}}>{scanResult.engine_no}</code></span>}
          {scanResult.expiry_date&&<span style={{color:new Date(scanResult.expiry_date)<new Date()?"var(--red)":"var(--green)"}}>
            Disc: {scanResult.expiry_date} {new Date(scanResult.expiry_date)<new Date()?"⚠️ EXPIRED":"✅"}
          </span>}
        </div>
      )}

      {/* Customer / vehicle info */}
      {foundCustomer&&(
        <div style={{marginBottom:12,padding:12,background:"rgba(52,211,153,.07)",border:"1px solid rgba(52,211,153,.2)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:14}}>👤 {foundCustomer.name}</div>
          {foundCustomer.phone&&<div style={{fontSize:12,color:"var(--text3)"}}>{foundCustomer.phone}</div>}
        </div>
      )}
      {foundVehicle&&(
        <div style={{marginBottom:12,padding:12,background:"rgba(96,165,250,.07)",border:"1px solid rgba(96,165,250,.2)",borderRadius:10,fontSize:13}}>
          <div style={{fontWeight:700}}>🚗 {foundVehicle.reg} — {foundVehicle.make} {foundVehicle.model} {foundVehicle.year&&`(${foundVehicle.year})`}</div>
          {foundVehicle.color&&<div style={{fontSize:12,color:"var(--text3)"}}>{foundVehicle.color}</div>}
          {foundVehicle.vin&&<div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>VIN: {foundVehicle.vin}</div>}
        </div>
      )}
      {!foundCustomer&&!foundVehicle&&(
        <div style={{marginBottom:12,padding:12,background:"var(--surface2)",borderRadius:10,fontSize:13,color:"var(--text3)"}}>
          🆕 First visit — no record found for <strong>{plate}</strong>
        </div>
      )}

      {/* Open jobs warning */}
      {openJobs.length>0&&(
        <div style={{marginBottom:14,padding:12,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,marginBottom:6}}>⚠️ {openJobs.length} open job(s) for this vehicle</div>
          {openJobs.map(j=>(
            <div key={j.id} style={{fontSize:12,marginBottom:3}}>
              <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code>
              <span style={{marginLeft:6,color:"var(--yellow)"}}>{j.status}</span>
              <span style={{marginLeft:6,color:"var(--text3)"}}>{j.date_in}</span>
              {j.complaint&&<span style={{marginLeft:6,color:"var(--text2)"}}>"{j.complaint.slice(0,40)}"</span>}
            </div>
          ))}

          <div style={{marginTop:10}}>
            <FL label="What to do?"/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button className={`btn ${decision==="reopen"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setDecision("reopen")}>🔄 Continue Existing</button>
              <button className={`btn ${decision==="new"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setDecision("new")}>📋 New Job Card</button>
            </div>
            {decision==="reopen"&&openJobs.length>1&&(
              <div style={{marginBottom:10}}>
                {openJobs.map(j=>(
                  <label key={j.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:8,marginBottom:5,cursor:"pointer"}}>
                    <input type="radio" name="reopenJob" checked={reopenJobId===j.id} onChange={()=>setReopenJobId(j.id)}/>
                    <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                    <span style={{fontSize:11,color:"var(--text3)"}}>{j.status} · {j.date_in}</span>
                  </label>
                ))}
              </div>
            )}
            <FL label="Return / Visit Reason *"/>
            <textarea className="inp" value={returnReason} onChange={e=>setReturnReason(e.target.value)}
              placeholder="e.g. Same issue recurred, warranty claim, additional work requested..."
              style={{minHeight:60}}/>
          </div>
        </div>
      )}

      {/* Service history (collapsed) */}
      {history.length>0&&(
        <details style={{marginBottom:14}}>
          <summary style={{cursor:"pointer",fontSize:13,color:"var(--text3)",padding:"8px 0"}}>📋 Service history — {history.length} jobs</summary>
          <div style={{marginTop:8}}>
            {history.map(j=>(
              <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                <div>
                  <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                  <span style={{marginLeft:8,color:"var(--text2)"}}>{j.complaint?.slice(0,40)||"—"}</span>
                  {j.return_reason&&<span style={{marginLeft:8,color:"var(--yellow)",fontSize:11}}>🔄{j.return_reason.slice(0,30)}</span>}
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <span style={{color:"var(--text3)"}}>{j.date_in}</span>
                  <span className="badge" style={{fontSize:10}}>{j.status}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" onClick={()=>setStep("scan")}>← Back</button>
        <button className="btn btn-primary" style={{flex:1,padding:14,fontSize:15,fontWeight:700}} onClick={handleProceed}>
          {openJobs.length>0&&decision==="reopen" ? "🔄 Reopen Job" : "📋 Create New Job →"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════════════
function WsCustomersPage({wsCustomers=[],wsVehicles=[],jobs=[],onSaveCustomer,onDeleteCustomer,onSaveVehicle,onDeleteVehicle,onOpenJob,t,lang}) {
  const [view,setView]=useState("list"); // list | customer
  const [activeCust,setActiveCust]=useState(null);
  const [editCust,setEditCust]=useState(null);
  const [editVehicle,setEditVehicle]=useState(null);
  const [search,setSearch]=useState("");

  const filtered=wsCustomers.filter(c=>{
    if(!search.trim()) return true;
    const q=search.toLowerCase();
    return `${c.name} ${c.phone||""} ${c.email||""}`.toLowerCase().includes(q);
  });

  if(view==="customer"&&activeCust){
    const custVehicles=wsVehicles.filter(v=>v.workshop_customer_id===activeCust.id);
    const custJobs=jobs.filter(j=>j.workshop_customer_id===activeCust.id||j.customer_name===activeCust.name);
    return (
      <>
      <div className="fu">
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>{setView("list");setActiveCust(null);}}>← Back</button>
          <div style={{flex:1}}>
            <h1 style={{fontSize:18,fontWeight:700}}>{activeCust.name}</h1>
            <div style={{fontSize:12,color:"var(--text3)"}}>{activeCust.phone}{activeCust.email&&` · ${activeCust.email}`}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditCust(activeCust)}>✏️ Edit</button>
          <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete customer?")){ await onDeleteCustomer(activeCust.id); setView("list"); setActiveCust(null); }}}>🗑️</button>
        </div>

        {/* Vehicles */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🚗 Vehicles ({custVehicles.length})</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setEditVehicle({workshop_customer_id:activeCust.id,reg:"",make:"",model:"",year:"",color:"",notes:""})}>+ Add Vehicle</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10,marginBottom:20}}>
          {custVehicles.length===0&&<div className="card" style={{padding:20,color:"var(--text3)",textAlign:"center",gridColumn:"1/-1"}}>No vehicles yet</div>}
          {custVehicles.map(v=>{
            const vJobs=jobs.filter(j=>j.workshop_vehicle_id===v.id||j.vehicle_reg===v.reg);
            const openJob=vJobs.find(j=>j.status!=="Delivered");
            return (
              <div key={v.id} className="card" style={{padding:14,borderLeft:`3px solid ${openJob?"var(--yellow)":"var(--border)"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontFamily:"DM Mono,monospace",fontSize:15}}>🚗 {v.reg}</div>
                    <div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{v.make} {v.model} {v.year&&`(${v.year})`}</div>
                    {v.color&&<div style={{fontSize:11,color:"var(--text3)"}}>{v.color}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button className="btn btn-ghost btn-xs" onClick={()=>setEditVehicle(v)}>✏️</button>
                    <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={async()=>{if(window.confirm("Delete vehicle?")) await onDeleteVehicle(v.id);}}>✕</button>
                  </div>
                </div>
                {[v.photo_front,v.photo_rear,v.photo_side].some(Boolean)&&(
                  <div style={{display:"flex",gap:5,marginTop:8}}>
                    {[{url:v.photo_front,label:"Front"},{url:v.photo_rear,label:"Rear"},{url:v.photo_side,label:"Side"}].filter(p=>p.url).map(p=>(
                      <DriveImg key={p.label} url={p.url} alt={p.label} style={{width:54,height:40,objectFit:"cover",borderRadius:5,border:"1px solid var(--border)"}}/>
                    ))}
                  </div>
                )}
                {openJob&&<div style={{marginTop:8,fontSize:11,color:"var(--yellow)"}}> Open: {openJob.status} · {openJob.date_in}</div>}
                <div style={{marginTop:6,fontSize:11,color:"var(--text3)"}}>{vJobs.length} job(s) total</div>
              </div>
            );
          })}
        </div>

        {/* Job history */}
        <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📋 Job History ({custJobs.length})</div>
        {custJobs.length===0&&<div className="card" style={{padding:20,color:"var(--text3)",textAlign:"center"}}>No jobs yet</div>}
        {onOpenJob&&custJobs.length>0&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>Double-click a job to open job card</div>}
        {custJobs.map(j=>(
          <div key={j.id} className="card" style={{padding:12,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:onOpenJob?"pointer":"default"}}
            onDoubleClick={()=>onOpenJob&&onOpenJob(j)}>
            <div>
              <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.id}</code>
              <span style={{marginLeft:10,fontSize:13,fontWeight:600}}>{j.vehicle_reg}</span>
              {j.complaint&&<div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{j.complaint.slice(0,60)}</div>}
              {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginTop:2}}>🔄 {j.return_reason.slice(0,50)}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span className="badge" style={{fontSize:11}}>{j.status}</span>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>{j.date_in}</div>
            </div>
          </div>
        ))}

      </div>
      {/* Modals outside .fu so position:fixed isn't trapped by the animation stacking context */}
      {editCust&&(
        <Overlay onClose={()=>setEditCust(null)} wide>
          <MHead title={editCust.id?"✏️ Edit Customer":"👤 New Customer"} onClose={()=>setEditCust(null)}/>
          <WsCustomerForm data={editCust}
            onSave={async(d)=>{ await onSaveCustomer(d); setEditCust(null); if(activeCust&&activeCust.id===d.id) setActiveCust({...activeCust,...d}); }}
            onClose={()=>setEditCust(null)} t={t}/>
        </Overlay>
      )}
      {editVehicle&&(
        <Overlay onClose={()=>setEditVehicle(null)} wide>
          <MHead title={editVehicle.id?"✏️ Edit Vehicle":"🚗 Add Vehicle"} onClose={()=>setEditVehicle(null)}/>
          <WsVehicleForm data={editVehicle}
            onSave={async(d)=>{ await onSaveVehicle(d); setEditVehicle(null); }}
            onClose={()=>setEditVehicle(null)} t={t}/>
        </Overlay>
      )}
      </>
    );
  }

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>👤 {lang==="zh"?"維修客戶":"Workshop Customers"}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{wsCustomers.length} customers · {wsVehicles.length} vehicles</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setEditCust({name:"",phone:"",email:"",notes:""})}>+ New Customer</button>
      </div>

      <div style={{position:"relative",marginBottom:14,maxWidth:320}}>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone..."/>
        {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
      </div>

      {filtered.length===0&&<div className="card" style={{padding:36,textAlign:"center",color:"var(--text3)"}}>No customers yet</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(c=>{
          const cv=wsVehicles.filter(v=>v.workshop_customer_id===c.id);
          const cj=jobs.filter(j=>j.workshop_customer_id===c.id||j.customer_name===c.name);
          const openJobs=cj.filter(j=>j.status!=="Delivered");
          return (
            <div key={c.id} className="card card-hover" style={{padding:16,cursor:"pointer"}} onClick={()=>{setActiveCust(c);setView("customer");}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{c.name}</div>
                  {c.phone&&<div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{c.phone}</div>}
                </div>
                {openJobs.length>0&&<span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",flexShrink:0}}>{openJobs.length} open</span>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {cv.map(v=><span key={v.id} className="badge" style={{fontFamily:"DM Mono,monospace",fontSize:11,background:"var(--surface2)"}}>🚗 {v.reg}</span>)}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"var(--text3)"}}>{cv.length} vehicle(s) · {cj.length} job(s)</div>
            </div>
          );
        })}
      </div>

      {/* Edit customer modal */}
      {editCust&&(
        <Overlay onClose={()=>setEditCust(null)} wide>
          <MHead title={editCust.id?"✏️ Edit Customer":"👤 New Customer"} onClose={()=>setEditCust(null)}/>
          <WsCustomerForm data={editCust}
            onSave={async(d)=>{ await onSaveCustomer(d); setEditCust(null); if(activeCust&&activeCust.id===d.id) setActiveCust({...activeCust,...d}); }}
            onClose={()=>setEditCust(null)} t={t}/>
        </Overlay>
      )}

      {/* Edit vehicle modal */}
      {editVehicle&&(
        <Overlay onClose={()=>setEditVehicle(null)} wide>
          <MHead title={editVehicle.id?"✏️ Edit Vehicle":"🚗 Add Vehicle"} onClose={()=>setEditVehicle(null)}/>
          <WsVehicleForm data={editVehicle}
            onSave={async(d)=>{ await onSaveVehicle(d); setEditVehicle(null); }}
            onClose={()=>setEditVehicle(null)} t={t}/>
        </Overlay>
      )}
    </div>
  );
}

function WsCustomerForm({data,onSave,onClose,t}) {
  const [f,setF]=useState({id:data.id||null,name:data.name||"",phone:data.phone||"",email:data.email||"",id_number:data.id_number||"",notes:data.notes||""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div>
      <FG>
        <div><FL label="Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Full name"/></div>
        <div><FL label={t.phone}/><input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="+27..."/></div>
      </FG>
      <FG>
        <div><FL label={t.email}/><input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></div>
        <div><FL label="ID / Reg No."/><input className="inp" value={f.id_number} onChange={e=>s("id_number",e.target.value)}/></div>
      </FG>
      <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:50}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.name.trim()){alert("Name required");return;}onSave(f);}}>💾 {t.save}</button>
      </div>
    </div>
  );
}

function WsVehicleForm({data,onSave,onClose,t}) {
  const [f,setF]=useState({id:data.id||null,workshop_customer_id:data.workshop_customer_id,reg:data.reg||"",make:data.make||"",model:data.model||"",year:data.year||"",color:data.color||"",vin:data.vin||"",engine_no:data.engine_no||"",notes:data.notes||"",photo_front:data.photo_front||"",photo_rear:data.photo_rear||"",photo_side:data.photo_side||""});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div>
      <FG>
        <div><FL label="Plate / Reg *"/><input className="inp" value={f.reg} onChange={e=>s("reg",e.target.value.toUpperCase())} placeholder="GP 123-456" style={{fontFamily:"DM Mono,monospace",fontWeight:700}}/></div>
        <div><FL label="Color"/><input className="inp" value={f.color} onChange={e=>s("color",e.target.value)} placeholder="White, Black..."/></div>
      </FG>
      <FG cols="1fr 1fr 1fr">
        <div><FL label={t.make}/><input className="inp" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="Toyota..."/></div>
        <div><FL label={t.model}/><input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="Hilux..."/></div>
        <div><FL label="Year"/><input className="inp" type="number" value={f.year} onChange={e=>s("year",e.target.value)} placeholder="2022"/></div>
      </FG>
      <FG>
        <div><FL label="VIN"/><input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} placeholder="17-char VIN" style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
        <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
      </FG>
      <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:50}}/></FD>

      {/* Photos — only available after vehicle is saved */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",margin:"14px 0 8px",paddingBottom:6,borderBottom:"1px solid var(--border)"}}>📸 Vehicle Photos</div>
      {f.id
        ? <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[
              {key:"photo_front", label:"Front"},
              {key:"photo_rear",  label:"Rear"},
              {key:"photo_side",  label:"Side"},
            ].map(({key,label})=>(
              <VehiclePhotoUploader key={key} label={label} url={f[key]}
                vehicleId={f.id} make={f.make||"vehicle"} reg={f.reg} viewName={key.replace("photo_","")}
                onChange={url=>s(key,url)}/>
            ))}
          </div>
        : <div style={{textAlign:"center",padding:16,background:"var(--surface2)",borderRadius:10,color:"var(--text3)",fontSize:13}}>
            💾 Save the vehicle first, then add photos
          </div>
      }

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{if(!f.reg.trim()){alert("Plate required");return;}onSave(f);}}>💾 {t.save}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP PAGE
// ═══════════════════════════════════════════════════════════════
function WorkshopPage({jobs,jobItems,invoices,quotes=[],parts=[],partFitments=[],vehicles=[],customers,wsCustomers=[],wsVehicles=[],wsStock=[],wsServices=[],settings,initialTab,onSaveJob,onDeleteJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,onSaveWsCustomer,onDeleteWsCustomer,onSaveWsVehicle,onDeleteWsVehicle,onSaveWsStock,onDeleteWsStock,onAdjustWsStock,onSaveWsService,onDeleteWsService,onSaveWsTransfer,t,lang}) {
  const [view,      setView]      = useState("list");
  const [activeJob, setActiveJob] = useState(null);
  const [editJob,   setEditJob]   = useState(null);
  const [filterSt,  setFilterSt]  = useState("__all__");
  const [search,    setSearch]    = useState("");
  const [bookIn,    setBookIn]    = useState(false);
  const [wsTab,     setWsTab]     = useState(initialTab||"jobs");
  const [stmtCust,  setStmtCust]  = useState("");  // statement: selected customer id
  const [qInvModal, setQInvModal] = useState(null); // {job, items, quote} for convert-from-list

  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};
  const ST_BG    = {"Pending":"rgba(96,165,250,.12)","In Progress":"rgba(251,191,36,.12)","Done":"rgba(52,211,153,.12)","Delivered":"rgba(100,116,139,.12)"};

  const filtered = jobs.filter(j=>{
    if(filterSt!=="__all__"&&j.status!==filterSt) return false;
    if(!search.trim()) return true;
    const s=search.toLowerCase();
    return `${j.customer_name} ${j.vehicle_reg} ${j.vehicle_make} ${j.vehicle_model} ${j.id}`.toLowerCase().includes(s);
  });

  const jobInvoice = (jobId) => invoices.find(i=>i.job_id===jobId);
  const jobQuote   = (jobId) => quotes.find(q=>q.job_id===jobId);

  const C   = settings.currency||"ZAR";
  const fmt = v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  // ── Job detail view ──────────────────────────────────────────
  if(view==="job"&&activeJob){
    const items = jobItems.filter(i=>i.job_id===activeJob.id);
    const inv   = jobInvoice(activeJob.id);
    const quote = jobQuote(activeJob.id);
    return (
      <WorkshopJobDetail
        job={activeJob} items={items} invoice={inv} quote={quote}
        parts={parts} partFitments={partFitments} vehicles={vehicles} settings={settings}
        wsVehicles={wsVehicles} wsCustomers={wsCustomers} wsStock={wsStock} wsServices={wsServices}
        onBack={()=>{ setView("list"); setActiveJob(null); }}
        onSaveJob={async(d)=>{ await onSaveJob(d); setActiveJob({...activeJob,...d}); }}
        onSaveItem={onSaveItem} onDeleteItem={onDeleteItem}
        onSaveInvoice={onSaveInvoice} onUpdateInvoice={onUpdateInvoice} onDeleteInvoice={onDeleteInvoice}
        onSaveQuote={onSaveQuote} onDeleteQuote={onDeleteQuote} onConvertQuoteToInvoice={onConvertQuoteToInvoice}
        onSendQuoteForApproval={onSendQuoteForApproval}
        t={t} lang={lang}/>
    );
  }

  // ── Sub-nav tabs ─────────────────────────────────────────────
  const quoteResponses = quotes.filter(q=>q.confirm_status==="confirmed"||q.confirm_status==="declined").length;
  const WS_TABS = [
    ["jobs",       "🔧 Jobs",        jobs.length],
    ["customers",  "👥 Customers",   wsCustomers.length],
    ["quotations", quoteResponses>0?`📝 Quotations 🔔`:"📝 Quotations",  quotes.length],
    ["invoices",   "🧾 Invoices",    invoices.length],
    ["payments",   "💳 Payments",    invoices.filter(i=>(+i.paid_amount||0)>0).length],
    ["wsstock",    "📦 WS Stock",    wsStock.length],
    ["wsservices", "🔧 Services",    wsServices.length],
    ["wstransfer", "🔄 Transfer",    null],
    ["statement",  "📋 Statement",   null],
    ["report",     "📊 Report",      null],
  ];

  // ── Report stats ─────────────────────────────────────────────
  const totalInvoiced  = invoices.reduce((s,i)=>s+(+i.total||0),0);
  const totalPaid      = invoices.reduce((s,i)=>s+(+i.paid_amount||0),0);
  const totalOutstanding = totalInvoiced - totalPaid;
  const totalQuoted    = quotes.filter(q=>q.status!=="converted").reduce((s,q)=>s+(+q.total||0),0);

  return (
    <div className="fu">
      {/* ── Page header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🔧 {t.workshop||"Workshop"}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:2}}>
            {jobs.length} jobs · {jobs.filter(j=>j.status==="In Progress").length} in progress · {invoices.filter(i=>i.status!=="paid").length} unpaid invoices
          </p>
        </div>
        {wsTab==="jobs"&&(
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" style={{fontSize:14,padding:"9px 18px"}} onClick={()=>setBookIn(true)}>📷 Book In Car</button>
            <button className="btn btn-ghost" onClick={()=>setEditJob({
              customer_name:"",customer_phone:"",vehicle_reg:"",vehicle_make:"",
              vehicle_model:"",vehicle_year:"",vehicle_color:"",vin:"",engine_no:"",mileage:"",
              complaint:"",diagnosis:"",mechanic:"",date_in:new Date().toISOString().slice(0,10),
              date_out:"",notes:"",status:"Pending"
            })}>+ Manual</button>
          </div>
        )}
      </div>

      {/* ── Sub-navigation ── */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:18,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
        {WS_TABS.map(([v,label,cnt])=>(
          <button key={v} onClick={()=>setWsTab(v)} style={{
            padding:"8px 14px",border:"none",background:"none",cursor:"pointer",
            fontSize:13,fontWeight:wsTab===v?700:400,
            color:wsTab===v?"var(--accent)":"var(--text2)",
            borderBottom:wsTab===v?"2px solid var(--accent)":"2px solid transparent",
            marginBottom:-1,whiteSpace:"nowrap",
          }}>
            {label}{cnt!==null&&<span style={{marginLeft:5,opacity:.55,fontSize:11,fontWeight:400}}>{cnt}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════ JOBS TAB ══════════════ */}
      {wsTab==="jobs"&&(<>
        <div className="tabs" style={{marginBottom:14,width:"fit-content",maxWidth:"100%",flexWrap:"wrap"}}>
          {[["__all__","All"],["Pending","🔵 Pending"],["In Progress","🟡 In Progress"],["Done","🟢 Done"],["Delivered","⚫ Delivered"]].map(([v,l])=>{
            const cnt=v==="__all__"?jobs.length:jobs.filter(j=>j.status===v).length;
            return <button key={v} className={`tab ${filterSt===v?"on":""}`} onClick={()=>setFilterSt(v)}>{l} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;
          })}
        </div>
        <div style={{position:"relative",marginBottom:14,maxWidth:320}}>
          <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, plate..."/>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
        </div>
        {filtered.length===0&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No jobs found</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {filtered.map(j=>{
            const jItems=jobItems.filter(i=>i.job_id===j.id);
            const inv=jobInvoice(j.id);
            const jq=jobQuote(j.id);
            const total=jItems.reduce((s,i)=>s+(+i.total||0),0);
            return (
              <div key={j.id} className="card card-hover" style={{padding:16,cursor:"pointer",borderLeft:`3px solid ${ST_COLOR[j.status]||"var(--border)"}`}}
                onClick={()=>{setActiveJob(j);setView("job");}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{j.customer_name||<span style={{color:"var(--text3)"}}>No name</span>}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{j.customer_phone}</div>
                  </div>
                  <span className="badge" style={{background:ST_BG[j.status],color:ST_COLOR[j.status],flexShrink:0}}>{j.status}</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {j.vehicle_reg&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text)",fontFamily:"DM Mono,monospace",fontSize:12,fontWeight:700}}>🚗 {j.vehicle_reg}</span>}
                  {j.vehicle_make&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text2)",fontSize:11}}>{j.vehicle_make} {j.vehicle_model}</span>}
                  {j.vehicle_year&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text3)",fontSize:11}}>{j.vehicle_year}</span>}
                </div>
                {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginBottom:6}}>🔄 {j.return_reason.slice(0,50)}</div>}
                {j.complaint&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:8,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>💬 {j.complaint}</div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:8}}>
                  <div style={{fontSize:11,color:"var(--text3)"}}>
                    <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code>
                    {j.mechanic&&<span style={{marginLeft:6}}>👷 {j.mechanic}</span>}
                  </div>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    {jq&&!inv&&<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",fontSize:10}}>📝 Quoted</span>}
                    {inv&&<span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:10}}>🧾 Invoiced</span>}
                    {total>0&&<span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>{fmt(total)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* ══════════════ CUSTOMERS TAB ══════════════ */}
      {wsTab==="customers"&&(
        <WsCustomersPage
          wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
          onSaveCustomer={onSaveWsCustomer} onDeleteCustomer={onDeleteWsCustomer}
          onSaveVehicle={onSaveWsVehicle} onDeleteVehicle={onDeleteWsVehicle}
          onOpenJob={(j)=>{ setWsTab("jobs"); setActiveJob(j); setView("job"); }}
          settings={settings} embedded t={t}/>
      )}

      {/* ══════════════ QUOTATIONS TAB ══════════════ */}
      {wsTab==="quotations"&&(<>
        <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <span style={{fontSize:13,color:"var(--text3)"}}>{quotes.length} quotation{quotes.length!==1?"s":""}</span>
        </div>
        {quotes.length===0
          ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No quotations yet — create one from a job card</div>
          : <div className="card" style={{overflow:"auto"}}>
              <table className="tbl" style={{width:"100%",minWidth:700}}>
                <thead><tr>
                  <th>Quote ID</th><th>Customer</th><th>Vehicle</th><th>Date</th><th>Valid Until</th><th style={{textAlign:"right"}}>Total</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {[...quotes].sort((a,b)=>new Date(b.quote_date)-new Date(a.quote_date)).map(q=>{
                    const j=jobs.find(jb=>jb.id===q.job_id);
                    const QST_COLOR={draft:"var(--text3)",sent:"var(--blue)",accepted:"var(--green)",declined:"var(--red)",converted:"var(--text3)"};
                    const QST_BG={draft:"rgba(100,116,139,.12)",sent:"rgba(96,165,250,.12)",accepted:"rgba(52,211,153,.12)",declined:"rgba(248,113,113,.12)",converted:"rgba(100,116,139,.08)"};
                    return (
                      <tr key={q.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{q.id}</code></td>
                        <td><div style={{fontWeight:600}}>{q.quote_customer||j?.customer_name||"—"}</div><div style={{fontSize:11,color:"var(--text3)"}}>{q.quote_phone||j?.customer_phone}</div></td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{q.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                        <td style={{fontSize:12}}>{q.quote_date}</td>
                        <td style={{fontSize:12,color:q.valid_until&&new Date(q.valid_until)<new Date()?"var(--red)":"var(--text2)"}}>{q.valid_until||"—"}</td>
                        <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(q.total)}</td>
                        <td><span className="badge" style={{background:QST_BG[q.status]||QST_BG.draft,color:QST_COLOR[q.status]||"var(--text3)",fontSize:11}}>{q.status}</span></td>
                        <td>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{setActiveJob(j);setView("job");}}>Open Job</button>}
                            {j&&q.status==="accepted"&&!invoices.find(i=>i.job_id===q.job_id)&&(
                              <button className="btn btn-primary btn-xs" onClick={()=>{
                                const its=jobItems.filter(i=>i.job_id===q.job_id);
                                const sub=its.reduce((s,i)=>s+(+i.total||0),0);
                                const tx=settings.vat_number?sub*(settings.tax_rate||0)/100:0;
                                setQInvModal({job:j,items:its,quote:q,subtotal:sub,tax:tx,total:sub+tx});
                              }}>🧾 Invoice</button>
                            )}
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{const vp=wsVehicles.find(x=>x.id===j.workshop_vehicle_id);printWorkshopQuote(j,jobItems.filter(i=>i.job_id===j.id),q,settings,{front:vp?.photo_front||"",rear:vp?.photo_rear||"",side:vp?.photo_side||""});}}>🖨️</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </>)}

      {/* Convert-quote-to-invoice modal (launched from quotations list) */}
      {qInvModal&&(
        <WorkshopInvoiceModal
          job={qInvModal.job} items={qInvModal.items}
          subtotal={qInvModal.subtotal} tax={qInvModal.tax} total={qInvModal.total}
          settings={settings}
          prefill={{
            invCust:  qInvModal.quote.quote_customer||"",
            invPhone: qInvModal.quote.quote_phone||"",
            invEmail: qInvModal.quote.quote_email||"",
            dueDate:  qInvModal.quote.valid_until||"",
            notes:    `Converted from Quote ${qInvModal.quote.id}${qInvModal.quote.notes?"\n"+qInvModal.quote.notes:""}`,
          }}
          onSave={async(inv)=>{
            await onSaveInvoice(inv);
            await onSaveQuote({...qInvModal.quote, status:"converted"});
            setQInvModal(null);
            setWsTab("invoices");
          }}
          onClose={()=>setQInvModal(null)} t={t}/>
      )}

      {/* ══════════════ INVOICES TAB ══════════════ */}
      {wsTab==="invoices"&&(<>
        <div style={{marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Total Invoiced",totalInvoiced,"var(--accent)"],["Total Paid",totalPaid,"var(--green)"],["Outstanding",totalOutstanding,"var(--red)"]].map(([l,v,c])=>(
            <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:c}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
        {invoices.length===0
          ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No invoices yet</div>
          : <div className="card" style={{overflow:"auto"}}>
              <table className="tbl" style={{width:"100%",minWidth:750}}>
                <thead><tr><th>Invoice ID</th><th>Customer</th><th>Vehicle</th><th>Date</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {[...invoices].sort((a,b)=>new Date(b.invoice_date)-new Date(a.invoice_date)).map(inv=>{
                    const j=jobs.find(jb=>jb.id===inv.job_id);
                    const paid=+inv.paid_amount||0;
                    const bal=(+inv.total||0)-paid;
                    const sc=inv.status==="paid"?"var(--green)":inv.status==="partial"?"var(--yellow)":"var(--red)";
                    const sb=inv.status==="paid"?"rgba(52,211,153,.12)":inv.status==="partial"?"rgba(251,191,36,.12)":"rgba(248,113,113,.12)";
                    return (
                      <tr key={inv.id}>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                        <td><div style={{fontWeight:600}}>{inv.invoice_customer||j?.customer_name||"—"}</div><div style={{fontSize:11,color:"var(--text3)"}}>{inv.inv_phone||j?.customer_phone}</div></td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                        <td style={{fontSize:12}}>{inv.invoice_date}</td>
                        <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)}</td>
                        <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{paid>0?fmt(paid):"—"}</td>
                        <td style={{textAlign:"right",color:bal>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(bal)}</td>
                        <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ Paid":inv.status==="partial"?"💛 Partial":"⏳ Unpaid"}</span></td>
                        <td>
                          <div style={{display:"flex",gap:4}}>
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{setActiveJob(j);setView("job");}}>Open</button>}
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{const vp=wsVehicles.find(x=>x.id===j.workshop_vehicle_id);printWorkshopInvoice(j,jobItems.filter(i=>i.job_id===j.id),inv,settings,{front:vp?.photo_front||"",rear:vp?.photo_rear||"",side:vp?.photo_side||""});}}>🖨️</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </>)}

      {/* ══════════════ PAYMENTS TAB ══════════════ */}
      {wsTab==="payments"&&(()=>{
        const paid=invoices.filter(i=>(+i.paid_amount||0)>0).sort((a,b)=>new Date(b.payment_date||b.invoice_date)-new Date(a.payment_date||a.invoice_date));
        return (<>
          <div style={{marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
            {[["Payments Received",paid.length+" transactions","var(--blue)"],["Total Collected",fmt(paid.reduce((s,i)=>s+(+i.paid_amount||0),0)),"var(--green)"]].map(([l,v,c])=>(
              <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                <div style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {paid.length===0
            ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No payments recorded yet</div>
            : <div className="card" style={{overflow:"auto"}}>
                <table className="tbl" style={{width:"100%",minWidth:700}}>
                  <thead><tr><th>Invoice</th><th>Customer</th><th>Vehicle</th><th>Pay Date</th><th>Method</th><th>Reference</th><th style={{textAlign:"right"}}>Invoice Total</th><th style={{textAlign:"right"}}>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {paid.map(inv=>{
                      const j=jobs.find(jb=>jb.id===inv.job_id);
                      const sc=inv.status==="paid"?"var(--green)":"var(--yellow)";
                      const sb=inv.status==="paid"?"rgba(52,211,153,.12)":"rgba(251,191,36,.12)";
                      return (
                        <tr key={inv.id}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                          <td style={{fontWeight:600}}>{inv.invoice_customer||j?.customer_name||"—"}</td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{inv.vehicle_reg||j?.vehicle_reg||"—"}</code></td>
                          <td style={{fontSize:12}}>{inv.payment_date||"—"}</td>
                          <td><span className="badge" style={{background:"var(--surface2)",color:"var(--text2)",fontSize:11}}>{inv.payment_method||"—"}</span></td>
                          <td style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{inv.payment_ref||"—"}</td>
                          <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)}</td>
                          <td style={{textAlign:"right",fontWeight:700,color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.paid_amount)}</td>
                          <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ Paid":"💛 Partial"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }
        </>);
      })()}

      {/* ══════════════ WS STOCK TAB ══════════════ */}
      {wsTab==="wsstock"&&(
        <WsStockPage wsStock={wsStock} settings={settings}
          onSave={onSaveWsStock} onDelete={onDeleteWsStock} onAdjust={onAdjustWsStock}/>
      )}

      {/* ══════════════ WS SERVICES TAB ══════════════ */}
      {wsTab==="wsservices"&&(
        <WsServicesPage wsServices={wsServices} settings={settings}
          onSave={onSaveWsService} onDelete={onDeleteWsService}/>
      )}

      {/* ══════════════ WS TRANSFER TAB ══════════════ */}
      {wsTab==="wstransfer"&&(
        <WsTransferPage parts={parts} wsStock={wsStock} settings={settings}
          onSave={onSaveWsTransfer}/>
      )}

      {/* ══════════════ STATEMENT TAB ══════════════ */}
      {wsTab==="statement"&&(()=>{
        const sc=stmtCust?wsCustomers.find(c=>c.id===stmtCust):null;
        const scJobs=sc?jobs.filter(j=>j.workshop_customer_id===sc.id||j.customer_name===sc.name):[];
        const scJobIds=scJobs.map(j=>j.id);
        const scInvoices=invoices.filter(i=>scJobIds.includes(i.job_id));
        const scQuotes=quotes.filter(q=>scJobIds.includes(q.job_id));
        const scVehicles=wsVehicles.filter(v=>v.workshop_customer_id===sc?.id);
        const totalBilled=scInvoices.reduce((s,i)=>s+(+i.total||0),0);
        const totalPaidC=scInvoices.reduce((s,i)=>s+(+i.paid_amount||0),0);
        const outstanding=totalBilled-totalPaidC;
        return (<>
          <div style={{marginBottom:14,maxWidth:380}}>
            <label style={{fontSize:12,color:"var(--text3)",display:"block",marginBottom:6}}>Select Customer</label>
            <select className="inp" value={stmtCust} onChange={e=>setStmtCust(e.target.value)}>
              <option value="">— Choose a customer —</option>
              {wsCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:""}</option>)}
            </select>
          </div>
          {sc&&(<>
            {/* Customer info */}
            <div className="card" style={{padding:14,marginBottom:14,borderLeft:"3px solid var(--accent)"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>👤 {sc.name}</div>
                  {sc.phone&&<div style={{fontSize:13,color:"var(--text3)"}}>{sc.phone}</div>}
                  {sc.email&&<div style={{fontSize:13,color:"var(--text3)"}}>{sc.email}</div>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {[["Jobs",scJobs.length,"var(--blue)"],["Vehicles",scVehicles.length,"var(--text2)"],["Quotes",scQuotes.length,"var(--blue)"],["Invoices",scInvoices.length,"var(--accent)"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",padding:"8px 14px",background:"var(--surface2)",borderRadius:8}}>
                      <div style={{fontSize:18,fontWeight:700,color:c}}>{v}</div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {scVehicles.length>0&&(
                <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {scVehicles.map(v=>(
                    <span key={v.id} className="badge" style={{background:"var(--surface2)",fontFamily:"DM Mono,monospace",fontSize:12}}>
                      🚗 {v.reg} — {v.make} {v.model} {v.year}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Financial summary */}
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              {[["Total Billed",totalBilled,"var(--accent)"],["Total Paid",totalPaidC,"var(--green)"],["Outstanding",outstanding,outstanding>0?"var(--red)":"var(--green)"]].map(([l,v,c])=>(
                <div key={l} className="card" style={{padding:"10px 16px",flex:1,minWidth:130}}>
                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                  <div style={{fontWeight:700,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:c}}>{fmt(v)}</div>
                </div>
              ))}
            </div>
            {/* Jobs history */}
            {scJobs.length>0&&(
              <div className="card" style={{overflow:"auto",marginBottom:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>🔧 Job History</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Job ID</th><th>Vehicle</th><th>Date In</th><th>Complaint</th><th>Status</th><th>Invoice</th></tr></thead>
                  <tbody>
                    {scJobs.map(j=>{
                      const inv=jobInvoice(j.id);
                      return (
                        <tr key={j.id} style={{cursor:"pointer"}} onClick={()=>{setActiveJob(j);setView("job");}}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code></td>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.vehicle_reg||"—"}</code></td>
                          <td style={{fontSize:12}}>{j.date_in}</td>
                          <td style={{fontSize:12,color:"var(--text2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.complaint||"—"}</td>
                          <td><span className="badge" style={{background:ST_BG[j.status],color:ST_COLOR[j.status],fontSize:11}}>{j.status}</span></td>
                          <td>{inv?<span style={{fontWeight:700,color:inv.status==="paid"?"var(--green)":"var(--red)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(inv.total)} {inv.status==="paid"?"✅":"⏳"}</span>:<span style={{color:"var(--text3)",fontSize:12}}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Invoices */}
            {scInvoices.length>0&&(
              <div className="card" style={{overflow:"auto",marginBottom:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>🧾 Invoice History</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Invoice ID</th><th>Date</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    {scInvoices.map(inv=>{
                      const bal=(+inv.total||0)-(+inv.paid_amount||0);
                      const sc2=inv.status==="paid"?"var(--green)":inv.status==="partial"?"var(--yellow)":"var(--red)";
                      const sb2=inv.status==="paid"?"rgba(52,211,153,.12)":inv.status==="partial"?"rgba(251,191,36,.12)":"rgba(248,113,113,.12)";
                      return (
                        <tr key={inv.id}>
                          <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{inv.id}</code></td>
                          <td style={{fontSize:12}}>{inv.invoice_date}</td>
                          <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(inv.total)}</td>
                          <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{+inv.paid_amount>0?fmt(inv.paid_amount):"—"}</td>
                          <td style={{textAlign:"right",fontWeight:700,color:bal>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(bal)}</td>
                          <td><span className="badge" style={{background:sb2,color:sc2,fontSize:11}}>{inv.status==="paid"?"✅ Paid":inv.status==="partial"?"💛 Partial":"⏳ Unpaid"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>)}
          {!sc&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>Select a customer above to view their statement</div>}
        </>);
      })()}

      {/* ══════════════ REPORT TAB ══════════════ */}
      {wsTab==="report"&&(()=>{
        const now=new Date();
        const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
        const lastMonthStr=`${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,"0")}`;
        const jobsThisMonth=jobs.filter(j=>(j.date_in||"").startsWith(thisMonth));
        const invThisMonth=invoices.filter(i=>(i.invoice_date||"").startsWith(thisMonth));
        const revThisMonth=invThisMonth.reduce((s,i)=>s+(+i.total||0),0);
        const paidThisMonth=invoices.filter(i=>(i.payment_date||"").startsWith(thisMonth)).reduce((s,i)=>s+(+i.paid_amount||0),0);
        // Status breakdown
        const byStatus=["Pending","In Progress","Done","Delivered"].map(s=>([s,jobs.filter(j=>j.status===s).length]));
        // Top customers by revenue
        const custRev={};
        invoices.forEach(inv=>{ const k=inv.invoice_customer||"Unknown"; custRev[k]=(custRev[k]||0)+(+inv.total||0); });
        const topCust=Object.entries(custRev).sort((a,b)=>b[1]-a[1]).slice(0,5);
        return (<>
          {/* KPI cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:20}}>
            {[
              ["Total Jobs",jobs.length,"var(--blue)","🔧"],
              ["This Month Jobs",jobsThisMonth.length,"var(--blue)","📅"],
              ["Active Jobs",jobs.filter(j=>j.status==="In Progress").length,"var(--yellow)","⚙️"],
              ["Pending Quotes",quotes.filter(q=>["draft","sent"].includes(q.status)).length,"var(--blue)","📝"],
              ["Total Invoiced",fmt(totalInvoiced),"var(--accent)","🧾"],
              ["This Month Rev",fmt(revThisMonth),"var(--accent)","📈"],
              ["Collected",fmt(totalPaid),"var(--green)","💚"],
              ["Outstanding",fmt(totalOutstanding),"var(--red)","⚠️"],
            ].map(([l,v,c,ic])=>(
              <div key={l} className="card" style={{padding:"12px 14px"}}>
                <div style={{fontSize:18,marginBottom:4}}>{ic}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                <div style={{fontWeight:700,fontSize:15,fontFamily:"Rajdhani,sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,flexWrap:"wrap"}}>
            {/* Job status breakdown */}
            <div className="card" style={{padding:14}}>
              <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>📊 Jobs by Status</div>
              {byStatus.map(([s,cnt])=>(
                <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span className="badge" style={{background:ST_BG[s],color:ST_COLOR[s],fontSize:12}}>{s}</span>
                  <div style={{flex:1,margin:"0 10px",height:6,background:"var(--surface2)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${jobs.length?cnt/jobs.length*100:0}%`,height:"100%",background:ST_COLOR[s],borderRadius:3}}/>
                  </div>
                  <span style={{fontWeight:700,minWidth:24,textAlign:"right"}}>{cnt}</span>
                </div>
              ))}
            </div>
            {/* Top customers */}
            <div className="card" style={{padding:14}}>
              <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>🏆 Top Customers by Revenue</div>
              {topCust.length===0&&<div style={{color:"var(--text3)",fontSize:13}}>No invoices yet</div>}
              {topCust.map(([name,rev],i)=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontSize:13}}>
                  <span style={{color:"var(--text3)",marginRight:8,minWidth:18}}>#{i+1}</span>
                  <span style={{flex:1,fontWeight:i===0?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
                  <span style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginLeft:8}}>{fmt(rev)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Monthly table */}
          {(()=>{
            const monthMap={};
            invoices.forEach(inv=>{
              const m=(inv.invoice_date||"").slice(0,7);
              if(!m) return;
              if(!monthMap[m]) monthMap[m]={month:m,count:0,revenue:0,paid:0};
              monthMap[m].count++;
              monthMap[m].revenue+=(+inv.total||0);
              monthMap[m].paid+=(+inv.paid_amount||0);
            });
            const months=Object.values(monthMap).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,12);
            if(!months.length) return null;
            return (
              <div className="card" style={{overflow:"auto",marginTop:14}}>
                <div style={{padding:"10px 14px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)"}}>📅 Monthly Revenue</div>
                <table className="tbl" style={{width:"100%"}}>
                  <thead><tr><th>Month</th><th style={{textAlign:"right"}}>Invoices</th><th style={{textAlign:"right"}}>Revenue</th><th style={{textAlign:"right"}}>Collected</th><th style={{textAlign:"right"}}>Outstanding</th></tr></thead>
                  <tbody>
                    {months.map(m=>(
                      <tr key={m.month}>
                        <td style={{fontWeight:m.month===thisMonth?700:400,color:m.month===thisMonth?"var(--accent)":"inherit"}}>{m.month}{m.month===thisMonth?" ⬅ current":""}</td>
                        <td style={{textAlign:"right"}}>{m.count}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(m.revenue)}</td>
                        <td style={{textAlign:"right",color:"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(m.paid)}</td>
                        <td style={{textAlign:"right",color:m.revenue-m.paid>0?"var(--red)":"var(--green)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(m.revenue-m.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>);
      })()}

      {/* ── Modals ── */}
      {bookIn&&(
        <BookInModal wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs} settings={settings}
          onSaveJob={async(d)=>{ await onSaveJob(d); setBookIn(false); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setBookIn(false); }}
          onClose={()=>setBookIn(false)} t={t}/>
      )}
      {editJob&&(
        <WorkshopJobModal job={editJob} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
          onSave={async(d)=>{ await onSaveJob(d); setEditJob(null); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setEditJob(null); }}
          onClose={()=>setEditJob(null)} t={t}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP JOB DETAIL
// ═══════════════════════════════════════════════════════════════
function WorkshopJobDetail({job,items,invoice,quote,parts,partFitments=[],vehicles=[],settings,wsVehicles=[],wsCustomers=[],wsStock=[],wsServices=[],onBack,onSaveJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,t,lang}) {
  const [editJob,      setEditJob]      = useState(false);
  const [addingItem,   setAddingItem]   = useState(null); // null | 'part' | 'labour'
  const [creatingInv,  setCreatingInv]  = useState(false);
  const [editingInv,   setEditingInv]   = useState(false);
  const [deletingInv,  setDeletingInv]  = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [statementModal,setStatementModal]=useState(false);
  const [quoteModal,   setQuoteModal]   = useState(false);  // create/edit quote
  const [deletingQuote,setDeletingQuote]= useState(false);
  const [quoteSrcForInv,setQuoteSrcForInv]= useState(null); // quote being converted to invoice
  const [approvalModal, setApprovalModal] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState(false);

  const vehiclePhotos = wsVehicles.reduce((acc,v)=>v.id===job.workshop_vehicle_id?{front:v.photo_front||"",rear:v.photo_rear||"",side:v.photo_side||""}:acc,{front:"",rear:"",side:""});

  // ── Job photos ────────────────────────────────────────────────
  const [savedPhotos,   setSavedPhotos]   = useState([]);      // from DB
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [uploadPhotos,  setUploadPhotos]  = useState([]);      // in-progress uploads
  const [viewPhoto,     setViewPhoto]     = useState(null);    // full-screen preview
  const jobPhotoCamRef = useRef(null);
  const jobPhotoGalRef = useRef(null);
  const jobPhotoCounter = useRef(0);

  // Load saved photos from DB when job changes
  useEffect(()=>{
    setLoadingPhotos(true);
    api.get("workshop_job_photos",`job_id=eq.${job.id}&order=created_at.asc`)
      .then(r=>{ setSavedPhotos(Array.isArray(r)?r:[]); })
      .catch(()=>{ setSavedPhotos([]); })
      .finally(()=>setLoadingPhotos(false));
  },[job.id]);

  const uploadJobPhoto=async(uploadId,dataUrl)=>{
    const SCRIPT_URL=
      (window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||
      (window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    const setUploadStatus=(s,extra={})=>setUploadPhotos(p=>p.map(x=>x.id===uploadId?{...x,status:s,...extra}:x));
    if(!SCRIPT_URL){ setUploadStatus("error",{error:"No Script URL in Settings"}); return; }
    setUploadStatus("uploading");
    try{
      // resize to max 1600px
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1600; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.88));
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const now=new Date();
      const pad2=n=>String(n).padStart(2,"0");
      const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const timeStr=`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
      const reg=(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase();
      const folderPath=`Tim_Car_Phot/${reg}/${dateStr}`;
      const n=String(uploadId).padStart(3,"0");
      const filename=`${dateStr.replace(/-/g,"")}_${timeStr.replace(/-/g,"")}_${n}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      if(result.success){
        // Save URL to DB
        const rec={id:makeId("PH"),job_id:job.id,url:result.url,folder_path:folderPath};
        await api.insert("workshop_job_photos",rec);
        setSavedPhotos(p=>[...p,rec]);
        setUploadStatus("done",{url:result.url});
      } else {
        setUploadStatus("error",{error:result.error||"Upload failed"});
      }
    }catch(e){
      setUploadStatus("error",{error:e.message});
    }
  };

  const handleJobPhotoFile=(e)=>{
    const files=Array.from(e.target.files||[]); e.target.value="";
    if(!files.length) return;
    files.forEach(file=>{
      const isImage = file.type.startsWith("image/") || file.type==="" ||
        /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
      if(!isImage) return;
      jobPhotoCounter.current+=1;
      const uid=jobPhotoCounter.current;
      const fr=new FileReader();
      fr.onload=ev=>{
        const dataUrl=ev.target.result;
        setUploadPhotos(p=>[...p,{id:uid,dataUrl,status:"pending",url:null,error:null}]);
        uploadJobPhoto(uid,dataUrl);
      };
      fr.readAsDataURL(file);
    });
  };

  const deleteJobPhoto=async(photoId)=>{
    if(!confirm("Delete this photo?")) return;
    await api.delete("workshop_job_photos","id",photoId);
    setSavedPhotos(p=>p.filter(x=>x.id!==photoId));
  };

  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const tax      = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+tax;

  const JOB_STATUSES = ["Pending","In Progress","Done","Delivered"];
  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};

  return (
    <div className="fu">
      {/* Back + header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div style={{flex:1}}>
          <h1 style={{fontSize:18,fontWeight:700}}>{job.customer_name}</h1>
          <div style={{fontSize:12,color:"var(--text3)"}}><code style={{fontFamily:"DM Mono,monospace"}}>{job.id}</code> · {job.date_in}</div>
        </div>
        <span className="badge" style={{background:"rgba(96,165,250,.12)",color:ST_COLOR[job.status]||"var(--blue)",fontSize:13,padding:"5px 12px"}}>
          {job.status}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={()=>setEditJob(true)}>✏️ Edit</button>
        <button className="btn btn-ghost btn-sm" title="Print Job Card Label" onClick={()=>printJobCardLabel(job,settings)}>🏷️ Label</button>
        <button className="btn btn-ghost btn-sm" title="Collection / Delivery Label" onClick={()=>setDeliveryModal(true)}>🚗 Collect/Deliver</button>
      </div>

      {/* Job info card */}
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
          {[
            ["🚗 Plate",job.vehicle_reg],
            ["Make/Model",`${job.vehicle_make||""} ${job.vehicle_model||""}`.trim()||"—"],
            ["Year",job.vehicle_year||"—"],
            ["Color",job.vehicle_color||"—"],
            ["Mileage",job.mileage?`${job.mileage.toLocaleString()} km`:"—"],
            ["👷 Mechanic",job.mechanic||"—"],
            ["📅 Date In",job.date_in||"—"],
            ["📅 Date Out",job.date_out||"—"],
          ].map(([l,v])=>(
            <div key={l}>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:600,fontSize:13}}>{v||"—"}</div>
            </div>
          ))}
        </div>
        {job.complaint&&<div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:10}}>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:3}}>💬 Complaint</div>
          <div style={{fontSize:13,lineHeight:1.5}}>{job.complaint}</div>
        </div>}
        {job.diagnosis&&<div style={{marginTop:10}}>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:3}}>🔍 Diagnosis</div>
          <div style={{fontSize:13,lineHeight:1.5,color:"var(--blue)"}}>{job.diagnosis}</div>
        </div>}
        {job.return_reason&&<div style={{marginTop:10,padding:"8px 12px",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8}}>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>🔄 Return Reason</div>
          <div style={{fontSize:13,color:"var(--yellow)"}}>{job.return_reason}</div>
          {job.parent_job_id&&<div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Original job: <code style={{fontFamily:"DM Mono,monospace"}}>{job.parent_job_id}</code></div>}
        </div>}
      </div>

      {/* Status update bar */}
      <div className="card" style={{padding:12,marginBottom:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,color:"var(--text3)",marginRight:4}}>Update status:</span>
        {JOB_STATUSES.map(s=>(
          <button key={s} className={`btn btn-xs ${job.status===s?"btn-primary":"btn-ghost"}`}
            onClick={()=>onSaveJob({...job,status:s})}>
            {s}
          </button>
        ))}
      </div>

      {/* ── Vehicle Photos ── */}
      <div className="card" style={{padding:14,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:4}}>
          <div style={{fontWeight:700,fontSize:14}}>
            📷 Photos
            {savedPhotos.length>0&&<span style={{marginLeft:8,fontSize:12,fontWeight:400,color:"var(--text3)"}}>{savedPhotos.length} saved</span>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost btn-sm" title="Take new photo with camera" onClick={()=>jobPhotoCamRef.current?.click()}>📷 Camera</button>
            <button className="btn btn-ghost btn-sm" title="Browse phone gallery, Google Drive, or Files" onClick={()=>jobPhotoGalRef.current?.click()}>🖼️ Gallery / Drive</button>
          </div>
          {/* Camera: direct capture only */}
          <input ref={jobPhotoCamRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleJobPhotoFile}/>
          {/* Browse: NO accept + NO capture → Android shows full picker (Gallery, Google Drive, Files) */}
          <input ref={jobPhotoGalRef} type="file" multiple style={{display:"none"}} onChange={handleJobPhotoFile}/>
        </div>
        <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
          📷 Camera = take new photo · 🖼️ Gallery/Drive = browse phone, Google Drive, or files
        </div>

        {loadingPhotos?(
          <div style={{textAlign:"center",padding:"16px 0",color:"var(--text3)",fontSize:12}}>Loading photos...</div>
        ):(savedPhotos.length===0&&uploadPhotos.length===0)?(
          <div style={{textAlign:"center",padding:"16px 0",color:"var(--text3)",fontSize:12}}>No photos yet — tap Camera or Gallery to add</div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
            {/* Saved photos from DB */}
            {savedPhotos.map(p=>{
              const src=p.url?.includes("thumbnail?id=")||p.url?.includes("uc?export=")?p.url:toImgUrl(p.url);
              return (
                <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3",cursor:"pointer"}}
                  onClick={()=>setViewPhoto(p.url)}>
                  <img src={src} alt="vehicle photo"
                    style={{width:"100%",height:"100%",objectFit:"cover"}}
                    onError={e=>{
                      const m=p.url?.match(/thumbnail[?]id=([^&]+)/)||p.url?.match(/[?&]id=([^&]+)/)||p.url?.match(/file\/d\/([^/?]+)/);
                      if(m&&!e.target.src.includes("uc?export=view")) e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;
                    }}
                  />
                  <button onClick={e=>{e.stopPropagation();deleteJobPhoto(p.id);}}
                    style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.55)",border:"none",borderRadius:"50%",
                      width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",
                      cursor:"pointer",color:"#fff",fontSize:10,lineHeight:1}}>✕</button>
                </div>
              );
            })}
            {/* In-progress uploads */}
            {uploadPhotos.map(p=>(
              <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3"}}>
                <img src={p.dataUrl} alt="uploading" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                  background:p.status==="done"?"rgba(0,0,0,0)":p.status==="error"?"rgba(180,0,0,.5)":"rgba(0,0,0,.45)"}}>
                  {(p.status==="pending"||p.status==="uploading")&&(
                    <div style={{width:20,height:20,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
                  )}
                  {p.status==="done"&&<div style={{position:"absolute",top:3,right:5,fontSize:14}}>✅</div>}
                  {p.status==="error"&&<div style={{fontSize:9,color:"#fff",textAlign:"center",padding:3}}>❌ {(p.error||"").slice(0,25)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Full-screen photo preview */}
        {viewPhoto&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={()=>setViewPhoto(null)}>
            <img src={toImgUrl(viewPhoto)} alt="preview"
              style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
            <button style={{position:"absolute",top:16,right:20,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",
              borderRadius:"50%",width:36,height:36,fontSize:18,cursor:"pointer"}}
              onClick={()=>setViewPhoto(null)}>✕</button>
            <a href={viewPhoto} target="_blank" rel="noreferrer"
              style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",
                background:"rgba(255,255,255,.15)",color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,textDecoration:"none"}}
              onClick={e=>e.stopPropagation()}>
              Open in Drive ↗
            </a>
          </div>
        )}
      </div>

      {/* Line items */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:14}}>🔧 Parts & Labour</div>
        <div style={{display:"flex",gap:6}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("part")}>+ Part</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("labour")}>+ Labour</button>
        </div>
      </div>

      <div className="card" style={{overflow:"hidden",marginBottom:14}}>
        {items.length===0
          ? <div style={{textAlign:"center",padding:24,color:"var(--text3)"}}>No items yet — add parts or labour</div>
          : <table className="tbl" style={{width:"100%"}}>
              <thead><tr>{["Type","Description","Qty","Unit Price","Total",""].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map(item=>(
                  <tr key={item.id}>
                    <td><span className="badge" style={{background:item.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:item.type==="part"?"var(--blue)":"var(--green)"}}>{item.type==="part"?"🔩 Part":"👷 Labour"}</span></td>
                    <td style={{fontWeight:500}}>{item.description}{item.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:8}}>{item.part_sku}</code>}</td>
                    <td style={{textAlign:"right"}}>{item.qty}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(item.unit_price)}</td>
                    <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmtAmt(item.total)}</td>
                    <td><button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>onDeleteItem(item.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
        {/* Totals */}
        {items.length>0&&(
          <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{color:"var(--text)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(subtotal)}</strong></div>
            {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</strong></div>}
            <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmtAmt(total)}</div>
          </div>
        )}
      </div>

      {/* ── Quote section ── */}
      {quote ? (
        <div className="card" style={{padding:14,marginBottom:14,borderLeft:`3px solid ${
          quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)"}`}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>📝 Quotation <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{quote.id}</code></div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                {quote.quote_date}{quote.valid_until&&` · Valid until ${quote.valid_until}`}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(quote.total)}</div>
            </div>
            <span className="badge" style={{
              background:quote.status==="accepted"?"rgba(52,211,153,.15)":quote.status==="declined"?"rgba(248,113,113,.15)":quote.status==="converted"?"rgba(100,116,139,.15)":"rgba(96,165,250,.15)",
              color:quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)",
              fontSize:12,padding:"4px 10px"
            }}>
              {quote.status==="accepted"?"✅ Accepted":quote.status==="declined"?"❌ Declined":quote.status==="converted"?"📄 Converted":"📤 "+quote.status.charAt(0).toUpperCase()+quote.status.slice(1)}
            </span>
          </div>
          {/* Customer confirm status */}
          {quote.confirm_status&&quote.confirm_status!=="pending"&&(
            <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,
              background:quote.confirm_status==="confirmed"?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)",
              border:`1px solid ${quote.confirm_status==="confirmed"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{quote.confirm_status==="confirmed"?"✅":"❌"}</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:quote.confirm_status==="confirmed"?"var(--green)":"var(--red)"}}>
                  Customer {quote.confirm_status==="confirmed"?"Approved":"Declined"} this quotation
                </div>
                {quote.confirmed_at&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{new Date(quote.confirmed_at).toLocaleString()}</div>}
                {quote.customer_note&&<div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>💬 "{quote.customer_note}"</div>}
              </div>
            </div>
          )}
          {quote.confirm_status==="pending"&&(
            <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.3)",fontSize:12,color:"var(--yellow)"}}>
              ⏳ Awaiting customer response...
            </div>
          )}
          {/* Invoice exists warning */}
          {invoice&&(
            <div style={{background:"rgba(251,191,36,.15)",border:"1px solid rgba(251,191,36,.5)",borderRadius:6,padding:"7px 12px",marginBottom:10,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
              <span>⚠️</span>
              <span>Invoice <strong>{invoice.id}</strong> already exists for this job — status: <strong>{invoice.status}</strong>.</span>
            </div>
          )}
          {/* Actions */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>printWorkshopQuote(job,items,quote,settings,vehiclePhotos)}>🖨️ Print PDF</button>
            {quote.status!=="converted"&&onSendQuoteForApproval&&(
              <button className="btn btn-sm" style={{background:"rgba(37,211,102,.12)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)"}}
                onClick={()=>setApprovalModal(true)}>
                🔗 Send for Approval
              </button>
            )}
            {(quote.quote_phone||job.customer_phone)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}} onClick={()=>{
                const phone=(quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
                const name=quote.quote_customer||job.customer_name||"";
                const C=curSym(settings.currency||"R");
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const lines=items.map(i=>`  • ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const msg=`📝 *Workshop Quotation ${quote.id}*\n──────────────────\n`+
                  `👤 ${name}\n🚗 ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n`+
                  `📅 Date: ${quote.quote_date}${quote.valid_until?`\n⏳ Valid Until: ${quote.valid_until}`:""}\n\n`+
                  `*Items:*\n${lines}\n\n💰 *Total: ${fmt(quote.total)}*\n\n`+
                  `Please confirm to proceed.\n\n${settings.shop_name||"Workshop"}${settings.phone?`\n📞 ${settings.phone}`:""}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
              }}>💬 WA</button>
            )}
            {(quote.quote_email||job.customer_email)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)"}} onClick={()=>{
                const email=quote.quote_email||job.customer_email||"";
                const name=quote.quote_customer||job.customer_name||"";
                const C=curSym(settings.currency||"R");
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const lines=items.map(i=>`  - ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const subj=`Workshop Quotation ${quote.id} — ${name}`;
                const body=`Dear ${name},\n\nPlease find your workshop quotation below.\n\n`+
                  `Quotation: ${quote.id}\nDate: ${quote.quote_date}${quote.valid_until?`\nValid Until: ${quote.valid_until}`:""}\n`+
                  `Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n\n`+
                  `Items:\n${lines}\n\nTotal: ${fmt(quote.total)}\n\nPlease confirm to proceed.\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\nPhone: ${settings.phone}`:""}`;
                window.location.href=`mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
              }}>✉️ Email</button>
            )}
            {quote.status!=="converted"&&quote.status!=="declined"&&(
              <button className={`btn btn-xs ${quote.status==="accepted"?"btn-ghost":"btn-success"}`}
                onClick={()=>onSaveQuote({...quote,status:quote.status==="accepted"?"sent":"accepted"})}>
                {quote.status==="accepted"?"↩ Unaccept":"✅ Mark Accepted"}
              </button>
            )}
            {quote.status!=="converted"&&(
              <button className="btn btn-ghost btn-xs" onClick={()=>setQuoteModal(true)}>✏️ Edit</button>
            )}
            {!invoice&&quote.status==="accepted"&&(
              <button className="btn btn-primary btn-sm" onClick={()=>{ setQuoteSrcForInv(quote); setCreatingInv(true); }}>🧾 Convert to Invoice</button>
            )}
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",marginLeft:"auto"}}
              onClick={()=>setDeletingQuote(true)}>🗑️</button>
          </div>
        </div>
      ) : !invoice&&items.length>0&&(
        <button className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:14,fontWeight:600,marginBottom:14,border:"2px dashed var(--border)"}}
          onClick={()=>setQuoteModal(true)}>
          📝 Create Quotation for Customer
        </button>
      )}

      {/* Invoice section */}
      {invoice ? (
        <div className="card" style={{padding:14,borderLeft:`3px solid ${invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)"}`}}>
          {/* Header row */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>🧾 Invoice <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{invoice.id}</code></div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{invoice.invoice_date}{invoice.due_date&&` · Due ${invoice.due_date}`}</div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(invoice.total)}</div>
              {(+invoice.paid_amount||0)>0&&(
                <div style={{fontSize:12,marginTop:2}}>
                  <span style={{color:"var(--green)"}}>Paid: {fmtAmt(invoice.paid_amount)}</span>
                  <span style={{color:"var(--text3)",marginLeft:8}}>Balance: {fmtAmt((+invoice.total||0)-(+invoice.paid_amount||0))}</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <span className="badge" style={{
                background:invoice.status==="paid"?"rgba(52,211,153,.15)":invoice.status==="partial"?"rgba(251,191,36,.15)":"rgba(248,113,113,.15)",
                color:invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)",
                fontSize:12,padding:"4px 10px"
              }}>
                {invoice.status==="paid"?"✅ Paid":invoice.status==="partial"?"💛 Partial":"⏳ Unpaid"}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStatementModal(true)}>📋 Statement</button>
            {invoice.status!=="paid"&&(
              <button className="btn btn-success btn-sm" onClick={()=>setPaymentModal(true)}>💳 Payment</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={()=>setEditingInv(true)}>✏️ Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>printWorkshopInvoice(job,items,invoice,settings,vehiclePhotos)}>🖨️ Print</button>
            {(invoice.inv_phone||job.customer_phone)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}} onClick={()=>{
                const phone=(invoice.inv_phone||job.customer_phone||"").replace(/\D/g,"");
                const name=invoice.invoice_customer||job.customer_name||"";
                const C=curSym(settings.currency||"R");
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const itemLines=items.map(i=>`  • ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const balance=(+invoice.total||0)-(+invoice.paid_amount||0);
                const msg=`🔧 *Workshop Invoice ${invoice.id}*\n──────────────────\n`+
                  `👤 ${name}\n🚗 ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n`+
                  `📅 Date: ${invoice.invoice_date}\n\n*Items:*\n${itemLines}\n\n`+
                  `💰 *Total: ${fmt(invoice.total)}*\n`+
                  ((+invoice.paid_amount||0)>0?`✅ Paid: ${fmt(invoice.paid_amount)}\n⚠️ Balance: ${fmt(balance)}\n`:"")+
                  `Status: ${invoice.status==="paid"?"✅ PAID":invoice.status==="partial"?"💛 PARTIAL":"⏳ UNPAID"}\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\n📞 ${settings.phone}`:""}`;
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
              }}>💬 WA</button>
            )}
            {(invoice.inv_email||job.customer_email)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"var(--blue)"}} onClick={()=>{
                const email=invoice.inv_email||job.customer_email||"";
                const name=invoice.invoice_customer||job.customer_name||"";
                const C=curSym(settings.currency||"R");
                const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                const itemLines=items.map(i=>`  - ${i.description} x${i.qty} = ${fmt(i.total)}`).join("\n");
                const subject=`Workshop Invoice ${invoice.id} — ${name}`;
                const body=`Dear ${name},\n\nPlease find your workshop invoice details below.\n\n`+
                  `Invoice: ${invoice.id}\nDate: ${invoice.invoice_date}\n`+
                  `Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${job.vehicle_model||""}`:""}\n\n`+
                  `Items:\n${itemLines}\n\nTotal: ${fmt(invoice.total)}\nStatus: ${invoice.status==="paid"?"PAID":"UNPAID"}\n\n`+
                  `${settings.shop_name||"Workshop"}${settings.phone?`\nPhone: ${settings.phone}`:""}${settings.email?`\nEmail: ${settings.email}`:""}`;
                window.location.href=`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              }}>✉️ Email</button>
            )}
            <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",marginLeft:"auto"}}
              onClick={()=>setDeletingInv(true)}>🗑️ Delete</button>
          </div>
        </div>
      ) : items.length>0&&(
        quote?.status==="converted"
          ? <div style={{background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.4)",borderRadius:8,padding:"12px 14px",marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>⚠️ This quote was already converted to an invoice.</div>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>If you need a new invoice, confirm below — this will create a second invoice for this job.</div>
              <button className="btn btn-ghost" style={{width:"100%",fontSize:13}}
                onClick={()=>{ if(window.confirm("⚠️ A quote was already converted to an invoice for this job.\n\nCreate another invoice anyway?")) setCreatingInv(true); }}>
                🧾 Create Another Invoice
              </button>
            </div>
          : <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,fontWeight:700}}
              onClick={()=>setCreatingInv(true)}>
              🧾 Create Workshop Invoice
            </button>
      )}

      {/* Add item modal */}
      {addingItem&&(
        <WorkshopItemModal
          type={addingItem}
          wsStock={wsStock}
          wsServices={wsServices}
          onSave={async(item)=>{ await onSaveItem({...item,job_id:job.id}); setAddingItem(null); }}
          onClose={()=>setAddingItem(null)}
          t={t}/>
      )}

      {/* Edit job modal */}
      {editJob&&(
        <WorkshopJobModal job={job} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={[]}
          onSave={async(d)=>{ await onSaveJob(d); setEditJob(false); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setEditJob(false); }}
          onClose={()=>setEditJob(false)} t={t}/>
      )}

      {/* Create invoice modal (also used for quote→invoice conversion) */}
      {creatingInv&&(
        <WorkshopInvoiceModal
          job={job} items={items} subtotal={subtotal} tax={tax} total={total}
          settings={settings}
          prefill={quoteSrcForInv ? {
            invCust:  quoteSrcForInv.quote_customer||"",
            invPhone: quoteSrcForInv.quote_phone||"",
            invEmail: quoteSrcForInv.quote_email||"",
            dueDate:  quoteSrcForInv.valid_until||"",
            notes:    `Converted from Quote ${quoteSrcForInv.id}${quoteSrcForInv.notes?"\n"+quoteSrcForInv.notes:""}`,
          } : {}}
          onSave={async(inv)=>{
            await onSaveInvoice(inv);
            if(quoteSrcForInv) await onSaveQuote({...quoteSrcForInv, status:"converted"});
            setCreatingInv(false);
            setQuoteSrcForInv(null);
          }}
          onClose={()=>{ setCreatingInv(false); setQuoteSrcForInv(null); }} t={t}/>
      )}

      {/* Edit invoice modal */}
      {editingInv&&invoice&&(
        <WsInvoiceEditModal
          invoice={invoice}
          onSave={async(data)=>{ await onUpdateInvoice(invoice.id,data); setEditingInv(false); }}
          onClose={()=>setEditingInv(false)}/>
      )}

      {/* Record payment modal */}
      {paymentModal&&invoice&&(
        <WsPaymentModal
          invoice={invoice}
          settings={settings}
          onSave={async(data)=>{ await onUpdateInvoice(invoice.id,data); setPaymentModal(false); }}
          onClose={()=>setPaymentModal(false)}/>
      )}

      {/* Statement modal */}
      {statementModal&&invoice&&(
        <WsStatementModal
          invoice={invoice} job={job} items={items} settings={settings}
          onClose={()=>setStatementModal(false)}
          onPrint={()=>printWorkshopInvoice(job,items,invoice,settings,vehiclePhotos)}/>
      )}

      {/* Create/Edit quote modal */}
      {quoteModal&&(
        <WsQuoteModal
          job={job} items={items} subtotal={subtotal} tax={tax} total={total}
          existing={quote} settings={settings}
          onSave={async(q)=>{ await onSaveQuote(q); setQuoteModal(false); }}
          onClose={()=>setQuoteModal(false)}/>
      )}

      {/* Delete quote confirm */}
      {deletingQuote&&quote&&(
        <Overlay onClose={()=>setDeletingQuote(false)}>
          <MHead title="🗑️ Delete Quotation" onClose={()=>setDeletingQuote(false)}/>
          <p style={{color:"var(--text2)",marginBottom:18}}>
            Delete quotation <code style={{fontFamily:"DM Mono,monospace"}}>{quote.id}</code>?
          </p>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeletingQuote(false)}>Cancel</button>
            <button className="btn btn-danger" style={{flex:1}} onClick={async()=>{ await onDeleteQuote(quote.id); setDeletingQuote(false); }}>Delete</button>
          </div>
        </Overlay>
      )}

      {/* Delete invoice confirm */}
      {deletingInv&&invoice&&(
        <Overlay onClose={()=>setDeletingInv(false)}>
          <MHead title="🗑️ Delete Invoice" onClose={()=>setDeletingInv(false)}/>
          <p style={{color:"var(--text2)",marginBottom:18}}>
            Delete invoice <code style={{fontFamily:"DM Mono,monospace"}}>{invoice.id}</code>?
            The job will revert to <strong>In Progress</strong>.
          </p>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setDeletingInv(false)}>Cancel</button>
            <button className="btn btn-danger" style={{flex:1}} onClick={async()=>{
              await onDeleteInvoice(invoice.id,job.id);
              setDeletingInv(false);
            }}>Delete</button>
          </div>
        </Overlay>
      )}

      {/* Send for Approval modal */}
      {approvalModal&&quote&&(
        <QuoteApprovalModal
          quote={quote} job={job} items={items} settings={settings}
          onSend={async()=>{
            const token = await onSendQuoteForApproval(quote.id);
            return `${window.location.origin}${window.location.pathname}?wsq=${token}`;
          }}
          onClose={()=>setApprovalModal(false)}/>
      )}

      {/* Collection/Delivery label modal */}
      {deliveryModal&&(
        <DeliveryLabelModal
          job={job} settings={settings}
          onClose={()=>setDeliveryModal(false)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP JOB MODAL — Create/Edit
// ═══════════════════════════════════════════════════════════════
function WorkshopJobModal({job, wsCustomers=[], wsVehicles=[], jobs=[], onSave, onReopenJob, onClose, t}) {
  const [f,setF]=useState({
    id:job.id||null,
    workshop_customer_id:job.workshop_customer_id||null,
    workshop_vehicle_id:job.workshop_vehicle_id||null,
    customer_name:job.customer_name||"",
    customer_phone:job.customer_phone||"", customer_email:job.customer_email||"",
    vehicle_reg:job.vehicle_reg||"", vehicle_make:job.vehicle_make||"",
    vehicle_model:job.vehicle_model||"", vehicle_year:job.vehicle_year||"",
    vehicle_color:job.vehicle_color||"", mileage:job.mileage||"",
    vin:job.vin||"", engine_no:job.engine_no||"",
    complaint:job.complaint||"", diagnosis:job.diagnosis||"",
    mechanic:job.mechanic||"", date_in:job.date_in||new Date().toISOString().slice(0,10),
    date_out:job.date_out||"", notes:job.notes||"", status:job.status||"Pending",
    return_reason:job.return_reason||"", parent_job_id:job.parent_job_id||null,
    photo_front:(()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_front||""; })(),
    photo_rear: (()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_rear ||""; })(),
    photo_side: (()=>{ const v=wsVehicles.find(x=>x.id===job.workshop_vehicle_id); return v?.photo_side ||""; })(),
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [tab,setTab]=useState("customer");
  const [custSearch,setCustSearch]=useState(job.customer_name||"");
  const [showCustDrop,setShowCustDrop]=useState(false);
  const [selCustomer,setSelCustomer]=useState(()=>wsCustomers.find(c=>c.id===job.workshop_customer_id)||null);
  const [selVehicle,setSelVehicle]=useState(()=>wsVehicles.find(v=>v.id===job.workshop_vehicle_id)||null);
  const [returnDialog,setReturnDialog]=useState(null); // {existingJobs,vehicle}
  const [returnReason,setReturnReason]=useState("");
  const [returnMode,setReturnMode]=useState("new");
  const [reopenJobId,setReopenJobId]=useState(null);

  const photoCount=[f.photo_front,f.photo_rear,f.photo_side].filter(Boolean).length;
  const canTakePhotos=!!(f.customer_name.trim()&&f.vehicle_reg.trim()&&f.mileage&&f.complaint.trim());
  const TABS=[{id:"customer",label:"👤 Customer"},{id:"vehicle",label:"🚗 Vehicle"},{id:"job",label:"🔧 Job"},{id:"photos",label:"📸 Photos"+(photoCount>0?" ("+photoCount+")":"")}];

  const filtCust=wsCustomers.filter(c=>{
    if(!custSearch.trim()) return true;
    const q=custSearch.toLowerCase();
    return `${c.name} ${c.phone||""} ${c.email||""}`.toLowerCase().includes(q);
  }).slice(0,8);

  const selectCustomer=(c)=>{
    setSelCustomer(c); setCustSearch(c.name); setShowCustDrop(false);
    s("customer_name",c.name); s("customer_phone",c.phone||""); s("customer_email",c.email||"");
    s("workshop_customer_id",c.id);
    // Only clear the vehicle link — keep scanned/entered vehicle data in the fields
    setSelVehicle(null);
    s("workshop_vehicle_id",null);
  };

  const selectVehicle=(v)=>{
    setSelVehicle(v);
    s("workshop_vehicle_id",v.id); s("vehicle_reg",v.reg||"");
    s("vehicle_make",v.make||""); s("vehicle_model",v.model||"");
    s("vehicle_year",v.year||""); s("vehicle_color",v.color||"");
    if(!f.id){
      const openJobs=jobs.filter(j=>j.status!=="Delivered"&&(j.workshop_vehicle_id===v.id||j.vehicle_reg===v.reg));
      if(openJobs.length>0){ setReturnDialog({existingJobs:openJobs,vehicle:v}); setReopenJobId(openJobs[0].id); }
    }
  };

  const custVehicles=selCustomer?wsVehicles.filter(v=>v.workshop_customer_id===selCustomer.id):[];
  const vehicleHistory=selVehicle?jobs.filter(j=>j.workshop_vehicle_id===selVehicle.id||j.vehicle_reg===selVehicle.reg).sort((a,b)=>new Date(b.date_in)-new Date(a.date_in)):[];

  // ── Return dialog ───────────────────────────────────────────
  if(returnDialog&&!f.id){
    return (
      <Overlay onClose={onClose} wide>
        <MHead title="🔄 Vehicle Return" onClose={onClose}/>
        <div style={{marginBottom:14,padding:12,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,marginBottom:6}}>⚠️ {returnDialog.vehicle.reg} has {returnDialog.existingJobs.length} open job(s)</div>
          {returnDialog.existingJobs.map(j=>(
            <div key={j.id} style={{fontSize:12,color:"var(--text2)",marginBottom:3}}>
              <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code> · <span style={{color:"var(--yellow)"}}>{j.status}</span> · {j.date_in}
              {j.complaint&&<span style={{marginLeft:6,color:"var(--text3)"}}>"{j.complaint.slice(0,50)}"</span>}
            </div>
          ))}
        </div>
        <div style={{marginBottom:14}}>
          <FL label="What would you like to do?"/>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            <button className={`btn ${returnMode==="new"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setReturnMode("new")}>📋 New Job Card</button>
            <button className={`btn ${returnMode==="reopen"?"btn-primary":"btn-ghost"}`} style={{flex:1}} onClick={()=>setReturnMode("reopen")}>🔄 Continue Existing</button>
          </div>
          {returnMode==="reopen"&&returnDialog.existingJobs.length>1&&(
            <div style={{marginBottom:12}}>
              <FL label="Select job to reopen"/>
              {returnDialog.existingJobs.map(j=>(
                <label key={j.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,marginBottom:6,cursor:"pointer"}}>
                  <input type="radio" name="reopenJob" checked={reopenJobId===j.id} onChange={()=>setReopenJobId(j.id)}/>
                  <span style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{j.id}</span>
                  <span style={{fontSize:12,color:"var(--text3)"}}>{j.status} · {j.date_in}</span>
                </label>
              ))}
            </div>
          )}
          <FL label="Return Reason *"/>
          <textarea className="inp" value={returnReason} onChange={e=>setReturnReason(e.target.value)}
            placeholder="e.g. Same issue recurred, customer not satisfied, part failed..." style={{minHeight:70}}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setReturnDialog(null)}>← Back</button>
          <button className="btn btn-primary" style={{flex:2}} onClick={async()=>{
            if(!returnReason.trim()){alert("Return reason is required");return;}
            if(returnMode==="new"){
              onSave({...f,return_reason:returnReason,parent_job_id:returnDialog.existingJobs[0].id});
            } else {
              const ej=returnDialog.existingJobs.find(j=>j.id===reopenJobId)||returnDialog.existingJobs[0];
              await onReopenJob({...ej,status:"In Progress",return_reason:returnReason,mileage:f.mileage||ej.mileage,date_in:f.date_in});
            }
          }}>{returnMode==="new"?"📋 Create New Job":"🔄 Reopen Job"}</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={f.id?"✏️ Edit Job Card":"🔧 New Job Card"} onClose={onClose}/>
      <div className="tabs" style={{marginBottom:18}}>
        {TABS.map(tb=>{
          const locked=tb.id==="photos"&&!canTakePhotos;
          return (
            <button key={tb.id}
              className={`tab ${tab===tb.id?"on":""}`}
              onClick={()=>locked?null:setTab(tb.id)}
              title={locked?"Fill in Customer, Vehicle plate, Mileage and Job complaint first":undefined}
              style={locked?{opacity:.35,cursor:"not-allowed",pointerEvents:"none"}:undefined}>
              {tb.label}{locked&&" 🔒"}
            </button>
          );
        })}
      </div>

      {tab==="customer"&&(
        <div>
          <FL label="Search Workshop Customer"/>
          <div style={{position:"relative",marginBottom:10}}>
            <input className="inp" value={custSearch}
              onChange={e=>{setCustSearch(e.target.value);setShowCustDrop(true);setSelCustomer(null);s("customer_name",e.target.value);s("workshop_customer_id",null);}}
              onFocus={()=>setShowCustDrop(true)} onBlur={()=>setTimeout(()=>setShowCustDrop(false),200)}
              placeholder="Type name or phone to search existing customers..."/>
            {showCustDrop&&custSearch.trim()&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,zIndex:200,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.2)"}}>
                {filtCust.length===0
                  ? <div style={{padding:12,color:"var(--text3)",fontSize:12}}>No match — fill fields below to create new</div>
                  : filtCust.map(c=>(
                      <div key={c.id} onMouseDown={()=>selectCustomer(c)}
                        style={{padding:"9px 14px",cursor:"pointer",borderBottom:"1px solid var(--border)"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
                        {c.phone&&<div style={{fontSize:11,color:"var(--text3)"}}>{c.phone}</div>}
                      </div>
                    ))
                }
              </div>
            )}
          </div>
          {selCustomer&&<div style={{padding:"6px 12px",background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.2)",borderRadius:8,marginBottom:10,fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>✅ Linked: {selCustomer.name}</span>
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{setSelCustomer(null);setSelVehicle(null);setCustSearch(""); s("workshop_customer_id",null);}}>✕</button>
          </div>}
          <FG>
            <div><FL label="Name *"/><input className="inp" value={f.customer_name} onChange={e=>s("customer_name",e.target.value)} placeholder="Full name"/></div>
            <div><FL label={t.phone}/><input className="inp" type="tel" value={f.customer_phone} onChange={e=>s("customer_phone",e.target.value)} placeholder="+27..."/></div>
          </FG>
          <FD><FL label={t.email}/><input className="inp" type="email" value={f.customer_email} onChange={e=>s("customer_email",e.target.value)}/></FD>
        </div>
      )}

      {tab==="vehicle"&&(
        <div>
          {custVehicles.length>0&&(
            <div style={{marginBottom:14}}>
              <FL label="Customer's Saved Vehicles"/>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
                {custVehicles.map(v=>(
                  <button key={v.id}
                    className={`btn btn-sm ${selVehicle?.id===v.id?"btn-primary":"btn-ghost"}`}
                    onClick={()=>selectVehicle(v)}
                    style={{fontFamily:"DM Mono,monospace",fontWeight:700}}>
                    🚗 {v.reg}<span style={{fontWeight:400,fontSize:11,marginLeft:4}}>{v.make} {v.model}</span>
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>— or enter manually below —</div>
            </div>
          )}
          {vehicleHistory.length>0&&(
            <div style={{marginBottom:14,padding:12,background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)"}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:8}}>📋 Service History — {vehicleHistory.length} job(s)</div>
              {vehicleHistory.slice(0,5).map(j=>(
                <div key={j.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                  <div>
                    <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{j.id}</code>
                    <span style={{marginLeft:6,color:"var(--text2)"}}>{j.complaint?.slice(0,40)||"—"}</span>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0,alignItems:"center"}}>
                    <span style={{color:"var(--text3)",fontSize:11}}>{j.date_in}</span>
                    <span className="badge" style={{fontSize:10}}>{j.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Mileage + Date In — critical at top */}
          <FG>
            <div>
              <FL label="🛣️ Current Mileage (km) *"/>
              <input className="inp" type="number" value={f.mileage} onChange={e=>s("mileage",e.target.value)}
                placeholder="e.g. 85000" style={{fontSize:16,fontWeight:700}}/>
            </div>
            <div><FL label={t.dateIn||"Date In"}/><input className="inp" type="date" value={f.date_in} onChange={e=>s("date_in",e.target.value)}/></div>
          </FG>
          <FG>
            <div><FL label="🚗 Plate / Reg *"/><input className="inp" value={f.vehicle_reg} onChange={e=>s("vehicle_reg",e.target.value.toUpperCase())} placeholder="GP 123-456" style={{fontFamily:"DM Mono,monospace",fontWeight:700,letterSpacing:".05em"}}/></div>
            <div><FL label={t.vehicleColor||"Color"}/><input className="inp" value={f.vehicle_color} onChange={e=>s("vehicle_color",e.target.value)} placeholder="White, Black..."/></div>
          </FG>
          <FG cols="1fr 1fr 1fr">
            <div><FL label={t.make}/><input className="inp" value={f.vehicle_make} onChange={e=>s("vehicle_make",e.target.value)} placeholder="GWM, Toyota..."/></div>
            <div><FL label={t.model}/><input className="inp" value={f.vehicle_model} onChange={e=>s("vehicle_model",e.target.value)} placeholder="P-Series..."/></div>
            <div><FL label="Year"/><input className="inp" type="number" value={f.vehicle_year} onChange={e=>s("vehicle_year",e.target.value)} placeholder="2022"/></div>
          </FG>
          <FG>
            <div><FL label="VIN"/><input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} placeholder="17-char VIN..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
            <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} placeholder="Engine number..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
          </FG>
        </div>
      )}

      {tab==="job"&&(
        <div>
          {/* Return reason — shown prominently if this is a return */}
          {f.parent_job_id&&(
            <div style={{marginBottom:14,padding:10,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10,fontSize:13}}>
              🔄 <strong>Return Job</strong> — ref: <code style={{fontFamily:"DM Mono,monospace",fontSize:11}}>{f.parent_job_id}</code>
              <div style={{marginTop:8}}><FL label="Return Reason *"/>
                <textarea className="inp" value={f.return_reason} onChange={e=>s("return_reason",e.target.value)}
                  placeholder="Why did the car come back? e.g. Same noise still present..." style={{minHeight:60}}/>
              </div>
            </div>
          )}
          {/* Main job — what needs to be done */}
          <FD><FL label="🔧 Main Job / Customer Complaint *"/>
            <textarea className="inp" value={f.complaint} onChange={e=>s("complaint",e.target.value)}
              placeholder="What does the customer want done? e.g. Engine overheating, brake noise, service due..." style={{minHeight:80,fontWeight:500}}/>
          </FD>
          <FG>
            <div><FL label={t.mechanic||"Mechanic"}/><input className="inp" value={f.mechanic} onChange={e=>s("mechanic",e.target.value)} placeholder="Assign mechanic..."/></div>
            <div><FL label="Status"/>
              <select className="inp" value={f.status} onChange={e=>s("status",e.target.value)}>
                {["Pending","In Progress","Done","Delivered"].map(st=><option key={st}>{st}</option>)}
              </select>
            </div>
          </FG>
          <FD><FL label={t.diagnosis||"Diagnosis / Work Done"}/><textarea className="inp" value={f.diagnosis} onChange={e=>s("diagnosis",e.target.value)} placeholder="Mechanic findings and work performed..." style={{minHeight:70}}/></FD>
          <FG>
            <div><FL label={t.dateOut||"Expected Date Out"}/><input className="inp" type="date" value={f.date_out} onChange={e=>s("date_out",e.target.value)}/></div>
          </FG>
          <FD><FL label={t.notes||"Notes"}/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Internal notes..." style={{minHeight:50}}/></FD>
        </div>
      )}

      {tab==="photos"&&(
        <div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
            Capture condition photos before work starts. Photos will be saved to the vehicle record after the job is saved.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <JobPhotoSlot label="Front"  value={f.photo_front} onChange={v=>s("photo_front",v)} reg={f.vehicle_reg}/>
            <JobPhotoSlot label="Side"   value={f.photo_side}  onChange={v=>s("photo_side",v)}  reg={f.vehicle_reg}/>
            <JobPhotoSlot label="Rear"   value={f.photo_rear}  onChange={v=>s("photo_rear",v)}  reg={f.vehicle_reg}/>
          </div>
          {photoCount>0&&(
            <div style={{marginTop:10,fontSize:12,color:"var(--green)"}}>
              ✅ {photoCount} photo{photoCount!==1?"s":""} captured — will upload when you save the job
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={()=>{
          if(!f.customer_name.trim()){alert("Customer name required — go to Customer tab");setTab("customer");return;}
          if(!f.vehicle_reg.trim()){alert("Vehicle plate required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.mileage){alert("Mileage required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.complaint.trim()){alert("Main job / complaint required — go to Job tab");setTab("job");return;}
          if(f.parent_job_id&&!f.return_reason.trim()){alert("Return reason required for return jobs — go to Job tab");setTab("job");return;}
          onSave(f);
        }}>💾 {t.save}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// JOB PHOTO SLOT — capture front/side/rear on job card creation
// ═══════════════════════════════════════════════════════════════
function JobPhotoSlot({label, value, onChange, reg}) {
  const camRef  = useRef(null);
  const fileRef = useRef(null);
  const [browsing,      setBrowsing]      = useState(false);
  const [drivePhotos,   setDrivePhotos]   = useState(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [error,         setError]         = useState(null);

  const plate = (reg||"").replace(/\s/g,"").toUpperCase();

  const getScriptUrl = () =>
    (window._VEHICLE_SCRIPT_URL && window._VEHICLE_SCRIPT_URL.trim()) ||
    (window._APPS_SCRIPT_URL    && window._APPS_SCRIPT_URL.trim())    || "";

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    const fr = new FileReader();
    fr.onload = ev => onChange(ev.target.result);
    fr.readAsDataURL(file);
    e.target.value = "";
  };

  const openBrowse = async () => {
    const SCRIPT_URL = getScriptUrl();
    if (!SCRIPT_URL) { setError("⚙️ Set Vehicle Script URL in Settings first"); return; }
    if (!plate) { setError("Enter vehicle reg first"); return; }
    setBrowsing(true);
    if (drivePhotos === null) {
      setBrowseLoading(true);
      try {
        const resp = await fetch(SCRIPT_URL, { method:"POST", body:JSON.stringify({action:"listPhotos", plate}) });
        const result = await resp.json();
        if (result.success) setDrivePhotos(result.photos || []);
        else throw new Error(result.error || "Could not list photos");
      } catch(e) { setError("❌ " + e.message); setBrowsing(false); }
      setBrowseLoading(false);
    }
  };

  return (
    <div>
      <div onClick={()=>fileRef.current?.click()} style={{
        border:`2px dashed ${value?"var(--green)":"var(--border)"}`,
        borderRadius:10, cursor:"pointer",
        background:value?"var(--surface)":"var(--surface2)",
        aspectRatio:"4/3", overflow:"hidden", position:"relative",
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"border-color .15s",
      }}>
        <input ref={camRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
        <input ref={fileRef} type="file" style={{display:"none"}} onChange={handleFile}/>
        {value
          ? (value.startsWith("data:")
              ? <img src={value} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <DriveImg url={value} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
          : <div style={{textAlign:"center",color:"var(--text3)",padding:8}}>
              <div style={{fontSize:22,marginBottom:4}}>🖼️</div>
              <div style={{fontSize:11,fontWeight:600,marginBottom:2}}>{label}</div>
              <div style={{fontSize:10}}>Tap to choose</div>
            </div>
        }
      </div>
      <div style={{display:"flex",gap:4,marginTop:5}}>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
          onClick={e=>{e.stopPropagation();camRef.current?.click();}}>
          <span style={{fontSize:13}}>📷</span><span>Camera</span>
        </button>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
          onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>
          <span style={{fontSize:13}}>🖼️</span><span>Files</span>
        </button>
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1,
            color:"var(--blue)",opacity:plate?1:0.4}}
          title={plate?`Browse Drive: ${plate}`:"Enter vehicle reg first"}
          onClick={e=>{e.stopPropagation();openBrowse();}}>
          <span style={{fontSize:13}}>☁️</span><span>Drive</span>
        </button>
        {value&&(
          <button className="btn btn-ghost btn-xs"
            style={{padding:"4px 6px",fontSize:10,color:"var(--red)"}}
            onClick={e=>{e.stopPropagation();onChange("");}}>✕</button>
        )}
      </div>
      {error && <div style={{fontSize:10,color:"var(--red)",marginTop:3}}>{error}</div>}

      {/* Drive photo picker */}
      {browsing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setBrowsing(false)}>
          <div style={{background:"var(--surface)",borderRadius:"12px 12px 0 0",padding:16,width:"100%",maxWidth:600,maxHeight:"75vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14}}>☁️ Drive — {plate}</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setBrowsing(false)}>✕</button>
            </div>
            {browseLoading
              ? <div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>Loading photos...</div>
              : drivePhotos && drivePhotos.length===0
                ? <div style={{textAlign:"center",padding:20,color:"var(--text3)"}}>No photos found for {plate}</div>
                : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    {(drivePhotos||[]).map(p=>(
                      <div key={p.id} style={{aspectRatio:"1",borderRadius:8,overflow:"hidden",cursor:"pointer",border:"2px solid transparent"}}
                        onClick={()=>{ onChange(p.url); setBrowsing(false); }}>
                        <DriveImg url={p.url} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                    ))}
                  </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP ITEM MODAL — Add Part or Labour (uses workshop stock)
// ═══════════════════════════════════════════════════════════════
function WorkshopItemModal({type, wsStock=[], wsServices=[], onSave, onClose, t}) {
  const [desc,      setDesc]      = useState("");
  const [qty,       setQty]       = useState(1);
  const [price,     setPrice]     = useState("");
  const [selItem,   setSelItem]   = useState(null);
  const [search,    setSearch]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const list = type==="part" ? wsStock : wsServices;

  const filtered = list.filter(p=>{
    if(!search.trim()) return true;
    const hay=`${p.name||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>hay.includes(w));
  }).slice(0,30);

  const total = (+qty||0)*(+price||0);

  const resetForm=()=>{ setDesc(""); setQty(1); setPrice(""); setSelItem(null); setSearch(""); };

  const selectItem=(p)=>{
    setSelItem(p);
    setDesc(p.name);
    setPrice(p.price||p.rate||"");
    setSearch("");
  };

  const handleSave=async()=>{
    if(!desc.trim()||!price){alert("Fill description and price");return;}
    setSaving(true);
    try{
      await onSave({
        type,
        description:desc,
        part_sku:selItem?selItem.sku||"":"",
        ws_stock_id:type==="part"&&selItem?selItem.id:null,
        qty:+qty,
        unit_price:+price,
        total:(+qty)*(+price),
      });
      resetForm();
      setJustAdded(true);
      setTimeout(()=>setJustAdded(false),2000);
    }catch(e){ alert("Save failed: "+e.message); }
    finally{ setSaving(false); }
  };

  const stockBadge=(p)=>{
    if(type!=="part") return null;
    const q=+p.qty_on_hand||0;
    const low=+p.low_stock_qty||0;
    const color=q<=0?"var(--red)":q<=low?"var(--yellow)":"var(--green)";
    return <span style={{fontSize:11,fontWeight:700,color,fontFamily:"Rajdhani,sans-serif",flexShrink:0}}>
      {q<=0?"⛔ Out":q<=low?`⚠️ ${q}`:q} {type==="part"&&p.unit?p.unit:""}
    </span>;
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={type==="part"?"🔩 Add WS Part":"👷 Add Labour"} onClose={onClose}/>

      <div style={{marginBottom:14}}>
        <FL label={type==="part"?"Search Workshop Stock":"Search Service Preset"}/>
        <div style={{marginBottom:8}}>
          <input className="inp" value={search} onChange={e=>{setSearch(e.target.value);setSelItem(null);}}
            placeholder={type==="part"?"Search part name, SKU...":"Search service name..."}/>
        </div>

        {(search||list.length<=10)&&!selItem&&(
          <div style={{border:"1px solid var(--border)",borderRadius:10,maxHeight:300,overflowY:"auto",marginBottom:8}}>
            {(search?filtered:list.slice(0,20)).length===0
              ? <div style={{padding:12,color:"var(--text3)",fontSize:13,textAlign:"center"}}>
                  {type==="part"?"No workshop stock — add items in WS Stock tab":"No services — add presets in Services tab"}
                </div>
              : (search?filtered:list.slice(0,20)).map(p=>(
                  <div key={p.id} onClick={()=>selectItem(p)}
                    style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:10,alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontSize:22,flexShrink:0}}>{type==="part"?"🔩":"🔧"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                      {p.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku}</code>}
                      {p.description&&<div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{p.description}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>{fmtAmt(p.price||p.rate||0)}</div>
                      {type==="part"&&stockBadge(p)}
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {selItem&&(
          <div style={{padding:"10px 12px",background:"rgba(96,165,250,.08)",borderRadius:8,border:"1px solid rgba(96,165,250,.2)",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <div style={{fontSize:22,flexShrink:0}}>{type==="part"?"🔩":"🔧"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600}}>{selItem.name}</div>
              {selItem.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{selItem.sku}</code>}
              {type==="part"&&stockBadge(selItem)}
            </div>
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}}
              onClick={()=>{ setSelItem(null); setDesc(""); setPrice(""); }}>✕</button>
          </div>
        )}
      </div>

      <FD><FL label="Description *"/>
        <input className="inp" value={desc} onChange={e=>setDesc(e.target.value)}
          placeholder={type==="part"?"Part name...":"Labour e.g. Oil change, brake pad replacement..."}/>
      </FD>
      <FG>
        <div><FL label="Qty"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="0.5" step="0.5"/></div>
        <div><FL label={`Unit ${type==="part"?"Price":"Rate"}`}/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></div>
        <div><FL label="Total"/><input className="inp" value={fmtAmt(total)} readOnly style={{color:"var(--accent)",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}/></div>
      </FG>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        {justAdded&&<div style={{flex:"0 0 100%",textAlign:"center",fontSize:13,color:"var(--green)",fontWeight:600,padding:"4px 0"}}>✅ Added! You can add another.</div>}
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Done</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
          {saving?"Saving...":("✅ Add "+(type==="part"?"Part":"Labour"))}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS STOCK PAGE
// ═══════════════════════════════════════════════════════════════
function WsStockPage({wsStock=[],settings,onSave,onDelete,onAdjust}) {
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"adjust", item?}

  const filtered=wsStock.filter(p=>{
    if(!search.trim()) return true;
    const h=`${p.name||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  const lowStock=wsStock.filter(p=>+p.qty_on_hand<=+p.low_stock_qty&&+p.low_stock_qty>0);

  return (
    <div>
      {lowStock.length>0&&(
        <div style={{marginBottom:12,padding:"10px 14px",background:"rgba(251,191,36,.12)",border:"1px solid rgba(251,191,36,.3)",borderRadius:10}}>
          <div style={{fontWeight:700,fontSize:13,color:"var(--yellow)",marginBottom:6}}>⚠️ Low Stock Alert ({lowStock.length} items)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {lowStock.map(p=>(
              <span key={p.id} className="badge" style={{background:"rgba(251,191,36,.15)",color:"var(--yellow)",fontSize:12}}>
                {p.name} — {+p.qty_on_hand} {p.unit||""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:200}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workshop stock..."/>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Stock Item</button>
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📦</div>
            <div style={{fontWeight:600}}>No workshop stock yet</div>
            <div style={{fontSize:13,marginTop:4}}>Add items or transfer from the spare shop</div>
          </div>
        : (
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Name</th><th>SKU</th><th style={{textAlign:"right"}}>Qty</th><th>Unit</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Price</th><th>Low Stock</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(p=>{
                  const qty=+p.qty_on_hand||0;
                  const low=+p.low_stock_qty||0;
                  const qColor=qty<=0?"var(--red)":qty<=low?"var(--yellow)":"var(--green)";
                  return (
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku||"—"}</code></td>
                      <td style={{textAlign:"right",fontWeight:700,color:qColor,fontFamily:"Rajdhani,sans-serif"}}>{qty}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{p.unit||"—"}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(p.cost_price||0)}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",fontWeight:700}}>{fmtAmt(p.price||0)}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{low>0?low:"—"}</td>
                      <td>
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"adjust",item:p})}>±</button>
                          <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:p})}>✏️</button>
                          <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete this stock item?"))onDelete(p.id);}}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {modal?.mode==="adjust"&&(
        <WsStockAdjustModal item={modal.item}
          onSave={async(d)=>{ await onAdjust(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsStockModal item={modal.item}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

function WsStockModal({item,onSave,onClose}) {
  const [name,setName]=useState(item?.name||"");
  const [sku,setSku]=useState(item?.sku||"");
  const [desc,setDesc]=useState(item?.description||"");
  const [unit,setUnit]=useState(item?.unit||"");
  const [qty,setQty]=useState(item?.qty_on_hand??0);
  const [cost,setCost]=useState(item?.cost_price||"");
  const [price,setPrice]=useState(item?.price||"");
  const [lowStock,setLowStock]=useState(item?.low_stock_qty||"");
  const [saving,setSaving]=useState(false);
  const isEdit=!!item;

  const handleSave=async()=>{
    if(!name.trim()){alert("Name is required");return;}
    setSaving(true);
    try{
      await onSave({
        ...(isEdit?{id:item.id}:{}),
        name:name.trim(),
        sku:sku.trim()||null,
        description:desc.trim()||null,
        unit:unit.trim()||null,
        qty_on_hand:+qty||0,
        cost_price:+cost||0,
        price:+price||0,
        low_stock_qty:+lowStock||0,
      });
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Stock Item":"+ New Stock Item"} onClose={onClose}/>
      <FG>
        <FD style={{gridColumn:"1/-1"}}><FL label="Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oil Filter — Toyota"/></FD>
        <FD><FL label="SKU"/><input className="inp" value={sku} onChange={e=>setSku(e.target.value)} placeholder="WS-001"/></FD>
        <FD><FL label="Unit"/><input className="inp" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="pcs / L / set"/></FD>
        <FD><FL label="Qty on Hand"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="0" step="1"/></FD>
        <FD><FL label="Low Stock Alert"/><input className="inp" type="number" value={lowStock} onChange={e=>setLowStock(e.target.value)} min="0"/></FD>
        <FD><FL label="Cost Price"/><input className="inp" type="number" value={cost} onChange={e=>setCost(e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Selling Price"/><input className="inp" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/></FD>
      </FG>
      <FD style={{marginTop:8}}><FL label="Description"/><textarea className="inp" rows={2} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional notes..."/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Save"}</button>
      </div>
    </Overlay>
  );
}

function WsStockAdjustModal({item,onSave,onClose}) {
  const [adjType,setAdjType]=useState("add");
  const [qty,setQty]=useState("");
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!qty||+qty<=0){alert("Enter a valid quantity");return;}
    setSaving(true);
    try{
      const delta=adjType==="add"?+qty:-+qty;
      await onSave({id:item.id, delta, reason:reason.trim()||adjType, new_qty:(+item.qty_on_hand||0)+delta});
    }catch(e){alert("Adjust failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={`±  Adjust: ${item.name}`} onClose={onClose}/>
      <div style={{marginBottom:12,padding:"8px 12px",background:"var(--surface2)",borderRadius:8,display:"flex",gap:16}}>
        <span style={{fontSize:13,color:"var(--text3)"}}>Current stock:</span>
        <span style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:16,color:"var(--accent)"}}>{+item.qty_on_hand||0} {item.unit||""}</span>
      </div>
      <FD><FL label="Adjustment Type"/>
        <div style={{display:"flex",gap:8}}>
          {[["add","➕ Add Stock"],["remove","➖ Remove"]].map(([v,l])=>(
            <button key={v} className={"btn btn-sm "+(adjType===v?"btn-primary":"btn-ghost")} style={{flex:1}} onClick={()=>setAdjType(v)}>{l}</button>
          ))}
        </div>
      </FD>
      <FG>
        <FD><FL label="Quantity"/><input className="inp" type="number" value={qty} onChange={e=>setQty(e.target.value)} min="1" step="1" placeholder="0"/></FD>
        <FD><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Manual count, damaged, etc."/></FD>
      </FG>
      {qty&&+qty>0&&(
        <div style={{marginTop:8,padding:"8px 12px",background:adjType==="add"?"rgba(52,211,153,.1)":"rgba(248,113,113,.1)",borderRadius:8,textAlign:"center",fontSize:13,fontWeight:600,color:adjType==="add"?"var(--green)":"var(--red)"}}>
          New stock: {(+item.qty_on_hand||0)+(adjType==="add"?+qty:-+qty)} {item.unit||""}
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Apply Adjustment"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS SERVICES PAGE
// ═══════════════════════════════════════════════════════════════
function WsServicesPage({wsServices=[],settings,onSave,onDelete}) {
  const [modal,setModal]=useState(null);
  const [search,setSearch]=useState("");

  const filtered=wsServices.filter(s=>{
    if(!search.trim()) return true;
    const h=`${s.name||""} ${s.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  });

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:200}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services..."/>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ Add Service</button>
      </div>

      {filtered.length===0
        ? <div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🔧</div>
            <div style={{fontWeight:600}}>No service presets yet</div>
            <div style={{fontSize:13,marginTop:4}}>Add standard labour services with preset rates</div>
          </div>
        : (
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Service Name</th><th>Description</th><th style={{textAlign:"right"}}>Rate</th><th>Unit</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(s=>(
                  <tr key={s.id}>
                    <td style={{fontWeight:600}}>{s.name}</td>
                    <td style={{fontSize:12,color:"var(--text3)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.description||"—"}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(s.rate||0)}</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{s.unit||"job"}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:s})}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete service preset?"))onDelete(s.id);}}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsServiceModal item={modal.item}
          onSave={async(d)=>{ await onSave(d); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

function WsServiceModal({item,onSave,onClose}) {
  const [name,setName]=useState(item?.name||"");
  const [desc,setDesc]=useState(item?.description||"");
  const [rate,setRate]=useState(item?.rate||"");
  const [unit,setUnit]=useState(item?.unit||"job");
  const [saving,setSaving]=useState(false);
  const isEdit=!!item;

  const handleSave=async()=>{
    if(!name.trim()){alert("Name is required");return;}
    setSaving(true);
    try{
      await onSave({
        ...(isEdit?{id:item.id}:{}),
        name:name.trim(),
        description:desc.trim()||null,
        rate:+rate||0,
        unit:unit.trim()||"job",
      });
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Service":"+ New Service Preset"} onClose={onClose}/>
      <FD><FL label="Service Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oil Change, Brake Pad Replacement"/></FD>
      <FD><FL label="Description"/><textarea className="inp" rows={2} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional details..."/></FD>
      <FG>
        <FD><FL label="Default Rate"/><input className="inp" type="number" value={rate} onChange={e=>setRate(e.target.value)} placeholder="0.00"/></FD>
        <FD><FL label="Unit"/><input className="inp" value={unit} onChange={e=>setUnit(e.target.value)} placeholder="job / hr / set"/></FD>
      </FG>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Save"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WS TRANSFER PAGE — Transfer from spare shop → workshop stock
// ═══════════════════════════════════════════════════════════════
function WsTransferPage({parts=[],wsStock=[],settings,onSave}) {
  const [items,setItems]=useState([]); // [{part_id,ws_stock_id,name,sku,qty,cost_price}]
  const [notes,setNotes]=useState("");
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);

  const C=curSym(settings?.currency||"TWD NT$");
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const filteredParts=parts.filter(p=>{
    if(!search.trim()) return true;
    const h=`${p.name||""} ${p.sku||""} ${p.chinese_desc||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w));
  }).slice(0,20);

  const addPart=(p)=>{
    if(items.find(i=>i.part_id===p.id)) return;
    const wsMatch=wsStock.find(w=>w.sku&&w.sku===p.sku);
    setItems(prev=>[...prev,{part_id:p.id,ws_stock_id:wsMatch?.id||null,name:p.name,sku:p.sku||"",qty:1,cost_price:p.price||0,shop_qty:+p.qty||0}]);
    setSearch("");
  };

  const updateItem=(idx,field,val)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,[field]:val}:it));
  const removeItem=(idx)=>setItems(prev=>prev.filter((_,i)=>i!==idx));

  const totalCost=items.reduce((s,i)=>s+(+i.qty||0)*(+i.cost_price||0),0);

  const handleSave=async()=>{
    if(items.length===0){alert("Add at least one item to transfer");return;}
    const overQty=items.filter(i=>(+i.qty||0)>i.shop_qty);
    if(overQty.length>0){
      if(!window.confirm(`Some items exceed current shop stock:\n${overQty.map(i=>`${i.name}: transfer ${i.qty}, shop has ${i.shop_qty}`).join("\n")}\n\nContinue?`)) return;
    }
    setSaving(true);
    try{
      await onSave({items,notes:notes.trim()});
      setItems([]);
      setNotes("");
      setDone(true);
      setTimeout(()=>setDone(false),3000);
    }catch(e){alert("Transfer failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <div>
      <div className="card" style={{padding:14,marginBottom:14,borderLeft:"3px solid var(--blue)"}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔄 Transfer Spare Parts → Workshop Stock</div>
        <div style={{fontSize:13,color:"var(--text3)"}}>Move parts from the main spare shop inventory into the workshop stock system. Shop stock will be deducted.</div>
      </div>

      {done&&<div style={{marginBottom:12,padding:"10px 14px",background:"rgba(52,211,153,.15)",border:"1px solid rgba(52,211,153,.3)",borderRadius:10,fontWeight:600,color:"var(--green)"}}>✅ Transfer completed successfully!</div>}

      <div style={{marginBottom:14}}>
        <FL label="Search Spare Shop Parts"/>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, SKU..."/>
        {search&&filteredParts.length>0&&(
          <div style={{border:"1px solid var(--border)",borderRadius:10,maxHeight:260,overflowY:"auto",marginTop:4}}>
            {filteredParts.map(p=>(
              <div key={p.id} onClick={()=>addPart(p)}
                style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:10,alignItems:"center"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                  {p.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku}</code>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:12,color:"var(--text3)"}}>Stock: {+p.qty||0}</div>
                  <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>{fmtAmt(p.price||0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📋 Transfer Items ({items.length})</div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{width:"100%"}}>
              <thead><tr><th>Part</th><th>SKU</th><th>Shop Stock</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Cost</th><th style={{textAlign:"right"}}>Subtotal</th><th></th></tr></thead>
              <tbody>
                {items.map((it,idx)=>{
                  const over=(+it.qty||0)>it.shop_qty;
                  return (
                    <tr key={idx} style={over?{background:"rgba(248,113,113,.06)"}:{}}>
                      <td style={{fontWeight:600,fontSize:13}}>{it.name}{over&&<span style={{color:"var(--red)",fontSize:11,marginLeft:6}}>⚠️ Over stock</span>}</td>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{it.sku||"—"}</code></td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{it.shop_qty}</td>
                      <td style={{textAlign:"right"}}>
                        <input className="inp" type="number" value={it.qty} min="1" step="1"
                          style={{width:70,textAlign:"right"}}
                          onChange={e=>updateItem(idx,"qty",e.target.value)}/>
                      </td>
                      <td style={{textAlign:"right"}}>
                        <input className="inp" type="number" value={it.cost_price} min="0" step="0.01"
                          style={{width:90,textAlign:"right"}}
                          onChange={e=>updateItem(idx,"cost_price",e.target.value)}/>
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{fmt((+it.qty||0)*(+it.cost_price||0))}</td>
                      <td><button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>removeItem(idx)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{textAlign:"right",fontWeight:700,fontSize:13,padding:"10px 12px"}}>Total Transfer Value:</td>
                  <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",fontSize:15,padding:"10px 12px"}}>{fmt(totalCost)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <FD><FL label="Transfer Notes"/><textarea className="inp" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Reason for transfer, job reference, etc."/></FD>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{setItems([]);setNotes("");}}>🗑 Clear</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving||items.length===0}>
          {saving?"Processing...":"🔄 Execute Transfer"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRINT LABEL FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function printStockLabel(p, settings, labelType="shop") {
  const sym = curSym(settings?.currency||"R");
  const shopName = settings?.shop_name||"AutoParts";
  const isWs = labelType==="ws";
  const w = window.open("","_blank","width=380,height=300");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Label</title>
  <style>
    @page{size:58mm 40mm;margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:58mm;height:40mm;padding:2mm 3mm;display:flex;flex-direction:column;justify-content:space-between;border:0.5pt solid #ccc}
    .hdr{font-size:6pt;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:${isWs?"#e65100":"#1565c0"};border-bottom:0.5pt solid ${isWs?"#e65100":"#1565c0"};padding-bottom:0.5mm;margin-bottom:1mm}
    .name{font-size:8.5pt;font-weight:bold;line-height:1.2;overflow:hidden;max-height:12mm}
    .sku{font-family:"Courier New",monospace;font-size:7pt;color:#444;margin-top:0.5mm;letter-spacing:.04em}
    .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto}
    .price{font-size:12pt;font-weight:bold}
    .info{text-align:right;font-size:6.5pt;color:#555}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">${isWs?"🔧 WORKSHOP":"📦 SPARE SHOP"} · ${shopName}</div>
    <div class="name">${(p.name||"").replace(/</g,"&lt;")}</div>
    <div class="sku">SKU: ${p.sku||"—"}${p.oe_number?" | OE: "+p.oe_number:""}</div>
    <div class="footer">
      <div>
        <div class="price">${sym} ${(+(p.price)||0).toFixed(2)}</div>
        ${p.bin_location?`<div style="font-size:6pt;color:#888;margin-top:0.5mm">📍 ${p.bin_location}</div>`:""}
      </div>
      <div class="info">
        Qty: ${isWs?(+p.qty_on_hand||0):(+p.stock||0)}${p.unit?" "+p.unit:""}
      </div>
    </div>
  </div>
  </body></html>`);
  w.document.close();
}

function printJobCardLabel(job, settings) {
  const shopName = settings?.shop_name||"AutoParts";
  const w = window.open("","_blank","width=480,height=360");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Job Card Label</title>
  <style>
    @page{size:90mm 55mm;margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:90mm;height:55mm;padding:3mm 4mm;display:flex;flex-direction:column;border:2pt solid #000}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1pt solid #000;padding-bottom:1.5mm;margin-bottom:1.5mm}
    .job-id{font-family:"Courier New",monospace;font-size:13pt;font-weight:bold}
    .shop{font-size:5.5pt;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-top:1mm}
    .reg{font-size:15pt;font-weight:bold;font-family:"Courier New",monospace;border:1pt solid #000;padding:0.5mm 2mm;text-align:center;margin-bottom:1.5mm;align-self:flex-start}
    .row{font-size:7pt;margin-bottom:0.8mm;display:flex;gap:2mm}
    .lbl{color:#666;width:14mm;flex-shrink:0}
    .val{font-weight:bold;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .complaint{font-size:6.5pt;color:#333;margin-top:1mm;border-top:0.5pt dashed #bbb;padding-top:1mm;overflow:hidden;max-height:7mm}
    .meta{font-size:5.5pt;color:#888;margin-top:auto;display:flex;justify-content:space-between}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">
      <div>
        <div class="job-id">${job.id||""}</div>
        <div class="shop">🔧 ${shopName}</div>
      </div>
      <div style="text-align:right;font-size:6pt;color:#555">
        ${job.date_in||""}<br/>
        <strong>${job.status||""}</strong>
      </div>
    </div>
    <div class="reg">🚗 ${job.vehicle_reg||"—"}</div>
    <div class="row"><span class="lbl">Customer:</span><span class="val">${(job.customer_name||"—").replace(/</g,"&lt;")}</span></div>
    <div class="row"><span class="lbl">Phone:</span><span class="val">${job.customer_phone||"—"}</span></div>
    ${job.vehicle_make?`<div class="row"><span class="lbl">Vehicle:</span><span class="val">${job.vehicle_make||""} ${job.vehicle_model||""} ${job.vehicle_year||""}</span></div>`:""}
    ${job.complaint?`<div class="complaint">Complaint: ${(job.complaint||"").slice(0,120).replace(/</g,"&lt;")}${(job.complaint||"").length>120?"...":""}</div>`:""}
    ${job.mechanic?`<div class="meta"><span>Mechanic: ${job.mechanic}</span><span>${shopName}</span></div>`:`<div class="meta"><span></span><span>${shopName}</span></div>`}
  </div>
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════
// QUOTE APPROVAL MODAL — send confirmation link via WA/email
// ═══════════════════════════════════════════════════════════════
function QuoteApprovalModal({quote, job, items, settings, onSend, onClose}) {
  const [link, setLink] = useState(quote.confirm_token
    ? `${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}`
    : null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async() => {
    setSending(true);
    try {
      const url = await onSend();
      setLink(url);
    } catch(e) { alert("Failed: "+e.message); }
    finally { setSending(false); }
  };

  const copyLink = () => {
    if(!link) return;
    navigator.clipboard.writeText(link).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const sym = curSym(settings?.currency||"R");
  const fmt = v => `${sym} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const sendWA = () => {
    if(!link) return;
    const phone = (quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
    const name = quote.quote_customer||job.customer_name||"Customer";
    const msg = `📝 *Workshop Quotation ${quote.id}*\n\nHi ${name},\n\nYour quotation is ready for review.\n\n`+
      `🚗 Vehicle: ${job.vehicle_reg||""}${job.vehicle_make?" — "+job.vehicle_make+" "+(job.vehicle_model||""):""}\n`+
      `💰 Total: *${fmt(quote.total)}*\n\n`+
      `Please click the link below to view details and approve or decline:\n${link}\n\n`+
      `${settings?.shop_name||"Workshop"}${settings?.phone?"\n📞 "+settings.phone:""}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank");
  };

  const sendEmail = () => {
    if(!link) return;
    const email = quote.quote_email||job.customer_email||"";
    const name = quote.quote_customer||job.customer_name||"Customer";
    const subj = `Workshop Quotation ${quote.id} — Please Approve`;
    const body = `Dear ${name},\n\nYour workshop quotation is ready for review.\n\n`+
      `Quotation: ${quote.id}\nVehicle: ${job.vehicle_reg||""}${job.vehicle_make?" — "+job.vehicle_make+" "+(job.vehicle_model||""):""}\nTotal: ${fmt(quote.total)}\n\n`+
      `Click the link below to view all items and approve or decline:\n${link}\n\n`+
      `${settings?.shop_name||"Workshop"}${settings?.phone?"\nPhone: "+settings.phone:""}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="🔗 Send Quotation for Approval" onClose={onClose}/>
      <div style={{marginBottom:14,padding:"10px 14px",background:"var(--surface2)",borderRadius:8,fontSize:13}}>
        <div style={{fontWeight:600,marginBottom:4}}>How it works:</div>
        <div style={{color:"var(--text2)",lineHeight:1.7}}>
          1. Click <strong>Generate Link</strong> to create a unique approval page<br/>
          2. Send it via WhatsApp or Email — customer clicks the link<br/>
          3. Customer views the quote and clicks <strong>Approve</strong> or <strong>Decline</strong><br/>
          4. You'll see the response on this job card automatically
        </div>
      </div>

      {!link ? (
        <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:14}} onClick={generateLink} disabled={sending}>
          {sending?"Generating...":"🔗 Generate Approval Link"}
        </button>
      ) : (
        <>
          <div style={{marginBottom:14}}>
            <FL label="Customer Approval Link"/>
            <div style={{display:"flex",gap:6}}>
              <input className="inp" value={link} readOnly style={{flex:1,fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--blue)"}}/>
              <button className="btn btn-ghost btn-sm" style={{flexShrink:0,color:copied?"var(--green)":"var(--text)"}} onClick={copyLink}>
                {copied?"✅ Copied!":"📋 Copy"}
              </button>
            </div>
          </div>

          <div style={{marginBottom:8,fontWeight:600,fontSize:13,color:"var(--text2)"}}>Send via:</div>
          <div style={{display:"flex",gap:10,marginBottom:14}}>
            {(quote.quote_phone||job.customer_phone)&&(
              <button className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.12)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)",padding:12,fontWeight:600}}
                onClick={sendWA}>
                💬 WhatsApp
              </button>
            )}
            {(quote.quote_email||job.customer_email)&&(
              <button className="btn btn-sm" style={{flex:1,background:"rgba(96,165,250,.1)",color:"var(--blue)",border:"1px solid rgba(96,165,250,.3)",padding:12,fontWeight:600}}
                onClick={sendEmail}>
                ✉️ Email
              </button>
            )}
            {!(quote.quote_phone||job.customer_phone)&&!(quote.quote_email||job.customer_email)&&(
              <div style={{fontSize:13,color:"var(--text3)",padding:"10px 0"}}>No phone/email on file — copy the link and send manually.</div>
            )}
          </div>

          {(quote.confirm_status==="confirmed"||quote.confirm_status==="declined")&&(
            <div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,
              background:quote.confirm_status==="confirmed"?"rgba(52,211,153,.1)":"rgba(248,113,113,.1)",
              border:`1px solid ${quote.confirm_status==="confirmed"?"rgba(52,211,153,.3)":"rgba(248,113,113,.3)"}`,
              fontWeight:600,color:quote.confirm_status==="confirmed"?"var(--green)":"var(--red)"}}>
              {quote.confirm_status==="confirmed"?"✅ Customer has already approved this quotation":"❌ Customer has declined this quotation"}
            </div>
          )}
        </>
      )}

      <button className="btn btn-ghost" style={{width:"100%",marginTop:8}} onClick={onClose}>Close</button>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// DELIVERY LABEL MODAL — Collection / Driver / Uber
// ═══════════════════════════════════════════════════════════════
function DeliveryLabelModal({job, settings, onClose}) {
  const [method, setMethod] = useState("collection");
  const [address, setAddress] = useState(job.customer_address||"");
  const [timeSlot, setTimeSlot] = useState("");
  const [notes, setNotes] = useState("");
  const shopName = settings?.shop_name||"AutoParts";
  const sym = curSym(settings?.currency||"R");

  const METHODS = [
    {id:"collection", icon:"🚶", label:"Self Collection", color:"#1565c0"},
    {id:"driver",     icon:"🚗", label:"Driver Delivery", color:"#e65100"},
    {id:"uber",       icon:"🛵", label:"Uber Delivery",   color:"#000"},
  ];

  const doPrint = () => {
    const m = METHODS.find(x=>x.id===method)||METHODS[0];
    const w = window.open("","_blank","width=480,height=400");
    if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Delivery Label</title>
    <style>
      @page{size:100mm 65mm;margin:0}
      @media print{body{margin:0}}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
      .label{width:100mm;height:65mm;padding:3mm 4mm;display:flex;flex-direction:column;border:2pt solid #000}
      .banner{font-size:9pt;font-weight:bold;color:#fff;background:${m.color};text-align:center;padding:1.5mm;margin-bottom:2mm;border-radius:1mm;letter-spacing:.04em}
      .customer{font-size:13pt;font-weight:bold;margin-bottom:1.5mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .phone{font-size:10pt;font-weight:bold;font-family:"Courier New",monospace;margin-bottom:1.5mm}
      .reg{font-family:"Courier New",monospace;font-size:10pt;border:1pt solid #000;display:inline-block;padding:0.5mm 2mm;margin-bottom:1.5mm}
      .info{font-size:7.5pt;color:#333;margin-bottom:0.8mm}
      .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;font-size:6pt;color:#888}
    </style></head>
    <body onload="window.print();window.close()">
    <div class="label">
      <div class="banner">${m.icon} ${m.label.toUpperCase()}</div>
      <div class="customer">👤 ${(job.customer_name||"—").replace(/</g,"&lt;")}</div>
      <div class="phone">📞 ${job.customer_phone||"—"}</div>
      <div>
        <span class="reg">🚗 ${job.vehicle_reg||"—"}</span>
        <span style="font-size:7.5pt;margin-left:3mm;color:#555">${job.vehicle_make||""} ${job.vehicle_model||""}</span>
      </div>
      ${address?`<div class="info" style="margin-top:1.5mm">📍 ${address.replace(/</g,"&lt;")}</div>`:""}
      ${timeSlot?`<div class="info">🕐 ${timeSlot.replace(/</g,"&lt;")}</div>`:""}
      ${notes?`<div class="info">📝 ${notes.replace(/</g,"&lt;")}</div>`:""}
      <div class="footer">
        <span>Job: ${job.id||""} · ${job.date_in||""}</span>
        <span>🔧 ${shopName}</span>
      </div>
    </div>
    </body></html>`);
    w.document.close();
    onClose();
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="🚗 Collection / Delivery Label" onClose={onClose}/>

      <div style={{marginBottom:14}}>
        <FL label="Method"/>
        <div style={{display:"flex",gap:8}}>
          {METHODS.map(m=>(
            <button key={m.id} onClick={()=>setMethod(m.id)}
              className={"btn btn-sm "+(method===m.id?"btn-primary":"btn-ghost")}
              style={{flex:1,padding:10}}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:8,marginBottom:14,fontSize:13}}>
        <div style={{fontWeight:600,marginBottom:4}}>Customer:</div>
        <div>{job.customer_name||"—"} · {job.customer_phone||"—"}</div>
        <div style={{marginTop:4}}>Vehicle: <strong>{job.vehicle_reg}</strong> {job.vehicle_make} {job.vehicle_model}</div>
      </div>

      {method!=="collection"&&(
        <FD><FL label="Delivery Address"/>
          <textarea className="inp" rows={2} value={address} onChange={e=>setAddress(e.target.value)}
            placeholder="Street, suburb, city..."/>
        </FD>
      )}
      <FG>
        <FD><FL label="Time Slot (optional)"/>
          <input className="inp" value={timeSlot} onChange={e=>setTimeSlot(e.target.value)} placeholder="e.g. 14:00 – 16:00"/>
        </FD>
        <FD><FL label="Notes (optional)"/>
          <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Gate code, driver name..."/>
        </FD>
      </FG>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={doPrint}>🖨️ Print Label</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE PRINT
// ═══════════════════════════════════════════════════════════════
function printWorkshopInvoice(job, items, invoice, settings, photos={}) {
  const C = curSym(settings.currency||"TWD NT$");
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+taxAmt;
  const parts    = items.filter(i=>i.type==="part");
  const labour   = items.filter(i=>i.type==="labour");
  const shopName = settings.shop_name||"Auto Workshop";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${p.url}" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";
  const invId    = invoice?.id||"—";
  const invDate  = invoice?.invoice_date||new Date().toISOString().slice(0,10);
  const status   = invoice?.status||"unpaid";

  const rowsHtml = items.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${i.part_sku}</span>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Workshop Invoice ${invId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #111;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .status{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#111;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#f97316;border-top:2px solid #111;margin-top:4px}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  @media print{body{padding:18px}}
</style></head><body>

  <div class="header">
    <div>
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">WORKSHOP INVOICE</div>
      <div class="inv-no">${invId}</div>
      <div class="inv-meta">
        Date: ${invDate}<br/>
        ${invoice?.due_date?`Due: ${invoice.due_date}<br/>`:""}
        <span class="status" style="background:${status==="paid"?"#d1e7dd":"#fff3cd"};color:${status==="paid"?"#0a3622":"#856404"}">${status==="paid"?"✅ PAID":"⏳ UNPAID"}</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${invoice?.invoice_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(invoice?.inv_phone||job.customer_phone)?`📞 ${invoice?.inv_phone||job.customer_phone}<br/>`:""}
          ${(invoice?.inv_email||job.customer_email)?`✉️ ${invoice?.inv_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,job.vehicle_model,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km<br/>`:""}
          ${job.vin?`VIN: ${job.vin}`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-label">🔧 Job Info</div>
      <div class="card-info">
        ${job.mechanic?`Mechanic: <strong>${job.mechanic}</strong><br/>`:""}
        ${job.date_in?`Date In: ${job.date_in}<br/>`:""}
        ${job.date_out?`Date Out: ${job.date_out}`:""}
      </div>
    </div>
    <div class="card">
      <div class="card-label">💬 Complaint / Diagnosis</div>
      <div class="card-info">
        ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
        ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:right;width:60px">Qty</th>
      <th style="text-align:right;width:120px">Unit Price</th>
      <th style="text-align:right;width:120px">Total</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${invoice?.notes?`<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>`:""}

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for your business!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP QUOTE — PRINT PDF
// ═══════════════════════════════════════════════════════════════
function printWorkshopQuote(job, items, quote, settings, photos={}) {
  const C = curSym(settings.currency||"R");
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+taxAmt;
  const shopName = settings.shop_name||"Auto Workshop";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${p.url}" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";

  const rowsHtml = items.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${i.part_sku}</span>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Quotation ${quote.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #2563eb;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700;color:#2563eb}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .watermark{display:inline-block;padding:3px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#2563eb;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#2563eb;border-top:2px solid #2563eb;margin-top:4px}
  .notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px;color:#1e40af}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  .sig-box{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sig-line{border-top:1px solid #aaa;padding-top:6px;font-size:11px;color:#888;text-align:center}
  @media print{body{padding:18px}}
</style></head><body>

  <div class="header">
    <div>
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">QUOTATION / ESTIMATE</div>
      <div class="inv-no">${quote.id}</div>
      <div class="inv-meta">
        Date: ${quote.quote_date}<br/>
        ${quote.valid_until?`Valid Until: ${quote.valid_until}<br/>`:""}
        <span class="watermark">⏳ AWAITING CONFIRMATION</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${quote.quote_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(quote.quote_phone||job.customer_phone)?`📞 ${quote.quote_phone||job.customer_phone}<br/>`:""}
          ${(quote.quote_email||job.customer_email)?`✉️ ${quote.quote_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,job.vehicle_model,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  ${job.complaint||job.diagnosis?`
  <div class="card" style="margin-bottom:20px">
    <div class="card-label">💬 Complaint / Diagnosis</div>
    <div class="card-info">
      ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
      ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
    </div>
  </div>`:""}

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:right;width:60px">Qty</th>
      <th style="text-align:right;width:120px">Unit Price</th>
      <th style="text-align:right;width:120px">Amount</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>QUOTED TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${quote.notes?`<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>`:""}

  <div class="notice">
    ℹ️ This is a <strong>quotation only</strong> — not a tax invoice. Prices are valid${quote.valid_until?` until <strong>${quote.valid_until}</strong>`:" as indicated"}.
    Work will commence upon written or verbal acceptance.
  </div>

  <div class="sig-box">
    <div class="sig-line">Customer Signature &amp; Date</div>
    <div class="sig-line">Authorised by &amp; Date</div>
  </div>

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for considering us!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP QUOTE — CREATE/EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function WsQuoteModal({job,items,subtotal,tax,total,existing,settings,onSave,onClose}) {
  const C=curSym(settings.currency||"R");
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [f,setF]=useState({
    id:existing?.id||null,
    job_id:job.id,
    quote_customer:existing?.quote_customer||job.customer_name||"",
    quote_phone:existing?.quote_phone||job.customer_phone||"",
    quote_email:existing?.quote_email||job.customer_email||"",
    quote_date:existing?.quote_date||new Date().toISOString().slice(0,10),
    valid_until:existing?.valid_until||"",
    notes:existing?.notes||"",
    subtotal,tax,total,
    status:existing?.status||"draft",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={existing?"✏️ Edit Quotation":"📝 Create Quotation"} onClose={onClose}/>

      {/* Customer */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>
          👤 Quote For
        </div>
        <FG>
          <div><FL label="Customer Name"/><input className="inp" value={f.quote_customer} onChange={e=>s("quote_customer",e.target.value)}/></div>
          <div><FL label="Phone"/><input className="inp" value={f.quote_phone} onChange={e=>s("quote_phone",e.target.value)}/></div>
        </FG>
        <FD><FL label="Email"/><input className="inp" value={f.quote_email} onChange={e=>s("quote_email",e.target.value)}/></FD>
      </div>

      {/* Items summary */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>🔧 {job.vehicle_reg} · {items.length} item{items.length!==1?"s":""}</div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:10}}>{i.type==="part"?"🔩":"👷"}</span></td>
                <td>{i.description}</td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right"}}>{fmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700}}>{fmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmt(total)}</div>
        </div>
      </div>

      <FG>
        <div><FL label="Quote Date"/><input className="inp" type="date" value={f.quote_date} onChange={e=>s("quote_date",e.target.value)}/></div>
        <div><FL label="Valid Until"/><input className="inp" type="date" value={f.valid_until} onChange={e=>s("valid_until",e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes / Terms"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Payment terms, warranty, conditions..." style={{minHeight:60}}/></FD>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" style={{flex:1}} disabled={saving||items.length===0} onClick={async()=>{
          setSaving(true);
          try{ await onSave({...f}); printWorkshopQuote(job,items,{...f},settings); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>💾 Save &amp; Print</button>
        <button className="btn btn-primary" style={{flex:1}} disabled={saving||items.length===0} onClick={async()=>{
          setSaving(true);
          try{ await onSave({...f}); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>{saving?"Saving...":(existing?"💾 Save":"📝 Create Quote")}</button>
      </div>
      {items.length===0&&<p style={{color:"var(--red)",fontSize:12,marginTop:8,textAlign:"center"}}>Add parts or labour items before creating a quote.</p>}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — EDIT MODAL
// ═══════════════════════════════════════════════════════════════
function WsInvoiceEditModal({invoice,onSave,onClose}) {
  const [f,setF]=useState({
    invoice_customer:invoice.invoice_customer||"",
    inv_phone:invoice.inv_phone||"",
    inv_email:invoice.inv_email||"",
    invoice_date:invoice.invoice_date||"",
    due_date:invoice.due_date||"",
    notes:invoice.notes||"",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="✏️ Edit Invoice" onClose={onClose}/>
      <FG>
        <div><FL label="Customer Name"/><input className="inp" value={f.invoice_customer} onChange={e=>s("invoice_customer",e.target.value)}/></div>
        <div><FL label="Phone"/><input className="inp" value={f.inv_phone} onChange={e=>s("inv_phone",e.target.value)}/></div>
      </FG>
      <FD><FL label="Email"/><input className="inp" value={f.inv_email} onChange={e=>s("inv_email",e.target.value)}/></FD>
      <FG>
        <div><FL label="Invoice Date"/><input className="inp" type="date" value={f.invoice_date} onChange={e=>s("invoice_date",e.target.value)}/></div>
        <div><FL label="Due Date"/><input className="inp" type="date" value={f.due_date} onChange={e=>s("due_date",e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} style={{minHeight:60}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={async()=>{
          setSaving(true);
          try{ await onSave(f); }catch(e){ alert(e.message); }
          finally{ setSaving(false); }
        }}>{saving?"Saving...":"💾 Save Changes"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════
function WsPaymentModal({invoice,settings,onSave,onClose}) {
  const balance=(+invoice.total||0)-(+invoice.paid_amount||0);
  const [amount,setAmount]=useState(balance.toFixed(2));
  const [method,setMethod]=useState("Cash");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [ref,setRef]=useState("");
  const [saving,setSaving]=useState(false);
  const C=curSym(settings.currency||"R");

  const handleSave=async()=>{
    const paid=parseFloat(amount)||0;
    if(paid<=0){alert("Enter a valid amount");return;}
    const newPaid=Math.min((+invoice.paid_amount||0)+paid,+invoice.total||0);
    const newStatus=newPaid>=(+invoice.total||0)?"paid":newPaid>0?"partial":"unpaid";
    setSaving(true);
    try{
      await onSave({
        paid_amount:newPaid,
        payment_method:method,
        payment_date:date,
        payment_ref:ref,
        status:newStatus,
      });
    }catch(e){ alert(e.message); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="💳 Record Payment" onClose={onClose}/>
      <div className="card" style={{padding:12,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
          <span style={{color:"var(--text3)"}}>Invoice Total</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{C} {(+invoice.total||0).toFixed(2)}</strong>
        </div>
        {(+invoice.paid_amount||0)>0&&(
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:4}}>
            <span style={{color:"var(--text3)"}}>Already Paid</span>
            <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{C} {(+invoice.paid_amount||0).toFixed(2)}</strong>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginTop:6,paddingTop:6,borderTop:"1px solid var(--border)"}}>
          <span style={{fontWeight:700}}>Balance Due</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",fontSize:16}}>{C} {balance.toFixed(2)}</strong>
        </div>
      </div>
      <FG>
        <div>
          <FL label={`Amount Received (${C})`}/>
          <input className="inp" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
        </div>
        <div>
          <FL label="Payment Method"/>
          <select className="inp" value={method} onChange={e=>setMethod(e.target.value)}>
            {["Cash","Card","EFT / Bank Transfer","Cheque","Other"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
      </FG>
      <FG>
        <div><FL label="Payment Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><FL label="Reference / Receipt No"/><input className="inp" value={ref} onChange={e=>setRef(e.target.value)} placeholder="Optional"/></div>
      </FG>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-success" style={{flex:2}} disabled={saving} onClick={handleSave}>
          {saving?"Saving...":"💳 Confirm Payment"}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP INVOICE — STATEMENT MODAL
// ═══════════════════════════════════════════════════════════════
function WsStatementModal({invoice,job,items,settings,onClose,onPrint}) {
  const C=curSym(settings.currency||"R");
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const paid=+invoice.paid_amount||0;
  const balance=(+invoice.total||0)-paid;
  const statusColor=invoice.status==="paid"?"var(--green)":invoice.status==="partial"?"var(--yellow)":"var(--red)";
  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📋 Invoice Statement" onClose={onClose}/>

      {/* Invoice header */}
      <div className="card" style={{padding:14,marginBottom:12,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{settings.shop_name||"Workshop"}</div>
            {settings.phone&&<div style={{fontSize:12,color:"var(--text3)"}}>📞 {settings.phone}</div>}
            {settings.address&&<div style={{fontSize:12,color:"var(--text3)"}}>{settings.address}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)"}}>{invoice.id}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>Date: {invoice.invoice_date}</div>
            {invoice.due_date&&<div style={{fontSize:12,color:"var(--text3)"}}>Due: {invoice.due_date}</div>}
          </div>
        </div>
        <div style={{borderTop:"1px solid var(--border)",marginTop:10,paddingTop:10,display:"flex",gap:24,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Customer</div>
            <div style={{fontWeight:600}}>{invoice.invoice_customer||job.customer_name||"—"}</div>
            {(invoice.inv_phone||job.customer_phone)&&<div style={{fontSize:12,color:"var(--text3)"}}>{invoice.inv_phone||job.customer_phone}</div>}
          </div>
          <div>
            <div style={{fontSize:11,color:"var(--text3)"}}>Vehicle</div>
            <div style={{fontWeight:600,fontFamily:"DM Mono,monospace"}}>{job.vehicle_reg||"—"}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>{job.vehicle_make} {job.vehicle_model} {job.vehicle_year}</div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card" style={{overflow:"hidden",marginBottom:12}}>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Description","Qty","Unit Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td>
                  <span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:10,marginRight:6}}>
                    {i.type==="part"?"🔩":"👷"}
                  </span>
                  {i.description}
                </td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif"}}>{fmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
          <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmt(invoice.total)}</div>
        </div>
      </div>

      {/* Payment summary */}
      <div className="card" style={{padding:14,marginBottom:14,borderLeft:`3px solid ${statusColor}`}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>💳 Payment Summary</div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
          <span style={{color:"var(--text3)"}}>Invoice Total</span><strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(invoice.total)}</strong>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
          <span style={{color:"var(--text3)"}}>Amount Paid</span>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{fmt(paid)}</strong>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:15,paddingTop:8,borderTop:"1px solid var(--border)"}}>
          <strong>Balance Due</strong>
          <strong style={{fontFamily:"Rajdhani,sans-serif",color:statusColor,fontSize:17}}>{fmt(balance)}</strong>
        </div>
        {paid>0&&(
          <div style={{marginTop:10,padding:"8px 10px",background:"var(--surface2)",borderRadius:8,fontSize:12}}>
            {invoice.payment_method&&<div>Method: <strong>{invoice.payment_method}</strong></div>}
            {invoice.payment_date&&<div>Date: <strong>{invoice.payment_date}</strong></div>}
            {invoice.payment_ref&&<div>Reference: <code style={{fontFamily:"DM Mono,monospace"}}>{invoice.payment_ref}</code></div>}
          </div>
        )}
        <div style={{marginTop:10,display:"flex",justifyContent:"center"}}>
          <span className="badge" style={{background:invoice.status==="paid"?"rgba(52,211,153,.15)":invoice.status==="partial"?"rgba(251,191,36,.15)":"rgba(248,113,113,.15)",color:statusColor,fontSize:13,padding:"5px 14px"}}>
            {invoice.status==="paid"?"✅ FULLY PAID":invoice.status==="partial"?"💛 PARTIALLY PAID":"⏳ UNPAID"}
          </span>
        </div>
      </div>

      {invoice.notes&&<div style={{marginBottom:14,padding:10,background:"var(--surface2)",borderRadius:8,fontSize:13,color:"var(--text2)"}}>{invoice.notes}</div>}

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Close</button>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onPrint}>🖨️ Print PDF</button>
      </div>
    </Overlay>
  );
}

// WORKSHOP INVOICE MODAL
// ═══════════════════════════════════════════════════════════════
function WorkshopInvoiceModal({job,items,subtotal,tax,total,settings,onSave,onClose,t,prefill={}}) {
  const [invDate,  setInvDate]  = useState(new Date().toISOString().slice(0,10));
  const [dueDate,  setDueDate]  = useState(prefill.dueDate||"");
  const [notes,    setNotes]    = useState(prefill.notes||"");
  const [saving,   setSaving]   = useState(false);
  // Invoice-specific customer details — pre-filled from quote or job profile
  const [invCust,  setInvCust]  = useState(prefill.invCust||job.customer_name||"");
  const [invPhone, setInvPhone] = useState(prefill.invPhone||job.customer_phone||"");
  const [invEmail, setInvEmail] = useState(prefill.invEmail||job.customer_email||"");

  const handleCreate=async()=>{
    setSaving(true);
    try{
      await onSave({
        job_id:job.id,
        invoice_customer:invCust, inv_phone:invPhone, inv_email:invEmail,
        vehicle_reg:job.vehicle_reg||"",
        invoice_date:invDate, due_date:dueDate,
        subtotal, tax, total, status:"unpaid", notes,
      });
    }catch(e){ alert("Failed to create invoice: "+e.message); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={prefill.notes?"🧾 Convert Quote to Invoice":"🧾 Create Workshop Invoice"} onClose={onClose}/>
      {prefill.notes&&<div style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12,color:"var(--blue)"}}>
        📝 Pre-filled from quotation — review and adjust before saving.
      </div>}

      {/* Editable invoice customer details — pre-filled from quote or job profile */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".06em"}}>
            👤 Invoice Customer
          </div>
          <div style={{display:"flex",gap:6}}>
            <button type="button" className="btn btn-ghost btn-xs"
              onClick={()=>{ setInvCust(job.customer_name||""); setInvPhone(job.customer_phone||""); setInvEmail(job.customer_email||""); }}>
              ↩ Use Profile
            </button>
            <button type="button" className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
              onClick={()=>{ setInvCust(""); setInvPhone(""); setInvEmail(""); }}>
              ✕ Clear
            </button>
          </div>
        </div>
        <FG>
          <div><FL label="Invoice Name"/><input className="inp" value={invCust} onChange={e=>setInvCust(e.target.value)} placeholder="Customer name on invoice"/></div>
          <div><FL label="Invoice Phone"/><input className="inp" value={invPhone} onChange={e=>setInvPhone(e.target.value)} placeholder="Phone"/></div>
        </FG>
        <FD><FL label="Invoice Email"/><input className="inp" value={invEmail} onChange={e=>setInvEmail(e.target.value)} placeholder="Email"/></FD>
      </div>

      {/* Line items summary */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{fontWeight:700,marginBottom:8,fontSize:13}}>{job.vehicle_reg} · {items.length} item{items.length!==1?"s":""}</div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:11}}>{i.type==="part"?"🔩":"👷"}</span></td>
                <td>{i.description}{i.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:6}}>{i.part_sku}</code>}</td>
                <td style={{textAlign:"right"}}>{i.qty}</td>
                <td style={{textAlign:"right"}}>{fmtAmt(i.unit_price)}</td>
                <td style={{textAlign:"right",fontWeight:700}}>{fmtAmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(subtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)"}}>Total: {fmtAmt(total)}</div>
        </div>
      </div>

      <FG>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
      </FG>
      <FD><FL label={t.notes}/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Payment instructions, warranty..." style={{minHeight:60}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleCreate} disabled={saving}>
          {saving?"Saving...":"💾 Create Invoice"}
        </button>
      </div>
    </Overlay>
  );
}

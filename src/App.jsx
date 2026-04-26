import { useState, useEffect, useCallback, useRef } from "react";
import { api, setDemoMode } from "./lib/api.js";
import { getSettings, updateSettings, loadSettings, C, curSym } from "./lib/settings.js";
import { T, registerLang, getLangs, setCurrentLang, tSt } from "./lib/i18n.js";
import { toImgUrl, toSaveUrl, toLogoUrl, extractDriveId, stripCacheBuster, toFullUrl, today, fmtAmt, makeId, makeToken, detectGeoLocation, waLink, mailLink } from "./lib/helpers.js";
import { ROLES, OC, CATS_EN, CATS_ZH, CAR_MAKES, DEFAULT_CATS, getCategories, TRIAL_DAYS, getSubInfo, canAccess } from "./lib/constants.js";
import { getDynamsoftReader, decodePDF417fromImage, parseLicenceDisc } from "./lib/barcode.js";
import { CSS } from "./styles.js";
import { ErrorBoundary, LogoSVG, ShopLogo, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "./components/shared.jsx";

import { WorkshopProfilePage, ChangePasswordModal, WsLocationSetupModal, WsSubscriptionExpiredPage, WsSubscriptionsPage, OrdersTable, LogoUploader, SettingsPage, LineItemEditor, InvTotals, SupplierInvoiceModal, ViewSupplierInvoiceModal, SupplierReturnModal, CustomerInvoiceModal, ViewCustomerInvoiceModal, CustomerReturnModal, PartActionsMenu, PartModal, AdjustModal, CheckoutModal, SupplierModal, PartSupplierModal, CustomerQueryModal, CustomerQueryReplyModal, InquiryModal, InquiryDetailModal, CustomerModal, UserModal, CustHistoryModal, PdfInvoiceModal, AddPaymentModal, ReportsPage, StockMoveModal, StockTakePage } from "./components/Modals.jsx";
import { RfqPage, PickingPage, PartPhotoUploader, VehicleFitmentTab, VehicleSearchBar, VehiclesPage, VehiclePhotoUploader } from "./components/RfqVehicles.jsx";
import { WorkshopPage } from "./components/Workshop.jsx";
import { LoginPage, PaywallPage } from "./pages/LoginPage.jsx";
import { RfqReplyPage, RfqQuoteReplyPage, RfqBatchReplyPage, QuoteConfirmPage, WsSupplierQuoteReplyPage } from "./pages/PublicPages.jsx";

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const [lang,setLang] = useState(localStorage.getItem("ap_lang")||"en");
  const [user,setUser] = useState(null);
  const [settingsLoaded,setSettingsLoaded] = useState(false);
  const [availLangs,setAvailLangs] = useState(getLangs());
  const [theme,setTheme] = useState(localStorage.getItem("ap_theme")||"dark");
  useEffect(()=>{ document.documentElement.setAttribute("data-theme",theme); },[theme]);
  const toggleTheme = ()=>{ const n=theme==="dark"?"light":"dark"; setTheme(n); localStorage.setItem("ap_theme",n); };
  const changeLang = (l)=>{setLang(l);localStorage.setItem("ap_lang",l);};
  const t = T[lang] || T.en;

  useEffect(()=>{
    const init=async()=>{
      await loadSettings();
      const rows=await api.get("app_translations","active=eq.true&select=lang,name,flag,t,status_t").catch(()=>[]);
      if(Array.isArray(rows)) rows.forEach(r=>registerLang(r.lang,r.name,r.flag,r.t||{},r.status_t||{}));
      const loaded=getLangs();
      setAvailLangs(loaded);
      // If stored lang is not in active list, reset to English
      const storedLang=localStorage.getItem("ap_lang")||"en";
      if(!loaded.find(l=>l.lang===storedLang)) changeLang("en");
      setSettingsLoaded(true);
    };
    init();
  },[]);

  const rfqToken = new URLSearchParams(window.location.search).get("rfq");
  if(rfqToken) return <RfqReplyPage token={rfqToken} lang={lang}/>;
  const rfqQuoteToken = new URLSearchParams(window.location.search).get("rfq_quote");
  if(rfqQuoteToken) return <RfqQuoteReplyPage token={rfqQuoteToken}/>;
  const rfqBatchToken = new URLSearchParams(window.location.search).get("rfq_batch");
  if(rfqBatchToken) return <RfqBatchReplyPage token={rfqBatchToken}/>;
  const wsqToken = new URLSearchParams(window.location.search).get("wsq");
  if(wsqToken) return <QuoteConfirmPage token={wsqToken}/>;
  const wsSupReqToken = new URLSearchParams(window.location.search).get("ws_supreq");
  if(wsSupReqToken) return <WsSupplierQuoteReplyPage token={wsSupReqToken}/>;
  if(!settingsLoaded) return <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{color:"var(--accent)",fontSize:15,fontWeight:600}}>⚙ Loading...</div></div>;
  if(!user) return <LoginPage onLogin={setUser} t={t} lang={lang} setLang={changeLang} loadedSettings={getSettings()} langs={availLangs}/>;
  if(!canAccess(user)) return <PaywallPage user={user} onLogout={()=>setUser(null)} lang={lang}/>;
  return <MainApp user={user} onLogout={()=>setUser(null)} t={t} lang={lang} setLang={changeLang} langs={availLangs} theme={theme} toggleTheme={toggleTheme}/>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
function MainApp({user,onLogout,t,lang,setLang,langs=[],theme,toggleTheme}) {
  setCurrentLang(lang); // sync for tSt
  const role = user.role;
  const wsRole = user.wsRole || "main"; // workshop sub-role: "main" | "manager" | "mechanic"
  // workshop_id scopes all workshop data to this user's own records
  const wsId = role==="workshop" ? String(user.id) : null;
  const wsF  = wsId ? `&workshop_id=eq.${wsId}` : ""; // query filter
  const initTab = role==="customer"?"shop":role==="shipper"?"orders":role==="stockman"?"inventory":role==="manager"?"stocktake":role==="workshop"?"workshop":role==="demo"?"inventory":"dashboard";
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
  const [customerQueries,setCustomerQueries]=useState([]);
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
  const [filterFits,setFilterFits]=useState("__all__"); // __all__ | none | has
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
  const [workshopServices,setWorkshopServices]=useState([]);
  const [workshopSuppliers,setWorkshopSuppliers]=useState([]);
  const [wsSupplierRequests,setWsSupplierRequests]=useState([]);
  const [wsSupplierQuotes,  setWsSupplierQuotes]  =useState([]);
  const [wsSupplierInvoices,setWsSupplierInvoices]=useState([]);
  const [wsSupplierInvItems,setWsSupplierInvItems]=useState([]);
  const [wsSupplierPayments,setWsSupplierPayments]=useState([]);
  const [wsSupplierReturns, setWsSupplierReturns] =useState([]);
  const [wsSqReplies,       setWsSqReplies]       =useState([]);
  const [wsPurchaseOrders,  setWsPurchaseOrders]  =useState([]);
  const [wsPoItems,         setWsPoItems]         =useState([]);
  const [wsLicenceRenewals, setWsLicenceRenewals] =useState([]);
  const [workshopDocuments,setWorkshopDocuments]=useState([]);
  const [workshopProfile,setWorkshopProfile]=useState({});
  const [allWsProfiles,setAllWsProfiles]=useState([]); // all workshop profiles for admin name lookup
  const [showLocationSetup,setShowLocationSetup]=useState(false);
  const [subStatus,setSubStatus]=useState(null); // null | {status,daysLeft,expiresAt}
  const [completedDays,setCompletedDays]=useState(7); // filter completed orders to last N days
  const [searchCust,setSearchCust]=useState("");
  const [inqFilter,setInqFilter]=useState("all");
  const [toast,setToast]=useState(null);
  const [lightbox,setLightbox]=useState(null);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [wsMoreOpen,setWsMoreOpen]=useState(false);

  // Debounce search input — only filter after 250ms of no typing
  useEffect(()=>{
    const t=setTimeout(()=>{ setSearchDebounced(searchPart); setInvPage(0); },250);
    return()=>clearTimeout(t);
  },[searchPart]);

  // Reset page when filters change
  useEffect(()=>{ setInvPage(0); },[filterCat,filterLow,filterFits]);
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

  // Demo mode — block all writes, show toast
  const isDemo = user?.role==="demo";
  setDemoMode(isDemo, ()=>showToast("🔒 Demo mode — sign up to save changes","err"));

  // For workshop role: merge workshop profile over shop settings so logo/name/contacts show correctly
  const wsDisplaySettings = wsId ? {
    ...settings,
    shop_name:  workshopProfile.name      || settings.shop_name,
    logo_url:   workshopProfile.logo_url  || "",
    logo_data:  workshopProfile.logo_data || "",
    phone:      workshopProfile.phone     || settings.phone,
    whatsapp:   workshopProfile.whatsapp  || settings.whatsapp,
    email:      workshopProfile.email     || settings.email,
    address:    workshopProfile.address   || settings.address,
    vat_number: workshopProfile.vat_number|| settings.vat_number,
    currency:   workshopProfile.currency  || settings.currency || "ZAR R",
    city:       workshopProfile.city      || "",
    country:    workshopProfile.country   || "",
    licence_renewal_agent_name:  workshopProfile.licence_renewal_agent_name  || settings.licence_renewal_agent_name  || "",
    licence_renewal_agent_phone: workshopProfile.licence_renewal_agent_phone || settings.licence_renewal_agent_phone || "",
  } : settings;

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
      updateSettings(st[0]); // update global cache — used by ShopLogo on login page
      setSettings(getSettings());
      // Also refresh categories from DB
      try{ if(st[0].categories){ const c=typeof st[0].categories==="string"?JSON.parse(st[0].categories):st[0].categories; if(Array.isArray(c)&&c.length) updateSettings({categories:st[0].categories}); } }catch{}
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
      api.get("workshop_jobs",`select=*&order=date_in.desc${wsF}`).catch(()=>[]),
      api.get("workshop_job_items",`select=*${wsF}`).catch(()=>[]),
      api.get("workshop_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.get("workshop_quotes",`select=*&order=quote_date.desc${wsF}`).catch(()=>[]),
      api.get("workshop_customers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_vehicles",`select=*&order=reg.asc${wsF}`).catch(()=>[]),
      api.get("customer_queries","select=*&order=created_at.desc").catch(()=>[]),
      api.get("workshop_stock",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_services",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_documents",`select=*&order=uploaded_at.desc${wsF}`).catch(()=>[]),
      api.get("workshop_profiles","select=id,name,city,country&order=name.asc").catch(()=>[]),
      api.get("workshop_suppliers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_requests",`select=*&order=sent_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_quotes",`select=*&order=quoted_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_invoice_items",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_supplier_payments",`select=*&order=payment_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_returns",`select=*&order=return_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_sq_replies",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_purchase_orders",`select=*&order=created_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_po_items",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_licence_renewals",`select=*&order=submitted_at.desc${wsF}`).catch(()=>[]),
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
    setCustomerQueries(Array.isArray(rest[11])?rest[11]:[]);
    setWorkshopStock(Array.isArray(rest[12])?rest[12]:[]);
    setWorkshopServices(Array.isArray(rest[13])?rest[13]:[]);
    setWorkshopDocuments(Array.isArray(rest[14])?rest[14]:[]);
    setAllWsProfiles(Array.isArray(rest[15])?rest[15]:[]);
    setWorkshopSuppliers(Array.isArray(rest[16])?rest[16]:[]);
    setWsSupplierRequests(Array.isArray(rest[17])?rest[17]:[]);
    setWsSupplierQuotes(Array.isArray(rest[18])?rest[18]:[]);
    setWsSupplierInvoices(Array.isArray(rest[19])?rest[19]:[]);
    setWsSupplierInvItems(Array.isArray(rest[20])?rest[20]:[]);
    setWsSupplierPayments(Array.isArray(rest[21])?rest[21]:[]);
    setWsSupplierReturns(Array.isArray(rest[22])?rest[22]:[]);
    setWsSqReplies(Array.isArray(rest[23])?rest[23]:[]);
    setWsPurchaseOrders(Array.isArray(rest[24])?rest[24]:[]);
    setWsPoItems(Array.isArray(rest[25])?rest[25]:[]);
    setWsLicenceRenewals(Array.isArray(rest[26])?rest[26]:[]);
    // Load workshop profile for workshop role
    if(wsId){
      const prof=await api.get("workshop_profiles",`id=eq.${wsId}&select=*`).catch(()=>[]);
      const p=Array.isArray(prof)&&prof[0]?prof[0]:{};
      setWorkshopProfile(p);
      // Check subscription
      if(p.subscription_expires_at){
        const today=new Date(); today.setHours(0,0,0,0);
        const exp=new Date(p.subscription_expires_at); exp.setHours(0,0,0,0);
        const daysLeft=Math.ceil((exp-today)/(1000*60*60*24));
        const status=p.subscription_status||"trial";
        setSubStatus({status, daysLeft, expiresAt:p.subscription_expires_at, expired:daysLeft<0||(status==="expired")});
      }
      // Prompt for city/country if missing (main role only)
      if(wsRole==="main"&&(!p.city||!p.country)) setShowLocationSetup(true);
    }
  },[]);

  // Silent workshop-only refresh — does NOT set loading=true so WorkshopPage stays mounted
  const refreshWorkshopData=useCallback(async()=>{
    const [jobs,items,invoices,quotes,wsCustomers,wsVehicles,wsStock,wsServices,wsDocs,wsSupps,wsReqs,wsQts,wsInvs,wsInvItems,wsPayms,wsRets]=await Promise.all([
      api.get("workshop_jobs",`select=*&order=date_in.desc${wsF}`).catch(()=>[]),
      api.get("workshop_job_items",`select=*${wsF}`).catch(()=>[]),
      api.get("workshop_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.get("workshop_quotes",`select=*&order=quote_date.desc${wsF}`).catch(()=>[]),
      api.get("workshop_customers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_vehicles",`select=*&order=reg.asc${wsF}`).catch(()=>[]),
      api.get("workshop_stock",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_services",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("workshop_documents",`select=*&order=uploaded_at.desc${wsF}`).catch(()=>[]),
      api.get("workshop_suppliers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_requests",`select=*&order=sent_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_quotes",`select=*&order=quoted_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_invoice_items",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_supplier_payments",`select=*&order=payment_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_supplier_returns",`select=*&order=return_date.desc${wsF}`).catch(()=>[]),
      api.get("ws_sq_replies",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_purchase_orders",`select=*&order=created_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_po_items",`select=*${wsF}`).catch(()=>[]),
    ]);
    setWorkshopJobs(Array.isArray(jobs)?jobs:[]);
    setWorkshopJobItems(Array.isArray(items)?items:[]);
    setWorkshopInvoices(Array.isArray(invoices)?invoices:[]);
    setWorkshopQuotes(Array.isArray(quotes)?quotes:[]);
    setWorkshopCustomers(Array.isArray(wsCustomers)?wsCustomers:[]);
    setWorkshopVehicles(Array.isArray(wsVehicles)?wsVehicles:[]);
    setWorkshopStock(Array.isArray(wsStock)?wsStock:[]);
    setWorkshopServices(Array.isArray(wsServices)?wsServices:[]);
    setWorkshopDocuments(Array.isArray(wsDocs)?wsDocs:[]);
    setWorkshopSuppliers(Array.isArray(wsSupps)?wsSupps:[]);
    setWsSupplierRequests(Array.isArray(wsReqs)?wsReqs:[]);
    setWsSupplierQuotes(Array.isArray(wsQts)?wsQts:[]);
    setWsSupplierInvoices(Array.isArray(wsInvs)?wsInvs:[]);
    setWsSupplierInvItems(Array.isArray(wsInvItems)?wsInvItems:[]);
    setWsSupplierPayments(Array.isArray(wsPayms)?wsPayms:[]);
    setWsSupplierReturns(Array.isArray(wsRets)?wsRets:[]);
    const [sqReps,wsPOs,wsPOItems,wsLicRen]=await Promise.all([
      api.get("ws_sq_replies",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_purchase_orders",`select=*&order=created_at.desc${wsF}`).catch(()=>[]),
      api.get("ws_po_items",`select=*${wsF}`).catch(()=>[]),
      api.get("ws_licence_renewals",`select=*&order=submitted_at.desc${wsF}`).catch(()=>[]),
    ]);
    setWsSqReplies(Array.isArray(sqReps)?sqReps:[]);
    setWsPurchaseOrders(Array.isArray(wsPOs)?wsPOs:[]);
    setWsPoItems(Array.isArray(wsPOItems)?wsPOItems:[]);
    setWsLicenceRenewals(Array.isArray(wsLicRen)?wsLicRen:[]);
    if(wsId){
      const prof=await api.get("workshop_profiles",`id=eq.${wsId}&select=*`).catch(()=>[]);
      setWorkshopProfile(Array.isArray(prof)&&prof[0]?prof[0]:{});
    }
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
    tabRef.current === "wssuporders" ||
    tabRef.current === "wsstatement" ||
    tabRef.current === "wsreport" ||
    tabRef.current === "settings" ||    // always pause on settings page
    tabRef.current === "wsprofile" ||   // always pause on workshop profile/settings
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
  const savePart=async(data, keepOpen=false)=>{
    const ep=mData("editPart");
    if(ep){
      const d2={...data,image_url:toSaveUrl(data.image_url)};
      const result=await api.patch("parts","id",ep.id,d2);
      if(!Array.isArray(result)){
        showToast(`Save failed: ${result?.message||"Unknown error"}`,"err");
        return false;
      }
      if(result.length===0){
        showToast("Part not found — could not save","err");
        return false;
      }
      if(ep.stock!==d2.stock)await logInv({...ep,...d2},ep.stock,d2.stock,"Edit Part","Admin edit");
      showToast("Part updated");
      if(!keepOpen) await releaseLock("part",ep.id);
      await loadAll();
      if(keepOpen){
        // Close and reopen so form reinitialises with fresh saved data
        const fresh = {...ep, ...d2};
        closeM("editPart");
        setTimeout(()=>openM("editPart", fresh), 0);
      } else {
        closeM("editPart");
        setTimeout(()=>{
          const el=document.getElementById(`part-row-${ep.id}`);
          if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.style.transition="background .5s"; el.style.background="rgba(251,146,60,.15)"; setTimeout(()=>el.style.background="",1500); }
        },300);
      }
    } else {
      const d2={...data,image_url:toSaveUrl(data.image_url)};
      const r=await api.upsert("parts",d2);
      await logInv(Array.isArray(r)?r[0]:d2,0,d2.stock,"New Part","Added");
      showToast("Part added");
      await loadAll();
      if(!keepOpen) closeM("editPart");
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
        chk(await api.insert("workshop_customers",{id:custId,name:d.customer_name.trim(),phone:d.customer_phone||"",email:d.customer_email||"",workshop_id:wsId||null}),"Save customer");
        d.workshop_customer_id=custId;
      }
      // Auto-create workshop_vehicle if not linked yet
      if(!d.workshop_vehicle_id && d.vehicle_reg?.trim()){
        const vehId=makeId("WSV");
        chk(await api.insert("workshop_vehicles",{id:vehId,workshop_customer_id:d.workshop_customer_id||null,reg:d.vehicle_reg.trim(),make:d.vehicle_make||"",model:d.vehicle_model||"",year:d.vehicle_year||"",color:d.vehicle_color||"",vin:d.vin||"",engine_no:d.engine_no||"",licence_disc_expiry:d.licence_disc_expiry||null,workshop_id:wsId||null}),"Save vehicle");
        d.workshop_vehicle_id=vehId;
      } else if(d.workshop_vehicle_id && d.licence_disc_expiry) {
        await api.patch("workshop_vehicles","id",d.workshop_vehicle_id,{licence_disc_expiry:d.licence_disc_expiry}).catch(()=>{});
      }
      // Build job record — empty strings → null so Supabase doesn't choke on typed columns
      const str=v=>v?.toString().trim()||null;
      const int=v=>v?parseInt(v,10)||null:null;
      const jobRow={
        workshop_id:wsId||null,
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
  const moveWorkshopJob=async(jobId,targetWsId)=>{
    const tid=targetWsId.trim();
    if(!tid) throw new Error("Target workshop ID is required");
    // Check target workshop exists
    const check=await api.get("workshop_profiles",`id=eq.${tid}&select=id`).catch(()=>[]);
    if(!Array.isArray(check)||check.length===0) throw new Error(`Workshop "${tid}" not found`);
    // Move job and all related records
    await api.patch("workshop_jobs","id",jobId,{workshop_id:tid});
    await api.patch("workshop_job_items","job_id",jobId,{workshop_id:tid});
    const job=workshopJobs.find(j=>j.id===jobId);
    // Move invoice(s) for this job
    const jobInvoices=workshopInvoices.filter(i=>i.job_id===jobId);
    for(const inv of jobInvoices) await api.patch("workshop_invoices","id",inv.id,{workshop_id:tid});
    // Move quote(s) for this job
    const jobQuotes=workshopQuotes.filter(q=>q.job_id===jobId);
    for(const q of jobQuotes) await api.patch("workshop_quotes","id",q.id,{workshop_id:tid});
    await refreshWorkshopData();
    showToast(`Job moved to workshop ${tid}`);
  };
  const saveJobItem=async(item)=>{
    // Strip client-only fields not in the DB schema
    const {part_id, ws_stock_id, id, ...dbItem} = item;
    let res;
    if(id){
      res=await api.patch("workshop_job_items","id",id,dbItem);
    } else {
      res=await api.insert("workshop_job_items",{...dbItem,workshop_id:wsId||null});
      // Deduct from workshop stock when adding a part to a job (skip quote_only items)
      if(ws_stock_id && item.type==="part"){
        const wsi=workshopStock.find(w=>w.id===ws_stock_id);
        if(wsi && !wsi.quote_only){
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
    const payload={...rest, id:id||makeId("WSI"), workshop_id:wsId||null};
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
    else { await api.insert("workshop_quotes",{...rest,id:makeId("WSQ"),workshop_id:wsId||null}); showToast("Quote created"); }
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
      id:invId, job_id:job.id, workshop_id:wsId||null,
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
    else { await api.insert("workshop_customers",{...data, id:makeId("WSC"), workshop_id:wsId||null}); }
    await refreshWorkshopData(); showToast("Customer saved");
  };
  const deleteWorkshopCustomer=async(id)=>{
    await api.delete("workshop_customers","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const saveWorkshopVehicle=async(data)=>{
    const {id,...rest}=data;
    if(id){ await api.patch("workshop_vehicles","id",id,rest); }
    else { await api.insert("workshop_vehicles",{...data, id:makeId("WSV"), workshop_id:wsId||null}); }
    await refreshWorkshopData(); showToast("Vehicle saved");
  };
  const deleteWorkshopVehicle=async(id)=>{
    await api.delete("workshop_vehicles","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };

  // ── Workshop Stock ────────────────────────────────────────────
  const saveWsStockItem=async(item)=>{
    const {id,...rest}=item;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("workshop_stock","id",id,rest),"Update stock"); showToast("Stock item updated"); }
    else { chkR(await api.insert("workshop_stock",{...rest,id:makeId("WSK"),workshop_id:wsId||null}),"Add stock"); showToast("Stock item added"); }
    await refreshWorkshopData();
  };
  const deleteWsStockItem=async(id)=>{
    await api.delete("workshop_stock","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const adjustWsStock=async({id,delta,reason,new_qty})=>{
    const stockItem=workshopStock.find(s=>s.id===id);
    await api.patch("workshop_stock","id",id,{qty:new_qty});
    await api.insert("workshop_stock_moves",{
      id:makeId("WSM"),stock_id:id,stock_name:stockItem?.name||"",
      move_type:"adjustment",qty_change:delta,qty_after:new_qty,
      notes:reason||"Manual adjustment",moved_at:new Date().toISOString(),
    });
    await refreshWorkshopData(); showToast(`Stock → ${new_qty}`);
  };

  // ── Workshop Services ─────────────────────────────────────────
  const saveWsService=async(svc)=>{
    const {id,...rest}=svc;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("workshop_services","id",id,rest),"Update service"); showToast("Service updated"); }
    else { chkR(await api.insert("workshop_services",{...rest,id:makeId("WSS"),workshop_id:wsId||null}),"Add service"); showToast("Service added"); }
    await refreshWorkshopData();
  };
  const deleteWsService=async(id)=>{
    await api.delete("workshop_services","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };

  // ── Workshop Suppliers ────────────────────────────────────────
  const saveWsSupplier=async(sup)=>{
    const {id,...rest}=sup;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    const clean=Object.fromEntries(Object.entries(rest).filter(([,v])=>v!=null));
    if(id){ chkR(await api.patch("workshop_suppliers","id",id,clean),"Update supplier"); showToast("Supplier updated"); }
    else { chkR(await api.insert("workshop_suppliers",{...clean,id:makeId("WSUP"),workshop_id:wsId||null}),"Add supplier"); showToast("Supplier added"); }
    await refreshWorkshopData();
  };
  const deleteWsSupplier=async(id)=>{
    await api.delete("workshop_suppliers","id",id);
    await refreshWorkshopData(); showToast("Deleted","err");
  };
  const saveWsSupplierQuote=async(qt)=>{
    const {id,...rest}=qt;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("ws_supplier_quotes","id",id,rest),"Update quote"); }
    else { chkR(await api.insert("ws_supplier_quotes",{...rest,id:makeId("WSQT"),workshop_id:wsId||null,quoted_at:new Date().toISOString()}),"Save quote"); }
    const fresh=await api.get("ws_supplier_quotes",`select=*&order=quoted_at.desc${wsF}`).catch(()=>[]);
    setWsSupplierQuotes(Array.isArray(fresh)?fresh:[]);
  };

  const saveWsSupplierRequest=async(req)=>{
    await api.insert("ws_supplier_requests",{...req,id:makeId("WSRQ"),workshop_id:wsId||null,sent_at:new Date().toISOString()}).catch(e=>console.warn("Log send failed:",e));
    setWsSupplierRequests(p=>[{...req,id:makeId("WSRQ"),sent_at:new Date().toISOString()},...p]);
  };

  const deleteWsSupplierRequest=async(id)=>{
    await api.delete("ws_supplier_requests","id",id).catch(e=>console.warn("Delete send failed:",e));
    setWsSupplierRequests(p=>p.filter(r=>r.id!==id));
  };

  const generateWsSupplierQuoteLink=async(info,items)=>{
    const token=makeToken();
    const reqId=makeId("WSRQ");
    const now=new Date().toISOString();
    const rec={id:reqId,workshop_id:wsId||null,job_id:info.job_id||null,vehicle_reg:info.vehicle_reg||"",
      supplier_id:info.supplier_id||null,supplier_name:info.supplier_name||"",supplier_phone:info.supplier_phone||"",
      supplier_vat_inclusive:info.supplier_vat_inclusive||false,
      parts_list:JSON.stringify(items.map(i=>i.label||i.description||"")),message:"",token,
      items_json:JSON.stringify(items),sent_at:now};
    await api.insert("ws_supplier_requests",rec).catch(e=>console.warn("Link gen failed:",e));
    setWsSupplierRequests(p=>[rec,...p]);
    return `${window.location.origin}${window.location.pathname}?ws_supreq=${token}`;
  };

  const saveWsPurchaseOrder=async(po,items=[])=>{
    const chk=(r,l)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${l}: ${r.message||r.code}`); return r; };
    const {id,items:_poItems,...rest}=po; // strip items from po object before DB insert
    const isNew=!id;
    const poId=id||makeId("WSPO");
    const total=items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
    if(isNew){
      chk(await api.insert("ws_purchase_orders",{...rest,id:poId,workshop_id:wsId||null,total_amount:total,created_at:new Date().toISOString()}),"Create PO");
    } else {
      chk(await api.patch("ws_purchase_orders","id",poId,{...rest,total_amount:total}),"Update PO");
      await api.delete("ws_po_items","po_id",poId);
    }
    for(const it of items){
      chk(await api.insert("ws_po_items",{...it,id:makeId("WSPI"),po_id:poId,workshop_id:wsId||null}),"Add PO item");
    }
    await refreshWorkshopData();
    showToast(isNew?"Purchase order created":"Purchase order updated");
    return {id:poId,...rest};
  };

  const deleteWsPurchaseOrder=async(id)=>{
    await api.delete("ws_po_items","po_id",id);
    await api.delete("ws_purchase_orders","id",id);
    await refreshWorkshopData();
    showToast("Purchase order deleted","err");
  };

  const receiveWsPurchaseOrder=async(poId,receivedItems)=>{
    const chk=(r,l)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${l}: ${r.message||r.code}`); return r; };
    const po=wsPurchaseOrders.find(p=>p.id===poId);
    if(!po) return;
    const toReceive=receivedItems.filter(i=>+i.receive_qty>0);
    if(!toReceive.length){showToast("Enter qty to receive","err");return;}
    const invId=makeId("WSIN");
    const total=toReceive.reduce((s,i)=>s+(+i.receive_qty)*(+i.unit_price||0),0);
    chk(await api.insert("ws_supplier_invoices",{id:invId,workshop_id:wsId||null,
      supplier_id:po.supplier_id||null,supplier_name:po.supplier_name||"",
      invoice_ref:`PO-${poId}`,invoice_date:new Date().toISOString().slice(0,10),
      total,paid_amount:0,status:"pending"}),"Create invoice");
    for(const it of toReceive){
      chk(await api.insert("ws_supplier_invoice_items",{id:makeId("WSII"),invoice_id:invId,workshop_id:wsId||null,
        description:it.description,sku:it.sku||"",qty:+it.receive_qty,
        unit_cost:+it.unit_price||0,total:(+it.receive_qty)*(+it.unit_price||0),stock_id:it.stock_id||null}),"Add item");
      if(it.stock_id){
        const wsi=workshopStock.find(w=>w.id===it.stock_id);
        if(wsi&&!wsi.quote_only){
          const nq=(+wsi.qty||0)+(+it.receive_qty);
          await api.patch("workshop_stock","id",it.stock_id,{qty:nq,unit_cost:+it.unit_price||+wsi.unit_cost||0});
          await api.insert("workshop_stock_moves",{id:makeId("WSM"),stock_id:it.stock_id,stock_name:wsi.name,
            move_type:"purchase",qty_change:+it.receive_qty,qty_after:nq,reference:invId,
            notes:`PO ${poId}`,moved_at:new Date().toISOString()});
        }
      }
      if(it.po_item_id){
        const poi=wsPoItems.find(p=>p.id===it.po_item_id);
        if(poi) await api.patch("ws_po_items","id",it.po_item_id,{received_qty:(+poi.received_qty||0)+(+it.receive_qty)});
      }
    }
    // Determine new PO status
    const allItems=wsPoItems.filter(i=>i.po_id===poId);
    const updatedItems=allItems.map(i=>{const r=receivedItems.find(x=>x.po_item_id===i.id);return{...i,received_qty:(+i.received_qty||0)+(r?+r.receive_qty:0)};});
    const allDone=updatedItems.every(i=>(+i.received_qty||0)>=(+i.qty||0));
    const anyDone=updatedItems.some(i=>(+i.received_qty||0)>0);
    await api.patch("ws_purchase_orders","id",poId,{status:allDone?"received":anyDone?"partial":po.status});
    await refreshWorkshopData();
    showToast("Goods received & stock updated");
  };

  // ── Workshop Licence Renewals ─────────────────────────────────
  const saveWsLicenceRenewal=async(rec)=>{
    const id=rec.id||makeId("WSLR");
    const row={...rec,id,workshop_id:wsId||null};
    await api.insert("ws_licence_renewals",row).catch(e=>console.warn("Save renewal failed:",e));
    setWsLicenceRenewals(p=>[row,...p.filter(r=>r.id!==id)]);
  };

  const updateWsLicenceRenewal=async(id,patch)=>{
    await api.patch("ws_licence_renewals","id",id,patch).catch(e=>console.warn("Update renewal failed:",e));
    setWsLicenceRenewals(p=>p.map(r=>r.id===id?{...r,...patch}:r));
  };

  // ── Workshop Supplier Invoices ────────────────────────────────
  const saveWsSupplierInvoice=async(inv,lineItems=[])=>{
    const chk=(r,l)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${l}: ${r.message||r.code}`); return r; };
    const {id,...rest}=inv;
    const isNew=!id;
    const invId=id||makeId("WSIN");
    if(isNew){
      chk(await api.insert("ws_supplier_invoices",{...rest,id:invId,workshop_id:wsId||null}),"Create invoice");
      for(const li of lineItems){
        const liId=makeId("WSII");
        chk(await api.insert("ws_supplier_invoice_items",{...li,id:liId,invoice_id:invId,workshop_id:wsId||null}),"Add item");
        // Update workshop stock qty
        if(li.stock_id){
          const wsi=workshopStock.find(w=>w.id===li.stock_id);
          if(wsi&&!wsi.quote_only){
            const nq=(+wsi.qty||0)+(+li.qty||0);
            await api.patch("workshop_stock","id",li.stock_id,{qty:nq,unit_cost:+li.unit_cost||+wsi.unit_cost||0});
            await api.insert("workshop_stock_moves",{id:makeId("WSM"),stock_id:li.stock_id,stock_name:wsi.name,move_type:"purchase",qty_change:+li.qty,qty_after:nq,reference:invId,notes:`Supplier invoice ${invId}`,moved_at:new Date().toISOString()});
          }
        }
      }
      showToast("Invoice saved & stock updated");
    } else {
      chk(await api.patch("ws_supplier_invoices","id",invId,rest),"Update invoice");
      showToast("Invoice updated");
    }
    await refreshWorkshopData();
  };
  const deleteWsSupplierInvoice=async(id)=>{
    await api.delete("ws_supplier_invoice_items","invoice_id",id);
    await api.delete("ws_supplier_invoices","id",id);
    await refreshWorkshopData(); showToast("Invoice deleted","err");
  };
  const saveWsSupplierPayment=async(pay)=>{
    const chk=(r,l)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${l}: ${r.message||r.code}`); return r; };
    chk(await api.insert("ws_supplier_payments",{...pay,id:makeId("WSPM"),workshop_id:wsId||null}),"Save payment");
    // Update invoice paid_amount and status
    const inv=wsSupplierInvoices.find(i=>i.id===pay.invoice_id);
    if(inv){
      const allPays=[...wsSupplierPayments,pay];
      const paid=allPays.filter(p=>p.invoice_id===pay.invoice_id).reduce((s,p)=>s+(+p.amount||0),0);
      const total=+inv.total||0;
      const status=paid>=total?"paid":paid>0?"partial":"pending";
      await api.patch("ws_supplier_invoices","id",pay.invoice_id,{paid_amount:paid,status});
    }
    await refreshWorkshopData(); showToast("Payment recorded");
  };
  const deleteWsSupplierPayment=async(id,invoiceId)=>{
    await api.delete("ws_supplier_payments","id",id);
    // Recalc paid_amount
    const remaining=wsSupplierPayments.filter(p=>p.id!==id&&p.invoice_id===invoiceId);
    const paid=remaining.reduce((s,p)=>s+(+p.amount||0),0);
    const inv=wsSupplierInvoices.find(i=>i.id===invoiceId);
    if(inv){
      const total=+inv.total||0;
      const status=paid>=total?"paid":paid>0?"partial":"pending";
      await api.patch("ws_supplier_invoices","id",invoiceId,{paid_amount:paid,status});
    }
    await refreshWorkshopData(); showToast("Payment removed","err");
  };
  const saveWsSupplierReturn=async(ret,lineItems=[])=>{
    const chk=(r,l)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${l}: ${r.message||r.code}`); return r; };
    const retId=makeId("WSRT");
    chk(await api.insert("ws_supplier_returns",{...ret,id:retId,workshop_id:wsId||null,items:JSON.stringify(lineItems)}),"Save return");
    // Reverse stock for returned items
    for(const li of lineItems){
      if(li.stock_id){
        const wsi=workshopStock.find(w=>w.id===li.stock_id);
        if(wsi&&!wsi.quote_only){
          const nq=Math.max(0,(+wsi.qty||0)-(+li.qty||0));
          await api.patch("workshop_stock","id",li.stock_id,{qty:nq});
          await api.insert("workshop_stock_moves",{id:makeId("WSM"),stock_id:li.stock_id,stock_name:wsi.name,move_type:"return_out",qty_change:-(+li.qty),qty_after:nq,reference:retId,notes:`Return to supplier ${ret.supplier_name||""}`,moved_at:new Date().toISOString()});
        }
      }
    }
    await refreshWorkshopData(); showToast("Return recorded & stock adjusted");
  };

  // ── Workshop Documents ────────────────────────────────────────
  const saveWsDocument=async(doc)=>{
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    chkR(await api.insert("workshop_documents",{...doc,id:makeId("WSD"),workshop_id:wsId||null,uploaded_at:new Date().toISOString()}),"Save document");
    await refreshWorkshopData(); showToast("Document saved");
  };
  const deleteWsDocument=async(id)=>{
    await api.delete("workshop_documents","id",id);
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

  const acceptInquiry=async(inq)=>{
    if(!inq.reply_price) return;
    const invId=makeId(settings.invoice_prefix||"INV");
    const lineItem={
      id:makeId("LI"), invoice_id:invId,
      part_id:inq.part_id||"", part_name:inq.part_name||"",
      part_sku:inq.part_sku||"", supplier_part_id:inq.supplier_part_no||"",
      qty:inq.qty_requested||1, unit_cost:+inq.reply_price||0,
      total:(inq.qty_requested||1)*(+inq.reply_price||0)
    };
    const inv={
      id:invId, supplier_id:+inq.supplier_id||null, supplier_name:inq.supplier_name,
      invoice_date:today(), status:"unpaid",
      total:lineItem.total, notes:`From RFQ ${inq.id}`
    };
    await api.insert("supplier_invoices",inv);
    await api.insert("supplier_invoice_items",lineItem);
    // Update stock
    const part=parts.find(p=>String(p.id)===String(inq.part_id));
    if(part){
      const ns=part.stock+(inq.qty_requested||1);
      await api.patch("parts","id",part.id,{stock:ns});
      await logInv(part,part.stock,ns,"Stock In",`RFQ Accept ${inq.id}`);
    }
    await api.patch("inquiries","id",inq.id,{status:"ordered"});
    await loadAll();
    showToast(`✅ PO ${invId} created`);
    setTab("purchaseInvoices");
  };

  // Customer Queries
  const submitCustomerQuery=async(data)=>{
    await api.insert("customer_queries",data);
    const q=await api.get("customer_queries","select=*&order=created_at.desc").catch(()=>[]);
    setCustomerQueries(Array.isArray(q)?q:[]);
    showToast("✅ Query submitted! We'll reply soon.");
  };
  const replyToQuery=async(id,data)=>{
    await api.patch("customer_queries","id",id,data);
    setCustomerQueries(p=>p.map(q=>q.id===id?{...q,...data}:q));
    showToast("✅ Reply sent to customer!");
  };
  const markDepositPaid=async(id)=>{
    const d={status:"deposit_paid",deposit_paid_at:new Date().toISOString()};
    await api.patch("customer_queries","id",id,d);
    setCustomerQueries(p=>p.map(q=>q.id===id?{...q,...d}:q));
    showToast("✅ Deposit marked as paid!");
  };

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
  const deleteSupplierInvoice=async(id)=>{
    if(!window.confirm("Delete this empty invoice?")) return;
    await api.delete("supplier_invoice_items","invoice_id",id);
    await api.delete("supplier_invoices","id",id);
    await loadAll();showToast("Invoice deleted","err");
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
  const saveUser=async(data)=>{const eu=mData("editUser");if(eu?.id)await api.patch("users","id",eu.id,data);else await api.upsert("users",data);await loadAll();closeM("editUser");showToast(eu?.id?"Updated":"Added");};
  const deleteUser=async(id)=>{if(id===user.id){showToast("Cannot delete yourself","err");return;}await api.delete("users","id",id);await loadAll();showToast("Deleted","err");};
  const saveSettings=async(data)=>{
    // Include id:1 so upsert creates row if missing
    const merged = {...getSettings(),...settings,...data, id:1};
    await api.upsert("settings", merged);
    updateSettings(data);
    setSettings(s=>({...s,...data}));
    showToast("✅ Settings saved");
  };

  const saveWorkshopProfile=async(data)=>{
    const payload={...data, id:wsId};
    // Check if row already exists
    const existing=await api.get("workshop_profiles",`id=eq.${wsId}&select=id`).catch(()=>[]);
    let res;
    if(Array.isArray(existing)&&existing.length>0){
      res=await api.patch("workshop_profiles","id",wsId,payload);
    } else {
      res=await api.insert("workshop_profiles",payload);
    }
    // Show actual Supabase error if save failed
    if(res&&!Array.isArray(res)&&res.message){
      showToast(`❌ Save failed: ${res.message}`,"err");
      console.error("workshop_profiles save error:",res);
      return;
    }
    setWorkshopProfile(p=>({...p,...data}));
    showToast("✅ Workshop profile saved");
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
    const itemQuotes=rfqQuotes.filter(q=>q.rfq_item_id===rfqItemId);
    for(const q of itemQuotes){
      await api.patch("rfq_quotes","id",q.id,{status:q.id===quoteId?"selected":"pending"});
    }
    // no loadAll — RfqPage uses optimistic lq state; user clicks Refresh to sync
  };

  const unselectRfqQuote=async(quoteId)=>{
    await api.patch("rfq_quotes","id",quoteId,{status:"quoted"});
    // no loadAll
  };

  const unselectAllRfq=async(sid)=>{
    const toUnselect=rfqQuotes.filter(q=>q.rfq_id===sid&&q.status==="selected");
    for(const q of toUnselect) await api.patch("rfq_quotes","id",q.id,{status:"quoted"});
    // no loadAll
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
    if(isDemo&&!(p.image_url||p.image_data))return false; // demo: only parts with photos
    if(filterLow&&p.stock>p.min_stock)return false;
    if(filterCat!=="__all__"&&p.category!==filterCat)return false;
    if(filterFits!=="__all__"){
      const hasFit=partFitments.some(f=>String(f.part_id)===String(p.id));
      if(filterFits==="none"&&hasFit)return false;
      if(filterFits==="has"&&!hasFit)return false;
    }
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
  const pendingCQ=customerQueries.filter(q=>q.status==="pending").length;
  const getPartSupps=(pid)=>partSuppliers.filter(ps=>ps.part_id===pid).map(ps=>({...ps,supplier:suppliers.find(s=>s.id===ps.supplier_id)}));
  const OS = role==="shipper"
    ? [
        ["__active__", t.activeOrders],
        ["Processing",  tSt("Processing")],
        ["Ready to Ship", tSt("Ready to Ship")],
        ["Completed",   tSt("Completed")],
        ["Cancelled",   tSt("Cancelled")],
      ]
    : [
        ["__all__",     t.all],
        ["Processing",  tSt("Processing")],
        ["Ready to Ship", tSt("Ready to Ship")],
        ["Completed",   tSt("Completed")],
        ["Cancelled",   tSt("Cancelled")],
      ];
  const sub=getSubInfo(user);

  // Grouped nav for sidebar
  const navGroups=[
    {
      id:"grp_dashboard", icon:"📊", label:t.grpDashboard, roles:["admin"],
      children:[
        {id:"dashboard",icon:"📊",label:t.dashboard,roles:["admin"]},
        {id:"loginlogs",icon:"🌍",label:t.loginLogs,roles:["admin"]},
      ]
    },
    {
      id:"grp_inventory", icon:"📦", label:t.grpInventory, roles:["admin","manager","shipper","stockman"],
      children:[
        {id:"inventory",icon:"📦",label:t.inventory,roles:["admin","manager","shipper","stockman"],badge:lowStock.length},
        {id:"stocktake",icon:"🔢",label:t.stockTake,roles:["admin","manager","shipper","stockman"]},
        {id:"stockmove",icon:"🔀",label:t.stockMove,roles:["admin","manager","shipper","stockman"]},
        {id:"logs",icon:"📝",label:t.logs,roles:["admin","manager"]},
      ]
    },
    {
      id:"grp_purchase", icon:"🏭", label:t.grpPurchase, roles:["admin"],
      badge: pendingInq,
      children:[
        {id:"suppliers",icon:"🏭",label:t.suppliers,roles:["admin"]},
        {id:"rfq",icon:"📋",label:t.rfqSession,roles:["admin"]},
        {id:"inquiries",icon:"📩",label:t.inquiries,roles:["admin"],badge:pendingInq},
        {id:"purchaseInvoices",icon:"🧾",label:t.purchaseInvoices,roles:["admin"]},
        {id:"supplierReturns",icon:"↩️",label:t.supplierReturns,roles:["admin"]},
      ]
    },
    // Admin/manager: single flat Workshop group (compact)
    ...(role!=="workshop"?[{
      id:"grp_workshop", icon:"🔧", label:t.grpWorkshop||"Workshop", roles:["admin","manager"],
      children:[
        {id:"workshop",    icon:"🔧",label:t.wsJobs,                      roles:["admin","manager"]},
        {id:"wscustomers", icon:"👥",label:t.wsCustomers,                 roles:["admin","manager"]},
        {id:"wsquotations",icon:"📝",label:t.wsQuotations,                roles:["admin","manager"]},
        {id:"wsinvoices",  icon:"🧾",label:t.wsInvoices,                  roles:["admin","manager"]},
        {id:"wspayments",  icon:"💳",label:t.wsPayments,                  roles:["admin","manager"]},
        {id:"wssuppliers", icon:"🏪",label:t.wsSuppliers,                 roles:["admin","manager"]},
        {id:"wssuporders", icon:"📋",label:t.wsPurchaseOrders,            roles:["admin","manager"]},
        {id:"wssupinv",    icon:"🧾",label:t.wsSupInvoices,roles:["admin","manager"]},
        {id:"wsstock",     icon:"📦",label:t.wsStock,                     roles:["admin","manager"]},
        {id:"wstransfer",  icon:"🔄",label:t.wsTransfer,                  roles:["admin","manager"]},
        {id:"wsservices",  icon:"🔧",label:t.wsServices,                  roles:["admin","manager"]},
        {id:"wsstatement", icon:"📄",label:t.wsStatement,                 roles:["admin","manager"]},
        {id:"wsreport",    icon:"📊",label:t.wsReport,                    roles:["admin","manager"]},
        {id:"wssubscriptions",icon:"💳",label:t.wsSubscriptions,          roles:["admin"]},
      ]
    }]:[]),
    // Workshop role: 4 organised sub-groups (this IS their whole app)
    ...(role==="workshop"?[
      {
        id:"grp_ws_jobs", icon:"🔧", label:t.grpWorkshop||"Workshop — Jobs", roles:["workshop"],
        children:[
          {id:"workshop",    icon:"🔧",label:t.wsJobs,       roles:["workshop"]},
          {id:"wscustomers", icon:"👥",label:t.wsCustomers,  roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wsquotations",icon:"📝",label:t.wsQuotations, roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wsinvoices",  icon:"🧾",label:t.wsInvoices,   roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wspayments",  icon:"💳",label:t.wsPayments,   roles:["workshop"], wsRoles:["main","manager"]},
        ]
      },
      {
        id:"grp_ws_procurement", icon:"🏪", label:t.wsProcurement, roles:["workshop"],
        children:[
          {id:"wssuppliers", icon:"🏪",label:t.wsSuppliers,                  roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wssuporders", icon:"📋",label:t.wsPurchaseOrders,             roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wssupinv",    icon:"🧾",label:t.wsSupInvoices, roles:["workshop"], wsRoles:["main","manager"]},
        ]
      },
      {
        id:"grp_ws_stock", icon:"📦", label:t.wsStockGroup, roles:["workshop"],
        children:[
          {id:"wsstock",    icon:"📦",label:t.wsStock,    roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wstransfer", icon:"🔄",label:t.wsTransfer, roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wsservices", icon:"🔧",label:t.wsServices, roles:["workshop"], wsRoles:["main","manager"]},
        ]
      },
      {
        id:"grp_ws_admin", icon:"📊", label:t.wsAdmin, roles:["workshop"],
        children:[
          {id:"wsstatement", icon:"📄",label:t.wsStatement,    roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wsreport",    icon:"📊",label:t.wsReport,       roles:["workshop"], wsRoles:["main","manager"]},
          {id:"wsprofile",   icon:"⚙️",label:t.wsSettings,     roles:["workshop"], wsRoles:["main"]},
        ]
      },
    ]:[]),
    {
      id:"grp_sales", icon:"🛒", label:t.grpSales, roles:["admin","manager","shipper","customer","workshop"],
      badge: pendingCnt,
      children:[
        {id:"shop",icon:"🛒",label:t.shop,roles:["admin","customer","workshop"]},
        {id:"picking",icon:"🔍",label:t.picking,roles:["admin","shipper"],badge:pendingCnt},
        {id:"orders",icon:"📋",label:t.orders,roles:["admin","shipper"]},
        {id:"myorders",icon:"📦",label:t.myOrders,roles:["customer"]},
        {id:"salesInvoices",icon:"🧾",label:t.salesInvoices,roles:["admin","manager"]},
        {id:"customerReturns",icon:"↩️",label:t.customerReturns,roles:["admin","manager"]},
        {id:"customers",icon:"👥",label:t.customers,roles:["admin"]},
        {id:"customerqueries",icon:"💬",label:t.customerQueries,roles:["admin"],badge:pendingCQ},
        {id:"myqueries",icon:"💬",label:t.myQueries,roles:["customer"]},
      ]
    },
    {
      id:"grp_reports", icon:"📊", label:t.grpReports, roles:["admin"],
      children:[
        {id:"reports",icon:"📊",label:t.reports,roles:["admin"]},
        {id:"payments",icon:"💳",label:t.payments,roles:["admin"]},
      ]
    },
    {
      id:"grp_system", icon:"⚙️", label:t.grpSystem, roles:["admin"],
      children:[
        {id:"vehicles",icon:"🚗",label:t.vehicleMgmt||"Vehicles",roles:["admin"]},
        {id:"settings",icon:"⚙️",label:t.settings,roles:["admin"]},
        {id:"users",icon:"🔑",label:t.users,roles:["admin"]},
      ]
    },
  ].filter(g=>g.roles.includes(role)).map(g=>({
    ...g,
    children:g.children.filter(c=>c.roles.includes(role)&&(!c.wsRoles||role!=="workshop"||c.wsRoles.includes(wsRole)))
  })).filter(g=>g.children.length>0);

  // Flat list for mobile nav — role-based
  const mobileNav=(()=>{
    if(role==="customer") return [
      {id:"shop",    icon:"🛒",label:t.shop},
      {id:"myorders",icon:"📦",label:t.myOrders},
      {id:"myqueries",icon:"💬",label:t.myQueries},
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
    if(role==="workshop"&&wsRole==="mechanic") return [
      {id:"workshop",    icon:"🔧",label:"Jobs"},
    ];
    if(role==="workshop") return [
      {id:"workshop",    icon:"🔧",label:"Jobs"},
      {id:"wscustomers", icon:"👥",label:"WS Customers"},
      {id:"wsquotations",icon:"📝",label:"Quotations"},
      {id:"wsinvoices",  icon:"🧾",label:"Invoices"},
      {id:"wspayments",  icon:"💳",label:"Payments"},
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

  // Demo: override nav to only inventory + shop
  if(isDemo){
    navGroups.length=0;
    navGroups.push(
      {id:"grp_demo",icon:"🛍️",label:"Demo",roles:["demo"],children:[
        {id:"inventory",icon:"📦",label:t.inventory,roles:["demo"]},
        {id:"shop",icon:"🛒",label:t.shop,roles:["demo"]},
      ]}
    );
  }

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
            <ShopLogo settings={wsDisplaySettings} size="md"/>
          </div>
          <div style={{fontSize:10,color:"var(--green)",marginTop:4}}>{`🟢 ${t.connected}`}</div>
          <div style={{display:"flex",gap:5,marginTop:9,justifyContent:"center"}}>
            {langs.map(l=>(
              <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                {l.flag||l.lang.toUpperCase()}
              </button>
            ))}
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
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={toggleTheme}>{theme==="dark"?"☀️ Light Mode":"🌙 Dark Mode"}</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={()=>openM("changePassword")}>🔑 Change Password</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={onLogout}>🚪 {t.logout}</button>
        </div>
      </aside>

      {/* SLIDE-IN DRAWER (mobile full nav) */}
      <div className={`drawer-backdrop${drawerOpen?" open":""}`} onClick={()=>setDrawerOpen(false)}/>
      <div className={`drawer${drawerOpen?" open":""}`}>
        {/* Drawer header */}
        <div style={{padding:"16px 16px 10px",borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <ShopLogo settings={wsDisplaySettings} size="md"/>
            <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:"var(--text3)",fontSize:20,cursor:"pointer",padding:4}}>✕</button>
          </div>
          <div style={{background:"var(--surface2)",borderRadius:9,padding:"8px 10px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:ROLES[role]?.bg,border:`1.5px solid ${ROLES[role]?.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{ROLES[role]?.icon}</div>
              <div><div style={{fontSize:13,fontWeight:600}}>{user.name||user.username}</div><span className="badge" style={{background:ROLES[role]?.bg,color:ROLES[role]?.color,fontSize:10,padding:"1px 7px"}}>{t[role]||role}</span></div>
            </div>
          </div>
          <div style={{display:"flex",gap:5,justifyContent:"center"}}>
            {langs.map(l=>(
              <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                {l.flag||l.lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {/* Drawer nav groups */}
        <nav style={{flex:1,padding:"8px 6px",overflowY:"auto"}}>
          {navGroups.map(g=>{
            const hasActive=g.children.find(c=>c.id===tab);
            return (
              <div key={g.id} style={{marginBottom:2}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".07em",padding:"8px 10px 4px"}}>{g.icon} {g.label}</div>
                {g.children.map(n=>(
                  <button key={n.id} onClick={()=>{setTab(n.id);setDrawerOpen(false);}}
                    style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"10px 12px",background:tab===n.id?"var(--surface3)":"none",border:"none",borderRadius:9,color:tab===n.id?"var(--accent)":"var(--text2)",cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:tab===n.id?700:400,marginBottom:2,textAlign:"left",position:"relative"}}>
                    <span style={{fontSize:16}}>{n.icon}</span>
                    <span style={{flex:1}}>{n.label}</span>
                    {(n.badge||0)>0&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:99,minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,padding:"0 5px"}}>{n.badge}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        {/* Drawer footer */}
        <div style={{padding:"10px 10px 16px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
          {(role==="admin"||role==="customer")&&(
            <button className="btn btn-primary btn-sm" style={{width:"100%"}} onClick={()=>{openM("checkout");setDrawerOpen(false);}}>
              🛒 {t.cart} {cartCount>0&&<span style={{background:"rgba(255,255,255,.25)",borderRadius:99,padding:"1px 7px",fontSize:11}}>{cartCount}</span>}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={toggleTheme}>{theme==="dark"?"☀️ Light Mode":"🌙 Dark Mode"}</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={()=>{openM("changePassword");setDrawerOpen(false);}}>🔑 Change Password</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12,color:"var(--red)"}} onClick={onLogout}>🚪 {t.logout}</button>
        </div>
      </div>

      {/* WS MORE SHEET — workshop mobile app style bottom sheet */}
      {role==="workshop"&&(()=>{
        // Grouped sections for mobile more-sheet
        const moreSections=[
          {
            label:t.grpWorkshop||"Jobs",
            items:[
              {id:"shop",        icon:"🛒", label:t.shop||"Shop"},
              ...(wsRole!=="mechanic"?[
                {id:"wspayments", icon:"💳", label:t.wsPayments||"Payments"},
              ]:[]),
            ]
          },
          ...(wsRole!=="mechanic"?[{
            label:t.wsProcurement,
            items:[
              {id:"wssuppliers",icon:"🏪", label:t.wsSuppliers||"Suppliers"},
              {id:"wssuporders",icon:"📋", label:t.wsPurchaseOrders||"Purchase Orders"},
              {id:"wssupinv",   icon:"🧾", label:t.wsSupInvoices},
            ]
          },{
            label:t.wsStockGroup,
            items:[
              {id:"wsstock",    icon:"📦", label:t.wsStock||"Stock"},
              {id:"wstransfer", icon:"🔄", label:t.wsTransfer||"Transfer"},
              {id:"wsservices", icon:"🔧", label:t.wsServices||"Services"},
            ]
          },{
            label:t.wsAdmin,
            items:[
              {id:"wsstatement",icon:"📄", label:t.wsStatement||"Statement"},
              {id:"wsreport",   icon:"📊", label:t.wsReport||"Report"},
              ...(wsRole==="main"?[{id:"wsprofile",icon:"⚙️",label:t.wsSettings||"Settings"}]:[]),
            ]
          }]:[]),
        ];
        const moreItems=moreSections.flatMap(s=>s.items);
        return (
          <>
            <div className={`drawer-backdrop${wsMoreOpen?" open":""}`} style={{zIndex:205}} onClick={()=>setWsMoreOpen(false)}/>
            <div className={`ws-more-sheet${wsMoreOpen?" open":""}`} style={{zIndex:206}}>
              <div className="ws-more-handle"><span/></div>
              {/* User info row */}
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 16px 12px",borderBottom:"1px solid var(--border)"}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:ROLES[role]?.bg,border:`2px solid ${ROLES[role]?.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{ROLES[role]?.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{user.name||user.username}</div>
                  <span className="badge" style={{background:ROLES[role]?.bg,color:ROLES[role]?.color,fontSize:10,padding:"1px 8px"}}>{wsRole}</span>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {langs.map(l=>(
                    <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                      {l.flag||l.lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {/* Grouped nav sections */}
              {moreSections.map(sec=>(
                <div key={sec.label}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--text3)",padding:"10px 14px 4px"}}>{sec.label}</div>
                  <div className="ws-more-grid" style={{paddingTop:0}}>
                    {sec.items.map(n=>(
                      <button key={n.id} className={`ws-more-item${tab===n.id?" on":""}`} onClick={()=>{setTab(n.id);setWsMoreOpen(false);}}>
                        <span style={{fontSize:24,lineHeight:1}}>{n.icon}</span>
                        <span>{n.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="ws-more-sep"/>
              {/* Action buttons */}
              <div className="ws-more-actions">
                <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:12}} onClick={toggleTheme}>{theme==="dark"?"☀️ Light":"🌙 Dark"}</button>
                <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:12}} onClick={()=>{openM("changePassword");setWsMoreOpen(false);}}>🔑 {t.changePassword||"Password"}</button>
                <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:12,color:"var(--red)"}} onClick={onLogout}>🚪 {t.logout||"Logout"}</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* MOBILE NAV — role-based flat nav */}
      <nav className="mobile-nav">
        {role==="workshop" ? (
          <>
            {/* Workshop: app-style bottom tabs — no hamburger */}
            {wsRole==="mechanic" ? (
              <button className={`mob-nav-btn ${tab==="workshop"?"on":""}`} onClick={()=>setTab("workshop")} style={{position:"relative"}}>
                <span className="mi">🔧</span>
                <span style={{fontSize:9,marginTop:2}}>Jobs</span>
              </button>
            ) : (
              [{id:"workshop",icon:"🔧",label:"Jobs"},{id:"wscustomers",icon:"👥",label:"Customers"},{id:"wsquotations",icon:"📝",label:"Quotes"},{id:"wsinvoices",icon:"🧾",label:"Invoices"}].map(n=>(
                <button key={n.id} className={`mob-nav-btn ${tab===n.id?"on":""}`} onClick={()=>setTab(n.id)} style={{position:"relative"}}>
                  <span className="mi">{n.icon}</span>
                  <span style={{fontSize:9,marginTop:2}}>{n.label}</span>
                </button>
              ))
            )}
            {/* More button — opens bottom sheet */}
            <button className={`mob-nav-btn ${wsMoreOpen?"on":""}`} onClick={()=>setWsMoreOpen(true)} style={{position:"relative"}}>
              <span className="mi" style={{fontWeight:700,letterSpacing:1}}>···</span>
              <span style={{fontSize:9,marginTop:2}}>More</span>
            </button>
          </>
        ) : (
          <>
            {/* Non-workshop: hamburger + flat tabs */}
            <button className="mob-nav-btn" onClick={()=>setDrawerOpen(true)} style={{position:"relative"}}>
              {pendingCQ+pendingInq+pendingCnt>0&&<span className="mob-badge">{pendingCQ+pendingInq+pendingCnt}</span>}
              <span className="mi">☰</span>
              <span style={{fontSize:9,marginTop:2}}>Menu</span>
            </button>
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
          </>
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
              <select className="inp" value={filterFits} onChange={e=>setFilterFits(e.target.value)} style={{width:150,
                borderColor:filterFits!=="__all__"?"var(--accent)":undefined,
                color:filterFits==="none"?"var(--red)":filterFits==="has"?"var(--blue)":undefined}}>
                <option value="__all__">🚗 All Fits</option>
                <option value="none">❌ No fitment</option>
                <option value="has">✅ Has fitment</option>
              </select>
              {(searchPart||filterCat!=="__all__"||filterLow||filterFits!=="__all__")&&(
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchPart("");setFilterCat("__all__");setFilterLow(false);setFilterFits("__all__");}} style={{color:"var(--accent)",whiteSpace:"nowrap",border:"1px solid rgba(249,115,22,.3)"}}>✕ Clear all</button>
              )}
            </div>
            {filterFits==="none"&&(
              <div style={{fontSize:12,color:"var(--red)",marginBottom:10,background:"rgba(248,113,113,.08)",borderRadius:8,padding:"6px 10px"}}>
                ❌ {fp.length} part{fp.length!==1?"s":""} with no vehicle fitment — open each and add fits in the <strong>Fits</strong> tab
              </div>
            )}
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
                    {["",t.sku,`${t.name} / ${t.chineseDesc}`,"Bin",t.make,t.model,t.yearRange,t.oeNumber,t.category,t.price,"Cost","St"].map(h=><th key={h}>{h}</th>)}
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
                          <td style={{fontFamily:"Rajdhani,sans-serif",fontSize:13,color:"var(--text3)"}}>{p.cost_price>0?fmtAmt(p.cost_price):"—"}</td>
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
            onSelectQuote={selectRfqQuote} onUnselectQuote={unselectRfqQuote}
            onUnselectAll={unselectAllRfq} onRefresh={loadAll}
            onCreatePO={createPOFromRfq}
            onEditPart={(p)=>{if(p)openM("editPart",p);}}
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
            <PH title={`🔀 ${t.stockMove}`} subtitle={`${stockMoves.length} ${t.smMoves}`}
              action={<button className="btn btn-primary" onClick={()=>openM("stockMove",null)}>+ {t.smNewMove}</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{[t.date,t.rptPart,t.sku,t.fromBin,t.toBin,t.qty,t.by,t.reason].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
                {stockMoves.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.smNoMoves}</div>}
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
                {isDemo
                  ? <span style={{marginLeft:"auto",flexShrink:0,fontSize:12,color:"var(--text3)",padding:"6px 12px",border:"1px solid var(--border)",borderRadius:8}}>🔒 Demo — orders disabled</span>
                  : <button className="btn btn-primary" style={{marginLeft:"auto",flexShrink:0}}
                      onClick={()=>openM("checkout")}>
                      🛒 {cartCount>0?`(${cartCount}) `:""}Checkout{cartTotal>0?` · ${fmtAmt(cartTotal)}`:""}
                    </button>
                }
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
                      {isDemo
                        ? <button className="btn btn-ghost" style={{width:"100%",fontSize:12,color:"var(--text3)"}} disabled>🔒 Demo</button>
                        : inCart
                          ? <div style={{display:"flex",alignItems:"center",gap:7}}><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty-1)}>−</button><span style={{flex:1,textAlign:"center",fontWeight:700,fontSize:16}}>{inCart.qty}</span><button className="btn btn-ghost btn-xs" style={{padding:"6px 12px"}} onClick={()=>qtyCart(p.id,inCart.qty+1)}>+</button><button className="btn btn-danger btn-xs" onClick={()=>removeFromCart(p.id)}>✕</button></div>
                          : <button className="btn btn-primary" style={{width:"100%"}} disabled={p.stock===0} onClick={()=>addToCart(p)}>{t.addToCart}</button>}
                      <button className="btn btn-ghost btn-sm" style={{width:"100%",marginTop:6,fontSize:12,borderColor:"var(--blue)",color:"var(--blue)"}} onClick={()=>openM("customerQuery",p)}>
                        🔍 {t.queryPriceQty}
                      </button>
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
                            {(inv.total===0||!inv.total)&&inv.status!=="paid"&&<button className="btn btn-danger btn-xs" onClick={()=>deleteSupplierInvoice(inv.id)}>🗑 Delete</button>}
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
            <PH title={`↩️ ${t.supplierReturns}`} subtitle={`${supplierReturns.length} ${t.srReturns}`}
              action={<button className="btn btn-primary" onClick={()=>openM("supplierReturn",{isNew:true})}>+ {t.srNewReturn}</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{[t.srReturnNo,t.supplier,t.date,t.srOrigInvoice,t.total,t.status,t.reason].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
                {supplierReturns.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.srNoSupRet}</div>}
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
            <PH title={`↩️ ${t.customerReturns}`} subtitle={`${customerReturns.length} ${t.srReturns}`}
              action={<button className="btn btn-primary" onClick={()=>openM("customerReturn",{isNew:true})}>+ {t.srNewReturn}</button>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{[t.srReturnNo,t.customer,t.date,t.invoice,t.total,t.status,t.reason].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
                {customerReturns.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.srNoCusRet}</div>}
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
        {tab==="inquiries"&&role==="admin"&&(()=>{
          const inqReplied=inquiries.filter(i=>i.status==="replied").length;
          const inqOrdered=inquiries.filter(i=>i.status==="ordered").length;
          const filteredInq=inqFilter==="all"?inquiries:inquiries.filter(i=>i.status===inqFilter);
          return (
          <div className="fu">
            <PH title={`📩 ${t.inquiries}`} subtitle={`${inquiries.length} total`}/>
            {/* Pipeline summary */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              {[
                {label:"Pending",val:pendingInq,color:"var(--yellow)",icon:"⏳",key:"pending"},
                {label:"Replied",val:inqReplied,color:"var(--blue)",icon:"💬",key:"replied"},
                {label:"Ordered",val:inqOrdered,color:"var(--green)",icon:"✅",key:"ordered"},
                {label:"All",val:inquiries.length,color:"var(--text2)",icon:"📋",key:"all"},
              ].map(s=>(
                <div key={s.key} onClick={()=>setInqFilter(s.key)} style={{cursor:"pointer",background:inqFilter===s.key?"var(--surface3)":"var(--surface2)",borderRadius:10,padding:"10px 18px",border:`1px solid ${inqFilter===s.key?"var(--accent)":"var(--border)"}`,display:"flex",alignItems:"center",gap:8,minWidth:100}}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <div><div style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",color:s.color}}>{s.val}</div><div style={{fontSize:11,color:"var(--text3)"}}>{s.label}</div></div>
                </div>
              ))}
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["Part","Supplier","Qty",t.status,"Reply Price","Stock","Supp Part#","Date","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredInq.map(inq=>{
                      const replyUrl=`${window.location.origin}${window.location.pathname}?rfq=${inq.rfq_token}`;
                      const waMsg=`${inq.message||`RFQ for ${inq.part_name} (${inq.part_sku||""}) - Qty: ${inq.qty_requested}`}\n\n📎 Submit quote here (no login needed):\n${replyUrl}`;
                      return (
                      <tr key={inq.id} style={{opacity:inq.status==="closed"?0.5:1}}>
                        <td><div style={{fontWeight:600}}>{inq.part_name}</div><div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{inq.part_sku||""}</div></td>
                        <td>
                          <div style={{fontWeight:600,fontSize:13}}>{inq.supplier_name}</div>
                          <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                            {inq.supplier_phone&&<a href={`https://wa.me/${(inq.supplier_phone||"").replace(/[^0-9]/g,"")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener noreferrer"><span style={{fontSize:10,color:"#25D366",background:"rgba(37,211,102,.1)",borderRadius:4,padding:"1px 5px"}}>📲 WA</span></a>}
                            {inq.supplier_email&&<a href={`mailto:${inq.supplier_email}?subject=RFQ - ${inq.part_name}&body=${encodeURIComponent(waMsg)}`}><span style={{fontSize:10,color:"var(--blue)",background:"rgba(96,165,250,.1)",borderRadius:4,padding:"1px 5px"}}>✉ Email</span></a>}
                          </div>
                        </td>
                        <td style={{textAlign:"center",fontWeight:700}}>{inq.qty_requested}</td>
                        <td><StatusBadge status={inq.status}/></td>
                        <td style={{fontWeight:700,color:inq.reply_price?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{inq.reply_price?fmtAmt(inq.reply_price):"—"}</td>
                        <td style={{color:inq.reply_stock?"var(--text)":"var(--text3)"}}>{inq.reply_stock??("—")}</td>
                        <td style={{fontFamily:"DM Mono,monospace",fontSize:12,color:inq.supplier_part_no?"var(--green)":"var(--text3)"}}>{inq.supplier_part_no||"—"}</td>
                        <td style={{color:"var(--text3)",fontSize:12,whiteSpace:"nowrap"}}>{inq.created_at?.slice(0,10)}</td>
                        <td>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("inquiryDetail",inq)}>View</button>
                            {inq.status==="pending"&&<><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}} onClick={()=>{navigator.clipboard.writeText(replyUrl);showToast("Link copied!");}}>🔗 Copy</button><a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a></>}
                            {inq.status==="replied"&&<button className="btn btn-success btn-xs" onClick={()=>acceptInquiry(inq)}>✅ Accept</button>}
                            {inq.status!=="closed"&&inq.status!=="ordered"&&<button className="btn btn-danger btn-xs" onClick={()=>updateInquiry(inq.id,{status:"closed"})}>✕</button>}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredInq.length===0&&<div style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No {inqFilter==="all"?"":""+inqFilter+" "}inquiries</div>}
              </div>
            </div>
          </div>
          );
        })()}

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
            <PH title={`📝 ${t.logs}`} subtitle={`${filteredLogs.length}${logQ?` of ${logs.length}`:""} ${t.records}`}/>
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
                  <thead><tr>{[t.time,t.rptPart,t.action,t.before,t.after,t.change,t.by,t.reason].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
              action={<div style={{display:"flex",gap:8}}><button className="btn btn-ghost" onClick={()=>openM("editUser",{role:"workshop",username:"",password:"",name:"",phone:"",email:""})}>🔧 Add Workshop</button><button className="btn btn-primary" onClick={()=>openM("editUser")}>+ Add User</button></div>}/>
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
            <PH title={`🌍 ${t.loginLogs}`} subtitle={`${loginLogs.length} ${t.llEvents}`}/>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
              {Object.entries(loginLogs.reduce((a,l)=>{const c=l.country||"?";a[c]=(a[c]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,n])=>(
                <span key={c} className="badge" style={{background:"var(--surface2)",color:"var(--text2)",padding:"5px 13px",fontSize:13}}>{c} · {n}</span>
              ))}
            </div>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{[t.time,t.user,t.role,t.country,t.city,"IP",t.status].map(h=><th key={h}>{h}</th>)}</tr></thead>
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
        {/* Subscription expired block */}
        {role==="workshop"&&subStatus?.expired&&(
          <WsSubscriptionExpiredPage expiresAt={subStatus.expiresAt} onLogout={()=>{setUser(null);setTab("workshop");setSubStatus(null);}} settings={wsDisplaySettings}/>
        )}
        {tab==="wsprofile"&&role==="workshop"&&!subStatus?.expired&&(
          <WorkshopProfilePage profile={workshopProfile} onSave={saveWorkshopProfile} wsRole={wsRole} wsId={wsId}/>
        )}
        {tab==="wssubscriptions"&&role==="admin"&&(
          <WsSubscriptionsPage settings={settings}/>
        )}

        {["workshop","wscustomers","wsquotations","wsinvoices","wspayments","wsstock","wsservices","wssuppliers","wssuporders","wssupinv","wstransfer","wsstatement","wsreport"].includes(tab)&&(role==="admin"||role==="manager"||(role==="workshop"&&!subStatus?.expired))&&(
          <WorkshopPage
            key={tab}
            initialTab={tab==="workshop"?"jobs":tab==="wscustomers"?"customers":tab==="wsquotations"?"quotations":tab==="wsinvoices"?"invoices":tab==="wspayments"?"payments":tab==="wsstock"?"wsstock":tab==="wsservices"?"wsservices":tab==="wssuppliers"?"wssuppliers":tab==="wssuporders"?"wssuporders":tab==="wssupinv"?"wssupinv":tab==="wstransfer"?"wstransfer":tab==="wsstatement"?"statement":"report"}
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
            settings={wsDisplaySettings}
            onSaveJob={saveWorkshopJob}
            onDeleteJob={deleteWorkshopJob}
            onMoveJob={moveWorkshopJob}
            onSaveItem={saveJobItem}
            onDeleteItem={deleteJobItem}
            onSaveInvoice={saveWorkshopInvoice}
            onUpdateInvoice={updateWorkshopInvoice}
            onDeleteInvoice={deleteWorkshopInvoice}
            onSaveQuote={saveWorkshopQuote}
            onDeleteQuote={deleteWorkshopQuote}
            onConvertQuoteToInvoice={convertQuoteToInvoice}
            onSendQuoteForApproval={sendQuoteForApproval}
            suppliers={suppliers}
            wsSuppliers={workshopSuppliers}
            wsSupplierRequests={wsSupplierRequests}
            wsSupplierQuotes={wsSupplierQuotes}
            wsSupplierInvoices={wsSupplierInvoices}
            wsSupplierInvItems={wsSupplierInvItems}
            wsSupplierPayments={wsSupplierPayments}
            wsSupplierReturns={wsSupplierReturns}
            onSaveWsSupplier={saveWsSupplier}
            onDeleteWsSupplier={deleteWsSupplier}
            onSaveWsSupplierRequest={saveWsSupplierRequest}
            onDeleteWsSupplierRequest={deleteWsSupplierRequest}
            onSaveWsSupplierQuote={saveWsSupplierQuote}
            onSaveWsSupplierInvoice={saveWsSupplierInvoice}
            onDeleteWsSupplierInvoice={deleteWsSupplierInvoice}
            onSaveWsSupplierPayment={saveWsSupplierPayment}
            onDeleteWsSupplierPayment={deleteWsSupplierPayment}
            onSaveWsSupplierReturn={saveWsSupplierReturn}
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
            wsDocs={workshopDocuments}
            onSaveWsDoc={saveWsDocument}
            onDeleteWsDoc={deleteWsDocument}
            parts={parts}
            wsRole={wsRole}
            wsId={wsId}
            wsProfiles={allWsProfiles}
            wsSqReplies={wsSqReplies}
            wsPurchaseOrders={wsPurchaseOrders}
            wsPoItems={wsPoItems}
            onGenerateWsQuoteLink={generateWsSupplierQuoteLink}
            onSaveWsPurchaseOrder={saveWsPurchaseOrder}
            onDeleteWsPurchaseOrder={deleteWsPurchaseOrder}
            onReceiveWsPurchaseOrder={receiveWsPurchaseOrder}
            wsLicenceRenewals={wsLicenceRenewals}
            onSaveWsLicenceRenewal={saveWsLicenceRenewal}
            onUpdateWsLicenceRenewal={updateWsLicenceRenewal}
            wsProfile={workshopProfile}
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

        {/* ── CUSTOMER QUERIES (admin) ── */}
        {tab==="customerqueries"&&(
          <div className="fu">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
              <div>
                <h1 style={{fontSize:20,fontWeight:700}}>{t.customerQueries}</h1>
                <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{pendingCQ} pending · {customerQueries.length} total</p>
              </div>
            </div>
            {customerQueries.length===0
              ? <div style={{textAlign:"center",padding:60,color:"var(--text3)"}}>{t.noQueries}</div>
              : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {customerQueries.map(q=>{
                    const statusColor=q.status==="pending"?"var(--yellow)":q.status==="replied"?"var(--blue)":q.status==="deposit_requested"?"var(--accent)":q.status==="deposit_paid"?"var(--green)":"var(--text3)";
                    const statusLabel=q.status==="pending"?"⏳ Pending":q.status==="replied"?"✅ Replied":q.status==="deposit_requested"?"💰 Deposit Requested":q.status==="deposit_paid"?"✅ Deposit Paid":"—";
                    return (
                      <div key={q.id} className="card" style={{padding:16,borderLeft:`3px solid ${statusColor}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              <span style={{fontWeight:700,fontSize:15}}>{q.part_name}</span>
                              {q.part_sku&&<span style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</span>}
                              <span style={{fontSize:11,fontWeight:600,color:statusColor,background:statusColor+"18",padding:"2px 8px",borderRadius:99}}>{statusLabel}</span>
                            </div>
                            <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13,color:"var(--text2)",marginBottom:4}}>
                              <span>👤 {q.customer_name}</span>
                              <span>📞 {q.customer_phone}</span>
                              {q.customer_email&&<span>✉ {q.customer_email}</span>}
                              <span>🔢 Qty: <strong>{q.qty_requested}</strong></span>
                            </div>
                            {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginBottom:4}}>"{q.notes}"</div>}
                            <div style={{fontSize:11,color:"var(--text3)"}}>{q.created_at?.slice(0,16)?.replace("T"," ")}</div>
                            {(q.confirmed_price||q.confirmed_qty||q.reply_notes)&&(
                              <div style={{marginTop:8,background:"var(--surface2)",borderRadius:8,padding:"8px 12px",fontSize:13}}>
                                <div style={{fontWeight:600,marginBottom:4,color:"var(--blue)"}}>📩 Reply:</div>
                                {q.confirmed_price&&<div>Price: <strong style={{color:"var(--accent)"}}>{fmtAmt(q.confirmed_price)}</strong> / unit</div>}
                                {q.confirmed_qty&&<div>Available: <strong>{q.confirmed_qty}</strong> units</div>}
                                {q.reply_notes&&<div style={{color:"var(--text2)",marginTop:4}}>{q.reply_notes}</div>}
                              </div>
                            )}
                            {q.deposit_amount&&(
                              <div style={{marginTop:8,background:"rgba(249,115,22,.08)",borderRadius:8,padding:"8px 12px",fontSize:13,border:"1px solid var(--accent)"}}>
                                <div style={{fontWeight:600,marginBottom:4,color:"var(--accent)"}}>💰 Deposit Required: <strong>{fmtAmt(q.deposit_amount)}</strong></div>
                                {q.deposit_note&&<div style={{color:"var(--text2)",fontSize:12}}>{q.deposit_note}</div>}
                              </div>
                            )}
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                            <button className="btn btn-primary btn-sm" onClick={()=>openM("queryReply",q)}>
                              {q.status==="pending"?"📝 Reply":"✏️ Edit Reply"}
                            </button>
                            {q.status==="deposit_requested"&&(
                              <button className="btn btn-ghost btn-sm" style={{color:"var(--green)",borderColor:"var(--green)"}} onClick={()=>markDepositPaid(q.id)}>
                                ✅ {t.depositPaid}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* ── MY QUERIES (customer) ── */}
        {tab==="myqueries"&&(()=>{
          const myQ=customerQueries.filter(q=>q.customer_phone===user.phone||q.customer_name===user.name||q.customer_email===user.email);
          return (
            <div className="fu">
              <div style={{marginBottom:18}}>
                <h1 style={{fontSize:20,fontWeight:700}}>{t.myQueries}</h1>
                <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{myQ.length} {lang==="zh"?"筆詢問":"queries"}</p>
              </div>
              {myQ.length===0
                ? <div style={{textAlign:"center",padding:60,color:"var(--text3)"}}>{t.noQueries}<br/><span style={{fontSize:13,marginTop:8,display:"block"}}>Use the 🔍 button in the shop to ask about price and availability.</span></div>
                : (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {myQ.map(q=>{
                      const statusColor=q.status==="pending"?"var(--yellow)":q.status==="replied"?"var(--blue)":q.status==="deposit_requested"?"var(--accent)":q.status==="deposit_paid"?"var(--green)":"var(--text3)";
                      const statusLabel=q.status==="pending"?(lang==="zh"?"⏳ 等待回覆":"⏳ Awaiting Reply"):q.status==="replied"?(lang==="zh"?"✅ 已回覆":"✅ Replied"):q.status==="deposit_requested"?(lang==="zh"?"💰 需付訂金":"💰 Deposit Required"):q.status==="deposit_paid"?(lang==="zh"?"✅ 訂金已付":"✅ Deposit Paid"):"—";
                      return (
                        <div key={q.id} className="card" style={{padding:16,borderLeft:`3px solid ${statusColor}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <span style={{fontWeight:700,fontSize:15}}>{q.part_name}</span>
                            {q.part_sku&&<span style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</span>}
                            <span style={{fontSize:11,fontWeight:600,color:statusColor,background:statusColor+"18",padding:"2px 8px",borderRadius:99}}>{statusLabel}</span>
                          </div>
                          <div style={{fontSize:13,color:"var(--text2)",marginBottom:4}}>
                            Qty requested: <strong>{q.qty_requested}</strong> · {q.created_at?.slice(0,10)}
                          </div>
                          {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginBottom:8}}>"{q.notes}"</div>}
                          {(q.confirmed_price||q.confirmed_qty||q.reply_notes)&&(
                            <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 14px",fontSize:13,marginTop:8}}>
                              <div style={{fontWeight:600,marginBottom:6,color:"var(--blue)"}}>📩 {lang==="zh"?"商家回覆":"Shop Reply"}</div>
                              {q.confirmed_price&&<div style={{marginBottom:4}}>{lang==="zh"?"確認單價":"Confirmed Price"}: <strong style={{color:"var(--accent)",fontSize:16}}>{fmtAmt(q.confirmed_price)}</strong></div>}
                              {q.confirmed_qty&&<div style={{marginBottom:4}}>{lang==="zh"?"可供數量":"Available Qty"}: <strong>{q.confirmed_qty}</strong></div>}
                              {q.reply_notes&&<div style={{color:"var(--text2)",marginTop:6,lineHeight:1.5}}>{q.reply_notes}</div>}
                            </div>
                          )}
                          {q.deposit_amount&&(
                            <div style={{marginTop:8,background:"rgba(249,115,22,.1)",borderRadius:8,padding:"12px 14px",border:"1px solid var(--accent)"}}>
                              <div style={{fontWeight:700,color:"var(--accent)",marginBottom:4}}>💰 {lang==="zh"?"訂金要求":"Deposit Required"}: {fmtAmt(q.deposit_amount)}</div>
                              {q.deposit_note&&<div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>{q.deposit_note}</div>}
                              {q.status==="deposit_paid"&&<div style={{marginTop:6,color:"var(--green)",fontWeight:600}}>✅ {lang==="zh"?"訂金已收到":"Deposit received — order confirmed!"}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          );
        })()}

      </main>

      {/* ════ MODALS ════ */}
      {isOpen("editPart")&&<PartModal part={mData("editPart")} vehicles={vehicles} partFitments={partFitments} onSaveFitment={saveFitment} onDeleteFitment={deleteFitment} onSave={savePart} onGoVehicles={()=>{closeM("editPart");setTab("vehicles");}} inquiries={inquiries} rfqQuotes={rfqQuotes} rfqItems={rfqItems} rfqSessions={rfqSessions} onClose={()=>{
  const ep=mData("editPart"); if(ep?.id) releaseLock("part",ep.id);
  closeM("editPart");
}} t={t}/>}
      {isOpen("adjust")&&<AdjustModal part={mData("adjust")} onApply={applyAdjust} onClose={()=>closeM("adjust")} t={t}/>}
      {isOpen("editSupplier")&&<SupplierModal supplier={mData("editSupplier")} onSave={saveSupplier} onClose={()=>closeM("editSupplier")} t={t}/>}
      {isOpen("partSupplier")&&<PartSupplierModal part={mData("partSupplier")} partSuppliers={getPartSupps(mData("partSupplier")?.id)} suppliers={suppliers} onSave={savePartSupplier} onDelete={deletePartSupplier} onUpdate={updatePartSupplier} onClose={()=>closeM("partSupplier")} t={t}/>}
      {isOpen("inquiry")&&<InquiryModal part={mData("inquiry")} suppliers={suppliers} partSuppliers={getPartSupps(mData("inquiry")?.id)} onSend={sendInquiry} onClose={()=>closeM("inquiry")} t={t}/>}
      {isOpen("inquiryDetail")&&<InquiryDetailModal inquiry={mData("inquiryDetail")} onUpdate={updateInquiry} onAccept={async(inq)=>{closeM("inquiryDetail");await acceptInquiry(inq);}} onClose={()=>closeM("inquiryDetail")} settings={settings} t={t}/>}
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
      {isOpen("customerQuery")&&<CustomerQueryModal part={mData("customerQuery")} currentUser={user} onSubmit={submitCustomerQuery} onClose={()=>closeM("customerQuery")} t={t}/>}
      {isOpen("queryReply")&&<CustomerQueryReplyModal query={mData("queryReply")} onReply={replyToQuery} onClose={()=>closeM("queryReply")} t={t} settings={settings}
        onGoInventory={()=>{
          const q=mData("queryReply"); closeM("queryReply"); setTab("inventory");
          if(q?.part_id){const p=parts.find(pt=>pt.id===q.part_id||pt.id===+q.part_id); if(p) openM("editPart",p);}
        }}
        onGoRFQ={()=>{
          const q=mData("queryReply");
          const p=parts.find(pt=>pt.id===q?.part_id||pt.id===+q?.part_id);
          closeM("queryReply");
          if(p) openM("inquiry",p); else setTab("inquiries");
        }}
      />}

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
                <div style={{display:"flex",gap:6,marginTop:7}}>
                  <button className="btn btn-ghost btn-xs" onClick={()=>{navigator.clipboard.writeText(replyUrl);showToast("Link copied!");}}>📋 Copy Link</button>
                  <a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a>
                </div>
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

      {isOpen("changePassword")&&<ChangePasswordModal user={user} onClose={()=>closeM("changePassword")} showToast={showToast}/>}

      {showLocationSetup&&<WsLocationSetupModal
        profile={workshopProfile}
        onSave={async(city,country)=>{
          await saveWorkshopProfile({...workshopProfile,city,country});
          setShowLocationSetup(false);
          showToast("✅ Location saved");
        }}
        onClose={()=>setShowLocationSetup(false)}/>}

      {toast&&<div className="toast" style={{borderColor:toast.type==="err"?"rgba(248,113,113,.3)":"var(--border2)",color:toast.type==="err"?"var(--red)":"var(--green)"}}>
        {toast.type==="err"?"⚠":"✓"} {toast.msg}
      </div>}

      {isDemo&&<div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9999,background:"linear-gradient(90deg,#f59e0b,#f97316)",color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,letterSpacing:.3}}>
        🔒 Demo Mode — all data is read-only. Contact us to get your own account.
      </div>}
      {role==="workshop"&&subStatus&&!subStatus.expired&&subStatus.daysLeft<=7&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9998,background:"linear-gradient(90deg,#f97316,#ef4444)",color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,letterSpacing:.3}}>
          ⚠️ {subStatus.status==="trial"?"Free trial":"Subscription"} expires in <strong>{subStatus.daysLeft<=0?"today":subStatus.daysLeft===1?"1 day":`${subStatus.daysLeft} days`}</strong> ({subStatus.expiresAt}) — Contact admin to renew
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP PROFILE / SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════

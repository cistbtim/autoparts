import { useState, useEffect, useCallback, useRef } from "react";
import { api, setDemoMode } from "./lib/api.js";
import { getSettings, updateSettings, loadSettings, C, curSym } from "./lib/settings.js";
import { T, registerLang, getLangs, setCurrentLang, tSt } from "./lib/i18n.js";
import { toImgUrl, toSaveUrl, toLogoUrl, extractDriveId, stripCacheBuster, toFullUrl, today, fmtAmt, makeId, makeToken, detectGeoLocation, waLink, mailLink } from "./lib/helpers.js";
import { ROLES, BRANCH_ROLES, OC, CATS_EN, CATS_ZH, CAR_MAKES, DEFAULT_CATS, getCategories, TRIAL_DAYS, getSubInfo, canAccess } from "./lib/constants.js";
import { getDynamsoftReader, decodePDF417fromImage, parseLicenceDisc } from "./lib/barcode.js";
import { CSS } from "./styles.js";
import { ErrorBoundary, LogoSVG, ShopLogo, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox, AdBanner, AdGridCard } from "./components/shared.jsx";

import { WorkshopProfilePage, ScrapyardProfilePage, ChangePasswordModal, WsLocationSetupModal, WsSubscriptionExpiredPage, WsSubscriptionsPage, OrdersTable, LogoUploader, SettingsPage, LineItemEditor, InvTotals, SupplierInvoiceModal, ViewSupplierInvoiceModal, SupplierReturnModal, CustomerInvoiceModal, ViewCustomerInvoiceModal, CustomerReturnModal, PartActionsMenu, PartModal, AdjustModal, CheckoutModal, SupplierModal, PartSupplierModal, SupplierPartsModal, SupplierCatalogueModal, CustomerQueryModal, CustomerQueryReplyModal, InquiryModal, InquiryDetailModal, CustomerModal, UserModal, CustHistoryModal, PdfInvoiceModal, AddPaymentModal, ReportsPage, SalesmanStatementPage, StockMoveModal, StockTakePage, BranchesPage, PartRequestModal, PartRequestsPage, BranchStockModal, BranchProfilePage, BranchUsersPage, BranchTransferRequestsPage, PrintPartLabelModal, PrintShelfLabelModal, WorkshopRequestsPage, AdContractsPage, CatalogueImportModal, BulkImageImportModal, VehicleRequestsPage } from "./components/Modals.jsx";
import { RfqPage, PickingPage, PartPhotoUploader, VehicleFitmentTab, VehicleSearchBar, VehiclesPage, VehiclePhotoUploader } from "./components/RfqVehicles.jsx";
import { WorkshopPage } from "./components/Workshop.jsx";
import { SystemMapPage } from "./components/SystemMap.jsx";
import { RequestsKanbanPage } from "./components/RequestsKanban.jsx";
import db from "./lib/db.js";
import { SupplierImportModal } from "./components/SupplierImport.jsx";
import { PosPage } from "./components/Pos.jsx";
import { ScrapyardVehiclesPage, ScrapyardPartsPage, ScrapyardAdminPage, ScrapyardPartsAdminPage } from "./components/Scrapyard.jsx";
import { SyOrdersPage, SyCustomersPage, SyInvoicesPage, SyPickingPage, SyReturnsPage, SyGatePage, SyDashboardPage } from "./components/ScrapyardSales.jsx";
import { LoginPage, PaywallPage } from "./pages/LoginPage.jsx";
import { RfqReplyPage, RfqQuoteReplyPage, RfqBatchReplyPage, QuoteConfirmPage, WsSupplierQuoteReplyPage, WorkshopBookingPage, BranchRegPage, BranchActivatePage, BranchStockRequestConfirmPage, WorkshopRegisterPage } from "./pages/PublicPages.jsx";

// ── Trap browser back button so the page never goes blank ─────
if(window.history.state?.appLoaded !== true){
  window.history.replaceState({appLoaded:true},"");
  window.history.pushState({appLoaded:true},"");
}
window.addEventListener("popstate",()=>{
  window.history.pushState({appLoaded:true},"");
},{capture:true});

const APP_VERSION = "2.0.0.1";
const APP_UPDATE_DATE = __BUILD_DATE__;

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const [lang,setLang] = useState(localStorage.getItem("ap_lang")||"en");
  const _today = ()=>new Date().toISOString().slice(0,10);
  const _sessionValid = ()=>{
    try{return localStorage.getItem("ap_login_date")===_today();}catch{return false;}
  };
  const [user,setUser] = useState(()=>{
    try{
      if(!_sessionValid()){localStorage.removeItem("ap_user");localStorage.removeItem("ap_login_date");return null;}
      const s=localStorage.getItem("ap_user");return s?JSON.parse(s):null;
    }catch{return null;}
  });
  const handleLogin=(u)=>{api.cacheClearAll();setUser(u);try{localStorage.setItem("ap_user",JSON.stringify(u));localStorage.setItem("ap_login_date",_today());}catch{}};
  const handleLogout=()=>{setUser(null);localStorage.removeItem("ap_user");localStorage.removeItem("ap_login_date");db.parts.clear().catch(()=>{});db.workshopJobs.clear().catch(()=>{});db.workshopJobItems.clear().catch(()=>{});};
  const [settingsLoaded,setSettingsLoaded] = useState(false);
  const [availLangs,setAvailLangs] = useState(getLangs());
  useEffect(()=>{ document.documentElement.setAttribute("data-theme","light"); localStorage.removeItem("ap_theme"); },[]);
  // Force re-login if the calendar day changes while the app is open (e.g. left open overnight)
  useEffect(()=>{
    const check=()=>{if(user&&!_sessionValid()){setUser(null);localStorage.removeItem("ap_user");localStorage.removeItem("ap_login_date");}};
    document.addEventListener("visibilitychange",check);
    return()=>document.removeEventListener("visibilitychange",check);
  },[user]);
  const changeLang = (l)=>{setLang(l);localStorage.setItem("ap_lang",l);api.patch("settings","id",1,{default_lang:l}).catch(()=>{});};
  const t = T[lang] || T.en;

  useEffect(()=>{
    const init=async()=>{
      await loadSettings();
      const rows=await api.get("app_translations","active=eq.true&select=lang,name,flag,t,status_t").catch(()=>[]);
      if(Array.isArray(rows)) rows.forEach(r=>registerLang(r.lang,r.name,r.flag,r.t||{},r.status_t||{}));
      const loaded=getLangs();
      setAvailLangs(loaded);
      // Prefer localStorage; fall back to shop's saved default_lang; then English
      const storedLang=localStorage.getItem("ap_lang")||getSettings().default_lang||"en";
      if(!loaded.find(l=>l.lang===storedLang)) changeLang("en");
      else if(storedLang!==lang){ setLang(storedLang); localStorage.setItem("ap_lang",storedLang); }
      setSettingsLoaded(true);
    };
    init().catch(()=>setSettingsLoaded(true));
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
  const wsbooking = new URLSearchParams(window.location.search).get("wsbooking");
  if(wsbooking) return <WorkshopBookingPage token={wsbooking}/>;
  const branchReg = new URLSearchParams(window.location.search).get("branch_reg");
  if(branchReg) return <BranchRegPage/>;
  const activateBranch = new URLSearchParams(window.location.search).get("activate_branch");
  if(activateBranch) return <BranchActivatePage/>;
  const bsrConfirmToken = new URLSearchParams(window.location.search).get("bsr_confirm");
  if(bsrConfirmToken) return <BranchStockRequestConfirmPage token={bsrConfirmToken}/>;
  const wsRegToken = new URLSearchParams(window.location.search).get("ws_register");
  if(wsRegToken) return <WorkshopRegisterPage token={wsRegToken}/>;
  if(new URLSearchParams(window.location.search).get("sysmap")==="1") return(
    <div style={{minHeight:"100vh"}} data-theme={document.documentElement.getAttribute("data-theme")||"dark"}>
      <style>{CSS}</style>
      <SystemMapPage onNavigate={null}/>
    </div>
  );
  if(!settingsLoaded) return <div style={{background:"var(--bg)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{color:"var(--accent)",fontSize:15,fontWeight:600}}>⚙ Loading...</div></div>;
  const wsLoginOnly = !!new URLSearchParams(window.location.search).get("ws_login");
  if(!user) return <LoginPage onLogin={handleLogin} t={t} lang={lang} setLang={changeLang} loadedSettings={getSettings()} langs={availLangs} wsLoginOnly={wsLoginOnly}/>;
  if(!canAccess(user)) return <PaywallPage user={user} onLogout={handleLogout} lang={lang}/>;
  return <MainApp user={user} onLogout={handleLogout} t={t} lang={lang} setLang={changeLang} langs={availLangs}/>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
function MainApp({user,onLogout,t,lang,setLang,langs=[]}) {
  setCurrentLang(lang); // sync for tSt
  const role = user.role;
  const wsRole = user.wsRole || "main"; // workshop sub-role: "main" | "manager" | "mechanic"
  // workshop_id scopes all workshop data to this user's own records
  const wsId  = role==="workshop"  ? String(user.id) : null;
  const scrapId = (role==="scrapyard"||role==="scrapyard_admin") ? String(user.id) : null;
  const wsF  = wsId ? `&workshop_id=eq.${wsId}` : ""; // query filter
  const isBranchUser = BRANCH_ROLES.includes(role);
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth<768;
  const initTab = role==="customer"?"shop":role==="shipper"?"orders":role==="stockman"?"inventory":role==="manager"?"stocktake":role==="workshop"?"workshop":(role==="scrapyard"||role==="scrapyard_admin")?"sy_dashboard":role==="branch_picker"?"orders":role==="branch_salesman"?"pos":role==="branch_admin"?"requestsKanban":role==="branch_manager"?"requestsKanban":isBranchUser?"inventory":role==="demo"?"inventory":role==="admin"?"requestsKanban":"dashboard";
  const [tab,setTab] = useState(initTab);
  // Data
  const [pendingFitsCopy,setPendingFitsCopy]=useState(null); // partId to copy fitments from on next new-part save
  const [pendingVehicleIds,setPendingVehicleIds]=useState(null); // vehicle IDs to auto-link on next new-part save
  const [newPartInitialF,setNewPartInitialF]=useState(null); // prefill values for next new part form
  const [pendingCatalogueLink,setPendingCatalogueLink]=useState(null); // {supplier_id,supplier_part_no} to auto-link after new part save
  const [returnToCatalogue,setReturnToCatalogue]=useState(null); // supplier to reopen catalogue when user clicks back
  const [parts,setParts]=useState([]);
  const [orders,setOrders]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [users,setUsers]=useState([]);
  const [logs,setLogs]=useState([]);
  const [logSearch,setLogSearch]=useState("");
  const [loginLogs,setLoginLogs]=useState([]);
  const [adClicks,setAdClicks]=useState([]);
  const [adClicksLoading,setAdClicksLoading]=useState(false);
  const [trialRegs,setTrialRegs]=useState([]);
  const [trialRegsLoading,setTrialRegsLoading]=useState(false);
  const [loginLogsLoading,setLoginLogsLoading]=useState(false);
  const [confirmRefreshLogs,setConfirmRefreshLogs]=useState(false);
  const [selectedMapCountry,setSelectedMapCountry]=useState(null);
  const [selectedMapProvince,setSelectedMapProvince]=useState(null);
  const [selectedMapCity,setSelectedMapCity]=useState(null);
  const [adContracts,setAdContracts]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [supplierSearch,setSupplierSearch]=useState("");
  const [supplierOriginFilter,setSupplierOriginFilter]=useState("all");
  const [supplierTypeFilter,setSupplierTypeFilter]=useState([]);
  const [partSuppliers,setPartSuppliers]=useState([]);
  const [inquiries,setInquiries]=useState([]);
  const [customerQueries,setCustomerQueries]=useState([]);
  const [workshopFeedback,setWorkshopFeedback]=useState([]);
  const [supplierInvoices,setSupplierInvoices]=useState([]);
  const [customerInvoices,setCustomerInvoices]=useState([]);
  const [supplierReturns,setSupplierReturns]=useState([]);
  const [customerReturns,setCustomerReturns]=useState([]);
  const [vehicles,setVehicles]=useState([]);
  const [partFitments,setPartFitments]=useState([]);
  const [ads,setAds]=useState([]);
  // Ads whose linked contract (if any) hasn't expired or been cancelled
  const _today=new Date().toISOString().slice(0,10);
  const liveAds=ads.filter(a=>{
    if(!a.contract_id) return true;
    const c=adContracts.find(x=>String(x.id)===String(a.contract_id));
    if(!c) return true;
    if(c.status==="cancelled") return false;
    if(c.end_date&&c.end_date<_today) return false;
    return true;
  });
  const [payments,setPayments]=useState([]);
  const [rfqSessions,setRfqSessions]=useState([]);
  const [rfqItems,setRfqItems]=useState([]);
  const [rfqQuotes,setRfqQuotes]=useState([]);
  const [stockMoves,setStockMoves]=useState([]);
  const [stockTakes,setStockTakes]=useState([]);
  const [settings,setSettings]=useState(getSettings());
  const [branches,setBranches]=useState([]);
  const [currentBranch,setCurrentBranch]=useState(null); // null = all branches (admin); object = active branch
  const [partRequests,setPartRequests]=useState([]);
  const [vehicleRequests,setVehicleRequests]=useState([]);
  const [branchStock,setBranchStock]=useState([]);
  const [branchStockRequests,setBranchStockRequests]=useState([]);
  const [wsShopRequests,setWsShopRequests]=useState([]);
  const wsShopReqSeenRef=useRef(null);
  const [wsReadyPopup,setWsReadyPopup]=useState(null); // confirmed BSRs to show after invoice save
  // Sync settings state from _settings cache after it loads from DB
  useEffect(()=>{ setSettings({...getSettings()}); },[]);
  const [loading,setLoading]=useState(true);
  const [loadingItems,setLoadingItems]=useState([]);  // per-table timing for loading screen
  const [bgLoading,setBgLoading]=useState(0);         // count of background tables still fetching
  const [partsLoading,setPartsLoading]=useState(false); // true while background-fetching remaining parts pages
  const [cart,setCart]=useState([]);
  // Filters
  const [searchPart,setSearchPart]=useState("");
  const [searchDebounced,setSearchDebounced]=useState("");
  const [filterCat,setFilterCat]=useState("__all__");
  const [filterLow,setFilterLow]=useState(false);
  const [filterPendingReview,setFilterPendingReview]=useState(false);
  const [filterFits,setFilterFits]=useState("__all__"); // __all__ | none | has
  const [filterBranch,setFilterBranch]=useState("__all__"); // __all__ | "main" | branch_id
  const [filterQuantum,setFilterQuantum]=useState(false);
  const [filterInStock,setFilterInStock]=useState(false);
  const [filterNoPhoto,setFilterNoPhoto]=useState(false);
  const [filterSupplier,setFilterSupplier]=useState("__all__");
  const [invVehicleFilterIds,setInvVehicleFilterIds]=useState(null);
  const [invRefreshing,setInvRefreshing]=useState(false);
  const [filterHiace,setFilterHiace]=useState(false);
  const [branchMatchedOnly,setBranchMatchedOnly]=useState("matched"); // "matched"|"own"|"all"
  const [invPage,setInvPage]=useState(0);   // inventory page
  const [invSort,setInvSort]=useState("sku"); // "default"|"sku"
  const [invReport,setInvReport]=useState(null); // null | "quantum" | "hiace" | "others"
  const [activePicker,setActivePicker]=useState(null); // {userId, date} — inline expiry date picker in Users table
  const [shopPage,setShopPage]=useState(0); // shop page
  const [shopSort,setShopSort]=useState("sku"); // "default"|"sku"
  const PAGE_SIZE=20;
  const [filterOS,setFilterOS]=useState(role==="shipper"?"__active__":"__all__");
  const [vehicleFilterIds,setVehicleFilterIds]=useState(null);
  const [shopVehicleFilter,setShopVehicleFilter]=useState({make:"",model:""});
  const [vehiclesJumpMake,setVehiclesJumpMake]=useState(null);
  const [vehiclesJumpModel,setVehiclesJumpModel]=useState(null);
  const [workshopJobs,setWorkshopJobs]=useState([]);
  const [workshopJobItems,setWorkshopJobItems]=useState([]);
  const [workshopInvoices,setWorkshopInvoices]=useState([]);
  const [workshopQuotes,setWorkshopQuotes]=useState([]);
  const [workshopCustomers,setWorkshopCustomers]=useState([]);
  const [workshopVehicles,setWorkshopVehicles]=useState([]);
  const [workshopStock,setWorkshopStock]=useState([]);
  const [workshopServices,setWorkshopServices]=useState([]);
  const [workshopSuppliers,setWorkshopSuppliers]=useState([]);
  const [workshopFriends,setWorkshopFriends]=useState([]); // workshops this workshop has added as quick-pick move targets
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
  const [wsBookings,        setWsBookings]        =useState([]);
  const [workshopDocuments,setWorkshopDocuments]=useState([]);
  const [workshopProfile,setWorkshopProfile]=useState({});
  const [scrapVehicles,setScrapVehicles]=useState([]);
  const [scrapParts,setScrapParts]=useState([]);
  const [syCustomers,setSyCustomers]=useState([]);
  const [syOrders,setSyOrders]=useState([]);
  const [syInvoices,setSyInvoices]=useState([]);
  const [syReturns,setSyReturns]=useState([]);
  const [allWsProfiles,setAllWsProfiles]=useState([]); // all workshop profiles for admin name lookup
  const [allScrapVehicles,setAllScrapVehicles]=useState([]);
  const [allScrapParts,setAllScrapParts]=useState([]);
  const [allScrapProfiles,setAllScrapProfiles]=useState([]);
  const [showLocationSetup,setShowLocationSetup]=useState(false);
  const [subStatus,setSubStatus]=useState(null); // null | {status,daysLeft,expiresAt}
  const [completedDays,setCompletedDays]=useState(7); // filter completed orders to last N days
  const [searchCust,setSearchCust]=useState("");
  const [inqFilter,setInqFilter]=useState("all");
  const [toast,setToast]=useState(null);
  const [busyMsg,setBusyMsg]=useState(null); // full-screen blocking spinner
  const [lightbox,setLightbox]=useState(null);
  const [poConfirmRemark,setPoConfirmRemark]=useState("");
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [crossBranchSearch,setCrossBranchSearch]=useState("");
  const [showCrossBranch,setShowCrossBranch]=useState(false);
  const [showSupplierCodes,setShowSupplierCodes]=useState(false);
  const [wsMoreOpen,setWsMoreOpen]=useState(false);
  const [versionTip,setVersionTip]=useState(false);

  // Debounce search input — only filter after 250ms of no typing
  useEffect(()=>{
    const t=setTimeout(()=>{ setSearchDebounced(searchPart); setInvPage(0); },250);
    return()=>clearTimeout(t);
  },[searchPart]);

  // Reset page when filters change
  useEffect(()=>{ setInvPage(0); },[filterCat,filterLow,filterFits,filterQuantum,filterHiace,filterInStock,filterNoPhoto,filterSupplier,filterPendingReview,invVehicleFilterIds]);
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

  // Alarm: notify admin/manager when new workshop parts requests arrive
  useEffect(()=>{
    if(!["admin","manager","branch_admin","branch_manager"].includes(role)) return;
    const pending=wsShopRequests.filter(r=>r.status==="pending");
    if(wsShopReqSeenRef.current===null){wsShopReqSeenRef.current=new Set(pending.map(r=>r.id));return;}
    const newOnes=pending.filter(r=>!wsShopReqSeenRef.current.has(r.id));
    if(newOnes.length){
      const first=newOnes[0];
      showToast(`📬 Workshop request from ${first.workshop_name||"Workshop"} — ${newOnes.length} new`);
      newOnes.forEach(r=>wsShopReqSeenRef.current.add(r.id));
    }
  },[wsShopRequests]);

  // Demo mode — block all writes, show toast
  const isDemo = user?.role==="demo";
  setDemoMode(isDemo, ()=>showToast("🔒 Demo mode — sign up to save changes","err"));

  // Spare shop mode: scrapyard account that only manages parts, no sales/orders system
  const isSpareShop = (role==="scrapyard"||role==="scrapyard_admin") && !!workshopProfile.spare_shop_mode;

  // For workshop/scrapyard roles: merge their profile over shop settings so logo/name/contacts show correctly
  const wsDisplaySettings = (wsId || scrapId) ? {
    ...settings,
    shop_name:  workshopProfile.name      || settings.shop_name,
    logo_url:   workshopProfile.logo_url  || "",
    logo_data:  workshopProfile.logo_data || "",
    phone:      workshopProfile.phone     || settings.phone,
    whatsapp:   workshopProfile.whatsapp  || settings.whatsapp,
    email:      workshopProfile.email     || settings.email,
    address:    workshopProfile.address   || settings.address,
    vat_number: workshopProfile.vat_number|| settings.vat_number,
    tax_rate:   workshopProfile.tax_rate  ?? settings.tax_rate,
    currency:   workshopProfile.currency  || settings.currency || "ZAR R",
    city:       workshopProfile.city      || "",
    country:    workshopProfile.country   || "",
    licence_renewal_agent_name:  workshopProfile.licence_renewal_agent_name  || settings.licence_renewal_agent_name  || "",
    licence_renewal_agent_phone: workshopProfile.licence_renewal_agent_phone || settings.licence_renewal_agent_phone || "",
    label_width_mm:  workshopProfile.label_width_mm  || 98,
    label_height_mm: workshopProfile.label_height_mm || 45,
  } : isBranchUser&&currentBranch ? {
    ...settings,
    shop_name: currentBranch.shop_name || currentBranch.name || settings.shop_name,
    logo_url:  currentBranch.logo_url  || "",
    logo_data: currentBranch.logo_data || "",
    phone:     currentBranch.phone     || settings.phone,
    email:     currentBranch.email     || settings.email,
    address:   currentBranch.address   || settings.address,
    currency:  currentBranch.currency  || settings.currency || "ZAR R",
  } : settings;

  // Branch-scoped tax override for the main shop invoice/report flow (not workshop/scrapyard —
  // those use wsDisplaySettings above). Falls back to global settings when the branch has no
  // override, so single-country (South Africa) behavior is unchanged.
  const invoiceSettings = currentBranch ? {
    ...settings,
    tax_rate:   currentBranch.tax_rate ?? settings.tax_rate,
    vat_number: currentBranch.vat_number || settings.vat_number,
  } : settings;

  const _bId=isBranchUser?user.branch_id||null:null; // branch_id for save-side isolation
  const logInv=async(part,before,after,action,reason="")=>{
    await api.upsert("inventory_logs",{part_id:part.id,part_name:part.name,part_sku:part.sku,action,qty_before:before,qty_after:after,changed_by:user.name||user.username,reason,...(_bId?{branch_id:_bId}:{})});
  };

  const loadAll=useCallback(async()=>{
    // Branch filter prefix — limits fetch to this branch's records for branch users
    const bF=isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&`:"";
    const isSalesman=role==="branch_salesman"; // POS-only role — skip unneeded tables
    const isInitial=!firstLoadDoneRef.current;
    if(isInitial){ setLoading(true); setLoadingItems([]); }

    // Wrap a get call with per-table timing tracking (initial load only)
    const track=(label,promise)=>{
      if(!isInitial) return promise;
      const t0=Date.now();
      setLoadingItems(prev=>[...prev,{label,status:'loading',ms:null,rows:null}]);
      return promise.then(data=>{
        const ms=Date.now()-t0;
        const rows=Array.isArray(data)?data.length:1;
        const cached=ms<15; // heuristic: <15ms = served from localStorage cache
        setLoadingItems(prev=>prev.map(item=>
          item.label===label?{label,status:cached?'cached':'done',ms,rows}:item
        ));
        return data;
      });
    };

    // FAST: load parts from IndexedDB (persists across sessions, handles 44k+ rows)
    const PARTS_Q="select=*&order=id.asc";
    const SLIM_Q="select=id,price,stock,cost_price&order=id.asc";
    const idbParts=await db.parts.toArray().catch(()=>[]);
    const idbHasData=idbParts.length>0;

    let partsFirst;
    if(idbHasData){
      setLoadingItems(prev=>[...prev,{label:'parts',status:'cached',ms:1,rows:idbParts.length}]);
      setParts(idbParts);
      partsFirst=idbParts;
    } else {
      // Cold start — fetch first 200 rows only so loading screen clears fast
      const t0p=Date.now();
      setLoadingItems(prev=>[...prev,{label:'parts (first 200)',status:'loading',ms:null,rows:null}]);
      partsFirst=await api.getFirst("parts",PARTS_Q,200);
      const msp=Date.now()-t0p;
      setLoadingItems(prev=>prev.map(i=>i.label==='parts (first 200)'
        ?{label:'parts (first 200)',status:'done',ms:msp,rows:Array.isArray(partsFirst)?partsFirst.length:0}:i));
      setParts(Array.isArray(partsFirst)?partsFirst:[]);
    }

    const [o,s,st,br]=await Promise.all([
      isSalesman ? Promise.resolve([]) : track('orders',    api.get("orders",`${isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&`:""}select=*&order=created_at.desc`)),
      isSalesman ? Promise.resolve([]) : track('suppliers', api.get("suppliers",isBranchUser&&user.branch_id?`or=(branch_id.is.null,branch_id.eq.${user.branch_id})&order=name.asc`:"select=*&order=name.asc")),
      track('settings',  api.get("settings","id=eq.1&select=*")),
      track('branches',  api.get("branches","select=*&order=is_main.desc,name.asc").catch(()=>[])),
    ]);
    setOrders(Array.isArray(o)?o:[]);
    setSuppliers(Array.isArray(s)?s:[]);
    if(Array.isArray(br)&&br.length){
      setBranches(br);
      setCurrentBranch(prev=>{
        // Non-admin users locked to their branch — always sync fresh data so suspend/reactivate takes effect immediately
        if(role!=="admin"&&user.branch_id) return br.find(b=>b.id===user.branch_id)||br.find(b=>b.is_main)||br[0];
        if(prev) return prev; // admin: keep their manual selection
        // admin defaults to main branch (can switch to null for all)
        return br.find(b=>b.is_main)||br[0];
      });
      // On first login, redirect admin to Branches if there are pending registrations
      if(!firstLoadDoneRef.current && role==="admin"){
        const hasPending=br.some(b=>b.status==="pending");
        if(hasPending) setTab("branches");
        firstLoadDoneRef.current=true;
      }
    } else if(!firstLoadDoneRef.current){
      firstLoadDoneRef.current=true;
    }
    if(Array.isArray(st)&&st[0]){
      updateSettings(st[0]); // update global cache — used by ShopLogo on login page
      setSettings(getSettings());
      // Also refresh categories from DB
      try{ if(st[0].categories){ const c=typeof st[0].categories==="string"?JSON.parse(st[0].categories):st[0].categories; if(Array.isArray(c)&&c.length) updateSettings({categories:st[0].categories}); } }catch{}
    }
    if(isInitial) setLoading(false); // ← show UI immediately after critical data (initial load only)

    // Background sync: full IndexedDB write on cold start, slim price/qty sync on warm start
    setPartsLoading(true);
    if(!idbHasData){
      // Cold start — load all remaining pages then persist to IndexedDB
      api.loadRest("parts",PARTS_Q,partsFirst.length,(extra)=>{
        setParts([...partsFirst,...extra]);
      }).then(async extra=>{
        const full=[...partsFirst,...extra];
        setParts(full);
        try{await db.parts.bulkPut(full);}catch{}
        setPartsLoading(false);
      });
    } else {
      // Warm start — slim fetch refreshes price/qty/cost_price (always fresh from server)
      api.fresh("parts",SLIM_Q).then(async slim=>{
        if(!Array.isArray(slim)||slim.length===0){setPartsLoading(false);return;}
        const slimMap=new Map(slim.map(r=>[String(r.id),r]));
        setParts(prev=>prev.map(p=>{const s=slimMap.get(String(p.id));return s?{...p,price:s.price,stock:s.stock,cost_price:s.cost_price}:p;}));
        try{await db.parts.toCollection().modify(p=>{const s=slimMap.get(String(p.id));if(s){p.price=s.price;p.stock=s.stock;p.cost_price=s.cost_price;}});}catch{}
        setPartsLoading(false);
      }).catch(()=>setPartsLoading(false));
    }

    // LAZY: load secondary data in background
    // Role-scoped: skip tables the current role will never use
    const needsWs  = !isSalesman&&(role==="admin"||role==="manager"||role==="workshop"||role==="demo");
    const needsScrap = !isSalesman&&(role==="admin"||role==="scrapyard"||role==="scrapyard_admin"||role==="demo");
    const needsAdmin = !isSalesman&&(role==="admin"||role==="demo");
    // FAST: paint workshop Jobs board instantly from IndexedDB cache while fresh data loads in background.
    // Force-bust the localStorage SWR cache for these two tables so the background fetch below
    // always hits the network — jobs get edited from other devices (e.g. phone) and a stale
    // same-device 5-min cache would otherwise mask those changes on reload.
    if(needsWs){
      const [idbJobs,idbJobItems]=await Promise.all([db.workshopJobs.toArray().catch(()=>[]),db.workshopJobItems.toArray().catch(()=>[])]);
      if(idbJobs.length) setWorkshopJobs(idbJobs);
      if(idbJobItems.length) setWorkshopJobItems(idbJobItems);
      api.cacheInvalidate("workshop_jobs");
      api.cacheInvalidate("workshop_job_items");
    }
    const BG_TABLES=["customers","users","inventory_logs",needsAdmin?"login_logs":null,"inquiries","supplier_invoices","customer_invoices","supplier_returns","customer_returns","vehicles","part_fitments","payments","rfq_sessions","rfq_items","rfq_quotes","stock_moves","stock_takes",needsWs?"workshop_jobs":null,needsWs?"workshop_job_items":null,needsWs?"workshop_invoices":null,needsWs?"workshop_quotes":null,needsWs?"workshop_customers":null,needsWs?"workshop_vehicles":null,"customer_queries",needsWs?"workshop_stock":null,needsWs?"workshop_services":null,needsWs?"workshop_documents":null,needsWs?"workshop_profiles":null,needsWs?"workshop_suppliers":null,needsWs?"ws_supplier_requests":null,needsWs?"ws_supplier_quotes":null,needsWs?"ws_supplier_invoices":null,needsWs?"ws_supplier_invoice_items":null,needsWs?"ws_supplier_payments":null,needsWs?"ws_supplier_returns":null,needsWs?"ws_sq_replies":null,needsWs?"ws_purchase_orders":null,needsWs?"ws_po_items":null,needsWs?"ws_licence_renewals":null,needsWs?"workshop_bookings":null,needsScrap?"scrapyard_vehicles":null,needsScrap?"scrapyard_parts":null,needsScrap?"scrapyard_profiles":null,needsAdmin?"workshop_feedback":null].filter(Boolean);
    setBgLoading(BG_TABLES.length);
    const [c,u,l,ll,inq,si,ci,sr,cr,veh,fit,py,...rest]=await Promise.all([
      api.get("customers","select=*&order=total_spent.desc"),
      isSalesman ? Promise.resolve([]) : api.get("users","select=*&order=id.asc"),
      isSalesman ? Promise.resolve([]) : api.get("inventory_logs",`${bF}select=*&order=created_at.desc&limit=200`),
      needsAdmin ? api.get("login_logs","select=*&order=created_at.desc&limit=200") : Promise.resolve([]),
      isSalesman ? Promise.resolve([]) : api.get("inquiries",`${bF}select=*&order=created_at.desc`),
      isSalesman ? Promise.resolve([]) : api.get("supplier_invoices",`${bF}select=*&order=created_at.desc`),
      api.get("customer_invoices",`${bF}select=*&order=created_at.desc`),
      isSalesman ? Promise.resolve([]) : api.get("supplier_returns",`${bF}select=*&order=created_at.desc`),
      api.get("customer_returns",`${bF}select=*&order=created_at.desc`),
      api.get("vehicles","select=*&order=make.asc,model.asc,year_from.asc").catch(()=>[]),
      api.get("part_fitments","select=*").catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("payments",`${bF}select=*&order=payment_date.desc`).catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("rfq_sessions",`${bF}select=*&order=created_at.desc`).catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("rfq_items","select=*").catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("rfq_quotes","select=*&order=created_at.desc").catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("stock_moves",`${bF}select=*&order=moved_at.desc&limit=200`).catch(()=>[]),
      isSalesman ? Promise.resolve([]) : api.get("stock_takes",`${bF}select=*&order=created_at.desc`).catch(()=>[]),
      needsWs ? api.get("workshop_jobs",`select=*&order=date_in.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_job_items",`select=*${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_quotes",`select=*&order=quote_date.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_customers",`select=*&order=name.asc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_vehicles",`select=*&order=reg.asc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      (isSalesman||isBranchUser) ? Promise.resolve([]) : api.get("customer_queries","select=*&order=created_at.desc").catch(()=>[]),
      needsWs ? api.get("workshop_stock",`select=*&order=name.asc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_services",`select=*&order=name.asc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_documents",`select=*&order=uploaded_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_profiles","select=id,name,city,country&order=name.asc").catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_suppliers",`select=*&order=name.asc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_friends",`select=*&order=created_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_requests",`select=*&order=sent_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_quotes",`select=*&order=quoted_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_invoice_items",`select=*${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_payments",`select=*&order=payment_date.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_supplier_returns",`select=*&order=return_date.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_sq_replies",`select=*${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_purchase_orders",`select=*&order=created_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_po_items",`select=*${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("ws_licence_renewals",`select=*&order=submitted_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsWs ? api.get("workshop_bookings",`select=*&order=created_at.desc${wsF}`).catch(()=>[]) : Promise.resolve([]),
      needsScrap ? api.get("scrapyard_vehicles","select=*&order=created_at.desc").catch(()=>[]) : Promise.resolve([]),
      needsScrap ? api.get("scrapyard_parts","select=*&order=created_at.desc").catch(()=>[]) : Promise.resolve([]),
      needsScrap ? api.get("scrapyard_profiles","select=*&order=id.asc").catch(()=>[]) : Promise.resolve([]),
      needsAdmin ? api.get("workshop_feedback","select=*&order=created_at.desc").catch(()=>[]) : Promise.resolve([]),
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
    if(needsWs){
      const freshJobs=Array.isArray(rest[5])?rest[5]:[];
      const freshItems=Array.isArray(rest[6])?rest[6]:[];
      db.workshopJobs.clear().then(()=>db.workshopJobs.bulkPut(freshJobs)).catch(()=>{});
      db.workshopJobItems.clear().then(()=>db.workshopJobItems.bulkPut(freshItems)).catch(()=>{});
    }
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
    setWorkshopFriends(Array.isArray(rest[17])?rest[17]:[]);
    setWsSupplierRequests(Array.isArray(rest[18])?rest[18]:[]);
    setWsSupplierQuotes(Array.isArray(rest[19])?rest[19]:[]);
    setWsSupplierInvoices(Array.isArray(rest[20])?rest[20]:[]);
    setWsSupplierInvItems(Array.isArray(rest[21])?rest[21]:[]);
    setWsSupplierPayments(Array.isArray(rest[22])?rest[22]:[]);
    setWsSupplierReturns(Array.isArray(rest[23])?rest[23]:[]);
    setWsSqReplies(Array.isArray(rest[24])?rest[24]:[]);
    setWsPurchaseOrders(Array.isArray(rest[25])?rest[25]:[]);
    setWsPoItems(Array.isArray(rest[26])?rest[26]:[]);
    setWsLicenceRenewals(Array.isArray(rest[27])?rest[27]:[]);
    setWsBookings(Array.isArray(rest[28])?rest[28]:[]);
    setAllScrapVehicles(Array.isArray(rest[29])?rest[29]:[]);
    setAllScrapParts(Array.isArray(rest[30])?rest[30]:[]);
    setAllScrapProfiles(Array.isArray(rest[31])?rest[31]:[]);
    setWorkshopFeedback(Array.isArray(rest[32])?rest[32]:[]);
    setBgLoading(0); // all background tables done
    // Ads — load for everyone, fail silently if table doesn't exist yet
    api.get("ads","select=*&order=created_at.desc").catch(()=>[]).then(r=>{if(Array.isArray(r))setAds(r);});
    // Ad clicks — admin only
    if(needsAdmin) api.get("ad_clicks","select=*&order=clicked_at.desc&limit=500").catch(()=>[]).then(r=>{if(Array.isArray(r))setAdClicks(r);});
    if(needsAdmin) api.get("ad_contracts","select=*&order=created_at.desc").catch(()=>[]).then(r=>{if(Array.isArray(r))setAdContracts(r);});

    // Check for overdue auto-RFQs on every app load (runs after state is set)
    if(!isSalesman) setTimeout(()=>checkStaleRfqs(),2000);
    // Part requests: admin sees all, branch users see their own
    if(!isSalesman&&(role==="admin"||isBranchUser)){
      const prF=isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&`:"";
      api.get("part_requests",`${prF}select=*&order=created_at.desc`).catch(()=>[]).then(r=>{if(Array.isArray(r))setPartRequests(r);});
      api.get("vehicle_requests",`${prF}select=*&order=created_at.desc`).catch(()=>[]).then(r=>{if(Array.isArray(r))setVehicleRequests(r);});
    }
    // Branch stock requests: workshop sees own, branch users see both sides (requesting or supplying), admin sees all
    if(!isSalesman){
      const bsrQ=role==="workshop"
        ?`workshop_id=eq.${wsId}&select=*&order=created_at.desc`
        :isBranchUser&&user.branch_id
        ?`or=(requesting_branch_id.eq.${user.branch_id},supplying_branch_id.eq.${user.branch_id})&select=*&order=created_at.desc`
        :"select=*&order=created_at.desc";
      api.get("branch_stock_requests",bsrQ).catch(()=>[]).then(r=>{if(Array.isArray(r))setBranchStockRequests(r);});
    }
    // Branch stock: per-branch qty/price/bin overlay (branch users) + all entries for admin branch filter
    if(isBranchUser&&user.branch_id){
      api.get("branch_stock",`branch_id=eq.${user.branch_id}&select=*`).catch(()=>[]).then(r=>{if(Array.isArray(r))setBranchStock(r);});
    } else if(role==="admin"){
      api.get("branch_stock","select=*").catch(()=>[]).then(r=>{if(Array.isArray(r))setBranchStock(r);});
    }
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
    // Load scrapyard profile + data
    if(scrapId){
      const [prof,veh,prt,syC,syO,syI,syR]=await Promise.all([
        api.get("scrapyard_profiles",`id=eq.${scrapId}&select=*`).catch(()=>[]),
        api.get("scrapyard_vehicles",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
        api.get("scrapyard_parts",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
        api.get("sy_customers",`scrapyard_id=eq.${scrapId}&select=*&order=name.asc`).catch(()=>[]),
        api.get("sy_orders",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
        api.get("sy_invoices",`scrapyard_id=eq.${scrapId}&select=*&order=invoice_date.desc`).catch(()=>[]),
        api.get("sy_returns",`scrapyard_id=eq.${scrapId}&select=*&order=return_date.desc`).catch(()=>[]),
      ]);
      const p=Array.isArray(prof)&&prof[0]?prof[0]:{};
      setWorkshopProfile(p);
      if(p.label_width_mm||p.label_height_mm) updateSettings({label_width_mm:p.label_width_mm||98,label_height_mm:p.label_height_mm||45});
      if(p.name) updateSettings({scrapyard_name:p.name});
      setScrapVehicles(Array.isArray(veh)?veh:[]);
      setScrapParts(Array.isArray(prt)?prt:[]);
      setSyCustomers(Array.isArray(syC)?syC:[]);
      setSyOrders(Array.isArray(syO)?syO:[]);
      setSyInvoices(Array.isArray(syI)?syI:[]);
      setSyReturns(Array.isArray(syR)?syR:[]);
    }
    lastLoadRef.current = Date.now();
  },[]);

  // Lazy load part_suppliers — only when inventory or suppliers tab is opened
  const psLoadedRef=useRef(false);
  const [psLoading,setPsLoading]=useState(false);
  const loadPartSuppliers=useCallback(async()=>{
    if(psLoadedRef.current) return;
    setPsLoading(true);
    const data=await api.get("part_suppliers","select=*");
    setPartSuppliers(Array.isArray(data)?data:[]);
    psLoadedRef.current=true;
    setPsLoading(false);
  },[]);
  const reloadPartSuppliers=useCallback(async()=>{
    const data=await api.fresh("part_suppliers","select=*");
    setPartSuppliers(Array.isArray(data)?data:[]);
  },[]);
  useEffect(()=>{
    // Also load on the request pages that offer "Ask Suppliers" — otherwise the
    // matched-supplier badge/filter in that modal has nothing to match against.
    if(["inventory","suppliers","pos","partRequests","transferRequests","wsShopRequests","requestsKanban"].includes(tab)) loadPartSuppliers();
  },[tab,loadPartSuppliers]);

  // Scoped load — always runs fresh (bypassing the SWR cache) whenever the Edit Part modal
  // opens for a specific part, so a stale full-table snapshot from earlier in the session
  // (or a stale localStorage cache entry) can never hide supplier links that were just added.
  // Re-fires whenever the open part changes so switching parts always shows the right data.
  useEffect(()=>{
    const pid=M.editPart?.data?.id;
    if(!pid) return;
    let cancelled=false;
    (async()=>{
      const data=await api.fresh("part_suppliers",`part_id=eq.${pid}&select=*`);
      if(cancelled||!Array.isArray(data)) return;
      setPartSuppliers(prev=>[...prev.filter(ps=>ps.part_id!==pid),...data]);
    })();
    return ()=>{cancelled=true;};
  },[M.editPart?.data?.id]);

  // Targeted refresh — fetch only the tables that a mutation actually dirtied.
  // Cuts ~40-table loadAll() down to 1-4 requests per save operation.
  const refreshTables=useCallback(async(...names)=>{
    const bF=isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&`:"";
    const D={
      parts:                    ["select=*&order=id.asc",                                         d=>setParts(Array.isArray(d)?d:[])],
      orders:                   [`${bF}select=*&order=created_at.desc`,                          d=>setOrders(Array.isArray(d)?d:[])],
      suppliers:                [isBranchUser&&user.branch_id?`or=(branch_id.is.null,branch_id.eq.${user.branch_id})&order=name.asc`:"select=*&order=name.asc", d=>setSuppliers(Array.isArray(d)?d:[])],
      customers:                ["select=*&order=total_spent.desc",                               d=>setCustomers(Array.isArray(d)?d:[])],
      users:                    ["select=*&order=id.asc",                                         d=>setUsers(Array.isArray(d)?d:[])],
      inventory_logs:           [`${bF}select=*&order=created_at.desc&limit=200`,                 d=>setLogs(Array.isArray(d)?d:[])],
      inquiries:                [`${bF}select=*&order=created_at.desc`,                           d=>setInquiries(Array.isArray(d)?d:[])],
      supplier_invoices:        [`${bF}select=*&order=created_at.desc`,                           d=>setSupplierInvoices(Array.isArray(d)?d:[])],
      customer_invoices:        [`${bF}select=*&order=created_at.desc`,                           d=>setCustomerInvoices(Array.isArray(d)?d:[])],
      supplier_returns:         [`${bF}select=*&order=created_at.desc`,                           d=>setSupplierReturns(Array.isArray(d)?d:[])],
      customer_returns:         [`${bF}select=*&order=created_at.desc`,                           d=>setCustomerReturns(Array.isArray(d)?d:[])],
      vehicles:                 ["select=*&order=make.asc,model.asc,year_from.asc",               d=>setVehicles(Array.isArray(d)?d:[])],
      part_fitments:            ["select=*",                                                       d=>setPartFitments(Array.isArray(d)?d:[])],
      payments:                 [`${bF}select=*&order=payment_date.desc`,                         d=>setPayments(Array.isArray(d)?d:[])],
      rfq_sessions:             [`${bF}select=*&order=created_at.desc`,                           d=>setRfqSessions(Array.isArray(d)?d:[])],
      rfq_items:                ["select=*",                                                       d=>setRfqItems(Array.isArray(d)?d:[])],
      rfq_quotes:               ["select=*&order=created_at.desc",                                d=>setRfqQuotes(Array.isArray(d)?d:[])],
      stock_moves:              [`${bF}select=*&order=moved_at.desc&limit=200`,                   d=>setStockMoves(Array.isArray(d)?d:[])],
      stock_takes:              ["select=*&order=created_at.desc",                   d=>setStockTakes(Array.isArray(d)?d:[])],
      part_requests:            [isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&select=*&order=created_at.desc`:"select=*&order=created_at.desc", d=>setPartRequests(Array.isArray(d)?d:[])],
      vehicle_requests:         [isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&select=*&order=created_at.desc`:"select=*&order=created_at.desc", d=>setVehicleRequests(Array.isArray(d)?d:[])],
      branch_stock_requests:    [role==="workshop"?`workshop_id=eq.${wsId}&select=*&order=created_at.desc`:isBranchUser&&user.branch_id?`or=(requesting_branch_id.eq.${user.branch_id},supplying_branch_id.eq.${user.branch_id})&select=*&order=created_at.desc`:"select=*&order=created_at.desc", d=>setBranchStockRequests(Array.isArray(d)?d:[])],
      ws_shop_requests:         [role==="workshop"?`workshop_id=eq.${wsId}&select=*&order=created_at.desc`:isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&status=in.(pending,escalated,main_replied,ordered)&select=*&order=created_at.desc`:`status=in.(escalated,main_replied,ordered)&select=*&order=created_at.desc`, d=>setWsShopRequests(Array.isArray(d)?d:[])],
      branch_stock:             [isBranchUser&&user.branch_id?`branch_id=eq.${user.branch_id}&select=*`:"select=*", d=>setBranchStock(Array.isArray(d)?d:[])],
      workshop_jobs:            [`select=*&order=date_in.desc${wsF}`,                d=>{const arr=Array.isArray(d)?d:[]; setWorkshopJobs(arr); db.workshopJobs.clear().then(()=>db.workshopJobs.bulkPut(arr)).catch(()=>{});}],
      workshop_job_items:       [`select=*${wsF}`,                                   d=>{const arr=Array.isArray(d)?d:[]; setWorkshopJobItems(arr); db.workshopJobItems.clear().then(()=>db.workshopJobItems.bulkPut(arr)).catch(()=>{});}],
      workshop_invoices:        [`select=*&order=invoice_date.desc${wsF}`,           d=>setWorkshopInvoices(Array.isArray(d)?d:[])],
      workshop_quotes:          [`select=*&order=quote_date.desc${wsF}`,             d=>setWorkshopQuotes(Array.isArray(d)?d:[])],
      workshop_customers:       [`select=*&order=name.asc${wsF}`,                    d=>setWorkshopCustomers(Array.isArray(d)?d:[])],
      workshop_vehicles:        [`select=*&order=reg.asc${wsF}`,                     d=>setWorkshopVehicles(Array.isArray(d)?d:[])],
      customer_queries:         [`select=*&order=created_at.desc`, d=>setCustomerQueries(Array.isArray(d)?d:[])],
      workshop_stock:           [`select=*&order=name.asc${wsF}`,                    d=>setWorkshopStock(Array.isArray(d)?d:[])],
      workshop_services:        [`select=*&order=name.asc${wsF}`,                    d=>setWorkshopServices(Array.isArray(d)?d:[])],
      workshop_documents:       [`select=*&order=uploaded_at.desc${wsF}`,            d=>setWorkshopDocuments(Array.isArray(d)?d:[])],
      workshop_suppliers:       [`select=*&order=name.asc${wsF}`,                    d=>setWorkshopSuppliers(Array.isArray(d)?d:[])],
      ws_supplier_requests:     [`select=*&order=sent_at.desc${wsF}`,                d=>setWsSupplierRequests(Array.isArray(d)?d:[])],
      ws_supplier_quotes:       [`select=*&order=quoted_at.desc${wsF}`,              d=>setWsSupplierQuotes(Array.isArray(d)?d:[])],
      ws_supplier_invoices:     [`select=*&order=invoice_date.desc${wsF}`,           d=>setWsSupplierInvoices(Array.isArray(d)?d:[])],
      ws_supplier_invoice_items:[`select=*${wsF}`,                                   d=>setWsSupplierInvItems(Array.isArray(d)?d:[])],
      ws_supplier_payments:     [`select=*&order=payment_date.desc${wsF}`,           d=>setWsSupplierPayments(Array.isArray(d)?d:[])],
      ws_supplier_returns:      [`select=*&order=return_date.desc${wsF}`,            d=>setWsSupplierReturns(Array.isArray(d)?d:[])],
      ws_sq_replies:            [`select=*${wsF}`,                                   d=>setWsSqReplies(Array.isArray(d)?d:[])],
      ws_purchase_orders:       [`select=*&order=created_at.desc${wsF}`,             d=>setWsPurchaseOrders(Array.isArray(d)?d:[])],
      ws_po_items:              [`select=*${wsF}`,                                   d=>setWsPoItems(Array.isArray(d)?d:[])],
      ws_licence_renewals:      [`select=*&order=submitted_at.desc${wsF}`,           d=>setWsLicenceRenewals(Array.isArray(d)?d:[])],
      workshop_bookings:        [`select=*&order=created_at.desc${wsF}`,             d=>setWsBookings(Array.isArray(d)?d:[])],
      workshop_feedback:        ["select=*&order=created_at.desc",                   d=>setWorkshopFeedback(Array.isArray(d)?d:[])],
    };
    await Promise.all(names.map(async name=>{
      const def=D[name]; if(!def) return;
      api.cacheInvalidate(name); // always fetch fresh — never serve stale cache on explicit refresh
      const data=await api.get(name,def[0]).catch(()=>[]);
      def[1](data);
    }));
  },[]);

  // Silent workshop-only refresh — does NOT set loading=true so WorkshopPage stays mounted.
  // Always hits the network (api.fresh, never api.get's cache) — the manual refresh button
  // exists precisely to pull changes made on another device, which a local SWR cache can't know about.
  const refreshWorkshopData=useCallback(async()=>{
    const [jobs,items,invoices,quotes,wsCustomers,wsVehicles,wsStock,wsServices,wsDocs,wsSupps,wsReqs,wsQts,wsInvs,wsInvItems,wsPayms,wsRets]=await Promise.all([
      api.fresh("workshop_jobs",`select=*&order=date_in.desc${wsF}`).catch(()=>[]),
      api.fresh("workshop_job_items",`select=*${wsF}`).catch(()=>[]),
      api.fresh("workshop_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.fresh("workshop_quotes",`select=*&order=quote_date.desc${wsF}`).catch(()=>[]),
      api.fresh("workshop_customers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.fresh("workshop_vehicles",`select=*&order=reg.asc${wsF}`).catch(()=>[]),
      api.fresh("workshop_stock",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.fresh("workshop_services",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.fresh("workshop_documents",`select=*&order=uploaded_at.desc${wsF}`).catch(()=>[]),
      api.fresh("workshop_suppliers",`select=*&order=name.asc${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_requests",`select=*&order=sent_at.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_quotes",`select=*&order=quoted_at.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_invoices",`select=*&order=invoice_date.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_invoice_items",`select=*${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_payments",`select=*&order=payment_date.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_supplier_returns",`select=*&order=return_date.desc${wsF}`).catch(()=>[]),
    ]);
    setWorkshopJobs(Array.isArray(jobs)?jobs:[]);
    setWorkshopJobItems(Array.isArray(items)?items:[]);
    db.workshopJobs.clear().then(()=>db.workshopJobs.bulkPut(Array.isArray(jobs)?jobs:[])).catch(()=>{});
    db.workshopJobItems.clear().then(()=>db.workshopJobItems.bulkPut(Array.isArray(items)?items:[])).catch(()=>{});
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
    const [sqReps,wsPOs,wsPOItems,wsLicRen,wsBk,wsShopReqs]=await Promise.all([
      api.fresh("ws_sq_replies",`select=*${wsF}`).catch(()=>[]),
      api.fresh("ws_purchase_orders",`select=*&order=created_at.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_po_items",`select=*${wsF}`).catch(()=>[]),
      api.fresh("ws_licence_renewals",`select=*&order=submitted_at.desc${wsF}`).catch(()=>[]),
      api.fresh("workshop_bookings",`select=*&order=created_at.desc${wsF}`).catch(()=>[]),
      api.fresh("ws_shop_requests",role==="workshop"?`workshop_id=eq.${wsId}&select=*&order=created_at.desc`:isBranchUser&&user?.branch_id?`branch_id=eq.${user.branch_id}&status=in.(pending,escalated,main_replied,ordered)&select=*&order=created_at.desc`:`status=in.(escalated,main_replied,ordered)&select=*&order=created_at.desc`).catch(()=>[]),
    ]);
    setWsSqReplies(Array.isArray(sqReps)?sqReps:[]);
    setWsPurchaseOrders(Array.isArray(wsPOs)?wsPOs:[]);
    setWsPoItems(Array.isArray(wsPOItems)?wsPOItems:[]);
    setWsLicenceRenewals(Array.isArray(wsLicRen)?wsLicRen:[]);
    setWsBookings(Array.isArray(wsBk)?wsBk:[]);
    setWsShopRequests(Array.isArray(wsShopReqs)?wsShopReqs:[]);
    if(wsId){
      const prof=await api.fresh("workshop_profiles",`id=eq.${wsId}&select=*`).catch(()=>[]);
      setWorkshopProfile(Array.isArray(prof)&&prof[0]?prof[0]:{});
    }
  },[]);

  // Lean refresh for the Jobs board poll — only the 4 tables that drive what a job card shows
  // (status, item/quote/invoice badges). Deliberately skips the other ~18 workshop tables that
  // refreshWorkshopData covers, so polling every 30s doesn't reintroduce the full-refetch cost.
  const refreshJobsBoard=useCallback(()=>refreshTables("workshop_jobs","workshop_job_items","workshop_quotes","workshop_invoices"),[refreshTables]);

  const refreshLoginLogs=useCallback(async()=>{
    setLoginLogsLoading(true);
    try { api.cacheInvalidate("login_logs"); const r=await api.get("login_logs","select=*&order=created_at.desc&limit=200").catch(()=>[]); if(Array.isArray(r))setLoginLogs(r); } finally { setLoginLogsLoading(false); }
  },[]);

  const refreshAdClicks=useCallback(async()=>{
    setAdClicksLoading(true);
    try { const r=await api.get("ad_clicks","select=*&order=clicked_at.desc&limit=500").catch(()=>[]); if(Array.isArray(r))setAdClicks(r); } finally { setAdClicksLoading(false); }
  },[]);

  const refreshScrapyardData=useCallback(async()=>{
    if(!scrapId) return;
    const [veh,prt,syC,syO,syI,syR]=await Promise.all([
      api.get("scrapyard_vehicles",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
      api.get("scrapyard_parts",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
      api.get("sy_customers",`scrapyard_id=eq.${scrapId}&select=*&order=name.asc`).catch(()=>[]),
      api.get("sy_orders",`scrapyard_id=eq.${scrapId}&select=*&order=created_at.desc`).catch(()=>[]),
      api.get("sy_invoices",`scrapyard_id=eq.${scrapId}&select=*&order=invoice_date.desc`).catch(()=>[]),
      api.get("sy_returns",`scrapyard_id=eq.${scrapId}&select=*&order=return_date.desc`).catch(()=>[]),
    ]);
    setScrapVehicles(Array.isArray(veh)?veh:[]);
    setScrapParts(Array.isArray(prt)?prt:[]);
    setSyCustomers(Array.isArray(syC)?syC:[]);
    setSyOrders(Array.isArray(syO)?syO:[]);
    setSyInvoices(Array.isArray(syI)?syI:[]);
    setSyReturns(Array.isArray(syR)?syR:[]);
  },[scrapId]);

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
  const lastLoadRef = useRef(0); // timestamp of last full loadAll — used to skip redundant focus refreshes
  const firstLoadDoneRef = useRef(false); // true after initial loadAll — prevents repeat auto-redirects
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
    tabRef.current === "wssuppliers" || // always pause on suppliers sub-tab
    tabRef.current === "sy_vehicles" || // always pause on scrapyard
    tabRef.current === "sy_parts" ||
    tabRef.current === "wscustomers" ||
    tabRef.current === "wsquotations" ||
    tabRef.current === "wsinvoices" ||
    tabRef.current === "wspayments" ||
    tabRef.current === "wssuporders" ||
    tabRef.current === "wsstatement" ||
    tabRef.current === "wsreport" ||
    tabRef.current === "suppliers" ||   // always pause on suppliers
    tabRef.current === "pos" ||         // manual refresh only on POS
    tabRef.current === "shop" ||        // manual refresh only on shop
    tabRef.current === "inventory" ||   // manual refresh only on inventory
    tabRef.current === "vehicleRequests" || // always pause on vehicle requests
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

    // Auto-refresh every 5 minutes — only when user is idle AND no modal open
    const interval = setInterval(()=>{
      if(isBusy()) return;
      loadAll();
    }, 300000);

    // On tab/window focus — skip if last full load was less than 5 minutes ago
    const onFocus = () => {
      if(isBusy()) return;
      if(Date.now()-lastLoadRef.current < 300000) return;
      loadAll();
    };
    window.addEventListener("focus", onFocus);

    // On visibility change (phone wake, alt+tab back) — same 5-minute gate
    const onVisible = () => {
      if(document.visibilityState==="visible" && !isBusy() && Date.now()-lastLoadRef.current >= 300000) loadAll();
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

  // Requests board — poll for incoming workshop/branch requests every 20s while open.
  // These queries are branch-scoped (cheap), unlike the 5-minute full loadAll() above.
  useEffect(()=>{
    if(tab!=="requestsKanban") return;
    const poll=setInterval(()=>{
      refreshTables("ws_shop_requests","branch_stock_requests","vehicle_requests","part_requests");
    },20000);
    return ()=>clearInterval(poll);
  },[tab,refreshTables]);

  // Cart
  const addToCart=(part)=>{setCart(p=>{const ex=p.find(i=>i.id===part.id);return ex?p.map(i=>i.id===part.id?{...i,qty:i.qty+1}:i):[...p,{...part,qty:1}];});showToast(`Added: ${part.name}`);};
  const removeFromCart=(id)=>setCart(p=>p.filter(i=>i.id!==id));
  const qtyCart=(id,qty)=>{if(qty<1)return;setCart(p=>p.map(i=>i.id===id?{...i,qty}:i));};
  const cartTotal=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const cartCount=cart.reduce((s,i)=>s+i.qty,0);

  // Orders
  const placeOrder=async(form)=>{
    if(!form.name||!form.phone){showToast("Fill name & phone","err");return;}

    // Check latest stock & price before confirming
    const ids=cart.map(i=>i.id).join(",");
    const freshParts=await api.getFirst("parts",`id=in.(${ids})&select=id,name,price,stock`,500);
    if(Array.isArray(freshParts)&&freshParts.length>0){
      const stockIssues=[];
      const priceChanges=[];
      for(const item of cart){
        const fp=freshParts.find(p=>String(p.id)===String(item.id));
        if(!fp) continue;
        if((fp.stock??0)<item.qty) stockIssues.push(`${item.name} (only ${fp.stock??0} left)`);
        else if(fp.price!==item.price) priceChanges.push({id:item.id,newPrice:fp.price,name:item.name,oldPrice:item.price});
      }
      if(stockIssues.length>0){showToast(`Not enough stock: ${stockIssues.join("; ")}`,"err");return;}
      if(priceChanges.length>0){
        setCart(prev=>prev.map(i=>{const ch=priceChanges.find(c=>String(c.id)===String(i.id));return ch?{...i,price:ch.newPrice}:i;}));
        showToast(`Prices updated — please review and confirm`,"err");
        return;
      }
    }

    const oid=makeId("ORD");
    const orderObj={id:oid,customer_name:form.name,customer_phone:form.phone,customer_email:form.email||"",date:today(),status:"Processing",items:cart.map(i=>({partId:i.id,qty:i.qty,name:i.name,price:i.price})),total:cartTotal,branch_id:currentBranch?.id||null};
    await api.upsert("orders",orderObj);
    // NO stock deduction on order — stock deducted when shipper sets 待出貨
    const ex=customers.find(c=>c.phone===form.phone);
    if(ex) await api.patch("customers","phone",form.phone,{orders:ex.orders+1,total_spent:ex.total_spent+cartTotal});
    else await api.upsert("customers",{name:form.name,phone:form.phone,email:form.email||"",address:form.address||"",orders:1,total_spent:cartTotal,branch_id:currentBranch?.id||null});
    await refreshTables("orders","customers");setCart([]);closeM("checkout");
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
        if(p){const ns2=Math.max(0,p.stock-item.qty);await api.patch("parts","id",item.partId,{stock:ns2});await logInv(p,p.stock,ns2,"Picked",id);await checkAutoReorder(item.partId,ns2);}
        // Branch: also deduct branch_stock and check branch reorder
        if(_bId){
          const bs=branchStock.find(b=>String(b.branch_id)===String(_bId)&&String(b.part_id)===String(item.partId));
          if(bs?.id){const nbq=Math.max(0,(+bs.stock||0)-item.qty);await api.patch("branch_stock","id",bs.id,{stock:nbq,updated_at:new Date().toISOString()});await checkAutoReorder(item.partId,nbq,_bId);}
        }
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
        if(p){const ns2=Math.max(0,p.stock-item.qty);await api.patch("parts","id",item.partId,{stock:ns2});await logInv(p,p.stock,ns2,"Re-Picked",id);await checkAutoReorder(item.partId,ns2);}
        if(_bId){
          const bs=branchStock.find(b=>String(b.branch_id)===String(_bId)&&String(b.part_id)===String(item.partId));
          if(bs?.id){const nbq=Math.max(0,(+bs.stock||0)-item.qty);await api.patch("branch_stock","id",bs.id,{stock:nbq,updated_at:new Date().toISOString()});await checkAutoReorder(item.partId,nbq,_bId);}
        }
      }
      showToast("Order restored & stock deducted");
    }
    else showToast("Status updated");

    await api.patch("orders","id",id,{status:ns});await refreshTables("orders","parts","inventory_logs");
  };

  // Parts
  const savePart=async(data, keepOpen=false)=>{
    const ep=mData("editPart");
    if(ep?.id){
      const d2={...data,image_url:toSaveUrl(data.image_url)};
      setBusyMsg(`Saving ${d2.sku||ep.sku||"part"}…`);
      const result=await api.patch("parts","id",ep.id,d2).finally(()=>setBusyMsg(null));
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
      // Update local parts state — no full reload needed
      const updated={...ep,...d2};
      setParts(prev=>prev.map(p=>String(p.id)===String(ep.id)?updated:p));
      db.parts.put(updated).catch(()=>{});
      if(!keepOpen) await releaseLock("part",ep.id);
      if(keepOpen){
        closeM("editPart");
        setTimeout(()=>openM("editPart",updated),0);
      } else {
        closeM("editPart");
        setTimeout(()=>{
          const el=document.getElementById(`part-row-${ep.id}`);
          if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.style.transition="background .5s"; el.style.background="rgba(251,146,60,.15)"; setTimeout(()=>el.style.background="",1500); }
        },300);
      }
    } else {
      const d2={...data,image_url:toSaveUrl(data.image_url),branch_id:currentBranch?.id||null};
      setBusyMsg(`Saving ${d2.sku||"new part"}…`);
      try {
        const r=await api.upsert("parts",d2);
        const newPart=Array.isArray(r)&&r[0]?r[0]:null;
        if(!newPart?.id){showToast("Failed to create part — check SKU/name","err");return;}
        await logInv(newPart,0,d2.stock,"New Part","Added");
        const copyFromId=pendingFitsCopy;
        const vehIds=pendingVehicleIds;
        const catLink=pendingCatalogueLink;
        setPendingFitsCopy(null);
        setPendingVehicleIds(null);
        setNewPartInitialF(null);
        setPendingCatalogueLink(null);
        if(catLink?.supplier_id){
          await api.upsert("part_suppliers",{part_id:newPart.id,supplier_id:catLink.supplier_id,supplier_part_no:catLink.supplier_part_no||"",supplier_price:null,lead_time:"",min_order:1});
          await reloadPartSuppliers();
          showToast(`✅ Supplier part ${catLink.supplier_part_no} linked`);
        }
        if(copyFromId){
          // Fetch fresh fitments from DB for the source part to avoid stale local state
          api.cacheInvalidate("part_fitments");
          const freshFits=await api.get("part_fitments",`part_id=eq.${copyFromId}&select=*`).catch(()=>[]);
          for(const fit of freshFits)
            await api.upsert("part_fitments",{part_id:newPart.id,vehicle_id:fit.vehicle_id,notes:fit.notes||""});
          await refreshTables("part_fitments");
          if(freshFits.length>0) showToast(`✅ Copied ${freshFits.length} vehicle fit${freshFits.length!==1?"s":""}`);
        }
        if(vehIds&&vehIds.length>0){
          for(const vid of vehIds)
            await api.upsert("part_fitments",{part_id:newPart.id,vehicle_id:vid,notes:""});
          await refreshTables("part_fitments");
          setParts(prev=>[...prev,newPart]);
          db.parts.put(newPart).catch(()=>{});
          // Add new part to active vehicle filter so it appears immediately in shop
          setVehicleFilterIds(prev=>{ const s=new Set(prev||[]); s.add(String(newPart.id)); return s; });
          closeM("editPart");
          showToast(`✅ ${d2.sku} added`);
          // Stay on shop — do not navigate away
        } else {
          setParts(prev=>[...prev,newPart]);
          db.parts.put(newPart).catch(()=>{});
          closeM("editPart");
          // Navigate to inventory, clear filters that could hide a new 0-stock/no-fitment part
          setFilterInStock(false);setFilterFits("__all__");setInvVehicleFilterIds(null);setFilterSupplier("__all__");
          setTab("inventory");
          setSearchPart(newPart.sku||d2.sku||"");
          setSearchDebounced(newPart.sku||d2.sku||"");
          showToast(`✅ ${d2.sku} added — add photos & vehicle fits`);
          setTimeout(()=>openM("editPart",{...newPart,_tab:"photo"}),300);
        }
      } finally {
        setBusyMsg(null);
      }
    }
  };
  const _getFlippedBase64=(url)=>new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>{
      try{
        const w=img.naturalWidth||200,h=img.naturalHeight||200;
        const cv=document.createElement("canvas");
        cv.width=w;cv.height=h;
        const ctx=cv.getContext("2d");
        ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
        ctx.translate(w,0);ctx.scale(-1,1);
        ctx.drawImage(img,0,0);
        resolve(cv.toDataURL("image/jpeg",0.92)); // throws SecurityError if canvas tainted
      }catch(e){reject(e);}
    };
    img.onerror=(e)=>reject(e);
    // cache-bust so browser re-fetches with CORS headers (not from opaque cache)
    img.src=url+(url.includes("?")?"&":"?")+"_cb="+Date.now();
  });
  const _flipAndUpload=async(srcUrl,sku)=>{
    const SCRIPT_URL=(window._APPS_SCRIPT_URL?.trim())||(window._VEHICLE_SCRIPT_URL?.trim())||"";
    if(!SCRIPT_URL){showToast("No Apps Script URL set — photo not flipped","warn");return srcUrl;}
    let base64=null;
    // Approach 1: fetch as blob → create object URL → draw to canvas (no CORS taint)
    try{
      const r=await fetch(srcUrl,{credentials:"omit"});
      if(r.ok){
        const blob=await r.blob();
        if(blob.type.startsWith("image/")){
          const objUrl=URL.createObjectURL(blob);
          base64=await new Promise((res,rej)=>{
            const img=new Image();
            img.onload=()=>{
              URL.revokeObjectURL(objUrl);
              try{
                const w=img.naturalWidth||200,h=img.naturalHeight||200;
                const cv=document.createElement("canvas");
                cv.width=w;cv.height=h;
                const ctx=cv.getContext("2d");
                ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
                ctx.translate(w,0);ctx.scale(-1,1);
                ctx.drawImage(img,0,0);
                res(cv.toDataURL("image/jpeg",0.92));
              }catch(e){URL.revokeObjectURL(objUrl);rej(e);}
            };
            img.onerror=()=>{URL.revokeObjectURL(objUrl);rej(new Error("blob img load failed"));};
            img.src=objUrl;
          });
        }
      }
    }catch(e){console.warn("Flip fetch approach failed:",e);}
    // Approach 2: crossOrigin image element (works when Drive files are publicly shared)
    if(!base64){
      try{base64=await _getFlippedBase64(srcUrl);}
      catch(e){console.warn("Flip crossOrigin approach failed:",e);}
    }
    if(!base64){
      showToast("Could not flip photo (browser security) — upload manually on Photo tab","warn");
      return srcUrl;
    }
    try{
      const up=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({image:base64,filename:`${sku}_flipped.jpg`,mimeType:"image/jpeg"})});
      const result=await up.json();
      if(result.success&&result.url) return result.url;
      console.warn("Flip upload result:",result);
      showToast("Photo flip upload failed — upload manually on Photo tab","warn");
      return srcUrl;
    }catch(e){console.warn("Flip upload error:",e);showToast("Photo flip upload error — upload manually","warn");return srcUrl;}
  };
  const createOpposite=async({sku,name,chineseDesc,originalPart,originalF,flipPhoto,copyFits=true,copyVehicleInfo=true})=>{
    if(parts.find(p=>p.sku?.trim().toLowerCase()===sku.trim().toLowerCase())){
      showToast(`SKU "${sku}" already exists`,"err"); return;
    }
    setBusyMsg(`Creating ${sku}…`);
    try{
      let finalImageUrl=toSaveUrl(originalF.image_url||"");
      if(flipPhoto&&originalF.image_url){
        setBusyMsg(`Flipping photo for ${sku}…`);
        const srcUrl=toImgUrl(originalF.image_url)||originalF.image_url;
        finalImageUrl=await _flipAndUpload(srcUrl,sku.trim());
        finalImageUrl=toSaveUrl(finalImageUrl)||finalImageUrl;
        setBusyMsg(`Creating ${sku}…`);
      }
      const newData={
        sku:sku.trim(), name:name.trim(), chinese_desc:chineseDesc||"",
        brand:originalF.brand||"", category:originalF.category||"Engine",
        price:+originalF.price||0, cost_price:+originalF.cost_price||0,
        stock:0, min_stock:+originalF.minStock||0,
        image_url:finalImageUrl,
        make:copyVehicleInfo?(originalF.make||""):"", model:copyVehicleInfo?(originalF.model||""):"",
        year_range:copyVehicleInfo?(originalF.year_range||""):"", oe_number:originalF.oe_number||"",
        bin_location:originalF.bin_location||"",
      };
      const r=await api.upsert("parts",newData);
      const newPart=Array.isArray(r)&&r[0]?r[0]:null;
      if(!newPart?.id){showToast("Failed to create part","err");return;}
      await logInv(newPart,0,0,"New Part","Opposite side copy");
      const srcFits=copyFits?partFitments.filter(f=>String(f.part_id)===String(originalPart.id)):[];
      for(const fit of srcFits)
        await api.upsert("part_fitments",{part_id:newPart.id,vehicle_id:fit.vehicle_id,notes:fit.notes||""});
      const srcSupps=partSuppliers.filter(ps=>String(ps.part_id)===String(originalPart.id));
      for(const ps of srcSupps)
        await api.upsert("part_suppliers",{part_id:newPart.id,supplier_id:ps.supplier_id,supplier_part_no:"",supplier_price:ps.supplier_price||null,lead_time:ps.lead_time||"",min_order:ps.min_order||1});
      await refreshTables("parts","part_fitments");
      if(srcSupps.length>0) await reloadPartSuppliers();
      closeM("editPart");
      setFilterInStock(false);setFilterFits("__all__");setInvVehicleFilterIds(null);setFilterSupplier("__all__");
      setTab("inventory");
      setSearchPart(newPart.sku);
      setSearchDebounced(newPart.sku);
      showToast(`✅ ${sku} created`);
      setTimeout(()=>openM("editPart",{...newPart,_tab:"info"}),300);
    }finally{setBusyMsg(null);}
  };
  // ── Workshop ──
  const saveWorkshopJob=async(data, onProgress)=>{
    const chk=(r,label)=>{ if(r&&!Array.isArray(r)&&r.message){ throw new Error(`${label}: ${r.message}`); } return r; };
    try {
      let d={...data};
      // If customer_id is set but the customer no longer exists locally, clear it so it gets re-created below
      if(d.workshop_customer_id && !workshopCustomers.some(c=>c.id===d.workshop_customer_id)){
        d.workshop_customer_id=null;
      }
      // Auto-create workshop_customer if not linked yet — dedup by name first
      if(!d.workshop_customer_id && d.customer_name?.trim()){
        const nameNorm=d.customer_name.trim().toLowerCase();
        const existing=workshopCustomers.find(c=>c.name?.trim().toLowerCase()===nameNorm);
        if(existing){
          d.workshop_customer_id=existing.id;
        } else {
          const custId=makeId("WSC");
          chk(await api.insert("workshop_customers",{id:custId,name:d.customer_name.trim(),phone:d.customer_phone||"",email:d.customer_email||"",workshop_id:wsId||null}),"Save customer");
          d.workshop_customer_id=custId;
        }
      }
      // Auto-create workshop_vehicle if not linked yet, or if the linked ID no longer exists
      const vehicleExists=d.workshop_vehicle_id&&workshopVehicles.some(v=>v.id===d.workshop_vehicle_id);
      if(!vehicleExists && d.vehicle_reg?.trim()){
        // Before creating, check if a vehicle with this plate already exists
        const regNorm=d.vehicle_reg.trim().toUpperCase().replace(/\s/g,"");
        const existingVeh=workshopVehicles.find(v=>v.reg?.trim().toUpperCase().replace(/\s/g,"")=== regNorm);
        if(existingVeh){
          // Reuse existing vehicle, update its customer link
          d.workshop_vehicle_id=existingVeh.id;
          await api.patch("workshop_vehicles","id",existingVeh.id,{workshop_customer_id:d.workshop_customer_id||null}).catch(()=>{});
        } else {
          const vehId=makeId("WSV");
          chk(await api.insert("workshop_vehicles",{id:vehId,workshop_customer_id:d.workshop_customer_id||null,reg:d.vehicle_reg.trim(),make:d.vehicle_make||"",model:d.vehicle_model||"",year:d.vehicle_year||"",color:d.vehicle_color||"",vin:d.vin||"",engine_no:d.engine_no||"",licence_disc_expiry:d.licence_disc_expiry||null,workshop_id:wsId||null}),"Save vehicle");
          d.workshop_vehicle_id=vehId;
        }
      } else if(vehicleExists){
        // Keep vehicle's customer link in sync with the job's customer
        const vPatch={workshop_customer_id:d.workshop_customer_id||null};
        if(d.licence_disc_expiry) vPatch.licence_disc_expiry=d.licence_disc_expiry;
        await api.patch("workshop_vehicles","id",d.workshop_vehicle_id,vPatch).catch(()=>{});
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
        is_problem:d.is_problem||false,
        problem_prev_status:str(d.problem_prev_status),
        notes:str(d.notes),
      };
      let savedId=d.id;
      if(d.id){ chk(await api.patch("workshop_jobs","id",d.id,jobRow),"Update job"); }
      else { savedId=makeId("JOB"); chk(await api.insert("workshop_jobs",{...jobRow, id:savedId}),"Create job"); }

      // Save/upload condition photos — awaited so modal stays open until Drive URLs are back
      const allPhotoEntries=[
        {field:"photo_front",viewName:"front",data:d.photo_front},
        {field:"photo_rear", viewName:"rear", data:d.photo_rear},
        {field:"photo_side", viewName:"side", data:d.photo_side},
      ].filter(p=>p.data);
      const driveUrlEntries = allPhotoEntries.filter(p=>!p.data.startsWith("data:"));
      const uploadEntries   = allPhotoEntries.filter(p=>p.data.startsWith("data:"));
      if(allPhotoEntries.length&&d.workshop_vehicle_id){
        const vehId=d.workshop_vehicle_id;
        if(driveUrlEntries.length){
          const patch={};
          driveUrlEntries.forEach(p=>{ patch[p.field]=p.data; });
          try{ await api.patch("workshop_vehicles","id",vehId,patch); }catch{}
        }
        const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
        if(uploadEntries.length&&SCRIPT_URL){
          const _n=new Date(),_p=n=>String(n).padStart(2,"0");
          const _date=`${_n.getFullYear()}-${_p(_n.getMonth()+1)}-${_p(_n.getDate())}`;
          const _dt=`${_date.replace(/-/g,"")}_${_p(_n.getHours())}${_p(_n.getMinutes())}${_p(_n.getSeconds())}`;
          const _plate=(d.vehicle_reg||vehId).replace(/\s/g,"").toUpperCase();
          const folderPath="Tim_Car_Phot/"+_plate+"/"+_date;
          for(let _pi=0;_pi<uploadEntries.length;_pi++){
            const p=uploadEntries[_pi];
            onProgress?.({current:_pi+1,total:uploadEntries.length,name:p.viewName});
            try{
              const resized=await new Promise((res,rej)=>{
                const img=new Image();
                img.onload=()=>{
                  const MAX=1200; const canvas=document.createElement("canvas");
                  let w=img.width,h=img.height;
                  if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
                  canvas.width=w;canvas.height=h;
                  canvas.getContext("2d").drawImage(img,0,0,w,h);
                  res(canvas.toDataURL("image/jpeg",0.88));
                };
                img.onerror=rej; img.src=p.data;
              });
              const filename=_dt+"_"+p.viewName+".jpg";
              const r=await(await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:resized,filename,mimeType:"image/jpeg",folderPath})})).json();
              if(r.success) await api.patch("workshop_vehicles","id",vehId,{[p.field]:r.url});
            }catch{}
          }
        }
      }

      await refreshTables("workshop_jobs","workshop_customers","workshop_vehicles"); showToast("Job saved");
      return savedId;
    } catch(e){ alert("Save failed: "+e.message); }
  };
  const deleteWorkshopJob=async(id)=>{
    await api.delete("workshop_jobs","id",id);
    await refreshTables("workshop_jobs","workshop_job_items"); showToast("Deleted","err");
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
    await refreshTables("workshop_jobs","workshop_job_items","workshop_invoices","workshop_quotes");
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
    await refreshTables("workshop_job_items","workshop_stock");
  };
  const deleteJobItem=async(id)=>{
    await api.delete("workshop_job_items","id",id);
    await refreshTables("workshop_job_items");
  };
  const saveWorkshopInvoice=async(inv)=>{
    const {id,...rest}=inv;
    const payload={...rest, id:id||makeId("WSI"), workshop_id:wsId||null};
    const res=await api.insert("workshop_invoices",payload);
    if(res&&!Array.isArray(res)&&(res.code||res.message))
      throw new Error(res.message||res.hint||res.code);
    await api.patch("workshop_jobs","id",inv.job_id,{status:"Done"});
    await refreshTables("workshop_invoices","workshop_jobs"); showToast("Invoice created");
  };
  const updateWorkshopInvoice=async(id,data)=>{
    const res=await api.patch("workshop_invoices","id",id,data);
    if(res&&!Array.isArray(res)&&res.message) throw new Error(res.message);
    await refreshTables("workshop_invoices"); showToast("Invoice updated");
  };
  const deleteWorkshopInvoice=async(id,jobId)=>{
    await api.delete("workshop_invoices","id",id);
    if(jobId) await api.patch("workshop_jobs","id",jobId,{status:"In Progress"});
    await refreshTables("workshop_invoices","workshop_jobs"); showToast("Invoice deleted","err");
  };
  const saveWorkshopQuote=async(q)=>{
    const {id,...rest}=q;
    if(id){ await api.patch("workshop_quotes","id",id,rest); showToast("Quote updated"); }
    else { await api.insert("workshop_quotes",{...rest,id:makeId("WSQ"),workshop_id:wsId||null}); showToast("Quote created"); }
    await refreshTables("workshop_quotes");
  };
  const sendQuoteForApproval=async(quoteId)=>{
    const token=makeToken();
    // Shrink base64 logo to ~150px JPEG so it's small enough to store reliably in the quote record
    const rawLogo=workshopProfile.logo_url||workshopProfile.logo_data||"";
    let storedLogo=rawLogo;
    if(rawLogo.startsWith("data:")){
      storedLogo=await new Promise(res=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=150;
          const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.6));
        };
        img.onerror=()=>res(rawLogo);
        img.src=rawLogo;
      });
    }
    await api.patch("workshop_quotes","id",quoteId,{
      confirm_token:token,confirm_status:"pending",
      ws_name:workshopProfile.name||"",
      ws_phone:workshopProfile.phone||workshopProfile.whatsapp||"",
      ws_email:workshopProfile.email||"",
      ws_address:workshopProfile.address||"",
      ws_logo_url:storedLogo,
      ws_vat:workshopProfile.vat_number||"",
    });
    await refreshTables("workshop_quotes");
    return token;
  };
  const deleteWorkshopQuote=async(id)=>{
    await api.delete("workshop_quotes","id",id);
    await refreshTables("workshop_quotes"); showToast("Quote deleted","err");
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
    await refreshTables("workshop_invoices","workshop_quotes","workshop_jobs"); showToast("Invoice created from quote");
  };
  const saveWorkshopCustomer=async(data)=>{
    const {id,...rest}=data;
    if(id){ await api.patch("workshop_customers","id",id,rest); }
    else { await api.insert("workshop_customers",{...data, id:makeId("WSC"), workshop_id:wsId||null}); }
    await refreshTables("workshop_customers"); showToast("Customer saved");
  };
  const deleteWorkshopCustomer=async(id)=>{
    await api.delete("workshop_customers","id",id);
    await refreshTables("workshop_customers"); showToast("Deleted","err");
  };
  const saveWorkshopVehicle=async(data)=>{
    const {id,...rest}=data;
    if(id){ await api.patch("workshop_vehicles","id",id,rest); }
    else { await api.insert("workshop_vehicles",{...data, id:makeId("WSV"), workshop_id:wsId||null}); }
    await refreshTables("workshop_vehicles"); showToast("Vehicle saved");
  };
  const patchWsVehicleLocal=(id,patch)=>setWorkshopVehicles(prev=>prev.map(v=>v.id===id?{...v,...patch}:v));
  const deleteWorkshopVehicle=async(id)=>{
    await api.delete("workshop_vehicles","id",id);
    await refreshTables("workshop_vehicles"); showToast("Deleted","err");
  };

  // ── Workshop Stock ────────────────────────────────────────────
  const saveWsStockItem=async(item)=>{
    const {id,...rest}=item;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("workshop_stock","id",id,rest),"Update stock"); showToast("Stock item updated"); }
    else { chkR(await api.insert("workshop_stock",{...rest,id:makeId("WSK"),workshop_id:wsId||null}),"Add stock"); showToast("Stock item added"); }
    await refreshTables("workshop_stock");
  };
  const deleteWsStockItem=async(id)=>{
    await api.delete("workshop_stock","id",id);
    await refreshTables("workshop_stock"); showToast("Deleted","err");
  };
  const adjustWsStock=async({id,delta,reason,new_qty})=>{
    const stockItem=workshopStock.find(s=>s.id===id);
    await api.patch("workshop_stock","id",id,{qty:new_qty});
    await api.insert("workshop_stock_moves",{
      id:makeId("WSM"),stock_id:id,stock_name:stockItem?.name||"",
      move_type:"adjustment",qty_change:delta,qty_after:new_qty,
      notes:reason||"Manual adjustment",moved_at:new Date().toISOString(),
    });
    await refreshTables("workshop_stock"); showToast(`Stock → ${new_qty}`);
  };

  // ── Workshop Services ─────────────────────────────────────────
  const saveWsService=async(svc)=>{
    const {id,...rest}=svc;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("workshop_services","id",id,rest),"Update service"); showToast("Service updated"); }
    else { chkR(await api.insert("workshop_services",{...rest,id:makeId("WSS"),workshop_id:wsId||null}),"Add service"); showToast("Service added"); }
    await refreshTables("workshop_services");
  };
  const deleteWsService=async(id)=>{
    await api.delete("workshop_services","id",id);
    await refreshTables("workshop_services"); showToast("Deleted","err");
  };

  // ── Workshop Suppliers ────────────────────────────────────────
  const saveWsSupplier=async(sup)=>{
    const {id,...rest}=sup;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    const clean=Object.fromEntries(Object.entries(rest).filter(([,v])=>v!=null));
    if(id){
      chkR(await api.patch("workshop_suppliers","id",id,clean),"Update supplier");
      setWorkshopSuppliers(prev=>prev.map(s=>s.id===id?{...s,...clean}:s));
      showToast("Supplier updated");
      return {...clean,id};
    } else {
      const newId=makeId("WSUP");
      const newSup={...clean,id:newId,workshop_id:wsId||null};
      chkR(await api.insert("workshop_suppliers",newSup),"Add supplier");
      setWorkshopSuppliers(prev=>[...prev,newSup].sort((a,b)=>(a.name||"").localeCompare(b.name||"")));
      showToast("Supplier added");
      return newSup;
    }
  };
  const deleteWsSupplier=async(id)=>{
    await api.delete("workshop_suppliers","id",id);
    setWorkshopSuppliers(prev=>prev.filter(s=>s.id!==id));
    showToast("Deleted","err");
  };
  const addWorkshopFriend=async(friendWsId)=>{
    if(!wsId||!friendWsId||String(friendWsId)===String(wsId)) return;
    if(workshopFriends.some(f=>String(f.friend_workshop_id)===String(friendWsId))) return;
    const newFriend={id:makeId("WSF"),workshop_id:wsId,friend_workshop_id:String(friendWsId),created_at:new Date().toISOString()};
    const r=await api.insert("workshop_friends",newFriend);
    if(r&&!Array.isArray(r)&&(r.code||r.message)) throw new Error(r.message||r.code);
    setWorkshopFriends(prev=>[newFriend,...prev]);
    showToast("Added to workshop friends");
  };
  const removeWorkshopFriend=async(id)=>{
    await api.delete("workshop_friends","id",id);
    setWorkshopFriends(prev=>prev.filter(f=>f.id!==id));
  };
  const saveWsSupplierQuote=async(qt)=>{
    const {id,...rest}=qt;
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    if(id){ chkR(await api.patch("ws_supplier_quotes","id",id,rest),"Update quote"); }
    else { chkR(await api.insert("ws_supplier_quotes",{...rest,id:makeId("WSQT"),workshop_id:wsId||null,quoted_at:new Date().toISOString()}),"Save quote"); }
    // Apply supplier prices as cost_price + recalculate unit_price on matching job items
    if(qt.job_id && qt.line_items){
      const defaultMarkup=+(workshopProfile?.default_markup_pct||0);
      const jobItems=workshopJobItems.filter(i=>i.job_id===qt.job_id);
      let lineItems=[]; try{ lineItems=JSON.parse(qt.line_items||"[]"); }catch{}
      for(const li of lineItems){
        const price=+(li.price||0);
        if(!(price>0)) continue;
        const sku=(li.sku||"").trim();
        const match=jobItems.find(i=>sku?(i.part_sku||"").trim()===sku:(i.description||"").toLowerCase().trim()===(li.name||"").toLowerCase().trim());
        if(!match) continue;
        const mu=+(match.markup_pct||defaultMarkup);
        const newPrice=+(price*(1+mu/100)).toFixed(2);
        await api.patch("workshop_job_items","id",match.id,{cost_price:price,unit_price:newPrice,total:+(newPrice*(+match.qty||1)).toFixed(2),markup_pct:mu}).catch(()=>{});
      }
    }
    await refreshTables("ws_supplier_quotes","workshop_job_items");
  };

  const saveWsSupplierRequest=async(req)=>{
    const reqId=makeId("WSRQ");
    const sentAt=new Date().toISOString();
    await api.insert("ws_supplier_requests",{...req,id:reqId,workshop_id:wsId||null,sent_at:sentAt}).catch(e=>console.warn("Log send failed:",e));
    setWsSupplierRequests(p=>[{...req,id:reqId,sent_at:sentAt},...p]);
  };

  const deleteWsSupplierRequest=async(id)=>{
    await Promise.all([
      api.delete("ws_supplier_requests","id",id).catch(e=>console.warn("Delete send failed:",e)),
      api.delete("ws_supplier_quotes","request_id",id).catch(()=>{}),
    ]);
    setWsSupplierRequests(p=>p.filter(r=>r.id!==id));
    setWsSupplierQuotes(p=>p.filter(q=>q.request_id!==id));
  };

  const generateWsSupplierQuoteLink=async(info,items)=>{
    const token=makeToken();
    const reqId=makeId("WSRQ");
    const now=new Date().toISOString();
    const rec={id:reqId,workshop_id:wsId||null,job_id:info.job_id||null,vehicle_reg:info.vehicle_reg||"",
      supplier_id:info.supplier_id||null,supplier_name:info.supplier_name||"",supplier_phone:info.supplier_phone||"",
      supplier_vat_inclusive:info.supplier_vat_inclusive||false,
      vehicle_make:info.vehicle_make||"",vehicle_model:info.vehicle_model||"",vehicle_year:info.vehicle_year||"",
      vehicle_color:info.vehicle_color||"",vin:info.vin||"",engine_no:info.engine_no||"",
      photo_front:info.photo_front||"",photo_rear:info.photo_rear||"",photo_side:info.photo_side||"",
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
    await refreshTables("ws_purchase_orders","ws_po_items");
    showToast(isNew?"Purchase order created":"Purchase order updated");
    return {id:poId,...rest};
  };

  const deleteWsPurchaseOrder=async(id)=>{
    await api.delete("ws_po_items","po_id",id);
    await api.delete("ws_purchase_orders","id",id);
    await refreshTables("ws_purchase_orders","ws_po_items");
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
    await refreshTables("ws_purchase_orders","ws_po_items","ws_supplier_invoices","ws_supplier_invoice_items","workshop_stock");
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

  const patchWsBooking=async(id,patch)=>{
    await api.patch("workshop_bookings","id",id,patch).catch(e=>console.warn("Patch booking failed:",e));
    setWsBookings(p=>p.map(b=>b.id===id?{...b,...patch}:b));
  };

  const deleteWsBooking=async(id,meta={})=>{
    const patch={
      status:"deleted",
      deleted_by:meta.deleted_by||"",
      deleted_reason:meta.deleted_reason||"",
      deleted_at:new Date().toISOString(),
    };
    const res=await api.patch("workshop_bookings","id",id,patch).catch(e=>{console.error("Delete booking failed:",e);return null;});
    if(res&&!Array.isArray(res)&&res.message) console.error("Delete booking DB error:",res.message);
    if(Array.isArray(res)&&res.length===0) console.warn("Delete booking: 0 rows updated — check Supabase RLS on workshop_bookings");
    setWsBookings(p=>p.map(b=>b.id===id?{...b,...patch}:b));
  };

  const refreshWsBookings=async()=>{
    const bk=await api.get("workshop_bookings",`select=*&order=created_at.desc${wsF}`).catch(()=>[]);
    setWsBookings(Array.isArray(bk)?bk:[]);
  };

  // ── Lightweight booking-count poll ──────────────────────────────
  // Runs continuously while inside the workshop module without re-triggering
  // the full loadAll() sync (which stays paused there to save reads/avoid
  // interrupting kanban work). Each tick is a HEAD request — no row data —
  // so it's cheap enough to run every 45s. Only does a real (cached-busting)
  // refresh + toast when the pending count actually goes up.
  const pendingBookingCountRef = useRef(null); // null until first successful check
  useEffect(()=>{
    if(!(role==="workshop"||role==="admin"||role==="manager")) return;
    const WORKSHOP_TABS=["workshop","wscustomers","wsquotations","wsinvoices","wspayments","wsstock","wsservices","wssuppliers","wssuporders","wssupinv","wstransfer","wsstatement","wsreport","wsspareshop"];
    const check=async()=>{
      if(document.hidden) return; // don't burn quota while backgrounded/minimized
      if(!WORKSHOP_TABS.includes(tabRef.current)) return; // only relevant inside the workshop module
      const n=await api.count("workshop_bookings",`status=eq.pending${wsF}`).catch(()=>null);
      if(n===null) return;
      if(pendingBookingCountRef.current!==null && n>pendingBookingCountRef.current){
        const added=n-pendingBookingCountRef.current;
        api.cacheInvalidate("workshop_bookings");
        await refreshWsBookings();
        showToast(`🔔 ${added} new booking${added>1?"s":""} received`);
      }
      pendingBookingCountRef.current=n;
    };
    check();
    const id=setInterval(check,45000);
    return ()=>clearInterval(id);
  },[role,wsF]); // eslint-disable-line react-hooks/exhaustive-deps

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
    await refreshTables("ws_supplier_invoices","ws_supplier_invoice_items","workshop_stock");
  };
  const deleteWsSupplierInvoice=async(id)=>{
    await api.delete("ws_supplier_invoice_items","invoice_id",id);
    await api.delete("ws_supplier_invoices","id",id);
    await refreshTables("ws_supplier_invoices","ws_supplier_invoice_items"); showToast("Invoice deleted","err");
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
    await refreshTables("ws_supplier_payments","ws_supplier_invoices"); showToast("Payment recorded");
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
    await refreshTables("ws_supplier_payments","ws_supplier_invoices"); showToast("Payment removed","err");
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
    await refreshTables("ws_supplier_returns","workshop_stock"); showToast("Return recorded & stock adjusted");
  };

  // ── Workshop Documents ────────────────────────────────────────
  const saveWsDocument=async(doc)=>{
    const chkR=(r,label)=>{ if(r&&!Array.isArray(r)&&(r.code||r.message))throw new Error(`${label}: ${r.message||r.code}`); return r; };
    chkR(await api.insert("workshop_documents",{...doc,id:makeId("WSD"),workshop_id:wsId||null,uploaded_at:new Date().toISOString()}),"Save document");
    await refreshTables("workshop_documents"); showToast("Document saved");
  };
  const deleteWsDocument=async(id)=>{
    await api.delete("workshop_documents","id",id);
    await refreshTables("workshop_documents"); showToast("Deleted","err");
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
    await refreshTables("workshop_stock","parts","stock_moves","inventory_logs");
    showToast("Transfer completed ✅");
  };

  const saveFitment=async(partId,vehicleId,notes="")=>{
    const r=await api.upsert("part_fitments",{part_id:partId,vehicle_id:vehicleId,notes});
    const row=Array.isArray(r)&&r[0]?r[0]:{part_id:partId,vehicle_id:vehicleId,notes};
    setPartFitments(prev=>{
      const exists=prev.find(f=>String(f.part_id)===String(partId)&&String(f.vehicle_id)===String(vehicleId));
      return exists?prev.map(f=>(String(f.part_id)===String(partId)&&String(f.vehicle_id)===String(vehicleId))?{...f,...row}:f):[...prev,row];
    });
    showToast("Vehicle linked");
  };
  const deleteFitment=async(id)=>{
    await api.delete("part_fitments","id",id);
    setPartFitments(prev=>prev.filter(f=>String(f.id)!==String(id)));
    showToast("Removed","err");
  };
  const saveVehicle=async(v)=>{
    const {id, ...data} = v;
    const res = id ? await api.patch("vehicles","id",id,data) : await api.insert("vehicles",data);
    if(res?.code||res?.message){
      if(res.code==="23505"&&(res.message||"").includes("code")){throw new Error("code_exists");}
      showToast("Unable to save vehicle","err");throw new Error("save failed");
    }
    await refreshTables("vehicles"); showToast("Vehicle saved");
  };
  const deleteVehicle=async(id)=>{
    await api.delete("vehicles","id",id);
    await refreshTables("vehicles"); showToast("Deleted","err");
  };
  const deletePart=async(id)=>{const p=parts.find(pt=>pt.id===id);setBusyMsg(`Deleting ${p?.sku||""}${p?.name?" · "+p.name:""}`);const t0=Date.now();try{if(p)await logInv(p,p.stock,0,"Delete Part","Deleted");await Promise.all([api.delete("part_suppliers","part_id",id),api.delete("part_fitments","part_id",id),api.delete("parts","id",id)]);setParts(prev=>prev.filter(pt=>String(pt.id)!==String(id)));db.parts.delete(id).catch(()=>{});setPartSuppliers(prev=>prev.filter(ps=>String(ps.part_id)!==String(id)));setPartFitments(prev=>prev.filter(f=>String(f.part_id)!==String(id)));const ms=Date.now()-t0;showToast(`Deleted in ${ms<1000?(ms+"ms"):((ms/1000).toFixed(1)+"s")}`,"err");}finally{setBusyMsg(null);}};
  const approvePart=async(id)=>{await api.patch("parts","id",id,{review_status:null,created_by_branch_id:null});await refreshTables("parts");showToast("✅ Part approved");};
  const applyAdjust=async(part,nq,reason)=>{
    await api.patch("parts","id",part.id,{stock:nq});
    await logInv(part,part.stock,nq,"Manual Adj.",reason||"Manual");
    setParts(prev=>prev.map(p=>String(p.id)===String(part.id)?{...p,stock:nq}:p));
    db.parts.update(part.id,{stock:nq}).catch(()=>{});
    closeM("adjust");
    showToast(`Stock → ${nq}`);
    if(nq<part.stock) await checkAutoReorder(part.id,nq);
    // Branch: also update branch_stock and check branch reorder
    if(_bId&&nq<part.stock){
      const bs=branchStock.find(b=>String(b.branch_id)===String(_bId)&&String(b.part_id)===String(part.id));
      if(bs?.id){await api.patch("branch_stock","id",bs.id,{stock:nq,updated_at:new Date().toISOString()});await checkAutoReorder(part.id,nq,_bId);}
    }
  };

  // Suppliers
  const saveSupplier=async(data)=>{
    const es=mData("editSupplier");
    if(es){
      // only allow editing branch-owned suppliers (or admin editing any)
      if(role!=="admin"&&es.branch_id!==user.branch_id)return showToast("Cannot edit a global supplier","err");
      await api.patch("suppliers","id",es.id,data);
    } else {
      await api.upsert("suppliers",{...data,...(isBranchUser?{branch_id:user.branch_id}:{})});
    }
    await refreshTables("suppliers");closeM("editSupplier");showToast(es?"Supplier updated":"Supplier added");
  };
  const deleteSupplier=async(id)=>{
    const s=suppliers.find(x=>x.id===id);
    if(s&&role!=="admin"&&s.branch_id!==user.branch_id)return showToast("Cannot delete a global supplier","err");
    await api.delete("suppliers","id",id);await refreshTables("suppliers");showToast("Deleted","err");
  };
  const savePartSupplier=async(data)=>{
    // Save-time duplicate guard: check live DB for same supplier + part no on a different main-branch part
    if(data.supplier_part_no&&isBranchUser){
      const existing=await api.get("part_suppliers",`supplier_id=eq.${data.supplier_id}&supplier_part_no=eq.${encodeURIComponent(data.supplier_part_no)}`);
      if(Array.isArray(existing)){
        const mainBranchId=branches.find(b=>b.is_main)?.id;
        const conflict=existing.find(ps=>{
          if(String(ps.part_id)===String(data.part_id)) return false;
          const p=parts.find(x=>String(x.id)===String(ps.part_id));
          return p&&(!p.branch_id||p.branch_id===mainBranchId);
        });
        if(conflict){
          const cp=parts.find(x=>String(x.id)===String(conflict.part_id));
          showToast(cp?`🚫 Already linked to ${cp.sku} in main branch — use that part`:`🚫 Supplier code already linked to a main branch part`,"err");
          return;
        }
      }
    }
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
    if(Array.isArray(res)&&res.length){
      setPartSuppliers(prev=>{
        const ids=new Set(res.map(r=>r.id));
        return [...prev.filter(ps=>!ids.has(ps.id)), ...res];
      });
    }
    showToast("Supplier linked!");
  };
  const updatePartSupplier=async(id,data)=>{
    const res = await api.patch("part_suppliers","id",id,data);
    if(res?.code) { showToast(`Error: ${res.message||res.code}`,"err"); return; }
    if(Array.isArray(res)&&res.length){
      setPartSuppliers(prev=>prev.map(ps=>ps.id===res[0].id?res[0]:ps));
    }
    showToast("Updated!");
  };
  const deletePartSupplier=async(id)=>{await api.delete("part_suppliers","id",id);setPartSuppliers(prev=>prev.filter(ps=>ps.id!==id));showToast("Removed","err");};
  const deletePartSupplierMany=async(ids)=>{for(const id of ids)await api.delete("part_suppliers","id",id);await reloadPartSuppliers();showToast(`Removed ${ids.length} link${ids.length>1?"s":""}`, "err");};
  const mergePart=async(sourceId,targetId)=>{
    // Move supplier links — skip if target already has same supplier
    const sourcePSs=partSuppliers.filter(ps=>String(ps.part_id)===String(sourceId));
    const targetSupIds=new Set(partSuppliers.filter(ps=>String(ps.part_id)===String(targetId)).map(ps=>ps.supplier_id));
    for(const ps of sourcePSs){
      if(targetSupIds.has(ps.supplier_id)) await api.delete("part_suppliers","id",ps.id);
      else await api.patch("part_suppliers","id",ps.id,{part_id:+targetId});
    }
    // Move inventory logs
    await api.patch("inventory_logs","part_id",sourceId,{part_id:+targetId});
    // Delete source part
    await api.delete("parts","id",sourceId);
    await refreshTables("parts","inventory_logs");
    closeM("partSupplier");
    showToast("Merged & deleted!");
  };

  // Inquiries — accepts one supplier's data or an array (batch send to multiple
  // suppliers at once). Creates an inquiries row per supplier, then opens a
  // one-by-one WhatsApp/email send queue so every selected supplier actually
  // gets stepped through instead of only the last one in the batch.
  const sendInquiry=async(dataOrList)=>{
    const list=Array.isArray(dataOrList)?dataOrList:[dataOrList];
    const queue=[];
    for(const data of list){
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
        ...(_bId?{branch_id:_bId}:{}),
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
        showToast(`Error sending to ${supplier_name}: ${res.message||res.code}`, "err");
        continue;
      }
      queue.push({...data, token});
    }
    await refreshTables("inquiries");closeM("inquiry");
    if(queue.length>0) openM("rfqSend",{queue,index:0});
  };
  const updateInquiry=async(id,data)=>{await api.patch("inquiries","id",id,data);await refreshTables("inquiries");showToast("Updated");};

  // Record a supplier's quote directly (e.g. after a phone call) without going
  // through the WhatsApp/email RFQ round-trip. Updates the existing inquiry if
  // one's already open for this supplier+part, otherwise creates one pre-filled
  // as already replied.
  const saveManualQuote=async({part,supplier,qty,price,stock,notes,supplierPartNo,existingId})=>{
    const replyFields={
      reply_price:price!==""?+price:null,
      reply_stock:stock!==""?+stock:null,
      reply_notes:notes||"",
      supplier_part_no:supplierPartNo||"",
      status:"replied",
      replied_at:new Date().toISOString(),
    };
    if(existingId){
      await api.patch("inquiries","id",existingId,replyFields);
      await refreshTables("inquiries");
      showToast("Quote updated");
      return;
    }
    const record={
      id:makeId("INQ"),
      rfq_token:makeToken(),
      created_by:user.name||user.username,
      ...(_bId?{branch_id:_bId}:{}),
      part_id:part.id, part_name:part.name, part_sku:part.sku,
      part_oe_number:part.oe_number||"", part_make:part.make||"",
      part_model:part.model||"", part_year:part.year_range||"",
      supplier_id:supplier.id, supplier_name:supplier.name,
      supplier_email:supplier.email||"", supplier_phone:supplier.phone||"",
      qty_requested:qty||1, message:"(Manually recorded — no RFQ sent)",
      ...replyFields,
    };
    const res=await api.upsert("inquiries",record);
    if(!Array.isArray(res)&&res?.code){ showToast(`Error: ${res.message||res.code}`,"err"); return; }
    await refreshTables("inquiries");
    showToast("Quote saved");
  };

  const acceptInquiry=async(inq)=>{
    if(!inq.reply_price) return;
    const invId=makeId(settings.invoice_prefix||"INV");
    const lineItem={
      invoice_id:invId,
      part_id:inq.part_id?+inq.part_id:null, part_name:inq.part_name||"",
      part_sku:inq.part_sku||"", supplier_part_id:inq.supplier_part_no||"",
      qty:+inq.qty_requested||1, unit_cost:+inq.reply_price||0,
      total:(+inq.qty_requested||1)*(+inq.reply_price||0)
    };
    const inv={
      id:invId, supplier_id:+inq.supplier_id||null, supplier_name:inq.supplier_name,
      invoice_date:today(), status:"unpaid",
      total:lineItem.total, rfq_inquiry_id:inq.id,...(_bId?{branch_id:_bId}:{})
    };
    const invRes=await api.insert("supplier_invoices",inv);
    if(!Array.isArray(invRes)&&invRes?.code){ showToast(`Error creating invoice: ${invRes.message||invRes.code}`,"err"); return; }
    const itemRes=await api.insert("supplier_invoice_items",lineItem);
    if(!Array.isArray(itemRes)&&itemRes?.code){ showToast(`Error creating invoice line: ${itemRes.message||itemRes.code}`,"err"); return; }
    // Stock is added later via the "Stock In" button on this invoice (once parts
    // actually arrive) — same as any other purchase invoice — not here, so
    // ordering doesn't make stock look available before it physically is.
    await api.patch("inquiries","id",inq.id,{status:"ordered"});
    await refreshTables("inquiries","supplier_invoices","parts","inventory_logs");
    showToast(`✅ PO ${invId} created`);
    // Let the user notify the supplier (WhatsApp/email) or just note that they
    // phoned them — instead of yanking them away to the Purchase Invoices tab.
    openM("poConfirm",{
      invoiceId:invId, supplierName:inq.supplier_name,
      supplierPhone:inq.supplier_phone||"", supplierEmail:inq.supplier_email||"",
      partName:inq.part_name, partSku:inq.part_sku||"", supplierPartNo:inq.supplier_part_no||"",
      qty:inq.qty_requested||1, price:inq.reply_price,
    });
  };

  // Undo an accepted quote — deletes the PO it created (matched via the
  // rfq_inquiry_id acceptInquiry stamps on it), drops the inquiry back to
  // "replied" so it's actionable again, and — only if the invoice had already
  // been stocked in via the "Stock In" button — reverses that stock too.
  const cancelOrder=async(inq)=>{
    if(!window.confirm(`Cancel the order for ${inq.qty_requested||1} × ${inq.part_name} from ${inq.supplier_name}?\n\nThis deletes the purchase invoice it created.`)) return;
    const invs=await api.fresh("supplier_invoices",`rfq_inquiry_id=eq.${encodeURIComponent(inq.id)}&select=id,stocked_in`).catch(()=>[]);
    const wasStockedIn=Array.isArray(invs)&&invs.some(inv=>inv.stocked_in);
    for(const inv of (Array.isArray(invs)?invs:[])){
      await api.delete("supplier_invoice_items","invoice_id",inv.id);
      await api.delete("supplier_invoices","id",inv.id);
    }
    if(wasStockedIn){
      const part=parts.find(p=>String(p.id)===String(inq.part_id));
      if(part){
        const ns=Math.max(0,part.stock-(inq.qty_requested||1));
        await api.patch("parts","id",part.id,{stock:ns});
        await logInv(part,part.stock,ns,"Stock Out",`Cancelled PO — RFQ ${inq.id}`);
      }
    }
    await api.patch("inquiries","id",inq.id,{status:"replied"});
    await refreshTables("inquiries","supplier_invoices","parts","inventory_logs");
    showToast("Purchase order cancelled","err");
  };

  // Customer Queries
  const submitCustomerQuery=async(data)=>{
    await api.insert("customer_queries",{...data,...(_bId?{branch_id:_bId}:{})});
    const q=await api.get("customer_queries",`${_bId?`branch_id=eq.${_bId}&`:""}select=*&order=created_at.desc`).catch(()=>[]);
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

  // Workshop Feedback — sent from the floating button inside the Workshop module.
  // One-way: workshop users never read this list back, only admin does (see workshopfeedback tab).
  const submitWorkshopFeedback=async(data)=>{
    await api.insert("workshop_feedback",{
      ...data, id:makeId("WSFB"),
      workshop_id:wsId||null, workshop_name:workshopProfile?.name||"",
      status:"new", created_at:new Date().toISOString(),
    }).catch(()=>{});
    showToast("✅ Feedback sent — thank you!");
  };
  const markWsFeedbackStatus=async(id,status)=>{
    await api.patch("workshop_feedback","id",id,{status});
    setWorkshopFeedback(p=>p.map(f=>f.id===id?{...f,status}:f));
  };
  const replyToWsFeedback=async(id,admin_reply)=>{
    await api.patch("workshop_feedback","id",id,{admin_reply,status:"read"});
    setWorkshopFeedback(p=>p.map(f=>f.id===id?{...f,admin_reply,status:"read"}:f));
    showToast("✅ Reply saved");
  };

  // Supplier Invoices
  const saveSupplierInvoice=async(data,items)=>{
    const {inv:invRaw,isNew}=data;
    // Use branch_admin's own branch (_bId) OR the currently-selected branch (branchId for admin viewing a branch)
    const effectiveBranchId=_bId||branchId||null;
    const inv={...invRaw,...(effectiveBranchId?{branch_id:effectiveBranchId}:{})};
    const saved=await api.upsert("supplier_invoices",inv);
    // Delete all existing line items then re-insert — handles row deletions correctly
    if(!isNew) await api.delete("supplier_invoice_items","invoice_id",inv.id);
    if(items.length){
      const rows=items.map(item=>{const {id:_id,_k,_st,_hits,_drop,_skuPart,_skuLinks,_needsBranchSetup,...clean}=item;return{...clean,invoice_id:inv.id,part_id:clean.part_id?+clean.part_id:null,qty:+clean.qty||1,unit_cost:+clean.unit_cost||0,total:(+clean.qty||1)*(+clean.unit_cost||0)};});
      await api.insert("supplier_invoice_items",rows);
    }
    const savedInv=Array.isArray(saved)&&saved[0]?saved[0]:inv;
    if(isNew) setSupplierInvoices(prev=>[savedInv,...prev]);
    else setSupplierInvoices(prev=>prev.map(si=>si.id===inv.id?{...si,...savedInv}:si));
    closeM("supplierInvoice");showToast(isNew?"Invoice saved":"Invoice updated");
  };
  const stockInInvoice=async(inv)=>{
    const rows=await api.get("supplier_invoice_items",`invoice_id=eq.${encodeURIComponent(inv.id)}&select=*`);
    if(!Array.isArray(rows)||rows.length===0){showToast("No line items found for this invoice","err");return;}
    let stocked=0,skipped=0;
    const stockedPartIds=[];
    // Determine effective branch — no + coercion (branch IDs are UUIDs)
    const invBranchId=inv.branch_id||_bId||branchId||null;
    // Fetch FRESH branch_stock from DB to avoid stale React state
    const freshBranchStock=invBranchId
      ? await api.get("branch_stock",`branch_id=eq.${invBranchId}&select=*`)
      : [];
    for(const item of rows){
      if(!item.part_id){skipped++;continue;}
      const catalogPart=parts.find(p=>+p.id===+item.part_id);
      if(!catalogPart){skipped++;continue;}
      if(invBranchId){
        // Branch invoice → update branch_stock table (not parts.stock)
        const existing=Array.isArray(freshBranchStock)
          ? freshBranchStock.find(bs=>+bs.part_id===+item.part_id)
          : null;
        const before=+(existing?.stock)||0;
        const after=before+(+item.qty||0);
        if(existing?.id){
          await api.patch("branch_stock","id",existing.id,{stock:after,updated_at:new Date().toISOString()});
        } else {
          // Use upsert to handle unique constraint on (branch_id, part_id)
          await api.upsert("branch_stock",{branch_id:invBranchId,part_id:+item.part_id,stock:after,updated_at:new Date().toISOString()});
        }
        await logInv(catalogPart,before,after,"Stock In",`Invoice ${inv.id}`);
      } else {
        // Main branch invoice → update parts.stock directly
        const before=+catalogPart.stock||0;
        const after=before+(+item.qty||0);
        await api.patch("parts","id",+catalogPart.id,{stock:after});
        await logInv(catalogPart,before,after,"Stock In",`Invoice ${inv.id}`);
      }
      stockedPartIds.push(String(item.part_id));
      stocked++;
    }
    if(stocked>0) await api.patch("supplier_invoices","id",inv.id,{stocked_in:true});
    await refreshTables("supplier_invoices","parts","branch_stock","inventory_logs");
    closeM("supplierInvoice");
    if(stocked>0){
      showToast(`Stocked in: ${stocked} part(s) updated${skipped?`, ${skipped} skipped (no part link)`:""}`);
      // Show popup if any confirmed/pending/quoted workshop BSRs contain these parts
      const matchedBsrs=branchStockRequests.filter(r=>
        ["pending","quoted","confirmed"].includes(r.status)&&r.workshop_id&&
        Array.isArray(r.items)&&r.items.some(i=>stockedPartIds.includes(String(i.partId)))
      );
      if(matchedBsrs.length) setWsReadyPopup(matchedBsrs);
    } else showToast(`No linked parts — ${skipped} item(s) have no part match. Link parts first.`,"err");
  };
  const deleteSupplierInvoice=async(id)=>{
    await api.delete("supplier_invoice_items","invoice_id",id);
    await api.delete("supplier_invoices","id",id);
    await refreshTables("supplier_invoices");closeM("supplierInvoice");showToast("Invoice deleted","err");
  };

  // Supplier Returns
  const saveSupplierReturn=async(data,items)=>{
    await api.upsert("supplier_returns",{...data,...(_bId?{branch_id:_bId}:{})});
    for(const item of items){
      await api.insert("supplier_return_items",{...item,return_id:data.id});
      const part=parts.find(p=>p.id===item.part_id);
      if(part){const ns=Math.max(0,part.stock-item.qty);await api.patch("parts","id",item.part_id,{stock:ns});await logInv(part,part.stock,ns,"Stock Out",`Return ${data.id}`);}
    }
    await refreshTables("supplier_returns","parts","inventory_logs");closeM("supplierReturn");showToast("Return recorded & stock adjusted");
  };

  // POS — instant sale: create invoice + items + deduct stock in one go
  const savePosInvoice=async(cart,customer,payMethod,cashReceived,change,discount,existingQuoteId=null)=>{
    const invId=existingQuoteId||makeId("INV");
    const subtotal=cart.reduce((s,i)=>s+(i.qty*i.price),0);
    const total=Math.max(0,subtotal-(discount||0));
    const payPayload={
      customer_id:customer?.id||null,
      customer_name:customer?.name||"Walk-in",
      customer_phone:customer?.phone||"",
      date:new Date().toISOString().slice(0,10),
      subtotal,
      discount:discount||0,
      total,
      status:"paid",
      payment_method:payMethod,
      cash_received:payMethod==="cash"?cashReceived:null,
      change_given:payMethod==="cash"?change:null,
      is_pos:true,
      created_by:user.name||user.username,
      ...(_bId?{branch_id:_bId}:{}),
    };
    if(existingQuoteId){
      // Convert saved quote to paid invoice — patch header, replace items
      await api.patch("customer_invoices","id",existingQuoteId,payPayload);
      await api.delete("customer_invoice_items","invoice_id",existingQuoteId);
    } else {
      await api.insert("customer_invoices",{id:invId,...payPayload,created_at:new Date().toISOString()});
    }
    for(const it of cart){
      await api.insert("customer_invoice_items",{
        id:makeId("CIVI"),
        invoice_id:invId,
        part_id:it.part_id,
        part_name:it.name,
        part_sku:it.sku,
        qty:it.qty,
        unit_price:it.price,
        total:it.qty*it.price,
      });
      const part=parts.find(p=>+p.id===+it.part_id);
      if(part){
        const ns=Math.max(0,(+part.stock||0)-it.qty);
        await api.patch("parts","id",it.part_id,{stock:ns});
        await logInv(part,part.stock,ns,"POS Sale",invId);
        await checkAutoReorder(it.part_id,ns);
      }
    }
    await refreshTables("customer_invoices","parts","inventory_logs");
    showToast(`✅ Sale complete — ${C()}${total.toFixed(2)}`);
    return invId;
  };

  // Customer Invoices
  const saveCustomerInvoice=async(inv,items)=>{
    await api.upsert("customer_invoices",{...inv,...(_bId?{branch_id:_bId}:{})});
    for(const item of items) await api.insert("customer_invoice_items",{...item,invoice_id:inv.id});
    // Auto-update linked order status to Invoiced
    if(inv.order_id){
      await api.patch("orders","id",inv.order_id,{status:"Invoiced"});
    }
    await refreshTables("customer_invoices","orders");closeM("customerInvoice");showToast("✅ Invoice created — awaiting payment");
    // After saving, alert clerk if there are confirmed workshop requests awaiting preparation
    const wsConfirmed=branchStockRequests.filter(r=>r.status==="confirmed"&&r.workshop_id);
    if(wsConfirmed.length) setWsReadyPopup(wsConfirmed);
  };

  // Customer Returns
  const saveCustomerReturn=async(data,items)=>{
    await api.upsert("customer_returns",{...data,...(_bId?{branch_id:_bId}:{})});
    for(const item of items){
      await api.insert("customer_return_items",{...item,return_id:data.id});
      const part=parts.find(p=>p.id===item.part_id);
      if(part){const ns=part.stock+item.qty;await api.patch("parts","id",item.part_id,{stock:ns});await logInv(part,part.stock,ns,"Return In",`Customer Return ${data.id}`);}
    }
    await refreshTables("customer_returns","parts","inventory_logs");closeM("customerReturn");showToast("Return recorded & stock restored");
  };

  // Customers / Users
  const saveCustomer=async(data)=>{const ec=mData("editCustomer");if(ec)await api.patch("customers","id",ec.id,data);else await api.upsert("customers",{...data,orders:0,total_spent:0,branch_id:currentBranch?.id||null});await refreshTables("customers");closeM("editCustomer");showToast(ec?"Updated":"Added");};
  const deleteCustomer=async(id)=>{await api.delete("customers","id",id);await refreshTables("customers");showToast("Deleted","err");};
  const saveUser=async(data)=>{const eu=mData("editUser");if(eu?.id)await api.patch("users","id",eu.id,data);else await api.upsert("users",data);await refreshTables("users");closeM("editUser");showToast(eu?.id?"Updated":"Added");};
  const deleteUser=async(id)=>{if(id===user.id){showToast("Cannot delete yourself","err");return;}await api.delete("users","id",id);await refreshTables("users");showToast("Deleted","err");};
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
    // Auto-apply pending linked branch from QR registration if not already set
    if (!payload.linked_branch_id) {
      try { const pb=localStorage.getItem("ap_pending_linked_branch"); if(pb){payload.linked_branch_id=pb;localStorage.removeItem("ap_pending_linked_branch");} } catch {}
    }
    // Check if row already exists
    const existing=await api.get("workshop_profiles",`id=eq.${wsId}&select=id`).catch(()=>[]);
    let res;
    if(Array.isArray(existing)&&existing.length>0){
      res=await api.patch("workshop_profiles","id",wsId,payload);
    } else {
      // New profile — seed name from the logged-in user if not provided
      if(!payload.name) payload.name = user.name||"";
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

  const saveScrapProfile=async(data)=>{
    const payload={...data, id:scrapId};
    const existing=await api.get("scrapyard_profiles",`id=eq.${scrapId}&select=id`).catch(()=>[]);
    let res;
    if(Array.isArray(existing)&&existing.length>0){
      res=await api.patch("scrapyard_profiles","id",scrapId,payload);
    } else {
      res=await api.insert("scrapyard_profiles",payload);
    }
    if(res&&!Array.isArray(res)&&res.message){
      showToast(`❌ Save failed: ${res.message}`,"err");
      return;
    }
    setWorkshopProfile(p=>({...p,...data}));
    if(data.label_width_mm||data.label_height_mm) updateSettings({label_width_mm:data.label_width_mm||98,label_height_mm:data.label_height_mm||45});
    showToast("✅ Scrapyard settings saved");
  };
  // ── RFQ functions ──────────────────────────────────────────
  const createRfqSession=async(name,deadline,selectedParts,selectedSuppliers)=>{
    const sid=makeId("RFQ");
    await api.insert("rfq_sessions",{
      id:sid, name, status:"draft", deadline:deadline||"",
      created_by:user.name||user.username, created_at:new Date().toISOString(),
      ...(_bId?{branch_id:_bId}:{})
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
    await refreshTables("rfq_sessions","rfq_items","rfq_quotes");
    showToast(`✅ RFQ created — ${items.length} parts × ${selectedSuppliers.length} suppliers`);
    return sid;
  };

  const updateRfqStatus=async(sid,status)=>{
    await api.patch("rfq_sessions","id",sid,{status});
    await refreshTables("rfq_sessions");
  };

  // ── Auto-reorder: create RFQ for one part → one supplier ─────────────────
  const REORDER_DEADLINE_HOURS=24;

  const createAutoRfq=async(part,sup,attemptCount=1,prevSid=null)=>{
    const sid=makeId("RFQ");
    const deadline=new Date(Date.now()+REORDER_DEADLINE_HOURS*3600*1000).toISOString();
    await api.insert("rfq_sessions",{
      id:sid, name:`Auto-Reorder: ${part.name}`, status:"pending",
      deadline:"", is_auto:true, auto_part_id:String(part.id),
      attempt_count:attemptCount, last_sent_at:new Date().toISOString(),
      reply_deadline:deadline, escalated_supplier_id:null,
      created_by:"system", created_at:new Date().toISOString(),
      ...(_bId?{branch_id:_bId}:{})
    });
    const itemId=makeId("RFQI");
    await api.insert("rfq_items",{
      id:itemId, rfq_id:sid,
      part_id:String(part.id), part_name:part.name, part_sku:part.sku||"",
      part_chinese_desc:part.chinese_desc||"", oe_number:part.oe_number||"",
      make:part.make||"", model:part.model||"", qty_needed:part.reorder_qty||1
    });
    await api.insert("rfq_quotes",{
      id:makeId("RFQQ"), rfq_id:sid, rfq_item_id:itemId,
      supplier_id:String(sup.id), supplier_name:sup.name,
      supplier_part_no:"", unit_price:null, stock_qty:null, lead_days:null,
      notes:"", token:makeToken(), status:"pending", availability:"pending",
      created_at:new Date().toISOString()
    });
    // Close previous session if escalating
    if(prevSid) await api.patch("rfq_sessions","id",prevSid,{status:"escalated"});
    await refreshTables("rfq_sessions","rfq_items","rfq_quotes");
    showToast(`📋 Auto-RFQ sent to ${sup.name} for ${part.name} (attempt ${attemptCount})`);
    return sid;
  };

  // Called after any stock decrease — creates auto-RFQ if configured
  // branchId: if provided, checks branch_stock reorder config instead of global part config
  const checkAutoReorder=async(partId,newStock,branchId=null)=>{
    if(branchId){
      // Per-branch reorder: use branch_stock entry config
      const bs=branchStock.find(b=>String(b.branch_id)===String(branchId)&&String(b.part_id)===String(partId));
      if(!bs?.auto_reorder||!bs.preferred_supplier_id)return;
      if(newStock>bs.reorder_point)return;
      const existing=rfqSessions.find(s=>s.is_auto&&s.auto_part_id===String(partId)&&String(s.branch_id)===String(branchId)&&["pending","draft"].includes(s.status));
      if(existing)return;
      const sup=suppliers.find(s=>+s.id===+bs.preferred_supplier_id);
      if(!sup)return;
      const part=parts.find(p=>+p.id===+partId);
      if(!part)return;
      await createAutoRfq({...part,reorder_qty:bs.reorder_qty||1},sup,1,null);
      return;
    }
    // Global part-level reorder
    const part=parts.find(p=>+p.id===+partId);
    if(!part?.auto_reorder||!part.preferred_supplier_id)return;
    if(newStock>part.reorder_point)return;
    const existing=rfqSessions.find(s=>s.is_auto&&s.auto_part_id===String(partId)&&!s.branch_id&&["pending","draft"].includes(s.status));
    if(existing)return;
    const sup=suppliers.find(s=>+s.id===+part.preferred_supplier_id);
    if(!sup)return;
    await createAutoRfq({...part,reorder_qty:part.reorder_qty||1},sup,1,null);
  };

  // Runs on app load — finds overdue auto-RFQs, resends or escalates
  const checkStaleRfqs=async()=>{
    const now=new Date();
    const stale=rfqSessions.filter(s=>
      s.is_auto&&s.status==="pending"&&s.reply_deadline&&new Date(s.reply_deadline)<now
    );
    for(const rfq of stale){
      const part=parts.find(p=>String(p.id)===String(rfq.auto_part_id));
      if(!part)continue;
      if((rfq.attempt_count||1)<3){
        // Resend to same supplier
        const quote=rfqQuotes.find(q=>q.rfq_id===rfq.id);
        if(!quote)continue;
        const sup=suppliers.find(s=>String(s.id)===String(quote.supplier_id));
        if(!sup)continue;
        await createAutoRfq(part,sup,(rfq.attempt_count||1)+1,rfq.id);
      } else {
        // Escalate — find next supplier from part_suppliers
        const partSupps=await api.get("part_suppliers",`part_id=eq.${part.id}&select=*`);
        const currentQuote=rfqQuotes.find(q=>q.rfq_id===rfq.id);
        const usedIds=rfqSessions
          .filter(s=>s.is_auto&&s.auto_part_id===String(part.id))
          .map(s=>rfqQuotes.find(q=>q.rfq_id===s.id)?.supplier_id).filter(Boolean).map(String);
        const nextPs=Array.isArray(partSupps)?partSupps.find(ps=>!usedIds.includes(String(ps.supplier_id))):null;
        if(nextPs){
          const nextSup=suppliers.find(s=>+s.id===+nextPs.supplier_id);
          if(nextSup){
            await createAutoRfq(part,nextSup,1,rfq.id);
            showToast(`⚠️ No reply from previous supplier — escalated to ${nextSup.name}`,"err");
            continue;
          }
        }
        // No more suppliers — mark failed, alert admin
        await api.patch("rfq_sessions","id",rfq.id,{status:"no_supplier"});
        await refreshTables("rfq_sessions");
        showToast(`❌ Auto-reorder failed for ${part.name} — no supplier responded. Manual action needed.`,"err");
      }
    }
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
        status:"unpaid", total, notes:`From RFQ ${sid}`,...(_bId?{branch_id:_bId}:{})
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
    await refreshTables("rfq_sessions","supplier_invoices","parts","inventory_logs");
    showToast(`✅ ${Object.keys(bySupplier).length} Purchase Order(s) created`);
    setTab("purchaseInvoices");
  };

  const saveStockMove=async(data)=>{
    const mv={...data, id:makeId("MV"), moved_by:user.name||user.username, moved_at:new Date().toISOString(),...(_bId?{branch_id:_bId}:{})};
    await api.insert("stock_moves", mv);
    // Update part bin_location if specified
    if(data.to_bin&&data.part_id){
      await api.patch("parts","id",data.part_id,{bin_location:data.to_bin});
    }
    await refreshTables("stock_moves","parts"); closeM("stockMove"); showToast("✅ Stock moved");
  };

  const startStockTake=async(name, selectedPartIds)=>{
    if(!parts||parts.length===0){
      showToast("⚠ No parts found","err"); return null;
    }
    const stId=makeId("ST");
    const st={
      id:stId, name:name||`Stock Take ${today()}`, status:"open",
      created_by:user.name||user.username, created_at:new Date().toISOString(),
      ...(_bId?{branch_id:_bId}:{})
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
    await refreshTables("stock_takes","parts");
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
    await refreshTables("stock_takes","parts","inventory_logs");
  };

  const reopenStockTake=async(stId)=>{
    await api.patch("stock_takes","id",stId,{status:"open"});
    await refreshTables("stock_takes");
    showToast("🔄 Stock take reopened for double check");
  };

  const savePayment=async(data)=>{
    await api.upsert("payments",{...data,id:data.id||makeId("PAY"),created_by:user.name||user.username,...(_bId?{branch_id:_bId}:{})});
    // Auto-update linked invoice status to paid
    if(data.reference_id){
      if(data.type==="receipt"){
        await api.patch("customer_invoices","id",data.reference_id,{status:"paid"});
        // Also mark the linked order as Paid
        const inv=customerInvoices.find(i=>i.id===data.reference_id);
        if(inv?.order_id) await api.patch("orders","id",inv.order_id,{status:"Paid"});
      } else if(data.type==="payment"){
        await api.patch("supplier_invoices","id",data.reference_id,{status:"paid"});
      }
    }
    await refreshTables("payments","customer_invoices","supplier_invoices","orders");closeM("addPayment");showToast("✅ Payment recorded & invoice marked paid");
  };
  const deletePayment=async(id)=>{await api.delete("payments","id",id);await refreshTables("payments");showToast("Deleted","err");};

  // Derived
  const CATS=lang==="en"?CATS_EN:CATS_ZH;
  const allCat="__all__",allOS="__all__";
  const branchId=currentBranch?.id||null; // null = all branches (admin only)
  const mainBranchId=branches.find(b=>b.is_main)?.id||null;
  // branch_admin can only edit parts they own — not main catalog parts
  const canEditPart=(p)=>role==="admin"||(role==="branch_admin"&&p.branch_id===branchId);
  // branch_stock overlay — merge per-branch qty/price/bin over main catalog for branch_admin display
  const branchStockMap=Object.fromEntries(branchStock.map(bs=>[String(bs.part_id),bs]));
  // When admin filters by a specific branch, build a map of that branch's stock entries
  const filterBranchStockMap=(role==="admin"&&filterBranch!=="__all__"&&filterBranch!=="main")
    ?Object.fromEntries(branchStock.filter(bs=>String(bs.branch_id)===filterBranch).map(bs=>[String(bs.part_id),bs]))
    :null;
  const displayParts=isBranchUser
    ?parts.map(p=>{
        const isMainCatalog=!p.branch_id||p.branch_id===mainBranchId;
        if(!isMainCatalog)return {...p,_bsSet:true}; // branch's own part — stock is in parts table directly
        const bs=branchStockMap[String(p.id)];
        // Always replace stock & bin with branch values (0/blank until set)
        return{...p,
          stock:     bs ? bs.stock             : 0,
          bin_location: bs?.bin_location        ?? null,
          price:     bs?.price                  ?? p.price,
          cost_price:bs?.cost_price             ?? p.cost_price,
          min_stock: bs ? bs.min_stock          : 0,
          _bsId:     bs?.id,
          _bsSet:    !!bs, // false = branch_stock not yet configured for this part
        };
      })
    :parts;
  const pendingPartRequests=partRequests.filter(r=>r.status==="pending").length||0;
  const pendingVehicleRequests=vehicleRequests.filter(r=>r.status==="pending").length||0;
  const pendingTransferRequests=branchStockRequests.filter(r=>r.status==="pending"||r.status==="quoted"||r.status==="confirmed"||r.status==="dispatched").length||0;
  const pendingWsShopRequests=wsShopRequests.filter(r=>isBranchUser?r.status==="pending":r.status==="escalated").length||0;
  // Multi-word search using DEBOUNCED value — fast typing won't lag UI
  const suppNoByPart={};
  partSuppliers.forEach(ps=>{if(ps.supplier_part_no)suppNoByPart[ps.part_id]=(suppNoByPart[ps.part_id]||[]).concat(ps.supplier_part_no.toLowerCase());});
  const supplierFilterPartIds=filterSupplier!=="__all__"
    ?new Set(partSuppliers.filter(ps=>String(ps.supplier_id)===filterSupplier).map(ps=>String(ps.part_id)))
    :null;
  const fp=displayParts.filter(p=>{
    // role-based access filter
    if(role==="branch_admin"){
      const isMainCatalog=!p.branch_id||p.branch_id===mainBranchId;
      const isOwnBranch=p.branch_id===branchId;
      if(!isMainCatalog&&!isOwnBranch)return false;
    } else if(branchId){
      const isMain=!p.branch_id||p.branch_id===mainBranchId;
      if(!isMain&&p.branch_id!==branchId)return false;
    }
    // user-chosen branch sub-filter
    if(filterBranch!=="__all__"){
      if(filterBranch==="main"){
        if(p.branch_id&&p.branch_id!==mainBranchId)return false;
      } else if(filterBranchStockMap!==null){
        // admin filtering by a specific branch
        if(branchMatchedOnly==="matched"&&!filterBranchStockMap[String(p.id)])return false;
      } else if(role==="branch_admin"&&filterBranch===String(branchId)){
        // branch_admin viewing "My Branch"
        const isOwnPart=String(p.branch_id)===String(branchId);
        const isMainCatalog=!p.branch_id||p.branch_id===mainBranchId;
        if(branchMatchedOnly==="own"){
          if(!isOwnPart)return false; // only parts created by this branch
        } else if(branchMatchedOnly==="matched"){
          if(!isOwnPart&&!(isMainCatalog&&branchStockMap[String(p.id)]))return false;
        } else {
          // "all" — show own parts + all main catalog parts
          if(!isOwnPart&&!isMainCatalog)return false;
        }
      } else {
        if(p.branch_id!==filterBranch)return false;
      }
    }
    if(isDemo&&!(p.image_url||p.image_data))return false; // demo: only parts with photos
    if(filterLow&&p.stock>p.min_stock)return false;
    if(filterQuantum&&!p.is_quantum)return false;
    if(filterHiace&&!p.is_hiace)return false;
    if(filterInStock&&!(p.stock>0))return false;
    if(filterNoPhoto&&(p.image_url||p.image_data))return false;
    if(supplierFilterPartIds&&!supplierFilterPartIds.has(String(p.id)))return false;
    if(filterPendingReview&&p.review_status!=="pending")return false;
    if(filterCat!=="__all__"&&p.category!==filterCat)return false;
    if(invVehicleFilterIds&&!invVehicleFilterIds.has(String(p.id)))return false;
    if(filterFits!=="__all__"){
      const hasFit=partFitments.some(f=>String(f.part_id)===String(p.id));
      if(filterFits==="none"&&hasFit)return false;
      if(filterFits==="has"&&!hasFit)return false;
    }
    if(!searchDebounced.trim())return true;
    const words=searchDebounced.trim().toLowerCase().split(" ").filter(Boolean);
    const fields=[
      p.name, p.chinese_desc, p.sku, p.brand,
      p.make, p.model, p.year_range, p.oe_number, p.category,
      ...(suppNoByPart[p.id]||[])
    ].map(v=>(v||"").toLowerCase()).join(" ");
    return words.every(w=>fields.includes(w));
  });
  const invSortedFp=invSort==="sku"?[...fp].sort((a,b)=>(a.sku||"").localeCompare(b.sku||"")):fp;
  const fo=orders.filter(o=>{
    if(branchId&&o.branch_id!==branchId)return false;
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
  const fc=customers.filter(c=>{
    if(branchId&&c.branch_id!==branchId)return false;
    return c.name?.includes(searchCust)||c.phone?.includes(searchCust);
  });
  const pendingPartsReview=(role==="admin"||role==="manager")?parts.filter(p=>p.review_status==="pending").length:0;
  const lowStock=displayParts.filter(p=>{
    if(role==="branch_admin"){const isMain=!p.branch_id||p.branch_id===mainBranchId;const isOwn=p.branch_id===branchId;return (isMain||isOwn)&&p.stock<=p.min_stock;}
    return (branchId?p.branch_id===branchId:true)&&p.stock<=p.min_stock;
  });
  const _vatMult=1+(invoiceSettings.tax_rate||0)/100;
  const quantumStockValue=+displayParts.reduce((s,p)=>p.is_quantum&&(p.stock??0)>0?s+(p.stock??0)*(p.cost_price??0)*_vatMult:s,0).toFixed(2);
  const hiaceStockValue=+displayParts.reduce((s,p)=>p.is_hiace&&(p.stock??0)>0?s+(p.stock??0)*(p.cost_price??0)*_vatMult:s,0).toFixed(2);
  const othersStockValue=+displayParts.reduce((s,p)=>!p.is_quantum&&!p.is_hiace&&(p.stock??0)>0?s+(p.stock??0)*(p.cost_price??0)*_vatMult:s,0).toFixed(2);
  const scrapLowStock=scrapParts.filter(p=>p.quantity<=p.min_qty);
  const branchOrders=branchId?orders.filter(o=>o.branch_id===branchId):orders;
  const totalRev=branchOrders.filter(o=>o.status==="Completed").reduce((s,o)=>s+(o.total||0),0);
  const pendingCnt=branchOrders.filter(o=>o.status==="Processing"||o.status==="Ready to Ship").length;
  const pendingInq=inquiries.filter(i=>i.status==="pending").length;
  const overdueAutoRfq=rfqSessions.filter(s=>s.is_auto&&s.status==="pending"&&s.reply_deadline&&new Date(s.reply_deadline)<new Date()).length;
  const pendingCQ=customerQueries.filter(q=>q.status==="pending").length;
  const pendingWsFeedback=workshopFeedback.filter(f=>f.status==="new").length;
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
        ["Quoted",      "Quoted"],
        ["Ready to Ship", tSt("Ready to Ship")],
        ["Invoiced",    "Invoiced"],
        ["Paid",        "Paid"],
        ["Completed",   tSt("Completed")],
        ["Cancelled",   tSt("Cancelled")],
      ];
  const sub=getSubInfo(user);

  const saveWsShopRequest=async(data)=>{
    const res=await api.upsert("ws_shop_requests",data);
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}

    // Auto-check main shop stock for each requested item by SKU
    const reqItems=(()=>{try{return JSON.parse(data.items||"[]");}catch{return[];}})();
    const mainReplyItems=reqItems.map(item=>{
      const skuLow=(item.sku||"").toLowerCase().trim();
      const found=skuLow?parts.find(p=>
        !p.branch_id&&+(p.stock||0)>0&&
        ((p.sku||"").toLowerCase()===skuLow||(p.oe_number||"").toLowerCase()===skuLow)
      ):null;
      return {
        description:item.description, sku:item.sku, qty:item.qty,
        price:found?+(found.price||0):0,
        available:!!found,
        notes:found?`In main stock (${found.stock} available)`:"Not found in main stock",
        part_id:found?String(found.id):null,
        part_name:found?found.name:item.description,
        source:"stock",
      };
    });
    const anyFound=mainReplyItems.some(r=>r.available);
    if(anyFound){
      await api.patch("ws_shop_requests","id",data.id,{
        status:"main_replied",
        main_reply_items:JSON.stringify(mainReplyItems),
        main_reply_notes:"Auto-detected from main stock",
        main_replied_at:new Date().toISOString(),
      }).catch(()=>{});
      showToast("📦 Main stock has these parts — spare shop notified automatically");
    } else {
      showToast("📬 Parts request sent to spare shop");
    }
    await refreshTables("ws_shop_requests");
  };
  const replyWsShopRequest=async(id,replyItems,replyNotes)=>{
    const res=await api.patch("ws_shop_requests","id",id,{reply_items:JSON.stringify(replyItems),reply_notes:replyNotes||null,status:"replied",replied_at:new Date().toISOString()});
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}
    await refreshTables("ws_shop_requests");
    showToast("✅ Reply sent to workshop");
  };
  const escalateWsShopRequest=async(id,escalateNotes)=>{
    const res=await api.patch("ws_shop_requests","id",id,{status:"escalated",escalate_notes:escalateNotes||null,escalated_at:new Date().toISOString()});
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}
    setWsShopRequests(prev=>prev.map(r=>r.id===id?{...r,status:"escalated",escalate_notes:escalateNotes||null}:r));
    showToast("⬆️ Escalated to main stock");
  };
  const mainReplyWsShopRequest=async(id,mainReplyItems,mainReplyNotes)=>{
    const res=await api.patch("ws_shop_requests","id",id,{status:"main_replied",main_reply_items:JSON.stringify(mainReplyItems),main_reply_notes:mainReplyNotes||null,main_replied_at:new Date().toISOString()});
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}
    setWsShopRequests(prev=>prev.map(r=>r.id===id?{...r,status:"main_replied",main_reply_items:JSON.stringify(mainReplyItems),main_reply_notes:mainReplyNotes||null}:r));
    showToast("✅ Main stock reply sent");
  };
  const deleteWsShopRequest=async(id)=>{
    const res=await api.delete("ws_shop_requests","id",id);
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}
    setWsShopRequests(prev=>prev.filter(r=>r.id!==id));
    showToast("🗑️ Request deleted");
  };
  const deleteBranchStockRequest=async(id)=>{
    const res=await api.delete("branch_stock_requests","id",id);
    if(res?.code){showToast(`Error: ${res.message||res.code}`,"err");return;}
    setBranchStockRequests(prev=>prev.filter(r=>r.id!==id));
    showToast("🗑️ Transfer request deleted");
  };
  const openPartEditor=async(p)=>{
    if(!p)return;
    const ok=await acquireLock("part",p.id);
    if(!ok)return;
    const fresh=await api.get("parts",`id=eq.${p.id}&select=*`);
    openM("editPart",Array.isArray(fresh)&&fresh[0]?fresh[0]:p);
  };

  // Grouped nav for sidebar
  const navGroups=[
    {
      id:"grp_dashboard", icon:"📊", label:t.grpDashboard, roles:["admin"],
      children:[
        {id:"dashboard",icon:"📊",label:t.dashboard,roles:["admin"]},
        {id:"systemMap",icon:"🗺️",label:"System Map",roles:["admin"]},
        {id:"loginlogs",icon:"🌍",label:t.loginLogs,roles:["admin"]},
        {id:"adclicks",icon:"📢",label:"Ad Clicks",roles:["admin"]},
        {id:"adcontracts",icon:"📑",label:"Ad Contracts",roles:["admin"]},
      ]
    },
    {
      id:"grp_inventory", icon:"📦", label:t.grpInventory, roles:["admin","manager","shipper","stockman"],
      children:[
        {id:"inventory",icon:"📦",label:t.inventory,roles:["admin","manager","shipper","stockman"],badge:lowStock.length},
        {id:"stocktake",icon:"🔢",label:t.stockTake,roles:["admin","manager","shipper","stockman"]},
        {id:"stockmove",icon:"🔀",label:t.stockMove,roles:["admin","manager","shipper","stockman"]},
        {id:"logs",icon:"📝",label:t.logs,roles:["admin","manager","branch_admin"]},
        {id:"requestsKanban",icon:"🗂️",label:"Requests",roles:["admin","manager","branch_admin","branch_manager"],
          badge:pendingPartRequests+pendingVehicleRequests+pendingTransferRequests+pendingWsShopRequests},
        {id:"partRequests",icon:"📬",label:"Part Requests",roles:["admin"],badge:pendingPartRequests},
        {id:"vehicleRequests",icon:"🚗",label:"Vehicle Requests",roles:["admin"],badge:pendingVehicleRequests},
        {id:"transferRequests",icon:"🔄",label:"Transfer Requests",roles:["admin","branch_admin","branch_manager"],badge:pendingTransferRequests},
        {id:"wsShopRequests",icon:"🏪",label:"Workshop Requests",roles:["admin","manager"],badge:pendingWsShopRequests},
      ]
    },
    {
      id:"grp_scrapyard", icon:"🚗", label:t.grpScrapyard||"Scrapyard", roles:["scrapyard","scrapyard_admin"],
      children:[
        {id:"sy_dashboard",icon:"📊", label:t.syDashboard||"Dashboard", roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_vehicles", icon:"🚗", label:t.syVehicles||"Vehicles",   roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_parts",    icon:"📦", label:t.syParts||"Parts",         roles:["scrapyard","scrapyard_admin"], badge:scrapLowStock.length},
        {id:"sy_settings", icon:"⚙️", label:t.sySettings||"Settings",   roles:["scrapyard","scrapyard_admin"]},
      ]
    },
    {
      id:"grp_sy_sales", icon:"🛒", label:t.grpSySales||"Sales", roles:["scrapyard","scrapyard_admin"],
      badge: syOrders.filter(o=>o.status==="Processing"||o.status==="Quoted").length||0,
      children:[
        {id:"sy_orders",    icon:"📋", label:t.syOrders||"Orders",     roles:["scrapyard","scrapyard_admin"], badge:syOrders.filter(o=>o.status==="Processing"||o.status==="Quoted").length||0},
        {id:"sy_picking",   icon:"🔍", label:t.syPicking||"Picking",   roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_invoices",  icon:"🧾", label:t.syInvoices||"Invoices", roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_customers", icon:"👥", label:t.syCustomers||"Customers",roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_returns",   icon:"↩️", label:t.syReturns||"Returns",   roles:["scrapyard","scrapyard_admin"]},
        {id:"sy_gate",      icon:"🛡️", label:t.syGate||"Gate Check",   roles:["scrapyard","scrapyard_admin"]},
      ]
    },
    {
      id:"grp_all_scraps", icon:"🚗", label:t.grpAllScraps||"Scrapyards", roles:["admin","manager"],
      children:[
        {id:"all_scrapyards", icon:"🚗",label:t.syAllVehicles||"All Vehicles",roles:["admin","manager"]},
        {id:"all_scrap_parts",icon:"📦",label:t.syAllParts||"All Parts",      roles:["admin","manager"]},
      ]
    },
    {
      id:"grp_purchase", icon:"🏭", label:t.grpPurchase, roles:["admin"],
      badge: pendingInq,
      children:[
        {id:"suppliers",icon:"🏭",label:t.suppliers,roles:["admin"]},
        {id:"rfq",icon:"📋",label:t.rfqSession,roles:["admin"],badge:overdueAutoRfq||0},
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
          {id:"wsspareshop", icon:"🏪",label:"🏪 Spare Shop", roles:["workshop"]},
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
      id:"grp_sales", icon:"🛒", label:t.grpSales, roles:["admin","manager","shipper","customer"],
      badge: pendingCnt,
      children:[
        {id:"pos",icon:"🖥️",label:"POS",roles:["admin","manager"]},
        {id:"my_sales",icon:"📊",label:"My Statement",roles:["admin","manager"]},
        {id:"shop",icon:"🛒",label:t.shop,roles:["admin","customer"]},
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
      id:"grp_reports", icon:"📊", label:t.grpReports, roles:["admin","manager"],
      children:[
        {id:"reports",icon:"📊",label:t.reports,roles:["admin","manager"]},
        {id:"payments",icon:"💳",label:t.payments,roles:["admin"]},
      ]
    },
    {
      id:"grp_system", icon:"⚙️", label:t.grpSystem, roles:["admin"],
      children:[
        {id:"vehicles",icon:"🚗",label:t.vehicleMgmt||"Vehicles",roles:["admin"]},
        {id:"branches",icon:"🏢",label:t.branchMgmt||"Branches",roles:["admin"],badge:branches.filter(b=>b.status==="pending").length||0},
        {id:"settings",icon:"⚙️",label:t.settings,roles:["admin"]},
        {id:"users",icon:"🔑",label:t.users,roles:["admin"]},
        {id:"branchProfile",    icon:"🏢",label:"My Branch",        roles:["admin"],branchAdminOnly:true},
        {id:"branch_users",     icon:"👤",label:"Branch Users",     roles:["admin"],branchAdminOnly:true},
        {id:"vehicleRequests",  icon:"🚗",label:"Vehicle Requests", roles:["admin"],branchAdminOnly:true,badge:pendingVehicleRequests},
        {id:"workshopfeedback", icon:"💬",label:"App Feedback",     roles:["admin"],badge:pendingWsFeedback},
      ]
    },
  ].filter(g=>
    (g.roles.includes(role)||(isBranchUser&&g.roles.includes("admin")&&g.id!=="grp_workshop"&&g.id!=="grp_all_scraps"))
    && !(isSpareShop&&g.id==="grp_sy_sales")
  ).map(g=>({
    ...g,
    children:g.children.filter(c=>{
      if(isMobileDevice&&c.id==="systemMap") return false;
      if(isBranchUser){
        // branch users see admin tabs scoped to their role
        const BA_HIDE=new Set(["dashboard","loginlogs","adclicks","adcontracts","branches","settings","users","wssubscriptions","vehicles","systemMap","workshopfeedback"]);
        if(!c.roles.includes("admin")||BA_HIDE.has(c.id)) return false;
        // branchAdminOnly items only visible to branch_admin
        if(c.branchAdminOnly && role!=="branch_admin") return false;
        // branch_warehouse: inventory + orders + stocktake only
        if(role==="branch_warehouse") return ["inventory","stocktake","stockmove","orders"].includes(c.id);
        // branch_picker: orders only
        if(role==="branch_picker") return ["orders","picking"].includes(c.id);
        // branch_salesman: POS + My Statement
        if(role==="branch_salesman") return ["pos","my_sales"].includes(c.id);
        // branch_manager + branch_admin: full access minus hidden
        return true;
      }
      if(c.branchAdminOnly) return false;
      return c.roles.includes(role)&&(!c.wsRoles||role!=="workshop"||c.wsRoles.includes(wsRole));
    })
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
    if(role==="scrapyard"||role==="scrapyard_admin") return [
      {id:"sy_dashboard",icon:"📊", label:t.syDashboard||"Dashboard"},
      {id:"sy_parts",    icon:"📦", label:t.syParts||"Parts", badge:scrapLowStock.length},
      ...(!isSpareShop?[
        {id:"sy_orders",  icon:"📋", label:t.syOrders||"Orders",   badge:syOrders.filter(o=>o.status==="Processing"||o.status==="Quoted").length||0},
        {id:"sy_invoices",icon:"🧾", label:t.syInvoices||"Invoices"},
        {id:"sy_gate",    icon:"🛡️", label:t.syGate||"Gate"},
      ]:[]),
    ];
    if(role==="shipper") return [
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"picking",   icon:"🔍",label:t.picking},
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
    ];
    if(role==="manager") return [
      {id:"pos",       icon:"🖥️",label:"POS"},
      {id:"my_sales",  icon:"📊",label:"My Sales"},
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
    if(role==="branch_picker") return [
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"picking",   icon:"🔍",label:t.picking},
    ];
    if(role==="branch_salesman") return [
      {id:"pos",      icon:"🖥️", label:"POS"},
      {id:"my_sales", icon:"📊", label:"My Sales"},
    ];
    if(role==="branch_warehouse") return [
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"stocktake", icon:"🔢",label:t.stockTake},
    ];
    if(role==="branch_manager") return [
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"customers", icon:"👥",label:t.customers},
      {id:"rfq",       icon:"📋",label:t.rfqSession||"RFQ",badge:overdueAutoRfq||0},
      {id:"suppliers", icon:"🏭",label:t.suppliers},
    ];
    if(role==="branch_admin") return [
      {id:"inventory",       icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"orders",          icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"customers",       icon:"👥",label:t.customers},
      {id:"rfq",             icon:"📋",label:t.rfqSession||"RFQ",badge:overdueAutoRfq||0},
      {id:"suppliers",       icon:"🏭",label:t.suppliers},
      {id:"vehicleRequests", icon:"🚗",label:"Vehicle Requests",badge:pendingVehicleRequests},
      {id:"branch_users",    icon:"👤",label:"Users"},
    ];
    // admin — show most used
    return [
      {id:"dashboard", icon:"📊",label:t.dashboard},
      {id:"inventory", icon:"📦",label:t.inventory,badge:lowStock.length},
      {id:"orders",    icon:"📋",label:t.orders,badge:pendingCnt},
      {id:"pos",       icon:"🖥️",label:"POS"},
      {id:"my_sales",  icon:"📊",label:"My Sales"},
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

  if(loading) return (
    <div style={{background:"#0a0f1a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      <style>{CSS}{`
        @keyframes spinOuter{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes spinInner{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
        @keyframes pulseGlow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
        @keyframes ldFill{from{width:0%}to{width:100%}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{textAlign:"center",animation:"fadeUp .5s ease"}}>
        {/* Gear rings */}
        <div style={{position:"relative",width:110,height:110,margin:"0 auto 28px"}}>
          {/* Outer ring */}
          <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid transparent",borderTopColor:"var(--accent)",borderRightColor:"var(--accent)",animation:"spinOuter 1.1s linear infinite"}}/>
          {/* Middle ring */}
          <div style={{position:"absolute",inset:14,borderRadius:"50%",border:"3px solid transparent",borderBottomColor:"rgba(249,115,22,.6)",borderLeftColor:"rgba(249,115,22,.6)",animation:"spinInner .8s linear infinite"}}/>
          {/* Inner pulsing core */}
          <div style={{position:"absolute",inset:30,borderRadius:"50%",background:"radial-gradient(circle,rgba(249,115,22,.25) 0%,transparent 70%)",animation:"pulseGlow 1.4s ease-in-out infinite",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
        </div>
        {/* App name */}
        <div style={{fontSize:22,fontWeight:800,color:"#f1f5f9",letterSpacing:".02em",marginBottom:4}}>AutoParts</div>
        <div style={{fontSize:12,color:"#475569",marginBottom:24,letterSpacing:".06em",textTransform:"uppercase"}}>Loading your workspace</div>
        {/* Progress bar */}
        <div style={{width:220,margin:"0 auto 14px",background:"rgba(255,255,255,.06)",borderRadius:999,height:5,overflow:"hidden"}}>
          <div style={{height:"100%",background:"linear-gradient(90deg,var(--accent),#fb923c)",borderRadius:999,
            width:loadingItems.length?`${Math.min(100,Math.round(loadingItems.filter(x=>x.status!=="loading").length/Math.max(loadingItems.length,1)*100))}%`:"30%",
            transition:"width .4s ease",animation:loadingItems.length===0?"ldFill 2s ease-in-out infinite":undefined}}/>
        </div>
        {/* Item list */}
        <div style={{fontSize:11,color:"#334155",minHeight:16}}>
          {loadingItems.length>0
            ? loadingItems[loadingItems.length-1].status==="loading"
              ? `Loading ${loadingItems[loadingItems.length-1].label}…`
              : `✓ ${loadingItems[loadingItems.length-1].label}`
            : t.connecting}
        </div>
      </div>
    </div>
  );

  // Branch suspended: block non-admin users if their branch is suspended
  if(role!=="admin"&&currentBranch?.status==="suspended"){
    const activateUrl=`${window.location.origin}${window.location.pathname}?activate_branch=1`;
    return (
      <div style={{fontFamily:"'DM Sans',sans-serif",background:"var(--bg)",minHeight:"100vh",color:"var(--text)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 16px"}}>
        <style>{CSS}</style>
        <ShopLogo settings={settings} size="md"/>
        <div style={{marginTop:24,textAlign:"center",maxWidth:440}}>
          <div style={{fontSize:48,marginBottom:12}}>⏸</div>
          <div style={{fontSize:22,fontWeight:800,marginBottom:8}}>Branch Suspended</div>
          <div style={{fontSize:14,color:"var(--text3)",marginBottom:24,lineHeight:1.6}}>
            <strong>{currentBranch?.name}</strong> has been suspended.<br/>
            Please contact the administrator to settle your account.<br/>
            Once you receive your activation code, click below to reactivate.
          </div>
          <a href={activateUrl} style={{display:"block",background:"var(--accent)",color:"#fff",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,textDecoration:"none",textAlign:"center",marginBottom:12}}>
            🔑 Enter Activation Code
          </a>
          <button onClick={onLogout} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"9px 20px",color:"var(--text3)",cursor:"pointer",fontSize:13,width:"100%"}}>
            Log Out
          </button>
        </div>
      </div>
    );
  }

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
      <aside className="sidebar" style={{width:240,position:"fixed",height:"100vh",zIndex:50,display:"flex",flexDirection:"column"}}>
        {/* Brand + user */}
        <div style={{padding:"16px 14px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0,fontFamily:"'Rajdhani',sans-serif",letterSpacing:".05em"}}>
              {(user.name||user.username||"?").slice(0,2).toUpperCase()}
            </div>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>{user.name||user.username}</div>
              <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginTop:1}}>{t[role]||role}</div>
            </div>
          </div>
          <div style={{maxWidth:"100%",overflow:"hidden",marginBottom:8}}>
            <ShopLogo settings={wsDisplaySettings} size="sm"/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--green)",display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:10,color:"var(--text3)",letterSpacing:".03em"}}>{t.connected||"Connected"}</span>
          </div>
          {langs.length>1&&(
            <div style={{display:"flex",gap:4}}>
              {langs.map(l=>(
                <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                  {l.flag||l.lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        {role!=="admin"&&sub?.label&&<div className={sub.daysLeft!=null&&sub.daysLeft<=7?"wsFlash":undefined} style={{margin:"0 12px 8px",background:"rgba(249,115,22,.15)",borderRadius:7,padding:"3px 9px",fontSize:11,color:"var(--accent)",fontWeight:600,textAlign:"center"}}>{sub.label}</div>}

        {branches.length>0&&(
          <div style={{margin:"0 12px 8px"}}>
            {role==="admin"?(
              <select value={currentBranch?.id||"__all__"} onChange={e=>{
                if(e.target.value==="__all__") setCurrentBranch(null);
                else setCurrentBranch(branches.find(b=>b.id===e.target.value)||null);
              }} style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:"6px 8px",fontSize:12,color:"var(--text)",cursor:"pointer",fontFamily:"inherit"}}>
                <option value="__all__">{t.branchAllBranches}</option>
                {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ):(
              <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:"6px 8px",fontSize:12,color:"var(--text3)",textAlign:"center"}}>
                {currentBranch?.name||"—"}
              </div>
            )}
          </div>
        )}
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
                      <button key={n.id} onClick={()=>setTab(n.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:tab===n.id?"var(--accent)":"transparent",border:"none",borderRadius:7,color:tab===n.id?"#fff":"var(--text3)",cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:tab===n.id?600:400,marginBottom:1,textAlign:"left",transition:"all .18s"}}>
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
        <div style={{padding:"9px 12px 14px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:5}}>
          {(role==="admin"||role==="customer")&&(
            <button className="btn btn-primary btn-sm" style={{width:"100%",position:"relative"}} onClick={()=>openM("checkout")}>
              {t.cart} {cartCount>0&&<span style={{background:"rgba(255,255,255,.25)",borderRadius:99,padding:"1px 7px",fontSize:11}}>{cartCount}</span>}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={()=>openM("changePassword")}>{t.changePassword||"Change Password"}</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12,color:"rgba(248,113,113,.85)"}} onClick={onLogout}>{t.logout||"Sign Out"}</button>
          <div style={{fontSize:10,color:"var(--text3)",textAlign:"center",marginTop:2,letterSpacing:".03em"}}>v{APP_VERSION} · {APP_UPDATE_DATE}</div>
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
              <div>
                <div style={{fontSize:13,fontWeight:600}}>{user.name||user.username}</div>
                <span className="badge" style={{background:ROLES[role]?.bg,color:ROLES[role]?.color,fontSize:10,padding:"1px 7px"}}>{t[role]||role}</span>
                {user.spare_shop_name&&<div style={{fontSize:11,color:"rgba(37,99,235,.8)",marginTop:2,display:"flex",alignItems:"center",gap:3}}>🏪 {user.spare_shop_name} 🔒</div>}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:5,justifyContent:"center"}}>
            {langs.map(l=>(
              <button key={l.lang} className={`lang ${lang===l.lang?"on":""}`} onClick={()=>setLang(l.lang)} title={l.name}>
                {l.flag||l.lang.toUpperCase()}
              </button>
            ))}
          </div>
          {role!=="admin"&&sub?.label&&<div className={sub.daysLeft!=null&&sub.daysLeft<=7?"wsFlash":undefined} style={{marginTop:8,background:"rgba(249,115,22,.15)",borderRadius:7,padding:"4px 10px",fontSize:12,color:"var(--accent)",fontWeight:600,textAlign:"center"}}>{sub.label}</div>}
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
                    style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"10px 12px",background:tab===n.id?"var(--accent)":"none",border:"none",borderRadius:9,color:tab===n.id?"#fff":"var(--text2)",cursor:"pointer",fontSize:14,fontFamily:"inherit",fontWeight:tab===n.id?700:400,marginBottom:2,textAlign:"left",position:"relative"}}>
                    <span style={{fontSize:16}}>{n.icon}</span>
                    <span style={{flex:1}}>{n.label}</span>
                    {(n.badge||0)>0&&<span style={{background:"var(--accent)",color:"#fff",borderRadius:99,minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,padding:"0 5px"}}>{n.badge}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div style={{padding:"10px 10px 16px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
          {(role==="admin"||role==="customer")&&(
            <button className="btn btn-primary btn-sm" style={{width:"100%"}} onClick={()=>{openM("checkout");setDrawerOpen(false);}}>
              🛒 {t.cart} {cartCount>0&&<span style={{background:"rgba(255,255,255,.25)",borderRadius:99,padding:"1px 7px",fontSize:11}}>{cartCount}</span>}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12}} onClick={()=>{openM("changePassword");setDrawerOpen(false);}}>🔑 Change Password</button>
          <button className="btn btn-ghost btn-sm" style={{width:"100%",fontSize:12,color:"var(--red)"}} onClick={onLogout}>🚪 {t.logout}</button>
          <div style={{display:"flex",justifyContent:"center",marginTop:2,position:"relative"}}>
            <button onClick={()=>setVersionTip(v=>!v)} style={{background:"none",border:"none",color:"var(--text3)",fontSize:18,cursor:"pointer",padding:"2px 8px",lineHeight:1}} title="App version">ℹ️</button>
            {versionTip&&<div style={{position:"absolute",bottom:"calc(100% + 4px)",left:"50%",transform:"translateX(-50%)",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",fontSize:11,color:"var(--text2)",whiteSpace:"nowrap",zIndex:300,boxShadow:"0 2px 8px #0004"}}>v{APP_VERSION} · {APP_UPDATE_DATE}</div>}
          </div>
        </div>
      </div>

      {/* WS MORE SHEET — workshop mobile app style bottom sheet */}
      {role==="workshop"&&(()=>{
        // Grouped sections for mobile more-sheet
        const moreSections=[
          {
            label:t.grpWorkshop||"Jobs",
            items:[
              {id:"wsspareshop",icon:"🏪",label:"Spare Shop"},
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
                  {user.spare_shop_name&&<div style={{fontSize:11,color:"rgba(37,99,235,.8)",marginTop:3,display:"flex",alignItems:"center",gap:4}}>🏪 {user.spare_shop_name} <span style={{fontSize:10}}>🔒</span></div>}
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
            {(role==="admin"||role==="manager")&&pendingPartsReview>0&&(
              <div onClick={()=>setFilterPendingReview(f=>!f)} style={{
                background:filterPendingReview?"rgba(251,191,36,.18)":"rgba(251,191,36,.07)",
                border:`1px solid ${filterPendingReview?"rgba(251,191,36,.7)":"rgba(251,191,36,.3)"}`,
                borderRadius:10,padding:"10px 16px",marginBottom:14,
                display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all .15s"
              }}>
                <span style={{fontSize:18}}>🕵️</span>
                <div style={{flex:1,fontSize:13}}>
                  <span style={{fontWeight:700,color:"#fbbf24"}}>{pendingPartsReview} part{pendingPartsReview!==1?"s":""} pending review</span>
                  <span style={{color:"var(--text3)",marginLeft:8}}>Created by branch — need admin approval</span>
                </div>
                <span style={{fontSize:12,fontWeight:700,whiteSpace:"nowrap",
                  color:filterPendingReview?"#fbbf24":"var(--text3)",
                  background:filterPendingReview?"rgba(251,191,36,.15)":"var(--surface2)",
                  padding:"3px 10px",borderRadius:99,border:`1px solid ${filterPendingReview?"rgba(251,191,36,.5)":"var(--border)"}`}}>
                  {filterPendingReview?"✓ Showing pending":"Review"}
                </span>
              </div>
            )}
            <PH title={t.inventory} subtitle={`${parts.length} parts · ${lowStock.length} low`}
              action={<div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="btn btn-ghost btn-sm" disabled={invRefreshing} onClick={async()=>{setInvRefreshing(true);try{api.cacheClearAll();await refreshTables("parts","branch_stock","part_fitments","part_suppliers","vehicles","orders","customers","suppliers","inquiries","supplier_invoices","customer_invoices","supplier_returns","customer_returns","payments","rfq_sessions","rfq_items","rfq_quotes","stock_moves","stock_takes","inventory_logs","customer_queries","workshop_jobs","workshop_job_items","workshop_invoices","workshop_quotes","workshop_customers","workshop_vehicles","workshop_stock","workshop_services","workshop_suppliers","ws_supplier_requests","ws_supplier_quotes","ws_supplier_invoices","ws_supplier_invoice_items","ws_supplier_payments","ws_supplier_returns","ws_purchase_orders","ws_po_items");}finally{setInvRefreshing(false);}}} title="Reload all data">
                  <span style={invRefreshing?{display:"inline-block",animation:"spin 1s linear infinite"}:{}}>{invRefreshing?"⟳":"↻"}</span> {invRefreshing?"Refreshing…":"Refresh"}
                </button>
                {role==="admin"&&branches.length>1&&<button className={`btn btn-sm ${showCrossBranch?"btn-primary":"btn-ghost"}`} onClick={()=>setShowCrossBranch(v=>!v)} title="Cross-branch stock search">🏢 {t.branchCrossBtn}</button>}
                {(isBranchUser&&currentBranch?.show_supplier_sku)||(role==="admin"||role==="branch_admin")?(<button onClick={()=>setShowSupplierCodes(v=>!v)} style={{padding:"7px 12px",border:`1.5px solid ${showSupplierCodes?"var(--purple)":"var(--border)"}`,borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,background:showSupplierCodes?"rgba(167,139,250,.15)":"transparent",color:showSupplierCodes?"var(--purple)":"var(--text3)",fontFamily:"DM Sans,sans-serif",transition:"all .18s",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>{showSupplierCodes?"🔓":"🔒"} Supplier Code</button>):null}
                {(role==="admin"||role==="branch_admin")&&<button className="btn btn-ghost btn-sm" onClick={()=>openM("printShelfLabel")} title="Print shelf/bin label">📋 Shelf Label</button>}
                {(role==="admin"||role==="branch_admin")&&<button className="btn btn-ghost btn-sm" onClick={()=>openM("importCatalogue")} title="Import supplier catalogue (CSV/Excel)">⬆ Import</button>}
                {(role==="admin"||role==="branch_admin")&&<button className="btn btn-ghost btn-sm" onClick={()=>openM("bulkImages")} title="Bulk upload images by filename">🖼 Images</button>}
                {(role==="admin"||role==="branch_admin")&&<button className="btn btn-primary" onClick={()=>openM("editPart")}>+ {t.addPart}</button>}
              </div>}/>
            {showCrossBranch&&branches.length>1&&(
              <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>🏢 {t.branchCrossTitle}</div>
                <input className="inp" placeholder={t.branchCrossPlaceholder} value={crossBranchSearch} onChange={e=>setCrossBranchSearch(e.target.value)} style={{marginBottom:12}}/>
                {crossBranchSearch.trim()&&(()=>{
                  const q=crossBranchSearch.trim().toLowerCase();
                  const hits=parts.filter(p=>(p.name||"").toLowerCase().includes(q)||(p.sku||"").toLowerCase().includes(q));
                  if(!hits.length) return <div style={{color:"var(--text3)",fontSize:13,textAlign:"center",padding:"12px 0"}}>{t.branchCrossNoResults}</div>;
                  const byBranch={};
                  hits.forEach(p=>{
                    const bid=p.branch_id||"__none__";
                    if(!byBranch[bid]) byBranch[bid]=[];
                    byBranch[bid].push(p);
                  });
                  return Object.entries(byBranch).map(([bid,bParts])=>{
                    const br=branches.find(b=>b.id===bid);
                    return (
                      <div key={bid} style={{marginBottom:12}}>
                        <div style={{fontWeight:600,fontSize:12,color:"var(--text3)",marginBottom:6,paddingBottom:4,borderBottom:"1px solid var(--border)"}}>
                          {br?`${br.is_main?"🏠 ":"🏢 "}${br.name}`:t.branchUnassigned}
                        </div>
                        {bParts.map(p=>(
                          <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"5px 0",borderBottom:"1px solid var(--surface3)",fontSize:13}}>
                            <span style={{fontWeight:600,minWidth:100,color:"var(--accent)"}}>{p.sku}</span>
                            <span style={{flex:1,color:"var(--text)"}}>{p.name}</span>
                            <span style={{minWidth:60,textAlign:"right",color:p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--green)",fontWeight:600}}>{p.stock} in stock</span>
                            <span style={{minWidth:80,textAlign:"right",color:"var(--text2)"}}>{C()}{(p.price||0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
            {partsLoading&&<div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--yellow)"}}>
              <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:14}}>⟳</span>
              <span>Loading full inventory… showing first {parts.length} parts. Search is limited until complete.</span>
            </div>}
            {(quantumStockValue>0||hiaceStockValue>0||othersStockValue>0)&&(
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                {quantumStockValue>0&&(
                  <div onClick={()=>setInvReport("quantum")} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.25)",borderRadius:10,padding:"8px 14px",flex:"1 1 160px",cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,.16)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(249,115,22,.08)"}>
                    <span style={{fontSize:18}}>🚐</span>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)"}}>Quantum Parts</div>
                      <div style={{fontWeight:800,fontFamily:"Rajdhani,sans-serif",fontSize:18,color:"var(--accent)"}}>{fmtAmt(quantumStockValue)}</div>
                    </div>
                  </div>
                )}
                {hiaceStockValue>0&&(
                  <div onClick={()=>setInvReport("hiace")} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.25)",borderRadius:10,padding:"8px 14px",flex:"1 1 160px",cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,.16)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(59,130,246,.08)"}>
                    <span style={{fontSize:18}}>🚐</span>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)"}}>Hiace Parts</div>
                      <div style={{fontWeight:800,fontFamily:"Rajdhani,sans-serif",fontSize:18,color:"var(--blue)"}}>{fmtAmt(hiaceStockValue)}</div>
                    </div>
                  </div>
                )}
                {othersStockValue>0&&(
                  <div onClick={()=>setInvReport("others")} style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,padding:"8px 14px",flex:"1 1 160px",cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface3)"} onMouseLeave={e=>e.currentTarget.style.background="var(--surface2)"}>
                    <span style={{fontSize:18}}>🔩</span>
                    <div>
                      <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text3)"}}>Others</div>
                      <div style={{fontWeight:800,fontFamily:"Rajdhani,sans-serif",fontSize:18,color:"var(--text)"}}>{fmtAmt(othersStockValue)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <VehicleSearchBar
              vehicles={vehicles}
              partFitments={partFitments}
              parts={parts}
              onVehicleChange={(partIds)=>{setInvVehicleFilterIds(partIds||null);setInvPage(0);}}
              t={t} user={user} currentBranch={currentBranch}/>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 220px",maxWidth:340}}>
                <input className="inp" type="text"
                  placeholder={partsLoading?"Loading inventory — search available shortly…":"Search SKU, name, make, OE... (multi-word OK)"}
                  value={searchPart} onChange={e=>{ if(!partsLoading) setSearchPart(e.target.value); }}
                  disabled={partsLoading}
                  style={{paddingRight:searchPart?34:14,opacity:partsLoading?0.5:1,cursor:partsLoading?"not-allowed":"text"}}/>
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
              {(role==="admin"&&branches.length>1)&&(
                <select className="inp" value={filterBranch} onChange={e=>{setFilterBranch(e.target.value);setBranchMatchedOnly("matched");}} style={{minWidth:200,maxWidth:260,
                  borderColor:filterBranch!=="__all__"?"var(--blue)":undefined,
                  color:filterBranch!=="__all__"?"var(--blue)":undefined}}>
                  <option value="__all__">🏢 All Branches</option>
                  <option value="main">🏠 Main Branch</option>
                  {branches.filter(b=>!b.is_main).map(b=>{
                    const cnt=branchStock.filter(bs=>String(bs.branch_id)===String(b.id)).length;
                    return <option key={b.id} value={b.id}>🏢 {b.name}{cnt>0?` (${cnt})`:" (0)"}</option>;
                  })}
                </select>
              )}
              {(role==="admin"&&filterBranch!=="__all__"&&filterBranch!=="main")&&(
                <button className="btn btn-sm" onClick={()=>setBranchMatchedOnly(v=>v==="matched"?"all":"matched")} style={{whiteSpace:"nowrap",background:branchMatchedOnly==="matched"?"rgba(59,130,246,.15)":"rgba(52,211,153,.12)",color:branchMatchedOnly==="matched"?"var(--blue)":"var(--green)",border:branchMatchedOnly==="matched"?"1.5px solid var(--blue)":"1.5px solid rgba(52,211,153,.4)",fontWeight:700}}>
                  {branchMatchedOnly==="matched"?"✓ Matched only":"📋 All catalog"}
                </button>
              )}
              {(role==="branch_admin"||role==="branch_manager")&&(
                <select className="inp" value={filterBranch} onChange={e=>{setFilterBranch(e.target.value);setBranchMatchedOnly("matched");}} style={{width:170,
                  borderColor:filterBranch!=="__all__"?"var(--blue)":undefined,
                  color:filterBranch!=="__all__"?"var(--blue)":undefined}}>
                  <option value="__all__">📦 All</option>
                  <option value="main">🏠 Main Branch</option>
                  <option value={String(branchId)}>🏢 {currentBranch?.name||"My Branch"}</option>
                </select>
              )}
              {(role==="branch_admin"&&filterBranch===String(branchId))&&(
                <button className="btn btn-sm" onClick={()=>setBranchMatchedOnly(v=>v==="matched"?"own":v==="own"?"all":"matched")}
                  style={{whiteSpace:"nowrap",fontWeight:700,
                    background:branchMatchedOnly==="matched"?"rgba(59,130,246,.15)":branchMatchedOnly==="own"?"rgba(249,115,22,.15)":"rgba(52,211,153,.12)",
                    color:branchMatchedOnly==="matched"?"var(--blue)":branchMatchedOnly==="own"?"var(--accent)":"var(--green)",
                    border:branchMatchedOnly==="matched"?"1.5px solid var(--blue)":branchMatchedOnly==="own"?"1.5px solid var(--accent)":"1.5px solid rgba(52,211,153,.4)"}}>
                  {branchMatchedOnly==="matched"?"✓ My Stock":branchMatchedOnly==="own"?"🏢 Own Parts":"📋 All catalog"}
                </button>
              )}
              <button className="btn btn-sm" onClick={()=>setFilterQuantum(v=>!v)} style={{whiteSpace:"nowrap",background:filterQuantum?"rgba(249,115,22,.18)":"var(--surface2)",color:filterQuantum?"var(--accent)":"var(--text2)",border:filterQuantum?"1.5px solid var(--accent)":"1px solid var(--border)",fontWeight:filterQuantum?700:400}}>🚐 Quantum{filterQuantum?" ✓":""}</button>
              <button className="btn btn-sm" onClick={()=>setFilterHiace(v=>!v)} style={{whiteSpace:"nowrap",background:filterHiace?"rgba(59,130,246,.18)":"var(--surface2)",color:filterHiace?"var(--blue)":"var(--text2)",border:filterHiace?"1.5px solid var(--blue)":"1px solid var(--border)",fontWeight:filterHiace?700:400}}>🚐 Hiace{filterHiace?" ✓":""}</button>
              <button className="btn btn-sm" onClick={()=>setFilterInStock(v=>!v)} style={{whiteSpace:"nowrap",background:filterInStock?"rgba(52,211,153,.18)":"var(--surface2)",color:filterInStock?"var(--green)":"var(--text2)",border:filterInStock?"1.5px solid var(--green)":"1px solid var(--border)",fontWeight:filterInStock?700:400}}>✅ In Stock{filterInStock?" ✓":""}</button>
              <button className="btn btn-sm" onClick={()=>setFilterNoPhoto(v=>!v)} style={{whiteSpace:"nowrap",background:filterNoPhoto?"rgba(248,113,113,.18)":"var(--surface2)",color:filterNoPhoto?"var(--red)":"var(--text2)",border:filterNoPhoto?"1.5px solid var(--red)":"1px solid var(--border)",fontWeight:filterNoPhoto?700:400}}>📷 No Photo{filterNoPhoto?" ✓":""}</button>
              <button className="btn btn-sm" onClick={()=>{setInvSort(s=>s==="sku"?"default":"sku");setInvPage(0);}} style={{whiteSpace:"nowrap",background:invSort==="sku"?"rgba(249,115,22,.12)":"var(--surface2)",color:invSort==="sku"?"var(--accent)":"var(--text2)",border:invSort==="sku"?"1.5px solid var(--accent)":"1px solid var(--border)",fontWeight:invSort==="sku"?700:400}}>Sort by SKU{invSort==="sku"?" ↑":""}</button>
              <select className="inp" value={filterSupplier} onChange={e=>setFilterSupplier(e.target.value)}
                style={{minWidth:130,maxWidth:200,borderColor:filterSupplier!=="__all__"?"var(--purple)":undefined,color:filterSupplier!=="__all__"?"var(--purple)":undefined}}>
                <option value="__all__">🏭 All Suppliers</option>
                {suppliers.sort((a,b)=>a.name.localeCompare(b.name)).map(s=><option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              {(searchPart||filterCat!=="__all__"||filterLow||filterFits!=="__all__"||filterBranch!=="__all__"||filterQuantum||filterHiace||filterInStock||filterNoPhoto||filterSupplier!=="__all__")&&(
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchPart("");setFilterCat("__all__");setFilterLow(false);setFilterPendingReview(false);setFilterFits("__all__");setFilterBranch("__all__");setFilterQuantum(false);setFilterHiace(false);setFilterInStock(false);setFilterNoPhoto(false);setFilterSupplier("__all__");setBranchMatchedOnly("matched");}} style={{color:"var(--accent)",whiteSpace:"nowrap",border:"1px solid rgba(249,115,22,.3)"}}>✕ Clear all</button>
              )}
            </div>
            {/* ── Top pagination bar (between search and table) ── */}
            {fp.length>PAGE_SIZE&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
                <div style={{fontSize:13,color:"var(--text3)"}}>
                  Showing <strong style={{color:"var(--text)"}}>{invPage*PAGE_SIZE+1}–{Math.min((invPage+1)*PAGE_SIZE,fp.length)}</strong> of <strong style={{color:"var(--text)"}}>{fp.length}</strong> parts
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <button className="btn btn-ghost btn-sm" disabled={invPage===0} onClick={()=>setInvPage(p=>p-1)}>← Prev</button>
                  <span style={{fontSize:12,color:"var(--text2)",fontWeight:600,minWidth:70,textAlign:"center"}}>Page {invPage+1} / {Math.ceil(fp.length/PAGE_SIZE)}</span>
                  <button className="btn btn-ghost btn-sm" disabled={(invPage+1)*PAGE_SIZE>=fp.length} onClick={()=>setInvPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            )}
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
              {invSortedFp.slice(invPage*PAGE_SIZE,(invPage+1)*PAGE_SIZE).map(p=>{
                const img=toImgUrl(p.image_url);
                const ps=getPartSupps(p.id);
                return (
                  <div key={p.id} id={`part-row-${p.id}`} className="card" style={{padding:14,
                    borderLeft:`3px solid ${(role==="branch_admin"&&!p._bsSet)?"var(--border)":p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--border)"}`}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      {/* Photo */}
                      {img
                        ? <img src={img} alt={p.name} loading="lazy" onClick={()=>setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                            style={{width:56,height:56,objectFit:"contain",borderRadius:8,background:"var(--surface2)",border:"1px solid var(--border)",flexShrink:0,cursor:"zoom-in"}}/>
                        : <div style={{width:56,height:56,borderRadius:8,background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔩</div>}
                      {/* Info */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                          <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</div>
                          <span style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",flexShrink:0,
                            color:(role==="branch_admin"&&!p._bsSet)?"var(--text3)":p.stock===0?"var(--red)":p.stock<=p.min_stock?"var(--yellow)":"var(--green)"}}>
                            {(role==="branch_admin"&&!p._bsSet)?"—":p.stock}
                          </span>
                        </div>
                        {p.chinese_desc&&<div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{p.chinese_desc}</div>}
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5,alignItems:"center"}}>
                          <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{p.sku}</code>
                          <span style={{fontFamily:"DM Mono,monospace",fontSize:10,color:"var(--text3)",opacity:.55}}>#{p.id}</span>
                          {p.bin_location&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)",background:"rgba(96,165,250,.1)",padding:"1px 7px",borderRadius:5}}>📦 {p.bin_location}</span>}
                          {p.category&&<span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:10}}>{p.category}</span>}
                          {p.review_status==="pending"&&<span className="badge" style={{background:"rgba(251,191,36,.18)",color:"#fbbf24",fontSize:10,border:"1px solid rgba(251,191,36,.4)"}}>⏳ Pending Review</span>}
                          {p.is_quantum&&<span className="badge" style={{background:"rgba(249,115,22,.12)",color:"var(--accent)",fontSize:10}}>🚐 Quantum</span>}
                          {p.is_hiace&&<span className="badge" style={{background:"rgba(59,130,246,.12)",color:"var(--blue)",fontSize:10}}>🚐 Hiace</span>}
                        </div>
                        {showSupplierCodes&&(()=>{const ps=getPartSupps(p.id);return ps.length>0?(
                          <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                            {ps.map(s=>{
                              const url=s.supplier?.search_url&&s.supplier_part_no?s.supplier.search_url.replace(/\{sku\}/gi,encodeURIComponent(s.supplier_part_no)):null;
                              return (
                                <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(167,139,250,.08)",border:"1px solid rgba(167,139,250,.2)",borderRadius:6,padding:"3px 8px"}}>
                                  <span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>{s.supplier?.name||"Supplier"}</span>
                                  <span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--purple)",fontWeight:600}}>{s.supplier_part_no||"—"}</span>
                                  {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"var(--blue)",textDecoration:"none",marginLeft:"auto"}}>🔗</a>}
                                </div>
                              );
                            })}
                          </div>
                        ):null;})()}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                          <span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:16}}>{fmtAmt(p.price)}</span>
                          <div style={{display:"flex",gap:5,alignItems:"center"}}>
                            {(()=>{const cnt=partFitments.filter(f=>String(f.part_id)===String(p.id)).length;return cnt>0?<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{cnt} 🚗</span>:null;})()}
                            {(role==="branch_admin"&&!p._bsSet)
                              ? <span className="badge" style={{background:"var(--surface3)",color:"var(--text3)"}}>Not set</span>
                              : p.stock===0
                                ? <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)"}}>Out</span>
                                : p.stock<=p.min_stock
                                  ? <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)"}}>Low</span>
                                  : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)"}}>In Stock</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Action buttons — edit only allowed on parts the user owns */}
                    {(role==="admin"||role==="branch_admin")&&(
                      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",borderTop:"1px solid var(--border)",paddingTop:10}}>
                        {canEditPart(p)?(
                          <>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("adjust",p)}>± Adj</button>
                            <button className="btn btn-ghost btn-xs" onClick={async()=>{const ok=await acquireLock("part",p.id);if(!ok)return;const fresh=await api.get("parts",`id=eq.${p.id}&select=*`);openM("editPart",Array.isArray(fresh)&&fresh[0]?fresh[0]:p);}}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("stockMove",p)}>🔀 Move</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("partSupplier",p)}>🏭 Supp</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>{setLogSearch(p.sku||"");setTab("logs");}}>📝 Logs</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("printPartLabel",p)}>🏷️ Label</button>
                            {p.review_status==="pending"&&<button className="btn btn-xs" style={{background:"rgba(52,211,153,.15)",color:"#34d399",border:"1px solid rgba(52,211,153,.4)"}} onClick={()=>approvePart(p.id)}>✅ Approve</button>}
                            <button className="btn btn-danger btn-xs" onClick={()=>deletePart(p.id)}>🗑</button>
                          </>
                        ):(
                          <>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("branchStock",{part:p,existing:branchStockMap[String(p.id)]||null})}>
                              {branchStockMap[String(p.id)]?"✏️ Edit Stock":"📦 Set Stock"}
                            </button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("printPartLabel",p)}>🏷️ Label</button>
                            {(!p.image_url&&!p.image_data)&&(settings.whatsapp?(
                              <a href={waLink(settings.whatsapp,`Hi, please add a photo for this part:\n*${p.name}*\nSKU: ${p.sku}${p.make||p.model?`\n${[p.make,p.model].filter(Boolean).join(" ")}`:""}`)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                                <button className="btn btn-xs" title="Request photo from main branch" style={{background:"rgba(236,72,153,.1)",color:"rgba(236,72,153,1)",border:"1px solid rgba(236,72,153,.3)"}}>📷 Request Photo</button>
                              </a>
                            ):(
                              <button className="btn btn-xs" title="No WhatsApp configured in Settings" style={{background:"rgba(236,72,153,.1)",color:"rgba(236,72,153,1)",border:"1px solid rgba(236,72,153,.3)",opacity:.5,cursor:"default"}}>📷 Request Photo</button>
                            ))}
                          </>
                        )}
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
                    {["",t.sku,`${t.name} / ${t.chineseDesc}`,t.bin||t.binLocation||"Bin",t.make,t.model,t.yearRange,t.oeNumber,t.category,t.price,t.cost||t.costPrice||"Cost",t.stock||"St"].map(h=><th key={h}>{h}</th>)}
                    <th style={{textAlign:"center",whiteSpace:"nowrap"}}>🚗</th>
                    <th style={{textAlign:"center",whiteSpace:"nowrap"}} title="Toyota Quantum">🚐Q</th>
                    <th style={{textAlign:"center",whiteSpace:"nowrap"}} title="Toyota Hiace">🚐H</th>
                    {(role==="admin"||role==="branch_admin")&&<th style={{position:"sticky",right:0,background:"var(--surface2)",zIndex:2,boxShadow:"-2px 0 8px rgba(0,0,0,.3)"}}>{t.actions||"Actions"}</th>}
                  </tr></thead>
                  <tbody>
                    {invSortedFp.slice(invPage*PAGE_SIZE,(invPage+1)*PAGE_SIZE).map(p=>{
                      const img=toImgUrl(p.image_url);
                      const ps=getPartSupps(p.id);
                      return (
                        <tr key={p.id} id={`part-row-${p.id}`}>
                          <td style={{width:52,padding:"10px 8px"}}>
                            {img
                              ? <img className="part-img" src={img} alt={p.name} loading="lazy"
                                  onClick={()=>setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                                  onError={e=>{e.target.style.display="none";e.target.nextSibling&&(e.target.nextSibling.style.display="flex");}}/>
                              : <div className="part-emoji">{p.image||"🔩"}</div>}
                          </td>
                          <td style={{whiteSpace:"nowrap"}}>
                            <code style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{p.sku}</code>
                            <div style={{fontFamily:"DM Mono,monospace",fontSize:10,color:"var(--text3)",opacity:.55,marginTop:1}}>#{p.id}</div>
                          </td>
                          <td>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600}}>
                                  {p.name}
                                  {p.chinese_desc&&<span style={{color:"var(--text2)",fontWeight:400}}> / {p.chinese_desc}</span>}
                                </div>
                                {!showSupplierCodes&&ps.length>0&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>🏭 {ps.length} supplier{ps.length>1?"s":""}</div>}
                                {showSupplierCodes&&ps.map(s=>{
                                  const url=s.supplier?.search_url&&s.supplier_part_no?s.supplier.search_url.replace(/\{sku\}/gi,encodeURIComponent(s.supplier_part_no)):null;
                                  return (
                                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                                      <span style={{fontSize:10,color:"var(--text3)"}}>{s.supplier?.name||"?"}</span>
                                      <span style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--purple)",fontWeight:600}}>{s.supplier_part_no||"—"}</span>
                                      {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"var(--blue)",textDecoration:"none"}}>🔗</a>}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Stock qty badge — always visible */}
                              {(()=>{const bsE=filterBranchStockMap?filterBranchStockMap[String(p.id)]:null;const dStock=bsE!=null?bsE.stock:p.stock;const notSet=(role==="branch_admin"&&!p._bsSet);return(
                              <div style={{flexShrink:0,textAlign:"right"}}>
                                <span style={{
                                  fontWeight:800, fontFamily:"Rajdhani,sans-serif", fontSize:17,
                                  color:notSet?"var(--text3)":dStock===0?"var(--red)":dStock<=(bsE?.min_stock??p.min_stock)?"var(--yellow)":"var(--green)"
                                }}>{notSet?"—":dStock}</span>
                                {!notSet&&dStock<=(bsE?.min_stock??p.min_stock)&&dStock>0&&<div style={{fontSize:9,color:"var(--yellow)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",lineHeight:1}}>LOW</div>}
                                {!notSet&&dStock===0&&<div style={{fontSize:9,color:"var(--red)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",lineHeight:1}}>OUT</div>}
                              </div>
                              );})()}
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
                          <td style={{textAlign:"center",fontSize:16}} title={(role==="branch_admin"&&!p._bsSet)?"Not configured":p.stock===0?"Out of Stock":p.stock<=p.min_stock?"Low Stock":"In Stock"}>
                            {(role==="branch_admin"&&!p._bsSet)?"⚪":p.stock===0?"🔴":p.stock<=p.min_stock?"🟡":"🟢"}
                          </td>
                          <td style={{textAlign:"center"}}>
                            {(()=>{const cnt=partFitments.filter(f=>String(f.part_id)===String(p.id)).length;return cnt>0?<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)"}}>{cnt} 🚗</span>:<span style={{color:"var(--text3)",fontSize:11}}>—</span>;})()}
                          </td>
                          <td style={{textAlign:"center",fontSize:16}} title={p.is_quantum?"Toyota Quantum part":""}>
                            {p.is_quantum?<span title="Toyota Quantum">🚐</span>:<span style={{color:"var(--text3)",fontSize:11}}>—</span>}
                          </td>
                          <td style={{textAlign:"center",fontSize:16}} title={p.is_hiace?"Toyota Hiace part":""}>
                            {p.is_hiace?<span title="Toyota Hiace" style={{filter:"hue-rotate(200deg)"}}>🚐</span>:<span style={{color:"var(--text3)",fontSize:11}}>—</span>}
                          </td>
                          {(role==="admin"||role==="branch_admin")&&(()=>{
                            if(!canEditPart(p)) return (
                              <td style={{position:"sticky",right:0,background:"var(--surface)",zIndex:1,boxShadow:"-2px 0 8px rgba(0,0,0,.2)",padding:"0 8px",whiteSpace:"nowrap"}}>
                                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                                  <button className="btn btn-ghost btn-xs" onClick={()=>openM("branchStock",{part:p,existing:branchStockMap[String(p.id)]||null})}>
                                    {branchStockMap[String(p.id)]?"✏️ Edit Stock":"📦 Set Stock"}
                                  </button>
                                  <button className="btn btn-ghost btn-xs" title="Print label" onClick={()=>openM("printPartLabel",p)}>🏷️</button>
                                  {(!p.image_url&&!p.image_data)&&(settings.whatsapp?(
                                    <a href={waLink(settings.whatsapp,`Hi, please add a photo for this part:\n*${p.name}*\nSKU: ${p.sku}${p.make||p.model?`\n${[p.make,p.model].filter(Boolean).join(" ")}`:""}`)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                                      <button className="btn btn-xs" title="Request photo from main branch" style={{background:"rgba(236,72,153,.1)",color:"rgba(236,72,153,1)",border:"1px solid rgba(236,72,153,.3)"}}>📷</button>
                                    </a>
                                  ):(
                                    <button className="btn btn-xs" title="No WhatsApp configured in Settings" style={{background:"rgba(236,72,153,.1)",color:"rgba(236,72,153,1)",border:"1px solid rgba(236,72,153,.3)",opacity:.5,cursor:"default"}}>📷</button>
                                  ))}
                                </div>
                              </td>
                            );
                            const lock=isLocked("part",p.id);
                            return (
                              <td style={{position:"sticky",right:0,background:"var(--surface)",zIndex:1,boxShadow:"-2px 0 8px rgba(0,0,0,.2)",padding:"0 8px"}}>
                                {filterBranchStockMap&&(
                                  <button className="btn btn-ghost btn-xs" style={{marginRight:4,whiteSpace:"nowrap",borderColor:filterBranchStockMap[String(p.id)]?"var(--blue)":"var(--border)",color:filterBranchStockMap[String(p.id)]?"var(--blue)":"var(--text3)"}}
                                    onClick={()=>openM("branchStock",{part:p,existing:filterBranchStockMap[String(p.id)]||null,overrideBranchId:filterBranch})}>
                                    {filterBranchStockMap[String(p.id)]?"✏️ Branch Stock":"📦 Set Branch"}
                                  </button>
                                )}
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
                                    onEdit={async()=>{ const ok=await acquireLock("part",p.id); if(!ok)return; const fresh=await api.get("parts",`id=eq.${p.id}&select=*`); openM("editPart",Array.isArray(fresh)&&fresh[0]?fresh[0]:p); }}
                                    onMove={()=>openM("stockMove",p)}
                                    onSupplier={()=>openM("partSupplier",p)}
                                    onRfq={()=>openM("inquiry",p)}
                                    onLogs={()=>{setLogSearch(p.sku||"");setTab("logs");}}
                                    onPrintLabel={()=>openM("printPartLabel",p)}
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

        {/* ── SCRAPYARD AD BANNER ── */}
        {tab.startsWith("sy_")&&<AdBanner ads={liveAds} page="scrapyard" userCtx={{id:String(user.id),name:user.username||user.name||"",role:user.role}}/>}

        {/* ── SCRAPYARD DASHBOARD ── */}
        {tab==="sy_dashboard"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyDashboardPage
            scrapVehicles={scrapVehicles}
            scrapParts={scrapParts}
            syOrders={syOrders}
            syInvoices={syInvoices}
            syCustomers={syCustomers}
            syReturns={syReturns}
            settings={wsDisplaySettings}
            onNavigate={setTab}
          />
        )}

        {/* ── SCRAPYARD VEHICLES ── */}
        {tab==="sy_vehicles"&&(
          <ScrapyardVehiclesPage
            scrapId={scrapId}
            vehicles={scrapVehicles}
            parts={scrapParts}
            onRefresh={refreshScrapyardData}
          />
        )}

        {/* ── SCRAPYARD PARTS ── */}
        {tab==="sy_parts"&&(
          <ScrapyardPartsPage
            scrapId={scrapId}
            vehicles={scrapVehicles}
            parts={scrapParts}
            onRefresh={refreshScrapyardData}
          />
        )}

        {/* ── SCRAPYARD SETTINGS ── */}
        {tab==="sy_settings"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <ScrapyardProfilePage profile={workshopProfile} onSave={saveScrapProfile}/>
        )}

        {/* ── SCRAPYARD ORDERS ── */}
        {tab==="sy_orders"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyOrdersPage scrapId={scrapId} syOrders={syOrders} syCustomers={syCustomers} scrapParts={scrapParts} scrapVehicles={scrapVehicles} syInvoices={syInvoices} onRefresh={refreshScrapyardData} showToast={showToast} settings={wsDisplaySettings}/>
        )}

        {/* ── SCRAPYARD PICKING ── */}
        {tab==="sy_picking"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyPickingPage scrapId={scrapId} syOrders={syOrders} scrapParts={scrapParts} onRefresh={refreshScrapyardData} showToast={showToast}/>
        )}

        {/* ── SCRAPYARD INVOICES ── */}
        {tab==="sy_invoices"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyInvoicesPage scrapId={scrapId} syInvoices={syInvoices} syOrders={syOrders} onRefresh={refreshScrapyardData} showToast={showToast} settings={wsDisplaySettings}/>
        )}

        {/* ── SCRAPYARD CUSTOMERS ── */}
        {tab==="sy_customers"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyCustomersPage scrapId={scrapId} syCustomers={syCustomers} onRefresh={refreshScrapyardData} showToast={showToast}/>
        )}

        {/* ── SCRAPYARD RETURNS ── */}
        {tab==="sy_returns"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyReturnsPage scrapId={scrapId} syReturns={syReturns} syInvoices={syInvoices} syOrders={syOrders} onRefresh={refreshScrapyardData} showToast={showToast}/>
        )}

        {/* ── SCRAPYARD GATE CHECK ── */}
        {tab==="sy_gate"&&(role==="scrapyard"||role==="scrapyard_admin")&&(
          <SyGatePage scrapId={scrapId} syInvoices={syInvoices} syOrders={syOrders} onRefresh={refreshScrapyardData} showToast={showToast} settings={wsDisplaySettings}/>
        )}

        {/* ── ALL SCRAPYARDS (admin/manager) ── */}
        {tab==="all_scrapyards"&&(
          <ScrapyardAdminPage
            vehicles={allScrapVehicles}
            parts={allScrapParts}
            profiles={allScrapProfiles}
            users={users}
            onRefresh={async()=>{
              const [v,p,pr]=await Promise.all([
                api.get("scrapyard_vehicles","select=*&order=created_at.desc").catch(()=>[]),
                api.get("scrapyard_parts","select=*&order=created_at.desc").catch(()=>[]),
                api.get("scrapyard_profiles","select=*&order=id.asc").catch(()=>[]),
              ]);
              setAllScrapVehicles(Array.isArray(v)?v:[]);
              setAllScrapParts(Array.isArray(p)?p:[]);
              setAllScrapProfiles(Array.isArray(pr)?pr:[]);
            }}
          />
        )}

        {/* ── ALL SCRAPYARD PARTS (admin/manager) ── */}
        {tab==="all_scrap_parts"&&(
          <ScrapyardPartsAdminPage
            vehicles={allScrapVehicles}
            parts={allScrapParts}
            profiles={allScrapProfiles}
            users={users}
            onRefresh={async()=>{
              const [v,p,pr]=await Promise.all([
                api.get("scrapyard_vehicles","select=*&order=created_at.desc").catch(()=>[]),
                api.get("scrapyard_parts","select=*&order=created_at.desc").catch(()=>[]),
                api.get("scrapyard_profiles","select=*&order=id.asc").catch(()=>[]),
              ]);
              setAllScrapVehicles(Array.isArray(v)?v:[]);
              setAllScrapParts(Array.isArray(p)?p:[]);
              setAllScrapProfiles(Array.isArray(pr)?pr:[]);
            }}
          />
        )}

        {/* ── RFQ ── */}
        {tab==="rfq"&&(
          <RfqPage
            parts={isBranchUser?displayParts:parts} suppliers={suppliers}
            rfqSessions={rfqSessions} rfqItems={rfqItems} rfqQuotes={rfqQuotes}
            onCreate={createRfqSession} onUpdateStatus={updateRfqStatus}
            onSelectQuote={selectRfqQuote} onUnselectQuote={unselectRfqQuote}
            onUnselectAll={unselectAllRfq} onRefresh={loadAll}
            onCreatePO={createPOFromRfq} onResendStale={checkStaleRfqs}
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

        {/* ── POS ── */}
        {tab==="pos"&&(
          <PosPage
            parts={isBranchUser?displayParts:parts}
            customers={customers}
            vehicles={vehicles}
            partFitments={partFitments}
            branchId={_bId}
            suppliers={suppliers}
            partSuppliers={partSuppliers}
            settings={settings}
            onSave={savePosInvoice}
            onRefresh={()=>refreshTables("parts","customers","vehicles","part_fitments","part_suppliers")}/>
        )}

        {/* ── MY SALES STATEMENT (branch_salesman) ── */}
        {tab==="my_sales"&&["branch_salesman","admin","manager","branch_admin","branch_manager"].includes(role)&&(
          <SalesmanStatementPage
            customerInvoices={customerInvoices}
            customerReturns={customerReturns}
            user={user}
            settings={settings}/>
        )}

        {/* ── SHOP ── */}
        {tab==="shop"&&(
          <div className="fu">
            {/* 📢 Top ad banner */}
            <AdBanner ads={liveAds} page="shop" userCtx={{id:String(user.id),name:user.username||user.phone||"",role:user.role}}/>

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
              {partsLoading&&<div style={{width:"100%",display:"flex",alignItems:"center",gap:8,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.35)",borderRadius:7,padding:"6px 12px",marginBottom:6,fontSize:12,color:"var(--yellow)"}}>
                <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>
                <span>Loading full catalogue… {parts.length} parts so far. Search available shortly.</span>
              </div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <div style={{position:"relative",flex:"1 1 180px",maxWidth:280}}>
                  <input className="inp" type="text"
                    placeholder={partsLoading?"Loading…":"Search parts..."}
                    value={searchPart}
                    onChange={e=>{ if(!partsLoading) setSearchPart(e.target.value); }}
                    disabled={partsLoading}
                    style={{paddingRight:36,opacity:partsLoading?0.5:1,cursor:partsLoading?"not-allowed":"text"}}/>
                  {searchPart&&!partsLoading&&<button onClick={()=>setSearchPart("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16,lineHeight:1,padding:2}}>✕</button>}
                </div>
                <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{width:140}}>
                  <option value="__all__">All Categories</option>
                  {getCategories().map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                {(searchPart||filterCat!=="__all__")&&(
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setSearchPart("");setFilterCat("__all__");}} style={{color:"var(--accent)",border:"1px solid rgba(249,115,22,.3)"}}>✕ Clear</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={()=>{ api.cacheClearAll(); loadAll(); }} title="Refresh stock & prices" style={{flexShrink:0}}>↺ Refresh</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setShopSort(s=>s==="sku"?"default":"sku");setShopPage(0);}} style={{flexShrink:0,borderColor:shopSort==="sku"?"var(--accent)":"var(--border)",color:shopSort==="sku"?"var(--accent)":undefined}} title="Sort by SKU">
                  Sort by SKU{shopSort==="sku"?" ↑":""}
                </button>
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
              key={shopVehicleFilter.make+"|"+shopVehicleFilter.model}
              vehicles={vehicles}
              partFitments={partFitments}
              parts={parts}
              initialMake={shopVehicleFilter.make}
              initialModel={shopVehicleFilter.model}
              onFilter={(ids)=>{setVehicleFilterIds(ids);setShopPage(0);if(ids)setSearchPart("");}}
              onAddPart={(role==="admin"||role==="manager"||role==="demo")?((vehIds)=>{
                const v=vehicles.find(v=>vehIds.includes(v.id));
                setNewPartInitialF({price:0,cost_price:0,sku:(v?.code||"")+(v?.code?"-":""),category:"Body"});
                setPendingVehicleIds(vehIds);
                openM("editPart",null);
              }):undefined}
              t={t} user={user} currentBranch={currentBranch}/>

            {searchDebounced&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
              🔍 {fp.length} result{fp.length!==1?"s":""} for <span style={{color:"var(--accent)",fontWeight:600}}>"{searchDebounced}"</span>
            </div>}
            {vehicleFilterIds&&<div style={{fontSize:12,color:"var(--blue)",marginBottom:12,fontWeight:600}}>
              🚗 {fp.filter(p=>vehicleFilterIds.has(String(p.id))).length} parts match your vehicle
            </div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
              {(()=>{
                const gridAds=ads.filter(a=>a.active&&(a.page==="shop"||a.page==="all")&&a.position==="grid");
                const shopFpFiltered=fp.filter(p=>!vehicleFilterIds||vehicleFilterIds.has(String(p.id)));
                const shopFpSorted=shopSort==="sku"?[...shopFpFiltered].sort((a,b)=>(a.sku||"").localeCompare(b.sku||"")):shopFpFiltered;
                const visibleParts=shopFpSorted.slice(shopPage*PAGE_SIZE,(shopPage+1)*PAGE_SIZE);
                const items=[];
                visibleParts.forEach((p,i)=>{
                  items.push({type:"part",data:p});
                  if(gridAds.length&&(i+1)%8===0) items.push({type:"ad",data:gridAds[Math.floor((i+1)/8-1)%gridAds.length]});
                });
                return items;
              })().map((item,i)=>{
                if(item.type==="ad") return <AdGridCard key={"ad-"+i} ad={item.data}/>;
                const p=item.data;
                const inCart=cart.find(i=>i.id===p.id);
                const img=toImgUrl(p.image_url);
                return (
                  <div key={p.id} className="card card-hover" style={{padding:16,borderColor:inCart?"var(--accent)":"var(--border)",boxShadow:inCart?"var(--glow)":"none",display:"flex",flexDirection:"column"}}>
                    {/* Image — admin: click to edit; others: click to zoom */}
                    {img
                      ? <div style={{position:"relative",marginBottom:12,flexShrink:0}}>
                          <img src={img} alt={p.name}
                            style={{width:"100%",height:120,objectFit:"contain",background:"#fff",borderRadius:9,cursor:role==="admin"?"pointer":"zoom-in",display:"block"}}
                            onClick={()=>role==="admin"?openM("editPart",p):setLightbox({url:toFullUrl(p.image_url),name:p.name})}
                            onError={e=>e.target.parentNode.style.display="none"}/>
                          {role==="admin"&&<div style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.55)",color:"#fff",fontSize:11,borderRadius:5,padding:"2px 7px",pointerEvents:"none"}}>✏️ Edit</div>}
                        </div>
                      : <div style={{width:"100%",height:90,background:"var(--surface2)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,marginBottom:12,flexShrink:0,cursor:role==="admin"?"pointer":"default"}}
                          onClick={()=>role==="admin"&&openM("editPart",p)}>{p.image||"🔩"}</div>}
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
            {/* Shop pagination — use vehicle-filtered count when a vehicle is selected */}
            {(()=>{
              const shopFp=vehicleFilterIds?fp.filter(p=>vehicleFilterIds.has(String(p.id))):fp;
              if(shopFp.length===0) return null;
              return shopFp.length>PAGE_SIZE?(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,flexWrap:"wrap",gap:10}}>
                  <div style={{fontSize:13,color:"var(--text3)"}}>
                    Showing {shopPage*PAGE_SIZE+1}–{Math.min((shopPage+1)*PAGE_SIZE,shopFp.length)} of <strong style={{color:"var(--text)"}}>{shopFp.length}</strong> parts
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button className="btn btn-ghost btn-sm" disabled={shopPage===0} onClick={()=>setShopPage(p=>p-1)}>← Prev</button>
                    <span style={{fontSize:13,color:"var(--text2)",fontWeight:600,minWidth:80,textAlign:"center"}}>
                      Page {shopPage+1} / {Math.ceil(shopFp.length/PAGE_SIZE)}
                    </span>
                    <button className="btn btn-ghost btn-sm" disabled={(shopPage+1)*PAGE_SIZE>=shopFp.length} onClick={()=>setShopPage(p=>p+1)}>Next →</button>
                  </div>
                </div>
              ):null;
            })()}
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
              onCreateInvoice={(o)=>openM("customerInvoice",{order:o,isNew:true})}
              onSendQuote={(o)=>{updateOrderStatus(o.id,"Quoted");}}
              onRecordPayment={(o)=>{
                const inv=customerInvoices.find(i=>i.order_id===o.id);
                if(inv) openM("addPayment",{prefill:{type:"receipt",reference_id:inv.id,party_name:inv.customer_name,amount:inv.total,payment_date:today()}});
                else{showToast("Create an invoice for this order first","err");}
              }}/>
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
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("viewSupplierInvoice",inv)}>👁 View</button>
                            <button className="btn btn-ghost btn-xs" onClick={()=>openM("supplierInvoice",inv)}>✏️ Edit</button>
                            <button className="btn btn-info btn-xs" onClick={()=>openM("pdfInvoice",{...inv,type:"supplier"})}>🖨 PDF</button>
                            {!inv.stocked_in
                              ? <button className="btn btn-warning btn-xs" onClick={()=>stockInInvoice(inv)}>📦 Stock In</button>
                              : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11}}>✅ Stocked</span>
                            }
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
            {/* Confirmed workshop BSR alert — prompts clerk to mark parts ready */}
            {(()=>{
              const wsConfirmed=branchStockRequests.filter(r=>r.status==="confirmed"&&r.workshop_id);
              if(!wsConfirmed.length)return null;
              const Cs=curSym(settings?.currency||"ZAR R");
              return (
                <div style={{marginBottom:16,padding:"14px 18px",background:"rgba(52,211,153,.08)",border:"1.5px solid rgba(52,211,153,.35)",borderRadius:12}}>
                  <div style={{fontWeight:700,fontSize:14,color:"var(--green)",marginBottom:10}}>
                    ✅ {wsConfirmed.length} workshop order{wsConfirmed.length>1?"s":""} confirmed — prepare parts for collection
                  </div>
                  {wsConfirmed.map(r=>{
                    const items=Array.isArray(r.items)?r.items:[];
                    const replyItems=Array.isArray(r.reply_items)?r.reply_items:[];
                    const total=replyItems.reduce((s,i)=>s+(+i.price||0)*(i.qty||1),0);
                    const waMsg=`Hi ${r.workshop_name||"there"}, your parts are ready for collection at ${currentBranch?.name||"the branch"}. Please come collect at your earliest convenience. Thank you!`;
                    return (
                      <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--surface)",borderRadius:8,marginBottom:8,gap:12,flexWrap:"wrap",border:"1px solid var(--border)"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13}}>{r.workshop_name||"Workshop"}</div>
                          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{items.map(i=>i.name).join(", ")}</div>
                          {total>0&&<div style={{fontSize:12,color:"var(--accent)",fontWeight:600,marginTop:2}}>{Cs}{total.toFixed(2)}</div>}
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",flexShrink:0}}>
                          {r.workshop_phone&&<a href={waLink(r.workshop_phone,waMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none"}}>💬 WhatsApp</a>}
                          <button className="btn btn-success btn-sm" onClick={async()=>{
                            await api.patch("branch_stock_requests","id",r.id,{status:"dispatched",dispatched_at:new Date().toISOString()});
                            await refreshTables("branch_stock_requests");
                            showToast("✅ Marked ready for collection");
                          }}>🚚 Mark Ready</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
        {tab==="suppliers"&&(role==="admin"||isBranchUser)&&(()=>{
          const TYPES = ["new","used","dealer","factory"];
          const filteredSuppliers = suppliers.filter(s=>{
            if(supplierSearch.trim()){
              const h=[s.name,s.country,s.contact_person,s.email,s.phone,s.account_number].map(v=>(v||"").toLowerCase()).join(" ");
              if(!supplierSearch.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w))) return false;
            }
            if(supplierOriginFilter!=="all" && (s.supplier_origin||"")!==supplierOriginFilter) return false;
            if(supplierTypeFilter.length>0){
              const st=s.supplier_types||[];
              if(!supplierTypeFilter.every(t=>st.includes(t))) return false;
            }
            return true;
          });
          const toggleTypeF=(t)=>setSupplierTypeFilter(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);
          return (
          <div className="fu">
            <PH title={`🏭 ${t.suppliers}`} subtitle={`${filteredSuppliers.length} of ${suppliers.length} suppliers`}
              action={<div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" onClick={()=>openM("importSuppliers")}>📥 Import CSV</button>
                <button className="btn btn-primary" onClick={()=>openM("editSupplier")}>+ {t.addSupplier}</button>
              </div>}/>

            {/* ── Search + filters ── */}
            <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16,alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 220px",minWidth:180}}>
                <input className="form-control" placeholder="🔍 Search suppliers…" value={supplierSearch}
                  onChange={e=>setSupplierSearch(e.target.value)}
                  style={{width:"100%",fontSize:14,padding:"8px 32px 8px 12px",boxSizing:"border-box",color:"var(--text)",background:"var(--bg)"}}/>
                {supplierSearch&&<button onClick={()=>setSupplierSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,color:"var(--text3)"}}>✕</button>}
              </div>
              {/* Origin pills */}
              {[["all","All"],["local","🏠 Local"],["international","✈ International"]].map(([v,label])=>(
                <button key={v} onClick={()=>setSupplierOriginFilter(v)}
                  className={supplierOriginFilter===v?"btn btn-primary btn-sm":"btn btn-ghost btn-sm"}>
                  {label}
                </button>
              ))}
              {/* Type checkboxes */}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {TYPES.map(type=>(
                  <label key={type} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:13,fontWeight:supplierTypeFilter.includes(type)?700:400,color:supplierTypeFilter.includes(type)?"var(--accent)":"var(--text2)"}}>
                    <input type="checkbox" checked={supplierTypeFilter.includes(type)} onChange={()=>toggleTypeF(type)} style={{accentColor:"var(--accent)"}}/>
                    {type.charAt(0).toUpperCase()+type.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {filteredSuppliers.map(s=>{
                const linked=partSuppliers.filter(ps=>ps.supplier_id===s.id);
                const isGlobal=!s.branch_id;
                const isOwn=s.branch_id===user.branch_id;
                const canEdit=role==="admin"||isOwn;
                return (
                  <div key={s.id} className="card card-hover" style={{padding:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <div style={{fontSize:15,fontWeight:700}}>{s.name}</div>
                          {isGlobal
                            ?<span style={{fontSize:10,fontWeight:700,background:"rgba(99,102,241,.12)",color:"#818cf8",borderRadius:4,padding:"1px 6px"}}>GLOBAL</span>
                            :<span style={{fontSize:10,fontWeight:700,background:"rgba(52,211,153,.12)",color:"var(--green)",borderRadius:4,padding:"1px 6px"}}>MY BRANCH</span>
                          }
                        </div>
                        <div style={{fontSize:12,color:"var(--text3)"}}>📍 {s.country||"—"}</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                          {s.supplier_origin&&<span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:"1px 6px",background:s.supplier_origin==="local"?"rgba(52,211,153,.15)":"rgba(251,191,36,.15)",color:s.supplier_origin==="local"?"var(--green)":"#b45309"}}>{s.supplier_origin==="local"?"🏠 Local":"✈ International"}</span>}
                          {(s.supplier_types||[]).map(tp=><span key={tp} style={{fontSize:10,fontWeight:700,borderRadius:4,padding:"1px 6px",background:"rgba(99,102,241,.1)",color:"#818cf8",textTransform:"capitalize"}}>{tp}</span>)}
                        </div>
                      </div>
                      <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",cursor:psLoading?"wait":"pointer"}} onClick={async()=>{await loadPartSuppliers();openM("supplierParts",s);}}>{psLoading?"…":linked.length} parts</span>
                    </div>
                    {s.account_number&&<div style={{fontSize:12,fontWeight:700,color:"var(--accent)",background:"rgba(96,165,250,.08)",borderRadius:6,padding:"4px 9px",marginBottom:8,fontFamily:"DM Mono,monospace"}}>Acct: {s.account_number}</div>}
                    {s.contact_person&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:2}}>👤 {s.contact_person}</div>}
                    {s.email&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:2}}>✉ {s.email}</div>}
                    {s.phone&&<div style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>📞 {s.phone}</div>}
                    <div style={{display:"flex",gap:7,marginTop:6}}>
                      <button className="btn btn-ghost btn-sm" style={{flex:1}} disabled={!canEdit} title={!canEdit?"Global supplier — cannot edit":undefined} onClick={()=>canEdit&&openM("editSupplier",s)}>{t.edit}</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>openM("supplierCatalogue",s)} title="View / import supplier catalogue">📋</button>
                      <button className="btn btn-danger btn-sm" disabled={!canEdit||psLoading||linked.length>0} title={!canEdit?"Global supplier — cannot delete":psLoading?"Loading parts…":linked.length>0?"Remove all linked parts first":undefined} onClick={()=>deleteSupplier(s.id)}>{t.delete}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* ── INQUIRIES ── */}
        {tab==="inquiries"&&(role==="admin"||role==="branch_admin")&&(()=>{
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
        {tab==="customers"&&(role==="admin"||role==="branch_admin")&&(
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
        {tab==="logs"&&(role==="admin"||role==="manager"||role==="branch_admin")&&(()=>{
          const logQ=logSearch.trim().toLowerCase();
          // When a branch is selected (admin context) or user is branch_admin, filter logs to that branch
          const branchLogs=branchId?logs.filter(l=>l.branch_id&&String(l.branch_id)===String(branchId)):logs;
          const filteredLogs=logQ
            ? branchLogs.filter(l=>(l.part_sku||"").toLowerCase().includes(logQ)||(l.part_name||"").toLowerCase().includes(logQ))
            : branchLogs;
          return (
          <div className="fu">
            <PH title={`📝 ${t.logs}`} subtitle={`${filteredLogs.length}${logQ?` of ${branchLogs.length}`:""} ${t.records}${branchId?` · ${currentBranch?.name||"Branch"}`:" · All branches"}`}/>
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
            {/* Trial Registrations */}
            <div className="card" style={{marginBottom:18,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>🎁 Trial Registrations</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>Spare shops &amp; scrapyards that signed up via the supplier reply page</div>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={trialRegsLoading}
                  onClick={async()=>{
                    setTrialRegsLoading(true);
                    const rows=await api.get("registrations","select=*&order=created_at.desc").catch(()=>[]);
                    setTrialRegs(Array.isArray(rows)?rows:[]);
                    setTrialRegsLoading(false);
                  }}>
                  <span style={{display:"inline-block",animation:trialRegsLoading?"spin 0.8s linear infinite":"none"}}>🔄</span> {trialRegs.length>0?`${trialRegs.length} loaded`:"Load"}
                </button>
              </div>
              {trialRegs.length>0&&(
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr>{["Business","Type","Contact","Phone","City","Registered",""].map(h=><th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {trialRegs.map(r=>(
                        <tr key={r.id} style={{opacity:r.status==="handled"?0.45:1}}>
                          <td><div style={{fontWeight:600}}>{r.business_name||"—"}</div></td>
                          <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:11}}>{r.business_type==="scrapyard"?"♻️ Scrapyard":"🏪 Spare Shop"}</span></td>
                          <td style={{fontSize:13}}>{r.contact_name||"—"}</td>
                          <td style={{fontSize:13,fontFamily:"DM Mono,monospace"}}>{r.phone||"—"}</td>
                          <td style={{fontSize:12,color:"var(--text3)"}}>{r.city||"—"}</td>
                          <td style={{fontSize:11,color:"var(--text3)"}}>{r.created_at?new Date(r.created_at).toLocaleDateString():""}</td>
                          <td>
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {r.status!=="handled"&&(
                                <button className="btn btn-primary btn-sm"
                                  onClick={()=>openM("editUser",{name:r.business_name||r.contact_name||"",phone:r.phone||"",email:r.email||"",role:r.business_type==="scrapyard"?"scrapyard_admin":"branch_admin",username:(r.business_name||r.contact_name||"").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,20),password:"",_regId:r.id})}>
                                  👤 Create Account
                                </button>
                              )}
                              {r.status==="handled"
                                ?<span style={{fontSize:11,color:"var(--green)",fontWeight:600}}>✅ Done</span>
                                :<button className="btn btn-ghost btn-sm" style={{fontSize:11}}
                                    onClick={async()=>{
                                      await api.patch("registrations","id",r.id,{status:"handled"});
                                      setTrialRegs(p=>p.map(x=>x.id===r.id?{...x,status:"handled"}:x));
                                    }}>Mark Done</button>
                              }
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {trialRegs.length===0&&!trialRegsLoading&&(
                <div style={{padding:"20px 16px",color:"var(--text3)",fontSize:13,textAlign:"center"}}>Click Load to fetch registrations</div>
              )}
            </div>

            <PH title={t.users} subtitle={`${users.length} users`}
              action={<div style={{display:"flex",gap:8}}><button className="btn btn-ghost" onClick={()=>openM("editUser",{role:"workshop",username:"",password:"",name:"",phone:"",email:""})}>🔧 Add Workshop</button><button className="btn btn-primary" onClick={()=>openM("editUser")}>+ Add User</button></div>}/>
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{["User",t.role,"Subscription",t.phone,t.email,"Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {users.map(u=>{const sub2=getSubInfo(u);const isPicking=activePicker?.userId===u.id;
                    // default expiry = today + 1 month (always future, regardless of old expiry)
                    const nextMonthDefault=(()=>{const base=new Date();base.setMonth(base.getMonth()+1);return base.toISOString().slice(0,10);})();
                    return(
                      <tr key={u.id}>
                        <td><div style={{fontWeight:600}}>{u.name||u.username}</div><div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{u.username}</div></td>
                        <td><span className="badge" style={{background:ROLES[u.role]?.bg||"var(--surface3)",color:ROLES[u.role]?.color||"var(--text2)"}}>{ROLES[u.role]?.icon} {t[u.role]||u.role}</span></td>
                        <td>
                          <span className="badge" style={{background:sub2.color+"22",color:sub2.color,marginBottom:5}}>{sub2.label}</span>
                          {sub2.expiresAt&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Expires: {sub2.expiresAt}</div>}
                          {isPicking?(
                            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:6}}>
                              <span style={{fontSize:11,color:"var(--text3)"}}>Expiry:</span>
                              <input type="date" className="inp" value={activePicker.date}
                                onChange={e=>setActivePicker(p=>({...p,date:e.target.value}))}
                                style={{padding:"3px 7px",fontSize:12,width:140}}/>
                              <button className="btn btn-primary btn-xs" onClick={async()=>{const p={subscription_status:"active",subscription_expires_at:activePicker.date};setActivePicker(null);setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,...p}:uu));const r=await api.patch("users","id",u.id,p);if(r?.code||r?.message){showToast(`DB error: ${r.message||r.code}`,"err");console.error("patch users failed",r);}else showToast("Updated");}}>✅ Confirm</button>
                              <button className="btn btn-ghost btn-xs" onClick={()=>setActivePicker(null)}>✕</button>
                            </div>
                          ):(
                            <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                              <button className="btn btn-ghost btn-xs" style={{color:sub2.status==="active"?sub2.color:"var(--text3)",borderColor:sub2.status==="active"?sub2.color:"var(--border)",padding:"2px 8px",fontSize:11}}
                                onClick={()=>setActivePicker({userId:u.id,date:nextMonthDefault})}>active</button>
                              {["trial","expired","blocked"].map(s=>(
                                <button key={s} className="btn btn-ghost btn-xs" style={{color:u.subscription_status===s?sub2.color:"var(--text3)",borderColor:u.subscription_status===s?sub2.color:"var(--border)",padding:"2px 8px",fontSize:11}} onClick={async()=>{setUsers(prev=>prev.map(uu=>uu.id===u.id?{...uu,subscription_status:s}:uu));const r=await api.patch("users","id",u.id,{subscription_status:s});if(r?.code||r?.message){showToast(`DB error: ${r.message||r.code}`,"err");console.error("patch users failed",r);}else showToast("Updated");}}>{s}</button>
                              ))}
                            </div>
                          )}
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

        {/* ── SYSTEM MAP ── */}
        {tab==="systemMap"&&(role==="admin"||role==="branch_admin")&&(
          <SystemMapPage onNavigate={setTab} role={role}/>
        )}

        {/* ── LOGIN LOGS ── */}
        {tab==="loginlogs"&&role==="admin"&&(
          <div className="fu">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <PH title={`🌍 ${t.loginLogs}`} subtitle={`${loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo").length} ${t.llEvents}`}/>
              <button className="btn btn-ghost" disabled={loginLogsLoading} onClick={()=>setConfirmRefreshLogs(true)} style={{marginTop:4}}>
                <span style={{display:"inline-block",animation:loginLogsLoading?"spin 0.8s linear infinite":"none",fontSize:15,lineHeight:1}}>🔄</span> Refresh
              </button>
            </div>
            {confirmRefreshLogs&&(
              <div style={{background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.4)",borderRadius:10,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:"var(--text1)"}}>⚠️ This will reload all login records from the database. Continue?</span>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-ghost" style={{fontSize:12,padding:"5px 14px"}} onClick={()=>setConfirmRefreshLogs(false)}>Cancel</button>
                  <button className="btn" style={{fontSize:12,padding:"5px 14px",background:"var(--accent)"}} onClick={()=>{setConfirmRefreshLogs(false);refreshLoginLogs();}}>Yes, Refresh</button>
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
              {Object.entries(loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo").reduce((a,l)=>{const c=l.country||"?";a[c]=(a[c]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,n])=>(
                <span key={c} className="badge" style={{background:"var(--surface2)",color:"var(--text2)",padding:"5px 13px",fontSize:13}}>{c} · {n}</span>
              ))}
            </div>
            {(()=>{
              /* ── World Map (2-level: country → province drill-down) ── */
              const MW=1000,MH=480;
              const mX=lon=>((lon+180)/360*MW);
              const mY=lat=>((90-lat)/180*MH);
              const poly=pts=>pts.map(([la,lo])=>`${mX(lo).toFixed(1)},${mY(la).toFixed(1)}`).join(" ");
              const stripFlag=s=>(s||"").replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu,"").trim();
              const PROV_LL={"Gauteng":[-26.0,28.0],"Western Cape":[-33.9,18.4],"KwaZulu-Natal":[-29.8,31.0],"Eastern Cape":[-32.8,27.0],"Free State":[-29.0,26.0],"Limpopo":[-23.9,29.5],"Mpumalanga":[-25.5,30.5],"North West":[-25.8,25.5],"Northern Cape":[-28.7,24.8],"Harare":[-17.8,31.0],"Bulawayo":[-20.1,28.6],"Lusaka":[-15.4,28.3]};
              const CTY_LL={"South Africa":[-29.0,25.0],"Zimbabwe":[-20.0,30.0],"Zambia":[-15.0,28.0],"Mozambique":[-18.0,35.0],"Botswana":[-22.0,24.0],"Namibia":[-22.0,17.0],"Lesotho":[-29.5,28.2],"Eswatini":[-26.5,31.5],"Tanzania":[-6.0,35.0],"Kenya":[1.0,38.0],"Uganda":[1.0,32.0],"Nigeria":[9.0,8.0],"Ghana":[8.0,-1.0],"Ethiopia":[9.0,40.0],"Egypt":[26.0,30.0],"Morocco":[32.0,-6.0],"United Kingdom":[51.5,-0.1],"Ireland":[53.3,-8.0],"United States":[38.0,-97.0],"Canada":[56.0,-96.0],"Australia":[-25.0,133.0],"New Zealand":[-41.0,174.0],"Germany":[51.0,10.0],"France":[46.0,2.0],"Netherlands":[52.0,5.0],"China":[35.0,105.0],"India":[20.0,77.0],"Japan":[36.0,138.0],"Brazil":[-10.0,-55.0],"Argentina":[-34.0,-64.0]};
              const BBOX={"South Africa":[-35,-22,15,34],"Zimbabwe":[-23,-15,25,34],"Zambia":[-19,-8,21,34],"Mozambique":[-27,-10,32,41],"Botswana":[-27,-17,19,30],"Namibia":[-29,-17,10,26],"Tanzania":[-12,-1,29,41],"Kenya":[-5,5,33,42],"Nigeria":[4,14,2,15],"Ghana":[5,11,-4,2],"Egypt":[22,32,24,37],"United Kingdom":[49,59,-9,3],"United States":[24,50,-126,-65],"Australia":[-44,-10,112,155],"Germany":[47,55,5,16],"France":[42,52,-6,9],"China":[18,54,72,136],"India":[6,37,67,98],"Brazil":[-35,6,-74,-33],"Argentina":[-56,-21,-74,-52]};
              const LAND=[
                [[37,-6],[37,9],[34,12],[32,25],[30,33],[22,37],[15,43],[12,45],[11,51],[10,51],[1,42],[-1,41],[-5,40],[-11,38],[-15,35],[-20,35],[-26,33],[-32,28],[-34,27],[-35,20],[-34,18],[-30,17],[-22,15],[-17,12],[-6,12],[0,9],[3,10],[5,3],[5,-1],[4,-8],[5,-15],[10,-15],[15,-17],[22,-17],[37,-6]],
                [[36,-9],[36,0],[38,2],[41,2],[43,6],[43,8],[38,16],[38,15],[37,14],[40,18],[44,14],[45,14],[46,13],[47,19],[46,30],[44,38],[42,28],[40,26],[37,22],[38,23],[40,24],[42,28],[45,29],[47,38],[55,22],[57,8],[58,6],[51,3],[48,-2],[44,-2],[43,-9],[36,-9]],
                [[57,8],[58,5],[60,5],[62,7],[65,14],[68,16],[70,28],[70,30],[67,26],[60,25],[59,24],[57,22],[55,21],[54,10],[57,8]],
                [[42,28],[42,50],[55,60],[70,102],[72,140],[60,130],[35,140],[22,121],[22,115],[28,60],[37,60],[42,50],[40,36],[42,28]],
                [[28,65],[28,77],[22,81],[10,80],[8,77],[8,72],[22,72],[28,65]],
                [[22,100],[22,112],[15,100],[10,105],[1,104],[5,100],[22,100]],
                [[31,131],[33,131],[35,136],[38,141],[43,141],[45,142],[43,140],[38,139],[35,136],[33,131],[31,131]],
                [[71,-157],[71,-60],[55,-65],[47,-53],[42,-65],[35,-75],[25,-80],[20,-87],[10,-83],[8,-77],[15,-87],[20,-105],[22,-108],[30,-110],[32,-117],[34,-120],[48,-125],[60,-138],[71,-157]],
                [[61,-45],[61,-18],[76,-18],[83,-28],[83,-45],[61,-45]],
                [[10,-75],[8,-62],[5,-52],[-5,-35],[-15,-38],[-23,-43],[-34,-53],[-55,-67],[-55,-70],[-43,-73],[-18,-70],[-5,-80],[0,-75],[5,-77],[10,-75]],
                [[-15,129],[-15,137],[-12,136],[-12,141],[-18,147],[-22,150],[-28,153],[-38,147],[-38,140],[-36,137],[-32,115],[-22,114],[-20,120],[-15,129]],
                [[-34,172],[-34,178],[-41,176],[-41,172],[-34,172]],
                [[50,-6],[51,2],[56,0],[58,-3],[58,-6],[54,-8],[52,-10],[50,-6]],
                [[63,-24],[65,-14],[66,-14],[66,-20],[64,-24],[63,-24]],
              ];
              const SA_POLY=[[-22.5,29.3],[-22.5,33.0],[-27.0,33.0],[-30.0,30.5],[-34.4,26.2],[-34.8,20.0],[-29.0,16.5],[-22.2,20.0],[-18.3,20.0],[-22.5,29.3]];
              const currentMonth=new Date().toISOString().slice(0,7);
              // Account creation date per user from users table (created_at = when account was registered)
              const firstLogin={};
              users.forEach(u=>{if(u.username&&u.created_at)firstLogin[u.username]=u.created_at;});
              // Build country-level data
              const seenU=new Set();
              const ctData={};
              loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo").forEach(l=>{
                if(seenU.has(l.username))return;
                seenU.add(l.username);
                const cn=stripFlag(l.country)||"Unknown";
                const ll=CTY_LL[cn]||null;
                if(!ctData[cn])ctData[cn]={count:0,ll,users:[],provinces:{},newCount:0,oldCount:0};
                ctData[cn].count++;
                ctData[cn].users.push(l.username);
                if(l.province)ctData[cn].provinces[l.province]=(ctData[cn].provinces[l.province]||0)+1;
                const fd=firstLogin[l.username]||"";
                if(fd.startsWith(currentMonth))ctData[cn].newCount++; else ctData[cn].oldCount++;
              });
              const ctPins=Object.entries(ctData).filter(([,d])=>d.ll).map(([cn,d])=>({country:cn,...d}));
              const maxCt=ctPins.reduce((m,p)=>Math.max(m,p.count),1);
              const sc=selectedMapCountry;
              const scd=sc?ctData[sc]:null;
              const getVB=cn=>{
                const b=BBOX[cn];
                if(b){const padT=4,padB=14,padL=12,padR=5,x=mX(b[2]-padL),y=mY(b[1]+padT),w=mX(b[3]+padR)-x,h=mY(b[0]-padB)-y;return`${x.toFixed(1)} ${y.toFixed(1)} ${Math.max(w,60).toFixed(1)} ${Math.max(h,40).toFixed(1)}`;}
                const ll=CTY_LL[cn];if(!ll)return`0 0 ${MW} ${MH}`;
                const vbW=MW/4,vbH=MH/4;return`${(mX(ll[1])-vbW/2).toFixed(1)} ${(mY(ll[0])-vbH/2).toFixed(1)} ${vbW} ${vbH}`;
              };
              const dtCfg={"Android":{icon:"🤖",color:"#4ade80"},"Apple iOS":{icon:"🍎",color:"#a78bfa"},"Desktop":{icon:"🖥",color:"#60a5fa"},"Other Mobile":{icon:"📱",color:"#fb923c"}};
              const SVG_DEFS=(
                <defs>
                  <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#0f2744"/><stop offset="100%" stopColor="#060e1a"/></radialGradient>
                  <filter id="pinGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  <filter id="saGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
              );
              const MapBase=({viewBox:vb,children})=>(
                <svg viewBox={vb||`0 0 ${MW} ${MH}`} style={{width:"100%",height:"auto",display:"block"}}>
                  {SVG_DEFS}
                  <rect width={MW} height={MH} fill="url(#oceanGrad)"/>
                  {[-60,-30,0,30,60].map(lat=>(<line key={`g${lat}`} x1={0} y1={mY(lat).toFixed(1)} x2={MW} y2={mY(lat).toFixed(1)} stroke="#1a3050" strokeWidth={lat===0?1:0.4} strokeDasharray={lat===0?"":"4,8"}/>))}
                  {[-120,-60,0,60,120].map(lon=>(<line key={`g${lon}`} x1={mX(lon).toFixed(1)} y1={0} x2={mX(lon).toFixed(1)} y2={MH} stroke="#1a3050" strokeWidth={0.4} strokeDasharray="4,8"/>))}
                  {LAND.map((pts,i)=>(<polygon key={i} points={poly(pts)} fill="#1e4535" stroke="#2d6648" strokeWidth={0.7} strokeLinejoin="round"/>))}
                  <polygon points={poly(SA_POLY)} fill="#1a6640" stroke="#4ade80" strokeWidth={1} filter="url(#saGlow)" strokeLinejoin="round"/>
                  {children}
                </svg>
              );
              return(
                <div className="card" style={{overflow:"hidden",marginBottom:16,padding:0}}>
                  {/* ── Header ── */}
                  <div style={{padding:"12px 18px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"#080f1a",borderBottom:"1px solid #0f1e2e"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {sc&&<button className="btn btn-ghost" style={{fontSize:12,padding:"4px 10px"}} onClick={()=>{setSelectedMapCountry(null);setSelectedMapProvince(null);setSelectedMapCity(null);}}>← World</button>}
                      {sc&&selectedMapProvince&&<button className="btn btn-ghost" style={{fontSize:12,padding:"4px 10px"}} onClick={()=>{setSelectedMapProvince(null);setSelectedMapCity(null);}}>← {sc}</button>}
                      {sc&&selectedMapProvince&&selectedMapCity&&<button className="btn btn-ghost" style={{fontSize:12,padding:"4px 10px"}} onClick={()=>setSelectedMapCity(null)}>← {selectedMapProvince}</button>}
                      <span style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{selectedMapCity?`🏙 ${selectedMapCity}`:selectedMapProvince?`📍 ${selectedMapProvince}`:sc?`🗺 ${sc}`:"🌍 Global User Map"}</span>
                    </div>
                    <span style={{fontSize:12,color:"#64748b"}}>{seenU.size} user{seenU.size!==1?"s":""} · {Object.keys(ctData).length} countr{Object.keys(ctData).length!==1?"ies":"y"}</span>
                  </div>

                  {!sc?(
                    /* ══ LEVEL 1: World Map ══ */
                    <>
                      <MapBase>
                        {ctPins.map((p,i)=>{
                          const r=Math.max(11,9+Math.sqrt(p.count/maxCt)*16);
                          const cx=+mX(p.ll[1]).toFixed(1), cy=+mY(p.ll[0]).toFixed(1);
                          const lbl=p.country; const lblW=lbl.length*5.2+14;
                          return(
                            <g key={i} transform={`translate(${cx},${cy})`} onClick={()=>setSelectedMapCountry(p.country)} style={{cursor:"pointer"}}>
                              <title>Click to explore {p.country}</title>
                              <circle r={r+10} fill="rgba(251,191,36,0.05)"/>
                              <circle r={r+4} fill="rgba(251,191,36,0.13)"/>
                              <circle r={r} fill="#d97706" stroke="#fef08a" strokeWidth={1.5} filter="url(#pinGlow)"/>
                              <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={p.count>9?r*0.72:r*0.85} fontWeight="700" fontFamily="DM Mono,monospace">{p.count}</text>
                              <rect x={-lblW/2} y={r+4} width={lblW} height={14} rx={4} fill="rgba(8,15,26,0.9)" stroke="rgba(251,191,36,0.25)" strokeWidth={0.7}/>
                              <text y={r+13} textAnchor="middle" fill="#fbbf24" fontSize={8.5} fontWeight="600">{lbl}</text>
                            </g>
                          );
                        })}
                        {ctPins.length===0&&<text x={MW/2} y={MH/2} textAnchor="middle" fill="#334155" fontSize={13}>No location data found</text>}
                      </MapBase>
                      <div style={{padding:"10px 18px 12px",display:"flex",gap:10,flexWrap:"wrap",borderTop:"1px solid #0f1e2e",background:"#080f1a"}}>
                        {ctPins.sort((a,b)=>b.count-a.count).map((p,i)=>(
                          <span key={i} onClick={()=>setSelectedMapCountry(p.country)} style={{fontSize:12,color:"#94a3b8",display:"flex",alignItems:"center",gap:5,cursor:"pointer",padding:"3px 10px",borderRadius:6,background:"#0f1e2e",border:"1px solid #1a3050"}}>
                            <span style={{background:"#d97706",color:"white",borderRadius:"50%",width:17,height:17,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{p.count}</span>
                            {p.country}
                          </span>
                        ))}
                      </div>
                    </>
                  ):(selectedMapProvince?(()=>{
                    /* ══ LEVEL 3: Province / City Detail ══ */
                    const provLogs=loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo"&&l.province===selectedMapProvince);
                    const cityMap=provLogs.reduce((a,l)=>{const c=l.city||"Unknown";if(!a[c])a[c]={count:0,users:[]};if(!a[c].users.includes(l.username)){a[c].count++;a[c].users.push(l.username);}return a;},{});
                    const cities=Object.entries(cityMap).sort((a,b)=>b[1].count-a[1].count);
                    const maxC=cities[0]?.[1].count||1;
                    if(selectedMapCity){
                      const cityUsers=Object.values(provLogs.filter(l=>l.city===selectedMapCity||(selectedMapCity==="Unknown"&&!l.city)).reduce((a,l)=>{if(!a[l.username]||l.created_at>a[l.username].created_at)a[l.username]=l;return a;},{})).sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
                      return(
                        <div style={{background:"#080f1a",overflowY:"auto",maxHeight:420}}>
                          {cityUsers.map((l,i)=>{
                            const dt=l.device_type||(l.device&&/Android/i.test(l.device)?"Android":/iPhone|iPad/i.test(l.device||"")?"Apple iOS":"Desktop");
                            const dc=dtCfg[dt]||{icon:"❓",color:"#94a3b8"};
                            const isNew=(firstLogin[l.username]||"").startsWith(currentMonth);
                            return(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:"1px solid #0a1525"}}>
                                <div style={{width:34,height:34,borderRadius:"50%",background:isNew?"rgba(74,222,128,.2)":"rgba(96,165,250,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:isNew?"#4ade80":"#60a5fa",flexShrink:0}}>{(l.username||"?")[0].toUpperCase()}</div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",display:"flex",alignItems:"center",gap:6}}>
                                    {l.username}
                                    <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:isNew?"rgba(74,222,128,.15)":"rgba(96,165,250,.1)",color:isNew?"#4ade80":"#60a5fa"}}>{isNew?"NEW":"returning"}</span>
                                  </div>
                                  <div style={{fontSize:11,color:"#475569",marginTop:2}}>{new Date(l.created_at).toLocaleDateString()} · {l.ip_address||"—"}</div>
                                </div>
                                <div style={{fontSize:14,color:dc.color,flexShrink:0}}>{dc.icon}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return(
                      <div style={{background:"#080f1a"}}>
                        <div style={{padding:"12px 16px",display:"flex",flexWrap:"wrap",gap:8}}>
                          {cities.map(([city,d])=>(
                            <div key={city} onClick={()=>setSelectedMapCity(city)} style={{flex:"1 1 140px",background:"#0a1525",border:"1px solid #0f1e2e",borderRadius:8,padding:"10px 14px",cursor:"pointer"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                                <span style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{city}</span>
                                <span style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>{d.count}</span>
                              </div>
                              <div style={{background:"#0f1e2e",borderRadius:4,height:4}}>
                                <div style={{width:`${Math.round(d.count/maxC*100)}%`,height:"100%",background:"#d97706",borderRadius:4}}/>
                              </div>
                              <div style={{fontSize:10,color:"#475569",marginTop:5}}>Tap to see users →</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })():(
                    /* ══ LEVEL 2: Country Detail ══ */
                    <div style={{background:"#080f1a"}}>
                      <div style={window.innerWidth<640?{display:"flex",flexDirection:"column"}:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                        {/* Left: zoomed map with province pins */}
                        <MapBase viewBox={getVB(sc)}>
                          {scd&&Object.entries(scd.provinces).map(([prov,cnt],i)=>{
                            const ll=PROV_LL[prov];if(!ll)return null;
                            const r=2.4; // 30% of the old size — full-size pins swallowed the zoomed country map
                            const cx=+mX(ll[1]).toFixed(1),cy=+mY(ll[0]).toFixed(1);
                            return(
                              <g key={i} transform={`translate(${cx},${cy})`} onClick={()=>{setSelectedMapProvince(prov);setSelectedMapCity(null);}} style={{cursor:"pointer"}}>
                                <circle r={r+0.3} fill="rgba(251,191,36,0.08)"/>
                                <circle r={r} fill="#d97706" stroke="#fef08a" strokeWidth={0.4} filter="url(#pinGlow)"/>
                                <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={r*0.85} fontWeight="700" fontFamily="DM Mono,monospace">{cnt}</text>
                                <text y={r+1.6} textAnchor="middle" fill="#fbbf24" fontSize={1.4} fontWeight="600">{prov}</text>
                              </g>
                            );
                          })}
                          {scd&&Object.keys(scd.provinces).length===0&&CTY_LL[sc]&&(
                            <g transform={`translate(${mX(CTY_LL[sc][1]).toFixed(1)},${mY(CTY_LL[sc][0]).toFixed(1)})`}>
                              <circle r={14} fill="rgba(251,191,36,0.15)"/>
                              <circle r={9} fill="#d97706" stroke="#fef08a" strokeWidth={1.5}/>
                              <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={9} fontWeight="700">{scd?.count||0}</text>
                            </g>
                          )}
                        </MapBase>
                        {/* Right: stats + user list */}
                        <div style={{display:"flex",flexDirection:"column",borderLeft:window.innerWidth<640?"none":"1px solid #0f1e2e",borderTop:window.innerWidth<640?"1px solid #0f1e2e":"none"}}>
                          {/* New vs Old stat cards */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:"1px solid #0f1e2e"}}>
                            <div style={{padding:"14px 16px",borderRight:"1px solid #0f1e2e",textAlign:"center"}}>
                              <div style={{fontSize:28,fontWeight:800,color:"#4ade80"}}>{scd?.newCount||0}</div>
                              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>New this month</div>
                              <div style={{fontSize:10,color:"#1e4535",marginTop:1}}>{currentMonth}</div>
                            </div>
                            <div style={{padding:"14px 16px",textAlign:"center"}}>
                              <div style={{fontSize:28,fontWeight:800,color:"#60a5fa"}}>{scd?.oldCount||0}</div>
                              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Existing users</div>
                              <div style={{fontSize:10,color:"#1e3050",marginTop:1}}>before {currentMonth}</div>
                            </div>
                          </div>
                          {/* Province breakdown */}
                          {scd&&Object.keys(scd.provinces).length>0&&(
                            <div style={{padding:"10px 14px",borderBottom:"1px solid #0f1e2e"}}>
                              <div style={{fontSize:11,fontWeight:600,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Province Breakdown</div>
                              {Object.entries(scd.provinces).sort((a,b)=>b[1]-a[1]).map(([prov,cnt])=>(
                                <div key={prov} onClick={()=>{setSelectedMapProvince(prov);setSelectedMapCity(null);}} style={{display:"grid",gridTemplateColumns:"1fr 32px",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
                                  <div>
                                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                      <span style={{fontSize:11,color:"#94a3b8"}}>{prov}</span>
                                      <span style={{fontSize:11,fontWeight:700,color:"#fbbf24"}}>{cnt}</span>
                                    </div>
                                    <div style={{background:"#0f1e2e",borderRadius:4,height:5,overflow:"hidden"}}>
                                      <div style={{width:`${Math.round(cnt/scd.count*100)}%`,height:"100%",background:"#d97706",borderRadius:4}}/>
                                    </div>
                                  </div>
                                  <span style={{fontSize:10,color:"#64748b",textAlign:"right"}}>{Math.round(cnt/scd.count*100)}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* User list */}
                          <div style={{overflowY:"auto",flex:1,maxHeight:window.innerWidth<640?400:200}}>
                            {Object.values(loginLogs.filter(l=>scd?.users.includes(l.username)).reduce((a,l)=>{if(!a[l.username]||l.created_at>a[l.username].created_at)a[l.username]=l;return a;},{}))
                              .sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""))
                              .map((l,i)=>{
                                const dt=l.device_type||(l.device&&/Android/i.test(l.device)?"Android":/iPhone|iPad/i.test(l.device||"")?"Apple iOS":"Desktop");
                                const dc=dtCfg[dt]||{icon:"❓",color:"#94a3b8"};
                                const isNew=(firstLogin[l.username]||"").startsWith(currentMonth);
                                return(
                                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:"1px solid #0a1525"}}>
                                    <div style={{width:28,height:28,borderRadius:"50%",background:isNew?"rgba(74,222,128,.2)":"rgba(96,165,250,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:isNew?"#4ade80":"#60a5fa",flexShrink:0}}>{(l.username||"?")[0].toUpperCase()}</div>
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0",display:"flex",alignItems:"center",gap:5}}>
                                        {l.username}
                                        <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:isNew?"rgba(74,222,128,.15)":"rgba(96,165,250,.1)",color:isNew?"#4ade80":"#60a5fa"}}>{isNew?"NEW":"returning"}</span>
                                      </div>
                                      <div style={{fontSize:10,color:"#475569",marginTop:1}}>{l.province||l.city||"—"} · {new Date(l.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <div style={{fontSize:10,color:dc.color,flexShrink:0}}>{dc.icon}</div>
                                  </div>
                                );
                              })
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {(()=>{
              const cfg=[
                {key:"Android",   icon:"🤖", color:"#4ade80", bg:"rgba(74,222,128,.12)"},
                {key:"Apple iOS", icon:"🍎", color:"#a78bfa", bg:"rgba(167,139,250,.12)"},
                {key:"Desktop",   icon:"🖥",  color:"#60a5fa", bg:"rgba(96,165,250,.12)"},
                {key:"Other Mobile",icon:"📱",color:"#fb923c", bg:"rgba(251,146,60,.12)"},
              ];
              const filteredLogs=loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo");
              const counts=filteredLogs.reduce((a,l)=>{
                const raw=l.device_type||(()=>{const d=l.device||"";return /Android/i.test(d)?"Android":/iPhone|iPad/i.test(d)?"Apple iOS":/Mobile/i.test(d)?"Other Mobile":"Desktop";})();
                a[raw]=(a[raw]||0)+1;return a;
              },{});
              const total=filteredLogs.length||1;
              const rows=cfg.filter(c=>counts[c.key]);
              if(!rows.length)return null;
              return(
                <div className="card" style={{padding:"16px 20px",marginBottom:16}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:12,color:"var(--text2)"}}>Device Popularity</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {rows.sort((a,b)=>(counts[b.key]||0)-(counts[a.key]||0)).map(c=>{
                      const n=counts[c.key]||0;
                      const pct=Math.round(n/total*100);
                      return(
                        <div key={c.key} style={{display:"grid",gridTemplateColumns:"120px 1fr 60px 40px",alignItems:"center",gap:10}}>
                          <span style={{fontSize:13,fontWeight:500}}>{c.icon} {c.key}</span>
                          <div style={{background:"var(--surface2)",borderRadius:6,height:10,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:c.color,borderRadius:6,transition:"width .4s"}}/>
                          </div>
                          <span style={{fontSize:12,color:"var(--text3)",textAlign:"right"}}>{pct}%</span>
                          <span className="badge" style={{background:c.bg,color:c.color,fontSize:11,textAlign:"center"}}>{n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div className="card" style={{overflow:"hidden"}}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr>{[t.time,t.user,t.role,t.country,"Province",t.city,"IP","Device","Weather",t.status].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {loginLogs.filter(l=>l.user_role!=="admin"&&l.user_role!=="demo").map(l=>(
                      <tr key={l.id}>
                        <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(l.created_at).toLocaleString()}</td>
                        <td style={{fontWeight:600}}>{l.username}</td>
                        <td>{l.user_role&&<span className="badge" style={{background:ROLES[l.user_role]?.bg||"var(--surface3)",color:ROLES[l.user_role]?.color||"var(--text2)",fontSize:11}}>{ROLES[l.user_role]?.icon} {l.user_role}</span>}</td>
                        <td style={{fontSize:13}}>{l.country||"—"}</td>
                        <td style={{fontSize:13,color:"var(--text2)"}}>{l.province||"—"}</td>
                        <td style={{fontSize:13,color:"var(--text3)"}}>{l.city||"—"}</td>
                        <td style={{fontSize:12,fontFamily:"DM Mono,monospace",color:"var(--text3)"}}>{l.ip_address||"—"}</td>
                        <td style={{whiteSpace:"nowrap"}}>{(()=>{
                          const d=l.device||"";
                          const dtCfg={
                            "Android":     {icon:"🤖",bg:"rgba(74,222,128,.12)",  color:"#4ade80"},
                            "Apple iOS":   {icon:"🍎",bg:"rgba(167,139,250,.12)", color:"#a78bfa"},
                            "Desktop":     {icon:"🖥", bg:"rgba(96,165,250,.12)",  color:"#60a5fa"},
                            "Other Mobile":{icon:"📱",bg:"rgba(251,146,60,.12)",  color:"#fb923c"},
                          };
                          const dt=l.device_type||(()=>{return /Android/i.test(d)?"Android":/iPhone|iPad/i.test(d)?"Apple iOS":/Mobile/i.test(d)?"Other Mobile":d?"Desktop":null;})();
                          if(!dt&&!d)return "—";
                          let display=d;
                          if(d.startsWith("Mozilla")){
                            const os=/Windows/.test(d)?"Windows":/Android/.test(d)?"Android":/iPhone/.test(d)?"iPhone":/iPad/.test(d)?"iPad":/Mac/.test(d)?"macOS":/Linux/.test(d)?"Linux":"Unknown";
                            const br=/Edg\//.test(d)?"Edge":/Chrome\//.test(d)?"Chrome":/Firefox\//.test(d)?"Firefox":/Safari\//.test(d)?"Safari":/OPR\/|Opera\//.test(d)?"Opera":"Browser";
                            const bv=(d.match(/(?:Chrome|Firefox|Edg|OPR)\/(\d+)/)||[])[1]||"";
                            display=`${br}${bv?" "+bv:""} · ${os}`;
                          } else { display=d.replace(" (mobile)",""); }
                          const c=dtCfg[dt]||{icon:"❓",bg:"var(--surface2)",color:"var(--text3)"};
                          return(<><span className="badge" style={{background:c.bg,color:c.color,fontSize:11,marginRight:5}}>{c.icon} {dt||"Other"}</span><span style={{fontSize:11,color:"var(--text3)"}}>{display}</span></>);
                        })()}</td>
                        <td style={{fontSize:13,whiteSpace:"nowrap"}}>{l.weather||"—"}</td>
                        <td><span className="badge" style={{background:l.status==="success"?"rgba(52,211,153,.12)":"rgba(248,113,113,.12)",color:l.status==="success"?"var(--green)":"var(--red)"}}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── AD CLICKS ── */}
        {tab==="adclicks"&&role==="admin"&&(()=>{
          const PAGE_LABELS={"shop":"🛍️ Shop","workshop":"🔧 Workshop","spareshop":"🏪 Spare Shop","scrapyard":"🚗 Scrapyard"};
          const byPage=adClicks.reduce((a,c)=>{const p=c.page||"?";a[p]=(a[p]||0)+1;return a;},{});
          const byAd=adClicks.reduce((a,c)=>{const k=c.ad_title||"?";a[k]=(a[k]||0)+1;return a;},{});
          const topAd=Object.entries(byAd).sort((a,b)=>b[1]-a[1])[0];
          const byCountry=adClicks.reduce((a,c)=>{const k=c.country||"?";a[k]=(a[k]||0)+1;return a;},{});
          const topCountry=Object.entries(byCountry).sort((a,b)=>b[1]-a[1])[0];
          return (
            <div className="fu">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
                <PH title="📢 Ad Clicks" subtitle={`${adClicks.length} total clicks recorded`}/>
                <button className="btn btn-ghost" disabled={adClicksLoading} onClick={refreshAdClicks} style={{marginTop:4}}>
                  <span style={{display:"inline-block",animation:adClicksLoading?"spin 0.8s linear infinite":"none",fontSize:15,lineHeight:1}}>🔄</span> Refresh
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
                <SC label="Total Clicks" value={adClicks.length} icon="👆" color="var(--accent)"/>
                <SC label="Top Ad" value={topAd?topAd[0]:"—"} icon="📣" color="var(--blue)"/>
                <SC label="Top Country" value={topCountry?topCountry[0]:"—"} icon="🌍" color="var(--green)"/>
                <SC label="Pages" value={Object.keys(byPage).length} icon="📄" color="var(--yellow)"/>
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
                {Object.entries(byPage).sort((a,b)=>b[1]-a[1]).map(([p,n])=>(
                  <span key={p} className="badge" style={{background:"var(--surface2)",color:"var(--text2)",padding:"5px 13px",fontSize:13}}>{PAGE_LABELS[p]||p} · {n}</span>
                ))}
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr>{["Time","Ad","Page","User","Role","City","Country","Weather"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {adClicks.length===0
                        ? <tr><td colSpan={8} style={{textAlign:"center",color:"var(--text3)",padding:32}}>No clicks recorded yet</td></tr>
                        : adClicks.map((c,i)=>(
                          <tr key={c.id||i}>
                            <td style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>{new Date(c.clicked_at).toLocaleString()}</td>
                            <td style={{fontWeight:600,fontSize:13}}>{c.ad_title||"—"}</td>
                            <td><span style={{padding:"2px 8px",borderRadius:5,fontSize:11,fontWeight:700,background:"var(--surface2)",border:"1px solid var(--border)"}}>{PAGE_LABELS[c.page]||c.page||"—"}</span></td>
                            <td style={{fontSize:13}}>{c.user_name||"—"}</td>
                            <td>{c.user_role&&<span className="badge" style={{background:ROLES[c.user_role]?.bg||"var(--surface3)",color:ROLES[c.user_role]?.color||"var(--text2)",fontSize:11}}>{ROLES[c.user_role]?.icon} {c.user_role}</span>}</td>
                            <td style={{fontSize:13,color:"var(--text3)"}}>{c.city||"—"}</td>
                            <td style={{fontSize:13}}>{c.country||"—"}</td>
                            <td style={{fontSize:13}}>{c.weather||"—"}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── AD CONTRACTS ── */}
        {tab==="adcontracts"&&role==="admin"&&(
          <AdContractsPage
            ads={ads}
            adContracts={adContracts}
            onSaveContract={async(c)=>{
              const {id:cId,...cData}=c;
              const r=cId?await api.patch("ad_contracts","id",cId,cData):await api.insert("ad_contracts",cData);
              if(r?.code){showToast("Error: "+(r.message||r.code),"err");return;}
              api.get("ad_contracts","select=*&order=created_at.desc").catch(()=>[]).then(res=>{if(Array.isArray(res))setAdContracts(res);});
              showToast("Contract saved");
            }}
            onDeleteContract={async(id)=>{
              const linked=ads.filter(a=>String(a.contract_id)===String(id));
              if(linked.length){showToast(`Unlink ${linked.length} ad(s) before deleting this contract`,"err");return;}
              await api.delete("ad_contracts","id",id);
              setAdContracts(prev=>prev.filter(c=>c.id!==id));
              showToast("Contract deleted");
            }}
          />
        )}

        {/* ── SETTINGS ── */}
        {/* ── VEHICLES ── */}
        {/* ── WORKSHOP (all sub-tabs) ── */}
        {tab==="wsprofile"&&role==="workshop"&&(
          <WorkshopProfilePage profile={workshopProfile} onSave={saveWorkshopProfile} wsRole={wsRole} wsId={wsId} branches={branches} user={user}/>
        )}
        {tab==="wssubscriptions"&&role==="admin"&&(
          <WsSubscriptionsPage settings={settings}/>
        )}

        {["workshop","wscustomers","wsquotations","wsinvoices","wspayments","wsstock","wsservices","wssuppliers","wssuporders","wssupinv","wstransfer","wsstatement","wsreport","wsspareshop"].includes(tab)&&(role==="admin"||role==="manager"||role==="workshop")&&(
          <WorkshopPage
            key={tab}
            initialTab={tab==="workshop"?"jobs":tab==="wscustomers"?"customers":tab==="wsquotations"?"quotations":tab==="wsinvoices"?"invoices":tab==="wspayments"?"payments":tab==="wsstock"?"wsstock":tab==="wsservices"?"wsservices":tab==="wssuppliers"?"wssuppliers":tab==="wssuporders"?"wssuporders":tab==="wssupinv"?"wssupinv":tab==="wstransfer"?"wstransfer":tab==="wsstatement"?"statement":tab==="wsspareshop"?"spareshop":"report"}
            ads={liveAds}
            userCtx={{id:String(user.id),name:user.username||user.name||"",role:user.role}}
            jobs={workshopJobs}
            jobItems={workshopJobItems}
            invoices={workshopInvoices}
            quotes={workshopQuotes}
            parts={parts}
            partFitments={partFitments}
            vehicles={vehicles}
            onRefreshVehicles={()=>refreshTables("vehicles")}
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
            onPatchWsVehicle={patchWsVehicleLocal}
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
            wsFriends={workshopFriends}
            onAddWsFriend={addWorkshopFriend}
            onRemoveWsFriend={removeWorkshopFriend}
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
            wsBookings={wsBookings}
            onPatchWsBooking={patchWsBooking}
            onDeleteWsBooking={deleteWsBooking}
            onRefreshBookings={refreshWsBookings}
            onRefresh={refreshWorkshopData}
            onRefreshJobsBoard={refreshJobsBoard}
            onSubmitFeedback={submitWorkshopFeedback}
            wsProfile={workshopProfile}
            wsShopRequests={wsShopRequests}
            onSaveWsShopRequest={saveWsShopRequest}
            branches={branches}
            onPlaceShopOrder={async({localItems,mainItems,requestItems,notes,linkedBranchId})=>{
              let localOid=null,bsrId=null;
              try{
                if(localItems?.length){
                  localOid=makeId("ORD");
                  const todayStr=new Date().toISOString().slice(0,10);
                  const total=localItems.reduce((s,i)=>s+i.price*i.qty,0);
                  await api.upsert("orders",{id:localOid,customer_name:workshopProfile.name||"Workshop Order",customer_phone:workshopProfile.phone||"",customer_email:workshopProfile.email||"",date:todayStr,status:"Processing",items:localItems.map(i=>({partId:i.id,qty:i.qty,name:i.name,price:i.price})),total,branch_id:linkedBranchId,workshop_source_id:wsId||null});
                }
                // Head-office-only parts and out-of-stock parts both go to the workshop's
                // own linked branch — that's who actually deals with this workshop, not
                // whichever branch happens to be flagged "main". Combined into one request
                // so a single checkout doesn't create two separate cards for the branch.
                const stockItems=[...(mainItems||[]),...(requestItems||[])];
                if(stockItems.length){
                  bsrId=makeId("BSR");
                  const bsrPayload={id:bsrId,requesting_branch_id:linkedBranchId,supplying_branch_id:linkedBranchId,workshop_id:wsId||null,workshop_name:workshopProfile.name||"",workshop_phone:workshopProfile.phone||workshopProfile.whatsapp||"",workshop_email:workshopProfile.email||"",items:stockItems.map(i=>({partId:i.id,qty:i.qty,name:i.name,sku:i.sku||""})),status:"pending",confirm_token:makeToken(),notes:notes||null};
                  const bsrRes=await api.upsert("branch_stock_requests",bsrPayload);
                  if(bsrRes?.code||bsrRes?.message) throw new Error(`DB error ${bsrRes.code||""}: ${bsrRes.message||JSON.stringify(bsrRes)}`);
                }
                await refreshTables("orders","branch_stock_requests");
                const parts=[localOid&&"✅ Order placed",bsrId&&"📦 Branch stock request sent"].filter(Boolean);
                showToast(parts.join(" · ")||"Nothing to process");
              }catch(err){
                showToast(`❌ Error: ${err?.message||"save failed"}`, "err");
                console.error("onPlaceShopOrder error",err);
              }
              return {localOid,bsrId};
            }}
            wsLocked={role==="workshop"&&!!subStatus?.expired}
            wsDaysLeft={role==="workshop"?(subStatus?.daysLeft??sub?.daysLeft??null):null}
            wsExpiresAt={role==="workshop"?(subStatus?.expiresAt??sub?.expiresAt??null):null}
            wsSubStatus={role==="workshop"?(subStatus?.status??sub?.status??null):null}
            onGoToSpareShopTab={()=>setTab("wsspareshop")}
            onEditPart={async(p)=>{const ok=await acquireLock("part",p.id);if(!ok)return;const fresh=await api.get("parts",`id=eq.${p.id}&select=*`);openM("editPart",Array.isArray(fresh)&&fresh[0]?fresh[0]:p);}}
            onDeletePart={async(p)=>{await deletePart(p.id);}}
            onAddPart={(init)=>openM("editPart",{_initialF:{},...(init||{})})}
            t={t} lang={lang}/>
        )}

        {tab==="vehicles"&&role==="admin"&&(
          <VehiclesPage vehicles={vehicles} partFitments={partFitments} onSave={saveVehicle} onDelete={deleteVehicle}
            onViewInShop={(make,model)=>{setShopVehicleFilter({make,model});setTab("shop");}}
            onAddPart={(v)=>openM("editPart",{_initialF:{sku:(v.code||"")+(v.code?"-":"")},_tab:"fitment",_fitSearch:(v.make||"")+" "+(v.model||"")})}
            jumpMake={vehiclesJumpMake} jumpModel={vehiclesJumpModel} t={t}/>
        )}

        {tab==="vehicleRequests"&&(role==="admin"||role==="branch_admin")&&(
          <VehicleRequestsPage vehicleRequests={vehicleRequests} vehicles={vehicles} branches={branches} user={user} role={role}
            currentBranch={currentBranch}
            onApprove={saveVehicle}
            onGoToVehicles={(make,model)=>{setVehiclesJumpMake(make);setVehiclesJumpModel(model||null);setTab("vehicles");}}
            onRefresh={()=>refreshTables("vehicle_requests")} t={t}/>
        )}

        {tab==="branches"&&role==="admin"&&(
          <BranchesPage branches={branches} onRefresh={loadAll} t={t}/>
        )}

        {tab==="branch_users"&&role==="branch_admin"&&(
          <BranchUsersPage branchId={user.branch_id} branchName={currentBranch?.name} user={user} t={t}/>
        )}

        {tab==="branchProfile"&&role==="branch_admin"&&(
          <BranchProfilePage branch={currentBranch} user={user} onSave={async(data)=>{
            await api.patch("branches","id",user.branch_id,data);
            await loadAll();
            showToast("✅ Branch profile saved");
          }} t={t}/>
        )}

        {tab==="partRequests"&&(role==="admin"||role==="branch_admin")&&(
          <PartRequestsPage partRequests={partRequests} branches={branches} parts={parts} user={user} role={role} currentBranch={currentBranch} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={sendInquiry} onManualQuote={saveManualQuote} onAcceptQuote={acceptInquiry} onCancelOrder={cancelOrder} onEditPart={openPartEditor} onRefresh={()=>refreshTables("part_requests")} t={t}/>
        )}

        {tab==="transferRequests"&&(role==="admin"||role==="branch_admin")&&(
          <BranchTransferRequestsPage branchStockRequests={branchStockRequests} branches={branches} role={role} currentBranch={currentBranch} settings={settings} branchStock={branchStock} parts={parts} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} supplierInvoices={supplierInvoices} onSendInquiry={sendInquiry} onManualQuote={saveManualQuote} onAcceptQuote={acceptInquiry} onCancelOrder={cancelOrder} onEditPart={openPartEditor} t={t} onRefresh={()=>refreshTables("branch_stock_requests")} onDelete={deleteBranchStockRequest}/>
        )}

        {tab==="wsShopRequests"&&["admin","manager","branch_admin","branch_manager"].includes(role)&&(
          <WorkshopRequestsPage wsShopRequests={wsShopRequests} parts={parts} settings={settings} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={sendInquiry} onManualQuote={saveManualQuote} onAcceptQuote={acceptInquiry} onCancelOrder={cancelOrder} onEditPart={openPartEditor} t={t} onReply={replyWsShopRequest} onEscalate={escalateWsShopRequest} onMainReply={mainReplyWsShopRequest} onDelete={deleteWsShopRequest} onRefresh={()=>refreshTables("ws_shop_requests")} userRole={role} userBranchId={user?.branch_id||null}/>
        )}

        {tab==="requestsKanban"&&["admin","manager","branch_admin","branch_manager"].includes(role)&&(
          <RequestsKanbanPage
            wsShopRequests={wsShopRequests} branchStockRequests={branchStockRequests}
            vehicleRequests={vehicleRequests} partRequests={partRequests}
            branches={branches} parts={parts} vehicles={vehicles} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} supplierInvoices={supplierInvoices}
            settings={settings} branchStock={branchStock} user={user} role={role} currentBranch={currentBranch} t={t}
            onReply={replyWsShopRequest} onEscalate={escalateWsShopRequest} onMainReply={mainReplyWsShopRequest}
            onDeleteWsShop={deleteWsShopRequest} onDeleteTransfer={deleteBranchStockRequest}
            onApproveVehicle={saveVehicle} onSendInquiry={sendInquiry} onManualQuote={saveManualQuote} onAcceptQuote={acceptInquiry} onCancelOrder={cancelOrder} onEditPart={openPartEditor}
            onGoToVehicles={(make,model)=>{setVehiclesJumpMake(make);setVehiclesJumpModel(model||null);setTab("vehicles");}}
            onRefresh={()=>refreshTables("ws_shop_requests","branch_stock_requests","vehicle_requests","part_requests")}/>
        )}

        {tab==="settings"&&role==="admin"&&(
          <SettingsPage settings={settings} onSave={saveSettings} t={t}
            ads={ads}
            adContracts={adContracts}
            onSaveAd={async(ad)=>{
              const {id:adId,...adData}=ad;
              const res=adId?await api.patch("ads","id",adId,adData):await api.insert("ads",{...adData,clicks:0});
              if(res?.code){showToast("Error saving ad: "+(res.message||res.code),"err");return;}
              await api.get("ads","select=*&order=created_at.desc").catch(()=>[]).then(r=>{if(Array.isArray(r))setAds(r);});
              showToast("Ad saved");
            }}
            onDeleteAd={async(id)=>{
              await api.delete("ads","id",id);
              setAds(prev=>prev.filter(a=>a.id!==id));
              showToast("Ad deleted");
            }}/>
        )}

        {/* ── REPORTS ── */}
        {tab==="reports"&&(role==="admin"||role==="branch_admin"||role==="manager"||role==="branch_manager")&&(
          <ReportsPage orders={orders} parts={parts} customers={customers}
            supplierInvoices={supplierInvoices} payments={payments}
            customerInvoices={customerInvoices} customerReturns={customerReturns}
            settings={settings} t={t} lang={lang} role={role}/>
        )}

        {/* ── PAYMENTS ── */}
        {tab==="payments"&&(role==="admin"||role==="branch_admin")&&(
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

        {/* ── APP FEEDBACK (admin) — sent from the floating button inside Workshop mode ── */}
        {tab==="workshopfeedback"&&(()=>{
          const TYPE_ICON={bug:"🐛",idea:"💡",other:"💬"};
          const STATUS_COLOR={new:"var(--yellow)",read:"var(--blue)",resolved:"var(--green)"};
          const STATUS_LABEL={new:"🆕 New",read:"👀 Read",resolved:"✅ Resolved"};
          return (
            <div className="fu">
              <div style={{marginBottom:18}}>
                <h1 style={{fontSize:20,fontWeight:700}}>App Feedback</h1>
                <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{pendingWsFeedback} new · {workshopFeedback.length} total</p>
              </div>
              {workshopFeedback.length===0
                ? <div style={{textAlign:"center",padding:60,color:"var(--text3)"}}>No feedback yet</div>
                : (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {workshopFeedback.map(f=>{
                      const statusColor=STATUS_COLOR[f.status]||"var(--text3)";
                      return (
                        <div key={f.id} className="card" style={{padding:16,borderLeft:`3px solid ${statusColor}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10}}>
                            <div style={{flex:1,minWidth:220}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:15}}>{TYPE_ICON[f.type]||"💬"} {f.workshop_name||"Unknown workshop"}</span>
                                <span style={{fontSize:11,fontWeight:600,color:statusColor,background:statusColor+"18",padding:"2px 8px",borderRadius:99}}>{STATUS_LABEL[f.status]||f.status}</span>
                              </div>
                              <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13,color:"var(--text2)",marginBottom:6}}>
                                <span>📍 {f.page||"—"}</span>
                                <span>👤 {f.user_name||"—"}{f.user_role?` (${f.user_role})`:""}</span>
                              </div>
                              <div style={{fontSize:14,color:"var(--text)",marginBottom:6,whiteSpace:"pre-wrap"}}>{f.message}</div>
                              <div style={{fontSize:11,color:"var(--text3)"}}>{f.created_at?.slice(0,16)?.replace("T"," ")}</div>
                              {f.admin_reply&&(
                                <div style={{marginTop:8,background:"var(--surface2)",borderRadius:8,padding:"8px 12px",fontSize:13}}>
                                  <div style={{fontWeight:600,marginBottom:4,color:"var(--blue)"}}>📩 Your note:</div>
                                  <div style={{color:"var(--text2)"}}>{f.admin_reply}</div>
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                              {f.status!=="resolved"&&(
                                <button className="btn btn-ghost btn-sm" style={{color:"var(--green)",borderColor:"var(--green)"}}
                                  onClick={()=>markWsFeedbackStatus(f.id,"resolved")}>✅ Mark Resolved</button>
                              )}
                              {f.status==="new"&&(
                                <button className="btn btn-ghost btn-sm" onClick={()=>markWsFeedbackStatus(f.id,"read")}>👀 Mark Read</button>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={()=>{
                                const note=prompt("Internal note (only you see this):",f.admin_reply||"");
                                if(note!==null) replyToWsFeedback(f.id,note);
                              }}>📝 {f.admin_reply?"Edit Note":"Add Note"}</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          );
        })()}

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
      {(()=>{
        const ep=mData("editPart");
        const sortedBySku=[...parts].sort((a,b)=>(a.sku||"").localeCompare(b.sku||""));
        const idx=ep?.id?sortedBySku.findIndex(p=>p.id===ep.id):-1;
        const prevPart=idx>0?sortedBySku[idx-1]:null;
        const nextPart=idx>=0&&idx<sortedBySku.length-1?sortedBySku[idx+1]:null;
        // Edit Part can be opened from inside other modals (Send RFQ, invoice line
        // items, etc). All modals share the same overlay z-index, so DOM order
        // decides who's on top — pin this one above the rest so it's never hidden
        // behind whichever modal launched it.
        return isOpen("editPart")&&<div style={{position:"fixed",inset:0,zIndex:250}}><PartModal
          part={ep?._initialF ? null : ep}
          initialTab={ep?._tab}
          initialFitSearch={ep?._fitSearch||""}
          prevPart={prevPart}
          nextPart={nextPart}
          vehicles={vehicles} partFitments={partFitments}
          onSaveFitment={saveFitment} onDeleteFitment={deleteFitment} onSave={savePart}
          onDelete={ep&&canEditPart(ep)?async(p)=>{ if(p.id)releaseLock("part",p.id); await deletePart(p.id); closeM("editPart"); }:null}
          onCreateOpposite={createOpposite}
          onGoVehicles={()=>{closeM("editPart");setTab("vehicles");}}
          onGoSupplier={async(p)=>{closeM("editPart");await reloadPartSuppliers();openM("partSupplier",p);}}
          onGoToPart={(sku)=>{
            const target=parts.find(p=>p.sku?.trim().toLowerCase()===sku.trim().toLowerCase());
            if(target){
              const cur=mData("editPart");
              if(cur?.id)releaseLock("part",cur.id);
              closeM("editPart");
              // extract vehicle code from CURRENT part's SKU (e.g. "VW18D" from "VW18D-261AM")
              const fitSearch=(cur?.sku?.split(/[-\s]/)[0]||"").toUpperCase();
              setTimeout(()=>openM("editPart",{...target,_tab:"fitment",_fitSearch:fitSearch}),0);
            }else showToast(`Part SKU "${sku}" not found`,"err");
          }}
          onGoToMainPart={(targetPart)=>{
            const cur=mData("editPart");
            if(cur?.id)releaseLock("part",cur.id);
            closeM("editPart");
            setTimeout(()=>{
              setTab("inventory");
              setFilterBranch("__all__");
              setSearchPart(targetPart.sku||"");
            },0);
          }}
          inquiries={inquiries} rfqQuotes={rfqQuotes} rfqItems={rfqItems} rfqSessions={rfqSessions}
          branches={branches} currentBranch={currentBranch} allParts={parts}
          branchSkuPrefix={currentBranch?.sku_prefix||""}
          partSuppliers={getPartSupps(ep?.id)} suppliers={suppliers} allPartSuppliers={partSuppliers}
          initialF={ep?._initialF||newPartInitialF}
          onSavePartSupplier={savePartSupplier} onDeletePartSupplier={deletePartSupplier} onUpdatePartSupplier={updatePartSupplier} onLoadSuppliers={loadPartSuppliers}
          onAddSupplier={()=>openM("editSupplier")}
          onEditSupplier={(s)=>openM("editSupplier",s)}
          onRequestNewPart={role==="branch_admin"?()=>{const cur=mData("editPart");if(cur?.id)releaseLock("part",cur.id);closeM("editPart");openM("partRequest");}:null}
          onAddNewPart={(role==="admin"||role==="demo")?({copyFits,copyVehicleInfo}={})=>{
            const cur=mData("editPart");
            if(cur?.id) releaseLock("part",cur.id);
            if(copyVehicleInfo&&(cur?.make||cur?.model||cur?.year_range))
              setNewPartInitialF({make:cur?.make||"",model:cur?.model||"",year_range:cur?.year_range||""});
            else setNewPartInitialF(null);
            if(copyFits&&cur?.id) setPendingFitsCopy(cur.id); else setPendingFitsCopy(null);
            closeM("editPart");
            setTimeout(()=>openM("editPart",null),50);
          }:null}
          onGoBack={returnToCatalogue?()=>{const {sup,catalogueState}=returnToCatalogue;setReturnToCatalogue(null);setPendingCatalogueLink(null);setNewPartInitialF(null);closeM("editPart");openM("supplierCatalogue",{...sup,_page:catalogueState?.page,_search:catalogueState?.search});}:null}
          onClose={()=>{const cur=mData("editPart");if(cur?.id)releaseLock("part",cur.id);if(returnToCatalogue){const {sup,catalogueState}=returnToCatalogue;setReturnToCatalogue(null);setPendingCatalogueLink(null);setNewPartInitialF(null);closeM("editPart");openM("supplierCatalogue",{...sup,_page:catalogueState?.page,_search:catalogueState?.search});}else{setReturnToCatalogue(null);closeM("editPart");}}}
          t={t}/></div>;
      })()}
      {isOpen("adjust")&&<AdjustModal part={mData("adjust")} onApply={applyAdjust} onClose={()=>closeM("adjust")} t={t}/>}
      {isOpen("partRequest")&&<PartRequestModal currentBranch={currentBranch} user={user} onClose={()=>closeM("partRequest")} onSave={async()=>{await refreshTables("part_requests");closeM("partRequest");showToast("Part request submitted ✅");}} t={t}/>}
      {isOpen("branchStock")&&<BranchStockModal part={mData("branchStock")?.part} existing={mData("branchStock")?.existing} branchId={branchId} overrideBranchId={mData("branchStock")?.overrideBranchId} onClose={()=>closeM("branchStock")} onSave={async()=>{api.cacheInvalidate("branch_stock");await refreshTables("branch_stock");closeM("branchStock");showToast("Stock updated ✅");}} suppliers={suppliers} t={t}/>}
      {/* Can be opened from inside the Part modal (zIndex:250) via "+ Supplier" —
          pin above that so it doesn't render hidden behind it. */}
      {isOpen("editSupplier")&&<div style={{position:"fixed",inset:0,zIndex:260}}><SupplierModal supplier={mData("editSupplier")} onSave={saveSupplier} onClose={()=>closeM("editSupplier")} t={t}/></div>}
      {isOpen("importSuppliers")&&<SupplierImportModal onImport={async()=>{await refreshTables("suppliers");}} onClose={()=>closeM("importSuppliers")}/>}
      {isOpen("supplierParts")&&<SupplierPartsModal supplier={mData("supplierParts")} partSuppliers={partSuppliers.filter(ps=>ps.supplier_id===mData("supplierParts")?.id)} parts={parts} onDeleteMany={deletePartSupplierMany} onGoInventory={(part)=>{closeM("supplierParts");setTab("inventory");openM("editPart",part);}} onClose={()=>closeM("supplierParts")}/>}
      {isOpen("supplierCatalogue")&&<SupplierCatalogueModal parts={parts} supplier={mData("supplierCatalogue")}
        onGoToPart={(part,catalogueState)=>{const sup=mData("supplierCatalogue");setReturnToCatalogue({sup,catalogueState});closeM("supplierCatalogue");setTab("inventory");openM("editPart",part);}}
        onAddToInventory={(item,sup,catalogueState)=>{
          setPendingCatalogueLink({supplier_id:sup?.id,supplier_part_no:item.supplier_part_no});
          const _appLines=(item.application||"").split(/\n/).map(l=>l.trim()).filter(Boolean);
          const _firstLine=_appLines[0]||"";
          const _secondLine=_appLines[1]||"";
          const _colon=_firstLine.indexOf(":");
          const _make=_colon>-1?_firstLine.slice(0,_colon).trim():"";
          const _model=_colon>-1?_firstLine.slice(_colon+1).trim():"";
          const _name=[item.description,_secondLine].filter(Boolean).join(" - ");
          setNewPartInitialF({name:_name,oe_number:(item.oem_number||"").replace(/[\s,;]+/g," ").trim(),image_url:item.image_url||"",make:_make,model:_model});
          setReturnToCatalogue({sup,catalogueState});
          closeM("supplierCatalogue");
          setTab("inventory");
          openM("editPart",null);
        }}
        onClose={()=>closeM("supplierCatalogue")}/>}
      {isOpen("partSupplier")&&<PartSupplierModal part={mData("partSupplier")} partSuppliers={getPartSupps(mData("partSupplier")?.id)} suppliers={suppliers} vehicles={vehicles} partFitments={partFitments} onSave={savePartSupplier} onDelete={deletePartSupplier} onUpdate={updatePartSupplier} onClose={()=>closeM("partSupplier")} onEditPart={(p,tab)=>{closeM("partSupplier");openM("editPart",{...p,_tab:tab||"info"});}} onMergePart={mergePart} branches={branches} allParts={parts} onGoToMainPart={(targetPart)=>{closeM("partSupplier");setTimeout(()=>{setTab("inventory");setFilterBranch("__all__");setSearchPart(targetPart.sku||"");},0);}} onAddSupplier={()=>openM("editSupplier")} onEditSupplier={(s)=>openM("editSupplier",s)} t={t}/>}
      {isOpen("inquiry")&&<InquiryModal part={mData("inquiry")} suppliers={suppliers} partSuppliers={getPartSupps(mData("inquiry")?.id)} inquiries={inquiries} onSend={sendInquiry} onManualQuote={saveManualQuote} onAcceptQuote={acceptInquiry} onCancelOrder={cancelOrder} onClose={()=>closeM("inquiry")} t={t} isAdmin={role==="admin"} onEditPart={openPartEditor}/>}
      {isOpen("inquiryDetail")&&<InquiryDetailModal inquiry={mData("inquiryDetail")} onUpdate={updateInquiry} onAccept={async(inq)=>{closeM("inquiryDetail");await acceptInquiry(inq);}} onClose={()=>closeM("inquiryDetail")} settings={settings} t={t}/>}
      {isOpen("editCustomer")&&<CustomerModal customer={mData("editCustomer")} onSave={saveCustomer} onClose={()=>closeM("editCustomer")} t={t}/>}
      {isOpen("editUser")&&<UserModal user={mData("editUser")} onSave={saveUser} onClose={()=>closeM("editUser")} t={t}/>}
      {isOpen("custHistory")&&<CustHistoryModal customer={mData("custHistory")} orders={orders.filter(o=>o.customer_phone===mData("custHistory")?.phone)} onClose={()=>closeM("custHistory")}/>}
      {isOpen("supplierInvoice")&&<SupplierInvoiceModal data={mData("supplierInvoice")} suppliers={suppliers} parts={parts} onSave={saveSupplierInvoice} onDelete={deleteSupplierInvoice} onStockIn={stockInInvoice} onEditPart={openPartEditor} onClose={()=>closeM("supplierInvoice")} t={t} settings={invoiceSettings} role={role} branchId={branchId} branchStock={branchStock}/>}
      {isOpen("viewSupplierInvoice")&&<ViewSupplierInvoiceModal inv={mData("viewSupplierInvoice")} onClose={()=>closeM("viewSupplierInvoice")} settings={invoiceSettings}/>}
      {isOpen("printPartLabel")&&<PrintPartLabelModal part={mData("printPartLabel")} settings={{...settings,...(currentBranch||{})}} onClose={()=>closeM("printPartLabel")}/>}
      {isOpen("printShelfLabel")&&<PrintShelfLabelModal settings={{...settings,...(currentBranch||{})}} onClose={()=>closeM("printShelfLabel")}/>}
      {isOpen("importCatalogue")&&<CatalogueImportModal suppliers={suppliers} parts={parts} vehicles={vehicles} onClose={()=>closeM("importCatalogue")} onImportDone={({newParts,newLinks,newFits})=>{if(newParts.length){setParts(prev=>[...prev,...newParts]);db.parts.bulkPut(newParts).catch(()=>{});}if(newLinks.length)setPartSuppliers(prev=>[...prev,...newLinks]);if(newFits.length)setPartFitments(prev=>[...prev,...newFits]);}}/>}
      {isOpen("bulkImages")&&<BulkImageImportModal parts={parts} partSuppliers={partSuppliers} onClose={()=>closeM("bulkImages")} onImageUpdated={(id,url)=>setParts(prev=>prev.map(p=>p.id===id?{...p,image_url:url}:p))}/>}
      {isOpen("supplierReturn")&&<SupplierReturnModal data={mData("supplierReturn")} suppliers={suppliers} parts={parts} supplierInvoices={supplierInvoices} onSave={saveSupplierReturn} onClose={()=>closeM("supplierReturn")} t={t} settings={settings}/>}
      {isOpen("customerInvoice")&&<CustomerInvoiceModal data={mData("customerInvoice")} customers={customers} parts={parts} orders={orders} onSave={saveCustomerInvoice} onClose={()=>closeM("customerInvoice")} t={t} settings={invoiceSettings}/>}
      {isOpen("viewCustomerInvoice")&&<ViewCustomerInvoiceModal inv={mData("viewCustomerInvoice")} onClose={()=>closeM("viewCustomerInvoice")} settings={invoiceSettings}/>}

      {/* Workshop order ready popup — shown after invoice save when confirmed BSRs exist */}
      {wsReadyPopup&&wsReadyPopup.length>0&&(()=>{
        const Cs=curSym(settings?.currency||"ZAR R");
        return (
          <div className="overlay" onClick={()=>setWsReadyPopup(null)}>
            <div className="modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontWeight:800,fontSize:17}}>⚠️ Workshop Orders Need Preparation</div>
                  <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>The following workshop orders are confirmed. Prepare the parts and notify the workshop.</div>
                </div>
                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"var(--text3)"}} onClick={()=>setWsReadyPopup(null)}>✕</button>
              </div>
              {wsReadyPopup.map(r=>{
                const items=Array.isArray(r.items)?r.items:[];
                const replyItems=Array.isArray(r.reply_items)?r.reply_items:[];
                const total=replyItems.reduce((s,i)=>s+(+i.price||0)*(i.qty||1),0);
                const waMsg=`Hi ${r.workshop_name||"there"}, your parts are ready for collection at ${currentBranch?.name||"the branch"}. Please come collect at your earliest convenience. Thank you!`;
                return (
                  <div key={r.id} style={{padding:"12px 14px",background:"var(--surface2)",borderRadius:10,marginBottom:10,border:"1px solid var(--border)"}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{r.workshop_name||"Workshop"}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginBottom:total>0?2:8}}>{items.map(i=>`${i.name} ×${i.qty}`).join(" · ")}</div>
                    {total>0&&<div style={{fontSize:13,color:"var(--accent)",fontWeight:700,marginBottom:8}}>{Cs}{total.toFixed(2)}</div>}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {r.workshop_phone&&<a href={waLink(r.workshop_phone,waMsg)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{background:"#25D366",color:"#fff",textDecoration:"none"}}>💬 WhatsApp Workshop</a>}
                      <button className="btn btn-success btn-sm" onClick={async()=>{
                        await api.patch("branch_stock_requests","id",r.id,{status:"dispatched",dispatched_at:new Date().toISOString()});
                        await refreshTables("branch_stock_requests");
                        setWsReadyPopup(prev=>prev.filter(x=>x.id!==r.id));
                        showToast("✅ Marked ready — workshop will be notified");
                      }}>🚚 Mark Ready for Collection</button>
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-ghost" style={{width:"100%",marginTop:8}} onClick={()=>setWsReadyPopup(null)}>Close</button>
            </div>
          </div>
        );
      })()}
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

      {/* RFQ SEND — steps through the selected suppliers one at a time so each
          one actually gets a WhatsApp/email send action instead of only the
          last supplier in a multi-select batch being shown. */}
      {isOpen("rfqSend")&&(()=>{
        const d=mData("rfqSend")||{};
        const queue=d.queue||[];
        const index=d.index||0;
        const cur=queue[index]||{};
        const {part_name,part_sku,supplier_name,supplier_email,supplier_phone,qty_requested,token,message}=cur;
        const replyUrl=`${window.location.origin}${window.location.pathname}?rfq=${token}`;
        const waMsg=`${message||`RFQ for ${part_name} (${part_sku}) - Qty: ${qty_requested}`}\n\n📎 Submit quote here (no login needed):\n${replyUrl}`;
        const isLast=index>=queue.length-1;
        const advance=()=>{ if(isLast) closeM("rfqSend"); else openM("rfqSend",{queue,index:index+1}); };
        return (
          <div className="overlay" onClick={()=>closeM("rfqSend")}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
              <MHead title={`📩 Send RFQ to ${supplier_name}`}
                sub={queue.length>1?`Supplier ${index+1} of ${queue.length}`:undefined}
                onClose={()=>closeM("rfqSend")}/>
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
                <button className="btn btn-primary" style={{fontSize:14}} onClick={advance}>
                  {isLast?"✅ Finish":`Next Supplier (${index+2}/${queue.length}) →`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PO CONFIRM — after accepting a quote and creating the Purchase Invoice,
          let the user notify the supplier (WhatsApp/email) or just log that they
          phoned them, instead of being yanked straight to the invoices tab. */}
      {isOpen("poConfirm")&&(()=>{
        const d=mData("poConfirm")||{};
        const {invoiceId,supplierName,supplierPhone,supplierEmail,partName,partSku,supplierPartNo,qty,price}=d;
        const poMsg=`Hi ${supplierName||"there"}, confirming our order:\n\n`
          +`${partName}${partSku?` (Our SKU: ${partSku})`:""}\n`
          +`${supplierPartNo?`Supplier code: ${supplierPartNo}\n`:""}`
          +`PRICE @ ${fmtAmt(price)}\nQTY NEED X ${qty}\n\n`
          +`PO Ref: ${invoiceId}\n\nThank you!`;
        const saveRemark=async()=>{
          await api.patch("supplier_invoices","id",invoiceId,{notes:poConfirmRemark});
          await refreshTables("supplier_invoices");
          showToast("Remark saved");
        };
        return (
          <div className="overlay" onClick={()=>{closeM("poConfirm");setPoConfirmRemark("");}}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
              <MHead title="✅ Purchase Order Created" sub={invoiceId} onClose={()=>{closeM("poConfirm");setPoConfirmRemark("");}}/>
              <div style={{background:"var(--surface2)",borderRadius:10,padding:13,marginBottom:15,border:"1px solid var(--border)",fontSize:13}}>
                <strong>{partName}</strong>{partSku&&<span style={{color:"var(--text3)"}}> (Our SKU: {partSku})</span>}
                {supplierPartNo&&<div style={{marginTop:4,fontFamily:"DM Mono,monospace",color:"var(--green)",fontWeight:700}}>Supplier code: {supplierPartNo}</div>}
                <div style={{marginTop:4}}>PRICE @ {fmtAmt(price)} &nbsp;·&nbsp; QTY NEED X {qty}</div>
                <div style={{marginTop:3,color:"var(--text3)"}}>from <strong style={{color:"var(--text)"}}>{supplierName}</strong></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:15}}>
                <p style={{fontSize:12,color:"var(--text3)",margin:0,fontWeight:600}}>📬 Let the supplier know:</p>
                {supplierPhone?<a href={waLink(supplierPhone,poMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-primary" style={{width:"100%",background:"#25D366",padding:12,fontSize:14}}>📲 Send via WhatsApp</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 No phone on file</p>}
                {supplierEmail?<a href={mailLink(supplierEmail,`Order Confirmation - ${invoiceId}`,poMsg)} style={{textDecoration:"none"}}><button className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:14}}>✉ Send via Email</button></a>:<p style={{fontSize:12,color:"var(--text3)",textAlign:"center"}}>💡 No email on file</p>}
              </div>
              <FD>
                <FL label="Or just note how it was placed — e.g. phoned the supplier"/>
                <textarea className="inp" value={poConfirmRemark} onChange={e=>setPoConfirmRemark(e.target.value)} placeholder="e.g. Phoned CATO 08:30, confirmed 7 day lead time" style={{minHeight:60}}/>
              </FD>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{closeM("poConfirm");setPoConfirmRemark("");}}>Done</button>
                <button className="btn btn-primary" style={{flex:1}} onClick={async()=>{await saveRemark();closeM("poConfirm");setPoConfirmRemark("");}}>💾 Save Remark</button>
              </div>
              <button className="btn btn-ghost btn-sm" style={{width:"100%",marginTop:8}} onClick={()=>{closeM("poConfirm");setPoConfirmRemark("");setTab("purchaseInvoices");}}>View Purchase Invoices →</button>
            </div>
          </div>
        );
      })()}

      {/* LIGHTBOX */}
      {lightbox&&<ImgLightbox url={lightbox.url} onClose={()=>setLightbox(null)}/>}

      {/* INVENTORY STOCK VALUE REPORT */}
      {invReport&&(()=>{
        const isQ=invReport==="quantum";
        const isH=invReport==="hiace";
        const vatRate=invoiceSettings.tax_rate||0;
        const cur=C();
        const rows=[...displayParts]
          .filter(p=>{
            if(isQ) return p.is_quantum&&(p.stock??0)>0;
            if(isH) return p.is_hiace&&(p.stock??0)>0;
            return !p.is_quantum&&!p.is_hiace&&(p.stock??0)>0;
          })
          .sort((a,b)=>{
            const cc=(a.category||"").localeCompare(b.category||"");
            return cc!==0?cc:(a.sku||"").localeCompare(b.sku||"");
          });
        const totalQty=rows.reduce((s,p)=>s+(p.stock??0),0);
        const totalCost=rows.reduce((s,p)=>s+(p.stock??0)*(p.cost_price??0),0);
        const vatAmt=totalCost*vatRate/100;
        const grandTotal=totalCost+vatAmt;
        const title=isQ?"Quantum Parts Report":isH?"Hiace Parts Report":"Others Report";
        const shopName=settings.shop_name||"";
        const dateStr=new Date().toLocaleDateString();

        const openPrintWindow=(autoPrint)=>{
          const e=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          const rowsHtml=rows.map(p=>`
            <tr>
              <td>${e(p.category||"—")}</td>
              <td class="mono">${e(p.sku)}</td>
              <td>${e(p.name)}</td>
              <td class="num">${p.stock??0}</td>
              <td class="num">${p.cost_price>0?cur+(+(p.cost_price)).toFixed(2):"—"}</td>
              <td class="num">${cur+(+(p.price??0)).toFixed(2)}</td>
            </tr>`).join("");
          const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${e(title)}</title>
          <style>
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px;max-width:900px;margin:0 auto}
            .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #111}
            .shop{font-size:22px;font-weight:900;color:#f97316}
            .meta{font-size:11px;color:#666;margin-top:4px}
            .report-title{font-size:18px;font-weight:700;text-align:right}
            .report-date{font-size:11px;color:#666;text-align:right;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin-top:8px}
            thead tr{background:#111;color:#fff}
            thead th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
            thead th.num{text-align:right}
            tbody tr:nth-child(even){background:#f9f9f9}
            tbody td{padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px}
            .mono{font-family:monospace;font-size:11px;color:#555}
            .num{text-align:right;font-family:monospace}
            tfoot td{padding:9px 10px;font-weight:700;background:#f3f4f6}
            tfoot tr.grand td{background:#111;color:#fff;font-size:14px}
            tfoot tr.vat td{background:#f9f9f9;color:#666;font-weight:400;font-size:11px}
            .print-btn{display:flex;gap:10px;margin-bottom:20px}
            .btn{padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}
            .btn-print{background:#1d4ed8;color:#fff}
            .btn-pdf{background:#dc2626;color:#fff}
            @media print{.print-btn{display:none!important}body{padding:16px}}
          </style></head><body>
          <div class="print-btn">
            <button class="btn btn-print" onclick="window.print()">🖨 Print</button>
            <button class="btn btn-pdf" onclick="window.print()">📄 Save as PDF</button>
          </div>
          <div class="header">
            <div><div class="shop">${e(shopName)}</div><div class="meta">Stock Value Report</div></div>
            <div><div class="report-title">${e(title)}</div><div class="report-date">Date: ${dateStr} · ${rows.length} parts</div></div>
          </div>
          <table>
            <thead><tr><th>Category</th><th>SKU</th><th>Part Name</th><th class="num">Qty</th><th class="num">Cost Price</th><th class="num">Price</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr><td colspan="3" style="text-align:right">Subtotal (cost × qty)</td><td class="num">${totalQty}</td><td class="num">${cur+totalCost.toFixed(2)}</td><td></td></tr>
              ${vatRate>0?`<tr class="vat"><td colspan="4" style="text-align:right">VAT (${vatRate}%)</td><td class="num">${cur+vatAmt.toFixed(2)}</td><td></td></tr>`:""}
              <tr class="grand"><td colspan="4" style="text-align:right">Grand Total (incl. VAT)</td><td class="num">${cur+grandTotal.toFixed(2)}</td><td></td></tr>
            </tfoot>
          </table>
          </body></html>`;
          const w=window.open("","_blank","width=960,height=800");
          if(!w)return;
          w.document.write(html);
          w.document.close();
          if(autoPrint) setTimeout(()=>w.print(),400);
        };

        return (
          <div className="overlay" onClick={()=>setInvReport(null)}>
            <div className="modal" style={{maxWidth:780,maxHeight:"82vh",overflow:"hidden",display:"flex",flexDirection:"column",padding:0}} onClick={e=>e.stopPropagation()}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,flexWrap:"wrap",gap:8}}>
                <div style={{fontWeight:700,fontSize:16}}>{isQ?"🚐 Quantum Parts Report":isH?"🚐 Hiace Parts Report":"🔩 Others Report"}</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:"var(--text3)"}}>{rows.length} parts</span>
                  <button className="btn btn-ghost btn-sm" onClick={()=>openPrintWindow(true)}>🖨 Print</button>
                  <button className="btn btn-info btn-sm" onClick={()=>openPrintWindow(false)}>📄 PDF</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setInvReport(null)}>✕</button>
                </div>
              </div>
              <div style={{overflowY:"auto",flex:1}}>
                <table className="tbl" style={{fontSize:13}}>
                  <thead><tr>
                    {["Category","SKU","Part Name","Qty","Cost Price","Price"].map(h=>(
                      <th key={h} style={{whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.map(p=>(
                      <tr key={p.id}>
                        <td><span className="badge" style={{background:"var(--surface3)",color:"var(--text2)",fontSize:11}}>{p.category||"—"}</span></td>
                        <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{p.sku}</code></td>
                        <td style={{fontWeight:600,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,color:(p.stock??0)<=p.min_stock?"var(--yellow)":"var(--text)"}}>{p.stock??0}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:13,color:"var(--text2)"}}>{p.cost_price>0?fmtAmt(p.cost_price):"—"}</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{fmtAmt(p.price??0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:"2px solid var(--border)",background:"var(--surface2)"}}>
                      <td colSpan={3} style={{textAlign:"right",fontWeight:700,fontSize:13,padding:"10px 12px"}}>Subtotal (cost × qty)</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,padding:"10px 8px"}}>{totalQty}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:15,padding:"10px 8px"}}>{fmtAmt(totalCost)}</td>
                      <td/>
                    </tr>
                    {vatRate>0&&(
                      <tr style={{background:"var(--surface2)"}}>
                        <td colSpan={4} style={{textAlign:"right",fontSize:12,color:"var(--text3)",padding:"6px 12px"}}>VAT ({vatRate}%)</td>
                        <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:13,color:"var(--text3)",padding:"6px 8px"}}>{fmtAmt(vatAmt)}</td>
                        <td/>
                      </tr>
                    )}
                    <tr style={{background:"var(--surface2)"}}>
                      <td colSpan={4} style={{textAlign:"right",fontWeight:700,fontSize:14,padding:"10px 12px"}}>Grand Total (incl. VAT)</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:18,color:"var(--accent)",padding:"10px 8px"}}>{fmtAmt(grandTotal)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
        inv={mData("pdfInvoice")} settings={invoiceSettings} onClose={()=>closeM("pdfInvoice")}/>}

      {isOpen("changePassword")&&<ChangePasswordModal user={user} onClose={()=>closeM("changePassword")} showToast={showToast}/>}

      {showLocationSetup&&<WsLocationSetupModal
        profile={workshopProfile}
        onSave={async(city,country)=>{
          const extra = {};
          try {
            const pb = localStorage.getItem("ap_pending_linked_branch");
            if (pb && !workshopProfile.linked_branch_id) { extra.linked_branch_id = pb; localStorage.removeItem("ap_pending_linked_branch"); }
          } catch {}
          await saveWorkshopProfile({...workshopProfile,city,country,...extra});
          setShowLocationSetup(false);
          showToast("✅ Location saved");
        }}
        onClose={()=>setShowLocationSetup(false)}/>}

      {toast&&<div className="toast" style={{borderColor:toast.type==="err"?"rgba(248,113,113,.3)":"var(--border2)",color:toast.type==="err"?"var(--red)":"var(--green)"}}>
        {toast.type==="err"?"⚠":"✓"} {toast.msg}
      </div>}

      {busyMsg&&<div style={{position:"fixed",inset:0,zIndex:999999,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(2px)"}}>
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:"28px 36px",display:"flex",flexDirection:"column",alignItems:"center",gap:16,maxWidth:340,textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,.4)"}}>
          <div style={{width:44,height:44,border:"4px solid var(--border)",borderTop:"4px solid var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
          <div style={{fontWeight:700,fontSize:15,color:"var(--text1)"}}>{busyMsg}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>Please wait…</div>
        </div>
      </div>}

      {isDemo&&<div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9999,background:"linear-gradient(90deg,#f59e0b,#f97316)",color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,letterSpacing:.3}}>
        🔒 Demo Mode — all data is read-only. Contact us to get your own account.
      </div>}
      {role==="workshop"&&subStatus&&!subStatus.expired&&subStatus.daysLeft<=7&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9998,background:"linear-gradient(90deg,#f97316,#ef4444)",color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,letterSpacing:.3}}>
          ⚠️ {subStatus.status==="trial"?"Free trial":"Subscription"} expires in <strong>{subStatus.daysLeft<=0?"today":subStatus.daysLeft===1?"1 day":`${subStatus.daysLeft} days`}</strong> ({subStatus.expiresAt}) — Contact admin to renew
        </div>
      )}
      {role!=="workshop"&&role!=="admin"&&(()=>{const si=getSubInfo(user);return si.status==="active"&&si.daysLeft!=null&&si.daysLeft<=7&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9998,background:"linear-gradient(90deg,#f97316,#ef4444)",color:"#fff",textAlign:"center",padding:"8px 16px",fontSize:13,fontWeight:600,letterSpacing:.3}}>
          ⚠️ Subscription expires in <strong>{si.daysLeft<=0?"today":si.daysLeft===1?"1 day":`${si.daysLeft} days`}</strong> ({si.expiresAt}) — Contact admin to renew
        </div>
      );})()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP PROFILE / SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════

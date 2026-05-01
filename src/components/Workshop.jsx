import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { api, SUPABASE_URL, SUPABASE_KEY } from "../lib/api.js";
import { getSettings, C, curSym, updateSettings } from "../lib/settings.js";
import { fmtAmt, makeId, today, toImgUrl, toFullUrl, toSaveUrl, waLink, extractDriveId } from "../lib/helpers.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";
import { tSt } from "../lib/i18n.js";
import { CSS } from "../styles.js";
import { ErrorBoundary, LogoSVG, ShopLogo, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "../components/shared.jsx";
import { VehiclePhotoUploader } from "./RfqVehicles.jsx";
import { WsStockPage, WsStockModal, WsStockAdjustModal } from "./ws/Stock.jsx";
import { WsServicesPage, WsServiceModal } from "./ws/Services.jsx";
import { WsSuppliersPage, WsSupplierModal } from "./ws/WsSuppliers.jsx";
import { WsTransferPage } from "./ws/Transfer.jsx";
import { WsDocumentsPage } from "./ws/Documents.jsx";
import { printStockLabel, printChecklistReport, printJobCardLabel, printWorkshopInvoice, printWorkshopQuote } from "./ws/Print.jsx";
import { BookInModal } from "./ws/BookIn.jsx";
import { WsCustomersPage, WsCustomerForm, WsVehicleForm, LicenceRenewalModal, WsLicenceRenewalsPage } from "./ws/Customers.jsx";
import { WsSupplierInvoicesPage, WsSupInvoiceModal, WsSupInvoiceViewModal, WsSupPaymentModal, WsSupReturnModal } from "./ws/SupplierInvoices.jsx";
import { WsCreatePoFromJobModal, WsPurchaseOrdersPage, WsPurchaseOrderModal, WsReceiveGoodsModal } from "./ws/PurchaseOrders.jsx";
import { WsQuoteModal, WsInvoiceEditModal, WsPaymentModal, WsStatementModal, WorkshopInvoiceModal } from "./ws/InvoiceModals.jsx";


// ═══════════════════════════════════════════════════════════════
// WORKSHOP CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// WORKSHOP PAGE
// ═══════════════════════════════════════════════════════════════
export function WorkshopPage({jobs,jobItems,invoices,quotes=[],parts=[],partFitments=[],vehicles=[],customers,wsCustomers=[],wsVehicles=[],wsStock=[],wsServices=[],wsSuppliers=[],wsSupplierRequests=[],wsSupplierQuotes=[],wsSupplierInvoices=[],wsSupplierInvItems=[],wsSupplierPayments=[],wsSupplierReturns=[],wsDocs=[],settings,initialTab,onSaveJob,onDeleteJob,onMoveJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,suppliers=[],onSaveWsCustomer,onDeleteWsCustomer,onSaveWsVehicle,onDeleteWsVehicle,onSaveWsStock,onDeleteWsStock,onAdjustWsStock,onSaveWsService,onDeleteWsService,onSaveWsSupplier,onDeleteWsSupplier,onSaveWsSupplierRequest,onDeleteWsSupplierRequest,onSaveWsSupplierQuote,onSaveWsSupplierInvoice,onDeleteWsSupplierInvoice,onSaveWsSupplierPayment,onDeleteWsSupplierPayment,onSaveWsSupplierReturn,onSaveWsTransfer,onSaveWsDoc,onDeleteWsDoc,wsRole="main",wsId=null,wsProfiles=[],wsSqReplies=[],wsPurchaseOrders=[],wsPoItems=[],onGenerateWsQuoteLink,onSaveWsPurchaseOrder,onDeleteWsPurchaseOrder,onReceiveWsPurchaseOrder,wsLicenceRenewals=[],onSaveWsLicenceRenewal,onUpdateWsLicenceRenewal,wsBookings=[],onPatchWsBooking,onDeleteWsBooking,onRefreshBookings,onRefresh,wsProfile={},t,lang}) {
  const [view,           setView]           = useState("list");
  const [activeJob,      setActiveJob]      = useState(null);
  const [editJob,        setEditJob]        = useState(null);
  const [filterSt,       setFilterSt]       = useState("__all__");
  const [search,         setSearch]         = useState("");
  const [bookIn,         setBookIn]         = useState(false);
  const [wsTab,          setWsTab]          = useState(initialTab||"jobs");
  const [stmtCust,       setStmtCust]       = useState("");
  const [qInvModal,      setQInvModal]      = useState(null);
  const [sortBy,         setSortBy]         = useState("date_desc");
  const [pendingViewPoId,setPendingViewPoId] = useState(null);
  const [filterWs,      setFilterWs]      = useState("__all__");
  const [filterCity,    setFilterCity]    = useState("__all__");
  const [filterCountry, setFilterCountry] = useState("__all__");
  const [jobPage,   setJobPage]   = useState(0);
  const [bookingToken,    setBookingToken]    = useState(wsProfile?.booking_token||"");
  const [bookingsRefreshing, setBookingsRefreshing] = useState(false);
  const [bookingsLastAt,     setBookingsLastAt]     = useState(null);
  const [bkDeleteModal,   setBkDeleteModal]   = useState(null); // {booking}
  const [bkDeleteReason,  setBkDeleteReason]  = useState("");
  const [bkDeleteBy,      setBkDeleteBy]      = useState("");
  const [bkDeleting,      setBkDeleting]      = useState(false);
  const [bkShowDeleted,   setBkShowDeleted]   = useState(false);
  const [bkDeletedPeriod, setBkDeletedPeriod] = useState("week");
  const [bkAvailOpen,     setBkAvailOpen]     = useState(false);
  const [bkWorkDays,      setBkWorkDays]      = useState([1,2,3,4,5]);
  const [bkHolidays,      setBkHolidays]      = useState([]);
  const [bkClosedDates,   setBkClosedDates]   = useState([]);
  const [bkAvailSaving,   setBkAvailSaving]   = useState(false);
  const [bkNewHolDate,    setBkNewHolDate]    = useState("");
  const [bkNewHolName,    setBkNewHolName]    = useState("");
  const [bkNewClDate,     setBkNewClDate]     = useState("");
  const [bkNewClReason,   setBkNewClReason]   = useState("");
  const [bkCancelModal,   setBkCancelModal]   = useState(null);
  const [bkCancelReason,  setBkCancelReason]  = useState("");
  const [kanbanView,      setKanbanView]      = useState(true);
  const [jobDetailTab,    setJobDetailTab]    = useState("car");
  const [kanbanInvJob,    setKanbanInvJob]    = useState(null);
  const [kanbanInvOpen,   setKanbanInvOpen]   = useState(false);
  const kanbanInvPanelRef = useRef(null);
  const [kanbanPayJob,    setKanbanPayJob]    = useState(null);

  // Keep activeJob in sync when jobs array refreshes
  useEffect(()=>{
    if(activeJob){
      const fresh=jobs.find(j=>j.id===activeJob.id);
      if(fresh) setActiveJob(fresh);
    }
  },[jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh bookings every 30 s while on the bookings tab
  useEffect(()=>{
    if(wsTab!=="wsbookings"||!onRefreshBookings) return;
    const run=async()=>{ setBookingsRefreshing(true); await onRefreshBookings(); setBookingsRefreshing(false); setBookingsLastAt(new Date()); };
    const id=setInterval(run,30000);
    return()=>clearInterval(id);
  },[wsTab,onRefreshBookings]);

  useEffect(()=>{
    setBkWorkDays(wsProfile?.working_days||[1,2,3,4,5]);
    setBkHolidays(wsProfile?.public_holidays||[]);
    setBkClosedDates(wsProfile?.closed_dates||[]);
  },[wsProfile]);

  const JOB_PAGE_SIZE = typeof window!=="undefined"&&window.innerWidth<=767 ? 5 : 20;

  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};
  const ST_BG    = {"Pending":"rgba(96,165,250,.12)","In Progress":"rgba(251,191,36,.12)","Done":"rgba(52,211,153,.12)","Delivered":"rgba(100,116,139,.12)"};

  const kanbanSt = (job) => {
    if (job.is_problem)                          return {label:"⚠️ Problem Job",       color:"#f87171", bg:"rgba(248,113,113,.15)"};
    const inv = jobInvoice(job.id);
    if (inv?.status==="paid")                    return {label:"💚 Payment Received",   color:"#10b981", bg:"rgba(16,185,129,.15)"};
    if (inv)                                     return {label:"🧾 Invoiced",           color:"#f97316", bg:"rgba(249,115,22,.15)"};
    if (job.status==="Pending")                  return {label:"⏳ Pending",            color:"#a78bfa", bg:"rgba(167,139,250,.15)"};
    if (job.status==="In Progress")              return {label:"⚙️ In Progress",        color:"#fbbf24", bg:"rgba(251,191,36,.15)"};
    if (job.status==="Done")                     return {label:"✅ Done",               color:"#34d399", bg:"rgba(52,211,153,.15)"};
    if (job.status==="Delivered")                return {label:"🚗 Delivered",          color:"#94a3b8", bg:"rgba(148,163,184,.15)"};
    return                                              {label:job.status,              color:"var(--text3)", bg:"var(--surface2)"};
  };

  const wsProfileMap  = Object.fromEntries(wsProfiles.map(p=>[p.id, p.name||p.id]));
  const wsProfileMap2 = Object.fromEntries(wsProfiles.map(p=>[p.id, p]));
  const wsCities      = [...new Set(wsProfiles.map(p=>p.city).filter(Boolean))].sort();
  const wsCountries   = [...new Set(wsProfiles.map(p=>p.country).filter(Boolean))].sort();

  const filtered = jobs.filter(j=>{
    if(filterSt!=="__all__"&&j.status!==filterSt) return false;
    if(filterWs!=="__all__"&&j.workshop_id!==filterWs) return false;
    if(filterCity!=="__all__"){const p=wsProfileMap2[j.workshop_id];if(!p||p.city!==filterCity) return false;}
    if(filterCountry!=="__all__"){const p=wsProfileMap2[j.workshop_id];if(!p||p.country!==filterCountry) return false;}
    if(!search.trim()) return true;
    const s=search.toLowerCase();
    const wsName=wsProfileMap[j.workshop_id]||j.workshop_id||"";
    return `${j.customer_name} ${j.vehicle_reg} ${j.vehicle_make} ${j.vehicle_model} ${j.id} ${wsName}`.toLowerCase().includes(s);
  }).sort((a,b)=>{
    if(sortBy==="date_asc")  return (a.date_in||"").localeCompare(b.date_in||"");
    if(sortBy==="date_desc") return (b.date_in||"").localeCompare(a.date_in||"");
    if(sortBy==="customer")  return (a.customer_name||"").localeCompare(b.customer_name||"");
    if(sortBy==="job_id")    return a.id.localeCompare(b.id);
    if(sortBy==="make")      return `${a.vehicle_make||""} ${a.vehicle_model||""}`.localeCompare(`${b.vehicle_make||""} ${b.vehicle_model||""}`);
    return 0;
  });

  useEffect(()=>{ setJobPage(0); },[filterSt,search,sortBy,filterWs,filterCity,filterCountry]);

  const jobInvoice = (jobId) => invoices.find(i=>i.job_id===jobId);
  const jobQuote   = (jobId) => quotes.find(q=>q.job_id===jobId);

  const C   = curSym(settings.currency||getSettings().currency);
  const fmt = v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const confirmBooking = async(b) => {
    let vehicleId = b.workshop_vehicle_id || null;
    if (!vehicleId) {
      const custId = makeId("WSC");
      await api.insert("workshop_customers",{id:custId,workshop_id:wsId,name:b.customer_name||"",phone:b.customer_phone||"",email:b.customer_email||null,created_at:new Date().toISOString()}).catch(()=>{});
      vehicleId = makeId("WSV");
      await api.insert("workshop_vehicles",{id:vehicleId,workshop_id:wsId,workshop_customer_id:custId,reg:b.vehicle_reg||"",make:b.vehicle_make||"",model:b.vehicle_model||"",year:b.vehicle_year||"",color:b.vehicle_color||"",vin:b.vin||"",engine_no:b.engine_no||"",licence_disc_expiry:b.licence_disc_expiry||""}).catch(()=>{});
    }
    const str = v => v?.toString().trim()||null;
    const int = v => v ? parseInt(v,10)||null : null;
    const newJob = {
      id:makeId("WSJ"), workshop_id:wsId,
      customer_name:str(b.customer_name), customer_phone:str(b.customer_phone),
      workshop_vehicle_id:vehicleId,
      vehicle_reg:str(b.vehicle_reg), vehicle_make:str(b.vehicle_make), vehicle_model:str(b.vehicle_model),
      vehicle_year:int(b.vehicle_year), vehicle_color:str(b.vehicle_color),
      vin:str(b.vin), engine_no:str(b.engine_no),
      complaint:str(b.complaint), mileage:null,
      status:"Pending", date_in:today(),
      diagnosis:null, mechanic:null, notes:null, date_out:null,
    };
    // Use api.insert directly — onSaveJob does a PATCH when id is present, which is a no-op for a new row
    const res = await api.insert("workshop_jobs", newJob).catch(e=>({message:e.message}));
    if(!Array.isArray(res)){
      alert("❌ Failed to create job: "+(res?.message||"Unknown error — check Supabase logs"));
      return;
    }
    // Copy booking photos to job photos tab
    const photoUrls=[b.photo_1,b.photo_2,b.photo_3].filter(Boolean);
    for(const url of photoUrls){
      await api.insert("workshop_job_photos",{id:makeId("PH"),job_id:newJob.id,url,folder_path:"Booking_Photos"}).catch(()=>{});
    }
    // Copy booking photos to vehicle photo slots so they show on the kanban card
    const vehPhotoPatch={};
    if(b.photo_1) vehPhotoPatch.photo_front=b.photo_1;
    if(b.photo_2) vehPhotoPatch.photo_side=b.photo_2;
    if(b.photo_3) vehPhotoPatch.photo_rear=b.photo_3;
    if(Object.keys(vehPhotoPatch).length) await api.patch("workshop_vehicles","id",vehicleId,vehPhotoPatch).catch(()=>{});
    await onPatchWsBooking(b.id,{status:"job_created",workshop_vehicle_id:vehicleId});
    await onRefresh(); // sync DB → jobs list includes the new job
    setJobDetailTab("car");
    setActiveJob(newJob);
    setWsTab("jobs");  // take the user to the jobs tab
    setView("job");
  };

  const bkWaLink = (booking, type, reason="", overrideDate="") => {
    const phone = (booking.customer_phone||"").replace(/\D/g,"");
    if(!phone) return "#";
    const shop = wsProfile?.name||"Workshop";
    const n = (booking.customer_name||"").split(" ")[0]||"there";
    const reg = booking.vehicle_reg||"";
    const dt = overrideDate||booking.preferred_date||"";
    const dtStr = dt ? ` on ${dt}` : "";
    let msg = "";
    if(type==="received") msg=`Hi ${n}, we received your booking request for ${reg}${dtStr}. We will contact you shortly to confirm. — ${shop}`;
    if(type==="confirm")  msg=`Hi ${n}, your booking for ${reg}${dtStr} is CONFIRMED! We look forward to seeing you. — ${shop}`;
    if(type==="cancel")   msg=`Hi ${n}, unfortunately we need to cancel your booking for ${reg}${dtStr}.${reason?` Reason: ${reason}`:""} Please contact us to reschedule. — ${shop}`;
    if(type==="closure")  msg=`Hi ${n}, we regret to inform you that we will be closed on ${dt||"that date"}${reason?` (${reason})`:""}. Your booking for ${reg} will need to be rescheduled. Please contact us. — ${shop}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const saveAvailability = async () => {
    setBkAvailSaving(true);
    const res = await api.patch("workshop_profiles","id",wsId,{
      working_days: bkWorkDays,
      public_holidays: bkHolidays,
      closed_dates: bkClosedDates,
    }).catch(e=>({message:e.message}));
    if(res&&!Array.isArray(res)&&res.message){
      alert("❌ Save failed: "+res.message+"\n\nYou need to run this SQL in Supabase first:\n\nALTER TABLE workshop_profiles\n  ADD COLUMN IF NOT EXISTS working_days jsonb DEFAULT '[1,2,3,4,5]'::jsonb,\n  ADD COLUMN IF NOT EXISTS public_holidays jsonb DEFAULT '[]'::jsonb,\n  ADD COLUMN IF NOT EXISTS closed_dates jsonb DEFAULT '[]'::jsonb;");
    }
    setBkAvailSaving(false);
  };

  const flagProblem = async(job) => {
    await onSaveJob({...job, is_problem:true, problem_prev_status:job.status});
  };
  const unflagProblem = async(job) => {
    await onSaveJob({...job, is_problem:false, status:job.problem_prev_status||"Pending"});
  };
  const moveJobStatus = async(job, newStatus) => {
    await onSaveJob({...job, status:newStatus});
  };

  // ── Job detail view ──────────────────────────────────────────
  if(view==="job"&&activeJob){
    const items = jobItems.filter(i=>i.job_id===activeJob.id);
    const inv   = jobInvoice(activeJob.id);
    const quote = jobQuote(activeJob.id);
    return (
      <WorkshopJobDetail
        job={activeJob} items={items} invoice={inv} quote={quote}
        jobs={jobs}
        parts={parts} partFitments={partFitments} vehicles={vehicles} settings={settings}
        wsVehicles={wsVehicles} wsCustomers={wsCustomers} wsStock={wsStock} wsServices={wsServices}
        suppliers={suppliers} wsSuppliers={wsSuppliers} wsSupplierRequests={wsSupplierRequests}
        wsSupplierQuotes={wsSupplierQuotes}
        wsPurchaseOrders={wsPurchaseOrders.filter(p=>p.job_id===activeJob.id)}
        onSaveWsSupplierRequest={onSaveWsSupplierRequest}
        onDeleteWsSupplierRequest={onDeleteWsSupplierRequest}
        onSaveWsSupplierQuote={onSaveWsSupplierQuote}
        onSaveWsStock={onSaveWsStock}
        onBack={()=>{ setView("list"); setActiveJob(null); }}
        onSaveJob={async(d,onProgress)=>{ await onSaveJob(d,onProgress); setActiveJob({...activeJob,...d}); }}
        onDeleteJob={async()=>{ await onDeleteJob(activeJob.id); setView("list"); setActiveJob(null); }}
        onMoveJob={async(targetWsId)=>{ await onMoveJob(activeJob.id,targetWsId); setView("list"); setActiveJob(null); }}
        onSaveItem={onSaveItem} onDeleteItem={onDeleteItem}
        onSaveInvoice={onSaveInvoice} onUpdateInvoice={onUpdateInvoice} onDeleteInvoice={onDeleteInvoice}
        onSaveQuote={onSaveQuote} onDeleteQuote={onDeleteQuote} onConvertQuoteToInvoice={onConvertQuoteToInvoice}
        onSendQuoteForApproval={onSendQuoteForApproval}
        onSaveWsVehicle={onSaveWsVehicle}
        wsRole={wsRole}
        sqReplies={wsSqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===activeJob.id))}
        onGenerateWsQuoteLink={onGenerateWsQuoteLink}
        onSaveWsPurchaseOrder={onSaveWsPurchaseOrder}
        onViewPurchaseOrders={()=>{ setView("list"); setWsTab("wssuporders"); }}
        onViewPO={(poId)=>{ setPendingViewPoId(poId); setView("list"); setWsTab("wssuporders"); }}
        onGoToStock={()=>{ setView("list"); setWsTab("wsstock"); }}
        onSaveWsLicenceRenewal={onSaveWsLicenceRenewal}
        wsId={wsId}
        wsProfile={wsProfile}
        initialTab={jobDetailTab}
        onRefresh={onRefresh}
        t={t} lang={lang}/>
    );
  }

  // ── Sub-nav tabs ─────────────────────────────────────────────
  const quoteResponses = quotes.filter(q=>q.confirm_status==="confirmed"||q.confirm_status==="declined").length;
  const WS_TABS = wsRole==="mechanic" ? [
    ["jobs",       "🔧 Jobs",        jobs.length],
  ] : [
    ["jobs",       "🔧 Jobs",        jobs.length],
    ["customers",  "👥 Customers",   wsCustomers.length],
    ["wsbookings", wsBookings.filter(b=>b.status==="pending").length>0?`🗓️ Bookings 🔔`:"🗓️ Bookings", wsBookings.filter(b=>b.status!=="deleted").length||null],
    ["quotations", quoteResponses>0?`📝 Quotations 🔔`:"📝 Quotations",  quotes.length],
    ["invoices",   "🧾 Invoices",    invoices.length],
    ["payments",   "💳 Payments",    invoices.filter(i=>(+i.paid_amount||0)>0).length],
    ["wsstock",      "📦 WS Stock",    wsStock.length],
    ["wsservices",   "🔧 Services",    wsServices.length],
    ["wssuppliers",  "🏪 Suppliers",   wsSuppliers.length],
    ["wssuporders",  "📋 Purchase Orders", wsPurchaseOrders.length],
    ["wssupinv",     "🧾 Supplier Inv",wsSupplierInvoices.length],
    ["wstransfer",   "🔄 Transfer",    null],
    ["wsdocs",     "📎 Documents",   wsDocs.length],
    ["wslicencerenewal", "🪪 Licence Renewals", wsLicenceRenewals.length||null],
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
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button className="btn btn-primary" style={{fontSize:14,padding:"9px 18px"}} onClick={()=>setBookIn(true)}>📷 Book In Car</button>
            <button className="btn btn-ghost" onClick={()=>setEditJob({
              customer_name:"",customer_phone:"",vehicle_reg:"",vehicle_make:"",
              vehicle_model:"",vehicle_year:"",vehicle_color:"",vin:"",engine_no:"",mileage:"",
              complaint:"",diagnosis:"",mechanic:"",date_in:new Date().toISOString().slice(0,10),
              date_out:"",notes:"",status:"Pending"
            })}>+ Manual</button>
            <div style={{display:"flex",gap:2,marginLeft:4,border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
              <button title="List view" style={{padding:"7px 11px",border:"none",cursor:"pointer",background:!kanbanView?"var(--accent)":"transparent",color:!kanbanView?"#fff":"var(--text3)",fontSize:14,lineHeight:1}} onClick={()=>setKanbanView(false)}>≡</button>
              <button title="Board view" style={{padding:"7px 11px",border:"none",cursor:"pointer",background:kanbanView?"var(--accent)":"transparent",color:kanbanView?"#fff":"var(--text3)",fontSize:14,lineHeight:1}} onClick={()=>setKanbanView(true)}>⬜</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sub-navigation (desktop) ── */}
      <div className="hide-mobile" style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:18,borderBottom:"1px solid var(--border)",paddingBottom:0}}>
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
      {/* ── Sub-navigation (mobile dropdown) ── */}
      <div className="show-mobile" style={{marginBottom:14}}>
        <select className="inp" value={wsTab} onChange={e=>setWsTab(e.target.value)} style={{width:"100%",fontWeight:600}}>
          {WS_TABS.map(([v,label,cnt])=>(
            <option key={v} value={v}>{label}{cnt!=null?` (${cnt})`:""}</option>
          ))}
        </select>
      </div>

      {/* ══════════════ JOBS TAB ══════════════ */}
      {wsTab==="jobs"&&(<>
        {!kanbanView&&(<>
        <div className="tabs" style={{marginBottom:14,width:"fit-content",maxWidth:"100%",flexWrap:"wrap"}}>
          {[["__all__","All"],["Pending","🔵 Pending"],["In Progress","🟡 In Progress"],["Done","🟢 Done"],["Delivered","⚫ Delivered"]].map(([v,l])=>{
            const cnt=v==="__all__"?jobs.length:jobs.filter(j=>j.status===v).length;
            return <button key={v} className={`tab ${filterSt===v?"on":""}`} onClick={()=>setFilterSt(v)}>{l} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;
          })}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{position:"relative",flex:"1 1 220px",maxWidth:320}}>
            <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, plate..."/>
            {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
          </div>
          <select className="inp" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{flex:"0 0 auto",width:"auto",minWidth:160}}>
            <option value="date_desc">↓ Newest first</option>
            <option value="date_asc">↑ Oldest first</option>
            <option value="customer">A–Z Customer</option>
            <option value="job_id">Job #</option>
            <option value="make">Make / Model</option>
          </select>
          {!wsId&&wsProfiles.length>0&&(<>
            <select className="inp" value={filterWs} onChange={e=>{setFilterWs(e.target.value);setFilterCity("__all__");setFilterCountry("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:180}}>
              <option value="__all__">🏪 All Workshops</option>
              {wsProfiles.map(p=>(
                <option key={p.id} value={p.id}>{p.name||p.id}</option>
              ))}
            </select>
            {wsCities.length>0&&(
              <select className="inp" value={filterCity} onChange={e=>{setFilterCity(e.target.value);setFilterWs("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:140}}>
                <option value="__all__">🏙️ All Cities</option>
                {wsCities.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {wsCountries.length>0&&(
              <select className="inp" value={filterCountry} onChange={e=>{setFilterCountry(e.target.value);setFilterWs("__all__");}} style={{flex:"0 0 auto",width:"auto",minWidth:150}}>
                <option value="__all__">🌍 All Countries</option>
                {wsCountries.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </>)}
        </div>
        {filtered.length===0&&<div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.wsNoJobsFound}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {filtered.slice(jobPage*JOB_PAGE_SIZE,(jobPage+1)*JOB_PAGE_SIZE).map(j=>{
            const jItems=jobItems.filter(i=>i.job_id===j.id);
            const inv=jobInvoice(j.id);
            const jq=jobQuote(j.id);
            const total=jItems.reduce((s,i)=>s+(+i.total||0),0);
            const frontPhoto=wsVehicles.find(v=>v.id===j.workshop_vehicle_id)?.photo_front||"";
            const kst = kanbanSt(j);
            return (
              <div key={j.id} className="card card-hover" style={{padding:0,cursor:"pointer",borderLeft:`3px solid ${kst.color}`,overflow:"hidden",display:"flex",minHeight:110}}
                onClick={()=>{setJobDetailTab("car");setActiveJob(j);setView("job");}}>
                {/* Front photo */}
                <div style={{width:64,flexShrink:0,background:"var(--surface2)",position:"relative",overflow:"hidden"}}>
                  {frontPhoto?(
                    <img src={toImgUrl(frontPhoto)} alt="car"
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                      onError={e=>{const m=frontPhoto.match(/thumbnail[?]id=([^&]+)/)||frontPhoto.match(/[?&]id=([^&]+)/)||frontPhoto.match(/file\/d\/([^/?]+)/);if(m&&!e.target.src.includes("uc?export=view"))e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;else e.target.style.display="none";}}/>
                  ):(
                    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,color:"var(--border2)"}}>🚗</div>
                  )}
                </div>
                {/* Card content */}
                <div style={{flex:1,padding:"12px 14px",minWidth:0,display:"flex",flexDirection:"column",gap:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer_name||<span style={{color:"var(--text3)"}}>No name</span>}</div>
                      <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{j.customer_phone}</div>
                    </div>
                    <span className="badge" style={{background:kst.bg,color:kst.color,flexShrink:0,marginLeft:6,fontWeight:600}}>{kst.label}</span>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                    {j.vehicle_reg&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text)",fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700}}>🚗 {j.vehicle_reg}</span>}
                    {j.vehicle_make&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text2)",fontSize:11}}>{j.vehicle_make} {j.vehicle_model}</span>}
                    {j.vehicle_year&&<span className="badge" style={{background:"var(--surface2)",color:"var(--text3)",fontSize:11}}>{j.vehicle_year}</span>}
                  </div>
                  {j.return_reason&&<div style={{fontSize:11,color:"var(--yellow)",marginBottom:5}}>🔄 {j.return_reason.slice(0,50)}</div>}
                  {j.complaint&&<div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:6,lineHeight:1.5,background:"#ef4444",borderRadius:7,padding:"6px 10px"}}>⚠️ {j.complaint}</div>}
                  {!wsId&&j.workshop_id&&(
                    <div style={{fontSize:11,color:"var(--text3)",marginBottom:5,display:"flex",alignItems:"center",gap:4}}>
                      <span style={{background:"rgba(251,146,60,.12)",color:"#f97316",borderRadius:6,padding:"2px 7px",fontWeight:600,fontSize:11}}>🏪 {wsProfileMap[j.workshop_id]||j.workshop_id}</span>
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:7,marginTop:"auto"}}>
                    <div style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <code style={{fontFamily:"DM Mono,monospace"}}>{j.id}</code>
                      {j.mechanic&&<span style={{marginLeft:6}}>👷 {j.mechanic}</span>}
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0,marginLeft:6}}>
                      {jq&&!inv&&<span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",fontSize:10}}>📝 Quoted</span>}
                      {inv&&<span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:10}}>🧾 Invoiced</span>}
                      {total>0&&wsRole!=="mechanic"&&<span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:14}}>{fmt(total)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length>JOB_PAGE_SIZE&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:16,flexWrap:"wrap"}}>
            <button className="btn btn-ghost btn-sm" disabled={jobPage===0} onClick={()=>setJobPage(p=>p-1)}>← Prev</button>
            <span style={{fontSize:12,color:"var(--text3)"}}>
              {jobPage*JOB_PAGE_SIZE+1}–{Math.min((jobPage+1)*JOB_PAGE_SIZE,filtered.length)} of {filtered.length}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={(jobPage+1)*JOB_PAGE_SIZE>=filtered.length} onClick={()=>setJobPage(p=>p+1)}>Next →</button>
          </div>
        )}
        </>)}

        {/* ══════════════ KANBAN BOARD VIEW ══════════════ */}
        {kanbanView&&(()=>{
          const jInv = id => invoices.find(i=>i.job_id===id);
          const bkCol   = wsBookings.filter(b=>b.status==="pending"||b.status==="confirmed");
          const pendCol = jobs.filter(j=>!j.is_problem&&j.status==="Pending");
          const wipCol  = jobs.filter(j=>!j.is_problem&&j.status==="In Progress");
          const doneCol = jobs.filter(j=>!j.is_problem&&j.status==="Done"&&!jInv(j.id));
          const invCol  = jobs.filter(j=>!j.is_problem&&jInv(j.id)&&jInv(j.id)?.status!=="paid");
          const paidCol = jobs.filter(j=>!j.is_problem&&jInv(j.id)?.status==="paid");
          const probCol = jobs.filter(j=>j.is_problem);

          const COLS = [
            {id:"booking",  label:"🗓️ Booking",          color:"#60a5fa", items:bkCol,   type:"booking"},
            {id:"pending",  label:"⏳ Pending",            color:"#a78bfa", items:pendCol, type:"job", nextStatus:"In Progress", nextLabel:"▶ Start"},
            {id:"wip",      label:"⚙️ In Progress",        color:"#fbbf24", items:wipCol,  type:"job", nextStatus:"Done",        nextLabel:"✅ Done"},
            {id:"done",     label:"✅ Done",               color:"#34d399", items:doneCol, type:"job"},
            {id:"invoiced", label:"🧾 Invoiced",            color:"#f97316", items:invCol,  type:"job"},
            {id:"paid",     label:"💚 Payment Received",    color:"#10b981", items:paidCol, type:"job"},
            {id:"problem",  label:"⚠️ Problem Job",         color:"#f87171", items:probCol, type:"job"},
          ];

          const BkCard = ({b}) => (
            <div className="card" style={{marginBottom:8,padding:10,fontSize:13}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:4,marginBottom:5}}>
                <code style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13,color:"var(--accent)"}}>{b.vehicle_reg||"—"}</code>
                {b.preferred_date&&<span style={{fontSize:10,color:"#60a5fa",flexShrink:0}}>📅 {b.preferred_date}</span>}
              </div>
              <div style={{fontWeight:600,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.customer_name}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>{b.customer_phone}</div>
              {b.complaint&&<div style={{fontSize:11,color:"var(--text2)",background:"var(--surface)",borderRadius:6,padding:"3px 7px",marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔧 {b.complaint}</div>}
              {[b.photo_1,b.photo_2,b.photo_3].filter(Boolean).length>0&&(
                <div style={{display:"flex",gap:4,marginBottom:7}}>
                  {[b.photo_1,b.photo_2,b.photo_3].filter(Boolean).map((url,i)=>(
                    <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>
                      <img src={url} alt="" style={{width:40,height:40,objectFit:"cover",borderRadius:5,border:"1px solid var(--border)"}} onError={e=>{e.target.style.display="none";}}/>
                    </a>
                  ))}
                </div>
              )}
              <button className="btn btn-primary btn-sm" style={{width:"100%",fontSize:11,padding:"5px 0"}}
                onClick={()=>confirmBooking(b)}>➕ Create Job</button>
            </div>
          );

          const JobCard = ({job, col}) => {
            const inv = jInv(job.id);
            const fp  = wsVehicles.find(v=>v.id===job.workshop_vehicle_id)?.photo_front||"";
            const canFlag   = col.id!=="paid"&&col.id!=="problem";
            const canUnflag = col.id==="problem";
            const canInvoice= col.id==="done";
            return (
              <div className="card" style={{marginBottom:5,padding:0,overflow:"hidden"}}
                onClick={()=>{setJobDetailTab(col.id==="invoiced"||col.id==="paid"?"invoice":"car");setActiveJob(job);setView("job");}}>
                <div style={{position:"relative",background:"var(--surface2)",minHeight:80}}>
                  {fp
                    ? <img src={toImgUrl(fp)} alt="car" style={{width:"100%",maxHeight:80,objectFit:"contain",display:"block"}}
                        onError={e=>{e.target.style.display="none";}}/>
                    : <div style={{height:80,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
                        <svg width="38" height="22" viewBox="0 0 38 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{opacity:.25}}>
                          <rect x="1" y="9" width="36" height="11" rx="3" fill="currentColor"/>
                          <path d="M7 9L11 2h16l4 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          <circle cx="9" cy="19" r="3" fill="var(--surface2)" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="29" cy="19" r="3" fill="var(--surface2)" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        <span style={{fontSize:9,color:"var(--text3)",fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",opacity:.6}}>No Photo</span>
                      </div>
                  }
                  {job.vehicle_reg&&(
                    <div style={{position:"absolute",bottom:4,left:4,background:"rgba(0,0,0,.65)",backdropFilter:"blur(2px)",borderRadius:4,padding:"2px 7px"}}>
                      <code style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:11,color:"#fff"}}>{job.vehicle_reg}</code>
                    </div>
                  )}
                  {job.customer_name&&(
                    <div style={{position:"absolute",bottom:4,right:4,background:"rgba(0,0,0,.65)",backdropFilter:"blur(2px)",borderRadius:4,padding:"2px 8px",maxWidth:"58%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{fontFamily:"DM Sans,sans-serif",fontWeight:700,fontSize:11,color:"#fff"}}>{job.customer_name}</span>
                    </div>
                  )}
                  <div style={{position:"absolute",top:4,right:4,display:"flex",gap:3}}>
                    {canFlag&&(
                      <button title="Flag as Problem" style={{padding:"1px 4px",border:"1px solid rgba(248,113,113,.3)",background:"rgba(0,0,0,.5)",color:"#f87171",borderRadius:4,cursor:"pointer",fontSize:10,lineHeight:1}}
                        onClick={e=>{e.stopPropagation();flagProblem(job);}}>⚠️</button>
                    )}
                    {canUnflag&&(
                      <button title="Return to previous stage" style={{padding:"1px 4px",border:"1px solid rgba(52,211,153,.3)",background:"rgba(0,0,0,.5)",color:"#34d399",borderRadius:4,cursor:"pointer",fontSize:10,lineHeight:1}}
                        onClick={e=>{e.stopPropagation();unflagProblem(job);}}>↩</button>
                    )}
                  </div>
                </div>
                <div style={{padding:"7px 8px"}}>
                  {(job.vehicle_make||job.vehicle_model||job.vehicle_year)&&(
                    <div style={{textAlign:"center",marginBottom:5}}>
                      <span style={{display:"inline-block",fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.22)",borderRadius:99,padding:"2px 10px",letterSpacing:".03em",textTransform:"uppercase",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {[job.vehicle_year,job.vehicle_make,job.vehicle_model].filter(Boolean).join(" ")}
                      </span>
                    </div>
                  )}
                  {job.complaint&&<div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:3,background:"#ef4444",borderRadius:5,padding:"3px 7px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>⚠️ {job.complaint}</div>}
                  {job.notes&&<div style={{fontSize:10,color:"#b45309",fontWeight:700,fontStyle:"italic",marginBottom:3,padding:"2px 6px",background:"rgba(251,191,36,.18)",border:"1px solid rgba(251,191,36,.35)",borderRadius:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {job.notes}</div>}
                  {inv&&wsRole!=="mechanic"&&<div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
                    <span style={{color:"var(--text3)"}}>Invoice</span>
                    <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:inv.status==="paid"?"#10b981":inv.status==="partial"?"#fbbf24":"#f87171"}}>{fmt(inv.total)}</span>
                  </div>}
                  {(col.nextStatus||canInvoice||col.id==="wip"||col.id==="invoiced")&&(
                    <div style={{marginTop:3}} onClick={e=>e.stopPropagation()}>
                      {col.id==="wip"&&(
                        <button className="btn btn-xs btn-ghost" style={{width:"100%",fontSize:10,padding:"4px 0"}}
                          onClick={()=>{ setJobDetailTab("quote"); setActiveJob(job); setView("job"); }}>📝 Quote</button>
                      )}
                      {col.nextStatus&&(()=>{
                        const hasQuote = col.id==="wip" ? !!jobQuote(job.id) : true;
                        return (<>
                          <button className="btn btn-xs" style={{width:"100%",fontSize:10,padding:"4px 0",marginTop:col.id==="wip"?3:0,opacity:hasQuote?1:0.45,cursor:hasQuote?"pointer":"not-allowed"}}
                            disabled={!hasQuote}
                            onClick={()=>hasQuote&&moveJobStatus(job,col.nextStatus)}>{col.nextLabel}</button>
                          {!hasQuote&&<div style={{fontSize:9,color:"var(--yellow)",textAlign:"center",marginTop:2}}>⚠ Quote required</div>}
                        </>);
                      })()}
                      {canInvoice&&(
                        <button className="btn btn-xs btn-primary" style={{width:"100%",fontSize:10,padding:"4px 0"}}
                          onClick={()=>{ setKanbanInvJob(job); setTimeout(()=>kanbanInvPanelRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),80); }}>🧾 Invoice</button>
                      )}
                      {col.id==="invoiced"&&wsRole!=="mechanic"&&(
                        <button className="btn btn-xs btn-success" style={{width:"100%",fontSize:10,padding:"4px 0"}}
                          onClick={()=>setKanbanPayJob(job)}>💳 Payment</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:20,alignItems:"flex-start",marginLeft:-4,marginRight:-4,paddingLeft:4,paddingRight:4}}>
              {COLS.map(col=>(
                <div key={col.id} style={{minWidth:220,maxWidth:220,flexShrink:0,display:"flex",flexDirection:"column"}}>
                  <div style={{borderRadius:"10px 10px 0 0",padding:"9px 12px",background:"var(--surface2)",borderTop:`3px solid ${col.color}`,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:0}}>
                    <span style={{fontWeight:700,fontSize:12}}>{col.label}</span>
                    <span style={{background:`${col.color}28`,color:col.color,borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700}}>{col.items.length}</span>
                  </div>
                  <div style={{background:"var(--surface2)",opacity:1,borderRadius:"0 0 10px 10px",padding:6,minHeight:120,maxHeight:"calc(100vh - 240px)",overflowY:"auto"}}>
                    {col.items.length===0&&<div style={{textAlign:"center",padding:"18px 4px",color:"var(--text3)",fontSize:11,fontStyle:"italic"}}>Empty</div>}
                    {col.type==="booking"&&col.items.map(b=><BkCard key={b.id} b={b}/>)}
                    {col.type==="job"&&col.items.map(j=><JobCard key={j.id} job={j} col={col}/>)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Kanban: invoice preview panel (scrolls into view) ── */}
        {kanbanView&&kanbanInvJob&&(()=>{
          const kItems = jobItems.filter(i=>i.job_id===kanbanInvJob.id);
          const sub    = kItems.reduce((s,i)=>s+(+i.total||0),0);
          const tax    = settings.vat_number ? sub*(settings.tax_rate||0)/100 : 0;
          const total  = sub+tax;
          return (
            <div ref={kanbanInvPanelRef} style={{marginTop:24,border:"2px solid var(--accent)",borderRadius:14,background:"var(--surface)",overflow:"hidden"}}>
              {/* Header */}
              <div style={{background:"var(--accent)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>🧾 Create Invoice</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.8)",marginTop:2}}>
                    {kanbanInvJob.vehicle_reg} · {kanbanInvJob.customer_name}
                  </div>
                </div>
                <button style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:8,padding:"6px 12px",color:"#fff",cursor:"pointer",fontSize:13}}
                  onClick={()=>setKanbanInvJob(null)}>✕ Close</button>
              </div>
              <div style={{padding:18}}>
                {/* Items table */}
                {kItems.length>0?(
                  <div className="card" style={{overflow:"auto",marginBottom:16}}>
                    <table className="tbl" style={{width:"100%",minWidth:500}}>
                      <thead><tr>
                        <th>Description</th><th>Type</th>
                        <th style={{textAlign:"right"}}>Qty</th>
                        <th style={{textAlign:"right"}}>Unit Price</th>
                        <th style={{textAlign:"right"}}>Total</th>
                      </tr></thead>
                      <tbody>
                        {kItems.map(it=>(
                          <tr key={it.id}>
                            <td style={{fontSize:13}}>{it.description||it.part_name||"—"}</td>
                            <td><span className="badge" style={{fontSize:10,textTransform:"capitalize"}}>{it.item_type||"part"}</span></td>
                            <td style={{textAlign:"right",fontSize:13}}>{it.qty}</td>
                            <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>{fmt(it.unit_price||0)}</td>
                            <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(it.total||0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ):(
                  <div className="card" style={{padding:16,color:"var(--text3)",fontSize:13,marginBottom:16}}>
                    No items on this job yet — you can still create the invoice and add items manually.
                  </div>
                )}
                {/* Totals */}
                <div style={{display:"flex",justifyContent:"flex-end",gap:20,marginBottom:20}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"var(--text3)"}}>Subtotal</div>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16}}>{fmt(sub)}</div>
                  </div>
                  {tax>0&&<div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"var(--text3)"}}>Tax ({settings.tax_rate}%)</div>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:16}}>{fmt(tax)}</div>
                  </div>}
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"var(--text3)"}}>Total</div>
                    <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:22,color:"var(--accent)"}}>{fmt(total)}</div>
                  </div>
                </div>
                {/* Create Invoice button */}
                <button className="btn btn-primary" style={{fontSize:15,padding:"11px 32px"}}
                  onClick={()=>setKanbanInvOpen(true)}>
                  ✅ Create Invoice
                </button>
              </div>
            </div>
          );
        })()}
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

      {/* ══════════════ BOOKINGS TAB ══════════════ */}
      {wsTab==="wsbookings"&&(()=>{
        const bToken=bookingToken||wsProfile?.booking_token||"";
        const bookingUrl=bToken?`${window.location.origin}${window.location.pathname}?wsbooking=${bToken}`:"";
        const genToken=async()=>{
          const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          const tok=Array.from({length:8},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
          const res=await api.patch("workshop_profiles","id",wsId,{booking_token:tok}).catch(e=>({error:e.message}));
          if(res&&Array.isArray(res)&&res[0]?.booking_token){
            setBookingToken(res[0].booking_token);
          } else {
            alert("❌ Save failed — run this SQL in Supabase first:\n\nALTER TABLE workshop_profiles ADD COLUMN IF NOT EXISTS booking_token text;\n\nThen try again.");
          }
        };
        const statusColor=(s)=>s==="pending"?"rgba(251,191,36,.15)":s==="confirmed"?"rgba(52,211,153,.15)":"rgba(100,116,139,.15)";
        const statusTextColor=(s)=>s==="pending"?"var(--yellow)":s==="confirmed"?"var(--green)":"var(--text3)";
        const statusLabel=(s)=>s==="pending"?"⏳ Pending":s==="confirmed"?"✅ Confirmed":s==="cancelled"?"❌ Cancelled":s;

        const activeBookings = wsBookings.filter(b=>b.status!=="deleted");

        return(<>
          {/* Toolbar: title + refresh */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8}}>
            <div style={{fontWeight:700,fontSize:15}}>🗓️ Bookings ({activeBookings.length})</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {bookingsLastAt&&<span style={{fontSize:11,color:"var(--text3)"}}>Updated {bookingsLastAt.toLocaleTimeString()}</span>}
              <button className="btn btn-ghost btn-sm" disabled={bookingsRefreshing}
                onClick={async()=>{ if(!onRefreshBookings)return; setBookingsRefreshing(true); await onRefreshBookings(); setBookingsRefreshing(false); setBookingsLastAt(new Date()); }}>
                {bookingsRefreshing?"⏳":"🔄"} Refresh
              </button>
              <button className="btn btn-primary btn-sm" onClick={()=>setWsTab("jobs")}>🔧 Jobs →</button>
            </div>
          </div>

          {/* Booking link card */}
          <div className="card" style={{marginBottom:14,padding:"12px 16px"}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>🔗 Customer Booking Link</div>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>
              Share this link with customers so they can book online — they must scan their licence disc (no manual plate entry).
            </div>
            {bToken ? (
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <code style={{fontSize:11,background:"var(--surface2)",padding:"6px 10px",borderRadius:6,flex:1,wordBreak:"break-all",color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{bookingUrl}</code>
                <button className="btn btn-ghost btn-sm" onClick={()=>navigator.clipboard?.writeText(bookingUrl).then(()=>alert("Link copied!"))}>📋 Copy</button>
                {navigator.share&&(
                  <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}}
                    onClick={()=>navigator.share({title:"Book your car service",text:"Book your vehicle service online — scan your licence disc to get started.",url:bookingUrl}).catch(()=>{})}>
                    📤 Share
                  </button>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={genToken}>🔑 Generate Booking Link</button>
            )}
          </div>

          {/* ── Availability Settings ── */}
          <div className="card" style={{marginBottom:14,padding:"12px 16px"}}>
            <button style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:"var(--text)",padding:0}}
              onClick={()=>setBkAvailOpen(v=>!v)}>
              <span>⚙️ Availability Settings</span>
              <span style={{color:"var(--text3)"}}>{bkAvailOpen?"▲":"▼"}</span>
            </button>
            {bkAvailOpen&&(
              <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:16}}>
                {/* Working Days */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:8}}>Working Days</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[["Mon",1],["Tue",2],["Wed",3],["Thu",4],["Fri",5],["Sat",6],["Sun",7]].map(([label,num])=>(
                      <button key={num} className={`btn btn-sm ${bkWorkDays.includes(num)?"btn-primary":"btn-ghost"}`}
                        onClick={()=>setBkWorkDays(d=>d.includes(num)?d.filter(x=>x!==num):[...d,num].sort((a,b)=>a-b))}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Public Holidays */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:8}}>Public Holidays</div>
                  {bkHolidays.length===0&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>No holidays added</div>}
                  {bkHolidays.map((h,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)",fontSize:13}}>
                      <span style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--blue)",width:95,flexShrink:0}}>{h.date}</span>
                      <span style={{flex:1,color:"var(--text2)"}}>{h.name||"—"}</span>
                      <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}}
                        onClick={()=>setBkHolidays(p=>p.filter((_,j)=>j!==i))}>×</button>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                    <input className="inp" type="date" style={{flex:"0 0 140px",fontSize:12,padding:"5px 8px"}} value={bkNewHolDate} onChange={e=>setBkNewHolDate(e.target.value)}/>
                    <input className="inp" type="text" style={{flex:1,minWidth:100,fontSize:12,padding:"5px 8px"}} placeholder="Holiday name" value={bkNewHolName} onChange={e=>setBkNewHolName(e.target.value)}/>
                    <button className="btn btn-ghost btn-sm" style={{flexShrink:0}}
                      onClick={()=>{
                        if(!bkNewHolDate.trim()) return;
                        setBkHolidays(p=>[...p,{date:bkNewHolDate,name:bkNewHolName.trim()||"Public Holiday"}].sort((a,b)=>a.date.localeCompare(b.date)));
                        setBkNewHolDate(""); setBkNewHolName("");
                      }}>+ Add</button>
                  </div>
                </div>

                {/* Emergency Closures */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4}}>Emergency Closures</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Block specific dates — customers see a notice, and you can WhatsApp affected bookings in one tap.</div>
                  {bkClosedDates.length===0&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>No closures added</div>}
                  {bkClosedDates.map((c,i)=>{
                    const affected=wsBookings.filter(b=>b.preferred_date===c.date&&b.status!=="cancelled"&&b.status!=="deleted"&&b.status!=="job_created");
                    return(
                      <div key={i} style={{padding:"8px 10px",background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)",borderRadius:8,marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                          <span style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--red)",width:95,flexShrink:0}}>{c.date}</span>
                          <span style={{flex:1,color:"var(--text2)"}}>{c.reason||"—"}</span>
                          <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}}
                            onClick={()=>setBkClosedDates(p=>p.filter((_,j)=>j!==i))}>×</button>
                        </div>
                        {affected.length>0&&(
                          <div style={{marginTop:8,fontSize:12,color:"var(--yellow)"}}>
                            ⚠️ {affected.length} booking{affected.length!==1?"s":""} on this date — notify them:
                            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                              {affected.map(b=>(
                                <a key={b.id} href={bkWaLink(b,"closure",c.reason,c.date)} target="_blank" rel="noreferrer"
                                  style={{fontSize:11,background:"rgba(37,211,102,.15)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)",borderRadius:6,padding:"3px 8px",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}}>
                                  📱 {b.customer_name}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                    <input className="inp" type="date" style={{flex:"0 0 140px",fontSize:12,padding:"5px 8px"}} value={bkNewClDate} onChange={e=>setBkNewClDate(e.target.value)}/>
                    <input className="inp" type="text" style={{flex:1,minWidth:100,fontSize:12,padding:"5px 8px"}} placeholder="Reason (e.g. power outage)" value={bkNewClReason} onChange={e=>setBkNewClReason(e.target.value)}/>
                    <button className="btn btn-ghost btn-sm" style={{flexShrink:0}}
                      onClick={()=>{
                        if(!bkNewClDate.trim()) return;
                        setBkClosedDates(p=>[...p,{date:bkNewClDate,reason:bkNewClReason.trim()||"Closed"}].sort((a,b)=>a.date.localeCompare(b.date)));
                        setBkNewClDate(""); setBkNewClReason("");
                      }}>+ Add</button>
                  </div>
                </div>

                <button className="btn btn-primary btn-sm" style={{alignSelf:"flex-end"}} onClick={saveAvailability} disabled={bkAvailSaving}>
                  {bkAvailSaving?"⏳ Saving…":"💾 Save Availability"}
                </button>
              </div>
            )}
          </div>

          {activeBookings.length===0&&(
            <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>
              <div style={{marginBottom:12}}>No bookings yet — share the link above with customers</div>
              <button className="btn btn-primary" onClick={()=>setWsTab("jobs")}>🔧 Go to Jobs →</button>
            </div>
          )}
          {activeBookings.map(b=>(
              <div key={b.id} className="card" style={{marginBottom:12,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{b.customer_name}</div>
                    <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{b.customer_phone}{b.customer_email?` · ${b.customer_email}`:""}</div>
                  </div>
                  <span className="badge" style={{background:statusColor(b.status),color:statusTextColor(b.status),fontSize:11,flexShrink:0,fontWeight:600}}>
                    {statusLabel(b.status)}
                  </span>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8,fontSize:12}}>
                  <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--accent)"}}>{b.vehicle_reg}</span>
                  {(b.vehicle_make||b.vehicle_model)&&<span style={{color:"var(--text2)"}}>{[b.vehicle_make,b.vehicle_model].filter(Boolean).join(" ")}</span>}
                  {b.preferred_date&&<span style={{color:"var(--blue)"}}>📅 {b.preferred_date}</span>}
                  <span style={{color:"var(--text3)",marginLeft:"auto"}}>{b.created_at?.slice(0,10)}</span>
                </div>
                {b.complaint&&<div style={{fontSize:13,color:"var(--text2)",padding:"8px 10px",background:"var(--surface2)",borderRadius:8,marginBottom:8}}>🔧 {b.complaint}</div>}
                {[b.photo_1,b.photo_2,b.photo_3].filter(Boolean).length>0&&(
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    {[b.photo_1,b.photo_2,b.photo_3].filter(Boolean).map((url,i)=>(
                      <a key={i} href={url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>
                        <img src={url} alt={`photo ${i+1}`} style={{width:60,height:60,objectFit:"cover",borderRadius:6,border:"1px solid var(--border)",cursor:"zoom-in"}}
                          onError={e=>{e.target.style.display="none";}}/>
                      </a>
                    ))}
                  </div>
                )}
                {b.status==="pending"&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button className="btn btn-success btn-sm" onClick={()=>confirmBooking(b)}>
                      ✅ Confirm{!b.workshop_vehicle_id?" & Add to System":""}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}}
                      onClick={()=>{ setBkCancelModal({booking:b}); setBkCancelReason(""); }}>❌ Cancel</button>
                    {b.customer_phone&&(
                      <a href={bkWaLink(b,"received")} target="_blank" rel="noreferrer"
                        className="btn btn-ghost btn-sm" style={{color:"#25D366",textDecoration:"none"}}>📱 WhatsApp</a>
                    )}
                  </div>
                )}
                {b.status==="confirmed"&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button className="btn btn-ghost btn-sm" style={{color:"var(--text3)"}}
                      onClick={()=>onPatchWsBooking&&onPatchWsBooking(b.id,{status:"pending"})}>↩ Unconfirm</button>
                    {b.customer_phone&&(
                      <a href={bkWaLink(b,"confirm")} target="_blank" rel="noreferrer"
                        className="btn btn-ghost btn-sm" style={{color:"#25D366",textDecoration:"none"}}>📱 Confirm via WhatsApp</a>
                    )}
                  </div>
                )}
                <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",marginLeft:"auto",display:"block",marginTop:6}}
                  onClick={()=>{ setBkDeleteModal({booking:b}); setBkDeleteReason(""); setBkDeleteBy(""); }}>🗑️ Delete</button>
              </div>
            ))}

          {/* ── Deleted bookings section ── */}
          {(()=>{
            const now=new Date();
            const cutoff=bkDeletedPeriod==="today"?new Date(now.getFullYear(),now.getMonth(),now.getDate())
              :bkDeletedPeriod==="week"?new Date(now-7*864e5)
              :bkDeletedPeriod==="month"?new Date(now-30*864e5)
              :null;
            const deleted=wsBookings.filter(b=>b.status==="deleted"&&(!cutoff||new Date(b.deleted_at||b.created_at)>=cutoff));
            return(<>
              <div style={{marginTop:18,display:"flex",alignItems:"center",gap:10}}>
                <button className={`btn btn-ghost btn-sm ${bkShowDeleted?"":"opacity-60"}`}
                  style={{color:"var(--text3)"}}
                  onClick={()=>setBkShowDeleted(v=>!v)}>
                  {bkShowDeleted?"▲":"▼"} {bkShowDeleted?"Hide":"Show"} Deleted ({deleted.length})
                </button>
                {bkShowDeleted&&(
                  <div style={{display:"flex",gap:4}}>
                    {[["today","Today"],["week","7 Days"],["month","30 Days"],["all","All"]].map(([k,l])=>(
                      <button key={k} className={`btn btn-xs ${bkDeletedPeriod===k?"btn-primary":"btn-ghost"}`}
                        onClick={()=>setBkDeletedPeriod(k)}>{l}</button>
                    ))}
                  </div>
                )}
              </div>
              {bkShowDeleted&&deleted.length===0&&(
                <div style={{textAlign:"center",padding:"20px 0",color:"var(--text3)",fontSize:13}}>No deleted bookings in this period</div>
              )}
              {bkShowDeleted&&deleted.map(b=>(
                <div key={b.id} className="card" style={{marginTop:8,padding:12,opacity:0.65,borderColor:"rgba(248,113,113,.2)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                    <div>
                      <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--accent)",fontSize:13}}>{b.vehicle_reg}</span>
                      <span style={{fontSize:12,color:"var(--text2)",marginLeft:8}}>{b.customer_name}</span>
                      <span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{b.customer_phone}</span>
                    </div>
                    <span className="badge" style={{background:"rgba(248,113,113,.12)",color:"var(--red)",fontSize:10}}>🗑️ Deleted</span>
                  </div>
                  {b.complaint&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>🔧 {b.complaint}</div>}
                  <div style={{fontSize:11,color:"var(--text3)",borderTop:"1px solid var(--border)",paddingTop:6,display:"flex",flexWrap:"wrap",gap:10}}>
                    <span>🗑️ By: <strong style={{color:"var(--text2)"}}>{b.deleted_by||"—"}</strong></span>
                    <span>📅 {b.deleted_at?new Date(b.deleted_at).toLocaleString():"—"}</span>
                    {b.preferred_date&&<span>🗓️ Was booked for: {b.preferred_date}</span>}
                    <span>📋 Reason: <em style={{color:"var(--text2)"}}>{b.deleted_reason||"—"}</em></span>
                  </div>
                </div>
              ))}
            </>);
          })()}
        </>);
      })()}

      {/* ══════════════ INVOICES TAB ══════════════ */}
      {wsTab==="invoices"&&(<>
        <div style={{marginBottom:12,display:"flex",gap:16,flexWrap:"wrap"}}>
          {[[t.wsiTotalInvoiced,totalInvoiced,"var(--accent)"],[t.wsiTotalPaid,totalPaid,"var(--green)"],[t.outstanding,totalOutstanding,"var(--red)"]].map(([l,v,c])=>(
            <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:c}}>{fmt(v)}</div>
            </div>
          ))}
        </div>
        {invoices.length===0
          ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.wsiNoInvoices}</div>
          : <div className="card" style={{overflow:"auto"}}>
              <table className="tbl" style={{width:"100%",minWidth:750}}>
                <thead><tr><th>{t.invoiceNo}</th><th>{t.customer}</th><th>{t.wsiVehicle}</th><th>{t.date}</th><th style={{textAlign:"right"}}>{t.total}</th><th style={{textAlign:"right"}}>{t.paid}</th><th style={{textAlign:"right"}}>{t.wsiBalance}</th><th>{t.status}</th><th></th></tr></thead>
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
                        <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ "+t.paid:inv.status==="partial"?"💛 "+t.partial:"⏳ "+t.unpaid}</span></td>
                        <td>
                          <div style={{display:"flex",gap:4}}>
                            {j&&<button className="btn btn-ghost btn-xs" onClick={()=>{setActiveJob(j);setView("job");}}>{t.stOpen}</button>}
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
            {[[t.wsiPaymentsReceived,paid.length+" "+t.wsiTransactions,"var(--blue)"],[t.wsiTotalCollected,fmt(paid.reduce((s,i)=>s+(+i.paid_amount||0),0)),"var(--green)"]].map(([l,v,c])=>(
              <div key={l} className="card" style={{padding:"10px 16px",minWidth:150}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{l}</div>
                <div style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {paid.length===0
            ? <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.wsiNoPayments}</div>
            : <div className="card" style={{overflow:"auto"}}>
                <table className="tbl" style={{width:"100%",minWidth:700}}>
                  <thead><tr><th>{t.invoice}</th><th>{t.customer}</th><th>{t.wsiVehicle}</th><th>{t.wsiPayDate}</th><th>{t.paymentMethod}</th><th>{t.wsiReference}</th><th style={{textAlign:"right"}}>{t.wsiInvTotal}</th><th style={{textAlign:"right"}}>{t.paid}</th><th>{t.status}</th></tr></thead>
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
                          <td><span className="badge" style={{background:sb,color:sc,fontSize:11}}>{inv.status==="paid"?"✅ "+t.paid:"💛 "+t.partial}</span></td>
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

      {/* ══════════════ WS PURCHASE ORDERS TAB ══════════════ */}
      {wsTab==="wssuporders"&&(
        <WsPurchaseOrdersPage
          purchaseOrders={wsPurchaseOrders} poItems={wsPoItems}
          wsSuppliers={wsSuppliers} wsStock={wsStock} settings={settings}
          wsSupplierQuotes={wsSupplierQuotes} wsSqReplies={wsSqReplies}
          wsSupplierRequests={wsSupplierRequests}
          initialViewPoId={pendingViewPoId}
          onClearInitialView={()=>setPendingViewPoId(null)}
          onSave={onSaveWsPurchaseOrder} onDelete={onDeleteWsPurchaseOrder}
          onReceive={onReceiveWsPurchaseOrder}/>
      )}

      {/* ══════════════ WS SUPPLIERS TAB ══════════════ */}
      {wsTab==="wssuppliers"&&(
        <WsSuppliersPage wsSuppliers={wsSuppliers}
          onSave={onSaveWsSupplier} onDelete={onDeleteWsSupplier}/>
      )}

      {/* ══════════════ WS SUPPLIER INVOICES TAB ══════════════ */}
      {wsTab==="wssupinv"&&(
        <WsSupplierInvoicesPage
          invoices={wsSupplierInvoices}
          invItems={wsSupplierInvItems}
          payments={wsSupplierPayments}
          returns={wsSupplierReturns}
          wsSuppliers={wsSuppliers}
          wsStock={wsStock}
          settings={settings}
          onSaveInvoice={onSaveWsSupplierInvoice}
          onDeleteInvoice={onDeleteWsSupplierInvoice}
          onSavePayment={onSaveWsSupplierPayment}
          onDeletePayment={onDeleteWsSupplierPayment}
          onSaveReturn={onSaveWsSupplierReturn}/>
      )}

      {/* ══════════════ WS TRANSFER TAB ══════════════ */}
      {wsTab==="wstransfer"&&(
        <WsTransferPage parts={parts} wsStock={wsStock} settings={settings}
          onSave={onSaveWsTransfer}/>
      )}

      {/* ══════════════ WS DOCUMENTS TAB ══════════════ */}
      {wsTab==="wsdocs"&&(
        <WsDocumentsPage docs={wsDocs} settings={settings}
          onSave={onSaveWsDoc} onDelete={onDeleteWsDoc}/>
      )}

      {/* ══════════════ LICENCE RENEWALS TAB ══════════════ */}
      {wsTab==="wslicencerenewal"&&(
        <WsLicenceRenewalsPage
          renewals={wsLicenceRenewals} settings={settings} wsId={wsId}
          onSave={onSaveWsLicenceRenewal}
          onUpdate={onUpdateWsLicenceRenewal}/>
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
          onReopenJob={async(d)=>{ await onSaveJob(d); setBookIn(false); setActiveJob(d); setView("job"); }}
          onClose={()=>setBookIn(false)} t={t}/>
      )}
      {editJob&&(
        <WorkshopJobModal job={editJob} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={jobs}
          onSave={async(d,onProgress)=>{ await onSaveJob(d,onProgress); setEditJob(null); }}
          onReopenJob={async(d)=>{ await onSaveJob(d); setEditJob(null); }}
          onClose={()=>setEditJob(null)} t={t}/>
      )}

      {/* ── Kanban: create invoice modal ── */}
      {kanbanInvOpen&&kanbanInvJob&&(()=>{
        const kItems = jobItems.filter(i=>i.job_id===kanbanInvJob.id);
        const sub    = kItems.reduce((s,i)=>s+(+i.total||0),0);
        const tax    = settings.vat_number ? sub*(settings.tax_rate||0)/100 : 0;
        return (
          <WorkshopInvoiceModal
            job={kanbanInvJob} items={kItems}
            subtotal={sub} tax={tax} total={sub+tax}
            settings={settings}
            prefill={{invCust:kanbanInvJob.customer_name||"",invPhone:kanbanInvJob.customer_phone||"",invEmail:"",dueDate:"",notes:""}}
            onSave={async(inv)=>{ await onSaveInvoice(inv); setKanbanInvJob(null); setKanbanInvOpen(false); }}
            onClose={()=>setKanbanInvOpen(false)} t={t}/>
        );
      })()}

      {/* ── Kanban: payment modal ── */}
      {kanbanPayJob&&(()=>{
        const payInv = jobInvoice(kanbanPayJob.id);
        if(!payInv) return null;
        return (
          <WsPaymentModal
            invoice={payInv}
            settings={settings}
            onSave={async(data)=>{ await onUpdateInvoice(payInv.id,data); setKanbanPayJob(null); }}
            onClose={()=>setKanbanPayJob(null)}/>
        );
      })()}

      {/* ── Booking cancel modal ── */}
      {bkCancelModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="card" style={{width:"100%",maxWidth:400,padding:24,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:700,fontSize:16}}>❌ Cancel Booking</div>
            <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",fontSize:13}}>
              <div><strong>{bkCancelModal.booking.vehicle_reg}</strong> — {bkCancelModal.booking.customer_name}</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{bkCancelModal.booking.customer_phone}</div>
              {bkCancelModal.booking.preferred_date&&<div style={{fontSize:12,color:"var(--blue)",marginTop:2}}>📅 {bkCancelModal.booking.preferred_date}</div>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",marginBottom:5}}>REASON (optional — sent to customer via WhatsApp)</div>
              <textarea className="inp" rows={2} placeholder="e.g. No availability on that date" value={bkCancelReason} onChange={e=>setBkCancelReason(e.target.value)} style={{resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
              <button className="btn btn-ghost" style={{flex:"1 1 80px"}} onClick={()=>setBkCancelModal(null)}>Back</button>
              <button className="btn" style={{flex:"1 1 120px",background:"rgba(248,113,113,.15)",color:"var(--red)",border:"1px solid rgba(248,113,113,.3)"}}
                onClick={async()=>{
                  await onPatchWsBooking(bkCancelModal.booking.id,{status:"cancelled"});
                  setBkCancelModal(null);
                }}>
                ❌ Cancel Booking
              </button>
              {bkCancelModal.booking.customer_phone&&(
                <a href={bkWaLink(bkCancelModal.booking,"cancel",bkCancelReason)} target="_blank" rel="noreferrer"
                  className="btn" style={{flex:"1 1 160px",background:"rgba(37,211,102,.15)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                  onClick={async()=>{
                    await onPatchWsBooking(bkCancelModal.booking.id,{status:"cancelled"});
                    setBkCancelModal(null);
                  }}>
                  📱 Cancel + WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Booking delete confirmation modal ── */}
      {bkDeleteModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="card" style={{width:"100%",maxWidth:400,padding:24,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:700,fontSize:16}}>🗑️ Delete Booking</div>
            <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",fontSize:13}}>
              <div><strong>{bkDeleteModal.booking.vehicle_reg}</strong> — {bkDeleteModal.booking.customer_name}</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{bkDeleteModal.booking.customer_phone}</div>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",marginBottom:5}}>YOUR NAME *</div>
              <input className="inp" autoFocus placeholder="Who is deleting this?" value={bkDeleteBy} onChange={e=>setBkDeleteBy(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",marginBottom:5}}>REASON *</div>
              <textarea className="inp" rows={3} placeholder="Why is this booking being deleted?" value={bkDeleteReason} onChange={e=>setBkDeleteReason(e.target.value)} style={{resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setBkDeleteModal(null)} disabled={bkDeleting}>Cancel</button>
              <button className="btn" style={{flex:1,background:"rgba(248,113,113,.15)",color:"var(--red)",border:"1px solid rgba(248,113,113,.3)"}}
                disabled={bkDeleting||!bkDeleteReason.trim()||!bkDeleteBy.trim()}
                onClick={async()=>{
                  setBkDeleting(true);
                  await onDeleteWsBooking(bkDeleteModal.booking.id,{deleted_by:bkDeleteBy.trim(),deleted_reason:bkDeleteReason.trim()});
                  setBkDeleteModal(null); setBkDeleting(false);
                }}>
                {bkDeleting?"⏳ Deleting…":"🗑️ Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE CHECK-IN CHECKLIST ITEMS
// ═══════════════════════════════════════════════════════════════
const CHECKLIST_ITEMS=[
  {key:"body_front",    label:"Front Bumper / Body",   icon:"🚗"},
  {key:"body_rear",     label:"Rear Bumper / Body",    icon:"🚙"},
  {key:"body_left",     label:"Left Side Body",        icon:"◀️"},
  {key:"body_right",   label:"Right Side Body",       icon:"▶️"},
  {key:"windscreen",   label:"Windscreen",            icon:"🔲"},
  {key:"wipers",       label:"Wipers",                icon:"🌧️"},
  {key:"lights_front", label:"Front Lights",          icon:"💡"},
  {key:"lights_rear",  label:"Rear Lights",           icon:"🔴"},
  {key:"tyres",        label:"Tyres Condition",       icon:"⚫"},
  {key:"spare_wheel",  label:"Spare Wheel",           icon:"🛞"},
  {key:"fuel_level",   label:"Fuel Level",            icon:"⛽"},
  {key:"interior",     label:"Interior Condition",    icon:"💺"},
  {key:"dash_lights",  label:"Dashboard Warning Lights",icon:"⚠️"},
  {key:"boot",         label:"Boot / Trunk",          icon:"📦"},
  {key:"radio",        label:"Radio / Electronics",   icon:"📻"},
];

// ═══════════════════════════════════════════════════════════════
// OCR QUOTE MODAL — scan supplier screenshot → extract prices
// ═══════════════════════════════════════════════════════════════
function OcrQuoteModal({parts=[], onApply, onClose}) {
  const [stage,    setStage]    = useState("upload"); // upload | scanning | review
  const [imgSrc,   setImgSrc]   = useState(null);
  const [progress, setProgress] = useState(0);
  const [rawText,  setRawText]  = useState("");
  const [rows,     setRows]     = useState([]); // [{desc, qty, price, partIdx}]
  const [zoomed,   setZoomed]   = useState(false);
  const fileRef    = useRef(); // gallery / files (no capture)
  const cameraRef  = useRef(); // camera only (capture="environment")

  // Parse OCR text into candidate rows
  const parseText = (text) => {
    const SKIP = /^(sub\s*total|vat|total|tax|gst|discount|amount due|balance)\b/i;
    // Recover garbled price tokens: T4328→743.28, L168→ (letters mixed with digits)
    const tryHealPrice = (tok) => {
      if(!/[A-Z]/.test(tok) || !/\d/.test(tok)) return null;
      const h = tok.replace(/O/g,"0").replace(/[Il]/g,"1").replace(/S/g,"5")
                   .replace(/T/g,"7").replace(/B/g,"8").replace(/G/g,"9");
      if(/^\d{4,7}$/.test(h)) return parseFloat(h.slice(0,-2)+"."+h.slice(-2));
      return null;
    };
    // Normalise SA-format number string: "1 450,00" → 1450.00
    const normNum = (s) => {
      // Remove vertical line separators (commonly OCR-read from table borders)
      // Patterns: " | ", " |", "| " → single space
      let n = s.replace(/\s*\|\s*/g, " ");
      
      // Space-thousands with COMMA only (true SA format)
      // In SA, numbers have NO spaces, so space = field separator (qty vs price)
      // ONLY merge "1 450,00" format (comma-decimal), NOT "1 904.50" (already has dot)
      // Pattern: 1 followed by space + exactly 3 digits + COMMA + 2 digits
      n = n.replace(/(?<!\d)(1)\s+(\d{3}),(\d{2})(?!\d)/g,"1$2.$3");
      
      // comma-thousands: 1,450.00
      n = n.replace(/(\d),(\d{3})(?=[.,\s]|$)/g,"$1$2");
      // comma-decimal: 450,00 → 450.00
      n = n.replace(/(\d),(\d{2})(?!\d)/g,"$1.$2");
      return n;
    };
    const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);
    const candidates = [];
    for(const line of lines){
      if(SKIP.test(line)) continue;
      // Strip leading item/part codes (3-6 digit standalone numbers at line start)
      const stripped = line.replace(/^\d{3,6}\s+/,"");
      // Strip trailing single-letter VAT codes (S, Z, E, T at end of line)
      const clean = stripped.replace(/\s+[A-Z]\s*$/,"");
      // Strip bin location codes like "JH.4", "JD.23", "JD.8C", "J.VB.1" (letters.alphanumeric)
      // This prevents them from interfering with qty/price extraction
      const noBinCodes = clean.replace(/\s[A-Z]{1,4}\.\s*[\dA-Z]{0,4}(?=\s|$)/g, " ");
      const norm = normNum(noBinCodes);
      // Primary: decimal prices (no spaces allowed in digit group — prevents qty being merged)
      const nums = [...norm.matchAll(/R?\s*(\d+\.\d{2})/g)].map(m=>+m[1]);
      // Secondary: recover garbled tokens like "T4328" → 743.28
      for(const m of norm.matchAll(/\b([A-Z][A-Z0-9]{3,6}|[A-Z0-9]{1,4}[A-Z][A-Z0-9]{1,4})\b/g)){
        const v = tryHealPrice(m[1]);
        if(v && v > 10 && !nums.some(n=>Math.abs(n-v)<0.01)) nums.push(v);
      }
      if(!nums.length) continue;
      // Extract qty: prefer 2-digit quantities, then 1-digit, then default to 1
      // This helps avoid picking up stray "1" OCR artifacts
      // Look for all qty candidates (1-99)
      const allQtys = [...norm.matchAll(/(?<![A-Za-z.\d])([1-9][0-9]?)(?![A-Za-z.\d])/g)];
      let qty = 1;
      if(allQtys.length > 0) {
        // Prefer 2-digit quantities (10-99) over single-digit ones
        const twoDigit = allQtys.find(m => +m[1] >= 10);
        if(twoDigit) {
          qty = +twoDigit[1];
        } else {
          // If no 2-digit qty found, only use single-digit if it's not obviously a line artifact
          // (Line artifacts are usually solitary "1" followed by whitespace and a price)
          const firstQty = +allQtys[0][1];
          // Take the first qty candidate unless it's a suspicious solitary "1"
          if(!(firstQty === 1 && allQtys.length === 1 && nums.length >= 1)) {
            qty = firstQty;
          }
        }
      }
      // When qty>1 and two prices where larger ≈ smaller × qty, prefer the unit price
      let price = Math.max(...nums);
      if(qty > 1 && nums.length >= 2){
        const sorted = [...nums].sort((a,b)=>a-b);
        const unit = sorted[0], total = sorted[sorted.length-1];
        if(Math.abs(total - unit*qty) / total < 0.05) price = unit;
      }
      if(price < 1) continue;
      // Strip prices, item codes, bin codes, VAT codes from description
      const desc = norm
        .replace(/[A-Z]{1,4}\.\d+/g,"")           // bin codes: JC.27
        .replace(/R?\s*\d+\.\d{2}/g,"")            // decimal prices
        .replace(/\b[A-Z][A-Z0-9]{3,6}\b/g,"")    // garbled tokens
        .replace(/\d+\.?\d*\s*%/g,"")              // percentages
        .replace(/[[\]|!]/g," ").replace(/\s+/g," ").trim();
      if(desc.length < 2) continue;
      const dl = desc.toLowerCase();
      const partIdx = parts.findIndex(p=>
        dl.includes(p.toLowerCase().slice(0,6)) || p.toLowerCase().includes(dl.slice(0,6))
      );
      candidates.push({desc, qty, price, partIdx});
    }
    return candidates;
  };

  const runOcr = async (src) => {
    setStage("scanning");
    setProgress(0);
    try {
      // Preprocess: upscale + grayscale + contrast boost for better OCR
      const processed = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Scale up to at least 1800px wide for table text
          const scale = Math.max(1, 1800 / img.width);
          const w = Math.round(img.width  * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const d = ctx.getImageData(0, 0, w, h);
          for (let i = 0; i < d.data.length; i += 4) {
            // Grayscale (luminance formula)
            const g = Math.round(0.299*d.data[i] + 0.587*d.data[i+1] + 0.114*d.data[i+2]);
            // Contrast stretch: push away from mid-grey
            const c = g < 160 ? Math.max(0, g - 40) : Math.min(255, g + 40);
            d.data[i] = d.data[i+1] = d.data[i+2] = c;
            d.data[i+3] = 255;
          }
          ctx.putImageData(d, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = src;
      });

      const worker = await createWorker("eng", 1, {
        logger: m => { if(m.status==="recognizing text") setProgress(Math.round(m.progress*100)); },
      });
      // PSM 6 = assume a single uniform block of text (works better for tables)
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const { data: { text } } = await worker.recognize(processed);
      await worker.terminate();
      setRawText(text);
      setRows(parseText(text));
      setStage("review");
    } catch(e) {
      alert("OCR failed: "+e.message);
      setStage("upload");
    }
  };

  const onFile = (file) => {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e => { setImgSrc(e.target.result); runOcr(e.target.result); };
    reader.readAsDataURL(file);
  };

  // Global paste listener — works anywhere while modal is open
  useEffect(() => {
    if(stage !== "upload") return;
    const handle = (e) => {
      const items = e.clipboardData?.items;
      if(!items) return;
      for(const item of items){
        if(item.type.startsWith("image/")){
          e.preventDefault();
          onFile(item.getAsFile());
          break;
        }
      }
    };
    document.addEventListener("paste", handle);
    return () => document.removeEventListener("paste", handle);
  }, [stage]);

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for(const item of items){
        const imgType = item.types.find(t=>t.startsWith("image/"));
        if(imgType){
          const blob = await item.getType(imgType);
          onFile(new File([blob],"paste.png",{type:imgType}));
          return;
        }
      }
      alert("No image in clipboard — copy an image first, then tap Paste.");
    } catch(e) {
      alert("Cannot access clipboard. Use 'Choose from Gallery' below instead.");
    }
  };

  const setRow = (i, k, v) => setRows(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));
  const delRow = (i) => setRows(p=>p.filter((_,idx)=>idx!==i));

  const apply = () => {
    // Build price map: partIdx → price (or desc → price for unmatched)
    const mapped = rows.filter(r=>+r.price>0).map(r=>({
      partIdx: r.partIdx,
      desc:    r.desc,
      price:   +r.price,
      qty:     +r.qty||1,
    }));
    onApply(mapped);
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📷 Scan Supplier Quote" onClose={onClose}/>

      {stage==="upload"&&(
        <div style={{padding:"16px 0"}}>
          {/* Hidden inputs — separate so capture doesn't force camera for gallery */}
          <input ref={fileRef}   type="file" accept="image/*" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>

          {/* Primary: Paste button */}
          <button className="btn btn-primary"
            style={{width:"100%",padding:"18px",fontSize:16,fontWeight:700,marginBottom:10,borderRadius:12}}
            onClick={pasteFromClipboard}>
            📋 Paste Image from Clipboard
          </button>
          <div style={{fontSize:11,color:"var(--text3)",textAlign:"center",marginBottom:16}}>
            On phone: copy the WhatsApp image → come back here → tap Paste
            <br/>On PC: Ctrl+C the image → Ctrl+V anywhere on this page
          </div>

          {/* Keyboard paste zone for desktop Ctrl+V */}
          <div
            onPaste={e=>{
              const item=[...e.clipboardData.items].find(i=>i.type.startsWith("image/"));
              if(item){e.preventDefault();onFile(item.getAsFile());}
            }}
            tabIndex={0}
            style={{border:"2px dashed var(--border)",borderRadius:12,padding:"12px",textAlign:"center",color:"var(--text3)",fontSize:12,marginBottom:16,outline:"none",cursor:"text"}}>
            Or click here and press Ctrl+V (desktop)
          </div>

          <div style={{textAlign:"center",color:"var(--text3)",fontSize:12,marginBottom:10}}>— or —</div>

          {/* Two separate buttons: gallery vs camera */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <button className="btn btn-ghost" style={{padding:"12px",fontSize:13}} onClick={()=>fileRef.current.click()}>
              🖼️ Gallery / Files
            </button>
            <button className="btn btn-ghost" style={{padding:"12px",fontSize:13}} onClick={()=>cameraRef.current.click()}>
              📷 Take Photo
            </button>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",textAlign:"center"}}>
            Gallery opens saved photos · Camera opens the phone camera
          </div>
        </div>
      )}

      {stage==="scanning"&&(
        <div style={{textAlign:"center",padding:"40px 16px"}}>
          {imgSrc&&<img src={imgSrc} alt="" style={{maxWidth:"100%",maxHeight:200,borderRadius:8,marginBottom:16,objectFit:"contain"}}/>}
          <div style={{fontWeight:600,marginBottom:8}}>Reading image… {progress}%</div>
          <div style={{background:"var(--surface2)",borderRadius:99,height:8,overflow:"hidden",maxWidth:280,margin:"0 auto"}}>
            <div style={{height:"100%",background:"var(--accent)",borderRadius:99,width:`${progress}%`,transition:"width .3s"}}/>
          </div>
        </div>
      )}

      {stage==="review"&&(
        <>
          {/* Warning banner */}
          <div style={{background:"#fef3c7",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#92400e",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
            <div>
              <strong>Always verify prices against the original document.</strong>
              {" "}OCR can misread digits — especially on watermarked or photo documents.
              Click any price to correct it before applying.
            </div>
          </div>

          {/* Image (full width, tall) — tap to zoom */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>
              Original Image — read prices from here
              <span style={{fontWeight:400,textTransform:"none",marginLeft:8,color:"var(--accent)"}}>tap to enlarge 🔍</span>
            </div>
            {imgSrc&&(
              <img src={imgSrc} alt="" onClick={()=>setZoomed(true)}
                style={{width:"100%",borderRadius:8,objectFit:"contain",maxHeight:340,background:"#000",cursor:"zoom-in"}}/>
            )}
          </div>

          {/* Zoom lightbox */}
          {zoomed&&imgSrc&&(
            <div onClick={()=>setZoomed(false)}
              style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
              <img src={imgSrc} alt="" style={{maxWidth:"95vw",maxHeight:"95vh",objectFit:"contain",borderRadius:8}}/>
              <button onClick={e=>{e.stopPropagation();setZoomed(false);}}
                style={{position:"absolute",top:16,right:20,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",fontSize:28,width:44,height:44,borderRadius:"50%",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
          )}
          <details style={{marginBottom:12}}>
            <summary style={{fontSize:11,color:"var(--text3)",cursor:"pointer",userSelect:"none"}}>Show raw OCR text</summary>
            <textarea readOnly value={rawText} style={{width:"100%",height:160,fontSize:10,fontFamily:"monospace",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,padding:8,resize:"none",color:"var(--text2)",marginTop:6}}/>
          </details>

          <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>
            Extracted Items — check &amp; correct each price
          </div>

          {rows.length===0
            ? <div style={{textAlign:"center",padding:20,color:"var(--text3)",fontSize:13}}>
                No price rows detected. The image may be too blurry or the layout unusual.<br/>
                <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setStage("upload")}>Try another image</button>
              </div>
            : <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14,maxHeight:260,overflowY:"auto"}}>
                {rows.map((r,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 28px",gap:6,alignItems:"center",background:"var(--surface2)",borderRadius:8,padding:"6px 10px"}}>
                    <div>
                      <div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>OCR: {r.desc}</div>
                      <select className="inp" style={{fontSize:12,padding:"2px 6px"}}
                        value={r.partIdx} onChange={e=>setRow(i,"partIdx",+e.target.value)}>
                        <option value={-1}>— unmatched —</option>
                        {parts.map((p,pi)=><option key={pi} value={pi}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>Qty</div>
                      <input className="inp" type="number" min="1" step="1" value={r.qty}
                        onChange={e=>setRow(i,"qty",e.target.value)} style={{padding:"2px 4px",fontSize:12}}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#92400e",marginBottom:2,fontWeight:700}}>Price ✏️</div>
                      <input className="inp" type="number" min="0" step="0.01" value={r.price}
                        onChange={e=>setRow(i,"price",e.target.value)}
                        style={{padding:"2px 4px",fontSize:12,background:"#fef3c7",borderColor:"#f59e0b"}}/>
                    </div>
                    <button onClick={()=>delRow(i)} style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",fontSize:16,padding:0,lineHeight:1}} title="Remove row">×</button>
                  </div>
                ))}
              </div>
          }

          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStage("upload")}>↩ Try Again</button>
            <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
            {rows.length>0&&<button className="btn btn-primary" style={{flex:2}} onClick={apply}>✅ Apply Prices</button>}
          </div>
        </>
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER QUOTE MODAL — enter prices received from a supplier
// ═══════════════════════════════════════════════════════════════
function SupplierQuoteModal({request, existingQuote, settings={}, priceOnly=false, onSave, onClose}) {
  const vatRate = +(settings?.tax_rate||0) / 100;
  const parts = (() => { try { return JSON.parse(request.parts_list||"[]"); } catch { return []; } })();
  // Build name→sku map from items_json (present on generated-link and new manual-send requests)
  const reqSkuMap = (() => {
    const items = (() => { try { return JSON.parse(request.items_json||"[]"); } catch { return []; } })();
    const m = {};
    items.forEach(it => { const k=(it.label||it.description||"").toLowerCase().trim(); if(k) m[k]=it.sku||""; });
    return m;
  })();
  const [prices, setPrices] = useState(() => {
    if (existingQuote?.line_items) {
      try {
        const lines = JSON.parse(existingQuote.line_items);
        // Back-fill sku if saved line is missing it
        return lines.map(l => ({...l, sku: l.sku||reqSkuMap[(l.name||"").toLowerCase().trim()]||""}));
      } catch {}
    }
    return parts.map(p => ({name: p, price: "", available: "", sku: reqSkuMap[p.toLowerCase().trim()]||""}));
  });
  const [vatExcluded, setVatExcluded] = useState(existingQuote?.vat_excluded??(request.supplier_vat_inclusive===false));
  const [notes,     setNotes]     = useState(existingQuote?.notes||"");
  const [quoteRef,  setQuoteRef]  = useState(existingQuote?.quote_ref||"");
  const [saving,    setSaving]    = useState(false);
  const [showOcr,   setShowOcr]   = useState(false);

  const onOcrApply = (mapped) => {
    setPrices(prev => {
      const next = [...prev];
      mapped.forEach(row => {
        if(row.partIdx >= 0 && row.partIdx < next.length) {
          next[row.partIdx] = {...next[row.partIdx], price: String(row.price)};
        }
      });
      return next;
    });
    setShowOcr(false);
  };

  const setLine = (idx, field, val) =>
    setPrices(p => p.map((r,i) => i===idx ? {...r,[field]:val} : r));

  // Raw sum of entered prices
  const rawTotal = prices.reduce((s,r) => s + (+r.price||0), 0);
  // If supplier gave ex-VAT prices, add VAT to get incl-VAT total
  const vatIncTotal = vatExcluded && vatRate > 0 ? rawTotal * (1 + vatRate) : rawTotal;
  const vatAmount   = vatIncTotal - rawTotal;

  // Per-line VAT-inclusive price for display
  const inclPrice = (p) => {
    const v = +p||0;
    return vatExcluded && vatRate > 0 ? v * (1 + vatRate) : v;
  };

  const C = curSym(settings?.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const handleSave = async () => {
    setSaving(true);
    // Save each line with vat_incl_price so the reference panel shows the real cost
    const savedLines = prices.map(r => ({
      ...r,
      vat_incl_price: inclPrice(r.price),
    }));
    try {
      await onSave({
        ...(existingQuote?.id ? {id: existingQuote.id} : {}),
        request_id:    request.id,
        job_id:        request.job_id,
        vehicle_reg:   request.vehicle_reg||"",
        supplier_id:   request.supplier_id||null,
        supplier_name: request.supplier_name||"",
        line_items:    JSON.stringify(savedLines),
        total:         vatIncTotal,
        vat_excluded:  vatExcluded,
        quote_ref:     quoteRef.trim()||null,
        notes:         notes.trim()||null,
      });
      onClose();
    } catch(e) { alert("Save failed: "+e.message); }
    finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={priceOnly?"↩️ Return Quote":"💰 Enter Supplier Quote"} onClose={onClose}/>

      {/* Supplier + vehicle banner */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,color:"#25D366"}}>{request.via_group?"👥":"📲"} {request.supplier_name||request.supplier_phone||"Unknown supplier"}</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>🚗 {request.vehicle_reg||"—"} · Job {request.job_id}</div>
        </div>
      </div>

      {/* VAT toggle */}
      <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"9px 14px",background:"var(--surface2)",borderRadius:10,cursor:"pointer",border:"1px solid var(--border)"}}>
        <input type="checkbox" checked={!vatExcluded} onChange={e=>setVatExcluded(!e.target.checked)}
          style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700}}>Prices include VAT</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>
            {vatExcluded
              ? vatRate>0
                ? `Prices are ex-VAT — VAT (${settings.tax_rate}%) will be added to totals`
                : "Prices are ex-VAT — no VAT rate configured in Workshop Settings"
              : "Prices already include VAT — no VAT will be added"}
          </div>
        </div>
      </label>

      {/* Line items — one row per part */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
        Parts &amp; Prices
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:14}}>
        {/* Header */}
        <div style={{display:"grid",gridTemplateColumns:priceOnly?`1fr 120px`:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"7px 12px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>Part</div>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",textAlign:"right"}}>
            {priceOnly?"Price":vatExcluded?"Ex-VAT":"Price"}
          </div>
          {!priceOnly&&vatExcluded&&vatRate>0&&<div style={{fontSize:10,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",textAlign:"right"}}>Incl. VAT</div>}
          {!priceOnly&&<div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>Available</div>}
        </div>
        {prices.map((row,idx) => (
          <div key={idx} style={{display:"grid",gridTemplateColumns:priceOnly?`1fr 120px`:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"8px 12px",borderBottom:idx<prices.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</div>
            <input className="inp" type="number" min="0" step="0.01"
              value={row.price} onChange={e=>setLine(idx,"price",e.target.value)}
              placeholder="0.00"
              style={{textAlign:"right",padding:"4px 8px",fontSize:13,fontWeight:700}}/>
            {!priceOnly&&vatExcluded&&vatRate>0&&(
              <div style={{textAlign:"right",fontSize:12,fontWeight:700,color:"#f59e0b",fontFamily:"Rajdhani,sans-serif"}}>
                {+row.price>0?inclPrice(row.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"—"}
              </div>
            )}
            {!priceOnly&&<input className="inp"
              value={row.available} onChange={e=>setLine(idx,"available",e.target.value)}
              placeholder="In stock"
              style={{padding:"4px 8px",fontSize:12}}/>}
          </div>
        ))}
        {/* Total row */}
        <div style={{display:"grid",gridTemplateColumns:priceOnly?`1fr 120px`:`1fr 110px${vatExcluded&&vatRate>0?" 100px":""} 100px`,gap:8,padding:"9px 12px",background:"var(--surface2)",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text2)"}}>
            {vatExcluded&&vatRate>0?"Subtotal (ex-VAT)":"Total"}
          </div>
          <div style={{fontSize:14,fontWeight:800,color:vatExcluded&&vatRate>0?"var(--text2)":"var(--accent)",textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>
            {rawTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
          </div>
          {!priceOnly&&vatExcluded&&vatRate>0&&(
            <div style={{fontSize:14,fontWeight:800,color:"#f59e0b",textAlign:"right",fontFamily:"Rajdhani,sans-serif"}}>
              {vatIncTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          )}
          {!priceOnly&&<div/>}
        </div>
        {/* VAT breakdown row */}
        {vatExcluded&&vatRate>0&&rawTotal>0&&(
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,padding:"5px 12px 8px",background:"var(--surface2)"}}>
            <span style={{fontSize:11,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): </span>
            <span style={{fontSize:11,fontWeight:700,color:"#f59e0b",fontFamily:"Rajdhani,sans-serif"}}>
              + {vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:priceOnly?"1fr":"1fr 1fr",gap:8,marginBottom:8}}>
        <FD><FL label="Supplier Quote Ref # (Doc Nr)"/><input className="inp" value={quoteRef} onChange={e=>setQuoteRef(e.target.value)} placeholder="e.g. Q100814"/></FD>
        {!priceOnly&&<FD><FL label="Notes (optional)"/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ETA, conditions…"/></FD>}
      </div>

      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setShowOcr(true)} title="Read prices from a screenshot">
          📷 Scan Image
        </button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
          {saving?"Saving...":priceOnly?"↩️ Save Return Quote":"💾 Save Quote"}
        </button>
      </div>

      {showOcr&&(
        <OcrQuoteModal
          parts={parts}
          onApply={onOcrApply}
          onClose={()=>setShowOcr(false)}
        />
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER SEND MODAL
// ═══════════════════════════════════════════════════════════════
// Generate a short SKU from a part name: "Air Filter" → "ws-af-m01" style
const makePartSku = (name) => {
  const abbr = name.trim().split(/\s+/).map(w=>w[0]||"").join("").toLowerCase().slice(0,4);
  const rand = Math.random().toString(36).slice(2,5);
  return `ws-${abbr}-${rand}`;
};

function SupplierSendModal({job, items, wsSuppliers=[], settings, history=[], quotes=[], sqReplies=[], onLogSend, onDeleteSend, onSaveQuote, onSaveItem, onSaveWsStock, onGenerateLink, onCreatePO, onClose}) {
  const shopName = settings?.shop_name || "Workshop";

  // Job items — all pre-ticked
  const jobItemIds = items.filter(i => i.description?.trim()).map(i => i.id);
  const [selected,    setSelected]    = useState(jobItemIds);
  // Extra parts typed manually  { id, label, sku }
  const [extraParts,  setExtraParts]  = useState([]);
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied,    setLinkCopied]   = useState(false);
  const [generatingLink,setGeneratingLink]=useState(false);
  const [extraInput,  setExtraInput]  = useState("");

  const [supplierId,  setSupplierId]  = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [customNote,  setCustomNote]  = useState("");
  const [copied,      setCopied]      = useState(false);
  const [quoteTarget, setQuoteTarget] = useState(null); // { request, existingQuote }
  const [localReplies,setLocalReplies]= useState(sqReplies);
  const [refreshing,  setRefreshing]  = useState(false);

  useEffect(()=>{
    if(!history.length) return;
    const ids=history.map(r=>r.id).filter(Boolean).join(",");
    if(!ids) return;
    setRefreshing(true);
    api.get("ws_sq_replies",`request_id=in.(${ids})&select=*`)
      .then(res=>{ if(Array.isArray(res)) setLocalReplies(res); })
      .catch(()=>{})
      .finally(()=>setRefreshing(false));
  },[]);

  const toggleItem = id =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const addExtra = async () => {
    const v = extraInput.trim();
    if (!v) return;
    const sku = makePartSku(v);
    const tempId = "extra_" + Date.now();
    setExtraParts(p => [...p, {id: tempId, label: v, sku, saving: true}]);
    setSelected(p => [...p, tempId]);
    setExtraInput("");
    // Insert to job items AND workshop stock in parallel
    try {
      await Promise.all([
        onSaveItem
          ? onSaveItem({job_id: job.id, type: "part", description: v, part_sku: sku, qty: 1, unit_price: 0, total: 0})
          : Promise.resolve(),
        onSaveWsStock
          ? onSaveWsStock({name: v, sku, qty: 0, unit_cost: 0, unit_price: 0, min_qty: 0})
          : Promise.resolve(),
      ]);
      setExtraParts(p => p.map(e => e.id===tempId ? {...e, saving: false, saved: true} : e));
    } catch(e) {
      console.error("Add item failed", e);
      setExtraParts(p => p.map(e => e.id===tempId ? {...e, saving: false, error: true} : e));
    }
  };

  const removeExtra = id => {
    setExtraParts(p => p.filter(x => x.id !== id));
    setSelected(p => p.filter(x => x !== id));
  };

  // Build combined list: job items + extras
  const allItems = [
    ...items.filter(i => i.description?.trim()).map(i => ({id: i.id, label: i.description, qty: +i.qty||1, sku: i.part_sku||"", isExtra: false})),
    ...extraParts.map(e => ({id: e.id, label: e.label, qty: 1, sku: e.sku||"", isExtra: true})),
  ];
  const selectedItems = allItems.filter(i => selected.includes(i.id));

  const chosenSupplier = wsSuppliers.find(s => String(s.id) === String(supplierId));
  const phone = (chosenSupplier?.phone || manualPhone || "").replace(/\D/g, "");

  const SEP = "─".repeat(28);
  const msgLines = [
    `🔧 *Parts Request* — ${shopName}`,
    SEP,
    `🚗 *${job.vehicle_reg||"—"}*  |  ${[job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ")||"—"}${job.vehicle_color ? "  |  "+job.vehicle_color : ""}`,
    job.vehicle_year ? `Year: ${job.vehicle_year}` : null,
    job.vin          ? `VIN: \`${job.vin}\`` : null,
    job.engine_no    ? `Engine #: ${job.engine_no}` : null,
    `Job #: *${job.id}*  |  Date: ${job.date_in||"—"}`,
    SEP,
    `*Parts needed:*`,
    ...selectedItems.map((i, idx) => `${idx + 1}. ${i.label}${i.qty > 1 ? ` x${i.qty}` : ""}`),
    SEP,
    customNote.trim() || "Please quote price & availability 🙏",
  ].filter(l => l !== null).join("\n");

  const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msgLines)}` : null;

  const logSend = (viaGroup=false) => {
    if (!onLogSend) return;
    onLogSend({
      job_id:               job.id,
      vehicle_reg:          job.vehicle_reg||"",
      supplier_id:          chosenSupplier?.id||null,
      supplier_name:        chosenSupplier?.name || (manualPhone ? "Manual: "+manualPhone : ""),
      supplier_phone:       chosenSupplier?.phone||manualPhone||"",
      supplier_vat_inclusive: chosenSupplier?.vat_inclusive||false,
      via_group:            viaGroup,
      parts_list:           JSON.stringify(selectedItems.map(i=>i.label)),
      items_json:           JSON.stringify(selectedItems.map(i=>({label:i.label,description:i.label,sku:i.sku||"",qty:i.qty||1}))),
      message:              msgLines,
    });
  };

  const copyMsg = () => {
    navigator.clipboard.writeText(msgLines).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const jobItemsList = items.filter(i => i.description?.trim());

  return (
    <div style={{maxWidth:520,width:"100%"}}>
      <MHead title="📲 Send to Supplier" onClose={onClose}/>

      {/* Car banner */}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:20}}>🚗</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14}}>{job.vehicle_reg||"—"}&nbsp;<span style={{color:"var(--text3)",fontWeight:400,fontSize:13}}>{[job.vehicle_make,job.vehicle_model].filter(Boolean).join(" ")||""}</span></div>
          <div style={{fontSize:11,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",marginTop:1}}>
            {job.vehicle_color&&<span>{job.vehicle_color}</span>}
            {job.vin&&<span>VIN: <code style={{fontFamily:"DM Mono,monospace"}}>{job.vin}</code></span>}
            {job.engine_no&&<span>Eng: <code style={{fontFamily:"DM Mono,monospace"}}>{job.engine_no}</code></span>}
          </div>
        </div>
        <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",flexShrink:0}}>{job.id}</code>
      </div>

      {/* Parts section */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>
        Select Parts to Include
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:8}}>
        {/* Job items */}
        {jobItemsList.map((item, idx) => (
          <label key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",background:selected.includes(item.id)?"var(--surface2)":"transparent"}}>
            <input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggleItem(item.id)}
              style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description}</div>
              {item.part_sku&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{item.part_sku}</div>}
            </div>
            {+item.qty>1&&<span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>×{item.qty}</span>}
          </label>
        ))}
        {/* Extra parts added manually */}
        {extraParts.map(e => (
          <label key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",background:selected.includes(e.id)?"rgba(99,102,241,.06)":"transparent"}}>
            <input type="checkbox" checked={selected.includes(e.id)} onChange={()=>toggleItem(e.id)}
              style={{width:16,height:16,accentColor:"var(--accent)",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--accent)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.label}</div>
              {e.sku&&<div style={{fontSize:10,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginTop:1}}>
                {e.sku}&nbsp;
                {e.saving&&<span style={{color:"var(--text3)"}}>saving…</span>}
                {e.saved&&<span style={{color:"var(--green)",fontWeight:600}}>✓ added to job</span>}
                {e.error&&<span style={{color:"var(--red)",fontWeight:600}}>✗ save failed</span>}
              </div>}
            </div>
            <button onClick={ev=>{ev.preventDefault();removeExtra(e.id);}}
              style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:14,padding:"0 2px",flexShrink:0}}>✕</button>
          </label>
        ))}
        {/* Add extra part row */}
        <div style={{display:"flex",gap:6,padding:"8px 10px"}}>
          <input className="inp" placeholder="+ Type extra part name & press Enter"
            value={extraInput} onChange={e=>setExtraInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addExtra()}
            style={{flex:1,fontSize:12,padding:"5px 10px"}}/>
          <button className="btn btn-ghost btn-xs" onClick={addExtra} style={{flexShrink:0,fontSize:12,padding:"0 10px"}}>Add</button>
        </div>
      </div>
      {jobItemsList.length===0&&extraParts.length===0&&(
        <div style={{fontSize:12,color:"var(--text3)",marginBottom:8,paddingLeft:4}}>No job items yet — type parts above to include them</div>
      )}

      {/* Supplier selector */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",margin:"14px 0 6px"}}>Supplier</div>
      {wsSuppliers.length > 0
        ? <select className="inp" value={supplierId} onChange={e=>{setSupplierId(e.target.value);setManualPhone("");}} style={{marginBottom:8}}>
            <option value="">— Select supplier —</option>
            {wsSuppliers.map(s=>(
              <option key={s.id} value={s.id}>{s.name}{s.phone?` · ${s.phone}`:""}</option>
            ))}
          </select>
        : <div style={{fontSize:12,color:"var(--text3)",marginBottom:6,padding:"8px 12px",background:"var(--surface2)",borderRadius:8}}>
            No suppliers saved yet — go to <strong>WS → Suppliers</strong> tab to add them, or type a number below
          </div>
      }
      <input className="inp" placeholder="Or enter phone number: +27 83 123 4567"
        value={manualPhone} onChange={e=>{setManualPhone(e.target.value);setSupplierId("");}}
        style={{marginBottom:14}}/>

      {/* Custom note */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>
        Custom note <span style={{fontWeight:400,textTransform:"none",fontSize:10}}>(optional — replaces sign-off)</span>
      </div>
      <textarea className="inp" placeholder="e.g. Urgent — needed by tomorrow morning 🙏"
        value={customNote} onChange={e=>setCustomNote(e.target.value)}
        style={{minHeight:46,marginBottom:14,fontSize:13,resize:"vertical"}}/>

      {/* Preview */}
      <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Message Preview</div>
      <pre style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",fontSize:12,lineHeight:1.65,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:180,overflowY:"auto",marginBottom:14,color:"var(--text1)",fontFamily:"DM Mono,monospace"}}>
        {msgLines}
      </pre>

      {/* Actions */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {/* Direct WhatsApp (personal number) */}
        {waUrl&&(
          <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}} onClick={()=>logSend(false)}>
            <button className="btn btn-primary" style={{width:"100%",background:"#25D366",border:"none",fontSize:15,padding:"13px 0",fontWeight:700,borderRadius:10}}>
              📲 Send via WhatsApp
            </button>
          </a>
        )}
        {/* WhatsApp Group — copy message then open group */}
        {chosenSupplier?.group_link&&(
          <button style={{width:"100%",background:"#128C7E",border:"none",fontSize:14,padding:"12px 0",fontWeight:700,borderRadius:10,color:"#fff",cursor:"pointer"}}
            onClick={()=>{ logSend(true); navigator.clipboard.writeText(msgLines).then(()=>{ window.open(chosenSupplier.group_link,"_blank"); }); }}>
            👥 Copy & Open Group Chat
          </button>
        )}
        {/* Fallback — nothing selected yet */}
        {!waUrl&&!chosenSupplier?.group_link&&(
          <button disabled style={{width:"100%",fontSize:14,padding:"13px 0",opacity:.45,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"not-allowed"}}>
            📲 Select a supplier or enter a phone above
          </button>
        )}
        <button className="btn btn-ghost" style={{width:"100%",fontSize:13,padding:"10px 0",borderRadius:10}} onClick={copyMsg}>
          {copied ? "✓ Copied!" : "📋 Copy Message"}
        </button>
        {/* Generate digital quote link */}
        {onGenerateLink&&selectedItems.length>0&&(
          <button
            disabled={generatingLink}
            style={{width:"100%",fontSize:13,padding:"11px 0",borderRadius:10,border:"1px solid rgba(56,189,248,.4)",background:"rgba(56,189,248,.08)",color:"#38bdf8",cursor:generatingLink?"not-allowed":"pointer",fontWeight:600}}
            onClick={async()=>{
              setGeneratingLink(true);
              const linkItems=selectedItems.map(i=>({description:i.label,qty:i.qty,sku:i.sku}));
              const info={job_id:job.id,vehicle_reg:job.vehicle_reg||"",supplier_id:chosenSupplier?.id||null,supplier_name:chosenSupplier?.name||"",supplier_phone:chosenSupplier?.phone||manualPhone||"",supplier_vat_inclusive:chosenSupplier?.vat_inclusive||false};
              const url=await onGenerateLink(info,linkItems);
              setGeneratedLink(url);
              setGeneratingLink(false);
            }}>
            {generatingLink?"Generating…":"🔗 Generate Supplier Quote Link"}
          </button>
        )}
        {generatedLink&&(
          <div style={{background:"rgba(56,189,248,.08)",border:"1px solid rgba(56,189,248,.3)",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"#38bdf8",fontWeight:700,marginBottom:6}}>🔗 Share this link with supplier:</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input readOnly value={generatedLink} style={{flex:1,fontSize:11,padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface3)",color:"var(--text1)",fontFamily:"monospace"}}
                onFocus={e=>e.target.select()}/>
              <button className="btn btn-ghost btn-sm" style={{flexShrink:0,fontSize:11}} onClick={()=>{navigator.clipboard.writeText(generatedLink).then(()=>{setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);});}}>
                {linkCopied?"✓ Copied":"Copy"}
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-ghost" style={{width:"100%",fontSize:13,borderRadius:10}} onClick={onClose}>Close</button>
      </div>

      {/* Send history for this job */}
      {history.length>0&&(
        <div style={{marginTop:18,borderTop:"1px solid var(--border)",paddingTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em"}}>
              📋 Send History ({history.length})
            </div>
            <button disabled={refreshing} onClick={()=>{
              const ids=history.map(r=>r.id).filter(Boolean).join(",");
              if(!ids) return;
              setRefreshing(true);
              api.get("ws_sq_replies",`request_id=in.(${ids})&select=*`)
                .then(res=>{ if(Array.isArray(res)) setLocalReplies(res); })
                .catch(()=>{})
                .finally(()=>setRefreshing(false));
            }} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface3)",cursor:refreshing?"not-allowed":"pointer",color:"var(--text2)"}}>
              {refreshing?"…":"🔄 Refresh"}
            </button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {history.map((r,i)=>{
              const parts = (() => { try { return JSON.parse(r.parts_list||"[]"); } catch { return []; } })();
              const dt = r.sent_at ? new Date(r.sent_at).toLocaleString(undefined,{dateStyle:"short",timeStyle:"short"}) : "";
              const existingQuote = quotes.find(q=>q.request_id===r.id);
              const qLines = existingQuote ? (() => { try { return JSON.parse(existingQuote.line_items||"[]"); } catch { return []; } })() : [];
              const digitalReply = localReplies.find(rep=>rep.request_id===r.id);
              const replyItems = digitalReply ? (() => { try { return JSON.parse(digitalReply.items||"[]"); } catch { return []; } })() : [];
              const inStockReplies = replyItems.filter(ri=>ri.condition!=="no_stock");
              const noStockReplies = replyItems.filter(ri=>ri.condition==="no_stock");
              return (
                <div key={r.id||i} style={{background:"var(--surface2)",borderRadius:10,padding:"10px 12px",fontSize:12,border:digitalReply?"1px solid rgba(56,189,248,.3)":existingQuote?"1px solid rgba(52,211,153,.3)":"1px solid transparent"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6}}>
                    <span style={{fontWeight:700,color:"#25D366",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.token?"🔗":"📲"} {r.supplier_name||r.supplier_phone||"Unknown"}
                    </span>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                      {r.token&&<span style={{fontSize:10,background:"rgba(56,189,248,.12)",color:"#38bdf8",borderRadius:4,padding:"1px 5px",fontWeight:600}}>Link</span>}
                      {digitalReply&&<span style={{fontSize:10,background:"rgba(52,211,153,.12)",color:"var(--green)",borderRadius:4,padding:"1px 5px",fontWeight:600}}>Replied ✅</span>}
                      <span style={{fontSize:10,color:"var(--text3)"}}>{dt}</span>
                    </div>
                  </div>
                  <div style={{color:"var(--text2)",lineHeight:1.6,marginBottom:6}}>{parts.join(" · ")||"—"}</div>

                  {/* Digital reply summary */}
                  {digitalReply&&replyItems.length>0&&(
                    <div style={{background:"rgba(56,189,248,.06)",border:"1px solid rgba(56,189,248,.2)",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
                      <div style={{fontSize:11,color:"#38bdf8",fontWeight:700,marginBottom:6}}>🔗 Supplier Digital Reply</div>
                      {inStockReplies.map((ri,j)=>(
                        <div key={j} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid rgba(56,189,248,.1)"}}>
                          <div style={{flex:1}}>
                            <span style={{color:"var(--text1)"}}>{ri.description}</span>
                            {ri.supplier_part_no&&<span style={{color:"var(--text3)",fontSize:10,marginLeft:6,fontFamily:"monospace"}}>{ri.supplier_part_no}</span>}
                            {ri.notes&&<span style={{color:"var(--text3)",fontSize:10,marginLeft:6,fontStyle:"italic"}}>{ri.notes}</span>}
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                            <span style={{fontSize:10,color:ri.condition==="in_stock"?"var(--green)":"#fbbf24",fontWeight:600}}>{ri.condition==="in_stock"?"✅ Stock":"📦 Order"}</span>
                            {+ri.price>0&&<span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{(+ri.price).toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                          </div>
                        </div>
                      ))}
                      {noStockReplies.length>0&&(
                        <div style={{marginTop:4,padding:"3px 0"}}>
                          <span style={{fontSize:10,color:"var(--red)",fontWeight:600}}>❌ No Stock: </span>
                          <span style={{color:"var(--text3)",fontSize:11}}>{noStockReplies.map(ri=>ri.description).join(", ")}</span>
                        </div>
                      )}
                      {onCreatePO&&inStockReplies.some(ri=>+ri.price>0)&&(
                        <button onClick={()=>onCreatePO({supplier_name:r.supplier_name||"",supplier_id:r.supplier_id||null,job_id:job.id,items:inStockReplies.map(ri=>({description:ri.description,sku:ri.sku||"",supplier_part_no:ri.supplier_part_no||"",qty:ri.qty||1,unit_price:+ri.price||0,condition:ri.condition==="can_order"?"to_order":"in_stock"}))})}
                          style={{marginTop:8,fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(56,189,248,.4)",background:"rgba(56,189,248,.1)",cursor:"pointer",color:"#38bdf8",fontWeight:600,width:"100%"}}>
                          📦 Create Purchase Order from Reply
                        </button>
                      )}
                    </div>
                  )}

                  {/* Manual quote summary if entered */}
                  {existingQuote&&(
                    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:6,padding:"6px 10px",background:"rgba(52,211,153,.08)",borderRadius:7}}>
                      <span style={{fontSize:11,color:"var(--green)",fontWeight:700}}>💰 Quote received</span>
                      {qLines.filter(l=>+l.price>0).map((l,j)=>(
                        <span key={j} style={{fontSize:11,color:"var(--text2)"}}>{l.name}: <strong>{(+(l.vat_incl_price||l.price)).toLocaleString(undefined,{minimumFractionDigits:2})}</strong>{l.vat_incl_price&&l.vat_incl_price!==l.price?<span style={{fontSize:10,color:"#f59e0b"}}> incl.VAT</span>:null}</span>
                      ))}
                      {existingQuote.total>0&&<span style={{fontSize:12,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginLeft:"auto"}}>Total: {(+existingQuote.total).toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button
                      onClick={()=>setQuoteTarget({request:r, existingQuote: existingQuote||null})}
                      style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:"1px solid var(--border)",background:existingQuote?"rgba(52,211,153,.12)":"var(--surface3)",cursor:"pointer",color:existingQuote?"var(--green)":"var(--text2)",fontWeight:600}}>
                      {existingQuote?"✏️ Edit Quote":"💰 Enter Quote"}
                    </button>
                    {onDeleteSend&&(
                      <button
                        onClick={()=>{ if(window.confirm("Delete this send record and its entered quote prices?")) onDeleteSend(r.id); }}
                        style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.08)",cursor:"pointer",color:"#ef4444",fontWeight:600}}>
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quote entry modal */}
      {quoteTarget&&(
        <SupplierQuoteModal
          request={quoteTarget.request}
          existingQuote={quoteTarget.existingQuote}
          settings={settings}
          onSave={async(d)=>{ if(onSaveQuote) await onSaveQuote(d); setQuoteTarget(null); }}
          onClose={()=>setQuoteTarget(null)}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIN DECODER
// ═══════════════════════════════════════════════════════════════
function decodeVin(vin) {
  if (!vin || vin.length < 11) return null;
  const v = vin.toUpperCase();

  // Position 10 (index 9) = model year
  const YR = {A:[1980,2010],B:[1981,2011],C:[1982,2012],D:[1983,2013],E:[1984,2014],
    F:[1985,2015],G:[1986,2016],H:[1987,2017],J:[1988,2018],K:[1989,2019],
    L:[1990,2020],M:[1991,2021],N:[1992,2022],P:[1993,2023],R:[1994,2024],
    S:[1995],T:[1996],V:[1997],W:[1998],X:[1999],Y:[2000],
    '1':[2001],'2':[2002],'3':[2003],'4':[2004],'5':[2005],
    '6':[2006],'7':[2007],'8':[2008],'9':[2009]};
  const yc = v[9], ys = YR[yc];
  const year = ys ? (ys.length===2 ? `${ys[0]} / ${ys[1]}` : String(ys[0])) : '?';

  // WMI (positions 1–3)
  const wmi = v.substring(0,3);
  const wmi2 = v.substring(0,2);

  // Country from first char
  const CC = {
    '1':'USA','2':'Canada','3':'Mexico','4':'USA','5':'USA',
    '6':'Australia','7':'New Zealand','8':'Argentina','9':'Brazil',
    A:'South Africa',B:'Angola / Kenya',C:'Ivory Coast',
    D:'Germany',E:'Spain',F:'France',G:'UK',H:'Switzerland',
    J:'Japan',K:'Korea',L:'China',M:'India',N:'Netherlands',
    P:'Philippines',R:'Taiwan',S:'UK / Sweden',T:'Hungary / Thailand',
    U:'Hungary',V:'France / Croatia',W:'Germany',X:'Russia',
    Y:'Sweden / Finland',Z:'Italy'
  };
  const country = CC[v[0]] || '—';

  // Make from WMI
  const WMI_MAP = {
    WAU:'Audi (DE)',WA1:'Audi Q (DE)',TRU:'Audi (HU)',
    WVW:'Volkswagen (DE)',AAV:'Volkswagen (SA)',
    WBA:'BMW (DE)',WBS:'BMW M (DE)',WBY:'BMW i (DE)',WBX:'BMW X (DE)',
    WDB:'Mercedes-Benz (DE)',WDC:'Mercedes-Benz SUV (DE)',WDD:'Mercedes-Benz (DE)',
    WDF:'Mercedes-Benz Vans',W1K:'Mercedes-Benz',
    WMW:'Mini (DE)',
    WP0:'Porsche (DE)',WP1:'Porsche Cayenne (DE)',
    WJM:'Rolls-Royce (DE)',SCA:'Rolls-Royce (UK)',
    SAJ:'Jaguar (UK)',SAL:'Land Rover (UK)',
    VSS:'SEAT (ES)',TMB:'Škoda (CZ)',
    VF1:'Renault (FR)',VF3:'Peugeot (FR)',
    ZAR:'Alfa Romeo (IT)',ZFA:'Fiat (IT)',
    W0L:'Opel / Vauxhall (DE)',
    KMH:'Hyundai (KR)',KMJ:'Hyundai (KR)',
    KNA:'Kia (KR)',KND:'Kia SUV (KR)',
    JHM:'Honda (JP)',JN1:'Nissan (JP)',JN6:'Nissan (JP)',
    JMZ:'Mazda (JP)',JS3:'Suzuki (JP)',JS4:'Suzuki (JP)',
    AAT:'Toyota (SA)',
  };
  const JT_MAKES = {JT:'Toyota (JP)',JA:'Isuzu (JP)',JD:'Daihatsu (JP)',JM:'Mazda (JP)'};
  const make = WMI_MAP[wmi] || WMI_MAP[wmi2] || JT_MAKES[wmi2] || `WMI: ${wmi}`;

  // European VINs have ZZZ padding at positions 4–6; model code is at positions 7–8 (index 6–7)
  const isEuro = v.substring(3,6)==='ZZZ';
  const mc = isEuro ? v.substring(6,8) : null;

  // Audi model codes
  const AUDI_M = {
    '4L':'Q7 2005–2015','4M':'Q7 2015–','GA':'Q8 2018–',
    '8R':'Q5 2008–2017','FY':'Q5 2017–',
    '8U':'Q3 2011–2018','F3':'Q3 2018–',
    '8P':'A3 2003–2013','8V':'A3 2013–2020','8Y':'A3 2020–',
    '8J':'TT 2006–2014','8S':'TT 2014–',
    '8E':'A4 2000–2008','8K':'A4 2008–2015','B9':'A4 2015–',
    '8T':'A5 2007–2016','F5':'A5 2016–',
    '4F':'A6 2004–2011','4G':'A6 2011–2018','C8':'A6 2018–',
    '4E':'A8 2002–2009','4H':'A8 2009–2017','4N':'A8 2017–',
    'RS':'RS model','SQ':'SQ model',
  };
  // VW model codes
  const VW_M = {
    '1J':'Golf IV 1997–2003','1K':'Golf V 2003–2008',
    '5K':'Golf VI 2008–2012','AU':'Golf VII 2012–2019','CD':'Golf VIII 2019–',
    '3C':'Passat B6 2005–2010','3G':'Passat B8 2014–',
    '5N':'Tiguan 2007–2016','AD':'Tiguan 2016–',
    '7P':'Touareg 2010–2018','CR':'Touareg 2018–',
    '6R':'Polo V 2009–2017','AW':'Polo VI 2017–',
    '6S':'Polo Vivo 2010–2019','6C':'Polo 2014–2017',
    '2K':'Caddy 2004–2015','SB':'Caddy 2015–',
    'S1':'Amarok 2010–','7N':'Sharan 2010–',
    '1T':'Touran 2003–2010','5T':'Touran 2015–',
  };

  let model = null;
  if (mc) {
    if (wmi==='WAU'||wmi==='WA1'||wmi==='TRU') model = AUDI_M[mc] || `Code: ${mc}`;
    else if (wmi==='WVW'||wmi==='AAV')          model = VW_M[mc]   || `Code: ${mc}`;
  }

  // Assembly plant (position 11, index 10)
  const pc = v[10];
  const AUDI_P  = {A:'Ingolstadt',B:'Brussels',D:'Neckarsulm',H:'Győr (HU)',N:'Neckarsulm'};
  const BMW_P   = {A:'Munich',C:'Regensburg',D:'Dingolfing',F:'Oxford (Mini)',G:'Graz (AT)',J:'Leipzig',P:'Spartanburg (US)',R:'Rosslyn (SA)'};
  const MB_P    = {A:'Sindelfingen',B:'Bremen',E:'Rastatt',H:'Hambach (Smart)',K:'Tuscaloosa (US)',P:'East London (SA)'};
  const TOYOTA_P= {A:'Tahara (JP)',B:'Motomachi (JP)',C:'Tsutsumi (JP)',E:'Proton (Durban SA)',T:'Proton (SA)',Z:'Johannesburg (SA)'};

  let plant = null;
  if      (wmi==='WAU'||wmi==='WA1') plant = AUDI_P[pc]  ? `${AUDI_P[pc]} (${pc})`  : null;
  else if (wmi==='WBA'||wmi==='WBS') plant = BMW_P[pc]   ? `${BMW_P[pc]} (${pc})`   : null;
  else if (wmi==='WDB'||wmi==='WDC'||wmi==='WDD') plant = MB_P[pc] ? `${MB_P[pc]} (${pc})` : null;
  else if (wmi==='AAT'||wmi2==='JT') plant = TOYOTA_P[pc]? `${TOYOTA_P[pc]} (${pc})`: null;

  return {year, country, make, model, plant};
}

// ═══════════════════════════════════════════════════════════════
// WORKSHOP JOB DETAIL
// ═══════════════════════════════════════════════════════════════
function WorkshopJobDetail({job,items,invoice,quote,jobs=[],parts,partFitments=[],vehicles=[],settings,wsVehicles=[],wsCustomers=[],wsStock=[],wsServices=[],suppliers=[],wsSuppliers=[],wsSupplierRequests=[],wsSupplierQuotes=[],wsPurchaseOrders=[],onSaveWsSupplierRequest,onDeleteWsSupplierRequest,onSaveWsSupplierQuote,onSaveWsStock,onBack,onSaveJob,onDeleteJob,onMoveJob,onSaveItem,onDeleteItem,onSaveInvoice,onUpdateInvoice,onDeleteInvoice,onSaveQuote,onDeleteQuote,onConvertQuoteToInvoice,onSendQuoteForApproval,onSaveWsVehicle,wsRole="main",sqReplies=[],onGenerateWsQuoteLink,onSaveWsPurchaseOrder,onViewPurchaseOrders,onViewPO,onSaveWsLicenceRenewal,onGoToStock,wsId=null,wsProfile={},initialTab="car",onRefresh,t,lang}) {
  // Local currency formatter using the workshop's own settings currency
  const _wsC = curSym(settings.currency||getSettings().currency);
  const fmtAmt = v => `${_wsC}${(+v||0).toLocaleString()}`;
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
  const [moveModal,     setMoveModal]     = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [createPoOpen,  setCreatePoOpen]  = useState(false);
  const [jobTab,        setJobTab]        = useState(initialTab||"car");
  const [oeSearch,      setOeSearch]      = useState("");
  const [editPriceId,   setEditPriceId]   = useState(null);
  const [editPriceVal,  setEditPriceVal]  = useState("");
  const [editQtyId,     setEditQtyId]     = useState(null);
  const [editQtyVal,    setEditQtyVal]    = useState("");
  const [editMarkupId,  setEditMarkupId]  = useState(null);
  const [editMarkupVal, setEditMarkupVal] = useState("");
  const [returnQuoteOpen,  setReturnQuoteOpen]  = useState(false);
  const [returnQuoteTarget,setReturnQuoteTarget]= useState(null); // {request, existingQuote}
  const [movePinOpen,      setMovePinOpen]      = useState(false);
  const [movePinVal,       setMovePinVal]        = useState("");
  const [movePinErr,       setMovePinErr]        = useState("");
  const [photoLightbox,    setPhotoLightbox]    = useState(null); // null | index into visible photos
  const [renewalModal,  setRenewalModal]  = useState(false);
  const [serviceHistModal, setServiceHistModal] = useState(false);
  const [addingPastRecord, setAddingPastRecord] = useState(false);
  const [pastRec, setPastRec] = useState({date_in:"",date_out:"",mileage:"",complaint:"",diagnosis:"",mechanic:"",notes:""});
  const [savingPastRec, setSavingPastRec] = useState(false);
  const [isMobile,      setIsMobile]      = useState(()=>window.innerWidth<=700);
  useEffect(()=>{const fn=()=>setIsMobile(window.innerWidth<=700);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  const [refreshing,    setRefreshing]    = useState(false);
  const [noteEdit,      setNoteEdit]      = useState(false);
  const [noteVal,       setNoteVal]       = useState(job.notes||"");
  const [savingNote,    setSavingNote]    = useState(false);
  useEffect(()=>{ setNoteVal(job.notes||""); },[job.notes]);

  const vehicleRecord = wsVehicles.find(v=>v.id===job.workshop_vehicle_id)||null;
  const vehicleHistory = jobs.filter(j=>{
    if(j.id===job.id) return false;
    if(job.workshop_vehicle_id&&j.workshop_vehicle_id===job.workshop_vehicle_id) return true;
    const reg=(job.vehicle_reg||"").replace(/\s/g,"").toUpperCase();
    return reg&&reg===(j.vehicle_reg||"").replace(/\s/g,"").toUpperCase();
  }).sort((a,b)=>new Date(b.date_in)-new Date(a.date_in));
  const [localPhotoOverrides, setLocalPhotoOverrides] = useState({});
  const [editPhotos, setEditPhotos] = useState(false);
  const vehiclePhotos = wsVehicles.reduce((acc,v)=>v.id===job.workshop_vehicle_id?{
    front: localPhotoOverrides.front!==undefined ? localPhotoOverrides.front : (v.photo_front||""),
    rear:  localPhotoOverrides.rear !==undefined ? localPhotoOverrides.rear  : (v.photo_rear ||""),
    side:  localPhotoOverrides.side !==undefined ? localPhotoOverrides.side  : (v.photo_side ||""),
  }:acc,{front:"",rear:"",side:""});

  const handleVehiclePhotoChange = async (field, key, url) => {
    setLocalPhotoOverrides(p=>({...p,[key]:url}));
    if(vehicleRecord) {
      try { await onSaveWsVehicle({...vehicleRecord,[field]:url}); }
      catch(e) { console.error("Photo save failed",e); }
    }
  };

  // ── Check-in Checklist ────────────────────────────────────────
  const [checklist,       setChecklist]       = useState({}); // { item_key: {status,note,photo_url} }
  const [checklistOpen,   setChecklistOpen]   = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  const [clUploading,     setClUploading]     = useState({}); // { item_key: bool }
  const clCamRefs = useRef({});

  useEffect(()=>{
    if(jobTab!=="inspect"||checklistLoaded) return;
    api.get("workshop_job_checklist",`job_id=eq.${job.id}`)
      .then(rows=>{
        const map={};
        (Array.isArray(rows)?rows:[]).forEach(r=>{ map[r.item_key]={status:r.status||"pending",note:r.note||"",photo_url:r.photo_url||"",id:r.id}; });
        setChecklist(map);
        setChecklistLoaded(true);
      })
      .catch(()=>setChecklistLoaded(true));
  },[jobTab,checklistLoaded,job.id]);

  const saveChecklistItem=async(key,patch)=>{
    const current=checklist[key]||{status:"pending",note:"",photo_url:""};
    const updated={...current,...patch};
    setChecklist(p=>({...p,[key]:updated}));
    try{
      const id=updated.id||makeId("CL");
      const rec={id,job_id:job.id,item_key:key,status:updated.status,note:updated.note||"",photo_url:updated.photo_url||""};
      await api.upsert("workshop_job_checklist",rec);
      if(!updated.id) setChecklist(p=>({...p,[key]:{...updated,id}}));
    }catch(e){ console.error("Checklist save error:",e); alert("Save failed — make sure the workshop_job_checklist table exists in Supabase."); }
  };

  const uploadChecklistPhoto=async(key,dataUrl)=>{
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL&&window._VEHICLE_SCRIPT_URL.trim())||(window._APPS_SCRIPT_URL&&window._APPS_SCRIPT_URL.trim())||"";
    if(!SCRIPT_URL){ alert("No Script URL configured in Settings."); return; }
    setClUploading(p=>({...p,[key]:true}));
    try{
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1200; const canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;
          canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.85));
        };
        img.onerror=rej; img.src=dataUrl;
      });
      const now=new Date(); const pad2=n=>String(n).padStart(2,"0");
      const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const timeStr=`${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
      const reg=(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase();
      const folderPath=`Tim_Car_Phot/${reg}/Checklist`;
      const filename=`CL_${key}_${dateStr.replace(/-/g,"")}_${timeStr.replace(/-/g,"")}.jpg`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType:"image/jpeg",folderPath})});
      const result=await resp.json();
      console.log("[CL Photo Upload] Success:",result.success,"URL:",result.url);
      if(result.success){
        if(!result.url||(!result.url.includes("/file/d/")&&!result.url.includes("?id="))){
          console.warn("[CL Photo] Invalid URL format returned:",result.url);
          alert("Photo uploaded but URL format is invalid. Check Apps Script configuration.");
          return;
        }
        await saveChecklistItem(key,{photo_url:result.url});
      }
      else { alert("Photo upload failed: "+(result.error||"Unknown error")); }
    }catch(e){ alert("Upload error: "+e.message); }
    finally{ setClUploading(p=>({...p,[key]:false})); }
  };

  // ── Job documents ─────────────────────────────────────────────
  const [jobDocs,       setJobDocs]       = useState([]);
  const [docName,       setDocName]       = useState("");
  const [docNotes,      setDocNotes]      = useState("");
  const [docFile,       setDocFile]       = useState(null);
  const [docPreview,    setDocPreview]    = useState(null);
  const [docUploading,  setDocUploading]  = useState(false);
  const [viewDocImg,    setViewDocImg]    = useState(null);
  const docFileRef = useRef(null);

  useEffect(()=>{
    api.get("workshop_documents",`job_id=eq.${job.id}&order=uploaded_at.desc`)
      .then(r=>setJobDocs(Array.isArray(r)?r:[]))
      .catch(()=>setJobDocs([]));
  },[job.id]);

  const handleDocFile=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    setDocFile(f);
    setDocName(prev=>prev||f.name.replace(/\.[^.]+$/,""));
    if(f.type.startsWith("image/")){
      const r=new FileReader(); r.onload=ev=>setDocPreview(ev.target.result); r.readAsDataURL(f);
    } else { setDocPreview(null); }
  };

  const uploadJobDoc=async()=>{
    if(!docFile){alert("Choose a file first");return;}
    if(!docName.trim()){alert("Enter a document name");return;}
    const SCRIPT_URL=(window._VEHICLE_SCRIPT_URL?.trim())||(window._APPS_SCRIPT_URL?.trim())||"";
    if(!SCRIPT_URL){alert("No Google Drive Script URL in Settings");return;}
    setDocUploading(true);
    try{
      const isPdf=docFile.type==="application/pdf";
      let base64,mimeType,filename;
      if(isPdf){
        base64=await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=ev=>{const b=new Uint8Array(ev.target.result);let s="";b.forEach(x=>{s+=String.fromCharCode(x);});res("data:application/pdf;base64,"+btoa(s));};
          r.onerror=rej; r.readAsArrayBuffer(docFile);
        });
        mimeType="application/pdf"; filename=`${docName.trim().replace(/\s+/g,"_")}_${Date.now()}.pdf`;
      } else {
        base64=await new Promise((res,rej)=>{
          const img=new Image();
          img.onload=()=>{
            const MAX=1600; const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const ratio=Math.min(MAX/w,MAX/h);w=Math.round(w*ratio);h=Math.round(h*ratio);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            res(canvas.toDataURL("image/jpeg",0.88));
          };
          img.onerror=rej; img.src=docPreview;
        });
        mimeType="image/jpeg"; filename=`${docName.trim().replace(/\s+/g,"_")}_${Date.now()}.jpg`;
      }
      const folderPath=`Tim_Car_Phot/${(job.vehicle_reg||"REG").replace(/\s/g,"").toUpperCase()}/Documents`;
      const resp=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"upload",image:base64,filename,mimeType,folderPath})});
      const result=await resp.json();
      if(!result.success) throw new Error(result.error||"Upload failed");
      const rec={
        id:makeId("WSD"),job_id:job.id,workshop_id:job.workshop_id||null,customer_id:job.workshop_customer_id||null,
        name:docName.trim(),notes:docNotes.trim()||null,
        file_url:result.url,file_type:isPdf?"pdf":"image",mime_type:mimeType,filename,
        uploaded_at:new Date().toISOString(),
      };
      const saved=await api.insert("workshop_documents",rec);
      if(saved&&!Array.isArray(saved)&&saved.message) throw new Error(saved.message);
      setJobDocs(p=>[rec,...p]);
      setDocName(""); setDocNotes(""); setDocFile(null); setDocPreview(null);
      if(docFileRef.current) docFileRef.current.value="";
    }catch(e){alert("Upload failed: "+e.message);}
    finally{setDocUploading(false);}
  };

  const deleteJobDoc=async(id)=>{
    await api.delete("workshop_documents","id",id);
    setJobDocs(p=>p.filter(d=>d.id!==id));
  };
  const [editDocId,setEditDocId]=useState(null);
  const [editDocVal,setEditDocVal]=useState({name:"",notes:""});
  const saveDocEdit=async()=>{
    if(!editDocVal.name.trim()){alert("Name required");return;}
    await api.patch("workshop_documents","id",editDocId,{name:editDocVal.name.trim(),notes:editDocVal.notes.trim()||null});
    setJobDocs(p=>p.map(d=>d.id===editDocId?{...d,name:editDocVal.name.trim(),notes:editDocVal.notes.trim()||null}:d));
    setEditDocId(null);
  };

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
    const files=Array.from(e.target.files||[]);
    const fromCamera=e.target===jobPhotoCamRef.current;
    e.target.value="";
    if(!files.length) return;
    const reg=(job?.vehicle_reg||"photo").replace(/\s/g,"").toUpperCase();
    files.forEach(file=>{
      const isImage = file.type.startsWith("image/") || file.type==="" ||
        /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
      if(!isImage) return;
      jobPhotoCounter.current+=1;
      const uid=jobPhotoCounter.current;
      if(fromCamera){
        const bUrl=URL.createObjectURL(file);
        const a=document.createElement("a");
        a.href=bUrl; a.download=`Job_${reg}_${uid}.jpg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(bUrl),5000);
      }
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

  const pasteJobPhoto=async()=>{
    try{
      const items=await navigator.clipboard.read();
      let found=false;
      for(const item of items){
        const imgType=item.types.find(t=>t.startsWith("image/"));
        if(!imgType) continue;
        found=true;
        const blob=await item.getType(imgType);
        const fr=new FileReader();
        fr.onload=ev=>{
          jobPhotoCounter.current+=1;
          const uid=jobPhotoCounter.current;
          setUploadPhotos(p=>[...p,{id:uid,dataUrl:ev.target.result,status:"pending",url:null,error:null}]);
          uploadJobPhoto(uid,ev.target.result);
        };
        fr.readAsDataURL(blob);
      }
      if(!found) alert("No image found in clipboard — copy an image first then paste.");
    }catch(e){
      alert("Clipboard access denied. Allow clipboard permission in your browser and try again.");
    }
  };

  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const tax      = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+tax;

  const JOB_STATUSES = ["Pending","In Progress","Done","Delivered"];
  const ST_COLOR = {"Pending":"var(--blue)","In Progress":"var(--yellow)","Done":"var(--green)","Delivered":"var(--text3)"};

  // VIN search lookup helper
  const catcarSlug=(make)=>{
    const m=(make||"").toLowerCase().replace(/[-\s]+/g,"");
    const map={mercedesbenz:"mercedes",mercedes:"mercedes",smart:"mercedes",vw:"audivw",volkswagen:"audivw",audi:"audivw",landrover:"land-rover",rangerover:"land-rover",alfaromeo:"alfa-romeo",mini:"bmw",rollsroyce:"bmw","rolls-royce":"bmw"};
    const slug=map[m]||(make||"").toLowerCase().replace(/\s+/g,"-");
    return slug;
  };
  const catcarHref=job.vin
    ? (job.vehicle_make
        ? `https://catcar.info/${catcarSlug(job.vehicle_make)}/?lang=en&vin=${encodeURIComponent(job.vin)}`
        : `https://catcar.info/?lang=en&vin=${encodeURIComponent(job.vin)}`)
    : null;
  const vinSearchLinks = job.vin ? [
    ...(catcarHref?[{label:"CatCar",    icon:"🐱", color:"#f97316",       bg:"rgba(249,115,22,.13)",  href:catcarHref}]:[]),
    {label:"PartsOuq",  icon:"🔩", color:"var(--blue)",   bg:"rgba(96,165,250,.13)",  href:`https://partsouq.com/en/search/all?q=${encodeURIComponent(job.vin)}`},
    {label:"RealOEM",   icon:"🚗", color:"var(--green)",  bg:"rgba(52,211,153,.13)",  href:`https://www.realoem.com/bmw/enUS/select?vin=${encodeURIComponent(job.vin)}`},
    {label:"VIN Decode",icon:"🔎", color:"var(--yellow)", bg:"rgba(251,191,36,.13)",  href:`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(job.vin)}`},
    {label:"17VIN",     icon:"🆔", color:"var(--text2)",  bg:"rgba(148,163,184,.13)", href:`https://en.17vin.com/vin/${encodeURIComponent(job.vin)}`},
    {label:"Willard 🔋",icon:"🔋", color:"#ef4444",       bg:"rgba(220,38,38,.11)",   href:"https://willard.co.za/battery-selection-tool/"},
    {label:"VARTA 🔋",  icon:"⚡", color:"#6366f1",       bg:"rgba(99,102,241,.11)",  href:"https://www.varta-automotive.com/battery-finder"},
    {label:"Safeline",  icon:"🛑", color:"#dc2626",       bg:"rgba(220,38,38,.09)",   href:"https://safelinebrakes.co.za/"},
  ] : [];

  return (
    <div className="fu">
      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>{t.wsBack}</button>
        {onRefresh&&(
          <button className="btn btn-ghost btn-sm" disabled={refreshing}
            onClick={async()=>{ setRefreshing(true); try{ await onRefresh(); }finally{ setRefreshing(false); } }}
            style={{padding:"6px 10px",minWidth:32}}
            title="Refresh">
            <span style={{display:"inline-block",animation:refreshing?"spin 0.8s linear infinite":"none",fontSize:15,lineHeight:1}}>🔄</span>
          </button>
        )}
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.customer_name}</h1>
          <div style={{fontSize:12,color:"var(--text3)",display:"flex",gap:8,flexWrap:"wrap",marginTop:2}}>
            <code style={{fontFamily:"DM Mono,monospace"}}>{job.id}</code>
            <span>·</span><span>{job.date_in}</span>
            {job.vehicle_reg&&<><span>·</span><strong>🚗 {job.vehicle_reg}</strong></>}
          </div>
        </div>
        <span className="badge" style={{background:"rgba(96,165,250,.12)",color:ST_COLOR[job.status]||"var(--blue)",fontSize:13,padding:"5px 12px",flexShrink:0}}>
          {tSt(job.status)}
        </span>
      </div>

      {/* ── Status pipeline bar ── */}
      {(()=>{
        const isPaid = invoice?.status==="paid";
        const isInvoiced = !!invoice;
        const isProblem = !!job.is_problem;
        const STAGES = [
          {key:"Pending",         label:"⏳ Pending",          color:"#a78bfa", bg:"rgba(167,139,250,.18)", mechanic:true},
          {key:"In Progress",     label:"⚙️ In Progress",      color:"#fbbf24", bg:"rgba(251,191,36,.18)",  mechanic:true},
          {key:"Done",            label:"✅ Done",              color:"#34d399", bg:"rgba(52,211,153,.18)",  mechanic:false},
          {key:"Invoiced",        label:"🧾 Invoiced",          color:"#f97316", bg:"rgba(249,115,22,.18)",  mechanic:false, derived:true},
          {key:"Payment Received",label:"💚 Payment Received",  color:"#10b981", bg:"rgba(16,185,129,.18)",  mechanic:false, derived:true},
        ];
        const activeKey = isPaid?"Payment Received":isInvoiced?"Invoiced":job.status;
        const visibleStages = wsRole==="mechanic" ? STAGES.filter(s=>s.mechanic) : STAGES;
        const phone=(job.customer_phone||"").replace(/\D/g,"");
        const showWa=(job.status==="Done"||job.status==="Delivered")&&phone;
        return (
          <div className="card" style={{padding:"10px 14px",marginBottom:12}}>
            <div style={{display:"flex",gap:6,alignItems:"center",overflowX:"auto",flexWrap:"nowrap",paddingBottom:2,scrollbarWidth:"none"}}>
              {visibleStages.map((s,i)=>{
                const active = activeKey===s.key;
                const clickable = !s.derived;
                return (
                  <span key={s.key} style={{display:"contents"}}>
                    {i>0&&<span style={{color:"var(--text3)",fontSize:11,flexShrink:0}}>→</span>}
                    <button
                      disabled={!clickable}
                      onClick={clickable?()=>onSaveJob({...job,status:s.key}):undefined}
                      style={{
                        border:`1.5px solid ${active?s.color:"var(--border)"}`,
                        borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:600,cursor:clickable?"pointer":"default",
                        background:active?s.bg:"transparent",
                        color:active?s.color:"var(--text3)",
                        fontFamily:"'DM Sans',sans-serif",flexShrink:0,
                        transition:"all .15s",opacity:!clickable&&!active?0.5:1,
                      }}
                    >{s.label}</button>
                  </span>
                );
              })}
            </div>
            {wsRole!=="mechanic"&&(
              <div style={{marginTop:6}}>
                <button
                  onClick={()=>onSaveJob({...job,is_problem:!isProblem,problem_prev_status:!isProblem?job.status:job.problem_prev_status})}
                  style={{
                    border:`1.5px solid ${isProblem?"#f87171":"var(--border)"}`,
                    borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:600,cursor:"pointer",
                    background:isProblem?"rgba(248,113,113,.18)":"transparent",
                    color:isProblem?"#f87171":"var(--text3)",
                    fontFamily:"'DM Sans',sans-serif",transition:"all .15s",
                  }}
                >⚠️ Problem Job</button>
              </div>
            )}
            {showWa&&(()=>{
              const name=job.customer_name||"there";
              const reg=job.vehicle_reg?`your ${job.vehicle_make?`${job.vehicle_make} `:""}${job.vehicle_model?`${job.vehicle_model} `:""}(${job.vehicle_reg})`:"your vehicle";
              const shopName=wsProfile?.name||settings?.shop_name||"Workshop";
              const shopPhone=wsProfile?.phone||settings?.phone||"";
              const msg=`Hi ${name}! 🎉 Great news — ${reg} is ready for collection at *${shopName}*.\n\nPlease contact us to arrange collection${shopPhone?` on ${shopPhone}`:""}.`;
              return (
                <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid var(--border)"}}>
                  <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                    className="btn btn-ghost btn-xs"
                    style={{color:"#25D366",borderColor:"rgba(37,211,102,.35)",textDecoration:"none"}}>
                    📱 Car Ready — Notify Customer
                  </a>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Tab bar ── */}
      {isMobile ? (
        /* Mobile: icon pill grid — all 6 fit on one row, no scrolling */
        <div style={{display:"grid",gridTemplateColumns:`repeat(${wsRole==="mechanic"?4:6},1fr)`,gap:6,marginBottom:14}}>
          {[
            {id:"car",     icon:"🚗", label:t.wsTabCar},
            ...(wsRole!=="mechanic"?[
              {id:"quote",   icon:"📝", label:t.wsTabQuote,  badge:quote?{accepted:"✓",converted:"↗",declined:"✗"}[quote.status]||null:null},
            ]:[]),
            {id:"inspect", icon:"✅", label:t.wsTabInspect, badge:checklistLoaded?`${CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")!=="pending").length}/${CHECKLIST_ITEMS.length}`:null},
            {id:"photos",  icon:"📷", label:t.wsTabPhotos,  badge:savedPhotos.length>0?savedPhotos.length:null},
            {id:"docs",    icon:"📎", label:t.wsTabDocs,    badge:jobDocs.length>0?jobDocs.length:null},
            ...(wsRole!=="mechanic"?[
              {id:"invoice", icon:"🧾", label:t.invoice,     badge:invoice?{paid:"✓",partial:"½"}[invoice.status]||null:null},
            ]:[]),
          ].map(tab=>{
            const active=jobTab===tab.id;
            return (
              <button key={tab.id} onClick={()=>setJobTab(tab.id)} style={{
                position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                padding:"8px 4px",border:"none",borderRadius:10,cursor:"pointer",
                background:active?"var(--accent)":"var(--surface2)",
                color:active?"#fff":"var(--text3)",
                transition:"background .15s",
              }}>
                <span style={{fontSize:20,lineHeight:1}}>{tab.icon}</span>
                <span style={{fontSize:9,fontWeight:active?700:500,letterSpacing:".02em",lineHeight:1,whiteSpace:"nowrap"}}>{tab.label}</span>
                {tab.badge!=null&&(
                  <span style={{
                    position:"absolute",top:4,right:6,fontSize:9,fontWeight:700,
                    background:active?"rgba(255,255,255,.3)":"var(--accent)",
                    color:active?"#fff":"#fff",borderRadius:99,padding:"1px 4px",lineHeight:1.4,minWidth:14,textAlign:"center"
                  }}>{tab.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* Desktop: underline tabs */
        <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:14,overflowX:"auto",gap:0,scrollbarWidth:"none"}}>
          {[
            {id:"car",     label:`🚗 ${t.wsTabCar}`},
            ...(wsRole!=="mechanic"?[
              {id:"quote",   label:`📝 ${t.wsTabQuote}`,   badge:quote?{accepted:"✓",converted:"↗",declined:"✗"}[quote.status]||null:null},
            ]:[]),
            {id:"inspect", label:`✅ ${t.wsTabInspect}`, badge:checklistLoaded?`${CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")!=="pending").length}/${CHECKLIST_ITEMS.length}`:null},
            {id:"photos",  label:`📷 ${t.wsTabPhotos}`,  badge:savedPhotos.length>0?savedPhotos.length:null},
            {id:"docs",    label:`📎 ${t.wsTabDocs}`,     badge:jobDocs.length>0?jobDocs.length:null},
            ...(wsRole!=="mechanic"?[
              {id:"invoice", label:`🧾 ${t.invoice}`, badge:invoice?{paid:"✓",partial:"½"}[invoice.status]||null:null},
            ]:[]),
          ].map(tab=>(
            <button key={tab.id} onClick={()=>setJobTab(tab.id)} style={{
              padding:"9px 13px",border:"none",background:"none",cursor:"pointer",flexShrink:0,
              fontSize:13,fontWeight:jobTab===tab.id?700:400,
              color:jobTab===tab.id?"var(--accent)":"var(--text2)",
              borderBottom:jobTab===tab.id?"2px solid var(--accent)":"2px solid transparent",
              marginBottom:-1,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,
            }}>
              {tab.label}
              {tab.badge!=null&&<span style={{fontSize:10,fontWeight:600,opacity:.7,background:"var(--surface2)",borderRadius:99,padding:"1px 5px"}}>{tab.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ══ CAR INFO tab ══ */}
      {jobTab==="car"&&(
        <div className="card" style={{padding:16,marginBottom:14}}>
          {/* Action buttons */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
            {wsRole!=="mechanic"&&<button className="btn btn-ghost btn-sm" onClick={()=>setEditJob(true)}>✏️ {t.edit}</button>}
            <button className="btn btn-ghost btn-sm" onClick={()=>printJobCardLabel(job,settings)}>🏷️ {t.wsLabel}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setDeliveryModal(true)}>🚗 {t.wsCollect}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setServiceHistModal(true)}>📋 History{vehicleHistory.length>0?` (${vehicleHistory.length})`:""}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              const lines=["============================","  VEHICLE INFO","============================",
                `Plate    : ${job.vehicle_reg||"—"}`,`Make     : ${job.vehicle_make||"—"}`,
                `Model    : ${job.vehicle_model||"—"}`,`Year     : ${job.vehicle_year||"—"}`,
                `Color    : ${job.vehicle_color||"—"}`,`Mileage  : ${job.mileage?job.mileage.toLocaleString()+" km":"—"}`,
                job.vin?`VIN      : ${job.vin}`:"",job.engine_no?`Engine No: ${job.engine_no}`:"",
                "============================",].filter(Boolean).join("\r\n");
              const a=document.createElement("a");
              a.href=URL.createObjectURL(new Blob([lines],{type:"text/plain"}));
              a.download=`VehicleInfo_${job.vehicle_reg||job.id}.txt`; a.click();
            }}>⬇️ {t.wsInfoBtn}</button>
            {wsRole==="main"&&onMoveJob&&<button className="btn btn-ghost btn-sm" style={{color:"var(--yellow)"}} onClick={()=>{ if(wsProfile?.move_pin){setMovePinVal("");setMovePinErr("");setMovePinOpen(true);}else{setMoveModal(true);} }}>🔀 {t.wsMove}</button>}
            {wsRole==="main"&&onDeleteJob&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm(`Delete job ${job.id} for ${job.customer_name}?\n\nThis cannot be undone.`))onDeleteJob();}}>🗑 {t.delete}</button>}
          </div>
          {/* ── Profile Photos ── */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>📸 Profile Photos</div>
              {vehicleRecord&&(
                <button onClick={()=>setEditPhotos(p=>!p)}
                  style={{fontSize:11,padding:"3px 10px",background:editPhotos?"var(--accent)":"var(--surface2)",color:editPhotos?"#fff":"var(--text2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",fontWeight:600}}>
                  {editPhotos?"✓ Done":"✏️ Edit Photos"}
                </button>
              )}
            </div>
            {editPhotos&&vehicleRecord?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,maxWidth:"50%"}}>
                {[
                  {field:"photo_front",key:"front",label:"Front"},
                  {field:"photo_rear", key:"rear", label:"Rear"},
                  {field:"photo_side", key:"side", label:"Side"},
                ].map(({field,key,label})=>(
                  <VehiclePhotoUploader key={field} label={label} url={vehiclePhotos[key]}
                    vehicleId={vehicleRecord.id} make={vehicleRecord.make||"vehicle"}
                    reg={vehicleRecord.reg||job.vehicle_reg} viewName={key}
                    onChange={url=>handleVehiclePhotoChange(field,key,url)}/>
                ))}
              </div>
            ):(()=>{
              const allPhotos=[{url:vehiclePhotos.front,label:"Front"},{url:vehiclePhotos.rear,label:"Rear"},{url:vehiclePhotos.side,label:"Side"}];
              const visible=allPhotos.filter(p=>p.url);
              return visible.length>0?(
                <div style={{display:"grid",gridTemplateColumns:`repeat(${visible.length},1fr)`,gap:6,maxWidth:"50%"}}>
                  {visible.map(({url,label},i)=>(
                    <div key={label} style={{position:"relative",borderRadius:7,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3",cursor:"zoom-in"}}
                      onClick={()=>setPhotoLightbox(i)}>
                      <DriveImg url={url} alt={label} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}}/>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.45)",color:"#fff",textAlign:"center",fontSize:9,padding:"2px 0",fontWeight:600}}>{label}</div>
                    </div>
                  ))}
                </div>
              ):(
                <div style={{fontSize:12,color:"var(--text3)"}}>No photos — tap Edit Photos to add</div>
              );
            })()}
          </div>

          {/* Complaint / Diagnosis / Return Reason / Notes */}
          {job.complaint&&(
            <div style={{marginBottom:12,borderRadius:10,overflow:"hidden",border:"2px solid #ef4444"}}>
              <div style={{background:"#ef4444",padding:"5px 12px",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:14}}>⚠️</span>
                <span style={{fontSize:11,fontWeight:800,color:"#fff",textTransform:"uppercase",letterSpacing:".08em"}}>Customer Complaint</span>
              </div>
              <div style={{padding:"10px 12px",background:"var(--surface2)"}}>
                <div style={{fontSize:15,fontWeight:600,color:"var(--text)",lineHeight:1.55}}>{job.complaint}</div>
              </div>
            </div>
          )}
          {job.diagnosis&&<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>🔍 Diagnosis</div>
            <div style={{fontSize:13,lineHeight:1.6,color:"var(--blue)"}}>{job.diagnosis}</div>
          </div>}
          {job.return_reason&&<div style={{marginBottom:10,padding:"8px 12px",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8}}>
            <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>🔄 Return Reason</div>
            <div style={{fontSize:13,color:"var(--yellow)"}}>{job.return_reason}</div>
            {job.parent_job_id&&<div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>Original job: <code style={{fontFamily:"DM Mono,monospace"}}>{job.parent_job_id}</code></div>}
          </div>}
          {/* ── Inline Remark / Note ── */}
          <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(251,191,36,.08)",border:"1.5px solid rgba(251,191,36,.4)",borderRadius:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:noteEdit?6:0}}>
              <div style={{fontSize:10,fontWeight:700,color:"#b45309",textTransform:"uppercase",letterSpacing:".06em"}}>📝 Remark / Note</div>
              {!noteEdit&&(
                <button onClick={()=>setNoteEdit(true)}
                  style={{fontSize:11,padding:"2px 8px",background:"rgba(251,191,36,.15)",border:"1px solid rgba(251,191,36,.4)",borderRadius:5,cursor:"pointer",color:"#b45309",fontWeight:600}}>
                  {noteVal?"✏️ Edit":"+ Add"}
                </button>
              )}
            </div>
            {noteEdit?(
              <>
                <textarea
                  value={noteVal} onChange={e=>setNoteVal(e.target.value)}
                  placeholder="Add a remark or internal note..."
                  style={{width:"100%",fontSize:13,padding:"6px 8px",borderRadius:6,border:"1px solid rgba(251,191,36,.6)",background:"var(--surface)",color:"var(--text)",resize:"vertical",minHeight:64,fontFamily:"DM Sans,sans-serif",outline:"none",boxSizing:"border-box"}}
                  autoFocus/>
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <button className="btn btn-sm" style={{flex:1,background:"#f59e0b",color:"#fff",border:"none"}} disabled={savingNote}
                    onClick={async()=>{
                      setSavingNote(true);
                      await onSaveJob({...job,notes:noteVal.trim()||null});
                      setSavingNote(false); setNoteEdit(false);
                    }}>{savingNote?"Saving...":"💾 Save"}</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setNoteVal(job.notes||"");setNoteEdit(false);}}>Cancel</button>
                </div>
              </>
            ):(
              noteVal
                ?<div style={{fontSize:13,lineHeight:1.55,color:"#b45309",marginTop:4,fontWeight:700,fontStyle:"italic"}}>{noteVal}</div>
                :<div style={{fontSize:12,color:"#b45309",marginTop:2,fontStyle:"italic",opacity:.7}}>No remark yet</div>
            )}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:12}}>
            {[
              [`🚗 ${t.wsPlate}`,job.vehicle_reg],
              [t.wsMakeModel,`${job.vehicle_make||""} ${job.vehicle_model||""}`.trim()||"—"],
              [t.year,job.vehicle_year||"—"],
              [t.vehicleColor,job.vehicle_color||"—"],
              [t.mileage,job.mileage?`${job.mileage.toLocaleString()} km`:"—"],
              [`👷 ${t.mechanic}`,job.mechanic||"—"],
              [`📅 ${t.dateIn}`,job.date_in||"—"],
              [`📅 ${t.dateOut}`,job.date_out||"—"],
            ].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{l}</div>
                <div style={{fontWeight:600,fontSize:13}}>{v||"—"}</div>
              </div>
            ))}
            {job.engine_no&&(
              <div>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{t.engine} No</div>
                <code style={{fontWeight:600,fontSize:12,fontFamily:"DM Mono,monospace"}}>{job.engine_no}</code>
              </div>
            )}
            {(vehicleRecord?.licence_disc_expiry||job?.licence_disc_expiry)&&(
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:3}}>{t.wsLicenceExpiry}</div>
                {(()=>{
                  const exp = vehicleRecord?.licence_disc_expiry||job.licence_disc_expiry;
                  const expired = new Date(exp)<new Date();
                  return (
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <div style={{fontWeight:700,fontSize:13,color:expired?"var(--red)":"var(--green)"}}>
                        {exp} {expired?`⚠️ ${t.wsExpired}`:"✅"}
                      </div>
                      {onSaveWsLicenceRenewal&&(
                        <button onClick={()=>setRenewalModal(true)}
                          style={{fontSize:11,padding:"4px 12px",background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.4)",borderRadius:12,cursor:"pointer",color:"#16a34a",fontWeight:600,whiteSpace:"nowrap"}}>
                          🪪 {t.wsRequestRenewal}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* VIN + Search tools */}
          {job.vin&&(
            <div style={{borderTop:"1px solid var(--border)",paddingTop:12}}>
              <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>🔍 {t.wsVinSearch}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                <code style={{fontFamily:"DM Mono,monospace",fontSize:14,fontWeight:700,letterSpacing:"1px",background:"var(--surface2)",padding:"5px 12px",borderRadius:7,border:"1px solid var(--border)"}}>{job.vin}</code>
                <button onClick={()=>navigator.clipboard.writeText(job.vin).then(()=>alert("VIN copied!"))}
                  style={{fontSize:11,padding:"4px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",color:"var(--text3)"}}>📋 {t.wsCopy}</button>
              </div>
              {(()=>{
                const d=decodeVin(job.vin);
                if(!d) return null;
                const fields=[
                  {k:'Year',   v:d.year},
                  {k:'Origin', v:d.country},
                  {k:'Make',   v:d.make},
                  d.model ? {k:'Model', v:d.model} : null,
                  d.plant ? {k:'Plant', v:d.plant} : null,
                ].filter(Boolean);
                return (
                  <div style={{marginBottom:10,padding:"8px 12px",background:"var(--surface2)",borderRadius:8,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>📡 VIN Decoded</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {fields.map(f=>(
                        <div key={f.k} style={{fontSize:11,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 9px",lineHeight:1.5}}>
                          <span style={{color:"var(--text3)",marginRight:4}}>{f.k}:</span>
                          <span style={{fontWeight:700,color:"var(--text1)"}}>{f.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {vinSearchLinks.map(lk=>(
                  <a key={lk.label} href={lk.href} target="_blank" rel="noopener noreferrer"
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                      background:lk.bg,border:`1px solid ${lk.color}44`,borderRadius:10,
                      color:lk.color,textDecoration:"none",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                    <span style={{fontSize:20}}>{lk.icon}</span>
                    <span>{lk.label}</span>
                  </a>
                ))}
                <button onClick={()=>{navigator.clipboard.writeText(job.vin);window.open(`https://www.autozoneonline.co.za/t/index?q=${encodeURIComponent(job.vin)}`,"_blank");}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                    background:"rgba(220,38,38,.12)",border:"1px solid rgba(220,38,38,.3)",borderRadius:10,
                    color:"#dc2626",cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:20}}>🔴</span>
                  <span>AutoZone</span>
                </button>
                <button onClick={()=>{navigator.clipboard.writeText(job.vin);window.open("https://www.amayama.com","_blank");}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                    background:"rgba(14,165,233,.12)",border:"1px solid rgba(14,165,233,.3)",borderRadius:10,
                    color:"#0ea5e9",cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:20}}>🔧</span>
                  <span>Amayama 📋</span>
                </button>
                <button onClick={()=>{navigator.clipboard.writeText(job.vin);alert(`VIN copied!\n\nPaste it into WolfOil's VIN field.`);window.open("https://za.wolfoil.com/en-us/oil-finder","_blank");}}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",
                    background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.3)",borderRadius:10,
                    color:"#f97316",cursor:"pointer",fontSize:11,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:20}}>🛢️</span>
                  <span>WolfOil</span>
                </button>
              </div>
              {/* OE Number search */}
              <div style={{marginTop:12,borderTop:"1px solid var(--border)",paddingTop:10}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>🔎 {t.wsOeSearch}</div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{flex:1,position:"relative",display:"flex",alignItems:"center"}}>
                    <input
                      value={oeSearch} onChange={e=>setOeSearch(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&oeSearch.trim()) window.open(`https://partsfinder.goldwagen.com/partsfinder?stext=${encodeURIComponent(oeSearch.trim())}`, "_blank"); }}
                      placeholder="Enter OE / part number…"
                      style={{width:"100%",fontFamily:"DM Mono,monospace",fontSize:13,padding:"6px 30px 6px 10px",borderRadius:7,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)",outline:"none",boxSizing:"border-box"}}/>
                    {oeSearch&&(
                      <button onClick={()=>setOeSearch("")}
                        style={{position:"absolute",right:6,background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:14,lineHeight:1,padding:0}}>✕</button>
                    )}
                  </div>
                  <button
                    onClick={()=>{ if(oeSearch.trim()) window.open(`https://partsfinder.goldwagen.com/partsfinder?stext=${encodeURIComponent(oeSearch.trim())}`, "_blank"); }}
                    disabled={!oeSearch.trim()}
                    style={{padding:"6px 14px",borderRadius:7,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:12,cursor:oeSearch.trim()?"pointer":"default",opacity:oeSearch.trim()?1:.45}}>
                    Search
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Photo lightbox */}
      {photoLightbox!==null&&(()=>{
        const visiblePhotos=[
          {url:vehiclePhotos.front,label:"Front"},
          {url:vehiclePhotos.rear, label:"Rear"},
          {url:vehiclePhotos.side, label:"Side"},
        ].filter(p=>p.url);
        const idx=((photoLightbox%visiblePhotos.length)+visiblePhotos.length)%visiblePhotos.length;
        const photo=visiblePhotos[idx];
        const canNav=visiblePhotos.length>1;
        return(
          <div onClick={()=>setPhotoLightbox(null)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {/* Close */}
            <button onClick={e=>{e.stopPropagation();setPhotoLightbox(null);}}
              style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,fontSize:20,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            {/* Prev arrow */}
            {canNav&&<button onClick={e=>{e.stopPropagation();setPhotoLightbox(idx-1);}}
              style={{position:"absolute",left:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:48,height:48,fontSize:24,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>}
            {/* Image */}
            <div onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"85vh",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
              <img src={photo.url} alt={photo.label} style={{maxWidth:"90vw",maxHeight:"78vh",objectFit:"contain",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,.6)"}}/>
              <div style={{color:"#fff",fontWeight:700,fontSize:14,letterSpacing:".05em"}}>{photo.label} <span style={{opacity:.5,fontWeight:400,fontSize:12}}>{idx+1} / {visiblePhotos.length}</span></div>
            </div>
            {/* Next arrow */}
            {canNav&&<button onClick={e=>{e.stopPropagation();setPhotoLightbox(idx+1);}}
              style={{position:"absolute",right:16,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:48,height:48,fontSize:24,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>}
          </div>
        );
      })()}

      {/* ══ INSPECTION tab ══ */}
      {jobTab==="inspect"&&(
        <div className="card" style={{overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"12px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:14}}>✅ Check-in Inspection</div>
            {checklistLoaded&&(
              <span style={{fontSize:12,color:"var(--text3)"}}>
                {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length} OK ·{" "}
                {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length} Issues
              </span>
            )}
          </div>
          {!checklistLoaded?(
            <div style={{padding:24,textAlign:"center",color:"var(--text3)",fontSize:13}}>Loading checklist...</div>
          ):(
            <>
              {CHECKLIST_ITEMS.map(item=>{
                const cl=checklist[item.key]||{status:"pending",note:"",photo_url:""};
                return(
                  <div key={item.key} style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:16,width:22}}>{item.icon}</span>
                      <span style={{fontSize:13,fontWeight:600,flex:1,minWidth:120}}>{item.label}</span>
                      <div style={{display:"flex",gap:4}}>
                        {[{v:"ok",label:"✓ OK",bg:"rgba(34,197,94,.15)",col:"#22c55e",bdr:"rgba(34,197,94,.4)"},
                          {v:"issue",label:"✗ Issue",bg:"rgba(239,68,68,.15)",col:"#ef4444",bdr:"rgba(239,68,68,.4)"},
                          {v:"na",label:"N/A",bg:"rgba(148,163,184,.1)",col:"#94a3b8",bdr:"rgba(148,163,184,.3)"}
                        ].map(s=>(
                          <button key={s.v} onClick={()=>saveChecklistItem(item.key,{status:s.v})}
                            style={{fontSize:11,padding:"3px 8px",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap",fontWeight:cl.status===s.v?700:400,
                              background:cl.status===s.v?s.bg:"transparent",
                              color:cl.status===s.v?s.col:"var(--text3)",
                              border:`1px solid ${cl.status===s.v?s.bdr:"var(--border)"}`}}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <button onClick={()=>clCamRefs.current[item.key]?.click()}
                        style={{fontSize:11,padding:"3px 8px",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap",
                          background:cl.photo_url?"rgba(96,165,250,.15)":"transparent",
                          color:cl.photo_url?"var(--blue)":"var(--text3)",
                          border:`1px solid ${cl.photo_url?"rgba(96,165,250,.3)":"var(--border)"}`}}>
                        {clUploading[item.key]?"⏳":cl.photo_url?"📷 ✓":"📷"}
                      </button>
                      <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                        ref={el=>clCamRefs.current[item.key]=el}
                        onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;const fr=new FileReader();fr.onload=ev=>uploadChecklistPhoto(item.key,ev.target.result);fr.readAsDataURL(file);}}/>
                      {cl.photo_url&&(
                        <img src={toImgUrl(cl.photo_url)} alt="check" onClick={()=>setViewPhoto(cl.photo_url)}
                          style={{width:34,height:34,objectFit:"cover",borderRadius:5,cursor:"pointer",border:"1px solid var(--border)"}}
                          onError={e=>{const m=cl.photo_url.match(/thumbnail[?]id=([^&]+)/)||cl.photo_url.match(/[?&]id=([^&]+)/)||cl.photo_url.match(/file\/d\/([^/?]+)/);if(m&&!e.target.src.includes("uc?export=view")){console.log("[CL Photo] Thumbnail failed, retrying with uc?export=view",m[1]);e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;} else {console.warn("[CL Photo] Both thumbnail and uc?export=view failed or no Drive ID found");e.target.style.display="none";}}}/>
                      )}
                    </div>
                    <input className="inp" placeholder="Note (optional)..." value={cl.note}
                      onChange={e=>setChecklist(p=>({...p,[item.key]:{...cl,note:e.target.value}}))}
                      onBlur={e=>{if(e.target.value!==(checklist[item.key]?.note||""))saveChecklistItem(item.key,{note:e.target.value});else if(cl.status!=="pending"||cl.note)saveChecklistItem(item.key,{note:e.target.value});}}
                      style={{fontSize:12,padding:"4px 8px"}}/>
                  </div>
                );
              })}
              <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"var(--text3)",flexWrap:"wrap",gap:8}}>
                <span>{CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length} OK · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length} Issues · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="na").length} N/A · {CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="pending").length} Pending</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>printChecklistReport(job,checklist,settings)}>🖨️ Print Report</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ PHOTOS tab ══ */}
      {jobTab==="photos"&&(
        <div className="card" style={{padding:14,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14}}>
              📷 Photos {savedPhotos.length>0&&<span style={{fontSize:12,fontWeight:400,color:"var(--text3)",marginLeft:6}}>{savedPhotos.length} saved</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>jobPhotoCamRef.current?.click()}>📷 Camera</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>jobPhotoGalRef.current?.click()}>🖼️ Gallery</button>
              <button className="btn btn-ghost btn-sm" onClick={pasteJobPhoto}>📋 Paste</button>
            </div>
            <input ref={jobPhotoCamRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleJobPhotoFile}/>
            <input ref={jobPhotoGalRef} type="file" multiple style={{display:"none"}} onChange={handleJobPhotoFile}/>
          </div>
          {loadingPhotos?(
            <div style={{textAlign:"center",padding:"24px 0",color:"var(--text3)",fontSize:12}}>Loading photos...</div>
          ):(savedPhotos.length===0&&uploadPhotos.length===0)?(
            <div style={{textAlign:"center",padding:"32px 0",color:"var(--text3)",fontSize:13}}>No photos yet — tap Camera, Gallery or Paste</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
              {savedPhotos.map(p=>{
                const src=p.url?.includes("thumbnail?id=")||p.url?.includes("uc?export=")?p.url:toImgUrl(p.url);
                return (
                  <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3",cursor:"pointer"}} onClick={()=>setViewPhoto(p.url)}>
                    <img src={src} alt="photo" style={{width:"100%",height:"100%",objectFit:"cover"}}
                      onError={e=>{const m=p.url?.match(/thumbnail[?]id=([^&]+)/)||p.url?.match(/[?&]id=([^&]+)/)||p.url?.match(/file\/d\/([^/?]+)/);if(m&&!e.target.src.includes("uc?export=view"))e.target.src=`https://drive.google.com/uc?export=view&id=${m[1]}`;}}/>
                    <button onClick={e=>{e.stopPropagation();deleteJobPhoto(p.id);}}
                      style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.55)",border:"none",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",fontSize:10}}>✕</button>
                  </div>
                );
              })}
              {uploadPhotos.map(p=>(
                <div key={p.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:"var(--surface2)",aspectRatio:"4/3"}}>
                  <img src={p.dataUrl} alt="uploading" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:p.status==="done"?"transparent":p.status==="error"?"rgba(180,0,0,.5)":"rgba(0,0,0,.45)"}}>
                    {(p.status==="pending"||p.status==="uploading")&&<div style={{width:20,height:20,border:"2px solid rgba(255,255,255,.3)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>}
                    {p.status==="done"&&<div style={{position:"absolute",top:3,right:5,fontSize:14}}>✅</div>}
                    {p.status==="error"&&<div style={{fontSize:9,color:"#fff",textAlign:"center",padding:3}}>❌ {(p.error||"").slice(0,25)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ PHOTO LIGHTBOX (global) ══ */}
      {viewPhoto&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setViewPhoto(null)}>
          <img src={toImgUrl(viewPhoto)} alt="preview" style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
          <button style={{position:"absolute",top:16,right:20,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,fontSize:18,cursor:"pointer"}} onClick={()=>setViewPhoto(null)}>✕</button>
          <a href={viewPhoto} target="_blank" rel="noreferrer" style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",background:"rgba(255,255,255,.15)",color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,textDecoration:"none"}} onClick={e=>e.stopPropagation()}>Open in Drive ↗</a>
        </div>
      )}

      {/* ══ DOCUMENTS tab ══ */}
      {jobTab==="docs"&&(
        <div className="card" style={{padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📎 Documents ({jobDocs.length})</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:jobDocs.length>0?12:0}}>
            <input ref={docFileRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={handleDocFile}/>
            <button className="btn btn-ghost btn-sm" onClick={()=>docFileRef.current?.click()}>📂 {docFile?docFile.name:"Choose File"}</button>
            <input className="inp" style={{flex:1,minWidth:120,height:34,fontSize:13}} value={docName} onChange={e=>setDocName(e.target.value)} placeholder="Document name"/>
            <input className="inp" style={{flex:1,minWidth:100,height:34,fontSize:13}} value={docNotes} onChange={e=>setDocNotes(e.target.value)} placeholder="Notes (optional)"/>
            <button className="btn btn-primary btn-sm" onClick={uploadJobDoc} disabled={docUploading||!docFile}>{docUploading?"⏳ Uploading...":"⬆️ Upload"}</button>
          </div>
          {docPreview&&<div style={{marginBottom:8}}><img src={docPreview} alt="preview" style={{maxHeight:100,borderRadius:6,border:"1px solid var(--border)"}}/></div>}
          {jobDocs.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {jobDocs.map(d=>{
                const isPdf=d.file_type==="pdf"||(d.mime_type||"").includes("pdf");
                const isEditing=editDocId===d.id;
                return (
                  <div key={d.id} style={{padding:"7px 10px",background:"var(--surface2)",borderRadius:8}}>
                    {isEditing?(
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <input className="inp" style={{flex:2,minWidth:120,height:30,fontSize:13}} value={editDocVal.name} onChange={e=>setEditDocVal(v=>({...v,name:e.target.value}))} placeholder="Name"/>
                        <input className="inp" style={{flex:2,minWidth:100,height:30,fontSize:13}} value={editDocVal.notes} onChange={e=>setEditDocVal(v=>({...v,notes:e.target.value}))} placeholder="Notes"/>
                        <button className="btn btn-primary btn-xs" onClick={saveDocEdit}>✅</button>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setEditDocId(null)}>✕</button>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:20,flexShrink:0}}>{isPdf?"📄":"🖼️"}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                          {d.notes&&<div style={{fontSize:11,color:"var(--text3)"}}>{d.notes}</div>}
                        </div>
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:"none"}}>{isPdf?"📄 Open":"🔍 View"}</a>
                        {!isPdf&&<button className="btn btn-ghost btn-xs" onClick={()=>setViewDocImg(d.file_url)}>🖼️</button>}
                        <button className="btn btn-ghost btn-xs" onClick={()=>{setEditDocId(d.id);setEditDocVal({name:d.name||"",notes:d.notes||""});}}>✏️</button>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{if(window.confirm("Delete this document?"))deleteJobDoc(d.id);}}>🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {viewDocImg&&(
            <div onClick={()=>setViewDocImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <img src={viewDocImg} alt="doc" style={{maxWidth:"92vw",maxHeight:"90vh",borderRadius:10}}/>
            </div>
          )}
        </div>
      )}

      {/* ══ QUOTE tab ══ */}
      {jobTab==="quote"&&wsRole!=="mechanic"&&(<>
        {/* Parts & Labour */}
        {(()=>{
          const defaultMarkup = +(wsProfile?.default_markup_pct||0);
          const commitPrice = async (item) => {
            const newPrice = +editPriceVal;
            if (!isNaN(newPrice) && newPrice !== +item.unit_price) {
              const costP = +(item.cost_price||0);
              const newMarkup = costP > 0 ? +((newPrice/costP - 1)*100).toFixed(1) : +(item.markup_pct||0);
              await onSaveItem({...item, unit_price: newPrice, markup_pct: newMarkup, total: newPrice * (+item.qty||1)});
            }
            setEditPriceId(null);
          };
          const commitMarkup = async (item) => {
            const markup = +editMarkupVal;
            if (!isNaN(markup) && markup !== +(item.markup_pct||0)) {
              const costP = +(item.cost_price||0);
              const newPrice = costP > 0 ? +(costP * (1 + markup/100)).toFixed(2) : +(item.unit_price||0);
              await onSaveItem({...item, markup_pct: markup, unit_price: newPrice, total: newPrice * (+item.qty||1)});
            }
            setEditMarkupId(null);
          };
          const commitQty = async (item) => {
            const newQty = Math.max(1, Math.round(+editQtyVal||1));
            if (newQty !== +item.qty) {
              await onSaveItem({...item, qty: newQty, total: (+item.unit_price||0) * newQty});
            }
            setEditQtyId(null);
          };

          // Build supplier cost lookup: description (lowercase) → [{name, price}]
          const jobSupQts = wsSupplierQuotes.filter(q=>q.job_id===job.id);
          const supCostMap = {};
          jobSupQts.forEach(sq=>{
            const lines = (() => { try { return JSON.parse(sq.line_items||"[]"); } catch { return []; } })();
            lines.forEach(l=>{
              const key = (l.name||"").toLowerCase().trim();
              if (!supCostMap[key]) supCostMap[key] = [];
              const displayPrice = +(l.vat_incl_price||l.price)||0;
              if (displayPrice > 0) supCostMap[key].push({name: sq.supplier_name||"Supplier", price: displayPrice});
            });
          });
          // Also include prices from digital supplier replies
          sqReplies.forEach(rep=>{
            const req = wsSupplierRequests.find(r=>r.id===rep.request_id);
            const supName = req?.supplier_name||"Supplier";
            const replyItems = (() => { try { return JSON.parse(rep.items||"[]"); } catch { return []; } })();
            replyItems.forEach(ri=>{
              if(ri.condition==="no_stock") return;
              const key=(ri.description||"").toLowerCase().trim();
              if(!supCostMap[key]) supCostMap[key]=[];
              const price=+ri.price||0;
              if(price>0) supCostMap[key].push({name:supName,price});
            });
          });
          const getSupCosts = (desc) => supCostMap[(desc||"").toLowerCase().trim()] || [];

          return (<>
        {/* ── VIN & Search tools ── */}
        {job.vin&&(
          <div style={{marginBottom:12,padding:"10px 12px",background:"var(--surface2)",borderRadius:10,border:"1px solid var(--border)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <div style={{fontSize:10,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>🔍 VIN</div>
              <code style={{fontFamily:"DM Mono,monospace",fontSize:13,fontWeight:700,letterSpacing:"1px",background:"var(--surface)",padding:"3px 10px",borderRadius:6,border:"1px solid var(--border)",flex:1}}>{job.vin}</code>
              <button onClick={()=>navigator.clipboard.writeText(job.vin).then(()=>alert("VIN copied!"))}
                style={{fontSize:11,padding:"3px 8px",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,cursor:"pointer",color:"var(--text3)",flexShrink:0}}>📋</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {vinSearchLinks.slice(0,4).map(lk=>(
                <a key={lk.label} href={lk.href} target="_blank" rel="noopener noreferrer"
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",
                    background:lk.bg,border:`1px solid ${lk.color}44`,borderRadius:8,
                    color:lk.color,textDecoration:"none",fontSize:10,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                  <span style={{fontSize:18}}>{lk.icon}</span>
                  <span>{lk.label}</span>
                </a>
              ))}
              <button onClick={()=>{navigator.clipboard.writeText(job.vin);window.open(`https://www.autozoneonline.co.za/t/index?q=${encodeURIComponent(job.vin)}`,"_blank");}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",
                  background:"rgba(220,38,38,.12)",border:"1px solid rgba(220,38,38,.3)",borderRadius:8,
                  color:"#dc2626",cursor:"pointer",fontSize:10,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                <span style={{fontSize:18}}>🔴</span><span>AutoZone</span>
              </button>
              <button onClick={()=>{navigator.clipboard.writeText(job.vin);window.open("https://www.amayama.com","_blank");}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",
                  background:"rgba(14,165,233,.12)",border:"1px solid rgba(14,165,233,.3)",borderRadius:8,
                  color:"#0ea5e9",cursor:"pointer",fontSize:10,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                <span style={{fontSize:18}}>🔧</span><span>Amayama</span>
              </button>
              <button onClick={()=>{navigator.clipboard.writeText(job.vin);alert(`VIN copied!\n\nPaste it into WolfOil's VIN field.`);window.open("https://za.wolfoil.com/en-us/oil-finder","_blank");}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"8px 4px",
                  background:"rgba(249,115,22,.12)",border:"1px solid rgba(249,115,22,.3)",borderRadius:8,
                  color:"#f97316",cursor:"pointer",fontSize:10,fontWeight:600,textAlign:"center",lineHeight:1.3}}>
                <span style={{fontSize:18}}>🛢️</span><span>WolfOil</span>
              </button>
            </div>
          </div>
        )}
        {/* ── Complaint & Notes summary ── */}
        {(job.complaint||job.notes)&&(
          <div style={{marginBottom:12,display:"flex",flexDirection:"column",gap:6}}>
            {job.complaint&&(
              <div style={{borderRadius:8,overflow:"hidden",border:"2px solid #ef4444"}}>
                <div style={{background:"#ef4444",padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12}}>⚠️</span>
                  <span style={{fontSize:10,fontWeight:800,color:"#fff",textTransform:"uppercase",letterSpacing:".07em"}}>Customer Complaint</span>
                </div>
                <div style={{padding:"8px 10px",background:"var(--surface2)",fontSize:13,fontWeight:600,color:"var(--text)",lineHeight:1.5}}>{job.complaint}</div>
              </div>
            )}
            {job.notes&&(
              <div style={{padding:"8px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>📝 Notes</div>
                <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>{job.notes}</div>
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:14}}>🔧 {t.wsqtPartsLabour}</div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("part")}>+ {t.wsqtPart}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("labour")}>+ {t.wsqtLabour}</button>
          </div>
        </div>
        <div className="card" style={{overflow:"hidden",marginBottom:14}}>
          {items.length===0
            ?<div style={{textAlign:"center",padding:24,color:"var(--text3)"}}>{t.wsqtNoItems}</div>
            : isMobile ? (
              /* ── Mobile card list ── */
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {items.map((item,idx)=>{
                  const supCosts=getSupCosts(item.description);
                  const isEditingPrice=editPriceId===item.id;
                  const isEditingQty=editQtyId===item.id;
                  const isEditing=isEditingPrice; // keep alias for price block
                  const displayQty=isEditingQty?(+editQtyVal||1):(+item.qty||1);
                  const rowTotal=isEditingPrice?(+editPriceVal||0)*displayQty:isEditingQty?(+item.unit_price||0)*displayQty:+item.total||0;
                  return (
                    <div key={item.id} style={{padding:"12px 14px",borderBottom:idx<items.length-1?"1px solid var(--border)":undefined}}>
                      {/* Top row: badge + name + delete */}
                      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                        <span className="badge" style={{flexShrink:0,background:item.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:item.type==="part"?"var(--blue)":"var(--green)",fontSize:11}}>
                          {item.type==="part"?`🔩 ${t.wsqtPart}`:`👷 ${t.wsqtLabour}`}
                        </span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,lineHeight:1.3}}>{item.description}</div>
                          {item.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{item.part_sku}</code>}
                        </div>
                        <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",flexShrink:0}} onClick={()=>onDeleteItem(item.id)}>🗑</button>
                      </div>
                      {/* Supplier cost badges */}
                      {supCosts.length>0&&(
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                          {supCosts.map((sc,i)=>{
                            const sellP = +(sc.price*(1+defaultMarkup/100)).toFixed(2);
                            return (
                            <span key={i} onClick={async()=>{
                                await onSaveItem({...item, cost_price:sc.price, markup_pct:defaultMarkup, unit_price:sellP, total:sellP*(+item.qty||1)});
                              }}
                              title={defaultMarkup>0?`Cost ${fmtAmt(sc.price)} + ${defaultMarkup}% = ${fmtAmt(sellP)}`:"Click to set cost price"}
                              style={{fontSize:11,color:"#f59e0b",fontWeight:600,cursor:"pointer",background:"rgba(251,191,36,.1)",borderRadius:4,padding:"2px 8px",border:"1px solid rgba(251,191,36,.25)"}}>
                              💰 {sc.name}: {fmtAmt(sc.price)}
                            </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Qty × Price = Total row */}
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",background:"var(--surface2)",borderRadius:item.type==="part"?"8px 8px 0 0":"8px",padding:"8px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={{fontSize:11,color:"var(--text3)",fontWeight:600}}>{t.qty}</span>
                          {isEditingQty
                            ? <input autoFocus type="number" min="1" step="1"
                                value={editQtyVal}
                                onChange={e=>setEditQtyVal(e.target.value)}
                                onBlur={()=>commitQty(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitQty(item); if(e.key==="Escape") setEditQtyId(null); }}
                                style={{width:52,textAlign:"center",fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditQtyId(item.id); setEditQtyVal(String(item.qty||1)); setEditPriceId(null); }}
                                style={{fontWeight:700,fontSize:15,cursor:"pointer",borderBottom:"1px dashed var(--text3)",color:"var(--text)"}}>
                                {item.qty}
                              </span>
                          }
                        </div>
                        <span style={{color:"var(--text3)"}}>×</span>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <span style={{fontSize:11,color:"var(--text3)",fontWeight:600}}>{t.wsqtPrice}</span>
                          {isEditingPrice
                            ? <input autoFocus type="number" min="0" step="0.01"
                                value={editPriceVal}
                                onChange={e=>setEditPriceVal(e.target.value)}
                                onBlur={()=>commitPrice(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitPrice(item); if(e.key==="Escape") setEditPriceId(null); }}
                                style={{width:80,fontFamily:"Rajdhani,sans-serif",fontSize:14,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditPriceId(item.id); setEditPriceVal(String(item.unit_price||0)); setEditQtyId(null); setEditMarkupId(null); }}
                                style={{fontWeight:700,fontSize:15,fontFamily:"Rajdhani,sans-serif",cursor:"pointer",borderBottom:"1px dashed var(--text3)",color:"var(--text)"}}>
                                {fmtAmt(item.unit_price)}
                              </span>
                          }
                        </div>
                        <span style={{color:"var(--text3)"}}>=</span>
                        <span style={{fontWeight:700,fontSize:16,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginLeft:"auto"}}>
                          {fmtAmt(rowTotal)}
                        </span>
                      </div>
                      {/* Cost / Markup row (parts only) */}
                      {item.type==="part"&&(
                        <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(251,191,36,.07)",borderRadius:"0 0 8px 8px",padding:"5px 10px",borderTop:"1px solid rgba(251,191,36,.15)"}}>
                          {+(item.cost_price||0)>0&&<>
                            <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,flexShrink:0}}>{t.wsqtCost}</span>
                            <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:12,color:"var(--text2)",flexShrink:0}}>{fmtAmt(item.cost_price)}</span>
                            <span style={{fontSize:10,color:"var(--text3)"}}>·</span>
                          </>}
                          <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,flexShrink:0}}>{t.wsqtMarkup}</span>
                          {editMarkupId===item.id
                            ? <input autoFocus type="number" min="0" step="0.1"
                                value={editMarkupVal}
                                onChange={e=>setEditMarkupVal(e.target.value)}
                                onBlur={()=>commitMarkup(item)}
                                onKeyDown={e=>{ if(e.key==="Enter") commitMarkup(item); if(e.key==="Escape") setEditMarkupId(null); }}
                                style={{width:56,fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 5px",borderRadius:5,border:"1px solid #f59e0b",background:"var(--surface2)",color:"var(--text1)"}}/>
                            : <span onClick={()=>{ setEditMarkupId(item.id); setEditMarkupVal(String(item.markup_pct||0)); setEditPriceId(null); setEditQtyId(null); }}
                                style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",color:"#f59e0b",borderBottom:"1px dashed rgba(251,191,36,.4)"}}>
                                {item.markup_pct||0}%
                              </span>
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Desktop table ── */
              <table className="tbl" style={{width:"100%"}}>
                <thead><tr>{[t.wsqtType,t.wsqPdfDescription,t.qty,t.unitPrice,t.total,""].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map(item=>{
                    const supCosts = getSupCosts(item.description);
                    const isEditing = editPriceId === item.id;
                    return (
                    <tr key={item.id}>
                      <td><span className="badge" style={{background:item.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:item.type==="part"?"var(--blue)":"var(--green)"}}>{item.type==="part"?`🔩 ${t.wsqtPart}`:`👷 ${t.wsqtLabour}`}</span></td>
                      <td style={{fontWeight:500}}>
                        {item.description}{item.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:8}}>{item.part_sku}</code>}
                        {supCosts.length>0&&(
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:3}}>
                            {supCosts.map((sc,i)=>{
                              const sellP=+(sc.price*(1+defaultMarkup/100)).toFixed(2);
                              return (
                              <span key={i} title={defaultMarkup>0?`Cost ${fmtAmt(sc.price)} + ${defaultMarkup}% = ${fmtAmt(sellP)}`:"Click to set cost price"}
                                onClick={async()=>{ await onSaveItem({...item, cost_price:sc.price, markup_pct:defaultMarkup, unit_price:sellP, total:sellP*(+item.qty||1)}); }}
                                style={{fontSize:10,color:"#f59e0b",fontWeight:600,cursor:"pointer",background:"rgba(251,191,36,.1)",borderRadius:4,padding:"1px 6px",border:"1px solid rgba(251,191,36,.25)"}}>
                                💰 {sc.name}: {fmtAmt(sc.price)}
                              </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{textAlign:"right"}}>
                        {editQtyId===item.id
                          ? <input autoFocus type="number" min="1" step="1"
                              value={editQtyVal}
                              onChange={e=>setEditQtyVal(e.target.value)}
                              onBlur={()=>commitQty(item)}
                              onKeyDown={e=>{ if(e.key==="Enter") commitQty(item); if(e.key==="Escape") setEditQtyId(null); }}
                              style={{width:52,textAlign:"center",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)"}}/>
                          : <span onClick={()=>{ setEditQtyId(item.id); setEditQtyVal(String(item.qty||1)); setEditPriceId(null); }}
                              title="Click to edit qty"
                              style={{cursor:"pointer",borderBottom:"1px dashed var(--text3)",paddingBottom:1}}>
                              {item.qty}
                            </span>
                        }
                      </td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",minWidth:110}}>
                        {isEditing
                          ? <input autoFocus type="number" min="0" step="0.01"
                              value={editPriceVal}
                              onChange={e=>setEditPriceVal(e.target.value)}
                              onBlur={()=>commitPrice(item)}
                              onKeyDown={e=>{ if(e.key==="Enter") commitPrice(item); if(e.key==="Escape") setEditPriceId(null); }}
                              style={{width:90,textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:13,fontWeight:700,padding:"2px 6px",borderRadius:6,border:"1px solid var(--accent)",background:"var(--surface2)"}}/>
                          : <span onClick={()=>{ setEditPriceId(item.id); setEditPriceVal(String(item.unit_price||0)); setEditMarkupId(null); }}
                              title="Click to edit price"
                              style={{cursor:"pointer",borderBottom:"1px dashed var(--text3)",paddingBottom:1}}>
                              {fmtAmt(item.unit_price)}
                            </span>
                        }
                        {item.type==="part"&&(
                          <div style={{fontSize:10,color:"var(--text3)",marginTop:2,textAlign:"right",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                            {+(item.cost_price||0)>0&&<span style={{color:"var(--text3)"}}>Cost {fmtAmt(item.cost_price)} ·</span>}
                            {editMarkupId===item.id
                              ? <input autoFocus type="number" min="0" step="0.1"
                                  value={editMarkupVal}
                                  onChange={e=>setEditMarkupVal(e.target.value)}
                                  onBlur={()=>commitMarkup(item)}
                                  onKeyDown={e=>{ if(e.key==="Enter") commitMarkup(item); if(e.key==="Escape") setEditMarkupId(null); }}
                                  style={{width:50,textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontSize:11,padding:"1px 4px",borderRadius:4,border:"1px solid #f59e0b",background:"var(--surface2)",color:"#f59e0b"}}/>
                              : <span onClick={()=>{ setEditMarkupId(item.id); setEditMarkupVal(String(item.markup_pct||0)); setEditPriceId(null); }}
                                  title="Click to edit markup %"
                                  style={{cursor:"pointer",color:"#f59e0b",fontWeight:600,borderBottom:"1px dashed rgba(251,191,36,.4)"}}>
                                  +{item.markup_pct||0}%
                                </span>
                            }
                            <span>markup</span>
                          </div>
                        )}
                      </td>
                      <td style={{textAlign:"right",fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmtAmt(isEditing?(+editPriceVal||0)*(editQtyId===item.id?+editQtyVal||1:+item.qty||1):editQtyId===item.id?(+item.unit_price||0)*(+editQtyVal||1):item.total)}</td>
                      <td><button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>onDeleteItem(item.id)}>✕</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
          {/* ── Supplier quote requests + PO status ── */}
          {(()=>{
            const jobReqs=wsSupplierRequests.filter(r=>r.job_id===job.id);
            if(!jobReqs.length&&!wsPurchaseOrders.length) return null;
            const PO_C={draft:"var(--text3)",sent:"var(--blue)",partial:"var(--yellow)",received:"var(--green)",cancelled:"var(--red)"};
            const PO_BG={draft:"var(--surface3)",sent:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",received:"rgba(52,211,153,.12)",cancelled:"rgba(248,113,113,.12)"};
            return (
              <div style={{borderTop:"1px solid var(--border)",padding:"8px 16px",display:"flex",flexDirection:"column",gap:5}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>{t.wsqtSupplierQuotes}</div>
                {jobReqs.map(r=>{
                  const hasQuote=wsSupplierQuotes.find(q=>q.request_id===r.id);
                  const hasReply=sqReplies.find(rep=>rep.request_id===r.id);
                  const po=wsPurchaseOrders.find(p=>p.supplier_id&&r.supplier_id&&String(p.supplier_id)===String(r.supplier_id))||wsPurchaseOrders.find(p=>p.supplier_name===r.supplier_name);
                  return (
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                      <span style={{flex:1,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.supplier_name||r.supplier_phone||"Unknown"}</span>
                      {hasQuote
                        ? <span style={{fontSize:10,fontWeight:700,color:"var(--green)",background:"rgba(52,211,153,.1)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>✅ Quoted</span>
                        : hasReply
                          ? <span style={{fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.1)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>📲 App Reply</span>
                          : <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",background:"var(--surface3)",borderRadius:5,padding:"2px 7px",flexShrink:0}}>⏳ Pending</span>
                      }
                      {po&&(
                        <button onClick={()=>onViewPO?.(po.id)}
                          style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"2px 8px",border:"none",cursor:"pointer",background:PO_BG[po.status]||PO_BG.draft,color:PO_C[po.status]||PO_C.draft,flexShrink:0}}>
                          📋 PO · {po.status||"draft"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* POs not linked to a request (edge case) */}
                {wsPurchaseOrders.filter(po=>!jobReqs.some(r=>
                  (r.supplier_id&&String(po.supplier_id)===String(r.supplier_id))||(r.supplier_name===po.supplier_name)
                )).map(po=>(
                  <div key={po.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                    <span style={{flex:1,fontWeight:600}}>{po.supplier_name}</span>
                    <button onClick={()=>onViewPO?.(po.id)}
                      style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"2px 8px",border:"none",cursor:"pointer",background:PO_BG[po.status]||PO_BG.draft,color:PO_C[po.status]||PO_C.draft}}>
                      📋 PO · {po.status||"draft"}
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("part")}>+ {t.wsqtPart}</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setAddingItem("labour")}>+ {t.wsqtLabour}</button>
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366",borderColor:"rgba(37,211,102,.35)"}} onClick={()=>setSupplierModal(true)}>📤 {t.wsqtSendQuote}</button>
              {wsSupplierRequests.filter(r=>r.job_id===job.id).length>0&&<button className="btn btn-ghost btn-sm" style={{color:"#38bdf8",borderColor:"rgba(56,189,248,.35)"}} onClick={()=>setReturnQuoteOpen(true)}>↩️ {t.wsqtReturnQuote}</button>}
              {(wsSupplierQuotes.filter(q=>q.job_id===job.id).length>0||sqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===job.id)).length>0)&&(
                <button className="btn btn-ghost btn-sm" style={{color:"var(--accent)",borderColor:"rgba(251,146,60,.35)"}} onClick={()=>setCreatePoOpen(true)}>📦 {t.wsqtCreateOrder}</button>
              )}
            </div>
            {items.length>0&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{fontSize:13,color:"var(--text3)"}}>{t.subtotal}: <strong style={{color:"var(--text)",fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(subtotal)}</strong></div>
                {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmtAmt(tax)}</strong></div>}
                <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{t.total}: {fmtAmt(total)}</div>
              </div>
            )}
          </div>
        </div>
          </>);
        })()}
        {/* Quote */}
        {quote ? (
        <div className="card" style={{padding:14,marginBottom:14,borderLeft:`3px solid ${
          quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)"}`}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>📝 {t.wsqtQuotation} <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{quote.id}</code></div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                {quote.quote_date}{quote.valid_until&&` · ${t.wsqtValidUntil} ${quote.valid_until}`}
              </div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:3}}>{fmtAmt(quote.total)}</div>
            </div>
            <span className="badge" style={{
              background:quote.status==="accepted"?"rgba(52,211,153,.15)":quote.status==="declined"?"rgba(248,113,113,.15)":quote.status==="converted"?"rgba(100,116,139,.15)":"rgba(96,165,250,.15)",
              color:quote.status==="accepted"?"var(--green)":quote.status==="declined"?"var(--red)":quote.status==="converted"?"var(--text3)":"var(--blue)",
              fontSize:12,padding:"4px 10px"
            }}>
              {quote.status==="accepted"?"✅ "+t.wsqtAccepted:quote.status==="declined"?"❌ "+t.wsqtDeclined:quote.status==="converted"?"📄 "+t.wsqtConverted:"📤 "+quote.status.charAt(0).toUpperCase()+quote.status.slice(1)}
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
                  {quote.confirm_status==="confirmed"?t.wsqtCustApproved:t.wsqtCustDeclined}
                </div>
                {quote.confirmed_at&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{new Date(quote.confirmed_at).toLocaleString()}</div>}
                {quote.customer_note&&<div style={{fontSize:12,color:"var(--text2)",marginTop:3}}>💬 "{quote.customer_note}"</div>}
              </div>
            </div>
          )}
          {quote.confirm_status==="pending"&&(
            <div style={{marginBottom:10,padding:"8px 12px",borderRadius:8,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.3)",fontSize:12,color:"var(--yellow)"}}>
              ⏳ {t.wsqtAwaitingResponse}
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
            <button className="btn btn-ghost btn-sm" onClick={()=>printWorkshopQuote(job,items,quote,settings,vehiclePhotos)}>🖨️ {t.wsqtPrintPdf}</button>
            {quote.status!=="converted"&&onSendQuoteForApproval&&(
              <button className="btn btn-sm" style={{background:"rgba(37,211,102,.12)",color:"#25D366",border:"1px solid rgba(37,211,102,.3)"}}
                onClick={()=>setApprovalModal(true)}>
                🔗 {t.wsqtSendApproval}
              </button>
            )}
            {(quote.quote_phone||job.customer_phone)&&(
              <button className="btn btn-ghost btn-sm" style={{color:"#25D366"}} onClick={()=>{
                const phone=(quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
                const name=quote.quote_customer||job.customer_name||"";
                const C=curSym(settings.currency||getSettings().currency);
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
                const C=curSym(settings.currency||getSettings().currency);
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
                {quote.status==="accepted"?"↩ "+t.wsqtUnaccept:"✅ "+t.wsqtMarkAccepted}
              </button>
            )}
            {quote.status!=="converted"&&(
              <button className="btn btn-ghost btn-xs" onClick={()=>setQuoteModal(true)}>✏️ Edit</button>
            )}
            {!invoice&&quote.status==="accepted"&&(
              <button className="btn btn-primary btn-sm" onClick={()=>{ setQuoteSrcForInv(quote); setCreatingInv(true); }}>🧾 {t.wsqtConvertInv}</button>
            )}
            <button className="btn btn-ghost btn-xs" style={{color:"var(--red)",marginLeft:"auto"}}
              onClick={()=>setDeletingQuote(true)}>🗑️</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{width:"100%",padding:12,fontSize:14,fontWeight:600,marginBottom:14,border:"2px dashed var(--border)"}}
          onClick={()=>setQuoteModal(true)}>
          📝 Create Quotation for Customer
        </button>
      )}
      {quote&&(
        <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:8}}>
          {/* Step 1 — Done */}
          {!["Done","Delivered"].includes(job.status)&&(
            <button className="btn btn-success" style={{width:"100%",padding:11,fontSize:14,fontWeight:700}}
              onClick={()=>onSaveJob({...job,status:"Done"})}>
              ✅ Mark Job as Done
            </button>
          )}
          {/* Step 2 — Create Invoice (job done, no invoice yet) */}
          {["Done","Delivered"].includes(job.status)&&!invoice&&(
            <button className="btn btn-primary" style={{width:"100%",padding:11,fontSize:14,fontWeight:700}}
              onClick={()=>{ setQuoteSrcForInv(quote); setCreatingInv(true); }}>
              🧾 Create Invoice
            </button>
          )}
          {/* Step 3 — Payment (invoice exists and not fully paid) */}
          {invoice&&invoice.status!=="paid"&&(
            <button className="btn btn-success" style={{width:"100%",padding:11,fontSize:14,fontWeight:700}}
              onClick={()=>setPaymentModal(true)}>
              💳 Record Payment
            </button>
          )}
          {invoice&&invoice.status==="paid"&&(
            <div style={{textAlign:"center",padding:"10px",background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",borderRadius:8,fontSize:13,fontWeight:700,color:"var(--green)"}}>
              ✅ Fully Paid
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ══ INVOICE tab ══ */}
      {jobTab==="invoice"&&wsRole!=="mechanic"&&(<>
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
                const C=curSym(settings.currency||getSettings().currency);
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
                const C=curSym(settings.currency||getSettings().currency);
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
      ) : items.length>0&&wsRole!=="mechanic"&&(
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
      </>)}

      {/* Return Quote — supplier picker */}
      {returnQuoteOpen&&!returnQuoteTarget&&(()=>{
        const jobRequests=wsSupplierRequests.filter(r=>r.job_id===job.id);
        return(
          <Overlay onClose={()=>setReturnQuoteOpen(false)}>
            <MHead title="↩️ Return Quote — Select Supplier" onClose={()=>setReturnQuoteOpen(false)}/>
            <div style={{marginBottom:12,fontSize:13,color:"var(--text3)"}}>Choose which supplier is returning their quote:</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {jobRequests.map(r=>{
                const existing=wsSupplierQuotes.find(q=>q.request_id===r.id);
                // Fall back to digital reply to pre-fill prices when no manual quote exists
                const digReply=!existing?sqReplies.find(rep=>rep.request_id===r.id):null;
                const prefillFromReply=digReply?(()=>{
                  const parts=(() => { try{return JSON.parse(r.parts_list||"[]");}catch{return [];} })();
                  const repItems=(() => { try{return JSON.parse(digReply.items||"[]");}catch{return [];} })();
                  const lineItems=parts.map(pName=>{
                    const ri=repItems.find(ri=>(ri.description||"").toLowerCase()===pName.toLowerCase());
                    return {name:pName,price:ri&&ri.condition!=="no_stock"?String(ri.price||""):"",available:ri?ri.condition==="in_stock"?"In stock":ri.condition==="can_order"?"Can order":"No stock":""};
                  });
                  return {line_items:JSON.stringify(lineItems)};
                })():null;
                const resolved=existing||prefillFromReply||null;
                return(
                  <button key={r.id}
                    onClick={()=>setReturnQuoteTarget({request:r,existingQuote:resolved})}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",textAlign:"left",width:"100%"}}>
                    <span style={{fontSize:22,flexShrink:0}}>📲</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{r.supplier_name||r.supplier_phone||"Unknown supplier"}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{new Date(r.sent_at||r.created_at).toLocaleString()}</div>
                    </div>
                    {existing
                      ? <span style={{fontSize:11,fontWeight:700,color:"var(--green)",background:"rgba(52,211,153,.12)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>✅ Quoted</span>
                      : digReply
                        ? <span style={{fontSize:11,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>📲 App Reply</span>
                        : <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",background:"var(--surface3)",borderRadius:6,padding:"3px 8px",flexShrink:0}}>Pending</span>
                    }
                  </button>
                );
              })}
            </div>
            <button className="btn btn-ghost" style={{width:"100%",marginTop:14}} onClick={()=>setReturnQuoteOpen(false)}>Cancel</button>
          </Overlay>
        );
      })()}
      {/* Return Quote — price entry (reuses SupplierQuoteModal) */}
      {returnQuoteOpen&&returnQuoteTarget&&(
        <SupplierQuoteModal
          request={returnQuoteTarget.request}
          existingQuote={returnQuoteTarget.existingQuote}
          priceOnly
          settings={settings}
          onSave={async(d)=>{ if(onSaveWsSupplierQuote) await onSaveWsSupplierQuote(d); setReturnQuoteTarget(null); setReturnQuoteOpen(false); }}
          onClose={()=>setReturnQuoteTarget(null)}/>
      )}

      {/* Add item modal */}
      {addingItem&&(
        <WorkshopItemModal
          type={addingItem}
          wsStock={wsStock}
          wsServices={wsServices}
          existingItems={items}
          defaultMarkupPct={wsProfile?.default_markup_pct||0}
          onSave={async(item)=>{ await onSaveItem({...item,job_id:job.id}); }}
          onClose={()=>setAddingItem(null)}
          onGoToStock={onGoToStock}
          t={t}/>
      )}

      {/* Edit job modal */}
      {editJob&&(
        <WorkshopJobModal job={job} wsCustomers={wsCustomers} wsVehicles={wsVehicles} jobs={[]}
          onSave={async(d,onProgress)=>{ await onSaveJob(d,onProgress); setEditJob(false); }}
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
          wsSupplierQuotes={wsSupplierQuotes}
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
          vehiclePhotos={vehiclePhotos}
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

      {/* Move PIN prompt */}
      {movePinOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="card" style={{width:"100%",maxWidth:320,padding:24,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{fontWeight:700,fontSize:16,textAlign:"center"}}>🔒 Move Job — Enter PIN</div>
            <div style={{fontSize:13,color:"var(--text3)",textAlign:"center"}}>This action is restricted. Enter the Move PIN to continue.</div>
            <input className="inp" type="password" autoFocus value={movePinVal}
              onChange={e=>{setMovePinVal(e.target.value);setMovePinErr("");}}
              onKeyDown={e=>{ if(e.key==="Enter"){ if(movePinVal===wsProfile.move_pin){setMovePinOpen(false);setMoveModal(true);}else{setMovePinErr("Incorrect PIN");} } }}
              placeholder="Enter PIN" style={{textAlign:"center",fontSize:18,letterSpacing:4}}/>
            {movePinErr&&<div style={{color:"var(--red)",fontSize:13,textAlign:"center"}}>⚠ {movePinErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setMovePinOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={()=>{ if(movePinVal===wsProfile.move_pin){setMovePinOpen(false);setMoveModal(true);}else{setMovePinErr("Incorrect PIN");} }}>Unlock</button>
            </div>
          </div>
        </div>
      )}

      {moveModal&&(
        <MoveJobModal
          job={job}
          onMove={onMoveJob}
          onClose={()=>setMoveModal(false)}/>
      )}

      {/* Send to Supplier modal */}
      {supplierModal&&(
        <Overlay onClose={()=>setSupplierModal(false)}>
          <SupplierSendModal
            job={job} items={items} wsSuppliers={wsSuppliers} settings={settings}
            history={wsSupplierRequests.filter(r=>r.job_id===job.id)}
            quotes={wsSupplierQuotes.filter(q=>q.job_id===job.id)}
            sqReplies={sqReplies}
            onLogSend={onSaveWsSupplierRequest}
            onDeleteSend={onDeleteWsSupplierRequest}
            onSaveQuote={onSaveWsSupplierQuote}
            onSaveItem={onSaveItem}
            onSaveWsStock={onSaveWsStock}
            onGenerateLink={onGenerateWsQuoteLink}
            onCreatePO={onSaveWsPurchaseOrder?(poData)=>{onSaveWsPurchaseOrder(poData,poData.items||[]);setSupplierModal(false);if(onViewPurchaseOrders)onViewPurchaseOrders();}:undefined}
            onClose={()=>setSupplierModal(false)}/>
        </Overlay>
      )}

      {createPoOpen&&onSaveWsPurchaseOrder&&(
        <WsCreatePoFromJobModal
          job={job}
          wsSupplierQuotes={wsSupplierQuotes.filter(q=>q.job_id===job.id)}
          wsSupplierRequests={wsSupplierRequests}
          sqReplies={sqReplies.filter(r=>wsSupplierRequests.some(req=>req.id===r.request_id&&req.job_id===job.id))}
          wsSuppliers={wsSuppliers} settings={settings}
          onSave={onSaveWsPurchaseOrder}
          onViewPOs={onViewPurchaseOrders}
          onClose={()=>setCreatePoOpen(false)}/>
      )}

      {/* Licence Renewal modal */}
      {renewalModal&&onSaveWsLicenceRenewal&&(
        <LicenceRenewalModal
          job={job} vehicleRecord={vehicleRecord} settings={settings} wsId={wsId}
          onSave={async(rec)=>{ await onSaveWsLicenceRenewal(rec); setRenewalModal(false); }}
          onClose={()=>setRenewalModal(false)}/>
      )}

      {/* Service Record History modal */}
      {serviceHistModal&&(
        <Overlay onClose={()=>setServiceHistModal(false)} wide>
          <MHead title={`📋 Service Record — ${job.vehicle_reg||job.vehicle_make||"Vehicle"}`} onClose={()=>setServiceHistModal(false)}/>

          {/* Vehicle summary */}
          <div style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:10,marginBottom:14,fontSize:13,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontWeight:700}}>{job.vehicle_reg} — {[job.vehicle_make,job.vehicle_model,job.vehicle_year&&`(${job.vehicle_year})`].filter(Boolean).join(" ")}</div>
              {job.vin&&<div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace",marginTop:2}}>VIN: {job.vin}</div>}
            </div>
            {!addingPastRecord&&(
              <button className="btn btn-ghost btn-sm" onClick={()=>{
                setPastRec({date_in:new Date().toISOString().slice(0,10),date_out:"",mileage:"",complaint:"",diagnosis:"",mechanic:"",notes:""});
                setAddingPastRecord(true);
              }}>+ Add Past Record</button>
            )}
          </div>

          {/* Add past record form */}
          {addingPastRecord&&(
            <div style={{border:"1px solid var(--accent)",borderRadius:10,padding:14,marginBottom:14,background:"rgba(var(--accent-rgb),.04)"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📝 Add Manual Service Record</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>DATE IN *</div>
                  <input className="inp" type="date" value={pastRec.date_in} onChange={e=>setPastRec(p=>({...p,date_in:e.target.value}))}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>DATE OUT</div>
                  <input className="inp" type="date" value={pastRec.date_out} onChange={e=>setPastRec(p=>({...p,date_out:e.target.value}))}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>MILEAGE (km)</div>
                  <input className="inp" type="number" min="0" value={pastRec.mileage} onChange={e=>setPastRec(p=>({...p,mileage:e.target.value}))} placeholder="e.g. 85000"/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>MECHANIC</div>
                  <input className="inp" value={pastRec.mechanic} onChange={e=>setPastRec(p=>({...p,mechanic:e.target.value}))} placeholder="Name"/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>COMPLAINT / WORK DONE *</div>
                <textarea className="inp" rows={2} value={pastRec.complaint} onChange={e=>setPastRec(p=>({...p,complaint:e.target.value}))} placeholder="e.g. Oil service, brake pads replaced" style={{resize:"vertical"}}/>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>DIAGNOSIS / FINDINGS</div>
                <textarea className="inp" rows={2} value={pastRec.diagnosis} onChange={e=>setPastRec(p=>({...p,diagnosis:e.target.value}))} placeholder="Optional — what was found" style={{resize:"vertical"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,marginBottom:4}}>NOTES</div>
                <textarea className="inp" rows={2} value={pastRec.notes} onChange={e=>setPastRec(p=>({...p,notes:e.target.value}))} placeholder="Optional" style={{resize:"vertical"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setAddingPastRecord(false)}>Cancel</button>
                <button className="btn btn-primary" style={{flex:2}} disabled={savingPastRec||!pastRec.date_in||!pastRec.complaint.trim()} onClick={async()=>{
                  setSavingPastRec(true);
                  try{
                    await onSaveJob({
                      workshop_customer_id:job.workshop_customer_id||null,
                      workshop_vehicle_id:job.workshop_vehicle_id||null,
                      customer_name:job.customer_name||"",
                      customer_phone:job.customer_phone||"",
                      customer_email:job.customer_email||"",
                      vehicle_reg:job.vehicle_reg||"",
                      vehicle_make:job.vehicle_make||"",
                      vehicle_model:job.vehicle_model||"",
                      vehicle_year:job.vehicle_year||"",
                      vehicle_color:job.vehicle_color||"",
                      vin:job.vin||"",
                      engine_no:job.engine_no||"",
                      date_in:pastRec.date_in,
                      date_out:pastRec.date_out||null,
                      mileage:pastRec.mileage||"",
                      complaint:pastRec.complaint,
                      diagnosis:pastRec.diagnosis||"",
                      mechanic:pastRec.mechanic||"",
                      notes:pastRec.notes||"",
                      status:"Delivered",
                    });
                    setAddingPastRecord(false);
                    setPastRec({date_in:"",date_out:"",mileage:"",complaint:"",diagnosis:"",mechanic:"",notes:""});
                  }catch(e){alert("Save failed: "+e.message);}
                  setSavingPastRec(false);
                }}>
                  {savingPastRec?"Saving…":"✅ Save Record"}
                </button>
              </div>
            </div>
          )}

          {/* History list */}
          {vehicleHistory.length===0&&!addingPastRecord?(
            <div style={{textAlign:"center",padding:"32px 0",color:"var(--text3)",fontSize:14}}>
              <div style={{fontSize:32,marginBottom:8}}>🆕</div>
              First visit — no previous service records for this vehicle.
            </div>
          ):(
            vehicleHistory.length>0&&(
              <div>
                <div style={{fontSize:12,color:"var(--text3)",marginBottom:10,fontWeight:600}}>{vehicleHistory.length} previous visit{vehicleHistory.length!==1?"s":""}</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {vehicleHistory.map(j=>(
                    <div key={j.id} style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
                        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                          <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{j.id}</code>
                          <span style={{fontWeight:700,fontSize:13}}>{j.date_in}</span>
                          {j.date_out&&j.status==="Delivered"&&<span style={{fontSize:11,color:"var(--text3)"}}>→ {j.date_out}</span>}
                          {j.mileage&&<span style={{fontSize:11,color:"var(--text3)"}}>🛣️ {Number(j.mileage).toLocaleString()} km</span>}
                          {j.mechanic&&<span style={{fontSize:11,color:"var(--text3)"}}>👷 {j.mechanic}</span>}
                        </div>
                        <span className="badge" style={{fontSize:11,flexShrink:0}}>{j.status}</span>
                      </div>
                      <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:6}}>
                        {j.complaint&&(
                          <div style={{fontSize:13}}>
                            <span style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",marginRight:6}}>Complaint</span>
                            {j.complaint}
                          </div>
                        )}
                        {j.diagnosis&&(
                          <div style={{fontSize:13}}>
                            <span style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".04em",marginRight:6}}>Diagnosis</span>
                            {j.diagnosis}
                          </div>
                        )}
                        {j.notes&&(
                          <div style={{fontSize:12,color:"var(--text3)"}}>
                            <span style={{fontWeight:700,marginRight:6}}>Notes:</span>{j.notes.slice(0,120)}{j.notes.length>120?"…":""}
                          </div>
                        )}
                        {j.return_reason&&(
                          <div style={{fontSize:12,color:"var(--yellow)"}}>🔄 Return reason: {j.return_reason}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
          <button className="btn btn-ghost" style={{width:"100%",marginTop:16}} onClick={()=>{setServiceHistModal(false);setAddingPastRecord(false);}}>Close</button>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUOTE APPROVAL MODAL
// ═══════════════════════════════════════════════════════════════
function QuoteApprovalModal({quote,job,items,settings,onSend,onClose}) {
  const sym = curSym(settings.currency||getSettings().currency);
  const fmt = v=>`${sym}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [link, setLink] = useState(quote.confirm_token
    ? `${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}`
    : null);
  const [sending, setSending] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const phone = job?.customer_phone||"";
  const shopName = settings.shop_name||"Workshop";
  const total = fmt(quote.total||0);
  const reg   = job?.vehicle_reg||"";

  const generate = async () => {
    setSending(true);
    try {
      const url = await onSend();
      setLink(url);
    } catch(e) { alert("Failed to generate link: "+e.message); }
    setSending(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(link).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const waMsg = `Hi${job?.customer_name?" "+job.customer_name:""},\n\n${shopName} has sent you a quotation for ${reg?"your vehicle "+reg+" ":""}totalling *${total}*.\n\nOpen the link to:\n• View all work items\n• Download the PDF\n• Approve or decline\n\n${link}`;

  const alreadySent = !!quote.confirm_token;

  return (
    <Overlay onClose={onClose}>
      <MHead title="📤 Send Quote for Approval" onClose={onClose}/>

      {/* Quote summary */}
      <div style={{padding:"12px 14px",background:"var(--surface2)",borderRadius:10,marginBottom:16,fontSize:13}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontWeight:700}}>📝 {quote.id}</div>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:18,color:"var(--accent)"}}>{total}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",color:"var(--text3)"}}>
          {reg&&<span>🚗 {reg}</span>}
          {job?.vehicle_make&&<span>{job.vehicle_make} {job.vehicle_model||""}</span>}
          {(quote.quote_customer||job?.customer_name)&&<span>👤 {quote.quote_customer||job.customer_name}</span>}
          {phone&&<span>📞 {phone}</span>}
        </div>
        {items.length>0&&<div style={{marginTop:6,fontSize:11,color:"var(--text3)"}}>{items.length} line item{items.length!==1?"s":""}</div>}
      </div>

      {/* Status */}
      {alreadySent&&!link&&(
        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)",borderRadius:8,fontSize:12,color:"var(--yellow)"}}>
          ⚠️ A link was previously generated. Generating again will create a new token.
        </div>
      )}
      {quote.confirm_status==="confirmed"&&(
        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",borderRadius:8,fontSize:12,color:"var(--green)"}}>
          ✅ Customer already approved this quote.
        </div>
      )}
      {quote.confirm_status==="declined"&&(
        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,fontSize:12,color:"var(--red)"}}>
          ❌ Customer declined this quote.
        </div>
      )}

      {/* Link area */}
      {link ? (
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:6}}>🔗 Approval link</div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input readOnly value={link} className="inp" style={{fontFamily:"DM Mono,monospace",fontSize:11,flex:1,cursor:"text"}} onClick={e=>e.target.select()}/>
            <button className="btn btn-ghost btn-sm" style={{flexShrink:0}} onClick={copy}>{copied?"✅ Copied":"📋 Copy"}</button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {phone&&(
              <a href={waLink(phone,waMsg)} target="_blank" rel="noreferrer"
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"11px 14px",
                  background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.3)",borderRadius:8,
                  color:"#25D366",fontWeight:700,fontSize:13,textDecoration:"none",minWidth:120}}>
                <span style={{fontSize:18}}>📱</span> Send via WhatsApp
              </a>
            )}
            <button className="btn btn-ghost" style={{flex:1,minWidth:100}} onClick={()=>window.open(link,"_blank")}>🔗 Preview link</button>
          </div>
          <div style={{marginTop:10,fontSize:11,color:"var(--text3)",textAlign:"center"}}>Share this link with the customer. They can approve or decline without logging in.</div>
        </div>
      ) : (
        <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,fontWeight:700}} onClick={generate} disabled={sending}>
          {sending?"⏳ Generating link…":"📤 Generate Approval Link"}
        </button>
      )}
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// MOVE JOB MODAL
// ═══════════════════════════════════════════════════════════════
function MoveJobModal({job,onMove,onClose}) {
  const [targetId,setTargetId]=useState("");
  const [saving,setSaving]=useState(false);

  const handleMove=async()=>{
    if(!targetId.trim()){alert("Enter the target Workshop ID");return;}
    if(!window.confirm(
      `Move job ${job.id} (${job.customer_name}) to workshop "${targetId.trim()}"?\n\nThis will also move all related quotes and invoices.`
    )) return;
    setSaving(true);
    try{
      await onMove(targetId.trim());
    }catch(e){ alert("Move failed: "+e.message); setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="🔀 Move Job to Another Workshop" onClose={onClose}/>
      <div style={{marginBottom:14,padding:"10px 14px",background:"var(--surface2)",borderRadius:8,fontSize:13}}>
        <div style={{fontWeight:700,marginBottom:4}}>{job.customer_name} · <code style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{job.id}</code></div>
        <div style={{color:"var(--text3)"}}>🚗 {job.vehicle_reg||"—"} · {job.date_in}</div>
      </div>
      <div style={{marginBottom:16}}>
        <FL label="Target Workshop ID"/>
        <input className="inp" value={targetId} onChange={e=>setTargetId(e.target.value)}
          placeholder="e.g. WS-00123"
          style={{fontFamily:"DM Mono,monospace"}}/>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>
          The job, all job items, quotes and invoices will be reassigned to this workshop.
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn" style={{flex:2,background:"var(--yellow)",color:"#000",fontWeight:700}} onClick={handleMove} disabled={saving||!targetId.trim()}>
          {saving?"Moving...":"🔀 Confirm Move"}
        </button>
      </div>
    </Overlay>
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
    vin:job.vin||"", engine_no:job.engine_no||"", licence_disc_expiry:job.licence_disc_expiry||"",
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
  const [saving,setSaving]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(null); // {current,total,name}
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
    // Only clear the vehicle link for new jobs — editing keeps the existing vehicle link
    if(!f.id){ setSelVehicle(null); s("workshop_vehicle_id",null); }
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
            <div>
              <FL label="VIN"/>
              <input className="inp" value={f.vin} onChange={e=>s("vin",e.target.value.toUpperCase())} placeholder="17-char VIN..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/>
              {f.vin&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5}}>
                  <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(96,165,250,.15)",color:"var(--blue)",border:"1px solid rgba(96,165,250,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    PartsOuq
                  </a>
                  <a href={`https://www.realoem.com/bmw/enUS/select?vin=${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(52,211,153,.12)",color:"var(--green)",border:"1px solid rgba(52,211,153,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    RealOEM
                  </a>
                  <a href={`https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(f.vin)}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(251,191,36,.12)",color:"var(--yellow)",border:"1px solid rgba(251,191,36,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    VinDecoderz
                  </a>
                  <button onClick={()=>{navigator.clipboard.writeText(f.vin);alert(`VIN copied to clipboard:\n\n${f.vin}\n\nPaste it into the VIN field on WolfOil.`);window.open("https://za.wolfoil.com/en-us/oil-finder","_blank");}}
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(249,115,22,.12)",color:"#f97316",border:"1px solid rgba(249,115,22,.3)",borderRadius:5,cursor:"pointer",whiteSpace:"nowrap"}}>
                    WolfOil 📋
                  </button>
                  <a href="https://willard.co.za/battery-selection-tool/" target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(220,38,38,.12)",color:"#ef4444",border:"1px solid rgba(220,38,38,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    Willard 🔋
                  </a>
                  <a href="https://www.varta-automotive.com/battery-finder" target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"2px 8px",background:"rgba(99,102,241,.12)",color:"#6366f1",border:"1px solid rgba(99,102,241,.3)",borderRadius:5,textDecoration:"none",whiteSpace:"nowrap"}}>
                    VARTA 🔋
                  </a>
                </div>
              )}
            </div>
            <div><FL label="Engine No."/><input className="inp" value={f.engine_no} onChange={e=>s("engine_no",e.target.value.toUpperCase())} placeholder="Engine number..." style={{fontFamily:"DM Mono,monospace",fontSize:12}}/></div>
          </FG>
          <FD>
            <FL label="🗓️ Licence Disc Expiry"/>
            <input className="inp" type="date" value={f.licence_disc_expiry} onChange={e=>s("licence_disc_expiry",e.target.value)}/>
            {f.licence_disc_expiry&&(
              <div style={{marginTop:4,fontSize:12,fontWeight:600,color:new Date(f.licence_disc_expiry)<new Date()?"var(--red)":"var(--green)"}}>
                {new Date(f.licence_disc_expiry)<new Date()?"⚠️ EXPIRED":"✅ Valid"}
              </div>
            )}
          </FD>
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
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose} disabled={saving}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={async()=>{
          if(!f.customer_name.trim()){alert("Customer name required — go to Customer tab");setTab("customer");return;}
          if(!f.vehicle_reg.trim()){alert("Vehicle plate required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.mileage){alert("Mileage required — go to Vehicle tab");setTab("vehicle");return;}
          if(!f.complaint.trim()){alert("Main job / complaint required — go to Job tab");setTab("job");return;}
          if(f.parent_job_id&&!f.return_reason.trim()){alert("Return reason required for return jobs — go to Job tab");setTab("job");return;}
          setSaving(true); setUploadProgress(null);
          try{ await onSave(f, prog=>setUploadProgress(prog)); }
          catch(e){ alert("Save failed: "+e.message); setSaving(false); setUploadProgress(null); }
        }}>
          {saving
            ? uploadProgress
              ? `📤 Uploading ${uploadProgress.name} (${uploadProgress.current}/${uploadProgress.total})...`
              : "💾 Saving..."
            : `💾 ${t.save}`}
        </button>
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

  const handlePaste = async (e) => {
    e.stopPropagation();
    try{
      const items = await navigator.clipboard.read();
      let found = false;
      for(const item of items){
        const imgType = item.types.find(t=>t.startsWith("image/"));
        if(!imgType) continue;
        found = true;
        const blob = await item.getType(imgType);
        const fr = new FileReader();
        fr.onload = ev => onChange(ev.target.result);
        fr.readAsDataURL(blob);
      }
      if(!found) setError("No image in clipboard — copy an image first.");
    }catch(e){
      setError("Clipboard access denied — allow it in your browser.");
    }
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
        <button className="btn btn-ghost btn-xs"
          style={{flex:1,padding:"4px 2px",fontSize:10,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}
          title="Paste image from clipboard"
          onClick={handlePaste}>
          <span style={{fontSize:13}}>📋</span><span>Paste</span>
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
function WorkshopItemModal({type, wsStock=[], wsServices=[], existingItems=[], defaultMarkupPct=0, onSave, onClose, onGoToStock, t}) {
  const [desc,      setDesc]      = useState("");
  const [qty,       setQty]       = useState(1);
  const [price,     setPrice]     = useState("");
  const [costPrice, setCostPrice] = useState(0);
  const [markupPct, setMarkupPct] = useState(defaultMarkupPct);
  const [selItem,   setSelItem]   = useState(null);
  const [search,    setSearch]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [addedIds,  setAddedIds]  = useState(new Set());

  const list = type==="part" ? wsStock : wsServices;

  // SKUs already on the job (pre-existing) + IDs added this session
  const existingSkus = new Set(existingItems.map(i=>i.part_sku).filter(Boolean));

  const filtered = list.filter(p=>{
    if(addedIds.has(p.id)) return false;
    if(p.sku && existingSkus.has(p.sku)) return false;
    if(!search.trim()) return true;
    const hay=`${p.name||""} ${p.sku||""} ${p.description||""}`.toLowerCase();
    return search.trim().toLowerCase().split(/\s+/).every(w=>hay.includes(w));
  }).slice(0,30);

  const total = (+qty||0)*(+price||0);

  const resetForm=()=>{ setDesc(""); setQty(1); setPrice(""); setCostPrice(0); setMarkupPct(defaultMarkupPct); setSelItem(null); setSearch(""); };

  const selectItem=(p)=>{
    setSelItem(p);
    setDesc(p.name);
    const cost=+(p.unit_cost||0);
    const listPrice=+(p.unit_price||p.default_price||p.price||p.rate||0);
    if(type==="part"&&cost>0&&defaultMarkupPct>0){
      setCostPrice(cost);
      setMarkupPct(defaultMarkupPct);
      setPrice(String(+(cost*(1+defaultMarkupPct/100)).toFixed(2)));
    } else if(type==="part"&&cost>0){
      setCostPrice(cost);
      const mp=listPrice>0?+((listPrice/cost-1)*100).toFixed(1):0;
      setMarkupPct(mp);
      setPrice(String(listPrice||cost));
    } else {
      setCostPrice(0);
      setMarkupPct(defaultMarkupPct);
      setPrice(String(listPrice||""));
    }
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
        cost_price:type==="part"?+costPrice:0,
        markup_pct:type==="part"?+markupPct:0,
        total:(+qty)*(+price),
      });
      if(selItem?.id) setAddedIds(prev=>new Set([...prev,selItem.id]));
      resetForm();
      setJustAdded(true);
      setTimeout(()=>setJustAdded(false),2000);
    }catch(e){ alert("Save failed: "+e.message); }
    finally{ setSaving(false); }
  };

  const stockBadge=(p)=>{
    if(type!=="part") return null;
    const q=+p.qty||0;
    const low=+p.min_qty||0;
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
              ? <div style={{padding:16,textAlign:"center"}}>
                  <div style={{color:"var(--text3)",fontSize:13,marginBottom:10}}>
                    {type==="part"
                      ? (search ? `No stock found for "${search}"` : "No workshop stock yet")
                      : (search ? `No services found for "${search}"` : "No services yet")}
                  </div>
                  {type==="part"&&onGoToStock&&(
                    <button className="btn btn-primary btn-sm" onClick={()=>{onClose();onGoToStock();}}>
                      + Add to WS Stock
                    </button>
                  )}
                </div>
              : (search?filtered:list.slice(0,20)).map(p=>(
                  <div key={p.id} onClick={()=>selectItem(p)}
                    style={{padding:"10px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",gap:10,alignItems:"center"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontSize:22,flexShrink:0}}>{type==="part"?"🔩":"🔧"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>
                        {p.name}
                        {p.quote_only&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",borderRadius:4,padding:"1px 5px"}}>📋 Quote only</span>}
                      </div>
                      {p.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{p.sku}</code>}
                      {p.description&&<div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>{p.description}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>{fmtAmt(p.unit_price||p.default_price||p.price||p.rate||0)}</div>
                      {type==="part"&&!p.quote_only&&stockBadge(p)}
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
// WS SUPPLIER INVOICES PAGE
// ═══════════════════════════════════════════════════════════════

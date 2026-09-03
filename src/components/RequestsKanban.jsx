import { useMemo, useState } from "react";
import { toImgUrl } from "../lib/helpers.js";
import { Overlay, MHead, ImgLightbox } from "./shared.jsx";
import { WsShopRequestDetail, TransferRequestCard, VehicleRequestCard, PartRequestCard } from "./Modals.jsx";

const partPhotoUrl=(part)=>part?.image_url||"";

const COLUMNS = [
  {id:"new",         label:"New",          color:"#a78bfa"},
  {id:"inprogress",  label:"In Progress",  color:"#fbbf24"},
  {id:"finishorder", label:"Finish Order", color:"#fb923c"},
  {id:"arrived",     label:"Order Arrived",color:"#38bdf8"},
  {id:"fulfilled",   label:"Fulfilled",    color:"#34d399"},
  {id:"closed",      label:"Closed",       color:"#f87171"},
];

const COLUMN_MAP = {
  ws:      {pending:"new", escalated:"inprogress", main_replied:"inprogress", replied:"inprogress", ordered:"fulfilled"},
  transfer:{pending:"new", quoted:"inprogress", dispatched:"inprogress", confirmed:"fulfilled", completed:"fulfilled", cancelled:"closed"},
  vehicle: {pending:"new", approved:"fulfilled", rejected:"closed"},
  part:    {pending:"new", approved:"fulfilled", rejected:"closed"},
};
const mapToColumn=(type,status)=>COLUMN_MAP[type]?.[status]||"new";

// An RFQ sent to suppliers doesn't change the request's own status (that still
// reflects the branch-to-branch / workshop reply flow), so a "New" card would
// otherwise sit still even after someone acted on it. Track how far the RFQ
// side has gotten — matched by SKU since that's present on the raw item before
// any catalog-part resolution — so the display column can move through
// In Progress (sent) → Finish Order (all items ordered) → Order Arrived
// (stock actually received) independently of the request's own status.
const rfqProgress=(items,inquiries,supplierInvoices)=>{
  const skus=[...new Set(items.map(i=>(i.sku||i.part_sku||"").toUpperCase()).filter(Boolean))];
  if(skus.length===0) return "none";
  // Latest inquiry per SKU
  const bySkuInq={};
  inquiries.forEach(inq=>{
    const sk=(inq.part_sku||"").toUpperCase();
    if(!skus.includes(sk)) return;
    const prev=bySkuInq[sk];
    if(!prev||new Date(inq.created_at||0)>new Date(prev.created_at||0)) bySkuInq[sk]=inq;
  });
  const matched=Object.values(bySkuInq);
  if(matched.length===0) return "none";
  const allOrdered=skus.every(sk=>bySkuInq[sk]?.status==="ordered");
  if(!allOrdered) return "partial";
  // acceptInquiry stamps the created invoice's rfq_inquiry_id with the inquiry
  // it came from — that's the link back from an inquiry to the PO it created.
  const allArrived=matched.every(inq=>
    supplierInvoices.find(iv=>String(iv.rfq_inquiry_id)===String(inq.id))?.stocked_in
  );
  return allArrived?"arrived":"ordered";
};

// How many of this request's items already have a supplier price recorded
// (manual entry or a real reply), regardless of whether it's been ordered yet.
const quoteSummary=(items,inquiries)=>{
  const skus=[...new Set(items.map(i=>(i.sku||i.part_sku||"").toUpperCase()).filter(Boolean))];
  if(skus.length===0) return {quoted:0,total:0};
  const quoted=skus.filter(sk=>inquiries.some(inq=>(inq.part_sku||"").toUpperCase()===sk&&inq.reply_price!=null)).length;
  return {quoted,total:skus.length};
};

// Which supplier(s) this request's items were actually placed a PO with — one
// entry per ordered SKU — so the kanban card can say "Ordered from CATO ×1 ·
// 7/8/2026" instead of leaving the space under the quoted count blank once an
// inquiry's gone through to a PO. Matched to its invoice via rfq_inquiry_id
// (set by acceptInquiry) to pull the order date and any remark note.
const orderedSummary=(items,inquiries,supplierInvoices)=>{
  const skus=[...new Set(items.map(i=>(i.sku||i.part_sku||"").toUpperCase()).filter(Boolean))];
  if(skus.length===0) return [];
  const bySkuInq={};
  inquiries.forEach(inq=>{
    const sk=(inq.part_sku||"").toUpperCase();
    if(!skus.includes(sk)||inq.status!=="ordered") return;
    const prev=bySkuInq[sk];
    if(!prev||new Date(inq.created_at||0)>new Date(prev.created_at||0)) bySkuInq[sk]=inq;
  });
  return Object.values(bySkuInq).filter(inq=>inq.supplier_name).map(inq=>{
    const inv=supplierInvoices.find(iv=>String(iv.rfq_inquiry_id)===String(inq.id));
    return {supplier:inq.supplier_name,qty:inq.qty_requested||1,date:inv?.invoice_date||"",note:inv?.notes||""};
  });
};

const TYPE_META={
  ws:      {icon:"🏪",label:"Parts Request"},
  transfer:{icon:"🔄",label:"Stock Transfer"},
  vehicle: {icon:"🚗",label:"Vehicle Request"},
  part:    {icon:"📬",label:"Catalog Part Request"},
};

function normalize(row,type,branches,parts,inquiries=[],supplierInvoices=[]){
  const branchName=id=>branches.find(b=>b.id===id)?.name||"Unknown Branch";
  let title,subtitle,photoUrl="",rfqItems=[];
  if(type==="ws"){
    title=row.workshop_name||row.requester_name||"Workshop";
    const reqItems=(()=>{try{return JSON.parse(row.items||"[]");}catch{return [];}})();
    subtitle=[row.job_car,row.job_complaint].filter(Boolean).join(" · ")||`${reqItems.length} part${reqItems.length!==1?"s":""}`;
    const firstWithPhoto=reqItems.find(i=>i.photo_url);
    photoUrl=firstWithPhoto?.photo_url||"";
    rfqItems=reqItems;
  }else if(type==="transfer"){
    const items=Array.isArray(row.items)?row.items:[];
    title=row.workshop_name||branchName(row.requesting_branch_id);
    subtitle=`${items.length} item${items.length!==1?"s":""} → ${branchName(row.supplying_branch_id)}`;
    const firstItemPart=items.find(i=>i.partId)?.partId ? parts.find(p=>String(p.id)===String(items.find(i=>i.partId).partId)) : null;
    photoUrl=partPhotoUrl(firstItemPart);
    rfqItems=items;
  }else if(type==="vehicle"){
    title=`${row.make} ${row.model}`;
    subtitle=branchName(row.branch_id);
    photoUrl=row.photo1||row.photo2||"";
  }else{ // part
    title=row.name;
    subtitle=branchName(row.branch_id);
    photoUrl=row.image_url||"";
  }
  let kanbanColumn=mapToColumn(type,row.status);
  if(kanbanColumn==="new"){
    const progress=rfqProgress(rfqItems,inquiries,supplierInvoices);
    if(progress==="partial") kanbanColumn="inprogress";
    else if(progress==="ordered") kanbanColumn="finishorder";
    else if(progress==="arrived") kanbanColumn="arrived";
  }
  const {quoted,total}=quoteSummary(rfqItems,inquiries);
  const orderedFrom=orderedSummary(rfqItems,inquiries,supplierInvoices);
  return {id:`${type}_${row.id}`,rawId:row.id,type,title,subtitle,photoUrl,status:row.status,kanbanColumn,createdAt:row.created_at,quotedCount:quoted,totalItems:total,orderedFrom,raw:row};
}

const RequestCard=({card,onClick})=>{
  const meta=TYPE_META[card.type];
  const [lightbox,setLightbox]=useState(false);
  return (
    <div className="kb-card" style={{marginBottom:8}} onClick={onClick}>
      <div style={{padding:"10px 11px",display:"flex",gap:10}}>
        {card.photoUrl&&<img src={toImgUrl(card.photoUrl)} alt="" referrerPolicy="no-referrer"
          onClick={e=>{e.stopPropagation();setLightbox(true);}}
          style={{width:40,height:40,objectFit:"cover",borderRadius:7,border:"1px solid var(--border)",flexShrink:0,cursor:"zoom-in"}}
          onError={e=>e.target.style.display="none"}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:700,color:"var(--text3)"}}>{meta.icon} {meta.label}</span>
            <span style={{fontSize:10,color:"var(--text3)",whiteSpace:"nowrap"}}>{card.createdAt?new Date(card.createdAt).toLocaleDateString():""}</span>
          </div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.title}</div>
          {card.subtitle&&<div style={{fontSize:11,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.subtitle}</div>}
          {card.totalItems>0&&(
            <div style={{fontSize:10,fontWeight:700,marginTop:4,color:card.quotedCount===card.totalItems?"var(--green)":card.quotedCount>0?"var(--orange)":"var(--text3)"}}>
              💬 {card.quotedCount}/{card.totalItems} quoted
            </div>
          )}
          {card.orderedFrom.map((o,i)=>(
            <div key={i} style={{fontSize:10,fontWeight:700,marginTop:2,color:"var(--blue)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={o.note||undefined}>
              📦 {o.qty}× from {o.supplier}{o.date?` · ${new Date(o.date).toLocaleDateString()}`:""}{o.note?` — ${o.note}`:""}
            </div>
          ))}
        </div>
      </div>
      {lightbox&&<div onClick={e=>e.stopPropagation()}><ImgLightbox url={toImgUrl(card.photoUrl)} onClose={()=>setLightbox(false)}/></div>}
    </div>
  );
};

export function RequestsKanbanPage({
  wsShopRequests=[],branchStockRequests=[],vehicleRequests=[],partRequests=[],
  branches=[],parts=[],vehicles=[],suppliers=[],partSuppliers=[],inquiries=[],supplierInvoices=[],settings={},branchStock=[],
  user,role,currentBranch,t={},
  onReply,onEscalate,onMainReply,onDeleteWsShop,onDeleteTransfer,
  onApproveVehicle,onGoToVehicles,onGoToPart,onSendInquiry,onManualQuote,onAcceptQuote,onCancelOrder,onEditPart,onRefresh,
  rfqQuotes=[],rfqItems=[],onCreateRfqSession,onGoToRfqSession,
}) {
  const [activeTypes,setActiveTypes]=useState(()=>new Set(["ws","transfer","vehicle","part"]));
  const [openCardId,setOpenCardId]=useState(null); // id of the card currently shown in the detail Overlay

  const isAdmin=role==="admin";

  // Unfiltered — so the open detail Overlay always re-derives from live data (not a stale snapshot),
  // and stays resolvable even if the user toggles a filter chip while it's open.
  const allCards=useMemo(()=>[
    ...wsShopRequests.map(r=>normalize(r,"ws",branches,parts,inquiries,supplierInvoices)),
    ...branchStockRequests.map(r=>normalize(r,"transfer",branches,parts,inquiries,supplierInvoices)),
    ...vehicleRequests.map(r=>normalize(r,"vehicle",branches,parts,inquiries,supplierInvoices)),
    ...partRequests.map(r=>normalize(r,"part",branches,parts,inquiries,supplierInvoices)),
  ],[wsShopRequests,branchStockRequests,vehicleRequests,partRequests,branches,parts,inquiries,supplierInvoices]);

  const cards=useMemo(()=>
    allCards.filter(c=>activeTypes.has(c.type)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)),
  [allCards,activeTypes]);

  const openCard=openCardId?allCards.find(c=>c.id===openCardId)||null:null;

  const toggleType=(type)=>setActiveTypes(prev=>{
    const next=new Set(prev);
    next.has(type)?next.delete(type):next.add(type);
    return next;
  });

  const closeDetail=()=>setOpenCardId(null);

  const renderDetail=()=>{
    if(!openCard)return null;
    const {type,raw}=openCard;
    if(type==="ws")return(
      <Overlay onClose={closeDetail} wide>
        <MHead title="🏪 Workshop Parts Request" sub={raw.workshop_name||"Workshop"} onClose={closeDetail}
          actions={onDeleteWsShop&&(
            <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}}
              onClick={async()=>{if(!window.confirm("Delete this request?"))return;await onDeleteWsShop(raw.id);closeDetail();}}>
              🗑️ Delete
            </button>
          )}/>
        <WsShopRequestDetail req={raw} parts={parts} settings={settings} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t}
          onReply={async(...a)=>{await onReply(...a);closeDetail();}}
          onEscalate={onEscalate} onMainReply={onMainReply}
          userRole={role} userBranchId={user?.branch_id||null}/>
      </Overlay>
    );
    if(type==="transfer")return(
      <Overlay onClose={closeDetail} wide>
        <MHead title="🔄 Branch Transfer Request" sub={raw.workshop_name||"Request"} onClose={closeDetail}/>
        <TransferRequestCard r={raw} branches={branches} role={role} currentBranch={currentBranch}
          settings={settings} branchStock={branchStock} parts={parts} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} supplierInvoices={supplierInvoices} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t}
          rfqQuotes={rfqQuotes} rfqItems={rfqItems} onCreateRfqSession={onCreateRfqSession} onGoToRfqSession={onGoToRfqSession}
          onRefresh={onRefresh} onDelete={onDeleteTransfer}/>
      </Overlay>
    );
    if(type==="vehicle")return(
      <Overlay onClose={closeDetail}>
        <MHead title="🚗 Vehicle Request" sub={`${raw.make} ${raw.model}`} onClose={closeDetail}/>
        <VehicleRequestCard r={raw} isAdmin={isAdmin} vehicles={vehicles} branches={branches} user={user}
          onApprove={onApproveVehicle} onGoToVehicles={onGoToVehicles} onGoToPart={onGoToPart} onRefresh={onRefresh}/>
      </Overlay>
    );
    return(
      <Overlay onClose={closeDetail}>
        <MHead title="📬 Catalog Part Request" sub={raw.name} onClose={closeDetail}/>
        <PartRequestCard r={raw} isAdmin={isAdmin} branches={branches} parts={parts} user={user} suppliers={suppliers} partSuppliers={partSuppliers} inquiries={inquiries} onSendInquiry={onSendInquiry} onManualQuote={onManualQuote} onAcceptQuote={onAcceptQuote} onCancelOrder={onCancelOrder} onEditPart={onEditPart} t={t} onRefresh={onRefresh}/>
      </Overlay>
    );
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{fontWeight:800,fontSize:20}}>🗂️ Requests</div>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={onRefresh}>↻ Refresh</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {Object.entries(TYPE_META).map(([type,meta])=>(
          <button key={type} onClick={()=>toggleType(type)}
            style={{padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
              background:activeTypes.has(type)?"var(--accent)":"var(--surface2)",
              color:activeTypes.has(type)?"#fff":"var(--text3)"}}>
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>

      <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:24,alignItems:"flex-start"}}>
        {COLUMNS.map(col=>{
          const items=cards.filter(c=>c.kanbanColumn===col.id);
          return (
            <div key={col.id} style={{minWidth:260,maxWidth:260,flexShrink:0,display:"flex",flexDirection:"column"}}>
              <div style={{borderRadius:"12px 12px 0 0",padding:"10px 14px",background:`linear-gradient(135deg,${col.color}1a 0%,${col.color}0a 100%)`,border:`1px solid ${col.color}35`,borderBottom:"none",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:col.color,boxShadow:`0 0 8px ${col.color}`}}/>
                  <div style={{fontWeight:700,fontSize:12}}>{col.label}</div>
                </div>
                <span style={{background:`${col.color}22`,color:col.color,borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,minWidth:22,textAlign:"center"}}>{items.length}</span>
              </div>
              <div style={{background:`${col.color}07`,border:`1px solid ${col.color}25`,borderTop:"none",borderRadius:"0 0 12px 12px",padding:"8px 7px",minHeight:160,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                {items.length===0&&(
                  <div style={{textAlign:"center",padding:"32px 10px",border:"1.5px dashed var(--border2)",borderRadius:10}}>
                    <div style={{fontSize:24,marginBottom:6,opacity:.25}}>📋</div>
                    <div style={{fontSize:11,color:"var(--text3)",fontStyle:"italic"}}>No items</div>
                  </div>
                )}
                {items.map(card=><RequestCard key={card.id} card={card} onClick={()=>setOpenCardId(card.id)}/>)}
              </div>
            </div>
          );
        })}
      </div>

      {renderDetail()}
    </div>
  );
}

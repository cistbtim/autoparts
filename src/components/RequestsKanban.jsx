import { useMemo, useState } from "react";
import { Overlay, MHead } from "./shared.jsx";
import { WsShopRequestDetail, TransferRequestCard, VehicleRequestCard, PartRequestCard } from "./Modals.jsx";

const COLUMNS = [
  {id:"new",        label:"New",         color:"#a78bfa"},
  {id:"inprogress", label:"In Progress", color:"#fbbf24"},
  {id:"fulfilled",  label:"Fulfilled",   color:"#34d399"},
  {id:"closed",     label:"Closed",      color:"#f87171"},
];

const COLUMN_MAP = {
  ws:      {pending:"new", escalated:"inprogress", main_replied:"inprogress", replied:"inprogress", ordered:"fulfilled"},
  transfer:{pending:"new", quoted:"inprogress", dispatched:"inprogress", confirmed:"fulfilled", completed:"fulfilled", cancelled:"closed"},
  vehicle: {pending:"new", approved:"fulfilled", rejected:"closed"},
  part:    {pending:"new", approved:"fulfilled", rejected:"closed"},
};
const mapToColumn=(type,status)=>COLUMN_MAP[type]?.[status]||"new";

const TYPE_META={
  ws:      {icon:"🏪",label:"Parts Request"},
  transfer:{icon:"🔄",label:"Stock Transfer"},
  vehicle: {icon:"🚗",label:"Vehicle Request"},
  part:    {icon:"📬",label:"Catalog Part Request"},
};

function normalize(row,type,branches){
  const branchName=id=>branches.find(b=>b.id===id)?.name||"Unknown Branch";
  let title,subtitle;
  if(type==="ws"){
    title=row.workshop_name||row.requester_name||"Workshop";
    const itemCount=(()=>{try{return JSON.parse(row.items||"[]").length;}catch{return 0;}})();
    subtitle=[row.job_car,row.job_complaint].filter(Boolean).join(" · ")||`${itemCount} part${itemCount!==1?"s":""}`;
  }else if(type==="transfer"){
    const items=Array.isArray(row.items)?row.items:[];
    title=row.workshop_name||branchName(row.requesting_branch_id);
    subtitle=`${items.length} item${items.length!==1?"s":""} → ${branchName(row.supplying_branch_id)}`;
  }else if(type==="vehicle"){
    title=`${row.make} ${row.model}`;
    subtitle=branchName(row.branch_id);
  }else{ // part
    title=row.name;
    subtitle=branchName(row.branch_id);
  }
  return {id:`${type}_${row.id}`,rawId:row.id,type,title,subtitle,status:row.status,kanbanColumn:mapToColumn(type,row.status),createdAt:row.created_at,raw:row};
}

const RequestCard=({card,onClick})=>{
  const meta=TYPE_META[card.type];
  return (
    <div className="kb-card" style={{marginBottom:8}} onClick={onClick}>
      <div style={{padding:"10px 11px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,marginBottom:4}}>
          <span style={{fontSize:11,fontWeight:700,color:"var(--text3)"}}>{meta.icon} {meta.label}</span>
          <span style={{fontSize:10,color:"var(--text3)",whiteSpace:"nowrap"}}>{card.createdAt?new Date(card.createdAt).toLocaleDateString():""}</span>
        </div>
        <div style={{fontWeight:700,fontSize:13,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.title}</div>
        {card.subtitle&&<div style={{fontSize:11,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.subtitle}</div>}
      </div>
    </div>
  );
};

export function RequestsKanbanPage({
  wsShopRequests=[],branchStockRequests=[],vehicleRequests=[],partRequests=[],
  branches=[],parts=[],vehicles=[],suppliers=[],settings={},branchStock=[],
  user,role,currentBranch,
  onReply,onEscalate,onMainReply,onDeleteWsShop,onDeleteTransfer,
  onApproveVehicle,onGoToVehicles,onRefresh,
}) {
  const [activeTypes,setActiveTypes]=useState(()=>new Set(["ws","transfer","vehicle","part"]));
  const [openCard,setOpenCard]=useState(null); // normalized card currently shown in the detail Overlay

  const isAdmin=role==="admin";

  const cards=useMemo(()=>{
    const all=[
      ...wsShopRequests.map(r=>normalize(r,"ws",branches)),
      ...branchStockRequests.map(r=>normalize(r,"transfer",branches)),
      ...vehicleRequests.map(r=>normalize(r,"vehicle",branches)),
      ...partRequests.map(r=>normalize(r,"part",branches)),
    ];
    return all.filter(c=>activeTypes.has(c.type)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  },[wsShopRequests,branchStockRequests,vehicleRequests,partRequests,branches,activeTypes]);

  const toggleType=(type)=>setActiveTypes(prev=>{
    const next=new Set(prev);
    next.has(type)?next.delete(type):next.add(type);
    return next;
  });

  const closeDetail=()=>setOpenCard(null);

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
        <WsShopRequestDetail req={raw} parts={parts} settings={settings} suppliers={suppliers}
          onReply={async(...a)=>{await onReply(...a);closeDetail();}}
          onEscalate={onEscalate} onMainReply={onMainReply}
          userRole={role} userBranchId={user?.branch_id||null}/>
      </Overlay>
    );
    if(type==="transfer")return(
      <Overlay onClose={closeDetail} wide>
        <MHead title="🔄 Branch Transfer Request" sub={raw.workshop_name||"Request"} onClose={closeDetail}/>
        <TransferRequestCard r={raw} branches={branches} role={role} currentBranch={currentBranch}
          settings={settings} branchStock={branchStock} parts={parts} onRefresh={onRefresh} onDelete={onDeleteTransfer}/>
      </Overlay>
    );
    if(type==="vehicle")return(
      <Overlay onClose={closeDetail}>
        <MHead title="🚗 Vehicle Request" sub={`${raw.make} ${raw.model}`} onClose={closeDetail}/>
        <VehicleRequestCard r={raw} isAdmin={isAdmin} vehicles={vehicles} branches={branches} user={user}
          onApprove={onApproveVehicle} onGoToVehicles={onGoToVehicles} onRefresh={onRefresh}/>
      </Overlay>
    );
    return(
      <Overlay onClose={closeDetail}>
        <MHead title="📬 Catalog Part Request" sub={raw.name} onClose={closeDetail}/>
        <PartRequestCard r={raw} isAdmin={isAdmin} branches={branches} parts={parts} user={user} onRefresh={onRefresh}/>
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
                {items.map(card=><RequestCard key={card.id} card={card} onClick={()=>setOpenCard(card)}/>)}
              </div>
            </div>
          );
        })}
      </div>

      {renderDetail()}
    </div>
  );
}

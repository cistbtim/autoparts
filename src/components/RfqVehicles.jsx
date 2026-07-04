import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { removeBackground } from "@imgly/background-removal";
import { api, SUPABASE_URL, SUPABASE_KEY, uploadToStorage } from "../lib/api.js";
import { getSettings, C, curSym } from "../lib/settings.js";
import { fmtAmt, makeId, today, toImgUrl, toFullUrl, toSaveUrl, extractDriveId } from "../lib/helpers.js";
import { tSt } from "../lib/i18n.js";
import { CSS } from "../styles.js";
import { ErrorBoundary, Overlay, MHead, FL, FG, FD, DriveImg, StatusBadge, ImgPreview, ImgLightbox } from "../components/shared.jsx";

export function RfqPage({parts,suppliers,rfqSessions,rfqItems,rfqQuotes,onCreate,onUpdateStatus,onSelectQuote,onUnselectQuote,onUnselectAll,onRefresh,onCreatePO,onResendStale,onEditPart,t,user,settings}) {
  const [view,setView]=useState("list"); // list | create | detail
  const [activeSession,setActiveSession]=useState(null);
  const [lq,setLq]=useState([]); // local quote state for detail view (no auto-refresh)
  const needSync=useRef(false);
  const [isMobile,setIsMobile]=useState(()=>window.innerWidth<=700);
  useEffect(()=>{const fn=()=>setIsMobile(window.innerWidth<=700);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  const [qtyEdit,setQtyEdit]=useState({});
  const saveQty=async(itemId,val)=>{
    const qty=Math.max(1,Math.round(+val||1));
    setQtyEdit(p=>({...p,[itemId]:qty}));
    await api.patch("rfq_items","id",itemId,{qty_needed:qty});
    needSync.current=true; onRefresh();
  };

  // Sync lq when opening a session
  useEffect(()=>{
    if(activeSession) setLq(rfqQuotes.filter(q=>q.rfq_id===activeSession.id));
  },[activeSession?.id]); // eslint-disable-line

  // Sync lq only when user clicks Refresh
  useEffect(()=>{
    if(needSync.current&&activeSession){
      setLq(rfqQuotes.filter(q=>q.rfq_id===activeSession.id));
      needSync.current=false;
    }
  },[rfqQuotes]); // eslint-disable-line

  const handleRefresh=async()=>{needSync.current=true;await onRefresh();};

  const handleSelect=async(quoteId,rfqItemId)=>{
    setLq(prev=>prev.map(q=>{
      if(q.rfq_item_id!==rfqItemId) return q;
      if(q.id===quoteId) return {...q,status:"selected"};
      return {...q,status:q.unit_price!=null?"quoted":"pending"};
    }));
    onSelectQuote(quoteId,rfqItemId);
  };

  const handleUnselect=async(quoteId)=>{
    setLq(prev=>prev.map(q=>q.id===quoteId?{...q,status:"quoted"}:q));
    onUnselectQuote(quoteId);
  };

  const handleUnselectAll=async()=>{
    setLq(prev=>prev.map(q=>q.status==="selected"?{...q,status:"quoted"}:q));
    onUnselectAll(activeSession.id);
  };

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
    const sessionQuotes=lq;
    const allSuppliers=[...new Set(sessionQuotes.map(q=>q.supplier_id))].map(sid=>({
      id:sid, name:sessionQuotes.find(q=>q.supplier_id===sid)?.supplier_name
    }));
    const quotedCount=sessionQuotes.filter(q=>q.status==="quoted"||q.status==="selected").length;
    const totalQuotes=sessionQuotes.length;
    const hasSelected=sessionQuotes.some(q=>q.status==="selected");
    const cur=curSym(settings.currency||getSettings().currency);
    const sortedSessions=[...rfqSessions].sort((a,b)=>a.created_at>b.created_at?-1:1);
    const curIdx=sortedSessions.findIndex(s=>s.id===activeSession.id);
    const prevSession=curIdx<sortedSessions.length-1?sortedSessions[curIdx+1]:null;
    const nextSession=curIdx>0?sortedSessions[curIdx-1]:null;

    return (
      <div className="fu">
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setView("list")}>← Back</button>
          <div style={{flex:1}}>
            <h1 style={{fontSize:20,fontWeight:700}}>{activeSession.name}</h1>
            <div style={{fontSize:13,color:"var(--text3)",marginTop:2}}>
              {quotedCount}/{totalQuotes} quotes received · {sessionItems.length} parts · {allSuppliers.length} suppliers
              <span style={{marginLeft:10,color:"var(--text3)"}}>({curIdx+1}/{sortedSessions.length})</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {prevSession&&<button className="btn btn-ghost btn-sm" onClick={()=>openSession(prevSession)}>← Prev</button>}
            {nextSession&&<button className="btn btn-ghost btn-sm" onClick={()=>openSession(nextSession)}>Next →</button>}
            <button className="btn btn-ghost btn-sm" onClick={handleRefresh}>🔄 Refresh</button>
            {hasSelected&&<button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={handleUnselectAll}>✕ Unselect All</button>}
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

        {/* Per-supplier batch send cards */}
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          {allSuppliers.map(s=>{
            const suppQuotes=sessionQuotes.filter(q=>q.supplier_id===s.id);
            const batchToken=suppQuotes[0]?.token;
            const batchUrl=`${window.location.origin}${window.location.pathname}?rfq_batch=${batchToken}`;
            const quotedCount=suppQuotes.filter(q=>q.status==="quoted"||q.status==="selected").length;
            const suppData=suppliers.find(x=>String(x.id)===String(s.id));
            const itemsList=sessionItems.map((item,i)=>`${i+1}. ${item.part_name} (${item.part_sku||"—"}) × ${item.qty_needed}`).join("\n");
            const waMsg=`Hi ${s.name},\n\nWe have an RFQ for ${sessionItems.length} parts. Please click the link below to view the list and submit all quotes at once:\n\n${batchUrl}\n\nParts:\n${itemsList}\n\nDeadline: ${activeSession.deadline||"ASAP"}\nThank you,\n${settings?.shop_name||"MotorDesk"}`;
            return (
              <div key={s.id} style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",border:`1px solid ${quotedCount===suppQuotes.length&&suppQuotes.length>0?"rgba(52,211,153,.35)":"var(--border)"}`,flex:"1 1 240px",minWidth:220}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:14}}>{s.name}</div>
                  <span style={{fontSize:11,color:quotedCount===suppQuotes.length&&suppQuotes.length>0?"var(--green)":"var(--text3)",fontWeight:600}}>{quotedCount}/{suppQuotes.length} quoted</span>
                </div>
                <div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--accent)",wordBreak:"break-all",marginBottom:8,lineHeight:1.5}}>{batchUrl}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button className="btn btn-ghost btn-xs" onClick={()=>{navigator.clipboard.writeText(batchUrl);}}>📋 Copy</button>
                  <a href={batchUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs" style={{color:"var(--blue)"}}>↗ Open</button></a>
                  {suppData?.phone&&<a href={`https://wa.me/${(suppData.phone||"").replace(/[^0-9]/g,"")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="btn btn-xs" style={{background:"#25D366",color:"#fff",border:"none",fontSize:11,padding:"3px 10px"}}>📲 WhatsApp</button></a>}
                  {suppData?.email&&<a href={`mailto:${suppData.email}?subject=RFQ: ${activeSession.name}&body=${encodeURIComponent(waMsg)}`} style={{textDecoration:"none"}}><button className="btn btn-ghost btn-xs">✉ Email</button></a>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison — card on mobile, table on desktop */}
        {isMobile ? (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {sessionItems.map(item=>{
              const displayQty = qtyEdit[item.id] ?? item.qty_needed;
              const itemQuotes=sessionQuotes.filter(q=>q.rfq_item_id===item.id);
              const quotedPrices=itemQuotes.filter(q=>q.status==="quoted"&&q.unit_price!=null).map(q=>q.unit_price);
              const minPrice=quotedPrices.length?Math.min(...quotedPrices):null;
              return (
                <div key={item.id} className="card" style={{padding:14}}>
                  {/* Part header */}
                  <div style={{marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:15,color:"var(--accent)",cursor:"pointer",textDecoration:"underline dotted"}}
                      onClick={()=>onEditPart&&onEditPart(parts.find(p=>String(p.id)===String(item.part_id)))}>
                      {item.part_name}
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2,marginBottom:8}}>
                      {item.part_sku}{item.oe_number&&<> · <span style={{fontFamily:"DM Mono,monospace"}}>{item.oe_number}</span></>}
                    </div>
                    {/* Editable qty */}
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:12,color:"var(--text3)",fontWeight:600}}>Qty Needed:</span>
                      <button onClick={()=>saveQty(item.id,displayQty-1)}
                        style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--text2)",lineHeight:1}}>−</button>
                      <input type="number" min="1"
                        value={displayQty}
                        onChange={e=>setQtyEdit(p=>({...p,[item.id]:+e.target.value||1}))}
                        onBlur={e=>saveQty(item.id,e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&saveQty(item.id,e.target.value)}
                        style={{width:52,textAlign:"center",fontWeight:700,fontSize:15,padding:"4px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)"}}/>
                      <button onClick={()=>saveQty(item.id,displayQty+1)}
                        style={{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--text2)",lineHeight:1}}>+</button>
                    </div>
                  </div>

                  {/* Supplier quote rows */}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {allSuppliers.map(s=>{
                      const q=itemQuotes.find(x=>x.supplier_id===s.id);
                      const isBest=q?.unit_price!=null&&q.unit_price===minPrice&&quotedPrices.length>1;
                      const replyUrl=`${window.location.origin}${window.location.pathname}?rfq_quote=${q?.token}`;
                      const isSelected=q?.status==="selected";
                      const lineTotal=q?.unit_price!=null?q.unit_price*displayQty:null;
                      return (
                        <div key={s.id} style={{
                          borderRadius:8,padding:"10px 12px",
                          background:isSelected?"rgba(52,211,153,.07)":"var(--surface2)",
                          border:`1px solid ${isSelected?"rgba(52,211,153,.4)":isBest?"rgba(251,146,60,.3)":"var(--border)"}`
                        }}>
                          {/* Supplier name row */}
                          <div style={{fontWeight:700,fontSize:13,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                            {s.name}
                            {isSelected&&<span className="badge" style={{background:"rgba(52,211,153,.15)",color:"var(--green)",fontSize:10}}>✓ Selected</span>}
                            {isBest&&!isSelected&&<span style={{fontSize:10,color:"var(--green)",fontWeight:600}}>★ Best</span>}
                          </div>

                          {(!q||q.status==="pending") ? (
                            <>
                              <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>⏳ Awaiting quote</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {s.phone&&<a href={`https://wa.me/${s.phone}?text=${encodeURIComponent(`Hi, please quote for: ${item.part_name} (${item.part_sku})\nQty: ${displayQty}\n\nSubmit quote: ${replyUrl}`)}`} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                                  <button className="cp-btn" style={{fontSize:11,padding:"3px 10px",color:"#25D366",borderColor:"rgba(37,211,102,.3)"}}>📲 WhatsApp</button>
                                </a>}
                                {s.email&&<a href={`mailto:${s.email}?subject=RFQ: ${item.part_name}&body=${encodeURIComponent(`Please quote for:\n${item.part_name} (${item.part_sku})\nQty: ${displayQty}\n\nSubmit quote here: ${replyUrl}`)}`} style={{textDecoration:"none"}}>
                                  <button className="cp-btn" style={{fontSize:11,padding:"3px 10px"}}>✉ Email</button>
                                </a>}
                                <button className="cp-btn" style={{fontSize:11,padding:"3px 10px"}} onClick={()=>navigator.clipboard.writeText(replyUrl)}>🔗 Copy Link</button>
                                <a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                                  <button className="cp-btn" style={{fontSize:11,padding:"3px 10px",color:"var(--blue)"}}>↗ Open</button>
                                </a>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Price row */}
                              <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:4,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:20,fontFamily:"Rajdhani,sans-serif",
                                  color:isBest?"var(--green)":isSelected?"var(--accent)":"var(--text)"}}>
                                  {cur}{q.unit_price?.toLocaleString()}
                                  <span style={{fontSize:12,fontWeight:400,color:"var(--text3)",marginLeft:4}}>/ unit</span>
                                </span>
                                {lineTotal!=null&&<span style={{fontSize:13,fontWeight:600,color:"var(--text2)"}}>
                                  = {cur}{lineTotal.toLocaleString()} total
                                </span>}
                              </div>
                              {/* Meta row */}
                              <div style={{display:"flex",gap:12,fontSize:12,color:"var(--text3)",marginBottom:q.notes?4:8,flexWrap:"wrap"}}>
                                {q.stock_qty!=null&&<span>📦 Stock: <strong>{q.stock_qty}</strong></span>}
                                {q.lead_days!=null&&<span>⏱ Lead: <strong>{q.lead_days}d</strong></span>}
                              </div>
                              {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginBottom:8,padding:"4px 8px",background:"var(--surface3)",borderRadius:6}}>{q.notes}</div>}
                              {/* Action */}
                              {!isSelected
                                ? <button className="btn btn-ghost btn-sm" style={{color:"var(--accent)",borderColor:"rgba(251,146,60,.3)",width:"100%",marginTop:2}}
                                    onClick={()=>handleSelect(q.id,item.id)}>Select this quote</button>
                                : <button className="cp-btn" style={{fontSize:11,padding:"3px 10px",color:"var(--red)",borderColor:"rgba(239,68,68,.3)",width:"100%",marginTop:2}}
                                    onClick={()=>handleUnselect(q.id)}>Unselect</button>
                              }
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
                        <div style={{fontWeight:600,fontSize:13,cursor:"pointer",color:"var(--accent)",textDecoration:"underline dotted"}}
                          onClick={()=>onEditPart&&onEditPart(parts.find(p=>String(p.id)===String(item.part_id)))}>{item.part_name}</div>
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
                                    onClick={()=>navigator.clipboard.writeText(replyUrl)}>🔗</button>
                                  <a href={replyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}><button className="cp-btn" style={{fontSize:10,padding:"2px 8px",color:"var(--blue)"}}>↗</button></a>
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
                                      onClick={()=>handleSelect(q.id,item.id)}>Select</button>
                                  : <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,marginTop:4}}>
                                      <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11}}>✓ Selected</span>
                                      <button className="cp-btn" style={{fontSize:10,padding:"2px 8px",color:"var(--red)",borderColor:"rgba(239,68,68,.3)"}}
                                        onClick={()=>handleUnselect(q.id)}>Unselect</button>
                                    </div>
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
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📋 {t.rfqSession}</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{rfqSessions.length} {t.rfqSesCount}</p>
        </div>
        <button className="btn btn-primary" onClick={()=>{setView("create");setWStep(1);setWParts([]);setWSuppliers([]);}}>
          + {t.newRfq}
        </button>
      </div>
      <div className="card" style={{overflow:"hidden"}}>
        <table className="tbl">
          <thead><tr>{[t.name,t.status,t.parts,t.suppliers,t.rfqQuotes,t.rfqCreated,t.actions].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rfqSessions.map(s=>{
              const sItems=rfqItems.filter(i=>i.rfq_id===s.id);
              const sQuotes=rfqQuotes.filter(q=>q.rfq_id===s.id);
              const sSupps=[...new Set(sQuotes.map(q=>q.supplier_id))];
              const quotedCnt=sQuotes.filter(q=>q.status==="quoted").length;
              const statusColor={draft:"var(--text3)",sent:"var(--blue)",comparing:"var(--yellow)",ordered:"var(--green)"}[s.status]||"var(--text3)";
              const isOverdue=s.is_auto&&s.status==="pending"&&s.reply_deadline&&new Date(s.reply_deadline)<new Date();
              return (
                <tr key={s.id} style={isOverdue?{background:"rgba(251,146,60,.08)",outline:"1px solid rgba(251,146,60,.3)"}:{}}>
                  <td style={{fontWeight:600}}>
                    {s.name}
                    {s.is_auto&&<span style={{marginLeft:6,fontSize:11,color:"var(--text3)",fontWeight:400}}>auto</span>}
                  </td>
                  <td>
                    {isOverdue
                      ? <span className="badge" style={{background:"rgba(251,146,60,.2)",color:"#f97316",fontWeight:700}}>⚠️ Overdue</span>
                      : <span className="badge" style={{background:statusColor+"20",color:statusColor,textTransform:"capitalize"}}>{tSt(s.status)}</span>
                    }
                  </td>
                  <td style={{textAlign:"center"}}>{sItems.length}</td>
                  <td style={{textAlign:"center"}}>{sSupps.length}</td>
                  <td style={{textAlign:"center"}}>
                    <span style={{color:quotedCnt===sQuotes.length&&sQuotes.length>0?"var(--green)":"var(--text2)"}}>{quotedCnt}/{sQuotes.length}</span>
                  </td>
                  <td style={{color:"var(--text3)",fontSize:13}}>{s.created_at?.slice(0,10)}</td>
                  <td style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button className="btn btn-info btn-xs" onClick={()=>openSession(s)}>{t.rfqView}</button>
                    {isOverdue&&onResendStale&&<button className="btn btn-xs" style={{background:"#f97316",color:"#fff",border:"none"}} onClick={async()=>{await onResendStale();onRefresh();}}>Resend</button>}
                  </td>
                </tr>
              );
            })}
            {rfqSessions.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:36,color:"var(--text3)"}}>{t.rfqNoSessions}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PICKING PAGE — Order picking with barcode/QR scan + camera
// ═══════════════════════════════════════════════════════════════
export function PickingPage({orders=[], parts=[], onComplete, onRefresh, t, lang}) {
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
// In-app photo clipboard — persists across modal opens within the session
let _appPhotoClip = null; // { url, fromSku }

// PART PHOTO UPLOADER
// Uses Google Apps Script Web App to upload to Google Drive
// ═══════════════════════════════════════════════════════════════
export function PartPhotoUploader({imageUrl, onChange, sku, t, bucket=""}) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [dragOver, setDragOver]   = useState(false);
  const [error, setError]         = useState(null);
  const [zoomed, setZoomed]       = useState(false);
  const [showFlipPopup, setShowFlipPopup] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [hasClip, setHasClip]     = useState(!!_appPhotoClip);
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

  const _processImage = async (file) => {
    // Step 1: AI background removal
    let processedBlob;
    try {
      processedBlob = await removeBackground(file, {
        publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/",
        progress: (_key, current, total) => {
          if (total > 0) setUploadStatus(`Removing background… ${Math.round(current/total*100)}%`);
        },
      });
    } catch { processedBlob = file; }
    // Step 2: Draw on white canvas, resize to 1200px → Blob
    setUploadStatus("Processing…");
    const MAX = 1200;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(processedBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.92);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const uploadToGDrive = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }

    setUploading(true); setError(null);
    setUploadStatus("Removing background…");
    try {
      const blob = await _processImage(file);
      setUploadStatus("Uploading…");

      if (bucket) {
        // ── Supabase Storage ──
        const _ts = Date.now();
        const _sku = String(sku||"part").replace(/[^a-zA-Z0-9_-]/g,"_");
        const path = `parts/${_sku}/${_ts}.jpg`;
        const url = await uploadToStorage(bucket, path, blob);
        onChange(url); setError(null);
      } else {
        // ── Google Drive (Apps Script) ──
        if (!SCRIPT_URL) { setError("⚙️ Apps Script URL not configured. Go to Settings → System to set it up."); return; }
        const base64 = await new Promise((res, rej) => { const fr=new FileReader(); fr.onload=e=>res(e.target.result); fr.onerror=rej; fr.readAsDataURL(blob); });
        const resp = await fetch(SCRIPT_URL, { method:"POST", body:JSON.stringify({image:base64, filename:`${sku||"part_"+Date.now()}.jpg`, mimeType:"image/jpeg"}) });
        const result = await resp.json();
        if (result.success) { onChange(result.url); setError(null); }
        else { setError("Upload failed: " + result.error); }
      }
    } catch (e) { setError("Upload error: " + e.message); }
    setUploadStatus(""); setUploading(false);
  };

  const flipPhoto = () => {
    if (!imageUrl) return;
    setError(null);
    setShowFlipPopup(true);
  };

  const _getFlippedBlob = async () => {
    const srcUrl = toImgUrl(imageUrl) || imageUrl;
    const r = await fetch(srcUrl, {credentials:"omit"});
    if (!r.ok) throw new Error("fetch failed");
    const blob = await r.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not an image");
    return new Promise((res, rej) => {
      const objUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const cv = document.createElement("canvas");
        const w = img.naturalWidth, h = img.naturalHeight;
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.translate(w, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        cv.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); rej(new Error("img load failed")); };
      img.src = objUrl;
    });
  };

  const saveFlipped = async () => {
    if (!imageUrl || (!SCRIPT_URL && !bucket)) return;
    setShowFlipPopup(false);
    setUploading(true); setUploadStatus("Saving flipped photo…"); setError(null);
    try {
      const flippedBlob = await _getFlippedBlob();
      if (bucket) {
        const _sku = String(sku||"part").replace(/[^a-zA-Z0-9_-]/g,"_");
        const path = `parts/${_sku}/${Date.now()}_flipped.jpg`;
        const url = await uploadToStorage(bucket, path, flippedBlob);
        onChange(url);
      } else {
        await uploadToGDrive(new File([flippedBlob], `${sku||"part"}_flipped.jpg`, {type:"image/jpeg"}));
      }
    } catch(e) { setError("Could not flip — try re-uploading the original photo first"); }
    setUploading(false); setUploadStatus("");
  };

  const copyFlippedToClipboard = async () => {
    setShowFlipPopup(false);
    if (!SCRIPT_URL && !bucket) {
      _appPhotoClip = {url: imageUrl, fromSku: sku};
      setHasClip(true); setCopied(true); setTimeout(() => setCopied(false), 2500);
      return;
    }
    setUploading(true); setUploadStatus("Preparing flipped copy…"); setError(null);
    try {
      const flippedBlob = await _getFlippedBlob();
      if (bucket) {
        const _sku = String(sku||"part").replace(/[^a-zA-Z0-9_-]/g,"_");
        const path = `parts/${_sku}/${Date.now()}_flip_copy.jpg`;
        const url = await uploadToStorage(bucket, path, flippedBlob);
        _appPhotoClip = {url, fromSku: sku};
      } else {
        const base64 = await new Promise((res, rej) => { const fr=new FileReader(); fr.onload=e=>res(e.target.result); fr.onerror=rej; fr.readAsDataURL(flippedBlob); });
        const resp = await fetch(SCRIPT_URL, { method:"POST", body:JSON.stringify({image:base64, filename:`${sku||"part"}_flip_copy.jpg`, mimeType:"image/jpeg"}) });
        const result = await resp.json();
        _appPhotoClip = {url: (result.success && result.url) ? result.url : imageUrl, fromSku: sku};
      }
    } catch { _appPhotoClip = {url: imageUrl, fromSku: sku}; }
    setHasClip(true); setCopied(true); setTimeout(() => setCopied(false), 2500);
    setUploading(false); setUploadStatus("");
  };

  const preview = imageUrl ? toImgUrl(imageUrl) : null;

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
        onChange={e => uploadToGDrive(e.target.files[0])}/>

      {/* Photo zone */}
      <div
        onClick={() => !uploading && !preview && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadToGDrive(e.dataTransfer.files[0]); }}
        style={{
          borderRadius: 10,
          height: 150,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: uploading ? "wait" : preview ? "default" : "pointer",
          background: dragOver ? "rgba(251,146,60,.07)" : "var(--surface2)",
          border: `2px dashed ${dragOver ? "var(--accent)" : preview ? "transparent" : "var(--border)"}`,
          position: "relative", overflow: "hidden", marginBottom: 8,
          transition: "border-color .15s, background .15s",
        }}>
        {uploading ? (
          <div style={{textAlign:"center",color:"var(--accent)",padding:"0 12px"}}>
            <div style={{width:26,height:26,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/>
            <div style={{fontSize:12,fontWeight:600}}>{uploadStatus||t.phuUploading}</div>
            {uploadStatus.startsWith("Removing")&&<div style={{fontSize:10,color:"var(--text3)",marginTop:3}}>First use downloads AI model (~50MB)</div>}
          </div>
        ) : preview ? (
          <>
            <img src={preview} alt="part"
              style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",cursor:"zoom-in",display:"block"}}
              onClick={e=>{e.stopPropagation();setZoomed(true);}}
              onError={e=>e.target.style.display="none"}/>
            <button
              title="Flip photo horizontally"
              onClick={e=>{e.stopPropagation();flipPhoto();}}
              style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.58)",border:"none",
                borderRadius:6,padding:"3px 8px",fontSize:12,color:"#fff",cursor:"pointer"}}>
              ↔ Flip
            </button>
            <button
              onClick={e=>{e.stopPropagation();fileRef.current?.click();}}
              style={{position:"absolute",bottom:6,right:6,background:"rgba(0,0,0,.48)",border:"none",
                borderRadius:6,padding:"3px 8px",fontSize:11,color:"#fff",cursor:"pointer"}}>
              🔄 Replace
            </button>
            <div style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,.38)",
              borderRadius:5,padding:"2px 6px",fontSize:10,color:"rgba(255,255,255,.8)",pointerEvents:"none"}}>
              🔍 click to zoom
            </div>
          </>
        ) : (
          <div style={{textAlign:"center",color:"var(--text3)",pointerEvents:"none"}}>
            <div style={{fontSize:30,marginBottom:6}}>📷</div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{t.phuDrop||"Click or drop photo"}</div>
            <div style={{fontSize:11,opacity:.7}}>{t.phuAutoUpload||"Auto-uploaded to Drive"}</div>
          </div>
        )}
      </div>

      {/* Copied toast */}
      {copied&&(
        <div style={{fontSize:11,color:"var(--green)",background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:7,padding:"6px 10px",marginBottom:6,textAlign:"center",fontWeight:600}}>
          ✓ Saved! Open the other part and click Paste Photo
        </div>
      )}

      {/* Action strip */}
      <div style={{display:"flex",gap:5,marginBottom:7}}>
        {/* App clipboard paste — shown when a photo was copied via Flip */}
        {hasClip&&!imageUrl&&(
          <button className="btn btn-sm" style={{flex:1,fontSize:11,background:"rgba(34,197,94,.12)",borderColor:"rgba(34,197,94,.4)",color:"var(--green)",fontWeight:700}}
            onClick={()=>{
              onChange(_appPhotoClip.url);
              _appPhotoClip=null;
              setHasClip(false);
            }}>
            📋 Paste Photo{_appPhotoClip?.fromSku?" ("+_appPhotoClip.fromSku+")":""}
          </button>
        )}
        {/* System clipboard / browse */}
        {(!hasClip||imageUrl)&&(
          <button className="btn btn-ghost btn-sm" style={{flex:1,fontSize:11}}
            onClick={async()=>{
              try{
                const items = await navigator.clipboard.read();
                for(const item of items){
                  const imgType = item.types.find(t=>t.startsWith("image/"));
                  if(imgType){
                    const blob = await item.getType(imgType);
                    uploadToGDrive(new File([blob],`${sku||"part"}.png`,{type:"image/png"}));
                    return;
                  }
                }
                fileRef.current?.click();
              }catch{ fileRef.current?.click(); }
            }}>
            📋 {t.phuPasteClipboard||"Paste"}
          </button>
        )}
        {imageUrl&&(
          <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:"var(--red)",flexShrink:0}}
            title="Remove photo"
            onClick={()=>onChange("")}>🗑</button>
        )}
      </div>

      {/* URL strip */}
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <input className="inp" type="url" value={imageUrl||""} style={{fontSize:11,flex:1,padding:"6px 9px"}}
          onChange={e=>onChange(e.target.value)}
          placeholder={t.phuUrlPlaceholder||"Paste Drive share link…"}/>
        <button className="cp-btn" title="Paste URL from clipboard"
          onClick={async()=>{try{const u=await navigator.clipboard.readText();if(u)onChange(u);}catch{}}}>
          📥
        </button>
      </div>
      {imageUrl&&<div style={{fontSize:10,color:"var(--text3)",marginTop:3}}>{t.gdrive_hint}</div>}

      {error&&(
        <div style={{fontSize:11,color:"var(--red)",marginTop:7,padding:"6px 10px",background:"rgba(248,113,113,.1)",borderRadius:7}}>
          {error}
        </div>
      )}

      {/* Flip preview popup — CSS transform, no CORS needed */}
      {showFlipPopup&&preview&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"var(--surface)",borderRadius:16,padding:24,maxWidth:340,width:"90vw",boxShadow:"0 16px 48px rgba(0,0,0,.5)"}}>
            <div style={{fontWeight:700,fontSize:15,marginBottom:3,textAlign:"center"}}>↔ Flipped Preview</div>
            <div style={{fontSize:11,color:"var(--text3)",textAlign:"center",marginBottom:12}}>
              Save as this part's photo, or copy to clipboard to paste into the opposite-side part
            </div>
            <div style={{background:"var(--surface2)",borderRadius:10,padding:10,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",minHeight:160}}>
              <img src={preview} alt="flipped"
                style={{maxWidth:"100%",maxHeight:200,objectFit:"contain",transform:"scaleX(-1)",display:"block"}}
                onError={e=>e.target.style.opacity="0.3"}/>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-ghost btn-sm" style={{flex:"1 1 60px"}}
                onClick={()=>{setShowFlipPopup(false);setError(null);}}>✕ Cancel</button>
              <button className="btn btn-primary btn-sm" style={{flex:"2 1 120px",background:"var(--accent)",border:"none"}}
                onClick={saveFlipped}>
                ↔ Save as This Part
              </button>
              <button className="btn btn-primary btn-sm" style={{flex:"2 1 120px",background:"var(--green)",border:"none"}}
                onClick={copyFlippedToClipboard}>
                📋 Copy to Other Part
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen lightbox */}
      {zoomed&&preview&&(
        <div onClick={()=>setZoomed(false)}
          style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={toFullUrl(imageUrl)||preview} alt="part"
            style={{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",borderRadius:10,boxShadow:"0 8px 48px rgba(0,0,0,.6)"}}
            onError={e=>{e.target.src=preview;}}
            onClick={e=>e.stopPropagation()}/>
          <button onClick={()=>setZoomed(false)}
            style={{position:"absolute",top:18,right:22,background:"rgba(255,255,255,.12)",border:"none",borderRadius:"50%",width:38,height:38,fontSize:20,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLE FITMENT TAB — inside PartModal
// ═══════════════════════════════════════════════════════════════
export function VehicleFitmentTab({part, vehicles, partFitments, onAdd, onDelete, onGoVehicles, initialSearch="", t}) {
  const [search,  setSearch]  = useState(initialSearch);
  const [pending, setPending] = useState(new Set()); // selected but not yet saved
  const [saving,  setSaving]  = useState(false);
  const [toDelete,setToDelete]= useState(new Set()); // marked for removal
  const [lightbox, setLightbox] = useState(null); // {urls,labels,idx}

  const openVehicleLightbox = (v) => {
    const entries = [
      {key:"photo_front", label:"Front"},
      {key:"photo_rear",  label:"Rear"},
      {key:"photo_side",  label:"Side"},
    ].filter(e=>v[e.key]);
    if(!entries.length) return;
    setLightbox({ urls: entries.map(e=>toFullUrl(v[e.key])), labels: entries.map(e=>e.label), idx: 0 });
  };

  const linked    = partFitments; // already filtered by part_id
  const linkedIds = new Set(linked.map(f => String(f.vehicle_id)));

  // Derive vehicle code from SKU prefix (e.g. "BM01C" from "BM01C-054GL")
  const skuCode = (part.sku||"").split(/[-\s]/)[0].toUpperCase();
  const skuMatches = skuCode.length >= 3
    ? vehicles.filter(v => v.code && v.code.toUpperCase() === skuCode && !linkedIds.has(String(v.id)) && !pending.has(String(v.id)))
    : [];

  const filtered = vehicles.filter(v => {
    if(linkedIds.has(String(v.id))) return false; // already linked
    if(pending.has(String(v.id))) return false;    // already selected
    if(!search.trim()) return true;
    const s = search.toLowerCase();
    return `${v.make} ${v.model} ${v.variant||""} ${v.engine||""} ${v.year_from} ${v.year_to||""} ${v.code||""}`.toLowerCase().includes(s);
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
      {lightbox&&<ImgLightbox urls={lightbox.urls} labels={lightbox.labels} startIdx={lightbox.idx}
        onClose={()=>setLightbox(null)}/>}
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
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:part?.oe_number?5:0}}>
          ✅ Linked Vehicles ({linked.length})
        </div>
        {part?.oe_number&&(
          <select className="inp" style={{fontSize:12,color:"#e65c00"}}
            value="" onChange={e=>{if(e.target.value)window.open(`https://spareto.com/products?utf8=%E2%9C%93&keywords=${encodeURIComponent(e.target.value)}`,"_blank","noopener,noreferrer");}}>
            <option value="">🔍 Search on SpareTO…</option>
            {part.oe_number.split(/[\s,;]+/).filter(Boolean).map((tok,i)=>(
              <option key={i} value={tok}>{tok}</option>
            ))}
          </select>
        )}
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
                {v.code&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,color:"var(--accent)",marginRight:6}}>{v.code}</span>}
                <span style={{fontWeight:600,fontSize:13,textDecoration:marked?"line-through":"none"}}>{v.make} {v.model}</span>
                <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}–{v.year_to||"now"}</span>
                {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                {v.engine&&<span style={{fontSize:11,color:"var(--blue)",marginLeft:6}}>🔧 {v.engine}</span>}
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {(v.photo_front||v.photo_rear||v.photo_side)&&(
                  <button className="btn btn-ghost btn-xs" title="Enlarge vehicle photos"
                    onClick={()=>openVehicleLightbox(v)}>
                    🔍 Photos
                  </button>
                )}
                <button className="btn btn-ghost btn-xs"
                  style={{color:marked?"var(--green)":"var(--red)"}}
                  onClick={()=>toggleDelete(f.id)}>
                  {marked ? "↩ Undo" : "✕"}
                </button>
              </div>
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

      {/* ── SKU auto-match suggestion ── */}
      {skuMatches.length > 0 && (
        <div style={{marginBottom:14,padding:"10px 12px",background:"rgba(52,211,153,.07)",border:"1px solid rgba(52,211,153,.3)",borderRadius:9}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
            🎯 SKU prefix "{skuCode}" matches {skuMatches.length} vehicle{skuMatches.length!==1?"s":""}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {skuMatches.map(v => (
              <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"7px 10px",borderRadius:7,background:"rgba(52,211,153,.06)",border:"1px solid rgba(52,211,153,.15)"}}>
                <div style={{fontSize:13}}>
                  <span style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,color:"var(--accent)",marginRight:6}}>{v.code}</span>
                  <span style={{fontWeight:600}}>{v.make} {v.model}</span>
                  {v.variant&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{v.variant}</span>}
                  <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{v.year_from}–{v.year_to||"now"}</span>
                  {v.engine&&<span style={{fontSize:11,color:"var(--blue)",marginLeft:6}}>🔧 {v.engine}</span>}
                </div>
                <button className="btn btn-ghost btn-xs" style={{color:"var(--green)",borderColor:"rgba(52,211,153,.4)",flexShrink:0}}
                  onClick={()=>toggle(String(v.id))}>+ Add</button>
              </div>
            ))}
          </div>
          {skuMatches.length > 1 && (
            <button className="btn btn-ghost btn-sm" style={{marginTop:8,color:"var(--green)",borderColor:"rgba(52,211,153,.4)",width:"100%"}}
              onClick={()=>skuMatches.forEach(v=>toggle(String(v.id)))}>
              + Add All {skuMatches.length} Matches
            </button>
          )}
        </div>
      )}

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
              {v.code&&<span style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,color:"var(--accent)",marginRight:6}}>{v.code}</span>}
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
// onFilter   — fitment-based filter (shop/POS): passes a Set of part IDs
// onVehicleChange — direct make/model filter (inventory): passes {make, model}
export function VehicleSearchBar({vehicles, partFitments, parts, onFilter, onVehicleChange, onAddPart, t, initialMake="", initialModel="", vin="", engineNo="", reg="", user=null, currentBranch=null}) {
  const [selMake,  setSelMake]  = useState(initialMake);
  const [selModel, setSelModel] = useState(initialModel);
  const [makeInput,  setMakeInput]  = useState(initialMake);
  const [modelInput, setModelInput] = useState("");
  const [active,   setActive]   = useState(false);
  const [lightbox, setLightbox] = useState(null); // {photos:[{url,label}], idx}
  const _vsbId = useRef(`vsb_${Math.random().toString(36).slice(2)}`).current;
  const [reqOpen,   setReqOpen]   = useState(false);
  const [reqSaving, setReqSaving] = useState(false);
  const [reqDone,   setReqDone]   = useState(false);
  const [reqForm,   setReqForm]   = useState({make:"",model:"",year_from:"",year_to:"",vin:"",engine_no:"",reg:"",notes:""});

  // Auto-apply filter when pre-populated from vehicle management
  useEffect(()=>{
    if(initialMake && vehicles.length > 0){
      applyFilter(initialMake, initialModel);
      if(initialModel){
        const opt=modelOpts.find(o=>o.val===initialModel);
        setModelInput(opt?opt.label:initialModel);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[vehicles.length > 0]);


  // Always derive makes/models from the vehicles table (clean data with codes)
  const makes = [...new Set(vehicles.map(v => v.make))].sort();
  const models = (() => {
    const filtered = vehicles.filter(v => !selMake || v.make === selMake);
    // Deduplicate by code (if present) or model name — keeps each generation separate
    const map = {};
    for (const v of filtered) {
      const key = v.code ? `code:${v.code}` : `model:${v.model}`;
      if (!map[key]) map[key] = { model: v.model, yearFrom: v.year_from, yearTo: v.year_to, code: v.code||"" };
      else {
        if (v.year_from && (!map[key].yearFrom || v.year_from < map[key].yearFrom)) map[key].yearFrom = v.year_from;
        if (!v.year_to || !map[key].yearTo || v.year_to > map[key].yearTo) map[key].yearTo = v.year_to;
      }
    }
    return Object.values(map).sort((a,b)=>(a.code||a.model).localeCompare(b.code||b.model));
  })();

  const applyFilter = (make, model) => {
    if (!make) {
      if(onFilter) onFilter(null);
      if(onVehicleChange) onVehicleChange(null);
      setActive(false);
      return;
    }
    // Code-first: if any vehicles have this exact code, use only those.
    // Fall back to model-name matching only for vehicles with no code.
    // This prevents a vehicle with code=HD45A and model=HD45F being included when selecting code HD45F.
    const matchVehicles = !model
      ? vehicles.filter(v => v.make === make)
      : (() => {
          const byCode = vehicles.filter(v => v.make === make && v.code === model);
          return byCode.length > 0
            ? byCode
            : vehicles.filter(v => v.make === make && v.model === model);
        })();

    // 1. Fitment-linked part IDs (part_fitments table)
    const vehicleIds = new Set(matchVehicles.map(v => String(v.id)));
    const fitmentIds = new Set(
      partFitments.filter(f => vehicleIds.has(String(f.vehicle_id))).map(f => String(f.part_id))
    );

    // 2. Code/SKU prefix matched part IDs
    const codes = new Set(matchVehicles.map(v => v.code).filter(Boolean));
    const codeIds = new Set(
      (parts||[]).filter(p => {
        if(!codes.size) return false;
        const sku=(p.sku||"").toUpperCase();
        const mod=(p.model||"").toUpperCase();
        return [...codes].some(c=>{
          const cu=c.toUpperCase();
          return sku.startsWith(cu+"-")||sku.startsWith(cu+" ")||sku===cu||mod.includes("["+cu+"]")||mod.includes(cu);
        });
      }).map(p=>String(p.id))
    );

    // 3. Part's own make/model fields match the vehicle (e.g. part tagged make=TOYOTA, model=COROLLA)
    const makeUp = make.toUpperCase();
    const vehicleModelNames = [...new Set(matchVehicles.map(v=>v.model).filter(Boolean))].map(m=>m.toUpperCase());
    const makeModelIds = new Set(
      (parts||[]).filter(p=>{
        if((p.make||"").toUpperCase() !== makeUp) return false;
        const pmod=(p.model||"").toUpperCase().trim();
        if(!pmod) return false;
        // When a specific vehicle code is selected, exact match only.
        // Substring matching causes cross-contamination between similar models:
        // "XV".includes("XV") and "XV 2.0 CVT".includes("XV") are both true,
        // so SB47A and SB47B would bleed into each other via vm.includes(pmod).
        if(model) return vehicleModelNames.some(vm=>pmod===vm);
        // For make-only queries (no code), allow broader matching so a general
        // part (model="XV") still shows when browsing all Subaru variants.
        return vehicleModelNames.some(vm=>pmod===vm||vm.includes(pmod)||pmod.includes(vm));
      }).map(p=>String(p.id))
    );

    // Union of all three strategies
    const allIds = new Set([...fitmentIds, ...codeIds, ...makeModelIds]);

    if(onVehicleChange){
      // Always pass a Set so the filter stays active; empty Set (sentinel) = 0 results, not "show all"
      onVehicleChange(allIds.size > 0 ? allIds : new Set(["__none__"]));
    } else if(onFilter){
      // Shop mode — empty sentinel when nothing matches
      onFilter(allIds.size > 0 ? allIds : new Set(["__none__"]));
    }
    setActive(true);
  };

  const clear = () => {
    setSelMake(""); setSelModel(""); setMakeInput(""); setModelInput("");
    if(onFilter) onFilter(null);
    if(onVehicleChange) onVehicleChange(null);
    setActive(false);
    setReqOpen(false); setReqDone(false);
  };

  // Build model display options (label → code/model value)
  const modelOpts = models.map(({model, yearFrom, yearTo, code})=>{
    const val = code||model;
    const yf = parseInt(yearFrom)>1900 ? String(parseInt(yearFrom)) : "";
    const yt = parseInt(yearTo)>1900 ? String(parseInt(yearTo)) : "";
    const yr = yf ? ` (${yf}–${yt||"present"})` : "";
    return { val, label:`${code?`[${code}] `:""}${model}${yr}` };
  });
  const modelLabelToVal = Object.fromEntries(modelOpts.map(o=>[o.label, o.val]));

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
        {/* Make — searchable datalist */}
        <datalist id={`${_vsbId}_makes`}>{makes.map(m=><option key={m} value={m}/>)}</datalist>
        <input className="inp" list={`${_vsbId}_makes`} value={makeInput}
          placeholder={t.selectMake||"Type make…"}
          style={{flex:"1 1 120px",minWidth:100}}
          onChange={e=>{
            const v=e.target.value;
            setMakeInput(v);
            if(makes.includes(v)){
              setSelMake(v); setSelModel(""); setModelInput("");
              applyFilter(v,"");
            } else if(!v){
              setSelMake(""); setSelModel(""); setModelInput("");
              if(onFilter) onFilter(null);
              if(onVehicleChange) onVehicleChange(null);
              setActive(false);
            }
          }}/>

        {/* Model — searchable datalist with clear button */}
        <datalist id={`${_vsbId}_models`}>{modelOpts.map(o=><option key={o.val} value={o.label}/>)}</datalist>
        <div style={{position:"relative",flex:"2 1 200px",minWidth:160}}>
          <input className="inp" list={`${_vsbId}_models`} value={modelInput}
            placeholder={selMake ? (t.selectModel||"Type model…") : "—"}
            disabled={!selMake}
            style={{width:"100%",paddingRight:modelInput?30:10}}
            onChange={e=>{
              const v=e.target.value;
              setModelInput(v);
              const code=modelLabelToVal[v];
              if(code!==undefined){
                setSelModel(code);
                applyFilter(selMake, code);
              } else if(!v){
                setSelModel("");
                applyFilter(selMake,"");
              }
            }}/>
          {modelInput&&(
            <button onClick={()=>{ setModelInput(""); setSelModel(""); applyFilter(selMake,""); }}
              style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                background:"none",border:"none",cursor:"pointer",color:"var(--text3)",
                fontSize:15,lineHeight:1,padding:2}}>✕</button>
          )}
        </div>
      </div>

      {/* Make not in database hint */}
      {makeInput.length>=2&&!active&&!makes.find(m=>m.toLowerCase()===makeInput.toLowerCase())&&!reqDone&&(
        <div style={{marginTop:8,fontSize:12,color:"var(--text3)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span>Make "{makeInput}" not in database.</span>
          {!reqOpen&&<button className="btn btn-ghost btn-xs" onClick={()=>{setReqOpen(true);setReqForm({make:makeInput.toUpperCase(),model:modelInput.toUpperCase(),year_from:"",year_to:"",vin,engine_no:engineNo,reg,notes:""});}}>+ Request this vehicle</button>}
        </div>
      )}

      {/* Vehicle photos + result info */}
      {active && (()=>{
        const matchV = !selModel
          ? vehicles.filter(v=>v.make===selMake)
          : (() => {
              const byCode = vehicles.filter(v=>v.make===selMake&&v.code===selModel);
              return byCode.length>0 ? byCode : vehicles.filter(v=>v.make===selMake&&v.model===selModel);
            })();
        const variants = [...new Set(matchV.map(v=>v.variant).filter(Boolean))];
        const variantLabel = variants.length === 1 ? variants[0] : "";
        const codes = [...new Set(matchV.map(v=>v.code).filter(Boolean))];
        const codeLabel = codes.length === 1 ? codes[0] : codes.length > 1 ? codes.join("/") : "";
        const photos = matchV.find(v=>v.photo_front||v.photo_rear||v.photo_side) || matchV[0];
        if(matchV.length===0) return (
          <div style={{marginTop:10,textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>"{selMake}{selModel?` · ${selModel}`:""}" not found in database</div>
            {!reqOpen&&!reqDone&&<button className="btn btn-ghost btn-sm" onClick={()=>{setReqOpen(true);setReqForm({make:selMake,model:selModel||modelInput,year_from:"",year_to:"",vin,engine_no:engineNo,reg,notes:""});}}> + Request this vehicle</button>}
            {reqDone&&<div style={{fontSize:12,color:"var(--green)",fontWeight:600,marginTop:4}}>✅ Request sent</div>}
          </div>
        );
        return (
          <div style={{marginTop:10}}>
            {/* 3 photos side by side — only when model is selected */}
            {selModel&&photos&&(photos.photo_front||photos.photo_rear||photos.photo_side)&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                {[
                  {url:photos.photo_front, label:"Front"},
                  {url:photos.photo_rear,  label:"Rear"},
                  {url:photos.photo_side,  label:"Side"},
                ].map(({url,label})=>(
                  <div key={label} style={{position:"relative",borderRadius:8,overflow:"hidden",
                    background:"var(--surface3)",height:195}}>
                    {url
                      ? <DriveImg url={url} alt={label}
                          style={{width:"100%",height:"100%",objectFit:"contain",cursor:"zoom-in"}}
                          onClick={()=>{
                            const all=[
                              {url:photos.photo_front,label:"Front"},
                              {url:photos.photo_rear, label:"Rear"},
                              {url:photos.photo_side, label:"Side"},
                            ].filter(p=>p.url);
                            setLightbox({photos:all, idx:all.findIndex(p=>p.url===url&&p.label===label)||0});
                          }}/>
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
              <span>🔍 {codeLabel ? `${codeLabel} · ` : ""}{selMake} {selModel}{variantLabel ? ` ${variantLabel}` : ""}</span>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {onAddPart&&<button className="btn btn-primary btn-xs" onClick={()=>{
                  const ids=vehicles.filter(v=>v.make===selMake&&(!selModel||v.code===selModel||v.model===selModel)).map(v=>v.id);
                  onAddPart(ids);
                }}>+ Add Part</button>}
                <button className="btn btn-ghost btn-xs" style={{color:"var(--text3)"}} onClick={clear}>✕ Show all parts</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Vehicle request form */}
      {reqDone&&<div style={{marginTop:8,padding:"8px 12px",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:8,fontSize:12,color:"var(--green)",fontWeight:600}}>✅ Vehicle request sent — admin will add it shortly.</div>}
      {reqOpen&&(
        <div style={{marginTop:10,background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.25)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--accent)"}}>🚗 Request New Vehicle</div>
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <input className="inp" placeholder="Make *" value={reqForm.make} onChange={e=>setReqForm(p=>({...p,make:e.target.value.toUpperCase()}))} style={{flex:"1 1 100px",textTransform:"uppercase"}}/>
            <input className="inp" placeholder="Model *" value={reqForm.model} onChange={e=>setReqForm(p=>({...p,model:e.target.value.toUpperCase()}))} style={{flex:"1 1 100px",textTransform:"uppercase"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input className="inp" placeholder="Year from *" type="number" value={reqForm.year_from} onChange={e=>setReqForm(p=>({...p,year_from:e.target.value}))} style={{flex:1}}/>
            <input className="inp" placeholder="Year to" type="number" value={reqForm.year_to} onChange={e=>setReqForm(p=>({...p,year_to:e.target.value}))} style={{flex:1}}/>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <input className="inp" placeholder="VIN" value={reqForm.vin} onChange={e=>setReqForm(p=>({...p,vin:e.target.value.toUpperCase()}))} style={{flex:"2 1 120px",fontFamily:"monospace",textTransform:"uppercase"}}/>
            <input className="inp" placeholder="Engine No" value={reqForm.engine_no} onChange={e=>setReqForm(p=>({...p,engine_no:e.target.value.toUpperCase()}))} style={{flex:"1 1 80px",fontFamily:"monospace",textTransform:"uppercase"}}/>
            <input className="inp" placeholder="Reg" value={reqForm.reg} onChange={e=>setReqForm(p=>({...p,reg:e.target.value.toUpperCase()}))} style={{flex:"1 1 70px",textTransform:"uppercase"}}/>
          </div>
          <input className="inp" placeholder="Notes (optional)" value={reqForm.notes} onChange={e=>setReqForm(p=>({...p,notes:e.target.value}))} style={{marginBottom:10}}/>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary btn-sm" disabled={reqSaving||!reqForm.make.trim()||!reqForm.model.trim()||!reqForm.year_from} onClick={async()=>{
              setReqSaving(true);
              try{
                await api.insert("vehicle_requests",{
                  make:reqForm.make.trim(),model:reqForm.model.trim(),
                  year_from:reqForm.year_from?+reqForm.year_from:null,
                  year_to:reqForm.year_to?+reqForm.year_to:null,
                  vin:reqForm.vin||null,engine_no:reqForm.engine_no||null,reg:reqForm.reg||null,
                  notes:reqForm.notes||null,
                  status:"pending",requested_by:user?.id||null,branch_id:currentBranch?.id||null,
                });
                setReqDone(true);setReqOpen(false);
              }catch{}finally{setReqSaving(false);}
            }}>{reqSaving?"Sending…":"Send Request"}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setReqOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)}
          style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"relative",maxWidth:"92vw",maxHeight:"90vh",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            <img src={toImgUrl(lightbox.photos[lightbox.idx].url)} alt={lightbox.photos[lightbox.idx].label}
              style={{maxWidth:"88vw",maxHeight:"78vh",objectFit:"contain",borderRadius:10,boxShadow:"0 8px 48px rgba(0,0,0,.6)"}}/>
            <div style={{color:"#fff",fontWeight:700,fontSize:15,letterSpacing:".05em"}}>{lightbox.photos[lightbox.idx].label}</div>
            {lightbox.photos.length>1&&(
              <div style={{display:"flex",gap:10}}>
                {lightbox.photos.map((p,i)=>(
                  <button key={p.label} onClick={()=>setLightbox(lb=>({...lb,idx:i}))}
                    style={{border:`2px solid ${i===lightbox.idx?"#fff":"rgba(255,255,255,.3)"}`,borderRadius:8,overflow:"hidden",
                      padding:0,cursor:"pointer",background:"none",opacity:i===lightbox.idx?1:.6,transition:"all .15s"}}>
                    <img src={toImgUrl(p.url)} alt={p.label} style={{width:80,height:54,objectFit:"cover",display:"block"}}/>
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>setLightbox(null)}
              style={{position:"absolute",top:-12,right:-12,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",
                width:32,height:32,fontSize:18,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VEHICLES MANAGEMENT PAGE  — drill-down: Makes → Models
// ═══════════════════════════════════════════════════════════════
export function VehiclesPage({vehicles, partFitments, onSave, onDelete, onViewInShop, onAddPart, t, jumpMake=null, jumpModel=null}) {
  const [selMake, setSelMake] = useState(jumpMake);  // null = makes level
  const [search,  setSearch]  = useState("");
  const [searchD, setSearchD] = useState("");
  const [highlightModel, setHighlightModel] = useState(jumpModel);

  useEffect(()=>{ if(jumpMake) setSelMake(jumpMake); },[jumpMake]);
  useEffect(()=>{ setHighlightModel(jumpModel); },[jumpModel]);
  const [editV,   setEditV]   = useState(null);

  useEffect(()=>{
    if(!jumpModel || !jumpMake) return;
    const match = vehicles.find(v=>
      v.make.toUpperCase()===jumpMake.toUpperCase() &&
      v.model.toUpperCase()===jumpModel.toUpperCase()
    );
    if(match) setEditV({...match});
  },[jumpModel, jumpMake, vehicles]);
  const [lightbox, setLightbox] = useState(null); // {urls,labels,idx}

  useEffect(()=>{
    const t=setTimeout(()=>setSearchD(search),300);
    return()=>clearTimeout(t);
  },[search]);

  const fitCount = (vid) => partFitments.filter(f=>String(f.vehicle_id)===String(vid)).length;

  // ── Level 1: makes summary ── only computed when at top level or data changes
  const makeStats = useMemo(()=>{
    if(selMake!==null) return [];
    const vIds = new Set(vehicles.map(v=>String(v.id)));
    const fitByVehicle = {};
    for(const f of partFitments){ const k=String(f.vehicle_id); fitByVehicle[k]=(fitByVehicle[k]||0)+1; }
    return [...new Set(vehicles.map(v=>v.make))].sort().map(make=>{
      const mvs = vehicles.filter(v=>v.make===make);
      const links = mvs.reduce((n,v)=>(fitByVehicle[String(v.id)]||0)+n,0);
      return { make, count: mvs.length, links };
    });
  },[vehicles, partFitments, selMake]);

  // ── Level 2: models for selected make (with optional search) ─
  const inMake = useMemo(()=>
    selMake!==null ? vehicles.filter(v=>v.make===selMake) : []
  ,[vehicles, selMake]);

  const filtered = useMemo(()=>
    inMake.filter(v=>{
      if(!searchD.trim()) return true;
      const s=searchD.toLowerCase();
      return `${v.model} ${v.variant||""} ${v.code||""} ${v.engine||""} ${v.year_from||""} ${v.year_to||""}`.toLowerCase().includes(s);
    }).sort((a,b)=>(a.code||"￿").localeCompare(b.code||"￿")||(a.model||"").localeCompare(b.model||""))
  ,[inMake, searchD]);

  const nextCodeFromList = (vList, make) => {
    const codes = vList.map(v=>(v.code||'').toUpperCase()).filter(Boolean).sort();
    if (!codes.length) {
      const prefix = (make||'').replace(/\s+/g,'').slice(0,2).toUpperCase() || 'XX';
      return prefix + '001A';
    }
    const last = codes[codes.length-1];
    const prefix = last.slice(0,2);
    const lastChar = last.slice(-1);
    if (lastChar >= 'A' && lastChar < 'Z') return last.slice(0,-1) + String.fromCharCode(lastChar.charCodeAt(0)+1);
    const num = parseInt(last.slice(2,-1),10)||1;
    return prefix + String(num+1).padStart(3,'0') + 'A';
  };
  // When search is active, base the new code on the visible filtered group.
  // When a model is provided, first try to find the model-group codes (e.g. "121" → MZ11x).
  const nextCodeForMake = (make, model) => {
    const pool = search.trim() && filtered.length ? filtered : inMake.length ? inMake : vehicles.filter(v=>v.make===make);
    if (model) {
      const token = model.split(/[\s\/\(]/)[0].toUpperCase();
      if (token.length >= 2) {
        const group = pool.filter(v=>v.model.toUpperCase().startsWith(token) && v.code);
        if (group.length > 0) return nextCodeFromList(group, make);
      }
    }
    return nextCodeFromList(pool, make);
  };

  const newVehicleDefaults = { make: selMake!==null?selMake:"GWM", model:"", code: nextCodeForMake(selMake!==null?selMake:"GWM"), year_from:"", year_to:"", engine:"", variant:"" };

  const openVehicleLightbox = (v, startKey) => {
    const entries = [
      {key:"photo_front", label:"Front"},
      {key:"photo_rear",  label:"Rear"},
      {key:"photo_side",  label:"Side"},
    ].filter(e=>v[e.key]);
    if(!entries.length) return;
    const startIdx = Math.max(0, entries.findIndex(e=>e.key===startKey));
    setLightbox({
      urls:   entries.map(e=>toFullUrl(v[e.key])),
      labels: entries.map(e=>e.label),
      idx:    startIdx,
    });
  };

  return (
  <>
    {lightbox&&<ImgLightbox urls={lightbox.urls} labels={lightbox.labels} startIdx={lightbox.idx}
      onClose={()=>setLightbox(null)}/>}
    <div className="fu">

      {/* ── Header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {selMake!==null&&(
            <button className="btn btn-ghost btn-sm" onClick={()=>{setSelMake(null);setSearch("");setSearchD("");}}>
              ← Back
            </button>
          )}
          <div>
            <h1 style={{fontSize:20,fontWeight:700}}>
              🚗 {selMake!==null ? (selMake||"(No Make)") : (t.vehicleMgmt||"Vehicle Management")}
            </h1>
            <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
              {selMake!==null
                ? `${inMake.length} model${inMake.length!==1?"s":""}`
                : `${makeStats.length} makes · ${vehicles.length} vehicles`}
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={()=>setEditV(newVehicleDefaults)}>
          + {t.addVehicle||"Add Vehicle"}
        </button>
      </div>

      {/* ── Level 1: Makes grid ── */}
      {selMake===null&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
          {makeStats.map(({make,count,links})=>(
            <div key={make} className="card card-hover" style={{padding:"16px 18px",cursor:"pointer"}}
              onClick={()=>{setSelMake(make);setSearch("");}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{make}</div>
              <div style={{fontSize:12,color:"var(--text3)"}}>{count} model{count!==1?"s":""}</div>
              <div style={{fontSize:12,color:"var(--blue)",marginTop:2}}>🔗 {links} fitments</div>
            </div>
          ))}
          {makeStats.length===0&&(
            <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)",gridColumn:"1/-1"}}>
              No vehicles yet — add one to get started
            </div>
          )}
        </div>
      )}

      {/* ── Level 2: Models for selected make ── */}
      {selMake!==null&&(<>
        {/* Search within make */}
        <div style={{position:"relative",marginBottom:16}}>
          <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder={`Search in ${selMake}...`}/>
          {search&&<button onClick={()=>{setSearch("");setSearchD("");}}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:16}}>✕</button>}
        </div>

        {filtered.length===0&&(
          <div className="card" style={{textAlign:"center",padding:36,color:"var(--text3)"}}>No vehicles found</div>
        )}

        {/* Model list with thumbnails */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(v=>{
            const thumb = v.photo_front||v.photo_rear||v.photo_side;
            const thumbUrl = thumb ? toImgUrl(thumb) : null;
            const hasPhotos = !!(v.photo_front||v.photo_rear||v.photo_side);
            const needsEdit = highlightModel && v.model.toUpperCase()===highlightModel.toUpperCase();
            return (
            <div key={v.id} className="card" style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
              ...(needsEdit?{border:"2px solid var(--accent)",background:"rgba(249,115,22,.04)"}:{})}}>
              {/* Photo thumbnail */}
              <div style={{flexShrink:0,width:160,height:160,borderRadius:10,overflow:"hidden",
                background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",
                cursor:hasPhotos?"zoom-in":"default"}}
                onClick={()=>hasPhotos&&openVehicleLightbox(v,"photo_front")}>
                {thumbUrl
                  ? <img src={thumbUrl} alt="vehicle" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <span style={{fontSize:24,opacity:.3}}>🚗</span>}
              </div>
              {/* Main info */}
              <div style={{flex:1,minWidth:140}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:14}}>{v.model}</span>
                  {needsEdit&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"rgba(249,115,22,.15)",color:"var(--accent)",fontWeight:700}}>Needs editing</span>}
                </div>
                {v.code&&<div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--accent)",fontWeight:700,marginTop:1}}>{v.code}</div>}
                <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                  {v.year_from}–{v.year_to||"present"}
                  {v.engine&&<span style={{marginLeft:8,color:"var(--blue)"}}>🔧 {v.engine}</span>}
                  {v.variant&&<span style={{marginLeft:8,color:"var(--text3)"}}>{v.variant}</span>}
                </div>
              </div>
              {/* Fitment count — click to view in shop */}
              <span className="badge" style={{background:"rgba(96,165,250,.12)",color:"var(--blue)",flexShrink:0,
                cursor:onViewInShop?"pointer":"default"}}
                onClick={()=>onViewInShop&&onViewInShop(v.make,v.model)}
                title="View linked parts in shop">
                🔗 {fitCount(v.id)} parts
              </span>
              {/* Actions */}
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                {onViewInShop&&<button className="btn btn-ghost btn-xs" style={{color:"var(--green)",borderColor:"var(--green)"}}
                  onClick={()=>onViewInShop(v.make,v.model)}>🛒 Shop</button>}
                {onAddPart&&<button className="btn btn-ghost btn-xs" style={{color:"var(--accent)",borderColor:"var(--accent)"}}
                  onClick={()=>onAddPart(v)} title={`Add new part with SKU ${v.code}-`}>+ Part</button>}
                <button className="btn btn-ghost btn-xs" onClick={()=>{setEditV({...v});setHighlightModel(null);}}>✏️ Edit</button>
                <button className="btn btn-danger btn-xs"
                  onClick={()=>{if(window.confirm(`Delete ${v.make} ${v.model}?`))onDelete(v.id);}}>🗑</button>
              </div>
            </div>
          );
          })}
        </div>
      </>)}

      {selMake!==null&&(
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
          <button className="btn btn-primary" onClick={()=>setEditV(newVehicleDefaults)}>
            + {t.addVehicle||"Add Vehicle"}
          </button>
        </div>
      )}

    </div>

    {editV&&(
      <ErrorBoundary name="VehicleModal">
        <VehicleModal vehicle={editV} onSave={async(data)=>{ await onSave(data); setEditV(null); }}
          onClose={()=>setEditV(null)} t={t} nextCodeForMake={nextCodeForMake}/>
      </ErrorBoundary>
    )}
  </>
  );
}

// ── Vehicle Add/Edit Modal ──
function VehicleModal({vehicle, onSave, onClose, t, nextCodeForMake}) {
  const isNew = !vehicle.id;
  const [f, setF] = useState({
    id:          vehicle.id||null,
    make:        vehicle.make||"GWM",
    model:       vehicle.model||"",
    code:        vehicle.code||"",
    year_from:   vehicle.year_from||"",
    year_to:     vehicle.year_to||"",
    engine:      vehicle.engine||"",
    variant:     vehicle.variant||"",
    photo_front: vehicle.photo_front||"",
    photo_rear:  vehicle.photo_rear||"",
    photo_side:  vehicle.photo_side||"",
  });
  const codeUserEdited = useRef(false);
  const s = (k,v) => {
    if (k==="code") codeUserEdited.current = true;
    if (k==="make" && isNew && !codeUserEdited.current && nextCodeForMake)
      setF(p=>({...p, make:v, code: nextCodeForMake(v, p.model)}));
    else
      setF(p=>({...p,[k]:v}));
  };
  const [err, setErr] = useState({});
  const [codeErr, setCodeErr] = useState("");

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
          <input className="inp" value={f.make} onChange={e=>s("make",e.target.value.toUpperCase())}
            placeholder="GWM, TOYOTA, FORD..." style={{borderColor:err.make?"var(--red)":undefined,textTransform:"uppercase"}}/>
          {err.make&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.make}</div>}
        </div>
        <div>
          <FL label="Model *"/>
          <input className="inp" value={f.model} onChange={e=>s("model",e.target.value.toUpperCase())}
            placeholder="P-SERIES, HILUX..." style={{borderColor:err.model?"var(--red)":undefined,textTransform:"uppercase"}}/>
          {err.model&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.model}</div>}
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Year From *"/>
          <input className="inp" type="number" value={f.year_from} onChange={e=>s("year_from",e.target.value===""?"":+e.target.value)}
            placeholder="2020" style={{borderColor:err.year_from?"var(--red)":undefined}}/>
          {err.year_from&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {err.year_from}</div>}
        </div>
        <div>
          <FL label="Year To"/>
          <input className="inp" type="number" value={f.year_to} onChange={e=>s("year_to",e.target.value===""?"":+e.target.value)}
            placeholder="2024 (leave blank = present)"/>
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Model Code"/>
          <input className="inp" value={f.code} onChange={e=>{s("code",e.target.value.toUpperCase());setCodeErr("");}}
            placeholder="FD50A, BA3, GJ..." style={{borderColor:codeErr?"var(--red)":undefined,textTransform:"uppercase"}}/>
          {codeErr&&<div style={{fontSize:11,color:"var(--red)",marginTop:3}}>⚠ {codeErr}</div>}
          {!f.code && nextCodeForMake&&(()=>{const sugg=nextCodeForMake(f.make,f.model);return sugg?(
            <div style={{marginTop:4,fontSize:11,color:"var(--text3)",display:"flex",alignItems:"center",gap:6}}>
              Suggested:
              <button type="button" onClick={()=>{s("code",sugg);codeUserEdited.current=true;}}
                style={{fontFamily:"DM Mono,monospace",fontSize:11,fontWeight:700,color:"var(--accent)",
                  background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",
                  borderRadius:5,padding:"1px 8px",cursor:"pointer"}}>
                {sugg}
              </button>
            </div>
          ):null;})()}
        </div>
        <div>
          <FL label="Variant"/>
          <input className="inp" value={f.variant} onChange={e=>s("variant",e.target.value.toUpperCase())}
            placeholder="SX 4X4, DOUBLE-CAB, LT..." style={{textTransform:"uppercase"}}/>
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Engine"/>
          <input className="inp" value={f.engine} onChange={e=>s("engine",e.target.value.toUpperCase())}
            placeholder="2.0TD, 1.5T, 2.8GD6..." style={{textTransform:"uppercase"}}/>
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
                bucket="cars_parts"
                onChange={v=>s(key,v)}/>
            ))}
          </div>
        : <div style={{textAlign:"center",padding:16,background:"var(--surface2)",borderRadius:10,color:"var(--text3)",fontSize:13}}>
            💾 Save the vehicle first, then add photos
          </div>
      }

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={async()=>{
          if(!validate()) return;
          try{ await onSave(f); }
          catch(e){ if(e.message==="code_exists") setCodeErr("Code already exists in database"); }
        }}>
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
export function VehiclePhotoUploader({label, url, vehicleId, make, reg, viewName, onChange, bucket=""}) {
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
    const plate = String(reg||vehicleId||"").replace(/\s/g,"").toUpperCase();
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

  // Resize image to JPEG blob (shared by both upload paths)
  const resizeToBlob = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas toBlob failed")), "image/jpeg", 0.92);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const uploadToSupabase = async (file) => {
    const _now=new Date(), _p=n=>String(n).padStart(2,"0");
    const _dt=`${_now.getFullYear()}${_p(_now.getMonth()+1)}${_p(_now.getDate())}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
    const _plate=String(reg||vehicleId||"vehicle").replace(/[\s/\\]/g,"_").toUpperCase();
    const path = `ws_vehicles/${_plate}/${_dt}_${viewName}.jpg`;
    setStatus("Uploading...");
    const blob = await resizeToBlob(file);
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "PUT",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: blob,
    });
    if (!resp.ok) { const t=await resp.text(); throw new Error(t||resp.statusText); }
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  };

  const uploadToGoogleDrive = async (file) => {
    const SCRIPT_URL = getScriptUrl();
    if (!SCRIPT_URL) throw new Error("⚙️ Set Vehicle Photos Apps Script URL in Settings first");
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) { const r = Math.min(MAX/w, MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const _now=new Date(), _p=n=>String(n).padStart(2,"0");
    const _date=`${_now.getFullYear()}-${_p(_now.getMonth()+1)}-${_p(_now.getDate())}`;
    const _dt=`${_date.replace(/-/g,"")}_${_p(_now.getHours())}${_p(_now.getMinutes())}${_p(_now.getSeconds())}`;
    const _plate=String(reg||vehicleId||"vehicle").replace(/\s/g,"").toUpperCase();
    const folderPath = "Tim_Car_Phot/" + _plate + "/" + _date;
    const filename = _dt + "_" + viewName + ".jpg";
    setStatus("Uploading " + filename + "...");
    const uploadResp = await fetch(SCRIPT_URL, { method:"POST", body:JSON.stringify({image:base64,filename,mimeType:"image/jpeg",folderPath}) });
    const result = await uploadResp.json();
    if (!result.success) throw new Error(result.error || "Upload failed");
    return result.url;
  };

  const upload = async (file) => {
    if (!file) return;
    const isImg = file.type.startsWith("image/") || file.type==="" ||
      /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
    if (!isImg) { setError("Image files only"); return; }

    setUploading(true); setError(null);
    try {
      setStatus("Resizing image...");
      const resultUrl = bucket
        ? await uploadToSupabase(file)
        : await uploadToGoogleDrive(file);
      onChange(resultUrl);
      setStatus(""); setError(null);
    } catch(e) {
      setError("❌ " + e.message);
      setStatus("");
    }
    setUploading(false);
  };

  const driveId = !bucket && extractDriveId(url);
  const preview = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w400` : (url||null);

  const [actionSheet, setActionSheet] = useState(false);
  const [lightbox,    setLightbox]    = useState(false);

  const pasteFromClipboard = async () => {
    setActionSheet(false);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          upload(new File([blob], `${viewName||label||"photo"}.png`, {type:imgType}));
          return;
        }
      }
      alert("No image found in clipboard — copy an image first.");
    } catch {
      fileRef.current?.click();
    }
  };

  return (
    <div style={{position:"relative"}}>
      {lightbox && <ImgLightbox url={url} onClose={()=>setLightbox(false)}/>}
      {/* Hidden file inputs */}
      <input ref={fileRef} type="file" style={{display:"none"}}
        onChange={e => { upload(e.target.files[0]); e.target.value=""; }}/>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
        onChange={e => { upload(e.target.files[0]); e.target.value=""; }}/>

      {/* Photo tile — tap to open action sheet */}
      <div
        onClick={() => !uploading && setActionSheet(true)}
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
        {uploading ? (
          <div style={{textAlign:"center",color:"var(--accent)",padding:8}}>
            <div style={{width:24,height:24,border:"3px solid rgba(251,146,60,.2)",borderTop:"3px solid var(--accent)",
              borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 6px"}}/>
            <div style={{fontSize:11,maxWidth:120,margin:"0 auto",lineHeight:1.4}}>{status||"Uploading..."}</div>
          </div>
        ) : preview ? (
          <>
            <DriveImg url={url} alt={label} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.35)",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{background:"rgba(0,0,0,.55)",color:"#fff",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600}}>
                ✏️ Change
              </div>
            </div>
            <button
              onClick={e=>{ e.stopPropagation(); setLightbox(true); }}
              title="Enlarge"
              style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",
                border:"none",borderRadius:6,color:"#fff",fontSize:14,cursor:"pointer",
                padding:"3px 7px",lineHeight:1,zIndex:1}}>
              ⛶
            </button>
          </>
        ) : (
          <div style={{textAlign:"center",color:"var(--text3)",padding:8}}>
            <div style={{fontSize:26,marginBottom:4}}>📷</div>
            <div style={{fontSize:11,fontWeight:600}}>{label}</div>
            <div style={{fontSize:10,marginTop:2}}>Tap to add</div>
          </div>
        )}
      </div>

      {/* Label */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginTop:5,textAlign:"center",textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>

      {/* Error */}
      {error && <div style={{fontSize:10,color:"var(--red)",marginTop:3,textAlign:"center"}}>{error}</div>}

      {/* Action sheet */}
      {actionSheet && (
        <div onClick={()=>setActionSheet(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:10000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"var(--surface)",borderRadius:"16px 16px 0 0",padding:"16px 16px 28px",width:"100%",maxWidth:420}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:14,textAlign:"center",color:"var(--text2)",textTransform:"uppercase",letterSpacing:".06em"}}>
              {label} Photo
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:url?12:0}}>
              <button className="btn btn-ghost"
                style={{padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:600}}
                onClick={()=>{ setActionSheet(false); camRef.current?.click(); }}>
                <span style={{fontSize:28}}>📷</span>Camera
              </button>
              <button className="btn btn-ghost"
                style={{padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:600}}
                onClick={()=>{ setActionSheet(false); fileRef.current?.click(); }}>
                <span style={{fontSize:28}}>🖼️</span>Files
              </button>
              <button className="btn btn-ghost"
                style={{padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:600,
                  color:"var(--blue)",opacity:(reg||vehicleId)?1:0.4}}
                onClick={()=>{ setActionSheet(false); openBrowse(); }}>
                <span style={{fontSize:28}}>☁️</span>Drive
              </button>
              <button className="btn btn-ghost"
                style={{padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:13,fontWeight:600}}
                onClick={pasteFromClipboard}>
                <span style={{fontSize:28}}>📋</span>Paste
              </button>
            </div>
            {url && (
              <button className="btn btn-ghost"
                style={{width:"100%",padding:"12px 8px",fontSize:13,fontWeight:600,color:"var(--red)"}}
                onClick={()=>{ setActionSheet(false); onChange(""); }}>
                🗑️ Remove Photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drive photo picker */}
      {browsing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setBrowsing(false)}>
          <div style={{background:"var(--surface)",borderRadius:"12px 12px 0 0",padding:16,width:"100%",maxWidth:600,maxHeight:"75vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:14}}>
                ☁️ Google Drive — <code style={{fontFamily:"DM Mono,monospace",fontSize:12,color:"var(--blue)"}}>Tim_Car_Phot / {String(reg||vehicleId||"").replace(/\s/g,"").toUpperCase()}</code>
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

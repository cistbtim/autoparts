import { useState, useEffect } from "react";
import { getSettings, curSym } from "../../lib/settings.js";
import { waLink } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG } from "../shared.jsx";

export function WsCreatePoFromJobModal({job,wsSupplierQuotes=[],wsSupplierRequests=[],sqReplies=[],wsSuppliers=[],settings,onSave,onViewPOs,onClose}) {
  const C=curSym(settings?.currency||getSettings().currency);

  // Build groups: one entry per supplier, merging manual quotes + digital replies
  const groupMap={};
  const addToGroup=(supplierId,supplierName,items,quoteRef)=>{
    const key=supplierName||supplierId||"unknown";
    if(!groupMap[key]) groupMap[key]={supplierId:supplierId||"",supplierName,quoteRef:quoteRef||"",items:[]};
    else if(quoteRef&&!groupMap[key].quoteRef) groupMap[key].quoteRef=quoteRef;
    groupMap[key].items.push(...items);
  };

  wsSupplierQuotes.forEach(sq=>{
    const lines=(() => { try{return JSON.parse(sq.line_items||"[]");}catch{return[];} })();
    const linkedReq=wsSupplierRequests.find(r=>r.id===sq.request_id);
    const reqItems=(() => { try{return JSON.parse(linkedReq?.items_json||"[]");}catch{return[];} })();
    const skuByName={};
    reqItems.forEach(it=>{ const k=(it.label||it.description||"").toLowerCase().trim(); if(k) skuByName[k]=it.sku||""; });
    const valid=lines.filter(l=>l.name);
    if(!valid.length) return;
    addToGroup(sq.supplier_id||"",sq.supplier_name||"Unknown",
      valid.map(l=>({
        id:"sq-"+sq.id+"-"+l.name,
        description:l.name||"",
        sku:skuByName[(l.name||"").toLowerCase().trim()]||l.sku||"",
        supplier_part_no:"",
        qty:+l.qty||1,
        unit_price:+(l.vat_incl_price||l.price)||0,
        condition:"in_stock",
      })),
      sq.quote_ref||""
    );
  });

  sqReplies.forEach(rep=>{
    const req=wsSupplierRequests.find(r=>r.id===rep.request_id);
    const replyItems=(() => { try{return JSON.parse(rep.items||"[]");}catch{return[];} })()
      .filter(ri=>ri.condition!=="no_stock"&&ri.description);
    if(!replyItems.length) return;
    const sName=req?.supplier_name||"Supplier";
    const sId=req?.supplier_id||"";
    addToGroup(sId,sName,
      replyItems.map(ri=>({
        id:"rep-"+rep.id+"-"+ri.description,
        description:ri.description||"",
        sku:ri.sku||"",
        supplier_part_no:ri.supplier_part_no||"",
        qty:+ri.qty||1,
        unit_price:+ri.price||0,
        condition:ri.condition==="can_order"?"to_order":"in_stock",
      }))
    );
  });

  const groups=Object.values(groupMap);

  // Deduplicate items within each group by description (keep highest price)
  groups.forEach(g=>{
    const seen={};
    g.items=g.items.filter(it=>{
      const k=it.description.toLowerCase().trim();
      if(seen[k]) return false;
      seen[k]=true; return true;
    });
  });

  const [selected,setSelected]=useState(()=>{
    const init={};
    groups.forEach(g=>g.items.forEach(it=>{ init[it.id]=true; }));
    return init;
  });
  const [saving,setSaving]=useState(false);
  const [createdPos,setCreatedPos]=useState(null); // null | [{poId,group,supplier}]

  const toggle=(id)=>setSelected(p=>({...p,[id]:!p[id]}));
  const toggleGroup=(g)=>{
    const allOn=g.items.every(it=>selected[it.id]);
    setSelected(p=>{const n={...p}; g.items.forEach(it=>{n[it.id]=!allOn;}); return n;});
  };

  const totalSelected=groups.reduce((s,g)=>s+g.items.filter(it=>selected[it.id]).reduce((ss,it)=>ss+(+it.qty||0)*(+it.unit_price||0),0),0);
  const countSelected=groups.reduce((s,g)=>s+g.items.filter(it=>selected[it.id]).length,0);

  const shopName=settings?.shop_name||"Workshop";
  const vatRate=+(settings?.tax_rate||0)/100;
  const SEP="─".repeat(26);

  const buildMsg=(grp,poId,supplier)=>{
    const isExVat=supplier&&!supplier.vat_inclusive;
    const exVatPrice=(p)=>isExVat&&vatRate>0?+p/(1+vatRate):+p;
    const exVatTotal=Math.round(grp.items.reduce((s,i)=>s+(+i.qty||0)*exVatPrice(+i.unit_price||0),0)*100)/100;
    const rawTotal=grp.items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
    const vatAmt=Math.round((rawTotal-exVatTotal)*100)/100;
    const totalDisplay=isExVat&&vatRate>0?(exVatTotal+vatAmt):rawTotal;
    return [
      `📋 *Purchase Order* — ${shopName}`,SEP,
      poId?`PO#: ${poId}`:"",
      `Supplier: *${grp.supplierName}*`,
      grp.quoteRef?`Your Quote Ref: *${grp.quoteRef}*`:"",
      `Job: ${job.id}`,"",
      `*Items:*${isExVat?" (prices ex-VAT)":""}`,
      ...grp.items.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${exVatPrice(+i.unit_price||0).toFixed(2)}`),
      "",SEP,
      isExVat&&vatRate>0?`Subtotal (ex-VAT): ${C}${exVatTotal.toFixed(2)}`:"",
      isExVat&&vatRate>0?`VAT (${settings?.tax_rate}%): ${C}${vatAmt.toFixed(2)}`:"",
      `*Total: ${C}${totalDisplay.toFixed(2)}*`,
      grp.quoteRef?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
    ].filter(l=>l!==undefined&&l!=="").join("\n");
  };

  const createOrders=async()=>{
    const bySupplier={};
    groups.forEach(g=>{
      const checked=g.items.filter(it=>selected[it.id]);
      if(!checked.length) return;
      const key=g.supplierName;
      if(!bySupplier[key]) bySupplier[key]={supplierId:g.supplierId,supplierName:g.supplierName,quoteRef:g.quoteRef||"",items:[]};
      bySupplier[key].items.push(...checked);
    });
    const entries=Object.values(bySupplier);
    if(!entries.length) return;
    setSaving(true);
    try{
      const results=[];
      for(const grp of entries){
        const po=await onSave({supplier_id:grp.supplierId||null,supplier_name:grp.supplierName,job_id:job.id,status:"draft",supplier_quote_ref:grp.quoteRef||null},
          grp.items.map(it=>({description:it.description,sku:it.sku||"",supplier_part_no:it.supplier_part_no||"",qty:it.qty,unit_price:it.unit_price,condition:it.condition})));
        const supplier=wsSuppliers.find(s=>String(s.id)===String(grp.supplierId));
        results.push({poId:po?.id||"",group:grp,supplier});
      }
      setCreatedPos(results);
    }catch(e){alert("Failed to create order: "+e.message);}
    setSaving(false);
  };

  // ── Success screen: show WA send buttons ──
  if(createdPos){
    return (
      <Overlay onClose={onClose}>
        <MHead title="✅ Order Placed — Send to Supplier" onClose={onClose}/>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
          {createdPos.map(({poId,group:grp,supplier})=>{
            const phone=(supplier?.phone||"").replace(/\D/g,"");
            const groupLink=supplier?.group_link||"";
            const msg=buildMsg(grp,poId,supplier);
            const total=grp.items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
            return (
              <div key={poId} className="card" style={{padding:"12px 14px"}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{grp.supplierName}</div>
                {grp.quoteRef&&<div style={{fontSize:11,color:"var(--blue)",marginBottom:2}}>Ref: {grp.quoteRef}</div>}
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
                  {grp.items.length} item{grp.items.length!==1?"s":""} · {C}{total.toFixed(2)} (incl. VAT)
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {phone&&(
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                      className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textDecoration:"none",flex:1,textAlign:"center"}}>
                      📤 Send via WhatsApp
                    </a>
                  )}
                  {!phone&&groupLink&&(
                    <button className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",flex:1}}
                      onClick={async()=>{ await navigator.clipboard.writeText(msg); window.open(groupLink,"_blank"); }}>
                      👥 Copy & Open Group
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{flex:"0 0 auto"}}
                    onClick={()=>navigator.clipboard.writeText(msg).then(()=>alert("Copied!"))}>
                    📋 Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost" style={{flex:1}} onClick={()=>{ onViewPOs?.(); onClose(); }}>View All POs</button>
          <button className="btn btn-primary" style={{flex:1}} onClick={onClose}>✅ Done</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <MHead title="📦 Create Purchase Order" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Job: <strong style={{color:"var(--text1)",fontFamily:"monospace"}}>{job.id}</strong>
        {" · "}{job.vehicle_reg||"—"}
        {(job.vehicle_make||job.vehicle_model)&&" · "+(job.vehicle_make||"")+" "+(job.vehicle_model||"")}
      </div>

      {groups.length===0
        ?<div style={{textAlign:"center",padding:32,color:"var(--text3)"}}>
            <div style={{fontSize:28,marginBottom:8}}>📭</div>
            <div style={{fontWeight:600}}>No supplier quotes for this job yet</div>
            <div style={{fontSize:12,marginTop:4}}>Send Quote to a supplier first, then come back here to place the order.</div>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          {groups.map(g=>{
            const groupChecked=g.items.filter(it=>selected[it.id]).length;
            const groupTotal=g.items.filter(it=>selected[it.id]).reduce((s,it)=>s+(+it.qty||0)*(+it.unit_price||0),0);
            return (
              <div key={g.supplierName} className="card" style={{padding:"10px 12px",border:"1px solid var(--border)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer"}}
                  onClick={()=>toggleGroup(g)}>
                  <div style={{fontWeight:700,fontSize:13}}>{g.supplierName}
                    {g.quoteRef&&<span style={{fontSize:10,color:"var(--blue)",fontFamily:"monospace",marginLeft:8,fontWeight:600}}>Ref: {g.quoteRef}</span>}
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    {groupTotal>0&&<span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",fontSize:13}}>{C}{groupTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span>}
                    <span style={{fontSize:11,color:"var(--text3)"}}>{groupChecked}/{g.items.length} selected</span>
                  </div>
                </div>
                {g.items.map(it=>(
                  <label key={it.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"6px 0",borderTop:"1px solid var(--border)",cursor:"pointer"}}>
                    <input type="checkbox" checked={!!selected[it.id]} onChange={()=>toggle(it.id)} style={{marginTop:2,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:13}}>{it.description}
                        {it.sku&&<span style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace",marginLeft:6}}>{it.sku}</span>}
                      </div>
                      <div style={{fontSize:11,color:"var(--text3)"}}>
                        Qty: {it.qty}
                        {+it.unit_price>0&&<span style={{marginLeft:8,color:"var(--text2)"}}>@ {C}{(+it.unit_price).toFixed(2)}</span>}
                        {it.condition==="to_order"&&<span style={{marginLeft:8,color:"#fbbf24"}}>📦 To Order</span>}
                      </div>
                    </div>
                    {+it.unit_price>0&&<div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:13,color:"var(--accent)",flexShrink:0}}>{C}{((+it.qty||0)*(+it.unit_price||0)).toFixed(2)}</div>}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      }

      {groups.length>0&&(
        <div style={{padding:"8px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"var(--text2)"}}>{countSelected} item{countSelected!==1?"s":""} selected</span>
          <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:15,color:"var(--accent)"}}>{C}{totalSelected.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        {countSelected>0&&(
          <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={createOrders}>
            {saving?"Creating…":`📦 Place Order${Object.keys(Object.fromEntries(groups.filter(g=>g.items.some(it=>selected[it.id])).map(g=>[g.supplierName,1]))).length>1?" ("+Object.keys(Object.fromEntries(groups.filter(g=>g.items.some(it=>selected[it.id])).map(g=>[g.supplierName,1]))).length+" POs)":""}` }
          </button>
        )}
      </div>
    </Overlay>
  );
}

export function WsPurchaseOrdersPage({purchaseOrders=[],poItems=[],wsSuppliers=[],wsStock=[],settings,wsSupplierQuotes=[],wsSqReplies=[],wsSupplierRequests=[],initialViewPoId=null,onClearInitialView,onSave,onDelete,onReceive}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const fmt=v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"view"|"receive", po?}
  const [search,setSearch]=useState("");
  const [filterSt,setFilterSt]=useState("__all__");

  // Auto-open view modal when navigated from job card
  useEffect(()=>{
    if(initialViewPoId){
      const po=purchaseOrders.find(p=>p.id===initialViewPoId);
      if(po){ setModal({mode:"view",po}); onClearInitialView?.(); }
    }
  },[initialViewPoId,purchaseOrders]);

  const STATUS_COLOR={draft:"var(--text3)",sent:"var(--blue)",partial:"var(--yellow)",received:"var(--green)",cancelled:"var(--red)"};
  const STATUS_BG={draft:"var(--surface3)",sent:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",received:"rgba(52,211,153,.12)",cancelled:"rgba(248,113,113,.12)"};

  const filtered=purchaseOrders.filter(po=>{
    if(filterSt!=="__all__"&&po.status!==filterSt) return false;
    if(search.trim()){const h=`${po.supplier_name||""} ${po.id}`.toLowerCase();if(!search.toLowerCase().split(/\s+/).every(w=>h.includes(w)))return false;}
    return true;
  });

  const summary={
    draft:purchaseOrders.filter(p=>p.status==="draft").length,
    sent:purchaseOrders.filter(p=>p.status==="sent").length,
    partial:purchaseOrders.filter(p=>p.status==="partial").length,
    received:purchaseOrders.filter(p=>p.status==="received").length,
  };

  return (
    <div>
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[["Draft",summary.draft,"var(--text3)"],["Sent",summary.sent,"var(--blue)"],["Partial",summary.partial,"var(--yellow)"],["Received",summary.received,"var(--green)"]].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:"10px 12px",cursor:"pointer",border:filterSt===l.toLowerCase()?"1px solid "+c:"1px solid transparent"}}
            onClick={()=>setFilterSt(p=>p===l.toLowerCase()?"__all__":l.toLowerCase())}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div>
            <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:"Rajdhani,sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      {/* Controls */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input className="inp" style={{flex:1,minWidth:140}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, PO #…"/>
        <select className="inp" style={{width:130}} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
          <option value="__all__">All Status</option>
          {["draft","sent","partial","received","cancelled"].map(s=><option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ New PO</button>
      </div>
      {/* List */}
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <div style={{fontWeight:600}}>No purchase orders yet</div>
            <div style={{fontSize:13,marginTop:4}}>Create POs to track orders to your suppliers</div>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(po=>{
            const items=poItems.filter(i=>i.po_id===po.id);
            const received=items.every(i=>(+i.received_qty||0)>=(+i.qty||0));
            const partial=items.some(i=>(+i.received_qty||0)>0)&&!received;
            return (
              <div key={po.id} className="card" style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setModal({mode:"view",po})}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{po.supplier_name||"Unknown Supplier"}</div>
                    <code style={{fontSize:10,color:"var(--text3)",fontFamily:"monospace"}}>{po.id}</code>
                    {po.job_id&&<span style={{fontSize:10,color:"var(--text3)",marginLeft:8}}>Job: {po.job_id}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:STATUS_BG[po.status]||"var(--surface3)",color:STATUS_COLOR[po.status]||"var(--text3)",fontWeight:600,textTransform:"capitalize"}}>{po.status||"draft"}</span>
                    <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:14,color:"var(--accent)"}}>{fmt(po.total_amount)}</span>
                  </div>
                </div>
                <div style={{fontSize:12,color:"var(--text2)",marginBottom:6}}>{items.map(i=>i.description).join(" · ")||"No items"}</div>
                {items.length>0&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {items.map(i=>{
                      const pct=Math.min(100,((+i.received_qty||0)/(+i.qty||1))*100);
                      return (
                        <div key={i.id} style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:pct>=100?"rgba(52,211,153,.12)":pct>0?"rgba(251,191,36,.12)":"var(--surface3)",color:pct>=100?"var(--green)":pct>0?"var(--yellow)":"var(--text3)"}}>
                          {i.description}: {+i.received_qty||0}/{+i.qty||0}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{display:"flex",gap:6,marginTop:8}} onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setModal({mode:"edit",po})}>✏️ Edit</button>
                  {po.status!=="received"&&po.status!=="cancelled"&&(
                    <button className="btn btn-sm" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",border:"1px solid rgba(52,211,153,.3)"}}
                      onClick={()=>setModal({mode:"receive",po})}>📥 Receive Goods</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{color:"var(--red)",marginLeft:"auto"}}
                    onClick={()=>{if(window.confirm("Delete this PO?"))onDelete(po.id);}}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      }
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsPurchaseOrderModal po={modal.po||null} wsSuppliers={wsSuppliers} settings={settings}
          wsSupplierQuotes={wsSupplierQuotes} wsSqReplies={wsSqReplies} wsSupplierRequests={wsSupplierRequests}
          onSave={async(po,items)=>{await onSave(po,items);setModal(null);}}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="receive"&&modal.po&&(
        <WsReceiveGoodsModal po={modal.po} poItems={poItems.filter(i=>i.po_id===modal.po.id)}
          wsStock={wsStock} settings={settings}
          onReceive={async(receivedItems)=>{await onReceive(modal.po.id,receivedItems);setModal(null);}}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="view"&&modal.po&&(()=>{
        const viewPo=modal.po;
        const viewItems=poItems.filter(i=>i.po_id===viewPo.id);
        const viewSupplier=wsSuppliers.find(s=>String(s.id)===String(viewPo.supplier_id));
        const viewPhone=(viewSupplier?.phone||"").replace(/\D/g,"");
        const viewTotal=viewItems.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);
        const shopName=settings?.shop_name||"Workshop";
        const SEP2="─".repeat(26);
        const isViewExVat=viewSupplier&&!viewSupplier.vat_inclusive;
        const viewVatRate=+(settings?.tax_rate||0)/100;
        const viewExVatPrice=(p)=>isViewExVat&&viewVatRate>0?+p/(1+viewVatRate):+p;
        const viewExVatTotal=Math.round(viewItems.reduce((s,i)=>s+(+i.qty||0)*viewExVatPrice(+i.unit_price||0),0)*100)/100;
        const viewVatAmt=Math.round((viewTotal-viewExVatTotal)*100)/100;
        const viewTotalDisplay=isViewExVat&&viewVatRate>0?(viewExVatTotal+viewVatAmt):viewTotal;
        const buildViewWaMsg=()=>{
          const lines=[
            `📋 *Purchase Order* — ${shopName}`,SEP2,
            `PO#: ${viewPo.id}`,
            `Supplier: *${viewPo.supplier_name||""}*`,
            viewPo.supplier_quote_ref?`Your Quote Ref: *${viewPo.supplier_quote_ref}*`:"",
            viewPo.job_id?`Job: ${viewPo.job_id}`:"",
            "",
            `*Items:*${isViewExVat?" (prices ex-VAT)":""}`,
            ...viewItems.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${viewExVatPrice(+i.unit_price||0).toFixed(2)}`),
            "",SEP2,
            isViewExVat&&viewVatRate>0?`Subtotal (ex-VAT): ${C}${viewExVatTotal.toFixed(2)}`:"",
            isViewExVat&&viewVatRate>0?`VAT (${settings.tax_rate}%): ${C}${viewVatAmt.toFixed(2)}`:"",
            `*Total: ${C}${viewTotalDisplay.toFixed(2)}*`,
            viewPo.notes?`\nNote: ${viewPo.notes}`:"",
            viewPo.supplier_quote_ref?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
          ].filter(l=>l!==undefined&&l!=="");
          return lines.join("\n");
        };
        return (
          <Overlay onClose={()=>setModal(null)}>
            <MHead title={`PO — ${viewPo.supplier_name||"Unknown"}`} onClose={()=>setModal(null)}/>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>Status: <span style={{color:STATUS_COLOR[viewPo.status]||"var(--text3)",fontWeight:700,textTransform:"capitalize"}}>{viewPo.status||"draft"}</span></div>
              {viewPo.supplier_quote_ref&&<div style={{fontSize:12,color:"var(--blue)",marginBottom:4}}>Quote Ref: <strong>{viewPo.supplier_quote_ref}</strong></div>}
              {viewPo.notes&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Notes: {viewPo.notes}</div>}
              {viewPo.job_id&&<div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Job: {viewPo.job_id}</div>}
            </div>
            <div style={{overflowX:"auto",marginBottom:12}}>
              <table className="tbl" style={{width:"100%"}}>
                <thead><tr><th>Description</th><th>SKU</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit Price{isViewExVat?" (ex-VAT)":""}</th><th>Condition</th><th style={{textAlign:"right"}}>Received</th></tr></thead>
                <tbody>
                  {viewItems.map(i=>(
                    <tr key={i.id}>
                      <td>{i.description}</td>
                      <td><code style={{fontSize:11,fontFamily:"monospace",color:"var(--text3)"}}>{i.sku||"—"}</code></td>
                      <td style={{textAlign:"right"}}>{i.qty}</td>
                      <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)"}}>{fmt(viewExVatPrice(+i.unit_price||0))}</td>
                      <td><span style={{fontSize:11,color:i.condition==="to_order"?"#fbbf24":"var(--green)"}}>{i.condition==="to_order"?"📦 To Order":"✅ In Stock"}</span></td>
                      <td style={{textAlign:"right"}}>{+i.received_qty||0} / {i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isViewExVat&&viewVatRate>0&&(
                <div style={{textAlign:"right",padding:"6px 8px",fontSize:12,color:"var(--text3)"}}>
                  Subtotal ex-VAT: <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--text1)"}}>{fmt(viewExVatTotal)}</strong>
                  &nbsp;·&nbsp;VAT ({settings?.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(viewVatAmt)}</strong>
                  &nbsp;·&nbsp;Total: <strong style={{fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(viewTotalDisplay)}</strong>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn btn-ghost" onClick={()=>setModal({mode:"edit",po:viewPo})}>✏️ Edit</button>
              {viewPhone&&viewItems.length>0&&(
                <a href={waLink(viewPhone,buildViewWaMsg())} target="_blank" rel="noreferrer"
                  className="btn btn-sm" onClick={async()=>{ if(viewPo.status==="draft") await onSave({...viewPo,status:"sent"},viewItems); }}
                  style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                  📤 Send via WhatsApp
                </a>
              )}
              {!viewPhone&&viewSupplier?.group_link&&viewItems.length>0&&(
                <button className="btn btn-sm" style={{background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)"}}
                  onClick={async()=>{
                    await navigator.clipboard.writeText(buildViewWaMsg());
                    window.open(viewSupplier.group_link,"_blank");
                    if(viewPo.status==="draft") await onSave({...viewPo,status:"sent"},viewItems);
                  }}>
                  👥 Copy & Open Group
                </button>
              )}
              {viewPo.status!=="received"&&viewPo.status!=="cancelled"&&(
                <button className="btn btn-primary" style={{background:"rgba(52,211,153,.8)"}}
                  onClick={()=>setModal({mode:"receive",po:viewPo})}>📥 Receive Goods</button>
              )}
            </div>
          </Overlay>
        );
      })()}
    </div>
  );
}

export function WsPurchaseOrderModal({po,wsSuppliers=[],settings,wsSupplierQuotes=[],wsSqReplies=[],wsSupplierRequests=[],onSave,onClose,prefill=null}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const shopName=settings?.shop_name||"Workshop";
  const [suppId,setSuppId]=useState(po?.supplier_id||"");
  const [suppName,setSuppName]=useState(po?.supplier_name||"");
  const [status,setStatus]=useState(po?.status||"draft");
  const [notes,setNotes]=useState(po?.notes||"");
  const [jobId,setJobId]=useState(po?.job_id||"");
  const [sqRef,setSqRef]=useState(po?.supplier_quote_ref||"");
  const [items,setItems]=useState(()=>{
    if(prefill) return prefill;
    if(po){const stored=JSON.parse(po._items||"[]");return stored.length?stored:[{id:"i1",description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}];}
    return [{id:"i1",description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}];
  });
  const [saving,setSaving]=useState(false);
  const [importOpen,setImportOpen]=useState(false);

  const addItem=()=>setItems(p=>[...p,{id:"i"+Date.now(),description:"",sku:"",supplier_part_no:"",qty:1,unit_price:0,condition:"in_stock"}]);
  const removeItem=idx=>setItems(p=>p.filter((_,i)=>i!==idx));
  const setItem=(idx,k,v)=>setItems(p=>p.map((it,i)=>i===idx?{...it,[k]:v}:it));

  const chosenSupplier=wsSuppliers.find(s=>String(s.id)===String(suppId));
  const resolvedName=chosenSupplier?.name||suppName;
  const total=items.reduce((s,i)=>s+(+i.qty||0)*(+i.unit_price||0),0);

  // Build importable quote sources from manual quotes + digital replies
  const quoteSources=[];
  wsSupplierQuotes.forEach(sq=>{
    const lines=(() => { try{return JSON.parse(sq.line_items||"[]");}catch{return [];} })();
    const valid=lines.filter(l=>l.name&&(+l.price>0||+(l.vat_incl_price)||0>0));
    if(!valid.length) return;
    // Build name→sku map from the original request's items_json (has our internal SKUs)
    const linkedReq=wsSupplierRequests.find(r=>r.id===sq.request_id);
    const reqItems=(() => { try{return JSON.parse(linkedReq?.items_json||"[]");}catch{return [];} })();
    const skuByName={};
    reqItems.forEach(it=>{ const k=(it.label||it.description||"").toLowerCase().trim(); if(k) skuByName[k]=it.sku||""; });
    quoteSources.push({
      id:"sq-"+sq.id,
      label:`${sq.supplier_name||"?"} — ${valid.slice(0,2).map(l=>l.name).join(", ")}${valid.length>2?" +more":""}`,
      supplierId:sq.supplier_id||"",supplierName:sq.supplier_name||"",jobId:sq.job_id||"",quoteRef:sq.quote_ref||"",
      items:valid.map((l,i)=>({id:"qi"+Date.now()+i,description:l.name||"",sku:skuByName[(l.name||"").toLowerCase().trim()]||l.sku||"",supplier_part_no:"",qty:+l.qty||1,unit_price:+(l.vat_incl_price||l.price)||0,condition:"in_stock"})),
    });
  });
  wsSqReplies.forEach(rep=>{
    const req=wsSupplierRequests.find(r=>r.id===rep.request_id);
    const replyItems=(() => { try{return JSON.parse(rep.items||"[]");}catch{return [];} })().filter(ri=>ri.condition!=="no_stock"&&ri.description);
    if(!replyItems.length) return;
    const sName=req?.supplier_name||"Supplier";
    const sId=req?.supplier_id||"";
    quoteSources.push({
      id:"rep-"+rep.id,
      label:`${sName} (reply) — ${replyItems.slice(0,2).map(i=>i.description).join(", ")}${replyItems.length>2?" +more":""}`,
      supplierId:sId,supplierName:sName,jobId:req?.job_id||"",
      items:replyItems.map((ri,i)=>({id:"ri"+Date.now()+i,description:ri.description||"",sku:ri.sku||"",supplier_part_no:ri.supplier_part_no||"",qty:+ri.qty||1,unit_price:+ri.price||0,condition:ri.condition==="can_order"?"to_order":"in_stock"})),
    });
  });

  const importQuote=(src)=>{
    setSuppId(src.supplierId);
    setSuppName(src.supplierName);
    if(src.jobId) setJobId(src.jobId);
    if(src.quoteRef) setSqRef(src.quoteRef);
    setItems(src.items.map((it,i)=>({...it,id:"imp"+Date.now()+i})));
    setImportOpen(false);
  };

  const save=async()=>{
    if(!resolvedName.trim()){alert("Supplier name required");return;}
    if(!items.some(i=>i.description.trim())){alert("Add at least one item");return;}
    setSaving(true);
    await onSave({
      id:po?.id||undefined,
      supplier_id:suppId||null,supplier_name:resolvedName,
      status,notes,job_id:jobId||null,supplier_quote_ref:sqRef.trim()||null,
    },items.filter(i=>i.description.trim()));
    setSaving(false);
  };

  const phone=(chosenSupplier?.phone||"").replace(/\D/g,"");
  const SEP="─".repeat(26);
  const buildWaMsg=()=>{
    const filled=items.filter(i=>i.description.trim());
    const isExVat=chosenSupplier&&!chosenSupplier.vat_inclusive;
    const vatRate=+(settings?.tax_rate||0)/100;
    const exVatPrice=(p)=>isExVat&&vatRate>0?+p/(1+vatRate):+p;
    const exVatTotal=Math.round(filled.reduce((s,i)=>s+(+i.qty||0)*exVatPrice(+i.unit_price||0),0)*100)/100;
    const vatAmt=Math.round((total-exVatTotal)*100)/100;
    const totalDisplay=isExVat&&vatRate>0?(exVatTotal+vatAmt):total;
    const lines=[
      `📋 *Purchase Order* — ${shopName}`,SEP,
      `Supplier: *${resolvedName}*`,
      sqRef?`Your Quote Ref: *${sqRef}*`:"",
      jobId?`Job: ${jobId}`:"",
      "",
      `*Items:*${isExVat?" (prices ex-VAT)":""}`,
      ...filled.map(i=>`• ${i.description}${i.sku?" ("+i.sku+")":""} ×${i.qty} @ ${C}${exVatPrice(+i.unit_price||0).toFixed(2)}`),
      "",SEP,
      isExVat&&vatRate>0?`Subtotal (ex-VAT): ${C}${exVatTotal.toFixed(2)}`:"",
      isExVat&&vatRate>0?`VAT (${settings.tax_rate}%): ${C}${vatAmt.toFixed(2)}`:"",
      `*Total: ${C}${totalDisplay.toFixed(2)}*`,
      notes?`\nNote: ${notes}`:"",
      sqRef?"\nPlease process against your quote ref above and confirm.":"\nPlease confirm availability and delivery timeframe.",
    ].filter(l=>l!==undefined&&l!=="");
    return lines.join("\n");
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title={po?"Edit Purchase Order":"New Purchase Order"} onClose={onClose}/>

      {/* Import from quote */}
      {quoteSources.length>0&&(
        <div style={{marginBottom:12}}>
          {!importOpen
            ?<button className="btn btn-ghost btn-sm" style={{width:"100%",border:"1px dashed var(--border)",color:"var(--blue)"}}
                onClick={()=>setImportOpen(true)}>📥 Import items from a supplier quote</button>
            :<div style={{background:"var(--surface2)",borderRadius:8,padding:10,border:"1px solid var(--border)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6}}>SELECT QUOTE TO IMPORT</div>
              {quoteSources.map(src=>(
                <div key={src.id} style={{padding:"6px 8px",borderRadius:6,cursor:"pointer",marginBottom:4,border:"1px solid var(--border)",background:"var(--surface)",fontSize:12}}
                  onClick={()=>importQuote(src)}>
                  <span style={{color:"var(--text2)"}}>{src.label}</span>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{marginTop:4}} onClick={()=>setImportOpen(false)}>Cancel</button>
            </div>
          }
        </div>
      )}

      {/* Supplier */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Supplier</div>
      {wsSuppliers.length>0
        ?<select className="inp" style={{marginBottom:8}} value={suppId} onChange={e=>{setSuppId(e.target.value);setSuppName("");}}>
            <option value="">— Select supplier —</option>
            {wsSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        :<input className="inp" style={{marginBottom:8}} placeholder="Supplier name" value={suppName} onChange={e=>setSuppName(e.target.value)}/>
      }
      {suppId&&!wsSuppliers.find(s=>String(s.id)===String(suppId))&&(
        <input className="inp" style={{marginBottom:8}} placeholder="Supplier name" value={suppName} onChange={e=>setSuppName(e.target.value)}/>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div><FL label="Status"/><select className="inp" value={status} onChange={e=>setStatus(e.target.value)}>
          {["draft","sent","partial","received","cancelled"].map(s=><option key={s}>{s}</option>)}
        </select></div>
        <div><FL label="Job # (optional)"/><input className="inp" value={jobId} onChange={e=>setJobId(e.target.value)} placeholder="e.g. WJ-123"/></div>
        <div style={{gridColumn:"1/-1"}}><FL label="Supplier Quote Ref # (Doc Nr)"/><input className="inp" value={sqRef} onChange={e=>setSqRef(e.target.value)} placeholder="e.g. Q100814"/></div>
      </div>
      <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}><FL label="Notes (optional)"/></div>
      <input className="inp" style={{marginBottom:14}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Delivery instructions, reference…"/>

      {/* Line items */}
      <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Items</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
        {items.map((it,idx)=>(
          <div key={it.id||idx} style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,marginBottom:6}}>
              <input className="inp" value={it.description} onChange={e=>setItem(idx,"description",e.target.value)} placeholder="Description *"/>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>removeItem(idx)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
              <input className="inp" value={it.sku} onChange={e=>setItem(idx,"sku",e.target.value)} placeholder="SKU"/>
              <input className="inp" value={it.supplier_part_no} onChange={e=>setItem(idx,"supplier_part_no",e.target.value)} placeholder="Supplier Part #"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:6}}>
              <div><FL label="Qty"/><input className="inp" type="number" min="0" value={it.qty} onChange={e=>setItem(idx,"qty",e.target.value)}/></div>
              <div><FL label={`Unit Price (${C})`}/><input className="inp" type="number" min="0" step="0.01" value={it.unit_price} onChange={e=>setItem(idx,"unit_price",e.target.value)}/></div>
              <div><FL label="Condition"/><select className="inp" value={it.condition} onChange={e=>setItem(idx,"condition",e.target.value)}>
                <option value="in_stock">✅ In Stock</option>
                <option value="to_order">📦 To Order</option>
              </select></div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" style={{marginBottom:14,width:"100%"}} onClick={addItem}>+ Add Item</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,padding:"8px 12px",background:"var(--surface2)",borderRadius:8}}>
        <span style={{fontSize:13,color:"var(--text2)"}}>Total</span>
        <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{C}{total.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        {items.some(i=>i.description.trim())&&phone&&(
          <a href={waLink(phone,buildWaMsg())} target="_blank" rel="noreferrer"
            className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)",textAlign:"center",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
            📤 Send WA
          </a>
        )}
        {items.some(i=>i.description.trim())&&!phone&&chosenSupplier?.group_link&&(
          <button className="btn btn-sm" style={{flex:1,background:"rgba(37,211,102,.15)",color:"#25d366",border:"1px solid rgba(37,211,102,.3)"}}
            onClick={()=>navigator.clipboard.writeText(buildWaMsg()).then(()=>window.open(chosenSupplier.group_link,"_blank"))}>
            👥 Copy & Open Group
          </button>
        )}
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={save}>{saving?"Saving…":"💾 Save PO"}</button>
      </div>
    </Overlay>
  );
}

export function WsReceiveGoodsModal({po,poItems=[],wsStock=[],settings,onReceive,onClose}) {
  const C=curSym(settings?.currency||getSettings().currency);
  const fmt=v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [rows,setRows]=useState(()=>poItems.map(i=>({
    po_item_id:i.id,description:i.description,sku:i.sku||"",
    qty:+i.qty||0,received_qty:+i.received_qty||0,
    receive_qty:Math.max(0,(+i.qty||0)-(+i.received_qty||0)),
    unit_price:+i.unit_price||0,stock_id:"",
  })));
  const [saving,setSaving]=useState(false);

  const setRow=(idx,k,v)=>setRows(p=>p.map((r,i)=>i===idx?{...r,[k]:v}:r));
  const total=rows.reduce((s,r)=>s+(+r.receive_qty||0)*(+r.unit_price||0),0);
  const outstanding=rows.filter(r=>r.received_qty<r.qty);
  const fullyReceived=rows.filter(r=>r.received_qty>=r.qty);

  return (
    <Overlay onClose={onClose}>
      <MHead title="📥 Receive Goods" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
        Supplier: <strong style={{color:"var(--text1)"}}>{po.supplier_name}</strong>
        &nbsp;·&nbsp;PO: <code style={{fontFamily:"monospace",fontSize:11}}>{po.id}</code>
      </div>
      {outstanding.length>0&&(
        <>
          <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Pending Items</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {outstanding.map((r,idx)=>{
              const globalIdx=rows.indexOf(r);
              const stockMatch=wsStock.filter(w=>w.sku&&r.sku&&w.sku===r.sku);
              return (
                <div key={r.po_item_id} style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",border:"1px solid var(--border)"}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{r.description}{r.sku&&<span style={{color:"var(--text3)",fontFamily:"monospace",fontSize:10,marginLeft:6}}>{r.sku}</span>}</div>
                  <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:6,marginBottom:6}}>
                    <div><FL label="Receive Qty"/><input className="inp" type="number" min="0" max={r.qty-r.received_qty} value={r.receive_qty} onChange={e=>setRow(globalIdx,"receive_qty",e.target.value)}/></div>
                    <div><FL label="Unit Price"/><input className="inp" type="number" min="0" step="0.01" value={r.unit_price} onChange={e=>setRow(globalIdx,"unit_price",e.target.value)}/></div>
                    <div><FL label="WS Stock Item"/>
                      <select className="inp" value={r.stock_id} onChange={e=>setRow(globalIdx,"stock_id",e.target.value)}>
                        <option value="">— Link stock (optional) —</option>
                        {wsStock.map(w=><option key={w.id} value={w.id}>{w.name}{w.sku?` (${w.sku})`:""}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>Ordered: {r.qty} · Already received: {r.received_qty}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {fullyReceived.length>0&&(
        <div style={{fontSize:12,color:"var(--green)",marginBottom:10,padding:"6px 10px",background:"rgba(52,211,153,.08)",borderRadius:6}}>
          ✅ Already fully received: {fullyReceived.map(r=>r.description).join(", ")}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:14}}>
        <span style={{fontSize:13,color:"var(--text2)"}}>Invoice Total</span>
        <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:16,color:"var(--accent)"}}>{fmt(total)}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2,background:"rgba(52,211,153,.8)"}} disabled={saving}
          onClick={async()=>{setSaving(true);await onReceive(rows);setSaving(false);}}>
          {saving?"Processing…":"📥 Confirm Receipt & Create Invoice"}
        </button>
      </div>
    </Overlay>
  );
}

import { useState } from "react";
import { getSettings, curSym } from "../../lib/settings.js";
import { fmtAmt } from "../../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";
import { printWorkshopQuote } from "./Print.jsx";

export function WsQuoteModal({job,items,existing,settings,wsSupplierQuotes=[],onSave,onClose}) {
  const C=curSym(settings.currency||getSettings().currency);
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [selectedIds,setSelectedIds]=useState(()=>{
    if(existing?.selected_item_ids){
      try{
        const saved=new Set(JSON.parse(existing.selected_item_ids));
        return new Set(items.filter(i=>saved.has(i.id)).map(i=>i.id));
      }catch{}
    }
    return new Set(items.map(i=>i.id));
  });
  const toggleItem=id=>setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const selItems=items.filter(i=>selectedIds.has(i.id));
  const selSubtotal=selItems.reduce((s,i)=>s+(+i.total||0),0);
  const selTax=settings.vat_number?selSubtotal*(settings.tax_rate||0)/100:0;
  const selTotal=selSubtotal+selTax;
  const [f,setF]=useState({
    id:existing?.id||null,
    job_id:job.id,
    quote_customer:existing?.quote_customer||job.customer_name||"",
    quote_phone:existing?.quote_phone||job.customer_phone||"",
    quote_email:existing?.quote_email||job.customer_email||"",
    quote_date:existing?.quote_date||job.date_in||new Date().toISOString().slice(0,10),
    valid_until:existing?.valid_until||"",
    notes:existing?.notes||"",
    status:existing?.status||"draft",
  });
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  const [showSupRef,setShowSupRef]=useState(true);

  // Supplier quotes for this job
  const jobSupQuotes = wsSupplierQuotes.filter(q=>q.job_id===job.id);

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={existing?"✏️ Edit Quotation":"📝 Create Quotation"} onClose={onClose}/>

      {/* Supplier price reference panel */}
      {jobSupQuotes.length>0&&(
        <div style={{marginBottom:14,border:"1px solid rgba(251,191,36,.35)",borderRadius:10,overflow:"hidden"}}>
          <button
            onClick={()=>setShowSupRef(p=>!p)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:"rgba(251,191,36,.08)",border:"none",cursor:"pointer",textAlign:"left"}}>
            <span style={{fontWeight:700,fontSize:12,color:"#f59e0b"}}>💰 Supplier Prices ({jobSupQuotes.length} quote{jobSupQuotes.length!==1?"s":""})</span>
            <span style={{fontSize:11,color:"var(--text3)"}}>{showSupRef?"▲ hide":"▼ show"}</span>
          </button>
          {showSupRef&&(
            <div style={{padding:"10px 14px 12px",display:"flex",flexDirection:"column",gap:10}}>
              {jobSupQuotes.map((sq,si)=>{
                const lines=(() => { try { return JSON.parse(sq.line_items||"[]"); } catch { return []; } })();
                return (
                  <div key={sq.id||si} style={{background:"var(--surface2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:12,color:"#25D366"}}>{sq.supplier_name||"Unknown supplier"}</span>
                      {sq.total>0&&<span style={{fontWeight:800,fontSize:13,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{fmt(sq.total)}</span>}
                    </div>
                    {lines.length>0&&(
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {lines.map((l,li)=>(
                          <div key={li} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,gap:8}}>
                            <span style={{color:"var(--text2)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</span>
                            <span style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                              {l.available&&<span style={{fontSize:10,color:"var(--text3)"}}>{l.available}</span>}
                              <span style={{fontWeight:700,color:(+l.price>0)?"var(--text1)":"var(--text3)",fontFamily:"Rajdhani,sans-serif",fontSize:13}}>
                                {+(l.vat_incl_price||l.price)>0?fmt(+(l.vat_incl_price||l.price)):"—"}
                              </span>
                              {l.vat_incl_price&&+l.vat_incl_price!==+l.price&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600}}>incl.VAT</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {sq.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:5,fontStyle:"italic"}}>{sq.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontWeight:700,fontSize:13}}>🔧 {job.vehicle_reg} · {selItems.length}/{items.length} item{items.length!==1?"s":""}</div>
          {selItems.length<items.length&&(
            <button className="btn btn-ghost btn-xs" onClick={()=>setSelectedIds(new Set(items.map(i=>i.id)))}>select all</button>
          )}
        </div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr><th style={{width:28}}></th>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>{
              const checked=selectedIds.has(i.id);
              return (
                <tr key={i.id} style={{opacity:checked?1:0.4,cursor:"pointer"}} onClick={()=>toggleItem(i.id)}>
                  <td><input type="checkbox" checked={checked} onChange={()=>toggleItem(i.id)} onClick={e=>e.stopPropagation()} style={{cursor:"pointer"}}/></td>
                  <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:10}}>{i.type==="part"?"🔩":"👷"}</span></td>
                  <td style={{textDecoration:checked?"none":"line-through"}}>{i.description}</td>
                  <td style={{textAlign:"right"}}>{i.qty}</td>
                  <td style={{textAlign:"right"}}>{fmt(i.unit_price)}</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{fmt(i.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:13,color:"var(--text3)"}}>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(selSubtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div style={{fontSize:13,color:"var(--text3)"}}>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(selTax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>Total: {fmt(selTotal)}</div>
        </div>
      </div>

      <FG>
        <div><FL label="Quote Date"/><input className="inp" type="date" value={f.quote_date} onChange={e=>s("quote_date",e.target.value)}/></div>
        <div><FL label="Valid Until"/><input className="inp" type="date" value={f.valid_until} onChange={e=>s("valid_until",e.target.value)}/></div>
      </FG>
      <FD><FL label="Notes / Terms"/><textarea className="inp" value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Payment terms, warranty, conditions..." style={{minHeight:60}}/></FD>

      <div style={{display:"flex",gap:10,marginTop:18}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-ghost" style={{flex:1}} disabled={saving||selItems.length===0} onClick={async()=>{
          setSaving(true);
          const q={...f,subtotal:selSubtotal,tax:selTax,total:selTotal,selected_item_ids:JSON.stringify([...selectedIds])};
          try{ await onSave(q); printWorkshopQuote(job,selItems,q,settings); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>💾 Save &amp; Print</button>
        <button className="btn btn-primary" style={{flex:1}} disabled={saving||selItems.length===0} onClick={async()=>{
          setSaving(true);
          try{ await onSave({...f,subtotal:selSubtotal,tax:selTax,total:selTotal,selected_item_ids:JSON.stringify([...selectedIds])}); }catch(e){alert(e.message);}
          finally{setSaving(false);}
        }}>{saving?"Saving...":(existing?"💾 Save":"📝 Create Quote")}</button>
      </div>
      {selItems.length===0&&<p style={{color:"var(--red)",fontSize:12,marginTop:8,textAlign:"center"}}>{items.length===0?"Add parts or labour items before creating a quote.":"Select at least one item to include in the quote."}</p>}
    </Overlay>
  );
}

export function WsInvoiceEditModal({invoice,onSave,onClose}) {
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

export function WsPaymentModal({invoice,settings,onSave,onClose}) {
  const balance=(+invoice.total||0)-(+invoice.paid_amount||0);
  const [amount,setAmount]=useState(balance.toFixed(2));
  const [method,setMethod]=useState("Cash");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [ref,setRef]=useState("");
  const [saving,setSaving]=useState(false);
  const C=curSym(settings.currency||getSettings().currency);

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

export function WsStatementModal({invoice,job,items,settings,onClose,onPrint}) {
  const C=curSym(settings.currency||getSettings().currency);
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
            {(settings.city||settings.country)&&<div style={{fontSize:12,color:"var(--text3)"}}>🌍 {[settings.city,settings.country].filter(Boolean).join(", ")}</div>}
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

export function WorkshopInvoiceModal({job,items,settings,onSave,onClose,t,prefill={}}) {
  const C=curSym(settings.currency||getSettings().currency);
  const fmt=v=>`${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [invDate,  setInvDate]  = useState(prefill.invDate||job.date_in||new Date().toISOString().slice(0,10));
  const [dueDate,  setDueDate]  = useState(prefill.dueDate||"");
  const [notes,    setNotes]    = useState(prefill.notes||"");
  const [saving,   setSaving]   = useState(false);
  const [invCust,  setInvCust]  = useState(prefill.invCust||job.customer_name||"");
  const [invPhone, setInvPhone] = useState(prefill.invPhone||job.customer_phone||"");
  const [invEmail, setInvEmail] = useState(prefill.invEmail||job.customer_email||"");

  // Item selection — all passed items are selected by default
  const [selectedIds,setSelectedIds]=useState(()=>new Set(items.map(i=>i.id)));
  const toggleItem=id=>setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const selItems=items.filter(i=>selectedIds.has(i.id));
  const selSubtotal=selItems.reduce((s,i)=>s+(+i.total||0),0);
  const selTax=settings.vat_number?selSubtotal*(settings.tax_rate||0)/100:0;
  const selTotal=selSubtotal+selTax;

  const handleCreate=async(payNow=false)=>{
    if(selItems.length===0){alert("Select at least one item to invoice.");return;}
    setSaving(true);
    try{
      await onSave({
        job_id:job.id,
        invoice_customer:invCust, inv_phone:invPhone, inv_email:invEmail,
        vehicle_reg:job.vehicle_reg||"",
        invoice_date:invDate, due_date:dueDate,
        subtotal:selSubtotal, tax:selTax, total:selTotal, status:"unpaid", notes,
      }, payNow);
    }catch(e){ alert("Failed to create invoice: "+e.message); }
    finally{ setSaving(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={prefill.invCust?"🧾 Convert Quote to Invoice":"🧾 Create Workshop Invoice"} onClose={onClose}/>
      {prefill.invCust&&<div style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12,color:"var(--blue)"}}>
        📝 Pre-filled from quotation — review and adjust before saving.
      </div>}

      {/* Editable invoice customer details */}
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

      {/* Line items with checkboxes */}
      <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontWeight:700,fontSize:13}}>{job.vehicle_reg} · {selItems.length}/{items.length} item{items.length!==1?"s":""}</div>
          {selItems.length<items.length&&(
            <button className="btn btn-ghost btn-xs" onClick={()=>setSelectedIds(new Set(items.map(i=>i.id)))}>select all</button>
          )}
        </div>
        <table className="tbl" style={{width:"100%"}}>
          <thead><tr><th style={{width:28}}></th>{["Type","Description","Qty","Price","Total"].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(i=>{
              const checked=selectedIds.has(i.id);
              return (
                <tr key={i.id} style={{opacity:checked?1:0.4,cursor:"pointer"}} onClick={()=>toggleItem(i.id)}>
                  <td><input type="checkbox" checked={checked} onChange={()=>toggleItem(i.id)} onClick={e=>e.stopPropagation()} style={{cursor:"pointer"}}/></td>
                  <td><span className="badge" style={{background:i.type==="part"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:i.type==="part"?"var(--blue)":"var(--green)",fontSize:11}}>{i.type==="part"?"🔩":"👷"}</span></td>
                  <td style={{textDecoration:checked?"none":"line-through"}}>{i.description}{i.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)",marginLeft:6}}>{i.part_sku}</code>}</td>
                  <td style={{textAlign:"right"}}>{i.qty}</td>
                  <td style={{textAlign:"right"}}>{fmt(i.unit_price)}</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{fmt(i.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)"}}>
          <div>Subtotal: <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(selSubtotal)}</strong></div>
          {settings.vat_number&&(settings.tax_rate||0)>0&&<div>VAT ({settings.tax_rate}%): <strong style={{fontFamily:"Rajdhani,sans-serif"}}>{fmt(selTax)}</strong></div>}
          <div style={{fontSize:16,fontWeight:700,color:"var(--accent)"}}>Total: {fmt(selTotal)}</div>
        </div>
      </div>

      <FG>
        <div><FL label={t.invoiceDate}/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
        <div><FL label={t.dueDate}/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
      </FG>
      <FD><FL label={t.notes}/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Payment instructions, warranty..." style={{minHeight:60}}/></FD>
      <div style={{display:"flex",gap:8,marginTop:18,flexWrap:"wrap"}}>
        <button className="btn btn-ghost" style={{flex:"1 1 80px"}} onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-primary" style={{flex:"1 1 120px"}} onClick={()=>handleCreate(false)} disabled={saving}>
          {saving?"Saving...":"💾 Create Invoice"}
        </button>
        <button className="btn btn-success" style={{flex:"2 1 160px",fontWeight:700}} onClick={()=>handleCreate(true)} disabled={saving}>
          {saving?"Saving...":"💳 Save & Pay Now"}
        </button>
      </div>
    </Overlay>
  );
}

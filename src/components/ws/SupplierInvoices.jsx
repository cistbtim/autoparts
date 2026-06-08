import { useState } from "react";
import { getSettings, curSym } from "../../lib/settings.js";
import { Overlay, MHead, FL, FG, FD } from "../shared.jsx";

export function WsSupplierInvoicesPage({invoices=[],invItems=[],payments=[],returns=[],wsSuppliers=[],wsStock=[],settings,onSaveInvoice,onDeleteInvoice,onSavePayment,onSaveReturn,wsLocked=false}) {
  const C = curSym(settings?.currency||getSettings().currency);
  const fmt = v=>`${C}${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const [modal,setModal]=useState(null); // null | {mode:"add"|"edit"|"view"|"pay"|"return", item?}
  const [search,setSearch]=useState("");
  const [filterSup,setFilterSup]=useState("__all__");
  const [filterSt,setFilterSt]=useState("__all__");

  const ST_COLOR={pending:"var(--blue)",partial:"var(--yellow)",paid:"var(--green)",overdue:"var(--red)"};
  const ST_BG={pending:"rgba(96,165,250,.12)",partial:"rgba(251,191,36,.12)",paid:"rgba(52,211,153,.12)",overdue:"rgba(248,113,113,.12)"};

  const supNames=[...new Set(invoices.map(i=>i.supplier_name).filter(Boolean))].sort();

  const filtered=invoices.filter(inv=>{
    if(filterSup!=="__all__"&&inv.supplier_name!==filterSup) return false;
    if(filterSt!=="__all__"&&inv.status!==filterSt) return false;
    if(search.trim()){
      const h=`${inv.supplier_name||""} ${inv.invoice_ref||""} ${inv.id}`.toLowerCase();
      if(!search.trim().toLowerCase().split(/\s+/).every(w=>h.includes(w))) return false;
    }
    return true;
  });

  const totalOwing=invoices.reduce((s,i)=>s+(+i.total||0)-(+i.paid_amount||0),0);
  const totalPaid=invoices.reduce((s,i)=>s+(+i.paid_amount||0),0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {[
          {label:"Total Invoices",val:invoices.length,sub:"all time"},
          {label:"Total Paid",val:fmt(totalPaid),color:"var(--green)"},
          {label:"Outstanding",val:fmt(totalOwing),color:totalOwing>0?"var(--red)":"var(--green)"},
        ].map((c,i)=>(
          <div key={i} className="card" style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:c.color||"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{c.val}</div>
            {c.sub&&<div style={{fontSize:11,color:"var(--text3)"}}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input className="inp" style={{flex:1,minWidth:160}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, ref..."/>
        <select className="inp" style={{width:160}} value={filterSup} onChange={e=>setFilterSup(e.target.value)}>
          <option value="__all__">All Suppliers</option>
          {supNames.map(n=><option key={n}>{n}</option>)}
        </select>
        <select className="inp" style={{width:130}} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
          <option value="__all__">All Status</option>
          {["pending","partial","paid","overdue"].map(s=><option key={s}>{s}</option>)}
        </select>
        {!wsLocked&&<button className="btn btn-primary btn-sm" onClick={()=>setModal({mode:"add"})}>+ New Invoice</button>}
      </div>

      {/* Invoice list */}
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:40,color:"var(--text3)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🧾</div>
            <div style={{fontWeight:600}}>No supplier invoices yet</div>
            <div style={{fontSize:13,marginTop:4}}>Record purchases from suppliers to update stock</div>
          </div>
        :<div style={{overflowX:"auto"}}>
          <table className="tbl" style={{width:"100%"}}>
            <thead><tr><th>Date</th><th>Supplier</th><th>Ref#</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Paid</th><th style={{textAlign:"right"}}>Owing</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(inv=>{
                const owing=(+inv.total||0)-(+inv.paid_amount||0);
                return (
                  <tr key={inv.id}>
                    <td style={{fontSize:12,whiteSpace:"nowrap"}}>{inv.invoice_date||"—"}</td>
                    <td style={{fontWeight:600}}>{inv.supplier_name||"—"}</td>
                    <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{inv.invoice_ref||inv.id}</code></td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(inv.total)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",color:"var(--green)"}}>{fmt(inv.paid_amount||0)}</td>
                    <td style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:owing>0?"var(--red)":"var(--text3)"}}>{owing>0?fmt(owing):"—"}</td>
                    <td><span className="badge" style={{background:ST_BG[inv.status]||ST_BG.pending,color:ST_COLOR[inv.status]||ST_COLOR.pending,fontSize:11}}>{inv.status||"pending"}</span></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"view",item:inv})} title="View">👁</button>
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"pay",item:inv})} title="Record payment" style={{color:"var(--green)"}}>💳</button>}
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"return",item:inv})} title="Return items" style={{color:"var(--yellow)"}}>↩️</button>}
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" onClick={()=>setModal({mode:"edit",item:inv})} title="Edit">✏️</button>}
                        {!wsLocked&&<button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}} onClick={()=>{ if(window.confirm("Delete this invoice? Stock will NOT be reversed.")) onDeleteInvoice(inv.id); }} title="Delete">🗑</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }

      {/* Modals */}
      {(modal?.mode==="add"||modal?.mode==="edit")&&(
        <WsSupInvoiceModal
          item={modal.item} wsSuppliers={wsSuppliers} wsStock={wsStock} settings={settings} fmt={fmt}
          onSave={async(inv,items)=>{ await onSaveInvoice(inv,items); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="view"&&(
        <WsSupInvoiceViewModal
          invoice={modal.item} items={invItems.filter(i=>i.invoice_id===modal.item.id)}
          payments={payments.filter(p=>p.invoice_id===modal.item.id)}
          returns={returns.filter(r=>r.invoice_id===modal.item.id)}
          fmt={fmt} onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="pay"&&(
        <WsSupPaymentModal
          invoice={modal.item} settings={settings} fmt={fmt}
          onSave={async(pay)=>{ await onSavePayment(pay); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
      {modal?.mode==="return"&&(
        <WsSupReturnModal
          invoice={modal.item} items={invItems.filter(i=>i.invoice_id===modal.item.id)}
          wsStock={wsStock} fmt={fmt}
          onSave={async(ret,lines)=>{ await onSaveReturn(ret,lines); setModal(null); }}
          onClose={()=>setModal(null)}/>
      )}
    </div>
  );
}

// ── Supplier Invoice Create/Edit Modal ──────────────────────────
export function WsSupInvoiceModal({item,wsSuppliers=[],wsStock=[],settings,fmt,onSave,onClose}) {
  const isEdit=!!item;
  const [suppId,setSuppId]=useState(item?.supplier_id||"");
  const [suppName,setSuppName]=useState(item?.supplier_name||"");
  const [invRef,setInvRef]=useState(item?.invoice_ref||"");
  const [invDate,setInvDate]=useState(item?.invoice_date||new Date().toISOString().slice(0,10));
  const [dueDate,setDueDate]=useState(item?.due_date||"");
  const [notes,setNotes]=useState(item?.notes||"");
  const [lines,setLines]=useState(isEdit?[]:[{stock_id:"",part_name:"",part_sku:"",qty:1,unit_cost:0,total:0}]);
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const vatRate=+(settings?.tax_rate||0)/100;
  const C=curSym(settings?.currency||getSettings().currency);

  const setLine=(i,k,v)=>setLines(p=>p.map((r,j)=>{
    if(j!==i) return r;
    const nr={...r,[k]:v};
    if(k==="qty"||k==="unit_cost") nr.total=(+nr.qty||0)*(+nr.unit_cost||0);
    return nr;
  }));

  const addLine=()=>setLines(p=>[...p,{stock_id:"",part_name:"",part_sku:"",qty:1,unit_cost:0,total:0}]);
  const removeLine=i=>setLines(p=>p.filter((_,j)=>j!==i));

  const selectStock=(i,s)=>{
    setLines(p=>p.map((r,j)=>j===i?{...r,stock_id:s.id,part_name:s.name,part_sku:s.sku||"",unit_cost:+s.unit_cost||0,total:(+r.qty||1)*(+s.unit_cost||0)}:r));
    setSearch("");
  };

  const subtotal=lines.reduce((s,l)=>s+(+l.total||0),0);
  const tax=vatRate>0&&settings?.vat_number?subtotal*vatRate:0;
  const total=subtotal+tax;

  const chooseSup=(id)=>{
    const s=wsSuppliers.find(x=>String(x.id)===id);
    setSuppId(id); setSuppName(s?.name||"");
  };

  const handleSave=async()=>{
    if(!suppName.trim()){alert("Select or enter a supplier");return;}
    if(lines.length===0||lines.every(l=>!l.part_name.trim())){alert("Add at least one line item");return;}
    setSaving(true);
    try{
      const inv={
        ...(isEdit?{id:item.id}:{}),
        supplier_id:suppId||null,supplier_name:suppName.trim(),
        invoice_ref:invRef.trim()||null,invoice_date:invDate,due_date:dueDate||null,
        subtotal,tax,total,paid_amount:isEdit?(item.paid_amount||0):0,
        status:isEdit?(item.status||"pending"):"pending",notes:notes.trim()||null,
      };
      const validLines=lines.filter(l=>l.part_name.trim()&&+l.qty>0);
      await onSave(inv,validLines);
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  const filteredStock=wsStock.filter(s=>{
    if(!search.trim()) return false;
    return `${s.name||""} ${s.sku||""}`.toLowerCase().includes(search.toLowerCase());
  }).slice(0,8);

  return (
    <Overlay onClose={onClose} wide>
      <MHead title={isEdit?"✏️ Edit Supplier Invoice":"🧾 New Supplier Invoice"} onClose={onClose}/>

      {/* Supplier */}
      <div className="card" style={{padding:12,marginBottom:12,background:"var(--surface2)"}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:8}}>Supplier</div>
        <FG>
          <div>
            <FL label="Select Supplier"/>
            <select className="inp" value={suppId} onChange={e=>chooseSup(e.target.value)}>
              <option value="">— Select —</option>
              {wsSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><FL label="Or type supplier name"/><input className="inp" value={suppName} onChange={e=>{setSuppName(e.target.value);setSuppId("");}}/></div>
        </FG>
        <FG>
          <div><FL label="Their Invoice Ref#"/><input className="inp" value={invRef} onChange={e=>setInvRef(e.target.value)} placeholder="e.g. INV-2025-001"/></div>
          <div><FL label="Invoice Date"/><input className="inp" type="date" value={invDate} onChange={e=>setInvDate(e.target.value)}/></div>
          <div><FL label="Due Date"/><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
        </FG>
      </div>

      {/* Line items */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Line Items</div>
      {!isEdit&&(
        <div style={{position:"relative",marginBottom:8}}>
          <input className="inp" placeholder="🔍 Search workshop stock to add..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filteredStock.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:99,background:"var(--surface1)",border:"1px solid var(--border)",borderRadius:8,maxHeight:200,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
              {filteredStock.map(s=>(
                <div key={s.id} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  onClick={()=>selectStock(lines.length-1,s)}>
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
                    {s.sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{s.sku}</code>}
                  </div>
                  <div style={{fontSize:12,color:"var(--text3)"}}>Cost: {C}{+s.unit_cost||0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:8}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["Part","Qty","Unit Cost","Total",""].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {lines.map((ln,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",borderBottom:i<lines.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <input className="inp" value={ln.part_name} onChange={e=>setLine(i,"part_name",e.target.value)} placeholder="Part name" style={{fontSize:12,padding:"4px 8px"}}/>
            <input className="inp" type="number" min="0.01" step="0.01" value={ln.qty} onChange={e=>setLine(i,"qty",e.target.value)} style={{fontSize:12,padding:"4px 8px",textAlign:"right"}}/>
            <input className="inp" type="number" min="0" step="0.01" value={ln.unit_cost} onChange={e=>setLine(i,"unit_cost",e.target.value)} style={{fontSize:12,padding:"4px 8px",textAlign:"right"}}/>
            <div style={{textAlign:"right",fontSize:13,fontWeight:700,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(ln.total)}</div>
            <button onClick={()=>removeLine(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:16,padding:0}} disabled={lines.length===1}>✕</button>
          </div>
        ))}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"8px 10px",background:"var(--surface2)",borderTop:"1px solid var(--border)"}}>
          <div style={{fontSize:12,fontWeight:700}}>Subtotal</div>
          <div/><div/>
          <div style={{textAlign:"right",fontWeight:800,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(subtotal)}</div>
          <div/>
        </div>
        {tax>0&&(
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"4px 10px 6px",background:"var(--surface2)"}}>
            <div style={{fontSize:12,color:"var(--text3)"}}>VAT ({settings?.tax_rate}%)</div>
            <div/><div/>
            <div style={{textAlign:"right",fontSize:12,fontFamily:"Rajdhani,sans-serif",color:"var(--text3)"}}>{fmt(tax)}</div>
            <div/>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 32px",gap:6,padding:"6px 10px",background:"var(--surface2)"}}>
          <div style={{fontSize:13,fontWeight:800}}>TOTAL</div>
          <div/><div/>
          <div style={{textAlign:"right",fontWeight:900,fontFamily:"Rajdhani,sans-serif",fontSize:16,color:"var(--accent)"}}>{fmt(total)}</div>
          <div/>
        </div>
      </div>
      {!isEdit&&<button className="btn btn-ghost btn-sm" onClick={addLine} style={{marginBottom:12}}>+ Add Line</button>}

      <FD><FL label="Notes"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:46,resize:"vertical"}} placeholder="Optional notes..."/></FD>
      {!isEdit&&<p style={{fontSize:11,color:"var(--text3)",marginTop:4}}>📦 Saving will add stock quantities to workshop stock automatically.</p>}

      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":isEdit?"💾 Save Changes":"✅ Save & Update Stock"}</button>
      </div>
    </Overlay>
  );
}

// ── Supplier Invoice View Modal ─────────────────────────────────
export function WsSupInvoiceViewModal({invoice,items=[],payments=[],returns=[],fmt,onClose}) {
  const owing=(+invoice.total||0)-(+invoice.paid_amount||0);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🧾 Invoice — ${invoice.invoice_ref||invoice.id}`} onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:14}}>{invoice.supplier_name}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_date}{invoice.due_date&&` · Due ${invoice.due_date}`}</div>
          {invoice.notes&&<div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>{invoice.notes}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:20,fontWeight:900,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{fmt(invoice.total)}</div>
          <div style={{fontSize:12,color:"var(--green)"}}>Paid: {fmt(invoice.paid_amount||0)}</div>
          {owing>0&&<div style={{fontSize:12,color:"var(--red)",fontWeight:700}}>Owing: {fmt(owing)}</div>}
        </div>
      </div>

      {/* Items */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Items Received</div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["Part","SKU","Qty","Cost"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {items.map((it,i)=>(
          <div key={it.id||i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:6,padding:"8px 10px",borderBottom:i<items.length-1?"1px solid var(--border)":"none",alignItems:"center"}}>
            <div style={{fontWeight:600,fontSize:13}}>{it.part_name}</div>
            <code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--blue)"}}>{it.part_sku||"—"}</code>
            <div>{it.qty}</div>
            <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>{fmt(it.total)}</div>
          </div>
        ))}
      </div>

      {/* Payments */}
      {payments.length>0&&(<>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Payments</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {payments.map((p,i)=>(
            <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"rgba(52,211,153,.08)",borderRadius:8,border:"1px solid rgba(52,211,153,.2)"}}>
              <div>
                <span style={{fontWeight:600,color:"var(--green)"}}>{fmt(p.amount)}</span>
                <span style={{fontSize:12,color:"var(--text3)",marginLeft:8}}>{p.payment_date} · {p.method||"cash"}</span>
                {p.reference&&<span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>Ref: {p.reference}</span>}
              </div>
              {p.notes&&<span style={{fontSize:11,color:"var(--text3)"}}>{p.notes}</span>}
            </div>
          ))}
        </div>
      </>)}

      {/* Returns */}
      {returns.length>0&&(<>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>Returns</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {returns.map((r,i)=>(
            <div key={r.id||i} style={{padding:"8px 12px",background:"rgba(251,191,36,.08)",borderRadius:8,border:"1px solid rgba(251,191,36,.2)"}}>
              <div style={{fontWeight:600,color:"var(--yellow)"}}>↩️ Return — {r.return_date}</div>
              {r.reason&&<div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{r.reason}</div>}
              <div style={{fontSize:12,color:"var(--accent)",fontWeight:700,marginTop:2}}>{fmt(r.total)}</div>
            </div>
          ))}
        </div>
      </>)}

      <button className="btn btn-ghost" style={{width:"100%"}} onClick={onClose}>Close</button>
    </Overlay>
  );
}

// ── Payment Modal ───────────────────────────────────────────────
export function WsSupPaymentModal({invoice,fmt,onSave,onClose}) {
  const owing=Math.max(0,(+invoice.total||0)-(+invoice.paid_amount||0));
  const [amount,setAmount]=useState(String(owing||""));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [method,setMethod]=useState("cash");
  const [ref,setRef]=useState("");
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);

  const handleSave=async()=>{
    if(!+amount||+amount<=0){alert("Enter a valid amount");return;}
    setSaving(true);
    try{
      await onSave({invoice_id:invoice.id,supplier_id:invoice.supplier_id||null,supplier_name:invoice.supplier_name||"",amount:+amount,payment_date:date,method,reference:ref.trim()||null,notes:notes.trim()||null});
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose}>
      <MHead title="💳 Record Payment" onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontWeight:700}}>{invoice.supplier_name}</div>
        <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_ref||invoice.id}</div>
        <div style={{marginTop:4,fontSize:13}}>Total: <strong>{fmt(invoice.total)}</strong> · Paid: <strong style={{color:"var(--green)"}}>{fmt(invoice.paid_amount||0)}</strong> · Owing: <strong style={{color:"var(--red)"}}>{fmt(owing)}</strong></div>
      </div>
      <FG>
        <div><FL label="Amount"/><input className="inp" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div><FL label="Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      </FG>
      <FG>
        <div><FL label="Method"/>
          <select className="inp" value={method} onChange={e=>setMethod(e.target.value)}>
            {["cash","bank transfer","cheque","card","other"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div><FL label="Reference"/><input className="inp" value={ref} onChange={e=>setRef(e.target.value)} placeholder="e.g. EFT ref, cheque #"/></div>
      </FG>
      <FD><FL label="Notes"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} style={{minHeight:44}}/></FD>
      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"✅ Record Payment"}</button>
      </div>
    </Overlay>
  );
}

// ── Return Modal ────────────────────────────────────────────────
export function WsSupReturnModal({invoice,items=[],fmt,onSave,onClose}) {
  const [lines,setLines]=useState(items.map(it=>({...it,return_qty:0,selected:false})));
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [reason,setReason]=useState("");
  const [saving,setSaving]=useState(false);

  const setLine=(i,k,v)=>setLines(p=>p.map((r,j)=>j===i?{...r,[k]:v}:r));

  const returnLines=lines.filter(l=>l.selected&&+l.return_qty>0);
  const total=returnLines.reduce((s,l)=>s+(+l.return_qty||0)*(+l.unit_cost||0),0);

  const handleSave=async()=>{
    if(returnLines.length===0){alert("Select at least one item to return");return;}
    setSaving(true);
    try{
      const ret={invoice_id:invoice.id,supplier_id:invoice.supplier_id||null,supplier_name:invoice.supplier_name||"",return_date:date,reason:reason.trim()||null,total,status:"pending"};
      await onSave(ret,returnLines.map(l=>({stock_id:l.stock_id||null,part_name:l.part_name,part_sku:l.part_sku||"",qty:+l.return_qty,unit_cost:+l.unit_cost})));
    }catch(e){alert("Save failed: "+e.message);}
    finally{setSaving(false);}
  };

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="↩️ Return Items to Supplier" onClose={onClose}/>
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
        <div style={{fontWeight:700}}>{invoice.supplier_name}</div>
        <div style={{fontSize:12,color:"var(--text3)"}}>{invoice.invoice_ref||invoice.id} · {invoice.invoice_date}</div>
      </div>
      <div style={{border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",marginBottom:10}}>
        <div style={{display:"grid",gridTemplateColumns:"32px 2fr 1fr 1fr 1fr",gap:6,padding:"6px 10px",background:"var(--surface2)",borderBottom:"1px solid var(--border)"}}>
          {["","Part","Invoiced Qty","Return Qty","Value"].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase"}}>{h}</div>)}
        </div>
        {lines.map((ln,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"32px 2fr 1fr 1fr 1fr",gap:6,padding:"8px 10px",borderBottom:i<lines.length-1?"1px solid var(--border)":"none",alignItems:"center",background:ln.selected?"var(--surface2)":"transparent"}}>
            <input type="checkbox" checked={ln.selected} onChange={e=>setLine(i,"selected",e.target.checked)} style={{width:15,height:15,accentColor:"var(--accent)"}}/>
            <div style={{fontWeight:600,fontSize:13}}>{ln.part_name}<br/>{ln.part_sku&&<code style={{fontFamily:"DM Mono,monospace",fontSize:10,color:"var(--blue)"}}>{ln.part_sku}</code>}</div>
            <div style={{textAlign:"center",color:"var(--text3)"}}>{ln.qty}</div>
            <input className="inp" type="number" min="0" max={ln.qty} step="1"
              value={ln.return_qty} onChange={e=>setLine(i,"return_qty",e.target.value)}
              disabled={!ln.selected} style={{padding:"4px 8px",textAlign:"right",fontSize:12,opacity:ln.selected?1:.4}}/>
            <div style={{textAlign:"right",fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--yellow)"}}>{ln.selected&&+ln.return_qty>0?fmt((+ln.return_qty)*(+ln.unit_cost||0)):"—"}</div>
          </div>
        ))}
        {returnLines.length>0&&(
          <div style={{padding:"8px 10px",background:"var(--surface2)",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"flex-end",gap:8}}>
            <span style={{fontSize:13,fontWeight:700}}>Return Total:</span>
            <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,color:"var(--yellow)",fontSize:14}}>{fmt(total)}</span>
          </div>
        )}
      </div>
      <FG>
        <div><FL label="Return Date"/><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><FL label="Reason"/><input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Wrong part, damaged"/></div>
      </FG>
      <p style={{fontSize:11,color:"var(--text3)",marginTop:4}}>📦 Stock quantities will be reduced for returned items.</p>
      <div style={{display:"flex",gap:10,marginTop:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?"Saving...":"↩️ Confirm Return"}</button>
      </div>
    </Overlay>
  );
}

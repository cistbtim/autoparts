import { useState, useEffect, useRef } from "react";
import { api, SUPABASE_URL, SUPABASE_KEY } from "../lib/api.js";
import { getSettings, curSym } from "../lib/settings.js";
import { CSS } from "../styles.js";
import { ShopLogo, MHead, FG, FD, FL } from "../components/shared.jsx";

export function RfqReplyPage({token,lang}) {
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
        <div style={{textAlign:"center",marginBottom:24}}>
          <ShopLogo settings={getSettings()} size="md" style={{width:"100%",maxWidth:"100%",maxHeight:100,objectFit:"contain",height:"auto",margin:"0 auto"}}/>
          <div style={{color:"var(--text3)",fontSize:12,marginTop:6}}>Supplier Quotation Portal</div>
        </div>
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

export function RfqQuoteReplyPage({token}) {
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
          <ShopLogo settings={getSettings()} size="md" style={{width:"100%",maxWidth:"100%",maxHeight:100,objectFit:"contain",height:"auto",margin:"0 auto"}}/>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:26,fontWeight:700,color:"var(--accent)",marginTop:10}}>📋 RFQ Quote Request</div>
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

export function RfqBatchReplyPage({token}) {
  const [session,setSession]=useState(null);
  const [supplierName,setSupplierName]=useState("");
  const [rows,setRows]=useState([]); // [{quote, item, form:{...}}]
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    (async()=>{
      // 1. Load the anchor quote by token
      const quotes=await api.get("rfq_quotes",`token=eq.${token}&select=*`);
      if(!Array.isArray(quotes)||!quotes[0]){setErr("Invalid or expired RFQ link.");setLoading(false);return;}
      const anchor=quotes[0];
      setSupplierName(anchor.supplier_name||"Supplier");

      // 2. Load ALL quotes for this session + supplier
      const allQuotes=await api.get("rfq_quotes",`rfq_id=eq.${anchor.rfq_id}&supplier_id=eq.${anchor.supplier_id}&select=*`);
      const qs=Array.isArray(allQuotes)?allQuotes:[];

      // 3. Load items + session + part_suppliers in parallel
      const [items,sess,partSupps]=await Promise.all([
        api.get("rfq_items",`rfq_id=eq.${anchor.rfq_id}&select=*`),
        api.get("rfq_sessions",`id=eq.${anchor.rfq_id}&select=*`),
        api.get("part_suppliers",`supplier_id=eq.${anchor.supplier_id}&select=*`).catch(()=>[]),
      ]);
      if(Array.isArray(sess)&&sess[0]) setSession(sess[0]);

      const itemMap=Object.fromEntries((Array.isArray(items)?items:[]).map(i=>[i.id,i]));
      // Build lookup: part_id → supplier_part_no from part_suppliers table
      const psMap=Object.fromEntries((Array.isArray(partSupps)?partSupps:[]).map(ps=>[String(ps.part_id),ps.supplier_part_no||""]));

      // 4. Build rows — auto-fill supplier_part_no from part_suppliers if not already in quote
      const built=qs.map(q=>{
        const item=itemMap[q.rfq_item_id]||{};
        const knownPartNo=q.supplier_part_no||psMap[String(item.part_id)]||"";
        return {
          quote:q,
          item,
          prefilled:!q.supplier_part_no&&!!psMap[String(item.part_id)],
          form:{
            supplier_part_no:knownPartNo,
            unit_price:q.unit_price||"",
            stock_qty:q.stock_qty||"",
            lead_days:q.lead_days||"",
            notes:q.notes||"",
          }
        };
      });
      setRows(built);
      setLoading(false);
    })();
  },[token]);

  const upd=(qi,k,v)=>setRows(prev=>prev.map((r,i)=>i===qi?{...r,form:{...r.form,[k]:v}}:r));

  const submitAll=async()=>{
    const missing=rows.filter(r=>!r.form.unit_price);
    if(missing.length>0){setErr(`Please enter price for: ${missing.map(r=>r.item.part_name).join(", ")}`);return;}
    setErr("");setSubmitting(true);
    for(const r of rows){
      await api.patch("rfq_quotes","token",r.quote.token,{
        supplier_part_no:r.form.supplier_part_no,
        unit_price:+r.form.unit_price,
        stock_qty:r.form.stock_qty?+r.form.stock_qty:null,
        lead_days:r.form.lead_days?+r.form.lead_days:null,
        notes:r.form.notes,
        status:"quoted",
        quoted_at:new Date().toISOString(),
      });
    }
    setSubmitting(false);setSubmitted(true);
  };

  const downloadCsv=()=>{
    const hdr=["Part Name","SKU","OE#","Qty Needed","Your Part#","Unit Price *","Stock Available","Lead Days","Notes"];
    const dataRows=rows.map(r=>[
      r.item.part_name||"",
      r.item.part_sku||"",
      r.item.oe_number||"",
      r.item.qty_needed||1,
      r.form.supplier_part_no,
      r.form.unit_price,
      r.form.stock_qty,
      r.form.lead_days,
      r.form.notes,
    ]);
    const csv=[hdr,...dataRows].map(row=>row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`RFQ_${session?.name||"batch"}.csv`;
    a.click();
  };

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{color:"#f97316",fontSize:15}}>⏳ Loading RFQ...</div>
    </div>
  );
  if(err&&!rows.length) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",color:"#fff",padding:40}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><div style={{fontSize:16}}>{err}</div></div>
    </div>
  );

  return (
    <div style={{background:"#0a0e1a",minHeight:"100vh",padding:"20px 12px"}}>
      <style>{CSS}</style>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <ShopLogo settings={getSettings()} size="md" style={{width:"100%",maxWidth:"100%",maxHeight:100,objectFit:"contain",height:"auto",margin:"0 auto"}}/>
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:22,fontWeight:700,color:"var(--accent)",marginTop:10}}>📋 Request for Quotation</div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:4}}>
            {session?.name&&<span style={{fontWeight:600,color:"var(--text)"}}>{session.name} · </span>}
            {supplierName} · {rows.length} item{rows.length!==1?"s":""}
            {session?.deadline&&<span style={{color:"var(--yellow)",marginLeft:8}}>⏰ Deadline: {session.deadline}</span>}
          </div>
        </div>

        {submitted?(
          <div className="card" style={{padding:32,textAlign:"center"}}>
            <div style={{fontSize:56,marginBottom:12}}>✅</div>
            <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>All Quotes Submitted!</div>
            <div style={{color:"var(--text3)",fontSize:14,marginBottom:20}}>Thank you, {supplierName}. We will review and get back to you.</div>
            <div className="card" style={{padding:16,background:"var(--surface2)",display:"inline-block",textAlign:"left"}}>
              {rows.map((r,i)=>(
                <div key={i} style={{display:"flex",gap:16,padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:13}}>
                  <span style={{flex:1,fontWeight:500}}>{r.item.part_name}</span>
                  <span style={{color:"var(--accent)",fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15}}>{r.form.unit_price}</span>
                  {r.form.stock_qty&&<span style={{color:"var(--text3)"}}>Qty: {r.form.stock_qty}</span>}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{marginTop:20,display:"block",margin:"20px auto 0"}} onClick={()=>setSubmitted(false)}>✏️ Edit Quotes</button>
          </div>
        ):(
          <>
            {/* Download CSV */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10,gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={downloadCsv}>📥 Download as CSV Template</button>
            </div>

            {/* Spreadsheet table */}
            <div className="card" style={{padding:0,overflow:"hidden",marginBottom:16}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"var(--surface3)"}}>
                      <th style={{padding:"10px 14px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:".05em",color:"var(--text3)",borderBottom:"2px solid var(--border)",minWidth:180}}>#  Part</th>
                      <th style={{padding:"10px 8px",textAlign:"center",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--text3)",borderBottom:"2px solid var(--border)",whiteSpace:"nowrap"}}>Qty Needed</th>
                      <th style={{padding:"10px 8px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--text3)",borderBottom:"2px solid var(--border)",minWidth:130}}>Your Part# </th>
                      <th style={{padding:"10px 8px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--accent)",borderBottom:"2px solid var(--border)",minWidth:110}}>Unit Price *</th>
                      <th style={{padding:"10px 8px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--text3)",borderBottom:"2px solid var(--border)",minWidth:90}}>Stock</th>
                      <th style={{padding:"10px 8px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--text3)",borderBottom:"2px solid var(--border)",minWidth:90}}>Lead (days)</th>
                      <th style={{padding:"10px 8px",textAlign:"left",fontWeight:700,fontSize:11,textTransform:"uppercase",color:"var(--text3)",borderBottom:"2px solid var(--border)",minWidth:160}}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={r.quote.id} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"rgba(255,255,255,.02)"}}>
                        <td style={{padding:"10px 14px",verticalAlign:"middle"}}>
                          <div style={{fontWeight:600,fontSize:13}}>{i+1}. {r.item.part_name||"—"}</div>
                          <div style={{fontSize:11,color:"var(--text3)",marginTop:2,fontFamily:"DM Mono,monospace"}}>
                            {r.item.part_sku&&<span>{r.item.part_sku}</span>}
                            {r.item.oe_number&&<span style={{marginLeft:8}}>OE: {r.item.oe_number}</span>}
                          </div>
                          {(r.item.make||r.item.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{[r.item.make,r.item.model,r.item.part_chinese_desc].filter(Boolean).join(" · ")}</div>}
                        </td>
                        <td style={{padding:"10px 8px",textAlign:"center",verticalAlign:"middle"}}>
                          <span style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{r.item.qty_needed||1}</span>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" value={r.form.supplier_part_no} onChange={e=>upd(i,"supplier_part_no",e.target.value)}
                            placeholder="your ref#"
                            style={{fontSize:12,fontFamily:"DM Mono,monospace",padding:"6px 8px",
                              borderColor:r.form.supplier_part_no?"rgba(52,211,153,.4)":"var(--border)",
                              background:r.form.supplier_part_no?"rgba(52,211,153,.04)":"transparent"}}/>
                          {r.prefilled&&<div style={{fontSize:10,color:"var(--green)",marginTop:2}}>✓ from records</div>}
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" type="number" value={r.form.unit_price} onChange={e=>upd(i,"unit_price",e.target.value)}
                            placeholder="0.00" step="0.01"
                            style={{fontSize:13,fontWeight:700,padding:"6px 8px",borderColor:!r.form.unit_price?"rgba(248,113,113,.5)":"var(--border)",color:"var(--accent)"}}/>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" type="number" value={r.form.stock_qty} onChange={e=>upd(i,"stock_qty",e.target.value)}
                            placeholder="qty" style={{fontSize:12,padding:"6px 8px"}}/>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" type="number" value={r.form.lead_days} onChange={e=>upd(i,"lead_days",e.target.value)}
                            placeholder="7" style={{fontSize:12,padding:"6px 8px"}}/>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" value={r.form.notes} onChange={e=>upd(i,"notes",e.target.value)}
                            placeholder="MOQ, conditions..." style={{fontSize:12,padding:"6px 8px"}}/>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fill-all shortcuts */}
            <div style={{background:"var(--surface2)",borderRadius:10,padding:12,marginBottom:16,border:"1px solid var(--border)"}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>⚡ Quick fill — apply same lead time or notes to all rows:</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>Lead days:</span>
                  <input className="inp" type="number" placeholder="e.g. 7" style={{width:70,fontSize:12,padding:"4px 8px"}}
                    onChange={e=>{if(e.target.value)setRows(prev=>prev.map(r=>({...r,form:{...r.form,lead_days:e.target.value}})));}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap"}}>Notes:</span>
                  <input className="inp" placeholder="apply to all rows" style={{width:180,fontSize:12,padding:"4px 8px"}}
                    onChange={e=>{if(e.target.value)setRows(prev=>prev.map(r=>({...r,form:{...r.form,notes:e.target.value}})));}}/>
                </div>
              </div>
            </div>

            {err&&<div style={{color:"var(--red)",fontSize:13,marginBottom:12,padding:"8px 12px",background:"rgba(248,113,113,.08)",borderRadius:8}}>⚠ {err}</div>}

            <button className="btn btn-primary" style={{width:"100%",padding:16,fontSize:16,fontWeight:700,borderRadius:12,marginBottom:20}}
              onClick={submitAll} disabled={submitting}>
              {submitting?"⏳ Submitting...":"📤 Submit All Quotes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function QuoteConfirmPage({token}) {
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
// WORKSHOP SUPPLIER QUOTE REPLY PAGE
// Supplier opens ?ws_supreq=<token> and fills in price/condition/part_no
// ═══════════════════════════════════════════════════════════════
export function WsSupplierQuoteReplyPage({token}) {
  const [req, setReq]     = useState(null);
  const [items, setItems] = useState([]); // [{idx,description,qty,sku,price,condition,supplier_part_no,notes}]
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");
  const shopSettings = getSettings();

  useEffect(()=>{
    api.get("ws_supplier_requests",`token=eq.${encodeURIComponent(token)}&select=*`)
      .then(async r=>{
        if(!Array.isArray(r)||!r[0]){setErr("Quote request not found or link has expired.");setLoading(false);return;}
        const request=r[0];
        setReq(request);
        // Check if already replied
        const reps=await api.get("ws_sq_replies",`request_id=eq.${request.id}&select=*`).catch(()=>[]);
        if(Array.isArray(reps)&&reps[0]){
          const prev=(() => { try{return JSON.parse(reps[0].items||"[]");}catch{return [];} })();
          setItems(prev);
          setDone(true);
        } else {
          const rawItems=(() => { try{return JSON.parse(request.items_json||"[]");}catch{return [];} })();
          setItems(rawItems.map((it,idx)=>({
            idx, description:it.label||it.description||"", qty:+it.qty||1, sku:it.sku||"",
            price:"", condition:"in_stock", supplier_part_no:"", notes:""
          })));
        }
        setLoading(false);
      })
      .catch(()=>{setErr("Failed to load request.");setLoading(false);});
  },[token]);

  const set=(idx,k,v)=>setItems(p=>p.map((r,i)=>i===idx?{...r,[k]:v}:r));

  const submit=async()=>{
    setSaving(true);
    try{
      const id="WSQR-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);
      await api.insert("ws_sq_replies",{
        id, request_id:req.id, workshop_id:req.workshop_id,
        items:JSON.stringify(items), submitted_at:new Date().toISOString()
      });
      await api.patch("ws_supplier_requests","id",req.id,{status:"replied"});
      setDone(true);
    }catch(e){setErr("Submit failed — please try again.");}
    setSaving(false);
  };

  const vatInclusive = req?.supplier_vat_inclusive||false;
  const inStockItems = items.filter(i=>i.condition!=="no_stock");
  const noStockItems = items.filter(i=>i.condition==="no_stock");

  const bg={background:"#0f172a",minHeight:"100vh",color:"#e2e8f0",fontFamily:"system-ui,sans-serif"};
  const card={background:"#1e293b",borderRadius:12,padding:"16px 18px",marginBottom:12,border:"1px solid #334155"};
  const inp={width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #475569",background:"#0f172a",color:"#e2e8f0",fontSize:13,boxSizing:"border-box"};
  const sel={...inp,cursor:"pointer"};

  if(loading) return <div style={{...bg,display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{color:"#38bdf8",fontSize:15,fontWeight:600}}>Loading…</div></div>;
  if(err&&!req) return <div style={{...bg,display:"flex",alignItems:"center",justifyContent:"center"}}><style>{CSS}</style><div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>⚠️</div><div style={{color:"#f87171"}}>{err}</div></div></div>;

  if(done) return (
    <div style={{...bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}><style>{CSS}</style>
      <div style={{maxWidth:440,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12}}>✅</div>
        <h2 style={{fontSize:20,fontWeight:700,color:"#34d399",marginBottom:8}}>Quote Submitted!</h2>
        <p style={{color:"#94a3b8",fontSize:14}}>Thank you — {shopSettings.shop_name||"the workshop"} will review your prices and be in touch.</p>
        {err&&<p style={{color:"#f87171",marginTop:8,fontSize:13}}>{err}</p>}
      </div>
    </div>
  );

  const ItemRow=({item,idx})=>(
    <div style={{...card,opacity:item.condition==="no_stock"?0.7:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14}}>{idx+1}. {item.description}</div>
          {item.sku&&<div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace",marginTop:2}}>{item.sku}</div>}
          {item.qty>1&&<div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Qty needed: <strong style={{color:"#e2e8f0"}}>{item.qty}</strong></div>}
        </div>
        <select value={item.condition} onChange={e=>set(items.indexOf(item),"condition",e.target.value)}
          style={{...sel,width:130,fontSize:12,flexShrink:0,
            color:item.condition==="in_stock"?"#34d399":item.condition==="can_order"?"#fbbf24":"#f87171",
            borderColor:item.condition==="in_stock"?"#34d399":item.condition==="can_order"?"#fbbf24":"#f87171"}}>
          <option value="in_stock">✅ In Stock</option>
          <option value="can_order">📦 Can Order</option>
          <option value="no_stock">❌ No Stock</option>
        </select>
      </div>
      {item.condition!=="no_stock"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Your Price <span style={{color:vatInclusive?"#fbbf24":"#64748b",fontWeight:600}}>({vatInclusive?"incl. VAT":"excl. VAT"})</span></div>
            <input style={inp} type="number" min="0" step="0.01" placeholder="0.00"
              value={item.price} onChange={e=>set(items.indexOf(item),"price",e.target.value)}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Your Part # <span style={{color:"#64748b"}}>(optional)</span></div>
            <input style={inp} type="text" placeholder="e.g. AB-12345"
              value={item.supplier_part_no} onChange={e=>set(items.indexOf(item),"supplier_part_no",e.target.value)}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Notes <span style={{color:"#64748b"}}>(optional — e.g. condition, ETA)</span></div>
            <input style={inp} type="text" placeholder="e.g. New OEM, available tomorrow"
              value={item.notes} onChange={e=>set(items.indexOf(item),"notes",e.target.value)}/>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={bg}><style>{CSS}</style>
      <div style={{maxWidth:520,margin:"0 auto",padding:"20px 12px 40px"}}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,marginBottom:6}}>🔧</div>
          <h1 style={{fontSize:18,fontWeight:800,color:"#f8fafc",marginBottom:4}}>{shopSettings.shop_name||"Workshop"}</h1>
          <div style={{fontSize:13,color:"#94a3b8"}}>Parts quote request</div>
          <div style={{display:"inline-block",marginTop:6,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
            background:vatInclusive?"rgba(251,191,36,.15)":"rgba(148,163,184,.12)",
            color:vatInclusive?"#fbbf24":"#94a3b8",border:`1px solid ${vatInclusive?"rgba(251,191,36,.4)":"rgba(148,163,184,.3)"}`}}>
            {vatInclusive?"Prices INCL. VAT":"Prices EXCL. VAT"}
          </div>
        </div>

        {/* Vehicle/job info */}
        {(req?.vehicle_reg||req?.supplier_name)&&(
          <div style={{...card,background:"#162032",marginBottom:18}}>
            {req.vehicle_reg&&<div style={{fontSize:15,fontWeight:700,color:"#38bdf8",marginBottom:4}}>🚗 {req.vehicle_reg}</div>}
            {req.supplier_name&&<div style={{fontSize:12,color:"#94a3b8"}}>For: {req.supplier_name}</div>}
          </div>
        )}

        {/* In-stock items */}
        {inStockItems.length>0&&(
          <>
            <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Parts to Quote</div>
            {inStockItems.map(item=><ItemRow key={item.idx} item={item} idx={items.indexOf(item)}/>)}
          </>
        )}

        {/* No-stock section at bottom */}
        {noStockItems.length>0&&(
          <>
            <div style={{fontSize:11,color:"#f87171",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",margin:"18px 0 8px",display:"flex",alignItems:"center",gap:6}}>
              <span>❌ No Stock</span>
              <div style={{flex:1,height:1,background:"rgba(248,113,113,.3)"}}/>
            </div>
            {noStockItems.map(item=><ItemRow key={item.idx} item={item} idx={items.indexOf(item)}/>)}
          </>
        )}

        {err&&<div style={{color:"#f87171",fontSize:13,marginBottom:10,textAlign:"center"}}>{err}</div>}

        <button onClick={submit} disabled={saving}
          style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",
            background:saving?"#334155":"#0ea5e9",color:"#fff",fontSize:15,fontWeight:700,cursor:saving?"not-allowed":"pointer",marginTop:8}}>
          {saving?"Submitting…":"✅ Submit Quote"}
        </button>
        <div style={{textAlign:"center",fontSize:11,color:"#475569",marginTop:12}}>
          Powered by AutoParts Workshop
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { api, SUPABASE_URL, SUPABASE_KEY } from "../lib/api.js";
import { toImgUrl, waLink } from "../lib/helpers.js";
import { getSettings, curSym } from "../lib/settings.js";
import { T } from "../lib/i18n.js";
import { CSS } from "../styles.js";
import { ShopLogo, MHead, FG, FD, FL } from "../components/shared.jsx";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";

// Match the browser/device's preferred language against a list of configured
// lang codes (arbitrary, admin-chosen — not guaranteed to be strict ISO 639-1).
// Tries exact tag, then primary subtag, then a small alias table for common
// mismatches (e.g. shop configured "cn" for Chinese instead of "zh").
const detectDeviceLang = (availableCodes) => {
  if (typeof navigator === "undefined") return null;
  const avail = new Set((availableCodes || []).map(c => (c || "").toLowerCase()));
  const aliases = { zh: ["cn", "zh-cn", "zh-hans", "zh-hant", "zh-tw", "zh-hk"], cn: ["zh"] };
  const prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language].filter(Boolean);
  for (const raw of prefs) {
    const full = (raw || "").toLowerCase();     // e.g. "zh-cn"
    const primary = full.split("-")[0];         // e.g. "zh"
    if (avail.has(full)) return full;
    if (avail.has(primary)) return primary;
    for (const alt of (aliases[primary] || [])) if (avail.has(alt)) return alt;
  }
  return null;
};

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
          } catch(e){/* ignore JSON parse failures */}
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
  const [avail,setAvail]=useState("in_stock"); // "in_stock" | "not_available"
  const [form,setForm]=useState({supplier_part_no:"",unit_price:"",stock_qty:"",lead_days:"",notes:""});
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    api.get("rfq_quotes",`token=eq.${token}&select=*`).then(async r=>{
      if(!Array.isArray(r)||!r[0]){setLoading(false);return;}
      const q=r[0];
      setQuote(q);
      if(q.status==="quoted"||q.status==="not_available") setSaved(true);
      if(q.availability==="not_available") setAvail("not_available");
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
    const notAvail=avail==="not_available";
    if(!notAvail&&!form.unit_price){alert("Please enter unit price");return;}
    await api.patch("rfq_quotes","token",token,{
      supplier_part_no:form.supplier_part_no,
      unit_price:notAvail?null:+form.unit_price,
      stock_qty:notAvail?0:form.stock_qty?+form.stock_qty:null,
      lead_days:notAvail?null:form.lead_days?+form.lead_days:null,
      notes:form.notes,
      availability:avail,
      status:notAvail?"not_available":"quoted",
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
          {session?.reply_deadline&&(()=>{const dl=new Date(session.reply_deadline);const hrs=Math.max(0,Math.round((dl-Date.now())/3600000));return <div style={{marginTop:8,padding:"6px 14px",borderRadius:20,display:"inline-block",background:hrs<6?"rgba(248,113,113,.15)":"rgba(251,146,60,.12)",color:hrs<6?"#f87171":"#f97316",fontSize:13,fontWeight:600}}>⏰ Reply by: {dl.toLocaleString()} {hrs>0?`(${hrs}h left)`:""}</div>;})()}
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

        {/* Availability toggle */}
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          <button onClick={()=>setAvail("in_stock")} style={{flex:1,padding:"12px 0",borderRadius:10,border:`2px solid ${avail==="in_stock"?"#34d399":"var(--border)"}`,background:avail==="in_stock"?"rgba(52,211,153,.12)":"var(--surface2)",color:avail==="in_stock"?"#34d399":"var(--text3)",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all .15s"}}>
            ✅ Available to Order
          </button>
          <button onClick={()=>setAvail("not_available")} style={{flex:1,padding:"12px 0",borderRadius:10,border:`2px solid ${avail==="not_available"?"#f87171":"var(--border)"}`,background:avail==="not_available"?"rgba(248,113,113,.12)":"var(--surface2)",color:avail==="not_available"?"#f87171":"var(--text3)",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all .15s"}}>
            ❌ Not Available
          </button>
        </div>

        {saved?(
          <div className="card" style={{padding:24,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>{avail==="not_available"?"❌":"✅"}</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>{avail==="not_available"?"Marked as Not Available":"Quote Submitted!"}</div>
            <div style={{color:"var(--text3)",fontSize:13}}>Thank you. Your response has been recorded.</div>
            {quote.unit_price&&avail!=="not_available"&&<div style={{marginTop:12,color:"var(--accent)",fontSize:20,fontFamily:"Rajdhani,sans-serif",fontWeight:700}}>Quoted: {quote.unit_price}</div>}
            <button className="btn btn-ghost" style={{marginTop:16,width:"100%"}} onClick={()=>setSaved(false)}>Edit Response</button>
          </div>
        ):(
          <div className="card" style={{padding:20}}>
            <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:14}}>{avail==="not_available"?"Not Available — Reason (optional)":"Your Quote"}</div>
            {avail==="in_stock"&&(
              <>
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
              </>
            )}
            <FD><FL label="Notes"/>
              <textarea className="inp" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder={avail==="not_available"?"Reason for unavailability (optional)":"Any conditions, MOQ, etc."} style={{minHeight:70}}/></FD>
            <button className="btn btn-primary" style={{width:"100%",padding:14,fontSize:15,marginTop:4,background:avail==="not_available"?"#f87171":undefined}} onClick={submit}>
              {avail==="not_available"?"❌ Confirm Not Available":"📤 Submit Quote"}
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
          avail:q.availability==="not_available"?"not_available":"in_stock",
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
  const updAvail=(qi,v)=>setRows(prev=>prev.map((r,i)=>i===qi?{...r,avail:v}:r));

  const submitAll=async()=>{
    const missing=rows.filter(r=>r.avail!=="not_available"&&!r.form.unit_price);
    if(missing.length>0){setErr(`Please enter price for: ${missing.map(r=>r.item.part_name).join(", ")}`);return;}
    setErr("");setSubmitting(true);
    for(const r of rows){
      const notAvail=r.avail==="not_available";
      await api.patch("rfq_quotes","token",r.quote.token,{
        supplier_part_no:r.form.supplier_part_no,
        unit_price:notAvail?null:+r.form.unit_price,
        stock_qty:notAvail?0:r.form.stock_qty?+r.form.stock_qty:null,
        lead_days:notAvail?null:r.form.lead_days?+r.form.lead_days:null,
        notes:r.form.notes,
        availability:r.avail,
        status:notAvail?"not_available":"quoted",
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
            {session?.reply_deadline&&(()=>{const dl=new Date(session.reply_deadline);const hrs=Math.max(0,Math.round((dl-Date.now())/3600000));return <span style={{marginLeft:10,padding:"3px 10px",borderRadius:12,background:hrs<6?"rgba(248,113,113,.15)":"rgba(251,146,60,.12)",color:hrs<6?"#f87171":"#f97316",fontWeight:600}}>⏰ {dl.toLocaleString()} {hrs>0?`(${hrs}h left)`:""}</span>;})()}
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
                    {rows.map((r,i)=>{
                      const na=r.avail==="not_available";
                      return (
                      <tr key={r.quote.id} style={{borderBottom:"1px solid var(--border)",background:na?"rgba(248,113,113,.05)":i%2===0?"transparent":"rgba(255,255,255,.02)",opacity:na?.7:1}}>
                        <td style={{padding:"10px 14px",verticalAlign:"middle"}}>
                          <div style={{fontWeight:600,fontSize:13}}>{i+1}. {r.item.part_name||"—"}</div>
                          <div style={{fontSize:11,color:"var(--text3)",marginTop:2,fontFamily:"DM Mono,monospace"}}>
                            {r.item.part_sku&&<span>{r.item.part_sku}</span>}
                            {r.item.oe_number&&<span style={{marginLeft:8}}>OE: {r.item.oe_number}</span>}
                          </div>
                          {(r.item.make||r.item.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{[r.item.make,r.item.model,r.item.part_chinese_desc].filter(Boolean).join(" · ")}</div>}
                          {/* Availability toggle */}
                          <div style={{display:"flex",gap:4,marginTop:6}}>
                            <button onClick={()=>updAvail(i,"in_stock")} style={{fontSize:10,padding:"2px 8px",borderRadius:8,border:`1px solid ${!na?"#34d399":"var(--border)"}`,background:!na?"rgba(52,211,153,.15)":"transparent",color:!na?"#34d399":"var(--text3)",cursor:"pointer",fontWeight:700}}>✓ Available</button>
                            <button onClick={()=>updAvail(i,"not_available")} style={{fontSize:10,padding:"2px 8px",borderRadius:8,border:`1px solid ${na?"#f87171":"var(--border)"}`,background:na?"rgba(248,113,113,.15)":"transparent",color:na?"#f87171":"var(--text3)",cursor:"pointer",fontWeight:700}}>✗ Not Available</button>
                          </div>
                        </td>
                        <td style={{padding:"10px 8px",textAlign:"center",verticalAlign:"middle"}}>
                          <span style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>{r.item.qty_needed||1}</span>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" value={r.form.supplier_part_no} onChange={e=>upd(i,"supplier_part_no",e.target.value)}
                            placeholder="your ref#" disabled={na}
                            style={{fontSize:12,fontFamily:"DM Mono,monospace",padding:"6px 8px",
                              borderColor:r.form.supplier_part_no?"rgba(52,211,153,.4)":"var(--border)",
                              background:r.form.supplier_part_no?"rgba(52,211,153,.04)":"transparent",opacity:na?.5:1}}/>
                          {r.prefilled&&!na&&<div style={{fontSize:10,color:"var(--green)",marginTop:2}}>✓ from records</div>}
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          {na?<span style={{color:"var(--text3)",fontSize:12,padding:"6px 8px",display:"block"}}>—</span>:
                          <input className="inp" type="number" value={r.form.unit_price} onChange={e=>upd(i,"unit_price",e.target.value)}
                            placeholder="0.00" step="0.01"
                            style={{fontSize:13,fontWeight:700,padding:"6px 8px",borderColor:!r.form.unit_price?"rgba(248,113,113,.5)":"var(--border)",color:"var(--accent)"}}/>}
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" type="number" value={na?"0":r.form.stock_qty} onChange={e=>upd(i,"stock_qty",e.target.value)}
                            placeholder="qty" disabled={na} style={{fontSize:12,padding:"6px 8px",opacity:na?.5:1}}/>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" type="number" value={r.form.lead_days} onChange={e=>upd(i,"lead_days",e.target.value)}
                            placeholder="7" disabled={na} style={{fontSize:12,padding:"6px 8px",opacity:na?.5:1}}/>
                        </td>
                        <td style={{padding:"6px 8px",verticalAlign:"middle"}}>
                          <input className="inp" value={r.form.notes} onChange={e=>upd(i,"notes",e.target.value)}
                            placeholder={na?"Reason (optional)":"MOQ, conditions..."} style={{fontSize:12,padding:"6px 8px"}}/>
                        </td>
                      </tr>
                      );
                    })}
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
  const [wsProfile,setWsProfile]=useState({});
  const [loading,setLoading]=useState(true);
  const [note,setNote]=useState("");
  const [done,setDone]=useState(null); // null | "confirmed" | "declined"
  const [saving,setSaving]=useState(false);
  const [agreed,setAgreed]=useState(false);
  const [t,setT]=useState(T.en);

  useEffect(()=>{
    (async()=>{
      const [qs,ss]=await Promise.all([
        api.get("workshop_quotes",`confirm_token=eq.${token}&select=*`).catch(()=>[]),
        api.get("settings","id=eq.1&select=*").catch(()=>[]),
      ]);
      const q=Array.isArray(qs)&&qs[0]?qs[0]:null;
      const shopSett=Array.isArray(ss)&&ss[0]?ss[0]:{};
      if(q){
        setQuote(q);
        if(q.confirm_status==="confirmed"||q.confirm_status==="declined") setDone(q.confirm_status);
        const [ji,jj,wp]=await Promise.all([
          api.get("workshop_job_items",`job_id=eq.${q.job_id}&select=*`).catch(()=>[]),
          api.get("workshop_jobs",`id=eq.${q.job_id}&select=*`).catch(()=>[]),
          // Try to fetch workshop profile for logo — may be blocked by RLS, that's fine
          q.workshop_id?api.get("workshop_profiles",`id=eq.${q.workshop_id}&select=name,phone,whatsapp,email,address,logo_url,logo_data,vat_number`).catch(()=>[]):Promise.resolve([]),
        ]);
        const allItems=Array.isArray(ji)?ji:[];
        // Only show the items actually selected for this quote, not every item on the job.
        const shownItems=q.selected_item_ids
          ? (()=>{ try{ const ids=new Set(JSON.parse(q.selected_item_ids)); const f=allItems.filter(i=>ids.has(i.id)); return f.length>0?f:allItems; }catch{ return allItems; } })()
          : allItems;
        setItems(shownItems);
        if(Array.isArray(jj)&&jj[0]) setJob(jj[0]);
        // Build workshop info: denormalized quote fields for text, profile fetch for logo
        const prof=Array.isArray(wp)&&wp[0]?wp[0]:null;
        setWsProfile({
          name:     q.ws_name||prof?.name||"",
          phone:    q.ws_phone||prof?.phone||prof?.whatsapp||"",
          email:    q.ws_email||prof?.email||"",
          address:  q.ws_address||prof?.address||"",
          logo_url: prof?.logo_url||prof?.logo_data||q.ws_logo_url||"",
          vat_number: q.ws_vat||prof?.vat_number||"",
        });
      }
      setShopSettings(shopSett);
      // Load shop language translation pack
      const lang=shopSett.default_lang||"en";
      if(lang!=="en"){
        const tr=await api.get("app_translations",`lang=eq.${lang}&active=eq.true&select=t`).catch(()=>[]);
        if(Array.isArray(tr)&&tr[0]?.t) setT({...T.en,...tr[0].t});
      }
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
  // Use workshop profile info if available, fall back to main shop settings
  const bizName=wsProfile.name||shopSettings.shop_name||"Auto Workshop";
  const bizPhone=wsProfile.phone||wsProfile.whatsapp||shopSettings.phone||"";
  const bizEmail=wsProfile.email||shopSettings.email||"";
  const bizAddress=wsProfile.address||shopSettings.address||"";
  const bizVat=wsProfile.vat_number||shopSettings.vat_number||"";
  // Only fall back to main shop logo if we have NO workshop info at all
  const bizLogo=wsProfile.logo_url||(wsProfile.name?"":shopSettings.logo_data||shopSettings.logo_url||"");

  const downloadPdf=()=>{
    if(!quote) return;
    const subtotal=items.reduce((s,i)=>s+(+i.total||0),0);
    const taxRate=bizVat?(shopSettings.tax_rate||0):0;
    const taxAmt=subtotal*taxRate/100;
    const total=subtotal+taxAmt;
    const logoSrc=bizLogo;
    const logoHtml=logoSrc?`<img src="${logoSrc}" style="max-height:60px;max-width:180px;object-fit:contain;display:block;margin-bottom:8px"/>`:"";
    const partItems=items.filter(i=>i.type==="part");
    const labourItems=items.filter(i=>i.type!=="part");
    const partsSubtotal=partItems.reduce((s,i)=>s+(+i.total||0),0);
    const labourSubtotal=labourItems.reduce((s,i)=>s+(+i.total||0),0);
    const itemRow=(it,i)=>`
      <tr style="background:${i%2===0?"#fff":"#f9f9f9"}">
        <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;
            background:${it.type==="part"?"#dbeafe":"#dcfce7"};color:${it.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">
            ${it.type==="part"?t.wsqPart:t.wsqLabour}</span>
          ${it.description||""}${it.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${it.part_sku}</span>`:""}
        </td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${it.qty}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(it.unit_price)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(it.total)}</td>
      </tr>`;
    const subtotalRowHtml=(label,amt)=>`
      <tr style="background:#dbeafe">
        <td colspan="3" style="padding:10px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:800;font-size:13px;color:#1d4ed8;text-transform:uppercase;letter-spacing:.03em">${label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:800;font-size:15px;color:#1d4ed8">${fmt(amt)}</td>
      </tr>`;
    const rowsHtml=
      partItems.map(itemRow).join("")+
      (partItems.length>0?subtotalRowHtml(t.wsqPartsSubtotal,partsSubtotal):"")+
      labourItems.map(itemRow).join("")+
      (labourItems.length>0?subtotalRowHtml(t.wsqLabourSubtotal,labourSubtotal):"");
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quotation ${quote.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #2563eb;margin-bottom:24px}
  .shop{font-size:24px;font-weight:900;color:#f97316}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.8}
  .qblock{text-align:right}
  .qtitle{font-size:18px;font-weight:700;color:#2563eb}
  .qno{font-size:14px;font-weight:700;color:#f97316;margin-top:4px}
  .qmeta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .clabel{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .cname{font-size:15px;font-weight:700;margin-bottom:3px}
  .cinfo{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#2563eb;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;align-items:center;padding:14px 12px;font-size:22px;font-weight:900;color:#f97316;background:#fff7ed;border-top:3px solid #f97316;border-radius:0 0 6px 6px;margin-top:4px}
  .notes-box{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  @media print{body{padding:18px}}
</style></head><body>
<div class="hdr">
  <div>${logoHtml}<div class="shop">${bizName}</div>
    <div class="shop-info">
      ${bizPhone?`📞 ${bizPhone}<br/>`:""}
      ${bizEmail?`✉️ ${bizEmail}<br/>`:""}
      ${bizAddress?`📍 ${bizAddress}<br/>`:""}
      ${bizVat?`VAT Reg No: <strong>${bizVat}</strong>`:""}
    </div>
  </div>
  <div class="qblock">
    <div class="qtitle">${t.wsqPdfQuotation}</div>
    <div class="qno">${quote.id}</div>
    <div class="qmeta">
      ${t.wsqPdfDate}: ${quote.quote_date||""}<br/>
      ${quote.valid_until?`${t.wsqPdfValidUntil}: ${quote.valid_until}<br/>`:""}
    </div>
  </div>
</div>
<div class="grid2">
  <div class="card">
    <div class="clabel">${t.wsqPdfCustomer}</div>
    <div class="cname">${quote.quote_customer||job?.customer_name||"—"}</div>
    <div class="cinfo">
      ${job?.customer_phone?`📞 ${job.customer_phone}<br/>`:""}
      ${job?.customer_email?`✉️ ${job.customer_email}<br/>`:""}
    </div>
  </div>
  <div class="card">
    <div class="clabel">${t.wsqPdfVehicle}</div>
    <div class="cname">${job?.vehicle_reg||"—"}</div>
    <div class="cinfo">
      ${[job?.vehicle_make,job?.vehicle_model,job?.vehicle_year].filter(Boolean).join(" ")||""}<br/>
      ${job?.vehicle_color?`${job.vehicle_color}<br/>`:""}
      ${job?.mileage?`${t.wsqPdfMileage}: ${Number(job.mileage).toLocaleString()} km`:""}
    </div>
  </div>
</div>
<table>
  <thead><tr>
    <th>${t.wsqPdfDescription}</th>
    <th style="text-align:right">${t.wsqPdfQty}</th>
    <th style="text-align:right">${t.wsqPdfUnitPrice}</th>
    <th style="text-align:right">${t.total}</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="totals">
  <div class="t-row"><span>${t.wsqPdfSubtotal}</span><span>${fmt(subtotal)}</span></div>
  ${taxRate>0?`<div class="t-row"><span>${t.wsqPdfVat} (${taxRate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
  <div class="t-total"><span>${t.wsqPdfTotal}</span><span>${fmt(total)}</span></div>
</div>
${quote.notes?`<div class="notes-box"><strong>${t.wsqPdfNotes}:</strong> ${quote.notes}</div>`:""}
<div class="footer">
  ${bizName}${bizPhone?` · 📞 ${bizPhone}`:""}${bizEmail?` · ✉️ ${bizEmail}`:""}
</div>
</body></html>`;
    const w=window.open("","_blank");
    if(w){ w.document.write(html); w.document.close(); setTimeout(()=>w.print(),400); }
  };

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
          {bizLogo
            ?<img src={bizLogo} alt={bizName} style={{maxHeight:72,maxWidth:200,objectFit:"contain",marginBottom:8,borderRadius:8}}/>
            :<div style={{fontSize:28,marginBottom:6}}>🔧</div>}
          <div style={{fontFamily:"Rajdhani,sans-serif",fontSize:24,fontWeight:700,color:"var(--accent)"}}>{bizName}</div>
          <div style={{color:"var(--text3)",fontSize:13,marginTop:4}}>{t.wsqApprovalTitle}</div>
        </div>

        {done?(
          <div className="card" style={{padding:32,textAlign:"center"}}>
            <div style={{fontSize:56,marginBottom:12}}>{done==="confirmed"?"✅":"❌"}</div>
            <div style={{fontSize:20,fontWeight:700,marginBottom:8,color:done==="confirmed"?"var(--green)":"var(--red)"}}>
              {done==="confirmed"?t.wsqApproved:t.wsqDeclined}
            </div>
            <div style={{color:"var(--text3)",fontSize:14,lineHeight:1.6}}>
              {done==="confirmed"?t.wsqApprovedMsg:t.wsqDeclinedMsg}
            </div>
            <div style={{marginTop:16,fontSize:13,color:"var(--text3)"}}>
              {bizPhone&&<div>📞 {bizPhone}</div>}
              {bizEmail&&<div>✉️ {bizEmail}</div>}
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
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                  <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:22,color:"var(--accent)"}}>{fmt(quote.total)}</div>
                  <button onClick={downloadPdf}
                    style={{fontSize:12,padding:"5px 12px",background:"rgba(37,99,235,.12)",border:"1px solid rgba(37,99,235,.3)",
                      borderRadius:8,cursor:"pointer",color:"var(--blue)",fontWeight:600,whiteSpace:"nowrap"}}>
                    📄 {t.wsqDownloadPdf}
                  </button>
                </div>
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
              <div style={{padding:"10px 16px",fontWeight:700,fontSize:13,borderBottom:"1px solid var(--border)",background:"var(--surface2)"}}>📋 {t.wsqWorkItems}</div>
              {items.length===0
                ? <div style={{padding:16,color:"var(--text3)",fontSize:13,textAlign:"center"}}>{t.wsqNoItems}</div>
                : (()=>{
                    const partItems=items.filter(i=>i.type==="part");
                    const labourItems=items.filter(i=>i.type!=="part");
                    const partsSubtotal=partItems.reduce((s,i)=>s+(+i.total||0),0);
                    const labourSubtotal=labourItems.reduce((s,i)=>s+(+i.total||0),0);
                    const row=(it,i)=>(
                      <div key={it.id||i} style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13}}>{it.description}</div>
                          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                            {it.type==="part"?`🔩 ${t.wsqPart}`:`👷 ${t.wsqLabour}`} · {t.wsqPdfQty}: {it.qty} × {fmt(it.unit_price)}
                          </div>
                        </div>
                        <div style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,color:"var(--accent)",flexShrink:0}}>{fmt(it.total)}</div>
                      </div>
                    );
                    const subtotalRow=(label,amt)=>(
                      <div style={{padding:"11px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",background:"rgba(96,165,250,.1)"}}>
                        <span style={{fontSize:14,fontWeight:800,color:"var(--blue)",textTransform:"uppercase",letterSpacing:".03em"}}>{label}</span>
                        <span style={{fontFamily:"Rajdhani,sans-serif",fontSize:17,fontWeight:800,color:"var(--blue)"}}>{fmt(amt)}</span>
                      </div>
                    );
                    return (
                      <>
                        {partItems.map(row)}
                        {partItems.length>0&&subtotalRow(t.wsqPartsSubtotal,partsSubtotal)}
                        {labourItems.map(row)}
                        {labourItems.length>0&&subtotalRow(t.wsqLabourSubtotal,labourSubtotal)}
                      </>
                    );
                  })()
              }
              <div style={{padding:"16px 18px",borderTop:"3px solid var(--accent)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(249,115,22,.1)"}}>
                <span style={{fontWeight:800,fontSize:16,textTransform:"uppercase",letterSpacing:".05em"}}>Total</span>
                <span style={{fontFamily:"Rajdhani,sans-serif",fontWeight:900,fontSize:28,color:"var(--accent)"}}>{fmt(quote.total)}</span>
              </div>
            </div>

            {/* Notes from workshop */}
            {quote.notes&&(
              <div style={{padding:"14px 18px",marginBottom:14,background:"#fffbeb",border:"2px solid #f59e0b",borderRadius:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>📋 {t.wsqWorkshopNotes}</div>
                <div style={{fontSize:15,fontWeight:600,color:"#1a1a1a",lineHeight:1.5}}>{quote.notes}</div>
              </div>
            )}

            {/* Customer note */}
            <div style={{marginBottom:14}}>
              <FL label={t.wsqYourMsg}/>
              <textarea className="inp" rows={3} value={note} onChange={e=>setNote(e.target.value)}
                placeholder={t.wsqMsgPlaceholder}/>
            </div>

            {/* Read & agree checkbox */}
            <label style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 18px",marginBottom:14,background:"#fffbeb",border:"2px solid #f59e0b",borderRadius:12,cursor:"pointer"}}>
              <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}
                style={{width:22,height:22,marginTop:2,accentColor:"#f97316",flexShrink:0,cursor:"pointer"}}/>
              <span style={{fontSize:15,fontWeight:600,color:"#1a1a1a",lineHeight:1.5}}>
                I have read and understood the quotation and agree to the terms stated above.
              </span>
            </label>

            {/* Action buttons */}
            <div style={{display:"flex",gap:12,marginBottom:24}}>
              <button className="btn" style={{flex:1,padding:16,fontSize:15,fontWeight:700,background:"rgba(248,113,113,.15)",color:"var(--red)",border:"2px solid rgba(248,113,113,.4)",borderRadius:12}}
                onClick={()=>respond("declined")} disabled={saving}>
                ❌ {t.wsqDeclineBtn}
              </button>
              <button className="btn btn-primary" style={{flex:2,padding:16,fontSize:15,fontWeight:700,borderRadius:12,opacity:agreed?1:.4,cursor:agreed?"pointer":"not-allowed",transition:"opacity .2s"}}
                onClick={()=>agreed&&respond("confirmed")} disabled={saving||!agreed}>
                {saving?t.wsqSubmitting:`✅ ${t.wsqApproveBtn}`}
              </button>
            </div>

            {/* Workshop contact */}
            <div style={{textAlign:"center",color:"var(--text3)",fontSize:12}}>
              <div style={{marginBottom:4}}>{t.wsqContact}</div>
              {bizPhone&&<div>📞 {bizPhone}</div>}
              {bizEmail&&<div>✉️ {bizEmail}</div>}
              {bizAddress&&<div>📍 {bizAddress}</div>}
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
  const [req, setReq]         = useState(null);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");
  const [lightbox,setLightbox]= useState("");
  const [regOpen,  setRegOpen]  = useState(false);
  const [regForm,  setRegForm]  = useState({name:"",type:"spare_shop",contact:"",phone:"",email:"",city:""});
  const [regSaving,setRegSaving]= useState(false);
  const [regDone,  setRegDone]  = useState(false);
  const [regErr,   setRegErr]   = useState("");
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

  const renderItem=(item)=>{
    const gi=items.indexOf(item);
    return (
      <div key={item.idx??gi} style={{...card,opacity:item.condition==="no_stock"?0.7:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14}}>{gi+1}. {item.description}</div>
            {item.sku&&<div style={{fontSize:11,color:"#94a3b8",fontFamily:"monospace",marginTop:2}}>{item.sku}</div>}
            {item.qty>1&&<div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Qty needed: <strong style={{color:"#e2e8f0"}}>{item.qty}</strong></div>}
          </div>
          <select value={item.condition} onChange={e=>set(gi,"condition",e.target.value)}
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
                value={item.price} onChange={e=>set(gi,"price",e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Your Part # <span style={{color:"#64748b"}}>(optional)</span></div>
              <input style={inp} type="text" placeholder="e.g. AB-12345"
                value={item.supplier_part_no} onChange={e=>set(gi,"supplier_part_no",e.target.value)}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Notes <span style={{color:"#64748b"}}>(optional — e.g. condition, ETA)</span></div>
              <input style={inp} type="text" placeholder="e.g. New OEM, available tomorrow"
                value={item.notes} onChange={e=>set(gi,"notes",e.target.value)}/>
            </div>
          </div>
        )}
      </div>
    );
  };

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
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontSize:20}}>🚗</span>
              <div style={{flex:1,minWidth:0}}>
                {req.vehicle_reg&&<div style={{fontSize:16,fontWeight:800,color:"#38bdf8",letterSpacing:".05em"}}>{req.vehicle_reg}</div>}
                {(req.vehicle_make||req.vehicle_model)&&(
                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginTop:1}}>
                    {[req.vehicle_make,req.vehicle_model].filter(Boolean).join(" ")}
                    {req.vehicle_year&&<span style={{color:"#94a3b8",fontWeight:400}}> · {req.vehicle_year}</span>}
                    {req.vehicle_color&&<span style={{color:"#94a3b8",fontWeight:400}}> · {req.vehicle_color}</span>}
                  </div>
                )}
              </div>
            </div>
            {(req.vin||req.engine_no)&&(
              <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:"#94a3b8",marginBottom:8,fontFamily:"monospace"}}>
                {req.vin&&<span>VIN: <strong style={{color:"#cbd5e1"}}>{req.vin}</strong></span>}
                {req.engine_no&&<span>Eng: <strong style={{color:"#cbd5e1"}}>{req.engine_no}</strong></span>}
              </div>
            )}
            {/* Vehicle photos */}
            {(req.photo_front||req.photo_rear||req.photo_side)&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                {[{url:req.photo_front,label:"Front"},{url:req.photo_side,label:"Side"},{url:req.photo_rear,label:"Rear"}].filter(p=>p.url).map(p=>(
                  <div key={p.label} style={{flex:"1 1 140px",cursor:"pointer"}} onClick={()=>setLightbox(p.url)}>
                    <img src={toImgUrl(p.url)} alt={p.label}
                      style={{width:"100%",aspectRatio:"4/3",objectFit:"cover",borderRadius:10,border:"1px solid #334155",display:"block"}}/>
                    <div style={{fontSize:11,color:"#64748b",textAlign:"center",marginTop:4,fontWeight:600}}>{p.label}</div>
                  </div>
                ))}
              </div>
            )}
            {lightbox&&(
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.96)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}
                onClick={()=>setLightbox("")}>
                <img src={toImgUrl(lightbox)} alt=""
                  style={{width:"100vw",height:"100vh",objectFit:"contain",display:"block"}}
                  onClick={e=>e.stopPropagation()}/>
                <button onClick={()=>setLightbox("")}
                  style={{position:"absolute",top:12,right:12,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,fontSize:20,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>
                  ✕
                </button>
              </div>
            )}
            {/* Partsouq link */}
            {(req.vin||req.vehicle_make)&&(
              <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                {req.vin&&(
                  <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent(req.vin)}`}
                    target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                    <button style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"1px solid rgba(96,165,250,.4)",background:"rgba(96,165,250,.12)",color:"#60a5fa",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      🔩 Partsouq <span style={{fontSize:10,opacity:.7}}>by VIN</span>
                    </button>
                  </a>
                )}
                {(req.vehicle_make||req.vehicle_model)&&(
                  <a href={`https://partsouq.com/en/search/all?q=${encodeURIComponent([req.vehicle_make,req.vehicle_model].filter(Boolean).join(" "))}`}
                    target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
                    <button style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"1px solid rgba(96,165,250,.4)",background:"rgba(96,165,250,.12)",color:"#60a5fa",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      🔩 Partsouq <span style={{fontSize:10,opacity:.7}}>by model</span>
                    </button>
                  </a>
                )}
              </div>
            )}
            {req.supplier_name&&<div style={{fontSize:11,color:"#64748b",marginTop:8}}>For: {req.supplier_name}</div>}
          </div>
        )}

        {/* In-stock items */}
        {inStockItems.length>0&&(
          <>
            <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Parts to Quote</div>
            {inStockItems.map(item=>renderItem(item))}
          </>
        )}

        {/* No-stock section at bottom */}
        {noStockItems.length>0&&(
          <>
            <div style={{fontSize:11,color:"#f87171",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",margin:"18px 0 8px",display:"flex",alignItems:"center",gap:6}}>
              <span>❌ No Stock</span>
              <div style={{flex:1,height:1,background:"rgba(248,113,113,.3)"}}/>
            </div>
            {noStockItems.map(item=>renderItem(item))}
          </>
        )}

        {err&&<div style={{color:"#f87171",fontSize:13,marginBottom:10,textAlign:"center"}}>{err}</div>}

        <button onClick={submit} disabled={saving}
          style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",
            background:saving?"#334155":"#0ea5e9",color:"#fff",fontSize:15,fontWeight:700,cursor:saving?"not-allowed":"pointer",marginTop:8}}>
          {saving?"Submitting…":"✅ Submit Quote"}
        </button>
        {/* Promo banner / Registration form */}
        {regDone ? (
          <div style={{marginTop:20,borderRadius:14,background:"linear-gradient(135deg,#0f172a 0%,#14532d 60%,#22c55e 100%)",padding:"24px 20px",textAlign:"center",boxShadow:"0 4px 24px rgba(34,197,94,.25)"}}>
            <div style={{fontSize:32,marginBottom:8}}>🎉</div>
            <div style={{fontWeight:800,fontSize:16,color:"#fff",marginBottom:6}}>Registration Received!</div>
            <div style={{fontSize:13,color:"#bbf7d0",lineHeight:1.6}}>Thank you! Our team will contact you shortly to set up your free 2-month trial account.</div>
            <div style={{fontSize:11,color:"#4ade80",marginTop:12}}>Powered by <strong style={{color:"#fff"}}>MotorDesk</strong></div>
          </div>
        ) : (
          <div style={{marginTop:20,borderRadius:14,background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#0ea5e9 100%)",padding:"18px 20px",boxShadow:"0 4px 24px rgba(14,165,233,.25)"}}>
            {!regOpen ? (
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:4}}>🔧🚗📱</div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff",lineHeight:1.3,marginBottom:6}}>Register your Spare Shop or Scrapyard</div>
                <div style={{fontSize:12,color:"#bae6fd",marginBottom:14,lineHeight:1.6}}>
                  Get your own web system on desktop &amp; mobile phone.<br/>
                  Manage inventory, quotes, invoices &amp; customers — all in one place.
                </div>
                <button onClick={()=>setRegOpen(true)}
                  style={{display:"inline-block",background:"#f97316",color:"#fff",fontWeight:700,fontSize:13,borderRadius:8,padding:"10px 24px",marginBottom:10,border:"none",cursor:"pointer",letterSpacing:".3px"}}>
                  🎁 2-Month Free Trial — Register Now
                </button>
                <div style={{fontSize:11,color:"#7dd3fc"}}>Powered by <strong style={{color:"#fff"}}>MotorDesk</strong></div>
              </div>
            ) : (
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff",textAlign:"center",marginBottom:16}}>🎁 Start Your Free Trial</div>
                {/* Business type */}
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,color:"#bae6fd",display:"block",marginBottom:6,fontWeight:600}}>Business Type</label>
                  <div style={{display:"flex",gap:8}}>
                    {[["spare_shop","🏪 Spare Shop"],["scrapyard","♻️ Scrapyard"]].map(([val,lbl])=>(
                      <label key={val} onClick={()=>setRegForm(p=>({...p,type:val}))}
                        style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 10px",borderRadius:8,
                          border:`1.5px solid ${regForm.type===val?"#f97316":"rgba(255,255,255,.2)"}`,
                          background:regForm.type===val?"rgba(249,115,22,.18)":"rgba(255,255,255,.05)",
                          cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700}}>
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>
                {/* Fields */}
                {[
                  {label:"Business Name *",key:"name",type:"text",ph:"e.g. Speed Auto Parts"},
                  {label:"Your Name *",key:"contact",type:"text",ph:"Contact person"},
                  {label:"Phone *",key:"phone",type:"tel",ph:"+27 ..."},
                  {label:"Email",key:"email",type:"email",ph:"email@example.com (optional)"},
                  {label:"City / Area",key:"city",type:"text",ph:"e.g. Johannesburg"},
                ].map(f=>(
                  <div key={f.key} style={{marginBottom:9}}>
                    <label style={{fontSize:11,color:"#bae6fd",display:"block",marginBottom:3,fontWeight:600}}>{f.label}</label>
                    <input type={f.type} placeholder={f.ph} value={regForm[f.key]}
                      onChange={e=>setRegForm(p=>({...p,[f.key]:e.target.value}))}
                      style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.08)",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                  </div>
                ))}
                {regErr&&<div style={{color:"#fca5a5",fontSize:12,marginBottom:8}}>{regErr}</div>}
                <button disabled={regSaving}
                  onClick={async()=>{
                    if(!regForm.name.trim()||!regForm.contact.trim()||!regForm.phone.trim()){setRegErr("Please fill in Business Name, Your Name and Phone.");return;}
                    setRegSaving(true);setRegErr("");
                    try{
                      const res=await api.insert("registrations",{business_name:regForm.name.trim(),business_type:regForm.type,contact_name:regForm.contact.trim(),phone:regForm.phone.trim(),email:regForm.email.trim()||null,city:regForm.city.trim()||null,source:"supplier_reply"});
                      if(res?.code||res?.message){setRegErr(`Error: ${res.message||res.code}`);return;}
                      setRegDone(true);
                    }catch(e){setRegErr("Submit failed, please try again.");}
                    finally{setRegSaving(false);}
                  }}
                  style={{width:"100%",padding:"12px 0",borderRadius:8,border:"none",background:regSaving?"#475569":"#f97316",color:"#fff",fontSize:14,fontWeight:700,cursor:regSaving?"not-allowed":"pointer",marginTop:4,marginBottom:8}}>
                  {regSaving?"Submitting…":"✅ Submit Registration"}
                </button>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>setRegOpen(false)} style={{background:"none",border:"none",color:"#7dd3fc",fontSize:12,cursor:"pointer"}}>← Back</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Customer Online Booking Page (?wsbooking=TOKEN) ──────────────────────────
export function WorkshopBookingPage({token}) {
  const [wsId,       setWsId]       = useState(null);  // resolved from token
  const [step,       setStep]       = useState("scan"); // scan | details | done
  const [shopInfo,   setShopInfo]   = useState(null);
  const [shopLoading,setShopLoading]= useState(true);
  const [capturedImg,setCapturedImg]= useState(null);
  const [scanLoading,setScanLoading]= useState(false);
  const [scanError,  setScanError]  = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [foundVehicle,setFoundVehicle]=useState(null);
  const [history,    setHistory]    = useState([]);
  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [email,     setEmail]     = useState("");
  const [complaint, setComplaint] = useState("");
  const [prefDate,  setPrefDate]  = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [scriptUrl, setScriptUrl] = useState("");
  const [problemPhotos, setProblemPhotos] = useState([null, null, null]);
  const [avail,        setAvail]        = useState(null);

  // ── Language switcher — languages are whatever the shop has configured
  // in Settings › Languages (app_translations table); English is the built-in fallback.
  // Preference order: explicit past choice (localStorage) > device language > English.
  const storedLangRef = useRef((()=>{ try{ return localStorage.getItem("wsbk_lang"); }catch{ return null; } })());
  const [lang,    setLangCode] = useState(()=> storedLangRef.current || "en");
  const [langs,   setLangs]    = useState([{lang:"en",name:"English",flag:"🇬🇧"}]);
  const [tPacks,  setTPacks]   = useState({en:{}});
  const t = {...T.en, ...(tPacks[lang]||{})};
  const chooseLang = (l) => { setLangCode(l); try{ localStorage.setItem("wsbk_lang",l); }catch{} };

  useEffect(()=>{
    api.get("app_translations","active=eq.true&select=lang,name,flag,t").then(rows=>{
      if(!Array.isArray(rows)) return;
      const packs={en:{}}; rows.forEach(r=>{ packs[r.lang]=r.t||{}; });
      setTPacks(packs);
      const list=[{lang:"en",name:"English",flag:"🇬🇧"}, ...rows.map(r=>({lang:r.lang,name:r.name||r.lang,flag:r.flag||""}))];
      setLangs(list);
      // First-time visitor (no saved preference) — try to match their device/browser language.
      if(!storedLangRef.current){
        const detected=detectDeviceLang(list.map(l=>l.lang));
        if(detected && detected!=="en") setLangCode(detected);
      }
    }).catch(()=>{});
  },[]);

  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const photoRef0  = useRef(null);
  const photoRef1  = useRef(null);
  const photoRef2  = useRef(null);
  const photoRefs  = [photoRef0, photoRef1, photoRef2];

  const getDateUnavailableReason = (dateStr) => {
    if(!dateStr||!avail) return null;
    const d = new Date(dateStr+"T12:00:00");
    const jsDay = d.getDay(); // 0=Sun
    const isoDay = jsDay===0 ? 7 : jsDay; // 1=Mon…7=Sun
    if(avail.working_days&&!avail.working_days.includes(isoDay)){
      return `${t.wsbkNotOpenOn} ${d.toLocaleDateString("en-ZA",{weekday:"long"})}s`;
    }
    const hol = (avail.public_holidays||[]).find(h=>h.date===dateStr);
    if(hol) return `${t.wsbkPublicHoliday} — ${hol.name||t.wsbkWorkshopClosedLbl}`;
    const cl = (avail.closed_dates||[]).find(c=>c.date===dateStr);
    if(cl) return `${t.wsbkWorkshopClosedLbl} — ${cl.reason||"Unavailable on this date"}`;
    return null;
  };

  useEffect(()=>{
    // Look up workshop by opaque booking token — never expose the UUID in the URL
    fetch(`${SUPABASE_URL}/rest/v1/workshop_profiles?booking_token=eq.${encodeURIComponent(token)}&select=id,name,phone,whatsapp,email,address,logo_url,logo_data,working_days,public_holidays,closed_dates`,
      {headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}})
      .then(r=>r.json())
      .then(rows=>{
        if(rows?.[0]){
          setShopInfo(rows[0]);
          setWsId(rows[0].id);
          setAvail({
            working_days:   rows[0].working_days   || [1,2,3,4,5],
            public_holidays:rows[0].public_holidays|| [],
            closed_dates:   rows[0].closed_dates   || [],
          });
        }
      })
      .catch(()=>{})
      .finally(()=>setShopLoading(false));
    // Fetch Apps Script URL for Drive photo uploads
    fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1&select=apps_script_url,vehicle_script_url`,
      {headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}})
      .then(r=>r.json())
      .then(rows=>{ const s=rows?.[0]; setScriptUrl(s?.vehicle_script_url?.trim()||s?.apps_script_url?.trim()||""); })
      .catch(()=>{});
  },[token]);

  const processImage=async(dataUrl)=>{
    setScanLoading(true); setScanError(null);
    try{
      const raw=await decodePDF417fromImage(dataUrl);
      const parsed=parseLicenceDisc(raw);
      if(!parsed.reg) throw new Error("No registration number found on disc");
      setScanResult(parsed);
      const cleanReg=(parsed.reg||"").replace(/\s/g,"").toUpperCase();
      const rows=await fetch(
        `${SUPABASE_URL}/rest/v1/workshop_vehicles?workshop_id=eq.${wsId}&select=*`,
        {headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}}
      ).then(r=>r.json()).catch(()=>[]);
      const found=(Array.isArray(rows)?rows:[]).find(v=>(v.reg||"").replace(/\s/g,"").toUpperCase()===cleanReg);
      setFoundVehicle(found||null);
      if(found){
        const jobs=await fetch(
          `${SUPABASE_URL}/rest/v1/workshop_jobs?workshop_vehicle_id=eq.${found.id}&order=date_in.desc&limit=8&select=id,date_in,mileage,complaint,status`,
          {headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}}
        ).then(r=>r.json()).catch(()=>[]);
        setHistory(Array.isArray(jobs)?jobs:[]);
        if(found.workshop_customer_id){
          const custs=await fetch(
            `${SUPABASE_URL}/rest/v1/workshop_customers?id=eq.${found.workshop_customer_id}&select=name,phone,email`,
            {headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`}}
          ).then(r=>r.json()).catch(()=>[]);
          if(custs?.[0]){ setName(custs[0].name||""); setPhone(custs[0].phone||""); setEmail(custs[0].email||""); }
        }
      }
      setScanLoading(false);
      setStep("details");
    }catch(e){
      setScanError(`${t.wsbkCouldNotRead} ${e.message}. ${t.wsbkTryClearer}`);
      setScanLoading(false);
    }
  };

  const handleFile=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    e.target.value="";
    const fr=new FileReader();
    fr.onload=ev=>{ setCapturedImg(ev.target.result); processImage(ev.target.result); };
    fr.readAsDataURL(file);
  };

  const uploadProblemPhoto=async(slotIndex,dataUrl)=>{
    const upd=extra=>setProblemPhotos(p=>{const n=[...p];n[slotIndex]={...(n[slotIndex]||{}),dataUrl,...extra};return n;});
    if(!scriptUrl){upd({status:"error",error:"No script URL"});return;}
    upd({status:"uploading",url:null,error:null});
    try{
      const base64=await new Promise((res,rej)=>{
        const img=new Image();
        img.onload=()=>{
          const MAX=1200,canvas=document.createElement("canvas");
          let w=img.width,h=img.height;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);
          res(canvas.toDataURL("image/jpeg",0.85));
        };
        img.onerror=rej;img.src=dataUrl;
      });
      const reg=(scanResult?.reg||"BK").replace(/\s/g,"").toUpperCase();
      const now=new Date();const pad2=n=>String(n).padStart(2,"0");
      const dateStr=`${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const resp=await fetch(scriptUrl,{method:"POST",body:JSON.stringify({
        action:"upload",image:base64,
        filename:`${dateStr.replace(/-/g,"")}_${slotIndex+1}.jpg`,
        mimeType:"image/jpeg",
        folderPath:`Booking_Photos/${reg}/${dateStr}`,
      })});
      const result=await resp.json();
      if(result.success){upd({status:"done",url:result.url});}
      else throw new Error(result.error||"Upload failed");
    }catch(e){upd({status:"error",error:e.message});}
  };

  const handleProblemPhoto=(e,slotIndex)=>{
    const file=e.target.files?.[0];if(!file)return;
    e.target.value="";
    const fr=new FileReader();
    fr.onload=ev=>uploadProblemPhoto(slotIndex,ev.target.result);
    fr.readAsDataURL(file);
  };

  const submit=async()=>{
    if(!name.trim()||!phone.trim()||!complaint.trim()){
      alert(t.wsbkFillRequired);
      return;
    }
    if(problemPhotos.some(p=>p?.status==="uploading")){
      alert(t.wsbkWaitPhotos);
      return;
    }
    if(prefDate){
      const reason=getDateUnavailableReason(prefDate);
      if(reason){ alert(`⚠️ ${reason}\n\n${t.wsbkChooseDifferentDate}`); return; }
    }
    setSubmitting(true);
    try{
      const id="WB-"+Date.now()+"-"+Math.floor(Math.random()*9000+1000);
      const resp=await fetch(`${SUPABASE_URL}/rest/v1/workshop_bookings`,{
        method:"POST",
        headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify({
          id, workshop_id:wsId,
          vehicle_reg:scanResult.reg,
          vehicle_make:scanResult.make||foundVehicle?.make||"",
          vehicle_model:scanResult.model||foundVehicle?.model||"",
          vehicle_year:foundVehicle?.year||"",
          vehicle_color:scanResult.color||foundVehicle?.color||"",
          vin:scanResult.vin||foundVehicle?.vin||"",
          engine_no:scanResult.engine_no||foundVehicle?.engine_no||"",
          licence_disc_expiry:scanResult.expiry_date||"",
          customer_name:name.trim(), customer_phone:phone.trim(),
          customer_email:email.trim()||null,
          complaint:complaint.trim(), preferred_date:prefDate||null,
          status:"pending",
          workshop_vehicle_id:foundVehicle?.id||null,
          photo_1:problemPhotos[0]?.url||null,
          photo_2:problemPhotos[1]?.url||null,
          photo_3:problemPhotos[2]?.url||null,
          created_at:new Date().toISOString(),
        })
      });
      if(!resp.ok){ const err=await resp.text(); throw new Error(err); }
      setBookingId(id);
      setStep("done");
    }catch(e){ alert(`${t.wsbkFailedSubmit} ${e.message}`); }
    setSubmitting(false);
  };

  const CL={bg:"#0f172a",surf:"#1e293b",border:"#334155",accent:"#f97316",
            text:"#f1f5f9",text2:"#94a3b8",text3:"#475569",
            green:"#34d399",red:"#f87171",blue:"#38bdf8",yellow:"#fbbf24"};
  const inp={width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:8,
             padding:"12px 14px",color:CL.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box",outline:"none"};
  const mkBtn=(bg,col="#fff")=>({width:"100%",padding:"15px 0",borderRadius:10,border:"none",fontSize:15,fontWeight:700,cursor:"pointer",background:bg,color:col});
  const card={background:CL.surf,borderRadius:12,padding:16,border:`1px solid ${CL.border}`,marginBottom:14};
  const lbl={fontSize:12,fontWeight:700,color:CL.text2,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6,display:"block"};

  const LangSwitch=()=>(
    langs.length>1 && (
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {langs.map(l=>(
          <button key={l.lang} onClick={()=>chooseLang(l.lang)} title={l.name}
            style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${lang===l.lang?CL.accent:CL.border}`,
              background:lang===l.lang?"rgba(249,115,22,.15)":"transparent",
              color:lang===l.lang?CL.accent:CL.text2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {l.flag?`${l.flag} `:""}{l.lang.toUpperCase()}
          </button>
        ))}
      </div>
    )
  );

  const shopLogo = shopInfo?.logo_url || shopInfo?.logo_data || "";
  const shopAddress = shopInfo?.address || "";
  const shopPhone = shopInfo?.phone || "";
  const shopWhatsApp = shopInfo?.whatsapp || shopInfo?.phone || "";
  const directionsUrl = shopAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopAddress)}` : "";
  const waMsg = `Hi ${shopInfo?.name||"there"}, I'd like to ask about booking a service.`;

  const pillLink = {fontSize:12,fontWeight:700,textDecoration:"none",borderRadius:20,padding:"3px 10px",display:"inline-flex",alignItems:"center",gap:4};

  const Header=()=>(
    <div style={{background:CL.surf,borderBottom:`1px solid ${CL.border}`,paddingBottom:16,marginBottom:20}}>
      <div style={{maxWidth:460,margin:"0 auto",padding:"16px 16px 0",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
        {shopLogo&&<img src={shopLogo} alt="" style={{width:"100%",height:140,borderRadius:14,objectFit:"contain",background:"#fff",marginBottom:14,display:"block"}} onError={e=>e.target.style.display="none"}/>}
        <div style={{fontWeight:700,fontSize:20,color:CL.text}}>{shopInfo?.name||"Workshop"}</div>
        <div style={{color:CL.text2,fontSize:13,marginTop:2}}>{t.wsbkOnlineBooking}</div>

        <div style={{marginTop:10}}><LangSwitch/></div>

        {(shopPhone||shopWhatsApp)&&(
          <div style={{marginTop:10,display:"flex",justifyContent:"center",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {shopPhone&&(
              <a href={`tel:${shopPhone}`}
                style={{...pillLink,color:CL.blue,border:`1px solid ${CL.blue}55`}}>
                📞 {t.wsbkCall}
              </a>
            )}
            {shopWhatsApp&&(
              <a href={waLink(shopWhatsApp,waMsg)} target="_blank" rel="noopener noreferrer"
                style={{...pillLink,color:CL.green,border:`1px solid ${CL.green}55`}}>
                💬 {t.wsbkWhatsApp}
              </a>
            )}
          </div>
        )}
        {shopAddress&&(
          <div style={{marginTop:8,display:"flex",justifyContent:"center",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{color:CL.text2,fontSize:12}}>📍 {shopAddress}</span>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
              style={{...pillLink,color:CL.accent,border:`1px solid ${CL.accent}55`}}>
              🧭 {t.wsbkGetDirections}
            </a>
          </div>
        )}
      </div>
    </div>
  );

  if(shopLoading) return(
    <div style={{minHeight:"100vh",background:CL.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:CL.accent,fontSize:16,fontWeight:600}}>⏳ {t.wsbkLoading}</div>
    </div>
  );
  if(!wsId) return(
    <div style={{minHeight:"100vh",background:CL.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:CL.text2,fontSize:15}}>❌ {t.wsbkInvalidLink}<br/>{t.wsbkInvalidLinkSub}</div>
    </div>
  );

  if(step==="done") return(
    <div style={{minHeight:"100vh",background:CL.bg}}>
      <Header/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"0 16px"}}>
        <div style={{...card,textAlign:"center",padding:"36px 20px"}}>
          <div style={{fontSize:52,marginBottom:14}}>✅</div>
          <div style={{fontWeight:700,fontSize:20,color:CL.green,marginBottom:8}}>{t.wsbkSubmitted}</div>
          <div style={{color:CL.text2,fontSize:14,lineHeight:1.6,marginBottom:16}}>
            {t.wsbkReceivedFor}{" "}
            <strong style={{color:CL.text}}>{scanResult?.reg}</strong>.<br/>
            {t.wsbkWillContact}
          </div>
          {shopInfo?.phone&&(
            <div style={{fontSize:13,color:CL.text2}}>
              {t.wsbkQuestionsCall} <strong style={{color:CL.text}}>{shopInfo.phone}</strong>
            </div>
          )}
          <div style={{marginTop:14,fontSize:11,color:CL.text3,fontFamily:"monospace"}}>{bookingId}</div>
        </div>
      </div>
    </div>
  );

  if(step==="scan") return(
    <div style={{minHeight:"100vh",background:CL.bg,paddingBottom:40}}>
      <Header/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"0 16px"}}>
        <div style={card}>
          <div style={{fontWeight:700,fontSize:16,color:CL.text,marginBottom:6}}>📷 {t.wsbkScanTitle}</div>
          <div style={{fontSize:13,color:CL.text2,marginBottom:18,lineHeight:1.5}}>
            {t.wsbkScanDescPre} <strong style={{color:CL.text}}>{t.wsbkLicenceDisc}</strong>.
            {" "}{t.wsbkScanDescPost}
          </div>

          {!capturedImg&&!scanLoading&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <button style={{...mkBtn(CL.accent),display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"24px 12px",fontSize:13}}
                  onClick={()=>cameraRef.current?.click()}>
                  <span style={{fontSize:36}}>📷</span>{t.wsbkTakePhoto}
                </button>
                <button style={{...mkBtn(CL.border,CL.text),display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"24px 12px",fontSize:13}}
                  onClick={()=>galleryRef.current?.click()}>
                  <span style={{fontSize:36}}>🖼️</span>{t.wsbkGalleryFiles}
                </button>
              </div>
              <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
              <input ref={galleryRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
            </>
          )}

          {capturedImg&&(
            <div style={{marginBottom:12}}>
              <img src={capturedImg} alt="disc" style={{width:"100%",maxHeight:200,objectFit:"contain",borderRadius:8,background:"#000"}}/>
            </div>
          )}

          {scanLoading&&(
            <div style={{textAlign:"center",padding:"20px 0",color:CL.blue,fontSize:14,fontWeight:600}}>
              🔍 {t.wsbkReadingBarcode}
            </div>
          )}

          {scanError&&(
            <div style={{background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:10,padding:14,marginTop:8}}>
              <div style={{color:CL.red,fontWeight:600,fontSize:13,marginBottom:10}}>⚠️ {scanError}</div>
              <button style={{...mkBtn(CL.border,CL.text),padding:"10px 0",fontSize:13}}
                onClick={()=>{setCapturedImg(null);setScanError(null);}}>↺ {t.wsbkTryAgain}</button>
            </div>
          )}

          <div style={{marginTop:14,padding:"10px 12px",background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.25)",borderRadius:8,fontSize:12,color:CL.yellow,lineHeight:1.5}}>
            💡 <strong>{t.wsbkTip}</strong> {t.wsbkTipBody}
          </div>
        </div>
      </div>
    </div>
  );

  const expiryExpired=scanResult?.expiry_date&&new Date(scanResult.expiry_date)<new Date();
  return(
    <div style={{minHeight:"100vh",background:CL.bg,paddingBottom:40}}>
      <Header/>
      <div style={{maxWidth:460,margin:"0 auto",padding:"0 16px"}}>

        <div style={{...card,borderColor:"rgba(249,115,22,.35)"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <span style={{fontSize:30}}>🚗</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:18,color:CL.text,fontFamily:"monospace"}}>{scanResult?.reg}</div>
              <div style={{fontSize:13,color:CL.text2,marginTop:2}}>
                {[scanResult?.make,scanResult?.model,scanResult?.color].filter(Boolean).join(" · ")||t.wsbkVehicleFallback}
              </div>
              {scanResult?.expiry_date&&(
                <div style={{fontSize:11,marginTop:3,color:expiryExpired?CL.red:CL.green}}>
                  {t.wsbkDiscLabel} {scanResult.expiry_date} {expiryExpired?`⚠️ ${t.wsbkExpired}`:"✅"}
                </div>
              )}
              {foundVehicle&&<div style={{fontSize:11,marginTop:3,color:CL.blue}}>✓ {t.wsbkVehicleFound}</div>}
            </div>
          </div>
        </div>

        {history.length>0&&(
          <div style={card}>
            <div style={{fontWeight:700,fontSize:12,color:CL.text2,textTransform:"uppercase",letterSpacing:".04em",marginBottom:12}}>
              📋 {t.wsbkServiceHistory} — {history.length} {history.length!==1?t.wsbkVisits:t.wsbkVisit}
            </div>
            <div style={{maxHeight:200,overflowY:"auto"}}>
              {history.map((j,i)=>(
                <div key={j.id} style={{padding:"9px 0",borderBottom:i<history.length-1?`1px solid ${CL.border}`:undefined}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                    <span style={{fontSize:12,fontWeight:700,color:CL.text}}>{j.date_in}</span>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"rgba(56,189,248,.15)",color:CL.blue}}>{j.status}</span>
                  </div>
                  {j.mileage&&<div style={{fontSize:11,color:CL.text2}}>🛣️ {Number(j.mileage).toLocaleString()} km</div>}
                  {j.complaint&&<div style={{fontSize:12,color:"#cbd5e1",marginTop:2}}>🔧 {j.complaint.slice(0,80)}{j.complaint.length>80?"…":""}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,color:CL.text,marginBottom:16}}>{t.wsbkYourDetails}</div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>{t.wsbkFullName} *</label>
            <input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder={t.wsbkFullNamePh}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>{t.wsbkPhoneNumber} *</label>
            <input style={inp} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+27 82 000 0000"/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>{t.wsbkEmailOpt}</label>
            <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>{t.wsbkProblemQ} *</label>
            <textarea style={{...inp,minHeight:90,resize:"vertical"}} value={complaint}
              onChange={e=>setComplaint(e.target.value)} placeholder={t.wsbkProblemPh}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={lbl}>📷 {t.wsbkPhotosLabel}</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:6}}>
              {[0,1,2].map(i=>{
                const ph=problemPhotos[i];
                return (
                  <div key={i}
                    style={{aspectRatio:"1",background:CL.bg,border:`2px dashed ${ph?.status==="done"?"transparent":CL.border}`,borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative",cursor:"pointer"}}
                    onClick={()=>photoRefs[i].current?.click()}>
                    {ph?.status==="done"&&<img src={ph.dataUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>}
                    {(!ph)&&<><span style={{fontSize:28}}>📷</span><span style={{fontSize:10,color:CL.text3,marginTop:4}}>{t.wsbkAddPhoto}</span></>}
                    {ph?.status==="uploading"&&<div style={{color:CL.blue,fontSize:11,textAlign:"center",padding:4}}>⏳<br/>{t.wsbkUploading}</div>}
                    {ph?.status==="error"&&<div style={{color:CL.red,fontSize:10,textAlign:"center",padding:4}}>❌ {t.wsbkFailed}<br/><span style={{fontSize:9}}>{ph.error?.slice(0,25)}</span></div>}
                    {ph?.status==="done"&&<div style={{position:"absolute",top:4,right:4,background:"rgba(52,211,153,.9)",borderRadius:99,width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>✓</div>}
                    <input ref={photoRefs[i]} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleProblemPhoto(e,i)}/>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:CL.text3}}>{t.wsbkTapSlot}</div>
          </div>

          <div style={{marginBottom:20}}>
            <label style={lbl}>{t.wsbkPrefDate}</label>
            <input style={inp} type="date" value={prefDate} onChange={e=>setPrefDate(e.target.value)}
              min={new Date().toISOString().slice(0,10)}/>
            {prefDate&&getDateUnavailableReason(prefDate)&&(
              <div style={{marginTop:8,padding:"10px 12px",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,fontSize:13,color:"#f87171",lineHeight:1.4}}>
                ⚠️ {getDateUnavailableReason(prefDate)} — {t.wsbkChooseDifferentDate}
              </div>
            )}
            {prefDate&&!getDateUnavailableReason(prefDate)&&(
              <div style={{marginTop:6,fontSize:12,color:CL.green}}>✓ {t.wsbkDateGood}</div>
            )}
          </div>
          {(()=>{
            const photosUploading=problemPhotos.some(p=>p?.status==="uploading");
            const dateBlocked=prefDate&&!!getDateUnavailableReason(prefDate);
            if(dateBlocked) return null;
            return(
              <button style={{...mkBtn((submitting||photosUploading)?"#334155":CL.accent),opacity:(submitting||photosUploading)?0.7:1}}
                onClick={submit} disabled={submitting||photosUploading}>
                {photosUploading?`📤 ${t.wsbkUploadingPhotos}`:submitting?`⏳ ${t.wsbkSubmitting}`:`📅 ${t.wsbkSubmitBooking}`}
              </button>
            );
          })()}
        </div>

        <div style={{textAlign:"center",paddingBottom:20}}>
          <button style={{background:"none",border:"none",color:CL.text3,cursor:"pointer",fontSize:12}}
            onClick={()=>{setCapturedImg(null);setScanResult(null);setFoundVehicle(null);setHistory([]);setStep("scan");}}>
            ← {t.wsbkScanDifferent}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Branch Registration Page (?branch_reg=1) ────────────────────────────────
export function BranchRegPage() {
  const settings = getSettings();
  const [f, setF] = useState({name:"", city:"", address:"", phone:"", contact_name:"", email:""});
  const [step, setStep] = useState("form"); // form | submitting | done | error
  const [errMsg, setErrMsg] = useState("");
  const s = (k, v) => setF(p => ({...p, [k]: v}));

  const submit = async () => {
    if (!f.name.trim())    return setErrMsg("Shop name is required");
    if (!f.city.trim())    return setErrMsg("City is required");
    if (!f.phone.trim())   return setErrMsg("Phone is required");
    setErrMsg("");
    setStep("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/branches`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          name: f.name.trim(),
          city: f.city.trim(),
          address: f.address.trim(),
          phone: f.phone.trim(),
          contact_name: f.contact_name.trim(),
          email: f.email.trim(),
          status: "pending",
          is_main: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep("done");
    } catch(e) {
      setErrMsg(e.message || "Submission failed. Please try again.");
      setStep("form");
    }
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"var(--bg)",minHeight:"100vh",color:"var(--text)",display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 16px"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <ShopLogo settings={settings} size="md"/>
          <div style={{fontSize:22,fontWeight:800,marginTop:14}}>Branch Registration</div>
          <div style={{fontSize:14,color:"var(--text3)",marginTop:6}}>Fill in your shop details to apply for a branch account. We'll review and activate it shortly.</div>
        </div>

        {step==="done" ? (
          <div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:14,padding:"32px 24px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:"var(--green)",marginBottom:8}}>Application Submitted!</div>
            <div style={{fontSize:14,color:"var(--text2)"}}>
              Your branch <strong>{f.name}</strong> has been registered and is pending approval.<br/><br/>
              We'll contact you at <strong>{f.email||f.phone}</strong> once your account is activated.
            </div>
          </div>
        ) : (
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"24px 20px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <FL label="Shop Name *"/>
                <input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="Cape Town Spare Parts"/>
              </div>
              <div>
                <FL label="City *"/>
                <input className="inp" value={f.city} onChange={e=>s("city",e.target.value)} placeholder="Cape Town"/>
              </div>
              <div>
                <FL label="Address"/>
                <input className="inp" value={f.address} onChange={e=>s("address",e.target.value)} placeholder="123 Main Road, Cape Town"/>
              </div>
              <div>
                <FL label="Phone *"/>
                <input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)} placeholder="+27 21 000 0000"/>
              </div>
              <div>
                <FL label="Contact Person"/>
                <input className="inp" value={f.contact_name} onChange={e=>s("contact_name",e.target.value)} placeholder="Your name"/>
              </div>
              <div>
                <FL label="Email"/>
                <input className="inp" type="email" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="shop@example.com"/>
              </div>
              {errMsg && <div style={{color:"var(--red)",fontSize:13,background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"8px 12px"}}>{errMsg}</div>}
              <button className="btn btn-primary" onClick={submit} disabled={step==="submitting"} style={{marginTop:4,height:44,fontSize:15,fontWeight:700}}>
                {step==="submitting" ? "Submitting…" : "Submit Application"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Branch Activation Page ───────────────────────────────────────────────────
export function BranchActivatePage() {
  const [settings,setSettings]=useState({});
  const [code,setCode]=useState("");
  const [step,setStep]=useState("form"); // form | loading | done
  const [errMsg,setErrMsg]=useState("");
  const [branchName,setBranchName]=useState("");

  useEffect(()=>{
    fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1&select=shop_name,logo_url,logo_drive_id`,{
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
    }).then(r=>r.json()).then(r=>{if(r[0])setSettings(r[0]);}).catch(()=>{});
  },[]);

  const submit=async()=>{
    const c=code.trim().toUpperCase();
    if(c.length!==6){setErrMsg("Please enter the 6-character activation code.");return;}
    setStep("loading");setErrMsg("");
    try{
      const rows=await fetch(
        `${SUPABASE_URL}/rest/v1/branches?activation_code=eq.${c}&status=eq.suspended&select=id,name,activation_code_expires_at`,
        {headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}}
      ).then(r=>r.json());
      if(!Array.isArray(rows)||rows.length===0){
        setErrMsg("Invalid code or branch not found. Please check and try again.");
        setStep("form");return;
      }
      const branch=rows[0];
      if(branch.activation_code_expires_at&&new Date(branch.activation_code_expires_at)<new Date()){
        setErrMsg("This activation code has expired. Contact the administrator for a new code.");
        setStep("form");return;
      }
      await fetch(`${SUPABASE_URL}/rest/v1/branches?id=eq.${branch.id}`,{
        method:"PATCH",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},
        body:JSON.stringify({status:"active",activation_code:null,activation_code_expires_at:null})
      });
      setBranchName(branch.name);
      setStep("done");
    }catch{
      setErrMsg("Activation failed. Please try again.");
      setStep("form");
    }
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"var(--bg)",minHeight:"100vh",color:"var(--text)",display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 16px"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <ShopLogo settings={settings} size="md"/>
          <div style={{fontSize:22,fontWeight:800,marginTop:14}}>Branch Activation</div>
          <div style={{fontSize:14,color:"var(--text3)",marginTop:6}}>Enter your activation code to reactivate your branch account.</div>
        </div>
        {step==="done"?(
          <div style={{background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:14,padding:"32px 24px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:"var(--green)",marginBottom:8}}>Branch Reactivated!</div>
            <div style={{fontSize:14,color:"var(--text2)",marginBottom:20}}>
              <strong>{branchName}</strong> is now active. You can now log in to your account.
            </div>
            <a href={window.location.origin+window.location.pathname} style={{display:"inline-block",background:"var(--accent)",color:"#fff",borderRadius:9,padding:"11px 28px",fontSize:15,fontWeight:700,textDecoration:"none"}}>
              Go to Login
            </a>
          </div>
        ):(
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"24px 20px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <FL label="Activation Code"/>
                <input
                  className="inp"
                  value={code}
                  onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").substring(0,6))}
                  placeholder="ABC123"
                  style={{fontFamily:"monospace",letterSpacing:6,fontSize:22,textAlign:"center",fontWeight:800}}
                  maxLength={6}
                />
              </div>
              {errMsg&&<div style={{color:"var(--red)",fontSize:13,background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"8px 12px"}}>{errMsg}</div>}
              <button className="btn btn-primary" onClick={submit} disabled={step==="loading"} style={{marginTop:4,height:44,fontSize:15,fontWeight:700}}>
                {step==="loading"?"Activating…":"Activate Branch"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BRANCH STOCK REQUEST CONFIRM PAGE  (?bsr_confirm=TOKEN)
// Workshop clicks link to confirm or cancel their main-branch parts order
// ═══════════════════════════════════════════════════════════════
export function BranchStockRequestConfirmPage({token}) {
  const [rec,setRec]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [err,setErr]=useState("");
  const [done,setDone]=useState(null);
  const [acting,setActing]=useState(false);
  const settings=getSettings();
  useEffect(()=>{
    api.get("branch_stock_requests",`confirm_token=eq.${token}&select=*`).then(r=>{
      if(Array.isArray(r)&&r[0]) setRec(r[0]);
      else setErr("Request not found or link expired.");
      setLoaded(true);
    }).catch(()=>{setErr("Could not load request.");setLoaded(true);});
  },[]);
  const act=async(action)=>{
    setActing(true);
    const newStatus=action==="confirm"?"ordered":"cancelled";
    await api.patch("branch_stock_requests","confirm_token",token,{status:newStatus});
    setDone(action);
    setActing(false);
  };
  const items=Array.isArray(rec?.items)?rec.items:[];
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"var(--bg)",padding:20}}>
      <style>{CSS}</style>
      <div style={{maxWidth:480,width:"100%",background:"var(--surface)",borderRadius:16,padding:32,boxShadow:"var(--shadow-lg)",textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:8}}>🏬</div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{settings.shop_name||"Spare Parts"}</div>
        <div style={{fontSize:14,color:"var(--text2)",marginBottom:24}}>Main Branch Parts Request</div>
        {!loaded&&<div style={{color:"var(--text3)",padding:24}}>Loading…</div>}
        {err&&<div style={{color:"var(--red)",padding:16,background:"rgba(239,68,68,.1)",borderRadius:10,marginBottom:16}}>{err}</div>}
        {done==="confirm"&&<div style={{padding:24}}>
          <div style={{fontSize:32,marginBottom:8}}>✅</div>
          <div style={{fontWeight:700,fontSize:16,color:"var(--green)"}}>Order Confirmed!</div>
          <div style={{fontSize:13,color:"var(--text2)",marginTop:8}}>Your parts have been ordered. We will contact you when they arrive at the branch.</div>
        </div>}
        {done==="cancel"&&<div style={{padding:24}}>
          <div style={{fontSize:32,marginBottom:8}}>❌</div>
          <div style={{fontWeight:700,fontSize:16,color:"var(--orange)"}}>Request Cancelled</div>
          <div style={{fontSize:13,color:"var(--text2)",marginTop:8}}>Your request has been cancelled. Contact us if you change your mind.</div>
        </div>}
        {loaded&&!err&&!done&&rec&&<>
          {(rec.status==="completed"||rec.status==="cancelled")
            ?<div style={{padding:16,borderRadius:10,background:"var(--surface2)",fontSize:14,color:"var(--text2)"}}>This request is already <strong>{rec.status}</strong>.</div>
            :<>
              <div style={{textAlign:"left",marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>Parts requested:</div>
                {items.map((i,idx)=>(
                  <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:"var(--surface2)",borderRadius:8,marginBottom:6}}>
                    <span style={{fontSize:14}}>{i.name}</span>
                    <span style={{fontSize:14,color:"var(--text2)"}}>×{i.qty}</span>
                  </div>
                ))}
                {rec.notes&&<div style={{fontSize:13,color:"var(--text2)",marginTop:10,padding:"8px 12px",background:"var(--surface2)",borderRadius:8}}>📝 {rec.notes}</div>}
              </div>
              <div style={{fontSize:13,color:"var(--text2)",marginBottom:20}}>Confirm you want to order these parts from the main branch.</div>
              <div style={{display:"flex",gap:12}}>
                <button className="btn" style={{flex:1,background:"rgba(239,68,68,.15)",color:"var(--red)",border:"1px solid rgba(239,68,68,.3)",fontWeight:700}} disabled={acting} onClick={()=>act("cancel")}>Cancel</button>
                <button className="btn btn-primary" style={{flex:2}} disabled={acting} onClick={()=>act("confirm")}>{acting?"Processing…":"Yes, Order These Parts"}</button>
              </div>
            </>}
        </>}
      </div>
    </div>
  );
}

// ─── Workshop Register Page (reached via QR code from spare shop) ──────────────
export function WorkshopRegisterPage({ token }) {
  // token = btoa(JSON.stringify({id, name}))
  let shopId = 1, shopName = "Spare Shop";
  try {
    const d = JSON.parse(atob(token));
    shopId = d.id || 1;
    shopName = d.name || "Spare Shop";
  } catch { /* invalid token – use defaults */ }

  const [f, setF] = useState({
    workshop_name: "", username: "", password: "", password2: "",
    phone: "", email: "", city: "", country: "",
  });
  const [step, setStep] = useState("form"); // form | submitting | done
  const [errMsg, setErrMsg] = useState("");
  const upd = (k, v) => setF(p => ({...p, [k]: v}));

  useEffect(() => {
    fetch("https://ipapi.co/json/").then(r=>r.json()).then(d=>{
      setF(p=>({...p, city: d.city||"", country: d.country_name||""}));
    }).catch(()=>{});
  }, []);

  const submit = async () => {
    if (!f.workshop_name.trim()) return setErrMsg("Workshop name is required");
    if (!f.username.trim())      return setErrMsg("Username is required");
    if (!f.password)             return setErrMsg("Password is required");
    if (f.password.length < 4)  return setErrMsg("Password must be at least 4 characters");
    if (f.password !== f.password2) return setErrMsg("Passwords don't match");
    setErrMsg(""); setStep("submitting");
    try {
      const ex = await api.get("users", `username=eq.${encodeURIComponent(f.username.trim())}&select=id`).catch(() => []);
      if (Array.isArray(ex) && ex.length > 0) {
        setErrMsg("Username already taken — choose another"); setStep("form"); return;
      }
      // Don't set id — let DB auto-generate
      const r1 = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          username: f.username.trim(), password: f.password,
          name: f.workshop_name.trim(), role: "workshop",
          phone: f.phone.trim() || "", email: f.email.trim() || "",
          spare_shop_name: shopName,
          // spare_shop_id only when integer (admin QR = 1); branch QR uses uuid which can't fit int4
          ...(Number.isInteger(shopId) ? {spare_shop_id: shopId} : {}),
        }),
      });
      if (!r1.ok) { const txt = await r1.text(); throw new Error(txt); }
      // Save spare shop info to localStorage so login can apply it even if DB column isn't migrated yet
      try { localStorage.setItem("ap_pending_spare_shop", JSON.stringify({name: shopName, branch_id: shopId !== 1 ? String(shopId) : null})); } catch {}
      setStep("done");
    } catch (e) {
      setErrMsg(e.message || "Registration failed. Please try again.");
      setStep("form");
    }
  };

  const loginUrl = `${window.location.origin}${window.location.pathname}?ws_login=1`;
  const inp = { width:"100%", padding:"11px 14px", borderRadius:9, border:"1.5px solid var(--border2)", background:"var(--surface)", color:"var(--text)", fontSize:14, boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
  const lockedInp = {...inp, background:"rgba(37,99,235,.04)", borderColor:"rgba(37,99,235,.3)", color:"var(--text2)", cursor:"not-allowed"};
  const Lbl = ({label}) => <label style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:".08em",textTransform:"uppercase",display:"block",marginBottom:5}}>{label}</label>;

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"var(--bg)",minHeight:"100vh",color:"var(--text)",display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 16px"}}>
      <style>{CSS}</style>
      <div style={{width:"100%",maxWidth:500}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,marginBottom:8}}>🔧</div>
          <div style={{fontSize:22,fontWeight:800}}>Workshop Registration</div>
          <div style={{fontSize:13,color:"var(--text3)",marginTop:6}}>Create your workshop account</div>
        </div>

        {/* Locked spare shop banner */}
        <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(37,99,235,.07)",border:"1px solid rgba(37,99,235,.2)",borderRadius:10,padding:"10px 14px",marginBottom:18}}>
          <span style={{fontSize:18}}>🏪</span>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(37,99,235,.8)",textTransform:"uppercase",letterSpacing:".06em"}}>Spare Shop Partner</div>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{shopName}</div>
          </div>
          <span style={{marginLeft:"auto",fontSize:11,color:"var(--text3)",display:"flex",alignItems:"center",gap:4}}>🔒 Locked</span>
        </div>

        {step === "done" ? (
          <div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:14,padding:"32px 24px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div style={{fontSize:18,fontWeight:700,color:"var(--green)",marginBottom:8}}>Registration Complete!</div>
            <div style={{fontSize:14,color:"var(--text2)",marginBottom:20}}>
              <strong>{f.workshop_name}</strong> has been registered and linked to <strong>{shopName}</strong>.<br/>
              Your 30-day trial has started.
            </div>
            <a href={loginUrl} style={{display:"inline-block",padding:"12px 28px",background:"var(--accent)",color:"#fff",borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none"}}>
              Log In Now →
            </a>
          </div>
        ) : (
          <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:"24px 20px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div><Lbl label="Workshop Name *"/><input style={inp} value={f.workshop_name} onChange={e=>upd("workshop_name",e.target.value)} placeholder="e.g. ABC Auto Workshop"/></div>
              <div><Lbl label="Phone"/><input style={inp} type="tel" value={f.phone} onChange={e=>upd("phone",e.target.value)} placeholder="+27 82 000 0000"/></div>
              <div><Lbl label="Email"/><input style={inp} type="email" value={f.email} onChange={e=>upd("email",e.target.value)} placeholder="workshop@email.com"/></div>
              <div style={{borderTop:"1px solid var(--border)",paddingTop:14,marginTop:2}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text2)",marginBottom:12}}>Login Credentials</div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div><Lbl label="Username *"/><input style={inp} value={f.username} onChange={e=>upd("username",e.target.value)} placeholder="Your login username" autoCapitalize="none"/></div>
                  <div><Lbl label="Password *"/><input style={inp} type="password" value={f.password} onChange={e=>upd("password",e.target.value)} placeholder="Min. 4 characters"/></div>
                  <div><Lbl label="Confirm Password *"/><input style={inp} type="password" value={f.password2} onChange={e=>upd("password2",e.target.value)} placeholder="Repeat password"/></div>
                </div>
              </div>
              {/* Read-only locked spare shop */}
              <div>
                <Lbl label="Spare Shop Partner (locked)"/>
                <div style={{...lockedInp,display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:9,padding:"11px 14px"}}>
                  <span>{shopName}</span><span style={{fontSize:12}}>🔒</span>
                </div>
              </div>
              {errMsg && <div style={{color:"var(--red)",fontSize:13,background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"8px 12px"}}>{errMsg}</div>}
              <button
                style={{width:"100%",padding:13,borderRadius:10,background:"var(--accent)",color:"#fff",border:"none",fontSize:15,fontWeight:700,cursor:step==="submitting"?"not-allowed":"pointer",opacity:step==="submitting"?0.7:1}}
                onClick={submit} disabled={step==="submitting"}>
                {step==="submitting" ? "Registering…" : "Register Workshop →"}
              </button>
              <div style={{textAlign:"center",fontSize:13,color:"var(--text3)"}}>
                Already have an account? <a href={loginUrl} style={{color:"var(--accent)",fontWeight:600}}>Log in here</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

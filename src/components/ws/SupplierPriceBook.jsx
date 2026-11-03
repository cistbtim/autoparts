import { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api.js";

const norm = s => (s||"").toLowerCase().trim();
const money = v => (+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const dstr = d => d ? new Date(d).toLocaleDateString() : "";

// Supplier Price Book — every supplier quote line saved by Return Quote (supplier_quote_lines).
// Read-only: nothing here changes job prices, remarks or customer quotes.
export function SupplierPriceBookPage({wsId, wsSuppliers=[], onOpenJob}) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [q,       setQ]       = useState("");
  const [supId,   setSupId]   = useState("");
  const [from,    setFrom]    = useState("");
  const [to,      setTo]      = useState("");
  const [latest,  setLatest]  = useState(false);

  useEffect(()=>{
    let alive=true;
    const filter = wsId ? `workshop_id=eq.${wsId}&` : "";
    api.get("supplier_quote_lines",`${filter}select=*&order=quoted_at.desc`)
      .then(r=>{
        if(!alive) return;
        if(!Array.isArray(r)){ setErr("Could not load the price book — has the supplier_quote_lines table been created in Supabase?"); setRows([]); }
        else setRows(r);
        setLoading(false);
      })
      .catch(()=>{ if(alive){ setErr("Could not load the price book."); setLoading(false); } });
    return ()=>{ alive=false; };
  },[wsId]);

  const shortOf = id => { const s=wsSuppliers.find(x=>String(x.id)===String(id)); return s?.short_name||s?.name||""; };

  const filtered = useMemo(()=>{
    const needle=norm(q);
    const f=from?new Date(from+"T00:00:00"):null, t=to?new Date(to+"T23:59:59"):null;
    return rows.filter(r=>{
      if(r.no_stock && !+r.price_ex_vat) return false;
      if(supId && String(r.supplier_id)!==String(supId)) return false;
      if(f && new Date(r.quoted_at)<f) return false;
      if(t && new Date(r.quoted_at)>t) return false;
      if(needle && ![r.part_name,r.supplier_part_no,r.sku,r.vehicle_reg,r.quote_ref,r.supplier_name,r.job_id,r.brand].some(v=>norm(v).includes(needle))) return false;
      return true;
    });
  },[rows,q,supId,from,to]);

  // Latest price per supplier per part; the lowest of those (VAT-inclusive) is the one to beat.
  const { shown, cheapestIds } = useMemo(()=>{
    const partKey = r => norm(r.sku)||norm(r.part_name);
    const latestPer = new Map();   // part|supplier -> newest row (rows arrive newest first)
    filtered.forEach(r=>{ const k=partKey(r)+"|"+(r.supplier_id||r.supplier_name); if(!latestPer.has(k)) latestPer.set(k,r); });
    const best = new Map();        // part -> cheapest latest row
    latestPer.forEach(r=>{
      const p=+r.price_incl_vat||0; if(!(p>0)) return;
      const k=partKey(r), cur=best.get(k);
      if(!cur||p<(+cur.price_incl_vat||0)) best.set(k,r);
    });
    // Only flag when at least two suppliers have priced the part — otherwise "cheapest" means nothing
    const multi = new Set();
    const seen = new Map();
    latestPer.forEach(r=>{ const k=partKey(r); const s=seen.get(k)||new Set(); s.add(String(r.supplier_id||r.supplier_name)); seen.set(k,s); if(s.size>1) multi.add(k); });
    const cheapest = new Set([...best.entries()].filter(([k])=>multi.has(k)).map(([,r])=>r.id));
    return { shown: latest ? [...latestPer.values()] : filtered, cheapestIds: cheapest };
  },[filtered,latest]);

  const exportCsv = () => {
    const head=["Date","Supplier","Part","Supplier part no","Brand","Price ex VAT","Price incl VAT","Reg","Job","Quote ref"];
    const esc = v => `"${String(v??"").replace(/"/g,'""')}"`;
    const lines=[head.map(esc).join(",")].concat(shown.map(r=>[
      dstr(r.quoted_at), r.supplier_name||shortOf(r.supplier_id), r.part_name, r.supplier_part_no, r.brand,
      (+r.price_ex_vat||0).toFixed(2), (+r.price_incl_vat||0).toFixed(2), r.vehicle_reg, r.job_id, r.quote_ref
    ].map(esc).join(",")));
    const blob=new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`supplier-price-book-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };

  const th={fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",textAlign:"left",padding:"8px 10px",whiteSpace:"nowrap"};
  const td={fontSize:12,padding:"8px 10px",borderTop:"1px solid var(--border)",verticalAlign:"top"};

  return (
    <div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <input className="inp" style={{flex:"2 1 200px"}} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search part no, part name, reg, quote ref…"/>
        <select className="inp" style={{flex:"1 1 150px"}} value={supId} onChange={e=>setSupId(e.target.value)}>
          <option value="">All suppliers</option>
          {wsSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="inp" type="date" style={{flex:"1 1 130px"}} value={from} onChange={e=>setFrom(e.target.value)} title="From"/>
        <input className="inp" type="date" style={{flex:"1 1 130px"}} value={to} onChange={e=>setTo(e.target.value)} title="To"/>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,cursor:"pointer"}}>
          <input type="checkbox" checked={latest} onChange={e=>setLatest(e.target.checked)} style={{width:15,height:15,accentColor:"var(--accent)"}}/>
          Latest price per supplier (shows the cheapest ⭐)
        </label>
        <span style={{fontSize:12,color:"var(--text3)"}}>{shown.length} line{shown.length!==1?"s":""}</span>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={exportCsv} disabled={!shown.length}>⬇️ Export CSV</button>
      </div>

      {loading&&<div style={{color:"var(--text3)",padding:20}}>Loading…</div>}
      {err&&<div style={{color:"var(--red)",fontSize:13,padding:12}}>{err}</div>}
      {!loading&&!err&&!shown.length&&<div style={{color:"var(--text3)",padding:20,textAlign:"center"}}>No saved supplier quotes match. Prices appear here after you Save a Return Quote.</div>}

      {shown.length>0&&(
        <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:860}}>
            <thead style={{background:"var(--surface2)"}}>
              <tr>
                <th style={th}>Date</th><th style={th}>Supplier</th><th style={th}>Part</th><th style={th}>Supplier part #</th>
                <th style={th}>Brand</th><th style={{...th,textAlign:"right"}}>Ex VAT</th><th style={{...th,textAlign:"right"}}>Incl VAT</th>
                <th style={th}>Reg</th><th style={th}>Job</th><th style={th}>Quote ref</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r=>(
                <tr key={r.id}>
                  <td style={td}>{dstr(r.quoted_at)}</td>
                  <td style={{...td,fontWeight:600}}>{r.supplier_name||shortOf(r.supplier_id)}</td>
                  <td style={td}>{r.part_name}</td>
                  <td style={{...td,fontFamily:"monospace"}}>{r.supplier_part_no||"—"}</td>
                  <td style={td}>{r.brand||"—"}</td>
                  <td style={{...td,textAlign:"right"}}>{money(r.price_ex_vat)}</td>
                  <td style={{...td,textAlign:"right",fontWeight:700,color:cheapestIds.has(r.id)?"var(--green)":"inherit"}}>{money(r.price_incl_vat)}{cheapestIds.has(r.id)?" ⭐":""}</td>
                  <td style={td}>{r.vehicle_reg||"—"}</td>
                  <td style={td}>{r.job_id&&onOpenJob
                    ? <button type="button" onClick={()=>onOpenJob(r.job_id)} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",padding:0,fontSize:12,textDecoration:"underline"}}>{r.job_id}</button>
                    : r.job_id||"—"}</td>
                  <td style={td}>{r.quote_ref||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

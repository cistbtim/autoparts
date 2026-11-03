import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api.js";
import { makeId } from "../lib/helpers.js";
import { Overlay, MHead } from "./shared.jsx";

const lc = s => (s||"").toLowerCase().trim();
const keyOf = (supplierId, partNo) => `${supplierId||""}|${lc(partNo)}`;
const money = v => (+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

// Part Library Matching (Admin). Optional and off by default: links a supplier's part number
// (saved by Return Quote) to a part in the MotorDesk library via the separate supplier_part_links
// table. Never changes stock, selling prices, remarks, quotes or any existing part field.
export function PartMatchingPage({enabled, onToggle, parts=[], setParts, wsSuppliers=[], branchId=null, showToast}) {
  const [lines,   setLines]   = useState([]);
  const [links,   setLinks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [matching,setMatching]= useState(null);   // row being matched
  const [busyKey, setBusyKey] = useState("");

  useEffect(()=>{
    if(!enabled){ setLoading(false); return; }
    let alive=true;
    Promise.all([
      api.get("supplier_quote_lines","supplier_part_no=not.is.null&select=*&order=quoted_at.desc"),
      api.get("supplier_part_links","select=*&order=created_at.desc"),
    ]).then(([l,k])=>{
      if(!alive) return;
      if(!Array.isArray(l)||!Array.isArray(k)) setErr("Could not load — have the supplier_quote_lines and supplier_part_links tables been created in Supabase?");
      else { setLines(l); setLinks(k); }
      setLoading(false);
    }).catch(()=>{ if(alive){ setErr("Could not load."); setLoading(false); } });
    return ()=>{ alive=false; };
  },[enabled]);

  const supName = id => { const s=wsSuppliers.find(x=>String(x.id)===String(id)); return s?.short_name||s?.name||""; };

  const linkedKeys = useMemo(()=>new Set(links.map(l=>keyOf(l.supplier_id,l.supplier_part_no))),[links]);

  // One row per supplier + part number (newest quote first, so the first seen is the latest)
  const unmatched = useMemo(()=>{
    const m=new Map();
    lines.forEach(r=>{
      if(!(r.supplier_part_no||"").trim()) return;
      const k=keyOf(r.supplier_id,r.supplier_part_no);
      if(linkedKeys.has(k)) return;
      const cur=m.get(k);
      if(!cur) m.set(k,{key:k,supplier_id:r.supplier_id,supplier_name:r.supplier_name,supplier_part_no:r.supplier_part_no.trim(),
        part_name:r.part_name,price_incl_vat:r.price_incl_vat,quoted_at:r.quoted_at,count:1});
      else cur.count++;
    });
    return [...m.values()];
  },[lines,linkedKeys]);

  const saveLink = async (row, part) => {
    const rec={ id:makeId("SPL"), supplier_id:row.supplier_id||null, supplier_name:row.supplier_name||supName(row.supplier_id),
      supplier_part_no:row.supplier_part_no, part_id:String(part.id), part_sku:part.sku||null, part_name:part.name||null,
      created_at:new Date().toISOString() };
    const r=await api.insert("supplier_part_links",rec);
    if(r&&!Array.isArray(r)&&(r.code||r.message)) throw new Error(r.message||r.code);
    setLinks(p=>[rec,...p]);
  };

  const doMatch = async (part) => {
    const row=matching; setMatching(null); setBusyKey(row.key);
    try{ await saveLink(row,part); showToast&&showToast(`Linked ${row.supplier_part_no} → ${part.sku||part.name}`); }
    catch(e){ showToast?showToast("Link failed: "+e.message,"err"):alert("Link failed: "+e.message); }
    setBusyKey("");
  };

  const doCreate = async (row) => {
    const sku=row.supplier_part_no;
    const dup=parts.find(p=>lc(p.sku)===lc(sku));
    if(dup){ showToast&&showToast(`SKU ${sku} already exists in the library — use Match instead`,"err"); return; }
    setBusyKey(row.key);
    try{
      const r=await api.upsert("parts",{sku,name:row.part_name||sku,stock:0,...(branchId?{branch_id:branchId}:{})});
      const np=Array.isArray(r)?r[0]:null;
      if(!np?.id) throw new Error((r&&r.message)||"Part was not created");
      setParts&&setParts(prev=>[np,...prev]);   // local state only — never reload the 44k-row parts table
      await saveLink(row,np);
      showToast&&showToast(`Created ${sku} and linked it`);
    }catch(e){ showToast?showToast("Create failed: "+e.message,"err"):alert("Create failed: "+e.message); }
    setBusyKey("");
  };

  const unlink = async (l) => {
    if(!window.confirm(`Unlink ${l.supplier_part_no} from ${l.part_sku||l.part_name}? The library part itself is not changed.`)) return;
    await api.delete("supplier_part_links","id",l.id).catch(()=>{});
    setLinks(p=>p.filter(x=>x.id!==l.id));
  };

  const card={border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",background:"var(--surface2)",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"};

  if(!enabled) return (
    <div className="fu">
      <div style={{fontSize:20,fontWeight:800,marginBottom:6}}>🔗 Part Library Matching <span style={{fontSize:13,color:"var(--text3)",fontWeight:600}}>零件库配对</span></div>
      <div style={{...card,flexDirection:"column",alignItems:"flex-start",gap:8,maxWidth:560}}>
        <div style={{fontSize:13,fontWeight:700}}>Currently off</div>
        <div style={{fontSize:12,color:"var(--text3)",lineHeight:1.5}}>
          Optional. Quotes, part numbers, remarks and the Supplier Price Book all work without it. Turn it on only if you want to link a supplier's
          part numbers to parts in your MotorDesk library. It never changes stock, selling prices or sent quotes.
        </div>
        <button className="btn btn-primary" onClick={()=>onToggle(true)}>Turn on</button>
      </div>
    </div>
  );

  return (
    <div className="fu">
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
        <div style={{fontSize:20,fontWeight:800}}>🔗 Part Library Matching <span style={{fontSize:13,color:"var(--text3)",fontWeight:600}}>零件库配对</span></div>
        <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={()=>{ if(window.confirm("Turn Part Library Matching off? Existing links are kept.")) onToggle(false); }}>Turn off</button>
      </div>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Supplier part numbers saved from Return Quotes that aren't linked to a library part yet. <b>Match</b> links one to an existing part; <b>Create</b> adds a new part (stock 0) and links it. Leaving them unmatched affects nothing.
      </div>

      {loading&&<div style={{color:"var(--text3)",padding:20}}>Loading…</div>}
      {err&&<div style={{color:"var(--red)",fontSize:13,padding:12}}>{err}</div>}
      {!loading&&!err&&!unmatched.length&&<div style={{color:"var(--text3)",padding:20,textAlign:"center"}}>Nothing to match — no unlinked supplier part numbers.</div>}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {unmatched.map(r=>(
          <div key={r.key} style={card}>
            <div style={{flex:"1 1 220px",minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,fontFamily:"monospace"}}>{r.supplier_part_no}</div>
              <div style={{fontSize:12,color:"var(--text2)"}}>{r.part_name}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
                {r.supplier_name||supName(r.supplier_id)} · last R {money(r.price_incl_vat)} incl VAT · quoted {r.count}×
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" disabled={busyKey===r.key} onClick={()=>setMatching(r)}>🔗 Match</button>
            <button className="btn btn-primary btn-sm" disabled={busyKey===r.key} onClick={()=>doCreate(r)}>➕ Create</button>
          </div>
        ))}
      </div>

      {links.length>0&&(
        <details style={{marginTop:18}}>
          <summary style={{cursor:"pointer",fontSize:13,fontWeight:700}}>Linked ({links.length})</summary>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
            {links.map(l=>(
              <div key={l.id} style={{...card,padding:"8px 12px"}}>
                <span style={{fontFamily:"monospace",fontWeight:700,fontSize:13}}>{l.supplier_part_no}</span>
                <span style={{fontSize:11,color:"var(--text3)"}}>{l.supplier_name||supName(l.supplier_id)}</span>
                <span style={{fontSize:12,flex:1}}>→ {l.part_sku||""} {l.part_name||""}</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>unlink(l)}>Unlink</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {matching&&<MatchPartModal row={matching} parts={parts} onPick={doMatch} onClose={()=>setMatching(null)}/>}
    </div>
  );
}

function MatchPartModal({row, parts, onPick, onClose}) {
  const [q,setQ]=useState(row.part_name||"");
  const results=useMemo(()=>{
    const toks=lc(q).split(/\s+/).filter(Boolean);
    if(!toks.length) return [];
    const out=[];
    for(const p of parts){
      const hay=`${p.name||""} ${p.sku||""} ${p.oem||""}`.toLowerCase();
      if(toks.every(t=>hay.includes(t))){ out.push(p); if(out.length>=30) break; }
    }
    return out;
  },[q,parts]);
  return (
    <Overlay onClose={onClose} wide>
      <MHead title={`🔗 Match ${row.supplier_part_no}`} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>Search the library (name, SKU or OEM) and tap the part this supplier number belongs to.</div>
      <input className="inp" autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search parts…" style={{marginBottom:10}}/>
      <div style={{maxHeight:360,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
        {results.map(p=>(
          <button key={p.id} type="button" onClick={()=>onPick(p)}
            style={{textAlign:"left",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface2)",cursor:"pointer",color:"var(--text)"}}>
            <div style={{fontSize:13,fontWeight:700}}>{p.name}</div>
            <div style={{fontSize:11,color:"var(--text3)",fontFamily:"monospace"}}>{p.sku}{p.oem?` · OEM ${p.oem}`:""}</div>
          </button>
        ))}
        {q.trim()&&!results.length&&<div style={{color:"var(--text3)",fontSize:12,padding:10}}>No parts found.</div>}
      </div>
      <button className="btn btn-ghost" style={{width:"100%",marginTop:12}} onClick={onClose}>Cancel</button>
    </Overlay>
  );
}

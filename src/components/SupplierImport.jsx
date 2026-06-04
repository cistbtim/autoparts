import { useState, useRef } from "react";
import { api } from "../lib/api.js";
import { Overlay, MHead } from "./shared.jsx";

function splitCSVLine(line) {
  const res=[]; let cur=""; let q=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){q=!q;}
    else if(line[i]===','&&!q){res.push(cur);cur="";}
    else{cur+=line[i];}
  }
  res.push(cur);
  return res;
}

function parseSupplierCSV(text) {
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2) return {colMap:{},rows:[]};
  const raw=splitCSVLine(lines[0]).map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase());
  const MAP={
    name:["name","supplier","supplier name","company","company name","business"],
    email:["email","email address","e-mail","mail"],
    phone:["phone","telephone","tel","mobile","cell","contact number"],
    country:["country","location","region"],
    contact_person:["contact","contact person","contact_person","person","rep","representative"],
    account_number:["account","account number","account_number","acct","acc no","customer code"],
    notes:["notes","note","remarks","comment"],
  };
  const colMap={};
  raw.forEach((h,i)=>{
    Object.entries(MAP).forEach(([field,aliases])=>{
      if(aliases.includes(h)&&!Object.values(colMap).includes(field)) colMap[i]=field;
    });
  });
  const rows=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const vals=splitCSVLine(lines[i]).map(v=>v.trim().replace(/^"|"$/g,""));
    const row={};
    Object.entries(colMap).forEach(([ci,field])=>{row[field]=vals[+ci]||"";});
    if(row.name) rows.push(row);
  }
  return {colMap,rows};
}

const SAMPLE=`name,email,phone,country,contact_person,account_number,notes
Oscar Lubricants,orders@oscar.co.za,+27111234567,South Africa,John Smith,ACCT001,Main lubricants supplier
KM Spray Paint,info@kmspray.com,+27219876543,South Africa,Sarah Lee,ACCT002,Paints and finishes`;

const FIELDS=["name","email","phone","country","contact_person","account_number","notes"];
const FLABEL={name:"Name *",email:"Email",phone:"Phone",country:"Country",contact_person:"Contact Person",account_number:"Account No.",notes:"Notes"};

export function SupplierImportModal({onImport,onClose}) {
  const [step,setStep]=useState(1);
  const [rows,setRows]=useState([]);
  const [colMap,setColMap]=useState({});
  const [progress,setProgress]=useState(0);
  const [results,setResults]=useState({ok:0,fail:0});
  const fileRef=useRef();

  const parse=text=>{
    const {colMap:cm,rows:r}=parseSupplierCSV(text);
    setColMap(cm); setRows(r);
    if(r.length>0) setStep(2);
  };

  const handleFile=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>parse(ev.target.result);
    r.readAsText(f);
  };

  const doImport=async()=>{
    setStep(3); setProgress(0);
    let ok=0,fail=0;
    for(let i=0;i<rows.length;i++){
      const {name,email="",phone="",country="",contact_person="",account_number="",notes=""}=rows[i];
      if(!name){fail++;setProgress(i+1);continue;}
      const r=await api.insert("suppliers",{name,email,phone,country,contact_person,account_number,notes});
      if(r?.code||r?.error) fail++; else ok++;
      setProgress(i+1);
    }
    setResults({ok,fail});
    if(onImport) await onImport();
  };

  const mappedFields=FIELDS.filter(f=>Object.values(colMap).includes(f));
  const hasName=Object.values(colMap).includes("name");

  return (
    <Overlay onClose={onClose} wide>
      <MHead title="📥 Import Suppliers from CSV" onClose={onClose}/>

      {/* ── STEP 1: Upload ── */}
      {step===1&&(
        <div>
          <div style={{marginBottom:16,padding:"12px 16px",background:"rgba(96,165,250,.07)",border:"1px solid rgba(96,165,250,.25)",borderRadius:10,fontSize:13}}>
            Upload a CSV file. Required column: <strong>name</strong>. Optional: email, phone, country, contact_person, account_number, notes.
            Column headers are flexible — "Supplier Name", "Company", "Tel" etc. all work.
          </div>

          <button className="btn btn-ghost btn-sm" style={{marginBottom:16}} onClick={()=>{
            const b=new Blob([SAMPLE],{type:"text/csv"});
            const a=document.createElement("a");
            a.href=URL.createObjectURL(b);
            a.download="suppliers_template.csv";
            a.click();
          }}>📄 Download Template CSV</button>

          <div
            style={{border:"2px dashed var(--border)",borderRadius:12,padding:32,textAlign:"center",marginBottom:16,cursor:"pointer",background:"var(--surface2)"}}
            onClick={()=>fileRef.current?.click()}>
            <div style={{fontSize:40,marginBottom:8}}>📁</div>
            <div style={{fontWeight:600,marginBottom:4}}>Click to select CSV file</div>
            <div style={{fontSize:13,color:"var(--text3)"}}>or drag and drop</div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={handleFile}/>
          </div>

          <div style={{textAlign:"center",color:"var(--text3)",fontSize:13,marginBottom:10}}>— or paste CSV text below —</div>
          <textarea
            className="inp"
            rows={5}
            placeholder={"name,email,phone\nOscar Lubricants,info@oscar.co.za,+27111234567"}
            onChange={e=>{
              const v=e.target.value;
              if(v.includes(",")&&v.includes("\n")) parse(v);
            }}
            style={{fontFamily:"DM Mono,monospace",fontSize:12,width:"100%"}}
          />
        </div>
      )}

      {/* ── STEP 2: Preview ── */}
      {step===2&&(
        <div>
          <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700,fontSize:15}}>
              {rows.length} supplier{rows.length!==1?"s":""} ready to import
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setStep(1)}>← Back</button>
          </div>

          {/* Column detection badges */}
          <div style={{marginBottom:12,display:"flex",gap:6,flexWrap:"wrap"}}>
            {FIELDS.map(f=>{
              const mapped=Object.values(colMap).includes(f);
              return (
                <span key={f} style={{
                  padding:"2px 10px",borderRadius:5,fontSize:11,fontWeight:700,
                  background:mapped?"rgba(52,211,153,.12)":"var(--surface2)",
                  color:mapped?"var(--green)":"var(--text3)",
                  border:"1px solid "+(mapped?"rgba(52,211,153,.3)":"var(--border)")
                }}>
                  {mapped?"✓ ":"— "}{FLABEL[f]}
                </span>
              );
            })}
          </div>

          {!hasName&&(
            <div style={{marginBottom:12,padding:"10px 14px",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.4)",borderRadius:8,fontSize:13,color:"var(--red)"}}>
              ⚠️ No <strong>name</strong> column found — check your CSV headers match the template.
            </div>
          )}

          <div className="card" style={{overflow:"hidden",marginBottom:16}}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>{mappedFields.map(f=><th key={f}>{FLABEL[f]}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0,20).map((r,i)=>(
                    <tr key={i}>
                      {mappedFields.map(f=>(
                        <td key={f} style={{fontSize:13,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {r[f]||<span style={{color:"var(--text3)"}}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {rows.length>20&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>Showing first 20 of {rows.length} rows</div>}

          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!hasName} onClick={doImport}>
              📥 Import {rows.length} Supplier{rows.length!==1?"s":""}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Progress / Done ── */}
      {step===3&&(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          {progress<rows.length
            ? <>
                <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Importing...</div>
                <div style={{fontSize:14,color:"var(--text3)",marginBottom:20}}>{progress} of {rows.length}</div>
                <div style={{height:8,background:"var(--border)",borderRadius:4,overflow:"hidden",maxWidth:320,margin:"0 auto"}}>
                  <div style={{
                    height:"100%",
                    width:(Math.round((progress/rows.length)*100))+"%",
                    background:"var(--accent)",
                    borderRadius:4,
                    transition:"width .3s"
                  }}/>
                </div>
              </>
            : <>
                <div style={{fontSize:52,marginBottom:12}}>✅</div>
                <div style={{fontWeight:700,fontSize:20,marginBottom:8}}>Import Complete</div>
                <div style={{fontSize:14,color:"var(--text3)",marginBottom:28}}>
                  <span style={{color:"var(--green)",fontWeight:700}}>{results.ok} imported</span>
                  {results.fail>0&&(
                    <><span style={{margin:"0 10px",color:"var(--border)"}}>·</span>
                    <span style={{color:"var(--red)",fontWeight:700}}>{results.fail} skipped (no name)</span></>
                  )}
                </div>
                <button className="btn btn-primary" onClick={onClose}>Done</button>
              </>
          }
        </div>
      )}
    </Overlay>
  );
}

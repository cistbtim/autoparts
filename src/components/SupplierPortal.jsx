import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api.js";
import { getSettings, C } from "../lib/settings.js";
import { toImgUrl, toFullUrl, fmtAmt, fmtDT, waLink, openPartLabelsWindow } from "../lib/helpers.js";
import { Overlay, MHead, FL, FG, FD, StatusBadge, ImgLightbox } from "./shared.jsx";
import { PartPhotoUploader, VehicleFitmentTab } from "./RfqVehicles.jsx";
import { PrintPartLabelModal, ExtraPhotosStrip, resolveMarginOptions } from "./Modals.jsx";
import { getCategories } from "../lib/constants.js";

// Markup brackets a supplier can one-tap into a suggested retail price — cost
// plus a straight % on top (cost * (1 + pct/100)), same "round to nearest 10"
// behaviour as the admin Inventory PartModal's Stock tab. resolveMarginOptions
// (shared with Modals.jsx) picks: the supplier's own numbers, else this part's
// category default, else the shop-wide default, else the hardcoded fallback.
const suggestPriceAt=(cost,markupPct)=>Math.round((+cost*(1+markupPct/100))/10)*10;

// photos/fitments are stored as JSON-stringified arrays (same convention as
// parts.photos in the main Inventory PartModal) — parse defensively since the
// column may be null, "", or already-invalid JSON from manual DB edits.
const parseJsonArray=(v)=>{ if(Array.isArray(v)) return v; try{ const a=JSON.parse(v||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } };

// Multi-keyword search — every space-separated word must appear somewhere in the
// part's searchable text (in any order/field), so "bmw x1 head lamp" matches a part
// whose make/model/name between them contain all four words, not one whole phrase.
const searchBlob=(p,code)=>[code,p.name,p.make,p.model,p.year_range,p.category,p.oe_number,p.chinese_desc].filter(Boolean).join(" ").toLowerCase();
const matchesSearch=(blob,keywords)=>keywords.every(k=>blob.includes(k));

// Columns the supplier can pick between for the "My Parts" PDF export — same
// underlying values shown on each PartRow card, plus a few extras (chinese
// description, OE number, fits count) that only fit on paper, not the card.
const EXPORT_FIELDS=[
  {key:"photo", label:"Photo", default:true, image:true},
  {key:"sku", label:"SKU", default:true},
  {key:"name", label:"Name", default:true},
  {key:"chinese_desc", label:"Chinese Description", default:false},
  {key:"brand", label:"Brand", default:false},
  {key:"category", label:"Category", default:false},
  {key:"make", label:"Make", default:true},
  {key:"model", label:"Model", default:true},
  {key:"year_range", label:"Year Range", default:true},
  {key:"oe_number", label:"OE Number", default:false},
  {key:"cost", label:"Your Cost", default:true, numeric:true, currency:true},
  {key:"suggested", label:"Suggested Retail", default:true, numeric:true, currency:true},
  {key:"customerPrice", label:"Customer Price", default:false, numeric:true, currency:true},
  {key:"stock", label:"Stock", default:true, numeric:true},
  {key:"fits", label:"Fits", default:false, numeric:true},
];

// Opens the same "print → Save as PDF" window used elsewhere in the app (e.g.
// App.jsx's Inventory Stock Value Report) — no PDF library needed, the browser's
// own print dialog does the export.
const openSupplierPartsPdf=(rows,fields,tabLabel,supplierLabel,contactPerson,phone,fullName,address)=>{
  const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const cur=C();
  const dateStr=new Date().toLocaleDateString();
  const contactLine=[contactPerson,phone].filter(Boolean).join(" · ")||"Parts List";
  const cell=(f,row)=>{
    const v=row[f.key];
    if(f.image) return v?`<a href="${esc(toFullUrl(v)||v)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(toImgUrl(v))}" onerror="this.style.visibility='hidden'"/></a>`:"";
    if(f.currency) return v!=null&&v!==""?cur+(+v).toFixed(2):"—";
    if(f.numeric) return v??0;
    return esc(v||"—");
  };
  const headHtml=fields.map(f=>`<th${f.numeric?' class="num"':""}>${esc(f.label)}</th>`).join("");
  // Rows are already sorted make-then-SKU (see sortByMakeThenSku) — insert a
  // divider row every time the make changes, spanning the full table width,
  // and force a page break before every make after the first (not the first —
  // that one's already at the top of page 1, breaking there would just leave
  // a blank page).
  const makeCounts={};
  rows.forEach(r=>{ const k=r.make||"—"; makeCounts[k]=(makeCounts[k]||0)+1; });
  let lastMake=null, firstGroup=true;
  const rowsHtml=rows.map(row=>{
    const mk=row.make||"—";
    let groupHtml="";
    if(mk!==lastMake){
      const breakStyle=firstGroup?"":' style="page-break-before:always"';
      groupHtml=`<tr class="makegroup"${breakStyle}><td colspan="${fields.length}">${esc(mk)} — ${makeCounts[mk]} part${makeCounts[mk]!==1?"s":""}</td></tr>`;
      lastMake=mk; firstGroup=false;
    }
    return groupHtml+`<tr>${fields.map(f=>`<td${f.numeric?' class="num"':""}>${cell(f,row)}</td>`).join("")}</tr>`;
  }).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(supplierLabel)} — ${esc(tabLabel)}</title>
  <style>
    @page{margin:20mm 14mm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:32px 32px 48px;max-width:1000px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #111}
    .shop{font-size:22px;font-weight:900;color:#f97316}
    .fullname{font-size:13px;font-weight:600;color:#333;margin-top:3px}
    .meta{font-size:11px;color:#666;margin-top:4px}
    .report-title{font-size:18px;font-weight:700;text-align:right}
    .report-date{font-size:11px;color:#666;text-align:right;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    thead{display:table-header-group}
    tr{page-break-inside:avoid}
    thead tr{background:#111;color:#fff}
    thead th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    thead th.num{text-align:right}
    tbody tr:nth-child(even){background:#f9f9f9}
    tbody td{padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:12px;vertical-align:middle}
    tbody tr.makegroup{background:#fdecdc;page-break-after:avoid}
    tbody tr.makegroup td{padding:6px 10px;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#c2410c;border-top:1px solid #f97316;border-bottom:2px solid #f97316}
    .num{text-align:right;font-family:monospace}
    .thumb{width:42px;height:42px;object-fit:contain;background:#fff;border:1px solid #e5e5e5;border-radius:4px;display:block;cursor:pointer}
    .print-btn{display:flex;gap:10px;align-items:center;margin-bottom:20px}
    .print-hint{font-size:11px;color:#888}
    .btn{padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}
    .btn-print{background:#1d4ed8;color:#fff}
    .btn-pdf{background:#dc2626;color:#fff}
    .pagefoot{display:none}
    @media print{
      .print-btn{display:none!important}
      body{padding:16px 16px 40px}
      .pagefoot{display:block;position:fixed;left:0;right:0;bottom:0;text-align:center;font-size:10px;color:#999;padding:6px 0}
    }
  </style></head><body>
  <div class="print-btn">
    <button class="btn btn-print" onclick="window.print()">🖨 Print</button>
    <button class="btn btn-pdf" onclick="window.print()">📄 Save as PDF</button>
    <span class="print-hint">💡 Tick "Headers and footers" in the print dialog for automatic page numbers</span>
  </div>
  <div class="header">
    <div>
      <div class="shop">${esc(supplierLabel)}</div>
      ${fullName?`<div class="fullname">${esc(fullName)}</div>`:""}
      <div class="meta">${esc(contactLine)}</div>
      ${address?`<div class="meta">${esc(address)}</div>`:""}
    </div>
    <div><div class="report-title">${esc(tabLabel)}</div><div class="report-date">Date: ${dateStr} · ${rows.length} parts</div></div>
  </div>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="pagefoot">${esc(supplierLabel)} — ${esc(tabLabel)} · ${dateStr}</div>
  </body></html>`;
  const w=window.open("","_blank","width=1000,height=800");
  if(!w){ alert("Please allow pop-ups for this site to export the PDF"); return; }
  w.document.write(html);
  w.document.close();
};

// The actual invoice document behind "Convert to Invoice" — same print-window
// approach as the PDF export above (browser's own print-to-PDF, no library).
// Without this, "Convert to Invoice" was just flipping a status flag with
// nothing for the supplier to actually hand the customer.
const openSupplierBookingInvoice=(booking, items, supplierLabel, contactPerson, phone, fullName, address)=>{
  const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const cur=C();
  const dateStr=new Date(booking.invoiced_at||booking.confirmed_at||booking.created_at).toLocaleDateString();
  const contactLine=[contactPerson,phone].filter(Boolean).join(" · ");
  const subtotal=booking.subtotal??items.reduce((s,it)=>s+it.qty*it.unit_price,0);
  const discountPct=booking.discount_pct||0;
  const total=booking.total??subtotal;
  const rowsHtml=items.map(it=>`<tr>
    <td>${esc(it.part_name)}</td>
    <td class="num" style="font-family:monospace">${esc(it.sku||"—")}</td>
    <td class="num">${it.qty}</td>
    <td class="num">${cur}${(+it.unit_price).toFixed(2)}</td>
    <td class="num">${cur}${(it.qty*it.unit_price).toFixed(2)}</td>
  </tr>`).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${esc(booking.id)}</title>
  <style>
    @page{margin:20mm 14mm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px;max-width:800px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #111}
    .shop{font-size:22px;font-weight:900;color:#f97316}
    .fullname{font-size:13px;font-weight:600;color:#333;margin-top:3px}
    .meta{font-size:11px;color:#666;margin-top:4px}
    .inv-title{font-size:20px;font-weight:800;text-align:right}
    .inv-meta{font-size:12px;color:#666;text-align:right;margin-top:4px}
    .billto{margin:20px 0;padding:14px;background:#f9f9f9;border-radius:8px}
    .billto-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888;font-weight:700;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    thead tr{background:#111;color:#fff}
    thead th{padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    thead th.num{text-align:right}
    tbody td{padding:9px 10px;border-bottom:1px solid #e5e5e5}
    .num{text-align:right;font-family:monospace}
    .totals{margin-top:16px;margin-left:auto;width:280px}
    .totals-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
    .totals-row.grand{font-size:17px;font-weight:900;border-top:2px solid #111;margin-top:4px;padding-top:8px}
    .discount{color:#dc2626}
    .print-btn{display:flex;gap:10px;align-items:center;margin-bottom:20px}
    .btn{padding:8px 20px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}
    .btn-print{background:#1d4ed8;color:#fff}
    @media print{.print-btn{display:none!important}body{padding:16px}}
  </style></head><body>
  <div class="print-btn"><button class="btn btn-print" onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <div class="header">
    <div>
      <div class="shop">${esc(supplierLabel)}</div>
      ${fullName?`<div class="fullname">${esc(fullName)}</div>`:""}
      ${contactLine?`<div class="meta">${esc(contactLine)}</div>`:""}
      ${address?`<div class="meta">${esc(address)}</div>`:""}
    </div>
    <div>
      <div class="inv-title">INVOICE</div>
      <div class="inv-meta">${esc(booking.id)}</div>
      <div class="inv-meta">${dateStr}</div>
    </div>
  </div>
  <div class="billto">
    <div class="billto-label">Bill To</div>
    <div style="font-weight:700">${esc(booking.customer_name)}</div>
    ${booking.customer_phone?`<div class="meta">${esc(booking.customer_phone)}</div>`:""}
  </div>
  <table>
    <thead><tr><th>Item</th><th class="num">SKU</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${cur}${(+subtotal).toFixed(2)}</span></div>
    ${discountPct>0?`<div class="totals-row discount"><span>Discount (${discountPct}%)</span><span>-${cur}${(subtotal-total).toFixed(2)}</span></div>`:""}
    <div class="totals-row grand"><span>Total</span><span>${cur}${(+total).toFixed(2)}</span></div>
  </div>
  </body></html>`;
  const w=window.open("","_blank","width=850,height=900");
  if(!w){ alert("Please allow pop-ups for this site to view the invoice"); return; }
  w.document.write(html);
  w.document.close();
};

// Field-picker shown before export — lets the supplier choose which columns
// land on the PDF/print-out.
function ExportPartsPdfModal({rowCount, tabLabel, selected, onToggle, onExport, onClose}){
  return (
    <Overlay onClose={onClose}>
      <MHead title="📄 Export PDF" sub={`${rowCount} part${rowCount!==1?"s":""} from "${tabLabel}" — matches your current search`} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Choose which columns to include:</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px",marginBottom:18}}>
        {EXPORT_FIELDS.map(f=>(
          <label key={f.key} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,cursor:"pointer"}}>
            <input type="checkbox" checked={selected.has(f.key)} onChange={()=>onToggle(f.key)}/>
            {f.label}
          </label>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={rowCount===0||selected.size===0} onClick={onExport}>
          📄 Export {rowCount} Part{rowCount!==1?"s":""}
        </button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER PORTAL — self-service parts catalogue for a supplier login
// (role:"supplier", scoped to one suppliers.id via user.supplier_id).
// Parts they add live in the dedicated supplier_parts table, walled off
// from the main inventory, until an admin sets a customer-facing price.
// ═══════════════════════════════════════════════════════════════

export function SupplierPartsPage({parts=[], existingParts=[], supplierCode, supplierName="", supplierContactPerson="", supplierPhone="", supplierFullName="", supplierAddress="", supplierTypes=[], onSave, onDelete, onRefresh, onUpdateCostPrice, onUpdateBusinessInfo, vehicles=[], partFitments=[], onAddFitment, onAddSelfFitment, onDeleteFitment, marginOptions=null, onUpdateMarginOptions, onBulkUpdateSuggestedPrices}) {
  const [editing, setEditing] = useState(null); // null | {} (new) | existing row
  const [editingCost, setEditingCost] = useState(null); // existing-catalogue row having its cost price updated
  const [labelPart, setLabelPart] = useState(null); // part being label-printed (same modal admin/stockman use)
  const [fitmentTarget, setFitmentTarget] = useState(null); // {part, kind:"existing"|"self"} — row having its vehicle fits edited
  const [tab, setTab] = useState(existingParts.length?"existing":"mine");
  // No category here — this is just the supplier's own base line shown in the
  // "Your Suggested Markup %" card; each modal resolves its own part's category on top of this.
  const supplierBaseMarginOptions=resolveMarginOptions({supplierOptions:marginOptions});
  const [search, setSearch] = useState("");

  // Bulk-apply a new markup % to many already-priced Existing Catalogue parts at
  // once, without opening each part's cost modal individually — recomputes
  // suggested_price from each part's own already-set cost, doesn't touch cost itself.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const toggleSelect=(id)=>setSelectedIds(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});
  const exitBulkMode=()=>{setBulkMode(false);setSelectedIds(new Set());};
  const keywords=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const existingFiltered=keywords.length?existingParts.filter(p=>matchesSearch(searchBlob(p,p.sku),keywords)):existingParts;
  const minesFiltered=keywords.length?parts.filter(p=>matchesSearch(searchBlob(p,`${supplierCode}-${p.part_code}`),keywords)):parts;

  // PDF export — exports whichever tab/search the supplier is currently looking at.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState(()=>new Set(EXPORT_FIELDS.filter(f=>f.default).map(f=>f.key)));
  const toggleExportField=(key)=>setExportSelected(prev=>{const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n;});
  // Make first (Audi, BMW, Mercedes-Benz… alphabetically), SKU/part number second.
  const sortByMakeThenSku=(rows)=>[...rows].sort((a,b)=>
    (a.make||"").localeCompare(b.make||"")||(a.sku||"").localeCompare(b.sku||""));
  const buildExportRows=()=>{
    if(tab==="existing"){
      return sortByMakeThenSku(existingFiltered.map(p=>({
        photo:p.image_url, sku:p.sku, name:p.name, chinese_desc:p.chinese_desc, brand:p.brand, category:p.category,
        make:p.make, model:p.model, year_range:p.year_range, oe_number:p.oe_number,
        cost:p._supplierPrice, suggested:p._suggestedPrice, customerPrice:p.price, stock:p.stock,
        fits:partFitments.filter(pf=>String(pf.part_id)===String(p.id)).length,
      })));
    }
    return sortByMakeThenSku(minesFiltered.map(p=>({
      photo:p.image_url, sku:`${supplierCode}-${p.part_code}`, name:p.name, chinese_desc:p.chinese_desc, brand:p.brand, category:p.category,
      make:p.make, model:p.model, year_range:p.year_range, oe_number:p.oe_number,
      cost:p.cost_price, suggested:p.suggested_price, customerPrice:p.price, stock:p.stock,
      fits:partFitments.filter(pf=>String(pf.supplier_part_id)===String(p.id)).length,
    })));
  };

  // In-app "price changed since you last looked" badge — no outbound notification,
  // just a local baseline captured once when this page first mounts (i.e. what they
  // saw last time), then immediately reset for next time. Kept per-browser via
  // localStorage rather than a schema addition; worst case on a new device/cleared
  // storage is everything reads as "changed" once, which is harmless.
  const lsKey=`supplier_portal_last_viewed_${supplierCode}`;
  const [lastViewed]=useState(()=>{
    const prev=localStorage.getItem(lsKey);
    try{localStorage.setItem(lsKey,new Date().toISOString());}catch{}
    return prev;
  });

  return (
    <div className="fu">
      {editing&&<SupplierPartModal part={editing} supplierCode={supplierCode} supplierMarginOptions={marginOptions} ownParts={parts}
        onSave={async(data)=>{ if(await onSave(data)!==false) setEditing(null); }}
        onDelete={editing.id?async()=>{await onDelete(editing.id);setEditing(null);}:null}
        onClose={()=>setEditing(null)}/>}

      {editingCost&&<SupplierCostPriceModal part={editingCost} supplierMarginOptions={marginOptions}
        onSave={async(data)=>{await onUpdateCostPrice(editingCost,data);setEditingCost(null);}}
        onClose={()=>setEditingCost(null)}/>}

      {exportOpen&&(
        <ExportPartsPdfModal
          rowCount={tab==="existing"?existingFiltered.length:minesFiltered.length}
          tabLabel={tab==="existing"?`Existing Catalogue (${existingFiltered.length})`:`Added by You (${minesFiltered.length})`}
          selected={exportSelected}
          onToggle={toggleExportField}
          onExport={()=>{
            openSupplierPartsPdf(buildExportRows(), EXPORT_FIELDS.filter(f=>exportSelected.has(f.key)),
              tab==="existing"?"Existing Catalogue":"Added by You", supplierName||supplierCode,
              supplierContactPerson, supplierPhone, supplierFullName, supplierAddress);
            setExportOpen(false);
          }}
          onClose={()=>setExportOpen(false)}/>
      )}

      {labelPart&&<PrintPartLabelModal part={labelPart} settings={getSettings()} onClose={()=>setLabelPart(null)}/>}

      {fitmentTarget&&(()=>{
        const isSelf=fitmentTarget.kind==="self";
        const p=fitmentTarget.part;
        const fkKey=isSelf?"supplier_part_id":"part_id";
        return (
          <VehicleFitmentTab
            part={isSelf?{...p, sku:`${supplierCode}-${p.part_code}`}:p}
            vehicles={vehicles}
            partFitments={partFitments.filter(pf=>String(pf[fkKey])===String(p.id))}
            onAdd={isSelf?onAddSelfFitment:onAddFitment} onDelete={onDeleteFitment}
            onClose={()=>setFitmentTarget(null)}
            supplierMode t={{}} imageUrl={p.image_url}/>
        );
      })()}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📦 My Parts</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
            {existingParts.length} already in inventory · {parts.length} added by you ({parts.filter(p=>!p.price).length} awaiting pricing)
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Prices/stock can change on admin's side — refresh to see the latest">↺ Refresh</button>}
          <button className="btn btn-ghost btn-sm" onClick={()=>setExportOpen(true)}>📄 Export PDF</button>
          {onBulkUpdateSuggestedPrices&&(
            <button className="btn btn-ghost btn-sm" onClick={()=>{if(bulkMode)exitBulkMode();else{setBulkMode(true);setTab("existing");}}}>
              {bulkMode?"✕ Exit Bulk Update":"☑ Bulk Update Prices"}
            </button>
          )}
          <button className="btn btn-primary" onClick={()=>setEditing({})}>+ Add Part</button>
        </div>
      </div>

      {supplierName&&<ShareCatalogueCard supplierName={supplierName}/>}
      {onUpdateBusinessInfo&&<BusinessInfoCard fullName={supplierFullName} address={supplierAddress} contactPerson={supplierContactPerson} phone={supplierPhone} supplierTypes={supplierTypes} onSave={onUpdateBusinessInfo}/>}
      {onUpdateMarginOptions&&<MarkupOptionsCard marginOptions={marginOptions} effectiveMarginOptions={supplierBaseMarginOptions} onSave={onUpdateMarginOptions}/>}

      {bulkMode&&(()=>{
        const eligible=existingFiltered.filter(p=>p._supplierPrice);
        return (
          <div className="card" style={{padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{fontSize:13,fontWeight:700}}>{selectedIds.size} selected</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedIds(new Set(eligible.map(p=>p.id)))}>Select All ({eligible.length} with cost set)</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedIds(new Set())} disabled={!selectedIds.size}>Clear</button>
            <div style={{flex:1,minWidth:8}}/>
            <span style={{fontSize:12,color:"var(--text3)"}}>Apply markup to selected:</span>
            {supplierBaseMarginOptions.map(m=>(
              <button key={m} type="button" className="btn btn-primary btn-sm" disabled={!selectedIds.size||bulkApplying}
                onClick={async()=>{
                  setBulkApplying(true);
                  const updates=existingParts.filter(p=>selectedIds.has(p.id)&&p._supplierPrice)
                    .map(p=>({linkId:p._linkId,suggestedPrice:suggestPriceAt(p._supplierPrice,m)}));
                  await onBulkUpdateSuggestedPrices(updates);
                  setBulkApplying(false);
                  exitBulkMode();
                }}>
                {bulkApplying?"Applying…":`${m}%`}
              </button>
            ))}
          </div>
        );
      })()}

      <div style={{marginBottom:14}}>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search e.g. bmw x1 head lamp — matches any word in any order"/>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["existing",`Existing Catalogue (${existingFiltered.length})`],["mine",`Added by You (${minesFiltered.length})`]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lb}</button>
        ))}
      </div>

      {tab==="existing"&&(
        existingFiltered.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {existingParts.length===0?"Nothing linked to you in the main inventory yet.":"No parts match your search."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>
              {bulkMode?"Tick parts to bulk-update, then pick a markup % above (only parts with a cost already set can be selected).":"Name, customer price & stock are managed by admin. Click a part to update your own cost price or photo."}
            </div>
            {existingFiltered.map(p=><PartRow key={p.id} p={p} code={p.sku} name={p.name} readOnly
              priceChanged={!!(lastViewed&&p.price_updated_at&&p.price_updated_at>lastViewed)}
              onClick={bulkMode?(p._supplierPrice?()=>toggleSelect(p.id):undefined):(onUpdateCostPrice?()=>setEditingCost(p):undefined)}
              onPrintLabel={bulkMode?undefined:()=>setLabelPart(p)}
              onEditFitments={bulkMode?undefined:(onAddFitment?()=>setFitmentTarget({part:p,kind:"existing"}):undefined)}
              fitCount={partFitments.filter(pf=>String(pf.part_id)===String(p.id)).length}
              bulkMode={bulkMode} selected={selectedIds.has(p.id)} selectable={!!p._supplierPrice}/>)}
          </div>
        )
      )}

      {tab==="mine"&&(
        minesFiltered.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {parts.length===0?'No parts yet — click "+ Add Part" to add your first one.':"No parts match your search."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {minesFiltered.map(p=><PartRow key={p.id} p={p} code={`${supplierCode}-${p.part_code}`} name={p.name} onClick={()=>setEditing(p)}
              onPrintLabel={()=>setLabelPart({...p, sku:`${supplierCode}-${p.part_code}`})}
              onEditFitments={onAddSelfFitment?()=>setFitmentTarget({part:p,kind:"self"}):undefined}
              fitCount={partFitments.filter(pf=>String(pf.supplier_part_id)===String(p.id)).length}/>)}
          </div>
        )
      )}
    </div>
  );
}

// A ?catalog=<supplier name> link jumps straight to the customer sign-up tab, and
// any account registered through it is auto-scoped to just this supplier's parts
// (see LoginPage.jsx's catalogName/catalogSupplierId handling) — that whole flow
// already exists, this just gives the supplier an easy way to grab their own link
// instead of hand-building the URL.
function ShareCatalogueCard({supplierName}) {
  const [copied,setCopied]=useState(false);
  const link=`${window.location.origin}${window.location.pathname}?catalog=${encodeURIComponent(supplierName)}`;
  const waMsg=`Hi! Browse our parts catalogue and create your account here:\n${link}`;
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:220}}>
        <div style={{fontSize:13,fontWeight:700}}>📤 Share Your Catalogue</div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Anyone who signs up through this link only sees your parts</div>
        <div style={{fontSize:11,fontFamily:"DM Mono,monospace",color:"var(--blue)",marginTop:4,wordBreak:"break-all"}}>{link}</div>
      </div>
      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={()=>{navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>
          {copied?"✅ Copied":"📋 Copy Link"}
        </button>
        <a href={waLink("",waMsg)} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
          <button type="button" className="btn btn-ghost btn-sm" style={{background:"#25D366",color:"#fff",border:"none"}}>📲 WhatsApp</button>
        </a>
      </div>
    </div>
  );
}

// Lets a supplier edit their own company details — full legal name, address,
// contact person, phone, and which supplier type(s) they are (New/Used/Dealer/
// Factory). Same fields as the admin's Edit Supplier modal, minus the nickname
// (kept admin-only since it's baked into every SKU prefix already issued).
function BusinessInfoCard({fullName="", address="", contactPerson="", phone="", supplierTypes=[], onSave}) {
  const [editing,setEditing]=useState(false);
  const [f,setF]=useState({full_name:fullName, address, contact_person:contactPerson, phone, supplier_types:supplierTypes});
  const [saving,setSaving]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleType=(tp)=>setF(p=>({...p,supplier_types:p.supplier_types.includes(tp)?p.supplier_types.filter(x=>x!==tp):[...p.supplier_types,tp]}));
  const startEdit=()=>{setF({full_name:fullName, address, contact_person:contactPerson, phone, supplier_types:supplierTypes});setEditing(true);};
  const save=async()=>{setSaving(true);await onSave(f);setSaving(false);setEditing(false);};
  const hasAny=fullName||address||contactPerson||phone||supplierTypes.length>0;
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:220}}>
          <div style={{fontSize:13,fontWeight:700}}>🏢 Business Info</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>Shown to admin and on your exported catalogue PDF</div>
        </div>
        {!editing&&<button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>}
      </div>
      {editing ? (
        <div style={{marginTop:10}}>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:3}}>Company Full Name</div>
            <input className="inp" value={f.full_name} onChange={e=>s("full_name",e.target.value)} placeholder="e.g. MCK Auto Parts (Pty) Ltd"/>
          </div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:3}}>Address</div>
            <textarea className="inp" value={f.address} onChange={e=>s("address",e.target.value)} placeholder="Street, city, postal code"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:3}}>Contact Person</div>
              <input className="inp" value={f.contact_person} onChange={e=>s("contact_person",e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:3}}>Phone</div>
              <input className="inp" type="tel" value={f.phone} onChange={e=>s("phone",e.target.value)}/>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:5}}>Supplier Types</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              {["new","used","dealer","factory"].map(tp=>(
                <label key={tp} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:13}}>
                  <input type="checkbox" checked={f.supplier_types.includes(tp)} onChange={()=>toggleType(tp)} style={{accentColor:"var(--accent)"}}/>
                  {tp.charAt(0).toUpperCase()+tp.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
          </div>
        </div>
      ) : hasAny ? (
        <div style={{marginTop:8,fontSize:13,color:"var(--text2)"}}>
          {fullName&&<div style={{marginBottom:2}}>{fullName}</div>}
          {address&&<div style={{marginBottom:2,color:"var(--text3)",fontSize:12}}>📍 {address}</div>}
          {(contactPerson||phone)&&<div style={{marginBottom:2,color:"var(--text3)",fontSize:12}}>{[contactPerson,phone].filter(Boolean).join(" · ")}</div>}
          {supplierTypes.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:5}}>
              {supplierTypes.map(tp=><span key={tp} style={{fontSize:10,fontWeight:700,borderRadius:4,padding:"1px 6px",background:"rgba(99,102,241,.1)",color:"#818cf8",textTransform:"capitalize"}}>{tp}</span>)}
            </div>
          )}
        </div>
      ) : (
        <div style={{marginTop:8,fontSize:12,color:"var(--text3)"}}>Not set yet — click Edit to add your business details.</div>
      )}
    </div>
  );
}

// Lets a supplier customize their own 3 quick-margin buttons (suppliers.margin_options)
// instead of always using the shop-wide default. marginOptions is the raw stored
// value (null if not customized); effectiveMarginOptions is what's actually in use
// right now (own → shop default → hardcoded), shown as the starting point to edit.
function MarkupOptionsCard({marginOptions, effectiveMarginOptions, onSave}) {
  const [editing,setEditing]=useState(false);
  const [vals,setVals]=useState(effectiveMarginOptions);
  const [saving,setSaving]=useState(false);
  const isCustom=!!(marginOptions&&marginOptions.length);
  const startEdit=()=>{setVals(effectiveMarginOptions);setEditing(true);};
  const save=async()=>{setSaving(true);await onSave(vals.map(v=>+v||0));setSaving(false);setEditing(false);};
  const reset=async()=>{setSaving(true);await onSave(null);setSaving(false);setEditing(false);};
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:220}}>
          <div style={{fontSize:13,fontWeight:700}}>💰 Your Suggested Markup %</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
            {isCustom?"Using your own percentages":"Using the shop's default percentages"} — shown as quick-price buttons next to Cost Price
          </div>
        </div>
        {!editing&&<button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>}
      </div>
      {editing&&(
        <div style={{marginTop:10}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[0,1,2].map(i=>(
              <input key={i} className="inp" type="number" min="0" max="99" style={{width:90}}
                value={vals[i]} onChange={e=>setVals(v=>v.map((x,idx)=>idx===i?+e.target.value||0:x))}/>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
            {isCustom&&<button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={saving}>Reset to shop default</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// Discount % offered automatically to any customer who registered through this
// supplier's own ?catalog= link (see the Share Your Catalogue card above) — applied
// live in the Shop/Cart/Checkout for those customers, never touching customers
// scoped elsewhere or browsing the main multi-supplier shop.
// Both numbers here are scoped to just this one supplier's own catalogue/customers
// — maxDiscountPct is the supplier's own self-set ceiling (suppliers.max_discount_pct),
// never affecting any other supplier's customers. shopWideCap (if admin has set one
// in Settings) is an outer bound shown for reference — the supplier's own max can
// only tighten it further, never exceed it.
function CustomerDiscountCard({discountPct, maxDiscountPct=0, shopWideCap=0, onSave, onSaveMax}) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(discountPct||0);
  const [maxVal,setMaxVal]=useState(maxDiscountPct||0);
  const [saving,setSaving]=useState(false);
  // Effective ceiling for the Default Amount field itself: your own max, further
  // bounded by the shop-wide cap if admin has one set.
  const effectiveCap=(()=>{
    if(maxDiscountPct>0&&shopWideCap>0) return Math.min(maxDiscountPct,shopWideCap);
    return maxDiscountPct>0?maxDiscountPct:shopWideCap;
  })();
  const hasCap=effectiveCap>0;
  const startEdit=()=>{setVal(discountPct||0);setMaxVal(maxDiscountPct||0);setEditing(true);};
  const save=async()=>{
    setSaving(true);
    const clampedMax=Math.max(0,Math.min(shopWideCap>0?shopWideCap:100,+maxVal||0));
    if(onSaveMax) await onSaveMax(clampedMax);
    const newCap=(clampedMax>0&&shopWideCap>0)?Math.min(clampedMax,shopWideCap):(clampedMax>0?clampedMax:shopWideCap);
    await onSave(Math.max(0,Math.min(newCap>0?newCap:100,+val||0)));
    setSaving(false);setEditing(false);
  };
  const remove=async()=>{setSaving(true);await onSave(0);setSaving(false);setEditing(false);};
  const step=(delta)=>setVal(v=>Math.max(0,Math.min(hasCap?effectiveCap:100,(+v||0)+delta)));
  const stepMax=(delta)=>setMaxVal(v=>Math.max(0,Math.min(shopWideCap>0?shopWideCap:100,(+v||0)+delta)));
  return (
    <div className="card" style={{padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{fontSize:13,fontWeight:700,flex:1,minWidth:160}}>🎁 Customer Discount</div>
        {!editing&&<button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Edit</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:10}}>
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Default Amount</div>
          {editing?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>step(-1)} disabled={saving}>−</button>
              <input className="inp" type="number" min="0" max={hasCap?effectiveCap:100} step="1" style={{width:70,textAlign:"center"}}
                value={val} onChange={e=>setVal(e.target.value)} autoFocus/>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>step(1)} disabled={saving}>+</button>
              <span style={{fontSize:13,color:"var(--text3)"}}>%</span>
            </div>
          ):(
            <div style={{fontSize:20,fontWeight:800,color:discountPct>0?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif"}}>{discountPct||0}%</div>
          )}
        </div>
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Maximum Discount Limit</div>
          {editing?(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>stepMax(-1)} disabled={saving}>−</button>
              <input className="inp" type="number" min="0" max={shopWideCap>0?shopWideCap:100} step="1" style={{width:70,textAlign:"center"}}
                value={maxVal} onChange={e=>setMaxVal(e.target.value)}/>
              <button type="button" className="btn btn-ghost btn-xs" onClick={()=>stepMax(1)} disabled={saving}>+</button>
              <span style={{fontSize:13,color:"var(--text3)"}}>%</span>
            </div>
          ):(
            <div style={{fontSize:20,fontWeight:800,color:"var(--text2)",fontFamily:"Rajdhani,sans-serif"}}>{maxDiscountPct>0?`${maxDiscountPct}%`:"No limit"}</div>
          )}
          <div style={{fontSize:10,color:"var(--text3)",marginTop:1}}>
            Only affects your own catalogue{shopWideCap>0?` · shop ceiling ${shopWideCap}%`:""}
          </div>
        </div>
      </div>
      <div style={{fontSize:11,color:"var(--text3)",marginTop:8}}>
        {discountPct>0?"Applied automatically for customers who sign up through your catalogue link":"No discount set — customers pay full price"}
      </div>
      {editing&&(
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
          {discountPct>0&&<button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={saving}>Remove discount</button>}
        </div>
      )}
    </div>
  );
}

function PartRow({p, code, name, readOnly, priceChanged, onClick, onPrintLabel, onEditFitments, fitCount=0, bulkMode=false, selected=false, selectable=true}) {
  const indent = bulkMode?96:76; // aligns footer/cost rows under the title, past the checkbox + photo
  return (
    <div className={onClick?"card card-hover":"card"} style={{padding:14,display:"flex",flexDirection:"column",gap:10,
      cursor:onClick?"pointer":"default",opacity:bulkMode&&!selectable?.5:1,
      border:selected?"1.5px solid var(--accent)":(priceChanged?"1px solid rgba(96,165,250,.5)":undefined),
      background:selected?"rgba(249,115,22,.06)":(priceChanged?"rgba(96,165,250,.05)":undefined)}}
      onClick={onClick}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        {bulkMode&&(
          <input type="checkbox" checked={selected} disabled={!selectable} readOnly style={{width:20,height:20,flexShrink:0,marginTop:22,cursor:selectable?"pointer":"not-allowed"}}/>
        )}
        <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {p.image_url
            ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            : <span style={{fontSize:26,opacity:.3}}>🖼</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:14,wordBreak:"break-all"}}>{code}</span>
            {readOnly&&<span title="Managed by admin" style={{fontSize:12,opacity:.6,flexShrink:0}}>🔒</span>}
            {priceChanged&&<span style={{fontSize:10,fontWeight:700,color:"var(--blue)",flexShrink:0,whiteSpace:"nowrap"}}>🔔 UPDATED</span>}
          </div>
          <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
          {(p.make||p.model)&&<div style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}{fitCount>0&&<span> · +{fitCount} more fit{fitCount!==1?"s":""}</span>}</div>}
        </div>
      </div>

      {readOnly&&(
        <div style={{fontSize:12,color:"var(--text3)",display:"flex",gap:14,flexWrap:"wrap",paddingLeft:indent}}>
          <span>Your cost: <strong style={{color:"var(--text2)"}}>{p._supplierPrice?fmtAmt(p._supplierPrice):"not set"}</strong></span>
          {p._suggestedPrice&&<span>Suggested retail: <strong style={{color:"var(--text2)"}}>{fmtAmt(p._suggestedPrice)}</strong></span>}
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",paddingLeft:indent,borderTop:"1px solid var(--border)",paddingTop:9}}>
        <div style={{display:"flex",alignItems:"baseline",gap:10}}>
          {p.price
            ? <span style={{fontWeight:700,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",fontSize:19}}>{fmtAmt(p.price)}</span>
            : <span className="badge" style={{background:"rgba(251,191,36,.12)",color:"var(--yellow)",fontSize:12}}>⏳ Awaiting pricing</span>}
          <span style={{fontSize:12,color:"var(--text3)"}}>Stock: {p.stock??0}</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {onEditFitments&&(
            <button type="button" title="Vehicle fits" className="btn btn-ghost btn-xs" style={{fontSize:13}}
              onClick={e=>{e.stopPropagation();onEditFitments();}}>🚗 Fits{fitCount>0?` (${fitCount})`:""}</button>
          )}
          {onPrintLabel&&(
            <button type="button" title="Print part label" className="btn btn-ghost btn-xs" style={{fontSize:13}}
              onClick={e=>{e.stopPropagation();onPrintLabel();}}>🏷️ Label</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplierCostPriceModal({part, supplierMarginOptions=null, onSave, onClose}) {
  const marginOptions=resolveMarginOptions({supplierOptions:supplierMarginOptions,category:part.category});
  const [price, setPrice] = useState(part._supplierPrice ?? "");
  const [suggestedPrice, setSuggestedPrice] = useState(part._suggestedPrice ?? null);
  const [imageUrl, setImageUrl] = useState(part.image_url ?? "");
  const [photos, setPhotos] = useState(()=>parseJsonArray(part.photos));
  const [lightbox, setLightbox] = useState(null); // {idx} — urls built from imageUrl + photos
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(()=>{
    if(!part?.id) return;
    let cancelled=false;
    api.fresh("part_price_history",`part_id=eq.${part.id}&select=*&order=created_at.desc&limit=20`).then(r=>{
      if(!cancelled&&Array.isArray(r)) setHistory(r);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[part?.id]);
  return (
    <Overlay onClose={onClose}>
      <MHead title="Update Your Cost Price" sub={`${part.sku} — ${part.name}`} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        Your cost price is just your own reference — it doesn't change what customers see. The suggested retail price
        below is a hint for admin to consider when they set the live selling price.
      </div>
      <FD>
        <FL label="Your Cost Price"/>
        <input className="inp" type="number" min="0" step="0.01" autoFocus value={price} onChange={e=>{setPrice(e.target.value);setSuggestedPrice(null);}} placeholder="0"/>
        {+price>0&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
            {marginOptions.map(m=>{
              const suggested=suggestPriceAt(price,m);
              const active=suggestedPrice===suggested;
              return (
                <button key={m} type="button" onClick={()=>setSuggestedPrice(suggested)}
                  style={{fontSize:11,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontWeight:600,
                    background:active?"var(--accent)":"var(--surface2)",
                    color:active?"#fff":"var(--text2)",
                    border:`1px solid ${active?"var(--accent)":"var(--border)"}`}}>
                  {m}%: {C()}{suggested.toLocaleString()}
                </button>
              );
            })}
          </div>
        )}
        {suggestedPrice!=null&&(
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:10,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:600,color:"var(--text2)"}}>Suggested retail price for admin to review</span>
            <span style={{fontSize:22,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{C()}{suggestedPrice.toLocaleString()}</span>
          </div>
        )}
      </FD>

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={imageUrl} onChange={setImageUrl} sku={part.sku} t={{}} bucket="cars_parts"/>
        <ExtraPhotosStrip photos={photos} onChange={setPhotos} sku={part.sku}
          autosave={newPhotos=>api.patch("parts","id",part.id,{photos:newPhotos})}
          onOpenLightbox={i=>setLightbox({idx:imageUrl?i+1:i})}
          onMakeCover={extraIdx=>{
            const newCover=photos[extraIdx];
            if(!newCover) return;
            setPhotos([...(imageUrl?[imageUrl]:[]), ...photos.filter((_,i)=>i!==extraIdx)]);
            setImageUrl(newCover);
          }}/>
        {lightbox&&(
          <ImgLightbox urls={[imageUrl,...photos].filter(Boolean)} startIdx={lightbox.idx} onClose={()=>setLightbox(null)}/>
        )}
      </FD>

      <div style={{marginBottom:14}}>
        <button type="button" onClick={()=>setHistoryOpen(v=>!v)}
          style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:12,color:"var(--text3)",display:"flex",alignItems:"center",gap:5}}>
          📜 Price History {history.length>0?`(${history.length})`:""} {historyOpen?"▲":"▼"}
        </button>
        {historyOpen&&(
          history.length===0
            ? <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>No price changes recorded yet.</div>
            : (
              <div style={{marginTop:8,border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                {history.map(h=>(
                  <div key={h.id} style={{padding:"8px 12px",borderBottom:"1px solid var(--border)",fontSize:12,display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                    <div>
                      {h.old_price!=null&&h.new_price!=null&&+h.old_price!==+h.new_price&&(
                        <div>Selling: {fmtAmt(h.old_price)} → <strong>{fmtAmt(h.new_price)}</strong></div>
                      )}
                      {h.old_cost_price!=null&&h.new_cost_price!=null&&+h.old_cost_price!==+h.new_cost_price&&(
                        <div style={{color:"var(--text2)"}}>Cost: {fmtAmt(h.old_cost_price)} → <strong>{fmtAmt(h.new_cost_price)}</strong></div>
                      )}
                      <div style={{color:"var(--text3)",fontSize:11,marginTop:2}}>
                        {h.source==="supplier_cost_update"?"🏭 Your update":"✏️ Admin update"}
                      </div>
                    </div>
                    <div style={{color:"var(--text3)",fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(h.created_at)}</div>
                  </div>
                ))}
              </div>
            )
        )}
      </div>

      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving||price===""}
          onClick={async()=>{setSaving(true);await onSave({price:+price,suggestedPrice,imageUrl,photos});setSaving(false);}}>
          {saving?"Saving…":"Save"}
        </button>
      </div>
    </Overlay>
  );
}

function SupplierPartModal({part, supplierCode, supplierMarginOptions=null, ownParts=[], onSave, onDelete, onClose}) {
  const isEdit=!!part?.id;
  const [f,setF]=useState(isEdit?{
    id:part.id, part_code:part.part_code||"", name:part.name||"", chinese_desc:part.chinese_desc||"",
    category:part.category||"", cost_price:part.cost_price??"", stock:part.stock??0,
    image_url:part.image_url||"", make:part.make||"", model:part.model||"",
    year_range:part.year_range||"", oe_number:part.oe_number||"", suggested_price:part.suggested_price??"",
    photos:parseJsonArray(part.photos),
  }:{part_code:"",name:"",chinese_desc:"",category:"",cost_price:"",stock:0,image_url:"",make:"",model:"",year_range:"",oe_number:"",suggested_price:"",photos:[]});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const canSave=f.part_code.trim()&&f.name.trim();
  const [lightbox,setLightbox]=useState(null); // {idx} — urls built from f.image_url + f.photos
  const [saving,setSaving]=useState(false);
  const [selectedOeTok,setSelectedOeTok]=useState("");
  const marginOptions=resolveMarginOptions({supplierOptions:supplierMarginOptions,category:f.category});
  // Same OE number typed onto two different part codes usually means an
  // accidental duplicate listing — catch it as soon as the modal opens/changes,
  // not after it's already been saved and is sitting in stock twice.
  const oeDuplicates=f.oe_number.trim()
    ? ownParts.filter(p=>p.id!==f.id && (p.oe_number||"").trim().toUpperCase()===f.oe_number.trim().toUpperCase())
    : [];

  return (
    <Overlay onClose={onClose}>
      <MHead title={isEdit?"Edit Part":"Add Part"} onClose={onClose}/>

      <FD>
        <FL label={`Part Code * — will show as ${supplierCode}-${f.part_code.trim()||"…"}`}/>
        <input className="inp" style={{fontFamily:"DM Mono,monospace"}} value={f.part_code}
          onChange={e=>s("part_code",e.target.value.toUpperCase().replace(/\s+/g,""))} placeholder="e.g. A1679066909R"/>
      </FD>
      <FD><FL label="Name *"/><input className="inp" value={f.name} onChange={e=>s("name",e.target.value)} placeholder="e.g. Head Lamp LED Right Side"/></FD>
      <FD><FL label="Chinese Description"/><input className="inp" value={f.chinese_desc} onChange={e=>s("chinese_desc",e.target.value)}/></FD>

      <FG cols="1fr 1fr 1fr">
        <div><FL label="Make"/><input className="inp" value={f.make} onChange={e=>s("make",e.target.value)} placeholder="BMW"/></div>
        <div><FL label="Model"/><input className="inp" value={f.model} onChange={e=>s("model",e.target.value)} placeholder="X3"/></div>
        <div><FL label="Year"/><input className="inp" value={f.year_range} onChange={e=>s("year_range",e.target.value)} placeholder="2021-2024"/></div>
      </FG>

      {isEdit&&(
        <div style={{fontSize:11,color:"var(--text3)",marginTop:-8,marginBottom:14}}>
          More fitment vehicles can be linked from the part's "🚗 Fits" button once saved.
        </div>
      )}

      <FG>
        <div>
          <FL label="OE Number"/>
          <input className="inp" value={f.oe_number} onChange={e=>s("oe_number",e.target.value)}/>
          {oeDuplicates.length>0&&(
            <div style={{marginTop:6,padding:"8px 10px",borderRadius:8,background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.35)",fontSize:12,color:"var(--red)"}}>
              ⚠️ This OE Number is already on {oeDuplicates.length} other part{oeDuplicates.length>1?"s":""} in your inventory:
              {oeDuplicates.map(p=><div key={p.id} style={{marginTop:3,fontWeight:600}}>{p.name} <span style={{fontFamily:"DM Mono,monospace",fontWeight:400}}>({supplierCode}-{p.part_code})</span></div>)}
            </div>
          )}
          {f.oe_number&&(()=>{
            const oeTokens=f.oe_number.split(/[\s,;]+/).filter(Boolean);
            const activeTok=oeTokens.includes(selectedOeTok)?selectedOeTok:oeTokens[0];
            const sites=[
              {label:"SpareTO",color:"#e65c00",url:v=>`https://spareto.com/products?utf8=%E2%9C%93&keywords=${encodeURIComponent(v)}`},
              {label:"Alibaba",color:"#1d4ed8",url:v=>`https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(v)}`},
              {label:"RRR.lt",color:"#059669",url:v=>`https://rrr.lt/en/search?exact=1&q=${encodeURIComponent(v)}`},
              {label:"eBay",color:"#e53238",url:v=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(v)}`},
              {label:"Google",color:"var(--blue)",url:v=>`https://www.google.com/search?q=${encodeURIComponent(v)}`},
            ];
            return (
              <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",marginTop:6,padding:"8px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",flexShrink:0}}>🔍 Search</span>
                {oeTokens.length>1&&(
                  <select className="inp" style={{width:"auto",fontSize:11,fontWeight:700,padding:"4px 8px"}}
                    value={activeTok} onChange={e=>setSelectedOeTok(e.target.value)}>
                    {oeTokens.map((tok,i)=>(<option key={i} value={tok}>{tok}</option>))}
                  </select>
                )}
                <span style={{fontSize:11,color:"var(--text3)",flexShrink:0}}>on:</span>
                {sites.map(site=>(
                  <button key={site.label} type="button"
                    onClick={()=>window.open(site.url(activeTok),"_blank","noopener,noreferrer")}
                    style={{fontSize:11,fontWeight:700,padding:"4px 11px",borderRadius:99,cursor:"pointer",
                      background:`color-mix(in srgb, ${site.color} 14%, transparent)`,
                      color:site.color, border:`1px solid color-mix(in srgb, ${site.color} 35%, transparent)`}}>
                    {site.label}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        <div>
          <FL label="Category"/>
          <select className="inp" value={f.category} onChange={e=>s("category",e.target.value)}>
            <option value="">— Select —</option>
            {getCategories().map(c=><option key={c} value={c}>{c}</option>)}
            {f.category&&!getCategories().includes(f.category)&&<option value={f.category}>{f.category}</option>}
          </select>
        </div>
      </FG>
      <FG>
        <div>
          <FL label="Your Cost Price"/>
          <input className="inp" type="number" value={f.cost_price} onChange={e=>s("cost_price",e.target.value)} placeholder="0"/>
          {+f.cost_price>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
              {marginOptions.map(m=>{
                const suggested=suggestPriceAt(f.cost_price,m);
                const active=+f.suggested_price===suggested;
                return (
                  <button key={m} type="button" onClick={()=>s("suggested_price",suggested)}
                    style={{fontSize:11,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontWeight:600,
                      background:active?"var(--accent)":"var(--surface2)",
                      color:active?"#fff":"var(--text2)",
                      border:`1px solid ${active?"var(--accent)":"var(--border)"}`}}>
                    {m}%: {C()}{suggested.toLocaleString()}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div><FL label="Stock"/><input className="inp" type="number" value={f.stock} onChange={e=>s("stock",+e.target.value||0)}/></div>
      </FG>
      {+f.suggested_price>0&&(
        <div style={{marginTop:-4,marginBottom:14,padding:"10px 14px",borderRadius:10,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:600,color:"var(--text2)"}}>Suggested retail price for admin to review</span>
          <span style={{fontSize:22,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{C()}{(+f.suggested_price).toLocaleString()}</span>
        </div>
      )}

      <FD>
        <FL label="Photo"/>
        <PartPhotoUploader imageUrl={f.image_url} onChange={url=>s("image_url",url)} sku={`${supplierCode}-${f.part_code||"part"}`} t={{}} bucket="cars_parts"/>
        <ExtraPhotosStrip photos={f.photos} onChange={photos=>s("photos",photos)} sku={`${supplierCode}-${f.part_code||"part"}`}
          autosave={isEdit?(newPhotos=>api.patch("supplier_parts","id",f.id,{photos:newPhotos})):undefined}
          onOpenLightbox={i=>setLightbox({idx:f.image_url?i+1:i})}
          onMakeCover={extraIdx=>{
            const newCover=f.photos[extraIdx];
            if(!newCover) return;
            setF(p=>({...p, image_url:newCover, photos:[...(p.image_url?[p.image_url]:[]), ...p.photos.filter((_,i)=>i!==extraIdx)]}));
          }}/>
        {lightbox&&(
          <ImgLightbox urls={[f.image_url,...f.photos].filter(Boolean)} startIdx={lightbox.idx} onClose={()=>setLightbox(null)}/>
        )}
      </FD>

      {isEdit&&(
        <div style={{marginBottom:14,padding:"10px 14px",borderRadius:8,fontSize:12,
          background:part.price?"rgba(52,211,153,.08)":"rgba(251,191,36,.08)",
          border:`1px solid ${part.price?"rgba(52,211,153,.3)":"rgba(251,191,36,.3)"}`,
          color:part.price?"var(--green)":"var(--yellow)"}}>
          {part.price
            ? `✅ Live — customers see this at ${fmtAmt(part.price)}`
            : "⏳ Awaiting pricing — not visible to customers until priced"}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        {onDelete&&<button className="btn btn-ghost" style={{color:"var(--red)",borderColor:"rgba(239,68,68,.3)"}}
          onClick={()=>{if(window.confirm(`Delete ${supplierCode}-${f.part_code}?`)) onDelete();}}>🗑</button>}
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={!canSave||saving} onClick={async()=>{setSaving(true);try{await onSave(f);}finally{setSaving(false);}}}>{saving?"Saving…":"Save"}</button>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: SUPPLIER PRICING — set the customer-facing price/markup on parts
// suppliers have self-added (across every supplier). A part stays invisible
// to customers until it has a price here.
// ═══════════════════════════════════════════════════════════════
export function SupplierPricingPage({allParts=[], suppliers=[], onSetPrice, costUpdates=[], onDismissCostUpdate, onGoToPart, onBulkApproveCostUpdates, onRefresh}) {
  const [filter, setFilter] = useState(costUpdates.length?"costUpdates":"pending"); // "pending" | "all" | "costUpdates"
  const supName=(id)=>suppliers.find(s=>String(s.id)===String(id))?.name||`#${id}`;
  const supCode=(id)=>{const s=suppliers.find(s=>String(s.id)===String(id));return s?.code||s?.name||"";};
  const rows=filter==="pending"?allParts.filter(p=>!p.price):allParts;
  const [drafts, setDrafts] = useState({}); // {id: draftPriceString}
  const [selectedCostUpdates, setSelectedCostUpdates] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const toggleCostUpdateSelect=(id)=>setSelectedCostUpdates(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});
  // Which supplier's cost updates to work through — "__all__" or one supplier at a
  // time, so admin can bulk-approve just one supplier's batch, or go row by row.
  const [costUpdateSupplier, setCostUpdateSupplier] = useState("__all__");
  const costUpdateSupplierOptions=[...new Set(costUpdates.map(l=>String(l.supplier_id)))]
    .map(id=>({id,name:supName(id),count:costUpdates.filter(l=>String(l.supplier_id)===id).length}))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const visibleCostUpdates=costUpdateSupplier==="__all__"?costUpdates:costUpdates.filter(l=>String(l.supplier_id)===costUpdateSupplier);

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💰 Supplier Pricing</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{allParts.filter(p=>!p.price).length} awaiting pricing · {costUpdates.length} cost update{costUpdates.length!==1?"s":""} to review</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--border)",marginBottom:16}}>
        {[["costUpdates",`Cost Updates (${costUpdates.length})`],["pending","Awaiting Pricing"],["all","All Self-Added"]].map(([id,lb])=>(
          <button key={id} className={`auth-tab ${filter===id?"on":""}`} onClick={()=>setFilter(id)}>{lb}</button>
        ))}
      </div>

      {filter==="costUpdates"&&(
        costUpdates.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No cost price updates waiting on review 🎉</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:2}}>Suppliers updated their cost on these parts — check if the selling price still makes sense.</div>
            {costUpdateSupplierOptions.length>1&&(
              <div style={{marginBottom:2}}>
                <select className="inp" style={{width:"auto",minWidth:220}} value={costUpdateSupplier}
                  onChange={e=>{setCostUpdateSupplier(e.target.value);setSelectedCostUpdates(new Set());}}>
                  <option value="__all__">All Suppliers ({costUpdates.length})</option>
                  {costUpdateSupplierOptions.map(s=>(
                    <option key={s.id} value={s.id}>{s.name} ({s.count})</option>
                  ))}
                </select>
              </div>
            )}
            {onBulkApproveCostUpdates&&(
              <div className="card" style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:2}}>
                <div style={{fontSize:13,fontWeight:700}}>{selectedCostUpdates.size} selected</div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedCostUpdates(new Set(visibleCostUpdates.map(l=>l.id)))}>Select All ({visibleCostUpdates.length})</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setSelectedCostUpdates(new Set())} disabled={!selectedCostUpdates.size}>Clear</button>
                <div style={{flex:1,minWidth:8}}/>
                <button type="button" className="btn btn-primary btn-sm" disabled={!selectedCostUpdates.size||approving}
                  onClick={async()=>{
                    setApproving(true);
                    const links=costUpdates.filter(l=>selectedCostUpdates.has(l.id));
                    await onBulkApproveCostUpdates(links);
                    setApproving(false);
                    setSelectedCostUpdates(new Set());
                  }}>
                  {approving?"Approving…":`✅ Approve ${selectedCostUpdates.size||""} Selected`}
                </button>
              </div>
            )}
            {visibleCostUpdates.length===0&&(
              <div className="card" style={{padding:32,textAlign:"center",color:"var(--text3)"}}>No cost updates from this supplier.</div>
            )}
            {visibleCostUpdates.map(l=>(
              <div key={l.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center"}}>
                {onBulkApproveCostUpdates&&(
                  <input type="checkbox" checked={selectedCostUpdates.has(l.id)} onChange={()=>toggleCostUpdateSelect(l.id)} style={{width:18,height:18,flexShrink:0,cursor:"pointer"}}/>
                )}
                <div style={{width:48,height:48,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {l._part?.image_url
                    ? <img src={toImgUrl(l._part.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{l._part?.sku||`#${l.part_id}`}</div>
                  <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l._part?.name||"—"}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{supName(l.supplier_id)}</div>
                </div>
                <div style={{fontSize:12,color:"var(--text3)",textAlign:"right",flexShrink:0}}>
                  Selling price<br/><strong style={{color:"var(--text2)"}}>{l._part?.price?fmtAmt(l._part.price):"—"}</strong>
                </div>
                <div style={{fontSize:12,color:"var(--blue)",textAlign:"right",flexShrink:0}}>
                  New supplier cost<br/><strong>{l.supplier_price?fmtAmt(l.supplier_price):"—"}</strong>
                </div>
                {l.suggested_price&&(
                  <div style={{fontSize:12,color:"var(--green)",textAlign:"right",flexShrink:0}}>
                    Supplier suggests<br/><strong>{fmtAmt(l.suggested_price)}</strong>
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                  {onGoToPart&&<button className="btn btn-primary btn-sm" onClick={()=>onGoToPart(l)}>✏️ Update Price</button>}
                  <button className="btn btn-ghost btn-sm" onClick={()=>onDismissCostUpdate(l.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {(filter==="pending"||filter==="all")&&(
        rows.length===0 ? (
          <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
            {filter==="pending"?"Nothing waiting on a price 🎉":"No supplier-added parts yet."}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rows.map(p=>(
              <div key={p.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:48,height:48,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {p.image_url
                    ? <img src={toImgUrl(p.image_url)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:13}}>{supCode(p.supplier_id)}-{p.part_code}</div>
                  <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{supName(p.supplier_id)}{(p.make||p.model)?` · ${[p.make,p.model,p.year_range].filter(Boolean).join(" ")}`:""}</div>
                </div>
                <div style={{fontSize:12,color:"var(--text3)",textAlign:"right",flexShrink:0}}>
                  Cost<br/><strong style={{color:"var(--text2)"}}>{p.cost_price?fmtAmt(p.cost_price):"—"}</strong>
                  {p.suggested_price&&<div style={{color:"var(--green)",marginTop:2}}>Suggests: <strong>{fmtAmt(p.suggested_price)}</strong></div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <input className="inp" type="number" style={{width:100}} placeholder="Set price"
                    value={drafts[p.id]??p.price??p.suggested_price??""}
                    onChange={e=>setDrafts(d=>({...d,[p.id]:e.target.value}))}/>
                  <button className="btn btn-primary btn-sm"
                    disabled={!String(drafts[p.id]??p.price??p.suggested_price??"").trim()}
                    onClick={()=>onSetPrice(p.id,+(drafts[p.id]??p.price??p.suggested_price)||0)}>
                    {p.price?"Update":"Set Live"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER: MY QUERIES — customer questions against either this supplier's own
// self-added parts (matched via supplier_part_id, looked up in selfParts) or
// existing-catalogue parts they're linked to (matched via part_id, looked up
// in existingParts) — resolved live from already-loaded state rather than a
// submission-time snapshot, so image/OE/make/model/year always reflect the
// current part and work for queries submitted before this lookup existed.
// ═══════════════════════════════════════════════════════════════
export function SupplierQueriesPage({queries=[], existingParts=[], selfParts=[], onReply, onRefresh}) {
  const [replying, setReplying] = useState(null); // query row being replied to
  const resolvePart=(q)=>{
    if(q.part_id) return existingParts.find(p=>String(p.id)===String(q.part_id))||null;
    if(q.supplier_part_id) return selfParts.find(p=>String(p.id)===String(q.supplier_part_id))||null;
    return null;
  };

  return (
    <div className="fu">
      {replying&&<SupplierQueryReplyModal query={replying} part={resolvePart(replying)}
        onReply={async(id,data)=>{await onReply(id,data);setReplying(null);}}
        onClose={()=>setReplying(null)}/>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>💬 My Queries</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{queries.filter(q=>q.status==="pending").length} pending · {queries.length} total</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      {queries.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No queries yet.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {queries.map(q=>{
            const p=resolvePart(q);
            const img=p?.image_url||q.part_image;
            return (
            <div key={q.id} className="card card-hover" style={{padding:14,cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}} onClick={()=>setReplying(q)}>
              <div style={{width:44,height:44,borderRadius:6,overflow:"hidden",background:"var(--surface2)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {img
                  ? <img src={toImgUrl(img)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                  : <span style={{fontSize:18,opacity:.3}}>🖼</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{q.part_name}</div>
                  {q.part_sku&&<div style={{fontSize:12,color:"var(--blue)",fontFamily:"DM Mono,monospace"}}>{q.part_sku}</div>}
                  {(p?.make||p?.model)&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{[p.make,p.model,p.year_range].filter(Boolean).join(" · ")}</div>}
                  <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>👤 {q.customer_name} · 📞 {q.customer_phone} · Qty: {q.qty_requested}</div>
                  {q.notes&&<div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginTop:4}}>"{q.notes}"</div>}
                </div>
                <StatusBadge status={q.status}/>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER: MY CUSTOMERS — customers who registered through this supplier's own
// ?catalog= link. Lets the supplier pick who among them gets a discount and how
// much, per customer, on top of the blanket default set in the Customer Discount
// card back on My Parts. Only customers actually scoped to this supplier show up
// here — never another supplier's or the main shop's customers.
// ═══════════════════════════════════════════════════════════════
// maxDiscountPct here is this supplier's OWN self-set ceiling — never shared with
// or affected by any other supplier. shopWideCap is admin's optional shop-wide
// outer bound (0 = none); the effective cap for per-customer overrides is
// whichever of the two is set and more restrictive.
export function SupplierCustomersPage({customers=[], defaultDiscountPct=0, maxDiscountPct=0, shopWideCap=0, onUpdateDiscount, onUpdateDefaultDiscount, onUpdateMaxDiscount, onRefresh}) {
  const [editingId, setEditingId] = useState(null);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const effectiveCap=(()=>{
    if(maxDiscountPct>0&&shopWideCap>0) return Math.min(maxDiscountPct,shopWideCap);
    return maxDiscountPct>0?maxDiscountPct:shopWideCap;
  })();
  const hasCap=effectiveCap>0;
  const startEdit=(c)=>{setVal(c.discount_pct!=null?String(c.discount_pct):"");setEditingId(c.id);};
  const save=async(id)=>{
    setSaving(true);
    const pct=val.trim()===""?null:Math.max(0,Math.min(hasCap?effectiveCap:100,+val||0));
    await onUpdateDiscount(id,pct);
    setSaving(false);setEditingId(null);
  };
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🎁 My Customers</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>
            {customers.length} registered through your catalogue link
          </p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      {onUpdateDefaultDiscount&&<CustomerDiscountCard discountPct={defaultDiscountPct} maxDiscountPct={maxDiscountPct} shopWideCap={shopWideCap} onSave={onUpdateDefaultDiscount} onSaveMax={onUpdateMaxDiscount}/>}

      {customers.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>
          Nobody's registered through your catalogue link yet — share it from My Parts.
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {customers.map(c=>{
            const isOverride=c.discount_pct!=null;
            const effective=isOverride?c.discount_pct:(defaultDiscountPct||0);
            return (
              <div key={c.id} className="card" style={{padding:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{fontWeight:700,fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:1}}>📞 {c.phone}{c.email?` · ${c.email}`:""}</div>
                  <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{c.orders||0} order{c.orders!==1?"s":""} · {fmtAmt(c.total_spent||0)} spent</div>
                </div>
                {editingId===c.id ? (
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <input className="inp" type="number" min="0" max={hasCap?effectiveCap:100} style={{width:80}}
                      placeholder={String(defaultDiscountPct||0)} value={val} onChange={e=>setVal(e.target.value)} autoFocus/>
                    <span style={{fontSize:12,color:"var(--text3)"}}>%</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditingId(null)} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={()=>save(c.id)} disabled={saving}>{saving?"Saving…":"💾 Save"}</button>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:800,color:effective>0?"var(--green)":"var(--text3)",fontFamily:"Rajdhani,sans-serif"}}>{effective}% off</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{isOverride?"Custom":"Default"}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={()=>startEdit(c)}>✏️ Edit</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SupplierQueryReplyModal({query, part, onReply, onClose}) {
  const img=part?.image_url||query.part_image;
  const [price,setPrice]=useState(query?.confirmed_price||"");
  const [qty,setQty]=useState(query?.confirmed_qty||"");
  const [notes,setNotes]=useState(query?.reply_notes||"");
  const [saving,setSaving]=useState(false);
  const [lightbox,setLightbox]=useState(false);
  const handle=async()=>{
    setSaving(true);
    await onReply(query.id,{
      confirmed_price:price?+price:null, confirmed_qty:qty?+qty:null,
      reply_notes:notes, status:"replied", replied_at:new Date().toISOString(),
    });
    setSaving(false);
  };
  return (
    <Overlay onClose={onClose}>
      <MHead title="Reply to Query" sub={`${query.customer_name} — ${query.part_name}`} onClose={onClose}/>
      {lightbox&&img&&<ImgLightbox url={toImgUrl(img)} onClose={()=>setLightbox(false)}/>}
      <div style={{background:"var(--surface2)",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:13,display:"flex",gap:12}}>
        <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",background:"var(--surface3)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:img?"zoom-in":"default"}}
          onClick={()=>img&&setLightbox(true)} title={img?"Click to enlarge":undefined}>
          {img
            ? <img src={toImgUrl(img)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
            : <span style={{fontSize:22,opacity:.3}}>🖼</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          {query.part_sku&&<div style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:"var(--blue)"}}>{query.part_sku}</div>}
          {part?.oe_number&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>OE: {part.oe_number}</div>}
          {(part?.make||part?.model)&&<div style={{color:"var(--text3)",fontSize:12,marginTop:1}}>{[part.make,part.model,part.year_range].filter(Boolean).join(" · ")}</div>}
          <div style={{marginTop:6}}>👤 {query.customer_name} · 📞 {query.customer_phone}</div>
          <div style={{marginTop:2}}>🔢 Requested qty: <strong>{query.qty_requested}</strong></div>
        </div>
      </div>
      {query.notes&&<div style={{marginTop:-8,marginBottom:14,color:"var(--text3)",fontStyle:"italic",fontSize:13}}>"{query.notes}"</div>}
      <FG cols="1fr 1fr">
        <div><FL label="Confirmed Price"/><input className="inp" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Unit price"/></div>
        <div><FL label="Confirmed Qty"/><input className="inp" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Available qty"/></div>
      </FG>
      <FD><FL label="Notes to customer"/><textarea className="inp" value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></FD>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving} onClick={handle}>{saving?"Sending…":"Send Reply"}</button>
      </div>
    </Overlay>
  );
}

// Editing name/OE/fitment on a catalogue-linked (shared parts table) line from
// Receive Stock — unlike a self-added part, this record is shared with admin and
// every other supplier of the same part, so it's called out clearly here. Cost/
// price/stock/photos aren't included: those stay on this supplier's own
// part_suppliers link row / the dedicated Cost Price flow, untouched by this.
function CatalogFitmentEditModal({part, onSave, onClose}) {
  const [name, setName] = useState(part.name||"");
  const [oe, setOe] = useState(part.oe_number||"");
  const [make, setMake] = useState(part.make||"");
  const [model, setModel] = useState(part.model||"");
  const [yearRange, setYearRange] = useState(part.year_range||"");
  const [saving, setSaving] = useState(false);
  return (
    <Overlay onClose={onClose}>
      <MHead title="Edit Catalogue Part" sub={part.sku} onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14,padding:"8px 12px",borderRadius:8,background:"rgba(251,191,36,.08)",border:"1px solid rgba(251,191,36,.3)"}}>
        ⚠️ This is a shared MotorDesk catalogue part — saving here updates the master listing that admin and every supplier of this part see, not just your own copy.
      </div>
      <FD><FL label="Name *"/><input className="inp" value={name} onChange={e=>setName(e.target.value)} autoFocus/></FD>
      <FD><FL label="OE Number"/><input className="inp" style={{fontFamily:"DM Mono,monospace"}} value={oe} onChange={e=>setOe(e.target.value.toUpperCase())}/></FD>
      <FG cols="1fr 1fr 1fr">
        <div><FL label="Make"/><input className="inp" value={make} onChange={e=>setMake(e.target.value.toUpperCase())} placeholder="BMW, TOYOTA…"/></div>
        <div><FL label="Model"/><input className="inp" value={model} onChange={e=>setModel(e.target.value.toUpperCase())} placeholder="G30, HILUX…"/></div>
        <div><FL label="Year Range"/><input className="inp" value={yearRange} onChange={e=>setYearRange(e.target.value)} placeholder="2018-2023"/></div>
      </FG>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} disabled={saving||!name.trim()}
          onClick={async()=>{setSaving(true);const ok=await onSave({id:part.id,name,oe_number:oe,make,model,year_range:yearRange});setSaving(false);if(ok)onClose();}}>
          {saving?"Saving…":"Save"}
        </button>
      </div>
    </Overlay>
  );
}

// Supplier receiving stock onto their own shelf (their own purchase invoice —
// separate from admin's supplier_invoices, which is MotorDesk stocking parts IN
// from a supplier, the opposite direction). Each line gets its own bin location
// (defaulting to whatever's already on file for that part) and, on save, one
// printed label per physical unit sequenced 1/N..N/N (see saveSupplierPurchaseInvoice).
function SupplierPurchaseInvoiceModal({existingParts, ownParts, supplierCode="", marginOptions=null, editingInvoice=null, editingItems=[], onSave, onQuickAddPart, onUpdatePart, onUpdateCatalogPart, onCancel}) {
  // Resolves a thumbnail for a continued invoice's already-saved lines, by
  // matching back to the same stock row (part_suppliers/supplier_parts) they were
  // added from — invoice_items itself doesn't store an image.
  // supplier_part_id round-trips through a text column in the invoice-items table,
  // so a continued invoice's targetId comes back as a string while supplier_parts.id
  // is numeric — compare as strings everywhere they're matched against ownParts.
  const fullRecordFor=(sourceType,targetId)=>sourceType==="catalogue"
    ? existingParts.find(p=>String(p._linkId)===String(targetId))
    : ownParts.find(p=>String(p.id)===String(targetId));
  const imageFor=(sourceType,targetId)=>fullRecordFor(sourceType,targetId)?.image_url;
  const extraPhotosFor=(sourceType,targetId)=>parseJsonArray(fullRecordFor(sourceType,targetId)?.photos);

  const [invoiceNo, setInvoiceNo] = useState(editingInvoice?.invoice_no||"");
  const [invoiceDate, setInvoiceDate] = useState(()=>editingInvoice?.invoice_date||new Date().toISOString().slice(0,10));
  const [fromName, setFromName] = useState(editingInvoice?.from_name||"");
  const [shippingCost, setShippingCost] = useState(editingInvoice?.shipping_cost?String(editingInvoice.shipping_cost):"");
  const [customsCostUsd, setCustomsCostUsd] = useState(editingInvoice?.customs_cost_usd?String(editingInvoice.customs_cost_usd):"");
  const [exchangeRate, setExchangeRate] = useState(editingInvoice?.exchange_rate!=null?String(editingInvoice.exchange_rate):"");
  const [invoiceTotal, setInvoiceTotal] = useState(editingInvoice?.invoice_total!=null?String(editingInvoice.invoice_total):"");
  // Default OFF when continuing an existing invoice — the original items were most
  // likely already labelled once; check the box back on to reprint everything.
  const [printLabels, setPrintLabels] = useState(!editingInvoice);
  const [notes, setNotes] = useState(editingInvoice?.notes||"");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(()=>editingItems.map(it=>{
    const targetId=it.source_type==="catalogue"?it.part_suppliers_id:it.supplier_part_id;
    return {sourceType:it.source_type, targetId, partId:it.part_id||null, name:it.part_name, sku:it.sku||"",
      image:imageFor(it.source_type,targetId), extraPhotos:extraPhotosFor(it.source_type,targetId),
      qty:it.qty, unitCost:+it.unit_cost||0, binLocation:it.bin_location||""};
  })); // {sourceType,targetId,partId?,name,sku,image,extraPhotos,qty,unitCost,binLocation}
  const [zoomImage, setZoomImage] = useState(null); // {images,title}
  const imagesFor=(it)=>[it.image,...(it.extraPhotos||[])].filter(Boolean).map(toImgUrl);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newPartCode, setNewPartCode] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newPartCost, setNewPartCost] = useState("");
  const [newPartSuggestedPrice, setNewPartSuggestedPrice] = useState("");
  const [newPartOe, setNewPartOe] = useState("");
  const [newPartMake, setNewPartMake] = useState("");
  const [newPartModel, setNewPartModel] = useState("");
  const [newPartYearRange, setNewPartYearRange] = useState("");
  const [addingNewSaving, setAddingNewSaving] = useState(false);
  const [editingItemIdx, setEditingItemIdx] = useState(null); // index into items[] whose full Edit Part modal is open, or null
  // A big shipment can add dozens of lines — page the rendered rows so the modal
  // doesn't turn into one giant scroll. Totals below always sum the FULL items
  // array regardless of which page is showing.
  const ITEMS_PAGE_SIZE=8;
  const [itemsPage, setItemsPage] = useState(0);
  const itemsTotalPages=Math.max(1,Math.ceil(items.length/ITEMS_PAGE_SIZE));
  const itemsCurPage=Math.min(itemsPage,itemsTotalPages-1);

  const pool = [
    ...existingParts.map(p=>({sourceType:"catalogue", targetId:p._linkId, partId:p.id, name:p.name, sku:p.sku, image:p.image_url, extraPhotos:parseJsonArray(p.photos), currentBin:p._supplierBinLocation||"",
      blob:searchBlob(p,p.sku)})),
    ...ownParts.map(p=>({sourceType:"own", targetId:p.id, partId:null, name:p.name, sku:supplierCode?`${supplierCode}-${p.part_code}`:p.part_code, image:p.image_url, extraPhotos:parseJsonArray(p.photos), currentBin:p.bin_location||"",
      blob:searchBlob(p,p.part_code)})),
  ];
  const keywords=search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered=keywords.length?pool.filter(p=>matchesSearch(p.blob,keywords)):[];

  // Picking a part already on this invoice doesn't silently merge OR silently
  // duplicate — jump to the existing line and ask, since a second unit at a
  // different cost (a new box in the same shipment, priced differently) is a
  // real separate line, not the same qty.
  const [dupPrompt, setDupPrompt] = useState(null); // {idx, p} — p is the just-picked search result
  const [flashIdx, setFlashIdx] = useState(null);
  const itemRefs = useRef({});
  useEffect(()=>{
    if(flashIdx==null) return;
    itemRefs.current[flashIdx]?.scrollIntoView({behavior:"smooth",block:"center"});
    const t=setTimeout(()=>setFlashIdx(f=>f===flashIdx?null:f),1800);
    return ()=>clearTimeout(t);
  },[flashIdx,itemsCurPage]);

  const addItem=(p, {forceNew=false}={})=>{
    if(!forceNew){
      // Match by SKU, not sourceType+targetId — a part migrated from the shared
      // catalogue into its own supplier_parts row (see the MCK cleanup) gets a
      // brand-new id and "own" sourceType, but a pending invoice line saved
      // before that migration still remembers the old catalogue identity. The
      // SKU is the one thing that stays the same across that move.
      const exIdx=items.findIndex(i=>i.sku&&p.sku&&i.sku.toUpperCase()===p.sku.toUpperCase());
      if(exIdx!==-1){
        setItemsPage(Math.floor(exIdx/ITEMS_PAGE_SIZE));
        setDupPrompt({idx:exIdx, p});
        setFlashIdx(exIdx);
        setSearch("");
        return;
      }
    }
    setItems(prev=>{
      const next=[...prev,{sourceType:p.sourceType,targetId:p.targetId,partId:p.partId,name:p.name,sku:p.sku,image:p.image,extraPhotos:p.extraPhotos,qty:1,unitCost:0,binLocation:p.currentBin}];
      setItemsPage(Math.max(0,Math.ceil(next.length/ITEMS_PAGE_SIZE)-1)); // jump to the page holding the new line so it's visible
      return next;
    });
    setSearch("");
  };
  const updateItem=(idx,patch)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,...patch}:it));
  const removeItem=(idx)=>setItems(prev=>prev.filter((_,i)=>i!==idx));
  // Print just this one line's labels right now, using whatever qty/bin is
  // currently typed — doesn't touch the invoice save/stock flow at all, so a
  // supplier can reprint or print-as-they-go without saving the whole invoice.
  const printItemLabel=(it)=>{
    const qty=Math.max(1,+it.qty||1);
    const labels=[];
    for(let i=1;i<=qty;i++){
      labels.push({sku:it.sku,name:it.name,binLocation:it.binLocation?.trim()||"",invoiceNo:invoiceNo||"",seq:qty>1?`${i}/${qty}`:""});
    }
    const settings=getSettings();
    openPartLabelsWindow(labels,{widthMm:settings?.part_label_w||98,heightMm:settings?.part_label_h||45,shopName:settings?.shop_name||""});
  };
  const totalQty=items.reduce((s,it)=>s+it.qty,0);
  const itemsTotal=items.reduce((s,it)=>s+it.qty*(+it.unitCost||0),0);
  const shippingNum=+shippingCost||0;
  const customsLocal=(+customsCostUsd||0)*(+exchangeRate||0);
  const total=itemsTotal+shippingNum+customsLocal;

  const exportCsv=()=>{
    const header=["SKU","Name","Qty","Unit Cost","Bin Location"];
    const rows=items.map(it=>[it.sku,it.name,it.qty,it.unitCost,it.binLocation]);
    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`${(invoiceNo||"invoice").replace(/[^a-z0-9-_]+/gi,"_")}-items.csv`;
    a.click();
  };

  // A printable PDF (via the browser's own print-to-PDF, same trick the label
  // printer uses) with each part's photo alongside its fitment/bin/price — useful
  // as a physical sheet. Two modes share the same layout: "cost" is the internal
  // receiving/packing-list view (unit cost + bin location); "sell" is the
  // customer/admin-facing price list (suggested retail price, no cost, no bin —
  // that's warehouse-internal info that shouldn't go out with a price sheet).
  const exportPdf=(mode="cost")=>{
    const win=window.open("","_blank","width=900,height=700");
    if(!win) return;
    const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const sellPriceFor=it=>{
      const full=fullRecordFor(it.sourceType,it.targetId);
      return it.sourceType==="catalogue"?full?._suggestedPrice:full?.suggested_price;
    };
    const rows=items.map(it=>{
      const full=fullRecordFor(it.sourceType,it.targetId);
      const fitment=[[full?.make,full?.model].filter(Boolean).join(" "),full?.year_range].filter(Boolean).join(" · ");
      const img=it.image?toImgUrl(it.image):"";
      const imgFull=it.image?(toFullUrl(it.image)||it.image):"";
      const priceCell=mode==="sell"
        ? (sellPriceFor(it)?fmtAmt(sellPriceFor(it)):"—")
        : fmtAmt(it.unitCost);
      return `<tr>
        <td class="img-cell">${img?`<a href="${esc(imgFull)}" target="_blank" rel="noopener"><img src="${esc(img)}" onerror="this.style.display='none'"/></a>`:""}</td>
        <td><div class="pname">${esc(it.name)}</div><div class="psku">${esc(it.sku)}</div>${fitment?`<div class="pfit">🚗 ${esc(fitment)}</div>`:""}</td>
        <td class="num">${it.qty}</td>
        <td class="num">${priceCell}</td>
        ${mode==="cost"?`<td>${esc(it.binLocation)||"—"}</td>`:""}
      </tr>`;
    }).join("");
    const priceHeader=mode==="sell"?"Sell Price":"Unit Cost";
    const grandTotal=mode==="sell"
      ? items.reduce((s,it)=>s+it.qty*(+sellPriceFor(it)||0),0)
      : itemsTotal;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(invoiceNo||"Purchase Invoice")}${mode==="sell"?" - Price List":""}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;padding:24px;color:#111}
      .print-btn{padding:9px 24px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:16px}
      h1{font-size:18px;margin-bottom:2px}.sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;padding:8px;border:1px solid #ddd}
      td{padding:8px;border:1px solid #ddd;font-size:13px;vertical-align:middle}
      .img-cell{width:60px}.img-cell img{width:50px;height:50px;object-fit:contain;cursor:zoom-in}
      .pname{font-weight:700}.psku{color:#dc2626;font-family:monospace;font-weight:700}.pfit{color:#2563eb;font-size:11px;margin-top:2px}
      .num{text-align:right;font-weight:700}
      @media print{.print-btn{display:none}}
    </style></head><body>
      <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
      <h1>${esc(invoiceNo||"Purchase Invoice")}${mode==="sell"?" — Price List":""}${fromName?` — ${esc(fromName)}`:""}</h1>
      <div class="sub">${esc(invoiceDate)} · ${items.reduce((s,it)=>s+it.qty,0)} units · ${fmtAmt(grandTotal)}</div>
      <table>
        <thead><tr><th></th><th>Part</th><th>Qty</th><th>${priceHeader}</th>${mode==="cost"?"<th>Bin Location</th>":""}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;
    win.document.write(html);
    win.document.close();
  };

  // Unpacking a shipment often turns up something not in the catalogue yet —
  // this lets the supplier add it right here (a minimal supplier_parts row) and
  // drop straight into this invoice as a line, instead of a separate trip to My
  // Parts first and then back here to actually receive the stock.
  const openAddNew=()=>{
    setNewPartCode(search.toUpperCase()); setNewPartName(""); setNewPartCost(""); setNewPartSuggestedPrice("");
    setNewPartOe(""); setNewPartMake(""); setNewPartModel(""); setNewPartYearRange("");
    setAddingNew(true);
  };
  // Same quick-markup-% pattern as the full My Parts add form (resolveMarginOptions
  // + suggestPriceAt, top of file) — lets a sell price be set right here instead of
  // needing a separate trip to My Parts afterward.
  const newPartMarginOptions=resolveMarginOptions({supplierOptions:marginOptions});
  const submitNewPart=async()=>{
    if(!newPartCode.trim()||!newPartName.trim()||!onQuickAddPart) return;
    setAddingNewSaving(true);
    const row=await onQuickAddPart({partCode:newPartCode,name:newPartName,costPrice:newPartCost,suggestedPrice:newPartSuggestedPrice,
      oeNumber:newPartOe,make:newPartMake,model:newPartModel,yearRange:newPartYearRange});
    setAddingNewSaving(false);
    if(row){
      setItems(prev=>{
        const next=[...prev,{sourceType:"own",targetId:row.id,partId:null,name:row.name,sku:supplierCode?`${supplierCode}-${row.part_code}`:row.part_code,image:row.image_url,qty:1,unitCost:+newPartCost||0,binLocation:""}];
        setItemsPage(Math.max(0,Math.ceil(next.length/ITEMS_PAGE_SIZE)-1));
        return next;
      });
      setAddingNew(false); setSearch("");
    }
  };

  const submit=()=>{
    // A big invoice saves one line at a time (awaited sequentially) before labels
    // are ready — by then the browser no longer treats window.open() as tied to
    // this click, and silently blocks it. Reserve the tab HERE, still inside the
    // synchronous click handler, and hand it to onSave to fill in once it's done.
    // Leave it blank rather than document.write()-ing a placeholder here — writing
    // into this window TWICE (placeholder now, real labels later) is exactly the
    // kind of thing that can silently misbehave; setting just the title needs no
    // write()/close() at all, so the one real write below is the only one ever
    // made into this window.
    const labelWin=printLabels?window.open("","_blank","width=600,height=500"):null;
    if(labelWin) labelWin.document.title="Preparing labels…";
    (async()=>{
      setSaving(true);
      await onSave({invoiceId:editingInvoice?.id||null,invoiceNo,invoiceDate,fromName,notes,shippingCost,customsCostUsd,exchangeRate,invoiceTotal,printLabels,items,labelWin});
      setSaving(false);
    })();
  };

  // Guard every way out of this modal (backdrop click, ✕, Cancel) once there's
  // anything worth losing — an accidental tap on the edge shouldn't silently
  // discard a shipment that's half-typed in.
  const hasUnsavedWork=items.length>0||invoiceNo.trim()||fromName.trim()||notes.trim();
  const handleClose=()=>{
    if(hasUnsavedWork&&!window.confirm("You have unsaved items on this invoice. Close without saving?")) return;
    onCancel();
  };

  // Editing a self-added part's own details right from its line here — opens the
  // exact same full Edit Part modal as My Parts (photo tools, extra photos, OE/
  // fitment, cost + markup-%), so it's one consistent place to manage a part's
  // record instead of a second, thinner form. Only self-added ("own") lines are
  // editable this way; catalogue parts are admin-owned.
  const openEditItem=(idx)=>{
    if(items[idx].sourceType!=="own") return;
    setEditingItemIdx(idx);
  };
  const editingFullPart=(()=>{
    if(editingItemIdx==null) return null;
    const it=items[editingItemIdx];
    // Best-effort fallback if a part added moments ago hasn't round-tripped back
    // through the parent's reload yet — still opens, just mostly blank.
    return ownParts.find(p=>String(p.id)===String(it.targetId))
      || {id:it.targetId, part_code:it.sku?.replace(new RegExp(`^${supplierCode}-`,"i"),"")||"", name:it.name, photos:"[]"};
  })();

  // Catalogue-linked lines: a lighter fitment-only edit, since the record is
  // shared with admin and every other supplier — see CatalogFitmentEditModal.
  const [editingCatalogIdx, setEditingCatalogIdx] = useState(null);
  const editingCatalogPart=editingCatalogIdx==null ? null
    : existingParts.find(p=>String(p._linkId)===String(items[editingCatalogIdx].targetId))
      || {id:items[editingCatalogIdx].partId, sku:items[editingCatalogIdx].sku, name:items[editingCatalogIdx].name};

  return (
    <Overlay onClose={handleClose}>
      <MHead title={editingInvoice?"📥 Continue Invoice":"📥 Receive Stock"} sub={editingInvoice?`Add more items to ${editingInvoice.invoice_no||editingInvoice.id}`:"Record a purchase invoice into your own stock"} onClose={handleClose}/>
      <div style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 14px 4px",marginBottom:16}}>
        <FG cols="1fr 1fr">
          <div><FL label="Invoice No"/><input className="inp" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></div>
          <div><FL label="Invoice Date"/><input className="inp" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></div>
        </FG>
        <FD><FL label="From (supplier)"/><input className="inp" value={fromName} onChange={e=>setFromName(e.target.value)}/></FD>
        <FG cols="1fr 1fr 1fr">
          <div><FL label="Shipping Cost"/><input className="inp" type="number" min="0" value={shippingCost} onChange={e=>setShippingCost(e.target.value)} placeholder="0"/></div>
          <div><FL label="Customs Cost (USD)"/><input className="inp" type="number" min="0" value={customsCostUsd} onChange={e=>setCustomsCostUsd(e.target.value)} placeholder="0"/></div>
          <div><FL label="Exchange Rate"/><input className="inp" type="number" min="0" step="0.0001" value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)} placeholder="e.g. 18.50"/></div>
        </FG>
      </div>
      <div style={{background:"rgba(249,115,22,.06)",border:"1px solid rgba(249,115,22,.25)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <FL label="➕ Add Item"/>
        <input className="inp" style={{marginTop:6}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your parts by name, SKU, OE…"/>
        {keywords.length>0&&(
          filtered.length>0 ? (
            <div style={{border:"1px solid var(--border)",borderRadius:8,marginTop:6,maxHeight:200,overflowY:"auto"}}>
              {filtered.slice(0,30).map(p=>(
                <div key={`${p.sourceType}-${p.targetId}`} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border)"}}
                  onClick={()=>addItem(p)}>
                  <div style={{width:36,height:36,flexShrink:0,borderRadius:5,overflow:"hidden",background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                    {p.image
                      ? <img src={toImgUrl(p.image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                      : <span style={{fontSize:14,opacity:.3}}>🖼</span>}
                    {p.image&&(
                      <button type="button" title="Enlarge photo" onClick={e=>{e.stopPropagation();setZoomImage({images:imagesFor(p),title:p.name});}}
                        style={{position:"absolute",top:1,right:1,width:16,height:16,borderRadius:"50%",background:"rgba(0,0,0,.65)",border:"none",cursor:"zoom-in",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                        <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="20" y2="20"/></svg>
                      </button>
                    )}
                    {p.extraPhotos?.length>0&&(
                      <div title={`${p.extraPhotos.length} extra photo${p.extraPhotos.length>1?"s":""}`}
                        style={{position:"absolute",bottom:0,left:0,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:8,fontWeight:700,padding:"0 3px",borderRadius:4}}>
                        +{p.extraPhotos.length}
                      </div>
                    )}
                  </div>
                  <div><strong>{p.name}</strong> <span style={{color:"var(--text3)"}}>({p.sku})</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{marginTop:6}}>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:6}}>No parts match "{search}".</div>
              {onQuickAddPart&&!addingNew&&<button type="button" className="btn btn-ghost btn-sm" onClick={openAddNew}>➕ Add "{search}" as a new part</button>}
            </div>
          )
        )}
        {addingNew&&(
          <div style={{border:"1px solid var(--accent)",borderRadius:8,padding:10,marginTop:8}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>➕ New Part</div>
            <FG cols="1fr 1fr">
              <div><FL label={`Part Code * — will show as ${supplierCode||"SUP"}-${newPartCode.trim()||"…"}`}/><input className="inp" style={{fontFamily:"DM Mono,monospace"}} value={newPartCode} onChange={e=>setNewPartCode(e.target.value.toUpperCase())}/></div>
              <div>
                <FL label="Cost Price"/>
                <input className="inp" type="number" min="0" value={newPartCost} onChange={e=>setNewPartCost(e.target.value)}/>
                {+newPartCost>0&&(
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                    {newPartMarginOptions.map(m=>{
                      const suggested=suggestPriceAt(newPartCost,m);
                      const active=+newPartSuggestedPrice===suggested;
                      return (
                        <button key={m} type="button" onClick={()=>setNewPartSuggestedPrice(suggested)}
                          style={{fontSize:11,padding:"3px 9px",borderRadius:99,cursor:"pointer",fontWeight:600,
                            background:active?"var(--accent)":"var(--surface2)",
                            color:active?"#fff":"var(--text2)",
                            border:`1px solid ${active?"var(--accent)":"var(--border)"}`}}>
                          {m}%: {C()}{suggested.toLocaleString()}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </FG>
            {+newPartSuggestedPrice>0&&(
              <div style={{marginBottom:14,padding:"8px 12px",borderRadius:8,background:"rgba(249,115,22,.08)",border:"1px solid rgba(249,115,22,.3)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:11,fontWeight:600,color:"var(--text2)"}}>Suggested sell price for admin to review</span>
                <span style={{fontSize:16,fontWeight:800,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif"}}>{C()}{(+newPartSuggestedPrice).toLocaleString()}</span>
              </div>
            )}
            <FD><FL label="Name *"/><input className="inp" value={newPartName} onChange={e=>setNewPartName(e.target.value)} autoFocus/></FD>
            <FD><FL label="OE Number"/><input className="inp" style={{fontFamily:"DM Mono,monospace"}} value={newPartOe} onChange={e=>setNewPartOe(e.target.value.toUpperCase())} placeholder="OE number / OEM reference"/></FD>
            <FG cols="1fr 1fr 1fr">
              <div><FL label="Make"/><input className="inp" value={newPartMake} onChange={e=>setNewPartMake(e.target.value.toUpperCase())} placeholder="BMW, TOYOTA…"/></div>
              <div><FL label="Model"/><input className="inp" value={newPartModel} onChange={e=>setNewPartModel(e.target.value.toUpperCase())} placeholder="G30, HILUX…"/></div>
              <div><FL label="Year Range"/><input className="inp" value={newPartYearRange} onChange={e=>setNewPartYearRange(e.target.value)} placeholder="2018-2023"/></div>
            </FG>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost btn-xs" onClick={()=>setAddingNew(false)}>Cancel</button>
              <button className="btn btn-primary btn-xs" onClick={submitNewPart} disabled={addingNewSaving||!newPartCode.trim()||!newPartName.trim()}>{addingNewSaving?"Adding…":"✅ Add & Insert"}</button>
            </div>
          </div>
        )}
      </div>
      {dupPrompt&&(()=>{
        const ex=items[dupPrompt.idx];
        if(!ex) return null;
        return (
          <div style={{background:"rgba(96,165,250,.08)",border:"1px solid rgba(96,165,250,.35)",borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:13}}>
              <strong>{ex.name}</strong> <span style={{color:"var(--text3)"}}>({ex.sku})</span> is already on this invoice — {ex.qty} × {C()}{ex.unitCost} unit cost.
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-primary btn-xs" onClick={()=>{updateItem(dupPrompt.idx,{qty:ex.qty+1});setFlashIdx(dupPrompt.idx);setDupPrompt(null);}}>
                +1 Qty — same cost ({C()}{ex.unitCost})
              </button>
              <button className="btn btn-ghost btn-xs" onClick={()=>{addItem(dupPrompt.p,{forceNew:true});setDupPrompt(null);}}>
                ➕ Add as separate line — different cost this time
              </button>
              <button className="btn btn-ghost btn-xs" onClick={()=>setDupPrompt(null)}>Cancel</button>
            </div>
          </div>
        );
      })()}
      {items.length>0&&(
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <button type="button" className="btn btn-ghost btn-xs" onClick={()=>exportPdf("cost")}>📄 Export PDF</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={()=>exportPdf("sell")}>💰 Export PDF (Sell Price)</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={exportCsv}>📊 Export Excel</button>
        </div>
      )}
      {items.length>0&&(
        <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
          {items.map((it,idx)=>{
            if(idx<itemsCurPage*ITEMS_PAGE_SIZE||idx>=(itemsCurPage+1)*ITEMS_PAGE_SIZE) return null;
            return (
            <div key={idx} ref={el=>itemRefs.current[idx]=el} style={{border:`1px solid ${flashIdx===idx?"var(--accent)":"var(--border)"}`,borderRadius:8,padding:10,
              background:flashIdx===idx?"rgba(249,115,22,.08)":undefined,transition:"background .3s, border-color .3s"}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>
                {editingItemIdx!==idx&&<button className="btn btn-ghost btn-xs" onClick={()=>{if(window.confirm(`Remove ${it.name} from this invoice?`)) removeItem(idx);}}>✕</button>}
                <div style={{width:44,height:44,flexShrink:0,borderRadius:6,overflow:"hidden",background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:it.image?"zoom-in":"default"}}
                  onClick={()=>it.image&&setZoomImage({images:imagesFor(it),title:it.name})}>
                  {it.image
                    ? <img src={toImgUrl(it.image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    : <span style={{fontSize:16,opacity:.3}}>🖼</span>}
                  {it.image&&(
                    <div style={{position:"absolute",bottom:0,right:0,width:16,height:16,borderRadius:"50% 0 0 0",background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="20" y2="20"/></svg>
                    </div>
                  )}
                  {it.extraPhotos?.length>0&&(
                    <div title={`${it.extraPhotos.length} extra photo${it.extraPhotos.length>1?"s":""}`}
                      style={{position:"absolute",top:0,left:0,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:8,fontWeight:700,padding:"0 3px",borderRadius:"0 0 4px 0"}}>
                      +{it.extraPhotos.length}
                    </div>
                  )}
                </div>
                <div style={{flex:"1 1 160px",alignSelf:"center"}}>
                  <div style={{fontSize:13,fontWeight:600}}>{it.name}</div>
                  <div style={{fontSize:15,fontWeight:700,color:"var(--red)",fontFamily:"DM Mono,monospace",marginTop:2}}>{it.sku}</div>
                  {(()=>{
                    const full=fullRecordFor(it.sourceType,it.targetId);
                    if(!full?.make&&!full?.model&&!full?.year_range) return null;
                    return (
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                        {full?.make&&<span style={{fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",border:"1px solid rgba(96,165,250,.3)",borderRadius:99,padding:"1px 7px"}}>🚗 {full.make}</span>}
                        {full?.model&&<span style={{fontSize:10,fontWeight:700,color:"var(--blue)",background:"rgba(96,165,250,.12)",border:"1px solid rgba(96,165,250,.3)",borderRadius:99,padding:"1px 7px"}}>{full.model}</span>}
                        {full?.year_range&&<span style={{fontSize:10,fontWeight:700,color:"var(--text3)",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:99,padding:"1px 7px"}}>{full.year_range}</span>}
                      </div>
                    );
                  })()}
                </div>
                <div><FL label="Qty"/><input className="inp" type="number" min="1" style={{width:70}} value={it.qty} onChange={e=>updateItem(idx,{qty:Math.max(1,+e.target.value||1)})}/></div>
                <div><FL label="Unit Cost"/><input className="inp" type="number" min="0" style={{width:90}} value={it.unitCost} onChange={e=>updateItem(idx,{unitCost:+e.target.value||0})}/></div>
                <div><FL label="Bin Location"/><input className="inp" style={{width:110}} value={it.binLocation} onChange={e=>updateItem(idx,{binLocation:e.target.value})} placeholder="e.g. A1-02"/></div>
                <button className="btn btn-ghost btn-xs" title="Print label(s) for this item now" onClick={()=>printItemLabel(it)}>🖨️ Print</button>
                {it.sourceType==="own"&&onUpdatePart&&(
                  <button className="btn btn-ghost btn-xs" onClick={()=>openEditItem(idx)}>✏️ Edit</button>
                )}
                {it.sourceType==="catalogue"&&onUpdateCatalogPart&&(
                  <button className="btn btn-ghost btn-xs" onClick={()=>setEditingCatalogIdx(idx)}>✏️ Edit</button>
                )}
              </div>
            </div>
            );
          })}
          {itemsTotalPages>1&&(
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:10,paddingTop:4}}>
              <button className="btn btn-ghost btn-xs" disabled={itemsCurPage===0} onClick={()=>setItemsPage(p=>Math.max(0,p-1))}>‹ Prev</button>
              <span style={{fontSize:12,color:"var(--text3)"}}>Page {itemsCurPage+1} of {itemsTotalPages} ({items.length} items)</span>
              <button className="btn btn-ghost btn-xs" disabled={itemsCurPage>=itemsTotalPages-1} onClick={()=>setItemsPage(p=>Math.min(itemsTotalPages-1,p+1))}>Next ›</button>
            </div>
          )}
        </div>
      )}
      {editingItemIdx!=null&&(
        <SupplierPartModal part={editingFullPart} supplierCode={supplierCode} supplierMarginOptions={marginOptions} ownParts={ownParts}
          onSave={async(data)=>{
            const ok=await onUpdatePart(data);
            if(ok){
              updateItem(editingItemIdx,{name:data.name, sku:supplierCode?`${supplierCode}-${data.part_code}`:data.part_code, image:data.image_url, extraPhotos:data.photos});
              setEditingItemIdx(null);
            }
            return ok;
          }}
          onClose={()=>setEditingItemIdx(null)}/>
      )}
      {editingCatalogIdx!=null&&(
        <CatalogFitmentEditModal part={editingCatalogPart}
          onSave={async(data)=>{
            const ok=await onUpdateCatalogPart(data);
            if(ok){ updateItem(editingCatalogIdx,{name:data.name}); setEditingCatalogIdx(null); }
            return ok;
          }}
          onClose={()=>setEditingCatalogIdx(null)}/>
      )}
      <FD><FL label="Notes"/><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)}/></FD>
      {items.length>0&&(()=>{
        const diff=+invoiceTotal===0||invoiceTotal===""?null:total-(+invoiceTotal||0);
        return (
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",marginBottom:14,display:"flex",flexDirection:"column",gap:4,fontSize:13}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--text3)"}}>Total Qty</span><span style={{fontWeight:700}}>{totalQty}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--text3)"}}>Items</span><span>{fmtAmt(itemsTotal)}</span></div>
          {shippingNum>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--text3)"}}>Shipping</span><span>{fmtAmt(shippingNum)}</span></div>}
          {customsLocal>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"var(--text3)"}}>Customs ({customsCostUsd} USD × {exchangeRate})</span><span>{fmtAmt(customsLocal)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:15,paddingTop:6,borderTop:"1px solid var(--border)"}}>
            <span>Total Landed Cost</span><span>{fmtAmt(total)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:6,borderTop:"1px solid var(--border)"}}>
            <span style={{color:"var(--text3)"}}>Invoice Total (from paper invoice)</span>
            <input className="inp" type="number" min="0" style={{width:110,textAlign:"right"}} value={invoiceTotal} onChange={e=>setInvoiceTotal(e.target.value)} placeholder="0"/>
          </div>
          {diff!==null&&(
            <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,color:Math.abs(diff)<0.01?"var(--green)":"var(--red)"}}>
              <span>Difference</span><span>{Math.abs(diff)<0.01?"✅ Matches":`${diff>0?"+":""}${fmtAmt(diff)}`}</span>
            </div>
          )}
        </div>
        );
      })()}
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,marginBottom:6,cursor:"pointer"}}>
        <input type="checkbox" checked={printLabels} onChange={e=>setPrintLabels(e.target.checked)}/>
        🖨️ Print labels after saving
      </label>
      <div style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
        This only records the invoice{printLabels?" and prints labels":""} — your stock stays unchanged until you count everything and click "Add Stock to System" on it back in Purchase Invoices.
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={handleClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={submit} disabled={saving||items.length===0}>{saving?"Saving…":printLabels?"✅ Save & Print Labels":"✅ Save Invoice"}</button>
      </div>
      {zoomImage&&<PartImageZoom images={zoomImage.images} title={zoomImage.title} onClose={()=>setZoomImage(null)}/>}
    </Overlay>
  );
}

// ═══ SUPPLIER-OWNED STOCK PAGES ═══
// Suppliers hold their own stock (qty + location) for both catalogue-linked parts
// (stock/bin_location on their part_suppliers link row, keyed by _linkId) and their
// own self-added parts (stock/bin_location directly on supplier_parts). Combined
// into one editable list here since a supplier doesn't care which table a part
// technically lives in — it's all "my stock" to them.
export function SupplierStockPage({existingParts=[], ownParts=[], supplierCode="", onSaveField, onZeroMainStock, onRefresh}) {
  const [editing, setEditing] = useState(null); // {sourceType,id}
  const [stockVal, setStockVal] = useState("");
  const [binVal, setBinVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [zeroing, setZeroing] = useState(false);

  // Detects this supplier's own SKU prefix (e.g. "MCK-") straight from their
  // catalogue SKUs — always accurate, unlike trusting supplierCode/user.supplier_code
  // alone, which falls back to the full company name (not the short prefix) whenever
  // suppliers.code is blank. Used both to prefix self-added parts' SKUs for display
  // (matching how My Parts already shows them) and to scope "Zero MotorDesk Stock".
  const detectedPrefix=(()=>{
    const counts={};
    for(const p of existingParts){
      const m=(p.sku||"").match(/^([A-Z0-9]+)-/i);
      if(m) counts[m[1].toUpperCase()]=(counts[m[1].toUpperCase()]||0)+1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
  })();
  const codePrefix=detectedPrefix||(supplierCode||"").trim().toUpperCase();

  const rows = [
    ...existingParts.map(p=>({sourceType:"catalogue", id:p._linkId, sku:p.sku, name:p.name, stock:p._supplierStock??0, bin:p._supplierBinLocation||""})),
    ...ownParts.map(p=>({sourceType:"own", id:p.id, sku:codePrefix?`${codePrefix}-${p.part_code}`:p.part_code, name:p.name, stock:p.stock??0, bin:p.bin_location||""})),
  ].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const staleMainStockCount = existingParts.filter(p=>+p.stock>0&&codePrefix&&(p.sku||"").toUpperCase().startsWith(codePrefix+"-")).length;

  const startEdit=(row)=>{setEditing({sourceType:row.sourceType,id:row.id});setStockVal(String(row.stock));setBinVal(row.bin);};
  const save=async()=>{
    setSaving(true);
    await onSaveField(editing.sourceType, editing.id, {stock:+stockVal||0, binLocation:binVal});
    setSaving(false); setEditing(null);
  };
  const runZeroMainStock=async()=>{
    if(!window.confirm(`Zero MotorDesk's own inventory count for ${staleMainStockCount} of your "${codePrefix}-" catalogue part${staleMainStockCount>1?"s":""}? This only affects the old shared stock number on parts whose SKU starts with "${codePrefix}-" — your own stock (shown above) is untouched, and no other supplier's parts are touched. Do this once your own stock is set correctly, so MotorDesk doesn't also show these as held in-house.`)) return;
    setZeroing(true);
    await onZeroMainStock();
    setZeroing(false);
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📊 My Stock</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{rows.length} parts — your own qty & location</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
          {onZeroMainStock&&staleMainStockCount>0&&(
            <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} disabled={zeroing} onClick={runZeroMainStock}>
              {zeroing?"…":`🧹 Zero MotorDesk Stock (${staleMainStockCount})`}
            </button>
          )}
        </div>
      </div>
      {onZeroMainStock&&staleMainStockCount>0&&(
        <div style={{fontSize:12,color:"var(--text3)",marginTop:-12,marginBottom:16}}>
          {staleMainStockCount} catalogue part{staleMainStockCount>1?"s":""} still show{staleMainStockCount>1?"":"s"} a nonzero MotorDesk-side stock count from before you took over your own stock — the "Zero MotorDesk Stock" button clears just that old number, not your own.
        </div>
      )}
      {rows.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No parts yet.</div>
      ) : (
        <div className="card" style={{overflow:"hidden"}}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SKU</th><th>Name</th><th>Source</th><th>Stock</th><th>Location</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map(row=>{
                  const isEditing=editing&&editing.sourceType===row.sourceType&&editing.id===row.id;
                  return (
                    <tr key={`${row.sourceType}-${row.id}`}>
                      <td style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{row.sku||"—"}</td>
                      <td>{row.name}</td>
                      <td><span className="badge" style={{fontSize:11,background:row.sourceType==="catalogue"?"rgba(96,165,250,.12)":"rgba(52,211,153,.12)",color:row.sourceType==="catalogue"?"var(--blue)":"var(--green)"}}>{row.sourceType==="catalogue"?"Catalogue":"My Part"}</span></td>
                      {isEditing ? (
                        <>
                          <td><input className="inp" type="number" min="0" style={{width:80}} value={stockVal} onChange={e=>setStockVal(e.target.value)}/></td>
                          <td><input className="inp" style={{width:110}} value={binVal} onChange={e=>setBinVal(e.target.value)} placeholder="e.g. A1-02"/></td>
                          <td>
                            <div style={{display:"flex",gap:5}}>
                              <button className="btn btn-ghost btn-xs" onClick={()=>setEditing(null)} disabled={saving}>Cancel</button>
                              <button className="btn btn-primary btn-xs" onClick={save} disabled={saving}>{saving?"…":"💾 Save"}</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{fontWeight:700,color:row.stock>0?"var(--green)":"var(--red)"}}>{row.stock}</td>
                          <td style={{color:"var(--text3)"}}>{row.bin||"—"}</td>
                          <td><button className="btn btn-ghost btn-xs" onClick={()=>startEdit(row)}>✏️ Edit</button></td>
                        </>
                      )}
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

// Own top-level tab (previously buried at the bottom of My Stock, which made it
// hard to find) — receive/record purchase invoices and, separately, commit their
// stock into the system once the physical count is verified.
export function SupplierPurchaseInvoicesPage({existingParts=[], ownParts=[], supplierCode="", purchaseInvoices=[], purchaseInvoiceItems=[], marginOptions=null,
  onSavePurchaseInvoice, onQuickAddPart, onUpdatePart, onUpdateCatalogPart, onApplyPurchaseInvoiceStock, onRefresh}) {
  const [showReceive, setShowReceive] = useState(false);
  const [continuingInvoice, setContinuingInvoice] = useState(null); // the pending invoice row being resumed, or null for a fresh one
  const [applyingId, setApplyingId] = useState(null);

  // Same SKU-prefix detection as My Stock (from real catalogue SKUs, not
  // supplierCode, which can be the full company name when suppliers.code is blank).
  const codePrefix=(()=>{
    const counts={};
    for(const p of existingParts){
      const m=(p.sku||"").match(/^([A-Z0-9]+)-/i);
      if(m) counts[m[1].toUpperCase()]=(counts[m[1].toUpperCase()]||0)+1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||(supplierCode||"").trim().toUpperCase();
  })();

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📥 Purchase Invoices</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{purchaseInvoices.length} invoice{purchaseInvoices.length!==1?"s":""} — record stock coming onto your own shelf</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
          <button className="btn btn-primary btn-sm" onClick={()=>setShowReceive(true)}>📥 Receive Stock</button>
        </div>
      </div>
      {(showReceive||continuingInvoice)&&(
        <SupplierPurchaseInvoiceModal existingParts={existingParts} ownParts={ownParts} supplierCode={codePrefix} marginOptions={marginOptions} onQuickAddPart={onQuickAddPart} onUpdatePart={onUpdatePart} onUpdateCatalogPart={onUpdateCatalogPart}
          editingInvoice={continuingInvoice} editingItems={continuingInvoice?purchaseInvoiceItems.filter(it=>it.invoice_id===continuingInvoice.id):[]}
          onCancel={()=>{setShowReceive(false);setContinuingInvoice(null);}}
          onSave={async(data)=>{await onSavePurchaseInvoice(data);setShowReceive(false);setContinuingInvoice(null);}}/>
      )}
      {purchaseInvoices.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No purchase invoices yet — click "Receive Stock" to record one.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {purchaseInvoices.map(inv=>{
            const its=purchaseInvoiceItems.filter(it=>it.invoice_id===inv.id);
            const pending=inv.status!=="received";
            // Same reconciliation the Receive Stock form shows while typing — surface
            // it here too, since this may be reopened well after that screen closed.
            // A real mismatch blocks committing stock until it's fixed (via Continue),
            // rather than letting a miscounted/mistyped invoice silently go onto shelf.
            const diff=inv.invoice_total!=null?inv.total-inv.invoice_total:null;
            const hasMismatch=diff!=null&&Math.abs(diff)>=1;
            return (
              <div key={inv.id} className="card" style={{padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{inv.invoice_no||inv.id}{inv.from_name?` · ${inv.from_name}`:""}</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{inv.invoice_date||fmtDT(inv.created_at)} · {inv.total_qty||its.reduce((s,it)=>s+it.qty,0)} units · {fmtAmt(inv.total)}</div>
                    {diff!=null&&(
                      <div style={{fontSize:11,fontWeight:700,marginTop:2,color:hasMismatch?"var(--red)":"var(--green)"}}>
                        {hasMismatch?`⚠️ Difference: ${diff>0?"+":""}${fmtAmt(diff)} vs invoice total ${fmtAmt(inv.invoice_total)}`:"✅ Matches invoice total"}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span className="badge" style={{fontSize:11,
                      background:pending?"rgba(251,191,36,.15)":"rgba(52,211,153,.12)",
                      color:pending?"var(--yellow)":"var(--green)"}}>{pending?"⏳ Not yet in system":"✅ In system"}</span>
                    {pending&&<button className="btn btn-ghost btn-xs" onClick={()=>setContinuingInvoice(inv)}>✏️ Continue</button>}
                    {pending&&onApplyPurchaseInvoiceStock&&(
                      <button className="btn btn-primary btn-xs" disabled={applyingId===inv.id||hasMismatch}
                        title={hasMismatch?"Fix the difference (Continue → adjust items/costs) before adding stock":undefined}
                        onClick={async()=>{
                          if(!window.confirm(`Add ${inv.total_qty||its.reduce((s,it)=>s+it.qty,0)} units from this invoice to your stock? Do this once you've verified the physical count.`)) return;
                          setApplyingId(inv.id);
                          await onApplyPurchaseInvoiceStock(inv.id);
                          setApplyingId(null);
                        }}>
                        {applyingId===inv.id?"Adding…":hasMismatch?"⚠️ Fix difference first":"✅ Add Stock to System"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Same start -> count -> complete shape as the main app's admin StockTakePage,
// scoped to this supplier's own items (both sources) instead of branch inventory.
export function SupplierStockTakePage({stockTakes=[], items=[], onStart, onOpen, onSaveCount, onComplete, onRefresh}) {
  const [openId, setOpenId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState({}); // itemId -> value while typing, before it's saved on blur

  const openTake=async(stId)=>{ setOpenId(stId); await onOpen(stId); };
  const start=async()=>{
    setStarting(true);
    const stId=await onStart(name);
    setStarting(false); setName("");
    if(stId) openTake(stId);
  };
  const saveOne=async(item)=>{
    const v=counts[item.id];
    if(v==null||v==="") return;
    await onSaveCount(item.id, +v, item.system_qty);
  };
  const currentTake=stockTakes.find(st=>st.id===openId);

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>🔢 My Stock Take</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>Count your own stock — catalogue parts and your own parts together</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>

      <div className="card" style={{padding:14,marginBottom:16,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input className="inp" style={{flex:1,minWidth:180}} placeholder={`Stock Take ${new Date().toLocaleDateString()}`} value={name} onChange={e=>setName(e.target.value)}/>
        <button className="btn btn-primary btn-sm" onClick={start} disabled={starting}>{starting?"Starting…":"+ Start New Stock Take"}</button>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
        {stockTakes.length===0
          ? <div className="card" style={{padding:30,textAlign:"center",color:"var(--text3)"}}>No stock takes yet.</div>
          : stockTakes.map(st=>(
            <div key={st.id} className="card" style={{padding:12,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:openId===st.id?"1px solid var(--accent)":undefined}} onClick={()=>openTake(st.id)}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{st.name}</div>
                <div style={{fontSize:11,color:"var(--text3)"}}>{st.created_at?new Date(st.created_at).toLocaleString():""}</div>
              </div>
              <span className="badge" style={{fontSize:11,background:st.status==="completed"?"rgba(52,211,153,.12)":"rgba(251,191,36,.15)",color:st.status==="completed"?"var(--green)":"var(--yellow)"}}>{st.status==="completed"?"✅ Completed":"🔓 Open"}</span>
            </div>
          ))}
      </div>

      {currentTake&&(
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:700}}>{currentTake.name}</div>
            {currentTake.status==="open"&&<button className="btn btn-primary btn-sm" onClick={()=>onComplete(currentTake.id)}>✅ Complete & Apply</button>}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SKU</th><th>Item</th><th>Location</th><th>System Qty</th><th>Counted Qty</th><th>Variance</th></tr></thead>
              <tbody>
                {items.filter(i=>i.stock_take_id===currentTake.id).map(item=>(
                  <tr key={item.id}>
                    <td style={{fontFamily:"DM Mono,monospace",fontSize:12}}>{item.sku||"—"}</td>
                    <td>{item.item_name}</td>
                    <td style={{color:"var(--text3)"}}>{item.bin_location||"—"}</td>
                    <td>{item.system_qty}</td>
                    <td>
                      {currentTake.status==="open" ? (
                        <input className="inp" type="number" style={{width:80}}
                          value={counts[item.id]??(item.counted_qty??"")}
                          onChange={e=>setCounts(p=>({...p,[item.id]:e.target.value}))}
                          onBlur={()=>saveOne(item)}/>
                      ) : (item.counted_qty??"—")}
                    </td>
                    <td style={{fontWeight:700,color:item.variance>0?"var(--green)":item.variance<0?"var(--red)":"var(--text3)"}}>{item.variance??"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Read-only ledger of every stock movement — item_name/sku/before/after are all
// captured at the moment of the change (see deductSupplierStock in App.jsx), so
// this stays accurate even if a part is later renamed or removed.
export function SupplierStockLogPage({logs=[], onRefresh}) {
  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📜 My Stock Records</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{logs.length} stock movements</p>
        </div>
        {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
      </div>
      {logs.length===0 ? (
        <div className="card" style={{padding:44,textAlign:"center",color:"var(--text3)"}}>No stock movements yet.</div>
      ) : (
        <div className="card" style={{overflow:"hidden"}}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Item</th><th>Reason</th><th>Change</th><th>Before → After</th></tr></thead>
              <tbody>
                {logs.map(l=>(
                  <tr key={l.id}>
                    <td style={{color:"var(--text3)",fontSize:12}}>{fmtDT(l.created_at)}</td>
                    <td>
                      <div style={{fontWeight:600}}>{l.item_name||"—"}</div>
                      {l.sku&&<div style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{l.sku}</div>}
                    </td>
                    <td style={{textTransform:"capitalize"}}>{(l.reason||"").replace(/_/g," ")}</td>
                    <td style={{fontWeight:700,color:l.change_qty<0?"var(--red)":"var(--green)"}}>{l.change_qty>0?"+":""}{l.change_qty}</td>
                    <td style={{color:"var(--text3)",fontSize:12}}>{l.before_qty} → {l.after_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-screen zoom for a single part photo, with every vehicle it fits listed
// underneath — a lighter, purpose-built alternative to shared ImgLightbox, which
// only ever shows its caption in multi-image mode (never for a lone photo).
// Split-screen compare: the fitted vehicle's own photos on the left, the part's
// photos on the right — each side paging independently, so you can flip through
// both while eyeballing a match (same pattern as the Vehicle Request compare view).
const COMPARE_ZOOM_SCALE = 2.2;

function PartVehicleCompareZoom({vehicleImages=[], vehicleTitle, partImages=[], partTitle, onClose}) {
  const [vIdx,setVIdx]=useState(0);
  const [pIdx,setPIdx]=useState(0);
  const Pane=({title,images,idx,setIdx})=>{
    const [zoomed,setZoomed]=useState(false);
    const [natural,setNatural]=useState(null); // {w,h} of the loaded <img> — small source photos
    // render at native size under maxWidth/maxHeight alone (no upscale), so just
    // dropping those caps on zoom does nothing visible. Force real enlargement
    // instead by sizing explicitly off the loaded image's natural pixels, scaled up.
    useEffect(()=>{ setZoomed(false); setNatural(null); },[idx]);
    const zoomStyle=(zoomed&&natural)
      ?{width:natural.w*COMPARE_ZOOM_SCALE,height:natural.h*COMPARE_ZOOM_SCALE,maxWidth:"none",maxHeight:"none",borderRadius:8,cursor:"zoom-out",display:"block"}
      :{maxWidth:"100%",maxHeight:"60vh",objectFit:"contain",borderRadius:8,cursor:"zoom-in"};
    return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,padding:"0 16px"}}>
      <div style={{color:"#fff",fontWeight:700,fontSize:13,textAlign:"center",marginBottom:8}}>
        {title}{images.length>1?` (${idx+1}/${images.length})`:""}
      </div>
      <div style={zoomed
        ?{flex:1,minHeight:0,position:"relative",overflow:"auto"}
        :{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",minHeight:0,overflow:"hidden"}}>
        {images.length===0?(
          <div style={{color:"rgba(255,255,255,.4)",fontSize:13}}>No photo</div>
        ):(
          <>
            <img key={images[idx]} src={images[idx]} alt="" style={zoomStyle}
              onLoad={e=>setNatural({w:e.target.naturalWidth,h:e.target.naturalHeight})}
              onClick={e=>{e.stopPropagation();setZoomed(z=>!z);}}/>
            {!zoomed&&images.length>1&&(
              <>
                <button onClick={e=>{e.stopPropagation();setIdx(i=>(i-1+images.length)%images.length);}}
                  style={{position:"absolute",left:4,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16}}>‹</button>
                <button onClick={e=>{e.stopPropagation();setIdx(i=>(i+1)%images.length);}}
                  style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16}}>›</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
    );
  };
  return createPortal(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.94)",zIndex:100000,display:"flex",alignItems:"stretch",justifyContent:"center",padding:"40px 8px"}}>
      <Pane title={vehicleTitle||"Vehicle"} images={vehicleImages} idx={vIdx} setIdx={setVIdx}/>
      <div style={{width:1,background:"rgba(255,255,255,.15)"}}/>
      <Pane title={partTitle||"Part"} images={partImages} idx={pIdx} setIdx={setPIdx}/>
      <button onClick={onClose} style={{position:"fixed",top:16,right:16,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:38,height:38,cursor:"pointer",fontSize:18,zIndex:100001}}>✕</button>
    </div>,
    document.body
  );
}

function PartImageZoom({images=[], title, fits=[], onClose, onOpenVehicle}) {
  const [idx,setIdx]=useState(0);
  const src=images[idx];
  return createPortal(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:99999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",maxWidth:"90vw"}}>
        {images.length>1&&(
          <button onClick={e=>{e.stopPropagation();setIdx(i=>(i-1+images.length)%images.length);}}
            style={{position:"absolute",left:-8,transform:"translateX(-100%)",background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:38,height:38,cursor:"pointer",fontSize:20}}>‹</button>
        )}
        <img src={src} alt="" style={{maxWidth:"90vw",maxHeight:"70vh",objectFit:"contain",borderRadius:8}} onClick={e=>e.stopPropagation()}/>
        {images.length>1&&(
          <button onClick={e=>{e.stopPropagation();setIdx(i=>(i+1)%images.length);}}
            style={{position:"absolute",right:-8,transform:"translateX(100%)",background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:38,height:38,cursor:"pointer",fontSize:20}}>›</button>
        )}
      </div>
      {images.length>1&&<div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:10}}>{idx+1} / {images.length}</div>}
      <div style={{color:"#fff",marginTop:14,textAlign:"center",maxWidth:520}}>
        <div style={{fontWeight:700,fontSize:15}}>{title}</div>
        {fits.length>0&&(
          <div style={{marginTop:10,fontSize:13,color:"rgba(255,255,255,.75)"}}>
            <div style={{textTransform:"uppercase",fontSize:10,letterSpacing:.6,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:6}}>Fits</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {fits.map((f,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
                  {f.photo&&(
                    <img src={toImgUrl(f.photo)} alt="" title={f.photos?.length?"Click to compare with the part":undefined}
                      onClick={e=>{
                        if(!f.photos?.length||!onOpenVehicle) return;
                        e.stopPropagation();
                        onOpenVehicle({vehicleImages:f.photos.map(toImgUrl),vehicleTitle:f.vehicleTitle,partImages:images,partTitle:title});
                      }}
                      style={{width:64,height:48,objectFit:"contain",borderRadius:6,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",cursor:f.photos?.length?"zoom-in":"default",flexShrink:0}}
                      onError={e=>e.target.style.display="none"}/>
                  )}
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <button onClick={onClose} style={{position:"fixed",top:16,right:16,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",width:38,height:38,cursor:"pointer",fontSize:18}}>✕</button>
    </div>,
    document.body
  );
}

// Picker form for a manual booking — pulled out of SupplierOrdersPage since it's
// its own self-contained flow (search own stock -> add lines -> customer details).
function NewBookingForm({existingParts, ownParts, supplierCode="", customers=[], vehicles=[], partFitments=[], onCreate, onCancel}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [custDropdown, setCustDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vModelInput, setVModelInput] = useState(""); // display text for the Model combobox — vModel is the actual filter value (code||model)
  const [vModelDropdown, setVModelDropdown] = useState(false);
  const [items, setItems] = useState([]); // {sourceType,targetId,partId?,name,sku,qty,unitPrice}
  const [discountPct, setDiscountPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [zoomImage, setZoomImage] = useState(null); // {images,title,fits}
  const [vehicleZoom, setVehicleZoom] = useState(null); // {vehicleImages,vehicleTitle,partImages,partTitle} — compare view opened from inside the part zoom

  // A part's own make/model/year_range fields (what searchBlob alone covers) are
  // often blank on catalogue parts — the real "what vehicle does this fit" data
  // lives in part_fitments -> vehicles instead, same table the admin Inventory
  // Vehicle Fits tab uses. Fold that in too so searching "G31" or "5 series" finds
  // a part that fits it even when the part row itself has no make/model set.
  const vehiclesById=Object.fromEntries(vehicles.map(v=>[String(v.id),v]));
  const fitsFor=(fitKey,matchId)=>partFitments.filter(f=>String(f[fitKey])===String(matchId))
    .map(f=>vehiclesById[String(f.vehicle_id)]).filter(Boolean);
  const fitTextFor=(fitKey,matchId)=>fitsFor(fitKey,matchId).map(v=>`${v.make} ${v.model} ${v.year_from||""} ${v.year_to||""}`).join(" ");
  // Card display: prefer the actual fitted vehicle(s) over the part's own make/model/
  // year_range fields (often blank on catalogue parts) — falls back to those only
  // when there's no fitment record at all.
  const fitLabelFor=(fitKey,matchId,p)=>{
    const fits=fitsFor(fitKey,matchId);
    if(fits.length) return {main:`${fits[0].make} ${fits[0].model}`, year:`${fits[0].year_from||"?"}–${fits[0].year_to||"present"}`, extra:fits.length-1,
      allFits:fits.map(v=>({text:`${v.make} ${v.model} (${v.year_from||"?"}–${v.year_to||"present"})`,
        photo:v.photo_front||v.photo_rear||v.photo_side||null,
        photos:[v.photo_front,v.photo_rear,v.photo_side].filter(Boolean),
        vehicleTitle:`${v.make} ${v.model}`}))};
    if(p.make||p.model) return {main:[p.make,p.model].filter(Boolean).join(" "), year:p.year_range||"", extra:0,
      allFits:[{text:`${[p.make,p.model].filter(Boolean).join(" ")}${p.year_range?` (${p.year_range})`:""}`, photo:null, photos:[], vehicleTitle:""}]};
    return null;
  };
  // Cover photo + any extra photos (parts.photos / supplier_parts.photos — same
  // JSON-array convention as the main Inventory PartModal), for the zoom gallery.
  const imagesFor=(p)=>[p.image,...(p.extraPhotos||[])].filter(Boolean).map(toImgUrl);

  const pool = [
    ...existingParts.map(p=>({sourceType:"catalogue", targetId:p._linkId, partId:p.id, name:p.name, sku:p.sku, price:p.price, stock:p._supplierStock??0, image:p.image_url, extraPhotos:parseJsonArray(p.photos),
      fit:fitLabelFor("part_id",p.id,p),
      blob:`${searchBlob(p,p.sku)} ${fitTextFor("part_id",p.id)}`.toLowerCase()})),
    ...ownParts.map(p=>({sourceType:"own", targetId:p.id, partId:null, name:p.name, sku:supplierCode?`${supplierCode}-${p.part_code}`:p.part_code, price:p.price, stock:p.stock??0, image:p.image_url, extraPhotos:parseJsonArray(p.photos),
      fit:fitLabelFor("supplier_part_id",p.id,p),
      blob:`${searchBlob(p,p.part_code)} ${fitTextFor("supplier_part_id",p.id)}`.toLowerCase()})),
  ];
  // Same multi-keyword matcher as My Parts (searchBlob/matchesSearch, top of file) —
  // matching only name+sku (the original version here) missed anything searched by
  // make/model/OE number/etc., which looked exactly like "nothing happens".
  const keywords=search.toLowerCase().trim().split(/\s+/).filter(Boolean);

  // Typing a guess at fitment text (e.g. "bmw f32") only works if that exact string
  // appears somewhere in the blob — real fitment data doesn't always read that way
  // (e.g. "3 SERIES F30/F31/F32"). A proper Make/Model picker, matched against the
  // actual part_fitments records (same approach as the admin Inventory Vehicle Fits
  // tab / VehicleSearchBar), is reliable regardless of how the fitment text reads.
  const vMakes=[...new Set(vehicles.map(v=>v.make))].filter(Boolean).sort();
  const vModelsForMake=vMake?[...new Map(vehicles.filter(v=>v.make===vMake).map(v=>[v.code||v.model,v])).values()].sort((a,b)=>(a.code||a.model).localeCompare(b.code||b.model)):[];
  const fittedPoolFor=(vehicleIds)=>{
    const fittedPartIds=new Set(partFitments.filter(f=>vehicleIds.has(String(f.vehicle_id))).map(f=>String(f.part_id)).filter(Boolean));
    const fittedSupplierPartIds=new Set(partFitments.filter(f=>vehicleIds.has(String(f.vehicle_id))).map(f=>String(f.supplier_part_id)).filter(Boolean));
    return pool.filter(p=>p.sourceType==="catalogue"?fittedPartIds.has(String(p.partId)):fittedSupplierPartIds.has(String(p.targetId)));
  };
  // Model-specific match first; if that's empty, narrow only as far back as the
  // Make (not the whole pool — a Model with no exact fitment shouldn't dump every
  // unrelated part into the list, just the ones that at least share the Make).
  const vehicleFilterResult=(()=>{
    if(!vMake) return null;
    const makePool=fittedPoolFor(new Set(vehicles.filter(v=>v.make===vMake).map(v=>String(v.id))));
    if(!vModel) return {items:makePool, mode:"make"};
    const byCode=vehicles.filter(v=>v.make===vMake&&v.code===vModel);
    const modelVehicles=byCode.length?byCode:vehicles.filter(v=>v.make===vMake&&v.model===vModel);
    const modelPool=fittedPoolFor(new Set(modelVehicles.map(v=>String(v.id))));
    return modelPool.length ? {items:modelPool, mode:"model"} : {items:makePool, mode:makePool.length?"make-fallback":"none"};
  })();

  const sortedPool=[...pool].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const usingMakeFallback = vehicleFilterResult?.mode==="make-fallback";
  const noneFitMake = vehicleFilterResult?.mode==="none";
  // Never a dead end when browsing with no filter at all — but a vehicle-specific
  // search with genuinely nothing fitted should say so, not silently show unrelated parts.
  const filtered = keywords.length
    ? pool.filter(p=>matchesSearch(p.blob,keywords))
    : vMake
      ? (vehicleFilterResult?.items||[])
      : sortedPool;

  const addItem=(p)=>{
    setItems(prev=>{
      const ex=prev.find(i=>i.sourceType===p.sourceType&&i.targetId===p.targetId);
      if(ex) return prev.map(i=>i===ex?{...i,qty:i.qty+1}:i);
      return [...prev,{sourceType:p.sourceType,targetId:p.targetId,partId:p.partId,name:p.name,sku:p.sku,image:p.image,extraPhotos:p.extraPhotos,fit:p.fit,qty:1,unitPrice:p.price}];
    });
    setSearch("");
  };
  const updateQty=(idx,qty)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,qty:Math.max(1,qty)}:it));
  const updatePrice=(idx,price)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,unitPrice:price}:it));
  const removeItem=(idx)=>setItems(prev=>prev.filter((_,i)=>i!==idx));

  const subtotal=items.reduce((s,it)=>s+it.qty*it.unitPrice,0);
  const pct=Math.min(100,Math.max(0,+discountPct||0));
  const discountAmt=subtotal*pct/100;
  const total=subtotal-discountAmt;

  const submit=async()=>{
    setSaving(true);
    await onCreate({customerName,customerPhone,items,discountPct:pct,subtotal,total});
    setSaving(false);
  };

  // Pick an existing customer (registered through this supplier's own catalogue
  // link) instead of retyping their details, or just keep typing to add a new one.
  const custMatches=customerName.trim().length>=2
    ? customers.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(customerName.toLowerCase())).slice(0,6)
    : [];

  return (
    <Overlay onClose={onCancel}>
      <MHead title="➕ New Booking" sub="Record a sale from your own stock" onClose={onCancel}/>
      <FG cols="1fr 1fr">
        <div style={{position:"relative"}}>
          <FL label="Customer Name *"/>
          <input className="inp" value={customerName}
            onChange={e=>{setCustomerName(e.target.value);setCustDropdown(true);}}
            onFocus={()=>setCustDropdown(true)} onBlur={()=>setTimeout(()=>setCustDropdown(false),150)}
            placeholder="Type to search or add new"/>
          {custDropdown&&custMatches.length>0&&(
            <div style={{position:"absolute",zIndex:10,left:0,right:0,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,marginTop:2,maxHeight:160,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,.15)"}}>
              {custMatches.map(c=>(
                <div key={c.id} style={{padding:"7px 10px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border)"}}
                  onMouseDown={()=>{setCustomerName(c.name);setCustomerPhone(c.phone||"");setCustDropdown(false);}}>
                  <strong>{c.name}</strong> <span style={{color:"var(--text3)"}}>· {c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div><FL label="Customer Phone"/><input className="inp" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></div>
      </FG>
      <FD>
        <FL label="Add item"/>
        <input className="inp" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your parts by name, SKU, make, model, OE…"/>
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <select className="inp" style={{flex:1}} value={vMake} onChange={e=>{setVMake(e.target.value);setVModel("");setVModelInput("");}} disabled={!!keywords.length}>
            <option value="">Or pick a vehicle: Make…</option>
            {vMakes.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <div style={{position:"relative",flex:1}}>
            <input className="inp" style={{width:"100%"}} value={vModelInput}
              onChange={e=>{setVModelInput(e.target.value);setVModel("");setVModelDropdown(true);}}
              onFocus={()=>setVModelDropdown(true)} onBlur={()=>setTimeout(()=>setVModelDropdown(false),150)}
              disabled={!vMake||!!keywords.length} placeholder={vMake?"All Models — type to search":"Pick a Make first"}/>
            {vModelDropdown&&vMake&&!keywords.length&&(
              <div style={{position:"absolute",zIndex:10,left:0,right:0,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,marginTop:2,maxHeight:180,overflowY:"auto",boxShadow:"0 4px 12px rgba(0,0,0,.15)"}}>
                {vModelsForMake
                  .filter(v=>!vModelInput.trim()||`${v.code||""} ${v.model}`.toLowerCase().includes(vModelInput.toLowerCase()))
                  .slice(0,30)
                  .map(v=>(
                    <div key={v.code||v.model} style={{padding:"7px 10px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border)"}}
                      onMouseDown={()=>{const val=v.code||v.model;setVModel(val);setVModelInput(v.code?`${v.code} — ${v.model}`:v.model);setVModelDropdown(false);}}>
                      {v.code?<strong>{v.code}</strong>:null} {v.model}
                    </div>
                  ))}
              </div>
            )}
          </div>
          {vMake&&!keywords.length&&<button type="button" className="btn btn-ghost btn-xs" onClick={()=>{setVMake("");setVModel("");setVModelInput("");}}>✕</button>}
        </div>
        {usingMakeFallback&&(
          <div style={{fontSize:12,color:"var(--text3)",marginTop:6}}>No exact fitment match for {vMake} {vModel} — showing other {vMake} parts instead:</div>
        )}
        {noneFitMake&&(
          <div style={{fontSize:12,color:"var(--text3)",marginTop:6}}>No parts in your stock fit any {vMake} — check My Stock, or the fitment may need adding there first.</div>
        )}
        {filtered.length>0 ? (
          <div style={{marginTop:6,maxHeight:320,overflowY:"auto",border:"1px solid var(--border)",borderRadius:8,padding:8}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:8}}>
              {filtered.slice(0,50).map(p=>(
                <div key={`${p.sourceType}-${p.targetId}`}
                  style={{border:"1px solid var(--border)",borderRadius:8,padding:8,cursor:"pointer",display:"flex",flexDirection:"column",gap:4,background:"var(--surface)"}}
                  onClick={()=>addItem(p)}>
                  <div style={{width:"100%",aspectRatio:"1",borderRadius:6,overflow:"hidden",background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                    {p.image
                      ? <img src={toImgUrl(p.image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                      : <span style={{fontSize:22,opacity:.3}}>🖼</span>}
                    {p.image&&(
                      <button type="button" title="Enlarge photo" onClick={e=>{e.stopPropagation();setZoomImage({images:imagesFor(p),title:p.name,fits:p.fit?.allFits||[]});}}
                        style={{position:"absolute",top:4,right:4,width:24,height:24,borderRadius:"50%",background:"rgba(0,0,0,.65)",border:"none",cursor:"zoom-in",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><circle cx="10" cy="10" r="6"/><line x1="15" y1="15" x2="20" y2="20"/></svg>
                      </button>
                    )}
                    {p.extraPhotos?.length>0&&(
                      <div title={`${p.extraPhotos.length} extra photo${p.extraPhotos.length>1?"s":""}`}
                        style={{position:"absolute",bottom:4,left:4,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10}}>
                        📷 +{p.extraPhotos.length}
                      </div>
                    )}
                  </div>
                  <div style={{fontSize:12,fontWeight:700,lineHeight:1.25,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{p.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)",fontFamily:"DM Mono,monospace"}}>{p.sku}</div>
                  {p.fit&&(
                    <div style={{fontSize:11,color:"var(--blue)"}}>
                      {p.fit.main}{p.fit.extra>0?` +${p.fit.extra}`:""}
                      {p.fit.year&&<div style={{color:"var(--text3)"}}>{p.fit.year}</div>}
                    </div>
                  )}
                  <div style={{fontSize:11,fontWeight:700,color:p.stock>0?"var(--green)":"var(--red)"}}>Stock: {p.stock}</div>
                </div>
              ))}
            </div>
            {filtered.length>50&&<div style={{padding:"6px 10px",fontSize:11,color:"var(--text3)",textAlign:"center"}}>+{filtered.length-50} more — type to narrow it down</div>}
          </div>
        ) : keywords.length>0 ? (
          <div style={{fontSize:12,color:"var(--text3)",marginTop:6}}>No parts match "{search}" — check My Stock, or try a different keyword (make/model/OE number all work too).</div>
        ) : !vMake ? (
          <div style={{fontSize:12,color:"var(--text3)",marginTop:6}}>No parts in your stock yet — add some in My Stock first.</div>
        ) : null}
      </FD>
      {items.length>0&&(
        <div style={{marginBottom:14}}>
          {items.map((it,idx)=>(
            <div key={idx} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{width:32,height:32,flexShrink:0,borderRadius:5,overflow:"hidden",background:"var(--surface3)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:it.image?"zoom-in":"default"}}
                onClick={()=>it.image&&setZoomImage({images:imagesFor(it),title:it.name,fits:it.fit?.allFits||[]})}>
                {it.image
                  ? <img src={toImgUrl(it.image)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                  : <span style={{fontSize:14,opacity:.3}}>🖼</span>}
              </div>
              <div style={{flex:1,fontSize:13,minWidth:0}}>{it.name} <span style={{color:"var(--text3)"}}>({it.sku})</span></div>
              <input className="inp" type="number" min="1" style={{width:60}} value={it.qty} onChange={e=>updateQty(idx,+e.target.value||1)}/>
              <input className="inp" type="number" min="0" style={{width:90}} value={it.unitPrice} onChange={e=>updatePrice(idx,+e.target.value||0)}/>
              <button className="btn btn-ghost btn-xs" onClick={()=>removeItem(idx)}>✕</button>
            </div>
          ))}
        </div>
      )}
      {items.length>0&&(
        <div style={{background:"var(--surface2)",borderRadius:8,padding:"10px 12px",marginBottom:14,display:"flex",flexDirection:"column",gap:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}>
            <span style={{color:"var(--text3)"}}>Subtotal</span><span>{fmtAmt(subtotal)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <FL label="Discount %"/>
            <input className="inp" type="number" min="0" max="100" style={{width:80}} value={discountPct} onChange={e=>setDiscountPct(e.target.value)} placeholder="0"/>
          </div>
          {pct>0&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,color:"var(--red)"}}>
              <span>Discount ({pct}%)</span><span>-{fmtAmt(discountAmt)}</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:15,fontWeight:800,borderTop:"1px solid var(--border)",paddingTop:6}}>
            <span>Total</span><span>{fmtAmt(total)}</span>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button className="btn btn-ghost" style={{flex:1}} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2}} onClick={submit} disabled={saving||!customerName.trim()||items.length===0}>{saving?"Saving…":"✅ Confirm Booking"}</button>
      </div>
      {zoomImage&&<PartImageZoom images={zoomImage.images} title={zoomImage.title} fits={zoomImage.fits} onClose={()=>setZoomImage(null)} onOpenVehicle={setVehicleZoom}/>}
      {vehicleZoom&&<PartVehicleCompareZoom vehicleImages={vehicleZoom.vehicleImages} vehicleTitle={vehicleZoom.vehicleTitle}
        partImages={vehicleZoom.partImages} partTitle={vehicleZoom.partTitle} onClose={()=>setVehicleZoom(null)}/>}
    </Overlay>
  );
}

// "My Orders" — incoming Spare Shop orders that contain a line item attributed to
// this supplier (see reloadSupplierParts in App.jsx for how that's matched), each
// with a per-item Confirm button (an order can mix items from several suppliers,
// so confirmation is per-item, not per-order) that deducts this supplier's own
// stock and creates a booking record. Below that, every booking (confirmed orders
// plus manual entries) with a Convert to Invoice action once confirmed.
export function SupplierOrdersPage({orders=[], bookings=[], bookingItems=[], existingParts=[], ownParts=[], customers=[], vehicles=[], partFitments=[],
  supplierName="", supplierContactPerson="", supplierPhone="", supplierFullName="", supplierAddress="",
  onConfirmItem, onConvertToInvoice, onDeleteBooking, onCreateManualBooking, onRefresh}) {
  const [showNewBooking, setShowNewBooking] = useState(false);
  // Same SKU-prefix detection as My Stock/Receive Stock (from real catalogue SKUs,
  // not user.supplier_code, which can be the full company name) — used so self-added
  // parts show their proper "MCK-XXXX" SKU here too, matching My Parts.
  const codePrefix=(()=>{
    const counts={};
    for(const p of existingParts){
      const m=(p.sku||"").match(/^([A-Z0-9]+)-/i);
      if(m) counts[m[1].toUpperCase()]=(counts[m[1].toUpperCase()]||0)+1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||(supplierName||"").trim().toUpperCase();
  })();
  const linkIds = new Set(existingParts.map(p=>String(p._linkId)));
  const ownIds = new Set(ownParts.map(p=>String(p.id)));
  const isMine = (item) => (item.partSuppliersId && linkIds.has(String(item.partSuppliersId))) || (String(item.partId||"").startsWith("sp_") && ownIds.has(String(item.partId).slice(3)));
  const confirmedOrderIds = new Set(bookings.filter(b=>b.source_order_id).map(b=>b.source_order_id));

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700}}>📋 My Orders</h1>
          <p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>Confirm incoming orders, or book a sale yourself</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          {onRefresh&&<button className="btn btn-ghost btn-sm" onClick={onRefresh}>↺ Refresh</button>}
          <button className="btn btn-primary btn-sm" onClick={()=>setShowNewBooking(true)}>➕ New Booking</button>
        </div>
      </div>

      <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:.6,margin:"4px 0 8px"}}>Incoming Orders</div>
      {orders.filter(o=>(o.items||[]).some(isMine)).length===0 ? (
        <div className="card" style={{padding:30,textAlign:"center",color:"var(--text3)",marginBottom:24}}>No orders yet.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
          {orders.map(o=>{
            const mine=(o.items||[]).filter(isMine);
            if(mine.length===0) return null;
            const confirmed=confirmedOrderIds.has(o.id);
            return (
              <div key={o.id} className="card" style={{padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{o.customer_name} <span style={{color:"var(--text3)",fontWeight:400}}>· {o.customer_phone}</span></div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{o.date} · Order {o.id}</div>
                  </div>
                  {confirmed
                    ? <span className="badge" style={{fontSize:11,background:"rgba(52,211,153,.12)",color:"var(--green)"}}>✅ Confirmed</span>
                    : <StatusBadge status={o.status}/>}
                </div>
                {mine.map((item,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:"1px solid var(--border)",fontSize:13}}>
                    <div>{item.name} <span style={{color:"var(--text3)"}}>× {item.qty} @ {fmtAmt(item.price)}</span></div>
                    {!confirmed&&<button className="btn btn-primary btn-xs" onClick={()=>onConfirmItem(o,item)}>✅ Confirm</button>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:.6,margin:"4px 0 8px"}}>Bookings</div>
      {bookings.length===0 ? (
        <div className="card" style={{padding:30,textAlign:"center",color:"var(--text3)"}}>No confirmed bookings yet.</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {bookings.map(b=>{
            const its=bookingItems.filter(bi=>bi.booking_id===b.id);
            return (
              <div key={b.id} className="card" style={{padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{b.customer_name}{b.customer_phone?` · ${b.customer_phone}`:""}</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{b.source_order_id?`From order ${b.source_order_id}`:"Manual booking"} · {fmtDT(b.created_at)}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span className="badge" style={{fontSize:11,
                      background:b.status==="invoiced"?"rgba(52,211,153,.12)":"rgba(96,165,250,.12)",
                      color:b.status==="invoiced"?"var(--green)":"var(--blue)"}}>{b.status==="invoiced"?"🧾 Invoiced":"✅ Confirmed"}</span>
                    {b.status==="confirmed"&&(
                      <button className="btn btn-ghost btn-xs" onClick={async()=>{
                        await onConvertToInvoice(b.id);
                        openSupplierBookingInvoice({...b,status:"invoiced",invoiced_at:new Date().toISOString()},its,
                          supplierName,supplierContactPerson,supplierPhone,supplierFullName,supplierAddress);
                      }}>🧾 Convert to Invoice</button>
                    )}
                    {b.status==="invoiced"&&(
                      <button className="btn btn-ghost btn-xs" onClick={()=>openSupplierBookingInvoice(b,its,supplierName,supplierContactPerson,supplierPhone,supplierFullName,supplierAddress)}>👁 View Invoice</button>
                    )}
                    {onDeleteBooking&&(
                      <button className="btn btn-ghost btn-xs" style={{color:"var(--red)"}}
                        onClick={()=>{if(window.confirm(`Delete this booking${b.status==="invoiced"?" and its invoice":""}? The ${its.reduce((s,it)=>s+it.qty,0)} unit(s) of stock it deducted will be restored.`)) onDeleteBooking(b.id);}}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
                {its.map(it=>(
                  <div key={it.id} style={{fontSize:12,color:"var(--text2)",padding:"3px 0"}}>{it.part_name} × {it.qty} @ {fmtAmt(it.unit_price)}</div>
                ))}
                {b.total!=null&&(
                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,fontSize:12,marginTop:6,paddingTop:6,borderTop:"1px solid var(--border)"}}>
                    {b.discount_pct>0&&<span style={{color:"var(--red)"}}>-{b.discount_pct}%</span>}
                    <span style={{fontWeight:700}}>{fmtAmt(b.total)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNewBooking&&(
        <NewBookingForm existingParts={existingParts} ownParts={ownParts} supplierCode={codePrefix} customers={customers} vehicles={vehicles} partFitments={partFitments}
          onCancel={()=>setShowNewBooking(false)}
          onCreate={async(data)=>{await onCreateManualBooking(data);setShowNewBooking(false);}}/>
      )}
    </div>
  );
}

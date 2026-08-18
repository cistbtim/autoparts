import { getSettings, curSym } from "../../lib/settings.js";
import { toImgUrl } from "../../lib/helpers.js";

// job.vehicle_model is often stored as the catalog code (e.g. "VV42B") rather
// than the human-readable model name — resolve the display name from the
// vehicle catalog so printed documents show "V40 Cross Country", not the code.
function resolveVehicleModel(job, vehicles=[]) {
  if(!job.vehicle_model||!job.vehicle_make) return job.vehicle_model||"";
  const match = vehicles.find(v=>(v.code===job.vehicle_model||v.model===job.vehicle_model)&&(v.make||"").toLowerCase()===(job.vehicle_make||"").toLowerCase());
  return match?.model || job.vehicle_model;
}

// Single source of truth for the check-in inspection checklist — Workshop.jsx
// imports this instead of keeping its own copy, so the live checklist UI and
// the printed report can never drift apart again (they previously did: this
// list was missing brakes/engine/coolant that the UI already had).
export const CHECKLIST_ITEMS=[
  {key:"body_front",    label:"Front Bumper / Body",   icon:"🚗"},
  {key:"body_rear",     label:"Rear Bumper / Body",    icon:"🚙"},
  {key:"body_left",     label:"Left Side Body",        icon:"◀️"},
  {key:"body_right",   label:"Right Side Body",       icon:"▶️"},
  {key:"windscreen",   label:"Windscreen",            icon:"🔲"},
  {key:"mirror_glass",     label:"Door Mirror Glass",     icon:"🪞"},
  {key:"door_glass_left",  label:"Door Glass Left Side",  icon:"🪟"},
  {key:"door_glass_right", label:"Door Glass Right Side", icon:"🪟"},
  {key:"windscreen_rear",  label:"Rear Windscreen",       icon:"⬛"},
  {key:"wipers",       label:"Wipers",                icon:"🌧️"},
  {key:"lights_front", label:"Front Lights",          icon:"💡"},
  {key:"lights_rear",  label:"Rear Lights",           icon:"🔴"},
  {key:"tyres",        label:"Tyres Condition",       icon:"⚫"},
  {key:"brakes_front", label:"Front Brakes",          icon:"🛑"},
  {key:"brakes_rear",  label:"Rear Brakes",           icon:"🟥"},
  {key:"engine",       label:"Engine Check",          icon:"⚙️"},
  {key:"coolant",      label:"Coolant Level",         icon:"💧"},
  {key:"spare_wheel",  label:"Spare Wheel",           icon:"🛞"},
  {key:"fuel_level",   label:"Fuel Level",            icon:"⛽"},
  {key:"interior",     label:"Interior Condition",    icon:"💺"},
  {key:"dash_lights",  label:"Dashboard Warning Lights",icon:"⚠️"},
  {key:"boot",         label:"Boot / Trunk",          icon:"📦"},
  {key:"radio",        label:"Radio / Electronics",   icon:"📻"},
];

export function printStockLabel(p, settings, labelType="shop") {
  const sym = curSym(settings?.currency||"R");
  const shopName = settings?.shop_name||"MotorDesk";
  const isWs = labelType==="ws";
  const lw = (settings?.label_w||50)+"mm";
  const lh = (settings?.label_h||50)+"mm";
  const w = window.open("","_blank","width=380,height=300");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Label</title>
  <style>
    @page{size:${lw} ${lh};margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:${lw};height:${lh};padding:2mm 3mm;display:flex;flex-direction:column;justify-content:space-between;border:0.5pt solid #ccc}
    .hdr{font-size:6pt;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:${isWs?"#e65100":"#1565c0"};border-bottom:0.5pt solid ${isWs?"#e65100":"#1565c0"};padding-bottom:0.5mm;margin-bottom:1mm}
    .name{font-size:8.5pt;font-weight:bold;line-height:1.2;overflow:hidden;max-height:12mm}
    .sku{font-family:"Courier New",monospace;font-size:7pt;color:#444;margin-top:0.5mm;letter-spacing:.04em}
    .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto}
    .price{font-size:12pt;font-weight:bold}
    .info{text-align:right;font-size:6.5pt;color:#555}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">${isWs?"🔧 WORKSHOP":"📦 SPARE SHOP"} · ${shopName}</div>
    <div class="name">${(p.name||"").replace(/</g,"&lt;")}</div>
    <div class="sku">SKU: ${p.sku||"—"}${p.oe_number?" | OE: "+p.oe_number:""}</div>
    <div class="footer">
      <div>
        <div class="price">${sym} ${(+(p.price)||0).toFixed(2)}</div>
        ${p.bin_location?`<div style="font-size:6pt;color:#888;margin-top:0.5mm">📍 ${p.bin_location}</div>`:""}
      </div>
      <div class="info">
        Qty: ${isWs?(+p.qty||0):(+p.stock||0)}${p.unit?" "+p.unit:""}
      </div>
    </div>
  </div>
  </body></html>`);
  w.document.close();
}

export function printChecklistReport(job, checklist, settings) {
  const shopName = settings?.shop_name||"MotorDesk";
  const now = new Date().toLocaleString();
  const statusIcon = s => s==="ok"?"✓":s==="issue"?"✗":s==="na"?"—":"·";
  const statusColor = s => s==="ok"?"#16a34a":s==="issue"?"#dc2626":s==="na"?"#6b7280":"#9ca3af";
  const rows = CHECKLIST_ITEMS.map(item=>{
    const cl=checklist[item.key]||{};
    const st=cl.status||"pending";
    const note=cl.note||"";
    const photo=cl.photo_url||"";
    const thumbUrl=photo?toImgUrl(photo).replace(/sz=w200/,"sz=w120"):"";
    const fullUrl=photo?(() => {
      const m = photo.match(/\/file\/d\/([^/]+)/) || photo.match(/thumbnail[?]id=([^&]+)/) || photo.match(/[?&]id=([^&]+)/);
      return m ? `https://drive.google.com/uc?export=view&id=${m[1]}` : photo;
    })():"";
    return `<tr>
      <td style="padding:6px 8px;font-size:12px">${item.icon} ${item.label}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;font-size:14px;color:${statusColor(st)}">${statusIcon(st)}</td>
      <td style="padding:6px 8px;font-size:11px;color:#374151">${note||""}</td>
      <td style="padding:6px 8px;text-align:center">${thumbUrl?`<a href="${fullUrl}" target="_blank" style="cursor:pointer;text-decoration:none"><img src="${thumbUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;transition:opacity 0.2s;cursor:pointer" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"/></a>`:""}</td>
    </tr>`;
  }).join("");
  const okCount   = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="ok").length;
  const issCount  = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="issue").length;
  const naCount   = CHECKLIST_ITEMS.filter(i=>(checklist[i.key]?.status||"pending")==="na").length;
  const w=window.open("","_blank","width=800,height=900");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Check-in Report</title>
  <style>
    @page{size:A4;margin:15mm}
    @media print{body{margin:0}.no-print{display:none}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:20px}
    h1{font-size:18px;margin:0 0 4px}
    .sub{font-size:12px;color:#6b7280;margin-bottom:16px}
    .veh{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px}
    .vf{font-size:10px;color:#6b7280;margin-bottom:2px}
    .vv{font-size:13px;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f3f4f6;padding:7px 8px;text-align:left;font-size:11px;color:#374151;border-bottom:2px solid #d1d5db}
    tr:nth-child(even){background:#f9fafb}
    td{border-bottom:1px solid #e5e7eb;vertical-align:middle}
    .summary{display:flex;gap:16px;margin-top:16px;font-size:12px}
    .badge{padding:4px 12px;border-radius:20px;font-weight:700}
    .sig{margin-top:32px;display:flex;gap:40px}
    .sig-box{flex:1;border-top:1px solid #111;padding-top:6px;font-size:11px;color:#6b7280}
    .print-btn{display:inline-block;margin-bottom:16px;padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
  </style></head>
  <body>
    <button class="print-btn no-print" onclick="var imgs=document.querySelectorAll('img');var n=imgs.length,done=0;function go(){window.print();}if(!n){go();return;}function chk(){if(++done>=n)go();}imgs.forEach(function(i){if(i.complete&&i.naturalHeight!==0)chk();else{i.onload=chk;i.onerror=chk;}});">🖨️ Print / Save PDF</button>
    <h1>🔧 ${shopName}</h1>
    <div class="sub">Vehicle Check-in Inspection Report · Printed: ${now}</div>
    <div class="veh">
      <div><div class="vf">Plate / Reg</div><div class="vv">${job.vehicle_reg||"—"}</div></div>
      <div><div class="vf">Make / Model</div><div class="vv">${(job.vehicle_make||"")} ${(job.vehicle_model||"")||"—"}</div></div>
      <div><div class="vf">Year</div><div class="vv">${job.vehicle_year||"—"}</div></div>
      <div><div class="vf">Color</div><div class="vv">${job.vehicle_color||"—"}</div></div>
      <div><div class="vf">Mileage</div><div class="vv">${job.mileage?Number(job.mileage).toLocaleString()+" km":"—"}</div></div>
      <div><div class="vf">Job ID</div><div class="vv" style="font-family:monospace;font-size:11px">${job.id||"—"}</div></div>
      <div><div class="vf">Customer</div><div class="vv">${job.customer_name||"—"}</div></div>
      <div><div class="vf">Date In</div><div class="vv">${job.date_in||"—"}</div></div>
      <div><div class="vf">Mechanic</div><div class="vv">${job.mechanic||"—"}</div></div>
      ${job.vin?`<div style="grid-column:1/-1"><div class="vf">VIN</div><div class="vv" style="font-family:monospace;font-size:12px">${job.vin}</div></div>`:""}
    </div>
    <table>
      <thead><tr>
        <th style="width:36%">Item</th>
        <th style="width:10%;text-align:center">Status</th>
        <th style="width:40%">Note</th>
        <th style="width:14%;text-align:center">Photo</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <span class="badge" style="background:#dcfce7;color:#16a34a">✓ OK: ${okCount}</span>
      <span class="badge" style="background:#fee2e2;color:#dc2626">✗ Issues: ${issCount}</span>
      <span class="badge" style="background:#f3f4f6;color:#6b7280">— N/A: ${naCount}</span>
    </div>
    <div class="sig">
      <div class="sig-box">Customer Signature</div>
      <div class="sig-box">Staff Signature</div>
      <div class="sig-box">Date</div>
    </div>
  </body></html>`);
  w.document.close();
}

export function printJobCardSheet(job, items=[], settings) {
  const shopName = settings?.shop_name||"Workshop";
  const now = new Date().toLocaleString();

  const checkRow = (item) => `
    <tr>
      <td style="padding:6px 8px;font-size:12px">${item.icon} ${item.label}</td>
      <td style="padding:6px 8px;text-align:center"><span style="display:inline-block;width:15px;height:15px;border:1.5px solid #444;border-radius:3px"></span></td>
      <td style="padding:6px 8px;text-align:center"><span style="display:inline-block;width:15px;height:15px;border:1.5px solid #444;border-radius:3px"></span></td>
      <td style="padding:6px 8px;text-align:center"><span style="display:inline-block;width:15px;height:15px;border:1.5px solid #444;border-radius:3px"></span></td>
      <td style="padding:6px 8px"><div style="border-bottom:1px solid #aaa;min-height:18px;width:100%"></div></td>
    </tr>`;

  const workRow = (item) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${item.description||""}${item.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${item.part_sku}</span>`:""}</td>
      <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #e5e7eb">${item.qty||1}</td>
    </tr>`;

  const parts  = items.filter(i=>i.type==="part");
  const labour = items.filter(i=>i.type!="part");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Job Card</title>
    <style>
    @media print{body{margin:0}.no-print{display:none}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:18px;font-size:12px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #111;padding-bottom:10px;margin-bottom:12px}
    .shop-name{font-size:20px;font-weight:900;letter-spacing:.5px}
    .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px}
    .vf{font-size:9px;color:#6b7280;margin-bottom:1px;text-transform:uppercase;letter-spacing:.04em}
    .vv{font-size:12px;font-weight:700}
    .sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#374151;border-bottom:1.5px solid #111;padding-bottom:3px;margin:10px 0 5px}
    .write-box{border:1px solid #d1d5db;border-radius:5px;padding:8px 10px;min-height:40px;font-size:12px;line-height:1.6;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    th{background:#374151;color:#fff;padding:6px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    tr:nth-child(even){background:#f9fafb}
    td{border-bottom:1px solid #e5e7eb;vertical-align:middle}
    .sig{margin-top:20px;display:flex;gap:28px}
    .sig-box{flex:1;border-top:1.5px solid #111;padding-top:5px;font-size:10px;color:#6b7280}
    .print-btn{display:inline-block;margin-bottom:14px;padding:7px 18px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
  </style></head>
  <body>
    <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

    <div class="hdr">
      <div>
        <div class="shop-name">🔧 ${shopName}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:2px">Job Card / Work Sheet</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">Job Card</div>
        <div style="font-size:12px;font-weight:700;font-family:monospace;margin-top:2px">Job #${job.id||"—"}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px">Printed: ${now}</div>
      </div>
    </div>

    <div class="info-grid">
      <div><div class="vf">Plate / Reg</div><div class="vv">${job.vehicle_reg||"—"}</div></div>
      <div><div class="vf">Make / Model</div><div class="vv">${[job.vehicle_make,job.vehicle_model].filter(Boolean).join(" ")||"—"}</div></div>
      <div><div class="vf">Year / Color</div><div class="vv">${[job.vehicle_year,job.vehicle_color].filter(Boolean).join(" · ")||"—"}</div></div>
      <div><div class="vf">Customer</div><div class="vv">${(job.customer_name||"—").replace(/</g,"&lt;")}</div></div>
      <div><div class="vf">Phone</div><div class="vv">${job.customer_phone||"—"}</div></div>
      <div><div class="vf">Mileage</div><div class="vv">${job.mileage?Number(job.mileage).toLocaleString()+" km":"—"}</div></div>
      <div><div class="vf">Date In</div><div class="vv">${job.date_in||"—"}</div></div>
      <div><div class="vf">Mechanic</div><div class="vv">${job.mechanic||"—"}</div></div>
      <div><div class="vf">Status</div><div class="vv">${job.status||"—"}</div></div>
      ${job.vin?`<div style="grid-column:1/-1"><div class="vf">VIN</div><div class="vv" style="font-family:monospace;font-size:11px">${job.vin}</div></div>`:""}
    </div>

    <div class="sec">Complaint / Work Requested</div>
    <div class="write-box">${(job.complaint||"").replace(/</g,"&lt;").replace(/\n/g,"<br/>") || "&nbsp;"}</div>

    ${items.length>0?`
    <div class="sec">Work Items</div>
    <table>
      <thead><tr>
        <th style="width:5%">✓</th>
        <th>Description${parts.length>0?" / SKU":""}</th>
        <th style="width:8%;text-align:center">Qty</th>
      </tr></thead>
      <tbody>
        ${parts.length>0?`<tr style="background:#dbeafe"><td colspan="3" style="padding:4px 8px;font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em">🔩 Parts</td></tr>${parts.map(workRow).join("")}`:""}
        ${labour.length>0?`<tr style="background:#dcfce7"><td colspan="3" style="padding:4px 8px;font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em">👷 Labour / Services</td></tr>${labour.map(workRow).join("")}`:""}
      </tbody>
    </table>`:""}

    <div class="sec">Vehicle Inspection Checklist</div>
    <table>
      <thead><tr>
        <th style="width:38%">Item</th>
        <th style="width:8%;text-align:center">OK</th>
        <th style="width:10%;text-align:center">Issue</th>
        <th style="width:8%;text-align:center">N/A</th>
        <th>Notes / Comments</th>
      </tr></thead>
      <tbody>
        ${CHECKLIST_ITEMS.map(checkRow).join("")}
      </tbody>
    </table>

    <div class="sec">Diagnosis / Findings</div>
    <div class="write-box" style="min-height:50px">${(job.diagnosis||"").replace(/</g,"&lt;").replace(/\n/g,"<br/>")||"&nbsp;"}</div>

    <div class="sig">
      <div class="sig-box">Customer Signature</div>
      <div class="sig-box">Mechanic Signature</div>
      <div class="sig-box">Date Completed</div>
    </div>
  </body></html>`;
  const w = window.open("","_blank","width=820,height=1100");
  if(!w) return;
  w.document.write(html);
  w.document.close();
}

export function printJobCardLabel(job, settings) {
  const shopName = settings?.shop_name||"MotorDesk";
  const w = window.open("","_blank","width=480,height=360");
  if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Job Card Label</title>
  <style>
    @page{size:90mm 55mm;margin:0}
    @media print{body{margin:0}}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000}
    .label{width:90mm;height:55mm;padding:3mm 4mm;display:flex;flex-direction:column;border:2pt solid #000}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1pt solid #000;padding-bottom:1.5mm;margin-bottom:1.5mm}
    .job-id{font-family:"Courier New",monospace;font-size:13pt;font-weight:bold}
    .shop{font-size:5.5pt;color:#666;text-transform:uppercase;letter-spacing:.1em;margin-top:1mm}
    .reg{font-size:15pt;font-weight:bold;font-family:"Courier New",monospace;border:1pt solid #000;padding:0.5mm 2mm;text-align:center;margin-bottom:1.5mm;align-self:flex-start}
    .row{font-size:7pt;margin-bottom:0.8mm;display:flex;gap:2mm}
    .lbl{color:#666;width:14mm;flex-shrink:0}
    .val{font-weight:bold;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .complaint{font-size:6.5pt;color:#333;margin-top:1mm;border-top:0.5pt dashed #bbb;padding-top:1mm;overflow:hidden;max-height:7mm}
    .meta{font-size:5.5pt;color:#888;margin-top:auto;display:flex;justify-content:space-between}
  </style></head>
  <body onload="window.print();window.close()">
  <div class="label">
    <div class="hdr">
      <div>
        <div class="job-id">${job.id||""}</div>
        <div class="shop">🔧 ${shopName}</div>
      </div>
      <div style="text-align:right;font-size:6pt;color:#555">
        ${job.date_in||""}<br/>
        <strong>${job.status||""}</strong>
      </div>
    </div>
    <div class="reg">🚗 ${job.vehicle_reg||"—"}</div>
    <div class="row"><span class="lbl">Customer:</span><span class="val">${(job.customer_name||"—").replace(/</g,"&lt;")}</span></div>
    <div class="row"><span class="lbl">Phone:</span><span class="val">${job.customer_phone||"—"}</span></div>
    ${job.vehicle_make?`<div class="row"><span class="lbl">Vehicle:</span><span class="val">${job.vehicle_make||""} ${job.vehicle_model||""} ${job.vehicle_year||""}</span></div>`:""}
    ${job.complaint?`<div class="complaint">Complaint: ${(job.complaint||"").slice(0,120).replace(/</g,"&lt;")}${(job.complaint||"").length>120?"...":""}</div>`:""}
    ${job.mechanic?`<div class="meta"><span>Mechanic: ${job.mechanic}</span><span>${shopName}</span></div>`:`<div class="meta"><span></span><span>${shopName}</span></div>`}
  </div>
  </body></html>`);
  w.document.close();
}

export function printWorkshopInvoice(job, items, invoice, settings, photos={}, vehicles=[]) {
  const dispModel = resolveVehicleModel(job, vehicles);
  const C = curSym(settings.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal + taxAmt;
  const shopName = settings.shop_name||"Auto Workshop";
  const logoSrc = settings.logo_data || settings.logo_url || "";
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="max-height:70px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px"/>` : "";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${toImgUrl(p.url)||p.url}" referrerpolicy="no-referrer" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";
  const invId    = invoice?.id||"—";
  const invDate  = invoice?.invoice_date||new Date().toISOString().slice(0,10);
  const status   = invoice?.status||"unpaid";

  const rowsHtml = items.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace">${i.part_sku}</span>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Workshop Invoice ${invId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #111;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .status{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#111;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#f97316;border-top:2px solid #111;margin-top:4px}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  @media print{body{padding:18px}}
</style></head><body>

  <div class="header">
    <div>
      ${logoHtml}
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${(settings.city||settings.country)?`🌍 ${[settings.city,settings.country].filter(Boolean).join(", ")}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">WORKSHOP INVOICE</div>
      <div class="inv-no">${invId}</div>
      <div class="inv-meta">
        Date: ${invDate}<br/>
        ${invoice?.due_date?`Due: ${invoice.due_date}<br/>`:""}
        <span class="status" style="background:${status==="paid"?"#d1e7dd":"#fff3cd"};color:${status==="paid"?"#0a3622":"#856404"}">${status==="paid"?"✅ PAID":"⏳ UNPAID"}</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${invoice?.invoice_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(invoice?.inv_phone||job.customer_phone)?`📞 ${invoice?.inv_phone||job.customer_phone}<br/>`:""}
          ${(invoice?.inv_email||job.customer_email)?`✉️ ${invoice?.inv_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,dispModel,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km<br/>`:""}
          ${job.vin?`VIN: ${job.vin}`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-label">🔧 Job Info</div>
      <div class="card-info">
        ${job.mechanic?`Mechanic: <strong>${job.mechanic}</strong><br/>`:""}
        ${job.date_in?`Date In: ${job.date_in}<br/>`:""}
        ${job.date_out?`Date Out: ${job.date_out}`:""}
      </div>
    </div>
    <div class="card">
      <div class="card-label">💬 Complaint / Diagnosis</div>
      <div class="card-info">
        ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
        ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="text-align:right;width:60px">Qty</th>
      <th style="text-align:right;width:120px">Unit Price</th>
      <th style="text-align:right;width:120px">Total</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${invoice?.notes?`<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>`:""}

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for your business!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(),400);
}

export function printWorkshopQuote(job, allItems, quote, settings, photos={}, shareMode=false, vehicles=[]) {
  // Only print the items actually selected for this quote (quote.selected_item_ids), not every item on the job.
  const items = quote.selected_item_ids
    ? (()=>{ try{ const ids=new Set(JSON.parse(quote.selected_item_ids)); const f=allItems.filter(i=>ids.has(i.id)); return f.length>0?f:allItems; }catch{ return allItems; } })()
    : allItems;
  const dispModel = resolveVehicleModel(job, vehicles);
  const C = curSym(settings.currency||getSettings().currency);
  const fmt = v => `${C} ${(+v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const subtotal = items.reduce((s,i)=>s+(+i.total||0),0);
  const taxAmt   = settings.vat_number ? subtotal*(settings.tax_rate||0)/100 : 0;
  const total    = subtotal+taxAmt;
  const shopName = settings.shop_name||"Auto Workshop";
  const phone = (quote.quote_phone||job.customer_phone||"").replace(/\D/g,"");
  const waMsg = `📝 *Workshop Quotation ${quote.id}*\n👤 ${quote.quote_customer||job.customer_name||""}\n🚗 ${job.vehicle_reg||""}${job.vehicle_make?` — ${job.vehicle_make} ${dispModel||""}`:""}\n💰 Total: ${fmt(total)}\n\nPlease find the attached PDF quotation and confirm to proceed.\n\n${shopName}${settings.phone?`\n📞 ${settings.phone}`:""}`;
  const logoSrc = settings.logo_data || settings.logo_url || "";
  const logoHtml = logoSrc ? `<img src="${logoSrc}" style="max-height:70px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px"/>` : "";
  const photoList = [{url:photos.front,label:"Front"},{url:photos.rear,label:"Rear"},{url:photos.side,label:"Side"}].filter(p=>p.url);
  const photosBlock = photoList.length ? `
    <div style="width:190px;flex-shrink:0">
      <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">📸 Vehicle Photos</div>
      ${photoList.map(p=>`<div style="margin-bottom:6px">
        <img src="${toImgUrl(p.url)||p.url}" referrerpolicy="no-referrer" style="width:100%;height:58px;object-fit:cover;border-radius:6px;border:1px solid #e5e5e5;display:block"/>
        <div style="font-size:9px;font-weight:700;color:#666;text-align:center;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">${p.label}</div>
      </div>`).join("")}
    </div>` : "";

  const PT_ORDER = {"New-Replacement":0,"Original Parts":1,"Used Parts":2};
  const sortedItems = [...items].sort((a,b)=>{
    const td = (a.type==="part"?0:1)-(b.type==="part"?0:1);
    if(td!==0) return td;
    return (PT_ORDER[a.part_type]??99)-(PT_ORDER[b.part_type]??99);
  });

  const rowsHtml = sortedItems.map((i,idx)=>`
    <tr style="background:${idx%2===0?"#fff":"#f9f9f9"}">
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${i.type==="part"?"#dbeafe":"#dcfce7"};color:${i.type==="part"?"#1d4ed8":"#166534"};margin-right:6px">${i.type==="part"?"PART":"LABOUR"}</span>
        ${i.description}${i.part_sku?`<br/><span style="font-size:11px;color:#888;font-family:monospace;margin-left:2px">${i.part_sku}</span>`:""}
        ${(i.part_type||i.remark)?`<div style="margin-top:5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${i.part_type?`<span style="display:inline-block;padding:2px 9px;border-radius:6px;background:#f3f4f6;border:1px solid #d1d5db;font-size:10px;font-weight:700;white-space:nowrap">${i.part_type}</span>`:""} ${i.remark?`<span style="font-size:11px;color:#555;font-style:italic">${i.remark}</span>`:""}</div>`:""}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${fmt(i.unit_price)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:700">${fmt(i.total)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Quotation ${quote.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:820px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #2563eb;margin-bottom:24px}
  .shop-name{font-size:26px;font-weight:900;color:#f97316;letter-spacing:1px}
  .shop-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}
  .inv-block{text-align:right}
  .inv-title{font-size:20px;font-weight:700;color:#2563eb}
  .inv-no{font-size:15px;font-weight:700;color:#f97316;margin-top:4px}
  .inv-meta{font-size:12px;color:#555;margin-top:4px;line-height:1.8}
  .watermark{display:inline-block;padding:3px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
  .card{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:14px}
  .card-label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .card-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .card-info{font-size:12px;color:#555;line-height:1.7}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#2563eb;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  thead th:nth-child(n+2){text-align:right}
  .totals{margin-left:auto;width:260px;margin-bottom:24px}
  .t-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}
  .t-total{display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:800;color:#2563eb;border-top:2px solid #2563eb;margin-top:4px}
  .notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px;color:#1e40af}
  .notes{background:#fff8ed;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;margin-bottom:20px}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;text-align:center;line-height:1.8}
  .sig-box{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sig-line{border-top:1px solid #aaa;padding-top:6px;font-size:11px;color:#888;text-align:center}
  @media print{body{padding:18px}.ws-share-bar{display:none!important}}
</style></head><body>
${shareMode?`<div class="ws-share-bar" style="position:fixed;top:0;left:0;right:0;background:#1a1a2e;padding:11px 20px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 2px 12px rgba(0,0,0,.35)">
  <span style="color:#fff;font-weight:700;font-size:13px;flex:1">📄 ${shopName} — Quotation ${quote.id}</span>
  ${phone?`<a href="https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}" target="_blank" style="display:inline-flex;align-items:center;gap:7px;padding:8px 18px;background:#25D366;color:#fff;border-radius:7px;font-size:13px;font-weight:700;text-decoration:none">📱 Send via WhatsApp</a>`:""}
  <button onclick="window.print()" style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Save as PDF</button>
</div><div style="height:58px"></div>`:`<div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Print / Save PDF</button></div>`}

  <div class="header">
    <div>
      ${logoHtml}
      <div class="shop-name">${shopName}</div>
      <div class="shop-info">
        ${settings.phone?`📞 ${settings.phone}<br/>`:""}
        ${settings.email?`✉️ ${settings.email}<br/>`:""}
        ${settings.address?`📍 ${settings.address}<br/>`:""}
        ${(settings.city||settings.country)?`🌍 ${[settings.city,settings.country].filter(Boolean).join(", ")}<br/>`:""}
        ${settings.vat_number?`VAT Reg No: <strong>${settings.vat_number}</strong>`:`<em style="color:#aaa">Not VAT Registered</em>`}
      </div>
    </div>
    <div class="inv-block">
      <div class="inv-title">QUOTATION / ESTIMATE</div>
      <div class="inv-no">${quote.id}</div>
      <div class="inv-meta">
        Date: ${quote.quote_date}<br/>
        ${quote.valid_until?`Valid Until: ${quote.valid_until}<br/>`:""}
        <span class="watermark">⏳ AWAITING CONFIRMATION</span>
      </div>
    </div>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px">
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-label">👤 Customer</div>
        <div class="card-name">${quote.quote_customer||job.customer_name||"—"}</div>
        <div class="card-info">
          ${(quote.quote_phone||job.customer_phone)?`📞 ${quote.quote_phone||job.customer_phone}<br/>`:""}
          ${(quote.quote_email||job.customer_email)?`✉️ ${quote.quote_email||job.customer_email}`:""}
        </div>
      </div>
      <div class="card">
        <div class="card-label">🚗 Vehicle</div>
        <div class="card-name">${job.vehicle_reg||"—"}</div>
        <div class="card-info">
          ${[job.vehicle_make,dispModel,job.vehicle_year].filter(Boolean).join(" ")}<br/>
          ${job.vehicle_color?`Color: ${job.vehicle_color}<br/>`:""}
          ${job.mileage?`Mileage: ${Number(job.mileage).toLocaleString()} km`:""}
        </div>
      </div>
    </div>
    ${photosBlock}
  </div>

  ${job.complaint||job.diagnosis?`
  <div class="card" style="margin-bottom:20px">
    <div class="card-label">💬 Complaint / Diagnosis</div>
    <div class="card-info">
      ${job.complaint?`<em>${job.complaint}</em><br/>`:""}
      ${job.diagnosis?`<span style="color:#1d4ed8">${job.diagnosis}</span>`:""}
    </div>
  </div>`:""}

  <table>
    <thead><tr>
      <th>Description</th>
      <th style="width:60px">Qty</th>
      <th style="width:120px">Unit Price</th>
      <th style="width:120px">Amount</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="t-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${settings.vat_number&&(settings.tax_rate||0)>0?`<div class="t-row"><span>VAT (${settings.tax_rate}%)</span><span>${fmt(taxAmt)}</span></div>`:""}
    <div class="t-total"><span>QUOTED TOTAL</span><span>${fmt(total)}</span></div>
    ${!settings.vat_number?`<div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px">Not VAT Registered — no VAT charged</div>`:""}
  </div>

  ${quote.notes?`<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>`:""}

  <div class="notice">
    ℹ️ This is a <strong>quotation only</strong> — not a tax invoice. Prices are valid${quote.valid_until?` until <strong>${quote.valid_until}</strong>`:" as indicated"}.
    Work will commence upon written or verbal acceptance.
  </div>

  <div class="sig-box">
    <div class="sig-line">Customer Signature &amp; Date</div>
    <div class="sig-line">Authorised by &amp; Date</div>
  </div>

  ${quote.confirm_token?`
  <div style="margin-bottom:20px;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center">
    <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">🔗 Online Approval Link</div>
    <div style="font-size:12px;color:#555;margin-bottom:8px">Click the link below to view this quotation and approve or decline:</div>
    <a href="${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}" style="display:inline-block;padding:8px 20px;background:#2563eb;color:#fff;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;word-break:break-all">${window.location.origin}${window.location.pathname}?wsq=${quote.confirm_token}</a>
  </div>`:""}

  <div class="footer">
    ${shopName}${settings.phone?" · "+settings.phone:""}${settings.email?" · "+settings.email:""}<br/>
    Thank you for considering us!
  </div>

</body></html>`;

  const w = window.open("","_blank","width=860,height=1100");
  w.document.write(html);
  w.document.close();
  if (!shareMode) setTimeout(()=>w.print(),400);
}

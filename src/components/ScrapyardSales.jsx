import { useState } from "react";
import { api } from "../lib/api.js";
import { makeId, today, fmtAmt } from "../lib/helpers.js";
import { OC } from "../lib/constants.js";
import { StatusBadge, FG } from "./shared.jsx";
import { curSym } from "../lib/settings.js";

const SY_STATUSES = ["Processing","Quoted","Ready to Ship","Invoiced","Paid","Completed","Cancelled"];

function vatCalc(subtotal, settings) {
  if (!settings?.vat_number) return { subtotal, vatPct: 0, vatAmt: 0, total: subtotal };
  const pct = parseFloat(settings.vat_rate) || 15;
  const vatAmt = Math.round(subtotal * pct) / 100;
  return { subtotal, vatPct: pct, vatAmt, total: subtotal + vatAmt };
}

// ── Shared print CSS ─────────────────────────────────────────────
const PRINT_CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:36px;max-width:800px;margin:0 auto}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:26px;padding-bottom:16px;border-bottom:3px solid #111}.co-name{font-size:24px;font-weight:900;color:#c0000a;letter-spacing:1px}.co-info{font-size:11px;color:#555;margin-top:5px;line-height:1.7}.doc-title{font-size:20px;font-weight:700;text-align:right}.doc-no{font-size:14px;font-weight:700;color:#c0000a;margin:5px 0}.doc-meta{font-size:12px;color:#555;text-align:right;line-height:1.8}.party{background:#f9f9f9;border-radius:6px;padding:12px 16px;margin-bottom:20px;border:1px solid #e5e5e5}.party-lbl{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.party-name{font-size:15px;font-weight:700}.party-sub{font-size:12px;color:#555;margin-top:2px;line-height:1.6}table{width:100%;border-collapse:collapse;margin-bottom:20px}thead tr{background:#111;color:#fff}thead th{padding:9px 11px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}tbody tr:nth-child(even){background:#f9f9f9}tbody td{padding:9px 11px;border-bottom:1px solid #e5e5e5;font-size:13px}.right{text-align:right;font-weight:600}.totals{margin-left:auto;width:260px}.tot-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #eee}.tot-final{display:flex;justify-content:space-between;padding:11px 0;font-size:18px;font-weight:800;color:#c0000a;border-top:2px solid #111;margin-top:4px}.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:11px;color:#aaa;text-align:center;line-height:1.8}.badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#fff3cd;color:#856404}.badge-paid{background:#d1e7dd;color:#0a3622}@media print{@page{size:A4;margin:1cm}body{padding:0}}`;

function syPrintWindow(title, bodyHtml) {
  const w = window.open("","_blank","width=820,height=1060");
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

function coHeader(settings) {
  const name = settings.shop_name || settings.scrapyard_name || "SCRAPYARD";
  const logoSrc = settings.logo_data || settings.logo_url || "";
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" style="max-height:80px;max-width:220px;object-fit:contain;display:block;margin-bottom:10px"/>`
    : "";
  return `${logoHtml}<div class="co-name">${name}</div>
    <div class="co-info">
      ${settings.phone?`<div>&#128222; ${settings.phone}</div>`:""}
      ${settings.email?`<div>&#9993; ${settings.email}</div>`:""}
      ${settings.address?`<div>&#128205; ${settings.address}</div>`:""}
      ${settings.vat_number?`<div>VAT Reg: <strong>${settings.vat_number}</strong></div>`:""}
    </div>`;
}

// ── Print: Order Picking Slip ─────────────────────────────────────
export function syPrintOrder(order, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const vat = vatCalc(order.total, settings);
  const rows = (Array.isArray(order.items)?order.items:[]).map(it=>`
    <tr><td>${it.name}</td><td>${it.location||"—"}</td><td class="right">${it.qty}</td><td class="right">${fmt(it.price||0)}</td><td class="right">${fmt((it.price||0)*it.qty)}</td></tr>`).join("");
  syPrintWindow(`Order ${order.id}`, `
    <div class="hdr">
      <div>${coHeader(settings)}</div>
      <div><div class="doc-title">ORDER SLIP</div><div class="doc-no">${order.id}</div>
      <div class="doc-meta">Date: <strong>${order.date||today()}</strong><br>Status: <strong>${order.status}</strong></div></div>
    </div>
    <div class="party"><div class="party-lbl">Customer</div><div class="party-name">${order.customer_name}</div>
      <div class="party-sub">${order.customer_phone||""}</div></div>
    <table><thead><tr><th>Part</th><th>Location</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="totals">
      ${vat.vatPct?`<div class="tot-row"><span>Subtotal (excl. VAT)</span><span>${fmt(vat.subtotal)}</span></div>
      <div class="tot-row"><span>VAT (${vat.vatPct}%)</span><span>${fmt(vat.vatAmt)}</span></div>`:""}
      <div class="tot-final"><span>TOTAL${vat.vatPct?" INCL. VAT":""}</span><span>${fmt(vat.total)}</span></div>
    </div>
    <div class="footer">This is a picking slip — not a tax invoice &nbsp;·&nbsp; ${settings.shop_name||settings.scrapyard_name||"Scrapyard"}</div>`);
}

// ── Print: Full Invoice ───────────────────────────────────────────
export function syPrintInvoice(invoice, order, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const items = order && Array.isArray(order.items) ? order.items : [];
  const rows = items.map(it=>`
    <tr><td>${it.name}</td><td class="right">${it.qty}</td><td class="right">${fmt(it.price||0)}</td><td class="right">${fmt((it.price||0)*it.qty)}</td></tr>`).join("");
  const hasVat = (invoice.vat_pct||0) > 0;
  const subtotal = invoice.subtotal || invoice.total;
  const paidBadge = invoice.status==="paid"
    ? `<span class="badge badge-paid">PAID</span>`
    : `<span class="badge">UNPAID</span>`;
  syPrintWindow(`Invoice ${invoice.id}`, `
    <div class="hdr">
      <div>${coHeader(settings)}</div>
      <div><div class="doc-title">SALES INVOICE</div><div class="doc-no">${invoice.id}</div>
      <div class="doc-meta">Date: <strong>${invoice.invoice_date||today()}</strong><br>Status: ${paidBadge}</div></div>
    </div>
    <div class="party"><div class="party-lbl">Bill To</div><div class="party-name">${invoice.customer_name}</div>
      <div class="party-sub">${invoice.customer_phone||""}</div></div>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="4" style="text-align:center;color:#999">No line items</td></tr>`}</tbody></table>
    <div class="totals">
      <div class="tot-row"><span>Subtotal${hasVat?" (excl. VAT)":""}</span><span>${fmt(subtotal)}</span></div>
      ${hasVat?`<div class="tot-row"><span>VAT (${invoice.vat_pct}%)</span><span>${fmt(invoice.vat_amount||0)}</span></div>`:""}
      <div class="tot-final"><span>TOTAL${hasVat?" INCL. VAT":""}</span><span>${fmt(invoice.total)}</span></div>
    </div>
    ${invoice.notes?`<div style="margin-top:16px;font-size:12px;color:#555"><strong>Notes:</strong> ${invoice.notes}</div>`:""}
    <div class="footer">Thank you for your business &nbsp;·&nbsp; ${settings.shop_name||settings.scrapyard_name||"Scrapyard"}${settings.vat_number?`<br>VAT Reg: ${settings.vat_number}`:""}</div>`);
}

// ── Print: Payment Receipt ────────────────────────────────────────
export function syPrintReceipt(invoice, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const paidAmt = invoice.paid_amount ?? invoice.total;
  syPrintWindow(`Receipt ${invoice.id}`, `
    <div class="hdr">
      <div>${coHeader(settings)}</div>
      <div><div class="doc-title">PAYMENT RECEIPT</div><div class="doc-no">${invoice.id}</div>
      <div class="doc-meta">Date: <strong>${invoice.paid_at?new Date(invoice.paid_at).toLocaleDateString():today()}</strong></div></div>
    </div>
    <div class="party"><div class="party-lbl">Received From</div><div class="party-name">${invoice.customer_name}</div>
      <div class="party-sub">${invoice.customer_phone||""}</div></div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center">
      <div style="font-size:13px;color:#166534;font-weight:700;margin-bottom:4px">PAYMENT RECEIVED</div>
      <div style="font-size:40px;font-weight:900;color:#15803d;font-family:Arial Black,Arial">${fmt(paidAmt)}</div>
      ${invoice.payment_method?`<div style="font-size:13px;color:#166534;margin-top:6px">via ${invoice.payment_method}</div>`:""}
    </div>
    <div class="totals">
      <div class="tot-row"><span>Invoice #</span><span style="font-family:monospace">${invoice.id}</span></div>
      ${(invoice.vat_pct||0)>0?`
      <div class="tot-row"><span>Subtotal (excl. VAT)</span><span>${fmt(invoice.subtotal||invoice.total)}</span></div>
      <div class="tot-row"><span>VAT (${invoice.vat_pct}%)</span><span>${fmt(invoice.vat_amount||0)}</span></div>`:""}
      <div class="tot-row"><span>Invoice Total${(invoice.vat_pct||0)>0?" (incl. VAT)":""}</span><span>${fmt(invoice.total)}</span></div>
      <div class="tot-final"><span>AMOUNT PAID</span><span>${fmt(paidAmt)}</span></div>
    </div>
    <div class="footer">&#10003; Payment confirmed &nbsp;·&nbsp; ${settings.shop_name||settings.scrapyard_name||"Scrapyard"}</div>`);
}

// ── Thermal (80mm receipt printer) CSS & helpers ─────────────────
const THERMAL_CSS = `*{margin:0;padding:0;box-sizing:border-box}@page{size:80mm auto;margin:3mm}body{width:76mm;font-family:'Courier New',Courier,monospace;font-size:12px;color:#000;background:#fff}.c{text-align:center}.r{text-align:right}.b{font-weight:bold}.dash{border-top:1px dashed #000;margin:5px 0}.solid{border-top:2px solid #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0;font-size:12px}.co{font-size:15px;font-weight:900;text-align:center;letter-spacing:1px}.sub{font-size:10px;text-align:center;color:#333;line-height:1.6}.title{font-size:13px;font-weight:700;text-align:center;margin:4px 0}.xl{font-size:26px;font-weight:900;text-align:center;margin:6px 0}.item-name{font-size:12px;font-weight:600}.item-sub{font-size:10px;color:#444;padding-left:4px}.pad{margin:4px 0}`;

function syThermalWindow(title, bodyHtml) {
  const w = window.open("","_blank","width=400,height=700");
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${THERMAL_CSS}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

function thermalHeader(settings) {
  const name = settings.shop_name || settings.scrapyard_name || "SCRAPYARD";
  return `<div class="co">${name}</div>
    <div class="sub">
      ${settings.phone?`${settings.phone}<br>`:""}
      ${settings.address?`${settings.address}<br>`:""}
      ${settings.vat_number?`VAT: ${settings.vat_number}`:""}
    </div>`;
}

// ── Thermal: Order Slip ───────────────────────────────────────────
export function syThermalOrder(order, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const vat = vatCalc(order.total, settings);
  const items = (Array.isArray(order.items)?order.items:[]).map(it=>`
    <div class="item-name">${it.name}</div>
    <div class="row item-sub"><span>📍 ${it.location||"—"}  x${it.qty}</span><span>${fmt((it.price||0)*it.qty)}</span></div>`).join('<div class="dash"></div>');
  syThermalWindow(`Order ${order.id}`, `
    ${thermalHeader(settings)}
    <div class="solid"></div>
    <div class="title">ORDER SLIP</div>
    <div class="dash"></div>
    <div class="row"><span>Order #</span><span class="b">${order.id}</span></div>
    <div class="row"><span>Date</span><span>${order.date||today()}</span></div>
    <div class="row"><span>Status</span><span>${order.status}</span></div>
    <div class="solid"></div>
    <div class="row"><span>Customer</span><span class="b">${order.customer_name}</span></div>
    ${order.customer_phone?`<div class="row"><span>Phone</span><span>${order.customer_phone}</span></div>`:""}
    <div class="solid"></div>
    ${items}
    <div class="solid"></div>
    ${vat.vatPct?`
    <div class="row"><span>Subtotal</span><span>${fmt(vat.subtotal)}</span></div>
    <div class="row"><span>VAT (${vat.vatPct}%)</span><span>${fmt(vat.vatAmt)}</span></div>
    <div class="solid"></div>
    <div class="row b"><span>TOTAL INCL. VAT</span><span>${fmt(vat.total)}</span></div>`
    :`<div class="row b"><span>TOTAL</span><span>${fmt(order.total)}</span></div>`}
    <div class="solid"></div>
    <div class="c pad" style="font-size:10px">Picking slip — not a tax invoice</div>
    <br><br>`);
}

// ── Thermal: Invoice ──────────────────────────────────────────────
export function syThermalInvoice(invoice, order, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const items = order && Array.isArray(order.items) ? order.items : [];
  const rows = items.map(it=>`
    <div class="item-name">${it.name}</div>
    <div class="row item-sub"><span>x${it.qty}</span><span>${fmt((it.price||0)*it.qty)}</span></div>`).join('<div class="dash"></div>');
  const status = invoice.status==="paid" ? "*** PAID ***" : "UNPAID";
  syThermalWindow(`Invoice ${invoice.id}`, `
    ${thermalHeader(settings)}
    <div class="solid"></div>
    <div class="title">SALES INVOICE</div>
    <div class="dash"></div>
    <div class="row"><span>Invoice #</span><span class="b">${invoice.id}</span></div>
    <div class="row"><span>Date</span><span>${invoice.invoice_date||today()}</span></div>
    <div class="row"><span>Status</span><span class="b">${status}</span></div>
    <div class="solid"></div>
    <div class="row"><span>Bill To</span><span class="b">${invoice.customer_name}</span></div>
    ${invoice.customer_phone?`<div class="row"><span>Phone</span><span>${invoice.customer_phone}</span></div>`:""}
    <div class="solid"></div>
    ${rows||"<div>No items</div>"}
    <div class="solid"></div>
    ${(invoice.vat_pct||0)>0?`
    <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotal||invoice.total)}</span></div>
    <div class="row"><span>VAT (${invoice.vat_pct}%)</span><span>${fmt(invoice.vat_amount||0)}</span></div>
    <div class="solid"></div>
    <div class="row b"><span>TOTAL INCL. VAT</span><span>${fmt(invoice.total)}</span></div>`
    :`<div class="row b"><span>TOTAL</span><span>${fmt(invoice.total)}</span></div>`}
    <div class="solid"></div>
    ${invoice.notes?`<div class="pad" style="font-size:10px">Note: ${invoice.notes}</div><div class="dash"></div>`:""}
    <div class="c pad">Thank you for your business!</div>
    ${settings.vat_number?`<div class="c" style="font-size:10px">VAT Reg: ${settings.vat_number}</div>`:""}
    <br><br>`);
}

// ── Thermal: Payment Receipt ──────────────────────────────────────
export function syThermalReceipt(invoice, settings) {
  const cur = curSym(settings.currency||"ZAR R");
  const fmt = n => `${cur}${(n||0).toLocaleString()}`;
  const paidAmt = invoice.paid_amount ?? invoice.total;
  const paidDate = invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : today();
  syThermalWindow(`Receipt ${invoice.id}`, `
    ${thermalHeader(settings)}
    <div class="solid"></div>
    <div class="title">PAYMENT RECEIPT</div>
    <div class="solid"></div>
    <div class="row"><span>Customer</span><span class="b">${invoice.customer_name}</span></div>
    ${invoice.customer_phone?`<div class="row"><span>Phone</span><span>${invoice.customer_phone}</span></div>`:""}
    <div class="row"><span>Invoice #</span><span>${invoice.id}</span></div>
    <div class="row"><span>Date</span><span>${paidDate}</span></div>
    ${invoice.payment_method?`<div class="row"><span>Method</span><span class="b">${invoice.payment_method}</span></div>`:""}
    <div class="solid"></div>
    <div class="c b" style="font-size:11px;margin:3px 0">PAYMENT RECEIVED</div>
    <div class="xl">${fmt(paidAmt)}</div>
    <div class="solid"></div>
    ${(invoice.vat_pct||0)>0?`
    <div class="row"><span>Subtotal (excl. VAT)</span><span>${fmt(invoice.subtotal||invoice.total)}</span></div>
    <div class="row"><span>VAT (${invoice.vat_pct}%)</span><span>${fmt(invoice.vat_amount||0)}</span></div>
    <div class="dash"></div>`:""}
    <div class="row"><span>Invoice Total${(invoice.vat_pct||0)>0?" (incl. VAT)":""}</span><span>${fmt(invoice.total)}</span></div>
    <div class="row b"><span>AMOUNT PAID</span><span>${fmt(paidAmt)}</span></div>
    <div class="solid"></div>
    <div class="c pad">✓ Payment confirmed. Thank you!</div>
    <br><br>`);
}

// ── Order card (mobile + desktop shared) ─────────────────────────
function SyOrderCard({o, settings, onStatusChange, onSendQuote, onCreateInvoice, onRecordPayment, onPrintOrder, onThermalOrder, onDelete}) {
  const vat = vatCalc(o.total, settings);
  let action = null;
  if (o.status==="Processing")
    action = <button className="btn btn-sm" style={{background:"rgba(168,85,247,.15)",color:"#a855f7",border:"1px solid rgba(168,85,247,.3)"}} onClick={()=>onSendQuote(o)}>📋 Send Quote</button>;
  else if (o.status==="Quoted"||o.status==="Ready to Ship")
    action = <button className="btn btn-info btn-sm" onClick={()=>onCreateInvoice(o)}>🧾 Invoice</button>;
  else if (o.status==="Invoiced")
    action = <button className="btn btn-success btn-sm" onClick={()=>onRecordPayment(o)}>💳 Record Payment</button>;

  return (
    <div className="card" style={{padding:16,borderLeft:`3px solid ${OC[o.status]||"var(--border)"}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>{o.customer_name}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{o.customer_phone}</div>
          <code style={{fontSize:10,color:"var(--text3)"}}>{o.id}</code>
        </div>
        <div style={{textAlign:"right"}}>
          <StatusBadge status={o.status}/>
          <div style={{fontWeight:800,fontSize:18,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)",marginTop:4}}>{fmtAmt(vat.total)}</div>
          {vat.vatPct>0&&<div style={{fontSize:11,color:"var(--text3)"}}>excl. VAT: {fmtAmt(vat.subtotal)} + {vat.vatPct}%</div>}
          <div style={{fontSize:11,color:"var(--text3)"}}>{o.date}</div>
        </div>
      </div>
      <div style={{borderTop:"1px solid var(--border)",paddingTop:8,marginBottom:10}}>
        {Array.isArray(o.items)&&o.items.map((item,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"2px 0"}}>
            <span style={{color:"var(--text2)"}}>{item.name}{item.location?<span style={{color:"var(--text3)",fontSize:11}}> · 📍{item.location}</span>:null}</span>
            <span style={{fontWeight:600,color:"var(--accent)"}}>×{item.qty}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <select value={o.status} onChange={e=>onStatusChange(o.id,e.target.value)}
          style={{flex:1,background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:8,padding:"6px 10px",fontSize:13,cursor:"pointer"}}>
          {SY_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {action}
        <button className="btn btn-ghost btn-sm" title="Print A4 Order Slip" onClick={()=>onPrintOrder(o)}>🖨 A4</button>
        <button className="btn btn-ghost btn-sm" title="Print Receipt (80mm till)" onClick={()=>onThermalOrder(o)} style={{background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.3)",color:"var(--green)"}}>🧾 Till</button>
        <button className="btn btn-danger btn-sm" title="Delete order + invoice" onClick={()=>onDelete(o)}>🗑</button>
      </div>
    </div>
  );
}

// ── New Order Modal ───────────────────────────────────────────────
function SyNewOrderModal({scrapId, syCustomers, scrapParts, settings, onSave, onClose}) {
  const [custMode, setCustMode] = useState("select");
  const [custId, setCustId] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const selectedCust = syCustomers.find(c=>c.id===custId);
  const filteredParts = scrapParts.filter(p=>
    (p.quantity||0)>0 && (p.name||"").toLowerCase().includes(partSearch.toLowerCase())
  );
  const total = items.reduce((s,i)=>s+(i.price||0)*i.qty, 0);
  const vat = vatCalc(total, settings);

  const addPart = (p) => setItems(prev=>{
    const ex = prev.find(i=>i.partId===p.id);
    if (ex) return prev.map(i=>i.partId===p.id?{...i,qty:i.qty+1}:i);
    return [...prev,{partId:p.id,name:p.name,qty:1,price:p.price||0,location:p.location||""}];
  });
  const removeItem = (partId) => setItems(prev=>prev.filter(i=>i.partId!==partId));
  const changeQty = (partId,qty) => { if(qty<1)return; setItems(prev=>prev.map(i=>i.partId===partId?{...i,qty}:i)); };

  const save = async () => {
    const name = custMode==="select" ? (selectedCust?.name||"") : custName.toUpperCase().trim();
    const phone = custMode==="select" ? (selectedCust?.phone||"") : custPhone.trim();
    if (!name) { alert("CUSTOMER NAME REQUIRED"); return; }
    if (items.length===0) { alert("ADD AT LEAST ONE PART"); return; }
    setSaving(true);
    await onSave({name, phone, items, total});
    setSaving(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:560,width:"95%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{fontSize:17,fontWeight:700}}>New Order</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:6}}>CUSTOMER</div>
          <div className="tabs" style={{marginBottom:8}}>
            <button className={`tab ${custMode==="select"?"on":""}`} onClick={()=>setCustMode("select")}>Existing</button>
            <button className={`tab ${custMode==="new"?"on":""}`} onClick={()=>setCustMode("new")}>Walk-in</button>
          </div>
          {custMode==="select"
            ? <select value={custId} onChange={e=>setCustId(e.target.value)} style={{width:"100%",background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:8,padding:"8px 10px",fontSize:13}}>
                <option value="">— Select customer —</option>
                {syCustomers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` (${c.phone})`:""}</option>)}
              </select>
            : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <input className="inp" placeholder="NAME" value={custName} onChange={e=>setCustName(e.target.value.toUpperCase())}/>
                <input className="inp" placeholder="Phone" value={custPhone} onChange={e=>setCustPhone(e.target.value)}/>
              </div>
          }
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:6}}>ADD PARTS</div>
          <input className="inp" placeholder="Search parts…" value={partSearch} onChange={e=>setPartSearch(e.target.value)} style={{marginBottom:8}}/>
          <div style={{maxHeight:160,overflowY:"auto",border:"1px solid var(--border)",borderRadius:8,background:"var(--surface2)"}}>
            {filteredParts.slice(0,40).map(p=>(
              <div key={p.id} onClick={()=>addPart(p)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{p.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>{p.location||"No location"} · Qty: {p.quantity}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--accent)"}}>{fmtAmt(p.price||0)}</div>
                  <div style={{fontSize:10,color:"var(--green)"}}>+ Add</div>
                </div>
              </div>
            ))}
            {filteredParts.length===0&&<div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:13}}>No parts in stock matching search</div>}
          </div>
        </div>

        {items.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:6}}>ORDER ITEMS</div>
            {items.map(item=>(
              <div key={item.partId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                <div style={{flex:1,fontSize:13}}>{item.name}</div>
                <input type="number" min="1" value={item.qty} onChange={e=>changeQty(item.partId,+e.target.value)}
                  style={{width:56,background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:6,padding:"4px 8px",fontSize:13,textAlign:"center"}}/>
                <div style={{width:80,textAlign:"right",fontSize:13,fontWeight:600,color:"var(--accent)"}}>{fmtAmt((item.price||0)*item.qty)}</div>
                <button onClick={()=>removeItem(item.partId)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:18,lineHeight:1}}>✕</button>
              </div>
            ))}
            <div style={{marginTop:8,textAlign:"right"}}>
              {vat.vatPct>0&&<>
                <div style={{fontSize:12,color:"var(--text3)"}}>Subtotal (excl. VAT): {fmtAmt(vat.subtotal)}</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>VAT ({vat.vatPct}%): {fmtAmt(vat.vatAmt)}</div>
              </>}
              <div style={{fontWeight:800,fontSize:17,fontFamily:"Rajdhani,sans-serif",color:"var(--accent)"}}>
                TOTAL{vat.vatPct>0?" INCL. VAT":""}: {fmtAmt(vat.total)}
              </div>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||items.length===0}>
            {saving?"Saving…":"Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Modal ─────────────────────────────────────────────────
function SyInvoiceModal({order, scrapId, settings, onSave, onClose}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const vat = vatCalc(order.total, settings);
  const save = async () => {
    setSaving(true);
    await onSave({id:makeId("SYI"),scrapyard_id:scrapId,order_id:order.id,customer_name:order.customer_name,customer_phone:order.customer_phone||"",invoice_date:today(),subtotal:vat.subtotal,vat_pct:vat.vatPct,vat_amount:vat.vatAmt,total:vat.total,status:"unpaid",notes});
    setSaving(false);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:420,width:"95%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <h2 style={{fontSize:17,fontWeight:700}}>Create Invoice</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card" style={{padding:14,marginBottom:14,background:"var(--surface2)"}}>
          <div style={{fontWeight:700,marginBottom:2}}>{order.customer_name}</div>
          <div style={{fontSize:12,color:"var(--text3)"}}>{order.id}</div>
          {vat.vatPct>0
            ? <div style={{marginTop:6}}>
                <div style={{fontSize:12,color:"var(--text3)"}}>Subtotal (excl. VAT): {fmtAmt(vat.subtotal)}</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>VAT ({vat.vatPct}%): {fmtAmt(vat.vatAmt)}</div>
                <div style={{fontWeight:800,fontSize:20,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:4}}>TOTAL INCL. VAT: {fmtAmt(vat.total)}</div>
              </div>
            : <div style={{fontWeight:800,fontSize:20,color:"var(--accent)",fontFamily:"Rajdhani,sans-serif",marginTop:6}}>{fmtAmt(order.total)}</div>
          }
        </div>
        <textarea className="inp" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)} rows={3} style={{width:"100%",marginBottom:14}}/>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":"Create Invoice"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────
function SyPaymentModal({invoice, onSave, onClose}) {
  const [amount, setAmount] = useState(String(invoice.total||""));
  const [method, setMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!amount||isNaN(+amount)) { alert("ENTER VALID AMOUNT"); return; }
    setSaving(true);
    await onSave({invoiceId:invoice.id,orderId:invoice.order_id,amount:+amount,method});
    setSaving(false);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:360,width:"95%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <h2 style={{fontSize:17,fontWeight:700}}>Record Payment</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{marginBottom:12,fontWeight:600}}>{invoice.customer_name} — {fmtAmt(invoice.total)}</div>
        <FG label="Amount"><input className="inp" type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></FG>
        <FG label="Method">
          <select className="inp" value={method} onChange={e=>setMethod(e.target.value)}>
            {["Cash","Card","EFT","Other"].map(m=><option key={m}>{m}</option>)}
          </select>
        </FG>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" onClick={save} disabled={saving}>{saving?"Saving…":"Confirm Payment"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Return Modal ──────────────────────────────────────────────────
function SyReturnModal({scrapId, syInvoices, onSave, onClose}) {
  const [invId, setInvId] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const inv = syInvoices.find(i=>i.id===invId);
  const save = async () => {
    if (!reason.trim()) { alert("ENTER REASON"); return; }
    setSaving(true);
    await onSave({id:makeId("SYR"),scrapyard_id:scrapId,invoice_id:invId||null,customer_name:inv?.customer_name||"",reason:reason.toUpperCase(),total:+(amount||0),return_date:today(),status:"pending"});
    setSaving(false);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:400,width:"95%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <h2 style={{fontSize:17,fontWeight:700}}>Log Return</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <FG label="Linked Invoice (optional)">
          <select className="inp" value={invId} onChange={e=>setInvId(e.target.value)}>
            <option value="">— None —</option>
            {syInvoices.map(i=><option key={i.id} value={i.id}>{i.id} · {i.customer_name} · {fmtAmt(i.total)}</option>)}
          </select>
        </FG>
        <FG label="Reason *"><input className="inp" value={reason} onChange={e=>setReason(e.target.value.toUpperCase())} placeholder="REASON FOR RETURN"/></FG>
        <FG label="Return Amount"><input className="inp" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></FG>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={save} disabled={saving}>{saving?"Saving…":"Log Return"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Customer Modal ────────────────────────────────────────────────
function SyCustomerModal({scrapId, customer, onSave, onClose}) {
  const [f, setF] = useState({name:"",phone:"",email:"",address:"",...(customer||{})});
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.name.trim()) { alert("NAME REQUIRED"); return; }
    setSaving(true);
    await onSave({...f,name:f.name.toUpperCase(),scrapyard_id:scrapId,id:customer?.id||makeId("SYC")});
    setSaving(false);
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:400,width:"95%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <h2 style={{fontSize:17,fontWeight:700}}>{customer?"Edit":"Add"} Customer</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <FG label="Name *"><input className="inp" value={f.name} onChange={e=>s("name",e.target.value.toUpperCase())} placeholder="CUSTOMER NAME"/></FG>
        <FG label="Phone"><input className="inp" value={f.phone||""} onChange={e=>s("phone",e.target.value)} placeholder="+27…"/></FG>
        <FG label="Email"><input className="inp" value={f.email||""} onChange={e=>s("email",e.target.value)}/></FG>
        <FG label="Address"><textarea className="inp" value={f.address||""} onChange={e=>s("address",e.target.value.toUpperCase())} rows={2}/></FG>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTED PAGES
// ═══════════════════════════════════════════════════════════════

export function SyCustomersPage({scrapId, syCustomers, onRefresh, showToast}) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  const filtered = syCustomers.filter(c=>(c.name||"").toLowerCase().includes(search.toLowerCase())||(c.phone||"").includes(search));

  const save = async (data) => {
    if (syCustomers.find(c=>c.id===data.id)) {
      await api.patch("sy_customers","id",data.id,data);
      showToast("Customer updated");
    } else {
      await api.insert("sy_customers",data);
      showToast("Customer added");
    }
    await onRefresh(); setModal(null);
  };

  const del = async (id) => {
    if (!confirm("Delete this customer?")) return;
    await api.delete("sy_customers","id",id);
    showToast("Deleted","err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>👥 Customers</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{syCustomers.length} customers</p></div>
        <button className="btn btn-primary" onClick={()=>setModal("add")}>+ Add Customer</button>
      </div>
      <input className="inp" placeholder="Search name or phone…" value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:16}}/>
      {filtered.length===0
        ? <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No customers yet. Add your first customer.</div>
        : <div className="card" style={{overflow:"hidden"}}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["Name","Phone","Email","Address","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(c=>(
                    <tr key={c.id}>
                      <td style={{fontWeight:600}}>{c.name}</td>
                      <td style={{color:"var(--text3)"}}>{c.phone||"—"}</td>
                      <td style={{color:"var(--text3)",fontSize:13}}>{c.email||"—"}</td>
                      <td style={{color:"var(--text2)",fontSize:13}}>{c.address||"—"}</td>
                      <td><div style={{display:"flex",gap:5}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setModal(c)}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={()=>del(c.id)}>Delete</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      }
      {modal&&<SyCustomerModal scrapId={scrapId} customer={modal==="add"?null:modal} onSave={save} onClose={()=>setModal(null)}/>}
    </div>
  );
}

export function SyOrdersPage({scrapId, syOrders, syCustomers, scrapParts, syInvoices, onRefresh, showToast, settings}) {
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [showNew, setShowNew] = useState(false);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [paymentFor, setPaymentFor] = useState(null);

  const TABS = [["__all__","All"],["Processing","Processing"],["Quoted","Quoted"],["Ready to Ship","Ready to Ship"],["Invoiced","Invoiced"],["Paid","Paid"],["Completed","Completed"],["Cancelled","Cancelled"]];
  const filtered = filterStatus==="__all__" ? syOrders : syOrders.filter(o=>o.status===filterStatus);

  const placeOrder = async ({name,phone,items,total}) => {
    await api.insert("sy_orders",{id:makeId("SYO"),scrapyard_id:scrapId,customer_name:name,customer_phone:phone,date:today(),items,total,status:"Processing"});
    showToast("Order placed"); setShowNew(false); onRefresh();
  };

  const updateStatus = async (id,ns) => {
    await api.patch("sy_orders","id",id,{status:ns}); showToast("Status updated"); onRefresh();
  };

  const createInvoice = async (data) => {
    await api.insert("sy_invoices",data);
    await api.patch("sy_orders","id",data.order_id,{status:"Invoiced"});
    // Deduct stock for each item in the order
    if (invoiceFor && Array.isArray(invoiceFor.items)) {
      for (const item of invoiceFor.items) {
        if (!item.partId) continue;
        const res = await api.get("scrapyard_parts",`id=eq.${item.partId}&select=id,quantity`).catch(()=>[]);
        const part = Array.isArray(res) ? res[0] : null;
        if (part != null) {
          await api.patch("scrapyard_parts","id",item.partId,{quantity:Math.max(0,(part.quantity||0)-(item.qty||1))});
        }
      }
    }
    showToast("✅ Invoice created — stock deducted"); setInvoiceFor(null); onRefresh();
  };

  const recordPayment = async ({invoiceId,orderId,amount,method}) => {
    await api.patch("sy_invoices","id",invoiceId,{status:"paid",paid_at:new Date().toISOString(),payment_method:method,paid_amount:amount});
    await api.patch("sy_orders","id",orderId,{status:"Paid"});
    showToast("✅ Payment recorded"); setPaymentFor(null); onRefresh();
  };

  const deleteOrder = async (o) => {
    if (!confirm(`Delete order ${o.id} and any linked invoice? This cannot be undone.`)) return;
    const linkedInv = syInvoices.find(i=>i.order_id===o.id);
    // Restore stock only if invoice existed (stock was deducted at invoice creation)
    if (linkedInv && Array.isArray(o.items)) {
      for (const item of o.items) {
        if (!item.partId) continue;
        const res = await api.get("scrapyard_parts",`id=eq.${item.partId}&select=id,quantity`).catch(()=>[]);
        const part = Array.isArray(res) ? res[0] : null;
        if (part != null) await api.patch("scrapyard_parts","id",item.partId,{quantity:(part.quantity||0)+(item.qty||1)});
      }
    }
    if (linkedInv) await api.delete("sy_invoices","id",linkedInv.id);
    await api.delete("sy_orders","id",o.id);
    showToast("Deleted","err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>📋 Scrapyard Orders</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{syOrders.length} orders</p></div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}>🔄</button>
          <button className="btn btn-primary" onClick={()=>setShowNew(true)}>+ New Order</button>
        </div>
      </div>
      <div className="tabs" style={{marginBottom:16,flexWrap:"wrap"}}>
        {TABS.map(([val,label])=>{
          const cnt = val==="__all__"?syOrders.length:syOrders.filter(o=>o.status===val).length;
          return <button key={val} className={`tab ${filterStatus===val?"on":""}`} onClick={()=>setFilterStatus(val)}>{label} <span style={{opacity:.6,fontSize:11}}>{cnt}</span></button>;
        })}
      </div>
      {filtered.length===0
        ? <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No orders</div>
        : <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {filtered.map(o=>(
              <SyOrderCard key={o.id} o={o} settings={settings}
                onStatusChange={updateStatus}
                onSendQuote={(o)=>updateStatus(o.id,"Quoted")}
                onCreateInvoice={setInvoiceFor}
                onPrintOrder={(o)=>syPrintOrder(o, settings||{})}
                onThermalOrder={(o)=>syThermalOrder(o, settings||{})}
                onDelete={deleteOrder}
                onRecordPayment={(o)=>{
                  const inv = syInvoices.find(i=>i.order_id===o.id);
                  if (inv) setPaymentFor(inv);
                  else showToast("Create an invoice for this order first","err");
                }}
              />
            ))}
          </div>
      }
      {showNew&&<SyNewOrderModal scrapId={scrapId} syCustomers={syCustomers} scrapParts={scrapParts} settings={settings} onSave={placeOrder} onClose={()=>setShowNew(false)}/>}
      {invoiceFor&&<SyInvoiceModal order={invoiceFor} scrapId={scrapId} settings={settings} onSave={createInvoice} onClose={()=>setInvoiceFor(null)}/>}
      {paymentFor&&<SyPaymentModal invoice={paymentFor} onSave={recordPayment} onClose={()=>setPaymentFor(null)}/>}
    </div>
  );
}

export function SyInvoicesPage({scrapId, syInvoices, syOrders, onRefresh, showToast, settings}) {
  const [paymentFor, setPaymentFor] = useState(null);

  const recordPayment = async ({invoiceId,orderId,amount,method}) => {
    await api.patch("sy_invoices","id",invoiceId,{status:"paid",paid_at:new Date().toISOString(),payment_method:method,paid_amount:amount});
    if (orderId) await api.patch("sy_orders","id",orderId,{status:"Paid"});
    showToast("✅ Payment recorded"); setPaymentFor(null); onRefresh();
  };

  const deleteInvoiceAndOrder = async (inv) => {
    if (!confirm(`Delete invoice ${inv.id} and its linked order? This cannot be undone.`)) return;
    // Restore stock for each item (stock was deducted when invoice was created)
    const order = syOrders.find(o=>o.id===inv.order_id);
    if (order && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (!item.partId) continue;
        const res = await api.get("scrapyard_parts",`id=eq.${item.partId}&select=id,quantity`).catch(()=>[]);
        const part = Array.isArray(res) ? res[0] : null;
        if (part != null) await api.patch("scrapyard_parts","id",item.partId,{quantity:(part.quantity||0)+(item.qty||1)});
      }
    }
    await api.delete("sy_invoices","id",inv.id);
    if (inv.order_id) await api.delete("sy_orders","id",inv.order_id);
    showToast("Deleted","err"); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>🧾 Sales Invoices</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{syInvoices.length} invoices</p></div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>🔄 Refresh</button>
      </div>
      {syInvoices.length===0
        ? <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No invoices yet — create one from the Orders page.</div>
        : <div className="card" style={{overflow:"hidden"}}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["Invoice #","Customer","Date","Total","Status","Action"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {syInvoices.map(inv=>(
                    <tr key={inv.id}>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{inv.id}</code></td>
                      <td><div style={{fontWeight:600}}>{inv.customer_name}</div><div style={{fontSize:12,color:"var(--text3)"}}>{inv.customer_phone}</div></td>
                      <td style={{color:"var(--text3)"}}>{inv.invoice_date}</td>
                      <td>
                        <div style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)"}}>{fmtAmt(inv.total)}</div>
                        {(inv.vat_pct||0)>0&&<div style={{fontSize:10,color:"var(--text3)"}}>incl. {inv.vat_pct}% VAT</div>}
                      </td>
                      <td><StatusBadge status={inv.status}/></td>
                      <td>
                        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {inv.status!=="paid"
                            ? <button className="btn btn-success btn-xs" onClick={()=>setPaymentFor(inv)}>💳 Pay</button>
                            : <span className="badge" style={{background:"rgba(52,211,153,.12)",color:"var(--green)",fontSize:11}}>✅ Paid</span>
                          }
                          <button className="btn btn-ghost btn-xs" title="Print A4 Invoice"
                            onClick={()=>syPrintInvoice(inv, syOrders.find(o=>o.id===inv.order_id)||null, settings||{})}>🖨 A4</button>
                          <button className="btn btn-ghost btn-xs" title="Print Till Invoice (80mm)" style={{background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.3)",color:"var(--green)"}}
                            onClick={()=>syThermalInvoice(inv, syOrders.find(o=>o.id===inv.order_id)||null, settings||{})}>🧾 Till</button>
                          {inv.status==="paid"&&<>
                            <button className="btn btn-ghost btn-xs" title="Print A4 Receipt"
                              onClick={()=>syPrintReceipt(inv, settings||{})}>🖨 Receipt</button>
                            <button className="btn btn-ghost btn-xs" title="Print Till Receipt (80mm)" style={{background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.3)",color:"var(--green)"}}
                              onClick={()=>syThermalReceipt(inv, settings||{})}>🧾 Till Rcpt</button>
                          </>}
                          <button className="btn btn-danger btn-xs" title="Delete invoice + order" onClick={()=>deleteInvoiceAndOrder(inv)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      }
      {paymentFor&&<SyPaymentModal invoice={paymentFor} onSave={recordPayment} onClose={()=>setPaymentFor(null)}/>}
    </div>
  );
}

export function SyPickingPage({scrapId, syOrders, scrapParts, onRefresh, showToast}) {
  const active = syOrders.filter(o=>o.status==="Processing"||o.status==="Quoted"||o.status==="Ready to Ship");
  const [picked, setPicked] = useState({});

  const markReady = async (orderId) => {
    await api.patch("sy_orders","id",orderId,{status:"Ready to Ship"});
    showToast("✅ Marked ready to ship"); onRefresh();
  };

  if (active.length===0) return (
    <div className="fu">
      <div style={{marginBottom:18}}><h1 style={{fontSize:20,fontWeight:700}}>🔍 Picking</h1></div>
      <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No active orders to pick</div>
    </div>
  );

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>🔍 Picking</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{active.length} active orders</p></div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>🔄 Refresh</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {active.map(o=>{
          const allPicked = Array.isArray(o.items)&&o.items.length>0&&o.items.every((_,i)=>picked[`${o.id}-${i}`]);
          return (
            <div key={o.id} className="card" style={{padding:16,borderLeft:`3px solid ${OC[o.status]||"var(--border)"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{o.customer_name}</div>
                  <code style={{fontSize:10,color:"var(--text3)"}}>{o.id}</code>
                </div>
                <StatusBadge status={o.status}/>
              </div>
              <div style={{borderTop:"1px solid var(--border)",paddingTop:10,marginBottom:12}}>
                {Array.isArray(o.items)&&o.items.map((item,i)=>{
                  const part = scrapParts.find(p=>p.id===item.partId);
                  const done = !!picked[`${o.id}-${i}`];
                  return (
                    <div key={i} onClick={()=>setPicked(p=>({...p,[`${o.id}-${i}`]:!done}))}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer",opacity:done?.5:1}}>
                      <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${done?"var(--green)":"var(--border)"}`,background:done?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,flexShrink:0}}>
                        {done?"✓":""}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,textDecoration:done?"line-through":"none"}}>{item.name} ×{item.qty}</div>
                        <div style={{fontSize:11,color:"var(--text3)"}}>
                          {part?.location?`📍 ${part.location}`:"No location set"}
                          {(part?.photos?.length||0)>0&&<span style={{marginLeft:8,color:"var(--blue)"}}>📷 Photo available</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {o.status!=="Ready to Ship"
                ? <button className="btn btn-primary btn-sm" style={{width:"100%"}} disabled={!allPicked} onClick={()=>markReady(o.id)}>
                    {allPicked?"✅ All Picked — Mark Ready to Ship":"Tick all items to continue"}
                  </button>
                : <div style={{background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.3)",borderRadius:8,padding:"10px",textAlign:"center",color:"var(--green)",fontWeight:700,fontSize:13}}>
                    ✅ READY TO SHIP
                  </div>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SyReturnsPage({scrapId, syReturns, syInvoices, onRefresh, showToast}) {
  const [showNew, setShowNew] = useState(false);

  const saveReturn = async (data) => {
    await api.insert("sy_returns",data);
    showToast("Return logged"); setShowNew(false); onRefresh();
  };

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div><h1 style={{fontSize:20,fontWeight:700}}>↩️ Returns</h1><p style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{syReturns.length} returns</p></div>
        <button className="btn btn-primary" onClick={()=>setShowNew(true)}>+ Log Return</button>
      </div>
      {syReturns.length===0
        ? <div className="card" style={{padding:40,textAlign:"center",color:"var(--text3)"}}>No returns logged</div>
        : <div className="card" style={{overflow:"hidden"}}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr>{["Return #","Customer","Date","Invoice","Amount","Reason","Status"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {syReturns.map(r=>(
                    <tr key={r.id}>
                      <td><code style={{fontFamily:"DM Mono,monospace",fontSize:11,color:"var(--text3)"}}>{r.id}</code></td>
                      <td style={{fontWeight:600}}>{r.customer_name||"—"}</td>
                      <td style={{color:"var(--text3)"}}>{r.return_date}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{r.invoice_id||"—"}</td>
                      <td style={{fontWeight:700,fontFamily:"Rajdhani,sans-serif",fontSize:15,color:"var(--accent)"}}>{fmtAmt(r.total||0)}</td>
                      <td style={{color:"var(--text2)",fontSize:13}}>{r.reason||"—"}</td>
                      <td><StatusBadge status={r.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      }
      {showNew&&<SyReturnModal scrapId={scrapId} syInvoices={syInvoices} onSave={saveReturn} onClose={()=>setShowNew(false)}/>}
    </div>
  );
}

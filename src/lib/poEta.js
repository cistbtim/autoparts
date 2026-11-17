// ── Delivery tracking ────────────────────────────────────────────
// Hours after ordering with no supplier-confirmed ETA before it turns red.
export const PO_NO_ETA_ALERT_HOURS = 4;
export const fmtEta = (iso) => { try{ return new Date(iso).toLocaleString("en-ZA",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch{ return iso; } };
export const toLocalInput = (iso) => {
  if(!iso) return "";
  const d=new Date(iso); if(isNaN(d)) return "";
  const z=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
// Delivery state of a PO that's been ordered but not fully received.
// level: "late" (red) | "warn" (yellow) | "ok" (green) | null (nothing to track)
export const poEtaInfo = (po) => {
  if(!po || !["sent","partial"].includes(po.status)) return null;
  const now=Date.now();
  if(po.expected_at){
    const due=new Date(po.expected_at).getTime();
    if(now>due) return {level:"late",label:`⚠️ Overdue — was due ${fmtEta(po.expected_at)}`};
    return {level:"ok",label:`🚚 ETA ${fmtEta(po.expected_at)}`};
  }
  const since=new Date(po.ordered_at||po.created_at||now).getTime();
  const h=Math.max(0,Math.floor((now-since)/36e5));
  const ago=h>=48?`${Math.floor(h/24)} days`:`${h} h`;
  return h>=PO_NO_ETA_ALERT_HOURS
    ? {level:"late",label:`⚠️ No delivery time confirmed — ordered ${ago} ago`}
    : {level:"warn",label:`⏳ No delivery time yet — ordered ${ago} ago`};
};
export const ETA_COLOR={late:"var(--red)",warn:"var(--yellow)",ok:"var(--green)"};
export const ETA_BG={late:"rgba(248,113,113,.12)",warn:"rgba(251,191,36,.12)",ok:"rgba(52,211,153,.12)"};


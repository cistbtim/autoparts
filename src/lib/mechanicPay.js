// Mechanic / painter account ("payroll"): what the workshop owes a mechanic after finished jobs,
// less charges, supplier invoices paid for them and payments made. Shared by the workshop's
// Mechanic Pay page and the mechanic's own read-only statement link (?mechpay=<token>).
//
//   balance = earned (priced replies on FINISHED jobs)
//             + credits (refunds / discounts given to the mechanic)
//             - deductions (things sold to him, supplier invoices paid for him, discounts taken off, refunds back)
//             - paid (cash / EFT payments to him)
//   balance > 0  -> the workshop owes the mechanic;  balance < 0 -> the mechanic owes the workshop.

// Same set the job card link uses to lock itself: once a job is one of these the mechanic can no longer edit it.
export const MECH_DONE = ["Done", "Invoiced", "Payment Received", "Completed", "Closed"];

export const ENTRY_TYPES = {
  payment:          { label: "Payment to mechanic",              icon: "💵", short: "Payment" },
  charge:           { label: "Charge (I sold him something)",    icon: "🛒", short: "Charge" },
  supplier_invoice: { label: "Supplier invoice paid for him",    icon: "🧾", short: "Supplier invoice" },
  refund:           { label: "Refund",                           icon: "↩️", short: "Refund" },
  discount:         { label: "Discount",                         icon: "🏷️", short: "Discount" },
};

// Which way an entry moves the balance by default (refund / discount let the user pick).
export const DEFAULT_DIRECTION = { payment: -1, charge: -1, supplier_invoice: -1, refund: 1, discount: 1 };

const norm = (x) => (x || "").trim().toLowerCase();
export const sameName = (a, b) => norm(a) === norm(b);

export function computeAccount({ replies = [], jobs = [], ledger = [] }) {
  // one reply per job (the latest), since a mechanic updates his reply on the same link
  const byJob = new Map();
  replies.forEach((r) => {
    const cur = byJob.get(String(r.job_id));
    if (!cur || new Date(r.created_at) > new Date(cur.created_at)) byJob.set(String(r.job_id), r);
  });
  const jobRows = [];
  let earned = 0;
  byJob.forEach((r, jid) => {
    const j = jobs.find((x) => String(x.id) === jid);
    if (!j) return;
    const done = MECH_DONE.includes(j.status);
    const total = +r.total || 0;
    if (done) earned += total;
    jobRows.push({ job: j, reply: r, total, done });
  });
  jobRows.sort((a, b) => String(b.job.date_in || "").localeCompare(String(a.job.date_in || "")));
  let credits = 0, deductions = 0, paid = 0;
  ledger.forEach((e) => {
    const v = (+e.direction || 0) * (+e.amount || 0);
    if (e.entry_type === "payment") paid += (+e.amount || 0) * (+e.direction === 1 ? -1 : 1);
    else if (v >= 0) credits += v;
    else deductions += -v;
  });
  const balance = earned + credits - deductions - paid;
  return { earned, credits, deductions, paid, balance, jobRows };
}

// Loads everything needed to compute accounts. Bulk mode (workshop page): all contacts of one workshop.
// Statement mode (public page): pass `contactId` so only that person's ledger rows are downloaded.
export async function loadMechanicData(api, { wsId, contacts, contactId = null }) {
  const names = [...new Set(contacts.map((c) => c.name).filter(Boolean))];
  const q = (s) => encodeURIComponent(`"${String(s).replace(/"/g, '\\"')}"`);
  const [replyRows, ledgerRows] = await Promise.all([
    names.length
      ? api.fresh("workshop_job_replies", `mechanic_name=in.(${names.map(q).join(",")})`).catch(() => [])
      : Promise.resolve([]),
    api.fresh("workshop_contact_ledger", contactId
      ? `contact_id=eq.${encodeURIComponent(contactId)}&order=entry_date.desc,created_at.desc`
      : `workshop_id=eq.${encodeURIComponent(wsId)}&order=entry_date.desc,created_at.desc`).catch(() => []),
  ]);
  const replies = Array.isArray(replyRows) ? replyRows : [];
  const ids = [...new Set(replies.map((r) => String(r.job_id)))];
  let jobs = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const part = await api.fresh("workshop_jobs",
      `id=in.(${chunk.map(q).join(",")})&select=id,vehicle_reg,vehicle_make,vehicle_model,status,date_in,workshop_id`).catch(() => []);
    if (Array.isArray(part)) jobs = jobs.concat(part);
  }
  // only this workshop's jobs (a name could also have worked for another workshop)
  jobs = jobs.filter((j) => !wsId || String(j.workshop_id) === String(wsId));
  return { replies, jobs, ledger: Array.isArray(ledgerRows) ? ledgerRows : [] };
}

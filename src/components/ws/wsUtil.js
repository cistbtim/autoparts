// Plain helpers shared by the Service Reminders and Time & profit features (no JSX here).

// SQL for the tables they use. The same text lives in ws_reminders_and_time.sql at the repo root.
// Run it once in the Supabase SQL editor.
export const SETUP_SQL = `create table if not exists ws_service_reminders (
  id text primary key,
  workshop_id text not null,
  job_id text,
  vehicle_reg text,
  vehicle_make text,
  vehicle_model text,
  customer_name text,
  customer_phone text,
  due_date date,
  due_km integer,
  note text,
  status text not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ws_service_reminders_ws_idx on ws_service_reminders (workshop_id, status, due_date);
alter table ws_service_reminders enable row level security;
drop policy if exists "ws_service_reminders open" on ws_service_reminders;
create policy "ws_service_reminders open" on ws_service_reminders for all using (true) with check (true);

create table if not exists ws_time_entries (
  id text primary key,
  workshop_id text not null,
  job_id text not null,
  mechanic_name text,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes numeric,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ws_time_entries_ws_idx on ws_time_entries (workshop_id, job_id);
alter table ws_time_entries enable row level security;
drop policy if exists "ws_time_entries open" on ws_time_entries;
create policy "ws_time_entries open" on ws_time_entries for all using (true) with check (true);

create table if not exists ws_labour_pay (
  id text primary key,
  workshop_id text not null,
  job_id text not null,
  item_id text not null,
  mechanic_name text,
  pay numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ws_labour_pay_ws_idx on ws_labour_pay (workshop_id, job_id);
alter table ws_labour_pay enable row level security;
drop policy if exists "ws_labour_pay open" on ws_labour_pay;
create policy "ws_labour_pay open" on ws_labour_pay for all using (true) with check (true);`;

// PostgREST answers with an error object (not an array) when a table does not exist yet.
export const isMissingTable = (res) =>
  !!res && !Array.isArray(res) &&
  (res.code === "PGRST205" || res.code === "42P01" || /schema cache|does not exist|relation/i.test(res.message || ""));

export const isDbError = (res) => !!res && !Array.isArray(res) && !!(res.code || res.message);

const pad2 = (n) => String(n).padStart(2, "0");

// "2h 15m" / "45m" from minutes
export function fmtDur(min) {
  const m = Math.max(0, Math.round(+min || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad2(m % 60)}m` : `${m}m`;
}

// Revenue, parts cost and gross profit for one job from its line items.
// `pays` = technician pay records for the job (one per labour line); that pay counts as a cost.
export function jobFinancials(items = [], pays = []) {
  let revenue = 0, partsCost = 0, labourRevenue = 0, partsRevenue = 0, partsNoCost = 0;
  for (const it of items) {
    const qty = +it.qty || 1;
    const line = it.total != null && it.total !== "" ? +it.total : (+it.unit_price || 0) * qty;
    revenue += line;
    if (it.type === "labour") labourRevenue += line;
    else {
      partsRevenue += line;
      partsCost += (+it.cost_price || 0) * qty;
      if (!(+it.cost_price > 0)) partsNoCost++;
    }
  }
  const labourCost = pays.reduce((s, p) => s + (+p.pay || 0), 0);
  const profit = revenue - partsCost - labourCost;
  return { revenue, partsCost, labourCost, labourRevenue, partsRevenue, partsNoCost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

-- Workshop: Service Reminders + Time tracking + Technician pay tables.
-- Run once in the Supabase SQL editor. Safe to run again (uses IF NOT EXISTS).

create table if not exists ws_service_reminders (
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
create policy "ws_labour_pay open" on ws_labour_pay for all using (true) with check (true);

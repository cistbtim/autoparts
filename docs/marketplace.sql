-- ============================================================
-- Scrapyard Match (marketplace) — points, search log, reveal requests
-- Run once in the Supabase SQL Editor.
--
-- NOTE: like the rest of the app these tables are read/written with the public key,
-- so for the pilot the points are a tracking/management tool among trusted testers,
-- not tamper-proof money. Scrapyard contact details are never shown in the workshop UI.
-- ============================================================

-- Points: one row per change (never edit rows — add a correcting row instead).
-- A workshop's balance = SUM(delta).
create table if not exists ms_credit_ledger (
  id             bigint generated always as identity primary key,
  workshop_id    text   not null,
  workshop_name  text,
  delta          integer not null,            -- +grant / -spend
  reason         text   not null,             -- trial | admin_grant | admin_adjust | reveal
  ref            text,                        -- e.g. the reveal request id
  note           text,
  created_by     text,
  created_at     timestamptz not null default now()
);
create index if not exists ms_credit_ledger_ws on ms_credit_ledger (workshop_id);

-- Every VIN search a workshop runs (usage tracking).
create table if not exists ms_search_log (
  id             bigint generated always as identity primary key,
  workshop_id    text   not null,
  workshop_name  text,
  vin            text,
  make           text,
  model          text,
  match_count    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ms_search_log_ws on ms_search_log (workshop_id);

-- "Reveal who has it" requests; the admin approves, deducts the points and introduces both sides.
create table if not exists ms_reveal_requests (
  id                    bigint generated always as identity primary key,
  workshop_id           text   not null,
  workshop_name         text,
  workshop_phone        text,
  scrapyard_vehicle_id  bigint not null,
  scrapyard_id          bigint,
  vehicle_summary       text,
  parts_wanted          text,
  status                text   not null default 'pending',   -- pending | approved | rejected
  cost                  integer not null default 1,
  admin_note            text,                                 -- shown to the workshop once approved/rejected
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz
);
create index if not exists ms_reveal_requests_ws on ms_reveal_requests (workshop_id);
create index if not exists ms_reveal_requests_status on ms_reveal_requests (status);

-- Photo Review: which scrapyard photos the admin has checked (so only NEW photos show up for review).
-- source = 'vehicle' | 'part'; field = the photo column; url = the photo's URL at review time.
create table if not exists ms_photo_review (
  id           bigint generated always as identity primary key,
  source       text   not null,
  row_id       bigint not null,
  field        text   not null,
  url          text   not null,
  status       text   not null,                 -- clean | fixed | removed
  reviewed_by  text,
  reviewed_at  timestamptz not null default now()
);
create index if not exists ms_photo_review_row on ms_photo_review (source, row_id);

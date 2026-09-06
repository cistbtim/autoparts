-- Supplier-Owned Stock & Booking System — run once in Supabase SQL editor

-- 1. Catalogue-linked parts: add the supplier's own stock/location
ALTER TABLE part_suppliers ADD COLUMN IF NOT EXISTS stock int NOT NULL DEFAULT 0;
ALTER TABLE part_suppliers ADD COLUMN IF NOT EXISTS bin_location text;

-- 2. Self-added parts: stock already exists, just add location
ALTER TABLE supplier_parts ADD COLUMN IF NOT EXISTS bin_location text;

-- 3. Stock movement ledger — "My Stock Records"
CREATE TABLE IF NOT EXISTS supplier_stock_logs (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  source_type text NOT NULL,              -- 'catalogue' | 'own'
  part_suppliers_id text,                 -- set when source_type = 'catalogue'
  supplier_part_id text,                  -- set when source_type = 'own'
  item_name text,
  sku text,
  change_qty int NOT NULL,
  before_qty int,
  after_qty int,
  reason text,                            -- 'sale' | 'manual_booking' | 'stock_take'
  ref_type text,                          -- 'order' | 'booking' | 'stock_take'
  ref_id text,
  created_by text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_logs_supplier ON supplier_stock_logs(supplier_id, created_at DESC);

-- 4. Stock take headers + items — "My Stock Take"
CREATE TABLE IF NOT EXISTS supplier_stock_takes (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'open',    -- 'open' | 'completed'
  created_by text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_takes_supplier ON supplier_stock_takes(supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_stock_take_items (
  id text PRIMARY KEY,
  stock_take_id text NOT NULL,
  source_type text NOT NULL,              -- 'catalogue' | 'own'
  part_suppliers_id text,
  supplier_part_id text,
  item_name text,
  sku text,
  bin_location text,
  system_qty int,
  counted_qty int,
  variance int,
  counted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_supplier_stock_take_items_take ON supplier_stock_take_items(stock_take_id);

-- 5. Bookings (confirmed orders + manual entries) + line items — "My Orders"
CREATE TABLE IF NOT EXISTS supplier_bookings (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  source_order_id text,                   -- set when confirmed from a real Spare Shop order; null = manual booking
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'confirmed', -- 'pending' | 'confirmed' | 'invoiced' | 'cancelled'
  notes text,
  discount_pct numeric DEFAULT 0,
  subtotal numeric,
  total numeric,
  created_by text,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  invoiced_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_supplier_bookings_supplier ON supplier_bookings(supplier_id, created_at DESC);
-- If you already ran this file before discount/total support was added, run just these:
-- ALTER TABLE supplier_bookings ADD COLUMN IF NOT EXISTS discount_pct numeric DEFAULT 0;
-- ALTER TABLE supplier_bookings ADD COLUMN IF NOT EXISTS subtotal numeric;
-- ALTER TABLE supplier_bookings ADD COLUMN IF NOT EXISTS total numeric;

CREATE TABLE IF NOT EXISTS supplier_booking_items (
  id text PRIMARY KEY,
  booking_id text NOT NULL,
  source_type text NOT NULL,              -- 'catalogue' | 'own'
  part_id text,                           -- the real parts.id, for catalogue items (display/reference only)
  part_suppliers_id text,                 -- the actual stock row for catalogue items — needed to restore stock on delete
  supplier_part_id text,                  -- set when source_type = 'own' (also the stock row for own items)
  part_name text,
  sku text,
  qty int NOT NULL,
  unit_price numeric,
  unit_cost numeric
);
CREATE INDEX IF NOT EXISTS idx_supplier_booking_items_booking ON supplier_booking_items(booking_id);
-- If you already ran this file before delete/restock support was added, run just this:
-- ALTER TABLE supplier_booking_items ADD COLUMN IF NOT EXISTS part_suppliers_id text;

-- 6. Purchase invoices (supplier receiving stock into their own shelf) + line items
CREATE TABLE IF NOT EXISTS supplier_purchase_invoices (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  invoice_no text,
  invoice_date date,
  from_name text,          -- who they bought it from (free text, optional)
  notes text,
  shipping_cost numeric DEFAULT 0,
  customs_cost_usd numeric DEFAULT 0,
  exchange_rate numeric,   -- USD -> local currency, applied to customs_cost_usd
  total numeric,           -- computed: items + shipping_cost + (customs_cost_usd * exchange_rate)
  invoice_total numeric,   -- typed from the actual paper/supplier invoice, to reconcile against total
  total_qty int,           -- sum of qty across all line items
  status text NOT NULL DEFAULT 'pending', -- 'pending' (recorded, stock not yet applied) | 'received' (stock committed)
  received_at timestamptz,
  created_by text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_purchase_invoices_supplier ON supplier_purchase_invoices(supplier_id, created_at DESC);
-- If you already ran this file before landed-cost fields were added, run just these:
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS invoice_date date;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS customs_cost_usd numeric DEFAULT 0;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS invoice_total numeric;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS total_qty int;
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
-- ALTER TABLE supplier_purchase_invoices ADD COLUMN IF NOT EXISTS received_at timestamptz;

CREATE TABLE IF NOT EXISTS supplier_purchase_invoice_items (
  id text PRIMARY KEY,
  invoice_id text NOT NULL,
  source_type text NOT NULL,       -- 'catalogue' | 'own'
  part_id text,                    -- the real parts.id, for catalogue items (display/reference only)
  part_suppliers_id text,          -- the actual stock row for catalogue items
  supplier_part_id text,           -- set when source_type = 'own' (also the stock row for own items)
  part_name text,
  sku text,
  qty int NOT NULL,
  unit_cost numeric,
  bin_location text
);
CREATE INDEX IF NOT EXISTS idx_supplier_purchase_invoice_items_invoice ON supplier_purchase_invoice_items(invoice_id);

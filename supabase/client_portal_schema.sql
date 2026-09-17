-- ============================================================
-- HIVE CLIENT PORTAL — schema, tenancy and fulfilment model
--
-- Replaces the PSS (Permit & Shipping Services) module.
-- Run AFTER supabase/drop_pss_module.sql, in the SQL Editor.
--
-- What this adds
--   1. Client accounts + Supabase Auth mapping  (clients, client_users)
--   2. Per-client stock held by BATCH, not by cargo movement
--      (client_products, stock_batches) — carries the actual warehouse
--      receiving date, optional batch/lot, optional expiry
--   3. Client-submitted delivery requests (client_orders, client_order_lines)
--   4. Stock allocation ledger (stock_allocations) — FEFO, reversible
--   5. Configurable delivery cut-off rules (delivery_settings)
--   6. Row Level Security: a client can only ever read its own rows,
--      and can never write stock directly
--
-- Design note: every client-initiated write goes through a SECURITY DEFINER
-- function. Clients hold NO direct INSERT/UPDATE grant on any table, so
-- stock validation and allocation can't be bypassed from the browser.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. CLIENT ACCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,          -- short handle, e.g. 'OKI'
  name          TEXT NOT NULL,                 -- legal / display name
  -- Free-text company name as it appears on existing movements. Lets us
  -- reconcile historic movement rows to a client account during backfill.
  legacy_company_name TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address       TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_legacy_company_idx ON clients(legacy_company_name);

-- Maps a Supabase Auth user to the client whose data they may see.
-- One user belongs to exactly one client; a client may have many users.
CREATE TABLE IF NOT EXISTS client_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',  -- member | admin (client-side admin)
  full_name   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_users_client_idx ON client_users(client_id);

-- Internal Zhenghe staff who log in with Supabase Auth. Present so RLS can
-- tell staff from customers. Internal portals still use the anon key today —
-- see the INTERIM section at the foot of this file.
CREATE TABLE IF NOT EXISTS staff_users (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'ops',     -- ops | warehouse | admin
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tenancy helpers ───────────────────────────────────────────
-- STABLE so the planner can inline them into RLS predicates.

CREATE OR REPLACE FUNCTION current_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM client_users
   WHERE user_id = auth.uid() AND active
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_users WHERE user_id = auth.uid() AND active
  );
$$;

-- TRUE for the internal apps (Hive / Brood) which still connect with the
-- anon key and no auth session. Delete this once staff move to Supabase Auth.
CREATE OR REPLACE FUNCTION is_internal_anon()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.role() = 'anon';
$$;

-- ============================================================
-- 2. PRODUCTS AND STOCK — held per client, per batch
-- ============================================================

-- The client's SKU catalogue. Stock, orders and allocations all hang off
-- this, so a SKU means one thing across the whole portal.
CREATE TABLE IF NOT EXISTS client_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  description   TEXT,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  -- Expiry is optional per the brief: not every product is date-controlled.
  track_expiry  BOOLEAN NOT NULL DEFAULT FALSE,
  track_batch   BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, sku)
);

CREATE INDEX IF NOT EXISTS client_products_client_idx ON client_products(client_id);

-- One row per physical receipt of a SKU. This is the single source of truth
-- for stock balance and the answer to "track by customer account, not by
-- individual cargo movement" — movement_id is provenance, not identity.
CREATE TABLE IF NOT EXISTS stock_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES client_products(id) ON DELETE RESTRICT,

  batch_no        TEXT,                        -- optional lot / batch
  received_date   DATE NOT NULL,               -- ACTUAL warehouse receiving date
  expiry_date     DATE,                        -- optional
  location        TEXT,

  qty_received    NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_allocated   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_allocated >= 0),
  qty_dispatched  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_dispatched >= 0),
  -- Derived, never written by hand.
  qty_available   NUMERIC(14,4) GENERATED ALWAYS AS
                    (qty_received - qty_allocated - qty_dispatched) STORED,

  -- Provenance back into the existing ops tables.
  movement_id     UUID REFERENCES movements(id) ON DELETE SET NULL,
  stock_line_id   UUID REFERENCES stock_lines(id) ON DELETE SET NULL,

  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Can't allocate or ship more than was received.
  CONSTRAINT stock_batches_not_oversold
    CHECK (qty_allocated + qty_dispatched <= qty_received)
);

CREATE INDEX IF NOT EXISTS stock_batches_client_idx   ON stock_batches(client_id);
CREATE INDEX IF NOT EXISTS stock_batches_product_idx  ON stock_batches(product_id);
CREATE INDEX IF NOT EXISTS stock_batches_movement_idx ON stock_batches(movement_id);
-- Supports FEFO picking: earliest expiry, then earliest receipt.
CREATE INDEX IF NOT EXISTS stock_batches_fefo_idx
  ON stock_batches(product_id, expiry_date NULLS LAST, received_date)
  WHERE qty_received > qty_allocated + qty_dispatched;

-- Rolled-up stock position per SKU. This is what the client's Inventory
-- screen reads — one row per product, matching the brief's table.
CREATE OR REPLACE VIEW client_stock_summary AS
SELECT
  p.client_id,
  p.id                                   AS product_id,
  p.sku,
  p.description,
  p.unit,
  p.track_expiry,
  COALESCE(SUM(b.qty_received),   0)     AS qty_received,
  COALESCE(SUM(b.qty_available),  0)     AS qty_available,
  COALESCE(SUM(b.qty_allocated),  0)     AS qty_allocated,
  COALESCE(SUM(b.qty_dispatched), 0)     AS qty_dispatched,
  MAX(b.received_date)                   AS last_received_date,
  -- Earliest expiry among batches that still have sellable stock.
  MIN(b.expiry_date) FILTER (WHERE b.qty_available > 0) AS next_expiry_date,
  COUNT(b.id) FILTER (WHERE b.qty_available > 0)        AS open_batches
FROM client_products p
LEFT JOIN stock_batches b ON b.product_id = p.id
WHERE p.active
GROUP BY p.client_id, p.id, p.sku, p.description, p.unit, p.track_expiry;

-- ============================================================
-- 3. DELIVERY CUT-OFF RULES
-- ============================================================

-- One global row (client_id IS NULL) plus optional per-client overrides,
-- so different operations can diverge later without a schema change.
CREATE TABLE IF NOT EXISTS delivery_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  cutoff_time    TIME NOT NULL DEFAULT '13:00',
  timezone       TEXT NOT NULL DEFAULT 'Asia/Singapore',
  -- Lead time in business days on top of the cut-off result. 0 = next slot.
  lead_days      INTEGER NOT NULL DEFAULT 0 CHECK (lead_days >= 0),
  -- ISO weekday numbers that are operating days (1 = Mon … 7 = Sun).
  working_days   INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

-- Exactly one global default row.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_settings_global_idx
  ON delivery_settings ((client_id IS NULL)) WHERE client_id IS NULL;

INSERT INTO delivery_settings (client_id, cutoff_time, timezone, lead_days)
SELECT NULL, '13:00', 'Asia/Singapore', 0
WHERE NOT EXISTS (SELECT 1 FROM delivery_settings WHERE client_id IS NULL);

-- Public holidays / shutdown days, skipped when scheduling.
CREATE TABLE IF NOT EXISTS delivery_blackout_dates (
  blackout_date DATE PRIMARY KEY,
  reason        TEXT
);

-- Earliest delivery date for an order submitted at p_submitted_at.
-- Used by the portal preview AND by order creation, so the date the client
-- is shown before submitting is the date they get.
CREATE OR REPLACE FUNCTION next_delivery_date(
  p_client_id    UUID,
  p_submitted_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS DATE LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s         delivery_settings%ROWTYPE;
  local_ts  TIMESTAMP;
  d         DATE;
  remaining INTEGER;
  guard     INTEGER := 0;
BEGIN
  SELECT * INTO s FROM delivery_settings WHERE client_id = p_client_id;
  IF NOT FOUND THEN
    SELECT * INTO s FROM delivery_settings WHERE client_id IS NULL;
  END IF;
  IF NOT FOUND THEN
    -- No configuration at all: fall back to the documented 1pm SG rule.
    s.cutoff_time := '13:00';
    s.timezone    := 'Asia/Singapore';
    s.lead_days   := 0;
    s.working_days := ARRAY[1,2,3,4,5];
  END IF;

  local_ts := p_submitted_at AT TIME ZONE s.timezone;
  d        := local_ts::DATE;

  -- Past the cut-off, the order rolls to the following day.
  IF local_ts::TIME >= s.cutoff_time THEN
    d := d + 1;
  END IF;

  -- Then add the configured lead time in BUSINESS days.
  remaining := s.lead_days;
  WHILE remaining > 0 AND guard < 400 LOOP
    d     := d + 1;
    guard := guard + 1;
    IF EXTRACT(ISODOW FROM d)::INTEGER = ANY (s.working_days)
       AND NOT EXISTS (SELECT 1 FROM delivery_blackout_dates WHERE blackout_date = d)
    THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;

  -- Finally roll forward off any non-operating day.
  guard := 0;
  WHILE guard < 400 LOOP
    EXIT WHEN EXTRACT(ISODOW FROM d)::INTEGER = ANY (s.working_days)
          AND NOT EXISTS (SELECT 1 FROM delivery_blackout_dates WHERE blackout_date = d);
    d     := d + 1;
    guard := guard + 1;
  END LOOP;

  RETURN d;
END;
$$;

-- Thin wrapper the portal calls to render the "estimated delivery date"
-- preview before the client commits.
CREATE OR REPLACE FUNCTION portal_preview_delivery_date()
RETURNS TABLE (delivery_date DATE, cutoff_time TIME, timezone TEXT, past_cutoff BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid UUID := current_client_id();
  s   delivery_settings%ROWTYPE;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not a client user';
  END IF;

  SELECT * INTO s FROM delivery_settings WHERE client_id = cid;
  IF NOT FOUND THEN
    SELECT * INTO s FROM delivery_settings WHERE client_id IS NULL;
  END IF;

  RETURN QUERY SELECT
    next_delivery_date(cid, NOW()),
    s.cutoff_time,
    s.timezone,
    ((NOW() AT TIME ZONE s.timezone)::TIME >= s.cutoff_time);
END;
$$;

-- ============================================================
-- 4. CLIENT ORDERS (delivery / fulfilment requests)
-- ============================================================

-- Per-year document counters for ORD- and DO- numbers.
CREATE TABLE IF NOT EXISTS document_counters (
  doc_type  TEXT NOT NULL,
  year      INTEGER NOT NULL,
  last_no   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);

CREATE OR REPLACE FUNCTION next_document_no(p_type TEXT, p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  n INTEGER;
BEGIN
  -- ON CONFLICT … RETURNING keeps this correct under concurrent submits.
  INSERT INTO document_counters (doc_type, year, last_no)
  VALUES (p_type, y, 1)
  ON CONFLICT (doc_type, year)
  DO UPDATE SET last_no = document_counters.last_no + 1
  RETURNING last_no INTO n;

  RETURN p_prefix || '-' || y || '-' || LPAD(n::TEXT, 4, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS client_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  order_no          TEXT NOT NULL UNIQUE,      -- ORD-2026-0001, generated
  do_number         TEXT UNIQUE,               -- DO-2026-0001, generated on confirm
  po_number         TEXT,                      -- the client's own PO
  reference_no      TEXT,                      -- e.g. 'Shopify #SG1023'

  -- Consignee / delivery
  consignee_name    TEXT,
  delivery_address  TEXT NOT NULL,
  delivery_contact_name   TEXT,
  delivery_contact_phone  TEXT,
  delivery_instructions   TEXT,
  notes             TEXT,

  -- Scheduling
  requested_date    DATE,                      -- what the client asked for
  scheduled_date    DATE NOT NULL,             -- what the cut-off rules gave
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status            TEXT NOT NULL DEFAULT 'New',

  -- Where the order came from. Order creation is deliberately not tied to
  -- manual entry, so a Shopify webhook can create rows the same way.
  source            TEXT NOT NULL DEFAULT 'portal',  -- portal | shopify | manual | api
  external_order_id TEXT,

  -- Bridge into the existing ops tables once ops accepts the order.
  movement_id       UUID REFERENCES movements(id) ON DELETE SET NULL,
  pick_list_id      UUID REFERENCES pick_lists(id) ON DELETE SET NULL,

  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT client_orders_status_check CHECK (status IN (
    'New', 'Confirmed', 'Picking', 'Packed',
    'Out for Delivery', 'Completed', 'Cancelled'
  )),
  -- One Shopify order can only land once.
  CONSTRAINT client_orders_external_unique UNIQUE (client_id, source, external_order_id)
);

CREATE INDEX IF NOT EXISTS client_orders_client_idx   ON client_orders(client_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS client_orders_status_idx   ON client_orders(status);
CREATE INDEX IF NOT EXISTS client_orders_schedule_idx ON client_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS client_orders_movement_idx ON client_orders(movement_id);

CREATE TABLE IF NOT EXISTS client_order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES client_products(id) ON DELETE RESTRICT,

  -- Denormalised so the order reads the same years later even if the
  -- catalogue entry is renamed.
  sku           TEXT NOT NULL,
  description   TEXT,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  qty_ordered   NUMERIC(14,4) NOT NULL CHECK (qty_ordered > 0),
  qty_picked    NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_dispatched NUMERIC(14,4) NOT NULL DEFAULT 0,

  line_no       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_order_lines_order_idx ON client_order_lines(order_id);

-- Which batch each ordered unit is reserved against. Lets us release an
-- allocation cleanly on cancellation and dispatch FEFO on completion.
CREATE TABLE IF NOT EXISTS stock_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id UUID NOT NULL REFERENCES client_order_lines(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL REFERENCES stock_batches(id) ON DELETE RESTRICT,
  qty           NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  status        TEXT NOT NULL DEFAULT 'allocated',  -- allocated | dispatched | released
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at   TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS stock_allocations_line_idx  ON stock_allocations(order_line_id);
CREATE INDEX IF NOT EXISTS stock_allocations_batch_idx ON stock_allocations(batch_id);

-- Status audit trail — drives the client's tracking timeline.
CREATE TABLE IF NOT EXISTS client_order_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  actor       TEXT,                            -- 'client:<email>' | 'staff:<name>' | 'system'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_order_events_order_idx
  ON client_order_events(order_id, created_at);

-- ============================================================
-- 5. updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','client_products','stock_batches','client_orders']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- 6. ROW LEVEL SECURITY
--
-- Clients get SELECT only, always narrowed to current_client_id().
-- All client writes go through the SECURITY DEFINER functions in §7.
-- ============================================================

ALTER TABLE clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_allocations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_blackout_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters      ENABLE ROW LEVEL SECURITY;

-- Views run with the privileges of their owner, so the summary view is
-- filtered explicitly wherever it's queried; keep it invoker-checked.
ALTER VIEW client_stock_summary SET (security_invoker = true);

-- ── Client read policies ──────────────────────────────────────

DROP POLICY IF EXISTS clients_read_own ON clients;
CREATE POLICY clients_read_own ON clients
  FOR SELECT USING (id = current_client_id());

DROP POLICY IF EXISTS client_users_read_own ON client_users;
CREATE POLICY client_users_read_own ON client_users
  FOR SELECT USING (user_id = auth.uid() OR client_id = current_client_id());

DROP POLICY IF EXISTS client_products_read_own ON client_products;
CREATE POLICY client_products_read_own ON client_products
  FOR SELECT USING (client_id = current_client_id());

DROP POLICY IF EXISTS stock_batches_read_own ON stock_batches;
CREATE POLICY stock_batches_read_own ON stock_batches
  FOR SELECT USING (client_id = current_client_id());

DROP POLICY IF EXISTS client_orders_read_own ON client_orders;
CREATE POLICY client_orders_read_own ON client_orders
  FOR SELECT USING (client_id = current_client_id());

DROP POLICY IF EXISTS client_order_lines_read_own ON client_order_lines;
CREATE POLICY client_order_lines_read_own ON client_order_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM client_orders o
     WHERE o.id = client_order_lines.order_id
       AND o.client_id = current_client_id()
  ));

DROP POLICY IF EXISTS stock_allocations_read_own ON stock_allocations;
CREATE POLICY stock_allocations_read_own ON stock_allocations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM client_order_lines l
     JOIN client_orders o ON o.id = l.order_id
    WHERE l.id = stock_allocations.order_line_id
      AND o.client_id = current_client_id()
  ));

DROP POLICY IF EXISTS client_order_events_read_own ON client_order_events;
CREATE POLICY client_order_events_read_own ON client_order_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM client_orders o
     WHERE o.id = client_order_events.order_id
       AND o.client_id = current_client_id()
  ));

-- A client may read the cut-off rule that applies to it, so the portal can
-- explain the scheduled date. It may never change it.
DROP POLICY IF EXISTS delivery_settings_read_own ON delivery_settings;
CREATE POLICY delivery_settings_read_own ON delivery_settings
  FOR SELECT USING (client_id IS NULL OR client_id = current_client_id());

DROP POLICY IF EXISTS delivery_blackouts_read ON delivery_blackout_dates;
CREATE POLICY delivery_blackouts_read ON delivery_blackout_dates
  FOR SELECT USING (auth.uid() IS NOT NULL OR is_internal_anon());

-- ── Staff policies (Supabase Auth staff accounts) ─────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','client_users','client_products','stock_batches',
    'client_orders','client_order_lines','stock_allocations',
    'client_order_events','delivery_settings','delivery_blackout_dates'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_staff_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_staff_all ON %I FOR ALL
         USING (is_staff()) WITH CHECK (is_staff())', t, t);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS staff_users_self ON staff_users;
CREATE POLICY staff_users_self ON staff_users
  FOR SELECT USING (user_id = auth.uid() OR is_internal_anon());

-- ── INTERIM: internal portals still use the anon key ──────────
-- Hive and Brood connect with the publishable anon key and no auth session,
-- exactly as they do against movements / stock_lines today. Until staff move
-- onto staff_users + Supabase Auth, they need anon access to the new tables.
--
-- SECURITY: the anon key is public, so these policies expose client orders
-- and stock to anyone holding it — the same exposure that already applies to
-- movements, stock_lines and pick_lists. Client LOGINS are properly isolated
-- either way; this is about the internal apps.
--
-- To close it: create staff_users rows, switch Hive/Brood to Supabase Auth,
-- then drop every policy named *_anon_interim below.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','client_products','stock_batches','client_orders',
    'client_order_lines','stock_allocations','client_order_events',
    'delivery_settings','document_counters'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_anon_interim ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_anon_interim ON %I FOR ALL
         USING (is_internal_anon()) WITH CHECK (is_internal_anon())', t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- 7. CLIENT WRITE PATH — SECURITY DEFINER functions
--
-- The portal's only way to change anything. Stock validation and allocation
-- happen inside one transaction, so a client cannot oversell by racing two
-- browser tabs: the batch rows are locked FOR UPDATE.
-- ============================================================

-- Allocate p_qty of a product FEFO across that product's open batches.
-- Raises if there isn't enough available. Internal helper.
CREATE OR REPLACE FUNCTION allocate_stock_fefo(
  p_order_line_id UUID,
  p_product_id    UUID,
  p_qty           NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining NUMERIC := p_qty;
  take      NUMERIC;
  b         RECORD;
BEGIN
  FOR b IN
    SELECT id, qty_available
      FROM stock_batches
     WHERE product_id = p_product_id
       AND qty_received > qty_allocated + qty_dispatched
     ORDER BY expiry_date NULLS LAST, received_date, created_at
     FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(remaining, b.qty_available);
    IF take <= 0 THEN CONTINUE; END IF;

    UPDATE stock_batches
       SET qty_allocated = qty_allocated + take
     WHERE id = b.id;

    INSERT INTO stock_allocations (order_line_id, batch_id, qty)
    VALUES (p_order_line_id, b.id, take);

    remaining := remaining - take;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%:%', p_product_id, remaining
      USING HINT = 'Not enough available stock to fulfil this line';
  END IF;
END;
$$;

-- The portal's order submission. p_lines is a JSON array:
--   [{ "product_id": "<uuid>", "qty": 50 }, …]
--
-- Returns the created order row. Rolls back entirely if any line is short,
-- so a partially-allocated order can never exist.
CREATE OR REPLACE FUNCTION portal_create_order(
  p_lines                  JSONB,
  p_delivery_address       TEXT,
  p_po_number              TEXT DEFAULT NULL,
  p_consignee_name         TEXT DEFAULT NULL,
  p_delivery_contact_name  TEXT DEFAULT NULL,
  p_delivery_contact_phone TEXT DEFAULT NULL,
  p_requested_date         DATE DEFAULT NULL,
  p_delivery_instructions  TEXT DEFAULT NULL,
  p_reference_no           TEXT DEFAULT NULL,
  p_notes                  TEXT DEFAULT NULL,
  p_source                 TEXT DEFAULT 'portal',
  p_external_order_id      TEXT DEFAULT NULL
) RETURNS client_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid       UUID := current_client_id();
  ord       client_orders;
  line      JSONB;
  prod      client_products;
  new_line  client_order_lines;
  idx       INTEGER := 0;
  sched     DATE;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'NOT_A_CLIENT_USER';
  END IF;
  IF p_delivery_address IS NULL OR btrim(p_delivery_address) = '' THEN
    RAISE EXCEPTION 'DELIVERY_ADDRESS_REQUIRED';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'NO_ORDER_LINES';
  END IF;

  -- The cut-off rule sets the earliest possible date. A client asking for a
  -- LATER date gets it; asking for an earlier one cannot pull the date in.
  sched := GREATEST(
    next_delivery_date(cid, NOW()),
    COALESCE(p_requested_date, '0001-01-01'::DATE)
  );

  INSERT INTO client_orders (
    client_id, order_no, po_number, reference_no, consignee_name,
    delivery_address, delivery_contact_name, delivery_contact_phone,
    delivery_instructions, notes, requested_date, scheduled_date,
    status, source, external_order_id, created_by
  ) VALUES (
    cid, next_document_no('order', 'ORD'), p_po_number, p_reference_no,
    p_consignee_name, p_delivery_address, p_delivery_contact_name,
    p_delivery_contact_phone, p_delivery_instructions, p_notes,
    p_requested_date, sched, 'New', p_source, p_external_order_id, auth.uid()
  ) RETURNING * INTO ord;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    idx := idx + 1;

    SELECT * INTO prod FROM client_products
     WHERE id = (line->>'product_id')::UUID AND client_id = cid AND active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'UNKNOWN_PRODUCT:%', line->>'product_id';
    END IF;

    INSERT INTO client_order_lines (
      order_id, product_id, sku, description, unit, qty_ordered, line_no
    ) VALUES (
      ord.id, prod.id, prod.sku, prod.description, prod.unit,
      (line->>'qty')::NUMERIC, idx
    ) RETURNING * INTO new_line;

    PERFORM allocate_stock_fefo(new_line.id, prod.id, new_line.qty_ordered);
  END LOOP;

  INSERT INTO client_order_events (order_id, to_status, actor, note)
  VALUES (ord.id, 'New', 'client:' || COALESCE(auth.jwt()->>'email', 'unknown'),
          'Order submitted through client portal');

  RETURN ord;
END;
$$;

-- A client may cancel only while the order is still 'New' — that is, before
-- ops has accepted it. Once it is Confirmed a movement and pick list exist in
-- Hive, and unpicking that is an ops decision, not a self-service one.
-- Releases the allocation back to the batches it came from.
CREATE OR REPLACE FUNCTION portal_cancel_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS client_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid  UUID := current_client_id();
  ord  client_orders;
  a    RECORD;
  prev TEXT;
BEGIN
  SELECT * INTO ord FROM client_orders
   WHERE id = p_order_id AND client_id = cid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF ord.status <> 'New' THEN
    RAISE EXCEPTION 'ORDER_ALREADY_IN_FULFILMENT:%', ord.status;
  END IF;
  prev := ord.status;

  FOR a IN
    SELECT sa.id, sa.batch_id, sa.qty
      FROM stock_allocations sa
      JOIN client_order_lines l ON l.id = sa.order_line_id
     WHERE l.order_id = ord.id AND sa.status = 'allocated'
     FOR UPDATE
  LOOP
    UPDATE stock_batches SET qty_allocated = qty_allocated - a.qty WHERE id = a.batch_id;
    UPDATE stock_allocations SET status = 'released', released_at = NOW() WHERE id = a.id;
  END LOOP;

  UPDATE client_orders
     SET status = 'Cancelled', cancelled_at = NOW(), cancel_reason = p_reason
   WHERE id = ord.id RETURNING * INTO ord;

  INSERT INTO client_order_events (order_id, from_status, to_status, actor, note)
  VALUES (p_order_id, prev, 'Cancelled',
          'client:' || COALESCE(auth.jwt()->>'email', 'unknown'), p_reason);

  RETURN ord;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────
-- Clients get SELECT (RLS still narrows every row to their own account) and
-- EXECUTE on the portal functions. Note there is no GRANT INSERT/UPDATE/
-- DELETE to `authenticated` anywhere in this file: the only way a client can
-- change data is through the functions above.

GRANT SELECT ON
  clients, client_users, client_products, stock_batches,
  client_orders, client_order_lines, stock_allocations,
  client_order_events, delivery_settings, delivery_blackout_dates,
  client_stock_summary
TO authenticated;

-- Interim, matching the anon policies above: the internal Hive/Brood apps.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  clients, client_products, stock_batches, client_orders,
  client_order_lines, stock_allocations, client_order_events,
  delivery_settings, document_counters
TO anon;
GRANT SELECT ON client_stock_summary TO anon;

-- Internal helper: reachable only from the SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION allocate_stock_fefo(UUID, UUID, NUMERIC) FROM PUBLIC;

-- SECURITY DEFINER functions are executable by PUBLIC unless revoked. The
-- portal functions all fail closed for a caller with no client_users row,
-- but don't leave them reachable by anon in the first place.
REVOKE ALL ON FUNCTION portal_create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_cancel_order(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_preview_delivery_date() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION current_client_id()                TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff()                         TO authenticated;
GRANT EXECUTE ON FUNCTION next_delivery_date(UUID, TIMESTAMPTZ) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION portal_preview_delivery_date()     TO authenticated;
GRANT EXECUTE ON FUNCTION portal_create_order(
  JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION portal_cancel_order(UUID, TEXT)    TO authenticated;

-- ============================================================
-- 8. OPS SIDE — accepting an order into the warehouse workflow
-- ============================================================

-- Links client_orders into the existing movements table so the established
-- pick-list flow (Pending → Picking → Checking → … → Completed) runs
-- unchanged. Called from Hive when ops confirms a new request.
CREATE OR REPLACE FUNCTION staff_confirm_order(p_order_id UUID, p_actor TEXT DEFAULT 'Hive')
RETURNS client_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord client_orders;
  cl  clients;
  mv  movements;
  l   RECORD;
  do_no TEXT;
BEGIN
  SELECT * INTO ord FROM client_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF ord.status <> 'New' THEN RAISE EXCEPTION 'ORDER_NOT_NEW:%', ord.status; END IF;

  SELECT * INTO cl FROM clients WHERE id = ord.client_id;
  do_no := COALESCE(ord.do_number, next_document_no('do', 'DO'));

  INSERT INTO movements (
    movement_no, type, status, company_name, source,
    delivery_address, delivery_contact_name, delivery_contact_number,
    customer_ref, notes
  ) VALUES (
    do_no, 'Outbound', 'New', cl.name, 'PORTAL',
    ord.delivery_address, ord.delivery_contact_name, ord.delivery_contact_phone,
    COALESCE(ord.po_number, ord.reference_no), ord.delivery_instructions
  ) RETURNING * INTO mv;

  FOR l IN SELECT * FROM client_order_lines WHERE order_id = ord.id ORDER BY line_no
  LOOP
    INSERT INTO stock_lines (
      movement_id, line_type, sku, description, unit,
      qty_actual, qty_out, date_out, sort_order
    ) VALUES (
      mv.id, 'Outbound', l.sku, l.description, l.unit,
      0, l.qty_ordered, ord.scheduled_date, l.line_no
    );
  END LOOP;

  UPDATE client_orders
     SET status = 'Confirmed', do_number = do_no, movement_id = mv.id
   WHERE id = ord.id RETURNING * INTO ord;

  INSERT INTO client_order_events (order_id, from_status, to_status, actor, note)
  VALUES (ord.id, 'New', 'Confirmed', 'staff:' || p_actor,
          'Accepted into warehouse as ' || do_no);

  RETURN ord;
END;
$$;

-- Converts allocation to dispatch when the order ships. Decrements
-- qty_allocated and increments qty_dispatched on each source batch, so the
-- client's available balance stays correct throughout.
CREATE OR REPLACE FUNCTION staff_dispatch_order(p_order_id UUID, p_actor TEXT DEFAULT 'Hive')
RETURNS client_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord client_orders;
  a   RECORD;
BEGIN
  SELECT * INTO ord FROM client_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  FOR a IN
    SELECT sa.id, sa.batch_id, sa.qty, sa.order_line_id
      FROM stock_allocations sa
      JOIN client_order_lines l ON l.id = sa.order_line_id
     WHERE l.order_id = ord.id AND sa.status = 'allocated'
     FOR UPDATE
  LOOP
    UPDATE stock_batches
       SET qty_allocated  = qty_allocated - a.qty,
           qty_dispatched = qty_dispatched + a.qty
     WHERE id = a.batch_id;

    UPDATE stock_allocations
       SET status = 'dispatched', dispatched_at = NOW() WHERE id = a.id;

    UPDATE client_order_lines
       SET qty_dispatched = qty_dispatched + a.qty WHERE id = a.order_line_id;
  END LOOP;

  UPDATE client_orders SET status = 'Out for Delivery'
   WHERE id = ord.id RETURNING * INTO ord;

  INSERT INTO client_order_events (order_id, to_status, actor)
  VALUES (ord.id, 'Out for Delivery', 'staff:' || p_actor);

  RETURN ord;
END;
$$;

-- Records a physical receipt against a client account. Called by Brood when
-- goods land, which is what gives the portal its receiving date / expiry.
CREATE OR REPLACE FUNCTION staff_receive_stock(
  p_client_id     UUID,
  p_sku           TEXT,
  p_qty           NUMERIC,
  p_received_date DATE,
  p_description   TEXT DEFAULT NULL,
  p_unit          TEXT DEFAULT 'pcs',
  p_batch_no      TEXT DEFAULT NULL,
  p_expiry_date   DATE DEFAULT NULL,
  p_movement_id   UUID DEFAULT NULL,
  p_stock_line_id UUID DEFAULT NULL
) RETURNS stock_batches LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prod  client_products;
  batch stock_batches;
BEGIN
  SELECT * INTO prod FROM client_products
   WHERE client_id = p_client_id AND sku = p_sku;

  IF NOT FOUND THEN
    INSERT INTO client_products (client_id, sku, description, unit, track_expiry, track_batch)
    VALUES (p_client_id, p_sku, p_description, p_unit,
            p_expiry_date IS NOT NULL, p_batch_no IS NOT NULL)
    RETURNING * INTO prod;
  ELSIF p_expiry_date IS NOT NULL AND NOT prod.track_expiry THEN
    UPDATE client_products SET track_expiry = TRUE WHERE id = prod.id;
  END IF;

  INSERT INTO stock_batches (
    client_id, product_id, batch_no, received_date, expiry_date,
    qty_received, movement_id, stock_line_id
  ) VALUES (
    p_client_id, prod.id, p_batch_no, p_received_date, p_expiry_date,
    p_qty, p_movement_id, p_stock_line_id
  ) RETURNING * INTO batch;

  RETURN batch;
END;
$$;

GRANT EXECUTE ON FUNCTION staff_confirm_order(UUID, TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_dispatch_order(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_receive_stock(
  UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE, UUID, UUID
) TO anon, authenticated;

-- ============================================================
-- 9. EXISTING TABLES — additive columns only
-- ============================================================

-- Ties a cargo movement to a client account so stock stops being tracked
-- only by movement. Nullable: historic rows keep working untouched.
ALTER TABLE movements   ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE stock_lines ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- The receiving / batch / expiry fields the brief asks for, recorded where
-- the warehouse actually enters them. date_in is the booked date; these are
-- what physically happened.
ALTER TABLE stock_lines ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE stock_lines ADD COLUMN IF NOT EXISTS batch_no      TEXT;
ALTER TABLE stock_lines ADD COLUMN IF NOT EXISTS expiry_date   DATE;
ALTER TABLE stock_lines ADD COLUMN IF NOT EXISTS batch_id      UUID REFERENCES stock_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movements_client_idx   ON movements(client_id);
CREATE INDEX IF NOT EXISTS stock_lines_client_idx ON stock_lines(client_id);

-- ============================================================
-- 10. BACKFILL (review before running — commented out on purpose)
--
-- Historic stock lives in movements.company_name as free text. These
-- statements seed client accounts from it and lift existing inbound stock
-- into batches. Run them by hand once the company-name spellings have been
-- deduplicated, otherwise you will create a client per typo.
-- ============================================================

-- Step 1 — see what you have:
-- SELECT company_name, COUNT(*) FROM movements
--  WHERE company_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

-- Step 2 — create a client per distinct company name:
-- INSERT INTO clients (code, name, legacy_company_name)
-- SELECT UPPER(LEFT(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]', '', 'g'), 8)),
--        company_name, company_name
--   FROM (SELECT DISTINCT company_name FROM movements WHERE company_name IS NOT NULL) s
-- ON CONFLICT (code) DO NOTHING;

-- Step 3 — stamp client_id onto existing movements and their lines:
-- UPDATE movements m SET client_id = c.id
--   FROM clients c WHERE c.legacy_company_name = m.company_name AND m.client_id IS NULL;
-- UPDATE stock_lines sl SET client_id = m.client_id
--   FROM movements m WHERE m.id = sl.movement_id AND sl.client_id IS NULL;

-- Step 4 — lift inbound stock lines into batches:
-- SELECT staff_receive_stock(
--          sl.client_id, sl.sku, sl.qty_actual,
--          COALESCE(sl.received_date, sl.date_in, m.created_at::DATE),
--          sl.description, sl.unit, sl.batch_no, sl.expiry_date, m.id, sl.id)
--   FROM stock_lines sl JOIN movements m ON m.id = sl.movement_id
--  WHERE sl.client_id IS NOT NULL AND sl.line_type <> 'Outbound'
--    AND sl.qty_actual > 0 AND sl.batch_id IS NULL AND m.status <> 'Voided';

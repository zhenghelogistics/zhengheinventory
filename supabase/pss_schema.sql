-- ============================================================
-- PSS (Permit & Shipping Services) Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add source column to movements so Brood can filter PSS-created ones
ALTER TABLE movements ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

-- ── Main shipment / shipping instruction record ──────────────
CREATE TABLE IF NOT EXISTS pss_shipments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  reference_no      TEXT,                          -- auto-generated or user-set
  po_number         TEXT,                          -- PSVxx-xx-xxxx from PO
  po_date           DATE,
  status            TEXT NOT NULL DEFAULT 'Draft', -- Draft | Submitted | Permit Issued | Completed
  export_type       TEXT NOT NULL DEFAULT 'OEP',   -- OEP | AEP | NIL

  -- Parties
  client_name       TEXT,                          -- exporter / our client
  consignee_name    TEXT,
  consignee_address TEXT,
  notify_party      TEXT,

  -- Vendor (from extracted PO)
  vendor_name       TEXT,
  vendor_address    TEXT,
  vendor_contact    TEXT,
  vendor_tel        TEXT,

  -- Shipping
  shipment_date     DATE,
  etd               DATE,
  carrier           TEXT,
  bl_number         TEXT,
  vessel            TEXT,
  voyage            TEXT,
  pol               TEXT,
  pod               TEXT,
  final_destination TEXT,
  container_type    TEXT,
  container_no      TEXT,
  seal_no           TEXT,
  shipping_term     TEXT,
  payment_term      TEXT,

  -- Financials
  currency          TEXT NOT NULL DEFAULT 'USD',
  sub_total         NUMERIC(14, 2),
  freight           NUMERIC(14, 2),
  grand_total       NUMERIC(14, 2),

  -- Link to Brood inbound movement (set when shipment is submitted)
  movement_id       UUID REFERENCES movements(id) ON DELETE SET NULL,

  remarks           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Product lines per shipment ────────────────────────────────
CREATE TABLE IF NOT EXISTS pss_shipment_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     UUID NOT NULL REFERENCES pss_shipments(id) ON DELETE CASCADE,

  line_no         INTEGER,
  item_number     TEXT,                -- PG-DJT-PMP-XXXXX code from PO
  description     TEXT,
  npbb            TEXT,                -- NPBB reference (03260/CWC/032026)
  hs_code         TEXT,
  origin          TEXT,
  quantity        NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'PCS',
  unit_price      NUMERIC(14, 4),
  currency        TEXT NOT NULL DEFAULT 'USD',
  extended_cost   NUMERIC(14, 2),

  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION pss_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pss_shipments_updated_at ON pss_shipments;
CREATE TRIGGER pss_shipments_updated_at
  BEFORE UPDATE ON pss_shipments
  FOR EACH ROW EXECUTE FUNCTION pss_set_updated_at();

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pss_shipments_status_idx      ON pss_shipments(status);
CREATE INDEX IF NOT EXISTS pss_shipments_movement_id_idx ON pss_shipments(movement_id);
CREATE INDEX IF NOT EXISTS pss_shipment_lines_shipment_idx ON pss_shipment_lines(shipment_id);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE pss_shipments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pss_shipment_lines ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access (tighten per-role later)
CREATE POLICY "pss_shipments_all"      ON pss_shipments      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pss_shipment_lines_all" ON pss_shipment_lines FOR ALL USING (true) WITH CHECK (true);

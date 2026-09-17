-- ============================================================
-- REMOVE THE PSS (Permit & Shipping Services) MODULE
--
-- The Client Portal takes over the third portal slot. Run this BEFORE
-- supabase/client_portal_schema.sql.
--
-- ⚠️  DESTRUCTIVE. Read §0 and §1 first — §1 is an archive step, and it is
--     the only chance to keep the PSS data.
-- ============================================================

-- ============================================================
-- 0. WHAT IS AND IS NOT SAFE TO DROP
--
-- KEEP — these are shared and still in use:
--
--   movements / stock_lines
--     PSS created real inbound movements (source = 'PSS') carrying real
--     stock lines. That is inventory, not PSS metadata. Dropping it would
--     lose warehouse stock. This script does not touch it.
--
--   delivery_confirmations
--     Named in the PSS screens but equally used by Brood's Receive Delivery
--     and Scan Client QR flows. Not dropped.
--
-- DROP — PSS-only permit/shipping paperwork:
--
--   pss_shipments        vendor, consignee, vessel/voyage, BL, permit fields
--   pss_shipment_lines   HS codes, NPBB refs, unit pricing
--
-- The one thing worth salvaging is the consignee book: PSS shipments hold
-- consignee names and addresses that clients will re-enter as delivery
-- addresses in the portal. §2 lifts those into the new schema. Skip it if
-- the PSS records were only ever a prototype.
-- ============================================================

-- ============================================================
-- 1. ARCHIVE FIRST
--
-- Run this SELECT in the Supabase SQL Editor and use "Download CSV",
-- or keep the result as a table by uncommenting the CREATE TABLE.
-- Do not proceed to §3 until you have the output.
-- ============================================================

-- CREATE TABLE pss_archive_2026_09 AS
SELECT
  s.*,
  (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.line_no)
     FROM pss_shipment_lines l
    WHERE l.shipment_id = s.id) AS lines
FROM pss_shipments s;

-- ============================================================
-- 2. OPTIONAL SALVAGE — consignees become portal delivery addresses
--
-- Run AFTER client_portal_schema.sql, and only once clients rows exist.
-- Matches a PSS shipment's client_name to clients.legacy_company_name and
-- seeds the consignee as a saved address. Left commented because the match
-- is by free text and wants eyeballing first.
-- ============================================================

-- CREATE TABLE IF NOT EXISTS client_addresses (
--   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
--   label      TEXT,
--   consignee_name TEXT,
--   address    TEXT NOT NULL,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
--
-- INSERT INTO client_addresses (client_id, label, consignee_name, address)
-- SELECT DISTINCT c.id, s.consignee_name, s.consignee_name, s.consignee_address
--   FROM pss_shipments s
--   JOIN clients c ON c.legacy_company_name = s.client_name
--  WHERE s.consignee_address IS NOT NULL AND btrim(s.consignee_address) <> '';

-- ============================================================
-- 3. DROP
-- ============================================================

DROP TRIGGER  IF EXISTS pss_shipments_updated_at ON pss_shipments;
DROP FUNCTION IF EXISTS pss_set_updated_at();

DROP TABLE IF EXISTS pss_shipment_lines;
DROP TABLE IF EXISTS pss_shipments;

-- movements.source is kept: it is a generic provenance marker, and the
-- Client Portal writes 'PORTAL' into it. Existing 'PSS' values stay as
-- historical record of where those movements came from.
--
-- To clear them instead:
-- UPDATE movements SET source = NULL WHERE source = 'PSS';

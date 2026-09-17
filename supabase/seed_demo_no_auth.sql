-- ============================================================
-- DEMO DATA — no Supabase Auth user needed
-- Pair with VITE_PORTAL_DEV_CLIENT=OKI in .env.local
-- ============================================================

INSERT INTO clients (code, name, legacy_company_name, contact_email)
VALUES ('OKI', 'Oki Ara Pte Ltd', 'Oki Ara Pte Ltd', 'ops@okiara.com')
ON CONFLICT (code) DO NOTHING;

-- OKI-500: two batches, different expiries, so FEFO has a choice.
SELECT staff_receive_stock(
  (SELECT id FROM clients WHERE code='OKI'), 'OKI-500', 1000,
  CURRENT_DATE - 30, 'Oki Ara 500ml', 'carton', 'B2026-0912', DATE '2027-12-15');

SELECT staff_receive_stock(
  (SELECT id FROM clients WHERE code='OKI'), 'OKI-500', 150,
  CURRENT_DATE - 90, 'Oki Ara 500ml', 'carton', 'B2026-0615', DATE '2027-06-30');

-- OKI-12L: no expiry, so the Inventory screen shows "N/A".
SELECT staff_receive_stock(
  (SELECT id FROM clients WHERE code='OKI'), 'OKI-12L', 200,
  CURRENT_DATE - 10, 'Oki Ara 12L', 'drum');

SELECT sku, qty_received, qty_available, last_received_date, next_expiry_date
FROM client_stock_summary
WHERE client_id = (SELECT id FROM clients WHERE code='OKI') ORDER BY sku;

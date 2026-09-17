-- ============================================================
-- SEED A TEST CLIENT — the worked example from the brief
--
-- ⚠️  Create the Supabase Auth user FIRST:
--     Dashboard → Authentication → Users → Add user
--     Email: whatever you want to log in with
--     ✅ tick "Auto Confirm User"
--     Then copy the new user's UUID into §2 below.
-- ============================================================

-- ── 1. The client account ─────────────────────────────────────
INSERT INTO clients (code, name, legacy_company_name, contact_email)
VALUES ('OKI', 'Oki Ara Pte Ltd', 'Oki Ara Pte Ltd', 'ops@okiara.com')
ON CONFLICT (code) DO NOTHING;

-- ── 2. Link the auth user to it ───────────────────────────────
-- Replace the UUID with the one from Authentication → Users.
INSERT INTO client_users (user_id, client_id, full_name)
SELECT 'PASTE-AUTH-USER-UUID-HERE'::UUID, id, 'Test User'
FROM clients WHERE code = 'OKI'
ON CONFLICT (user_id) DO UPDATE SET client_id = EXCLUDED.client_id;

-- ── 3. Stock, matching the brief's table ──────────────────────
-- OKI-500 has an expiry; OKI-12L deliberately does not, to prove the
-- optional-expiry path renders "N/A" rather than a blank.
SELECT staff_receive_stock(
  p_client_id     => (SELECT id FROM clients WHERE code = 'OKI'),
  p_sku           => 'OKI-500',
  p_qty           => 1000,
  p_received_date => CURRENT_DATE - 30,
  p_description   => 'Oki Ara 500ml',
  p_unit          => 'carton',
  p_batch_no      => 'B2026-0912',
  p_expiry_date   => DATE '2027-12-15'
);

SELECT staff_receive_stock(
  p_client_id     => (SELECT id FROM clients WHERE code = 'OKI'),
  p_sku           => 'OKI-12L',
  p_qty           => 200,
  p_received_date => CURRENT_DATE - 10,
  p_description   => 'Oki Ara 12L',
  p_unit          => 'drum'
);

-- A second, older batch of the same SKU, so FEFO has something to choose
-- between and the batch drill-down has more than one row.
SELECT staff_receive_stock(
  p_client_id     => (SELECT id FROM clients WHERE code = 'OKI'),
  p_sku           => 'OKI-500',
  p_qty           => 150,
  p_received_date => CURRENT_DATE - 90,
  p_description   => 'Oki Ara 500ml',
  p_unit          => 'carton',
  p_batch_no      => 'B2026-0615',
  p_expiry_date   => DATE '2027-06-30'   -- earlier expiry: should ship first
);

-- ── 4. Check what the portal will show ────────────────────────
SELECT sku, description, qty_received, qty_available, qty_allocated,
       last_received_date, next_expiry_date
FROM client_stock_summary
WHERE client_id = (SELECT id FROM clients WHERE code = 'OKI')
ORDER BY sku;

-- ============================================================
-- SMOKE TEST — confirm the client portal schema landed correctly
-- Read-only. Safe to run any time.
-- ============================================================

-- 1. Tables: expect 10 rows, all 'OK'
SELECT t.name AS object,
       CASE WHEN c.relname IS NULL THEN '❌ MISSING' ELSE 'OK' END AS status,
       CASE WHEN c.relrowsecurity THEN 'RLS on' ELSE '⚠️ RLS OFF' END AS rls
FROM (VALUES
  ('clients'), ('client_users'), ('staff_users'), ('client_products'),
  ('stock_batches'), ('client_orders'), ('client_order_lines'),
  ('stock_allocations'), ('client_order_events'), ('delivery_settings')
) AS t(name)
LEFT JOIN pg_class c
       ON c.relname = t.name
      AND c.relnamespace = 'public'::regnamespace
ORDER BY 2 DESC, 1;

-- 2. Functions: expect 10 rows
SELECT p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END AS security
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'current_client_id', 'is_staff', 'is_internal_anon', 'next_delivery_date',
    'portal_preview_delivery_date', 'portal_create_order', 'portal_cancel_order',
    'allocate_stock_fefo', 'staff_confirm_order', 'staff_dispatch_order',
    'staff_receive_stock', 'next_document_no')
ORDER BY 1;

-- 3. The view
SELECT COUNT(*) AS summary_view_exists
FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_stock_summary';

-- 4. Cut-off default: expect one row, 13:00:00, Asia/Singapore
SELECT cutoff_time, timezone, lead_days, working_days
FROM delivery_settings WHERE client_id IS NULL;

-- 5. Cut-off logic — the worked example from the brief.
--    Before 13:00 → same/next slot. After → pushed a day. Both skip weekends.
SELECT
  next_delivery_date(NULL, '2026-10-15 12:45+08') AS submitted_1245_thu,
  next_delivery_date(NULL, '2026-10-15 14:30+08') AS submitted_1430_thu,
  next_delivery_date(NULL, '2026-10-16 14:30+08') AS submitted_1430_fri,
  next_delivery_date(NULL, NOW())                 AS right_now;

-- 6. Columns added to the existing tables: expect 6 rows
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (   (table_name = 'movements'   AND column_name = 'client_id')
       OR (table_name = 'stock_lines' AND column_name IN
             ('client_id','received_date','batch_no','expiry_date','batch_id')))
ORDER BY 1, 2;

-- 7. PSS is gone: expect 0
SELECT COUNT(*) AS pss_tables_remaining
FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'pss_%';

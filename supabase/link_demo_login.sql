-- ============================================================
-- Give the demo portal login access to the OKI client account.
-- One paste in the Supabase SQL Editor.
--
-- Login:    demo@okiara.com
-- Password: OkiAra2026!demo
-- ============================================================

-- 1. Confirm the email so the account can sign in.
--    (Alternative: Dashboard → Authentication → Providers → Email →
--     untick "Confirm email" while developing.)
UPDATE auth.users
   SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
 WHERE email = 'demo@okiara.com';

-- 2. Link the user to the client. This is the row that decides what they
--    can see, which is why anon can't write it — only staff, here.
INSERT INTO client_users (user_id, client_id, full_name, role)
SELECT u.id, c.id, 'Demo User', 'admin'
  FROM auth.users u, clients c
 WHERE u.email = 'demo@okiara.com' AND c.code = 'OKI'
ON CONFLICT (user_id) DO UPDATE SET client_id = EXCLUDED.client_id;

-- 3. Confirm it worked — expect one row.
SELECT u.email, cu.full_name, c.code, c.name,
       (u.email_confirmed_at IS NOT NULL) AS can_sign_in
  FROM client_users cu
  JOIN auth.users u ON u.id = cu.user_id
  JOIN clients    c ON c.id = cu.client_id;

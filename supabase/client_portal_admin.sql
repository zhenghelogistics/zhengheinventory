-- ============================================================
-- CLIENT PORTAL — admin functions
--
-- Run AFTER client_portal_ops.sql. Safe to re-run.
--
-- Everything the Clients screen in Hive needs: create a client, issue a
-- portal login, revoke one, and change the delivery cut-off — so none of it
-- needs the SQL editor any more.
--
-- Creating the auth user itself still happens in the browser via
-- supabase.auth.signUp (the anon key is allowed to do that). These functions
-- cover the parts it can't: confirming the email and writing client_users,
-- which anon deliberately cannot touch because it is the table that decides
-- who sees whose stock.
-- ============================================================

-- ── Clients ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION staff_upsert_client(
  p_code          TEXT,
  p_name          TEXT,
  p_contact_name  TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_address       TEXT DEFAULT NULL,
  p_legacy_name   TEXT DEFAULT NULL,
  p_client_id     UUID DEFAULT NULL
) RETURNS clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cl clients;
BEGIN
  IF btrim(COALESCE(p_code, '')) = '' OR btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'CODE_AND_NAME_REQUIRED';
  END IF;

  IF p_client_id IS NOT NULL THEN
    UPDATE clients
       SET code = UPPER(btrim(p_code)), name = btrim(p_name),
           contact_name = p_contact_name, contact_email = p_contact_email,
           contact_phone = p_contact_phone, address = p_address,
           legacy_company_name = COALESCE(p_legacy_name, legacy_company_name)
     WHERE id = p_client_id
     RETURNING * INTO cl;
    IF NOT FOUND THEN RAISE EXCEPTION 'CLIENT_NOT_FOUND'; END IF;
    RETURN cl;
  END IF;

  INSERT INTO clients (code, name, contact_name, contact_email, contact_phone,
                       address, legacy_company_name)
  VALUES (UPPER(btrim(p_code)), btrim(p_name), p_contact_name, p_contact_email,
          p_contact_phone, p_address, COALESCE(p_legacy_name, btrim(p_name)))
  RETURNING * INTO cl;

  RETURN cl;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CLIENT_CODE_TAKEN:%', UPPER(btrim(p_code));
END;
$$;

CREATE OR REPLACE FUNCTION staff_set_client_active(p_client_id UUID, p_active BOOLEAN)
RETURNS clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cl clients;
BEGIN
  UPDATE clients SET active = p_active WHERE id = p_client_id RETURNING * INTO cl;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENT_NOT_FOUND'; END IF;
  RETURN cl;
END;
$$;

-- ── Portal logins ─────────────────────────────────────────────

-- Links an existing auth user (just created in the browser, or already there)
-- to a client, and confirms their email so they can sign in immediately.
CREATE OR REPLACE FUNCTION staff_link_client_user(
  p_email     TEXT,
  p_client_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_role      TEXT DEFAULT 'member'
) RETURNS TABLE (user_id UUID, email TEXT, full_name TEXT, client_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_USER_NOT_FOUND:%', p_email
      USING HINT = 'Create the account first, then link it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND active) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;

  -- A portal login the warehouse issued is trusted; no confirmation email.
  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
   WHERE id = uid;

  INSERT INTO client_users (user_id, client_id, full_name, role, active)
  VALUES (uid, p_client_id, p_full_name, p_role, TRUE)
  ON CONFLICT (user_id) DO UPDATE
    SET client_id = EXCLUDED.client_id,
        full_name = COALESCE(EXCLUDED.full_name, client_users.full_name),
        role      = EXCLUDED.role,
        active    = TRUE;

  RETURN QUERY
    SELECT cu.user_id, u.email::TEXT, cu.full_name, cu.client_id
      FROM client_users cu JOIN auth.users u ON u.id = cu.user_id
     WHERE cu.user_id = uid;
END;
$$;

-- Revoking access leaves the auth account alone but cuts the link, which is
-- what RLS reads. Reversible, and it keeps their order history attributable.
CREATE OR REPLACE FUNCTION staff_set_client_user_active(p_user_id UUID, p_active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE client_users SET active = p_active WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENT_USER_NOT_FOUND'; END IF;
END;
$$;

-- Portal logins per client, with the email from auth.users which the
-- internal app can't otherwise read.
CREATE OR REPLACE FUNCTION staff_list_client_users(p_client_id UUID DEFAULT NULL)
RETURNS TABLE (
  user_id    UUID,
  email      TEXT,
  full_name  TEXT,
  role       TEXT,
  active     BOOLEAN,
  client_id  UUID,
  confirmed  BOOLEAN,
  last_sign_in TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.user_id, u.email::TEXT, cu.full_name, cu.role, cu.active, cu.client_id,
         (u.email_confirmed_at IS NOT NULL), u.last_sign_in_at
    FROM client_users cu
    JOIN auth.users u ON u.id = cu.user_id
   WHERE p_client_id IS NULL OR cu.client_id = p_client_id
   ORDER BY cu.created_at;
$$;

-- ── Delivery cut-off ──────────────────────────────────────────

-- p_client_id NULL edits the global default; a UUID creates or edits that
-- client's override.
CREATE OR REPLACE FUNCTION staff_set_delivery_settings(
  p_client_id    UUID,
  p_cutoff_time  TIME,
  p_timezone     TEXT DEFAULT 'Asia/Singapore',
  p_lead_days    INTEGER DEFAULT 0,
  p_working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  p_actor        TEXT DEFAULT 'Hive'
) RETURNS delivery_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s delivery_settings;
BEGIN
  IF p_client_id IS NULL THEN
    UPDATE delivery_settings
       SET cutoff_time = p_cutoff_time, timezone = p_timezone,
           lead_days = p_lead_days, working_days = p_working_days,
           updated_at = NOW(), updated_by = p_actor
     WHERE client_id IS NULL
     RETURNING * INTO s;
    IF NOT FOUND THEN
      INSERT INTO delivery_settings (client_id, cutoff_time, timezone, lead_days,
                                     working_days, updated_by)
      VALUES (NULL, p_cutoff_time, p_timezone, p_lead_days, p_working_days, p_actor)
      RETURNING * INTO s;
    END IF;
    RETURN s;
  END IF;

  INSERT INTO delivery_settings (client_id, cutoff_time, timezone, lead_days,
                                 working_days, updated_by)
  VALUES (p_client_id, p_cutoff_time, p_timezone, p_lead_days, p_working_days, p_actor)
  ON CONFLICT (client_id) DO UPDATE
    SET cutoff_time = EXCLUDED.cutoff_time, timezone = EXCLUDED.timezone,
        lead_days = EXCLUDED.lead_days, working_days = EXCLUDED.working_days,
        updated_at = NOW(), updated_by = EXCLUDED.updated_by
  RETURNING * INTO s;

  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION staff_clear_delivery_override(p_client_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM delivery_settings WHERE client_id = p_client_id;
$$;

-- ── Grants (interim: the internal apps still use the anon key) ─

GRANT EXECUTE ON FUNCTION staff_upsert_client(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_set_client_active(UUID, BOOLEAN)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_link_client_user(TEXT, UUID, TEXT, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_set_client_user_active(UUID, BOOLEAN)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_list_client_users(UUID)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_set_delivery_settings(UUID, TIME, TEXT, INTEGER, INTEGER[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_clear_delivery_override(UUID)                   TO anon, authenticated;

-- Clients need to be listable by the internal app to run this screen.
GRANT SELECT ON clients TO anon;

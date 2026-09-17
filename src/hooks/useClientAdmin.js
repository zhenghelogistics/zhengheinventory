import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Client account administration, for internal Hive staff.
 *
 * Issuing a portal login takes two steps, because the browser can only do
 * half of it: supabase.auth.signUp creates the auth account (the anon key is
 * allowed to), then staff_link_client_user confirms the email and writes the
 * client_users row — the table anon deliberately cannot touch, since it is
 * what decides who sees whose stock.
 */
export function useClientAdmin() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClients = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    if (err) setError(err.message);
    else { setClients(data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const saveClient = useCallback(async (fields) => {
    const { data, error: err } = await supabase.rpc('staff_upsert_client', {
      p_code:          fields.code,
      p_name:          fields.name,
      p_contact_name:  fields.contactName || null,
      p_contact_email: fields.contactEmail || null,
      p_contact_phone: fields.contactPhone || null,
      p_address:       fields.address || null,
      p_legacy_name:   fields.legacyName || null,
      p_client_id:     fields.id || null,
    });
    if (err) {
      if (err.message?.includes('CLIENT_CODE_TAKEN')) {
        return { ok: false, error: `The code "${fields.code.toUpperCase()}" is already in use.` };
      }
      if (err.message?.includes('CODE_AND_NAME_REQUIRED')) {
        return { ok: false, error: 'Code and name are both required.' };
      }
      return { ok: false, error: err.message };
    }
    await fetchClients();
    return { ok: true, client: data };
  }, [fetchClients]);

  const setClientActive = useCallback(async (clientId, active) => {
    const { error: err } = await supabase.rpc('staff_set_client_active', {
      p_client_id: clientId, p_active: active,
    });
    if (err) return { ok: false, error: err.message };
    await fetchClients();
    return { ok: true };
  }, [fetchClients]);

  const listUsers = useCallback(async (clientId) => {
    const { data, error: err } = await supabase.rpc('staff_list_client_users', {
      p_client_id: clientId,
    });
    if (err) { setError(err.message); return []; }
    return data || [];
  }, []);

  const createUser = useCallback(async (clientId, email, password, fullName) => {
    const { error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    // "already registered" is fine — we link the existing account below.
    const alreadyExists = signErr && /already|registered|exists/i.test(signErr.message);
    if (signErr && !alreadyExists) {
      return { ok: false, error: signErr.message };
    }

    // signUp leaves a session for the NEW user in this browser. Hive doesn't
    // use Supabase auth, but leaving it would make /portal open as that
    // client in the same browser — so drop it immediately.
    await supabase.auth.signOut();

    const { data, error: linkErr } = await supabase.rpc('staff_link_client_user', {
      p_email: email.trim(),
      p_client_id: clientId,
      p_full_name: fullName || null,
      p_role: 'member',
    });
    if (linkErr) {
      if (linkErr.message?.includes('AUTH_USER_NOT_FOUND')) {
        return { ok: false, error: 'Account could not be created. Check the email address.' };
      }
      return { ok: false, error: linkErr.message };
    }
    return { ok: true, user: data?.[0], existed: !!alreadyExists };
  }, []);

  const setUserActive = useCallback(async (userId, active) => {
    const { error: err } = await supabase.rpc('staff_set_client_user_active', {
      p_user_id: userId, p_active: active,
    });
    if (err) return { ok: false, error: err.message };
    return { ok: true };
  }, []);

  return {
    clients, loading, error,
    refetch: fetchClients,
    saveClient, setClientActive,
    listUsers, createUser, setUserActive,
  };
}

/** Delivery cut-off rules: the global default plus any per-client overrides. */
export function useDeliverySettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('delivery_settings').select('*');
    setSettings(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const save = useCallback(async ({ clientId = null, cutoffTime, timezone, leadDays, workingDays }) => {
    const { error: err } = await supabase.rpc('staff_set_delivery_settings', {
      p_client_id:    clientId,
      p_cutoff_time:  cutoffTime,
      p_timezone:     timezone,
      p_lead_days:    leadDays,
      p_working_days: workingDays,
      p_actor:        'Hive',
    });
    if (err) return { ok: false, error: err.message };
    await fetchSettings();
    return { ok: true };
  }, [fetchSettings]);

  const clearOverride = useCallback(async (clientId) => {
    await supabase.rpc('staff_clear_delivery_override', { p_client_id: clientId });
    await fetchSettings();
  }, [fetchSettings]);

  const global = settings.find((s) => s.client_id === null) || null;
  const overrideFor = (clientId) => settings.find((s) => s.client_id === clientId) || null;

  return { settings, global, overrideFor, loading, save, clearOverride, refetch: fetchSettings };
}

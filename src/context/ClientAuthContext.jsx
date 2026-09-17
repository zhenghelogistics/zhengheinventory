import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Auth for the customer-facing Client Portal.
 *
 * Unlike WarehouseAuthContext (name + PIN in localStorage, fine for staff on
 * the warehouse floor), external customers get real Supabase Auth sessions.
 * The session's JWT is what Row Level Security reads, so a client can only
 * ever query its own rows — the browser is never trusted to scope anything.
 *
 * `client` is resolved from the client_users table, which maps one auth user
 * to exactly one client account. A signed-in user with no client_users row
 * is not a portal user (most likely internal staff) and is rejected.
 */

const ClientAuthContext = createContext(null);

export function ClientAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [client, setClient] = useState(null);
  const [profile, setProfile] = useState(null);
  // Starts true: until Supabase restores any persisted session we don't know
  // whether the user is logged in, and must not flash the login screen.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadClient = useCallback(async (activeSession) => {
    if (!activeSession) {
      setClient(null);
      setProfile(null);
      return;
    }

    const { data, error: err } = await supabase
      .from('client_users')
      .select('client_id, role, full_name, active, clients(id, code, name, active)')
      .eq('user_id', activeSession.user.id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setClient(null);
      return;
    }

    if (!data || !data.active || !data.clients?.active) {
      // Signed in, but not a portal user — don't leave them in limbo with a
      // valid session and no data.
      await supabase.auth.signOut();
      setClient(null);
      setProfile(null);
      setError('This account is not linked to an active client. Contact Zhenghe Logistics.');
      return;
    }

    setClient(data.clients);
    setProfile({ role: data.role, fullName: data.full_name });
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadClient(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      await loadClient(newSession);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadClient]);

  const login = useCallback(async (email, password) => {
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setLoading(false);
      // Supabase returns the same message for unknown email and wrong
      // password, which is what we want to show — don't leak which it was.
      setError('Wrong email or password.');
      return false;
    }
    // onAuthStateChange resolves the client and clears loading.
    return true;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setClient(null);
    setProfile(null);
    setSession(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/portal/reset-password`,
    });
    if (err) { setError(err.message); return false; }
    return true;
  }, []);

  return (
    <ClientAuthContext.Provider
      value={{
        session,
        client,
        profile,
        loading,
        error,
        setError,
        login,
        logout,
        requestPasswordReset,
        isAuthenticated: !!session && !!client,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used inside ClientAuthProvider');
  return ctx;
}

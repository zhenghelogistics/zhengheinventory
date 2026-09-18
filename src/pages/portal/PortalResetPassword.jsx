import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * Where the "Forgot your password" email lands.
 *
 * Supabase puts a short-lived recovery session in place when the link is
 * opened, which is what lets updateUser change the password without knowing
 * the old one. This screen sits OUTSIDE PortalLayout's auth guard — someone
 * arriving here has a session but has not really signed in yet, and should
 * see a password form rather than their dashboard.
 */
export default function PortalResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // The recovery session arrives via the URL fragment; supabase-js picks it
    // up asynchronously, so wait for it rather than reading getSession once.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    // Give the fragment a moment before declaring the link dead.
    const t = setTimeout(() => setReady((r) => r || 'expired'), 3000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Those passwords don’t match.'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    // Force a clean sign-in with the new password rather than riding the
    // recovery session into the portal.
    await supabase.auth.signOut();
    setDone(true);
  }

  const inputCls =
    'w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 ' +
    'placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{ fontFamily: "'Fira Sans', system-ui, sans-serif", background: '#0a0f1e' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/hive-logo.svg"
            alt="Zhenghe Logistics"
            className="h-16 w-auto mx-auto mb-4"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1 className="text-xl font-black text-white tracking-tight">Set a new password</h1>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          {done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-11 h-11 rounded-full bg-teal-50 flex items-center justify-center mx-auto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Password updated</p>
              <button
                onClick={() => navigate('/portal', { replace: true })}
                className="w-full h-11 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          ) : ready === 'expired' ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">This link has expired</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Reset links are single-use and time-limited. Request a fresh one from
                the sign-in screen.
              </p>
              <button
                onClick={() => navigate('/portal', { replace: true })}
                className="w-full h-11 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 cursor-pointer"
              >
                Back to sign in
              </button>
            </div>
          ) : !ready ? (
            <p className="text-xs text-slate-400 text-center py-6">Checking your link…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  className={inputCls}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  className={inputCls}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                />
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60 cursor-pointer transition"
              >
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

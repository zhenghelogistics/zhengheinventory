import { useState } from 'react';
import { useClientAuth } from '../../context/ClientAuthContext';

export default function PortalLogin() {
  const { login, error, loading, requestPasswordReset, setError } = useClientAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    if (mode === 'reset') {
      const ok = await requestPasswordReset(email);
      if (ok) setResetSent(true);
    } else {
      await login(email, password);
    }
    setBusy(false);
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
          <h1 className="text-xl font-black text-white tracking-tight">Client Portal</h1>
          <p className="text-slate-400 text-xs mt-1.5">Zhenghe Logistics · Warehouse &amp; Distribution</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-2xl space-y-4">
          {resetSent ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-11 h-11 rounded-full bg-teal-50 flex items-center justify-center mx-auto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Check your email</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                If <span className="font-semibold">{email}</span> has a portal account,
                a password reset link is on its way.
              </p>
              <button
                type="button"
                onClick={() => { setResetSent(false); setMode('login'); }}
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  className={inputCls}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                />
              </div>

              {mode === 'login' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    className={inputCls}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  />
                </div>
              )}

              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || loading}
                className="w-full h-11 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60 transition cursor-pointer"
              >
                {busy || loading
                  ? 'Please wait…'
                  : mode === 'reset' ? 'Send reset link' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'reset' : 'login'); setError(null); }}
                className="w-full text-xs font-semibold text-slate-500 hover:text-teal-700 cursor-pointer"
              >
                {mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}
              </button>
            </>
          )}
        </form>

        <p className="text-slate-600 text-[11px] text-center mt-6">
          Need access? Contact your Zhenghe account manager.
        </p>
      </div>
    </div>
  );
}

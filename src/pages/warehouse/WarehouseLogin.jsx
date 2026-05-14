import { useState } from 'react';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

export default function WarehouseLogin() {
  const { login, loading, error } = useWarehouseAuth();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    await login(name, pin);
  }

  function appendPin(digit) {
    if (pin.length < 6) setPin((p) => p + digit);
  }

  function clearPin() { setPin(''); }

  const PAD = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];

  return (
    <div className="min-h-screen bg-[#0f1f5c] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <h1 className="text-white text-3xl font-black tracking-widest">HIVE</h1>
          <p className="text-white/40 text-xs tracking-widest uppercase mt-0.5">Zhenghe Logistics</p>
          <p className="text-white/60 text-sm mt-3">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-2xl space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Your Name</label>
            <input
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-slate-800 text-base font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="e.g. Ahmad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          {/* PIN display */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">PIN</label>
            <div className="flex gap-2 justify-center mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-colors ${
                    i < pin.length
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {i < pin.length ? '●' : ''}
                </div>
              ))}
            </div>

            {/* Number pad */}
            <div className="grid grid-cols-3 gap-2">
              {PAD.map((d) => {
                if (d === '✓') {
                  return (
                    <button
                      key={d}
                      type="submit"
                      disabled={loading || !name.trim() || pin.length < 4}
                      className="h-14 rounded-xl bg-[#0f1f5c] text-white font-bold text-xl flex items-center justify-center active:bg-[#1a2f7a] disabled:opacity-40 cursor-pointer"
                    >
                      {loading ? '…' : '✓'}
                    </button>
                  );
                }
                if (d === '⌫') {
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={clearPin}
                      className="h-14 rounded-xl bg-slate-100 text-slate-600 font-bold text-xl flex items-center justify-center active:bg-slate-200 cursor-pointer"
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => appendPin(d)}
                    className="h-14 rounded-xl bg-slate-100 text-slate-800 font-bold text-xl flex items-center justify-center active:bg-slate-200 cursor-pointer"
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-medium px-4 py-3 rounded-xl text-center">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

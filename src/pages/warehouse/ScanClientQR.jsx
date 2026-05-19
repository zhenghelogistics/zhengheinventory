import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

export default function ScanClientQR() {
  const { user } = useWarehouseAuth();
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState(null); // { movement, conf }
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        await scanner.stop();
        setScanning(false);
        await handleScan(decodedText);
      },
      () => {}
    ).catch((err) => {
      setScanning(false);
      setError('Camera access denied. Please allow camera permission and try again.');
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  async function handleScan(token) {
    // Look up movement by client_token
    const { data: movement, error: mvErr } = await supabase
      .from('movements')
      .select('*')
      .eq('client_token', token)
      .maybeSingle();

    if (mvErr || !movement) {
      setError('QR code not recognised. Please try again.');
      return;
    }

    // Get or create confirmation record
    let { data: conf } = await supabase
      .from('delivery_confirmations')
      .select('*')
      .eq('movement_id', movement.id)
      .maybeSingle();

    if (!conf) {
      const { data: newConf } = await supabase
        .from('delivery_confirmations')
        .insert({ movement_id: movement.id })
        .select()
        .single();
      conf = newConf;
    }

    setResult({ movement, conf });
  }

  async function confirmFactor3() {
    if (!result || confirming) return;
    setConfirming(true);
    const { data } = await supabase
      .from('delivery_confirmations')
      .update({
        factor3_confirmed_at: new Date().toISOString(),
        factor3_scanned_by_name: user?.name || 'Warehouse',
        factor3_scanned_by_id: user?.id || null,
      })
      .eq('id', result.conf.id)
      .select()
      .single();

    await supabase.from('warehouse_activity_log').insert({
      user_id: user?.id || null,
      user_name: user?.name || 'Warehouse',
      action_type: 'scan_client_qr',
      record_id: result.movement.id,
      record_ref: result.movement.movement_no,
      details: { movement_no: result.movement.movement_no, company: result.movement.company_name },
    });

    setConfirming(false);
    setDone(true);
  }

  function reset() {
    setScanning(true);
    setResult(null);
    setError(null);
    setDone(false);

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        await scanner.stop();
        setScanning(false);
        await handleScan(decodedText);
      },
      () => {}
    ).catch(() => setError('Camera access denied.'));
  }

  if (done) {
    return (
      <div className="px-4 py-10 max-w-sm mx-auto text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Factor 3 Confirmed</h2>
        <p className="text-slate-500 text-sm mb-2">{result.movement.company_name || 'Client'} · {result.movement.movement_no}</p>
        <p className="text-xs text-slate-400 mb-6">Client QR scanned and recorded by <strong>{user?.name}</strong></p>
        <button onClick={reset} className="w-full h-12 rounded-2xl bg-blue-600 text-white font-bold cursor-pointer">
          Scan Another
        </button>
      </div>
    );
  }

  if (result && result.conf) {
    const { movement, conf } = result;
    const f3Already = !!conf.factor3_confirmed_at;

    return (
      <div className="px-4 py-5 max-w-sm mx-auto">
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm mb-4">
          <div className="font-mono font-bold text-slate-800 text-lg mb-0.5">{movement.movement_no}</div>
          <div className="text-slate-600 font-semibold text-sm mb-4">{movement.company_name || 'No company'}</div>

          <div className="space-y-2 text-xs mb-4">
            {[
              { label: 'Ground Staff (F1)', at: conf.factor1_confirmed_at, by: conf.factor1_user_name },
              { label: 'Admin Approval (F2)', at: conf.factor2_confirmed_at, by: conf.factor2_user_name },
              { label: 'Client QR (F3)', at: conf.factor3_confirmed_at, by: conf.factor3_scanned_by_name },
            ].map(({ label, at, by }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${at ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${at ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  {at && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span className="font-semibold">{label}</span>
                {at && by && <span className="text-emerald-400 ml-auto">{by}</span>}
              </div>
            ))}
          </div>

          {f3Already ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-xs font-semibold text-center">
              Factor 3 already confirmed for this movement
            </div>
          ) : (
            <button
              onClick={confirmFactor3}
              disabled={confirming}
              className="w-full h-13 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-base disabled:opacity-60 cursor-pointer active:bg-emerald-600"
            >
              {confirming ? 'Recording…' : 'Confirm Client Present (Factor 3)'}
            </button>
          )}
        </div>

        <button onClick={reset} className="w-full py-3 text-sm text-slate-500 font-semibold cursor-pointer">
          Scan a different QR
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-sm mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Scan Client QR</h2>
        <p className="text-slate-500 text-xs mt-0.5">Point camera at the client's QR code</p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <p className="text-red-600 text-sm font-semibold mb-3">{error}</p>
          <button onClick={reset} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold cursor-pointer">
            Try Again
          </button>
        </div>
      ) : (
        <div className="bg-black rounded-2xl overflow-hidden">
          <div id="qr-reader" className="w-full" />
        </div>
      )}

      {scanning && !error && (
        <p className="text-center text-xs text-slate-400 mt-3">Align QR code within the frame</p>
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { exportInboundConfirmation } from '../../utils/pdfExports';

function SignaturePad({ onSave, onSkip }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(false);
  const dpr = useRef(1);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [name, setName] = useState('');

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    dpr.current = window.devicePixelRatio || 1;
    const { width, height } = wrap.getBoundingClientRect();
    canvas.width = Math.round(width * dpr.current);
    canvas.height = Math.round(height * dpr.current);
    canvas.getContext('2d').scale(dpr.current, dpr.current);
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function start(e) { e.preventDefault(); drawing.current = true; const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { e.preventDefault(); if (!drawing.current) return; const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e3a8a'; ctx.lineTo(p.x, p.y); ctx.stroke(); setHasStrokes(true); }
  function end(e) { e.preventDefault(); drawing.current = false; }
  function clear() { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasStrokes(false); }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Driver / Client Signature</h3>
          <p className="text-xs text-slate-400 mt-0.5">Type name, then sign to confirm delivery</p>
        </div>
        <button onClick={onSkip} className="text-xs text-slate-400 font-semibold cursor-pointer px-2 py-1">Skip</button>
      </div>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <input
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 font-semibold text-sm focus:outline-none focus:border-blue-400"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div ref={wrapRef} className="flex-1 mx-4 mb-2 relative bg-slate-50 rounded-2xl border-2 border-slate-200 overflow-hidden" style={{ minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} className="touch-none"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        <div className="absolute left-8 right-8 pointer-events-none" style={{ bottom: '28%' }}>
          <div className="border-b-2 border-dashed border-slate-300" />
          <p className="text-[10px] text-slate-300 mt-1 text-center">Sign above this line</p>
        </div>
        {!hasStrokes && <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '10%' }}><span className="text-slate-300 text-base font-medium">Sign here</span></div>}
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-6 pt-2 shrink-0">
        <button onClick={clear} className="h-13 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold cursor-pointer active:bg-slate-200">Clear</button>
        <button onClick={() => onSave(canvasRef.current.toDataURL('image/png'), name)} disabled={!hasStrokes || !name.trim()} className="h-13 py-3.5 rounded-xl bg-blue-600 text-white font-bold cursor-pointer disabled:opacity-50 active:bg-blue-700">Confirm</button>
      </div>
    </div>
  );
}

// Inject CSS to strip the library's default ugly UI
const SCANNER_CSS = `
  #qr-reader { border: none !important; background: transparent !important; }
  #qr-reader__header_message { display: none !important; }
  #qr-reader__status_span { display: none !important; }
  #qr-reader__dashboard_section_csr button {
    background: #4f46e5 !important;
    color: white !important;
    border: none !important;
    border-radius: 12px !important;
    padding: 12px 24px !important;
    font-weight: 700 !important;
    font-size: 14px !important;
    cursor: pointer !important;
    width: 100% !important;
    margin-top: 8px !important;
  }
  #qr-reader__dashboard_section_swaplink { display: none !important; }
  #qr-reader__filescan_input { display: none !important; }
  #qr-reader__dashboard_section_filesel { display: none !important; }
  #qr-reader video { border-radius: 16px !important; width: 100% !important; }
  #qr-reader__scan_region { border-radius: 16px !important; overflow: hidden !important; }
  #qr-reader__scan_region img { display: none !important; }
  #qr-reader__dashboard { padding: 8px 0 0 0 !important; }
`;

export default function ScanClientQR() {
  const { user } = useWarehouseAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [stockLines, setStockLines] = useState([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [done, setDone] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    // Inject CSS once
    if (!document.getElementById('qr-scanner-style')) {
      const style = document.createElement('style');
      style.id = 'qr-scanner-style';
      style.textContent = SCANNER_CSS;
      document.head.appendChild(style);
    }

    startScanner();
    return () => stopScanner();
  }, []);

  function startScanner() {
    if (scannerRef.current) return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        supportedScanTypes: [0],
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        videoConstraints: { facingMode: 'environment' },
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        stopScanner();
        await handleScan(decodedText);
      },
      () => {} // suppress per-frame errors
    );

    scannerRef.current = scanner;
  }

  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
  }

  async function handleScan(token) {
    const { data: movement, error: mvErr } = await supabase
      .from('movements')
      .select('*')
      .eq('client_token', token)
      .maybeSingle();

    if (mvErr || !movement) {
      setError('QR code not recognised. Please try again.');
      return;
    }

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
    await supabase
      .from('delivery_confirmations')
      .update({
        factor3_confirmed_at: new Date().toISOString(),
        factor3_scanned_by_name: user?.name || 'Warehouse',
        factor3_scanned_by_id: user?.id || null,
      })
      .eq('id', result.conf.id);

    await supabase.from('warehouse_activity_log').insert({
      user_id: user?.id || null,
      user_name: user?.name || 'Warehouse',
      action_type: 'scan_client_qr',
      record_id: result.movement.id,
      record_ref: result.movement.movement_no,
      details: { movement_no: result.movement.movement_no, company: result.movement.company_name },
    });

    // Fetch inbound stock lines for the PDF
    const { data: lines } = await supabase
      .from('stock_lines')
      .select('*')
      .eq('movement_id', movement.id)
      .order('created_at');
    setStockLines(lines || []);

    setConfirming(false);
    setShowSignature(true);
  }

  async function saveSignature(dataUrl, name) {
    const { data: updatedConf } = await supabase
      .from('delivery_confirmations')
      .update({ inbound_signature_data: dataUrl, inbound_signature_name: name })
      .eq('id', result.conf.id)
      .select()
      .single();
    setShowSignature(false);
    setDone(true);

    // Auto-generate PDF immediately
    try {
      await exportInboundConfirmation(result.movement, updatedConf || result.conf, dataUrl, name, stockLines);
    } catch {}
  }

  function skipSignature() {
    setShowSignature(false);
    setDone(true);
  }

  function reset() {
    setResult(null);
    setError(null);
    setDone(false);
    setTimeout(() => startScanner(), 100);
  }

  // ── Signature ─────────────────────────────────────────────────────────────
  if (showSignature) {
    return <SignaturePad onSave={saveSignature} onSkip={skipSignature} />;
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="px-4 py-10 max-w-sm mx-auto text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Factor 3 Confirmed</h2>
        <p className="text-slate-500 text-sm mb-2">{result.movement.company_name} · {result.movement.movement_no}</p>
        <p className="text-xs text-slate-400 mb-6">Client QR scanned by <strong>{user?.name}</strong></p>
        <button
          onClick={async () => {
            setGeneratingPdf(true);
            try {
              await exportInboundConfirmation(
                result.movement, result.conf,
                result.conf?.inbound_signature_data, result.conf?.inbound_signature_name,
                stockLines
              );
            } catch {}
            setGeneratingPdf(false);
          }}
          disabled={generatingPdf}
          className="w-full h-12 rounded-2xl bg-emerald-600 text-white font-bold cursor-pointer active:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {generatingPdf ? 'Generating…' : 'Download Confirmation PDF'}
        </button>
        <button onClick={reset} className="w-full h-12 rounded-2xl bg-slate-100 text-slate-600 font-bold cursor-pointer active:bg-slate-200">
          Scan Another
        </button>
      </div>
    );
  }

  // ── Scan result — confirm F3 ───────────────────────────────────────────────
  if (result) {
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
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${at ? 'bg-emerald-500' : 'bg-slate-300'}`}>
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

  // ── Scanner UI ────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-5 max-w-sm mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Scan Client QR</h2>
        <p className="text-slate-500 text-xs mt-0.5">Point the camera at the client's QR code</p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
          <p className="text-red-600 text-sm font-semibold mb-3">{error}</p>
          <button onClick={reset} className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold cursor-pointer">
            Try Again
          </button>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden bg-black">
          <div id="qr-reader" className="w-full" />
        </div>
      )}

      <p className="text-center text-xs text-slate-400 mt-3">
        Tap "Start Scanning" then allow camera access
      </p>
    </div>
  );
}

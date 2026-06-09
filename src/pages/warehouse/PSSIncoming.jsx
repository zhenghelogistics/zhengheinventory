import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';
import { exportPSSProofOfDelivery, exportPSSLoadingReport, exportPSSBulkLoadingReport } from '../../utils/pdfExports';

// ── Signature pad ─────────────────────────────────────────────────────────────
function SignaturePad({ onSave, onBack }) {
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
  function move(e) { e.preventDefault(); if (!drawing.current) return; const p = getPos(e); const ctx = canvasRef.current.getContext('2d'); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a'; ctx.lineTo(p.x, p.y); ctx.stroke(); setHasStrokes(true); }
  function end(e) { e.preventDefault(); drawing.current = false; }
  function clear() { canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasStrokes(false); }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Driver Signature</h3>
          <p className="text-xs text-slate-400 mt-0.5">Enter driver's name and sign to confirm delivery</p>
        </div>
        <button onClick={onBack} className="text-xs text-slate-400 font-semibold cursor-pointer px-2 py-1">Back</button>
      </div>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <input
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 font-semibold text-sm focus:outline-none focus:border-teal-400"
          placeholder="Driver's full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
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
        <button onClick={clear} className="py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold cursor-pointer active:bg-slate-200">Clear</button>
        <button onClick={() => onSave(canvasRef.current.toDataURL('image/png'), name)} disabled={!hasStrokes || !name.trim()} className="py-3.5 rounded-xl bg-teal-600 text-white font-bold cursor-pointer disabled:opacity-50 active:bg-teal-700">Confirm</button>
      </div>
    </div>
  );
}

// ── QR Scanner ────────────────────────────────────────────────────────────────
const SCANNER_CSS = `
  #pss-qr-reader { border: none !important; background: transparent !important; }
  #pss-qr-reader__header_message { display: none !important; }
  #pss-qr-reader__status_span { display: none !important; }
  #pss-qr-reader__dashboard_section_csr button {
    background: #0d9488 !important; color: white !important; border: none !important;
    border-radius: 12px !important; padding: 12px 24px !important;
    font-weight: 700 !important; font-size: 14px !important;
    cursor: pointer !important; width: 100% !important; margin-top: 8px !important;
  }
  #pss-qr-reader__dashboard_section_swaplink { display: none !important; }
  #pss-qr-reader__filescan_input { display: none !important; }
  #pss-qr-reader__dashboard_section_filesel { display: none !important; }
  #pss-qr-reader video { border-radius: 16px !important; width: 100% !important; }
  #pss-qr-reader__scan_region { border-radius: 16px !important; overflow: hidden !important; }
  #pss-qr-reader__scan_region img { display: none !important; }
  #pss-qr-reader__dashboard { padding: 8px 0 0 0 !important; }
`;

function QRScanner({ onScanned, onSkip }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!document.getElementById('pss-qr-style')) {
      const s = document.createElement('style');
      s.id = 'pss-qr-style';
      s.textContent = SCANNER_CSS;
      document.head.appendChild(s);
    }
    const scanner = new Html5QrcodeScanner('pss-qr-reader', {
      fps: 10, qrbox: { width: 240, height: 240 },
      supportedScanTypes: [0], rememberLastUsedCamera: true,
      showTorchButtonIfSupported: true,
      videoConstraints: { facingMode: 'environment' },
    }, false);
    scanner.render((text) => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
      onScanned(text);
    }, () => {});
    scannerRef.current = scanner;
    return () => { scanner.clear().catch(() => {}); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-bold text-white text-base">Scan Delivery QR</h3>
          <p className="text-slate-400 text-xs mt-0.5">Point at the QR code on the driver's delivery document</p>
        </div>
      </div>
      <div className="flex-1 px-4 overflow-hidden">
        <div className="rounded-2xl overflow-hidden bg-black h-full max-h-[480px]">
          <div id="pss-qr-reader" className="w-full" />
        </div>
      </div>
      <div className="px-4 py-6 shrink-0">
        <button onClick={onSkip} className="w-full py-3.5 rounded-xl border border-slate-600 text-slate-300 font-semibold text-sm cursor-pointer active:bg-slate-800">
          No QR code — go straight to signature
        </button>
      </div>
    </div>
  );
}

function StepCard({ number, title, state, children }) {
  const colors = {
    done:    'border-emerald-200 bg-emerald-50',
    active:  'border-teal-300 bg-teal-50/40',
    waiting: 'border-slate-200 bg-white',
    locked:  'border-slate-200 bg-slate-50/60',
  };
  const numColors = {
    done:    'bg-emerald-500 text-white',
    active:  'bg-teal-600 text-white',
    waiting: 'bg-slate-200 text-slate-400',
    locked:  'bg-slate-200 text-slate-400',
  };
  const check = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${colors[state]}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${numColors[state]}`}>
          {state === 'done' ? check : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm ${state === 'locked' || state === 'waiting' ? 'text-slate-400' : 'text-slate-800'}`}>{title}</div>
          {(state === 'waiting' || state === 'locked') && (
            <div className="text-[10px] text-slate-400 mt-0.5">Complete previous step first</div>
          )}
        </div>
        {state === 'active' && <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse shrink-0" />}
      </div>
      {(state === 'active' || state === 'done') && children && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

function FactorPip({ n, done, name }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        {done
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </div>
      {done && name
        ? <span className="text-[9px] font-bold text-emerald-600 text-center max-w-[60px] truncate">{name}</span>
        : <span className="text-[9px] font-bold uppercase tracking-wide">{n === 1 ? 'Ground' : n === 2 ? 'Admin' : 'Client'}</span>}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0 mt-0.5">{label}</span>
      <span className="text-xs text-slate-700 font-semibold text-right">{value}</span>
    </div>
  );
}

export default function PSSIncoming() {
  const { user } = useWarehouseAuth();
  const { log } = useWarehouseLog();

  const [movements, setMovements] = useState([]);
  const [confsByMovId, setConfsByMovId] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState({});
  const [conf, setConf] = useState(null);
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingF1, setConfirmingF1] = useState(false);
  const [received, setReceived] = useState(false);

  // POD flow: null | 'scanning' | 'signing' | 'done'
  const [podFlow, setPodFlow] = useState(null);
  const [podGenerating, setPodGenerating] = useState(false);
  const [weights, setWeights] = useState({});
  const [reportGenerating, setReportGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [discrepancyMode, setDiscrepancyMode] = useState(false);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pss_incoming_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_confirmations' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);

    // Query movements with source='PSS' directly — no FK dependency
    const [mvRes, confRes] = await Promise.all([
      supabase
        .from('movements')
        .select('id, movement_no, company_name, status, type, date_in, created_at')
        .eq('source', 'PSS')
        .in('status', ['New', 'In Progress'])
        .order('created_at', { ascending: false }),
      supabase.from('delivery_confirmations').select('*'),
    ]);

    const movs = mvRes.data || [];

    // Fetch PSS shipment details for rich info on each card
    if (movs.length > 0) {
      const movIds = movs.map((m) => m.id);
      const { data: pssData } = await supabase
        .from('pss_shipments')
        .select('*')
        .in('movement_id', movIds);
      const pssByMovId = {};
      (pssData || []).forEach((p) => { if (p.movement_id) pssByMovId[p.movement_id] = p; });
      movs.forEach((m) => { m._pss = pssByMovId[m.id] || {}; });
    }

    setMovements(movs);
    const byMovId = {};
    (confRes.data || []).forEach((c) => { byMovId[c.movement_id] = c; });
    setConfsByMovId(byMovId);
    setLoading(false);
    setRefreshing(false);
  }

  async function selectMovement(mv) {
    setSelected(mv);
    setMeta(mv._pss || {});
    setReceived(mv.status === 'In Progress');

    setDetailLoading(true);
    setConf(null);
    setLines([]);

    const [linesRes, confRes] = await Promise.all([
      supabase.from('stock_lines').select('*').eq('movement_id', mv.id).order('sort_order').order('created_at'),
      supabase.from('delivery_confirmations').select('*').eq('movement_id', mv.id).maybeSingle(),
    ]);

    const linesData = linesRes.data || [];
    setLines(linesData);
    setConf(confRes.data || null);
    const init = {};
    const wInit = {};
    linesData.forEach((l) => {
      init[l.id] = String(l.qty_actual ?? '');
      wInit[l.id] = l.weight_kg != null ? String(l.weight_kg) : '';
    });
    setDrafts(init);
    setWeights(wInit);
    setDetailLoading(false);
  }

  async function confirmReceipt() {
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    for (const line of lines) {
      const w = parseFloat(weights[line.id]);
      // Save qty_actual first — this is the critical update
      await supabase.from('stock_lines')
        .update({ qty_actual: line.qty_ordered, date_in: today })
        .eq('id', line.id);
      // Save weight separately — fails gracefully if column not yet added
      if (w > 0) {
        await supabase.from('stock_lines')
          .update({ weight_kg: w })
          .eq('id', line.id);
      }
      await log('pss_receive', line.id, selected.movement_no, {
        sku: line.sku, description: line.description, qty_confirmed: line.qty_ordered,
      });
    }
    await supabase.from('movements').update({ status: 'In Progress' }).eq('id', selected.id);

    const totalKg = Object.values(weights).reduce((s, w) => s + (parseFloat(w) || 0), 0);
    if (totalKg > 0 && meta?.id) {
      await supabase.from('pss_shipments')
        .update({ gross_weight_kg: totalKg })
        .eq('id', meta.id);
      setMeta((p) => ({ ...p, gross_weight_kg: totalKg }));
    }

    setLines((prev) => prev.map((l) => ({
      ...l,
      weight_kg: parseFloat(weights[l.id]) || l.weight_kg || null,
    })));
    setSelected((p) => ({ ...p, status: 'In Progress' }));
    setReceived(true);
    setSaving(false);
  }

  async function generateLoadingReport() {
    setReportGenerating(true);
    try {
      await exportPSSLoadingReport({
        movement: selected, pssShipment: meta, lines, conf,
        grossWeightKg: meta?.gross_weight_kg,
      });
    } catch (e) { console.error(e); }
    setReportGenerating(false);
  }

  async function sendLoadingReport() {
    setSending(true);
    const now = new Date().toISOString();
    if (meta?.id) {
      await supabase.from('pss_shipments')
        .update({ report_sent_at: now, report_sent_by: user?.name || 'Warehouse' })
        .eq('id', meta.id);
      setMeta((p) => ({ ...p, report_sent_at: now, report_sent_by: user?.name || 'Warehouse' }));
    }
    try {
      await exportPSSLoadingReport({
        movement: selected, pssShipment: meta, lines, conf,
        grossWeightKg: meta?.gross_weight_kg,
      });
    } catch (e) { console.error(e); }
    setSending(false);
  }

  async function flagDiscrepancy() {
    if (!meta?.id || !discrepancyNotes.trim()) return;
    setFlagging(true);
    await supabase.from('pss_shipments')
      .update({ discrepancy_status: 'flagged', discrepancy_notes: discrepancyNotes.trim() })
      .eq('id', meta.id);
    setMeta((p) => ({ ...p, discrepancy_status: 'flagged', discrepancy_notes: discrepancyNotes.trim() }));
    setDiscrepancyMode(false);
    setFlagging(false);
  }

  async function generateBulkReport() {
    setBulkGenerating(true);
    const { data: allMovs } = await supabase
      .from('movements')
      .select('*')
      .eq('source', 'PSS')
      .in('status', ['In Progress', 'Completed']);
    const reports = [];
    for (const mov of (allMovs || [])) {
      const [{ data: lns }, { data: pss }] = await Promise.all([
        supabase.from('stock_lines').select('*').eq('movement_id', mov.id),
        supabase.from('pss_shipments').select('*').eq('movement_id', mov.id).maybeSingle(),
      ]);
      reports.push({ movement: mov, lines: lns || [], pssShipment: pss || {} });
    }
    try { await exportPSSBulkLoadingReport(reports); } catch (e) { console.error(e); }
    setBulkGenerating(false);
  }

  async function confirmFactor1() {
    setConfirmingF1(true);
    const now = new Date().toISOString();
    const { data: updatedConf } = await supabase
      .from('delivery_confirmations')
      .upsert(
        { movement_id: selected.id, factor1_confirmed_at: now, factor1_user_name: user?.name || 'Ground Staff' },
        { onConflict: 'movement_id', ignoreDuplicates: false }
      )
      .select()
      .single();
    if (updatedConf) setConf(updatedConf);
    setConfirmingF1(false);
  }

  async function savePOD(signatureDataUrl, driverName) {
    const now = new Date().toISOString();
    const { data: updatedConf } = await supabase
      .from('delivery_confirmations')
      .upsert({
        movement_id: selected.id,
        factor3_confirmed_at: now,
        factor3_scanned_by_name: user?.name || 'Warehouse',
        factor3_scanned_by_id: user?.id || null,
        inbound_signature_data: signatureDataUrl,
        inbound_signature_name: driverName,
      }, { onConflict: 'movement_id', ignoreDuplicates: false })
      .select()
      .single();

    if (updatedConf) setConf(updatedConf);
    setPodFlow('done');

    // Generate PDF immediately
    setPodGenerating(true);
    try {
      await exportPSSProofOfDelivery({
        movement: selected,
        pssShipment: meta,
        lines,
        conf: updatedConf || conf,
        signatureDataUrl,
        driverName,
      });
    } catch (e) { console.error('PDF error', e); }
    setPodGenerating(false);
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    const f1Done = !!conf?.factor1_confirmed_at;
    const f2Done = !!conf?.factor2_confirmed_at;
    const f3Done = !!conf?.factor3_confirmed_at;
    const allConfirmed = f1Done && f2Done && f3Done;
    const step2State = allConfirmed ? 'done' : received ? 'active' : 'locked';

    // POD overlays
    if (podFlow === 'scanning') {
      return <QRScanner onScanned={() => setPodFlow('signing')} onSkip={() => setPodFlow('signing')} />;
    }
    if (podFlow === 'signing') {
      return <SignaturePad onSave={savePOD} onBack={() => setPodFlow('scanning')} />;
    }
    if (podFlow === 'done') {
      return (
        <div className="px-4 py-10 max-w-sm mx-auto text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-1">Delivery Confirmed</h2>
          <p className="text-slate-500 text-sm mb-1">{selected.movement_no}</p>
          <p className="text-slate-400 text-xs mb-6">Signed by <strong>{conf?.inbound_signature_name}</strong> · All 3 factors complete</p>
          <button
            onClick={async () => {
              setPodGenerating(true);
              try {
                await exportPSSProofOfDelivery({
                  movement: selected, pssShipment: meta, lines, conf,
                  signatureDataUrl: conf?.inbound_signature_data,
                  driverName: conf?.inbound_signature_name,
                });
              } catch {}
              setPodGenerating(false);
            }}
            disabled={podGenerating}
            className="w-full h-12 rounded-2xl bg-teal-600 text-white font-bold cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {podGenerating ? 'Generating PDF…' : 'Download Proof of Delivery'}
          </button>
          <button onClick={() => { setPodFlow(null); setSelected(null); setLines([]); setConf(null); }} className="w-full h-12 rounded-2xl bg-slate-100 text-slate-600 font-bold cursor-pointer active:bg-slate-200">
            Done
          </button>
        </div>
      );
    }

    return (
      <div className="px-4 py-5 max-w-lg mx-auto space-y-3 pb-10">
        <button
          onClick={() => { setSelected(null); setLines([]); setConf(null); }}
          className="text-teal-600 text-sm font-semibold flex items-center gap-1 mb-1 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

        {/* Shipment info card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">PSS Shipment</span>
                {meta.pss_status && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.pss_status === 'Submitted' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {meta.pss_status}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black text-slate-800">{selected.movement_no}</h2>
              {selected.company_name && <p className="text-slate-500 text-sm">{selected.company_name}</p>}
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${received ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>
              {received ? 'Received' : 'Pending'}
            </span>
          </div>

          <div className="space-y-0">
            <InfoRow label="ETD" value={selected.date_in ? new Date(selected.date_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
            <InfoRow label="Carrier" value={meta.carrier} />
            <InfoRow label="Vessel / Voyage" value={[meta.vessel, meta.voyage].filter(Boolean).join(' · ') || null} />
            <InfoRow label="BL Number" value={meta.bl_number} />
            <InfoRow label="POL" value={meta.pol} />
            <InfoRow label="POD" value={meta.pod} />
            <InfoRow label="Container" value={[meta.container_type, meta.container_no].filter(Boolean).join(' · ') || null} />
            <InfoRow label="Seal" value={meta.seal_no} />
            <InfoRow label="Export Type" value={meta.export_type} />
            <InfoRow label="Consignee" value={meta.consignee} />
            <InfoRow label="Notify Party" value={meta.notify_party} />
            {meta.remarks && <InfoRow label="Remarks" value={meta.remarks} />}
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-slate-200 border-t-teal-500 rounded-full" />
            Loading…
          </div>
        ) : (
          <>
            {/* Step 1: Verify items */}
            <StepCard number={1} title="Verify Shipment" state={received ? 'done' : 'active'}>
              {lines.length === 0 ? (
                <div className="space-y-3">
                  <div className="text-center py-4 text-slate-400 text-sm">No product lines attached — confirm receipt manually.</div>
                  {!received && (
                    <button
                      onClick={confirmReceipt}
                      disabled={saving}
                      className="w-full h-12 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving
                        ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                        : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Mark as Received</>
                      }
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {(() => {
                    const totalKg = Object.values(weights).reduce((s, w) => s + (parseFloat(w) || 0), 0);
                    return (
                      <>
                        <div className="space-y-2 mb-3">
                          {lines.map((line) => {
                            const w = line.weight_kg ?? (received ? null : parseFloat(weights[line.id]) || null);
                            return (
                              <div key={line.id} className={`rounded-xl border overflow-hidden ${received ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-3 p-3">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800 text-sm leading-snug whitespace-pre-line">{line.description || '—'}</div>
                                    {line.sku && <div className="text-[10px] font-mono text-slate-400 mt-0.5">HS: {line.sku}</div>}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="text-2xl font-black tabular-nums text-slate-800">{line.qty_ordered ?? '—'}</div>
                                    <div className="text-[10px] text-slate-400 font-semibold">{line.unit || 'PCS'}</div>
                                    {received && w != null && (
                                      <div className="text-[10px] text-emerald-600 font-black mt-0.5 tabular-nums">{Number(w).toLocaleString()} KG</div>
                                    )}
                                  </div>
                                </div>
                                {!received && (
                                  <div className="flex items-center gap-2 px-3 pb-3 border-t border-amber-100 pt-2 bg-amber-50/40">
                                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide shrink-0">Weight</span>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      className="flex-1 px-3 py-1.5 rounded-lg border-2 border-amber-200 text-slate-800 text-sm font-black focus:outline-none focus:border-amber-400 text-right tabular-nums bg-white"
                                      value={weights[line.id] || ''}
                                      onChange={(e) => setWeights((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                      placeholder="0"
                                    />
                                    <span className="text-xs font-bold text-amber-600 shrink-0">KG</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Running total */}
                        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border mb-3 ${
                          totalKg > 0 || (received && meta?.gross_weight_kg)
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}>
                          <span className="text-xs font-black text-amber-700 uppercase tracking-wide">Total Gross Weight</span>
                          <span className={`font-black text-xl tabular-nums ${totalKg > 0 || meta?.gross_weight_kg ? 'text-amber-800' : 'text-slate-300'}`}>
                            {((received ? meta?.gross_weight_kg : totalKg) || 0) > 0
                              ? `${Number(received ? meta?.gross_weight_kg : totalKg).toLocaleString()} KG`
                              : '— KG'}
                          </span>
                        </div>

                        {!received && (
                          <>
                            {totalKg === 0 && (
                              <p className="text-[10px] text-amber-500 font-semibold text-center -mt-1">
                                Enter item weights above to record gross weight (recommended)
                              </p>
                            )}
                            <button
                              onClick={confirmReceipt}
                              disabled={saving}
                              className="w-full h-12 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                              {saving ? (
                                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                              ) : (
                                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> All Items Present — Confirm</>
                              )}
                            </button>
                          </>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </StepCard>

            {/* Step 2: 3FA Confirmation */}
            <StepCard number={2} title="Inbound Confirmation" state={step2State}>
              {/* Factor pips */}
              <div className="flex items-center justify-around py-2 mb-4">
                <FactorPip n={1} done={f1Done} name={conf?.factor1_user_name} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={2} done={f2Done} name={conf?.factor2_user_name} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={3} done={f3Done} name={conf?.factor3_scanned_by_name} />
              </div>

              {!f1Done ? (
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 mb-3">
                  <div className="font-bold text-slate-800 text-sm mb-1">Your sign-off required</div>
                  <p className="text-slate-500 text-xs mb-3 leading-relaxed">
                    Verify the received items match the shipment. Once satisfied, confirm below.
                  </p>
                  <button
                    onClick={confirmFactor1}
                    disabled={confirmingF1}
                    className="w-full h-11 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {confirmingF1 ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Delivery Correct — Sign Off (F1)</>
                    )}
                  </button>
                </div>
              ) : !f2Done ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <div>
                    <div className="text-amber-700 text-xs font-bold">Waiting for Admin approval (F2)</div>
                    <div className="text-amber-500 text-[10px] mt-0.5">Admin reviews and approves in Hive</div>
                  </div>
                </div>
              ) : !f3Done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Admin approved · F2 by {conf.factor2_user_name}
                  </div>
                  <button
                    onClick={() => setPodFlow('scanning')}
                    className="w-full h-12 rounded-xl bg-indigo-600 text-white font-bold text-sm cursor-pointer active:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                      <line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/>
                      <line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
                    </svg>
                    Scan Delivery QR &amp; Get Signature
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  All 3 factors confirmed — receipt locked
                </div>
              )}

              {(f1Done || f2Done) && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {f1Done && <div className="text-[10px] text-slate-400">F1: <span className="font-semibold text-slate-500">{conf.factor1_user_name}</span> · {new Date(conf.factor1_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f2Done && <div className="text-[10px] text-slate-400">F2: <span className="font-semibold text-slate-500">{conf.factor2_user_name}</span> · {new Date(conf.factor2_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f3Done && <div className="text-[10px] text-slate-400">F3: <span className="font-semibold text-slate-500">{conf.factor3_scanned_by_name}</span> · {new Date(conf.factor3_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
              )}
            </StepCard>

            {/* ── Actions: Send Report + Flag Discrepancy ───────────────────── */}
            {received && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</h3>

                {/* Send Loading Report to PSS */}
                <button
                  onClick={sendLoadingReport}
                  disabled={sending}
                  className="w-full h-12 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Sending…</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      Send Loading Report to PSS
                    </>
                  )}
                </button>

                {meta.report_sent_at && (
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Report sent {new Date(meta.report_sent_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {meta.report_sent_by}
                  </div>
                )}

                <div className="border-t border-slate-100" />

                {/* Discrepancy */}
                {meta.discrepancy_status === 'flagged' ? (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-red-700 font-bold text-xs">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      Discrepancy flagged — awaiting PSS response
                    </div>
                    <p className="text-red-600 text-[11px] leading-relaxed">{meta.discrepancy_notes}</p>
                  </div>
                ) : meta.discrepancy_status === 'acknowledged' ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span className="text-amber-700 text-xs font-bold">PSS acknowledged the discrepancy</span>
                  </div>
                ) : meta.discrepancy_status === 'disputed' ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span className="text-red-700 text-xs font-bold">PSS disputes this — re-inspection required</span>
                  </div>
                ) : discrepancyMode ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border-2 border-red-200 text-slate-700 text-sm resize-none focus:outline-none focus:border-red-400 placeholder-slate-300"
                      placeholder="Describe the discrepancy — e.g. 'Box 3 damaged, missing 50 units of SKU-001'"
                      value={discrepancyNotes}
                      onChange={(e) => setDiscrepancyNotes(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setDiscrepancyMode(false); setDiscrepancyNotes(''); }} className="h-10 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm cursor-pointer active:bg-slate-200">
                        Cancel
                      </button>
                      <button
                        onClick={flagDiscrepancy}
                        disabled={flagging || !discrepancyNotes.trim()}
                        className="h-10 rounded-xl bg-red-600 text-white font-bold text-sm cursor-pointer active:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {flagging ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
                        Send Flag
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDiscrepancyMode(true)}
                    className="w-full h-11 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm cursor-pointer hover:bg-red-50 active:bg-red-100"
                  >
                    Flag Discrepancy
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">PSS</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800">Incoming Shipments</h2>
          <p className="text-slate-500 text-xs mt-0.5">Shipments created from PSS portal</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateBulkReport}
            disabled={bulkGenerating || movements.filter((m) => m.status === 'In Progress').length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold active:bg-teal-700 cursor-pointer disabled:opacity-40"
          >
            {bulkGenerating ? (
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            {bulkGenerating ? 'Generating…' : 'Bulk Report'}
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold active:bg-slate-200 cursor-pointer disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <p className="text-slate-600 font-semibold text-sm mb-1">No incoming PSS shipments</p>
          <p className="text-slate-400 text-xs">Shipments will appear here once created in the PSS portal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {movements.map((mv) => {
            const m = mv._pss || {};
            const c = confsByMovId[mv.id];
            const f1 = !!c?.factor1_confirmed_at;
            const f2 = !!c?.factor2_confirmed_at;
            const f3 = !!c?.factor3_confirmed_at;
            const allDone = f1 && f2 && f3;
            return (
              <button
                key={mv.id}
                onClick={() => selectMovement(mv)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-left active:scale-[0.98] cursor-pointer transition-all hover:border-teal-200"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="font-black text-slate-800 text-base">{mv.movement_no}</div>
                    {mv.company_name && <div className="text-slate-500 text-sm truncate">{mv.company_name}</div>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    mv.status === 'In Progress' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'
                  }`}>{mv.status === 'In Progress' ? 'Received' : 'Pending'}</span>
                </div>

                {/* Shipping info chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.vessel && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {m.vessel}{m.voyage ? ` · ${m.voyage}` : ''}
                    </span>
                  )}
                  {m.pod && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      → {m.pod}
                    </span>
                  )}
                  {mv.date_in && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      ETD {new Date(mv.date_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {m.container_type && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {m.container_type}
                    </span>
                  )}
                </div>

                {/* 3FA pips */}
                {c ? (
                  <div className="flex items-center gap-1.5">
                    {[{ n: 1, done: f1 }, { n: 2, done: f2 }, { n: 3, done: f3 }].map(({ n, done }) => (
                      <div key={n} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        {done ? '✓' : n}
                      </div>
                    ))}
                    <span className={`text-[10px] font-bold ml-1 ${allDone ? 'text-emerald-600' : !f1 ? 'text-slate-400' : 'text-amber-600'}`}>
                      {allDone ? 'All confirmed' : !f1 ? 'Awaiting sign-off' : 'In progress'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400">{n}</div>
                    ))}
                    <span className="text-[10px] font-bold ml-1 text-slate-400">Not started</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

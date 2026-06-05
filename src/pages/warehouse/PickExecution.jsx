import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { exportPickList } from '../../utils/pdfExports';

// ── Signature pad (full-screen overlay) ──────────────────────────────────────
function SignaturePad({ onSave, onCancel }) {
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
          <h3 className="font-bold text-slate-800 text-base">Customer Signature</h3>
          <p className="text-xs text-slate-400 mt-0.5">Type name, then sign to confirm</p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer active:bg-slate-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <input className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 font-semibold text-sm focus:outline-none focus:border-blue-400" placeholder="Customer full name" value={name} onChange={(e) => setName(e.target.value)} />
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
        <button onClick={() => onSave(canvasRef.current.toDataURL('image/png'), name)} disabled={!hasStrokes || !name.trim()} className="h-13 py-3.5 rounded-xl bg-blue-600 text-white font-bold cursor-pointer disabled:opacity-50 active:bg-blue-700">Confirm Signature</button>
      </div>
    </div>
  );
}

// ── Step card shell ───────────────────────────────────────────────────────────
function StepCard({ number, title, state, by, at, children }) {
  // state: 'done' | 'active' | 'waiting' | 'locked'
  const colors = {
    done:    'border-emerald-200 bg-emerald-50',
    active:  'border-blue-300 bg-blue-50/40',
    waiting: 'border-slate-200 bg-white',
    locked:  'border-slate-200 bg-slate-50/60',
  };
  const numColors = {
    done:    'bg-emerald-500 text-white',
    active:  'bg-blue-600 text-white',
    waiting: 'bg-slate-200 text-slate-400',
    locked:  'bg-slate-200 text-slate-400',
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${colors[state]}`}>
      {/* Step header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${numColors[state]}`}>
          {state === 'done'
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm ${state === 'locked' || state === 'waiting' ? 'text-slate-400' : 'text-slate-800'}`}>{title}</div>
          {state === 'done' && by && (
            <div className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
              {by}{at && <span className="font-normal text-emerald-500"> · {new Date(at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          )}
          {state === 'waiting' && <div className="text-[10px] text-slate-400 mt-0.5">Waiting for previous step</div>}
          {state === 'locked' && <div className="text-[10px] text-slate-400 mt-0.5">Not assigned to you</div>}
        </div>
        {state === 'active' && <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
      </div>
      {/* Step body — only shown when active or done */}
      {(state === 'active' || state === 'done') && children && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PickExecution() {
  const { id } = useParams();
  const { user } = useWarehouseAuth();
  const [pl, setPl] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`pick_list_exec_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pick_lists', filter: `id=eq.${id}` }, (payload) => {
        setPl((prev) => prev ? { ...prev, ...payload.new } : payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function fetchData() {
    const [plRes, itemsRes] = await Promise.all([
      supabase.from('pick_lists').select('*, movements(movement_no, company_name)').eq('id', id).single(),
      supabase.from('pick_list_items').select('*').eq('pick_list_id', id).order('created_at'),
    ]);
    setPl(plRes.data);
    setItems(itemsRes.data || []);
    setLoading(false);
  }

  async function updateStatus(status, extra = {}) {
    setSaving(true);
    await supabase.from('pick_lists').update({ status, updated_at: new Date().toISOString(), ...extra }).eq('id', id);
    setPl((p) => ({ ...p, status, ...extra }));
    setSaving(false);
  }

  async function confirmItem(itemId, factor) {
    const now = new Date().toISOString();
    const field = factor === 1
      ? { confirm1_at: now, confirm1_by: user?.name || 'Staff' }
      : { confirm2_at: now, confirm2_by: user?.name || 'Staff' };
    await supabase.from('pick_list_items').update(field).eq('id', itemId);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, ...field } : i));
  }

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    setPhotoError(null);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const { data: uploaded, error: uploadErr } = await supabase.storage.from('pick-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
    if (uploadErr) { setPhotoError(`Upload failed: ${uploadErr.message}`); setSaving(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('pick-photos').getPublicUrl(uploaded.path);
    const { error: updateErr } = await supabase.from('pick_lists').update({ photo_url: publicUrl, status: 'Admin Review', updated_at: new Date().toISOString() }).eq('id', id);
    if (updateErr) { setPhotoError(`Update failed: ${updateErr.message}`); setSaving(false); return; }
    setPl((p) => ({ ...p, photo_url: publicUrl, status: 'Admin Review' }));
    setSaving(false);
  }

  async function submitSignature(dataUrl, name) {
    setSaving(true);
    setShowSignature(false);
    const now = new Date().toISOString();
    await supabase.from('pick_lists').update({ signature_data: dataUrl, signature_name: name, signed_at: now, status: 'Completed', completed_at: now, updated_at: now }).eq('id', id);

    for (const item of items) {
      if (item.stock_line_id && item.qty_to_pick > 0) {
        const { data: sl } = await supabase.from('stock_lines').select('movement_id, unit, nexus_job_no').eq('id', item.stock_line_id).single();
        if (sl) {
          await supabase.from('stock_lines').insert({ movement_id: sl.movement_id, line_type: 'Outbound', sku: item.sku, description: item.description, unit: item.unit || sl.unit, nexus_job_no: sl.nexus_job_no || null, qty_out: item.qty_to_pick, qty_actual: 0, date_out: now.slice(0, 10), remarks: `FIGARO pick list — ${name}` });
        }
      }
    }

    await supabase.from('warehouse_activity_log').insert({ user_id: user?.id || null, user_name: user?.name || 'Warehouse', action_type: 'figaro_complete', record_id: id, record_ref: pl?.movements?.movement_no, details: { items: items.length, signed_by: name } });
    await fetchData();
    setSaving(false);
    try { await exportPickList(pl?.movements, items, dataUrl, name); } catch {}
  }

  if (loading || !pl) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  const { status, movements: mv } = pl;
  const myName = user?.name || 'Staff';
  const isPicker = !pl.picker_name || pl.picker_name === myName;
  const allPicked1 = items.every((i) => !!i.confirm1_at);
  const allPicked2 = items.every((i) => !!i.confirm2_at);

  // Step states
  const s1Done = allPicked1 && !['Pending', 'Picking'].includes(status);
  const s2Done = allPicked2 && !['Pending', 'Picking', 'Checking'].includes(status);
  const s3Done = !!pl.photo_url && status !== 'Photo Pending';
  const s4Done = !!pl.photo_approved_at;
  const s5Done = !!pl.signed_at;

  const stepState = (doneFlag, activeCondition, lockedCondition) => {
    if (doneFlag) return 'done';
    if (lockedCondition) return 'locked';
    if (activeCondition) return 'active';
    return 'waiting';
  };

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-3 pb-10">
      {showSignature && <SignaturePad onSave={submitSignature} onCancel={() => setShowSignature(false)} />}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

      {/* Header */}
      <div className="mb-1">
        <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
        <div className="text-slate-500 text-sm">{mv?.company_name}</div>
        {pl.picker_name && (
          <div className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {pl.picker_name}
          </div>
        )}
      </div>

      {/* ── Step 1: Pick ── */}
      <StepCard
        number={1}
        title="Staff 1 — Pick"
        state={stepState(s1Done, ['Pending','Picking'].includes(status), false)}
        by={s1Done ? items[0]?.confirm1_by : null}
        at={s1Done ? items[0]?.confirm1_at : null}
      >
        {status === 'Pending' && (isPicker) && (
          <button
            onClick={() => updateStatus('Picking', { picker_name: myName })}
            disabled={saving}
            className="w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-sm cursor-pointer active:bg-blue-700 disabled:opacity-60 mb-3"
          >
            Claim & Start Picking
          </button>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.confirm1_at ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
              <button
                onClick={() => !item.confirm1_at && isPicker && status === 'Picking' && confirmItem(item.id, 1)}
                disabled={!!item.confirm1_at || !isPicker || status !== 'Picking'}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${item.confirm1_at ? 'border-emerald-500 bg-emerald-500 cursor-default' : isPicker && status === 'Picking' ? 'border-slate-300 bg-white cursor-pointer active:border-emerald-400' : 'border-slate-200 bg-slate-50 cursor-default'}`}
              >
                {item.confirm1_at && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${item.confirm1_at ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.description}</div>
                {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
                {item.confirm1_at && item.confirm1_by && <div className="text-[10px] text-emerald-600 font-semibold">{item.confirm1_by}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-black text-slate-700 tabular-nums">{item.qty_to_pick}</div>
                <div className="text-[10px] text-slate-400">{item.unit || 'pcs'}</div>
              </div>
            </div>
          ))}
        </div>

        {status === 'Picking' && isPicker && (
          <div className="mt-3">
            {allPicked1 ? (
              <button onClick={() => updateStatus('Checking')} disabled={saving} className="w-full h-11 rounded-xl bg-violet-500 text-white font-bold text-sm cursor-pointer active:bg-violet-600 disabled:opacity-60">
                All Picked — Hand to Counter-Checker
              </button>
            ) : (
              <div className="text-center text-xs text-slate-400 py-1">{items.filter((i) => i.confirm1_at).length} / {items.length} ticked</div>
            )}
          </div>
        )}

        {status === 'Checking' && isPicker && (
          <div className="mt-2 text-center text-xs text-violet-600 font-semibold py-1 flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Handed off — waiting for counter-check
          </div>
        )}
      </StepCard>

      {/* ── Step 2: Counter-check ── */}
      <StepCard
        number={2}
        title="Staff 2 — Counter-check"
        state={stepState(s2Done, status === 'Checking' && !isPicker, status === 'Checking' && isPicker)}
        by={s2Done ? items[0]?.confirm2_by : null}
        at={s2Done ? items[0]?.confirm2_at : null}
      >
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.confirm2_at ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-white'}`}>
              <button
                onClick={() => !item.confirm2_at && !isPicker && status === 'Checking' && confirmItem(item.id, 2)}
                disabled={!!item.confirm2_at || isPicker || status !== 'Checking'}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${item.confirm2_at ? 'border-violet-500 bg-violet-500 cursor-default' : !isPicker && status === 'Checking' ? 'border-slate-300 bg-white cursor-pointer active:border-violet-400' : 'border-slate-200 bg-slate-50 cursor-default'}`}
              >
                {item.confirm2_at && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${item.confirm2_at ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.description}</div>
                {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
                {item.confirm1_by && <div className="text-[10px] text-slate-400">Picked by {item.confirm1_by}</div>}
                {item.confirm2_at && item.confirm2_by && <div className="text-[10px] text-violet-600 font-semibold">{item.confirm2_by}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-black text-slate-700 tabular-nums">{item.qty_to_pick}</div>
                <div className="text-[10px] text-slate-400">{item.unit || 'pcs'}</div>
              </div>
            </div>
          ))}
        </div>

        {status === 'Checking' && !isPicker && (
          <div className="mt-3">
            {allPicked2 ? (
              <button onClick={() => updateStatus('Photo Pending')} disabled={saving} className="w-full h-11 rounded-xl bg-amber-400 text-white font-bold text-sm cursor-pointer active:bg-amber-500 disabled:opacity-60">
                All Verified — Back to Picker for Photo
              </button>
            ) : (
              <div className="text-center text-xs text-slate-400 py-1">{items.filter((i) => i.confirm2_at).length} / {items.length} verified</div>
            )}
          </div>
        )}
      </StepCard>

      {/* ── Step 3: Photo proof ── */}
      <StepCard
        number={3}
        title="Photo proof"
        state={stepState(s3Done, status === 'Photo Pending' && isPicker, status === 'Photo Pending' && !isPicker)}
        by={s3Done ? pl.picker_name : null}
        at={null}
      >
        {pl.photo_url && (
          <a href={pl.photo_url} target="_blank" rel="noopener noreferrer">
            <img src={pl.photo_url} alt="Photo proof" className="w-full rounded-xl border border-slate-200 mb-3 cursor-zoom-in" />
          </a>
        )}
        {status === 'Photo Pending' && isPicker && (
          <>
            {photoError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-red-600 text-xs font-semibold mb-2">{photoError}</div>}
            <button
              onClick={() => { setPhotoError(null); photoInputRef.current.click(); }}
              disabled={saving}
              className="w-full h-11 rounded-xl bg-amber-400 text-white font-bold text-sm cursor-pointer active:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              {saving ? 'Uploading…' : 'Open Camera'}
            </button>
          </>
        )}
        {status === 'Photo Pending' && !isPicker && (
          <div className="text-xs text-slate-400 py-1 text-center">Waiting for {pl.picker_name} to take photo</div>
        )}
      </StepCard>

      {/* ── Step 4: Admin approval ── */}
      <StepCard
        number={4}
        title="Admin approval"
        state={stepState(s4Done, status === 'Admin Review', !pl.photo_url)}
        by={s4Done ? pl.photo_approved_by : null}
        at={pl.photo_approved_at}
      >
        <div className="flex items-center gap-2 text-orange-600 text-xs font-semibold py-1">
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          Photo submitted — waiting for admin review in Hive
        </div>
      </StepCard>

      {/* ── Step 5: Customer signature ── */}
      <StepCard
        number={5}
        title="Customer signature"
        state={stepState(s5Done, status === 'Awaiting Signature' && isPicker, status === 'Awaiting Signature' && !isPicker)}
        by={pl.signature_name}
        at={pl.signed_at}
      >
        {pl.signature_data && (
          <img src={pl.signature_data} alt="Signature" className="h-16 border border-slate-200 rounded-xl bg-white mb-3" />
        )}
        {status === 'Awaiting Signature' && isPicker && (
          <button onClick={() => setShowSignature(true)} disabled={saving} className="w-full h-11 rounded-xl bg-pink-500 text-white font-bold text-sm cursor-pointer active:bg-pink-600 disabled:opacity-60">
            Get Customer Signature
          </button>
        )}
        {status === 'Awaiting Signature' && !isPicker && (
          <div className="text-xs text-slate-400 py-1 text-center">Waiting for {pl.picker_name} to collect signature</div>
        )}
      </StepCard>

      {/* ── Completed ── */}
      {status === 'Completed' && (
        <div className="rounded-2xl bg-emerald-500 p-5 text-center text-white">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div className="font-black text-base mb-0.5">Pick List Complete</div>
          <div className="text-emerald-100 text-xs mb-4">Stock deducted automatically</div>
          <button
            onClick={async () => {
              setGeneratingPdf(true);
              try { await exportPickList(mv, items, pl.signature_data, pl.signature_name); } catch {}
              setGeneratingPdf(false);
            }}
            disabled={generatingPdf}
            className="w-full h-10 rounded-xl bg-white/20 text-white font-bold text-sm cursor-pointer active:bg-white/30 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {generatingPdf ? 'Generating…' : 'Download Signed PDF'}
          </button>
        </div>
      )}
    </div>
  );
}

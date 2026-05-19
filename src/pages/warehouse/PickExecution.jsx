import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

// ── Signature canvas ──────────────────────────────────────────────────────────
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [name, setName] = useState('');

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e, canvasRef.current);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e3a8a';
    const { x, y } = getPos(e, canvasRef.current);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function end(e) {
    e.preventDefault();
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  function save() {
    onSave(canvasRef.current.toDataURL('image/png'), name);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Customer Signature</h3>
          <p className="text-xs text-slate-500">Sign in the box below</p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 py-4 gap-4">
        <input
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 font-semibold text-sm focus:outline-none focus:border-blue-400"
          placeholder="Customer full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex-1 relative border-2 border-slate-300 rounded-2xl bg-slate-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={window.innerWidth - 40}
            height={300}
            className="touch-none w-full h-full"
            onMouseDown={start} onMouseMove={move} onMouseUp={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
            <div className="w-32 border-b border-dashed border-slate-300" />
          </div>
          {!hasStrokes && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-slate-300 text-sm font-medium">Sign here</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={clear} className="h-12 rounded-xl bg-slate-100 text-slate-600 font-bold cursor-pointer active:bg-slate-200">
            Clear
          </button>
          <button
            onClick={save}
            disabled={!hasStrokes || !name.trim()}
            className="h-12 rounded-xl bg-blue-600 text-white font-bold cursor-pointer disabled:opacity-50 active:bg-blue-700"
          >
            Confirm Signature
          </button>
        </div>
      </div>
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
  const photoInputRef = useRef(null);

  useEffect(() => {
    fetchData();

    // Realtime: auto-advance when admin changes status (e.g. approves photo)
    const channel = supabase
      .channel(`pick_list_exec_${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'pick_lists',
        filter: `id=eq.${id}`,
      }, (payload) => {
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

  async function updateStatus(status) {
    setSaving(true);
    await supabase.from('pick_lists').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setPl((p) => ({ ...p, status }));
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
    const { data: uploaded, error: uploadErr } = await supabase.storage
      .from('pick-photos')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });

    if (uploadErr) {
      setPhotoError(`Upload failed: ${uploadErr.message}`);
      setSaving(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('pick-photos').getPublicUrl(uploaded.path);
    const { error: updateErr } = await supabase
      .from('pick_lists')
      .update({ photo_url: publicUrl, status: 'Admin Review', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) {
      setPhotoError(`Status update failed: ${updateErr.message}`);
      setSaving(false);
      return;
    }

    setPl((p) => ({ ...p, photo_url: publicUrl, status: 'Admin Review' }));
    setSaving(false);
  }

  async function submitSignature(dataUrl, name) {
    setSaving(true);
    setShowSignature(false);
    const now = new Date().toISOString();
    await supabase.from('pick_lists').update({
      signature_data: dataUrl,
      signature_name: name,
      signed_at: now,
      status: 'Completed',
      completed_at: now,
      updated_at: now,
    }).eq('id', id);

    // Auto-deduct stock: create Outbound records for each item
    for (const item of items) {
      if (item.stock_line_id && item.qty_to_pick > 0) {
        // Fetch the original stock line to get movement_id
        const { data: sl } = await supabase.from('stock_lines').select('movement_id, unit, nexus_job_no').eq('id', item.stock_line_id).single();
        if (sl) {
          await supabase.from('stock_lines').insert({
            movement_id: sl.movement_id,
            line_type: 'Outbound',
            sku: item.sku,
            description: item.description,
            unit: item.unit || sl.unit,
            nexus_job_no: sl.nexus_job_no || null,
            qty_out: item.qty_to_pick,
            qty_actual: 0,
            date_out: now.slice(0, 10),
            remarks: `FIGARO pick list — ${name}`,
          });
        }
      }
    }

    await supabase.from('warehouse_activity_log').insert({
      user_id: user?.id || null,
      user_name: user?.name || 'Warehouse',
      action_type: 'figaro_complete',
      record_id: id,
      record_ref: pl?.movements?.movement_no,
      details: { items: items.length, signed_by: name },
    });

    await fetchData();
    setSaving(false);
  }

  if (loading || !pl) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  const { status, movements: mv } = pl;
  const allPicked1 = items.every((i) => !!i.confirm1_at);
  const allPicked2 = items.every((i) => !!i.confirm2_at);

  // ── COMPLETED ──
  if (status === 'Completed') {
    return (
      <div className="px-4 py-10 max-w-sm mx-auto text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-1">Pick List Complete</h2>
        <p className="text-slate-500 text-sm mb-1">{mv?.company_name} · {mv?.movement_no}</p>
        <p className="text-xs text-slate-400">Stock deducted automatically (FIGARO)</p>
      </div>
    );
  }

  // ── AWAITING SIGNATURE ──
  if (status === 'Awaiting Signature') {
    return (
      <div className="px-4 py-5 max-w-sm mx-auto">
        {showSignature && <SignaturePad onSave={submitSignature} onCancel={() => setShowSignature(false)} />}
        <div className="mb-5">
          <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
          <div className="text-slate-500 text-sm">{mv?.company_name}</div>
        </div>
        <div className="bg-pink-50 border-2 border-pink-200 rounded-2xl p-5 text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </div>
          <h3 className="font-bold text-pink-800 text-base mb-1">Customer Signature Required</h3>
          <p className="text-pink-600 text-xs">Hand the tablet to the customer to sign</p>
        </div>
        <button
          onClick={() => setShowSignature(true)}
          disabled={saving}
          className="w-full h-14 rounded-2xl bg-pink-500 text-white font-bold text-lg cursor-pointer active:bg-pink-600 disabled:opacity-60"
        >
          Open Signature Pad
        </button>
      </div>
    );
  }

  // ── ADMIN REVIEW (waiting for photo approval) ──
  if (status === 'Admin Review') {
    return (
      <div className="px-4 py-5 max-w-sm mx-auto text-center">
        <div className="mb-5">
          <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
          <div className="text-slate-500 text-sm">{mv?.company_name}</div>
        </div>
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6 mb-4">
          <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3 className="font-bold text-orange-800 text-base mb-1">Waiting for Admin</h3>
          <p className="text-orange-600 text-xs mb-3">Photo submitted. Admin must approve before customer can sign.</p>
          <div className="flex items-center justify-center gap-1.5 text-orange-500 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            Listening for approval…
          </div>
        </div>
        {pl.photo_url && (
          <img src={pl.photo_url} alt="Submitted photo" className="w-full rounded-2xl border border-slate-200 mb-4" />
        )}
        <button onClick={fetchData} className="w-full py-2 text-xs font-semibold text-slate-400 cursor-pointer">
          Tap to refresh manually
        </button>
      </div>
    );
  }

  // ── PHOTO PENDING ──
  if (status === 'Photo Pending') {
    return (
      <div className="px-4 py-5 max-w-sm mx-auto">
        <div className="mb-5">
          <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
          <div className="text-slate-500 text-sm">{mv?.company_name}</div>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <h3 className="font-bold text-amber-800 text-base mb-1">Take Photo Proof</h3>
          <p className="text-amber-600 text-xs">Photograph the picked items clearly</p>
        </div>

        {photoError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-xs font-semibold mb-2">
            {photoError}
          </div>
        )}

        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        <button
          onClick={() => { setPhotoError(null); photoInputRef.current.click(); }}
          disabled={saving}
          className="w-full h-14 rounded-2xl bg-amber-400 text-white font-bold text-lg cursor-pointer active:bg-amber-500 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          {saving ? 'Uploading…' : 'Open Camera'}
        </button>
      </div>
    );
  }

  // ── PICKING (Staff 1) ──
  if (status === 'Pending' || status === 'Picking') {
    const isPicking = status === 'Picking';

    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="mb-4">
          <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
          <div className="text-slate-500 text-sm mb-1">{mv?.company_name}</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-[11px] font-bold">
            <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-black">1</span>
            Staff 1 — Picking
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${item.confirm1_at ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
            >
              <button
                onClick={() => !item.confirm1_at && confirmItem(item.id, 1)}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${item.confirm1_at ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white active:border-emerald-400'}`}
              >
                {item.confirm1_at && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm ${item.confirm1_at ? 'text-emerald-800 line-through opacity-60' : 'text-slate-800'}`}>{item.description}</div>
                {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-black text-slate-700 tabular-nums">{item.qty_to_pick}</div>
                <div className="text-[10px] text-slate-400">{item.unit || 'pcs'}</div>
              </div>
            </div>
          ))}
        </div>

        {!isPicking && (
          <button
            onClick={() => updateStatus('Picking')}
            className="w-full h-13 py-3 rounded-2xl bg-blue-600 text-white font-bold text-base cursor-pointer active:bg-blue-700"
          >
            Start Picking
          </button>
        )}

        {isPicking && allPicked1 && (
          <button
            onClick={() => updateStatus('Checking')}
            disabled={saving}
            className="w-full h-13 py-3 rounded-2xl bg-violet-500 text-white font-bold text-base cursor-pointer active:bg-violet-600 disabled:opacity-60"
          >
            All Picked — Hand to Staff 2
          </button>
        )}

        {isPicking && !allPicked1 && (
          <div className="text-center text-xs text-slate-400 py-2">
            {items.filter((i) => i.confirm1_at).length} / {items.length} items ticked
          </div>
        )}
      </div>
    );
  }

  // ── CHECKING (Staff 2) ──
  if (status === 'Checking') {
    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="mb-4">
          <div className="font-mono font-bold text-slate-800 text-lg">{mv?.movement_no}</div>
          <div className="text-slate-500 text-sm mb-1">{mv?.company_name}</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full text-[11px] font-bold">
            <span className="w-4 h-4 rounded-full bg-violet-500 text-white flex items-center justify-center text-[9px] font-black">2</span>
            Staff 2 — Counter-check
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${item.confirm2_at ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-white'}`}
            >
              <button
                onClick={() => !item.confirm2_at && confirmItem(item.id, 2)}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all ${item.confirm2_at ? 'border-violet-500 bg-violet-500' : 'border-slate-300 bg-white active:border-violet-400'}`}
              >
                {item.confirm2_at && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm ${item.confirm2_at ? 'text-violet-800 line-through opacity-60' : 'text-slate-800'}`}>{item.description}</div>
                {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
                {item.confirm1_by && <div className="text-[10px] text-slate-400">Picked by {item.confirm1_by}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-black text-slate-700 tabular-nums">{item.qty_to_pick}</div>
                <div className="text-[10px] text-slate-400">{item.unit || 'pcs'}</div>
              </div>
            </div>
          ))}
        </div>

        {allPicked2 ? (
          <button
            onClick={() => updateStatus('Photo Pending')}
            disabled={saving}
            className="w-full h-13 py-3 rounded-2xl bg-amber-400 text-white font-bold text-base cursor-pointer active:bg-amber-500 disabled:opacity-60"
          >
            All Verified — Take Photo
          </button>
        ) : (
          <div className="text-center text-xs text-slate-400 py-2">
            {items.filter((i) => i.confirm2_at).length} / {items.length} items verified
          </div>
        )}
      </div>
    );
  }

  return null;
}

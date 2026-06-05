import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { extractPackingList, matchItemsToLines } from '../../services/extractionService';

function StepCard({ number, title, state, by, at, children }) {
  const colors = {
    done:    'border-emerald-200 bg-emerald-50',
    active:  'border-violet-300 bg-violet-50/40',
    waiting: 'border-slate-200 bg-white',
    locked:  'border-slate-200 bg-slate-50/60',
  };
  const numColors = {
    done:    'bg-emerald-500 text-white',
    active:  'bg-violet-600 text-white',
    waiting: 'bg-slate-200 text-slate-400',
    locked:  'bg-slate-200 text-slate-400',
  };
  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${colors[state]}`}>
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
          {(state === 'waiting' || state === 'locked') && <div className="text-[10px] text-slate-400 mt-0.5">Complete previous step first</div>}
        </div>
        {state === 'active' && <span className="shrink-0 w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
      </div>
      {(state === 'active' || state === 'done') && children && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

function FactorPip({ n, done, name, at }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        {done
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </div>
      {done && name ? (
        <span className="text-[9px] font-bold text-emerald-600 text-center max-w-[60px] truncate">{name}</span>
      ) : (
        <span className="text-[9px] font-bold uppercase tracking-wide">
          {n === 1 ? 'Ground' : n === 2 ? 'Admin' : 'Client'}
        </span>
      )}
    </div>
  );
}

export default function ReceiveDelivery() {
  const { log } = useWarehouseLog();
  const { user } = useWarehouseAuth();
  const navigate = useNavigate();

  const [movements, setMovements] = useState([]);
  const [confsByMovId, setConfsByMovId] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail view
  const [selected, setSelected] = useState(null);
  const [conf, setConf] = useState(null);
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingF1, setConfirmingF1] = useState(false);
  const [received, setReceived] = useState(false);

  // AI extraction
  const [extracting, setExtracting] = useState(false);
  const [extractStage, setExtractStage] = useState('');
  const [extractResult, setExtractResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('receive_delivery_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_confirmations' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);
    const [mvRes, confRes] = await Promise.all([
      supabase.from('movements')
        .select('id, movement_no, company_name, status, type, reference_number, notes, date_in, created_at')
        .eq('type', 'Inbound')
        .in('status', ['New', 'In Progress'])
        .order('created_at', { ascending: false }),
      supabase.from('delivery_confirmations').select('*'),
    ]);
    setMovements(mvRes.data || []);
    const byMovId = {};
    (confRes.data || []).forEach((c) => { byMovId[c.movement_id] = c; });
    setConfsByMovId(byMovId);
    setLoading(false);
    setRefreshing(false);
  }

  async function selectMovement(mv) {
    setSelected(mv);
    setReceived(mv.status === 'In Progress');
    setDetailLoading(true);
    setConf(null);
    setLines([]);
    setExtractResult(null);

    const [linesRes, confRes] = await Promise.all([
      // No line_type filter — get all lines on this movement
      supabase.from('stock_lines').select('*').eq('movement_id', mv.id).order('sort_order').order('created_at'),
      supabase.from('delivery_confirmations').select('*').eq('movement_id', mv.id).maybeSingle(),
    ]);

    const linesData = linesRes.data || [];
    setLines(linesData);
    setConf(confRes.data || null);
    const init = {};
    linesData.forEach((l) => { init[l.id] = String(l.qty_actual ?? ''); });
    setDrafts(init);
    setDetailLoading(false);
  }

  // Step 1: save quantities + mark In Progress (no F1 here)
  async function confirmReceipt() {
    setSaving(true);
    for (const line of lines) {
      const qty = parseFloat(drafts[line.id]) || 0;
      await supabase.from('stock_lines')
        .update({ qty_actual: qty, date_in: new Date().toISOString().slice(0, 10) })
        .eq('id', line.id);
      await log('receive_delivery', line.id, selected.movement_no, {
        sku: line.sku, description: line.description, qty_confirmed: qty,
      });
    }
    await supabase.from('movements').update({ status: 'In Progress' }).eq('id', selected.id);
    setSelected((p) => ({ ...p, status: 'In Progress' }));
    setReceived(true);
    setSaving(false);
  }

  // Step 2 — F1: ground staff explicitly confirms delivery is correct
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

  async function handleFileExtract(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setExtracting(true);
    setExtractResult(null);
    try {
      const data = await extractPackingList(file, setExtractStage);
      const updates = matchItemsToLines(data.items, lines);
      const matchedCount = Object.keys(updates).length;
      setDrafts((prev) => ({ ...prev, ...updates }));
      setExtractResult({ matched: matchedCount, total: (data.items || []).length });
    } catch (err) {
      setExtractResult({ error: err.message });
    } finally {
      setExtracting(false);
      setExtractStage('');
    }
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    const f1Done = !!conf?.factor1_confirmed_at;
    const f2Done = !!conf?.factor2_confirmed_at;
    const f3Done = !!conf?.factor3_confirmed_at;
    const allConfirmed = f1Done && f2Done && f3Done;

    // Step 2 state
    const step2State = allConfirmed ? 'done'
      : received ? 'active'
      : 'locked';

    return (
      <div className="px-4 py-5 max-w-lg mx-auto space-y-3 pb-10">
        {/* Header */}
        <div className="mb-1">
          <button
            onClick={() => { setSelected(null); setLines([]); setConf(null); }}
            className="text-blue-600 text-sm font-semibold flex items-center gap-1 mb-3 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{selected.movement_no}</h2>
              {selected.company_name && <p className="text-slate-500 text-sm">{selected.company_name}</p>}
              {selected.reference_number && (
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">Ref: {selected.reference_number}</p>
              )}
              {selected.date_in && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Expected: {new Date(selected.date_in).toLocaleDateString('en-GB')}
                </p>
              )}
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${
              received ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
            }`}>{received ? 'Received' : selected.status}</span>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <div className="animate-spin w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full" />
            Loading…
          </div>
        ) : (
          <>
            {/* ── Step 1: Receive & Count ── */}
            <StepCard number={1} title="Receive & Count" state={received ? 'done' : 'active'}>
              {!received ? (
                <>
                  {/* AI packing list pre-fill */}
                  <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileExtract} />
                  {lines.length > 0 && (
                    <div className="mb-3">
                      {extracting ? (
                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold">
                          <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin shrink-0" />
                          {extractStage || 'Scanning…'}
                        </div>
                      ) : extractResult?.error ? (
                        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                          <span className="text-red-600 text-xs font-semibold">{extractResult.error}</span>
                          <button onClick={() => setExtractResult(null)} className="text-red-400 text-xs underline cursor-pointer">Dismiss</button>
                        </div>
                      ) : extractResult ? (
                        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                          <span className="text-emerald-700 text-xs font-semibold">
                            {extractResult.matched > 0
                              ? `${extractResult.matched} of ${extractResult.total} items pre-filled`
                              : `${extractResult.total} item(s) found — no lines matched by name`}
                          </span>
                          <button onClick={() => setExtractResult(null)} className="text-emerald-500 text-xs underline cursor-pointer">Dismiss</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-xs font-semibold hover:border-violet-300 hover:text-violet-600 active:bg-violet-50 cursor-pointer transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          Scan Packing List — AI Pre-fill Quantities
                        </button>
                      )}
                    </div>
                  )}

                  {lines.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-slate-400 text-sm mb-1">No stock lines on this movement yet.</p>
                      <p className="text-slate-300 text-xs">Admin needs to add expected items in Hive first.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {lines.map((line) => (
                        <div key={line.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                          <div className="mb-2">
                            <div className="font-bold text-slate-800 text-sm leading-snug">{line.description || '—'}</div>
                            {line.sku && <div className="text-[10px] font-mono text-slate-400 mt-0.5">{line.sku}</div>}
                            {line.line_type && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700">
                                {line.line_type}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                                Qty Received ({line.unit || 'pcs'})
                                {line.qty_ordered && (
                                  <span className="ml-1 text-slate-300">· expected {line.qty_ordered}</span>
                                )}
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-lg font-bold focus:outline-none focus:border-violet-400 text-center"
                                value={drafts[line.id] || ''}
                                onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: e.target.value }))}
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {lines.length > 0 && (
                    <button
                      onClick={confirmReceipt}
                      disabled={saving}
                      className="w-full h-12 rounded-xl bg-violet-600 text-white font-bold text-sm cursor-pointer active:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving ? 'Saving…' : 'Save Quantities'}
                    </button>
                  )}
                </>
              ) : (
                <div className="space-y-1.5">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between py-1">
                      <div className="min-w-0 mr-3">
                        <span className="text-sm font-semibold text-slate-700">{line.description || '—'}</span>
                        {line.sku && <span className="text-[10px] font-mono text-slate-400 ml-2">{line.sku}</span>}
                      </div>
                      <span className="font-black text-emerald-700 tabular-nums shrink-0">
                        {drafts[line.id] || line.qty_actual || 0} <span className="font-normal text-xs text-slate-400">{line.unit || 'pcs'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </StepCard>

            {/* ── Step 2: Inbound Confirmation ── */}
            <StepCard
              number={2}
              title="Inbound Confirmation"
              state={step2State}
              by={allConfirmed ? conf?.factor3_scanned_by_name : null}
              at={allConfirmed ? conf?.factor3_confirmed_at : null}
            >
              {/* Factor progress row */}
              <div className="flex items-center justify-around py-2 mb-4">
                <FactorPip n={1} done={f1Done} name={conf?.factor1_user_name} at={conf?.factor1_confirmed_at} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={2} done={f2Done} name={conf?.factor2_user_name} at={conf?.factor2_confirmed_at} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={3} done={f3Done} name={conf?.factor3_scanned_by_name} at={conf?.factor3_confirmed_at} />
              </div>

              {/* F1 — ground staff sign-off */}
              {!f1Done ? (
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 mb-3">
                  <div className="font-bold text-slate-800 text-sm mb-1">Your sign-off required</div>
                  <p className="text-slate-500 text-xs mb-3 leading-relaxed">
                    Count the items and verify the delivery matches what's expected. Once satisfied, confirm below.
                  </p>
                  <button
                    onClick={confirmFactor1}
                    disabled={confirmingF1}
                    className="w-full h-11 rounded-xl bg-violet-600 text-white font-bold text-sm cursor-pointer active:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {confirmingF1 ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Delivery Correct — Sign Off (F1)</>
                    )}
                  </button>
                </div>
              ) : !f2Done ? (
                /* F1 done, waiting for admin F2 */
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <div>
                    <div className="text-amber-700 text-xs font-bold">Waiting for Admin approval (F2)</div>
                    <div className="text-amber-500 text-[10px] mt-0.5">Admin reviews and approves in Hive</div>
                  </div>
                </div>
              ) : !f3Done ? (
                /* F2 done, waiting for client QR */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Admin approved · F2 by {conf.factor2_user_name}
                  </div>
                  <button
                    onClick={() => navigate('/warehouse/scan-qr')}
                    className="w-full h-11 rounded-xl bg-indigo-600 text-white font-bold text-sm cursor-pointer active:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                      <line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
                    </svg>
                    Scan Client QR — Complete F3
                  </button>
                </div>
              ) : (
                /* All done */
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  All 3 factors confirmed — receipt locked
                </div>
              )}

              {/* Timestamps summary */}
              {(f1Done || f2Done) && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {f1Done && <div className="text-[10px] text-slate-400">F1: <span className="font-semibold text-slate-500">{conf.factor1_user_name}</span> · {new Date(conf.factor1_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f2Done && <div className="text-[10px] text-slate-400">F2: <span className="font-semibold text-slate-500">{conf.factor2_user_name}</span> · {new Date(conf.factor2_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f3Done && <div className="text-[10px] text-slate-400">F3: <span className="font-semibold text-slate-500">{conf.factor3_scanned_by_name}</span> · {new Date(conf.factor3_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
              )}

              {!conf && (
                <div className="text-xs text-slate-400 mt-1">
                  No confirmation record yet. It will appear here once you sign off above, or admin initiates it from Hive.
                </div>
              )}
            </StepCard>
          </>
        )}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Receive Delivery</h2>
          <p className="text-slate-500 text-xs mt-0.5">Select an inbound movement to receive</p>
        </div>
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

      {movements.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No pending inbound movements.</div>
      ) : (
        <div className="space-y-2">
          {movements.map((mv) => {
            const c = confsByMovId[mv.id];
            const f1 = !!c?.factor1_confirmed_at;
            const f2 = !!c?.factor2_confirmed_at;
            const f3 = !!c?.factor3_confirmed_at;
            const allDone = f1 && f2 && f3;
            const qrPending = f2 && !f3;
            return (
              <button
                key={mv.id}
                onClick={() => selectMovement(mv)}
                className={`w-full rounded-2xl border-2 p-4 shadow-sm flex items-center justify-between active:scale-[0.98] cursor-pointer text-left transition-all ${
                  qrPending ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800">{mv.movement_no}</div>
                  {mv.company_name && <div className="text-slate-500 text-sm">{mv.company_name}</div>}
                  {mv.reference_number && <div className="text-[10px] font-mono text-slate-400 mt-0.5">{mv.reference_number}</div>}
                  {c && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {[{ n: 1, done: f1 }, { n: 2, done: f2 }, { n: 3, done: f3 }].map(({ n, done }) => (
                        <div key={n} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                          {done ? '✓' : n}
                        </div>
                      ))}
                      <span className={`text-[10px] font-bold ml-1 ${allDone ? 'text-emerald-600' : qrPending ? 'text-amber-600' : 'text-slate-400'}`}>
                        {allDone ? 'All confirmed' : qrPending ? 'QR Sent — await client' : !f1 ? 'Awaiting ground sign-off' : 'Awaiting admin'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    mv.status === 'In Progress' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
                  }`}>{mv.status}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

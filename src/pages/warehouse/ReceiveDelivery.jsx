import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';

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
          {state === 'waiting' && <div className="text-[10px] text-slate-400 mt-0.5">Complete previous step first</div>}
        </div>
        {state === 'active' && <span className="shrink-0 w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
      </div>
      {(state === 'active' || state === 'done') && children && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

function FactorPip({ n, done, label }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        {done
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </div>
      <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function ReceiveDelivery() {
  const { log } = useWarehouseLog();
  const navigate = useNavigate();

  const [movements, setMovements] = useState([]);
  const [confsByMovId, setConfsByMovId] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail view
  const [selected, setSelected] = useState(null);   // movement object
  const [conf, setConf] = useState(null);            // delivery_confirmations record
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [received, setReceived] = useState(false);  // step 1 done flag (local)

  useEffect(() => {
    load();

    const channel = supabase
      .channel('receive_delivery_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_confirmations' }, () => {
        load(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);

    const [mvRes, confRes] = await Promise.all([
      supabase.from('movements').select('id, movement_no, company_name, status, type')
        .in('type', ['Inbound']).in('status', ['New', 'In Progress'])
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

    const [linesRes, confRes] = await Promise.all([
      supabase.from('stock_lines').select('*').eq('movement_id', mv.id)
        .in('line_type', ['Inbound', 'Replenishment']).order('created_at'),
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

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    const hasConf = !!conf;
    const f1Done = !!conf?.factor1_confirmed_at;
    const f2Done = !!conf?.factor2_confirmed_at;
    const f3Done = !!conf?.factor3_confirmed_at;
    const allConfirmed = f1Done && f2Done && f3Done;
    const qrPending = f2Done && !f3Done;

    return (
      <div className="px-4 py-5 max-w-lg mx-auto space-y-3 pb-10">
        {/* Back + header */}
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
            <StepCard
              number={1}
              title="Receive & Count"
              state={received ? 'done' : 'active'}
              by={received ? 'Confirmed' : null}
              at={null}
            >
              {!received ? (
                <>
                  {lines.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-4">No inbound stock lines on this movement.</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {lines.map((line) => (
                        <div key={line.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{line.description || '—'}</div>
                              {line.sku && <div className="text-[10px] font-mono text-slate-400">{line.sku}</div>}
                              <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                line.line_type === 'Replenishment' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                              }`}>{line.line_type}</span>
                            </div>
                          </div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">Qty Received ({line.unit || 'pcs'})</label>
                          <input
                            type="number"
                            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-lg font-bold focus:outline-none focus:border-violet-400 text-center"
                            value={drafts[line.id] || ''}
                            onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: e.target.value }))}
                            placeholder="0"
                            inputMode="numeric"
                          />
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
                      {saving ? 'Saving…' : 'Confirm Receipt'}
                    </button>
                  )}
                </>
              ) : (
                /* Done summary */
                <div className="space-y-1.5">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between py-1">
                      <div>
                        <span className="text-sm font-semibold text-slate-700">{line.description || '—'}</span>
                        {line.sku && <span className="text-[10px] font-mono text-slate-400 ml-2">{line.sku}</span>}
                      </div>
                      <span className="font-black text-emerald-700 tabular-nums">
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
              state={
                allConfirmed ? 'done' :
                hasConf && received ? 'active' :
                'waiting'
              }
              by={allConfirmed ? conf?.factor3_scanned_by_name : null}
              at={allConfirmed ? conf?.factor3_confirmed_at : null}
            >
              {hasConf ? (
                <div className="space-y-4">
                  {/* Factor pips */}
                  <div className="flex items-center justify-around py-2">
                    <FactorPip n={1} done={f1Done} label="Ground Staff" />
                    <div className="text-slate-200 text-lg">→</div>
                    <FactorPip n={2} done={f2Done} label="Admin" />
                    <div className="text-slate-200 text-lg">→</div>
                    <FactorPip n={3} done={f3Done} label="Client QR" />
                  </div>

                  {/* Confirmation details */}
                  {f1Done && (
                    <div className="text-[10px] text-emerald-600 font-semibold">
                      F1: {conf.factor1_user_name} · {conf.factor1_confirmed_at && new Date(conf.factor1_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {f2Done && (
                    <div className="text-[10px] text-emerald-600 font-semibold">
                      F2: {conf.factor2_user_name} · {conf.factor2_confirmed_at && new Date(conf.factor2_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}

                  {/* Scan QR CTA */}
                  {qrPending && (
                    <button
                      onClick={() => navigate('/warehouse/scan-qr')}
                      className="w-full h-12 rounded-xl bg-indigo-600 text-white font-bold text-sm cursor-pointer active:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                        <line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
                      </svg>
                      Scan Client QR — Complete Factor 3
                    </button>
                  )}

                  {!f2Done && (
                    <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      Waiting for admin to approve in Hive
                    </div>
                  )}

                  {allConfirmed && (
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      All 3 factors confirmed — receipt locked
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 py-1">
                  No inbound confirmation initiated for this movement yet. Admin can start it from Hive.
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
          <p className="text-slate-500 text-xs mt-0.5">Select an inbound movement</p>
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
            const hasActiveQR = c && c.factor2_confirmed_at && !c.factor3_confirmed_at;
            const allDone = c && c.factor1_confirmed_at && c.factor2_confirmed_at && c.factor3_confirmed_at;
            return (
              <button
                key={mv.id}
                onClick={() => selectMovement(mv)}
                className={`w-full rounded-2xl border-2 p-4 shadow-sm flex items-center justify-between active:scale-[0.98] cursor-pointer text-left transition-all ${
                  hasActiveQR ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800">{mv.movement_no}</div>
                  {mv.company_name && <div className="text-slate-500 text-sm">{mv.company_name}</div>}
                  {c && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {[
                        { n: 1, done: !!c.factor1_confirmed_at },
                        { n: 2, done: !!c.factor2_confirmed_at },
                        { n: 3, done: !!c.factor3_confirmed_at },
                      ].map(({ n, done }) => (
                        <div key={n} className={`flex items-center gap-0.5 text-[10px] font-bold ${done ? 'text-emerald-600' : 'text-slate-300'}`}>
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                            {done ? '✓' : n}
                          </div>
                        </div>
                      ))}
                      <span className={`text-[10px] font-bold ml-1 ${allDone ? 'text-emerald-600' : hasActiveQR ? 'text-amber-600' : 'text-slate-400'}`}>
                        {allDone ? 'Confirmed' : hasActiveQR ? 'QR Sent' : 'Pending'}
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

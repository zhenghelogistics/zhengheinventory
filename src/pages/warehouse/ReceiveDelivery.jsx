import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';

function FactorPip({ n, done }) {
  return (
    <div className={`flex items-center gap-1 text-[10px] font-bold ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white font-black ${done ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        {done
          ? <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </div>
      F{n}
    </div>
  );
}

export default function ReceiveDelivery() {
  const { log } = useWarehouseLog();
  const navigate = useNavigate();

  // Regular receive delivery
  const [movements, setMovements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Pending 3FA arrivals
  const [pendingArrivals, setPendingArrivals] = useState([]);
  const [selectedArrival, setSelectedArrival] = useState(null);
  const [arrivalLines, setArrivalLines] = useState([]);
  const [arrivalLoading, setArrivalLoading] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [mvRes, confRes] = await Promise.all([
      supabase
        .from('movements')
        .select('id, movement_number, movement_no, company_name, status, type')
        .in('type', ['Inbound'])
        .in('status', ['New', 'In Progress'])
        .order('created_at', { ascending: false }),
      supabase
        .from('delivery_confirmations')
        .select('*, movements!inner(id, movement_no, movement_number, company_name, status, type, carrier_name, driver_name)')
        .not('factor2_confirmed_at', 'is', null)
        .is('factor3_confirmed_at', null),
    ]);
    setMovements(mvRes.data || []);
    setPendingArrivals(confRes.data || []);
    setLoading(false);
  }

  async function selectMovement(mv) {
    setSelected(mv);
    setDone(false);
    const { data } = await supabase
      .from('stock_lines')
      .select('*')
      .eq('movement_id', mv.id)
      .in('line_type', ['Inbound', 'Replenishment'])
      .order('created_at');
    setLines(data || []);
    const init = {};
    (data || []).forEach((l) => { init[l.id] = String(l.qty_actual ?? ''); });
    setDrafts(init);
  }

  async function selectArrival(conf) {
    setSelectedArrival(conf);
    setArrivalLoading(true);
    const { data } = await supabase
      .from('stock_lines')
      .select('*')
      .eq('movement_id', conf.movements.id)
      .in('line_type', ['Inbound', 'Replenishment'])
      .order('created_at');
    setArrivalLines(data || []);
    setArrivalLoading(false);
  }

  async function confirmAll() {
    setSaving(true);
    const mvNo = selected.movement_number || selected.movement_no;
    for (const line of lines) {
      const qty = parseFloat(drafts[line.id]) || 0;
      await supabase
        .from('stock_lines')
        .update({ qty_actual: qty, date_in: new Date().toISOString().slice(0, 10) })
        .eq('id', line.id);
      await log('receive_delivery', line.id, mvNo, {
        sku: line.sku,
        description: line.description,
        qty_confirmed: qty,
      });
    }
    await supabase
      .from('movements')
      .update({ status: 'In Progress' })
      .eq('id', selected.id);
    setSaving(false);
    setDone(true);
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>;

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/>
          </svg>
        </div>
        <p className="font-bold text-slate-800 text-lg">Delivery Confirmed</p>
        <p className="text-slate-500 text-sm mt-1">{selected.movement_number || selected.movement_no}</p>
        <div className="mt-6 w-full max-w-xs space-y-3">
          <button
            onClick={() => navigate('/warehouse/scan-qr')}
            className="w-full h-13 py-3 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 cursor-pointer active:bg-indigo-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              <line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
            </svg>
            Scan Client QR
          </button>
          <button
            onClick={() => { setSelected(null); setLines([]); setDone(false); }}
            className="w-full py-3 text-sm font-semibold text-slate-500 cursor-pointer"
          >
            Receive Another
          </button>
        </div>
      </div>
    );
  }

  // ── Pending arrival detail ────────────────────────────────────────────────
  if (selectedArrival) {
    const conf = selectedArrival;
    const mv = conf.movements;
    const mvNo = mv.movement_no || mv.movement_number;
    const carrier = mv.carrier_name || mv.driver_name || null;

    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <button
          onClick={() => { setSelectedArrival(null); setArrivalLines([]); }}
          className="text-blue-600 text-sm font-semibold flex items-center gap-1 mb-4 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

        {/* Movement header */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 mb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="font-mono font-bold text-slate-800 text-base">{mvNo}</div>
              <div className="font-semibold text-slate-700 text-sm">{mv.company_name || '—'}</div>
              {carrier && <div className="text-xs text-slate-500 mt-0.5">Driver / Carrier: {carrier}</div>}
            </div>
            <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-200 text-amber-800">
              QR Sent
            </span>
          </div>

          {/* 3FA factor status */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-amber-200">
            <FactorPip n={1} done={!!conf.factor1_confirmed_at} />
            <div className="text-slate-300 text-xs">·</div>
            <FactorPip n={2} done={!!conf.factor2_confirmed_at} />
            <div className="text-slate-300 text-xs">·</div>
            <FactorPip n={3} done={!!conf.factor3_confirmed_at} />
            <span className="ml-auto text-[10px] text-amber-700 font-semibold">
              {conf.factor3_confirmed_at ? 'All confirmed' : 'Awaiting QR scan'}
            </span>
          </div>
        </div>

        {/* Packing list */}
        <div className="mb-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Packing List — Cross-reference</div>
          {arrivalLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Loading items…</div>
          ) : arrivalLines.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No stock lines on this movement.</div>
          ) : (
            <div className="space-y-2 mb-5">
              {arrivalLines.map((line) => (
                <div key={line.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{line.description || '—'}</div>
                    {line.sku && <div className="text-[10px] font-mono text-slate-400">{line.sku}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black text-slate-700 tabular-nums">{line.qty_actual ?? '—'}</div>
                    <div className="text-[10px] text-slate-400">{line.unit || 'pcs'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scan QR button */}
        {!conf.factor3_confirmed_at ? (
          <button
            onClick={() => navigate('/warehouse/scan-qr')}
            className="w-full h-14 rounded-2xl bg-indigo-600 text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer active:bg-indigo-700"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              <line x1="14" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
            </svg>
            Scan Client QR (Factor 3)
          </button>
        ) : (
          <div className="w-full h-14 rounded-2xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            3FA Complete
          </div>
        )}
      </div>
    );
  }

  // ── Receive movement detail ───────────────────────────────────────────────
  if (selected) {
    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="mb-4">
          <button onClick={() => setSelected(null)} className="text-blue-600 text-sm font-semibold flex items-center gap-1 mb-3 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <h2 className="text-lg font-bold text-slate-800">{selected.movement_number || selected.movement_no}</h2>
          {selected.company_name && <p className="text-slate-500 text-sm">{selected.company_name}</p>}
        </div>

        {lines.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No inbound stock lines on this movement.</div>
        )}

        <div className="space-y-3 mb-6">
          {lines.map((line) => (
            <div key={line.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-slate-800">{line.description || '—'}</div>
                  {line.sku && <div className="text-xs font-mono text-slate-400">{line.sku}</div>}
                  <div className="text-xs text-slate-500 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      line.line_type === 'Replenishment' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                    }`}>{line.line_type}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Qty Received ({line.unit || 'pcs'})</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-lg font-bold focus:outline-none focus:border-violet-400 text-center"
                  value={drafts[line.id] || ''}
                  onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: e.target.value }))}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
            </div>
          ))}
        </div>

        {lines.length > 0 && (
          <button
            onClick={confirmAll}
            disabled={saving}
            className="w-full h-14 rounded-2xl bg-violet-600 text-white font-bold text-base flex items-center justify-center gap-2 active:bg-violet-700 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Confirm Delivery'}
          </button>
        )}
      </div>
    );
  }

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Receive Delivery</h2>
        <p className="text-slate-500 text-xs mt-0.5">Select the inbound movement to receive</p>
      </div>

      {/* Pending arrivals — 3FA active */}
      {pendingArrivals.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Pending Arrivals</span>
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
              {pendingArrivals.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingArrivals.map((conf) => {
              const mv = conf.movements;
              const mvNo = mv.movement_no || mv.movement_number;
              const carrier = mv.carrier_name || mv.driver_name || null;
              return (
                <button
                  key={conf.id}
                  onClick={() => selectArrival(conf)}
                  className="w-full bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center justify-between active:bg-amber-100 cursor-pointer text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800">{mvNo}</div>
                    <div className="text-slate-600 text-sm font-semibold">{mv.company_name || '—'}</div>
                    {carrier && <div className="text-xs text-slate-500 mt-0.5">{carrier}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <FactorPip n={1} done={!!conf.factor1_confirmed_at} />
                      <div className="text-slate-300 text-xs">·</div>
                      <FactorPip n={2} done={!!conf.factor2_confirmed_at} />
                      <div className="text-slate-300 text-xs">·</div>
                      <FactorPip n={3} done={!!conf.factor3_confirmed_at} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">QR Sent</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Regular inbound movements */}
      {pendingArrivals.length > 0 && movements.length > 0 && (
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">All Inbound</div>
      )}

      {movements.length === 0 && pendingArrivals.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">No pending inbound movements.</div>
      )}

      <div className="space-y-2">
        {movements.map((mv) => (
          <button
            key={mv.id}
            onClick={() => selectMovement(mv)}
            className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between active:bg-slate-50 cursor-pointer text-left"
          >
            <div>
              <div className="font-bold text-slate-800">{mv.movement_number || mv.movement_no}</div>
              {mv.company_name && <div className="text-slate-500 text-sm">{mv.company_name}</div>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{mv.status}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMovementDetail } from '../../hooks/useMovementDetail';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { supabase } from '../../lib/supabase';

async function logActivity(action_type, record_id, record_ref, details, user) {
  await supabase.from('warehouse_activity_log').insert({
    user_id: user?.id || null,
    user_name: user?.name || 'Warehouse',
    action_type,
    record_id: record_id ? String(record_id) : null,
    record_ref: record_ref || null,
    details,
  });
}

export default function ShipmentDetail() {
  const { id } = useParams();
  const { user } = useWarehouseAuth();
  const { movement, stockLines, loading, addStockLine, updateStockLine } = useMovementDetail(id);

  // stepper: { lineId, mode: '+' | '-', qty: number }
  const [stepper, setStepper] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [flashId, setFlashId] = useState(null);

  const topLines = stockLines.filter((l) => l.line_type !== 'Outbound');
  const outLines = stockLines.filter((l) => l.line_type === 'Outbound');

  function getBalance(line) {
    const key = line.sku || line.description || String(line.id);
    const dispatched = outLines
      .filter((o) => (o.sku || o.description || String(o.id)) === key)
      .reduce((s, o) => s + (Number(o.qty_out) || 0), 0);
    return (Number(line.qty_actual) || 0) - dispatched;
  }

  async function confirmStepper() {
    if (!stepper || stepper.qty === 0 || confirming) return;
    const line = topLines.find((l) => l.id === stepper.lineId);
    if (!line) return;

    setConfirming(true);
    if (stepper.mode === '+') {
      const newQty = (Number(line.qty_actual) || 0) + stepper.qty;
      await updateStockLine(line.id, { qty_actual: newQty });
      await logActivity('hive_add_stock', line.id, movement.movement_no, {
        sku: line.sku, description: line.description,
        added: stepper.qty,
        qty_before: Number(line.qty_actual) || 0,
        qty_after: newQty,
      }, user);
    } else {
      const outbound = await addStockLine({
        line_type: 'Outbound',
        sku: line.sku,
        description: line.description,
        unit: line.unit,
        nexus_job_no: line.nexus_job_no || null,
        qty_out: stepper.qty,
        qty_actual: 0,
        date_out: new Date().toISOString().slice(0, 10),
      });
      if (outbound) {
        await logActivity('hive_dispatch_stock', line.id, movement.movement_no, {
          sku: line.sku, description: line.description,
          dispatched: stepper.qty,
        }, user);
      }
    }

    setFlashId(line.id);
    setTimeout(() => setFlashId(null), 1500);
    setConfirming(false);
    setStepper(null);
  }

  if (loading || !movement) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  if (topLines.length === 0) return (
    <div className="text-center py-20 text-slate-400 text-sm">No stock lines on this shipment</div>
  );

  const activeLine = stepper ? topLines.find((l) => l.id === stepper.lineId) : null;
  const currentBal = activeLine ? getBalance(activeLine) : 0;
  const afterBal = stepper
    ? stepper.mode === '+' ? currentBal + stepper.qty : currentBal - stepper.qty
    : 0;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="font-mono font-bold text-slate-800 text-xl">{movement.movement_no}</div>
        <div className="text-slate-500 text-sm">{movement.company_name || 'No company'}</div>
      </div>

      {/* Stock line cards */}
      <div className="space-y-3">
        {topLines.map((line) => {
          const bal = getBalance(line);
          const isFlash = flashId === line.id;
          return (
            <div
              key={line.id}
              className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all duration-300 ${isFlash ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200'}`}
            >
              <div className="font-bold text-slate-800 text-base leading-snug">{line.description || '—'}</div>
              {line.sku && <div className="text-xs font-mono text-slate-400 mt-0.5 mb-3">{line.sku}</div>}

              {/* Qty display */}
              <div className="flex items-end gap-6 mb-4">
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Received</div>
                  <div className="text-4xl font-black text-violet-600 tabular-nums leading-none">{Number(line.qty_actual) || 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{line.unit || 'pcs'}</div>
                </div>
                <div className="text-slate-200 text-3xl font-light mb-1">|</div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Balance</div>
                  <div className={`text-4xl font-black tabular-nums leading-none ${bal > 0 ? 'text-emerald-600' : bal === 0 ? 'text-slate-300' : 'text-red-500'}`}>{bal}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{line.unit || 'pcs'}</div>
                </div>
              </div>

              {/* Add / Deduct buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStepper({ lineId: line.id, mode: '+', qty: 1 })}
                  className="h-13 py-3 rounded-xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2 active:bg-emerald-600 cursor-pointer transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add
                </button>
                <button
                  onClick={() => setStepper({ lineId: line.id, mode: '-', qty: 1 })}
                  className="h-13 py-3 rounded-xl bg-red-500 text-white font-bold text-base flex items-center justify-center gap-2 active:bg-red-600 cursor-pointer transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Deduct
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stepper bottom sheet */}
      {stepper && activeLine && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => !confirming && setStepper(null)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-8 shadow-2xl">
            {/* Handle bar */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

            {/* Mode + item */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${stepper.mode === '+' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  {stepper.mode === '+' ? (
                    <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>
                  ) : (
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  )}
                </svg>
              </div>
              <div>
                <div className={`font-bold text-base ${stepper.mode === '+' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {stepper.mode === '+' ? 'Add Stock' : 'Deduct Stock'}
                </div>
                <div className="text-xs text-slate-500 truncate max-w-[240px]">{activeLine.description}</div>
              </div>
            </div>

            {/* Big stepper */}
            <div className="flex items-center justify-center gap-6 mb-5">
              <button
                onClick={() => setStepper((s) => ({ ...s, qty: Math.max(0, s.qty - 1) }))}
                className="w-16 h-16 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-3xl font-bold active:bg-slate-200 cursor-pointer select-none"
              >−</button>
              <div className="text-7xl font-black tabular-nums text-slate-800 min-w-[5rem] text-center leading-none">{stepper.qty}</div>
              <button
                onClick={() => setStepper((s) => ({ ...s, qty: s.qty + 1 }))}
                className="w-16 h-16 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-3xl font-bold active:bg-slate-200 cursor-pointer select-none"
              >+</button>
            </div>

            {/* Quick add chips */}
            <div className="flex gap-2 justify-center mb-6">
              {[5, 10, 20, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setStepper((s) => ({ ...s, qty: s.qty + n }))}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold active:bg-slate-200 cursor-pointer select-none"
                >+{n}</button>
              ))}
            </div>

            {/* Balance preview */}
            <div className="flex items-center justify-center gap-4 mb-6 bg-slate-50 rounded-2xl py-3 px-4">
              <div className="text-center">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Now</div>
                <div className="text-2xl font-black text-slate-700 tabular-nums">{currentBal}</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
              <div className="text-center">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">After</div>
                <div className={`text-2xl font-black tabular-nums ${afterBal > currentBal ? 'text-emerald-600' : afterBal < currentBal ? 'text-red-600' : 'text-slate-400'}`}>{afterBal}</div>
              </div>
              <div className="text-slate-400 text-sm">{activeLine.unit || 'pcs'}</div>
            </div>

            {/* Confirm button */}
            <button
              onClick={confirmStepper}
              disabled={confirming || stepper.qty === 0}
              className={`w-full h-14 rounded-2xl font-bold text-lg text-white disabled:opacity-50 cursor-pointer transition-colors ${stepper.mode === '+' ? 'bg-emerald-500 active:bg-emerald-600' : 'bg-red-500 active:bg-red-600'}`}
            >
              {confirming ? 'Saving…' : `Confirm ${stepper.mode === '+' ? `+${stepper.qty}` : `-${stepper.qty}`} ${activeLine.unit || 'pcs'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

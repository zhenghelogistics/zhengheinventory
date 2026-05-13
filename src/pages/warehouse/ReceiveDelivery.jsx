import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';

export default function ReceiveDelivery() {
  const { log } = useWarehouseLog();
  const [movements, setMovements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('movements')
        .select('id, movement_number, company_name, status, type')
        .in('type', ['Inbound'])
        .in('status', ['New', 'In Progress'])
        .order('created_at', { ascending: false });
      setMovements(data || []);
      setLoading(false);
    }
    load();
  }, []);

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

  async function confirmAll() {
    setSaving(true);
    for (const line of lines) {
      const qty = parseFloat(drafts[line.id]) || 0;
      await supabase
        .from('stock_lines')
        .update({ qty_actual: qty, date_in: new Date().toISOString().slice(0, 10) })
        .eq('id', line.id);
      await log('receive_delivery', line.id, selected.movement_number, {
        sku: line.sku,
        description: line.description,
        qty_confirmed: qty,
      });
    }
    // Update movement status
    await supabase
      .from('movements')
      .update({ status: 'In Progress' })
      .eq('id', selected.id);
    setSaving(false);
    setDone(true);
  }

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>;

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/>
          </svg>
        </div>
        <p className="font-bold text-slate-800 text-lg">Delivery Confirmed</p>
        <p className="text-slate-500 text-sm mt-1">{selected.movement_number}</p>
        <button
          onClick={() => { setSelected(null); setLines([]); setDone(false); }}
          className="mt-6 px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold cursor-pointer"
        >
          Receive Another
        </button>
      </div>
    );
  }

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
          <h2 className="text-lg font-bold text-slate-800">{selected.movement_number}</h2>
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

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Receive Delivery</h2>
        <p className="text-slate-500 text-xs mt-0.5">Select the inbound movement to receive</p>
      </div>

      {movements.length === 0 && (
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
              <div className="font-bold text-slate-800">{mv.movement_number}</div>
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

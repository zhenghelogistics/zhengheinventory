import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

export default function PickList() {
  const { user } = useWarehouseAuth();
  const { log } = useWarehouseLog();
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('stock_lines')
        .select('*, movements(movement_number, type, status, company_name)')
        .eq('line_type', 'Outbound')
        .is('picked_at', null)
        .order('created_at', { ascending: true });
      setLines(data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function markPicked(line) {
    setPicking(line.id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('stock_lines')
      .update({ picked_at: now, picked_by: user.name })
      .eq('id', line.id);
    if (!error) {
      setLines((prev) => prev.filter((l) => l.id !== line.id));
      await log(
        'pick_item',
        line.id,
        line.movements?.movement_number || null,
        { sku: line.sku, description: line.description, qty: line.qty_out }
      );
    }
    setPicking(null);
  }

  if (loading) return <LoadingState />;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pick List</h2>
          <p className="text-slate-500 text-xs mt-0.5">{lines.length} item{lines.length !== 1 ? 's' : ''} to pick</p>
        </div>
      </div>

      {lines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <p className="text-slate-700 font-semibold">All done!</p>
          <p className="text-slate-400 text-sm mt-1">No pending items to pick</p>
        </div>
      )}

      <div className="space-y-3">
        {lines.map((line) => (
          <div key={line.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">OUTBOUND</span>
                  <span className="text-[10px] text-slate-400 font-mono">{line.movements?.movement_number || '—'}</span>
                </div>
                <div className="font-bold text-slate-800 text-base leading-tight">{line.description || '—'}</div>
                {line.sku && <div className="text-xs font-mono text-slate-400 mt-0.5">{line.sku}</div>}
                {line.movements?.company_name && (
                  <div className="text-xs text-slate-500 mt-1">For: {line.movements.company_name}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-orange-600">{Number(line.qty_out) || 0}</div>
                <div className="text-[10px] text-slate-400 uppercase">{line.unit || 'pcs'}</div>
              </div>
            </div>
            <button
              onClick={() => markPicked(line)}
              disabled={picking === line.id}
              className="mt-4 w-full h-12 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:bg-orange-600 disabled:opacity-60 cursor-pointer"
            >
              {picking === line.id ? (
                'Marking…'
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4"/>
                  </svg>
                  Mark as Picked
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-slate-400 text-sm">Loading pick list…</div>
    </div>
  );
}

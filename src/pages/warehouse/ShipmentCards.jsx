import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const STATUS_COLOR = {
  'New':         'bg-slate-100 text-slate-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'Voided':      'bg-red-100 text-red-500',
};
const TYPE_COLOR = {
  'Inbound':  'bg-violet-100 text-violet-700',
  'Outbound': 'bg-orange-100 text-orange-700',
  'Internal': 'bg-slate-100 text-slate-600',
};

export default function ShipmentCards() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('movements')
      .select('id, movement_no, type, status, company_name, date_in, stock_lines(id, line_type, qty_actual, qty_out)')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => { setMovements(data || []); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  if (!movements.length) return (
    <div className="text-center py-20 text-slate-400 text-sm">No shipments found</div>
  );

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Shipment Cards</h2>
        <p className="text-slate-500 text-xs mt-0.5">Tap a shipment to update stock quantities</p>
      </div>

      <div className="space-y-3">
        {movements.map((m) => {
          const lines = m.stock_lines || [];
          const inLines = lines.filter((l) => l.line_type !== 'Outbound');
          const outLines = lines.filter((l) => l.line_type === 'Outbound');
          const totalIn = inLines.reduce((s, l) => s + (Number(l.qty_actual) || 0), 0);
          const totalOut = outLines.reduce((s, l) => s + (Number(l.qty_out) || 0), 0);
          const balance = totalIn - totalOut;

          return (
            <button
              key={m.id}
              onClick={() => navigate(`/warehouse/shipments/${m.id}`)}
              className="w-full bg-white rounded-2xl border-2 border-slate-200 p-4 shadow-sm active:bg-slate-50 active:border-blue-300 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono font-bold text-slate-800 text-base">{m.movement_no || '—'}</span>
                <div className="flex gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLOR[m.type] || 'bg-slate-100 text-slate-600'}`}>{m.type}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[m.status] || 'bg-slate-100 text-slate-600'}`}>{m.status}</span>
                </div>
              </div>

              <div className="text-slate-700 font-semibold text-sm mb-3">{m.company_name || 'No company'}</div>

              <div className="flex items-center gap-5 text-sm border-t border-slate-100 pt-3">
                <div className="text-center">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Items</div>
                  <div className="font-black text-slate-700 text-lg">{inLines.length}</div>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total In</div>
                  <div className="font-black text-violet-600 text-lg">+{totalIn}</div>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Out</div>
                  <div className="font-black text-orange-500 text-lg">{totalOut > 0 ? `-${totalOut}` : '—'}</div>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Balance</div>
                  <div className={`font-black text-lg ${balance > 0 ? 'text-emerald-600' : balance === 0 ? 'text-slate-400' : 'text-red-500'}`}>{balance}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

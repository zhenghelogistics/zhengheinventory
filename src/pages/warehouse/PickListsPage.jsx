import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const STATUS_COLOR = {
  'Pending':            'bg-slate-100 text-slate-600',
  'Picking':            'bg-blue-100 text-blue-700',
  'Checking':          'bg-violet-100 text-violet-700',
  'Photo Pending':      'bg-amber-100 text-amber-700',
  'Admin Review':       'bg-orange-100 text-orange-700',
  'Awaiting Signature': 'bg-pink-100 text-pink-700',
  'Completed':          'bg-emerald-100 text-emerald-700',
};

export default function PickListsPage() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('pick_lists')
      .select('*, movements(movement_no, company_name, type), pick_list_items(id)')
      .neq('status', 'Completed')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLists(data || []); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  if (!lists.length) return (
    <div className="text-center py-20 text-slate-400 text-sm">No active pick lists</div>
  );

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Pick Lists</h2>
        <p className="text-slate-500 text-xs mt-0.5">Tap a list to start picking</p>
      </div>

      <div className="space-y-3">
        {lists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => navigate(`/warehouse/pick-lists/${pl.id}`)}
            className="w-full bg-white rounded-2xl border-2 border-slate-200 p-4 shadow-sm active:bg-slate-50 active:border-blue-300 text-left cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-mono font-bold text-slate-800">{pl.movements?.movement_no || '—'}</span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[pl.status] || 'bg-slate-100 text-slate-600'}`}>{pl.status}</span>
            </div>
            <div className="text-slate-600 font-semibold text-sm mb-3">{pl.movements?.company_name || 'No company'}</div>
            <div className="text-xs text-slate-400">{pl.pick_list_items?.length || 0} items to pick</div>
          </button>
        ))}
      </div>
    </div>
  );
}

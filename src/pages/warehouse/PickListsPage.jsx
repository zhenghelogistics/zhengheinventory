import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

const STATUS_COLOR = {
  'Pending':            'bg-slate-100 text-slate-600',
  'Picking':            'bg-blue-100 text-blue-700',
  'Checking':           'bg-violet-100 text-violet-700',
  'Photo Pending':      'bg-amber-100 text-amber-700',
  'Admin Review':       'bg-orange-100 text-orange-700',
  'Awaiting Signature': 'bg-pink-100 text-pink-700',
  'Completed':          'bg-emerald-100 text-emerald-700',
};

// What each status means for the current user's role
function isVisibleToUser(pl, userName) {
  const { status, picker_name } = pl;
  const iPicked = picker_name && picker_name === userName;
  const unclaimed = !picker_name;

  switch (status) {
    case 'Pending':             return true;             // anyone can claim
    case 'Picking':             return iPicked || unclaimed; // only the picker
    case 'Checking':            return !iPicked;         // everyone except the picker
    case 'Photo Pending':       return iPicked || unclaimed; // picker takes the photo
    case 'Admin Review':        return true;             // everyone sees waiting state
    case 'Awaiting Signature':  return iPicked || unclaimed; // picker closes it out
    default:                    return true;
  }
}

function roleLabel(pl, userName) {
  const { status, picker_name } = pl;
  if (status === 'Checking') return 'Counter-check needed';
  if (status === 'Pending') return 'Tap to claim & pick';
  if (status === 'Photo Pending' && picker_name === userName) return 'Your turn — take photo';
  if (status === 'Awaiting Signature' && picker_name === userName) return 'Your turn — get signature';
  if (status === 'Admin Review') return 'Waiting for admin';
  return null;
}

export default function PickListsPage() {
  const { user } = useWarehouseAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const fetchLists = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    const { data } = await supabase
      .from('pick_lists')
      .select('*, movements(movement_no, company_name, type), pick_list_items(id)')
      .neq('status', 'Completed')
      .order('created_at', { ascending: false });
    setLists(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchLists();

    const channel = supabase
      .channel('pick_lists_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pick_lists' }, () => {
        fetchLists(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pick_lists' }, (payload) => {
        if (payload.new.status === 'Completed') {
          setLists((prev) => prev.filter((l) => l.id !== payload.new.id));
        } else {
          setLists((prev) => prev.map((l) => l.id === payload.new.id ? { ...l, ...payload.new } : l));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLists]);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
      <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full" />
      Loading…
    </div>
  );

  const userName = user?.name || '';
  const visible = lists.filter((pl) => isVisibleToUser(pl, userName));

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pick Lists</h2>
          <p className="text-slate-500 text-xs mt-0.5">Showing tasks for <span className="font-semibold">{userName}</span></p>
        </div>
        <button
          onClick={() => fetchLists(true)}
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

      {visible.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          Nothing for you right now
          <br />
          <span className="text-xs text-slate-300">New tasks will appear here automatically</span>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((pl) => {
            const role = roleLabel(pl, userName);
            const isMyPick = pl.picker_name === userName;
            const needsCheck = pl.status === 'Checking';
            return (
              <button
                key={pl.id}
                onClick={() => navigate(`/warehouse/pick-lists/${pl.id}`)}
                className={`w-full rounded-2xl border-2 p-4 shadow-sm active:scale-[0.98] text-left cursor-pointer transition-all ${
                  needsCheck
                    ? 'bg-violet-50 border-violet-200 active:border-violet-400'
                    : isMyPick
                    ? 'bg-blue-50 border-blue-200 active:border-blue-400'
                    : 'bg-white border-slate-200 active:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono font-bold text-slate-800">{pl.movements?.movement_no || '—'}</span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[pl.status] || 'bg-slate-100 text-slate-600'}`}>{pl.status}</span>
                </div>
                <div className="text-slate-600 font-semibold text-sm mb-1">{pl.movements?.company_name || 'No company'}</div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{pl.pick_list_items?.length || 0} items</span>
                  {role && (
                    <span className={`text-[10px] font-bold ${needsCheck ? 'text-violet-600' : 'text-blue-600'}`}>
                      {role}
                    </span>
                  )}
                </div>
                {pl.picker_name && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    Picker: <span className="font-semibold">{pl.picker_name}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

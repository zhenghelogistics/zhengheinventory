import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const ACTION_META = {
  pick_item:        { label: 'Pick',           color: 'bg-orange-100 text-orange-700' },
  receive_delivery: { label: 'Receive',         color: 'bg-violet-100 text-violet-700' },
  update_stock:     { label: 'Stock Update',    color: 'bg-emerald-100 text-emerald-700' },
};

function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function DetailsCell({ details, action }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-slate-400">—</span>;
  if (action === 'pick_item') {
    return <span>{details.description || details.sku || '—'} &mdash; Qty: <b>{details.qty}</b></span>;
  }
  if (action === 'receive_delivery') {
    return <span>{details.description || details.sku || '—'} &mdash; Confirmed: <b>{details.qty_confirmed}</b></span>;
  }
  if (action === 'update_stock') {
    const sign = details.change > 0 ? '+' : '';
    return (
      <span>
        {details.reason ? <><span className="text-slate-400">{details.reason}</span> &middot; </> : null}
        <b>{sign}{details.change}</b> ({details.qty_before} → {details.qty_after})
      </span>
    );
  }
  return <span className="text-slate-400 font-mono text-[10px]">{JSON.stringify(details)}</span>;
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const channelRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('warehouse_activity_log')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(200);
      setLogs(data || []);
      setLoading(false);
    }
    load();

    channelRef.current = supabase
      .channel('activity_log_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'warehouse_activity_log' }, (payload) => {
        setLogs((prev) => [payload.new, ...prev]);
      })
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      setLive(false);
    };
  }, []);

  const today = todayISO();
  const picksToday   = logs.filter((l) => l.action_type === 'pick_item'        && l.performed_at?.slice(0, 10) === today).length;
  const receivesToday = logs.filter((l) => l.action_type === 'receive_delivery' && l.performed_at?.slice(0, 10) === today).length;
  const updatesToday = logs.filter((l) => l.action_type === 'update_stock'     && l.performed_at?.slice(0, 10) === today).length;

  const users   = [...new Set(logs.map((l) => l.user_name))].filter(Boolean);
  const actions = [...new Set(logs.map((l) => l.action_type))].filter(Boolean);

  const filtered = logs.filter((l) => {
    if (userFilter   && l.user_name    !== userFilter)   return false;
    if (actionFilter && l.action_type  !== actionFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Warehouse Activity</h1>
              <p className="text-slate-500 text-xs mt-0.5">All actions by warehouse staff</p>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {live ? 'Live' : 'Connecting…'}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none cursor-pointer"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">All staff</option>
              {users.map((u) => <option key={u}>{u}</option>)}
            </select>
            <select
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white focus:outline-none cursor-pointer"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>)}
            </select>
          </div>
        </div>

        {/* Today's counters */}
        <div className="flex gap-3">
          <Counter label="Picks today"    value={picksToday}    color="text-orange-600 bg-orange-50 border-orange-200" />
          <Counter label="Receives today" value={receivesToday} color="text-violet-700 bg-violet-50 border-violet-200" />
          <Counter label="Updates today"  value={updatesToday}  color="text-emerald-700 bg-emerald-50 border-emerald-200" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">No activity yet</div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Time', 'Staff', 'Action', 'Reference', 'Details'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const meta = ACTION_META[entry.action_type] || { label: entry.action_type, color: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtTs(entry.performed_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{entry.user_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">
                        {entry.record_ref
                          ? <span className="text-blue-600 hover:underline cursor-default">{entry.record_ref}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[320px]">
                        <DetailsCell details={entry.details} action={entry.action_type} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Counter({ label, value, color }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${color}`}>
      <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

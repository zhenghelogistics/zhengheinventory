import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientOrders, ORDER_STATUSES, ORDER_STATUS_COLORS } from '../../hooks/useClientOrders';
import { fmt, fmtDate } from '../../utils/movementHelpers';

const FILTERS = ['All', 'In progress', ...ORDER_STATUSES];
const IN_PROGRESS = ['New', 'Confirmed', 'Picking', 'Packed', 'Out for Delivery'];

export default function PortalOrders() {
  const navigate = useNavigate();
  const { orders, loading, error, refetch } = useClientOrders();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === 'In progress' && !IN_PROGRESS.includes(o.status)) return false;
      if (filter !== 'All' && filter !== 'In progress' && o.status !== filter) return false;
      if (q) {
        const hay = [o.order_no, o.do_number, o.po_number, o.reference_no, o.consignee_name, o.delivery_address]
          .map((v) => (v ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">Orders</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Every delivery request you've submitted, and where each one has got to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:border-teal-300 disabled:opacity-50 cursor-pointer transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
          <button
            onClick={() => navigate('/portal/orders/new')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 cursor-pointer transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New delivery
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition"
            placeholder="Search order, PO, DO or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-teal-500 cursor-pointer"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading your orders…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-500 font-semibold">
            {orders.length === 0 ? 'No orders yet' : 'Nothing matches those filters'}
          </p>
          {orders.length === 0 && (
            <>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                Create a delivery request and it will appear here with its live status.
              </p>
              <button
                onClick={() => navigate('/portal/orders/new')}
                className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 cursor-pointer"
              >
                Create delivery request
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((o) => {
            const lines = o.client_order_lines || [];
            const totalQty = lines.reduce((s, l) => s + Number(l.qty_ordered || 0), 0);
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/portal/orders/${o.id}`)}
                className="w-full bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-teal-300 active:scale-[0.998] transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-800">{o.order_no}</span>
                      {o.do_number && (
                        <span className="text-[10px] font-mono text-slate-400">DO {o.do_number}</span>
                      )}
                      {o.po_number && (
                        <span className="text-[10px] text-slate-400">PO {o.po_number}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {o.consignee_name ? `${o.consignee_name} · ` : ''}{o.delivery_address}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0 ${ORDER_STATUS_COLORS[o.status] || 'bg-slate-100 text-slate-600'}`}>
                    {o.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                  <span>Submitted {fmtDate(o.submitted_at)}</span>
                  <span className="font-semibold text-slate-600">
                    Delivery {fmtDate(o.scheduled_date)}
                  </span>
                  <span>{lines.length} item{lines.length === 1 ? '' : 's'} · {fmt(totalQty, 0)} units</span>
                  {o.reference_no && <span>Ref {o.reference_no}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

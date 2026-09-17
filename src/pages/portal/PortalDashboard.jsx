import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientAuth } from '../../context/ClientAuthContext';
import { useClientStock } from '../../hooks/useClientStock';
import { useClientOrders, useDeliveryPreview, ORDER_STATUS_COLORS } from '../../hooks/useClientOrders';
import { fmt, fmtDate } from '../../utils/movementHelpers';

function Stat({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate:   'text-slate-800',
    teal:    'text-teal-700',
    amber:   'text-amber-600',
    blue:    'text-blue-700',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black mt-1 ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const { client } = useClientAuth();
  const { rows, loading: stockLoading } = useClientStock();
  const { orders, loading: ordersLoading } = useClientOrders();
  const { preview } = useDeliveryPreview();

  const totals = useMemo(() => {
    const available = rows.reduce((s, r) => s + Number(r.qty_available || 0), 0);
    const allocated = rows.reduce((s, r) => s + Number(r.qty_allocated || 0), 0);

    // Anything dated inside 90 days is worth the client's attention.
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 90);
    const expiringSoon = rows.filter((r) => {
      if (!r.next_expiry_date) return false;
      const d = new Date(r.next_expiry_date);
      return d <= horizon;
    }).length;

    return { skus: rows.length, available, allocated, expiringSoon };
  }, [rows]);

  const openOrders = useMemo(
    () => orders.filter((o) => !['Completed', 'Cancelled'].includes(o.status)),
    [orders],
  );

  const recent = orders.slice(0, 5);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-black text-slate-800">{client?.name}</h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Your stock and deliveries with Zhenghe Logistics
        </p>
      </div>

      {/* Cut-off notice — the client should never be guessing the date */}
      {preview && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-2xl bg-teal-50 border border-teal-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div className="text-xs text-teal-900 leading-relaxed">
            <span className="font-bold">
              Order now for delivery on {fmtDate(preview.delivery_date)}.
            </span>{' '}
            {preview.past_cutoff
              ? `Today's ${String(preview.cutoff_time).slice(0, 5)} cut-off has passed, so orders are scheduled from the next business day.`
              : `Orders placed before ${String(preview.cutoff_time).slice(0, 5)} today make the next available delivery slot.`}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Products" value={stockLoading ? '—' : totals.skus} sub="SKUs in warehouse" />
        <Stat label="Available" value={stockLoading ? '—' : fmt(totals.available, 0)} sub="units ready to ship" tone="teal" />
        <Stat label="Allocated" value={stockLoading ? '—' : fmt(totals.allocated, 0)} sub="reserved for orders" tone="blue" />
        <Stat label="Expiring" value={stockLoading ? '—' : totals.expiringSoon} sub="SKUs within 90 days" tone={totals.expiringSoon ? 'amber' : 'slate'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        <button
          onClick={() => navigate('/portal/orders/new')}
          className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-teal-700 text-white text-left hover:bg-teal-800 active:scale-[0.99] transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold">Create delivery request</div>
            <div className="text-[11px] text-white/60">Pick products, quantities and address</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/portal/inventory')}
          className="flex items-center gap-3 px-4 py-4 rounded-2xl bg-white border border-slate-200 text-left hover:border-teal-300 active:scale-[0.99] transition cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">View inventory</div>
            <div className="text-[11px] text-slate-400">Balances, receiving dates and expiry</div>
          </div>
        </button>
      </div>

      {/* Open orders */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-bold text-slate-700">
            Recent orders
            {openOrders.length > 0 && (
              <span className="ml-2 text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                {openOrders.length} in progress
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/portal/orders')}
            className="text-[11px] font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
          >
            View all
          </button>
        </div>

        {ordersLoading ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-slate-500 font-semibold">No orders yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Your delivery requests will appear here once you submit one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/portal/orders/${o.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-800">{o.order_no}</span>
                    {o.po_number && (
                      <span className="text-[10px] text-slate-400">PO {o.po_number}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {o.client_order_lines?.length || 0} item
                    {o.client_order_lines?.length === 1 ? '' : 's'} · delivery {fmtDate(o.scheduled_date)}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${ORDER_STATUS_COLORS[o.status] || 'bg-slate-100 text-slate-600'}`}>
                  {o.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

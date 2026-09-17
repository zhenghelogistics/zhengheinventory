import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClientOrder, useClientOrders, ORDER_STATUS_COLORS } from '../../hooks/useClientOrders';
import { fmt, fmtDate } from '../../utils/movementHelpers';

// The happy path, in order. 'Cancelled' is deliberately not here — it ends the
// track rather than sitting on it.
const TRACK = ['New', 'Confirmed', 'Picking', 'Packed', 'Out for Delivery', 'Completed'];

const STEP_BLURB = {
  'New':              'Received — waiting for our warehouse to accept it',
  'Confirmed':        'Accepted by the warehouse and scheduled',
  'Picking':          'Being picked from your stock',
  'Packed':           'Picked, checked and packed',
  'Out for Delivery': 'On its way to the delivery address',
  'Completed':        'Delivered',
};

function Timeline({ status, events }) {
  const reached = TRACK.indexOf(status);
  const cancelled = status === 'Cancelled';

  // Most recent timestamp per status, so each step can show when it happened.
  const stampFor = (s) => {
    const hit = [...events].reverse().find((e) => e.to_status === s);
    return hit ? new Date(hit.created_at) : null;
  };

  if (cancelled) {
    const at = stampFor('Cancelled');
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <div className="text-xs">
          <div className="font-bold text-slate-700">Cancelled</div>
          {at && <div className="text-slate-400 mt-0.5">{at.toLocaleString('en-SG')}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {TRACK.map((s, i) => {
        const done = i <= reached;
        const current = i === reached;
        const at = stampFor(s);
        return (
          <div key={s} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                done ? 'bg-teal-600' : 'bg-slate-200'
              }`}>
                {done && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              {i < TRACK.length - 1 && (
                <div className={`w-0.5 flex-1 min-h-[28px] ${i < reached ? 'bg-teal-600' : 'bg-slate-200'}`} />
              )}
            </div>
            <div className={`pb-4 ${i === TRACK.length - 1 ? 'pb-0' : ''}`}>
              <div className={`text-xs font-bold ${current ? 'text-teal-700' : done ? 'text-slate-700' : 'text-slate-400'}`}>
                {s}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{STEP_BLURB[s]}</div>
              {at && <div className="text-[10px] text-slate-400 mt-0.5">{at.toLocaleString('en-SG')}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs text-slate-700 mt-0.5 whitespace-pre-line">{value}</div>
    </div>
  );
}

export default function PortalOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { order, events, loading, error, refetch } = useClientOrder(id);
  const { cancelOrder } = useClientOrders();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  async function doCancel() {
    setCancelling(true);
    const res = await cancelOrder(id, 'Cancelled by client from portal');
    setCancelling(false);
    setConfirming(false);
    if (!res.ok) setCancelError(res.error);
    else refetch();
  }

  if (loading) {
    return <div className="px-6 py-16 text-center text-xs text-slate-400">Loading order…</div>;
  }

  if (error || !order) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-slate-500 font-semibold">{error || 'Order not found.'}</p>
        <button
          onClick={() => navigate('/portal/orders')}
          className="mt-4 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold cursor-pointer"
        >
          Back to orders
        </button>
      </div>
    );
  }

  const lines = [...(order.client_order_lines || [])].sort((a, b) => a.line_no - b.line_no);
  const totalQty = lines.reduce((s, l) => s + Number(l.qty_ordered || 0), 0);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/portal/orders')}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 mb-4 cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to orders
      </button>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800 font-mono">{order.order_no}</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Submitted {fmtDate(order.submitted_at)}
            {order.do_number && <> · DO <span className="font-mono">{order.do_number}</span></>}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${ORDER_STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'}`}>
          {order.status}
        </span>
      </div>

      <div className="mb-4 px-4 py-3 rounded-2xl bg-teal-50 border border-teal-100">
        <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wide">
          {order.status === 'Completed' ? 'Delivered' : 'Scheduled delivery'}
        </div>
        <div className="text-base font-black text-teal-900 mt-0.5">{fmtDate(order.scheduled_date)}</div>
        {order.requested_date && order.requested_date !== order.scheduled_date && (
          <p className="text-[11px] text-teal-800/70 mt-0.5">
            You requested {fmtDate(order.requested_date)}.
          </p>
        )}
      </div>

      {cancelError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {cancelError}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-xs font-bold text-slate-700 mb-4">Progress</h2>
          <Timeline status={order.status} events={events} />
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-xs font-bold text-slate-700 mb-3">
              Items <span className="text-slate-400 font-normal">· {fmt(totalQty, 0)} units</span>
            </h2>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.id} className="flex justify-between items-start gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-slate-700 truncate">{l.description || l.sku}</div>
                    <div className="text-[10px] font-mono text-slate-400">{l.sku}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-800">{fmt(l.qty_ordered, 0)} {l.unit}</div>
                    {Number(l.qty_dispatched) > 0 && (
                      <div className="text-[10px] text-emerald-600 font-semibold">
                        {fmt(l.qty_dispatched, 0)} dispatched
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-700">Delivery</h2>
            <Detail label="Address" value={order.delivery_address} />
            <Detail label="Consignee" value={order.consignee_name} />
            <Detail
              label="Contact"
              value={[order.delivery_contact_name, order.delivery_contact_phone].filter(Boolean).join(' · ')}
            />
            <Detail label="Instructions" value={order.delivery_instructions} />
            <Detail label="PO number" value={order.po_number} />
            <Detail label="Reference" value={order.reference_no} />
            <Detail label="Notes" value={order.notes} />
          </div>
        </div>
      </div>

      {order.status === 'New' && (
        <div className="mt-4">
          {confirming ? (
            <div className="bg-white rounded-2xl border border-red-200 p-4">
              <p className="text-xs text-slate-700 font-semibold mb-1">Cancel this order?</p>
              <p className="text-[11px] text-slate-500 mb-3">
                The reserved stock goes straight back to your available balance.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={doCancel}
                  disabled={cancelling}
                  className="px-4 h-9 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={cancelling}
                  className="px-4 h-9 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs font-semibold text-slate-400 hover:text-red-600 cursor-pointer transition"
            >
              Cancel this order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fmt, fmtDate } from '../../utils/movementHelpers';

/**
 * Shown on a movement that exists because a client raised it in their portal.
 *
 * Without this, a portal order looks like any other movement and whoever
 * picks it up has no idea a customer is watching its status in real time.
 * Renders nothing for ordinary movements.
 */
export default function ClientOrderBanner({ movementId }) {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!movementId) return;
    let cancelled = false;
    supabase
      .from('fulfilment_requests')
      .select('*')
      .eq('movement_id', movementId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setOrder(data); });
    return () => { cancelled = true; };
  }, [movementId]);

  if (!order) return null;

  return (
    <div className="mx-6 mt-4 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-teal-700 text-white text-[10px] font-black uppercase tracking-wide">
              Client Portal
            </span>
            <span className="font-mono font-bold text-sm text-teal-900">{order.order_no}</span>
            <span className="text-xs font-semibold text-teal-800">{order.client_name}</span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-teal-800/80 flex-wrap">
            <span className="font-semibold">Deliver {fmtDate(order.scheduled_date)}</span>
            <span>{order.line_count} item{order.line_count === 1 ? '' : 's'} · {fmt(order.total_qty, 0)} units</span>
            {order.po_number && <span>PO {order.po_number}</span>}
            {order.reference_no && <span>Ref {order.reference_no}</span>}
            <span>Status: <span className="font-semibold">{order.status}</span></span>
          </div>

          <p className="text-[11px] text-teal-800/70 mt-1.5">
            {order.consignee_name ? `${order.consignee_name} · ` : ''}{order.delivery_address}
          </p>

          {order.delivery_instructions && (
            <p className="text-[11px] text-teal-900 mt-1">
              <span className="font-semibold">Instructions:</span> {order.delivery_instructions}
            </p>
          )}
        </div>

        <button
          onClick={() => navigate('/fulfilment')}
          className="px-3 py-2 rounded-lg bg-white border border-teal-200 text-teal-800 text-xs font-bold hover:bg-teal-100 cursor-pointer shrink-0"
        >
          Fulfilment queue
        </button>
      </div>

      <p className="text-[10px] text-teal-700/70 mt-2">
        The client sees this order's status update as the pick list progresses — no
        need to tell them separately.
      </p>
    </div>
  );
}

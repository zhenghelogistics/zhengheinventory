import { useNavigate } from 'react-router-dom';
import { useDeliveryPreview } from '../../hooks/useClientOrders';
import { fmtDate } from '../../utils/movementHelpers';

/**
 * Placeholder for the Create Delivery flow.
 *
 * The server side is already in place — portal_create_order() validates
 * stock, allocates FEFO and schedules against the cut-off in one
 * transaction, and useClientOrders().createOrder() calls it. What is missing
 * is the multi-step form: product picker, delivery details, confirmation.
 */
export default function PortalOrderNew() {
  const navigate = useNavigate();
  const { preview } = useDeliveryPreview();

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/portal/orders')}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 mb-4 cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to orders
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13"/>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
            <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        </div>

        <h1 className="text-lg font-black text-slate-800">Create delivery request</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          This screen is next up. The order pipeline behind it is already built and tested —
          stock validation, batch allocation and delivery scheduling all run server-side.
        </p>

        {preview && (
          <div className="mt-5 px-4 py-3 rounded-xl bg-teal-50 border border-teal-100 text-xs text-teal-900">
            An order submitted right now would be scheduled for{' '}
            <span className="font-bold">{fmtDate(preview.delivery_date)}</span>
            {preview.past_cutoff
              ? ` — today's ${String(preview.cutoff_time).slice(0, 5)} cut-off has passed.`
              : `, ahead of today's ${String(preview.cutoff_time).slice(0, 5)} cut-off.`}
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-5">
          To place an order today, contact your Zhenghe account manager.
        </p>
      </div>
    </div>
  );
}

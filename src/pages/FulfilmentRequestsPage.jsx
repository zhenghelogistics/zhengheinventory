import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useFulfilmentRequests, OPEN_STATUSES } from '../hooks/useFulfilmentRequests';
import { fmt, fmtDate } from '../utils/movementHelpers';

const STATUS_COLORS = {
  'New':              'bg-blue-100 text-blue-700',
  'Confirmed':        'bg-violet-100 text-violet-700',
  'Picking':          'bg-amber-100 text-amber-700',
  'Packed':           'bg-orange-100 text-orange-700',
  'Out for Delivery': 'bg-cyan-100 text-cyan-700',
  'Completed':        'bg-emerald-100 text-emerald-700',
  'Cancelled':        'bg-slate-100 text-slate-500',
};

const TABS = ['New', 'In progress', 'Completed', 'All'];

export default function FulfilmentRequestsPage() {
  const navigate = useNavigate();
  const { requests, loading, error, refetch, fetchLines, confirmOrder } = useFulfilmentRequests();
  const [tab, setTab] = useState('New');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [linesCache, setLinesCache] = useState({});
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const newCount = useMemo(() => requests.filter((r) => r.status === 'New').length, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (tab === 'New' && r.status !== 'New') return false;
      if (tab === 'In progress' && !OPEN_STATUSES.slice(1).includes(r.status)) return false;
      if (tab === 'Completed' && r.status !== 'Completed') return false;
      if (q) {
        const hay = [r.order_no, r.do_number, r.po_number, r.reference_no,
                     r.client_name, r.consignee_name, r.delivery_address]
          .map((v) => (v ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, tab, search]);

  async function toggle(r) {
    if (expanded === r.id) { setExpanded(null); return; }
    setExpanded(r.id);
    if (!linesCache[r.id]) {
      const lines = await fetchLines(r.id);
      setLinesCache((prev) => ({ ...prev, [r.id]: lines }));
    }
  }

  async function accept(r) {
    setConfirmingId(r.id);
    setActionError(null);
    const res = await confirmOrder(r.id);
    setConfirmingId(null);
    if (!res.ok) setActionError(res.error);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
              Fulfilment Requests
              {newCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
                  {newCount} new
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Delivery requests submitted by clients through their portal.
            </p>
          </div>
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                tab === t ? 'bg-[#0f1f5c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
          <input
            className="flex-1 min-w-[180px] h-8 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
            placeholder="Search client, order, PO, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 bg-slate-50">
        {(error || actionError) && (
          <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            {actionError || error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading requests…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-semibold">
              {tab === 'New' ? 'No new requests' : 'Nothing here'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Client orders appear here the moment they're submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((r) => {
              const isOpen = expanded === r.id;
              const lines = linesCache[r.id];
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-bold text-sm text-slate-800">{r.order_no}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[r.status] || 'bg-slate-100'}`}>
                          {r.status}
                        </span>
                        {r.source !== 'portal' && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase">
                            {r.source}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-slate-700">{r.client_name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {r.consignee_name ? `${r.consignee_name} · ` : ''}{r.delivery_address}
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
                        <span className="font-semibold text-slate-600">
                          Deliver {fmtDate(r.scheduled_date)}
                        </span>
                        <span>{r.line_count} item{r.line_count === 1 ? '' : 's'} · {fmt(r.total_qty, 0)} units</span>
                        {r.po_number && <span>PO {r.po_number}</span>}
                        {r.reference_no && <span>Ref {r.reference_no}</span>}
                        {r.do_number && <span className="font-mono">DO {r.do_number}</span>}
                        {r.pick_status && <span>Pick: {r.pick_status}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {r.status === 'New' ? (
                        <button
                          onClick={() => accept(r)}
                          disabled={confirmingId === r.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                        >
                          <Check size={13} strokeWidth={3} />
                          {confirmingId === r.id ? 'Accepting…' : 'Accept'}
                        </button>
                      ) : r.movement_id && (
                        <button
                          onClick={() => navigate(`/movements/${r.movement_id}`)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                          title="Open the movement to create a pick list"
                        >
                          <ExternalLink size={12} />
                          {r.movement_no || 'Movement'}
                        </button>
                      )}
                      <button
                        onClick={() => toggle(r)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Details
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50/60">
                      <div className="grid sm:grid-cols-2 gap-4 pt-3">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Items</div>
                          {!lines ? (
                            <p className="text-xs text-slate-400">Loading…</p>
                          ) : (
                            <div className="space-y-1">
                              {lines.map((l) => (
                                <div key={l.id} className="flex justify-between text-xs">
                                  <span className="text-slate-600 truncate mr-2">
                                    <span className="font-mono text-slate-400">{l.sku}</span>{' '}
                                    {l.description}
                                  </span>
                                  <span className="font-bold text-slate-800 shrink-0">
                                    {fmt(l.qty_ordered, 0)} {l.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 text-xs">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Delivery</div>
                          <div className="text-slate-600 whitespace-pre-line">{r.delivery_address}</div>
                          {(r.delivery_contact_name || r.delivery_contact_phone) && (
                            <div className="text-slate-500">
                              {[r.delivery_contact_name, r.delivery_contact_phone].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {r.delivery_instructions && (
                            <div className="text-slate-500">
                              <span className="font-semibold">Instructions:</span> {r.delivery_instructions}
                            </div>
                          )}
                          {r.notes && (
                            <div className="text-slate-500">
                              <span className="font-semibold">Notes:</span> {r.notes}
                            </div>
                          )}
                          {r.requested_date && r.requested_date !== r.scheduled_date && (
                            <div className="text-amber-600 font-semibold">
                              Client asked for {fmtDate(r.requested_date)}
                            </div>
                          )}
                          <div className="text-slate-400">
                            Submitted {new Date(r.submitted_at).toLocaleString('en-SG')}
                          </div>
                        </div>
                      </div>

                      {r.status === 'Confirmed' && !r.pick_list_id && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-800">
                          Accepted as <span className="font-mono font-bold">{r.do_number}</span>.
                          Open the movement to create the pick list — the client's status
                          follows it from there automatically.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

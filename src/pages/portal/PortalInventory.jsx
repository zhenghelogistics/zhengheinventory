import { useState, useMemo, Fragment } from 'react';
import { useClientStock } from '../../hooks/useClientStock';
import { fmt, fmtDate } from '../../utils/movementHelpers';
import { isExpired, isExpiringSoon } from '../../utils/dateHelpers';

function ExpiryCell({ date }) {
  // Expiry is optional per product — "N/A" is a normal, correct answer here,
  // not missing data.
  if (!date) return <span className="text-slate-300">N/A</span>;
  if (isExpired(date)) {
    return <span className="text-red-600 font-semibold">{fmtDate(date)}</span>;
  }
  if (isExpiringSoon(date)) {
    return <span className="text-amber-600 font-semibold">{fmtDate(date)}</span>;
  }
  return <span className="text-slate-600">{fmtDate(date)}</span>;
}

function BatchRows({ batches }) {
  if (!batches) {
    return (
      <tr className="bg-slate-50/60">
        <td colSpan={8} className="px-4 py-3 text-xs text-slate-400">Loading batches…</td>
      </tr>
    );
  }
  if (batches.length === 0) {
    return (
      <tr className="bg-slate-50/60">
        <td colSpan={8} className="px-4 py-3 text-xs text-slate-400">No stock on hand for this product.</td>
      </tr>
    );
  }
  return (
    <tr className="bg-slate-50/60">
      <td colSpan={8} className="px-4 py-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
          Batches — earliest expiry ships first
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                <th className="text-left font-bold pb-1.5">Batch / Lot</th>
                <th className="text-left font-bold pb-1.5">Received</th>
                <th className="text-left font-bold pb-1.5">Expiry</th>
                <th className="text-right font-bold pb-1.5">Received</th>
                <th className="text-right font-bold pb-1.5">Allocated</th>
                <th className="text-right font-bold pb-1.5">Dispatched</th>
                <th className="text-right font-bold pb-1.5">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="py-1.5 font-mono text-slate-600">{b.batch_no || '—'}</td>
                  <td className="py-1.5 text-slate-600">{fmtDate(b.received_date)}</td>
                  <td className="py-1.5"><ExpiryCell date={b.expiry_date} /></td>
                  <td className="py-1.5 text-right text-slate-500">{fmt(b.qty_received, 0)}</td>
                  <td className="py-1.5 text-right text-slate-500">{fmt(b.qty_allocated, 0)}</td>
                  <td className="py-1.5 text-right text-slate-500">{fmt(b.qty_dispatched, 0)}</td>
                  <td className="py-1.5 text-right font-bold text-slate-800">{fmt(b.qty_available, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

export default function PortalInventory() {
  const { rows, loading, error, refetch, fetchBatches } = useClientStock();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [batchCache, setBatchCache] = useState({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.sku, r.description].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [rows, search]);

  async function toggle(row) {
    if (expanded === row.product_id) { setExpanded(null); return; }
    setExpanded(row.product_id);
    if (!batchCache[row.product_id]) {
      const batches = await fetchBatches(row.product_id);
      setBatchCache((prev) => ({ ...prev, [row.product_id]: batches }));
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-slate-800">Inventory</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Your stock held at Zhenghe Logistics. Balances update as orders are picked and dispatched.
          </p>
        </div>
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
      </div>

      <div className="relative mb-4">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition"
          placeholder="Search by SKU or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] text-slate-500 uppercase tracking-wide">
                <th className="text-left font-bold px-4 py-2.5">SKU</th>
                <th className="text-left font-bold px-4 py-2.5">Product</th>
                <th className="text-right font-bold px-4 py-2.5">Received</th>
                <th className="text-right font-bold px-4 py-2.5">Allocated</th>
                <th className="text-right font-bold px-4 py-2.5">Dispatched</th>
                <th className="text-right font-bold px-4 py-2.5">Available</th>
                <th className="text-left font-bold px-4 py-2.5">Last received</th>
                <th className="text-left font-bold px-4 py-2.5">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-slate-400">Loading your stock…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-sm text-slate-500 font-semibold">
                      {rows.length === 0 ? 'No stock on record yet' : 'No products match your search'}
                    </p>
                    {rows.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Stock appears here once the warehouse receives your goods.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <Fragment key={r.product_id}>
                    <tr
                      onClick={() => toggle(r)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{r.sku}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.description || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmt(r.qty_received, 0)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmt(r.qty_allocated, 0)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmt(r.qty_dispatched, 0)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                        {fmt(r.qty_available, 0)}
                        <span className="text-[10px] font-normal text-slate-400 ml-1">{r.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{fmtDate(r.last_received_date)}</td>
                      <td className="px-4 py-2.5 text-xs"><ExpiryCell date={r.next_expiry_date} /></td>
                    </tr>
                    {expanded === r.product_id && (
                      <BatchRows batches={batchCache[r.product_id]} />
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-3">
        Tap a row to see individual batches, receiving dates and expiry. Stock is managed by
        the warehouse — to correct a balance, contact your account manager.
      </p>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink } from 'lucide-react';
import { useMovements } from '../hooks/useMovements';
import { fmtDate, TYPE_COLORS } from '../utils/movementHelpers';

// Types that add stock
const INBOUND_TYPES = new Set(['Inbound', 'Replenishment']);

export default function StockLedgerPage() {
  const navigate = useNavigate();
  const { movements, loading } = useMovements();
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('All Companies');

  // Collect all companies from movements
  const companies = useMemo(() => {
    const set = new Set(movements.map((m) => m.company_name).filter(Boolean));
    return ['All Companies', ...Array.from(set).sort()];
  }, [movements]);

  // Build per-SKU ledger rows across all non-voided movements
  const ledger = useMemo(() => {
    const rows = [];
    const activeMovements = movements.filter((m) => m.status !== 'Voided');

    activeMovements.forEach((m) => {
      if (!m.stock_lines || m.stock_lines.length === 0) return;
      m.stock_lines.forEach((line) => {
        rows.push({
          movementId: m.id,
          movementNo: m.movement_no,
          movementType: m.type,
          company: m.company_name || '—',
          dateIn: line.date_in || m.date_in,
          dateOut: line.date_out || m.date_out,
          sku: line.sku || '—',
          description: line.description || '—',
          unit: line.unit || '',
          qtyIn: INBOUND_TYPES.has(m.type) ? (Number(line.qty_actual) || 0) : 0,
          qtyOut: m.type === 'Outbound' ? (Number(line.qty_actual) || 0) : (Number(line.qty_out) || 0),
        });
      });
    });

    return rows;
  }, [movements]);

  // Group by company + SKU, compute running balance
  const grouped = useMemo(() => {
    const q = search.toLowerCase();

    // Filter rows
    const filtered = ledger.filter((r) => {
      if (companyFilter !== 'All Companies' && r.company !== companyFilter) return false;
      if (q && ![r.company, r.sku, r.description].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });

    // Group by company → SKU
    const map = {};
    filtered.forEach((r) => {
      const companyKey = r.company;
      if (!map[companyKey]) map[companyKey] = {};
      const skuKey = r.sku;
      if (!map[companyKey][skuKey]) {
        map[companyKey][skuKey] = {
          sku: r.sku,
          description: r.description,
          unit: r.unit,
          lines: [],
        };
      }
      map[companyKey][skuKey].lines.push(r);
    });

    // Convert to sorted array with running balance per SKU
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([company, skus]) => ({
        company,
        skus: Object.values(skus).map((skuData) => {
          // Sort lines: inbound/replenishment by dateIn, outbound by dateOut
          const sorted = [...skuData.lines].sort((a, b) => {
            const da = a.dateIn || a.dateOut || '';
            const db = b.dateIn || b.dateOut || '';
            return da.localeCompare(db);
          });

          let running = 0;
          const withBalance = sorted.map((r) => {
            running += r.qtyIn - r.qtyOut;
            return { ...r, balance: running };
          });

          return {
            ...skuData,
            lines: withBalance,
            totalIn: sorted.reduce((s, r) => s + r.qtyIn, 0),
            totalOut: sorted.reduce((s, r) => s + r.qtyOut, 0),
            currentBalance: running,
          };
        }),
      }));
  }, [ledger, search, companyFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Stock Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">Running balance per SKU across all movements</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, SKU, description…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer"
        >
          {companies.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <svg className="animate-spin w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm font-medium">Loading…</span>
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <p className="text-sm font-medium text-slate-500">No stock data found</p>
            <p className="text-xs mt-1">Create some movements with stock lines to see the ledger</p>
          </div>
        ) : (
          grouped.map(({ company, skus }) => (
            <div key={company} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Company header */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{company}</h3>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{skus.length} SKU{skus.length !== 1 ? 's' : ''}</span>
                  <span className={`font-semibold ${skus.reduce((s, sk) => s + sk.currentBalance, 0) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    Balance: {skus.reduce((s, sk) => s + sk.currentBalance, 0)} units
                  </span>
                </div>
              </div>

              {/* Per-SKU tables */}
              <div className="divide-y divide-slate-100">
                {skus.map((skuData) => (
                  <div key={skuData.sku} className="px-5 py-4">
                    {/* SKU header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{skuData.sku}</span>
                        <span className="text-xs text-slate-600">{skuData.description}</span>
                        {skuData.unit && <span className="text-[10px] text-slate-400">({skuData.unit})</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-500">In: <span className="font-semibold text-violet-600">{skuData.totalIn}</span></span>
                        <span className="text-slate-500">Out: <span className="font-semibold text-orange-500">{skuData.totalOut}</span></span>
                        <span className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                          skuData.currentBalance > 0 ? 'bg-emerald-100 text-emerald-700' :
                          skuData.currentBalance === 0 ? 'bg-slate-100 text-slate-500' :
                          'bg-red-100 text-red-600'
                        }`}>
                          Balance: {skuData.currentBalance}
                        </span>
                      </div>
                    </div>

                    {/* Movement rows */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="pb-2 text-left font-semibold text-slate-400 pr-4">Movement</th>
                          <th className="pb-2 text-left font-semibold text-slate-400 pr-4">Type</th>
                          <th className="pb-2 text-left font-semibold text-slate-400 pr-4">Date In</th>
                          <th className="pb-2 text-left font-semibold text-slate-400 pr-4">Date Out</th>
                          <th className="pb-2 text-right font-semibold text-slate-400 pr-4">Qty In</th>
                          <th className="pb-2 text-right font-semibold text-slate-400 pr-4">Qty Out</th>
                          <th className="pb-2 text-right font-semibold text-slate-400">Running Balance</th>
                          <th className="pb-2 w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {skuData.lines.map((r, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2 pr-4 font-mono font-semibold text-blue-600">{r.movementNo}</td>
                            <td className="py-2 pr-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[r.movementType] || 'bg-slate-100 text-slate-600'}`}>
                                {r.movementType}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-slate-500">{fmtDate(r.dateIn)}</td>
                            <td className="py-2 pr-4 text-slate-500">{fmtDate(r.dateOut)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-violet-600 font-medium">{r.qtyIn > 0 ? `+${r.qtyIn}` : '—'}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-orange-500 font-medium">{r.qtyOut > 0 ? `-${r.qtyOut}` : '—'}</td>
                            <td className="py-2 text-right">
                              <span className={`tabular-nums font-bold ${
                                r.balance > 0 ? 'text-emerald-600' :
                                r.balance === 0 ? 'text-slate-400' :
                                'text-red-500'
                              }`}>{r.balance}</span>
                            </td>
                            <td className="py-2 pl-3">
                              <button
                                onClick={() => navigate(`/movements/${r.movementId}`)}
                                className="p-1 rounded hover:bg-blue-100 text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
                                title="Open movement"
                              >
                                <ExternalLink size={11} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

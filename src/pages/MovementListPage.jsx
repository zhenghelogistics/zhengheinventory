import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileSpreadsheet, Eye, Trash2, Package, ExternalLink } from 'lucide-react';
import { useMovements } from '../hooks/useMovements';
import { fmt, fmtDate, STATUS_COLORS, TYPE_COLORS } from '../utils/movementHelpers';
import { exportMovementsExcel } from '../utils/excelExport';
import ConfirmDialog from '../components/ConfirmDialog';

const MOVEMENT_TYPES = ['Inbound', 'Replenishment', 'Outbound', 'Internal'];
const FILTER_TYPES = ['All Types', ...MOVEMENT_TYPES];
const STATUSES = ['All Statuses', 'New', 'In Progress', 'Completed', 'Voided'];
const INBOUND_TYPES = new Set(['Inbound', 'Replenishment']);

export default function MovementListPage() {
  const navigate = useNavigate();
  const { movements, loading, createMovement, deleteMovement } = useMovements();

  const [tab, setTab] = useState('movements'); // 'movements' | 'ledger'
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [showVoided, setShowVoided] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [creating, setCreating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [ledgerCompany, setLedgerCompany] = useState('All Companies');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeCount = useMemo(() => movements.filter((m) => m.status !== 'Voided').length, [movements]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return movements.filter((m) => {
      if (!showVoided && m.status === 'Voided') return false;
      if (typeFilter !== 'All Types' && m.type !== typeFilter) return false;
      if (statusFilter !== 'All Statuses' && m.status !== statusFilter) return false;
      if (q) {
        const hay = [m.movement_no, m.company_name, m.salesperson, m.status, m.type].map((v) => (v ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movements, search, typeFilter, statusFilter, showVoided]);

  // Ledger data
  const ledgerCompanies = useMemo(() => {
    const set = new Set(movements.map((m) => m.company_name).filter(Boolean));
    return ['All Companies', ...Array.from(set).sort()];
  }, [movements]);

  const ledgerGrouped = useMemo(() => {
    const q = ledgerSearch.toLowerCase();
    const rows = [];
    movements.filter((m) => m.status !== 'Voided').forEach((m) => {
      (m.stock_lines || []).forEach((line) => {
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

    const filtered2 = rows.filter((r) => {
      if (ledgerCompany !== 'All Companies' && r.company !== ledgerCompany) return false;
      if (q && ![r.company, r.sku, r.description].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });

    const map = {};
    filtered2.forEach((r) => {
      if (!map[r.company]) map[r.company] = {};
      if (!map[r.company][r.sku]) map[r.company][r.sku] = { sku: r.sku, description: r.description, unit: r.unit, lines: [] };
      map[r.company][r.sku].lines.push(r);
    });

    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([company, skus]) => ({
      company,
      skus: Object.values(skus).map((skuData) => {
        const sorted = [...skuData.lines].sort((a, b) => (a.dateIn || a.dateOut || '').localeCompare(b.dateIn || b.dateOut || ''));
        let running = 0;
        const withBalance = sorted.map((r) => { running += r.qtyIn - r.qtyOut; return { ...r, balance: running }; });
        return { ...skuData, lines: withBalance, totalIn: sorted.reduce((s, r) => s + r.qtyIn, 0), totalOut: sorted.reduce((s, r) => s + r.qtyOut, 0), currentBalance: running };
      }),
    }));
  }, [movements, ledgerCompany, ledgerSearch]);

  async function handleCreate(type) {
    setCreating(true);
    const m = await createMovement(type);
    setCreating(false);
    if (m) navigate(`/movements/${m.id}`);
  }

  async function handleDelete() {
    await deleteMovement(toDelete.id);
    setToDelete(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">Stock Movements</h2>
            <p className="text-xs text-slate-400 mt-0.5">{activeCount} active movements</p>
          </div>
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setTab('movements')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab === 'movements' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Movements
            </button>
            <button
              onClick={() => setTab('ledger')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${tab === 'ledger' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Stock Ledger
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'movements' && (
            <button
              onClick={() => exportMovementsExcel(movements.filter((m) => m.status !== 'Voided'))}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={13} strokeWidth={2.5} />
              Export Excel
            </button>
          )}
          <div className="relative" ref={dropdownRef}>
            <button
              disabled={creating}
              onClick={() => setDropdownOpen((p) => !p)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors cursor-pointer shadow-sm disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={2.5} />
              New Movement
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                {MOVEMENT_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setDropdownOpen(false); handleCreate(t); }}
                    className="w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  >
                    <span className={`w-2 h-2 rounded-full ${t === 'Inbound' ? 'bg-violet-500' : t === 'Replenishment' ? 'bg-blue-500' : t === 'Outbound' ? 'bg-orange-500' : 'bg-cyan-500'}`} />
                    <span className="text-slate-700 font-medium">{t}</span>
                    <span className="text-slate-400 text-[10px] ml-auto">
                      {t === 'Inbound' ? 'first delivery' : t === 'Replenishment' ? 'top up stock' : t === 'Outbound' ? 'dispatch out' : 'warehouse transfer'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === 'movements' ? (
        <>
          {/* Filters */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search movement no., company, salesperson…"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors" />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer">
              {FILTER_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="rounded border-slate-300 text-blue-600 cursor-pointer" />
              Show Voided
            </label>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {loading ? <Spinner /> : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <Package size={40} strokeWidth={1.5} className="mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No movements found</p>
                <p className="text-xs mt-1">Adjust your filters or create a new movement</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Movement No.', 'Type', 'Status', 'Company', 'Salesperson', 'Date In', 'Date Out', 'Cost (SGD)', 'Sale (SGD)', 'GP%', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const totalCost = (m.cost_lines || []).reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);
                    const sale = Number(m.total_sale) || 0;
                    const profit = sale - totalCost;
                    const gp = sale > 0 ? ((profit / sale) * 100).toFixed(1) : '—';
                    return (
                      <tr key={m.id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${m.status === 'Voided' ? 'opacity-50' : ''}`} onClick={() => navigate(`/movements/${m.id}`)}>
                        <td className="px-4 py-3 font-mono font-semibold text-blue-700">{m.movement_no || '—'}</td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[m.type] || 'bg-slate-100 text-slate-600'}`}>{m.type}</span></td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[m.status] || 'bg-slate-100 text-slate-600'}`}>{m.status}</span></td>
                        <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{m.company_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{m.salesperson || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(m.date_in)}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(m.date_out)}</td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{fmt(totalCost)}</td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{fmt(sale)}</td>
                        <td className={`px-4 py-3 font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{gp === '—' ? '—' : `${gp}%`}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => navigate(`/movements/${m.id}`)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer" title="View"><Eye size={13} /></button>
                            <button onClick={() => setToDelete(m)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        /* Stock Ledger tab */
        <>
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={ledgerSearch} onChange={(e) => setLedgerSearch(e.target.value)} placeholder="Search company, SKU, description…"
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors" />
            </div>
            <select value={ledgerCompany} onChange={(e) => setLedgerCompany(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer">
              {ledgerCompanies.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5 space-y-5 bg-slate-50">
            {loading ? <Spinner /> : ledgerGrouped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <p className="text-sm font-medium text-slate-500">No stock data found</p>
                <p className="text-xs mt-1">Create movements with stock lines to see the ledger</p>
              </div>
            ) : ledgerGrouped.map(({ company, skus }) => (
              <div key={company} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">{company}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{skus.length} SKU{skus.length !== 1 ? 's' : ''}</span>
                    <span className={`font-bold ${skus.reduce((s, sk) => s + sk.currentBalance, 0) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      Total balance: {skus.reduce((s, sk) => s + sk.currentBalance, 0)} units
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {skus.map((skuData) => (
                    <div key={skuData.sku} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{skuData.sku}</span>
                          <span className="text-xs text-slate-600">{skuData.description}</span>
                          {skuData.unit && <span className="text-[10px] text-slate-400">({skuData.unit})</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-slate-500">In: <span className="font-semibold text-violet-600">{skuData.totalIn}</span></span>
                          <span className="text-slate-500">Out: <span className="font-semibold text-orange-500">{skuData.totalOut}</span></span>
                          <span className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${skuData.currentBalance > 0 ? 'bg-emerald-100 text-emerald-700' : skuData.currentBalance === 0 ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-600'}`}>
                            Balance: {skuData.currentBalance}
                          </span>
                        </div>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {['Movement', 'Type', 'Date In', 'Date Out', 'Qty In', 'Qty Out', 'Running Balance', ''].map((h) => (
                              <th key={h} className="pb-2 text-left font-semibold text-slate-400 pr-4 last:pr-0">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {skuData.lines.map((r, i) => (
                            <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="py-2 pr-4 font-mono font-semibold text-blue-600">{r.movementNo}</td>
                              <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[r.movementType] || 'bg-slate-100 text-slate-600'}`}>{r.movementType}</span></td>
                              <td className="py-2 pr-4 text-slate-500">{fmtDate(r.dateIn)}</td>
                              <td className="py-2 pr-4 text-slate-500">{fmtDate(r.dateOut)}</td>
                              <td className="py-2 pr-4 tabular-nums text-violet-600 font-medium">{r.qtyIn > 0 ? `+${r.qtyIn}` : '—'}</td>
                              <td className="py-2 pr-4 tabular-nums text-orange-500 font-medium">{r.qtyOut > 0 ? `-${r.qtyOut}` : '—'}</td>
                              <td className="py-2 pr-4">
                                <span className={`tabular-nums font-bold ${r.balance > 0 ? 'text-emerald-600' : r.balance === 0 ? 'text-slate-400' : 'text-red-500'}`}>{r.balance}</span>
                              </td>
                              <td className="py-2">
                                <button onClick={() => navigate(`/movements/${r.movementId}`)} className="p-1 rounded hover:bg-blue-100 text-slate-300 hover:text-blue-500 transition-colors cursor-pointer" title="Open movement"><ExternalLink size={11} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {toDelete && (
        <ConfirmDialog
          message={`Delete movement ${toDelete.movement_no}? This will also delete all cost and stock lines.`}
          onConfirm={handleDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
      <svg className="animate-spin w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

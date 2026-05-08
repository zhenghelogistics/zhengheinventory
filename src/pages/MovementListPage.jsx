import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileSpreadsheet, Eye, Trash2, Package } from 'lucide-react';
import { useMovements } from '../hooks/useMovements';
import { fmt, fmtDate, STATUS_COLORS, TYPE_COLORS, calcMovementTotals } from '../utils/movementHelpers';
import { exportMovementsExcel } from '../utils/excelExport';
import ConfirmDialog from '../components/ConfirmDialog';

const TYPES = ['All Types', 'Inbound', 'Outbound', 'Internal'];
const STATUSES = ['All Statuses', 'New', 'In Progress', 'Completed', 'Voided'];

export default function MovementListPage() {
  const navigate = useNavigate();
  const { movements, loading, createMovement, deleteMovement } = useMovements();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [showVoided, setShowVoided] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return movements.filter((m) => {
      if (!showVoided && m.status === 'Voided') return false;
      if (typeFilter !== 'All Types' && m.type !== typeFilter) return false;
      if (statusFilter !== 'All Statuses' && m.status !== statusFilter) return false;
      if (q) {
        const haystack = [m.movement_no, m.company_name, m.salesperson, m.status, m.type]
          .map((v) => (v ?? '').toLowerCase()).join(' ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [movements, search, typeFilter, statusFilter, showVoided]);

  const activeCount = useMemo(() => movements.filter((m) => m.status !== 'Voided').length, [movements]);

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
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Stock Movements</h2>
          <p className="text-xs text-slate-400 mt-0.5">{activeCount} active movements</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportMovementsExcel(movements.filter((m) => m.status !== 'Voided'))}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={13} strokeWidth={2.5} />
            Export Excel
          </button>
          <div className="relative group">
            <button
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors cursor-pointer shadow-sm disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={2.5} />
              New Movement
            </button>
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 hidden group-hover:block z-20">
              {['Inbound', 'Outbound', 'Internal'].map((t) => (
                <button
                  key={t}
                  onClick={() => handleCreate(t)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search movement no., company, salesperson…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer"
        >
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 cursor-pointer"
        >
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 cursor-pointer"
          />
          Show Voided
        </label>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <svg className="animate-spin w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm font-medium">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
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
                const voided = m.status === 'Voided';
                return (
                  <tr
                    key={m.id}
                    className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${voided ? 'opacity-50' : ''}`}
                    onClick={() => navigate(`/movements/${m.id}`)}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">{m.movement_no || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[m.type] || 'bg-slate-100 text-slate-600'}`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[m.status] || 'bg-slate-100 text-slate-600'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{m.company_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{m.salesperson || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(m.date_in)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(m.date_out)}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{fmt(totalCost)}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{fmt(sale)}</td>
                    <td className={`px-4 py-3 font-semibold tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {gp === '—' ? '—' : `${gp}%`}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/movements/${m.id}`)}
                          className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                          title="View"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={() => setToDelete(m)}
                          className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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

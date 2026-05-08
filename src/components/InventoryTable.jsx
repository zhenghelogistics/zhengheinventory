import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Trash2, Package } from 'lucide-react';
import { isExpired, isExpiringSoon, formatDate } from '../utils/dateHelpers';

const PAGE_SIZE = 25;

const COLS = [
  { key: 'id', label: 'No.', mono: true },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty', mono: true },
  { key: 'sku', label: 'SKU', mono: true },
  { key: 'dateIn', label: 'Date In' },
  { key: 'dateOut', label: 'Date Out' },
  { key: 'numPackages', label: 'Pkgs', mono: true },
  { key: 'dimension', label: 'Dimension' },
  { key: 'weight', label: 'Weight' },
  { key: 'expiryDate', label: 'Expiry' },
  { key: 'customerName', label: 'Customer' },
  { key: 'remark', label: 'Remark' },
];

function rowStyle(record) {
  if (isExpired(record.expiryDate)) return 'bg-red-50/60 hover:bg-red-50';
  if (isExpiringSoon(record.expiryDate)) return 'bg-amber-50/60 hover:bg-amber-50';
  return 'bg-white hover:bg-slate-50/80';
}

function ExpiryBadge({ dateStr }) {
  if (!dateStr) return <span className="text-slate-300">—</span>;
  if (isExpired(dateStr))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        {formatDate(dateStr)}
      </span>
    );
  if (isExpiringSoon(dateStr))
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        {formatDate(dateStr)}
      </span>
    );
  return <span className="text-slate-600 tabular-nums text-xs">{formatDate(dateStr)}</span>;
}

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} strokeWidth={2} className="text-slate-300 ml-1 flex-shrink-0" />;
  return sortDir === 'asc'
    ? <ChevronUp size={12} strokeWidth={2.5} className="text-blue-600 ml-1 flex-shrink-0" />
    : <ChevronDown size={12} strokeWidth={2.5} className="text-blue-600 ml-1 flex-shrink-0" />;
}

export default function InventoryTable({ records, onEdit, onDelete }) {
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  function handleSort(key) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  }

  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRecords = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Package size={32} strokeWidth={1.5} className="text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-500">No inventory records yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first item to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto table-scroll flex-1">
        <table className="w-full text-sm border-collapse min-w-[1000px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors duration-150 whitespace-nowrap"
                >
                  <span className="flex items-center">
                    {c.label}
                    <SortIcon col={c.key} sortKey={sortKey} sortDir={sortDir} />
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRecords.map((r) => (
              <tr key={r.id} className={`${rowStyle(r)} transition-colors duration-100`}>
                <td className="px-3 py-2.5 text-slate-400 tabular-nums text-xs font-medium">{r.id}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[180px]">
                  <span className="block truncate">{r.description}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-700">
                  {r.quantity === 0
                    ? <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">0</span>
                    : r.quantity}
                </td>
                <td className="px-3 py-2.5 text-slate-500 tabular-nums text-xs font-mono">{r.sku || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-slate-500 text-xs tabular-nums whitespace-nowrap">{formatDate(r.dateIn) || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-slate-500 text-xs tabular-nums whitespace-nowrap">{formatDate(r.dateOut) || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-slate-500 tabular-nums">{r.numPackages ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-slate-500 text-xs max-w-[112px]"><span className="block truncate">{r.dimension || <span className="text-slate-300">—</span>}</span></td>
                <td className="px-3 py-2.5 text-slate-500 text-xs">{r.weight || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 whitespace-nowrap"><ExpiryBadge dateStr={r.expiryDate} /></td>
                <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[140px]"><span className="block truncate">{r.customerName || <span className="text-slate-300">—</span>}</span></td>
                <td className="px-3 py-2.5 text-slate-400 text-xs italic max-w-[160px]"><span className="block truncate">{r.remark || <span className="not-italic text-slate-300">—</span>}</span></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(r)}
                      aria-label="Edit record"
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-150 cursor-pointer"
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      aria-label="Delete record"
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-slate-100">
        {pageRecords.map((r) => (
          <div key={r.id} className={`${rowStyle(r)} p-4 transition-colors duration-100`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs text-slate-400 font-mono tabular-nums">#{r.id}</span>
                <p className="font-bold text-slate-800 text-sm">{r.description}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onEdit(r)}
                  aria-label="Edit"
                  className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-150 cursor-pointer"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
                <button
                  onClick={() => onDelete(r)}
                  aria-label="Delete"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150 cursor-pointer"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-slate-500">Qty: <span className="font-bold text-slate-700 tabular-nums">{r.quantity}</span></span>
              {r.sku && <span className="text-slate-500 font-mono">{r.sku}</span>}
              {r.expiryDate && <span className="col-span-2"><ExpiryBadge dateStr={r.expiryDate} /></span>}
              {r.customerName && <span className="text-slate-500 col-span-2">{r.customerName}</span>}
              {r.numPackages != null && <span className="text-slate-500">Pkgs: {r.numPackages}</span>}
              {r.weight && <span className="text-slate-500">{r.weight}</span>}
            </div>
            {r.remark && <p className="text-xs text-slate-400 italic mt-2">{r.remark}</p>}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-white text-sm">
          <span className="text-xs text-slate-400">
            Page {page} of {totalPages} · {sorted.length} records
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
            >
              ← Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed text-xs font-medium"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

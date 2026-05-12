import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { fmtDate } from '../../utils/movementHelpers';

const UNITS = ['pcs', 'box', 'carton', 'pallet', 'kg', 'bag', 'roll', 'set', 'drum', 'unit'];
const TODAY = new Date().toISOString().split('T')[0];

const LINE_TYPES = ['Inbound', 'Replenishment', 'Outbound'];

const LINE_TYPE_COLORS = {
  'Inbound':      'bg-violet-100 text-violet-700',
  'Replenishment':'bg-blue-100 text-blue-700',
  'Outbound':     'bg-orange-100 text-orange-700',
};

function dispatchStatus(date_out) {
  if (!date_out) return 'none';
  return date_out <= TODAY ? 'dispatched' : 'pending';
}

// What columns to show based on movement type
function getMode(movementType) {
  if (movementType === 'Outbound') return 'out';
  if (movementType === 'Internal') return 'both';
  return 'in'; // Inbound or Replenishment
}

export default function StockLinesTable({ lines, movementType, onAdd, onUpdate, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const mode = getMode(movementType);
  const showIn = mode === 'in' || mode === 'both';
  const showOut = mode === 'out' || mode === 'both';
  const showBalance = mode === 'both';

  function startEdit(line) {
    const defaultType = line.line_type || 'Inbound';
    setEditId(line.id);
    setDraft({
      line_type: line.line_type || defaultType,
      sku: line.sku || '',
      description: line.description || '',
      unit: line.unit || 'pcs',
      qty_actual: line.qty_actual ?? '',
      qty_out: line.qty_out ?? '',
      date_in: line.date_in || '',
      date_out: line.date_out || '',
      remarks: line.remarks || '',
    });
  }

  async function saveEdit() {
    setSaving(true);
    await onUpdate(editId, {
      line_type: draft.line_type,
      sku: draft.sku,
      description: draft.description,
      unit: draft.unit,
      qty_actual: parseFloat(draft.qty_actual) || 0,
      qty_out: parseFloat(draft.qty_out) || 0,
      date_in: draft.date_in || null,
      date_out: draft.date_out || null,
      remarks: draft.remarks,
    });
    setSaving(false);
    setEditId(null);
  }

  const totalIn = lines.reduce((s, l) => s + (Number(l.qty_actual) || 0), 0);
  const totalOut = lines.reduce((s, l) => s + (Number(l.qty_out) || 0), 0);
  const totalBalance = totalIn - totalOut;

  // Build column headers dynamically
  const COLS = [
    'Event', 'SKU', 'Description', 'Unit',
    ...(showIn ? ['Qty In'] : []),
    ...(showOut ? ['Qty Out'] : []),
    ...(showBalance ? ['Balance'] : []),
    ...(showIn ? ['Date In'] : []),
    ...(showOut ? ['Date Out'] : []),
    ...(showOut ? ['Status'] : []),
    'Remarks', '',
  ];

  return (
    <div className="space-y-3">
      {/* Summary pills */}
      {lines.length > 0 && (
        <div className="flex items-stretch gap-3">
          {showIn && <SummaryPill label="Total In" value={totalIn} color="text-violet-700 bg-violet-50 border-violet-200" />}
          {showOut && <SummaryPill label="Total Out" value={totalOut} color="text-orange-600 bg-orange-50 border-orange-200" />}
          {showBalance && (
            <SummaryPill
              label="Balance"
              value={totalBalance}
              sub={totalBalance < 0 ? 'over-dispatched' : totalBalance === 0 ? 'fully out' : 'remaining'}
              color={totalBalance > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : totalBalance === 0 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200'}
              bold
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLS.map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No stock lines yet. Click + Add Row below.
                </td>
              </tr>
            )}
            {lines.map((line) => {
              const status = dispatchStatus(line.date_out);
              const lineBalance = (Number(line.qty_actual) || 0) - (Number(line.qty_out) || 0);
              return editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5">
                    <select className={inp} value={draft.line_type} onChange={(e) => setDraft((p) => ({ ...p, line_type: e.target.value }))}>
                      {LINE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input className={inp} value={draft.sku} onChange={(e) => setDraft((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU" /></td>
                  <td className="px-2 py-1.5"><input className={inp + ' min-w-[140px]'} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Description" /></td>
                  <td className="px-2 py-1.5">
                    <select className={inp} value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  {showIn && <td className="px-2 py-1.5"><input type="number" className={inp} value={draft.qty_actual} onChange={(e) => setDraft((p) => ({ ...p, qty_actual: e.target.value }))} placeholder="0" /></td>}
                  {showOut && <td className="px-2 py-1.5"><input type="number" className={inp} value={draft.qty_out} onChange={(e) => setDraft((p) => ({ ...p, qty_out: e.target.value }))} placeholder="0" /></td>}
                  {showBalance && (
                    <td className="px-2 py-1.5 text-center">
                      <span className={`font-bold tabular-nums text-xs ${(parseFloat(draft.qty_actual)||0)-(parseFloat(draft.qty_out)||0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {(parseFloat(draft.qty_actual)||0)-(parseFloat(draft.qty_out)||0)}
                      </span>
                    </td>
                  )}
                  {showIn && <td className="px-2 py-1.5"><input type="date" className={inp} value={draft.date_in} onChange={(e) => setDraft((p) => ({ ...p, date_in: e.target.value }))} /></td>}
                  {showOut && <td className="px-2 py-1.5"><input type="date" className={inp} value={draft.date_out} onChange={(e) => setDraft((p) => ({ ...p, date_out: e.target.value }))} /></td>}
                  {showOut && <td className="px-2 py-1.5 text-slate-300 text-[10px]">—</td>}
                  <td className="px-2 py-1.5"><input className={inp} value={draft.remarks} onChange={(e) => setDraft((p) => ({ ...p, remarks: e.target.value }))} placeholder="Remarks" /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={line.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 group transition-colors ${status === 'dispatched' && lineBalance === 0 ? 'opacity-50' : ''}`}
                  onDoubleClick={() => startEdit(line)}
                >
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${LINE_TYPE_COLORS[line.line_type] || 'bg-slate-100 text-slate-600'}`}>
                      {line.line_type || 'Delivery'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{line.sku || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">{line.description || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{line.unit || '—'}</td>
                  {showIn && <td className="px-3 py-2.5 tabular-nums text-slate-700 font-medium">{line.qty_actual ?? 0}</td>}
                  {showOut && <td className="px-3 py-2.5 tabular-nums text-orange-600 font-medium">{line.qty_out ?? 0}</td>}
                  {showBalance && (
                    <td className="px-3 py-2.5">
                      <span className={`tabular-nums font-bold text-xs px-2 py-0.5 rounded-full ${
                        lineBalance > 0 ? 'bg-emerald-100 text-emerald-700' :
                        lineBalance === 0 ? 'bg-slate-100 text-slate-500' :
                        'bg-red-100 text-red-600'
                      }`}>{lineBalance}</span>
                    </td>
                  )}
                  {showIn && <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(line.date_in)}</td>}
                  {showOut && <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(line.date_out)}</td>}
                  {showOut && (
                    <td className="px-3 py-2.5">
                      {status === 'dispatched' && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">Dispatched</span>}
                      {status === 'pending' && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Pending</span>}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-slate-400 max-w-[100px] truncate">{line.remarks || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(line)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 cursor-pointer"><Pencil size={11} /></button>
                      <button onClick={() => onDelete(line.id)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                <td colSpan={4} className="px-3 py-2.5 text-right text-xs text-slate-500">Totals</td>
                {showIn && <td className="px-3 py-2.5 tabular-nums text-slate-700">{totalIn}</td>}
                {showOut && <td className="px-3 py-2.5 tabular-nums text-orange-600">{totalOut}</td>}
                {showBalance && (
                  <td className="px-3 py-2.5">
                    <span className={`tabular-nums font-bold text-xs px-2 py-0.5 rounded-full ${
                      totalBalance > 0 ? 'bg-emerald-100 text-emerald-700' :
                      totalBalance === 0 ? 'bg-slate-100 text-slate-500' :
                      'bg-red-100 text-red-600'
                    }`}>{totalBalance}</span>
                  </td>
                )}
                <td colSpan={COLS.length - 3 - (showIn?1:0) - (showOut?1:0) - (showBalance?1:0)} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add Row
      </button>
    </div>
  );
}

function SummaryPill({ label, value, color, sub, bold }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs ${color}`}>
      <div>
        <div className="font-semibold opacity-70 mb-0.5">{label}</div>
        <div className={`tabular-nums text-lg leading-none ${bold ? 'font-bold' : 'font-semibold'}`}>{value}</div>
        {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const inp = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[70px]';

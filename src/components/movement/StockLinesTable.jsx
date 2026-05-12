import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { fmtDate } from '../../utils/movementHelpers';

const UNITS = ['pcs', 'box', 'carton', 'pallet', 'kg', 'bag', 'roll', 'set', 'drum', 'unit'];

export default function StockLinesTable({ lines, onAdd, onUpdate, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function startEdit(line) {
    setEditId(line.id);
    setDraft({
      sku: line.sku || '',
      description: line.description || '',
      unit: line.unit || 'pcs',
      qty_ordered: line.qty_ordered ?? '',
      qty_actual: line.qty_actual ?? '',
      date_in: line.date_in || '',
      date_out: line.date_out || '',
      remarks: line.remarks || '',
    });
  }

  async function saveEdit() {
    setSaving(true);
    await onUpdate(editId, {
      sku: draft.sku,
      description: draft.description,
      unit: draft.unit,
      qty_ordered: parseFloat(draft.qty_ordered) || 0,
      qty_actual: parseFloat(draft.qty_actual) || 0,
      date_in: draft.date_in || null,
      date_out: draft.date_out || null,
      remarks: draft.remarks,
    });
    setSaving(false);
    setEditId(null);
  }

  const totalOrdered = lines.reduce((s, l) => s + (Number(l.qty_ordered) || 0), 0);
  const totalActual = lines.reduce((s, l) => s + (Number(l.qty_actual) || 0), 0);

  const COLS = ['SKU', 'Description', 'Unit', 'Qty Ordered', 'Qty Actual', 'Date In', 'Date Out', 'Remarks', ''];

  return (
    <div>
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
            {lines.map((line) =>
              editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.sku} onChange={(e) => setDraft((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp + ' min-w-[160px]'} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={inp} value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.qty_ordered} onChange={(e) => setDraft((p) => ({ ...p, qty_ordered: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.qty_actual} onChange={(e) => setDraft((p) => ({ ...p, qty_actual: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="date" className={inp} value={draft.date_in} onChange={(e) => setDraft((p) => ({ ...p, date_in: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="date" className={inp} value={draft.date_out} onChange={(e) => setDraft((p) => ({ ...p, date_out: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.remarks} onChange={(e) => setDraft((p) => ({ ...p, remarks: e.target.value }))} placeholder="Remarks" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer">
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer">
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50 group" onDoubleClick={() => startEdit(line)}>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{line.sku || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">{line.description || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{line.unit || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{line.qty_ordered ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{line.qty_actual ?? 0}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(line.date_in)}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(line.date_out)}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[120px] truncate">{line.remarks || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(line)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => onDelete(line.id)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total Qty</td>
                <td className="px-3 py-2 tabular-nums font-bold text-slate-700">{totalOrdered}</td>
                <td className="px-3 py-2 tabular-nums font-bold text-slate-800">{totalActual}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        onClick={onAdd}
        className="mt-2 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add Row
      </button>
    </div>
  );
}

const inp = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[80px]';

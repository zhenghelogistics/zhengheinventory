import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { fmt } from '../../utils/movementHelpers';

const UNITS = ['pcs', 'box', 'carton', 'pallet', 'kg', 'bag', 'roll', 'set', 'drum', 'unit'];

export default function StockLinesTable({ lines, onAdd, onUpdate, onDelete, showCost = true }) {
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
      unit_cost: line.unit_cost ?? '',
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
      unit_cost: parseFloat(draft.unit_cost) || 0,
      remarks: draft.remarks,
    });
    setSaving(false);
    setEditId(null);
  }

  const totalValue = lines.reduce((s, l) => s + ((l.qty_actual || 0) * (l.unit_cost || 0)), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['SKU', 'Description', 'Unit', 'Qty Ordered', 'Qty Actual',
                ...(showCost ? ['Unit Cost (SGD)', 'Total (SGD)'] : []),
                'Remarks', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={showCost ? 9 : 7} className="px-3 py-6 text-center text-slate-400 text-xs">No stock lines yet. Click + Add Row below.</td>
              </tr>
            )}
            {lines.map((line) =>
              editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5"><input className={inputCls} value={draft.sku} onChange={(e) => setDraft((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU" /></td>
                  <td className="px-2 py-1.5"><input className={inputCls + ' min-w-[160px]'} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Description" /></td>
                  <td className="px-2 py-1.5">
                    <select className={inputCls} value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" className={inputCls} value={draft.qty_ordered} onChange={(e) => setDraft((p) => ({ ...p, qty_ordered: e.target.value }))} placeholder="0" /></td>
                  <td className="px-2 py-1.5"><input type="number" className={inputCls} value={draft.qty_actual} onChange={(e) => setDraft((p) => ({ ...p, qty_actual: e.target.value }))} placeholder="0" /></td>
                  {showCost && (
                    <>
                      <td className="px-2 py-1.5"><input type="number" step="0.01" className={inputCls} value={draft.unit_cost} onChange={(e) => setDraft((p) => ({ ...p, unit_cost: e.target.value }))} placeholder="0.00" /></td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-700">{fmt((parseFloat(draft.qty_actual) || 0) * (parseFloat(draft.unit_cost) || 0))}</td>
                    </>
                  )}
                  <td className="px-2 py-1.5"><input className={inputCls} value={draft.remarks} onChange={(e) => setDraft((p) => ({ ...p, remarks: e.target.value }))} placeholder="Remarks" /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50 group" onDoubleClick={() => startEdit(line)}>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{line.sku || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">{line.description || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{line.unit || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{line.qty_ordered ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{line.qty_actual ?? 0}</td>
                  {showCost && (
                    <>
                      <td className="px-3 py-2.5 tabular-nums text-slate-700">{fmt(line.unit_cost)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{fmt((line.qty_actual || 0) * (line.unit_cost || 0))}</td>
                    </>
                  )}
                  <td className="px-3 py-2.5 text-slate-500 max-w-[120px] truncate">{line.remarks || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(line)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"><Pencil size={11} /></button>
                      <button onClick={() => onDelete(line.id)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
          {showCost && lines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total Stock Value (SGD)</td>
                <td colSpan={3} className="px-3 py-2 tabular-nums font-bold text-slate-800 text-sm">S$ {fmt(totalValue)}</td>
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

const inputCls = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[80px]';

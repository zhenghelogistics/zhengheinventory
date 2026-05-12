import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2, FileDown } from 'lucide-react';
import { exportReleaseOrder } from '../../utils/pdfExports';

export default function ReleaseOrderTable({ lines, movement, onAdd, onUpdate, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function startEdit(line) {
    setEditId(line.id);
    setDraft({
      company_name: line.company_name || '',
      collector_name: line.collector_name || '',
      qty_out: line.qty_out ?? '',
      num_cartons: line.num_cartons ?? '',
      vehicle_number: line.vehicle_number || '',
    });
  }

  async function saveEdit() {
    setSaving(true);
    await onUpdate(editId, {
      company_name: draft.company_name,
      collector_name: draft.collector_name,
      qty_out: parseInt(draft.qty_out) || 0,
      num_cartons: parseInt(draft.num_cartons) || 0,
      vehicle_number: draft.vehicle_number,
    });
    setSaving(false);
    setEditId(null);
  }

  const COLS = ['Company', 'Collector / Driver', 'Qty Out', 'No. of Cartons', 'Vehicle No.', 'Company Stamp', ''];

  return (
    <div className="space-y-3">
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
                  No release orders yet. Click + Add Row below.
                </td>
              </tr>
            )}
            {lines.map((line) =>
              editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.company_name} onChange={(e) => setDraft((p) => ({ ...p, company_name: e.target.value }))} placeholder="Company name" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp + ' min-w-[140px]'} value={draft.collector_name} onChange={(e) => setDraft((p) => ({ ...p, collector_name: e.target.value }))} placeholder="Person collecting" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.qty_out} onChange={(e) => setDraft((p) => ({ ...p, qty_out: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.num_cartons} onChange={(e) => setDraft((p) => ({ ...p, num_cartons: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.vehicle_number} onChange={(e) => setDraft((p) => ({ ...p, vehicle_number: e.target.value }))} placeholder="e.g. SGX1234A" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="w-24 h-8 border border-dashed border-slate-300 rounded text-[9px] text-slate-300 flex items-center justify-center">stamp</div>
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
                  <td className="px-3 py-2.5 text-slate-700">{line.company_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700">{line.collector_name || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{line.qty_out ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{line.num_cartons ?? 0}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600">{line.vehicle_number || <span className="text-slate-300 italic">to fill</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="w-24 h-8 border border-dashed border-slate-300 rounded text-[9px] text-slate-300 flex items-center justify-center">stamp</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => exportReleaseOrder(movement, line)}
                        className="p-1.5 rounded hover:bg-violet-100 text-slate-400 hover:text-violet-600 transition-colors cursor-pointer"
                        title="Export PDF"
                      >
                        <FileDown size={11} />
                      </button>
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
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
        >
          <Plus size={13} strokeWidth={2.5} />
          Add Row
        </button>
        {lines.length > 0 && (
          <button
            onClick={() => lines.forEach((l) => exportReleaseOrder(movement, l))}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors cursor-pointer"
          >
            <FileDown size={13} strokeWidth={2.5} />
            Export All PDFs
          </button>
        )}
      </div>
    </div>
  );
}

const inp = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[80px]';

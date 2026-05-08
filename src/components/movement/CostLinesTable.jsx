import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { CURRENCIES, fmt, fmtDate } from '../../utils/movementHelpers';

const SERVICES = ['Trucking', 'Warehousing', 'Customs', 'Freight', 'Handling', 'Storage', 'Insurance', 'Other'];

const EMPTY_EDIT = {
  vendor: '', service: '', invoice_no: '', invoice_date: '',
  currency: 'SGD', amount_local: '', fx_rate: '', amount_sgd: '', total_payable: '', remarks: '',
};

export default function CostLinesTable({ lines, onAdd, onUpdate, onDelete, getRate }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function startEdit(line) {
    setEditId(line.id);
    setDraft({
      vendor: line.vendor || '',
      service: line.service || '',
      invoice_no: line.invoice_no || '',
      invoice_date: line.invoice_date || '',
      currency: line.currency || 'SGD',
      amount_local: line.amount_local ?? '',
      fx_rate: line.fx_rate ?? '',
      amount_sgd: line.amount_sgd ?? '',
      total_payable: line.total_payable ?? '',
      remarks: line.remarks || '',
    });
  }

  function handleDraftChange(field, value) {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'amount_local' || field === 'currency') {
        const amt = parseFloat(next.amount_local) || 0;
        const cur = next.currency || 'SGD';
        const rate = cur === 'SGD' ? 1 : (parseFloat(getRate(cur)) || 1);
        next.fx_rate = cur === 'SGD' ? 1 : rate;
        next.amount_sgd = cur === 'SGD' ? amt : (amt / rate);
        next.total_payable = next.amount_sgd;
      }
      if (field === 'fx_rate') {
        const amt = parseFloat(next.amount_local) || 0;
        const rate = parseFloat(value) || 1;
        next.amount_sgd = next.currency === 'SGD' ? amt : amt / rate;
        next.total_payable = next.amount_sgd;
      }
      return next;
    });
  }

  async function saveEdit() {
    setSaving(true);
    const fields = {
      vendor: draft.vendor,
      service: draft.service,
      invoice_no: draft.invoice_no,
      invoice_date: draft.invoice_date || null,
      currency: draft.currency,
      amount_local: parseFloat(draft.amount_local) || 0,
      fx_rate: parseFloat(draft.fx_rate) || 1,
      amount_sgd: parseFloat(draft.amount_sgd) || 0,
      total_payable: parseFloat(draft.total_payable) || 0,
      remarks: draft.remarks,
    };
    await onUpdate(editId, fields);
    setSaving(false);
    setEditId(null);
  }

  async function handleAdd() {
    await onAdd();
  }

  const totalSGD = lines.reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Vendor', 'Service', 'Invoice No.', 'Invoice Date', 'Currency', 'Amount (Local)', 'FX Rate', 'Amount (SGD)', 'Total Payable', 'Remarks', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-400 text-xs">No cost lines yet. Click + Add Row below.</td>
              </tr>
            )}
            {lines.map((line) =>
              editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5"><input className={inputCls} value={draft.vendor} onChange={(e) => handleDraftChange('vendor', e.target.value)} placeholder="Vendor" /></td>
                  <td className="px-2 py-1.5">
                    <select className={inputCls} value={draft.service} onChange={(e) => handleDraftChange('service', e.target.value)}>
                      <option value="">—</option>
                      {SERVICES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input className={inputCls} value={draft.invoice_no} onChange={(e) => handleDraftChange('invoice_no', e.target.value)} placeholder="Inv no." /></td>
                  <td className="px-2 py-1.5"><input type="date" className={inputCls} value={draft.invoice_date} onChange={(e) => handleDraftChange('invoice_date', e.target.value)} /></td>
                  <td className="px-2 py-1.5">
                    <select className={inputCls} value={draft.currency} onChange={(e) => handleDraftChange('currency', e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" className={inputCls} value={draft.amount_local} onChange={(e) => handleDraftChange('amount_local', e.target.value)} placeholder="0.00" /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.0001" className={inputCls} value={draft.fx_rate} onChange={(e) => handleDraftChange('fx_rate', e.target.value)} placeholder="1" /></td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-700">{fmt(parseFloat(draft.amount_sgd) || 0)}</td>
                  <td className="px-2 py-1.5 tabular-nums font-semibold text-slate-800">{fmt(parseFloat(draft.total_payable) || 0)}</td>
                  <td className="px-2 py-1.5"><input className={inputCls} value={draft.remarks} onChange={(e) => handleDraftChange('remarks', e.target.value)} placeholder="Remarks" /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50 group" onDoubleClick={() => startEdit(line)}>
                  <td className="px-3 py-2.5 text-slate-700">{line.vendor || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{line.service || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600">{line.invoice_no || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(line.invoice_date)}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-semibold text-slate-600">{line.currency || 'SGD'}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{fmt(line.amount_local)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{line.fx_rate || 1}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{fmt(line.amount_sgd)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{fmt(line.total_payable)}</td>
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
          {lines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={7} className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total Cost (SGD)</td>
                <td colSpan={3} className="px-3 py-2 tabular-nums font-bold text-slate-800 text-sm">S$ {fmt(totalSGD)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        onClick={handleAdd}
        className="mt-2 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add Row
      </button>
    </div>
  );
}

const inputCls = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[80px]';

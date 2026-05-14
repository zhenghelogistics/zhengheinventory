import { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { fmtDate } from '../../utils/movementHelpers';

const UNITS = ['pcs', 'box', 'carton', 'pallet', 'kg', 'bag', 'roll', 'set', 'drum', 'unit'];
const LINE_TYPES = ['Inbound', 'Replenishment', 'Outbound'];

const LINE_TYPE_COLORS = {
  'Inbound':       'bg-violet-100 text-violet-700',
  'Replenishment': 'bg-blue-100 text-blue-700',
  'Outbound':      'bg-orange-100 text-orange-700',
};

function isOut(line_type) {
  return line_type === 'Outbound';
}

function calcCBM(l, b, h, pkgs) {
  const lv = parseFloat(l) || 0;
  const bv = parseFloat(b) || 0;
  const hv = parseFloat(h) || 0;
  const pv = parseInt(pkgs) || 0;
  if (!lv || !bv || !hv || !pv) return null;
  return (lv * bv * hv * pv) / 1_000_000;
}

function fmtCBM(cbm) {
  return cbm != null ? cbm.toFixed(3) : '—';
}

export default function StockLinesTable({ lines, onAdd, onUpdate, onDelete }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  function startEdit(line) {
    setEditId(line.id);
    setDraft({
      line_type:    line.line_type    || 'Inbound',
      sku:          line.sku          || '',
      description:  line.description  || '',
      unit:         line.unit         || 'pcs',
      qty_actual:   line.qty_actual   ?? '',
      date_in:      line.date_in      || '',
      remarks:      line.remarks      || '',
      length_cm:    line.length_cm    ?? '',
      breadth_cm:   line.breadth_cm   ?? '',
      height_cm:    line.height_cm    ?? '',
      num_packages: line.num_packages ?? '',
    });
  }

  async function saveEdit() {
    setSaving(true);
    const qty = parseFloat(draft.qty_actual) || 0;
    await onUpdate(editId, {
      line_type:    draft.line_type,
      sku:          draft.sku,
      description:  draft.description,
      unit:         draft.unit,
      qty_actual:   isOut(draft.line_type) ? 0   : qty,
      qty_out:      isOut(draft.line_type) ? qty : 0,
      date_in:      isOut(draft.line_type) ? null : (draft.date_in || null),
      date_out:     isOut(draft.line_type) ? (draft.date_in || null) : null,
      remarks:      draft.remarks,
      length_cm:    parseFloat(draft.length_cm)   || null,
      breadth_cm:   parseFloat(draft.breadth_cm)  || null,
      height_cm:    parseFloat(draft.height_cm)   || null,
      num_packages: parseInt(draft.num_packages)  || null,
    });
    setSaving(false);
    setEditId(null);
  }

  // Overall balance
  const totalIn  = lines.filter((l) => !isOut(l.line_type)).reduce((s, l) => s + (Number(l.qty_actual) || 0), 0);
  const totalOut = lines.filter((l) =>  isOut(l.line_type)).reduce((s, l) => s + (Number(l.qty_out)    || 0), 0);
  const balance  = totalIn - totalOut;

  // Per-SKU balance map (keyed by sku, fallback to description)
  const skuBalMap = {};
  lines.forEach((line) => {
    const key = line.sku || line.description || String(line.id);
    skuBalMap[key] = (skuBalMap[key] || 0) + (
      isOut(line.line_type)
        ? -(Number(line.qty_out)    || 0)
        :  (Number(line.qty_actual) || 0)
    );
  });

  // Total CBM across all lines
  const totalCBM = lines.reduce((s, l) => {
    const c = calcCBM(l.length_cm, l.breadth_cm, l.height_cm, l.num_packages);
    return c ? s + c : s;
  }, 0);

  // Live CBM preview while editing
  const draftCBM = editId
    ? calcCBM(draft.length_cm, draft.breadth_cm, draft.height_cm, draft.num_packages)
    : null;

  const COLS = ['Event', 'SKU', 'Description', 'Unit', 'Qty', 'L × B × H (cm)', 'Pkgs', 'CBM', 'Balance', 'Date', 'Remarks', ''];

  return (
    <div className="space-y-3">
      {/* Summary pills */}
      {lines.length > 0 && (
        <div className="flex items-stretch gap-3 flex-wrap">
          <SummaryPill label="Total In"  value={`+${totalIn}`}  color="text-violet-700 bg-violet-50 border-violet-200" />
          <SummaryPill label="Total Out" value={`-${totalOut}`} color="text-orange-600 bg-orange-50 border-orange-200" />
          <SummaryPill
            label="Balance"
            value={balance}
            sub={balance < 0 ? 'over-dispatched' : balance === 0 ? 'fully out' : 'remaining'}
            color={balance > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : balance === 0 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200'}
            bold
          />
          {totalCBM > 0 && (
            <SummaryPill label="Total CBM" value={totalCBM.toFixed(3)} color="text-sky-700 bg-sky-50 border-sky-200" />
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
              const out     = isOut(line.line_type);
              const qty     = out ? (Number(line.qty_out) || 0) : (Number(line.qty_actual) || 0);
              const date    = out ? line.date_out : line.date_in;
              const lineCBM = calcCBM(line.length_cm, line.breadth_cm, line.height_cm, line.num_packages);
              const skuKey  = line.sku || line.description || String(line.id);
              const skuBal  = skuBalMap[skuKey] ?? 0;

              return editId === line.id ? (
                <tr key={line.id} className="bg-blue-50/60 border-b border-blue-100">
                  <td className="px-2 py-1.5">
                    <select className={inp} value={draft.line_type} onChange={(e) => setDraft((p) => ({ ...p, line_type: e.target.value }))}>
                      {LINE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.sku} onChange={(e) => setDraft((p) => ({ ...p, sku: e.target.value }))} placeholder="SKU" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp + ' min-w-[140px]'} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={inp} value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.qty_actual} onChange={(e) => setDraft((p) => ({ ...p, qty_actual: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 min-w-[190px]">
                      <input type="number" className={inp} value={draft.length_cm}  onChange={(e) => setDraft((p) => ({ ...p, length_cm:  e.target.value }))} placeholder="L" />
                      <span className="text-slate-400 shrink-0">×</span>
                      <input type="number" className={inp} value={draft.breadth_cm} onChange={(e) => setDraft((p) => ({ ...p, breadth_cm: e.target.value }))} placeholder="B" />
                      <span className="text-slate-400 shrink-0">×</span>
                      <input type="number" className={inp} value={draft.height_cm}  onChange={(e) => setDraft((p) => ({ ...p, height_cm:  e.target.value }))} placeholder="H" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" className={inp} value={draft.num_packages} onChange={(e) => setDraft((p) => ({ ...p, num_packages: e.target.value }))} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`font-mono font-semibold ${draftCBM ? 'text-sky-600' : 'text-slate-300'}`}>
                      {fmtCBM(draftCBM)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">—</td>
                  <td className="px-2 py-1.5">
                    <input type="date" className={inp} value={draft.date_in} onChange={(e) => setDraft((p) => ({ ...p, date_in: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={inp} value={draft.remarks} onChange={(e) => setDraft((p) => ({ ...p, remarks: e.target.value }))} placeholder="Remarks" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button onClick={saveEdit} disabled={saving} className="p-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"><X size={12} /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={line.id} className="border-b border-slate-100 hover:bg-slate-50 group transition-colors" onDoubleClick={() => startEdit(line)}>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${LINE_TYPE_COLORS[line.line_type] || 'bg-slate-100 text-slate-600'}`}>
                      {line.line_type || 'Inbound'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{line.sku || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">{line.description || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{line.unit || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">
                    <span className={out ? 'text-orange-600' : 'text-violet-700'}>
                      {out ? `-${qty}` : `+${qty}`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono">
                    {line.length_cm && line.breadth_cm && line.height_cm
                      ? `${line.length_cm} × ${line.breadth_cm} × ${line.height_cm}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums">{line.num_packages || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-sky-700">{fmtCBM(lineCBM)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">
                    <span className={skuBal > 0 ? 'text-emerald-600' : skuBal < 0 ? 'text-red-500' : 'text-slate-400'}>
                      {skuBal}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(date)}</td>
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
                <td className={`px-3 py-2.5 tabular-nums font-bold ${balance > 0 ? 'text-emerald-600' : balance === 0 ? 'text-slate-400' : 'text-red-500'}`}>
                  {balance}
                </td>
                <td colSpan={2} />
                <td className="px-3 py-2.5 tabular-nums font-bold text-sky-700">
                  {totalCBM > 0 ? totalCBM.toFixed(3) : '—'}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
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

const inp = 'w-full px-2 py-1 rounded border border-blue-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-blue-400 min-w-[60px]';

import { useState, useCallback } from 'react';
import { Plus, Check, X, Pencil, Trash2, ChevronDown, ChevronUp, MinusCircle, PlusCircle } from 'lucide-react';
import { fmtDate } from '../../utils/movementHelpers';
import { supabase } from '../../lib/supabase';

const UNITS = ['pcs', 'box', 'carton', 'pallet', 'kg', 'bag', 'roll', 'set', 'drum', 'unit'];
const LINE_TYPES = ['Inbound', 'Replenishment', 'Outbound'];

const LINE_TYPE_COLORS = {
  'Inbound':       'bg-violet-100 text-violet-700',
  'Replenishment': 'bg-blue-100 text-blue-700',
  'Outbound':      'bg-orange-100 text-orange-700',
};

function isOut(line_type) { return line_type === 'Outbound'; }

function calcCBM(l, b, h, pkgs) {
  const lv = parseFloat(l) || 0, bv = parseFloat(b) || 0;
  const hv = parseFloat(h) || 0, pv = parseInt(pkgs) || 0;
  if (!lv || !bv || !hv || !pv) return null;
  return (lv * bv * hv * pv) / 1_000_000;
}

function fmtCBM(cbm) { return cbm != null ? cbm.toFixed(3) : '—'; }

function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function logActivity(action_type, record_id, record_ref, details) {
  await supabase.from('warehouse_activity_log').insert({
    user_id: null,
    user_name: 'Hive',
    action_type,
    record_id: record_id ? String(record_id) : null,
    record_ref: record_ref || null,
    details,
  });
}

export default function StockLinesTable({ lines, onAdd, onUpdate, onDelete, movementNo }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activityMap, setActivityMap] = useState({});
  const [loadingActivity, setLoadingActivity] = useState(null);

  // Inline adjust state: { lineId, mode: '+' | '-', value, reason, busy }
  const [adjust, setAdjust] = useState(null);

  // Quick update modal: { lineId, mode: '+' | '-', qty: '', reason: '', busy: false }
  const [modal, setModal] = useState(null);

  function startEdit(line) {
    setEditId(line.id);
    setDraft({
      line_type:    line.line_type    || 'Inbound',
      nexus_job_no: line.nexus_job_no || '',
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
      nexus_job_no: draft.nexus_job_no || null,
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

  async function toggleExpand(lineId) {
    if (expandedId === lineId) { setExpandedId(null); return; }
    setExpandedId(lineId);
    if (!activityMap[lineId]) {
      setLoadingActivity(lineId);
      const { data } = await supabase
        .from('warehouse_activity_log')
        .select('*')
        .eq('record_id', lineId)
        .order('performed_at', { ascending: false })
        .limit(20);
      setActivityMap((prev) => ({ ...prev, [lineId]: data || [] }));
      setLoadingActivity(null);
    }
  }

  async function applyAdjust() {
    if (!adjust || adjust.busy) return;
    const qty = parseFloat(adjust.value);
    if (!qty || qty <= 0) return;
    const line = lines.find((l) => l.id === adjust.lineId);
    if (!line) return;

    setAdjust((a) => ({ ...a, busy: true }));

    if (adjust.mode === '+') {
      const newQty = (Number(line.qty_actual) || 0) + qty;
      await onUpdate(line.id, { qty_actual: newQty });
      await logActivity('hive_add_stock', line.id, movementNo, {
        sku: line.sku, description: line.description,
        added: qty, qty_before: Number(line.qty_actual) || 0, qty_after: newQty,
        reason: adjust.reason || null,
      });
      setActivityMap((prev) => ({ ...prev, [line.id]: undefined }));
    } else {
      // Create hidden outbound record
      const outbound = await onAdd({
        line_type: 'Outbound',
        sku: line.sku,
        description: line.description,
        unit: line.unit,
        nexus_job_no: line.nexus_job_no || null,
        qty_out: qty,
        qty_actual: 0,
        date_out: new Date().toISOString().slice(0, 10),
        remarks: adjust.reason || null,
      });
      if (outbound) {
        await logActivity('hive_dispatch_stock', line.id, movementNo, {
          sku: line.sku, description: line.description,
          dispatched: qty, reason: adjust.reason || null,
        });
        setActivityMap((prev) => ({ ...prev, [line.id]: undefined }));
      }
    }

    setAdjust(null);
  }

  async function applyModal() {
    if (!modal || modal.busy) return;
    const qty = parseFloat(modal.qty);
    if (!qty || qty <= 0) return;
    const line = lines.find((l) => l.id === modal.lineId);
    if (!line) return;

    setModal((m) => ({ ...m, busy: true }));

    if (modal.mode === '+') {
      const newQty = (Number(line.qty_actual) || 0) + qty;
      await onUpdate(line.id, { qty_actual: newQty });
      await logActivity('hive_add_stock', line.id, movementNo, {
        sku: line.sku, description: line.description,
        added: qty, qty_before: Number(line.qty_actual) || 0, qty_after: newQty,
        reason: modal.reason || null,
      });
    } else {
      const outbound = await onAdd({
        line_type: 'Outbound',
        sku: line.sku,
        description: line.description,
        unit: line.unit,
        nexus_job_no: line.nexus_job_no || null,
        qty_out: qty,
        qty_actual: 0,
        date_out: new Date().toISOString().slice(0, 10),
        remarks: modal.reason || null,
      });
      if (outbound) {
        await logActivity('hive_dispatch_stock', line.id, movementNo, {
          sku: line.sku, description: line.description,
          dispatched: qty, reason: modal.reason || null,
        });
      }
    }

    setModal(null);
  }

  // Split: show inbound/replenishment at top, outbound grouped by SKU for expand
  const topLines = lines.filter((l) => !isOut(l.line_type));
  const outboundLines = lines.filter((l) => isOut(l.line_type));

  // Per-SKU outbound total
  const outboundByKey = {};
  outboundLines.forEach((l) => {
    const key = l.sku || l.description || String(l.id);
    outboundByKey[key] = (outboundByKey[key] || []).concat(l);
  });

  // Summary totals
  const totalIn  = topLines.reduce((s, l) => s + (Number(l.qty_actual) || 0), 0);
  const totalOut = outboundLines.reduce((s, l) => s + (Number(l.qty_out) || 0), 0);
  const balance  = totalIn - totalOut;
  const totalCBM = topLines.reduce((s, l) => {
    const c = calcCBM(l.length_cm, l.breadth_cm, l.height_cm, l.num_packages);
    return c ? s + c : s;
  }, 0);

  const COLS = ['', 'Nexus Job', 'SKU', 'Description', 'Unit', 'Qty In', 'Dispatched', 'Balance', 'L × B × H (cm)', 'Pkgs', 'CBM', 'Date', 'Remarks', ''];

  return (
    <div className="space-y-3">
      {/* Summary pills */}
      {lines.length > 0 && (
        <div className="flex items-stretch gap-3 flex-wrap">
          <SummaryPill label="Total In"  value={`+${totalIn}`}  color="text-violet-700 bg-violet-50 border-violet-200" />
          <SummaryPill label="Dispatched" value={`-${totalOut}`} color="text-orange-600 bg-orange-50 border-orange-200" />
          <SummaryPill
            label="Balance" value={balance}
            sub={balance < 0 ? 'over-dispatched' : balance === 0 ? 'fully out' : 'remaining'}
            color={balance > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : balance === 0 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-red-600 bg-red-50 border-red-200'}
            bold
          />
          {totalCBM > 0 && <SummaryPill label="Total CBM" value={totalCBM.toFixed(3)} color="text-sky-700 bg-sky-50 border-sky-200" />}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLS.map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topLines.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-6 text-center text-slate-400 text-xs">
                  No stock lines yet. Click + Add Row below.
                </td>
              </tr>
            )}
            {topLines.map((line) => {
              const skuKey   = line.sku || line.description || String(line.id);
              const outRows  = outboundByKey[skuKey] || [];
              const dispatched = outRows.reduce((s, l) => s + (Number(l.qty_out) || 0), 0);
              const skuBal   = (Number(line.qty_actual) || 0) - dispatched;
              const lineCBM  = calcCBM(line.length_cm, line.breadth_cm, line.height_cm, line.num_packages);
              const isExpanded = expandedId === line.id;
              const isAdjusting = adjust?.lineId === line.id;

              return [
                // Main row
                editId === line.id ? (
                  <tr key={`${line.id}-edit`} className="bg-blue-50/60 border-b border-blue-100">
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5">
                      <input className={inp} value={draft.nexus_job_no} onChange={(e) => setDraft((p) => ({ ...p, nexus_job_no: e.target.value }))} placeholder="ZHL-000/00" />
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
                    <td className="px-2 py-1.5 text-slate-300">—</td>
                    <td className="px-2 py-1.5 text-slate-300">—</td>
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
                  <tr key={`${line.id}-view`} className={`border-b border-slate-100 hover:bg-slate-50 group transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                    {/* Expand toggle */}
                    <td className="px-2 py-2.5">
                      <button onClick={() => toggleExpand(line.id)} className="p-1 rounded hover:bg-slate-200 text-slate-400 cursor-pointer">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-blue-600 whitespace-nowrap">{line.nexus_job_no || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">{line.sku || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">{line.description || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{line.unit || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold text-violet-700">+{Number(line.qty_actual) || 0}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-orange-600">{dispatched > 0 ? `-${dispatched}` : '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold">
                      <span className={skuBal > 0 ? 'text-emerald-600' : skuBal < 0 ? 'text-red-500' : 'text-slate-400'}>{skuBal}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono">
                      {line.length_cm && line.breadth_cm && line.height_cm ? `${line.length_cm} × ${line.breadth_cm} × ${line.height_cm}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{line.num_packages || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-sky-700">{fmtCBM(lineCBM)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(line.date_in)}</td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-[100px] truncate">{line.remarks || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                        <button
                          onClick={() => setAdjust(isAdjusting && adjust.mode === '+' ? null : { lineId: line.id, mode: '+', value: '', reason: '', busy: false })}
                          className="p-1.5 rounded hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 cursor-pointer" title="Add stock"
                        ><PlusCircle size={12} /></button>
                        <button
                          onClick={() => setAdjust(isAdjusting && adjust.mode === '-' ? null : { lineId: line.id, mode: '-', value: '', reason: '', busy: false })}
                          className="p-1.5 rounded hover:bg-orange-100 text-slate-400 hover:text-orange-600 cursor-pointer" title="Dispatch"
                        ><MinusCircle size={12} /></button>
                        <button onClick={() => startEdit(line)} className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 cursor-pointer"><Pencil size={11} /></button>
                        <button onClick={() => onDelete(line.id)} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                ),

                // Inline adjust row
                isAdjusting && editId !== line.id ? (
                  <tr key={`${line.id}-adjust`} className={`border-b ${adjust.mode === '+' ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                    <td colSpan={COLS.length} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${adjust.mode === '+' ? 'text-emerald-700' : 'text-orange-700'}`}>
                          {adjust.mode === '+' ? 'Add stock to' : 'Dispatch from'} <span className="font-mono">{line.sku || line.description}</span>
                        </span>
                        <input
                          type="number"
                          autoFocus
                          className="px-2 py-1 rounded border border-slate-200 text-xs w-20 focus:outline-none focus:border-blue-400"
                          placeholder="Qty"
                          value={adjust.value}
                          onChange={(e) => setAdjust((a) => ({ ...a, value: e.target.value }))}
                        />
                        <input
                          className="px-2 py-1 rounded border border-slate-200 text-xs w-36 focus:outline-none focus:border-blue-400"
                          placeholder="Reason (optional)"
                          value={adjust.reason}
                          onChange={(e) => setAdjust((a) => ({ ...a, reason: e.target.value }))}
                        />
                        <button
                          onClick={applyAdjust}
                          disabled={adjust.busy || !adjust.value}
                          className={`px-3 py-1 rounded text-xs font-semibold text-white cursor-pointer disabled:opacity-50 ${adjust.mode === '+' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'}`}
                        >
                          {adjust.busy ? '…' : adjust.mode === '+' ? 'Add' : 'Dispatch'}
                        </button>
                        <button onClick={() => setAdjust(null)} className="p-1 rounded hover:bg-slate-200 text-slate-400 cursor-pointer"><X size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ) : null,

                // Expanded detail row
                isExpanded && editId !== line.id ? (
                  <tr key={`${line.id}-expand`} className="border-b border-slate-100 bg-slate-50/70">
                    <td colSpan={COLS.length} className="px-5 py-3">
                      <div className="space-y-3">
                        {/* Outbound dispatches */}
                        {outRows.length > 0 && (
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Dispatches</div>
                            <div className="space-y-1">
                              {outRows.map((o) => (
                                <div key={o.id} className="flex items-center gap-3 text-xs bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5">
                                  <span className="font-bold text-orange-600">-{Number(o.qty_out) || 0} {o.unit || ''}</span>
                                  <span className="text-slate-400">{fmtDate(o.date_out)}</span>
                                  {o.remarks && <span className="text-slate-500">{o.remarks}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activity log */}
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Activity</div>
                          {loadingActivity === line.id ? (
                            <div className="text-xs text-slate-400">Loading…</div>
                          ) : (activityMap[line.id] || []).length === 0 ? (
                            <div className="text-xs text-slate-300">No activity logged yet</div>
                          ) : (
                            <div className="space-y-1">
                              {(activityMap[line.id] || []).map((entry) => (
                                <div key={entry.id} className="flex items-center gap-3 text-xs bg-white border border-slate-100 rounded-lg px-3 py-1.5">
                                  <span className="font-semibold text-slate-700">{entry.user_name}</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                    entry.action_type === 'hive_add_stock' ? 'bg-emerald-100 text-emerald-700' :
                                    entry.action_type === 'hive_dispatch_stock' ? 'bg-orange-100 text-orange-700' :
                                    entry.action_type === 'pick_item' ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {entry.action_type === 'hive_add_stock' ? 'Added' :
                                     entry.action_type === 'hive_dispatch_stock' ? 'Dispatched' :
                                     entry.action_type === 'pick_item' ? 'Picked' : entry.action_type}
                                  </span>
                                  {entry.details?.added && <span className="text-emerald-600 font-semibold">+{entry.details.added}</span>}
                                  {entry.details?.dispatched && <span className="text-orange-600 font-semibold">-{entry.details.dispatched}</span>}
                                  {entry.details?.reason && <span className="text-slate-400">{entry.details.reason}</span>}
                                  <span className="text-slate-300 ml-auto">{fmtTs(entry.performed_at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ].filter(Boolean);
            })}
          </tbody>
          {topLines.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                <td colSpan={5} className="px-3 py-2.5 text-right text-xs text-slate-500">Totals</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-violet-700">+{totalIn}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-orange-600">{totalOut > 0 ? `-${totalOut}` : '—'}</td>
                <td className={`px-3 py-2.5 tabular-nums font-bold ${balance > 0 ? 'text-emerald-600' : balance === 0 ? 'text-slate-400' : 'text-red-500'}`}>{balance}</td>
                <td colSpan={2} />
                <td className="px-3 py-2.5 tabular-nums font-bold text-sky-700">{totalCBM > 0 ? totalCBM.toFixed(3) : '—'}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onAdd()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
          <Plus size={13} strokeWidth={2.5} />
          Add Row
        </button>
        {topLines.length > 0 && (
          <button
            onClick={() => setModal({ lineId: topLines[0].id, mode: '+', qty: '', reason: '', busy: false })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer border border-emerald-200"
          >
            <PlusCircle size={13} strokeWidth={2.5} />
            Update Stock
          </button>
        )}
      </div>

      {/* Quick Update Modal */}
      {modal && (() => {
        const selLine = topLines.find((l) => l.id === modal.lineId);
        const selOutRows = selLine ? (outboundByKey[selLine.sku || selLine.description || String(selLine.id)] || []) : [];
        const selBal = selLine ? (Number(selLine.qty_actual) || 0) - selOutRows.reduce((s, l) => s + (Number(l.qty_out) || 0), 0) : 0;
        const qtyNum = parseFloat(modal.qty) || 0;
        const afterBal = modal.mode === '+' ? selBal + qtyNum : selBal - qtyNum;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-slate-800 text-base">Update Stock</h3>
                <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"><X size={16} /></button>
              </div>

              {/* Add / Deduct toggle */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setModal((m) => ({ ...m, mode: '+' }))}
                  className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${modal.mode === '+' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'}`}
                >
                  <PlusCircle size={15} /> Add Stock
                </button>
                <button
                  onClick={() => setModal((m) => ({ ...m, mode: '-' }))}
                  className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${modal.mode === '-' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-red-50'}`}
                >
                  <MinusCircle size={15} /> Deduct
                </button>
              </div>

              {/* Item dropdown */}
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Item</label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400 cursor-pointer"
                  value={modal.lineId}
                  onChange={(e) => setModal((m) => ({ ...m, lineId: e.target.value }))}
                >
                  {topLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description || l.sku || '—'}{l.sku && l.description ? ` (${l.sku})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Quantity</label>
                <input
                  type="number"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-xl font-bold text-center focus:outline-none focus:border-blue-400"
                  placeholder="0"
                  value={modal.qty}
                  onChange={(e) => setModal((m) => ({ ...m, qty: e.target.value }))}
                />
              </div>

              {/* Reason */}
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Reason (optional)</label>
                <input
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-blue-400"
                  placeholder="e.g. damaged, recount"
                  value={modal.reason}
                  onChange={(e) => setModal((m) => ({ ...m, reason: e.target.value }))}
                />
              </div>

              {/* Balance preview */}
              {selLine && qtyNum > 0 && (
                <div className="flex items-center justify-center gap-4 bg-slate-50 rounded-xl py-3 mb-4">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Balance Now</div>
                    <div className="text-xl font-black text-slate-700">{selBal}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">After</div>
                    <div className={`text-xl font-black ${afterBal > selBal ? 'text-emerald-600' : afterBal < selBal ? 'text-red-500' : 'text-slate-400'}`}>{afterBal}</div>
                  </div>
                </div>
              )}

              <button
                onClick={applyModal}
                disabled={modal.busy || !modal.qty || parseFloat(modal.qty) <= 0}
                className={`w-full h-11 rounded-xl font-bold text-sm text-white cursor-pointer disabled:opacity-50 transition-colors ${modal.mode === '+' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {modal.busy ? 'Saving…' : modal.mode === '+' ? `Add ${modal.qty || 0} units` : `Deduct ${modal.qty || 0} units`}
              </button>
            </div>
          </div>
        );
      })()}
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

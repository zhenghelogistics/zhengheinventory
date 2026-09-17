import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientStock } from '../../hooks/useClientStock';
import { useClientOrders, useDeliveryPreview } from '../../hooks/useClientOrders';
import { fmt, fmtDate } from '../../utils/movementHelpers';

const inputCls =
  'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 ' +
  'placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition';

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ step, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-6 h-6 rounded-lg bg-teal-700 text-white text-xs font-black flex items-center justify-center shrink-0">
          {step}
        </div>
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function PortalOrderNew() {
  const navigate = useNavigate();
  const { rows, loading: stockLoading } = useClientStock();
  const { createOrder } = useClientOrders();
  const { preview } = useDeliveryPreview();

  const [qtys, setQtys] = useState({});      // { [product_id]: string }
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    poNumber: '', consigneeName: '', deliveryAddress: '', contactName: '',
    contactPhone: '', requestedDate: '', instructions: '', referenceNo: '', notes: '',
  });
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(null); };

  const available = useMemo(
    () => rows.filter((r) => Number(r.qty_available) > 0),
    [rows],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((r) =>
      [r.sku, r.description].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [available, search]);

  const selected = useMemo(() => {
    return Object.entries(qtys)
      .map(([productId, raw]) => {
        const row = rows.find((r) => r.product_id === productId);
        const qty = parseFloat(raw);
        return row && qty > 0 ? { row, qty } : null;
      })
      .filter(Boolean);
  }, [qtys, rows]);

  // Mirrors the GREATEST() in portal_create_order: the cut-off sets the
  // earliest possible date, and asking for a later one is honoured.
  const scheduledDate = useMemo(() => {
    const earliest = preview?.delivery_date;
    if (!earliest) return null;
    if (form.requestedDate && form.requestedDate > earliest) return form.requestedDate;
    return earliest;
  }, [preview, form.requestedDate]);

  const overAllocated = selected.filter(
    ({ row, qty }) => qty > Number(row.qty_available),
  );

  const canReview =
    selected.length > 0 && form.deliveryAddress.trim() && overAllocated.length === 0;

  function setQty(productId, value) {
    setError(null);
    setQtys((prev) => {
      const next = { ...prev };
      if (value === '' || Number(value) <= 0) delete next[productId];
      else next[productId] = value;
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await createOrder(
      selected.map(({ row, qty }) => ({ product_id: row.product_id, qty })),
      form,
    );
    setSubmitting(false);
    if (!res.ok) { setError(res.error); setReviewing(false); return; }
    navigate(`/portal/orders/${res.order.id}`, { replace: true });
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/portal/orders')}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 mb-4 cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to orders
      </button>

      <h1 className="text-xl font-black text-slate-800 mb-1">Create delivery request</h1>
      <p className="text-slate-500 text-xs mb-5">
        Choose what you need delivered, tell us where it's going, and we'll confirm the date.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* ── 1. Products ─────────────────────────────────────── */}
        <Section step="1" title="What would you like delivered?">
          {stockLoading ? (
            <p className="text-xs text-slate-400 py-4">Loading your stock…</p>
          ) : available.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              You have no stock available to order right now.
            </p>
          ) : (
            <>
              {available.length > 5 && (
                <input
                  className={`${inputCls} mb-3`}
                  placeholder="Search by SKU or product…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              <div className="space-y-1.5">
                {shown.map((r) => {
                  const raw = qtys[r.product_id] ?? '';
                  const qty = parseFloat(raw) || 0;
                  const avail = Number(r.qty_available);
                  const over = qty > avail;
                  return (
                    <div
                      key={r.product_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
                        over ? 'border-red-300 bg-red-50/50'
                             : qty > 0 ? 'border-teal-300 bg-teal-50/40'
                                       : 'border-slate-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-700 truncate">
                          {r.description || r.sku}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {r.sku}
                          {r.next_expiry_date && ` · earliest expiry ${fmtDate(r.next_expiry_date)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max={avail}
                          placeholder="0"
                          className={`w-20 h-9 px-2 rounded-lg border text-sm font-bold text-center focus:outline-none transition ${
                            over ? 'border-red-400 text-red-600'
                                 : 'border-slate-200 text-slate-700 focus:border-teal-500'
                          }`}
                          value={raw}
                          onChange={(e) => setQty(r.product_id, e.target.value)}
                        />
                        <span className="text-[10px] text-slate-400 w-14">
                          / {fmt(avail, 0)} {r.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {overAllocated.length > 0 && (
                <p className="text-[11px] text-red-600 font-semibold mt-2">
                  You've asked for more than is available on{' '}
                  {overAllocated.map(({ row }) => row.sku).join(', ')}.
                </p>
              )}
            </>
          )}
        </Section>

        {/* ── 2. Delivery ─────────────────────────────────────── */}
        <Section step="2" title="Where is it going?">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Delivery address" required>
                <textarea
                  rows={2}
                  className={`${inputCls} h-auto py-2.5 resize-y`}
                  placeholder="Blk 123 Marina Bay, #04-56, Singapore 018956"
                  value={form.deliveryAddress}
                  onChange={set('deliveryAddress')}
                />
              </Field>
            </div>
            <Field label="Consignee / customer">
              <input className={inputCls} placeholder="Who receives it" value={form.consigneeName} onChange={set('consigneeName')} />
            </Field>
            <Field label="Contact name">
              <input className={inputCls} placeholder="Person on site" value={form.contactName} onChange={set('contactName')} />
            </Field>
            <Field label="Contact number">
              <input className={inputCls} placeholder="+65 …" value={form.contactPhone} onChange={set('contactPhone')} />
            </Field>
            <Field label="Requested delivery date" hint="Leave blank for the earliest available.">
              <input
                type="date"
                className={inputCls}
                min={preview?.delivery_date || undefined}
                value={form.requestedDate}
                onChange={set('requestedDate')}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Delivery instructions">
                <input className={inputCls} placeholder="Loading bay, timing, access notes…" value={form.instructions} onChange={set('instructions')} />
              </Field>
            </div>
          </div>
        </Section>

        {/* ── 3. References ───────────────────────────────────── */}
        <Section step="3" title="Your references">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="PO number">
              <input className={inputCls} placeholder="PO-2026-0042" value={form.poNumber} onChange={set('poNumber')} />
            </Field>
            <Field label="Reference number" hint="e.g. a Shopify order number.">
              <input className={inputCls} placeholder="Shopify #SG1023" value={form.referenceNo} onChange={set('referenceNo')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <input className={inputCls} placeholder="Anything else we should know" value={form.notes} onChange={set('notes')} />
              </Field>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Summary bar ───────────────────────────────────────── */}
      <div className="sticky bottom-0 mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs">
            <div className="font-bold text-slate-800">
              {selected.length === 0
                ? 'Nothing selected yet'
                : `${selected.length} item${selected.length === 1 ? '' : 's'} · ${fmt(selected.reduce((s, x) => s + x.qty, 0), 0)} units`}
            </div>
            {scheduledDate && (
              <div className="text-slate-500 mt-0.5">
                Estimated delivery{' '}
                <span className="font-bold text-teal-700">{fmtDate(scheduledDate)}</span>
                {preview?.past_cutoff && !form.requestedDate &&
                  ` · today's ${String(preview.cutoff_time).slice(0, 5)} cut-off has passed`}
              </div>
            )}
          </div>
          <button
            onClick={() => setReviewing(true)}
            disabled={!canReview}
            className="px-5 h-10 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            Review order
          </button>
        </div>
      </div>

      {/* ── Confirmation ──────────────────────────────────────── */}
      {reviewing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-auto">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800">Confirm your request</h3>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="px-4 py-3 rounded-xl bg-teal-50 border border-teal-100">
                <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wide">
                  Scheduled delivery
                </div>
                <div className="text-lg font-black text-teal-900 mt-0.5">
                  {fmtDate(scheduledDate)}
                </div>
                <p className="text-[11px] text-teal-800/70 mt-1">
                  Based on our {String(preview?.cutoff_time || '13:00').slice(0, 5)} cut-off
                  {preview?.past_cutoff ? ", which has passed for today." : '.'}
                </p>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Items</div>
                <div className="space-y-1.5">
                  {selected.map(({ row, qty }) => (
                    <div key={row.product_id} className="flex justify-between text-xs">
                      <span className="text-slate-600 truncate mr-3">
                        {row.description || row.sku}
                        <span className="text-slate-400 font-mono ml-1.5">{row.sku}</span>
                      </span>
                      <span className="font-bold text-slate-800 shrink-0">
                        {fmt(qty, 0)} {row.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Deliver to</div>
                <p className="text-xs text-slate-600 whitespace-pre-line">
                  {form.consigneeName && <span className="font-semibold">{form.consigneeName}{'\n'}</span>}
                  {form.deliveryAddress}
                </p>
                {(form.contactName || form.contactPhone) && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {[form.contactName, form.contactPhone].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {(form.poNumber || form.referenceNo) && (
                <div className="text-[11px] text-slate-400">
                  {form.poNumber && <>PO {form.poNumber}</>}
                  {form.poNumber && form.referenceNo && ' · '}
                  {form.referenceNo && <>Ref {form.referenceNo}</>}
                </div>
              )}

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Submitting reserves this stock against your balance straight away.
                You can cancel until our warehouse accepts the request.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => setReviewing(false)}
                disabled={submitting}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 h-10 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

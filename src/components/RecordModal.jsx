import { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const EMPTY = {
  id: '', description: '', quantity: '', sku: '', dateIn: '', dateOut: '',
  numPackages: '', dimension: '', weight: '', expiryDate: '', customerName: '', remark: '',
};

function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1 text-slate-400 font-normal normal-case tracking-normal">{hint}</span>}
      </label>
      {children}
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}

const inputCls = (err) =>
  `px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 bg-slate-50 focus:bg-white ${
    err ? 'border-red-400 bg-red-50' : 'border-slate-200'
  }`;

export default function RecordModal({ record, nextId, onSave, onClose }) {
  const isEdit = !!record;
  const [form, setForm] = useState(
    record
      ? {
          id: String(record.id),
          description: record.description ?? '',
          quantity: String(record.quantity ?? 0),
          sku: record.sku ?? '',
          dateIn: record.dateIn ?? '',
          dateOut: record.dateOut ?? '',
          numPackages: String(record.numPackages ?? ''),
          dimension: record.dimension ?? '',
          weight: record.weight ?? '',
          expiryDate: record.expiryDate ?? '',
          customerName: record.customerName ?? '',
          remark: record.remark ?? '',
        }
      : { ...EMPTY, id: String(nextId) }
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // null | { type: 'success'|'error', msg: string }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    const errs = {};
    if (!form.description.trim()) errs.description = 'Description is required.';
    if (form.quantity === '' || Number(form.quantity) < 0) errs.quantity = 'Required, must be ≥ 0.';
    if (form.numPackages !== '' && Number(form.numPackages) < 0) errs.numPackages = 'Must be ≥ 0.';
    if (form.dateIn && form.dateOut && form.dateOut < form.dateIn)
      errs.dateOut = 'Date Out must be ≥ Date In.';
    if (!form.id || isNaN(Number(form.id))) errs.id = 'Must be a number.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setStatus({ type: 'error', msg: 'Please fix the errors above.' });
      return;
    }

    setSaving(true);
    setStatus(null);

    const data = {
      id: Number(form.id),
      description: form.description.trim(),
      quantity: Number(form.quantity),
      sku: form.sku.trim(),
      dateIn: form.dateIn || null,
      dateOut: form.dateOut || null,
      numPackages: form.numPackages === '' ? null : Number(form.numPackages),
      dimension: form.dimension.trim(),
      weight: form.weight.trim(),
      expiryDate: form.expiryDate || null,
      customerName: form.customerName.trim(),
      remark: form.remark.trim(),
    };

    // Hard UI timeout — stops the spinner no matter what
    let timedOut = false;
    const uiTimer = setTimeout(() => {
      timedOut = true;
      setSaving(false);
      setStatus({ type: 'error', msg: 'Request timed out — check your internet connection and try again.' });
    }, 12000);

    try {
      const ok = await onSave(data);
      clearTimeout(uiTimer);
      if (!timedOut) {
        if (ok === false) {
          setStatus({ type: 'error', msg: 'Save failed — check your connection and try again.' });
        }
      }
    } catch (err) {
      clearTimeout(uiTimer);
      if (!timedOut) {
        setStatus({ type: 'error', msg: err?.message ?? 'Unexpected error.' });
      }
    } finally {
      if (!timedOut) setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-6">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {isEdit ? 'Edit Record' : 'Add New Record'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? `Editing item #${record.id}` : 'Fill in the details below'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150 cursor-pointer"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Core */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Core Details</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="No." error={errors.id}>
                <input className={`${inputCls(errors.id)} tabular-nums`} value={form.id} onChange={set('id')} />
              </Field>
              <Field label="Description" required error={errors.description}>
                <input className={inputCls(errors.description)} value={form.description} onChange={set('description')} placeholder="Item name or description" />
              </Field>
              <Field label="Quantity" required error={errors.quantity}>
                <input type="number" min="0" className={`${inputCls(errors.quantity)} tabular-nums`} value={form.quantity} onChange={set('quantity')} placeholder="0" />
              </Field>
              <Field label="SKU">
                <input className={inputCls()} value={form.sku} onChange={set('sku')} placeholder="Stock keeping unit" />
              </Field>
            </div>
          </div>

          {/* Dates */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Dates</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Date In">
                <input type="date" className={inputCls()} value={form.dateIn} onChange={set('dateIn')} />
              </Field>
              <Field label="Date Out" error={errors.dateOut}>
                <input type="date" className={inputCls(errors.dateOut)} value={form.dateOut} onChange={set('dateOut')} />
              </Field>
              <Field label="Expiry Date">
                <input type="date" className={inputCls()} value={form.expiryDate} onChange={set('expiryDate')} />
              </Field>
            </div>
          </div>

          {/* Physical */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Physical</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="No. of Pkgs" error={errors.numPackages}>
                <input type="number" min="0" className={`${inputCls(errors.numPackages)} tabular-nums`} value={form.numPackages} onChange={set('numPackages')} placeholder="0" />
              </Field>
              <Field label="Dimension" hint="(free text)">
                <input className={inputCls()} placeholder="30x20x10 cm" value={form.dimension} onChange={set('dimension')} />
              </Field>
              <Field label="Weight" hint="(free text)">
                <input className={inputCls()} placeholder="2.5 kg" value={form.weight} onChange={set('weight')} />
              </Field>
            </div>
          </div>

          {/* Customer */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Customer & Notes</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer Name">
                <input className={inputCls()} value={form.customerName} onChange={set('customerName')} placeholder="Customer or company" />
              </Field>
              <Field label="Remark">
                <textarea rows={2} className={`${inputCls()} resize-none`} value={form.remark} onChange={set('remark')} placeholder="Additional notes…" />
              </Field>
            </div>
          </div>
        </div>

        {/* Inline status bar */}
        {status && (
          <div className={`flex-shrink-0 flex items-center gap-2 px-6 py-3 text-sm font-medium ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-t border-emerald-100'
              : 'bg-red-50 text-red-700 border-t border-red-100'
          }`}>
            {status.type === 'success'
              ? <CheckCircle2 size={15} strokeWidth={2} />
              : <AlertCircle size={15} strokeWidth={2} />}
            {status.msg}
          </div>
        )}

        {/* Sticky footer */}
        <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-white rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors duration-150 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-70 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer shadow-sm"
          >
            {saving && <Loader2 size={14} strokeWidth={2} className="animate-spin" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </form>
    </div>
  );
}

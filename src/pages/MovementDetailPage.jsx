import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Truck, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { useMovementDetail } from '../hooks/useMovementDetail';
import { useFXRates } from '../hooks/useFXRates';
import { fmt, fmtDate, STATUS_COLORS, TYPE_COLORS, CURRENCIES, calcMovementTotals } from '../utils/movementHelpers';
import { exportGRN, exportDO, exportInternalReport } from '../utils/pdfExports';
import CostLinesTable from '../components/movement/CostLinesTable';
import StockLinesTable from '../components/movement/StockLinesTable';
import ReleaseOrderTable from '../components/movement/ReleaseOrderTable';
import Toast from '../components/Toast';

const STATUSES = ['New', 'In Progress', 'Completed', 'Voided'];

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="text-sm font-bold text-slate-700">{title}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inp = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors';
const sel = inp + ' cursor-pointer';

export default function MovementDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getRate } = useFXRates();

  const {
    movement, costLines, stockLines, releaseOrders, loading, error,
    updateMovement,
    addCostLine, updateCostLine, deleteCostLine,
    addStockLine, updateStockLine, deleteStockLine,
    addReleaseOrder, updateReleaseOrder, deleteReleaseOrder,
  } = useMovementDetail(id);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  useEffect(() => {
    if (movement && !form) {
      setForm({
        type: movement.type || 'Inbound',
        status: movement.status || 'New',
        salesperson: movement.salesperson || '',
        date_in: movement.date_in || '',
        date_out: movement.date_out || '',
        // Supplier/Customer
        company_name: movement.company_name || '',
        contact_name: movement.contact_name || '',
        phone: movement.phone || '',
        customer_ref: movement.customer_ref || '',
        // Pickup
        pickup_address: movement.pickup_address || '',
        pickup_contact_name: movement.pickup_contact_name || '',
        pickup_contact_number: movement.pickup_contact_number || '',
        // Delivery
        delivery_address: movement.delivery_address || '',
        delivery_contact_name: movement.delivery_contact_name || '',
        delivery_contact_number: movement.delivery_contact_number || '',
        // Cargo
        commodity: movement.commodity || '',
        packages: movement.packages || '',
        weight_kg: movement.weight_kg || '',
        cbm: movement.cbm || '',
        // P&L
        total_sale: movement.total_sale || '',
        notes: movement.notes || '',
      });
    }
  }, [movement]);

  async function handleSave() {
    setSaving(true);
    const ok = await updateMovement({
      ...form,
      date_in: form.date_in || null,
      date_out: form.date_out || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      cbm: form.cbm ? parseFloat(form.cbm) : null,
      packages: form.packages ? parseInt(form.packages) : null,
      total_sale: form.total_sale ? parseFloat(form.total_sale) : null,
    });
    setSaving(false);
    setToast({ message: ok ? 'Movement saved.' : 'Save failed.', type: ok ? 'success' : 'error' });
  }

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-slate-400">
        <svg className="animate-spin w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span className="text-sm font-medium">Loading movement…</span>
      </div>
    );
  }

  const totalCost = costLines.reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);
  const sale = parseFloat(form.total_sale) || 0;
  const profit = sale - totalCost;
  const gp = sale > 0 ? ((profit / sale) * 100).toFixed(1) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/movements')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800 font-mono">{movement.movement_no || '—'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_COLORS[form.type] || 'bg-slate-100 text-slate-600'}`}>{form.type}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[form.status] || 'bg-slate-100 text-slate-600'}`}>{form.status}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {movement.company_name || 'No company'} · Last updated {fmtDate(movement.updated_at || movement.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* PDF Exports */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer">
              <FileText size={13} strokeWidth={2.5} />
              Export PDF
              <ChevronDown size={12} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 hidden group-hover:block z-30">
              <button
                onClick={() => exportGRN(movement, stockLines)}
                className="w-full text-left px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
              >
                <ClipboardList size={13} className="text-violet-500" />
                Goods Received Note (GRN)
              </button>
              <button
                onClick={() => exportDO(movement, stockLines)}
                className="w-full text-left px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
              >
                <Truck size={13} className="text-blue-500" />
                Delivery Order (DO)
              </button>
              <button
                onClick={() => exportInternalReport(movement, costLines, stockLines)}
                className="w-full text-left px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
              >
                <FileText size={13} className="text-emerald-500" />
                Internal Movement Report
              </button>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors cursor-pointer shadow-sm disabled:opacity-60"
          >
            <Save size={13} strokeWidth={2.5} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">

          {/* Movement Info */}
          <Section title="Movement Info">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Type">
                <select className={sel} value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {['Inbound', 'Outbound', 'Internal'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={sel} value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Date In">
                <input type="date" className={inp} value={form.date_in} onChange={(e) => set('date_in', e.target.value)} />
              </Field>
              <Field label="Date Out">
                <input type="date" className={inp} value={form.date_out} onChange={(e) => set('date_out', e.target.value)} />
              </Field>
              <Field label="Salesperson">
                <input className={inp} value={form.salesperson} onChange={(e) => set('salesperson', e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Customer Ref / PO No.">
                <input className={inp} value={form.customer_ref} onChange={(e) => set('customer_ref', e.target.value)} placeholder="e.g. PO-1234" />
              </Field>
              <Field label="Notes">
                <textarea rows={2} className={inp + ' resize-none col-span-2'} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes…" />
              </Field>
            </div>
          </Section>

          {/* Supplier / Customer */}
          <Section title="Supplier / Customer">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Company Name">
                <input className={inp} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Company" />
              </Field>
              <Field label="Contact Person">
                <input className={inp} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Phone / WhatsApp">
                <input className={inp} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+65 xxxx xxxx" />
              </Field>
            </div>
          </Section>

          {/* Pickup */}
          <Section title="Pickup Details" defaultOpen={false}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Pickup Address">
                <textarea rows={2} className={inp + ' resize-none'} value={form.pickup_address} onChange={(e) => set('pickup_address', e.target.value)} placeholder="Address" />
              </Field>
              <Field label="Pickup Contact">
                <input className={inp} value={form.pickup_contact_name} onChange={(e) => set('pickup_contact_name', e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Pickup Phone">
                <input className={inp} value={form.pickup_contact_number} onChange={(e) => set('pickup_contact_number', e.target.value)} placeholder="+65 xxxx xxxx" />
              </Field>
            </div>
          </Section>

          {/* Delivery */}
          <Section title="Delivery Details" defaultOpen={false}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Delivery Address">
                <textarea rows={2} className={inp + ' resize-none'} value={form.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} placeholder="Address" />
              </Field>
              <Field label="Delivery Contact">
                <input className={inp} value={form.delivery_contact_name} onChange={(e) => set('delivery_contact_name', e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Delivery Phone">
                <input className={inp} value={form.delivery_contact_number} onChange={(e) => set('delivery_contact_number', e.target.value)} placeholder="+65 xxxx xxxx" />
              </Field>
            </div>
          </Section>

          {/* Cargo Details */}
          <Section title="Cargo Details" defaultOpen={false}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Commodity">
                <input className={inp} value={form.commodity} onChange={(e) => set('commodity', e.target.value)} placeholder="e.g. Electronics" />
              </Field>
              <Field label="No. of Packages">
                <input type="number" className={inp} value={form.packages} onChange={(e) => set('packages', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Weight (kg)">
                <input type="number" step="0.1" className={inp} value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} placeholder="0.0" />
              </Field>
              <Field label="CBM">
                <input type="number" step="0.001" className={inp} value={form.cbm} onChange={(e) => set('cbm', e.target.value)} placeholder="0.000" />
              </Field>
            </div>
          </Section>

          {/* Cost Lines */}
          <Section title="Cost Lines">
            <CostLinesTable
              lines={costLines}
              onAdd={addCostLine}
              onUpdate={updateCostLine}
              onDelete={deleteCostLine}
              getRate={getRate}
            />
          </Section>

          {/* Stock Lines */}
          <Section title="Stock Lines">
            <StockLinesTable
              lines={stockLines}
              movementType={form.type}
              onAdd={addStockLine}
              onUpdate={updateStockLine}
              onDelete={deleteStockLine}
            />
          </Section>

          {/* Release Orders */}
          <Section title="Release Orders">
            <ReleaseOrderTable
              lines={releaseOrders}
              movement={movement}
              onAdd={addReleaseOrder}
              onUpdate={updateReleaseOrder}
              onDelete={deleteReleaseOrder}
            />
          </Section>

          {/* P&L Summary */}
          <Section title="P &amp; L Summary">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <Field label="Total Sale (SGD)">
                  <input
                    type="number"
                    step="0.01"
                    className={inp}
                    value={form.total_sale}
                    onChange={(e) => set('total_sale', e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <div className="flex gap-6 flex-wrap pb-1">
                <PLCell label="Total Cost (SGD)" value={`S$ ${fmt(totalCost)}`} color="text-slate-700" />
                <PLCell label="Total Sale (SGD)" value={`S$ ${fmt(sale)}`} color="text-slate-700" />
                <PLCell
                  label="Profit (SGD)"
                  value={`S$ ${fmt(profit)}`}
                  color={profit >= 0 ? 'text-emerald-600' : 'text-red-500'}
                />
                {gp !== null && (
                  <PLCell
                    label="GP%"
                    value={`${gp}%`}
                    color={parseFloat(gp) >= 0 ? 'text-emerald-600' : 'text-red-500'}
                  />
                )}
              </div>
            </div>
          </Section>

        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}

function PLCell({ label, value, color }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

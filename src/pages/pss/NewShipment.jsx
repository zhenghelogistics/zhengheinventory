import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { extractPurchaseOrder } from '../../services/extractionService';

const CONTAINER_TYPES = ["20' GP", "40' GP", "40' HC", "45' HC", "20' RF", "40' RF"];
const CURRENCIES = ['USD', 'SGD', 'EUR'];
const UNITS = ['PCS', 'CTN', 'PKG', 'SET', 'KG', 'MT', 'BOX', 'PAL'];

const emptyLine = () => ({
  _id: Math.random().toString(36).slice(2),
  description: '',
  hs_code: '',
  quantity: '',
  unit: 'PCS',
  unit_price: '',
  currency: 'USD',
  weight_kg: '',
});

function SectionHeader({ step, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
        {step}
      </div>
      <div>
        <div className="font-bold text-slate-800">{title}</div>
        {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );
}

const inp = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition-colors placeholder:text-slate-300';
const sel = inp + ' cursor-pointer';

export default function NewShipment() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [remarks, setRemarks] = useState('');

  // PO extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractStage, setExtractStage] = useState('');
  const [extractedPO, setExtractedPO] = useState(null);  // raw PO data for reference panel
  const [extractError, setExtractError] = useState(null);
  const fileInputRef = useRef(null);

  const [header, setHeader] = useState({
    ref: '',
    client: '',
    consignee: '',
    notify_party: '',
    date: new Date().toISOString().slice(0, 10),
    export_type: 'OEP',
  });

  const [shipping, setShipping] = useState({
    bl_number: '',
    carrier: '',
    vessel: '',
    voyage: '',
    pol: 'SINGAPORE',
    pod: '',
    final_destination: '',
    etd: '',
    container_no: '',
    seal_no: '',
    container_type: "40' HC",
  });

  const [lines, setLines] = useState([emptyLine()]);

  function setH(k, v) { setHeader((p) => ({ ...p, [k]: v })); }
  function setS(k, v) { setShipping((p) => ({ ...p, [k]: v })); }

  function setLine(id, k, v) {
    setLines((prev) => prev.map((l) => l._id === id ? { ...l, [k]: v } : l));
  }

  function addLine() { setLines((p) => [...p, emptyLine()]); }
  function removeLine(id) { setLines((p) => p.filter((l) => l._id !== id)); }

  const totalValue = lines.reduce((sum, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  const totalWeight = lines.reduce((sum, l) => sum + (parseFloat(l.weight_kg) || 0), 0);

  const currency = lines[0]?.currency || 'USD';

  async function handlePOUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setExtracting(true);
    setExtractError(null);
    setExtractedPO(null);
    try {
      const po = await extractPurchaseOrder(file, setExtractStage);
      setExtractedPO(po);

      // Pre-fill header
      setHeader((p) => ({
        ...p,
        ref: po.po_number || p.ref,
        client: po.consignee?.name || p.client,
        consignee: po.consignee?.name || p.consignee,
        notify_party: po.notify_party || p.notify_party,
        date: po.po_date || p.date,
      }));

      // Pre-fill shipping — POL from vendor country, POD from consignee country
      setShipping((p) => ({
        ...p,
        pol: po.from_country === 'China' ? 'NINGBO / SHANGHAI' : (po.from_country || p.pol),
        pod: po.to_country === 'Singapore' ? 'SINGAPORE' : (po.to_country || p.pod),
        final_destination: po.consignee?.address?.split(',').slice(-1)[0]?.trim() || p.final_destination,
      }));

      // Pre-fill product lines from PO items
      if (po.items?.length) {
        setLines(po.items.map((item) => ({
          _id: Math.random().toString(36).slice(2),
          description: [item.description, item.npbb ? `NPBB: ${item.npbb}` : null].filter(Boolean).join('\n'),
          hs_code: item.hs_code || '',
          quantity: String(item.quantity ?? ''),
          unit: item.uom || 'PCS',
          unit_price: String(item.unit_cost ?? ''),
          currency: po.currency || 'USD',
        })));
      }
    } catch (err) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
      setExtractStage('');
    }
  }

  async function handleSave(pssStatus) {
    setSaving(true);
    setSaveError(null);

    // 1. Create pss_shipments record
    const { data: shipment, error: shipErr } = await supabase
      .from('pss_shipments')
      .insert({
        po_number:         header.ref || null,
        po_date:           header.date || null,
        status:            pssStatus,
        export_type:       header.export_type,
        client_name:       header.client || null,
        consignee_name:    header.consignee || null,
        notify_party:      header.notify_party || null,
        vendor_name:       extractedPO?.vendor?.name || null,
        vendor_address:    extractedPO?.vendor?.address || null,
        vendor_contact:    extractedPO?.vendor?.contact || null,
        vendor_tel:        extractedPO?.vendor?.tel || null,
        shipment_date:     header.date || null,
        etd:               shipping.etd || null,
        carrier:           shipping.carrier || null,
        bl_number:         shipping.bl_number || null,
        vessel:            shipping.vessel || null,
        voyage:            shipping.voyage || null,
        pol:               shipping.pol || null,
        pod:               shipping.pod || null,
        final_destination: shipping.final_destination || null,
        container_type:    shipping.container_type || null,
        container_no:      shipping.container_no || null,
        seal_no:           shipping.seal_no || null,
        shipping_term:     extractedPO?.shipping_term || null,
        payment_term:      extractedPO?.payment_term || null,
        currency:          lines[0]?.currency || 'USD',
        sub_total:         extractedPO?.sub_total || null,
        freight:           extractedPO?.freight || null,
        grand_total:       extractedPO?.grand_total || totalValue || null,
        remarks:           remarks || null,
      })
      .select()
      .single();

    if (shipErr) {
      setSaveError(shipErr.message);
      setSaving(false);
      return;
    }

    // 2. Create pss_shipment_lines
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length > 0) {
      const { error: linesErr } = await supabase.from('pss_shipment_lines').insert(
        validLines.map((l, i) => ({
          shipment_id:   shipment.id,
          line_no:       i + 1,
          description:   l.description,
          hs_code:       l.hs_code || null,
          quantity:      parseFloat(l.quantity) || 0,
          unit:          l.unit || 'PCS',
          unit_price:    parseFloat(l.unit_price) || null,
          currency:      l.currency || 'USD',
          weight_kg:     parseFloat(l.weight_kg) || null,
          extended_cost: (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0) || null,
          sort_order:    i,
        }))
      );
      if (linesErr) {
        setSaveError(linesErr.message);
        setSaving(false);
        return;
      }
    }

    // 3. If submitted, create a linked Brood inbound movement
    if (pssStatus === 'Submitted') {
      const movNo = shipment.po_number || `PSS-${shipment.id.slice(0, 8).toUpperCase()}`;
      const { data: mov } = await supabase
        .from('movements')
        .insert({
          movement_no:      movNo,
          type:             'Inbound',
          status:           'New',
          source:           'PSS',
          company_name:     shipment.client_name,
          date_in:          shipment.etd,
        })
        .select()
        .single();

      if (mov) {
        // Link movement back to shipment
        await supabase.from('pss_shipments').update({ movement_id: mov.id }).eq('id', shipment.id);

        // Create stock_lines in Brood from PSS product lines
        if (validLines.length > 0) {
          await supabase.from('stock_lines').insert(
            validLines.map((l, i) => ({
              movement_id: mov.id,
              description: l.description,
              sku:         l.hs_code || null,
              qty_ordered: parseFloat(l.quantity) || 0,
              unit:        l.unit || 'PCS',
              sort_order:  i,
            }))
          );
        }
      }
    }

    setSaving(false);
    navigate('/pss');
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 pb-16">
      {/* Page header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-xl font-black text-slate-800">New Shipping Instruction</h1>
          <p className="text-slate-500 text-xs mt-0.5">Fill in all sections then save or submit for export permit</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-600">
          Draft
        </span>
      </div>

      {/* ── PO Upload Banner ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={handlePOUpload}
      />

      {extracting ? (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-5">
          <div className="w-5 h-5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin shrink-0" />
          <div>
            <div className="text-emerald-700 text-sm font-bold">Reading Purchase Order…</div>
            <div className="text-emerald-500 text-xs mt-0.5">{extractStage}</div>
          </div>
        </div>
      ) : extractError ? (
        <div className="flex items-center justify-between px-5 py-4 rounded-xl bg-red-50 border border-red-200 mb-5">
          <div>
            <div className="text-red-600 text-sm font-bold">Extraction failed</div>
            <div className="text-red-500 text-xs mt-0.5">{extractError}</div>
          </div>
          <button onClick={() => setExtractError(null)} className="text-red-400 text-xs underline cursor-pointer shrink-0 ml-4">Dismiss</button>
        </div>
      ) : extractedPO ? (
        <div className="px-5 py-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-emerald-700 text-sm font-bold">PO extracted — form pre-filled</span>
              </div>
              <div className="text-xs text-emerald-600 space-y-0.5">
                <div><span className="font-semibold">PO:</span> {extractedPO.po_number}</div>
                <div><span className="font-semibold">Vendor:</span> {extractedPO.vendor?.name}</div>
                <div><span className="font-semibold">Items:</span> {extractedPO.items?.length} line(s) · Total {extractedPO.currency} {extractedPO.grand_total?.toLocaleString()}</div>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-emerald-600 text-xs font-semibold underline cursor-pointer shrink-0"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-3 px-5 py-4 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 text-emerald-600 font-bold text-sm cursor-pointer transition-colors mb-5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Upload Purchase Order PDF — AI will pre-fill all fields
        </button>
      )}

      <div className="space-y-5">

        {/* ── Section 1: Shipment Header ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader step={1} title="Shipment Header" subtitle="Parties and basic identifiers" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Internal Reference" hint="Leave blank to auto-generate">
              <input className={inp} value={header.ref} onChange={(e) => setH('ref', e.target.value)} placeholder="e.g. SI-2026-0042" />
            </Field>
            <Field label="Export Type" required>
              <select className={sel} value={header.export_type} onChange={(e) => setH('export_type', e.target.value)}>
                <option value="OEP">OEP — Ordinary Export Permit</option>
                <option value="AEP">AEP — Advance Export Permit</option>
                <option value="NIL">NIL — No Permit Required</option>
              </select>
            </Field>
            <Field label="Exporter / Client" required>
              <input className={inp} value={header.client} onChange={(e) => setH('client', e.target.value)} placeholder="Company name" />
            </Field>
            <Field label="Shipment Date" required>
              <input type="date" className={inp} value={header.date} onChange={(e) => setH('date', e.target.value)} />
            </Field>
            <Field label="Consignee" required>
              <input className={inp} value={header.consignee} onChange={(e) => setH('consignee', e.target.value)} placeholder="Receiving party name" />
            </Field>
            <Field label="Notify Party">
              <input className={inp} value={header.notify_party} onChange={(e) => setH('notify_party', e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </div>

        {/* ── Section 2: Shipping Details ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader step={2} title="Shipping Details" subtitle="Vessel, route, and container information" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Carrier" required>
              <input className={inp} value={shipping.carrier} onChange={(e) => setS('carrier', e.target.value)} placeholder="e.g. MSC, ONE, OOCL" />
            </Field>
            <Field label="BL Number">
              <input className={inp} value={shipping.bl_number} onChange={(e) => setS('bl_number', e.target.value)} placeholder="e.g. MEDUG6123456" />
            </Field>
            <Field label="ETD" required>
              <input type="date" className={inp} value={shipping.etd} onChange={(e) => setS('etd', e.target.value)} />
            </Field>
            <Field label="Vessel Name" required>
              <input className={inp} value={shipping.vessel} onChange={(e) => setS('vessel', e.target.value)} placeholder="e.g. MSC ANTWERP" />
            </Field>
            <Field label="Voyage No" required>
              <input className={inp} value={shipping.voyage} onChange={(e) => setS('voyage', e.target.value)} placeholder="e.g. 626N" />
            </Field>
            <Field label="Port of Loading">
              <input className={inp} value={shipping.pol} onChange={(e) => setS('pol', e.target.value)} />
            </Field>
            <Field label="Port of Discharge" required>
              <input className={inp} value={shipping.pod} onChange={(e) => setS('pod', e.target.value)} placeholder="e.g. MAKASSAR" />
            </Field>
            <Field label="Final Destination">
              <input className={inp} value={shipping.final_destination} onChange={(e) => setS('final_destination', e.target.value)} placeholder="If different from POD" />
            </Field>
            <Field label="Container Type">
              <select className={sel} value={shipping.container_type} onChange={(e) => setS('container_type', e.target.value)}>
                {CONTAINER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Container No">
              <input className={inp} value={shipping.container_no} onChange={(e) => setS('container_no', e.target.value)} placeholder="e.g. MSCU1234567" />
            </Field>
            <Field label="Seal No">
              <input className={inp} value={shipping.seal_no} onChange={(e) => setS('seal_no', e.target.value)} placeholder="e.g. SG123456" />
            </Field>
          </div>
        </div>

        {/* ── Section 3: Product Lines ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader step={3} title="Product Lines" subtitle="Each row = one HS code item. Add as many rows as needed." />

          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.7fr_auto] gap-2 mb-2 px-1">
            {['Description', 'HS Code', 'Qty', 'Unit', 'Unit Price', 'Currency', 'Wt (KG)', ''].map((h) => (
              <div key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{h}</div>
            ))}
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={line._id} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.7fr_auto] gap-2 items-center p-3 sm:p-1 rounded-lg sm:rounded-none border sm:border-0 border-slate-100">
                {/* Mobile label */}
                <div className="sm:hidden text-[10px] font-bold text-slate-400 mb-1">Item {idx + 1}</div>

                <input
                  className={inp}
                  value={line.description}
                  onChange={(e) => setLine(line._id, 'description', e.target.value)}
                  placeholder="Product description"
                />
                <input
                  className={`${inp} font-mono`}
                  value={line.hs_code}
                  onChange={(e) => setLine(line._id, 'hs_code', e.target.value)}
                  placeholder="0000.00"
                />
                <input
                  type="number"
                  className={`${inp} tabular-nums`}
                  value={line.quantity}
                  onChange={(e) => setLine(line._id, 'quantity', e.target.value)}
                  placeholder="0"
                  min="0"
                />
                <select className={sel} value={line.unit} onChange={(e) => setLine(line._id, 'unit', e.target.value)}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
                <input
                  type="number"
                  className={`${inp} tabular-nums`}
                  value={line.unit_price}
                  onChange={(e) => setLine(line._id, 'unit_price', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
                <select className={sel} value={line.currency} onChange={(e) => setLine(line._id, 'currency', e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  className={`${inp} tabular-nums`}
                  value={line.weight_kg}
                  onChange={(e) => setLine(line._id, 'weight_kg', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
                <button
                  onClick={() => lines.length > 1 && removeLine(line._id)}
                  disabled={lines.length === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-30 cursor-pointer transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={addLine}
              className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold hover:text-emerald-700 cursor-pointer transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Item
            </button>
            <div className="flex items-center gap-6">
              {totalWeight > 0 && (
                <div className="text-right">
                  <div className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide">Total Weight</div>
                  <div className="text-lg font-black text-slate-800 tabular-nums">
                    {totalWeight.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-semibold text-slate-400">KG</span>
                  </div>
                </div>
              )}
              {totalValue > 0 && (
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Total FOB Value</div>
                  <div className="text-lg font-black text-slate-800 tabular-nums">
                    {totalValue.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-semibold text-slate-400">{currency}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 4: Remarks ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <SectionHeader step={4} title="Remarks" subtitle="Internal notes, special handling instructions, or customs notes" />
          <textarea
            className={`${inp} resize-none`}
            rows={3}
            placeholder="Optional — any special notes for this shipment"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {/* ── Action bar ── */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-5 py-3 flex flex-col gap-2 z-40">
          {saveError && (
            <div className="text-red-600 text-xs font-semibold text-center">{saveError}</div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => navigate('/pss')}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave('Draft')}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={() => handleSave('Submitted')}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Submit for Permit</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

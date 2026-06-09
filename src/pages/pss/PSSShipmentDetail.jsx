import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { extractPermit } from '../../services/extractionService';

const STATUS_ORDER = ['Draft', 'Submitted', 'Permit Issued', 'Completed'];
const STATUS_STYLES = {
  'Draft':         'bg-slate-100 text-slate-600',
  'Submitted':     'bg-amber-100 text-amber-700',
  'Permit Issued': 'bg-emerald-100 text-emerald-700',
  'Completed':     'bg-blue-100 text-blue-700',
};

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-semibold shrink-0 w-36">{label}</span>
      <span className="text-xs text-slate-700 font-semibold text-right">{value}</span>
    </div>
  );
}

export default function PSSShipmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [creatingMovement, setCreatingMovement] = useState(false);
  const [movementError, setMovementError] = useState(null);
  const [warehouseLines, setWarehouseLines] = useState([]);
  const [warehouseConf, setWarehouseConf] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [permitProgress, setPermitProgress] = useState('');
  const [permitExtracting, setPermitExtracting] = useState(false);
  const [permitExtracted, setPermitExtracted] = useState(null);
  const [applyingPermit, setApplyingPermit] = useState(false);
  const permitInputRef = useRef(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('pss_shipments').select('*').eq('id', id).single(),
      supabase.from('pss_shipment_lines').select('*').eq('shipment_id', id).order('sort_order'),
    ]);
    setShipment(s);
    setLines(l || []);

    if (s?.movement_id) {
      const [{ data: wl }, { data: wc }] = await Promise.all([
        supabase.from('stock_lines').select('*').eq('movement_id', s.movement_id).order('sort_order').order('created_at'),
        supabase.from('delivery_confirmations').select('*').eq('movement_id', s.movement_id).maybeSingle(),
      ]);
      setWarehouseLines(wl || []);
      setWarehouseConf(wc || null);
    }

    setLoading(false);
  }

  async function resolveDiscrepancy(action) {
    if (!shipment?.id) return;
    setResolving(true);
    await supabase.from('pss_shipments')
      .update({ discrepancy_status: action })
      .eq('id', shipment.id);
    setShipment((p) => ({ ...p, discrepancy_status: action }));
    setResolving(false);
  }

  async function handlePermitFile(file) {
    if (!file) return;
    setPermitExtracting(true);
    setPermitExtracted(null);
    setPermitProgress('');
    try {
      // Upload to Supabase Storage (non-blocking — skip if bucket missing)
      let pdfUrl = null;
      try {
        const path = `${id}/permit-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage.from('permit-pdfs').upload(path, file, { upsert: true, contentType: 'application/pdf' });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('permit-pdfs').getPublicUrl(path);
          pdfUrl = publicUrl;
          await supabase.from('pss_shipments').update({ permit_pdf_url: pdfUrl }).eq('id', id);
          setShipment((p) => ({ ...p, permit_pdf_url: pdfUrl }));
        }
      } catch { /* storage bucket may not exist yet — continue to extraction */ }

      const data = await extractPermit(file, (msg) => setPermitProgress(msg));
      setPermitExtracted(data);
    } catch (err) {
      setPermitProgress(`Error: ${err.message}`);
    } finally {
      setPermitExtracting(false);
    }
  }

  async function applyPermitData() {
    if (!permitExtracted || !shipment?.id) return;
    setApplyingPermit(true);
    const updates = {
      permit_number:     permitExtracted.permit_number || null,
      permit_issue_date: permitExtracted.issue_date || permitExtracted.declaration_date || null,
      permit_valid_until: permitExtracted.valid_until || null,
      permit_data:       permitExtracted,
      permit_uploaded_at: new Date().toISOString(),
      // Backfill shipping fields if currently empty
      ...((!shipment.bl_number && permitExtracted.bl_number) ? { bl_number: permitExtracted.bl_number } : {}),
      ...((!shipment.vessel && permitExtracted.vessel) ? { vessel: permitExtracted.vessel } : {}),
      ...((!shipment.voyage && permitExtracted.voyage) ? { voyage: permitExtracted.voyage } : {}),
      ...((!shipment.container_no && permitExtracted.container_no) ? { container_no: permitExtracted.container_no } : {}),
    };
    await supabase.from('pss_shipments').update(updates).eq('id', id);
    setShipment((p) => ({ ...p, ...updates }));
    setPermitExtracted(null);
    setApplyingPermit(false);
  }

  async function deleteEntry() {
    setDeleting(true);
    setDeleteError(null);

    // If a Brood movement exists, check its status before allowing delete
    if (shipment.movement_id) {
      const { data: mov } = await supabase
        .from('movements')
        .select('id, status')
        .eq('id', shipment.movement_id)
        .single();

      if (mov && mov.status !== 'New') {
        setDeleteError('Cannot delete — warehouse has already started processing this shipment. Contact operations to cancel.');
        setDeleting(false);
        setDeleteConfirm(false);
        return;
      }

      // Safe to delete: remove stock_lines and the movement
      await supabase.from('stock_lines').delete().eq('movement_id', shipment.movement_id);
      await supabase.from('delivery_confirmations').delete().eq('movement_id', shipment.movement_id);
      await supabase.from('movements').delete().eq('id', shipment.movement_id);
    }

    // Delete PSS lines then shipment (lines cascade but explicit is safer)
    await supabase.from('pss_shipment_lines').delete().eq('shipment_id', id);
    const { error } = await supabase.from('pss_shipments').delete().eq('id', id);
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }

    navigate('/pss');
  }

  async function advanceStatus() {
    if (!shipment) return;
    const idx = STATUS_ORDER.indexOf(shipment.status);
    const next = STATUS_ORDER[idx + 1];
    if (!next) return;
    setUpdating(true);
    await supabase.from('pss_shipments').update({ status: next }).eq('id', id);
    setShipment((p) => ({ ...p, status: next }));
    setUpdating(false);
  }

  async function createBroodMovement() {
    if (!shipment || shipment.movement_id) return;
    setCreatingMovement(true);
    setMovementError(null);

    const movNo = shipment.po_number || `PSS-${shipment.id.slice(0, 8).toUpperCase()}`;

    const { data: mov, error: movErr } = await supabase
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

    if (movErr || !mov) {
      setMovementError(movErr?.message || 'Failed to create movement');
      setCreatingMovement(false);
      return;
    }

    // Create stock_lines in Brood from PSS product lines
    if (lines.length > 0) {
      const { error: linesErr } = await supabase.from('stock_lines').insert(
        lines.map((l, i) => ({
          movement_id: mov.id,
          description: l.description,
          sku:         l.hs_code || null,
          qty_ordered: parseFloat(l.quantity) || 0,
          unit:        l.unit || 'PCS',
          weight_kg:   parseFloat(l.weight_kg) || null,
          sort_order:  i,
        }))
      );
      if (linesErr) {
        setMovementError(`Movement created but product lines failed to sync: ${linesErr.message}. Brood can still confirm receipt.`);
      }
    }

    // Link movement back to this PSS shipment
    const { error: linkErr } = await supabase.from('pss_shipments').update({ movement_id: mov.id }).eq('id', id);
    if (linkErr) {
      setMovementError(`Movement created but link failed: ${linkErr.message}`);
      setCreatingMovement(false);
      return;
    }
    setShipment((p) => ({ ...p, movement_id: mov.id }));
    setCreatingMovement(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10 text-center">
        <p className="text-slate-500 text-sm mb-4">Shipment not found.</p>
        <button onClick={() => navigate('/pss')} className="text-emerald-600 text-sm font-semibold cursor-pointer">← Back</button>
      </div>
    );
  }

  const statusIdx = STATUS_ORDER.indexOf(shipment.status);
  const nextStatus = STATUS_ORDER[statusIdx + 1];
  const totalValue = lines.reduce((s, l) => s + (parseFloat(l.extended_cost) || 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-5 py-6 pb-10 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/pss')}
            className="text-emerald-600 text-sm font-semibold flex items-center gap-1 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          {!deleteConfirm ? (
            <button
              onClick={() => { setDeleteConfirm(true); setDeleteError(null); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-600 cursor-pointer px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Delete Entry
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">Are you sure?</span>
              <button onClick={() => { setDeleteConfirm(false); setDeleteError(null); }} className="text-xs font-bold text-slate-400 cursor-pointer px-2 py-1 hover:text-slate-600">Cancel</button>
              <button
                onClick={deleteEntry}
                disabled={deleting}
                className="text-xs font-black text-white bg-red-600 hover:bg-red-700 cursor-pointer px-3 py-1.5 rounded-lg disabled:opacity-60 flex items-center gap-1"
              >
                {deleting ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          )}
        </div>
        {deleteError && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
            {deleteError}
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-800 font-mono">{shipment.po_number || 'No reference'}</h1>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[shipment.status] || 'bg-slate-100 text-slate-500'}`}>
                {shipment.status}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {shipment.export_type}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">{shipment.client_name || '—'}</p>
            <p className="text-slate-400 text-xs mt-0.5">{shipment.shipment_date || shipment.created_at?.slice(0, 10)}</p>
          </div>

          {nextStatus && (
            <button
              onClick={advanceStatus}
              disabled={updating}
              className="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
            >
              {updating ? 'Updating…' : `Mark as ${nextStatus}`}
            </button>
          )}
        </div>
      </div>

      {/* Status progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-0">
          {STATUS_ORDER.map((s, i) => {
            const done = statusIdx >= i;
            const current = statusIdx === i;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'} ${current ? 'ring-2 ring-emerald-300 ring-offset-1' : ''}`}>
                    {done
                      ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : i + 1}
                  </div>
                  <span className={`text-[9px] font-bold text-center whitespace-nowrap ${done ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
                </div>
                {i < STATUS_ORDER.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${statusIdx > i ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Parties */}
      <Section title="Parties">
        <Row label="Client / Exporter" value={shipment.client_name} />
        <Row label="Consignee" value={shipment.consignee_name} />
        <Row label="Consignee Address" value={shipment.consignee_address} />
        <Row label="Notify Party" value={shipment.notify_party} />
        <Row label="Vendor" value={shipment.vendor_name} />
        <Row label="Vendor Address" value={shipment.vendor_address} />
        <Row label="Vendor Contact" value={shipment.vendor_contact} />
        <Row label="Vendor Tel" value={shipment.vendor_tel} />
      </Section>

      {/* Shipping */}
      <Section title="Shipping Details">
        <Row label="Carrier" value={shipment.carrier} />
        <Row label="BL Number" value={shipment.bl_number} />
        <Row label="ETD" value={shipment.etd} />
        <Row label="Vessel" value={shipment.vessel} />
        <Row label="Voyage" value={shipment.voyage} />
        <Row label="Port of Loading" value={shipment.pol} />
        <Row label="Port of Discharge" value={shipment.pod} />
        <Row label="Final Destination" value={shipment.final_destination} />
        <Row label="Container Type" value={shipment.container_type} />
        <Row label="Container No" value={shipment.container_no} />
        <Row label="Seal No" value={shipment.seal_no} />
        <Row label="Shipping Term" value={shipment.shipping_term} />
        <Row label="Payment Term" value={shipment.payment_term} />
      </Section>

      {/* Product lines */}
      <Section title={`Product Lines (${lines.length})`}>
        {lines.length === 0 ? (
          <p className="text-slate-400 text-xs text-center py-4">No lines recorded.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[540px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['#', 'Description', 'HS Code', 'Qty', 'Unit', 'Unit Price', 'Total'].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-slate-400 uppercase tracking-wide pb-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 text-slate-400 tabular-nums">{l.line_no || i + 1}</td>
                    <td className="py-2 pr-3 text-slate-700 font-semibold max-w-[200px]">
                      <div className="whitespace-pre-line leading-snug">{l.description}</div>
                      {l.npbb && <div className="text-[9px] text-slate-400 font-mono mt-0.5">{l.npbb}</div>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-500">{l.hs_code || '—'}</td>
                    <td className="py-2 pr-3 tabular-nums font-bold text-slate-700">{l.quantity}</td>
                    <td className="py-2 pr-3 text-slate-500">{l.unit}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{l.unit_price != null ? `${l.currency} ${Number(l.unit_price).toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td className="py-2 tabular-nums font-bold text-slate-700">{l.extended_cost != null ? `${l.currency} ${Number(l.extended_cost).toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {totalValue > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={6} className="pt-3 text-xs font-bold text-slate-500 text-right pr-3">Total FOB</td>
                    <td className="pt-3 font-black text-slate-800 tabular-nums">
                      {(lines[0]?.currency || 'USD')} {totalValue.toLocaleString('en-SG', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Section>

      {/* Financials */}
      {(shipment.sub_total || shipment.freight || shipment.grand_total) && (
        <Section title="Financials">
          <Row label="Currency" value={shipment.currency} />
          <Row label="Sub Total" value={shipment.sub_total != null ? `${shipment.currency} ${Number(shipment.sub_total).toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : null} />
          <Row label="Freight" value={shipment.freight != null ? `${shipment.currency} ${Number(shipment.freight).toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : null} />
          <Row label="Grand Total" value={shipment.grand_total != null ? `${shipment.currency} ${Number(shipment.grand_total).toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : null} />
        </Section>
      )}

      {/* Remarks */}
      {shipment.remarks && (
        <Section title="Remarks">
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{shipment.remarks}</p>
        </Section>
      )}

      {/* Warehouse confirmation dock — visible once handover is confirmed */}
      {shipment.movement_id && (
        <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/30 overflow-hidden">
          {/* Dock header */}
          <div className="px-5 py-3 bg-teal-700 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h.01M7 20v-4"/><path d="M12 20V10"/><path d="M17 20V4"/><path d="M22 20h.01"/>
            </svg>
            <span className="text-white text-xs font-black uppercase tracking-widest">Warehouse Confirmation</span>
            {shipment.report_sent_at && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                Report sent {new Date(shipment.report_sent_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="p-5 space-y-4">
            {/* 3FA status pips */}
            <div className="flex items-center justify-around">
              {[
                { label: 'Ground Staff', ts: warehouseConf?.factor1_confirmed_at, name: warehouseConf?.factor1_user_name },
                { label: 'Admin', ts: warehouseConf?.factor2_confirmed_at, name: warehouseConf?.factor2_user_name },
                { label: 'Driver Sign', ts: warehouseConf?.factor3_confirmed_at, name: warehouseConf?.inbound_signature_name || warehouseConf?.factor3_scanned_by_name },
              ].map(({ label, ts, name }, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-sm ${ts ? 'bg-teal-600' : 'bg-slate-200'}`}>
                    {ts
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : i + 1}
                  </div>
                  <span className={`text-[9px] font-bold text-center ${ts ? 'text-teal-700' : 'text-slate-400'}`}>{label}</span>
                  {ts && <span className="text-[9px] text-teal-600 font-semibold text-center max-w-[64px] truncate">{name}</span>}
                </div>
              ))}
            </div>

            {/* Gross weight */}
            {shipment.gross_weight_kg && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-teal-100/60 border border-teal-200">
                <span className="text-teal-800 text-xs font-bold">Gross Weight Received</span>
                <span className="text-teal-900 font-black text-lg tabular-nums">{Number(shipment.gross_weight_kg).toLocaleString()} KG</span>
              </div>
            )}

            {/* Received quantities table */}
            {warehouseLines.length > 0 && (
              <div>
                <div className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-2">Items Received</div>
                <div className="space-y-1.5">
                  {warehouseLines.map((l) => {
                    const match = l.qty_actual == null || l.qty_actual === l.qty_ordered;
                    return (
                      <div key={l.id} className={`rounded-xl border overflow-hidden ${match ? 'bg-white border-slate-100' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-700 font-semibold text-xs leading-snug whitespace-pre-line">{l.description}</div>
                            {l.sku && <div className="text-[10px] font-mono text-slate-400 mt-0.5">HS: {l.sku}</div>}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-black tabular-nums text-slate-800">{l.qty_actual ?? l.qty_ordered ?? '—'}</div>
                            {!match && l.qty_actual != null && (
                              <div className="text-[10px] text-red-500 font-semibold">exp {l.qty_ordered}</div>
                            )}
                            <div className="text-[10px] text-slate-400">{l.unit || 'PCS'}</div>
                          </div>
                          {!match && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                          )}
                        </div>
                        {l.weight_kg != null && (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/60 border-t border-amber-100">
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Weight</span>
                            <span className="text-[11px] font-black text-amber-800 tabular-nums">{Number(l.weight_kg).toLocaleString()} KG</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Total weight row */}
                  {warehouseLines.some((l) => l.weight_kg != null) && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 mt-1">
                      <span className="text-xs font-black text-amber-700 uppercase tracking-wide">Total Gross Weight</span>
                      <span className="text-lg font-black text-amber-800 tabular-nums">
                        {warehouseLines.reduce((s, l) => s + (parseFloat(l.weight_kg) || 0), 0).toLocaleString()} KG
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Discrepancy section */}
            {shipment.discrepancy_status === 'flagged' && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-red-700 font-black text-sm">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Discrepancy Reported
                </div>
                {shipment.discrepancy_notes && (
                  <p className="text-red-600 text-sm leading-relaxed">{shipment.discrepancy_notes}</p>
                )}
                <p className="text-red-500 text-xs">Please review and indicate how you'd like to proceed.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => resolveDiscrepancy('disputed')}
                    disabled={resolving}
                    className="h-11 rounded-xl border-2 border-red-400 text-red-600 font-bold text-sm cursor-pointer hover:bg-red-100 disabled:opacity-60"
                  >
                    Raise Dispute
                  </button>
                  <button
                    onClick={() => resolveDiscrepancy('acknowledged')}
                    disabled={resolving}
                    className="h-11 rounded-xl bg-red-600 text-white font-bold text-sm cursor-pointer hover:bg-red-700 disabled:opacity-60"
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            )}
            {shipment.discrepancy_status === 'acknowledged' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-amber-700 text-xs font-bold">Discrepancy acknowledged — shipment proceeds as received</span>
              </div>
            )}
            {shipment.discrepancy_status === 'disputed' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span className="text-red-700 text-xs font-bold">Dispute raised — warehouse will re-inspect and confirm</span>
              </div>
            )}

            {/* No activity yet */}
            {!warehouseConf && warehouseLines.length === 0 && (
              <div className="text-center py-4 text-slate-400 text-xs">
                Shipment handed over — awaiting warehouse confirmation
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permit Document — upload PDF, extract data, apply to shipment */}
      <Section title="Permit Document">
        <input
          ref={permitInputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => handlePermitFile(e.target.files?.[0])}
        />

        {/* Already applied permit data */}
        {shipment.permit_number && (
          <div className="space-y-1 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-widest">Permit Applied</span>
              {shipment.permit_pdf_url && (
                <a href={shipment.permit_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-semibold text-emerald-600 underline underline-offset-2">
                  View PDF
                </a>
              )}
            </div>
            <Row label="Permit No." value={shipment.permit_number} />
            <Row label="Issue Date" value={shipment.permit_issue_date} />
            <Row label="Valid Until" value={shipment.permit_valid_until} />
            {shipment.permit_data?.permit_type && <Row label="Type" value={shipment.permit_data.permit_type} />}
            {shipment.permit_data?.exporter_uen && <Row label="UEN" value={shipment.permit_data.exporter_uen} />}
          </div>
        )}

        {/* Extracted preview — not yet applied */}
        {permitExtracted && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-3 space-y-2">
            <div className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-1">Extracted — Review & Apply</div>
            {[
              ['Permit No.', permitExtracted.permit_number],
              ['Type', permitExtracted.permit_type],
              ['Issue Date', permitExtracted.issue_date || permitExtracted.declaration_date],
              ['Valid Until', permitExtracted.valid_until],
              ['Exporter', permitExtracted.exporter_name],
              ['Consignee', permitExtracted.consignee_name],
              ['Vessel', permitExtracted.vessel],
              ['BL Number', permitExtracted.bl_number],
              ['Container', permitExtracted.container_no],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <span className="text-slate-400 font-semibold shrink-0">{k}</span>
                <span className="text-slate-700 font-bold text-right">{String(v)}</span>
              </div>
            ))}
            {permitExtracted.items?.length > 0 && (
              <div className="pt-2 border-t border-emerald-100">
                <div className="text-[10px] font-black text-emerald-600 uppercase mb-1">{permitExtracted.items.length} items extracted</div>
                {permitExtracted.items.slice(0, 3).map((item, i) => (
                  <div key={i} className="text-[11px] text-slate-600 truncate">· {item.description} — {item.quantity} {item.unit}</div>
                ))}
                {permitExtracted.items.length > 3 && <div className="text-[10px] text-slate-400">+ {permitExtracted.items.length - 3} more</div>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setPermitExtracted(null)} className="h-10 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm cursor-pointer active:bg-slate-200">
                Discard
              </button>
              <button
                onClick={applyPermitData}
                disabled={applyingPermit}
                className="h-10 rounded-xl bg-emerald-600 text-white font-bold text-sm cursor-pointer active:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {applyingPermit ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
                Apply to Shipment
              </button>
            </div>
          </div>
        )}

        {/* Upload button + progress */}
        {permitExtracting ? (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin shrink-0" />
            <span className="text-slate-500 text-xs font-semibold">{permitProgress || 'Processing…'}</span>
          </div>
        ) : (
          <button
            onClick={() => permitInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-700 text-sm font-bold cursor-pointer hover:bg-emerald-50 active:bg-emerald-100 w-full justify-center"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {shipment.permit_number ? 'Replace Permit PDF' : 'Upload Permit PDF'}
          </button>
        )}
      </Section>

      {/* Warehouse processing status — no internal tool names exposed */}
      <Section title="Processing Status">
        {shipment.movement_id ? (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <div>
              <div className="text-emerald-700 text-sm font-bold">Handover confirmed</div>
              <div className="text-emerald-600 text-xs mt-0.5">Shipment has been passed to operations. You will be notified once it is received and cleared.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
              <div className="text-slate-500 text-xs">Pending handover to operations. Confirm once permit is ready.</div>
            </div>
            {movementError && (
              <div className="text-red-500 text-xs font-semibold">{movementError}</div>
            )}
            <button
              onClick={createBroodMovement}
              disabled={creatingMovement}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold cursor-pointer hover:bg-teal-700 disabled:opacity-60"
            >
              {creatingMovement ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Confirm Handover to Operations
                </>
              )}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

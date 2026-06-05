import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

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

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('pss_shipments').select('*').eq('id', id).single(),
      supabase.from('pss_shipment_lines').select('*').eq('shipment_id', id).order('sort_order'),
    ]);
    setShipment(s);
    setLines(l || []);
    setLoading(false);
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
      await supabase.from('stock_lines').insert(
        lines.map((l, i) => ({
          movement_id: mov.id,
          description: l.description,
          sku:         l.hs_code || null,
          qty_ordered: parseFloat(l.quantity) || 0,
          unit:        l.unit || 'PCS',
          sort_order:  i,
        }))
      );
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
        <button
          onClick={() => navigate('/pss')}
          className="text-emerald-600 text-sm font-semibold flex items-center gap-1 mb-3 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

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

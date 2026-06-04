import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../../lib/supabase';
import { exportInboundQR, exportInboundConfirmation } from '../../utils/pdfExports';

function FactorBadge({ label, icon, confirmed, by, at }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${confirmed ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold ${confirmed ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        {confirmed ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ) : icon}
      </div>
      <div className="min-w-0">
        <div className={`text-xs font-bold ${confirmed ? 'text-emerald-700' : 'text-slate-500'}`}>{label}</div>
        {confirmed ? (
          <div className="text-[10px] text-emerald-600 mt-0.5">
            {by && <span className="font-semibold">{by}</span>}
            {at && <span className="text-emerald-400"> · {new Date(at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        ) : (
          <div className="text-[10px] text-slate-400 mt-0.5">Pending</div>
        )}
      </div>
    </div>
  );
}

export default function ConfirmationPanel({ movement }) {
  const [conf, setConf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rescinding, setRescinding] = useState(false);
  const [confirmRescind, setConfirmRescind] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [generatingConf, setGeneratingConf] = useState(false);
  const qrWrapRef = useRef(null);

  const token = movement?.client_token || movement?.id || '';

  useEffect(() => {
    if (!movement?.id) return;
    supabase
      .from('delivery_confirmations')
      .select('*')
      .eq('movement_id', movement.id)
      .maybeSingle()
      .then(({ data }) => { setConf(data); setLoading(false); });
  }, [movement?.id]);

  function getQRDataUrl() {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    return canvas?.toDataURL('image/png') || null;
  }

  async function createConfirmation() {
    const { data } = await supabase
      .from('delivery_confirmations')
      .insert({ movement_id: movement.id })
      .select()
      .single();
    setConf(data);
  }

  async function rescindApproval() {
    if (!conf) return;
    setRescinding(true);
    const { data } = await supabase
      .from('delivery_confirmations')
      .update({ factor2_confirmed_at: null, factor2_user_name: null })
      .eq('id', conf.id)
      .select()
      .single();
    setConf(data);
    setConfirmRescind(false);
    setRescinding(false);
  }

  async function approveAdmin() {
    if (!conf) return;
    setApproving(true);
    const { data } = await supabase
      .from('delivery_confirmations')
      .update({ factor2_confirmed_at: new Date().toISOString(), factor2_user_name: 'Admin' })
      .eq('id', conf.id)
      .select()
      .single();
    setConf(data);
    setApproving(false);
  }

  async function downloadQRPdf() {
    setGeneratingQR(true);
    try { await exportInboundQR(movement, getQRDataUrl()); } catch {}
    setGeneratingQR(false);
  }

  async function downloadConfPdf() {
    setGeneratingConf(true);
    try {
      const { data: lines } = await supabase
        .from('stock_lines')
        .select('*')
        .eq('movement_id', movement.id)
        .order('created_at');
      await exportInboundConfirmation(
        movement, conf,
        conf?.inbound_signature_data || null,
        conf?.inbound_signature_name || null,
        lines || []
      );
    } catch {}
    setGeneratingConf(false);
  }

  const allConfirmed = conf?.factor1_confirmed_at && conf?.factor2_confirmed_at && conf?.factor3_confirmed_at;

  if (loading) return <div className="text-xs text-slate-400 py-2">Loading confirmation status…</div>;

  if (!conf) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-500 mb-3">No Inbound Confirmation record for this movement yet.</p>
        <button
          onClick={createConfirmation}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
        >
          Initialise Inbound Confirmation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden QR canvas for PDF export */}
      <div ref={qrWrapRef} style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <QRCodeCanvas value={token} size={300} level="M" />
      </div>

      {allConfirmed && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500 rounded-xl text-white text-sm font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          All 3 factors confirmed — receipt locked
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <FactorBadge label="Ground Staff" icon="1" confirmed={!!conf.factor1_confirmed_at} by={conf.factor1_user_name} at={conf.factor1_confirmed_at} />
        <FactorBadge label="Admin Approval" icon="2" confirmed={!!conf.factor2_confirmed_at} by={conf.factor2_user_name} at={conf.factor2_confirmed_at} />
        <FactorBadge label="Client QR Scanned" icon="3" confirmed={!!conf.factor3_confirmed_at} by={conf.factor3_scanned_by_name} at={conf.factor3_confirmed_at} />
      </div>

      <div className="flex gap-4 items-start">
        {/* QR code display */}
        <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <QRCodeCanvas value={token} size={120} level="M" />
          <div className="text-[9px] text-slate-400 text-center mt-1.5 font-mono">{token.slice(0, 16)}…</div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-xs text-slate-500 leading-relaxed">
            Share this QR PDF with the client. When they arrive, staff scan it on Brood to record Factor 3 confirmation.
          </p>

          {/* QR PDF download — always available */}
          <button
            onClick={downloadQRPdf}
            disabled={generatingQR}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {generatingQR ? 'Generating…' : 'Download QR PDF'}
          </button>

          {/* Admin approve / rescind */}
          {!conf.factor2_confirmed_at ? (
            <button
              onClick={approveAdmin}
              disabled={approving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {approving ? 'Approving…' : 'Approve as Admin (Factor 2)'}
            </button>
          ) : !conf.factor3_confirmed_at && (
            confirmRescind ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-semibold">Rescind approval?</span>
                <button onClick={rescindApproval} disabled={rescinding} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-60 cursor-pointer">
                  {rescinding ? '…' : 'Yes, rescind'}
                </button>
                <button onClick={() => setConfirmRescind(false)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 cursor-pointer">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRescind(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                Rescind Approval
              </button>
            )
          )}
        </div>
      </div>

      {/* Confirmation PDF + signature — shown when all confirmed */}
      {allConfirmed && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          {conf.inbound_signature_data && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Driver / Client Signature</div>
              <img src={conf.inbound_signature_data} alt="Signature" className="h-16 border border-slate-200 rounded-lg bg-white" />
              {conf.inbound_signature_name && <div className="text-xs text-slate-500 font-semibold">{conf.inbound_signature_name}</div>}
            </div>
          )}
          <button
            onClick={downloadConfPdf}
            disabled={generatingConf}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {generatingConf ? 'Generating…' : 'Download Confirmation PDF'}
          </button>
        </div>
      )}
    </div>
  );
}

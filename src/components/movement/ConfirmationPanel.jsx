import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';

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

  useEffect(() => {
    if (!movement?.id) return;
    supabase
      .from('delivery_confirmations')
      .select('*')
      .eq('movement_id', movement.id)
      .maybeSingle()
      .then(({ data }) => { setConf(data); setLoading(false); });
  }, [movement?.id]);

  async function createConfirmation() {
    const { data } = await supabase
      .from('delivery_confirmations')
      .insert({ movement_id: movement.id })
      .select()
      .single();
    setConf(data);
  }

  async function approveAdmin() {
    if (!conf) return;
    setApproving(true);
    const { data } = await supabase
      .from('delivery_confirmations')
      .update({
        factor2_confirmed_at: new Date().toISOString(),
        factor2_user_name: 'Admin',
      })
      .eq('id', conf.id)
      .select()
      .single();
    setConf(data);
    setApproving(false);
  }

  const allConfirmed = conf?.factor1_confirmed_at && conf?.factor2_confirmed_at && conf?.factor3_confirmed_at;

  if (loading) return <div className="text-xs text-slate-400 py-2">Loading confirmation status…</div>;

  if (!conf) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-500 mb-3">No 3FA confirmation record for this movement yet.</p>
        <button
          onClick={createConfirmation}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
        >
          Initialise 3FA Confirmation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allConfirmed && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500 rounded-xl text-white text-sm font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          All 3 factors confirmed — receipt locked
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <FactorBadge
          label="Ground Staff"
          icon="1"
          confirmed={!!conf.factor1_confirmed_at}
          by={conf.factor1_user_name}
          at={conf.factor1_confirmed_at}
        />
        <FactorBadge
          label="Admin Approval"
          icon="2"
          confirmed={!!conf.factor2_confirmed_at}
          by={conf.factor2_user_name}
          at={conf.factor2_confirmed_at}
        />
        <FactorBadge
          label="Client QR Scanned"
          icon="3"
          confirmed={!!conf.factor3_confirmed_at}
          by={conf.factor3_scanned_by_name}
          at={conf.factor3_confirmed_at}
        />
      </div>

      <div className="flex gap-4 items-start">
        {/* QR code */}
        <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <QRCodeSVG value={movement.client_token || movement.id} size={120} level="M" />
          <div className="text-[9px] text-slate-400 text-center mt-1.5 font-mono">{(movement.client_token || movement.id).slice(0, 16)}…</div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-xs text-slate-500 leading-relaxed">
            Print or share this QR code with the client. When they arrive, staff scan it on the Baby App to record Factor 3 confirmation.
          </p>
          {!conf.factor2_confirmed_at && (
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
          )}
        </div>
      </div>
    </div>
  );
}

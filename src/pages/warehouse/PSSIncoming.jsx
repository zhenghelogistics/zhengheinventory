import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';

function StepCard({ number, title, state, children }) {
  const colors = {
    done:    'border-emerald-200 bg-emerald-50',
    active:  'border-teal-300 bg-teal-50/40',
    waiting: 'border-slate-200 bg-white',
    locked:  'border-slate-200 bg-slate-50/60',
  };
  const numColors = {
    done:    'bg-emerald-500 text-white',
    active:  'bg-teal-600 text-white',
    waiting: 'bg-slate-200 text-slate-400',
    locked:  'bg-slate-200 text-slate-400',
  };
  const check = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${colors[state]}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${numColors[state]}`}>
          {state === 'done' ? check : number}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm ${state === 'locked' || state === 'waiting' ? 'text-slate-400' : 'text-slate-800'}`}>{title}</div>
          {(state === 'waiting' || state === 'locked') && (
            <div className="text-[10px] text-slate-400 mt-0.5">Complete previous step first</div>
          )}
        </div>
        {state === 'active' && <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse shrink-0" />}
      </div>
      {(state === 'active' || state === 'done') && children && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}

function FactorPip({ n, done, name }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        {done
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : n}
      </div>
      {done && name
        ? <span className="text-[9px] font-bold text-emerald-600 text-center max-w-[60px] truncate">{name}</span>
        : <span className="text-[9px] font-bold uppercase tracking-wide">{n === 1 ? 'Ground' : n === 2 ? 'Admin' : 'Client'}</span>}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0 mt-0.5">{label}</span>
      <span className="text-xs text-slate-700 font-semibold text-right">{value}</span>
    </div>
  );
}

export default function PSSIncoming() {
  const { user } = useWarehouseAuth();
  const { log } = useWarehouseLog();

  const [movements, setMovements] = useState([]);
  const [confsByMovId, setConfsByMovId] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState({});
  const [conf, setConf] = useState(null);
  const [lines, setLines] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingF1, setConfirmingF1] = useState(false);
  const [received, setReceived] = useState(false);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pss_incoming_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_confirmations' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load(quiet = false) {
    if (quiet) setRefreshing(true); else setLoading(true);

    // Get all pss_shipments that have a linked movement
    const { data: pssData } = await supabase
      .from('pss_shipments')
      .select('*')
      .not('movement_id', 'is', null);

    const pssShipments = pssData || [];
    const movIds = pssShipments.map((p) => p.movement_id).filter(Boolean);

    if (movIds.length === 0) {
      setMovements([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const pssByMovId = {};
    pssShipments.forEach((p) => { pssByMovId[p.movement_id] = p; });

    const [mvRes, confRes] = await Promise.all([
      supabase
        .from('movements')
        .select('id, movement_no, company_name, status, type, date_in, created_at')
        .in('id', movIds)
        .in('status', ['New', 'In Progress'])
        .order('created_at', { ascending: false }),
      supabase.from('delivery_confirmations').select('*'),
    ]);

    const movs = (mvRes.data || []).map((m) => ({ ...m, _pss: pssByMovId[m.id] || {} }));

    setMovements(movs);
    const byMovId = {};
    (confRes.data || []).forEach((c) => { byMovId[c.movement_id] = c; });
    setConfsByMovId(byMovId);
    setLoading(false);
    setRefreshing(false);
  }

  async function selectMovement(mv) {
    setSelected(mv);
    setMeta(mv._pss || {});
    setReceived(mv.status === 'In Progress');

    setDetailLoading(true);
    setConf(null);
    setLines([]);

    const [linesRes, confRes] = await Promise.all([
      supabase.from('stock_lines').select('*').eq('movement_id', mv.id).order('sort_order').order('created_at'),
      supabase.from('delivery_confirmations').select('*').eq('movement_id', mv.id).maybeSingle(),
    ]);

    const linesData = linesRes.data || [];
    setLines(linesData);
    setConf(confRes.data || null);
    const init = {};
    linesData.forEach((l) => { init[l.id] = String(l.qty_actual ?? ''); });
    setDrafts(init);
    setDetailLoading(false);
  }

  async function confirmReceipt() {
    setSaving(true);
    for (const line of lines) {
      const qty = parseFloat(drafts[line.id]) || 0;
      await supabase.from('stock_lines')
        .update({ qty_actual: qty, date_in: new Date().toISOString().slice(0, 10) })
        .eq('id', line.id);
      await log('pss_receive', line.id, selected.movement_no, {
        sku: line.sku, description: line.description, qty_confirmed: qty,
      });
    }
    await supabase.from('movements').update({ status: 'In Progress' }).eq('id', selected.id);
    setSelected((p) => ({ ...p, status: 'In Progress' }));
    setReceived(true);
    setSaving(false);
  }

  async function confirmFactor1() {
    setConfirmingF1(true);
    const now = new Date().toISOString();
    const { data: updatedConf } = await supabase
      .from('delivery_confirmations')
      .upsert(
        { movement_id: selected.id, factor1_confirmed_at: now, factor1_user_name: user?.name || 'Ground Staff' },
        { onConflict: 'movement_id', ignoreDuplicates: false }
      )
      .select()
      .single();
    if (updatedConf) setConf(updatedConf);
    setConfirmingF1(false);
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selected) {
    const f1Done = !!conf?.factor1_confirmed_at;
    const f2Done = !!conf?.factor2_confirmed_at;
    const f3Done = !!conf?.factor3_confirmed_at;
    const allConfirmed = f1Done && f2Done && f3Done;
    const step2State = allConfirmed ? 'done' : received ? 'active' : 'locked';

    return (
      <div className="px-4 py-5 max-w-lg mx-auto space-y-3 pb-10">
        <button
          onClick={() => { setSelected(null); setLines([]); setConf(null); }}
          className="text-teal-600 text-sm font-semibold flex items-center gap-1 mb-1 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>

        {/* Shipment info card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">PSS Shipment</span>
                {meta.pss_status && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.pss_status === 'Submitted' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {meta.pss_status}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black text-slate-800">{selected.movement_no}</h2>
              {selected.company_name && <p className="text-slate-500 text-sm">{selected.company_name}</p>}
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${received ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'}`}>
              {received ? 'Received' : 'Pending'}
            </span>
          </div>

          <div className="space-y-0">
            <InfoRow label="ETD" value={selected.date_in ? new Date(selected.date_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
            <InfoRow label="Carrier" value={meta.carrier} />
            <InfoRow label="Vessel / Voyage" value={[meta.vessel, meta.voyage].filter(Boolean).join(' · ') || null} />
            <InfoRow label="BL Number" value={meta.bl_number} />
            <InfoRow label="POL" value={meta.pol} />
            <InfoRow label="POD" value={meta.pod} />
            <InfoRow label="Container" value={[meta.container_type, meta.container_no].filter(Boolean).join(' · ') || null} />
            <InfoRow label="Seal" value={meta.seal_no} />
            <InfoRow label="Export Type" value={meta.export_type} />
            <InfoRow label="Consignee" value={meta.consignee} />
            <InfoRow label="Notify Party" value={meta.notify_party} />
            {meta.remarks && <InfoRow label="Remarks" value={meta.remarks} />}
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-slate-200 border-t-teal-500 rounded-full" />
            Loading…
          </div>
        ) : (
          <>
            {/* Step 1: Count items */}
            <StepCard number={1} title="Receive & Count" state={received ? 'done' : 'active'}>
              {!received ? (
                <>
                  {lines.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-sm">No product lines on this shipment.</div>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {lines.map((line) => (
                        <div key={line.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                          <div className="mb-2">
                            <div className="font-bold text-slate-800 text-sm leading-snug whitespace-pre-line">{line.description || '—'}</div>
                            {line.sku && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">HS: {line.sku}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                                Qty Received ({line.unit || 'PCS'})
                                {line.qty_ordered ? <span className="ml-1 text-slate-300">· expected {line.qty_ordered}</span> : null}
                              </label>
                              <input
                                type="number"
                                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-lg font-bold focus:outline-none focus:border-teal-400 text-center"
                                value={drafts[line.id] || ''}
                                onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: e.target.value }))}
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {lines.length > 0 && (
                    <button
                      onClick={confirmReceipt}
                      disabled={saving}
                      className="w-full h-12 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving ? 'Saving…' : 'Save Quantities'}
                    </button>
                  )}
                </>
              ) : (
                <div className="space-y-1.5">
                  {lines.map((line) => (
                    <div key={line.id} className="flex items-start justify-between py-1">
                      <div className="min-w-0 mr-3">
                        <div className="text-sm font-semibold text-slate-700 leading-snug whitespace-pre-line">{line.description || '—'}</div>
                        {line.sku && <div className="text-[10px] font-mono text-slate-400">HS: {line.sku}</div>}
                      </div>
                      <span className="font-black text-emerald-700 tabular-nums shrink-0 mt-0.5">
                        {drafts[line.id] || line.qty_actual || 0}{' '}
                        <span className="font-normal text-xs text-slate-400">{line.unit || 'PCS'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </StepCard>

            {/* Step 2: 3FA Confirmation */}
            <StepCard number={2} title="Inbound Confirmation" state={step2State}>
              {/* Factor pips */}
              <div className="flex items-center justify-around py-2 mb-4">
                <FactorPip n={1} done={f1Done} name={conf?.factor1_user_name} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={2} done={f2Done} name={conf?.factor2_user_name} />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <FactorPip n={3} done={f3Done} name={conf?.factor3_scanned_by_name} />
              </div>

              {!f1Done ? (
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 mb-3">
                  <div className="font-bold text-slate-800 text-sm mb-1">Your sign-off required</div>
                  <p className="text-slate-500 text-xs mb-3 leading-relaxed">
                    Verify the received items match the shipment. Once satisfied, confirm below.
                  </p>
                  <button
                    onClick={confirmFactor1}
                    disabled={confirmingF1}
                    className="w-full h-11 rounded-xl bg-teal-600 text-white font-bold text-sm cursor-pointer active:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {confirmingF1 ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Delivery Correct — Sign Off (F1)</>
                    )}
                  </button>
                </div>
              ) : !f2Done ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <div>
                    <div className="text-amber-700 text-xs font-bold">Waiting for Admin approval (F2)</div>
                    <div className="text-amber-500 text-[10px] mt-0.5">Admin reviews and approves in Hive</div>
                  </div>
                </div>
              ) : !f3Done ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Admin approved · F2 by {conf.factor2_user_name}
                  </div>
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                    <div className="text-indigo-700 text-xs font-bold">Awaiting client QR scan (F3)</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  All 3 factors confirmed — receipt locked
                </div>
              )}

              {(f1Done || f2Done) && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {f1Done && <div className="text-[10px] text-slate-400">F1: <span className="font-semibold text-slate-500">{conf.factor1_user_name}</span> · {new Date(conf.factor1_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f2Done && <div className="text-[10px] text-slate-400">F2: <span className="font-semibold text-slate-500">{conf.factor2_user_name}</span> · {new Date(conf.factor2_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                  {f3Done && <div className="text-[10px] text-slate-400">F3: <span className="font-semibold text-slate-500">{conf.factor3_scanned_by_name}</span> · {new Date(conf.factor3_confirmed_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
              )}
            </StepCard>
          </>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">PSS</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800">Incoming Shipments</h2>
          <p className="text-slate-500 text-xs mt-0.5">Shipments created from PSS portal</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold active:bg-slate-200 cursor-pointer disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 border-2 border-teal-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <p className="text-slate-600 font-semibold text-sm mb-1">No incoming PSS shipments</p>
          <p className="text-slate-400 text-xs">Shipments will appear here once created in the PSS portal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {movements.map((mv) => {
            const m = mv._pss || {};
            const c = confsByMovId[mv.id];
            const f1 = !!c?.factor1_confirmed_at;
            const f2 = !!c?.factor2_confirmed_at;
            const f3 = !!c?.factor3_confirmed_at;
            const allDone = f1 && f2 && f3;
            return (
              <button
                key={mv.id}
                onClick={() => selectMovement(mv)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm text-left active:scale-[0.98] cursor-pointer transition-all hover:border-teal-200"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="font-black text-slate-800 text-base">{mv.movement_no}</div>
                    {mv.company_name && <div className="text-slate-500 text-sm truncate">{mv.company_name}</div>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    mv.status === 'In Progress' ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-100 text-teal-700'
                  }`}>{mv.status === 'In Progress' ? 'Received' : 'Pending'}</span>
                </div>

                {/* Shipping info chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.vessel && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {m.vessel}{m.voyage ? ` · ${m.voyage}` : ''}
                    </span>
                  )}
                  {m.pod && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      → {m.pod}
                    </span>
                  )}
                  {mv.date_in && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      ETD {new Date(mv.date_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {m.container_type && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {m.container_type}
                    </span>
                  )}
                </div>

                {/* 3FA pips */}
                {c ? (
                  <div className="flex items-center gap-1.5">
                    {[{ n: 1, done: f1 }, { n: 2, done: f2 }, { n: 3, done: f3 }].map(({ n, done }) => (
                      <div key={n} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        {done ? '✓' : n}
                      </div>
                    ))}
                    <span className={`text-[10px] font-bold ml-1 ${allDone ? 'text-emerald-600' : !f1 ? 'text-slate-400' : 'text-amber-600'}`}>
                      {allDone ? 'All confirmed' : !f1 ? 'Awaiting sign-off' : 'In progress'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400">{n}</div>
                    ))}
                    <span className="text-[10px] font-bold ml-1 text-slate-400">Not started</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

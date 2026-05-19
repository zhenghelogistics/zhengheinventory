import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ClipboardList, Check, X, Camera, PenLine } from 'lucide-react';

const STATUS_COLORS = {
  'Pending':            'bg-slate-100 text-slate-600',
  'Picking':            'bg-blue-100 text-blue-700',
  'Checking':          'bg-violet-100 text-violet-700',
  'Photo Pending':      'bg-amber-100 text-amber-700',
  'Admin Review':       'bg-orange-100 text-orange-700',
  'Awaiting Signature': 'bg-pink-100 text-pink-700',
  'Completed':          'bg-emerald-100 text-emerald-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function ProgressStep({ label, done }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        {done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      {label}
    </div>
  );
}

export default function PickListPanel({ movement, stockLines }) {
  const [pickLists, setPickLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedLines, setSelectedLines] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const inboundLines = stockLines.filter((l) => l.line_type !== 'Outbound');

  useEffect(() => {
    if (!movement?.id) return;
    fetchPickLists();
  }, [movement?.id]);

  async function fetchPickLists() {
    const { data } = await supabase
      .from('pick_lists')
      .select('*, pick_list_items(*)')
      .eq('movement_id', movement.id)
      .order('created_at', { ascending: false });
    setPickLists(data || []);
    setLoading(false);
  }

  async function createPickList() {
    if (!selectedLines.length) return;
    setCreating(true);

    const { data: pl } = await supabase
      .from('pick_lists')
      .insert({ movement_id: movement.id, created_by: 'Admin', status: 'Pending' })
      .select()
      .single();

    if (pl) {
      const items = selectedLines.map((lineId) => {
        const line = inboundLines.find((l) => l.id === lineId);
        return {
          pick_list_id: pl.id,
          stock_line_id: line.id,
          sku: line.sku,
          description: line.description,
          unit: line.unit,
          qty_to_pick: Number(line.qty_actual) || 0,
        };
      });
      await supabase.from('pick_list_items').insert(items);
      await fetchPickLists();
    }

    setCreating(false);
    setShowCreate(false);
    setSelectedLines([]);
  }

  async function deletePickList(plId) {
    setDeletingId(plId);
    await supabase.from('pick_list_items').delete().eq('pick_list_id', plId);
    await supabase.from('pick_lists').delete().eq('id', plId);
    setPickLists((prev) => prev.filter((p) => p.id !== plId));
    setConfirmDeleteId(null);
    setDeletingId(null);
  }

  async function approvePhoto(pl) {
    setApprovingId(pl.id);
    await supabase
      .from('pick_lists')
      .update({
        status: 'Awaiting Signature',
        photo_approved_at: new Date().toISOString(),
        photo_approved_by: 'Admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pl.id);
    await fetchPickLists();
    setApprovingId(null);
  }

  if (loading) return <div className="text-xs text-slate-400 py-2">Loading pick lists…</div>;

  return (
    <div className="space-y-4">
      {/* Existing pick lists */}
      {pickLists.map((pl) => {
        const items = pl.pick_list_items || [];
        const allPicked1 = items.length > 0 && items.every((i) => !!i.confirm1_at);
        const allPicked2 = items.length > 0 && items.every((i) => !!i.confirm2_at);

        return (
          <div key={pl.id} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ClipboardList size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-700">Pick List</span>
                <span className="text-[10px] text-slate-400 font-mono">{pl.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={pl.status} />
                {confirmDeleteId === pl.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
                    <button
                      onClick={() => deletePickList(pl.id)}
                      disabled={deletingId === pl.id}
                      className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold cursor-pointer hover:bg-red-600 disabled:opacity-60"
                    >
                      {deletingId === pl.id ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold cursor-pointer hover:bg-slate-300"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(pl.id)}
                    className="p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                    title="Delete pick list"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Progress steps */}
              <div className="flex flex-wrap gap-3">
                <ProgressStep label="Staff 1 Pick" done={allPicked1} />
                <ProgressStep label="Staff 2 Check" done={allPicked2} />
                <ProgressStep label="Photo" done={!!pl.photo_url} />
                <ProgressStep label="Admin Approved" done={!!pl.photo_approved_at} />
                <ProgressStep label="Signed" done={!!pl.signed_at} />
                <ProgressStep label="Completed" done={pl.status === 'Completed'} />
              </div>

              {/* Items summary */}
              <div className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''} to pick</div>

              {/* Photo review */}
              {pl.photo_url && pl.status === 'Admin Review' && (
                <div className="space-y-2">
                  <img src={pl.photo_url} alt="Pick proof" className="w-full max-h-48 object-cover rounded-lg border border-slate-200" />
                  <button
                    onClick={() => approvePhoto(pl)}
                    disabled={approvingId === pl.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60 cursor-pointer"
                  >
                    <Check size={12} />
                    {approvingId === pl.id ? 'Approving…' : 'Approve Photo — Push to Signature'}
                  </button>
                </div>
              )}

              {/* Signature preview */}
              {pl.signed_at && pl.signature_data && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Customer Signature</div>
                  <img src={pl.signature_data} alt="Signature" className="h-16 border border-slate-200 rounded-lg bg-white" />
                  {pl.signature_name && <div className="text-xs text-slate-500 font-semibold">{pl.signature_name}</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Create new pick list */}
      {showCreate ? (
        <div className="border-2 border-blue-200 rounded-xl bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Select stock lines to include</span>
            <button onClick={() => { setShowCreate(false); setSelectedLines([]); }} className="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-400">
              <X size={14} />
            </button>
          </div>

          {inboundLines.length === 0 ? (
            <p className="text-xs text-slate-400">No inbound stock lines on this movement.</p>
          ) : (
            <div className="space-y-1.5">
              {inboundLines.map((line) => (
                <label key={line.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600"
                    checked={selectedLines.includes(line.id)}
                    onChange={(e) => setSelectedLines((prev) =>
                      e.target.checked ? [...prev, line.id] : prev.filter((id) => id !== line.id)
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate">{line.description || '—'}</div>
                    {line.sku && <div className="text-[10px] font-mono text-slate-400">{line.sku}</div>}
                  </div>
                  <div className="text-xs font-bold text-violet-600 shrink-0">{Number(line.qty_actual) || 0} {line.unit || 'pcs'}</div>
                </label>
              ))}
            </div>
          )}

          <button
            onClick={createPickList}
            disabled={creating || !selectedLines.length}
            className="w-full h-10 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {creating ? 'Creating…' : `Create Pick List (${selectedLines.length} items)`}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-blue-200"
        >
          <ClipboardList size={13} strokeWidth={2.5} />
          Create Pick List
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useWarehouseLog } from '../../hooks/useWarehouseLog';

export default function UpdateStock() {
  const { log } = useWarehouseLog();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    const q = query.trim();
    const { data } = await supabase
      .from('inventory_records')
      .select('*')
      .or(`sku.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(10);
    setResults(data || []);
    setSearching(false);
  }

  function pick(item) {
    setSelected(item);
    setDelta('');
    setReason('');
    setSaved(false);
  }

  async function applyDelta(direction) {
    const d = parseFloat(delta);
    if (!d || isNaN(d)) return;
    setSaving(true);
    const change = direction === '+' ? d : -d;
    const newQty = Math.max(0, (Number(selected.quantity) || 0) + change);
    const { data, error } = await supabase
      .from('inventory_records')
      .update({ quantity: newQty })
      .eq('id', selected.id)
      .select()
      .single();
    if (!error) {
      setSelected(data);
      setResults((prev) => prev.map((r) => r.id === data.id ? data : r));
      await log('update_stock', selected.id, selected.sku || selected.description, {
        change,
        qty_before: Number(selected.quantity) || 0,
        qty_after: newQty,
        reason: reason || null,
      });
      setSaved(true);
      setDelta('');
    }
    setSaving(false);
  }

  if (selected) {
    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)} className="text-blue-600 text-sm font-semibold flex items-center gap-1 mb-4 cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back to search
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-4">
          <div className="text-lg font-bold text-slate-800">{selected.description}</div>
          {selected.sku && <div className="text-xs font-mono text-slate-400">{selected.sku}</div>}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-slate-500 text-sm">Current quantity:</span>
            <span className="text-2xl font-bold text-slate-800">{Number(selected.quantity) || 0}</span>
            <span className="text-slate-400 text-sm">pcs</span>
          </div>
        </div>

        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm font-semibold flex items-center gap-2 mb-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
            </svg>
            Updated! New qty: {Number(selected.quantity) || 0}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Amount to adjust</label>
            <input
              type="number"
              inputMode="numeric"
              className="w-full px-4 py-4 rounded-xl border-2 border-slate-200 text-slate-800 text-2xl font-bold text-center focus:outline-none focus:border-blue-400"
              value={delta}
              onChange={(e) => { setDelta(e.target.value); setSaved(false); }}
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1.5">Reason (optional)</label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm focus:outline-none focus:border-blue-400"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged, counted, correction"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => applyDelta('+')}
              disabled={saving || !delta}
              className="h-14 rounded-xl bg-emerald-500 text-white font-bold text-lg flex items-center justify-center gap-1.5 active:bg-emerald-600 disabled:opacity-40 cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add
            </button>
            <button
              onClick={() => applyDelta('-')}
              disabled={saving || !delta}
              className="h-14 rounded-xl bg-red-500 text-white font-bold text-lg flex items-center justify-center gap-1.5 active:bg-red-600 disabled:opacity-40 cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Remove
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Update Stock</h2>
        <p className="text-slate-500 text-xs mt-0.5">Search for an item to adjust</p>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 px-4 py-3.5 rounded-xl border border-slate-200 text-slate-800 text-base focus:outline-none focus:border-blue-400 bg-white"
          placeholder="SKU or item name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-5 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-60 cursor-pointer"
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      <div className="space-y-2">
        {results.map((item) => (
          <button
            key={item.id}
            onClick={() => pick(item)}
            className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between active:bg-slate-50 cursor-pointer text-left"
          >
            <div>
              <div className="font-bold text-slate-800">{item.description}</div>
              {item.sku && <div className="text-xs font-mono text-slate-400">{item.sku}</div>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-bold">{Number(item.quantity) || 0} <span className="text-slate-400 font-normal text-xs">pcs</span></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </button>
        ))}
        {results.length === 0 && query && !searching && (
          <div className="text-center py-8 text-slate-400 text-sm">No items found</div>
        )}
      </div>
    </div>
  );
}

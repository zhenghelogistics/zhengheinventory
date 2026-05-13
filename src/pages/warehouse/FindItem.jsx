import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function FindItem() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    const q = query.trim();
    const { data } = await supabase
      .from('inventory_records')
      .select('*')
      .or(`sku.ilike.%${q}%,description.ilike.%${q}%`)
      .order('description')
      .limit(20);
    setResults(data || []);
    setSearched(true);
    setSearching(false);
  }

  if (selected) {
    const qty = Number(selected.quantity) || 0;
    return (
      <div className="px-4 py-5 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)} className="text-blue-600 text-sm font-semibold flex items-center gap-1 mb-4 cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back to results
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-sky-50 px-5 py-4 border-b border-sky-100">
            <div className="text-lg font-bold text-slate-800">{selected.description}</div>
            {selected.sku && (
              <div className="text-xs font-mono text-slate-400 mt-0.5">{selected.sku}</div>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            <Row label="Quantity" value={<span className={`text-xl font-bold ${qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{qty} pcs</span>} />
            {selected.customer_name && <Row label="Customer" value={selected.customer_name} />}
            {selected.dimension && <Row label="Dimensions" value={selected.dimension} />}
            {selected.weight && <Row label="Weight" value={selected.weight} />}
            {selected.num_packages != null && <Row label="Packages" value={selected.num_packages} />}
            {selected.remark && <Row label="Remark" value={selected.remark} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">Find Item</h2>
        <p className="text-slate-500 text-xs mt-0.5">Search by SKU, name, or category</p>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 px-4 py-3.5 rounded-xl border border-slate-200 text-slate-800 text-base focus:outline-none focus:border-blue-400 bg-white"
          placeholder="e.g. SKU-001 or cable"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          autoFocus
        />
        <button
          onClick={search}
          disabled={searching}
          className="px-5 rounded-xl bg-sky-600 text-white font-semibold text-sm disabled:opacity-60 cursor-pointer"
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {searched && results.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">No items found for "{query}"</div>
      )}

      <div className="space-y-2">
        {results.map((item) => {
          const qty = Number(item.quantity) || 0;
          return (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between active:bg-slate-50 cursor-pointer text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 truncate">{item.description}</div>
                {item.sku && <div className="text-xs font-mono text-slate-400">{item.sku}</div>}
                {item.customer_name && <div className="text-xs text-slate-400">{item.customer_name}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-bold ${qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{qty}</span>
                <span className="text-slate-400 text-xs">pcs</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 gap-4">
      <span className="text-slate-500 text-sm shrink-0">{label}</span>
      <span className="text-slate-800 font-medium text-sm text-right">{value}</span>
    </div>
  );
}

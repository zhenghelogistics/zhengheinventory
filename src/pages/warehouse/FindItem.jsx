import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function FindItem() {
  const [query, setQuery] = useState('');
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    supabase
      .from('inventory_records')
      .select('*')
      .order('description')
      .limit(200)
      .then(({ data }) => { setAllItems(data || []); setLoading(false); });
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? allItems.filter((item) =>
        (item.description || '').toLowerCase().includes(q) ||
        (item.sku || '').toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q)
      )
    : allItems;

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
            {selected.sku && <div className="text-xs font-mono text-slate-400 mt-0.5">{selected.sku}</div>}
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
        <p className="text-slate-500 text-xs mt-0.5">{loading ? 'Loading…' : `${allItems.length} items in warehouse`}</p>
      </div>

      <div className="relative mb-4">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-slate-200 text-slate-800 text-base focus:outline-none focus:border-blue-400 bg-white"
          placeholder="Search by SKU, name, or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <div className="animate-spin w-5 h-5 border-2 border-slate-200 border-t-sky-500 rounded-full" />
          Loading items…
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No items match "{query}"</div>
      ) : (
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
                  <span className={`font-bold tabular-nums ${qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{qty}</span>
                  <span className="text-slate-400 text-xs">pcs</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </button>
            );
          })}
          {allItems.length === 200 && !q && (
            <p className="text-center text-xs text-slate-400 py-2">Showing first 200 items — search to narrow down</p>
          )}
        </div>
      )}
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

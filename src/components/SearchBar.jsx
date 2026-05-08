import { Search, Filter } from 'lucide-react';

export default function SearchBar({ search, setSearch, filter, setFilter, total, showing }) {
  return (
    <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search
          size={15}
          strokeWidth={2}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description, SKU, customer, remark…"
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 placeholder-slate-400"
        />
      </div>
      <div className="relative">
        <Filter
          size={14}
          strokeWidth={2}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150 cursor-pointer appearance-none"
        >
          <option value="all">All items</option>
          <option value="expiring">Expiring Soon (≤30 days)</option>
          <option value="expired">Expired</option>
          <option value="no-expiry">No Expiry Set</option>
        </select>
      </div>
      <span className="text-xs text-slate-400 font-medium ml-auto">
        {showing === total
          ? `${total} record${total !== 1 ? 's' : ''}`
          : `${showing} of ${total} records`}
      </span>
    </div>
  );
}

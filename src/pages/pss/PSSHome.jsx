import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const STATUS_STYLES = {
  'Draft':         'bg-slate-100 text-slate-600',
  'Submitted':     'bg-amber-100 text-amber-700',
  'Permit Issued': 'bg-emerald-100 text-emerald-700',
  'Completed':     'bg-blue-100 text-blue-700',
};

function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-xs font-bold mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

export default function PSSHome() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('pss_shipments')
      .select('id, po_number, status, export_type, client_name, consignee_name, bl_number, vessel, voyage, pod, shipment_date, created_at')
      .order('created_at', { ascending: false });

    // Count lines per shipment
    const ids = (data || []).map((s) => s.id);
    let lineCounts = {};
    if (ids.length > 0) {
      const { data: linesData } = await supabase
        .from('pss_shipment_lines')
        .select('shipment_id')
        .in('shipment_id', ids);
      (linesData || []).forEach((l) => {
        lineCounts[l.shipment_id] = (lineCounts[l.shipment_id] || 0) + 1;
      });
    }

    setShipments((data || []).map((s) => ({ ...s, line_count: lineCounts[s.id] || 0 })));
    setLoading(false);
  }

  const now = new Date();
  const thisMonth = shipments.filter((s) => {
    const d = new Date(s.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const counts = {
    total:   thisMonth.length,
    draft:   shipments.filter((s) => s.status === 'Draft').length,
    submitted: shipments.filter((s) => s.status === 'Submitted').length,
    issued:  shipments.filter((s) => s.status === 'Permit Issued').length,
  };

  const filtered = shipments.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.po_number || '').toLowerCase().includes(q) ||
      (s.client_name || '').toLowerCase().includes(q) ||
      (s.bl_number || '').toLowerCase().includes(q) ||
      (s.vessel || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-800">Shipping Instructions</h1>
          <p className="text-slate-500 text-xs mt-0.5">Manage export permit declarations</p>
        </div>
        <button
          onClick={() => navigate('/pss/new')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Shipment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="This month" value={loading ? '—' : counts.total} color="bg-white border border-slate-200 text-slate-800" />
        <StatCard label="Drafts" value={loading ? '—' : counts.draft} color="bg-slate-50 border border-slate-200 text-slate-600" />
        <StatCard label="Submitted" value={loading ? '—' : counts.submitted} color="bg-amber-50 border border-amber-200 text-amber-700" />
        <StatCard label="Permits Issued" value={loading ? '—' : counts.issued} color="bg-emerald-50 border border-emerald-200 text-emerald-700" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number, client, BL…"
            className="flex-1 text-sm text-slate-700 bg-transparent outline-none placeholder:text-slate-400"
          />
          <button onClick={load} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <p className="text-slate-600 font-semibold text-sm mb-1">
              {search ? 'No results found' : 'No shipments yet'}
            </p>
            <p className="text-slate-400 text-xs mb-4">
              {search ? 'Try a different search term' : 'Upload a Purchase Order to get started'}
            </p>
            {!search && (
              <button
                onClick={() => navigate('/pss/new')}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer hover:bg-emerald-700"
              >
                Create First Shipment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['PO / Reference', 'Client', 'BL Number', 'Vessel / Voyage', 'POD', 'Items', 'Status', 'Date'].map((h) => (
                    <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/pss/entry/${s.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800 text-xs font-mono">{s.po_number || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-700 text-xs">{s.client_name || '—'}</div>
                      {s.consignee_name && s.consignee_name !== s.client_name && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{s.consignee_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.bl_number || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-700 font-semibold">{s.vessel || '—'}</div>
                      {s.voyage && <div className="text-[10px] text-slate-400">{s.voyage}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.pod || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">{s.line_count}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status] || 'bg-slate-100 text-slate-500'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-slate-400 tabular-nums">
                      {s.shipment_date || s.created_at?.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

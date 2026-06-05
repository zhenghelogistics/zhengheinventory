import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const MOCK_ENTRIES = [
  {
    id: '1',
    ref: 'SI-2026-0041',
    client: 'PT Sumber Makmur',
    consignee: 'RSUP DR. WAHIDIN SUDIROHUSODO',
    bl: 'MEDUG6123456',
    vessel: 'MSC ANTWERP',
    voyage: '626N',
    pol: 'SINGAPORE',
    pod: 'MAKASSAR',
    container: 'MSCU1234567',
    status: 'Draft',
    date: '2026-06-03',
    items: 3,
  },
  {
    id: '2',
    ref: 'SI-2026-0040',
    client: 'PSG Medical',
    consignee: 'PSG SPECIALTY HOSPITAL',
    bl: 'OOCU8765432',
    vessel: 'ONE STORK',
    voyage: '071W',
    pol: 'SINGAPORE',
    pod: 'PORT KLANG',
    container: 'TCKU3456789',
    status: 'Submitted',
    date: '2026-06-01',
    items: 5,
  },
  {
    id: '3',
    ref: 'SI-2026-0039',
    client: 'Global Health Supplies',
    consignee: 'RUMAH SAKIT UMUM PUSAT',
    bl: 'HLCUSIN2605123',
    vessel: 'HAPAG EXPRESS',
    voyage: '214E',
    pol: 'SINGAPORE',
    pod: 'SURABAYA',
    container: 'HLXU2345678',
    status: 'Permit Issued',
    date: '2026-05-29',
    items: 8,
  },
];

const STATUS_STYLES = {
  'Draft':         'bg-slate-100 text-slate-500',
  'Submitted':     'bg-amber-100 text-amber-700',
  'Permit Issued': 'bg-emerald-100 text-emerald-700',
  'Rejected':      'bg-red-100 text-red-600',
};

function StatCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-xs font-bold mt-0.5">{label}</div>
      {sub && <div className="text-[10px] mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
}

export default function PSSHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = MOCK_ENTRIES.filter((e) =>
    !search ||
    e.ref.toLowerCase().includes(search.toLowerCase()) ||
    e.client.toLowerCase().includes(search.toLowerCase()) ||
    e.bl.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-800">Shipping Instructions</h1>
          <p className="text-slate-500 text-xs mt-0.5">Create and manage export permit declarations</p>
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
        <StatCard label="Total this month" value="12" sub="June 2026" color="bg-white border-slate-200 text-slate-800" />
        <StatCard label="Drafts" value="3" sub="Awaiting submission" color="bg-slate-50 border-slate-200 text-slate-600" />
        <StatCard label="Submitted" value="6" sub="Pending permit" color="bg-amber-50 border-amber-200 text-amber-700" />
        <StatCard label="Permits Issued" value="3" sub="This month" color="bg-emerald-50 border-emerald-200 text-emerald-700" />
      </div>

      {/* Search + list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ref, client, BL…"
            className="flex-1 text-sm text-slate-700 bg-transparent outline-none placeholder:text-slate-400"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No entries found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Reference', 'Client', 'BL Number', 'Vessel / Voyage', 'POD', 'Items', 'Status', 'Date'].map((h) => (
                  <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => navigate(`/pss/entry/${e.id}`)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-800 text-xs">{e.ref}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-700 text-xs">{e.client}</div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{e.consignee}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{e.bl}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-700 font-semibold">{e.vessel}</div>
                    <div className="text-[10px] text-slate-400">{e.voyage}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{e.pod}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">{e.items}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[e.status] || 'bg-slate-100 text-slate-500'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-400 tabular-nums">{e.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Prototype note */}
      <p className="text-center text-slate-400 text-xs mt-6">
        Prototype — data above is static. Live entries will pull from Supabase once the PSS module is activated.
      </p>
    </div>
  );
}

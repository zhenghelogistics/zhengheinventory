import { useNavigate } from 'react-router-dom';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';

const ACTIONS = [
  {
    to: '/warehouse/pick-list',
    label: 'Pick List',
    desc: 'Outbound orders to pick',
    color: 'bg-orange-500',
    light: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/receive',
    label: 'Receive Delivery',
    desc: 'Confirm inbound stock',
    color: 'bg-violet-500',
    light: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/update-stock',
    label: 'Update Stock',
    desc: 'Adjust item quantities',
    color: 'bg-emerald-500',
    light: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/find-item',
    label: 'Find Item',
    desc: 'Look up SKU or item',
    color: 'bg-sky-500',
    light: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/scan-qr',
    label: 'Scan Client QR',
    desc: 'Confirm Factor 3 on arrival',
    color: 'bg-indigo-500',
    light: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        <line x1="14" y1="14" x2="14" y2="14"/><line x1="17" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/>
        <line x1="14" y1="17" x2="14" y2="17"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/pick-lists',
    label: 'Pick Lists',
    desc: 'FIGARO pick execution',
    color: 'bg-fuchsia-500',
    light: 'bg-fuchsia-50',
    border: 'border-fuchsia-200',
    text: 'text-fuchsia-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    to: '/warehouse/shipments',
    label: 'Shipment Cards',
    desc: 'Add or deduct by shipment',
    color: 'bg-rose-500',
    light: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
        <line x1="10" y1="9" x2="10" y2="13"/>
        <line x1="8" y1="11" x2="12" y2="11"/>
      </svg>
    ),
  },
];

export default function WarehouseHome() {
  const navigate = useNavigate();
  const { user } = useWarehouseAuth();

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Good day, {user?.name}</h2>
        <p className="text-slate-500 text-sm mt-0.5">What do you need to do?</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            className={`flex flex-col items-start p-5 rounded-2xl border-2 ${a.light} ${a.border} active:scale-95 transition-transform cursor-pointer text-left`}
          >
            <div className={`w-14 h-14 rounded-xl ${a.color} flex items-center justify-center text-white mb-3`}>
              {a.icon}
            </div>
            <div className={`font-bold text-base ${a.text}`}>{a.label}</div>
            <div className="text-slate-500 text-xs mt-0.5 leading-snug">{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

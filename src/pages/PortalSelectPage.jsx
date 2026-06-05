import { useNavigate } from 'react-router-dom';

const portals = [
  {
    id: 'hive',
    name: 'Hive',
    subtitle: 'Admin & Operations',
    description: 'Stock movements, inbound confirmations, pick & plan oversight, inventory management.',
    to: '/movements',
    color: '#0f1f5c',
    accent: '#1e3a8a',
    badge: null,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    features: ['Stock Movements', 'Inbound Confirmation', 'Pick & Plan', 'Activity Log'],
  },
  {
    id: 'brood',
    name: 'Brood',
    subtitle: 'Warehouse Floor',
    description: 'Ground operations — receive deliveries, execute pick lists, scan QR codes, find items.',
    to: '/warehouse',
    color: '#312e81',
    accent: '#4338ca',
    badge: null,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
    features: ['Receive Delivery', 'Pick & Plan', 'Shipment Cards', 'Find Item'],
  },
  {
    id: 'pss',
    name: 'PSS',
    subtitle: 'Permit & Shipping',
    description: 'Export permit declarations, shipping instructions, cargo clearance and documentation.',
    to: '/pss',
    color: '#064e3b',
    accent: '#065f46',
    badge: null,
    disabled: false,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    features: ['Export Permits', 'Shipping Instructions', 'Cargo Clearance', 'Document Store'],
  },
];

export default function PortalSelectPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ fontFamily: "'Fira Sans', system-ui, sans-serif", background: '#0a0f1e' }}
    >
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/hive-logo.svg" alt="Zhenghe Logistics" className="h-10 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Zhenghe Logistics</h1>
        <p className="text-slate-400 text-sm mt-1">Select your portal to continue</p>
      </div>

      {/* Portal tiles */}
      <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-3 gap-4">
        {portals.map((portal) => (
          <button
            key={portal.id}
            onClick={() => !portal.disabled && navigate(portal.to)}
            disabled={portal.disabled}
            className={`relative text-left rounded-2xl p-6 border transition-all duration-200 group ${
              portal.disabled
                ? 'border-white/10 cursor-not-allowed opacity-60'
                : 'border-white/10 hover:border-white/30 hover:scale-[1.02] active:scale-[0.99] cursor-pointer'
            }`}
            style={{ background: `linear-gradient(135deg, ${portal.color}, ${portal.accent})` }}
          >
            {/* Coming soon badge */}
            {portal.badge && (
              <span className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/15 text-white/70">
                {portal.badge}
              </span>
            )}

            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center mb-5">
              {portal.icon}
            </div>

            {/* Name + subtitle */}
            <div className="mb-3">
              <div className="text-white font-black text-xl leading-tight">{portal.name}</div>
              <div className="text-white/60 text-xs font-semibold mt-0.5">{portal.subtitle}</div>
            </div>

            {/* Description */}
            <p className="text-white/50 text-xs leading-relaxed mb-5">{portal.description}</p>

            {/* Feature list */}
            <div className="space-y-1.5">
              {portal.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-white/60 text-xs">
                  <div className="w-1 h-1 rounded-full bg-white/40 shrink-0" />
                  {f}
                </div>
              ))}
            </div>

            {/* Arrow on hover */}
            {!portal.disabled && (
              <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      <p className="text-slate-600 text-xs mt-10">Zhenghe Logistics · Internal Operations Platform</p>
    </div>
  );
}

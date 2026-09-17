import { Outlet, NavLink } from 'react-router-dom';
import { useClientAuth } from '../../context/ClientAuthContext';
import PortalLogin from './PortalLogin';

const NAV = [
  {
    to: '/portal',
    end: true,
    label: 'Dashboard',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    to: '/portal/inventory',
    end: false,
    label: 'Inventory',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    to: '/portal/orders',
    end: false,
    label: 'Orders',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
];

export default function PortalLayout() {
  const { isAuthenticated, loading, client, profile, session, logout } = useClientAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="animate-spin w-5 h-5 border-2 border-slate-600 border-t-teal-400 rounded-full" />
          Loading your portal…
        </div>
      </div>
    );
  }

  // The guard: no valid session with a linked client means no portal, full
  // stop. RLS enforces this server-side too — this is just the UI half.
  if (!isAuthenticated) return <PortalLogin />;

  const who = profile?.fullName || session?.user?.email || '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      <header className="bg-[#0f766e] px-4 sm:px-5 h-12 flex items-center shrink-0 z-30 border-b border-white/10">
        <div className="flex items-center gap-2.5 mr-4 sm:mr-8 min-w-0">
          <img
            src="/hive-logo.svg"
            alt="Zhenghe Logistics"
            className="h-7 w-auto shrink-0"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <span className="text-white font-bold text-sm truncate">{client?.name}</span>
        </div>

        <nav className="flex items-center gap-0.5 h-full flex-1 overflow-x-auto">
          {NAV.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                'flex items-center gap-1.5 px-3 sm:px-4 h-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer ' +
                (isActive
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/50 hover:text-white border-b-2 border-transparent')
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-white/50 text-[11px] font-medium hidden sm:block max-w-[180px] truncate">{who}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-xs font-semibold transition-colors cursor-pointer"
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

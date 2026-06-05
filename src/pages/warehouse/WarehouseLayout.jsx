import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import { useTheme } from '../../hooks/useTheme';
import WarehouseLogin from './WarehouseLogin';
import PortalSwitcher from '../../components/PortalSwitcher';

export default function WarehouseLayout() {
  const { user, logout } = useWarehouseAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return <WarehouseLogin />;

  const isHome = location.pathname === '/warehouse';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      {/* Top bar */}
      <header className="bg-[#0f1f5c] px-4 h-14 flex items-center justify-between shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2">
          {!isHome && (
            <button
              onClick={() => navigate('/warehouse')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 text-white mr-1 active:bg-white/25 cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
          )}
          <PortalSwitcher current="brood" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <span className="text-white font-bold text-sm">Brood</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-100 text-sm font-medium">{user.name}</span>
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white active:bg-white/10 cursor-pointer"
          >
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-xs font-semibold active:bg-white/25 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

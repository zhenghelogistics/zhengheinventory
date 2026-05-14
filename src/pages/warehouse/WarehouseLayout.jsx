import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useWarehouseAuth } from '../../context/WarehouseAuthContext';
import WarehouseLogin from './WarehouseLogin';

export default function WarehouseLayout() {
  const { user, logout } = useWarehouseAuth();
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <span className="text-white font-bold text-sm">Warehouse</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-blue-100 text-sm font-medium">{user.name}</span>
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

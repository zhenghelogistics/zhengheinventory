import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import PortalSwitcher from '../../components/PortalSwitcher';

export default function PSSLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/pss';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      <header className="bg-[#064e3b] px-5 h-12 flex items-center justify-between shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <PortalSwitcher current="pss" />
          {!isHome && (
            <button
              onClick={() => navigate('/pss')}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/15 text-white active:bg-white/25 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span className="text-white font-bold text-sm">PSS</span>
          <span className="text-emerald-300/60 text-xs font-medium hidden sm:block">Permit & Shipping Services</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300">
            Prototype
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

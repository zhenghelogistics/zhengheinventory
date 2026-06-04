import { Routes, Route, NavLink } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import MovementListPage from './pages/MovementListPage';
import MovementDetailPage from './pages/MovementDetailPage';
import WarehouseLayout from './pages/warehouse/WarehouseLayout';
import WarehouseHome from './pages/warehouse/WarehouseHome';
import PickList from './pages/warehouse/PickList';
import ReceiveDelivery from './pages/warehouse/ReceiveDelivery';
import UpdateStock from './pages/warehouse/UpdateStock';
import FindItem from './pages/warehouse/FindItem';
import ShipmentCards from './pages/warehouse/ShipmentCards';
import ShipmentDetail from './pages/warehouse/ShipmentDetail';
import ScanClientQR from './pages/warehouse/ScanClientQR';
import PickListsPage from './pages/warehouse/PickListsPage';
import PickExecution from './pages/warehouse/PickExecution';
import ActivityLogPage from './pages/ActivityLogPage';
import { WarehouseAuthProvider } from './context/WarehouseAuthContext';

const NAV = [
  {
    to: '/movements',
    end: false,
    label: 'Stock Movements',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    to: '/activity',
    end: true,
    label: 'Activity Log',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
];

function MainApp() {
  const { dark, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      <header className="bg-[#0f1f5c] px-5 py-0 flex items-center h-12 shrink-0 z-30 border-b border-white/10">
        <div className="flex items-center mr-8">
          <img src="/hive-logo.svg" alt="Hive" className="h-9 w-auto" />
        </div>
        <nav className="flex items-center gap-1 h-full flex-1">
          {NAV.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 h-full text-xs font-semibold transition-colors duration-150 cursor-pointer ` +
                (isActive
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/40 hover:text-white border-b-2 border-transparent')
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
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
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/movements" replace />} />
          <Route path="/movements" element={<MovementListPage />} />
          <Route path="/movements/:id" element={<MovementDetailPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WarehouseAuthProvider>
      <Routes>
        <Route path="/warehouse" element={<WarehouseLayout />}>
          <Route index element={<WarehouseHome />} />
          <Route path="pick-list" element={<PickList />} />
          <Route path="receive" element={<ReceiveDelivery />} />
          <Route path="update-stock" element={<UpdateStock />} />
          <Route path="find-item" element={<FindItem />} />
          <Route path="shipments" element={<ShipmentCards />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="scan-qr" element={<ScanClientQR />} />
          <Route path="pick-lists" element={<PickListsPage />} />
          <Route path="pick-lists/:id" element={<PickExecution />} />
        </Route>
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </WarehouseAuthProvider>
  );
}

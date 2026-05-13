import { Routes, Route, NavLink } from 'react-router-dom';
import InventoryPage from './pages/InventoryPage';
import MovementListPage from './pages/MovementListPage';
import MovementDetailPage from './pages/MovementDetailPage';
import WarehouseLayout from './pages/warehouse/WarehouseLayout';
import WarehouseHome from './pages/warehouse/WarehouseHome';
import PickList from './pages/warehouse/PickList';
import ReceiveDelivery from './pages/warehouse/ReceiveDelivery';
import UpdateStock from './pages/warehouse/UpdateStock';
import FindItem from './pages/warehouse/FindItem';
import ActivityLogPage from './pages/ActivityLogPage';
import { WarehouseAuthProvider } from './context/WarehouseAuthContext';

const NAV = [
  {
    to: '/',
    end: true,
    label: 'Inventory',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
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
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      <header className="bg-blue-700 px-5 py-0 flex items-center h-12 shrink-0 z-30">
        <div className="flex items-center gap-2.5 mr-8">
          <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-white tracking-wide">Zhenghe Logistics</span>
        </div>
        <nav className="flex items-center gap-1 h-full">
          {NAV.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 h-full text-xs font-semibold transition-colors duration-150 cursor-pointer ` +
                (isActive
                  ? 'text-white border-b-2 border-white'
                  : 'text-blue-200 hover:text-white border-b-2 border-transparent')
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<InventoryPage />} />
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
        </Route>
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </WarehouseAuthProvider>
  );
}

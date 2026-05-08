import { useState, useMemo } from 'react';
import { Download, Plus } from 'lucide-react';
import { useInventory } from './hooks/useInventory';
import { isExpired, isExpiringSoon } from './utils/dateHelpers';
import { exportToCSV } from './utils/csvExport';
import SummaryBar from './components/SummaryBar';
import SearchBar from './components/SearchBar';
import InventoryTable from './components/InventoryTable';
import RecordModal from './components/RecordModal';
import ConfirmDialog from './components/ConfirmDialog';
import Toast from './components/Toast';

export default function App() {
  const { records, addRecord, updateRecord, deleteRecord, nextId, storageError } = useInventory();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null); // null | 'add' | record object
  const [toDelete, setToDelete] = useState(null);
  const [toast, setToast] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      const matchSearch = !q || [r.description, r.sku, r.customerName, r.remark]
        .some((f) => (f ?? '').toLowerCase().includes(q));
      const matchFilter =
        filter === 'all' ||
        (filter === 'expired' && isExpired(r.expiryDate)) ||
        (filter === 'expiring' && isExpiringSoon(r.expiryDate)) ||
        (filter === 'no-expiry' && !r.expiryDate);
      return matchSearch && matchFilter;
    });
  }, [records, search, filter]);

  function handleSave(data) {
    if (modal === 'add') addRecord(data);
    else updateRecord(modal.id, data);
    setModal(null);
  }

  function handleDeleteConfirm() {
    deleteRecord(toDelete.id);
    setToDelete(null);
  }

  function handleExport() {
    if (records.length === 0) { setToast('No records to export.'); return; }
    exportToCSV(records);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-none">Inventory Tracker</h1>
            <p className="text-xs text-slate-400 mt-0.5 leading-none">{records.length} items stored locally</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors duration-150 cursor-pointer"
          >
            <Download size={13} strokeWidth={2.5} />
            Export CSV
          </button>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors duration-150 cursor-pointer shadow-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Item
          </button>
        </div>
      </header>

      {/* Summary KPI cards */}
      <SummaryBar records={records} />

      {/* Search + filter */}
      <SearchBar
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        total={records.length}
        showing={filtered.length}
      />

      {/* Table */}
      <div className="flex-1 bg-white border-t border-slate-100">
        <InventoryTable
          records={filtered}
          onEdit={(r) => setModal(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-400 text-center">
        Data stored locally in your browser · No backend required
      </footer>

      {/* Modals */}
      {modal && (
        <RecordModal
          record={modal === 'add' ? null : modal}
          nextId={nextId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          message="Delete this record? This cannot be undone."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setToDelete(null)}
        />
      )}

      <Toast
        message={storageError || toast}
        onClose={() => setToast('')}
      />
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { Download, Plus } from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { isExpired, isExpiringSoon } from '../utils/dateHelpers';
import { exportToCSV } from '../utils/csvExport';
import SummaryBar from '../components/SummaryBar';
import SearchBar from '../components/SearchBar';
import InventoryTable from '../components/InventoryTable';
import RecordModal from '../components/RecordModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';

export default function InventoryPage() {
  const { records, loading, error, addRecord, updateRecord, deleteRecord, nextId } = useInventory();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [flashId, setFlashId] = useState(null);

  useEffect(() => {
    if (error) setToast({ message: error, type: 'error' });
  }, [error]);

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

  async function handleSave(data) {
    const isAdd = modal === 'add';
    try {
      const ok = isAdd ? await addRecord(data) : await updateRecord(modal.id, data);
      if (ok) {
        setModal(null);
        setToast({ message: isAdd ? 'Record added.' : 'Changes saved.', type: 'success' });
        setFlashId(data.id);
        setTimeout(() => setFlashId(null), 2500);
      }
      return ok;
    } catch (e) {
      return false;
    }
  }

  function handleDeleteConfirm() {
    deleteRecord(toDelete.id);
    setToDelete(null);
  }

  function handleExport() {
    if (records.length === 0) { setToast({ message: 'No records to export.', type: 'error' }); return; }
    exportToCSV(records);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Inventory</h2>
          <p className="text-xs text-slate-400 mt-0.5">{records.length} items in stock</p>
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
      </div>

      <SummaryBar records={records} />

      <SearchBar
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        total={records.length}
        showing={filtered.length}
      />

      <div className="flex-1 bg-white border-t border-slate-100 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <svg className="animate-spin w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm font-medium">Loading records…</span>
          </div>
        ) : (
          <InventoryTable
            records={filtered}
            onEdit={(r) => setModal(r)}
            onDelete={(r) => setToDelete(r)}
            flashId={flashId}
          />
        )}
      </div>

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
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';

const KEY = 'inventory_records';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(records) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    return null;
  } catch (e) {
    if (e.name === 'QuotaExceededError') return 'quota';
    return 'error';
  }
}

export function useInventory() {
  const [records, setRecords] = useState(load);
  const [storageError, setStorageError] = useState(null);

  const persist = useCallback((next) => {
    const err = save(next);
    if (err === 'quota') {
      setStorageError('Storage full — export your data and clear old records.');
    } else {
      setStorageError(null);
    }
    setRecords(next);
  }, []);

  const addRecord = useCallback((data) => {
    setRecords((prev) => {
      const maxId = prev.length ? Math.max(...prev.map((r) => r.id)) : 0;
      const next = [...prev, { ...data, id: data.id ?? maxId + 1 }];
      persist(next);
      return next;
    });
  }, [persist]);

  const updateRecord = useCallback((id, data) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...data, id } : r));
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteRecord = useCallback((id) => {
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const nextId = records.length ? Math.max(...records.map((r) => r.id)) + 1 : 1;

  return { records, addRecord, updateRecord, deleteRecord, nextId, storageError };
}

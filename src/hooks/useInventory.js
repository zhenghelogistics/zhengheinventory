import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// camelCase <-> snake_case mappers
function toRow(r) {
  return {
    id: r.id,
    description: r.description,
    quantity: r.quantity,
    sku: r.sku || null,
    date_in: r.dateIn || null,
    date_out: r.dateOut || null,
    num_packages: r.numPackages ?? null,
    dimension: r.dimension || null,
    weight: r.weight || null,
    expiry_date: r.expiryDate || null,
    customer_name: r.customerName || null,
    remark: r.remark || null,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    description: r.description,
    quantity: r.quantity,
    sku: r.sku,
    dateIn: r.date_in,
    dateOut: r.date_out,
    numPackages: r.num_packages,
    dimension: r.dimension,
    weight: r.weight,
    expiryDate: r.expiry_date,
    customerName: r.customer_name,
    remark: r.remark,
  };
}

export function useInventory() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventory_records')
        .select('*')
        .order('id', { ascending: true });
      if (error) setError(error.message);
      else setRecords((data ?? []).map(fromRow));
      setLoading(false);
    }
    fetchAll();
  }, []);

  const addRecord = useCallback(async (data) => {
    try {
      const maxId = records.length ? Math.max(...records.map((r) => r.id)) : 0;
      const record = { ...data, id: data.id ?? maxId + 1 };
      const { data: inserted, error } = await supabase
        .from('inventory_records')
        .insert(toRow(record))
        .select()
        .single();
      if (error) { setError(error.message); return false; }
      setRecords((prev) => [...prev, fromRow(inserted)]);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }, [records]);

  const updateRecord = useCallback(async (id, data) => {
    try {
      const { data: updated, error } = await supabase
        .from('inventory_records')
        .update(toRow({ ...data, id }))
        .eq('id', id)
        .select()
        .single();
      if (error) { setError(error.message); return false; }
      setRecords((prev) => prev.map((r) => (r.id === id ? fromRow(updated) : r)));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }, []);

  const deleteRecord = useCallback(async (id) => {
    try {
      const { error } = await supabase
        .from('inventory_records')
        .delete()
        .eq('id', id);
      if (error) { setError(error.message); return; }
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const nextId = records.length ? Math.max(...records.map((r) => r.id)) + 1 : 1;

  return { records, loading, error, addRecord, updateRecord, deleteRecord, nextId };
}

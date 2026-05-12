import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMovements() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('movements')
      .select(`*, cost_lines(amount_sgd), stock_lines(sku, description, qty_actual, qty_out, date_in, date_out, unit, line_type)`)
      .order('created_at', { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }
    setMovements(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  const createMovement = useCallback(async (type = 'Inbound') => {
    const { data, error } = await supabase
      .from('movements')
      .insert({ type })
      .select(`*, cost_lines(amount_sgd), stock_lines(sku, description, qty_actual, qty_out, date_in, date_out, unit, line_type)`)
      .single();
    if (error) { setError(error.message); return null; }
    setMovements((prev) => [data, ...prev]);
    return data;
  }, []);

  const deleteMovement = useCallback(async (id) => {
    const { error } = await supabase.from('movements').delete().eq('id', id);
    if (error) { setError(error.message); return false; }
    setMovements((prev) => prev.filter((m) => m.id !== id));
    return true;
  }, []);

  return { movements, loading, error, fetchMovements, createMovement, deleteMovement };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMovementDetail(id) {
  const [movement, setMovement] = useState(null);
  const [costLines, setCostLines] = useState([]);
  const [stockLines, setStockLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [mv, cl, sl] = await Promise.all([
      supabase.from('movements').select('*').eq('id', id).single(),
      supabase.from('cost_lines').select('*').eq('movement_id', id).order('sort_order').order('created_at'),
      supabase.from('stock_lines').select('*').eq('movement_id', id).order('sort_order').order('created_at'),
    ]);
    if (mv.error) { setError(mv.error.message); setLoading(false); return; }
    setMovement(mv.data);
    setCostLines(cl.data || []);
    setStockLines(sl.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateMovement = useCallback(async (fields) => {
    const { data, error } = await supabase
      .from('movements')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return false;
    setMovement(data);
    return true;
  }, [id]);

  // Cost lines
  const addCostLine = useCallback(async () => {
    const { data, error } = await supabase
      .from('cost_lines')
      .insert({ movement_id: id, currency: 'SGD', sort_order: costLines.length })
      .select().single();
    if (error) return null;
    setCostLines((prev) => [...prev, data]);
    return data;
  }, [id, costLines.length]);

  const updateCostLine = useCallback(async (lineId, fields) => {
    const { data, error } = await supabase
      .from('cost_lines').update(fields).eq('id', lineId).select().single();
    if (error) return false;
    setCostLines((prev) => prev.map((l) => l.id === lineId ? data : l));
    return true;
  }, []);

  const deleteCostLine = useCallback(async (lineId) => {
    const { error } = await supabase.from('cost_lines').delete().eq('id', lineId);
    if (error) return false;
    setCostLines((prev) => prev.filter((l) => l.id !== lineId));
    return true;
  }, []);

  // Stock lines
  const addStockLine = useCallback(async () => {
    const { data, error } = await supabase
      .from('stock_lines')
      .insert({ movement_id: id, sort_order: stockLines.length })
      .select().single();
    if (error) return null;
    setStockLines((prev) => [...prev, data]);
    return data;
  }, [id, stockLines.length]);

  const updateStockLine = useCallback(async (lineId, fields) => {
    const { data, error } = await supabase
      .from('stock_lines').update(fields).eq('id', lineId).select().single();
    if (error) return false;
    setStockLines((prev) => prev.map((l) => l.id === lineId ? data : l));
    return true;
  }, []);

  const deleteStockLine = useCallback(async (lineId) => {
    const { error } = await supabase.from('stock_lines').delete().eq('id', lineId);
    if (error) return false;
    setStockLines((prev) => prev.filter((l) => l.id !== lineId));
    return true;
  }, []);

  return {
    movement, costLines, stockLines, loading, error,
    updateMovement,
    addCostLine, updateCostLine, deleteCostLine,
    addStockLine, updateStockLine, deleteStockLine,
    refetch: fetch,
  };
}

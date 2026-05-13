import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useMovementDetail(id) {
  const [movement, setMovement] = useState(null);
  const [costLines, setCostLines] = useState([]);
  const [stockLines, setStockLines] = useState([]);
  const [releaseOrders, setReleaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [mv, cl, sl, ro] = await Promise.all([
      supabase.from('movements').select('*').eq('id', id).single(),
      supabase.from('cost_lines').select('*').eq('movement_id', id).order('sort_order').order('created_at'),
      supabase.from('stock_lines').select('*').eq('movement_id', id).order('sort_order').order('created_at'),
      supabase.from('release_orders').select('*').eq('movement_id', id).order('sort_order').order('created_at'),
    ]);
    if (mv.error) { setError(mv.error.message); setLoading(false); return; }
    setMovement(mv.data);
    setCostLines(cl.data || []);
    setStockLines(sl.data || []);
    setReleaseOrders(ro.data || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`stock_lines_rt_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_lines', filter: `movement_id=eq.${id}` }, (payload) => {
        setStockLines((prev) => prev.map((l) => l.id === payload.new.id ? payload.new : l));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_lines', filter: `movement_id=eq.${id}` }, (payload) => {
        setStockLines((prev) => {
          if (prev.find((l) => l.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stock_lines', filter: `movement_id=eq.${id}` }, (payload) => {
        setStockLines((prev) => prev.filter((l) => l.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

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

  // Release orders
  const addReleaseOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from('release_orders')
      .insert({ movement_id: id, sort_order: releaseOrders.length })
      .select().single();
    if (error) return null;
    setReleaseOrders((prev) => [...prev, data]);
    return data;
  }, [id, releaseOrders.length]);

  const updateReleaseOrder = useCallback(async (lineId, fields) => {
    const { data, error } = await supabase
      .from('release_orders').update(fields).eq('id', lineId).select().single();
    if (error) return false;
    setReleaseOrders((prev) => prev.map((l) => l.id === lineId ? data : l));
    return true;
  }, []);

  const deleteReleaseOrder = useCallback(async (lineId) => {
    const { error } = await supabase.from('release_orders').delete().eq('id', lineId);
    if (error) return false;
    setReleaseOrders((prev) => prev.filter((l) => l.id !== lineId));
    return true;
  }, []);

  return {
    movement, costLines, stockLines, releaseOrders, loading, error,
    updateMovement,
    addCostLine, updateCostLine, deleteCostLine,
    addStockLine, updateStockLine, deleteStockLine,
    addReleaseOrder, updateReleaseOrder, deleteReleaseOrder,
    refetch: fetch,
  };
}

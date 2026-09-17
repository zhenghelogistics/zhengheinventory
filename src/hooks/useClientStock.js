import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClientAuth } from '../context/ClientAuthContext';

/**
 * The signed-in client's stock position, one row per SKU.
 *
 * Reads the client_stock_summary view. No client_id filter is applied here
 * on purpose — RLS narrows the view to the caller's own client, so a bug in
 * this file can't widen what comes back.
 */
export function useClientStock() {
  const { client } = useClientAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStock = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('client_stock_summary')
      .select('*')
      .order('sku');
    if (err) setError(err.message);
    else { setRows(data || []); setError(null); }
    setLoading(false);
  }, [client?.id]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  // Batch-level detail for one SKU — receiving dates, lots and expiries.
  const fetchBatches = useCallback(async (productId) => {
    const { data, error: err } = await supabase
      .from('stock_batches')
      .select('id, batch_no, received_date, expiry_date, qty_received, qty_allocated, qty_dispatched, qty_available')
      .eq('product_id', productId)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('received_date', { ascending: true });
    if (err) { setError(err.message); return []; }
    return data || [];
  }, []);

  return { rows, loading, error, refetch: fetchStock, fetchBatches };
}

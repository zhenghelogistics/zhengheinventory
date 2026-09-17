import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClientAuth } from '../context/ClientAuthContext';

/**
 * The signed-in client's stock position, one row per SKU.
 *
 * Reads the client_stock_summary view. RLS already narrows this to the
 * caller's own client; the explicit client_id filter is belt-and-braces, and
 * is what keeps dev preview mode (no JWT, so no RLS narrowing) honest.
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
      .eq('client_id', client.id)
      .order('sku');
    if (err) setError(err.message);
    else { setRows(data || []); setError(null); }
    setLoading(false);
  }, [client?.id]);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  // Batch-level detail for one SKU — receiving dates, lots and expiries.
  const fetchBatches = useCallback(async (productId) => {
    if (!client?.id) return [];
    const { data, error: err } = await supabase
      .from('stock_batches')
      .select('id, batch_no, received_date, expiry_date, qty_received, qty_allocated, qty_dispatched, qty_available')
      .eq('client_id', client.id)
      .eq('product_id', productId)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('received_date', { ascending: true });
    if (err) { setError(err.message); return []; }
    return data || [];
  }, [client?.id]);

  return { rows, loading, error, refetch: fetchStock, fetchBatches };
}

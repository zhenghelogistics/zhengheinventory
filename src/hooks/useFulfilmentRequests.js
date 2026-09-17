import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const OPEN_STATUSES = ['New', 'Confirmed', 'Picking', 'Packed', 'Out for Delivery'];

/**
 * Client-submitted delivery requests, for the internal Hive queue.
 *
 * Reads the fulfilment_requests view. Accepting one calls staff_confirm_order,
 * which creates the Outbound movement and its stock lines — from there the
 * existing pick-list flow takes over and a trigger mirrors its progress back
 * onto the client's order.
 */
export function useFulfilmentRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequests = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('fulfilment_requests')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (err) setError(err.message);
    else { setRequests(data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // New requests arrive without anyone refreshing — this is the queue the
  // warehouse watches.
  useEffect(() => {
    const channel = supabase
      .channel('fulfilment_requests_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_orders' },
        () => { fetchRequests(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const fetchLines = useCallback(async (orderId) => {
    const { data } = await supabase
      .from('client_order_lines')
      .select('*')
      .eq('order_id', orderId)
      .order('line_no');
    return data || [];
  }, []);

  const confirmOrder = useCallback(async (orderId, actor = 'Hive') => {
    const { data, error: err } = await supabase.rpc('staff_confirm_order', {
      p_order_id: orderId,
      p_actor: actor,
    });
    if (err) {
      if (err.message?.includes('ORDER_NOT_NEW')) {
        return { ok: false, error: 'This request has already been accepted.' };
      }
      return { ok: false, error: err.message };
    }
    await fetchRequests();
    return { ok: true, order: data };
  }, [fetchRequests]);

  return { requests, loading, error, refetch: fetchRequests, fetchLines, confirmOrder };
}

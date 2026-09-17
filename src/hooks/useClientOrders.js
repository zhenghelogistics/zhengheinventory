import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useClientAuth } from '../context/ClientAuthContext';

export const ORDER_STATUSES = [
  'New', 'Confirmed', 'Picking', 'Packed', 'Out for Delivery', 'Completed', 'Cancelled',
];

export const ORDER_STATUS_COLORS = {
  'New':              'bg-blue-100 text-blue-700',
  'Confirmed':        'bg-violet-100 text-violet-700',
  'Picking':          'bg-amber-100 text-amber-700',
  'Packed':           'bg-orange-100 text-orange-700',
  'Out for Delivery': 'bg-cyan-100 text-cyan-700',
  'Completed':        'bg-emerald-100 text-emerald-700',
  'Cancelled':        'bg-slate-100 text-slate-500',
};

/**
 * The signed-in client's delivery requests.
 *
 * Reads are RLS-scoped. Writes go exclusively through Postgres functions —
 * the browser holds no INSERT grant on client_orders, so stock validation
 * and allocation can't be skipped by calling the table directly.
 */
export function useClientOrders() {
  const { client } = useClientAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('client_orders')
      .select('*, client_order_lines(id, sku, description, unit, qty_ordered, qty_dispatched)')
      .order('submitted_at', { ascending: false });
    if (err) setError(err.message);
    else { setOrders(data || []); setError(null); }
    setLoading(false);
  }, [client?.id]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Live status updates — the warehouse moves an order through its states in
  // Hive/Brood and the client's screen follows without a refresh.
  useEffect(() => {
    if (!client?.id) return;
    const channel = supabase
      .channel(`client_orders_rt_${client.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'client_orders', filter: `client_id=eq.${client.id}` },
        (payload) => {
          setOrders((prev) => prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [client?.id]);

  /**
   * Submit a delivery request.
   * @param {{product_id: string, qty: number}[]} lines
   * @param {object} details  delivery address, PO number, contact, etc.
   */
  const createOrder = useCallback(async (lines, details) => {
    const { data, error: err } = await supabase.rpc('portal_create_order', {
      p_lines: lines,
      p_delivery_address:       details.deliveryAddress,
      p_po_number:              details.poNumber || null,
      p_consignee_name:         details.consigneeName || null,
      p_delivery_contact_name:  details.contactName || null,
      p_delivery_contact_phone: details.contactPhone || null,
      p_requested_date:         details.requestedDate || null,
      p_delivery_instructions:  details.instructions || null,
      p_reference_no:           details.referenceNo || null,
      p_notes:                  details.notes || null,
    });

    if (err) {
      // Surface the schema's structured failures as something readable.
      if (err.message?.includes('INSUFFICIENT_STOCK')) {
        return { ok: false, error: 'Not enough available stock to fulfil this order. Refresh your inventory and try again.' };
      }
      if (err.message?.includes('UNKNOWN_PRODUCT')) {
        return { ok: false, error: 'One of the selected products is no longer available.' };
      }
      return { ok: false, error: err.message };
    }

    await fetchOrders();
    return { ok: true, order: data };
  }, [fetchOrders]);

  const cancelOrder = useCallback(async (orderId, reason) => {
    const { error: err } = await supabase.rpc('portal_cancel_order', {
      p_order_id: orderId,
      p_reason: reason || null,
    });
    if (err) {
      if (err.message?.includes('ORDER_ALREADY_IN_FULFILMENT')) {
        return {
          ok: false,
          error: 'This order has already been accepted by the warehouse. Contact your account manager to cancel it.',
        };
      }
      return { ok: false, error: err.message };
    }
    await fetchOrders();
    return { ok: true };
  }, [fetchOrders]);

  return { orders, loading, error, refetch: fetchOrders, createOrder, cancelOrder };
}

/**
 * The earliest delivery date the cut-off rules allow right now, resolved by
 * the database so the date shown before submitting is the date the order
 * actually gets.
 */
export function useDeliveryPreview() {
  const { client } = useClientAuth();
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    if (!client?.id) return;
    const { data } = await supabase.rpc('portal_preview_delivery_date');
    if (data?.length) setPreview(data[0]);
  }, [client?.id]);

  useEffect(() => { load(); }, [load]);

  return { preview, refresh: load };
}

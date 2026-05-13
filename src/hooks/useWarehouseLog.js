import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useWarehouseAuth } from '../context/WarehouseAuthContext';

export function useWarehouseLog() {
  const { user } = useWarehouseAuth();

  const log = useCallback(async (action_type, record_id, record_ref, details = {}) => {
    if (!user) return;
    await supabase.from('warehouse_activity_log').insert({
      user_id: user.id,
      user_name: user.name,
      action_type,
      record_id: record_id ? String(record_id) : null,
      record_ref: record_ref || null,
      details,
    });
  }, [user]);

  return { log };
}

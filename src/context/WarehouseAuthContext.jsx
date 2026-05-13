import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const WarehouseAuthContext = createContext(null);

const STORAGE_KEY = 'wh_user';

export function WarehouseAuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function login(name, pin) {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('warehouse_users')
      .select('*')
      .ilike('name', name.trim())
      .eq('pin', pin.trim())
      .single();
    setLoading(false);
    if (error || !data) {
      setError('Wrong name or PIN. Try again.');
      return false;
    }
    const session = { id: data.id, name: data.name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session);
    return true;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <WarehouseAuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </WarehouseAuthContext.Provider>
  );
}

export function useWarehouseAuth() {
  return useContext(WarehouseAuthContext);
}

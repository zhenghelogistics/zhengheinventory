import { useState, useEffect } from 'react';

export function useFXRates() {
  const [rates, setRates] = useState({ SGD: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/SGD')
      .then((r) => r.json())
      .then((data) => {
        if (data.rates) setRates(data.rates);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Convert amount in foreign currency to SGD
  // rates are per 1 SGD, so: amount_sgd = amount_local / rates[currency]
  function toSGD(amount, currency) {
    if (!currency || currency === 'SGD') return Number(amount) || 0;
    const rate = rates[currency];
    if (!rate) return Number(amount) || 0;
    return (Number(amount) || 0) / rate;
  }

  function getRate(currency) {
    if (!currency || currency === 'SGD') return 1;
    return rates[currency] || 1;
  }

  return { rates, loading, toSGD, getRate };
}

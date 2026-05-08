export function isExpired(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(today());
}

export function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const now = new Date(today());
  const cutoff = new Date(today());
  cutoff.setDate(cutoff.getDate() + days);
  return expiry >= now && expiry <= cutoff;
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

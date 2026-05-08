export const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'On Hold': 'bg-slate-100 text-slate-600',
  'Voided': 'bg-red-100 text-red-600',
};

export const TYPE_COLORS = {
  'Inbound': 'bg-violet-100 text-violet-700',
  'Outbound': 'bg-orange-100 text-orange-700',
  'Internal': 'bg-cyan-100 text-cyan-700',
  'Transfer': 'bg-cyan-100 text-cyan-700',
  'Adjustment': 'bg-pink-100 text-pink-700',
};

export const STATUSES = ['New', 'In Progress', 'Completed', 'On Hold', 'Voided'];
export const TYPES = ['Inbound', 'Outbound', 'Transfer', 'Adjustment'];
export const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'CNY', 'AUD', 'JPY', 'THB', 'IDR'];
export const DOC_TYPES = ['GRN', 'Delivery Order', 'Purchase Order', 'Invoice', 'Other'];

export function fmt(n, dp = 2) {
  if (n == null || n === '') return '—';
  return Number(n).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function calcMovementTotals(costLines = [], totalSale = 0) {
  const totalCost = costLines.reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);
  const sale = Number(totalSale) || 0;
  const profit = sale - totalCost;
  const gp = sale > 0 ? (profit / sale) * 100 : 0;
  return { totalCost, totalSale: sale, profit, gp };
}

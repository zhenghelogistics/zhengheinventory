import { Package, AlertTriangle, Clock, ShoppingCart } from 'lucide-react';
import { isExpired, isExpiringSoon } from '../utils/dateHelpers';

const stats = (records) => {
  const expired = records.filter((r) => isExpired(r.expiryDate)).length;
  const soon = records.filter((r) => isExpiringSoon(r.expiryDate)).length;
  const oos = records.filter((r) => Number(r.quantity) === 0).length;
  return [
    {
      label: 'Total Records',
      value: records.length,
      icon: Package,
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      iconColor: 'text-blue-600',
      valueColor: 'text-blue-800',
      labelColor: 'text-blue-500',
    },
    {
      label: 'Expired',
      value: expired,
      icon: AlertTriangle,
      bg: expired > 0 ? 'bg-red-50' : 'bg-gray-50',
      border: expired > 0 ? 'border-red-100' : 'border-gray-100',
      iconColor: expired > 0 ? 'text-red-500' : 'text-gray-400',
      valueColor: expired > 0 ? 'text-red-700' : 'text-gray-500',
      labelColor: expired > 0 ? 'text-red-400' : 'text-gray-400',
    },
    {
      label: 'Expiring Soon',
      value: soon,
      icon: Clock,
      bg: soon > 0 ? 'bg-amber-50' : 'bg-gray-50',
      border: soon > 0 ? 'border-amber-100' : 'border-gray-100',
      iconColor: soon > 0 ? 'text-amber-500' : 'text-gray-400',
      valueColor: soon > 0 ? 'text-amber-700' : 'text-gray-500',
      labelColor: soon > 0 ? 'text-amber-400' : 'text-gray-400',
    },
    {
      label: 'Out of Stock',
      value: oos,
      icon: ShoppingCart,
      bg: oos > 0 ? 'bg-orange-50' : 'bg-gray-50',
      border: oos > 0 ? 'border-orange-100' : 'border-gray-100',
      iconColor: oos > 0 ? 'text-orange-500' : 'text-gray-400',
      valueColor: oos > 0 ? 'text-orange-700' : 'text-gray-500',
      labelColor: oos > 0 ? 'text-orange-400' : 'text-gray-400',
    },
  ];
};

export default function SummaryBar({ records }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4 border-b border-slate-200 bg-white">
      {stats(records).map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border}`}
          >
            <div className={`flex-shrink-0 p-2 rounded-lg bg-white/60 ${s.iconColor}`}>
              <Icon size={18} strokeWidth={2} />
            </div>
            <div>
              <p className={`text-2xl font-bold leading-none tabular-nums ${s.valueColor}`}>
                {s.value}
              </p>
              <p className={`text-xs mt-0.5 font-medium ${s.labelColor}`}>{s.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

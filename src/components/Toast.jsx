import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Toast({ message, type = 'error', onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;

  const styles = {
    error: {
      bg: 'bg-slate-900 border-slate-700',
      icon: <AlertCircle size={16} strokeWidth={2} className="text-red-400 flex-shrink-0" />,
    },
    success: {
      bg: 'bg-emerald-600 border-emerald-500',
      icon: <CheckCircle2 size={16} strokeWidth={2} className="text-white flex-shrink-0" />,
    },
  };

  const s = styles[type] ?? styles.error;

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 ${s.bg} text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold max-w-sm w-[calc(100%-2rem)] border`}>
      {s.icon}
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="text-white/60 hover:text-white transition-colors duration-150 cursor-pointer flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

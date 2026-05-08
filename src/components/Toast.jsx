import { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-sm w-full mx-4 border border-slate-700">
      <AlertCircle size={16} strokeWidth={2} className="text-red-400 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer flex-shrink-0"
        aria-label="Dismiss"
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore } from '../store/useUIStore';

export const ToastNotification: React.FC = () => {
  const toast = useUIStore((s) => s.toast);
  const dismissToast = useUIStore((s) => s.dismissToast);

  if (!toast) return null;

  const isSuccess = toast.type === 'success' || !toast.type;
  const isError = toast.type === 'error';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-card glass-panel px-4 py-3 transition-all animate-in fade-in slide-in-from-bottom-2"
      style={{ maxWidth: '92vw', width: 440 }}
    >
      <div className="shrink-0">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
        ) : (
          <Info className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--glass-text-primary)] leading-tight">
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-0.5 text-[12px] text-[var(--glass-text-secondary)] leading-normal">
            {toast.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={dismissToast}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-control p-1 text-[var(--glass-text-secondary)] transition hover:bg-[var(--glass-hover)] hover:text-[var(--glass-text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

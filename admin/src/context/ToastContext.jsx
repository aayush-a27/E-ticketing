import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const DURATION = { success: 4000, info: 5000, warning: 7000, error: 8000 };

const STYLES = {
  success: { shell: 'border-good/30 bg-good-soft', icon: 'text-good', Icon: CheckCircle2 },
  error: { shell: 'border-bad/30 bg-bad-soft', icon: 'text-bad', Icon: XCircle },
  warning: { shell: 'border-warn/30 bg-warn-soft', icon: 'text-warn', Icon: AlertTriangle },
  info: { shell: 'border-info/30 bg-info-soft', icon: 'text-info', Icon: Info },
};

/**
 * Every outcome the operator should be told about goes through here, so a
 * success and a failure are never reported two different ways in two places.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant, message, { title, duration } = {}) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, variant, message, title }]);

      const timer = setTimeout(() => dismiss(id), duration ?? DURATION[variant] ?? 5000);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  // Clear every pending timer on unmount rather than firing into nothing.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      warning: (message, options) => push('warning', message, options),
      info: (message, options) => push('info', message, options),
      /** Reports an ApiClientError without ever showing an internal message. */
      fromError: (error, fallback = 'That did not work.') =>
        push('error', error?.message ?? fallback, {
          title: error?.requestId ? `Reference ${error.requestId}` : undefined,
        }),
      dismiss,
    }),
    [push, dismiss],
  );

  const quiet = toasts.filter((toast) => toast.variant !== 'error');
  const urgent = toasts.filter((toast) => toast.variant === 'error');

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        The live regions exist from first render. A region created at the same
        moment as its first message is often not announced at all, so both are
        always mounted and only their contents change.
      */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-60 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5"
        role="region"
        aria-label="Notifications"
      >
        <div aria-live="polite" className="contents">
          {quiet.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
        <div aria-live="assertive" className="contents">
          {urgent.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const style = STYLES[toast.variant] ?? STYLES.info;
  const { Icon } = style;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-3.5 py-3 shadow-raised ${style.shell}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${style.icon}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-xs font-semibold text-ink-700">{toast.title}</p>}
        <p className="text-sm text-ink-800">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 rounded p-1 text-ink-500 transition-colors hover:bg-black/5 hover:text-ink-800"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

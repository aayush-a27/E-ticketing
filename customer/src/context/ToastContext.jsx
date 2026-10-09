import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

const TONE = {
  success: 'text-status-good',
  error: 'text-status-bad',
  warning: 'text-status-warn',
  info: 'text-amber-brand',
};

/**
 * Application feedback. Replaces alert() entirely: these are dismissible,
 * announced to screen readers, and never block the page.
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
    (message, { variant = 'info', duration = 5000, title } = {}) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, variant, title }]);

      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      show: push,
      success: (message, options) => push(message, { ...options, variant: 'success' }),
      error: (message, options) => push(message, { ...options, variant: 'error', duration: 7000 }),
      warning: (message, options) => push(message, { ...options, variant: 'warning' }),
      info: (message, options) => push(message, { ...options, variant: 'info' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const Icon = ICONS[item.variant] ?? Info;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="card-surface pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3.5 shadow-2xl"
                role={item.variant === 'error' ? 'alert' : 'status'}
              >
                <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[item.variant]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {item.title && (
                    <p className="text-sm font-semibold text-ivory">{item.title}</p>
                  )}
                  <p className="text-sm text-ivory-dim">{item.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 rounded p-1 text-ivory-muted transition hover:text-ivory"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

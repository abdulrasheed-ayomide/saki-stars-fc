import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle, Info } from 'lucide-react';

const ToastContext = createContext({ notify: () => {} });
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (message, tone = 'success') => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-2 bottom-2 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
        {toasts.map((t) => {
          const Icon = t.tone === 'error' ? XCircle : t.tone === 'info' ? Info : CheckCircle2;
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-lg ${t.tone === 'error' ? 'bg-red-800 text-white' : 'bg-brand-950 text-white'}`}>
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 flex-1">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 grid size-10 shrink-0 place-items-center rounded hover:bg-white/10">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

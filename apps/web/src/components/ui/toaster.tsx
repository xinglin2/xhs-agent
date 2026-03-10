'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastContextType {
  toast: (item: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextType>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...item }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-sm z-[100] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-xhs px-4 py-3 shadow-xhs-card border animate-slide-up',
              t.variant === 'destructive'
                ? 'bg-red-50 border-red-200'
                : 'bg-white border-gray-100',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {t.title && (
                  <p className={cn('text-sm font-semibold', t.variant === 'destructive' ? 'text-red-700' : 'text-xhs-dark')}>
                    {t.title}
                  </p>
                )}
                {t.description && (
                  <p className={cn('text-xs mt-0.5', t.variant === 'destructive' ? 'text-red-600' : 'text-xhs-muted')}>
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((i) => i.id !== t.id))}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}

export function Toaster() {
  // The ToastProvider wraps the app; this component is a no-op placeholder for compatibility
  return null;
}

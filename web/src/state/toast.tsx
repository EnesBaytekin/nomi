import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastCtx {
  show: (message: string, kind?: 'ok' | 'err') => void;
}

const Ctx = createContext<ToastCtx | null>(null);

interface Item {
  id: number;
  message: string;
  kind: 'ok' | 'err';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 2400);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={`rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${
              i.kind === 'ok' ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'
            }`}
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {i.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı');
  return ctx;
}

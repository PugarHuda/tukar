"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastTone = "info" | "success" | "error";
type Toast = { id: number; msg: string; tone: ToastTone };

const Ctx = createContext<{ toast: (msg: string, tone?: ToastTone) => void } | null>(null);

// A small label slip: ink edge for info, stamp-blue edge for success, tape-red for errors.
const toneCls: Record<ToastTone, string> = {
  info: "border-ink text-ink",
  success: "border-stamp text-stamp-deep",
  error: "border-tape text-tape-deep",
};

/** Minimal toast host. Wrap a route (or the app) and call useToast().toast(...). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, msg, tone }]);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-card border-2 bg-label px-4 py-3 text-[13px] font-medium shadow-lift animate-tk-pop ${toneCls[t.tone]}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within <ToastProvider>");
  return v;
}

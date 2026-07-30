"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastTone = "info" | "success" | "error";
type Toast = { id: number; msg: string; tone: ToastTone };

const Ctx = createContext<{ toast: (msg: string, tone?: ToastTone) => void } | null>(null);

const toneCls: Record<ToastTone, string> = {
  info: "border-orange/40 text-ts",
  success: "border-green/40 text-green-t",
  error: "border-red/45 text-red-t",
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
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm rounded-xl border bg-bg/90 px-4 py-3 text-[13px] shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur animate-tk-pop ${toneCls[t.tone]}`}
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

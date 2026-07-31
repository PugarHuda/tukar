"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Role-picker modal. Each LaunchButton co-locates its own trigger + dialog and
// returns focus to itself on close, so the hero / header / apps CTAs can each
// open the same picker without any shared context.
const ROLES = [
  { href: "/sender", kind: "consumer", label: "Consumer app", title: "Send money", desc: "Deposit USDC and share a claim link. Mobile-first." },
  { href: "/receiver", kind: "consumer", label: "Consumer app", title: "Receive & cash out", desc: "Claim a payment and off-ramp to local fiat." },
  { href: "/regulator", kind: "dash", label: "Dashboard", title: "Regulator console", desc: "Verify disclosures and issue audit requests." },
  { href: "/operator", kind: "dash", label: "Dashboard", title: "Operator console", desc: "Pool health, ASP policy, oracle, and corridor config." },
] as const;

export function LaunchButton({ className, children }: { className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={"launch-trigger " + className}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && (
        <LaunchDialog
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function LaunchDialog({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal renders after mount only, so document.body exists and SSR emits nothing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="launch-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="launch-dialog" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <div className="launch-head">
          <h2 id="launch-title">Open Tukar as</h2>
          <button type="button" className="launch-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="launch-grid">
          {ROLES.map((r) => (
            <Link key={r.href} href={r.href} className="card app-card" onClick={onClose}>
              <span className={"app-kind " + r.kind}>{r.label}</span>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
              <span className="app-go">Open {r.href} →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

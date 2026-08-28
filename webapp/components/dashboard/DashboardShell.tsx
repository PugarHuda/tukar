"use client";

// Shared desk frame for the Tukar Regulator / Operator consoles: the clipboard (Sidebar) pinned
// on the left, kraft ground with label sheets scrolling on the right. Below `lg` the clipboard
// collapses to a label strip along the top with a hamburger that opens the same Sidebar as an
// overlay drawer.
import { useEffect, useRef, useState } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { trapTab } from "@/lib/focus-trap";

export type { NavItem };

export function DashboardShell({
  title,
  nav,
  active,
  onSelect,
  children,
}: {
  title: string;
  nav: NavItem[];
  active: string;
  onSelect: (key: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const activeLabel = nav.find((n) => n.key === active)?.label ?? title;

  const select = (key: string) => {
    onSelect(key);
    setOpen(false); // close the drawer after a mobile selection
  };

  // Focus management for the mobile drawer (mirrors LaunchModal): move focus to the first
  // nav item on open, trap Tab within the drawer, ESC closes, return focus to the hamburger.
  useEffect(() => {
    if (!open) return;
    const panel = drawerRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    // Deferred a frame: WebKit ignores a synchronous focus() into a drawer opened by the same tap.
    const raf = requestAnimationFrame(() => (panel?.querySelector<HTMLElement>("nav button") ?? focusables()[0])?.focus());

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      trapTab(e, focusables());
    }
    // Captured now: by cleanup time the ref may point elsewhere (react-hooks/exhaustive-deps).
    const hamburger = hamburgerRef.current;
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      hamburger?.focus();
    };
  }, [open]);

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden">
      {/* Desktop clipboard: fixed width, full height, an ink rule where it meets the desk */}
      <aside className="hidden w-[264px] shrink-0 border-r-[1.5px] border-ink bg-label shadow-[6px_0_18px_-12px_rgba(22,19,17,0.6)] lg:block">
        <Sidebar title={title} nav={nav} active={active} onSelect={onSelect} />
      </aside>

      {/* Mobile top strip: a label along the top edge of the box */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b-2 border-ink bg-label px-4 py-2.5 shadow-[0_6px_14px_-10px_rgba(22,19,17,0.5)] lg:hidden">
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-stub border border-ink p-2 text-ink transition-[background-color,color] duration-clock ease-clock hover:bg-ink hover:text-label"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="min-w-0 truncate font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">{title}</span>
        <span className="ml-auto shrink-0 font-stencil text-[15px] uppercase leading-none text-ink">{activeLabel}</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-ink/55"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-y-0 left-0 w-[264px] max-w-[88vw] border-r-[1.5px] border-ink bg-label shadow-lift"
          >
            <Sidebar title={title} nav={nav} active={active} onSelect={select} />
          </div>
        </div>
      )}

      {/* Main: the kraft desk, scrolls independently on desktop */}
      <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">{children}</main>
    </div>
  );
}

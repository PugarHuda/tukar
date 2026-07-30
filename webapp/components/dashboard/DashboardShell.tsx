"use client";

// Shared desktop-dashboard shell for the Tukar Regulator / Operator consoles.
// Fixed left sidebar (brand, nav, wallet) + independently scrolling main content.
// Below `lg` the rail collapses to a top bar with a hamburger that opens the same
// Sidebar as an overlay drawer.
import { useEffect, useRef, useState } from "react";
import { Sidebar, type NavItem } from "./Sidebar";

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
    (panel?.querySelector<HTMLElement>("nav button") ?? focusables()[0])?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
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
      hamburgerRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden">
      {/* Desktop rail — fixed width, full height */}
      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar title={title} nav={nav} active={active} onSelect={onSelect} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line-input p-2 text-ts hover:border-orange/50 hover:text-tp"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-mono text-[10px] tracking-[0.16em] text-tf uppercase">{title}</span>
        <span className="ml-auto text-[13px] font-semibold text-tp">{activeLabel}</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/60"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-y-0 left-0 w-[264px] border-r border-line bg-bg shadow-xl"
          >
            <Sidebar title={title} nav={nav} active={active} onSelect={select} />
          </div>
        </div>
      )}

      {/* Main content — scrolls independently on desktop */}
      <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">{children}</main>
    </div>
  );
}

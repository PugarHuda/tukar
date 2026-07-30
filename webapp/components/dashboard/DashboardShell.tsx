"use client";

// Shared desktop-dashboard shell for the Tukar Regulator / Operator consoles.
// Fixed left sidebar (brand, nav, wallet) + independently scrolling main content.
// Below `lg` the rail collapses to a top bar with a hamburger that opens the same
// Sidebar as an overlay drawer.
import { useState } from "react";
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
  const activeLabel = nav.find((n) => n.key === active)?.label ?? title;

  const select = (key: string) => {
    onSelect(key);
    setOpen(false); // close the drawer after a mobile selection
  };

  return (
    <div className="lg:flex lg:h-screen lg:overflow-hidden">
      {/* Desktop rail — fixed width, full height */}
      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar title={title} nav={nav} active={active} onSelect={onSelect} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
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
          <div className="absolute inset-y-0 left-0 w-[264px] border-r border-line bg-bg shadow-xl">
            <Sidebar title={title} nav={nav} active={active} onSelect={select} />
          </div>
        </div>
      )}

      {/* Main content — scrolls independently on desktop */}
      <main className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">{children}</main>
    </div>
  );
}

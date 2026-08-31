"use client";

// Shared sidebar content for the Tukar consoles (Regulator / Operator): the desk's clipboard.
// A label sheet held under a drawn clip; the nav is a column of manifest tabs (stencil section
// names with a typed index, because the sequence is the real navigation order). WalletBar is
// pinned at the bottom. Rendered by DashboardShell both in the fixed desktop rail and inside
// the mobile drawer.
import Link from "next/link";
import { WalletBar } from "@/components/WalletBar";
import { Wordmark } from "@/components/landing/Wordmark";

export type NavItem = { key: string; label: string; icon?: React.ReactNode };

// The bulldog clip at the top of the board, drawn in the world's own stroke.
function Clip() {
  return (
    <svg width="72" height="24" viewBox="0 0 72 24" aria-hidden="true" className="absolute left-1/2 top-0 -translate-x-1/2">
      <rect x="1" y="8" width="70" height="15" rx="2" fill="#a97a45" stroke="#161311" strokeWidth="1.5" />
      <path d="M26 8V5a10 10 0 0 1 20 0v3" fill="none" stroke="#161311" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 15.5h56" stroke="#f6f1e7" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

export function Sidebar({
  title,
  nav,
  active,
  onSelect,
}: {
  title: string;
  nav: NavItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-label">
      <div className="relative border-b-[1.5px] border-ink px-5 pb-4 pt-8">
        <Clip />
        <Link href="/" className="inline-flex" aria-label="Tukar home">
          <Wordmark height={28} />
        </Link>
        <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">{title}</p>
      </div>

      <nav className="flex-1 overflow-y-auto" aria-label="Sections">
        <ul>
          {nav.map((item, i) => {
            const on = item.key === active;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => onSelect(item.key)}
                  // No crossfade here: selecting a section swaps a near-black background against
                  // near-white text, and while those two animate past each other the row's number
                  // and label are unreadable for the length of the transition. The swap is instant.
                  className={`grid w-full grid-cols-[3ch_minmax(0,1fr)_auto] items-center gap-3 border-b border-ink/20 px-5 py-3 text-left ${
                    on ? "bg-ink text-label" : "text-ink hover:bg-label-2"
                  }`}
                >
                  <span className={`font-mono text-[11px] font-bold ${on ? "text-label/80" : "text-ink-3"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-stencil text-[17px] uppercase leading-none tracking-[0.02em]">{item.label}</span>
                  {item.icon && <span aria-hidden="true" className="inline-flex">{item.icon}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href="/"
        className="flex items-center gap-2 border-t border-ink/30 px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 transition-[background-color,color] duration-clock ease-clock hover:bg-label-2 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to home
      </Link>

      <div className="border-t-[1.5px] border-ink px-4 py-4">
        <WalletBar />
      </div>
    </div>
  );
}

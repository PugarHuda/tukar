"use client";

// Shared sidebar content for the Tukar desktop dashboards (Regulator / Operator).
// Presentational only: brand at top, nav list with active highlight, WalletBar pinned
// at the bottom. Rendered by DashboardShell both in the fixed desktop rail and inside
// the mobile drawer.
import Link from "next/link";
import { WalletBar } from "@/components/WalletBar";

export type NavItem = { key: string; label: string; icon?: React.ReactNode };

// Same inline hexagon + diamond mark used on the landing page (app/page.tsx BrandMark).
const MARK = "M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z";
const MARK_LINE = "M1 16H12M20 16H31";
const MARK_DIAMOND = "M16 11 21 16 16 21 11 16Z";
const MARK_INNER = "M16 13.2 18.8 16 16 18.8 13.2 16Z";

function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d={MARK} stroke="#ff8a3d" strokeWidth="2" strokeLinejoin="round" />
      <path d={MARK_LINE} stroke="#ffb070" strokeWidth="2" strokeLinecap="round" />
      <path d={MARK_DIAMOND} fill="#ff7a1a" />
      <path d={MARK_INNER} fill="#0a0705" />
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
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={26} />
          <span className="text-lg font-extrabold tracking-[-0.01em] text-tp">Tukar</span>
        </Link>
        <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-tf uppercase">{title}</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1.5">
          {nav.map((item) => {
            const on = item.key === active;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => onSelect(item.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                    on
                      ? "border-orange/45 bg-orange/[0.08] text-tp"
                      : "border-transparent text-tm hover:border-orange/25 hover:bg-white/[0.03] hover:text-ts"
                  }`}
                >
                  {item.icon && <span className={on ? "text-orange" : "text-tf"}>{item.icon}</span>}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href="/"
        className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] font-semibold text-tm transition-colors hover:bg-white/[0.03] hover:text-ts"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to home
      </Link>

      <div className="border-t border-line px-4 py-4">
        <WalletBar />
      </div>
    </div>
  );
}

// The unified documentation index. Every entry is a real file in the repository, read at build
// time; the listing text under each title is that file's own opening paragraph, so it cannot
// describe something the document no longer says.
import type { Metadata } from "next";
import Link from "next/link";
import { Seal } from "@/components/ui";
import { ARTIFACTS, DOCS, GROUPS, blurb } from "@/lib/docs";
import "./docs.css";

export const metadata: Metadata = {
  title: "Documentation — Tukar",
  description:
    "Every Tukar development document in one place: architecture, threat model, test plan, product and design, SCF submission material, and the demo scripts.",
};

const BAR =
  "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[2px] bg-ink px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label";

export default function DocsIndexPage() {
  return (
    <main className="mx-auto max-w-wrap px-4 py-8 sm:px-7 sm:py-14">
      <div className="rounded-[3px] border border-ink bg-label shadow-card">
        <div className={BAR}>
          <span>Tukar</span>
          <span>Documentation</span>
          <span className="ml-auto">{DOCS.length} documents</span>
        </div>

        <div className="px-5 pb-8 sm:px-7">
          <h1 className="mt-6 font-stencil text-[clamp(30px,6vw,44px)] uppercase leading-[0.98] tracking-[0.01em] text-ink">
            Project documentation
          </h1>
          <p className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-ink-2">
            Every development document for Tukar, grouped by what it is for. These pages are rendered from the markdown
            files in the repository at build time, so there is one copy of each document and it is the one the code is
            built from.
          </p>

          {GROUPS.map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`} className="mt-10">
              <h2
                id={`g-${g.id}`}
                className="border-t border-ink/25 pt-4 font-stencil text-[24px] uppercase leading-[1.05] tracking-[0.02em] text-ink"
              >
                {g.name}
              </h2>
              <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-ink-2">{g.note}</p>
              <ul className="mt-4 divide-y divide-ink/25 border-t border-ink/25">
                {g.docs.map((d) => (
                  <li key={d.slug} className="py-3.5">
                    <Link
                      href={`/docs/${d.slug}`}
                      className="font-stencil text-[17px] uppercase leading-[1.15] tracking-[0.04em] text-stamp-deep underline decoration-1 hover:text-stamp"
                      {...(d.lang ? { lang: d.lang } : {})}
                    >
                      {d.title}
                    </Link>
                    <p className="mt-1 max-w-[72ch] text-[13.5px] leading-relaxed text-ink-2">{blurb(d.file)}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-3">{d.file}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section aria-labelledby="g-artifacts" className="mt-10">
            <h2
              id="g-artifacts"
              className="border-t border-ink/25 pt-4 font-stencil text-[24px] uppercase leading-[1.05] tracking-[0.02em] text-ink"
            >
              Diagrams and interface
            </h2>
            <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-ink-2">
              The parts of the record that are not prose: the drawn architecture, captures of the shipped screens, the
              deck, and the deployment file every contract id is read from.
            </p>
            <ul className="mt-4 divide-y divide-ink/25 border-t border-ink/25">
              {ARTIFACTS.map((a) => (
                <li key={a.href} className="py-3.5">
                  <a
                    href={a.href}
                    {...(a.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener" })}
                    className="font-stencil text-[17px] uppercase leading-[1.15] tracking-[0.04em] text-stamp-deep underline decoration-1 hover:text-stamp"
                  >
                    {a.label}
                  </a>
                  <p className="mt-1 max-w-[72ch] text-[13.5px] leading-relaxed text-ink-2">{a.what}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/25 px-5 py-3 font-mono text-[11px] text-ink-3 sm:px-7">
          <Link href="/" className="text-stamp-deep underline hover:text-stamp">
            Back to home
          </Link>
          <span>Rendered from the repository at build time.</span>
          <Seal size={18} className="ml-auto shrink-0" />
        </div>
      </div>
    </main>
  );
}

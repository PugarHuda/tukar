// One document, rendered from its real file in the repository. Every page here is generated at
// build time from the list in lib/docs.ts, so there is no request-time file access and no copy
// of any markdown inside the app.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Seal } from "@/components/ui";
import { DOCS, blurb, docBySlug, groupOfSlug, renderDoc, sourceUrl } from "@/lib/docs";
import "../docs.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

const BAR =
  "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[2px] bg-ink px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) return {};
  return { title: `${doc.title} — Tukar documentation`, description: blurb(doc.file) || undefined };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  const group = groupOfSlug(slug);
  if (!doc || !group) notFound();
  const html = renderDoc(doc.file);

  return (
    <main className="mx-auto max-w-wrap px-4 py-8 sm:px-7 sm:py-14">
      <div className="rounded-[3px] border border-ink bg-label shadow-card">
        <div className={BAR}>
          <span>Tukar</span>
          <span>Documentation</span>
          <span className="ml-auto">{group.name}</span>
        </div>

        <div className="px-5 pb-8 sm:px-7">
          <nav aria-label="Breadcrumb" className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            <Link href="/docs" className="text-stamp-deep underline hover:text-stamp">
              All documentation
            </Link>
            <span className="px-1.5" aria-hidden="true">
              /
            </span>
            <span>{group.name}</span>
          </nav>

          <article
            className="doc-body mt-6"
            {...(doc.lang ? { lang: doc.lang } : {})}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink/25 px-5 py-3 font-mono text-[11px] text-ink-3 sm:px-7">
          <span>
            Source:{" "}
            <a href={sourceUrl(doc.file)} target="_blank" rel="noopener" className="text-stamp-deep underline hover:text-stamp">
              {doc.file}
            </a>
          </span>
          <Link href="/docs" className="text-stamp-deep underline hover:text-stamp">
            All documentation
          </Link>
          <Seal size={18} className="ml-auto shrink-0" />
        </div>
      </div>
    </main>
  );
}

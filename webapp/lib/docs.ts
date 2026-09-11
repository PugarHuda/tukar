// The project's documentation, served from the real markdown files in the repository.
//
// Nothing here is a copy: every page reads docs/*.md (plus README.md, PRODUCT.md and DESIGN.md)
// off disk at build time, so an edit to a document is live on the next deploy and the site can
// never drift from the source. The route is fully static; no file is read at request time.
//
// What is NOT served: the internal working notes (session handoffs, activation checklists, the
// admin-signed contract upgrade runbook, a drafted email, an unfilled report template). Those
// are operating instructions for the maintainer, not project documentation for a reader.
import fs from "node:fs";
import path from "node:path";
import { Marked, Renderer } from "marked";

const REPO = "https://github.com/PugarHuda/tukar";
const BLOB = `${REPO}/blob/main/`;
const RAW = "https://raw.githubusercontent.com/PugarHuda/tukar/main/";

export type Doc = {
  /** URL segment under /docs. */
  slug: string;
  /** Path of the real file, relative to the repository root. */
  file: string;
  /** Navigation label. The page's own heading still comes from the file. */
  title: string;
  /** BCP-47 tag when the document is not in English (the four Bahasa Indonesia ones). */
  lang?: string;
};

export type Group = { id: string; name: string; note: string; docs: Doc[] };

const doc = (file: string, title: string, lang?: string): Doc => ({
  slug: path.posix.basename(file, ".md").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  file,
  title,
  ...(lang ? { lang } : {}),
});

export const GROUPS: Group[] = [
  {
    id: "architecture",
    name: "Architecture and on-chain",
    note: "How the corridor is built, what is deployed, and how each integration works.",
    docs: [
      doc("README.md", "Project README"),
      doc("docs/ARCHITECTURE.md", "Architecture"),
      doc("docs/ONCHAIN.md", "On-chain verification"),
      doc("docs/PASSKEY.md", "Passkey smart wallets"),
      doc("docs/ANCHOR.md", "Off-ramp anchor integration"),
      doc("docs/ALTERNATIVES.md", "Alternatives to gated integrations"),
    ],
  },
  {
    id: "security",
    name: "Security and threat model",
    note: "The assets, the trust boundaries, what an attacker can and cannot do, and the trusted setup.",
    docs: [
      doc("docs/THREAT_MODEL.md", "Threat model and monitoring plan"),
      doc("docs/SECURITY.md", "Security notes"),
      doc("docs/CEREMONY.md", "Trusted setup ceremony"),
    ],
  },
  {
    id: "testing",
    name: "Testing and verification",
    note: "The test plan, what each suite covers, and how to reproduce the deployed contract builds.",
    docs: [
      doc("docs/TESTING.md", "QA and testing"),
      doc("docs/BUILD-ATTESTATION.md", "Build attestation (SEP-0055)"),
    ],
  },
  {
    id: "product",
    name: "Product, design, and roadmap",
    note: "What the product is, the design system it is built from, and what has since been built.",
    docs: [
      doc("PRODUCT.md", "Product"),
      doc("DESIGN.md", "Design system"),
      doc("docs/USER_GUIDE.md", "User guide"),
      doc("docs/ROADMAP_IMPLEMENTATION.md", "Roadmap and what was built"),
      doc("docs/COMPETITIVE.md", "Where Tukar sits"),
    ],
  },
  {
    id: "scf",
    name: "SCF submission materials",
    note: "The Build Award proposal, the interest form, and the questions reviewers have asked.",
    docs: [
      doc("docs/SCF_BUILD_PROPOSAL.md", "SCF Build Award proposal"),
      doc("docs/SCF_SUBMISSION.md", "SCF Build interest form"),
      doc("docs/JUDGE_QA.md", "Judge questions and answers"),
      doc("docs/JUDGE_QA_UNCOVERED.md", "Questions the deck does not answer"),
      doc("docs/OVERVIEW_ID.md", "Penjelasan lengkap (Bahasa Indonesia)", "id"),
      doc("docs/JUDGE_QA_ID.md", "Pertanyaan juri (Bahasa Indonesia)", "id"),
      doc("docs/JUDGE_QA_UNCOVERED_ID.md", "Pertanyaan tak terjawab (Bahasa Indonesia)", "id"),
    ],
  },
  {
    id: "demo",
    name: "Demo and pitch material",
    note: "The recorded demo, the deck, and the scripts read over each of them.",
    docs: [
      doc("docs/DEMO_SCRIPT.md", "Demo video script"),
      doc("docs/DEMO_VO_SUBTITLES.md", "Demo voiceover and subtitles"),
      doc("docs/LIVE_DEMO_SCRIPT.md", "Live demo reading script"),
      doc("docs/DECK_SCRIPT.md", "Deck script"),
      doc("docs/PITCH_PREP.md", "Pitch preparation"),
      doc("docs/PITCH_SCRIPT_3MIN.md", "Three-minute pitch script"),
      doc("docs/PITCH_SCRIPT.md", "Skrip pitch (Bahasa Indonesia)", "id"),
      doc("docs/DEMO_NARRATION.md", "Narasi demo (Bahasa Indonesia)", "id"),
    ],
  },
];

export const DOCS: Doc[] = GROUPS.flatMap((g) => g.docs);
const BY_FILE = new Map(DOCS.map((d) => [d.file, d]));

export const docBySlug = (slug: string): Doc | undefined => DOCS.find((d) => d.slug === slug);
export const groupOfSlug = (slug: string): Group | undefined => GROUPS.find((g) => g.docs.some((d) => d.slug === slug));
export const sourceUrl = (file: string): string => BLOB + file;

// Diagrams and interface prototypes that are not markdown. Screenshots are kept out of the
// deployment bundle (.vercelignore), so these point at the committed files in the repository.
export const ARTIFACTS: { href: string; label: string; what: string }[] = [
  { href: RAW + "docs/architecture.svg", label: "Architecture diagram", what: "The corridor drawn end to end: browser, pool, verifiers, anchor." },
  { href: BLOB + "docs/screenshots", label: "Interface screenshots", what: "Eight captures of the shipped apps, desktop and 390px mobile." },
  { href: "/deck", label: "Pitch deck", what: "The deck as it is presented, in the browser." },
  { href: BLOB + "deployments/testnet.json", label: "Deployment record", what: "Every deployed contract id, wasm hash, and deploy transaction." },
  { href: REPO, label: "Source repository", what: "Contracts, circuits, the web app, and these documents." },
];

// ---------------------------------------------------------------- reading the real files
// The app builds from webapp/, so the repository root is one level up. When a build runs from
// the repository root instead, cwd is already the root; try both and use the one holding the docs.
const ROOT =
  [path.resolve(process.cwd(), ".."), process.cwd()].find((r) => fs.existsSync(path.join(r, "docs", "ARCHITECTURE.md"))) ??
  path.resolve(process.cwd(), "..");

// DESIGN.md carries a YAML token block ahead of its prose; strip a leading front-matter block.
const readFile = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

/** The document's own opening paragraph, as plain text, for the index listing. */
export function blurb(file: string): string {
  const para = readFile(file)
    .split(/\r?\n\s*\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0 && !/^[#>|`\-*+]/.test(s) && !/^\d+[.)]\s/.test(s));
  if (!para) return "";
  const text = para
    .replace(/\s+/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
  if (text.length <= 190) return text;
  const cut = text.slice(0, 190);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

// ---------------------------------------------------------------- markdown to HTML
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// GitHub's heading-anchor slug: lowercase, drop punctuation, one hyphen per space. Matching it
// keeps a fragment link written for GitHub (docs/SECURITY.md#privacy-model--anonymity-set-honest-scope)
// landing on the right heading here too.
const anchor = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

/**
 * Turn a link written for the repository into a link that works on the site: a published
 * document becomes its /docs route, anything else becomes that file on GitHub.
 */
function resolveHref(href: string, from: string): { href: string; external: boolean } {
  if (href.startsWith("#")) return { href, external: false };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href, external: /^https?:/i.test(href) };
  const hash = href.indexOf("#");
  const rel = hash === -1 ? href : href.slice(0, hash);
  const frag = hash === -1 ? "" : href.slice(hash);
  if (!rel) return { href, external: false };
  const abs = path.posix.normalize(path.posix.join(path.posix.dirname(from), rel)).replace(/^\.\//, "");
  const target = BY_FILE.get(abs);
  if (target) return { href: `/docs/${target.slug}${frag}`, external: false };
  return { href: BLOB + abs + frag, external: true };
}

const resolveSrc = (src: string, from: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/")
    ? src
    : RAW + path.posix.normalize(path.posix.join(path.posix.dirname(from), src)).replace(/^\.\//, "");

// A drawn box or check for a markdown task list, in the one-stroke idiom the rest of the app
// uses. marked's default is a disabled <input type="checkbox">, which has no accessible name.
const TASK_DONE =
  '<svg class="doc-task" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="Done"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TASK_TODO =
  '<svg class="doc-task" width="14" height="14" viewBox="0 0 14 14" role="img" aria-label="Not done"><rect x="2.6" y="2.6" width="8.8" height="8.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

type Parser = { parser: { parseInline: (t: unknown[]) => string } };

/** Render one document's markdown to HTML. Build time only. */
export function renderDoc(file: string): string {
  const base = new Renderer();
  const used = new Map<string, number>();
  let prevLevel = 0;

  const md = new Marked();
  md.use({
    renderer: {
      // Clamp the level so a document that jumps straight from a heading to a sub-sub-heading
      // still produces a correctly nested outline for screen readers.
      heading(token: { tokens: unknown[]; depth: number; text: string }) {
        const level = Math.min(token.depth, prevLevel + 1);
        prevLevel = level;
        const inner = (this as unknown as Parser).parser.parseInline(token.tokens);
        // Slug from the raw heading source, not the rendered HTML: the renderer has already
        // turned "&" into an entity by then, which would put "amp" in the middle of the anchor.
        const key = anchor(String(token.text ?? "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "")) || "section";
        const n = (used.get(key) ?? 0) + 1;
        used.set(key, n);
        return `<h${level} id="${esc(n === 1 ? key : `${key}-${n - 1}`)}">${inner}</h${level}>\n`;
      },
      link(token: { href: string; title?: string | null; tokens: unknown[] }) {
        const { href, external } = resolveHref(token.href, file);
        const inner = (this as unknown as Parser).parser.parseInline(token.tokens);
        const title = token.title ? ` title="${esc(token.title)}"` : "";
        const out = external ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${esc(href)}"${title}${out}>${inner}</a>`;
      },
      image(token: { href: string; title?: string | null; text: string }) {
        const title = token.title ? ` title="${esc(token.title)}"` : "";
        return `<img class="doc-img" src="${esc(resolveSrc(token.href, file))}" alt="${esc(token.text)}"${title} loading="lazy" />`;
      },
      code(token: { text: string; lang?: string }) {
        const lang = (token.lang || "").trim().split(/\s+/)[0];
        const block = `<pre class="doc-pre" tabindex="0"><code${lang ? ` class="language-${esc(lang)}"` : ""}>${esc(token.text)}\n</code></pre>`;
        // Mermaid: the repository stores this diagram as text, and that text is what is shown.
        // Drawing it would mean shipping a diagram engine to the browser for one block.
        if (lang === "mermaid") {
          return `<figure class="doc-figure"><figcaption>Diagram source, written in Mermaid. The source file linked at the foot of this page shows it drawn.</figcaption>${block}</figure>\n`;
        }
        return block + "\n";
      },
      // A wide table scrolls inside its own frame instead of widening the page; tabindex keeps
      // that frame reachable from the keyboard.
      table(token: unknown) {
        (base as unknown as { parser: unknown }).parser = (this as unknown as { parser: unknown }).parser;
        return `<div class="doc-scroll" tabindex="0">${(base as unknown as { table: (t: unknown) => string }).table(token)}</div>\n`;
      },
      checkbox(token: { checked: boolean }) {
        return token.checked ? TASK_DONE : TASK_TODO;
      },
      // These files are trusted repository content and carry no HTML, but anything that looks
      // like a tag is shown as the text it is rather than injected into the page.
      html(token: { text: string }) {
        return esc(token.text);
      },
    },
  });

  return md.parse(readFile(file), { async: false }) as string;
}

import { describe, it, expect } from "vitest";
import { DOCS, GROUPS, blurb, docBySlug, renderDoc } from "./docs";

// The /docs route is only as good as its links: a reviewer following one into a 404 is worse
// than no site at all. These render the real files and check what came out.

const RENDERED = DOCS.map((d) => ({ doc: d, html: renderDoc(d.file) }));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe("document set", () => {
  it("has a unique slug per document and every file reads", () => {
    expect(new Set(DOCS.map((d) => d.slug)).size).toBe(DOCS.length);
    for (const { html } of RENDERED) expect(html.length).toBeGreaterThan(200);
  });

  it("leaves the internal working notes out", () => {
    const files = DOCS.map((d) => d.file);
    for (const excluded of [
      "docs/CONTRACT-UPGRADE-STEPS.md",
      "docs/ACTIVATION-STEPS.md",
      "docs/SESSION-HANDOFF.md",
      "docs/ONBOARDING.md",
    ]) {
      expect(files).not.toContain(excluded);
    }
  });

  it("gives every group at least one document and every document a blurb", () => {
    for (const g of GROUPS) expect(g.docs.length).toBeGreaterThan(0);
    for (const d of DOCS) expect(blurb(d.file).length).toBeGreaterThan(20);
  });
});

describe("links", () => {
  it("points every in-site link at a document that exists", () => {
    for (const { doc, html } of RENDERED) {
      for (const h of hrefs(html)) {
        if (!h.startsWith("/docs/")) continue;
        const slug = h.slice("/docs/".length).split("#")[0];
        expect(docBySlug(slug), `${doc.file} links to /docs/${slug}`).toBeDefined();
      }
    }
  });

  it("leaves no repository-relative link unresolved", () => {
    for (const { doc, html } of RENDERED) {
      for (const h of hrefs(html)) {
        const absolute = /^(https?:|mailto:|tel:)/i.test(h) || h.startsWith("/") || h.startsWith("#");
        expect(absolute, `${doc.file} has an unresolved link: ${h}`).toBe(true);
      }
    }
  });

  it("rewrites a link between two published documents to its route", () => {
    // docs/SCF_BUILD_PROPOSAL.md links to SCF_SUBMISSION.md as a sibling file.
    const proposal = RENDERED.find((r) => r.doc.file === "docs/SCF_BUILD_PROPOSAL.md")!;
    expect(proposal.html).toContain('href="/docs/scf-submission"');
    expect(proposal.html).toContain('href="/docs/threat-model"');
    // README.md links to it through the docs/ prefix instead.
    const readme = RENDERED.find((r) => r.doc.file === "README.md")!;
    expect(readme.html).toContain('href="/docs/architecture"');
  });

  it("keeps a heading fragment pointing at that heading", () => {
    const readme = RENDERED.find((r) => r.doc.file === "README.md")!;
    expect(readme.html).toContain('href="/docs/security#privacy-model--anonymity-set-honest-scope"');
    const security = RENDERED.find((r) => r.doc.file === "docs/SECURITY.md")!;
    expect(security.html).toContain('id="privacy-model--anonymity-set-honest-scope"');
  });

  it("sends a non-document repository path to the file on GitHub", () => {
    const readme = RENDERED.find((r) => r.doc.file === "README.md")!;
    expect(readme.html).toContain("https://github.com/PugarHuda/tukar/blob/main/circuits/disclosure.circom");
    const security = RENDERED.find((r) => r.doc.file === "docs/SECURITY.md")!;
    expect(security.html).toContain("https://github.com/PugarHuda/tukar/blob/main/deployments/testnet.json");
  });
});

describe("markup", () => {
  it("renders tables inside a keyboard-reachable scroll frame with header cells", () => {
    const arch = RENDERED.find((r) => r.doc.file === "docs/ARCHITECTURE.md")!;
    expect(arch.html).toContain('<div class="doc-scroll" tabindex="0"><table>');
    expect(arch.html).toContain("<th>");
  });

  it("never skips a heading level", () => {
    for (const { doc, html } of RENDERED) {
      let prev = 0;
      for (const m of html.matchAll(/<h([1-6])\b/g)) {
        const level = Number(m[1]);
        expect(level, `${doc.file} jumps from h${prev} to h${level}`).toBeLessThanOrEqual(prev + 1);
        prev = level;
      }
    }
  });

  it("keeps the mermaid diagram as labelled source rather than an unrendered blank", () => {
    const threat = RENDERED.find((r) => r.doc.file === "docs/THREAT_MODEL.md")!;
    expect(threat.html).toContain("<figcaption>Diagram source, written in Mermaid.");
    expect(threat.html).toContain("flowchart LR");
  });

  it("emits no raw HTML and no unlabelled checkbox from the markdown", () => {
    for (const { doc, html } of RENDERED) {
      expect(html, `${doc.file}`).not.toContain('type="checkbox"');
      expect(html, `${doc.file}`).not.toContain("<script");
    }
  });

  it("draws a task list as a marked-up list item", () => {
    const onchain = RENDERED.find((r) => r.doc.file === "docs/ONCHAIN.md")!;
    expect(onchain.html).toContain('aria-label="Done"');
  });
});

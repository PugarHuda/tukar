import { test, expect } from "@playwright/test";
import { goto200, watchNoise } from "./_helpers";

// Every route returns a real 200 and renders its key content (real hydrated state, live
// testnet reads), with no page errors and no non-benign network failures. Runs on every
// desktop project (chromium/firefox/webkit).
const ROUTES: { path: string; must: (RegExp | string)[] }[] = [
  { path: "/", must: [/send money home|private|remittance/i] },
  { path: "/sender", must: [/send|amount/i, /Connect wallet/i] },
  { path: "/receiver", must: [/claim|receive|note/i] },
  { path: "/operator", must: [/Pool health/i, /Custody/i, /Reserves attestation/i] },
  { path: "/regulator", must: [/Travel Rule/i, /verify|disclosure/i] },
  { path: "/verify", must: [/Verify a Tukar receipt/i, /Paste a disclosure receipt/i] },
  { path: "/deck", must: [/tukar|private|corridor/i] },
  { path: "/docs", must: [/Project documentation/i, /Architecture and on-chain/i, /Security and threat model/i] },
  { path: "/docs/architecture", must: [/All documentation/i, /docs\/ARCHITECTURE\.md/i] },
];

for (const r of ROUTES) {
  test(`route ${r.path} loads and renders key content`, async ({ page }) => {
    const noise = watchNoise(page);
    await goto200(page, r.path);
    // Give client components time to hydrate + do their live Soroban reads.
    await page.waitForLoadState("load").catch(() => {});
    for (const m of r.must) {
      await expect(page.getByText(m).first(), `${r.path} should render ${m}`).toBeVisible();
    }
    expect(noise.real(), `${r.path} produced real errors/failures`).toEqual([]);
  });
}

// The documentation route is rendered from the repository's markdown at build time. These check
// the two things that would make it useless to a reviewer: an index that does not list the
// documents, and a document page that drops its structure (headings, tables) on the way through.
test("/docs lists every document it publishes, each linking to its own page", async ({ page }) => {
  await goto200(page, "/docs");
  const links = page.locator('main a[href^="/docs/"]');
  const count = await links.count();
  expect(count, "the index should link to the published documents").toBeGreaterThanOrEqual(25);
  for (const name of ["Architecture", "Threat model and monitoring plan", "QA and testing", "SCF Build Award proposal"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  // Every listed document really resolves.
  const hrefs = [...new Set(await links.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href"))))];
  for (const href of hrefs) {
    const r = await page.request.get(href!);
    expect(r.status(), `${href} from the index`).toBe(200);
  }
});

test("/docs/architecture renders the document's headings, tables and code", async ({ page }) => {
  await goto200(page, "/docs/architecture");
  await expect(page.locator(".doc-body h1")).toHaveCount(1);
  expect(await page.locator(".doc-body h2").count()).toBeGreaterThan(2);
  // Tables keep real header cells and sit in their own keyboard-reachable scroll frame.
  expect(await page.locator('.doc-body .doc-scroll[tabindex="0"] table th').count()).toBeGreaterThan(0);
  // Links written for the repository resolve on the site, not into a dead relative path.
  const bad = await page
    .locator(".doc-body a[href]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!).filter((h) => !/^(https?:|mailto:|\/|#)/.test(h)));
  expect(bad, "unresolved repository-relative links").toEqual([]);
});

test("/docs/threat-model keeps the mermaid diagram as readable source", async ({ page }) => {
  await goto200(page, "/docs/threat-model");
  const fig = page.locator(".doc-body .doc-figure").first();
  await expect(fig.locator("figcaption")).toContainText(/Mermaid/i);
  await expect(fig.locator("pre")).toContainText("flowchart LR");
});

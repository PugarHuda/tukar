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

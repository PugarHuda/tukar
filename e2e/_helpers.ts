import { Page, expect } from "@playwright/test";

// Same known-benign classification the qa6 sweep uses: Vercel analytics scripts 404
// until Web Analytics is toggled on in the dashboard, the favicon probe, and .mp4 range
// streams that abort when the headless context closes mid-load. None are product defects.
export const BENIGN = [/_vercel\/(insights|speed-insights)/i, /favicon\.ico/i, /\.mp4(\?|$)/i];
export const isBenign = (url: string) => BENIGN.some((r) => r.test(url));
// WebKit reports a cross-origin fetch cancelled by a reload/navigation as a page error ("due to
// access control checks") even though the app's fetch sits inside try/catch (FX rate lookups).
// Not a defect: the same navigation on Chromium/Firefox raises nothing.
export const BENIGN_PAGEERROR = /due to access control checks/i;

// Attach page-error and failed-response listeners; returns a getter for the real (non-benign)
// problems so a spec can assert the page loaded clean without drowning in known noise.
export function watchNoise(page: Page) {
  const pageErrors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (e) => { if (!BENIGN_PAGEERROR.test(e.message)) pageErrors.push("pageerror: " + e.message); });
  page.on("response", (r) => { if (r.status() >= 400 && !isBenign(r.url())) failed.push(r.status() + " " + r.url()); });
  page.on("requestfailed", (r) => { if (!isBenign(r.url())) failed.push("FAILED " + r.url()); });
  return { pageErrors, failed, real: () => [...pageErrors, ...failed] };
}

// Navigate and assert a real 200 from the server (not just that something rendered).
export async function goto200(page: Page, path: string) {
  const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(resp, `no response for ${path}`).not.toBeNull();
  expect(resp!.status(), `${path} HTTP status`).toBe(200);
  return resp!;
}

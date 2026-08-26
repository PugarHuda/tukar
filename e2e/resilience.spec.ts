import { test, expect, Page } from "@playwright/test";
import { goto200, watchNoise } from "./_helpers";

// Deep resilience: network failure/slowness, race/double-action, navigation (back/forward/refresh
// + cold deep links), and session/storage wipes. The load-bearing invariant everywhere is: no
// uncaught exception, no unhandled rejection, no infinite skeleton, no white-screen. Deliberately
// aborted requests WILL show up as network failures — those are expected in the abort tests, so we
// assert only on crashes (pageerror + unhandledrejection) and on a visible degraded/error state.

const SOROBAN = /soroban-testnet\.stellar\.org/i;

// A failed JS chunk fetch ("Loading chunk N failed" / ChunkLoadError) is a transient CDN/network
// hiccup on navigation, not an app logic defect — it recovered on retry every time it appeared.
// Treat it as benign noise (same spirit as the _helpers BENIGN list) so the suite reports real
// uncaught logic errors honestly. See findings note.
const BENIGN_CRASH = /Loading chunk \d+ failed|ChunkLoadError|error loading dynamically imported module/i;

async function watchCrashes(page: Page) {
  const noise = watchNoise(page);
  const rejections: string[] = [];
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const r: any = e.reason;
      console.error("UNHANDLED_REJECTION: " + ((r && r.message) || String(r)));
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("UNHANDLED_REJECTION")) rejections.push(m.text());
  });
  return {
    ...noise,
    rejections,
    crashes: () => [...noise.pageErrors, ...rejections].filter((e) => !BENIGN_CRASH.test(e)),
  };
}

// ============================ NETWORK · abort ============================
// Operator is the heaviest live-read surface. With the Soroban RPC dead, it MUST show its honest
// error state ("read failed") — not an infinite skeleton — and must not throw.
test("operator shows a degraded 'read failed' state when Soroban RPC is aborted (no infinite skeleton)", async ({ page }) => {
  const w = await watchCrashes(page);
  await page.route(SOROBAN, (r) => r.abort());
  await goto200(page, "/operator");
  await expect(page.getByText(/read failed/i).first()).toBeVisible({ timeout: 40_000 });
  // The loading pill must have RESOLVED into the error pill, not stuck reading forever.
  await expect(page.getByText(/reading pool state…/i)).toHaveCount(0);
  expect(w.crashes(), "uncaught error under RPC abort").toEqual([]);
});

// Sender's pool read is best-effort: aborting it must degrade gracefully (the compose form still
// works, the pool count shows its "…" fallback) rather than blocking the UI.
test("sender stays usable when its pool read is aborted (graceful degradation)", async ({ page }) => {
  const w = await watchCrashes(page);
  await page.route(SOROBAN, (r) => r.abort());
  await goto200(page, "/sender");
  // The compose form renders and is interactive despite the dead RPC.
  await expect(page.getByText(/Send money\./i)).toBeVisible();
  await page.locator("#amount").fill("200");
  await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
  expect(w.crashes(), "uncaught error on sender under RPC abort").toEqual([]);
});

// Regulator's Pool report tab surfaces the read error inline (setStatus / err) rather than crashing.
test("regulator surfaces a read error when RPC is aborted, page survives", async ({ page }) => {
  const w = await watchCrashes(page);
  await page.route(SOROBAN, (r) => r.abort());
  await goto200(page, "/regulator");
  await expect(page.getByText(/Pool read error|read error|unavailable/i).first()).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("heading", { name: /Regulator \/ Compliance console/i })).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

// ============================ NETWORK · slowness ============================
// With the RPC throttled, the operator must show a LOADING state first (skeleton/loading pill),
// then resolve. This proves loading states exist and do resolve (not a blank flash, not a hang).
test("operator shows a loading state under a throttled RPC, then resolves", async ({ page }) => {
  const w = await watchCrashes(page);
  let delayed = 0;
  await page.route(SOROBAN, async (r) => {
    // Delay the first few RPC calls so the loading state is observable, then let them through.
    if (delayed < 6) { delayed++; await new Promise((res) => setTimeout(res, 3500)); }
    await r.continue();
  });
  await goto200(page, "/operator");
  // Loading pill visible while throttled.
  await expect(page.getByText(/reading pool state…/i).first()).toBeVisible({ timeout: 10_000 });
  // Then it resolves to a terminal state (live OR read failed) — never stuck on the loading pill.
  await expect(page.getByText(/reading pool state…/i)).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByText(/live ·|read failed/i).first()).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

// ============================ RACE · double-action ============================
test("sender: rapid double-click on 'Use testnet key' connects once, no crash", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/sender");
  const connect = page.getByRole("button", { name: /Use testnet key/ });
  await connect.click({ clickCount: 2, delay: 20 });
  // Exactly one connected state: one Disconnect button, address shown once.
  await expect(page.getByRole("button", { name: /^Disconnect$/ })).toHaveCount(1);
  await expect(page.getByText(/testnet key ·/i).first()).toBeVisible();
  expect(w.crashes(), "uncaught error on double connect").toEqual([]);
});

test("verify: rapid double-click on Verify does not double-fire into a broken state", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/verify");
  const box = page.getByRole("textbox");
  const verify = page.getByRole("button", { name: /^Verify$/ });
  // Prove hydration via the ENABLE-on-fill transition (SSR renders Verify disabled), so the
  // double-click acts on a live, reactive form rather than a pre-hydration no-op.
  await expect(async () => {
    await box.fill("still not a receipt");
    await expect(verify).toBeEnabled({ timeout: 1500 });
  }).toPass({ timeout: 40_000 });
  await verify.click({ clickCount: 2, delay: 20 });
  // One honest verdict, page intact.
  await expect(page.getByText(/neither valid receipt JSON nor a 64-character transaction hash/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Verify a Tukar receipt/i })).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

// ============================ NAVIGATION · cold deep links ============================
const ROUTES = ["/sender", "/receiver", "/operator", "/regulator", "/verify", "/deck"];

for (const path of ROUTES) {
  test(`cold deep-link to ${path} renders (no white-screen) and survives refresh`, async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, path);
    // Not a white screen: the body has real rendered content.
    const textLen = await page.evaluate(() => (document.body.innerText || "").trim().length);
    expect(textLen, `${path} rendered too little text (possible white-screen)`).toBeGreaterThan(40);
    // Refresh (F5) from the cold deep link must not break it.
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterLen = await page.evaluate(() => (document.body.innerText || "").trim().length);
    expect(afterLen, `${path} broke after refresh`).toBeGreaterThan(40);
    expect(w.crashes(), `uncaught error on ${path} deep link/refresh`).toEqual([]);
  });
}

// ============================ NAVIGATION · back / forward ============================
test("browser back/forward between home and a route keeps both intact", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/");
  await goto200(page, "/operator");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/$/);
  const homeLen = await page.evaluate(() => (document.body.innerText || "").trim().length);
  expect(homeLen, "home broke after back").toBeGreaterThan(40);
  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/operator/);
  await expect(page.getByText(/Pool health/i).first()).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

// The sender is a single-URL state machine (compose→send→progress→success). A mid-flow refresh
// must recover cleanly to a valid state rather than white-screen or strand a half-rendered step.
test("sender: refresh mid-flow recovers to a clean state (no broken half-render)", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/sender");
  await page.locator("#amount").fill("200");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText(/Confirm and send/i)).toBeVisible();
  // F5 mid-flow
  await page.reload({ waitUntil: "domcontentloaded" });
  // Recovers to the compose entry point (client state reset) — a valid, interactive screen.
  await expect(page.getByText(/Send money\./i)).toBeVisible();
  await expect(page.locator("#amount")).toBeVisible();
  expect(w.crashes(), "uncaught error on sender mid-flow refresh").toEqual([]);
});

// ============================ SESSION / STORAGE wipe ============================
// Simulate expiry / a fresh device: nuke local+session storage mid-session and reload. The app
// must recover (re-prompt connect, empty state) and never throw.
test("receiver recovers after a mid-session storage wipe", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/receiver");
  // connect so there is session state to lose
  await page.getByRole("button", { name: /Use testnet key/ }).first().click().catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded" });
  // Fresh-device state: connect CTA back, empty payments, no throw.
  await expect(page.getByText(/No payments yet|Connect/i).first()).toBeVisible();
  expect(w.crashes(), "uncaught error after storage wipe").toEqual([]);
});

test("regulator recovers after its persisted audit-trail storage is wiped mid-session", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/regulator");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Regulator \/ Compliance console/i })).toBeVisible();
  // Corrupt the trail key too and reload — the JSON.parse guard must not throw.
  await page.evaluate(() => {
    try {
      const k = Object.keys(localStorage).find((x) => x.includes("regulator-trail"));
      localStorage.setItem(k || "tukar:regulator-trail:x", "{not valid json");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Regulator \/ Compliance console/i })).toBeVisible();
  expect(w.crashes(), "uncaught error after corrupt-storage recovery").toEqual([]);
});

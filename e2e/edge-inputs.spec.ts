import { test, expect, Page, Locator } from "@playwright/test";
import { goto200, watchNoise } from "./_helpers";

// Controlled React inputs reset to their state value on hydration, so a fill that lands before
// hydration is silently discarded (or momentarily shows then gets clobbered). Fill, let any pending
// hydration clobber happen, then confirm the value SURVIVED — re-filling until it sticks. Once it
// sticks, React's onChange has processed it and all derived state (button disabled/enabled) is
// correct. Fails fast per attempt so the config's retry recovers cheaply on a slow cold-cache load.
async function fillStable(loc: Locator, v: string) {
  await expect(loc).toBeVisible();
  await expect(async () => {
    await loc.fill(v);
    await loc.page().waitForTimeout(150); // give a late hydration a chance to clobber
    await expect(loc).toHaveValue(v, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}

// fillStable alone can't tell "value stuck because React took it" from "value stuck because React
// hasn't hydrated yet and will clobber it a moment later". The reliable proof that hydration is DONE
// is watching a DERIVED state transition that SSR would never show. For the sender amount field:
// SSR renders Continue ENABLED (default "200"), so emptying the field and seeing Continue go DISABLED
// only happens once React's onChange pipeline is live. Leaves the field empty; returns the locator.
async function senderAmountReady(page: Page): Promise<Locator> {
  const amount = page.locator("#amount");
  await expect(amount).toBeVisible();
  const cont = page.getByRole("button", { name: /Continue/ });
  await expect(async () => {
    await amount.fill("");
    await expect(cont).toBeDisabled({ timeout: 1500 });
  }).toPass({ timeout: 40_000 });
  return amount;
}

// Same idea for /verify: SSR renders Verify DISABLED (empty text), so ENABLE-on-fill is the live
// signal. Once it reacts, hydration is done; clear and return the textbox.
async function verifyReady(page: Page): Promise<Locator> {
  const box = page.getByRole("textbox");
  await expect(box).toBeVisible();
  const btn = page.getByRole("button", { name: /^Verify$/ });
  await expect(async () => {
    await box.fill("x");
    await expect(btn).toBeEnabled({ timeout: 1500 });
  }).toPass({ timeout: 40_000 });
  await box.fill("");
  await expect(btn).toBeDisabled();
  return box;
}

// Open the receiver Claim tab reliably: retry the tab click until the claim textarea is visible
// (a pre-hydration click is a no-op, so a single click can silently fail under load).
async function openClaimTab(page: Page) {
  await expect(async () => {
    await page.getByRole("tab", { name: /^Claim$/ }).click();
    await expect(page.getByPlaceholder("tukar1:…")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}

// FORMS / INPUT edge cases on the real live app. Every case asserts an HONEST validation/error
// state and — the load-bearing invariant — that the page never throws an uncaught error or hangs.
// Network failures are NOT asserted here (these are happy-network tests); only pageerror +
// unhandledrejection are treated as defects.

// Attach an unhandledrejection capture on top of watchNoise's pageerror listener. Must run before
// the first navigation so the init script is installed. Returns the combined crash getter.
// Transient chunk-fetch failures on navigation are benign CDN noise, not logic defects.
const BENIGN_CRASH = /Loading chunk \d+ failed|ChunkLoadError|error loading dynamically imported module/i;

async function watchCrashes(page: Page) {
  const noise = watchNoise(page);
  const rejections: string[] = [];
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const r: any = e.reason;
      // Surfaced through console so the test harness can see it (page.on('console')).
      console.error("UNHANDLED_REJECTION: " + ((r && r.message) || String(r)));
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("UNHANDLED_REJECTION")) rejections.push(m.text());
  });
  // crashes = uncaught JS exceptions + unhandled promise rejections (NOT network failures)
  return {
    ...noise,
    rejections,
    crashes: () => [...noise.pageErrors, ...rejections].filter((e) => !BENIGN_CRASH.test(e)),
  };
}

// ============================ SENDER · amount field ============================
// canContinue = isFinite(num) && num > 0 && num <= 1_000_000_000. The Continue button is
// disabled whenever the amount is not sendable, with an honest hint below it.
const AMOUNT_CASES: { label: string; value: string; sendable: boolean }[] = [
  { label: "empty", value: "", sendable: false },
  { label: "zero", value: "0", sendable: false },
  { label: "negative", value: "-5", sendable: false },
  { label: "huge over cap", value: "1000000001", sendable: false },
  { label: "absurdly huge", value: "999999999999", sendable: false },
  { label: "scientific over cap (1e12)", value: "1e12", sendable: false },
  { label: "exactly the cap", value: "1000000000", sendable: true },
  { label: "scientific at cap (1e9)", value: "1e9", sendable: true },
  { label: "many decimals", value: "0.0000001", sendable: true },
  { label: "normal", value: "200", sendable: true },
];

for (const c of AMOUNT_CASES) {
  test(`sender amount "${c.label}" → Continue ${c.sendable ? "enabled" : "disabled honestly"}, no crash`, async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    const amount = await senderAmountReady(page);
    await fillStable(amount, c.value);
    const cont = page.getByRole("button", { name: /Continue/ });
    if (c.sendable) {
      await expect(cont).toBeEnabled();
      // Sendable path actually advances to the confirm screen (proves the value is accepted).
      await cont.click();
      await expect(page.getByText(/Confirm and send/i)).toBeVisible();
    } else {
      await expect(cont).toBeDisabled();
      // An honest hint is shown for the rejected value.
      await expect(page.getByText(/Enter an amount greater than 0|Keep it under 1,000,000,000/i).first()).toBeVisible();
    }
    expect(w.crashes(), "uncaught error/rejection on sender amount edge").toEqual([]);
  });
}

// Non-numeric input (letters / emoji / unicode) must not become a sendable amount and must not
// crash. A type=number field rejects the keystrokes; the value stays non-actionable.
test("sender amount rejects emoji/unicode keystrokes without crashing", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/sender");
  const amount = await senderAmountReady(page); // hydration proven; field left empty
  await amount.pressSequentially("🎉abc٧٧", { delay: 5 });
  // number input drops invalid chars — the field is empty or numeric, never the garbage string
  const val = await amount.inputValue();
  expect(val).not.toContain("🎉");
  expect(val).not.toContain("abc");
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  expect(w.crashes(), "uncaught error on emoji amount").toEqual([]);
});

// ============================ PUBLIC VERIFY · textarea ============================
// Button is disabled until text.trim() is non-empty; junk yields an honest client verdict; a
// valid-looking-but-wrong hash hits the real /api/verify and must return a verdict, not hang.
test("verify: empty and whitespace-only keep the button disabled", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/verify");
  const box = await verifyReady(page);
  const verify = page.getByRole("button", { name: /^Verify$/ });
  await expect(verify).toBeDisabled();
  // whitespace-only trims to empty → button must stay disabled once React has the value
  await fillStable(box, "     \n\t  ");
  await expect(verify).toBeDisabled();
  expect(w.crashes()).toEqual([]);
});

test("verify: emoji/unicode junk yields an honest rejection, page survives", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/verify");
  const box = await verifyReady(page);
  await fillStable(box, "🎉🎉 not a receipt μπ 你好 ٧٧٧");
  const vBtn = page.getByRole("button", { name: /^Verify$/ });
  await expect(vBtn).toBeEnabled();
  await vBtn.click();
  await expect(page.getByText(/neither valid receipt JSON nor a 64-character transaction hash/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Verify a Tukar receipt/i })).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

test("verify: very long garbage string is rejected honestly, no hang", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/verify");
  const box = await verifyReady(page);
  await fillStable(box, "x".repeat(50_000));
  const vBtn = page.getByRole("button", { name: /^Verify$/ });
  await expect(vBtn).toBeEnabled();
  await vBtn.click();
  await expect(page.getByText(/neither valid receipt JSON nor a 64-character transaction hash/i)).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

test("verify: a valid-looking 64-hex hash reaches the real API and returns a verdict (no hang/crash)", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/verify");
  const box = await verifyReady(page);
  await fillStable(box, "0".repeat(64));
  const verify = page.getByRole("button", { name: /^Verify$/ });
  await expect(verify).toBeEnabled();
  await verify.click();
  // Whatever the on-chain answer, the flow must SETTLE: the button re-enables (busy cleared) and
  // some honest outcome renders. It must not spin forever.
  await expect(verify).toBeEnabled({ timeout: 40_000 });
  await expect(
    page.getByText(/Anchor transaction only|FAIL|PASS|NOT bound|error|not found|could not|unavailable/i).first(),
  ).toBeVisible();
  expect(w.crashes(), "uncaught error verifying a wrong hash").toEqual([]);
});

// ============================ RECEIVER · claim + note-status ============================
test("receiver: claiming an empty note is a no-op, junk note fails honestly", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/receiver");
  await openClaimTab(page);
  // empty → no-op, no crash, still on the claim panel
  await page.getByRole("button", { name: /Claim payment/ }).click();
  await expect(page.getByRole("button", { name: /Claim payment/ })).toBeVisible();
  // junk → honest failure in the status bar
  await fillStable(page.getByPlaceholder("tukar1:…"), "this-is-not-a-bearer-note 🎉");
  await page.getByRole("button", { name: /Claim payment/ }).click();
  await expect(page.getByText(/Couldn't claim that note/i)).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

test("receiver: check-status with empty input prompts, with junk hits the API without crashing", async ({ page }) => {
  const w = await watchCrashes(page);
  await goto200(page, "/receiver");
  await openClaimTab(page);
  const check = page.getByRole("button", { name: /Check status/ });
  await check.click();
  await expect(page.getByText(/Paste a bearer note .* to check its status|Paste a bearer note/i)).toBeVisible();
  // junk commitment → real /api/note-status call; must settle to a status or an honest error
  await fillStable(page.getByPlaceholder("tukar1:…"), "999999999999999999999999");
  await check.click();
  await expect(page.getByRole("button", { name: /Check status|Checking…/ })).toBeVisible();
  // either a Note status badge or a "Status check failed" message — never a hang/crash
  await expect(
    page.getByText(/Note status|Status check failed|unregistered|spendable|spent/i).first(),
  ).toBeVisible({ timeout: 40_000 });
  expect(w.crashes()).toEqual([]);
});

// ============================ THREE-STATE · empty ============================
test("receiver renders the EMPTY state (no payments yet) on a fresh device", async ({ page }) => {
  const w = await watchCrashes(page);
  // fresh context per test already; make sure nothing is persisted
  await goto200(page, "/receiver");
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/No payments yet/i)).toBeVisible();
  expect(w.crashes()).toEqual([]);
});

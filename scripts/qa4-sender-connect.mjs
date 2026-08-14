// QA4 SENDER — connect/gating: testnet key connects, Freighter-absent error toast,
// Send gating + reason, the >1e9 cap (safe: returns before any on-chain). No real deposit.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.setDefaultTimeout(20000);
}
async function newPage(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage(); wire(page);
  return { ctx, page };
}
const toastText = (page) => page.locator(".fixed.bottom-5.right-5 > div").last().innerText().catch(() => "");

// ============ Use testnet key connects ============
console.log("\n=== CONNECT · testnet key ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1200);
  const connected = await page.getByText(/testnet key ·/).isVisible().catch(() => false);
  connected ? ok("'Use testnet key' connects (shows 'testnet key · G…')") : bad("testnet key did not connect");
  const disc = await page.getByRole("button", { name: "Disconnect" }).isVisible().catch(() => false);
  disc ? ok("Disconnect affordance appears after connect") : bad("no Disconnect after connect");
  await ctx.close();
}

// ============ Connect wallet (Freighter absent) → error TOAST, not silent ============
console.log("\n=== CONNECT · Freighter absent → error toast ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  // connectFreighter has a 3s detection timeout, then throws → toast("...","error")
  await page.getByText(/not detected|Freighter/i).waitFor({ timeout: 9000 }).catch(() => {});
  const t = await toastText(page);
  /Freighter not detected|install/i.test(t)
    ? ok(`'Connect wallet' with no Freighter → honest error toast ("${t.slice(0, 60)}…")`)
    : bad("no error toast when Freighter absent (silent failure?)", t || "(empty)");
  await page.screenshot({ path: `${SHOTS}/qa4-freighter-toast.png` });
  await ctx.close();
}

// ============ ASP allow-list notice — path/copy verification ============
console.log("\n=== CONNECT · ASP allow-list notice (freighter-only path) ===");
{
  // Can't install Freighter, so verify the notice is gated on kind==='freighter' and the copy exists.
  // Confirm it does NOT show for the demo key (correct — demo key IS allow-listed).
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1000);
  const shownForDemo = await page.getByText(/Only allow-listed sources can deposit/i).isVisible().catch(() => false);
  !shownForDemo ? ok("ASP allow-list notice correctly HIDDEN for the demo key (it is allow-listed)") : bad("allow-list notice wrongly shown for demo key");
  console.log("    NOTE: notice copy exists in source, gated on kind==='freighter'; runtime-unverifiable without the extension.");
  await ctx.close();
}

// ============ Send gating + reason (disconnected) ============
console.log("\n=== SEND · gating + disabled reason ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.locator("#amount").fill("50");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  const send = page.getByRole("button", { name: /^Send \$50/ });
  const disabled = await send.isDisabled();
  const title = await send.getAttribute("title");
  (disabled && /Connect a wallet or use the testnet key/i.test(title || ""))
    ? ok(`Send DISABLED while disconnected, with reason (title="${title}")`)
    : bad("Send gating/reason wrong while disconnected", `disabled=${disabled} title=${title}`);
  const hint = await page.getByText(/Connect above to send on-chain/i).isVisible().catch(() => false);
  hint ? ok("visible 'Connect above to send on-chain' hint under disabled Send") : bad("no connect hint under Send");
  await ctx.close();
}

// ============ >1e9 cap — SAFE (doSend returns before any on-chain) ============
console.log("\n=== SEND · amount cap (2,000,000,000 → honest reject, no on-chain) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1200);
  await page.locator("#amount").fill("2000000000"); // 2e9 > 1e9 cap → returns early, never deposits
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  const send = page.getByRole("button", { name: /^Send \$/ });
  await send.click();
  await page.waitForTimeout(1500);
  const st = await page.getByRole("status").innerText().catch(() => "");
  const onProgress = await page.getByText(/Zero-knowledge proofs/i).isVisible().catch(() => false);
  (/Keep it under 1,000,000,000 USDC/i.test(st) && !onProgress)
    ? ok(`2e9 → honest cap message, stayed on Send (no progress/deposit): "${st}"`)
    : bad("2e9 cap not enforced honestly", `status="${st}" onProgress=${onProgress}`);
  await ctx.close();
}

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy/i.test(e));
console.log(note.length ? note.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa4-connect: ${pass}/${pass + fail} checks passed ===`);
await browser.close();

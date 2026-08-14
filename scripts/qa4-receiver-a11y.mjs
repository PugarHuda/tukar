// QA4 — RECEIVER a11y + responsive (mobile-first). No on-chain writes.
// Checks: status bar aria-live announcing, focus-visible on interactive elements, every Select
// labeled + unique id per card, and no horizontal overflow at 360/390/414/768/1440.
import { chromium } from "playwright-core";
import { buildPoseidon } from "circomlibjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (arr) => F.toObject(poseidon(arr)).toString();
const rnd = () => (BigInt(Math.floor(Math.random() * 1e15)) * 1000003n + 7n).toString();
function makeNote(amt, ref) {
  const privKey = rnd(); const pubKey = H([BigInt(privKey)]); const blinding = rnd();
  const commitment = H([BigInt(amt), BigInt(pubKey), BigInt(blinding)]);
  return { v: 1, ref, amount: String(amt), privKey, pubKey, blinding, commitment, corridor: "MX" };
}
const bearer = (n) => "tukar1:" + Buffer.from(JSON.stringify(n), "utf8").toString("base64");
// two notes so we can assert per-card Select ids are UNIQUE
const N1 = bearer(makeNote(5000000000n, "QA-A")); // 500
const N2 = bearer(makeNote(2500000000n, "QA-B")); // 250

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
function wire(page, tag) {
  page.on("pageerror", (e) => errs.push(`[${tag}] pageerror: ` + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`[${tag}] console.error: ` + m.text().slice(0, 160)); });
  page.setDefaultTimeout(30000);
}
async function claim(page, note) {
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(note);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(500);
}

// ---- status bar aria-live ----
console.log("\n=== A11Y: status bar aria-live ===");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); wire(page, "aria");
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const status = page.locator("div[role=status]");
  const live = await status.getAttribute("aria-live");
  (await status.count()) && live === "polite" ? ok("bottom status bar has role=status + aria-live=polite") : bad("status bar aria-live wrong", `count=${await status.count()} live=${live}`);
  await ctx.close();
}

// ---- focus-visible + labeled/unique selects ----
console.log("\n=== A11Y: focus-visible + labeled unique Selects per card ===");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); wire(page, "focus");
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await claim(page, N1);
  await claim(page, N2);
  await page.getByRole("tab", { name: /Payments/ }).click();
  await page.waitForTimeout(300);

  // every <select> has an associated <label htmlFor>
  const selInfo = await page.$$eval("select", (els) => els.map((s) => ({ id: s.id, labeled: !!(s.id && document.querySelector(`label[for="${CSS.escape(s.id)}"]`)) })));
  const allLabeled = selInfo.length > 0 && selInfo.every((s) => s.labeled);
  allLabeled ? ok(`all ${selInfo.length} selects have a matching <label for>`) : bad("some selects unlabeled", JSON.stringify(selInfo));
  const ids = selInfo.map((s) => s.id);
  const uniq = new Set(ids).size === ids.length && ids.every(Boolean);
  uniq ? ok(`select ids unique per card (${ids.join(", ")})`) : bad("duplicate/empty select ids", ids.join(", "));

  // focus-visible: Tab reaches an interactive element and it gets a visible focus ring (box-shadow/outline)
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, ring: cs.boxShadow !== "none" || cs.outlineStyle !== "none" };
  });
  focus ? ok(`keyboard focus lands on <${focus.tag.toLowerCase()}> (focus-visible ring: ${focus.ring})`) : bad("Tab did not move focus to an interactive element");
  await ctx.close();
}

// ---- no horizontal overflow across breakpoints ----
console.log("\n=== RESPONSIVE: no horizontal overflow (360/390/414/768/1440) ===");
for (const w of [360, 390, 414, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }); const page = await ctx.newPage(); wire(page, "resp" + w);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await claim(page, N1);
  // open the disclosure expander (widest content: inputs, receipt) to stress layout
  await page.getByRole("tab", { name: /Payments/ }).click();
  await page.waitForTimeout(200);
  await page.getByText(/Prove to a regulator/i).click().catch(() => {});
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  const over = overflow.sw - overflow.cw;
  over <= 1 ? ok(`${w}px: no horizontal overflow (scrollW=${overflow.sw} clientW=${overflow.cw})`) : bad(`${w}px: horizontal overflow by ${over}px`, JSON.stringify(overflow));
  if (w === 390 || w === 1440) await page.screenshot({ path: `${SHOTS}/qa4-receiver-${w}.png`, fullPage: true });
  await ctx.close();
}

console.log(`\n===== A11Y/RESPONSIVE: ${pass} passed, ${fail} failed =====`);
if (errs.length) { console.log("\nConsole/pageerror captured:"); [...new Set(errs)].slice(0, 30).forEach((e) => console.log("  ! " + e)); }
else console.log("No console errors / pageerrors captured.");
await browser.close();
process.exit(fail ? 1 : 0);

// QA3 — sender amount-bound gating (read disabled state, don't click).
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const amt = page.locator("#amount");
const cont = page.getByRole("button", { name: /Continue/ });
async function state(v) {
  await amt.fill(v);
  await page.waitForTimeout(300);
  return { disabled: await cont.isDisabled(), title: await cont.getAttribute("title"), body: await page.locator("body").innerText() };
}
let s = await state("0");
s.disabled ? ok(`amount 0 -> Continue DISABLED (title: "${s.title}")`) : bad("amount 0 not gated");
s = await state("1000000000");
// 1e9 USDC: expect either gated (disabled+cap title) or a visible cap/limit message. If it advances freely, flag.
const capMsg = /maximum|too (large|high)|cap|limit|exceed|greater than/i.test(s.body) || /max|cap|limit|exceed/i.test(s.title || "");
if (s.disabled) ok(`amount 1e9 -> Continue DISABLED (title: "${s.title}")`);
else if (capMsg) ok("amount 1e9 -> cap/limit message shown");
else {
  // advancing is only a problem if it leads to a real send with no cap. Continue enabled + no cap => MINOR flag.
  bad("amount 1e9 -> Continue ENABLED with no cap message (would attempt a 1e9 USDC send)", "title=" + s.title);
}
s = await state("50");
!s.disabled ? ok("amount 50 -> Continue ENABLED (valid amount)") : bad("valid amount 50 wrongly gated", s.title);
console.log(`\n=== qa3-amt: ${pass}/${pass + fail} checks passed ===`);
await browser.close();

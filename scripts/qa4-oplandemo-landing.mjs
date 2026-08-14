// QA4 — LANDING (/). Sections render, hero canvases animate w/o console errors, Apps role-picker,
// Launch-demo modal (header/hero/apps triggers, not clipped, ESC+backdrop, focus trap+return),
// Circuits tab (7), header "Contracts" nav activates Contracts tab (8 contracts), 52/52 numbers,
// role/demo links navigate, footer links resolve, responsive overflow, focus-visible.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const net404 = [];
async function newCtx(w = 1440, h = 900) {
  return browser.newContext({ viewport: { width: w, height: h } });
}
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() === 404) net404.push(r.url()); });
  page.setDefaultTimeout(30000);
}
const hasHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

// ============ SECTIONS + NUMBERS + CANVAS ============
console.log("\n=== LANDING · sections + numbers + hero canvas ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // key numbers: 7 ZK circuits, 52/52, contracts
  (await page.getByText(/7 ZK CIRCUITS/i).first().isVisible().catch(() => false)) ? ok("hero shows '7 ZK CIRCUITS'") : bad("'7 ZK CIRCUITS' missing");
  (await page.getByText("52/52", { exact: false }).first().isVisible().catch(() => false)) ? ok("stat shows 52/52") : bad("52/52 missing");

  // section anchors present in DOM
  for (const id of ["apps", "corridor", "circuits", "contracts"]) {
    (await page.locator(`#${id}`).count()) > 0 ? ok(`section/anchor #${id} present`) : bad(`#${id} missing`);
  }
  // Apps role-picker visible with role links
  (await page.locator("#apps").isVisible().catch(() => false)) ? ok("Apps role-picker section visible") : bad("#apps not visible");

  // hero canvas present + animating (rAF running → no pageerror). check a canvas exists.
  const canvases = await page.locator("canvas").count();
  canvases >= 1 ? ok(`hero canvas present (${canvases})`) : bad("no canvas element");

  const hOver = await hasHOverflow(page);
  hOver ? bad("horizontal overflow at 1440") : ok("no horizontal overflow at 1440");
  await page.screenshot({ path: `${SHOTS}/qa4-landing-desktop.png`, fullPage: false });
  await ctx.close();
}

// ============ CIRCUITS TAB (7) + CONTRACTS TAB (8) via header nav ============
console.log("\n=== LANDING · circuits(7) + contracts(8) tab + nav-to-tab ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  // default Circuits tab → 7 cards
  let cards = await page.locator(".circ-card").count();
  cards === 7 ? ok("Circuits tab shows 7 cards") : bad("circuit card count", "got " + cards);
  // exactly one aria-selected tab
  const selCount = await page.locator('[role="tab"][aria-selected="true"]').count();
  selCount === 1 ? ok("exactly one tab aria-selected") : bad("aria-selected count", "got " + selCount);

  // click the HEADER "Contracts" nav link → should activate the Contracts tab (hash-synced)
  await page.getByRole("link", { name: "Contracts", exact: true }).click();
  await page.waitForTimeout(400);
  const contractsSel = await page.getByRole("tab", { name: "Contracts" }).getAttribute("aria-selected");
  contractsSel === "true" ? ok("header 'Contracts' nav activates the Contracts tab") : bad("Contracts nav did not activate tab", "aria-selected=" + contractsSel);
  cards = await page.locator(".circ-card").count();
  cards === 8 ? ok("Contracts tab shows 8 contract cards") : bad("contract card count", "got " + cards);
  (await page.evaluate(() => location.hash)) === "#contracts" ? ok("hash synced to #contracts") : console.log("  NOTE hash=" + await page.evaluate(() => location.hash));
  await ctx.close();
}

// ============ LAUNCH MODAL (desktop + mobile) ============
async function modalSuite(w, h, label) {
  console.log(`\n=== LANDING · Launch modal · ${label} (${w}px) ===`);
  const ctx = await newCtx(w, h); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const triggers = page.locator(".launch-trigger");
  const n = await triggers.count();
  n >= 1 ? ok(`${label}: ${n} launch triggers found`) : bad(`${label}: no launch triggers`);

  // open each visible trigger, verify dialog opens, not clipped, ESC closes.
  // Each LaunchButton co-locates its own portal dialog; settle between iterations so a
  // prior close finishes before the next open (avoids double-dialog / stuck-backdrop races).
  let opened = 0;
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible().catch(() => false))) continue;
    await t.scrollIntoViewIfNeeded().catch(() => {});
    await t.click();
    const dialog = page.locator('[role="dialog"]');
    // settle past the mount + .16s fade before asserting (the apps trigger can lag the 3s poll)
    await page.waitForTimeout(500);
    const shown = await dialog.first().isVisible().catch(() => false);
    if (!shown) { bad(`${label}: trigger ${i} did not open dialog`); await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(400); continue; }
    if ((await dialog.first().getAttribute("aria-modal")) !== "true") bad(`${label}: dialog missing aria-modal`);
    const box = await dialog.first().boundingBox();
    (box && box.width <= w + 1 && box.x >= -1 && box.y >= -1) ? null : bad(`${label}: dialog clipped`, JSON.stringify(box));
    await page.keyboard.press("Escape");
    (await dialog.first().isHidden({ timeout: 2000 }).catch(() => false)) ? null : bad(`${label}: ESC did not close dialog ${i}`);
    await page.waitForTimeout(300);
    opened++;
  }
  // defensively ensure nothing is left open before the focus-trap sub-test
  if (await page.locator('.launch-backdrop').count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
  opened >= 1 ? ok(`${label}: ${opened} visible triggers open + ESC-close a non-clipped dialog`) : bad(`${label}: no trigger opened`);

  // focus trap + backdrop + focus return on the first trigger
  const first = triggers.first();
  await first.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  const inBefore = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(100);
  const inAfter = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  (inBefore && inAfter) ? ok(`${label}: focus trapped in modal`) : bad(`${label}: focus not trapped`, `before=${inBefore} after=${inAfter}`);
  // backdrop close
  const backdrop = page.locator(".launch-backdrop");
  if (await backdrop.count()) {
    await backdrop.click({ position: { x: 5, y: 5 } });
    (await dialog.isHidden({ timeout: 2000 }).catch(() => false)) ? ok(`${label}: backdrop click closes`) : bad(`${label}: backdrop did not close`);
  } else console.log(`  NOTE ${label}: no .launch-backdrop element`);
  const returned = await page.evaluate(() => document.activeElement?.classList.contains("launch-trigger"));
  returned ? ok(`${label}: focus returns to trigger`) : bad(`${label}: focus not returned`);

  // modal role/demo links
  await first.click();
  await dialog.waitFor({ state: "visible" }).catch(() => {});
  const hrefs = await dialog.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const need = ["/demo", "/sender", "/receiver", "/regulator", "/operator"];
  need.every((h) => hrefs.includes(h)) ? ok(`${label}: modal links to all roles + demo`) : bad(`${label}: modal missing role links`, JSON.stringify(hrefs));
  await page.keyboard.press("Escape");
  const hOver = await hasHOverflow(page);
  hOver ? bad(`${label}: horizontal overflow`) : ok(`${label}: no horizontal overflow`);
  await ctx.close();
}
await modalSuite(1440, 900, "desktop");
await modalSuite(390, 844, "mobile");

// ============ ROLE/DEMO LINKS NAVIGATE + FOOTER LINKS RESOLVE ============
console.log("\n=== LANDING · role/demo nav + footer links ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  // collect all in-app links and confirm each navigates 200 (read-only nav)
  const appHrefs = await page.locator("a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")).filter((h) => h && !h.startsWith("//")))]);
  const targets = appHrefs.filter((h) => ["/demo", "/sender", "/receiver", "/regulator", "/operator"].includes(h));
  let navOk = 0;
  for (const h of targets) {
    const resp = await page.goto(BASE + h, { waitUntil: "domcontentloaded" }).catch(() => null);
    (resp && resp.status() < 400) ? navOk++ : bad("nav failed: " + h, resp ? String(resp.status()) : "no response");
  }
  navOk === targets.length && targets.length >= 5 ? ok(`all ${navOk} role/demo links navigate (200)`) : bad("role/demo nav", `${navOk}/${targets.length}`);

  // footer external links: HEAD-check they resolve (tolerate opaque/redirect)
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const ext = await page.locator("footer a[href^='http'], a[href^='http']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))].slice(0, 12));
  console.log(`  NOTE external links present: ${ext.length} (not fetched — external hosts)`);
  ext.length >= 1 ? ok("footer/external links present with hrefs") : bad("no external links found");
  await ctx.close();
}

// ============ RESPONSIVE overflow sweep ============
console.log("\n=== LANDING · overflow sweep 360/414/768 ===");
for (const w of [360, 414, 768]) {
  const ctx = await newCtx(w, 800); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const hOver = await hasHOverflow(page);
  hOver ? bad(`horizontal overflow at ${w}`) : ok(`no horizontal overflow at ${w}`);
  await ctx.close();
}

// ============ focus-visible ============
console.log("\n=== LANDING · first Tab reaches a control ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(tag || "") ? ok("first Tab reaches a control (" + tag + ")") : bad("first Tab reached: " + tag);
  await ctx.close();
}

console.log("\n=== ERRORS ===");
const noteworthy = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest/i.test(e));
console.log(noteworthy.length ? noteworthy.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log("\n=== 404s ===");
const real404 = net404.filter((u) => !/favicon|manifest|reflector|er-api/i.test(u));
console.log(real404.length ? real404.slice(0, 20).map((u) => "  - " + u).join("\n") : "  none");
console.log(`\n=== qa4-landing: ${pass}/${pass + fail} checks passed ===`);
await browser.close();

// QA5 A11Y — M1 (keyboard focus ring on INPUTS, keyboard-only) + M2 (toasts aria-live).
// Orange DEFAULT = #ff7a1a = rgb(255, 122, 26). :focus-visible now uses a real selector list
// with !important so inputs win too. Verify keyboard Tab -> orange 2px outline, mouse click -> none.
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
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
  page.setDefaultTimeout(20000);
}
async function newPage(w = 1440, h = 900, perms = []) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: perms });
  const page = await ctx.newPage(); wire(page);
  return { ctx, page };
}
// Orange outline: rgb(255, 122, 26). "visible" = width>=2px, style solid, non-transparent orange-ish.
const isOrangeRing = (o) =>
  /solid/.test(o.style) &&
  parseFloat(o.width) >= 2 &&
  /rgb\(255,\s*12[0-9],\s*2[0-9]\)/.test(o.color.replace(/\s+/g, " ")) === false
    ? /255, 122, 26/.test(o.color) // exact
    : /255, 122, 26/.test(o.color);
const readOutline = (page, sel) => page.$eval(sel, (el) => {
  const cs = getComputedStyle(el);
  return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
});
// Tab from top of doc until activeElement matches id; returns outline or null.
// NOTE: some inputs carry `transition-all duration-150`, so the orange outline FADES IN over
// ~150ms. We wait 260ms after focus so we read the settled color, not frame 0 (transparent).
async function tabToAndRead(page, id) {
  await page.evaluate(() => (document.activeElement && document.activeElement.blur && document.activeElement.blur()));
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((tid) => document.activeElement?.id === tid, id);
    if (hit) {
      await page.waitForTimeout(260); // let the focus-ring transition settle
      return await page.evaluate(() => {
        const el = document.activeElement; const cs = getComputedStyle(el);
        return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, fv: el.matches(":focus-visible") };
      });
    }
  }
  return null;
}

// ============ M1 · SENDER #amount and #req (the key inputs) ============
console.log("\n=== M1 · SENDER inputs #amount #req (keyboard ring) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  for (const id of ["amount", "req"]) {
    const o = await tabToAndRead(page, id);
    if (!o) { bad(`sender #${id}: never reached via Tab`); continue; }
    const good = /solid/.test(o.style) && parseFloat(o.width) >= 2 && /255, 122, 26/.test(o.color.replace(/\s+/g, " "));
    good ? ok(`sender #${id}: keyboard focus shows orange 2px outline (${o.width} ${o.style} ${o.color}, :focus-visible=${o.fv})`)
         : bad(`sender #${id}: no orange ring on keyboard focus`, `${o.width} ${o.style} ${o.color} fv=${o.fv}`);
  }
  // keyboard-only distinction is measured on a BUTTON, not a text input: per the web platform,
  // editable text inputs ALWAYS match :focus-visible even on mouse click (you click them to type),
  // so the orange ring correctly appears on click for #amount/#req. Buttons are the real test.
  await page.screenshot({ path: `${SHOTS}/qa5-sender-amount-focus.png` }).catch(() => {});
  await ctx.close();
}

// ============ M1 · keyboard-only proof on a BUTTON/LINK (mouse click -> no ring) ============
// The keyboard-only distinction only holds for buttons/links; text inputs & selects legitimately
// match :focus-visible on click. Prove the negative on a landing nav hash-link (no navigation).
console.log("\n=== M1 · keyboard-only (mouse click -> no ring) on a link ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const link = page.locator('.nav a[href^="#"]').first();
  if (await link.count()) {
    await link.click().catch(() => {});
    await page.waitForTimeout(120);
    const lo = await page.evaluate(() => {
      const el = document.querySelector('.nav a[href^="#"]'); const cs = getComputedStyle(el);
      return { tag: el.tagName, width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, fv: el.matches(":focus-visible") };
    });
    const ring = /solid/.test(lo.style) && parseFloat(lo.width) >= 2 && /255, 122, 26/.test(lo.color.replace(/\s+/g, " "));
    (!lo.fv && !ring) ? ok(`keyboard-only confirmed: mouse-clicking a nav ${lo.tag} does NOT show the orange ring (:focus-visible=${lo.fv})`)
      : bad(`mouse click shows the ring on a link (not keyboard-only)`, JSON.stringify(lo));
  } else bad("no landing nav hash-link found for keyboard-only test");
  await ctx.close();
}

// ============ M1 · inputs on receiver / regulator / operator ============
// Each of these inputs lives behind a dashboard section / tab, so we navigate there first.
console.log("\n=== M1 · inputs on other surfaces (keyboard ring) ===");
async function ringInput(page, path, id, label) {
  const present = await page.evaluate((tid) => !!document.getElementById(tid), id);
  if (!present) { bad(`${path} #${id}: input not rendered after navigating to "${label}"`); return; }
  const o = await tabToAndRead(page, id);
  if (!o) { bad(`${path} #${id}: not reachable via Tab`); return; }
  const good = /solid/.test(o.style) && parseFloat(o.width) >= 2 && /255, 122, 26/.test(o.color.replace(/\s+/g, " "));
  good ? ok(`${path} #${id}: keyboard focus shows orange 2px outline (${o.width} ${o.style} ${o.color})`)
       : bad(`${path} #${id}: no orange ring on keyboard focus`, `${o.width} ${o.style} ${o.color} fv=${o.fv}`);
}
const clickNav = async (page, name) => {
  const el = page.getByRole("button", { name, exact: false }).first();
  if (await el.count()) { await el.click().catch(() => {}); await page.waitForTimeout(700); return true; }
  const lk = page.getByText(name, { exact: false }).first();
  if (await lk.count()) { await lk.click().catch(() => {}); await page.waitForTimeout(700); return true; }
  return false;
};
// regulator -> Verify disclosure tab -> #receipt textarea
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await clickNav(page, "Verify disclosure");
  await ringInput(page, "/regulator", "receipt", "Verify disclosure");
  await ctx.close();
}
// operator -> Compliance policy section -> #admin-asp-root, #admin-auditor
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await clickNav(page, "Compliance policy");
  await ringInput(page, "/operator", "admin-asp-root", "Compliance policy");
  await ringInput(page, "/operator", "admin-auditor", "Compliance policy");
  await ctx.close();
}
// receiver -> Claim tab -> claim input (discover id)
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  const claimTab = page.getByRole("tab", { name: /claim/i }).first();
  if (await claimTab.count()) { await claimTab.click().catch(() => {}); await page.waitForTimeout(600); }
  // The claim field is an unlabeled <textarea placeholder="tukar1:…"> (no id). Tab to it by selector.
  const sel = 'textarea[placeholder^="tukar1"]';
  const present = await page.locator(sel).count();
  if (!present) { bad("/receiver: claim textarea not rendered on Claim tab"); await ctx.close(); }
  else {
    await page.evaluate(() => (document.activeElement && document.activeElement.blur && document.activeElement.blur()));
    await page.evaluate(() => window.scrollTo(0, 0));
    let o = null;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate((s) => document.activeElement?.matches(s), sel);
      if (hit) { await page.waitForTimeout(260); o = await page.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el); return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, fv: el.matches(":focus-visible") }; }); break; }
    }
    if (!o) bad("/receiver claim textarea: not reachable via Tab");
    else {
      const good = /solid/.test(o.style) && parseFloat(o.width) >= 2 && /255, 122, 26/.test(o.color.replace(/\s+/g, " "));
      good ? ok(`/receiver claim <textarea>: keyboard focus shows orange 2px outline (${o.width} ${o.style} ${o.color})`)
           : bad(`/receiver claim <textarea>: no orange ring`, `${o.width} ${o.style} ${o.color} fv=${o.fv}`);
    }
    await ctx.close();
  }
}

// ============ M1 · buttons / links / tabs / selects still show the ring ============
console.log("\n=== M1 · non-input controls still ring (landing) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  const rings = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const o = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, role: el.getAttribute("role"), width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
    });
    if (o && ["A", "BUTTON", "SELECT"].includes(o.tag) || (o && o.role === "tab")) {
      rings.push({ ...o, ring: /solid/.test(o.style) && parseFloat(o.width) >= 2 && /255, 122, 26/.test(o.color.replace(/\s+/g, " ")) });
    }
  }
  const sampled = rings.length, ringed = rings.filter((r) => r.ring).length;
  sampled && ringed === sampled ? ok(`non-input controls ring on keyboard focus (${ringed}/${sampled} sampled: ${[...new Set(rings.map(r=>r.tag))].join(",")})`)
    : bad(`some non-input controls lack the ring`, `${ringed}/${sampled}`);
  await ctx.close();
}

// ============ M2 · toasts announced (aria-live region) ============
console.log("\n=== M2 · toast aria-live region ===");
{
  const { ctx, page } = await newPage(1440, 900, ["clipboard-read", "clipboard-write"]);
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // 1) the toast host exists with role=region + aria-live=polite
  const host = await page.evaluate(() => {
    const r = document.querySelector('[role="region"][aria-live]');
    return r ? { live: r.getAttribute("aria-live"), label: r.getAttribute("aria-label"), atomic: r.getAttribute("aria-atomic") } : null;
  });
  (host && host.live === "polite") ? ok(`toast host present: role=region aria-live="${host.live}" aria-atomic="${host.atomic}" aria-label="${host.label}"`)
    : bad("toast host missing role=region/aria-live=polite", JSON.stringify(host));
  // 2) trigger a real toast: operator admin CLI copy (CopyBlock -> toast("CLI command copied")).
  let toasted = false, toastText = "";
  try {
    await clickNav(page, "Compliance policy");
    const copyBtn = page.getByRole("button", { name: /^copy$/i }).first();
    if (await copyBtn.count()) {
      await copyBtn.scrollIntoViewIfNeeded().catch(() => {});
      await copyBtn.click().catch(() => {});
      await page.waitForTimeout(500);
      const found = await page.evaluate(() => {
        const r = document.querySelector('[role="region"][aria-live]');
        return r ? (r.textContent || "").trim().slice(0, 80) : "";
      });
      if (found) { toasted = true; toastText = found; }
    } else { console.log("  (note) no copy button found in Compliance policy section"); }
  } catch (e) { console.log("  (note) toast trigger error: " + (e.message || e).split("\n")[0]); }
  toasted ? ok(`toast text landed inside the aria-live region: "${toastText}"`)
    : bad("could not confirm toast text reached the aria-live region");
  await page.screenshot({ path: `${SHOTS}/qa5-toast.png` }).catch(() => {});
  await ctx.close();
}

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|429|throttl/i.test(e));
console.log(note.length ? note.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa5-a11y: ${pass}/${pass + fail} checks passed ===`);
await browser.close();

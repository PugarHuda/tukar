// QA4 SENDER — a11y + responsive. focus-visible, labeled inputs, header back/home,
// no icon-only unnamed buttons; no horizontal overflow at 360/390/414/768/1440.
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
async function newPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage(); wire(page);
  return { ctx, page };
}

// ============ RESPONSIVE — no horizontal overflow, header wraps ============
console.log("\n=== RESPONSIVE · overflow + header ===");
for (const [w, h] of [[360, 780], [390, 844], [414, 896], [768, 1024], [1440, 900]]) {
  const { ctx, page } = await newPage(w, h);
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const o = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    bodyOverflow: document.body.scrollWidth - window.innerWidth,
  }));
  const overflow = o.docW - o.winW;
  overflow <= 1 ? ok(`${w}px: no horizontal overflow (scrollW ${o.docW} ≤ win ${o.winW})`) : bad(`${w}px: horizontal overflow +${overflow}px`, JSON.stringify(o));
  // header present + within width
  const hdr = await page.locator("header").boundingBox();
  (hdr && hdr.width <= w + 1) ? ok(`${w}px: header within viewport`) : bad(`${w}px: header exceeds viewport`, JSON.stringify(hdr));
  if (w === 360 || w === 1440) await page.screenshot({ path: `${SHOTS}/qa4-sender-${w}.png`, fullPage: true });
  await ctx.close();
}

// ============ A11Y ============
console.log("\n=== A11Y · focus, labels, buttons ===");
{
  const { ctx, page } = await newPage(1440, 900);
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // first Tab reaches a focusable control
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 24) }));
  ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(first.tag || "") ? ok(`first Tab reaches a control (${first.tag} "${first.label}")`) : bad("first Tab missed a control", JSON.stringify(first));

  // focus-visible ring: keyboard-Tab each control, assert a visible indicator
  // (non-transparent outline OR non-empty box-shadow on the element or its wrapper).
  const visibleRing = (o) => {
    const solid = o.outline && /solid/.test(o.outline) && !/rgba\(0, 0, 0, 0\)/.test(o.outline) && !/ 0px /.test(o.outline.replace(/rgba?\([^)]*\)/g, ""));
    const shadow = (o.boxShadow && o.boxShadow !== "none" && !/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(o.boxShadow)) ||
                   (o.wrapShadow && o.wrapShadow !== "none" && !/^(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(, )?)+$/.test(o.wrapShadow));
    return !!(solid || shadow);
  };
  await page.evaluate(() => document.activeElement?.blur());
  const rings = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const o = await page.evaluate(() => {
      const el = document.activeElement; if (!el) return null;
      const cs = getComputedStyle(el);
      const wrap = el.parentElement ? getComputedStyle(el.parentElement) : null;
      return { tag: el.tagName, id: el.id, name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16), outline: cs.outlineWidth + " " + cs.outlineStyle + " " + cs.outlineColor, boxShadow: cs.boxShadow, wrapShadow: wrap?.boxShadow };
    });
    if (o) rings.push({ ...o, ok: visibleRing(o) });
  }
  for (const r of rings) console.log(`    focus ${r.tag}#${r.id || "-"} "${r.name}": ${r.ok ? "RING" : "NO-RING"}  (outline=${r.outline})`);
  const noRing = rings.filter((r) => !r.ok);
  noRing.length === 0
    ? ok(`every keyboard-focused control shows a visible focus ring (${rings.length} sampled)`)
    : bad(`${noRing.length}/${rings.length} focused control(s) show NO visible focus ring`, noRing.map((r) => `${r.tag}#${r.id}`).join(", "));

  // Tab through and check every button/link has an accessible name; flag icon-only unnamed
  const unnamed = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll("button, a").forEach((el) => {
      const name = (el.getAttribute("aria-label") || el.textContent || "").trim();
      if (!name) bad.push(el.outerHTML.slice(0, 80));
    });
    return bad;
  });
  unnamed.length === 0 ? ok("no icon-only / unnamed buttons or links (all have accessible names)") : bad(`${unnamed.length} unnamed control(s)`, unnamed.join(" | "));

  // labeled inputs: every input/select has a label or aria-label
  const unlabeled = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      const id = el.id;
      const hasFor = id && document.querySelector(`label[for="${id}"]`);
      const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      if (!hasFor && !aria) bad.push((el.tagName + "#" + (id || "?")));
    });
    return bad;
  });
  unlabeled.length === 0 ? ok("all inputs/selects are labeled (for= or aria-label)") : bad(`${unlabeled.length} unlabeled field(s)`, unlabeled.join(", "));

  // header back/home is a labeled link to /
  const home = page.locator('header a[href="/"]');
  const homeLabel = await home.getAttribute("aria-label");
  const homeText = (await home.innerText().catch(() => "")).trim();
  ((await home.count()) === 1 && (homeLabel || homeText)) ? ok(`header has a labeled Home link (aria-label="${homeLabel}", text="${homeText}")`) : bad("header Home link missing/unlabeled");

  await ctx.close();
}

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy/i.test(e));
console.log(note.length ? note.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa4-a11y: ${pass}/${pass + fail} checks passed ===`);
await browser.close();

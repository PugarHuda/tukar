// Record the Tukar demo as a video (Playwright), paced to the natural VO in
// build-video/vo.json, and log each scene's start time so the VO can be muxed in
// sync afterwards. Drives the LIVE site + the real embedded testnet key (real
// on-chain deposit/withdraw), so run it when that key is idle.
//
//   node scripts/record-narrated.mjs [baseUrl]
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] || "https://tukar-six.vercel.app").replace(/\/$/, "");
const vo = JSON.parse(readFileSync("build-video/vo.json", "utf8"));
const OUTDIR = "build-video";

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1280,720"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
page.on("dialog", (d) => d.accept().catch(() => {}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (fn) => fn.catch(() => {});
const click = (sel) => safe(page.locator(sel).first().click({ timeout: 8000 }));
const ready = () => page.locator("#status").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 }).catch(() => {});
// After a (literal) step navigation, glide straight to the interaction CARD so the
// headline is scrolled off — go to what matters, keeping the flow strip near the top.
const focusPanel = (n) => page.evaluate(async (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const want = Math.max(0, el.getBoundingClientRect().top + scrollY - 118);
  const from = scrollY, dist = want - from;
  if (Math.abs(dist) <= 8) return;
  const steps = 38;
  for (let i = 1; i <= steps; i++) { scrollTo(0, from + dist * (i / steps)); await new Promise((r) => setTimeout(r, 13)); }
}, "panel" + n).catch(() => {});
const goStep = async (i) => { await click("#fn" + i); await page.locator("#panel" + i).waitFor({ state: "visible", timeout: 15000 }).catch(() => {}); await ready(); await sleep(250); await focusPanel(i); await sleep(250); };
// Smoothly glide the page so the bottom of `sel` is comfortably in view — used when the
// thing being narrated (counter, withdraw button, proof result) sits below the fold, so
// it reads as a gentle scroll instead of a hard jump ("patah-patah").
const glideInto = (sel) => page.evaluate(async (s) => {
  const el = document.querySelector(s);
  if (!el) return;
  const want = Math.max(0, el.getBoundingClientRect().bottom + scrollY - innerHeight + 48);
  const from = scrollY, dist = want - from;
  if (Math.abs(dist) <= 8) return;
  const steps = 48;
  for (let i = 1; i <= steps; i++) { scrollTo(0, from + dist * (i / steps)); await new Promise((r) => setTimeout(r, 14)); }
}, sel).catch(() => {});

const recStart = Date.now();
const scenes = [];
// Begin scene i at "now", run its action, then hold so the scene lasts >= its VO.
async function scene(i, action) {
  const startMs = Date.now() - recStart;
  scenes.push({ i, startMs });
  console.log(`  scene ${i} @ ${(startMs / 1000).toFixed(1)}s`);
  const t0 = Date.now();
  await safe(Promise.resolve().then(action));
  const remain = vo[i].ms + 700 - (Date.now() - t0); // hold for the narration + a beat
  if (remain > 0) await sleep(remain);
}

try {
  // 0) landing — hero, then glide down
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await scene(0, async () => {
    await sleep(1800);
    await page.evaluate(async () => { const end = document.body.scrollHeight - innerHeight; for (let y = 0; y <= Math.min(end, 1400); y += 14) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 12)); } }).catch(() => {});
  });

  // 1) into the demo, connect, set up the send
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded", timeout: 60000 });
  await ready();
  await scene(1, async () => {
    await click("#demoKeyBtn");
    await sleep(500);
    await focusPanel(0); // scroll to the sender card (skip the headline)
    await page.locator("#corridor").selectOption("MX").catch(() => {});
    await page.locator("#amount").fill("500").catch(() => {});
    await sleep(600);
  });

  // 2) Send — real on-chain deposit (proofs build, then registers)
  await scene(2, async () => {
    await click("#sendBtn");
    await page.locator("#status").filter({ hasText: /registered on-chain ✓|registration failed|deposit failed/i }).waitFor({ timeout: 90000 }).catch(() => {});
  });

  // 3) Corridor — commitment + live count (auto-advanced here after the deposit)
  await scene(3, async () => { await goStep(1); await sleep(500); await glideInto("#panel1"); await sleep(500); });

  // 4) Receiver — reveal & off-ramp to MXN (rate read on-chain from Reflector)
  await scene(4, async () => {
    await goStep(2);
    await click("#incoming [data-reveal]");
    await page.locator("#incoming .mxn .amt").first().waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(300);
    await glideInto("#incoming [data-withdraw]"); // scroll down to the revealed amount + withdraw
    await sleep(500);
  });

  // 5) Withdraw on-chain (the button is already in view from scene 4's glide)
  await scene(5, async () => {
    await click("#incoming [data-withdraw]");
    await page.locator("#status").filter({ hasText: /withdrawn on-chain ✓|withdraw failed/i }).waitFor({ timeout: 90000 }).catch(() => {});
    await glideInto("#incoming"); await sleep(300);
  });

  // 6) Regulator — disclosure proof, verified on-chain
  await scene(6, async () => {
    await goStep(3);
    await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
    await sleep(400);
    await click("#proveBtn");
    await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 45000 }).catch(() => {});
    await glideInto("#result"); await sleep(500); // scroll down to reveal the on-chain result
  });

  // 7) Tamper — a false amount is rejected on-chain
  await scene(7, async () => {
    await click("#tamperLabel");
    await click("#proveBtn");
    await page.locator("#result [data-onchain]").filter({ hasText: /rejected/i }).waitFor({ timeout: 45000 }).catch(() => {});
    await glideInto("#result"); await sleep(500);
  });

  // 8) Close — footer chips
  await scene(8, async () => { await page.evaluate(() => scrollTo(0, document.body.scrollHeight)).catch(() => {}); await sleep(800); });
} catch (e) {
  console.log("flow warning:", e.message);
} finally {
  const vpath = await page.video().path().catch(() => null);
  await ctx.close(); // finalizes the video file
  await browser.close();
  writeFileSync(`${OUTDIR}/scenes.json`, JSON.stringify({ video: vpath, recMs: Date.now() - recStart, scenes }, null, 2));
  console.log(`\nvideo: ${vpath}\nscenes -> ${OUTDIR}/scenes.json  (total ${((Date.now() - recStart) / 1000).toFixed(0)}s)`);
}

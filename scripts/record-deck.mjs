// Record the DECK half of the full video: drive frontend/deck.html one slide at a
// time (via its window.__deck hook), holding each slide for its VO line, and log
// each slide's start time so the VO + subtitles can be placed in sync afterwards.
//
//   node scripts/record-deck.mjs [baseUrl]   (default https://tukar-six.vercel.app)
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] || "https://tukar-six.vercel.app").replace(/\/$/, "");
const vo = JSON.parse(readFileSync("build-video/deckvo.json", "utf8"));
const OUTDIR = "build-video";
const HOLD = 650; // a beat after each line before advancing

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--window-size=1280,720"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const recStart = Date.now();
const scenes = [];

try {
  await page.goto(BASE + "/deck", { waitUntil: "networkidle", timeout: 60000 });
  const count = await page.evaluate(() => window.__deck?.count ?? 0);
  if (count !== vo.length) console.log(`note: deck has ${count} slides, VO has ${vo.length} lines`);
  await sleep(900); // let the title slide land before the first line

  for (let i = 0; i < vo.length; i++) {
    if (i > 0) {
      await page.evaluate((n) => window.__deck.go(n), i);
      await sleep(620); // smooth-scroll settle, so the VO starts on a still slide
    }
    const startMs = Date.now() - recStart;
    scenes.push({ i, startMs });
    console.log(`  slide ${i + 1}/${vo.length} @ ${(startMs / 1000).toFixed(1)}s  (${(vo[i].ms / 1000).toFixed(1)}s)`);
    await sleep(vo[i].ms + HOLD);
  }
} catch (e) {
  console.log("deck warning:", e.message);
} finally {
  const vpath = await page.video().path().catch(() => null);
  await ctx.close(); // finalizes the webm
  await browser.close();
  writeFileSync(`${OUTDIR}/deck-scenes.json`, JSON.stringify({ video: vpath, recMs: Date.now() - recStart, scenes }, null, 2));
  console.log(`\ndeck video: ${vpath}\nscenes -> ${OUTDIR}/deck-scenes.json  (total ${((Date.now() - recStart) / 1000).toFixed(0)}s)`);
}

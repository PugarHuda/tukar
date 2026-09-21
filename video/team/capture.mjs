// Film the pages for the team video, and measure what each box should point at.
//
//   node team/capture.mjs
//
// One continuous 1600x900 recording. For every scene it loads the real page, lets it
// settle, scrolls the thing being talked about into view, measures that element's box in
// viewport pixels, and only then starts the scene mark, so the page is still while the
// box is on it. The page loads happen between marks and never reach the video.
//
// Writes public/team/cap.mp4 (constant 30 fps, ready for Remotion) and
// public/team/marks.json: per scene, its start and end in the video and the measured boxes.
// A box whose element was not found is reported and left out, never guessed.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const SCRIPT = JSON.parse(readFileSync(path.join(HERE, "script.json"), "utf8"));
const VO = JSON.parse(readFileSync(path.join(ROOT, "public", "team", "vo.json"), "utf8"));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = 1600, H = 900;
const RAW = path.join(ROOT, "captures", "team-raw");
const OUT = path.join(ROOT, "public", "team");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const needMs = (id) => (VO.find((v) => v.id === id)?.ms ?? 8000) + 900;

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
  colorScheme: "light",
});
const page = await ctx.newPage();
const t0 = Date.now();
const marks = [];

async function measure(selectors) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const n = await loc.count();
      if (!n) continue;
      // union of every match, so a list of pinned cards reads as one box
      let box = null;
      for (let i = 0; i < Math.min(n, 12); i++) {
        const b = await loc.nth(i).boundingBox();
        if (!b || b.width < 2 || b.height < 2) continue;
        box = box
          ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), r: Math.max(box.r, b.x + b.width), b: Math.max(box.b, b.y + b.height) }
          : { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height };
      }
      if (!box) continue;
      const pad = 10;
      const x = Math.max(4, box.x - pad), y = Math.max(4, box.y - pad);
      const r = Math.min(W - 4, box.r + pad), b = Math.min(H - 4, box.b + pad);
      if (r - x < 20 || b - y < 12) continue;
      return { x: Math.round(x), y: Math.round(y), w: Math.round(r - x), h: Math.round(b - y), via: sel };
    } catch {}
  }
  return null;
}

for (const sc of SCRIPT.scenes) {
  console.log(`  ${sc.id}  ${sc.url}`);
  try {
    await page.goto(sc.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.log(`    ! load: ${String(e).split("\n")[0]}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await sleep(1800);
  if (sc.scroll) {
    const loc = page.locator(sc.scroll).first();
    if (await loc.count().catch(() => 0)) {
      await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    } else {
      console.log(`    ! scroll target not found: ${sc.scroll}`);
    }
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await sleep(1200);

  const boxes = [];
  for (const b of sc.boxes || []) {
    const m = await measure(b.find);
    if (m) {
      boxes.push({ ...m, label: b.label, from: b.from, ...(b.tag ? { tag: b.tag } : {}) });
      console.log(`    box  "${b.label}"  ${m.x},${m.y} ${m.w}x${m.h}  via ${m.via}`);
    } else {
      console.log(`    ! box not found, left out: "${b.label}"`);
    }
  }

  const startMs = Date.now() - t0;
  await sleep(needMs(sc.id));
  marks.push({ id: sc.id, startMs, endMs: Date.now() - t0, boxes });
}

const wallMs = Date.now() - t0;
await ctx.close();
await browser.close();

const webm = readdirSync(RAW).find((f) => f.endsWith(".webm"));
renameSync(path.join(RAW, webm), path.join(RAW, "team.webm"));

// constant frame rate, so Remotion can trim to the frame
const mp4 = path.join(OUT, "cap.mp4");
execFileSync("ffmpeg", ["-y", "-i", path.join(RAW, "team.webm"), "-vf", `fps=${SCRIPT.fps}`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-an", mp4], { stdio: "ignore" });
const realMs = Math.round(parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
  "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim()) * 1000);
const k = realMs / wallMs;
for (const m of marks) {
  m.startMs = Math.round(m.startMs * k);
  m.endMs = Math.min(realMs, Math.round(m.endMs * k));
}

writeFileSync(path.join(OUT, "marks.json"), JSON.stringify({ width: W, height: H, durationMs: realMs, marks }, null, 2));
const missing = SCRIPT.scenes.flatMap((s) => (s.boxes || []).length - (marks.find((m) => m.id === s.id)?.boxes.length ?? 0));
console.log(`\nwrote public/team/cap.mp4 (${(realMs / 1000).toFixed(1)}s, marks x${k.toFixed(4)}) and public/team/marks.json`);
console.log(`boxes left out: ${missing.reduce((a, b) => a + b, 0)}`);

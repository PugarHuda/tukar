// One-off look at the pages the team video will film: what the headline and the most
// useful elements actually say, so every callout box points at something that exists.
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PAGES = [
  "https://github.com/PugarHuda",
  "https://github.com/PugarHuda?tab=repositories",
  "https://segel.vercel.app",
  "https://amanah-casper-rwa.vercel.app",
  "https://utuh.vercel.app",
  "https://bisik-eight.vercel.app",
  "https://dorahacks.io/hackathon/stellar-hacks-zk",
  "https://github.com/PugarHuda/tukar",
  "https://tukar-six.vercel.app",
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const url of PAGES) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 900; };
      const txt = (el) => (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 90);
      const hs = [...document.querySelectorAll("h1,h2")].filter(vis).slice(0, 5).map((h) => `${h.tagName}: ${txt(h)}`);
      const pinned = [...document.querySelectorAll(".pinned-item-list-item .repo")].map(txt).slice(0, 6);
      const counters = [...document.querySelectorAll("nav a .Counter, a[data-tab-item] .Counter")].map((c) => `${c.closest("a")?.innerText.trim().replace(/\s+/g, " ")}`).slice(0, 6);
      return { title: document.title.slice(0, 80), hs, pinned, counters };
    });
    console.log(`\n== ${url}\n  title: ${info.title}`);
    for (const h of info.hs) console.log("  " + h);
    if (info.pinned.length) console.log("  pinned: " + info.pinned.join(" | "));
    if (info.counters.length) console.log("  counters: " + info.counters.join(" | "));
  } catch (e) {
    console.log(`\n== ${url}\n  ! ${String(e).split("\n")[0]}`);
  }
}
await browser.close();

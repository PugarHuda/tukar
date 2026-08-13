import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "https://tukar-six.vercel.app";
const OUT = "docs/screenshots";
const shots = [
  { name: "01-landing-desktop", path: "/", w: 1440, h: 900, full: true },
  { name: "02-sender-mobile",   path: "/sender", w: 390, h: 844, full: true },
  { name: "03-receiver-mobile", path: "/receiver", w: 390, h: 844, full: true },
  { name: "04-operator-desktop",path: "/operator", w: 1440, h: 900, full: true },
  { name: "05-regulator-desktop",path:"/regulator", w: 1440, h: 900, full: true },
  { name: "06-landing-mobile",  path: "/", w: 390, h: 844, full: true },
];
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
for (const s of shots) {
  const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  try {
    await p.goto(BASE + s.path, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: s.full });
    console.log("  shot " + s.name);
  } catch (e) { console.log("  FAIL " + s.name + " " + e.message.split("\n")[0]); }
  await p.close();
}
await b.close();
console.log("done");

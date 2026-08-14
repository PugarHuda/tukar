import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const bad = [];
for (const r of ["/", "/sender", "/receiver", "/regulator", "/operator", "/demo"]) {
  const p = await b.newPage();
  p.on("response", (res) => { if (res.status() === 404) bad.push(r + " -> " + res.url()); });
  await p.goto("http://localhost:3000" + r, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.close();
}
console.log(bad.length ? [...new Set(bad)].join("\n") : "no 404s");
await b.close();

import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "scripts/qa-shots";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(path, url, { w = 1440, h = 1000, after } = {}) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto("http://localhost:3000" + url, { waitUntil: "networkidle2", timeout: 60000 });
  await wait(1400);
  if (after) await after(p);
  await p.screenshot({ path: `${OUT}/${path}` });
  console.log("saved", path);
  await p.close();
}

// click a button/link by visible text
async function clickText(p, text) {
  const ok = await p.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((e) => e.textContent.trim().includes(t));
    if (el) { el.click(); return true; }
    return false;
  }, text);
  return ok;
}

await shot("affordance-sender-compose.png", "/sender");
await shot("affordance-sender-confirm.png", "/sender", {
  after: async (p) => { await clickText(p, "Continue"); await wait(1000); },
});
await shot("affordance-receiver.png", "/receiver");
await shot("affordance-regulator.png", "/regulator");
await shot("affordance-operator.png", "/operator");
await shot("affordance-sender-mobile.png", "/sender", { w: 390, h: 844 });

await b.close();

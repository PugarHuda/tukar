// Records a silent demo walkthrough of Tukar into a .webm (add your own voiceover).
// landing → /demo → Send (real on-chain deposit) → disclosure (verified on-chain)
// → tamper (rejected on-chain).
import puppeteer from "puppeteer-core";
process.env.PATH = "C:\\Hackathons\\Hackathon Stellar Real World ZK\\tools\\bin;" + process.env.PATH;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.argv[2] || "https://tukar-six.vercel.app";
const OUT = process.argv[3] || "tukar-demo.webm";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1280,720"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
const rec = await p.screencast({ path: OUT });
console.log("recording…");

// 1) landing — show hero, then glide down through the sections
await sleep(2600);
await p.evaluate(async () => {
  const end = document.body.scrollHeight - window.innerHeight;
  for (let y = 0; y <= end; y += 16) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 14)); }
});
await sleep(1200);

// 2) into the live demo
await p.goto(BASE + "/demo", { waitUntil: "networkidle2", timeout: 60000 });
for (let i = 0; i < 30; i++) { const s = await p.$eval("#status", (e) => e.textContent).catch(() => ""); if (/Ready/.test(s)) break; await sleep(1000); }
await sleep(1500);

// 3) Send — real on-chain deposit
await p.evaluate(() => { document.querySelector("#amount").value = "500"; document.querySelector("#recipient").value = "María, Mexico City"; });
await sleep(800);
await p.evaluate(() => document.querySelector("#sendBtn").click());
for (let i = 0; i < 50; i++) { const s = await p.$eval("#status", (e) => e.textContent).catch(() => ""); if (/Deposited on-chain|failed/.test(s)) break; await sleep(1000); }
await sleep(2500);

// 4) Regulator — disclosure verified on-chain
await p.select("#auditSelect", "1").catch(() => {});
await sleep(700);
await p.evaluate(() => document.querySelector("#proveBtn").click());
for (let i = 0; i < 25; i++) { const t = await p.$eval("#result .onchain", (e) => e.textContent).catch(() => ""); if (/Verified on-chain/.test(t)) break; await sleep(1000); }
await sleep(3000);

// 5) Tamper — rejected on-chain
await p.evaluate(() => { document.querySelector("#tamper").checked = true; document.querySelector("#result").innerHTML = ""; document.querySelector("#proveBtn").click(); });
for (let i = 0; i < 25; i++) { const t = await p.$eval("#result .onchain", (e) => e.textContent).catch(() => ""); if (/rejected/i.test(t)) break; await sleep(1000); }
await sleep(3500);

await rec.stop();
console.log("saved", OUT);
await b.close();

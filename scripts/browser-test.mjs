// Headless browser test of the live demo logic: loads the page, waits for the
// prover to initialize, then exercises the Send and Generate buttons.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.argv[2] || "http://localhost:8000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`  [${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`  [pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`  [reqfailed] ${r.url()} — ${r.failure()?.errorText}`));

console.log("Loading", URL);
await page.goto(URL, { waitUntil: "load", timeout: 60000 });

// wait up to 40s for status to leave Initializing/Loading
let statusText = "";
for (let i = 0; i < 40; i++) {
  statusText = await page.$eval("#status", (el) => el.textContent).catch(() => "(no #status)");
  if (!/Initializing|Loading/i.test(statusText)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("FINAL STATUS:", JSON.stringify(statusText));

// click Send into corridor
await page.click("#sendBtn").catch((e) => console.log("send click err", e.message));
await new Promise((r) => setTimeout(r, 800));
// wait for the on-chain deposit to finish (compliance proof + signed tx, ~15-30s)
let depStatus = "";
for (let i = 0; i < 50; i++) {
  depStatus = await page.$eval("#status", (el) => el.textContent.trim()).catch(() => "");
  if (/Deposited on-chain|deposit failed/i.test(depStatus)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("DEPOSIT STATUS:", JSON.stringify(depStatus));
const badge = await page.$eval("#ledger .okc, #ledger .fail", (el) => el.textContent.trim()).catch(() => "(no badge)");
console.log("DEPOSIT BADGE :", JSON.stringify(badge));
const ledger = await page.$eval("#ledger", (el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 90)).catch(() => "(err)");
console.log("LEDGER AFTER SEND:", JSON.stringify(ledger));

// receiver (Country B) panel + off-ramp
const incoming = await page.$eval("#incoming", (el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 70)).catch(() => "(err)");
console.log("RECEIVER INCOMING:", JSON.stringify(incoming));
await page.evaluate(() => document.querySelector("#incoming .offramp")?.click());
await new Promise((r) => setTimeout(r, 400));
const reveal = await page.$eval("#incoming .reveal", (el) => el.textContent.trim()).catch(() => "(no reveal)");
console.log("OFF-RAMP REVEAL :", JSON.stringify(reveal));

// try generating a disclosure proof (select the note first)
await page.select("#auditSelect", "1").catch(() => {});
await page.click("#proveBtn").catch((e) => console.log("prove click err", e.message));
// wait up to 30s for a result
let resultText = "";
for (let i = 0; i < 30; i++) {
  resultText = await page.$eval("#result", (el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 120)).catch(() => "");
  if (resultText && resultText.length > 5) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("DISCLOSURE RESULT:", JSON.stringify(resultText));

// wait for the live on-chain confirmation line + pool state
await new Promise((r) => setTimeout(r, 8000));
const onchain = await page.$eval("#result .onchain", (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "(no .onchain)");
const poolState = await page.$eval("#poolState", (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "(no #poolState)");
console.log("ON-CHAIN LINE:", JSON.stringify(onchain));
console.log("POOL STATE   :", JSON.stringify(poolState));

// tamper round: tick Tamper, re-prove, expect rejection in-browser + on-chain
await page.evaluate(() => {
  document.querySelector("#tamper").checked = true;
  document.querySelector("#result").innerHTML = ""; // clear stale valid result
  document.querySelector("#proveBtn").click();
});
let tRes = "";
for (let i = 0; i < 30; i++) {
  tRes = await page.$eval("#result", (el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 70)).catch(() => "");
  if (/REJECTED/.test(tRes)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 7000));
const tOnchain = await page.$eval("#result .onchain", (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "(none)");
console.log("TAMPER RESULT:", JSON.stringify(tRes));
console.log("TAMPER ONCHAIN:", JSON.stringify(tOnchain));

console.log("\nCONSOLE / ERRORS:");
console.log(logs.join("\n") || "  (none)");
await browser.close();

// Renders scripts/og-source.html to webapp/public/og-image.png (1200x630) with Chromium.
// Provenance is embedded afterwards by the Impeccable embed-prompt script (see docs/DESIGN notes).
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(resolve("scripts/og-source.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
await p.screenshot({ path: "webapp/public/og-image.png", type: "png" });
await b.close();
console.log("wrote webapp/public/og-image.png");

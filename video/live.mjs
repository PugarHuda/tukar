// Render the live-demo cut, and always put the full cut back.
//
//   node live.mjs
//
// The cut lives in script.json, so rendering a short cut means swapping that file. Doing
// that with shell chaining leaves the wrong cut in place when a step fails, and the next
// render then quietly produces the wrong video. This swaps, renders, ships, and restores
// in a finally block, so an interrupted run still leaves the full cut loaded.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (bin, args) => execFileSync(bin, args, { cwd: HERE, stdio: "inherit" });
const load = (name) => copyFileSync(path.join(HERE, "cuts", `${name}.json`), path.join(HERE, "script.json"));
const title = () => JSON.parse(readFileSync(path.join(HERE, "script.json"), "utf8")).title;

try {
  load("livedemo");
  console.log(`rendering: ${title()}`);
  run(npx, ["remotion", "render", "src/index.ts", "TukarDemo", "out/tukar-livedemo.mp4", "--concurrency=2", "--crf=20"]);
  run("node", ["ship.mjs", "28", "out/tukar-livedemo.mp4", "../webapp/public/demo-live.mp4"]);
} finally {
  load("full");
  console.log(`script.json restored to: ${title()}`);
}

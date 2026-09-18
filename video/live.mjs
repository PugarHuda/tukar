// Render the live-demo cut, and always put the full cut back.
//
//   node live.mjs
//
// The cut lives in script.json, so rendering a short cut means swapping that file. Doing
// that with shell chaining leaves the wrong cut in place when a step fails, and the next
// render then quietly produces the wrong video. This swaps, renders, ships, and restores
// in a finally block, so an interrupted run still leaves the full cut loaded.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Node 26 on Windows refuses to spawnSync a .cmd shim (EINVAL), so call the CLI's own
// entry script with this same node binary instead of going through npx.
const REMOTION_CLI = path.join(HERE, "node_modules", "@remotion", "cli", "remotion-cli.js");
const run = (bin, args) => execFileSync(bin, args, { cwd: HERE, stdio: "inherit" });
const load = (name) => {
  copyFileSync(path.join(HERE, "cuts", `${name}.json`), path.join(HERE, "script.json"));
  // Without this the bundler cache renders the cut that was loaded a moment ago.
  rmSync(path.join(HERE, "node_modules", ".cache"), { recursive: true, force: true });
};
const title = () => JSON.parse(readFileSync(path.join(HERE, "script.json"), "utf8")).title;

try {
  load("livedemo");
  console.log(`rendering: ${title()}`);
  run(process.execPath, [REMOTION_CLI, "render", "src/index.ts", "TukarDemo", "out/tukar-livedemo.mp4", "--concurrency=2", "--crf=20"]);
  run("node", ["ship.mjs", "28", "out/tukar-livedemo.mp4", "../webapp/public/demo-live.mp4"]);
} finally {
  load("full");
  console.log(`script.json restored to: ${title()}`);
}

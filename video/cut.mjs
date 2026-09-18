// Choose which cut sits in script.json.
//
//   node cut.mjs             list the cuts
//   node cut.mjs full        the whole video, five acts
//   node cut.mjs livedemo    the live demo on its own, no consoles
//
// Every stage reads script.json and nothing else, so a cut is simply which file is
// sitting there. Capture always wants the full cut, because that run is what records a
// mark for every scene; the shorter cuts re-use those same marks and the same narration
// clips, so switching a cut and re-rendering costs nothing but the render.
import { readdirSync, copyFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUTS = path.join(HERE, "cuts");
const SCRIPT = path.join(HERE, "script.json");

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const summary = (s) => {
  const words = s.scenes.reduce((n, sc) => n + sc.vo.split(/\s+/).length, 0);
  const secs = (words / 165) * 60 + s.scenes.length * 0.8 + 2.6 + s.acts.length * 1.5 + 3;
  return `${String(s.scenes.length).padStart(2)} scenes  ${s.acts.length} acts  ${words} words  about ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
};

const names = readdirSync(CUTS).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const want = process.argv[2];

if (!want) {
  const current = existsSync(SCRIPT) ? read(SCRIPT).title : "(none)";
  console.log(`script.json currently holds: ${current}\n`);
  for (const n of names) console.log(`  ${n.padEnd(10)} ${summary(read(path.join(CUTS, `${n}.json`)))}`);
  console.log(`\nnode cut.mjs <name>`);
  process.exit(0);
}

if (!names.includes(want)) {
  console.error(`no cut called "${want}". Available: ${names.join(", ")}`);
  process.exit(1);
}

const src = path.join(CUTS, `${want}.json`);
copyFileSync(src, SCRIPT);
// webpack's filesystem cache will happily serve the previous script.json, and the render
// then produces the wrong cut under the right filename. Drop it whenever the cut changes.
rmSync(path.join(HERE, "node_modules", ".cache"), { recursive: true, force: true });
const s = read(SCRIPT);
console.log(`script.json <- cuts/${want}.json\n  ${s.title}\n  ${summary(s)}`);
console.log(`\nnext: npm run render   (re-run npm run vo first only if the narration text changed)`);

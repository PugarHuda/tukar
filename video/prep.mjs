// Make the Playwright captures frame-accurate, then correct the scene marks.
//
//   node prep.mjs
//
// Playwright writes variable-frame-rate webm, which cannot be trimmed to a frame.
// This transcodes each capture to constant-frame-rate h264 in public/cap/, then
// rescales every mark by (real video duration / wall-clock duration) so the marks
// line up with the file even if the screencast started or ended a beat late.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = JSON.parse(readFileSync(path.join(HERE, "script.json"), "utf8")).fps;
const IN = path.join(HERE, "captures");
const OUT = path.join(HERE, "public", "cap");
mkdirSync(OUT, { recursive: true });

const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 26 });
const ffmpeg = (args) => {
  try {
    return run("ffmpeg", args);
  } catch (e) {
    // ffmpeg writes its banner to stderr and exits 0; only a real failure lands here
    if (e.status) throw new Error(String(e.stderr || e.message).slice(-1500));
    return "";
  }
};
const durationMs = (file) =>
  Math.round(parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim()) * 1000);

const data = JSON.parse(readFileSync(path.join(IN, "marks.json"), "utf8"));

for (const [name, src] of Object.entries(data.sources)) {
  const from = path.join(IN, src.file);
  const to = path.join(OUT, `${name}.mp4`);
  console.log(`  ${src.file} -> cap/${name}.mp4`);
  ffmpeg([
    "-y", "-i", from,
    "-vf", `fps=${FPS}`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-an", to,
  ]);
  const real = durationMs(to);
  const scale = real / src.wallMs;
  console.log(`     wall ${(src.wallMs / 1000).toFixed(1)}s, video ${(real / 1000).toFixed(1)}s, marks x${scale.toFixed(4)}`);
  for (const m of data.marks) {
    if (m.source !== name) continue;
    m.startMs = Math.round(m.startMs * scale);
    m.endMs = Math.min(real, Math.round(m.endMs * scale));
  }
  src.file = `${name}.mp4`;
  src.durationMs = real;
}

writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(data, null, 2));
console.log(`\nwrote public/cap/marks.json`);

// Compress the render and drop it where the deck and the README expect it.
//
//   node ship.mjs [crf] [master] [dest]
//
// Defaults ship the full cut. The live cut renders to out/tukar-livedemo.mp4 and ships
// beside it, so both can sit in webapp/public at once.
//
// Remotion writes a high-quality master to out/tukar-demo.mp4. The copy the deck
// embeds is served by Vercel and lives in git, so it gets a second pass tuned for
// screen content: same pixels, a fraction of the bytes.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CRF = process.argv[2] || "28";
const master = path.resolve(HERE, process.argv[3] || "out/tukar-demo.mp4");
const ship = path.resolve(HERE, process.argv[4] || "../webapp/public/demo-id.mp4");

execFileSync("ffmpeg", [
  "-y", "-i", master,
  "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-tune", "stillimage",
  "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "128k", "-ac", "2",
  ship,
], { stdio: "inherit" });

const probe = (f) =>
  execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate", "-show_entries", "format=duration",
    "-of", "default=nw=1", f], { encoding: "utf8" }).trim().replace(/\s+/g, " ");

console.log(`\nmaster  ${(statSync(master).size / 1e6).toFixed(1)} MB  ${probe(master)}`);
console.log(`shipped ${(statSync(ship).size / 1e6).toFixed(1)} MB  ${probe(ship)}  -> webapp/public/demo-id.mp4`);

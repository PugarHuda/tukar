import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

// Render with a browser that is already installed.
//
// On Node 26 the bundled Chrome Headless Shell re-downloads on every run and then fails to
// unpack, and the CLI exits 0 without rendering a frame, which reads as a successful render
// that produced nothing. Pointing Remotion at an installed Chrome avoids that path.
// REMOTION_BROWSER_EXECUTABLE wins when set; otherwise the usual Windows and macOS
// locations are tried, and when none exists Remotion falls back to its own download.
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p) => Boolean(p));

const browser = CANDIDATES.find((p) => existsSync(p));
if (browser) Config.setBrowserExecutable(browser);

// team/script.json + the measured narration + the capture marks -> the team video's timeline.
// Same rule as the demo: a scene lasts as long as its line. The capture held each page at
// least that long, so clips play at or near real speed.
import script from "../team/script.json";
import vo from "../public/team/vo.json";
import marks from "../public/team/marks.json";
import type { Box, Word } from "./overlays";

export const TEAM_FPS = script.fps;
const PAD_MS = 700;
const TITLE_MS = 3200;
const END_MS = 3600;
const f = (ms: number) => Math.max(1, Math.round((ms / 1000) * TEAM_FPS));

type Mark = { id: string; startMs: number; endMs: number; boxes: (Box & { via?: string })[] };
const MARKS = (marks as { marks: Mark[] }).marks;
const VO = vo as { id: string; ms: number; words: Word[] }[];

export type TeamItem =
  | { kind: "title" | "end"; from: number; dur: number }
  | { kind: "scene"; id: string; from: number; dur: number; bar: string; trimBefore: number; trimAfter: number; rate: number; realMs: number; words: Word[]; boxes: Box[]; voFile: string };

export const teamItems: TeamItem[] = [];
let cursor = 0;
const push = (it: TeamItem) => {
  teamItems.push(it);
  cursor += it.dur;
};

push({ kind: "title", from: 0, dur: f(TITLE_MS) });
for (const sc of script.scenes) {
  const m = MARKS.find((x) => x.id === sc.id);
  const v = VO.find((x) => x.id === sc.id);
  if (!m || !v) throw new Error(`team scene ${sc.id} has no ${!m ? "capture mark" : "narration"}. Re-run team/vo.py and team/capture.mjs`);
  const wantMs = v.ms + PAD_MS;
  const realMs = m.endMs - m.startMs;
  const rate = Math.min(4, Math.max(1, realMs / wantMs));
  const usedMs = Math.min(realMs, wantMs * rate);
  push({
    kind: "scene",
    id: sc.id,
    from: cursor,
    dur: f(wantMs),
    bar: sc.bar,
    trimBefore: Math.round((m.startMs / 1000) * TEAM_FPS),
    trimAfter: Math.round(((m.startMs + usedMs) / 1000) * TEAM_FPS),
    rate,
    realMs,
    words: v.words,
    boxes: m.boxes.map(({ x, y, w, h, label, from, tag }) => ({ x, y, w, h, label, from, tag })),
    voFile: `team/vo/${sc.id}.mp3`,
  });
}
push({ kind: "end", from: cursor, dur: f(END_MS) });

export const TEAM_TOTAL = cursor;
export const TEAM_W = (marks as { width: number }).width;
export const TEAM_H = (marks as { height: number }).height;

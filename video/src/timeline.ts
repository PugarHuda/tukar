// Turn script.json + the measured narration + the capture marks into a timeline.
//
// The rule: a scene lasts as long as its narration. If the real capture for that
// scene ran longer, because the app genuinely took time to prove something or to
// confirm a ledger write, the clip is played faster and the frame says by how
// much. Nothing is cut to make the app look quicker than it is.
import script from "../script.json";
import vo from "../public/vo/vo.json";
import marks from "../public/cap/marks.json";

export const FPS = script.fps;
export const WIDTH = script.width;
export const HEIGHT = script.height;

const PAD_MS = 800; // a beat of quiet after each line
const MAX_RATE = 10; // past this a clip is trimmed from its head instead
const TITLE_MS = 2600;
const ACT_MS = 1500;
const END_MS = 3000;

const f = (ms: number) => Math.max(1, Math.round((ms / 1000) * FPS));

type Mark = { id: string; source: string; startMs: number; endMs: number };
type Src = { file: string; durationMs: number };

const SOURCES = marks.sources as Record<string, Src>;
const MARKS = marks.marks as Mark[];
const VO = vo as { id: string; ms: number }[];

export type Item =
  | { kind: "title"; end?: boolean; from: number; durationInFrames: number }
  | { kind: "act"; n: string; title: string; sub: string; from: number; durationInFrames: number }
  | {
      kind: "scene";
      id: string;
      from: number;
      durationInFrames: number;
      shot: "phone" | "desk";
      bar: string;
      src: string;
      trimBefore: number;
      trimAfter: number;
      rate: number;
      realMs: number;
      voFile: string;
      voMs: number;
      captions: string[];
    };

export const items: Item[] = [];
let cursor = 0;
const push = <T extends { durationInFrames: number }>(it: Omit<T, "from">): void => {
  items.push({ ...(it as object), from: cursor } as Item);
  cursor += it.durationInFrames;
};

push({ kind: "title", durationInFrames: f(TITLE_MS) });

for (const sc of script.scenes) {
  const act = script.acts.find((a) => a.before === sc.id);
  if (act) push({ kind: "act", n: act.n, title: act.title, sub: act.sub, durationInFrames: f(ACT_MS) });

  const m = MARKS.find((x) => x.id === sc.id);
  const voMs = VO.find((v) => v.id === sc.id)?.ms ?? 6000;
  if (!m) {
    // No footage for this beat: say so out loud rather than shipping a filler frame.
    throw new Error(`no capture mark for ${sc.id}. Re-run: node capture.mjs`);
  }
  const realMs = Math.max(200, m.endMs - m.startMs);
  const wantMs = voMs + PAD_MS;
  const rate = Math.min(MAX_RATE, Math.max(1, realMs / wantMs));
  const usedMs = Math.min(realMs, wantMs * rate);
  // When a clip is longer than MAX_RATE allows, keep its tail: that is where the
  // result lands (the stamp, the receipt, the confirmed figure).
  const trimBefore = m.startMs + (realMs - usedMs);

  push({
    kind: "scene",
    id: sc.id,
    durationInFrames: f(wantMs),
    shot: sc.source === "phone" ? "phone" : "desk",
    bar: sc.bar,
    src: SOURCES[sc.source].file,
    // trimBefore / trimAfter are frames of the source, which prep.mjs has already
    // rewritten to this composition's frame rate.
    trimBefore: Math.round((trimBefore / 1000) * FPS),
    trimAfter: Math.round(((trimBefore + usedMs) / 1000) * FPS),
    rate,
    realMs,
    voFile: `vo/${sc.id}.mp3`,
    voMs,
    captions: sc.captions,
  });
}

push({ kind: "title", end: true, durationInFrames: f(END_MS) });

export const TOTAL = cursor;

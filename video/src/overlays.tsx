// Two overlays shared by the team video and the demo video.
//
// Karaoke: the narration, one line at a time, with the word being spoken lit up. Timing
// comes from the voice's own word-boundary events (see team/vo.py), so the light follows
// the audio instead of an estimate.
//
// Callout: a stamp-ink box drawn around the element the narration is talking about, with a
// label tag. The box is where capture.mjs measured the element in the real page; nothing
// here decides where things are.
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { c, stencil, barlow } from "./theme";

export type Word = { w: string; s: number; e: number };
export type Box = { x: number; y: number; w: number; h: number; label: string; from: number; until?: number; tag?: "above" | "below" };

const GAP_BREAK_MS = 320; // a pause this long is where a sentence ended
const MAX_WORDS = 9;

/** Split the words into caption lines at natural pauses, never longer than MAX_WORDS. */
export function toLines(words: Word[]): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const pause = next ? next.s - w.e : Infinity;
    if (cur.length >= MAX_WORDS || pause >= GAP_BREAK_MS || !next) {
      lines.push(cur);
      cur = [];
    }
  });
  return lines;
}

export const Karaoke: React.FC<{ words: Word[]; fontSize?: number }> = ({ words, fontSize = 44 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const lines = React.useMemo(() => toLines(words), [words]);
  if (!lines.length) return null;
  // the line on screen is the last one that has started; hold the final line to the end
  let idx = 0;
  for (let i = 0; i < lines.length; i++) if (ms >= lines[i][0].s - 120) idx = i;
  const line = lines[idx];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px", fontFamily: barlow, fontWeight: 600, fontSize, lineHeight: 1.25 }}>
      {line.map((w, i) => {
        const on = ms >= w.s && ms < w.e + 60;
        const past = ms >= w.e + 60;
        return (
          <span
            key={i}
            style={{
              padding: "2px 10px",
              borderRadius: 6,
              color: on ? "#fff" : c.label,
              opacity: on || past ? 1 : 0.42,
              background: on ? c.tape : "transparent",
              boxShadow: on ? `0 0 26px 4px ${c.tape}, 0 0 60px 10px rgba(216,52,43,0.45)` : "none",
              textShadow: on ? "0 0 12px rgba(255,255,255,0.65)" : "none",
              transform: on ? "translateY(-2px) scale(1.06)" : "none",
              transition: "none",
            }}
          >
            {w.w}
          </span>
        );
      })}
    </div>
  );
};

/** Boxes live in the capture's own pixel space; the parent scales them with the video. */
export const Callouts: React.FC<{ boxes: Box[]; dur: number; tagSize?: number; frameW?: number }> = ({ boxes, dur, tagSize = 30, frameW = 1600 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = boxes.filter((b) => frame >= Math.round(b.from * dur) && (b.until === undefined || frame < Math.round(b.until * dur)));
  const latest = shown[shown.length - 1];
  return (
    <>
      {shown.map((b, i) => {
        const at = Math.round(b.from * dur);
        const p = interpolate(frame - at, [0, fps * 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const perim = 2 * (b.w + b.h);
        const isLatest = b === latest;
        const tagBelow = b.tag === "below" || (b.tag !== "above" && b.y < tagSize * 2.4);
        return (
          <React.Fragment key={i}>
            {isLatest && (
              <div
                style={{
                  position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 10,
                  boxShadow: `0 0 0 4000px rgba(22,19,17,${0.4 * p})`, pointerEvents: "none",
                }}
              />
            )}
            <svg style={{ position: "absolute", left: b.x - 6, top: b.y - 6, width: b.w + 12, height: b.h + 12, overflow: "visible" }}>
              <rect
                x={3} y={3} width={b.w + 6} height={b.h + 6} rx={10} fill="none"
                stroke={c.stamp} strokeWidth={6}
                strokeDasharray={perim + 40} strokeDashoffset={(1 - p) * (perim + 40)}
                style={{ filter: `drop-shadow(0 0 10px rgba(42,79,168,${0.7 * p}))` }}
              />
            </svg>
            <div
              style={{
                position: "absolute", left: Math.max(4, Math.min(b.x, frameW - 40 - b.label.length * tagSize * 0.62)), top: tagBelow ? b.y + b.h + 12 : b.y - tagSize * 1.95,
                opacity: p, transform: `translateY(${(1 - p) * (tagBelow ? -8 : 8)}px)`,
                background: c.stamp, color: c.label, fontFamily: stencil, fontSize: tagSize, letterSpacing: "0.06em",
                textTransform: "uppercase", padding: `${tagSize * 0.27}px ${tagSize * 0.53}px`, borderRadius: 6, whiteSpace: "nowrap",
                boxShadow: "0 6px 20px -6px rgba(22,19,17,0.6)",
              }}
            >
              {b.label}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

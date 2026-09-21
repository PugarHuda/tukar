// The composition. Every moving picture in here is a Playwright recording of the
// real app; the frame around it is the parcel world from DESIGN.md.
import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { c, type } from "./theme";
import { ActCard, Kraft, LabelBar, Ruler, Seal, Sheet, TitleCard, clock } from "./parts";
import { items, TOTAL, type Item } from "./timeline";
import { Callouts, Karaoke } from "./overlays";

const PHONE = { w: 430, h: 932 };
const DESK = { w: 1600, h: 900 };

/** Captions, split across the scene in proportion to how much there is to read. */
const Captions: React.FC<{ lines: string[]; frames: number }> = ({ lines, frames }) => {
  const frame = useCurrentFrame();
  const total = lines.reduce((n, l) => n + l.length, 0);
  let at = 0;
  let showing = lines[lines.length - 1];
  let started = 0;
  for (const l of lines) {
    const span = (l.length / total) * frames;
    if (frame < at + span) {
      showing = l;
      started = at;
      break;
    }
    at += span;
  }
  const { fps } = useVideoConfig();
  const t = clock(frame, fps, started);
  return (
    <span style={{ opacity: 0.25 + 0.75 * t, transform: `translateY(${(1 - t) * 5}px)`, display: "inline-block" }}>{showing}</span>
  );
};

// Where the real app made us wait, say so in the label bar rather than letting the
// clip imply the work was instant.
const provenance = (rate: number, realMs: number) =>
  rate <= 1.5
    ? "real capture · Stellar testnet"
    : `sped up ${rate.toFixed(1)}x · real time ${Math.round(realMs / 1000)}s`;

const Screen: React.FC<{ it: Extract<Item, { kind: "scene" }>; w: number; h: number; scale: number }> = ({ it, w, h, scale }) => (
  <div style={{ width: w * scale, height: h * scale, overflow: "hidden", background: c.ink, position: "relative" }}>
    <OffthreadVideo
      src={staticFile(`cap/${it.src}`)}
      trimBefore={it.trimBefore}
      trimAfter={it.trimAfter}
      playbackRate={it.rate}
      muted
      style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left", display: "block" }}
    />
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <Callouts boxes={it.boxes} dur={it.durationInFrames} tagSize={w < 800 ? 19 : 30} frameW={w} />
    </div>
  </div>
);

const Scene: React.FC<{ it: Extract<Item, { kind: "scene" }> }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = clock(frame, fps);
  const phone = it.shot === "phone";
  const dim = phone ? PHONE : DESK;
  // As close to 1:1 as the frame allows. The consoles are dense by design, so the
  // desktop shot gives up the least resolution it can and still leave a caption.
  const scale = phone ? 0.95 : 0.92;

  const sheetW = dim.w * scale + 28;
  const sheet = (
    <Sheet lift style={{ position: "relative", width: sheetW, opacity: t, transform: `translateY(${(1 - t) * 10}px)` }}>
      <LabelBar left={it.bar} right={provenance(it.rate, it.realMs)} small={phone} />
      <div style={{ padding: 14 }}>
        <Screen it={it} w={dim.w} h={dim.h} scale={scale} />
      </div>
    </Sheet>
  );

  // The phone shot leaves a whole column of kraft, so the narration gets its own
  // label there. The desktop shot fills the frame, so it gets a caption slip under it.
  const caption = phone ? (
    <div style={{ opacity: t, position: "relative", background: c.ink, borderRadius: 10, padding: "40px 34px", minHeight: 250, display: "flex", alignItems: "center", boxShadow: "0 16px 36px -16px rgba(22,19,17,0.6)" }}>
      {it.words.length ? <Karaoke words={it.words} fontSize={46} /> : <span style={{ ...type.lead, fontSize: 40, color: c.label }}><Captions lines={it.captions} frames={it.durationInFrames} /></span>}
      <Seal style={{ position: "absolute", right: 26, bottom: 20 }} />
    </div>
  ) : (
    <div style={{ opacity: t, width: sheetW, background: c.ink, borderRadius: 10, padding: "16px 28px", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 36px -16px rgba(22,19,17,0.6)" }}>
      {it.words.length ? <Karaoke words={it.words} fontSize={36} /> : <span style={{ ...type.lead, fontSize: 34, color: c.label }}><Captions lines={it.captions} frames={it.durationInFrames} /></span>}
    </div>
  );

  return (
    <Kraft>
      {phone ? (
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", gap: 56, padding: "0 72px" }}>
          <div>{sheet}</div>
          <div style={{ flex: 1 }}>{caption}</div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "24px 40px 30px" }}>
          {sheet}
          {caption}
        </AbsoluteFill>
      )}
      <Audio src={staticFile(it.voFile)} />
    </Kraft>
  );
};

export const TukarDemo: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: c.kraft }}>
      {items.map((it, i) => (
        <Sequence key={i} from={it.from} durationInFrames={it.durationInFrames}>
          {it.kind === "title" ? <TitleCard end={it.end} /> : it.kind === "act" ? <ActCard n={it.n} title={it.title} sub={it.sub} /> : <Scene it={it} />}
        </Sequence>
      ))}
      <Ruler done={frame / TOTAL} />
    </AbsoluteFill>
  );
};

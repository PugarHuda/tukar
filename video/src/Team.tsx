// The team presentation. Every moving picture is a Playwright recording of a real public
// page; the boxes sit where the capture measured the element being talked about, and the
// captions light each word as it is spoken.
import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { c, type, stencil, mono } from "./theme";
import { Kraft, LabelBar, Mark, Ruler, Seal, Sheet, Tape, clock } from "./parts";
import { Callouts, Karaoke } from "./overlays";
import { teamItems, TEAM_TOTAL, TEAM_W, TEAM_H, type TeamItem } from "./teamTimeline";

const SCALE = 0.86;
const ZOOM = 1.07; // a slow push toward whatever the box is on

const TeamScene: React.FC<{ it: Extract<TeamItem, { kind: "scene" }> }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = clock(frame, fps);

  // push in on the first box, from the moment it appears
  const first = it.boxes[0];
  const at = first ? Math.round(first.from * it.dur) : it.dur;
  const z = first ? interpolate(frame - at, [0, fps * 1.4], [1, ZOOM], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const cx = first ? first.x + first.w / 2 : TEAM_W / 2;
  const cy = first ? first.y + first.h / 2 : TEAM_H / 2;
  const s = SCALE * z;
  const tx = cx * SCALE * (1 - z);
  const ty = cy * SCALE * (1 - z);

  const w = TEAM_W * SCALE;
  const h = TEAM_H * SCALE;

  return (
    <Kraft>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "22px 40px 26px" }}>
        <Sheet lift style={{ position: "relative", width: w + 28, opacity: t, transform: `translateY(${(1 - t) * 10}px)` }}>
          <LabelBar left={it.bar} right="real page / recorded by Playwright" />
          <div style={{ padding: 14 }}>
            <div style={{ width: w, height: h, overflow: "hidden", position: "relative", background: c.ink }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: TEAM_W, height: TEAM_H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
                <OffthreadVideo
                  src={staticFile("team/cap.mp4")}
                  trimBefore={it.trimBefore}
                  trimAfter={it.trimAfter}
                  playbackRate={it.rate}
                  muted
                  style={{ width: TEAM_W, height: TEAM_H, display: "block" }}
                />
                <Callouts boxes={it.boxes} dur={it.dur} />
              </div>
            </div>
          </div>
          <Tape style={{ top: -16, left: 64, width: 170, height: 40, zIndex: 2 }} t={t} />
        </Sheet>
        <div
          style={{
            width: w + 28, minHeight: 104, background: c.ink, borderRadius: 10, padding: "20px 28px",
            display: "flex", alignItems: "center", justifyContent: "center", opacity: t,
            boxShadow: "0 16px 36px -16px rgba(22,19,17,0.6)",
          }}
        >
          <Karaoke words={it.words} fontSize={42} />
        </div>
      </AbsoluteFill>
      <Audio src={staticFile(it.voFile)} />
    </Kraft>
  );
};

const TeamCard: React.FC<{ end?: boolean }> = ({ end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = clock(frame, fps);
  const t2 = clock(frame, fps, Math.round(fps * 0.5));
  return (
    <Kraft>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Sheet lift style={{ position: "relative", width: 1240, opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
          <LabelBar left={end ? "Tukar / check it yourself" : "Tukar / SCF Build, Open Track"} right={end ? "open source" : "team presentation"} />
          <div style={{ padding: "56px 64px 60px", display: "flex", gap: 48, alignItems: "center" }}>
            <Mark size={150} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ ...type.display, fontSize: 96, color: c.ink }}>{end ? "Check it yourself" : "The team"}</div>
              <div style={{ ...type.lead, fontSize: 38, color: c.ink2, opacity: t2 }}>
                {end ? "Every page in this video is public." : "Pugar Huda Mantoro, founder and sole engineer"}
              </div>
              <div style={{ fontFamily: mono, fontSize: 28, color: c.stamp, opacity: t2, lineHeight: 1.6 }}>
                {end ? (
                  <>
                    tukar-six.vercel.app
                    <br />
                    github.com/PugarHuda
                  </>
                ) : (
                  "5th, Stellar Hacks: Real-World ZK / Grand Finalist, Stellar APAC"
                )}
              </div>
            </div>
          </div>
          <Seal style={{ position: "absolute", right: 34, bottom: 28 }} />
          <Tape cover style={{ top: -44, right: 78, width: 300, height: 62, zIndex: 2 }} t={t} />
        </Sheet>
      </AbsoluteFill>
    </Kraft>
  );
};

export const TukarTeam: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: c.kraft, fontFamily: stencil }}>
      {teamItems.map((it, i) => (
        <Sequence key={i} from={it.from} durationInFrames={it.dur}>
          {it.kind === "scene" ? <TeamScene it={it} /> : <TeamCard end={it.kind === "end"} />}
        </Sequence>
      ))}
      <Ruler done={frame / TEAM_TOTAL} />
    </AbsoluteFill>
  );
};

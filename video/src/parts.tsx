// The world's devices, as Remotion components: kraft ground, label sheets, ink
// label bars, typed badges, rubber stamps, tape strips. Nothing here invents a
// visual language; each piece maps to a component in .impeccable/design.json.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { c, type, shadow, CLOCK, EASE, mono, stencil } from "./theme";

const ease = (t: number) => {
  // cubic-bezier(0.2,0.7,0.2,1), sampled the cheap way
  const [, y1, , y2] = EASE;
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
};

/** Progress on the one clock: 0 to 1 over CLOCK ms from `atFrame`. */
export const clock = (frame: number, fps: number, atFrame = 0) =>
  ease(interpolate(frame - atFrame, [0, (CLOCK / 1000) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

/** The box: a seamless kraft corrugate tile, the same asset the app uses. */
export const Kraft: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: c.kraft, backgroundImage: `url(${staticFile("world/kraft.svg")})`, backgroundSize: 256 }}>
    {children}
  </AbsoluteFill>
);

/** A strip of packing tape, multiply-blended, unrolling left to right. */
export const Tape: React.FC<{ style?: React.CSSProperties; t?: number; cover?: boolean }> = ({ style, t = 1, cover }) => (
  <div
    style={{
      position: "absolute",
      backgroundImage: `url(${staticFile("world/tape.svg")})`,
      backgroundSize: "100% 100%",
      // On a sheet: multiply, so whatever it crosses shows through. Across a card
      // corner: the deck cover's treatment, normal blending at 90%, rotated -7deg.
      mixBlendMode: cover ? "normal" : "multiply",
      opacity: cover ? 0.9 : 1,
      transformOrigin: "left center",
      transform: `scaleX(${t}) rotate(${cover ? -7 : -0.6}deg)`,
      ...style,
    }}
  />
);

/** A typed tag: a small ruled box in Courier caps. */
export const Badge: React.FC<{ children: React.ReactNode; tone?: "muted" | "cleared" | "pending" }> = ({ children, tone = "muted" }) => {
  const skin =
    tone === "cleared"
      ? { background: c.stampWash, borderColor: c.stamp, color: c.stampDeep }
      : tone === "pending"
        ? { background: "rgba(212,164,104,0.30)", borderColor: c.kraftEdge, color: c.ink2 }
        : { background: c.label2, borderColor: "rgba(22,19,17,0.35)", color: c.ink2 };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        border: "1px solid",
        borderRadius: 2,
        padding: "6px 14px",
        fontFamily: mono,
        fontSize: 21,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        ...skin,
      }}
    >
      {children}
    </span>
  );
};

/** The verdict device: two-line ink border, stencil caps, -4deg, multiply blend. */
export const Stamp: React.FC<{ children: React.ReactNode; tone?: "stamp" | "tape" | "ink"; sub?: string }> = ({
  children,
  tone = "stamp",
  sub,
}) => {
  const color = tone === "tape" ? c.tape : tone === "ink" ? c.ink : c.stamp;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "8px 20px 6px",
        border: `3px solid ${color}`,
        outline: `2px solid ${color}`,
        outlineOffset: 4,
        borderRadius: 3,
        color,
        ...type.stampText,
        fontSize: 26,
        textAlign: "center",
        transform: "rotate(-4deg)",
        mixBlendMode: "multiply",
        opacity: 0.94,
      }}
    >
      {children}
      {sub ? <span style={{ display: "block", marginTop: 5, fontFamily: mono, fontSize: 17, fontWeight: 600, letterSpacing: "0.1em" }}>{sub}</span> : null}
    </span>
  );
};

/** An ink bar of typed captions along the top of a label. */
export const LabelBar: React.FC<{ left: React.ReactNode; right?: React.ReactNode; small?: boolean }> = ({ left, right, small }) => (
  <div
    style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "baseline",
      gap: small ? "2px 14px" : "4px 28px",
      background: c.ink,
      color: c.label,
      padding: small ? "10px 16px" : "14px 26px",
      ...type.label,
      fontSize: small ? 15 : 22,
    }}
  >
    <span>{left}</span>
    {right ? <span style={{ marginLeft: "auto", opacity: 0.78 }}>{right}</span> : null}
  </div>
);

/** White label paper stuck to the box: ink border, glue edge, soft offset drop. */
export const Sheet: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; lift?: boolean }> = ({ children, style, lift }) => (
  <div
    style={{
      background: c.label,
      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 40%)",
      color: c.ink,
      border: "1px solid rgba(22,19,17,0.25)",
      borderRadius: 6,
      boxShadow: lift ? shadow.lift : shadow.card,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

/** The landmark mark: a short strip of tape with one folded corner. Once per view. */
export const Seal: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg width={112} height={56} viewBox="0 0 56 28" style={style} role="img" aria-label="Sealed">
    <path d="M2 6h46l6 4-6 4v8H2z" fill="#b8834a" fillOpacity="0.85" stroke={c.ink} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M48 6l6 4-6 4z" fill={c.kraftEdge} stroke={c.ink} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8 11h30M8 17h22" stroke={c.label} strokeWidth="1.5" strokeOpacity="0.55" strokeLinecap="round" />
  </svg>
);

/** A thin ruled progress line along the very bottom of the frame. */
export const Ruler: React.FC<{ done: number }> = ({ done }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, background: "rgba(22,19,17,0.18)" }}>
    <div style={{ width: `${Math.min(1, Math.max(0, done)) * 100}%`, height: "100%", background: c.stamp }} />
  </div>
);

/** The real Tukar mark, used as shipped. Never redrawn. */
export const Mark: React.FC<{ size?: number }> = ({ size = 96 }) => <Img src={staticFile("icon.svg")} style={{ width: size, height: size, borderRadius: size * 0.125 }} />;

/** A full-frame kraft card that names the act. */
export const ActCard: React.FC<{ n: string; title: string; sub: string }> = ({ n, title, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = clock(frame, fps);
  return (
    <Kraft>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Sheet lift style={{ width: 1260, opacity: t, transform: `translateY(${(1 - t) * 14}px)`, position: "relative" }}>
          <Tape cover style={{ top: -44, right: 78, width: 300, height: 62, zIndex: 2 }} t={clock(frame, fps, 4)} />
          <LabelBar left={`Act ${n}`} right="Stellar testnet" />
          <div style={{ padding: "56px 44px 48px" }}>
            <div style={{ ...type.headline, color: c.ink }}>{title}</div>
            <div style={{ ...type.typed, color: c.ink3, marginTop: 16, fontSize: 26 }}>{sub}</div>
          </div>
          <Seal style={{ position: "absolute", right: 34, bottom: 26 }} />
        </Sheet>
      </AbsoluteFill>
    </Kraft>
  );
};

/** Opening and closing cards. The only frames that are not the running app. */
export const TitleCard: React.FC<{ end?: boolean }> = ({ end }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = clock(frame, fps);
  return (
    <Kraft>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Sheet lift style={{ width: 1420, opacity: t, transform: `translateY(${(1 - t) * 14}px)`, position: "relative" }}>
          <Tape cover style={{ top: -48, right: 94, width: 340, height: 68, zIndex: 2 }} t={clock(frame, fps, 5)} />
          <LabelBar left="Shipping label" right="Stellar testnet" />
          <div style={{ padding: "52px 48px 44px", display: "flex", gap: 40, alignItems: "center" }}>
            <Mark size={112} />
            <div>
              <div style={{ fontFamily: stencil, fontSize: 96, lineHeight: 0.95, letterSpacing: "0.01em", textTransform: "uppercase", color: c.ink }}>
                Tukar
              </div>
              <div style={{ ...type.lead, color: c.ink2, marginTop: 14, fontSize: 30 }}>
                {end ? "tukar-six.vercel.app" : "Private cross-border remittance on Stellar"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, padding: "0 48px 40px", flexWrap: "wrap" }}>
            <Badge tone="cleared">Live on testnet</Badge>
            <Badge tone="pending">Not audited</Badge>
            <Badge>{end ? "Fiat edges: reference anchor" : "Everything on screen is the running app"}</Badge>
          </div>
          <Seal style={{ position: "absolute", right: 36, bottom: 28 }} />
        </Sheet>
      </AbsoluteFill>
    </Kraft>
  );
};

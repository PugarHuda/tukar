// The Balikbayan Parcel, at video scale.
//
// Values come straight from DESIGN.md / .impeccable/design.json. The type ramp is
// the same ramp, multiplied by SCALE so a 1080p frame reads at arm's length: the
// relationships (stencil names things, Courier carries data, Barlow carries
// sentences) are unchanged, only the absolute sizes move.
export const SCALE = 2;

export const c = {
  kraft: "#d4a468",
  kraftDeep: "#c08e54",
  kraftDark: "#a97a45",
  kraftEdge: "#8d6236",
  label: "#f6f1e7",
  label2: "#efe8da",
  label3: "#e6ddca",
  input: "#fffdf8",
  ink: "#161311",
  ink2: "#3d3731",
  ink3: "#5a5148",
  ink4: "#6b6159",
  tape: "#d8342b",
  tapeDeep: "#b5281f",
  stamp: "#2a4fa8",
  stampDeep: "#17306f",
  stampWash: "rgba(42,79,168,0.10)",
  hair: "rgba(22,19,17,0.12)",
  rule: "rgba(22,19,17,0.25)",
} as const;

export const stencil = "'Saira Stencil One', Barlow, system-ui, sans-serif";
export const barlow = "Barlow, system-ui, sans-serif";
export const mono = "'Courier Prime', ui-monospace, Menlo, monospace";

// The ramp, x SCALE.
export const type = {
  display: { fontFamily: stencil, fontSize: 84 * SCALE * 0.62, lineHeight: 0.95, letterSpacing: "0.01em", textTransform: "uppercase" as const },
  headline: { fontFamily: stencil, fontSize: 52 * SCALE * 0.62, lineHeight: 1, letterSpacing: "0.01em", textTransform: "uppercase" as const },
  title: { fontFamily: stencil, fontSize: 24 * SCALE, lineHeight: 1.05, letterSpacing: "0.02em", textTransform: "uppercase" as const },
  action: { fontFamily: stencil, fontSize: 22 * SCALE, lineHeight: 1.05, letterSpacing: "0.02em", textTransform: "uppercase" as const },
  lead: { fontFamily: barlow, fontSize: 17 * SCALE, lineHeight: 1.5, fontWeight: 500 },
  body: { fontFamily: barlow, fontSize: 15 * SCALE, lineHeight: 1.5 },
  row: { fontFamily: barlow, fontSize: 14 * SCALE, lineHeight: 1.5 },
  small: { fontFamily: barlow, fontSize: 13.5 * SCALE, lineHeight: 1.5 },
  label: { fontFamily: mono, fontSize: 11 * SCALE, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, lineHeight: 1.5 },
  typed: { fontFamily: mono, fontSize: 12.5 * SCALE, lineHeight: 1.6 },
  stampText: { fontFamily: stencil, fontSize: 13 * SCALE, letterSpacing: "0.08em", textTransform: "uppercase" as const, lineHeight: 1.1 },
} as const;

// The glue edge: a zero-blur ink line, then a soft negative-spread drop. Never a glow.
export const shadow = {
  card: "0 2px 0 rgba(22,19,17,0.10), 0 16px 36px -16px rgba(22,19,17,0.45)",
  lift: "0 4px 0 rgba(22,19,17,0.10), 0 36px 68px -28px rgba(22,19,17,0.55)",
} as const;

// One clock for everything.
export const CLOCK = 420; // ms
export const EASE = [0.2, 0.7, 0.2, 1] as const;

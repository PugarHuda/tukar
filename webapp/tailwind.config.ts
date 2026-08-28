import type { Config } from "tailwindcss";

// Tukar design tokens: "The Balikbayan Parcel" (direction seed e027abe0).
// The page is the top of a sealed kraft box. Everything readable sits on white label paper
// stuck to it; three inks only (stencil black, tape red, stamp blue). Type: Saira Stencil One
// for stencilled display, Barlow for label text, Courier Prime for typed data and hashes.
//
// Legacy token names (bg/surface/tp/orange/green/...) are kept as aliases into this palette so
// every surface moved worlds in one step; new work uses the parcel names (kraft/label/ink/tape/stamp).
const kraft = { DEFAULT: "#d4a468", deep: "#c08e54", dark: "#a97a45", edge: "#8d6236" };
const label = { DEFAULT: "#f6f1e7", 2: "#efe8da", 3: "#e6ddca" };
const ink = { DEFAULT: "#161311", 2: "#3d3731", 3: "#5a5148", 4: "#6b6159" };
const tape = { DEFAULT: "#d8342b", deep: "#b5281f", wash: "rgba(216,52,43,0.10)" };
const stamp = { DEFAULT: "#2a4fa8", deep: "#17306f", wash: "rgba(42,79,168,0.10)" };

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kraft,
        label,
        ink,
        tape,
        stamp,
        // ---- legacy aliases (same palette, old names) ----
        bg: kraft.DEFAULT,
        surface: { DEFAULT: label.DEFAULT, 2: label[2] },
        input: { DEFAULT: "#fffdf8", 2: label.DEFAULT },
        hair: "rgba(22,19,17,0.12)",
        line: "rgba(22,19,17,0.16)",
        "line-input": "rgba(22,19,17,0.38)",
        tp: ink.DEFAULT,
        ts: ink[2],
        tm: ink[4],
        tf: ink[3],
        orange: { DEFAULT: stamp.DEFAULT, l: stamp.DEFAULT, l2: stamp.deep, l3: stamp.deep, pale: stamp.deep, deep: stamp.deep },
        green: { DEFAULT: stamp.DEFAULT, t: stamp.deep },
        red: { DEFAULT: tape.DEFAULT, t: tape.deep },
        amber: kraft.edge,
      },
      fontFamily: {
        sans: ["var(--font-barlow)", "system-ui", "sans-serif"],
        display: ["var(--font-stencil)", "var(--font-barlow)", "system-ui", "sans-serif"],
        stencil: ["var(--font-stencil)", "var(--font-barlow)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "6px",
        panel: "6px",
        tile: "4px",
        stub: "3px",
      },
      boxShadow: {
        // Paper stuck to cardboard: a hairline of glue shadow and a soft drop that carries offset.
        card: "0 1px 0 rgba(22,19,17,0.10), 0 8px 18px -8px rgba(22,19,17,0.45)",
        lift: "0 2px 0 rgba(22,19,17,0.10), 0 18px 34px -14px rgba(22,19,17,0.55)",
        ring: "0 0 0 2px #2a4fa8, 0 8px 18px -8px rgba(22,19,17,0.45)",
        btn: "0 1px 0 rgba(22,19,17,0.18)",
        "btn-hover": "0 3px 0 rgba(22,19,17,0.18)",
        inset: "inset 0 1px 2px rgba(22,19,17,0.14)",
      },
      backgroundImage: {
        // Corrugate flutes: one soft shadow line every 9px, plus the box's edge vignette.
        flute:
          "repeating-linear-gradient(180deg, rgba(22,19,17,0) 0 8px, rgba(22,19,17,0.07) 8px 9px), radial-gradient(120% 90% at 50% 0%, rgba(255,240,214,0.18), rgba(22,19,17,0) 60%)",
        // Red and white FRAGILE stripes.
        "tape-fragile": "repeating-linear-gradient(-45deg, #d8342b 0 22px, #f6f1e7 22px 44px)",
        // Card highlight kept as a legacy alias (now a whisper of paper grain).
        "card-hi": "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 40%)",
      },
      maxWidth: { wrap: "1240px" },
      transitionTimingFunction: { clock: "cubic-bezier(.2,.7,.2,1)" },
      transitionDuration: { clock: "420ms" },
      keyframes: {
        "tk-spin": { to: { transform: "rotate(360deg)" } },
        "tk-pulse": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
        "tk-pop": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "tk-bar": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(280%)" } },
        "tk-bump": { "0%": { transform: "scale(1)" }, "35%": { transform: "scale(1.24)" }, "100%": { transform: "scale(1)" } },
        // Success: a stamp lands (big, slightly rotated) and settles; replaces the old glow ring.
        "tk-ring": { "0%": { transform: "scale(1.5) rotate(-9deg)", opacity: "0" }, "55%": { transform: "scale(0.96) rotate(-4deg)", opacity: "1" }, "100%": { transform: "scale(1) rotate(-4deg)", opacity: "1" } },
        "tk-draw": { from: { strokeDashoffset: "18" }, to: { strokeDashoffset: "0" } },
        "tk-shimmer": { "100%": { transform: "translateX(100%)" } },
        // Tape unrolls left to right on the one shared clock.
        "tk-tape": { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
        // A stub tears off: nudge and tilt, then settle.
        "tk-tear": { "0%": { transform: "translateX(0) rotate(0)" }, "40%": { transform: "translateX(3px) rotate(-0.8deg)" }, "100%": { transform: "translateX(0) rotate(0)" } },
      },
      animation: {
        "tk-spin": "tk-spin 0.9s linear infinite",
        "tk-pulse": "tk-pulse 2.4s ease-in-out infinite",
        "tk-pop": "tk-pop 420ms cubic-bezier(.2,.7,.2,1)",
        "tk-bar": "tk-bar 1s ease-in-out infinite",
        "tk-bump": "tk-bump 420ms cubic-bezier(.2,.7,.2,1)",
        "tk-ring": "tk-ring 420ms cubic-bezier(.2,.7,.2,1) both",
        "tk-shimmer": "tk-shimmer 1.5s ease-in-out infinite",
        "tk-tape": "tk-tape 420ms cubic-bezier(.2,.7,.2,1) both",
        "tk-tear": "tk-tear 420ms cubic-bezier(.2,.7,.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;

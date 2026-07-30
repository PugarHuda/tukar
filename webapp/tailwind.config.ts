import type { Config } from "tailwindcss";

// Design tokens seeded from the existing Tukar site (frontend/styles.css + landing.css).
// Warm near-black canvas, brand orange, ZK-green, Archivo display + JetBrains Mono.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0705",
        surface: {
          DEFAULT: "rgba(255,255,255,0.016)",
          2: "rgba(255,255,255,0.03)",
        },
        input: {
          // Faint white lift (not black): on the near-black canvas a dark fill vanished, so
          // fields read as plain text. A subtle lift sits clearly above card/bg as a real field.
          DEFAULT: "rgba(255,255,255,0.045)",
          2: "rgba(255,255,255,0.06)",
        },
        hair: "rgba(255,255,255,0.06)",
        line: "rgba(255,255,255,0.07)",
        "line-input": "rgba(255,255,255,0.18)",
        // text
        tp: "#f5f1ec", // primary
        ts: "#cfc8c1", // secondary
        tm: "#8a847e", // muted
        tf: "#837c74", // faint / labels (4.88:1 on #0a0705 — clears AA 4.5:1)
        // brand orange
        orange: {
          DEFAULT: "#ff7a1a",
          l: "#ff8a3d",
          l2: "#ff9445",
          l3: "#ff9c52",
          pale: "#ffb070",
          deep: "#d4540a",
        },
        // ZK green
        green: {
          DEFAULT: "#37d67a",
          t: "#5fe3a0",
        },
        // alerts
        red: {
          DEFAULT: "#ff5a2a",
          t: "#ff8a72",
        },
        amber: "#c9a36a",
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        display: ["var(--font-archivo)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "18px",
        panel: "18px",
        tile: "14px",
      },
      boxShadow: {
        ring: "0 0 0 1px rgba(255,122,26,0.8), 0 0 26px rgba(255,122,26,0.16)",
      },
      maxWidth: {
        wrap: "1360px",
      },
      keyframes: {
        "tk-spin": { to: { transform: "rotate(360deg)" } },
        "tk-pulse": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.45" } },
        "tk-pop": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "tk-bar": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(280%)" } },
      },
      animation: {
        "tk-spin": "tk-spin 0.9s linear infinite",
        "tk-pulse": "tk-pulse 2.4s ease-in-out infinite",
        "tk-pop": "tk-pop 0.42s cubic-bezier(.2,.7,.2,1)",
        "tk-bar": "tk-bar 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

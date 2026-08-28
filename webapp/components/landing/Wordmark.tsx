// The Tukar mark: a stencilled label box with the name and a short tape seal across its corner.
// One drawn asset in the world's own stroke; used in the header, footer, and the favicon.
export function Wordmark({ height = 30, className = "" }: { height?: number; className?: string }) {
  const w = Math.round(height * 3.6);
  return (
    <svg width={w} height={height} viewBox="0 0 108 30" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="106" height="28" rx="2" fill="#f6f1e7" stroke="#161311" strokeWidth="2" />
      <text x="54" y="22" textAnchor="middle" fontFamily="var(--font-stencil), sans-serif" fontSize="20" letterSpacing="2" fill="#161311">
        TUKAR
      </text>
      {/* a corner of packing tape: translucent, with two fibre streaks, crossing the label edge */}
      <g style={{ mixBlendMode: "multiply" }}>
        <path d="M84 -3l28 14-5 9L79 6z" fill="#b07a40" fillOpacity="0.5" />
        <path d="M86 1l22 11M83 5l22 11M88 -2l20 10" stroke="#fff3dd" strokeWidth="0.8" strokeOpacity="0.5" />
        <path d="M84 -3l-1 3 2 2-2 3 1 3" fill="none" stroke="#7a4f22" strokeWidth="0.7" strokeOpacity="0.6" />
      </g>
    </svg>
  );
}

// Favicon-sized version: the box outline with a stencilled T.
export const ICON_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='2' y='2' width='28' height='28' rx='2' fill='#d4a468' stroke='#161311' stroke-width='2'/><rect x='7' y='9' width='18' height='14' fill='#f6f1e7' stroke='#161311' stroke-width='1.5'/><path d='M10 13h12M16 13v7' stroke='#161311' stroke-width='3'/><path d='M2 6l10-4' stroke='#d8342b' stroke-width='3'/></svg>",
  );

// The Tukar lockup: the Tukar mark, then the name.
//
// The mark itself is never restyled to match a surface. It was drawn for a dark ground (orange
// strokes around a near-black diamond core), and every header here is label paper, where bare
// orange on cream falls to about 2:1 and reads as washed out. So the mark keeps its own colours and
// sits on its own dark plate, which is exactly how icon-192.png has always presented it.
const MARK_INK = "#0a0705";

/** The mark on its dark plate, drawn into a 32x32 box. Paths are the mark's own, unchanged. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="32" height="32" rx="4" fill={MARK_INK} />
      <path d="M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z" stroke="#ff8a3d" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d="M1 16H12M20 16H31" stroke="#ffb070" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 11 21 16 16 21 11 16Z" fill="#ff7a1a" />
      <path d="M16 13.2 18.8 16 16 18.8 13.2 16Z" fill={MARK_INK} />
    </svg>
  );
}

export function Wordmark({ height = 30, className = "" }: { height?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={height} />
      <span
        className="font-stencil leading-none text-ink"
        style={{ fontSize: Math.round(height * 0.72), letterSpacing: "0.04em" }}
      >
        TUKAR
      </span>
    </span>
  );
}

// Favicon. This is what the site actually loads (app/layout.tsx passes it to metadata.icons), so it
// has to carry the real mark: app/icon.svg is never requested while this is set.
export const ICON_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
      "<rect x='0' y='0' width='32' height='32' rx='4' fill='#0a0705'/>" +
      "<path d='M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z' stroke='#ff8a3d' stroke-width='2' fill='none' stroke-linejoin='round'/>" +
      "<path d='M1 16H12M20 16H31' stroke='#ffb070' stroke-width='2' stroke-linecap='round'/>" +
      "<path d='M16 11 21 16 16 21 11 16Z' fill='#ff7a1a'/>" +
      "<path d='M16 13.2 18.8 16 16 18.8 13.2 16Z' fill='#0a0705'/>" +
      "</svg>",
  );

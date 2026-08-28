// The landmark mark: a short strip of packing tape with one folded corner, the seal on every
// box. It appears exactly once per view, where the eye lands last (the raise from the magazine
// program). Draw it in the world's own stroke; never as an emoji or a font glyph.
export function Seal({ size = 28, className = "", title = "Sealed" }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 56 28" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d="M2 6h46l6 4-6 4v8H2z" fill="#b8834a" fillOpacity="0.85" stroke="#161311" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M48 6l6 4-6 4z" fill="#8d6236" stroke="#161311" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 11h30M8 17h22" stroke="#f6f1e7" strokeWidth="1.5" strokeOpacity="0.55" strokeLinecap="round" />
    </svg>
  );
}

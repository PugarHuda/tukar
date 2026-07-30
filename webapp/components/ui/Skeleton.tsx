export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

// A pulsing placeholder for content that is still loading from chain. Size it
// with a className (height + width) so it roughly matches the final content, so
// the layout doesn't jump when the real value arrives.
export function Skeleton({ className = "", ...rest }: SkeletonProps) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} {...rest} />;
}

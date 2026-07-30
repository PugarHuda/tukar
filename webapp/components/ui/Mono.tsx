export function Mono({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`font-mono text-[10.5px] text-tf break-all ${className}`}>{children}</span>;
}

/** Monospace code block for proof/hash payloads (matches .export-box .es). */
export function CodeBlock({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <pre className={`overflow-x-auto rounded-lg border border-line bg-black/20 p-3 font-mono text-[10.5px] leading-relaxed text-ts whitespace-pre-wrap break-all ${className}`}>
      {children}
    </pre>
  );
}
